self.importScripts('../util.js');

function clipLineToRect(p1, p2, xMin, yMin, xMax, yMax) {
	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	const p = [-dx, dx, -dy, dy];
	const q = [p1.x - xMin, xMax - p1.x, p1.y - yMin, yMax - p1.y];
	let t0 = 0;
	let t1 = 1;
	for (let i = 0; i < 4; i++) {
		if (Math.abs(p[i]) < 1e-10) {
			if (q[i] < 0) return null;
		} else {
			const t = q[i] / p[i];
			if (p[i] < 0) {
				t0 = Math.max(t0, t);
			} else {
				t1 = Math.min(t1, t);
			}
		}
	}
	if (t0 > t1) return null;
	return [
		{ x: p1.x + t0 * dx, y: p1.y + t0 * dy },
		{ x: p1.x + t1 * dx, y: p1.y + t1 * dy }
	];
}

function generateSurfacingToolpaths(payload) {
	const wpWidth = payload.wpWidth;
	const wpLength = payload.wpLength;
	const radius = payload.radius;
	const stepover = payload.stepover;
	const angle = payload.angle || 0;
	const cx = wpWidth / 2;
	const cy = wpLength / 2;

	const xMin = -radius;
	const xMax = wpWidth + radius;
	const yMin = -radius;
	const yMax = wpLength + radius;

	const clipCorners = [
		{ x: xMin, y: yMin },
		{ x: xMax, y: yMin },
		{ x: xMax, y: yMax },
		{ x: xMin, y: yMax }
	];

	const rotated = angle !== 0
		? clipCorners.map(function(point) {
			return rotatePoint(point, cx, cy, -angle * Math.PI / 180);
		})
		: clipCorners;

	const minX = Math.min.apply(null, rotated.map(function(point) { return point.x; }));
	const maxX = Math.max.apply(null, rotated.map(function(point) { return point.x; }));
	const minY = Math.min.apply(null, rotated.map(function(point) { return point.y; }));
	const maxY = Math.max.apply(null, rotated.map(function(point) { return point.y; }));

	const paths = [];
	const rad = angle * Math.PI / 180;

	for (let y = minY; ; y += stepover) {
		const ly = Math.min(y, maxY);
		let p1 = { x: minX, y: ly };
		let p2 = { x: maxX, y: ly };

		if (angle !== 0) {
			p1 = rotatePoint(p1, cx, cy, rad);
			p2 = rotatePoint(p2, cx, cy, rad);
		}

		const clipped = clipLineToRect(p1, p2, xMin, yMin, xMax, yMax);
		if (clipped) {
			const tpath = lineIndex % 2 === 0 ? clipped : [clipped[1], clipped[0]];
			paths.push({ tpath: tpath });
		}

		if (ly >= maxY) break;
	}

	return {
		createdCount: paths.length > 0 ? 1 : 0,
		toolpaths: paths.length > 0 ? [{
			paths: paths,
			name: 'Surfacing',
			operation: 'Surfacing',
			svgId: null,
			svgIds: []
		}] : []
	};
}

self.onmessage = function(event) {
	try {
		const result = generateSurfacingToolpaths(event.data || {});
		self.postMessage({ ok: true, result: result });
	} catch (error) {
		self.postMessage({
			ok: false,
			error: error && error.message ? error.message : String(error)
		});
	}
};
