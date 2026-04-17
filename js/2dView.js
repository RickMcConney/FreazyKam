// ============================================================================
// COLOR PALETTE - All colors used throughout the application
// ============================================================================



// Canvas Drawing Colors
var lineColor = '#000000';              // SVG path stroke color (black)
var selectColor = '#ff0000';            // Selected path color (red)
var activeColor = '#ff00ff';        // Active elements (magenta)
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


var ZOOM_STEP_FACTOR = 1.1; // Multiplier per scroll tick

// Function to handle zooming in and out, centered on given screen coordinates
function newZoom(delta, centerX, centerY) {
	// centerX, centerY are screen coordinates where zoom is centered
	// Compute world coordinate under mouse before zoom
	var world = screenToWorld(centerX, centerY);
	// Update zoom level multiplicatively
	var zoomFactor = (delta > 0) ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR;
	var newZoom = Math.max(0.05, Math.min(50, zoomLevel * zoomFactor));
	// Adjust pan so the world coordinate stays under the mouse
	panX = centerX - world.x * newZoom;
	panY = centerY - world.y * newZoom;
	zoomLevel = newZoom;

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

// Calculate dynamic center based on viewport dimensions and coordinate system
function getCanvasCenter() {

	canvas.width = $('#canvas').parent()[0].clientWidth;
	canvas.height = $('#canvas').parent()[0].clientHeight;

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


function drawPolyline(path, color, lineWidth, isMultiSegment) {
	ctx.beginPath();
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	if (isMultiSegment) {
		for (let i = 0; i < path.length; i += 2) {
			var pt = worldToScreen(path[i].x, path[i].y);
			ctx.moveTo(pt.x, pt.y);
			if (i + 1 < path.length) {
				var pt2 = worldToScreen(path[i + 1].x, path[i + 1].y);
				ctx.lineTo(pt2.x, pt2.y);
			}
		}
	} else {
		for (var j = 0; j < path.length; j++) {
			var pt = worldToScreen(path[j].x, path[j].y);
			if (j == 0) ctx.moveTo(pt.x, pt.y);
			else ctx.lineTo(pt.x, pt.y);
		}
	}
	ctx.lineWidth = lineWidth;
	ctx.strokeStyle = color;
	ctx.stroke();
}

function drawSvgPath(svgpath, color, lineWidth) {
	drawPolyline(svgpath.path, color, lineWidth, false);
	if (svgpath.creationProperties && svgpath.creationProperties.tabs && svgpath.creationProperties.tabs.length > 0) {
		drawPathTabs(svgpath);
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
function _getGridSetup() {
	const width = getOption("workpieceWidth") * viewScale;
	const length = getOption("workpieceLength") * viewScale;
	const topLeft = worldToScreen(0, 0);
	const bottomRight = worldToScreen(width, length);
	const o = worldToScreen(origin.x, origin.y);
	const gridSize = (typeof getOption !== 'undefined' && getOption("gridSize")) ? getOption("gridSize") : 10;
	const grid = gridSize * viewScale * zoomLevel;
	return { topLeft, bottomRight, o, grid, gridSize };
}

// New drawGrid using virtual coordinates
function drawGrid() {
	ctx.beginPath();
	const { topLeft, bottomRight, o, grid } = _getGridSetup();



	// Draw horizontal grid lines (covering negative and positive Y)
	for (var y = o.y; y <= bottomRight.y; y += grid) {
		ctx.moveTo(topLeft.x, y);
		ctx.lineTo(bottomRight.x, y);
	}
	for (var y = o.y; y >= topLeft.y; y -= grid) {
		ctx.moveTo(topLeft.x, y);
		ctx.lineTo(bottomRight.x, y);
	}
	// Draw vertical grid lines (covering negative and positive X)
	for (var x = o.x; x <= bottomRight.x; x += grid) {
		ctx.moveTo(x, topLeft.y);
		ctx.lineTo(x, bottomRight.y);
	}
	for (var x = o.x; x >= topLeft.x; x -= grid) {
		ctx.moveTo(x, topLeft.y);
		ctx.lineTo(x, bottomRight.y);
	}
	ctx.lineWidth = 0.25;
	ctx.strokeStyle = lineColor;
	ctx.stroke();

}




function drawOrigin() {
	ctx.beginPath();
	const { topLeft, bottomRight, o, gridSize } = _getGridSetup();

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
	var numberInterval, numberGrid;

	if (useInches) {
		// Use 1 inch intervals, or fractions for small grids
		var inchSize = MM_PER_INCH * viewScale * zoomLevel;
		if (inchSize >= 30) {
			numberInterval = MM_PER_INCH; // 1 inch
		} else if (inchSize >= 15) {
			numberInterval = MM_PER_INCH / 2; // 1/2 inch
		} else {
			numberInterval = MM_PER_INCH / 4; // 1/4 inch
		}
		numberGrid = numberInterval * viewScale * zoomLevel;
	} else {
		// Metric - use 10mm intervals if grid size is less than 10mm, otherwise use grid size
		numberInterval = gridSize < 10 ? 10 : gridSize;
		numberGrid = numberInterval * viewScale * zoomLevel;
	}

	// Draw Y axis labels (vertical positions)
	var label = 0;
	for (var y = o.y; y <= bottomRight.y; y += numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			var labelText = useInches ? formatDimension(-label, true) : -label;
			ctx.fillText(labelText, o.x + 2, y - 2);
		}
		label += numberInterval;
	}
	label = 0;
	for (var y = o.y; y >= topLeft.y; y -= numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			var labelText = useInches ? formatDimension(-label, true) : -label;
			ctx.fillText(labelText, o.x + 2, y - 2);
		}
		label -= numberInterval;
	}

	// Draw X axis labels (horizontal positions)
	label = 0;
	for (var x = o.x; x <= bottomRight.x; x += numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			var labelText = useInches ? formatDimension(label, true) : label;
			ctx.fillText(labelText, x + 2, o.y - 2);
		}
		label += numberInterval;
	}
	label = 0;
	for (var x = o.x; x >= topLeft.x; x -= numberGrid) {
		if (label !== 0) { // Skip drawing 0 at origin to avoid overlap
			var labelText = useInches ? formatDimension(label, true) : label;
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
	// Recreate static canvas if it doesn't exist or canvas was resized
	if (!staticCanvas || staticCanvas.width !== canvas.width || staticCanvas.height !== canvas.height) {
		staticCanvas = document.createElement('canvas');
		staticCanvas.width = canvas.width;
		staticCanvas.height = canvas.height;
		staticCtx = staticCanvas.getContext('2d');
		staticDirty = true;
	}

	if (staticDirty) {
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
		if (getOption("showGrid") && !(typeof simulation2D !== 'undefined' && (simulation2D.isRunning || simulation2D.isPaused)))
			drawGrid();
		if (getOption("showOrigin"))
			drawOrigin();
		drawToolPaths();
		drawSvgPaths();
		if (typeof window.drawSTLHeightMap === 'function') window.drawSTLHeightMap(ctx);
		if (typeof simulation2D !== 'undefined' && simulation2D.precomputedPoints && simulation2D.precomputedPoints.length > 0)
			drawMaterialRemovalCircles();

		ctx = mainCtx;
		staticDirty = false;
	}

	// Blit static layer then draw dynamic operation overlay
	ctx.drawImage(staticCanvas, 0, 0);
	cncController.draw();
}

// Full redraw — marks static layer dirty and queues a frame
function redraw() {
	staticDirty = true;
	setDirty();
}

// Overlay-only redraw — skips static re-render (use when only the operation overlay changed)
function redrawOverlay() {
	setDirty();
}

function drawWorkpiece() {
	var width = getOption("workpieceWidth") * viewScale;
	var length = getOption("workpieceLength") * viewScale;
	var woodSpecies = getOption("woodSpecies");
	var woodColor = workpieceColor;
	if (typeof woodSpeciesDatabase !== 'undefined' && woodSpeciesDatabase[woodSpecies]) {
		woodColor = woodSpeciesDatabase[woodSpecies].color;
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

function drawSvgPaths() {
	for (var i = 0; i < svgpaths.length; i++) {
		if (svgpaths[i].visible) {
			let path = svgpaths[i];
			if (!selectMgr.isSelected(path))
			{
				if (path.highlight)
					drawSvgPath(path, highlightColor, 3);
				else 	
					drawSvgPath(path, lineColor, 0.5);
			}
		}
	}

	let selectedPaths = selectMgr.selectedPaths();
	for(let i = 0;i<selectedPaths.length;i++)
	{
		let path = selectedPaths[i];

		if(i == selectedPaths.length-1)
			drawSvgPath(path, activeColor, 3);
		else
			drawSvgPath(path, selectColor, 3);		
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
				var isMultiSegment = paths[p].isMultiSegment || false;

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
					// Normal path drawing
					var isMultiSegment = paths[p].isMultiSegment || false;
				drawPolyline(tpath, color, lineWidth, isMultiSegment);
				}
			}
		}
	}

}
