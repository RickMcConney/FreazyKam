var clipper = ClipperLib;

// Compute the convex hull of a set of {x,y} points using Andrew's monotone chain algorithm.
// Returns a closed polygon (first point NOT repeated) in counter-clockwise order.
function convexHull(points) {
	if (points.length < 3) return points.slice();
	var pts = points.slice().sort(function(a, b) { return a.x - b.x || a.y - b.y; });

	// Remove duplicates
	var unique = [pts[0]];
	for (var i = 1; i < pts.length; i++) {
		if (pts[i].x !== pts[i - 1].x || pts[i].y !== pts[i - 1].y) {
			unique.push(pts[i]);
		}
	}
	pts = unique;
	if (pts.length < 3) return pts;

	function cross(o, a, b) {
		return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	}

	// Build lower hull
	var lower = [];
	for (var i = 0; i < pts.length; i++) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) {
			lower.pop();
		}
		lower.push(pts[i]);
	}

	// Build upper hull
	var upper = [];
	for (var i = pts.length - 1; i >= 0; i--) {
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) {
			upper.pop();
		}
		upper.push(pts[i]);
	}

	// Remove last point of each half because it's repeated
	lower.pop();
	upper.pop();
	return lower.concat(upper);
}

function subdividePath(path, size) {
	var points = [];
	for (var i = 0; i < path.length - 1; i++) {
		var j = (i + 1) % path.length;
		var point = path[i];
		var next = path[j];
		var x1 = point.x;
		var y1 = point.y;
		var x2 = next.x;
		var y2 = next.y;
		var dx = (x2 - x1);
		var dy = (y2 - y1);
		var len = Math.max(Math.abs(dx), Math.abs(dy));

		var count = Math.floor(len / size);
		if (count == 0)
			count = 2;
		if (count > 8)
			count = 8;


		dx = dx / count;
		dy = dy / count;


		for (var p = 0; p < count; p++) {
			points.push({ x: x1 + p * dx, y: y1 + p * dy });
		}
		points.push({ x: x2, y: y2 });
	}

	return points;
}

function makeNorms(subpath, path, cw, r, outside) {

	var norms = [];
	var sampleSize = 2; // world units between sample points along edges
	var fanStep = 5 * Math.PI / 180; // 5° between fan normals at corners

	// Work with original path vertices (closed: last == first)
	var n = path.length - 1;
	if (n < 2) return norms;

	// Precompute edge normals for each edge
	var edgeNormals = [];
	for (var i = 0; i < n; i++) {
		var curr = path[i];
		var next = path[(i + 1) % n];
		var edx = next.x - curr.x;
		var edy = next.y - curr.y;
		var edLen = Math.sqrt(edx * edx + edy * edy);
		if (edLen < 0.001) {
			edgeNormals.push(null);
			continue;
		}
		var ux = edx / edLen, uy = edy / edLen;
		var nx, ny;
		if (cw) { nx = uy; ny = -ux; }
		else { nx = -uy; ny = ux; }
		edgeNormals.push({ nx: nx, ny: ny, ux: ux, uy: uy, len: edLen });
	}

	function addNorm(x, y, dx, dy) {
		var pt = { x: x + dx * r, y: y + dy * r };
		if ((!outside && pointInPolygon(pt, path)) ||
			(outside && !pointInPolygon(pt, path))) {
			norms.push({ x1: x, y1: y, x2: pt.x, y2: pt.y, dx: dx, dy: dy });
		}
	}

	for (var i = 0; i < n; i++) {
		var edge = edgeNormals[i];
		if (!edge) continue;

		var curr = path[i];
		var next = path[(i + 1) % n];

		// Sample points along this edge with constant perpendicular normal
		var count = Math.max(2, Math.ceil(edge.len / sampleSize));
		if (count > 500) count = 500;
		for (var p = 0; p < count; p++) {
			var t = p / count;
			var x = curr.x + edge.ux * edge.len * t;
			var y = curr.y + edge.uy * edge.len * t;
			addNorm(x, y, edge.nx, edge.ny);
		}

		// Corner normals at the vertex between this edge and next edge
		var nextEdge = edgeNormals[(i + 1) % n];
		if (!nextEdge) continue;

		// Angle between the two edge normals
		var dot = edge.nx * nextEdge.nx + edge.ny * nextEdge.ny;
		dot = Math.max(-1, Math.min(1, dot));
		var angle = Math.acos(dot);
		if (angle < 0.01) continue;

		// Determine if corner is convex from the cut side using edge cross product
		var edgeCross = edge.ux * nextEdge.uy - edge.uy * nextEdge.ux;
		var isConvex = cw ? (edgeCross < 0) : (edgeCross > 0);

		if (isConvex) {
			// Convex corner: fan of normals to trace around the outside
			var steps = Math.max(2, Math.ceil(angle / fanStep));
			var sinAngle = Math.sin(angle);
			if (sinAngle < 0.001) continue;

			for (var s = 0; s <= steps; s++) {
				var ft = s / steps;
				var w1 = Math.sin((1 - ft) * angle) / sinAngle;
				var w2 = Math.sin(ft * angle) / sinAngle;
				var fdx = w1 * edge.nx + w2 * nextEdge.nx;
				var fdy = w1 * edge.ny + w2 * nextEdge.ny;
				var flen = Math.sqrt(fdx * fdx + fdy * fdy);
				if (flen < 0.001) continue;
				fdx /= flen; fdy /= flen;
				addNorm(next.x, next.y, fdx, fdy);
			}
		} else {
			// Concave corner: single bisector normal to dip into the corner
			var bx = edge.nx + nextEdge.nx;
			var by = edge.ny + nextEdge.ny;
			var blen = Math.sqrt(bx * bx + by * by);
			if (blen > 0.001) {
				bx /= blen; by /= blen;
				addNorm(next.x, next.y, bx, by);
			}
		}
	}

	return norms;
}

function newbitFits(point, r) {
	let min = Infinity;
	for (var j = 0; j < nearbypaths.length; j++) {
		var path = nearbypaths[j].path;
		var dist = distanceToClosestPath(point, path, r);
		if (dist < min) min = dist;
	}
	if (Math.abs(min - r) > 0.01)
		return false;
	return true;
}

function bitFits(point, r) {
	for (var j = 0; j < nearbypaths.length; j++) {
		var path = nearbypaths[j].path;
		var dist = distToNearestSegment(point, path, r);
		if (dist < r)
			return false;
	}
	return true;
}

