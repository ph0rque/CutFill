import * as THREE from 'three';
import { Terrain } from './terrain';
import { supabase } from './supabase';
import { AgeScalingSystem } from './age-scaling';
import type { AgeGroup } from './age-scaling';

export interface AssignmentObjective {
  id: string;
  type:
    | 'level_area'
    | 'create_channel'
    | 'volume_target'
    | 'grade_road'
    | 'build_foundation'
    | 'drainage_system';
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
  category:
    | 'foundation'
    | 'drainage'
    | 'grading'
    | 'excavation'
    | 'road_construction';
  estimatedTime: number; // minutes
  levelNumber?: number; // Sequential level (1, 2, 3...)
  idealOperations?: number; // Hand-authored par count for operations efficiency
  levelVersion?: number; // Version for future level updates
  isCompetitive?: boolean; // Whether this level has competitive multiplayer mode
  ageBracket?: 'kids' | 'teens' | 'adults'; // Age bracket categorization
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
  passed?: boolean; // Pass/fail determination based on objectives
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

  // Assignment Templates - 3 levels per age bracket
  public getAssignmentTemplates(): AssignmentConfig[] {
    return [
      // KIDS BRACKET (Ages 8-12) - Simple, fun tasks with forgiving tolerances
      {
        id: 'kids_level_1',
        name: '🏠 Build a Sandbox',
        description: 'Level the ground to create a perfect sandbox for kids to play!',
        difficulty: 1,
        category: 'foundation',
        estimatedTime: 8,
        levelNumber: 1,
        idealOperations: 8,
        levelVersion: 1,
        isCompetitive: false,
        ageBracket: 'kids',
        objectives: [
          {
            id: 'level_sandbox',
            type: 'level_area',
            description: 'Make a flat 10×10 yard area for the sandbox',
            target: { x: 0, z: 0, width: 30, height: 30, elevation: 0 }, // 30 feet = 10 yards
            tolerance: 1.5, // Very forgiving - 1.5 feet = 0.5 yards
            weight: 1.0,
            completed: false,
            score: 0,
          },
        ],
        terrainConfig: {
          width: 40,
          height: 40,
          initialTerrain: 'flat',
        },
        tools: ['cut', 'fill'],
        hints: [
          '🎯 Use the cut tool to lower high spots',
          '🏔️ Use the fill tool to raise low spots',
          '🎨 Try to make it as flat as possible!',
        ],
        successCriteria: {
          minimumScore: 60,
          timeBonus: false,
          volumeEfficiency: false,
        },
      },
      {
        id: 'kids_level_2',
        name: '🌊 Make a Small Creek',
        description: 'Dig a gentle creek that water can flow through!',
        difficulty: 2,
        category: 'drainage',
        estimatedTime: 12,
        levelNumber: 2,
        idealOperations: 15,
        levelVersion: 1,
        isCompetitive: false,
        ageBracket: 'kids',
        objectives: [
          {
            id: 'dig_creek',
            type: 'create_channel',
            description: 'Dig a creek 10 yards long, 0.67 yards wide, 0.33 yards deep',
            target: {
              startPoint: { x: -15, z: 0 }, // -5 yards
              endPoint: { x: 15, z: 0 },   // +5 yards
              width: 2,    // 2 feet
              depth: 1,    // 1 foot
              slope: 0.02,
            },
            tolerance: 1.5, // Very forgiving - 0.5 yards
            weight: 1.0,
            completed: false,
            score: 0,
          },
        ],
        terrainConfig: {
          width: 40,
          height: 30,
          initialTerrain: 'rolling',
        },
        tools: ['cut', 'fill'],
        hints: [
          '🌊 Start at the high end and dig downhill',
          '⛏️ Make the creek about 0.67 yards wide',
          '🏞️ Water likes to flow downhill!',
        ],
        successCriteria: {
          minimumScore: 65,
          timeBonus: false,
          volumeEfficiency: false,
        },
      },
      {
        id: 'kids_level_3',
        name: '🛤️ Build a Fun Path',
        description: 'Create a smooth path that connects two areas!',
        difficulty: 3,
        category: 'grading',
        estimatedTime: 15,
        levelNumber: 3,
        idealOperations: 20,
        levelVersion: 1,
        isCompetitive: false,
        ageBracket: 'kids',
        objectives: [
          {
            id: 'build_path',
            type: 'grade_road',
            description: 'Make a smooth 2.67-yard wide path (13 yards long)',
            target: { width: 8, maxGrade: 0.1, length: 40 }, // 8 feet wide, 40 feet = 13 yards long
            tolerance: 1.5, // 0.5 yards
            weight: 1.0,
            completed: false,
            score: 0,
          },
        ],
        terrainConfig: {
          width: 50,
          height: 40,
          initialTerrain: 'rolling',
        },
        tools: ['cut', 'fill'],
        hints: [
          '🛤️ Make the path 2.67 yards wide',
          '📏 Keep it not too steep for walking',
          '✨ Smooth and even is best!',
        ],
        successCriteria: {
          minimumScore: 70,
          timeBonus: false,
          volumeEfficiency: false,
        },
      },

      // TEENS BRACKET (Ages 13-25) - STEM focused with moderate complexity
      {
        id: 'teens_level_1',
        name: '🏗️ Foundation Engineering',
        description: 'Engineer a precise foundation pad using real construction tolerances',
        difficulty: 2,
        category: 'foundation',
        estimatedTime: 15,
        levelNumber: 1,
        idealOperations: 25,
        levelVersion: 1,
        isCompetitive: false,
        ageBracket: 'teens',
        objectives: [
          {
            id: 'foundation_pad',
            type: 'level_area',
            description: 'Create a level 13×13 yard foundation within ±3 inch tolerance',
            target: { x: 0, z: 0, width: 40, height: 40, elevation: 0 }, // 40 feet = 13.3 yards
            tolerance: 0.25, // 3 inches - realistic construction tolerance
            weight: 0.8,
            completed: false,
            score: 0,
          },
          {
            id: 'material_efficiency',
            type: 'volume_target',
            description: 'Minimize waste - keep net volume under 20 cubic yards',
            target: { maxNetMovement: 20 },
            tolerance: 0.1,
            weight: 0.2,
            completed: false,
            score: 0,
          },
        ],
        terrainConfig: {
          width: 50,
          height: 50,
          initialTerrain: 'rolling',
        },
        tools: ['cut', 'fill'],
        hints: [
          '📐 Construction requires precise leveling',
          '♻️ Balance cut and fill to minimize waste',
          '🎯 Use surveying principles for accuracy',
        ],
        successCriteria: {
          minimumScore: 75,
          timeBonus: true,
          volumeEfficiency: true,
        },
      },
      {
        id: 'teens_level_2',
        name: '🌊 Hydraulic Engineering',
        description: 'Design a drainage system with proper hydraulic principles',
        difficulty: 3,
        category: 'drainage',
        estimatedTime: 20,
        levelNumber: 2,
        idealOperations: 35,
        levelVersion: 1,
        isCompetitive: false,
        ageBracket: 'teens',
        objectives: [
          {
            id: 'drainage_channel',
            type: 'create_channel',
            description: 'Create 13-yard channel with 2% grade for optimal water flow',
            target: {
              startPoint: { x: -20, z: 0 }, // Start at -6.7 yards
              endPoint: { x: 20, z: 0 },   // End at +6.7 yards (13.3 yards total)
              width: 4,  // 4 feet wide
              depth: 2,  // 2 feet deep
              slope: 0.02,
            },
            tolerance: 0.15,
            weight: 0.7,
            completed: false,
            score: 0,
          },
          {
            id: 'side_stability',
            type: 'grade_road',
            description: 'Engineer stable 3:1 side slopes to prevent erosion',
            target: { slopeRatio: 3 },
            tolerance: 0.3,
            weight: 0.3,
            completed: false,
            score: 0,
          },
        ],
        terrainConfig: {
          width: 60,
          height: 40,
          initialTerrain: 'rough',
        },
        tools: ['cut', 'fill'],
        hints: [
          '📊 2% grade = 2 feet drop per 100 feet',
          '⚖️ Stable slopes prevent landslides',
          '🔬 Apply hydraulic engineering principles',
        ],
        successCriteria: {
          minimumScore: 80,
          timeBonus: true,
          volumeEfficiency: true,
        },
      },
      {
        id: 'teens_level_3',
        name: '🛣️ Transportation Engineering',
        description: 'Design a road section meeting transportation standards',
        difficulty: 4,
        category: 'road_construction',
        estimatedTime: 25,
        levelNumber: 3,
        idealOperations: 45,
        levelVersion: 1,
        isCompetitive: false,
        ageBracket: 'teens',
        objectives: [
          {
            id: 'road_grade',
            type: 'grade_road',
            description: 'Maintain max 6% grade for safe vehicle travel (27-yard road)',
            target: { maxGrade: 0.06, length: 80 }, // 80 feet = 26.7 yards
            tolerance: 0.01,
            weight: 0.4,
            completed: false,
            score: 0,
          },
          {
            id: 'road_crown',
            type: 'level_area',
            description: 'Create 2% crown for water drainage (4-yard width)',
            target: { crownPercent: 0.02, width: 12 }, // 12 feet = 4 yards
            tolerance: 0.005,
            weight: 0.3,
            completed: false,
            score: 0,
          },
          {
            id: 'volume_balance',
            type: 'volume_target',
            description: 'Balance cut/fill to minimize truck hauling costs',
            target: { balanceTolerance: 0.1 },
            tolerance: 0.05,
            weight: 0.3,
            completed: false,
            score: 0,
          },
        ],
        terrainConfig: {
          width: 100,
          height: 30,
          initialTerrain: 'rolling',
        },
        tools: ['cut', 'fill'],
        hints: [
          '🚗 Roads steeper than 6% are unsafe',
          '🌧️ Crown sheds water to prevent flooding',
          '💰 Balanced earthwork saves money',
        ],
        successCriteria: {
          minimumScore: 85,
          timeBonus: true,
          volumeEfficiency: true,
        },
      },

      // ADULTS BRACKET (Ages 26+) - Professional grade challenges
      {
        id: 'adults_level_1',
        name: '🏢 Commercial Foundation',
        description: 'Execute precision foundation work to professional construction standards',
        difficulty: 3,
        category: 'foundation',
        estimatedTime: 20,
        levelNumber: 1,
        idealOperations: 40,
        levelVersion: 1,
        isCompetitive: false,
        ageBracket: 'adults',
        objectives: [
          {
            id: 'precision_foundation',
            type: 'level_area',
            description: 'Level 17×10 yard foundation to ±1 inch tolerance',
            target: { x: 0, z: 0, width: 50, height: 30, elevation: 0 }, // 50×30 feet = 17×10 yards
            tolerance: 0.083, // 1 inch - professional tolerance
            weight: 0.6,
            completed: false,
            score: 0,
          },
          {
            id: 'elevation_control',
            type: 'level_area',
            description: 'Maintain precise elevation control across entire pad',
            target: { elevationVariance: 0.05 },
            tolerance: 0.02,
            weight: 0.2,
            completed: false,
            score: 0,
          },
          {
            id: 'material_optimization',
            type: 'volume_target',
            description: 'Optimize material usage - net movement under 10 cubic yards',
            target: { maxNetMovement: 10 },
            tolerance: 0.05,
            weight: 0.2,
            completed: false,
            score: 0,
          },
        ],
        terrainConfig: {
          width: 60,
          height: 40,
          initialTerrain: 'rolling',
        },
        tools: ['cut', 'fill'],
        hints: [
          '📏 Professional construction requires ±1 inch accuracy',
          '🎯 Use grid methodology for consistent elevation',
          '💼 Minimize material costs through planning',
        ],
        successCriteria: {
          minimumScore: 85,
          timeBonus: true,
          volumeEfficiency: true,
        },
      },
      {
        id: 'adults_level_2',
        name: '🌊 Stormwater Management',
        description: 'Design complex drainage system meeting municipal standards',
        difficulty: 4,
        category: 'drainage',
        estimatedTime: 30,
        levelNumber: 2,
        idealOperations: 60,
        levelVersion: 1,
        isCompetitive: false,
        ageBracket: 'adults',
        objectives: [
          {
            id: 'primary_channel',
            type: 'create_channel',
            description: 'Main channel: 20-yard long, 6 ft wide, 3 ft deep, 1.5% grade',
            target: {
              startPoint: { x: -30, z: 0 }, // -10 yards
              endPoint: { x: 30, z: 0 },   // +10 yards (20 yards total)
              width: 6,  // 6 feet wide
              depth: 3,  // 3 feet deep
              slope: 0.015,
            },
            tolerance: 0.05, // Tight professional tolerance
            weight: 0.4,
            completed: false,
            score: 0,
          },
          {
            id: 'detention_basin',
            type: 'level_area',
            description: 'Create detention basin for flood control (7×5 yards)',
            target: { x: 15, z: -20, width: 20, height: 15, depth: 4 }, // 20×15 feet = 7×5 yards
            tolerance: 0.1,
            weight: 0.3,
            completed: false,
            score: 0,
          },
          {
            id: 'side_slopes',
            type: 'grade_road',
            description: 'Engineer 4:1 slopes for maintenance access',
            target: { slopeRatio: 4 },
            tolerance: 0.2,
            weight: 0.3,
            completed: false,
            score: 0,
          },
        ],
        terrainConfig: {
          width: 80,
          height: 60,
          initialTerrain: 'rough',
        },
        tools: ['cut', 'fill'],
        hints: [
          '🏛️ Municipal standards require precise grading',
          '🌊 Detention basins prevent downstream flooding',
          '🚜 Slopes must allow maintenance equipment access',
        ],
        successCriteria: {
          minimumScore: 90,
          timeBonus: true,
          volumeEfficiency: true,
        },
      },
      {
        id: 'adults_level_3',
        name: '🛣️ Highway Construction',
        description: 'Execute complex highway grading to DOT specifications',
        difficulty: 5,
        category: 'road_construction',
        estimatedTime: 40,
        levelNumber: 3,
        idealOperations: 80,
        levelVersion: 1,
        isCompetitive: false,
        ageBracket: 'adults',
        objectives: [
          {
            id: 'mainline_profile',
            type: 'grade_road',
            description: 'Highway profile: max 4% grade, 2% crown (40-yard section)',
            target: { maxGrade: 0.04, crownPercent: 0.02, length: 120 }, // 120 feet = 40 yards
            tolerance: 0.002, // Very tight tolerance
            weight: 0.3,
            completed: false,
            score: 0,
          },
          {
            id: 'cut_slopes',
            type: 'grade_road',
            description: 'Cut slopes: 2:1 ratio for rock, 3:1 for soil',
            target: { cutSlopeRatio: 2, soilSlopeRatio: 3 },
            tolerance: 0.1,
            weight: 0.25,
            completed: false,
            score: 0,
          },
          {
            id: 'fill_slopes',
            type: 'grade_road',
            description: 'Fill slopes: 3:1 ratio with proper compaction zones',
            target: { fillSlopeRatio: 3, compactionZones: true },
            tolerance: 0.1,
            weight: 0.25,
            completed: false,
            score: 0,
          },
          {
            id: 'earthwork_balance',
            type: 'volume_target',
            description: 'Achieve optimal cut/fill balance (±2%)',
            target: { balanceTolerance: 0.02 },
            tolerance: 0.01,
            weight: 0.2,
            completed: false,
            score: 0,
          },
        ],
        terrainConfig: {
          width: 140,
          height: 40,
          initialTerrain: 'rolling',
        },
        tools: ['cut', 'fill'],
        hints: [
          '🛣️ DOT specifications are non-negotiable',
          '⛰️ Different materials require different slope ratios',
          '💰 Earthwork balance minimizes project costs',
          '📊 Maintain precise cross-sectional geometry',
        ],
        successCriteria: {
          minimumScore: 95,
          timeBonus: true,
          volumeEfficiency: true,
        },
      },
    ];
  }

