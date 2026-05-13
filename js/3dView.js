import * as THREE from './lib/three.module.js';
import { VoxelGrid } from './voxels/VoxelGrid.js';
import { QuadtreeVoxelGrid } from './voxels/QuadtreeVoxelGrid.js';
import { VoxelMaterialRemover } from './voxels/VoxelMaterialRemover.js';

const GCODE_PREPROCESS_WORKER_URL = './js/workers/gcodePreprocessorWorker.js';

function serializeGcodeProfileForWorker(profile) {
  if (!profile) return null;

  return {
    rapidTemplate: profile.rapidTemplate,
    cutTemplate: profile.cutTemplate,
    cwArcTemplate: profile.cwArcTemplate,
    ccwArcTemplate: profile.ccwArcTemplate,
    gcodeUnits: profile.gcodeUnits
  };
}


// Global state
let renderer, scene, camera;
let initialized = false;
let workpieceManager, toolpathAnimation, toolpathVisualizer;
let orbitControls;
let toolGroup;  // Visual representation of the cutting tool (Group: children[0]=tip, children[1]=shank)
let gridHelper3D;  // Grid helper reference for updates
let currentGridStep3D = null;  // Active grid step in mm for progressive zoom behavior
let axisLines = { x: null, y: null, z: null };  // Store axis line references
let resizeListenerAttached = false;  // Track if resize listener has been added
let isResizing = false;  // Track if window is currently being resized
let resizeTimeoutId = null;  // Timeout ID for detecting end of resize
let animationFrameId = null;  // Track animation loop to prevent duplicates
let animationLoopActive = false;  // Flag to control whether animation loop should run
let deferredSTLVisibilitySyncId = null;  // Timeout for reapplying STL checkbox after meshes load
let renderRequested = false;  // Track pending on-demand renders
let resizeObserver3D = null;  // Track active ResizeObserver instance
let threeLoadingUI = null;
let threeViewLoadToken = 0;
let simulation3DUIElements = null;
let simulation3DUIState = {
  lastUpdateTime: 0,
  updateIntervalMs: 80,
  pendingFrameId: null,
  lastHighlightedLine: -1
};

// Simple profiling: wall-clock timing with frame counter
let profileFrameCount = 0;
let profileStartTime = performance.now();

// Voxel removal profiling: simple frame counter for removal operations
let voxelRemovalFrameCount = 0;
let voxelRemovalTotalTime = 0;

function getThreeLoadingUI() {
  if (threeLoadingUI) {
    return threeLoadingUI;
  }

  threeLoadingUI = {
    overlay: document.getElementById('3d-loading-overlay'),
    message: document.getElementById('3d-loading-message')
  };

  return threeLoadingUI;
}

function setThreeLoadingState(isLoading, message = 'Chargement de la vue 3D...') {
  const ui = getThreeLoadingUI();
  if (!ui.overlay) {
    return;
  }

  if (ui.message) {
    ui.message.textContent = message;
  }

  ui.overlay.classList.toggle('d-none', !isLoading);
}

function waitForNextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function isThreeViewLoadCurrent(loadToken) {
  return loadToken === threeViewLoadToken && animationLoopActive;
}

function startThreeViewLoad() {
  const loadToken = ++threeViewLoadToken;
  setThreeLoadingState(true, 'Chargement de la vue 3D...');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!isThreeViewLoadCurrent(loadToken)) {
        return;
      }

      initThree(loadToken).catch((error) => {
        if (!isThreeViewLoadCurrent(loadToken)) {
          return;
        }
        console.error('3D view initialization failed:', error);
        if (typeof gcodeView !== 'undefined' && gcodeView && typeof showGcodeViewerPanel === 'function') {
          showGcodeViewerPanel();
        }
        setThreeLoadingState(false);
      });
    });
  });
}

function getSimulation3DUIElements() {
  if (simulation3DUIElements) {
    return simulation3DUIElements;
  }

  simulation3DUIElements = {
    startBtn: document.getElementById('3d-start-simulation'),
    pauseBtn: document.getElementById('3d-pause-simulation'),
    stopBtn: document.getElementById('3d-stop-simulation'),
    lineDisplay: document.getElementById('3d-step-display'),
    feedRateDisplay: document.getElementById('3d-feed-rate-display'),
    progressSlider: document.getElementById('3d-simulation-progress'),
    progressDisplay: document.getElementById('3d-progress-display'),
    simTimeElem: document.getElementById('3d-simulation-time'),
    totalTimeElem: document.getElementById('3d-total-time'),
    followToolCheckbox: document.getElementById('3d-follow-tool')
  };

  return simulation3DUIElements;
}

function resetSimulation3DUIThrottle() {
  simulation3DUIState.lastUpdateTime = 0;
  simulation3DUIState.lastHighlightedLine = -1;
  if (simulation3DUIState.pendingFrameId !== null) {
    cancelAnimationFrame(simulation3DUIState.pendingFrameId);
    simulation3DUIState.pendingFrameId = null;
  }
}

function syncSimulation3DGcodeView(force) {
  if (!toolpathAnimation || typeof gcodeView === 'undefined' || !gcodeView) {
    return;
  }

  const lineNumber = toolpathAnimation.currentGcodeLineNumber;
  if (force || lineNumber !== simulation3DUIState.lastHighlightedLine) {
    gcodeView.setCurrentLine(lineNumber);
    simulation3DUIState.lastHighlightedLine = lineNumber;
  }
}

function flushSimulation3DUI(force) {
  simulation3DUIState.pendingFrameId = null;
  if (!toolpathAnimation) {
    return;
  }

  const now = performance.now();
  if (!force && (now - simulation3DUIState.lastUpdateTime) < simulation3DUIState.updateIntervalMs) {
    return;
  }

  const ui = getSimulation3DUIElements();
  const currentLineNumber = toolpathAnimation.currentGcodeLineNumber;
  const totalGcodeLines = toolpathAnimation.totalGcodeLines;

  if (ui.lineDisplay) {
    ui.lineDisplay.textContent = `${currentLineNumber + 1} / ${totalGcodeLines}`;
  }

  if (ui.feedRateDisplay) {
    ui.feedRateDisplay.textContent = `${Math.round(toolpathAnimation.currentFeedRate)}`;
  }

  if (ui.progressSlider && totalGcodeLines >= 0) {
    ui.progressSlider.max = totalGcodeLines - 1;
    ui.progressSlider.value = currentLineNumber;
  }

  if (ui.progressDisplay) {
    const percent = totalGcodeLines > 0
      ? Math.round(((currentLineNumber + 1) / totalGcodeLines) * 100)
      : 0;
    ui.progressDisplay.textContent = `${currentLineNumber + 1}/${totalGcodeLines} (${percent}%)`;
  }

  if (ui.simTimeElem) {
    const prevMovement = toolpathAnimation.currentMovementIndex > 0
      ? toolpathAnimation.movementTiming[toolpathAnimation.currentMovementIndex - 1]
      : null;
    const prevMovementEndTime = prevMovement ? prevMovement.cumulativeTime : 0;
    const cumulativeElapsedTime = prevMovementEndTime + toolpathAnimation.elapsedTime;
    ui.simTimeElem.textContent = formatTime(cumulativeElapsedTime);
  }

  if (ui.totalTimeElem) {
    ui.totalTimeElem.textContent = formatTime(toolpathAnimation.totalAnimationTime);
  }

  simulation3DUIState.lastUpdateTime = now;
}

function scheduleSimulation3DUI(force) {
  syncSimulation3DGcodeView(force);

  if (force) {
    flushSimulation3DUI(true);
    return;
  }

  if (simulation3DUIState.pendingFrameId !== null) {
    return;
  }

  simulation3DUIState.pendingFrameId = requestAnimationFrame(() => {
    flushSimulation3DUI(false);
  });
}

// ============ CONFIGURATION CONSTANTS ============
const CONFIG = {
  // Scene and rendering
  SCENE_BACKGROUND_COLOR: 0xadd8e6,
  RENDERER_CLEAR_COLOR: 0xadd8e6,
  ANTIALIAS: true,
  MAX_PIXEL_RATIO: 1.25,
  ENABLE_SHADOWS: false,

  // Camera
  CAMERA_FOV: 75,
  CAMERA_NEAR: 0.1,
  CAMERA_FAR: 5000,
  INITIAL_CAMERA_POSITION: { x: 0, y: -140, z: 100 },

  // Lighting (brightened for better visibility)
  DIRECTIONAL_LIGHT_COLOR: 0xffffff,
  DIRECTIONAL_LIGHT_INTENSITY: 1.5,  // Increased from 1.2
  DIRECTIONAL_LIGHT_SHADOW_SCALE: 0.7,
  AMBIENT_LIGHT_COLOR: 0xffffff,
  AMBIENT_LIGHT_INTENSITY: 0.8,  // Increased from 0.5 for brighter overall scene

  // Axes
  AXIS_LENGTH: 100,
  AXIS_LINE_WIDTH: 2,
  AXIS_RED: 0xff0000,
  AXIS_GREEN: 0x00ff00,
  AXIS_BLUE: 0x0000ff,

  // Grid
  GRID_DISPLAY_SIZE_MULTIPLIER: 1.5,
  GRID_MAX_SIZE_MULTIPLIER: 12,
  GRID_MIN_DIVISIONS: 8,
  GRID_MAX_DIVISIONS: 120,
  GRID_PROGRESSIVE_DISTANCE_DIVISOR: 2.5,
  GRID_PROGRESSIVE_SCALE_FACTOR: 2,
  GRID_COLOR: 0x666666,
  GRID_ROTATION_X: Math.PI / 2,

  // Workpiece
  WORKPIECE_MATERIAL_SHININESS: 30,
  WORKPIECE_OPACITY: 0.6,
  WORKPIECE_DEFAULT_WIDTH: 200,
  WORKPIECE_DEFAULT_LENGTH: 200,
  WORKPIECE_DEFAULT_THICKNESS: 50,

  // Tool
  DEFAULT_TOOL_DIAMETER: 6,
  TOOL_MATERIAL_COLOR: 0x888888,
  TOOL_OPACITY: 0.85,
  TOOL_SHAFT_HEIGHT: 80,
  TOOL_SPHERE_SCALE: 1.5,
  TOOL_VISUALIZATION_LENGTH: 40,
  DRILL_HALF_ANGLE_DEGREES: 59,

  // Control panel
  CONTROL_PANEL_OPACITY: 0.8,
  ANIMATION_SPEED_MIN: 1,
  ANIMATION_SPEED_MAX: 50,

  // G-code defaults
  DEFAULT_FEED_RATE: 1000,
  RAPID_FEED_RATE: 6000,
  SAFE_Z_HEIGHT: 5,

  // Grid size default
  DEFAULT_GRID_SIZE: 10,

  // PHASE 3.5: Magic number constants
  // Animation
  ANIMATION_DELTA_TIME: 1 / 60,  // Assume 60fps for delta time calculation
  RESIZE_DEBOUNCE_MS: 200,  // Timeout for detecting end of window resize
  RESIZE_RAF_DEBOUNCE_MS: 50,  // Debounce for RAF after resize

  // Voxel system
  DEFAULT_VOXEL_SIZE: 0.5,  // Default voxel size in mm
  MAX_VOXELS: 300000,  // Maximum voxels before scaling up voxel size
  VOXEL_SIZE_INCREMENT: 0.25,  // How much to increase voxel size when exceeding max

  // Toolpath visualization
  TOOLPATH_BOUNDS_PADDING: 4,  // mm padding around toolpath bounds
  G1_LINE_COLOR: 0x00ffff,  // Cyan for cutting moves (G1)
  G0_LINE_COLOR: 0xff0000,  // Red for rapid moves (G0)
  G1_LINE_WIDTH: 2,
  G0_LINE_WIDTH: 1,

  // Coordinate space
  TOOL_LENGTH: 40,  // Tool visualization length

  // Performance
  PROFILE_FRAME_INTERVAL: 300  // Log profiling every N frames
};

// ============ HELPER FUNCTIONS ============

// Return the wood color for the given species as a THREE.js hex integer.
// Falls back to a default brown if the species is not in the database.
function getMaterialColor(species) {
  const DEFAULT = 0x8B7355;
  if (typeof materialsDatabase === 'undefined') return DEFAULT;
  const entry = materialsDatabase[species];
  if (!entry || !entry.color) return DEFAULT;
  return parseInt(entry.color.replace('#', ''), 16);
}

function getWorkpieceDimensions() {
  // Helper to consolidate duplicate dimension fetching
  return {
    width: (typeof getOption === 'function') ? getOption('workpieceWidth') : CONFIG.WORKPIECE_DEFAULT_WIDTH,
    length: (typeof getOption === 'function') ? getOption('workpieceLength') : CONFIG.WORKPIECE_DEFAULT_LENGTH,
    thickness: (typeof getOption === 'function') ? getOption('workpieceThickness') : CONFIG.WORKPIECE_DEFAULT_THICKNESS,
    originPosition: (typeof getOption === 'function') ? getOption('originPosition') : 'middle-center'
  };
}

function getWorkpieceBoundsOffset(originPositionOverride, widthOverride, lengthOverride) {
  // Return the logical origin position on a workpiece centered in the 3D scene.
  const dims = getWorkpieceDimensions();
  const originPosition = originPositionOverride || dims.originPosition || 'middle-center';
  const width = widthOverride ?? dims.width;
  const length = lengthOverride ?? dims.length;

  let offsetX = 0;
  let offsetY = 0;

  if (originPosition.includes('left')) {
    offsetX = -width / 2;
  } else if (originPosition.includes('right')) {
    offsetX = width / 2;
  }

  if (originPosition.includes('top')) {
    offsetY = length / 2;
  } else if (originPosition.includes('bottom')) {
    offsetY = -length / 2;
  }

  return { x: offsetX, y: offsetY };
}

