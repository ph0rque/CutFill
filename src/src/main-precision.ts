import './style.css';
import * as THREE from 'three';
import { Terrain } from './terrain';
import { PrecisionToolManager } from './precision-tools';
import { PrecisionUI } from './precision-ui';
import { ViewControls } from './view-controls';
import { AssignmentManager } from './assignments';
import { AssignmentUI } from './assignment-ui';
import { AuthService } from './auth';
import { AuthUI } from './auth-ui';
import { GuestUI } from './guest-ui';
import { supabase } from './supabase';

// Global variables
let isGameReady = false;
let terrain: Terrain;
let precisionToolManager: PrecisionToolManager;
let precisionUI: PrecisionUI;
let viewControls: ViewControls;
let assignmentManager: AssignmentManager;
let assignmentUI: AssignmentUI;
let scaleReferences: { markers: THREE.Group };

// Camera control variables
const cameraTarget = new THREE.Vector3(0, 0, 0);
const panSpeed = 0.5;

// Create basic Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// Create renderer
let renderer: THREE.WebGLRenderer;

try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: false,
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x87ceeb); // Sky blue background
  renderer.setPixelRatio(window.devicePixelRatio);
} catch (error) {
  console.error('Failed to create WebGL renderer:', error);
  renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x87ceeb);
}

// Add canvas to DOM and ensure it's properly positioned
const canvas = renderer.domElement;
canvas.style.position = 'fixed';
canvas.style.top = '0';
canvas.style.left = '0';
canvas.style.zIndex = '1';
canvas.style.pointerEvents = 'auto';
document.body.appendChild(canvas);

// Set up camera - pull back further to ensure terrain is visible
camera.position.set(0, 50, 80);
camera.lookAt(0, 0, 0);

// Add lighting - make it brighter
const ambientLight = new THREE.AmbientLight(0x404040, 1.0); // Increased intensity
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Increased intensity
directionalLight.position.set(50, 100, 50);
directionalLight.castShadow = false; // Disable shadows for now
scene.add(directionalLight);

// Initialize the game
function initializeGame(): void {
  if (isGameReady) return;

  console.log('Initializing precision cut/fill system...');

  try {
    // Create terrain
    terrain = new Terrain();
    const terrainMesh = terrain.getMesh();
    scene.add(terrainMesh);

    console.log('Terrain created and added to scene');
    console.log('Terrain mesh type:', terrainMesh.type);
    console.log('Terrain children count:', terrainMesh.children?.length || 0);
    console.log('Scene children count:', scene.children.length);

    // Set camera reference for terrain
    terrain.setCameraReference(camera);

    // Force terrain colors update
    terrain.updateTerrainColors();

    // Add scale reference markers and axes
    scaleReferences = addScaleReferences(scene);

    // Create precision tools
    precisionToolManager = new PrecisionToolManager(terrain, scene, camera);

    // Create auth service
    const authService = new AuthService();

    precisionUI = new PrecisionUI(precisionToolManager, authService);

    // Create view controls
    viewControls = new ViewControls(camera, scene);

    // Create assignment manager and UI
    assignmentManager = new AssignmentManager(terrain);
    assignmentUI = new AssignmentUI(assignmentManager);

    // Make precisionUI and scaleReferences globally available for UI callbacks
    (window as any).precisionUI = precisionUI;
    (window as any).scaleReferences = scaleReferences;
    (window as any).viewControls = viewControls;
    (window as any).assignmentManager = assignmentManager;
    (window as any).assignmentUI = assignmentUI;
    (window as any).cameraTarget = cameraTarget;

    // Expose terrain for testing
    (window as any).terrain = terrain;

    // Initialize labels button when available and ensure proper label visibility sync
    setTimeout(() => {
      precisionUI.updateLabelsButton();
      // Ensure contour labels respect the current toggle state
      const terrain = precisionToolManager.getTerrain();
      if (terrain) {
        console.log('Syncing label visibility on startup');
        terrain.setContourLabelsVisible((precisionUI as any).labelsVisible);
      }
    }, 500);

    // Initialize assignment UI
    assignmentUI.initialize();

    // Show persistent assignment progress panel if assignment is active
    setTimeout(() => {
      const currentAssignment = assignmentManager.getCurrentAssignment();
      if (currentAssignment) {
        assignmentUI.showPersistentProgress();
      }
    }, 100);

    // Set up controls
    setupControls();

    // Start render loop
    animate();

    isGameReady = true;
    console.log('Precision cut/fill system ready!');

    // Log scene information for debugging
    console.log('Final scene info:');
    console.log('- Scene children:', scene.children.length);
    console.log('- Camera position:', camera.position);
    console.log('- Renderer size:', renderer.getSize(new THREE.Vector2()));
  } catch (error) {
    console.error('Error during game initialization:', error);
  }
}

