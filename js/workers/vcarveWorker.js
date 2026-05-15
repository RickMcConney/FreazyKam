var nearbypaths = [];
self.importScripts('../lib/clipperf.js', '../lib/jspoly.js', '../util.js', '../toolPath.js', '../vcarve.js');

function clonePoint(point) {
	return { x: point.x, y: point.y };
}

function clonePointWithRadius(point) {
	return { x: point.x, y: point.y, r: point.r };
}

function clonePath(path) {
	return path.map(clonePoint);
}

function cloneSvgPath(svgpath) {
	return {
		id: svgpath.id,
		visible: svgpath.visible !== false,
		bbox: svgpath.bbox ? { ...svgpath.bbox } : boundingBox(svgpath.path),
		path: clonePath(svgpath.path)
	};
}

function clonePathWithRadius(path) {
	return path.map(clonePointWithRadius);
}

function buildCenterVcarveToolpaths(payload) {
	const selected = payload.selectedPaths.map(function(path) {
		return {
			id: path.id,
			path: clonePath(path.path)
		};
	});

	for (let i = 0; i < selected.length; i++) {
		delete selected[i].hole;
	}

	selected.sort(function(a, b) {
		var bboxA = boundingBox(a.path);
		var bboxB = boundingBox(b.path);
		var areaA = (bboxA.maxx - bboxA.minx) * (bboxA.maxy - bboxA.miny);
		var areaB = (bboxB.maxx - bboxB.minx) * (bboxB.maxy - bboxB.miny);
		return areaB - areaA;
	});

	var letters = [];
	for (var i = 0; i < selected.length; i++) {
		if (selected[i].hole) continue;
		var holes = [];
		var holeSvgIds = [];
		var path = selected[i].path;
		for (var j = 0; j < selected.length; j++) {
			if (i !== j && !selected[j].hole) {
				if (pathIn(path, selected[j].path)) {
					holes.push(clonePath(selected[j].path));
					holeSvgIds.push(selected[j].id);
					selected[j].hole = true;
				}
			}
		}
		var bbox = boundingBox(path);
		letters.push({
			path: clonePath(path),
			holes: holes,
			id: selected[i].id,
			holeSvgIds: holeSvgIds,
			cx: (bbox.minx + bbox.maxx) / 2,
			cy: (bbox.miny + bbox.maxy) / 2
		});
	}

	var ordered = [];
	if (letters.length > 0) {
		var startIdx = 0;
		var bestScore = Infinity;
		for (var k = 0; k < letters.length; k++) {
			var score = letters[k].cx + letters[k].cy;
			if (score < bestScore) {
				bestScore = score;
				startIdx = k;
			}
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
				if (d < nearestDist) {
					nearestDist = d;
					nearest = m;
				}
			}
			current = remaining.splice(nearest, 1)[0];
			ordered.push(current);
		}
	}

	var toolpaths = [];
	for (var n = 0; n < ordered.length; n++) {
		var item = ordered[n];
		var maxRadius = vbitRadius(payload.tool) * payload.viewScale;
		var segments = JSPoly.construct_medial_axis(
			item.path,
			item.holes,
			1e-1,
			2,
			7 * Math.PI / 8,
			-1,
			0,
			{ no_parabola: false, show_sites: false },
			null
		);
		segments = pruneNoisyBranches(segments, item.path, item.holes, maxRadius);

		var circles = [];
		for (var si = 0; si < segments.length; si++) {
			var seg = segments[si];
			circles.push({ x: seg.point0.x, y: seg.point0.y, r: Math.min(seg.point0.radius, maxRadius) });
			circles.push({ x: seg.point1.x, y: seg.point1.y, r: Math.min(seg.point1.radius, maxRadius) });
		}
		circles = clipper.JS.Lighten(circles, payload.tolerance * payload.viewScale);

		var tpath = findBestPath(segments).toolpath;
		for (var p = 0; p < tpath.length; p++) {
			tpath[p].r = Math.min(tpath[p].r, maxRadius);
		}

		toolpaths.push({
			paths: [{ path: clonePathWithRadius(circles), tpath: clonePathWithRadius(tpath) }],
			name: payload.name,
			operation: 'VCarve',
			displayOperation: payload.name === 'Inside' ? 'Inside' : (payload.name === 'Outside' ? 'Outside' : 'Center'),
			svgId: item.id,
			svgIds: [item.id].concat(item.holeSvgIds)
		});
	}

	return {
		createdCount: toolpaths.filter(function(entry) {
			return entry.paths && entry.paths.length > 0;
		}).length,
		toolpaths: toolpaths
	};
}

function buildProfileVcarveToolpaths(payload) {
	const radius = vbitRadius(payload.tool) * payload.viewScale;
	const overCutWorld = (payload.tool.overCut || 0) * payload.viewScale;
	const toolpaths = [];

	for (var i = 0; i < payload.selectedPaths.length; i++) {
		var svgpath = payload.selectedPaths[i];
		var path = clonePath(svgpath.path);
		if (payload.outside) {
			nearbypaths = nearbyPaths({ id: svgpath.id, path: path }, radius);
		} else {
			nearbypaths = nearbyPaths({ id: svgpath.id, path: path }, 1);
		}

		var cw = isClockwise(path);
		if (payload.outside) cw = !cw;

		var subpath = subdividePath(path, 2);
		var localNorms = makeNorms(subpath, path, cw, 1, payload.outside);
		var circles = largestEmptyCircles(localNorms, radius, subpath);

		if (overCutWorld !== 0) {
			for (var j = 0; j < localNorms.length && j < circles.length; j++) {
				circles[j].x += localNorms[j].dx * overCutWorld;
				circles[j].y += localNorms[j].dy * overCutWorld;
			}
		}

		var tpath = clipper.JS.Lighten(circles, payload.tolerance * payload.viewScale);
		var shouldReverse = payload.outside ? (payload.tool.direction != 'climb') : (payload.tool.direction == 'climb');
		var finalCircles = shouldReverse ? reversePath(circles) : circles;
		var finalTpath = shouldReverse ? reversePath(tpath) : tpath;

		toolpaths.push({
			paths: [{ path: clonePathWithRadius(finalCircles), tpath: clonePathWithRadius(finalTpath) }],
			name: payload.name,
			operation: 'VCarve',
			displayOperation: payload.name === 'Inside' ? 'Inside' : (payload.name === 'Outside' ? 'Outside' : 'Center'),
			svgId: svgpath.id,
			svgIds: [svgpath.id]
		});
	}

	return {
		createdCount: toolpaths.filter(function(entry) {
			return entry.paths && entry.paths.length > 0;
		}).length,
		toolpaths: toolpaths
	};
}

function generateVcarveToolpaths(payload) {
	if (Array.isArray(payload.svgpaths) && payload.svgpaths.length > 0) {
		svgpaths = payload.svgpaths.map(cloneSvgPath);
	} else {
		svgpaths = payload.selectedPaths.map(function(path) {
			return cloneSvgPath({
				id: path.id,
				visible: true,
				bbox: path.bbox,
				path: path.path
			});
		});
	}

	nearbypaths = payload.selectedPaths.map(function(path) {
		return {
			id: path.id,
			path: clonePath(path.path)
		};
	});

	if (payload.mode === 'center') {
		return buildCenterVcarveToolpaths(payload);
	}
	return buildProfileVcarveToolpaths(payload);
}

self.onmessage = function(event) {
	try {
		const result = generateVcarveToolpaths(event.data);
		self.postMessage({ ok: true, result: result });
	} catch (error) {
		self.postMessage({
			ok: false,
			error: error && error.message ? error.message : String(error)
		});
	}
};