function sync3DVisibilityControls(options = {}) {
  const { deferSTL = false } = options;

  const axesCheckbox = document.getElementById('3d-show-axes');
  if (axesCheckbox && typeof window.setAxesVisibility3D === 'function') {
    window.setAxesVisibility3D(axesCheckbox.checked);
  }

  const toolpathCheckbox = document.getElementById('3d-show-toolpath');
  if (toolpathCheckbox && typeof window.setToolpathVisibility3D === 'function') {
    window.setToolpathVisibility3D(toolpathCheckbox.checked);
  }

  const workpieceCheckbox = document.getElementById('3d-show-workpiece');
  if (workpieceCheckbox && typeof window.setWorkpieceVisibility3D === 'function') {
    window.setWorkpieceVisibility3D(workpieceCheckbox.checked);
  }

  const stlCheckbox = document.getElementById('3d-show-stl');
  if (deferredSTLVisibilitySyncId) {
    clearTimeout(deferredSTLVisibilitySyncId);
    deferredSTLVisibilitySyncId = null;
  }
  if (stlCheckbox && typeof window.setSTLVisibility3D === 'function') {
    if (deferSTL) {
      // STL meshes may be attached shortly after the 3D scene is rebuilt.
      deferredSTLVisibilitySyncId = setTimeout(() => {
        deferredSTLVisibilitySyncId = null;
        const currentSTLCheckbox = document.getElementById('3d-show-stl');
        window.setSTLVisibility3D(currentSTLCheckbox ? currentSTLCheckbox.checked : true);
      }, 150);
    } else {
      window.setSTLVisibility3D(stlCheckbox.checked);
    }
  }

  requestThreeRender();
}

function renderThreeScene() {
  if (!renderer || !scene || !camera || isResizing) return;
  renderer.render(scene, camera);
}

function requestThreeRender() {
  if (!animationLoopActive || !renderer) return;

  if (toolpathAnimation && toolpathAnimation.isPlaying) {
    if (animationFrameId === null) {
      renderRequested = false;
      animationFrameId = requestAnimationFrame(animate);
    }
    return;
  }

  if (renderRequested) return;

  renderRequested = true;
  animationFrameId = requestAnimationFrame(() => {
    animationFrameId = null;
    renderRequested = false;
    renderThreeScene();
  });
}

window.requestThreeRender = requestThreeRender;

// Wait for DOM and listen for tab show event
document.addEventListener('DOMContentLoaded', setupTabListener);

function setupTabListener() {
  const tab3dElement = document.getElementById('3d-tab');
  if (tab3dElement) {
    tab3dElement.addEventListener('show.bs.tab', () => {
      setThreeLoadingState(true, 'Chargement de la vue 3D...');
    });

    tab3dElement.addEventListener('shown.bs.tab', () => {
      // Enable animation loop and reinitialize when tab is shown
      animationLoopActive = true;
      startThreeViewLoad();
    });

    tab3dElement.addEventListener('hidden.bs.tab', () => {
      // Disable animation loop when switching to 2D view
      threeViewLoadToken++;
      animationLoopActive = false;
      setThreeLoadingState(false);
      renderRequested = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      redrawImmediate();
    });
  }
}

function refreshToolpath() {
  if (!toolpathAnimation || !workpieceManager) return;

  // Get current workpiece dimensions
  const { width: workpieceWidth, length: workpieceLength, thickness: workpieceThickness, originPosition } = getWorkpieceDimensions();

  // Get wood species color
  const material = (typeof getOption === 'function') ? getOption('material') : 'Softwood / MDF';
  const materialColor = getMaterialColor(material);

  // Remove old workpiece
  scene.remove(workpieceManager.mesh);
  if (workpieceManager.mesh.geometry) workpieceManager.mesh.geometry.dispose();
  if (workpieceManager.mesh.material) workpieceManager.mesh.material.dispose();

  // Create new workpiece with current dimensions and wood color
  workpieceManager = new WorkpieceManager(scene, workpieceWidth, workpieceLength, workpieceThickness, originPosition, materialColor);
  workpieceManager.mesh.visible = true;  // Show workpiece

  // Update the toolpath animation's reference
  toolpathAnimation.workpieceManager = workpieceManager;

  // Reset subtraction tracking
  toolpathAnimation.lastSubtractionSegmentIndex = -1;

  // Clear existing toolpath visualization
  toolpathAnimation.clearToolpath();

  // Regenerate from current G-code or use imported G-code
  const gcode = window._importedGcode || (typeof toGcode === 'function' ? toGcode() : null);
  if (gcode) {
    toolpathAnimation.loadFromGcode(gcode);
  }

  // Reset animation state
  toolpathAnimation.pause();
  toolpathAnimation.setProgress(0);
  sync3DVisibilityControls();
}

async function initThree(loadToken = threeViewLoadToken) {
  const container = document.getElementById('3d-canvas-container');
  if (!container) {
    console.error('3D canvas container not found');
    return;
  }

  // Cancel old animation loop to prevent duplicates
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  renderRequested = false;

  if (resizeObserver3D) {
    resizeObserver3D.disconnect();
    resizeObserver3D = null;
  }

  // Remove old controls UI panel
  const oldControlsPanel = document.getElementById('3d-controls-panel');
  if (oldControlsPanel && oldControlsPanel.parentElement === container) {
    container.removeChild(oldControlsPanel);
  }

  // Clear any existing renderer element from container (don't remove container itself)
  if (renderer && renderer.domElement && renderer.domElement.parentElement === container) {
    container.removeChild(renderer.domElement);
    renderer.dispose();
  }

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;

  // Setup scene with brighter background
  scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.SCENE_BACKGROUND_COLOR);
  window.threeScene = scene;

  // Setup camera - perspective view from above and negative Y
  camera = new THREE.PerspectiveCamera(CONFIG.CAMERA_FOV, width / height, CONFIG.CAMERA_NEAR, CONFIG.CAMERA_FAR);

  // Get workpiece dimensions (in mm)
  const { width: workpieceWidth, length: workpieceLength, thickness: workpieceThickness, originPosition } = getWorkpieceDimensions();

  // Position camera: above origin (0,0,0), along negative Y axis
  // This gives us a perspective view where:
  // - X axis points right (red)
  // - Y axis points away (green)
  // - Z axis points up (blue)
  const camPos = CONFIG.INITIAL_CAMERA_POSITION;
  camera.position.set(camPos.x, camPos.y, camPos.z);
  camera.lookAt(0, 0, 0);

  // Setup renderer
  renderer = new THREE.WebGLRenderer({ antialias: CONFIG.ANTIALIAS, alpha: false });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.MAX_PIXEL_RATIO));
  renderer.setClearColor(CONFIG.RENDERER_CLEAR_COLOR, 1.0);
  renderer.shadowMap.enabled = CONFIG.ENABLE_SHADOWS;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  // Setup ResizeObserver to update WebGL buffer when container size changes
  // Debounce to avoid flicker from rapid resize events
  resizeObserver3D = new ResizeObserver(() => {
    if (resizeTimeoutId) clearTimeout(resizeTimeoutId);
    isResizing = true;
    resizeTimeoutId = setTimeout(() => {
      doResize();
      isResizing = false;
      requestThreeRender();
    }, 100);
  });
  resizeObserver3D.observe(container);

  // Setup lighting
  setupLighting();

  // Create and add axis helper at origin
  addAxisHelper();

  // Create and add tool visualization
  createToolVisualization(6);  // 6mm diameter tool

  // Get material color for initial workpiece
  const material = (typeof getOption === 'function') ? getOption('material') : 'Softwood / MDF';
  const materialColor = getMaterialColor(material);

  // Initialize workpiece manager with workpiece positioned correctly and material color
  workpieceManager = new WorkpieceManager(scene, workpieceWidth, workpieceLength, workpieceThickness, originPosition, materialColor);
  workpieceManager.mesh.visible = true;  // Show workpiece

  // Initialize visualizers
  toolpathVisualizer = new ToolpathVisualizer(scene);

  // Save current speed before recreating ToolpathAnimation (preserves speed across tab switches)
  const savedSpeed = toolpathAnimation?.speed || 1.0;

  toolpathAnimation = new ToolpathAnimation(workpieceManager, toolpathVisualizer, scene);

  // Restore the saved speed to the newly created animation
  toolpathAnimation.setSpeed(savedSpeed);

  // Expose to global scope for debugging from browser console
  window.toolpathAnimation = toolpathAnimation;

  // Setup orbit controls - center on world origin (0, 0, 0)
  orbitControls = new OrbitControls(camera, renderer.domElement);

  // Initialize orbit controls with correct camera position
  // Calculate distance, phi, theta from desired position (0, -140, 100)
  const camX = 0, camY = -140, camZ = 100;
  orbitControls.distance = Math.sqrt(camX*camX + camY*camY + camZ*camZ);
  orbitControls.phi = Math.asin(camY / orbitControls.distance);
  orbitControls.theta = Math.atan2(camX, camZ);

  orbitControls.setTarget(0, 0, 0);
  updateProgressiveGrid3D(true);

  // Simulation controls are now created by bootstrap-layout.js overlay system
  // No need to create them here

  requestThreeRender();

  if (!window._cachedGcode && !window._importedGcode && window.toolpaths && window.toolpaths.length > 0 && typeof toGcode === 'function') {
    setThreeLoadingState(true, 'Generation du G-code...');
    await waitForNextFrame();
  }

  // Load toolpaths from generated G-code or imported G-code file
  const gcode = window._cachedGcode || window._importedGcode || (window.toolpaths && window.toolpaths.length > 0 && typeof toGcode === 'function' ? toGcode() : null);
  window._cachedGcode = null;
  if (!isThreeViewLoadCurrent(loadToken)) {
    return;
  }

  if (gcode) {
    if (typeof gcodeView !== 'undefined' && gcodeView) {
      gcodeView.populate(gcode);
      if (typeof showGcodeViewerPanel === 'function') {
        showGcodeViewerPanel();
      }
    }

    setThreeLoadingState(true, 'Preparation de la simulation 3D...');
    await toolpathAnimation.loadFromGcodeAsync(gcode);
    if (!isThreeViewLoadCurrent(loadToken)) {
      return;
    }
  } else {
    console.warn('No toolpaths found - create some in the 2D view first');
    // Still create voxel grid so workpiece appearance is consistent (solid voxels vs bare mesh)
    if (toolpathAnimation.enableVoxelRemoval && workpieceManager) {
      toolpathAnimation.initializeVoxelGrid();
    }
  }

  sync3DVisibilityControls({ deferSTL: true });
  updateSimulation3DUI();
  updateSimulation3DDisplays();
  setThreeLoadingState(false);
  requestThreeRender();

  // Handle window resize (only add listener once to prevent duplicates)
 //if (!resizeListenerAttached) {
  //  window.addEventListener('resize', onWindowResize);
  //  resizeListenerAttached = true;
  //}

  // Mark as initialized
  initialized = true;
}

function addAxisHelper() {
  // Create axes at logical workpiece origin
  // X axis: red (positive goes right)
  // Y axis: green (positive goes away from camera)
  // Z axis: blue (positive goes up)

  const axisLength = CONFIG.AXIS_LENGTH;
  const boundsOffset = getWorkpieceBoundsOffset();

  // X axis (red)
  const xGeometry = new THREE.BufferGeometry();
  xGeometry.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([0, 0, 0, axisLength, 0, 0]), 3
  ));
  const xMaterial = new THREE.LineBasicMaterial({ color: CONFIG.AXIS_RED, linewidth: CONFIG.AXIS_LINE_WIDTH });
  axisLines.x = new THREE.Line(xGeometry, xMaterial);
  axisLines.x.position.set(boundsOffset.x, boundsOffset.y, 0);
  scene.add(axisLines.x);

  // Y axis (green)
  const yGeometry = new THREE.BufferGeometry();
  yGeometry.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([0, 0, 0, 0, axisLength, 0]), 3
  ));
  const yMaterial = new THREE.LineBasicMaterial({ color: CONFIG.AXIS_GREEN, linewidth: CONFIG.AXIS_LINE_WIDTH });
  axisLines.y = new THREE.Line(yGeometry, yMaterial);
  axisLines.y.position.set(boundsOffset.x, boundsOffset.y, 0);
  scene.add(axisLines.y);

  // Z axis (blue)
  const zGeometry = new THREE.BufferGeometry();
  zGeometry.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([0, 0, 0, 0, 0, axisLength]), 3
  ));
  const zMaterial = new THREE.LineBasicMaterial({ color: CONFIG.AXIS_BLUE, linewidth: CONFIG.AXIS_LINE_WIDTH });
  axisLines.z = new THREE.Line(zGeometry, zMaterial);
  axisLines.z.position.set(boundsOffset.x, boundsOffset.y, 0);
  scene.add(axisLines.z);
}

function createToolVisualization(toolDiameter) {
  // Create tool as a Group with two children: tip (blue) and shank (gray)
  // Matches the color scheme of the SVG tool icons on the Tools page
  toolGroup = new THREE.Group();

  const tipMaterial = new THREE.MeshPhongMaterial({
    color: 0x4a9eda,  // Blue matching SVG tool icons
    transparent: true,
    opacity: 0.85,
  });

  const shankMaterial = new THREE.MeshPhongMaterial({
    color: 0x888888,  // Gray matching SVG tool icons
    transparent: true,
    opacity: 0.85,
  });

  const tipMesh = new THREE.Mesh(new THREE.BufferGeometry(), tipMaterial);
  tipMesh.castShadow = CONFIG.ENABLE_SHADOWS;
  tipMesh.receiveShadow = CONFIG.ENABLE_SHADOWS;

  const shankMesh = new THREE.Mesh(new THREE.BufferGeometry(), shankMaterial);
  shankMesh.castShadow = CONFIG.ENABLE_SHADOWS;
  shankMesh.receiveShadow = CONFIG.ENABLE_SHADOWS;

  toolGroup.add(tipMesh);
  toolGroup.add(shankMesh);
  scene.add(toolGroup);

  updateToolMesh(toolDiameter, 0, 0, 0, 'End Mill', 0);
}