function vbitRadius(tool) {
	var toolRadius = tool.diameter / 2;
	var depth = tool.depth || 1;

	// Ball Nose: spherical profile - effective radius at depth
	if (tool.bit === "Ball Nose") {
		// For a sphere: r = sqrt(d * (2R - d)) where R is ball radius, d is depth
		if (depth <= 0) {
			return 0;  // No cutting at surface level
		}
		// Only valid if d <= R (within spherical part)
		if (depth <= toolRadius) {
			var r = Math.sqrt(depth * (2 * toolRadius - depth));
			return r;
		}
		// If depth > radius, we're past the equator - use max radius
		return toolRadius;
	}

	// V-Bit: conical profile - radius at depth
	if (tool.bit === "VBit") {
		var angle = tool.angle * Math.PI / 180.0;
		var r = depth * Math.tan(angle / 2);
		// Cap at maximum diameter
		if (r > toolRadius) r = toolRadius;
		return r;
	}

	// End Mill and other tools: constant radius
	return toolRadius;
}

function largestEmptyCircles(norms, startRadius, subpath) {
	var circles = [];

	for (var i = 0; i < norms.length; i++) {
		var n = norms[i];
		var inc = 0.1;
		var point = {};


		for (var r = startRadius; r > 0; r -= inc) {
			point.x = n.x1 + (n.dx * r);
			point.y = n.y1 + (n.dy * r);
			if (newbitFits(point, r) || r <= inc) {
				point.r = r;
				circles.push(point);
				break;
			}
		}


	}

	if (circles.length > 0) {
		var first = circles[0];
		circles.push(first);
	}

	return circles;
}

function offsetPath(svgpath, radius, outside) {
	// Store the original first point to preserve starting position after ClipperJS reorders
	var originalFirstPoint = svgpath.length > 0 ? {x: svgpath[0].x, y: svgpath[0].y} : null;

	var offset = new clipper.ClipperOffset(20, 0.025);
	offset.AddPath(svgpath, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
	var sol = [];
	if (outside)
		offset.Execute(sol, radius);
	else
		offset.Execute(sol, -radius);

	// Rotate each output path to start at the point closest to the original first point
	// This preserves the user's chosen starting point despite ClipperJS reordering
	for (var i = 0; i < sol.length; i++) {
		if (originalFirstPoint && sol[i].length > 0) {
			var closestIndex = 0;
			var minDist = Infinity;

			// Find the point in the offset path closest to the original first point
			for (var j = 0; j < sol[i].length; j++) {
				var dx = sol[i][j].x - originalFirstPoint.x;
				var dy = sol[i][j].y - originalFirstPoint.y;
				var dist = dx * dx + dy * dy;
				if (dist < minDist) {
					minDist = dist;
					closestIndex = j;
				}
			}

			// Rotate the path to start at the closest point
			if (closestIndex > 0) {
				var rotated = [
					...sol[i].slice(closestIndex),
					...sol[i].slice(0, closestIndex)
				];
				sol[i] = rotated;
			}
		}

		sol[i].push(sol[i][0]); // close path
	}

	return sol;
}

function checkPath(path, r) {
	var circles = [];
	for (var i = 0; i < path.length; i++) {
		var point = path[i];
		if (bitFits(point, r)) {
			point.r = r;
			circles.push(point);
		}
	}
	if (circles.length > 0) {
		var first = circles[0];
		circles.push(first);
	}
	return circles;
}

function addCircles(path, r) {
	var circles = [];
	for (var i = 0; i < path.length; i++) {
		var point = path[i];
		point.r = r;
		circles.push(point);
	}

	return circles;
}


var _undoBatching = false;

function beginUndoBatch() {
	addUndo(true, false, false);
	_undoBatching = true;
}

function endUndoBatch() {
	_undoBatching = false;
}

function pushToolPath(paths, name, operation, svgId = null, svgIds = null, label = null) {
	if (!_undoBatching) addUndo(true, false, false);

	// If we're updating existing toolpaths, update in-place instead of creating new ones.
	// This preserves the toolpath's name, id, and position in the list.
	if (window.toolpathUpdateTargets && window.toolpathUpdateTargets.length > 0) {
		const existing = window.toolpathUpdateTargets.shift();
		existing.paths = paths;
		existing.operation = operation;
		existing.tool = { ...currentTool };
		existing.svgId = svgId || (svgIds && svgIds.length > 0 ? svgIds[0] : null);
		existing.svgIds = svgIds;
		if (window.currentToolpathProperties) {
			existing.toolpathProperties = { ...window.currentToolpathProperties };
			if (window.currentToolpathProperties.toolpathName) {
				existing.label = window.currentToolpathProperties.toolpathName;
			}
		}
		// Caller-provided label overrides auto-generated default
		if (label) {
			existing.label = label;
		}
		redraw();
		return;
	}

	// Create toolpath object with tool data
	const toolpathData = {
		id: "T" + toolpathId,
		paths: paths,
		visible: true,
		operation: operation,
		name: name,
		tool: { ...currentTool },
		svgId: svgId || (svgIds && svgIds.length > 0 ? svgIds[0] : null),  // Backward compatibility
		svgIds: svgIds  // Store array of all source SVG path IDs for multi-path operations
	};

	// If toolpath properties were set (from the new properties panel), store them
	if (window.currentToolpathProperties) {
		toolpathData.toolpathProperties = { ...window.currentToolpathProperties };
		if (window.currentToolpathProperties.toolpathName) {
			toolpathData.label = window.currentToolpathProperties.toolpathName;
		}
	}

	// Caller-provided label overrides the auto-generated default name
	// (e.g. inlay generates multiple toolpaths each needing a distinct name)
	if (label) {
		toolpathData.label = label;
	}

	toolpaths.push(toolpathData);
	const displayName = toolpathData.label || (name + ' ' + toolpathId);
	addToolPath('T' + toolpathId, displayName, name, currentTool.name);
	toolpathId++;

	redraw();
}

// Temporarily apply tool from properties panel, run callback, then restore.
// Returns true if properties panel was used, false to fall through to default.
function withDrillProperties(callback) {
	if (!window.toolPathProperties?.hasOperation('Drill')) return false;
	try {
		const data = window.toolPathProperties.collectFormData('Drill');
		window.toolPathProperties.saveDefaults('Drill', data);
		const selectedTool = window.toolPathProperties.getToolById(data.toolId);
		if (!selectedTool) return false;

		const originalTool = window.currentTool;
		window.currentTool = {
			...selectedTool,
			depth: data.depth || selectedTool.depth,
			step: data.step || selectedTool.step
		};
		window.currentToolpathProperties = { ...data };
		try {
			callback();
		} finally {
			window.currentTool = originalTool;
			window.currentToolpathProperties = null;
		}
		return true;
	} catch (e) {
		return false;
	}
}

function pushAndActivateToolpath(paths, name, operation, svgId) {
	const beforeCount = toolpaths.length;
	pushToolPath(paths, name, operation, svgId);
	if (toolpaths.length > beforeCount && typeof setActiveToolpaths === 'function') {
		setActiveToolpaths([toolpaths[toolpaths.length - 1]]);
	}
}

function makeHole(pt) {
	function core() {
		var radius = toolRadius();
		var paths = [{ tpath: [{ x: pt.x, y: pt.y, r: radius }], path: [{ x: pt.x, y: pt.y, r: radius }] }];
		pushAndActivateToolpath(paths, 'Drill', 'Drill', null);
	}
	if (!withDrillProperties(core)) core();
}

function makeHelicalHole(circle, svgId) {
	function core() {
		var radius_tool = toolRadius();
		if (circle.radius <= radius_tool) {
			var circleDiaMM = (circle.radius * 2 / viewScale).toFixed(2);
			var toolDiaMM = (radius_tool * 2 / viewScale).toFixed(2);
			notify('Circle diameter (' + circleDiaMM + 'mm) is smaller than tool diameter (' + toolDiaMM + 'mm). Use a smaller end mill.', 'error');
			return;
		}
		var helixPath = generateHelixPath(circle, window.currentTool.depth, window.currentTool.step, radius_tool);
		var paths = [{ tpath: helixPath, path: helixPath }];
		pushAndActivateToolpath(paths, 'Helical Drill', 'HelicalDrill', svgId);
	}
	if (!withDrillProperties(core)) core();
}

/**
 * Generate helix path points for helical drilling.
 * The toolpath radius is offset inward by the tool radius so the cut edge
 * matches the SVG circle. For circles larger than 2x tool diameter, multiple
 * concentric passes are generated from the center outward.
 *
 * Cuts depth-first: at each Z level, all concentric radii are cut from
 * inside out before descending to the next level. This avoids retracts.
 *
 * circle: {cx, cy, radius} in world coords
 * depth: total depth in mm
 * stepDown: depth per revolution in mm
 * toolRadius: tool radius in world coords
 * Returns array of {x, y, z} points in world coords, z in mm
 */
// Generate arc points at constant or interpolated radius/Z, advancing angleOffset
function generateArcPoints(points, cx, cy, r1, r2, z1, z2, numPoints, angleOffset, ppr, toolRadius, startAt1) {
	var start = startAt1 ? 1 : 0;
	for (var i = start; i <= numPoints; i++) {
		var t = i / numPoints;
		var r = r1 + (r2 - r1) * t;
		var z = z1 + (z2 - z1) * t;
		var angle = ((angleOffset + i) / ppr) * 2 * Math.PI;
		points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), z: z, r: toolRadius });
	}
	return angleOffset + numPoints;
}

