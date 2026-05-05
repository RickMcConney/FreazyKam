function load() {
	fileInput.click();
}

function getElementTypeName(tagName) {
	var names = {
		'path': 'Path', 'rect': 'Rect', 'circle': 'Circle',
		'ellipse': 'Ellipse', 'line': 'Line', 'polyline': 'PolyLine', 'polygon': 'Poly'
	};
	return names[tagName.toLowerCase()] || tagName;
}

function getPerpendicularDistance(p, p1, p2) {
	var dx = p2.x - p1.x;
	var dy = p2.y - p1.y;
	if (dx === 0 && dy === 0) {
		return Math.sqrt(Math.pow(p.x - p1.x, 2) + Math.pow(p.y - p1.y, 2));
	}
	var numerator = Math.abs(dy * p.x - dx * p.y + p2.x * p1.y - p2.y * p1.x);
	return numerator / Math.sqrt(dx * dx + dy * dy);
}

function simplifyPoints(points, epsilon) {
	if (points.length <= 2) return points;
	var dmax = 0, index = 0;
	var last = points.length - 1;
	for (var i = 1; i < last; i++) {
		var d = getPerpendicularDistance(points[i], points[0], points[last]);
		if (d > dmax) { index = i; dmax = d; }
	}
	if (dmax > epsilon) {
		var res1 = simplifyPoints(points.slice(0, index + 1), epsilon);
		var res2 = simplifyPoints(points.slice(index), epsilon);
		return res1.slice(0, res1.length - 1).concat(res2);
	}
	return [points[0], points[last]];
}

// Tessellate normalized path data segments into {x,y} points
function midpoint(a, b) {
	return {
		x: (a.x + b.x) / 2,
		y: (a.y + b.y) / 2
	};
}

function flattenCubic(points, p0, p1, p2, p3, tolerance, depth) {
	depth = depth || 0;
	var d1 = getPerpendicularDistance(p1, p0, p3);
	var d2 = getPerpendicularDistance(p2, p0, p3);
	if (Math.max(d1, d2) <= tolerance || depth >= 16) {
		points.push({ x: p3.x, y: p3.y });
		return;
	}

	var p01 = midpoint(p0, p1);
	var p12 = midpoint(p1, p2);
	var p23 = midpoint(p2, p3);
	var p012 = midpoint(p01, p12);
	var p123 = midpoint(p12, p23);
	var p0123 = midpoint(p012, p123);

	flattenCubic(points, p0, p01, p012, p0123, tolerance, depth + 1);
	flattenCubic(points, p0123, p123, p23, p3, tolerance, depth + 1);
}

function flattenQuadratic(points, p0, p1, p2, tolerance, depth) {
	depth = depth || 0;
	if (getPerpendicularDistance(p1, p0, p2) <= tolerance || depth >= 16) {
		points.push({ x: p2.x, y: p2.y });
		return;
	}

	var p01 = midpoint(p0, p1);
	var p12 = midpoint(p1, p2);
	var p012 = midpoint(p01, p12);

	flattenQuadratic(points, p0, p01, p012, tolerance, depth + 1);
	flattenQuadratic(points, p012, p12, p2, tolerance, depth + 1);
}

function getPointsFromSegments(segments, tolerance) {
	tolerance = Math.max(tolerance || 0.01, 0.001);
	var points = [];
	var lastX = 0, lastY = 0;
	var start = {x:0,y:0};

	for (var i = 0; i < segments.length; i++) {
		var seg = segments[i];
		var v = seg.values;
		switch (seg.type) {
			case 'M':
				start = {x: v[0], y: v[1]};
				points.push(start);
				lastX = start.x; lastY = start.y;
				break;
			case 'L':
				points.push({ x: v[0], y: v[1] });
				lastX = v[0]; lastY = v[1];
				break;
			case 'C':
				flattenCubic(
					points,
					{ x: lastX, y: lastY },
					{ x: v[0], y: v[1] },
					{ x: v[2], y: v[3] },
					{ x: v[4], y: v[5] },
					tolerance
				);
				lastX = v[4]; lastY = v[5];
				break;
			case 'Q':
				flattenQuadratic(
					points,
					{ x: lastX, y: lastY },
					{ x: v[0], y: v[1] },
					{ x: v[2], y: v[3] },
					tolerance
				);
				lastX = v[2]; lastY = v[3];
				break;
			case 'Z':
				if (lastX !== start.x || lastY !== start.y) {
					points.push({ x: start.x, y: start.y });
					lastX = start.x; lastY = start.y;
				}
				break;
		}
	}
	return points;
}

