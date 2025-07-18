import { supabase } from './supabase';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: AchievementCondition;
  xpReward: number;
  unlockedAt?: Date;
  hidden?: boolean;
}

export interface AchievementCondition {
  type: 'volume_moved' | 'assignments_completed' | 'tool_usage' | 'accuracy' | 'time_spent' | 'streak';
  threshold: number;
  toolType?: string;
  assignmentType?: string;
}

export interface UserLevel {
  level: number;
  xpRequired: number;
  title: string;
  description: string;
  unlocks: string[];
  badge: string;
}

export interface UserProgress {
  userId: string;
  level: number;
  currentXP: number;
  totalXP: number;
  assignmentsCompleted: number;
  totalVolumeMovedCubicYards: number;
  toolUsageStats: Record<string, number>;
  averageAccuracy: number;
  totalTimeSpentMinutes: number;
  currentStreak: number;
  longestStreak: number;
  achievements: string[];
  lastActiveDate: Date;
  preferences: UserPreferences;
}

export interface UserPreferences {
  preferredTools: string[];
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  notifications: boolean;
  autoSave: boolean;
  measurementUnits: 'metric' | 'imperial';
  themes: string[];
}

export interface SessionActivity {
  sessionId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  assignmentId?: string;
  toolsUsed: string[];
  volumeMoved: number;
  accuracyScore: number;
  xpEarned: number;
  completed: boolean;
}

export class ProgressTracker {
  private userProgress: UserProgress | null = null;
  private currentSession: SessionActivity | null = null;
  private achievements: Achievement[] = [];
  private levels: UserLevel[] = [];
  private callbacks: {
    onLevelUp?: (newLevel: UserLevel, oldLevel: UserLevel) => void;
    onAchievementUnlocked?: (achievement: Achievement) => void;
    onXPGained?: (xp: number, source: string) => void;
  } = {};
  private saveTimeout: number | null = null;
  private isSaving: boolean = false;

  constructor() {
    this.initializeAchievements();
    this.initializeLevels();
  }

