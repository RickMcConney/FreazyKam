// ============================================================================
// COLOR PALETTE - All colors used throughout the application
// ============================================================================



// Canvas Drawing Colors
var lineColor = '#000000';              // SVG path stroke color (black)
var selectColor = '#ff0000';            // Selected path color (red)
var activeColor = '#00ff00';        // Active elements (magenta)
var highlightColor = '#00ff00';         // Highlighted elements (green)
var toolColor = '#0000ff';              // Toolpath color (blue)
var circleColor = toolColor;            // Circle/drill point color (same as toolpath)
var activeToolpathColor = '#ff00ff';    // Active toolpath being edited (magenta)
var canvasBackgroundColor = '#eee';    // Canvas background color
var pointFillColor = 'black';           // Point/marker fill color
var pointStrokeColor = '#888';          // Point/marker stroke color
var originMarkerColor = '#ff0000'         // Origin (0,0) marker color
var axisColor = '#666';           // Axis number labels color

// Grid and Workpiece Colors
var gridColor = '#888';                 // Grid lines (gray)
var gridLabelColorFill = 'black';       // Grid label text fill
var gridLabelColorStroke = 'white';     // Grid label text outline
var workpieceColor = '#F5DEB3';         // Workpiece surface color (wheat)
var workpieceBorderColor = '#888888';   // Workpiece border (gray)

// Debug and Visualization Colors
var normLineColor = toolColor;          // Normal line visualization (same blue as toolpaths)
var debugCyanColor = '#00ffff';         // Debug cyan highlight

// Simulation Colors
var simulationStrokeColor = 'rgba(255, 0, 0, 0.7)';          // Simulation path stroke (red)
var simulationFillRapid = 'rgba(255, 0, 0, 0.4)';            // Rapid move visualization (red)
var simulationFillRapid2 = 'rgba(255, 100, 0, 0.4)';         // Rapid move alt (orange-red)
var simulationFillRapid3 = 'rgba(255, 0, 100, 0.4)';         // Rapid move alt (pink-red)
var simulationFillCut = 'rgba(139, 69, 19, 0.2)';            // Cutting move (brown)
var simulationFillCut2 = 'rgba(160, 82, 45, 0.2)';           // Cutting move alt (sienna)
var simulationFillCut3 = 'rgba(101, 67, 33, 0.2)';           // Cutting move alt (dark brown)

// Material/Wood Colors (used in bootstrap-layout.js)
// Operation Tool Colors (used in PathEdit, Transform, Polygon, etc.)
var handleActiveColor = '#ff0000';      // Active/dragged handle (red)
var handleActiveStroke = handleActiveColor; // Active handle stroke (same red)
var handleHoverColor = '#ffff00';       // Hovered handle (yellow)
var handleHoverStroke = '#ff8800';      // Hovered handle stroke (orange)
var handleNormalColor = 'white';        // Normal handle (white)
var handleNormalStroke = '#0000ff';     // Normal handle stroke (blue)
var insertPreviewColor = 'rgba(0, 255, 0, 0.5)';     // Insert point preview fill (green)
var insertPreviewStroke = '#00aa00';    // Insert point preview stroke (green)
var selectionBoxColor = 'blue';         // Selection box color
var penLineColor = '#000000';           // Pen tool line color
var penCloseLineColor = '#00AA00';      // Pen tool closing line (green)
var penFirstPointColor = '#00AA00';     // Pen tool first point (green)


var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');

var staticCanvas = null;
var staticCtx = null;
var staticDirty = true;
var simulationCanvas = null;
var simulationCtx = null;
var simulationDirty = true;
var previewCompositeCanvas = null;
var previewCompositeCtx = null;
var unitToggleElement = document.getElementById('canvas-unit-toggle');
var canvasResizeObserver = null;
var pendingCanvasResizeFrame = null;
var geometryCacheDirty = true;

function markGeometryCacheDirty() {
	geometryCacheDirty = true;
}

function markSimulationLayerDirty() {
	simulationDirty = true;
}

function isSimulationLayerVisible() {
	return typeof simulation2D !== 'undefined'
		&& simulation2D.precomputedPoints
		&& simulation2D.precomputedPoints.length > 0;
}

function isSimulationStaticModeActive() {
	return typeof simulation2D !== 'undefined' && (simulation2D.isRunning || simulation2D.isPaused);
}

function buildScreenPolyline(path, isMultiSegment) {
	if (!path || !path.length) {
		return null;
	}

	var screenPoints = new Array(path.length);
	for (var i = 0; i < path.length; i++) {
		screenPoints[i] = {
			x: path[i].x * zoomLevel + panX,
			y: path[i].y * zoomLevel + panY
		};
	}

	return {
		points: screenPoints,
		isMultiSegment: !!isMultiSegment
	};
}

function updatePathScreenCache(path, force) {
	if (!path || path.type === 'image' || !path.path || !path.path.length) {
		return;
	}

	if (!force && !geometryCacheDirty && path._screenCacheZoom === zoomLevel && path._screenCachePanX === panX && path._screenCachePanY === panY) {
		return;
	}

	path._screenCache = buildScreenPolyline(path.path, false);
	path._screenCacheZoom = zoomLevel;
	path._screenCachePanX = panX;
	path._screenCachePanY = panY;
}

