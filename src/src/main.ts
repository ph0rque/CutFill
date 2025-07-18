import './style.css';
import * as THREE from 'three';
import { Terrain } from './terrain';
import { MultiplayerManager } from './multiplayer';
import { AuthService } from './auth';
import { AuthUI } from './auth-ui';
import { PrecisionToolManager } from './precision-tools';
import { PrecisionUI } from './precision-ui';
import { ViewControls } from './view-controls';
import { AssignmentManager } from './assignments';
import { AssignmentUI } from './assignment-ui';
import { ProgressTracker } from './progress';
import { uiPolishSystem } from './ui-polish';
import { visualEnhancementSystem } from './visual-enhancements';
import { responsiveDesignSystem } from './responsive-design';
import { performanceOptimizer, performanceMonitorUI } from './performance-optimization';
import { GestureControls, type GestureState } from './gesture-controls';

// Global variables that need to be available before any functions run
let isGameReady = false;
let isModifying = false;
let lastMousePosition: THREE.Vector3 | null = null;
let modificationStrength = 0.5;
let gestureControls: GestureControls;

// Preview system variables (must be declared early for animation loop)
let previewMesh: THREE.Mesh | null = null;
let isPreviewMode = false;
let lastPreviewPosition: THREE.Vector3 | null = null;

// Create basic Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// Create renderer with proper WebGL context handling
let renderer: THREE.WebGLRenderer;

// Check if renderer already exists (prevent duplicate creation)
if ((window as any).cutfillRenderer) {
  renderer = (window as any).cutfillRenderer;
} else {
  try {
    renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false
    });
    
    // Set up renderer
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x87ceeb); // Sky blue background
    
    // Store globally to prevent duplicate creation
    (window as any).cutfillRenderer = renderer;
  } catch (error) {
    console.error('Failed to create WebGL renderer:', error);
    // Fallback to basic renderer if WebGL fails
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x87ceeb);
    (window as any).cutfillRenderer = renderer;
  }
}

// Clean up any existing canvas elements to prevent conflicts
const existingCanvases = document.querySelectorAll('canvas');
existingCanvases.forEach(canvas => {
  if (canvas !== renderer.domElement) {
    canvas.remove();
  }
});

// Only append if not already in document
if (!document.body.contains(renderer.domElement)) {
  document.body.appendChild(renderer.domElement);
}

// Ensure canvas is properly positioned and prevent duplicate contexts
const canvas = renderer.domElement;
canvas.style.position = 'fixed';
canvas.style.top = '0';
canvas.style.left = '0';
canvas.style.zIndex = '1000';
canvas.style.touchAction = 'none';
canvas.style.pointerEvents = 'auto';

// Prevent context menu and other canvas interactions that might conflict
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('selectstart', e => e.preventDefault());

// Handle WebGL context loss/restore
canvas.addEventListener('webglcontextlost', (e) => {
  console.warn('WebGL context lost:', e);
  e.preventDefault();
});

canvas.addEventListener('webglcontextrestored', (e) => {
  // The renderer should automatically handle context restore
});

// Create terrain
const terrain = new Terrain(100, 100, 32, 32); // 100 feet x 100 feet

// Set camera reference for zoom-independent arrow scaling
terrain.setCameraReference(camera);

// Force disable all pattern overlays to prevent issues
terrain.forceDisablePatterns();

// Force disable wireframe mode initially
terrain.forceDisableWireframe();

// Change to unlit material for even lighting
terrain.getSurfaceMesh().material = new THREE.MeshBasicMaterial({
  vertexColors: true,
  side: THREE.DoubleSide
});

// Force update colors with new depth-based gradient
terrain.forceUpdateColors();

scene.add(terrain.getMesh());

// Add basic lighting immediately so terrain is visible
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Increased ambient
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
directionalLight.position.set(50, 80, 50); // more top-down
scene.add(directionalLight);

// Add side lighting to illuminate walls better
const sideLight1 = new THREE.DirectionalLight(0xffffff, 0.3);
sideLight1.position.set(0, 20, 50); // Left side (adjusted for 0-100 coords)
scene.add(sideLight1);

const sideLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
sideLight2.position.set(100, 20, 50); // Right side (adjusted for 0-100 coords)
scene.add(sideLight2);

const hemi = new THREE.HemisphereLight(0xddddff, 0x888866, 0.4);
scene.add(hemi);

// or simply raise the ambient intensity:
ambientLight.intensity = 1.0;

// Add scale reference markers (no grid)
const scaleReferences = addScaleReferences(scene);

// Position camera for Y-up system centered on terrain (terrain center is now 50,50)
camera.position.set(75, 80, 75); // Look at terrain from corner perspective
camera.lookAt(50, 0, 50); // Look at terrain center

// Allow much more zoom out for better overview
camera.far = 2000; // Increase far clipping plane
camera.updateProjectionMatrix();

// Terrain is now visible - turn off wireframe
        (terrain.getSurfaceMesh().material as THREE.MeshBasicMaterial).wireframe = false;

// Function to add scale references to the scene
function addScaleReferences(scene: THREE.Scene): { markers: THREE.Group } {
  // Add scale markers with axis lines in corner
  const markerGroup = new THREE.Group();
  
  // Add a permanent grid system to show scale
  addPermanentScaleGrid(scene, markerGroup);
  
  // These will be dynamically positioned based on camera angle
  updateAxisPosition(markerGroup, camera);
  
  scene.add(markerGroup);
  
  return { markers: markerGroup };
}

