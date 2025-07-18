import type { AssignmentConfig, AssignmentObjective } from './assignments';

export interface AgeGroup {
  id: string;
  name: string;
  ageRange: string;
  description: string;
  toleranceMultiplier: number;
  scoreThresholdMultiplier: number;
  timeMultiplier: number;
  hintLevel: 'basic' | 'detailed' | 'minimal';
  complexityLevel: 'simplified' | 'standard' | 'advanced';
}

export class AgeScalingSystem {
  private ageGroups: AgeGroup[] = [
    {
      id: 'kids',
      name: 'Young Builders',
      ageRange: '8-12 years',
      description: 'Simplified mechanics with forgiving tolerances and helpful guidance',
      toleranceMultiplier: 3.0, // 3x more forgiving
      scoreThresholdMultiplier: 0.7, // Lower score requirements (70% of original)
      timeMultiplier: 2.0, // 2x more time
      hintLevel: 'detailed',
      complexityLevel: 'simplified'
    },
    {
      id: 'teens',
      name: 'STEM Explorers', 
      ageRange: '13-25 years',
      description: 'Standard mechanics with competitive elements and real-world context',
      toleranceMultiplier: 1.5, // 1.5x more forgiving
      scoreThresholdMultiplier: 0.85, // Slightly lower requirements (85% of original)
      timeMultiplier: 1.3, // 30% more time
      hintLevel: 'detailed',
      complexityLevel: 'standard'
    },
    {
      id: 'adults',
      name: 'Professional Practitioners',
      ageRange: '26+ years',
      description: 'Realistic tolerances with professional-grade precision requirements',
      toleranceMultiplier: 1.0, // Standard tolerances
      scoreThresholdMultiplier: 1.0, // Full requirements
      timeMultiplier: 1.0, // Standard time
      hintLevel: 'minimal',
      complexityLevel: 'advanced'
    }
  ];

  private currentAgeGroup: AgeGroup;

  constructor() {
    // Default to teens group
    this.currentAgeGroup = this.ageGroups[1];
  }

  /**
   * Get all available age groups
   */
  public getAgeGroups(): AgeGroup[] {
    return [...this.ageGroups];
  }

  /**
   * Set current age group
   */
  public setAgeGroup(ageGroupId: string): boolean {
    const ageGroup = this.ageGroups.find(group => group.id === ageGroupId);
    if (ageGroup) {
      this.currentAgeGroup = ageGroup;
      console.log(`Age group set to: ${ageGroup.name} (${ageGroup.ageRange})`);
      return true;
    }
    return false;
  }

  /**
   * Get current age group
   */
  public getCurrentAgeGroup(): AgeGroup {
    return this.currentAgeGroup;
  }

  /**
   * Scale assignment for current age group
   */
  public scaleAssignment(assignment: AssignmentConfig): AssignmentConfig {
    // Safety check - ensure assignment is valid
    if (!assignment || typeof assignment !== 'object') {
      console.warn('Invalid assignment passed to scaleAssignment:', assignment);
      return assignment;
    }

    const scaledAssignment: AssignmentConfig = JSON.parse(JSON.stringify(assignment));
    
    // Scale objectives - ensure we have objectives array
    if (Array.isArray(scaledAssignment.objectives)) {
      scaledAssignment.objectives = scaledAssignment.objectives.map(obj => 
        this.scaleObjective(obj)
      );
    } else {
      console.warn('Assignment has no objectives array:', assignment);
      scaledAssignment.objectives = [];
    }

    // Scale time estimate
    scaledAssignment.estimatedTime = Math.round(
      assignment.estimatedTime * this.currentAgeGroup.timeMultiplier
    );

    // Scale success criteria
    scaledAssignment.successCriteria.minimumScore = Math.round(
      assignment.successCriteria.minimumScore * this.currentAgeGroup.scoreThresholdMultiplier
    );

    // Add age-appropriate hints
    scaledAssignment.hints = this.getAgeAppropriateHints(assignment, scaledAssignment.hints);

    // Update description with age group context
    scaledAssignment.description = this.addAgeContextToDescription(
      assignment.description,
      this.currentAgeGroup
    );

    return scaledAssignment;
  }

  /**
   * Scale individual objective for current age group
   */
  private scaleObjective(objective: AssignmentObjective): AssignmentObjective {
    // Safety check - ensure objective has required properties
    if (!objective || typeof objective !== 'object') {
      console.warn('Invalid objective passed to scaleObjective:', objective);
      return objective;
    }

    const scaledObjective: AssignmentObjective = { ...objective };

    // Scale tolerance (make more forgiving for younger users)
    scaledObjective.tolerance = (objective.tolerance || 0.1) * this.currentAgeGroup.toleranceMultiplier;

    // Scale time-based targets
    if (scaledObjective.target && typeof scaledObjective.target === 'object') {
      if ('timeTarget' in scaledObjective.target) {
        scaledObjective.target = {
          ...scaledObjective.target,
          timeTarget: scaledObjective.target.timeTarget * this.currentAgeGroup.timeMultiplier
        };
      }
    }

    // Adjust objective description for age group
    scaledObjective.description = this.adjustObjectiveDescription(
      objective.description,
      this.currentAgeGroup
    );

    return scaledObjective;
  }