function generateHelixPath(circle, depth, stepDown, toolRadius) {
	var points = [];
	var ppr = 72; // points per revolution
	var cx = circle.cx;
	var cy = circle.cy;
	var outerCutRadius = circle.radius - toolRadius;

	if (stepDown <= 0) stepDown = depth;

	// Determine concentric radii (stepover = tool radius)
	var stepover = toolRadius;
	var radii = [];
	if (outerCutRadius <= stepover) {
		radii.push(outerCutRadius);
	} else {
		var r = stepover;
		while (r < outerCutRadius) { radii.push(r); r += stepover; }
		radii.push(outerCutRadius);
	}

	// Build Z depth levels
	var zLevels = [];
	var z = 0;
	while (z < depth) { z += stepDown; if (z > depth) z = depth; zLevels.push(-z); }

	var transitionPoints = Math.round(ppr / 8);
	var angleOffset = 0;
	var currentZ = 0;
	var r0 = radii[0];

	for (var levelIdx = 0; levelIdx < zLevels.length; levelIdx++) {
		var targetZ = zLevels[levelIdx];
		var isLastLevel = (levelIdx === zLevels.length - 1);

		// Helix down one revolution at innermost radius
		angleOffset = generateArcPoints(points, cx, cy, r0, r0, currentZ, targetZ, ppr, angleOffset, ppr, toolRadius, false);

		// At final depth, flatten the helix ramp with a full circle
		if (isLastLevel) {
			angleOffset = generateArcPoints(points, cx, cy, r0, r0, targetZ, targetZ, ppr, angleOffset, ppr, toolRadius, true);
		}

		// Spiral outward through remaining radii
		for (var rIdx = 1; rIdx < radii.length; rIdx++) {
			// Transition from previous radius to this one in 1/8 turn
			angleOffset = generateArcPoints(points, cx, cy, radii[rIdx - 1], radii[rIdx], targetZ, targetZ, transitionPoints, angleOffset, ppr, toolRadius, true);
			// Full circle at this radius
			angleOffset = generateArcPoints(points, cx, cy, radii[rIdx], radii[rIdx], targetZ, targetZ, ppr, angleOffset, ppr, toolRadius, true);
		}

		// At final depth, cleanup arc for the 1/8 turn missed during descent
		if (isLastLevel) {
			generateArcPoints(points, cx, cy, radii[radii.length - 1], radii[radii.length - 1], targetZ, targetZ, transitionPoints, angleOffset, ppr, toolRadius, true);
		}

		// Spiral back inward to innermost radius for next level
		if (!isLastLevel && radii.length > 1) {
			angleOffset = generateArcPoints(points, cx, cy, radii[radii.length - 1], r0, targetZ, targetZ, transitionPoints, angleOffset, ppr, toolRadius, true);
		}

		currentZ = targetZ;
	}

	return points;
}

