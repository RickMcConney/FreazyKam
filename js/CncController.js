

// Import other operations...

const TOUCH_TAP_JITTER_SQ = 100; // 10px radius squared — screen pixels

class CncController {
  constructor() {
    this.operationManager = new OperationManager();

    // Register all operations
    let select = Select.getInstance();
    this.operationManager.registerOperation(select);
    this.operationManager.registerOperation(new Workpiece());
    this.operationManager.registerOperation(new Shape());
    this.operationManager.registerOperation(new Text());
    this.operationManager.registerOperation(new Pen());
    this.operationManager.registerOperation(new Transform());
    this.operationManager.registerOperation(new PathEdit());
    this.operationManager.registerOperation(new BooleanOpp());
    this.operationManager.registerOperation(new OffsetOpp());
    this.operationManager.registerOperation(new PatternOpp());
    this.operationManager.registerOperation(new TabEditor());
    this.operationManager.registerOperation(new Gemini());
    this.operationManager.registerOperation(new Drill());

    // Set default operation to Select
    this.operationManager.setCurrentOperation('Select');

    // RAF render loop properties
    this.isDirty = false;
    this.renderFrameId = null;
    this.lastFrameTime = 0;
  }

  setupEventListeners() {

    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');

    // Middle mouse button panning state
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.startPanX = 0;
    this.startPanY = 0;

    this.canvas.addEventListener('mousedown', (evt) => {
      // Middle mouse button (button === 1) triggers panning
      if (evt.button === 1) {
        this.isPanning = true;
        this.panStartX = evt.offsetX || (evt.pageX - this.canvas.offsetLeft);
        this.panStartY = evt.offsetY || (evt.pageY - this.canvas.offsetTop);
        this.startPanX = typeof panX !== 'undefined' ? panX : 0;
        this.startPanY = typeof panY !== 'undefined' ? panY : 0;
        evt.preventDefault(); // Prevent default middle-click behavior
        return;
      }

      this.operationManager.handleMouseEvent('Down', this.canvas, evt);
      redraw();
    });

    this.canvas.addEventListener('mouseup', (evt) => {
      // Release middle mouse button panning
      if (evt.button === 1) {
        this.isPanning = false;
        evt.preventDefault();
        return;
      }

      this.operationManager.handleMouseEvent('Up', this.canvas, evt);
      redraw();
    });

    this.canvas.addEventListener('mousemove', (evt) => {
      // Handle middle mouse button panning
      if (this.isPanning) {
        var x = evt.offsetX || (evt.pageX - this.canvas.offsetLeft);
        var y = evt.offsetY || (evt.pageY - this.canvas.offsetTop);
        var dx = x - this.panStartX;
        var dy = y - this.panStartY;

        if (typeof panX !== 'undefined' && typeof panY !== 'undefined') {
          panX = this.startPanX + dx;
          panY = this.startPanY + dy;
        }
        redraw();
        evt.preventDefault();
        return;
      }

      this.operationManager.handleMouseEvent('Move', this.canvas, evt);
      //redraw();
    });

    // Prevent context menu on middle mouse button
    this.canvas.addEventListener('contextmenu', (evt) => {
      if (evt.button === 1) {
        evt.preventDefault();
      }
    });

    // Touch support for iPad/mobile
    this.touchPanning = false;
    this.pinching = false;
    this.lastPinchDist = 0;

    this.touchStartPos = null;  // Track touch start for jitter filtering

    this.canvas.addEventListener('touchstart', (evt) => {
      if (evt.touches.length === 2) {
        // Two-finger: pan + pinch zoom
        this.pinching = true;
        this.touchPanning = true;
        const t0 = evt.touches[0], t1 = evt.touches[1];
        this.lastPinchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const midX = (t0.clientX + t1.clientX) / 2;
        const midY = (t0.clientY + t1.clientY) / 2;
        this.panStartX = midX;
        this.panStartY = midY;
        this.startPanX = typeof panX !== 'undefined' ? panX : 0;
        this.startPanY = typeof panY !== 'undefined' ? panY : 0;
        evt.preventDefault();
        return;
      }
      // Single touch: simulate mouse
      const mouseEvt = this._touchToMouse(evt);
      this.touchStartPos = { x: mouseEvt.offsetX, y: mouseEvt.offsetY };
      this.touchMoved = false;
      this.operationManager.handleMouseEvent('Down', this.canvas, mouseEvt);
      redraw();
      evt.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (evt) => {
      if (this.pinching && evt.touches.length === 2) {
        const t0 = evt.touches[0], t1 = evt.touches[1];
        // Pinch zoom
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        if (this.lastPinchDist > 0) {
          const rect = this.canvas.getBoundingClientRect();
          const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
          const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
          const delta = dist > this.lastPinchDist ? 1 : -1;
          if (Math.abs(dist - this.lastPinchDist) > 3) {
            newZoom(delta, midX, midY);
            this.lastPinchDist = dist;
          }
        }
        // Two-finger pan
        const midX = (t0.clientX + t1.clientX) / 2;
        const midY = (t0.clientY + t1.clientY) / 2;
        if (typeof panX !== 'undefined' && typeof panY !== 'undefined') {
          panX = this.startPanX + (midX - this.panStartX);
          panY = this.startPanY + (midY - this.panStartY);
        }
        redraw();
        evt.preventDefault();
        return;
      }
      // Single touch: filter finger jitter for taps
      const mouseEvt = this._touchToMouse(evt);
      if (!this.touchMoved && this.touchStartPos) {
        const dx = mouseEvt.offsetX - this.touchStartPos.x;
        const dy = mouseEvt.offsetY - this.touchStartPos.y;
        if (dx * dx + dy * dy < TOUCH_TAP_JITTER_SQ) {  // 10px screen threshold
          evt.preventDefault();
          return;  // Ignore jitter — don't send Move until real drag
        }
        this.touchMoved = true;
      }
      this.operationManager.handleMouseEvent('Move', this.canvas, mouseEvt);
      evt.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('touchend', (evt) => {
      if (this.pinching) {
        this.pinching = false;
        this.touchPanning = false;
        evt.preventDefault();
        return;
      }
      // Single touch: simulate mouse
      const mouseEvt = this._lastTouchMouse || this._touchToMouse(evt);
      this.operationManager.handleMouseEvent('Up', this.canvas, mouseEvt);
      redraw();
      evt.preventDefault();
    }, { passive: false });

    // Handle document visibility changes (pause RAF when tab hidden)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pauseRenderLoop();
      } else {
        this.resumeRenderLoop();
      }
    });

    window.addEventListener('beforeunload', () => this.pauseRenderLoop());

    // Start the RAF render loop
    this.startRenderLoop();
  }

