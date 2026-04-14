
class Select extends Operation {
    static instance;
    static selected = new Set();  // Use Set to prevent duplicate selections

    static IDLE = 0;
    static DRAGGING = 2;
    static SELECTING = 3;

    static state = Select.IDLE;

    // Magic number constants
    static DRAG_THRESHOLD = 8;              // pixels before drag is detected
    static MIN_DISTANCE_CHECK = 10;         // minimum pixels to register distance

    constructor() {
        super('Select', null);
        this.unselectOnMouseDown = true;
    }

    static getInstance() {
        if (!Select.instance)
            Select.instance = new Select();
        return Select.instance;
    }

    /**
     * Check if there are no selected paths
     * @returns {Boolean} True if no paths are selected
     */
    noSelection() {
        return Select.selected.size === 0;
    }

    /**
     * Check if a path is currently selected
     * @param {Object} path - The path to check
     * @returns {Boolean} True if the path is selected
     */
    isSelected(path) {
        return Select.selected.has(path);
    }

    /**
     * Add a path to the selection set
     * Detects and logs duplicate selection attempts
     * @param {Object} path - The path to select
     */
    selectPath(path) {
        if (Select.selected.has(path)) {

            console.warn(`Duplicate selectPath() call for path: ${path.id}`, new Error().stack);

            return;  // Path already selected, don't add again
        }
        Select.selected.add(path);
        selectSidebarNode(path.id);
        path.highlight = false;
    }

    /**
     * Remove a path from the selection set
     * @param {Object} path - The path to deselect
     */
    unselectPath(path) {
        Select.selected.delete(path);
        path.highlight = false;
        delete path.originalPath;
        unselectSidebarNode(path.id);
    }

    /**
     * Deselect all currently selected paths
     */
    unselectAll() {
        if (Select.selected.size > 0) {
            for (let path of Select.selected) {
                unselectSidebarNode(path.id);
                path.highlight = false;
                delete path.originalPath;
            }
        }
        Select.selected.clear();
    }

    /**
     * Get the last selected path
     * @returns {Object|null} The last selected path, or null if none selected
     */
    lastSelected() {
        if (Select.selected.size > 0) {
            const arr = [...Select.selected];
            return arr[arr.length - 1];
        }
        return null;
    }

    /**
     * Get all selected paths as an array
     * @returns {Array} Array of selected path objects
     */
    selectedPaths() {
        return [...Select.selected];
    }

    selectHighlighted()
    {
        for (let i = 0; i < svgpaths.length; i++) {
            if (!svgpaths[i].visible) continue;
            if (svgpaths[i].highlight && !Select.selected.has(svgpaths[i])) {
                this.selectPath(svgpaths[i]);
            }
        }
    }
    toggleSelection(path, evt) {
        if (path) {
            if (this.isSelected(path)) {
                if (this.unselectOnMouseDown) {
                    this.unselectPath(path);
                }
            }
            else {
                this.selectPath(path);
            }

        } else if (!evt.shiftKey && this.unselectOnMouseDown) {
            this.unselectAll();
        }
    }

    /**
     * Handle mouse down event - prepare for potential drag/select operations
     * State transitions happen in onMouseMove once drag threshold is exceeded
     * @param {HTMLCanvasElement} canvas - The canvas element
     * @param {MouseEvent} evt - The mouse event
     */
    onMouseDown(canvas, evt) {
        this.mouseDown = true;
        const mouse = this.normalizeEvent(canvas, evt);
        this.dragStartX = mouse.x;
        this.dragStartY = mouse.y;
        this.initialMousePos = mouse;
        this.rawdragStartX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
        this.rawdragStartY = evt.offsetY || (evt.pageY - canvas.offsetTop);
        const rawMouse = this.normalizeEventRaw(canvas, evt);
        this.dragStartXWorld = rawMouse.x;
        this.dragStartYWorld = rawMouse.y;
        this.dragPath = null;

        // Find any currently highlighted path by checking the highlight property directly
        const highlightedPath = this.findHighlightedPath();

        // Capture the path to potentially drag:
        // If a path is highlighted and mouse is inside its bounding box, use that path
        // This ensures the visually highlighted shape is the one that gets dragged
        if (highlightedPath && this.isNearEdge(mouse, highlightedPath)) {
            this.potentialDragPath = highlightedPath;
            // Keep it highlighted
            highlightedPath.highlight = true;
        } else {
            // Mouse is outside the highlighted path - fall back to other detection methods
            this.potentialDragPath = this.pointInPath(mouse);
        }

        // Don't change state yet - wait for onMouseMove to detect threshold crossing
        // State will transition to DRAGGING or SELECTING when threshold exceeded
    }