function generateClipperInfill(inputPaths, stepOverDistance, radius, angle = 0) {
	// Normalize winding order to ensure consistent behavior regardless of user draw direction
	let normalizedPaths = normalizeWindingOrder(inputPaths);

	// Calculate center point for rotation
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	normalizedPaths.flat().forEach(point => {
		minX = Math.min(minX, point.x);
		minY = Math.min(minY, point.y);
		maxX = Math.max(maxX, point.x);
		maxY = Math.max(maxY, point.y);
	});
	const centerX = (minX + maxX) / 2;
	const centerY = (minY + maxY) / 2;

	// If angle is not 0, rotate input boundaries by -angle for horizontal infill generation
	if (angle !== 0) {
		const angleRad = -angle * Math.PI / 180;
		normalizedPaths = normalizedPaths.map(path =>
			path.map(point => rotatePoint(point, centerX, centerY, angleRad))
		);
	}

	const clipper = new ClipperLib.Clipper();
	// Determine the bounding box to generate infill lines (for rotated paths if angle != 0)
	minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
	normalizedPaths.flat().forEach(point => {
		minX = Math.min(minX, point.x);
		minY = Math.min(minY, point.y);
		maxX = Math.max(maxX, point.x);
		maxY = Math.max(maxY, point.y);
	});

	// Track the Y values and indices of the infill lines we generate
	const sourceLines = [];
	const subjectLines = [];
	let lineIndex = 0;

	// Generate a set of parallel lines that span the bounding box
	for (let y = minY + radius; y <= (maxY - radius); y += stepOverDistance) {
		// A single line segment to be clipped
		const line = [{ x: minX, y: y }, { x: maxX, y: y }];
		subjectLines.push(line);
		sourceLines.push({ index: lineIndex, y: y });
		lineIndex++;
	}

	// Add the boundary paths as the clip subject.
	// The last parameter is `true` because boundaries are closed polygons.
	// clipper.AddPaths() can handle multiple paths, including those for holes.
	clipper.AddPaths(normalizedPaths, ClipperLib.PolyType.ptClip, true);

	// Add the infill lines as the subject to be clipped.
	// The last parameter is `false` because they are open polylines.
	clipper.AddPaths(subjectLines, ClipperLib.PolyType.ptSubject, false);

	// Create a container for the result

	const solutionPolyTree = new ClipperLib.PolyTree();

	// Execute the intersection operation
	clipper.Execute(
		ClipperLib.ClipType.ctIntersection, // The clipping operation (intersect)
		solutionPolyTree,
		ClipperLib.PolyFillType.pftEvenOdd, // Filling rule
		ClipperLib.PolyFillType.pftEvenOdd
	);

	const finalPaths = ClipperLib.Clipper.PolyTreeToPaths(solutionPolyTree);
	const validPaths = [];

	for (let i = finalPaths.length - 1; i >= 0; i--) {
		let p = finalPaths[i];
		p[0].x -= (radius);
		p[1].x += (radius);

		if (!(p[0].x < p[1].x)) {
			validPaths.unshift(p);
		}
	}

	// Group paths by their Y coordinate proximity
	// All paths with similar Y values belong to the same source infill line
	const tolerance = stepOverDistance * 0.2;  // Tolerance for Y clustering
	const pathsWithY = validPaths.map((path, idx) => ({
		idx: idx,
		path: path,
		y: path.length > 0 ? (path[0].y + path[path.length - 1].y) / 2 : 0
	}));

	// Sort by Y coordinate
	pathsWithY.sort((a, b) => a.y - b.y);

	// Cluster paths by Y proximity
	const groups = [];
	const usedIndices = new Set();

	for (let i = 0; i < pathsWithY.length; i++) {
		if (usedIndices.has(i)) continue;

		const groupPaths = [pathsWithY[i].path];
		usedIndices.add(i);
		const groupY = pathsWithY[i].y;

		// Find all subsequent paths with similar Y values
		for (let j = i + 1; j < pathsWithY.length; j++) {
			if (usedIndices.has(j)) continue;
			if (Math.abs(pathsWithY[j].y - groupY) <= tolerance) {
				groupPaths.push(pathsWithY[j].path);
				usedIndices.add(j);
			} else {
				// Since sorted by Y, no more matches will be found
				break;
			}
		}

		// Add group if it has paths
		if (groupPaths.length > 0) {
			groups.push({
				sourceLineY: groupY,
				paths: groupPaths
			});
		}
	}

	// If angle is not 0, rotate all result paths back by +angle to original orientation
	if (angle !== 0) {
		const angleRad = angle * Math.PI / 180;
		for (let group of groups) {
			for (let path of group.paths) {
				for (let point of path) {
					const rotated = rotatePoint(point, centerX, centerY, angleRad);
					point.x = rotated.x;
					point.y = rotated.y;
				}
			}
		}
	}

	// Return grouped structure instead of flat array
	return groups;
}

/**
 * Extracts connectivity chains from grouped infill paths
 * Groups segments by continuity across Y-levels with endpoint-based zigzag matching
 * Segments form a chain by tracking the last cutting endpoint and matching new segments to it
 * Automatically reverses segments to maintain continuous zigzag pattern
 * @param {Array} infillGroups - Array of groups from generateClipperInfill() (sorted by Y, paths already rotated)
 * @param {number} stepover - Stepover distance
 * @param {number} angle - Infill angle (paths already rotated back to original orientation by generateClipperInfill)
 * @returns {Array} Array of chains, each containing segments from one X-region
 */
// Append a segment to a chain, reversing if needed for smooth continuation
function appendSegmentToChain(chain, segmentPath) {
	const segStart = segmentPath[0];
	const segEnd = segmentPath[segmentPath.length - 1];
	const last = chain.lastEndpoint;

	const dsx = segStart.x - last.x, dsy = segStart.y - last.y;
	const dex = segEnd.x - last.x, dey = segEnd.y - last.y;
	const distToStart = Math.sqrt(dsx*dsx + dsy*dsy);
	const distToEnd = Math.sqrt(dex*dex + dey*dey);

	if (distToEnd < distToStart) {
		const reversed = reversePath(segmentPath);
		chain.segments.push(reversed);
		chain.lastEndpoint = reversed[reversed.length - 1];
	} else {
		chain.segments.push(segmentPath);
		chain.lastEndpoint = segmentPath[segmentPath.length - 1];
	}
	chain.wasUpdated = true;
}

// Find the best matching open chain for a segment within tolerance
function findBestChainMatch(openChains, segmentPath, tolerance) {
	const segStart = segmentPath[0];
	const segEnd = segmentPath[segmentPath.length - 1];
	let bestChain = null;
	let bestDistance = Infinity;

	for (let chain of openChains) {
		const last = chain.lastEndpoint;
		const csx = segStart.x - last.x, csy = segStart.y - last.y;
		const cex = segEnd.x - last.x, cey = segEnd.y - last.y;
		const distToStart = Math.sqrt(csx*csx + csy*csy);
		const distToEnd = Math.sqrt(cex*cex + cey*cey);

		const closestDist = Math.min(distToStart, distToEnd);

		if (closestDist < tolerance && closestDist < bestDistance) {
			bestChain = chain;
			bestDistance = closestDist;
		}
	}

	return { bestChain };
}