  // Convert a touch event to a mouse-like object with offsetX/offsetY
  _touchToMouse(evt) {
    const touch = evt.touches[0] || evt.changedTouches[0];
    const rect = this.canvas.getBoundingClientRect();
    const mouseEvt = {
      offsetX: touch.clientX - rect.left,
      offsetY: touch.clientY - rect.top,
      clientX: touch.clientX,
      clientY: touch.clientY,
      pageX: touch.pageX,
      pageY: touch.pageY,
      button: 0,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault() {},
      stopPropagation() {}
    };
    this._lastTouchMouse = mouseEvt;
    return mouseEvt;
  }

  setMode(mode) {
    setMode(mode);
    this.operationManager.setCurrentOperation(mode);
    
  }

  draw() {
    // Draw current operation
    this.operationManager.draw(this.ctx);
  }

  // RAF Render Loop Methods

  startRenderLoop() {
    const runRenderLoop = (timestamp) => {
      this.lastFrameTime = timestamp;

      // Check dirty flag and render if needed
      if (this.isDirty) {
        redrawCore();
        this.isDirty = false;
      }

      // Schedule next frame
      this.renderFrameId = requestAnimationFrame(runRenderLoop);
    };

    // Start the loop
    this.renderFrameId = requestAnimationFrame(runRenderLoop);
  }

  pauseRenderLoop() {
    if (this.renderFrameId) {
      cancelAnimationFrame(this.renderFrameId);
      this.renderFrameId = null;
    }
  }

  resumeRenderLoop() {
    if (!this.renderFrameId) {
      this.startRenderLoop();
    }
  }

  setDirty() {
    this.isDirty = true;
  }
}

// Global render system functions

// Initialize controller as global
var cncController;  // Will be set in initialization

// Global function to mark canvas as needing redraw
function setDirty() {
  if (typeof cncController !== 'undefined' && cncController && cncController.setDirty) {
    cncController.setDirty();
  }
}

// Immediate redraw (for special cases like simulation)
function redrawImmediate() {
  if (typeof redrawCore === 'function') {
    staticDirty = true;
    redrawCore();
  }
}