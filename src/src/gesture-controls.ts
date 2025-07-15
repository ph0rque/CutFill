import * as THREE from 'three';

export interface GestureState {
  isRotating: boolean;
  isZooming: boolean;
  gestureMode: 'none' | 'rotation' | 'zoom';
}

export interface CameraControl {
  position: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
  spherical: THREE.Spherical;
}

export class GestureControls {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private target: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private spherical: THREE.Spherical = new THREE.Spherical();
  private sphericalDelta: THREE.Spherical = new THREE.Spherical();
  
  // Touch state
  private touches: Map<number, Touch> = new Map();
  private gestureState: GestureState = {
    isRotating: false,
    isZooming: false,
    gestureMode: 'none'
  };
  
  // Rotation settings
  private rotateSpeed = 1.0;
  private minDistance = 10;
  private maxDistance = 100;
  private minPolarAngle = 0; // radians
  private maxPolarAngle = Math.PI; // radians
  
  // Zoom settings
  private zoomSpeed = 2.0;
  private lastPinchDistance = 0;
  
  // Touch position tracking for single-finger rotation
  private lastTouchX = 0;
  private lastTouchY = 0;
  
  // Callbacks
  private onGestureChangeCallback?: (state: GestureState) => void;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;
    
    // Initialize spherical coordinates from current camera position
    this.spherical.setFromVector3(this.camera.position.clone().sub(this.target));
    
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Touch events
    this.domElement.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.domElement.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    this.domElement.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
    
    // Mac trackpad gesture events (WebKit specific)
    (this.domElement as any).addEventListener('gesturestart', this.onTrackpadGestureStart.bind(this), { passive: false });
    (this.domElement as any).addEventListener('gesturechange', this.onTrackpadGestureChange.bind(this), { passive: false });
    (this.domElement as any).addEventListener('gestureend', this.onTrackpadGestureEnd.bind(this), { passive: false });
    
    // Mouse events for desktop equivalents
    this.domElement.addEventListener('wheel', this.onMouseWheel.bind(this), { passive: false });
    this.domElement.addEventListener('contextmenu', this.onContextMenu.bind(this));
    