// Split normalized path segments at sub-path boundaries (each M after the first)
function splitSegmentsAtSubpaths(segments) {
	var subpaths = [];
	var current = [];
	for (var i = 0; i < segments.length; i++) {
		if (segments[i].type === 'M' && current.length > 0) {
			subpaths.push(current);
			current = [];
		}
		current.push(segments[i]);
	}
	if (current.length > 0) subpaths.push(current);
	return subpaths;
}

// Center on workpiece and register parsed SVG paths
function importParsedPaths(paths, name) {
	addUndo(false, true, false);

	const svgGroupId = 'svg-group-' + Date.now();
	const groupedPaths = [];

	// Bounding box across all imported paths
	var importedBbox = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity };
	for (var i = 0; i < paths.length; i++) {
		var b = boundingBox(paths[i].geom);
		importedBbox.minx = Math.min(importedBbox.minx, b.minx);
		importedBbox.miny = Math.min(importedBbox.miny, b.miny);
		importedBbox.maxx = Math.max(importedBbox.maxx, b.maxx);
		importedBbox.maxy = Math.max(importedBbox.maxy, b.maxy);
	}

	// Offset to center the whole import on the workpiece
	var offsetX = (getOption("workpieceWidth")  * viewScale) / 2 - (importedBbox.minx + importedBbox.maxx) / 2;
	var offsetY = (getOption("workpieceLength") * viewScale) / 2 - (importedBbox.miny + importedBbox.maxy) / 2;

	for (var i = 0; i < paths.length; i++) {
		var geom = paths[i].geom;
		for (var j = 0; j < geom.length; j++) {
			geom[j].x += offsetX;
			geom[j].y += offsetY;
		}

		const pathObj = {
			id: paths[i].name + svgpathId,
			name: paths[i].name + ' ' + svgpathId,
			path: geom,
			visible: true,
			bbox: boundingBox(geom),
			svgGroupId: svgGroupId
		};
		svgpaths.push(pathObj);
		groupedPaths.push(pathObj);
		svgpathId++;
	}

	if (typeof addSvgGroup === 'function' && groupedPaths.length > 0) {
		addSvgGroup(svgGroupId, name, groupedPaths);
	}
}

function detectSvgPixelsPerInch(data) {
	if (data.indexOf("Adobe Illustrator") >= 0) {
		return 72;
	}
	//if (data.indexOf("woodgears.ca") >= 0) {
	//	return 254;
	//}
	if (data.indexOf("tinkercad") >= 0) {
		return 25.4;
	}
	return null;
}

async function resolveSvgPixelsPerInch(data) {
	var detectedPpi = detectSvgPixelsPerInch(data);
	if (detectedPpi !== null) return detectedPpi;

	if (typeof showSvgPpiModal === 'function') {
		return await showSvgPpiModal(96);
	}

	var entered = window.prompt('This SVG does not identify its pixels-per-inch scale. Enter the PPI value to use for import:', '96');
	var ppi = parseFloat(entered);
	return isFinite(ppi) && ppi > 0 ? ppi : null;
}

function parseSvgDimToMM(attr, ppi) {
	if (!attr) return null;
	var m = attr.match(/^([\d.]+)\s*(mm|cm|in|px|pt|pc)?$/i);
	if (!m) return null;
	var v = parseFloat(m[1]);
	switch ((m[2] || 'px').toLowerCase()) {
		case 'mm': return v;
		case 'cm': return v * 10;
		case 'in': return v * 25.4;
		case 'pt': return v * 25.4 / 72;
		case 'pc': return v * 25.4 / 6;
		case 'px': return ppi ? v * 25.4 / ppi : null;
	}
	return null;
}

function svgDimUsesPixels(attr) {
	if (!attr) return false;
	var m = attr.match(/^([\d.]+)\s*(mm|cm|in|px|pt|pc)?$/i);
	return !!m && (!m[2] || m[2].toLowerCase() === 'px');
}