// Function to add permanent scale grid and dimension markers
function addPermanentScaleGrid(scene: THREE.Scene, markerGroup: THREE.Group): void {
  const terrainSize = 100; // 100ft x 100ft terrain
  
  // Create distance markers at key points for scale reference
  for (let x = 0; x <= terrainSize; x += 50) {
    for (let z = 0; z <= terrainSize; z += 50) {
      if (x === 0 || x === terrainSize || z === 0 || z === terrainSize) {
        // Create a small marker cube
        const markerGeometry = new THREE.BoxGeometry(1, 0.5, 1);
        const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.set(x, 0.5, z);
        scene.add(marker);
        
        // Add distance text (simplified - using CSS2D would be better but keeping it simple)
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        canvas.width = 128;
        canvas.height = 64;
        context.fillStyle = 'white';
        context.font = '16px Arial';
        context.textAlign = 'center';
        context.fillText(`${x}',${z}'`, 64, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(x, 2, z);
        sprite.scale.set(8, 4, 1);
        scene.add(sprite);
      }
    }
  }
}



// Grid removed - contour lines provide better elevation reference

// Contour lines visibility toggle
function toggleContourLines() {
  const contoursVisible = terrain.toggleContourLines();
  
  // Update stats immediately
  updateContourStats();
  
  // Update HUD indicator if it exists
  const contourIndicator = document.getElementById('contour-indicator');
  if (contourIndicator) {
    contourIndicator.textContent = `📈 Contours: ${contoursVisible ? 'ON' : 'OFF'}`;
  }
  
  // Show brief notification with dynamic status
  const dynamicSettings = terrain.getDynamicContourSettings();
  const modeText = dynamicSettings.dynamic ? 'Dynamic' : 'Static';
  
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 60px;
    right: 20px;
    background: ${contoursVisible ? '#4CAF50' : '#666'};
    color: white;
    padding: 10px 15px;
    border-radius: 4px;
    z-index: 1001;
    font-size: 14px;
    animation: slideInOut 2s ease-in-out;
  `;
  notification.innerHTML = `📈 Contour Lines ${contoursVisible ? 'Enabled' : 'Disabled'}<br><small>${modeText} Mode</small>`;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 2500);
}

// Function to update axis position based on camera rotation
function updateAxisPosition(markerGroup: THREE.Group, camera: THREE.PerspectiveCamera): void {
  // Clear existing markers
  markerGroup.clear();
  
  // Get camera direction to determine which corner to place axes
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  
  // Calculate camera distance for dynamic scaling
  const cameraDistance = camera.position.distanceTo(new THREE.Vector3(50, 0, 50)); // Center of terrain
  
  // Determine corner position based on camera view (terrain spans 0,0 to 100,100)
  let cornerX = 0; // Near corner (origin)
  let cornerZ = 0; // Near corner (origin)
  
  // Adjust corner based on camera direction to show axes at visible corner
  if (cameraDirection.x > 0) cornerX = 100;  // Switch to far corner X if looking from negative X
  if (cameraDirection.z > 0) cornerZ = 100;  // Switch to far corner Z if looking from negative Z
  
  const axisY = 2; // Height above terrain
  const zAxisLength = 20; // Shortened Z-axis to 20 feet
  
  // Calculate dynamic segment spacing based on zoom level
  let segmentSpacing = 10; // Default 10ft segments
  if (cameraDistance < 25) {
    segmentSpacing = 1; // 1ft segments when very zoomed in
  } else if (cameraDistance < 50) {
    segmentSpacing = 5; // 5ft segments when zoomed in
  } else if (cameraDistance > 200) {
    segmentSpacing = 25; // 25ft segments when zoomed out
  }
  
  // Helper function to create segmented axis lines with dynamic occlusion
  function createSegmentedAxisLine(startPoint: THREE.Vector3, endPoint: THREE.Vector3, color: number, name: string): void {
    if (!terrain || !camera) return;
    
    try {
      const raycaster = new THREE.Raycaster();
      raycaster.camera = camera;
      
      const numSegments = 20; // Number of segments to check
      const segments: { start: THREE.Vector3, end: THREE.Vector3, occluded: boolean }[] = [];
      
      // Check each segment for occlusion
      for (let i = 0; i < numSegments; i++) {
        const t1 = i / numSegments;
        const t2 = (i + 1) / numSegments;
        
        const segmentStart = startPoint.clone().lerp(endPoint, t1);
        const segmentEnd = startPoint.clone().lerp(endPoint, t2);
        const segmentMiddle = segmentStart.clone().lerp(segmentEnd, 0.5);
        
        // Check if this segment is occluded
        raycaster.set(segmentMiddle, new THREE.Vector3(0, -1, 0));
        const surfaceMesh = terrain.getSurfaceMesh();
        let isOccluded = false;
        
        if (surfaceMesh && surfaceMesh.geometry && surfaceMesh.material) {
          const intersections = raycaster.intersectObject(surfaceMesh, false);
          if (intersections.length > 0) {
            const intersectionHeight = intersections[0].point.y;
            isOccluded = intersectionHeight > axisY - 0.1;
          }
        }
        
        segments.push({ start: segmentStart, end: segmentEnd, occluded: isOccluded });
      }
      
      // Group consecutive segments with same occlusion state
      const lineGroups: { points: THREE.Vector3[], occluded: boolean }[] = [];
      let currentGroup: { points: THREE.Vector3[], occluded: boolean } | null = null;
      
      segments.forEach((segment, index) => {
        if (!currentGroup || currentGroup.occluded !== segment.occluded) {
          // Start new group
          if (currentGroup) {
            lineGroups.push(currentGroup);
          }
          currentGroup = { points: [segment.start.clone()], occluded: segment.occluded };
        }
        
        // Add end point to current group
        currentGroup.points.push(segment.end.clone());
      });
      
      if (currentGroup) {
        lineGroups.push(currentGroup);
      }
      
      // Create line objects for each group
      lineGroups.forEach(group => {
        if (group.points.length < 2) return;
        
        const geometry = new THREE.BufferGeometry().setFromPoints(group.points);
        let material: THREE.Material;
        
        if (group.occluded) {
          // Dashed line for occluded segments
          material = new THREE.LineDashedMaterial({
            color: color,
            linewidth: 3,
            depthTest: false,
            dashSize: 1, // Smaller for dotted effect
            gapSize: 1 // Smaller for dotted effect
          });
        } else {
          // Solid line for visible segments
          material = new THREE.LineBasicMaterial({
            color: color,
            linewidth: 3,
            depthTest: false
          });
        }
        
        const line = new THREE.Line(geometry, material);
        if (group.occluded) {
          line.computeLineDistances(); // Required for dashed lines
        }
        line.renderOrder = 1000;
        line.name = name;
        markerGroup.add(line);
      });
      
    } catch (error) {
      console.warn(`Segmented axis creation failed for ${name}:`, error);
      // Fallback: create simple solid line
      const geometry = new THREE.BufferGeometry().setFromPoints([startPoint, endPoint]);
      const material = new THREE.LineBasicMaterial({
        color: color,
        linewidth: 3,
        depthTest: false
      });
      const line = new THREE.Line(geometry, material);
      line.renderOrder = 1000;
      line.name = name;
      markerGroup.add(line);
    }
  }

  // Helper function to create text markers
  function createTextMarker(text: string, x: number, y: number, z: number = 0.5, color: string = '#000000', small: boolean = false): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = small ? 128 : 192; // Doubled
    canvas.height = small ? 64 : 96; // Doubled
    
    // Style matching contours
    context.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent black
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add border
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.strokeRect(0, 0, canvas.width, canvas.height);
    
    // Add text
    context.fillStyle = '#FFFFFF';
    context.font = small ? 'bold 24px Arial' : 'bold 32px Arial'; // Doubled
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(small ? 10 : 16, small ? 5 : 8, 1); // Doubled
    sprite.renderOrder = 1002;
    
    return sprite;
  }
  
  // Create X-axis line (red) - full length across terrain (0 to 100) with dynamic segmentation
  const xAxisStartPoint = new THREE.Vector3(0, axisY, cornerZ);
  const xAxisEndPoint = new THREE.Vector3(100, axisY, cornerZ);
  createSegmentedAxisLine(xAxisStartPoint, xAxisEndPoint, 0xff0000, 'xAxis');
  
  // Calculate dynamic intervals for X-axis
  const totalXSegments = Math.floor(100 / segmentSpacing);
  const targetLabels = 4; // Aim for 4 labels per axis
  const xLabelInterval = Math.max(1, Math.ceil(totalXSegments / targetLabels));
  const xSegmentInterval = Math.max(1, Math.ceil(totalXSegments / (targetLabels * 2))); // Up to 2x labels worth of segments
  
  // Add X-axis segment markings and labels
  let segmentCount = 0;
  let displayedSegmentCount = 0;
  for (let x = 0; x <= 100; x += segmentSpacing) {
    
    // Only show segment if it passes the culling interval
    if (segmentCount % xSegmentInterval === 0) {
      const tickHeight = 1;
      const tickGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, axisY, cornerZ),
        new THREE.Vector3(x, axisY + tickHeight, cornerZ)
      ]);
      const tickMaterial = new THREE.LineBasicMaterial({ 
        color: 0xff0000, 
        linewidth: 1,
        depthTest: false // Always render on top
      });
      const tickLine = new THREE.Line(tickGeometry, tickMaterial);
      tickLine.renderOrder = 1001; // High render order to appear on top
      markerGroup.add(tickLine);
      
      // Add number label every other displayed segment (skip 0ft and 100ft)
      if (displayedSegmentCount % 2 === 0) {
        // Use actual coordinate value
        if (x !== 0 && x !== 100) { // Skip 0ft and 100ft
          const labelText = segmentSpacing >= 5 ? `${x}ft` : `${x}`;
          const labelOffset = cornerZ > 0 ? -2 : 2;
          markerGroup.add(createTextMarker(labelText, x, axisY + 3, cornerZ + labelOffset, '#ff0000', false)); // false = larger labels
        }
      }
      displayedSegmentCount++;
    }
    segmentCount++;
  }
  
  // Create Z-axis line (green) - full length across terrain (0 to 100) with dynamic segmentation
  const zAxisStartPoint = new THREE.Vector3(cornerX, axisY, 0);
  const zAxisEndPoint = new THREE.Vector3(cornerX, axisY, 100);
  createSegmentedAxisLine(zAxisStartPoint, zAxisEndPoint, 0x00ff00, 'zAxis');
  
  // Calculate dynamic intervals for Z-axis (same as X-axis)
  const zLabelInterval = xLabelInterval;
  const zSegmentInterval = xSegmentInterval;
  
  // Add Z-axis segment markings and labels
  segmentCount = 0;
  displayedSegmentCount = 0;
  for (let z = 0; z <= 100; z += segmentSpacing) {
    
    // Only show segment if it passes the culling interval
    if (segmentCount % zSegmentInterval === 0) {
      const tickHeight = 1;
      const tickGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cornerX, axisY, z),
        new THREE.Vector3(cornerX, axisY + tickHeight, z)
      ]);
      const tickMaterial = new THREE.LineBasicMaterial({ 
        color: 0x00ff00, 
        linewidth: 1,
        depthTest: false // Always render on top
      });
      const tickLine = new THREE.Line(tickGeometry, tickMaterial);
      tickLine.renderOrder = 1001; // High render order to appear on top
      markerGroup.add(tickLine);
      
      // Add number label every other displayed segment (skip 0ft and 100ft)
      if (displayedSegmentCount % 2 === 0) {
        // Use actual coordinate value
        if (z !== 0 && z !== 100) { // Skip 0ft and 100ft
          const labelText = segmentSpacing >= 5 ? `${z}ft` : `${z}`;
          const labelOffset = cornerX > 0 ? -2 : 2;
          markerGroup.add(createTextMarker(labelText, cornerX + labelOffset, axisY + 3, z, '#00ff00', false)); // false = larger labels
        }
      }
      displayedSegmentCount++;
    }
    segmentCount++;
  }
  
  // Create Y-axis line (blue) - shortened to 20 feet
  const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(cornerX, axisY, cornerZ),
    new THREE.Vector3(cornerX, axisY + zAxisLength, cornerZ)
  ]);
  const yAxisMaterial = new THREE.LineBasicMaterial({ 
    color: 0x0000ff, 
    linewidth: 3,
    depthTest: false // Always render on top
  });
  const yAxisLine = new THREE.Line(yAxisGeometry, yAxisMaterial);
  yAxisLine.renderOrder = 1000; // High render order to appear on top
  markerGroup.add(yAxisLine);
  
  // Y-axis tick marks and labels removed - contour lines provide elevation information

  // Add main axis endpoint labels (simple axis names)
  markerGroup.add(createTextMarker('X', 100 + 6, axisY + 2, cornerZ, '#ff0000'));
  markerGroup.add(createTextMarker('Z', cornerX, axisY + 2, 100 + 6, '#00ff00'));
  markerGroup.add(createTextMarker('Y', cornerX - 4, axisY + zAxisLength + 3, cornerZ, '#0000ff'));
}

// Force initialize game if authentication is taking too long
setTimeout(() => {
  if (!isGameReady) {
    isGameReady = true;
    initializeGame();
    // Set up guest user
    updateUserInfo({ email: 'guest@example.com', user_metadata: { username: 'Guest' } });
  }
}, 1000); // 1 second timeout (reduced from 3)

// Start basic animation loop immediately
function animate() {
  requestAnimationFrame(animate);
  try {
    // Update axis position based on camera rotation
    if (scaleReferences && scaleReferences.markers) {
      updateAxisPosition(scaleReferences.markers, camera);
    }
    
    // Update dynamic contour lines based on camera zoom level
    terrain.updateContoursForZoom();
    
    // Update contour stats display (throttled)
    if (Date.now() % 30 === 0) { // Update every ~30 frames (about twice per second at 60fps)
      updateContourStats();
    }
    
    // Auto-save terrain if needed (throttled to prevent excessive saves)
    terrain.autoSaveIfNeeded();
  
  // Update operation preview animation
  updateOperationPreview();
    
    renderer.render(scene, camera);
  } catch (error) {
    console.error('Render error:', error);
    // Try to recover by recreating the renderer
    location.reload();
  }
}

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Handle page unload to clean up WebGL context
window.addEventListener('beforeunload', () => {
  if (renderer) {
    renderer.dispose();
    (window as any).cutfillRenderer = null;
  }
  
  // Clean up performance optimizer
  performanceOptimizer.dispose();
  
  // Clean up UI systems
  uiPolishSystem.cleanup();
  visualEnhancementSystem.cleanup();
  responsiveDesignSystem.cleanup();
});

// Global functions for UI polish system
(window as any).toggleAccessibilityPanel = () => {
  uiPolishSystem.toggleAccessibilityPanel();
};

(window as any).toggleAgeGroupSelector = () => {
  uiPolishSystem.toggleAgeGroupSelector();
};

(window as any).togglePerformanceMonitor = () => {
  performanceMonitorUI.toggle();
};

// Start animation
animate();

// Force ensure UI is always visible after page load
setTimeout(() => {
  const appElement = document.querySelector('#app');
  if (appElement) {
    (appElement as HTMLElement).style.display = 'block';
    (appElement as HTMLElement).style.visibility = 'visible';
    (appElement as HTMLElement).style.opacity = '1';
    (appElement as HTMLElement).style.zIndex = '1002';
    (appElement as HTMLElement).style.pointerEvents = 'none';
  }
  
  // Hide any auth UI that might be covering
  const authContainers = document.querySelectorAll('#auth-container');
  authContainers.forEach(container => {
    (container as HTMLElement).style.display = 'none';
  });
}, 500); // Wait 500ms after page load

// Verify canvas is properly added to DOM
if (!document.body.contains(renderer.domElement)) {
  console.error('Canvas not properly added to DOM');
}

// Add basic UI immediately as fallback
const appDiv = document.querySelector<HTMLDivElement>('#app');
if (appDiv && appDiv.innerHTML.trim() === '') {
  appDiv.innerHTML = `
    <div style="position: absolute; top: 10px; left: 10px; color: white; font-family: Arial; background: rgba(0,0,0,0.8); padding: 15px; border-radius: 8px;">
      <h3>CutFill - Loading...</h3>
      <p>Initializing game systems...</p>
      <button onclick="window.forceInitGame()" style="margin-top: 10px; padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
        Force Load Game
      </button>
    </div>
  `;
  
  // Add global function to force initialization
  (window as any).forceInitGame = () => {
    if (!isGameReady) {
      isGameReady = true;
      initializeGame();
    }
  };
}

// Create authentication service
const authService = new AuthService();
const authUI = new AuthUI(authService);

// Create multiplayer manager
const multiplayerManager = new MultiplayerManager(terrain);

// Create precision tool manager and UI
const precisionToolManager = new PrecisionToolManager(terrain, scene, camera);
const precisionUI = new PrecisionUI(precisionToolManager);

// Create view controls
const viewControls = new ViewControls(camera, scene);

// Make precisionUI globally available for UI callbacks
(window as any).precisionUI = precisionUI;
(window as any).viewControls = viewControls;

// Create assignment manager
const assignmentManager = new AssignmentManager(terrain);

// Create assignment UI
const assignmentUI = new AssignmentUI(assignmentManager);

// Make assignment objects globally available for debugging
(window as any).assignmentManager = assignmentManager;
(window as any).assignmentUI = assignmentUI;

// Create progress tracker
const progressTracker = new ProgressTracker();

// Set up assignment callbacks
assignmentManager.setCallbacks({
  onProgressUpdate: (progress) => {
    updateAssignmentProgress(progress);
  },
  onObjectiveComplete: (objective) => {
    showObjectiveComplete(objective);
  },
  onAssignmentComplete: (progress) => {
    showAssignmentComplete(progress);
    // Award XP for assignment completion
    progressTracker.recordAssignmentCompletion(progress.currentScore);
  }
});

// Set up progress tracker callbacks
progressTracker.setCallbacks({
  onLevelUp: (newLevel, oldLevel) => {
    showLevelUp(newLevel, oldLevel);
  },
  onAchievementUnlocked: (achievement) => {
    showAchievementUnlocked(achievement);
  },
  onXPGained: (xp, source) => {
    showXPGained(xp, source);
  }
});

// Initialize authentication (simplified for testing)
try {
  authService.onAuthStateChange(authState => {
    if (authState.isLoading) {
      return;
    }

    if (authState.user) {
      // User is authenticated, hide auth UI and ensure game is ready
      authUI.hide();
      if (!isGameReady) {
        isGameReady = true;
        initializeGame();
      }
      updateUserInfo(authState.user);
      
      // Set user ID in terrain system for database persistence
      const userId = authState.user.id || authState.user.email || 'guest';
      terrain.setUserId(userId);
      
      // Save any pending modifications that occurred before login
      terrain.savePendingModifications();
      
      // Enable auto-save
      terrain.setAutoSave(true);
    } else {
      // User is not authenticated, but keep game UI visible
      // Only show auth UI if game isn't ready yet
      if (!isGameReady) {
        authUI.show();
      } else {
        // Game is ready, just update user info for guest
        updateUserInfo({ email: 'guest@example.com', user_metadata: { username: 'Guest' } });
        // Make sure auth UI is hidden
        authUI.hide();
        
        // Set guest user ID for terrain system
        terrain.setUserId('guest_' + Date.now());
      }
    }
  });
} catch (error) {
  console.error('Authentication error:', error);
  // Fallback: Initialize game without authentication
  if (!isGameReady) {
    isGameReady = true;
    initializeGame();
  }
}

// Function to initialize the game after authentication
function initializeGame() {
  // Setup game controls and event handlers
  setupGameControls();
  setupUI();
  
  // Initialize volume display
  updateVolumeDisplay();
  
  // Set up periodic UI visibility check
  setInterval(() => {
    const appElement = document.querySelector('#app');
    if (appElement) {
      const computedStyle = window.getComputedStyle(appElement);
      if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
        (appElement as HTMLElement).style.display = 'block';
        (appElement as HTMLElement).style.visibility = 'visible';
        (appElement as HTMLElement).style.opacity = '1';
      }
    }
  }, 2000); // Check every 2 seconds
}

// Function to update user info display
function updateUserInfo(user: {
  user_metadata?: { username?: string };
  email?: string;
}) {
  const userInfoElement = document.getElementById('user-info');
  if (userInfoElement) {
    const username = user.user_metadata?.username || user.email || 'Anonymous';
    userInfoElement.textContent = `👤 ${username}`;
  }
  
  // Load user progress
  const userId = user.email || 'guest';
  loadUserProgress(userId);
}

// Load user progress
async function loadUserProgress(userId: string) {
  try {
    await progressTracker.loadUserProgress(userId);
    progressTracker.startSession();
    updateProgressDisplay();
  } catch (error) {
    console.error('Failed to load user progress:', error);
  }
}

// Helper function to generate depth limit information for tooltips
function getDepthLimitInfo(toolName: string, depthLimits: any): string {
  const currentChange = depthLimits.currentDepth;
  const isAtLimit = (toolName === 'cut' && depthLimits.atCutLimit) || 
                    (toolName === 'fill' && depthLimits.atFillLimit);
  
  if (isAtLimit) {
    return toolName === 'cut' ? 
      '🚨 5ft Cut Limit Reached!' : 
      '🚨 5ft Fill Limit Reached!';
  }
  
  if (toolName === 'cut') {
    const remaining = depthLimits.remainingCutDepth;
    return remaining > 0 ? 
      `⛏️ ${remaining.toFixed(1)}ft more cut available` : 
      `⛏️ Can cut ${Math.abs(currentChange - (-5)).toFixed(1)}ft here`;
  } else {
    const remaining = depthLimits.remainingFillHeight;
    return remaining > 0 ? 
      `🏔️ ${remaining.toFixed(1)}ft more fill available` : 
      `🏔️ Can fill ${(5 - currentChange).toFixed(1)}ft here`;
  }
}

// Processing indicator functions for terrain operations
function showProcessingIndicator(){
  let indicator = document.getElementById('processing-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'processing-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 20px 30px;
      border-radius: 8px;
      z-index: 2000;
      font-size: 16px;
      display: flex;
      align-items: center;
      gap: 15px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    indicator.innerHTML = `
      <div style="
        width: 20px;
        height: 20px;
        border: 2px solid #4CAF50;
        border-top: 2px solid transparent;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      "></div>
      <span>Processing terrain changes...</span>
    `;
    document.body.appendChild(indicator);
    
    // Add CSS animation if not already present
    if (!document.getElementById('spinner-style')) {
      const style = document.createElement('style');
      style.id = 'spinner-style';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }
  indicator.style.display = 'flex';
}

function hideProcessingIndicator(){
  const indicator = document.getElementById('processing-indicator');
  if (indicator) {
    indicator.style.display = 'none';
  }
}

// Function to setup game controls
function setupGameControls() {
  // Initialize gesture controls
  gestureControls = new GestureControls(camera, renderer.domElement);
  
  // Set up gesture state change callback
  gestureControls.onGestureChange((state: GestureState) => {
    updateInteractionMode(false, false, state);
  });

  // Mouse interaction
  let isMouseDown = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  // Raycaster for mouse picking
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // Mouse event handlers
  renderer.domElement.addEventListener('mousedown', event => {
    if (event.button === 0) { // Left click
      isMouseDown = true;
      
      // Check for modifier keys
      if (event.ctrlKey || event.metaKey) {
        // Ctrl + drag = Apply tool
        isModifying = true;
        lastMousePosition = null; // Reset for new modification
        terrain.startModification();
        
        // Start real-time volume tracking
        startRealTimeVolumeUpdates();
        
        // Hide preview when starting to modify
        hideOperationPreview();
      } else {
        // Default: Rotate camera
        isModifying = false;
      }
    } else if (event.button === 2) { // Right click
      isMouseDown = true;
      isModifying = false; // Right click is for camera rotation
      // Hide preview during camera rotation
      hideOperationPreview();
    }
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
  });

  renderer.domElement.addEventListener('mousemove', event => {
    // Enhanced hover tooltips for terrain information AND operation preview
    // Hide tooltips when cut or fill tools are engaged (selected) OR when Ctrl is held (modification mode)
    const currentToolName = toolManager.getCurrentToolName();
    const isCutOrFillToolEngaged = currentToolName === 'cut' || currentToolName === 'fill';
    const isCtrlHeld = event.ctrlKey || event.metaKey;
    
    if (!isMouseDown && !isModifying && !isCutOrFillToolEngaged && !isCtrlHeld) {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(terrain.getSurfaceMesh());
      
      if (intersects.length > 0) {
        const point = intersects[0].point;
        const layerInfo = terrain.getLayerAtPosition(point.x, point.z);
        const height = point.y;
        const relativeHeight = height - terrain.getTargetElevation();
        
        // Show operation preview when hovering
        showOperationPreview(point);
        
        let tooltip = document.getElementById('terrain-tooltip');
        if (!tooltip) {
          tooltip = document.createElement('div');
          tooltip.id = 'terrain-tooltip';
          tooltip.style.cssText = `
            position: absolute; 
            background: rgba(0,0,0,0.9); 
            color: white; 
            padding: 8px; 
            border-radius: 4px; 
            font-size: 12px;
            pointer-events: none;
            z-index: 2000;
            border: 1px solid #555;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          `;
          document.body.appendChild(tooltip);
        }
        
        // Determine zone type
        let zoneType = '';
        let zoneColor = '';
        if (relativeHeight >= 2) {
          zoneType = 'High Fill Zone';
          zoneColor = '#4CAF50';
        } else if (relativeHeight >= 0.5) {
          zoneType = 'Medium Fill Zone';
          zoneColor = '#FF9800';
        } else if (relativeHeight >= -0.5) {
          zoneType = 'Target Zone';
          zoneColor = '#FFF59D';
        } else {
          zoneType = 'Cut Zone';
          zoneColor = '#2196F3';
        }
        
                // Get current tool info for preview
        const currentTool = toolManager.getCurrentTool();
        const toolSettings = currentTool.getSettings();
        const toolAction = toolSettings.name === 'cut' ? 'Cut (Remove Earth)' : 'Fill (Add Earth)';
        
        // Calculate preview volume
        const previewVolume = calculatePreviewVolume(point);
        const volumeEstimate = toolSettings.name === 'cut' ? previewVolume.cutPreview : previewVolume.fillPreview;
        
        // Get depth limits at this position
        const depthLimits = terrain.getDepthLimitsAtPosition(point.x, point.z);
        
        tooltip.innerHTML = `
          <div style="color: ${zoneColor}; font-weight: bold; margin-bottom: 4px;">🎯 ${zoneType}</div>
          <div><strong>Elevation:</strong> ${height.toFixed(2)} ft</div>
          <div><strong>Relative:</strong> ${relativeHeight > 0 ? '+' : ''}${relativeHeight.toFixed(2)} ft</div>
          <div><strong>Material:</strong> ${layerInfo}</div>
          <div style="margin-top: 4px; padding: 4px; background: rgba(${toolSettings.color.slice(1).match(/.{2}/g)!.map(h => parseInt(h, 16)).join(',')}, 0.2); border-radius: 3px; border-left: 3px solid ${toolSettings.color};">
            <div style="font-weight: bold; color: ${toolSettings.color};">${toolSettings.icon} ${toolSettings.displayName}</div>
            <div style="font-size: 10px; color: #ccc;">Preview: ${toolAction} Volume (Ctrl+drag to apply)</div>
            <div style="font-size: 10px; color: #ccc;">
              Size: ${terrain.getBrushSettings().size.toFixed(1)}ft | 
              Strength: ${(terrain.getBrushSettings().strength * 100).toFixed(0)}% | 
              Shape: ${terrain.getBrushSettings().shape === 'circle' ? '○ Circle' : '□ Square'} |
              Falloff: ${terrain.getBrushSettings().falloff}
            </div>
            <div style="font-size: 10px; color: #4CAF50; margin-top: 2px;">
              📊 Estimated Volume: ${volumeEstimate.toFixed(2)} yd³
            </div>
            <div style="font-size: 9px; color: #aaa; margin-top: 2px;">
              ${getDepthLimitInfo(toolSettings.name, depthLimits)}
            </div>
          </div>
          <div style="margin-top: 4px; font-size: 11px; color: #ccc;">
            ${relativeHeight > 0.5 ? '⬆️ Excavate to reduce fill' : relativeHeight < -0.5 ? '⬇️ Add material to cut' : '✅ Near target elevation'}
          </div>
        `;
        
        tooltip.style.display = 'block';
        tooltip.style.left = `${event.clientX + 15}px`;
        tooltip.style.top = `${event.clientY - 10}px`;
      } else {
        const tooltip = document.getElementById('terrain-tooltip');
        if (tooltip) tooltip.style.display = 'none';
        hideOperationPreview();
      }
    } else {
      // Hide tooltip and preview when cut/fill tools are engaged, during interaction, or when Ctrl is held
      const tooltip = document.getElementById('terrain-tooltip');
      if (tooltip) tooltip.style.display = 'none';
      hideOperationPreview();
    }

    if (isMouseDown) {
      if (event.buttons === 1) { // Left mouse button is down
        if (event.ctrlKey || event.metaKey || isModifying) {
          // Ctrl/Cmd + drag = Terrain modification
          mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
          mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObject(terrain.getSurfaceMesh());

          if (intersects.length > 0) {
            const point = intersects[0].point;
            const direction = lastMousePosition ? point.clone().sub(lastMousePosition).normalize() : undefined;
            
            // Apply current tool
            toolManager.applyCurrentTool(
              point.x, 
              point.z, 
              modificationStrength, 
              terrain.getBrushSettings().size
            );
            
            // Save terrain modification to database
            terrain.saveModificationToDatabase(
              point.x,
              point.z,
              toolManager.getCurrentToolName() === 'cut' ? -modificationStrength : modificationStrength,
              toolManager.getCurrentToolName()
            );
            
            // Track tool usage for assignment
            assignmentManager.addToolUsage(toolManager.getCurrentToolName());
            
            // Track tool usage for progress
            progressTracker.recordToolUsage(toolManager.getCurrentToolName());
            
            // Track volume movement for progress
            const volumeData = terrain.calculateVolumeDifference();
            const volumeChange = Math.abs(volumeData.cut + volumeData.fill);
            progressTracker.recordVolumeMove(volumeChange / 27); // Convert cubic feet to cubic yards
            
            updateVolumeDisplay();
            
            // Update overlay button states based on terrain state
            updateOverlayButtonStates();
            
            // Start real-time volume updates during modification
            startRealTimeVolumeUpdates();
            
            // Update arrow counts when tools are used
            // Removed: updateArrowCounts();

            lastMousePosition = point.clone();

            // Send to multiplayer if in session
            if (multiplayerManager.isInSession()) {
              multiplayerManager.sendTerrainModification(point.x, point.z, modificationStrength);
            }
          }
        } else {
          // Check for modifier keys to determine interaction mode
          const deltaX = event.clientX - lastMouseX;
          const deltaY = event.clientY - lastMouseY;
          
          if (event.shiftKey) {
            // Shift + drag = Pan camera
            gestureControls.handleMousePan(deltaX, deltaY);
          } else {
            // Default left drag = Camera rotation
            gestureControls.handleMouseRotation(deltaX, deltaY);
          }
        }
      } else if (event.buttons === 2) { // Right mouse button is down
        // Right click drag = Camera rotation using gesture controls
        const deltaX = event.clientX - lastMouseX;
        const deltaY = event.clientY - lastMouseY;

        gestureControls.handleMouseRotation(deltaX, deltaY);
      }

      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
    }
  });

  // Add keyboard event listeners for modifier key feedback
  document.addEventListener('keyup', event => {
    if (!gestureControls.getGestureState().isRotating && !gestureControls.getGestureState().isZooming) {
    updateInteractionMode(event.shiftKey, event.ctrlKey || event.metaKey);
    }
  });

  // Add keydown event listener to immediately hide tooltips when Ctrl is pressed
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey) {
      const tooltip = document.getElementById('terrain-tooltip');
      if (tooltip) {
        tooltip.style.display = 'none';
      }
      hideOperationPreview();
    }
  });

  // Mouse move to update interaction mode
  renderer.domElement.addEventListener('mousemove', event => {
    if (!isMouseDown && !gestureControls.getGestureState().isRotating && !gestureControls.getGestureState().isZooming) {
      updateInteractionMode(event.shiftKey, event.ctrlKey || event.metaKey);
    }
      });

  renderer.domElement.addEventListener('mouseup', () => {
    const wasModifying = isModifying;
    isMouseDown = false;
    isModifying = false;
    
    // Finalize volume updates if we were modifying
    if (wasModifying) {
      // Force a final volume update
      updateVolumeDisplay(true);
      isRealTimeUpdating = false;
    }
    
    // Reset interaction mode when mouse is released (only if not in gesture mode)
    if (!gestureControls.getGestureState().isRotating && !gestureControls.getGestureState().isZooming) {
    updateInteractionMode(false, false);
    }
  });

  // Prevent context menu on right click (since we use it for camera rotation)
  renderer.domElement.addEventListener('contextmenu', event => {
    event.preventDefault();
  });

    // Keyboard controls
  document.addEventListener('keydown', event => {
    // Update interaction mode display (only if not in gesture mode)
    if (!gestureControls.getGestureState().isRotating && !gestureControls.getGestureState().isZooming) {
    updateInteractionMode(event.shiftKey, event.ctrlKey || event.metaKey);
    }
    
    switch (event.key.toLowerCase()) {
      case 'w':
        terrain.toggleWireframe();
        break;
      case 'j':
        multiplayerManager.joinSession(
          'test',
          'Player' + Math.floor(Math.random() * 1000)
        );
        break;
      case 'l':
        authService.signOut();
        break;
      case 'a':
        assignmentUI.toggle();
        break;
      case 'z':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          if (event.shiftKey) {
            terrain.redo();
          } else {
            terrain.undo();
          }
          updateVolumeDisplay();
        }
        break;
      case 's':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          terrain.saveCurrentState().then(success => {
            updateVolumeDisplay();
            // Removed: updateArrowCounts();
            
            // Show brief confirmation
            const notification = document.createElement('div');
            notification.style.cssText = `
              position: fixed;
              top: 20px;
              right: 20px;
              background: ${success ? '#4CAF50' : '#F44336'};
              color: white;
              padding: 10px 15px;
              border-radius: 4px;
              z-index: 1001;
              font-size: 14px;
              animation: slideInOut 2s ease-in-out;
            `;
            notification.textContent = success ? '💾 State Saved to Database!' : '❌ Database Save Failed';
            document.body.appendChild(notification);
            
            setTimeout(() => {
              if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
              }
            }, 2000);
          });
        }
        break;
      case 'q':
        toolManager.setCurrentTool('cut');
        updateToolDisplay();
        break;
      case 'e':
        toolManager.setCurrentTool('fill');
        updateToolDisplay();
        break;
      case 'r':
        if (!event.ctrlKey && !event.metaKey) {
          terrain.reset();
          updateVolumeDisplay();
          if (multiplayerManager.isInSession()) {
            multiplayerManager.sendTerrainReset();
          }
        }
        break;
      case 'g':
        terrain.regenerateTerrain();
        updateVolumeDisplay(true); // Force immediate volume update to show 0.00 for new terrain
        
        // Show brief notification
        const notification = document.createElement('div');
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: #4CAF50;
          color: white;
          padding: 10px 15px;
          border-radius: 4px;
          z-index: 1001;
          font-size: 14px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          animation: slideInOut 2s ease-in-out;
        `;
        notification.innerHTML = '🌍 New terrain generated!';
        document.body.appendChild(notification);
        
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 2000);
        
        if (multiplayerManager.isInSession()) {
          multiplayerManager.sendTerrainReset();
        }
        break;

      case '1':
        terrain.setBrushSettings({ size: 1 });
        updateBrushDisplay();
        break;
      case '2':
        terrain.setBrushSettings({ size: 3 });
        updateBrushDisplay();
        break;
      case '3':
        terrain.setBrushSettings({ size: 5 });
        updateBrushDisplay();
        break;
      case '4':
        terrain.setBrushSettings({ size: 8 });
        updateBrushDisplay();
        break;
      case 'c':
        if (event.ctrlKey) return; // Don't interfere with Ctrl+C
        event.preventDefault();
        terrain.setBrushSettings({ shape: 'circle' });
        updateBrushDisplay();
        break;
      case 'v':
        if (event.ctrlKey) return; // Don't interfere with Ctrl+V
        event.preventDefault();
        terrain.setBrushSettings({ shape: 'square' });
        updateBrushDisplay();
        break;
      case 'f':
        if (event.ctrlKey) return; // Don't interfere with Ctrl+F
        event.preventDefault();
        // Cycle through falloff types
        const currentBrushSettings = terrain.getBrushSettings();
        const falloffTypes = ['smooth', 'linear', 'sharp'] as const;
        const currentIndex = falloffTypes.indexOf(currentBrushSettings.falloff);
        const nextIndex = (currentIndex + 1) % falloffTypes.length;
        terrain.setBrushSettings({ falloff: falloffTypes[nextIndex] });
        updateBrushDisplay();
        break;
      case 'x':
        // Grid removed - 'X' key now available for other functions
        break;
      case 'n':
        if (event.ctrlKey) return; // Don't interfere with Ctrl+N
        event.preventDefault();
        toggleContourLines();
        break;
      case 'b':
        if (event.ctrlKey) return; // Don't interfere with Ctrl+B
        event.preventDefault();
        terrain.forceUpdateColors();
        break;
      case 'escape':
        event.preventDefault();
        hideOperationPreview();
        hideKeyboardInstructions();
        break;
      case 'enter':
        event.preventDefault();
        // Save and execute planned cut/fill operations
        if (terrain.hasPendingChanges()) {
          showProcessingIndicator();
          // Use setTimeout to allow UI to update before processing
          setTimeout(() => {
            terrain.applyPendingChanges();
            // Update the planning UI buttons
            const refreshPlanButtons = () => {
              const planControlsDiv = document.getElementById('plan-controls') as HTMLDivElement;
              if (planControlsDiv) {
                planControlsDiv.style.display = terrain.hasPendingChanges() ? 'block' : 'none';
              }
            };
            refreshPlanButtons();
            // Force immediate volume update to show new cumulative totals
            updateVolumeDisplay(true);
            
            // Show brief notification that volumes have been updated
            const volumeNotification = document.createElement('div');
            volumeNotification.style.cssText = `
              position: fixed;
              bottom: 20px;
              right: 20px;
              background: #4CAF50;
              color: white;
              padding: 10px 15px;
              border-radius: 4px;
              z-index: 1001;
              font-size: 14px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              animation: slideInOut 2s ease-in-out;
            `;
            volumeNotification.innerHTML = '📊 Volume totals updated!';
            document.body.appendChild(volumeNotification);
            
            setTimeout(() => {
              if (document.body.contains(volumeNotification)) {
                document.body.removeChild(volumeNotification);
              }
            }, 2000);
            
            hideProcessingIndicator();
          }, 10);
        }
        break;
    }
  });

  // Brush settings controls
  const brushSizeSlider = document.getElementById('brush-size') as HTMLInputElement;
  const brushStrengthSlider = document.getElementById('brush-strength') as HTMLInputElement;
  const brushShapeSelect = document.getElementById('brush-shape') as HTMLSelectElement;
  const brushFalloffSelect = document.getElementById('brush-falloff') as HTMLSelectElement;

  if (brushSizeSlider) {
    brushSizeSlider.addEventListener('input', () => {
      terrain.setBrushSettings({ size: parseFloat(brushSizeSlider.value) });
      updateBrushDisplay();
    });
  }

  if (brushStrengthSlider) {
    brushStrengthSlider.addEventListener('input', () => {
      terrain.setBrushSettings({ strength: parseFloat(brushStrengthSlider.value) });
      modificationStrength = parseFloat(brushStrengthSlider.value);
      updateBrushDisplay();
    });
  }

  if (brushShapeSelect) {
    brushShapeSelect.addEventListener('change', () => {
      terrain.setBrushSettings({ shape: brushShapeSelect.value as 'circle' | 'square' });
      updateBrushDisplay();
    });
  }

  if (brushFalloffSelect) {
    brushFalloffSelect.addEventListener('change', () => {
      terrain.setBrushSettings({ falloff: brushFalloffSelect.value as 'linear' | 'smooth' | 'sharp' });
      updateBrushDisplay();
    });
  }

  // Target elevation controls
  const targetElevationSlider = document.getElementById('target-elevation') as HTMLInputElement;
  const targetElevationValue = document.getElementById('target-elevation-value');

  if (targetElevationSlider && targetElevationValue) {
    targetElevationSlider.addEventListener('input', () => {
      const elevation = parseFloat(targetElevationSlider.value);
      terrain.setTargetElevation(elevation);
      targetElevationValue.textContent = `${elevation.toFixed(1)} ft`;
    });
  }

  // Contour line controls
  const toggleContoursBtn = document.getElementById('toggle-contours-btn') as HTMLButtonElement;
  const contourIntervalSlider = document.getElementById('contour-interval') as HTMLInputElement;
  const contourIntervalValue = document.getElementById('contour-interval-value');
  const dynamicContoursCheckbox = document.getElementById('dynamic-contours-checkbox') as HTMLInputElement;

  if (toggleContoursBtn) {
    toggleContoursBtn.addEventListener('click', () => {
      toggleContourLines();
    });
  }

  if (contourIntervalSlider && contourIntervalValue) {
    contourIntervalSlider.addEventListener('input', () => {
      const interval = parseFloat(contourIntervalSlider.value);
      terrain.setBaseContourInterval(interval);
      contourIntervalValue.textContent = `${interval.toFixed(1)} ft`;
      updateContourStats();
    });
  }

  if (dynamicContoursCheckbox) {
    dynamicContoursCheckbox.addEventListener('change', () => {
      terrain.setDynamicContours(dynamicContoursCheckbox.checked);
      updateContourStats();
    });
  }

  // Tool buttons
  const toolButtons = document.querySelectorAll('.tool-btn');
  toolButtons.forEach(button => {
    const btn = button as HTMLButtonElement;
    const toolName = btn.getAttribute('data-tool');
    if (toolName) {
      btn.addEventListener('click', () => {
        toolManager.setCurrentTool(toolName);
        updateToolDisplay();
        
        // Update brush settings based on tool defaults
        const tool = toolManager.getCurrentTool();
        const settings = tool.getSettings();
        terrain.setBrushSettings({
          size: settings.defaultSize,
          strength: settings.defaultStrength
        });
        updateBrushDisplay();
      });
    }
  });

  const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
  const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;
  const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
  const saveStateBtn = document.getElementById('save-state-btn') as HTMLButtonElement;
  const loadTerrainBtn = document.getElementById('load-terrain-btn') as HTMLButtonElement;
  const assignmentsBtn = document.getElementById('assignments-btn') as HTMLButtonElement;

  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      terrain.undo();
      updateVolumeDisplay();
    });
  }

  if (redoBtn) {
    redoBtn.addEventListener('click', () => {
      terrain.redo();
      updateVolumeDisplay();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const terrainData = terrain.exportTerrain();
      const dataStr = JSON.stringify(terrainData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `terrain_${new Date().toISOString().slice(0,10)}.json`;
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    });
  }

  if (saveStateBtn) {
    saveStateBtn.addEventListener('click', async () => {
      const success = await terrain.saveCurrentState();
      updateVolumeDisplay(); // This will now show 0/0/0
      // Removed: updateArrowCounts(); // This will now show 0 arrows
      
      // Show confirmation message
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${success ? '#4CAF50' : '#F44336'};
        color: white;
        padding: 15px;
        border-radius: 4px;
        z-index: 1001;
        font-family: Arial, sans-serif;
        max-width: 300px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      `;
      
      if (success) {
        notification.innerHTML = `
          <div style="font-size: 18px; margin-bottom: 5px;">💾 State Saved to Database!</div>
          <div style="font-size: 14px;">Current terrain preserved as new baseline</div>
          <div style="font-size: 12px; color: #ddd; margin-top: 5px;">Cut/Fill volumes reset to zero</div>
        `;
      } else {
        notification.innerHTML = `
          <div style="font-size: 18px; margin-bottom: 5px;">❌ Save Failed</div>
          <div style="font-size: 14px;">Could not save to database</div>
          <div style="font-size: 12px; color: #ddd; margin-top: 5px;">Local state still updated</div>
        `;
      }
      
      document.body.appendChild(notification);
      
      // Remove notification after 3 seconds
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 3000);
    });
  }

  if (loadTerrainBtn) {
    loadTerrainBtn.addEventListener('click', async () => {
      try {
        const savedStates = await terrain.getUserTerrainStates();
        if (savedStates.length === 0) {
          alert('No saved terrain states found.');
          return;
        }
        
        // Create a simple selection modal
        const modal = document.createElement('div');
        modal.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
          background: #2a2a2a;
          color: white;
          padding: 20px;
          border-radius: 8px;
          max-width: 500px;
          max-height: 70vh;
          overflow-y: auto;
          font-family: Arial, sans-serif;
        `;
        
        let html = '<h2>📂 Load Saved Terrain</h2>';
        savedStates.forEach(state => {
          const date = new Date(state.created_at).toLocaleString();
          const volume = state.volume_data;
          html += `
            <div style="margin: 10px 0; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px; cursor: pointer;" 
                 onclick="loadSelectedTerrain('${state.id}')">
              <div style="font-weight: bold;">${state.name}</div>
              <div style="font-size: 12px; color: #ccc;">Created: ${date}</div>
              ${volume ? `<div style="font-size: 12px; color: #ccc;">Cut: ${(volume.cut/27).toFixed(1)} yd³, Fill: ${(volume.fill/27).toFixed(1)} yd³</div>` : ''}
            </div>
          `;
        });
        
        html += '<button onclick="closeLoadModal()" style="margin-top: 15px; padding: 10px 20px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>';
        
        content.innerHTML = html;
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Global functions for the modal
        (window as any).loadSelectedTerrain = async (terrainId: string) => {
          const success = await terrain.loadTerrainFromDatabase(terrainId);
          if (success) {
            updateVolumeDisplay();
            // updateArrowCounts();
          }
          document.body.removeChild(modal);
          
          // Show notification
          const notification = document.createElement('div');
          notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${success ? '#4CAF50' : '#F44336'};
            color: white;
            padding: 15px;
            border-radius: 4px;
            z-index: 1001;
            font-family: Arial, sans-serif;
          `;
          notification.textContent = success ? '✅ Terrain Loaded!' : '❌ Load Failed';
          document.body.appendChild(notification);
          
          setTimeout(() => {
            if (document.body.contains(notification)) {
              document.body.removeChild(notification);
            }
          }, 3000);
        };
        
        (window as any).closeLoadModal = () => {
          document.body.removeChild(modal);
        };
        
      } catch (error) {
        console.error('Error loading terrain states:', error);
        alert('Failed to load terrain states.');
      }
    });
  }

  if (assignmentsBtn) {
    assignmentsBtn.addEventListener('click', () => {
      assignmentUI.toggle();
    });
  }

  // Performance control event listeners
  const qualitySelector = document.getElementById('quality-selector') as HTMLSelectElement;
  const autoOptimizeCheckbox = document.getElementById('auto-optimize') as HTMLInputElement;

  if (qualitySelector) {
    qualitySelector.addEventListener('change', (e) => {
      const quality = (e.target as HTMLSelectElement).value as 'low' | 'medium' | 'high' | 'ultra';
      performanceOptimizer.updateConfig({ renderQuality: quality });
    });
  }

  if (autoOptimizeCheckbox) {
    autoOptimizeCheckbox.addEventListener('change', (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      // Auto-optimization is controlled by the performance optimizer internally
    });
  }

  // Listen for performance updates
  window.addEventListener('performanceUpdate', (e: Event) => {
    const metrics = (e as CustomEvent).detail;
    const fpsDisplay = document.getElementById('fps-display');
    if (fpsDisplay) {
      fpsDisplay.textContent = metrics.fps.toFixed(1);
      
      // Color-code FPS
      if (metrics.fps >= 50) {
        fpsDisplay.style.color = '#4CAF50';
      } else if (metrics.fps >= 30) {
        fpsDisplay.style.color = '#FF9800';
      } else {
        fpsDisplay.style.color = '#F44336';
      }
    }
  });
}

