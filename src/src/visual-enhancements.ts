// Visual Enhancements System - Icons, Animations, and Better Feedback

export interface VisualEnhancements {
  icons: IconSet;
  animations: AnimationSet;
  feedback: FeedbackSystem;
  themes: ThemeSet;
}

export interface IconSet {
  tools: {
    excavator: string;
    bulldozer: string;
    grader: string;
    compactor: string;
  };
  ui: {
    accessibility: string;
    ageGroup: string;
    settings: string;
    help: string;
    close: string;
    minimize: string;
    maximize: string;
  };
  feedback: {
    success: string;
    warning: string;
    error: string;
    info: string;
    loading: string;
  };
  terrain: {
    cut: string;
    fill: string;
    level: string;
    water: string;
    soil: string;
  };
}

export interface AnimationSet {
  hover: string;
  active: string;
  loading: string;
  success: string;
  error: string;
  slideIn: string;
  slideOut: string;
  fadeIn: string;
  fadeOut: string;
  pulse: string;
  bounce: string;
  shake: string;
}

export interface FeedbackSystem {
  notifications: NotificationSystem;
  tooltips: TooltipSystem;
  sounds: SoundSystem;
  haptics: HapticSystem;
}

export interface NotificationSystem {
  show(
    message: string,
    type: 'success' | 'warning' | 'error' | 'info',
    duration?: number
  ): void;
  hide(id: string): void;
  clear(): void;
}

export interface TooltipSystem {
  show(
    element: HTMLElement,
    content: string,
    position?: 'top' | 'bottom' | 'left' | 'right'
  ): void;
  hide(element: HTMLElement): void;
  hideAll(): void;
}

export interface SoundSystem {
  play(sound: string, volume?: number): void;
  stop(sound: string): void;
  setVolume(volume: number): void;
  mute(muted: boolean): void;
}

export interface HapticSystem {
  vibrate(pattern: number | number[]): void;
  isSupported(): boolean;
}

export interface ThemeSet {
  [key: string]: {
    name: string;
    description: string;
    colors: Record<string, string>;
    gradients: Record<string, string>;
    shadows: Record<string, string>;
  };
}

export class VisualEnhancementSystem {
  private icons: IconSet;
  private animations: AnimationSet;
  private feedback: FeedbackSystem;
  private themes: ThemeSet;
  private currentTheme: string = 'default';
  private isInitialized = false;

  constructor() {
    this.initializeIcons();
    this.initializeAnimations();
    this.initializeFeedback();
    this.initializeThemes();
  }

  private initializeIcons(): void {
    this.icons = {
      tools: {
        excavator: '🚜',
        bulldozer: '🚜',
        grader: '🛣️',
        compactor: '🛞',
      },
      ui: {
        accessibility: '♿',
        ageGroup: '👥',
        settings: '⚙️',
        help: '❓',
        close: '✕',
        minimize: '−',
        maximize: '□',
      },
      feedback: {
        success: '✅',
        warning: '⚠️',
        error: '❌',
        info: 'ℹ️',
        loading: '⏳',
      },
      terrain: {
        cut: '🔻',
        fill: '🔺',
        level: '📏',
        water: '💧',
        soil: '🟫',
      },
    };
  }

  private initializeAnimations(): void {
    this.animations = {
      hover: 'transform 0.2s ease-out, box-shadow 0.2s ease-out',
      active: 'transform 0.1s ease-in',
      loading: 'rotation 1s linear infinite',
      success: 'bounce 0.5s ease-out',
      error: 'shake 0.5s ease-out',
      slideIn: 'slideIn 0.3s ease-out',
      slideOut: 'slideOut 0.3s ease-in',
      fadeIn: 'fadeIn 0.3s ease-out',
      fadeOut: 'fadeOut 0.3s ease-in',
      pulse: 'pulse 2s ease-in-out infinite',
      bounce: 'bounce 0.6s ease-out',
      shake: 'shake 0.5s ease-in-out',
    };
  }

  private initializeFeedback(): void {
    this.feedback = {
      notifications: new NotificationManager(),
      tooltips: new TooltipManager(),
      sounds: new SoundManager(),
      haptics: new HapticManager(),
    };
  }

