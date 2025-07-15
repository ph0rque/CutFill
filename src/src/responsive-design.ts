// Responsive Design System - Adaptive layouts for all screen sizes and devices

export interface ResponsiveDesignSystem {
  breakpoints: BreakpointManager;
  layout: LayoutManager;
  touch: TouchManager;
  performance: PerformanceManager;
}

export interface BreakpointManager {
  getCurrentBreakpoint(): string;
  onBreakpointChange(callback: (breakpoint: string) => void): void;
  isBreakpoint(breakpoint: string): boolean;
}

export interface LayoutManager {
  adaptLayout(breakpoint: string): void;
  optimizeForDevice(device: 'mobile' | 'tablet' | 'desktop'): void;
  adjustForOrientation(orientation: 'portrait' | 'landscape'): void;
}

export interface TouchManager {
  enableTouch(): void;
  disableTouch(): void;
  isTouchDevice(): boolean;
  setupTouchGestures(): void;
}

export interface PerformanceManager {
  optimizeForDevice(): void;
  reduceQuality(): void;
  increaseQuality(): void;
  getPerformanceMetrics(): PerformanceMetrics;
}

export interface PerformanceMetrics {
  fps: number;
  memory: number;
  renderTime: number;
  deviceType: 'low' | 'medium' | 'high';
}

export class ResponsiveDesignManager implements ResponsiveDesignSystem {
  public breakpoints: BreakpointManager;
  public layout: LayoutManager;
  public touch: TouchManager;
  public performance: PerformanceManager;
  
  private currentBreakpoint: string = 'desktop';
  private isInitialized = false;
  private resizeObserver: ResizeObserver | null = null;
  private orientationChangeHandler: (() => void) | null = null;

  constructor() {
    this.breakpoints = new BreakpointManagerImpl();
    this.layout = new LayoutManagerImpl();
    this.touch = new TouchManagerImpl();
    this.performance = new PerformanceManagerImpl();
  }

  public initialize(): void {
    if (this.isInitialized) return;

    this.setupBreakpoints();
    this.setupLayoutAdaptation();
    this.setupTouchSupport();
    this.setupPerformanceOptimization();
    this.setupOrientationHandling();
    this.setupResponsiveImages();
    this.setupViewportOptimization();
    
    this.isInitialized = true;
  }

  private setupBreakpoints(): void {
    // Define breakpoints
    const breakpoints = {
      mobile: '(max-width: 768px)',
      tablet: '(min-width: 769px) and (max-width: 1024px)',
      desktop: '(min-width: 1025px) and (max-width: 1440px)',
      wide: '(min-width: 1441px)'
    };

    // Create media query listeners
    Object.entries(breakpoints).forEach(([name, query]) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', (e) => {
        if (e.matches) {
          this.currentBreakpoint = name;
          this.layout.adaptLayout(name);
          this.onBreakpointChange(name);
        }
      });

