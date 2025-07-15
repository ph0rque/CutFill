import * as THREE from 'three';

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
  color: THREE.Color;
  depth: number;
  hardness: number; // affects excavation resistance
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
  private blockDepth: number = 10; // 10 meter depth
  private crossSectionGeometries: THREE.BufferGeometry[] = [];

  constructor(
    width: number = 50,
    height: number = 50,
    widthSegments: number = 8,  // Reduced from 32 for solid appearance
    heightSegments: number = 8  // Reduced from 32 for solid appearance
  ) {
    // Create main group for all terrain parts
    this.terrainGroup = new THREE.Group();
    
    // Initialize material layers
    this.initializeMaterialLayers();

    // Create surface terrain geometry
    this.geometry = new THREE.PlaneGeometry(
      width,
      height,
      widthSegments,
      heightSegments
    );

    // Rotate to be horizontal
    this.geometry.rotateX(-Math.PI / 2);

    // Store original vertices for future modifications
    this.originalVertices = new Float32Array(
      this.geometry.attributes.position.array
    );

    // Create surface material with improved properties
    this.material = new THREE.MeshLambertMaterial({
      color: 0x8B4513, // Brown color for terrain surface
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

    // Generate initial terrain
    this.regenerateTerrain();
    
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
        color: new THREE.Color(0x8B4513), // Saddle brown - clean soil color
        depth: 1.5,
        hardness: 0.3
      },
      {
        name: 'Subsoil', 
        color: new THREE.Color(0xA0522D), // Sienna - lighter brown
        depth: 3.0,
        hardness: 0.5
      },
      {
        name: 'Clay',
        color: new THREE.Color(0xD2691E), // Chocolate - orange-brown clay
        depth: 3.5,
        hardness: 0.7
      },
      {
        name: 'Rock',
        color: new THREE.Color(0x808080), // Gray - bedrock
        depth: 2.0,
        hardness: 1.0
      }
    ];
  }

  /**
   * Create the 3D terrain block with sides and bottom
   */
  private create3DTerrainBlock(width: number, height: number): void {
    // Create a solid box geometry for the terrain block
    const boxGeometry = new THREE.BoxGeometry(width, this.blockDepth, height);
    
    // Create materials for each face of the box
    const materials = [
      this.createWallMaterial(), // Right face (+X)
      this.createWallMaterial(), // Left face (-X)  
      this.material,             // Top face (+Y) - will be replaced by surface mesh
      new THREE.MeshLambertMaterial({ // Bottom face (-Y)
        color: this.materialLayers[this.materialLayers.length - 1].color,
        side: THREE.DoubleSide
      }),
      this.createWallMaterial(), // Front face (+Z)
      this.createWallMaterial()  // Back face (-Z)
    ];
    
    // Create the solid terrain block
    const terrainBlock = new THREE.Mesh(boxGeometry, materials);
    terrainBlock.position.set(0, -this.blockDepth / 2, 0);
    
    // Store reference to the block for wireframe toggle
    this.wallMeshes = [terrainBlock];
    this.terrainGroup.add(terrainBlock);
    
    // The surface mesh will be positioned on top of this block
    this.surfaceMesh.position.y = 0; // At the top of the block
  }

  /**
   * Create material for cross-section walls showing layers
   */
  private createWallMaterial(): THREE.MeshLambertMaterial {
    // Create a gradient texture showing material layers
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    
    // Create gradient representing soil layers
    const gradient = ctx.createLinearGradient(0, 0, 0, 64);
    let currentDepth = 0;
    
    for (let i = 0; i < this.materialLayers.length; i++) {
      const layer = this.materialLayers[i];
      const startPercent = currentDepth / this.blockDepth;
      currentDepth += layer.depth;
      const endPercent = Math.min(currentDepth / this.blockDepth, 1.0);
      
      const color = `rgb(${Math.floor(layer.color.r * 255)}, ${Math.floor(layer.color.g * 255)}, ${Math.floor(layer.color.b * 255)})`;
      gradient.addColorStop(startPercent, color);
      gradient.addColorStop(endPercent, color);
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 64);
    
    // Add some texture lines for realism
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < this.materialLayers.length - 1; i++) {
      let lineDepth = 0;
      for (let j = 0; j <= i; j++) {
        lineDepth += this.materialLayers[j].depth;
      }
      const y = (lineDepth / this.blockDepth) * 64;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(4, 1);
    
    return new THREE.MeshLambertMaterial({
      map: texture,
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
    this.saveState();
  }

  /**
   * Generate realistic terrain patterns
   */
  private generateTerrainPattern(vertices: Float32Array, width: number, height: number, pattern: string): void {
    const centerX = 0;
    const centerZ = 0;
    const maxRadius = Math.max(width, height) / 2;

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      
      // Distance from center for radial effects
      const distanceFromCenter = Math.sqrt(x * x + z * z);
      const normalizedDistance = Math.min(distanceFromCenter / maxRadius, 1);
      
      let terrainHeight = 0;

      switch (pattern) {
        case 'flat':
          // Almost completely flat with minimal variation
          terrainHeight = (Math.random() - 0.5) * 0.05; // Very small variation
          break;

        case 'gentle_slope':
          // Very gentle slope across the terrain
          const slopeDirection = Math.random() * Math.PI * 2;
          const slopeStrength = 0.2 + Math.random() * 0.3; // Much gentler: 0.2 to 0.5
          terrainHeight = (x * Math.cos(slopeDirection) + z * Math.sin(slopeDirection)) * slopeStrength / 25; // Reduced divisor
          // Minimal random variation
          terrainHeight += (Math.random() - 0.5) * 0.05;
          break;

        case 'valley':
          // Gentle U-shaped valley
          const valleyDepth = 0.5 + Math.random() * 0.5; // Much gentler: 0.5 to 1.0
          terrainHeight = -(1 - normalizedDistance) * valleyDepth * 0.5; // Reduced intensity
          // Smooth sides with gentle curve
          terrainHeight += Math.sin(normalizedDistance * Math.PI) * 0.2;
          // Minimal random variation
          terrainHeight += (Math.random() - 0.5) * 0.03;
          break;

        case 'hill':
          // Gentle hill in the center
          const hillHeight = 0.8 + Math.random() * 0.7; // Gentler: 0.8 to 1.5
          terrainHeight = (1 - normalizedDistance) * hillHeight * 0.5; // Reduced intensity
          // Smooth falloff with cosine curve
          terrainHeight *= Math.cos((normalizedDistance) * Math.PI * 0.5);
          // Minimal random variation
          terrainHeight += (Math.random() - 0.5) * 0.03;
          break;

        case 'rolling':
          // Very gentle rolling hills
          const waveScale1 = 0.04 + Math.random() * 0.02; // Smaller waves: 0.04 to 0.06
          const waveScale2 = 0.06 + Math.random() * 0.02; // Smaller waves: 0.06 to 0.08
          const amplitude = 0.3 + Math.random() * 0.2; // Much lower amplitude: 0.3 to 0.5
          
          terrainHeight = Math.sin(x * waveScale1) * amplitude + 
                         Math.cos(z * waveScale2) * amplitude * 0.6;
          // Minimal noise
          terrainHeight += (Math.random() - 0.5) * 0.05;
          break;

        default:
          terrainHeight = 0;
      }

      // Apply the calculated height with additional smoothing
      vertices[i + 1] = terrainHeight;
    }

    // Apply smoothing pass to reduce any sharp transitions
    this.smoothTerrain(vertices, width, height);
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
   * Update terrain colors based on height and material layers
   */
  public updateTerrainColors(): void {
    const vertices = this.geometry.attributes.position.array;
    const colors = new Float32Array(vertices.length);

    // Find height range
    let minHeight = Infinity;
    let maxHeight = -Infinity;

    for (let i = 1; i < vertices.length; i += 3) {
      const height = vertices[i];
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
    }

    // Apply colors based on exposed material layers (no vegetation)
    for (let i = 0; i < vertices.length; i += 3) {
      const height = vertices[i + 1];
      
      // Determine which material layer is exposed at this height
      // Negative heights expose deeper layers
      const exposureDepth = Math.max(0, -height);
      const materialLayer = this.getMaterialAtDepth(exposureDepth);
      
      // Use clean material layer colors (no vegetation tinting)
      let r = materialLayer.color.r;
      let g = materialLayer.color.g;
      let b = materialLayer.color.b;
      
      // Add subtle height-based variation for natural look
      const normalizedHeight = (height - minHeight) / (maxHeight - minHeight);
      
      if (height >= 0) {
        // Surface level - use topsoil color with slight lighting variation
        const lightingVariation = 0.9 + (normalizedHeight * 0.2); // 0.9 to 1.1 multiplier
        r *= lightingVariation;
        g *= lightingVariation;
        b *= lightingVariation;
      } else {
        // Below ground - slightly darken based on depth for realism
        const darkening = Math.min(0.2, exposureDepth * 0.02);
        r = Math.max(0.2, r - darkening);
        g = Math.max(0.2, g - darkening);
        b = Math.max(0.2, b - darkening);
      }

      // Clamp values to valid range
      colors[i] = Math.min(1.0, Math.max(0.0, r));
      colors[i + 1] = Math.min(1.0, Math.max(0.0, g));
      colors[i + 2] = Math.min(1.0, Math.max(0.0, b));
    }

    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  /**
   * Enhanced brush-based terrain modification with material awareness
   */
  public modifyHeightBrush(x: number, z: number, heightChange: number): void {
    const vertices = this.geometry.attributes.position.array;
    const widthSegments = this.geometry.parameters.widthSegments;
    const heightSegments = this.geometry.parameters.heightSegments;
    
    // Calculate brush area
    const brushRadius = this.brushSettings.size;
    let modified = false;

    for (let i = 0; i < vertices.length; i += 3) {
      const vertexX = vertices[i];
      const vertexZ = vertices[i + 2];
      const distance = Math.sqrt((x - vertexX) ** 2 + (z - vertexZ) ** 2);

      if (this.isInBrush(distance, vertexX - x, vertexZ - z)) {
        const falloff = this.calculateFalloff(distance, brushRadius);
        
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
        
        modified = true;
      }
    }

    if (modified) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.computeVertexNormals();
      this.updateTerrainColors();
    }
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
   * Calculate falloff based on distance and falloff type
   */
  private calculateFalloff(distance: number, radius: number): number {
    if (distance >= radius) return 0;
    
    const normalizedDistance = distance / radius;
    
    switch (this.brushSettings.falloff) {
      case 'linear':
        return 1 - normalizedDistance;
      case 'smooth':
        return Math.cos(normalizedDistance * Math.PI * 0.5);
      case 'sharp':
        return 1;
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
    
    // Clear undo/redo stacks and save initial state
    this.undoStack = [];
    this.redoStack = [];
    this.saveState();
  }

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
    this.material.wireframe = !this.material.wireframe;
    
    // Also toggle wireframe on the terrain block
    this.wallMeshes.forEach(block => {
      if (block.material instanceof Array) {
        // Handle multi-material mesh (our box)
        block.material.forEach(mat => {
          if (mat instanceof THREE.MeshLambertMaterial) {
            mat.wireframe = this.material.wireframe;
          }
        });
      } else if (block.material instanceof THREE.MeshLambertMaterial) {
        block.material.wireframe = this.material.wireframe;
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
}
