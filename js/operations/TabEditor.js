class TabEditor extends Select {
    constructor() {
        super('Tabs', 'rectangle-ellipsis');
        this.name = 'Tabs';
        this.icon = 'rectangle-ellipsis';
        this.tooltip = 'Add and position tabs for holding material during cutting';

        this.unselectOnMouseDown = false;
        this.selectedPath = null;
        this.draggedTab = null;
        this.hoveredTab = null;

        // Tab handle size in pixels
        this.tabHandleSize = 8;

        this.fields = {
            tabLength:    { key: 'tabLength',    label: 'Tab Length',     type: 'dimension', default: 5, help: 'Length of each tab along the path' },
            tabHeight:    { key: 'tabHeight',    label: 'Tab Height',     type: 'dimension', default: 2, help: 'Height of each tab (material left uncut)' },
            numberOfTabs: { key: 'numberOfTabs', label: 'Number of Tabs', type: 'number',    default: 4, min: 1, step: 1, integer: true }
        };

        // Default properties for new tabs
        this.properties = {
            tabLength: 5,
            tabHeight: 2,
            numberOfTabs: 4
        };

        // Load saved properties from localStorage if available
        const stored = localStorage.getItem('tabEditorProperties');
        if (stored) {
            try {
                this.properties = JSON.parse(stored);
            } catch (e) {
                console.error('Failed to parse saved tab properties:', e);
            }
        }

        this.keydownHandler = (evt) => {
            const activeElement = document.activeElement;
            if (activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.tagName === 'SELECT'
            )) {
                return;
            }

            if (evt.key === 'Delete' || evt.key === 'Backspace') {
                evt.preventDefault();
                evt.stopPropagation();
                this.deleteHoveredTab();
            }
        };
    }

    start() {
        super.start();
        this.selectedPath = null;
        this.draggedTab = null;
        this.hoveredTab = null;

        const selected = selectMgr.lastSelected();
        if (selected) {
            this.selectedPath = selected;
        }

        document.addEventListener('keydown', this.keydownHandler);
    }

    stop() {
        super.stop();
        this.selectedPath = null;
        this.draggedTab = null;
        this.hoveredTab = null;

        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
        }
    }

    saveProperties() {
        localStorage.setItem('tabEditorProperties', JSON.stringify(this.properties));
    }

    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        this.mouseDown = true;

        // Check if clicking on a tab handle
        if (this.selectedPath && this.selectedPath.creationProperties && this.selectedPath.creationProperties.tabs) {
            const tabIndex = this.getTabAtPoint(mouse);
            if (tabIndex !== null) {
                this.draggedTab = tabIndex;
                this.hoveredTab = null;  // Clear hover when dragging starts
                addUndo(false, true, false);
                return;
            }
        }

        // If not clicking on a tab, check for path selection
        var clickedPath = closestPath(mouse, false);
        if (clickedPath) {
            selectMgr.unselectAll();
            selectMgr.selectPath(clickedPath);
            this.selectedPath = clickedPath;

            // Auto-generate tabs only if shape doesn't already have them
            if (!clickedPath.creationProperties || !clickedPath.creationProperties.tabs || clickedPath.creationProperties.tabs.length === 0) {
                this.generateTabs();
            }

            redraw();
        } else {
            selectMgr.unselectAll();
            this.selectedPath = null;
            redraw();
        }
    }

    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);

        this.selectedPath = selectMgr.lastSelected();

        if (this.mouseDown && this.draggedTab !== null && this.selectedPath) {
            // Move tab along path boundary
            this.moveTabAlongPath(this.draggedTab, mouse);
            redraw();
        } else if (!this.mouseDown && this.selectedPath) {
            // Check for hovered tab
            const tabIndex = this.getTabAtPoint(mouse);
            this.hoveredTab = tabIndex;

            if (tabIndex !== null) {
                canvas.style.cursor = 'pointer';
            } else {
                canvas.style.cursor = 'default';
            }

            redraw();
        } else {
            closestPath(mouse, true);
        }
    }

    onMouseUp(canvas, evt) {
        this.mouseDown = false;
        if (this.draggedTab !== null) {
            this.draggedTab = null;
            redraw();
        }
    }

    getTabAtPoint(point) {
        if (!this.selectedPath || !this.selectedPath.creationProperties || !this.selectedPath.creationProperties.tabs) {
            return null;
        }

        const tabs = this.selectedPath.creationProperties.tabs;
        let closestTab = null;
        let closestDistance = this.tabHandleSize * 3;

        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const dx = tab.x - point.x;
            const dy = tab.y - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= closestDistance) {
                closestDistance = distance;
                closestTab = i;
            }
        }

        return closestTab;
    }

    moveTabAlongPath(tabIndex, targetPoint) {
        if (!this.selectedPath || !this.selectedPath.creationProperties || !this.selectedPath.creationProperties.tabs) {
            return;
        }

        const tabs = this.selectedPath.creationProperties.tabs;
        const path = this.selectedPath.path;

        // Find closest point on path
        const closestPt = this.findClosestPointOnPath(targetPoint);
        if (closestPt) {
            tabs[tabIndex].x = closestPt.x;
            tabs[tabIndex].y = closestPt.y;
            tabs[tabIndex].pathDistance = closestPt.pathDistance;
            tabs[tabIndex].angle = closestPt.angle;

            // Recalculate convexity at the new segment
            const i = closestPt.segmentIndex;
            if (i > 0 && i < path.length - 1) {
                const pathIsClockwise = isClockwise(path);
                tabs[tabIndex].isConvex = this.isConvex(path[i - 1], path[i], path[(i + 1) % path.length], pathIsClockwise);
            }
        }
    }

    findClosestPointOnPath(targetPoint) {
        if (!this.selectedPath || !this.selectedPath.path) return null;

        const path = this.selectedPath.path;
        let closestPoint = null;
        let minDistance = Infinity;
        let cumulativeDistance = 0;

        for (let i = 0; i < path.length; i++) {
            const segStart = path[i];
            const segEnd = path[(i + 1) % path.length];

            const closestPt = closestPointOnSegment(targetPoint, segStart, segEnd);
            const dx = targetPoint.x - closestPt.x;
            const dy = targetPoint.y - closestPt.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < minDistance) {
                minDistance = distance;

                // Calculate angle along the edge direction (segment direction)
                const edgeDx = segEnd.x - segStart.x;
                const edgeDy = segEnd.y - segStart.y;
                const edgeAngle = Math.atan2(edgeDy, edgeDx);
                // Store the angle along the segment direction (not perpendicular)
                const segmentAngle = edgeAngle;

                const segmentLength = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
                let t = 0;
                if (segmentLength > 0) {
                    t = ((closestPt.x - segStart.x) * edgeDx + (closestPt.y - segStart.y) * edgeDy) / (segmentLength * segmentLength);
                }

                closestPoint = {
                    x: closestPt.x,
                    y: closestPt.y,
                    angle: segmentAngle,
                    pathDistance: cumulativeDistance + segmentLength * Math.max(0, Math.min(1, t)),
                    segmentIndex: i
                };
            }

            const segLen = Math.sqrt((segEnd.x - segStart.x) ** 2 + (segEnd.y - segStart.y) ** 2);
            cumulativeDistance += segLen;
        }

        return closestPoint;
    }


    calculatePathPerimeter() {
        if (!this.selectedPath || !this.selectedPath.path) return 0;

        const path = this.selectedPath.path;
        let perimeter = 0;

        for (let i = 0; i < path.length; i++) {
            const p1 = path[i];
            const p2 = path[(i + 1) % path.length];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            perimeter += Math.sqrt(dx * dx + dy * dy);
        }

        return perimeter;
    }

    isConvex(point1, point2, point3, pathIsClockwise) {
        // Calculate cross product to determine convexity
        const v1x = point2.x - point1.x;
        const v1y = point2.y - point1.y;
        const v2x = point3.x - point2.x;
        const v2y = point3.y - point2.y;

        const crossProduct = v1x * v2y - v1y * v2x;
        // For clockwise paths, negative cross product = convex (right turn)
        // For counter-clockwise paths, positive cross product = convex (left turn)
        return pathIsClockwise ? crossProduct < 0 : crossProduct > 0;
    }

    createTabOnEdge(edge, positionFraction, edges) {
        const p1 = edge.p1;
        const p2 = edge.p2;
        const tabX = p1.x + positionFraction * (p2.x - p1.x);
        const tabY = p1.y + positionFraction * (p2.y - p1.y);
        const segmentAngle = Math.atan2(edge.dy, edge.dx);

        let pathDistance = 0;
        for (let i = 0; i < edge.index; i++) {
            pathDistance += edges[i].length;
        }
        pathDistance += edge.length * positionFraction;

        return {
            x: tabX,
            y: tabY,
            angle: segmentAngle,
            pathDistance: pathDistance,
            isConvex: edge.isConvex,
            edgeIndex: edge.index,
            edgeP1: { x: p1.x, y: p1.y },
            edgeP2: { x: p2.x, y: p2.y },
            positionFraction: positionFraction
        };
    }

    generateTabsForRegularShape(edges, numberOfTabs) {
        const tabs = [];
        const perimeter = edges.reduce((sum, edge) => sum + edge.length, 0);

        // Create list of edge midpoints with their perimeter positions
        const edgeMidpoints = [];
        let cumulativeDistance = 0;
        for (const edge of edges) {
            edgeMidpoints.push({
                edge: edge,
                distance: cumulativeDistance + edge.length * 0.5
            });
            cumulativeDistance += edge.length;
        }

        // Calculate evenly-spaced target positions around perimeter
        const targetPositions = [];
        for (let tabIdx = 0; tabIdx < numberOfTabs; tabIdx++) {
            targetPositions.push(((tabIdx + 0.5) / numberOfTabs) * perimeter);
        }

        // For each target position, find the nearest unused edge midpoint
        const usedMidpoints = new Set();
        for (const targetDistance of targetPositions) {
            let nearestMidpoint = edgeMidpoints[0];
            let minDistDiff = Math.abs(edgeMidpoints[0].distance - targetDistance);

            for (const midpoint of edgeMidpoints) {
                const distDiff = Math.abs(midpoint.distance - targetDistance);
                if (distDiff < minDistDiff) {
                    minDistDiff = distDiff;
                    nearestMidpoint = midpoint;
                }
            }

            if (usedMidpoints.has(nearestMidpoint)) {
                for (const midpoint of edgeMidpoints) {
                    if (!usedMidpoints.has(midpoint)) {
                        const distDiff = Math.abs(midpoint.distance - targetDistance);
                        if (distDiff < minDistDiff) {
                            minDistDiff = distDiff;
                            nearestMidpoint = midpoint;
                        }
                    }
                }
            }

            usedMidpoints.add(nearestMidpoint);
            tabs.push(this.createTabOnEdge(nearestMidpoint.edge, 0.5, edges));
        }

        return tabs;
    }

    generateTabsForIrregularShape(edges, numberOfTabs, tabLength) {
        const tabs = [];
        const sortedEdges = [...edges].sort((a, b) => b.length - a.length);

        // Distribute tabs, prioritizing longer edges
        let remainingTabs = numberOfTabs;
        const tabsPerEdge = [];

        for (let edgeIdx = 0; edgeIdx < sortedEdges.length && remainingTabs > 0; edgeIdx++) {
            const edge = sortedEdges[edgeIdx];
            const maxTabsOnEdge = Math.max(1, Math.floor(edge.length / (tabLength * viewScale)));
            const remainingEdges = sortedEdges.length - edgeIdx;
            const tabsForThisEdge = Math.min(
                maxTabsOnEdge,
                Math.max(1, Math.ceil(remainingTabs / remainingEdges))
            );
            tabsPerEdge.push({ edge: edge, count: tabsForThisEdge });
            remainingTabs -= tabsForThisEdge;
        }

        // Place tabs on each edge
        for (const tabAssignment of tabsPerEdge) {
            const count = tabAssignment.count;
            for (let tabNum = 0; tabNum < count; tabNum++) {
                const positionFraction = (tabNum + 1) / (count + 1);
                tabs.push(this.createTabOnEdge(tabAssignment.edge, positionFraction, edges));
            }
        }

        return tabs;
    }

    generateTabs() {
        if (!this.selectedPath) return;

        const numberOfTabs = Math.max(1, Math.floor(this.properties.numberOfTabs));
        const path = this.selectedPath.path;

        if (path.length < 2) return;

        const pathIsClockwise = isClockwise(path);

        // Build list of edges with their properties
        const edges = [];
        for (let i = 0; i < path.length; i++) {
            const p1 = path[i];
            const p2 = path[(i + 1) % path.length];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);

            if (length > 0) {
                let isConvex = true;
                if (i > 0 && i < path.length - 1) {
                    isConvex = this.isConvex(path[i - 1], p1, p2, pathIsClockwise);
                }
                edges.push({ index: i, p1, p2, length, dx, dy, isConvex });
            }
        }

        // Detect regular shapes (circles, regular polygons) by edge length variance
        const edgeLengths = edges.map(e => e.length);
        const lengthVariance = (Math.max(...edgeLengths) - Math.min(...edgeLengths)) / Math.min(...edgeLengths);
        const hasEqualLengthEdges = lengthVariance < 0.05;

        const tabs = hasEqualLengthEdges
            ? this.generateTabsForRegularShape(edges, numberOfTabs)
            : this.generateTabsForIrregularShape(edges, numberOfTabs, this.properties.tabLength);

        // Store tabs in creation properties
        if (!this.selectedPath.creationProperties) {
            this.selectedPath.creationProperties = {};
        }

        this.selectedPath.creationProperties.tabLength = this.properties.tabLength;
        this.selectedPath.creationProperties.tabHeight = this.properties.tabHeight;
        this.selectedPath.creationProperties.numberOfTabs = this.properties.numberOfTabs;
        this.selectedPath.creationProperties.tabs = tabs;

        addUndo(false, true, false);
        redraw();
    }

    removeAllTabs() {
        if (!this.selectedPath || !this.selectedPath.creationProperties || !this.selectedPath.creationProperties.tabs) return;

        addUndo(false, true, false);
        this.selectedPath.creationProperties.tabs = [];
        this.hoveredTab = null;
        redraw();
    }

    deleteHoveredTab() {
        if (!this.selectedPath || this.hoveredTab === null) return;

        if (!this.selectedPath.creationProperties || !this.selectedPath.creationProperties.tabs) {
            return;
        }

        const tabs = this.selectedPath.creationProperties.tabs;
        if (tabs.length <= 0) return;

        addUndo(false, true, false);
        tabs.splice(this.hoveredTab, 1);
        this.hoveredTab = null;

        redraw();
    }

    draw(ctx) {
        super.draw(ctx);

        this.selectedPath = selectMgr.lastSelected();

        if (!this.selectedPath || !this.selectedPath.creationProperties || !this.selectedPath.creationProperties.tabs) {
            return;
        }

        const tabs = this.selectedPath.creationProperties.tabs;
        const tabLength = this.selectedPath.creationProperties.tabLength || this.properties.tabLength;
        const tabHeight = this.selectedPath.creationProperties.tabHeight || this.properties.tabHeight;

        ctx.save();

        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const screenCenter = worldToScreen(tab.x, tab.y);

            // Convert MM to world units
            const tabLengthWorld = tabLength * viewScale;
            const tabHeightWorld = tabHeight * viewScale;

            // Convert to screen units
            const tabLengthScreen = tabLengthWorld * zoomLevel;
            const tabHeightScreen = tabHeightWorld * zoomLevel;

            // Save and transform
            ctx.save();
            ctx.translate(screenCenter.x, screenCenter.y);
            // Rotate to align with segment direction (tab.angle is now the segment angle directly)
            ctx.rotate(tab.angle);

            // Draw rectangle
            // Now: width (x-axis) = length along path, height (y-axis) = height perpendicular to path
            ctx.fillStyle = tab.isConvex ? 'rgba(100, 150, 255, 0.6)' : 'rgba(255, 150, 100, 0.6)';

            if (this.draggedTab === i) {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
            } else if (this.hoveredTab === i) {
                ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
            }

            ctx.fillRect(-tabLengthScreen / 2, -tabHeightScreen / 2, tabLengthScreen, tabHeightScreen);

            // Draw outline
            ctx.strokeStyle = this.draggedTab === i ? '#ff0000' : (this.hoveredTab === i ? '#ffff00' : '#0080ff');
            ctx.lineWidth = 2;
            ctx.strokeRect(-tabLengthScreen / 2, -tabHeightScreen / 2, tabLengthScreen, tabHeightScreen);

            ctx.restore();

            // Draw center handle
            var handleColor = this.draggedTab === i ? '#ff0000' : (this.hoveredTab === i ? '#ffff00' : '#0080ff');
            this.drawHandle(ctx, screenCenter.x, screenCenter.y, this.tabHandleSize, handleColor, '#ffffff');
        }

        ctx.restore();
    }

    getPropertiesHTML() {
        this.selectedPath = selectMgr.lastSelected();

        let statusHTML = '';
        if (this.selectedPath) {
            const tabCount = (this.selectedPath.creationProperties && this.selectedPath.creationProperties.tabs)
                ? this.selectedPath.creationProperties.tabs.length : 0;
            statusHTML = `<br>Path: ${this.selectedPath.name}<br>Tabs: ${tabCount}`;
        }

        return `
            <div class="alert alert-info mb-3">
                <strong>Tab Editor</strong><br>
                Add and position tabs for holding material during cutting${statusHTML}
            </div>
            ${PropertiesManager.formHTML(Object.values(this.fields), null, this.properties)}
            <button class="btn btn-primary btn-sm w-100 mb-2" id="generateTabsBtn">
                <i data-lucide="plus"></i> Generate Tabs
            </button>
            <button class="btn btn-danger btn-sm w-100 mb-2" id="removeAllTabsBtn">
                <i data-lucide="trash-2"></i> Remove All Tabs
            </button>
            <div class="alert alert-secondary">
                <i data-lucide="info"></i>
                <small>
                    <strong>Tab Editor:</strong><br>
                    • <strong>Generate Tabs:</strong> Creates tabs evenly spaced around selected path<br>
                    • <strong>Drag</strong> tab handles to reposition along path<br>
                    • <strong>Hover + Delete</strong> key to remove a tab<br>
                    • <strong>Remove All Tabs:</strong> Clears all tabs from selected path<br>
                    • Blue tabs = convex surface, Orange tabs = concave surface
                </small>
            </div>`;
    }

    updateFromProperties(data) {
        const values = PropertiesManager.collectValues(Object.values(this.fields));
        this.properties = { ...this.properties, ...values };
        this.saveProperties();
    }

    onPropertiesChanged(data) {
        this.updateFromProperties(data);
    }
}