      // Check initial state
      if (mq.matches) {
        this.currentBreakpoint = name;
      }
    });
  }

  private setupLayoutAdaptation(): void {
    // Create responsive CSS
    const style = document.createElement('style');
    style.id = 'responsive-design-styles';
    style.textContent = `
      /* Mobile styles */
      @media (max-width: 768px) {
        body {
          font-size: 14px;
        }
        
        .main-panel {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          max-height: none !important;
          margin: 0 !important;
          border-radius: 0 !important;
          overflow-y: auto !important;
        }
        
        .main-panel > h2 {
          position: sticky;
          top: 0;
          background: rgba(0,0,0,0.9);
          padding: 10px;
          margin: 0 0 10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .panel-section {
          margin-bottom: 20px;
          padding: 15px;
        }
        
        .tool-grid {
          grid-template-columns: 1fr 1fr !important;
          gap: 10px !important;
        }
        
        .tool-btn {
          padding: 15px 10px !important;
          font-size: 14px !important;
          min-height: 60px !important;
        }
        
        .control-buttons {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 5px !important;
        }
        
        .control-buttons button {
          flex: 1 !important;
          min-width: 80px !important;
          padding: 12px 8px !important;
          font-size: 12px !important;
        }
        
        .progress-bar {
          height: 12px !important;
        }
        
        .slider-container {
          margin: 10px 0 !important;
        }
        
        .slider-container input[type="range"] {
          width: 100% !important;
          height: 8px !important;
        }
        
        .stats-grid {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 10px !important;
        }
        
        .notification {
          position: fixed !important;
          top: 10px !important;
          left: 10px !important;
          right: 10px !important;
          max-width: none !important;
        }
      }
      
      /* Tablet styles */
      @media (min-width: 769px) and (max-width: 1024px) {
        .main-panel {
          width: 400px !important;
          max-height: 85vh !important;
        }
        
        .tool-grid {
          grid-template-columns: 1fr 1fr !important;
        }
        
        .tool-btn {
          padding: 12px 8px !important;
          font-size: 13px !important;
        }
        
        .control-buttons {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 5px !important;
        }
        
        .control-buttons button {
          flex: 1 !important;
          min-width: 70px !important;
          padding: 10px 6px !important;
          font-size: 11px !important;
        }
      }
      
      /* Desktop styles */
      @media (min-width: 1025px) and (max-width: 1440px) {
        .main-panel {
          width: 350px !important;
          max-height: 90vh !important;
        }
        
        .tool-grid {
          grid-template-columns: 1fr 1fr !important;
        }
        
        .tool-btn {
          padding: 10px 8px !important;
          font-size: 12px !important;
        }
      }
      
      /* Wide screen styles */
      @media (min-width: 1441px) {
        .main-panel {
          width: 380px !important;
          max-height: 90vh !important;
        }
        
        .tool-grid {
          grid-template-columns: 1fr 1fr !important;
        }
        
        .panel-section {
          margin-bottom: 20px;
        }
      }
      
      /* Landscape orientation adjustments */
      @media (orientation: landscape) and (max-height: 500px) {
        .main-panel {
          max-height: 95vh !important;
          overflow-y: auto !important;
        }
        
        .panel-section {
          margin-bottom: 15px !important;
        }
        
        .tool-btn {
          padding: 8px 6px !important;
          font-size: 11px !important;
        }
      }
      
      /* High DPI displays */
      @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
        .tool-btn,
        .control-buttons button {
          border-width: 0.5px !important;
        }
        
        .progress-bar {
          height: 10px !important;
        }
      }
      
      /* Touch device optimizations */
      .touch-device .tool-btn {
        min-height: 44px !important;
        min-width: 44px !important;
      }
      
      .touch-device .control-buttons button {
        min-height: 44px !important;
        min-width: 44px !important;
      }
      
      .touch-device input[type="range"] {
        height: 12px !important;
      }
      
      .touch-device .slider-container {
        padding: 10px 0 !important;
      }
      
      /* Hover effects (disabled on touch devices) */
      @media (hover: hover) and (pointer: fine) {
        .tool-btn:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
        }
        
        .control-buttons button:hover {
          transform: translateY(-1px) !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
        }
      }
    `;
    
    document.head.appendChild(style);
  }

  private setupTouchSupport(): void {
    // Detect touch capabilities
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (isTouch) {
      document.body.classList.add('touch-device');
      this.touch.enableTouch();
    } else {
      document.body.classList.add('no-touch');
    }
  }

  private setupPerformanceOptimization(): void {
    // Monitor performance and adjust quality
    let frameCount = 0;
    let lastTime = performance.now();
    let fps = 60;
    
    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = currentTime;
        
        // Adjust quality based on FPS
        if (fps < 30) {
          this.performance.reduceQuality();
        } else if (fps > 55) {
          this.performance.increaseQuality();
        }
      }
      
      requestAnimationFrame(measureFPS);
    };
    
    requestAnimationFrame(measureFPS);
  }

  private setupOrientationHandling(): void {
    this.orientationChangeHandler = () => {
      const orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
      this.layout.adjustForOrientation(orientation);
      
      // Force resize event after orientation change
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
    };
    
    window.addEventListener('orientationchange', this.orientationChangeHandler);
    window.addEventListener('resize', this.orientationChangeHandler);
  }

  private setupResponsiveImages(): void {
    // Add responsive image loading
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      img.loading = 'lazy';
      
      // Add srcset for different screen densities
      if (!img.srcset) {
        const src = img.src;
        if (src) {
          const extension = src.split('.').pop();
          const baseName = src.replace(`.${extension}`, '');
          img.srcset = `${baseName}.${extension} 1x, ${baseName}@2x.${extension} 2x`;
        }
      }
    });
  }

  private setupViewportOptimization(): void {
    // Ensure proper viewport meta tag
    let viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
    if (!viewportMeta) {
      viewportMeta = document.createElement('meta');
      viewportMeta.name = 'viewport';
      document.head.appendChild(viewportMeta);
    }
    
    viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
    
    // Add safe area insets for devices with notches
    const safeAreaStyle = document.createElement('style');
    safeAreaStyle.textContent = `
      @supports (padding: max(0px)) {
        .main-panel {
          padding-top: max(10px, env(safe-area-inset-top)) !important;
          padding-bottom: max(10px, env(safe-area-inset-bottom)) !important;
          padding-left: max(10px, env(safe-area-inset-left)) !important;
          padding-right: max(10px, env(safe-area-inset-right)) !important;
        }
      }
    `;
    document.head.appendChild(safeAreaStyle);
  }

  private onBreakpointChange(breakpoint: string): void {
    // Update panel classes
    const panels = document.querySelectorAll('.main-panel, .panel, .enhanced-panel');
    panels.forEach(panel => {
      panel.classList.remove('mobile', 'tablet', 'desktop', 'wide');
      panel.classList.add(breakpoint);
    });
    
    // Update tool grids
    const toolGrids = document.querySelectorAll('.tool-grid');
    toolGrids.forEach(grid => {
      (grid as HTMLElement).classList.remove('mobile-grid', 'tablet-grid', 'desktop-grid', 'wide-grid');
      (grid as HTMLElement).classList.add(`${breakpoint}-grid`);
    });
    
    // Trigger custom event
    window.dispatchEvent(new CustomEvent('breakpointChange', { detail: breakpoint }));
  }

  public getCurrentBreakpoint(): string {
    return this.currentBreakpoint;
  }

  public cleanup(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    
    if (this.orientationChangeHandler) {
      window.removeEventListener('orientationchange', this.orientationChangeHandler);
      window.removeEventListener('resize', this.orientationChangeHandler);
    }
  }
}