// Cache for tool geometry to avoid regenerating every frame
let _cachedToolKey = null;  // "diameter|type|angle"

function updateToolMesh(toolDiameter, posX, posY, posZ, toolType = 'End Mill', toolAngle = 0) {
  if (!toolGroup) return;

  // Apply origin offset so tool aligns with toolpath visualization
  const boundsOffset = getWorkpieceBoundsOffset();
  const offsetPosX = posX - boundsOffset.x;
  const offsetPosY = posY + boundsOffset.y;

  // Only regenerate geometry when tool properties change (not every frame)
  const toolKey = toolDiameter + '|' + toolType + '|' + toolAngle;
  if (toolKey !== _cachedToolKey) {
    _cachedToolKey = toolKey;

    // Generate separate tip and shank geometries
    const { tipGeometry, shankGeometry } = generateToolParts(toolDiameter, toolType, toolAngle);

    // Swap Y↔Z on both geometries to align tool with Z axis (vertical)
    swapYZAxes(tipGeometry);
    swapYZAxes(shankGeometry);

    // Dispose old geometries and assign new ones
    const tipMesh = toolGroup.children[0];
    const shankMesh = toolGroup.children[1];
    if (tipMesh.geometry) tipMesh.geometry.dispose();
    if (shankMesh.geometry) shankMesh.geometry.dispose();
    tipMesh.geometry = tipGeometry;
    shankMesh.geometry = shankGeometry;
  }

  // Position the group at the tool's world location (cheap - just set position)
  toolGroup.position.set(offsetPosX, offsetPosY, posZ);
}

// Swap Y and Z axes in geometry (converts Y-axis-aligned to Z-axis-aligned)
function swapYZAxes(geometry) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    pos.setY(i, z);
    pos.setZ(i, y);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

// Merge two BufferGeometries into one
function mergeToolGeometries(geomA, geomB) {
  const merged = new THREE.BufferGeometry();
  const positions = [], normals = [], indices = [];

  const posA = geomA.attributes.position;
  const normA = geomA.attributes.normal;
  for (let i = 0; i < posA.count; i++) {
    positions.push(posA.getX(i), posA.getY(i), posA.getZ(i));
    if (normA) normals.push(normA.getX(i), normA.getY(i), normA.getZ(i));
  }
  if (geomA.index) {
    for (let i = 0; i < geomA.index.count; i++) indices.push(geomA.index.getX(i));
  }

  const posB = geomB.attributes.position;
  const normB = geomB.attributes.normal;
  const offset = posA.count;
  for (let i = 0; i < posB.count; i++) {
    positions.push(posB.getX(i), posB.getY(i), posB.getZ(i));
    if (normB) normals.push(normB.getX(i), normB.getY(i), normB.getZ(i));
  }
  if (geomB.index) {
    for (let i = 0; i < geomB.index.count; i++) indices.push(geomB.index.getX(i) + offset);
  }

  merged.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  if (normals.length > 0) merged.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  if (indices.length > 0) merged.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  merged.computeVertexNormals();

  geomA.dispose();
  geomB.dispose();
  return merged;
}

// Shift all Y values in a geometry by an offset
function shiftGeometryY(geometry, offset) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, pos.getY(i) + offset);
  }
  pos.needsUpdate = true;
}

// Create a cone geometry with tip at Y=0, base at Y=height (pointing downward)
function createTipCone(radius, height, segments) {
  const geom = new THREE.ConeGeometry(radius, height, segments);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, -pos.getY(i) + height / 2);  // Flip and shift tip to Y=0
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

function generateToolParts(toolDiameter, toolType = 'End Mill', toolAngle = 0) {
  // Returns { tipGeometry, shankGeometry } in Y-axis-aligned local space
  // Tip at Y=0 extending upward. Blue tip = cutting portion, gray shank above.
  const radius = toolDiameter / 2;
  const shankLength = 20;
  const segments = 16;
  const type = (toolType === 'End Mill') ? 'Flat' : toolType;

  let tipGeometry, shankGeometry;

  if (type === 'VBit') {
    // V-bit: cone tip (blue) + cylinder shank (gray)
    const angleRad = (toolAngle / 2) * (Math.PI / 180);
    const coneHeight = radius / Math.tan(angleRad);

    tipGeometry = createTipCone(radius, coneHeight, segments);

    shankGeometry = new THREE.CylinderGeometry(radius, radius, shankLength, segments);
    shiftGeometryY(shankGeometry, coneHeight + shankLength / 2);

  } else if (type === 'BallNose' || type === 'Ball Nose') {
    // Ball nose: sphere + flute cylinder (blue) + shank cylinder (gray)
    const sphereRadius = radius;
    const shaftRadius = radius * 0.75;
    const fluteLength = Math.max(radius * 3, 15);

    // Tip = sphere (bottom at Y=0) + flute cylinder
    const sphereGeom = new THREE.SphereGeometry(sphereRadius, segments, segments);
    shiftGeometryY(sphereGeom, sphereRadius);  // Bottom at Y=0

    const fluteGeom = new THREE.CylinderGeometry(shaftRadius, shaftRadius, fluteLength, segments);
    shiftGeometryY(fluteGeom, sphereRadius * 2 + fluteLength / 2);

    tipGeometry = mergeToolGeometries(sphereGeom, fluteGeom);

    // Shank above flutes
    const shankBottom = sphereRadius * 2 + fluteLength;
    shankGeometry = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shankLength, segments);
    shiftGeometryY(shankGeometry, shankBottom + shankLength / 2);

  } else if (type === 'Drill') {
    // Drill: cone tip + body cylinder (blue) + shank cylinder (gray)
    const tipHeight = radius / Math.tan((59 * Math.PI) / 180);
    const bodyHeight = Math.max(radius * 3, 15);

    const coneGeom = createTipCone(radius, tipHeight, segments);

    const bodyGeom = new THREE.CylinderGeometry(radius, radius, bodyHeight, segments);
    shiftGeometryY(bodyGeom, tipHeight + bodyHeight / 2);

    tipGeometry = mergeToolGeometries(coneGeom, bodyGeom);

    // Shank above drill body
    const shankBottom = tipHeight + bodyHeight;
    shankGeometry = new THREE.CylinderGeometry(radius, radius, shankLength, segments);
    shiftGeometryY(shankGeometry, shankBottom + shankLength / 2);

  } else {
    // End Mill (Flat): flute cylinder (blue) + shank cylinder (gray)
    const fluteLength = Math.max(radius * 3, 15);

    tipGeometry = new THREE.CylinderGeometry(radius, radius, fluteLength, segments);
    shiftGeometryY(tipGeometry, fluteLength / 2);  // Bottom at Y=0

    shankGeometry = new THREE.CylinderGeometry(radius, radius, shankLength, segments);
    shiftGeometryY(shankGeometry, fluteLength + shankLength / 2);
  }

  return { tipGeometry, shankGeometry };
}

function setupLighting() {
  // Get workpiece dimensions for proper light setup
  const { width: workpieceWidth, length: workpieceLength, thickness: workpieceThickness } = getWorkpieceDimensions();
  const maxDim = Math.max(workpieceWidth, workpieceLength);

  // Directional light from above and front (positive Z, negative Y)
  const dirLight = new THREE.DirectionalLight(CONFIG.DIRECTIONAL_LIGHT_COLOR, CONFIG.DIRECTIONAL_LIGHT_INTENSITY);
  dirLight.position.set(0, -maxDim * 0.5, maxDim);
  dirLight.castShadow = CONFIG.ENABLE_SHADOWS;
  if (CONFIG.ENABLE_SHADOWS) {
    const shadowScale = CONFIG.DIRECTIONAL_LIGHT_SHADOW_SCALE;
    dirLight.shadow.camera.left = -maxDim * shadowScale;
    dirLight.shadow.camera.right = maxDim * shadowScale;
    dirLight.shadow.camera.top = maxDim * shadowScale;
    dirLight.shadow.camera.bottom = -maxDim * shadowScale;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = workpieceThickness + maxDim;
  }
  scene.add(dirLight);

  // Ambient light for overall illumination
  const ambientLight = new THREE.AmbientLight(CONFIG.AMBIENT_LIGHT_COLOR, CONFIG.AMBIENT_LIGHT_INTENSITY);
  scene.add(ambientLight);

  // Create grid with user's gridSize setting
  updateGridSize3D();
}

function updateGridSize3D(gridSizeMM) {
  // Update 3D grid to match the user's gridSize setting
  if (!scene) return;  // Scene not initialized yet

  // Use provided gridSize or fall back to getOption
  if (gridSizeMM === undefined) {
    gridSizeMM = (typeof getOption === 'function') ? getOption("gridSize") : 10;
  }

  gridSizeMM = Math.max(gridSizeMM || CONFIG.DEFAULT_GRID_SIZE, 0.1);

  // Get workpiece dimensions
  const { width: workpieceWidth, length: workpieceLength, thickness: workpieceThickness } = getWorkpieceDimensions();
  const maxDim = Math.max(workpieceWidth, workpieceLength);

  // Remove old grid if it exists
  if (gridHelper3D && scene) {
    scene.remove(gridHelper3D);
  }

  const displaySize = Math.max(
    maxDim * CONFIG.GRID_DISPLAY_SIZE_MULTIPLIER,
    maxDim * CONFIG.GRID_MAX_SIZE_MULTIPLIER,
    gridSizeMM * CONFIG.GRID_MIN_DIVISIONS
  );
  const stepForDisplay = currentGridStep3D || gridSizeMM;
  const gridDivisions = Math.max(
    CONFIG.GRID_MIN_DIVISIONS,
    Math.min(CONFIG.GRID_MAX_DIVISIONS, Math.round(displaySize / stepForDisplay))
  );

  gridHelper3D = new THREE.GridHelper(displaySize, gridDivisions, CONFIG.GRID_COLOR, CONFIG.GRID_COLOR);
  gridHelper3D.userData.baseGridSizeMM = gridSizeMM;
  gridHelper3D.userData.activeGridStepMM = stepForDisplay;

  // Position grid on X-Y plane at bottom of workpiece
  gridHelper3D.rotation.x = CONFIG.GRID_ROTATION_X;
  gridHelper3D.position.z = -workpieceThickness;

  scene.add(gridHelper3D);
}

function updateProgressiveGrid3D(force = false) {
  if (!scene || !orbitControls) return;

  const baseGridSizeMM = (typeof getOption === 'function') ? getOption("gridSize") : CONFIG.DEFAULT_GRID_SIZE;
  const safeBaseGridSizeMM = Math.max(baseGridSizeMM || CONFIG.DEFAULT_GRID_SIZE, 0.1);
  const scaleFactor = CONFIG.GRID_PROGRESSIVE_SCALE_FACTOR;
  const distanceDivisor = CONFIG.GRID_PROGRESSIVE_DISTANCE_DIVISOR;
  const desiredStep = Math.max(safeBaseGridSizeMM, orbitControls.distance / distanceDivisor);

  let progressiveStep = safeBaseGridSizeMM;
  while (progressiveStep < desiredStep) {
    progressiveStep *= scaleFactor;
  }

  if (!force && currentGridStep3D === progressiveStep && gridHelper3D) return;

  currentGridStep3D = progressiveStep;
  updateGridSize3D(safeBaseGridSizeMM);
  requestThreeRender();
}

// Export functions for external access
window.threeScene = null; // Will be set after init
window.updateGridSize3D = updateGridSize3D;

function updateWorkpiece3D(width, length, thickness, originPosition, material) {
  // Update 3D workpiece with new dimensions and material color
  if (!scene || !workpieceManager) return;  // Scene or workpiece not initialized yet

  // Use provided values or fall back to getOption
  if (width === undefined) {
    width = (typeof getOption === 'function') ? getOption('workpieceWidth') : 200;
  }
  if (length === undefined) {
    length = (typeof getOption === 'function') ? getOption('workpieceLength') : 200;
  }
  if (thickness === undefined) {
    thickness = (typeof getOption === 'function') ? getOption('workpieceThickness') : 50;
  }
  if (originPosition === undefined) {
    originPosition = (typeof getOption === 'function') ? getOption('originPosition') : 'middle-center';
  }
  if (material === undefined) {
    material = (typeof getOption === 'function') ? getOption('material') : 'Softwood / MDF';
  }

  // Get material color from database
  const materialColor = getMaterialColor(material);
  const previousOriginPosition = workpieceManager.originPosition || 'middle-center';
  const dimensionsChanged =
    workpieceManager.width !== width ||
    workpieceManager.length !== length ||
    workpieceManager.thickness !== thickness;

  if (dimensionsChanged) {
    // Dimensions impact voxel geometry and stock mesh size, so rebuild the workpiece
    scene.remove(workpieceManager.mesh);
    if (workpieceManager.mesh.geometry) workpieceManager.mesh.geometry.dispose();
    if (workpieceManager.mesh.material) workpieceManager.mesh.material.dispose();

    workpieceManager = new WorkpieceManager(scene, width, length, thickness, originPosition, materialColor);
    workpieceManager.mesh.visible = true;

    if (toolpathAnimation) {
      toolpathAnimation.workpieceManager = workpieceManager;
    }
  } else {
    // Origin change only: keep the workpiece fixed and move only the axes helper
    workpieceManager.originPosition = originPosition;
    workpieceManager.materialColor = materialColor;
    if (workpieceManager.mesh && workpieceManager.mesh.material) {
      workpieceManager.mesh.material.color.set(materialColor);
    }

    const boundsOffset = getWorkpieceBoundsOffset(originPosition, width, length);

    if (axisLines.x) axisLines.x.position.set(boundsOffset.x, boundsOffset.y, 0);
    if (axisLines.y) axisLines.y.position.set(boundsOffset.x, boundsOffset.y, 0);
    if (axisLines.z) axisLines.z.position.set(boundsOffset.x, boundsOffset.y, 0);
  }

  sync3DVisibilityControls();
  requestThreeRender();
}

