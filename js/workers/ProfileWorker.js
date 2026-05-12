var nearbypaths = [];
self.importScripts('../lib/clipperf.js', '../util.js', '../toolPath.js');

function clonePath(path) {
	return path.map(function(point) {
		return { x: point.x, y: point.y };
	});
}

function buildProfileCutPaths(srcPath, config) {
	var paths = [];
	var reverseDirection = config.direction === 'reverse';

	for (var loop = config.numLoops - 1; loop >= 0; loop--) {
		var offsetAmount = config.radius + config.overCutWorld + loop * config.radius;
		if (offsetAmount <= 0) continue;
		var offsetPaths = offsetPath(srcPath, offsetAmount, config.mode === 'outside');

		for (var p = 0; p < offsetPaths.length; p++) {
			var opath = offsetPaths[p];
			var subpath = subdividePath(opath, 2);
			var circles = checkPath(subpath, config.radius * 0.9);
			var tpath = clipper.JS.Lighten(circles, config.tolerance);
			if (reverseDirection) {
				paths.push({ path: reversePath(circles), tpath: reversePath(tpath) });
			} else {
				paths.push({ path: circles, tpath: tpath });
			}
		}
	}

	return paths;
}

function buildCenterPaths(srcPath, config) {
	var paths = [];
	var reverseDirection = config.direction === 'reverse';

	for (var k = 0; k < config.numLoops; k++) {
		var centerOffset = config.overCutWorld + (k - (config.numLoops - 1) / 2.0) * config.radius;
		var loopPath;
		if (Math.abs(centerOffset) < 0.001) {
			loopPath = clonePath(srcPath);
		} else {
			var outward = centerOffset > 0;
			var offsetResult = offsetPath(srcPath, Math.abs(centerOffset), outward);
			loopPath = offsetResult.length > 0 ? offsetResult[0] : clonePath(srcPath);
		}

		var circles = addCircles(loopPath, config.radius);
		var tpath = loopPath;
		if (reverseDirection) {
			paths.push({ path: reversePath(circles), tpath: reversePath(tpath) });
		} else {
			paths.push({ path: circles, tpath: tpath });
		}
	}

	return paths;
}

function generateProfileToolpaths(payload) {
	var config = payload.config;
	var selection = payload.selection || [];
	var tool = payload.tool || null;
	var createdCount = 0;
	var toolpaths = [];

	nearbypaths = selection.map(function(item) {
		return {
			id: item.id,
			path: clonePath(item.path)
		};
	});

	for (var i = 0; i < selection.length; i++) {
		var item = selection[i];
		var srcPath = clonePath(item.path);
		var generatedPaths = config.mode === 'center'
			? buildCenterPaths(srcPath, config)
			: buildProfileCutPaths(srcPath, config);

		if (generatedPaths.length > 0) {
			toolpaths.push({
				paths: generatedPaths,
				name: config.name,
				operation: 'Profile',
				svgId: item.id,
				svgIds: [item.id]
			});
			createdCount++;
		}
	}

	return {
		createdCount: createdCount,
		toolpaths: toolpaths
	};
}

self.onmessage = function(event) {
	try {
		var result = generateProfileToolpaths(event.data || {});
		self.postMessage({ ok: true, result: result });
	} catch (error) {
		self.postMessage({
			ok: false,
			error: error && error.message ? error.message : String(error)
		});
	}
};