  public async getAvailableAssignments(): Promise<AssignmentConfig[]> {
    // Use progression system templates (with 9 assignments) and filter by user's age bracket
    console.log('Using progression system assignments (9 total: 3 per age bracket)');
    
    // Determine user's age bracket
    let ageBracket: 'kids' | 'teens' | 'adults' = 'teens'; // default
    
    // For guests, get their age bracket from localStorage
    const userId = await this.getCurrentUserId();
    console.log(`Current user ID: ${userId}`);
    if (userId === 'guest' || userId?.startsWith('guest_')) {
      const guestData = localStorage.getItem('guestData');
      console.log(`Guest data from localStorage: ${guestData}`);
      if (guestData) {
        const parsedGuestData = JSON.parse(guestData);
        console.log(`Parsed guest data:`, parsedGuestData);
        console.log(`Age range from data: ${parsedGuestData.ageRange}`);
        ageBracket = this.getAgeBracketFromRange(parsedGuestData.ageRange || '13-25');
        console.log(`Age bracket result: ${ageBracket} (from range: ${parsedGuestData.ageRange})`);
        
        // Important: Set the age scaling system to match the user's bracket
        this.ageScaling.setAgeGroup(ageBracket);
        console.log(`Age scaling system updated to: ${ageBracket}`);
      } else {
        console.log('No guest data found in localStorage');
      }
    } else {
      console.log(`Not a guest user, userId: ${userId}`);
    }
    
    // Get assignments for the user's age bracket
    const allAssignments = this.getAssignmentTemplates();
    const filteredAssignments = allAssignments.filter(assignment => assignment.ageBracket === ageBracket);
    
    console.log(`Filtered to ${filteredAssignments.length} assignments for ${ageBracket} bracket`);
    
    return filteredAssignments.map(assignment =>
      this.ageScaling.scaleAssignment(assignment)
    );
  }