window.updateWorkpiece3D = updateWorkpiece3D;

// Wrapper functions for 3D simulation controls called from bootstrap-layout.js
window.setAxesVisibility3D = function(visible) {
  if (axisLines.x) axisLines.x.visible = visible;
  if (axisLines.y) axisLines.y.visible = visible;
  if (axisLines.z) axisLines.z.visible = visible;
  requestThreeRender();
};

window.setToolpathVisibility3D = function(visible) {
  if (!toolpathAnimation || !toolpathAnimation.toolpathLines) return;
  for (const line of toolpathAnimation.toolpathLines) {
    line.visible = visible;
  }
  requestThreeRender();
};

window.setWorkpieceVisibility3D = function(visible) {
  // Instead of toggling visibility (which causes GPU corruption), move meshes off-screen
  // This keeps them rendering but hidden from view, avoiding blotchy discoloration
  const offscreenPosition = new THREE.Vector3(10000, 10000, 10000);  // Far behind camera
  const fixedWorkpiecePosition = new THREE.Vector3(0, 0, 0);

  // Keep workpiece fixed in the 3D scene regardless of origin choice
  if (workpieceManager && workpieceManager.mesh) {
    workpieceManager.mesh.position.copy(visible ? fixedWorkpiecePosition : offscreenPosition);
  }

  // Keep filler workpiece boxes fixed too
  if (toolpathAnimation && toolpathAnimation.workpieceOutlineBox) {
    toolpathAnimation.workpieceOutlineBox.position.copy(visible ? fixedWorkpiecePosition : offscreenPosition);
  }

  // Keep voxel grid fixed too
  if (toolpathAnimation && toolpathAnimation.voxelGrid && toolpathAnimation.voxelGrid.mesh) {
    toolpathAnimation.voxelGrid.mesh.position.copy(visible ? fixedWorkpiecePosition : offscreenPosition);
  }

  requestThreeRender();
};

window.startSimulation3D = function() {
  if (toolpathAnimation && !toolpathAnimation.isPlaying) {
    // If at the end of the file, reset to beginning. Otherwise continue from current line.
    if (toolpathAnimation.currentGcodeLineNumber >= toolpathAnimation.totalGcodeLines - 1) {
      toolpathAnimation.setProgress(0);
    }

    // Read speed from slider and apply it before playing
    const speedSlider = document.getElementById('3d-simulation-speed');
    if (speedSlider) {
      const sliderSpeed = parseFloat(speedSlider.value);
      toolpathAnimation.setSpeed(sliderSpeed);
    }

    toolpathAnimation.play();

    updateSimulation3DUI();
    if (animationFrameId === null) {
      animationFrameId = requestAnimationFrame(animate);
    }
  }
};

window.pauseSimulation3D = function() {
  if (toolpathAnimation && toolpathAnimation.isPlaying) {
    toolpathAnimation.pause();
    updateSimulation3DUI();
    requestThreeRender();
  }
};

window.stopSimulation3D = function() {
  if (toolpathAnimation) {
    toolpathAnimation.pause();
    toolpathAnimation.wasStopped = true;  // Mark that we were stopped (not paused)
    updateSimulation3DUI();
    requestThreeRender();
  }
};

window.updateSimulation3DSpeed = function(speed) {
  if (toolpathAnimation) {
    toolpathAnimation.setSpeed(speed);
    requestThreeRender();
  }
};

window.setSimulation3DProgress = function(lineNumber) {
  if (toolpathAnimation) {
    // Seek animation to this line
    toolpathAnimation.seekToLineNumber(lineNumber);
    // Update button states after seeking (wasStopped flag was reset)
    updateSimulation3DUI();
    requestThreeRender();
  }
};

/**
 * Format seconds to MM:SS format
 * @param {number} seconds - Total seconds
 * @returns {string} - Formatted time string "MM:SS"
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
/**
 * Update 3D simulation display elements
 */
function updateSimulation3DDisplays() {
  scheduleSimulation3DUI(true);
}

function updateSimulation3DUI() {
  const ui = getSimulation3DUIElements();
  const startBtn = ui.startBtn;
  const pauseBtn = ui.pauseBtn;
  const stopBtn = ui.stopBtn;

  if (!startBtn || !pauseBtn || !stopBtn) return;

  const hasAnimation = toolpathAnimation != null;
  const isPlaying = hasAnimation && toolpathAnimation.isPlaying;

  if (isPlaying) {
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
  } else {
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = !hasAnimation;
  }

  // Update all displays including progress slider
  scheduleSimulation3DUI(true);
}

function animate() {
  // If animation loop is disabled (switched to 2D view), stop here
  if (!animationLoopActive) {
    animationFrameId = null;
    renderRequested = false;
    return;
  }

  const isPlaying = !!(toolpathAnimation && toolpathAnimation.isPlaying);
  if (isPlaying) {
    animationFrameId = requestAnimationFrame(animate);
  } else {
    animationFrameId = null;
  }

  // Increment frame counter for profiling
  profileFrameCount++;

  // Measure component times
  const updateStart = performance.now();

  // Only update animation if it's actually playing (saves CPU when paused)
  if (isPlaying) {
    toolpathAnimation.update();

    // Camera follows tool when checkbox is checked
    const followToolCheckbox = getSimulation3DUIElements().followToolCheckbox;
    if (followToolCheckbox && followToolCheckbox.checked && toolGroup && orbitControls) {
      orbitControls.target.copy(toolGroup.position);
      orbitControls.updateCamera();
    }

    // Update 3D display during animation via a single throttled UI flush.
    scheduleSimulation3DUI(false);

    // If animation has completed this frame, update UI to re-enable play button
    if (!toolpathAnimation.isPlaying) {
      updateSimulation3DUI();
    }
  }
  const updateTime = performance.now() - updateStart;

  // Skip rendering while window is being resized to avoid WebGL context issues
  if (!isResizing) {
    const renderStart = performance.now();
    renderThreeScene();
    const renderTime = performance.now() - renderStart;

    /*
    // Track timing stats
    if (!window.timingStats) {
      window.timingStats = { updateTotal: 0, renderTotal: 0, count: 0 };
    }
    window.timingStats.updateTotal += updateTime;
    window.timingStats.renderTotal += renderTime;
    window.timingStats.count++;
    */

    // Report FPS every 300 frames using wall-clock timing (includes all overhead)
    /*
    if (profileFrameCount % 300 === 0) {
      const now = performance.now();
      const elapsedSeconds = (now - profileStartTime) / 1000;
      const fps = (profileFrameCount / elapsedSeconds).toFixed(1);
      const avgUpdate = (window.timingStats.updateTotal / window.timingStats.count).toFixed(2);
      const avgRender = (window.timingStats.renderTotal / window.timingStats.count).toFixed(2);


      // Reset for next 300 frames
      profileFrameCount = 0;
      profileStartTime = now;
      window.timingStats.updateTotal = 0;
      window.timingStats.renderTotal = 0;
      window.timingStats.count = 0;
    }
    */
  }
}

  function doResize() {
      const container = document.getElementById('3d-canvas-container');
      if (!container || !renderer || !camera) return;

      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;

      if (newWidth > 0 && newHeight > 0) {
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight, false);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.MAX_PIXEL_RATIO));
      }
  }

// ============ CLEANUP FUNCTION (CRITICAL FIX 1.2) ============
/**
 * Comprehensive cleanup function to prevent memory leaks
 * Disposes all Three.js resources and removes DOM elements
 * Called when switching away from 3D view tab
 */
function cleanup3DView() {

  if (deferredSTLVisibilitySyncId) {
    clearTimeout(deferredSTLVisibilitySyncId);
    deferredSTLVisibilitySyncId = null;
  }

  // Stop animation loop
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  renderRequested = false;

  // Clear resize timeout if pending
  if (resizeTimeoutId) {
    clearTimeout(resizeTimeoutId);
    resizeTimeoutId = null;
  }

  if (resizeObserver3D) {
    resizeObserver3D.disconnect();
    resizeObserver3D = null;
  }

  // Stop simulation and dispose voxel grid (stored in toolpathAnimation)
  if (toolpathAnimation) {
    if (typeof toolpathAnimation.stop === 'function') {
      toolpathAnimation.stop();
    }

    if (toolpathAnimation._gcodePreprocessWorker) {
      toolpathAnimation._gcodePreprocessWorker.terminate();
      toolpathAnimation._gcodePreprocessWorker = null;
    }

    // Dispose voxel grid (stored within toolpathAnimation instance)
    if (toolpathAnimation.voxelGrid) {
      if (typeof toolpathAnimation.voxelGrid.dispose === 'function') {
        toolpathAnimation.voxelGrid.dispose();
      }
      if (toolpathAnimation.voxelGrid.mesh && scene) {
        scene.remove(toolpathAnimation.voxelGrid.mesh);
      }
      toolpathAnimation.voxelGrid = null;
    }

    // Clear voxel material remover (stored within toolpathAnimation)
    if (toolpathAnimation.voxelMaterialRemover) {
      toolpathAnimation.voxelMaterialRemover = null;
    }

    toolpathAnimation = null;
  }

  // Dispose tool group (tip + shank meshes)
  if (toolGroup) {
    toolGroup.children.forEach(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    if (scene) scene.remove(toolGroup);
    toolGroup = null;
  }
  _cachedToolKey = null;  // Reset so tool geometry is regenerated on reopen

  // Dispose toolpath visualizer (stored in toolpathAnimation, but check if accessible)
  if (toolpathVisualizer && toolpathVisualizer.mesh) {
    const mesh = toolpathVisualizer.mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
    if (scene) scene.remove(mesh);
  }
  toolpathVisualizer = null;

  // Dispose workpiece
  if (workpieceManager) {
    if (workpieceManager.mesh) {
      if (workpieceManager.mesh.geometry) {
        workpieceManager.mesh.geometry.dispose();
      }
      if (workpieceManager.mesh.material) {
        workpieceManager.mesh.material.dispose();
      }
      if (scene) scene.remove(workpieceManager.mesh);
    }
    if (typeof workpieceManager.dispose === 'function') {
      workpieceManager.dispose();
    }
    workpieceManager = null;
  }

  // Dispose grid helper
  if (gridHelper3D) {
    if (gridHelper3D.geometry) gridHelper3D.geometry.dispose();
    if (gridHelper3D.material) gridHelper3D.material.dispose();
    if (scene) scene.remove(gridHelper3D);
    gridHelper3D = null;
  }

  // Dispose axis line helpers
  ['x', 'y', 'z'].forEach(axis => {
    if (axisLines[axis]) {
      const line = axisLines[axis];
      if (line.geometry) line.geometry.dispose();
      if (line.material) line.material.dispose();
      if (scene) scene.remove(line);
      axisLines[axis] = null;
    }
  });

  // Dispose all lights in scene
  if (scene) {
    scene.children.forEach(child => {
      if (child instanceof THREE.Light) {
        scene.remove(child);
        if (child.shadow) {
          if (child.shadow.map) child.shadow.map.dispose();
        }
      }
    });
  }

  // Clear scene
  if (scene) {
    scene.clear();
    scene = null;
  }
  window.threeScene = null;

  // Clear STL mesh references so they get re-added when 3D tab reopens
  if (window.stlModels) {
    for (const model of window.stlModels) {
      model.mesh = null;
    }
  }

  // Dispose renderer
  if (renderer) {
    renderer.dispose();
    const canvas = renderer.domElement;
    if (canvas && canvas.parentElement) {
      canvas.parentElement.removeChild(canvas);
    }
    renderer = null;
  }

  // Dispose orbit controls
  if (orbitControls) {
    if (typeof orbitControls.dispose === 'function') {
      orbitControls.dispose();
    }
    orbitControls = null;
  }

  // Reset all state variables
  camera = null;
  initialized = false;
  profileFrameCount = 0;
  profileStartTime = performance.now();

}

// Export cleanup function globally for use by bootstrap-layout.js
window.cleanup3DView = cleanup3DView;

// ============ VISIBILITY TOGGLES (PHASE 3.3) ============
/**
 * Toggle grid helper visibility
 * @param {boolean} visible - Whether grid should be visible
 */
function toggleGridHelper3D(visible) {
  if (!scene) return;

  if (visible && !gridHelper3D) {
    // Create grid if it doesn't exist
    const { width: workpieceWidth, length: workpieceLength } = getWorkpieceDimensions();
    const maxDim = Math.max(workpieceWidth, workpieceLength);
    const gridSizeMM = (typeof getOption === 'function') ? getOption("gridSize") : 10;
    const displaySize = maxDim * CONFIG.GRID_DISPLAY_SIZE_MULTIPLIER;
    const gridDivisions = Math.ceil(displaySize / gridSizeMM);

    gridHelper3D = new THREE.GridHelper(displaySize, gridDivisions, CONFIG.GRID_COLOR, CONFIG.GRID_COLOR);
    gridHelper3D.rotation.x = CONFIG.GRID_ROTATION_X;
    gridHelper3D.position.z = -getWorkpieceDimensions().thickness;
    scene.add(gridHelper3D);
  } else if (!visible && gridHelper3D) {
    // Remove grid
    scene.remove(gridHelper3D);
    gridHelper3D.geometry.dispose();
    gridHelper3D.material.dispose();
    gridHelper3D = null;
  }
}

/**
 * Toggle axis helper visibility
 * @param {boolean} visible - Whether axes should be visible
 */
function toggleAxisHelper3D(visible) {
  if (!scene) return;

  const axisId = 'axisHelper3D';  // Use a special ID to find it

  if (visible && !axisLines.x) {
    // Create axis helper if it doesn't exist
    // Create 3 lines for X, Y, Z axes
    const axisLength = CONFIG.AXIS_LENGTH;

    // X axis (red)
    const xGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(axisLength, 0, 0)
    ]);
    const xMaterial = new THREE.LineBasicMaterial({ color: CONFIG.AXIS_RED, linewidth: CONFIG.AXIS_LINE_WIDTH });
    axisLines.x = new THREE.Line(xGeometry, xMaterial);
    scene.add(axisLines.x);

    // Y axis (green)
    const yGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, axisLength, 0)
    ]);
    const yMaterial = new THREE.LineBasicMaterial({ color: CONFIG.AXIS_GREEN, linewidth: CONFIG.AXIS_LINE_WIDTH });
    axisLines.y = new THREE.Line(yGeometry, yMaterial);
    scene.add(axisLines.y);

    // Z axis (blue)
    const zGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, axisLength)
    ]);
    const zMaterial = new THREE.LineBasicMaterial({ color: CONFIG.AXIS_BLUE, linewidth: CONFIG.AXIS_LINE_WIDTH });
    axisLines.z = new THREE.Line(zGeometry, zMaterial);
    scene.add(axisLines.z);

  } else if (!visible && axisLines.x) {
    // Remove axes
    ['x', 'y', 'z'].forEach(axis => {
      if (axisLines[axis]) {
        scene.remove(axisLines[axis]);
        axisLines[axis].geometry.dispose();
        axisLines[axis].material.dispose();
        axisLines[axis] = null;
      }
    });
  }
}

