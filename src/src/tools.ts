import * as THREE from 'three';
import { Terrain } from './terrain';

export interface ToolSettings {
  name: string;
  displayName: string;
  description: string;
  icon: string;
  color: string;
  defaultStrength: number;
  defaultSize: number;
  maxSize: number;
  minSize: number;
}

export interface ToolOperation {
  position: THREE.Vector3;
  strength: number;
  size: number;
  direction?: THREE.Vector3;
  timestamp: number;
}

export abstract class EarthMovingTool {
  protected settings: ToolSettings;
  protected terrain: Terrain;
  protected lastOperation?: ToolOperation;

  constructor(settings: ToolSettings, terrain: Terrain) {
    this.settings = settings;
    this.terrain = terrain;
  }

  abstract apply(
    x: number, 
    z: number, 
    strength: number, 
    size: number, 
    direction?: THREE.Vector3
  ): void;

  getSettings(): ToolSettings {
    return { ...this.settings };
  }

  getName(): string {
    return this.settings.name;
  }

  getDisplayName(): string {
    return this.settings.displayName;
  }

  getIcon(): string {
    return this.settings.icon;
  }

  getColor(): string {
    return this.settings.color;
  }
}

export class ExcavatorTool extends EarthMovingTool {
  constructor(terrain: Terrain) {
    super({
      name: 'excavator',
      displayName: 'Excavator',
      description: 'Precise digging and material removal',
      icon: '🚜',
      color: '#FF6B35',
      defaultStrength: 0.8,
      defaultSize: 2,
      maxSize: 6,
      minSize: 1
    }, terrain);
  }

  apply(x: number, z: number, strength: number, size: number): void {
    // Excavator creates deep, precise cuts
    const excavationStrength = -strength * 1.5; // Negative for digging
    
    // Set brush for precise digging
    this.terrain.setBrushSettings({
      size: size * 0.8, // Smaller than other tools for precision
      strength: Math.abs(excavationStrength),
      shape: 'circle',
      falloff: 'sharp' // Sharp falloff for clean cuts
    });

    this.terrain.modifyHeightBrush(x, z, excavationStrength);
    
    this.lastOperation = {
      position: new THREE.Vector3(x, 0, z),
      strength: excavationStrength,
      size,
      timestamp: Date.now()
    };
  }
}

export class BulldozerTool extends EarthMovingTool {
  constructor(terrain: Terrain) {
    super({
      name: 'bulldozer',
      displayName: 'Bulldozer',
      description: 'Push and move material horizontally',
      icon: '🚜',
      color: '#4ECDC4',
      defaultStrength: 0.6,
      defaultSize: 4,
      maxSize: 10,
      minSize: 2
    }, terrain);
  }

  apply(x: number, z: number, strength: number, size: number, direction?: THREE.Vector3): void {
    // Bulldozer pushes material in direction of movement
    const pushStrength = strength * 0.8;
    
    // Set brush for wide pushing action
    this.terrain.setBrushSettings({
      size: size * 1.2, // Larger than other tools
      strength: pushStrength,
      shape: 'square', // Square shape for bulldozer blade
      falloff: 'linear'
    });

    if (direction && this.lastOperation) {
      // Calculate push direction based on movement
      const moveDirection = new THREE.Vector3(x, 0, z)
        .sub(this.lastOperation.position)
        .normalize();
      
      // Apply bulldozer effect: lower at start, raise at end
      const backX = x - moveDirection.x * size;
      const backZ = z - moveDirection.z * size;
      const frontX = x + moveDirection.x * size;
      const frontZ = z + moveDirection.z * size;
      
      // Remove material from back
      this.terrain.modifyHeightBrush(backX, backZ, -pushStrength * 0.7);
      // Add material to front (creating a berm)
      this.terrain.modifyHeightBrush(frontX, frontZ, pushStrength * 0.5);
    } else {
      // Simple bulldozer action if no direction
      this.terrain.modifyHeightBrush(x, z, pushStrength * 0.3);
    }
    
    this.lastOperation = {
      position: new THREE.Vector3(x, 0, z),
      strength: pushStrength,
      size,
      direction: direction?.clone(),
      timestamp: Date.now()
    };
  }
}

export class GraderTool extends EarthMovingTool {
  constructor(terrain: Terrain) {
    super({
      name: 'grader',
      displayName: 'Grader',
      description: 'Smooth and level terrain surfaces',
      icon: '🛣️',
      color: '#45B7D1',
      defaultStrength: 0.4,
      defaultSize: 6,
      maxSize: 12,
      minSize: 3
    }, terrain);
  }

