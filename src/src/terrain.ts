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
  private material: THREE.MeshLambertMaterial;
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

    // Create surface material with improved properties
    this.material = new THREE.MeshLambertMaterial({
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
    
    // Force color update to ensure no black areas
    this.updateTerrainColors();
    
    // Save initial state
    this.saveState();
  }

  /**
   * Initialize realistic material layers
   */
  private initializeMaterialLayers(): void {
    this.materialLayers = [
      {
        name: 'Topsoil',
        color: new THREE.Color(0x8B5A2B), // Rich dark brown topsoil
        depth: 5, // 1.5m = ~5 feet
        hardness: 0.3
      },
      {
        name: 'Subsoil', 
        color: new THREE.Color(0xA0522D), // Sienna brown subsoil
        depth: 10, // 3.0m = ~10 feet
        hardness: 0.5
      },
      {
        name: 'Clay',
        color: new THREE.Color(0xCD853F), // Sandy brown clay
        depth: 11, // 3.5m = ~11 feet
        hardness: 0.7
      },
      {
        name: 'Rock',
        color: new THREE.Color(0x696969), // Dim gray rock
        depth: 7, // 2.0m = ~7 feet
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
  private createWallMaterial(): THREE.MeshLambertMaterial {
    return new THREE.MeshLambertMaterial({
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
   * Force all terrain colors to be light (no black areas)
   */
  public forceLightColors(): void {
    const vertices = this.geometry.attributes.position.array;
    const colors = new Float32Array(vertices.length);

    // Apply uniform light brown coloring
    for (let i = 0; i < vertices.length; i += 3) {
      const height = vertices[i + 1] || 0;
      
      // Base light brown color
      let r = 0.85, g = 0.75, b = 0.65;
      
      // Add slight height variation for visual interest
      if (isFinite(height)) {
        const heightVariation = Math.sin(height * 0.1) * 0.1 + 0.1;
        r += heightVariation;
        g += heightVariation * 0.8;
        b += heightVariation * 0.6;
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
   * Enhanced terrain color update with natural variation and elevation zones
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

    // Calculate slope information for variation
    const widthSegments = this.geometry.parameters.widthSegments;
    const heightSegments = this.geometry.parameters.heightSegments;

    // Apply enhanced color variation
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      const height = vertices[i + 1];
      
      // Calculate vertex index for slope calculation
      const vertexIndex = i / 3;
      const row = Math.floor(vertexIndex / (widthSegments + 1));
      const col = vertexIndex % (widthSegments + 1);
      
      // Default to surface sandy color
      let r = 0.85, g = 0.7, b = 0.55; // Base sandy topsoil
      
      if (isFinite(height) && !isNaN(height)) {
        if (height >= 0) {
          // Surface areas - enhanced natural variation
          
          // Base material color from height
          const normalizedHeight = (height - minHeight) / (maxHeight - minHeight);
          
          // Elevation-based color variation
          if (height > 5) {
            // Higher elevations - drier, sandier
            r = 0.9 + this.smoothNoise(x * 0.1, z * 0.1) * 0.08;
            g = 0.8 + this.smoothNoise(x * 0.12, z * 0.08) * 0.1;
            b = 0.6 + this.smoothNoise(x * 0.08, z * 0.15) * 0.15;
          } else if (height > 2) {
            // Medium elevations - mixed soil
            r = 0.75 + this.smoothNoise(x * 0.08, z * 0.1) * 0.15;
            g = 0.65 + this.smoothNoise(x * 0.1, z * 0.12) * 0.15;
            b = 0.45 + this.smoothNoise(x * 0.12, z * 0.08) * 0.2;
          } else if (height > -2) {
            // Lower elevations - darker, moister soil
            r = 0.65 + this.smoothNoise(x * 0.15, z * 0.12) * 0.15;
            g = 0.55 + this.smoothNoise(x * 0.12, z * 0.15) * 0.15;
            b = 0.35 + this.smoothNoise(x * 0.1, z * 0.1) * 0.2;
          }
          
          // Calculate slope for additional variation
          let slope = 0;
          if (row > 0 && row < heightSegments && col > 0 && col < widthSegments) {
            const leftIndex = (row * (widthSegments + 1) + (col - 1)) * 3;
            const rightIndex = (row * (widthSegments + 1) + (col + 1)) * 3;
            const topIndex = ((row - 1) * (widthSegments + 1) + col) * 3;
            const bottomIndex = ((row + 1) * (widthSegments + 1) + col) * 3;
            
            if (leftIndex + 1 < vertices.length && rightIndex + 1 < vertices.length && 
                topIndex + 1 >= 0 && bottomIndex + 1 < vertices.length) {
              const dx = vertices[rightIndex + 1] - vertices[leftIndex + 1];
              const dz = vertices[bottomIndex + 1] - vertices[topIndex + 1];
              slope = Math.sqrt(dx * dx + dz * dz) / 4; // Normalize slope
            }
          }
          
          // Slope-based variation - steeper slopes get rockier/sandier
          if (slope > 0.5) {
            r += slope * 0.1; // More sandy on slopes
            g += slope * 0.05;
            b -= slope * 0.1; // Less organic matter
          }
          
          // Add moisture variation in low areas
          if (height < 1) {
            const moistureNoise = this.smoothNoise(x * 0.05, z * 0.05);
            if (moistureNoise > 0.3) {
              // Moist areas - darker, richer soil
              r *= 0.8;
              g *= 0.9;
              b *= 0.7;
            }
          }
          
          // Add organic variation (patches of different soil types)
          const organicVariation = this.smoothNoise(x * 0.03, z * 0.04) * 0.1;
          if (organicVariation > 0.05) {
            // Richer organic areas
            r *= 0.9;
            g += 0.05;
            b *= 0.8;
          }
          
          // Add mineral deposits for visual interest
          const mineralNoise = this.smoothNoise(x * 0.2, z * 0.25);
          if (mineralNoise > 0.7) {
            // Iron-rich areas - more reddish
            r += 0.1;
            g *= 0.95;
          } else if (mineralNoise < -0.7) {
            // Clay deposits - more yellowish
            g += 0.05;
            b += 0.1;
          }
          
        } else {
          // Below surface - show subsurface materials with enhanced variation
          const exposureDepth = Math.abs(height);
          
          // Get base material color from depth
          const materialLayer = this.getMaterialAtDepth(exposureDepth);
          r = materialLayer.color.r;
          g = materialLayer.color.g;
          b = materialLayer.color.b;
          
          // Add geological variation to subsurface materials
          const geoNoise = this.smoothNoise(x * 0.05, z * 0.05);
          r += geoNoise * 0.1;
          g += geoNoise * 0.08;
          b += geoNoise * 0.06;
          
          // Add stratification patterns
          const strataNoise = Math.sin(exposureDepth * 0.5) * 0.05;
          r += strataNoise;
          g += strataNoise * 0.8;
          b += strataNoise * 0.6;
        }
        
        // Add subtle elevation zone influence
        const zone = this.getElevationZone(height);
        r = r * 0.95 + zone.color.r * 0.05;
        g = g * 0.95 + zone.color.g * 0.05;
        b = b * 0.95 + zone.color.b * 0.05;
      }

      // Ensure natural earth colors - prevent too dark or too bright
      colors[i] = Math.min(1.0, Math.max(0.25, r || 0.25));
      colors[i + 1] = Math.min(1.0, Math.max(0.2, g || 0.2));
      colors[i + 2] = Math.min(1.0, Math.max(0.15, b || 0.15));
    }

    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geometry.attributes.color.needsUpdate = true;
    
    // Update wall colors to match
    this.updateWallColors();
  }

  /**
   * Update wall colors with geological layers and natural variation
   */
  private updateWallColors(): void {
    if (this.wallMeshes.length === 0) return;
    
    const wallGeometry = this.wallMeshes[0].geometry as THREE.BufferGeometry;
    const positions = wallGeometry.attributes.position.array;
    const wallColors = new Float32Array(positions.length);
    
    // Calculate colors for each vertex in the wall geometry
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1]; // Height/depth
      const z = positions[i + 2];
      
      let r = 0.6, g = 0.45, b = 0.3; // Default earth brown
      
      if (y >= 0) {
        // Surface and above - match terrain surface colors
        // Use same logic as surface for consistency
        if (y > 5) {
          // Higher elevations - drier, sandier
          r = 0.9 + this.smoothNoise(x * 0.1, z * 0.1) * 0.08;
          g = 0.8 + this.smoothNoise(x * 0.12, z * 0.08) * 0.1;
          b = 0.6 + this.smoothNoise(x * 0.08, z * 0.15) * 0.15;
        } else if (y > 2) {
          // Medium elevations - mixed soil
          r = 0.75 + this.smoothNoise(x * 0.08, z * 0.1) * 0.15;
          g = 0.65 + this.smoothNoise(x * 0.1, z * 0.12) * 0.15;
          b = 0.45 + this.smoothNoise(x * 0.12, z * 0.08) * 0.2;
        } else {
          // Lower elevations - darker, moister soil
          r = 0.65 + this.smoothNoise(x * 0.15, z * 0.12) * 0.15;
          g = 0.55 + this.smoothNoise(x * 0.12, z * 0.15) * 0.15;
          b = 0.35 + this.smoothNoise(x * 0.1, z * 0.1) * 0.2;
        }
        
        // Add mineral deposits for visual interest
        const mineralNoise = this.smoothNoise(x * 0.2, z * 0.25);
        if (mineralNoise > 0.7) {
          // Iron-rich areas - more reddish
          r += 0.1;
          g *= 0.95;
        } else if (mineralNoise < -0.7) {
          // Clay deposits - more yellowish
          g += 0.05;
          b += 0.1;
        }
        
      } else {
        // Below surface - create TRUE horizontal geological layers
        // Let's start with solid color bands to debug the coordinate system
        
        // For horizontal layers, color should ONLY depend on Y (elevation/depth)
        // and be the same for all X,Z positions at the same Y level
        
        if (y >= 0) {
          // Surface level - should not happen in walls but just in case
          r = 0.8; g = 0.7; b = 0.5; // Sandy surface
        } else if (y >= -5) {
          // Topsoil layer (0 to -5 feet) - Dark brown - SOLID COLOR
          r = 0.35; g = 0.25; b = 0.15;
        } else if (y >= -15) {
          // Subsoil layer (-5 to -15 feet) - Medium brown - SOLID COLOR  
          r = 0.55; g = 0.35; b = 0.20;
        } else if (y >= -26) {
          // Clay layer (-15 to -26 feet) - Light brown/tan - SOLID COLOR
          r = 0.70; g = 0.50; b = 0.30;
        } else {
          // Rock layer (below -26 feet) - Gray - SOLID COLOR
          r = 0.45; g = 0.45; b = 0.45;
        }
        
        // DEBUG: Add a subtle horizontal stripe every 5 feet to verify orientation
        const stripeTest = Math.floor(Math.abs(y) / 2) % 2; // Every 2 feet, alternate
        if (stripeTest === 0) {
          r *= 1.1; // Slightly brighter every other 2-foot band
          g *= 1.1;
          b *= 1.1;
        }
      }
      
      // Ensure natural earth colors
      wallColors[i] = Math.min(1.0, Math.max(0.2, r || 0.2));
      wallColors[i + 1] = Math.min(1.0, Math.max(0.15, g || 0.15));
      wallColors[i + 2] = Math.min(1.0, Math.max(0.1, b || 0.1));
    }
    
    // Apply colors to wall geometry and switch to vertex colors
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

      // Create intelligent arrow placement based on operation magnitude
      this.createDensityBasedArrows(x, z, heightChange, totalVolumeChange, brushRadius);
    }
  }

  /**
   * Create density-based arrow placement matching reference image
   */
  private createDensityBasedArrows(x: number, z: number, heightChange: number, volumeChange: number, radius: number): void {
    // Determine arrow density based on volume change
    const maxArrows = Math.min(20, Math.max(1, Math.floor(volumeChange * 10)));
    const arrowSpacing = Math.max(1, radius * 2 / Math.sqrt(maxArrows));
    
    // Calculate grid dimensions for arrow placement
    const gridSize = Math.ceil(Math.sqrt(maxArrows));
    const startX = x - (gridSize * arrowSpacing) / 2;
    const startZ = z - (gridSize * arrowSpacing) / 2;
    
    let arrowCount = 0;
    
    for (let row = 0; row < gridSize && arrowCount < maxArrows; row++) {
      for (let col = 0; col < gridSize && arrowCount < maxArrows; col++) {
        const arrowX = startX + col * arrowSpacing;
        const arrowZ = startZ + row * arrowSpacing;
        
        // Check if this position is within the brush area
        const distanceFromCenter = Math.sqrt((arrowX - x) ** 2 + (arrowZ - z) ** 2);
        if (distanceFromCenter <= radius) {
          
          // Get height at arrow position
          const arrowHeight = this.getHeightAtPosition(arrowX, arrowZ);
          
          // Create arrow based on operation type
          if (heightChange < 0) {
            // Cut operation - red downward arrows
            this.createCutArrow(arrowX, arrowZ, arrowHeight, heightChange, distanceFromCenter / radius);
          } else {
            // Fill operation - blue upward arrows  
            this.createFillArrow(arrowX, arrowZ, arrowHeight, heightChange, distanceFromCenter / radius);
          }
          
          arrowCount++;
        }
      }
    }
  }

  /**
   * Create a cut arrow (red, downward) - PERSISTENT for session with zoom-independent scaling
   */
  private createCutArrow(x: number, z: number, height: number, heightChange: number, falloff: number): void {
    // Much larger base arrow length for better visibility
    const baseArrowLength = Math.max(3, Math.abs(heightChange) * (1 - falloff * 0.3) * 8); 
    const arrowPos = new THREE.Vector3(x, height + 1, z); // Position higher above surface
    const arrowDir = new THREE.Vector3(0, -1, 0); // Point downward
    
    const arrow = new THREE.ArrowHelper(arrowDir, arrowPos, baseArrowLength, 0xFF0000); // Red color
    
    // Set larger proportions for better visibility
    const headLength = baseArrowLength * 0.4; // Bigger arrow head
    const headWidth = baseArrowLength * 0.2; // Wider arrow head
    arrow.setLength(baseArrowLength, headLength, headWidth);
    
    // Store original length for scaling calculations
    (arrow as any).originalLength = baseArrowLength;
    (arrow as any).originalHeadLength = headLength;
    (arrow as any).originalHeadWidth = headWidth;
    
    // Mark as persistent cut arrow
    (arrow as any).isPersistentCut = true;
    
    this.terrainGroup.add(arrow);
    this.arrows.push(arrow);
    
    // Apply initial zoom-independent scaling
    this.updateArrowScale(arrow);
    
    // Red cut arrows persist for the entire session - no timeout removal
    // They will only be cleared when terrain is reset or manually cleared
  }

  /**
   * Create a fill arrow (blue, upward) - PERSISTENT for session with zoom-independent scaling
   */
  private createFillArrow(x: number, z: number, height: number, heightChange: number, falloff: number): void {
    // Much larger base arrow length for better visibility
    const baseArrowLength = Math.max(3, Math.abs(heightChange) * (1 - falloff * 0.3) * 8);
    const arrowPos = new THREE.Vector3(x, height - 1, z); // Position lower below surface
    const arrowDir = new THREE.Vector3(0, 1, 0); // Point upward
    
    const arrow = new THREE.ArrowHelper(arrowDir, arrowPos, baseArrowLength, 0x0000FF); // Blue color
    
    // Set larger proportions for better visibility
    const headLength = baseArrowLength * 0.4; // Bigger arrow head
    const headWidth = baseArrowLength * 0.2; // Wider arrow head
    arrow.setLength(baseArrowLength, headLength, headWidth);
    
    // Store original length for scaling calculations
    (arrow as any).originalLength = baseArrowLength;
    (arrow as any).originalHeadLength = headLength;
    (arrow as any).originalHeadWidth = headWidth;
    
    // Mark as persistent fill arrow
    (arrow as any).isPersistentFill = true;
    
    this.terrainGroup.add(arrow);
    this.arrows.push(arrow);
    
    // Apply initial zoom-independent scaling
    this.updateArrowScale(arrow);
    
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
          if (mat instanceof THREE.MeshLambertMaterial) {
            mat.wireframe = false;
          }
        });
      } else if (block.material instanceof THREE.MeshLambertMaterial) {
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
          if (mat instanceof THREE.MeshLambertMaterial) {
            mat.wireframe = surfaceMaterial.wireframe;
          }
        });
      } else if (block.material instanceof THREE.MeshLambertMaterial) {
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
   */
  private updateArrowScale(arrow: THREE.ArrowHelper): void {
    if (!this.camera) return;
    
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
   */
  public updateAllArrowScales(): void {
    if (!this.camera) return;
    
    this.arrows.forEach(arrow => {
      // Only update persistent arrows (cut and fill)
      if ((arrow as any).isPersistentCut || (arrow as any).isPersistentFill) {
        this.updateArrowScale(arrow);
      }
    });
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
}
