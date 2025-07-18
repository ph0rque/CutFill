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
  levelNumber?: number; // Sequential level (1, 2, 3...)
  idealOperations?: number; // Hand-authored par count for operations efficiency
  levelVersion?: number; // Version for future level updates
  isCompetitive?: boolean; // Whether this level has competitive multiplayer mode
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

  // Add terrain persistence properties
  private currentTerrainId: string | null = null;
  private originalTerrainData: any = null;

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
            description: '🌍 FUTURE ENGINEERS: Level a 50x50 ft area within 2-inch elevation variance for building foundation',
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
            description: 'Complete the excavation efficiently',
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
        levelNumber: 9,
        idealOperations: 40,
        levelVersion: 1,
        isCompetitive: true,
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
            description: 'Demonstrate mastery with precision work',
            target: { timeTarget: 900 },
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
            description: 'Create a wildlife pond with gradual slopes',
            target: { depth: 2.5, width: 15, gradualSlopes: true },
            tolerance: 0.3,
            weight: 0.2,
            completed: false,
            score: 0
          },
          {
            id: 'vegetation_zones',
            type: 'level_area',
            description: 'Create terraced zones for different vegetation types',
            target: { terraces: 3, elevationDifference: 1.5 },
            tolerance: 0.25,
            weight: 0.2,
            completed: false,
            score: 0
          },
          {
            id: 'soil_conservation',
            type: 'volume_target',
            description: 'Minimize soil disturbance and erosion',
            target: { maxDisturbance: 0.15 },
            tolerance: 0.05,
            weight: 0.3,
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
    let objectives: AssignmentObjective[] = [];
    if (Array.isArray(assignment.objectives)) {
      objectives = assignment.objectives.filter((obj: any) => 
        obj && typeof obj === 'object' && obj.description && obj.id
      );
    }
    // Removed default objective

    this.progress = {
      assignmentId,
      userId,
      startTime: new Date(),
      currentScore: 0,
      operationCount: 0,
      operationsEfficiencyScore: 0,
      objectives: objectives.map(obj => ({
        ...obj,
        completed: false,
        score: 0
      })),
      volumeData: {
        totalCut: 0,
        totalFill: 0,
        netMovement: 0,
        efficiency: 1
      },
      toolsUsed: [],
      completed: false,
      attempts: 1
    };

    // Configure terrain for assignment (now async)
    await this.setupTerrainForAssignment(assignment);

    // Wait for terrain to fully initialize before starting progress monitoring
    setTimeout(() => {
      this.startProgressMonitoring();
    }, 500); // 500ms delay to ensure terrain reset and setup operations are complete

    return true;
  }

  private async setupTerrainForAssignment(assignment: AssignmentConfig): Promise<void> {
    console.log(`Setting up terrain for assignment: ${assignment.name}`);
    
    // Reset terrain first
    this.terrain.reset();
    
    // Try to load saved terrain from database
    const savedTerrain = await this.loadSavedTerrain(assignment.levelNumber);
    
    if (savedTerrain) {
      console.log(`Loading saved terrain for level ${assignment.levelNumber}`);
      this.applySavedTerrain(savedTerrain);
    } else {
      console.log(`No saved terrain found, using fallback generation for level ${assignment.levelNumber}`);
      // Fallback to existing terrain generation
      const config = assignment.terrainConfig;
      
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
  }

  // Update existing rolling terrain method to match the pattern
  private generateRollingTerrain(): void {
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (mesh.geometry.attributes.position as THREE.BufferAttribute).array;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      
      // Rolling hills with multiple scales - updated to CLAUDE.md standards
      const largeWaves = Math.sin(x * 0.018) * Math.cos(z * 0.015) * 1.0; // 1 yard large waves
      const mediumWaves = Math.sin(x * 0.035) * Math.cos(z * 0.03) * 0.5; // 0.5 yards medium waves
      const smallWaves = this.smoothNoise(x * 0.05, z * 0.05) * 0.3; // 0.3 yards small variation
      const fineDetail = this.smoothNoise(x * 0.08, z * 0.08) * 0.2; // 0.2 yards fine detail
      
      const terrainHeight = largeWaves + mediumWaves + smallWaves + fineDetail;
      vertices[i + 1] = Math.max(-4, Math.min(4, terrainHeight)); // Clamp to ±4 yards total range
    }
    
    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private generateRoughTerrain(): void {
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (mesh.geometry.attributes.position as THREE.BufferAttribute).array;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      
      // Rough terrain with more dramatic height changes - updated to CLAUDE.md standards
      const roughness1 = this.smoothNoise(x * 0.03, z * 0.025) * 2.5; // 2.5 yards primary roughness
      const roughness2 = this.smoothNoise(x * 0.08, z * 0.07) * 1.5; // 1.5 yards secondary roughness
      const roughness3 = this.smoothNoise(x * 0.15, z * 0.12) * 1.0; // 1.0 yards fine roughness
      
      const terrainHeight = roughness1 + roughness2 + roughness3;
      vertices[i + 1] = Math.max(-5, Math.min(5, terrainHeight)); // Clamp to ±5 yards dramatic height changes
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

  // New methods for terrain persistence
  private async loadSavedTerrain(levelNumber: number | undefined): Promise<any> {
    if (!levelNumber) {
      console.log('No level number provided, cannot load saved terrain');
      return null;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/terrain/${levelNumber}`);
      
      if (!response.ok) {
        console.log(`No saved terrain found for level ${levelNumber}: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      
      if (data.success && data.terrain) {
        console.log(`Successfully loaded saved terrain for level ${levelNumber}`);
        return data.terrain;
      } else {
        console.log(`Invalid terrain data received for level ${levelNumber}`);
        return null;
      }
    } catch (error) {
      console.error(`Error loading saved terrain for level ${levelNumber}:`, error);
      return null;
    }
  }

  private applySavedTerrain(savedTerrain: any): void {
    try {
      const terrainData = savedTerrain.terrain_data;
      
      if (!terrainData || !terrainData.parameters) {
        console.error('Invalid terrain data structure:', terrainData);
        return;
      }

      // Apply the saved terrain pattern
      switch (terrainData.pattern) {
        case 'flat':
          this.generateFlatTerrain(terrainData.parameters);
          break;
        case 'gentle_slope':
          this.generateGentleSlopeTerrain(terrainData.parameters);
          break;
        case 'rolling':
          this.generateRollingTerrain();
          break;
        case 'rough':
          this.generateRoughTerrain();
          break;
        default:
          console.log(`Unknown terrain pattern: ${terrainData.pattern}, using flat`);
          this.generateFlatTerrain(terrainData.parameters);
      }
      
      console.log(`Applied saved terrain pattern: ${terrainData.pattern}`);
    } catch (error) {
      console.error('Error applying saved terrain:', error);
      // Fallback to flat terrain
      this.generateFlatTerrain();
    }
  }

  private generateFlatTerrain(parameters?: any): void {
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (mesh.geometry.attributes.position as THREE.BufferAttribute).array;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      
      // Gentle undulations for flat terrain - using CLAUDE.md standards
      const smallVariation = this.smoothNoise(x * 0.02, z * 0.02) * 0.5; // 0.5 yards variation
      const fineDetail = this.smoothNoise(x * 0.05, z * 0.05) * 0.25; // 0.25 yards detail
      
      const terrainHeight = smallVariation + fineDetail;
      vertices[i + 1] = Math.max(-1, Math.min(1, terrainHeight)); // Clamp to ±1 yards
    }
    
    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private generateGentleSlopeTerrain(parameters?: any): void {
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (mesh.geometry.attributes.position as THREE.BufferAttribute).array;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      
      // Gentle slope with drainage patterns - using CLAUDE.md standards
      const primarySlope = (x * 0.015) + (z * 0.01); // Overall slope
      const drainagePattern = Math.sin(x * 0.025) * 0.3; // Drainage channels
      const variation = this.smoothNoise(x * 0.03, z * 0.03) * 0.5; // Natural variation
      
      const terrainHeight = primarySlope + drainagePattern + variation;
      vertices[i + 1] = Math.max(-3, Math.min(3, terrainHeight)); // Clamp to ±3 yards
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
        // Silently return 0 during initialization - no need to spam console warnings
        return 0;
      }
      
      const positionAttribute = mesh.geometry.attributes.position as THREE.BufferAttribute;
      
      // Additional safety check: ensure the position array exists and has data
      if (!positionAttribute.array || positionAttribute.array.length === 0) {
        return 0;
      }
      
      // Check if geometry is still being updated (needsUpdate flag indicates ongoing changes)
      if (positionAttribute.needsUpdate) {
        return 0;
      }
      
      const vertices = positionAttribute.array as Float32Array;
      
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
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      const y = vertices[i + 1];
      
      // Check if point is within target area
      if (x >= target.x - target.width/2 && x <= target.x + target.width/2 &&
          z >= target.z - target.height/2 && z <= target.z + target.height/2) {
        pointsInArea++;
        minHeight = Math.min(minHeight, y);
        maxHeight = Math.max(maxHeight, y);
        
        // Check if height is within tolerance
        if (Math.abs(y - target.elevation) <= tolerance) {
          pointsWithinTolerance++;
        }
      }
    }
    
    const score = pointsInArea > 0 ? (pointsWithinTolerance / pointsInArea) * 100 : 0;
    
    // Debug logging (only log every 10 evaluations to avoid spam)
    if (Math.random() < 0.1) {
      const status = pointsWithinTolerance === pointsInArea ? '✓' : '✗';
      console.log(`Level Area Evaluation:
      Target: ${(target.width / 3).toFixed(1)}x${(target.height / 3).toFixed(1)} yd at (${(target.x / 3).toFixed(1)}, ${(target.z / 3).toFixed(1)}), elevation ${(target.elevation / 3).toFixed(1)} yd
      Tolerance: ±${(tolerance / 3).toFixed(2)} yd
      
      Status: ${status}
      Height range in area: ${(minHeight / 3).toFixed(2)} to ${(maxHeight / 3).toFixed(2)} yd
        Current score: ${score.toFixed(1)}%`);
    }
    
    return score;
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

    // Speed/time-based scoring disabled for relaxed gameplay
    if (target.timeTarget) {
      // Always return full score for time-based objectives - no time pressure
      return 100;
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
        const levelNumber = this.currentAssignment.levelNumber || 1;
        const unlocked = await this.unlockNextLevel(this.progress.userId, levelNumber);
        if (unlocked) {
          console.log(`🎉 Level ${levelNumber + 1} unlocked!`);
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
        const idealOperations = this.currentAssignment.idealOperations || 30;
        this.progress.operationsEfficiencyScore = Math.min(100, 
          (idealOperations / this.progress.operationCount) * 100
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
      // Check for developer mode (unlock all levels)
      const devMode = localStorage.getItem('cutfill_dev_mode') === 'true';
      if (devMode) {
        const maxLevel = this.getMaxLevelNumber();
        return Array.from({length: maxLevel}, (_, i) => i + 1);
      }

      if (userId === 'guest' || userId.startsWith('guest_')) {
        // Guest users have access to first 3 levels for better demo experience
        return [1, 2, 3];
      }

      const { data, error } = await supabase
        .from('user_progress')
        .select('unlocked_levels')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        console.log('No user progress found, defaulting to first 3 levels');
        return [1, 2, 3];
      }

      return data.unlocked_levels || [1, 2, 3];
    } catch (error) {
      console.error('Error getting unlocked levels:', error);
      return [1, 2, 3];
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
      .filter(assignment => userUnlockedLevels.includes(assignment.levelNumber || 1))
      .sort((a, b) => (a.levelNumber || 1) - (b.levelNumber || 1));
  }

  public isLevelUnlocked(levelNumber: number, userUnlockedLevels: number[]): boolean {
    return userUnlockedLevels.includes(levelNumber);
  }

  private getMaxLevelNumber(): number {
    const assignments = this.getAssignmentTemplates();
    return Math.max(...assignments.map(a => a.levelNumber || 1));
  }

  // Developer/Testing Methods
  public enableDeveloperMode(): void {
    localStorage.setItem('cutfill_dev_mode', 'true');
    console.log('🔧 Developer mode enabled - all levels unlocked');
  }

  public disableDeveloperMode(): void {
    localStorage.removeItem('cutfill_dev_mode');
    console.log('🔒 Developer mode disabled - normal progression restored');
  }

  public isDeveloperMode(): boolean {
    return localStorage.getItem('cutfill_dev_mode') === 'true';
  }

  // Easy level progression methods
  public async unlockLevel(userId: string, levelNumber: number): Promise<boolean> {
    try {
      if (userId === 'guest' || userId.startsWith('guest_')) {
        console.log('Guest users cannot unlock levels permanently');
        return false;
      }

      const unlockedLevels = await this.getUnlockedLevels(userId);
      
      if (unlockedLevels.includes(levelNumber)) {
        console.log(`Level ${levelNumber} already unlocked`);
        return true;
      }

      const updatedLevels = [...unlockedLevels, levelNumber].sort((a, b) => a - b);

      const { error } = await supabase
        .from('user_progress')
        .update({ unlocked_levels: updatedLevels })
        .eq('user_id', userId);

      if (error) {
        console.error('Error unlocking level:', error);
        return false;
      }

      console.log(`✅ Level ${levelNumber} unlocked for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error in unlockLevel:', error);
      return false;
    }
  }

  public async unlockAllLevels(userId: string): Promise<boolean> {
    try {
      if (userId === 'guest' || userId.startsWith('guest_')) {
        console.log('Guest users cannot unlock levels permanently');
        return false;
      }

      const maxLevel = this.getMaxLevelNumber();
      const allLevels = Array.from({length: maxLevel}, (_, i) => i + 1);

      const { error } = await supabase
        .from('user_progress')
        .update({ unlocked_levels: allLevels })
        .eq('user_id', userId);

      if (error) {
        console.error('Error unlocking all levels:', error);
        return false;
      }

      console.log(`🎉 All levels (1-${maxLevel}) unlocked for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error in unlockAllLevels:', error);
      return false;
    }
  }

  // Simplified level progression - lower minimum score requirement
  public async completeAssignmentWithEasyProgression(): Promise<void> {
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

    // Unlock next level with easier requirements (50% instead of minimum score)
    const easyProgressionScore = 50;
    if (this.progress.currentScore >= easyProgressionScore) {
      try {
        const levelNumber = this.currentAssignment.levelNumber || 1;
        const unlocked = await this.unlockNextLevel(this.progress.userId, levelNumber);
        if (unlocked) {
          console.log(`🎉 Level ${levelNumber + 1} unlocked! (Easy progression at ${this.progress.currentScore.toFixed(1)}%)`);
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

  /**
   * Load terrain configuration for the current assignment
   */
  private async loadTerrainForAssignment(assignment: AssignmentConfig): Promise<void> {
    try {
      // Extract level ID from assignment (assuming assignments have level indicators)
      const levelId = this.extractLevelIdFromAssignment(assignment);
      
      console.log(`🌍 Loading terrain for Level ${levelId}, Assignment: ${assignment.name}`);

      // Fetch terrain configuration from server
      const response = await fetch(`http://localhost:3001/api/terrain/${levelId}?assignmentId=${assignment.id}`);
      
      if (!response.ok) {
        console.warn(`Failed to load saved terrain for level ${levelId}, generating default terrain`);
        await this.generateDefaultTerrain(assignment, levelId);
        return;
      }

      const result = await response.json();
      
      if (result.success && result.terrain) {
        console.log('✅ Loaded saved terrain configuration:', result.terrain.name);
        await this.applyTerrainConfiguration(result.terrain);
        this.currentTerrainId = result.terrain.id;
      } else {
        console.warn('No saved terrain found, generating default terrain');
        await this.generateDefaultTerrain(assignment, levelId);
      }
    } catch (error) {
      console.error('Error loading terrain configuration:', error);
      // Fallback to existing terrain generation logic
      this.generateTerrainForAssignment(assignment);
    }
  }

  /**
   * Extract level ID from assignment data
   */
  private extractLevelIdFromAssignment(assignment: AssignmentConfig): number {
    // Check if assignment has explicit level_id
    if (assignment.levelNumber) {
      return assignment.levelNumber;
    }

    // Extract from assignment name or use existing logic
    if (assignment.name.includes('Foundation Preparation')) return 1;
    if (assignment.name.includes('Drainage Channel')) return 2;
    if (assignment.name.includes('Site Development')) return 3;
    
    // Default to level 1
    return 1;
  }

  /**
   * Apply terrain configuration from database
   */
  private async applyTerrainConfiguration(terrainConfig: any): Promise<void> {
    try {
      const terrainData = terrainConfig.terrain_data;
      
      if (terrainData.vertices && terrainData.vertices.length > 0) {
        // Apply saved vertex data directly
        console.log('🔧 Applying saved terrain vertices');
        this.terrain.importTerrain(terrainData);
      } else if (terrainData.pattern) {
        // Generate terrain using saved pattern
        console.log(`🔧 Generating terrain with pattern: ${terrainData.pattern}`);
        await this.generateTerrainFromPattern(terrainData.pattern, terrainData.parameters);
      }

      // Store original terrain data for comparison
      this.originalTerrainData = this.terrain.exportTerrain();
      
      console.log('✅ Terrain configuration applied successfully');
    } catch (error) {
      console.error('Error applying terrain configuration:', error);
      throw error;
    }
  }

  /**
   * Generate terrain from a specific pattern
   */
  private async generateTerrainFromPattern(pattern: string, parameters: any): Promise<void> {
    // Use existing terrain generation methods
    switch (pattern) {
      case 'flat':
        this.generateFlatTerrain();
        break;
      case 'gentle_slope':
        this.generateSlopeTerrain();
        break;
      case 'rolling':
        this.generateRollingTerrain();
        break;
      case 'valley':
        this.generateValleyTerrain();
        break;
      case 'hill':
        this.generateHillTerrain();
        break;
      default:
        this.generateFlatTerrain();
    }
  }

  /**
   * Generate default terrain when no saved configuration exists
   */
  private async generateDefaultTerrain(assignment: AssignmentConfig, levelId: number): Promise<void> {
    console.log(`🔧 Generating default terrain for Level ${levelId}`);
    
    // Generate terrain based on level requirements
    this.generateTerrainForAssignment(assignment);

    // Save the generated terrain as default for this level
    await this.saveTerrainAsDefault(assignment, levelId);
  }

  /**
   * Generate terrain based on assignment configuration
   */
  private generateTerrainForAssignment(assignment: AssignmentConfig): void {
    const terrainType = assignment.terrainConfig?.initialTerrain || 'flat';
    
    switch (terrainType) {
      case 'flat':
        this.generateFlatTerrain();
        break;
      case 'rolling':
        this.generateRollingTerrain();
        break;
      case 'rough':
        this.generateRoughTerrain();
        break;
      default:
        this.generateFlatTerrain();
    }
  }

  /**
   * Save current terrain as default for a level
   */
  private async saveTerrainAsDefault(assignment: AssignmentConfig, levelId: number): Promise<void> {
    try {
      // Get current user ID (implement based on your auth system)
      const userId = await this.getCurrentUserId();
      if (!userId) {
        console.log('No user authenticated, skipping terrain save');
        return;
      }

      const terrainData = this.terrain.exportTerrain();
      
      const saveData = {
        levelId: levelId,
        assignmentId: assignment.id,
        name: `${assignment.name} - Default Terrain`,
        description: `Auto-generated default terrain for ${assignment.name}`,
        terrainData: terrainData,
        terrainConfig: {
          width: 100,
          height: 100,
          pattern: this.getPatternForLevel(levelId)
        },
        isDefault: true,
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
        console.log('✅ Default terrain saved:', result.terrain.id);
        this.currentTerrainId = result.terrain.id;
      } else {
        console.warn('Failed to save default terrain:', response.statusText);
      }
    } catch (error) {
      console.error('Error saving default terrain:', error);
    }
  }

  /**
   * Get terrain pattern for a specific level
   */
  private getPatternForLevel(levelId: number): string {
    switch (levelId) {
      case 1: return 'flat';
      case 2: return 'gentle_slope';
      case 3: return 'rolling';
      default: return 'flat';
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
   * Save current terrain state (for manual saves)
   */
  async saveCurrentTerrain(name?: string, description?: string): Promise<boolean> {
    try {
      const userId = await this.getCurrentUserId();
      if (!userId) {
        console.log('No user authenticated, cannot save terrain');
        return false;
      }

      if (!this.currentAssignment) {
        console.log('No active assignment, cannot save terrain');
        return false;
      }

      const levelId = this.extractLevelIdFromAssignment(this.currentAssignment);
      const terrainData = this.terrain.exportTerrain();
      
      const saveData = {
        levelId: levelId,
        assignmentId: this.currentAssignment.id,
        name: name || `${this.currentAssignment.name} - Custom Save ${new Date().toLocaleTimeString()}`,
        description: description || `Manual save of terrain state during ${this.currentAssignment.name}`,
        terrainData: terrainData,
        terrainConfig: {
          width: 100,
          height: 100,
          pattern: 'custom'
        },
        isDefault: false,
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
        console.log('✅ Terrain saved:', result.terrain.id);
        this.showNotification('Terrain saved successfully!', 'success');
        return true;
      } else {
        console.warn('Failed to save terrain:', response.statusText);
        this.showNotification('Failed to save terrain', 'error');
        return false;
      }
    } catch (error) {
      console.error('Error saving terrain:', error);
      this.showNotification('Error saving terrain', 'error');
      return false;
    }
  }

  /**
   * Show notification to user
   */
  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    // Create simple notification - can be enhanced later
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Try to use existing notification systems if available
    if ((window as any).showNotification) {
      (window as any).showNotification(message, type);
    } else {
      // Fallback: create simple UI notification
      const notification = document.createElement('div');
      notification.textContent = message;
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 4px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        background-color: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#F44336' : '#2196F3'};
      `;
      
      document.body.appendChild(notification);
      
      // Remove after 3 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 3000);
    }
  }

  // Add missing terrain generation methods that are referenced but don't exist
  private generateFlatTerrain(): void {
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      
      // Mostly flat with very gentle undulation - updated to CLAUDE.md standards
      const flatNoise = this.smoothNoise(x * 0.02, z * 0.02) * 1.0; // ±1 yards variation
      const flatDetail = this.smoothNoise(x * 0.05, z * 0.05) * 0.5; // ±0.5 yards detail
      vertices[i + 1] = flatNoise + flatDetail;
    }
    
    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private generateSlopeTerrain(): void {
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      
      // Gentle slope with natural variation - updated to CLAUDE.md standards
      const slopeDirection = Math.PI * 0.3;
      const slopeStrength = 0.01; // Adjusted for yards
      let terrainHeight = (x * Math.cos(slopeDirection) + z * Math.sin(slopeDirection)) * slopeStrength;
      terrainHeight += this.smoothNoise(x * 0.02, z * 0.02) * 1.0; // ±1 yards variation
      terrainHeight += this.smoothNoise(x * 0.04, z * 0.04) * 0.5; // ±0.5 yards detail
      
      vertices[i + 1] = Math.max(-3, Math.min(3, terrainHeight)); // Clamp to ±3 yards
    }
    
    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private generateValleyTerrain(): void {
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;

    const centerX = 50; // 100 width / 2
    const centerZ = 50; // 100 height / 2
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      
      // Create valley - lower in center, higher on edges
      const distanceFromCenter = Math.sqrt((x - centerX) ** 2 + (z - centerZ) ** 2);
      const maxRadius = 50; // Max distance to edge
      const normalizedDistance = Math.min(distanceFromCenter / maxRadius, 1);
      
      // Valley shape: parabolic profile
      const valleyDepth = -2; // 2 yards deep at center
      const valleyHeight = normalizedDistance * normalizedDistance * (-valleyDepth) + valleyDepth;
      
      // Add natural variation
      const noise = this.smoothNoise(x * 0.03, z * 0.03) * 0.67; // 0.67 yards noise
      vertices[i + 1] = valleyHeight + noise;
    }
    
    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private generateHillTerrain(): void {
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (mesh.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;

    const centerX = 50; // 100 width / 2
    const centerZ = 50; // 100 height / 2
    
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      
      // Create hill - higher in center, lower on edges
      const distanceFromCenter = Math.sqrt((x - centerX) ** 2 + (z - centerZ) ** 2);
      const maxRadius = 50; // Max distance to edge
      const normalizedDistance = Math.min(distanceFromCenter / maxRadius, 1);
      
      // Hill shape: inverted parabolic profile
      const hillHeight = 2.67; // 2.67 yards high at center
      const currentHeight = hillHeight * (1 - normalizedDistance * normalizedDistance);
      
      // Add natural variation
      const noise = this.smoothNoise(x * 0.03, z * 0.03) * 0.5; // 0.5 yards noise
      vertices[i + 1] = currentHeight + noise;
    }
    
    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  /**
   * Simple noise function for terrain generation
   */
  private smoothNoise(x: number, y: number): number {
    return (Math.sin(x * 2.1 + Math.cos(y * 1.7)) + Math.sin(y * 1.9 + Math.cos(x * 2.3))) * 0.5;
  }
} 