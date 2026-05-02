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
function getPointsFromSegments(segments, steps) {
	steps = steps || 50;
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
				for (var s = 1; s <= steps; s++) {
					var t = s / steps;
					var mt = 1 - t;
					points.push({
						x: mt*mt*mt*lastX + 3*mt*mt*t*v[0] + 3*mt*t*t*v[2] + t*t*t*v[4],
						y: mt*mt*mt*lastY + 3*mt*mt*t*v[1] + 3*mt*t*t*v[3] + t*t*t*v[5]
					});
				}
				lastX = v[4]; lastY = v[5];
				break;
			case 'Q':
				for (var s = 1; s <= steps; s++) {
					var t = s / steps;
					var mt = 1 - t;
					points.push({
						x: mt*mt*lastX + 2*mt*t*v[0] + t*t*v[2],
						y: mt*mt*lastY + 2*mt*t*v[1] + t*t*v[3]
					});
				}
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

function parseSvgDimToMM(attr) {
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
		case 'px': return null; // px has no real-world meaning without PPI info
	}
	return null;
}

function parseSvgContent(data, name) {
	try {
		// svgscale resolved after parsing (needs viewBox); set a safe default for now
		pixelsPerInch = 96;
		svgscale = viewScale * 25.4 / pixelsPerInch;

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
		// 4. Default 96 PPI
		if (vb && vb.width > 0) {
			var wAttr = svgEl.getAttribute('width');
			var hAttr = svgEl.getAttribute('height');
			var mmPerUnit = null;
			if (wAttr) {
				var wMM = parseSvgDimToMM(wAttr);
				if (wMM !== null) mmPerUnit = wMM / vb.width;
			}
			if (mmPerUnit === null && hAttr) {
				var hMM = parseSvgDimToMM(hAttr);
				if (hMM !== null) mmPerUnit = hMM / vb.height;
			}
			// Use exact scale if we got real-world units; otherwise 1 SVG unit = 1mm.
			// Percentage/missing width+height fall through to the 1mm default.
			svgscale = mmPerUnit !== null ? mmPerUnit * viewScale : viewScale;
		} else {
			// No viewBox — fall back to string detection then 96 PPI default
			if (data.indexOf("Adobe Illustrator") >= 0) {
				pixelsPerInch = 72;
			} else if (data.indexOf("woodgears.ca") >= 0) {
				pixelsPerInch = 254;
			} else if (data.indexOf("tinkercad") >= 0) {
				pixelsPerInch = 25.4;
			} else {
				pixelsPerInch = 96;
			}
			svgscale = viewScale * 25.4 / pixelsPerInch;
		}

		var paths = [];
		var elements = svgEl.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, use');

		elements.forEach(function(el) {
			try {
				// CTM relative to SVG root — bakes in all ancestor transforms
				var rootCTM = svgEl.getScreenCTM();
				var elCTM = el.getScreenCTM();
				if (!rootCTM || !elCTM) return;
				var matrix = rootCTM.inverse().multiply(elCTM);

				// Skip elements inside <defs> — after adoptNode their CTM is non-null
				// but they are definitions only, not rendered instances.
				if (el.closest('defs')) return;

				// For <use>: getScreenCTM() on the element itself omits both the
				// transform attribute and the x/y offset.  Resolve by temporarily
				// inserting a <g> with the same transform into the same parent so the
				// browser computes it correctly, then add the x/y translation.
				var shapeEl = el;
				var typeName;
				if (el.tagName.toLowerCase() === 'use') {
					var href = el.getAttribute('href') || el.getAttribute('xlink:href');
					if (!href || href.charAt(0) !== '#') return;
					var refId = href.slice(1);
					shapeEl = svgEl.querySelector('[id="' + refId.replace(/"/g, '\\"') + '"]');
					if (!shapeEl) return;
					typeName = getElementTypeName(shapeEl.tagName);

					var tempG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
					var transformAttr = el.getAttribute('transform');
					if (transformAttr) tempG.setAttribute('transform', transformAttr);
					el.parentElement.appendChild(tempG);
					var useMatrix = tempG.getScreenCTM();
					el.parentElement.removeChild(tempG);
					if (!useMatrix) return;
					var useX = parseFloat(el.getAttribute('x') || 0) || 0;
					var useY = parseFloat(el.getAttribute('y') || 0) || 0;
					if (useX !== 0 || useY !== 0) useMatrix = useMatrix.translate(useX, useY);
					matrix = rootCTM.inverse().multiply(useMatrix);
				} else {
					typeName = getElementTypeName(el.tagName);
				}

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
				var tolerance = getOption("tolerance") || 0.1;
				subpaths.forEach(function(subSegs) {
					var dense = getPointsFromSegments(subSegs, 50);
					var simplified = simplifyPoints(dense, tolerance);
					if (simplified.length < 1) return;

					for (var k = 0; k < simplified.length; k++) {
						simplified[k].x *= svgscale;
						simplified[k].y *= svgscale;
					}

					paths.push({ geom: simplified, name: typeName });
				});

			} catch (e) {
				console.error('parseSvgContent: error processing <' + el.tagName + '>:', e);
			}
		});

		document.body.removeChild(container);

		importParsedPaths(paths, name);
		return paths;

	} catch (error) {
		console.error('parseSvgContent: unexpected error —', error);
		return null;
	}
}