// Function to setup UI
function setupUI() {
  // Add UI elements
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <div class="main-panel ui-responsive enhanced-panel" id="main-ui-panel" style="position: fixed; top: 10px; left: 10px; color: white; font-family: Arial; background: rgba(0,0,0,0.8); padding: 15px; border-radius: 8px; min-width: 300px; max-height: 90vh; overflow-y: auto; z-index: 1001; pointer-events: auto;">
      <button id="toggle-menu-btn" style="position: absolute; top: 5px; right: 5px; background: #666; color: white; border: none; border-radius: 4px; padding: 5px 10px; cursor: pointer;">Hide Menu</button>
      <h2>CutFill - Enhanced Terrain System</h2>
      
              <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <strong>User:</strong> <span id="user-info">Loading...</span><br>
          <strong>Connection:</strong> <span id="connection-status">Connecting...</span><br>
          <strong>Session:</strong> <span id="session-status">Not in session</span><br>
          <strong>Players:</strong> <span id="player-list">No players</span>
        </div>
        
        <div class="panel-section" style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <strong>Progress:</strong><br>
          <div id="user-level" style="margin: 5px 0; font-size: 14px; color: #4CAF50;">🌱 Level 1 - Apprentice</div>
          <div style="margin: 5px 0;">
            <div class="enhanced-progress" style="background: rgba(255,255,255,0.2); border-radius: 10px; height: 8px; overflow: hidden;">
              <div id="xp-progress-bar" class="enhanced-progress-fill" style="background: #4CAF50; height: 100%; width: 0%; transition: width 0.3s ease;"></div>
            </div>
            <div id="user-xp" style="font-size: 12px; color: #ccc; margin-top: 2px;">0 / 500 XP</div>
          </div>
          <div id="achievement-count" style="margin: 5px 0; font-size: 12px; color: #FF9800; cursor: pointer;" onclick="showAchievements()">🏆 0/16 Achievements</div>
          <div id="progress-stats" style="margin: 5px 0; font-size: 11px; color: #ddd;">
            <div>📊 Assignments: 0</div>
            <div>🚜 Volume Moved: 0.0 yd³</div>
            <div>🎯 Accuracy: 0.0%</div>
            <div>🔥 Streak: 0</div>
          </div>
                 </div>
       
       <div class="panel-section" style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
         <strong>Performance:</strong><br>
         <div style="display: flex; justify-content: space-between; margin: 5px 0;">
           <span>FPS:</span>
           <span id="fps-display" style="color: #4CAF50;">60</span>
         </div>
         <div style="display: flex; justify-content: space-between; margin: 5px 0;">
           <span>Quality:</span>
           <select id="quality-selector" style="background: rgba(255,255,255,0.1); color: white; border: 1px solid #555; border-radius: 4px; padding: 2px;">
             <option value="low">Low</option>
             <option value="medium" selected>Medium</option>
             <option value="high">High</option>
             <option value="ultra">Ultra</option>
           </select>
         </div>
         <div style="display: flex; justify-content: space-between; margin: 5px 0;">
           <span>Auto-Optimize:</span>
           <label style="display: flex; align-items: center;">
             <input type="checkbox" id="auto-optimize" checked style="margin-right: 5px;">
             <span style="font-size: 12px;">Enabled</span>
           </label>
         </div>
       </div>
       
       <div class="panel-section" style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
         <strong>Cut & Fill Operations:</strong><br>
        <div class="tool-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin: 5px 0;">
          <button class="tool-btn" data-tool="cut" style="padding: 8px; background: #FF4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">⛏️ Cut</button>
          <button class="tool-btn" data-tool="fill" style="padding: 8px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🏔️ Fill</button>
        </div>
        <div class="control-buttons" style="margin: 5px 0;">
          <button id="undo-btn" class="enhanced-button secondary" style="margin: 2px; padding: 5px 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Undo (Ctrl+Z)</button>
          <button id="redo-btn" class="enhanced-button secondary" style="margin: 2px; padding: 5px 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Redo (Ctrl+Shift+Z)</button>
        </div>
        <div id="tool-status" style="margin: 5px 0; font-size: 14px;">Current Tool: ⛏️ Cut</div>
                 <div id="tool-description" style="margin: 5px 0; font-size: 12px; color: #ccc;">Remove earth (excavation)</div>
         <div id="interaction-mode" style="margin: 5px 0; font-size: 12px; color: #4CAF50;">Ready to modify terrain</div>
       </div>
       
       <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
         <strong>UI Settings:</strong><br>
         <div style="display: flex; gap: 5px; margin: 5px 0;">
           <button onclick="toggleAccessibilityPanel()" style="padding: 5px 10px; background: #9C27B0; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">♿ Accessibility</button>
           <button onclick="toggleAgeGroupSelector()" style="padding: 5px 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">👥 Age Mode</button>
           <button onclick="togglePerformanceMonitor()" style="padding: 5px 10px; background: #E91E63; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">📊 Performance</button>
         </div>
         <div style="font-size: 11px; color: #ccc; margin-top: 5px;">
           Keyboard: Alt+A (Accessibility), Alt+G (Age Mode), Ctrl+Shift+P (Performance), F1 (Help)
         </div>
       </div>
      
      <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
        <strong>Brush Settings:</strong><br>
        <div style="margin: 5px 0;">
          <label>Size: <input type="range" id="brush-size" min="1" max="10" step="0.5" value="3" style="width: 100px;"></label>
          <span id="brush-size-value">3</span>
        </div>
        <div style="margin: 5px 0;">
          <label>Strength: <input type="range" id="brush-strength" min="0.1" max="2" step="0.1" value="0.5" style="width: 100px;"></label>
          <span id="brush-strength-value">0.5</span>
        </div>
        <div style="margin: 5px 0;">
          <label>Shape: 
            <select id="brush-shape" style="margin-left: 5px;">
              <option value="circle">Circle</option>
              <option value="square">Square</option>
            </select>
          </label>
        </div>
        <div style="margin: 5px 0;">
          <label>Falloff: 
            <select id="brush-falloff" style="margin-left: 5px;">
              <option value="smooth" selected>Smooth</option>
              <option value="linear">Linear</option>
              <option value="sharp">Sharp</option>
            </select>
          </label>
        </div>
        <div style="margin: 5px 0; font-size: 12px;">Quick Size: 1(1) 2(3) 3(5) 4(8)</div>
        <div style="margin: 5px 0; font-size: 12px;">Shape: C(Circle) V(Square) | Falloff: F(Cycle)</div>
      </div>
      
      <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
        <strong>Cut/Fill Controls:</strong><br>
        <div style="margin: 5px 0;">
          <label>Target Elevation: <input type="range" id="target-elevation" min="-5" max="5" step="0.1" value="0" style="width: 100px;"></label>
          <span id="target-elevation-value">0.0 ft</span>
        </div>
        <div style="margin: 5px 0; font-size: 12px;">
          <div style="display: flex; align-items: center; margin: 2px 0;">
            <div style="width: 12px; height: 12px; background: #4CAF50; margin-right: 5px; border-radius: 2px;"></div>
            <span>High Fill (2+ ft above target)</span>
          </div>
          <div style="display: flex; align-items: center; margin: 2px 0;">
            <div style="width: 12px; height: 12px; background: #FF9800; margin-right: 5px; border-radius: 2px;"></div>
            <span>Medium Fill (0.5-2 ft above)</span>
          </div>
          <div style="display: flex; align-items: center; margin: 2px 0;">
            <div style="width: 12px; height: 12px; background: #FFF59D; margin-right: 5px; border-radius: 2px;"></div>
            <span>Target Zone (±0.5 ft)</span>
          </div>
          <div style="display: flex; align-items: center; margin: 2px 0;">
            <div style="width: 12px; height: 12px; background: #2196F3; margin-right: 5px; border-radius: 2px;"></div>
            <span>Cut Area (below target)</span>
          </div>
        </div>
      </div>
      
      <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
        <strong>Contour Lines:</strong><br>
        <div style="margin: 5px 0;">
          <button id="toggle-contours-btn" style="padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">📈 Hide/Show Contours (N)</button>
        </div>
        <div style="margin: 5px 0;">
          <label style="display: flex; align-items: center;">
            <input type="checkbox" id="dynamic-contours-checkbox" checked style="margin-right: 5px;">
            <span style="font-size: 12px;">🔄 Dynamic (zoom-based)</span>
          </label>
        </div>
        <div style="margin: 5px 0;">
          <label>Base Interval: <input type="range" id="contour-interval" min="0.5" max="5" step="0.5" value="1" style="width: 100px;"></label>
          <span id="contour-interval-value">1.0 ft</span>
        </div>
        <div style="margin: 5px 0; font-size: 12px; color: #ccc;">
          <div id="contour-stats">Contours: 0 lines | Current: 1.0 ft | Zoom: 100</div>
        </div>
        <div style="margin: 5px 0; font-size: 11px; color: #aaa;">
          Dynamic contours adjust detail based on zoom level. Closer view = more lines, further view = fewer lines.
        </div>
      </div>
      
              <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <strong>Controls (Touch & Mouse):</strong>
          <ul style="margin: 5px 0; padding-left: 20px; font-size: 14px;">
            <li><strong>Touch:</strong> One-finger drag: Rotate camera | Two-finger scroll: Zoom</li>
            <li><strong>Trackpad:</strong> Two-finger scroll: Zoom | Two-finger pinch/rotate: Camera control</li>
            <li><strong>Mouse:</strong> Left drag: Rotate camera | Shift+drag: Pan camera | Scroll wheel: Zoom</li>
            <li>Ctrl + drag: Apply current tool</li>
            <li>Q: Cut Tool | E: Fill Tool</li>
            <li>1-4: Brush sizes | C: Circle brush | V: Square brush | F: Cycle falloff</li>
            <li>R: Reset terrain | G: Generate new terrain | W: Wireframe | N: Toggle contours</li>
            <li>Ctrl+S: Save current state | Ctrl+Z: Undo | Ctrl+Shift+Z: Redo | Enter: Apply planned cuts/fills</li>
            <li>A: Assignments | J: Join session | L: Logout</li>
          </ul>
        </div>
      
      <div id="volume-info" style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
        <strong>Volume Analysis:</strong><br>
        Cut: 0.00<br>
        Fill: 0.00<br>
        Net: 0.00
      </div>
      
      <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
        <strong>Terrain Stats:</strong><br>
        <div id="terrain-stats">
          <strong>Dimensions:</strong> 100ft × 100ft<br>
          <strong>Work Area:</strong> 10,000 ft²<br>
          Vertices: 0<br>
          Triangles: 0
        </div>
      </div>
      
             <div style="margin-bottom: 15px;">
         <button id="export-btn" style="width: 100%; padding: 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer;">Export Terrain</button>
       </div>
       
       <div style="margin-bottom: 15px;">
         <button id="save-state-btn" style="width: 100%; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">💾 Save Current State</button>
         <div style="font-size: 11px; color: #ccc; margin-top: 5px; text-align: center;">
           Preserves terrain, resets cut/fill to zero
         </div>
       </div>
       
       <div style="margin-bottom: 15px;">
         <button id="load-terrain-btn" style="width: 100%; padding: 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">📂 Load Saved Terrain</button>
         <div style="font-size: 11px; color: #ccc; margin-top: 5px; text-align: center;">
           Load previous terrain states
         </div>
       </div>
      
       <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
         <strong>Assignments:</strong><br>
         <div style="margin: 5px 0;">
           <button id="assignments-btn" style="width: 100%; padding: 8px; background: #9C27B0; color: white; border: none; border-radius: 4px; cursor: pointer;">📋 View Assignments (A)</button>
         </div>
         <div id="current-assignment" style="margin: 5px 0; font-size: 12px; color: #ccc;">No assignment selected</div>
         <div id="assignment-progress" style="margin: 5px 0; font-size: 12px; color: #ccc; display: none;">Progress: 0%</div>
       </div>
       <div id="water-warning" style="margin: 5px 0; color: #F44336; display: none;">⚠️ Water Hazard Detected</div>
       <div id="assignment-progress-hud" style="margin: 5px 0;">Assignment Progress: 0%</div>
     </div>
   `;

  // Initialize display updates
  updateToolDisplay();
  updateBrushDisplay();
  updateTerrainStats();
  updateInteractionMode(false, false); // Initialize with no modifiers
  updateProgressDisplay(); // Initialize progress display
  updateContourStats(); // Initialize contour line stats
  
  // Initialize UI polish system
  uiPolishSystem.initialize();
  
  // Initialize assignment UI
  assignmentUI.initialize();
  
  // Initialize visual enhancement system
  visualEnhancementSystem.initialize();
  
  // Initialize responsive design system
  responsiveDesignSystem.initialize();
  
  // Initialize performance optimization
  performanceOptimizer.initialize(renderer, scene, camera);
  
  // Initialize enhanced accessibility features
  initializeAccessibilityFeatures();
  
  // Ensure UI stays visible with proper z-index
  const appElement = document.querySelector('#app');
  if (appElement) {
    (appElement as HTMLElement).style.display = 'block';
    (appElement as HTMLElement).style.visibility = 'visible';
    (appElement as HTMLElement).style.opacity = '1';
    (appElement as HTMLElement).style.zIndex = '1001'; // Above auth UI
    (appElement as HTMLElement).style.position = 'relative';
    (appElement as HTMLElement).style.pointerEvents = 'none';
  }
  
  // Hide any auth containers that might be covering the UI
  const authContainers = document.querySelectorAll('#auth-container');
  authContainers.forEach(container => {
    (container as HTMLElement).style.display = 'none';
  });

  // Target elevation controls
  const targetElevationSlider = document.getElementById('target-elevation') as HTMLInputElement;
  const targetElevationValue = document.getElementById('target-elevation-value');

  if (targetElevationSlider && targetElevationValue) {
    targetElevationSlider.addEventListener('input', () => {
      const elevation = parseFloat(targetElevationSlider.value);
      terrain.setTargetElevation(elevation);
      targetElevationValue.textContent = `${elevation.toFixed(1)} ft`;
    });
  }

  // Tool buttons

  const toggleMenuBtn = document.getElementById('toggle-menu-btn') as HTMLButtonElement;
  const mainPanel = document.getElementById('main-ui-panel') as HTMLDivElement;
  let isMenuVisible = true;

  if (toggleMenuBtn && mainPanel) {
    toggleMenuBtn.addEventListener('click', () => {
      isMenuVisible = !isMenuVisible;
      mainPanel.style.display = isMenuVisible ? 'block' : 'none';
      toggleMenuBtn.textContent = isMenuVisible ? 'Hide Menu' : 'Show Menu';
    });
  }

  // --- Planning controls (Save / Cancel) ---
  const planControlsDiv = document.createElement('div');
  planControlsDiv.id = 'plan-controls';
  planControlsDiv.style.margin = '8px 0';
  planControlsDiv.style.display = 'none';
  planControlsDiv.innerHTML = `
    <button id="save-plan-btn" style="padding:6px 12px; background:#4CAF50; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px; margin-right:4px;">✅ Save</button>
    <button id="cancel-plan-btn" style="padding:6px 12px; background:#F44336; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px;">✖ Cancel</button>
  `;
  // Append to Cut/Fill panel (just after tool-status div)
  const toolSection = document.querySelector('#tool-status')?.parentElement;
  toolSection?.appendChild(planControlsDiv);

  const saveBtn = document.getElementById('save-plan-btn') as HTMLButtonElement;
  const cancelBtn = document.getElementById('cancel-plan-btn') as HTMLButtonElement;

  function refreshPlanButtons(){
    const hasPlan = terrain.hasPendingChanges();
    planControlsDiv.style.display = hasPlan ? 'block' : 'none';

    const undoEl = document.getElementById('undo-btn') as HTMLButtonElement;
    const redoEl = document.getElementById('redo-btn') as HTMLButtonElement;

    if(undoEl){ undoEl.disabled = hasPlan; undoEl.style.opacity = hasPlan ? '0.4':'1'; }
    if(redoEl){ redoEl.disabled = hasPlan; redoEl.style.opacity = hasPlan ? '0.4':'1'; }
    const toolBtns = Array.from(document.querySelectorAll('.tool-btn')) as HTMLButtonElement[];
    toolBtns.forEach(btn => { btn.disabled = hasPlan; (btn as HTMLButtonElement).style.opacity = hasPlan? '0.4':'1'; });
  }



  saveBtn?.addEventListener('click', ()=>{
    showProcessingIndicator();
    // Use setTimeout to allow UI to update before processing
    setTimeout(() => {
      terrain.applyPendingChanges();
      refreshPlanButtons();
      // Force immediate volume update to show new cumulative totals
      updateVolumeDisplay(true);
      
      // Show brief notification that volumes have been updated
      const volumeNotification = document.createElement('div');
      volumeNotification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 10px 15px;
        border-radius: 4px;
        z-index: 1001;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        animation: slideInOut 2s ease-in-out;
      `;
      volumeNotification.innerHTML = '📊 Volume totals updated!';
      document.body.appendChild(volumeNotification);
      
      setTimeout(() => {
        if (document.body.contains(volumeNotification)) {
          document.body.removeChild(volumeNotification);
        }
      }, 2000);
      
      hideProcessingIndicator();
    }, 10);
  });
  cancelBtn?.addEventListener('click', ()=>{
    terrain.discardPendingChanges();
    refreshPlanButtons();
  });

  setInterval(refreshPlanButtons, 1000);
  
  // Initialize volume display to show 0,0,0 on fresh load
  updateVolumeDisplay(true); // Force immediate update
}

