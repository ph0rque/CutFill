import * as THREE from 'three';
import { supabase } from './supabase';

export interface TerrainState {
  vertices: Float32Array;
  timestamp: number;
  volume: { cut: number; fill: number; net: number };
}

export interface BrushSettings {
  size: number;
  strength: number;
  shape: 'circle' | 'square';
  falloff: 'linear' | 'smooth' | 'sharp';
}

export interface MaterialLayer {
  name: string;
  depth: number;
  color: THREE.Color;
  hardness: number; // 0-1, affects excavation resistance
}

export class Terrain {
  private mesh: THREE.Mesh;
  private geometry: THREE.PlaneGeometry;
  private material: THREE.MeshBasicMaterial;
  private originalVertices: Float32Array;
  private undoStack: TerrainState[] = [];
  private redoStack: TerrainState[] = [];
  private maxUndoStates = 20;
  private brushSettings: BrushSettings = {
    size: 3,
    strength: 0.5,
    shape: 'circle',
    falloff: 'smooth'
  };

  // 3D terrain enhancement properties
  private terrainGroup: THREE.Group;
  private surfaceMesh: THREE.Mesh;
  private wallMeshes: THREE.Mesh[] = [];
  // bottomMesh is now part of the box geometry
  private materialLayers: MaterialLayer[] = [];
  private blockDepth: number = 33; // 10m = ~33 feet depth
  private crossSectionGeometries: THREE.BufferGeometry[] = [];
  private arrows: THREE.ArrowHelper[] = [];

  // Localized overlay properties - track individual modification areas
  private cutOverlays: THREE.Mesh[] = [];
  private fillOverlays: THREE.Mesh[] = [];
  private showOriginalTerrainOverlay: boolean = false;
  private showFillVolumeOverlay: boolean = false;
  private modificationAreas: Map<string, {
    bounds: { minX: number, maxX: number, minZ: number, maxZ: number },
    type: 'cut' | 'fill',
    overlay?: THREE.Mesh
  }> = new Map();

  // Add elevation zone properties
  private targetElevation: number = 0; // Target grade elevation
  private elevationZones!: {
    high: { min: number; max: number; color: THREE.Color };
    medium: { min: number; max: number; color: THREE.Color };
    low: { min: number; max: number; color: THREE.Color };
    cut: { min: number; max: number; color: THREE.Color };
  };

  // Enhanced accessibility properties
  private accessibilityMode: 'normal' | 'colorBlind' | 'highContrast' | 'patterns' = 'normal';
  private colorBlindType: 'protanopia' | 'deuteranopia' | 'tritanopia' | 'normal' = 'normal';
  private usePatternOverlays: boolean = false;
  private patternMeshes: THREE.Mesh[] = [];
  
  // Camera reference for zoom-independent arrow scaling
  private camera: THREE.Camera | null = null;

  // Contour line properties
  private contourLines: THREE.Line[] = [];
  private contourLabels: THREE.Sprite[] = [];
  private contourLinesVisible: boolean = true;
  private contourInterval: number = 1.0; // Contour line every 1 foot
  private baseContourInterval: number = 1.0; // Base interval for zoom calculations
  private dynamicContours: boolean = true; // Enable dynamic contour adjustment
  private lastCameraDistance: number = 0;
  private contourUpdateThrottle: ReturnType<typeof setTimeout> | null = null;

  // Database persistence properties
  private currentUserId: string | null = null;
  private currentSessionId: string | null = null;
  private autoSaveEnabled: boolean = true;
  private lastSaveTime: number = 0;
  private saveThrottleMs: number = 30000; // Save every 30 seconds at most
  private pendingModifications: Array<{x: number, z: number, heightChange: number, tool: string}> = [];

  constructor(
    width: number = 100,  // 100 feet x 100 feet
    height: number = 100, // 100 feet x 100 feet  
    widthSegments: number = 32,  // Higher resolution for better cut/fill visualization
    heightSegments: number = 32  // Higher resolution for better cut/fill visualization
  ) {
    // Create main group for all terrain parts
    this.terrainGroup = new THREE.Group();
    
    // Initialize material layers
    this.initializeMaterialLayers();

    // Initialize elevation zones
    this.initializeElevationZones();

    // Create surface terrain geometry (Y-up coordinate system - Z is height)
    this.geometry = new THREE.PlaneGeometry(
      width,
      height,
      widthSegments,
      heightSegments
    );

    // Rotate to be horizontal in Y-up system (terrain in XY plane)
    this.geometry.rotateX(-Math.PI / 2);

    // Translate so origin is at corner (terrain spans from 0,0 to width,height)
    this.geometry.translate(width/2, 0, height/2);

    // Store original vertices for future modifications
    this.originalVertices = new Float32Array(
      this.geometry.attributes.position.array
    );

    // Create surface material with flat shading (no lighting)
    this.material = new THREE.MeshBasicMaterial({
      color: 0xE6C2A6, // Much lighter brown to match topsoil
      wireframe: false,
      vertexColors: true, // Enable vertex colors for layered effects
    });

    // Create the surface mesh
    this.surfaceMesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh = this.surfaceMesh; // Keep backward compatibility

    // Create 3D terrain block structure
    this.create3DTerrainBlock(width, height);

    // Add all parts to the group
    this.terrainGroup.add(this.surfaceMesh);

    // Ensure pattern overlays are disabled by default
    this.usePatternOverlays = false;
    this.clearPatternOverlays();

    // Generate initial terrain
    this.regenerateTerrain();
    
    // Force color update to ensure new depth-based gradient is applied
    this.updateTerrainColors();
    
    // Generate initial contour lines with dynamic adjustment
    this.generateContourLines();
    
    // Set up initial dynamic contour calculation
    if (this.camera) {
      this.updateContoursForZoom();
    }
    
    // Don't create overlays by default - they will be created when needed
    // this.createOriginalTerrainOverlay();
    // this.createFillVolumeOverlay();
    
    // Save initial state
    this.saveState();
  }

  /**
   * Initialize realistic material layers with consistent depth-based color gradient
   * 
   * Depth Ranges:
   * - 0.0 to 0.25 feet: Green topsoil
   * - 0.25 to 3.0 feet: Yellow subsoil  
   * - 3.0 to 10.0 feet: Mud-red-brown clay
   * - 10.0 to 20.0 feet: Darker brown deep soil
   * - 20.0+ feet: Gray rock/bedrock
   */
  private initializeMaterialLayers(): void {
    this.materialLayers = [
      {
        name: 'Topsoil',
        color: new THREE.Color(0x228B22), // Green topsoil (Forest Green)
        depth: 0.25, // Top 0.25 feet
        hardness: 0.2
      },
      {
        name: 'Subsoil', 
        color: new THREE.Color(0xFFD700), // Yellow subsoil (Gold)
        depth: 2.75, // Next 2.75 feet (0.25 to 3.0 total)
        hardness: 0.4
      },
      {
        name: 'Clay',
        color: new THREE.Color(0x8B4513), // Mud-red-brown clay (Saddle Brown)
        depth: 7, // Next 7 feet (3.0 to 10.0 total)
        hardness: 0.6
      },
      {
        name: 'Deep Soil',
        color: new THREE.Color(0x654321), // Darker brown deeper soil (Dark Brown)
        depth: 10, // Next 10 feet (10.0 to 20.0 total)
        hardness: 0.8
      },
      {
        name: 'Rock',
        color: new THREE.Color(0x808080), // Gray rock/bedrock (Gray)
        depth: 20, // Next 20+ feet (20.0+ total)
        hardness: 1.0
      }
    ];
  }

  /**
   * Initialize elevation zones for cut/fill visualization with accessibility support
   */
  private initializeElevationZones(): void {
    this.elevationZones = {
      high: { 
        min: 2, max: Infinity, 
        color: new THREE.Color(0x4CAF50) // Green for high fill areas
      },
      medium: { 
        min: 0.5, max: 2, 
        color: new THREE.Color(0xFF9800) // Orange for medium fill
      },
      low: { 
        min: -0.5, max: 0.5, 
        color: new THREE.Color(0xFFF59D) // Light yellow for near target
      },
      cut: { 
        min: -Infinity, max: -0.5, 
        color: new THREE.Color(0x2196F3) // Blue for cut areas
      }
    };
  }

  /**
   * Set target elevation for cut/fill operations
   */
  public setTargetElevation(elevation: number): void {
    this.targetElevation = elevation;
    this.updateTerrainColors();
  }

  /**
   * Get current target elevation
   */
  public getTargetElevation(): number {
    return this.targetElevation;
  }

  /**
   * Get elevation zone for a given height relative to target
   */
  private getElevationZone(height: number): { name: string; color: THREE.Color; fillType: 'cut' | 'fill' | 'target' } {
    const relativeHeight = height - this.targetElevation;
    
    if (relativeHeight >= this.elevationZones.high.min) {
      return { name: 'high', color: this.elevationZones.high.color, fillType: 'fill' };
    } else if (relativeHeight >= this.elevationZones.medium.min) {
      return { name: 'medium', color: this.elevationZones.medium.color, fillType: 'fill' };
    } else if (relativeHeight >= this.elevationZones.low.min) {
      return { name: 'low', color: this.elevationZones.low.color, fillType: 'target' };
    } else {
      return { name: 'cut', color: this.elevationZones.cut.color, fillType: 'cut' };
    }
  }

  /**
   * Create the 3D terrain block with sides and bottom
   */
  private create3DTerrainBlock(width: number, height: number): void {
    // Create custom geometry where the block top follows the terrain contours
    const blockGeometry = new THREE.BufferGeometry();
    
    // Get terrain vertices to define the top shape
    const terrainVertices = this.geometry.attributes.position.array;
    const widthSegments = this.geometry.parameters.widthSegments;
    const heightSegments = this.geometry.parameters.heightSegments;
    
    // Number of vertical layers for horizontal stratification (one every foot for detail)
    const verticalLayers = 33; // Matches 33 feet depth, one layer per foot
    
    // Total vertices: (verticalLayers + 1) levels * (widthSegments + 1) * (heightSegments + 1)
    const levelVertexCount = (widthSegments + 1) * (heightSegments + 1);
    const totalVertices = (verticalLayers + 1) * levelVertexCount;
    const positions = new Float32Array(totalVertices * 3);
    const indices = [];
    
    // Create vertices for each vertical level with proper terrain surface clipping
    for (let layer = 0; layer <= verticalLayers; layer++) {
      // Layer 0 = terrain surface level, Layer verticalLayers = bottom
      const layerDepth = - (this.blockDepth * (layer / verticalLayers));
      
      for (let row = 0; row <= heightSegments; row++) {
        for (let col = 0; col <= widthSegments; col++) {
          const terrainIndex = (row * (widthSegments + 1) + col) * 3;
          const vertexIndex = (layer * levelVertexCount + row * (widthSegments + 1) + col) * 3;
          
          positions[vertexIndex] = terrainVertices[terrainIndex];     // x
          positions[vertexIndex + 2] = terrainVertices[terrainIndex + 2]; // z
          
          const terrainHeight = terrainVertices[terrainIndex + 1];
          
          if (layer === 0) {
            // Top layer: Use terrain height minus tiny offset to avoid z-fighting
            positions[vertexIndex + 1] = terrainHeight - 0.005;
          } else {
            // Lower layers: Go straight down from the bottom of terrain
            // Use the terrain height as reference, then go down by layerDepth
            const actualDepth = terrainHeight + layerDepth;
            positions[vertexIndex + 1] = actualDepth;
          }
        }
      }
    }
    
    // Create outer perimeter walls only
    for (let layer = 0; layer < verticalLayers; layer++) {
      const topOffset = layer * levelVertexCount;
      const bottomOffset = (layer + 1) * levelVertexCount;
      
      // Front edge (positive Z) - only the outermost edge
      for (let col = 0; col < widthSegments; col++) {
        const topLeft = topOffset + (heightSegments * (widthSegments + 1) + col);
        const topRight = topLeft + 1;
        const bottomLeft = bottomOffset + (heightSegments * (widthSegments + 1) + col);
        const bottomRight = bottomLeft + 1;
        
        indices.push(topLeft, bottomLeft, topRight);
        indices.push(topRight, bottomLeft, bottomRight);
      }
      
      // Back edge (negative Z) - only the outermost edge
      for (let col = 0; col < widthSegments; col++) {
        const topLeft = topOffset + col;
        const topRight = topLeft + 1;
        const bottomLeft = bottomOffset + col;
        const bottomRight = bottomLeft + 1;
        
        indices.push(topRight, bottomLeft, topLeft);
        indices.push(bottomRight, bottomLeft, topRight);
      }
      
      // Left edge (negative X) - only the outermost edge
      for (let row = 0; row < heightSegments; row++) {
        const topTop = topOffset + (row * (widthSegments + 1));
        const topBottom = topTop + (widthSegments + 1);
        const bottomTop = bottomOffset + (row * (widthSegments + 1));
        const bottomBottom = bottomTop + (widthSegments + 1);
        
        indices.push(topTop, bottomTop, topBottom);
        indices.push(topBottom, bottomTop, bottomBottom);
      }
      
      // Right edge (positive X) - only the outermost edge
      for (let row = 0; row < heightSegments; row++) {
        const topTop = topOffset + (row * (widthSegments + 1) + widthSegments);
        const topBottom = topTop + (widthSegments + 1);
        const bottomTop = bottomOffset + (row * (widthSegments + 1) + widthSegments);
        const bottomBottom = bottomTop + (widthSegments + 1);
        
        indices.push(topBottom, bottomTop, topTop);
        indices.push(bottomBottom, bottomTop, topBottom);
      }
    }
    
    // Create bottom face at deepest layer
    const bottomLevelOffset = verticalLayers * levelVertexCount;
    for (let row = 0; row < heightSegments; row++) {
      for (let col = 0; col < widthSegments; col++) {
        const topLeft = bottomLevelOffset + (row * (widthSegments + 1) + col);
        const topRight = topLeft + 1;
        const bottomLeft = topLeft + (widthSegments + 1);
        const bottomRight = bottomLeft + 1;
        
        indices.push(bottomLeft, topRight, topLeft);
        indices.push(bottomLeft, bottomRight, topRight);
      }
    }
    
    blockGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    blockGeometry.setIndex(indices);
    blockGeometry.computeVertexNormals();
    
    // Create earth material for the block with vertex colors enabled
    const earthMaterial = new THREE.MeshLambertMaterial({
      color: 0x8B5A2B, // Rich earth brown (will be overridden by vertex colors)
      side: THREE.DoubleSide,
      vertexColors: true // Enable vertex colors for geological variation
    });
    
    // Create the terrain block that follows the surface contours
    const terrainBlock = new THREE.Mesh(blockGeometry, earthMaterial);
    
    this.wallMeshes = [terrainBlock];
    this.terrainGroup.add(terrainBlock);
    
    // Surface mesh positioning remains the same
    this.surfaceMesh.position.y = 0;
  }

