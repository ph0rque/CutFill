import { EnhancedMultiplayerManager, GameSession, PlayerData, SharedObjective, ObjectiveTarget } from './multiplayer-enhanced';
import { AssignmentManager } from './assignments';
import { ProgressTracker } from './progress';

export interface CollaborativeAssignment {
  id: string;
  name: string;
  description: string;
  type: 'cooperative' | 'competitive' | 'collaborative';
  maxPlayers: number;
  timeLimit: number;
  sharedObjectives: SharedObjective[];
  individualObjectives: Map<string, SharedObjective[]>;
  teamProgress: TeamProgress;
  completionCriteria: CompletionCriteria;
  difficulty: number;
  rewards: AssignmentRewards;
}

export interface TeamProgress {
  overallCompletion: number;
  teamScore: number;
  individualScores: Map<string, number>;
  teamEfficiency: number;
  collaborationBonus: number;
  timeRemaining: number;
  milestones: Milestone[];
  contributions: Map<string, PlayerContribution>;
}

export interface PlayerContribution {
  playerId: string;
  volumeContributed: number;
  objectivesCompleted: number;
  toolsUsed: Record<string, number>;
  accuracyScore: number;
  collaborationScore: number;
  leadershipActions: number;
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  progress: number;
  completed: boolean;
  completedBy: string[];
  completedAt: number | null;
  requiredProgress: number;
  rewards: number;
}

export interface CompletionCriteria {
  minimumTeamScore: number;
  requireAllObjectives: boolean;
  maxTimeAllowed: number;
  minimumIndividualScore: number;
  collaborationRequirement: number;
}

export interface AssignmentRewards {
  baseXP: number;
  teamBonusXP: number;
  speedBonusXP: number;
  accuracyBonusXP: number;
  collaborationBonusXP: number;
  achievements: string[];
}

export class CollaborativeFeatures {
  private multiplayerManager: EnhancedMultiplayerManager;
  private assignmentManager: AssignmentManager;
  private progressTracker: ProgressTracker;
  private currentAssignment: CollaborativeAssignment | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private collaborativeUI: HTMLElement | null = null;

  constructor(
    multiplayerManager: EnhancedMultiplayerManager,
    assignmentManager: AssignmentManager,
    progressTracker: ProgressTracker
  ) {
    this.multiplayerManager = multiplayerManager;
    this.assignmentManager = assignmentManager;
    this.progressTracker = progressTracker;
    this.initializeCollaborativeAssignments();
    this.startProgressTracking();
  }

