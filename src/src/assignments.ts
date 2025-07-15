import * as THREE from 'three';
import { Terrain } from './terrain';
import { supabase } from './supabase';

export interface AssignmentObjective {
  id: string;
  type: 'level_area' | 'create_channel' | 'volume_target' | 'grade_road' | 'build_foundation' | 'drainage_system';
  description: string;
  target: any;
  tolerance: number;
  weight: number; // Importance in final score (0-1)
  completed: boolean;
  score: number; // 0-100
}

export interface AssignmentConfig {
  id: string;
  name: string;
  description: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  category: 'foundation' | 'drainage' | 'grading' | 'excavation' | 'road_construction';
  estimatedTime: number; // minutes
  objectives: AssignmentObjective[];
  terrainConfig: {
    width: number;
    height: number;
    initialTerrain: 'flat' | 'rolling' | 'rough' | 'custom';
    customHeights?: number[];
  };
  tools: string[]; // Allowed tools
  hints: string[];
  successCriteria: {
    minimumScore: number;
    timeBonus: boolean;
    volumeEfficiency: boolean;
  };
}

export interface AssignmentProgress {
  assignmentId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  currentScore: number;
  objectives: AssignmentObjective[];
  volumeData: {
    totalCut: number;
    totalFill: number;
    netMovement: number;
    efficiency: number;
  };
  toolsUsed: string[];
  completed: boolean;
  attempts: number;
}

export class AssignmentManager {
  private terrain: Terrain;
  private currentAssignment: AssignmentConfig | null = null;
  private progress: AssignmentProgress | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private callbacks: {
    onProgressUpdate?: (progress: AssignmentProgress) => void;
    onObjectiveComplete?: (objective: AssignmentObjective) => void;
    onAssignmentComplete?: (progress: AssignmentProgress) => void;
  } = {};

  constructor(terrain: Terrain) {
    this.terrain = terrain;
  }