// Function to add scale references to the scene
function addScaleReferences(scene: THREE.Scene): { markers: THREE.Group } {
  // Add scale markers with axis lines
  const markerGroup = new THREE.Group();

  // Add coordinate markers at terrain perimeter
  addCoordinateMarkers(scene);

  // These will be dynamically positioned based on camera angle
  updateAxisPosition(markerGroup, camera);

  scene.add(markerGroup);

  return { markers: markerGroup };
}

// Function to add coordinate markers at terrain perimeter
function addCoordinateMarkers(scene: THREE.Scene): void {
  const terrainSize = 120; // 120ft = 40yd x 40yd terrain

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

        // Add distance text
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

// Function to update axis position based on camera rotation
function updateAxisPosition(
  markerGroup: THREE.Group,
  camera: THREE.PerspectiveCamera
): void {
  // Clear existing markers
  markerGroup.clear();

  // Get camera direction to determine which corner to place axes
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);

  // Calculate camera distance for dynamic scaling
  const cameraDistance = camera.position.distanceTo(
    new THREE.Vector3(50, 0, 50)
  ); // Center of terrain

  // Determine corner position based on camera view (terrain spans 0,0 to 120,120)
  let cornerX = 0; // Near corner (origin)
  let cornerZ = 0; // Near corner (origin)

  // Adjust corner based on camera direction to show axes at visible corner
  if (cameraDirection.x > 0) cornerX = 100; // Switch to far corner X if looking from negative X
  if (cameraDirection.z > 0) cornerZ = 100; // Switch to far corner Z if looking from negative Z

  const axisY = 2; // Height above terrain
  const axisLength = 20; // Axis length

  // Calculate dynamic segment spacing based on zoom level
  let segmentSpacing = 10; // Default 10ft segments
  if (cameraDistance < 25) {
    segmentSpacing = 1; // 1ft segments when very zoomed in
  } else if (cameraDistance < 50) {
    segmentSpacing = 5; // 5ft segments when zoomed in
  } else if (cameraDistance > 200) {
    segmentSpacing = 25; // 25ft segments when zoomed out
  }

  // Helper function to create text markers
  function createTextMarker(
    text: string,
    x: number,
    y: number,
    z: number,
    color: string = '#000000'
  ): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = 192;
    canvas.height = 96;

    // Style matching contours
    context.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent black
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Add border
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.strokeRect(0, 0, canvas.width, canvas.height);

    // Add text
    context.fillStyle = '#FFFFFF';
    context.font = 'bold 32px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(16, 8, 1);
    sprite.renderOrder = 1002;

    return sprite;
  }

  // Create X-axis line (red) - full length across terrain
  const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, axisY, cornerZ),
    new THREE.Vector3(120, axisY, cornerZ),
  ]);
  const xAxisMaterial = new THREE.LineBasicMaterial({
    color: 0xff0000,
    linewidth: 3,
    depthTest: false,
  });
  const xAxisLine = new THREE.Line(xAxisGeometry, xAxisMaterial);
  xAxisLine.renderOrder = 1000;
  markerGroup.add(xAxisLine);

  // Add X-axis segment markings and labels
  for (let x = 0; x <= 120; x += segmentSpacing) {
    if (x % (segmentSpacing * 2) === 0) {
      // Every other segment gets a tick
      const tickHeight = 1;
      const tickGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, axisY, cornerZ),
        new THREE.Vector3(x, axisY + tickHeight, cornerZ),
      ]);
      const tickMaterial = new THREE.LineBasicMaterial({
        color: 0xff0000,
        linewidth: 1,
        depthTest: false,
      });
      const tickLine = new THREE.Line(tickGeometry, tickMaterial);
      tickLine.renderOrder = 1001;
      markerGroup.add(tickLine);

      // Add number labels (skip 0yd and 40yd endpoints)
      if (x !== 0 && x !== 120) {
        const labelValue = (x / 3).toFixed(1); // Convert to yards
        const labelText =
          segmentSpacing >= 5 ? `${labelValue}yd` : `${labelValue}`;
        const labelOffset = cornerZ > 0 ? -2 : 2;
        markerGroup.add(
          createTextMarker(
            labelText,
            x,
            axisY + 3,
            cornerZ + labelOffset,
            '#ff0000'
          )
        );
      }
    }
  }

  // Create Z-axis line (green) - full length across terrain
  const zAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(cornerX, axisY, 0),
    new THREE.Vector3(cornerX, axisY, 120),
  ]);
  const zAxisMaterial = new THREE.LineBasicMaterial({
    color: 0x00ff00,
    linewidth: 3,
    depthTest: false,
  });
  const zAxisLine = new THREE.Line(zAxisGeometry, zAxisMaterial);
  zAxisLine.renderOrder = 1000;
  markerGroup.add(zAxisLine);

  // Add Z-axis segment markings and labels
  for (let z = 0; z <= 120; z += segmentSpacing) {
    if (z % (segmentSpacing * 2) === 0) {
      // Every other segment gets a tick
      const tickHeight = 1;
      const tickGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cornerX, axisY, z),
        new THREE.Vector3(cornerX, axisY + tickHeight, z),
      ]);
      const tickMaterial = new THREE.LineBasicMaterial({
        color: 0x00ff00,
        linewidth: 1,
        depthTest: false,
      });
      const tickLine = new THREE.Line(tickGeometry, tickMaterial);
      tickLine.renderOrder = 1001;
      markerGroup.add(tickLine);

      // Add number labels (skip 0yd and 40yd endpoints)
      if (z !== 0 && z !== 120) {
        const labelValue = (z / 3).toFixed(1); // Convert to yards
        const labelText =
          segmentSpacing >= 5 ? `${labelValue}yd` : `${labelValue}`;
        const labelOffset = cornerX > 0 ? -2 : 2;
        markerGroup.add(
          createTextMarker(
            labelText,
            cornerX + labelOffset,
            axisY + 3,
            z,
            '#00ff00'
          )
        );
      }
    }
  }

  // Create Y-axis line (blue) - height axis
  const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(cornerX, axisY, cornerZ),
    new THREE.Vector3(cornerX, axisY + axisLength, cornerZ),
  ]);
  const yAxisMaterial = new THREE.LineBasicMaterial({
    color: 0x0000ff,
    linewidth: 3,
    depthTest: false,
  });
  const yAxisLine = new THREE.Line(yAxisGeometry, yAxisMaterial);
  yAxisLine.renderOrder = 1000;
  markerGroup.add(yAxisLine);

  // Add main axis endpoint labels
  markerGroup.add(
    createTextMarker('X', 120 + 6, axisY + 2, cornerZ, '#ff0000')
  );
  markerGroup.add(
    createTextMarker('Z', cornerX, axisY + 2, 120 + 6, '#00ff00')
  );
  markerGroup.add(
    createTextMarker(
      'Y',
      cornerX - 4,
      axisY + axisLength + 3,
      cornerZ,
      '#0000ff'
    )
  );
}