  apply(x: number, z: number, strength: number, size: number): void {
    // Grader smooths terrain by averaging heights
    const gradeStrength = strength * 0.6;
    
    // Set brush for wide smoothing action
    this.terrain.setBrushSettings({
      size: size * 1.5, // Largest brush for smoothing
      strength: gradeStrength,
      shape: 'square', // Square for grader blade
      falloff: 'smooth'
    });

    // Get current terrain height at the center
    const mesh = this.terrain.getSurfaceMesh();
    const vertices = mesh.geometry.attributes.position.array;
    
    // Calculate average height in the area
    let totalHeight = 0;
    let count = 0;
    const checkRadius = size * 1.5;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const vertexX = vertices[i];
      const vertexZ = vertices[i + 2];
      const distance = Math.sqrt((x - vertexX) ** 2 + (z - vertexZ) ** 2);
      
      if (distance <= checkRadius) {
        totalHeight += vertices[i + 1];
        count++;
      }
    }
    
    const averageHeight = count > 0 ? totalHeight / count : 0;
    
    // Apply grading: bring all points toward average height
    for (let i = 0; i < vertices.length; i += 3) {
      const vertexX = vertices[i];
      const vertexZ = vertices[i + 2];
      const distance = Math.sqrt((x - vertexX) ** 2 + (z - vertexZ) ** 2);
      
      if (distance <= size) {
        const currentHeight = vertices[i + 1];
        const heightDiff = averageHeight - currentHeight;
        const falloff = Math.max(0, 1 - (distance / size));
        const adjustment = heightDiff * gradeStrength * falloff * 0.3;
        
        vertices[i + 1] += adjustment;
      }
    }
    
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
    
    this.lastOperation = {
      position: new THREE.Vector3(x, 0, z),
      strength: gradeStrength,
      size,
      timestamp: Date.now()
    };
  }
}

export class CompactorTool extends EarthMovingTool {
  constructor(terrain: Terrain) {
    super({
      name: 'compactor',
      displayName: 'Compactor',
      description: 'Compact and flatten terrain',
      icon: '🛞',
      color: '#96CEB4',
      defaultStrength: 0.3,
      defaultSize: 3,
      maxSize: 8,
      minSize: 2
    }, terrain);
  }

  apply(x: number, z: number, strength: number, size: number): void {
    // Compactor flattens by reducing height variations
    const compactionStrength = strength * 0.5;
    
    // Set brush for compaction
    this.terrain.setBrushSettings({
      size: size,
      strength: compactionStrength,
      shape: 'circle',
      falloff: 'smooth'
    });

    // Get terrain mesh for direct manipulation
    const mesh = this.terrain.getSurfaceMesh();
    const vertices = mesh.geometry.attributes.position.array;
    
    // Find minimum height in the area
    let minHeight = Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
      const vertexX = vertices[i];
      const vertexZ = vertices[i + 2];
      const distance = Math.sqrt((x - vertexX) ** 2 + (z - vertexZ) ** 2);
      
      if (distance <= size) {
        minHeight = Math.min(minHeight, vertices[i + 1]);
      }
    }
    
    // Compact toward minimum height
    for (let i = 0; i < vertices.length; i += 3) {
      const vertexX = vertices[i];
      const vertexZ = vertices[i + 2];
      const distance = Math.sqrt((x - vertexX) ** 2 + (z - vertexZ) ** 2);
      
      if (distance <= size) {
        const currentHeight = vertices[i + 1];
        const falloff = Math.max(0, 1 - (distance / size));
        const compressionAmount = (currentHeight - minHeight) * compactionStrength * falloff * 0.4;
        
        vertices[i + 1] -= compressionAmount;
      }
    }
    
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
    
    this.lastOperation = {
      position: new THREE.Vector3(x, 0, z),
      strength: compactionStrength,
      size,
      timestamp: Date.now()
    };
  }
}

export class ToolManager {
  private tools: Map<string, EarthMovingTool> = new Map();
  private currentTool: string = 'excavator';
  private terrain: Terrain;
  
  constructor(terrain: Terrain) {
    this.terrain = terrain;
    this.initializeTools();
  }
  
  private initializeTools(): void {
    const excavator = new ExcavatorTool(this.terrain);
    const bulldozer = new BulldozerTool(this.terrain);
    const grader = new GraderTool(this.terrain);
    const compactor = new CompactorTool(this.terrain);
    
    this.tools.set('excavator', excavator);
    this.tools.set('bulldozer', bulldozer);
    this.tools.set('grader', grader);
    this.tools.set('compactor', compactor);
  }
  
  public setCurrentTool(toolName: string): boolean {
    if (this.tools.has(toolName)) {
      this.currentTool = toolName;
      return true;
    }
    return false;
  }
  
  public getCurrentTool(): EarthMovingTool {
    return this.tools.get(this.currentTool)!;
  }
  
  public getCurrentToolName(): string {
    return this.currentTool;
  }
  
  public getAllTools(): EarthMovingTool[] {
    return Array.from(this.tools.values());
  }
  
  public getToolByName(name: string): EarthMovingTool | undefined {
    return this.tools.get(name);
  }
  
  public applyCurrentTool(
    x: number, 
    z: number, 
    strength: number, 
    size: number, 
    direction?: THREE.Vector3
  ): void {
    const tool = this.getCurrentTool();
    if (tool) {
      tool.apply(x, z, strength, size, direction);
    }
  }
} 