  // Assignment Templates
  private getAssignmentTemplates(): AssignmentConfig[] {
    return [
      {
        id: 'foundation_prep_1',
        name: 'Foundation Preparation - Level 1',
        description: 'Prepare a level foundation pad for a small residential building',
        difficulty: 1,
        category: 'foundation',
        estimatedTime: 10,
        objectives: [
          {
            id: 'level_pad',
            type: 'level_area',
            description: 'Create a 15x15 meter level pad with ±5cm tolerance',
            target: { x: 0, z: 0, width: 15, height: 15, elevation: 0 },
            tolerance: 0.05,
            weight: 0.8,
            completed: false,
            score: 0
          },
          {
            id: 'volume_efficiency',
            type: 'volume_target',
            description: 'Minimize material waste (net movement < 50 cubic meters)',
            target: { maxNetMovement: 50 },
            tolerance: 0.1,
            weight: 0.2,
            completed: false,
            score: 0
          }
        ],
        terrainConfig: {
          width: 50,
          height: 50,
          initialTerrain: 'rolling'
        },
        tools: ['excavator', 'bulldozer', 'grader', 'compactor'],
        hints: [
          'Use the excavator to remove high spots first',
          'The grader is perfect for final leveling',
          'Compactor helps achieve stable foundation'
        ],
        successCriteria: {
          minimumScore: 70,
          timeBonus: true,
          volumeEfficiency: true
        }
      },
      {
        id: 'drainage_channel_1',
        name: 'Drainage Channel Construction',
        description: 'Create a water drainage channel with proper slope',
        difficulty: 2,
        category: 'drainage',
        estimatedTime: 15,
        objectives: [
          {
            id: 'channel_path',
            type: 'create_channel',
            description: 'Dig channel along marked path with 2% slope',
            target: { 
              startPoint: { x: -20, z: 0 },
              endPoint: { x: 20, z: 0 },
              width: 3,
              depth: 1.5,
              slope: 0.02
            },
            tolerance: 0.15,
            weight: 0.7,
            completed: false,
            score: 0
          },
          {
            id: 'side_slopes',
            type: 'grade_road',
            description: 'Create stable side slopes (3:1 ratio)',
            target: { slopeRatio: 3 },
            tolerance: 0.5,
            weight: 0.3,
            completed: false,
            score: 0
          }
        ],
        terrainConfig: {
          width: 60,
          height: 40,
          initialTerrain: 'rough'
        },
        tools: ['excavator', 'bulldozer', 'grader'],
        hints: [
          'Start excavation at the high end',
          'Maintain consistent slope throughout',
          'Use bulldozer to shape side slopes'
        ],
        successCriteria: {
          minimumScore: 75,
          timeBonus: true,
          volumeEfficiency: false
        }
      },
      {
        id: 'road_grading_1',
        name: 'Road Grading - Highway Section',
        description: 'Grade a 200m highway section with proper crown and drainage',
        difficulty: 3,
        category: 'road_construction',
        estimatedTime: 25,
        objectives: [
          {
            id: 'road_grade',
            type: 'grade_road',
            description: 'Achieve 3% maximum grade along centerline',
            target: { maxGrade: 0.03, length: 200 },
            tolerance: 0.005,
            weight: 0.4,
            completed: false,
            score: 0
          },
          {
            id: 'road_crown',
            type: 'level_area',
            description: 'Create 2% crown for drainage',
            target: { crownPercent: 0.02, width: 12 },
            tolerance: 0.003,
            weight: 0.3,
            completed: false,
            score: 0
          },
          {
            id: 'cut_fill_balance',
            type: 'volume_target',
            description: 'Balance cut and fill volumes (±10%)',
            target: { balanceTolerance: 0.1 },
            tolerance: 0.05,
            weight: 0.3,
            completed: false,
            score: 0
          }
        ],
        terrainConfig: {
          width: 220,
          height: 30,
          initialTerrain: 'rolling'
        },
        tools: ['bulldozer', 'grader'],
        hints: [
          'Plan cut/fill sections to balance volumes',
          'Use grader for precise crown formation',
          'Maintain smooth transitions between grades'
        ],
        successCriteria: {
          minimumScore: 80,
          timeBonus: true,
          volumeEfficiency: true
        }
      },
      {
        id: 'site_development_1',
        name: 'Multi-Building Site Development',
        description: 'Prepare a commercial site with multiple building pads and access roads',
        difficulty: 4,
        category: 'grading',
        estimatedTime: 40,
        objectives: [
          {
            id: 'building_pad_1',
            type: 'level_area',
            description: 'Main building pad: 40x30m at elevation 100.5m',
            target: { x: -20, z: -15, width: 40, height: 30, elevation: 100.5 },
            tolerance: 0.03,
            weight: 0.3,
            completed: false,
            score: 0
          },
          {
            id: 'building_pad_2',
            type: 'level_area',
            description: 'Secondary building pad: 20x20m at elevation 100.2m',
            target: { x: 25, z: 20, width: 20, height: 20, elevation: 100.2 },
            tolerance: 0.03,
            weight: 0.2,
            completed: false,
            score: 0
          },
          {
            id: 'access_road',
            type: 'grade_road',
            description: 'Connect buildings with 6m wide access road',
            target: { width: 6, maxGrade: 0.08 },
            tolerance: 0.01,
            weight: 0.3,
            completed: false,
            score: 0
          },
          {
            id: 'site_drainage',
            type: 'drainage_system',
            description: 'Ensure positive drainage away from buildings',
            target: { minSlope: 0.02 },
            tolerance: 0.005,
            weight: 0.2,
            completed: false,
            score: 0
          }
        ],
        terrainConfig: {
          width: 100,
          height: 80,
          initialTerrain: 'rough'
        },
        tools: ['excavator', 'bulldozer', 'grader', 'compactor'],
        hints: [
          'Plan the overall site layout first',
          'Establish benchmark elevations',
          'Work from high to low areas for drainage'
        ],
        successCriteria: {
          minimumScore: 85,
          timeBonus: true,
          volumeEfficiency: true
        }
      },
      {
        id: 'earthwork_mastery',
        name: 'Earthwork Mastery Challenge',
        description: 'Complex earthwork project combining all skills',
        difficulty: 5,
        category: 'excavation',
        estimatedTime: 60,
        objectives: [
          {
            id: 'cut_accuracy',
            type: 'volume_target',
            description: 'Achieve precise cut volumes (±2%)',
            target: { volumeAccuracy: 0.02 },
            tolerance: 0.005,
            weight: 0.25,
            completed: false,
            score: 0
          },
          {
            id: 'fill_efficiency',
            type: 'volume_target',
            description: 'Minimize fill material waste',
            target: { fillEfficiency: 0.95 },
            tolerance: 0.02,
            weight: 0.25,
            completed: false,
            score: 0
          },
          {
            id: 'grade_precision',
            type: 'grade_road',
            description: 'Maintain precise grades throughout',
            target: { gradeAccuracy: 0.001 },
            tolerance: 0.0005,
            weight: 0.25,
            completed: false,
            score: 0
          },
          {
            id: 'time_efficiency',
            type: 'volume_target',
            description: 'Complete within time limit',
            target: { timeLimit: 45 },
            tolerance: 0.1,
            weight: 0.25,
            completed: false,
            score: 0
          }
        ],
        terrainConfig: {
          width: 120,
          height: 100,
          initialTerrain: 'custom'
        },
        tools: ['excavator', 'bulldozer', 'grader', 'compactor'],
        hints: [
          'Plan your approach carefully',
          'Use the right tool for each task',
          'Monitor progress continuously'
        ],
        successCriteria: {
          minimumScore: 90,
          timeBonus: true,
          volumeEfficiency: true
        }
      }
    ];
  }

