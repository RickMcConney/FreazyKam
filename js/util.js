function closestPointOnSegment(point, segStart, segEnd) {
	const dx = segEnd.x - segStart.x;
	const dy = segEnd.y - segStart.y;
	const lengthSquared = dx * dx + dy * dy;

	if (lengthSquared === 0) {
		return { x: segStart.x, y: segStart.y };
	}

	let t = ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSquared;
	t = Math.max(0, Math.min(1, t));

	return {
		x: segStart.x + t * dx,
		y: segStart.y + t * dy
	};
}

function worldToScreen(x, y) {
	return {
		x: (x * zoomLevel + panX),
		y: (y * zoomLevel + panY)
	};
}

function screenToWorld(x, y) {
	return {
		x: (x - panX) / zoomLevel,
		y: (y - panY) / zoomLevel
	};
}

// ============================================================================
// UNIT CONVERSION CONSTANTS & FUNCTIONS
// ============================================================================

var MM_PER_INCH = 25.4;

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

// Convert decimal inches to nearest fraction
// Returns {whole, numerator, denominator} or null if should show decimal
function decimalToFraction(decimal, maxDenominator) {
	maxDenominator = maxDenominator || 64;

	// Extract whole number part
	var whole = Math.floor(Math.abs(decimal));
	var fractional = Math.abs(decimal) - whole;

	// If very close to whole number, return it
	if (fractional < 0.001) {
		return { whole: whole * Math.sign(decimal || 1), numerator: 0, denominator: 1 };
	}

	// Try common woodworking denominators: 2, 4, 8, 16, 32, 64
	var denominators = [2, 4, 8, 16, 32, 64].filter(d => d <= maxDenominator);
	var bestDenom = 1;
	var bestNumer = 0;
	var bestError = 1;

	for (var i = 0; i < denominators.length; i++) {
		var denom = denominators[i];
		var numer = Math.round(fractional * denom);
		var error = Math.abs(fractional - numer / denom);

		if (error < bestError) {
			bestError = error;
			bestDenom = denom;
			bestNumer = numer;
		}
	}

	// If error is too large, return null to indicate decimal display
	if (bestError > 0.01) {
		return null;
	}

	// Simplify fraction
	var divisor = gcd(bestNumer, bestDenom);
	bestNumer /= divisor;
	bestDenom /= divisor;

	// If fraction equals 1 (numerator == denominator), add to whole number
	if (bestNumer === bestDenom) {
		return {
			whole: (whole + 1) * Math.sign(decimal || 1),
			numerator: 0,
			denominator: 1
		};
	}

	return {
		whole: whole * Math.sign(decimal || 1),
		numerator: bestNumer,
		denominator: bestDenom
	};
}

// Format a dimension in mm to display string (mm or inches with fractions)
function formatDimension(mm, showFractions) {

	var useInches = typeof getOption !== 'undefined' ? getOption('Inches') : false;
	if (!useInches) {
		// Metric display
		return parseFloat(mm).toFixed(1)+' mm';
	}

	// Convert to inches
	var inches = mm / MM_PER_INCH;

	// For very small values, show decimal
	if (Math.abs(inches) < 0.01) {
		return inches.toFixed(3)+' in';
	}

	if (!showFractions) {
		// Decimal inches
		return inches.toFixed(3)+' in';
	}

	// Try to convert to fraction
	var frac = decimalToFraction(inches, 64);

	if (!frac) {
		// Couldn't convert to clean fraction, use decimal
		return inches.toFixed(3)+' in';
	}

	// Build fraction string
	var result = '';
	var sign = frac.whole < 0 || inches < 0 ? '-' : '';
	var absWhole = Math.abs(frac.whole);

	if (absWhole > 0) {
		result += sign + absWhole;
		if (frac.numerator > 0) {
			result += ' ';
		}
	} else if (frac.numerator > 0) {
		// No whole part, just fraction - include sign
		result = sign;
	}

	if (frac.numerator > 0) {
		result += frac.numerator + '/' + frac.denominator;
	}

	return (result || '0') + ' in';
}

