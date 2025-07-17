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
export type WorkflowStage = 'direction' | 'magnitude' | 'area-mode' | 'drawing' | 'cross-section' | 'preview';

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
  
  constructor(terrain: Terrain, scene: THREE.Scene) {
    this.terrain = terrain;
    this.scene = scene;
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
    this.updateUI();
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
    this.workflowState.crossSection = config;
    this.workflowState.stage = 'preview';
    this.createPreview();
    this.updateUI();
  }

  setPolylineThickness(thickness: number): void {
    if (this.workflowState.area?.type === 'polyline') {
      (this.workflowState.area as PolylineArea).thickness = thickness;
      this.updateDrawingVisualization();
    }
  }

  setDeepestPoint(x: number, z: number): void {
    if (this.workflowState.crossSection) {
      this.workflowState.crossSection.deepestPoint = { x, z };
      if (this.workflowState.stage === 'preview') {
        this.createPreview();
      }
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
      bevelEnabled: false, // Disable beveling for now to simplify
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

    console.log('Geometry positioned at elevation:', direction === 'cut' ? baseElevation - magnitude : baseElevation);
    return geometry;
  }

  private createPolylineGeometry(
    polyline: PolylineArea,
    crossSection: CrossSectionConfig,
    magnitude: number,
    direction: 'cut' | 'fill'
  ): THREE.BufferGeometry {
    if (polyline.points.length < 2) return new THREE.BufferGeometry();

    // Create a path from the polyline points
    const path = new THREE.CatmullRomCurve3(
      polyline.points.map(p => new THREE.Vector3(p.x, 0, p.z))
    );

    // Create a rectangular cross-section for the "thickness"
    const crossSectionShape = new THREE.Shape();
    const halfThickness = polyline.thickness / 2;
    crossSectionShape.moveTo(-halfThickness, 0);
    crossSectionShape.lineTo(halfThickness, 0);
    crossSectionShape.lineTo(halfThickness, magnitude);
    crossSectionShape.lineTo(-halfThickness, magnitude);
    crossSectionShape.closePath();

    // Extrude along the path
    const geometry = new THREE.ExtrudeGeometry(crossSectionShape, {
      extrudePath: path,
      steps: Math.max(50, polyline.points.length * 10),
      bevelEnabled: false
    });

    // Calculate base elevation
    const baseElevation = this.calculateBaseElevation(polyline.points, direction);
    
    // Position the geometry
    if (direction === 'cut') {
      geometry.translate(0, baseElevation - magnitude, 0);
    } else {
      geometry.translate(0, baseElevation, 0);
    }

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
    
    try {
      // Apply the operation to the terrain
      console.log('Applying operation to terrain...');
      await this.applyOperationToTerrain(operation);
      console.log('Operation applied successfully');
      
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
      wallType: crossSection.wallType
    });
    
    if (polygon.vertices.length < 3) {
      console.warn('Not enough vertices for polygon operation');
      return;
    }
    
    // Find bounding box
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const vertex of polygon.vertices) {
      minX = Math.min(minX, vertex.x);
      maxX = Math.max(maxX, vertex.x);
      minZ = Math.min(minZ, vertex.z);
      maxZ = Math.max(maxZ, vertex.z);
    }
    
    console.log('Polygon bounding box:', { minX, maxX, minZ, maxZ });
    
    // Safety check for reasonable bounds
    const area = (maxX - minX) * (maxZ - minZ);
    if (area > 10000) { // Larger than 100x100 terrain
      console.warn('Polygon area too large, aborting operation');
      return;
    }
    
    // Sample points within the bounding box and check if they're inside the polygon
    const step = 1.0; // Increased step size to 1 foot to reduce processing
    let modifiedPoints = 0;
    const maxPoints = 10000; // Safety limit
    
    for (let x = minX; x <= maxX; x += step) {
      for (let z = minZ; z <= maxZ; z += step) {
        if (modifiedPoints > maxPoints) {
          console.warn('Reached maximum point limit, stopping operation');
          break;
        }
        
        if (this.isPointInPolygon({ x, z }, polygon.vertices)) {
          // Use straight walls only for now to avoid complex calculations
          let effectiveMagnitude = signedMagnitude;
          
          // Apply to terrain
          this.terrain.modifyHeightAtPosition(x, z, effectiveMagnitude);
          modifiedPoints++;
        }
      }
      if (modifiedPoints > maxPoints) break;
    }
    
    console.log('Modified', modifiedPoints, 'terrain points');
  }

  private async applyPolylineOperation(polyline: PolylineArea, signedMagnitude: number, crossSection: CrossSectionConfig): Promise<void> {
    // Apply height modifications along the polyline with thickness
    if (polyline.points.length < 2) return;
    
    const halfThickness = polyline.thickness / 2;
    
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
          
          let effectiveMagnitude = signedMagnitude;
          
          if (crossSection.wallType !== 'straight') {
            const distanceFromCenter = Math.abs(w);
            
            if (crossSection.wallType === 'curved') {
              const factor = Math.cos((distanceFromCenter / halfThickness) * Math.PI / 2);
              effectiveMagnitude *= factor;
            } else if (crossSection.wallType === 'angled') {
              const factor = Math.max(0, 1 - (distanceFromCenter / (Math.abs(signedMagnitude) * Math.tan(Math.PI / 4))));
              effectiveMagnitude *= factor;
            }
          }
          
          this.terrain.modifyHeightAtPosition(x, z, effectiveMagnitude);
        }
      }
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
  }

  clearWorkflow(): void {
    this.clearDrawingHelpers();
    this.clearPreview();
    this.workflowState = {
      stage: 'direction',
      isDrawing: false
    };
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
} 