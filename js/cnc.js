// --- Virtual coordinate system for zoom/pan ---
var zoomLevel = .5; // initial zoom
var panX = 0; // will be calculated dynamically by centerWorkpiece()
var panY = 0; // will be calculated dynamically by centerWorkpiece()
var origin = { x: 0, y: 0 }; // origin in virtual coordinates
const selectMgr = Select.getInstance();
window.selectMgr = selectMgr;

var viewScale = 10;
var pixelsPerInch = 72; // 72 for illustrator 96 for inkscape
var svgscale = viewScale * 25.4 / pixelsPerInch;


var toolpathId = 1;
var svgpathId = 1;
var toolpaths = [];
var svgpaths = [];
var nearbypaths = [];
var norms = [];
var undoList = [];
var redoList = [];
var MAX_UNDO = 50;


var scaleFactor = 4;
var offsetX = 0;
var offsetY = 0;
var selectBox = null;

var cncController = new CncController();

cncController.setupEventListeners();

// Keyboard shortcuts
document.addEventListener('keydown', function (evt) {
	// Check if we're in an input field - if so, don't trigger shortcuts
	const tagName = evt.target.tagName.toLowerCase();
	if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
		return;
	}

	const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
	const cmdOrCtrl = isMac ? evt.metaKey : evt.ctrlKey;

	// Ctrl/Cmd + V: Paste
	if (cmdOrCtrl && evt.key === 'v' && !evt.shiftKey) {
		evt.preventDefault();
		doPaste();
		return;
	}

	// Ctrl/Cmd + Z: Undo
	if (cmdOrCtrl && evt.key === 'z' && !evt.shiftKey) {
		evt.preventDefault();
		doUndo();
		return;
	}

	// Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z: Redo
	if (cmdOrCtrl && (evt.key === 'y' || (evt.key === 'z' && evt.shiftKey))) {
		evt.preventDefault();
		doRedo();
		return;
	}

	// Ctrl/Cmd + S: Save project
	if (cmdOrCtrl && evt.key === 's') {
		evt.preventDefault();
		saveProject();
		return;
	}

	// Ctrl/Cmd + O: Open SVG (import)
	if (cmdOrCtrl && evt.key === 'o') {
		evt.preventDefault();
		// Trigger the import SVG action
		if (typeof fileInput !== 'undefined') {
			fileInput.click();
		}
		return;
	}

	// Delete key: Delete selected (but not when PathEdit or TabEditor tool is active)
	if (evt.key === 'Delete' || evt.key === 'Backspace') {
		// Check if PathEdit or TabEditor tool is active - if so, let them handle the delete
		if (typeof cncController !== 'undefined' &&
			cncController.operationManager &&
			cncController.operationManager.currentOperation &&
			(cncController.operationManager.currentOperation.name === 'Edit' ||
			 cncController.operationManager.currentOperation.name === 'Tabs')) {
			// Let PathEdit/TabEditor handle the delete key for deleting points/tabs
			return;
		}

		// Check if there are selected paths
		if (selectMgr.selectedPaths().length > 0) {
			evt.preventDefault();
			deleteSelected();
			return;
		}
	}
});

function clonePath(path) {
	const newPath = structuredClone(path);
	newPath.id = 'S' + svgpathId++;
	if (!newPath.name.includes(' copy'))
		newPath.name += ' copy';
	const offset = (getOption("gridSize") || 10) * viewScale;
	newPath.path = newPath.path.map(pt => ({ x: pt.x + offset, y: pt.y + offset }));
	newPath.bbox = boundingBox(newPath.path);
	return newPath;
}

function doPaste() {
	const paths = selectMgr.selectedPaths();
	if (paths.length === 0) { notify('Select a path to Paste'); return; }
	selectMgr.unselectAll();
	addUndo(false, true, false);
	for (const path of paths) {
		const newPath = clonePath(path);
		svgpaths.push(newPath);
		addSvgPath(newPath.id, newPath.name);
		selectMgr.selectPath(newPath);
	}
	doMove();
	redraw();
}

function toolChanged(tool) {
	for (var i = 0; i < toolpaths.length; i++) {
		if (toolpaths[i].tool.recid == tool.recid)
			toolpaths[i].tool = tool;
	}
	refreshToolPathsDisplay();
	redraw();
}

function setVisibility(id, visible) {
	for (var i = 0; i < svgpaths.length; i++) {
		if (svgpaths[i].id == id) {
			svgpaths[i].visible = visible;
			// Sync STL model visibility
			if (svgpaths[i].creationProperties && svgpaths[i].creationProperties.stlModelId) {
				var stlId = svgpaths[i].creationProperties.stlModelId;
				if (typeof window.updateSTLMeshVisibility3D === 'function') {
					window.updateSTLMeshVisibility3D(stlId, visible);
				}
				var stlModel = window.stlModels && window.stlModels.find(function(m) { return m.id === stlId; });
				if (stlModel) stlModel.visible = visible;
			}
		}
	}
	for (var i = 0; i < toolpaths.length; i++) {
		if (toolpaths[i].id == id) {
			toolpaths[i].visible = visible;
		}
	}
	if (typeof updatePathVisibilityIcon === 'function') {
		updatePathVisibilityIcon(id, visible);
	}
	redraw();
}

function doRemoveToolPath(id) {
	for (var i = 0; i < svgpaths.length; i++) {
		if (svgpaths[i].id == id) {
			// If this svgpath references an STL model, clean it up
			if (svgpaths[i].creationProperties && svgpaths[i].creationProperties.stlModelId) {
				var stlId = svgpaths[i].creationProperties.stlModelId;
				if (typeof window.removeSTLMesh3D === 'function') window.removeSTLMesh3D(stlId);
				if (window.stlModels) {
					window.stlModels = window.stlModels.filter(function(m) { return m.id !== stlId; });
				}
			}
			svgpaths.splice(i, 1);
			removeSvgPath(id);
			break;
		}
	}
	for (var i = toolpaths.length - 1; i >= 0; i--) {
		if (toolpaths[i].id == id || toolpaths[i].tool.name == id) {
			toolpaths.splice(i, 1);
			removeToolPath(id);
		}
	}

	// Refresh the toolpath display to remove empty folders
	if (typeof refreshToolPathsDisplay === 'function') {
		refreshToolPathsDisplay();
	}

	redraw();
}

function deleteSelected() {
	// Get all selected paths and delete them
	const selectedPaths = selectMgr.selectedPaths();
	if (selectedPaths.length === 0) return;

	// Add undo point before deleting
	addUndo(false, true, false);

	// Delete each selected path
	selectedPaths.forEach(path => {
		doRemoveToolPath(path.id);
	});

	selectMgr.unselectAll();

	// Clear transform box so handles don't linger after delete
	var transformOp = cncController && cncController.operationManager && cncController.operationManager.getOperation('Move');
	if (transformOp) {
		transformOp.transformBox = null;
	}

	redraw();
}

function addUndo(toolPathschanged = false, svgPathsChanged = false, originChanged = false, selectedIds = null) {

	if (toolPathschanged || svgPathsChanged || originChanged) {
		// Always capture current selection so undo/redo restores it
		var currentSelectedIds = selectedIds || selectMgr.selectedPaths().map(p => p.id);
		var project = {
			toolpaths: toolPathschanged ? toolpaths : null,
			svgpaths: svgPathsChanged ? svgpaths : null,
			origin: originChanged ? origin : null,
			selectedIds: currentSelectedIds.length > 0 ? currentSelectedIds : null
		};
		pushToStack(undoList, JSON.stringify(project));
		// Clear redo list when a new action is performed
		redoList = [];
	}

}

function pushToStack(stack, item) {
	if (stack.length >= MAX_UNDO) stack.shift();
	stack.push(item);
}

function scopedSnapshot(entry) {
	return JSON.stringify({
		toolpaths: entry.toolpaths !== null ? toolpaths : null,
		svgpaths: entry.svgpaths !== null ? svgpaths : null,
		origin: entry.origin !== null ? origin : null,
		selectedIds: selectMgr.selectedPaths().map(p => p.id)
	});
}

function restoreToolpaths(projectToolpaths) {
	clearToolPaths();
	toolpaths = projectToolpaths;
	toolpathId = 1;
	for (var i = 0; i < toolpaths.length; i++) {
		toolpaths[i].id = 'T' + toolpathId;
		addToolPath('T' + toolpathId, toolpaths[i].operation + ' ' + toolpathId, toolpaths[i].operation, toolpaths[i].tool.name);
		toolpathId++;
	}
}

function restoreSvgpaths(projectSvgpaths, selectedIds) {
	clearSvgPaths();
	selectMgr.unselectAll();
	svgpaths = projectSvgpaths;
	svgpathId = 1;
	var addedTextGroups = {};
	for (var i = 0; i < svgpaths.length; i++) {
		var sp = svgpaths[i];
		// Track highest numeric ID to prevent collisions
		var idMatch = sp.id && sp.id.match(/\d+$/);
		if (idMatch) {
			var num = parseInt(idMatch[0], 10);
			if (num >= svgpathId) svgpathId = num + 1;
		}
		if (sp.textGroupId && !addedTextGroups[sp.textGroupId]) {
			var groupPaths = svgpaths.filter(function(p) { return p.textGroupId === sp.textGroupId; });
			var text = (sp.creationProperties && sp.creationProperties.text) || sp.name;
			addTextGroup(sp.textGroupId, text, groupPaths);
			addedTextGroups[sp.textGroupId] = true;
		} else if (!sp.textGroupId) {
			addSvgPath(sp.id, sp.name);
		}
	}
	if (selectedIds) {
		for (var i = 0; i < svgpaths.length; i++) {
			if (selectedIds.indexOf(svgpaths[i].id) >= 0) {
				selectMgr.selectPath(svgpaths[i]);
			}
		}
	}
}