// Enhanced real-time volume tracking
let lastVolumeUpdate = Date.now();
let lastVolumes = { cut: 0, fill: 0, net: 0 };
let volumeUpdateThrottle: ReturnType<typeof setTimeout> | null = null;
let isRealTimeUpdating = false;

// Real-time volume display with enhanced feedback
function updateVolumeDisplay(forceUpdate = false) {
  // Throttle updates for performance during rapid operations
  if (volumeUpdateThrottle && !forceUpdate) {
    clearTimeout(volumeUpdateThrottle);
  }
  
  volumeUpdateThrottle = setTimeout(() => {
    performVolumeUpdate();
    volumeUpdateThrottle = null;
  }, forceUpdate ? 0 : 100); // 100ms throttle, immediate if forced
}

function performVolumeUpdate() {
  const volumes = terrain.calculateVolumeDifference();
  const info = document.getElementById('volume-info');
  
  if (!info) return;

  // Convert volumes from cubic feet to cubic yards (1 yd³ = 27 ft³)
  const cutYards = volumes.cut / 27;
  const fillYards = volumes.fill / 27;
  const netYards = volumes.net / 27;
  
  // Apply precision threshold to eliminate floating point noise
  const PRECISION_THRESHOLD = 0.001; // 0.001 cubic yards threshold
  
  const volumesYards = {
    cut: Math.abs(cutYards) < PRECISION_THRESHOLD ? 0 : Math.max(0, cutYards),
    fill: Math.abs(fillYards) < PRECISION_THRESHOLD ? 0 : Math.max(0, fillYards),
    net: Math.abs(netYards) < PRECISION_THRESHOLD ? 0 : netYards
  };

  // Calculate change rates in cubic yards
  const now = Date.now();
  const timeDelta = (now - lastVolumeUpdate) / 1000; // Convert to seconds
  const cutRate = timeDelta > 0 ? (volumesYards.cut - (lastVolumes.cut / 27)) / timeDelta : 0;
  const fillRate = timeDelta > 0 ? (volumesYards.fill - (lastVolumes.fill / 27)) / timeDelta : 0;
  
  // Calculate efficiency metrics
  const totalVolume = volumesYards.cut + volumesYards.fill;
  const efficiency = totalVolume > 0 ? (Math.min(volumesYards.cut, volumesYards.fill) / Math.max(volumesYards.cut, volumesYards.fill)) * 100 : 0;
  const netBalance = Math.abs(volumesYards.net);
  const balanceStatus = netBalance < 0.1 ? '✅ Balanced' : netBalance < 0.5 ? '⚠️ Minor Imbalance' : '❌ Major Imbalance';
  
  // Determine activity status (threshold adjusted for cubic yards)
  const isActive = Math.abs(cutRate) > 0.01 || Math.abs(fillRate) > 0.01;
  const activityIndicator = isActive ? '🔄' : '⏸️';
  
  // Calculate total rate of earthwork
  const totalRate = Math.abs(cutRate) + Math.abs(fillRate);
  const rateDisplay = totalRate > 0.01 ? `📊 ${totalRate.toFixed(2)} yd³/s` : '';
  
  // Enhanced visual feedback with animations
  const cutColor = cutRate > 0.01 ? '#1976D2' : '#2196F3'; // Brighter when actively cutting
  const fillColor = fillRate > 0.01 ? '#C62828' : '#D32F2F'; // Brighter when actively filling
  
  info.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
      <strong>Volume Analysis</strong>
      <div style="font-size: 12px; color: ${isActive ? '#4CAF50' : '#666'};">
        ${activityIndicator} ${isActive ? 'Active' : 'Idle'}
      </div>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 8px 0;">
      <div style="text-align: center; padding: 5px; background: rgba(33, 150, 243, 0.2); border-radius: 4px; ${cutRate > 0.01 ? 'box-shadow: 0 0 10px rgba(33, 150, 243, 0.4);' : ''}">
        <div style="font-size: 16px; font-weight: bold; color: ${cutColor};">📉 CUT</div>
        <div style="font-size: 14px; font-weight: bold;">${volumesYards.cut.toFixed(2)} yd³</div>
        ${cutRate > 0.01 ? `<div style="font-size: 10px; color: #1976D2;">+${cutRate.toFixed(2)}/s</div>` : ''}
      </div>
      <div style="text-align: center; padding: 5px; background: rgba(211, 47, 47, 0.2); border-radius: 4px; ${fillRate > 0.01 ? 'box-shadow: 0 0 10px rgba(211, 47, 47, 0.4);' : ''}">
        <div style="font-size: 16px; font-weight: bold; color: ${fillColor};">📈 FILL</div>
        <div style="font-size: 14px; font-weight: bold;">${volumesYards.fill.toFixed(2)} yd³</div>
        ${fillRate > 0.01 ? `<div style="font-size: 10px; color: #C62828;">+${fillRate.toFixed(2)}/s</div>` : ''}
      </div>
    </div>
    <div style="margin: 8px 0; padding: 5px; background: rgba(255,255,255,0.1); border-radius: 4px;">
      <div style="display: flex; justify-content: space-between;">
        <span><strong>Net:</strong> ${volumesYards.net.toFixed(2)} yd³</span>
        ${rateDisplay ? `<span style="color: #4CAF50;">${rateDisplay}</span>` : ''}
      </div>
      <div style="margin-top: 3px;">
        <strong>Efficiency:</strong> ${efficiency.toFixed(1)}% | 
        <strong>Balance:</strong> ${balanceStatus}
      </div>
    </div>
  `;

  // Store for next comparison
  lastVolumes = { ...volumes };
  lastVolumeUpdate = now;

  updateTerrainStats();

  // Send volume update to multiplayer if in session
  if (multiplayerManager.isInSession()) {
    multiplayerManager.sendVolumeUpdate(volumesYards);
  }
}

// Enhanced real-time volume updates during operations
function startRealTimeVolumeUpdates() {
  if (isRealTimeUpdating) return;
  
  isRealTimeUpdating = true;
  const updateInterval = setInterval(() => {
    if (isModifying) {
      performVolumeUpdate();
    } else if (!isModifying && isRealTimeUpdating) {
      // Stop real-time updates when not modifying
      clearInterval(updateInterval);
      isRealTimeUpdating = false;
      // Final update
      performVolumeUpdate();
    }
  }, 150); // Update every 150ms during active modification
}

// Preview volume calculation for operation planning
function calculatePreviewVolume(point: THREE.Vector3): { cutPreview: number; fillPreview: number } {
  const currentTool = toolManager.getCurrentTool();
  const toolSettings = currentTool.getSettings();
  const brushSettings = terrain.getBrushSettings();
  
  // Estimate volume change based on brush settings and shape
  const brushRadius = brushSettings.size;
  let brushArea: number;
  
  // Calculate area based on brush shape
  if (brushSettings.shape === 'square') {
    // Square area: (2 * radius)^2
    brushArea = (brushRadius * 2) * (brushRadius * 2);
  } else {
    // Circular area: π * radius^2
    brushArea = Math.PI * brushRadius * brushRadius;
  }
  
  const operationDepth = brushSettings.strength * modificationStrength * 3;
  const estimatedVolumeFt3 = brushArea * operationDepth;
  
  // Convert from cubic feet to cubic yards (1 yd³ = 27 ft³)
  const estimatedVolumeYd3 = estimatedVolumeFt3 / 27;
  
  if (toolSettings.name === 'cut') {
    return { cutPreview: estimatedVolumeYd3, fillPreview: 0 };
  } else {
    return { cutPreview: 0, fillPreview: estimatedVolumeYd3 };
  }
}

// Update tool display
function updateToolDisplay() {
  const toolStatus = document.getElementById('tool-status');
  const toolDescription = document.getElementById('tool-description');
  const currentTool = toolManager.getCurrentTool();
  const currentToolName = toolManager.getCurrentToolName();
  
  if (toolStatus) {
    toolStatus.innerHTML = `Current Tool: ${currentTool.getIcon()} ${currentTool.getDisplayName()}`;
  }
  
  if (toolDescription) {
    toolDescription.textContent = currentTool.getSettings().description;
  }
  
  // Update all tool buttons
  const toolButtons = document.querySelectorAll('.tool-btn');
  toolButtons.forEach(button => {
    const btn = button as HTMLButtonElement;
    const toolName = btn.getAttribute('data-tool');
    if (toolName === currentToolName) {
      btn.style.background = currentTool.getColor();
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1.05)';
    } else {
      btn.style.background = '#666';
      btn.style.opacity = '0.7';
      btn.style.transform = 'scale(1)';
    }
  });
}

// Update overlay button states to match terrain overlay visibility
function updateOverlayButtonStates() {
  const toggleOverlayBtn = document.getElementById('toggle-overlay-btn') as HTMLButtonElement;
  const toggleFillOverlayBtn = document.getElementById('toggle-fill-overlay-btn') as HTMLButtonElement;
  
  if (terrain && toggleOverlayBtn && toggleFillOverlayBtn) {
    // Update original overlay button
    const originalVisible = terrain.isOriginalTerrainOverlayVisible();
    toggleOverlayBtn.textContent = originalVisible ? 'Hide Original' : 'Show Original';
    toggleOverlayBtn.style.background = originalVisible ? '#FF4444' : '#4CAF50';
    
    // Update fill overlay button  
    const fillVisible = terrain.isFillVolumeOverlayVisible();
    toggleFillOverlayBtn.textContent = fillVisible ? 'Hide Fill' : 'Show Fill';
    toggleFillOverlayBtn.style.background = fillVisible ? '#4444FF' : '#4CAF50';
  }
}

// Update brush display
function updateBrushDisplay() {
  const brushSettings = terrain.getBrushSettings();
  
  const sizeValue = document.getElementById('brush-size-value');
  const strengthValue = document.getElementById('brush-strength-value');
  const sizeSlider = document.getElementById('brush-size') as HTMLInputElement;
  const strengthSlider = document.getElementById('brush-strength') as HTMLInputElement;
  const shapeSelect = document.getElementById('brush-shape') as HTMLSelectElement;
  const falloffSelect = document.getElementById('brush-falloff') as HTMLSelectElement;
  
  if (sizeValue) sizeValue.textContent = brushSettings.size.toString();
  if (strengthValue) strengthValue.textContent = brushSettings.strength.toString();
  if (sizeSlider) sizeSlider.value = brushSettings.size.toString();
  if (strengthSlider) strengthSlider.value = brushSettings.strength.toString();
  if (shapeSelect) shapeSelect.value = brushSettings.shape;
  if (falloffSelect) falloffSelect.value = brushSettings.falloff;
}

// Update terrain stats
function updateTerrainStats() {
  const stats = terrain.getStats();
  const statsDiv = document.getElementById('terrain-stats');
  
  if (statsDiv) {
    statsDiv.innerHTML = `
      Vertices: ${stats.vertexCount}<br>
      Triangles: ${stats.triangleCount}
    `;
  }
}

// Update contour line stats
function updateContourStats() {
  const contourSettings = terrain.getContourSettings();
  const dynamicSettings = terrain.getDynamicContourSettings();
  const statsDiv = document.getElementById('contour-stats');
  
  if (statsDiv) {
    const zoomLevel = Math.round((500 - dynamicSettings.cameraDistance) / 4); // Convert distance to zoom percentage
    const currentInterval = dynamicSettings.currentInterval.toFixed(2);
    const lineCount = contourSettings.count;
    const labelCount = contourSettings.labelCount;
    
    if (dynamicSettings.dynamic) {
      statsDiv.innerHTML = `Contours: ${lineCount} lines, ${labelCount} labels | Current: ${currentInterval} ft | Zoom: ${Math.max(0, zoomLevel)}%`;
    } else {
      statsDiv.innerHTML = `Contours: ${lineCount} lines, ${labelCount} labels | Fixed: ${currentInterval} ft | Static mode`;
    }
  }
}

// Update interaction mode display
function updateInteractionMode(shiftKey: boolean, ctrlKey: boolean, gestureState?: GestureState) {
  const modeDiv = document.getElementById('interaction-mode');
  if (modeDiv) {
    let statusText = '';
    let statusColor = '#4CAF50';
    
    if (gestureState) {
      // Handle gesture modes
      if (gestureState.gestureMode === 'rotation') {
        statusText = '🔄 Two-finger rotation';
        statusColor = '#FF9800';
      } else if (gestureState.gestureMode === 'zoom') {
        statusText = '🔍 Two-finger zoom';
        statusColor = '#2196F3';
      } else {
        statusText = '🔧 Ready to modify terrain';
        statusColor = '#4CAF50';
      }
    } else if (shiftKey) {
      statusText = '🚚 Pan camera mode (Shift+drag to pan)';
      statusColor = '#9C27B0';
    } else if (ctrlKey) {
      statusText = '🔧 Tool application mode';
      statusColor = '#4CAF50';
    } else {
      statusText = '🔄 Camera rotation mode (Left-drag to rotate)';
      statusColor = '#FF9800';
    }
    
    // Add zoom level indicator
    if (gestureControls) {
      const distance = gestureControls.getDistance();
      const zoomLevel = Math.round(((100 - distance) / 90) * 100); // Convert distance to zoom percentage
      statusText += ` | 🔍 Zoom: ${Math.max(0, zoomLevel)}%`;
    }
    
    modeDiv.innerHTML = statusText;
    modeDiv.style.color = statusColor;
  }
}

// Update progress display
function updateProgressDisplay() {
  const userProgress = progressTracker.getUserProgress();
  if (!userProgress) return;
  
  const currentLevel = progressTracker.getCurrentLevel();
  const nextLevel = progressTracker.getNextLevel();
  const progressToNext = progressTracker.getProgressToNextLevel();
  
  // Update level display
  const levelDiv = document.getElementById('user-level');
  if (levelDiv && currentLevel) {
    levelDiv.innerHTML = `${currentLevel.badge} Level ${currentLevel.level} - ${currentLevel.title}`;
  }
  
  // Update XP display
  const xpDiv = document.getElementById('user-xp');
  if (xpDiv) {
    if (nextLevel) {
      xpDiv.innerHTML = `${userProgress.currentXP} / ${nextLevel.xpRequired - progressTracker.getCurrentLevel()!.xpRequired} XP`;
    } else {
      xpDiv.innerHTML = `${userProgress.totalXP} XP (Max Level)`;
    }
  }
  
  // Update progress bar
  const progressBar = document.getElementById('xp-progress-bar');
  if (progressBar) {
    progressBar.style.width = `${progressToNext}%`;
  }
  
  // Update achievement count
  const achievementDiv = document.getElementById('achievement-count');
  if (achievementDiv) {
    const unlockedCount = progressTracker.getUnlockedAchievements().length;
    const totalCount = progressTracker.getAchievements().length;
    achievementDiv.innerHTML = `🏆 ${unlockedCount}/${totalCount} Achievements`;
  }
  
  // Update stats
  const statsDiv = document.getElementById('progress-stats');
  if (statsDiv) {
    statsDiv.innerHTML = `
      <div>📊 Assignments: ${userProgress.assignmentsCompleted}</div>
                  <div>🚜 Volume Moved: ${userProgress.totalVolumeMovedCubicYards.toFixed(1)} yd³</div>
      <div>🎯 Accuracy: ${userProgress.averageAccuracy.toFixed(1)}%</div>
      <div>🔥 Streak: ${userProgress.currentStreak}</div>
    `;
  }
}

// Achievement system functions
function showAchievements() {
  const modal = document.createElement('div');
  modal.id = 'achievements-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: #2a2a2a;
    color: white;
    padding: 20px;
    border-radius: 8px;
    max-width: 700px;
    max-height: 80vh;
    overflow-y: auto;
    font-family: Arial, sans-serif;
  `;

  const unlockedAchievements = progressTracker.getUnlockedAchievements();
  const availableAchievements = progressTracker.getAvailableAchievements();
  
  let html = '<h2>🏆 Achievements</h2>';
  
  if (unlockedAchievements.length > 0) {
    html += '<h3 style="color: #4CAF50;">Unlocked</h3>';
    unlockedAchievements.forEach(achievement => {
      html += `
        <div style="margin: 10px 0; padding: 10px; background: rgba(76, 175, 80, 0.2); border-radius: 4px; border-left: 4px solid #4CAF50;">
          <div style="font-size: 16px; margin-bottom: 5px;">${achievement.icon} ${achievement.name}</div>
          <div style="font-size: 14px; color: #ccc; margin-bottom: 3px;">${achievement.description}</div>
          <div style="font-size: 12px; color: #4CAF50;">+${achievement.xpReward} XP</div>
        </div>
      `;
    });
  }
  
  if (availableAchievements.length > 0) {
    html += '<h3 style="color: #FF9800;">Available</h3>';
    availableAchievements.forEach(achievement => {
      html += `
        <div style="margin: 10px 0; padding: 10px; background: rgba(255, 255, 255, 0.05); border-radius: 4px; border-left: 4px solid #666;">
          <div style="font-size: 16px; margin-bottom: 5px;">${achievement.icon} ${achievement.name}</div>
          <div style="font-size: 14px; color: #ccc; margin-bottom: 3px;">${achievement.description}</div>
          <div style="font-size: 12px; color: #FF9800;">+${achievement.xpReward} XP</div>
        </div>
      `;
    });
  }

  html += '<button onclick="closeAchievementsModal()" style="margin-top: 15px; padding: 10px 20px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>';
  
  content.innerHTML = html;
  modal.appendChild(content);
  document.body.appendChild(modal);

  (window as any).showAchievements = showAchievements;
  (window as any).closeAchievementsModal = () => {
    const modal = document.getElementById('achievements-modal');
    if (modal) {
      document.body.removeChild(modal);
    }
  };
}