function interpolatePointOnSegment(p1, p2, distanceFraction) {
	// distanceFraction: 0-1, where 0 is at p1 and 1 is at p2
	return {
		x: p1.x + distanceFraction * (p2.x - p1.x),
		y: p1.y + distanceFraction * (p2.y - p1.y)
	};
}

function intersectSegmentWithRedEnds(p1, p2, tab, tabLength, toolRadius, viewScale) {
	// Find intersections between a segment and the RED ENDS of a tab box
	// RED ENDS are the perpendicular faces at ±(tabLength/2) along the tab direction
	//
	// Returns array of {distance: t, type: 'enter'/'exit'} where t is position along segment
	// distance = 0 at p1, distance = 1 at p2

	const intersections = [];

	// Convert tab length to world units
	const tabLengthWorld = tabLength * viewScale;
	const halfTabLength = tabLengthWorld / 2;
	const boxWidthWorld = 4 * toolRadius;
	const halfBoxWidth = boxWidthWorld / 2;

	// Direction vector along the path (tab angle)
	const dirX = Math.cos(tab.angle);
	const dirY = Math.sin(tab.angle);

	// Perpendicular vector (90 degrees counterclockwise from direction)
	const perpX = -Math.sin(tab.angle);
	const perpY = Math.cos(tab.angle);

	// Project tab center onto direction vector
	const tabCenterAlongDir = tab.x * dirX + tab.y * dirY;

	// Define the two red end positions along the direction vector
	const leftEndPos = tabCenterAlongDir - halfTabLength;
	const rightEndPos = tabCenterAlongDir + halfTabLength;

	// Project segment endpoints onto direction and perpendicular vectors
	// RELATIVE to the tab center
	const p1RelX = p1.x - tab.x;
	const p1RelY = p1.y - tab.y;
	const p1AlongDir = tabCenterAlongDir + (p1RelX * dirX + p1RelY * dirY);
	const p1PerpDist = p1RelX * perpX + p1RelY * perpY;

	const p2RelX = p2.x - tab.x;
	const p2RelY = p2.y - tab.y;
	const p2AlongDir = tabCenterAlongDir + (p2RelX * dirX + p2RelY * dirY);
	const p2PerpDist = p2RelX * perpX + p2RelY * perpY;

	// CHECK FOR FULL-SEGMENT CONTAINMENT FIRST
	// If entire segment is inside the tab zone, don't create spurious markers
	// Check both endpoints and midpoint to determine if fully contained
	const midAlongDir = (p1AlongDir + p2AlongDir) / 2;
	const midPerpDist = (p1PerpDist + p2PerpDist) / 2;

	const p1Inside = p1AlongDir >= leftEndPos && p1AlongDir <= rightEndPos && Math.abs(p1PerpDist) <= halfBoxWidth;
	const p2Inside = p2AlongDir >= leftEndPos && p2AlongDir <= rightEndPos && Math.abs(p2PerpDist) <= halfBoxWidth;
	const midInside = midAlongDir >= leftEndPos && midAlongDir <= rightEndPos && Math.abs(midPerpDist) <= halfBoxWidth;

	if (p1Inside && p2Inside && midInside) {
		// Entire segment is fully contained within tab zone
		// Return special marker so calculateTabMarkers can skip creating redundant markers
		return [
			{ distance: 0, type: 'fullSegment', isFullSegment: true }
		];
	}

	// Check if segment is parallel to direction
	const alongDiff = p2AlongDir - p1AlongDir;
	const isParallel = Math.abs(alongDiff) < 1e-10;

	if (isParallel) {
		// Segment is parallel to the tab direction - can't cross red ends
		return []; // No intersection possible
	}

	// Segment is NOT parallel - find intersections with red end planes

	// Check intersection with LEFT red end (at leftEndPos)
	const tLeft = (leftEndPos - p1AlongDir) / alongDiff;
	if (tLeft >= 0 && tLeft <= 1) {
		// Intersection point exists on segment, check if within perpendicular bounds
		const intersectPerpDist = p1PerpDist + tLeft * (p2PerpDist - p1PerpDist);
		if (Math.abs(intersectPerpDist) <= halfBoxWidth) {
			intersections.push({
				distance: tLeft,
				type: 'enter',
				perpDist: intersectPerpDist
			});
		}
	}

	// Check intersection with RIGHT red end (at rightEndPos)
	const tRight = (rightEndPos - p1AlongDir) / alongDiff;
	if (tRight >= 0 && tRight <= 1) {
		// Intersection point exists on segment, check if within perpendicular bounds
		const intersectPerpDist = p1PerpDist + tRight * (p2PerpDist - p1PerpDist);
		if (Math.abs(intersectPerpDist) <= halfBoxWidth) {
			intersections.push({
				distance: tRight,
				type: 'exit',
				perpDist: intersectPerpDist
			});
		}
	}

	// Sort by distance along segment
	intersections.sort((a, b) => a.distance - b.distance);

	// Cleanup - remove perpDist from return (was just for calculation)
	return intersections.map(int => ({
		distance: int.distance,
		type: int.type,
		isFullSegment: int.isFullSegment || false
	}));
}