// Implementation classes
class BreakpointManagerImpl implements BreakpointManager {
  private currentBreakpoint: string = 'desktop';
  private callbacks: ((breakpoint: string) => void)[] = [];

  getCurrentBreakpoint(): string {
    return this.currentBreakpoint;
  }

  onBreakpointChange(callback: (breakpoint: string) => void): void {
    this.callbacks.push(callback);
  }

  isBreakpoint(breakpoint: string): boolean {
    return this.currentBreakpoint === breakpoint;
  }

  setBreakpoint(breakpoint: string): void {
    if (this.currentBreakpoint !== breakpoint) {
      this.currentBreakpoint = breakpoint;
      this.callbacks.forEach(callback => callback(breakpoint));
    }
  }
}

class LayoutManagerImpl implements LayoutManager {
  adaptLayout(breakpoint: string): void {
    const mainPanel = document.querySelector('#app') as HTMLElement;
    if (!mainPanel) return;

    // Add breakpoint-specific classes
    mainPanel.classList.remove('mobile', 'tablet', 'desktop', 'wide');
    mainPanel.classList.add(breakpoint);

    // Apply specific adaptations
    switch (breakpoint) {
      case 'mobile':
        this.adaptForMobile(mainPanel);
        break;
      case 'tablet':
        this.adaptForTablet(mainPanel);
        break;
      case 'desktop':
        this.adaptForDesktop(mainPanel);
        break;
      case 'wide':
        this.adaptForWide(mainPanel);
        break;
    }
  }

  private adaptForMobile(panel: HTMLElement): void {
    // Mobile-specific adaptations
    const toolButtons = panel.querySelectorAll('.tool-btn');
    toolButtons.forEach(button => {
      (button as HTMLElement).style.minHeight = '60px';
      (button as HTMLElement).style.fontSize = '14px';
    });
    
    // Make panels full-screen on mobile
    panel.style.position = 'fixed';
    panel.style.top = '0';
    panel.style.left = '0';
    panel.style.right = '0';
    panel.style.bottom = '0';
    panel.style.width = '100%';
    panel.style.height = '100%';
    panel.style.maxWidth = 'none';
    panel.style.maxHeight = 'none';
    panel.style.margin = '0';
    panel.style.borderRadius = '0';
  }

  private adaptForTablet(panel: HTMLElement): void {
    // Tablet-specific adaptations
    panel.style.position = 'fixed';
    panel.style.width = '400px';
    panel.style.height = 'auto';
    panel.style.maxHeight = '85vh';
    panel.style.top = '10px';
    panel.style.left = '10px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.margin = '0';
    panel.style.borderRadius = '8px';
  }

  private adaptForDesktop(panel: HTMLElement): void {
    // Desktop-specific adaptations
    panel.style.position = 'fixed';
    panel.style.width = '350px';
    panel.style.height = 'auto';
    panel.style.maxHeight = '90vh';
    panel.style.top = '10px';
    panel.style.left = '10px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.margin = '0';
    panel.style.borderRadius = '8px';
  }

  private adaptForWide(panel: HTMLElement): void {
    // Wide screen adaptations
    panel.style.position = 'fixed';
    panel.style.width = '380px';
    panel.style.height = 'auto';
    panel.style.maxHeight = '90vh';
    panel.style.top = '10px';
    panel.style.left = '10px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.margin = '0';
    panel.style.borderRadius = '8px';
  }

  optimizeForDevice(device: 'mobile' | 'tablet' | 'desktop'): void {
    document.body.classList.remove('mobile-device', 'tablet-device', 'desktop-device');
    document.body.classList.add(`${device}-device`);
  }