// Mouse panning function (similar to gesture controls)
function handleMousePan(deltaX: number, deltaY: number): void {
  // Get camera's right and up vectors
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();

  camera.getWorldDirection(right);
  right.cross(camera.up).normalize();
  up.copy(camera.up);

  // Calculate pan distance based on camera distance from target
  const distance = camera.position.distanceTo(cameraTarget);
  const panScale = distance * panSpeed * 0.001;

  // Calculate pan vector
  const panDelta = new THREE.Vector3();
  panDelta.copy(right).multiplyScalar(-deltaX * panScale);
  panDelta.addScaledVector(up, deltaY * panScale);

  // Apply pan to target and camera
  cameraTarget.add(panDelta);
  camera.position.add(panDelta);
  camera.lookAt(cameraTarget);
}

// Top-down panning function for precision drawing mode
function handleTopDownPan(deltaX: number, deltaY: number): void {
  // Calculate pan sensitivity based on camera height (zoom level)
  const height = camera.position.y;
  const panScale = height * 0.001; // Adjust sensitivity based on zoom level

  // In top-down mode, X movement pans X, Y movement pans Z
  const panX = -deltaX * panScale;
  const panZ = deltaY * panScale; // Invert Y for intuitive panning

  // Update camera position and target
  camera.position.x += panX;
  camera.position.z += panZ;
  cameraTarget.x += panX;
  cameraTarget.z += panZ;

  // Maintain top-down view by ensuring camera looks straight down
  camera.lookAt(cameraTarget.x, 0, cameraTarget.z);
}