function findTabIntersectionsOnSegment(p1, p2, tabs, toolRadius, tabLength) {
	// Find where segment from p1 to p2 intersects tab zones using oriented bounding boxes
	//
	// Approach: For each tab, create an oriented bounding box that extends:
	// - Along tab.angle: tabLength (the actual tab length)
	// - Perpendicular: accounts for tool radius AND path offset mismatch
	//
	// The key insight: tabs are marked on the original path, but cutting happens on an
	// offset path (for inside/outside operations). The detection box must account for this!
	//
	// Returns array of {distance, type, tabIndex} sorted by distance
	// distance: 0-1 fraction along segment from p1 to p2

	if (!tabs || tabs.length === 0) {
		return [];
	}

	const intersections = [];

	for (let tabIdx = 0; tabIdx < tabs.length; tabIdx++) {
		const tab = tabs[tabIdx];

		// Find intersections with this tab's RED ENDS
		const boxIntersections = intersectSegmentWithRedEnds(p1, p2, tab, tabLength, toolRadius, viewScale);

		// Add intersections to results with tab index
		for (let i = 0; i < boxIntersections.length; i++) {
			intersections.push({
				distance: boxIntersections[i].distance,
				type: boxIntersections[i].type,
				tabIndex: tabIdx,
				isFullSegment: boxIntersections[i].isFullSegment || false
			});
		}
	}

	// Sort by distance along segment
	intersections.sort((a, b) => a.distance - b.distance);


	return intersections;
}