  private initializeThemes(): void {
    this.themes = {
      default: {
        name: 'Default Dark',
        description: 'Classic dark theme with green accents',
        colors: {
          primary: '#4CAF50',
          secondary: '#2196F3',
          accent: '#FF9800',
          background: '#121212',
          surface: '#1E1E1E',
          text: '#FFFFFF',
          textSecondary: '#B0B0B0',
        },
        gradients: {
          primary: 'linear-gradient(135deg, #4CAF50 0%, #45A049 100%)',
          secondary: 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
          accent: 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)',
        },
        shadows: {
          small: '0 2px 4px rgba(0,0,0,0.2)',
          medium: '0 4px 8px rgba(0,0,0,0.3)',
          large: '0 8px 16px rgba(0,0,0,0.4)',
        },
      },
      light: {
        name: 'Light Mode',
        description: 'Clean light theme for better visibility',
        colors: {
          primary: '#2E7D32',
          secondary: '#1565C0',
          accent: '#E65100',
          background: '#FFFFFF',
          surface: '#F5F5F5',
          text: '#212121',
          textSecondary: '#757575',
        },
        gradients: {
          primary: 'linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%)',
          secondary: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
          accent: 'linear-gradient(135deg, #E65100 0%, #BF360C 100%)',
        },
        shadows: {
          small: '0 2px 4px rgba(0,0,0,0.1)',
          medium: '0 4px 8px rgba(0,0,0,0.15)',
          large: '0 8px 16px rgba(0,0,0,0.2)',
        },
      },
      highContrast: {
        name: 'High Contrast',
        description: 'Maximum contrast for accessibility',
        colors: {
          primary: '#00FF00',
          secondary: '#00FFFF',
          accent: '#FFFF00',
          background: '#000000',
          surface: '#111111',
          text: '#FFFFFF',
          textSecondary: '#CCCCCC',
        },
        gradients: {
          primary: 'linear-gradient(135deg, #00FF00 0%, #00CC00 100%)',
          secondary: 'linear-gradient(135deg, #00FFFF 0%, #00CCCC 100%)',
          accent: 'linear-gradient(135deg, #FFFF00 0%, #CCCC00 100%)',
        },
        shadows: {
          small: '0 2px 4px rgba(255,255,255,0.2)',
          medium: '0 4px 8px rgba(255,255,255,0.3)',
          large: '0 8px 16px rgba(255,255,255,0.4)',
        },
      },
    };
  }

  public initialize(): void {
    if (this.isInitialized) return;

    this.createAnimationStyles();
    this.createEnhancedStyles();
    this.setupVisualFeedback();
    this.setupResponsiveImages();
    this.setupAccessibilityEnhancements();

    this.isInitialized = true;
  }

  private createAnimationStyles(): void {
    const style = document.createElement('style');
    style.id = 'visual-enhancements-animations';
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-10px); }
      }
      
      @keyframes slideIn {
        from { transform: translateX(-100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(-100%); opacity: 0; }
      }
      
      @keyframes bounce {
        0%, 60%, 75%, 90%, 100% {
          animation-timing-function: cubic-bezier(0.215, 0.610, 0.355, 1.000);
        }
        0% {
          opacity: 0;
          transform: translate3d(0, 3000px, 0);
        }
        60% {
          opacity: 1;
          transform: translate3d(0, -20px, 0);
        }
        75% {
          transform: translate3d(0, 10px, 0);
        }
        90% {
          transform: translate3d(0, -5px, 0);
        }
        100% {
          transform: translate3d(0, 0, 0);
        }
      }
      
      @keyframes shake {
        0%, 100% {
          transform: translateX(0);
        }
        10%, 30%, 50%, 70%, 90% {
          transform: translateX(-5px);
        }
        20%, 40%, 60%, 80% {
          transform: translateX(5px);
        }
      }
      
      @keyframes pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.05);
          opacity: 0.8;
        }
      }
      
      @keyframes rotation {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      
      @keyframes glow {
        0%, 100% {
          box-shadow: 0 0 5px rgba(76, 175, 80, 0.5);
        }
        50% {
          box-shadow: 0 0 20px rgba(76, 175, 80, 0.8);
        }
      }
      
      /* Animation classes */
      .animate-fadeIn {
        animation: fadeIn 0.3s ease-out;
      }
      
      .animate-fadeOut {
        animation: fadeOut 0.3s ease-in;
      }
      
      .animate-slideIn {
        animation: slideIn 0.3s ease-out;
      }
      
      .animate-slideOut {
        animation: slideOut 0.3s ease-in;
      }
      
      .animate-bounce {
        animation: bounce 0.6s ease-out;
      }
      
      .animate-shake {
        animation: shake 0.5s ease-in-out;
      }
      
      .animate-pulse {
        animation: pulse 2s ease-in-out infinite;
      }
      
      .animate-spin {
        animation: rotation 1s linear infinite;
      }
      
      .animate-glow {
        animation: glow 2s ease-in-out infinite;
      }
    `;

    document.head.appendChild(style);
  }

  private createEnhancedStyles(): void {
    const style = document.createElement('style');
    style.id = 'visual-enhancements-styles';
    style.textContent = `
      /* Enhanced button styles */
      .enhanced-button {
        position: relative;
        overflow: hidden;
        transition: all 0.3s ease;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      }
      
      .enhanced-button::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        background: rgba(255,255,255,0.2);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        transition: width 0.3s ease, height 0.3s ease;
      }
      
      .enhanced-button:hover::before {
        width: 300px;
        height: 300px;
      }
      
      .enhanced-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0,0,0,0.3);
      }
      
      .enhanced-button:active {
        transform: translateY(0);
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }
      
      .enhanced-button.primary {
        background: linear-gradient(135deg, #4CAF50 0%, #45A049 100%);
        color: white;
      }
      
      .enhanced-button.secondary {
        background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
        color: white;
      }
      
      .enhanced-button.accent {
        background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%);
        color: white;
      }
      
      .enhanced-button.danger {
        background: linear-gradient(135deg, #F44336 0%, #D32F2F 100%);
        color: white;
      }
      
      /* Enhanced panel styles */
      .enhanced-panel {
        background: rgba(30, 30, 30, 0.95);
        border: 1px solid rgba(76, 175, 80, 0.3);
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        backdrop-filter: blur(10px);
        position: relative;
        overflow: hidden;
      }
      
      .enhanced-panel::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(90deg, #4CAF50, #2196F3, #FF9800);
      }
      
      .enhanced-panel.glass {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(15px);
      }
      
      /* Enhanced progress bars */
      .enhanced-progress {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        height: 12px;
        overflow: hidden;
        position: relative;
      }
      
      .enhanced-progress::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
        animation: shimmer 2s infinite;
      }
      
      .enhanced-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #4CAF50, #45A049);
        border-radius: 10px;
        transition: width 0.3s ease;
        position: relative;
      }
      
      @keyframes shimmer {
        0% {
          left: -100%;
        }
        100% {
          left: 100%;
        }
      }
      
      /* Enhanced tooltips */
      .enhanced-tooltip {
        position: absolute;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 14px;
        pointer-events: none;
        z-index: 10000;
        opacity: 0;
        transform: scale(0.8);
        transition: all 0.2s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
      
      .enhanced-tooltip.show {
        opacity: 1;
        transform: scale(1);
      }
      
      .enhanced-tooltip::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        margin-left: -5px;
        border-width: 5px;
        border-style: solid;
        border-color: rgba(0, 0, 0, 0.9) transparent transparent transparent;
      }
      
      /* Enhanced notifications */
      .enhanced-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(30, 30, 30, 0.95);
        border: 1px solid rgba(76, 175, 80, 0.3);
        border-radius: 8px;
        padding: 16px;
        color: white;
        font-size: 14px;
        z-index: 10001;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        backdrop-filter: blur(10px);
        transform: translateX(100%);
        transition: transform 0.3s ease;
      }
      
      .enhanced-notification.show {
        transform: translateX(0);
      }
      
      .enhanced-notification.success {
        border-color: rgba(76, 175, 80, 0.5);
      }
      
      .enhanced-notification.warning {
        border-color: rgba(255, 152, 0, 0.5);
      }
      
      .enhanced-notification.error {
        border-color: rgba(244, 67, 54, 0.5);
      }
      
      .enhanced-notification.info {
        border-color: rgba(33, 150, 243, 0.5);
      }
      
      /* Enhanced icons */
      .enhanced-icon {
        display: inline-block;
        width: 1.2em;
        height: 1.2em;
        margin-right: 0.5em;
        vertical-align: middle;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
      }
      
      /* Loading states */
      .loading {
        position: relative;
        color: transparent;
      }
      
      .loading::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 16px;
        height: 16px;
        margin: -8px 0 0 -8px;
        border: 2px solid #4CAF50;
        border-radius: 50%;
        border-top-color: transparent;
        animation: rotation 1s linear infinite;
      }
      
      /* Focus states for accessibility */
      .enhanced-focus:focus {
        outline: 2px solid #4CAF50;
        outline-offset: 2px;
      }
      
      /* High contrast mode overrides */
      @media (prefers-contrast: high) {
        .enhanced-button {
          border: 2px solid currentColor;
        }
        
        .enhanced-panel {
          border: 2px solid currentColor;
        }
        
        .enhanced-notification {
          border: 2px solid currentColor;
        }
      }
      
      /* Reduced motion overrides */
      @media (prefers-reduced-motion: reduce) {
        .enhanced-button,
        .enhanced-panel,
        .enhanced-notification,
        .enhanced-tooltip {
          transition: none;
        }
        
        .enhanced-button::before {
          transition: none;
        }
        
        .animate-fadeIn,
        .animate-fadeOut,
        .animate-slideIn,
        .animate-slideOut,
        .animate-bounce,
        .animate-shake,
        .animate-pulse,
        .animate-spin,
        .animate-glow {
          animation: none;
        }
      }
    `;

    document.head.appendChild(style);
  }

  private setupVisualFeedback(): void {
    // Add hover effects to all buttons
    document.addEventListener('mouseover', e => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'BUTTON' &&
        !target.classList.contains('enhanced-button')
      ) {
        target.classList.add('enhanced-button', 'primary');
      }
    });

    // Add click ripple effect
    document.addEventListener('click', e => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON') {
        this.createRippleEffect(target, e);
      }
    });
  }

  private createRippleEffect(element: HTMLElement, event: MouseEvent): void {
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    const ripple = document.createElement('div');
    ripple.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      pointer-events: none;
      transform: scale(0);
      animation: ripple 0.6s ease-out;
    `;

    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    element.appendChild(ripple);

    setTimeout(() => {
      ripple.remove();
    }, 600);
  }

  private setupResponsiveImages(): void {
    // Add responsive image loading
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      img.loading = 'lazy';
      img.addEventListener('load', () => {
        img.classList.add('animate-fadeIn');
      });
    });
  }

  private setupAccessibilityEnhancements(): void {
    // Add ARIA labels to buttons without text
    document.querySelectorAll('button').forEach(button => {
      if (!button.textContent?.trim() && !button.getAttribute('aria-label')) {
        const icon = button.innerHTML.match(/[🎨♿👥⚙️❓]/)?.[0];
        if (icon) {
          const labels = {
            '🎨': 'Theme selector',
            '♿': 'Accessibility options',
            '👥': 'Age group selector',
            '⚙️': 'Settings',
            '❓': 'Help',
          };
          button.setAttribute(
            'aria-label',
            labels[icon as keyof typeof labels] || 'Button'
          );
        }
      }
    });

    // Add keyboard navigation indicators
    document.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        document.body.classList.add('keyboard-navigation');
      }
    });

    document.addEventListener('mousedown', () => {
      document.body.classList.remove('keyboard-navigation');
    });
  }

  public applyTheme(themeName: string): void {
    const theme = this.themes[themeName];
    if (!theme) return;

    this.currentTheme = themeName;

    // Apply theme colors as CSS custom properties
    Object.entries(theme.colors).forEach(([key, value]) => {
      document.documentElement.style.setProperty(`--color-${key}`, value);
    });

    Object.entries(theme.gradients).forEach(([key, value]) => {
      document.documentElement.style.setProperty(`--gradient-${key}`, value);
    });

    Object.entries(theme.shadows).forEach(([key, value]) => {
      document.documentElement.style.setProperty(`--shadow-${key}`, value);
    });

    // Apply theme class
    document.body.className = document.body.className.replace(/theme-\w+/g, '');
    document.body.classList.add(`theme-${themeName}`);
  }

  public getIcon(category: keyof IconSet, name: string): string {
    return this.icons[category]?.[name as keyof any] || '❓';
  }

  public showNotification(
    message: string,
    type: 'success' | 'warning' | 'error' | 'info' = 'info',
    duration: number = 5000
  ): void {
    this.feedback.notifications.show(message, type, duration);
  }

  public showTooltip(
    element: HTMLElement,
    content: string,
    position: 'top' | 'bottom' | 'left' | 'right' = 'top'
  ): void {
    this.feedback.tooltips.show(element, content, position);
  }

  public playSound(sound: string, volume: number = 0.5): void {
    this.feedback.sounds.play(sound, volume);
  }

  public vibrate(pattern: number | number[] = 100): void {
    this.feedback.haptics.vibrate(pattern);
  }

  public getAvailableThemes(): string[] {
    return Object.keys(this.themes);
  }

  public getCurrentTheme(): string {
    return this.currentTheme;
  }

  public cleanup(): void {
    // Remove event listeners and clean up
    document.removeEventListener('mouseover', () => {});
    document.removeEventListener('click', () => {});
    document.removeEventListener('keydown', () => {});
    document.removeEventListener('mousedown', () => {});
  }
}