// Export visibility toggles globally
window.toggleGridHelper3D = toggleGridHelper3D;
window.toggleAxisHelper3D = toggleAxisHelper3D;

// ============ DRY HELPER FUNCTIONS (PHASE 3.6) ============
/**
 * Execute a callback while preserving animation play state
 * Pauses animation if playing, executes callback, resumes if was playing
 * Useful for operations that need to pause animation temporarily (seeking, speed changes, etc.)
 * @param {Function} callback - Function to execute while animation is paused
 */
function withAnimationPaused(callback) {
  if (!toolpathAnimation) {
    // No animation to pause, just run callback
    callback();
    return;
  }

  const wasPlaying = toolpathAnimation.isPlaying;

  // Pause if currently playing
  if (wasPlaying) {
    toolpathAnimation.pause();
  }

  try {
    // Execute callback
    callback();
  } finally {
    // Always resume if was playing (even if callback throws)
    if (wasPlaying && toolpathAnimation) {
      toolpathAnimation.play();
      // Restart animation loop if it's not running
      if (!animationFrameId && animationLoopActive) {
        renderRequested = false;
        animationFrameId = requestAnimationFrame(animate);
      }
    } else {
      requestThreeRender();
    }
  }
}

// Export helper function globally
window.withAnimationPaused = withAnimationPaused;


// ============ WORKPIECE MANAGER ============
class WorkpieceManager {
  constructor(scene, width, length, thickness, originPosition, materialColor) {
    this.scene = scene;
    this.width = width;
    this.length = length;
    this.thickness = thickness;
    this.originPosition = originPosition || 'middle-center';
    this.materialColor = materialColor || 0x8B7355;  // Default wood color if not provided

    // Keep the 3D workpiece physically centered in the scene.
    // Origin changes are represented only by the axes/toolpath offsets.
    // The stock stays centered in X/Y and spans from Z=0 to Z=-thickness.
    const geometry = new THREE.BoxGeometry(width, length, thickness, 1, 1, 1);
    const matrix = new THREE.Matrix4();
    matrix.makeTranslation(0, 0, -thickness / 4);
    geometry.applyMatrix4(matrix);

    const material = new THREE.MeshPhongMaterial({
      color: this.materialColor,  // Use wood species color
      shininess: 30,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    // Store original vertices for deformation
    this.geometry = geometry;
    this.originalPositions = geometry.attributes.position.array.slice();
  }

  calculateBounds(width, length, thickness, originPosition) {
    // Calculate where the workpiece box should be positioned based on origin
    // Top surface is always at Z = 0, bottom at Z = -thickness
    // X and Y positioning depends on originPosition

    let minX, maxX, minY, maxY;

    // Handle X (width) positioning
    switch (originPosition) {
      case 'top-left':
      case 'middle-left':
      case 'bottom-left':
        minX = 0;
        maxX = width;
        break;
      case 'top-center':
      case 'middle-center':
      case 'bottom-center':
        minX = -width / 2;
        maxX = width / 2;
        break;
      case 'top-right':
      case 'middle-right':
      case 'bottom-right':
        minX = -width;
        maxX = 0;
        break;
      default:
        minX = -width / 2;
        maxX = width / 2;
    }

    // Handle Y (length) positioning
    switch (originPosition) {
      case 'top-left':
      case 'top-center':
      case 'top-right':
        minY = -length;
        maxY = 0;
        break;
      case 'middle-left':
      case 'middle-center':
      case 'middle-right':
        minY = -length / 2;
        maxY = length / 2;
        break;
      case 'bottom-left':
      case 'bottom-center':
      case 'bottom-right':
        minY = 0;
        maxY = length;
        break;
      default:
        minY = -length / 2;
        maxY = length / 2;
    }

    return {
      minX: minX,
      maxX: maxX,
      minY: minY,
      maxY: maxY,
      minZ: -thickness,  // Bottom surface
      maxZ: 0            // Top surface
    };
  }

  reset() {
    const pos = this.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, this.originalPositions[i * 3]);
      pos.setY(i, this.originalPositions[i * 3 + 1]);
      pos.setZ(i, this.originalPositions[i * 3 + 2]);
    }
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

// ============ TOOLPATH ANIMATION ============
class ToolpathAnimation {
  constructor(workpieceManager, toolpathVisualizer, scene) {
    this.workpieceManager = workpieceManager;
    this.toolpathVisualizer = toolpathVisualizer;
    this.scene = scene;

    this.isPlaying = false;
    this.speed = 1.0;  // Speed multiplier for animation
    this.toolpaths = [];
    this.flattenedPath = [];
    this.currentPathIndex = 0;
    this.lastDeformedIndex = 0;  // Track last deformed point to avoid redundant work
    this.onStatusChange = null;
    this.toolVisual = null;
    this.toolRadius = 1;
    this.toolpathLines = [];  // Store references to line meshes for cleanup
    this.movementTiming = [];  // Array of movement timings with G-code line numbers
    this.lastSubtractionSegmentIndex = -1;  // Track last segment where we performed subtraction
    this.toolCommentsInOrder = [];  // Array of tool comments in chronological order for tool switching

    // G-code text for line iteration
    this.gcodeLines = [];  // Array of G-code lines (split from gcode text)

    // Movement-index-driven animation state (PRIMARY STATE)
    this.currentMovementIndex = 0;  // Index into movementTiming array (source of truth)
    this.currentGcodeLineNumber = 0;  // Derived from movementTiming[currentMovementIndex].gcodeLineNumber for display
    this.totalGcodeLines = 0;  // Total number of G-code lines (for display/progress)
    this.justSeeked = false;  // Flag to prevent advancing on frame immediately after seek
    this.justAdvancedLine = false;  // Flag to skip tool update on frame we advance lines
    this.wasStopped = false;  // Flag to track if stopped (vs paused) - affects play behavior

    // Time-based animation (internal, for interpolation within current movement)
    this.elapsedTime = 0;  // Elapsed time within current movement in seconds
    this.totalAnimationTime = 0;  // Total animation time in seconds

    // Display and tool state
    this.currentFeedRate = 0;  // Current feed rate in mm/min
    this.currentToolInfo = null;  // Current tool being used
    this.lineNumberToTimeMap = new Map();  // Map: lineNumber -> cumulativeTime (for progress display)
    this.totalJobTime = 0;  // Pre-calculated total job time in seconds

    // Voxel-based material removal
    this.voxelGrid = null;
    this.voxelMaterialRemover = new VoxelMaterialRemover();
    this.voxelSize = CONFIG.DEFAULT_VOXEL_SIZE;  // Default voxel size in X/Y tuned for interactive performance
    this.enableVoxelRemoval = true;  // Toggle for voxel removal feature

    // PHASE 2.1: Track last voxel config to avoid unnecessary recreation
    this.lastVoxelConfig = null;

    // Tool lookup by line number (sparse array - only stores tool change points)
    this.toolChangePoints = [];  // Array of {lineNumber, toolInfo} - only tool changes, not every line

    this.frameCount = 0;
    this.voxelRemovalRate = 1;
    this._gcodePreprocessWorker = null;
    this._gcodePreprocessRequestId = 0;
    resetSimulation3DUIThrottle();
    getSimulation3DUIElements();
  }

  clearToolpath() {
    // Remove all toolpath line meshes from the scene
    for (const line of this.toolpathLines) {
      this.scene.remove(line);
      if (line.geometry) line.geometry.dispose();
      if (line.material) line.material.dispose();
    }
    this.toolpathLines = [];
  }

  /**
   * Calculate bounding box of all toolpaths with padding
   * @returns {Object} {minX, maxX, minY, maxY, minZ, maxZ} with padding applied
   */
  calculateToolPathBounds() {
    const padding = 4;  // 10mm padding around toolpath bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let hasCuttingMoves = false;

    // Iterate through only G1 (cutting) movements, excluding G0 (rapid) moves
    if (this.movementTiming && this.movementTiming.length > 0) {
      for (const move of this.movementTiming) {
        // Only include G1 moves (cutting), skip G0 rapids
        if (move.isG1) {
          minX = Math.min(minX, move.x);
          maxX = Math.max(maxX, move.x);
          minY = Math.min(minY, move.y);
          maxY = Math.max(maxY, move.y);
          minZ = Math.min(minZ, move.z);
          maxZ = Math.max(maxZ, move.z);
          hasCuttingMoves = true;
        }
      }
    }

    // If no cutting moves found, return null
    if (!hasCuttingMoves) {
      return null;
    }

    // Apply padding
    return {
      minX: minX - padding,
      maxX: maxX + padding,
      minY: minY - padding,
      maxY: maxY + padding,
      minZ: minZ - padding,
      maxZ: maxZ + padding
    };
  }

  initializeVoxelGrid() {
    try {
      // Get workpiece dimensions from the manager
      if (!this.workpieceManager) {
        console.warn('Voxel grid: workpiece manager not available');
        return;
      }

      const width = this.workpieceManager.width;
      const length = this.workpieceManager.length;
      const thickness = this.workpieceManager.thickness;

      if (!width || !length || !thickness) {
        console.warn('Voxel grid: invalid workpiece dimensions', { width, length, thickness });
        return;
      }

      // Save original voxel size before the auto-scaling loop below modifies it.
      // The quadtree always uses the original fine resolution — it only places fine
      // cells where the tool cuts, so it doesn't need the uniform-grid scaling.
      const originalVoxelSize = this.voxelSize;

      // PHASE 2.1: Check if dimensions have actually changed before recreating
      const currentConfig = {
        width,
        length,
        thickness,
        voxelSize: this.voxelSize,
        boundsOffset: getWorkpieceBoundsOffset()
      };

      // Quick check if voxel grid exists and has same dimensions
      const configChanged = !this.lastVoxelConfig ||
        this.lastVoxelConfig.width !== currentConfig.width ||
        this.lastVoxelConfig.length !== currentConfig.length ||
        this.lastVoxelConfig.thickness !== currentConfig.thickness ||
        this.lastVoxelConfig.voxelSize !== currentConfig.voxelSize;

      if (!configChanged && this.voxelGrid) {
        return;  // Dimensions haven't changed, keep using existing voxel grid
      }

      // Dispose of old voxel grid only if we need to recreate
      if (this.voxelGrid) {
        const voxelMesh = this.voxelGrid.getMesh();
        this.scene.remove(voxelMesh);
        this.voxelGrid.dispose();
      }

      // Remove old wireframe shell if it exists
      if (this.workpieceOutlineBox) {
        this.scene.remove(this.workpieceOutlineBox);
      }

      // Get workpiece color
     const materialColor = this.workpieceManager.materialColor || 0x8B6914;
     // const materialColor = 0xff0000; // red for testing

      // Calculate toolpath bounding box
      const bounds = this.calculateToolPathBounds();
      let gridWidth = width;
      let gridLength = length;
      let gridThickness = thickness;
      let gridOrigin = new THREE.Vector3(0, 0, 0);

      // No toolpaths: use a small 10x10mm voxel grid at center.
      // The outline box filler will cover the rest of the workpiece seamlessly.
      if (!bounds) {
        gridWidth = Math.min(10, width);
        gridLength = Math.min(10, length);
      }

      if (bounds) {
        // Calculate material bounds in world space (accounting for origin position)
        const boundsOffset = getWorkpieceBoundsOffset();
        const materialMinX = -width / 2 + boundsOffset.x;
        const materialMaxX = width / 2 + boundsOffset.x;
        const materialMinY = -length / 2 - boundsOffset.y;  // Y is inverted in 3D
        const materialMaxY = length / 2 - boundsOffset.y;
        const materialMinZ = -thickness;
        const materialMaxZ = 0;

        // Clip toolpath bounds to material bounds first
        const clippedMinX = Math.max(bounds.minX, materialMinX);
        const clippedMaxX = Math.min(bounds.maxX, materialMaxX);
        const clippedMinY = Math.max(bounds.minY, materialMinY);
        const clippedMaxY = Math.min(bounds.maxY, materialMaxY);
        const clippedMinZ = Math.max(bounds.minZ, materialMinZ);
        const clippedMaxZ = Math.min(bounds.maxZ, materialMaxZ);

        let clippedWidth = clippedMaxX - clippedMinX;
        let clippedLength = clippedMaxY - clippedMinY;
        this.voxelSize = CONFIG.DEFAULT_VOXEL_SIZE;

        // Toolpath is entirely outside the (resized) workpiece — skip bounds-based sizing
        if (clippedWidth > 0 && clippedLength > 0) {
        let numberOfVoxels = clippedWidth * clippedLength / (this.voxelSize * this.voxelSize);
      
          while (numberOfVoxels > CONFIG.MAX_VOXELS) {
              this.voxelSize += CONFIG.VOXEL_SIZE_INCREMENT;
              numberOfVoxels = clippedWidth * clippedLength / (this.voxelSize * this.voxelSize);
          }
        }

        // Round clipped bounds UP to clean voxel boundaries to ensure all in-bounds toolpath is captured
        const toolpathWidthMM = Math.ceil((clippedMaxX - clippedMinX) / this.voxelSize) * this.voxelSize;
        const toolpathLengthMM = Math.ceil((clippedMaxY - clippedMinY) / this.voxelSize) * this.voxelSize;

        // Final clip to material bounds (safety check)
        gridWidth = Math.min(toolpathWidthMM, width);
        gridLength = Math.min(toolpathLengthMM, length);
        gridThickness = thickness;  // Always use full material thickness for 2D height-based voxels

        // Use clipped bounds center for grid origin
        // (material bounds are already offset, so clipped bounds are in correct space)
        gridOrigin = new THREE.Vector3(
          (clippedMinX + clippedMaxX) / 2,
          (clippedMinY + clippedMaxY) / 2,
          0  // Keep Z at surface
        );
      }


      // Build adaptive quadtree voxel grid.
      // Coarse 8mm cells fill uncut areas; fine cells (≈ originalVoxelSize) are placed
      // only where the tool actually cuts, so we always use the original fine resolution
      // rather than the auto-scaled value computed for the uniform grid above.
      this.voxelSize = originalVoxelSize;  // restore before passing to quadtree
      const qtGrid = new QuadtreeVoxelGrid(
        gridWidth, gridLength, gridThickness,
        originalVoxelSize, gridOrigin, materialColor
      );

      // Annotate each movement with the active tool radius so buildFromMovements
      // can sample each path segment at the correct density for that tool.
      const defaultRadius = this.toolRadius || 1;
      for (const move of this.movementTiming) {
        const toolData = this.getToolForLine(move.gcodeLineNumber);
        move.toolRadius = toolData?.diameter ? toolData.diameter / 2 : defaultRadius;
      }

      // maxToolRadius is still passed as fallback for any unannotated moves
      let maxToolRadius = defaultRadius;
      for (const tc of this.toolChangePoints) {
        if (tc.toolInfo?.diameter) {
          maxToolRadius = Math.max(maxToolRadius, tc.toolInfo.diameter / 2);
        }
      }

      qtGrid.buildFromMovements(this.movementTiming, maxToolRadius);
      this.voxelGrid = qtGrid;

      // Add voxel mesh to scene (single 2D height-based mesh)
      const voxelMesh = this.voxelGrid.getMesh();
      this.scene.add(voxelMesh);

      // Offset voxel grid so workpiece center aligns with 3D origin
      const boundsOffset = getWorkpieceBoundsOffset();
      voxelMesh.position.x = -boundsOffset.x;
      voxelMesh.position.y = boundsOffset.y;
      voxelMesh.position.z = 0;

      // Create solid boxes filling gaps between workpiece and voxel grid
      this.createWorkpieceOutlineBox(width, length, thickness, gridWidth, gridLength, gridOrigin);

      // Hide original workpiece mesh when voxels are active (voxels replace the visual representation)
      if (this.workpieceManager && this.workpieceManager.mesh) {
        this.workpieceManager.mesh.visible = false;
      }

      // Reset material remover
      this.voxelMaterialRemover.reset();

      // PHASE 2.1: Save current config so we don't recreate unnecessarily
      this.lastVoxelConfig = currentConfig;

    } catch (error) {
      console.error('Error initializing voxel grid:', error);
      this.enableVoxelRemoval = false;  // Disable voxel removal if initialization fails
    }
  }

  /**
   * Create single InstancedMesh with 4 large filler voxels
   * Fills gaps between workpiece edges and voxel grid edges
   * Uses exact same coloring as main voxel grid for seamless appearance
   * @param {number} width - Workpiece width in mm
   * @param {number} length - Workpiece length in mm
   * @param {number} thickness - Workpiece thickness in mm
   * @param {number} gridWidth - Voxel grid width in mm
   * @param {number} gridLength - Voxel grid length in mm
   * @param {THREE.Vector3} gridOrigin - Center position of voxel grid in world space
   */
  createWorkpieceOutlineBox(width, length, thickness, gridWidth, gridLength, gridOrigin) {
    // Get workpiece color
    let materialColor;
    if (typeof getOption === 'function') {
      materialColor = getMaterialColor(getOption('material'));
    } else {
      materialColor = this.workpieceManager?.materialColor ?? 0x8B6914;
    }

    // Calculate workpiece boundaries (accounting for origin position)
    const boundsOffset = getWorkpieceBoundsOffset();
    const wpMinX = -width / 2 + boundsOffset.x;
    const wpMaxX = width / 2 + boundsOffset.x;
    const wpMinY = -length / 2 - boundsOffset.y;  // Y is inverted in 3D
    const wpMaxY = length / 2 - boundsOffset.y;

    // Calculate voxel grid boundaries (centered at gridOrigin)
    const vgMinX = gridOrigin.x - gridWidth / 2;
    const vgMaxX = gridOrigin.x + gridWidth / 2;
    const vgMinY = gridOrigin.y - gridLength / 2;
    const vgMaxY = gridOrigin.y + gridLength / 2;

    // Collect filler box data (up to 4 boxes)
    const fillerBoxes = [];

    // LEFT BOX: from workpiece left to voxel grid left
    if (vgMinX > wpMinX) {
      fillerBoxes.push({
        width: vgMinX - wpMinX,
        length: gridLength,
        x: wpMinX + (vgMinX - wpMinX) / 2,
        y: gridOrigin.y,
        z: -thickness / 2
      });
    }

    // RIGHT BOX: from voxel grid right to workpiece right
    if (vgMaxX < wpMaxX) {
      fillerBoxes.push({
        width: wpMaxX - vgMaxX,
        length: gridLength,
        x: vgMaxX + (wpMaxX - vgMaxX) / 2,
        y: gridOrigin.y,
        z: -thickness / 2
      });
    }

    // FRONT BOX: full workpiece width
    if (vgMinY > wpMinY) {
      fillerBoxes.push({
        width: width,
        length: vgMinY - wpMinY,
        x: boundsOffset.x,
        y: wpMinY + (vgMinY - wpMinY) / 2,
        z: -thickness / 2
      });
    }

    // BACK BOX: full workpiece width
    if (vgMaxY < wpMaxY) {
      fillerBoxes.push({
        width: width,
        length: wpMaxY - vgMaxY,
        x: boundsOffset.x,
        y: vgMaxY + (wpMaxY - vgMaxY) / 2,
        z: -thickness / 2
      });
    }

    // Only create InstancedMesh if there are filler boxes
    if (fillerBoxes.length === 0) {
      this.workpieceOutlineBox = new THREE.Group();
      this.scene.add(this.workpieceOutlineBox);
      return;
    }

    // Create geometry for large filler voxels (same structure as main voxel grid)
    const geometry = new THREE.BoxGeometry(1, 1, thickness);
    geometry.computeVertexNormals();

    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal.array;
    const materialColorValue = new THREE.Color(materialColor);

    const colors = [];
    for (let i = 0; i < positions.length; i += 3) {
      const normalZ = normals[i + 2];
      const absNormalZ = Math.abs(normalZ);

      // Top/bottom faces get wood color, sides get wood color for consistent appearance
      colors.push(materialColorValue.r, materialColorValue.g, materialColorValue.b);
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));

    // Create material (same as voxel grid)
    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 30,
      transparent: false,
      opacity: 1.0,
      wireframe: false
    });

