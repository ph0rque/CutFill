import type { AssignmentProgress, AssignmentObjective, AssignmentConfig } from './assignments';

export interface FeedbackMessage {
  id: string;
  type: 'hint' | 'progress' | 'warning' | 'success' | 'tip';
  message: string;
  priority: 'low' | 'medium' | 'high';
  duration: number; // milliseconds
  objectiveId?: string;
  actionRequired?: boolean;
}

export interface ProgressIndicator {
  objectiveId: string;
  current: number;
  target: number;
  unit: string;
  status: 'not_started' | 'in_progress' | 'near_completion' | 'completed';
  trend: 'improving' | 'stable' | 'declining' | 'unknown';
}

export class AssignmentFeedbackSystem {
  private feedbackContainer: HTMLElement | null = null;
  private progressContainer: HTMLElement | null = null;
  private activeFeedback: Map<string, HTMLElement> = new Map();
  private lastProgressValues: Map<string, number> = new Map();
  private feedbackQueue: FeedbackMessage[] = [];
  private isInitialized: boolean = false;

  constructor() {
    this.createFeedbackUI();
  }

  /**
   * Initialize the feedback UI
   */
  private createFeedbackUI(): void {
    if (this.isInitialized) return;

    // Create feedback container
    this.feedbackContainer = document.createElement('div');
    this.feedbackContainer.id = 'assignment-feedback-container';
    this.feedbackContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      max-width: 350px;
      z-index: 1500;
      pointer-events: none;
    `;

    // Create progress container
    this.progressContainer = document.createElement('div');
    this.progressContainer.id = 'assignment-progress-container';
    this.progressContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(0,0,0,0.85);
      color: white;
      padding: 15px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      max-width: 300px;
      z-index: 1500;
      display: none;
      backdrop-filter: blur(5px);
    `;

    document.body.appendChild(this.feedbackContainer);
    document.body.appendChild(this.progressContainer);
    this.isInitialized = true;
  }

  /**
   * Show assignment feedback and progress indicators
   */
  public showAssignmentStarted(assignment: AssignmentConfig): void {
    this.showProgressContainer();
    this.showFeedback({
      id: 'assignment_started',
      type: 'success',
      message: `🚀 Assignment Started: ${assignment.name}`,
      priority: 'high',
      duration: 4000
    });

    // Show initial hints
    assignment.hints.slice(0, 2).forEach((hint, index) => {
      setTimeout(() => {
        this.showFeedback({
          id: `initial_hint_${index}`,
          type: 'tip',
          message: `💡 ${hint}`,
          priority: 'medium',
          duration: 6000
        });
      }, 1000 + index * 2000);
    });
  }

  /**
   * Update progress display
   */
  public updateProgress(assignment: AssignmentConfig, progress: AssignmentProgress): void {
    if (!this.progressContainer) return;

    const indicators = this.generateProgressIndicators(assignment, progress);
    this.updateProgressDisplay(indicators, progress);
    this.analyzeProgressAndGiveFeedback(assignment, progress, indicators);
  }

  /**
   * Generate progress indicators for objectives
   */
  private generateProgressIndicators(assignment: AssignmentConfig, progress: AssignmentProgress): ProgressIndicator[] {
    return progress.objectives.map(objective => {
      const lastValue = this.lastProgressValues.get(objective.id) || 0;
      const currentValue = objective.score;
      
      let trend: 'improving' | 'stable' | 'declining' | 'unknown' = 'unknown';
      if (currentValue > lastValue + 1) trend = 'improving';
      else if (currentValue < lastValue - 1) trend = 'declining';
      else trend = 'stable';

      this.lastProgressValues.set(objective.id, currentValue);

      let status: 'not_started' | 'in_progress' | 'near_completion' | 'completed' = 'not_started';
      if (objective.completed) status = 'completed';
      else if (currentValue >= 75) status = 'near_completion';
      else if (currentValue > 10) status = 'in_progress';

      return {
        objectiveId: objective.id,
        current: currentValue,
        target: 100,
        unit: '%',
        status,
        trend
      };
    });
  }

