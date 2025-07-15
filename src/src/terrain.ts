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

  constructor(
    width: number = 50,
    height: number = 50,
    widthSegments: number = 32,
    heightSegments: number = 32
  ) {
    // Create terrain geometry
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

    // Create material with improved properties
    this.material = new THREE.MeshLambertMaterial({
      color: 0x8B4513, // Brown color for terrain
      wireframe: false,
      vertexColors: false,
    });

    // Create the mesh
    this.mesh = new THREE.Mesh(this.geometry, this.material);

    // Generate initial terrain
    this.generateRandomTerrain();
    
    // Save initial state
    this.saveState();
  }

  /**
   * Generate random terrain heights
   */
  private generateRandomTerrain(): void {
    const vertices = this.geometry.attributes.position.array;

    for (let i = 0; i < vertices.length; i += 3) {
      // Add random height variation to y-axis
      vertices[i + 1] += Math.random() * 4 - 2; // Increased variation
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  /**
   * Update terrain colors based on height
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

    // Apply colors based on height
    for (let i = 0; i < vertices.length; i += 3) {
      const height = vertices[i + 1];
      const normalizedHeight = (height - minHeight) / (maxHeight - minHeight);
      
      // Color gradient from blue (low) to brown (mid) to white (high)
      let r, g, b;
      if (normalizedHeight < 0.3) {
        // Low areas - blue to green
        r = 0.2 + normalizedHeight * 0.8;
        g = 0.4 + normalizedHeight * 1.2;
        b = 0.8 - normalizedHeight * 0.4;
      } else if (normalizedHeight < 0.7) {
        // Mid areas - green to brown
        r = 0.4 + (normalizedHeight - 0.3) * 0.8;
        g = 0.6 + (normalizedHeight - 0.3) * 0.2;
        b = 0.2;
      } else {
        // High areas - brown to white
        r = 0.8 + (normalizedHeight - 0.7) * 0.2;
        g = 0.6 + (normalizedHeight - 0.7) * 0.4;
        b = 0.4 + (normalizedHeight - 0.7) * 0.6;
      }

      colors[i] = r;
      colors[i + 1] = g;
      colors[i + 2] = b;
    }

    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  /**
   * Advanced brush-based terrain modification
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
        const actualChange = heightChange * this.brushSettings.strength * falloff;
        
        vertices[i + 1] += actualChange;
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
   * Improved volume calculation using triangulation
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
  }

  /**
   * Get the Three.js mesh
   */
  public getMesh(): THREE.Mesh {
    return this.mesh;
  }

  /**
   * Get terrain dimensions
   */
  public getDimensions(): { width: number; height: number } {
    const geometry = this.geometry;
    return {
      width: geometry.parameters.width,
      height: geometry.parameters.height,
    };
  }

  /**
   * Get terrain statistics
   */
  public getStats(): {
    vertexCount: number;
    triangleCount: number;
    dimensions: { width: number; height: number };
    volume: { cut: number; fill: number; net: number };
  } {
    const vertices = this.geometry.attributes.position.array;
    const index = this.geometry.index;
    
    return {
      vertexCount: vertices.length / 3,
      triangleCount: index ? index.count / 3 : 0,
      dimensions: this.getDimensions(),
      volume: this.calculateVolumeDifference()
    };
  }
}