function updateToolpathScreenCache(pathEntry, force) {
	if (!pathEntry || !pathEntry.tpath || !pathEntry.tpath.length) {
		return;
	}

	if (!force && !geometryCacheDirty && pathEntry._screenCacheZoom === zoomLevel && pathEntry._screenCachePanX === panX && pathEntry._screenCachePanY === panY) {
		return;
	}

	pathEntry._screenCache = buildScreenPolyline(pathEntry.tpath, pathEntry.isMultiSegment || false);
	pathEntry._screenCacheZoom = zoomLevel;
	pathEntry._screenCachePanX = panX;
	pathEntry._screenCachePanY = panY;
}

function refreshVisibleGeometryCaches() {
	if (!geometryCacheDirty) {
		return;
	}

	var i;
	for (i = 0; i < svgpaths.length; i++) {
		if (svgpaths[i] && svgpaths[i].visible) {
			updatePathScreenCache(svgpaths[i]);
		}
	}

	for (i = 0; i < toolpaths.length; i++) {
		if (!toolpaths[i] || !toolpaths[i].visible || !toolpaths[i].paths) continue;
		for (var p = 0; p < toolpaths[i].paths.length; p++) {
			updateToolpathScreenCache(toolpaths[i].paths[p]);
		}
	}

	geometryCacheDirty = false;
}

// Mousewheel zoom (standard 'wheel' event works across all browsers including Safari)
canvas.addEventListener('wheel', function (evt) {
	var rect = canvas.getBoundingClientRect();
	var zoomX = evt.clientX - rect.left;
	var zoomY = evt.clientY - rect.top;
	var delta = evt.deltaY < 0 ? 1 : -1;
	newZoom(delta, zoomX, zoomY);
	evt.preventDefault();
}, { passive: false });

// Add window resize handler to re-center workpiece when viewport changes
window.addEventListener('resize', function () {
	// Debounce resize events to avoid excessive recalculations
	clearTimeout(window.resizeTimeout);
	window.resizeTimeout = setTimeout(function () {
		centerWorkpiece();
		redraw();
	}, 150);
});


var ZOOM_STEP_FACTOR = 1.05; // Multiplier per scroll tick
var MIN_ZOOM_LEVEL = 0.15;
var MAX_ZOOM_LEVEL = 20;
var MAX_ZOOM_OUT_MARGIN_FACTOR = 1.25;

function getViewportSize() {
	var canvasParent = $('#canvas').parent()[0];
	var parentWidth = (canvasParent && canvasParent.clientWidth) || 0;
	var parentHeight = (canvasParent && canvasParent.clientHeight) || 0;

	return {
		width: parentWidth || canvas.width || 0,
		height: parentHeight || canvas.height || 0
	};
}

function getMinZoomLevel() {
	var workpieceWidth = getOption("workpieceWidth") * viewScale;
	var workpieceLength = getOption("workpieceLength") * viewScale;

	if (!workpieceWidth || !workpieceLength) {
		return MIN_ZOOM_LEVEL;
	}

	var viewport = getViewportSize();
	var viewportWidth = viewport.width;
	var viewportHeight = viewport.height;

	if (!viewportWidth || !viewportHeight) {
		return MIN_ZOOM_LEVEL;
	}

	// Allow a small margin around the workpiece at max zoom-out so its sides remain visible.
	var fitZoom = Math.min(viewportWidth / workpieceWidth, viewportHeight / workpieceLength);
	var zoomWithMargin = fitZoom / MAX_ZOOM_OUT_MARGIN_FACTOR;

	return Math.min(MIN_ZOOM_LEVEL, zoomWithMargin);
}

function clampPanToWorkpiece(nextPanX, nextPanY, effectiveZoomLevel) {
	var zoom = effectiveZoomLevel || zoomLevel;
	var workpieceWidth = getOption("workpieceWidth") * viewScale;
	var workpieceLength = getOption("workpieceLength") * viewScale;
	var viewport = getViewportSize();

	if (!zoom || !workpieceWidth || !workpieceLength || !viewport.width || !viewport.height) {
		return { panX: nextPanX, panY: nextPanY };
	}

	var visibleWidth = viewport.width / zoom;
	var visibleHeight = viewport.height / zoom;
	var centerX = (viewport.width / 2 - nextPanX) / zoom;
	var centerY = (viewport.height / 2 - nextPanY) / zoom;
	var minCenterX = visibleWidth >= workpieceWidth ? workpieceWidth / 2 : visibleWidth / 2;
	var maxCenterX = visibleWidth >= workpieceWidth ? workpieceWidth / 2 : workpieceWidth - visibleWidth / 2;
	var minCenterY = visibleHeight >= workpieceLength ? workpieceLength / 2 : visibleHeight / 2;
	var maxCenterY = visibleHeight >= workpieceLength ? workpieceLength / 2 : workpieceLength - visibleHeight / 2;

	centerX = Math.max(minCenterX, Math.min(maxCenterX, centerX));
	centerY = Math.max(minCenterY, Math.min(maxCenterY, centerY));

	return {
		panX: viewport.width / 2 - centerX * zoom,
		panY: viewport.height / 2 - centerY * zoom
	};
}

