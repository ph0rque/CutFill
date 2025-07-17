import * as THREE from 'three';
import { Terrain } from './terrain';

// Data structures for the new precision system
export interface PrecisionPoint {
  x: number;
  z: number;
}

export interface PolygonArea {
  type: 'polygon';
  vertices: PrecisionPoint[];
  closed: boolean;
}

export interface PolylineArea {
  type: 'polyline';
  points: PrecisionPoint[];
  thickness: number; // Width of the line in feet
}

export type DrawingArea = PolygonArea | PolylineArea;

export interface CrossSectionConfig {
  wallType: 'straight' | 'curved' | 'angled';
  deepestPoint: PrecisionPoint; // Position of deepest point within the area
}

export interface CutFillOperation {
  direction: 'cut' | 'fill';
  magnitude: number; // Depth (for cut) or height (for fill) in feet
  area: DrawingArea;
  crossSection: CrossSectionConfig;
  previewMesh?: THREE.Mesh;
}

// UI workflow state management
export type WorkflowStage = 'direction' | 'magnitude' | 'area-mode' | 'drawing' | 'cross-section' | 'deepest-point' | 'preview';

export interface WorkflowState {
  stage: WorkflowStage;
  direction?: 'cut' | 'fill';
  magnitude?: number;
  areaMode?: 'polygon' | 'polyline';
  area?: DrawingArea;
  crossSection?: CrossSectionConfig;
  isDrawing: boolean;
  previewOperation?: CutFillOperation;
}

export class PrecisionToolManager {
  private terrain: Terrain;
  private workflowState: WorkflowState;
  private drawingHelpers: THREE.Object3D[] = [];
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private originalCameraState: {
    position: THREE.Vector3;
    fov: number;
  } | null = null;
  
  constructor(terrain: Terrain, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.terrain = terrain;
    this.scene = scene;
    this.camera = camera;
    this.workflowState = {
      stage: 'direction',
      isDrawing: false
    };
  }

  // Workflow state management
  getWorkflowState(): WorkflowState {
    return { ...this.workflowState };
  }

  // Terrain access
  getTerrain(): Terrain {
    return this.terrain;
  }

  setDirection(direction: 'cut' | 'fill'): void {
    this.workflowState.direction = direction;
    this.workflowState.stage = 'magnitude';
    this.updateUI();
  }

  setMagnitude(magnitude: number): void {
    this.workflowState.magnitude = magnitude;
    this.workflowState.stage = 'area-mode';
    this.updateUI();
  }

  setAreaMode(mode: 'polygon' | 'polyline'): void {
    this.workflowState.areaMode = mode;
    this.workflowState.stage = 'drawing';
    this.workflowState.area = mode === 'polygon' 
      ? { type: 'polygon', vertices: [], closed: false }
      : { type: 'polyline', points: [], thickness: 5 }; // Default 5ft thickness
    this.workflowState.isDrawing = true;
    
    // Automatically switch to top-down view for drawing
    this.switchToTopDownView();
    
    this.updateUI();
  }

  /**
   * Switch camera to top-down orthographic-style view for drawing
   */
  private switchToTopDownView(): void {
    // Save current camera state if not already saved
    if (!this.originalCameraState) {
      this.originalCameraState = {
        position: this.camera.position.clone(),
        fov: this.camera.fov
      };
    }

    // Set camera to top-down view centered on terrain
    // Terrain is 100ft x 100ft from (0,0) to (100,100), so center is at (50, 0, 50)
    this.camera.position.set(50, 200, 50); // High above center of terrain for better overview
    this.camera.lookAt(50, 0, 50); // Look down at center of terrain
    
    // Reduce FOV significantly to minimize perspective distortion (more orthographic-like)
    this.camera.fov = 20; // Very narrow FOV for minimal perspective distortion
    this.camera.updateProjectionMatrix();
    
    console.log('📐 Switched to top-down view for precise area drawing');
    
    // Show user notification about camera change
    this.showCameraChangeNotification();
  }

  /**
   * Restore camera to original state
   */
  public restoreOriginalView(): void {
    if (this.originalCameraState) {
      this.camera.position.copy(this.originalCameraState.position);
      this.camera.fov = this.originalCameraState.fov;
      this.camera.updateProjectionMatrix();
      this.originalCameraState = null;
      console.log('🔄 Restored original camera view');
      
      // Show restoration notification
      this.showCameraRestoreNotification();
    }
  }