  private convertDatabaseToConfig(dbAssignment: any): AssignmentConfig {
    // Ensure objectives are properly formatted
    let objectives: AssignmentObjective[] = [];
    if (Array.isArray(dbAssignment.objectives)) {
      objectives = dbAssignment.objectives.filter(
        (obj: any) =>
          obj && typeof obj === 'object' && obj.description && obj.id
      );
    }

    // If no valid objectives, create a default one
    if (objectives.length === 0) {
      objectives = [
        {
          id: 'default_objective',
          type: 'level_area',
          description: 'Complete the assignment objectives',
          target: { x: 0, z: 0, width: 20, height: 20, elevation: 0 },
          tolerance: 0.5,
          weight: 1.0,
          completed: false,
          score: 0,
        },
      ];
    }

    return {
      id: dbAssignment.id,
      name: dbAssignment.name,
      description: dbAssignment.description,
      difficulty: dbAssignment.difficulty_level,
      category: dbAssignment.name.toLowerCase().includes('foundation')
        ? 'foundation'
        : 'grading',
      estimatedTime: 15,
      objectives,
      terrainConfig: dbAssignment.terrain_config || {
        width: 50,
        height: 50,
        initialTerrain: 'rolling',
      },
      tools: ['cut', 'fill'],
      hints: ['Complete the objectives within tolerance'],
      successCriteria: {
        minimumScore: 70,
        timeBonus: true,
        volumeEfficiency: true,
      },
    };
  }

