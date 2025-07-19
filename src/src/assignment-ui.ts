import { AssignmentManager } from './assignments';
import type {
  AssignmentConfig,
  AssignmentProgress,
  AssignmentObjective,
} from './assignments';
import { supabase } from './supabase';
import { AssignmentFeedbackSystem } from './assignment-feedback';

export class AssignmentUI {
  private assignmentManager: AssignmentManager;
  private container: HTMLElement | null = null;
  private isVisible: boolean = false;
  private progressContainer: HTMLElement | null = null;
  private persistentProgressPanel: HTMLElement | null = null;
  private currentUserId: string | null = null;
  private feedbackSystem: AssignmentFeedbackSystem;

  constructor(assignmentManager: AssignmentManager) {
    this.assignmentManager = assignmentManager;
    this.feedbackSystem = new AssignmentFeedbackSystem();
    this.setupCallbacks();
    this.getCurrentUser();
    this.addLevelProgressionStyles();
  }

  /**
   * Add CSS styles for level progression
   */
  private addLevelProgressionStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes glow {
        from {
          box-shadow: 0 0 15px rgba(255,193,7,0.5);
        }
        to {
          box-shadow: 0 0 25px rgba(255,193,7,0.8), 0 0 35px rgba(255,193,7,0.3);
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Get current user from Supabase
   */
  private async getCurrentUser(): Promise<void> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      this.currentUserId = user?.id || 'guest';
    } catch (error) {
      console.log('Using guest user for assignments');
      this.currentUserId = 'guest';
    }
  }

  /**
   * Setup callbacks for assignment events
   */
  private setupCallbacks(): void {
    this.assignmentManager.setCallbacks({
      onProgressUpdate: progress => {
        this.updateProgressDisplay(progress);
        this.updatePersistentProgressPanel();
        this.updateMainObjectiveDisplay();
        // Update real-time feedback system
        const assignment = this.assignmentManager.getCurrentAssignment();
        if (assignment) {
          this.feedbackSystem.updateProgress(assignment, progress);
        }
      },
      onObjectiveComplete: objective => this.showObjectiveComplete(objective),
      onAssignmentComplete: progress => {
        this.showAssignmentComplete(progress);
        this.updatePersistentProgressPanel();
        // Show completion feedback
        const assignment = this.assignmentManager.getCurrentAssignment();
        if (assignment) {
          const passed =
            progress.currentScore >= assignment.successCriteria.minimumScore;
          this.feedbackSystem.showAssignmentCompleted(
            assignment,
            progress,
            passed
          );
        }
      },
      onAssignmentStop: () => {
        this.hidePersistentProgress();
        this.updateMainUIAssignmentDisplay();
        this.updateMainObjectiveDisplay();
      },
    });
  }

  /**
   * Toggle assignment UI visibility
   */
  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show assignment selection UI
   */
  public async show(): Promise<void> {
    if (this.isVisible) return;

    await this.createAssignmentUI();
    this.isVisible = true;
  }

  /**
   * Hide assignment UI
   */
  public hide(): void {
    if (this.container) {
      document.body.removeChild(this.container);
      this.container = null;
    }
    this.isVisible = false;
  }