  /**
   * Show notification when camera is restored
   */
  private showCameraRestoreNotification(): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(76, 175, 80, 0.95);
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      z-index: 1001;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      animation: slideDown 0.3s ease-out;
    `;
    
    notification.innerHTML = `
      🔄 <strong>Camera View Restored</strong><br>
      <span style="font-size: 12px;">Back to normal 3D perspective</span>
    `;
    
    // Add animation styles if not already present
    if (!document.querySelector('style[data-camera-animations]')) {
      const style = document.createElement('style');
      style.setAttribute('data-camera-animations', 'true');
      style.textContent = `
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Auto-remove after 2 seconds (shorter than the top-down notification)
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 2000);
  }

  /**
   * Reset workflow and restore camera view
   */
  public resetWorkflow(): void {
    // Clear drawing state
    this.workflowState = {
      stage: 'direction',
      isDrawing: false
    };
    
    // Clear any preview operation
    this.clearPreview();
    
    // Clear drawing helpers
    this.clearDrawingHelpers();
    
    // Restore camera view
    this.restoreOriginalView();
    
    // Update UI
    this.updateUI();
    
    console.log('Workflow reset, camera restored');
  }

  // Drawing methods
  addPoint(x: number, z: number): boolean {
    if (!this.workflowState.area || !this.workflowState.isDrawing) return false;

    const point: PrecisionPoint = { x, z };

    if (this.workflowState.area.type === 'polygon') {
      const polygon = this.workflowState.area as PolygonArea;
      
      // Check if clicking on first point to close polygon
      if (polygon.vertices.length > 2) {
        const firstPoint = polygon.vertices[0];
        const distance = Math.sqrt((x - firstPoint.x) ** 2 + (z - firstPoint.z) ** 2);
        if (distance < 2) { // Within 2 feet of first point
          polygon.closed = true;
          this.workflowState.isDrawing = false;
          this.workflowState.stage = 'cross-section';
          
          // Update visualization to show the closing line
          this.updateDrawingVisualization();
          
          this.updateUI();
          return true;
        }
      }
      
      polygon.vertices.push(point);
    } else {
      const polyline = this.workflowState.area as PolylineArea;
      polyline.points.push(point);
    }

    this.updateDrawingVisualization();
    return true;
  }

  finishDrawing(): void {
    if (!this.workflowState.area) return;

    if (this.workflowState.area.type === 'polygon') {
      const polygon = this.workflowState.area as PolygonArea;
      if (polygon.vertices.length >= 3) {
        polygon.closed = true;
      }
    }

    this.workflowState.isDrawing = false;
    this.workflowState.stage = 'cross-section';
    this.updateUI();
  }

  setCrossSection(config: CrossSectionConfig): void {
    console.log('Setting cross-section configuration:', config);
    this.workflowState.crossSection = config;
    
    // For straight walls, skip deepest point selection since depth is uniform
    if (config.wallType === 'straight') {
      // Set a default deepest point (not actually used for straight cuts)
      config.deepestPoint = { x: 0, z: 0 }; // Will be ignored anyway
      this.workflowState.stage = 'preview';
      this.createPreview();
    } else {
      // For curved and angled cross-sections, we need a deepest point
      this.workflowState.stage = 'deepest-point';
    }
    
    console.log('Updated workflow state:', {
      stage: this.workflowState.stage,
      crossSection: this.workflowState.crossSection,
      skippedDeepestPoint: config.wallType === 'straight'
    });
    this.updateUI();
  }

  // Set deepest point and create preview
  setDeepestPoint(x: number, z: number): void {
    console.log('setDeepestPoint called with:', { x, z });
    console.log('Current workflow state:', {
      stage: this.workflowState.stage,
      crossSection: this.workflowState.crossSection,
      area: this.workflowState.area
    });
    
    if (!this.workflowState.crossSection) {
      console.error('No cross-section configuration found');
      return;
    }
    
    if (!this.workflowState.area) {
      console.error('No area drawn');
      return;
    }
    
    // Validate that the point is within the drawn area
    const area = this.workflowState.area;
    let isValidPoint = false;
    
    if (area.type === 'polygon') {
      const polygon = area as PolygonArea;
      if (polygon.vertices.length < 3) {
        console.error('Polygon not complete');
        return;
      }
      isValidPoint = this.isPointInPolygon({ x, z }, polygon.vertices);
      console.log('Point in polygon check:', isValidPoint);
    } else if (area.type === 'polyline') {
      const polyline = area as PolylineArea;
      if (polyline.points.length < 2) {
        console.error('Polyline not complete');
        return;
      }
      // For polylines, check if point is within the thickness buffer of any line segment
      isValidPoint = this.isPointNearPolyline({ x, z }, polyline);
      console.log('Point near polyline check:', isValidPoint);
    }
    
    if (!isValidPoint) {
      console.warn('Deepest point must be within the drawn area');
      this.showAreaValidationMessage();
      return;
    }
    
    this.workflowState.crossSection.deepestPoint = { x, z };
    this.workflowState.stage = 'preview';
    this.createPreview();
    this.updateUI();
    
    console.log('Deepest point set successfully at:', { x, z });
    
    // Add visual indicator for deepest point
    this.addDeepestPointMarker(x, z);
  }

  // Add visual marker for deepest point
  private addDeepestPointMarker(x: number, z: number): void {
    // Remove any existing deepest point markers
    this.clearDeepestPointMarkers();
    
    const terrainHeight = this.terrain.getHeightAtPosition(x, z);
    const markerHeight = 2; // 2 feet above terrain
    
    // Create a small sphere marker
    const markerGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({ 
      color: this.workflowState.direction === 'cut' ? 0xff0000 : 0x00ff00,
      transparent: true,
      opacity: 0.8
    });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.set(x, terrainHeight + markerHeight, z);
    marker.name = 'deepest-point-marker';
    
    // Add pulsing animation
    const animate = () => {
      if (marker.parent) {
        marker.scale.setScalar(1 + 0.3 * Math.sin(Date.now() * 0.005));
        requestAnimationFrame(animate);
      }
    };
    animate();
    
    this.drawingHelpers.push(marker);
    this.scene.add(marker);
    
    console.log('Added deepest point marker at:', { x, y: terrainHeight + markerHeight, z });
  }

  // Clear deepest point markers
  private clearDeepestPointMarkers(): void {
    const markersToRemove = this.drawingHelpers.filter(helper => helper.name === 'deepest-point-marker');
    markersToRemove.forEach(marker => {
      this.scene.remove(marker);
      const index = this.drawingHelpers.indexOf(marker);
      if (index > -1) {
        this.drawingHelpers.splice(index, 1);
      }
    });
  }

  setPolylineThickness(thickness: number): void {
    if (this.workflowState.area?.type === 'polyline') {
      (this.workflowState.area as PolylineArea).thickness = thickness;
      this.updateDrawingVisualization();
    }
  }

  // Create 3D preview of the operation
  private createPreview(): void {
    if (!this.canCreatePreview()) return;

    // Remove existing preview
    this.clearPreview();

    const operation: CutFillOperation = {
      direction: this.workflowState.direction!,
      magnitude: this.workflowState.magnitude!,
      area: this.workflowState.area!,
      crossSection: this.workflowState.crossSection!
    };

    // Create preview geometry based on area type and cross-section
    const previewGeometry = this.createPreviewGeometry(operation);
    const previewMaterial = new THREE.MeshBasicMaterial({
      color: operation.direction === 'cut' ? 0xff4444 : 0x2196f3,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });

    operation.previewMesh = new THREE.Mesh(previewGeometry, previewMaterial);
    this.scene.add(operation.previewMesh);
    this.workflowState.previewOperation = operation;
  }

  private createPreviewGeometry(operation: CutFillOperation): THREE.BufferGeometry {
    const { area, crossSection, magnitude, direction } = operation;
    
    if (area.type === 'polygon') {
      return this.createPolygonGeometry(area as PolygonArea, crossSection, magnitude, direction);
    } else {
      return this.createPolylineGeometry(area as PolylineArea, crossSection, magnitude, direction);
    }
  }

  private createPolygonGeometry(
    polygon: PolygonArea, 
    crossSection: CrossSectionConfig, 
    magnitude: number, 
    direction: 'cut' | 'fill'
  ): THREE.BufferGeometry {
    if (polygon.vertices.length === 0) return new THREE.BufferGeometry();
    
    // Debug logging
    console.log('Creating polygon geometry for vertices:', polygon.vertices);
    console.log('Polygon closed:', polygon.closed);
    console.log('Cross-section type:', crossSection.wallType);
    
    // For cross-section previews, create custom geometry instead of simple extrusion
    if (crossSection.wallType !== 'straight') {
      return this.createPolygonCrossSectionGeometry(polygon, crossSection, magnitude, direction);
    }
    
    // For straight walls, use the existing simple extrusion
    // Create shape in the coordinate system that will align correctly after rotation
    const shape = new THREE.Shape();
    
    // Start with first vertex - flip Z coordinate to account for rotation
    const firstVertex = polygon.vertices[0];
    shape.moveTo(firstVertex.x, -firstVertex.z);
    
    // Add all other vertices with flipped Z
    for (let i = 1; i < polygon.vertices.length; i++) {
      const vertex = polygon.vertices[i];
      shape.lineTo(vertex.x, -vertex.z);
    }
    
    // Always close the shape for a proper polygon
    shape.closePath();

    console.log('Shape created with', polygon.vertices.length, 'vertices (Z-flipped for rotation)');

    // Calculate the base elevation (highest point for cut, lowest for fill)
    const baseElevation = this.calculateBaseElevation(polygon.vertices, direction);
    console.log('Base elevation:', baseElevation, 'for direction:', direction);
    
    // Create extruded geometry with simpler settings
    const extrudeSettings = {
      depth: magnitude,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 12
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    console.log('Extruded geometry created');
    
    // Position the geometry correctly
    geometry.rotateX(-Math.PI / 2); // Rotate to align with terrain (XY plane to XZ plane)
    
    // Translate to correct elevation
    if (direction === 'cut') {
      geometry.translate(0, baseElevation - magnitude, 0);
    } else {
      geometry.translate(0, baseElevation, 0);
    }

    console.log('Polygon geometry positioned');
    return geometry;
  }

  // Create custom polygon geometry for curved and angled cross-sections
  private createPolygonCrossSectionGeometry(
    polygon: PolygonArea,
    crossSection: CrossSectionConfig,
    magnitude: number,
    direction: 'cut' | 'fill'
  ): THREE.BufferGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    
    // Find bounding box and center
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const vertex of polygon.vertices) {
      minX = Math.min(minX, vertex.x);
      maxX = Math.max(maxX, vertex.x);
      minZ = Math.min(minZ, vertex.z);
      maxZ = Math.max(maxZ, vertex.z);
    }
    
    // Sample points within polygon for surface and depth calculation
    const step = 1.0; // 1 foot resolution for preview
    let vertexIndex = 0;
    const vertexGrid: { x: number, z: number, surfaceY: number, adjustedMagnitude: number, index: number }[][] = [];
    
    // Build grid of sample points
    for (let x = minX; x <= maxX; x += step) {
      const row: typeof vertexGrid[0] = [];
      for (let z = minZ; z <= maxZ; z += step) {
        if (this.isPointInPolygon({ x, z }, polygon.vertices)) {
          const surfaceY = this.terrain.getHeightAtPosition(x, z);
          
          // Calculate adjusted magnitude based on cross-section
          let adjustedMagnitude = magnitude;
          
          if (crossSection.wallType !== 'straight') {
            const distanceToEdge = this.calculateDistanceToPolygonEdge({ x, z }, polygon.vertices);
            const maxDistanceToEdge = this.calculateMaxDistanceToEdge(polygon.vertices);
            const normalizedDistance = Math.min(1, distanceToEdge / maxDistanceToEdge);
            
            if (crossSection.wallType === 'curved') {
              // Make curve more pronounced in preview
              const curveFactor = Math.cos((1 - normalizedDistance) * Math.PI / 2);
              adjustedMagnitude = magnitude * curveFactor;
            } else if (crossSection.wallType === 'angled') {
              // Make angled slope more visible in preview
              const maxSlopeDistance = Math.abs(magnitude) * 2; // Same as actual implementation
              if (distanceToEdge < maxSlopeDistance) {
                const slopeFactor = (distanceToEdge / maxSlopeDistance);
                adjustedMagnitude = magnitude * slopeFactor;
              } else {
                // Gradual transition like in actual implementation
                const transitionFactor = Math.max(0, 1 - (distanceToEdge - maxSlopeDistance) / (maxSlopeDistance * 0.5));
                adjustedMagnitude = magnitude * transitionFactor * 0.1;
              }
            }
          }
          
          if (direction === 'fill') {
            // Bottom vertex (on surface)
            positions.push(x, surfaceY, z);
            // Top vertex (surface + adjusted magnitude)
            positions.push(x, surfaceY + adjustedMagnitude, z);
          } else {
            // Top vertex (on surface)
            positions.push(x, surfaceY, z);
            // Bottom vertex (surface - adjusted magnitude)
            positions.push(x, surfaceY - adjustedMagnitude, z);
          }
          
          row.push({ x, z, surfaceY, adjustedMagnitude, index: vertexIndex });
          vertexIndex += 2; // 2 vertices per point (top and bottom)
        } else {
          row.push(null as any);
        }
      }
      vertexGrid.push(row);
    }
    
    // Create faces between adjacent points
    for (let i = 0; i < vertexGrid.length - 1; i++) {
      for (let j = 0; j < vertexGrid[i].length - 1; j++) {
        const current = vertexGrid[i][j];
        const right = vertexGrid[i + 1][j];
        const down = vertexGrid[i][j + 1];
        const diag = vertexGrid[i + 1][j + 1];
        
        if (current && right && down && diag) {
          // Create triangular faces for the quad
          if (direction === 'fill') {
            // Bottom face (surface)
            indices.push(current.index, right.index, down.index);
            indices.push(right.index, diag.index, down.index);
            
            // Top face
            indices.push(current.index + 1, down.index + 1, right.index + 1);
            indices.push(right.index + 1, down.index + 1, diag.index + 1);
          } else {
            // Top face (surface)
            indices.push(current.index, down.index, right.index);
            indices.push(right.index, down.index, diag.index);
            
            // Bottom face
            indices.push(current.index + 1, right.index + 1, down.index + 1);
            indices.push(right.index + 1, diag.index + 1, down.index + 1);
          }
          
          // Side faces (connect top and bottom)
          indices.push(current.index, current.index + 1, right.index);
          indices.push(right.index, current.index + 1, right.index + 1);
        }
      }
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    return geometry;
  }

  private createPolylineGeometry(
    polyline: PolylineArea,
    crossSection: CrossSectionConfig,
    magnitude: number,
    direction: 'cut' | 'fill'
  ): THREE.BufferGeometry {
    if (polyline.points.length < 2) return new THREE.BufferGeometry();

    // For surface-following polylines, create custom geometry instead of using ExtrudeGeometry
    return this.createSurfaceFollowingPolylineGeometry(polyline, magnitude, direction);
  }

  private createSurfaceFollowingPolylineGeometry(
    polyline: PolylineArea,
    magnitude: number,
    direction: 'cut' | 'fill'
  ): THREE.BufferGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    const halfThickness = polyline.thickness / 2;
    
    // Get cross-section configuration
    const crossSection = this.workflowState.crossSection || { wallType: 'straight', deepestPoint: { x: 0, z: 0 } };
    
    // Create segments between each pair of points
    let vertexIndex = 0;
    
    for (let i = 0; i < polyline.points.length - 1; i++) {
      const start = polyline.points[i];
      const end = polyline.points[i + 1];
      
      // Calculate direction and perpendicular vectors
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      const normalizedX = dx / length;
      const normalizedZ = dz / length;
      
      // Perpendicular vector for thickness
      const perpX = -normalizedZ;
      const perpZ = normalizedX;
      
      // Sample points along the segment
      const steps = Math.max(10, Math.floor(length * 2));
      
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const centerX = start.x + normalizedX * t * length;
        const centerZ = start.z + normalizedZ * t * length;
        const surfaceY = this.terrain.getHeightAtPosition(centerX, centerZ);
        
        // Create vertices for left and right edges of thickness
        const leftX = centerX + perpX * halfThickness;
        const leftZ = centerZ + perpZ * halfThickness;
        const rightX = centerX - perpX * halfThickness;
        const rightZ = centerZ - perpZ * halfThickness;
        
        const leftSurfaceY = this.terrain.getHeightAtPosition(leftX, leftZ);
        const rightSurfaceY = this.terrain.getHeightAtPosition(rightX, rightZ);
        
        // Calculate adjusted magnitude for cross-section (at edges - worst case for angled)
        let leftMagnitude = magnitude;
        let rightMagnitude = magnitude;
        
        if (crossSection.wallType === 'curved') {
          // At edges, curveFactor = cos(π/2) = 0
          const curveFactor = Math.cos(Math.PI / 2);
          leftMagnitude = rightMagnitude = magnitude * curveFactor; // This will be 0 at edges
          // But we want some magnitude at edges for visibility, so use a softer curve
          const softerCurveFactor = Math.cos(0.8 * Math.PI / 2); // ~0.31 at edges
          leftMagnitude = rightMagnitude = magnitude * softerCurveFactor;
        } else if (crossSection.wallType === 'angled') {
          // For 45-degree slopes, at halfThickness distance, magnitude should be reduced
          const maxSlopeDistance = Math.abs(magnitude) * 2; // Match actual implementation
          if (halfThickness <= maxSlopeDistance) {
            const slopeFactor = (maxSlopeDistance - halfThickness) / maxSlopeDistance;
            leftMagnitude = rightMagnitude = magnitude * slopeFactor;
          } else {
            // Gradual transition like actual implementation
            const transitionFactor = Math.max(0, 1 - (halfThickness - maxSlopeDistance) / (maxSlopeDistance * 0.5));
            leftMagnitude = rightMagnitude = magnitude * transitionFactor * 0.1;
          }
        }
        
        if (direction === 'fill') {
          // Bottom vertices (on surface)
          positions.push(leftX, leftSurfaceY, leftZ);
          positions.push(rightX, rightSurfaceY, rightZ);
          // Top vertices (surface + magnitude)
          positions.push(leftX, leftSurfaceY + leftMagnitude, leftZ);
          positions.push(rightX, rightSurfaceY + rightMagnitude, rightZ);
        } else {
          // Top vertices (on surface)
          positions.push(leftX, leftSurfaceY, leftZ);
          positions.push(rightX, rightSurfaceY, rightZ);
          // Bottom vertices (surface - magnitude)
          positions.push(leftX, leftSurfaceY - leftMagnitude, leftZ);
          positions.push(rightX, rightSurfaceY - rightMagnitude, rightZ);
        }
        
        // Create faces if not the first step
        if (step > 0) {
          const prevBase = vertexIndex - 4;
          const currBase = vertexIndex;
          
          if (direction === 'fill') {
            // Bottom face (surface)
            indices.push(prevBase, currBase, prevBase + 1);
            indices.push(currBase, currBase + 1, prevBase + 1);
            
            // Top face
            indices.push(prevBase + 2, prevBase + 3, currBase + 2);
            indices.push(currBase + 2, prevBase + 3, currBase + 3);
            
            // Left side face
            indices.push(prevBase, prevBase + 2, currBase);
            indices.push(currBase, prevBase + 2, currBase + 2);
            
            // Right side face
            indices.push(prevBase + 1, currBase + 1, prevBase + 3);
            indices.push(currBase + 1, prevBase + 3, prevBase + 3);
          } else {
            // Top face (surface)
            indices.push(prevBase, prevBase + 1, currBase);
            indices.push(currBase, prevBase + 1, currBase + 1);
            
            // Bottom face
            indices.push(prevBase + 2, currBase + 2, prevBase + 3);
            indices.push(currBase + 2, currBase + 3, prevBase + 3);
            
            // Left side face
            indices.push(prevBase, currBase, prevBase + 2);
            indices.push(currBase, currBase + 2, prevBase + 2);
            
            // Right side face
            indices.push(prevBase + 1, prevBase + 3, currBase + 1);
            indices.push(currBase + 1, prevBase + 3, currBase + 3);
          }
        }
        
        vertexIndex += 4;
      }
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    
    return geometry;
  }

  private calculateBaseElevation(points: PrecisionPoint[], direction: 'cut' | 'fill'): number {
    let elevation = direction === 'cut' ? -Infinity : Infinity;
    
    for (const point of points) {
      const terrainHeight = this.terrain.getHeightAtPosition(point.x, point.z);
      if (direction === 'cut') {
        elevation = Math.max(elevation, terrainHeight); // Highest point for cuts
      } else {
        elevation = Math.min(elevation, terrainHeight); // Lowest point for fills
      }
    }
    
    return elevation;
  }

  // Execute the planned operation
  async executeOperation(): Promise<boolean> {
    if (!this.workflowState.previewOperation) return false;

    console.log('Starting operation execution...');
    const operation = this.workflowState.previewOperation;
    
    // Store initial volume data for tracking
    const initialVolumes = this.terrain.calculateVolumeDifference();
    
    try {
      // Apply the operation to the terrain
      console.log('Applying operation to terrain...');
      await this.applyOperationToTerrain(operation);
      console.log('Operation applied successfully');
      
      // Calculate volume changes for progress tracking
      const finalVolumes = this.terrain.calculateVolumeDifference();
      const volumeChange = {
        cut: finalVolumes.cut - initialVolumes.cut,
        fill: finalVolumes.fill - initialVolumes.fill,
        net: finalVolumes.net - initialVolumes.net
      };
      
      console.log('Volume changes:', {
        cut: `${(volumeChange.cut / 27).toFixed(2)} yd³`,
        fill: `${(volumeChange.fill / 27).toFixed(2)} yd³`,
        net: `${(volumeChange.net / 27).toFixed(2)} yd³`
      });
      
      // Update volume display
      this.updateVolumeDisplay();
      
      // Track progress if available
      this.trackProgress(operation, volumeChange);
      
      // Clear the workflow and return to start
      this.clearWorkflow();
      console.log('Workflow cleared, operation complete');
      
      return true;
    } catch (error) {
      console.error('Error during operation execution:', error);
      // Try to recover by clearing the workflow
      this.clearWorkflow();
      return false;
    }
  }

  // Update volume display - call global function if available
  private updateVolumeDisplay(): void {
    if (typeof (window as any).updateVolumeDisplay === 'function') {
      (window as any).updateVolumeDisplay();
    } else {
      // Fallback: directly update the volume info element
      const volumeInfo = document.getElementById('volume-info');
      if (volumeInfo) {
        const volumes = this.terrain.calculateVolumeDifference();
        const volumesYards = {
          cut: Math.max(0, volumes.cut / 27),
          fill: Math.max(0, volumes.fill / 27),
          net: volumes.net / 27
        };
        
        volumeInfo.innerHTML = `
          <strong>Volume Analysis:</strong><br>
          Cut: ${volumesYards.cut.toFixed(2)} yd³<br>
          Fill: ${volumesYards.fill.toFixed(2)} yd³<br>
          Net: ${volumesYards.net.toFixed(2)} yd³
        `;
      }
    }
  }

  // Track progress for achievements and assignments
  private trackProgress(operation: CutFillOperation, volumeChange: any): void {
    try {
      // Track volume movement for progress (convert cubic feet to cubic yards)
      const totalVolumeChange = Math.abs(volumeChange.cut) + Math.abs(volumeChange.fill);
      const volumeYards = totalVolumeChange / 27;
      
      // Access global progress tracker if available
      if (typeof (window as any).progressTracker === 'object' && (window as any).progressTracker) {
        (window as any).progressTracker.recordVolumeMove(volumeYards);
        console.log('Recorded volume movement for progress:', volumeYards.toFixed(2), 'yd³');
      }
      
      // Track tool usage
      const toolType = operation.area.type === 'polygon' ? 'precision-polygon' : 'precision-polyline';
      if (typeof (window as any).progressTracker === 'object' && (window as any).progressTracker) {
        (window as any).progressTracker.recordToolUsage(toolType);
        console.log('Recorded tool usage:', toolType);
      }
      
      // Track assignment progress if available
      if (typeof (window as any).assignmentManager === 'object' && (window as any).assignmentManager) {
        (window as any).assignmentManager.addToolUsage(operation.direction);
        console.log('Recorded assignment tool usage:', operation.direction);
      }
      
      // Show volume change notification
      this.showVolumeChangeNotification(volumeChange);
      
    } catch (error) {
      console.warn('Error tracking progress:', error);
    }
  }

  // Show notification about volume changes
  private showVolumeChangeNotification(volumeChange: any): void {
    const totalVolumeYards = (Math.abs(volumeChange.cut) + Math.abs(volumeChange.fill)) / 27;
    
    if (totalVolumeYards > 0.1) { // Only show for significant changes
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 16px;
        border-radius: 6px;
        z-index: 1001;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        animation: slideInOut 3s ease-in-out;
      `;
      
      const direction = this.workflowState.direction;
      const icon = direction === 'cut' ? '⛏️' : '🏔️';
      
      notification.innerHTML = `
        ${icon} <strong>Operation Complete!</strong><br>
        <span style="font-size: 12px;">Volume changed: ${totalVolumeYards.toFixed(2)} yd³</span>
      `;
      
      document.body.appendChild(notification);
      
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 3000);
    }
  }

  private async applyOperationToTerrain(operation: CutFillOperation): Promise<void> {
    const { area, magnitude, direction, crossSection } = operation;
    const multiplier = direction === 'cut' ? -1 : 1;
    
    console.log('Terrain operation details:', {
      direction,
      magnitude,
      multiplier,
      areaType: area.type
    });
    
    // Small delay to ensure loading spinner is visible
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (area.type === 'polygon') {
      await this.applyPolygonOperation(area as PolygonArea, magnitude * multiplier, crossSection);
    } else {
      await this.applyPolylineOperation(area as PolylineArea, magnitude * multiplier, crossSection);
    }
  }

  private async applyPolygonOperation(polygon: PolygonArea, signedMagnitude: number, crossSection: CrossSectionConfig): Promise<void> {
    console.log('Applying polygon operation:', {
      vertices: polygon.vertices.length,
      magnitude: signedMagnitude,
      wallType: crossSection.wallType,
      deepestPoint: crossSection.deepestPoint
    });
    
    if (polygon.vertices.length < 3) {
      console.warn('Not enough vertices for polygon operation');
      return;
    }
    
    // Use appropriate reference elevation based on cross-section type
    let referenceElevation: number;
    if (crossSection.wallType === 'straight') {
      // For straight walls, use base elevation (highest for cut, lowest for fill)
      referenceElevation = this.calculateBaseElevation(polygon.vertices, signedMagnitude < 0 ? 'cut' : 'fill');
      console.log('Using base elevation for straight walls:', referenceElevation);
    } else if (crossSection.deepestPoint) {
      // For curved/angled walls, use deepest point elevation
      referenceElevation = this.terrain.getHeightAtPosition(crossSection.deepestPoint.x, crossSection.deepestPoint.z);
      console.log('Using deepest point elevation as reference:', referenceElevation, 'at position:', crossSection.deepestPoint);
    } else {
      // Fallback to calculated base elevation if no deepest point specified
      referenceElevation = this.calculateBaseElevation(polygon.vertices, signedMagnitude < 0 ? 'cut' : 'fill');
      console.log('Using calculated base elevation as reference:', referenceElevation);
    }
    
    // Find bounding box and center point
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const vertex of polygon.vertices) {
      minX = Math.min(minX, vertex.x);
      maxX = Math.max(maxX, vertex.x);
      minZ = Math.min(minZ, vertex.z);
      maxZ = Math.max(maxZ, vertex.z);
    }
    
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    
    console.log('Polygon bounding box:', { minX, maxX, minZ, maxZ });
    console.log('Polygon center:', { centerX, centerZ });
    
    // Safety check for reasonable bounds
    const area = (maxX - minX) * (maxZ - minZ);
    if (area > 10000) { // Larger than 100x100 terrain
      console.warn('Polygon area too large, aborting operation');
      return;
    }
    
    // Sample points within the bounding box and check if they're inside the polygon
    const step = 0.5; // More precise sampling for better polygon fit
    let modifiedPoints = 0;
    const maxPoints = 10000; // Safety limit
    
    // Calculate target elevation from reference point
    const targetElevation = referenceElevation + signedMagnitude;
    console.log('Target elevation:', targetElevation, '(reference:', referenceElevation, '+ magnitude:', signedMagnitude, ')');
    
    for (let x = minX; x <= maxX; x += step) {
      for (let z = minZ; z <= maxZ; z += step) {
        if (modifiedPoints > maxPoints) {
          console.warn('Reached maximum point limit, stopping operation');
          break;
        }
        
        if (this.isPointInPolygon({ x, z }, polygon.vertices)) {
          // Calculate current terrain height at this position
          const currentHeight = this.terrain.getHeightAtPosition(x, z);
          
          // Calculate distance-based magnitude for cross-section effects
          let adjustedTargetElevation = targetElevation;
          
          if (crossSection.wallType !== 'straight') {
            // Calculate distance from point to polygon edge or deepest point
            let distanceFromReference: number;
            let maxDistanceFromReference: number;
            
            if (crossSection.deepestPoint) {
              // Distance from deepest point
              distanceFromReference = Math.sqrt(
                (x - crossSection.deepestPoint.x) ** 2 + 
                (z - crossSection.deepestPoint.z) ** 2
              );
              maxDistanceFromReference = this.calculateMaxDistanceFromPoint(crossSection.deepestPoint, polygon.vertices);
            } else {
              // Distance from polygon edge (fallback)
              distanceFromReference = this.calculateDistanceToPolygonEdge({ x, z }, polygon.vertices);
              maxDistanceFromReference = this.calculateMaxDistanceToEdge(polygon.vertices);
            }
            
            const normalizedDistance = Math.min(1, distanceFromReference / maxDistanceFromReference);
            
            // Debug logging for first few points
            if (modifiedPoints < 5) {
              console.log('Cross-section debug:', {
                point: { x, z },
                wallType: crossSection.wallType,
                distanceFromReference,
                maxDistanceFromReference,
                normalizedDistance,
                originalMagnitude: signedMagnitude
              });
            }
            
            if (crossSection.wallType === 'curved') {
              // Smooth curved transition using cosine function - make more pronounced
              // Full magnitude at deepest point (normalizedDistance = 0), tapering outward
              const curveFactor = Math.cos(normalizedDistance * Math.PI / 2);
              const adjustedMagnitude = signedMagnitude * curveFactor;
              adjustedTargetElevation = referenceElevation + adjustedMagnitude;
              
              if (modifiedPoints < 5) {
                console.log('Curved calculation:', {
                  curveFactor,
                  adjustedMagnitude,
                  adjustedTargetElevation
                });
              }
            } else if (crossSection.wallType === 'angled') {
              // Linear 45-degree slope from deepest point outward - make more aggressive
              const maxSlopeDistance = Math.abs(signedMagnitude) * 2; // Double the slope distance for more visible effect
              
              if (distanceFromReference < maxSlopeDistance) {
                // Within slope range - apply linear scaling
                const slopeFactor = (maxSlopeDistance - distanceFromReference) / maxSlopeDistance;
                const adjustedMagnitude = signedMagnitude * slopeFactor;
                adjustedTargetElevation = referenceElevation + adjustedMagnitude;
                
                if (modifiedPoints < 5) {
                  console.log('Angled calculation:', {
                    maxSlopeDistance,
                    slopeFactor,
                    adjustedMagnitude,
                    adjustedTargetElevation
                  });
                }
              } else {
                // Beyond slope range - gradually transition to current terrain (not abrupt)
                const transitionFactor = Math.max(0, 1 - (distanceFromReference - maxSlopeDistance) / (maxSlopeDistance * 0.5));
                const adjustedMagnitude = signedMagnitude * transitionFactor * 0.1; // Small residual effect
                adjustedTargetElevation = referenceElevation + adjustedMagnitude;
                
                if (modifiedPoints < 5) {
                  console.log('Angled transition:', {
                    transitionFactor,
                    adjustedMagnitude,
                    adjustedTargetElevation
                  });
                }
              }
            }
          }
          
          // Calculate height change needed
          let heightChange = adjustedTargetElevation - currentHeight;
          
          // Apply depth limits to prevent excessive cuts/fills
          const originalHeight = this.terrain.getOriginalHeightAtPosition(x, z);
          const proposedNewHeight = currentHeight + heightChange;
          const changeFromOriginal = proposedNewHeight - originalHeight;
          
          // DEPTH LIMITS: First ensure we don't exceed the user-specified magnitude
          const userSpecifiedLimit = Math.abs(signedMagnitude); // The exact depth/height user requested
          const maxAllowedChange = signedMagnitude < 0 ? -userSpecifiedLimit : userSpecifiedLimit;
          
          // Secondary limits: Prevent cuts deeper than 20 feet or fills higher than 20 feet
          const maxCutDepth = -20.0;  // 20 feet below original terrain
          const maxFillHeight = 20.0; // 20 feet above original terrain
          const terrainBlockBottom = -25.0; // Don't cut through the terrain block bottom
          
          let limitedNewHeight = proposedNewHeight;
          
          // First, apply user-specified limits (most restrictive for polygons)
          if (signedMagnitude < 0) { // Cut operation
            const maxAllowedCutHeight = originalHeight + maxAllowedChange;
            limitedNewHeight = Math.max(maxAllowedCutHeight, limitedNewHeight);
          } else { // Fill operation  
            const maxAllowedFillHeight = originalHeight + maxAllowedChange;
            limitedNewHeight = Math.min(maxAllowedFillHeight, limitedNewHeight);
          }
          
          // Then apply safety limits (secondary)
          if (changeFromOriginal < maxCutDepth) {
            // Limit cut to 20 feet below original
            limitedNewHeight = Math.max(limitedNewHeight, originalHeight + maxCutDepth);
          } else if (changeFromOriginal > maxFillHeight) {
            // Limit fill to 20 feet above original
            limitedNewHeight = Math.min(limitedNewHeight, originalHeight + maxFillHeight);
          }
          
          // Finally, ensure we don't cut through the terrain block bottom
          limitedNewHeight = Math.max(terrainBlockBottom, limitedNewHeight);
          
          // Recalculate the actual height change after applying limits
          heightChange = limitedNewHeight - currentHeight;
          
          // Only apply if the change is significant (avoid tiny adjustments)
          if (Math.abs(heightChange) > 0.1) {
            this.terrain.modifyHeightAtPosition(x, z, heightChange);
            modifiedPoints++;
          }
        }
      }
      if (modifiedPoints > maxPoints) break;
    }
    
    console.log('Modified', modifiedPoints, 'terrain points for polygon with', crossSection.wallType, 'cross-section');
    
    // Create overlays for fill operations
    if (signedMagnitude > 0) {
      // For fill operations, create visual overlay to show what was filled
      this.terrain.createPolygonFillOverlay(polygon.vertices);
      console.log('Created fill overlay for polygon operation');
    }
  }

  private async applyPolylineOperation(polyline: PolylineArea, signedMagnitude: number, crossSection: CrossSectionConfig): Promise<void> {
    console.log('Applying polyline operation:', {
      points: polyline.points.length,
      thickness: polyline.thickness,
      magnitude: signedMagnitude,
      wallType: crossSection.wallType,
      deepestPoint: crossSection.deepestPoint
    });
    
    if (polyline.points.length < 2) {
      console.warn('Not enough points for polyline operation');
      return;
    }
    
    const halfThickness = polyline.thickness / 2;
    let modifiedPoints = 0;
    
    for (let i = 0; i < polyline.points.length - 1; i++) {
      const start = polyline.points[i];
      const end = polyline.points[i + 1];
      
      // Create line segment and apply modifications perpendicular to it
      const direction = { 
        x: end.x - start.x, 
        z: end.z - start.z 
      };
      const length = Math.sqrt(direction.x ** 2 + direction.z ** 2);
      const normalized = { 
        x: direction.x / length, 
        z: direction.z / length 
      };
      const perpendicular = { 
        x: -normalized.z, 
        z: normalized.x 
      };
      
      // Sample along the line segment
      const step = 0.5;
      for (let t = 0; t <= length; t += step) {
        const centerX = start.x + normalized.x * t;
        const centerZ = start.z + normalized.z * t;
        
        // Apply modifications across the thickness
        for (let w = -halfThickness; w <= halfThickness; w += step) {
          const x = centerX + perpendicular.x * w;
          const z = centerZ + perpendicular.z * w;
          
          // Calculate current terrain height at this specific position
          const currentHeight = this.terrain.getHeightAtPosition(x, z);
          
          // For surface-following operations, use ORIGINAL terrain height as reference to prevent stacking
          const originalTerrainHeight = this.terrain.getOriginalHeightAtPosition(x, z);
          const localReferenceElevation = originalTerrainHeight;
          
          // Calculate distance from deepest point for cross-section effects
          let distanceFromReference: number;
          if (crossSection.deepestPoint) {
            distanceFromReference = Math.sqrt(
              (x - crossSection.deepestPoint.x) ** 2 + 
              (z - crossSection.deepestPoint.z) ** 2
            );
          } else {
            // Fallback: distance from center line
            distanceFromReference = Math.abs(w);
          }
          
          // Calculate adjusted magnitude based on cross-section type and distance
          let adjustedTargetElevation = localReferenceElevation + signedMagnitude;
          
          if (crossSection.wallType === 'straight') {
            // Straight walls: full depth/height throughout thickness, relative to local surface
            adjustedTargetElevation = localReferenceElevation + signedMagnitude;
          } else if (crossSection.wallType === 'curved') {
            // Curved cross-section: cosine curve from deepest point
            let normalizedDistance: number;
            if (crossSection.deepestPoint) {
              // Calculate max distance along the polyline for normalization
              const maxDistanceFromDeepest = this.calculateMaxDistanceFromPointToPolyline(crossSection.deepestPoint, polyline);
              normalizedDistance = Math.min(1, distanceFromReference / maxDistanceFromDeepest);
            } else {
              normalizedDistance = Math.abs(w) / halfThickness;
            }
            
            const curveFactor = Math.cos(normalizedDistance * Math.PI / 2);
            const adjustedMagnitude = signedMagnitude * curveFactor;
            adjustedTargetElevation = localReferenceElevation + adjustedMagnitude;
          } else if (crossSection.wallType === 'angled') {
            // Angled cross-section: 45-degree linear slopes from deepest point
            const maxSlopeDistance = Math.abs(signedMagnitude) * 2; // Make more aggressive like polygon
            
            if (distanceFromReference <= maxSlopeDistance) {
              // Within slope range: linear scaling from deepest point
              const slopeFactor = (maxSlopeDistance - distanceFromReference) / maxSlopeDistance;
              const adjustedMagnitude = signedMagnitude * slopeFactor;
              adjustedTargetElevation = localReferenceElevation + adjustedMagnitude;
            } else {
              // Beyond slope range: gradual transition (not abrupt cutoff)
              const transitionFactor = Math.max(0, 1 - (distanceFromReference - maxSlopeDistance) / (maxSlopeDistance * 0.5));
              const adjustedMagnitude = signedMagnitude * transitionFactor * 0.1;
              adjustedTargetElevation = localReferenceElevation + adjustedMagnitude;
            }
          }
          
          // Calculate height change needed
          let heightChange = adjustedTargetElevation - currentHeight;
          
          // Apply depth limits to prevent excessive cuts/fills
          const originalHeight = this.terrain.getOriginalHeightAtPosition(x, z);
          const proposedNewHeight = currentHeight + heightChange;
          const changeFromOriginal = proposedNewHeight - originalHeight;
          
          // DEPTH LIMITS: First ensure we don't exceed the user-specified magnitude
          const userSpecifiedLimit = Math.abs(signedMagnitude); // The exact depth/height user requested
          const maxAllowedChange = signedMagnitude < 0 ? -userSpecifiedLimit : userSpecifiedLimit;
          
          // Secondary limits: Prevent cuts deeper than 20 feet or fills higher than 20 feet
          const maxCutDepth = -20.0;  // 20 feet below original terrain
          const maxFillHeight = 20.0; // 20 feet above original terrain
          const terrainBlockBottom = -25.0; // Don't cut through the terrain block bottom
          
          let limitedNewHeight = proposedNewHeight;
          
          // First, apply user-specified limits (most restrictive for polylines)
          if (signedMagnitude < 0) { // Cut operation
            const maxAllowedCutHeight = originalHeight + maxAllowedChange;
            limitedNewHeight = Math.max(maxAllowedCutHeight, limitedNewHeight);
          } else { // Fill operation  
            const maxAllowedFillHeight = originalHeight + maxAllowedChange;
            limitedNewHeight = Math.min(maxAllowedFillHeight, limitedNewHeight);
          }
          
          // Then apply safety limits (secondary)
          if (changeFromOriginal < maxCutDepth) {
            // Limit cut to 20 feet below original
            limitedNewHeight = Math.max(limitedNewHeight, originalHeight + maxCutDepth);
          } else if (changeFromOriginal > maxFillHeight) {
            // Limit fill to 20 feet above original
            limitedNewHeight = Math.min(limitedNewHeight, originalHeight + maxFillHeight);
          }
          
          // Finally, ensure we don't cut through the terrain block bottom
          limitedNewHeight = Math.max(terrainBlockBottom, limitedNewHeight);
          
          // Debug excessive cuts for first few points in polylines
          if (modifiedPoints < 3 && signedMagnitude < 0) {
            const originalCalculatedCut = proposedNewHeight - originalHeight;
            const actualAppliedCut = limitedNewHeight - originalHeight;
            console.log('Polyline cut depth debug:', {
              userSpecified: `${Math.abs(signedMagnitude)} feet`,
              originalCalculated: `${Math.abs(originalCalculatedCut).toFixed(1)} feet`,
              actualApplied: `${Math.abs(actualAppliedCut).toFixed(1)} feet`,
              limited: originalCalculatedCut !== actualAppliedCut,
              crossSectionType: crossSection.wallType
            });
          }
          
          // Recalculate the actual height change after applying limits
          heightChange = limitedNewHeight - currentHeight;
          
          // Only apply if the change is significant (avoid tiny adjustments)
          if (Math.abs(heightChange) > 0.1) {
            this.terrain.modifyHeightAtPosition(x, z, heightChange);
            modifiedPoints++;
          }
        }
      }
    }
    
    console.log('Modified', modifiedPoints, 'terrain points along polyline with', crossSection.wallType, 'cross-section following surface');
    
    // Create overlays for fill operations
    if (signedMagnitude > 0) {
      // For fill operations, create visual overlay to show what was filled
      this.terrain.createPolylineFillOverlay(polyline.points, polyline.thickness);
      console.log('Created fill overlay for polyline operation');
    }
  }

  // Utility methods for polygon operations
  private isPointInPolygon(point: PrecisionPoint, vertices: PrecisionPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      if (((vertices[i].z > point.z) !== (vertices[j].z > point.z)) &&
          (point.x < (vertices[j].x - vertices[i].x) * (point.z - vertices[i].z) / (vertices[j].z - vertices[i].z) + vertices[i].x)) {
        inside = !inside;
      }
    }
    return inside;
  }

  private distanceToPolygonEdge(point: PrecisionPoint, vertices: PrecisionPoint[]): number {
    let minDistance = Infinity;
    
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      const distance = this.distanceToLineSegment(point, vertices[i], vertices[j]);
      minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
  }

  private maxDistanceToEdge(vertices: PrecisionPoint[]): number {
    // Find the maximum distance from any vertex to the polygon center
    const center = this.getPolygonCenter(vertices);
    let maxDistance = 0;
    
    for (const vertex of vertices) {
      const distance = Math.sqrt((vertex.x - center.x) ** 2 + (vertex.z - center.z) ** 2);
      maxDistance = Math.max(maxDistance, distance);
    }
    
    return maxDistance;
  }

  private getPolygonCenter(vertices: PrecisionPoint[]): PrecisionPoint {
    let centerX = 0, centerZ = 0;
    for (const vertex of vertices) {
      centerX += vertex.x;
      centerZ += vertex.z;
    }
    return {
      x: centerX / vertices.length,
      z: centerZ / vertices.length
    };
  }

  private distanceToLineSegment(point: PrecisionPoint, lineStart: PrecisionPoint, lineEnd: PrecisionPoint): number {
    const A = point.x - lineStart.x;
    const B = point.z - lineStart.z;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.z - lineStart.z;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx, zz;
    if (param < 0) {
      xx = lineStart.x;
      zz = lineStart.z;
    } else if (param > 1) {
      xx = lineEnd.x;
      zz = lineEnd.z;
    } else {
      xx = lineStart.x + param * C;
      zz = lineStart.z + param * D;
    }

    const dx = point.x - xx;
    const dz = point.z - zz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // Helper method to calculate distance from a point to the nearest polygon edge
  private calculateDistanceToPolygonEdge(point: PrecisionPoint, vertices: PrecisionPoint[]): number {
    let minDistance = Infinity;
    
    for (let i = 0; i < vertices.length; i++) {
      const start = vertices[i];
      const end = vertices[(i + 1) % vertices.length];
      
      const distance = this.pointToLineSegmentDistance(point, start, end);
      minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
  }

  // Helper method to calculate maximum possible distance to edge within polygon
  private calculateMaxDistanceToEdge(vertices: PrecisionPoint[]): number {
    // Find the center point and maximum distance from center to any edge
    let centerX = 0, centerZ = 0;
    for (const vertex of vertices) {
      centerX += vertex.x;
      centerZ += vertex.z;
    }
    centerX /= vertices.length;
    centerZ /= vertices.length;
    
    return this.calculateDistanceToPolygonEdge({ x: centerX, z: centerZ }, vertices);
  }

  // Helper method to calculate distance from point to line segment
  private pointToLineSegmentDistance(point: PrecisionPoint, start: PrecisionPoint, end: PrecisionPoint): number {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    
    if (length === 0) {
      // Line segment is actually a point
      return Math.sqrt((point.x - start.x) ** 2 + (point.z - start.z) ** 2);
    }
    
    // Calculate parameter t for closest point on line segment
    const t = Math.max(0, Math.min(1, 
      ((point.x - start.x) * dx + (point.z - start.z) * dz) / (length * length)
    ));
    
    // Find closest point on line segment
    const closestX = start.x + t * dx;
    const closestZ = start.z + t * dz;
    
    // Return distance from point to closest point
    return Math.sqrt((point.x - closestX) ** 2 + (point.z - closestZ) ** 2);
  }

  // Helper method to calculate maximum distance from a specific point to polygon vertices
  private calculateMaxDistanceFromPoint(point: PrecisionPoint, vertices: PrecisionPoint[]): number {
    let maxDistance = 0;
    
    for (const vertex of vertices) {
      const distance = Math.sqrt((point.x - vertex.x) ** 2 + (point.z - vertex.z) ** 2);
      maxDistance = Math.max(maxDistance, distance);
    }
    
    return maxDistance;
  }

  // Helper method to calculate maximum distance from a point to any point along a polyline
  private calculateMaxDistanceFromPointToPolyline(point: PrecisionPoint, polyline: PolylineArea): number {
    let maxDistance = 0;
    
    // Check distance to all polyline points
    for (const polylinePoint of polyline.points) {
      const distance = Math.sqrt((point.x - polylinePoint.x) ** 2 + (point.z - polylinePoint.z) ** 2);
      maxDistance = Math.max(maxDistance, distance);
    }
    
    // Also check distance to line segments for more accuracy
    for (let i = 0; i < polyline.points.length - 1; i++) {
      const start = polyline.points[i];
      const end = polyline.points[i + 1];
      const distance = this.pointToLineSegmentDistance(point, start, end);
      maxDistance = Math.max(maxDistance, distance);
    }
    
    // Add half thickness to account for the width of the polyline
    return maxDistance + polyline.thickness / 2;
  }

  // Visualization methods
  private updateDrawingVisualization(): void {
    this.clearDrawingHelpers();
    
    if (!this.workflowState.area) return;
    
    if (this.workflowState.area.type === 'polygon') {
      this.visualizePolygon(this.workflowState.area as PolygonArea);
    } else {
      this.visualizePolyline(this.workflowState.area as PolylineArea);
    }
  }

  private visualizePolygon(polygon: PolygonArea): void {
    if (polygon.vertices.length === 0) return;
    
    // Create line visualization
    const points = polygon.vertices.map(v => new THREE.Vector3(v.x, this.terrain.getHeightAtPosition(v.x, v.z) + 0.5, v.z));
    
    if (polygon.closed && points.length > 2) {
      points.push(points[0]); // Close the loop
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
      color: this.workflowState.direction === 'cut' ? 0xff4444 : 0x2196f3,
      linewidth: 3
    });
    
    const line = new THREE.Line(geometry, material);
    this.drawingHelpers.push(line);
    this.scene.add(line);
    
    // Add vertex markers
    for (const point of points) {
      const sphereGeometry = new THREE.SphereGeometry(0.3, 8, 8);
      const sphereMaterial = new THREE.MeshBasicMaterial({ 
        color: this.workflowState.direction === 'cut' ? 0xff6666 : 0x4499ff 
      });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.position.copy(point);
      this.drawingHelpers.push(sphere);
      this.scene.add(sphere);
    }
  }

  private visualizePolyline(polyline: PolylineArea): void {
    if (polyline.points.length === 0) return;
    
    // Create line visualization
    const points = polyline.points.map(p => new THREE.Vector3(p.x, this.terrain.getHeightAtPosition(p.x, p.z) + 0.5, p.z));
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
      color: this.workflowState.direction === 'cut' ? 0xff4444 : 0x2196f3,
      linewidth: 3
    });
    
    const line = new THREE.Line(geometry, material);
    this.drawingHelpers.push(line);
    this.scene.add(line);
    
    // Visualize thickness if more than one point
    if (points.length > 1) {
      // Create a tube geometry to show thickness
      const path = new THREE.CatmullRomCurve3(points);
      const tubeGeometry = new THREE.TubeGeometry(path, Math.max(10, points.length * 5), polyline.thickness / 2, 8, false);
      const tubeMaterial = new THREE.MeshBasicMaterial({ 
        color: this.workflowState.direction === 'cut' ? 0xff4444 : 0x2196f3,
        transparent: true,
        opacity: 0.3
      });
      
      const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
      this.drawingHelpers.push(tube);
      this.scene.add(tube);
    }
  }

  private clearDrawingHelpers(): void {
    for (const helper of this.drawingHelpers) {
      this.scene.remove(helper);
    }
    this.drawingHelpers = [];
  }

  private clearPreview(): void {
    if (this.workflowState.previewOperation?.previewMesh) {
      this.scene.remove(this.workflowState.previewOperation.previewMesh);
      this.workflowState.previewOperation.previewMesh = undefined;
    }
    
    // Also clear any fill overlays that were created during operation execution
    this.clearFillOverlays();
  }

  /**
   * Clear fill overlays from terrain after operation execution
   */
  private clearFillOverlays(): void {
    // Clear fill overlays from terrain 
    this.terrain.clearFillOverlays();
    
    // Show a brief notification that overlays were cleared
    this.showOverlayClearedNotification();
  }

  /**
   * Comprehensive cleanup of all visual artifacts and overlays
   */
  private clearAllArtifacts(): void {
    // Clear fill overlays
    this.terrain.clearFillOverlays();
    
    // Clear cut overlays 
    this.terrain.cleanupAllOverlays();
    
    // Force terrain to regenerate contours and colors to fix any visual issues
    this.terrain.forceCompleteUpdate();
    
    console.log('🧹 All visual artifacts cleared');
  }

  /**
   * Show notification when overlays are cleared after execution
   */
  private showOverlayClearedNotification(): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      background: rgba(76, 175, 80, 0.9);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-family: Arial, sans-serif;
      z-index: 1002;
      animation: fadeInOut 2s ease-in-out;
    `;
    
    notification.innerHTML = `✨ Preview cleared`;
    
    // Add fade animation styles if not already present
    if (!document.querySelector('style[data-overlay-animations]')) {
      const style = document.createElement('style');
      style.setAttribute('data-overlay-animations', 'true');
      style.textContent = `
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(10px); }
          20% { opacity: 1; transform: translateY(0); }
          80% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-10px); }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Auto-remove after animation completes
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 2000);
  }

  clearWorkflow(): void {
    this.clearDrawingHelpers();
    this.clearPreview();
    this.clearAllArtifacts();
    this.workflowState = {
      stage: 'direction',
      isDrawing: false
    };
    
    // Don't automatically restore camera view - let user control when to exit top-down mode
    // this.restoreOriginalView();
    
    this.updateUI();
  }

  // Helper methods
  private canCreatePreview(): boolean {
    return !!(
      this.workflowState.direction &&
      this.workflowState.magnitude &&
      this.workflowState.area &&
      this.workflowState.crossSection
    );
  }

  private updateUI(): void {
    // This will be called whenever the workflow state changes
    // The UI update will be handled in the main application
    const event = new CustomEvent('precision-tool-state-changed', {
      detail: this.workflowState
    });
    window.dispatchEvent(event);
  }

  // Check if a point is near a polyline (within its thickness)
  private isPointNearPolyline(point: PrecisionPoint, polyline: PolylineArea): boolean {
    const halfThickness = polyline.thickness / 2;
    
    for (let i = 0; i < polyline.points.length - 1; i++) {
      const start = polyline.points[i];
      const end = polyline.points[i + 1];
      const distance = this.pointToLineSegmentDistance(point, start, end);
      
      if (distance <= halfThickness) {
        return true;
      }
    }
    
    return false;
  }

  // Show validation message for area selection
  private showAreaValidationMessage(): void {
    const message = document.createElement('div');
    message.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 68, 68, 0.95);
      color: white;
      padding: 20px 30px;
      border-radius: 8px;
      z-index: 2000;
      font-size: 16px;
      font-weight: bold;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      border: 2px solid #ff6666;
    `;
    
    message.innerHTML = `
      ⚠️ <strong>Invalid Position</strong><br>
      <span style="font-size: 14px; font-weight: normal;">
        Please click within your drawn ${this.workflowState.area?.type} area
      </span>
    `;
    
    document.body.appendChild(message);
    
    setTimeout(() => {
      if (document.body.contains(message)) {
        document.body.removeChild(message);
      }
    }, 3000);
  }

  /**
   * Show notification about camera change
   */
  private showCameraChangeNotification(): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(33, 150, 243, 0.95);
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      z-index: 1001;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      animation: slideDown 0.3s ease-out;
    `;
    
    notification.innerHTML = `
      📐 <strong>Top-Down View Active</strong><br>
      <span style="font-size: 12px;">Camera positioned for precise area drawing<br>
      🔍 Use scroll wheel or +/- keys to zoom<br>
      📹 Press 'V' to return to 3D view</span>
    `;
    
    // Add animation styles if not already present
    if (!document.querySelector('style[data-camera-animations]')) {
      const style = document.createElement('style');
      style.setAttribute('data-camera-animations', 'true');
      style.textContent = `
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  }

  /**
   * Check if currently in top-down drawing mode
   */
  public isInTopDownMode(): boolean {
    return this.workflowState.stage === 'drawing' && this.workflowState.isDrawing && this.originalCameraState !== null;
  }

  /**
   * Handle zoom in top-down mode
   */
  public handleTopDownZoom(direction: 'in' | 'out', amount: number = 20): void {
    if (!this.isInTopDownMode()) return;
    
    const delta = direction === 'in' ? -amount : amount;
    this.camera.position.y += delta;
    
    // Clamp camera height for top-down view
    this.camera.position.y = Math.max(50, Math.min(400, this.camera.position.y));
    
    // Ensure camera stays centered and looking down
    this.camera.position.x = 50;
    this.camera.position.z = 50;
    this.camera.lookAt(50, 0, 50);
    
    // Show zoom level feedback
    this.showZoomFeedback();
  }

  /**
   * Show current zoom level in top-down mode
   */
  public showZoomFeedback(): void {
    if (!this.isInTopDownMode()) return;
    
    // Calculate zoom percentage (50 = closest, 400 = furthest)
    const height = this.camera.position.y;
    const zoomPercent = Math.round((400 - height) / (400 - 50) * 100);
    
    // Remove any existing zoom indicator
    const existingIndicator = document.getElementById('zoom-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    // Create zoom level indicator
    const indicator = document.createElement('div');
    indicator.id = 'zoom-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-family: Arial, sans-serif;
      z-index: 1002;
      transition: opacity 0.3s ease;
    `;
    
    indicator.innerHTML = `🔍 ${zoomPercent}%`;
    document.body.appendChild(indicator);
    
    // Auto-remove after 1 second
    setTimeout(() => {
      if (document.getElementById('zoom-indicator')) {
        indicator.style.opacity = '0';
        setTimeout(() => {
          if (document.body.contains(indicator)) {
            document.body.removeChild(indicator);
          }
        }, 300);
      }
    }, 1000);
  }

  /**
   * Manually exit top-down mode and return to normal 3D view
   */
  public exitTopDownMode(): void {
    if (this.isInTopDownMode()) {
      this.restoreOriginalView();
      
      // Show exit notification
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(156, 39, 176, 0.95);
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        z-index: 1001;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        animation: slideDown 0.3s ease-out;
      `;
      
      notification.innerHTML = `
        📹 <strong>3D View Restored</strong><br>
        <span style="font-size: 12px;">Manually exited top-down mode</span>
      `;
      
      // Add animation styles if not already present
      if (!document.querySelector('style[data-camera-animations]')) {
        const style = document.createElement('style');
        style.setAttribute('data-camera-animations', 'true');
        style.textContent = `
          @keyframes slideDown {
            from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
            to { transform: translateX(-50%) translateY(0); opacity: 1; }
          }
        `;
        document.head.appendChild(style);
      }
      
      document.body.appendChild(notification);
      
      // Auto-remove after 2 seconds
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 2000);
    }
  }
} 