function restoreProject(project) {
	if (project.origin) origin = project.origin;
	if (project.toolpaths) restoreToolpaths(project.toolpaths);
	if (project.svgpaths) restoreSvgpaths(project.svgpaths, project.selectedIds);
	var editOp = cncController && cncController.operationManager && cncController.operationManager.getOperation('Edit');
	if (editOp) { editOp.originalPathBeforeRadius = null; editOp.originalPathBeforeRadiusId = null; }
	onPathsChanged(null);
}

function doUndo() {
	if (undoList.length == 0) return;
	const entry = JSON.parse(undoList.pop());
	pushToStack(redoList, scopedSnapshot(entry));
	restoreProject(entry);
}

function doRedo() {
	if (redoList.length == 0) return;
	const entry = JSON.parse(redoList.pop());
	pushToStack(undoList, scopedSnapshot(entry));
	restoreProject(entry);
}

/**
 * Central function called after svgpaths have been modified (drag, transform, undo, redo, load).
 * Handles all side effects: STL sync, toolpath regeneration, transform handle refresh, redraw.
 * @param {string[]} [changedPathIds] - IDs of paths that changed. If null, skips toolpath regeneration.
 */
function onPathsChanged(changedPathIds) {
	// Regenerate toolpaths linked to changed paths
	if (changedPathIds && changedPathIds.length > 0 && typeof regenerateToolpathsForPaths === 'function') {
		regenerateToolpathsForPaths(changedPathIds);
	}
	// Remove STL models whose svgpath was removed (e.g. by undo)
	if (typeof window.syncSTLWithSvgPaths === 'function') window.syncSTLWithSvgPaths();
	// Sync surviving STL models to match current svgpath positions
	if (typeof window.syncSTLModels === 'function') window.syncSTLModels();
	// Refresh transform handles if Move tool is active
	var currentOp = cncController.operationManager.getCurrentOperation();
	if (currentOp && currentOp.name === 'Move') {
		if (currentOp.hasSelectedPaths()) {
			currentOp.setupTransformBox();
			currentOp.recoverTotalsFromHistory();
		} else {
			currentOp.transformBox = null;
			currentOp.pivotCenter = null;
		}
	}
	redraw();
}


async function saveProject() {
	var project = {
		toolpaths: toolpaths,
		svgpaths: svgpaths,
		origin: origin,
		tools: tools,
		options: options,
		gcodeProfile: currentGcodeProfile,  // Save the full post-processor profile
		stlModels: typeof window.saveSTLModels === 'function' ? window.saveSTLModels() : null
	};

	var json = JSON.stringify(project);

	// Use the File System Access API if available (modern browsers)
	if ('showSaveFilePicker' in window) {
		try {
			const fileHandle = await window.showSaveFilePicker({
				suggestedName: currentFileName + ".json",
				types: [{
					description: 'JSON files',
					accept: { 'application/json': ['.json'] }
				}]
			});
			const writable = await fileHandle.createWritable();
			await writable.write(json);
			await writable.close();
			notify('Project saved successfully');
			return;
		} catch (err) {
			if (err.name !== 'AbortError') {
				console.error('Error saving file:', err);
				// Continue to fallback method on error
			} else {
				// User cancelled the dialog
				return;
			}
		}
	}

	// Fallback: prompt for filename and use download method
	var filename = prompt("Enter filename for project save:", currentFileName + ".json");
	if (!filename) {
		return; // User cancelled
	}

	// Ensure .json extension
	if (!filename.endsWith('.json')) {
		filename += '.json';
	}

	var blob = new Blob([json], { type: "application/json" });
	var url = URL.createObjectURL(blob);
	var a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
	notify('Project download started');
}

function loadProject(json) {

	newProject();

	var project = JSON.parse(json);
	if (project.origin) origin = project.origin;
	if (project.toolpaths) toolpaths = project.toolpaths;
	if (project.svgpaths) svgpaths = project.svgpaths;

	// Restore tools and options if they exist in the project file
	if (project.tools) {
		tools = project.tools;
		// Update tools display if using Bootstrap layout
		if (typeof refreshToolsGrid === 'function') {
			refreshToolsGrid();
		}

	}

	if (project.options) {
		options = project.options;
		// Update options display if using Bootstrap layout
		if (typeof refreshOptionsDisplay === 'function') {
			refreshOptionsDisplay();
		}

	}

	// Restore G-code post-processor profile
	if (project.gcodeProfile) {
		// First, check if a profile with the same ID exists locally
		var existingProfile = gcodeProfiles.find(p => p.recid === project.gcodeProfile.recid);

		if (existingProfile) {
			// Use the local profile (allows local updates to be applied)
			currentGcodeProfile = existingProfile;
		} else {
			// Profile doesn't exist locally, so add the saved profile to the system
			gcodeProfiles.push(project.gcodeProfile);
			currentGcodeProfile = project.gcodeProfile;
			// Save the updated profiles to localStorage so it persists
			localStorage.setItem('gcodeProfiles', JSON.stringify(gcodeProfiles));
		}

		// Update the G-code profile selector UI to reflect the loaded profile
		if (typeof populateGcodeProfileSelector === 'function') {
			populateGcodeProfileSelector();
		}
	}

	restoreSvgpaths(svgpaths, null);
	restoreToolpaths(toolpaths);

	// Restore STL models from saved data
	if (project.stlModels && typeof window.loadSTLModels === 'function') {
		window.loadSTLModels(project.stlModels);
	}

	cncController.setMode("Select");
	redraw();
}

function newProject() {
	// Stop any running simulations
	if (typeof stopSimulation2D === 'function') {
		stopSimulation2D();
	}
	if (typeof stopSimulation3D === 'function') {
		stopSimulation3D();
	}

	toolpathId = 1;
	svgpathId = 1;
	toolpaths = [];
	svgpaths = [];
	norms = [];
	nearbypaths = [];
	undoList = [];
	clearToolPaths();
	clearSvgPaths();
	if (typeof window.clearSTLModels === 'function') window.clearSTLModels();
	selectMgr.unselectAll();

	// Center the workpiece in the canvas viewport
	centerWorkpiece();
	cncController.setMode("Select");
	loadOptions();
	loadTools();
	const width = getOption("workpieceWidth") * viewScale;
	const length = getOption("workpieceLength") * viewScale;
	const originPosition = getOption("originPosition") || 'middle-center';

	// Calculate origin based on saved position preference
	const originCoords = calculateOriginFromPosition(originPosition, width, length);
	origin.x = originCoords.x;
	origin.y = originCoords.y;

	redraw();
}

function doSelect(id) {
	cncController.setMode("Select");

	for (var i = 0; i < svgpaths.length; i++) {

		if (svgpaths[i].id == id) {
			if (selectMgr.isSelected(svgpaths[i])) selectMgr.unselectPath(svgpaths[i]);
			else selectMgr.selectPath(svgpaths[i]);
			break;
		}
	}
	for (var i = 0; i < toolpaths.length; i++) {
		if (toolpaths[i].id == id) {
			toolpaths[i].selected = !toolpaths[i].selected;
			break;
		}
	}
	redraw();
}

function doProfile() {
	if (currentTool.inside == "inside")
		doProfileCut(false);
	else if (currentTool.inside == "outside")
		doProfileCut(true);
	else
		doCenter();
}

function doProfileCut(outside) {
	if (selectMgr.noSelection()) {
		notify('Select a path to Profile');
		return;
	}

	var name = outside ? 'Outside' : 'Inside';
	setMode(name);
	var radius = vbitRadius(currentTool) * viewScale;
	var numLoops = Math.max(1, Math.floor(currentTool.numLoops || 1));
	var overCutWorld = (currentTool.overCut || 0) * viewScale;
	// For outside: climb = normal direction, conventional = reversed
	// For inside: climb = reversed, conventional = normal direction
	var reverseDirection = outside
		? (currentTool.direction != "climb")
		: (currentTool.direction == "climb");

	let selectedPaths = selectMgr.selectedPaths();
	for (var i = 0; i < selectedPaths.length; i++) {
		var paths = [];
		var svgpath = selectedPaths[i];
		var srcPath = svgpath.path;

		for (var loop = numLoops - 1; loop >= 0; loop--) {
			var offsetAmount = radius + overCutWorld + loop * radius;
			if (offsetAmount <= 0) continue;

			var offsetPaths = offsetPath(srcPath, offsetAmount, outside);

			for (var p = 0; p < offsetPaths.length; p++) {
				var opath = offsetPaths[p];
				var subpath = subdividePath(opath, 2);
				var circles = checkPath(subpath, radius * 0.9);
				var tpath = clipper.JS.Lighten(circles, getOption("tolerance") * viewScale);

				if (reverseDirection) {
					paths.push({ path: reversePath(circles), tpath: reversePath(tpath) });
				} else {
					paths.push({ path: circles, tpath: tpath });
				}
			}
		}
		pushToolPath(paths, name, 'Profile', svgpath.id);
	}
}

function doCenter() {
	if (selectMgr.noSelection()) {
		notify('Select a path to center cut');
		return;
	}

	setMode("Center");
	var radius = vbitRadius(currentTool) * viewScale;
	var numLoops = Math.max(1, Math.floor(currentTool.numLoops || 1));
	var overCutWorld = (currentTool.overCut || 0) * viewScale;
	var name = 'Center';

	let selectedPaths = selectMgr.selectedPaths();
	for (var i = 0; i < selectedPaths.length; i++) {
		var paths = [];
		var svgpath = selectedPaths[i];
		var srcPath = svgpath.path;

		// Distribute loops evenly around the center path, shifted by overCut
		// k=0 is the most inward, k=numLoops-1 is the most outward
		for (var k = 0; k < numLoops; k++) {
			var centerOffset = overCutWorld + (k - (numLoops - 1) / 2.0) * radius;

			var loopPath, circles, tpath;

			if (Math.abs(centerOffset) < 0.001) {
				loopPath = srcPath;
			} else {
				var outward = centerOffset > 0;
				var offsetResult = offsetPath(srcPath, Math.abs(centerOffset), outward);
				loopPath = offsetResult.length > 0 ? offsetResult[0] : srcPath;
			}

			circles = addCircles(loopPath, radius);
			tpath = loopPath;

			if (currentTool.direction != "climb") {
				paths.push({ path: reversePath(circles), tpath: reversePath(tpath) });
			} else {
				paths.push({ path: circles, tpath: tpath });
			}
		}

		pushToolPath(paths, name, 'Profile', svgpath.id);
	}
}

