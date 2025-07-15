import './style.css';
import * as THREE from 'three';
import { Terrain } from './terrain';
import { MultiplayerManager } from './multiplayer';
import { AuthService } from './auth';
import { AuthUI } from './auth-ui';
import { ToolManager } from './tools';
import { AssignmentManager } from './assignments';
import { ProgressTracker } from './progress';
import { uiPolishSystem } from './ui-polish';
import { visualEnhancementSystem } from './visual-enhancements';
import { responsiveDesignSystem } from './responsive-design';
import { performanceOptimizer, performanceMonitorUI } from './performance-optimization';
import { GestureControls, type GestureState } from './gesture-controls';

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
const terrain = new Terrain(100, 100, 8, 8); // 100 feet x 100 feet
scene.add(terrain.getMesh());

// Add basic lighting immediately so terrain is visible
const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight.position.set(10, 15, 10); // Adjusted for Y-up system
scene.add(directionalLight);

// Add scale reference grid and markers
const scaleReferences = addScaleReferences(scene);

// Position camera for Y-up system (Z is height)
camera.position.set(50, 80, 50); // X, Y, Z with Y pointing up
camera.lookAt(0, 0, 0);

// Allow much more zoom out for better overview
camera.far = 2000; // Increase far clipping plane
camera.updateProjectionMatrix();

// Terrain is now visible - turn off wireframe
  (terrain.getSurfaceMesh().material as THREE.MeshLambertMaterial).wireframe = false;

// Function to add scale references to the scene
function addScaleReferences(scene: THREE.Scene): { grid: THREE.GridHelper; markers: THREE.Group } {
  // Create grid helper for Y-up system (already horizontal by default)
  const gridHelper = new THREE.GridHelper(100, 10, 0x444444, 0x222222); // 100 feet with 10 divisions
  gridHelper.position.y = 0.1; // Slightly above terrain to avoid z-fighting
  scene.add(gridHelper);

  // Add scale markers with axis lines in corner
  const markerGroup = new THREE.Group();
  
  // These will be dynamically positioned based on camera angle
  updateAxisPosition(markerGroup, camera);
  
  scene.add(markerGroup);
  
  return { grid: gridHelper, markers: markerGroup };
}

// Function to update axis position based on camera rotation
function updateAxisPosition(markerGroup: THREE.Group, camera: THREE.PerspectiveCamera): void {
  // Clear existing markers
  markerGroup.clear();
  
  // Get camera direction to determine which corner to place axes
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  
  // Determine corner position based on camera view
  // Default to far corner that's most visible
  let cornerX = -50; // Far left (negative X)
  let cornerZ = -50; // Far back (negative Z)
  
  // Adjust corner based on camera direction
  if (cameraDirection.x > 0) cornerX = 50;  // Switch to positive X if looking from negative X
  if (cameraDirection.z > 0) cornerZ = 50;  // Switch to positive Z if looking from negative Z
  
  const axisLength = 15; // Length of axis lines in feet
  const axisY = 5; // Height above terrain
  
  // Create X-axis line (red) - points right
  const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(cornerX, axisY, cornerZ),
    new THREE.Vector3(cornerX + (cornerX > 0 ? -axisLength : axisLength), axisY, cornerZ)
  ]);
  const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3 });
  const xAxisLine = new THREE.Line(xAxisGeometry, xAxisMaterial);
  markerGroup.add(xAxisLine);
  
  // Create Z-axis line (green) - points forward
  const zAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(cornerX, axisY, cornerZ),
    new THREE.Vector3(cornerX, axisY, cornerZ + (cornerZ > 0 ? -axisLength : axisLength))
  ]);
  const zAxisMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 3 });
  const zAxisLine = new THREE.Line(zAxisGeometry, zAxisMaterial);
  markerGroup.add(zAxisLine);
  
  // Create Y-axis line (blue) - points up
  const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(cornerX, axisY, cornerZ),
    new THREE.Vector3(cornerX, axisY + axisLength, cornerZ)
  ]);
  const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 3 });
  const yAxisLine = new THREE.Line(yAxisGeometry, yAxisMaterial);
  markerGroup.add(yAxisLine);
  
  // Create text sprites for scale markers
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  canvas.width = 96;
  canvas.height = 48;
  
  // Helper function to create text markers
  function createTextMarker(text: string, x: number, y: number, z: number = 0.5, color: string = '#000000'): THREE.Sprite {
    // Clear canvas
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add background with slight transparency
    context.fillStyle = 'rgba(255, 255, 255, 0.95)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add border
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    
    // Add text
    context.fillStyle = color;
    context.font = 'bold 16px Arial';
    context.textAlign = 'center';
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 6);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(10, 5, 1); // Appropriate scale for 100ft terrain
    
    return sprite;
  }

  // Add origin marker at axis intersection
  markerGroup.add(createTextMarker('0,0,0', cornerX - 3, axisY + 2, cornerZ - 3, '#666666'));
  
  // Add X-axis scale marker (red)
  const xLabelX = cornerX + (cornerX > 0 ? -axisLength - 4 : axisLength + 4);
  markerGroup.add(createTextMarker('100ft', xLabelX, axisY + 2, cornerZ, '#ff0000'));
  
  // Add Z-axis scale marker (green)
  const zLabelZ = cornerZ + (cornerZ > 0 ? -axisLength - 4 : axisLength + 4);
  markerGroup.add(createTextMarker('100ft', cornerX, axisY + 2, zLabelZ, '#00ff00'));
  
  // Add Y-axis scale marker (blue)
  markerGroup.add(createTextMarker('33ft', cornerX - 3, axisY + axisLength + 3, cornerZ, '#0000ff'));
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

