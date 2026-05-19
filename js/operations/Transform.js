class Transform extends Select {
    // Define state constants for Transform

    static IDLE = 0;
    static HOVERING = 1;
    static ADJUSTING_PIVOT = 2;
    static SCALING = 3;
    static ROTATING = 4;
    static DRAGGING = 5;
    static SELECTING = 6;
    static MIRRORING = 7;
    static SKEWING = 8;

    static state = Transform.IDLE;

    // Magic number constants
    static DRAG_THRESHOLD = 8;              // pixels before drag is detected
    static HANDLE_SIZE = 8;                 // radius of transform handles
    static HANDLE_HIT_RADIUS = 32;          // clickable radius (4x handle size)
    static MIN_BOX_DIMENSION = 2;           // minimum transform box dimension
    static SCALE_MIN = 0.1;                 // minimum scale factor
    static SCALE_MAX = 10;                  // maximum scale factor
    static ROTATION_LINE_LENGTH = 300;      // length of rotation reference line
    static MIRROR_BUTTON_OFFSET = 50;       // offset for mirror buttons from center
    static MIN_DISTANCE_CHECK = 10;         // minimum pixels to register distance

    constructor() {
        super('Move', 'move');
        this.name = 'Move';
        this.icon = 'move';
        this.tooltip = 'Move, scale, and rotate selected objects';
        this.transformBox = null;
        this.handleSize = Transform.HANDLE_SIZE;
        this.ROTATION_SNAP = Math.PI / 36; // 5 degree snapping
        this.unselectOnMouseDown = true;

        // Transform tracking properties
        this.deltaX = 0;
        this.deltaY = 0;
        this.scaleX = 1;
        this.scaleY = 1;
        this.skewX = 0;
        this.skewY = 0;
        this.totalSkewX = 0;
        this.totalSkewY = 0;
        this.totalRotation = 0;

        this.initialTransformBox = null;
        this.pivotCenter = null;
        this.rotation = 0; // in degrees
        this.originalPivot = null;

        // Field specs for PropertiesManager
        this.fields = {
            deltaX:   { key: 'deltaX',   label: 'Delta X',    type: 'dimension', default: 0 },
            deltaY:   { key: 'deltaY',   label: 'Delta Y',    type: 'dimension', default: 0 },
            width:    { key: 'width',    label: 'Width',       type: 'dimension', default: 0 },
            height:   { key: 'height',   label: 'Height',      type: 'dimension', default: 0 },
            rotation: { key: 'rotation', label: 'Angle °',     type: 'number',    default: 0, step: 1 },
        };
    }

    start() {
        super.start();
        this.activeHandle = null;
        this.hoverHandle = null;

        // Reset transform tracking values
        this.resetTransformState();
        this.totalSkewX = 0;
        this.totalSkewY = 0;
        this.totalRotation = 0;

        // Initialize based on selection
        if (this.hasSelectedPaths()) {
            this.setupTransformBox();
            this.recoverTotalsFromHistory();
            this.updateCenterDisplay();
        } else {
            this.transformBox = null;
        }

        // Start in IDLE state
        Transform.state = Transform.IDLE;


        // Refresh properties panel to show the right state
        this.refreshPropertiesPanel();
        redraw();
    }

    // Helper method to reset all transform accumulators (but not pivot center or transform box)
    resetTransformState() {
        this.deltaX = 0;
        this.deltaY = 0;
        this.scaleX = 1;
        this.scaleY = 1;
        this.skewX = 0;
        this.skewY = 0;
        this.rotation = 0;
        // Note: Don't reset pivotCenter or initialTransformBox here - they're needed for transforms
    }

    // Recover totalRotation/totalSkew from selected paths' transformHistory
    recoverTotalsFromHistory() {
        const selected = selectMgr.selectedPaths();
        if (selected.length === 0) {
            this.totalRotation = 0;
            this.totalSkewX = 0;
            this.totalSkewY = 0;
            return;
        }

        // Sum up rotation/skew from each path's transform history
        // If multiple paths have different totals, use the first path's values
        const path = selected[0];
        let rotation = 0, skewX = 0, skewY = 0;
        if (path.transformHistory) {
            for (const t of path.transformHistory) {
                rotation += t.rotation || 0;
                skewX += t.skewX || 0;
                skewY += t.skewY || 0;
            }
        }
        this.totalRotation = rotation;
        this.totalSkewX = skewX;
        this.totalSkewY = skewY;
    }

    // Helper method to setup transform box with pivot center
    setupTransformBox() {
        this.transformBox = this.createTransformBox(svgpaths);
        this.initialTransformBox = { ...this.transformBox };

        if (this.pivotCenter == null) {
            this.pivotCenter = {
                x: this.transformBox.centerX,
                y: this.transformBox.centerY
            };
        }
        this.originalPivot = { ...this.pivotCenter };
        this.storeOriginalPaths();
    }

    // Helper method to store original paths for transformation reference
    storeOriginalPaths() {

        let selected = selectMgr.selectedPaths();
        selected.forEach(svgpath => {
            let path = svgpath.path;
            svgpath.originalPath = [];
            for (let i = 0; i < path.length; i++)
                svgpath.originalPath.push({ x: path[i].x, y: path[i].y });

            // Store original tabs for transformation reference
            if (svgpath.creationProperties && svgpath.creationProperties.tabs) {
                svgpath.originalTabs = svgpath.creationProperties.tabs.map(tab => ({
                    x: tab.x,
                    y: tab.y,
                    angle: tab.angle,
                    pathDistance: tab.pathDistance,
                    isConvex: tab.isConvex,
                    edgeIndex: tab.edgeIndex,
                    edgeP1: tab.edgeP1 ? { x: tab.edgeP1.x, y: tab.edgeP1.y } : null,
                    edgeP2: tab.edgeP2 ? { x: tab.edgeP2.x, y: tab.edgeP2.y } : null,
                    positionFraction: tab.positionFraction
                }));
            }
        });
    }

    refreshPropertiesPanel() {
        // Check if the Move tool properties editor is currently visible
        const propertiesEditor = document.getElementById('tool-properties-editor');
        const isVisible = propertiesEditor && propertiesEditor.style.display !== 'none';

        if (isVisible) {
            const popupContext = window.floatingPropertiesPopupContext;
            if (popupContext?.type === 'shape-group') {
                return;
            }

            // Re-trigger the properties panel display for the Move tool
            showToolPropertiesEditor('Move');
        }
    }
    stop() {
        super.stop();
        this.transformBox = null;
        this.pivotCenter = null;
    }
    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        const mouseHit = this.normalizeEventWorld(canvas, evt);
        this.mouseDown = true;

        // First check if we're clicking on a handle
        this.activeHandle = this.getHandleAtPoint(mouseHit);
        this.hoverHandle = null;

        // If clicking on a handle, handle transformation
        if (this.activeHandle) {

            addUndo(false, true, false);

            // Handle mirror as special case - immediate apply, no state change
            if (this.activeHandle.type === 'mirrorX') {
                this.mirrorX();
                this.activeHandle = null; // Don't persist active handle for mirror
                Transform.state = Transform.MIRRORING;
                return;
            }
            else if (this.activeHandle.type === 'mirrorY') {
                this.mirrorY();
                Transform.state = Transform.MIRRORING;
                this.activeHandle = null; // Don't persist active handle for mirror
                return;
            }

            // Store initial mouse position for scaling/rotation calculations
            this.initialMousePos = { x: mouse.x, y: mouse.y };

            // Transition to appropriate transform state based on handle type
            // At this point, transformBox, initialTransformBox, pivotCenter, and originalPaths are all guaranteed to exist
            if (this.activeHandle.type === 'center') {
                Select.state = Select.DRAGGING;
                Transform.state = Transform.DRAGGING;
                this.dragStartX = mouse.x;
                this.dragStartY = mouse.y;
                this.dragStartXWorld = mouseHit.x;
                this.dragStartYWorld = mouseHit.y;
            } else if (this.activeHandle.type === 'scale') {
                this.resetTransformState(); // Reset accumulators for clean scale
                Transform.state = Transform.SCALING;

            } else if (this.activeHandle.type === 'rotate') {
                this.resetTransformState(); // Reset accumulators for clean rotation
                Transform.state = Transform.ROTATING;
            }

        } else {
            // If not clicking on a handle, allow normal selection behavior
            super.onMouseDown(canvas, evt);

            // After parent handles the click, check if selection changed
            if (this.hasSelectedPaths()) {
                // We have selected paths - need to update transform box
                // This handles both new selections and adding to existing selections
                const prevBox = this.transformBox;
                this.setupTransformBox();
                // Only reset totals if selection actually changed (different bounding box)
                const selectionChanged = !prevBox ||
                    Math.abs(prevBox.minx - this.transformBox.minx) > 0.1 ||
                    Math.abs(prevBox.miny - this.transformBox.miny) > 0.1 ||
                    Math.abs(prevBox.maxx - this.transformBox.maxx) > 0.1 ||
                    Math.abs(prevBox.maxy - this.transformBox.maxy) > 0.1;
                this.resetTransformState();
                if (selectionChanged) {
                    this.recoverTotalsFromHistory();
                }
                this.refreshPropertiesPanel();
            } else if (!this.hasSelectedPaths() && this.transformBox) {
                // Selection was lost, clear transform state
                this.transformBox = null;
                this.initialTransformBox = null;

                this.pivotCenter = null;
                this.originalPivot = null;
                this.refreshPropertiesPanel();
            }

            // Transition to appropriate state based on what parent did
            if (Select.state == Select.DRAGGING) {
                Transform.state = Transform.DRAGGING;
            } else if (Select.state == Select.SELECTING) {
                Transform.state = Transform.SELECTING;
            }
        }
    }

    /**
     * Handle mouse move event with state-based transformation logic
     * @param {HTMLCanvasElement} canvas - The canvas element
     * @param {MouseEvent} evt - The mouse event
     */
    onMouseMove(canvas, evt) {
        const mouse = this.normalizeEvent(canvas, evt);
        this.mouse = mouse;

        // Update hover detection when not dragging
        if (!this.mouseDown) {
            this.handleHoverDetection(this.normalizeEventWorld(canvas, evt));
        }

        // Handle state-specific transformations when mouse is down
        if (this.mouseDown) {
            if (Transform.state == Transform.DRAGGING && this.activeHandle?.type === 'center') {
                const mouseWorld = this.normalizeEventWorld(canvas, evt);
                let dragDeltaX = mouseWorld.x - this.dragStartXWorld;
                let dragDeltaY = mouseWorld.y - this.dragStartYWorld;

                if (evt.shiftKey) {
                    if (Math.abs(mouseWorld.x - this.initialMousePos.x) > Math.abs(mouseWorld.y - this.initialMousePos.y)) {
                        dragDeltaY = 0;
                    } else {
                        dragDeltaX = 0;
                    }
                }

                this.deltaX += dragDeltaX;
                this.deltaY += dragDeltaY;

                if (this.noSelection()) {
                    this.translate(this.dragPath, dragDeltaX, dragDeltaY);
                } else {
                    this.translateSelected(dragDeltaX, dragDeltaY);
                }

                const prevCenter = this.transformBox
                    ? { x: this.transformBox.centerX, y: this.transformBox.centerY }
                    : null;

                svgpaths.forEach(path => {
                    if (selectMgr.isSelected(path)) {
                        path.bbox = boundingBox(path.path);
                    }
                });
                this.transformBox = this.createTransformBox(svgpaths);
                this.updatePivotAfterTransform(prevCenter);

                this.dragStartX = mouseWorld.x;
                this.dragStartY = mouseWorld.y;
                this.dragStartXWorld = mouseWorld.x;
                this.dragStartYWorld = mouseWorld.y;
                this.updateCenterDisplay();
                redraw();
                return;
            }

            if (Transform.state == Transform.ADJUSTING_PIVOT) {
                this.handlePivotAdjustment(mouse);
            }
            else if (Transform.state == Transform.SCALING) {
                this.handleScaling(mouse, evt);
            }
            else if (Transform.state == Transform.ROTATING) {
                this.handleRotation(mouse);
            }
            else {
                super.onMouseMove(canvas, evt);
                // Sync state from parent Select class
                if (Select.state == Select.DRAGGING) {
                    Transform.state = Transform.DRAGGING;
                }
                if (Transform.state == Transform.DRAGGING && this.hasSelectedPaths()) {
                    const prevCenter = this.transformBox ?
                        { x: this.transformBox.centerX, y: this.transformBox.centerY } : null;
                    svgpaths.forEach(p => {
                        if (selectMgr.isSelected(p)) p.bbox = boundingBox(p.path);
                    });
                    this.transformBox = this.createTransformBox(svgpaths);
                    // Move pivot and originalPivot to follow the shape
                    if (prevCenter && this.pivotCenter) {
                        const dx = this.transformBox.centerX - prevCenter.x;
                        const dy = this.transformBox.centerY - prevCenter.y;
                        this.pivotCenter.x += dx;
                        this.pivotCenter.y += dy;
                        this.originalPivot.x += dx;
                        this.originalPivot.y += dy;
                    }
                }
                this.updateCenterDisplay();
            }
        }
        if (Transform.state == Transform.IDLE)
            super.onMouseMove(canvas, evt);

        redraw();
    }

    /**
     * Handle hover detection for transform handles
     * @param {Object} mouse - Mouse position {x, y}
     */
    handleHoverDetection(mouse) {
        this.hoverHandle = this.getHandleAtPoint(mouse);
        if (this.hoverHandle) {
            Transform.state = Transform.HOVERING;
        } else if (Transform.state == Transform.HOVERING) {
            Transform.state = Transform.IDLE;
        }
    }

    handleIdleThreshold(mouse, rawMouse, evt, canvas) {
        this.dragPath = this.potentialDragPath || closestPath(mouse, false);

        if (this.dragPath) {
            if (this.isPathLocked(this.dragPath)) {
                Select.state = Select.SELECTING;
                Transform.state = Transform.SELECTING;
                this.updateSelectBox(mouse, evt, canvas);
                return;
            }

            if (selectMgr.isSelected(this.dragPath) || selectMgr.noSelection()) {
                Select.state = Select.DRAGGING;
                Transform.state = Transform.DRAGGING;
                this.dragStartX = mouse.x;
                this.dragStartY = mouse.y;
                this.dragStartXWorld = rawMouse.x;
                this.dragStartYWorld = rawMouse.y;
                addUndo(false, true, false);
                return;
            }
        }

        Select.state = Select.SELECTING;
        Transform.state = Transform.SELECTING;
        this.updateSelectBox(mouse, evt, canvas);
    }

    /**
     * Handle pivot point adjustment (center handle)
     * @param {Object} mouse - Mouse position {x, y}
     */
    handlePivotAdjustment(mouse) {
        this.pivotCenter = mouse;
        this.center(); // Reset paths to original, not translated
        this.updateCenterDisplay();
    }

    /**
     * Handle scaling transformation
     * @param {Object} mouse - Mouse position {x, y}
     * @param {MouseEvent} evt - The mouse event (for shift key checking)
     */
    handleScaling(mouse, evt) {
        this.deltaX = 0;
        this.deltaY = 0;

        // Calculate scale factors based on mouse movement from initial position
        if (this.initialTransformBox == null) {
            return;
        }

        const initialDistanceX = this.initialMousePos.x - this.initialTransformBox.centerX;
        const initialDistanceY = this.initialMousePos.y - this.initialTransformBox.centerY;
        const currentDistanceX = mouse.x - this.initialTransformBox.centerX;
        const currentDistanceY = mouse.y - this.initialTransformBox.centerY;

        let scaleX = 1;
        let scaleY = 1;

        if (Math.abs(initialDistanceX) > 1) {
            scaleX = Math.max(Transform.SCALE_MIN, Math.min(Transform.SCALE_MAX, currentDistanceX / initialDistanceX));
        }
        if (Math.abs(initialDistanceY) > 1) {
            scaleY = Math.max(Transform.SCALE_MIN, Math.min(Transform.SCALE_MAX, currentDistanceY / initialDistanceY));
        }

        // Corner handles resize proportionally so shapes keep their aspect ratio.
        // Shift still forces the same behaviour explicitly.
        const preserveAspectRatio = this.activeHandle?.type === 'scale' || evt.shiftKey;
        if (preserveAspectRatio) {
            const uniformScale = Math.max(Math.abs(scaleX), Math.abs(scaleY));
            scaleX = scaleX < 0 ? -uniformScale : uniformScale;
            scaleY = scaleY < 0 ? -uniformScale : uniformScale;
        }

        // Update and apply scale
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.scale(scaleX, scaleY);
        this.transformBox = this.createTransformBox(svgpaths);
        this.updateCenterDisplay();
    }

    /**
     * Handle rotation transformation
     * @param {Object} mouse - Mouse position {x, y}
     */
    handleRotation(mouse) {
        this.deltaX = 0;
        this.deltaY = 0;

        // Calculate current angle from pivot center to mouse
        const currentAngle = Math.atan2(
            mouse.x - this.pivotCenter.x,
            mouse.y - this.pivotCenter.y
        );

        // Apply rotation snapping to nearest 5-degree increment
        const rotationDelta = Math.round(currentAngle / this.ROTATION_SNAP) * this.ROTATION_SNAP;

        // Convert to degrees and apply rotation
        this.rotation = rotationDelta * 180 / Math.PI;
        this.rotate(this.rotation);
        this.transformBox = this.createTransformBox(svgpaths);
        this.updateCenterDisplay();
    }

    /**
     * Handle skewing transformation
     * @param {Object} mouse - Mouse position {x, y}
     * @param {MouseEvent} evt - The mouse event
     */
    handleSkewing(mouse, evt) {
        this.deltaX = 0;
        this.deltaY = 0;

        if (this.initialTransformBox == null) return;

        const cx = this.initialTransformBox.centerX;
        const cy = this.initialTransformBox.centerY;
        const boxWidth = this.initialTransformBox.width;
        const boxHeight = this.initialTransformBox.height;

        if (this.activeHandle.type === 'skewX') {
            // Horizontal skew: mouse horizontal delta relative to box height
            const deltaX = mouse.x - this.initialMousePos.x;
            this.skewX = Math.atan2(deltaX, boxHeight) * 180 / Math.PI;
            this.skewY = 0;
        } else {
            // Vertical skew: mouse vertical delta relative to box width
            const deltaY = mouse.y - this.initialMousePos.y;
            this.skewX = 0;
            this.skewY = Math.atan2(deltaY, boxWidth) * 180 / Math.PI;
        }

        this.skew(this.skewX, this.skewY);
        this.transformBox = this.createTransformBox(svgpaths);
        this.updateCenterDisplay();
    }

    updatePivotAfterTransform(prevCenter) {
        const newCenter = { x: this.transformBox.centerX, y: this.transformBox.centerY };

        if (prevCenter && this.pivotCenter) {
            // Move pivot by the amount the transform box moved
            const dx = newCenter.x - prevCenter.x;
            const dy = newCenter.y - prevCenter.y;
            this.pivotCenter.x += dx;
            this.pivotCenter.y += dy;
            this.originalPivot.x += dx;
            this.originalPivot.y += dy;
        } else if (!prevCenter || prevCenter.x !== newCenter.x || prevCenter.y !== newCenter.y) {
            this.pivotCenter = { ...newCenter };
            this.originalPivot = { ...newCenter };
        }
    }

    recordTransformHistory() {
        const isIdentity = this.deltaX === 0 && this.deltaY === 0 &&
            this.scaleX === 1 && this.scaleY === 1 &&
            this.rotation === 0 && this.skewX === 0 && this.skewY === 0;
        if (isIdentity) return;

        const cx = this.initialTransformBox.centerX;
        const cy = this.initialTransformBox.centerY;
        selectMgr.selectedPaths().forEach(path => {
            if (path.creationProperties) {
                if (!path.transformHistory) path.transformHistory = [];
                path.transformHistory.push({
                    centerX: cx, centerY: cy,
                    scaleX: this.scaleX, scaleY: this.scaleY,
                    rotation: this.rotation,
                    skewX: this.skewX, skewY: this.skewY,
                    deltaX: this.deltaX, deltaY: this.deltaY,
                    pivotCenterX: this.pivotCenter ? this.pivotCenter.x : cx,
                    pivotCenterY: this.pivotCenter ? this.pivotCenter.y : cy
                });
            }
        });
    }

    isEditableShapePath(path) {
        return !!(path && path.creationProperties && (
            path.creationTool === 'Shape'
            || (window.SHAPE_TOOL_NAMES || []).includes(path.creationTool)
        ));
    }

    getTransformSnapshot() {
        if (!this.initialTransformBox) {
            return null;
        }

        return {
            centerX: this.initialTransformBox.centerX,
            centerY: this.initialTransformBox.centerY,
            scaleX: this.scaleX,
            scaleY: this.scaleY,
            skewX: this.skewX,
            skewY: this.skewY,
            rotation: this.rotation,
            deltaX: this.deltaX,
            deltaY: this.deltaY,
            pivotCenterX: this.pivotCenter ? this.pivotCenter.x : this.initialTransformBox.centerX,
            pivotCenterY: this.pivotCenter ? this.pivotCenter.y : this.initialTransformBox.centerY
        };
    }

    applySnapshotToPoint(point, snapshot) {
        if (!point || !snapshot) {
            return point;
        }

        let newX = snapshot.centerX + (point.x - snapshot.centerX) * snapshot.scaleX;
        let newY = snapshot.centerY + (point.y - snapshot.centerY) * snapshot.scaleY;

        if (snapshot.skewX !== 0 || snapshot.skewY !== 0) {
            const dx = newX - snapshot.centerX;
            const dy = newY - snapshot.centerY;
            const tanX = Math.tan(-snapshot.skewX * Math.PI / 180);
            const tanY = Math.tan(snapshot.skewY * Math.PI / 180);
            newX = snapshot.centerX + dx + dy * tanX;
            newY = snapshot.centerY + dy + dx * tanY;
        }

        const rotationRad = -snapshot.rotation * Math.PI / 180;
        if (rotationRad !== 0) {
            const dx = newX - snapshot.pivotCenterX;
            const dy = newY - snapshot.pivotCenterY;
            const cos = Math.cos(rotationRad);
            const sin = Math.sin(rotationRad);
            newX = snapshot.pivotCenterX + (dx * cos - dy * sin);
            newY = snapshot.pivotCenterY + (dx * sin + dy * cos);
        }

        return {
            x: newX + snapshot.deltaX,
            y: newY + snapshot.deltaY
        };
    }

    bakeShapeTransformMetadata() {
        const snapshot = this.getTransformSnapshot();
        if (!snapshot) {
            return;
        }

        const hasNonRepresentableTransform = snapshot.skewX !== 0
            || snapshot.skewY !== 0
            || snapshot.scaleX < 0
            || snapshot.scaleY < 0;
        if (hasNonRepresentableTransform) {
            return;
        }

        selectMgr.selectedPaths().forEach(path => {
            if (!this.isEditableShapePath(path)) {
                return;
            }

            const operation = window.cncController?.operationManager?.getOperation(path.creationTool);
            if (!operation || typeof operation.getPathShapeProperties !== 'function') {
                return;
            }

            const properties = operation.getPathShapeProperties(path);
            const center = operation.toInternal
                ? {
                    x: operation.toInternal(properties.x),
                    y: operation.toInternal(properties.y)
                }
                : (path.creationProperties?.center || {
                    x: (path.bbox.minx + path.bbox.maxx) / 2,
                    y: (path.bbox.miny + path.bbox.maxy) / 2
                });
            const nextCenter = this.applySnapshotToPoint(center, snapshot);
            const nextAngle = ((Number(properties.angle) || 0) + snapshot.rotation) % 360;
            const nextProperties = {
                ...properties,
                x: operation.toExternal ? operation.toExternal(nextCenter.x) : properties.x,
                y: operation.toExternal ? operation.toExternal(nextCenter.y) : properties.y,
                width: Math.max(0, Number(properties.width) * Math.abs(snapshot.scaleX)),
                height: Math.max(0, Number(properties.height) * Math.abs(snapshot.scaleY)),
                angle: nextAngle < 0 ? nextAngle + 360 : nextAngle
            };

            path.creationProperties = {
                ...path.creationProperties,
                center: nextCenter,
                properties: typeof operation.buildStoredProperties === 'function'
                    ? operation.buildStoredProperties(nextProperties)
                    : {
                        ...(path.creationProperties?.properties || {}),
                        ...nextProperties
                    }
            };
            delete path.transformHistory;
        });
    }

    onMouseUp(canvas, evt) {
        const hadSelectBox = this.selectBox;
        const wasTransforming =
            (Transform.state == Transform.ADJUSTING_PIVOT ||
                Transform.state == Transform.SCALING ||
                Transform.state == Transform.ROTATING ||
                Transform.state == Transform.DRAGGING ||
                Transform.state == Transform.MIRRORING ||
                Transform.state == Transform.SKEWING
            );

        this.mouseDown = false;

        if (!wasTransforming)
            super.onMouseUp(canvas, evt);

        if (this.hasSelectedPaths()) {
            // Update bboxes for all selected paths
            svgpaths.forEach(path => {
                if (selectMgr.isSelected(path)) {
                    path.bbox = boundingBox(path.path);
                }
            });

            const prevCenter = this.transformBox ?
                { x: this.transformBox.centerX, y: this.transformBox.centerY } : null;

            this.transformBox = this.createTransformBox(svgpaths);
            this.initialTransformBox = { ...this.transformBox };
            this.activeHandle = null;
            this.storeOriginalPaths();

            this.updatePivotAfterTransform(prevCenter);

            if (wasTransforming) {
                this.recordTransformHistory();
                this.bakeShapeTransformMetadata();
                this.totalRotation += this.rotation;
                this.totalSkewX += this.skewX;
                this.totalSkewY += this.skewY;
            } else {
                this.recoverTotalsFromHistory();
            }

            if (wasTransforming) {
                onPathsChanged(selectMgr.selectedPaths().map(p => p.id));
            }

            if (wasTransforming) {
                const selectedPaths = selectMgr.selectedPaths();
                selectedPaths.forEach(path => {
                    if (path.toolpathProperties && typeof scheduleShapeMachiningToolpathSync === 'function') {
                        scheduleShapeMachiningToolpathSync(path, { createIfMissing: true });
                    }
                });
            }

            this.resetTransformState();

            if (hadSelectBox || !wasTransforming) {
                this.refreshPropertiesPanel();
            }

            Transform.state = Transform.IDLE;
        } else {
            this.transformBox = null;
            this.activeHandle = null;
            Transform.state = Transform.IDLE;

            const operationsTab = document.getElementById('operations-tab');
            if (operationsTab && operationsTab.classList.contains('active')) {
                cncController.setMode('Select');
                return;
            }
        }

        this.updateCenterDisplay();
        redraw();
    }

    center() {
        let selected = selectMgr.selectedPaths();
        selected.forEach(path => {
            const originalPath = path.originalPath;
            if (originalPath) {
                path.path = [...originalPath];
                path.bbox = boundingBox(path.path);
            }
        });
    }

    /**
     * Apply scaling transformation to selected paths
     * Scales around the transform box center
     * @param {Number} scaleX - Horizontal scale factor
     * @param {Number} scaleY - Vertical scale factor
     */
    scale(scaleX, scaleY) {
        const cx = this.initialTransformBox.centerX;
        const cy = this.initialTransformBox.centerY;

        let selected = selectMgr.selectedPaths();
        selected.forEach(svgpath => {
            const path = svgpath.originalPath;
            if (path) {
                for (let i = 0; i < path.length; i++) {
                    let pt = path[i];
                    if (i != path.length - 1 || pt !== path[0]) {

                        const newX = cx + (pt.x - cx) * scaleX;
                        const newY = cy + (pt.y - cy) * scaleY;
                        svgpath.path[i].x = newX;
                        svgpath.path[i].y = newY;
                    }
                }
                svgpath.bbox = boundingBox(svgpath.path);

                // Transform tabs from original positions to match the scaled path
                if (svgpath.originalTabs && svgpath.creationProperties) {
                    // Restore tabs from original
                    svgpath.creationProperties.tabs = svgpath.originalTabs.map(tab => ({...tab,
                        edgeP1: tab.edgeP1 ? {...tab.edgeP1} : null,
                        edgeP2: tab.edgeP2 ? {...tab.edgeP2} : null
                    }));
                    // Apply scale transformation
                    this.transformTabsScale(svgpath, cx, cy, scaleX, scaleY);
                }
            }
        });
    }

    /**
     * Apply skew transformation to selected paths
     * Skews around the transform box center
     * @param {Number} skewXDeg - Horizontal skew angle in degrees
     * @param {Number} skewYDeg - Vertical skew angle in degrees
     */
    skew(skewXDeg, skewYDeg) {
        const cx = this.initialTransformBox.centerX;
        const cy = this.initialTransformBox.centerY;
        const tanX = Math.tan(-skewXDeg * Math.PI / 180);
        const tanY = Math.tan(skewYDeg * Math.PI / 180);

        let selected = selectMgr.selectedPaths();
        selected.forEach(svgpath => {
            const path = svgpath.originalPath;
            if (path) {
                for (let i = 0; i < path.length; i++) {
                    let pt = path[i];
                    if (i != path.length - 1 || pt !== path[0]) {
                        const dx = pt.x - cx;
                        const dy = pt.y - cy;
                        svgpath.path[i].x = cx + dx + dy * tanX;
                        svgpath.path[i].y = cy + dy + dx * tanY;
                    }
                }
                svgpath.bbox = boundingBox(svgpath.path);

                // Transform tabs from original positions to match the skewed path
                if (svgpath.originalTabs && svgpath.creationProperties) {
                    svgpath.creationProperties.tabs = svgpath.originalTabs.map(tab => ({...tab,
                        edgeP1: tab.edgeP1 ? {...tab.edgeP1} : null,
                        edgeP2: tab.edgeP2 ? {...tab.edgeP2} : null
                    }));
                    this.transformTabsSkew(svgpath, cx, cy, tanX, tanY);
                }
            }
        });
    }

    /**
     * Apply rotation transformation to selected paths
     * Rotates around the pivot center point
     * @param {Number} angle - Rotation angle in degrees
     */
    rotate(angle) {
        const rotationRad = -angle * Math.PI / 180;
        const cos = Math.cos(rotationRad);
        const sin = Math.sin(rotationRad);
        const px = this.pivotCenter.x;
        const py = this.pivotCenter.y;

        let selected = selectMgr.selectedPaths();
        selected.forEach(svgpath => {
            const path = svgpath.originalPath;
            if (path) {
                for (let i = 0; i < path.length; i++) {
                    let pt = path[i];
                    if (i != path.length - 1 || pt !== path[0]) {

                        const dx = pt.x - px;
                        const dy = pt.y - py;

                        const newX = px + (dx * cos - dy * sin);
                        const newY = py + (dx * sin + dy * cos);
                        svgpath.path[i].x = newX;
                        svgpath.path[i].y = newY;
                    }
                }
                svgpath.bbox = boundingBox(svgpath.path);

                // Transform tabs from original positions to match the rotated path
                if (svgpath.originalTabs && svgpath.creationProperties) {
                    // Restore tabs from original
                    svgpath.creationProperties.tabs = svgpath.originalTabs.map(tab => ({...tab,
                        edgeP1: tab.edgeP1 ? {...tab.edgeP1} : null,
                        edgeP2: tab.edgeP2 ? {...tab.edgeP2} : null
                    }));
                    // Apply rotation transformation
                    this.transformTabsRotate(svgpath, px, py, rotationRad);
                }
            }
        });
    }

    /**
     * Mirror selected paths horizontally (flip left-right)
     */
    mirrorX() {
        const { centerX, centerY } = this.transformBox;
        const cx = 2 * centerX;
        let selected = selectMgr.selectedPaths();
        selected.forEach(svgpath => {
            let path = svgpath.path;
            for (let i = 0; i < path.length; i++) {
                let pt = path[i];
                if (i != path.length - 1 || pt !== path[0]) {
                    pt.x = cx - pt.x;
                }
            }

            svgpath.bbox = boundingBox(path);

            // Store mirror as scaleX=-1 in transform history
            if (svgpath.creationProperties) {
                if (!svgpath.transformHistory) svgpath.transformHistory = [];
                svgpath.transformHistory.push({
                    centerX: centerX, centerY: centerY,
                    scaleX: -1, scaleY: 1, rotation: 0,
                    skewX: 0, skewY: 0, deltaX: 0, deltaY: 0,
                    pivotCenterX: centerX, pivotCenterY: centerY
                });
            }

            // Transform tabs to match the mirrored path
            this.transformTabsMirrorX(svgpath, centerX);
        });

        // Regenerate any toolpaths linked to mirrored paths
        regenerateToolpathsForPaths(selected.map(p => p.id));
    }

    /**
     * Mirror selected paths vertically (flip top-bottom)
     */
    mirrorY() {
        const { centerX, centerY } = this.transformBox;
        const cy = 2 * centerY;
        let selected = selectMgr.selectedPaths();
        selected.forEach(svgpath => {
            let path = svgpath.path;
            for (let i = 0; i < path.length; i++) {
                let pt = path[i];
                if (i != path.length - 1 || pt !== path[0]) {
                    pt.y = cy - pt.y;
                }
            }
            svgpath.bbox = boundingBox(path);

            // Store mirror as scaleY=-1 in transform history
            if (svgpath.creationProperties) {
                if (!svgpath.transformHistory) svgpath.transformHistory = [];
                svgpath.transformHistory.push({
                    centerX: centerX, centerY: centerY,
                    scaleX: 1, scaleY: -1, rotation: 0,
                    skewX: 0, skewY: 0, deltaX: 0, deltaY: 0,
                    pivotCenterX: centerX, pivotCenterY: centerY
                });
            }

            // Transform tabs to match the mirrored path
            this.transformTabsMirrorY(svgpath, centerY);
        });

        // Regenerate any toolpaths linked to mirrored paths
        regenerateToolpathsForPaths(selected.map(p => p.id));
    }

    draw(ctx) {
        super.draw(ctx);
        this.drawTransformBox(ctx);
    }


    hasSelectedPaths() {
        return !selectMgr.noSelection();
    }

    createTransformBox(paths) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        // Calculate bounding box for all selected paths
        paths.forEach(path => {
            if (selectMgr.isSelected(path)) {
                minX = Math.min(minX, path.bbox.minx);
                minY = Math.min(minY, path.bbox.miny);
                maxX = Math.max(maxX, path.bbox.maxx);
                maxY = Math.max(maxY, path.bbox.maxy);
            }
        });

        if (minX === Infinity) return null; // No selected paths

        if (maxX - minX < Transform.MIN_BOX_DIMENSION) { maxX++; minX--; }
        if (maxY - minY < Transform.MIN_BOX_DIMENSION) { maxY++; minY--; }
        return {
            minx: minX,
            miny: minY,
            maxx: maxX,
            maxy: maxY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
            width: maxX - minX,
            height: maxY - minY,
            rotation: 0
        };
    }

    drawText(ctx) {
        // Only draw info text when actively transforming
        if (!this.transformBox) return;
        if (!(Transform.state == Transform.SCALING || Transform.state == Transform.ROTATING)) return;

        let text = '0'
        if (Transform.state == Transform.ROTATING) {
            text = (this.totalRotation + this.rotation).toFixed(1) + '°';
        }
        else if (Transform.state == Transform.SCALING) {
            // Show current dimensions instead of scale factors
            const currentWidth = this.transformBox.width / viewScale;
            const currentHeight = this.transformBox.height / viewScale;

            text = formatDimension(currentWidth, true) + ' × ' + formatDimension(currentHeight, true);
        }

        const textAnchor = this.mouse
            ? worldToScreen(this.mouse.x, this.mouse.y)
            : worldToScreen(this.transformBox.centerX, this.transformBox.centerY);
        ctx.save();
        ctx.fillStyle = pointFillColor;
        ctx.font = '12px Arial';
        ctx.fillText(text, textAnchor.x + 10, textAnchor.y - 25);
        ctx.restore();
    }

    drawHandle(ctx, handle) {
        let screenHandle = worldToScreen(handle.x, handle.y);
        let x = screenHandle.x;
        let y = screenHandle.y;
        let size = this.handleSize;
        let isActive = this.activeHandle?.id == handle.id;
        let isHovered = this.hoverHandle?.id == handle.id;
        let type = handle.type;

        // Color based on state
        if (isActive) {
            ctx.fillStyle = handleActiveColor;
            ctx.strokeStyle = handleActiveStroke;
        } else if (isHovered) {
            ctx.fillStyle = handleHoverColor;
            ctx.strokeStyle = handleHoverStroke;
        } else {
            ctx.fillStyle = handleNormalColor;
            ctx.strokeStyle = handleNormalStroke;
        }
        ctx.lineWidth = 2;

        if (type == 'mirrorX') {
            // Horizontal flip - positioned above center, triangles separated across vertical axis
            const gap = 2;
            // Left triangle (points left)
            ctx.beginPath();
            ctx.moveTo(x - gap, y - size);
            ctx.lineTo(x - gap - size, y);
            ctx.lineTo(x - gap, y + size);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Right triangle (points right)
            ctx.beginPath();
            ctx.moveTo(x + gap, y - size);
            ctx.lineTo(x + gap + size, y);
            ctx.lineTo(x + gap, y + size);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        else if (type == 'mirrorY') {
            // Vertical flip - positioned to right of center, triangles separated across horizontal axis
            const gap = 2;
            // Top triangle (points up)
            ctx.beginPath();
            ctx.moveTo(x - size, y - gap);
            ctx.lineTo(x, y - gap - size);
            ctx.lineTo(x + size, y - gap);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Bottom triangle (points down)
            ctx.beginPath();
            ctx.moveTo(x - size, y + gap);
            ctx.lineTo(x, y + gap + size);
            ctx.lineTo(x + size, y + gap);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        else if (type == 'skewX' || type == 'skewY') {
            // Rhombus (parallelogram) handle for skew
            const w = size + 2;  // half width
            const h = size - 2;  // half height (shorter to make it flat)
            const lean = 4;      // horizontal offset for the lean
            ctx.beginPath();
            if (type == 'skewX') {
                // Horizontal rhombus (leaning right) for top edge skew
                ctx.moveTo(x - w + lean, y - h);
                ctx.lineTo(x + w + lean, y - h);
                ctx.lineTo(x + w - lean, y + h);
                ctx.lineTo(x - w - lean, y + h);
            } else {
                // Vertical rhombus (leaning down) for right edge skew
                ctx.moveTo(x - h, y - w - lean);
                ctx.lineTo(x + h, y - w + lean);
                ctx.lineTo(x + h, y + w + lean);
                ctx.lineTo(x - h, y + w - lean);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        else if (type == 'scale') {
            // Square handle for scale
            ctx.beginPath();
            ctx.rect(x - size, y - size, size * 2, size * 2);
            ctx.fill();
            ctx.stroke();
        }
        else if (type == 'rotate') {
            // Filled circle background like other handles
            this.drawCircle(ctx, x, y, size, ctx.fillStyle, null);
         

            // Arc from 9 o'clock counter-clockwise to 10 o'clock
            const arrowRadius = size + 2;
            const nineOClock = Math.PI;          // 9 o'clock
            const tenOClock = Math.PI * 1.17;    // 10 o'clock (~210 degrees)

            ctx.beginPath();
            ctx.arc(x, y, arrowRadius, nineOClock, tenOClock, true); // counter-clockwise
            ctx.lineWidth = 2;
            ctx.stroke();

            // Arrowhead at 10 o'clock: one leg vertical, one horizontal
            const ax = x + arrowRadius * Math.cos(tenOClock);
            const ay = y + arrowRadius * Math.sin(tenOClock);
            const legLen = 6;
            ctx.beginPath();
            ctx.moveTo(ax, ay - legLen);   // vertical leg (up)
            ctx.lineTo(ax, ay);
            ctx.lineTo(ax + legLen, ay);   // horizontal leg (right)
            ctx.lineWidth = 2.5;
            ctx.stroke();
        }
        else if (type == 'center') {
            // Crosshair for pivot center
            this.drawCrosshair(ctx, x, y, size + 3, ctx.strokeStyle, ctx.lineWidth);
            // Small circle at center
            this.drawCircle(ctx, x, y, 3, ctx.fillStyle, ctx.strokeStyle, ctx.lineWidth);
        }
        else {
            this.drawCircle(ctx, x, y, size, ctx.fillStyle, ctx.strokeStyle, ctx.lineWidth);
        }
    }



    drawRotation(ctx, handle) {
        // Guard: only draw if pivot center exists
        if (!this.pivotCenter || !this.mouse) return;

        let screenHandle = worldToScreen(this.mouse.x, this.mouse.y);
        let screenCenter = worldToScreen(this.pivotCenter.x, this.pivotCenter.y);
        this.drawLine(ctx, screenCenter.x, screenCenter.y, screenHandle.x, screenHandle.y, selectionBoxColor, 1, [5, 5]);
        Operation.prototype.drawHandle.call(this, ctx, screenHandle.x, screenHandle.y, this.handleSize, handleHoverColor, handleHoverStroke);
    }

    drawTransformBox(ctx) {
        if (!this.transformBox) return;

        ctx.save();
        ctx.strokeStyle = selectionBoxColor;
        ctx.lineWidth = 1;

        // Rotate context around center point (convert center to screen coordinates)
        let screenCenter = worldToScreen(this.transformBox.centerX, this.transformBox.centerY);
        ctx.translate(screenCenter.x, screenCenter.y);
        ctx.rotate(this.transformBox.rotation);
        ctx.translate(-screenCenter.x, -screenCenter.y);

        // Draw main box (convert all corners to screen coordinates)
        let p1 = worldToScreen(this.transformBox.minx, this.transformBox.miny);
        let p2 = worldToScreen(this.transformBox.maxx, this.transformBox.miny);
        let p3 = worldToScreen(this.transformBox.maxx, this.transformBox.maxy);
        let p4 = worldToScreen(this.transformBox.minx, this.transformBox.maxy);

        // Only draw box outline when not actively transforming
        if (!this.mouseDown || Transform.state == Transform.ADJUSTING_PIVOT) {
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(p3.x, p3.y);
            ctx.lineTo(p4.x, p4.y);
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw handles (convert handle positions to screen coordinates)
        const handles = this.getTransformHandles();

        // Show rotation reference line during rotation
        if (Transform.state == Transform.ROTATING) {
            this.drawRotation(ctx, handles[4]);
        }

        // Show center handle during pivot adjustment
        if (Transform.state == Transform.ADJUSTING_PIVOT) {
            this.drawHandle(ctx, handles[5]);
        }

        // Draw dashed line between rotation handle and center point
        if (!this.mouseDown || Transform.state == Transform.ADJUSTING_PIVOT) {
            const rotateHandle = handles[4]; // rotate
            const centerHandle = handles[5]; // center/pivot
            const screenRotate = worldToScreen(rotateHandle.x, rotateHandle.y);
            const screenPivot = worldToScreen(centerHandle.x, centerHandle.y);
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = selectionBoxColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(screenPivot.x, screenPivot.y);
            ctx.lineTo(screenRotate.x, screenRotate.y);
            ctx.stroke();
            ctx.restore();
        }

        // Show all handles when not actively dragging/transforming
        if (!this.mouseDown || Transform.state == Transform.ADJUSTING_PIVOT) {
            handles.forEach(handle => {
                this.drawHandle(ctx, handle);
            });
        }

        this.drawText(ctx);
        ctx.restore();
    }

    getTransformHandles() {
        if (!this.transformBox) return [];

        const { minx, miny, maxx, maxy, centerX, centerY } = this.transformBox;
        let pivotX = centerX;
        let pivotY = centerY;
        if (this.pivotCenter) {
            pivotX = this.pivotCenter.x;
            pivotY = this.pivotCenter.y;
        }
        const rotationRad = this.rotation * Math.PI / 180;
        let ry = Transform.ROTATION_LINE_LENGTH * Math.cos(rotationRad);
        let rx = Transform.ROTATION_LINE_LENGTH * Math.sin(rotationRad);



        return [
            { id: 1, x: minx, y: miny, type: 'scale', corner: 'tl' },
            { id: 2, x: maxx, y: miny, type: 'scale', corner: 'tr' },
            { id: 3, x: maxx, y: maxy, type: 'scale', corner: 'br' },
            { id: 4, x: minx, y: maxy, type: 'scale', corner: 'bl' },
            { id: 5, x: pivotX + rx, y: pivotY + ry, type: 'rotate' },
            { id: 6, x: pivotX, y: pivotY, type: 'center' },
            { id: 7, x: centerX + Transform.MIRROR_BUTTON_OFFSET, y: centerY, type: 'mirrorY' },
            { id: 8, x: centerX, y: centerY - Transform.MIRROR_BUTTON_OFFSET, type: 'mirrorX' }
        ];
    }

    getHandleAtPoint(point) {
        const handles = this.getTransformHandles();
        for (let handle of handles) {
            const dx = handle.x - point.x;
            const dy = handle.y - point.y;
            if (Math.sqrt(dx * dx + dy * dy) <= Transform.HANDLE_HIT_RADIUS / zoomLevel) {
                return handle;
            }
        }
        return null;
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        const hasSelectedPaths = this.hasSelectedPaths();

        // Center display (spans, updated live via PropertiesManager.setValue)
        let centerInfo;
        if (this.transformBox) {
            const centerMM = toMM(this.transformBox.centerX, this.transformBox.centerY);
            centerInfo = `
                <div class="alert alert-info mb-3">
                    <strong>Center Position</strong><br>
                    X: <span id="pm-centerX">${formatDimension(centerMM.x, true)}</span><br>
                    Y: <span id="pm-centerY">${formatDimension(centerMM.y, true)}</span>
                </div>`;
        } else {
            centerInfo = `
                <div class="alert alert-info mb-3">
                    <strong>Move Tool</strong><br>
                    Select objects to apply transformations.
                </div>`;
        }

        const deltaXmm   = this.deltaX / viewScale;
        const deltaYmm   = -this.deltaY / viewScale;
        const widthMM    = this.transformBox ? this.transformBox.width  / viewScale : 0;
        const heightMM   = this.transformBox ? this.transformBox.height / viewScale : 0;
        const rotValue   = (this.totalRotation + this.rotation).toFixed(1);

        const fh = (field, val) => PropertiesManager.fieldHTML(field, val);
        const inlineField = (field, val) => `
            <div class="row g-2 align-items-center mb-2">
                <div class="col-4">
                    <label for="pm-${field.key}" class="form-label small mb-0"><strong>${field.label}</strong></label>
                </div>
                <div class="col-8">
                    ${fh({ ...field, label: '' }, val).replace(/<label[\s\S]*?<\/label>/, '')}
                </div>
            </div>`;

        return centerInfo + `
            <div class="mb-3">
                <label class="form-label small d-block text-center"><strong>Translation</strong></label>
                ${inlineField(this.fields.deltaX, formatDimension(deltaXmm, true))}
                ${inlineField(this.fields.deltaY, formatDimension(deltaYmm, true))}
            </div>
            <div class="mb-3">
                <label class="form-label small d-block text-center"><strong>Dimensions</strong></label>
                ${inlineField(this.fields.width, formatDimension(widthMM, true))}
                ${inlineField(this.fields.height, formatDimension(heightMM, true))}
            </div>
            <div class="mb-3">
                <label class="form-label small d-block text-center"><strong>Rotation</strong></label>
                ${inlineField(this.fields.rotation, rotValue)}
            </div>`;
    }

    updateFromProperties(data) {
        // Guard: only allow property changes if paths are selected AND not actively dragging
        if (!this.transformBox || !(Transform.state == Transform.IDLE || Transform.state == Transform.HOVERING)) {
            // Silently ignore changes when not in a safe state (actively transforming or no selection)
            return;
        }

        this.properties = { ...this.properties, ...data };

        // Check if in inch mode for unit conversion
        const useInches = getOption('Inches');

        // Apply property changes to transform values
        // Use parseDimension to handle fractional inch input
        if (data.deltaX !== undefined) {
            const deltaXmm = parseDimension(data.deltaX, useInches);
            this.deltaX = deltaXmm * viewScale || 0;
        }
        if (data.deltaY !== undefined) {
            const deltaYmm = parseDimension(data.deltaY, useInches);
            this.deltaY = -deltaYmm * viewScale || 0;  // Flip Y for CNC coordinates
        }

        // Width/height edits keep the current aspect ratio constant.
        // Prefer the currently focused field so the other dimension follows it.
        if (this.transformBox) {
            const activeFieldKey = document.activeElement?.id?.replace(/^pm-/, '');
            const currentWidth = this.transformBox.width / viewScale;
            const currentHeight = this.transformBox.height / viewScale;

            if (data.width !== undefined && (activeFieldKey === 'width' || data.height === undefined)) {
                const widthMM = parseDimension(data.width, useInches);
                if (widthMM <= 0) return;
                const uniformScale = currentWidth > 0 ? widthMM / currentWidth : 1;
                this.scaleX = parseFloat(uniformScale.toFixed(2));
                this.scaleY = this.scaleX;
            }
            else if (data.height !== undefined) {
                const heightMM = parseDimension(data.height, useInches);
                if (heightMM <= 0) return;
                const uniformScale = currentHeight > 0 ? heightMM / currentHeight : 1;
                this.scaleY = parseFloat(uniformScale.toFixed(2));
                this.scaleX = this.scaleY;
            }
        }

        if (data.rotation !== undefined) this.rotation = (parseFloat(data.rotation) || 0) - this.totalRotation;

        // Apply transformation to paths based on current property values
        if (this.hasSelectedPaths()) {
            this.applyTransformFromProperties();
            this.updateCenterDisplay();
        }
    }

    updateCenterDisplay() {
        let centerMM = { x: 0, y: 0 };
        let currentWidth = 0;
        let currentHeight = 0;
        let rotation = 0;

        if (this.transformBox) {
            centerMM = toMM(this.transformBox.centerX, this.transformBox.centerY);
            currentWidth  = this.transformBox.width  / viewScale;
            currentHeight = this.transformBox.height / viewScale;
            rotation = this.totalRotation + this.rotation;
        }

        const deltaXmm = this.deltaX / viewScale;
        const deltaYmm = -this.deltaY / viewScale;

        // Center spans (setValue uses textContent for non-input elements)
        PropertiesManager.setValue('centerX', formatDimension(centerMM.x,    true));
        PropertiesManager.setValue('centerY', formatDimension(centerMM.y,    true));

        // Editable fields (setValue skips focused elements automatically)
        PropertiesManager.setValue('deltaX',   formatDimension(deltaXmm,     true));
        PropertiesManager.setValue('deltaY',   formatDimension(deltaYmm,     true));
        PropertiesManager.setValue('width',    formatDimension(currentWidth,  true));
        PropertiesManager.setValue('height',   formatDimension(currentHeight, true));
        PropertiesManager.setValue('rotation', rotation.toFixed(1));
    }

    applyTransformFromProperties() {
        if (!this.initialTransformBox) return;

        // Apply transformation to all selected paths
        let selected = selectMgr.selectedPaths();
        selected.forEach(path => {

            const originalPath = path.originalPath;
            if (originalPath) {
                // Apply translation, scale, and rotation from properties
                const centerX = this.initialTransformBox.centerX;
                const centerY = this.initialTransformBox.centerY;
                const rotationRad = -this.rotation * Math.PI / 180;

                path.path = originalPath.map(pt => {
                    // Scale around center
                    let newX = centerX + (pt.x - centerX) * this.scaleX;
                    let newY = centerY + (pt.y - centerY) * this.scaleY;

                    // Skew around center
                    if (this.skewX !== 0 || this.skewY !== 0) {
                        const dx = newX - centerX;
                        const dy = newY - centerY;
                        const tanX = Math.tan(-this.skewX * Math.PI / 180);
                        const tanY = Math.tan(this.skewY * Math.PI / 180);
                        newX = centerX + dx + dy * tanX;
                        newY = centerY + dy + dx * tanY;
                    }

                    // Rotate around center
                    if (rotationRad !== 0) {
                        const dx = newX - this.pivotCenter.x;
                        const dy = newY - this.pivotCenter.y;
                        const cos = Math.cos(rotationRad);
                        const sin = Math.sin(rotationRad);
                        newX = this.pivotCenter.x + (dx * cos - dy * sin);
                        newY = this.pivotCenter.y + (dx * sin + dy * cos);
                    }

                    // Translate
                    newX += this.deltaX;
                    newY += this.deltaY;



                    return { x: newX, y: newY };
                });

                path.bbox = boundingBox(path.path);

                // Transform tabs from original positions to match the transformed path
                if (path.originalTabs && path.creationProperties) {
                    // Restore tabs from original
                    path.creationProperties.tabs = path.originalTabs.map(tab => ({...tab,
                        edgeP1: tab.edgeP1 ? {...tab.edgeP1} : null,
                        edgeP2: tab.edgeP2 ? {...tab.edgeP2} : null
                    }));

                    // Apply the same transformations: scale, rotate, translate
                    // 1. Scale
                    if (this.scaleX !== 1 || this.scaleY !== 1) {
                        this.transformTabsScale(path, centerX, centerY, this.scaleX, this.scaleY);
                    }
                    // 1.5. Skew
                    if (this.skewX !== 0 || this.skewY !== 0) {
                        const tanX = Math.tan(-this.skewX * Math.PI / 180);
                        const tanY = Math.tan(this.skewY * Math.PI / 180);
                        this.transformTabsSkew(path, centerX, centerY, tanX, tanY);
                    }
                    // 2. Rotate
                    if (rotationRad !== 0) {
                        this.transformTabsRotate(path, this.pivotCenter.x, this.pivotCenter.y, rotationRad);
                    }
                    // 3. Translate
                    if (this.deltaX !== 0 || this.deltaY !== 0) {
                        this.translateTabs(path, this.deltaX, this.deltaY);
                    }
                }
            }

        });

        // Store transform history on each selected path (for editable object regeneration)
        const centerX = this.initialTransformBox.centerX;
        const centerY = this.initialTransformBox.centerY;
        selected.forEach(path => {
            if (path.creationProperties) {
                if (!path.transformHistory) path.transformHistory = [];
                path.transformHistory.push({
                    centerX: centerX,
                    centerY: centerY,
                    scaleX: this.scaleX,
                    scaleY: this.scaleY,
                    rotation: this.rotation,
                    skewX: this.skewX,
                    skewY: this.skewY,
                    deltaX: this.deltaX,
                    deltaY: this.deltaY,
                    pivotCenterX: this.pivotCenter ? this.pivotCenter.x : centerX,
                    pivotCenterY: this.pivotCenter ? this.pivotCenter.y : centerY
                });
            }
        });

        this.bakeShapeTransformMetadata();

        this.transformBox = this.createTransformBox(svgpaths);
        this.initialTransformBox = { ...this.transformBox };
        this.storeOriginalPaths();

        // Accumulate into totals after baking
        this.totalRotation += this.rotation;
        this.rotation = 0;
        this.totalSkewX += this.skewX;
        this.totalSkewY += this.skewY;
        this.skewX = 0;
        this.skewY = 0;

        if (this.pivotCenter) {
            this.pivotCenter.x += this.deltaX;
            this.pivotCenter.y += this.deltaY;
        }

        // Regenerate any toolpaths linked to transformed paths
        if (typeof regenerateToolpathsForPaths === 'function') {
            const changedIds = selected.map(p => p.id);
            regenerateToolpathsForPaths(changedIds);
        }

        redraw();
    }

    /**
     * Transform tabs during translation (moving) operation
     * @param {Object} svgpath - Path object containing tabs
     * @param {Number} deltaX - Translation in X direction
     * @param {Number} deltaY - Translation in Y direction
     */
    // transformTabsTranslate removed — use inherited translateTabs() from Select

    /**
     * Transform tabs during scaling operation
     * @param {Object} svgpath - Path object containing tabs
     * @param {Number} centerX - Center X for scaling
     * @param {Number} centerY - Center Y for scaling
     * @param {Number} scaleX - Horizontal scale factor
     * @param {Number} scaleY - Vertical scale factor
     */
    // Apply transformPt to tab position and both edge points, then call updateAngle.
    _transformTabPoints(svgpath, transformPt, updateAngle) {
        if (!svgpath.creationProperties || !svgpath.creationProperties.tabs) return;
        svgpath.creationProperties.tabs.forEach(tab => {
            transformPt(tab);
            if (tab.edgeP1) transformPt(tab.edgeP1);
            if (tab.edgeP2) transformPt(tab.edgeP2);
            if (updateAngle) updateAngle(tab);
        });
    }

    transformTabsScale(svgpath, centerX, centerY, scaleX, scaleY) {
        this._transformTabPoints(svgpath,
            pt => {
                pt.x = centerX + (pt.x - centerX) * scaleX;
                pt.y = centerY + (pt.y - centerY) * scaleY;
            },
            tab => {
                if (tab.edgeP1 && tab.edgeP2)
                    tab.angle = Math.atan2(tab.edgeP2.y - tab.edgeP1.y, tab.edgeP2.x - tab.edgeP1.x);
            }
        );
    }

    transformTabsSkew(svgpath, cx, cy, tanX, tanY) {
        this._transformTabPoints(svgpath,
            pt => {
                const dx = pt.x - cx, dy = pt.y - cy;
                pt.x = cx + dx + dy * tanX;
                pt.y = cy + dy + dx * tanY;
            },
            tab => {
                if (tab.edgeP1 && tab.edgeP2)
                    tab.angle = Math.atan2(tab.edgeP2.y - tab.edgeP1.y, tab.edgeP2.x - tab.edgeP1.x);
            }
        );
    }

    transformTabsRotate(svgpath, pivotX, pivotY, angleRad) {
        const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
        this._transformTabPoints(svgpath,
            pt => {
                const dx = pt.x - pivotX, dy = pt.y - pivotY;
                pt.x = pivotX + (dx * cos - dy * sin);
                pt.y = pivotY + (dx * sin + dy * cos);
            },
            tab => { tab.angle += angleRad; }
        );
    }

    transformTabsMirrorX(svgpath, centerX) {
        const cx = 2 * centerX;
        this._transformTabPoints(svgpath,
            pt => { pt.x = cx - pt.x; },
            tab => { tab.angle = Math.PI - tab.angle; }
        );
    }

    transformTabsMirrorY(svgpath, centerY) {
        const cy = 2 * centerY;
        this._transformTabPoints(svgpath,
            pt => { pt.y = cy - pt.y; },
            tab => { tab.angle = -tab.angle; }
        );
    }
}