// Assignment system functions
async function loadAssignments() {
  try {
    const assignments = await assignmentManager.getAvailableAssignments();
    showAssignmentModal(assignments);
  } catch (error) {
    console.error('Failed to load assignments:', error);
  }
}

function showAssignmentModal(assignments: any[]) {
  const modal = document.createElement('div');
  modal.id = 'assignment-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: #2a2a2a;
    color: white;
    padding: 20px;
    border-radius: 8px;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
    font-family: Arial, sans-serif;
  `;

  let html = '<h2>📋 Available Assignments</h2>';
  
  assignments.forEach((assignment, index) => {
    const difficultyStars = '⭐'.repeat(assignment.difficulty);
    html += `
      <div style="margin: 15px 0; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 4px; cursor: pointer;" 
           onclick="selectAssignment('${assignment.id}')">
        <h3>${assignment.name} ${difficultyStars}</h3>
        <p style="margin: 5px 0; color: #ccc;">${assignment.description}</p>
        <div style="font-size: 12px; color: #999;">
          <span>⏱️ Est. ${assignment.estimatedTime}min</span>
          <span style="margin-left: 15px;">🎯 ${assignment.objectives?.length || 0} objectives</span>
        </div>
      </div>
    `;
  });

  html += '<button onclick="closeAssignmentModal()" style="margin-top: 15px; padding: 10px 20px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>';
  
  content.innerHTML = html;
  modal.appendChild(content);
  document.body.appendChild(modal);

  // Make selectAssignment globally accessible
  (window as any).selectAssignment = async (assignmentId: string) => {
    await startAssignment(assignmentId);
    (window as any).closeAssignmentModal();
  };

  (window as any).closeAssignmentModal = () => {
    const modal = document.getElementById('assignment-modal');
    if (modal) {
      document.body.removeChild(modal);
    }
  };
}

async function startAssignment(assignmentId: string) {
  // Get current user (simplified for demo)
  const userId = 'current-user'; // In real app, get from auth
  
  const started = await assignmentManager.startAssignment(assignmentId, userId);
  if (started) {
    const assignment = assignmentManager.getCurrentAssignment();
    if (assignment) {
      const currentAssignmentDiv = document.getElementById('current-assignment');
      if (currentAssignmentDiv) {
        currentAssignmentDiv.innerHTML = `📋 ${assignment.name}`;
      }
      
      const progressDiv = document.getElementById('assignment-progress');
      if (progressDiv) {
        progressDiv.style.display = 'block';
        progressDiv.innerHTML = 'Progress: 0%';
      }
    }
  }
}

function updateAssignmentProgress(progress: any) {
  const progressDiv = document.getElementById('assignment-progress');
  if (progressDiv) {
    progressDiv.innerHTML = `Progress: ${Math.round(progress.currentScore)}%`;
    
    // Update objective completion
    const completed = progress.objectives.filter((obj: any) => obj.completed).length;
    const total = progress.objectives.length;
    progressDiv.innerHTML += ` (${completed}/${total} objectives)`;
  }
}

function showObjectiveComplete(objective: any) {
  // Create a temporary notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4CAF50;
    color: white;
    padding: 15px;
    border-radius: 4px;
    z-index: 1001;
    font-family: Arial, sans-serif;
    max-width: 300px;
  `;
  
  notification.innerHTML = `
    <strong>🎯 Objective Complete!</strong><br>
    ${objective.description}<br>
    <small>Score: ${Math.round(objective.score)}%</small>
  `;
  
  document.body.appendChild(notification);
  
  // Remove after 4 seconds
  setTimeout(() => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  }, 4000);
}