// Create tool manager
const toolManager = new ToolManager(terrain);

// Create assignment manager
const assignmentManager = new AssignmentManager(terrain);

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

// Game state
let isGameReady = false;
let isModifying = false;
let lastMousePosition: THREE.Vector3 | null = null;
let modificationStrength = 0.5;
let gestureControls: GestureControls;

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
      } else {
        // Default: Rotate camera
        isModifying = false;
      }
    } else if (event.button === 2) { // Right click
      isMouseDown = true;
      isModifying = false; // Right click is for camera rotation
    }
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
  });

  renderer.domElement.addEventListener('mousemove', event => {
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
              terrain.getBrushSettings().size,
              direction
            );
            
                      // Track tool usage for assignment
          assignmentManager.addToolUsage(toolManager.getCurrentToolName());
          
          // Track tool usage for progress
          progressTracker.recordToolUsage(toolManager.getCurrentToolName());
          
          // Track volume movement for progress
          const volumeData = terrain.calculateVolumeDifference();
          const volumeChange = Math.abs(volumeData.cut + volumeData.fill);
          progressTracker.recordVolumeMove(volumeChange * 0.001); // Convert to cubic meters
          
          updateVolumeDisplay();
          lastMousePosition = point.clone();

            // Send to multiplayer if in session
            if (multiplayerManager.isInSession()) {
              multiplayerManager.sendTerrainModification(point.x, point.z, modificationStrength);
            }
          }
        } else {
          // Default left drag = Camera rotation
          const deltaX = event.clientX - lastMouseX;
          const deltaY = event.clientY - lastMouseY;
          gestureControls.handleMouseRotation(deltaX, deltaY);
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

  // Mouse move to update interaction mode
  renderer.domElement.addEventListener('mousemove', event => {
    if (!isMouseDown && !gestureControls.getGestureState().isRotating && !gestureControls.getGestureState().isZooming) {
      updateInteractionMode(event.shiftKey, event.ctrlKey || event.metaKey);
    }
      });

  renderer.domElement.addEventListener('mouseup', () => {
    isMouseDown = false;
    isModifying = false;
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
        loadAssignments();
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
      case 'q':
        toolManager.setCurrentTool('excavator');
        updateToolDisplay();
        break;
      case 'e':
        toolManager.setCurrentTool('bulldozer');
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
        updateVolumeDisplay();
        if (multiplayerManager.isInSession()) {
          multiplayerManager.sendTerrainReset();
        }
        break;
      case 't':
        toolManager.setCurrentTool('grader');
        updateToolDisplay();
        break;
      case 'y':
        toolManager.setCurrentTool('compactor');
        updateToolDisplay();
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

  if (assignmentsBtn) {
    assignmentsBtn.addEventListener('click', () => {
      loadAssignments();
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
    <div class="main-panel ui-responsive enhanced-panel" style="position: fixed; top: 10px; left: 10px; color: white; font-family: Arial; background: rgba(0,0,0,0.8); padding: 15px; border-radius: 8px; min-width: 300px; max-height: 90vh; overflow-y: auto; z-index: 1001; pointer-events: auto;">
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
            <div>🚜 Volume Moved: 0.0m³</div>
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
         <strong>Earthmoving Tools:</strong><br>
        <div class="tool-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin: 5px 0;">
          <button class="tool-btn" data-tool="excavator" style="padding: 8px; background: #FF6B35; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🚜 Excavator</button>
          <button class="tool-btn" data-tool="bulldozer" style="padding: 8px; background: #4ECDC4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🚜 Bulldozer</button>
          <button class="tool-btn" data-tool="grader" style="padding: 8px; background: #45B7D1; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🛣️ Grader</button>
          <button class="tool-btn" data-tool="compactor" style="padding: 8px; background: #96CEB4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🛞 Compactor</button>
        </div>
        <div class="control-buttons" style="margin: 5px 0;">
          <button id="undo-btn" class="enhanced-button secondary" style="margin: 2px; padding: 5px 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Undo (Ctrl+Z)</button>
          <button id="redo-btn" class="enhanced-button secondary" style="margin: 2px; padding: 5px 10px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Redo (Ctrl+Shift+Z)</button>
        </div>
        <div id="tool-status" style="margin: 5px 0; font-size: 14px;">Current Tool: 🚜 Excavator</div>
                 <div id="tool-description" style="margin: 5px 0; font-size: 12px; color: #ccc;">Precise digging and material removal</div>
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
      </div>
      
              <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <strong>Controls (Touch & Mouse):</strong>
          <ul style="margin: 5px 0; padding-left: 20px; font-size: 14px;">
            <li><strong>Touch:</strong> One-finger drag: Rotate camera | Two-finger scroll: Zoom</li>
            <li><strong>Trackpad:</strong> Two-finger scroll: Zoom | Two-finger pinch/rotate: Camera control</li>
            <li><strong>Mouse:</strong> Left drag: Rotate camera | Scroll wheel: Zoom</li>
            <li>Ctrl + drag: Apply current tool</li>
            <li>Q: Excavator | E: Bulldozer | T: Grader | Y: Compactor</li>
            <li>R: Reset terrain | G: Generate new terrain | W: Wireframe | X: Toggle grid</li>
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
       
       <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
         <strong>Assignments:</strong><br>
         <div style="margin: 5px 0;">
           <button id="assignments-btn" style="width: 100%; padding: 8px; background: #9C27B0; color: white; border: none; border-radius: 4px; cursor: pointer;">📋 View Assignments (A)</button>
         </div>
         <div id="current-assignment" style="margin: 5px 0; font-size: 12px; color: #ccc;">No assignment selected</div>
         <div id="assignment-progress" style="margin: 5px 0; font-size: 12px; color: #ccc; display: none;">Progress: 0%</div>
       </div>
     </div>
   `;

  // Initialize display updates
  updateToolDisplay();
  updateBrushDisplay();
  updateTerrainStats();
  updateInteractionMode(false, false); // Initialize with no modifiers
  updateProgressDisplay(); // Initialize progress display
  
  // Initialize UI polish system
  uiPolishSystem.initialize();
  
  // Initialize visual enhancement system
  visualEnhancementSystem.initialize();
  
  // Initialize responsive design system
  responsiveDesignSystem.initialize();
  
  // Initialize performance optimization
  performanceOptimizer.initialize(renderer, scene, camera);
  
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
}

// Update volume display
function updateVolumeDisplay() {
  const volumes = terrain.calculateVolumeDifference();
  const info = document.getElementById('volume-info');
  if (info) {
    info.innerHTML = `
      <strong>Volume Analysis:</strong><br>
      Cut: ${volumes.cut.toFixed(2)}<br>
      Fill: ${volumes.fill.toFixed(2)}<br>
      Net: ${volumes.net.toFixed(2)}
    `;
  }

  updateTerrainStats();

  // Send volume update to multiplayer if in session
  if (multiplayerManager.isInSession()) {
    multiplayerManager.sendVolumeUpdate(volumes);
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

// Update brush display
function updateBrushDisplay() {
  const brushSettings = terrain.getBrushSettings();
  
  const sizeValue = document.getElementById('brush-size-value');
  const strengthValue = document.getElementById('brush-strength-value');
  const sizeSlider = document.getElementById('brush-size') as HTMLInputElement;
  const strengthSlider = document.getElementById('brush-strength') as HTMLInputElement;
  
  if (sizeValue) sizeValue.textContent = brushSettings.size.toString();
  if (strengthValue) strengthValue.textContent = brushSettings.strength.toString();
  if (sizeSlider) sizeSlider.value = brushSettings.size.toString();
  if (strengthSlider) strengthSlider.value = brushSettings.strength.toString();
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
      statusText = '🔄 Camera rotation mode';
      statusColor = '#FF9800';
    } else if (ctrlKey) {
      statusText = '🔧 Tool application mode';
      statusColor = '#4CAF50';
    } else {
      statusText = '🔧 Ready to modify terrain';
      statusColor = '#4CAF50';
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
      <div>🚜 Volume Moved: ${userProgress.totalVolumeMovedCubicMeters.toFixed(1)}m³</div>
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
