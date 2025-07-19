// UI/UX Polish System - Responsive, Age-Appropriate, Accessible Interface

export interface UITheme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  typography: {
    fontFamily: string;
    fontSize: {
      xs: string;
      sm: string;
      md: string;
      lg: string;
      xl: string;
      xxl: string;
    };
    fontWeight: {
      light: string;
      normal: string;
      semibold: string;
      bold: string;
    };
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    xxl: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    full: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  animations: {
    fast: string;
    normal: string;
    slow: string;
  };
}

export interface AgeGroupSettings {
  id: string;
  name: string;
  ageRange: string;
  description: string;
  ui: {
    fontSize: 'small' | 'medium' | 'large' | 'xl';
    complexity: 'simplified' | 'standard' | 'advanced';
    animations: 'minimal' | 'standard' | 'enhanced';
    iconSize: 'small' | 'medium' | 'large';
    spacing: 'compact' | 'comfortable' | 'spacious';
    colorContrast: 'normal' | 'high' | 'maximum';
  };
  gameplay: {
    tooltipLevel: 'basic' | 'detailed' | 'expert';
    errorTolerance: 'high' | 'medium' | 'low';
    timeoutLimits: 'extended' | 'standard' | 'strict';
    assistanceLevel: 'guided' | 'hints' | 'minimal';
  };
  accessibility: {
    screenReader: boolean;
    keyboardNav: boolean;
    highContrast: boolean;
    reducedMotion: boolean;
    audioFeedback: boolean;
    hapticFeedback: boolean;
  };
}

export interface ResponsiveBreakpoints {
  mobile: number;
  tablet: number;
  desktop: number;
  wide: number;
}

export class UIPolishSystem {
  private currentTheme: UITheme;
  private currentAgeGroup: AgeGroupSettings;
  private breakpoints: ResponsiveBreakpoints;
  private isInitialized = false;
  private resizeObserver: ResizeObserver | null = null;
  private mediaQueries: { [key: string]: MediaQueryList } = {};
  private accessibilityPreferences: AccessibilityPreferences = {};

  constructor() {
    this.breakpoints = {
      mobile: 768,
      tablet: 1024,
      desktop: 1440,
      wide: 1920,
    };
    this.initializeThemes();
    this.initializeAgeGroups();
    this.detectAccessibilityPreferences();
  }

  private initializeThemes(): void {
    this.currentTheme = {
      name: 'default',
      colors: {
        primary: '#4CAF50',
        secondary: '#2196F3',
        accent: '#FF9800',
        background: '#121212',
        surface: '#1E1E1E',
        text: '#FFFFFF',
        textSecondary: '#B0B0B0',
        success: '#4CAF50',
        warning: '#FF9800',
        error: '#F44336',
        info: '#2196F3',
      },
      typography: {
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: {
          xs: '12px',
          sm: '14px',
          md: '16px',
          lg: '18px',
          xl: '24px',
          xxl: '32px',
        },
        fontWeight: {
          light: '300',
          normal: '400',
          semibold: '600',
          bold: '700',
        },
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        xxl: '48px',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        full: '50%',
      },
      shadows: {
        sm: '0 2px 4px rgba(0,0,0,0.1)',
        md: '0 4px 8px rgba(0,0,0,0.2)',
        lg: '0 8px 16px rgba(0,0,0,0.3)',
        xl: '0 12px 24px rgba(0,0,0,0.4)',
      },
      animations: {
        fast: '0.15s ease-out',
        normal: '0.3s ease-out',
        slow: '0.5s ease-out',
      },
    };
  }