    /**
     * Find the currently highlighted path by checking the highlight property
     * @returns {Object|null} The highlighted path, or null if none
     */
    findHighlightedPath() {
        for (let i = 0; i < svgpaths.length; i++) {
            if (svgpaths[i].visible && svgpaths[i].highlight) {
                return svgpaths[i];
            }
        }
        return null;
    }

    /**
     * Check if a point is near any edge of a specific path
     * @param {Object} pt - Point {x, y}
     * @param {Object} svgpath - The path to check against
     * @returns {Boolean} True if point is near an edge
     */
    isNearEdge(pt, svgpath) {
        const maxDistSquared = 100;
        const path = svgpath.path;
        for (let j = 0; j < path.length; j++) {
            const k = (j + 1) % path.length;
            if (distToSegmentSquared(pt, path[j], path[k]) < maxDistSquared) {
                return true;
            }
        }
        return false;
    }

    /**
     * Find a path whose edge is near the given point
     * Uses distance-to-edge test so the mouse must be close to a path segment
     * @param {Object} pt - Point {x, y}
     * @returns {Object|null} The nearest path if within threshold, null otherwise
     */
    pointInPath(pt) {
        const maxDistSquared = 100; // Same threshold as closestPath
        const bboxMargin = 10;
        let bestPath = null;
        let bestDist = Infinity;

        for (let i = 0; i < svgpaths.length; i++) {
            if (!svgpaths[i].visible) continue;
            const bbox = svgpaths[i].bbox;
            // Quick bounding box reject with margin
            if (pt.x < bbox.minx - bboxMargin || pt.x > bbox.maxx + bboxMargin ||
                pt.y < bbox.miny - bboxMargin || pt.y > bbox.maxy + bboxMargin) {
                continue;
            }
            const path = svgpaths[i].path;
            for (let j = 0; j < path.length; j++) {
                const k = (j + 1) % path.length;
                const dist = distToSegmentSquared(pt, path[j], path[k]);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestPath = svgpaths[i];
                }
            }
        }
        return bestDist < maxDistSquared ? bestPath : null;
    }

    updateSelectBox(mouse, evt, canvas) {
        const screenX = evt.offsetX || (evt.pageX - canvas.offsetLeft);
        const screenY = evt.offsetY || (evt.pageY - canvas.offsetTop);
        const screenDx = screenX - this.rawdragStartX;
        const screenDy = screenY - this.rawdragStartY;

        if (Math.abs(screenDx) < Select.MIN_DISTANCE_CHECK || Math.abs(screenDy) < Select.MIN_DISTANCE_CHECK) return;

        this.selectBox = {
            minx: Math.min(this.dragStartX, mouse.x),
            miny: Math.min(this.dragStartY, mouse.y),
            maxx: Math.max(this.dragStartX, mouse.x),
            maxy: Math.max(this.dragStartY, mouse.y),
            rl: this.dragStartX < mouse.x
        };
        this.highlightPathsInRect(this.selectBox);
    }

    handleDragging(curX, curY, refX, refY, mouse, rawMouse, evt, snapOff) {
        let dragDeltaX = curX - refX;
        let dragDeltaY = curY - refY;

        if (evt.shiftKey) {
            if (Math.abs(curX - (snapOff ? this.dragStartXWorld : this.initialMousePos.x)) > Math.abs(curY - (snapOff ? this.dragStartYWorld : this.initialMousePos.y))) {
                dragDeltaY = 0;
            } else {
                dragDeltaX = 0;
            }
        }
        this.deltaX += dragDeltaX;
        this.deltaY += dragDeltaY;

        if (this.noSelection())
            this.translate(this.dragPath, dragDeltaX, dragDeltaY);
        else
            this.translateSelected(dragDeltaX, dragDeltaY);

        if (this.dragPath) this.dragPath.highlight = true;

        this.dragStartX = mouse.x;
        this.dragStartY = mouse.y;
        this.dragStartXWorld = rawMouse.x;
        this.dragStartYWorld = rawMouse.y;
    }

    handleIdleThreshold(mouse, rawMouse, evt, canvas) {
        this.dragPath = this.potentialDragPath || closestPath(mouse, false);

        if (this.dragPath) {
            if (selectMgr.isSelected(this.dragPath) || selectMgr.noSelection()) {
                Select.state = Select.DRAGGING;
                this.dragStartX = mouse.x;
                this.dragStartY = mouse.y;
                this.dragStartXWorld = rawMouse.x;
                this.dragStartYWorld = rawMouse.y;
                addUndo(false, true, false);
            }
        } else {
            Select.state = Select.SELECTING;
            this.updateSelectBox(mouse, evt, canvas);
        }
    }

    handleHover(mouse) {
        const previouslyHighlighted = this.findHighlightedPath();
        const nearestPath = closestPath(mouse, true);

        if (nearestPath) {
            this.lastHoveredPath = nearestPath;
        } else if (previouslyHighlighted && previouslyHighlighted.visible &&
                   pointInBoundingBox(mouse, previouslyHighlighted.bbox)) {
            previouslyHighlighted.highlight = true;
            this.lastHoveredPath = previouslyHighlighted;
            redraw();
        } else {
            this.lastHoveredPath = null;
        }

        Select.state = Select.IDLE;
    }

    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        const snapOff = typeof getOption === 'function' && getOption("snapGrid") === false;
        const rawMouse = snapOff ? this.normalizeEventRaw(canvas, evt) : mouse;

        if (!this.mouseDown) {
            this.handleHover(mouse);
            return;
        }

        const curX = snapOff ? rawMouse.x : mouse.x;
        const curY = snapOff ? rawMouse.y : mouse.y;
        const refX = snapOff ? this.dragStartXWorld : this.dragStartX;
        const refY = snapOff ? this.dragStartYWorld : this.dragStartY;

        const thresholdExceeded = Select.state == Select.DRAGGING ||
            Math.abs(refX - curX) > Select.DRAG_THRESHOLD ||
            Math.abs(refY - curY) > Select.DRAG_THRESHOLD;

        if (thresholdExceeded) {
            if (Select.state == Select.DRAGGING) {
                this.handleDragging(curX, curY, refX, refY, mouse, rawMouse, evt, snapOff);
            } else if (Select.state == Select.SELECTING) {
                this.updateSelectBox(mouse, evt, canvas);
            } else if (Select.state == Select.IDLE) {
                this.handleIdleThreshold(mouse, rawMouse, evt, canvas);
            }
        }
        redraw();
    }

    onMouseUp(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        const wasDragging = Select.state == Select.DRAGGING;
        this.mouseDown = false;

        // Only toggle selection if we stayed in IDLE (never crossed 8px threshold)
        // If we transitioned to DRAGGING or SELECTING, don't change selection
        if (Select.state == Select.IDLE) {
            // Use the path captured at mouse down (which includes highlighted paths)
            // Fall back to closestPath for clicks near edges
            let path = this.potentialDragPath || closestPath(mouse, false);
            this.toggleSelection(path, evt);
        }

        // Handle selection box (from SELECTING state)
        if (this.selectBox) {
            this.selectHighlighted(evt.shiftKey);
            this.selectBox = null;
        }

        // Notify that paths changed (handles toolpath regeneration, STL sync, etc.)
        if (wasDragging && typeof onPathsChanged === 'function') {
            const draggedIds = this.selectedPaths().map(p => p.id);
            if (this.dragPath && draggedIds.length === 0) {
                draggedIds.push(this.dragPath.id);
            }
            onPathsChanged(draggedIds);
        }

        // Clear drag path references
        this.dragPath = null;
        this.potentialDragPath = null;

        // Return to IDLE state
        Select.state = Select.IDLE;

        this.showSelection();
    }

    doOperation() {

        // Check if an operation properties editor is currently shown (operation is active)
        const operationPropertiesEditor = document.getElementById('operation-properties-editor');
        const isOperationActive = operationPropertiesEditor && operationPropertiesEditor.style.display !== 'none';

        if (isOperationActive) {
            generateToolpathForSelection();
        }

    }

    showSelection() {
        const operationsTab = document.getElementById('operations-tab');
        const isOnOperationsTab = operationsTab && operationsTab.classList.contains('active');
        const drawToolsTab = document.getElementById('draw-tools-tab');
        const isOnDrawTab = drawToolsTab && drawToolsTab.classList.contains('active');

        let pathToShow = this.lastSelected();

        if (pathToShow) {
            const currentOp = window.cncController.operationManager.currentOperation.name;
            if (isOnDrawTab && currentOp !== 'Move' && currentOp !== 'Boolean' && currentOp !== 'Offset' && currentOp !== 'Pattern') {
                doMove();
            } else if (isOnOperationsTab) {
                this.doOperation();
            }
        } else if (isOnDrawTab) {
            showToolsList();
        }
        redraw();

    }

    /**
     * Translate tabs along with the path
     * @param {Object} svgpath - Path object containing tabs
     * @param {Number} dx - Translation in X direction
     * @param {Number} dy - Translation in Y direction
     */
    translateTabs(svgpath, dx, dy) {
        if (!svgpath.creationProperties || !svgpath.creationProperties.tabs) return;

        svgpath.creationProperties.tabs.forEach(tab => {
            // Move tab position
            tab.x += dx;
            tab.y += dy;

            // Move edge points
            if (tab.edgeP1) {
                tab.edgeP1.x += dx;
                tab.edgeP1.y += dy;
            }
            if (tab.edgeP2) {
                tab.edgeP2.x += dx;
                tab.edgeP2.y += dy;
            }
            // Angle remains unchanged during translation
        });
    }

    translateSelected(dx, dy) {
        this.selectedPaths().forEach(svgpath => this.translate(svgpath, dx, dy));
    }

    translate(svgpath, dx, dy) {
        let path = svgpath.path;
        for (let i = 0; i < path.length; i++) {
            let pt = path[i];
            if (i != path.length - 1 || pt !== path[0]) {
                pt.x += dx;
                pt.y += dy;
            }
        }
        svgpath.bbox = boundingBox(path);

        // Translate tabs along with the path
        this.translateTabs(svgpath, dx, dy);
    }

    draw(ctx) {
        if (this.selectBox) {
            let topLeft = worldToScreen(this.selectBox.minx, this.selectBox.miny);
            let bottomRight = worldToScreen(this.selectBox.maxx, this.selectBox.maxy);
            let w = bottomRight.x - topLeft.x;
            let h = bottomRight.y - topLeft.y;

            if (this.selectBox.rl) {
                // Left-to-right: contain mode — solid blue
                ctx.strokeStyle = 'blue';
                ctx.fillStyle = 'rgba(0, 0, 255, 0.05)';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
            } else {
                // Right-to-left: touch mode — dashed green
                ctx.strokeStyle = 'green';
                ctx.fillStyle = 'rgba(0, 255, 0, 0.05)';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
            }

            ctx.fillRect(topLeft.x, topLeft.y, w, h);
            ctx.strokeRect(topLeft.x, topLeft.y, w, h);
            ctx.setLineDash([]);
        }
    }

}