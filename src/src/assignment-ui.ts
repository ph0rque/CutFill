import { AssignmentManager } from './assignments';
import type { AssignmentConfig, AssignmentProgress, AssignmentObjective } from './assignments';
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
  }

  /**
   * Get current user from Supabase
   */
  private async getCurrentUser(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
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
      onProgressUpdate: (progress) => {
        this.updateProgressDisplay(progress);
        this.updatePersistentProgressPanel();
        // Update real-time feedback system
        const assignment = this.assignmentManager.getCurrentAssignment();
        if (assignment) {
          this.feedbackSystem.updateProgress(assignment, progress);
        }
      },
      onObjectiveComplete: (objective) => this.showObjectiveComplete(objective),
      onAssignmentComplete: (progress) => {
        this.showAssignmentComplete(progress);
        this.updatePersistentProgressPanel();
        // Show completion feedback
        const assignment = this.assignmentManager.getCurrentAssignment();
        if (assignment) {
          const passed = progress.currentScore >= assignment.successCriteria.minimumScore;
          this.feedbackSystem.showAssignmentCompleted(assignment, progress, passed);
        }
      },
      onAssignmentStop: () => {
        this.hidePersistentProgress();
        this.updateMainUIAssignmentDisplay();
      }
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
      <h2 style="margin: 0; color: #4CAF50;">📋 Assignments & Training</h2>
      <button id="close-assignments" style="
        background: #666;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 14px;
      ">✕ Close</button>
    `;

    // Get available assignments
    const assignments = await this.assignmentManager.getAvailableAssignments();
    
    // Current assignment status
    const currentAssignment = this.assignmentManager.getCurrentAssignment();
    const currentProgress = this.assignmentManager.getProgress();

    // Current assignment section (if any)
    if (currentAssignment && currentProgress) {
      const currentSection = this.createCurrentAssignmentSection(currentAssignment, currentProgress);
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
  private createCurrentAssignmentSection(assignment: AssignmentConfig, progress: AssignmentProgress): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = `
      background: rgba(76, 175, 80, 0.2);
      border: 1px solid #4CAF50;
      border-radius: 6px;
      padding: 20px;
      margin-bottom: 25px;
    `;

    const completedObjectives = progress.objectives.filter(obj => obj.completed).length;
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
          ${progress.objectives.map(obj => `
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
          `).join('')}
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
   * Create assignments selection section
   */
  private async createAssignmentsSection(assignments: AssignmentConfig[]): Promise<HTMLElement> {
    const section = document.createElement('div');
    
    // Section header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    `;
    
    header.innerHTML = `
      <h3 style="margin: 0; color: white;">📚 Available Assignments</h3>
      <div style="display: flex; gap: 10px; align-items: center;">
        <select id="age-group-selector" style="
          background: rgba(76,175,80,0.2);
          color: white;
          border: 1px solid #4CAF50;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 12px;
          margin-right: 10px;
        ">
          ${this.assignmentManager.getAgeGroups().map(group => `
            <option value="${group.id}" ${group.id === this.assignmentManager.getCurrentAgeGroup().id ? 'selected' : ''}>
              ${group.name} (${group.ageRange})
            </option>
          `).join('')}
        </select>
        <select id="difficulty-filter" style="
          background: rgba(255,255,255,0.1);
          color: white;
          border: 1px solid #666;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 12px;
        ">
          <option value="all">All Difficulties</option>
          <option value="1">⭐ Level 1 (Beginner)</option>
          <option value="2">⭐⭐ Level 2 (Easy)</option>
          <option value="3">⭐⭐⭐ Level 3 (Medium)</option>
          <option value="4">⭐⭐⭐⭐ Level 4 (Hard)</option>
          <option value="5">⭐⭐⭐⭐⭐ Level 5 (Expert)</option>
        </select>
      </div>
    `;

    section.appendChild(header);

    // Age scaling info panel
    const ageInfo = this.createAgeScalingInfoPanel();
    section.appendChild(ageInfo);

    // Assignments grid
    const grid = document.createElement('div');
    grid.id = 'assignments-grid';
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 15px;
    `;

    // Create assignment cards
    assignments.forEach(assignment => {
      const card = this.createAssignmentCard(assignment);
      grid.appendChild(card);
    });

    section.appendChild(grid);
    return section;
  }

  /**
   * Create individual assignment card
   */
  private createAssignmentCard(assignment: AssignmentConfig): HTMLElement {
    const card = document.createElement('div');
    card.className = 'assignment-card';
    card.setAttribute('data-difficulty', assignment.difficulty.toString());
    
    // Check if this is a competitive assignment
    const isCompetitive = assignment.name.includes('COMPETITIVE') || 
                         assignment.description.includes('COMPETITIVE') ||
                         assignment.id.includes('race') || 
                         assignment.id.includes('duel') || 
                         assignment.id.includes('showdown');

    card.style.cssText = `
      background: ${isCompetitive ? 'rgba(255,165,0,0.15)' : 'rgba(255,255,255,0.1)'};
      border: 1px solid ${isCompetitive ? '#FF6B35' : '#666'};
      border-radius: 6px;
      padding: 15px;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
      ${isCompetitive ? 'box-shadow: 0 0 10px rgba(255,107,53,0.3);' : ''}
    `;

    // Difficulty stars
    const stars = '⭐'.repeat(assignment.difficulty);
    
    // Category color
    const categoryColors: Record<string, string> = {
      foundation: '#FF9800',
      drainage: '#2196F3', 
      grading: '#4CAF50',
      excavation: '#F44336',
      road_construction: '#9C27B0'
    };
    const categoryColor = categoryColors[assignment.category] || '#666';

    card.innerHTML = `
      ${isCompetitive ? '<div style="position: absolute; top: -5px; right: -5px; background: #FF6B35; color: white; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; transform: rotate(15deg);">⚡ COMPETITIVE</div>' : ''}
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <div style="color: ${categoryColor}; font-weight: bold; font-size: 12px; text-transform: uppercase;">
          ${assignment.category.replace('_', ' ')}
        </div>
        <div style="color: #FFD700; font-size: 14px;">${stars}</div>
      </div>
      
      <h4 style="margin: 0 0 8px 0; color: ${isCompetitive ? '#FFB366' : 'white'}; font-size: 16px;">${assignment.name}</h4>
      <p style="margin: 0 0 12px 0; color: #ccc; font-size: 14px; line-height: 1.4;">${assignment.description}</p>
      
      ${isCompetitive ? `
        <div style="margin-bottom: 12px; padding: 8px; background: rgba(255,107,53,0.2); border-left: 3px solid #FF6B35; border-radius: 4px;">
          <div style="font-weight: bold; font-size: 12px; color: #FFB366; margin-bottom: 4px;">🏁 Competitive Features:</div>
          <div style="font-size: 11px; color: #ccc;">
            • Real-time leaderboard scoring<br>
            • Speed bonuses for fast completion<br>
            • Head-to-head multiplayer racing<br>
            • Championship points system
          </div>
        </div>
      ` : ''}
      
      <div style="margin-bottom: 12px;">
        <div style="font-weight: bold; font-size: 12px; color: #4CAF50; margin-bottom: 5px;">Objectives:</div>
        <div style="font-size: 11px; color: #ccc;">
          ${assignment.objectives.slice(0, 2).map(obj => `• ${obj.description}`).join('<br>')}
          ${assignment.objectives.length > 2 ? `<br>• +${assignment.objectives.length - 2} more objectives` : ''}
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; font-size: 11px;">
        <div style="text-align: center; padding: 6px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <div style="font-weight: bold; color: #2196F3;">Est. Time</div>
          <div>${assignment.estimatedTime} min</div>
        </div>
        <div style="text-align: center; padding: 6px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <div style="font-weight: bold; color: #4CAF50;">Min Score</div>
          <div>${assignment.successCriteria.minimumScore}%</div>
        </div>
      </div>

      <button 
        class="start-assignment-btn" 
        data-assignment-id="${assignment.id}"
        style="
          width: 100%;
          padding: 8px;
          background: ${isCompetitive ? '#FF6B35' : '#4CAF50'};
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          transition: background 0.3s ease;
        "
      >${isCompetitive ? '🏁 Join Competition' : '🚀 Start Assignment'}</button>
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
   * Setup UI event listeners
   */
  private setupUIEventListeners(): void {
    if (!this.container) return;

    // Close button
    const closeBtn = this.container.querySelector('#close-assignments');
    closeBtn?.addEventListener('click', () => this.hide());

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
      btn.addEventListener('click', async (e) => {
        const assignmentId = (e.target as HTMLElement).getAttribute('data-assignment-id');
        if (assignmentId) {
          // Ensure we have a user ID (wait for it if needed)
          if (!this.currentUserId) {
            await this.getCurrentUser();
          }
          
          // Use guest as fallback if still no user ID
          const userId = this.currentUserId || 'guest';
          
          console.log(`Starting assignment ${assignmentId} for user ${userId}`);
          
          const success = await this.assignmentManager.startAssignment(assignmentId, userId);
          if (success) {
            this.hide();
            this.updateMainUIAssignmentDisplay();
            this.showAssignmentStarted(assignmentId);
            console.log(`Assignment ${assignmentId} started successfully`);
          } else {
            console.error(`Failed to start assignment ${assignmentId}`);
            this.showNotification('Failed to start assignment. Please try again.', 'warning');
          }
        } else {
          console.error('No assignment ID found on button');
        }
      });
    });

    // Age group selector
    const ageGroupSelector = this.container.querySelector('#age-group-selector') as HTMLSelectElement;
    ageGroupSelector?.addEventListener('change', async () => {
      const success = this.assignmentManager.setAgeGroup(ageGroupSelector.value);
      if (success) {
        // Refresh the entire UI to show age-scaled assignments
        await this.show();
        this.showNotification(`Assignments updated for ${this.assignmentManager.getCurrentAgeGroup().name}!`, 'info');
      }
    });

    // Difficulty filter
    const difficultyFilter = this.container.querySelector('#difficulty-filter') as HTMLSelectElement;
    difficultyFilter?.addEventListener('change', () => {
      this.filterAssignments(difficultyFilter.value);
    });

    // Click outside to close
    this.container.addEventListener('click', (e) => {
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
    this.showNotification(`✅ Objective Complete: ${objective.description}`, 'success');
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
   * Show assignment started notification
   */
  private showAssignmentStarted(assignmentId: string): void {
    this.showNotification(`🚀 Assignment Started! Follow the objectives in the precision tools.`, 'info');
    
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
  private showNotification(message: string, type: 'success' | 'warning' | 'info' = 'info'): void {
    const colors = {
      success: '#4CAF50',
      warning: '#FF9800', 
      info: '#2196F3'
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
    const assignmentProgressDiv = document.getElementById('assignment-progress');
    
    const assignment = this.assignmentManager.getCurrentAssignment();
    const progress = this.assignmentManager.getProgress();

    if (currentAssignmentDiv) {
      if (assignment && progress) {
        const score = Math.round(progress.currentScore);
        const completedObjectives = progress.objectives.filter(obj => obj.completed).length;
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
    // Calculate safe position below precision tools panel
    const precisionPanel = document.getElementById('precision-tools-ui');
    const mainPanel = document.getElementById('main-ui-panel');
    
    let topPosition = 380; // Default fallback
    let leftPosition = 10; // Default left position
    
    // Check if precision tools panel exists and calculate position below it
    if (precisionPanel) {
      const precisionRect = precisionPanel.getBoundingClientRect();
      topPosition = precisionRect.bottom + 10;
    } 
    // Fallback to main panel if precision panel doesn't exist
    else if (mainPanel) {
      const mainRect = mainPanel.getBoundingClientRect();
      topPosition = mainRect.bottom + 10;
    }
    
    // Responsive positioning and sizing based on screen size
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Initialize responsive properties
    let panelWidth = '350px';
    let panelPadding = '15px';
    
    // Mobile devices (width < 768px)
    if (screenWidth < 768) {
      leftPosition = 10;
      topPosition = Math.min(topPosition, screenHeight - 250); // Ensure it fits
      panelWidth = `${Math.min(screenWidth - 20, 350)}px`;
      panelPadding = '12px';
    }
    // Tablet devices (width < 1024px)  
    else if (screenWidth < 1024) {
      // Ensure we don't go off-screen vertically
      const maxHeight = screenHeight - 200;
      if (topPosition > maxHeight) {
        leftPosition = 380; // Position to the right
        topPosition = 60;
      }
      panelWidth = '320px';
      panelPadding = '14px';
    }
    // Desktop devices
    else {
      // Ensure we don't go off-screen
      const maxHeight = screenHeight - 200;
      if (topPosition > maxHeight) {
        // If it would go off-screen, position to the right instead
        leftPosition = 420;
        topPosition = 60; // Align with precision tools
      }
    }
    
    this.persistentProgressPanel.style.cssText = `
      position: fixed;
      top: ${topPosition}px;
      left: ${leftPosition}px;
      background: rgba(0,0,0,0.9);
      color: white;
      padding: ${panelPadding};
      border-radius: 8px;
      font-family: Arial, sans-serif;
      width: ${panelWidth};
      max-width: 400px;
      z-index: 1001;
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

    const completedObjectives = progress.objectives.filter(obj => obj.completed).length;
    const totalObjectives = progress.objectives.length;
    const progressPercent = Math.round(progress.currentScore);
    const timeElapsed = Math.floor((Date.now() - progress.startTime.getTime()) / 60000);

    this.persistentProgressPanel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <div style="flex: 1;">
          <h3 style="margin: 0 0 4px 0; color: #4CAF50;">📋 ${assignment.name}</h3>
          <div style="font-size: 12px; color: #ccc; line-height: 1.3; margin-bottom: 6px;">
            ${assignment.description}
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

      <div style="margin-bottom: 10px;">
        <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px;">Objectives (${completedObjectives}/${totalObjectives}):</div>
        <div style="max-height: 80px; overflow-y: auto;">
          ${progress.objectives.slice(0, 3).map(obj => `
            <div style="display: flex; align-items: center; margin: 3px 0; font-size: 11px;">
              <span style="color: ${obj.completed ? '#4CAF50' : '#ccc'}; margin-right: 6px;">
                ${obj.completed ? '✅' : '⏳'}
              </span>
              <span style="color: ${obj.completed ? '#4CAF50' : '#ccc'};">
                ${obj.description.substring(0, 45)}${obj.description.length > 45 ? '...' : ''}
              </span>
            </div>
          `).join('')}
          ${progress.objectives.length > 3 ? `<div style="font-size: 10px; color: #999; text-align: center; margin-top: 4px;">+${progress.objectives.length - 3} more objectives</div>` : ''}
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; font-size: 10px; color: #ccc; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);">
        <span>⏱️ Time: ${timeElapsed}min</span>
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
   * Initialize the assignment UI system
   */
  public initialize(): void {
    // Update initial display
    this.updateMainUIAssignmentDisplay();
    
    // Show persistent progress panel if assignment is active
    const currentAssignment = this.assignmentManager.getCurrentAssignment();
    if (currentAssignment) {
      this.showPersistentProgress();
    }
    
    // Set up keyboard shortcut (A key)
    document.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'a' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
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
      if (this.persistentProgressPanel && this.persistentProgressPanel.style.display !== 'none') {
        // Recreate panel with new positioning
        this.showPersistentProgress();
      }
    });
  }
} 