// Function to handle zooming in and out, centered on given screen coordinates
function newZoom(delta, centerX, centerY) {
	// centerX, centerY are screen coordinates where zoom is centered
	// Compute world coordinate under mouse before zoom
	var world = screenToWorld(centerX, centerY);
	// Update zoom level multiplicatively
	var zoomFactor = (delta > 0) ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR;
	var minZoomLevel = getMinZoomLevel();
	var newZoom = Math.max(minZoomLevel, Math.min(MAX_ZOOM_LEVEL, zoomLevel * zoomFactor));
	var clampedPan = clampPanToWorkpiece(centerX - world.x * newZoom, centerY - world.y * newZoom, newZoom);
	// Adjust pan so the world coordinate stays under the mouse
	panX = clampedPan.panX;
	panY = clampedPan.panY;
	zoomLevel = newZoom;
	markGeometryCacheDirty();

	// Update properties panel if Pan tool is currently active
	if (typeof cncController !== 'undefined' &&
		cncController.operationManager &&
		cncController.operationManager.currentOperation &&
		cncController.operationManager.currentOperation.name === 'Pan' &&
		typeof cncController.operationManager.currentOperation.updatePropertiesPanel === 'function') {
		cncController.operationManager.currentOperation.updatePropertiesPanel();
	}

	redraw();
}

// Function to automatically center the workpiece in the canvas viewport
function centerWorkpiece() {
	// Get canvas dimensions
	const canvasCenter = getCanvasCenter();

	// Get workpiece dimensions from options
	const workpieceWidth = getOption("workpieceWidth") * viewScale;
	const workpieceLength = getOption("workpieceLength") * viewScale;

	// Calculate pan values to center the workpiece
	// The workpiece center should appear at the canvas center
	// Using transform: screenX = worldX * zoomLevel + panX
	// To center: canvasCenter.x = (workpieceWidth/2) * zoomLevel + panX
	// Therefore: panX = canvasCenter.x - (workpieceWidth/2) * zoomLevel
	panX = canvasCenter.x - (workpieceWidth / 2) * zoomLevel;
	panY = canvasCenter.y - (workpieceLength / 2) * zoomLevel;

}

function fitWorkpieceInView() {
	zoomLevel = getMinZoomLevel();
	centerWorkpiece();
}

function initializeCanvasOverlayControls() {
	if (unitToggleElement && unitToggleElement.dataset.initialized !== 'true') {
		unitToggleElement.addEventListener('click', function(evt) {
			var button = evt.target.closest('.canvas-unit-toggle-button');
			if (!button || typeof window.setDisplayUnits !== 'function') return;
			window.setDisplayUnits(button.dataset.unit === 'in');
		});
		unitToggleElement.dataset.initialized = 'true';
	}

	if (typeof updateCanvasUnitToggleUI === 'function') {
		updateCanvasUnitToggleUI();
	}
}

initializeCanvasOverlayControls();

function resizeCanvasToViewport() {
	var viewport = getViewportSize();
	var nextWidth = Math.max(1, Math.round(viewport.width || 0));
	var nextHeight = Math.max(1, Math.round(viewport.height || 0));

	if (!nextWidth || !nextHeight) {
		return false;
	}

	if (canvas.width === nextWidth && canvas.height === nextHeight) {
		return false;
	}

	var currentCenter = screenToWorld(canvas.width / 2, canvas.height / 2);

	canvas.width = nextWidth;
	canvas.height = nextHeight;

	var clampedPan = clampPanToWorkpiece(
		canvas.width / 2 - currentCenter.x * zoomLevel,
		canvas.height / 2 - currentCenter.y * zoomLevel
	);
	panX = clampedPan.panX;
	panY = clampedPan.panY;
	markGeometryCacheDirty();

	return true;
}

function queueCanvasResizeSync() {
	if (pendingCanvasResizeFrame !== null) {
		return;
	}

	pendingCanvasResizeFrame = requestAnimationFrame(function () {
		pendingCanvasResizeFrame = null;
		if (resizeCanvasToViewport()) {
			// Keep the canvas repaint in the same frame as the bitmap resize to
			// avoid a visible blank flash while the sidebar is being dragged.
			staticDirty = true;
			simulationDirty = true;
			redrawCore();
			setDirty();
		}
	});
}

function initializeCanvasResizeObserver() {
	if (!window.ResizeObserver || canvasResizeObserver || !canvas || !canvas.parentElement) {
		return;
	}

	canvasResizeObserver = new ResizeObserver(function () {
		queueCanvasResizeSync();
	});

	canvasResizeObserver.observe(canvas.parentElement);
}

function updateCanvasCenter() {
	resizeCanvasToViewport();
}

window.updateCanvasCenter = updateCanvasCenter;

initializeCanvasResizeObserver();

// Calculate dynamic center based on viewport dimensions and coordinate system
function getCanvasCenter() {
	resizeCanvasToViewport();

	return {
		x: canvas.width / 2,
		y: canvas.height / 2
	};
}


function clear() {
	ctx.globalAlpha = 1;
	ctx.beginPath();
	ctx.rect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = canvasBackgroundColor;
	ctx.fill();
}

function drawLine(norm, color) {
	ctx.beginPath();
	var p1 = worldToScreen(norm.x1, norm.y1);
	var p2 = worldToScreen(norm.x2, norm.y2);
	ctx.moveTo(p1.x, p1.y);
	ctx.lineTo(p2.x, p2.y);
	ctx.strokeStyle = color;
	ctx.lineWidth = 0.1;
	ctx.stroke();
}


function drawNorms(norms) {
	for (var i = 0; i < norms.length; i++) {
		var norm = norms[i];
		drawLine(norm, normLineColor);
	}
}