  private initializeCollaborativeAssignments(): void {
    // Create collaborative assignments
    const assignments: CollaborativeAssignment[] = [
      {
        id: 'collab_foundation_team',
        name: 'Team Foundation Preparation',
        description: 'Work together to prepare multiple building foundations with precise coordination',
        type: 'cooperative',
        maxPlayers: 4,
        timeLimit: 900000, // 15 minutes
        sharedObjectives: [
          {
            id: 'shared_volume_balance',
            type: 'collaborative',
            description: 'Achieve overall site volume balance within ±2%',
            target: {
              type: 'volume_balance',
              parameters: { tolerance: 0.02 },
              tolerance: 0.02
            },
            progress: new Map(),
            completed: false,
            completedBy: null,
            completedAt: null
          },
          {
            id: 'team_efficiency',
            type: 'collaborative',
            description: 'Complete all foundations with >85% team efficiency',
            target: {
              type: 'area_level',
              parameters: { efficiency: 0.85 },
              tolerance: 0.1
            },
            progress: new Map(),
            completed: false,
            completedBy: null,
            completedAt: null
          }
        ],
        individualObjectives: new Map(),
        teamProgress: this.createInitialTeamProgress(),
        completionCriteria: {
          minimumTeamScore: 80,
          requireAllObjectives: true,
          maxTimeAllowed: 900000,
          minimumIndividualScore: 60,
          collaborationRequirement: 70
        },
        difficulty: 3,
        rewards: {
          baseXP: 300,
          teamBonusXP: 150,
          speedBonusXP: 100,
          accuracyBonusXP: 100,
          collaborationBonusXP: 200,
          achievements: ['team_player', 'foundation_master']
        }
      },
      {
        id: 'competitive_grading',
        name: 'Competitive Site Grading',
        description: 'Race to complete identical grading assignments with the highest accuracy',
        type: 'competitive',
        maxPlayers: 4,
        timeLimit: 600000, // 10 minutes
        sharedObjectives: [
          {
            id: 'accuracy_competition',
            type: 'competitive',
            description: 'Achieve the highest accuracy score in site grading',
            target: {
              type: 'grade_road',
              parameters: { accuracy: 0.95 },
              tolerance: 0.05
            },
            progress: new Map(),
            completed: false,
            completedBy: null,
            completedAt: null
          }
        ],
        individualObjectives: new Map(),
        teamProgress: this.createInitialTeamProgress(),
        completionCriteria: {
          minimumTeamScore: 70,
          requireAllObjectives: false,
          maxTimeAllowed: 600000,
          minimumIndividualScore: 50,
          collaborationRequirement: 0
        },
        difficulty: 4,
        rewards: {
          baseXP: 250,
          teamBonusXP: 50,
          speedBonusXP: 150,
          accuracyBonusXP: 200,
          collaborationBonusXP: 0,
          achievements: ['speed_grader', 'precision_expert']
        }
      },
      {
        id: 'collaborative_drainage',
        name: 'Collaborative Drainage System',
        description: 'Design and implement a comprehensive drainage system across multiple zones',
        type: 'collaborative',
        maxPlayers: 6,
        timeLimit: 1200000, // 20 minutes
        sharedObjectives: [
          {
            id: 'drainage_connectivity',
            type: 'collaborative',
            description: 'Create connected drainage channels across all zones',
            target: {
              type: 'create_channel',
              parameters: { connectivity: 1.0 },
              tolerance: 0.1
            },
            progress: new Map(),
            completed: false,
            completedBy: null,
            completedAt: null
          },
          {
            id: 'water_flow_efficiency',
            type: 'collaborative',
            description: 'Optimize water flow with >90% efficiency',
            target: {
              type: 'volume_balance',
              parameters: { flowEfficiency: 0.9 },
              tolerance: 0.05
            },
            progress: new Map(),
            completed: false,
            completedBy: null,
            completedAt: null
          }
        ],
        individualObjectives: new Map(),
        teamProgress: this.createInitialTeamProgress(),
        completionCriteria: {
          minimumTeamScore: 85,
          requireAllObjectives: true,
          maxTimeAllowed: 1200000,
          minimumIndividualScore: 70,
          collaborationRequirement: 80
        },
        difficulty: 5,
        rewards: {
          baseXP: 500,
          teamBonusXP: 250,
          speedBonusXP: 100,
          accuracyBonusXP: 150,
          collaborationBonusXP: 300,
          achievements: ['drainage_engineer', 'team_coordinator']
        }
      }
    ];

    // Initialize individual objectives for each assignment
    assignments.forEach(assignment => {
      this.initializeIndividualObjectives(assignment);
    });
  }

  private createInitialTeamProgress(): TeamProgress {
    return {
      overallCompletion: 0,
      teamScore: 0,
      individualScores: new Map(),
      teamEfficiency: 0,
      collaborationBonus: 0,
      timeRemaining: 0,
      milestones: [],
      contributions: new Map()
    };
  }