function setupControls(): void {
  const canvas = renderer.domElement;

  // Mouse interaction variables
  let isMouseDown = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  // Raycaster for mouse picking
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // Mouse event handlers
  canvas.addEventListener('mousedown', event => {
    if (event.button === 0) {
      // Left click
      isMouseDown = true;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;

      // Check if we're in drawing mode or deepest point selection
      const state = precisionToolManager.getWorkflowState();
      if (
        state.isDrawing ||
        state.stage === 'deepest-point' ||
        state.stage === 'preview'
      ) {
        handleTerrainClick(event);
      }
    }
  });

  canvas.addEventListener('mousemove', event => {
    if (isMouseDown) {
      const deltaX = event.clientX - lastMouseX;
      const deltaY = event.clientY - lastMouseY;
      const state = precisionToolManager.getWorkflowState();
      const isTopDownMode = state.stage === 'drawing' && state.isDrawing;

      // Allow panning in any mode when Shift is held
      if (event.shiftKey) {
        // Shift + drag = Pan camera
        if (isTopDownMode) {
          // Top-down panning: move the camera while maintaining top-down view
          handleTopDownPan(deltaX, deltaY);
        } else {
          // Normal 3D panning
          handleMousePan(deltaX, deltaY);
        }
      } else if (!state.isDrawing) {
        // Only allow rotation when not actively drawing points
        // Default left drag = Camera rotation
        const spherical = new THREE.Spherical();
        spherical.setFromVector3(camera.position.clone().sub(cameraTarget));
        spherical.theta -= deltaX * 0.01;
        spherical.phi += deltaY * 0.01;
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

        camera.position.setFromSpherical(spherical).add(cameraTarget);
        camera.lookAt(cameraTarget);
      }

      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
    }
  });

  canvas.addEventListener('mouseup', () => {
    isMouseDown = false;
  });

  // Mouse wheel for zoom
  canvas.addEventListener('wheel', event => {
    event.preventDefault();

    // Check if we're in top-down drawing mode
    const state = precisionToolManager.getWorkflowState();
    const isTopDownMode = state.stage === 'drawing' && state.isDrawing;

    if (isTopDownMode) {
      // Top-down mode: zoom by adjusting camera height while maintaining current pan position
      const delta = event.deltaY * 0.5; // Adjust sensitivity for top-down zoom
      camera.position.y += delta;

      // Clamp camera height for top-down view (closer for detail, higher for overview)
      camera.position.y = Math.max(50, Math.min(400, camera.position.y));

      // Keep current X and Z position (don't reset to center) and maintain top-down view
      camera.lookAt(cameraTarget.x, 0, cameraTarget.z);

      // Show zoom level feedback
      precisionToolManager.showZoomFeedback();
    } else {
      // Normal 3D mode: zoom along view direction
      const delta = event.deltaY * 0.001;
      const direction = camera.position.clone().normalize();
      camera.position.add(direction.multiplyScalar(delta * 10)); // Increase zoom sensitivity

      // Clamp camera distance for normal mode
      const distance = camera.position.length();
      if (distance < 10) {
        camera.position.normalize().multiplyScalar(10);
      } else if (distance > 300) {
        camera.position.normalize().multiplyScalar(300);
      }
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', event => {
    switch (event.key.toLowerCase()) {
      case 'escape':
        precisionUI.reset();
        break;
      case 'enter':
        if (precisionToolManager.getWorkflowState().stage === 'drawing') {
          precisionUI.finishDrawing();
        } else if (
          precisionToolManager.getWorkflowState().stage === 'preview'
        ) {
          precisionUI.executeOperation();
        }
        break;
      case '+':
      case '=': // Handle both + and = key (same key without shift)
        if (precisionToolManager.isInTopDownMode()) {
          event.preventDefault();
          precisionToolManager.handleTopDownZoom('in');
        }
        break;
      case '-':
      case '_': // Handle both - and _ key
        if (precisionToolManager.isInTopDownMode()) {
          event.preventDefault();
          precisionToolManager.handleTopDownZoom('out');
        }
        break;
      case 'v':
        // Toggle between top-down and normal view
        if (precisionToolManager.isInTopDownMode()) {
          precisionToolManager.exitTopDownMode();
        }
        break;
      case 'r':
        if (!event.ctrlKey) {
          terrain.reset();
          console.log('Terrain reset');
        }
        break;
      case 'g':
        terrain.regenerateTerrain();
        console.log('New terrain generated');
        break;
      case 'd':
        // Debug key - log scene info
        console.log('=== DEBUG INFO ===');
        console.log('Scene children:', scene.children.length);
        console.log('Camera position:', camera.position);
        console.log(
          'Camera looking at:',
          camera.getWorldDirection(new THREE.Vector3())
        );
        console.log('Terrain mesh:', terrain.getMesh());
        console.log('Terrain stats:', terrain.getStats());
        break;
    }
  });
}

function handleTerrainClick(event: MouseEvent): void {
  console.log('handleTerrainClick called');

  // Convert mouse position to normalized device coordinates
  const mouse = new THREE.Vector2();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  console.log('Mouse coordinates:', { x: mouse.x, y: mouse.y });

  // Raycast to find intersection with terrain
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObject(terrain.getSurfaceMesh());
  console.log('Intersects found:', intersects.length);

  if (intersects.length > 0) {
    const point = intersects[0].point;
    const state = precisionToolManager.getWorkflowState();

    console.log('Terrain clicked at:', point);
    console.log('Current workflow state:', state);

    if (state.isDrawing) {
      console.log('Adding point to drawing');
      // Add point to current drawing
      precisionToolManager.addPoint(point.x, point.z);
    } else if (state.stage === 'deepest-point') {
      console.log('Setting deepest point');
      // Set deepest point position
      precisionToolManager.setDeepestPoint(point.x, point.z);
    } else {
      console.log(
        'No action taken - stage is',
        state.stage,
        'and isDrawing is',
        state.isDrawing
      );
    }
  } else {
    console.log('No terrain intersection found');
  }
}

// Render loop
function animate(): void {
  requestAnimationFrame(animate);

  // Update axis position based on camera rotation
  if (scaleReferences && scaleReferences.markers) {
    updateAxisPosition(scaleReferences.markers, camera);
  }

  // Update volume display if terrain has changed
  updateVolumeDisplay();

  renderer.render(scene, camera);
}

function updateVolumeDisplay(): void {
  const volumeInfo = document.getElementById('volume-info');
  if (volumeInfo && terrain) {
    const volumes = terrain.calculateVolumeDifference();
    const volumesYards = {
      cut: Math.max(0, volumes.cut / 27), // Convert cubic feet to yards
      fill: Math.max(0, volumes.fill / 27),
      net: volumes.net / 27,
    };

    volumeInfo.innerHTML = `
      <strong>Volume Analysis:</strong><br>
      Cut: ${volumesYards.cut.toFixed(2)} yd³<br>
      Fill: ${volumesYards.fill.toFixed(2)} yd³<br>
      Net: ${volumesYards.net.toFixed(2)} yd³
    `;
  }
}

// Make updateVolumeDisplay globally available for precision tools
(window as any).updateVolumeDisplay = updateVolumeDisplay;

// Add CSS for notification animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInOut {
    0% { 
      transform: translateX(100%); 
      opacity: 0; 
    }
    15% { 
      transform: translateX(0); 
      opacity: 1; 
    }
    85% { 
      transform: translateX(0); 
      opacity: 1; 
    }
    100% { 
      transform: translateX(100%); 
      opacity: 0; 
    }
  }