  public async getAvailableAssignments(): Promise<AssignmentConfig[]> {
    // Get assignments from database, fall back to templates
    try {
      const { data, error } = await supabase
        .from('assignments')
        .select('*')
        .order('difficulty_level', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        return data.map(this.convertDatabaseToConfig);
      }
    } catch (error) {
      console.log('Using local assignment templates');
    }

    return this.getAssignmentTemplates();
  }

  private convertDatabaseToConfig(dbAssignment: any): AssignmentConfig {
    return {
      id: dbAssignment.id,
      name: dbAssignment.name,
      description: dbAssignment.description,
      difficulty: dbAssignment.difficulty_level,
      category: dbAssignment.name.toLowerCase().includes('foundation') ? 'foundation' : 'grading',
      estimatedTime: 15,
      objectives: dbAssignment.objectives || [],
      terrainConfig: dbAssignment.terrain_config || {
        width: 50,
        height: 50,
        initialTerrain: 'rolling'
      },
      tools: ['excavator', 'bulldozer', 'grader', 'compactor'],
      hints: ['Complete the objectives within tolerance'],
      successCriteria: {
        minimumScore: 70,
        timeBonus: true,
        volumeEfficiency: true
      }
    };
  }

  public async startAssignment(assignmentId: string, userId: string): Promise<boolean> {
    const assignments = await this.getAvailableAssignments();
    const assignment = assignments.find(a => a.id === assignmentId);
    
    if (!assignment) {
      console.error('Assignment not found:', assignmentId);
      return false;
    }

    this.currentAssignment = assignment;
    this.progress = {
      assignmentId,
      userId,
      startTime: new Date(),
      currentScore: 0,
      objectives: assignment.objectives.map(obj => ({ ...obj })),
      volumeData: {
        totalCut: 0,
        totalFill: 0,
        netMovement: 0,
        efficiency: 0
      },
      toolsUsed: [],
      completed: false,
      attempts: 1
    };

    // Configure terrain for assignment
    this.setupTerrainForAssignment(assignment);

    // Start monitoring progress
    this.startProgressMonitoring();

    return true;
  }

  private setupTerrainForAssignment(assignment: AssignmentConfig): void {
    const config = assignment.terrainConfig;
    
    // Reset terrain
    this.terrain.reset();
    
    // Apply initial terrain configuration
    switch (config.initialTerrain) {
      case 'flat':
        // Already flat from reset
        break;
      case 'rolling':
        this.generateRollingTerrain();
        break;
      case 'rough':
        this.generateRoughTerrain();
        break;
      case 'custom':
        if (config.customHeights) {
          this.applyCustomHeights(config.customHeights);
        }
        break;
    }
  }