  private initializeAgeGroups(): void {
    const ageGroups: AgeGroupSettings[] = [
      {
        id: 'kids',
        name: 'Kids Mode',
        ageRange: '8-12',
        description: 'Large icons, simple interface, lots of guidance',
        ui: {
          fontSize: 'large',
          complexity: 'simplified',
          animations: 'enhanced',
          iconSize: 'large',
          spacing: 'spacious',
          colorContrast: 'high',
        },
        gameplay: {
          tooltipLevel: 'basic',
          errorTolerance: 'high',
          timeoutLimits: 'extended',
          assistanceLevel: 'guided',
        },
        accessibility: {
          screenReader: true,
          keyboardNav: true,
          highContrast: false,
          reducedMotion: false,
          audioFeedback: true,
          hapticFeedback: true,
        },
      },
      {
        id: 'teen',
        name: 'Teen Mode',
        ageRange: '13-17',
        description: 'Modern interface with competitive elements',
        ui: {
          fontSize: 'medium',
          complexity: 'standard',
          animations: 'standard',
          iconSize: 'medium',
          spacing: 'comfortable',
          colorContrast: 'normal',
        },
        gameplay: {
          tooltipLevel: 'detailed',
          errorTolerance: 'medium',
          timeoutLimits: 'standard',
          assistanceLevel: 'hints',
        },
        accessibility: {
          screenReader: true,
          keyboardNav: true,
          highContrast: false,
          reducedMotion: false,
          audioFeedback: false,
          hapticFeedback: false,
        },
      },
      {
        id: 'adult',
        name: 'Adult Mode',
        ageRange: '18-35',
        description: 'Efficient interface for experienced users',
        ui: {
          fontSize: 'medium',
          complexity: 'standard',
          animations: 'standard',
          iconSize: 'medium',
          spacing: 'comfortable',
          colorContrast: 'normal',
        },
        gameplay: {
          tooltipLevel: 'detailed',
          errorTolerance: 'medium',
          timeoutLimits: 'standard',
          assistanceLevel: 'hints',
        },
        accessibility: {
          screenReader: true,
          keyboardNav: true,
          highContrast: false,
          reducedMotion: false,
          audioFeedback: false,
          hapticFeedback: false,
        },
      },
      {
        id: 'professional',
        name: 'Professional Mode',
        ageRange: '25-60+',
        description: 'Advanced interface with detailed technical information',
        ui: {
          fontSize: 'small',
          complexity: 'advanced',
          animations: 'minimal',
          iconSize: 'small',
          spacing: 'compact',
          colorContrast: 'normal',
        },
        gameplay: {
          tooltipLevel: 'expert',
          errorTolerance: 'low',
          timeoutLimits: 'strict',
          assistanceLevel: 'minimal',
        },
        accessibility: {
          screenReader: true,
          keyboardNav: true,
          highContrast: false,
          reducedMotion: true,
          audioFeedback: false,
          hapticFeedback: false,
        },
      },
      {
        id: 'senior',
        name: 'Senior Mode',
        ageRange: '55+',
        description: 'Large text, high contrast, clear navigation',
        ui: {
          fontSize: 'xl',
          complexity: 'simplified',
          animations: 'minimal',
          iconSize: 'large',
          spacing: 'spacious',
          colorContrast: 'maximum',
        },
        gameplay: {
          tooltipLevel: 'basic',
          errorTolerance: 'high',
          timeoutLimits: 'extended',
          assistanceLevel: 'guided',
        },
        accessibility: {
          screenReader: true,
          keyboardNav: true,
          highContrast: true,
          reducedMotion: true,
          audioFeedback: true,
          hapticFeedback: false,
        },
      },
    ];

    // Set default age group
    this.currentAgeGroup = ageGroups[1]; // Teen mode as default
  }

  private detectAccessibilityPreferences(): void {
    this.accessibilityPreferences = {
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches,
      highContrast: window.matchMedia('(prefers-contrast: high)').matches,
      forcedColors: window.matchMedia('(forced-colors: active)').matches,
      darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
      largeText: window.matchMedia('(min-resolution: 1.5dppx)').matches,
    };
  }

  public initialize(): void {
    if (this.isInitialized) return;

    this.createResponsiveCSS();
    this.setupResponsiveObservers();
    this.createAccessibilityControls();
    this.createAgeGroupSelector();
    this.createThemeSelector();
    this.setupKeyboardNavigation();
    this.applyInitialSettings();

    this.isInitialized = true;
  }

