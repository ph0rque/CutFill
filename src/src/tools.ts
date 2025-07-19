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
  timestamp: number;
}

export abstract class TerrainTool {
  protected settings: ToolSettings;
  protected terrain: Terrain;
  protected lastOperation?: ToolOperation;

  constructor(settings: ToolSettings, terrain: Terrain) {
    this.settings = settings;
    this.terrain = terrain;
  }

  abstract apply(x: number, z: number, strength: number, size: number): void;

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

export class CutTool extends TerrainTool {
  constructor(terrain: Terrain) {
    super(
      {
        name: 'cut',
        displayName: 'Cut',
        description: 'Remove earth (excavation)',
        icon: '⛏️',
        color: '#FF4444',
        defaultStrength: 0.8,
        defaultSize: 3,
        maxSize: 8,
        minSize: 1,
      },
      terrain
    );
  }

  apply(x: number, z: number, strength: number, size: number): void {
    // Cut operation removes earth (negative height change)
    const cutStrength = -strength * 1.2; // Negative for removing earth

    // Get current brush settings and preserve shape/falloff, only update size and strength
    const currentBrushSettings = this.terrain.getBrushSettings();
    this.terrain.setBrushSettings({
      size: size,
      strength: Math.abs(cutStrength),
      shape: currentBrushSettings.shape, // Preserve user's shape choice
      falloff: currentBrushSettings.falloff, // Preserve user's falloff choice
    });

    this.terrain.modifyHeightBrush(x, z, cutStrength);

    this.lastOperation = {
      position: new THREE.Vector3(x, 0, z),
      strength: cutStrength,
      size,
      timestamp: Date.now(),
    };
  }
}

export class FillTool extends TerrainTool {
  constructor(terrain: Terrain) {
    super(
      {
        name: 'fill',
        displayName: 'Fill',
        description: 'Add earth (fill operation)',
        icon: '🏔️',
        color: '#2196F3',
        defaultStrength: 0.8,
        defaultSize: 3,
        maxSize: 8,
        minSize: 1,
      },
      terrain
    );
  }

  apply(x: number, z: number, strength: number, size: number): void {
    // Fill operation adds earth (positive height change)
    const fillStrength = strength * 1.2; // Positive for adding earth

    // Get current brush settings and preserve shape/falloff, only update size and strength
    const currentBrushSettings = this.terrain.getBrushSettings();
    this.terrain.setBrushSettings({
      size: size,
      strength: Math.abs(fillStrength),
      shape: currentBrushSettings.shape, // Preserve user's shape choice
      falloff: currentBrushSettings.falloff, // Preserve user's falloff choice
    });

    this.terrain.modifyHeightBrush(x, z, fillStrength);

    this.lastOperation = {
      position: new THREE.Vector3(x, 0, z),
      strength: fillStrength,
      size,
      timestamp: Date.now(),
    };
  }
}

export class ToolManager {
  private tools: Map<string, TerrainTool> = new Map();
  private currentTool: string = 'cut';
  private terrain: Terrain;

  constructor(terrain: Terrain) {
    this.terrain = terrain;
    this.initializeTools();
  }

  private initializeTools(): void {
    const cutTool = new CutTool(this.terrain);
    const fillTool = new FillTool(this.terrain);

    this.tools.set('cut', cutTool);
    this.tools.set('fill', fillTool);
  }

  public setCurrentTool(toolName: string): boolean {
    if (this.tools.has(toolName)) {
      this.currentTool = toolName;
      return true;
    }
    return false;
  }

  public getCurrentTool(): TerrainTool {
    return this.tools.get(this.currentTool)!;
  }

  public getCurrentToolName(): string {
    return this.currentTool;
  }

  public getAllTools(): TerrainTool[] {
    return Array.from(this.tools.values());
  }

  public getToolByName(name: string): TerrainTool | undefined {
    return this.tools.get(name);
  }

  public applyCurrentTool(
    x: number,
    z: number,
    strength: number,
    size: number
  ): void {
    const tool = this.getCurrentTool();
    if (tool) {
      tool.apply(x, z, strength, size);
    }
  }
}