function drawScreenPolyline(screenPath, color, lineWidth) {
	if (!screenPath || !screenPath.points || !screenPath.points.length) {
		return;
	}

	var points = screenPath.points;
	if (points.length === 1) {
		var singlePt = points[0];
		var r = 4;
		ctx.beginPath();
		ctx.arc(singlePt.x, singlePt.y, r, 0, Math.PI * 2);
		ctx.fillStyle = color;
		ctx.fill();
		ctx.beginPath();
		ctx.moveTo(singlePt.x - r * 1.5, singlePt.y);
		ctx.lineTo(singlePt.x + r * 1.5, singlePt.y);
		ctx.moveTo(singlePt.x, singlePt.y - r * 1.5);
		ctx.lineTo(singlePt.x, singlePt.y + r * 1.5);
		ctx.strokeStyle = color;
		ctx.lineWidth = lineWidth;
		ctx.stroke();
		return;
	}

	if (!traceScreenPath(screenPath)) {
		return;
	}

	ctx.lineWidth = lineWidth;
	ctx.strokeStyle = color;
	ctx.stroke();
}

function traceScreenPath(screenPath, targetCtx) {
	targetCtx = targetCtx || ctx;

	if (!screenPath || !screenPath.points || !screenPath.points.length) {
		return false;
	}

	var points = screenPath.points;

	targetCtx.beginPath();
	targetCtx.lineCap = 'round';
	targetCtx.lineJoin = 'round';
	if (screenPath.isMultiSegment) {
		for (var i = 0; i < points.length; i += 2) {
			targetCtx.moveTo(points[i].x, points[i].y);
			if (i + 1 < points.length) {
				targetCtx.lineTo(points[i + 1].x, points[i + 1].y);
			}
		}
	} else {
		targetCtx.moveTo(points[0].x, points[0].y);
		for (var j = 1; j < points.length; j++) {
			targetCtx.lineTo(points[j].x, points[j].y);
		}
	}

	return true;
}

function traceClosedScreenPath(screenPath, targetCtx) {
	targetCtx = targetCtx || ctx;

	if (!traceScreenPath(screenPath, targetCtx)) {
		return false;
	}

	targetCtx.closePath();
	return true;
}

function getPreviewCompositeContext() {
	if (!previewCompositeCanvas || previewCompositeCanvas.width !== canvas.width || previewCompositeCanvas.height !== canvas.height) {
		previewCompositeCanvas = document.createElement('canvas');
		previewCompositeCanvas.width = canvas.width;
		previewCompositeCanvas.height = canvas.height;
		previewCompositeCtx = previewCompositeCanvas.getContext('2d');
	}

	previewCompositeCtx.clearRect(0, 0, previewCompositeCanvas.width, previewCompositeCanvas.height);
	return previewCompositeCtx;
}

function drawPolyline(path, color, lineWidth, isMultiSegment) {
	drawScreenPolyline(buildScreenPolyline(path, isMultiSegment), color, lineWidth);
}

function drawSvgPath(svgpath, color, lineWidth) {
	updatePathScreenCache(svgpath);
	if (svgpath.highlight && Select.getInstance().hasClosedHitArea(svgpath)) {
		var screenPath = svgpath._screenCache;
		if (screenPath && traceClosedScreenPath(screenPath)) {
			ctx.save();
			ctx.fillStyle = 'rgba(255, 0, 0, 0.12)';
			ctx.fill();
			ctx.restore();
		}
	}
	drawScreenPolyline(svgpath._screenCache, color, lineWidth);
	if (svgpath.creationProperties && svgpath.creationProperties.tabs && svgpath.creationProperties.tabs.length > 0) {
		drawPathTabs(svgpath);
	}
}

function getToolpathShadeColor(depth) {
	var maxDepth = (typeof getOption === 'function' ? Number(getOption('workpieceThickness')) : 19) || 19;
	var ratio = Math.min(Math.max((Number(depth) || 0) / maxDepth, 0), 1);
	var channel = Math.round(235 * (1 - ratio));
	return 'rgb(' + channel + ', ' + channel + ', ' + channel + ')';
}

function getToolpathCutPreviewMode(toolpath) {
	var operationType = toolpath && toolpath.toolpathProperties ? toolpath.toolpathProperties.operationType : null;
	if (operationType === 'pocket' || operationType === 'inside' || operationType === 'outside' || operationType === 'center') {
		return operationType;
	}

	if (!toolpath) return 'pocket';
	if (toolpath.operation === 'Pocket') return 'pocket';
	if (toolpath.operation === 'Inside' || toolpath.operation === 'VCarve In') return 'inside';
	if (toolpath.operation === 'Outside' || toolpath.operation === 'VCarve Out') return 'outside';
	if (toolpath.tool && (toolpath.tool.inside === 'inside' || toolpath.tool.inside === 'outside' || toolpath.tool.inside === 'center')) {
		return toolpath.tool.inside;
	}

	return 'pocket';
}