function extractConnectivityChains(infillGroups, stepover, angle = 0) {
	if (infillGroups.length === 0) return [];

	const tolerance = stepover * 2;
	const openChains = [];
	const closedChains = [];
	let previousWasSingleSegment = false;

	for (let groupIdx = 0; groupIdx < infillGroups.length; groupIdx++) {
		const group = infillGroups[groupIdx];
		const sourceY = group.sourceLineY;

		const segments = group.paths.map(path => ({ path }));
		segments.sort((a, b) => {
			const aMinX = Math.min(a.path[0].x, a.path[a.path.length - 1].x);
			const bMinX = Math.min(b.path[0].x, b.path[b.path.length - 1].x);
			return aMinX - bMinX;
		});

		const isSingleSegment = segments.length === 1;

		for (let chain of openChains) chain.wasUpdated = false;

		for (let segment of segments) {
			if (isSingleSegment && previousWasSingleSegment && openChains.length > 0) {
				// Force continuity when both levels have single segments
				appendSegmentToChain(openChains[0], segment.path);
			} else {
				const { bestChain } = findBestChainMatch(openChains, segment.path, tolerance);

				if (bestChain) {
					appendSegmentToChain(bestChain, segment.path);
				} else {
					openChains.push({
						segments: [segment.path],
						lastEndpoint: segment.path[segment.path.length - 1],
						wasUpdated: true,
						startY: sourceY
					});
				}
			}
		}

		previousWasSingleSegment = isSingleSegment;

		// Close chains that didn't get a segment this iteration
		const remainingChains = [];
		for (let chain of openChains) {
			if (chain.wasUpdated) {
				chain.endY = sourceY;
				remainingChains.push(chain);
			} else {
				closedChains.push(chain);
			}
		}
		openChains.length = 0;
		openChains.push(...remainingChains);
	}

	closedChains.push(...openChains);

	return closedChains.map(chain => ({
		segments: chain.segments,
		startY: chain.startY,
		endY: chain.endY
	}));
}

/**
 * Optimizes the order of infill chains using nearest-neighbor algorithm
 * Chains are reordered to minimize tool travel distance between chains
 * Parallel lines (chains) can be cut in either direction
 * @param {Array} chains - Array of chain path objects
 * @returns {Array} Reordered chains with minimal travel distance
 */
function optimizeChainOrder(chains) {
	if (chains.length <= 1) return chains;

	const optimized = [];
	const remaining = chains.slice();

	// Seed: chain whose nearest endpoint (start or end) is closest to the G-code origin
	const ox = (typeof origin !== 'undefined') ? origin.x : 0;
	const oy = (typeof origin !== 'undefined') ? origin.y : 0;
	let seedIdx = 0, seedDist = Infinity, seedReverse = false;
	for (let s = 0; s < remaining.length; s++) {
		const tp = remaining[s].tpath;
		const sp = tp[0], ep = tp[tp.length - 1];
		const ds = (sp.x - ox) ** 2 + (sp.y - oy) ** 2;
		const de = (ep.x - ox) ** 2 + (ep.y - oy) ** 2;
		if (ds < seedDist) { seedDist = ds; seedIdx = s; seedReverse = false; }
		if (de < seedDist) { seedDist = de; seedIdx = s; seedReverse = true; }
	}
	let current = remaining.splice(seedIdx, 1)[0];
	if (seedReverse) current = { ...current, tpath: reversePath(current.tpath) };
	optimized.push(current);
	let tp0 = current.tpath;
	let currentEnd = tp0[tp0.length - 1];

	// Nearest neighbor: repeatedly find closest uncut chain
	while (remaining.length > 0) {
		let nearestIdx = 0;
		let nearestDist = Infinity;
		let shouldReverse = false;

		// Find nearest chain endpoint
		for (let i = 0; i < remaining.length; i++) {
			const tp = remaining[i].tpath;
			const chainStart = tp[0];
			const chainEnd   = tp[tp.length - 1];

			// Distance to start of this chain
			const distToStart = distance(currentEnd, chainStart);
			if (distToStart < nearestDist) {
				nearestDist = distToStart;
				nearestIdx = i;
				shouldReverse = false;
			}

			// Distance to end of this chain (can reverse for parallel infill lines)
			const distToEnd = distance(currentEnd, chainEnd);
			if (distToEnd < nearestDist) {
				nearestDist = distToEnd;
				nearestIdx = i;
				shouldReverse = true;
			}
		}

		// Move nearest chain to optimized list
		current = remaining.splice(nearestIdx, 1)[0];

		if (shouldReverse) {
			current = { ...current, tpath: reversePath(current.tpath) };
		}

		optimized.push(current);
		const tp = current.tpath;
		currentEnd = tp[tp.length - 1];
	}

	return optimized;
}

/**
 * Full pocket path optimizer. Runs after eliminateUnnecessaryRetracts has set passStart flags.
 *
 * Strategy:
 *   1. Group consecutive passStart:false paths into super-chains (they share direct feeds
 *      and must stay together and in order).
 *   2. Run nearest-neighbor ordering over super-chains.
 *      - Single open path (isContour:false): may be reversed for a shorter approach.
 *      - Single closed contour (isContour:true, first==last): may be rotated to the nearest
 *        vertex for a shorter approach.
 *      - Multi-path chains: treated as rigid units (internal order was already optimised and
 *        reversing could invalidate the direct-feed safety checks).
 *   3. Flatten back to individual paths, keeping passStart flags consistent.
 */