function showAssignmentComplete(progress: any) {
  // Create completion modal
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: #2a2a2a;
    color: white;
    padding: 30px;
    border-radius: 8px;
    text-align: center;
    max-width: 400px;
    font-family: Arial, sans-serif;
  `;

  const assignment = assignmentManager.getCurrentAssignment();
  const score = Math.round(progress.currentScore);
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  
  content.innerHTML = `
    <h2>🎉 Assignment Complete!</h2>
    <h3>${assignment?.name}</h3>
    <div style="font-size: 48px; margin: 20px 0; color: #4CAF50;">${grade}</div>
    <div style="font-size: 24px; margin: 10px 0;">Final Score: ${score}%</div>
    <div style="margin: 15px 0; font-size: 14px; color: #ccc;">
      Objectives completed: ${progress.objectives.filter((obj: any) => obj.completed).length}/${progress.objectives.length}
    </div>
    <button onclick="closeCompletionModal()" style="margin-top: 20px; padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Continue</button>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  (window as any).closeCompletionModal = () => {
    document.body.removeChild(modal);
    
    // Reset assignment display
    const currentAssignmentDiv = document.getElementById('current-assignment');
    if (currentAssignmentDiv) {
      currentAssignmentDiv.innerHTML = 'No assignment selected';
    }
    
    const progressDiv = document.getElementById('assignment-progress');
    if (progressDiv) {
      progressDiv.style.display = 'none';
    }
  };
}