  private initializeAchievements(): void {
    this.achievements = [
      // Volume-based achievements
      {
        id: 'first_dig',
        name: 'First Dig',
        description: 'Move your first cubic yard of earth',
        icon: '🚜',
        condition: { type: 'volume_moved', threshold: 1 },
        xpReward: 50
      },
      {
        id: 'earth_mover',
        name: 'Earth Mover',
        description: 'Move 100 cubic yards of earth',
        icon: '🏔️',
        condition: { type: 'volume_moved', threshold: 100 },
        xpReward: 200
      },
      {
        id: 'mountain_mover',
        name: 'Mountain Mover',
        description: 'Move 1000 cubic yards of earth',
        icon: '⛰️',
        condition: { type: 'volume_moved', threshold: 1000 },
        xpReward: 500
      },
      
      // Assignment-based achievements
      {
        id: 'first_assignment',
        name: 'Getting Started',
        description: 'Complete your first assignment',
        icon: '📋',
        condition: { type: 'assignments_completed', threshold: 1 },
        xpReward: 100
      },
      {
        id: 'foundation_expert',
        name: 'Foundation Expert',
        description: 'Complete 5 foundation assignments',
        icon: '🏗️',
        condition: { type: 'assignments_completed', threshold: 5, assignmentType: 'foundation' },
        xpReward: 300
      },
      {
        id: 'assignment_streak',
        name: 'On a Roll',
        description: 'Complete 5 assignments in a row',
        icon: '🔥',
        condition: { type: 'streak', threshold: 5 },
        xpReward: 250
      },
      
      // Tool mastery achievements
      {
        id: 'excavator_novice',
        name: 'Excavator Novice',
        description: 'Use the excavator 50 times',
        icon: '🚜',
        condition: { type: 'tool_usage', threshold: 50, toolType: 'excavator' },
        xpReward: 150
      },
      {
        id: 'cut_operator',
        name: 'Cut Operator',
        description: 'Use the cut tool 100 times',
        icon: '⛏️',
        condition: { type: 'tool_usage', threshold: 100, toolType: 'cut' },
        xpReward: 200
      },
      {
        id: 'fill_master',
        name: 'Fill Master',
        description: 'Use the fill tool 75 times',
        icon: '🏔️',
        condition: { type: 'tool_usage', threshold: 75, toolType: 'fill' },
        xpReward: 250
      },
      {
        id: 'tool_master',
        name: 'Tool Master',
        description: 'Use each tool at least 25 times',
        icon: '🔧',
        condition: { type: 'tool_usage', threshold: 25 },
        xpReward: 400
      },
      
      // Accuracy achievements
      {
        id: 'precision_worker',
        name: 'Precision Worker',
        description: 'Maintain 85% accuracy average',
        icon: '🎯',
        condition: { type: 'accuracy', threshold: 85 },
        xpReward: 300
      },
      {
        id: 'perfectionist',
        name: 'Perfectionist',
        description: 'Maintain 95% accuracy average',
        icon: '⭐',
        condition: { type: 'accuracy', threshold: 95 },
        xpReward: 500
      },
      
      // Time-based achievements
      {
        id: 'dedicated_learner',
        name: 'Dedicated Learner',
        description: 'Spend 2 hours learning',
        icon: '📚',
        condition: { type: 'time_spent', threshold: 120 },
        xpReward: 200
      },
      {
        id: 'earthwork_enthusiast',
        name: 'Earthwork Enthusiast',
        description: 'Spend 10 hours practicing',
        icon: '🏆',
        condition: { type: 'time_spent', threshold: 600 },
        xpReward: 750
      },
      
      // Hidden achievements
      {
        id: 'night_owl',
        name: 'Night Owl',
        description: 'Complete an assignment after midnight',
        icon: '🦉',
        condition: { type: 'assignments_completed', threshold: 1 },
        xpReward: 100,
        hidden: true
      },
      {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Complete an assignment in under 5 minutes',
        icon: '⚡',
        condition: { type: 'assignments_completed', threshold: 1 },
        xpReward: 200,
        hidden: true
      }
    ];
  }

  private initializeLevels(): void {
    this.levels = [
      {
        level: 1,
        xpRequired: 0,
        title: 'Apprentice',
        description: 'Just starting your earthwork journey',
        unlocks: ['Basic assignments'],
        badge: '🌱'
      },
      {
        level: 2,
        xpRequired: 500,
        title: 'Helper',
        description: 'Learning the basics of earthwork',
        unlocks: ['Intermediate assignments'],
        badge: '🔧'
      },
      {
        level: 3,
        xpRequired: 1200,
        title: 'Operator',
        description: 'Competent with basic tools',
        unlocks: ['Advanced brush settings'],
        badge: '🚜'
      },
      {
        level: 4,
        xpRequired: 2000,
        title: 'Technician',
        description: 'Skilled earthwork technician',
        unlocks: ['Complex assignments', 'Custom terrain'],
        badge: '⚙️'
      },
      {
        level: 5,
        xpRequired: 3000,
        title: 'Specialist',
        description: 'Specialized in earthwork operations',
        unlocks: ['Expert assignments', 'Team projects'],
        badge: '🎖️'
      },
      {
        level: 6,
        xpRequired: 4500,
        title: 'Supervisor',
        description: 'Can supervise earthwork projects',
        unlocks: ['Supervisor assignments', 'Project management'],
        badge: '👷'
      },
      {
        level: 7,
        xpRequired: 6500,
        title: 'Engineer',
        description: 'Professional earthwork engineer',
        unlocks: ['Engineering challenges', 'Design tools'],
        badge: '👨‍💼'
      },
      {
        level: 8,
        xpRequired: 9000,
        title: 'Project Manager',
        description: 'Can manage large earthwork projects',
        unlocks: ['Management assignments', 'Resource planning'],
        badge: '📊'
      },
      {
        level: 9,
        xpRequired: 12000,
        title: 'Senior Engineer',
        description: 'Expert in all aspects of earthwork',
        unlocks: ['Senior challenges', 'Mentoring'],
        badge: '🏅'
      },
      {
        level: 10,
        xpRequired: 16000,
        title: 'Master',
        description: 'Master of earthwork engineering',
        unlocks: ['Master challenges', 'Custom content creation'],
        badge: '👑'
      }
    ];
  }

