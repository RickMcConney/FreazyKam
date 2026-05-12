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
	var ppr = 72;
	var cx = circle.cx;
	var cy = circle.cy;
	var outerCutRadius = circle.radius - toolRadius;

	if (stepDown <= 0) stepDown = depth;

	var stepover = toolRadius;
	var radii = [];
	if (outerCutRadius <= stepover) {
		radii.push(outerCutRadius);
	} else {
		var r = stepover;
		while (r < outerCutRadius) {
			radii.push(r);
			r += stepover;
		}
		radii.push(outerCutRadius);
	}

	var zLevels = [];
	var z = 0;
	while (z < depth) {
		z += stepDown;
		if (z > depth) z = depth;
		zLevels.push(-z);
	}

	var transitionPoints = Math.round(ppr / 8);
	var angleOffset = 0;
	var currentZ = 0;
	var r0 = radii[0];

	for (var levelIdx = 0; levelIdx < zLevels.length; levelIdx++) {
		var targetZ = zLevels[levelIdx];
		var isLastLevel = (levelIdx === zLevels.length - 1);

		angleOffset = generateArcPoints(points, cx, cy, r0, r0, currentZ, targetZ, ppr, angleOffset, ppr, toolRadius, false);

		if (isLastLevel) {
			angleOffset = generateArcPoints(points, cx, cy, r0, r0, targetZ, targetZ, ppr, angleOffset, ppr, toolRadius, true);
		}

		for (var rIdx = 1; rIdx < radii.length; rIdx++) {
			angleOffset = generateArcPoints(points, cx, cy, radii[rIdx - 1], radii[rIdx], targetZ, targetZ, transitionPoints, angleOffset, ppr, toolRadius, true);
			angleOffset = generateArcPoints(points, cx, cy, radii[rIdx], radii[rIdx], targetZ, targetZ, ppr, angleOffset, ppr, toolRadius, true);
		}

		if (isLastLevel) {
			generateArcPoints(points, cx, cy, radii[radii.length - 1], radii[radii.length - 1], targetZ, targetZ, transitionPoints, angleOffset, ppr, toolRadius, true);
		}

		if (!isLastLevel && radii.length > 1) {
			angleOffset = generateArcPoints(points, cx, cy, radii[radii.length - 1], r0, targetZ, targetZ, transitionPoints, angleOffset, ppr, toolRadius, true);
		}

		currentZ = targetZ;
	}

	return points;
}

self.onmessage = function(event) {
	try {
		var payload = event.data || {};
		var requests = Array.isArray(payload.requests) ? payload.requests : [];
		var toolRadius = payload.toolRadius;
		var depth = payload.depth;
		var stepDown = payload.stepDown;

		var toolpaths = [];
		var createdCount = 0;

		for (var i = 0; i < requests.length; i++) {
			var request = requests[i];
			if (!request) continue;

			if (request.kind === 'point') {
				toolpaths.push({
					name: 'Drill',
					operation: 'Drill',
					svgId: null,
					svgIds: [],
					paths: [{
						tpath: [{ x: request.point.x, y: request.point.y, r: toolRadius }],
						path: [{ x: request.point.x, y: request.point.y, r: toolRadius }]
					}]
				});
				createdCount++;
				continue;
			}

			if (request.kind === 'helical') {
				if (!request.circle || request.circle.radius <= toolRadius) {
					throw new Error('Circle diameter is smaller than tool diameter. Use a smaller end mill.');
				}
				var helixPath = generateHelixPath(request.circle, depth, stepDown, toolRadius);
				toolpaths.push({
					name: 'Helical Drill',
					operation: 'HelicalDrill',
					svgId: request.svgId || null,
					svgIds: request.svgId ? [request.svgId] : [],
					paths: [{ tpath: helixPath, path: helixPath }]
				});
				createdCount++;
			}
		}

		self.postMessage({
			ok: true,
			result: {
				toolpaths: toolpaths,
				createdCount: createdCount
			}
		});
	} catch (error) {
		self.postMessage({
			ok: false,
			error: (error && error.message) || 'Drill generation failed'
		});
	}
};