// Progress tracking notification functions
function showLevelUp(newLevel: any, oldLevel: any) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 20px;
    border-radius: 8px;
    z-index: 1001;
    font-family: Arial, sans-serif;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  
  notification.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 10px;">🎉 Level Up!</div>
    <div style="font-size: 20px; margin-bottom: 5px;">${newLevel.badge} ${newLevel.title}</div>
    <div style="font-size: 14px; margin-bottom: 10px;">${newLevel.description}</div>
    <div style="font-size: 12px; color: #ddd;">
      Unlocked: ${newLevel.unlocks.join(', ')}
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Remove after 5 seconds
  setTimeout(() => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  }, 5000);
  
  // Update progress display
  updateProgressDisplay();
}

function showAchievementUnlocked(achievement: any) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
    padding: 20px;
    border-radius: 8px;
    z-index: 1001;
    font-family: Arial, sans-serif;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  
  notification.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 10px;">🏆 Achievement Unlocked!</div>
    <div style="font-size: 18px; margin-bottom: 5px;">${achievement.icon} ${achievement.name}</div>
    <div style="font-size: 14px; margin-bottom: 10px;">${achievement.description}</div>
    <div style="font-size: 12px; color: #ddd;">
      +${achievement.xpReward} XP
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Remove after 4 seconds
  setTimeout(() => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  }, 4000);
  
  // Update progress display
  updateProgressDisplay();
}