function drawToolpathShapePreview(svgpath, toolpath) {
	if (!svgpath || svgpath.type === 'image') return;

	updatePathScreenCache(svgpath);
	var screenPath = svgpath._screenCache;
	if (!screenPath || !screenPath.points || !screenPath.points.length) return;

	var mode = getToolpathCutPreviewMode(toolpath);
	var color = getToolpathShadeColor(toolpath?.toolpathProperties?.depth ?? toolpath?.tool?.depth);
	var toolDiameter = Number(toolpath?.tool?.diameter) || 0;
	var strokeWidth = Math.max(4, toolDiameter * viewScale * zoomLevel);
	var compositeCtx = null;

	ctx.save();

	if (mode === 'pocket' && svgpath.closed !== false && traceClosedScreenPath(screenPath)) {
		ctx.fillStyle = color;
		ctx.fill();
		ctx.restore();
		return;
	}

	if (mode === 'inside' || mode === 'outside') {
		compositeCtx = getPreviewCompositeContext();

		if (!traceClosedScreenPath(screenPath, compositeCtx)) {
			ctx.restore();
			return;
		}

		compositeCtx.strokeStyle = color;
		compositeCtx.lineWidth = strokeWidth;
		compositeCtx.stroke();

		compositeCtx.globalCompositeOperation = mode === 'inside' ? 'destination-in' : 'destination-out';
		compositeCtx.fillStyle = '#000000';
		traceClosedScreenPath(screenPath, compositeCtx);
		compositeCtx.fill();
		compositeCtx.globalCompositeOperation = 'source-over';

		ctx.drawImage(previewCompositeCanvas, 0, 0);
		ctx.restore();
		return;
	}

	if (!traceClosedScreenPath(screenPath)) {
		ctx.restore();
		return;
	}

	ctx.strokeStyle = color;
	ctx.lineWidth = strokeWidth;
	ctx.stroke();

	ctx.restore();
}

function drawActiveToolpathShapePreviews() {
	if (!Array.isArray(toolpaths) || toolpaths.length === 0) return;

	for (var i = 0; i < toolpaths.length; i++) {
		var toolpath = toolpaths[i];
		if (!toolpath || !toolpath.active) continue;

		var sourceIds = Array.isArray(toolpath.svgIds) && toolpath.svgIds.length > 0
			? toolpath.svgIds
			: (toolpath.svgId ? [toolpath.svgId] : []);

		for (var j = 0; j < sourceIds.length; j++) {
			var svgpath = svgpaths.find(function(path) {
				return path.id === sourceIds[j];
			});
			if (svgpath) {
				drawToolpathShapePreview(svgpath, toolpath);
			}
		}
	}
}

function drawStoredShapeCutPreviews() {
	if (!Array.isArray(svgpaths) || svgpaths.length === 0) return;

	for (var i = 0; i < svgpaths.length; i++) {
		var path = svgpaths[i];
		if (!path || path.type === 'image' || !path.visible || !path.toolpathProperties) continue;

		var tool = null;
		if (window.toolPathProperties && typeof window.toolPathProperties.getToolById === 'function') {
			tool = window.toolPathProperties.getToolById(path.toolpathProperties.tool);
		}

		drawToolpathShapePreview(path, {
			operation: path.toolpathProperties.operation,
			toolpathProperties: path.toolpathProperties,
			tool: tool || { diameter: 0 }
		});
	}
}

function drawPathTabs(svgpath) {
	if (!svgpath.creationProperties || !svgpath.creationProperties.tabs) return;

	const tabs = svgpath.creationProperties.tabs;
	const tabLength = svgpath.creationProperties.tabLength || 5;
	const tabHeight = svgpath.creationProperties.tabHeight || 2;

	ctx.save();

	for (let i = 0; i < tabs.length; i++) {
		const tab = tabs[i];
		const screenCenter = worldToScreen(tab.x, tab.y);

		// Convert MM to world units then to screen units
		const tabLengthScreen = tabLength * viewScale * zoomLevel;
		const tabHeightScreen = tabHeight * viewScale * zoomLevel;

		// Save and transform for rotation
		ctx.save();
		ctx.translate(screenCenter.x, screenCenter.y);
		// Rotate to align with segment direction (tab.angle is now the segment angle directly)
		ctx.rotate(tab.angle);

		// Draw tab rectangle with color based on convexity
		// Now: width (x-axis) = length along path, height (y-axis) = height perpendicular to path
		ctx.fillStyle = tab.isConvex ? 'rgba(100, 150, 255, 0.5)' : 'rgba(255, 150, 100, 0.5)';
		ctx.fillRect(-tabLengthScreen / 2, -tabHeightScreen / 2, tabLengthScreen, tabHeightScreen);

		// Draw outline
		ctx.strokeStyle = tab.isConvex ? '#0080ff' : '#ff8050';
		ctx.lineWidth = 1.5;
		ctx.strokeRect(-tabLengthScreen / 2, -tabHeightScreen / 2, tabLengthScreen, tabHeightScreen);

		ctx.restore();
	}

	ctx.restore();
}




// Shared setup for grid and origin drawing
function _getProgressiveGridMultiplier(baseStepPixels, minStepPixels) {
	if (!baseStepPixels || baseStepPixels <= 0) {
		return 1;
	}

	const ratio = Math.max(1, minStepPixels / baseStepPixels);
	const magnitude = Math.pow(10, Math.floor(Math.log10(ratio)));
	const normalized = ratio / magnitude;

	if (normalized <= 1) return magnitude;
	if (normalized <= 2) return 2 * magnitude;
	if (normalized <= 5) return 5 * magnitude;
	return 10 * magnitude;
}