  /**
   * Create material for cross-section walls showing solid earth layers
   */
  private createWallMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: 0x8B5A2B, // Rich topsoil brown - same as surface
      side: THREE.DoubleSide
    });
  }

  /**
   * Get the material layer at a specific depth
   */
  private getMaterialAtDepth(depth: number): MaterialLayer {
    let currentDepth = 0;
    for (const layer of this.materialLayers) {
      currentDepth += layer.depth;
      if (depth <= currentDepth) {
        return layer;
      }
    }
    return this.materialLayers[this.materialLayers.length - 1]; // Return deepest layer if beyond all layers
  }

  /**
   * Get color at a specific depth using the consistent depth-based gradient
   */
  private getColorAtDepth(depth: number): THREE.Color {
    const material = this.getMaterialAtDepth(depth);
    return material.color.clone();
  }

  /**
   * Get interpolated color for a specific elevation using depth-based gradient
   * Positive elevations use surface colors, negative use subsurface depth colors
   */
  private getColorAtElevation(elevation: number): THREE.Color {
    if (elevation >= 0) {
      // Surface elevations - use a surface color that gets lighter at higher elevations
      const surfaceColor = new THREE.Color(0x8B4513); // Base brown surface color
      
      // Make higher elevations lighter (more exposed, sandy)
      const lightnessFactor = Math.min(elevation / 10, 0.3); // Cap at 30% lighter
      surfaceColor.r = Math.min(1.0, surfaceColor.r + lightnessFactor);
      surfaceColor.g = Math.min(1.0, surfaceColor.g + lightnessFactor * 0.8);
      surfaceColor.b = Math.min(1.0, surfaceColor.b + lightnessFactor * 0.6);
      
      return surfaceColor;
    } else {
      // Below surface - use depth-based material colors
      const depth = Math.abs(elevation);
      return this.getColorAtDepth(depth);
    }
  }

  /**
   * Regenerate terrain with a new random pattern
   */
  public regenerateTerrain(): void {
    const vertices = this.geometry.attributes.position.array;
    const width = this.geometry.parameters.width;
    const height = this.geometry.parameters.height;
    
    // Randomly select a terrain pattern
    const patterns = ['flat', 'gentle_slope', 'valley', 'hill', 'rolling'];
    const selectedPattern = patterns[Math.floor(Math.random() * patterns.length)];
    
    // Generate terrain based on selected pattern
    this.generateTerrainPattern(vertices as Float32Array, width, height, selectedPattern);

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.updateTerrainColors();
    this.updateBlockGeometry(); // Update block to match new terrain
    this.saveState();
  }

  /**
   * Generate realistic terrain patterns with larger variation
   */
  private generateTerrainPattern(vertices: Float32Array, width: number, height: number, pattern: string): void {
    const centerX = width / 2; // Adjust for corner positioning
    const centerZ = height / 2; // Adjust for corner positioning
    const maxRadius = Math.max(width, height) / 2;

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      
      // Distance from center for radial effects (adjusted for corner positioning)
      const distanceFromCenter = Math.sqrt((x - centerX) ** 2 + (z - centerZ) ** 2);
      const normalizedDistance = Math.min(distanceFromCenter / maxRadius, 1);
      
      let terrainHeight = 0;

      switch (pattern) {
        case 'flat':
          // Mostly flat with moderate smooth variation
          const flatNoise = this.smoothNoise(x * 0.02, z * 0.02) * 2.5; // Gentle undulation, ±2.5 feet
          const flatDetail = this.smoothNoise(x * 0.05, z * 0.05) * 0.8; // Fine detail
          terrainHeight = flatNoise + flatDetail;
          break;

        case 'gentle_slope':
          // Broad gentle slope with natural variation
          const slopeDirection = Math.PI * 0.3 + this.smoothNoise(x * 0.005, z * 0.005) * 0.3; // Slightly varying direction
          const slopeStrength = 0.04 + this.smoothNoise(x * 0.008, z * 0.008) * 0.02; // Variable slope strength
          terrainHeight = (x * Math.cos(slopeDirection) + z * Math.sin(slopeDirection)) * slopeStrength;
          // Add broader undulations with some variation
          terrainHeight += this.smoothNoise(x * 0.02, z * 0.02) * 4; // ±4 feet broad variations
          terrainHeight += this.smoothNoise(x * 0.04, z * 0.04) * 1.5; // ±1.5 feet detail
          break;

        case 'valley':
          // Broad valley with natural variation
          const valleyDepth = 6 + this.smoothNoise(x * 0.01, z * 0.01) * 3; // 3-9 feet deep, varying
          const valleyWidth = 0.6 + this.smoothNoise(x * 0.008, z * 0.008) * 0.2; // Variable width
          const valleyFactor = Math.exp(-Math.pow(normalizedDistance / valleyWidth, 2));
          terrainHeight = -valleyDepth * valleyFactor;
          // Add natural side slope variation
          terrainHeight += this.smoothNoise(x * 0.025, z * 0.025) * 2.5; // ±2.5 feet variation
          terrainHeight += this.smoothNoise(x * 0.06, z * 0.06) * 1; // ±1 foot fine detail
          break;

        case 'hill':
          // Broad hill with natural variation
          const hillHeight = 6 + this.smoothNoise(x * 0.01, z * 0.01) * 3; // 3-9 feet high, varying
          const hillWidth = 0.5 + this.smoothNoise(x * 0.008, z * 0.008) * 0.2; // Variable width
          const hillFactor = Math.exp(-Math.pow(normalizedDistance / hillWidth, 2));
          terrainHeight = hillHeight * hillFactor;
          // Add natural undulations
          terrainHeight += this.smoothNoise(x * 0.03, z * 0.03) * 2.5; // ±2.5 feet variation
          terrainHeight += this.smoothNoise(x * 0.07, z * 0.07) * 1; // ±1 foot fine detail
          break;

        case 'rolling':
          // Rolling hills with multiple scales and natural variation
          const largeWaves = Math.sin(x * 0.018) * Math.cos(z * 0.015) * (4 + this.smoothNoise(x * 0.01, z * 0.01) * 2); // 2-6 foot large waves
          const mediumWaves = Math.sin(x * 0.035) * Math.cos(z * 0.03) * (2 + this.smoothNoise(x * 0.02, z * 0.02) * 1.5); // 0.5-3.5 foot medium waves
          const smallWaves = this.smoothNoise(x * 0.05, z * 0.05) * 1.8; // Small 1.8-foot variation
          const fineDetail = this.smoothNoise(x * 0.08, z * 0.08) * 0.7; // Fine 0.7-foot detail
          
          terrainHeight = largeWaves + mediumWaves + smallWaves + fineDetail;
          break;

        default:
          terrainHeight = 0;
      }

      // Clamp to ±10 feet maximum
      terrainHeight = Math.max(-10, Math.min(10, terrainHeight));

      // Apply the calculated height
      vertices[i + 1] = terrainHeight;
    }

    // Apply multiple smoothing passes for very smooth terrain
    this.smoothTerrain(vertices, width, height);
    this.smoothTerrain(vertices, width, height); // Second pass for extra smoothness
  }

  /**
   * Generate smooth noise using simple interpolated noise
   */
  private smoothNoise(x: number, z: number): number {
    // Create predictable but smooth noise using sine functions
    const noise1 = Math.sin(x * 2.4 + z * 1.7) * 0.5;
    const noise2 = Math.sin(x * 1.2 - z * 2.1) * 0.3;
    const noise3 = Math.sin(x * 3.1 + z * 0.8) * 0.2;
    
    return noise1 + noise2 + noise3;
  }

  /**
   * Apply smoothing to terrain to remove sharp transitions
   */
  private smoothTerrain(vertices: Float32Array, width: number, height: number): void {
    const widthSegments = this.geometry.parameters.widthSegments;
    const heightSegments = this.geometry.parameters.heightSegments;
    const smoothedVertices = new Float32Array(vertices.length);
    
    // Copy original vertices
    for (let i = 0; i < vertices.length; i++) {
      smoothedVertices[i] = vertices[i];
    }

    // Apply smoothing kernel to height values
    for (let row = 1; row < heightSegments; row++) {
      for (let col = 1; col < widthSegments; col++) {
        const index = (row * (widthSegments + 1) + col) * 3;
        
        if (index + 1 < vertices.length) {
          // Get neighboring heights
          const currentHeight = vertices[index + 1];
          const leftIndex = (row * (widthSegments + 1) + (col - 1)) * 3;
          const rightIndex = (row * (widthSegments + 1) + (col + 1)) * 3;
          const topIndex = ((row - 1) * (widthSegments + 1) + col) * 3;
          const bottomIndex = ((row + 1) * (widthSegments + 1) + col) * 3;
          
          let neighborCount = 1;
          let heightSum = currentHeight;
          
          if (leftIndex + 1 < vertices.length) {
            heightSum += vertices[leftIndex + 1];
            neighborCount++;
          }
          if (rightIndex + 1 < vertices.length) {
            heightSum += vertices[rightIndex + 1];
            neighborCount++;
          }
          if (topIndex + 1 >= 0 && topIndex + 1 < vertices.length) {
            heightSum += vertices[topIndex + 1];
            neighborCount++;
          }
          if (bottomIndex + 1 < vertices.length) {
            heightSum += vertices[bottomIndex + 1];
            neighborCount++;
          }
          
          // Apply smoothed height (weighted average)
          smoothedVertices[index + 1] = (currentHeight * 0.6) + (heightSum / neighborCount * 0.4);
        }
      }
    }
    
    // Copy smoothed heights back
    for (let i = 1; i < vertices.length; i += 3) {
      vertices[i] = smoothedVertices[i];
    }
  }

  /**
   * Force update all terrain colors with the new depth-based gradient
   */
  public forceUpdateColors(): void {
    this.updateTerrainColors();
    this.updateWallColors();
    this.generateContourLines(); // Update contour lines when colors change
    
    // Mark geometry as needing updates
    this.geometry.attributes.position.needsUpdate = true;
    if (this.geometry.attributes.color) {
      this.geometry.attributes.color.needsUpdate = true;
    }
    
    // Update wall geometries
    this.wallMeshes.forEach(wall => {
      if (wall.geometry.attributes.color) {
        wall.geometry.attributes.color.needsUpdate = true;
      }
    });
  }

  /**
   * Generate contour lines with depth-based color interpolation
   */
  public generateContourLines(): void {
    this.clearContourLines();
    
    const vertices = this.geometry.attributes.position.array as Float32Array;
    const widthSegments = this.geometry.parameters.widthSegments;
    const heightSegments = this.geometry.parameters.heightSegments;
    
    // Find elevation range
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    
    for (let i = 1; i < vertices.length; i += 3) {
      const height = vertices[i];
      if (isFinite(height)) {
        minHeight = Math.min(minHeight, height);
        maxHeight = Math.max(maxHeight, height);
      }
    }
    
    if (!isFinite(minHeight) || !isFinite(maxHeight)) {
      return; // No valid terrain data
    }
    
    // Generate contour lines at regular intervals
    const startElevation = Math.floor(minHeight / this.contourInterval) * this.contourInterval;
    const endElevation = Math.ceil(maxHeight / this.contourInterval) * this.contourInterval;
    
    for (let elevation = startElevation; elevation <= endElevation; elevation += this.contourInterval) {
      this.generateContourLineAtElevation(elevation, vertices, widthSegments, heightSegments);
    }
  }

  /**
   * Generate a single contour line at the specified elevation
   */
  private generateContourLineAtElevation(elevation: number, vertices: Float32Array, widthSegments: number, heightSegments: number): void {
    const contourSegments: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
    const contourColor = this.getColorAtElevation(elevation);
    
    // March through the terrain grid to find contour segments
    for (let row = 0; row < heightSegments; row++) {
      for (let col = 0; col < widthSegments; col++) {
        // Check each quad for contour intersections
        const topLeft = this.getVertexPosition(vertices, row, col, widthSegments);
        const topRight = this.getVertexPosition(vertices, row, col + 1, widthSegments);
        const bottomLeft = this.getVertexPosition(vertices, row + 1, col, widthSegments);
        const bottomRight = this.getVertexPosition(vertices, row + 1, col + 1, widthSegments);
        
        // Find intersections with the elevation plane on each edge
        const intersections: THREE.Vector3[] = [];
        
        // Check each edge and add intersections
        this.addContourIntersection(topLeft, topRight, elevation, intersections);
        this.addContourIntersection(topRight, bottomRight, elevation, intersections);
        this.addContourIntersection(bottomRight, bottomLeft, elevation, intersections);
        this.addContourIntersection(bottomLeft, topLeft, elevation, intersections);
        
        // Create contour segments from intersections (should be 0, 2, or 4 intersections per quad)
        if (intersections.length >= 2) {
          // For each pair of intersections, create a segment
          for (let i = 0; i < intersections.length; i += 2) {
            if (i + 1 < intersections.length) {
              contourSegments.push({
                start: intersections[i].clone(),
                end: intersections[i + 1].clone()
              });
            }
          }
        }
      }
    }
    
    // Connect segments into continuous contour lines
    const contourLines = this.connectContourSegments(contourSegments);
    
    // Create geometry for each continuous contour line
    contourLines.forEach(linePoints => {
      if (linePoints.length >= 2) {
        this.createContourLineGeometry(linePoints, contourColor);
      }
    });
  }

  /**
   * Connect individual contour segments into continuous lines
   */
  private connectContourSegments(segments: { start: THREE.Vector3; end: THREE.Vector3 }[]): THREE.Vector3[][] {
    if (segments.length === 0) return [];
    
    const contourLines: THREE.Vector3[][] = [];
    const usedSegments = new Set<number>();
    const tolerance = 0.1; // Tolerance for connecting segments
    
    for (let i = 0; i < segments.length; i++) {
      if (usedSegments.has(i)) continue;
      
      const currentLine: THREE.Vector3[] = [];
      let currentSegment = segments[i];
      usedSegments.add(i);
      
      // Start the line
      currentLine.push(currentSegment.start.clone(), currentSegment.end.clone());
      
      // Try to extend the line by finding connected segments
      let extended = true;
      while (extended) {
        extended = false;
        const lineEnd = currentLine[currentLine.length - 1];
        const lineStart = currentLine[0];
        
        // Look for segments that connect to the end of current line
        for (let j = 0; j < segments.length; j++) {
          if (usedSegments.has(j)) continue;
          
          const segment = segments[j];
          
          // Check if segment connects to line end
          if (lineEnd.distanceTo(segment.start) < tolerance) {
            currentLine.push(segment.end.clone());
            usedSegments.add(j);
            extended = true;
            break;
          } else if (lineEnd.distanceTo(segment.end) < tolerance) {
            currentLine.push(segment.start.clone());
            usedSegments.add(j);
            extended = true;
            break;
          }
          // Check if segment connects to line start
          else if (lineStart.distanceTo(segment.start) < tolerance) {
            currentLine.unshift(segment.end.clone());
            usedSegments.add(j);
            extended = true;
            break;
          } else if (lineStart.distanceTo(segment.end) < tolerance) {
            currentLine.unshift(segment.start.clone());
            usedSegments.add(j);
            extended = true;
            break;
          }
        }
      }
      
      // Only add lines with sufficient length
      if (currentLine.length >= 2) {
        contourLines.push(currentLine);
      }
    }
    
    return contourLines;
  }

  /**
   * Get vertex position from the terrain vertices array
   */
  private getVertexPosition(vertices: Float32Array, row: number, col: number, widthSegments: number): THREE.Vector3 {
    const index = (row * (widthSegments + 1) + col) * 3;
    const verticesArray = vertices as Float32Array;
    return new THREE.Vector3(
      verticesArray[index],
      verticesArray[index + 1],
      verticesArray[index + 2]
    );
  }

  /**
   * Add contour intersection between two points if it exists
   */
  private addContourIntersection(p1: THREE.Vector3, p2: THREE.Vector3, elevation: number, intersections: THREE.Vector3[]): void {
    const h1 = p1.y;
    const h2 = p2.y;
    
    // Check if the elevation crosses this edge
    if ((h1 <= elevation && h2 >= elevation) || (h1 >= elevation && h2 <= elevation)) {
      const heightDiff = Math.abs(h1 - h2);
      
      // Skip near-horizontal edges or edges where heights are too similar
      if (heightDiff < 0.005) return;
      
      // Handle exact matches to prevent duplicate intersections
      if (Math.abs(h1 - elevation) < 0.001) {
        // Point 1 is exactly on the contour
        const intersection = new THREE.Vector3(
          p1.x,
          elevation + 0.02,
          p1.z
        );
        intersections.push(intersection);
        return;
      }
      
      if (Math.abs(h2 - elevation) < 0.001) {
        // Point 2 is exactly on the contour
        const intersection = new THREE.Vector3(
          p2.x,
          elevation + 0.02,
          p2.z
        );
        intersections.push(intersection);
        return;
      }
      
      // Linear interpolation to find intersection point
      const t = (elevation - h1) / (h2 - h1);
      
      // Clamp t to valid range to prevent extrapolation
      const clampedT = Math.max(0, Math.min(1, t));
      
      const intersection = new THREE.Vector3(
        p1.x + clampedT * (p2.x - p1.x),
        elevation + 0.02, // Raise slightly above terrain to avoid z-fighting
        p1.z + clampedT * (p2.z - p1.z)
      );
      
      intersections.push(intersection);
    }
  }

  /**
   * Create the actual line geometry for a contour line
   */
  private createContourLineGeometry(points: THREE.Vector3[], color: THREE.Color): void {
    if (points.length < 2) return;
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: color,
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
      depthTest: false // Ensure lines render on top like axes
    });
    
    const contourLine = new THREE.Line(geometry, material);
    contourLine.name = 'contourLine';
    contourLine.renderOrder = 999; // High render order like axes, but slightly lower than axes (1000)
    (contourLine as any).elevation = points[0]?.y || 0; // Store elevation for reference
    
    this.contourLines.push(contourLine);
    this.terrainGroup.add(contourLine);
    
    // Add elevation labels with dynamic spacing
    this.createContourLabels(points, color);
  }

  /**
   * Create elevation labels for a contour line with dynamic spacing
   */
  private createContourLabels(points: THREE.Vector3[], color: THREE.Color): void {
    if (points.length < 2) return;
    
    const elevation = points[0]?.y || 0;
    
    // Calculate dynamic label spacing based on camera distance
    const cameraDistance = this.camera ? this.camera.position.distanceTo(new THREE.Vector3(50, 0, 50)) : 100;
    
    // Dynamic spacing: closer camera = more labels, farther = fewer labels
    let labelSpacing: number;
    if (cameraDistance < 50) {
      labelSpacing = 15; // Very close - label every 15 feet along line
    } else if (cameraDistance < 100) {
      labelSpacing = 25; // Close - label every 25 feet along line
    } else if (cameraDistance < 200) {
      labelSpacing = 40; // Medium - label every 40 feet along line
    } else {
      labelSpacing = 60; // Far - label every 60 feet along line
    }
    
    // Calculate total line length and label positions
    let totalLength = 0;
    const segments: { start: THREE.Vector3; end: THREE.Vector3; length: number }[] = [];
    
    for (let i = 0; i < points.length - 1; i += 2) {
      const start = points[i];
      const end = points[i + 1];
      if (start && end) {
        const segmentLength = start.distanceTo(end);
        segments.push({ start, end, length: segmentLength });
        totalLength += segmentLength;
      }
    }
    
    // Only add labels if the line is long enough
    if (totalLength < labelSpacing * 0.8) return;
    
    // Place labels at regular intervals along the line (max 2 labels per contour)
    const numLabels = Math.max(1, Math.min(2, Math.floor(totalLength / labelSpacing)));
    const actualSpacing = totalLength / numLabels;
    
    for (let i = 0; i < numLabels; i++) {
      const targetDistance = (i + 0.5) * actualSpacing; // Offset by half spacing to center labels
      let currentDistance = 0;
      
      // Find the segment containing this label position
      for (const segment of segments) {
        if (currentDistance + segment.length >= targetDistance) {
          // Position within this segment
          const segmentProgress = (targetDistance - currentDistance) / segment.length;
          const labelPosition = segment.start.clone().lerp(segment.end, segmentProgress);
          
          // Create the elevation label
          const label = this.createElevationLabel(elevation, labelPosition, color);
          if (label) {
            this.contourLabels.push(label);
            this.terrainGroup.add(label);
          }
          break;
        }
        currentDistance += segment.length;
      }
    }
  }

  /**
   * Create a single elevation label sprite
   */
  private createElevationLabel(elevation: number, position: THREE.Vector3, lineColor: THREE.Color): THREE.Sprite | null {
    // Format elevation text
    const elevationText = elevation >= 0 ? `+${elevation.toFixed(1)}` : elevation.toFixed(1);
    
    // Create canvas for text
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;
    
    // Dynamic canvas size based on camera distance
    const cameraDistance = this.camera ? this.camera.position.distanceTo(new THREE.Vector3(50, 0, 50)) : 100;
    const scale = Math.max(0.5, Math.min(1.5, 100 / cameraDistance)); // Scale text based on distance
    
    canvas.width = 48 * scale;
    canvas.height = 20 * scale;
    
    // Style the text
    context.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent background
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add border
    context.strokeStyle = '#' + lineColor.getHexString();
    context.lineWidth = 1;
    context.strokeRect(0, 0, canvas.width, canvas.height);
    
    // Add text
    context.fillStyle = '#FFFFFF'; // White text for good contrast
    context.font = `bold ${10 * scale}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(elevationText, canvas.width / 2, canvas.height / 2);
    
    // Create sprite
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      depthTest: false, // Always render on top
      transparent: true
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.position.y += 0.1; // Raise slightly above contour line
    sprite.scale.set(4 * scale, 2 * scale, 1);
    sprite.renderOrder = 1003; // Render above axes
    sprite.name = 'contourLabel';
    
    return sprite;
  }

  /**
   * Clear all existing contour lines
   */
  public clearContourLines(): void {
    this.contourLines.forEach(line => {
      this.terrainGroup.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });
    this.contourLines = [];
    
    // Clear elevation labels
    this.contourLabels.forEach(label => {
      this.terrainGroup.remove(label);
      label.material.dispose();
    });
    this.contourLabels = [];
  }

  /**
   * Toggle contour line visibility
   */
  public toggleContourLines(): boolean {
    this.contourLinesVisible = !this.contourLinesVisible;
    this.contourLines.forEach(line => {
      line.visible = this.contourLinesVisible;
    });
    this.contourLabels.forEach(label => {
      label.visible = this.contourLinesVisible;
    });
    return this.contourLinesVisible;
  }

  /**
   * Set contour line interval (distance between contour lines)
   */
  public setContourInterval(interval: number): void {
    if (interval > 0 && interval !== this.contourInterval) {
      this.contourInterval = interval;
      this.generateContourLines();
    }
  }

  /**
   * Get current contour line settings
   */
  public getContourSettings(): { visible: boolean; interval: number; count: number; labelCount: number } {
    return {
      visible: this.contourLinesVisible,
      interval: this.contourInterval,
      count: this.contourLines.length,
      labelCount: this.contourLabels.length
    };
  }

  /**
   * Calculate dynamic contour interval based on camera distance
   */
  private calculateDynamicContourInterval(): number {
    if (!this.camera || !this.dynamicContours) {
      return this.baseContourInterval;
    }

    // Calculate camera distance from terrain center
    const terrainCenter = new THREE.Vector3(50, 0, 50); // Center of 100x100 terrain
    const cameraDistance = this.camera.position.distanceTo(terrainCenter);
    
    // Define zoom level ranges and corresponding contour intervals
    // Closer camera = more detail = smaller intervals
    // Further camera = less detail = larger intervals
    let dynamicInterval: number;
    
    if (cameraDistance < 30) {
      // Very close - show maximum detail
      dynamicInterval = this.baseContourInterval * 0.25; // 4x more lines
    } else if (cameraDistance < 60) {
      // Close - show high detail
      dynamicInterval = this.baseContourInterval * 0.5; // 2x more lines
    } else if (cameraDistance < 120) {
      // Medium distance - normal detail
      dynamicInterval = this.baseContourInterval; // Normal lines
    } else if (cameraDistance < 200) {
      // Far - reduce detail
      dynamicInterval = this.baseContourInterval * 2; // Half the lines
    } else if (cameraDistance < 300) {
      // Very far - minimal detail
      dynamicInterval = this.baseContourInterval * 4; // Quarter of the lines
    } else {
      // Extremely far - very minimal detail
      dynamicInterval = this.baseContourInterval * 8; // Eighth of the lines
    }
    
    // Ensure minimum interval of 0.25 feet and maximum of 10 feet
    return Math.max(0.25, Math.min(10, dynamicInterval));
  }

  /**
   * Update contour lines based on current camera position (with throttling)
   */
  public updateContoursForZoom(): void {
    if (!this.camera || !this.dynamicContours || !this.contourLinesVisible) {
      return;
    }

    const terrainCenter = new THREE.Vector3(50, 0, 50);
    const currentDistance = this.camera.position.distanceTo(terrainCenter);
    
    // Only update if camera moved significantly (threshold to prevent excessive updates)
    const distanceThreshold = Math.max(3, currentDistance * 0.08); // Reduced threshold for more responsive updates
    
    if (Math.abs(currentDistance - this.lastCameraDistance) < distanceThreshold) {
      return; // Camera hasn't moved enough to warrant an update
    }
    
    this.lastCameraDistance = currentDistance;
    
    // Throttle updates to prevent excessive regeneration
    if (this.contourUpdateThrottle) {
      clearTimeout(this.contourUpdateThrottle);
    }
    
    this.contourUpdateThrottle = setTimeout(() => {
      const newInterval = this.calculateDynamicContourInterval();
      
      // Regenerate contours if interval changed significantly
      if (Math.abs(newInterval - this.contourInterval) > 0.1) {
        this.contourInterval = newInterval;
        this.generateContourLines();
      } else {
        // Even if interval didn't change, regenerate labels for new camera position
        // Clear existing labels
        this.contourLabels.forEach(label => {
          this.terrainGroup.remove(label);
          label.material.dispose();
        });
        this.contourLabels = [];
        
        // Regenerate labels with current camera-based spacing
        this.contourLines.forEach(line => {
          const elevation = (line as any).elevation || 0;
          const color = this.getColorAtElevation(elevation);
          
          // Extract points from line geometry
          const positions = line.geometry.attributes.position.array;
          const points: THREE.Vector3[] = [];
          
          for (let i = 0; i < positions.length; i += 3) {
            points.push(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
          }
          
          if (points.length >= 2) {
            this.createContourLabels(points, color);
          }
        });
      }
      
      this.contourUpdateThrottle = null;
    }, 150); // Reduced throttle time for more responsive updates
  }

  /**
   * Enable or disable dynamic contour adjustment
   */
  public setDynamicContours(enabled: boolean): void {
    this.dynamicContours = enabled;
    if (enabled) {
      this.updateContoursForZoom();
    } else {
      // Reset to base interval when disabled
      this.contourInterval = this.baseContourInterval;
      this.generateContourLines();
    }
  }

  /**
   * Set the base contour interval (used for dynamic calculations)
   */
  public setBaseContourInterval(interval: number): void {
    if (interval > 0) {
      this.baseContourInterval = interval;
      if (this.dynamicContours) {
        this.updateContoursForZoom();
      } else {
        this.contourInterval = interval;
        this.generateContourLines();
      }
    }
  }

  /**
   * Get dynamic contour settings
   */
  public getDynamicContourSettings(): { 
    dynamic: boolean; 
    baseInterval: number; 
    currentInterval: number; 
    cameraDistance: number 
  } {
    const terrainCenter = new THREE.Vector3(50, 0, 50);
    const distance = this.camera ? this.camera.position.distanceTo(terrainCenter) : 0;
    
    return {
      dynamic: this.dynamicContours,
      baseInterval: this.baseContourInterval,
      currentInterval: this.contourInterval,
      cameraDistance: distance
    };
  }

  /**
   * Force all terrain colors to be light (no black areas) - legacy method
   */
  public forceLightColors(): void {
    const vertices = this.geometry.attributes.position.array;
    const colors = new Float32Array(vertices.length);

    // Apply uniform light brown coloring
    for (let i = 0; i < vertices.length; i += 3) {
      const height = vertices[i + 1] || 0;
      
      // Consistent surface color to match main terrain coloring
      let r = 0.82, g = 0.72, b = 0.58; // Same as main surface color
      
      // Very minimal variation for natural look
      if (isFinite(height)) {
        const x = vertices[i] || 0;
        const z = vertices[i + 2] || 0;
        const subtleVariation = this.smoothNoise(x * 0.02, z * 0.02) * 0.03;
        r += subtleVariation;
        g += subtleVariation * 0.8;
        b += subtleVariation * 0.6;
      }
      
      // Ensure colors stay within bounds and never go dark
      colors[i] = Math.min(1.0, Math.max(0.75, r));
      colors[i + 1] = Math.min(1.0, Math.max(0.7, g));
      colors[i + 2] = Math.min(1.0, Math.max(0.65, b));
    }

    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.attributes.color.needsUpdate = true;
  }

  /**
   * Grayscale terrain coloring based on height/depth (#444 to #DDD range)
   */
  public updateTerrainColors(): void {
    const vertices = this.geometry.attributes.position.array;
    const colors = new Float32Array(vertices.length);

    // Find height range for normalization
    let minHeight = Infinity;
    let maxHeight = -Infinity;

    for (let i = 1; i < vertices.length; i += 3) {
      const height = vertices[i];
      if (!isNaN(height) && isFinite(height)) {
        minHeight = Math.min(minHeight, height);
        maxHeight = Math.max(maxHeight, height);
      }
    }

    // Fallback if no valid heights found
    if (!isFinite(minHeight) || !isFinite(maxHeight)) {
      minHeight = -10;
      maxHeight = 10;
    }

    // Grayscale range: #444 (0.267) to #DDD (0.867)
    const darkGray = 0.267;  // #444 in normalized RGB
    const lightGray = 0.867; // #DDD in normalized RGB
    const colorRange = lightGray - darkGray;

    // Apply grayscale coloring based on height
    for (let i = 0; i < vertices.length; i += 3) {
      const height = vertices[i + 1];
      
      let grayValue = darkGray; // Default to dark gray
      
      if (isFinite(height) && !isNaN(height)) {
        // Normalize height to 0-1 range
        const normalizedHeight = Math.max(0, Math.min(1, (height - minHeight) / (maxHeight - minHeight)));
        
        // Map to grayscale range: deeper areas are darker (#444), higher areas are lighter (#DDD)
        grayValue = darkGray + (normalizedHeight * colorRange);
        
        // Clamp to our defined range
        grayValue = Math.max(darkGray, Math.min(lightGray, grayValue));
      }

      // Set RGB values to same gray value for true grayscale
      colors[i] = grayValue;     // R
      colors[i + 1] = grayValue; // G  
      colors[i + 2] = grayValue; // B
    }

    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.attributes.color.needsUpdate = true;
    
    // Update wall colors to match
    this.updateWallColors();
  }

  /**
   * Update wall colors with grayscale matching terrain surface (#444 to #DDD range)
   */
  private updateWallColors(): void {
    if (this.wallMeshes.length === 0) return;
    
    const wallGeometry = this.wallMeshes[0].geometry as THREE.BufferGeometry;
    const positions = wallGeometry.attributes.position.array;
    const wallColors = new Float32Array(positions.length);
    
    // Find height range for normalization (same as terrain surface)
    let minHeight = Infinity;
    let maxHeight = -Infinity;

    for (let i = 1; i < positions.length; i += 3) {
      const height = positions[i];
      if (!isNaN(height) && isFinite(height)) {
        minHeight = Math.min(minHeight, height);
        maxHeight = Math.max(maxHeight, height);
      }
    }

    // Fallback if no valid heights found
    if (!isFinite(minHeight) || !isFinite(maxHeight)) {
      minHeight = -10;
      maxHeight = 10;
    }

    // Grayscale range: #444 (0.267) to #DDD (0.867)
    const darkGray = 0.267;  // #444 in normalized RGB
    const lightGray = 0.867; // #DDD in normalized RGB
    const colorRange = lightGray - darkGray;
    
    // Calculate colors for each vertex in the wall geometry
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1]; // Height/depth
      
      let grayValue = darkGray; // Default to dark gray
      
      if (isFinite(y) && !isNaN(y)) {
        // Normalize height to 0-1 range
        const normalizedHeight = Math.max(0, Math.min(1, (y - minHeight) / (maxHeight - minHeight)));
        
        // Map to grayscale range: deeper areas are darker (#444), higher areas are lighter (#DDD)
        grayValue = darkGray + (normalizedHeight * colorRange);
        
        // Clamp to our defined range
        grayValue = Math.max(darkGray, Math.min(lightGray, grayValue));
      }
      
      // Set RGB values to same gray value for true grayscale
      wallColors[i] = grayValue;     // R
      wallColors[i + 1] = grayValue; // G  
      wallColors[i + 2] = grayValue; // B
    }
    
    // Apply colors to wall geometry and switch to vertex colors
    wallGeometry.setAttribute('color', new THREE.BufferAttribute(wallColors, 3));
    wallGeometry.attributes.color.needsUpdate = true;
    
    // Update material to use vertex colors
    const wallMaterial = this.wallMeshes[0].material as THREE.MeshBasicMaterial;
    wallMaterial.vertexColors = true;
    wallMaterial.needsUpdate = true;
  }

  /**
   * Enhanced brush-based terrain modification with intelligent arrow placement
   */
  public modifyHeightBrush(x: number, z: number, heightChange: number): void {
    const vertices = this.geometry.attributes.position.array;
    const widthSegments = this.geometry.parameters.widthSegments;
    const heightSegments = this.geometry.parameters.heightSegments;
    
    // Calculate brush area
    const brushRadius = this.brushSettings.size;
    let modified = false;
    let totalVolumeChange = 0;

    for (let i = 0; i < vertices.length; i += 3) {
      const vertexX = vertices[i];
      const vertexZ = vertices[i + 2];
      const deltaX = vertexX - x;
      const deltaZ = vertexZ - z;
      const distance = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);

      if (this.isInBrush(distance, deltaX, deltaZ)) {
        const falloff = this.calculateFalloff(distance, brushRadius, deltaX, deltaZ);
        
        // Get material resistance at current depth
        const currentHeight = vertices[i + 1];
        const excavationDepth = Math.max(0, -currentHeight);
        const currentMaterial = this.getMaterialAtDepth(excavationDepth);
        
        // Apply material resistance to excavation
        let materialResistance = 1.0;
        if (heightChange < 0) { // Only apply resistance when digging
          materialResistance = 1.0 - (currentMaterial.hardness * 0.3);
        }
        
        const actualChange = heightChange * this.brushSettings.strength * falloff * materialResistance;
        
        // Limit excavation to maximum depth
        const newHeight = vertices[i + 1] + actualChange;
        const maxExcavationDepth = -this.blockDepth * 0.9; // Don't dig through the bottom
        vertices[i + 1] = Math.max(maxExcavationDepth, newHeight);
        
        totalVolumeChange += Math.abs(actualChange);
        modified = true;
      }
    }

    if (modified) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.computeVertexNormals();
      this.updateTerrainColors();
      this.updateBlockGeometry(); // Update block to match terrain
      this.generateContourLines(); // Update contour lines after terrain modification
      
      // Auto-enable overlays and create localized overlays for modification area
      if (heightChange < 0) {
        // Cut operation - enable red overlay and create bounded overlay
        this.showOriginalTerrainOverlay = true;
        this.createLocalizedCutOverlay(x, z, brushRadius);
      } else if (heightChange > 0) {
        // Fill operation - enable blue overlay and create bounded overlay
        this.showFillVolumeOverlay = true;
        this.createLocalizedFillOverlay(x, z, brushRadius);
      }

      // Create intelligent arrow placement based on operation magnitude
      this.createDensityBasedArrows(x, z, heightChange, totalVolumeChange, brushRadius);
    }
  }

  /**
   * Clear arrows within specific bounds
   */
  private clearArrowsInBounds(bounds: { minX: number, maxX: number, minZ: number, maxZ: number }): void {
    const arrowsToRemove = this.arrows.filter(arrow => {
      const pos = arrow.position;
      return pos.x >= bounds.minX && pos.x <= bounds.maxX && 
             pos.z >= bounds.minZ && pos.z <= bounds.maxZ;
    });
    
    arrowsToRemove.forEach(arrow => {
      this.terrainGroup.remove(arrow);
    });
    
    this.arrows = this.arrows.filter(arrow => {
      const pos = arrow.position;
      return !(pos.x >= bounds.minX && pos.x <= bounds.maxX && 
               pos.z >= bounds.minZ && pos.z <= bounds.maxZ);
    });
  }

  /**
   * Create evenly distributed arrows for a merged area
   */
  private createArrowsForMergedArea(bounds: { minX: number, maxX: number, minZ: number, maxZ: number }, isFill: boolean): void {
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const areaWidth = bounds.maxX - bounds.minX;
    const areaHeight = bounds.maxZ - bounds.minZ;
    const areaSize = Math.max(areaWidth, areaHeight);
    
    // Much simpler approach - fewer arrows, better spacing
    const minSpacing = 15.0; // Large minimum spacing between arrows
    
    // Determine number of arrows based on area size - very conservative
    let numArrows = 1; // Always start with 1 arrow
    if (areaSize > 25.0) {
      numArrows = 2; // Only 2 arrows for large areas
    }
    
    if (numArrows === 1) {
      // Single arrow at center
      const height = this.getHeightAtPosition(centerX, centerZ);
      if (isFill) {
        this.createFillArrow(centerX, centerZ, height, 1.0, 0);
      } else {
        this.createCutArrow(centerX, centerZ, height, -1.0, 0);
      }
    } else {
      // Two arrows evenly spaced along the longest dimension
      if (areaWidth >= areaHeight) {
        // Space arrows along X-axis
        const spacing = Math.min(areaWidth * 0.4, minSpacing); // Don't space too far apart
        const arrow1X = centerX - spacing / 2;
        const arrow2X = centerX + spacing / 2;
        
        // Create two arrows along X-axis
        const height1 = this.getHeightAtPosition(arrow1X, centerZ);
        const height2 = this.getHeightAtPosition(arrow2X, centerZ);
        
        if (isFill) {
          this.createFillArrow(arrow1X, centerZ, height1, 1.0, 0);
          this.createFillArrow(arrow2X, centerZ, height2, 1.0, 0);
        } else {
          this.createCutArrow(arrow1X, centerZ, height1, -1.0, 0);
          this.createCutArrow(arrow2X, centerZ, height2, -1.0, 0);
        }
      } else {
        // Space arrows along Z-axis  
        const spacing = Math.min(areaHeight * 0.4, minSpacing);
        const arrow1Z = centerZ - spacing / 2;
        const arrow2Z = centerZ + spacing / 2;
        
        // Create two arrows along Z-axis
        const height1 = this.getHeightAtPosition(centerX, arrow1Z);
        const height2 = this.getHeightAtPosition(centerX, arrow2Z);
        
        if (isFill) {
          this.createFillArrow(centerX, arrow1Z, height1, 1.0, 0);
          this.createFillArrow(centerX, arrow2Z, height2, 1.0, 0);
        } else {
          this.createCutArrow(centerX, arrow1Z, height1, -1.0, 0);
          this.createCutArrow(centerX, arrow2Z, height2, -1.0, 0);
        }
      }
    }
  }

  /**
   * Create minimal, large, evenly spaced arrows matching reference design
   */
  private createDensityBasedArrows(x: number, z: number, heightChange: number, volumeChange: number, radius: number): void {
    // Much larger spacing for fewer, more prominent arrows
    const minArrowSpacing = 8.0; // Large minimum spacing
    const arrowSpacing = Math.max(minArrowSpacing, radius * 1.5);
    
    // Very few arrows - prioritize 1 arrow for most cases, fewer arrows overall
    if (radius < 8.0) {
      // Single arrow at center for smaller operations (increased threshold)
      const arrowHeight = this.getHeightAtPosition(x, z);
      if (heightChange < 0) {
        this.createCutArrow(x, z, arrowHeight, heightChange, 0);
      } else {
        this.createFillArrow(x, z, arrowHeight, heightChange, 0);
      }
      return;
    }
    
    // For larger operations, maximum 1 arrow - even simpler
    const maxArrows = 1;
    
    // Single arrow at center for all operations
    const arrowHeight = this.getHeightAtPosition(x, z);
    if (heightChange < 0) {
      this.createCutArrow(x, z, arrowHeight, heightChange, 0);
    } else {
      this.createFillArrow(x, z, arrowHeight, heightChange, 0);
    }
    // Function complete - single arrow approach
  }

  /**
   * Calculate zoom-based density multiplier for arrow placement
   * Returns higher values when zoomed in (more arrows) and lower when zoomed out (fewer arrows)
   */
  private calculateZoomDensityMultiplier(): number {
    if (!this.camera) return 1.0;
    
    // Calculate distance from camera to terrain center (50, 0, 50)
    const terrainCenter = new THREE.Vector3(50, 0, 50);
    const cameraDistance = this.camera.position.distanceTo(terrainCenter);
    
    // Define zoom density curve
    // Close camera (zoomed in) = high density, Far camera (zoomed out) = low density
    const minDistance = 20;  // Very close zoom
    const maxDistance = 200; // Very far zoom
    const minDensity = 0.3;  // Minimum arrows when far
    const maxDensity = 3.0;  // Maximum arrows when close
    
    // Inverse relationship: closer camera = higher density
    const normalizedDistance = Math.max(0, Math.min(1, (cameraDistance - minDistance) / (maxDistance - minDistance)));
    const densityMultiplier = maxDensity - (normalizedDistance * (maxDensity - minDensity));
    
    return Math.max(minDensity, Math.min(maxDensity, densityMultiplier));
  }

  /**
   * Create a cut arrow (red, downward) - PERSISTENT for session with proportional size
   * Positioned inside the excavated volume between original and current terrain
   */
  private createCutArrow(x: number, z: number, height: number, heightChange: number, falloff: number): void {
    // Get original height at this position
    const originalHeight = this.getOriginalHeightAtPosition(x, z);
    
    // Only create arrow if there's actual excavation (current height below original)
    if (height >= originalHeight - 0.02) return; // Much lower threshold for better responsiveness
    
    // Calculate excavation depth
    const excavationDepth = originalHeight - height;
    
    // Position arrow ABOVE the excavated area for visibility
    const arrowBaseHeight = originalHeight + 2.0; // Position 2 feet above original terrain
    
    // Make arrow length proportional to excavation depth, with much larger scale for visibility
    const baseArrowScale = 15.0; // Even bigger base scale for maximum visibility
    const depthScale = Math.max(1.2, excavationDepth * 3.0); // Scale aggressively with depth, larger minimum
    const arrowLength = baseArrowScale * depthScale; // Total length scales with excavation depth
    const headLength = Math.max(4.0, arrowLength * 0.35); // Head is 35% of total length, minimum 4.0
    const headWidth = Math.max(3.0, arrowLength * 0.25); // Head width scales with length, larger minimum
    
    // Position arrow above the excavated area for clear visibility
    const arrowPos = new THREE.Vector3(x, arrowBaseHeight, z);
    const arrowDir = new THREE.Vector3(0, -1, 0); // Point downward
    
    const arrow = new THREE.ArrowHelper(arrowDir, arrowPos, arrowLength, 0xFF0000); // Red color
    
    // Set proportional dimensions based on excavation depth
    arrow.setLength(arrowLength, headLength, headWidth);
    
    // Store dimensions for reference
    (arrow as any).isProportional = true;
    (arrow as any).excavationDepth = excavationDepth;
    (arrow as any).arrowLength = arrowLength;
    
    // Mark as persistent cut arrow
    (arrow as any).isPersistentCut = true;
    
    this.terrainGroup.add(arrow);
    this.arrows.push(arrow);
    
    // Red cut arrows persist for the entire session - no timeout removal
    // They will only be cleared when terrain is reset or manually cleared
  }

  /**
   * Create a fill arrow (blue, upward) - PERSISTENT for session with proportional size
   * Positioned inside the filled volume between original and current terrain
   */
  private createFillArrow(x: number, z: number, height: number, heightChange: number, falloff: number): void {
    // Get original height at this position
    const originalHeight = this.getOriginalHeightAtPosition(x, z);
    
    // Only create arrow if there's actual filling (current height above original)
    if (height <= originalHeight + 0.02) return; // Much lower threshold for better responsiveness
    
    // Calculate fill height (depth of material added)
    const fillHeight = height - originalHeight;
    
    // Position arrow in the middle of the filled volume
    const volumeMiddleHeight = originalHeight + (fillHeight / 2);
    
    // Make arrow length proportional to fill height, with much larger scale for visibility
    const baseArrowScale = 12.0; // Even bigger base scale for better visibility
    const heightScale = Math.max(1.0, fillHeight * 2.0); // Scale with fill height, larger minimum
    const arrowLength = baseArrowScale * heightScale; // Total length scales with fill height
    const headLength = Math.max(3.0, arrowLength * 0.3); // Head is 30% of total length, minimum 3.0
    const headWidth = Math.max(2.0, arrowLength * 0.2); // Head width scales with length, larger minimum
    
    // Position arrow in center of filled volume
    const arrowPos = new THREE.Vector3(x, volumeMiddleHeight, z);
    const arrowDir = new THREE.Vector3(0, 1, 0); // Point upward
    
    const arrow = new THREE.ArrowHelper(arrowDir, arrowPos, arrowLength, 0x0000FF); // Blue color
    
    // Set proportional dimensions based on fill height
    arrow.setLength(arrowLength, headLength, headWidth);
    
    // Store dimensions for reference
    (arrow as any).isProportional = true;
    (arrow as any).fillHeight = fillHeight;
    (arrow as any).arrowLength = arrowLength;
    
    // Mark as persistent fill arrow
    (arrow as any).isPersistentFill = true;
    
    this.terrainGroup.add(arrow);
    this.arrows.push(arrow);
    
    // Blue fill arrows persist for the entire session - no timeout removal
    // They will only be cleared when terrain is reset or manually cleared
  }

  /**
   * Get height at a specific X,Z position using interpolation
   */
  private getHeightAtPosition(x: number, z: number): number {
    const vertices = this.geometry.attributes.position.array;
    let closestHeight = 0;
    let minDistance = Infinity;
    
    // Find closest vertex height
    for (let i = 0; i < vertices.length; i += 3) {
      const vertexX = vertices[i];
      const vertexZ = vertices[i + 2];
      const distance = Math.sqrt((x - vertexX) ** 2 + (z - vertexZ) ** 2);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestHeight = vertices[i + 1];
      }
    }
    
    return closestHeight;
  }

  /**
   * Check if point is within brush shape
   */
  private isInBrush(distance: number, deltaX: number, deltaZ: number): boolean {
    const brushRadius = this.brushSettings.size;
    
    switch (this.brushSettings.shape) {
      case 'circle':
        return distance <= brushRadius;
      case 'square':
        return Math.abs(deltaX) <= brushRadius && Math.abs(deltaZ) <= brushRadius;
      default:
        return distance <= brushRadius;
    }
  }

  /**
   * Calculate falloff based on distance and falloff type, with proper handling for different brush shapes
   */
  private calculateFalloff(distance: number, radius: number, deltaX?: number, deltaZ?: number): number {
    let normalizedDistance: number;
    
    // Calculate normalized distance based on brush shape
    if (this.brushSettings.shape === 'square' && deltaX !== undefined && deltaZ !== undefined) {
      // For square brushes, use the maximum distance along either axis
      const maxAxisDistance = Math.max(Math.abs(deltaX), Math.abs(deltaZ));
      if (maxAxisDistance >= radius) return 0;
      normalizedDistance = maxAxisDistance / radius;
    } else {
      // For circular brushes (or fallback), use radial distance
      if (distance >= radius) return 0;
      normalizedDistance = distance / radius;
    }
    
    // Apply falloff curve based on type
    switch (this.brushSettings.falloff) {
      case 'linear':
        return 1 - normalizedDistance;
      case 'smooth':
        return Math.cos(normalizedDistance * Math.PI * 0.5);
      case 'sharp':
        return normalizedDistance < 0.8 ? 1 : (1 - normalizedDistance) / 0.2; // Sharp drop-off at 80% radius
      default:
        return 1 - normalizedDistance;
    }
  }

  /**
   * Update terrain height at a specific position (legacy method)
   */
  public modifyHeight(x: number, z: number, heightChange: number): void {
    this.modifyHeightBrush(x, z, heightChange);
  }

  /**
   * Enhanced volume calculation for 3D terrain
   */
  public calculateVolumeDifference(): {
    cut: number;
    fill: number;
    net: number;
  } {
    const vertices = this.geometry.attributes.position.array;
    const originalVertices = this.originalVertices;
    const index = this.geometry.index;
    
    let cut = 0;
    let fill = 0;

    if (index) {
      // Use triangulation for more accurate volume calculation
      const triangles = index.array;
      
      for (let i = 0; i < triangles.length; i += 3) {
        const i1 = triangles[i] * 3;
        const i2 = triangles[i + 1] * 3;
        const i3 = triangles[i + 2] * 3;
        
        // Calculate triangle area
        const v1 = new THREE.Vector3(vertices[i1], vertices[i1 + 1], vertices[i1 + 2]);
        const v2 = new THREE.Vector3(vertices[i2], vertices[i2 + 1], vertices[i2 + 2]);
        const v3 = new THREE.Vector3(vertices[i3], vertices[i3 + 1], vertices[i3 + 2]);
        
        const edge1 = v2.clone().sub(v1);
        const edge2 = v3.clone().sub(v1);
        const area = edge1.cross(edge2).length() * 0.5;
        
        // Average height difference
        const avgCurrentHeight = (vertices[i1 + 1] + vertices[i2 + 1] + vertices[i3 + 1]) / 3;
        const avgOriginalHeight = (originalVertices[i1 + 1] + originalVertices[i2 + 1] + originalVertices[i3 + 1]) / 3;
        
        const heightDiff = avgCurrentHeight - avgOriginalHeight;
        const volume = area * heightDiff;
        
        if (volume > 0) {
          fill += volume;
        } else {
          cut += Math.abs(volume);
        }
      }
    } else {
      // Fallback to simple vertex-based calculation
      for (let i = 1; i < vertices.length; i += 3) {
        const currentHeight = vertices[i];
        const originalHeight = originalVertices[i];
        const difference = currentHeight - originalHeight;

        if (difference > 0) {
          fill += difference;
        } else {
          cut += Math.abs(difference);
        }
      }
    }

    return {
      cut,
      fill,
      net: fill - cut,
    };
  }

  /**
   * Save current terrain state for undo/redo
   */
  private saveState(): void {
    const state: TerrainState = {
      vertices: new Float32Array(this.geometry.attributes.position.array),
      timestamp: Date.now(),
      volume: this.calculateVolumeDifference()
    };

    this.undoStack.push(state);
    
    // Limit undo stack size
    if (this.undoStack.length > this.maxUndoStates) {
      this.undoStack.shift();
    }
    
    // Clear redo stack when new state is saved
    this.redoStack = [];
  }

  /**
   * Undo last modification
   */
  public undo(): boolean {
    if (this.undoStack.length < 2) return false;
    
    const currentState = this.undoStack.pop()!;
    this.redoStack.push(currentState);
    
    const previousState = this.undoStack[this.undoStack.length - 1];
    this.restoreState(previousState);
    
    return true;
  }

  /**
   * Redo last undone modification
   */
  public redo(): boolean {
    if (this.redoStack.length === 0) return false;
    
    const state = this.redoStack.pop()!;
    this.undoStack.push(state);
    this.restoreState(state);
    
    return true;
  }

  /**
   * Restore terrain to a specific state
   */
  private restoreState(state: TerrainState): void {
    const vertices = this.geometry.attributes.position.array;
    
    for (let i = 0; i < vertices.length; i++) {
      vertices[i] = state.vertices[i];
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.updateTerrainColors();
    this.updateBlockGeometry(); // Update block to match undone state
  }

  /**
   * Export terrain data
   */
  public exportTerrain(): any {
    return {
      vertices: Array.from(this.geometry.attributes.position.array),
      originalVertices: Array.from(this.originalVertices),
      materialLayers: this.materialLayers,
      blockDepth: this.blockDepth,
      parameters: {
        width: this.geometry.parameters.width,
        height: this.geometry.parameters.height,
        widthSegments: this.geometry.parameters.widthSegments,
        heightSegments: this.geometry.parameters.heightSegments
      },
      volume: this.calculateVolumeDifference(),
      timestamp: Date.now()
    };
  }

  /**
   * Import terrain data
   */
  public importTerrain(data: any): void {
    if (data.vertices && data.vertices.length === this.geometry.attributes.position.array.length) {
      const vertices = this.geometry.attributes.position.array;
      
      for (let i = 0; i < vertices.length; i++) {
        vertices[i] = data.vertices[i];
      }

      if (data.originalVertices) {
        this.originalVertices = new Float32Array(data.originalVertices);
      }

      if (data.materialLayers) {
        this.materialLayers = data.materialLayers;
      }

      if (data.blockDepth) {
        this.blockDepth = data.blockDepth;
      }

      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.computeVertexNormals();
      this.updateTerrainColors();
      this.saveState();
    }
  }

  /**
   * Set brush settings
   */
  public setBrushSettings(settings: Partial<BrushSettings>): void {
    this.brushSettings = { ...this.brushSettings, ...settings };
  }

  /**
   * Get brush settings
   */
  public getBrushSettings(): BrushSettings {
    return { ...this.brushSettings };
  }

  /**
   * Reset terrain to original state
   */
  public reset(): void {
    const vertices = this.geometry.attributes.position.array;

    for (let i = 0; i < vertices.length; i++) {
      vertices[i] = this.originalVertices[i];
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.updateTerrainColors();
    this.updateBlockGeometry(); // Update block to match reset terrain
    
    // Clear all arrows including persistent cut arrows
    this.clearAllArrows();
    
    // Clean up existing overlays instead of recreating them
    this.cleanupAllOverlays();
    
    // Reset overlay visibility flags
    this.showOriginalTerrainOverlay = false;
    this.showFillVolumeOverlay = false;
    
    // Clear undo/redo stacks and save initial state
    this.undoStack = [];
    this.redoStack = [];
    this.saveState();
  }

  /**
   * Save current terrain state as new baseline - preserves terrain but resets volume calculations to zero
   * Enhanced version with database persistence is available in the DATABASE PERSISTENCE METHODS section
   */
  // Method moved to DATABASE PERSISTENCE METHODS section with enhanced functionality

  /**
   * Start terrain modification (for undo/redo)
   */
  public startModification(): void {
    this.saveState();
  }

  /**
   * Force disable wireframe mode
   */
  public forceDisableWireframe(): void {
    // Disable wireframe on surface mesh (now MeshBasicMaterial)
    const surfaceMaterial = this.surfaceMesh.material as THREE.MeshBasicMaterial;
    surfaceMaterial.wireframe = false;
    
    // Also disable wireframe on the terrain block
    this.wallMeshes.forEach(block => {
      if (block.material instanceof Array) {
        // Handle multi-material mesh (our box)
        block.material.forEach(mat => {
          if (mat instanceof THREE.MeshBasicMaterial) {
            mat.wireframe = false;
          }
        });
      } else if (block.material instanceof THREE.MeshBasicMaterial) {
        block.material.wireframe = false;
      }
    });
  }

  /**
   * Toggle wireframe mode
   */
  public toggleWireframe(): void {
    // Toggle wireframe on surface mesh
    const surfaceMaterial = this.surfaceMesh.material as THREE.MeshBasicMaterial;
    surfaceMaterial.wireframe = !surfaceMaterial.wireframe;
    
    // Toggle wireframe on the terrain block (now has 5 materials: bottom, front, back, left, right)
    this.wallMeshes.forEach(block => {
      if (block.material instanceof Array) {
        block.material.forEach(mat => {
          if (mat instanceof THREE.MeshBasicMaterial) {
            mat.wireframe = surfaceMaterial.wireframe;
          }
        });
      } else if (block.material instanceof THREE.MeshBasicMaterial) {
        block.material.wireframe = surfaceMaterial.wireframe;
      }
    });
  }

  /**
   * Get the Three.js mesh (returns the group for 3D terrain)
   */
  public getMesh(): THREE.Object3D {
    return this.terrainGroup;
  }

  /**
   * Get the surface mesh specifically
   */
  public getSurfaceMesh(): THREE.Mesh {
    return this.surfaceMesh;
  }

  /**
   * Get terrain dimensions including depth
   */
  public getDimensions(): { width: number; height: number; depth: number } {
    const geometry = this.geometry;
    return {
      width: geometry.parameters.width,
      height: geometry.parameters.height,
      depth: this.blockDepth,
    };
  }

  /**
   * Get material layers information
   */
  public getMaterialLayers(): MaterialLayer[] {
    return [...this.materialLayers];
  }

  /**
   * Get terrain statistics
   */
  public getStats(): {
    vertexCount: number;
    triangleCount: number;
    dimensions: { width: number; height: number; depth: number };
    volume: { cut: number; fill: number; net: number };
    materialLayers: number;
  } {
    const vertices = this.geometry.attributes.position.array;
    const index = this.geometry.index;
    
    return {
      vertexCount: vertices.length / 3,
      triangleCount: index ? index.count / 3 : 0,
      dimensions: this.getDimensions(),
      volume: this.calculateVolumeDifference(),
      materialLayers: this.materialLayers.length
    };
  }

  /**
   * Update the 3D block geometry to match current terrain heights
   */
  private updateBlockGeometry(): void {
    if (this.wallMeshes.length === 0) return;
    
    const terrainVertices = this.geometry.attributes.position.array;
    const blockGeometry = this.wallMeshes[0].geometry as THREE.BufferGeometry;
    const positions = blockGeometry.attributes.position.array as Float32Array;
    const topVertexCount = terrainVertices.length / 3;
    
    // Update top vertices to match terrain heights
    for (let i = 0; i < terrainVertices.length; i += 3) {
      const vertexIndex = i / 3;
      positions[vertexIndex * 3] = terrainVertices[i];     // x
      positions[vertexIndex * 3 + 1] = terrainVertices[i + 1]; // y (height)
      positions[vertexIndex * 3 + 2] = terrainVertices[i + 2]; // z
    }
    
    blockGeometry.attributes.position.needsUpdate = true;
    blockGeometry.computeVertexNormals();
  }

  // Add hover tooltip logic (simplified, assume raycaster in main handles hover)
  public getLayerAtPosition(x: number, z: number): string {
    const vertices = this.geometry.attributes.position.array;
    let height = 0;
    let minDist = Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
      const dist = Math.sqrt((x - vertices[i]) ** 2 + (z - vertices[i + 2]) ** 2);
      if (dist < minDist) {
        minDist = dist;
        height = vertices[i + 1];
      }
    }
    const depth = Math.max(0, -height);
    const layer = this.getMaterialAtDepth(depth);
    return `${layer.name} (Hardness: ${layer.hardness})`;
  }

  /**
   * Set accessibility mode for terrain visualization
   */
  public setAccessibilityMode(mode: 'normal' | 'colorBlind' | 'highContrast' | 'patterns'): void {
    this.accessibilityMode = mode;
    this.updateAccessibilityFeatures();
    this.updateTerrainColors();
  }

  /**
   * Set color blind type for specialized color adjustments
   */
  public setColorBlindType(type: 'protanopia' | 'deuteranopia' | 'tritanopia' | 'normal'): void {
    this.colorBlindType = type;
    if (this.accessibilityMode === 'colorBlind') {
      this.updateAccessibilityFeatures();
      this.updateTerrainColors();
    }
  }

  /**
   * Toggle pattern overlays for better zone distinction
   */
  public setPatternOverlays(enabled: boolean): void {
    this.usePatternOverlays = enabled;
    if (enabled) {
      this.createPatternOverlays();
    } else {
      this.clearPatternOverlays();
    }
  }

  /**
   * Update accessibility features based on current mode
   */
  private updateAccessibilityFeatures(): void {
    switch (this.accessibilityMode) {
      case 'colorBlind':
        this.applyColorBlindFriendlyColors();
        break;
      case 'highContrast':
        this.applyHighContrastColors();
        break;
      case 'patterns':
        this.setPatternOverlays(true);
        break;
      default:
        this.restoreNormalColors();
        this.setPatternOverlays(false);
        break;
    }
  }

  /**
   * Apply color-blind friendly color palette
   */
  private applyColorBlindFriendlyColors(): void {
    switch (this.colorBlindType) {
      case 'protanopia': // Red-blind
        this.elevationZones.high.color = new THREE.Color(0x2E7D32); // Dark green
        this.elevationZones.medium.color = new THREE.Color(0xFFC107); // Amber (yellow-orange)
        this.elevationZones.low.color = new THREE.Color(0xF5F5F5); // Light gray
        this.elevationZones.cut.color = new THREE.Color(0x1976D2); // Dark blue
        break;
      case 'deuteranopia': // Green-blind
        this.elevationZones.high.color = new THREE.Color(0x4FC3F7); // Light blue
        this.elevationZones.medium.color = new THREE.Color(0xFFB74D); // Orange
        this.elevationZones.low.color = new THREE.Color(0xF5F5F5); // Light gray
        this.elevationZones.cut.color = new THREE.Color(0x9C27B0); // Purple
        break;
      case 'tritanopia': // Blue-blind
        this.elevationZones.high.color = new THREE.Color(0x66BB6A); // Green
        this.elevationZones.medium.color = new THREE.Color(0xFF7043); // Deep orange
        this.elevationZones.low.color = new THREE.Color(0xF5F5F5); // Light gray
        this.elevationZones.cut.color = new THREE.Color(0xD32F2F); // Red
        break;
    }
  }

  /**
   * Apply high contrast colors for better visibility
   */
  private applyHighContrastColors(): void {
    this.elevationZones.high.color = new THREE.Color(0x00FF00); // Bright green
    this.elevationZones.medium.color = new THREE.Color(0xFFFF00); // Bright yellow
    this.elevationZones.low.color = new THREE.Color(0xFFFFFF); // White
    this.elevationZones.cut.color = new THREE.Color(0x0000FF); // Bright blue
  }

  /**
   * Restore normal color palette
   */
  private restoreNormalColors(): void {
    this.elevationZones.high.color = new THREE.Color(0x4CAF50); // Green
    this.elevationZones.medium.color = new THREE.Color(0xFF9800); // Orange
    this.elevationZones.low.color = new THREE.Color(0xFFF59D); // Light yellow
    this.elevationZones.cut.color = new THREE.Color(0x2196F3); // Blue
  }

  /**
   * Create pattern overlays for additional zone distinction
   */
  private createPatternOverlays(): void {
    // Pattern overlays completely disabled to prevent black grid appearance
    return;
    
    this.clearPatternOverlays();
    
    const vertices = this.geometry.attributes.position.array;
    
    // Create different patterns for each zone type
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      const height = vertices[i + 1];
      const zone = this.getElevationZone(height);
      
      // Create pattern based on zone type
      if (Math.abs(x % 5) < 0.2 || Math.abs(z % 5) < 0.2) { // Grid pattern
        let patternGeometry: THREE.BufferGeometry;
        let patternMaterial: THREE.Material;
        
        switch (zone.name) {
          case 'high': // Very light diagonal lines for high fill
            patternGeometry = new THREE.PlaneGeometry(0.2, 0.03);
            patternMaterial = new THREE.MeshBasicMaterial({ 
              color: 0xE0E0E0, // Very light gray
              transparent: true, 
              opacity: 0.08 // Very transparent
            });
            break;
          case 'medium': // Very light dots for medium fill
            patternGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.01, 6);
            patternMaterial = new THREE.MeshBasicMaterial({ 
              color: 0xDDDDDD, // Very light gray
              transparent: true, 
              opacity: 0.1 // Very transparent
            });
            break;
          case 'cut': // Very light cross-hatch for cut areas
            patternGeometry = new THREE.PlaneGeometry(0.15, 0.02);
            patternMaterial = new THREE.MeshBasicMaterial({ 
              color: 0xF0F0F0, // Almost white, very light gray
              transparent: true, 
              opacity: 0.12 // Very transparent
            });
            break;
          default:
            continue;
        }
        
        const patternMesh = new THREE.Mesh(patternGeometry, patternMaterial);
        patternMesh.position.set(x, height + 0.05, z);
        
        if (zone.name === 'high') {
          patternMesh.rotation.z = Math.PI / 4; // Diagonal orientation
        } else if (zone.name === 'cut') {
          patternMesh.rotation.y = Math.PI / 4; // Angled cross-hatch
        }
        
        this.terrainGroup.add(patternMesh);
        this.patternMeshes.push(patternMesh);
      }
    }
  }

  /**
   * Clear existing pattern overlays
   */
  private clearPatternOverlays(): void {
    this.patternMeshes.forEach(mesh => {
      this.terrainGroup.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    this.patternMeshes = [];
  }

  /**
   * Force disable all pattern overlays
   */
  public forceDisablePatterns(): void {
    this.usePatternOverlays = false;
    this.clearPatternOverlays();
    this.accessibilityMode = 'normal';
  }

  /**
   * Get accessibility-friendly zone description
   */
  public getAccessibleZoneDescription(height: number): string {
    const zone = this.getElevationZone(height);
    const relativeHeight = height - this.targetElevation;
    
    let description = '';
    switch (zone.name) {
      case 'high':
        description = `High fill zone: ${relativeHeight.toFixed(1)} feet above target. Requires excavation.`;
        break;
      case 'medium':
        description = `Medium fill zone: ${relativeHeight.toFixed(1)} feet above target. Moderate excavation needed.`;
        break;
      case 'low':
        description = `Target zone: ${relativeHeight.toFixed(1)} feet from target. Near optimal elevation.`;
        break;
      case 'cut':
        description = `Cut zone: ${Math.abs(relativeHeight).toFixed(1)} feet below target. Needs fill material.`;
        break;
    }
    
    // Add pattern information if enabled
    if (this.usePatternOverlays) {
      switch (zone.name) {
        case 'high':
          description += ' Visual pattern: diagonal lines.';
          break;
        case 'medium':
          description += ' Visual pattern: dots.';
          break;
        case 'cut':
          description += ' Visual pattern: cross-hatch.';
          break;
      }
    }
    
    return description;
  }

  /**
   * Get keyboard navigation instructions for terrain operations
   */
  public getKeyboardInstructions(): string {
    return `
      Terrain Navigation Instructions:
      • Tab: Navigate through tool buttons and controls
      • Enter/Space: Activate selected tool or button
      • Arrow keys: Move focus between terrain areas
      • Ctrl + Arrow keys: Apply current tool to focused area
      • 1-2: Quick brush size selection (1=Small, 2=Medium)
      • +/-: Adjust brush size
      • Ctrl+Z: Undo last operation
      • Ctrl+Y: Redo last operation
      • W: Toggle wireframe mode
      • X: Toggle grid display
      • R: Reset terrain
      • Escape: Cancel current operation
    `;
  }

  /**
   * Clear only persistent cut arrows (blue arrows)
   */
  public clearPersistentCutArrows(): void {
    // Filter out persistent cut arrows and remove them from scene
    const persistentCutArrows = this.arrows.filter(arrow => (arrow as any).isPersistentCut);
    
    persistentCutArrows.forEach(arrow => {
      this.terrainGroup.remove(arrow);
    });
    
    // Remove persistent cut arrows from the arrows array
    this.arrows = this.arrows.filter(arrow => !(arrow as any).isPersistentCut);
    
    console.log(`Cleared ${persistentCutArrows.length} persistent cut arrows`);
  }

  /**
   * Clear only persistent fill arrows (red arrows)
   */
  public clearPersistentFillArrows(): void {
    // Filter out persistent fill arrows and remove them from scene
    const persistentFillArrows = this.arrows.filter(arrow => (arrow as any).isPersistentFill);
    
    persistentFillArrows.forEach(arrow => {
      this.terrainGroup.remove(arrow);
    });
    
    // Remove persistent fill arrows from the arrows array
    this.arrows = this.arrows.filter(arrow => !(arrow as any).isPersistentFill);
    
    console.log(`Cleared ${persistentFillArrows.length} persistent fill arrows`);
  }

  /**
   * Clear all persistent arrows (both cut and fill)
   */
  public clearAllPersistentArrows(): void {
    const persistentArrows = this.arrows.filter(arrow => 
      (arrow as any).isPersistentCut || (arrow as any).isPersistentFill
    );
    
    persistentArrows.forEach(arrow => {
      this.terrainGroup.remove(arrow);
    });
    
    // Remove persistent arrows from the arrows array
    this.arrows = this.arrows.filter(arrow => 
      !(arrow as any).isPersistentCut && !(arrow as any).isPersistentFill
    );
    
    console.log(`Cleared ${persistentArrows.length} persistent arrows`);
  }

  /**
   * Clear all arrows (both persistent and temporary)
   */
  public clearAllArrows(): void {
    this.arrows.forEach(arrow => {
      this.terrainGroup.remove(arrow);
    });
    this.arrows = [];
    console.log('Cleared all arrows');
  }

  /**
   * Get count of persistent cut arrows
   */
  public getPersistentCutArrowCount(): number {
    return this.arrows.filter(arrow => (arrow as any).isPersistentCut).length;
  }

  /**
   * Get count of persistent fill arrows
   */
  public getPersistentFillArrowCount(): number {
    return this.arrows.filter(arrow => (arrow as any).isPersistentFill).length;
  }

  /**
   * Get total count of persistent arrows
   */
  public getTotalPersistentArrowCount(): number {
    return this.arrows.filter(arrow => 
      (arrow as any).isPersistentCut || (arrow as any).isPersistentFill
    ).length;
  }

  /**
   * Toggle visibility of persistent cut arrows
   */
  public togglePersistentCutArrows(visible: boolean): void {
    const persistentCutArrows = this.arrows.filter(arrow => (arrow as any).isPersistentCut);
    persistentCutArrows.forEach(arrow => {
      arrow.visible = visible;
    });
  }

  /**
   * Toggle visibility of persistent fill arrows
   */
  public togglePersistentFillArrows(visible: boolean): void {
    const persistentFillArrows = this.arrows.filter(arrow => (arrow as any).isPersistentFill);
    persistentFillArrows.forEach(arrow => {
      arrow.visible = visible;
    });
  }

  /**
   * Toggle visibility of all persistent arrows
   */
  public toggleAllPersistentArrows(visible: boolean): void {
    const persistentArrows = this.arrows.filter(arrow => 
      (arrow as any).isPersistentCut || (arrow as any).isPersistentFill
    );
    persistentArrows.forEach(arrow => {
      arrow.visible = visible;
    });
  }

  /**
   * Get current accessibility mode
   */
  public getAccessibilityMode(): 'normal' | 'colorBlind' | 'highContrast' | 'patterns' {
    return this.accessibilityMode;
  }

  /**
   * Get current color blind type
   */
  public getColorBlindType(): 'protanopia' | 'deuteranopia' | 'tritanopia' | 'normal' {
    return this.colorBlindType;
  }

  /**
   * Get pattern overlay status
   */
  public getPatternOverlaysEnabled(): boolean {
    return this.usePatternOverlays;
  }

  /**
   * Set camera reference for zoom-independent arrow scaling
   */
  public setCameraReference(camera: THREE.Camera): void {
    this.camera = camera;
    // Update all existing arrows when camera is set
    this.updateAllArrowScales();
  }

  /**
   * Update individual arrow scale based on camera distance for zoom-independent sizing
   * Note: Only applies to legacy arrows. New arrows use fixed sizes.
   */
  private updateArrowScale(arrow: THREE.ArrowHelper): void {
    if (!this.camera) return;
    
    // Skip fixed-size arrows
    if ((arrow as any).isFixedSize) return;
    
    // Calculate distance from camera to terrain center (50, 0, 50)
    const terrainCenter = new THREE.Vector3(50, 0, 50);
    const cameraDistance = this.camera.position.distanceTo(terrainCenter);
    
    // Calculate scale factor based on camera distance
    // Scale arrows to maintain consistent visual size
    // Base distance of 100 units = scale factor 1.0
    const baseDistance = 100;
    const scaleFactor = Math.max(0.3, Math.min(3.0, cameraDistance / baseDistance));
    
    // Apply scaling to arrow dimensions
    const originalLength = (arrow as any).originalLength || 5;
    const originalHeadLength = (arrow as any).originalHeadLength || 2;
    const originalHeadWidth = (arrow as any).originalHeadWidth || 1;
    
    const scaledLength = originalLength * scaleFactor;
    const scaledHeadLength = originalHeadLength * scaleFactor;
    const scaledHeadWidth = originalHeadWidth * scaleFactor;
    
    arrow.setLength(scaledLength, scaledHeadLength, scaledHeadWidth);
  }

  /**
   * Update all arrow scales based on current camera distance
   * Note: Only applies to legacy arrows. New arrows use fixed sizes.
   */
  public updateAllArrowScales(): void {
    if (!this.camera) return;
    
    this.arrows.forEach(arrow => {
      // Only update legacy arrows that don't have fixed size
      if (((arrow as any).isPersistentCut || (arrow as any).isPersistentFill) && !(arrow as any).isFixedSize) {
        this.updateArrowScale(arrow);
      }
    });
  }

  /**
   * Update arrow density when camera zoom changes
   * This would be called when camera position changes significantly
   */
  public onCameraZoomChanged(): void {
    // For now, we don't regenerate existing arrows on zoom change
    // The density will be applied to new arrows created during terrain modification
    // Future enhancement could implement dynamic arrow regeneration based on zoom
  }

  // ============================================================================
  // DATABASE PERSISTENCE METHODS
  // ============================================================================

  /**
   * Set user ID for database operations
   */
  public setUserId(userId: string): void {
    this.currentUserId = userId;
  }

  /**
   * Set session ID for database operations
   */
  public setSessionId(sessionId: string | null): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Enable or disable auto-save functionality
   */
  public setAutoSave(enabled: boolean): void {
    this.autoSaveEnabled = enabled;
  }

  /**
   * Save current terrain state to database
   */
  public async saveTerrainToDatabase(name?: string): Promise<boolean> {
    if (!this.currentUserId) {
      console.warn('Cannot save terrain: No user ID set');
      return false;
    }

    try {
      const terrainData = this.exportTerrain();
      const { error } = await supabase
        .from('terrain_states')
        .insert({
          user_id: this.currentUserId,
          session_id: this.currentSessionId,
          name: name || `Terrain_${new Date().toISOString().slice(0, 19).replace('T', '_')}`,
          terrain_data: terrainData,
          volume_data: terrainData.volume,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error saving terrain to database:', error);
        return false;
      }

      this.lastSaveTime = Date.now();
      console.log('Terrain saved to database successfully');
      return true;
    } catch (error) {
      console.error('Failed to save terrain to database:', error);
      return false;
    }
  }

  /**
   * Load terrain state from database
   */
  public async loadTerrainFromDatabase(terrainId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('terrain_states')
        .select('terrain_data')
        .eq('id', terrainId)
        .single();

      if (error || !data) {
        console.error('Error loading terrain from database:', error);
        return false;
      }

      this.importTerrain(data.terrain_data);
      console.log('Terrain loaded from database successfully');
      return true;
    } catch (error) {
      console.error('Failed to load terrain from database:', error);
      return false;
    }
  }

  /**
   * Get user's saved terrain states
   */
  public async getUserTerrainStates(): Promise<any[]> {
    if (!this.currentUserId) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('terrain_states')
        .select('id, name, created_at, volume_data')
        .eq('user_id', this.currentUserId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user terrain states:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Failed to fetch user terrain states:', error);
      return [];
    }
  }

  /**
   * Save individual terrain modification to database
   */
  public async saveModificationToDatabase(x: number, z: number, heightChange: number, tool: string): Promise<void> {
    if (!this.currentUserId) {
      // Store for batch save later if no user ID
      this.pendingModifications.push({ x, z, heightChange, tool });
      return;
    }

    try {
      const { error } = await supabase
        .from('terrain_modifications')
        .insert({
          session_id: this.currentSessionId,
          user_id: this.currentUserId,
          x: x,
          z: z,
          height_change: heightChange,
          tool: tool,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error saving terrain modification:', error);
      }
    } catch (error) {
      console.error('Failed to save terrain modification:', error);
    }
  }

  /**
   * Auto-save terrain if conditions are met
   */
  public async autoSaveIfNeeded(): Promise<void> {
    if (!this.autoSaveEnabled || !this.currentUserId) {
      return;
    }

    const now = Date.now();
    if (now - this.lastSaveTime >= this.saveThrottleMs) {
      await this.saveTerrainToDatabase(`AutoSave_${new Date().toISOString().slice(0, 19).replace('T', '_')}`);
    }
  }

  /**
   * Enhanced save current state - now saves to database too
   */
  public async saveCurrentState(): Promise<boolean> {
    const vertices = this.geometry.attributes.position.array;

    // Copy current terrain state to become new original/baseline
    for (let i = 0; i < vertices.length; i++) {
      this.originalVertices[i] = vertices[i];
    }

    // Clear all persistent arrows since we're establishing new baseline
    this.clearAllPersistentArrows();
    
    // Clear undo/redo stacks since we're establishing new baseline
    this.undoStack = [];
    this.redoStack = [];
    
    // Save this new state as the starting point
    this.saveState();
    
    // Force update the terrain colors and geometry
    this.updateTerrainColors();
    this.updateBlockGeometry();

    // Save to database as a checkpoint
    if (this.currentUserId) {
      const success = await this.saveTerrainToDatabase(`Checkpoint_${new Date().toISOString().slice(0, 19).replace('T', '_')}`);
      return success;
    }

    return true;
  }

  /**
   * Save any pending modifications when user ID becomes available
   */
  public async savePendingModifications(): Promise<void> {
    if (!this.currentUserId || this.pendingModifications.length === 0) {
      return;
    }

    try {
      const modifications = this.pendingModifications.map(mod => ({
        session_id: this.currentSessionId,
        user_id: this.currentUserId,
        x: mod.x,
        z: mod.z,
        height_change: mod.heightChange,
        tool: mod.tool,
        created_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('terrain_modifications')
        .insert(modifications);

      if (error) {
        console.error('Error saving pending modifications:', error);
      } else {
        this.pendingModifications = [];
        console.log(`Saved ${modifications.length} pending modifications`);
      }
    } catch (error) {
      console.error('Failed to save pending modifications:', error);
    }
  }

  /**
   * Load terrain modifications from database for a session
   */
  public async loadSessionModifications(sessionId: string): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('terrain_modifications')
        .select('x, z, height_change, tool, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading session modifications:', error);
        return;
      }

      if (data && data.length > 0) {
        // Apply modifications in chronological order
        for (const mod of data) {
          this.modifyHeightBrush(mod.x, mod.z, mod.height_change);
        }
        console.log(`Applied ${data.length} session modifications`);
      }
    } catch (error) {
      console.error('Failed to load session modifications:', error);
    }
  }

  /**
   * Delete old auto-saves to prevent database bloat
   */
  public async cleanupOldAutoSaves(): Promise<void> {
    if (!this.currentUserId) {
      return;
    }

    try {
      // Delete auto-saves older than 7 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      const { error } = await supabase
        .from('terrain_states')
        .delete()
        .eq('user_id', this.currentUserId)
        .like('name', 'AutoSave_%')
        .lt('created_at', cutoffDate.toISOString());

      if (error) {
        console.error('Error cleaning up old auto-saves:', error);
      }
    } catch (error) {
      console.error('Failed to cleanup old auto-saves:', error);
    }
  }

  /**
   * Create localized cut overlay for a specific modification area
   */
  private createLocalizedCutOverlay(centerX: number, centerZ: number, radius: number): void {
    // Calculate bounds for the overlay - constrain to terrain boundaries
    let bounds = {
      minX: Math.max(0, centerX - radius),
      maxX: Math.min(100, centerX + radius),
      minZ: Math.max(0, centerZ - radius),
      maxZ: Math.min(100, centerZ + radius)
    };

    // Check for overlapping existing cut areas to merge with
    let existingArea = null;
    for (const [key, area] of this.modificationAreas.entries()) {
      if (area.type === 'cut') {
        // Check if this new area overlaps with existing area
        const overlap = !(bounds.maxX < area.bounds.minX || 
                         bounds.minX > area.bounds.maxX || 
                         bounds.maxZ < area.bounds.minZ || 
                         bounds.minZ > area.bounds.maxZ);
        
        if (overlap) {
          existingArea = { key, area };
          break;
        }
      }
    }

    if (existingArea) {
      // Merge with existing area - expand bounds and recreate overlay
      const mergedBounds = {
        minX: Math.min(bounds.minX, existingArea.area.bounds.minX),
        maxX: Math.max(bounds.maxX, existingArea.area.bounds.maxX),
        minZ: Math.min(bounds.minZ, existingArea.area.bounds.minZ),
        maxZ: Math.max(bounds.maxZ, existingArea.area.bounds.maxZ)
      };
      
             // Remove old overlay
       if (existingArea.area.overlay) {
         this.terrainGroup.remove(existingArea.area.overlay);
         this.cutOverlays.splice(this.cutOverlays.indexOf(existingArea.area.overlay), 1);
       }
       this.modificationAreas.delete(existingArea.key);
       
       // Clear arrows in the merged area and recalculate
       this.clearArrowsInBounds(mergedBounds);
       
       // Use merged bounds for overlay creation
       bounds = mergedBounds;
       
       // Create new evenly distributed arrows for merged area
       this.createArrowsForMergedArea(mergedBounds, false); // false = cut arrows
     }

    // Calculate excavation volume dimensions
    const overlayWidth = bounds.maxX - bounds.minX;
    const overlayHeight = bounds.maxZ - bounds.minZ;
    
    // Sample heights to determine volume dimensions
    const samples = 5; // 5x5 grid of height samples
    let minExcavationDepth = 0;
    let maxExcavationDepth = 0;
    let avgOriginalHeight = 0;
    let avgCurrentHeight = 0;
    let sampleCount = 0;
    
    for (let sx = 0; sx < samples; sx++) {
      for (let sz = 0; sz < samples; sz++) {
        const sampleX = bounds.minX + (sx / (samples - 1)) * overlayWidth;
        const sampleZ = bounds.minZ + (sz / (samples - 1)) * overlayHeight;
        
        const originalHeight = this.getOriginalHeightAtPosition(sampleX, sampleZ);
        const currentHeight = this.getHeightAtPosition(sampleX, sampleZ);
        const excavationDepth = originalHeight - currentHeight;
        
        if (excavationDepth > 0.1) { // Only count significant excavation
          minExcavationDepth = Math.min(minExcavationDepth, excavationDepth);
          maxExcavationDepth = Math.max(maxExcavationDepth, excavationDepth);
          avgOriginalHeight += originalHeight;
          avgCurrentHeight += currentHeight;
          sampleCount++;
        }
      }
    }
    
    if (sampleCount === 0) return; // No significant excavation
    
    avgOriginalHeight /= sampleCount;
    avgCurrentHeight /= sampleCount;
    const avgExcavationDepth = avgOriginalHeight - avgCurrentHeight;
    
    // Create polyhedron geometry representing the excavated volume
    const geometry = new THREE.BoxGeometry(overlayWidth, avgExcavationDepth, overlayHeight);

    // Create red semitransparent material for cut volume - much more transparent
    const material = new THREE.MeshBasicMaterial({
      color: 0xFF4444,
      transparent: true,
      opacity: 0.25, // Much more transparent for better visibility
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Create overlay mesh - position it in the middle of the excavated volume
    const overlay = new THREE.Mesh(geometry, material);
    const volumeCenterHeight = avgCurrentHeight + (avgExcavationDepth / 2);
    overlay.position.set(centerX, volumeCenterHeight, centerZ);

         // Add to terrain group and track
     this.terrainGroup.add(overlay);
     this.cutOverlays.push(overlay);
     
     // Create area key for tracking
     const areaKey = `cut_${Math.round(centerX)}_${Math.round(centerZ)}_${Date.now()}`;
     this.modificationAreas.set(areaKey, { bounds, type: 'cut', overlay });
   }

   /**
    * Create localized fill overlay for a specific modification area
    */
   private createLocalizedFillOverlay(centerX: number, centerZ: number, radius: number): void {
     // Calculate bounds for the overlay - constrain to terrain boundaries
     let bounds = {
       minX: Math.max(0, centerX - radius),
       maxX: Math.min(100, centerX + radius),
       minZ: Math.max(0, centerZ - radius),
       maxZ: Math.min(100, centerZ + radius)
     };

     // Check for overlapping existing fill areas to merge with
     let existingArea = null;
     for (const [key, area] of this.modificationAreas.entries()) {
       if (area.type === 'fill') {
         // Check if this new area overlaps with existing area
         const overlap = !(bounds.maxX < area.bounds.minX || 
                          bounds.minX > area.bounds.maxX || 
                          bounds.maxZ < area.bounds.minZ || 
                          bounds.minZ > area.bounds.maxZ);
         
         if (overlap) {
           existingArea = { key, area };
           break;
         }
       }
     }

     if (existingArea) {
       // Merge with existing area - expand bounds and recreate overlay
       const mergedBounds = {
         minX: Math.min(bounds.minX, existingArea.area.bounds.minX),
         maxX: Math.max(bounds.maxX, existingArea.area.bounds.maxX),
         minZ: Math.min(bounds.minZ, existingArea.area.bounds.minZ),
         maxZ: Math.max(bounds.maxZ, existingArea.area.bounds.maxZ)
       };
       
       // Remove old overlay
       if (existingArea.area.overlay) {
         this.terrainGroup.remove(existingArea.area.overlay);
         this.fillOverlays.splice(this.fillOverlays.indexOf(existingArea.area.overlay), 1);
       }
       this.modificationAreas.delete(existingArea.key);
       
       // Clear arrows in the merged area and recalculate
       this.clearArrowsInBounds(mergedBounds);
       
       // Use merged bounds for overlay creation
       bounds = mergedBounds;
       
       // Create new evenly distributed arrows for merged area
       this.createArrowsForMergedArea(mergedBounds, true); // true = fill arrows
     }

     // Calculate fill volume dimensions
     const overlayWidth = bounds.maxX - bounds.minX;
     const overlayHeight = bounds.maxZ - bounds.minZ;
     
     // Sample heights to determine volume dimensions
     const samples = 5; // 5x5 grid of height samples
     let minFillHeight = 0;
     let maxFillHeight = 0;
     let avgOriginalHeight = 0;
     let avgCurrentHeight = 0;
     let sampleCount = 0;
     
     for (let sx = 0; sx < samples; sx++) {
       for (let sz = 0; sz < samples; sz++) {
         const sampleX = bounds.minX + (sx / (samples - 1)) * overlayWidth;
         const sampleZ = bounds.minZ + (sz / (samples - 1)) * overlayHeight;
         
         const originalHeight = this.getOriginalHeightAtPosition(sampleX, sampleZ);
         const currentHeight = this.getHeightAtPosition(sampleX, sampleZ);
         const fillHeight = currentHeight - originalHeight;
         
         if (fillHeight > 0.1) { // Only count significant filling
           minFillHeight = Math.min(minFillHeight, fillHeight);
           maxFillHeight = Math.max(maxFillHeight, fillHeight);
           avgOriginalHeight += originalHeight;
           avgCurrentHeight += currentHeight;
           sampleCount++;
         }
       }
     }
     
     if (sampleCount === 0) return; // No significant filling
     
     avgOriginalHeight /= sampleCount;
     avgCurrentHeight /= sampleCount;
     const avgFillHeight = avgCurrentHeight - avgOriginalHeight;
     
     // Create polyhedron geometry representing the filled volume
     const geometry = new THREE.BoxGeometry(overlayWidth, avgFillHeight, overlayHeight);

     // Create blue semitransparent material for fill volume
     const material = new THREE.MeshBasicMaterial({
       color: 0x4444FF,
       transparent: true,
       opacity: 0.4,
       side: THREE.DoubleSide,
       depthWrite: false,
     });

     // Create overlay mesh - position it in the middle of the filled volume
     const overlay = new THREE.Mesh(geometry, material);
     const volumeCenterHeight = avgOriginalHeight + (avgFillHeight / 2);
     overlay.position.set(centerX, volumeCenterHeight, centerZ);

            // Add to terrain group and track
       this.terrainGroup.add(overlay);
       this.fillOverlays.push(overlay);
       
       // Create area key for tracking
       const areaKey = `fill_${Math.round(centerX)}_${Math.round(centerZ)}_${Date.now()}`;
       this.modificationAreas.set(areaKey, { bounds, type: 'fill', overlay });
   }

   /**
    * Clean up all localized overlays
    */
   private cleanupAllOverlays(): void {
     // Remove all cut overlays
     this.cutOverlays.forEach(overlay => {
       this.terrainGroup.remove(overlay);
       overlay.geometry.dispose();
       (overlay.material as THREE.Material).dispose();
     });
     this.cutOverlays = [];

     // Remove all fill overlays
     this.fillOverlays.forEach(overlay => {
       this.terrainGroup.remove(overlay);
       overlay.geometry.dispose();
       (overlay.material as THREE.Material).dispose();
     });
     this.fillOverlays = [];

     // Clear modification areas
     this.modificationAreas.clear();
   }

   /**
    * Toggle visibility of all fill overlays
    */
   public toggleFillVolumeOverlay(visible: boolean): void {
     this.showFillVolumeOverlay = visible;
     this.fillOverlays.forEach(overlay => {
       overlay.visible = visible;
     });
   }

   /**
    * Get original terrain overlay visibility status
    */
   public isOriginalTerrainOverlayVisible(): boolean {
     return this.showOriginalTerrainOverlay;
   }

   /**
    * Get fill volume overlay visibility status
    */
   public isFillVolumeOverlayVisible(): boolean {
     return this.showFillVolumeOverlay;
   }

  /**
   * Toggle visibility of all cut overlays
   */
  public toggleOriginalTerrainOverlay(visible: boolean): void {
    this.showOriginalTerrainOverlay = visible;
    this.cutOverlays.forEach(overlay => {
      overlay.visible = visible;
    });
  }

  /**
   * Update overlay visibility based on height differences (only show where excavated)
   * NOTE: This function is disabled due to legacy property references that need refactoring
   */
  private updateOverlayVisibilityByHeight(): void {
    // TODO: Refactor this function to use the current localized overlay system
    // The original implementation referenced non-existent properties
    return;
  }

  /**
   * Toggle original terrain overlay visibility
   */
  public toggleOriginalTerrainOverlay(visible: boolean): void {
    this.showOriginalTerrainOverlay = visible;
    this.updateOriginalTerrainOverlay();
  }

  /**
   * Get original terrain overlay visibility status
   */
  public isOriginalTerrainOverlayVisible(): boolean {
    return this.showOriginalTerrainOverlay;
  }

  /**
   * Get height at position from original terrain before any modifications
   */
  private getOriginalHeightAtPosition(x: number, z: number): number {
    const vertices = this.originalVertices;
    const widthSegments = this.geometry.parameters.widthSegments;
    const heightSegments = this.geometry.parameters.heightSegments;
    const width = this.geometry.parameters.width;
    const height = this.geometry.parameters.height;

    // Clamp coordinates to terrain bounds
    const clampedX = Math.max(0, Math.min(width, x));
    const clampedZ = Math.max(0, Math.min(height, z));

    // Calculate grid position
    const gridX = (clampedX / width) * widthSegments;
    const gridZ = (clampedZ / height) * heightSegments;

    // Get surrounding vertices for bilinear interpolation
    const x1 = Math.floor(gridX);
    const x2 = Math.min(widthSegments, x1 + 1);
    const z1 = Math.floor(gridZ);
    const z2 = Math.min(heightSegments, z1 + 1);

    // Calculate vertex indices
    const i1 = (z1 * (widthSegments + 1) + x1) * 3;
    const i2 = (z1 * (widthSegments + 1) + x2) * 3;
    const i3 = (z2 * (widthSegments + 1) + x1) * 3;
    const i4 = (z2 * (widthSegments + 1) + x2) * 3;

    // Get heights at corners
    const h1 = vertices[i1 + 1];
    const h2 = vertices[i2 + 1];
    const h3 = vertices[i3 + 1];
    const h4 = vertices[i4 + 1];

    // Bilinear interpolation
    const fx = gridX - x1;
    const fz = gridZ - z1;

    const h12 = h1 * (1 - fx) + h2 * fx;
    const h34 = h3 * (1 - fx) + h4 * fx;
    const interpolatedHeight = h12 * (1 - fz) + h34 * fz;

    return interpolatedHeight;
  }

  /**
   * Clean up original terrain overlay
   */
  private cleanupOriginalTerrainOverlay(): void {
    if (this.originalTerrainOverlay) {
      this.terrainGroup.remove(this.originalTerrainOverlay);
      this.originalTerrainOverlay = null;
    }
    if (this.originalTerrainGeometry) {
      this.originalTerrainGeometry.dispose();
      this.originalTerrainGeometry = null;
    }
    if (this.originalTerrainMaterial) {
      this.originalTerrainMaterial.dispose();
      this.originalTerrainMaterial = null;
    }
  }

  /**
   * Create blue semitransparent overlay showing filled volume above original terrain
   */
  private createFillVolumeOverlay(): void {
    if (this.fillVolumeOverlay) {
      this.terrainGroup.remove(this.fillVolumeOverlay);
      this.fillVolumeOverlay = null;
    }

    // Create geometry matching the current terrain structure
    const width = this.geometry.parameters.width;
    const height = this.geometry.parameters.height;
    const widthSegments = this.geometry.parameters.widthSegments;
    const heightSegments = this.geometry.parameters.heightSegments;

    this.fillVolumeGeometry = new THREE.PlaneGeometry(
      width,
      height,
      widthSegments,
      heightSegments
    );

    // Apply same transformations as main terrain
    this.fillVolumeGeometry.rotateX(-Math.PI / 2);
    this.fillVolumeGeometry.translate(width/2, 0, height/2);

    // Set vertices to current terrain heights (showing filled areas)
    const overlayVertices = this.fillVolumeGeometry.attributes.position.array;
    const currentVertices = this.geometry.attributes.position.array;
    for (let i = 0; i < overlayVertices.length; i++) {
      overlayVertices[i] = currentVertices[i];
    }
    this.fillVolumeGeometry.attributes.position.needsUpdate = true;
    this.fillVolumeGeometry.computeVertexNormals();

    // Create blue semitransparent material with flat shading
    this.fillVolumeMaterial = new THREE.MeshBasicMaterial({
      color: 0x4444FF, // Blue color matching fill tool
      transparent: true,
      opacity: 0.3, // Semitransparent
      side: THREE.DoubleSide, // Visible from both sides
      depthWrite: false, // Allow seeing through to terrain below
    });

    // Create overlay mesh
    this.fillVolumeOverlay = new THREE.Mesh(
      this.fillVolumeGeometry,
      this.fillVolumeMaterial
    );

    // Position higher above the terrain to ensure visibility
    this.fillVolumeOverlay.position.y = 0.6;

    // Add to terrain group
    this.terrainGroup.add(this.fillVolumeOverlay);
  }

  /**
   * Update fill volume overlay visibility and opacity
   */
  public updateFillVolumeOverlay(): void {
    // Only create overlay if it should be visible
    if (!this.fillVolumeOverlay && this.showFillVolumeOverlay) {
      this.createFillVolumeOverlay();
    }

    if (this.fillVolumeOverlay) {
      this.fillVolumeOverlay.visible = this.showFillVolumeOverlay;
      
      if (this.showFillVolumeOverlay) {
        // Update geometry to show current terrain heights
        const overlayVertices = this.fillVolumeGeometry!.attributes.position.array;
        const currentVertices = this.geometry.attributes.position.array;
        for (let i = 0; i < overlayVertices.length; i++) {
          overlayVertices[i] = currentVertices[i];
        }
        this.fillVolumeGeometry!.attributes.position.needsUpdate = true;
        this.fillVolumeGeometry!.computeVertexNormals();
        
        // Only show overlay where there has been filling (current terrain above original)
        this.updateFillOverlayVisibilityByHeight();
      }
    }
  }

  /**
   * Update fill overlay visibility based on height differences (only show where filled)
   */
  private updateFillOverlayVisibilityByHeight(): void {
    if (!this.fillVolumeOverlay || !this.fillVolumeGeometry) return;

    const currentVertices = this.geometry.attributes.position.array;
    const originalVertices = this.originalVertices;
    const overlayVertices = this.fillVolumeGeometry.attributes.position.array;

    // Create colors array for vertex-based visibility control (RGBA for alpha support)
    const colors = new Float32Array((overlayVertices.length / 3) * 4); // RGBA format
    
    let hasAnyFilling = false;
    
    for (let i = 0, colorIndex = 0; i < overlayVertices.length; i += 3, colorIndex += 4) {
      const currentHeight = currentVertices[i + 1];
      const originalHeight = originalVertices[i + 1];
      
      // Show overlay (full opacity) where filling occurred
      // Hide overlay (transparent) where no filling occurred
      const heightDifference = currentHeight - originalHeight;
      const showOverlay = heightDifference > 0.1; // Only show if filled by more than 0.1 feet
      
      if (showOverlay) {
        hasAnyFilling = true;
        // Blue color with full opacity
        colors[colorIndex] = 0.27;    // R (matching #4444FF)
        colors[colorIndex + 1] = 0.27; // G (matching #4444FF)
        colors[colorIndex + 2] = 1.0;  // B (matching #4444FF)
        colors[colorIndex + 3] = 1.0;  // A (full opacity)
      } else {
        // Transparent (invisible)
        colors[colorIndex] = 0.27;    // R
        colors[colorIndex + 1] = 0.27; // G
        colors[colorIndex + 2] = 1.0;  // B
        colors[colorIndex + 3] = 0.0;  // A (fully transparent)
      }
    }

    // If no filling anywhere, hide the entire overlay
    if (!hasAnyFilling) {
      this.fillVolumeOverlay.visible = false;
      return;
    }

    this.fillVolumeOverlay.visible = this.showFillVolumeOverlay;

    // Apply vertex colors with alpha
    if (!this.fillVolumeGeometry.attributes.color) {
      this.fillVolumeGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    } else {
      const colorAttribute = this.fillVolumeGeometry.attributes.color as THREE.BufferAttribute;
      colorAttribute.array = colors;
      colorAttribute.needsUpdate = true;
    }

    // Enable vertex colors and alpha on material
    if (this.fillVolumeMaterial) {
      this.fillVolumeMaterial.vertexColors = true;
      this.fillVolumeMaterial.transparent = true;
    }
  }

  /**
   * Toggle fill volume overlay visibility
   */
  public toggleFillVolumeOverlay(visible: boolean): void {
    this.showFillVolumeOverlay = visible;
    this.updateFillVolumeOverlay();
  }

  /**
   * Get fill volume overlay visibility status
   */
  public isFillVolumeOverlayVisible(): boolean {
    return this.showFillVolumeOverlay;
  }

  /**
   * Clean up fill volume overlay
   */
  private cleanupFillVolumeOverlay(): void {
    if (this.fillVolumeOverlay) {
      this.terrainGroup.remove(this.fillVolumeOverlay);
      this.fillVolumeOverlay = null;
    }
    if (this.fillVolumeGeometry) {
      this.fillVolumeGeometry.dispose();
      this.fillVolumeGeometry = null;
    }
    if (this.fillVolumeMaterial) {
      this.fillVolumeMaterial.dispose();
      this.fillVolumeMaterial = null;
    }
  }
}