function optimizePocketPaths(paths) {
	if (paths.length <= 1) return paths;

	// --- 1. Build super-chains ---
	const chains = [];
	let i = 0;
	while (i < paths.length) {
		const chain = [paths[i]];
		while (i + 1 < paths.length && paths[i + 1].passStart === false) {
			i++;
			chain.push(paths[i]);
		}
		chains.push(chain);
		i++;
	}
	if (chains.length <= 1) return paths;

	function chainStartPt(c) { return c[0].tpath[0]; }
	function chainEndPt(c)   { const tp = c[c.length - 1].tpath; return tp[tp.length - 1]; }
	function dist2(a, b)     { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; }

	function isSingleOpenPath(c) {
		return c.length === 1 && !c[0].isContour;
	}
	function isSingleClosedContour(c) {
		if (c.length !== 1 || !c[0].isContour) return false;
		const tp = c[0].tpath;
		const fp = tp[0], lp = tp[tp.length - 1];
		return (fp.x - lp.x) ** 2 + (fp.y - lp.y) ** 2 < 1e-6;
	}

	// --- 2. Nearest-neighbour ordering ---
	const remaining = chains.slice();
	const ordered   = [];

	// Seed: chain whose start is nearest to the origin
	let seedIdx = 0, seedDist = Infinity;
	for (let i = 0; i < remaining.length; i++) {
		const s = chainStartPt(remaining[i]);
		const d = s.x * s.x + s.y * s.y;
		if (d < seedDist) { seedDist = d; seedIdx = i; }
	}
	let current = remaining.splice(seedIdx, 1)[0];
	ordered.push({ chain: current, action: 'none', rotIdx: 0 });
	let curEnd = chainEndPt(current);

	while (remaining.length > 0) {
		let nearIdx = 0, nearDist = Infinity, nearAction = 'none', nearRot = 0;

		for (let i = 0; i < remaining.length; i++) {
			const c = remaining[i];

			// Approach from the start (normal)
			const d = dist2(curEnd, chainStartPt(c));
			if (d < nearDist) { nearDist = d; nearIdx = i; nearAction = 'none'; }

			// Approach from the end (reverse a single open path)
			if (isSingleOpenPath(c)) {
				const dr = dist2(curEnd, chainEndPt(c));
				if (dr < nearDist) { nearDist = dr; nearIdx = i; nearAction = 'reverse'; }
			}

			// Approach any vertex (rotate a single closed contour)
			if (isSingleClosedContour(c)) {
				const tp = c[0].tpath;
				const core = tp.slice(0, tp.length - 1); // drop duplicate closing pt
				for (let j = 1; j < core.length; j++) {
					const dr = dist2(curEnd, core[j]);
					if (dr < nearDist) { nearDist = dr; nearIdx = i; nearAction = 'rotate'; nearRot = j; }
				}
			}
		}

		const chain = remaining.splice(nearIdx, 1)[0];
		ordered.push({ chain, action: nearAction, rotIdx: nearRot });

		// Advance curEnd based on the action that will be applied
		if (nearAction === 'reverse') {
			curEnd = chainStartPt(chain); // reversed: original start becomes new end
		} else if (nearAction === 'rotate') {
			curEnd = chain[0].tpath[nearRot]; // rotated: new start == new end (closed)
		} else {
			curEnd = chainEndPt(chain);
		}
	}

	// --- 3. Flatten with actions applied ---
	const result = [];
	for (const { chain, action, rotIdx } of ordered) {
		let finalChain = chain;

		if (action === 'reverse') {
			finalChain = [{ ...chain[0], tpath: reversePath(chain[0].tpath) }];
		} else if (action === 'rotate' && rotIdx > 0) {
			const tp   = chain[0].tpath;
			const core = tp.slice(0, tp.length - 1);
			const rotated = core.slice(rotIdx).concat(core.slice(0, rotIdx));
			rotated.push(rotated[0]);
			finalChain = [{ ...chain[0], tpath: rotated }];
		}

		for (let j = 0; j < finalChain.length; j++) {
			// First path of each chain keeps its passStart; rest are direct feeds.
			result.push(j === 0 ? finalChain[j] : { ...finalChain[j], passStart: false });
		}
	}
	return result;
}

/**
 * Nearest-neighbor optimization for a mixed list of path objects ({tpath, isContour, ...}).
 * Infill/chain paths may be reversed for shorter travel; contour paths are never reversed
 * (to preserve climb/conventional direction) but closed contours are rotated to start at
 * the nearest point.
 */
function optimizePathListOrder(paths) {
	if (paths.length <= 1) return paths;

	const optimized = [];
	const remaining = paths.slice();

	// Seed: path closest to the G-code origin (not the canvas corner)
	const ox = (typeof origin !== 'undefined') ? origin.x : 0;
	const oy = (typeof origin !== 'undefined') ? origin.y : 0;
	let bestIdx = 0, bestDist = Infinity;
	for (let i = 0; i < remaining.length; i++) {
		let p = remaining[i].tpath;
		if (!p || p.length === 0) continue;
		// For closed contours check all vertices; for others check both endpoints
		const fp = p[0], lp = p[p.length - 1];
		const isClosed = (fp.x - lp.x) ** 2 + (fp.y - lp.y) ** 2 < 1e-6;
		const pts = isClosed ? p.slice(0, p.length - 1) : [fp, lp];
		for (const pt of pts) {
			const d = (pt.x - ox) ** 2 + (pt.y - oy) ** 2;
			if (d < bestDist) { bestDist = d; bestIdx = i; }
		}
	}
	let current = remaining.splice(bestIdx, 1)[0];
	optimized.push(current);
	let currentEnd = current.tpath[current.tpath.length - 1];

	while (remaining.length > 0) {
		let nearestIdx = 0;
		let nearestDist = Infinity;
		let nearestAction = 'none'; // 'none', 'reverse', or 'rotate'
		let rotateIdx = 0;

		for (let i = 0; i < remaining.length; i++) {
			let tp = remaining[i].tpath;
			if (!tp || tp.length === 0) continue;

			let startPt = tp[0];
			let endPt = tp[tp.length - 1];
			let distToStart = (currentEnd.x - startPt.x) ** 2 + (currentEnd.y - startPt.y) ** 2;

			if (distToStart < nearestDist) {
				nearestDist = distToStart;
				nearestIdx = i;
				nearestAction = 'none';
			}

			if (remaining[i].isContour) {
				// For closed contours, find nearest point and rotate to start there
				for (let j = 1; j < tp.length - 1; j++) { // skip last point (same as first for closed)
					let d = (currentEnd.x - tp[j].x) ** 2 + (currentEnd.y - tp[j].y) ** 2;
					if (d < nearestDist) {
						nearestDist = d;
						nearestIdx = i;
						nearestAction = 'rotate';
						rotateIdx = j;
					}
				}
			} else {
				// For infill/chains, allow reversing
				let distToEnd = (currentEnd.x - endPt.x) ** 2 + (currentEnd.y - endPt.y) ** 2;
				if (distToEnd < nearestDist) {
					nearestDist = distToEnd;
					nearestIdx = i;
					nearestAction = 'reverse';
				}
			}
		}

		current = remaining.splice(nearestIdx, 1)[0];

		if (nearestAction === 'reverse') {
			current = { ...current, tpath: reversePath(current.tpath) };
		} else if (nearestAction === 'rotate' && rotateIdx > 0) {
			// Rotate closed contour to start at the nearest point
			let tp = current.tpath;
			// If last point == first point (closed), drop the duplicate before rotating
			let isClosed = tp.length > 1 &&
				tp[0].x === tp[tp.length - 1].x && tp[0].y === tp[tp.length - 1].y;
			let core = isClosed ? tp.slice(0, -1) : tp;
			let rotated = core.slice(rotateIdx).concat(core.slice(0, rotateIdx));
			if (isClosed) rotated.push(rotated[0]); // re-close
			current = { ...current, tpath: rotated };
		}

		optimized.push(current);
		currentEnd = current.tpath[current.tpath.length - 1];
	}

	return optimized;
}

/**
 * Prune noisy medial axis branches that touch curved parts of the outline.
 * Leaf endpoints near sharp corners (long outline segments) are kept.
 * Leaf endpoints near curves (short outline segments) are pruned.
 */