    // Create InstancedMesh for filler voxels
    this.workpieceOutlineBox = new THREE.InstancedMesh(geometry, material, fillerBoxes.length);
    this.workpieceOutlineBox.castShadow = CONFIG.ENABLE_SHADOWS;
    this.workpieceOutlineBox.receiveShadow = CONFIG.ENABLE_SHADOWS;

    // Create dummy object for transforms
    const dummy = new THREE.Object3D();

    // Position each filler voxel
    for (let i = 0; i < fillerBoxes.length; i++) {
      const box = fillerBoxes[i];

      dummy.position.set(box.x, box.y, box.z);
      dummy.scale.set(box.width, box.length, 1);  // Scale to box dimensions
      dummy.updateMatrix();

      this.workpieceOutlineBox.setMatrixAt(i, dummy.matrix);
      this.workpieceOutlineBox.setColorAt(i, materialColorValue);
    }

    this.workpieceOutlineBox.instanceMatrix.needsUpdate = true;

    this.scene.add(this.workpieceOutlineBox);

    // Offset filler boxes so workpiece center aligns with 3D origin
    this.workpieceOutlineBox.position.x = -boundsOffset.x;
    this.workpieceOutlineBox.position.y = boundsOffset.y;
    this.workpieceOutlineBox.position.z = 0;
  }

  loadFromGcode(gcode) {
    this.loadFromGcodeAsync(gcode).catch((error) => {
      console.error('loadFromGcodeAsync failed:', error);
    });
  }

  async loadFromGcodeAsync(gcode) {
    // CRITICAL FIX 1.5: Input validation - prevent crashes from malformed G-code
    if (!gcode || typeof gcode !== 'string') {
      console.error('loadFromGcode: Invalid G-code input', { type: typeof gcode, value: gcode });
      return;
    }

    const trimmedGcode = gcode.trim();
    if (trimmedGcode.length === 0) {
      console.warn('loadFromGcode: Empty G-code string provided');
      return;
    }

    // Store toolpaths for tool info access
    this.toolpaths = window.toolpaths || [];

    // Query the currently selected post-processor profile
    const profile = window.currentGcodeProfile || null;
    if (!profile) {
      console.warn('No post-processor profile found, using defaults (G0/G1 with X Y Z)');
    }

    const requestId = ++this._gcodePreprocessRequestId;
    const preprocessResult = await this.preprocessGcodeAsync(gcode, profile, requestId);
    if (requestId !== this._gcodePreprocessRequestId) {
      return;
    }
    const movements = preprocessResult.movements || [];
    const visualizationMovements = preprocessResult.visualizationMovements || movements;

    this.gcodeLines = preprocessResult.gcodeLines || [];
    this.totalGcodeLines = Math.max(0, preprocessResult.totalGcodeLines || this.gcodeLines.length);
    this.flattenedPath = preprocessResult.flattenedPath || [];
    this.movementTiming = preprocessResult.movementTiming || [];
    this.totalAnimationTime = preprocessResult.totalAnimationTime || 0;
    this.toolChangePoints = preprocessResult.toolChangePoints || [];
    this.toolCommentsInOrder = preprocessResult.toolCommentsInOrder || [];
    this.toolCommentsByLineIndex = preprocessResult.toolCommentsByLineIndex || {};
    this.toolInfo = preprocessResult.toolInfo || {};
    this.lineNumberToTimeMap = new Map(preprocessResult.lineNumberToTimeEntries || []);
    this.totalJobTime = preprocessResult.totalJobTime || 0;
    this.currentMovementIndex = 0;
    this.currentGcodeLineNumber = 0;
    this.elapsedTime = 0;
    this.frameCount = 0;

    // Visualize the complete toolpath with G0/G1 distinction
    this.visualizeToolpathWithGCode(visualizationMovements);

    // Offset toolpath lines so workpiece center aligns with 3D origin
    const boundsOffset = getWorkpieceBoundsOffset();
    for (const line of this.toolpathLines) {
      line.position.x = -boundsOffset.x;
      line.position.y = boundsOffset.y;
      line.position.z = 0;
    }

    // Create tool visual representation
    let toolRadius = 1;
    if (this.toolpaths && this.toolpaths.length > 0) {
      const activeTool = this.toolpaths[0]?.tool;
      if (activeTool && activeTool.diameter) {
        toolRadius = activeTool.diameter / 2;
      }
    } else if (this.toolInfo && this.toolInfo.diameter) {
      // Use tool info parsed from G-code comments (e.g. imported G-code files)
      toolRadius = this.toolInfo.diameter / 2;
    }
    this.toolRadius = toolRadius;

    // Initialize voxel grid for material removal simulation
    if (this.enableVoxelRemoval && this.workpieceManager) {
      this.initializeVoxelGrid();
    }


    // Update progress slider range for line-based animation
    const progressSlider = getSimulation3DUIElements().progressSlider;
    if (progressSlider) {
      progressSlider.min = 1;
      progressSlider.max = this.totalGcodeLines;
      progressSlider.step = 1;
      progressSlider.value = 1;  // Start at line 1
    }

    // Update status
    this.updateStatus();

    // Position tool at first movement
    if (movements.length > 0) {
      const firstMovement = movements[0];
      updateToolMesh(this.toolRadius * 2, firstMovement.x, firstMovement.y, firstMovement.z,
        this.toolInfo?.type || 'End Mill', this.toolInfo?.angle || 0);
    }
  }

  preprocessGcodeAsync(gcode, profile, requestId) {
    return new Promise((resolve, reject) => {
      const worker = this.getGcodePreprocessWorker();

      const handleMessage = (event) => {
        const data = event.data || {};
        if (data.requestId !== requestId) return;

        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);

        if (data.ok) {
          resolve(data.result);
        } else {
          reject(new Error(data.error || 'Unknown G-code preprocess worker error'));
        }
      };

      const handleError = (error) => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        reject(error);
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      worker.postMessage({
        requestId,
        gcode,
        profile: serializeGcodeProfileForWorker(profile),
        config: {
          rapidFeedRate: CONFIG.RAPID_FEED_RATE
        }
      });
    });
  }

  getGcodePreprocessWorker() {
    if (!this._gcodePreprocessWorker) {
      this._gcodePreprocessWorker = new Worker(GCODE_PREPROCESS_WORKER_URL);
    }
    return this._gcodePreprocessWorker;
  }

  /**
   * Get the active tool for a specific G-code line number
   * Linear search through sparse tool change points (typically 1-2 entries)
   * @param {number} lineNumber - G-code line number
   * @returns {object} Tool info object (or null if not found)
   */
  getToolForLine(lineNumber) {
    // Find the most recent tool that was active at or before this line
    // With typical 1-2 tool changes, linear search is fast and simple
    let activeToolInfo = null;

    for (const changePoint of this.toolChangePoints) {
      if (changePoint.lineNumber <= lineNumber) {
        activeToolInfo = changePoint.toolInfo;
      } else {
        // Since array is sorted, we can stop when we exceed the line number
        break;
      }
    }

    return activeToolInfo;
  }

  /**
   * Sync currentGcodeLineNumber from the current movement index.
   * Call after changing currentMovementIndex to keep display state consistent.
   */
  _syncGcodeLineNumber() {
    if (this.currentMovementIndex >= 0 && this.currentMovementIndex < this.movementTiming.length) {
      this.currentGcodeLineNumber = this.movementTiming[this.currentMovementIndex].gcodeLineNumber || 0;
    }
  }

  /**
   * Binary search: find the movement index whose gcodeLineNumber is closest to (at or before) targetLine.
   * Returns -1 if no movement exists at or before targetLine.
   */
  _findMovementIndexForLine(targetLine) {
    const mt = this.movementTiming;
    if (mt.length === 0) return -1;
    let lo = 0, hi = mt.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const lineNum = mt[mid].gcodeLineNumber;
      if (lineNum === undefined || lineNum > targetLine) {
        hi = mid - 1;
      } else {
        best = mid;
        lo = mid + 1;
      }
    }
    return best;
  }

  visualizeToolpathWithGCode(movements) {
    // Draw toolpath in chronological order, coloring by G0/G1 type
    if (!movements || movements.length === 0) return;

    // Build line segments in order, grouping consecutive segments of same type
    let currentSegmentPoints = [];
    let currentIsG1 = null;
    let totalSegments = 0;

    // Skip the synthetic initial movement (index 0) which moves from origin to first position
    // Start from index 1 which is the first actual G-code line
    for (let i = 1; i < movements.length; i++) {
      const move = movements[i];

      // Skip non-movement lines (comments, empty lines, etc.) - NON_MOVEMENT means no movement
      if (move.m === NON_MOVEMENT) continue;

      const point = new THREE.Vector3(move.x, move.y, move.z);

      // Determine if this is a cutting move (CUT=1) or rapid (RAPID=0)
      const isCutting = move.m === CUT;

      // Check if we need to start a new segment (type changed)
      if (currentIsG1 !== null && isCutting !== currentIsG1) {
        // Draw the current segment and start a new one
        if (currentSegmentPoints.length > 1) {
          this.drawToolpathSegment(currentSegmentPoints, currentIsG1);
          totalSegments++;
        }
        // Start new segment with the last point of previous segment AND current point
        // This ensures continuity between G0 and G1 segments
        const lastPoint = currentSegmentPoints[currentSegmentPoints.length - 1];
        currentSegmentPoints = [lastPoint, point];
        currentIsG1 = isCutting;
      } else {
        // Continue current segment
        if (currentIsG1 === null) {
          currentIsG1 = isCutting;
        }
        currentSegmentPoints.push(point);
      }
    }

    // Draw the final segment
    if (currentSegmentPoints.length > 1) {
      this.drawToolpathSegment(currentSegmentPoints, currentIsG1);
      totalSegments++;
    }
  }

  drawToolpathSegment(points, isG1) {
    // Draw a single toolpath segment with appropriate color
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const color = isG1 ? 0x00ffff : 0xff0000;  // Cyan for G1, Red for G0
    const linewidth = isG1 ? 2 : 1;

    const material = new THREE.LineBasicMaterial({
      color: color,
      linewidth: linewidth,
      fog: false,
      depthTest: true
    });

    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    this.toolpathLines.push(line);  // Store for cleanup
  }

  play() {
    // Reset voxels and position only if at the end of the file
    // If we seeked to a different position, continue from there
    if (this.currentMovementIndex >= this.movementTiming.length - 1) {
      if (this.voxelGrid) {
        this.voxelGrid.reset();
        this.voxelMaterialRemover.reset();
        this.voxelGrid.flushVisualUpdates();
      }
      this.currentMovementIndex = 0;
      this._syncGcodeLineNumber();
      this.elapsedTime = 0;
      this.wasStopped = false;
      this.frameCount = 0;
    }
    this.isPlaying = true;
    this.updateStatus();
  }

  pause() {
    this.isPlaying = false;
    // If animation finished naturally, set wasStopped=true so next play resets
    // Only clear wasStopped if we're pausing in the MIDDLE of animation
    if (this.currentMovementIndex < this.movementTiming.length - 1) {
      this.wasStopped = false;  // Pause in middle keeps current position
    } else {
      this.wasStopped = true;  // Animation finished at last line - next play will reset
    }
    this.updateStatus();
  }

  setSpeed(speed) {
    this.speed = Math.max(CONFIG.ANIMATION_SPEED_MIN, Math.min(CONFIG.ANIMATION_SPEED_MAX, speed));
  }

  /**
   * Seek animation to a specific G-code line number
   * Handles backward seeking (reset voxels, replay from start) and forward seeking (incremental replay)
   * Called by viewer clicks, slider changes, or programmatically
   * Does NOT update viewer - caller is responsible for that to avoid feedback loops
   */
  seekToLineNumber(targetLineNumber) {
    // Clamp to valid range (0-based indexing: 0 to totalGcodeLines)
    if (targetLineNumber < 0) targetLineNumber = 0;
    if (targetLineNumber > this.totalGcodeLines) targetLineNumber = this.totalGcodeLines;

    // Find the movement index at or before the target line (O(log n) binary search)
    const targetIdx = this._findMovementIndexForLine(targetLineNumber);
    if (targetIdx < 0) return;  // No movements at or before this line

    const oldIdx = this.currentMovementIndex;
    const isBackwardSeek = targetIdx < oldIdx;

    // Reset voxels if seeking backward
    if (isBackwardSeek) {
      if (this.voxelGrid) {
        this.voxelGrid.reset();
        this.voxelMaterialRemover.reset();
      }
      this.currentToolInfo = null;
    }

    // Replay material removal UP TO but NOT INCLUDING the target (show state BEFORE current line executes)
    if (isBackwardSeek && targetIdx > 0) {
      this._replayFromMovementIndexToIndex(0, targetIdx - 1);
    } else if (!isBackwardSeek && targetIdx > oldIdx) {
      this._replayFromMovementIndexToIndex(oldIdx, targetIdx - 1);
    }

    // Set state to target movement
    this.currentMovementIndex = targetIdx;
    this._syncGcodeLineNumber();
    this.elapsedTime = 0;
    this.justSeeked = true;

    // Position tool at end of previous movement (start of current line)
    const prevMove = targetIdx > 0 ? this.movementTiming[targetIdx - 1] : null;
    const targetMove = this.movementTiming[targetIdx];
    this.currentFeedRate = targetMove.feedRate || 0;

    if (prevMove) {
      this.updateToolPositionAtCoordinates(prevMove.x, prevMove.y, prevMove.z, false, prevMove.gcodeLineNumber || 0);
    } else {
      this.updateToolPositionAtCoordinates(0, 0, 5, false, 0);
    }

    // Batch update GPU
    if (this.voxelGrid) {
      this.voxelGrid.flushVisualUpdates();
    }
  }

  setProgress(lineNumber, skipViewerUpdate) {
    // Seek to a specific G-code line number using binary search
    const targetMovementIndex = this._findMovementIndexForLine(lineNumber);

    if (targetMovementIndex === -1) return; // Line not found

    const oldMovementIndex = this.currentMovementIndex;

    // Determine if this is backward seeking
    const isBackwardSeek = targetMovementIndex < oldMovementIndex;

    // Reset voxels if seeking backward or making a large jump
    if (isBackwardSeek || (targetMovementIndex - oldMovementIndex) > 10) {
      if (this.voxelGrid) {
        this.voxelGrid.reset();
        this.voxelMaterialRemover.reset();
        // CRITICAL FIX 1.3: Ensure GPU sync after reset
        if (this.voxelGrid.mesh) {
          if (this.voxelGrid.mesh.instanceMatrix) {
            this.voxelGrid.mesh.instanceMatrix.needsUpdate = true;
          }
          if (this.voxelGrid.mesh.instanceColor) {
            this.voxelGrid.mesh.instanceColor.needsUpdate = true;
          }
        }
      }
      this.currentToolInfo = null;

      // Replay from start to target (exclude target line to show state before it runs)
      // Note: if targetMovementIndex = 0, we don't replay anything (fresh start)
      if (targetMovementIndex > 0) {
        this._replayFromMovementIndexToIndex(0, targetMovementIndex - 1);
      }
    } else {
      // Small forward step: incremental replay (exclude target line to show state before it runs)
      // Replay from old position through one before target
      if (oldMovementIndex < targetMovementIndex) {
        this._replayFromMovementIndexToIndex(oldMovementIndex, targetMovementIndex - 1);
      }
    }

    // Set state directly from the target movement
    this.currentMovementIndex = targetMovementIndex;
    const targetMovement = this.movementTiming[targetMovementIndex];
    this.currentGcodeLineNumber = targetMovement.gcodeLineNumber;
    // Set elapsed time to 0 (beginning of movement) to show state BEFORE this line executes
    this.elapsedTime = 0;
    this.previousElapsedTime = 0;
    this.currentFeedRate = targetMovement.feedRate || 0;


    // Reset wasStopped flag when seeking to allow restart
    // wasStopped is only set to true when animation finishes; seeking to any line should allow restart
    this.wasStopped = false;

    // Update G-code viewer highlight when progress slider moves
    if (!skipViewerUpdate && typeof gcodeView !== 'undefined' && gcodeView) {
      syncSimulation3DGcodeView(true);
    }

    // Batch update GPU: commit all material removal calculations in one render batch
    if (this.voxelGrid) {
      this.voxelGrid.flushVisualUpdates();
    }

    requestThreeRender();
  }

  _replayFromMovementIndexToIndex(startIndex, endIndex) {
    // Step at half the tool radius — adjacent circles overlap so no voxels are missed.
    // Using voxelSize * 0.5 was far too fine: a 200mm move with 0.05mm steps = 4000
    // quadtree queries, each traversing the full tree.
    const stepDist = this.voxelGrid
      ? Math.max(this.voxelGrid.voxelSize, this.toolRadius * 0.5)
      : 1.0;

    for (let i = startIndex; i <= endIndex && i < this.movementTiming.length; i++) {
      const move = this.movementTiming[i];

      if (move.isG1 && this.voxelGrid && this.voxelMaterialRemover) {
        // Only remove material on cutting moves
        const prevMove = i > 0
          ? this.movementTiming[i - 1]
          : { x: 0, y: 0, z: 5, isG1: false };

        try {
          const toolData = this.getToolForLine(move.gcodeLineNumber) || this.toolInfo ||
            { diameter: this.toolRadius * 2, type: 'End Mill', angle: 0 };
          this.voxelMaterialRemover.removeAlongPath(
            this.voxelGrid,
            prevMove,
            { x: move.x, y: move.y, z: move.z },
            toolData,
            stepDist,
            { deferVisualUpdate: true }
          );
        } catch (e) {
          console.error('Voxel replay error:', e);
        }
      }
    }
  }

  update() {
    if (this.movementTiming.length === 0 || this.currentMovementIndex >= this.movementTiming.length) return;

    // Skip all simulation work if not playing
    if (!this.isPlaying) {
      return;
    }

    // Clear the seek flag now that we've processed this frame
    if (this.justSeeked) {
      this.justSeeked = false;
      return;
    }

    // Increment elapsed time - this is cumulative time into the animation from current position
    const deltaTime = (1 / 60) * this.speed;  // Assume 60fps, multiply by speed factor
    this.elapsedTime += deltaTime;
    this.frameCount++;

    // Calculate the target cumulative time we should be at
    const prevMovementAtStart = this.currentMovementIndex > 0 ? this.movementTiming[this.currentMovementIndex - 1] : null;
    const baseTime = prevMovementAtStart ? prevMovementAtStart.cumulativeTime : 0;
    const targetCumulativeTime = baseTime + this.elapsedTime;

    // Step at half the tool radius — adjacent circles overlap so no voxels are missed.
    const stepDist = this.voxelGrid
      ? Math.max(this.voxelGrid.voxelSize, this.toolRadius * 0.5)
      : 1.0;

    // Budget ~8ms for voxel removal per frame so the rAF handler stays under 16ms.
    // When playback is fast and many moves complete in one frame we skip removal for
    // moves beyond the budget — the animation position stays accurate regardless.
    const REMOVAL_BUDGET_MS = 8;
    const removalFrameStart = performance.now();

    while (this.currentMovementIndex < this.movementTiming.length) {
      const move = this.movementTiming[this.currentMovementIndex];

      // If this movement hasn't completed yet, stop - we'll interpolate within it below
      if (move.cumulativeTime > targetCumulativeTime) {
        break;
      }

      // This movement has completed - do voxel removal along its full path
      if (move.isG1 && this.enableVoxelRemoval && this.voxelGrid && this.voxelMaterialRemover &&
          (performance.now() - removalFrameStart) < REMOVAL_BUDGET_MS) {
        const prev = this.currentMovementIndex > 0 ? this.movementTiming[this.currentMovementIndex - 1] : null;
        const prevPos = prev ? { x: prev.x, y: prev.y, z: prev.z } : { x: 0, y: 0, z: 5 };
        try {
          const toolData = this.getToolForLine(move.gcodeLineNumber) || this.toolInfo ||
            { diameter: this.toolRadius * 2, type: 'End Mill', angle: 0 };
          this.voxelMaterialRemover.removeAlongPath(
            this.voxelGrid, prevPos,
            { x: move.x, y: move.y, z: move.z },
            toolData, stepDist,
            { deferVisualUpdate: true }
          );
        } catch (e) {
          console.error('Voxel removal error during advance:', e);
        }
      }

      this.currentMovementIndex++;

      // If we've reached the end, finish up
      if (this.currentMovementIndex >= this.movementTiming.length) {
        this.currentMovementIndex = this.movementTiming.length - 1;
        this._syncGcodeLineNumber();

        const finalMovement = this.movementTiming[this.currentMovementIndex];
        this.updateToolPositionAtCoordinates(finalMovement.x, finalMovement.y, finalMovement.z, false, finalMovement.gcodeLineNumber);

        if (this.voxelGrid) {
          this.voxelGrid.flushVisualUpdates();
        }

        this.pause();
        this.updateStatus();
        return;
      }
    }

    // Rebase elapsedTime relative to new position so it doesn't compound across frames
    const newPrev = this.currentMovementIndex > 0 ? this.movementTiming[this.currentMovementIndex - 1] : null;
    const newBaseTime = newPrev ? newPrev.cumulativeTime : 0;
    this.elapsedTime = targetCumulativeTime - newBaseTime;

    // Sync display state
    this._syncGcodeLineNumber();

    // Now interpolate within the current (in-progress) movement
    const currentMovement = this.movementTiming[this.currentMovementIndex];
    const movementDuration = currentMovement.cumulativeTime - newBaseTime;

    const prevPos = newPrev
      ? { x: newPrev.x, y: newPrev.y, z: newPrev.z }
      : { x: 0, y: 0, z: 5 };

    let t = 0;
    if (movementDuration > 0) {
      t = this.elapsedTime / movementDuration;
      t = Math.max(0, Math.min(1, t));
    }

    const toolX = prevPos.x + (currentMovement.x - prevPos.x) * t;
    const toolY = prevPos.y + (currentMovement.y - prevPos.y) * t;
    const toolZ = prevPos.z + (currentMovement.z - prevPos.z) * t;
    this.currentFeedRate = currentMovement.feedRate || 0;

    // Keep progressive removal on the in-flight segment, but skip the exact terminal point
    // because completed segments are already handled by removeAlongPath above.
    this.updateToolPositionAtCoordinates(toolX, toolY, toolZ, currentMovement.isG1 && t < 0.999, this.currentGcodeLineNumber);

    if (this.voxelGrid) {
      this.voxelGrid.flushVisualUpdates();
    }

    // Sync gcode viewer - now cheap thanks to virtualized DOM (only ~50 elements rendered)
    syncSimulation3DGcodeView(false);
  }

  updateToolPositionAtCoordinates(toolX, toolY, toolZ, isG1, gcodeLineNumber) {
    // Update tool position at specific interpolated coordinates
    // This is called every frame during animation with interpolated positions

    // Get the tool for this line
    const toolForCurrentSegment = this.getToolForLine(gcodeLineNumber);
    if (toolForCurrentSegment) {
      if (toolForCurrentSegment !== this.toolInfo) {
        this.toolInfo = toolForCurrentSegment;
        this.currentToolInfo = toolForCurrentSegment;

        if (this.toolInfo?.diameter) {
          this.toolRadius = this.toolInfo.diameter / 2;
        }
      }
    }

    // Always update tool mesh position every frame (not just on tool changes)
    const currentTool = this.toolInfo || { diameter: this.toolRadius * 2, type: 'End Mill', angle: 0 };
    updateToolMesh(this.toolRadius * 2, toolX, toolY, toolZ,
      currentTool?.type || 'End Mill', currentTool?.angle || 0);

    // Remove material from voxel grid if enabled (only on cutting moves)
    const shouldUpdateVoxelsThisFrame = (this.frameCount % this.voxelRemovalRate) === 0;
    if (this.enableVoxelRemoval && this.voxelGrid && this.voxelMaterialRemover && isG1 && this.isPlaying && shouldUpdateVoxelsThisFrame) {
      try {
        const currentToolData = this.getToolForLine(gcodeLineNumber) || this.toolInfo;
        this.voxelMaterialRemover.removeAtToolPosition(
          this.voxelGrid,
          toolX, toolY, toolZ,
          currentToolData || { diameter: this.toolRadius * 2, type: 'End Mill', angle: 0 },
          { deferVisualUpdate: true }
        );
      } catch (e) {
        console.error('Voxel removal error:', e);
      }
    }

    requestThreeRender();
  }



  updateStatus() {
    if (this.onStatusChange) {
      const status = this.isPlaying ? 'Playing...' : (this.elapsedTime >= this.totalAnimationTime ? 'Complete' : 'Paused');
      this.onStatusChange(status);
    }
  }
}