async function parseSvgContent(data, name) {
	try {
		// svgscale resolved after parsing (needs viewBox); set a safe default for now
		pixelsPerInch = detectSvgPixelsPerInch(data);
		svgscale = viewScale * 25.4 / (pixelsPerInch || 96);

		// Parse as XML so namespace-prefixed child elements (e.g. <d:SVGTestCase>)
		// containing HTML block elements like <p> don't cause the HTML parser to
		// exit SVG foreign-content mode and lose the subsequent <path>/<rect> elements.
		// After parsing, adopt the root SVG into a live-document container so that
		// getScreenCTM() works (requires elements to be in the rendered tree).
		var container = document.createElement('div');
		container.style.cssText = 'position:fixed;top:-10000px;left:-10000px;visibility:hidden';
		document.body.appendChild(container);

		// Try XML parser first — it correctly handles namespace-prefixed child elements
		// (e.g. <d:SVGTestCase> containing <p>) that cause the HTML parser to exit
		// SVG foreign-content mode and lose the subsequent shape elements.
		// Fall back to innerHTML if the XML parse fails OR the root element has no SVG
		// namespace (common in hand-written SVGs that omit xmlns="..."), since without
		// the namespace declaration DOMParser produces plain Elements, not SVGSVGElements.
		// Try XML parser first — it correctly handles namespace-prefixed child elements
		// (e.g. <d:SVGTestCase> containing <p>) that cause the HTML parser to exit
		// SVG foreign-content mode and lose the subsequent shape elements.
		// Fall back to innerHTML if the XML parse fails OR the root element has no SVG
		// namespace (common in hand-written SVGs that omit xmlns="..."), since without
		// the namespace declaration DOMParser produces plain Elements, not SVGSVGElements.
		var svgEl = null;
		var xmlDoc = new DOMParser().parseFromString(data, 'image/svg+xml');
		if (!xmlDoc.querySelector('parsererror')) {
			var adopted = document.adoptNode(xmlDoc.documentElement);
			container.appendChild(adopted);
			if (typeof adopted.getScreenCTM === 'function') svgEl = adopted;
			else container.removeChild(adopted);
		}
		if (!svgEl) {
			// Fallback: HTML parser (handles SVGs without xmlns declaration)
			container.innerHTML = data;
			svgEl = container.querySelector('svg');
		}

		if (!svgEl) {
			document.body.removeChild(container);
			console.error('parseSvgContent: no <svg> element found');
			return null;
		}

		var vb = svgEl.viewBox && svgEl.viewBox.baseVal;
		var vbx = vb ? vb.x || 0 : 0;
		var vby = vb ? vb.y || 0 : 0;

		// Resolve svgscale in priority order:
		// 1. width/height with real-world units + viewBox → exact scale
		// 2. viewBox present (no unit dims) → 1 SVG unit = 1mm
		// 3. String detection for known tools without viewBox
		// 4. User-provided PPI when the SVG does not identify one
		if (vb && vb.width > 0) {
			var wAttr = svgEl.getAttribute('width');
			var hAttr = svgEl.getAttribute('height');
			var hasPixelDim = svgDimUsesPixels(wAttr) || svgDimUsesPixels(hAttr);
			var mmPerUnit = null;
			if (wAttr && (!svgDimUsesPixels(wAttr) || pixelsPerInch)) {
				var wMM = parseSvgDimToMM(wAttr, pixelsPerInch);
				if (wMM !== null) mmPerUnit = wMM / vb.width;
			}
			if (mmPerUnit === null && hAttr && (!svgDimUsesPixels(hAttr) || pixelsPerInch)) {
				var hMM = parseSvgDimToMM(hAttr, pixelsPerInch);
				if (hMM !== null) mmPerUnit = hMM / vb.height;
			}
			if (mmPerUnit === null && hasPixelDim) {
				pixelsPerInch = await resolveSvgPixelsPerInch(data);
				if (!pixelsPerInch) {
					document.body.removeChild(container);
					if (typeof notify === 'function') {
						notify('SVG import canceled: pixels-per-inch value is required', 'warning');
					}
					return null;
				}
				if (wAttr) {
					var wMMPx = parseSvgDimToMM(wAttr, pixelsPerInch);
					if (wMMPx !== null) mmPerUnit = wMMPx / vb.width;
				}
				if (mmPerUnit === null && hAttr) {
					var hMMPx = parseSvgDimToMM(hAttr, pixelsPerInch);
					if (hMMPx !== null) mmPerUnit = hMMPx / vb.height;
				}
			}
			// Use exact scale if we got real-world units; otherwise 1 SVG unit = 1mm.
			// Percentage/missing width+height fall through to the 1mm default.
			svgscale = mmPerUnit !== null ? mmPerUnit * viewScale : viewScale;
		} else {
			// No viewBox — fall back to detected or user-provided PPI
			if (!pixelsPerInch) {
				pixelsPerInch = await resolveSvgPixelsPerInch(data);
				if (!pixelsPerInch) {
					document.body.removeChild(container);
					if (typeof notify === 'function') {
						notify('SVG import canceled: pixels-per-inch value is required', 'warning');
					}
					return null;
				}
			}
			svgscale = viewScale * 25.4 / pixelsPerInch;
		}

		var paths = [];
		var shapeSelector = 'path, rect, circle, ellipse, line, polyline, polygon';
		var drawableSelector = shapeSelector + ', use';
		var elements = svgEl.querySelectorAll(drawableSelector);
		var rootCTM = svgEl.getScreenCTM();
		var tolerance = getOption("tolerance") || 0.1;
		var geometryTolerance = Math.max((tolerance * viewScale) / svgscale, 0.001);
		var cleanupTolerance = geometryTolerance * 0.25;
		var activeUseRefs = {};

		function getUseHrefId(el) {
			var href = el.getAttribute('href') || el.getAttribute('xlink:href');
			if (!href) return null;
			var urlMatch = href.match(/^url\(#(.+)\)$/);
			if (urlMatch) return urlMatch[1];
			return href.charAt(0) === '#' ? href.slice(1) : null;
		}

		function findSvgElementById(root, id) {
			var items = root.querySelectorAll('[id]');
			for (var i = 0; i < items.length; i++) {
				if (items[i].getAttribute('id') === id) return items[i];
			}
			return null;
		}

		function processShapeElement(shapeEl) {
			if (!rootCTM) return;
			var elCTM = shapeEl.getScreenCTM();
			if (!elCTM) return;
			var matrix = rootCTM.inverse().multiply(elCTM);
			var typeName = getElementTypeName(shapeEl.tagName);

			var pathData = shapeEl.getPathData({ normalize: true });
			if (!pathData || pathData.length === 0) return;

			// Apply CTM to all coordinate pairs, offset by viewBox origin
			var transformedSegments = pathData.map(function(seg) {
				var tv = [];
				for (var i = 0; i < seg.values.length; i += 2) {
					var x = seg.values[i], y = seg.values[i + 1];
					tv.push(
						x * matrix.a + y * matrix.c + matrix.e - vbx,
						x * matrix.b + y * matrix.d + matrix.f - vby
					);
				}
				return { type: seg.type, values: tv };
			});

			// Split compound paths into individual sub-paths
			var subpaths = splitSegmentsAtSubpaths(transformedSegments);
			subpaths.forEach(function(subSegs) {
				var dense = getPointsFromSegments(subSegs, geometryTolerance);
				var simplified = simplifyPoints(dense, cleanupTolerance);
				if (simplified.length < 1) return;

				for (var k = 0; k < simplified.length; k++) {
					simplified[k].x *= svgscale;
					simplified[k].y *= svgscale;
				}

				paths.push({ geom: simplified, name: typeName });
			});
		}

		function processUseElement(el) {
			var refId = getUseHrefId(el);
			if (!refId) return;
			if (activeUseRefs[refId]) return;
			var refEl = findSvgElementById(svgEl, refId);
			if (!refEl) return;

			var tempG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			var transformParts = [];
			var transformAttr = el.getAttribute('transform');
			var useX = parseFloat(el.getAttribute('x') || 0) || 0;
			var useY = parseFloat(el.getAttribute('y') || 0) || 0;
			if (transformAttr) transformParts.push(transformAttr);
			if (useX !== 0 || useY !== 0) transformParts.push('translate(' + useX + ' ' + useY + ')');
			if (transformParts.length > 0) tempG.setAttribute('transform', transformParts.join(' '));

			var clone = refEl.cloneNode(true);
			tempG.appendChild(clone);
			el.parentElement.appendChild(tempG);
			activeUseRefs[refId] = true;

			try {
				if (clone.matches && clone.matches(drawableSelector)) {
					processRenderedElement(clone);
				}
				var childElements = clone.querySelectorAll ? clone.querySelectorAll(drawableSelector) : [];
				childElements.forEach(function(child) {
					processRenderedElement(child);
				});
			} finally {
				delete activeUseRefs[refId];
				el.parentElement.removeChild(tempG);
			}
		}

		function processRenderedElement(el) {
			if (el.tagName.toLowerCase() === 'use') {
				processUseElement(el);
			} else {
				processShapeElement(el);
			}
		}

		elements.forEach(function(el) {
			try {
				// Skip elements inside <defs> — after adoptNode their CTM is non-null
				// but they are definitions only, not rendered instances.
				if (el.closest('defs')) return;

				processRenderedElement(el);
			} catch (e) {
				console.error('parseSvgContent: error processing <' + el.tagName + '>:', e);
			}
		});

		document.body.removeChild(container);

		if (paths.length === 0) {
			if (typeof notify === 'function') {
				notify('No supported SVG geometry found in this SVG file', 'warning');
			}
			return [];
		}

		importParsedPaths(paths, name);
		return paths;

	} catch (error) {
		console.error('parseSvgContent: unexpected error —', error);
		return null;
	}
}