  private initializeIndividualObjectives(assignment: CollaborativeAssignment): void {
    const session = this.multiplayerManager.getCurrentSession();
    if (!session) return;

    // Create individual objectives based on assignment type
    for (const [playerId, player] of session.players) {
      const objectives: SharedObjective[] = [];
      
      if (assignment.type === 'cooperative') {
        objectives.push({
          id: `individual_${playerId}_contribution`,
          type: 'collaborative',
          description: `Contribute at least 25% of total work`,
          target: {
            type: 'volume_balance',
            parameters: { minContribution: 0.25 },
            tolerance: 0.05
          },
          progress: new Map([[playerId, 0]]),
          completed: false,
          completedBy: null,
          completedAt: null
        });
      } else if (assignment.type === 'competitive') {
        objectives.push({
          id: `individual_${playerId}_accuracy`,
          type: 'competitive',
          description: `Achieve >90% accuracy in your assigned area`,
          target: {
            type: 'area_level',
            parameters: { accuracy: 0.9 },
            tolerance: 0.05
          },
          progress: new Map([[playerId, 0]]),
          completed: false,
          completedBy: null,
          completedAt: null
        });
      } else if (assignment.type === 'collaborative') {
        objectives.push({
          id: `individual_${playerId}_zone`,
          type: 'collaborative',
          description: `Complete assigned zone with >85% quality`,
          target: {
            type: 'area_level',
            parameters: { quality: 0.85 },
            tolerance: 0.1
          },
          progress: new Map([[playerId, 0]]),
          completed: false,
          completedBy: null,
          completedAt: null
        });
      }

      assignment.individualObjectives.set(playerId, objectives);
    }
  }

  public startCollaborativeAssignment(assignmentId: string): void {
    const assignment = this.getCollaborativeAssignment(assignmentId);
    if (!assignment) return;

    this.currentAssignment = assignment;
    
    // Initialize team progress
    this.initializeTeamProgress(assignment);
    
    // Start progress tracking
    this.startProgressTracking();
    
    // Create collaborative UI
    this.createCollaborativeUI();
    
    // Notify all players
    this.notifyAssignmentStart(assignment);
  }

  private initializeTeamProgress(assignment: CollaborativeAssignment): void {
    const session = this.multiplayerManager.getCurrentSession();
    if (!session) return;

    assignment.teamProgress.timeRemaining = assignment.timeLimit;
    assignment.teamProgress.milestones = this.createMilestones(assignment);
    
    // Initialize contributions for each player
    for (const [playerId, player] of session.players) {
      assignment.teamProgress.contributions.set(playerId, {
        playerId,
        volumeContributed: 0,
        objectivesCompleted: 0,
        toolsUsed: {},
        accuracyScore: 0,
        collaborationScore: 0,
        leadershipActions: 0
      });
      
      assignment.teamProgress.individualScores.set(playerId, 0);
    }
  }

  private createMilestones(assignment: CollaborativeAssignment): Milestone[] {
    const milestones: Milestone[] = [];
    
    if (assignment.type === 'cooperative') {
      milestones.push({
        id: 'milestone_25',
        name: '25% Complete',
        description: 'Team has completed 25% of the assignment',
        progress: 0,
        completed: false,
        completedBy: [],
        completedAt: null,
        requiredProgress: 25,
        rewards: 50
      });
    }
    
    milestones.push({
      id: 'milestone_50',
      name: 'Halfway Point',
      description: 'Team has completed 50% of the assignment',
      progress: 0,
      completed: false,
      completedBy: [],
      completedAt: null,
      requiredProgress: 50,
      rewards: 100
    });
    
    milestones.push({
      id: 'milestone_75',
      name: 'Almost There',
      description: 'Team has completed 75% of the assignment',
      progress: 0,
      completed: false,
      completedBy: [],
      completedAt: null,
      requiredProgress: 75,
      rewards: 150
    });

    return milestones;
  }

