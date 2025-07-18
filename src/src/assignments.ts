import * as THREE from 'three';
import { Terrain } from './terrain';
import { supabase } from './supabase';
import { AgeScalingSystem } from './age-scaling';
import type { AgeGroup } from './age-scaling';

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
  levelNumber: number; // Sequential level (1, 2, 3...)
  idealOperations: number; // Hand-authored par count for operations efficiency
  levelVersion: number; // Version for future level updates
  isCompetitive: boolean; // Whether this level has competitive multiplayer mode
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
  operationCount: number; // Each cut/fill modification
  operationsEfficiencyScore: number; // (idealOps / actualOps) * 100
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
  private ageScaling: AgeScalingSystem;
  private callbacks: {
    onProgressUpdate?: (progress: AssignmentProgress) => void;
    onObjectiveComplete?: (objective: AssignmentObjective) => void;
    onAssignmentComplete?: (progress: AssignmentProgress) => void;
    onAssignmentStop?: () => void;
  } = {};

  constructor(terrain: Terrain) {
    this.terrain = terrain;
    this.ageScaling = new AgeScalingSystem();
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
        levelNumber: 1,
        idealOperations: 15,
        levelVersion: 1,
        isCompetitive: false,
        objectives: [
          {
            id: 'level_pad',
            type: 'level_area',
            description: 'Create a 50x50 ft level pad with ±2 inch tolerance',
            target: { x: 0, z: 0, width: 50, height: 50, elevation: 0 },
            tolerance: 0.17,
            weight: 0.8,
            completed: false,
            score: 0
          },
          {
            id: 'volume_efficiency',
            type: 'volume_target',
            description: 'Minimize material waste (net movement < 50 cubic yards)',
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
        tools: ['cut', 'fill'],
        hints: [
          'Use the cut tool to remove high spots',
          'Use the fill tool to build up low areas',
          'Balance cut and fill volumes for efficiency'
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
        levelNumber: 2,
        idealOperations: 25,
        levelVersion: 1,
        isCompetitive: false,
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
        tools: ['cut', 'fill'],
        hints: [
          'Start cutting at the high end',
          'Maintain consistent slope throughout',
          'Use fill tool to shape side slopes'
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
        description: 'Grade a 650 ft highway section with proper crown and drainage',
        difficulty: 3,
        category: 'road_construction',
        estimatedTime: 25,
        levelNumber: 3,
        idealOperations: 40,
        levelVersion: 1,
        isCompetitive: false,
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
        tools: ['cut', 'fill'],
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
        levelNumber: 4,
        idealOperations: 60,
        levelVersion: 1,
        isCompetitive: false,
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
        tools: ['cut', 'fill'],
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
        levelNumber: 5,
        idealOperations: 80,
        levelVersion: 1,
        isCompetitive: false,
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
        tools: ['cut', 'fill'],
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
      },

      // COMPETITIVE MULTIPLAYER ASSIGNMENTS
      {
        id: 'speed_foundation_race',
        name: '⚡ Speed Foundation Race',
        description: 'COMPETITIVE: Race against other players to level a foundation pad the fastest with highest accuracy',
        difficulty: 2,
        category: 'foundation',
        estimatedTime: 8,
        levelNumber: 6,
        idealOperations: 20,
        levelVersion: 1,
        isCompetitive: true,
        objectives: [
          {
            id: 'level_speed_pad',
            type: 'level_area',
            description: 'Level a 40x40 ft foundation pad within ±4 inch tolerance',
            target: { x: 0, z: 0, width: 40, height: 40, elevation: 0 },
            tolerance: 0.33,
            weight: 0.6,
            completed: false,
            score: 0
          },
          {
            id: 'speed_bonus',
            type: 'volume_target',
            description: 'Completion speed bonus (faster = higher score)',
            target: { timeTarget: 300 }, // 5 minutes target
            tolerance: 0.1,
            weight: 0.3,
            completed: false,
            score: 0
          },
          {
            id: 'efficiency_race',
            type: 'volume_target',
            description: 'Minimize material waste for efficiency bonus',
            target: { maxNetMovement: 30 },
            tolerance: 0.1,
            weight: 0.1,
            completed: false,
            score: 0
          }
        ],
        terrainConfig: {
          width: 50,
          height: 50,
          initialTerrain: 'rolling'
        },
        tools: ['cut', 'fill'],
        hints: [
          '🏁 COMPETITIVE MODE: Fastest completion wins!',
          'Balance speed with accuracy for maximum score',
          'Use efficient cut/fill patterns to save time',
          'Watch other players\' progress in real-time'
        ],
        successCriteria: {
          minimumScore: 60,
          timeBonus: true,
          volumeEfficiency: true
        }
      },

      {
        id: 'drainage_duel',
        name: '🌊 Drainage Channel Duel',
        description: 'COMPETITIVE: Head-to-head challenge to create the most efficient drainage channel',
        difficulty: 3,
        category: 'drainage',
        estimatedTime: 12,
        objectives: [
          {
            id: 'channel_speed',
            type: 'create_channel',
            description: 'Dig drainage channel from point A to B with 2% slope',
            target: { 
              startPoint: { x: -15, z: 0 },
              endPoint: { x: 15, z: 0 },
              width: 3,
              depth: 1.8,
              slope: 0.02
            },
            tolerance: 0.15,
            weight: 0.5,
            completed: false,
            score: 0
          },
          {
            id: 'flow_efficiency',
            type: 'grade_road',
            description: 'Create optimal water flow with smooth grade transitions',
            target: { slopeConsistency: 0.95 },
            tolerance: 0.1,
            weight: 0.3,
            completed: false,
            score: 0
          },
          {
            id: 'construction_speed',
            type: 'volume_target',
            description: 'Complete construction faster than opponents',
            target: { timeTarget: 600 }, // 10 minutes target
            tolerance: 0.1,
            weight: 0.2,
            completed: false,
            score: 0
          }
        ],
        terrainConfig: {
          width: 60,
          height: 40,
          initialTerrain: 'rough'
        },
        tools: ['cut', 'fill'],
        hints: [
          '🏁 COMPETITIVE MODE: Best drainage wins!',
          'Maintain consistent 2% slope for optimal flow',
          'Smooth transitions prevent erosion',
          'Speed matters - but accuracy wins!'
        ],
        successCriteria: {
          minimumScore: 70,
          timeBonus: true,
          volumeEfficiency: true
        }
      },

      {
        id: 'precision_showdown',
        name: '🎯 Precision Earthworks Showdown',
        description: 'COMPETITIVE: Ultimate precision challenge with multiple objectives and leaderboard scoring',
        difficulty: 4,
        category: 'grading',
        estimatedTime: 15,
        objectives: [
          {
            id: 'multi_pad_precision',
            type: 'level_area',
            description: 'Create 3 precise building pads at different elevations',
            target: { 
              pads: [
                { x: -15, z: -10, width: 8, height: 8, elevation: 1.0 },
                { x: 15, z: -10, width: 8, height: 8, elevation: 0.5 },
                { x: 0, z: 15, width: 10, height: 6, elevation: 1.5 }
              ]
            },
            tolerance: 0.05,
            weight: 0.4,
            completed: false,
            score: 0
          },
          {
            id: 'connecting_road',
            type: 'grade_road',
            description: 'Build connecting road between all pads with max 5% grade',
            target: { maxGrade: 0.05, connectAll: true },
            tolerance: 0.01,
            weight: 0.3,
            completed: false,
            score: 0
          },
          {
            id: 'volume_mastery',
            type: 'volume_target',
            description: 'Achieve perfect cut/fill balance (±3%)',
            target: { balanceTolerance: 0.03 },
            tolerance: 0.01,
            weight: 0.2,
            completed: false,
            score: 0
          },
          {
            id: 'championship_time',
            type: 'volume_target',
            description: 'Complete within championship time for bonus points',
            target: { timeTarget: 900 }, // 15 minutes
            tolerance: 0.1,
            weight: 0.1,
            completed: false,
            score: 0
          }
        ],
        terrainConfig: {
          width: 80,
          height: 60,
          initialTerrain: 'rolling'
        },
        tools: ['cut', 'fill'],
        hints: [
          '🏆 CHAMPIONSHIP MODE: Ultimate precision test!',
          'Plan pad elevations for optimal road connections',
          'Balance speed with surgical precision',
          'Perfect volume balance earns championship points',
          'Every second counts in the final leaderboard!'
        ],
        successCriteria: {
          minimumScore: 85,
          timeBonus: true,
          volumeEfficiency: true
        }
      },

      // ADDITIONAL DIVERSE ASSIGNMENT TEMPLATES  
      {
        id: 'residential_site_prep',
        name: '🏠 Residential Site Preparation',
        description: 'Prepare a residential building site with proper drainage, grading, and utility access',
        difficulty: 3,
        category: 'grading',
        estimatedTime: 20,
        objectives: [
          {
            id: 'house_pad_level',
            type: 'level_area',
            description: 'Create level building pad (30x40ft) at 2ft elevation',
            target: { x: 0, z: 0, width: 30, height: 40, elevation: 2.0 },
            tolerance: 0.15,
            weight: 0.35,
            completed: false,
            score: 0
          },
          {
            id: 'driveway_grade',
            type: 'grade_road',
            description: 'Grade driveway access with max 8% slope to street',
            target: { startPoint: { x: 15, z: 20 }, endPoint: { x: 25, z: 40 }, maxGrade: 0.08 },
            tolerance: 0.02,
            weight: 0.25,
            completed: false,
            score: 0
          },
          {
            id: 'drainage_swales',
            type: 'create_channel',
            description: 'Create drainage swales to direct water away from house',
            target: { depth: 0.5, width: 2, slopeToOutlet: true },
            tolerance: 0.1,
            weight: 0.25,
            completed: false,
            score: 0
          },
          {
            id: 'utility_trenches',
            type: 'create_channel',
            description: 'Excavate utility trenches for water, sewer, and electric',
            target: { depth: 1.2, width: 1.5, straightLines: true },
            tolerance: 0.15,
            weight: 0.15,
            completed: false,
            score: 0
          }
        ],
        terrainConfig: {
          width: 80,
          height: 60,
          initialTerrain: 'rolling'
        },
        tools: ['cut', 'fill'],
        hints: [
          'Start with the building pad - it sets the reference elevation',
          'Ensure positive drainage away from the house foundation',
          'Keep driveway grade under 8% for vehicle safety',
          'Plan utility routes to avoid conflicts with foundation'
        ],
        successCriteria: {
          minimumScore: 75,
          timeBonus: true,
          volumeEfficiency: true
        }
      },

      {
        id: 'highway_grading',
        name: '🛣️ Highway Construction Grading',
        description: 'Grade a section of highway with proper banking, drainage, and cut/fill balance',
        difficulty: 4,
        category: 'grading',
        estimatedTime: 25,
        objectives: [
          {
            id: 'roadway_profile',
            type: 'grade_road',
            description: 'Establish highway profile with 2% crown and max 6% grades',
            target: { length: 200, crown: 0.02, maxGrade: 0.06 },
            tolerance: 0.01,
            weight: 0.4,
            completed: false,
            score: 0
          },
          {
            id: 'cut_slopes',
            type: 'grade_road',
            description: 'Create stable cut slopes at 2:1 ratio for safety',
            target: { slopeRatio: 0.5, stability: true },
            tolerance: 0.05,
            weight: 0.25,
            completed: false,
            score: 0
          },
          {
            id: 'fill_slopes',
            type: 'grade_road',
            description: 'Build engineered fill slopes with proper compaction zones',
            target: { slopeRatio: 0.67, engineered: true },
            tolerance: 0.05,
            weight: 0.25,
            completed: false,
            score: 0
          },
          {
            id: 'balance_earthwork',
            type: 'volume_target',
            description: 'Balance cut and fill to minimize haul distance and cost',
            target: { balanceTolerance: 0.05, haulDistance: 'minimal' },
            tolerance: 0.02,
            weight: 0.1,
            completed: false,
            score: 0
          }
        ],
        terrainConfig: {
          width: 100,
          height: 40,
          initialTerrain: 'rolling'
        },
        tools: ['cut', 'fill'],
        hints: [
          'Highway safety requires consistent grades and smooth transitions',
          'Cut slopes must be stable - 2:1 ratio prevents erosion',
          'Balance cut and fill to minimize expensive truck hauls',
          'Proper crown sheds water to prevent hydroplaning'
        ],
        successCriteria: {
          minimumScore: 80,
          timeBonus: true,
          volumeEfficiency: true
        }
      },

      {
        id: 'environmental_restoration',
        name: '🌿 Environmental Land Restoration',
        description: 'Restore degraded land to natural contours while creating wildlife habitat features',
        difficulty: 3,
        category: 'grading',
        estimatedTime: 18,
        objectives: [
          {
            id: 'natural_contours',
            type: 'level_area',
            description: 'Restore natural-looking rolling contours (no straight lines)',
            target: { naturalContours: true, smoothTransitions: true },
            tolerance: 0.2,
            weight: 0.3,
            completed: false,
            score: 0
          },
          {
            id: 'wildlife_pond',
            type: 'create_channel',
            description: 'Create seasonal wildlife pond with gentle slopes',
            target: { x: -33, z: 33, depth: 6, diameter: 50, gentleSlopes: true },
            tolerance: 0.3,
            weight: 0.25,
            completed: false,
            score: 0
          },
          {
            id: 'habitat_mounds',
            type: 'level_area',
            description: 'Build small habitat mounds for wildlife cover',
            target: { count: 3, height: 1.5, naturalShape: true },
            tolerance: 0.25,
            weight: 0.2,
            completed: false,
            score: 0
          },
          {
            id: 'erosion_control',
            type: 'grade_road',
            description: 'Grade all slopes under 25% to prevent erosion',
            target: { maxSlope: 0.25, erosionResistant: true },
            tolerance: 0.05,
            weight: 0.25,
            completed: false,
            score: 0
          }
        ],
        terrainConfig: {
          width: 70,
          height: 70,
          initialTerrain: 'rough'
        },
        tools: ['cut', 'fill'],
        hints: [
          'Nature rarely creates straight lines - vary your contours',
          'Wildlife ponds need shallow areas for drinking and nesting',
          'Small habitat mounds provide cover and nesting sites',
          'Gentle slopes prevent erosion and allow vegetation growth'
        ],
        successCriteria: {
          minimumScore: 70,
          timeBonus: false,
          volumeEfficiency: false
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

      if (error) {
        console.warn('Failed to load assignments from database:', error);
        return this.getAssignmentTemplates();
      }

      if (data && data.length > 0) {
        console.log(`Loaded ${data.length} assignments from database`);
        return data.map(this.convertDatabaseToConfig).map(assignment => 
          this.ageScaling.scaleAssignment(assignment)
        );
      } else {
        console.log('No assignments found in database, using templates');
        return this.getAssignmentTemplates().map(assignment => 
          this.ageScaling.scaleAssignment(assignment)
        );
      }
    } catch (error) {
      console.warn('Database connection failed, using local assignment templates:', error);
      return this.getAssignmentTemplates().map(assignment => 
        this.ageScaling.scaleAssignment(assignment)
      );
    }
  }

  private convertDatabaseToConfig(dbAssignment: any): AssignmentConfig {
    // Ensure objectives are properly formatted
    let objectives: AssignmentObjective[] = [];
    if (Array.isArray(dbAssignment.objectives)) {
      objectives = dbAssignment.objectives.filter((obj: any) => 
        obj && typeof obj === 'object' && obj.description && obj.id
      );
    }
    
    // If no valid objectives, create a default one
    if (objectives.length === 0) {
      objectives = [{
        id: 'default_objective',
        type: 'level_area',
        description: 'Complete the assignment objectives',
        target: { x: 0, z: 0, width: 20, height: 20, elevation: 0 },
        tolerance: 0.5,
        weight: 1.0,
        completed: false,
        score: 0
      }];
    }

    return {
      id: dbAssignment.id,
      name: dbAssignment.name,
      description: dbAssignment.description,
      difficulty: dbAssignment.difficulty_level,
      category: dbAssignment.name.toLowerCase().includes('foundation') ? 'foundation' : 'grading',
      estimatedTime: 15,
      objectives,
      terrainConfig: dbAssignment.terrain_config || {
        width: 50,
        height: 50,
        initialTerrain: 'rolling'
      },
      tools: ['cut', 'fill'],
      hints: ['Complete the objectives within tolerance'],
      successCriteria: {
        minimumScore: 70,
        timeBonus: true,
        volumeEfficiency: true
      }
    };
  }

  public async startAssignment(assignmentId: string, userId: string): Promise<boolean> {
    console.log(`Starting assignment: ${assignmentId} for user: ${userId}`);
    
    const assignments = await this.getAvailableAssignments();
    console.log(`Found ${assignments.length} available assignments`);
    
    const assignment = assignments.find(a => a.id === assignmentId);
    
    if (!assignment) {
      console.error('Assignment not found:', assignmentId);
      console.error('Available assignment IDs:', assignments.map(a => a.id));
      return false;
    }

    console.log(`Found assignment: ${assignment.name}`);
    console.log('Assignment config:', assignment);

    this.currentAssignment = assignment;
    this.progress = {
      assignmentId,
      userId,
      startTime: new Date(),
      currentScore: 0,
      operationCount: 0,
      operationsEfficiencyScore: 100,
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
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (mesh.geometry.attributes.position as THREE.BufferAttribute).array;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      
      // Create rolling hills with sine waves
      const height = Math.sin(x * 0.1) * 2 + Math.cos(z * 0.15) * 1.5 + Math.random() * 0.5;
      vertices[i + 1] = height;
    }
    
    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private generateRoughTerrain(): void {
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    
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
    
    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private applyCustomHeights(heights: number[]): void {
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    
    for (let i = 0; i < vertices.length && i < heights.length; i += 3) {
      vertices[i + 1] = heights[i / 3];
    }
    
    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
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

    // Update volume data - convert from cubic feet to cubic yards (1 yd³ = 27 ft³)
    const volumeData = this.terrain.calculateVolumeDifference();
    this.progress.volumeData = {
      totalCut: volumeData.cut / 27,  // Convert to cubic yards
      totalFill: volumeData.fill / 27,  // Convert to cubic yards
      netMovement: Math.abs(volumeData.net) / 27,  // Convert to cubic yards
      efficiency: volumeData.fill > 0 ? volumeData.cut / volumeData.fill : 0
    };

    // Check each objective
    let objectivesScore = 0;
    let completedObjectives = 0;

    for (const objective of this.progress.objectives) {
      const score = this.evaluateObjective(objective);
      objective.score = score;
      objective.completed = score >= 80; // 80% threshold for completion
      
      objectivesScore += score * objective.weight;
      if (objective.completed) {
        completedObjectives++;
        
        // Trigger callback
        if (this.callbacks.onObjectiveComplete) {
          this.callbacks.onObjectiveComplete(objective);
        }
      }
    }

    // Calculate net-zero balance score (30% weight)
    const netVolumeYards = Math.abs(this.progress.volumeData.netMovement);
    const netZeroScore = Math.max(0, 100 - (netVolumeYards * 10)); // Lose 10 points per cubic yard imbalance
    
    // Operations efficiency score (20% weight) - already calculated in addToolUsage
    const operationsScore = this.progress.operationsEfficiencyScore;
    
    // Enhanced scoring: 50% objectives, 30% net-zero, 20% operations
    this.progress.currentScore = (objectivesScore * 0.5) + (netZeroScore * 0.3) + (operationsScore * 0.2);
    
    console.log(`Scoring breakdown: Objectives=${objectivesScore.toFixed(1)} (50%), Net-Zero=${netZeroScore.toFixed(1)} (30%), Operations=${operationsScore.toFixed(1)} (20%), Total=${this.progress.currentScore.toFixed(1)}`);

    

    // Check if assignment is complete
    if (completedObjectives === this.progress.objectives.length) {
      this.completeAssignment();
    }

    // Update competitive multiplayer scores if in competitive mode
    this.updateCompetitiveScores();

    // Trigger progress update callback
    if (this.callbacks.onProgressUpdate) {
      this.callbacks.onProgressUpdate(this.progress);
    }
  }

  private evaluateObjective(objective: AssignmentObjective): number {
    try {
      const meshObject = this.terrain.getMesh();
      
      // Cast to THREE.Mesh and safety check for mesh and geometry
      const mesh = meshObject as THREE.Mesh;
      if (!mesh || !mesh.geometry || !mesh.geometry.attributes || !mesh.geometry.attributes.position) {
        console.warn('Terrain mesh or geometry not properly initialized for objective evaluation');
        return 0;
      }
      
      const vertices = (mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      
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
          console.warn(`Unknown objective type: ${objective.type}`);
          return 0;
      }
    } catch (error) {
      console.error('Error evaluating objective:', error);
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

    // Speed/time-based scoring for competitive assignments
    if (target.timeTarget) {
      const elapsedSeconds = this.progress!.startTime ? 
        (Date.now() - this.progress!.startTime.getTime()) / 1000 : 0;
      
      if (elapsedSeconds <= target.timeTarget) {
        // Bonus for completing under target time
        const timeBonus = ((target.timeTarget - elapsedSeconds) / target.timeTarget) * 50;
        return Math.min(100, 50 + timeBonus); // Base 50% + up to 50% time bonus
      } else {
        // Penalty for exceeding target time, but still give some credit
        const timePenalty = Math.min(40, ((elapsedSeconds - target.timeTarget) / target.timeTarget) * 40);
        return Math.max(10, 50 - timePenalty); // Base 50% minus penalty, minimum 10%
      }
    }

    // Additional competitive scoring metrics
    if (target.volumeAccuracy) {
      const actualAccuracy = 1 - (volumeData.netMovement / (volumeData.totalCut + volumeData.totalFill + 1));
      const accuracyScore = Math.max(0, (actualAccuracy / target.volumeAccuracy) * 100);
      return Math.min(100, accuracyScore);
    }

    if (target.fillEfficiency) {
      const efficiency = volumeData.totalFill > 0 ? volumeData.totalCut / volumeData.totalFill : 1;
      const efficiencyScore = (efficiency / target.fillEfficiency) * 100;
      return Math.min(100, efficiencyScore);
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

    // Unlock next level if assignment passed
    if (this.progress.currentScore >= this.currentAssignment.successCriteria.minimumScore) {
      try {
        const unlocked = await this.unlockNextLevel(this.progress.userId, this.currentAssignment.levelNumber);
        if (unlocked) {
          console.log(`🎉 Level ${this.currentAssignment.levelNumber + 1} unlocked!`);
        }
      } catch (error) {
        console.error('Error unlocking next level:', error);
      }
    }

    // Trigger completion callback
    if (this.callbacks.onAssignmentComplete) {
      this.callbacks.onAssignmentComplete(this.progress);
    }
  }

  private async saveProgress(): Promise<void> {
    if (!this.progress) return;

    // Skip database save for guest users, but allow local progress tracking
    if (this.progress.userId === 'guest' || this.progress.userId.startsWith('guest_')) {
      console.log('Guest user - assignment progress saved locally only');
      return;
    }

    try {
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
        console.error('Failed to save assignment progress to database:', error);
        // Don't throw error - allow assignment to complete even if save fails
      } else {
        console.log('Assignment progress saved to database successfully');
        
        // Also update overall user progress if assignment completed
        if (this.progress.completed) {
          await this.updateUserProgress();
        }
      }
    } catch (error) {
      console.error('Database error while saving assignment progress:', error);
      // Continue without throwing - offline functionality
    }
  }

  /**
   * Update overall user progress after assignment completion
   */
  private async updateUserProgress(): Promise<void> {
    if (!this.progress || !this.currentAssignment) return;

    try {
      // Calculate XP reward based on score and difficulty
      const baseXP = 100;
      const difficultyMultiplier = this.currentAssignment.difficulty;
      const scoreMultiplier = this.progress.currentScore / 100;
      const xpReward = Math.round(baseXP * difficultyMultiplier * scoreMultiplier);

      // Get current user progress
      const { data: currentProgress } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', this.progress.userId)
        .single();

      if (currentProgress) {
        // Update existing progress
        const { error } = await supabase
          .from('user_progress')
          .update({
            experience: currentProgress.experience + xpReward,
            assignments_completed: currentProgress.assignments_completed + 1,
            total_volume_moved: currentProgress.total_volume_moved + this.progress.volumeData.totalCut + this.progress.volumeData.totalFill,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', this.progress.userId);

        if (error) {
          console.error('Failed to update user progress:', error);
        } else {
          console.log(`Updated user progress: +${xpReward} XP, +1 assignment completed`);
        }
      } else {
        // Create new progress record
        const { error } = await supabase
          .from('user_progress')
          .insert({
            user_id: this.progress.userId,
            experience: xpReward,
            assignments_completed: 1,
            total_volume_moved: this.progress.volumeData.totalCut + this.progress.volumeData.totalFill,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (error) {
          console.error('Failed to create user progress:', error);
        } else {
          console.log(`Created user progress: ${xpReward} XP, 1 assignment completed`);
        }
      }
    } catch (error) {
      console.error('Error updating user progress:', error);
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
    onAssignmentStop?: () => void;
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
    
    // Notify UI that assignment has stopped
    if (this.callbacks.onAssignmentStop) {
      this.callbacks.onAssignmentStop();
    }
  }

  public addToolUsage(toolName: string): void {
    if (this.progress) {
      // Track unique tools used
      if (!this.progress.toolsUsed.includes(toolName)) {
        this.progress.toolsUsed.push(toolName);
      }
      
      // Increment operation count for each terrain modification
      this.progress.operationCount++;
      
      // Calculate operations efficiency score
      if (this.currentAssignment) {
        this.progress.operationsEfficiencyScore = Math.min(100, 
          (this.currentAssignment.idealOperations / this.progress.operationCount) * 100
        );
      }
      
      console.log(`Operation ${this.progress.operationCount} recorded. Efficiency: ${this.progress.operationsEfficiencyScore.toFixed(1)}%`);
    }
  }

  // Competitive scoring integration
  private updateCompetitiveScores(): void {
    if (!this.progress || !this.currentAssignment?.isCompetitive) return;

    // Check if multiplayer manager is available globally
    if (typeof (window as any).multiplayerManager === 'object' && (window as any).multiplayerManager) {
      const multiplayerManager = (window as any).multiplayerManager;
      if (multiplayerManager.updateLiveScore && typeof multiplayerManager.updateLiveScore === 'function') {
        multiplayerManager.updateLiveScore(this.progress.userId, this.progress);
      }
    }
  }

  // Level progression methods
  public async getUnlockedLevels(userId: string): Promise<number[]> {
    try {
      if (userId === 'guest' || userId.startsWith('guest_')) {
        // Guest users only have level 1 unlocked
        return [1];
      }

      const { data, error } = await supabase
        .from('user_progress')
        .select('unlocked_levels')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        console.log('No user progress found, defaulting to level 1');
        return [1];
      }

      return data.unlocked_levels || [1];
    } catch (error) {
      console.error('Error getting unlocked levels:', error);
      return [1];
    }
  }

  public async unlockNextLevel(userId: string, completedLevel: number): Promise<boolean> {
    try {
      if (userId === 'guest' || userId.startsWith('guest_')) {
        console.log('Guest users cannot unlock levels permanently');
        return false;
      }

      const unlockedLevels = await this.getUnlockedLevels(userId);
      const nextLevel = completedLevel + 1;
      
      // Check if next level is already unlocked or if it's the logical next level
      if (unlockedLevels.includes(nextLevel) || nextLevel > this.getMaxLevelNumber()) {
        return false;
      }

      // Add next level to unlocked levels
      const updatedLevels = [...unlockedLevels, nextLevel].sort((a, b) => a - b);

      const { error } = await supabase
        .from('user_progress')
        .update({ unlocked_levels: updatedLevels })
        .eq('user_id', userId);

      if (error) {
        console.error('Error unlocking next level:', error);
        return false;
      }

      console.log(`Level ${nextLevel} unlocked for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error in unlockNextLevel:', error);
      return false;
    }
  }

  public getAvailableLevelsForUser(userUnlockedLevels: number[]): AssignmentConfig[] {
    const allAssignments = this.getAssignmentTemplates();
    
    // Sort assignments by level number to create sequential progression
    return allAssignments
      .filter(assignment => userUnlockedLevels.includes(assignment.levelNumber))
      .sort((a, b) => a.levelNumber - b.levelNumber);
  }

  public isLevelUnlocked(levelNumber: number, userUnlockedLevels: number[]): boolean {
    return userUnlockedLevels.includes(levelNumber);
  }

  private getMaxLevelNumber(): number {
    const assignments = this.getAssignmentTemplates();
    return Math.max(...assignments.map(a => a.levelNumber));
  }

  // Age scaling methods
  public getAgeGroups(): AgeGroup[] {
    return this.ageScaling.getAgeGroups();
  }

  public setAgeGroup(ageGroupId: string): boolean {
    const success = this.ageScaling.setAgeGroup(ageGroupId);
    if (success) {
      console.log(`Assignment difficulty adjusted for age group: ${ageGroupId}`);
    }
    return success;
  }

  public getCurrentAgeGroup(): AgeGroup {
    return this.ageScaling.getCurrentAgeGroup();
  }

  public getDifficultyAdjustments() {
    return this.ageScaling.getDifficultyAdjustments();
  }
} 