function walkSegments(toolpath, startSegIdx, startT, distanceNeeded, forward = true) {
	// Walk through segments in specified direction accumulating distance
	// forward = true: walk forward through segments
	// forward = false: walk backward through segments
	// Returns {segmentIndex, t} where the target distance is reached
	// Handles multi-segment offset when marker crosses segment boundaries

	let remainingDist = distanceNeeded;
	let currentSegIdx = startSegIdx;
	let currentT = startT;

	// Start by consuming remaining distance in current segment
	const p1_start = toolpath[currentSegIdx];
	const p2_start = toolpath[currentSegIdx + 1];
	const startSegDx = p2_start.x - p1_start.x;
	const startSegDy = p2_start.y - p1_start.y;
	const startSegLen = Math.sqrt(startSegDx * startSegDx + startSegDy * startSegDy);

	const distInCurrentSegment = forward ? (1 - currentT) * startSegLen : currentT * startSegLen;

	if (distInCurrentSegment >= remainingDist) {
		// Offset fits within current segment
		if (forward) {
			currentT += (remainingDist / startSegLen);
			return { segmentIndex: currentSegIdx, t: Math.min(1, currentT) };
		} else {
			currentT -= (remainingDist / startSegLen);
			return { segmentIndex: currentSegIdx, t: Math.max(0, currentT) };
		}
	}

	// Not enough space in current segment, move to next/previous segments
	remainingDist -= distInCurrentSegment;
	if (forward) {
		currentSegIdx++;
		currentT = 0;
	} else {
		currentSegIdx--;
		currentT = 1;
	}

	// Walk through subsequent/previous segments (with wraparound for closed paths)
	let segmentsWalked = 0;
	const maxSegments = toolpath.length - 1; // Maximum segments before stopping

	while (remainingDist > 0 && segmentsWalked < maxSegments) {
		// Handle wraparound
		if (forward) {
			if (currentSegIdx >= toolpath.length - 1) {
				currentSegIdx = 0; // Wrap to first segment
				currentT = 0;
			}
		} else {
			if (currentSegIdx < 0) {
				currentSegIdx = toolpath.length - 2; // Wrap to last segment
				currentT = 1;
			}
		}

		const p1 = toolpath[currentSegIdx];
		const p2 = toolpath[currentSegIdx + 1];
		const dx = p2.x - p1.x;
		const dy = p2.y - p1.y;
		const segLen = Math.sqrt(dx * dx + dy * dy);

		if (segLen >= remainingDist) {
			// Offset ends in this segment
			if (forward) {
				currentT = remainingDist / segLen;
			} else {
				currentT = 1 - (remainingDist / segLen);
			}
			return { segmentIndex: currentSegIdx, t: currentT };
		}

		// Use entire segment, continue to next/previous
		remainingDist -= segLen;
		if (forward) {
			currentSegIdx++;
		} else {
			currentSegIdx--;
		}
		segmentsWalked++;
	}

	// Reached maximum segments or accumulated distance - return current position
	if (segmentsWalked >= maxSegments) {
		const wrapIdx = forward ?
			(currentSegIdx >= toolpath.length - 1 ? 0 : currentSegIdx) :
			(currentSegIdx < 0 ? toolpath.length - 2 : currentSegIdx);
		return { segmentIndex: wrapIdx, t: currentT };
	}

	return { segmentIndex: currentSegIdx, t: currentT };
}