  public async loadUserProgress(userId: string): Promise<UserProgress | null> {
    try {
      const { data, error } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error
        console.error('Error loading user progress:', error);
        return null;
      }

      if (!data) {
        // Create new user progress
        this.userProgress = this.createNewUserProgress(userId);
        await this.saveUserProgress();
        return this.userProgress;
      }

      this.userProgress = {
        userId: data.user_id,
        level: data.level,
        currentXP: data.experience % this.getXPForLevel(data.level + 1),
        totalXP: data.experience,
        assignmentsCompleted: data.assignments_completed,
        totalVolumeMovedCubicYards: data.total_volume_moved,
        toolUsageStats: this.parseToolUsage(data.tool_usage_stats),
        averageAccuracy: this.calculateAverageAccuracy(data.accuracy_history),
        totalTimeSpentMinutes: data.total_time_spent_minutes || 0,
        currentStreak: data.current_streak || 0,
        longestStreak: data.longest_streak || 0,
        achievements: data.achievements || [],
        lastActiveDate: new Date(data.last_active_date || Date.now()),
        preferences: data.preferences || this.getDefaultPreferences()
      };

      return this.userProgress;
    } catch (error) {
      console.error('Failed to load user progress:', error);
      return null;
    }
  }

  private createNewUserProgress(userId: string): UserProgress {
    return {
      userId,
      level: 1,
      currentXP: 0,
      totalXP: 0,
      assignmentsCompleted: 0,
              totalVolumeMovedCubicYards: 0,
      toolUsageStats: {},
      averageAccuracy: 0,
      totalTimeSpentMinutes: 0,
      currentStreak: 0,
      longestStreak: 0,
      achievements: [],
      lastActiveDate: new Date(),
      preferences: this.getDefaultPreferences()
    };
  }

  private getDefaultPreferences(): UserPreferences {
    return {
      preferredTools: ['excavator'],
      difficultyLevel: 'beginner',
      notifications: true,
      autoSave: true,
      measurementUnits: 'imperial',
      themes: ['default']
    };
  }

  private parseToolUsage(toolUsageData: any): Record<string, number> {
    if (typeof toolUsageData === 'string') {
      try {
        return JSON.parse(toolUsageData);
      } catch {
        return {};
      }
    }
    return toolUsageData || {};
  }

  private calculateAverageAccuracy(accuracyHistory: any): number {
    if (!accuracyHistory || !Array.isArray(accuracyHistory)) return 0;
    if (accuracyHistory.length === 0) return 0;
    
    const sum = accuracyHistory.reduce((acc, score) => acc + score, 0);
    return sum / accuracyHistory.length;
  }

  private getXPForLevel(level: number): number {
    const levelData = this.levels.find(l => l.level === level);
    return levelData ? levelData.xpRequired : 0;
  }

  public async saveUserProgress(): Promise<void> {
    if (!this.userProgress || this.isSaving) return;

    // Debounce saves to prevent race conditions
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = window.setTimeout(async () => {
      await this.performSave();
    }, 500); // Wait 500ms before saving
  }

  private async performSave(): Promise<void> {
    if (!this.userProgress || this.isSaving) return;

    this.isSaving = true;
    try {
      const { error } = await supabase
        .from('user_progress')
        .upsert({
          user_id: this.userProgress.userId,
          level: this.userProgress.level,
          experience: this.userProgress.totalXP,
          assignments_completed: this.userProgress.assignmentsCompleted,
          total_volume_moved: this.userProgress.totalVolumeMovedCubicYards,
          tool_usage_stats: this.userProgress.toolUsageStats,
          current_streak: this.userProgress.currentStreak,
          longest_streak: this.userProgress.longestStreak,
          achievements: this.userProgress.achievements,
          last_active_date: this.userProgress.lastActiveDate.toISOString(),
          preferences: this.userProgress.preferences,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id', // Specify the conflict column
          ignoreDuplicates: false // Update on conflict instead of ignoring
        });

      if (error) {
        console.error('Error saving user progress:', error);
      }
    } catch (error) {
      console.error('Failed to save user progress:', error);
    } finally {
      this.isSaving = false;
    }
  }

  public async awardXP(amount: number, source: string): Promise<void> {
    if (!this.userProgress) return;

    const oldLevel = this.userProgress.level;
    this.userProgress.totalXP += amount;
    this.userProgress.currentXP += amount;

    // Check for level up
    const newLevel = this.calculateLevel(this.userProgress.totalXP);
    if (newLevel > oldLevel) {
      this.userProgress.level = newLevel;
      this.userProgress.currentXP = this.userProgress.totalXP - this.getXPForLevel(newLevel);
      
      const levelData = this.levels.find(l => l.level === newLevel);
      if (levelData && this.callbacks.onLevelUp) {
        this.callbacks.onLevelUp(levelData, this.levels.find(l => l.level === oldLevel) || this.levels[0]);
      }
    }

    // Trigger XP gained callback
    if (this.callbacks.onXPGained) {
      this.callbacks.onXPGained(amount, source);
    }

    // Check for achievements (don't await to avoid blocking)
    this.checkAchievements();

    // Use debounced save
    this.saveUserProgress();
  }

  private calculateLevel(totalXP: number): number {
    for (let i = this.levels.length - 1; i >= 0; i--) {
      if (totalXP >= this.levels[i].xpRequired) {
        return this.levels[i].level;
      }
    }
    return 1;
  }

  public async recordToolUsage(toolName: string): Promise<void> {
    if (!this.userProgress) return;

    // Update tool usage stats
    this.userProgress.toolUsageStats[toolName] = (this.userProgress.toolUsageStats[toolName] || 0) + 1;
    
    // Award small XP for tool usage
    this.awardXP(5, `Using ${toolName}`);
    
    // Debounced save will handle persistence
    this.saveUserProgress();
  }

    public async recordVolumeMove(cubicYards: number): Promise<void> {
    if (!this.userProgress) return;
    
    this.userProgress.totalVolumeMovedCubicYards += cubicYards;
    
    // Award XP for volume moved (1 XP per cubic yard)
    this.awardXP(Math.floor(cubicYards), 'Moving terrain');
    
    // Debounced save will handle persistence
    this.saveUserProgress();
  }

  public async recordAssignmentCompletion(accuracy: number): Promise<void> {
    if (!this.userProgress) return;

    this.userProgress.assignmentsCompleted++;
    this.userProgress.currentStreak++;
    this.userProgress.longestStreak = Math.max(this.userProgress.longestStreak, this.userProgress.currentStreak);
    
    // Update average accuracy
    this.userProgress.averageAccuracy = (this.userProgress.averageAccuracy * (this.userProgress.assignmentsCompleted - 1) + accuracy) / this.userProgress.assignmentsCompleted;
    
    await this.checkAchievements();
    await this.awardXP(100, 'Assignment Completion');
  }

  public async recordSessionTime(minutes: number): Promise<void> {
    if (!this.userProgress) return;

    this.userProgress.totalTimeSpentMinutes += minutes;
    await this.checkAchievements();
    await this.saveUserProgress();
  }

  private checkAchievements(): void {
    if (!this.userProgress) return;

    for (const achievement of this.achievements) {
      if (this.userProgress.achievements.includes(achievement.id)) continue;

      if (this.isAchievementUnlocked(achievement)) {
        this.userProgress.achievements.push(achievement.id);
        achievement.unlockedAt = new Date();
        
        // Award XP for achievement without recursive save
        this.userProgress.totalXP += achievement.xpReward;
        
        if (this.callbacks.onAchievementUnlocked) {
          this.callbacks.onAchievementUnlocked(achievement);
        }
      }
    }
  }

  private isAchievementUnlocked(achievement: Achievement): boolean {
    if (!this.userProgress) return false;

    switch (achievement.condition.type) {
      case 'volume_moved':
        return this.userProgress.totalVolumeMovedCubicYards >= achievement.condition.threshold;
      
      case 'assignments_completed':
        return this.userProgress.assignmentsCompleted >= achievement.condition.threshold;
      
      case 'tool_usage':
        if (achievement.condition.toolType) {
          const usage = this.userProgress.toolUsageStats[achievement.condition.toolType] || 0;
          return usage >= achievement.condition.threshold;
        } else {
          // Check if all tools meet the threshold
          const tools = ['cut', 'fill'];
          return tools.every(tool => (this.userProgress!.toolUsageStats[tool] || 0) >= achievement.condition.threshold);
        }
      
      case 'accuracy':
        return this.userProgress.averageAccuracy >= achievement.condition.threshold;
      
      case 'time_spent':
        return this.userProgress.totalTimeSpentMinutes >= achievement.condition.threshold;
      
      case 'streak':
        return this.userProgress.currentStreak >= achievement.condition.threshold;
      
      default:
        return false;
    }
  }

  public getUserProgress(): UserProgress | null {
    return this.userProgress;
  }

  public getAchievements(): Achievement[] {
    return this.achievements;
  }

  public getUnlockedAchievements(): Achievement[] {
    if (!this.userProgress) return [];
    return this.achievements.filter(a => this.userProgress!.achievements.includes(a.id));
  }

  public getAvailableAchievements(): Achievement[] {
    if (!this.userProgress) return [];
    return this.achievements.filter(a => !a.hidden && !this.userProgress!.achievements.includes(a.id));
  }

  public getLevels(): UserLevel[] {
    return this.levels;
  }

  public getCurrentLevel(): UserLevel | null {
    if (!this.userProgress) return null;
    return this.levels.find(l => l.level === this.userProgress!.level) || null;
  }

  public getNextLevel(): UserLevel | null {
    if (!this.userProgress) return null;
    return this.levels.find(l => l.level === this.userProgress!.level + 1) || null;
  }

  public getProgressToNextLevel(): number {
    if (!this.userProgress) return 0;
    
    const nextLevel = this.getNextLevel();
    if (!nextLevel) return 100; // Max level
    
    const currentLevelXP = this.getXPForLevel(this.userProgress.level);
    const nextLevelXP = nextLevel.xpRequired;
    const progress = (this.userProgress.totalXP - currentLevelXP) / (nextLevelXP - currentLevelXP);
    
    return Math.min(100, Math.max(0, progress * 100));
  }

  public setCallbacks(callbacks: {
    onLevelUp?: (newLevel: UserLevel, oldLevel: UserLevel) => void;
    onAchievementUnlocked?: (achievement: Achievement) => void;
    onXPGained?: (xp: number, source: string) => void;
  }): void {
    this.callbacks = callbacks;
  }

  public startSession(assignmentId?: string): void {
    this.currentSession = {
      sessionId: `session_${Date.now()}`,
      userId: this.userProgress?.userId || 'anonymous',
      startTime: new Date(),
      assignmentId,
      toolsUsed: [],
      volumeMoved: 0,
      accuracyScore: 0,
      xpEarned: 0,
      completed: false
    };
  }

  public endSession(): void {
    if (this.currentSession) {
      this.currentSession.endTime = new Date();
      this.currentSession.completed = true;
      
      const sessionTimeMinutes = (this.currentSession.endTime.getTime() - this.currentSession.startTime.getTime()) / (1000 * 60);
      this.recordSessionTime(sessionTimeMinutes);
      
      this.currentSession = null;
    }
  }

  public getCurrentSession(): SessionActivity | null {
    return this.currentSession;
  }
} 