function pruneNoisyBranches(segments, path, holes, maxRadius) {
	// Build all outline paths (outer + holes)
	var outlines = [path];
	if (holes) outlines = outlines.concat(holes);

	// Use proper graph construction to identify leaf nodes
	var graphResult = parseJSPolySegmentsToGraph(segments);
	var graphNodeMap = graphResult.nodeMap;

	// Find leaf nodes (1 unique connection) that touch the boundary (r ≈ 0)
	var leafsToCheck = [];
	graphNodeMap.forEach(function(n, key) {
		if (n.connections.size === 1 && n.r < maxRadius * 0.1) {
			leafsToCheck.push({ key: key, x: n.x, y: n.y });
		}
	});

	// For each leaf, find the closest point on the outline and check adjacent segment lengths
	var minSegLength = maxRadius * 0.8; // outline segments shorter than this indicate a curve
	var pruneKeys = new Set();

	for (var li = 0; li < leafsToCheck.length; li++) {
		var leaf = leafsToCheck[li];
		var bestDist = Infinity;
		var bestSegLen = 0;

		for (var oi = 0; oi < outlines.length; oi++) {
			var outline = outlines[oi];
			for (var pi = 0; pi < outline.length - 1; pi++) {
				var p1 = outline[pi];
				var p2 = outline[(pi + 1) % outline.length];
				var dx = p2.x - p1.x;
				var dy = p2.y - p1.y;
				var segLen = Math.sqrt(dx * dx + dy * dy);

				// Distance from leaf to each endpoint of this segment
				var lp1x = leaf.x-p1.x, lp1y = leaf.y-p1.y;
				var lp2x = leaf.x-p2.x, lp2y = leaf.y-p2.y;
				var d1 = Math.sqrt(lp1x*lp1x + lp1y*lp1y);
				var d2 = Math.sqrt(lp2x*lp2x + lp2y*lp2y);
				var dMin = Math.min(d1, d2);

				if (dMin < bestDist) {
					bestDist = dMin;
					// Check both adjacent segment lengths at the closest vertex
					// For closed path (last == first), n unique vertices are 0..n-1
					var nVerts = outline.length - 1;
					if (nVerts < 2) continue;
					var closestIdx = d1 < d2 ? pi : (pi + 1) % outline.length;
					if (closestIdx >= nVerts) closestIdx = 0;
					var prevVert = outline[(closestIdx - 1 + nVerts) % nVerts];
					var currVert = outline[closestIdx];
					var nextVert = outline[(closestIdx + 1) % nVerts];
					var l1x = currVert.x-prevVert.x, l1y = currVert.y-prevVert.y;
					var l2x = nextVert.x-currVert.x, l2y = nextVert.y-currVert.y;
					var len1 = Math.sqrt(l1x*l1x + l1y*l1y);
					var len2 = Math.sqrt(l2x*l2x + l2y*l2y);
					bestSegLen = Math.max(len1, len2);
				}
			}
		}

		// Only prune if BOTH adjacent segments are short (curve) - if either is long, it's a corner
		if (bestSegLen < minSegLength) {
			pruneKeys.add(leaf.key);
		}
	}

	if (pruneKeys.size === 0) return segments;

	// Remove segments that have a pruned leaf as an endpoint
	// Trace each pruned leaf back through single-connection nodes
	var segByNode = {};
	for (var i = 0; i < segments.length; i++) {
		var s = segments[i];
		var k0 = `${s.point0.x.toFixed(1)},${s.point0.y.toFixed(1)}`;
		var k1 = `${s.point1.x.toFixed(1)},${s.point1.y.toFixed(1)}`;
		if (!segByNode[k0]) segByNode[k0] = [];
		if (!segByNode[k1]) segByNode[k1] = [];
		segByNode[k0].push(i);
		segByNode[k1].push(i);
	}

	var removeSet = new Set();
	for (var key of pruneKeys) {
		// Walk from leaf along the branch, removing segments until hitting a junction
		var current = key;
		var currentNode = graphNodeMap.get(current);
		while (currentNode && currentNode.connections.size <= 2) {
			var segs = segByNode[current];
			if (!segs) break;
			// Remove ALL segments at current node, then move to the next node
			var nextKey = null;
			for (var si = 0; si < segs.length; si++) {
				if (!removeSet.has(segs[si])) {
					removeSet.add(segs[si]);
					var seg = segments[segs[si]];
					var k0 = `${seg.point0.x.toFixed(1)},${seg.point0.y.toFixed(1)}`;
					var k1 = `${seg.point1.x.toFixed(1)},${seg.point1.y.toFixed(1)}`;
					nextKey = k0 === current ? k1 : k0;
				}
			}
			if (!nextKey) break;
			current = nextKey;
			currentNode = graphNodeMap.get(current);
			if (currentNode && currentNode.connections.size > 2) break;
		}
	}

	return segments.filter((_, i) => !removeSet.has(i));
}