// Supporting classes
class NotificationManager implements NotificationSystem {
  private notifications: Map<string, HTMLElement> = new Map();
  private notificationCount = 0;

  show(
    message: string,
    type: 'success' | 'warning' | 'error' | 'info',
    duration: number = 5000
  ): void {
    const id = `notification-${++this.notificationCount}`;
    const notification = document.createElement('div');
    notification.className = `enhanced-notification ${type}`;
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="enhanced-icon">${this.getTypeIcon(type)}</span>
        <span>${message}</span>
        <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: inherit; cursor: pointer; margin-left: auto;">×</button>
      </div>
    `;

    document.body.appendChild(notification);
    this.notifications.set(id, notification);

    // Show notification
    setTimeout(() => {
      notification.classList.add('show');
    }, 100);

    // Auto-hide after duration
    setTimeout(() => {
      this.hide(id);
    }, duration);
  }

  hide(id: string): void {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.classList.remove('show');
      setTimeout(() => {
        if (notification.parentElement) {
          notification.parentElement.removeChild(notification);
        }
        this.notifications.delete(id);
      }, 300);
    }
  }

  clear(): void {
    this.notifications.forEach((notification, id) => {
      this.hide(id);
    });
  }

  private getTypeIcon(type: string): string {
    const icons = {
      success: '✅',
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️',
    };
    return icons[type as keyof typeof icons] || 'ℹ️';
  }
}

class TooltipManager implements TooltipSystem {
  private tooltips: Map<HTMLElement, HTMLElement> = new Map();

  show(
    element: HTMLElement,
    content: string,
    position: 'top' | 'bottom' | 'left' | 'right' = 'top'
  ): void {
    this.hide(element); // Remove existing tooltip

    const tooltip = document.createElement('div');
    tooltip.className = 'enhanced-tooltip';
    tooltip.textContent = content;

    document.body.appendChild(tooltip);
    this.tooltips.set(element, tooltip);

    // Position tooltip
    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let top = 0,
      left = 0;

    switch (position) {
      case 'top':
        top = rect.top - tooltipRect.height - 10;
        left = rect.left + (rect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top = rect.bottom + 10;
        left = rect.left + (rect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = rect.top + (rect.height - tooltipRect.height) / 2;
        left = rect.left - tooltipRect.width - 10;
        break;
      case 'right':
        top = rect.top + (rect.height - tooltipRect.height) / 2;
        left = rect.right + 10;
        break;
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;

    // Show tooltip
    setTimeout(() => {
      tooltip.classList.add('show');
    }, 100);
  }

  hide(element: HTMLElement): void {
    const tooltip = this.tooltips.get(element);
    if (tooltip) {
      tooltip.classList.remove('show');
      setTimeout(() => {
        if (tooltip.parentElement) {
          tooltip.parentElement.removeChild(tooltip);
        }
        this.tooltips.delete(element);
      }, 200);
    }
  }

  hideAll(): void {
    this.tooltips.forEach((tooltip, element) => {
      this.hide(element);
    });
  }
}

class SoundManager implements SoundSystem {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private volume: number = 0.5;
  private muted: boolean = false;

  play(sound: string, volume?: number): void {
    if (this.muted) return;

    // Create audio element if it doesn't exist
    if (!this.sounds.has(sound)) {
      const audio = new Audio();
      audio.src = `sounds/${sound}.mp3`;
      audio.volume = volume || this.volume;
      this.sounds.set(sound, audio);
    }

    const audio = this.sounds.get(sound);
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(e => console.warn('Sound play failed:', e));
    }
  }

  stop(sound: string): void {
    const audio = this.sounds.get(sound);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.sounds.forEach(audio => {
      audio.volume = this.volume;
    });
  }

  mute(muted: boolean): void {
    this.muted = muted;
    this.sounds.forEach(audio => {
      audio.muted = muted;
    });
  }
}

class HapticManager implements HapticSystem {
  vibrate(pattern: number | number[]): void {
    if (this.isSupported()) {
      navigator.vibrate(pattern);
    }
  }

  isSupported(): boolean {
    return 'vibrate' in navigator;
  }
}

// Create and export the global visual enhancement system
export const visualEnhancementSystem = new VisualEnhancementSystem();
