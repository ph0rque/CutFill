import './style.css';
import * as THREE from 'three';
import { Terrain } from './terrain';
import { PrecisionToolManager } from './precision-tools';
import { PrecisionUI } from './precision-ui';

// Global variables
let isGameReady = false;
let terrain: Terrain;
let precisionToolManager: PrecisionToolManager;
let precisionUI: PrecisionUI;
let scaleReferences: { markers: THREE.Group };

// Camera control variables
let cameraTarget = new THREE.Vector3(0, 0, 0);
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
    preserveDrawingBuffer: false
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
    precisionToolManager = new PrecisionToolManager(terrain, scene);
    precisionUI = new PrecisionUI(precisionToolManager);
    
    // Make precisionUI and scaleReferences globally available for UI callbacks
    (window as any).precisionUI = precisionUI;
    (window as any).scaleReferences = scaleReferences;
    
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
  function createTextMarker(text: string, x: number, y: number, z: number, color: string = '#000000'): THREE.Sprite {
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
      depthTest: false
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
    new THREE.Vector3(100, axisY, cornerZ)
  ]);
  const xAxisMaterial = new THREE.LineBasicMaterial({ 
    color: 0xff0000, 
    linewidth: 3,
    depthTest: false
  });
  const xAxisLine = new THREE.Line(xAxisGeometry, xAxisMaterial);
  xAxisLine.renderOrder = 1000;
  markerGroup.add(xAxisLine);
  
  // Add X-axis segment markings and labels
  for (let x = 0; x <= 100; x += segmentSpacing) {
    if (x % (segmentSpacing * 2) === 0) { // Every other segment gets a tick
      const tickHeight = 1;
      const tickGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, axisY, cornerZ),
        new THREE.Vector3(x, axisY + tickHeight, cornerZ)
      ]);
      const tickMaterial = new THREE.LineBasicMaterial({ 
        color: 0xff0000, 
        linewidth: 1,
        depthTest: false
      });
      const tickLine = new THREE.Line(tickGeometry, tickMaterial);
      tickLine.renderOrder = 1001;
      markerGroup.add(tickLine);
      
      // Add number labels (skip 0ft and 100ft)
      if (x !== 0 && x !== 100) {
        const labelText = segmentSpacing >= 5 ? `${x}ft` : `${x}`;
        const labelOffset = cornerZ > 0 ? -2 : 2;
        markerGroup.add(createTextMarker(labelText, x, axisY + 3, cornerZ + labelOffset, '#ff0000'));
      }
    }
  }
  
  // Create Z-axis line (green) - full length across terrain
  const zAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(cornerX, axisY, 0),
    new THREE.Vector3(cornerX, axisY, 100)
  ]);
  const zAxisMaterial = new THREE.LineBasicMaterial({ 
    color: 0x00ff00, 
    linewidth: 3,
    depthTest: false
  });
  const zAxisLine = new THREE.Line(zAxisGeometry, zAxisMaterial);
  zAxisLine.renderOrder = 1000;
  markerGroup.add(zAxisLine);
  
  // Add Z-axis segment markings and labels
  for (let z = 0; z <= 100; z += segmentSpacing) {
    if (z % (segmentSpacing * 2) === 0) { // Every other segment gets a tick
      const tickHeight = 1;
      const tickGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cornerX, axisY, z),
        new THREE.Vector3(cornerX, axisY + tickHeight, z)
      ]);
      const tickMaterial = new THREE.LineBasicMaterial({ 
        color: 0x00ff00, 
        linewidth: 1,
        depthTest: false
      });
      const tickLine = new THREE.Line(tickGeometry, tickMaterial);
      tickLine.renderOrder = 1001;
      markerGroup.add(tickLine);
      
      // Add number labels (skip 0ft and 100ft)
      if (z !== 0 && z !== 100) {
        const labelText = segmentSpacing >= 5 ? `${z}ft` : `${z}`;
        const labelOffset = cornerX > 0 ? -2 : 2;
        markerGroup.add(createTextMarker(labelText, cornerX + labelOffset, axisY + 3, z, '#00ff00'));
      }
    }
  }
  
  // Create Y-axis line (blue) - height axis
  const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(cornerX, axisY, cornerZ),
    new THREE.Vector3(cornerX, axisY + axisLength, cornerZ)
  ]);
  const yAxisMaterial = new THREE.LineBasicMaterial({ 
    color: 0x0000ff, 
    linewidth: 3,
    depthTest: false
  });
  const yAxisLine = new THREE.Line(yAxisGeometry, yAxisMaterial);
  yAxisLine.renderOrder = 1000;
  markerGroup.add(yAxisLine);

  // Add main axis endpoint labels
  markerGroup.add(createTextMarker('X', 100 + 6, axisY + 2, cornerZ, '#ff0000'));
  markerGroup.add(createTextMarker('Z', cornerX, axisY + 2, 100 + 6, '#00ff00'));
  markerGroup.add(createTextMarker('Y', cornerX - 4, axisY + axisLength + 3, cornerZ, '#0000ff'));
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
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) { // Left click
      isMouseDown = true;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
      
      // Check if we're in drawing mode or deepest point selection
      const state = precisionToolManager.getWorkflowState();
      if (state.isDrawing || state.stage === 'deepest-point' || state.stage === 'preview') {
        handleTerrainClick(event);
      }
    }
  });
  
  canvas.addEventListener('mousemove', (event) => {
    if (isMouseDown && !precisionToolManager.getWorkflowState().isDrawing) {
      const deltaX = event.clientX - lastMouseX;
      const deltaY = event.clientY - lastMouseY;
      
      if (event.shiftKey) {
        // Shift + drag = Pan camera
        handleMousePan(deltaX, deltaY);
             } else {
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
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const delta = event.deltaY * 0.001;
    const direction = camera.position.clone().normalize();
    camera.position.add(direction.multiplyScalar(delta * 10)); // Increase zoom sensitivity
    
    // Clamp camera distance
    const distance = camera.position.length();
    if (distance < 10) {
      camera.position.normalize().multiplyScalar(10);
    } else if (distance > 300) {
      camera.position.normalize().multiplyScalar(300);
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (event) => {
    switch (event.key.toLowerCase()) {
      case 'escape':
        precisionUI.reset();
        break;
      case 'enter':
        if (precisionToolManager.getWorkflowState().stage === 'drawing') {
          precisionUI.finishDrawing();
        } else if (precisionToolManager.getWorkflowState().stage === 'preview') {
          precisionUI.executeOperation();
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
        console.log('Camera looking at:', camera.getWorldDirection(new THREE.Vector3()));
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
      console.log('No action taken - stage is', state.stage, 'and isDrawing is', state.isDrawing);
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

// Window resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize when page loads
window.addEventListener('load', () => {
  setTimeout(() => {
    if (!isGameReady) {
      initializeGame();
    }
  }, 500);
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
      • Shift+drag: Pan camera<br>
      • Scroll: Zoom in/out<br><br>
      
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