// Parse user input dimension back to mm
function parseDimension(value) {
	if (!value) return 0;
	var isInches = typeof getOption !== 'undefined' ? getOption('Inches') : false;
	// Convert to string and trim
	value = String(value).trim();

	if(value.indexOf("m")>0) isInches = false;
	else if(value.indexOf("i")>0) isInches = true;

	if (!isInches) {
		// Parse as mm
		return parseFloat(value) || 0;
	}

	// Parse inches - could be decimal or fraction
	// Support formats: "3.5", "3 1/2", "1/4", "3-1/2"

	var whole = 0;
	var numerator = 0;
	var denominator = 1;

	// Check for fraction
	var fractionMatch = value.match(/(\d+)\s*\/\s*(\d+)/);
	if (fractionMatch) {
		numerator = parseInt(fractionMatch[1]);
		denominator = parseInt(fractionMatch[2]);

		// Check for whole number before fraction
		var wholeMatch = value.match(/^(-?\d+)\s+\d+\/\d+/);
		if (wholeMatch) {
			whole = parseInt(wholeMatch[1]);
		}
	} else {
		// Just a decimal or whole number
		whole = parseFloat(value) || 0;
	}

	// Combine and convert to mm
	var totalInches = Math.abs(whole) + (numerator / denominator);
	if (whole < 0 || value.trim().startsWith('-')) {
		totalInches = -totalInches;
	}

	return totalInches * MM_PER_INCH;
}

// Maximum squared distance threshold for path highlighting; margin = sqrt of this
var CLOSEST_PATH_THRESHOLD_SQ = 100;
var CLOSEST_PATH_BBOX_MARGIN = 10; // sqrt(CLOSEST_PATH_THRESHOLD_SQ)

function findClosestPath(pt) {
	var overallMin = Infinity;
	var bestPath = null;

	for (var i = 0; i < svgpaths.length; i++) {
		if (!svgpaths[i].visible) continue;

		var bbox = svgpaths[i].bbox;
		if (pt.x < bbox.minx - CLOSEST_PATH_BBOX_MARGIN || pt.x > bbox.maxx + CLOSEST_PATH_BBOX_MARGIN ||
		    pt.y < bbox.miny - CLOSEST_PATH_BBOX_MARGIN || pt.y > bbox.maxy + CLOSEST_PATH_BBOX_MARGIN) {
			continue;
		}

		// Image paths are selectable by clicking anywhere inside their bounding box
		if (svgpaths[i].type === 'image') {
			if (pt.x >= bbox.minx && pt.x <= bbox.maxx && pt.y >= bbox.miny && pt.y <= bbox.maxy) {
				if (1 < overallMin) {
					overallMin = 1;
					bestPath = svgpaths[i];
				}
			}
			continue;
		}

		var path = svgpaths[i].path;
		var minDist = Infinity;
		for (var j = 0; j < path.length; j++) {
			var d = distToSegmentSquared(pt, path[j], path[(j + 1) % path.length]);
			if (d < minDist) minDist = d;
		}

		if (minDist < overallMin && minDist < CLOSEST_PATH_THRESHOLD_SQ) {
			overallMin = minDist;
			bestPath = svgpaths[i];
		}
	}

	return bestPath;
}

function closestPath(pt, clear) {
	if (clear) {
		for (var i = 0; i < svgpaths.length; i++) svgpaths[i].highlight = false;
	}
	var found = findClosestPath(pt);
	if (found) {
		found.highlight = true;
		redraw();
	}
	return found;
}

function closestPoint(pt) {
	var min = Infinity;
	var cx;
	var cy;

	var possiblePath = [];


	for (var i = 0; i < svgpaths.length; i++) {
		if (!svgpaths[i].visible) continue;
		var bbox = svgpaths[i].bbox;
		if (pointInBoundingBox(pt, bbox)) {
			possiblePath.push(svgpaths[i].path);
		}
	}

	for (var i = 0; i < possiblePath.length; i++) {

		var path = possiblePath[i];

		for (var j = 0; j < path.length; j++) {
			var k = (j + 1) % path.length;
			var midx = path[j].x + (path[k].x - path[j].x) / 2;
			var midy = path[j].y + (path[k].y - path[j].y) / 2;
			var dx = path[j].x - pt.x;
			var dy = path[j].y - pt.y;
			var dist = dx * dx + dy * dy;
			if (dist < min) {
				min = dist;
				cx = path[j].x;
				cy = path[j].y;
			}
			dx = midx - pt.x;
			dy = midy - pt.y;
			dist = dx * dx + dy * dy;
			if (dist < min) {
				min = dist;
				cx = midx;
				cy = midy;
			}
		}
	}
	return { x: cx !== undefined ? cx : pt.x, y: cy !== undefined ? cy : pt.y, dist: min };
}