function showXPGained(xp: number, source: string) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
    color: white;
    padding: 15px;
    border-radius: 8px;
    z-index: 1001;
    font-family: Arial, sans-serif;
    max-width: 250px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  
  notification.innerHTML = `
    <div style="font-size: 18px; margin-bottom: 5px;">✨ +${xp} XP</div>
    <div style="font-size: 14px; color: #ddd;">${source}</div>
  `;
  
  document.body.appendChild(notification);
  
  // Remove after 2 seconds
  setTimeout(() => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  }, 2000);
  
  // Update progress display
  updateProgressDisplay();
}

// Operation Preview System Functions
function showOperationPreview(point: THREE.Vector3): void {
  if (!point || (lastPreviewPosition && point.distanceTo(lastPreviewPosition) < 0.5)) {
    return; // Don't update if position hasn't changed much
  }
  
  hideOperationPreview(); // Remove existing preview
  
  const currentTool = toolManager.getCurrentTool();
  const toolSettings = currentTool.getSettings();
  const brushSettings = terrain.getBrushSettings();
  
  // Calculate operation depth/height based on strength
  const operationDepth = brushSettings.strength * modificationStrength * 3; // Increased scale for better visibility
  const terrainHeight = point.y;
  
  // Create volumetric preview based on tool type
  let previewGeometry: THREE.BufferGeometry;
  let previewHeight: number;
  let previewY: number;
  
  if (toolSettings.name === 'cut') {
    // Cut operation: Show volume below terrain surface that will be removed
    previewHeight = operationDepth;
    previewY = terrainHeight - (previewHeight / 2); // Center the volume below surface
    
    // Create cut volume geometry
    if (brushSettings.shape === 'circle') {
      previewGeometry = new THREE.CylinderGeometry(
        brushSettings.size * 0.8, // Top radius (smaller for realistic excavation)
        brushSettings.size,       // Bottom radius 
        previewHeight,           // Height of cut volume
        16                       // Radial segments
      );
    } else {
      previewGeometry = new THREE.BoxGeometry(
        brushSettings.size * 2,  // Width
        previewHeight,          // Height of cut volume
        brushSettings.size * 2   // Depth
      );
    }
  } else {
    // Fill operation: Show volume above terrain surface that will be added
    previewHeight = operationDepth;
    previewY = terrainHeight + (previewHeight / 2); // Center the volume above surface
    
    // Create fill volume geometry
    if (brushSettings.shape === 'circle') {
      previewGeometry = new THREE.CylinderGeometry(
        brushSettings.size,       // Top radius
        brushSettings.size * 0.8, // Bottom radius (smaller at base for realistic fill)
        previewHeight,           // Height of fill volume
        16                       // Radial segments
      );
    } else {
      previewGeometry = new THREE.BoxGeometry(
        brushSettings.size * 2,  // Width
        previewHeight,          // Height of fill volume
        brushSettings.size * 2   // Depth
      );
    }
  }
  
  // Create preview material with tool-specific properties
  const toolColor = new THREE.Color(toolSettings.color);
  const previewMaterial = new THREE.MeshBasicMaterial({
    color: toolColor,
    transparent: true,
    opacity: 0.35,
    wireframe: false,
    side: THREE.DoubleSide // Show both sides for better volume visualization
  });
  
  previewMesh = new THREE.Mesh(previewGeometry, previewMaterial);
  previewMesh.position.set(point.x, previewY, point.z);
  
  // Add wireframe overlay for better volume definition
  const wireframeGeometry = previewGeometry.clone();
  const wireframeMaterial = new THREE.LineBasicMaterial({
    color: toolColor,
    transparent: true,
    opacity: 0.6,
    linewidth: 1
  });
  
  const wireframeHelper = new THREE.WireframeGeometry(wireframeGeometry);
  const wireframeMesh = new THREE.LineSegments(wireframeHelper, wireframeMaterial);
  wireframeMesh.position.copy(previewMesh.position);
  
  // Store both meshes for cleanup
  (previewMesh as any).wireframeMesh = wireframeMesh;
  
  // Add subtle pulsing animation for better visibility
  const time = Date.now() * 0.002;
  previewMaterial.opacity = 0.25 + 0.15 * Math.sin(time);
  wireframeMaterial.opacity = 0.4 + 0.2 * Math.sin(time);
  
  scene.add(previewMesh);
  scene.add(wireframeMesh);
  lastPreviewPosition = point.clone();
  isPreviewMode = true;
}

function hideOperationPreview(): void {
  if (previewMesh) {
    scene.remove(previewMesh);
    
    // Remove wireframe mesh if it exists
    const wireframeMesh = (previewMesh as any).wireframeMesh;
    if (wireframeMesh) {
      scene.remove(wireframeMesh);
      if (wireframeMesh.geometry) {
        wireframeMesh.geometry.dispose();
      }
      if (wireframeMesh.material && typeof wireframeMesh.material.dispose === 'function') {
        wireframeMesh.material.dispose();
      }
    }
    
    if (previewMesh.geometry) {
      previewMesh.geometry.dispose();
    }
    if (previewMesh.material && typeof (previewMesh.material as THREE.Material).dispose === 'function') {
      (previewMesh.material as THREE.Material).dispose();
    }
    previewMesh = null;
  }
  isPreviewMode = false;
  lastPreviewPosition = null;
}

// Update preview animation in render loop
function updateOperationPreview(): void {
  if (isPreviewMode && previewMesh) {
    const time = Date.now() * 0.002;
    const material = previewMesh.material as THREE.MeshBasicMaterial;
    material.opacity = 0.25 + 0.15 * Math.sin(time);
    
    // Update wireframe opacity if it exists
    const wireframeMesh = (previewMesh as any).wireframeMesh;
    if (wireframeMesh) {
      const wireframeMaterial = wireframeMesh.material as THREE.LineBasicMaterial;
      wireframeMaterial.opacity = 0.4 + 0.2 * Math.sin(time);
      
      // Sync rotation
      wireframeMesh.rotation.copy(previewMesh.rotation);
    }
    
    // Gentle rotation for better volume visibility
    previewMesh.rotation.y += 0.008;
  }
}

// Accessibility helper functions
function hideKeyboardInstructions() {
  const panel = document.getElementById('keyboard-instructions-panel');
  if (panel) {
    panel.style.display = 'none';
  }
}

// Initialize accessibility features
function initializeAccessibilityFeatures() {
  // This function is called from setupUI but was missing
  // The actual accessibility features are handled by uiPolishSystem
  console.log('Accessibility features initialized');
}