function _getImperialProgressiveGridMultiplier(baseStepPixels, minStepPixels) {
	if (!baseStepPixels || baseStepPixels <= 0) {
		return 1;
	}

	const ratio = Math.max(1, minStepPixels / baseStepPixels);
	let multiplier = 1;
	while (multiplier < ratio) {
		multiplier *= 2;
	}

	return multiplier;
}

function _drawGridLines(stepPixels, topLeft, bottomRight, originScreen) {
	if (!stepPixels || stepPixels <= 0) {
		return;
	}

	for (var y = originScreen.y; y <= bottomRight.y; y += stepPixels) {
		ctx.moveTo(topLeft.x, y);
		ctx.lineTo(bottomRight.x, y);
	}
	for (var y = originScreen.y - stepPixels; y >= topLeft.y; y -= stepPixels) {
		ctx.moveTo(topLeft.x, y);
		ctx.lineTo(bottomRight.x, y);
	}

	for (var x = originScreen.x; x <= bottomRight.x; x += stepPixels) {
		ctx.moveTo(x, topLeft.y);
		ctx.lineTo(x, bottomRight.y);
	}
	for (var x = originScreen.x - stepPixels; x >= topLeft.x; x -= stepPixels) {
		ctx.moveTo(x, topLeft.y);
		ctx.lineTo(x, bottomRight.y);
	}
}

function _formatAxisLabel(value, useInches) {
	if (useInches) {
		var frac = decimalToFraction(value, 64);
		if (!frac) {
			return parseFloat(value.toFixed(3)).toString();
		}

		var sign = frac.whole < 0 || value < 0 ? '-' : '';
		var absWhole = Math.abs(frac.whole);
		if (absWhole > 0) {
			if (frac.numerator > 0) {
				return sign + absWhole + ' ' + frac.numerator + '/' + frac.denominator;
			}
			return sign + absWhole;
		}
		if (frac.numerator > 0) {
			return sign + frac.numerator + '/' + frac.denominator;
		}
		return '0';
	}

	if (Math.abs(value - Math.round(value)) < 0.0001) {
		return String(Math.round(value));
	}

	return parseFloat(value.toFixed(1)).toString();
}

function _getGridSetup() {
	const width = getOption("workpieceWidth") * viewScale;
	const length = getOption("workpieceLength") * viewScale;
	const topLeft = worldToScreen(0, 0);
	const bottomRight = worldToScreen(width, length);
	const o = worldToScreen(origin.x, origin.y);
	const useInches = typeof getOption !== 'undefined' ? getOption('Inches') : false;
	const gridSizeMM = (typeof getOption !== 'undefined' && getOption("gridSize")) ? getOption("gridSize") : 10;
	const gridSizeDisplay = useInches ? (gridSizeMM / MM_PER_INCH) : gridSizeMM;
	const grid = gridSizeMM * viewScale * zoomLevel;
	const minorMultiplier = _getProgressiveGridMultiplier(grid, 18);
	const majorMultiplier = _getProgressiveGridMultiplier(grid, 90);
	const labelMultiplier = useInches
		? _getImperialProgressiveGridMultiplier(grid, 140)
		: _getProgressiveGridMultiplier(grid, 140);

	return {
		topLeft,
		bottomRight,
		o,
		minorGrid: grid * minorMultiplier,
		majorGrid: grid * majorMultiplier,
		labelGrid: grid * labelMultiplier,
		labelInterval: gridSizeDisplay * labelMultiplier
	};
}

// New drawGrid using virtual coordinates
function drawGrid() {
	const { topLeft, bottomRight, o, minorGrid, majorGrid } = _getGridSetup();

	ctx.beginPath();
	_drawGridLines(minorGrid, topLeft, bottomRight, o);
	ctx.lineWidth = 0.25;
	ctx.strokeStyle = 'rgba(136, 136, 136, 0.35)';
	ctx.stroke();

	if (majorGrid !== minorGrid) {
		ctx.beginPath();
		_drawGridLines(majorGrid, topLeft, bottomRight, o);
		ctx.lineWidth = 0.5;
		ctx.strokeStyle = 'rgba(136, 136, 136, 0.6)';
		ctx.stroke();
	}
}




function drawOrigin() {
	ctx.beginPath();
	const { topLeft, bottomRight, o, labelGrid, labelInterval } = _getGridSetup();

	let offsetx = 0;
	let offsety = 0;


	// Draw blue X axis only within workpiece bounds

	ctx.moveTo(offsetx + topLeft.x, offsety + o.y);
	ctx.lineTo(offsetx + bottomRight.x, offsety + o.y);
	ctx.moveTo(offsetx + o.x, offsety + topLeft.y);
	ctx.lineTo(offsetx + o.x, offsety + bottomRight.y);

	ctx.lineWidth = 1;
	ctx.strokeStyle = axisColor;
	ctx.stroke();

	// Draw axis numbers - determine interval based on units
	ctx.fillStyle = axisColor;
	ctx.font = "12px Arial";

	var useInches = typeof getOption !== 'undefined' ? getOption('Inches') : false;
	var numberInterval = labelInterval;
	var numberGrid = labelGrid;

	// Draw Y axis labels (vertical positions)
	var label = 0;
	for (var y = o.y; y <= bottomRight.y; y += numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			var labelText = _formatAxisLabel(-label, useInches);
			ctx.fillText(labelText, o.x + 2, y - 2);
		}
		label += numberInterval;
	}
	label = 0;
	for (var y = o.y; y >= topLeft.y; y -= numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			var labelText = _formatAxisLabel(-label, useInches);
			ctx.fillText(labelText, o.x + 2, y - 2);
		}
		label -= numberInterval;
	}

	// Draw X axis labels (horizontal positions)
	label = 0;
	for (var x = o.x; x <= bottomRight.x; x += numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			var labelText = _formatAxisLabel(label, useInches);
			ctx.fillText(labelText, x + 2, o.y - 2);
		}
		label += numberInterval;
	}
	label = 0;
	for (var x = o.x; x >= topLeft.x; x -= numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			var labelText = _formatAxisLabel(label, useInches);
			ctx.fillText(labelText, x + 2, o.y - 2);
		}
		label -= numberInterval;
	}

	// Draw origin marker (0,0)
	ctx.fillStyle = originMarkerColor;
	ctx.fillText("0", o.x + 2, o.y - 2);
}