function boundingBoxPaths(paths) {
	var outerBbox = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity }
	for (var i = 0; i < paths.length; i++) {

		var bbox = paths[i].bbox;
		if (outerBbox.minx > bbox.minx) outerBbox.minx = bbox.minx;
		if (outerBbox.miny > bbox.miny) outerBbox.miny = bbox.miny;
		if (outerBbox.maxx < bbox.maxx) outerBbox.maxx = bbox.maxx;
		if (outerBbox.maxy < bbox.maxy) outerBbox.maxy = bbox.maxy;
	}
	return outerBbox;
}

// Minimum bbox extent (world units) — keeps degenerate paths (single point, flat line)
// hittable by giving them a small but non-zero area for hit testing.
var BBOX_MIN_EXTENT = 2;

function boundingBox(path) {
	if (!path || path.length === 0) {
		return { minx: 0, miny: 0, maxx: 0, maxy: 0 };
	}
	var bbox = { minx: path[0].x, miny: path[0].y, maxx: path[0].x, maxy: path[0].y }
	for (var i = 0; i < path.length; i++) {
		if (bbox.minx > path[i].x) bbox.minx = path[i].x;
		if (bbox.miny > path[i].y) bbox.miny = path[i].y;
		if (bbox.maxx < path[i].x) bbox.maxx = path[i].x;
		if (bbox.maxy < path[i].y) bbox.maxy = path[i].y;
	}
	if (bbox.maxx - bbox.minx < BBOX_MIN_EXTENT) { bbox.maxx++; bbox.minx--; }
	if (bbox.maxy - bbox.miny < BBOX_MIN_EXTENT) { bbox.maxy++; bbox.miny--; }
	return bbox;
}

function isClockwise(path) {
	return getSignedArea(path) > 0;
}

function sqr(x) {
	return x * x
}
function dist2(v, w) {
	return sqr(v.x - w.x) + sqr(v.y - w.y)
}

function distToSegmentSquared(p, v, w) {
	var l2 = dist2(v, w);

	if (l2 === 0) {
		return dist2(p, v);
	}


	var t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;

	if (t < 0) return dist2(p, v);
	if (t > 1) return dist2(p, w);


	return dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

function distanceToClosestPath(pt, path, r) {

	var min = Infinity;

	for (var i = 0; i < path.length; i++) {
		var j = (i + 1) % path.length;
		var start = path[i];
		var end = path[j];
		var dist = distToSegmentSquared(pt, start, end);
		if (dist < min) min = dist;
	}
	return Math.sqrt(min);
}


function distToNearestSegment(pt, path, r) {

	var rs = r * r;

	for (var i = 0; i < path.length - 1; i++) {
		var j = (i + 1) % path.length;
		var start = path[i];
		var end = path[j];
		var dist = distToSegmentSquared(pt, start, end);

		if (dist < rs) {
			var diff = rs - dist;
			if (diff > 0.01) {
				return Math.sqrt(dist);
			}
		}
	}
	return r;
}

function pointInBoundingBox(point, bbox) {
	return (point.x > bbox.minx && point.x < bbox.maxx && point.y > bbox.miny && point.y < bbox.maxy);
}

function nearbyPaths(svgpath, radius) {
	var bbox = {};
	var d = 2 * radius;

	Object.assign(bbox, svgpath.bbox);
	bbox.minx -= d;
	bbox.maxx += d;
	bbox.miny -= d;
	bbox.maxy += d;

	var paths = [];
	for (var j = 0; j < svgpaths.length; j++) {
		if (svgpaths[j].visible) {
			var b = svgpaths[j].bbox;
			// Check if the two bounding boxes overlap (any corner of b is inside bbox)
			if (!(b.maxx < bbox.minx || b.minx > bbox.maxx || b.maxy < bbox.miny || b.miny > bbox.maxy))
				paths.push(svgpaths[j]);
		}
	}
	return paths;
}

function lineIntersectsPath(p0, p1, path) {
	var count = 0;
	for (var i = 0, j = path.length - 2; i < path.length - 1; j = i++) {
		var p2 = { x: path[i].x, y: path[i].y };
		var p3 = { x: path[j].x, y: path[j].y };
		count += lineIntersects(p0, p1, p2, p3);
	}
	return count;
}

function lineIntersects(p0, p1, p2, p3) {

	var s1_x, s1_y, s2_x, s2_y;
	s1_x = p1.x - p0.x;
	s1_y = p1.y - p0.y;
	s2_x = p3.x - p2.x;
	s2_y = p3.y - p2.y;

	var s, t;
	s = (-s1_y * (p0.x - p2.x) + s1_x * (p0.y - p2.y)) / (-s2_x * s1_y + s1_x * s2_y);
	t = (s2_x * (p0.y - p2.y) - s2_y * (p0.x - p2.x)) / (-s2_x * s1_y + s1_x * s2_y);

	if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
		// Collision detected
		return 1;
	}

	return 0; // No collision
}