// ============ TOOLPATH VISUALIZER ============
class ToolpathVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.pathLine = null;
    this.cutProfileLine = null;
  }

  visualizeToolpath(path) {
    // Remove old lines
    if (this.pathLine) {
      this.scene.remove(this.pathLine);
    }
    if (this.cutProfileLine) {
      this.scene.remove(this.cutProfileLine);
    }

    if (!path || path.length === 0) return;

    // Draw main toolpath on the top surface (Z = 0.1) so it's visible
    // Use only X, Y from the path, ignore Z depth for visualization
    const points = path.map(p => {
      return new THREE.Vector3(p.x || 0, p.y || 0, 0.2);  // Z = 0.2 puts it slightly above surface
    });

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      linewidth: 3,
      fog: false,
      depthTest: false  // Draw on top regardless of depth
    });
    this.pathLine = new THREE.Line(geometry, material);
    this.pathLine.renderOrder = 100;  // Render on top
    this.scene.add(this.pathLine);

    // Also draw a profile showing the cutting depth
    // Draw vertical lines from surface down to cutting depth
    const profilePoints = [];
    for (let i = 0; i < path.length; i += Math.max(1, Math.floor(path.length / 50))) {
      const p = path[i];
      // Draw line from surface (0) down to cutting depth (negative Z)
      profilePoints.push(new THREE.Vector3(p.x || 0, p.y || 0, 0));
      profilePoints.push(new THREE.Vector3(p.x || 0, p.y || 0, p.z || -5));
    }

    if (profilePoints.length > 0) {
      const profileGeom = new THREE.BufferGeometry().setFromPoints(profilePoints);
      const profileMat = new THREE.LineBasicMaterial({
        color: 0xff8800,  // Orange for depth profile
        linewidth: 1,
        fog: false,
        depthTest: false
      });
      this.cutProfileLine = new THREE.LineSegments(profileGeom, profileMat);
      this.cutProfileLine.renderOrder = 99;
      this.scene.add(this.cutProfileLine);
    }
  }
}

