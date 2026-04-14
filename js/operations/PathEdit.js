// Constants
const SMOOTHING_FACTOR = 0.5;
const MIN_SEGMENT_LENGTH = 0.001;
const MIN_ANGLE_THRESHOLD = 0.01;
const MAX_TANGENT_RATIO = 0.99;
const ARC_POINTS_PER_RADIAN = 3;

class PathEdit extends Select {
    constructor() {
        super('Edit','edit');
        this.name = 'Edit';
        this.icon = 'edit';
        this.tooltip = 'Edit individual points of a path (move, add, delete)';
 

        this.unselectOnMouseDown = false; // Don't auto-deselect when clicking
        this.handleSize = 8; // Size of point handles (in pixels)
        this.activeHandle = null;
        this._selectedPath = null;
        this.originalPath = null;

        // Add/Delete point functionality
        this.insertPreviewPoint = null; // {x, y, segmentIndex} for preview when Alt is held
        this.hoveredHandle = null; // Track which handle is hovered for delete feedback
        this.selectedHandlesForRadius = []; // Array of handle indices selected for radius application
        this.handleWasDragged = false; // Track if handle was dragged vs clicked
        this.originalPathBeforeRadius = null; // Store original path before radius operations for re-application
        this.syncFirstLast = false; // Track if first/last points should be synchronized
        this.lastRadiusValue = '5'; // Store last entered radius value
        this.lastCornerStyle = 'outer'; // Store last corner style selection

        // Field specs for PropertiesManager
        this.fields = {
            cornerStyle: {
                key: 'cornerStyle', label: 'Corner Style', type: 'choice', default: 'outer',
                options: [
                    { value: 'outer',   label: 'Radius (outer)' },
                    { value: 'inner',   label: 'Radius (inner)' },
                    { value: 'miter',   label: 'Miter (chamfer)' },
                    { value: 'dogbone', label: 'Dogbone' },
                ]
            },
            radius: { key: 'radius', label: 'Size', type: 'dimension', default: 5, help: 'e.g. 5mm or 1/4in' }
        };

        // Define keydown handler (will be added/removed in start/stop)
        this.keydownHandler = (evt) => {
            // Don't handle keyboard shortcuts if user is typing in an input field
            const activeElement = document.activeElement;
            if (activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.tagName === 'SELECT'
            )) {
                return; // Let the input handle the key press
            }

            if (evt.key === 'Delete' || evt.key === 'Backspace') {
                evt.preventDefault(); // Prevent default browser behavior
                this.deleteHoveredPoint();
            }
        };
    }

    // Getter for selectedPath - centralizes selectMgr access
    get selectedPath() {
        return selectMgr.lastSelected();
    }

    // Setter for selectedPath - kept for compatibility but value is ignored
    // Selection is managed through selectMgr
    set selectedPath(value) {
        // No-op: selection is managed through selectMgr
    }

    // Helper to update properties panel and refresh icons
    updatePropertiesPanel() {
        // Save current form values before rebuilding
        const oldRadiusInput = document.getElementById('pm-radius');
        if (oldRadiusInput) this.lastRadiusValue = oldRadiusInput.value;
        const oldCornerSelect = document.getElementById('pm-cornerStyle');
        if (oldCornerSelect) this.lastCornerStyle = oldCornerSelect.value;

        const form = document.getElementById('tool-properties-form');
        if (form) {
            form.innerHTML = this.getPropertiesHTML();
            this.wireRadiusControls();
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }
    }

    start() {
        super.start();
        this.activeHandle = null;
        this.originalPath = null;
        this.selectedHandlesForRadius = [];
        this.originalPathBeforeRadius = null;

        // Add keydown listener when tool becomes active
        document.addEventListener('keydown', this.keydownHandler);
    }

    stop() {
        super.stop();
        this.activeHandle = null;
        this.originalPath = null;
        this.insertPreviewPoint = null;
        this.hoveredHandle = null;
        this.selectedHandlesForRadius = [];
        this.originalPathBeforeRadius = null;
        this.syncFirstLast = false;

        // Clean up keydown listener
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
        }
    }

    onMouseDown(canvas, evt) {
        const mouse = this.normalizeEvent(canvas, evt);
        this.mouseDown = true;

        // Check if Shift key is held for setting first point
        if (evt.shiftKey && this.selectedPath) {
            const clickedHandle = this.getHandleAtPoint(mouse);
            if (clickedHandle !== null && clickedHandle !== 0) {
                this.setFirstPoint(clickedHandle);
                return;
            }
        }

        // Check if Alt key is held for adding a point
        if (evt.altKey && this.selectedPath && this.insertPreviewPoint) {
            // Add a new point at the preview location
            addUndo(false, true, false);

            const insertIndex = this.insertPreviewPoint.segmentIndex + 1;
            this.selectedPath.path.splice(insertIndex, 0, {
                x: this.insertPreviewPoint.x,
                y: this.insertPreviewPoint.y
            });

            // Recalculate bounding box
            this.selectedPath.bbox = boundingBox(this.selectedPath.path);

            // Clear preview
            this.insertPreviewPoint = null;

            redraw();
            return;
        }

        // First check if we're clicking on a point handle
        if (this.selectedPath) {
            this.activeHandle = this.getHandleAtPoint(mouse);

            if (this.activeHandle !== null) {
                // Track that we haven't dragged yet
                this.handleWasDragged = false;

                // Check if this is a closed path with duplicate endpoints
                const path = this.selectedPath.path;
                const n = path.length;
                this.syncFirstLast = false;

                if (this.selectedPath.closed && n > 1) {
                    // Only sync if we're dragging the first or last point
                    if (this.hasDuplicateEndpoint(path) && (this.activeHandle === 0 || this.activeHandle === n-1)) {
                        this.syncFirstLast = true;
                    }
                }

                // Store original path for undo (in case of drag)
                if (!this.originalPath) {
                    addUndo(false, true, false);
                    this.originalPath = this.selectedPath.path.map(pt => ({ x: pt.x, y: pt.y }));
                }
                return;
            }
        }

        // If not clicking on a handle, check for path selection
        const clickedPath = closestPath(mouse, false);
        if (clickedPath) {
            // Deselect all other paths
            selectMgr.unselectAll();

            // Select the clicked path
            selectMgr.selectPath(clickedPath);
            this.originalPath = null;
            this.selectedHandlesForRadius = []; // Clear radius selection on path change
            this.originalPathBeforeRadius = null; // Clear saved original on path change

            this.updatePropertiesPanel();
            redraw();
        } else {
            // Clicked on empty space - deselect all
            selectMgr.unselectAll();
            this.originalPath = null;
            this.selectedHandlesForRadius = [];

            this.updatePropertiesPanel();
            redraw();
        }
    }

    onMouseMove(canvas, evt) {
        const mouse = this.normalizeEvent(canvas, evt);
        const selectedPath = this.selectedPath;

        if (this.mouseDown && this.activeHandle !== null && selectedPath) {
            // Mark that we dragged the handle
            this.handleWasDragged = true;

            // Update the point position
            selectedPath.path[this.activeHandle].x = mouse.x;
            selectedPath.path[this.activeHandle].y = mouse.y;

            // For closed paths with duplicate endpoints, synchronize first/last points
            if (this.syncFirstLast) {
                const path = selectedPath.path;
                const n = path.length;

                // If dragging first point, also update last point
                if (this.activeHandle === 0) {
                    path[n-1].x = mouse.x;
                    path[n-1].y = mouse.y;
                }
                // If dragging last point, also update first point
                else if (this.activeHandle === n-1) {
                    path[0].x = mouse.x;
                    path[0].y = mouse.y;
                }
            }

            // Recalculate bounding box
            selectedPath.bbox = boundingBox(selectedPath.path);

            redraw();
        } else if (!this.mouseDown && selectedPath) {
            // Check if hovering over a handle for cursor feedback
            const hoverHandle = this.getHandleAtPoint(mouse);
            const oldHover = this.hoveredHandle;
            const oldPreview = this.insertPreviewPoint;
            this.hoveredHandle = hoverHandle;

            // Check if Alt key is held for adding points
            if (evt.altKey) {
                // Find closest segment for insertion preview
                const segment = this.findClosestSegment(mouse);
                if (segment && hoverHandle === null) {
                    // Show preview for adding a point
                    this.insertPreviewPoint = {
                        x: segment.point.x,
                        y: segment.point.y,
                        segmentIndex: segment.segmentIndex
                    };
                    canvas.style.cursor = 'copy';
                } else {
                    this.insertPreviewPoint = null;
                    canvas.style.cursor = hoverHandle !== null ? 'pointer' : 'default';
                }
            } else {
                // Not holding Alt - clear preview
                this.insertPreviewPoint = null;

                if (hoverHandle !== null) {
                    canvas.style.cursor = 'pointer';
                } else {
                    canvas.style.cursor = 'default';
                }
            }

            // Only redraw if hover state changed
            if (oldHover !== this.hoveredHandle || oldPreview !== this.insertPreviewPoint) {
                redraw();
            }
        }
        else {
            closestPath(mouse, true);
        }
    }

    onMouseUp(canvas, evt) {
        this.mouseDown = false;

        if (this.activeHandle !== null) {
            // Check if this was a click (no drag) to toggle radius selection
            if (!this.handleWasDragged) {
                // Toggle this handle in the selection
                const index = this.selectedHandlesForRadius.indexOf(this.activeHandle);
                if (index > -1) {
                    // Already selected, remove it
                    this.selectedHandlesForRadius.splice(index, 1);
                } else {
                    // Not selected, add it
                    this.selectedHandlesForRadius.push(this.activeHandle);
                }

                this.updatePropertiesPanel();
            } else if (this.selectedPath && !this.selectedPath.closed) {
                // Check if dragging the last point onto the first point to close the path
                const path = this.selectedPath.path;
                const n = path.length;
                if (n >= 3 && (this.activeHandle === n - 1 || this.activeHandle === 0)) {
                    const first = this.activeHandle === 0 ? path[n - 1] : path[0];
                    const last = path[this.activeHandle];
                    const dx = last.x - first.x;
                    const dy = last.y - first.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < this.handleSize * 2) {
                        // Snap last point to first and close the path
                        last.x = first.x;
                        last.y = first.y;
                        this.selectedPath.closed = true;
                        this.selectedPath.name = 'Closed ' + this.selectedPath.name;
                        this.selectedPath.bbox = boundingBox(path);
                        // Update sidebar name
                        const sidebarItem = document.querySelector(`[data-path-id="${this.selectedPath.id}"]`);
                        if (sidebarItem) {
                            sidebarItem.innerHTML = `<i data-lucide="${getPathIcon(this.selectedPath.name)}"></i>${this.selectedPath.name}`;
                            lucide.createIcons();
                        }
                        this.updatePropertiesPanel();
                    }
                }
            }

            // Re-snap tabs to their stored edge positions on the (possibly changed) path
            if (this.handleWasDragged && this.selectedPath) {
                this._resnapTabsToPath(this.selectedPath);
            }

            // Finished with handle
            this.activeHandle = null;
            this.syncFirstLast = false;
            // Don't reset originalPath - keep it so we don't create multiple undos
            // for the same path editing session
            redraw();
        }
    }

    draw(ctx) {
        super.draw(ctx);

        const selectedPath = this.selectedPath;

        // Draw point handles for selected path
        if (selectedPath && selectedPath.visible) {
            const path = selectedPath.path;
            // Use Set for O(1) lookup instead of O(n) includes()
            const selectedSet = new Set(this.selectedHandlesForRadius);

            // Check if last point is duplicate of first (closed path)
            const n = path.length;
            const drawCount = this.hasDuplicateEndpoint(path) ? n - 1 : n;

            ctx.save();
            for (let i = 0; i < drawCount; i++) {
                const pt = path[i];
                const screenPt = worldToScreen(pt.x, pt.y);

                // Color based on state
                var fillColor, strokeColor;
                if (this.activeHandle === i) {
                    fillColor = handleActiveColor;
                    strokeColor = handleActiveStroke;
                } else if (selectedSet.has(i)) {
                    fillColor = '#9333ea';
                    strokeColor = '#6b21a8';
                } else if (this.hoveredHandle === i) {
                    fillColor = handleHoverColor;
                    strokeColor = handleHoverStroke;
                } else if (i === 0) {
                    fillColor = '#22c55e';
                    strokeColor = '#16a34a';
                } else {
                    fillColor = handleNormalColor;
                    strokeColor = handleNormalStroke;
                }

                this.drawHandle(ctx, screenPt.x, screenPt.y, this.handleSize, fillColor, strokeColor);
            }
            ctx.restore();

            // Draw preview point when Alt is held
            if (this.insertPreviewPoint) {
                const screenPt = worldToScreen(this.insertPreviewPoint.x, this.insertPreviewPoint.y);

                ctx.save();
                this.drawHandle(ctx, screenPt.x, screenPt.y, this.handleSize, insertPreviewColor, insertPreviewStroke);
                this.drawCrosshair(ctx, screenPt.x, screenPt.y, 3, insertPreviewStroke, 1);
                ctx.restore();
            }
        }
    }

    hasDuplicateEndpoint(path) {
        const n = path.length;
        return n > 1 && path[0].x === path[n - 1].x && path[0].y === path[n - 1].y;
    }

    getHandleAtPoint(point) {
        const selectedPath = this.selectedPath;
        if (!selectedPath) return null;

        const path = selectedPath.path;
        const n = path.length;
        // Skip duplicate last point on closed paths
        const checkCount = this.hasDuplicateEndpoint(path) ? n - 1 : n;
        let closestHandle = null;
        let closestDistance = this.handleSize * 2;

        // Find the closest handle within the threshold distance
        for (let i = 0; i < checkCount; i++) {
            const pt = path[i];
            const dx = pt.x - point.x;
            const dy = pt.y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= closestDistance) {
                closestDistance = distance;
                closestHandle = i;
            }
        }

        return closestHandle;
    }


    // Re-snap all tabs on svgpath to the new path geometry using their stored
    // edgeIndex and positionFraction, so tabs stay on the correct edge after
    // vertex edits.
    _resnapTabsToPath(svgpath) {
        const tabs = svgpath.creationProperties && svgpath.creationProperties.tabs;
        if (!tabs || !tabs.length) return;
        const path = svgpath.path;
        const n = path.length;
        tabs.forEach(tab => {
            const ei = tab.edgeIndex;
            if (ei == null || ei >= n) return;
            const p1 = path[ei];
            const p2 = path[(ei + 1) % n];
            const f = tab.positionFraction != null ? tab.positionFraction : 0.5;
            tab.x = p1.x + f * (p2.x - p1.x);
            tab.y = p1.y + f * (p2.y - p1.y);
            tab.angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            tab.edgeP1 = { x: p1.x, y: p1.y };
            tab.edgeP2 = { x: p2.x, y: p2.y };
        });
    }

    // Helper function: Find the closest segment to the mouse cursor
    findClosestSegment(point) {
        if (!this.selectedPath) return null;

        const path = this.selectedPath.path;
        if (path.length < 2) return null;

        let closestSegmentIndex = -1;
        let closestPoint = null;
        let minDistance = Infinity;

        // Check each line segment
        const segmentCount = this.selectedPath.closed ? path.length : path.length - 1;

        for (let i = 0; i < segmentCount; i++) {
            const segStart = path[i];
            const segEnd = path[(i + 1) % path.length];

            const closestPt = closestPointOnSegment(point, segStart, segEnd);
            const dx = point.x - closestPt.x;
            const dy = point.y - closestPt.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < minDistance) {
                minDistance = distance;
                closestSegmentIndex = i;
                closestPoint = closestPt;
            }
        }

        // Only return if within reasonable distance
        if (minDistance < this.handleSize * 3) {
            return {
                segmentIndex: closestSegmentIndex,
                point: closestPoint,
                distance: minDistance
            };
        }

        return null;
    }

    // Delete the currently hovered point
    deleteHoveredPoint() {
        if (!this.selectedPath || this.hoveredHandle === null) return;

        const path = this.selectedPath.path;
        const minPoints = this.selectedPath.closed ? 3 : 2;

        // Check if we have enough points to delete one
        if (path.length <= minPoints) {
            console.log(`Cannot delete point: minimum ${minPoints} points required for ${this.selectedPath.closed ? 'closed' : 'open'} path`);
            return;
        }

        // Add undo before deletion
        addUndo(false, true, false);

        // Remove the point
        path.splice(this.hoveredHandle, 1);

        // Recalculate bounding box
        this.selectedPath.bbox = boundingBox(path);

        // Clear hovered handle
        this.hoveredHandle = null;

        redraw();
    }

    // Set a new first point by reordering the path array
    setFirstPoint(newFirstIndex) {
        const selectedPath = this.selectedPath;
        if (!selectedPath || !selectedPath.path) return;

        // Find this path in svgpaths array to ensure we're modifying the right object
        const svgPathIndex = svgpaths.findIndex(p => p.id === selectedPath.id);
        if (svgPathIndex === -1) return;

        const pathObj = svgpaths[svgPathIndex];
        const path = pathObj.path;
        const n = path.length;

        if (newFirstIndex <= 0 || newFirstIndex >= n) return;

        const hasDuplicateEndpoint = this.hasDuplicateEndpoint(path);

        // Add undo before modification
        addUndo(false, true, false);

        let newPath;
        if (hasDuplicateEndpoint) {
            // For closed paths with duplicate endpoint:
            // Remove the last point, rotate, then add new last point matching new first
            const pathWithoutLast = path.slice(0, n - 1);
            const rotated = [
                ...pathWithoutLast.slice(newFirstIndex),
                ...pathWithoutLast.slice(0, newFirstIndex)
            ];
            // Add the new last point (same as new first)
            rotated.push({ x: rotated[0].x, y: rotated[0].y });
            newPath = rotated;
        } else {
            // For open paths, just rotate the array
            newPath = [
                ...path.slice(newFirstIndex),
                ...path.slice(0, newFirstIndex)
            ];
        }

        // Modify the path array in-place to preserve reference
        path.splice(0, path.length, ...newPath);

        // Recalculate bounding box
        pathObj.bbox = boundingBox(path);

        // Clear radius selection since indices have changed
        this.selectedHandlesForRadius = [];
        this.originalPathBeforeRadius = null;

        this.updatePropertiesPanel();
        redraw();
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        const selectedPath = this.selectedPath;
        const hasSelection = !!selectedPath;
        const pointCount = hasSelection ? selectedPath.path.length : 0;
        const minPoints = hasSelection ? (selectedPath.closed ? 3 : 2) : 2;
        const selectedCount = this.selectedHandlesForRadius.length;
        const hasSelectedHandles = selectedCount > 0;

        let selectionMessage = '';
        if (selectedCount === 0) {
            selectionMessage = 'No points selected for radius';
        } else if (selectedCount === 1) {
            selectionMessage = `Point ${this.selectedHandlesForRadius[0] + 1} selected`;
        } else {
            selectionMessage = `${selectedCount} points selected`;
        }

        const cornerHint = hasSelectedHandles
            ? `Will apply to ${selectedCount === 1 ? '1 point' : selectedCount + ' points'}`
            : 'Click points to select, or click Apply to radius all points';

        return `
            <div class="alert alert-info mb-3">
                <strong>${hasSelection ? 'Editing Path Points' : 'Edit Points Tool'}</strong><br>
                ${hasSelection ? `Path: ${selectedPath.name}<br>Points: ${pointCount}` : 'Select a path to edit its points.'}
                ${hasSelection ? `<br><span class="badge" style="background-color: ${hasSelectedHandles ? '#9333ea' : '#6c757d'};">${selectionMessage}</span>` : ''}
            </div>

            <div class="mb-3">
                <button type="button" class="btn btn-primary btn-sm w-100" id="applySmoothBtn" ${!hasSelection ? 'disabled' : ''}>
                    <i data-lucide="sparkles"></i> Apply Smoothing
                </button>
                <div class="form-text">Click repeatedly for more smoothing (no new points added)</div>
            </div>

            ${PropertiesManager.fieldHTML(this.fields.cornerStyle, this.lastCornerStyle)}
            ${PropertiesManager.fieldHTML(this.fields.radius, this.lastRadiusValue)}

            <div class="mb-3">
                <button type="button" class="btn btn-success btn-sm w-100" id="applyRadiusBtn" ${!hasSelection ? 'disabled' : ''}>
                    <i data-lucide="circle-dot"></i> Apply Corner
                </button>
                <div class="form-text">${cornerHint}</div>
            </div>

            <div class="alert alert-secondary">
                <i data-lucide="info"></i>
                <small>
                    <strong>Edit Points:</strong><br>
                    • <strong>Click</strong> a point to select for radius (purple)<br>
                    • <strong>Drag</strong> handles to move points<br>
                    • <strong>Shift+Click</strong> a point to set as first point (green)<br>
                    • <strong>Alt+Click</strong> on a line segment to add a point<br>
                    • <strong>Hover + Delete</strong> key to remove a point (min ${minPoints} points)<br>
                    • Click on a different path to edit it
                </small>
            </div>`;
    }

    onPropertiesChanged(data) {
        // Save corner style and radius so they persist across panel rebuilds
        const cornerStyleSelect = document.getElementById('pm-cornerStyle');
        if (cornerStyleSelect) this.lastCornerStyle = cornerStyleSelect.value;
        const radiusInput = document.getElementById('pm-radius');
        if (radiusInput) this.lastRadiusValue = radiusInput.value;
    }

    applySmoothingToPath() {
        const selectedPath = this.selectedPath;

        if (!selectedPath || !selectedPath.path) {
            console.log('No path selected for smoothing');
            return;
        }

        // Add undo before smoothing
        addUndo(false, true, false);

        // Apply single iteration of Laplacian smoothing
        const smoothedPath = this.laplacianSmooth(selectedPath.path, selectedPath.closed);

        // Update the path
        selectedPath.path = smoothedPath;

        // Recalculate bounding box
        selectedPath.bbox = boundingBox(selectedPath.path);

        redraw();
    }

    /**
     * Laplacian smoothing - moves points toward average of neighbors
     * Does NOT add new points, just repositions existing ones
     * @param {Array} path - Array of {x, y} points
     * @param {Boolean} closed - Whether the path is closed
     * @returns {Array} Smoothed path with same number of points
     */
    laplacianSmooth(path, closed) {
        if (path.length < 3) return path;

        const smoothed = [];

        // Check if this is a closed path with duplicate first/last point
        const hasDuplicateEndpoint = closed && path.length > 1 &&
                                      path[0].x === path[path.length - 1].x &&
                                      path[0].y === path[path.length - 1].y;

        for (let i = 0; i < path.length; i++) {
            const current = path[i];

            // For open paths, keep first and last points fixed
            if (!closed && (i === 0 || i === path.length - 1)) {
                smoothed.push({ x: current.x, y: current.y });
                continue;
            }

            // For closed paths with duplicate endpoint, skip the last point (will copy first point later)
            if (hasDuplicateEndpoint && i === path.length - 1) {
                continue; // Will be filled in after the loop
            }

            // Get neighbors - for closed paths with duplicate endpoint, wrap around n-1
            const wrapLen = hasDuplicateEndpoint ? path.length - 1 : path.length;
            const prevIndex = (i - 1 + wrapLen) % wrapLen;
            const nextIndex = (i + 1) % wrapLen;

            // For open paths, skip if we're at the edges
            if (!closed && (prevIndex >= path.length || nextIndex >= path.length)) {
                smoothed.push({ x: current.x, y: current.y });
                continue;
            }

            const prev = path[prevIndex];
            const next = path[nextIndex];

            // Calculate average position of neighbors
            const avgX = (prev.x + next.x) / 2;
            const avgY = (prev.y + next.y) / 2;

            // Move current point toward the average
            const newX = current.x + (avgX - current.x) * SMOOTHING_FACTOR;
            const newY = current.y + (avgY - current.y) * SMOOTHING_FACTOR;

            smoothed.push({ x: newX, y: newY });
        }

        // For closed paths with duplicate endpoint, copy the smoothed first point to the end
        if (hasDuplicateEndpoint) {
            smoothed.push({ x: smoothed[0].x, y: smoothed[0].y });
        }

        // Rescale smoothed path to match original size (counteract Laplacian shrinkage)
        if (closed && smoothed.length >= 3) {
            const origBbox = boundingBox(path);
            const smoothBbox = boundingBox(smoothed);
            const origW = origBbox.maxx - origBbox.minx;
            const origH = origBbox.maxy - origBbox.miny;
            const smoothW = smoothBbox.maxx - smoothBbox.minx;
            const smoothH = smoothBbox.maxy - smoothBbox.miny;
            if (smoothW > 0 && smoothH > 0) {
                const scaleX = origW / smoothW;
                const scaleY = origH / smoothH;
                const cx = (smoothBbox.minx + smoothBbox.maxx) / 2;
                const cy = (smoothBbox.miny + smoothBbox.maxy) / 2;
                const origCx = (origBbox.minx + origBbox.maxx) / 2;
                const origCy = (origBbox.miny + origBbox.maxy) / 2;
                for (let i = 0; i < smoothed.length; i++) {
                    smoothed[i].x = origCx + (smoothed[i].x - cx) * scaleX;
                    smoothed[i].y = origCy + (smoothed[i].y - cy) * scaleY;
                }
            }
        }

        return smoothed;
    }

    /**
     * Wire up event handlers for radius controls
     */
    wireRadiusControls() {
        const applyRadiusBtn = document.getElementById('applyRadiusBtn');
        if (applyRadiusBtn) {
            applyRadiusBtn.addEventListener('click', () => {
                this.applyRadiusCorner();
            });
        }

        const cornerStyleSelect = document.getElementById('pm-cornerStyle');
        if (cornerStyleSelect) {
            cornerStyleSelect.addEventListener('change', () => {
                this.lastCornerStyle = cornerStyleSelect.value;
            });
        }

        const radiusInput = document.getElementById('pm-radius');
        if (radiusInput) {
            radiusInput.addEventListener('change', () => {
                this.lastRadiusValue = radiusInput.value;
            });
            radiusInput.addEventListener('input', () => {
                this.lastRadiusValue = radiusInput.value;
            });
        }

        const smoothBtn = document.getElementById('applySmoothBtn');
        if (smoothBtn) {
            smoothBtn.addEventListener('click', () => {
                this.applySmoothingToPath();
            });
        }
    }

    /**
     * Apply a radius corner to the selected handles (or all if none selected)
     */
    applyRadiusCorner() {
        const selectedPath = this.selectedPath;
        if (!selectedPath) {
            console.log('No path selected for radius corner');
            return;
        }

        const radiusInput = document.getElementById('pm-radius');
        const cornerStyleSelect = document.getElementById('pm-cornerStyle');

        if (!radiusInput) {
            console.log('Radius input not found');
            return;
        }

        // Get radius using parseDimension (supports mm, inches, and fractions)
        const radiusMM = parseDimension(radiusInput.value);
        if (isNaN(radiusMM) || radiusMM <= 0) {
            console.log('Invalid value. Please enter a valid value (e.g., "5mm", "1/4in", "0.25")');
            return;
        }

        // Store the entered values for next time
        this.lastRadiusValue = radiusInput.value;
        const cornerStyle = cornerStyleSelect ? cornerStyleSelect.value : 'outer';
        this.lastCornerStyle = cornerStyle;
        const invert = cornerStyle === 'inner';

        const radiusWorld = radiusMM * viewScale;

        // Save original path if not already saved, or if path changed (e.g. after undo)
        if (!this.originalPathBeforeRadius || this.originalPathBeforeRadiusId !== selectedPath.id) {
            this.originalPathBeforeRadius = {
                path: selectedPath.path.map(pt => ({ x: pt.x, y: pt.y })),
                closed: selectedPath.closed
            };
            this.originalPathBeforeRadiusId = selectedPath.id;
        }

        // Restore from original before applying new radius
        selectedPath.path = this.originalPathBeforeRadius.path.map(pt => ({ x: pt.x, y: pt.y }));

        // Check if path has duplicate endpoint (closed path)
        const path = selectedPath.path;
        const n = path.length;
        const hasDuplicateEndpoint = this.hasDuplicateEndpoint(path);

        // Determine which points to apply radius to
        let pointsToProcess = [];
        if (this.selectedHandlesForRadius.length > 0) {
            // Use selected handles, but filter out the last point if it's a duplicate
            pointsToProcess = [...this.selectedHandlesForRadius];
            if (hasDuplicateEndpoint) {
                pointsToProcess = pointsToProcess.filter(idx => idx !== n - 1);
            }
        } else {
            // Apply to all points, excluding the last point if it's a duplicate
            const endIndex = hasDuplicateEndpoint ? n - 1 : n;
            for (let i = 0; i < endIndex; i++) {
                pointsToProcess.push(i);
            }
        }

        // Sort in descending order so we process from end to beginning
        // This prevents index shifting issues
        pointsToProcess.sort((a, b) => b - a);

        // Add undo before modification
        addUndo(false, true, false);

        // Apply radius to each selected point
        let successCount = 0;
        let failCount = 0;
        let processedPoint0 = false;

        for (const pointIndex of pointsToProcess) {
            const success = this.insertCorner(
                selectedPath,
                pointIndex,
                radiusWorld,
                cornerStyle
            );
            if (success) {
                successCount++;
                if (pointIndex === 0) {
                    processedPoint0 = true;
                }
            } else {
                failCount++;
            }
        }

        // If we processed point 0 and had a duplicate endpoint, fix the closure
        if (processedPoint0 && hasDuplicateEndpoint) {
            const updatedPath = selectedPath.path;
            const lastIndex = updatedPath.length - 1;
            // Update the last point to match the new first point
            updatedPath[lastIndex] = {
                x: updatedPath[0].x,
                y: updatedPath[0].y
            };
        }

        // Clear selection
        this.selectedHandlesForRadius = [];

        // Update the saved original to the current state so subsequent radius
        // operations use correct point indices
        this.originalPathBeforeRadius = {
            path: selectedPath.path.map(pt => ({ x: pt.x, y: pt.y })),
            closed: selectedPath.closed
        };

        this.updatePropertiesPanel();

        // Recalculate bounding box
        selectedPath.bbox = boundingBox(selectedPath.path);

        // Show result
        if (failCount > 0) {
            console.log(`Applied radius to ${successCount} points, ${failCount} failed`);
        }

        redraw();
    }

    /**
     * Dispatch to the appropriate corner insertion method based on style
     */
    insertCorner(svgPath, pointIndex, radius, cornerStyle) {
        switch (cornerStyle) {
            case 'dogbone':
                return this.insertDogboneCorner(svgPath, pointIndex, radius);
            case 'miter':
                return this.insertMiterCorner(svgPath, pointIndex, radius);
            case 'inner':
                return this.insertRadiusCorner(svgPath, pointIndex, radius, true);
            case 'outer':
            default:
                return this.insertRadiusCorner(svgPath, pointIndex, radius, false);
        }
    }

    /**
     * Compute shared corner geometry: adjacent point indices, neighbour points,
     * edge unit vectors and lengths.  Returns null when the corner is degenerate
     * (too few points or edges too short to process).
     */
    _getCornerGeometry(svgPath, pointIndex) {
        const path = svgPath.path;
        const n = path.length;
        if (n < 3) return null;

        const hasDuplicateEndpoint = this.hasDuplicateEndpoint(path);

        let prevIndex = (pointIndex - 1 + n) % n;
        const nextIndex = (pointIndex + 1) % n;
        if (pointIndex === 0 && hasDuplicateEndpoint) prevIndex = n - 2;

        const prev = path[prevIndex];
        const current = path[pointIndex];
        const next = path[nextIndex];

        const v1 = { x: prev.x - current.x, y: prev.y - current.y };
        const v2 = { x: next.x - current.x, y: next.y - current.y };
        const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        if (len1 < MIN_SEGMENT_LENGTH || len2 < MIN_SEGMENT_LENGTH) return null;

        return {
            path,
            current,
            u1: { x: v1.x / len1, y: v1.y / len1 },
            u2: { x: v2.x / len2, y: v2.y / len2 },
            len1,
            len2
        };
    }

    /**
     * Insert a dogbone corner at the specified point index.
     * A dogbone is a circular notch cut into the inside corner so a round
     * endmill can clear the material at a sharp inside corner.
     * Circle center is at radius distance from corner along the bisector.
     * The corner point is replaced by an arc between the two points where
     * the circle crosses the adjacent edges.
     */
    insertDogboneCorner(svgPath, pointIndex, radius) {
        const geom = this._getCornerGeometry(svgPath, pointIndex);
        if (!geom) return false;
        const { path, current, u1, u2, len1, len2 } = geom;

        // Bisector pointing into the corner interior
        const bisector = { x: u1.x + u2.x, y: u1.y + u2.y };
        const bisLen = Math.sqrt(bisector.x * bisector.x + bisector.y * bisector.y);
        if (bisLen < 0.001) return false;
        bisector.x /= bisLen;
        bisector.y /= bisLen;

        // Dogbone center at radius from corner along bisector
        const center = {
            x: current.x + bisector.x * radius,
            y: current.y + bisector.y * radius
        };

        // The circle passes through the corner (distance = radius).
        // Find the OTHER intersection of the circle with each edge.
        // Edge 1: P(t) = current + t * u1,  t >= 0
        // |P(t) - center|^2 = radius^2
        // Let d = current - center, then |d + t*u1|^2 = r^2
        // t^2 + 2t(d·u1) + |d|^2 - r^2 = 0
        // We know |d| = radius, so |d|^2 - r^2 = 0, giving t(t + 2(d·u1)) = 0
        // t=0 is the corner itself; the other root is t = -2(d·u1)
        const d = { x: current.x - center.x, y: current.y - center.y };

        const dot1 = d.x * u1.x + d.y * u1.y;
        const intT1 = -2 * dot1;
        if (intT1 <= 0 || intT1 >= len1 * MAX_TANGENT_RATIO) return false;
        const p1 = { x: current.x + u1.x * intT1, y: current.y + u1.y * intT1 };

        const dot2 = d.x * u2.x + d.y * u2.y;
        const intT2 = -2 * dot2;
        if (intT2 <= 0 || intT2 >= len2 * MAX_TANGENT_RATIO) return false;
        const p2 = { x: current.x + u2.x * intT2, y: current.y + u2.y * intT2 };

        // Arc from p1 to p2 around center, going through the far side (the notch)
        const angle1 = Math.atan2(p1.y - center.y, p1.x - center.x);
        const angle2 = Math.atan2(p2.y - center.y, p2.x - center.x);

        // We want the major arc (the one that goes away from the corner,
        // through the deepest point of the notch)
        const cross = u1.x * u2.y - u1.y * u2.x;
        let sweep = angle2 - angle1;
        if (sweep > Math.PI) sweep -= 2 * Math.PI;
        if (sweep < -Math.PI) sweep += 2 * Math.PI;

        // Pick the arc that goes the long way round (through the notch)
        if (cross > 0 && sweep > 0) sweep -= 2 * Math.PI;
        if (cross < 0 && sweep < 0) sweep += 2 * Math.PI;

        const numPoints = Math.max(5, Math.ceil(Math.abs(sweep) * ARC_POINTS_PER_RADIAN));
        const arcPoints = [];

        arcPoints.push({ x: p1.x, y: p1.y });
        for (let i = 1; i < numPoints; i++) {
            const t = i / numPoints;
            const a = angle1 + sweep * t;
            arcPoints.push({
                x: center.x + radius * Math.cos(a),
                y: center.y + radius * Math.sin(a)
            });
        }
        arcPoints.push({ x: p2.x, y: p2.y });

        path.splice(pointIndex, 1, ...arcPoints);
        return true;
    }

    /**
     * Insert a miter (chamfer) corner — replaces the sharp corner with a flat cut.
     */
    insertMiterCorner(svgPath, pointIndex, distance) {
        const geom = this._getCornerGeometry(svgPath, pointIndex);
        if (!geom) return false;
        const { path, current, u1, u2, len1, len2 } = geom;

        // Clamp distance to not exceed segment lengths
        const d = Math.min(distance, len1 * MAX_TANGENT_RATIO, len2 * MAX_TANGENT_RATIO);

        // Two points: one on each edge at 'distance' from the corner
        const p1 = { x: current.x + u1.x * d, y: current.y + u1.y * d };
        const p2 = { x: current.x + u2.x * d, y: current.y + u2.y * d };

        path.splice(pointIndex, 1, p1, p2);
        return true;
    }

    /**
     * Insert a radius corner (fillet) at the specified point index
     * @param {Object} svgPath - The path object
     * @param {Number} pointIndex - Index of the point to add radius to
     * @param {Number} radius - Radius in world coordinates
     * @param {Boolean} invert - If true, radius cuts into shape (concave), otherwise rounds out (convex)
     * @returns {Boolean} Success status
     */
    // Inverted arc: centered at corner point, intersects both segments
    generateInvertedArc(current, u1, u2, radius, len1, len2, cross) {
        const arcCenter = { x: current.x, y: current.y };

        const intersect1 = { x: current.x + u1.x * radius, y: current.y + u1.y * radius };
        const intersect2 = { x: current.x + u2.x * radius, y: current.y + u2.y * radius };

        if (radius >= len1 * MAX_TANGENT_RATIO || radius >= len2 * MAX_TANGENT_RATIO) {
            return null;
        }

        const startAngle = Math.atan2(intersect1.y - arcCenter.y, intersect1.x - arcCenter.x);
        const endAngle = Math.atan2(intersect2.y - arcCenter.y, intersect2.x - arcCenter.x);

        let sweepAngle = endAngle - startAngle;
        if (sweepAngle > Math.PI) sweepAngle -= 2 * Math.PI;
        else if (sweepAngle < -Math.PI) sweepAngle += 2 * Math.PI;

        if (Math.sign(sweepAngle) !== Math.sign(cross)) {
            sweepAngle = sweepAngle > 0 ? sweepAngle - 2 * Math.PI : sweepAngle + 2 * Math.PI;
        }

        const numArcPoints = Math.max(3, Math.ceil(Math.abs(sweepAngle) * ARC_POINTS_PER_RADIAN));
        const arcPoints = [];
        for (let i = 0; i <= numArcPoints; i++) {
            const t = i / numArcPoints;
            const currentAngle = startAngle + sweepAngle * t;
            arcPoints.push({
                x: arcCenter.x + radius * Math.cos(currentAngle),
                y: arcCenter.y + radius * Math.sin(currentAngle)
            });
        }
        return arcPoints;
    }

    // Normal fillet arc: tangent to both segments
    generateFilletArc(current, u1, u2, radius, len1, len2, angle, cross) {
        const intersect1 = { x: current.x + u1.x * radius, y: current.y + u1.y * radius };
        const intersect2 = { x: current.x + u2.x * radius, y: current.y + u2.y * radius };

        if (radius >= len1 * MAX_TANGENT_RATIO || radius >= len2 * MAX_TANGENT_RATIO) {
            return null;
        }

        const arcRadius = radius * Math.tan(angle / 2);

        let perp1;
        if (cross > 0) {
            perp1 = { x: -u1.y, y: u1.x };
        } else {
            perp1 = { x: u1.y, y: -u1.x };
        }

        const arcCenter = {
            x: intersect1.x + perp1.x * arcRadius,
            y: intersect1.y + perp1.y * arcRadius
        };

        const startAngle = Math.atan2(intersect1.y - arcCenter.y, intersect1.x - arcCenter.x);
        const endAngle = Math.atan2(intersect2.y - arcCenter.y, intersect2.x - arcCenter.x);

        let sweepAngle = endAngle - startAngle;
        if (sweepAngle > Math.PI) sweepAngle -= 2 * Math.PI;
        else if (sweepAngle < -Math.PI) sweepAngle += 2 * Math.PI;

        const numArcPoints = Math.max(3, Math.ceil(Math.abs(sweepAngle) * ARC_POINTS_PER_RADIAN));
        const arcPoints = [];

        arcPoints.push({ x: intersect1.x, y: intersect1.y });
        for (let i = 1; i < numArcPoints; i++) {
            const t = i / numArcPoints;
            const currentAngle = startAngle + sweepAngle * t;
            arcPoints.push({
                x: arcCenter.x + arcRadius * Math.cos(currentAngle),
                y: arcCenter.y + arcRadius * Math.sin(currentAngle)
            });
        }
        arcPoints.push({ x: intersect2.x, y: intersect2.y });

        return arcPoints;
    }

    insertRadiusCorner(svgPath, pointIndex, radius, invert) {
        const geom = this._getCornerGeometry(svgPath, pointIndex);
        if (!geom) return false;
        const { path, current, u1, u2, len1, len2 } = geom;

        const dotProduct = u1.x * u2.x + u1.y * u2.y;
        const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

        if (Math.abs(angle) < MIN_ANGLE_THRESHOLD) return false;
        if (Math.abs(angle - Math.PI) < MIN_ANGLE_THRESHOLD) return false;

        const tangentDistance = radius / Math.tan(angle / 2);
        if (tangentDistance >= len1 * MAX_TANGENT_RATIO || tangentDistance >= len2 * MAX_TANGENT_RATIO) return false;

        const cross = u1.x * u2.y - u1.y * u2.x;

        const arcPoints = invert
            ? this.generateInvertedArc(current, u1, u2, radius, len1, len2, cross)
            : this.generateFilletArc(current, u1, u2, radius, len1, len2, angle, cross);

        if (!arcPoints) return false;

        path.splice(pointIndex, 1, ...arcPoints);
        return true;
    }
}