// Core rendering function (does actual drawing)
function redrawCore() {
	if (!canvas.width || !canvas.height) return;

	// Recreate render layers if they don't exist or canvas was resized.
	if (!staticCanvas || staticCanvas.width !== canvas.width || staticCanvas.height !== canvas.height) {
		staticCanvas = document.createElement('canvas');
		staticCanvas.width = canvas.width;
		staticCanvas.height = canvas.height;
		staticCtx = staticCanvas.getContext('2d');
		staticDirty = true;
	}

	if (!simulationCanvas || simulationCanvas.width !== canvas.width || simulationCanvas.height !== canvas.height) {
		simulationCanvas = document.createElement('canvas');
		simulationCanvas.width = canvas.width;
		simulationCanvas.height = canvas.height;
		simulationCtx = simulationCanvas.getContext('2d');
		simulationDirty = true;
	}

	if (staticDirty) {
		markGeometryCacheDirty();
	}

	if (staticDirty) {
		refreshVisibleGeometryCaches();

		// Render static layer (paths, grid, workpiece) to offscreen canvas
		staticCtx.globalAlpha = 1;
		staticCtx.beginPath();
		staticCtx.rect(0, 0, staticCanvas.width, staticCanvas.height);
		staticCtx.fillStyle = canvasBackgroundColor;
		staticCtx.fill();

		var mainCtx = ctx;
		ctx = staticCtx;

		if (getOption("showWorkpiece"))
			drawWorkpiece();
		if (getOption("showGrid") && !isSimulationStaticModeActive())
			drawGrid();
		if (getOption("showOrigin"))
			drawOrigin();
		drawToolPaths();
		drawSvgPaths();
		if (typeof window.drawSTLHeightMap === 'function') window.drawSTLHeightMap(ctx);

		ctx = mainCtx;
		staticDirty = false;
	}

	if (simulationDirty && simulationCtx) {
		simulationCtx.clearRect(0, 0, simulationCanvas.width, simulationCanvas.height);

		if (isSimulationLayerVisible()) {
			var mainCtx = ctx;
			ctx = simulationCtx;
			drawMaterialRemovalCircles();
			ctx = mainCtx;
		}

		simulationDirty = false;
	}

	// Compose static + simulation layers, then draw live interaction overlay.
	ctx.drawImage(staticCanvas, 0, 0);
	if (simulationCanvas) {
		ctx.drawImage(simulationCanvas, 0, 0);
	}
	cncController.draw();
}

// Full redraw — marks static layer dirty and queues a frame
function redraw() {
	staticDirty = true;
	simulationDirty = true;
	setDirty();
}

// Overlay-only redraw — skips static re-render (use when only the operation overlay changed)
function redrawOverlay() {
	setDirty();
}

function drawWorkpiece() {
	var width = getOption("workpieceWidth") * viewScale;
	var length = getOption("workpieceLength") * viewScale;
	var material = getOption("material");
	var woodColor = workpieceColor;
	if (typeof materialsDatabase !== 'undefined' && materialsDatabase[material]) {
		woodColor = materialsDatabase[material].color;
	}
	var startX = 0;
	var startY = 0;
	var topLeft = worldToScreen(startX, startY);
	var bottomRight = worldToScreen(width, length);
	ctx.beginPath();
	ctx.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
	ctx.fillStyle = woodColor;
	ctx.fill();
	ctx.strokeStyle = workpieceBorderColor;
	ctx.lineWidth = 0.5;
	ctx.stroke();
}

function fillCircles(circles, color) {
	for (var i = 0; i < circles.length; i++) {
		var circle = circles[i];
		var pt = worldToScreen(circle.x, circle.y);
		var r = circle.r * zoomLevel;
		ctx.beginPath();
		ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
		ctx.fillStyle = color;
		ctx.fill();
		ctx.strokeStyle = color;
		ctx.lineWidth = 0.1;
		ctx.stroke();
	}

}