  private generateRollingTerrain(): void {
    const mesh = this.terrain.getMesh();
    const vertices = mesh.geometry.attributes.position.array;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      
      // Create rolling hills with sine waves
      const height = Math.sin(x * 0.1) * 2 + Math.cos(z * 0.15) * 1.5 + Math.random() * 0.5;
      vertices[i + 1] = height;
    }
    
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private generateRoughTerrain(): void {
    const mesh = this.terrain.getMesh();
    const vertices = mesh.geometry.attributes.position.array;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      
      // Create rough terrain with multiple frequencies
      const height = Math.sin(x * 0.2) * 3 + 
                    Math.cos(z * 0.25) * 2 + 
                    Math.sin(x * 0.05) * 5 +
                    Math.random() * 2 - 1;
      vertices[i + 1] = height;
    }
    
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private applyCustomHeights(heights: number[]): void {
    const mesh = this.terrain.getMesh();
    const vertices = mesh.geometry.attributes.position.array;
    
    for (let i = 0; i < vertices.length && i < heights.length; i += 3) {
      vertices[i + 1] = heights[i / 3];
    }
    
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private startProgressMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      this.updateProgress();
    }, 1000); // Update every second
  }

  private updateProgress(): void {
    if (!this.currentAssignment || !this.progress) return;

    // Update volume data
    const volumeData = this.terrain.calculateVolumeDifference();
    this.progress.volumeData = {
      totalCut: volumeData.cut,
      totalFill: volumeData.fill,
      netMovement: Math.abs(volumeData.net),
      efficiency: volumeData.fill > 0 ? volumeData.cut / volumeData.fill : 0
    };

    // Check each objective
    let totalScore = 0;
    let completedObjectives = 0;

    for (const objective of this.progress.objectives) {
      const score = this.evaluateObjective(objective);
      objective.score = score;
      objective.completed = score >= 80; // 80% threshold for completion
      
      totalScore += score * objective.weight;
      if (objective.completed) {
        completedObjectives++;
        
        // Trigger callback
        if (this.callbacks.onObjectiveComplete) {
          this.callbacks.onObjectiveComplete(objective);
        }
      }
    }

    this.progress.currentScore = totalScore;

    // Check if assignment is complete
    if (completedObjectives === this.progress.objectives.length) {
      this.completeAssignment();
    }

    // Trigger progress update callback
    if (this.callbacks.onProgressUpdate) {
      this.callbacks.onProgressUpdate(this.progress);
    }
  }

  private evaluateObjective(objective: AssignmentObjective): number {
    const mesh = this.terrain.getMesh();
    const vertices = mesh.geometry.attributes.position.array;
    
    switch (objective.type) {
      case 'level_area':
        return this.evaluateLevelArea(objective, vertices);
      case 'volume_target':
        return this.evaluateVolumeTarget(objective);
      case 'create_channel':
        return this.evaluateChannelCreation(objective, vertices);
      case 'grade_road':
        return this.evaluateRoadGrade(objective, vertices);
      default:
        return 0;
    }
  }

  private evaluateLevelArea(objective: AssignmentObjective, vertices: Float32Array): number {
    const target = objective.target;
    const tolerance = objective.tolerance;
    
    let pointsInArea = 0;
    let pointsWithinTolerance = 0;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      const y = vertices[i + 1];
      
      // Check if point is within target area
      if (x >= target.x - target.width/2 && x <= target.x + target.width/2 &&
          z >= target.z - target.height/2 && z <= target.z + target.height/2) {
        pointsInArea++;
        
        // Check if height is within tolerance
        if (Math.abs(y - target.elevation) <= tolerance) {
          pointsWithinTolerance++;
        }
      }
    }
    
    return pointsInArea > 0 ? (pointsWithinTolerance / pointsInArea) * 100 : 0;
  }

  private evaluateVolumeTarget(objective: AssignmentObjective): number {
    const target = objective.target;
    const volumeData = this.progress!.volumeData;
    
    if (target.maxNetMovement) {
      const excess = Math.max(0, volumeData.netMovement - target.maxNetMovement);
      return Math.max(0, 100 - (excess / target.maxNetMovement) * 100);
    }
    
    if (target.balanceTolerance) {
      const imbalance = Math.abs(volumeData.totalCut - volumeData.totalFill);
      const total = volumeData.totalCut + volumeData.totalFill;
      const imbalanceRatio = total > 0 ? imbalance / total : 0;
      return Math.max(0, 100 - (imbalanceRatio / target.balanceTolerance) * 100);
    }
    
    return 0;
  }

  private evaluateChannelCreation(objective: AssignmentObjective, vertices: Float32Array): number {
    const target = objective.target;
    const tolerance = objective.tolerance;
    
    // Simplified channel evaluation - check depth along path
    const startPoint = target.startPoint;
    const endPoint = target.endPoint;
    const pathLength = Math.sqrt(
      Math.pow(endPoint.x - startPoint.x, 2) + 
      Math.pow(endPoint.z - startPoint.z, 2)
    );
    
    let validPoints = 0;
    let totalPoints = 0;
    
    // Sample points along the path
    for (let t = 0; t <= 1; t += 0.1) {
      const x = startPoint.x + t * (endPoint.x - startPoint.x);
      const z = startPoint.z + t * (endPoint.z - startPoint.z);
      
      // Find nearest vertex
      let closestHeight = 0;
      let minDistance = Infinity;
      
      for (let i = 0; i < vertices.length; i += 3) {
        const vx = vertices[i];
        const vz = vertices[i + 2];
        const distance = Math.sqrt((x - vx) ** 2 + (z - vz) ** 2);
        
        if (distance < minDistance) {
          minDistance = distance;
          closestHeight = vertices[i + 1];
        }
      }
      
      // Check if depth is within tolerance
      const expectedDepth = -target.depth;
      if (Math.abs(closestHeight - expectedDepth) <= tolerance) {
        validPoints++;
      }
      totalPoints++;
    }
    
    return totalPoints > 0 ? (validPoints / totalPoints) * 100 : 0;
  }

  private evaluateRoadGrade(objective: AssignmentObjective, vertices: Float32Array): number {
    // Simplified road grade evaluation
    return Math.random() * 100; // Placeholder implementation
  }

  private async completeAssignment(): Promise<void> {
    if (!this.progress || !this.currentAssignment) return;

    this.progress.completed = true;
    this.progress.endTime = new Date();
    
    // Stop monitoring
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Save progress to database
    try {
      await this.saveProgress();
    } catch (error) {
      console.error('Failed to save assignment progress:', error);
    }

    // Trigger completion callback
    if (this.callbacks.onAssignmentComplete) {
      this.callbacks.onAssignmentComplete(this.progress);
    }
  }

  private async saveProgress(): Promise<void> {
    if (!this.progress) return;

    const { error } = await supabase
      .from('user_assignments')
      .upsert({
        user_id: this.progress.userId,
        assignment_id: this.progress.assignmentId,
        completed_at: this.progress.endTime?.toISOString(),
        score: Math.round(this.progress.currentScore),
        volume_data: this.progress.volumeData,
        completion_time: this.progress.endTime && this.progress.startTime ? 
          Math.round((this.progress.endTime.getTime() - this.progress.startTime.getTime()) / 1000) : null,
        is_completed: this.progress.completed,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Failed to save assignment progress:', error);
    }
  }

  public getCurrentAssignment(): AssignmentConfig | null {
    return this.currentAssignment;
  }

  public getProgress(): AssignmentProgress | null {
    return this.progress;
  }

  public setCallbacks(callbacks: {
    onProgressUpdate?: (progress: AssignmentProgress) => void;
    onObjectiveComplete?: (objective: AssignmentObjective) => void;
    onAssignmentComplete?: (progress: AssignmentProgress) => void;
  }): void {
    this.callbacks = callbacks;
  }

  public stopAssignment(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    this.currentAssignment = null;
    this.progress = null;
  }

  public addToolUsage(toolName: string): void {
    if (this.progress && !this.progress.toolsUsed.includes(toolName)) {
      this.progress.toolsUsed.push(toolName);
    }
  }
} 