function doOrigin() {
	cncController.setMode("Origin");
}

function doWorkpiece() {
	cncController.setMode("Workpiece");
}

function doPan() {
	cncController.setMode("Pan");
}

function doMove() {
	cncController.setMode("Move");
}

function doEditPoints() {
	cncController.setMode("Edit");
}

function doBoolean() {
	cncController.setMode("Boolean");
}

function doGemini() {
	cncController.setMode("Gemini");
}

function doPen() {
	cncController.setMode("Pen");
	selectMgr.unselectAll();
}

function doShape() {
	cncController.setMode("Shape");
	selectMgr.unselectAll();
}

function doText() {
	cncController.setMode("Text");
}

function doOffset() {
	cncController.setMode("Offset");
}

function doPattern() {
	cncController.setMode("Pattern");
}

function doDrill() {
	// If circular paths are preselected, create helical drill toolpaths directly
	var selected = selectMgr.selectedPaths();
	if (selected.length > 0) {
		var drillOp = cncController.operationManager.getOperation('Drill');
		if (drillOp) {
			for (var i = 0; i < selected.length; i++) {
				var circleInfo = drillOp.detectCircle(selected[i]);
				if (circleInfo) {
					makeHelicalHole(circleInfo, selected[i].id);
				}
			}
		}
		selectMgr.unselectAll();
	}

	// Enter drill mode — handles both path highlighting/helical drill
	// and empty-space peck drilling
	cncController.setMode("Drill");
	setMode("Select");
}

function doTabEditor() {
	cncController.setMode("Tabs");
}

// Liang-Barsky line clipping: clips segment p1-p2 to the axis-aligned rectangle.
// Returns [clippedP1, clippedP2] or null if the segment is entirely outside.
function clipLineToRect(p1, p2, xMin, yMin, xMax, yMax) {
	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	const p = [-dx, dx, -dy, dy];
	const q = [p1.x - xMin, xMax - p1.x, p1.y - yMin, yMax - p1.y];
	let t0 = 0, t1 = 1;
	for (let i = 0; i < 4; i++) {
		if (Math.abs(p[i]) < 1e-10) {
			if (q[i] < 0) return null;
		} else {
			const t = q[i] / p[i];
			if (p[i] < 0) { t0 = Math.max(t0, t); }
			else { t1 = Math.min(t1, t); }
		}
	}
	if (t0 > t1) return null;
	return [
		{ x: p1.x + t0 * dx, y: p1.y + t0 * dy },
		{ x: p1.x + t1 * dx, y: p1.y + t1 * dy }
	];
}

function doSurfacing() {
	setMode("Surfacing");

	const wpWidth = getOption("workpieceWidth") * viewScale;
	const wpLength = getOption("workpieceLength") * viewScale;

	if (!wpWidth || !wpLength) {
		notify('Set up workpiece dimensions first');
		return;
	}

	const radius = toolRadius();
	const stepover = 2 * radius * currentTool.stepover / 100;
	const angle = window.currentToolpathProperties?.angle || 0;

	if (stepover <= 0) {
		notify('Invalid tool or stepover value');
		return;
	}

	const cx = wpWidth / 2;
	const cy = wpLength / 2;

	// Clip bounds: workpiece expanded by one tool radius so the cutter edge
	// reaches exactly to the workpiece boundary on all sides.
	const xMin = -radius, xMax = wpWidth + radius;
	const yMin = -radius, yMax = wpLength + radius;

	// Rotate the clip-region corners by -angle to get the bounding box in which
	// horizontal lines are generated, then rotate each line back by +angle.
	const clipCorners = [
		{ x: xMin, y: yMin }, { x: xMax, y: yMin },
		{ x: xMax, y: yMax }, { x: xMin, y: yMax }
	];
	const rotated = angle !== 0
		? clipCorners.map(p => rotatePoint(p, cx, cy, -angle * Math.PI / 180))
		: clipCorners;

	const minX = Math.min(...rotated.map(p => p.x));
	const maxX = Math.max(...rotated.map(p => p.x));
	const minY = Math.min(...rotated.map(p => p.y));
	const maxY = Math.max(...rotated.map(p => p.y));

	const paths = [];
	let lineIndex = 0;

	for (let y = minY; ; y += stepover) {
		const ly = Math.min(y, maxY);

		// Full-width line in the rotated frame
		let p1 = { x: minX, y: ly };
		let p2 = { x: maxX, y: ly };

		// Rotate back to world orientation
		if (angle !== 0) {
			const rad = angle * Math.PI / 180;
			p1 = rotatePoint(p1, cx, cy, rad);
			p2 = rotatePoint(p2, cx, cy, rad);
		}

		// Clip to workpiece + radius bounds so lines never extend past the stock
		const clipped = clipLineToRect(p1, p2, xMin, yMin, xMax, yMax);
		if (clipped) {
			// Zigzag: alternate direction each pass
			const tpath = lineIndex % 2 === 0 ? clipped : [clipped[1], clipped[0]];
			paths.push({ tpath: tpath });
			lineIndex++;
		}

		if (ly >= maxY) break;
	}

	if (paths.length === 0) {
		notify('Unable to generate surfacing paths');
		return;
	}

	pushToolPath(paths, 'Surfacing', 'Surfacing', null, null);
}

/**
 * Round concave corners of a polygon by offsetting outward then inward.
 * This ensures the CNC tool (with the given radius) can reach all internal corners.
 */