function medialAxis(name, path, holes, svgId, holeSvgIds) {

	let descritize_threshold = 1e-1;
	let descritize_method = 2;
	let filtering_angle = 7 * Math.PI / 8;
	let pointpoint_segmentation_threshold = -1;
	let number_usage = 0;
	let debug_flags = {
		no_parabola: false,
		show_sites: false
	};
	let intermediate_debug_data = null;

	var maxRadius = vbitRadius(currentTool) * viewScale;

	var segments = JSPoly.construct_medial_axis(path, holes, descritize_threshold, descritize_method, filtering_angle, pointpoint_segmentation_threshold, number_usage, debug_flags, intermediate_debug_data);

	// Prune noisy medial axis branches on curves while keeping branches at sharp corners.
	// At a sharp corner, the outline path has long segments meeting at a point.
	// On a curve, the outline path has many short segments (discretization).
	// For each leaf endpoint (r≈0), check the outline path segment lengths nearby.
	segments = pruneNoisyBranches(segments, path, holes, maxRadius);

	var circles = [];
	for (var si = 0; si < segments.length; si++) {
		var seg = segments[si];
		var p = { x: seg.point0.x, y: seg.point0.y, r: Math.min(seg.point0.radius, maxRadius) };
		circles.push(p);
		var p1 = { x: seg.point1.x, y: seg.point1.y, r: Math.min(seg.point1.radius, maxRadius) };
		circles.push(p1);
	}
	circles = clipper.JS.Lighten(circles, getOption("tolerance") * viewScale);

	var tpath = findBestPath(segments).toolpath;

	// Add interpolation points at radius transitions for better visualization
	var tpathWithTransitions = [];
	for (let i = 0; i < tpath.length; i++) {
		var currentRadius = tpath[i].r;

		tpathWithTransitions.push(tpath[i]);

		// Check for transition to next point
		if (i < tpath.length - 1) {
			var nextRadius = tpath[i + 1].r;

			// If transitioning from at-max-radius to below-max-radius
			if (currentRadius >= maxRadius - 0.01 && nextRadius < maxRadius - 0.01) {
				// Calculate interpolation factor where radius drops below maxRadius
				var t = (maxRadius - currentRadius) / (nextRadius - currentRadius);
				if (t > 0 && t < 1) {
					// Insert transition point at the boundary
					var transitionPoint = {
						x: tpath[i].x + t * (tpath[i + 1].x - tpath[i].x),
						y: tpath[i].y + t * (tpath[i + 1].y - tpath[i].y),
						r: maxRadius
					};
					tpathWithTransitions.push(transitionPoint);
				}
			}
			// If transitioning from below-max-radius to at-max-radius (reverse direction)
			else if (currentRadius < maxRadius - 0.01 && nextRadius >= maxRadius - 0.01) {
				// Calculate interpolation factor where radius rises above maxRadius
				var t = (maxRadius - currentRadius) / (nextRadius - currentRadius);
				if (t > 0 && t < 1) {
					// Insert transition point at the boundary
					var transitionPoint = {
						x: tpath[i].x + t * (tpath[i + 1].x - tpath[i].x),
						y: tpath[i].y + t * (tpath[i + 1].y - tpath[i].y),
						r: maxRadius
					};
					tpathWithTransitions.push(transitionPoint);
				}
			}
		}
	}
	tpath = tpathWithTransitions;

	// Now clamp all radii to maxRadius
	for (var p of tpath) {
		p.r = Math.min(p.r, maxRadius)
	}
	var paths = [{ path: circles, tpath: tpath }];

	// Collect all SVG IDs: outer path + all holes
	var allSvgIds = [svgId];
	if (holeSvgIds && holeSvgIds.length > 0) {
		allSvgIds = allSvgIds.concat(holeSvgIds);
	}

	pushToolPath(paths, name, 'VCarve', svgId, allSvgIds);
}

function computeWithMedialAxis(outside, name) {
	var selected = selectMgr.selectedPaths();
	var paths = [];

	// Clear hole flags from any previous computation
	for (var i = 0; i < selected.length; i++) {
		delete selected[i].hole;
	}

	// Sort by bounding box area (largest first) so outer paths are processed before holes
	selected.sort(function(a, b) {
		var bboxA = boundingBox(a.path);
		var bboxB = boundingBox(b.path);
		var areaA = (bboxA.maxx - bboxA.minx) * (bboxA.maxy - bboxA.miny);
		var areaB = (bboxB.maxx - bboxB.minx) * (bboxB.maxy - bboxB.miny);
		return areaB - areaA;
	});

	// Phase 1: hole detection in area-sorted order, but defer carving.
	var letters = [];
	for (var i = 0; i < selected.length; i++) {
		if (selected[i].hole) continue;
		var holes = []
		var holeSvgIds = []
		var path = selected[i].path;
		for (var j = 0; j < selected.length; j++) {
			if (i !== j && !selected[j].hole) {
				if (pathIn(path, selected[j].path)) {
					holes.push(selected[j].path);
					holeSvgIds.push(selected[j].id);
					selected[j].hole = true;
				}
			}
		}
		var bbox = boundingBox(path);
		letters.push({
			path: path,
			holes: holes,
			id: selected[i].id,
			holeSvgIds: holeSvgIds,
			cx: (bbox.minx + bbox.maxx) / 2,
			cy: (bbox.miny + bbox.maxy) / 2
		});
	}

	// Phase 2: reorder by nearest-neighbor tour starting from the top-left letter,
	// so toolpaths carve in a spatially coherent order and travel moves stay short.
	// O(n^2) over letters, which is small.
	var ordered = [];
	if (letters.length > 0) {
		var startIdx = 0;
		var bestScore = Infinity;
		for (var k = 0; k < letters.length; k++) {
			// Prefer top-left: minimize (cx + cy) using canvas coords where smaller y is higher.
			var score = letters[k].cx + letters[k].cy;
			if (score < bestScore) { bestScore = score; startIdx = k; }
		}
		var remaining = letters.slice();
		var current = remaining.splice(startIdx, 1)[0];
		ordered.push(current);
		while (remaining.length > 0) {
			var nearest = 0;
			var nearestDist = Infinity;
			for (var m = 0; m < remaining.length; m++) {
				var dx = remaining[m].cx - current.cx;
				var dy = remaining[m].cy - current.cy;
				var d = dx * dx + dy * dy;
				if (d < nearestDist) { nearestDist = d; nearest = m; }
			}
			current = remaining.splice(nearest, 1)[0];
			ordered.push(current);
		}
	}

	// Phase 3: carve in the ordered sequence.
	for (var n = 0; n < ordered.length; n++) {
		var L = ordered[n];
		medialAxis(name, L.path, L.holes, L.id, L.holeSvgIds);
	}

}

function computeVcarve(outside, name) {
	var radius = vbitRadius(currentTool) * viewScale;
	var overCutWorld = (currentTool.overCut || 0) * viewScale;
	var selected = selectMgr.selectedPaths();

	for (var i = 0; i < selected.length; i++) {
		var svgpath = selected[i];
		var paths = [];
		var path = svgpath.path;

		var r = radius;

		if (outside)
			nearbypaths = nearbyPaths(svgpath, radius);
		else
			nearbypaths = nearbyPaths(svgpath, 1);

		var cw = isClockwise(path);
		if (outside) cw = !cw;

		var subpath = subdividePath(path, 2);

		norms = makeNorms(subpath, path, cw, 1, outside);
		drawNorms(norms)

		var circles = largestEmptyCircles(norms, r, subpath);

		// Apply overcut: shift each circle along its norm direction
		// norms[j] has the unit vector (dx,dy) pointing toward the cut side
		if (overCutWorld !== 0) {
			for (var j = 0; j < norms.length; j++) {
				circles[j].x += norms[j].dx * overCutWorld;
				circles[j].y += norms[j].dy * overCutWorld;
			}
			// circles[norms.length] is the closing duplicate of circles[0] (same object ref),
			// so it was already updated above
		}
		var tpath = clipper.JS.Lighten(circles, getOption("tolerance") * viewScale);

		// Determine if path should be reversed based on direction and inside/outside
		var shouldReverse = outside ? (currentTool.direction != "climb") : (currentTool.direction == "climb");
		if (shouldReverse) {
			paths.push({ path: reversePath(circles), tpath: reversePath(tpath) });
		} else {
			paths.push({ path: circles, tpath: tpath });
		}

		pushToolPath(paths, name, 'VCarve', svgpath.id);
	}

}