  private startProgressTracking(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      this.updateTeamProgress();
    }, 1000); // Update every second
  }

  private updateTeamProgress(): void {
    if (!this.currentAssignment) return;

    const session = this.multiplayerManager.getCurrentSession();
    if (!session) return;

    // Update time remaining
    this.currentAssignment.teamProgress.timeRemaining = Math.max(0, 
      this.currentAssignment.teamProgress.timeRemaining - 1000);

    // Calculate overall completion
    this.calculateOverallCompletion();
    
    // Update individual scores
    this.updateIndividualScores();
    
    // Calculate team efficiency
    this.calculateTeamEfficiency();
    
    // Check milestones
    this.checkMilestones();
    
    // Update UI
    this.updateCollaborativeUI();
    
    // Check completion
    this.checkAssignmentCompletion();
  }

  private calculateOverallCompletion(): void {
    if (!this.currentAssignment) return;

    let totalCompletion = 0;
    let objectiveCount = 0;

    // Calculate completion from shared objectives
    for (const objective of this.currentAssignment.sharedObjectives) {
      if (objective.completed) {
        totalCompletion += 100;
      } else {
        // Calculate progress percentage
        const progressSum = Array.from(objective.progress.values()).reduce((a, b) => a + b, 0);
        totalCompletion += Math.min(100, progressSum);
      }
      objectiveCount++;
    }

    // Calculate completion from individual objectives
    for (const [playerId, objectives] of this.currentAssignment.individualObjectives) {
      for (const objective of objectives) {
        if (objective.completed) {
          totalCompletion += 100;
        } else {
          const progressSum = Array.from(objective.progress.values()).reduce((a, b) => a + b, 0);
          totalCompletion += Math.min(100, progressSum);
        }
        objectiveCount++;
      }
    }

    this.currentAssignment.teamProgress.overallCompletion = 
      objectiveCount > 0 ? totalCompletion / objectiveCount : 0;
  }

  private updateIndividualScores(): void {
    if (!this.currentAssignment) return;

    const session = this.multiplayerManager.getCurrentSession();
    if (!session) return;

    for (const [playerId, player] of session.players) {
      const contribution = this.currentAssignment.teamProgress.contributions.get(playerId);
      if (!contribution) continue;

      // Calculate individual score based on contribution
      let score = 0;
      
      // Volume contribution score (40%)
      const totalVolume = Array.from(this.currentAssignment.teamProgress.contributions.values())
        .reduce((sum, contrib) => sum + contrib.volumeContributed, 0);
      if (totalVolume > 0) {
        score += (contribution.volumeContributed / totalVolume) * 40;
      }

      // Objective completion score (40%)
      const individualObjectives = this.currentAssignment.individualObjectives.get(playerId) || [];
      const completedObjectives = individualObjectives.filter(obj => obj.completed).length;
      if (individualObjectives.length > 0) {
        score += (completedObjectives / individualObjectives.length) * 40;
      }

      // Collaboration score (20%)
      score += contribution.collaborationScore * 20;

      this.currentAssignment.teamProgress.individualScores.set(playerId, Math.min(100, score));
    }
  }

  private calculateTeamEfficiency(): void {
    if (!this.currentAssignment) return;

    const session = this.multiplayerManager.getCurrentSession();
    if (!session) return;

    const playerCount = session.players.size;
    const timeElapsed = this.currentAssignment.timeLimit - this.currentAssignment.teamProgress.timeRemaining;
    const completion = this.currentAssignment.teamProgress.overallCompletion;

    // Calculate efficiency based on completion vs time and player coordination
    const timeEfficiency = completion / (timeElapsed / this.currentAssignment.timeLimit);
    const playerEfficiency = this.calculatePlayerCoordination();

    this.currentAssignment.teamProgress.teamEfficiency = 
      Math.min(100, (timeEfficiency * 0.6 + playerEfficiency * 0.4));
  }

  private calculatePlayerCoordination(): number {
    if (!this.currentAssignment) return 0;

    const contributions = Array.from(this.currentAssignment.teamProgress.contributions.values());
    if (contributions.length === 0) return 0;

    // Calculate balance of contributions
    const volumes = contributions.map(c => c.volumeContributed);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const variance = volumes.reduce((sum, vol) => sum + Math.pow(vol - avgVolume, 2), 0) / volumes.length;
    
    // Lower variance = better coordination
    const coordinationScore = Math.max(0, 100 - (variance / avgVolume) * 50);
    
    return coordinationScore;
  }

  private checkMilestones(): void {
    if (!this.currentAssignment) return;

    for (const milestone of this.currentAssignment.teamProgress.milestones) {
      if (!milestone.completed && 
          this.currentAssignment.teamProgress.overallCompletion >= milestone.requiredProgress) {
        
        milestone.completed = true;
        milestone.completedAt = Date.now();
        
        const session = this.multiplayerManager.getCurrentSession();
        if (session) {
          milestone.completedBy = Array.from(session.players.keys());
          
          // Award milestone rewards
          this.awardMilestoneRewards(milestone);
          
          // Notify players
          this.notifyMilestoneCompletion(milestone);
        }
      }
    }
  }

  private awardMilestoneRewards(milestone: Milestone): void {
    const session = this.multiplayerManager.getCurrentSession();
    if (!session) return;

    for (const playerId of milestone.completedBy) {
      // Award XP through progress tracker
      this.progressTracker.awardXP(milestone.rewards, `Milestone: ${milestone.name}`);
    }
  }

  private notifyMilestoneCompletion(milestone: Milestone): void {
    // Send notification to all players
    const session = this.multiplayerManager.getCurrentSession();
    if (session) {
      // This would typically use the multiplayer manager to send messages
      console.log(`Milestone completed: ${milestone.name}`);
    }
  }

  private checkAssignmentCompletion(): void {
    if (!this.currentAssignment) return;

    const criteria = this.currentAssignment.completionCriteria;
    const progress = this.currentAssignment.teamProgress;

    // Check if assignment is complete
    let isComplete = true;
    let completionReason = '';

    // Check time limit
    if (progress.timeRemaining <= 0) {
      isComplete = false;
      completionReason = 'Time limit exceeded';
    }

    // Check minimum team score
    if (progress.teamScore < criteria.minimumTeamScore) {
      isComplete = false;
      completionReason = 'Team score below minimum';
    }

    // Check individual scores
    for (const [playerId, score] of progress.individualScores) {
      if (score < criteria.minimumIndividualScore) {
        isComplete = false;
        completionReason = `Player ${playerId} score below minimum`;
        break;
      }
    }

    // Check required objectives
    if (criteria.requireAllObjectives) {
      const allObjectivesComplete = this.currentAssignment.sharedObjectives.every(obj => obj.completed);
      if (!allObjectivesComplete) {
        isComplete = false;
        completionReason = 'Not all objectives completed';
      }
    }

    // Check collaboration requirement
    if (progress.collaborationBonus < criteria.collaborationRequirement) {
      isComplete = false;
      completionReason = 'Collaboration requirement not met';
    }

    if (isComplete) {
      this.completeAssignment();
    }
  }

  private completeAssignment(): void {
    if (!this.currentAssignment) return;

    // Award final rewards
    this.awardFinalRewards();
    
    // Update progress tracker
    this.updateProgressTracker();
    
    // Show completion UI
    this.showCompletionResults();
    
    // Clean up
    this.cleanupAssignment();
  }

  private awardFinalRewards(): void {
    if (!this.currentAssignment) return;

    const session = this.multiplayerManager.getCurrentSession();
    if (!session) return;

    const rewards = this.currentAssignment.rewards;
    const progress = this.currentAssignment.teamProgress;

    for (const [playerId, player] of session.players) {
      let totalXP = rewards.baseXP;
      
      // Add bonuses
      if (progress.teamEfficiency > 85) {
        totalXP += rewards.teamBonusXP;
      }
      
      if (progress.timeRemaining > this.currentAssignment.timeLimit * 0.3) {
        totalXP += rewards.speedBonusXP;
      }
      
      const individualScore = progress.individualScores.get(playerId) || 0;
      if (individualScore > 90) {
        totalXP += rewards.accuracyBonusXP;
      }
      
      if (progress.collaborationBonus > 80) {
        totalXP += rewards.collaborationBonusXP;
      }

      // Award XP
      this.progressTracker.awardXP(totalXP, `Collaborative Assignment: ${this.currentAssignment.name}`);
    }
  }

  private updateProgressTracker(): void {
    if (!this.currentAssignment) return;

    const session = this.multiplayerManager.getCurrentSession();
    if (!session) return;

    // Record assignment completion
    const avgAccuracy = Array.from(this.currentAssignment.teamProgress.individualScores.values())
      .reduce((sum, score) => sum + score, 0) / this.currentAssignment.teamProgress.individualScores.size;
    
    this.progressTracker.recordAssignmentCompletion(avgAccuracy);
  }

  private showCompletionResults(): void {
    if (!this.currentAssignment) return;

    // This would typically show a completion modal
    console.log(`Assignment completed: ${this.currentAssignment.name}`);
    console.log(`Team score: ${this.currentAssignment.teamProgress.teamScore}`);
    console.log(`Team efficiency: ${this.currentAssignment.teamProgress.teamEfficiency}`);
  }

  private cleanupAssignment(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.currentAssignment = null;
    this.hideCollaborativeUI();
  }

  private createCollaborativeUI(): void {
    // Create UI elements for collaborative features
    this.collaborativeUI = document.createElement('div');
    this.collaborativeUI.id = 'collaborative-ui';
    this.collaborativeUI.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      width: 300px;
      background: rgba(42, 42, 42, 0.95);
      border-radius: 8px;
      padding: 15px;
      color: white;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 1000;
      backdrop-filter: blur(5px);
    `;

    document.body.appendChild(this.collaborativeUI);
    this.updateCollaborativeUI();
  }

  private updateCollaborativeUI(): void {
    if (!this.collaborativeUI || !this.currentAssignment) return;

    const progress = this.currentAssignment.teamProgress;
    const timeRemaining = Math.max(0, Math.floor(progress.timeRemaining / 1000));
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;

    this.collaborativeUI.innerHTML = `
      <h3 style="margin: 0 0 10px 0;">Team Assignment</h3>
      <div style="margin-bottom: 10px;">
        <strong>${this.currentAssignment.name}</strong>
      </div>
      <div style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Progress:</span>
          <span>${progress.overallCompletion.toFixed(1)}%</span>
        </div>
        <div style="background: rgba(255,255,255,0.2); border-radius: 4px; height: 8px; margin: 5px 0;">
          <div style="background: #4CAF50; height: 100%; width: ${progress.overallCompletion}%; border-radius: 4px;"></div>
        </div>
      </div>
      <div style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Time:</span>
          <span>${minutes}:${seconds.toString().padStart(2, '0')}</span>
        </div>
      </div>
      <div style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Team Score:</span>
          <span>${progress.teamScore.toFixed(1)}</span>
        </div>
      </div>
      <div style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Efficiency:</span>
          <span>${progress.teamEfficiency.toFixed(1)}%</span>
        </div>
      </div>
      <div style="font-size: 12px; color: #ccc;">
        <strong>Milestones:</strong>
        ${progress.milestones.map(milestone => `
          <div style="margin: 2px 0;">
            ${milestone.completed ? '✅' : '⏳'} ${milestone.name}
          </div>
        `).join('')}
      </div>
    `;
  }

  private hideCollaborativeUI(): void {
    if (this.collaborativeUI && document.body.contains(this.collaborativeUI)) {
      document.body.removeChild(this.collaborativeUI);
    }
    this.collaborativeUI = null;
  }

  private notifyAssignmentStart(assignment: CollaborativeAssignment): void {
    // Send notification to all players about assignment start
    console.log(`Starting collaborative assignment: ${assignment.name}`);
  }

  private getCollaborativeAssignment(id: string): CollaborativeAssignment | null {
    // This would typically fetch from a database or assignment registry
    // For now, returning null as a placeholder
    return null;
  }

  public recordPlayerAction(playerId: string, action: string, metadata: any): void {
    if (!this.currentAssignment) return;

    const contribution = this.currentAssignment.teamProgress.contributions.get(playerId);
    if (!contribution) return;

    // Update contribution based on action
    switch (action) {
      case 'terrain_modify':
        contribution.volumeContributed += Math.abs(metadata.heightChange);
        contribution.toolsUsed[metadata.tool] = (contribution.toolsUsed[metadata.tool] || 0) + 1;
        break;
      case 'objective_complete':
        contribution.objectivesCompleted++;
        break;
      case 'help_player':
        contribution.collaborationScore += 5;
        break;
      case 'lead_action':
        contribution.leadershipActions++;
        break;
    }
  }

  public getCurrentAssignment(): CollaborativeAssignment | null {
    return this.currentAssignment;
  }

  public cleanup(): void {
    this.cleanupAssignment();
  }
} 