function roundConcaveCorners(path, radius) {
	if (radius <= 0) return path;
	var offset1 = new clipper.ClipperOffset(20, 0.25);
	offset1.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
	var expanded = [];
	offset1.Execute(expanded, radius);
	if (expanded.length === 0) return path;

	var offset2 = new clipper.ClipperOffset(20, 0.25);
	offset2.AddPath(expanded[0], ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
	var result = [];
	offset2.Execute(result, -radius);
	if (result.length === 0) return path;
	result[0].push(result[0][0]); // close path
	return result[0];
}

/**
 * Round convex corners of a polygon by offsetting inward then outward.
 * This ensures the male plug's external corners match the female socket's rounded internal corners.
 */
function roundConvexCorners(path, radius) {
	if (radius <= 0) return path;
	var offset1 = new clipper.ClipperOffset(20, 0.25);
	offset1.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
	var shrunk = [];
	offset1.Execute(shrunk, -radius);
	if (shrunk.length === 0) return path;

	var offset2 = new clipper.ClipperOffset(20, 0.25);
	offset2.AddPath(shrunk[0], ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
	var result = [];
	offset2.Execute(result, radius);
	if (result.length === 0) return path;
	result[0].push(result[0][0]); // close path
	return result[0];
}

/**
 * Compute total travel distance of a closed polygon path.
 */
function computePathPerimeter(path) {
	let len = 0;
	for (let i = 0; i < path.length - 1; i++) {
		let dx = path[i + 1].x - path[i].x;
		let dy = path[i + 1].y - path[i].y;
		len += Math.sqrt(dx * dx + dy * dy);
	}
	return len;
}

/**
 * Subtract islands from a set of result paths and return valid closed fragments.
 * Filters out degenerate fragments (< 3 points or near-zero area).
 */
function subtractIslandsAndFilter(resultPaths, islandPaths, minArea) {
	let validFragments = [];
	for (let r of resultPaths) {
		let remaining = [r];
		for (let island of islandPaths) {
			let clpr = new ClipperLib.Clipper();
			clpr.AddPaths(remaining, ClipperLib.PolyType.ptSubject, true);
			clpr.AddPath(island, ClipperLib.PolyType.ptClip, true);
			let diff = [];
			clpr.Execute(ClipperLib.ClipType.ctDifference, diff,
				ClipperLib.PolyFillType.pftEvenOdd,
				ClipperLib.PolyFillType.pftEvenOdd);
			remaining = diff;
		}
		for (let rem of remaining) {
			if (rem.length < 3) continue;
			if (Math.abs(ClipperLib.Clipper.Area(rem)) < minArea) continue;
			rem.push(rem[0]); // close path
			validFragments.push(rem);
		}
	}
	return validFragments;
}

/**
 * Generate concentric contour passes by repeatedly offsetting inward.
 * Returns an array of closed paths (each already closed with first==last).
 * Array order: [0] = outermost ring, [n] = innermost ring.
 * Respects islands: uses ClipperJS difference to subtract island offsets.
 * Filters out degenerate fragments (< 3 points or near-zero area slivers).
 */
function generateConcentricContours(outerPath, islandPaths, stepover, pocketRadius) {
	let contours = [];   // flat list of contour paths
	let contourLevels = []; // parallel array: level index for each contour
	let currentOuters = [outerPath];
	let minArea = stepover * stepover * 0.1;
	let level = 0;

	while (currentOuters.length > 0) {
		let nextOuters = [];
		for (let outer of currentOuters) {
			contours.push(outer);
			contourLevels.push(level);
			let co = new clipper.ClipperOffset(20, 0.025);
			co.AddPath(outer, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
			let result = [];
			co.Execute(result, -stepover);

			// Subtract islands and collect valid fragments
			let validFragments = subtractIslandsAndFilter(result, islandPaths, minArea);

			// If the full stepover produced no valid children, check if there's
			// uncovered area in the center. The tool at this contour covers
			// pocketRadius inward; if shrinking by pocketRadius still leaves area,
			// add a fill pass at a reduced offset to cover the gap.
			if (validFragments.length === 0 && pocketRadius > 0 && stepover > pocketRadius) {
				let fillCo = new clipper.ClipperOffset(20, 0.025);
				fillCo.AddPath(outer, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
				let fillResult = [];
				fillCo.Execute(fillResult, -pocketRadius);
				validFragments.push(...subtractIslandsAndFilter(fillResult, islandPaths, minArea));
			}

			nextOuters.push(...validFragments);
		}
		currentOuters = nextOuters;
		level++;
	}
	return { contours, contourLevels, levelCount: level };
}

/**
 * Compute total raster travel distance for a set of boundary paths.
 * Generates infill lines and sums all segment lengths.
 */
function computeRasterTravel(boundaries, stepover, pocketRadius, angle) {
	let groups = generateClipperInfill(boundaries, stepover, pocketRadius, angle);
	let totalTravel = 0;
	for (let group of groups) {
		for (let seg of group.paths) {
			if (seg.length >= 2) {
				let dx = seg[1].x - seg[0].x;
				let dy = seg[1].y - seg[0].y;
				totalTravel += Math.sqrt(dx * dx + dy * dy);
			}
		}
	}
	return totalTravel;
}

/**
 * Generate adaptive pocket toolpaths: uses concentric contours for narrow/irregular
 * regions near the boundary and switches to raster infill for large open interiors.
 *
 * Heuristic: at each candidate contour ring, compare the contour perimeter against
 * the actual raster travel distance for that ring's interior. Contours are kept while
 * they are shorter travel than the raster alternative. Once raster becomes shorter,
 * the remainder is filled with raster lines.
 *
 * Contours are emitted inside-to-outside so each pass only removes one stepover width.
 *
 * @param {number} finishingRadius - Radius of a finishing tool that will make a
 *   separate profile pass (world units). If >= pocketRadius the outermost contour
 *   is skipped. Pass 0 when there is no finishing pass.
 */
// Generate raster infill paths, splitting chains where travel crosses islands
function generateRasterInfill(machinedOuter, machinedIslands, islandPaths, switchLevel, stepover, pocketRadius, angle) {
	let rasterOffset = offsetPath(machinedOuter, (switchLevel - 1) * stepover, false);
	if (rasterOffset.length === 0) rasterOffset = [machinedOuter];
	let rasterBoundaries = [rasterOffset[0]];
	for (let island of machinedIslands) {
		rasterBoundaries.push(island);
	}

	let tpaths = generateClipperInfill(rasterBoundaries, stepover, pocketRadius, angle);
	let chains = extractConnectivityChains(tpaths, stepover, angle);

	// Collect obstacle islands for travel-move intersection testing
	const obstacleIslands = machinedIslands.slice();
	for (let p of islandPaths) {
		obstacleIslands.push(p);
	}

	const infillPaths = [];
	for (let chain of chains) {
		let currentPath = [];
		let segCount = 0;
		for (let si = 0; si < chain.segments.length; si++) {
			let segment = chain.segments[si];
			if (currentPath.length > 0 && obstacleIslands.length > 0) {
				let lastPt = currentPath[currentPath.length - 1];
				let nextPt = segment[0];
				let crosses = false;
				for (let island of obstacleIslands) {
					if (lineIntersectsPath(lastPt, nextPt, island) > 0) {
						crosses = true;
						break;
					}
				}
				if (crosses) {
					infillPaths.push({
						tpath: currentPath,
						isContour: false,
						isChain: true,
						passStart: true,
						sourceY: chain.startY,
						segmentCount: segCount
					});
					currentPath = [];
					segCount = 0;
				}
			}
			currentPath.push(...segment);
			segCount++;
		}
		if (currentPath.length > 0) {
			infillPaths.push({
				tpath: currentPath,
				isContour: false,
				isChain: true,
				passStart: true,
				sourceY: chain.startY,
				segmentCount: segCount
			});
		}
	}

	return optimizeChainOrder(infillPaths);
}

// Find the contour level at which raster fill becomes more efficient than continuing
// with concentric contours. Returns the level index at which to switch (default: totalLevels).
function computeAdaptiveSwitchLevel(allContours, contourLevels, totalLevels, machinedOuter, machinedIslands, stepover, pocketRadius, angle) {
	for (let lvl = 1; lvl < totalLevels; lvl++) {
		// Sum perimeters of all fragments at this level
		let levelPerimeter = 0;
		for (let i = 0; i < allContours.length; i++) {
			if (contourLevels[i] === lvl) {
				levelPerimeter += computePathPerimeter(allContours[i]);
			}
		}
		if (levelPerimeter <= 0) continue;

		// Compute raster travel for this level's interior
		let rasterOuter = offsetPath(machinedOuter, lvl * stepover, false);
		if (rasterOuter.length === 0) continue;
		let rasterBoundaries = [rasterOuter[0], ...machinedIslands];

		let rasterTravel = computeRasterTravel(rasterBoundaries, stepover, pocketRadius, angle);
		if (rasterTravel > 0 && rasterTravel < levelPerimeter) {
			return lvl;
		}
	}
	return totalLevels; // default: all contours, no raster
}

function generatePocketPaths(outerPath, islandPaths, pocketRadius, stepover, angle, direction, finishingRadius, strategy) {
	if (!strategy) strategy = 'adaptive';

	// First offset inward/outward by tool radius to get the machinable boundaries
	let outerOffset = offsetPath(outerPath, pocketRadius, false);
	if (outerOffset.length === 0) return [];
	let machinedOuter = outerOffset[0];

	let machinedIslands = [];
	for (let p of islandPaths) {
		let islandOffset = offsetPath(p, pocketRadius, true);
		if (islandOffset.length === 0) continue;
		machinedIslands.push(islandOffset[0]);
	}

	// Generate concentric contour rings from the machined boundary inward
	// Returns { contours, contourLevels, levelCount }
	let contourData = generateConcentricContours(machinedOuter, machinedIslands, stepover, pocketRadius);
	let allContours = contourData.contours;
	let contourLevels = contourData.contourLevels;
	let totalLevels = contourData.levelCount;

	// Decide where to switch from contour to raster based on strategy
	let switchLevel;
	if (strategy === 'raster') {
		// Switch to raster immediately after the first contour level (boundary pass)
		switchLevel = 1;
	} else if (strategy === 'contour') {
		// Never switch to raster — use contours all the way
		switchLevel = totalLevels;
	} else {
		switchLevel = computeAdaptiveSwitchLevel(allContours, contourLevels, totalLevels, machinedOuter, machinedIslands, stepover, pocketRadius, angle);
	}

	// Build contour paths: inside-to-outside so each pass only cuts one stepover width.
	// Only skip outermost level (level 0) if the finishing tool is large enough to cover it
	// AND there are deeper levels or raster to actually clear the interior.
	let skipOutermost = (finishingRadius >= pocketRadius) && (totalLevels > 1 || switchLevel < totalLevels);
	let startLevel = skipOutermost ? 1 : 0;

	// Group contour fragments by level (inside-to-outside order).
	// Optimize within each level for minimal travel, but preserve level ordering
	// so clearing always proceeds from the innermost contour outward.
	let contoursByLevel = {};
	for (let lvl = switchLevel - 1; lvl >= startLevel; lvl--) {
		let levelPaths = [];
		for (let i = 0; i < allContours.length; i++) {
			if (contourLevels[i] !== lvl) continue;
			let contour = allContours[i].slice();
			if (direction == "climb") contour = reversePath(contour);
			levelPaths.push({ tpath: contour, isContour: true, passStart: true });
		}
		if (levelPaths.length > 0) {
			contoursByLevel[lvl] = levelPaths;
		}
	}

	// Add island contours to the outermost level (cut last with boundary)
	if (!skipOutermost) {
		if (!contoursByLevel[startLevel]) contoursByLevel[startLevel] = [];
		for (let island of machinedIslands) {
			let islandContour = island.slice();
			if (direction != "climb") islandContour = reversePath(islandContour);
			contoursByLevel[startLevel].push({ tpath: islandContour, isContour: true, passStart: true });
		}
	}

	// Build ordered contour lists: inner levels and outermost level separately.
	// Optimize path order within each level but keep level ordering strict (inside-to-outside).
	let innerContours = [];
	let outerContours = contoursByLevel[startLevel] ? optimizePathListOrder(contoursByLevel[startLevel]) : [];
	for (let lvl = switchLevel - 1; lvl > startLevel; lvl--) {
		if (contoursByLevel[lvl]) {
			innerContours.push(...optimizePathListOrder(contoursByLevel[lvl]));
		}
	}

	// Generate raster infill for the remaining interior (from switchLevel inward).
	if (switchLevel < totalLevels) {
		let infillPaths = generateRasterInfill(machinedOuter, machinedIslands, islandPaths, switchLevel, stepover, pocketRadius, angle);
		// Raster infill is innermost, then inner contours, then outer boundary last.
		let result = [...infillPaths, ...innerContours, ...outerContours];
		return eliminateUnnecessaryRetracts(result, machinedIslands, islandPaths, machinedOuter, outerPath);
	}

	// Pure contour mode (no raster needed for small/narrow pockets)
	// Inner contours first (inside-to-outside), then outermost boundary last.
	let result = [...innerContours, ...outerContours];
	return eliminateUnnecessaryRetracts(result, machinedIslands, islandPaths, machinedOuter, outerPath);
}

/**
 * Mark consecutive paths as passStart:false when the travel between them
 * stays inside the pocket and doesn't cross any island, allowing direct feed
 * instead of retract/plunge. A travel that exits the outer boundary (e.g.
 * across the gap between the upper legs of an H-shaped pocket) must retract.
 */
function eliminateUnnecessaryRetracts(paths, machinedIslands, originalIslands, machinedOuter, originalOuter) {
	if (paths.length <= 1) return paths;

	// Island obstacles: travel that crosses any of these must retract
	let islandObstacles = [];
	if (machinedIslands) islandObstacles.push(...machinedIslands);
	if (originalIslands) islandObstacles.push(...originalIslands);

	// Outer boundaries: travel that exits any of these is leaving the pocket
	let outerBoundaries = [];
	if (machinedOuter) outerBoundaries.push(machinedOuter);
	if (originalOuter) outerBoundaries.push(originalOuter);

	for (let i = 1; i < paths.length; i++) {
		if (!paths[i].passStart) continue;
		let prevPath = paths[i - 1].tpath;
		let currPath = paths[i].tpath;
		if (!prevPath || !currPath || prevPath.length === 0 || currPath.length === 0) continue;

		let endPt = prevPath[prevPath.length - 1];
		let startPt = currPath[0];

		// Travel crosses an island → unsafe
		let unsafe = false;
		for (let island of islandObstacles) {
			if (lineIntersectsPath(endPt, startPt, island) > 0) {
				unsafe = true;
				break;
			}
		}
		// Travel exits the pocket outer boundary → unsafe
		if (!unsafe) {
			for (let outer of outerBoundaries) {
				if (lineIntersectsPath(endPt, startPt, outer) > 0) {
					unsafe = true;
					break;
				}
			}
		}

		if (!unsafe) {
			paths[i] = { ...paths[i], passStart: false };
		}
	}

	return paths;
}

/**
 * Optimize the order of path groups using nearest-neighbor on group start points.
 * Each group's internal path order is preserved (already optimized per-shape).
 * Groups are reordered so the tool moves geographically between shapes.
 */
function optimizeGroupOrder(groups) {
	if (groups.length === 0) return [];
	if (groups.length === 1) return groups[0];
	// Build index with start point of each group
	let remaining = groups.map((g, i) => {
		let p = g[0].tpath[0];
		return { idx: i, x: p.x, y: p.y };
	});
	let ordered = [];
	// Start with group nearest to origin
	remaining.sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y));
	let current = remaining.shift();
	ordered.push(...groups[current.idx]);
	while (remaining.length > 0) {
		// Find nearest group start to end of last path in current result
		let lastPath = ordered[ordered.length - 1].tpath;
		let endPt = lastPath[lastPath.length - 1];
		let bestIdx = 0;
		let bestDist = Infinity;
		for (let i = 0; i < remaining.length; i++) {
			let dx = remaining[i].x - endPt.x;
			let dy = remaining[i].y - endPt.y;
			let d = dx * dx + dy * dy;
			if (d < bestDist) { bestDist = d; bestIdx = i; }
		}
		current = remaining.splice(bestIdx, 1)[0];
		ordered.push(...groups[current.idx]);
	}
	return ordered;
}

/**
 * Compute a V-bit profile along a path using the inscribed circle (V-carve) algorithm.
 * Returns {path: circles, tpath: simplified} with per-point .r for variable-depth G-code,
 * or null if no valid profile could be computed.
 *
 * @param {Array} path - The design path to profile
 * @param {Array} allPaths - All design paths (used as boundaries for inscribed circle computation)
 * @param {number} maxRadius - Maximum inscribed circle radius (= reach at flat depth) in world units
 * @param {boolean} outside - true for outside profile (plug outers), false for inside (socket outers)
 * @param {string} direction - 'climb' or 'conventional'
 */
function computeVbitInlayProfile(path, allPaths, maxRadius, outside, direction) {
	// Set up nearbypaths global for inscribed circle computation
	nearbypaths = allPaths.map(p => ({ path: p }));

	var subpath = subdividePath(path, 2);
	var cw = isClockwise(path);
	if (outside) cw = !cw;

	var norms = makeNorms(subpath, path, cw, 1, outside);

	if (norms.length === 0) return null;

	// Add fan normals at sharp convex corners for outside profiling only,
	// so the V-bit traces around outside corners (e.g. star tips on the plug)
	// instead of cutting across them. Inside profiling doesn't need this —
	// the bisector normal naturally reaches into narrow features.
	if (outside) {
		norms = addCornerFanNormals(norms, subpath, outside);
	}

	var circles = largestEmptyCircles(norms, maxRadius, subpath);

	if (circles.length === 0) return null;

	var tpath = clipper.JS.Lighten(circles, getOption("tolerance") * viewScale);

	// Apply direction (same logic as computeVcarve)
	if (outside) {
		if (direction != "climb") {
			circles = reversePath(circles);
			tpath = reversePath(tpath);
		}
	} else {
		if (direction == "climb") {
			circles = reversePath(circles);
			tpath = reversePath(tpath);
		}
	}

	return { path: circles, tpath: tpath };
}

/**
 * At sharp corners, makeNorms generates only one normal (the bisector),
 * which causes the V-bit path to cut across the corner rather than tracing
 * around it. This function inserts additional "fan" normals that sweep
 * between the two edge normals at each sharp corner.
 */
function addCornerFanNormals(norms, subpath, outside) {
	if (norms.length < 3) return norms;

	var augmented = [];
	var fanThreshold = Math.PI / 6; // 30° — add fans for corners sharper than this
	var fanStep = Math.PI / 18;     // 10° per fan normal

	for (var i = 0; i < norms.length; i++) {
		augmented.push(norms[i]);

		var next = norms[(i + 1) % norms.length];
		var n1 = norms[i];

		// Angle between consecutive normals
		var dot = n1.dx * next.dx + n1.dy * next.dy;
		dot = Math.max(-1, Math.min(1, dot));
		var angle = Math.acos(dot);

		if (angle <= fanThreshold) continue;

		// Determine turn direction using cross product
		var cross = n1.dx * next.dy - n1.dy * next.dx;

		// For outside profiling: fan convex corners (cross > 0 for CCW paths)
		// For inside profiling: fan concave corners (cross < 0 for CCW paths)
		// In both cases, the fan fills the gap in the V-bit path
		var steps = Math.ceil(angle / fanStep);

		// Corner point: midpoint between the two norm origins
		var cx = (n1.x1 + next.x1) / 2;
		var cy = (n1.y1 + next.y1) / 2;
		// If the origins are very close (same corner point), use the exact position
		var dist = Math.sqrt((next.x1 - n1.x1) * (next.x1 - n1.x1) + (next.y1 - n1.y1) * (next.y1 - n1.y1));
		if (dist < 4) { // Close enough to be the same corner
			cx = next.x1;
			cy = next.y1;
		}

		for (var s = 1; s < steps; s++) {
			var t = s / steps;

			// Spherical linear interpolation of the normal direction
			var sinAngle = Math.sin(angle);
			if (sinAngle < 0.001) continue;
			var w1 = Math.sin((1 - t) * angle) / sinAngle;
			var w2 = Math.sin(t * angle) / sinAngle;
			var dx = w1 * n1.dx + w2 * next.dx;
			var dy = w1 * n1.dy + w2 * next.dy;
			var len = Math.sqrt(dx * dx + dy * dy);
			if (len < 0.001) continue;
			dx /= len;
			dy /= len;

			// Interpolate the origin position along the path
			var ox = n1.x1 * (1 - t) + next.x1 * t;
			var oy = n1.y1 * (1 - t) + next.y1 * t;
			// For tight corners, use the corner point
			if (dist < 4) { ox = cx; oy = cy; }

			var pt = { x: ox + dx, y: oy + dy };
			var valid = outside ? !pointInPolygon(pt, subpath) : pointInPolygon(pt, subpath);

			if (valid) {
				augmented.push({
					x1: ox, y1: oy,
					x2: pt.x, y2: pt.y,
					dx: dx, dy: dy
				});
			}
		}
	}

	return augmented;
}

/**
 * Generate V-bit passes along corner bisectors to clear the triangular zones
 * at sharp corners that the main profile pass and end mill pocket both miss.
 * At distance d along the inward bisector from a corner vertex, the inscribed
 * circle radius is d * sin(halfInteriorAngle). The pass goes from the vertex
 * (shallow) to where the radius reaches fullReach (full depth).
 */
function generateCornerBisectorPasses(path, fullReach, direction) {
	var cornerThreshold = 10 * Math.PI / 180; // 10° — skip nearly-straight corners
	var stepSize = 0.5; // world units between sample points along bisector
	var passes = [];

	// Work with the un-subdivided path for clean corner detection
	for (var i = 0; i < path.length - 1; i++) { // path is closed: last == first
		var prev = path[(i + path.length - 2) % (path.length - 1)];
		var curr = path[i];
		var next = path[(i + 1) % (path.length - 1)];

		// Edge vectors
		var e1x = prev.x - curr.x;
		var e1y = prev.y - curr.y;
		var e2x = next.x - curr.x;
		var e2y = next.y - curr.y;
		var len1 = Math.sqrt(e1x * e1x + e1y * e1y);
		var len2 = Math.sqrt(e2x * e2x + e2y * e2y);
		if (len1 < 0.001 || len2 < 0.001) continue;
		e1x /= len1; e1y /= len1;
		e2x /= len2; e2y /= len2;

		// Interior angle between the two edges meeting at this vertex
		var cross = e1x * e2y - e1y * e2x;
		var dot = e1x * e2x + e1y * e2y;
		var interiorAngle = Math.atan2(Math.abs(cross), dot);
		// Skip nearly-straight corners (exterior angle < threshold)
		if (Math.PI - interiorAngle < cornerThreshold) continue;

		var halfInterior = interiorAngle / 2;
		var sinHalf = Math.sin(halfInterior);
		if (sinHalf < 0.01) continue;

		// Bisector direction: average of the two normalized edge vectors
		var bx = e1x + e2x;
		var by = e1y + e2y;
		var blen = Math.sqrt(bx * bx + by * by);
		if (blen < 0.001) continue;
		bx /= blen;
		by /= blen;

		// Ensure bisector points inward (into the polygon)
		var testDist = 2;
		var testPt = { x: curr.x + bx * testDist, y: curr.y + by * testDist };
		if (!pointInPolygon(testPt, path)) {
			bx = -bx;
			by = -by;
		}

		// Extend 40% past the intersection to ensure full corner clearing.
		// Keep the original slope (r = d * sinHalf) so the bit cuts deeper
		// past fullReach rather than flattening out — the plug covers any overcut.
		var maxDist = (fullReach / sinHalf) * 1.4;

		// Generate points along bisector from vertex to maxDist
		var bisectorPoints = [];
		for (var d = 0; d <= maxDist; d += stepSize) {
			var px = curr.x + bx * d;
			var py = curr.y + by * d;
			var r = d * sinHalf;
			bisectorPoints.push({ x: px, y: py, r: r });
		}
		// Ensure we include the endpoint at maxDist
		var lastD = 0;
		if (bisectorPoints.length > 0) {
			var _ldx = bisectorPoints[bisectorPoints.length - 1].x - curr.x;
			var _ldy = bisectorPoints[bisectorPoints.length - 1].y - curr.y;
			lastD = Math.sqrt(_ldx * _ldx + _ldy * _ldy);
		}
		if (maxDist - lastD > stepSize * 0.1) {
			bisectorPoints.push({ x: curr.x + bx * maxDist, y: curr.y + by * maxDist, r: maxDist * sinHalf });
		}

		if (bisectorPoints.length < 2) continue;

		// Build path: go in (shallow to deep) then retrace out (deep to shallow)
		var fullPath = bisectorPoints.slice();
		for (var j = bisectorPoints.length - 2; j >= 0; j--) {
			fullPath.push({ x: bisectorPoints[j].x, y: bisectorPoints[j].y, r: bisectorPoints[j].r });
		}

		// Apply direction
		if (direction === "climb") {
			fullPath = fullPath.reverse();
		}

		var tpath = clipper.JS.Lighten(fullPath, getOption("tolerance") * viewScale);
		if (tpath.length < 2) tpath = fullPath.slice();

		passes.push({ path: fullPath, tpath: tpath });
	}

	return passes;
}

/**
 * V-bit inlay: generates socket or plug toolpaths using V-carve algorithm
 * to preserve sharp design features. The V-bit's variable depth naturally
 * handles narrow features (star points, serifs) where an end mill can't reach.
 */
// V-bit inlay female socket: V-carve profiles inside boundaries + end mill pocket
function generateVbitInlaySocket(inputPaths, depths, allOuters, fullReach, pocketRadius, stepover, rasterAngle, direction, vcarveGroups, pocketGroups, finishingTool, selectedSvgIds, vcarveStrategy) {
	for (let oi = 0; oi < allOuters.length; oi++) {
		let outerPath = allOuters[oi];
		let outerIdx = inputPaths.indexOf(outerPath);
		let outerDepth = depths[outerIdx];
		let islandPaths = [];
		for (let j = 0; j < inputPaths.length; j++) {
			if (depths[j] === outerDepth + 1 && pathIn(outerPath, inputPaths[j])) {
				islandPaths.push(inputPaths[j]);
			}
		}

		if (vcarveStrategy === 'center') {
			// Use medial axis algorithm for V-carve (better for text/letters)
			var savedTool = window.currentTool;
			window.currentTool = finishingTool;
			var maxRadius = vbitRadius(finishingTool) * viewScale;

			let descritize_threshold = 1e-1;
			let descritize_method = 2;
			let filtering_angle = 7 * Math.PI / 8;
			let holes = islandPaths.length > 0 ? islandPaths : [];
			let segments = JSPoly.construct_medial_axis(outerPath, holes,
				descritize_threshold, descritize_method, filtering_angle, -1, 0,
				{ no_parabola: false, show_sites: false }, null);

			segments = pruneNoisyBranches(segments, outerPath, holes, maxRadius);

			var circles = [];
			for (var si = 0; si < segments.length; si++) {
				var seg = segments[si];
				circles.push({ x: seg.point0.x, y: seg.point0.y, r: Math.min(seg.point0.radius, maxRadius) });
				circles.push({ x: seg.point1.x, y: seg.point1.y, r: Math.min(seg.point1.radius, maxRadius) });
			}
			circles = clipper.JS.Lighten(circles, getOption("tolerance") * viewScale);

			var tpath = findBestPath(segments).toolpath;
			for (var p of tpath) {
				p.r = Math.min(p.r, maxRadius);
			}

			if (tpath.length > 0) {
				vcarveGroups.push([{ path: circles, tpath: tpath }]);
			}

			window.currentTool = savedTool;
		} else {
			// Profile-based V-carve (better for simple polygons)
			let outerProfile = computeVbitInlayProfile(outerPath, inputPaths, fullReach, false, direction);
			if (outerProfile) vcarveGroups.push([outerProfile]);

			// Corner bisector passes for the outer boundary (clears uncut corner triangles)
			let outerCornerPasses = generateCornerBisectorPasses(outerPath, fullReach, direction);
			for (let pass of outerCornerPasses) {
				vcarveGroups.push([pass]);
			}

			// V-bit profile outside each island
			for (let island of islandPaths) {
				let islandProfile = computeVbitInlayProfile(island, inputPaths, fullReach, true, direction);
				if (islandProfile) vcarveGroups.push([islandProfile]);
			}
		}

		// End mill roughing: pocket the flat bottom area, inset by fullReach from design edges
		// (only needed for profile strategy - center strategy V-bit handles the full shape)
		if (vcarveStrategy !== 'center') {
			let pocketOuter = offsetPath(outerPath, fullReach, false);
			let pocketIslands = islandPaths.map(p => {
				let off = offsetPath(p, fullReach, true);
				return off.length > 0 ? off[0] : null;
			}).filter(p => p);

			if (pocketOuter.length > 0) {
				let pocketPaths = generatePocketPaths(pocketOuter[0], pocketIslands, pocketRadius, stepover, rasterAngle, direction, 0);
				if (pocketPaths.length > 0) pocketGroups.push(pocketPaths);
			}
		}
	}
}

/**
 * Build a closed outer boundary by computing the convex hull of all points in
 * allClearanceOuters, then offsetting outward by expand.
 * Returns the closed boundary path, or null if the offset produced nothing.
 */
function buildExpandedHullBoundary(allClearanceOuters, expand) {
	let allPts = [];
	for (let co of allClearanceOuters) {
		for (let pt of co) allPts.push({ x: pt.x, y: pt.y });
	}
	let hull = convexHull(allPts);
	let expanded = offsetPath(hull, expand, true);
	if (expanded.length === 0) return null;
	let outerBoundary = expanded[0];
	if (outerBoundary.length > 0 &&
		(outerBoundary[0].x !== outerBoundary[outerBoundary.length - 1].x ||
		 outerBoundary[0].y !== outerBoundary[outerBoundary.length - 1].y)) {
		outerBoundary.push({ x: outerBoundary[0].x, y: outerBoundary[0].y });
	}
	return outerBoundary;
}

/**
 * If cutOut is true, offsets outerBoundary inward by pocketRadius and pushes
 * a cutout contour entry into cutOutGroups.
 */
function appendCutOutGroup(cutOut, outerBoundary, pocketRadius, direction, pocketingTool, cutOutGroups) {
	if (!cutOut) return;
	let materialDepth = (typeof getOption === 'function' ? getOption('workpieceThickness') : null) || pocketingTool.depth;
	let cutOutOffset = offsetPath(outerBoundary, pocketRadius, false);
	if (cutOutOffset.length > 0) {
		let cutOutContour = cutOutOffset[0].slice();
		if (direction == "climb") cutOutContour = reversePath(cutOutContour);
		cutOutGroups.push([{ tpath: cutOutContour, isContour: true, cutOutDepth: materialDepth }]);
	}
}

/**
 * For every odd-depth clearance path, collect even-depth children as sub-islands
 * and generate a pocket, appending results into pocketPaths.
 * pathTransform(path) → transformed path (or null to skip); pass null to use paths as-is.
 */
function pocketOddDepthIslands(clearancePaths, inputPaths, pocketRadius, stepover, angle, direction, finishRadius, pocketPaths, pathTransform) {
	const transform = pathTransform || (p => p);
	for (let cp of clearancePaths) {
		if (cp.depth % 2 !== 1) continue;
		let subIslands = [];
		for (let cp2 of clearancePaths) {
			if (cp2.depth === cp.depth + 1 && pathIn(inputPaths[cp.idx], inputPaths[cp2.idx])) {
				let sub = transform(cp2.path);
				if (sub) subIslands.push(sub);
			}
		}
		let boundary = transform(cp.path);
		if (boundary) {
			let islandPocket = generatePocketPaths(boundary, subIslands, pocketRadius, stepover, angle, direction, finishRadius);
			pocketPaths.push(...islandPocket);
		}
	}
}

/**
 * Build clearance-adjusted path entries for each input path.
 * isRaised paths (even depth) are shrunk inward; islands (odd depth) are expanded outward.
 * prepPath(path, isRaised) → base path before offset; pass null to use inputPaths[i] as-is.
 */
function buildClearancePaths(inputPaths, depths, clearance, joinType, prepPath) {
	let clearancePaths = [];
	for (let i = 0; i < inputPaths.length; i++) {
		let isRaised = (depths[i] % 2 === 0);
		let base = prepPath ? prepPath(inputPaths[i], isRaised) : inputPaths[i];
		let adjusted = base;
		if (clearance > 0) {
			let co = new clipper.ClipperOffset(20, 0.25);
			co.AddPath(base, joinType, ClipperLib.EndType.etClosedPolygon);
			let cr = [];
			co.Execute(cr, isRaised ? -clearance : clearance);
			if (cr.length > 0) { cr[0].push(cr[0][0]); adjusted = cr[0]; }
		}
		clearancePaths.push({ path: adjusted, depth: depths[i], idx: i });
	}
	return clearancePaths;
}

// V-bit inlay male plug: V-carve profiles outside shapes + end mill clearing + optional cutout
function generateVbitInlayPlug(inputPaths, depths, clearance, plugReach, pocketingTool, pocketRadius, stepover, rasterAngle, direction, cutOut, vcarveGroups, pocketGroups, cutOutGroups) {
	let expand = 2 * pocketingTool.diameter * viewScale;

	// Build clearance-adjusted paths (shrink outers, expand islands)
	let clearancePaths = buildClearancePaths(inputPaths, depths, clearance, ClipperLib.JoinType.jtMiter, null);

	let allClearanceOuters = clearancePaths.filter(c => c.depth === 0).map(c => c.path);
	let allAdjustedPaths = clearancePaths.map(c => c.path);

	// V-bit profile outside each raised shape
	for (let cp of clearancePaths) {
		let isRaised = (cp.depth % 2 === 0);
		let profile = computeVbitInlayProfile(cp.path, allAdjustedPaths, plugReach, isRaised, direction);
		if (profile) vcarveGroups.push([profile]);
	}

	// Convex hull for outer boundary
	let outerBoundary = buildExpandedHullBoundary(allClearanceOuters, expand);
	if (!outerBoundary) return { vcarveGroups: [], pocketGroups: [], cutOutGroups: [] };

	// End mill roughing: clear area between hull and design shapes
	let pocketIslands = allClearanceOuters.map(p => {
		let off = offsetPath(p, plugReach, true);
		return off.length > 0 ? off[0] : null;
	}).filter(p => p);

	let pocketPaths = generatePocketPaths(outerBoundary, pocketIslands, pocketRadius, stepover, rasterAngle, direction, 0);

	// Also pocket inside each odd-depth (island) shape
	pocketOddDepthIslands(clearancePaths, inputPaths, pocketRadius, stepover, rasterAngle, direction, 0, pocketPaths,
		path => { let off = offsetPath(path, plugReach, false); return off.length > 0 ? off[0] : null; });

	if (pocketPaths.length > 0) pocketGroups.push(pocketPaths);

	// Optional cutout
	appendCutOutGroup(cutOut, outerBoundary, pocketRadius, direction, pocketingTool, cutOutGroups);
}

function doVbitInlay(inputPaths, depths, allOuters, allIslands, props, pocketingTool, finishingTool, selectedSvgIds) {
	const inlayType = props?.inlayType || 'female';
	const clearanceMM = props?.clearance || 0.1;
	const clearance = clearanceMM * viewScale;
	const cutOut = props?.cutOut || false;
	const glueGapMM = props?.glueGap || 0.5;
	const direction = pocketingTool.direction || 'climb';

	const pocketRadius = pocketingTool.diameter / 2 * viewScale;
	const stepover = 2 * pocketRadius * pocketingTool.stepover / 100;
	const rasterAngle = props?.angle || 0;

	// V-bit geometry
	const vbitAngle = finishingTool.angle || 60;
	const halfAngleRad = (vbitAngle / 2) * Math.PI / 180;
	const flatDepthMM = pocketingTool.depth;
	const flatDepth = flatDepthMM * viewScale;
	const fullReach = flatDepth * Math.tan(halfAngleRad);

	// For plug: reduce reach to account for glue gap (shallower effective depth)
	const plugDepthMM = Math.max(0.1, flatDepthMM - glueGapMM);
	const plugDepth = plugDepthMM * viewScale;
	const plugReach = plugDepth * Math.tan(halfAngleRad);

	let pocketGroups = [];
	let vcarveGroups = [];
	let cutOutGroups = [];

	const vcarveStrategy = props?.vcarveStrategy || 'profile';
	if (inlayType === 'female') {
		generateVbitInlaySocket(inputPaths, depths, allOuters, fullReach, pocketRadius, stepover, rasterAngle, direction, vcarveGroups, pocketGroups, finishingTool, selectedSvgIds, vcarveStrategy);
	} else {
		generateVbitInlayPlug(inputPaths, depths, clearance, plugReach, pocketingTool, pocketRadius, stepover, rasterAngle, direction, cutOut, vcarveGroups, pocketGroups, cutOutGroups);
	}

	// Push toolpaths
	const depthMM = pocketingTool.depth;
	const typeName = inlayType === 'female' ? 'Socket' : 'Plug';

	let allPocketPaths = optimizeGroupOrder(pocketGroups);
	if (allPocketPaths.length > 0) {
		window.currentTool = { ...pocketingTool };
		pushToolPath(allPocketPaths, `Inlay ${typeName}`, 'Inlay', null, selectedSvgIds, `${depthMM}mm ${typeName}`);
	}

	let allVcarvePaths = optimizeGroupOrder(vcarveGroups);
	if (allVcarvePaths.length > 0) {
		window.currentTool = { ...finishingTool, depth: inlayType === 'female' ? flatDepthMM : plugDepthMM };
		pushToolPath(allVcarvePaths, `Inlay ${typeName} VCarve`, 'Inlay', null, selectedSvgIds, `${depthMM}mm ${typeName} VCarve`);
	}

	let allCutOutPaths = optimizeGroupOrder(cutOutGroups);
	if (allCutOutPaths.length > 0) {
		let materialDepth = allCutOutPaths[0].cutOutDepth;
		let cleanCutOutPaths = allCutOutPaths.map(p => ({ tpath: p.tpath, isContour: p.isContour }));
		window.currentTool = { ...pocketingTool, depth: materialDepth };
		pushToolPath(cleanCutOutPaths, 'Inlay Plug Cutout', 'Inlay', null, selectedSvgIds, `${depthMM}mm Plug Cutout`);
	}

	window.currentTool = pocketingTool;
}

// Compute nesting depth for each path using even-odd rule.
// Depth 0 = outermost boundary, depth 1 = island, depth 2 = hole in island, etc.
function computeNestingDepths(inputPaths) {
	let depths = [];
	for (let i = 0; i < inputPaths.length; i++) {
		let depth = 0;
		for (let j = 0; j < inputPaths.length; j++) {
			if (i === j) continue;
			if (pathIn(inputPaths[j], inputPaths[i])) {
				depth++;
			}
		}
		depths.push(depth);
	}
	return depths;
}

// Generate female socket pocket and profile paths for one outer shape
function generateInlayFemalePaths(outerPath, islandPaths, pocketRadius, finishRadius, stepover, angle, direction, pocketGroups, profileGroups) {
	let roundedOuter = roundConvexCorners(roundConcaveCorners(outerPath, finishRadius), finishRadius);
	let roundedIslands = islandPaths.map(p => roundConcaveCorners(roundConvexCorners(p, finishRadius), finishRadius));

	let pocketPaths = generatePocketPaths(roundedOuter, roundedIslands, pocketRadius, stepover, angle, direction, finishRadius);
	if (pocketPaths.length > 0) pocketGroups.push(pocketPaths);

	// Finishing profile (inside the rounded path)
	let shapeProfPaths = [];
	let profileOffset = offsetPath(roundedOuter, finishRadius, false);
	if (profileOffset.length > 0) {
		let profileContour = profileOffset[0].slice();
		if (direction == "climb") profileContour = reversePath(profileContour);
		shapeProfPaths.push({ tpath: profileContour, isContour: true });
	}
	// Profile around islands (outside offset)
	for (let island of roundedIslands) {
		let islandProfileOffset = offsetPath(island, finishRadius, true);
		if (islandProfileOffset.length > 0) {
			let islandContour = islandProfileOffset[0].slice();
			if (direction != "climb") islandContour = reversePath(islandContour);
			shapeProfPaths.push({ tpath: islandContour, isContour: true });
		}
	}
	if (shapeProfPaths.length > 0) profileGroups.push(shapeProfPaths);
}

// Generate male plug pocket, profile, and cutout paths for all shapes together
function generateInlayMalePaths(inputPaths, depths, clearance, pocketingTool, pocketRadius, finishRadius, stepover, angle, direction, cutOut, pocketGroups, profileGroups, cutOutGroups) {
	let expand = 2 * pocketingTool.diameter * viewScale;

	// Build clearance-adjusted paths for every input path (with corner rounding pre-applied)
	let clearancePaths = buildClearancePaths(inputPaths, depths, clearance, ClipperLib.JoinType.jtRound,
		(path, isRaised) => isRaised
			? roundConcaveCorners(roundConvexCorners(path, finishRadius), finishRadius)
			: roundConvexCorners(roundConcaveCorners(path, finishRadius), finishRadius));

	// Depth-0 shapes form the hull islands
	let allClearanceOuters = clearancePaths.filter(c => c.depth === 0).map(c => c.path);

	// Compute convex hull of depth-0 shapes, then expand outward
	let outerBoundary = buildExpandedHullBoundary(allClearanceOuters, expand);
	if (!outerBoundary) return { pocketGroups: [], cutOutGroups: [] };

	// Generate pocket: hull boundary with depth-0 shapes as islands
	let pocketPaths = generatePocketPaths(outerBoundary, allClearanceOuters, pocketRadius, stepover, angle, direction, finishRadius);

	// Pocket inside each odd-depth shape, with its direct even-depth children as sub-islands
	pocketOddDepthIslands(clearancePaths, inputPaths, pocketRadius, stepover, angle, direction, finishRadius, pocketPaths, null);

	if (pocketPaths.length > 0) pocketGroups.push(pocketPaths);

	// Generate finishing profiles
	let shapeProfPaths = [];
	for (let cp of clearancePaths) {
		let isRaised = (cp.depth % 2 === 0);
		let profileOffset = offsetPath(cp.path, finishRadius, isRaised);
		if (profileOffset.length > 0) {
			let profileContour = profileOffset[0].slice();
			if (isRaised) {
				if (direction != "climb") profileContour = reversePath(profileContour);
			} else {
				if (direction == "climb") profileContour = reversePath(profileContour);
			}
			shapeProfPaths.push({ tpath: profileContour, isContour: true });
		}
	}
	if (shapeProfPaths.length > 0) profileGroups.push(shapeProfPaths);

	// Optional: cut out around the convex hull boundary
	appendCutOutGroup(cutOut, outerBoundary, pocketRadius, direction, pocketingTool, cutOutGroups);
}

// Push accumulated inlay toolpaths with optimized group ordering
function pushInlayToolpaths(pocketGroups, profileGroups, cutOutGroups, pocketingTool, finishingTool, typeName, selectedSvgIds) {
	const depthMM = pocketingTool.depth;

	let allPocketPaths = optimizeGroupOrder(pocketGroups);
	if (allPocketPaths.length > 0) {
		window.currentTool = { ...pocketingTool };
		pushToolPath(allPocketPaths, `Inlay ${typeName}`, 'Inlay', null, selectedSvgIds, `${depthMM}mm ${typeName}`);
	}

	let allProfilePaths = optimizeGroupOrder(profileGroups);
	if (allProfilePaths.length > 0) {
		window.currentTool = { ...finishingTool, depth: pocketingTool.depth, step: pocketingTool.step };
		pushToolPath(allProfilePaths, `Inlay ${typeName} Profile`, 'Inlay', null, selectedSvgIds, `${depthMM}mm ${typeName} Profile`);
	}

	let allCutOutPaths = optimizeGroupOrder(cutOutGroups);
	if (allCutOutPaths.length > 0) {
		let materialDepth = allCutOutPaths[0].cutOutDepth;
		let cleanCutOutPaths = allCutOutPaths.map(p => ({ tpath: p.tpath, isContour: p.isContour }));
		window.currentTool = { ...pocketingTool, depth: materialDepth };
		pushToolPath(cleanCutOutPaths, 'Inlay Plug Cutout', 'Inlay', null, selectedSvgIds, `${depthMM}mm Plug Cutout`);
	}

	window.currentTool = pocketingTool;
}

function doInlay() {
	setMode("Inlay");
	if (selectMgr.noSelection()) {
		notify('Select a path for inlay');
		return;
	}

	const props = window.currentToolpathProperties;
	const inlayType = props?.inlayType || 'female';
	const clearanceMM = props?.clearance || 0.1;
	const clearance = clearanceMM * viewScale;
	const cutOut = props?.cutOut || false;

	// Get finishing tool
	const finishingToolId = props?.finishingToolId;
	const finishingTool = window.toolPathProperties.getToolById(finishingToolId);
	if (!finishingTool) {
		notify('Finishing tool not found', 'error');
		return;
	}

	const pocketingTool = { ...window.currentTool };
	const pocketRadius = pocketingTool.diameter / 2 * viewScale;
	const finishRadius = finishingTool.diameter / 2 * viewScale;
	const stepover = 2 * pocketRadius * pocketingTool.stepover / 100;
	const angle = props?.angle || 0;
	const direction = pocketingTool.direction || 'climb';

	// Get selected paths
	var inputPaths = [];
	var selected = selectMgr.selectedPaths();
	for (let svgpath of selected)
		inputPaths.push(svgpath.path);

	// Mirror paths horizontally for male plug if mirror option is enabled
	if (inlayType === 'male' && props?.mirror) {
		var allBbox = boundingBox(inputPaths.flat());
		var centerX = (allBbox.minx + allBbox.maxx) / 2;
		inputPaths = inputPaths.map(function(path) {
			return path.map(function(pt) {
				return { x: 2 * centerX - pt.x, y: pt.y };
			});
		});
	}

	inputPaths = normalizeWindingOrder(inputPaths);
	const selectedSvgIds = selected.map(p => p.id);

	let depths = computeNestingDepths(inputPaths);
	let allOuters = [];
	let allIslands = [];
	for (let i = 0; i < inputPaths.length; i++) {
		if (depths[i] % 2 === 0) allOuters.push(inputPaths[i]);
		else allIslands.push(inputPaths[i]);
	}

	if (allOuters.length === 0) {
		notify('Unable to determine outer boundary for inlay');
		return;
	}

	// V-bit finishing tool: use V-carve algorithm for sharp feature preservation
	if (finishingTool.bit === 'VBit') {
		doVbitInlay(inputPaths, depths, allOuters, allIslands, props, pocketingTool, finishingTool, selectedSvgIds);
		return;
	}

	let pocketGroups = [];
	let profileGroups = [];
	let cutOutGroups = [];
	const typeName = inlayType === 'female' ? 'Socket' : 'Plug';

	if (inlayType === 'female') {
		for (let oi = 0; oi < allOuters.length; oi++) {
			let outerPath = allOuters[oi];
			let outerIdx = inputPaths.indexOf(outerPath);
			let outerDepth = depths[outerIdx];
			let islandPaths = [];
			for (let j = 0; j < inputPaths.length; j++) {
				if (depths[j] === outerDepth + 1 && pathIn(outerPath, inputPaths[j])) {
					islandPaths.push(inputPaths[j]);
				}
			}
			generateInlayFemalePaths(outerPath, islandPaths, pocketRadius, finishRadius, stepover, angle, direction, pocketGroups, profileGroups);
		}
	} else {
		generateInlayMalePaths(inputPaths, depths, clearance, pocketingTool, pocketRadius, finishRadius, stepover, angle, direction, cutOut, pocketGroups, profileGroups, cutOutGroups);
	}

	pushInlayToolpaths(pocketGroups, profileGroups, cutOutGroups, pocketingTool, finishingTool, typeName, selectedSvgIds);
}

function doPocket() {
	setMode("Pocket");
	if (selectMgr.noSelection()) {
		notify('Select a path to pocket');
		return;
	}

	var radius = toolRadius();
	var stepover = 2 * radius * currentTool.stepover / 100;
	var name = 'Pocket';
	var angle = window.currentToolpathProperties?.angle || 0;
	var strategy = window.currentToolpathProperties?.strategy || 'adaptive';
	var inputPaths = [];

	var selected = selectMgr.selectedPaths();
	for (let svgpath of selected)
		inputPaths.push(svgpath.path);

	inputPaths = normalizeWindingOrder(inputPaths);
	var direction = currentTool.direction || 'climb';
	const selectedSvgIds = selectMgr.selectedPaths().map(p => p.id);

	let depths = computeNestingDepths(inputPaths);

	// Even-depth paths are pocket boundaries, odd-depth paths are islands.
	// Each pocket boundary's islands are the odd-depth paths directly inside it
	// (one nesting level deeper).
	let pocketGroups = [];
	for (let i = 0; i < inputPaths.length; i++) {
		if (depths[i] % 2 !== 0) continue; // skip islands
		let outerPath = inputPaths[i];
		let directIslands = [];
		for (let j = 0; j < inputPaths.length; j++) {
			if (i === j) continue;
			if (depths[j] === depths[i] + 1 && pathIn(outerPath, inputPaths[j])) {
				directIslands.push(inputPaths[j]);
			}
		}
		let paths = generatePocketPaths(outerPath, directIslands, radius, stepover, angle, direction, 0, strategy);
		if (paths.length > 0) pocketGroups.push(paths);
	}

	if (pocketGroups.length === 0) {
		notify('Unable to generate pocket paths');
		return;
	}

	// Order shape groups geographically, keeping each shape's paths together
	let allPaths = optimizeGroupOrder(pocketGroups);
	pushToolPath(allPaths, name, 'Pocket', null, selectedSvgIds);
}

function doVcarve() {
	if (currentTool.inside == 'inside') {
		doVcarveIn();
	} else if (currentTool.inside == 'outside') {
		doVcarveOut();
	}
	else {
		doVcarveCenter();
	}
}

function doVcarveCenter() {
	if (selectMgr.noSelection()) {
		notify('Select a path to VCarve');
		return;
	}
	setMode("VCarve In");
	computeWithMedialAxis(false, 'VCarve In');
}

function doVcarveIn() {
	if (selectMgr.noSelection()) {
		notify('Select a path to VCarve');
		return;
	}
	setMode("VCarve In");
	computeVcarve(false, 'VCarve In');
}

function doVcarveOut() {
	if (selectMgr.noSelection()) {
		notify('Select a path to VCarve');
		return;
	}
	setMode("VCarve Out");
	computeVcarve(true, 'VCarve Out');
}

var link = document.createElement('a');
link.style.display = 'none';
document.body.appendChild(link); // Firefox workaround, see #6594

function save(blob, filename) {

	link.href = URL.createObjectURL(blob);
	link.download = filename || 'data.json';
	link.click();
}

function saveString(text, filename) {

	save(new Blob([text], { type: 'text/plain' }), filename);

}

function _gcodeNameComment(name) {
	var profile = (typeof currentGcodeProfile !== 'undefined' && currentGcodeProfile) ? currentGcodeProfile : {};
	var commentChar = profile.commentChar || ';';
	var closingChar = commentChar === '(' ? ')' : '';
	return commentChar + name + closingChar + '\n';
}

async function doGcode() {
	if (toolpaths.length == 0) {
		notify('No toolpaths to export');
		return;
	}

	// Check table limits before saving - show Bootstrap confirm dialog if exceeded
	var limitWarning = checkTableLimits();
	if (limitWarning) {
		var proceed = await new Promise(function(resolve) {
			showConfirmModal({
				title: 'Machine Table Limits Exceeded',
				message: '<p>' + limitWarning + '</p><p>Do you want to save the G-code anyway?</p>',
				confirmText: 'Save Anyway',
				confirmClass: 'btn-warning',
				headerClass: 'bg-warning text-dark',
				onConfirm: function() { resolve(true); }
			});
			// If modal is dismissed without confirming, resolve false
			var modalEl = document.getElementById('confirmModal');
			modalEl.addEventListener('hidden.bs.modal', function() { resolve(false); }, { once: true });
		});
		if (!proceed) return;
	}

	window._skipTableLimitWarning = true;
	var text = toGcode();
	window._skipTableLimitWarning = false;

	// Use the File System Access API if available (modern browsers)
	if ('showSaveFilePicker' in window) {
		try {
			const fileHandle = await window.showSaveFilePicker({
				suggestedName: currentFileName + ".gcode",
				types: [{
					description: 'G-code files',
					accept: { 'text/plain': ['.gcode', '.nc', '.tap'] }
				}]
			});
			const projectName = fileHandle.name.replace(/\.[^.]+$/, '');
			const writable = await fileHandle.createWritable();
			await writable.write(_gcodeNameComment(projectName) + text);
			await writable.close();
			notify('G-code saved successfully');
			return;
		} catch (err) {
			if (err.name !== 'AbortError') {
				console.error('Error saving file:', err);
				// Continue to fallback method on error
			} else {
				// User cancelled the dialog
				return;
			}
		}
	}

	// Fallback: prompt for filename and use download method
	var filename = prompt("Enter filename for G-code export:", currentFileName + ".gcode");
	if (!filename) {
		return; // User cancelled
	}

	// Ensure .gcode extension
	if (!filename.endsWith('.gcode')) {
		filename += '.gcode';
	}

	const projectName = filename.replace(/\.[^.]+$/, '');
	saveString(_gcodeNameComment(projectName) + text, filename);
	notify('G-code download started');
}