  /**
   * Get age-appropriate hints
   */
  private getAgeAppropriateHints(original: AssignmentConfig, originalHints: string[]): string[] {
    const ageGroup = this.currentAgeGroup;
    let hints = [...originalHints];

    switch (ageGroup.hintLevel) {
      case 'detailed':
        // Add more helpful hints for kids and teens
        hints = [
          ...hints,
          ...this.getDetailedHints(original)
        ];
        break;
      
      case 'basic':
        // Keep original hints but simplify language
        hints = hints.map(hint => this.simplifyHintLanguage(hint));
        break;
      
      case 'minimal':
        // Keep only essential hints for professionals
        hints = hints.filter(hint => this.isEssentialHint(hint));
        break;
    }

    // Add age group specific hints
    hints.push(`Optimized for ${ageGroup.name} (${ageGroup.ageRange})`);

    return hints;
  }

  /**
   * Get detailed hints for younger users
   */
  private getDetailedHints(assignment: AssignmentConfig): string[] {
    const hints: string[] = [];
    
    if (this.currentAgeGroup.id === 'kids') {
      hints.push(
        '🎯 Take your time - accuracy is more important than speed!',
        '🔄 Use the undo button if you make a mistake',
        '📏 Check the volume display to see your progress',
        '🎮 Remember: you\'re learning real engineering skills!'
      );
    } else if (this.currentAgeGroup.id === 'teens') {
      hints.push(
        '💡 This connects to real-world construction and sustainability',
        '⚡ Challenge yourself to beat the time bonus targets',
        '📊 Track your improvement across multiple attempts',
        '🌍 These skills apply to environmental engineering careers'
      );
    }

    return hints;
  }

  /**
   * Simplify hint language for younger users
   */
  private simplifyHintLanguage(hint: string): string {
    return hint
      .replace(/precise/gi, 'careful')
      .replace(/optimal/gi, 'best')
      .replace(/efficiency/gi, 'doing good work')
      .replace(/tolerance/gi, 'close enough')
      .replace(/excavate/gi, 'dig')
      .replace(/magnitude/gi, 'amount');
  }

  /**
   * Check if hint is essential for professionals
   */
  private isEssentialHint(hint: string): boolean {
    const essentialKeywords = ['tolerance', 'grade', 'slope', 'volume', 'balance', 'precision'];
    return essentialKeywords.some(keyword => 
      hint.toLowerCase().includes(keyword)
    );
  }

  /**
   * Adjust objective description for age group
   */
  private adjustObjectiveDescription(description: string, ageGroup: AgeGroup): string {
    // Safety check - ensure description is a string
    if (!description || typeof description !== 'string') {
      console.warn('Missing or invalid objective description:', description);
      return description || 'Complete objective';
    }

    if (ageGroup.id === 'kids') {
      return description
        .replace(/±(\d+\.?\d*) inch/g, '±$1 inch (about the width of your thumb)')
        .replace(/\d+%/g, match => `${match} (very close!)`);
    } else if (ageGroup.id === 'teens') {
      // Add real-world context
      if (description.includes('foundation')) {
        return `${description} (Like preparing land for a house foundation!)`;
      } else if (description.includes('drainage')) {
        return `${description} (Essential for flood prevention and environmental protection!)`;
      }
    }
    
    return description;
  }

  /**
   * Add age context to assignment description
   */
  private addAgeContextToDescription(description: string, ageGroup: AgeGroup): string {
    const prefix = this.getAgeAppropriatePrefix(ageGroup);
    return `${prefix} ${description}`;
  }

  /**
   * Get age-appropriate prefix for assignment descriptions
   */
  private getAgeAppropriatePrefix(ageGroup: AgeGroup): string {
    switch (ageGroup.id) {
      case 'kids':
        return '👷‍♀️ BUILDERS ACADEMY:';
      case 'teens':
        return '🌍 FUTURE ENGINEERS:';
      case 'adults':
        return '🏗️ PROFESSIONAL TRAINING:';
      default:
        return '';
    }
  }

  /**
   * Get difficulty adjustments summary for current age group
   */
  public getDifficultyAdjustments(): {
    toleranceAdjustment: string;
    timeAdjustment: string;
    scoringAdjustment: string;
    hintsLevel: string;
  } {
    const group = this.currentAgeGroup;
    
    return {
      toleranceAdjustment: group.toleranceMultiplier > 1 
        ? `${Math.round((group.toleranceMultiplier - 1) * 100)}% more forgiving`
        : 'Standard precision',
      timeAdjustment: group.timeMultiplier > 1
        ? `${Math.round((group.timeMultiplier - 1) * 100)}% more time`
        : 'Standard time limits',
      scoringAdjustment: group.scoreThresholdMultiplier < 1
        ? `${Math.round((1 - group.scoreThresholdMultiplier) * 100)}% lower score requirements`
        : 'Standard scoring',
      hintsLevel: `${group.hintLevel} guidance level`
    };
  }

  /**
   * Reset to default age group
   */
  public resetToDefault(): void {
    this.currentAgeGroup = this.ageGroups[1]; // Default to teens
  }
} 