  private createResponsiveCSS(): void {
    const style = document.createElement('style');
    style.id = 'ui-polish-responsive';
    style.textContent = `
      /* Base responsive styles */
      .ui-responsive {
        box-sizing: border-box;
        transition: all ${this.currentTheme.animations.normal};
      }
      
      /* Mobile styles */
      @media (max-width: ${this.breakpoints.mobile}px) {
        .ui-responsive {
          font-size: ${this.currentTheme.typography.fontSize.sm};
          padding: ${this.currentTheme.spacing.sm};
        }
        
        .ui-responsive .button {
          min-height: 44px;
          padding: ${this.currentTheme.spacing.md};
        }
        
        .ui-responsive .panel {
          width: 100%;
          max-width: none;
          margin: ${this.currentTheme.spacing.sm};
        }
      }
      
      /* Tablet styles */
      @media (min-width: ${this.breakpoints.mobile + 1}px) and (max-width: ${this.breakpoints.tablet}px) {
        .ui-responsive {
          font-size: ${this.currentTheme.typography.fontSize.md};
          padding: ${this.currentTheme.spacing.md};
        }
        
        .ui-responsive .button {
          min-height: 40px;
          padding: ${this.currentTheme.spacing.sm} ${this.currentTheme.spacing.md};
        }
        
        .ui-responsive .panel {
          width: 400px;
          margin: ${this.currentTheme.spacing.md};
        }
      }
      
      /* Desktop styles */
      @media (min-width: ${this.breakpoints.tablet + 1}px) {
        .ui-responsive {
          font-size: ${this.currentTheme.typography.fontSize.md};
          padding: ${this.currentTheme.spacing.lg};
        }
        
        .ui-responsive .button {
          min-height: 36px;
          padding: ${this.currentTheme.spacing.sm} ${this.currentTheme.spacing.lg};
        }
        
        .ui-responsive .panel {
          width: 350px;
          margin: ${this.currentTheme.spacing.lg};
        }
      }
      
      /* Age group specific styles */
      .ui-kids {
        font-size: ${this.currentTheme.typography.fontSize.xl};
        --icon-size: 32px;
        --spacing: ${this.currentTheme.spacing.xl};
      }
      
      .ui-teen {
        font-size: ${this.currentTheme.typography.fontSize.lg};
        --icon-size: 24px;
        --spacing: ${this.currentTheme.spacing.lg};
      }
      
      .ui-adult {
        font-size: ${this.currentTheme.typography.fontSize.md};
        --icon-size: 20px;
        --spacing: ${this.currentTheme.spacing.md};
      }
      
      .ui-professional {
        font-size: ${this.currentTheme.typography.fontSize.sm};
        --icon-size: 16px;
        --spacing: ${this.currentTheme.spacing.sm};
      }
      
      .ui-senior {
        font-size: ${this.currentTheme.typography.fontSize.xxl};
        --icon-size: 40px;
        --spacing: ${this.currentTheme.spacing.xxl};
      }
      
      /* Accessibility styles */
      .high-contrast {
        filter: contrast(1.5);
      }
      
      .reduced-motion * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
      
      .focus-visible {
        outline: 2px solid ${this.currentTheme.colors.accent};
        outline-offset: 2px;
      }
      
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      
      /* Touch-friendly styles */
      .touch-friendly {
        min-height: 44px;
        min-width: 44px;
        padding: ${this.currentTheme.spacing.md};
      }
      
      /* Print styles */
      @media print {
        .ui-responsive {
          color: black !important;
          background: white !important;
        }
        
        .no-print {
          display: none !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  private setupResponsiveObservers(): void {
    // Set up media query listeners
    Object.entries(this.breakpoints).forEach(([name, width]) => {
      const query = `(min-width: ${width}px)`;
      const mq = window.matchMedia(query);
      this.mediaQueries[name] = mq;

      mq.addEventListener('change', e => {
        this.handleBreakpointChange(name, e.matches);
      });
    });

    // Set up resize observer for dynamic content
    this.resizeObserver = new ResizeObserver(entries => {
      entries.forEach(entry => {
        this.handleElementResize(
          entry.target as HTMLElement,
          entry.contentRect
        );
      });
    });

    // Observe the main game container
    const gameContainer = document.body;
    if (gameContainer) {
      this.resizeObserver.observe(gameContainer);
    }
  }

  private handleBreakpointChange(breakpoint: string, matches: boolean): void {
    const body = document.body;
    body.classList.toggle(`breakpoint-${breakpoint}`, matches);

    // Adjust UI for specific breakpoints
    if (breakpoint === 'mobile' && matches) {
      this.enableMobileOptimizations();
    } else if (breakpoint === 'desktop' && matches) {
      this.enableDesktopOptimizations();
    }
  }

  private handleElementResize(element: HTMLElement, rect: DOMRect): void {
    // Adjust text size based on container size
    if (rect.width < 300) {
      element.classList.add('compact-text');
    } else {
      element.classList.remove('compact-text');
    }
  }

  private enableMobileOptimizations(): void {
    const panels = document.querySelectorAll('.panel');
    panels.forEach(panel => {
      (panel as HTMLElement).classList.add('mobile-optimized');
    });

    // Enable touch-friendly interactions
    document.body.classList.add('touch-device');
  }

  private enableDesktopOptimizations(): void {
    const panels = document.querySelectorAll('.panel');
    panels.forEach(panel => {
      (panel as HTMLElement).classList.remove('mobile-optimized');
    });

    // Enable hover effects
    document.body.classList.add('desktop-device');
  }

  private createAccessibilityControls(): void {
    const accessibilityPanel = document.createElement('div');
    accessibilityPanel.id = 'accessibility-controls';
    accessibilityPanel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: ${this.currentTheme.colors.surface};
      border: 1px solid ${this.currentTheme.colors.primary};
      border-radius: ${this.currentTheme.borderRadius.md};
      padding: ${this.currentTheme.spacing.md};
      color: ${this.currentTheme.colors.text};
      font-family: ${this.currentTheme.typography.fontFamily};
      font-size: ${this.currentTheme.typography.fontSize.sm};
      z-index: 1003;
      max-width: 250px;
      box-shadow: ${this.currentTheme.shadows.md};
      display: none;
    `;

    accessibilityPanel.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: ${this.currentTheme.spacing.md};">
        <h3 style="margin: 0; font-size: ${this.currentTheme.typography.fontSize.md};">♿ Accessibility</h3>
        <button id="close-accessibility" style="background: none; border: none; color: ${this.currentTheme.colors.text}; cursor: pointer; font-size: ${this.currentTheme.typography.fontSize.lg};">×</button>
      </div>
      
      <div style="margin-bottom: ${this.currentTheme.spacing.md};">
        <label style="display: flex; align-items: center; gap: ${this.currentTheme.spacing.sm}; margin-bottom: ${this.currentTheme.spacing.sm};">
          <input type="checkbox" id="high-contrast-toggle">
          <span>High Contrast</span>
        </label>
        
        <label style="display: flex; align-items: center; gap: ${this.currentTheme.spacing.sm}; margin-bottom: ${this.currentTheme.spacing.sm};">
          <input type="checkbox" id="reduced-motion-toggle">
          <span>Reduce Motion</span>
        </label>
        
        <label style="display: flex; align-items: center; gap: ${this.currentTheme.spacing.sm}; margin-bottom: ${this.currentTheme.spacing.sm};">
          <input type="checkbox" id="audio-feedback-toggle">
          <span>Audio Feedback</span>
        </label>
        
        <label style="display: flex; align-items: center; gap: ${this.currentTheme.spacing.sm}; margin-bottom: ${this.currentTheme.spacing.sm};">
          <input type="checkbox" id="keyboard-nav-toggle">
          <span>Keyboard Navigation</span>
        </label>
      </div>
      
      <div style="margin-bottom: ${this.currentTheme.spacing.md};">
        <label style="display: block; margin-bottom: ${this.currentTheme.spacing.sm};">Font Size:</label>
        <input type="range" id="font-size-slider" min="12" max="32" value="16" style="width: 100%;">
        <div style="display: flex; justify-content: space-between; font-size: ${this.currentTheme.typography.fontSize.xs}; color: ${this.currentTheme.colors.textSecondary};">
          <span>Small</span>
          <span>Large</span>
        </div>
      </div>
      
      <button id="reset-accessibility" style="width: 100%; padding: ${this.currentTheme.spacing.sm}; background: ${this.currentTheme.colors.primary}; color: white; border: none; border-radius: ${this.currentTheme.borderRadius.sm}; cursor: pointer;">
        Reset to Defaults
      </button>
    `;

    document.body.appendChild(accessibilityPanel);
    this.setupAccessibilityEvents();
  }

  private setupAccessibilityEvents(): void {
    // High contrast toggle
    document
      .getElementById('high-contrast-toggle')
      ?.addEventListener('change', e => {
        const enabled = (e.target as HTMLInputElement).checked;
        document.body.classList.toggle('high-contrast', enabled);
      });

    // Reduced motion toggle
    document
      .getElementById('reduced-motion-toggle')
      ?.addEventListener('change', e => {
        const enabled = (e.target as HTMLInputElement).checked;
        document.body.classList.toggle('reduced-motion', enabled);
      });

    // Audio feedback toggle
    document
      .getElementById('audio-feedback-toggle')
      ?.addEventListener('change', e => {
        const enabled = (e.target as HTMLInputElement).checked;
        this.toggleAudioFeedback(enabled);
      });

    // Keyboard navigation toggle
    document
      .getElementById('keyboard-nav-toggle')
      ?.addEventListener('change', e => {
        const enabled = (e.target as HTMLInputElement).checked;
        this.toggleKeyboardNavigation(enabled);
      });

    // Font size slider
    document
      .getElementById('font-size-slider')
      ?.addEventListener('input', e => {
        const size = (e.target as HTMLInputElement).value;
        this.adjustFontSize(parseInt(size));
      });

    // Reset button
    document
      .getElementById('reset-accessibility')
      ?.addEventListener('click', () => {
        this.resetAccessibilitySettings();
      });

    // Close button
    document
      .getElementById('close-accessibility')
      ?.addEventListener('click', () => {
        this.hideAccessibilityPanel();
      });
  }

  private createAgeGroupSelector(): void {
    const ageGroupPanel = document.createElement('div');
    ageGroupPanel.id = 'age-group-selector';
    ageGroupPanel.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: ${this.currentTheme.colors.surface};
      border: 1px solid ${this.currentTheme.colors.primary};
      border-radius: ${this.currentTheme.borderRadius.md};
      padding: ${this.currentTheme.spacing.md};
      color: ${this.currentTheme.colors.text};
      font-family: ${this.currentTheme.typography.fontFamily};
      font-size: ${this.currentTheme.typography.fontSize.sm};
      z-index: 1003;
      max-width: 300px;
      box-shadow: ${this.currentTheme.shadows.md};
      display: none;
    `;

    ageGroupPanel.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: ${this.currentTheme.spacing.md};">
        <h3 style="margin: 0; font-size: ${this.currentTheme.typography.fontSize.md};">👥 Age Mode</h3>
        <button id="close-age-group" style="background: none; border: none; color: ${this.currentTheme.colors.text}; cursor: pointer; font-size: ${this.currentTheme.typography.fontSize.lg};">×</button>
      </div>
      
      <div id="age-group-options" style="margin-bottom: ${this.currentTheme.spacing.md};">
        <!-- Age group options will be populated here -->
      </div>
      
      <div style="font-size: ${this.currentTheme.typography.fontSize.xs}; color: ${this.currentTheme.colors.textSecondary}; line-height: 1.4;">
        <strong>Current:</strong> <span id="current-age-group">${this.currentAgeGroup.name}</span><br>
        <span id="current-age-description">${this.currentAgeGroup.description}</span>
      </div>
    `;

    document.body.appendChild(ageGroupPanel);
    this.populateAgeGroupOptions();
    this.setupAgeGroupEvents();
  }

  private populateAgeGroupOptions(): void {
    const container = document.getElementById('age-group-options');
    if (!container) return;

    const ageGroups = [
      { id: 'kids', name: 'Kids Mode', ageRange: '8-12', icon: '🧒' },
      { id: 'teen', name: 'Teen Mode', ageRange: '13-17', icon: '👦' },
      { id: 'adult', name: 'Adult Mode', ageRange: '18-35', icon: '👨' },
      {
        id: 'professional',
        name: 'Professional Mode',
        ageRange: '25-60+',
        icon: '👨‍💼',
      },
      { id: 'senior', name: 'Senior Mode', ageRange: '55+', icon: '👴' },
    ];

    container.innerHTML = ageGroups
      .map(
        group => `
      <label style="display: flex; align-items: center; gap: ${this.currentTheme.spacing.md}; margin-bottom: ${this.currentTheme.spacing.sm}; cursor: pointer; padding: ${this.currentTheme.spacing.sm}; border-radius: ${this.currentTheme.borderRadius.sm}; transition: background-color ${this.currentTheme.animations.fast};">
        <input type="radio" name="age-group" value="${group.id}" ${group.id === this.currentAgeGroup.id ? 'checked' : ''}>
        <span style="font-size: ${this.currentTheme.typography.fontSize.lg};">${group.icon}</span>
        <div>
          <div style="font-weight: ${this.currentTheme.typography.fontWeight.semibold};">${group.name}</div>
          <div style="font-size: ${this.currentTheme.typography.fontSize.xs}; color: ${this.currentTheme.colors.textSecondary};">Ages ${group.ageRange}</div>
        </div>
      </label>
    `
      )
      .join('');
  }

  private setupAgeGroupEvents(): void {
    document.querySelectorAll('input[name="age-group"]').forEach(input => {
      input.addEventListener('change', e => {
        const groupId = (e.target as HTMLInputElement).value;
        this.switchAgeGroup(groupId);
      });
    });

    document
      .getElementById('close-age-group')
      ?.addEventListener('click', () => {
        this.hideAgeGroupSelector();
      });
  }

  private createThemeSelector(): void {
    // Create theme selector UI
    const themeButton = document.createElement('button');
    themeButton.id = 'theme-selector-button';
    themeButton.innerHTML = '🎨';
    themeButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      border-radius: ${this.currentTheme.borderRadius.full};
      background: ${this.currentTheme.colors.primary};
      color: white;
      border: none;
      cursor: pointer;
      font-size: 24px;
      z-index: 1002;
      box-shadow: ${this.currentTheme.shadows.lg};
      transition: all ${this.currentTheme.animations.normal};
    `;

    themeButton.addEventListener('click', () => {
      this.showThemeSelector();
    });

    document.body.appendChild(themeButton);
  }