  /**
   * Update progress display in the UI
   */
  private updateProgressDisplay(indicators: ProgressIndicator[], progress: AssignmentProgress): void {
    if (!this.progressContainer) return;

    const completedObjectives = indicators.filter(i => i.status === 'completed').length;
    const totalObjectives = indicators.length;
    const overallScore = Math.round(progress.currentScore);

    this.progressContainer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h4 style="margin: 0; color: #4CAF50;">📊 Progress Tracker</h4>
        <span style="font-size: 12px; color: #ccc;">${completedObjectives}/${totalObjectives} Complete</span>
      </div>

      <div style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
          <span style="font-size: 12px;">Overall Score:</span>
          <span style="font-size: 12px; font-weight: bold; color: ${overallScore >= 70 ? '#4CAF50' : overallScore >= 50 ? '#FF9800' : '#F44336'};">${overallScore}%</span>
        </div>
        <div style="background: rgba(255,255,255,0.2); border-radius: 10px; height: 6px; overflow: hidden;">
          <div style="background: ${overallScore >= 70 ? '#4CAF50' : overallScore >= 50 ? '#FF9800' : '#F44336'}; height: 100%; width: ${overallScore}%; transition: width 0.3s ease;"></div>
        </div>
      </div>

      <div style="max-height: 150px; overflow-y: auto;">
        ${indicators.map(indicator => this.createObjectiveProgressItem(indicator, progress)).join('')}
      </div>

      <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 11px; color: #ccc;">
        ⏱️ Time: ${this.formatElapsedTime(progress.startTime)}<br>
        📊 Cut: ${progress.volumeData.totalCut.toFixed(1)} yd³ | Fill: ${progress.volumeData.totalFill.toFixed(1)} yd³
      </div>
    `;
  }

  /**
   * Create progress item for individual objective
   */
  private createObjectiveProgressItem(indicator: ProgressIndicator, progress: AssignmentProgress): string {
    const objective = progress.objectives.find(obj => obj.id === indicator.objectiveId);
    if (!objective) return '';

    const statusColor = {
      'completed': '#4CAF50',
      'near_completion': '#FF9800', 
      'in_progress': '#2196F3',
      'not_started': '#666'
    }[indicator.status];

    const trendIcon = {
      'improving': '📈',
      'stable': '➡️',
      'declining': '📉',
      'unknown': '⏳'
    }[indicator.trend];

    return `
      <div style="margin-bottom: 8px; padding: 6px; background: rgba(255,255,255,0.1); border-radius: 4px; border-left: 3px solid ${statusColor};">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
          <span style="font-size: 11px; font-weight: bold;">${objective.description.substring(0, 40)}${objective.description.length > 40 ? '...' : ''}</span>
          <span style="font-size: 10px;">${trendIcon}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="background: rgba(255,255,255,0.2); border-radius: 8px; height: 4px; flex: 1; margin-right: 8px; overflow: hidden;">
            <div style="background: ${statusColor}; height: 100%; width: ${indicator.current}%; transition: width 0.3s ease;"></div>
          </div>
          <span style="font-size: 10px; color: ${statusColor}; font-weight: bold;">${Math.round(indicator.current)}%</span>
        </div>
      </div>
    `;
  }

  /**
   * Analyze progress and provide contextual feedback
   */
  private analyzeProgressAndGiveFeedback(assignment: AssignmentConfig, progress: AssignmentProgress, indicators: ProgressIndicator[]): void {
    // Check for objectives that need attention
    indicators.forEach(indicator => {
      const objective = progress.objectives.find(obj => obj.id === indicator.objectiveId);
      if (!objective) return;

      // Provide specific feedback based on objective type and progress
      if (indicator.status === 'not_started' && this.getElapsedMinutes(progress.startTime) > 2) {
        this.showFeedback({
          id: `objective_not_started_${objective.id}`,
          type: 'hint',
          message: `💭 Haven't started: ${objective.description}`,
          priority: 'medium',
          duration: 5000,
          objectiveId: objective.id
        });
      }

      if (indicator.trend === 'declining' && indicator.current > 20) {
        this.showFeedback({
          id: `objective_declining_${objective.id}`,
          type: 'warning',
          message: `⚠️ Progress declining on: ${objective.description.substring(0, 30)}...`,
          priority: 'high',
          duration: 4000,
          objectiveId: objective.id
        });
      }

      if (indicator.status === 'near_completion' && !objective.completed) {
        this.showFeedback({
          id: `objective_near_complete_${objective.id}`,
          type: 'tip',
          message: `🎯 Almost there! Focus on: ${objective.description.substring(0, 30)}...`,
          priority: 'high',
          duration: 3000,
          objectiveId: objective.id
        });
      }
    });

    // Overall progress feedback
    const overallScore = Math.round(progress.currentScore);
    const elapsedMinutes = this.getElapsedMinutes(progress.startTime);
    
    if (overallScore >= 90 && !this.hasRecentFeedback('excellent_progress')) {
      this.showFeedback({
        id: 'excellent_progress',
        type: 'success',
        message: '🌟 Excellent work! You\'re mastering these earthworks skills!',
        priority: 'high',
        duration: 4000
      });
    } else if (overallScore >= 70 && elapsedMinutes > 5 && !this.hasRecentFeedback('good_progress')) {
      this.showFeedback({
        id: 'good_progress',
        type: 'success',
        message: '👍 Great progress! Keep up the solid work!',
        priority: 'medium',
        duration: 3000
      });
    }

    // Time-based feedback
    if (elapsedMinutes > assignment.estimatedTime * 0.8 && overallScore < 50) {
      this.showFeedback({
        id: 'time_pressure',
        type: 'warning',
        message: '⏰ Time is running out! Focus on the most important objectives.',
        priority: 'high',
        duration: 5000
      });
    }

    // Volume balance feedback
    const netMovement = Math.abs(progress.volumeData.totalCut - progress.volumeData.totalFill);
    if (netMovement > 10 && !this.hasRecentFeedback('volume_balance')) {
      this.showFeedback({
        id: 'volume_balance',
        type: 'tip',
        message: `⚖️ Try to balance cut and fill volumes for efficiency (current imbalance: ${netMovement.toFixed(1)} yd³)`,
        priority: 'medium',
        duration: 4000
      });
    }
  }

  /**
   * Show feedback message
   */
  private showFeedback(feedback: FeedbackMessage): void {
    if (!this.feedbackContainer || this.activeFeedback.has(feedback.id)) return;

    const feedbackElement = document.createElement('div');
    feedbackElement.style.cssText = `
      background: ${this.getFeedbackColor(feedback.type)};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideInFromRight 0.3s ease-out;
      pointer-events: auto;
      cursor: pointer;
      line-height: 1.4;
    `;

    // Add animation styles
    if (!document.querySelector('style[data-feedback-animations]')) {
      const style = document.createElement('style');
      style.setAttribute('data-feedback-animations', 'true');
      style.textContent = `
        @keyframes slideInFromRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutToRight {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    feedbackElement.innerHTML = feedback.message;
    this.feedbackContainer.appendChild(feedbackElement);
    this.activeFeedback.set(feedback.id, feedbackElement);

    // Click to dismiss
    feedbackElement.addEventListener('click', () => {
      this.removeFeedback(feedback.id);
    });

    // Auto-remove after duration
    setTimeout(() => {
      this.removeFeedback(feedback.id);
    }, feedback.duration);
  }

  /**
   * Remove feedback message
   */
  private removeFeedback(feedbackId: string): void {
    const element = this.activeFeedback.get(feedbackId);
    if (element && this.feedbackContainer) {
      element.style.animation = 'slideOutToRight 0.3s ease-out';
      setTimeout(() => {
        if (this.feedbackContainer && this.feedbackContainer.contains(element)) {
          this.feedbackContainer.removeChild(element);
        }
        this.activeFeedback.delete(feedbackId);
      }, 300);
    }
  }

  /**
   * Get feedback color based on type
   */
  private getFeedbackColor(type: string): string {
    const colors = {
      hint: '#2196F3',
      progress: '#4CAF50',
      warning: '#FF9800',
      success: '#4CAF50',
      tip: '#9C27B0'
    };
    return colors[type as keyof typeof colors] || '#666';
  }

  /**
   * Show progress container
   */
  private showProgressContainer(): void {
    if (this.progressContainer) {
      this.progressContainer.style.display = 'block';
    }
  }

  /**
   * Hide progress container
   */
  public hideProgressContainer(): void {
    if (this.progressContainer) {
      this.progressContainer.style.display = 'none';
    }
  }

  /**
   * Clear all feedback
   */
  public clearAllFeedback(): void {
    this.activeFeedback.forEach((element, id) => {
      this.removeFeedback(id);
    });
  }

  /**
   * Check if we've shown similar feedback recently
   */
  private hasRecentFeedback(feedbackId: string): boolean {
    return this.activeFeedback.has(feedbackId);
  }

  /**
   * Get elapsed time in minutes
   */
  private getElapsedMinutes(startTime: Date): number {
    return (Date.now() - startTime.getTime()) / 60000;
  }

  /**
   * Format elapsed time
   */
  private formatElapsedTime(startTime: Date): string {
    const elapsed = this.getElapsedMinutes(startTime);
    const minutes = Math.floor(elapsed);
    const seconds = Math.floor((elapsed - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Show assignment completion feedback
   */
  public showAssignmentCompleted(assignment: AssignmentConfig, progress: AssignmentProgress, passed: boolean): void {
    const score = Math.round(progress.currentScore);
    
    this.showFeedback({
      id: 'assignment_completed',
      type: passed ? 'success' : 'warning',
      message: passed 
        ? `🎉 Assignment Complete! Score: ${score}% - Excellent work!`
        : `📝 Assignment Complete! Score: ${score}% - Try again for a better score!`,
      priority: 'high',
      duration: 6000
    });

    // Hide progress container after a delay
    setTimeout(() => {
      this.hideProgressContainer();
    }, 3000);
  }
} 