function isPathCounterClockwise(toolpath) {
	// Detect path direction using signed area (shoelace formula)
	// Returns true for counter-clockwise, false for clockwise
	// Positive area = counter-clockwise, negative = clockwise

	if (!toolpath || toolpath.length < 3) return false;

	let signedArea = 0;
	for (let i = 0; i < toolpath.length; i++) {
		const p1 = toolpath[i];
		const p2 = toolpath[(i + 1) % toolpath.length];
		signedArea += (p2.x - p1.x) * (p2.y + p1.y);
	}

	return signedArea > 0;
}

function calculateTabMarkers(toolpath, tabs, tabLength, toolRadius, viewScale) {
	// Calculate all tab lift/lower markers with tool radius offset
	// Returns array of {x, y, type: 'lift'|'lower', segmentIndex, t}
	// Handles multi-segment offsets when tabs are near segment boundaries
	// Handles bidirectional path traversal (clockwise and counter-clockwise)

	if (!tabs || tabs.length === 0 || !toolpath || toolpath.length < 2) return [];

	const markers = [];

	// Detect path direction: true = counter-clockwise (inside cuts), false = clockwise (outside cuts)
	const isCounterClockwise = isPathCounterClockwise(toolpath);

	// For each segment in toolpath
	for (let segIdx = 0; segIdx < toolpath.length - 1; segIdx++) {
		const p1 = toolpath[segIdx];
		const p2 = toolpath[segIdx + 1];

		// Find intersections with tab red ends on this segment
		const intersections = findTabIntersectionsOnSegment(p1, p2, tabs, toolRadius, tabLength);

		if (intersections.length > 0) {
			// Check if this is a fully-contained segment (shouldn't create markers)
			const isFullSegment = intersections.some(int => int.isFullSegment);

			if (isFullSegment) {
				// Segment is entirely inside tab zone - skip marker creation
				// The persistent lifted state will handle traversal
				continue;
			}

			// Flip entry/exit types for counter-clockwise paths (inside cuts)
			// For counter-clockwise traversal, entry and exit are reversed
			if (isCounterClockwise) {
				for (let int of intersections) {
					if (int.type === 'enter') {
						int.type = 'exit';
					} else if (int.type === 'exit') {
						int.type = 'enter';
					}
				}
			}

			// Process intersections - handle both pairs and single intersections
			for (let intIdx = 0; intIdx < intersections.length; intIdx++) {
				const currentInt = intersections[intIdx];
				const nextInt = intersections[intIdx + 1];

				if (currentInt.type === 'enter') {
					// Check if followed by exit
					if (nextInt && nextInt.type === 'exit') {
						// Paired entry/exit - create both markers
						const liftMarker = walkSegments(toolpath, segIdx, currentInt.distance, toolRadius, false);
						const liftPt = interpolatePointOnSegment(toolpath[liftMarker.segmentIndex], toolpath[liftMarker.segmentIndex + 1], liftMarker.t);
						markers.push({
							x: liftPt.x,
							y: liftPt.y,
							type: 'lift',
							segmentIndex: liftMarker.segmentIndex,
							t: liftMarker.t
						});

						const lowerMarker = walkSegments(toolpath, segIdx, nextInt.distance, toolRadius, true);
						const lowerPt = interpolatePointOnSegment(toolpath[lowerMarker.segmentIndex], toolpath[lowerMarker.segmentIndex + 1], lowerMarker.t);
						markers.push({
							x: lowerPt.x,
							y: lowerPt.y,
							type: 'lower',
							segmentIndex: lowerMarker.segmentIndex,
							t: lowerMarker.t
						});

						intIdx++; // Skip the next intersection since we processed it
					} else {
						// Single entry (exit is on a later segment) - create only lift marker
						const liftMarker = walkSegments(toolpath, segIdx, currentInt.distance, toolRadius, false);
						const liftPt = interpolatePointOnSegment(toolpath[liftMarker.segmentIndex], toolpath[liftMarker.segmentIndex + 1], liftMarker.t);
						markers.push({
							x: liftPt.x,
							y: liftPt.y,
							type: 'lift',
							segmentIndex: liftMarker.segmentIndex,
							t: liftMarker.t
						});
					}
				} else if (currentInt.type === 'exit') {
					// Single exit (entry was on a previous segment) - create only lower marker
					const lowerMarker = walkSegments(toolpath, segIdx, currentInt.distance, toolRadius, true);
					const lowerPt = interpolatePointOnSegment(toolpath[lowerMarker.segmentIndex], toolpath[lowerMarker.segmentIndex + 1], lowerMarker.t);
					markers.push({
						x: lowerPt.x,
						y: lowerPt.y,
						type: 'lower',
						segmentIndex: lowerMarker.segmentIndex,
						t: lowerMarker.t
					});
				}
			}
		}
	}

	return markers;
}

function augmentToolpathWithMarkers(toolpath, markers) {
	// Create augmented toolpath by inserting marker points
	// Splits segments where markers occur
	// Returns new array: original points with markers inserted at appropriate positions

	if (markers.length === 0) return toolpath.slice();

	const augmentedPath = [];

	// For each segment
	for (let segIdx = 0; segIdx < toolpath.length; segIdx++) {
		const point = toolpath[segIdx];

		// Add the current point
		augmentedPath.push(point);

		// If not the last point, check for markers on this segment
		if (segIdx < toolpath.length - 1) {
			// Find all markers for this segment, sorted by t value
			const segmentMarkers = markers
				.filter(m => m.segmentIndex === segIdx)
				.sort((a, b) => a.t - b.t);

			// Add all markers for this segment
			for (const marker of segmentMarkers) {
				augmentedPath.push({
					x: marker.x,
					y: marker.y,
					marker: marker.type  // 'lift' or 'lower'
				});
			}
		}
	}

	return augmentedPath;
}