function drawReferenceImage(path, borderColor) {
	if (!path.imageData || path.path.length < 4) return;

	// Cache the HTMLImageElement as non-enumerable so JSON.stringify skips it
	if (!path._imageEl || !path._imageEl.tagName) {
		var img = new Image();
		img.onload = function() { redraw(); };
		img.src = path.imageData;
		Object.defineProperty(path, '_imageEl', { value: img, writable: true, enumerable: false, configurable: true });
	}
	if (!path._imageEl.complete || path._imageEl.naturalWidth === 0) return;

	var c = path.path;
	var tl = worldToScreen(c[0].x, c[0].y);
	var tr = worldToScreen(c[1].x, c[1].y);
	var bl = worldToScreen(c[3].x, c[3].y);
	var W = path.imageNaturalWidth;
	var H = path.imageNaturalHeight;

	ctx.save();
	ctx.setTransform(
		(tr.x - tl.x) / W,
		(tr.y - tl.y) / W,
		(bl.x - tl.x) / H,
		(bl.y - tl.y) / H,
		tl.x,
		tl.y
	);
	ctx.globalAlpha = 0.5;
	ctx.drawImage(path._imageEl, 0, 0);
	ctx.restore();

	// Draw bounding box border
	ctx.save();
	ctx.beginPath();
	var p0 = worldToScreen(c[0].x, c[0].y);
	var p1 = worldToScreen(c[1].x, c[1].y);
	var p2 = worldToScreen(c[2].x, c[2].y);
	var p3 = worldToScreen(c[3].x, c[3].y);
	ctx.moveTo(p0.x, p0.y);
	ctx.lineTo(p1.x, p1.y);
	ctx.lineTo(p2.x, p2.y);
	ctx.lineTo(p3.x, p3.y);
	ctx.closePath();
	ctx.strokeStyle = borderColor;
	ctx.lineWidth = 1;
	ctx.setLineDash([5, 5]);
	ctx.stroke();
	ctx.setLineDash([]);
	ctx.restore();
}

function drawSvgPaths() {
	const currentOperation = window.cncController && window.cncController.operationManager
		? window.cncController.operationManager.getCurrentOperation()
		: null;
	const isSelectOperation = currentOperation && currentOperation.name === 'Select';
	const showHoverHighlight = !!currentOperation;
	const hoverStrokeColor = isSelectOperation ? selectColor : highlightColor;

	drawStoredShapeCutPreviews();
	drawActiveToolpathShapePreviews();

	for (var i = 0; i < svgpaths.length; i++) {
		if (svgpaths[i].visible) {
			let path = svgpaths[i];
			if (!selectMgr.isSelected(path))
			{
				if (path.type === 'image') {
					drawReferenceImage(path, path.highlight && showHoverHighlight ? hoverStrokeColor : lineColor);
				} else if (path.highlight && showHoverHighlight) {
					drawSvgPath(path, hoverStrokeColor, 3);
				} else {
					drawSvgPath(path, lineColor, 0.5);
				}
			}
		}
	}

	let selectedPaths = selectMgr.selectedPaths();
	for(let i = 0;i<selectedPaths.length;i++)
	{
		let path = selectedPaths[i];
		let color = (i == selectedPaths.length - 1) ? activeColor : selectColor;

		if (path.type === 'image') {
			drawReferenceImage(path, color);
		} else if(i == selectedPaths.length-1) {
			drawSvgPath(path, activeColor, 3);
		} else {
			drawSvgPath(path, selectColor, 3);
		}
	}
}

function depthToBlue(depth) {
	var maxDepth = (typeof getOption === 'function' ? getOption('workpieceThickness') : 19) || 19;
	var t = Math.min(Math.max(depth / maxDepth, 0), 1);
	// Light blue (160,200,255) at shallow → dark blue (0,40,160) at full depth
	var r = Math.round(160 * (1 - t));
	var g = Math.round(200 - 160 * t);
	var b = Math.round(255 - 95 * t);
	return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function drawToolPaths() {
	for (var i = 0; i < toolpaths.length; i++) {
		if (toolpaths[i].visible) {
			if (toolpaths[i].active) {
				continue;
			}

			var paths = toolpaths[i].paths;
			// Determine color: active > selected > depth-based blue
			var isActive = toolpaths[i].active;
			var depth = toolpaths[i].tool.depth || 0;
			var color = isActive ? activeToolpathColor : depthToBlue(depth);
			var lineWidth = isActive ? 4 : (toolpaths[i].selected ? 3 : 2);

			for (var p = 0; p < paths.length; p++) {
				var path = paths[p].tpath;
				var tpath = paths[p].tpath;
				var operation = toolpaths[i].operation;

				if (operation == "Drill")
					fillCircles(path, color);

				// Check if this is a plunge point
				if (paths[p].isPlunge && paths[p].plungePoint) {
					// Draw plunge point as a filled circle with cross
					var plungePoint = paths[p].plungePoint;
					var screenPoint = worldToScreen(plungePoint.x, plungePoint.y);
					var size = 8 * zoomLevel; // Size of the plunge marker, scaled with zoom

					ctx.save();
					// Draw filled circle
					ctx.beginPath();
					ctx.arc(screenPoint.x, screenPoint.y, size, 0, 2 * Math.PI);
					ctx.fillStyle = color;
					ctx.globalAlpha = 0.5;
					ctx.fill();

					// Draw cross
					ctx.globalAlpha = 1.0;
					ctx.strokeStyle = color;
					ctx.lineWidth = 2;
					ctx.beginPath();
					ctx.moveTo(screenPoint.x - size, screenPoint.y);
					ctx.lineTo(screenPoint.x + size, screenPoint.y);
					ctx.moveTo(screenPoint.x, screenPoint.y - size);
					ctx.lineTo(screenPoint.x, screenPoint.y + size);
					ctx.stroke();
					ctx.restore();
				}
				else if (tpath) {
					updateToolpathScreenCache(paths[p]);
					drawScreenPolyline(paths[p]._screenCache, color, lineWidth);
				}
			}
		}
	}

}