  private setupKeyboardNavigation(): void {
    // Add keyboard navigation support
    document.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        // Ensure tab navigation works properly
        this.handleTabNavigation(e);
      } else if (e.key === 'Escape') {
        // Close any open panels
        this.closeAllPanels();
      } else if (e.key === 'F1') {
        // Show help
        e.preventDefault();
        this.showHelp();
      } else if (e.altKey && e.key === 'a') {
        // Alt+A for accessibility panel
        e.preventDefault();
        this.toggleAccessibilityPanel();
      } else if (e.altKey && e.key === 'g') {
        // Alt+G for age group selector
        e.preventDefault();
        this.toggleAgeGroupSelector();
      }
    });
  }

  private handleTabNavigation(e: KeyboardEvent): void {
    const focusableElements = document.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[
      focusableElements.length - 1
    ] as HTMLElement;

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }

  private applyInitialSettings(): void {
    // Apply responsive classes
    document.body.classList.add(
      'ui-responsive',
      `ui-${this.currentAgeGroup.id}`
    );

    // Apply accessibility preferences
    if (this.accessibilityPreferences.reducedMotion) {
      document.body.classList.add('reduced-motion');
    }

    if (this.accessibilityPreferences.highContrast) {
      document.body.classList.add('high-contrast');
    }

    // Apply age group settings
    this.applyAgeGroupSettings();
  }

  private applyAgeGroupSettings(): void {
    const settings = this.currentAgeGroup;

    // Update CSS custom properties
    document.documentElement.style.setProperty(
      '--ui-font-size',
      this.getFontSizeForAgeGroup(settings.ui.fontSize)
    );
    document.documentElement.style.setProperty(
      '--ui-spacing',
      this.getSpacingForAgeGroup(settings.ui.spacing)
    );
    document.documentElement.style.setProperty(
      '--ui-icon-size',
      this.getIconSizeForAgeGroup(settings.ui.iconSize)
    );

    // Apply accessibility settings
    if (settings.accessibility.reducedMotion) {
      document.body.classList.add('reduced-motion');
    }

    if (settings.accessibility.highContrast) {
      document.body.classList.add('high-contrast');
    }
  }

  private getFontSizeForAgeGroup(size: string): string {
    const sizes = {
      small: this.currentTheme.typography.fontSize.sm,
      medium: this.currentTheme.typography.fontSize.md,
      large: this.currentTheme.typography.fontSize.lg,
      xl: this.currentTheme.typography.fontSize.xl,
    };
    return sizes[size as keyof typeof sizes] || sizes.medium;
  }

  private getSpacingForAgeGroup(spacing: string): string {
    const spacings = {
      compact: this.currentTheme.spacing.sm,
      comfortable: this.currentTheme.spacing.md,
      spacious: this.currentTheme.spacing.lg,
    };
    return spacings[spacing as keyof typeof spacings] || spacings.comfortable;
  }

  private getIconSizeForAgeGroup(size: string): string {
    const sizes = {
      small: '16px',
      medium: '24px',
      large: '32px',
    };
    return sizes[size as keyof typeof sizes] || sizes.medium;
  }

  // Public methods
  public switchAgeGroup(groupId: string): void {
    const ageGroups = [
      {
        id: 'kids',
        name: 'Kids Mode',
        ageRange: '8-12',
        description: 'Large icons, simple interface, lots of guidance',
      },
      {
        id: 'teen',
        name: 'Teen Mode',
        ageRange: '13-17',
        description: 'Modern interface with competitive elements',
      },
      {
        id: 'adult',
        name: 'Adult Mode',
        ageRange: '18-35',
        description: 'Efficient interface for experienced users',
      },
      {
        id: 'professional',
        name: 'Professional Mode',
        ageRange: '25-60+',
        description: 'Advanced interface with detailed technical information',
      },
      {
        id: 'senior',
        name: 'Senior Mode',
        ageRange: '55+',
        description: 'Large text, high contrast, clear navigation',
      },
    ];

    const group = ageGroups.find(g => g.id === groupId);
    if (group) {
      // Remove old age group class
      document.body.classList.remove(`ui-${this.currentAgeGroup.id}`);

      // Update current age group
      this.currentAgeGroup = {
        id: group.id,
        name: group.name,
        ageRange: group.ageRange,
        description: group.description,
        ui: {
          fontSize:
            group.id === 'kids'
              ? 'large'
              : group.id === 'senior'
                ? 'xl'
                : group.id === 'professional'
                  ? 'small'
                  : 'medium',
          complexity:
            group.id === 'kids' || group.id === 'senior'
              ? 'simplified'
              : group.id === 'professional'
                ? 'advanced'
                : 'standard',
          animations:
            group.id === 'kids'
              ? 'enhanced'
              : group.id === 'professional' || group.id === 'senior'
                ? 'minimal'
                : 'standard',
          iconSize:
            group.id === 'kids' || group.id === 'senior'
              ? 'large'
              : group.id === 'professional'
                ? 'small'
                : 'medium',
          spacing:
            group.id === 'kids' || group.id === 'senior'
              ? 'spacious'
              : group.id === 'professional'
                ? 'compact'
                : 'comfortable',
          colorContrast:
            group.id === 'kids'
              ? 'high'
              : group.id === 'senior'
                ? 'maximum'
                : 'normal',
        },
        gameplay: {
          tooltipLevel:
            group.id === 'professional'
              ? 'expert'
              : group.id === 'kids' || group.id === 'senior'
                ? 'basic'
                : 'detailed',
          errorTolerance:
            group.id === 'kids' || group.id === 'senior'
              ? 'high'
              : group.id === 'professional'
                ? 'low'
                : 'medium',
          timeoutLimits:
            group.id === 'kids' || group.id === 'senior'
              ? 'extended'
              : group.id === 'professional'
                ? 'strict'
                : 'standard',
          assistanceLevel:
            group.id === 'kids' || group.id === 'senior'
              ? 'guided'
              : group.id === 'professional'
                ? 'minimal'
                : 'hints',
        },
        accessibility: {
          screenReader: true,
          keyboardNav: true,
          highContrast: group.id === 'senior',
          reducedMotion: group.id === 'professional' || group.id === 'senior',
          audioFeedback: group.id === 'kids' || group.id === 'senior',
          hapticFeedback: group.id === 'kids',
        },
      };

      // Apply new age group class
      document.body.classList.add(`ui-${this.currentAgeGroup.id}`);

      // Apply settings
      this.applyAgeGroupSettings();

      // Update UI
      this.updateAgeGroupDisplay();
    }
  }

  public toggleAccessibilityPanel(): void {
    const panel = document.getElementById('accessibility-controls');
    if (panel) {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
  }

  public toggleAgeGroupSelector(): void {
    const panel = document.getElementById('age-group-selector');
    if (panel) {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
  }

  private showAccessibilityPanel(): void {
    const panel = document.getElementById('accessibility-controls');
    if (panel) {
      panel.style.display = 'block';
    }
  }

  private hideAccessibilityPanel(): void {
    const panel = document.getElementById('accessibility-controls');
    if (panel) {
      panel.style.display = 'none';
    }
  }

  private hideAgeGroupSelector(): void {
    const panel = document.getElementById('age-group-selector');
    if (panel) {
      panel.style.display = 'none';
    }
  }

  private showThemeSelector(): void {
    // Implementation for theme selector
    console.log('Theme selector not yet implemented');
  }

  private toggleAudioFeedback(enabled: boolean): void {
    document.body.classList.toggle('audio-feedback', enabled);
  }

  private toggleKeyboardNavigation(enabled: boolean): void {
    document.body.classList.toggle('keyboard-navigation', enabled);
  }

  private adjustFontSize(size: number): void {
    document.documentElement.style.setProperty('--ui-font-size', `${size}px`);
  }

  private resetAccessibilitySettings(): void {
    // Reset all accessibility settings to defaults
    document.body.classList.remove(
      'high-contrast',
      'reduced-motion',
      'audio-feedback',
      'keyboard-navigation'
    );
    document.documentElement.style.removeProperty('--ui-font-size');

    // Reset form controls
    (
      document.getElementById('high-contrast-toggle') as HTMLInputElement
    ).checked = false;
    (
      document.getElementById('reduced-motion-toggle') as HTMLInputElement
    ).checked = false;
    (
      document.getElementById('audio-feedback-toggle') as HTMLInputElement
    ).checked = false;
    (
      document.getElementById('keyboard-nav-toggle') as HTMLInputElement
    ).checked = false;
    (document.getElementById('font-size-slider') as HTMLInputElement).value =
      '16';
  }

  private closeAllPanels(): void {
    this.hideAccessibilityPanel();
    this.hideAgeGroupSelector();
  }

  private showHelp(): void {
    // Implementation for help system
    console.log('Help system not yet implemented');
  }

  private updateAgeGroupDisplay(): void {
    const currentElement = document.getElementById('current-age-group');
    const descriptionElement = document.getElementById(
      'current-age-description'
    );

    if (currentElement) {
      currentElement.textContent = this.currentAgeGroup.name;
    }

    if (descriptionElement) {
      descriptionElement.textContent = this.currentAgeGroup.description;
    }
  }

  public getCurrentAgeGroup(): AgeGroupSettings {
    return this.currentAgeGroup;
  }

  public getCurrentTheme(): UITheme {
    return this.currentTheme;
  }

  public cleanup(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    Object.values(this.mediaQueries).forEach(mq => {
      mq.removeEventListener('change', () => {});
    });
  }
}

interface AccessibilityPreferences {
  reducedMotion?: boolean;
  highContrast?: boolean;
  forcedColors?: boolean;
  darkMode?: boolean;
  largeText?: boolean;
}

// Create and export the global UI polish system
export const uiPolishSystem = new UIPolishSystem();