  adjustForOrientation(orientation: 'portrait' | 'landscape'): void {
    document.body.classList.remove('portrait', 'landscape');
    document.body.classList.add(orientation);
    
    if (orientation === 'landscape' && window.innerHeight < 500) {
      // Optimize for landscape mode on small screens
      const panels = document.querySelectorAll('.main-panel');
      panels.forEach(panel => {
        (panel as HTMLElement).style.maxHeight = '95vh';
        (panel as HTMLElement).style.overflowY = 'auto';
      });
    }
  }
}

class TouchManagerImpl implements TouchManager {
  private touchEnabled = false;

  enableTouch(): void {
    this.touchEnabled = true;
    document.body.classList.add('touch-enabled');
    this.setupTouchGestures();
  }

  disableTouch(): void {
    this.touchEnabled = false;
    document.body.classList.remove('touch-enabled');
  }

  isTouchDevice(): boolean {
    return this.touchEnabled;
  }

  setupTouchGestures(): void {
    // Touch handlers disabled to prevent conflicts with canvas gesture controls
    // Only UI-specific touch interactions are handled by individual components
    // document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    // document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    // document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
  }

  private handleTouchStart(event: TouchEvent): void {
    // Handle touch start events only for UI elements
    const touch = event.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Only handle touches on UI elements, not the game canvas
    if (element && (element.classList.contains('tool-btn') || element.closest('.main-panel'))) {
      if (element.classList.contains('tool-btn')) {
      element.classList.add('touch-active');
      }
    }
  }

  private handleTouchMove(event: TouchEvent): void {
    // Only prevent default for UI interactions, not canvas interactions
    const touch = event.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Only prevent scrolling if touching UI elements
    if (element && element.closest('.main-panel')) {
      event.preventDefault();
    }
  }

  private handleTouchEnd(event: TouchEvent): void {
    // Handle touch end events
    const touchActives = document.querySelectorAll('.touch-active');
    touchActives.forEach(element => {
      element.classList.remove('touch-active');
    });
  }
}

class PerformanceManagerImpl implements PerformanceManager {
  private currentQuality: 'low' | 'medium' | 'high' = 'medium';
  private metrics: PerformanceMetrics = {
    fps: 60,
    memory: 0,
    renderTime: 0,
    deviceType: 'medium'
  };

  optimizeForDevice(): void {
    // Detect device capabilities
    const deviceMemory = (navigator as any).deviceMemory || 4;
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    
    if (deviceMemory <= 2 || hardwareConcurrency <= 2) {
      this.currentQuality = 'low';
      this.metrics.deviceType = 'low';
    } else if (deviceMemory >= 8 && hardwareConcurrency >= 8) {
      this.currentQuality = 'high';
      this.metrics.deviceType = 'high';
    } else {
      this.currentQuality = 'medium';
      this.metrics.deviceType = 'medium';
    }
    
    this.applyQualitySettings();
  }

  reduceQuality(): void {
    if (this.currentQuality === 'high') {
      this.currentQuality = 'medium';
    } else if (this.currentQuality === 'medium') {
      this.currentQuality = 'low';
    }
    this.applyQualitySettings();
  }

  increaseQuality(): void {
    if (this.currentQuality === 'low') {
      this.currentQuality = 'medium';
    } else if (this.currentQuality === 'medium') {
      this.currentQuality = 'high';
    }
    this.applyQualitySettings();
  }

  private applyQualitySettings(): void {
    document.body.classList.remove('quality-low', 'quality-medium', 'quality-high');
    document.body.classList.add(`quality-${this.currentQuality}`);
    
    // Apply quality-specific styles
    const style = document.createElement('style');
    style.id = 'performance-quality-styles';
    
    switch (this.currentQuality) {
      case 'low':
        style.textContent = `
          .enhanced-button { transition: none !important; }
          .enhanced-panel { backdrop-filter: none !important; }
          .animate-fadeIn, .animate-slideIn { animation: none !important; }
          .enhanced-tooltip { transition: none !important; }
        `;
        break;
      case 'medium':
        style.textContent = `
          .enhanced-button { transition: all 0.2s ease !important; }
          .enhanced-panel { backdrop-filter: blur(5px) !important; }
        `;
        break;
      case 'high':
        style.textContent = `
          .enhanced-button { transition: all 0.3s ease !important; }
          .enhanced-panel { backdrop-filter: blur(15px) !important; }
          .animate-glow { animation: glow 2s ease-in-out infinite !important; }
        `;
        break;
    }
    
    // Remove old style if exists
    const oldStyle = document.getElementById('performance-quality-styles');
    if (oldStyle) {
      oldStyle.remove();
    }
    
    document.head.appendChild(style);
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }
}

// Create and export the global responsive design system
export const responsiveDesignSystem = new ResponsiveDesignManager(); 