  /**
   * Create the main assignment UI
   */
  private async createAssignmentUI(): Promise<void> {
    // Remove existing container if present
    if (this.container) {
      document.body.removeChild(this.container);
    }

    this.container = document.createElement('div');
    this.container.id = 'assignment-ui-container';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      font-family: Arial, sans-serif;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: #2a2a2a;
      color: white;
      border-radius: 8px;
      padding: 30px;
      max-width: 800px;
      max-height: 80vh;
      width: 90%;
      overflow-y: auto;
      position: relative;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 2px solid #4CAF50;
      padding-bottom: 15px;
    `;

    header.innerHTML = `
      <h2 style="margin: 0; color: #4CAF50;">🎮 Level Selection</h2>
      <div style="display: flex; gap: 10px; align-items: center;">
        <div style="font-size: 12px; color: #ccc;">
          🔒 Locked | ✅ Unlocked | 🏆 Competitive
        </div>
        <button id="dev-mode-toggle" style="
          background: ${this.assignmentManager.isDeveloperMode() ? '#FF9800' : '#666'};
          color: white;
          border: none;
          border-radius: 4px;
          padding: 6px 10px;
          cursor: pointer;
          font-size: 12px;
          margin-right: 5px;
        ">🔧 Dev Mode</button>
        <button id="close-assignments" style="
          background: #666;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 14px;
        ">✕ Close</button>
      </div>
    `;

    // Get available assignments
    const assignments = await this.assignmentManager.getAvailableAssignments();

    // Current assignment status
    const currentAssignment = this.assignmentManager.getCurrentAssignment();
    const currentProgress = this.assignmentManager.getProgress();

    // Current assignment section (if any)
    if (currentAssignment && currentProgress) {
      const currentSection = this.createCurrentAssignmentSection(
        currentAssignment,
        currentProgress
      );
      panel.appendChild(header);
      panel.appendChild(currentSection);
    } else {
      panel.appendChild(header);
    }

    // Available assignments section
    const assignmentsSection = await this.createAssignmentsSection(assignments);
    panel.appendChild(assignmentsSection);

    this.container.appendChild(panel);
    document.body.appendChild(this.container);

    // Setup event listeners
    this.setupUIEventListeners();
  }

  /**
   * Create current assignment section
   */
  private createCurrentAssignmentSection(
    assignment: AssignmentConfig,
    progress: AssignmentProgress
  ): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = `
      background: rgba(76, 175, 80, 0.2);
      border: 1px solid #4CAF50;
      border-radius: 6px;
      padding: 20px;
      margin-bottom: 25px;
    `;

    const completedObjectives = progress.objectives.filter(
      obj => obj.completed
    ).length;
    const totalObjectives = progress.objectives.length;
    const progressPercent = Math.round(progress.currentScore);

    section.innerHTML = `
      <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 15px;">
        <h3 style="margin: 0; color: #4CAF50;">🎯 Current Assignment</h3>
        <button id="stop-assignment" style="
          background: #F44336;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 6px 12px;
          cursor: pointer;
          font-size: 12px;
        ">⏹️ Stop Assignment</button>
      </div>
      
      <div style="margin-bottom: 15px;">
        <h4 style="margin: 0 0 5px 0; color: white;">${assignment.name}</h4>
        <p style="margin: 0; color: #ccc; font-size: 14px;">${assignment.description}</p>
      </div>

      <div style="margin-bottom: 15px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-weight: bold;">Overall Progress</span>
          <span style="color: #4CAF50; font-weight: bold;">${progressPercent}%</span>
        </div>
        <div style="background: rgba(255,255,255,0.2); border-radius: 10px; height: 8px; overflow: hidden;">
          <div style="background: #4CAF50; height: 100%; width: ${progressPercent}%; transition: width 0.3s ease;"></div>
        </div>
      </div>

      <div style="margin-bottom: 15px;">
        <div style="font-weight: bold; margin-bottom: 10px;">Objectives (${completedObjectives}/${totalObjectives}):</div>
        <div id="objectives-list">
          ${progress.objectives
            .map(
              obj => `
            <div style="
              display: flex;
              align-items: center;
              margin-bottom: 8px;
              padding: 8px;
              background: rgba(255,255,255,0.1);
              border-radius: 4px;
              ${obj.completed ? 'border-left: 3px solid #4CAF50;' : 'border-left: 3px solid #666;'}
            ">
              <span style="margin-right: 10px; font-size: 16px;">${obj.completed ? '✅' : '⏳'}</span>
              <div style="flex: 1;">
                <div style="font-weight: bold; font-size: 14px;">${obj.description}</div>
                <div style="font-size: 12px; color: #ccc;">Score: ${Math.round(obj.score)}% (Weight: ${Math.round(obj.weight * 100)}%)</div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; font-size: 12px;">
        <div style="text-align: center; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <div style="font-weight: bold; color: #FF4444;">Cut Volume</div>
          <div>${progress.volumeData.totalCut.toFixed(1)} yd³</div>
        </div>
        <div style="text-align: center; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <div style="font-weight: bold; color: #2196F3;">Fill Volume</div>
          <div>${progress.volumeData.totalFill.toFixed(1)} yd³</div>
        </div>
        <div style="text-align: center; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <div style="font-weight: bold; color: #FF9800;">Net Movement</div>
          <div>${progress.volumeData.netMovement.toFixed(1)} yd³</div>
        </div>
        <div style="text-align: center; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <div style="font-weight: bold; color: #9C27B0;">Efficiency</div>
          <div>${(progress.volumeData.efficiency * 100).toFixed(1)}%</div>
        </div>
      </div>
    `;

    return section;
  }

  /**
   * Create level selection section with unlock status
   */
  private async createAssignmentsSection(
    assignments: AssignmentConfig[]
  ): Promise<HTMLElement> {
    const section = document.createElement('div');

    // Get user's unlocked levels
    const unlockedLevels = await this.assignmentManager.getUnlockedLevels(
      this.currentUserId || 'guest'
    );

    // Section header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    `;

    header.innerHTML = `
      <h3 style="margin: 0; color: white;">🎮 Available Levels</h3>
      <div style="display: flex; gap: 10px; align-items: center;">
        <div style="font-size: 12px; color: #4CAF50;">
          Progress: ${unlockedLevels.length} levels unlocked
        </div>
        <select id="level-filter" style="
          background: rgba(255,255,255,0.1);
          color: white;
          border: 1px solid #666;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 12px;
        ">
          <option value="all">All Levels</option>
          <option value="unlocked">Unlocked Only</option>
          <option value="competitive">Competitive Only</option>
          <option value="practice">Practice Only</option>
        </select>
      </div>
    `;

    section.appendChild(header);

    // Age scaling info panel
    const ageInfo = this.createAgeScalingInfoPanel();
    section.appendChild(ageInfo);

    // Level progression panel
    const progressionPanel = this.createLevelProgressionPanel(unlockedLevels);
    section.appendChild(progressionPanel);

    // Assignments grid
    const grid = document.createElement('div');
    grid.id = 'assignments-grid';
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 15px;
    `;

    // Create level cards with unlock status
    const sortedAssignments = assignments.sort(
      (a, b) =>
        (a.levelNumber || a.difficulty) - (b.levelNumber || b.difficulty)
    );
    
    // Create cards asynchronously
    for (const assignment of sortedAssignments) {
      const card = await this.createAssignmentCard(assignment, unlockedLevels);
      grid.appendChild(card);
    }

    section.appendChild(grid);
    return section;
  }

  /**
   * Check if a level is completed
   */
  private async isLevelCompleted(assignmentId: string): Promise<boolean> {
    try {
      if (!this.currentUserId || this.currentUserId === 'guest' || this.currentUserId.startsWith('guest_')) {
        // For guest users, check if assignment was completed in current session
        // This is a simple check - in a real app you might want more sophisticated tracking
        return false;
      }

      const { data, error } = await supabase
        .from('user_assignments')
        .select('is_completed, score')
        .eq('user_id', this.currentUserId)
        .eq('assignment_id', assignmentId)
        .eq('is_completed', true)
        .order('completed_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error checking level completion:', error);
        return false;
      }

      return data && data.length > 0;
    } catch (error) {
      console.error('Error in isLevelCompleted:', error);
      return false;
    }
  }

  /**
   * Create individual level card with Practice/Compete options
   */
  private async createAssignmentCard(
    assignment: AssignmentConfig,
    unlockedLevels: number[] = []
  ): Promise<HTMLElement> {
    const card = document.createElement('div');
    card.className = 'assignment-card';
    card.setAttribute('data-difficulty', assignment.difficulty.toString());

    // Check level unlock status
    const levelNumber = assignment.levelNumber || assignment.difficulty;
    const isUnlocked = unlockedLevels.includes(levelNumber);
    const isCompetitive =
      assignment.isCompetitive || assignment.name.includes('COMPETITIVE');
    
    // Check if level is completed
    const isCompleted = await this.isLevelCompleted(assignment.id);
    
    // Check if this is the next recommended level
    const nextRecommendedLevel = Math.max(...unlockedLevels.filter(level => level <= levelNumber)) + 1;
    const isNextRecommended = levelNumber === nextRecommendedLevel && isUnlocked && !isCompleted;

    // Determine card styling based on status
    let cardBackground, cardBorder, cardEffects = '';
    
    if (!isUnlocked) {
      cardBackground = 'rgba(100,100,100,0.2)';
      cardBorder = '#666';
      cardEffects = 'filter: grayscale(80%); opacity: 0.6;';
    } else if (isCompleted) {
      cardBackground = 'rgba(76,175,80,0.25)'; // Green for completed
      cardBorder = '#4CAF50';
      cardEffects = 'box-shadow: 0 0 10px rgba(76,175,80,0.3);';
    } else if (isNextRecommended) {
      cardBackground = 'rgba(255,193,7,0.25)'; // Gold for next recommended
      cardBorder = '#FFC107';
      cardEffects = 'box-shadow: 0 0 15px rgba(255,193,7,0.5); animation: glow 2s ease-in-out infinite alternate;';
    } else if (isCompetitive) {
      cardBackground = 'rgba(156,39,176,0.15)';
      cardBorder = '#9C27B0';
      cardEffects = 'box-shadow: 0 0 15px rgba(156,39,176,0.4);';
    } else {
      cardBackground = 'rgba(76,175,80,0.15)';
      cardBorder = '#4CAF50';
    }

    card.style.cssText = `
      background: ${cardBackground};
      border: 2px solid ${cardBorder};
      border-radius: 8px;
      padding: 18px;
      position: relative;
      transition: all 0.3s ease;
      ${cardEffects}
    `;

    // Level progression indicators
    let levelIcon, levelStatus, statusColor;
    
    if (!isUnlocked) {
      levelIcon = '🔒';
      levelStatus = 'LOCKED';
      statusColor = '#666';
    } else if (isCompleted) {
      levelIcon = '✅';
      levelStatus = 'COMPLETED';
      statusColor = '#4CAF50';
    } else if (isNextRecommended) {
      levelIcon = '⭐';
      levelStatus = 'RECOMMENDED';
      statusColor = '#FFC107';
    } else if (isCompetitive) {
      levelIcon = '🏆';
      levelStatus = 'COMPETITIVE';
      statusColor = '#9C27B0';
    } else {
      levelIcon = '✅';
      levelStatus = 'UNLOCKED';
      statusColor = '#4CAF50';
    }

    // Category color
    const categoryColors: Record<string, string> = {
      foundation: '#FF9800',
      drainage: '#2196F3',
      grading: '#4CAF50',
      excavation: '#F44336',
      road_construction: '#9C27B0',
    };
    const categoryColor = categoryColors[assignment.category] || '#666';

    card.innerHTML = `
      <!-- Level Status Badge -->
      <div style="position: absolute; top: -8px; right: -8px; background: ${statusColor}; color: white; padding: 6px 10px; border-radius: 15px; font-size: 10px; font-weight: bold; transform: rotate(12deg); box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
        ${levelIcon} ${levelStatus}
      </div>
      
      <!-- Level Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="background: ${categoryColor}; color: white; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; text-transform: uppercase;">
            ${assignment.category.replace('_', ' ')}
          </div>
          <div style="color: #ccc; font-size: 12px;">
            Level ${levelNumber}
          </div>
        </div>
        <div style="color: #FFD700; font-size: 14px;">
          ${'⭐'.repeat(assignment.difficulty)}
        </div>
      </div>
      
      <!-- Level Title and Description -->
      <h4 style="margin: 0 0 8px 0; color: ${!isUnlocked ? '#888' : isCompetitive ? '#E1BEE7' : 'white'}; font-size: 16px; line-height: 1.3;">
        ${assignment.name}
      </h4>
      <p style="margin: 0 0 15px 0; color: #ccc; font-size: 13px; line-height: 1.4;">
        ${assignment.description}
      </p>
      
      ${
        isCompetitive
          ? `
        <div style="margin-bottom: 12px; padding: 8px; background: rgba(255,107,53,0.2); border-left: 3px solid #FF6B35; border-radius: 4px;">
          <div style="font-weight: bold; font-size: 12px; color: #FFB366; margin-bottom: 4px;">🏁 Competitive Features:</div>
          <div style="font-size: 11px; color: #ccc;">
            • Real-time leaderboard scoring<br>
            • Speed bonuses for fast completion<br>
            • Head-to-head multiplayer racing<br>
            • Championship points system
          </div>
        </div>
      `
          : ''
      }
      
      <!-- Level Stats -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 15px; font-size: 11px;">
        <div style="text-align: center; padding: 6px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <div style="font-weight: bold; color: #2196F3;">⏱️ Time</div>
          <div>${assignment.estimatedTime}min</div>
        </div>
        <div style="text-align: center; padding: 6px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <div style="font-weight: bold; color: #FF9800;">🎯 Target</div>
          <div>${assignment.successCriteria.minimumScore}%</div>
        </div>
        <div style="text-align: center; padding: 6px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <div style="font-weight: bold; color: #4CAF50;">⚡ Par</div>
          <div>${assignment.idealOperations || '—'}</div>
        </div>
      </div>

      <!-- Action Buttons -->
      ${
        !isUnlocked
          ? `
        <div style="text-align: center; padding: 12px; background: rgba(100,100,100,0.3); border-radius: 4px; color: #888;">
          🔒 Complete Level ${levelNumber - 1} to unlock
        </div>
      `
          : isCompleted
          ? `
        <div style="display: flex; gap: 8px;">
          <div style="flex: 1; text-align: center; padding: 8px; background: rgba(76,175,80,0.2); border: 1px solid #4CAF50; border-radius: 4px; color: #4CAF50; font-size: 11px;">
            ✅ COMPLETED
          </div>
          <button 
            class="practice-btn" 
            data-assignment-id="${assignment.id}"
            data-mode="practice"
            style="
              flex: 1;
              padding: 8px;
              background: #4CAF50;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-weight: bold;
              font-size: 11px;
              transition: all 0.3s ease;
            "
          >
            🔄 Replay
          </button>
        </div>
      `
          : isNextRecommended
          ? `
        <div style="margin-bottom: 8px; text-align: center; padding: 6px; background: rgba(255,193,7,0.2); border: 1px solid #FFC107; border-radius: 4px; color: #F57F17; font-size: 11px; font-weight: bold;">
          ⭐ RECOMMENDED NEXT LEVEL ⭐
        </div>
        <div style="display: flex; gap: 8px;">
          <button 
            class="practice-btn" 
            data-assignment-id="${assignment.id}"
            data-mode="practice"
            style="
              flex: 1;
              padding: 10px;
              background: linear-gradient(135deg, #FFC107, #FF8F00);
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-weight: bold;
              font-size: 12px;
              transition: all 0.3s ease;
              box-shadow: 0 2px 4px rgba(255,193,7,0.3);
            "
          >
            ⭐ Start Now
          </button>
          ${
            isCompetitive
              ? `
            <button 
              class="compete-btn" 
              data-assignment-id="${assignment.id}"
              data-mode="competitive"
              style="
                flex: 1;
                padding: 10px;
                background: #9C27B0;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                font-size: 12px;
                transition: all 0.3s ease;
              "
            >
              🏆 Compete
            </button>
          `
              : ''
          }
        </div>
      `
          : `
        <div style="display: flex; gap: 8px;">
          <button 
            class="practice-btn" 
            data-assignment-id="${assignment.id}"
            data-mode="practice"
            style="
              flex: 1;
              padding: 10px;
              background: #4CAF50;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-weight: bold;
              font-size: 12px;
              transition: all 0.3s ease;
            "
          >
            📚 Practice
          </button>
          ${
            isCompetitive
              ? `
            <button 
              class="compete-btn" 
              data-assignment-id="${assignment.id}"
              data-mode="competitive"
              style="
                flex: 1;
                padding: 10px;
                background: #9C27B0;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                font-size: 12px;
                transition: all 0.3s ease;
              "
            >
              🏆 Compete
            </button>
          `
              : ''
          }
        </div>
      `
      }
    `;

    // Hover effects
    card.addEventListener('mouseenter', () => {
      card.style.background = 'rgba(255,255,255,0.15)';
      card.style.borderColor = categoryColor;
      card.style.transform = 'translateY(-2px)';
    });

    card.addEventListener('mouseleave', () => {
      card.style.background = 'rgba(255,255,255,0.1)';
      card.style.borderColor = '#666';
      card.style.transform = 'translateY(0)';
    });

    return card;
  }

  /**
   * Create age scaling information panel
   */
  private createAgeScalingInfoPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(76,175,80,0.15);
      border: 1px solid rgba(76,175,80,0.5);
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 20px;
    `;

    const currentAgeGroup = this.assignmentManager.getCurrentAgeGroup();
    const adjustments = this.assignmentManager.getDifficultyAdjustments();

    panel.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
        <h4 style="margin: 0; color: #4CAF50;">👥 Current Age Group: ${currentAgeGroup.name}</h4>
        <span style="font-size: 12px; color: #ccc;">${currentAgeGroup.ageRange}</span>
      </div>
      
      <p style="margin: 0 0 10px 0; color: #ccc; font-size: 14px; line-height: 1.4;">${currentAgeGroup.description}</p>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 12px;">
        <div style="background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
          <div style="font-weight: bold; color: #4CAF50;">Tolerance</div>
          <div style="color: #ccc;">${adjustments.toleranceAdjustment}</div>
        </div>
        <div style="background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
          <div style="font-weight: bold; color: #2196F3;">Time Limits</div>
          <div style="color: #ccc;">${adjustments.timeAdjustment}</div>
        </div>
        <div style="background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
          <div style="font-weight: bold; color: #FF9800;">Scoring</div>
          <div style="color: #ccc;">${adjustments.scoringAdjustment}</div>
        </div>
        <div style="background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
          <div style="font-weight: bold; color: #9C27B0;">Guidance</div>
          <div style="color: #ccc;">${adjustments.hintsLevel}</div>
        </div>
      </div>
    `;

    return panel;
  }

  /**
   * Create level progression panel
   */
  private createLevelProgressionPanel(unlockedLevels: number[]): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(33,150,243,0.15);
      border: 1px solid rgba(33,150,243,0.5);
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 20px;
    `;

    const maxLevel = Math.max(
      ...this.assignmentManager
        .getAssignmentTemplates()
        .map(a => a.levelNumber || 1)
    );
    const progressPercent = (unlockedLevels.length / maxLevel) * 100;

    panel.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px;">
        <h4 style="margin: 0; color: #2196F3;">🎯 Level Progress</h4>
        <div style="display: flex; gap: 10px;">
          ${
            this.assignmentManager.isDeveloperMode()
              ? ''
              : `
            <button id="unlock-all-levels" style="
              background: #FF9800;
              color: white;
              border: none;
              border-radius: 4px;
              padding: 6px 12px;
              cursor: pointer;
              font-size: 12px;
            ">🔓 Unlock All</button>
          `
          }
          <span style="font-size: 12px; color: #2196F3; font-weight: bold;">
            ${unlockedLevels.length}/${maxLevel} levels unlocked
          </span>
        </div>
      </div>
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 13px;">Overall Progress</span>
        <span style="color: #2196F3; font-weight: bold;">${progressPercent.toFixed(1)}%</span>
      </div>
      <div style="background: rgba(255,255,255,0.2); border-radius: 10px; height: 8px; overflow: hidden;">
        <div style="background: #2196F3; height: 100%; width: ${progressPercent}%; transition: width 0.3s ease;"></div>
      </div>
      
      <div style="margin-top: 12px;">
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px;">Quick Level Access:</div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${Array.from({ length: maxLevel }, (_, i) => i + 1)
            .map(level => {
              const isUnlocked = unlockedLevels.includes(level);
              const isCurrent =
                this.assignmentManager.getCurrentAssignment()?.levelNumber ===
                level;
              return `
              <button 
                class="quick-level-btn" 
                data-level="${level}"
                style="
                  background: ${isCurrent ? '#4CAF50' : isUnlocked ? '#2196F3' : '#666'};
                  color: white;
                  border: none;
                  border-radius: 4px;
                  padding: 4px 8px;
                  cursor: ${isUnlocked || this.assignmentManager.isDeveloperMode() ? 'pointer' : 'not-allowed'};
                  font-size: 11px;
                  opacity: ${isUnlocked || this.assignmentManager.isDeveloperMode() ? '1' : '0.5'};
                  min-width: 30px;
                "
                ${!isUnlocked && !this.assignmentManager.isDeveloperMode() ? 'disabled' : ''}
              >
                ${level}${isCurrent ? '⭐' : ''}
              </button>
            `;
            })
            .join('')}
        </div>
      </div>
    `;

    return panel;
  }

  /**
   * Setup UI event listeners
   */
  private setupUIEventListeners(): void {
    if (!this.container) return;

    // Close button
    const closeBtn = this.container.querySelector('#close-assignments');
    closeBtn?.addEventListener('click', () => this.hide());

    // Dev mode toggle
    const devModeBtn = this.container.querySelector('#dev-mode-toggle');
    devModeBtn?.addEventListener('click', async () => {
      if (this.assignmentManager.isDeveloperMode()) {
        this.assignmentManager.disableDeveloperMode();
        this.showNotification('🔒 Developer mode disabled', 'info');
      } else {
        this.assignmentManager.enableDeveloperMode();
        this.showNotification(
          '🔧 Developer mode enabled - all levels unlocked!',
          'success'
        );
      }
      // Refresh the UI to show updated unlock status
      await this.show();
    });

    // Stop assignment button
    const stopBtn = this.container.querySelector('#stop-assignment');
    stopBtn?.addEventListener('click', () => {
      this.assignmentManager.stopAssignment();
      this.hidePersistentProgress();
      this.hide();
      this.updateMainUIAssignmentDisplay();
    });

    // Start assignment buttons
    const startBtns = this.container.querySelectorAll('.start-assignment-btn');
    startBtns.forEach(btn => {
      btn.addEventListener('click', async e => {
        const assignmentId = (e.target as HTMLElement).getAttribute(
          'data-assignment-id'
        );
        if (assignmentId) {
          // Ensure we have a user ID (wait for it if needed)
          if (!this.currentUserId) {
            await this.getCurrentUser();
          }

          // Use guest as fallback if still no user ID
          const userId = this.currentUserId || 'guest';

          console.log(`Starting assignment ${assignmentId} for user ${userId}`);

          const success = await this.assignmentManager.startAssignment(
            assignmentId,
            userId
          );
          if (success) {
            this.hide();
            this.updateMainUIAssignmentDisplay();
            this.showAssignmentStarted(assignmentId);
            console.log(`Assignment ${assignmentId} started successfully`);
          } else {
            console.error(`Failed to start assignment ${assignmentId}`);
            this.showNotification(
              'Failed to start assignment. Please try again.',
              'warning'
            );
          }
        } else {
          console.error('No assignment ID found on button');
        }
      });
    });

    // Practice mode buttons
    const practiceBtns = this.container.querySelectorAll('.practice-btn');
    practiceBtns.forEach(btn => {
      btn.addEventListener('click', async e => {
        const target = e.target as HTMLElement;
        const assignmentId = target.getAttribute('data-assignment-id');
        if (assignmentId) {
          // Ensure we have a user ID (wait for it if needed)
          if (!this.currentUserId) {
            await this.getCurrentUser();
          }

          // Use guest as fallback if still no user ID
          const userId = this.currentUserId || 'guest';

          console.log(
            `Starting assignment ${assignmentId} in practice mode for user ${userId}`
          );

          const success = await this.assignmentManager.startAssignment(
            assignmentId,
            userId
          );
          if (success) {
            this.hide();
            this.updateMainUIAssignmentDisplay();
            this.showAssignmentStarted(assignmentId);
            console.log(`Assignment ${assignmentId} started in practice mode`);
          } else {
            console.error(
              `Failed to start assignment ${assignmentId} in practice mode`
            );
            this.showNotification(
              'Failed to start assignment. Please try again.',
              'warning'
            );
          }
        } else {
          console.error('No assignment ID found on practice button');
        }
      });
    });

    // Compete mode buttons
    const competeBtns = this.container.querySelectorAll('.compete-btn');
    competeBtns.forEach(btn => {
      btn.addEventListener('click', async e => {
        const target = e.target as HTMLElement;
        const assignmentId = target.getAttribute('data-assignment-id');
        if (assignmentId) {
          // Ensure we have a user ID (wait for it if needed)
          if (!this.currentUserId) {
            await this.getCurrentUser();
          }

          // Use guest as fallback if still no user ID
          const userId = this.currentUserId || 'guest';

          console.log(
            `Starting assignment ${assignmentId} in competitive mode for user ${userId}`
          );

          // For competitive mode, we need to create a multiplayer session
          this.showNotification(
            'Competitive mode requires multiplayer session. Creating session...',
            'info'
          );

          // TODO: Integration with multiplayer system for competitive mode
          // For now, start in competitive single-player mode
          const success = await this.assignmentManager.startAssignment(
            assignmentId,
            userId
          );
          if (success) {
            this.hide();
            this.updateMainUIAssignmentDisplay();
            this.showAssignmentStarted(assignmentId);
            console.log(
              `Assignment ${assignmentId} started in competitive mode`
            );
          } else {
            console.error(
              `Failed to start assignment ${assignmentId} in competitive mode`
            );
            this.showNotification(
              'Failed to start assignment. Please try again.',
              'warning'
            );
          }
        } else {
          console.error('No assignment ID found on compete button');
        }
      });
    });

    // Age group selector
    const ageGroupSelector = this.container.querySelector(
      '#age-group-selector'
    ) as HTMLSelectElement;
    ageGroupSelector?.addEventListener('change', async () => {
      const success = this.assignmentManager.setAgeGroup(
        ageGroupSelector.value
      );
      if (success) {
        // Refresh the entire UI to show age-scaled assignments
        await this.show();
        this.showNotification(
          `Assignments updated for ${this.assignmentManager.getCurrentAgeGroup().name}!`,
          'info'
        );
      }
    });

    // Difficulty filter
    const difficultyFilter = this.container.querySelector(
      '#difficulty-filter'
    ) as HTMLSelectElement;
    difficultyFilter?.addEventListener('change', () => {
      this.filterAssignments(difficultyFilter.value);
    });

    // Unlock all levels button
    const unlockAllBtn = this.container.querySelector('#unlock-all-levels');
    unlockAllBtn?.addEventListener('click', async () => {
      if (this.currentUserId && this.currentUserId !== 'guest') {
        const success = await this.assignmentManager.unlockAllLevels(
          this.currentUserId
        );
        if (success) {
          this.showNotification('🎉 All levels unlocked!', 'success');
          await this.show(); // Refresh UI
        } else {
          this.showNotification('Failed to unlock levels', 'warning');
        }
      } else {
        this.showNotification('Sign in to unlock levels permanently', 'info');
      }
    });

    // Quick level access buttons
    const quickLevelBtns = this.container.querySelectorAll('.quick-level-btn');
    quickLevelBtns.forEach(btn => {
      btn.addEventListener('click', async e => {
        const target = e.target as HTMLElement;
        const level = parseInt(target.getAttribute('data-level') || '1');

        // Find assignment for this level
        const assignments =
          await this.assignmentManager.getAvailableAssignments();
        const assignment = assignments.find(a => a.levelNumber === level);

        if (assignment) {
          // Ensure we have a user ID
          if (!this.currentUserId) {
            await this.getCurrentUser();
          }

          const userId = this.currentUserId || 'guest';
          const success = await this.assignmentManager.startAssignment(
            assignment.id,
            userId
          );

          if (success) {
            this.hide();
            this.updateMainUIAssignmentDisplay();
            this.showAssignmentStarted(assignment.id);
            this.showNotification(
              `🎯 Started Level ${level}: ${assignment.name}`,
              'success'
            );
          } else {
            this.showNotification('Failed to start level', 'warning');
          }
        } else {
          this.showNotification(`Level ${level} not found`, 'warning');
        }
      });
    });

    // Click outside to close
    this.container.addEventListener('click', e => {
      if (e.target === this.container) {
        this.hide();
      }
    });
  }

  /**
   * Filter assignments by difficulty
   */
  private filterAssignments(difficulty: string): void {
    const cards = this.container?.querySelectorAll('.assignment-card');
    cards?.forEach(card => {
      const cardDifficulty = card.getAttribute('data-difficulty');
      if (difficulty === 'all' || cardDifficulty === difficulty) {
        (card as HTMLElement).style.display = 'block';
      } else {
        (card as HTMLElement).style.display = 'none';
      }
    });
  }

  /**
   * Update progress display during assignment
   */
  private updateProgressDisplay(progress: AssignmentProgress): void {
    // Update main UI assignment display
    this.updateMainUIAssignmentDisplay();

    // If assignment UI is open, update it
    if (this.isVisible && this.container) {
      // This will refresh the UI to show updated progress
      this.show();
    }
  }

  /**
   * Show objective completion notification
   */
  private showObjectiveComplete(objective: AssignmentObjective): void {
    this.showNotification(
      `✅ Objective Complete: ${objective.description}`,
      'success'
    );
  }

  /**
   * Show assignment completion notification
   */
  private showAssignmentComplete(progress: AssignmentProgress): void {
    const assignment = this.assignmentManager.getCurrentAssignment();
    if (!assignment) return;

    const score = Math.round(progress.currentScore);
    const passed = score >= assignment.successCriteria.minimumScore;

    this.showNotification(
      `🎉 Assignment Complete: ${assignment.name}\nScore: ${score}% ${passed ? '(PASSED)' : '(TRY AGAIN)'}`,
      passed ? 'success' : 'warning'
    );

    // Update main UI
    this.updateMainUIAssignmentDisplay();
  }

  /**
   * Update the main UI objective display
   */
  private updateMainObjectiveDisplay(): void {
    const objectiveDisplay = document.getElementById(
      'current-objective-display'
    );
    const objectiveText = document.getElementById('objective-text');

    if (!objectiveDisplay || !objectiveText) return;

    const assignment = this.assignmentManager.getCurrentAssignment();
    const progress = this.assignmentManager.getProgress();

    if (assignment && progress && progress.objectives.length > 0) {
      // Show the main objective prominently
      objectiveDisplay.style.display = 'block';
      objectiveText.textContent = progress.objectives[0].description;
    } else {
      // Hide when no assignment is active
      objectiveDisplay.style.display = 'none';
    }
  }

  /**
   * Show assignment started notification
   */
  private showAssignmentStarted(assignmentId: string): void {
    this.showNotification(
      `🚀 Assignment Started! Follow the objectives in the precision tools.`,
      'info'
    );

    // Update main objective display
    this.updateMainObjectiveDisplay();

    // Show persistent progress panel
    this.showPersistentProgress();

    // Trigger real-time feedback system
    const assignment = this.assignmentManager.getCurrentAssignment();
    if (assignment) {
      this.feedbackSystem.showAssignmentStarted(assignment);
    }
  }

  /**
   * Show notification
   */
  private showNotification(
    message: string,
    type: 'success' | 'warning' | 'info' = 'info'
  ): void {
    const colors = {
      success: '#4CAF50',
      warning: '#FF9800',
      info: '#2196F3',
    };

    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${colors[type]};
      color: white;
      padding: 15px 20px;
      border-radius: 6px;
      z-index: 3000;
      font-family: Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      max-width: 300px;
      white-space: pre-line;
      animation: slideIn 0.3s ease-out;
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    notification.textContent = message;
    document.body.appendChild(notification);

    // Auto remove
    setTimeout(() => {
      if (document.body.contains(notification)) {
        notification.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 300);
      }
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    }, 5000);
  }

  /**
   * Update main UI assignment display
   */
  private updateMainUIAssignmentDisplay(): void {
    const currentAssignmentDiv = document.getElementById('current-assignment');
    const assignmentProgressDiv = document.getElementById(
      'assignment-progress'
    );

    const assignment = this.assignmentManager.getCurrentAssignment();
    const progress = this.assignmentManager.getProgress();

    if (currentAssignmentDiv) {
      if (assignment && progress) {
        const score = Math.round(progress.currentScore);
        const completedObjectives = progress.objectives.filter(
          obj => obj.completed
        ).length;
        const totalObjectives = progress.objectives.length;

        currentAssignmentDiv.innerHTML = `
          <div style="font-weight: bold; color: #4CAF50;">${assignment.name}</div>
          <div style="font-size: 11px;">Progress: ${score}% | Objectives: ${completedObjectives}/${totalObjectives}</div>
        `;
        currentAssignmentDiv.style.color = '#4CAF50';
      } else {
        currentAssignmentDiv.textContent = 'No assignment selected';
        currentAssignmentDiv.style.color = '#ccc';
      }
    }

    if (assignmentProgressDiv) {
      if (assignment && progress) {
        const score = Math.round(progress.currentScore);
        assignmentProgressDiv.textContent = `Progress: ${score}%`;
        assignmentProgressDiv.style.display = 'block';
        assignmentProgressDiv.style.color = score >= 70 ? '#4CAF50' : '#FF9800';
      } else {
        assignmentProgressDiv.style.display = 'none';
      }
    }
  }

  /**
   * Create a persistent assignment progress panel for the main view
   */
  public createPersistentProgressPanel(): HTMLElement {
    // Remove existing panel if present
    if (this.persistentProgressPanel) {
      this.persistentProgressPanel.remove();
    }

    this.persistentProgressPanel = document.createElement('div');
    this.persistentProgressPanel.id = 'assignment-progress-panel';
    
    // Responsive positioning and sizing based on screen size
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Position on the right side to avoid left-side UI conflicts
    let rightPosition = 20; // Distance from right edge
    let topPosition = 20;   // Distance from top
    let panelWidth = '320px';
    let panelPadding = '15px';

    // Mobile devices (width < 768px)
    if (screenWidth < 768) {
      rightPosition = 10;
      topPosition = 10;
      panelWidth = `${Math.min(screenWidth - 40, 300)}px`;
      panelPadding = '12px';
    }
    // Tablet devices (width < 1024px)
    else if (screenWidth < 1024) {
      rightPosition = 15;
      topPosition = 15;
      panelWidth = '300px';
      panelPadding = '14px';
    }
    // Desktop and wide screens
    else {
      rightPosition = 20;
      topPosition = 20;
      panelWidth = '320px';
      panelPadding = '15px';
    }

    this.persistentProgressPanel.style.cssText = `
      position: fixed;
      top: ${topPosition}px;
      right: ${rightPosition}px;
      background: rgba(0,0,0,0.9);
      color: white;
      padding: ${panelPadding};
      border-radius: 8px;
      font-family: Arial, sans-serif;
      width: ${panelWidth};
      max-width: 350px;
      z-index: 1002;
      pointer-events: auto;
      border: 2px solid #4CAF50;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: all 0.3s ease;
      backdrop-filter: blur(5px);
    `;

    this.updatePersistentProgressPanel();
    return this.persistentProgressPanel;
  }

  /**
   * Update the persistent progress panel content
   */
  private updatePersistentProgressPanel(): void {
    if (!this.persistentProgressPanel) return;

    const assignment = this.assignmentManager.getCurrentAssignment();
    const progress = this.assignmentManager.getProgress();

    if (!assignment || !progress) {
      this.persistentProgressPanel.innerHTML = `
        <div style="text-align: center; color: #ccc;">
          <h3 style="margin: 0; color: #4CAF50;">📋 No Active Assignment</h3>
          <p style="margin: 10px 0; font-size: 14px;">Press 'A' to select an assignment</p>
        </div>
      `;
      return;
    }

    const completedObjectives = progress.objectives.filter(
      obj => obj.completed
    ).length;
    const totalObjectives = progress.objectives.length;
    const progressPercent = Math.round(progress.currentScore);

    this.persistentProgressPanel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <div style="flex: 1;">
          <h3 style="margin: 0 0 4px 0; color: #4CAF50;">📋 ${assignment.name}</h3>
          <div style="font-size: 12px; color: #ccc; line-height: 1.3; margin-bottom: 6px;">
            ${assignment.description}
          </div>
          
          <!-- Objectives List -->
          <div style="margin: 8px 0;">
            <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px;">Objectives (${completedObjectives}/${totalObjectives}):</div>
            <div style="max-height: 150px; overflow-y: auto; padding-right: 5px;">
              ${progress.objectives
                .map(
                  obj => `
                <div style="display: flex; align-items: flex-start; margin: 4px 0; font-size: 11px; line-height: 1.3;">
                  <span style="color: ${obj.completed ? '#4CAF50' : '#ccc'}; margin-right: 6px; margin-top: 2px;">
                    ${obj.completed ? '✅' : '⏳'}
                  </span>
                  <span style="color: ${obj.completed ? '#4CAF50' : '#ccc'};">
                    ${obj.description}
                  </span>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
          <div style="display: flex; gap: 8px; font-size: 10px; margin-bottom: 4px;">
            <span style="background: rgba(76, 175, 80, 0.2); color: #4CAF50; padding: 2px 6px; border-radius: 10px; border: 1px solid #4CAF50;">
              ⭐ Difficulty: ${assignment.difficulty}/5
            </span>
            <span style="background: rgba(33, 150, 243, 0.2); color: #2196F3; padding: 2px 6px; border-radius: 10px; border: 1px solid #2196F3;">
              📂 ${assignment.category}
            </span>
          </div>
        </div>
        <button onclick="assignmentUI.toggle()" style="
          padding: 4px 8px;
          background: #666;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          flex-shrink: 0;
          margin-left: 8px;
        ">Details</button>
      </div>

      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="font-size: 13px; font-weight: bold;">Overall Progress</span>
          <span style="color: ${progressPercent >= 70 ? '#4CAF50' : progressPercent >= 50 ? '#FF9800' : '#F44336'}; font-weight: bold; font-size: 13px;">${progressPercent}%</span>
        </div>
        <div style="background: rgba(255,255,255,0.2); border-radius: 8px; height: 6px; overflow: hidden;">
          <div style="background: ${progressPercent >= 70 ? '#4CAF50' : progressPercent >= 50 ? '#FF9800' : '#F44336'}; height: 100%; width: ${progressPercent}%; transition: width 0.3s ease;"></div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px; font-size: 11px;">
        <div style="text-align: center; padding: 6px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <div style="font-weight: bold; color: #FF4444;">Cut</div>
          <div>${progress.volumeData.totalCut.toFixed(1)} yd³</div>
        </div>
        <div style="text-align: center; padding: 6px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <div style="font-weight: bold; color: #2196F3;">Fill</div>
          <div>${progress.volumeData.totalFill.toFixed(1)} yd³</div>
        </div>
        <div style="text-align: center; padding: 6px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <div style="font-weight: bold; color: #FF9800;">Net</div>
          <div>${progress.volumeData.netMovement.toFixed(1)} yd³</div>
        </div>
      </div>

      <div style="display: flex; justify-content: center; font-size: 10px; color: #ccc; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);">
        <span>🎯 Min Score: ${assignment.successCriteria.minimumScore}%</span>
      </div>
    `;
  }

  /**
   * Show/hide the persistent progress panel
   */
  public showPersistentProgress(): void {
    if (!this.persistentProgressPanel) {
      this.createPersistentProgressPanel();
    }

    if (this.persistentProgressPanel) {
      this.persistentProgressPanel.style.display = 'block';
      document.body.appendChild(this.persistentProgressPanel);

      // Ensure no conflicts with main UI panel in precision mode
      this.ensureNoUIConflicts();
    }
  }

  /**
   * Ensure no UI conflicts with other panels
   */
  private ensureNoUIConflicts(): void {
    const mainPanel = document.getElementById('main-ui-panel');
    const precisionPanel = document.getElementById('precision-tools-ui');

    // If we're in precision mode (precision panel exists), hide main panel to avoid conflicts
    if (precisionPanel && mainPanel) {
      // Hide main panel when precision tools are active
      mainPanel.style.display = 'none';
    }
  }

  public hidePersistentProgress(): void {
    if (this.persistentProgressPanel) {
      this.persistentProgressPanel.style.display = 'none';
    }
  }

  /**
   * Refresh the persistent progress panel (useful for external updates)
   */
  public refreshPersistentProgress(): void {
    if (this.persistentProgressPanel) {
      this.updatePersistentProgressPanel();
    }
  }

  /**
   * Add global helper methods for easy testing
   */
  private addGlobalHelpers(): void {
    // Add global methods for easy testing
    (window as any).levelHelpers = {
      devMode: () => {
        this.assignmentManager.enableDeveloperMode();
        console.log('🔧 Developer mode enabled - all levels unlocked!');
      },
      normalMode: () => {
        this.assignmentManager.disableDeveloperMode();
        console.log('🔒 Developer mode disabled - normal progression restored');
      },
      showLevels: () => {
        this.toggle();
      },
      unlockAll: async () => {
        if (this.currentUserId && this.currentUserId !== 'guest') {
          const success = await this.assignmentManager.unlockAllLevels(
            this.currentUserId
          );
          if (success) {
            console.log('🎉 All levels unlocked!');
          } else {
            console.log('❌ Failed to unlock levels');
          }
        } else {
          console.log('ℹ️ Sign in to unlock levels permanently');
        }
      },
      startLevel: async (levelNumber: number) => {
        const assignments =
          await this.assignmentManager.getAvailableAssignments();
        const assignment = assignments.find(a => a.levelNumber === levelNumber);
        if (assignment) {
          const userId = this.currentUserId || 'guest';
          const success = await this.assignmentManager.startAssignment(
            assignment.id,
            userId
          );
          if (success) {
            console.log(`🎯 Started Level ${levelNumber}: ${assignment.name}`);
          } else {
            console.log(`❌ Failed to start level ${levelNumber}`);
          }
        } else {
          console.log(`❌ Level ${levelNumber} not found`);
        }
      },
    };

    console.log(`
🎮 Level Helper Commands:
- levelHelpers.devMode()        - Enable developer mode (unlock all levels)
- levelHelpers.normalMode()     - Disable developer mode  
- levelHelpers.showLevels()     - Show level selection UI
- levelHelpers.unlockAll()      - Unlock all levels (for signed in users)
- levelHelpers.startLevel(X)    - Start level X directly
    `);
  }

  /**
   * Initialize the assignment UI system
   */
  public initialize(): void {
    // Update initial display
    this.updateMainUIAssignmentDisplay();
    this.updateMainObjectiveDisplay();

    // Show persistent progress panel if assignment is active
    const currentAssignment = this.assignmentManager.getCurrentAssignment();
    if (currentAssignment) {
      this.showPersistentProgress();
    }

    // Add global helper methods for easy testing
    this.addGlobalHelpers();

    // Set up keyboard shortcut (A key)
    document.addEventListener('keydown', event => {
      if (
        event.key.toLowerCase() === 'a' &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        // Only trigger if not in input field
        const target = event.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          event.preventDefault();
          this.toggle();
        }
      }
    });

    // Set up window resize handler to reposition panels
    window.addEventListener('resize', () => {
      if (
        this.persistentProgressPanel &&
        this.persistentProgressPanel.style.display !== 'none'
      ) {
        // Recreate panel with new positioning
        this.showPersistentProgress();
      }
    });
  }
}
