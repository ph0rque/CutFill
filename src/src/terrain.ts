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
  private blockDepth: number = 30; // 30 feet = 10 yards depth
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

  // Camera reference for zoom-independent arrow scaling
  private camera: THREE.Camera | null = null;

  // Performance optimization flags
  private performanceMode: boolean = false;
  private skipExpensiveOperations: boolean = false;

  // Contour line properties
  private contourLines: THREE.Line[] = [];
  private contourLabels: THREE.Sprite[] = [];
  private contourLinesVisible: boolean = true;
  private contourLabelsVisible: boolean = true; // Track label visibility separately
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

  // Planning mode properties
  private planningMode: boolean = true; // plan-first workflow enabled by default
  private plannedStrokes: Array<{ x:number; z:number; radius:number; heightChange:number; type:'cut'|'fill'; boundary: {x:number; z:number}[] }> = [];

  // add property
  private suppressOverlays: boolean = false;

  constructor(
    width: number = 120,  // 120 feet = 40 yards
    height: number = 120, // 120 feet = 40 yards  
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

    // Create optimized 3D terrain block structure
    this.create3DTerrainBlockOptimized(width, height);

    // Add all parts to the group
    this.terrainGroup.add(this.surfaceMesh);

    // Generate initial terrain
    this.regenerateTerrain();
    
    // Force color update to ensure new depth-based gradient is applied
    this.updateTerrainColors();
    
    // Generate initial contour lines with dynamic adjustment
    this.generateContourLines();
    
    // Ensure contour labels are initially visible
    this.contourLabelsVisible = true;
    
    // Set up initial dynamic contour calculation
    if (this.camera) {
      this.updateContoursForZoom();
    }
    
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
   * Create an optimized 3D terrain block with dramatically reduced complexity
   */
  private create3DTerrainBlockOptimized(width: number, height: number): void {
    // PERFORMANCE OPTIMIZATION: Use much lower resolution for 3D block
    // Surface remains high-res (32x32), but block uses only 8x8 for massive performance gain
    const blockWidthSegments = 8;  // Reduced from 32 to 8 
    const blockHeightSegments = 8; // Reduced from 32 to 8
    const verticalLayers = 4;      // Reduced from 33 to 4 layers (every 8 feet instead of 1 foot)

    // Create low-resolution geometry for the 3D block
    const blockGeometry = new THREE.BufferGeometry();
    
    // Sample terrain heights at lower resolution for block
    const levelVertexCount = (blockWidthSegments + 1) * (blockHeightSegments + 1);
    const totalVertices = (verticalLayers + 1) * levelVertexCount;
    const positions = new Float32Array(totalVertices * 3);
    const indices = [];
    
    // Create vertices for each vertical level
    for (let layer = 0; layer <= verticalLayers; layer++) {
      const layerDepth = -(this.blockDepth * (layer / verticalLayers));
      
      for (let row = 0; row <= blockHeightSegments; row++) {
        for (let col = 0; col <= blockWidthSegments; col++) {
          const vertexIndex = (layer * levelVertexCount + row * (blockWidthSegments + 1) + col) * 3;
          
          // Sample terrain height at this low-res position
          const worldX = (col / blockWidthSegments) * width;
          const worldZ = (row / blockHeightSegments) * height;
          const terrainHeight = this.getHeightAtPosition(worldX, worldZ);
          
          positions[vertexIndex] = worldX;     // x
          positions[vertexIndex + 2] = worldZ; // z
          
          if (layer === 0) {
            // Top layer: follows terrain surface
            positions[vertexIndex + 1] = terrainHeight - 0.005;
          } else {
            // FIXED: Lower layers should be completely flat at fixed depths
            // Use a consistent base elevation (0) for all bottom layers
            const baseElevation = 0; // Flat reference level
            positions[vertexIndex + 1] = baseElevation + layerDepth;
          }
        }
      }
    }
    
    // Create simplified wall faces (only outer perimeter)
    for (let layer = 0; layer < verticalLayers; layer++) {
      const topOffset = layer * levelVertexCount;
      const bottomOffset = (layer + 1) * levelVertexCount;
      
      // Front edge
      for (let col = 0; col < blockWidthSegments; col++) {
        const topLeft = topOffset + (blockHeightSegments * (blockWidthSegments + 1) + col);
        const topRight = topLeft + 1;
        const bottomLeft = bottomOffset + (blockHeightSegments * (blockWidthSegments + 1) + col);
        const bottomRight = bottomLeft + 1;
        
        indices.push(topLeft, bottomLeft, topRight);
        indices.push(topRight, bottomLeft, bottomRight);
      }
      
      // Back edge
      for (let col = 0; col < blockWidthSegments; col++) {
        const topLeft = topOffset + col;
        const topRight = topLeft + 1;
        const bottomLeft = bottomOffset + col;
        const bottomRight = bottomLeft + 1;
        
        indices.push(topRight, bottomLeft, topLeft);
        indices.push(bottomRight, bottomLeft, topRight);
      }
      
      // Left and right edges
      for (let row = 0; row < blockHeightSegments; row++) {
        // Left edge
        const leftTopTop = topOffset + (row * (blockWidthSegments + 1));
        const leftTopBottom = leftTopTop + (blockWidthSegments + 1);
        const leftBottomTop = bottomOffset + (row * (blockWidthSegments + 1));
        const leftBottomBottom = leftBottomTop + (blockWidthSegments + 1);
        
        indices.push(leftTopTop, leftBottomTop, leftTopBottom);
        indices.push(leftTopBottom, leftBottomTop, leftBottomBottom);
        
        // Right edge
        const rightTopTop = topOffset + (row * (blockWidthSegments + 1) + blockWidthSegments);
        const rightTopBottom = rightTopTop + (blockWidthSegments + 1);
        const rightBottomTop = bottomOffset + (row * (blockWidthSegments + 1) + blockWidthSegments);
        const rightBottomBottom = rightBottomTop + (blockWidthSegments + 1);
        
        indices.push(rightTopBottom, rightBottomTop, rightTopTop);
        indices.push(rightBottomBottom, rightBottomTop, rightTopBottom);
      }
    }
    
    // Create bottom face
    const bottomLevelOffset = verticalLayers * levelVertexCount;
    for (let row = 0; row < blockHeightSegments; row++) {
      for (let col = 0; col < blockWidthSegments; col++) {
        const topLeft = bottomLevelOffset + (row * (blockWidthSegments + 1) + col);
        const topRight = topLeft + 1;
        const bottomLeft = topLeft + (blockWidthSegments + 1);
        const bottomRight = bottomLeft + 1;
        
        indices.push(bottomLeft, topRight, topLeft);
        indices.push(bottomLeft, bottomRight, topRight);
      }
    }
    
    blockGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    blockGeometry.setIndex(indices);
    
    // Use faster normal calculation
    blockGeometry.computeVertexNormals();
    
    // Simplified material without vertex colors for better performance
    const earthMaterial = new THREE.MeshLambertMaterial({
      color: 0x8B5A2B,
      side: THREE.DoubleSide
    });
    
    const terrainBlock = new THREE.Mesh(blockGeometry, earthMaterial);
    
    this.wallMeshes = [terrainBlock];
    this.terrainGroup.add(terrainBlock);
    this.surfaceMesh.position.y = 0;
    
    console.log(`🚀 Optimized 3D terrain: ${totalVertices} vertices (vs ${(32+1)*(32+1)*(33+1)} in old version)`);
  }

  /**
   * Enable/disable performance mode for real-time operations
   */
  public setPerformanceMode(enabled: boolean): void {
    this.performanceMode = enabled;
    this.skipExpensiveOperations = enabled;
    
    // When disabling performance mode, force a complete update
    if (!enabled) {
      this.forceCompleteUpdate();
    }
    
    console.log(`🚀 Performance mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Force a complete terrain update with all visual effects
   */
  public forceCompleteUpdate(): void {
    console.log('🔄 Forcing complete terrain update...');
    this.updateTerrainColors();
    this.updateBlockGeometry();
    this.generateContourLines();
    console.log('✅ Complete terrain update finished');
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

    // Update original vertices to match the new terrain for accurate volume calculations
    this.originalVertices = new Float32Array(vertices);

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
      color: 0x000000, // Changed to black
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
    this.createContourLabels(points, new THREE.Color(0x000000)); // Use black for labels too
  }

  /**
   * Create elevation labels for a contour line with dynamic spacing
   */
  private createContourLabels(points: THREE.Vector3[], color: THREE.Color): void {
    if (points.length < 2) return;
    
    // Don't create labels if they're supposed to be hidden
    if (!this.contourLabelsVisible) return;
    
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
    // Convert elevation from feet to yards and format text
    const elevationInYards = elevation / 3;
    const elevationText = elevationInYards >= 0 ? `+${elevationInYards.toFixed(1)}yd` : `${elevationInYards.toFixed(1)}yd`;
    
    // Create canvas for text
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return null;
    
    // Dynamic canvas size based on camera distance
    const cameraDistance = this.camera ? this.camera.position.distanceTo(new THREE.Vector3(50, 0, 50)) : 100;
    const scale = Math.max(0.5, Math.min(1.5, 100 / cameraDistance)); // Scale text based on distance
    
    canvas.width = 96 * scale; // Doubled from 48
    canvas.height = 40 * scale; // Doubled from 20
    
    // Style the text
    context.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent background
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add border
    context.strokeStyle = '#' + lineColor.getHexString();
    context.lineWidth = 1;
    context.strokeRect(0, 0, canvas.width, canvas.height);
    
    // Add text
    context.fillStyle = '#FFFFFF'; // White text for good contrast
    context.font = `bold ${20 * scale}px Arial`; // Doubled font size from 10
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
    sprite.scale.set(8 * scale, 4 * scale, 1); // Doubled scale from 4x2
    sprite.renderOrder = 1003; // Render above axes
    sprite.name = 'contourLabel';
    
    return sprite;
  }

  /**
   * Clear all existing contour lines
   */
  public clearContourLines(): void {
    this.contourLines.forEach(line => {
      if (line) {
        this.terrainGroup.remove(line);
        if (line.geometry) {
          line.geometry.dispose();
        }
        if (line.material && typeof (line.material as THREE.Material).dispose === 'function') {
          (line.material as THREE.Material).dispose();
        }
      }
    });
    this.contourLines = [];
    
    // Clear elevation labels
    this.contourLabels.forEach(label => {
      if (label) {
        this.terrainGroup.remove(label);
        if (label.material && typeof label.material.dispose === 'function') {
          label.material.dispose();
        }
      }
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
   * Set contour label visibility independently
   */
  public setContourLabelsVisible(visible: boolean): void {
    this.contourLabelsVisible = visible;
    
    if (visible) {
      // When turning labels back on, check if we have any labels to show
      // If not, regenerate them from existing contour lines
      if (this.contourLabels.length === 0 && this.contourLines.length > 0) {
        console.log('Regenerating contour labels after toggle on');
        this.regenerateLabelsFromContourLines();
      } else {
        // Just make existing labels visible
        this.contourLabels.forEach(label => {
          label.visible = visible;
        });
      }
    } else {
      // When turning labels off, just hide them
      this.contourLabels.forEach(label => {
        label.visible = visible;
      });
    }
  }

  /**
   * Regenerate labels from existing contour lines
   */
  private regenerateLabelsFromContourLines(): void {
    // Clear any existing labels first
    this.contourLabels.forEach(label => {
      if (label) {
        this.terrainGroup.remove(label);
        if (label.material && typeof label.material.dispose === 'function') {
          label.material.dispose();
        }
      }
    });
    this.contourLabels = [];
    
    // Regenerate labels for each existing contour line
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

  /**
   * Get current contour label visibility state
   */
  public getContourLabelsVisible(): boolean {
    return this.contourLabelsVisible;
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
          if (label) {
            this.terrainGroup.remove(label);
            if (label.material && typeof label.material.dispose === 'function') {
              label.material.dispose();
            }
          }
        });
        this.contourLabels = [];
        
        // Regenerate labels with current camera-based spacing (only if labels should be visible)
        if (this.contourLabelsVisible) {
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
    
    // Calculate colors for each vertex using material layers
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1]; // Height/depth
      const color = this.getColorAtElevation(y);
      wallColors[i] = color.r;
      wallColors[i + 1] = color.g;
      wallColors[i + 2] = color.b;
    }
    
    wallGeometry.setAttribute('color', new THREE.BufferAttribute(wallColors, 3));
    wallGeometry.attributes.color.needsUpdate = true;
    
    // Update material to use vertex colors
    const wallMaterial = this.wallMeshes[0].material as THREE.MeshLambertMaterial;
    wallMaterial.vertexColors = true;
    wallMaterial.needsUpdate = true;
  }

  /**
   * Enhanced brush-based terrain modification with intelligent arrow placement
   */
  public modifyHeightBrush(x: number, z: number, heightChange: number): void {
    // Planning-mode short-circuit: only create overlays & store planned stroke
    if (this.planningMode) {
      const brushRadius = this.brushSettings.size;
      // Collect affected samples to compute boundary
      const vertices = this.geometry.attributes.position.array;
      const points2D: {x:number; z:number}[] = [];
      for (let i = 0; i < vertices.length; i += 3) {
        const vx = vertices[i];
        const vz = vertices[i + 2];
        const dx = vx - x;
        const dz = vz - z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if(this.isInBrush(dist, dx, dz)) {
          points2D.push({x:vx, z:vz});
        }
      }
      const boundary = this.computeConvexHull(points2D);

      let overlay:THREE.Object3D | null = null;
      if(heightChange<0){ overlay = this.createOutlineOverlay(boundary,'cut'); }
      else if(heightChange>0){ overlay = this.createOutlineOverlay(boundary,'fill'); }
      if(overlay){ this.terrainGroup.add(overlay); if(heightChange<0) this.cutOverlays.push(overlay as any); else this.fillOverlays.push(overlay as any); }

      this.plannedStrokes.push({x, z, radius: brushRadius, heightChange, type: heightChange<0?'cut':'fill', boundary});
      return;
    }

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
        
        // Apply 5-foot depth/height limits from original terrain
        const originalHeight = this.originalVertices[i + 1];
        const existingHeight = vertices[i + 1];
        const newHeight = existingHeight + actualChange;
        
        // Calculate change from original terrain
        const changeFromOriginal = newHeight - originalHeight;
        
        // Apply 20-foot limits for cut and fill operations
        const maxCutDepth = -6.67; // 6.67 yards below original (was 20 feet)
        const maxFillHeight = 6.67; // 6.67 yards above original (was 20 feet)
        
        let limitedNewHeight = newHeight;
        
        if (changeFromOriginal < maxCutDepth) {
          // Limit cut to 20 feet below original
          limitedNewHeight = originalHeight + maxCutDepth;
        } else if (changeFromOriginal > maxFillHeight) {
          // Limit fill to 20 feet above original
          limitedNewHeight = originalHeight + maxFillHeight;
        }
        
        // Also ensure we don't dig through the terrain block bottom
        const maxExcavationDepth = -this.blockDepth * 0.9; // About 22.5 feet with 25-foot block
        limitedNewHeight = Math.max(maxExcavationDepth, limitedNewHeight);
        
        vertices[i + 1] = limitedNewHeight;
        
        totalVolumeChange += Math.abs(actualChange);
        modified = true;
      }
    }

    if (modified) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.computeVertexNormals();
      
      // Skip expensive operations in performance mode for real-time responsiveness
      if (!this.skipExpensiveOperations) {
        this.updateTerrainColors();
        this.updateBlockGeometry();
        this.generateContourLines();
        
        // Auto-enable overlays and create localized overlays for modification area
        if (heightChange < 0) {
          this.showOriginalTerrainOverlay = true;
          this.createLocalizedCutOverlay(x, z, brushRadius);
        } else if (heightChange > 0) {
          this.showFillVolumeOverlay = true;
          this.createLocalizedFillOverlay(x, z, brushRadius, heightChange);
        }
      }

      // Removed arrow creation: this.createDensityBasedArrows(x, z, heightChange, totalVolumeChange, brushRadius);
    }
  }

  /**
   * Get height at a specific X,Z position using interpolation
   */
  public getHeightAtPosition(x: number, z: number): number {
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
   * Update terrain height at a specific position for precision tools
   */
  public modifyHeightAtPosition(x: number, z: number, heightChange: number): void {
    // Get grid dimensions
    const widthSegments = this.geometry.parameters.widthSegments;
    const heightSegments = this.geometry.parameters.heightSegments;
    
    // Convert world coordinates to grid coordinates
    // Terrain spans from 0 to 120 in both X and Z directions
    const gridX = Math.round((x / 120) * widthSegments);
    const gridZ = Math.round((z / 120) * heightSegments);
    
    // Check bounds
    if (gridX < 0 || gridX > widthSegments || gridZ < 0 || gridZ > heightSegments) {
      return;
    }
    
    // Calculate vertex index
    const index = gridZ * (widthSegments + 1) + gridX;
    
    // Apply the height change directly to the vertex
    const vertices = this.geometry.attributes.position.array as Float32Array;
    if (index * 3 + 1 < vertices.length) {
      vertices[index * 3 + 1] += heightChange;
      
      // Mark geometry as needing update
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.computeVertexNormals();
      
      // Update terrain colors and contours (skip expensive operations in performance mode)
      if (!this.skipExpensiveOperations) {
        this.updateTerrainColors();
        this.generateContourLines();
        this.updateBlockGeometry();
      }
    }
  }

  /**
   * Check depth/height limits at a position for visual feedback
   */
  public getDepthLimitsAtPosition(x: number, z: number): {
    currentDepth: number;
    remainingCutDepth: number;
    remainingFillHeight: number;
    atCutLimit: boolean;
    atFillLimit: boolean;
  } {
    const currentHeight = this.getHeightAtPosition(x, z);
    const originalHeight = this.getOriginalHeightAtPosition(x, z);
    const changeFromOriginal = currentHeight - originalHeight;
    
    const maxCutDepth = -5.0;
    const maxFillHeight = 5.0;
    
    const remainingCutDepth = Math.max(0, changeFromOriginal - maxCutDepth);
    const remainingFillHeight = Math.max(0, maxFillHeight - changeFromOriginal);
    
    return {
      currentDepth: changeFromOriginal,
      remainingCutDepth,
      remainingFillHeight,
      atCutLimit: changeFromOriginal <= maxCutDepth + 0.1, // Small tolerance
      atFillLimit: changeFromOriginal >= maxFillHeight - 0.1
    };
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
   * Update the optimized 3D block geometry to match current terrain heights
   */
  private updateBlockGeometry(): void {
    if (this.wallMeshes.length === 0) return;
    
    const blockGeometry = this.wallMeshes[0].geometry as THREE.BufferGeometry;
    const positions = blockGeometry.attributes.position.array as Float32Array;
    
    // PERFORMANCE OPTIMIZATION: Update only the top layer vertices at low resolution
    // Block uses 8x8 grid instead of full 32x32 terrain resolution
    const blockWidthSegments = 8;
    const blockHeightSegments = 8;
    const verticalLayers = 4;
    const levelVertexCount = (blockWidthSegments + 1) * (blockHeightSegments + 1);
    
    // Update only the top layer (layer 0) vertices
    for (let row = 0; row <= blockHeightSegments; row++) {
      for (let col = 0; col <= blockWidthSegments; col++) {
        const vertexIndex = (row * (blockWidthSegments + 1) + col) * 3;
        
        // Sample terrain height at this low-res position
        const worldX = (col / blockWidthSegments) * 100; // terrain width
        const worldZ = (row / blockHeightSegments) * 100; // terrain height
        const terrainHeight = this.getHeightAtPosition(worldX, worldZ);
        
        // Update all layers for this column
        for (let layer = 0; layer <= verticalLayers; layer++) {
          const layerVertexIndex = (layer * levelVertexCount + row * (blockWidthSegments + 1) + col) * 3;
          const layerDepth = -(this.blockDepth * (layer / verticalLayers));
          
          positions[layerVertexIndex] = worldX;     // x
          positions[layerVertexIndex + 2] = worldZ; // z
          
          if (layer === 0) {
            // Top layer: follows terrain surface
            positions[layerVertexIndex + 1] = terrainHeight - 0.005;
          } else {
            // FIXED: Lower layers stay at fixed depth - completely flat bottom
            // Use the same flat base elevation as initial creation
            const baseElevation = 0; // Flat reference level  
            positions[layerVertexIndex + 1] = baseElevation + layerDepth;
          }
        }
      }
    }
    
    blockGeometry.attributes.position.needsUpdate = true;
    // Skip expensive normal recalculation for better performance during real-time updates
    // blockGeometry.computeVertexNormals();
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
        // Patterns are permanently disabled, so no action needed
        break;
      default:
        this.restoreNormalColors();
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
   * Clean up all localized overlays
   */
  public cleanupAllOverlays(): void {
    // Remove all cut overlays
    this.cutOverlays.forEach(overlay => {
      if (overlay) {
        this.terrainGroup.remove(overlay);
        if (overlay.geometry) {
          overlay.geometry.dispose();
        }
        if (overlay.material && typeof (overlay.material as THREE.Material).dispose === 'function') {
          (overlay.material as THREE.Material).dispose();
        }
      }
    });
    this.cutOverlays = [];

    // Remove all fill overlays
    this.fillOverlays.forEach(overlay => {
      if (overlay) {
        this.terrainGroup.remove(overlay);
        if (overlay.geometry) {
          overlay.geometry.dispose();
        }
        if (overlay.material && typeof (overlay.material as THREE.Material).dispose === 'function') {
          (overlay.material as THREE.Material).dispose();
        }
      }
    });
    this.fillOverlays = [];

    // Clear modification areas
    this.modificationAreas.clear();
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
    this.cutOverlays.forEach(overlay => {
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
   * Get height at position from original terrain before any modifications
   */
  public getOriginalHeightAtPosition(x: number, z: number): number {
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

  private createLocalizedCutOverlay(centerX: number, centerZ: number, radius: number): void {
    const brushRadius = radius * 1.2;
    let bounds = {
      minX: Math.max(0, centerX - brushRadius),
      maxX: Math.min(120, centerX + brushRadius),
      minZ: Math.max(0, centerZ - brushRadius),
      maxZ: Math.min(120, centerZ + brushRadius)
    };

    // Recursively merge with ANY existing cut areas that touch/overlap until no more merges are possible
    while (true) {
      const existingArea = this.findOverlappingArea(bounds, 'cut');
      if (!existingArea) break;

      // Expand bounds to encompass both areas
      bounds = {
        minX: Math.min(bounds.minX, existingArea.area.bounds.minX),
        maxX: Math.max(bounds.maxX, existingArea.area.bounds.maxX),
        minZ: Math.min(bounds.minZ, existingArea.area.bounds.minZ),
        maxZ: Math.max(bounds.maxZ, existingArea.area.bounds.maxZ)
      };

      // Remove the old overlay mesh & bookkeeping
      if (existingArea.area.overlay) {
        this.terrainGroup.remove(existingArea.area.overlay);
        this.cutOverlays.splice(this.cutOverlays.indexOf(existingArea.area.overlay), 1);
      }
      this.modificationAreas.delete(existingArea.key);
      // Clear any arrows in old bounds (arrows currently removed – keeps call for future)
      this.clearArrowsInBounds(bounds);
      // Continue loop – there may be further areas now overlapping the enlarged bounds
    }

    // Build a new single overlay that covers the merged bounds
    const mergedCenterX = (bounds.minX + bounds.maxX) / 2;
    const mergedCenterZ = (bounds.minZ + bounds.maxZ) / 2;
    const mergedRadius = Math.max((bounds.maxX - bounds.minX), (bounds.maxZ - bounds.minZ)) / 2;

    const geometry = this.createCutPolyhedronGeometry(bounds, mergedCenterX, mergedCenterZ, mergedRadius);
    const material = new THREE.MeshBasicMaterial({ color: 0xFF4444, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
    const overlay = new THREE.Mesh(geometry, material);
    overlay.renderOrder = 1; // draw after terrain so it is visible
    this.terrainGroup.add(overlay);
    this.cutOverlays.push(overlay);

    const areaKey = `cut_${Math.round(mergedCenterX)}_${Math.round(mergedCenterZ)}_${Date.now()}`;
    this.modificationAreas.set(areaKey, { bounds, type: 'cut', overlay });
  }

  private createLocalizedFillOverlay(centerX: number, centerZ: number, radius: number, plannedHeight: number = 0): void {
    const brushRadius = radius * 1.2;
    let bounds = {
      minX: Math.max(0, centerX - brushRadius),
      maxX: Math.min(120, centerX + brushRadius),
      minZ: Math.max(0, centerZ - brushRadius),
      maxZ: Math.min(120, centerZ + brushRadius)
    };

    // Recursively merge with ANY existing fill areas that touch/overlap until no more merges are possible
    while (true) {
      const existingArea = this.findOverlappingArea(bounds, 'fill');
      if (!existingArea) break;

      bounds = {
        minX: Math.min(bounds.minX, existingArea.area.bounds.minX),
        maxX: Math.max(bounds.maxX, existingArea.area.bounds.maxX),
        minZ: Math.min(bounds.minZ, existingArea.area.bounds.minZ),
        maxZ: Math.max(bounds.maxZ, existingArea.area.bounds.maxZ)
      };
      if (existingArea.area.overlay) {
        this.terrainGroup.remove(existingArea.area.overlay);
        this.fillOverlays.splice(this.fillOverlays.indexOf(existingArea.area.overlay), 1);
      }
      this.modificationAreas.delete(existingArea.key);
      this.clearArrowsInBounds(bounds);
    }

    const mergedCenterX = (bounds.minX + bounds.maxX) / 2;
    const mergedCenterZ = (bounds.minZ + bounds.maxZ) / 2;
    const mergedRadius = Math.max((bounds.maxX - bounds.minX), (bounds.maxZ - bounds.minZ)) / 2;

    const geometry = this.createFillPolyhedronGeometry(bounds, mergedCenterX, mergedCenterZ, mergedRadius, plannedHeight);
    const material = new THREE.MeshBasicMaterial({ color: 0x4444FF, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    const overlay = new THREE.Mesh(geometry, material);
    this.terrainGroup.add(overlay);
    this.fillOverlays.push(overlay);

    const areaKey = `fill_${Math.round(mergedCenterX)}_${Math.round(mergedCenterZ)}_${Date.now()}`;
    this.modificationAreas.set(areaKey, { bounds, type: 'fill', overlay });
  }

  /**
   * Create fill overlay for polyline operations
   */
  public createPolylineFillOverlay(points: {x: number, z: number}[], thickness: number): void {
    if (points.length < 2) return;
    
    // Calculate bounding box for the polyline
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const halfThickness = thickness / 2;
    
    for (const point of points) {
      minX = Math.min(minX, point.x - halfThickness);
      maxX = Math.max(maxX, point.x + halfThickness);
      minZ = Math.min(minZ, point.z - halfThickness);
      maxZ = Math.max(maxZ, point.z + halfThickness);
    }
    
    // Ensure bounds are within terrain limits
    const bounds = {
      minX: Math.max(0, minX),
      maxX: Math.min(120, maxX),
      minZ: Math.max(0, minZ),
      maxZ: Math.min(120, maxZ)
    };
    
    // Create geometry for the polyline fill area
    const geometry = this.createPolylineFillGeometry(points, thickness);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x4444FF, 
      transparent: true, 
      opacity: 0.3, 
      side: THREE.DoubleSide, 
      depthWrite: false 
    });
    const overlay = new THREE.Mesh(geometry, material);
    this.terrainGroup.add(overlay);
    this.fillOverlays.push(overlay);
    
    // Track this overlay
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const areaKey = `polyline_fill_${Math.round(centerX)}_${Math.round(centerZ)}_${Date.now()}`;
    this.modificationAreas.set(areaKey, { bounds, type: 'fill', overlay });
    
    // Auto-enable fill overlay display
    this.showFillVolumeOverlay = true;
  }

  /**
   * Create fill overlay for polygon operations
   */
  public createPolygonFillOverlay(vertices: {x: number, z: number}[]): void {
    if (vertices.length < 3) return;
    
    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const vertex of vertices) {
      minX = Math.min(minX, vertex.x);
      maxX = Math.max(maxX, vertex.x);
      minZ = Math.min(minZ, vertex.z);
      maxZ = Math.max(maxZ, vertex.z);
    }
    
    const bounds = {
      minX: Math.max(0, minX),
      maxX: Math.min(120, maxX),
      minZ: Math.max(0, minZ),
      maxZ: Math.min(120, maxZ)
    };
    
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const radius = Math.max((bounds.maxX - bounds.minX), (bounds.maxZ - bounds.minZ)) / 2;
    
    // Create geometry using existing polygon fill logic
    const geometry = this.createFillPolyhedronGeometry(bounds, centerX, centerZ, radius, 0);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x4444FF, 
      transparent: true, 
      opacity: 0.3, 
      side: THREE.DoubleSide, 
      depthWrite: false 
    });
    const overlay = new THREE.Mesh(geometry, material);
    this.terrainGroup.add(overlay);
    this.fillOverlays.push(overlay);
    
    const areaKey = `polygon_fill_${Math.round(centerX)}_${Math.round(centerZ)}_${Date.now()}`;
    this.modificationAreas.set(areaKey, { bounds, type: 'fill', overlay });
    
    // Auto-enable fill overlay display
    this.showFillVolumeOverlay = true;
  }

  /**
   * Create geometry for polyline fill overlay
   */
  private createPolylineFillGeometry(points: {x: number, z: number}[], thickness: number): THREE.BufferGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    const halfThickness = thickness / 2;
    const EPS = 0.001;
    
    let vertexIndex = 0;
    
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1];
      
      // Calculate direction and perpendicular vectors
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      const normalizedX = dx / length;
      const normalizedZ = dz / length;
      
      // Perpendicular vector for thickness
      const perpX = -normalizedZ;
      const perpZ = normalizedX;
      
      // Sample points along the segment
      const steps = Math.max(10, Math.floor(length * 2));
      
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const centerX = start.x + normalizedX * t * length;
        const centerZ = start.z + normalizedZ * t * length;
        
        // Create vertices for left and right edges of thickness
        const leftX = centerX + perpX * halfThickness;
        const leftZ = centerZ + perpZ * halfThickness;
        const rightX = centerX - perpX * halfThickness;
        const rightZ = centerZ - perpZ * halfThickness;
        
        // Get surface heights and check if there's actually fill at this location
        const leftOrigY = this.getOriginalHeightAtPosition(leftX, leftZ);
        const leftCurrY = this.getHeightAtPosition(leftX, leftZ);
        const rightOrigY = this.getOriginalHeightAtPosition(rightX, rightZ);
        const rightCurrY = this.getHeightAtPosition(rightX, rightZ);
        
        // Only create overlay where there's actual fill (current > original)
        if (leftCurrY > leftOrigY + EPS || rightCurrY > rightOrigY + EPS) {
          // Bottom vertices (original surface)
          positions.push(leftX, leftOrigY, leftZ);
          positions.push(rightX, rightOrigY, rightZ);
          // Top vertices (current surface) 
          positions.push(leftX, leftCurrY, leftZ);
          positions.push(rightX, rightCurrY, rightZ);
          
          // Create faces if not the first step
          if (step > 0 && vertexIndex >= 4) {
            const prevBase = vertexIndex - 4;
            const currBase = vertexIndex;
            
            // Bottom face (original surface)
            indices.push(prevBase, currBase, prevBase + 1);
            indices.push(currBase, currBase + 1, prevBase + 1);
            
            // Top face (current surface)
            indices.push(prevBase + 2, prevBase + 3, currBase + 2);
            indices.push(currBase + 2, prevBase + 3, currBase + 3);
            
            // Left side face
            indices.push(prevBase, prevBase + 2, currBase);
            indices.push(currBase, prevBase + 2, currBase + 2);
            
            // Right side face
            indices.push(prevBase + 1, currBase + 1, prevBase + 3);
            indices.push(currBase + 1, currBase + 3, prevBase + 3);
          }
          
          vertexIndex += 4;
        }
      }
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    return geometry;
  }

  private createDensityBasedArrows(x: number, z: number, heightChange: number, volumeChange: number, radius: number): void {
    // Removed entire method body
  }

  private clearArrowsInBounds(bounds: { minX: number, maxX: number, minZ: number, maxZ: number }): void {
    // Removed entire method body
  }

  private createArrowsForMergedArea(bounds: { minX: number, maxX: number, minZ: number, maxZ: number }, isFill: boolean): void {
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const radius = Math.max((bounds.maxX - bounds.minX) / 2, (bounds.maxZ - bounds.minZ) / 2);
    this.createDensityBasedArrows(centerX, centerZ, isFill ? 1 : -1, 1, radius);
  }

  // Remove any duplicate definitions

  public clearAllArrows(): void {
    this.arrows.forEach(arrow => this.terrainGroup.remove(arrow));
    this.arrows = [];
  }

  /**
   * Set camera reference for zoom-independent arrow scaling
   */
  public setCameraReference(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Force disable all pattern overlays (no-op since patterns were removed)
   */
  public forceDisablePatterns(): void {
    // Patterns are permanently disabled, so this is a no-op
    this.accessibilityMode = 'normal';
  }

  /**
   * Force disable wireframe mode
   */
  public forceDisableWireframe(): void {
    // Disable wireframe on surface mesh
    const surfaceMaterial = this.surfaceMesh.material as THREE.MeshBasicMaterial;
    surfaceMaterial.wireframe = false;
    
    // Also disable wireframe on the terrain block
    this.wallMeshes.forEach(block => {
      if (block.material instanceof Array) {
        // Handle multi-material mesh
        block.material.forEach(mat => {
          if (mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.MeshLambertMaterial) {
            mat.wireframe = false;
          }
        });
      } else if (block.material instanceof THREE.MeshBasicMaterial || block.material instanceof THREE.MeshLambertMaterial) {
        block.material.wireframe = false;
      }
    });
  }

  /**
   * Update all arrow scales based on camera distance (no-op since arrows are fixed size)
   */
  public updateAllArrowScales(): void {
    // Arrows now use fixed sizes, so this is a no-op
  }

  /**
   * Auto-save terrain if needed (no-op without database integration)
   */
  public autoSaveIfNeeded(): void {
    // Auto-save functionality would go here if database is connected
  }

  /**
   * Find overlapping modification area of the same type
   */
  private findOverlappingArea(bounds: { minX: number, maxX: number, minZ: number, maxZ: number }, type: 'cut' | 'fill'): { key: string; area: any } | null {
    for (const [key, area] of this.modificationAreas.entries()) {
      if (area.type === type) {
        // Check if this new area overlaps with existing area
        const overlap = !(bounds.maxX < area.bounds.minX || 
                         bounds.minX > area.bounds.maxX || 
                         bounds.maxZ < area.bounds.minZ || 
                         bounds.minZ > area.bounds.maxZ);
        
        if (overlap) {
          return { key, area };
        }
      }
    }
    return null;
  }

  /**
   * Save individual terrain modification to database (no-op without database integration)
   */
  public saveModificationToDatabase(x: number, z: number, heightChange: number, tool: string): void {
    // Database save functionality would go here if database is connected
    // For now, this is a no-op to prevent runtime errors
  }

  // OPTIMIZED Geometry builder for CUT overlays – simplified for better performance
  private createCutPolyhedronGeometry(bounds: { minX: number, maxX: number, minZ: number, maxZ: number }, centerX: number, centerZ: number, radius: number): THREE.BufferGeometry {
    const isCircle = this.brushSettings.shape === 'circle';

    const positions: number[] = [];
    const indices: number[] = [];

    let minHeight = Infinity; // flat datum depth

    if (isCircle) {
      // PERFORMANCE: Reduced complexity for real-time performance
      const radialSteps = 12;  // Reduced from 36 to 12
      const ringSteps = 4;     // Reduced from 10 to 4
      // scan to find min current height
      for (let j = 0; j <= ringSteps; j++) {
        const rFrac = j / ringSteps;
        const dist = rFrac * radius;
        for (let i = 0; i < radialSteps; i++) {
          const angle = (i / radialSteps) * Math.PI * 2;
          const px = centerX + Math.cos(angle) * dist;
          const pz = centerZ + Math.sin(angle) * dist;
          minHeight = Math.min(minHeight, this.getHeightAtPosition(px, pz));
        }
      }
      // index helpers
      const bottomIndex = (j:number,i:number) => j * radialSteps + i;
      const bottomCount = (ringSteps + 1) * radialSteps;
      const topIndex = (j:number,i:number) => bottomCount + j * radialSteps + i;

      // vertices – bottom then top
      for (let j = 0; j <= ringSteps; j++) {
        const rFrac = j / ringSteps;
        const dist = rFrac * radius;
        for (let i = 0; i < radialSteps; i++) {
          const angle = (i / radialSteps) * Math.PI * 2;
          const px = centerX + Math.cos(angle) * dist;
          const pz = centerZ + Math.sin(angle) * dist;
          positions.push(px, minHeight, pz);
        }
      }
      for (let j = 0; j <= ringSteps; j++) {
        const rFrac = j / ringSteps;
        const dist = rFrac * radius;
        for (let i = 0; i < radialSteps; i++) {
          const angle = (i / radialSteps) * Math.PI * 2;
          const px = centerX + Math.cos(angle) * dist;
          const pz = centerZ + Math.sin(angle) * dist;
          const origY = this.getOriginalHeightAtPosition(px, pz);
          positions.push(px, origY, pz);
        }
      }
      // faces bottom
      for (let j = 0; j < ringSteps; j++) {
        for (let i = 0; i < radialSteps; i++) {
          const a = bottomIndex(j,i);
          const b = bottomIndex(j+1,i);
          const c = bottomIndex(j+1,(i+1)%radialSteps);
          const d = bottomIndex(j,(i+1)%radialSteps);
          indices.push(a,c,b);
          indices.push(a,d,c);
        }
      }
      // faces top
      for (let j = 0; j < ringSteps; j++) {
        for (let i = 0; i < radialSteps; i++) {
          const a = topIndex(j,i);
          const b = topIndex(j,(i+1)%radialSteps);
          const c = topIndex(j+1,(i+1)%radialSteps);
          const d = topIndex(j+1,i);
          indices.push(a,b,c);
          indices.push(a,c,d);
        }
      }
      // side walls
      for (let j = 0; j <= ringSteps; j++) {
        for (let i = 0; i < radialSteps; i++) {
          const b1 = bottomIndex(j,i);
          const b2 = bottomIndex(j,(i+1)%radialSteps);
          const t1 = topIndex(j,i);
          const t2 = topIndex(j,(i+1)%radialSteps);
          indices.push(b1,t1,b2);
          indices.push(b2,t1,t2);
        }
      }
    } else {
      // square brush – OPTIMIZED grid sampling  
      const steps = 6;  // Reduced from 15 to 6 for better performance
      const stepX = (bounds.maxX - bounds.minX) / steps;
      const stepZ = (bounds.maxZ - bounds.minZ) / steps;
      const numX = steps + 1;
      const numZ = steps + 1;
      const totalGrid = numX * numZ;
      // find min height
      for (let iz=0; iz<=steps; iz++) {
        for (let ix=0; ix<=steps; ix++) {
          const px = bounds.minX + ix*stepX;
          const pz = bounds.minZ + iz*stepZ;
          minHeight = Math.min(minHeight, this.getHeightAtPosition(px,pz));
        }
      }
      // vertices bottom
      for (let iz=0; iz<=steps; iz++) {
        for (let ix=0; ix<=steps; ix++) {
          const px = bounds.minX + ix*stepX;
          const pz = bounds.minZ + iz*stepZ;
          positions.push(px,minHeight,pz);
        }
      }
      // vertices top
      for (let iz=0; iz<=steps; iz++) {
        for (let ix=0; ix<=steps; ix++) {
          const px = bounds.minX + ix*stepX;
          const pz = bounds.minZ + iz*stepZ;
          const origY = this.getOriginalHeightAtPosition(px,pz);
          positions.push(px,origY,pz);
        }
      }
      const topOffset = totalGrid;
      // faces bottom
      for (let iz=0; iz<steps; iz++) {
        for (let ix=0; ix<steps; ix++) {
          const a = ix + numX*iz;
          const b = ix + numX*(iz+1);
          const c = (ix+1) + numX*(iz+1);
          const d = (ix+1) + numX*iz;
          indices.push(a,c,b);
          indices.push(a,d,c);
        }
      }
      // faces top
      for (let iz=0; iz<steps; iz++) {
        for (let ix=0; ix<steps; ix++) {
          const a = topOffset + ix + numX*iz;
          const b = topOffset + (ix+1) + numX*iz;
          const c = topOffset + (ix+1) + numX*(iz+1);
          const d = topOffset + ix + numX*(iz+1);
          indices.push(a,b,c);
          indices.push(a,c,d);
        }
      }
      // side walls around perimeter
      for (let iz=0; iz<steps; iz++) {
        // left
        let b1 = 0 + numX*iz;
        let b2 = 0 + numX*(iz+1);
        let t1 = topOffset + b1;
        let t2 = topOffset + b2;
        indices.push(b1,b2,t1);
        indices.push(t1,b2,t2);
        // right
        b1 = steps + numX*iz;
        b2 = steps + numX*(iz+1);
        t1 = topOffset + b1;
        t2 = topOffset + b2;
        indices.push(b2,t1,b1);
        indices.push(b2,t2,t1);
      }
      for (let ix=0; ix<steps; ix++) {
        // front
        let b1 = ix;
        let b2 = ix+1;
        let t1 = topOffset + b1;
        let t2 = topOffset + b2;
        indices.push(b1,t1,b2);
        indices.push(b2,t1,t2);
        // back
        b1 = ix + numX*steps;
        b2 = ix+1 + numX*steps;
        t1 = topOffset + b1;
        t2 = topOffset + b2;
        indices.push(b2,b1,t1);
        indices.push(b2,t1,t2);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  // OPTIMIZED Geometry builder for FILL overlays – simplified for better performance
  private createFillPolyhedronGeometry(bounds: { minX: number, maxX: number, minZ: number, maxZ: number }, centerX: number, centerZ: number, radius: number, plannedHeight: number = 0): THREE.BufferGeometry {
    const isCircle = this.brushSettings.shape === 'circle';
    const EPS = 0.001;

    const positions: number[] = [];
    const indices: number[] = [];

    if (isCircle) {
      // PERFORMANCE: Reduced complexity for real-time performance  
      const radialSteps = 12;  // Reduced from 36 to 12
      const ringSteps = 4;     // Reduced from 10 to 4
      const maxRadii:number[] = new Array(radialSteps).fill( plannedHeight>0 ? radius : 0 );

      for (let i=0;i<radialSteps;i++){
        const angle = (i/radialSteps)*Math.PI*2;
        let maxDist = 0;
        // march outward to radius collecting last point where current>original
        const samples = ringSteps*2;
        for (let s=1;s<=samples;s++){
          const dist = (s/samples)*radius;
          const px = centerX + Math.cos(angle)*dist;
          const pz = centerZ + Math.sin(angle)*dist;
          const cur = this.getHeightAtPosition(px,pz);
          const orig = this.getOriginalHeightAtPosition(px,pz);
          if (cur > orig + EPS) {
            maxDist = dist;
          }
        }
        maxRadii[i] = maxDist;
      }

      // If no positive fill found, return empty geometry
      if (maxRadii.every(r => r===0)) {
        return new THREE.BufferGeometry();
      }

      // 2. Build concentric rings up to each direction's max radius proportionally
      const bottomIndex = (j:number,i:number) => j*radialSteps + i;
      const bottomCount = (ringSteps+1)*radialSteps;
      const topIndex = (j:number,i:number) => bottomCount + j*radialSteps + i;

      for (let j=0;j<=ringSteps;j++){
        const frac = j/ringSteps;
        for (let i=0;i<radialSteps;i++){
          const maxDist = maxRadii[i];
          const dist = frac*maxDist;
          const angle = (i/radialSteps)*Math.PI*2;
          const px = centerX + Math.cos(angle)*dist;
          const pz = centerZ + Math.sin(angle)*dist;
          const orig = this.getOriginalHeightAtPosition(px,pz);
          const cur  = plannedHeight>0 ? orig + plannedHeight : this.getHeightAtPosition(px,pz);
          positions.push(px, orig, pz); // bottom vertex (original terrain)
        }
      }
      for (let j=0;j<=ringSteps;j++){
        const frac = j/ringSteps;
        for (let i=0;i<radialSteps;i++){
          const maxDist = maxRadii[i];
          const dist = frac*maxDist;
          const angle = (i/radialSteps)*Math.PI*2;
          const px = centerX + Math.cos(angle)*dist;
          const pz = centerZ + Math.sin(angle)*dist;
          const orig = this.getOriginalHeightAtPosition(px,pz);
          const cur  = plannedHeight>0 ? orig + plannedHeight : this.getHeightAtPosition(px,pz);
          positions.push(px, cur, pz); // top vertex (built terrain)
        }
      }

      // Faces similar to cut polyhedron but bottom normals face down.
      for (let j=0;j<ringSteps;j++){
        for (let i=0;i<radialSteps;i++){
          const a = bottomIndex(j,i);
          const b = bottomIndex(j+1,i);
          const c = bottomIndex(j+1,(i+1)%radialSteps);
          const d = bottomIndex(j,(i+1)%radialSteps);
          indices.push(a,b,c); // bottom normal orientation up? we want downward, use opposite
          indices.push(a,c,d);
        }
      }
      for (let j=0;j<ringSteps;j++){
        for (let i=0;i<radialSteps;i++){
          const a = topIndex(j,i);
          const b = topIndex(j,(i+1)%radialSteps);
          const c = topIndex(j+1,(i+1)%radialSteps);
          const d = topIndex(j+1,i);
          indices.push(a,c,b);
          indices.push(a,d,c);
        }
      }
      for (let j=0;j<=ringSteps;j++){
        for (let i=0;i<radialSteps;i++){
          const b1 = bottomIndex(j,i);
          const b2 = bottomIndex(j,(i+1)%radialSteps);
          const t1 = topIndex(j,i);
          const t2 = topIndex(j,(i+1)%radialSteps);
          indices.push(b1,b2,t1);
          indices.push(b2,t2,t1);
        }
      }

    } else {
      // square grid sampling: OPTIMIZED for performance
      const steps = 8;  // Reduced from 20 to 8 for better performance
      const stepX = (bounds.maxX-bounds.minX)/steps;
      const stepZ = (bounds.maxZ-bounds.minZ)/steps;

      const idx = (ix:number,iz:number,layer:number) => layer*(steps+1)*(steps+1) + iz*(steps+1) + ix;
      const vertsPerLayer = (steps+1)*(steps+1);

      for (let iz=0; iz<=steps; iz++){
        for (let ix=0; ix<=steps; ix++){
          const px = bounds.minX + ix*stepX;
          const pz = bounds.minZ + iz*stepZ;
          const orig = this.getOriginalHeightAtPosition(px,pz);
          const cur  = this.getHeightAtPosition(px,pz);
          positions.push(px, orig, pz); // bottom layer
        }
      }
      for (let iz=0; iz<=steps; iz++){
        for (let ix=0; ix<=steps; ix++){
          const px = bounds.minX + ix*stepX;
          const pz = bounds.minZ + iz*stepZ;
          const cur  = this.getHeightAtPosition(px,pz);
          positions.push(px, cur, pz); // top layer
        }
      }
      // build faces only when cur>orig for at least one vertex in cell
      for (let iz=0; iz<steps; iz++){
        for (let ix=0; ix<steps; ix++){
          const corners:number[][] = [];
          const vertsIndex=[
            [ix,iz],[ix+1,iz],[ix,iz+1],[ix+1,iz+1]
          ];
          let hasFill=false;
          vertsIndex.forEach(([vx,vz])=>{
            const px = bounds.minX + vx*stepX;
            const pz = bounds.minZ + vz*stepZ;
            if (this.getHeightAtPosition(px,pz) > this.getOriginalHeightAtPosition(px,pz)+EPS) hasFill=true;
          });
          if(!hasFill) continue;
          const a = idx(ix,iz,0);
          const b = idx(ix+1,iz,0);
          const c = idx(ix+1,iz+1,0);
          const d = idx(ix,iz+1,0);
          const A = idx(ix,iz,1);
          const B = idx(ix+1,iz,1);
          const C = idx(ix+1,iz+1,1);
          const D = idx(ix,iz+1,1);

          // bottom (original terrain) faces orientation downward
          indices.push(a,c,b);
          indices.push(a,d,c);
          // top faces
          indices.push(A,B,C);
          indices.push(A,C,D);
          // sides for each edge that borders empty/no-fill cell
          const pushSide =(bLow:number,bHigh:number,tLow:number,tHigh:number)=>{
            indices.push(bLow,bHigh,tLow);
            indices.push(bHigh,tHigh,tLow);
          };
          // left edge
          if(ix===0|| !hasFillCell(ix-1,iz)) pushSide(a,d,A,D);
          // right edge
          if(ix===steps-1|| !hasFillCell(ix+1,iz)) pushSide(b,c,B,C);
          // front edge
          if(iz===0 || !hasFillCell(ix,iz-1)) pushSide(a,b,A,B);
          // back edge
          if(iz===steps-1 || !hasFillCell(ix,iz+1)) pushSide(d,c,D,C);
        }
      }
      function hasFillCell(ix:number,iz:number):boolean{return false;} // placeholder; edges simplification
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  public isInPlanningMode(): boolean { return this.planningMode; }

  public hasPendingChanges(): boolean { return this.plannedStrokes.length>0; }

  /**
   * Apply all planned strokes to the terrain, commit to undo stack, regenerate contours, then clear planning state
   */
  public applyPendingChanges(): void {
    if (!this.hasPendingChanges()) return;

    // Save single undo state before applying combined modifications
    this.saveState();

    // Temporarily disable planning mode to reuse brush logic
    const previousPlanning = this.planningMode;
    this.suppressOverlays = true;
    this.planningMode = false;
    this.plannedStrokes.forEach(stroke => {
      this.modifyHeightBrush(stroke.x, stroke.z, stroke.heightChange);
    });
    this.planningMode = previousPlanning;
    this.suppressOverlays = false;

    // Clear overlays & planning list
    this.cleanupAllOverlays();
    this.plannedStrokes = [];

    // Regenerate contours and colors already done by modifyHeightBrush; ensure overlays hidden
    this.showOriginalTerrainOverlay = false;
    this.showFillVolumeOverlay = false;
  }

  /**
   * Discard planned strokes and overlays without altering terrain
   */
  public discardPendingChanges(): void {
    if (!this.hasPendingChanges()) return;
    this.cleanupAllOverlays();
    this.plannedStrokes = [];
    this.showOriginalTerrainOverlay = false;
    this.showFillVolumeOverlay = false;
  }

  // --- Stub methods for integration points not yet implemented (prevent TS errors) ---
  public setUserId(id: string | null): void { this.currentUserId = id; }
  public savePendingModifications(): void { /* planned for DB integration */ }
  public setAutoSave(enabled: boolean): void { this.autoSaveEnabled = enabled; }
  public saveCurrentState(callback?: (success:boolean)=>void): void { if(callback) callback(true); }
  public getUserTerrainStates(userId: string): any[] { return []; }
  public loadTerrainFromDatabase(userId: string): void { /* no-op */ }

  // === Convex Hull Helper (Monotone Chain) ===
  private computeConvexHull(points: {x:number; z:number}[]): {x:number; z:number}[] {
    if (points.length < 4) return points;
    // convert to array of [x,z]
    const pts = points.map(p=>({x:p.x,z:p.z}));
    pts.sort((a,b)=> a.x===b.x ? a.z-b.z : a.x-b.x);
    const cross = (o:any,a:any,b:any)=> (a.x-o.x)*(b.z-o.z)-(a.z-o.z)*(b.x-o.x);
    const lower: any[] = [];
    for(const p of pts){
      while(lower.length>=2 && cross(lower[lower.length-2], lower[lower.length-1], p)<=0) lower.pop();
      lower.push(p);
    }
    const upper: any[] = [];
    for(let i=pts.length-1;i>=0;i--){
      const p=pts[i];
      while(upper.length>=2 && cross(upper[upper.length-2], upper[upper.length-1], p)<=0) upper.pop();
      upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  }

  // === Outline Overlay Creator ===
  private createOutlineOverlay(boundary: {x:number; z:number}[], type: 'cut'|'fill'): THREE.Object3D | null {
     if(boundary.length < 3) return null;
     
     const group = new THREE.Group();
     const color = type==='cut'? 0xFF4444 : 0x4444FF;
     
     // Create smooth curved boundary with interpolation
     const smoothBoundary = this.createSmoothBoundary(boundary, 32); // Increase resolution for smoother curves
     
     // Create terrain-following geometry using higher resolution triangulation
     const vertices: number[] = [];
     const indices: number[] = [];
     
     // Create center point at average position and height
     const centerX = boundary.reduce((s,p)=> s + p.x, 0) / boundary.length;
     const centerZ = boundary.reduce((s,p)=> s + p.z, 0) / boundary.length;
     const centerY = this.getHeightAtPosition(centerX, centerZ) + 0.05;
     vertices.push(centerX, centerY, centerZ);
     
     // Add smooth boundary vertices at terrain height
     for (let i = 0; i < smoothBoundary.length; i++) {
       const p = smoothBoundary[i];
       const terrainY = this.getHeightAtPosition(p.x, p.z) + 0.05;
       vertices.push(p.x, terrainY, p.z);
     }
     
     // Create triangular faces from center to boundary segments
     for (let i = 0; i < smoothBoundary.length; i++) {
       const next = (i + 1) % smoothBoundary.length;
       indices.push(0, i + 1, next + 1);
     }
     
     // Create the mesh geometry
     const geometry = new THREE.BufferGeometry();
     geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
     geometry.setIndex(indices);
     geometry.computeVertexNormals();
     
     const mat = new THREE.MeshBasicMaterial({
       color, 
       transparent: true, 
       opacity: 0.4, 
       depthWrite: false, 
       depthTest: false, 
       side: THREE.DoubleSide
     });
     const mesh = new THREE.Mesh(geometry, mat);
     mesh.renderOrder = 1;
     group.add(mesh);

     // Create smooth outline line following terrain surface
     const outlinePts: THREE.Vector3[] = smoothBoundary.map(p => {
       const terrainY = this.getHeightAtPosition(p.x, p.z) + 0.08;
       return new THREE.Vector3(p.x, terrainY, p.z);
     });
     // Close the loop
     outlinePts.push(outlinePts[0].clone());
     
     const lineGeom = new THREE.BufferGeometry().setFromPoints(outlinePts);
     const lineMat = new THREE.LineBasicMaterial({color: 0x000000, linewidth: 2});
     const loop = new THREE.Line(lineGeom, lineMat);
     loop.renderOrder = 2;
     group.add(loop);

     return group;
   }

   /**
    * Create a smooth curved boundary by interpolating between boundary points
    */
   private createSmoothBoundary(boundary: {x:number; z:number}[], resolution: number): {x:number; z:number}[] {
     if (boundary.length < 3) return boundary;
     
     const smoothPoints: {x:number; z:number}[] = [];
     
     for (let i = 0; i < boundary.length; i++) {
       const current = boundary[i];
       const next = boundary[(i + 1) % boundary.length];
       const prev = boundary[(i - 1 + boundary.length) % boundary.length];
       
       // Add the current point
       smoothPoints.push(current);
       
       // Calculate number of interpolation points based on distance
       const segmentLength = Math.sqrt(
         Math.pow(next.x - current.x, 2) + Math.pow(next.z - current.z, 2)
       );
       const numInterpolations = Math.max(1, Math.floor(segmentLength / 2)); // One point every 2 feet
       
       // Create smooth curve between current and next point using catmull-rom spline
       for (let j = 1; j <= numInterpolations; j++) {
         const t = j / (numInterpolations + 1);
         
         // Catmull-Rom spline interpolation for smoother curves
         const interpolated = this.catmullRomInterpolation(
           prev, current, next, 
           boundary[(i + 2) % boundary.length], 
           t
         );
         
         smoothPoints.push(interpolated);
       }
     }
     
     return smoothPoints;
   }

   /**
    * Catmull-Rom spline interpolation for smooth curves
    */
   private catmullRomInterpolation(
     p0: {x:number; z:number}, 
     p1: {x:number; z:number}, 
     p2: {x:number; z:number}, 
     p3: {x:number; z:number}, 
     t: number
   ): {x:number; z:number} {
     const t2 = t * t;
     const t3 = t2 * t;
     
     // Catmull-Rom coefficients
     const c0 = -0.5 * t3 + t2 - 0.5 * t;
     const c1 = 1.5 * t3 - 2.5 * t2 + 1;
     const c2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
     const c3 = 0.5 * t3 - 0.5 * t2;
     
     return {
       x: c0 * p0.x + c1 * p1.x + c2 * p2.x + c3 * p3.x,
       z: c0 * p0.z + c1 * p1.z + c2 * p2.z + c3 * p3.z
     };
   }

  /**
   * Clear all fill overlays (blue areas) from the terrain
   */
  public clearFillOverlays(): void {
    console.log('Clearing fill overlays after operation execution');
    
    // Remove all fill overlays from the scene
    this.fillOverlays.forEach(overlay => {
      if (overlay) {
        this.terrainGroup.remove(overlay);
        if (overlay.geometry) {
          overlay.geometry.dispose();
        }
        if (overlay.material && typeof (overlay.material as THREE.Material).dispose === 'function') {
          (overlay.material as THREE.Material).dispose();
        }
      }
    });
    
    // Clear the fill overlays array
    this.fillOverlays = [];
    
    // Remove fill modification areas from tracking
    const fillAreaKeys = Array.from(this.modificationAreas.keys()).filter(key => 
      key.includes('fill_') || key.includes('polyline_fill_') || key.includes('polygon_fill_')
    );
    
    fillAreaKeys.forEach(key => {
      this.modificationAreas.delete(key);
    });
    
    // Disable fill overlay display
    this.showFillVolumeOverlay = false;
    
    console.log('Fill overlays cleared successfully');
  }

  /**
   * Load terrain configuration from server
   */
  public async loadTerrainFromServer(levelId: number, assignmentId?: string): Promise<boolean> {
    try {
      console.log(`🌍 Loading terrain from server: Level ${levelId}, Assignment ${assignmentId}`);
      
      let url = `http://localhost:3001/api/terrain/${levelId}`;
      if (assignmentId) {
        url += `?assignmentId=${assignmentId}`;
      }

      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`Failed to load terrain: ${response.statusText}`);
        return false;
      }

      const result = await response.json();
      
      if (result.success && result.terrain) {
        console.log('✅ Terrain loaded from server:', result.terrain.name);
        
        // Apply the terrain data
        if (result.terrain.terrain_data) {
          this.importTerrain(result.terrain.terrain_data);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error loading terrain from server:', error);
      return false;
    }
  }

  /**
   * Save current terrain state to server
   */
  public async saveTerrainToServer(
    levelId: number,
    assignmentId?: string,
    name?: string,
    description?: string,
    isDefault: boolean = false
  ): Promise<string | null> {
    try {
      // Get current user ID
      const userId = await this.getCurrentUserId();
      if (!userId) {
        console.log('No user authenticated, cannot save terrain');
        return null;
      }

      const terrainData = this.exportTerrain();
      
      const saveData = {
        levelId: levelId,
        assignmentId: assignmentId,
        name: name || `Level ${levelId} Terrain - ${new Date().toLocaleString()}`,
        description: description || `Terrain configuration for level ${levelId}`,
        terrainData: terrainData,
        terrainConfig: {
          width: 120,
          height: 120,
          pattern: 'custom'
        },
        isDefault: isDefault,
        userId: userId
      };

      const response = await fetch('http://localhost:3001/api/terrain/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saveData)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Terrain saved to server:', result.terrain.id);
        return result.terrain.id;
      } else {
        console.warn('Failed to save terrain:', response.statusText);
        return null;
      }
    } catch (error) {
      console.error('Error saving terrain to server:', error);
      return null;
    }
  }

  /**
   * Get current authenticated user ID
   */
  private async getCurrentUserId(): Promise<string | null> {
    try {
      // Import supabase client
      const { supabase } = await import('./supabase');
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id || null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  /**
   * List available terrain configurations for a level
   */
  public async listTerrainsForLevel(levelId: number): Promise<any[]> {
    try {
      const response = await fetch(`http://localhost:3001/api/terrain/list/${levelId}`);
      
      if (response.ok) {
        const result = await response.json();
        return result.terrains || [];
      } else {
        console.warn('Failed to list terrains:', response.statusText);
        return [];
      }
    } catch (error) {
      console.error('Error listing terrains:', error);
      return [];
    }
  }

  /**
   * Delete a terrain configuration
   */
  public async deleteTerrainFromServer(terrainId: string): Promise<boolean> {
    try {
      const userId = await this.getCurrentUserId();
      if (!userId) {
        console.log('No user authenticated, cannot delete terrain');
        return false;
      }

      const response = await fetch(`http://localhost:3001/api/terrain/${terrainId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        console.log('✅ Terrain deleted from server');
        return true;
      } else {
        console.warn('Failed to delete terrain:', response.statusText);
        return false;
      }
    } catch (error) {
      console.error('Error deleting terrain:', error);
      return false;
    }
  }
}