  public async startAssignment(
    assignmentId: string,
    userId: string
  ): Promise<boolean> {
    console.log(`Starting assignment: ${assignmentId} for user: ${userId}`);

    const assignments = await this.getAvailableAssignments();
    console.log(`Found ${assignments.length} available assignments`);

    const assignment = assignments.find(a => a.id === assignmentId);

    if (!assignment) {
      console.error('Assignment not found:', assignmentId);
      console.error(
        'Available assignment IDs:',
        assignments.map(a => a.id)
      );
      return false;
    }

    console.log(`Found assignment: ${assignment.name}`);
    console.log('Assignment config:', assignment);

    this.currentAssignment = assignment;
    let objectives: AssignmentObjective[] = [];
    if (Array.isArray(assignment.objectives)) {
      objectives = assignment.objectives.filter(
        (obj: any) =>
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
        score: 0,
      })),
      volumeData: {
        totalCut: 0,
        totalFill: 0,
        netMovement: 0,
        efficiency: 1,
      },
      toolsUsed: [],
      completed: false,
      attempts: 1,
    };

    // Configure terrain for assignment (now async)
    await this.setupTerrainForAssignment(assignment);

    // Wait for terrain to fully initialize before starting progress monitoring
    setTimeout(() => {
      this.startProgressMonitoring();
    }, 500); // 500ms delay to ensure terrain reset and setup operations are complete

    return true;
  }

  private async setupTerrainForAssignment(
    assignment: AssignmentConfig
  ): Promise<void> {
    console.log(`Setting up terrain for assignment: ${assignment.name}`);

    // Reset terrain first
    this.terrain.reset();

    // Wait for terrain to be fully reset before continuing
    await new Promise(resolve => setTimeout(resolve, 200));

    // Try to load saved terrain from database
    const savedTerrain = await this.loadSavedTerrain(assignment.levelNumber, assignment.name);

    if (savedTerrain) {
      console.log(`Loading saved terrain for level ${assignment.levelNumber}`);
      await this.applySavedTerrain(savedTerrain);
    } else {
      console.log(
        `No saved terrain found, using fallback generation for level ${assignment.levelNumber}`
      );
      // Fallback to existing terrain generation
      const config = assignment.terrainConfig;

      // Wait a bit more to ensure mesh is ready for generation
      await new Promise(resolve => setTimeout(resolve, 100));

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
    const result = this.getValidatedMeshAndVertices();
    if (!result) return;
    
    const { mesh, vertices } = result;

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

    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private generateRoughTerrain(): void {
    const result = this.getValidatedMeshAndVertices();
    if (!result) return;
    
    const { mesh, vertices } = result;

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

    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private applyCustomHeights(heights: number[]): void {
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (
      mesh.geometry.attributes.position as THREE.BufferAttribute
    ).array as Float32Array;

    for (let i = 0; i < vertices.length && i < heights.length; i += 3) {
      vertices[i + 1] = heights[i / 3];
    }

    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  // New methods for terrain persistence
  private async loadSavedTerrain(
    levelNumber: number | undefined,
    assignmentId?: string
  ): Promise<any> {
    if (!levelNumber) {
      console.log('No level number provided, cannot load saved terrain');
      return null;
    }

    try {
      // Try to load from Supabase level_terrains table
      const { data, error } = await supabase
        .from('level_terrains')
        .select('*')
        .eq('level_id', levelNumber)
        .eq('is_default', true)
        .single();

      if (error || !data) {
        console.log(
          `No saved terrain found for level ${levelNumber} in Supabase`
        );
        return null;
      }

      if (data.terrain_data) {
        console.log(
          `Successfully loaded saved terrain for level ${levelNumber} from Supabase`
        );
        return data.terrain_data;
      } else {
        console.log(`Invalid terrain data in Supabase for level ${levelNumber}`);
        return null;
      }
    } catch (error) {
      console.error(
        `Error loading saved terrain for level ${levelNumber}:`,
        error
      );
      return null;
    }
  }

  private async applySavedTerrain(terrainConfig: any): Promise<void> {
    console.log('Applying saved terrain configuration');
    
    // If mesh validation fails, fall back to simple terrain generation
    const validation = this.getValidatedMeshAndVertices();
    if (!validation) {
      console.log('Mesh not ready for saved terrain, using fallback generation');
      // Fall back to simple terrain generation based on pattern
      this.generateTerrainFallback(terrainConfig.pattern || 'flat');
      return;
    }
    
    try {
      // Apply terrain pattern
      if (terrainConfig.pattern === 'flat') {
        this.generateFlatTerrain();
      } else if (terrainConfig.pattern === 'rolling') {
        this.generateRollingTerrain();
      } else if (terrainConfig.pattern === 'rough') {
        this.generateRoughTerrain();
      } else if (terrainConfig.pattern === 'gentle') {
        this.generateGentleSlopeTerrain();
      } else {
        // Unknown pattern, use flat as default
        this.generateFlatTerrain();
      }
      
      console.log(`Applied saved terrain pattern: ${terrainConfig.pattern}`);
    } catch (error) {
      console.error('Error applying terrain pattern:', error);
      // Final fallback to ensure terrain is playable
      this.generateTerrainFallback('flat');
    }
  }

  private generateTerrainFallback(pattern: string): void {
    console.log(`Using fallback terrain generation for pattern: ${pattern}`);
    // Simple terrain generation that doesn't rely on mesh validation
    // The terrain reset should have already set it to flat, so this is mainly for logging
    switch (pattern) {
      case 'rolling':
        console.log('Terrain set to rolling (simplified)');
        break;
      case 'rough':
        console.log('Terrain set to rough (simplified)');
        break;
      default:
        console.log('Terrain set to flat (default)');
        break;
    }
  }

  private getValidatedMeshAndVertices(): { mesh: THREE.Mesh; vertices: Float32Array } | null {
    const meshObject = this.terrain.getMesh();
    
    // Multiple validation checks for robustness
    if (!meshObject) {
      console.warn('No mesh available');
      return null;
    }
    
    const mesh = meshObject as THREE.Mesh;
    if (!mesh.geometry) {
      console.warn('Mesh has no geometry');
      return null;
    }
    
    if (!mesh.geometry.attributes) {
      console.warn('Mesh geometry has no attributes');
      return null;
    }
    
    if (!mesh.geometry.attributes.position) {
      console.warn('Mesh geometry has no position attribute');
      return null;
    }
    
    const vertices = mesh.geometry.attributes.position.array as Float32Array;
    if (!vertices || vertices.length === 0) {
      console.warn('Position array is empty or invalid');
      return null;
    }
    
    console.log(`Mesh validation passed - vertices: ${vertices.length}`);
    return { mesh, vertices };
  }

  private generateFlatTerrain(parameters?: any): void {
    const result = this.getValidatedMeshAndVertices();
    if (!result) return;
    
    const { mesh, vertices } = result;

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];

      // Gentle undulations for flat terrain - using CLAUDE.md standards
      const smallVariation = this.smoothNoise(x * 0.02, z * 0.02) * 0.5; // 0.5 yards variation
      const fineDetail = this.smoothNoise(x * 0.05, z * 0.05) * 0.25; // 0.25 yards detail

      const terrainHeight = smallVariation + fineDetail;
      vertices[i + 1] = Math.max(-1, Math.min(1, terrainHeight)); // Clamp to ±1 yards
    }

    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private generateGentleSlopeTerrain(parameters?: any): void {
    const result = this.getValidatedMeshAndVertices();
    if (!result) return;
    
    const { mesh, vertices } = result;

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];

      // Gentle slope with drainage patterns - using CLAUDE.md standards
      const primarySlope = x * 0.015 + z * 0.01; // Overall slope
      const drainagePattern = Math.sin(x * 0.025) * 0.3; // Drainage channels
      const variation = this.smoothNoise(x * 0.03, z * 0.03) * 0.5; // Natural variation

      const terrainHeight = primarySlope + drainagePattern + variation;
      vertices[i + 1] = Math.max(-3, Math.min(3, terrainHeight)); // Clamp to ±3 yards
    }

    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;
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
      totalCut: volumeData.cut / 27, // Convert to cubic yards
      totalFill: volumeData.fill / 27, // Convert to cubic yards
      netMovement: Math.abs(volumeData.net) / 27, // Convert to cubic yards
      efficiency: volumeData.fill > 0 ? volumeData.cut / volumeData.fill : 0,
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

    // Phase 2: Implement Pass/Fail Logic
    // Pass/Fail determination: Must complete ALL objectives to pass
    const allObjectivesMet = this.progress.objectives.every(obj => obj.completed);
    this.progress.passed = allObjectivesMet;

    if (allObjectivesMet) {
      // Calculate enhanced scoring only if passed (50% Net-Zero + 50% Operations Efficiency)
      const netVolumeYards = Math.abs(this.progress.volumeData.netMovement);
      
      // Apply age-adjusted tolerance for net-zero scoring
      const ageGroup = this.ageScaling.getCurrentAgeGroup();
      const toleranceFactor = ageGroup.toleranceMultiplier;
      const netZeroScore = Math.max(0, 100 - (netVolumeYards * (10 / toleranceFactor))); // Adjusted for age
      
      // Operations efficiency score (already calculated in addToolUsage)
      const operationsScore = this.progress.operationsEfficiencyScore;
      
      // New scoring: 50% Net-Zero Closeness + 50% Operations Efficiency (no objectives component since pass/fail is separate)
      this.progress.currentScore = (netZeroScore * 0.5) + (operationsScore * 0.5);
    } else {
      // Failed - score is 0
      this.progress.currentScore = 0;
    }

    // Only log when there are actual operations or score changes
    if (this.progress.operationCount > 0 || this.progress.currentScore > 0) {
      console.log(
        `Pass/Fail: ${this.progress.passed ? 'PASSED' : 'FAILED'}, Score: ${this.progress.currentScore.toFixed(1)}/100, Operations Count: ${this.progress.operationCount}`
      );
    }

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
      if (
        !mesh ||
        !mesh.geometry ||
        !mesh.geometry.attributes ||
        !mesh.geometry.attributes.position
      ) {
        // Silently return 0 during initialization - no need to spam console warnings
        return 0;
      }

      const positionAttribute = mesh.geometry.attributes
        .position as THREE.BufferAttribute;

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

  private evaluateLevelArea(
    objective: AssignmentObjective,
    vertices: Float32Array
  ): number {
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
      if (
        x >= target.x - target.width / 2 &&
        x <= target.x + target.width / 2 &&
        z >= target.z - target.height / 2 &&
        z <= target.z + target.height / 2
      ) {
        pointsInArea++;
        minHeight = Math.min(minHeight, y);
        maxHeight = Math.max(maxHeight, y);

        // Check if height is within tolerance
        if (Math.abs(y - target.elevation) <= tolerance) {
          pointsWithinTolerance++;
        }
      }
    }

    const score =
      pointsInArea > 0 ? (pointsWithinTolerance / pointsInArea) * 100 : 0;

    // Debug logging (only log every 10 evaluations to avoid spam)
    if (Math.random() < 0.1) {
      const status = pointsWithinTolerance === pointsInArea ? '✓' : '✗';
      console.log(`🎯 Level Area Evaluation:
      Target: ${(target.width / 3).toFixed(1)}×${(target.height / 3).toFixed(1)} yards at (${(target.x / 3).toFixed(1)}, ${(target.z / 3).toFixed(1)}) yards
      Target elevation: ${(target.elevation / 3).toFixed(1)} yards
      Tolerance: ±${(tolerance / 3).toFixed(2)} yards
      
      Status: ${status} (${pointsWithinTolerance}/${pointsInArea} points within tolerance)
      Height range in area: ${(minHeight / 3).toFixed(2)} to ${(maxHeight / 3).toFixed(2)} yards
      Current score: ${score.toFixed(1)}%`);
    }

    return score;
  }

  private evaluateVolumeTarget(objective: AssignmentObjective): number {
    const target = objective.target;
    const volumeData = this.progress!.volumeData;

    if (target.maxNetMovement) {
      const excess = Math.max(
        0,
        volumeData.netMovement - target.maxNetMovement
      );
      return Math.max(0, 100 - (excess / target.maxNetMovement) * 100);
    }

    if (target.balanceTolerance) {
      const imbalance = Math.abs(volumeData.totalCut - volumeData.totalFill);
      const total = volumeData.totalCut + volumeData.totalFill;
      const imbalanceRatio = total > 0 ? imbalance / total : 0;
      return Math.max(
        0,
        100 - (imbalanceRatio / target.balanceTolerance) * 100
      );
    }

    // Speed/time-based scoring disabled for relaxed gameplay
    if (target.timeTarget) {
      // Always return full score for time-based objectives - no time pressure
      return 100;
    }

    // Additional competitive scoring metrics
    if (target.volumeAccuracy) {
      const actualAccuracy =
        1 -
        volumeData.netMovement /
          (volumeData.totalCut + volumeData.totalFill + 1);
      const accuracyScore = Math.max(
        0,
        (actualAccuracy / target.volumeAccuracy) * 100
      );
      return Math.min(100, accuracyScore);
    }

    if (target.fillEfficiency) {
      const efficiency =
        volumeData.totalFill > 0
          ? volumeData.totalCut / volumeData.totalFill
          : 1;
      const efficiencyScore = (efficiency / target.fillEfficiency) * 100;
      return Math.min(100, efficiencyScore);
    }

    return 0;
  }

  private evaluateChannelCreation(
    objective: AssignmentObjective,
    vertices: Float32Array
  ): number {
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

  private evaluateRoadGrade(
    objective: AssignmentObjective,
    vertices: Float32Array
  ): number {
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

    // Unlock next level if assignment passed (new system: check passed flag)
    if (this.progress.passed) {
      try {
        const levelNumber = this.currentAssignment.levelNumber || 1;
        const unlocked = await this.unlockNextLevel(
          this.progress.userId,
          levelNumber
        );
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
    if (
      this.progress.userId === 'guest' ||
      this.progress.userId.startsWith('guest_')
    ) {
      console.log('Guest user - assignment progress saved locally only');
      return;
    }

    try {
      const { error } = await supabase.from('user_assignments').upsert({
        user_id: this.progress.userId,
        assignment_id: this.progress.assignmentId,
        completed_at: this.progress.endTime?.toISOString(),
        score: Math.round(this.progress.currentScore),
        volume_data: this.progress.volumeData,
        completion_time:
          this.progress.endTime && this.progress.startTime
            ? Math.round(
                (this.progress.endTime.getTime() -
                  this.progress.startTime.getTime()) /
                  1000
              )
            : null,
        is_completed: this.progress.completed,
        updated_at: new Date().toISOString(),
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
      const xpReward = Math.round(
        baseXP * difficultyMultiplier * scoreMultiplier
      );

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
            total_volume_moved:
              currentProgress.total_volume_moved +
              this.progress.volumeData.totalCut +
              this.progress.volumeData.totalFill,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', this.progress.userId);

        if (error) {
          console.error('Failed to update user progress:', error);
        } else {
          console.log(
            `Updated user progress: +${xpReward} XP, +1 assignment completed`
          );
        }
      } else {
        // Create new progress record
        const { error } = await supabase.from('user_progress').insert({
          user_id: this.progress.userId,
          experience: xpReward,
          assignments_completed: 1,
          total_volume_moved:
            this.progress.volumeData.totalCut +
            this.progress.volumeData.totalFill,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (error) {
          console.error('Failed to create user progress:', error);
        } else {
          console.log(
            `Created user progress: ${xpReward} XP, 1 assignment completed`
          );
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
        this.progress.operationsEfficiencyScore = Math.min(
          100,
          (idealOperations / this.progress.operationCount) * 100
        );
      }

      console.log(
        `Operation ${this.progress.operationCount} recorded. Efficiency: ${this.progress.operationsEfficiencyScore.toFixed(1)}%`
      );
    }
  }

  // Competitive scoring integration
  private updateCompetitiveScores(): void {
    if (!this.progress || !this.currentAssignment?.isCompetitive) return;

    // Check if multiplayer manager is available globally
    if (
      typeof (window as any).multiplayerManager === 'object' &&
      (window as any).multiplayerManager
    ) {
      const multiplayerManager = (window as any).multiplayerManager;
      if (
        multiplayerManager.updateLiveScore &&
        typeof multiplayerManager.updateLiveScore === 'function'
      ) {
        multiplayerManager.updateLiveScore(this.progress.userId, this.progress);
      }
    }
  }

  // Level progression methods
  // Get all levels for a specific age bracket (always unlocked per requirement)
  public getUnlockedLevelsForAgeBracket(ageBracket: 'kids' | 'teens' | 'adults'): number[] {
    // Always return all three levels for the specified age bracket
    return [1, 2, 3];
  }

  // Get assignments filtered by age bracket
  public getAssignmentsByAgeBracket(ageBracket: 'kids' | 'teens' | 'adults'): AssignmentConfig[] {
    return this.getAssignmentTemplates()
      .filter(assignment => assignment.ageBracket === ageBracket)
      .sort((a, b) => (a.levelNumber || 1) - (b.levelNumber || 1));
  }

  public async getUnlockedLevels(userId: string): Promise<number[]> {
    try {
      // Check for developer mode (unlock all levels)
      const devMode = localStorage.getItem('cutfill_dev_mode') === 'true';
      if (devMode) {
        const maxLevel = this.getMaxLevelNumber();
        return Array.from({ length: maxLevel }, (_, i) => i + 1);
      }

      if (userId === 'guest' || userId.startsWith('guest_')) {
        // For guests, get their age bracket and return appropriate levels
        const guestData = localStorage.getItem('guestData');
        if (guestData) {
          const parsedGuestData = JSON.parse(guestData);
          const ageBracket = this.getAgeBracketFromRange(parsedGuestData.ageRange || '13-25');
          
          if (parsedGuestData.mode === 'solo') {
            console.log('Solo mode detected - unlocking all levels for practice');
            const maxLevel = this.getMaxLevelNumber();
            return Array.from({ length: maxLevel }, (_, i) => i + 1);
          }
        }
        // Competition mode or no age data - default to teens bracket
        return this.getUnlockedLevelsForAgeBracket('teens');
      }

      const { data, error } = await supabase
        .from('user_progress')
        .select('unlocked_levels')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        console.log('No user progress found, defaulting to teens bracket');
        return this.getUnlockedLevelsForAgeBracket('teens');
      }

      return data.unlocked_levels || this.getUnlockedLevelsForAgeBracket('teens');
    } catch (error) {
      console.error('Error getting unlocked levels:', error);
      return this.getUnlockedLevelsForAgeBracket('teens');
    }
  }

  // Helper method to determine age bracket from age range string
  private getAgeBracketFromRange(ageRange: string): 'kids' | 'teens' | 'adults' {
    if (ageRange.includes('8-12')) return 'kids';
    if (ageRange.includes('13-25')) return 'teens';
    if (ageRange.includes('26+')) return 'adults';
    return 'teens'; // Default fallback
  }

  public async unlockNextLevel(
    userId: string,
    completedLevel: number
  ): Promise<boolean> {
    try {
      if (userId === 'guest' || userId.startsWith('guest_')) {
        console.log('Guest users cannot unlock levels permanently');
        return false;
      }

      const unlockedLevels = await this.getUnlockedLevels(userId);
      const nextLevel = completedLevel + 1;

      // Check if next level is already unlocked or if it's the logical next level
      if (
        unlockedLevels.includes(nextLevel) ||
        nextLevel > this.getMaxLevelNumber()
      ) {
        return false;
      }

      // Add next level to unlocked levels
      const updatedLevels = [...unlockedLevels, nextLevel].sort(
        (a, b) => a - b
      );

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

  public getAvailableLevelsForUser(
    userUnlockedLevels: number[]
  ): AssignmentConfig[] {
    const allAssignments = this.getAssignmentTemplates();

    // Sort assignments by level number to create sequential progression
    return allAssignments
      .filter(assignment =>
        userUnlockedLevels.includes(assignment.levelNumber || 1)
      )
      .sort((a, b) => (a.levelNumber || 1) - (b.levelNumber || 1));
  }

  public isLevelUnlocked(
    levelNumber: number,
    userUnlockedLevels: number[]
  ): boolean {
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
  public async unlockLevel(
    userId: string,
    levelNumber: number
  ): Promise<boolean> {
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

      const updatedLevels = [...unlockedLevels, levelNumber].sort(
        (a, b) => a - b
      );

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
      const allLevels = Array.from({ length: maxLevel }, (_, i) => i + 1);

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
        const unlocked = await this.unlockNextLevel(
          this.progress.userId,
          levelNumber
        );
        if (unlocked) {
          console.log(
            `🎉 Level ${levelNumber + 1} unlocked! (Easy progression at ${this.progress.currentScore.toFixed(1)}%)`
          );
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
      console.log(
        `Assignment difficulty adjusted for age group: ${ageGroupId}`
      );
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
  private async loadTerrainForAssignment(
    assignment: AssignmentConfig
  ): Promise<void> {
    try {
      // Extract level ID from assignment (assuming assignments have level indicators)
      const levelId = this.extractLevelIdFromAssignment(assignment);

      console.log(
        `🌍 Loading terrain for Level ${levelId}, Assignment: ${assignment.name}`
      );

      // Fetch terrain configuration from server
      const response = await fetch(
        `http://localhost:3001/api/terrain/${levelId}?assignmentId=${assignment.id}`
      );

      if (!response.ok) {
        console.warn(
          `Failed to load saved terrain for level ${levelId}, generating default terrain`
        );
        await this.generateDefaultTerrain(assignment, levelId);
        return;
      }

      const result = await response.json();

      if (result.success && result.terrain) {
        console.log(
          '✅ Loaded saved terrain configuration:',
          result.terrain.name
        );
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
        console.log(
          `🔧 Generating terrain with pattern: ${terrainData.pattern}`
        );
        await this.generateTerrainFromPattern(
          terrainData.pattern,
          terrainData.parameters
        );
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
  private async generateTerrainFromPattern(
    pattern: string,
    parameters: any
  ): Promise<void> {
    // Use existing terrain generation methods
    switch (pattern) {
      case 'flat':
        this.generateFlatTerrain(parameters);
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
  private async generateDefaultTerrain(
    assignment: AssignmentConfig,
    levelId: number
  ): Promise<void> {
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
  private async saveTerrainAsDefault(
    assignment: AssignmentConfig,
    levelId: number
  ): Promise<void> {
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
          pattern: this.getPatternForLevel(levelId),
        },
        isDefault: true,
        userId: userId,
      };

      const response = await fetch('http://localhost:3001/api/terrain/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saveData),
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
      case 1:
        return 'flat';
      case 2:
        return 'gentle_slope';
      case 3:
        return 'rolling';
      default:
        return 'flat';
    }
  }

  /**
   * Get current authenticated user ID (including guest users)
   */
  private async getCurrentUserId(): Promise<string | null> {
    try {
      // Check for guest user in localStorage first
      const guestData = localStorage.getItem('guestData');
      if (guestData) {
        const parsedGuestData = JSON.parse(guestData);
        if (parsedGuestData.tempGuestId) {
          return parsedGuestData.tempGuestId;
        }
      }
      
      // Fallback to Supabase authenticated user
      const { supabase } = await import('./supabase');
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user?.id || null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  /**
   * Save current terrain state (for manual saves)
   */
  async saveCurrentTerrain(
    name?: string,
    description?: string
  ): Promise<boolean> {
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
        name:
          name ||
          `${this.currentAssignment.name} - Custom Save ${new Date().toLocaleTimeString()}`,
        description:
          description ||
          `Manual save of terrain state during ${this.currentAssignment.name}`,
        terrainData: terrainData,
        terrainConfig: {
          width: 100,
          height: 100,
          pattern: 'custom',
        },
        isDefault: false,
        userId: userId,
      };

      const response = await fetch('http://localhost:3001/api/terrain/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saveData),
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
  private showNotification(
    message: string,
    type: 'success' | 'error' | 'info' = 'info'
  ): void {
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

  private generateSlopeTerrain(): void {
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (
      mesh.geometry.attributes.position as THREE.BufferAttribute
    ).array as Float32Array;

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];

      // Gentle slope with natural variation - updated to CLAUDE.md standards
      const slopeDirection = Math.PI * 0.3;
      const slopeStrength = 0.01; // Adjusted for yards
      let terrainHeight =
        (x * Math.cos(slopeDirection) + z * Math.sin(slopeDirection)) *
        slopeStrength;
      terrainHeight += this.smoothNoise(x * 0.02, z * 0.02) * 1.0; // ±1 yards variation
      terrainHeight += this.smoothNoise(x * 0.04, z * 0.04) * 0.5; // ±0.5 yards detail

      vertices[i + 1] = Math.max(-3, Math.min(3, terrainHeight)); // Clamp to ±3 yards
    }

    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private generateValleyTerrain(): void {
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (
      mesh.geometry.attributes.position as THREE.BufferAttribute
    ).array as Float32Array;

    const centerX = 50; // 100 width / 2
    const centerZ = 50; // 100 height / 2

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];

      // Create valley - lower in center, higher on edges
      const distanceFromCenter = Math.sqrt(
        (x - centerX) ** 2 + (z - centerZ) ** 2
      );
      const maxRadius = 50; // Max distance to edge
      const normalizedDistance = Math.min(distanceFromCenter / maxRadius, 1);

      // Valley shape: parabolic profile
      const valleyDepth = -2; // 2 yards deep at center
      const valleyHeight =
        normalizedDistance * normalizedDistance * -valleyDepth + valleyDepth;

      // Add natural variation
      const noise = this.smoothNoise(x * 0.03, z * 0.03) * 0.67; // 0.67 yards noise
      vertices[i + 1] = valleyHeight + noise;
    }

    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  private generateHillTerrain(): void {
    const meshObject = this.terrain.getMesh();
    const mesh = meshObject as THREE.Mesh;
    const vertices = (
      mesh.geometry.attributes.position as THREE.BufferAttribute
    ).array as Float32Array;

    const centerX = 50; // 100 width / 2
    const centerZ = 50; // 100 height / 2

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];

      // Create hill - higher in center, lower on edges
      const distanceFromCenter = Math.sqrt(
        (x - centerX) ** 2 + (z - centerZ) ** 2
      );
      const maxRadius = 50; // Max distance to edge
      const normalizedDistance = Math.min(distanceFromCenter / maxRadius, 1);

      // Hill shape: inverted parabolic profile
      const hillHeight = 2.67; // 2.67 yards high at center
      const currentHeight =
        hillHeight * (1 - normalizedDistance * normalizedDistance);

      // Add natural variation
      const noise = this.smoothNoise(x * 0.03, z * 0.03) * 0.5; // 0.5 yards noise
      vertices[i + 1] = currentHeight + noise;
    }

    (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;
    mesh.geometry.computeVertexNormals();
    this.terrain.updateTerrainColors();
  }

  /**
   * Simple noise function for terrain generation
   */
  private smoothNoise(x: number, y: number): number {
    return (
      (Math.sin(x * 2.1 + Math.cos(y * 1.7)) +
        Math.sin(y * 1.9 + Math.cos(x * 2.3))) *
      0.5
    );
  }

  // Test method for new progression system
  public testProgressionSystem(): void {
    console.log('🧪 Testing New Progression System:');
    
    // Test age bracket assignments
    const kidsAssignments = this.getAssignmentsByAgeBracket('kids');
    const teensAssignments = this.getAssignmentsByAgeBracket('teens');
    const adultsAssignments = this.getAssignmentsByAgeBracket('adults');
    
    console.log(`Kids bracket: ${kidsAssignments.length} levels`);
    console.log(`Teens bracket: ${teensAssignments.length} levels`);
    console.log(`Adults bracket: ${adultsAssignments.length} levels`);
    
    // Test unlocked levels for each bracket
    const kidsLevels = this.getUnlockedLevelsForAgeBracket('kids');
    const teensLevels = this.getUnlockedLevelsForAgeBracket('teens');
    const adultsLevels = this.getUnlockedLevelsForAgeBracket('adults');
    
    console.log(`Kids unlocked levels: [${kidsLevels.join(', ')}]`);
    console.log(`Teens unlocked levels: [${teensLevels.join(', ')}]`);
    console.log(`Adults unlocked levels: [${adultsLevels.join(', ')}]`);
    
    // Show sample assignments
    console.log('\nSample Assignments:');
    kidsAssignments.forEach(assignment => {
      console.log(`  Kids L${assignment.levelNumber}: ${assignment.name} (${assignment.idealOperations} ideal ops)`);
    });
    teensAssignments.forEach(assignment => {
      console.log(`  Teens L${assignment.levelNumber}: ${assignment.name} (${assignment.idealOperations} ideal ops)`);
    });
    adultsAssignments.forEach(assignment => {
      console.log(`  Adults L${assignment.levelNumber}: ${assignment.name} (${assignment.idealOperations} ideal ops)`);
    });
    
    console.log('✅ Progression System Test Complete');
  }

  // Debug function to help visualize objective areas
  public debugCurrentObjective(): void {
    const assignment = this.currentAssignment;
    const progress = this.progress;
    
    if (!assignment || !progress) {
      console.log('❌ No active assignment');
      return;
    }
    
    console.log(`🎯 Debugging Assignment: ${assignment.name}`);
    console.log(`📍 Terrain dimensions: 120×120 feet (40×40 yards)`);
    console.log(`📍 Terrain coordinates: X: 0 to 120, Z: 0 to 120 (feet)`);
    console.log(`📍 Terrain center: (60, 60) feet = (20, 20) yards`);
    
    progress.objectives.forEach((obj, i) => {
      console.log(`\n🎯 Objective ${i + 1}: ${obj.description}`);
      console.log(`   Type: ${obj.type}`);
      console.log(`   Current Score: ${obj.score.toFixed(1)}% (Need 80%+ to complete)`);
      console.log(`   Completed: ${obj.completed ? '✅' : '❌'}`);
      
      if (obj.type === 'level_area' && obj.target) {
        const t = obj.target;
        console.log(`   📐 Target Area Details:`);
        console.log(`      Position: (${t.x}, ${t.z}) feet = (${(t.x/3).toFixed(1)}, ${(t.z/3).toFixed(1)}) yards - CENTER POINT`);
        console.log(`      Size: ${t.width}×${t.height} feet = ${(t.width/3).toFixed(1)}×${(t.height/3).toFixed(1)} yards`);
        console.log(`      Target Elevation: ${t.elevation} feet = ${(t.elevation/3).toFixed(1)} yards`);
        console.log(`      Tolerance: ±${obj.tolerance} feet = ±${(obj.tolerance/3).toFixed(2)} yards`);
        console.log(`   📏 Area Bounds (in feet):`);
        console.log(`      X: ${t.x - t.width/2} to ${t.x + t.width/2}`);
        console.log(`      Z: ${t.z - t.height/2} to ${t.z + t.height/2}`);
        console.log(`   📏 Area Bounds (in yards):`);
        console.log(`      X: ${((t.x - t.width/2)/3).toFixed(1)} to ${((t.x + t.width/2)/3).toFixed(1)}`);
        console.log(`      Z: ${((t.z - t.height/2)/3).toFixed(1)} to ${((t.z + t.height/2)/3).toFixed(1)}`);
        console.log(`   💡 To complete: Level the area within these bounds to ${t.elevation}±${obj.tolerance} feet`);
      }
    });
    
    console.log(`\n📊 Current Progress:`);
    console.log(`   Overall Score: ${progress.currentScore.toFixed(1)}%`);
    console.log(`   Passed: ${progress.passed ? '✅' : '❌'}`);
    console.log(`   Operations: ${progress.operationCount}`);
    console.log(`   Volume Data:`, progress.volumeData);
  }
}