`;
document.head.appendChild(style);

// Function to update user info display (handles both auth and guest users)
function updateUserInfo(user?: { user_metadata?: { username?: string }; email?: string }, guestData?: any): void {
  const userInfoElement = document.getElementById('user-info');
  const popoverUserInfo = document.getElementById('popover-user-info');
  
  let displayText = '';
  
  if (guestData) {
    // Guest user
    const ageRangeText = guestData.ageRange ? ` (${guestData.ageRange})` : '';
    displayText = `👤 ${guestData.username || 'Guest'}${ageRangeText}`;
  } else if (user) {
    // Authenticated user
    const username = user.user_metadata?.username || user.email || 'Anonymous';
    displayText = `👤 ${username}`;
  } else {
    displayText = '👤 Loading...';
  }
  
  if (userInfoElement) {
    userInfoElement.textContent = displayText;
  }
  
  if (popoverUserInfo) {
    popoverUserInfo.textContent = displayText;
  }
}

// Make updateUserInfo globally available
(window as any).updateUserInfo = updateUserInfo;

// Window resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize when page loads
window.addEventListener('load', async () => {
  // ALWAYS clear any existing Supabase session to ensure clean state
  // This handles incognito mode and proper logout behavior
  try {
    await supabase.auth.signOut();
    console.log('Cleared any existing Supabase session');
  } catch (error) {
    console.log('No existing session to clear:', error);
  }

  const hasVisited = localStorage.getItem('hasVisited');
  const guestData = localStorage.getItem('guestData');
  
  // ALWAYS use guest registration flow - never show auth UI
  // If never visited, show guest registration
  if (!hasVisited) {
    console.log('First visit - showing guest registration');
    const guestUI = new GuestUI(() => {
      localStorage.setItem('hasVisited', 'true');
      if (!isGameReady) {
        initializeGame();
      }
      
      // Load guest data and update user info
      const guestData = JSON.parse(localStorage.getItem('guestData') || '{}');
      updateUserInfo(undefined, guestData);
      
      // Log age range for gameplay adjustments
      console.log('Guest user initialized:', guestData.username, 'Age range:', guestData.ageRange);
      
      // Apply age-based UI adjustments
      if (guestData.ageRange === '8-12') {
        // Simplify UI for younger users
        const advancedSections = document.querySelectorAll('.advanced-ui, .panel-section');
        advancedSections.forEach(section => {
          if (section.textContent?.includes('Performance') || 
              section.textContent?.includes('UI Settings')) {
            (section as HTMLElement).style.display = 'none';
          }
        });
      }
    });
    guestUI.show();
  } else if (guestData) {
    // Has visited and has guest data - continue as guest
    console.log('Returning guest user - loading existing data');
    if (!isGameReady) {
      initializeGame();
      
      const parsedGuestData = JSON.parse(guestData);
      updateUserInfo(undefined, parsedGuestData);
    }
  } else {
    // Has visited but no guest data - show guest registration again (logout case)
    console.log('User has visited before but no guest data - showing guest registration');
    const guestUI = new GuestUI(() => {
      localStorage.setItem('hasVisited', 'true');
      if (!isGameReady) {
        initializeGame();
      }
      
      // Load guest data and update user info
      const guestData = JSON.parse(localStorage.getItem('guestData') || '{}');
      updateUserInfo(undefined, guestData);
      
      // Log age range for gameplay adjustments
      console.log('Guest user initialized:', guestData.username, 'Age range:', guestData.ageRange);
    });
    guestUI.show();
  }
});

// Add basic volume display to the page
document.addEventListener('DOMContentLoaded', () => {
  const volumeDiv = document.createElement('div');
  volumeDiv.id = 'volume-info';
  volumeDiv.style.cssText = `
    position: fixed;
    bottom: 10px;
    left: 10px;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 10px;
    border-radius: 4px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 1000;
  `;
  volumeDiv.innerHTML = `
    <strong>Volume Analysis:</strong><br>
    Cut: 0.00 yd³<br>
    Fill: 0.00 yd³<br>
    Net: 0.00 yd³
  `;
  document.body.appendChild(volumeDiv);
});

// Add instructions
document.addEventListener('DOMContentLoaded', () => {
  const instructionsDiv = document.createElement('div');
  instructionsDiv.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 15px;
    border-radius: 4px;
    font-family: Arial, sans-serif;
    font-size: 12px;
    z-index: 1000;
    max-width: 250px;
  `;
  instructionsDiv.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <h3 style="margin: 0; color: #4CAF50;">🏗️ Precision Tools</h3>
      <button id="precision-labels-toggle" onclick="precisionUI.toggleLabels()" style="padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🏷️ Labels</button>
    </div>
    <div style="line-height: 1.4;">
      <strong>Camera:</strong><br>
      • Left-drag: Rotate view<br>
      • Shift+drag: Pan camera (works in top-down mode)<br>
      • Scroll: Zoom in/out<br>
      • V: Exit top-down mode<br><br>
      
      <strong>Tools:</strong><br>
      • Follow the workflow in the left panel<br>
      • Click on terrain to draw areas<br>
      • Enter: Finish drawing/Execute<br>
      • Escape: Reset workflow<br>
      • R: Reset terrain | G: New terrain<br>
      • D: Debug info (console)
    </div>
  `;
  document.body.appendChild(instructionsDiv);

  // Update labels button appearance after creation
  setTimeout(() => {
    if (precisionUI) {
      precisionUI.updateLabelsButton();
    }
  }, 100);
});

// Expose global variables and functions for testing (will be set when game initializes)

// Add terrain helpers for debugging and testing
(window as any).terrainHelpers = {
  toggle3D: () => {
    const currentTerrain = (window as any).terrain;
    if (
      currentTerrain &&
      currentTerrain
        .getMesh()
        .children.some((child: THREE.Object3D) => child.visible)
    ) {
      currentTerrain.disable3DTerrainBlock();
      console.log('🎯 3D terrain block disabled');
    } else if (currentTerrain) {
      currentTerrain.enable3DTerrainBlock();
      console.log('🎯 3D terrain block enabled');
    }
  },
  disable3D: () => {
    const currentTerrain = (window as any).terrain;
    if (currentTerrain) {
      currentTerrain.disable3DTerrainBlock();
      console.log('🎯 3D terrain block disabled');
    }
  },
  enable3D: () => {
    const currentTerrain = (window as any).terrain;
    if (currentTerrain) {
      currentTerrain.enable3DTerrainBlock();
      console.log('🎯 3D terrain block enabled');
    }
  },
  cleanRender: () => {
    const currentTerrain = (window as any).terrain;
    if (currentTerrain) {
      currentTerrain.forceCleanRendering();
      console.log('🎯 Terrain rendering cleaned');
    }
  },
  resetTerrain: () => {
    const currentTerrain = (window as any).terrain;
    if (currentTerrain) {
      currentTerrain.reset();
      currentTerrain.forceCleanRendering();
      console.log('🎯 Terrain reset and cleaned');
    }
  },
};

// Add debugging helper functions
(window as any).checkAssignmentStatus = () => {
  const currentAssignmentManager = (window as any).assignmentManager;
  const currentTerrain = (window as any).terrain;

  const assignment = currentAssignmentManager?.getCurrentAssignment();
  const progress = currentAssignmentManager?.getProgress();

  if (!assignment || !progress) {
    console.log("❌ No active assignment. Press 'A' to select one.");
    return;
  }

  console.log('📋 Current Assignment:', assignment.name);
  console.log('🎯 Objectives:');
  progress.objectives.forEach((obj: any, i: number) => {
    console.log(
      `  ${i + 1}. ${obj.completed ? '✅' : '⏳'} ${obj.description}`
    );
    console.log(`     Score: ${obj.score.toFixed(1)}% (Need 80%+ to complete)`);
    if (obj.target && obj.target.width) {
      console.log(
        `     Target area: ${obj.target.width}x${obj.target.height} ft at (${obj.target.x}, ${obj.target.z})`
      );
      console.log(`     Tolerance: ±${obj.tolerance} ft`);
    }
  });
  console.log('📊 Overall Score:', progress.currentScore.toFixed(1) + '%');
  console.log(
    '🗿 Planning Mode:',
    currentTerrain?.isInPlanningMode()
      ? 'ENABLED (press Enter to apply changes)'
      : 'DISABLED'
  );
  console.log('📏 Volume Data:', progress.volumeData);
};