    // Ensure the canvas can receive touch events
    const canvas = this.domElement as HTMLCanvasElement;
    canvas.style.touchAction = 'none';
    canvas.style.pointerEvents = 'auto';
  }

  private onTouchStart(event: TouchEvent): void {
    console.log('Touch start - fingers:', event.touches.length);
    event.preventDefault();
    
    // Single-finger touch for rotation
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.lastTouchX = touch.clientX;
      this.lastTouchY = touch.clientY;
      this.gestureState.isRotating = true;
      this.gestureState.gestureMode = 'rotation';
      this.notifyGestureChange();
      console.log('Single finger rotation started');
    }
  }

  private onTouchMove(event: TouchEvent): void {
    event.preventDefault();
    
    // Single-finger rotation
    if (event.touches.length === 1 && this.gestureState.isRotating) {
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.lastTouchX;
      const deltaY = touch.clientY - this.lastTouchY;
      
      // Apply rotation using the same logic as mouse rotation
      this.handleMouseRotation(deltaX, deltaY);
      
      // Update last touch position
      this.lastTouchX = touch.clientX;
      this.lastTouchY = touch.clientY;
    }
  }

  private onTouchEnd(event: TouchEvent): void {
    // Reset gesture state when all touches end
    if (event.touches.length === 0) {
      this.gestureState.isRotating = false;
      this.gestureState.isZooming = false;
      this.gestureState.gestureMode = 'none';
      this.notifyGestureChange();
    }
  }

  // Mac trackpad gesture handlers
  private onTrackpadGestureStart(event: any): void {
    event.preventDefault();
    this.gestureState.isRotating = true;
    this.gestureState.isZooming = true;
    this.gestureState.gestureMode = 'rotation';
    this.notifyGestureChange();
  }

  private onTrackpadGestureChange(event: any): void {
    event.preventDefault();

    // Handle zoom via scale
    if (event.scale && event.scale !== 1.0) {
      const scaleFactor = event.scale;
      const zoomDelta = (1.0 - scaleFactor) * this.spherical.radius * 0.5;
      this.spherical.radius = Math.max(
        this.minDistance,
        Math.min(this.maxDistance, this.spherical.radius + zoomDelta)
      );
    }

    // Handle rotation
    if (event.rotation) {
      const rotationDelta = event.rotation * 0.01; // Convert to radians and scale
      this.sphericalDelta.theta += rotationDelta;
    }

    this.updateCamera();
  }

  private onTrackpadGestureEnd(event: any): void {
    event.preventDefault();
    this.gestureState.isRotating = false;
    this.gestureState.isZooming = false;
    this.gestureState.gestureMode = 'none';
    this.notifyGestureChange();
  }

  private handleTwoFingerRotation(touch1: Touch, touch2: Touch): void {
    // Calculate center point of touches
    const centerX = (touch1.clientX + touch2.clientX) / 2;
    const centerY = (touch1.clientY + touch2.clientY) / 2;
    
    // Get previous touches for delta calculation
    const prevTouches = Array.from(this.touches.values());
    if (prevTouches.length === 2) {
      const prevCenterX = (prevTouches[0].clientX + prevTouches[1].clientX) / 2;
      const prevCenterY = (prevTouches[0].clientY + prevTouches[1].clientY) / 2;
      
      const deltaX = centerX - prevCenterX;
      const deltaY = centerY - prevCenterY;
      
      // Apply rotation
      this.sphericalDelta.theta -= 2 * Math.PI * deltaX / this.domElement.clientWidth * this.rotateSpeed;
      this.sphericalDelta.phi -= 2 * Math.PI * deltaY / this.domElement.clientHeight * this.rotateSpeed;
    }
    
    // Update stored touches
    this.touches.set(touch1.identifier, touch1);
    this.touches.set(touch2.identifier, touch2);
    
    this.updateCamera();
  }

  private handleTwoFingerZoom(touch1: Touch, touch2: Touch): void {
    const currentDistance = this.getTouchDistance(touch1, touch2);
    
    if (this.lastPinchDistance > 0) {
      const deltaDistance = currentDistance - this.lastPinchDistance;
      const zoomDelta = deltaDistance * this.zoomSpeed * 0.01;
      
      // Apply zoom by adjusting spherical radius
      this.spherical.radius = Math.max(
        this.minDistance,
        Math.min(this.maxDistance, this.spherical.radius - zoomDelta)
      );
    }
    
    this.lastPinchDistance = currentDistance;
    this.updateCamera();
  }

  private getTouchDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Mouse wheel zoom for desktop
  private onMouseWheel(event: WheelEvent): void {
    event.preventDefault();
    
    const zoomDelta = event.deltaY * 0.01 * this.zoomSpeed;
    this.spherical.radius = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.spherical.radius + zoomDelta)
    );
    
    this.updateCamera();
  }

  // Prevent context menu on right click
  private onContextMenu(event: Event): void {
    event.preventDefault();
  }

  // Mouse rotation for desktop (called from main controls)
  public handleMouseRotation(deltaX: number, deltaY: number): void {
    this.sphericalDelta.theta -= 2 * Math.PI * deltaX / this.domElement.clientWidth * this.rotateSpeed;
    this.sphericalDelta.phi -= 2 * Math.PI * deltaY / this.domElement.clientHeight * this.rotateSpeed;
    this.updateCamera();
  }

  private updateCamera(): void {
    // Apply deltas to spherical coordinates
    this.spherical.theta += this.sphericalDelta.theta;
    this.spherical.phi += this.sphericalDelta.phi;
    
    // Restrict phi to be within limits
    this.spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this.spherical.phi));
    
    // Make sure radius is within bounds
    this.spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.spherical.radius));
    
    // Convert spherical to cartesian and position camera
    const position = new THREE.Vector3();
    position.setFromSpherical(this.spherical);
    position.add(this.target);
    
    this.camera.position.copy(position);
    this.camera.lookAt(this.target);
    
    // Reset deltas
    this.sphericalDelta.set(0, 0, 0);
  }

  // Set target point for camera to orbit around
  public setTarget(target: THREE.Vector3): void {
    this.target.copy(target);
    this.updateCamera();
  }

  // Get current gesture state
  public getGestureState(): GestureState {
    return { ...this.gestureState };
  }

  // Set callback for gesture state changes
  public onGestureChange(callback: (state: GestureState) => void): void {
    this.onGestureChangeCallback = callback;
  }

  private notifyGestureChange(): void {
    if (this.onGestureChangeCallback) {
      this.onGestureChangeCallback(this.getGestureState());
    }
  }

  // Reset camera to default position
  public reset(): void {
    this.spherical.set(40, Math.PI / 4, Math.PI / 4); // distance, phi, theta
    this.target.set(0, 0, 0);
    this.updateCamera();
  }

  // Get current camera distance from target
  public getDistance(): number {
    return this.spherical.radius;
  }

  // Set zoom bounds
  public setZoomBounds(min: number, max: number): void {
    this.minDistance = min;
    this.maxDistance = max;
  }

  // Cleanup method
  public dispose(): void {
    this.domElement.removeEventListener('touchstart', this.onTouchStart.bind(this));
    this.domElement.removeEventListener('touchmove', this.onTouchMove.bind(this));
    this.domElement.removeEventListener('touchend', this.onTouchEnd.bind(this));
    (this.domElement as any).removeEventListener('gesturestart', this.onTrackpadGestureStart.bind(this));
    (this.domElement as any).removeEventListener('gesturechange', this.onTrackpadGestureChange.bind(this));
    (this.domElement as any).removeEventListener('gestureend', this.onTrackpadGestureEnd.bind(this));
    this.domElement.removeEventListener('wheel', this.onMouseWheel.bind(this));
    this.domElement.removeEventListener('contextmenu', this.onContextMenu.bind(this));
  }
} 