function pointInPolygon(point, path) {

	var x = point.x, y = point.y;
	var epsilon = 0.1;

	var inside = false;
	for (var i = 0, j = path.length - 2; i < path.length - 1; j = i++) {
		var xi = path[i].x, yi = path[i].y;
		var xj = path[j].x, yj = path[j].y;

		// Check if point is on (or within epsilon of) this edge segment
		var edx = xj - xi, edy = yj - yi;
		var edLen = Math.sqrt(edx * edx + edy * edy);
		if (edLen > 0) {
			// Perpendicular distance from point to infinite line
			var dist = Math.abs(edx * (yi - y) - edy * (xi - x)) / edLen;
			if (dist <= epsilon) {
				// Check if projection falls within the segment
				var t = ((x - xi) * edx + (y - yi) * edy) / (edLen * edLen);
				if (t >= -0.01 && t <= 1.01) return true;
			}
		}

		var intersect = ((yi > y) != (yj > y))
			&& (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
		if (intersect) inside = !inside;
	}

	return inside;
}

// Fractional offsets [fx, fy] for each named origin position (width * fx, length * fy)
var ORIGIN_POSITION_OFFSETS = {
	'top-left':      [0,   0  ],
	'top-center':    [0.5, 0  ],
	'top-right':     [1,   0  ],
	'middle-left':   [0,   0.5],
	'middle-center': [0.5, 0.5],
	'middle-right':  [1,   0.5],
	'bottom-left':   [0,   1  ],
	'bottom-center': [0.5, 1  ],
	'bottom-right':  [1,   1  ]
};

// Calculate origin coordinates based on position and workpiece dimensions
function calculateOriginFromPosition(position, width, length) {
	var off = ORIGIN_POSITION_OFFSETS[position] || ORIGIN_POSITION_OFFSETS['middle-center'];
	return { x: width * off[0], y: length * off[1] };
}

/**
 * Calculates the signed area of a path
 * Used to determine winding order (clockwise vs counter-clockwise)
 * @param {Array} path - Array of {x, y} points
 * @returns {number} Signed area - positive for counter-clockwise, negative for clockwise
 */
function getSignedArea(path) {
	if (!path || path.length < 3) return 0;

	let area = 0;
	for (let i = 0; i < path.length - 1; i++) {
		area += (path[i+1].x - path[i].x) * (path[i+1].y + path[i].y);
	}
	return area;
}

/**
 * Normalizes winding order of paths to counter-clockwise
 * Ensures consistent behavior regardless of how paths are drawn by user
 * @param {Array} inputPaths - Array of paths (each path is array of {x, y} points)
 * @returns {Array} All paths normalized to counter-clockwise winding order
 */
function normalizeWindingOrder(inputPaths) {
	if (!inputPaths || inputPaths.length === 0) return inputPaths;

	// Single path - normalize to counter-clockwise
	if (inputPaths.length === 1) {
		const signedArea = getSignedArea(inputPaths[0]);
		if (signedArea < 0) {
			// Clockwise - reverse to counter-clockwise
			return [reversePath(inputPaths[0])];
		}
		return inputPaths;
	}

	// Multiple paths - identify outer (largest) vs inner (islands)
	const pathsWithArea = inputPaths.map((path, idx) => {
		const signed = getSignedArea(path);
		return {
			path: path,
			area: Math.abs(signed),
			signedArea: signed,
			isClockwise: signed < 0,
			index: idx
		};
	});

	// Largest area path is the outer boundary
	const outerPathData = pathsWithArea.reduce((max, p) =>
		p.area > max.area ? p : max
	);

	// Inner paths are islands/holes
	const innerPathsData = pathsWithArea.filter(p => p.index !== outerPathData.index);

	// Normalize winding - all paths to counter-clockwise
	const normalized = [];

	// Outer path should be counter-clockwise
	if (outerPathData.isClockwise) {
		normalized.push(reversePath(outerPathData.path));
	} else {
		normalized.push(outerPathData.path);
	}

	// Inner paths (islands) should also be counter-clockwise
	for (let i = 0; i < innerPathsData.length; i++) {
		const innerData = innerPathsData[i];
		if (innerData.isClockwise) {
			// Clockwise - reverse to counter-clockwise
			normalized.push(reversePath(innerData.path));
		} else {
			// Already counter-clockwise - use as-is
			normalized.push(innerData.path);
		}
	}

	return normalized;
}
/**
 * Rotate a point around a center by a given angle in radians
 * @param {Object} point - Point with x, y coordinates
 * @param {number} centerX - Center X coordinate
 * @param {number} centerY - Center Y coordinate
 * @param {number} angleRad - Rotation angle in radians
 * @returns {Object} Rotated point
 */
function rotatePoint(point, centerX, centerY, angleRad) {
	const cos = Math.cos(angleRad);
	const sin = Math.sin(angleRad);
	const dx = point.x - centerX;
	const dy = point.y - centerY;
	return {
		x: centerX + dx * cos - dy * sin,
		y: centerY + dx * sin + dy * cos
	};
}

function pathIn(outer, inner) {
	var insideCount = 0;
	for (var i = 0; i < inner.length; i++) {
		if (pointInPolygon(inner[i], outer))
			insideCount++;
	}
	return insideCount > inner.length * 0.8;
}

// Replay stored transform history on a svgpath's points
function applyTransformHistory(svgpath) {
	if (!svgpath.transformHistory || svgpath.transformHistory.length === 0) return;

	for (const t of svgpath.transformHistory) {
		svgpath.path = svgpath.path.map(pt => {
			// Scale around center
			let newX = t.centerX + (pt.x - t.centerX) * t.scaleX;
			let newY = t.centerY + (pt.y - t.centerY) * t.scaleY;

			// Skew around center
			if (t.skewX !== 0 || t.skewY !== 0) {
				const dx = newX - t.centerX;
				const dy = newY - t.centerY;
				newX = t.centerX + dx + dy * Math.tan(-t.skewX * Math.PI / 180);
				newY = t.centerY + dy + dx * Math.tan(t.skewY * Math.PI / 180);
			}

			// Rotate around pivot
			const rotRad = -t.rotation * Math.PI / 180;
			if (rotRad !== 0) {
				const dx = newX - t.pivotCenterX;
				const dy = newY - t.pivotCenterY;
				newX = t.pivotCenterX + (dx * Math.cos(rotRad) - dy * Math.sin(rotRad));
				newY = t.pivotCenterY + (dx * Math.sin(rotRad) + dy * Math.cos(rotRad));
			}

			// Translate
			newX += t.deltaX;
			newY += t.deltaY;
			return { x: newX, y: newY };
		});
	}
	svgpath.bbox = boundingBox(svgpath.path);
}

function reversePath(path) {
	return path.slice().reverse();
}

// Helper function: Calculate distance between two points
function distance(p1, p2) {
	const dx = p2.x - p1.x, dy = p2.y - p1.y;
	return Math.sqrt(dx * dx + dy * dy);
}
