import * as THREE from 'three';

export interface ViewPreset {
  name: string;
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov?: number;
  icon: string;
}

interface ControlButton {
  icon: string;
  title: string;
  action: () => void;
}

interface ControlSeparator {
  type: 'separator';
}

type Control = ControlButton | ControlSeparator;

export class ViewControls {
  private container: HTMLElement;
  private camera: THREE.PerspectiveCamera;
  private _scene: THREE.Scene;
  private defaultTarget: THREE.Vector3 = new THREE.Vector3(50, 0, 50); // Center of terrain
  private animationDuration: number = 500; // ms

  // Standard view presets
  private viewPresets: ViewPreset[] = [
    {
      name: 'Top',
      position: new THREE.Vector3(50, 200, 50),
      target: new THREE.Vector3(50, 0, 50),
      fov: 30,
      icon: '📐',
    },
    {
      name: 'Front',
      position: new THREE.Vector3(50, 50, 150),
      target: new THREE.Vector3(50, 0, 50),
      icon: '⬛',
    },
    {
      name: 'Right',
      position: new THREE.Vector3(150, 50, 50),
      target: new THREE.Vector3(50, 0, 50),
      icon: '⬜',
    },
    {
      name: 'Left',
      position: new THREE.Vector3(-50, 50, 50),
      target: new THREE.Vector3(50, 0, 50),
      icon: '⬛',
    },
    {
      name: 'Back',
      position: new THREE.Vector3(50, 50, -50),
      target: new THREE.Vector3(50, 0, 50),
      icon: '⬜',
    },
    {
      name: 'Isometric',
      position: new THREE.Vector3(120, 100, 120),
      target: new THREE.Vector3(50, 0, 50),
      icon: '🔷',
    },
  ];

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.camera = camera;
    this._scene = scene;
    this.container = document.createElement('div'); // Initialize here
    this.createUI();
  }

  private createUI(): void {
    this.container.id = 'view-controls';
    this.container.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0,0,0,0.85);
      border-radius: 8px;
      padding: 8px;
      z-index: 1002;
      display: flex;
      gap: 4px;
      align-items: center;
      font-family: Arial, sans-serif;
      font-size: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;

    // View control buttons with proper typing
    const controls: Control[] = [
      {
        icon: '🔍+',
        title: 'Zoom In - Move camera closer to terrain',
        action: () => this.zoomIn(),
      },
      {
        icon: '🔍-',
        title: 'Zoom Out - Move camera further from terrain',
        action: () => this.zoomOut(),
      },
      {
        icon: '🔄',
        title: 'Reset View - Return to default 3D perspective',
        action: () => this.resetView(),
      },
      {
        icon: '📦',
        title: 'Fit All - Scale view to show entire terrain',
        action: () => this.fitToView(),
      },
      { type: 'separator' },
      ...this.viewPresets.map(preset => ({
        icon: preset.icon,
        title: `${preset.name} View - Look at terrain from ${preset.name.toLowerCase()} perspective`,
        action: () => this.setView(preset),
      })),
      { type: 'separator' },
      {
        icon: '🎥',
        title:
          'Free Camera - Enable manual mouse navigation (drag to rotate, scroll to zoom)',
        action: () => this.enableFreeCamera(),
      },
    ];

    controls.forEach(control => {
      if ('type' in control && control.type === 'separator') {
        const separator = document.createElement('div');
        separator.style.cssText = `
          width: 1px;
          height: 20px;
          background: rgba(255,255,255,0.3);
          margin: 0 4px;
        `;
        this.container.appendChild(separator);
      } else {
        const buttonControl = control as ControlButton;
        const button = document.createElement('button');
        button.innerHTML = buttonControl.icon;
        button.title = buttonControl.title;
        button.style.cssText = `
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.3);
          color: white;
          padding: 6px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s ease;
          min-width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        `;

        // Hover effects
        button.addEventListener('mouseenter', () => {
          button.style.background = 'rgba(255,255,255,0.2)';
          button.style.borderColor = 'rgba(255,255,255,0.5)';
        });

        button.addEventListener('mouseleave', () => {
          button.style.background = 'rgba(255,255,255,0.1)';
          button.style.borderColor = 'rgba(255,255,255,0.3)';
        });

        button.addEventListener('click', buttonControl.action);
        this.container.appendChild(button);
      }
    });

    document.body.appendChild(this.container);
  }

  private animateCamera(
    targetPosition: THREE.Vector3,
    targetLookAt: THREE.Vector3,
    targetFov?: number
  ): void {
    const startPosition = this.camera.position.clone();
    const startFov = this.camera.fov;
    const endFov = targetFov || 75; // Default FOV

    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / this.animationDuration, 1);

      // Smooth easing function
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      // Interpolate position
      this.camera.position.lerpVectors(
        startPosition,
        targetPosition,
        easeProgress
      );

      // Interpolate FOV
      this.camera.fov = startFov + (endFov - startFov) * easeProgress;
      this.camera.updateProjectionMatrix();

      // Look at target
      this.camera.lookAt(targetLookAt);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Show completion notification
        this.showViewNotification(`View: ${this.getViewName(targetPosition)}`);
      }
    };

    animate();
  }

  private getViewName(position: THREE.Vector3): string {
    for (const preset of this.viewPresets) {
      if (position.distanceTo(preset.position) < 10) {
        return preset.name;
      }
    }
    return 'Custom';
  }

  private showViewNotification(message: string): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 60px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(33, 150, 243, 0.9);
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      font-family: Arial, sans-serif;
      z-index: 1003;
      animation: fadeInOut 2s ease-in-out;
    `;

    notification.innerHTML = `📹 ${message}`;

    // Add animation if not present
    if (!document.querySelector('style[data-view-animations]')) {
      const style = document.createElement('style');
      style.setAttribute('data-view-animations', 'true');
      style.textContent = `
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          20% { opacity: 1; transform: translateX(-50%) translateY(0); }
          80% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 2000);
  }

  // View control methods
  private zoomIn(): void {
    const direction = this.camera.position
      .clone()
      .sub(this.defaultTarget)
      .normalize();
    const newPosition = this.camera.position
      .clone()
      .add(direction.multiplyScalar(-20));
    this.animateCamera(newPosition, this.defaultTarget);
  }

  private zoomOut(): void {
    const direction = this.camera.position
      .clone()
      .sub(this.defaultTarget)
      .normalize();
    const newPosition = this.camera.position
      .clone()
      .add(direction.multiplyScalar(20));
    this.animateCamera(newPosition, this.defaultTarget);
  }

  private resetView(): void {
    const resetPosition = new THREE.Vector3(80, 60, 80);
    this.animateCamera(resetPosition, this.defaultTarget, 75);
  }

  private fitToView(): void {
    // Calculate bounding box of terrain (100x100)
    const terrainSize = 100;
    const distance = terrainSize * 1.5; // Distance to fit entire terrain
    const position = new THREE.Vector3(50, distance * 0.8, 50 + distance * 0.6);
    this.animateCamera(position, this.defaultTarget, 60);
  }

  private setView(preset: ViewPreset): void {
    this.animateCamera(preset.position, preset.target, preset.fov);
  }

  private enableFreeCamera(): void {
    this.showViewNotification('Free Camera Mode - Use mouse to navigate');
  }

  // Public methods
  public show(): void {
    this.container.style.display = 'flex';
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  public destroy(): void {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  // Get current view state for integration with other systems
  public getCurrentView(): {
    position: THREE.Vector3;
    target: THREE.Vector3;
    fov: number;
  } {
    return {
      position: this.camera.position.clone(),
      target: this.defaultTarget.clone(),
      fov: this.camera.fov,
    };
  }
}