// ============ ORBIT CONTROLS ============
class OrbitControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.target = new THREE.Vector3();
    this.distance = this.camera.position.length();
    this.phi = 0;
    this.theta = 0;

    this.minDistance = 10;
    this.maxDistance = 3000;
    this.rotateSpeed = 0.005;
    this.zoomSpeed = 0.1;

    this.isDragging = false;
    this.previousMousePosition = { x: 0, y: 0 };
    this.dragMode = null;
    this.panSpeed = 0.1;
    this.moveSpeed = 0.1;

    this.onMouseDownBound = this.onMouseDown.bind(this);
    this.onMouseMoveBound = this.onMouseMove.bind(this);
    this.onMouseUpBound = this.onMouseUp.bind(this);
    this.onMouseWheelBound = this.onMouseWheel.bind(this);
    this.onContextMenuBound = this.onContextMenu.bind(this);
    this.onKeyDownBound = this.onKeyDown.bind(this);

    this.domElement.addEventListener('mousedown', this.onMouseDownBound);
    this.domElement.addEventListener('mousemove', this.onMouseMoveBound);
    this.domElement.addEventListener('mouseup', this.onMouseUpBound);
    this.domElement.addEventListener('mouseleave', this.onMouseUpBound);
    this.domElement.addEventListener('wheel', this.onMouseWheelBound, false);
    this.domElement.addEventListener('contextmenu', this.onContextMenuBound);
    this.domElement.tabIndex = 0;
    window.addEventListener('keydown', this.onKeyDownBound, true);
    this.domElement.addEventListener('keydown', this.onKeyDownBound, true);
  }

  setTarget(x, y, z) {
    this.target.set(x, y, z);
    this.updateCamera();
    requestThreeRender();
  }

  onContextMenu(event) {
    event.preventDefault();
  }

  onMouseDown(event) {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;

    this.domElement.focus();
    this.isDragging = true;
    this.previousMousePosition = { x: event.clientX, y: event.clientY };

    if (event.button === 0) {
      this.dragMode = 'rotate';
    } else if (event.button === 1 || event.button === 2) {
      this.dragMode = 'pan';
    }
  }

  onMouseMove(event) {
    if (!this.isDragging || !this.dragMode) return;

    const deltaX = event.clientX - this.previousMousePosition.x;
    const deltaY = event.clientY - this.previousMousePosition.y;

    if (this.dragMode === 'rotate') {
      this.theta -= deltaX * this.rotateSpeed;
      this.phi += deltaY * this.rotateSpeed;
      this.phi = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.phi));
    } else if (this.dragMode === 'pan') {
      this.pan(deltaX, deltaY);
    } else if (this.dragMode === 'move') {
      this.move(deltaX, deltaY);
    }

    this.previousMousePosition = { x: event.clientX, y: event.clientY };
    this.updateCamera();
    requestThreeRender();
  }

  onMouseUp() {
    this.isDragging = false;
    this.dragMode = null;
    requestThreeRender();
  }

  onMouseWheel(event) {
    event.preventDefault();
    this.distance += event.deltaY * this.zoomSpeed;
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
    this.updateCamera();
    updateProgressiveGrid3D();
    requestThreeRender();
  }

  onKeyDown(event) {
    const isArrowKey = event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown';
    if (!isArrowKey) return;

    const activeElement = document.activeElement;
    const isTypingContext = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.tagName === 'SELECT' ||
      activeElement.tagName === 'BUTTON' ||
      activeElement.isContentEditable
    );
    if (isTypingContext) return;

    let deltaX = 0;
    let deltaY = 0;
    const keyboardStep = 20;

    if (event.key === 'ArrowLeft') {
      deltaX = -keyboardStep;
    } else if (event.key === 'ArrowRight') {
      deltaX = keyboardStep;
    } else if (event.key === 'ArrowUp') {
      deltaY = -keyboardStep;
    } else if (event.key === 'ArrowDown') {
      deltaY = keyboardStep;
    }

    event.preventDefault();
    this.move(deltaX, deltaY);
    this.updateCamera();
    requestThreeRender();
  }

  pan(deltaX, deltaY) {
    const panScale = this.distance * this.panSpeed * 0.01;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();

    this.camera.getWorldDirection(up);
    right.crossVectors(up, this.camera.up).normalize();
    up.copy(this.camera.up).normalize();

    this.target.addScaledVector(right, -deltaX * panScale);
    this.target.addScaledVector(up, deltaY * panScale);
  }

  move(deltaX, deltaY) {
    const moveScale = this.distance * this.moveSpeed * 0.01;
    const right = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();

    this.camera.getWorldDirection(cameraDirection);
    right.crossVectors(cameraDirection, this.camera.up).normalize();
    forward.copy(cameraDirection);
    forward.z = 0;

    if (forward.lengthSq() > 0) {
      forward.normalize();
    } else {
      forward.set(0, 1, 0);
    }

    const movement = new THREE.Vector3();
    movement.addScaledVector(right, deltaX * moveScale);
    movement.addScaledVector(forward, -deltaY * moveScale);

    this.target.add(movement);
  }

  updateCamera() {
    this.camera.position.x = this.target.x + this.distance * Math.cos(this.phi) * Math.sin(this.theta);
    this.camera.position.y = this.target.y + this.distance * Math.sin(this.phi);
    this.camera.position.z = this.target.z + this.distance * Math.cos(this.phi) * Math.cos(this.theta);
    this.camera.lookAt(this.target);
  }
}
