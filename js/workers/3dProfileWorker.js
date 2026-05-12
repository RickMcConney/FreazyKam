self.importScripts('../lib/clipperf.js');

function workerLog(message, details) {
	self.postMessage({
		ok: true,
		log: true,
		message: message,
		details: details || null
	});
}

function sampleHeightMap(hm, xMM, yMM) {
	const fx = (xMM - hm.originX) / hm.cellSize;
	const fy = (yMM - hm.originY) / hm.cellSize;

	const ix = Math.floor(fx);
	const iy = Math.floor(fy);

	if (ix < 0 || ix >= hm.width - 1 || iy < 0 || iy >= hm.height - 1) return NaN;

	const tx = fx - ix;
	const ty = fy - iy;

	const z00 = hm.data[iy * hm.width + ix];
	const z10 = hm.data[iy * hm.width + ix + 1];
	const z01 = hm.data[(iy + 1) * hm.width + ix];
	const z11 = hm.data[(iy + 1) * hm.width + ix + 1];

	if (isNaN(z00) || isNaN(z10) || isNaN(z01) || isNaN(z11)) return NaN;

	return z00 * (1 - tx) * (1 - ty) + z10 * tx * (1 - ty) +
		z01 * (1 - tx) * ty + z11 * tx * ty;
}

function dropCutter(hm, xMM, yMM, radiusMM) {
	const R = radiusMM;
	const cellSize = hm.cellSize;
	const cellsInRadius = Math.ceil(R / cellSize);
	let maxZc = -Infinity;

	for (let dy = -cellsInRadius; dy <= cellsInRadius; dy++) {
		for (let dx = -cellsInRadius; dx <= cellsInRadius; dx++) {
			const dxMM = dx * cellSize;
			const dyMM = dy * cellSize;
			const distSq = dxMM * dxMM + dyMM * dyMM;
			if (distSq > R * R) continue;

			const surfZ = sampleHeightMap(hm, xMM + dxMM, yMM + dyMM);
			if (isNaN(surfZ)) continue;

			const zc = surfZ + R - Math.sqrt(R * R - distSq);
			if (zc > maxZc) maxZc = zc;
		}
	}

	return maxZc === -Infinity ? NaN : maxZc;
}

function extractContourLoops(model, zLevel) {
	const pos = model.geometryPositions || [];
	const t = model.transform || {};
	const sy = t.scaleY !== undefined ? t.scaleY : t.scale;
	const sz = t.scaleZ !== undefined ? t.scaleZ : t.scale;
	const triCount = pos.length / 9;
	const eps = 1e-6;
	const z = zLevel + eps;
	const segments = [];

	for (let tri = 0; tri < triCount; tri++) {
		const base = tri * 9;
		const ax = pos[base] * t.scale + t.offsetX;
		const ay = pos[base + 1] * sy + t.offsetY;
		const az = pos[base + 2] * sz + t.offsetZ;
		const bx = pos[base + 3] * t.scale + t.offsetX;
		const by = pos[base + 4] * sy + t.offsetY;
		const bz = pos[base + 5] * sz + t.offsetZ;
		const cx = pos[base + 6] * t.scale + t.offsetX;
		const cy = pos[base + 7] * sy + t.offsetY;
		const cz = pos[base + 8] * sz + t.offsetZ;

		const aAbove = az >= z, bAbove = bz >= z, cAbove = cz >= z;
		if (aAbove === bAbove && bAbove === cAbove) continue;

		const pts = [];
		const edges = [[ax, ay, az, bx, by, bz], [bx, by, bz, cx, cy, cz], [cx, cy, cz, ax, ay, az]];
		const aboves = [[aAbove, bAbove], [bAbove, cAbove], [cAbove, aAbove]];

		for (let e = 0; e < 3; e++) {
			if (aboves[e][0] !== aboves[e][1]) {
				const edge = edges[e];
				const x1 = edge[0], y1 = edge[1], z1 = edge[2], x2 = edge[3], y2 = edge[4], z2 = edge[5];
				const tVal = (z - z1) / (z2 - z1);
				pts.push({
					x: x1 + tVal * (x2 - x1),
					y: y1 + tVal * (y2 - y1)
				});
			}
		}

		if (pts.length >= 2) {
			segments.push([pts[0], pts[1]]);
		}
	}

	if (segments.length === 0) {
		workerLog('3D ProfileWorker:contour:emptySlice', { zLevel: zLevel });
		return [];
	}

	const gridSize = 0.01;
	const endpointMap = {};

	function hashKey(x, y) {
		return Math.round(x / gridSize) + ',' + Math.round(y / gridSize);
	}

	for (let i = 0; i < segments.length; i++) {
		for (let e = 0; e < 2; e++) {
			const p = segments[i][e];
			const key = hashKey(p.x, p.y);
			if (!endpointMap[key]) endpointMap[key] = [];
			endpointMap[key].push({ segIdx: i, x: p.x, y: p.y });
		}
	}

	const used = new Uint8Array(segments.length);
	const tolSq = (gridSize * 2) * (gridSize * 2);

	function findNearest(px, py, excludeIdx) {
		const gx = Math.round(px / gridSize);
		const gy = Math.round(py / gridSize);
		let bestDist = tolSq;
		let bestEntry = null;

		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				const key = (gx + dx) + ',' + (gy + dy);
				const bucket = endpointMap[key];
				if (!bucket) continue;
				for (let i = 0; i < bucket.length; i++) {
					const entry = bucket[i];
					if (entry.segIdx === excludeIdx || used[entry.segIdx]) continue;
					const ex = entry.x - px;
					const ey = entry.y - py;
					const d = ex * ex + ey * ey;
					if (d < bestDist) {
						bestDist = d;
						bestEntry = entry;
					}
				}
			}
		}
		return bestEntry;
	}

	const loops = [];
	for (let startIdx = 0; startIdx < segments.length; startIdx++) {
		if (used[startIdx]) continue;
		const loop = [];
		let curIdx = startIdx;
		let exitPt = null;

		while (true) {
			used[curIdx] = 1;
			const seg = segments[curIdx];
			let p0, p1;
			if (exitPt !== null) {
				const d0x = seg[0].x - exitPt.x;
				const d0y = seg[0].y - exitPt.y;
				const d1x = seg[1].x - exitPt.x;
				const d1y = seg[1].y - exitPt.y;
				if (d0x * d0x + d0y * d0y <= d1x * d1x + d1y * d1y) {
					p0 = seg[0];
					p1 = seg[1];
				} else {
					p0 = seg[1];
					p1 = seg[0];
				}
			} else {
				p0 = seg[0];
				p1 = seg[1];
			}

			loop.push(p1);
			exitPt = p1;
			const next = findNearest(exitPt.x, exitPt.y, curIdx);
			if (!next) break;
			curIdx = next.segIdx;
		}

		if (loop.length >= 3) loops.push(loop);
	}

	workerLog('3D ProfileWorker:contour:loops', {
		zLevel: zLevel,
		segmentCount: segments.length,
		loopCount: loops.length
	});
	return loops;
}

function loopBBox(loop) {
	let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
	for (let i = 0; i < loop.length; i++) {
		const p = loop[i];
		if (p.x < minx) minx = p.x;
		if (p.y < miny) miny = p.y;
		if (p.x > maxx) maxx = p.x;
		if (p.y > maxy) maxy = p.y;
	}
	return { minx: minx, miny: miny, maxx: maxx, maxy: maxy };
}

function offsetContourLoops(loops, offsetMM, viewScale) {
	const allResults = [];

	for (let i = 0; i < loops.length; i++) {
		const loop = loops[i];
		if (loop.length < 3) continue;
		const worldPath = loop.map(function(p) {
			return { x: Math.round(p.x * viewScale), y: Math.round(p.y * viewScale) };
		});
		const area = ClipperLib.Clipper.Area(worldPath);
		const delta = area < 0 ? offsetMM * viewScale : -offsetMM * viewScale;
		const co = new ClipperLib.ClipperOffset(20, 0.25);
		co.AddPath(worldPath, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
		const sol = [];
		co.Execute(sol, delta);
		for (let s = 0; s < sol.length; s++) {
			const sp = sol[s];
			if (sp.length < 3) continue;
			const mmPath = sp.map(function(p) {
				return { x: p.x / viewScale, y: p.y / viewScale };
			});
			mmPath.push({ x: mmPath[0].x, y: mmPath[0].y });
			allResults.push(mmPath);
		}
	}

	return allResults;
}

function generateContourPaths(payload) {
	const model = payload.model;
	const toolRadius = payload.toolRadius;
	const maxDepth = payload.maxDepth;
	const stepDown = payload.stepDown;
	const viewScale = payload.viewScale;
	const numPasses = Math.max(1, Math.ceil(maxDepth / stepDown));
	const allPaths = [];
	const loopEntries = [];
	let prevOffsetLoops = [];

	for (let pass = 0; pass < numPasses; pass++) {
		const zLevel = Math.max(-(pass + 1) * stepDown, -maxDepth);
		const rawLoops = extractContourLoops(model, zLevel);
		if (rawLoops.length === 0) continue;
		const offsetLoops = offsetContourLoops(rawLoops, toolRadius, viewScale);
		const useLoops = (offsetLoops.length > 0 ? offsetLoops : rawLoops).filter(function(loop) {
			return loop.length >= 3;
		});
		if (useLoops.length === 0) continue;

		for (let i = 0; i < useLoops.length; i++) {
			const loop = useLoops[i];
			const lbb = loopBBox(loop);
			let hasNewArea = prevOffsetLoops.length === 0;
			if (!hasNewArea) {
				const tolerance = 0.5;
				const matched = prevOffsetLoops.some(function(pl) {
					const pbb = loopBBox(pl);
					return Math.abs(lbb.minx - pbb.minx) < tolerance &&
						Math.abs(lbb.miny - pbb.miny) < tolerance &&
						Math.abs(lbb.maxx - pbb.maxx) < tolerance &&
						Math.abs(lbb.maxy - pbb.maxy) < tolerance;
				});
				hasNewArea = !matched;
			}
			const prevZ = pass > 0 ? Math.max(-pass * stepDown, -maxDepth) : 0;
			const startZ = hasNewArea ? 0 : prevZ;
			loopEntries.push({ loop: loop, startZ: startZ, targetZ: zLevel });
		}

		prevOffsetLoops = useLoops;
		workerLog('3D ProfileWorker:contour:pass', {
			pass: pass,
			zLevel: zLevel,
			loopCount: useLoops.length,
			storedEntries: loopEntries.length
		});
	}

	const cutPairs = [];
	for (let i = 0; i < loopEntries.length; i++) {
		const entry = loopEntries[i];
		const depth = entry.startZ - entry.targetZ;
		const stepsNeeded = Math.max(1, Math.ceil(depth / stepDown));
		for (let s = 1; s <= stepsNeeded; s++) {
			const cutZ = Math.max(entry.startZ - s * stepDown, entry.targetZ);
			cutPairs.push({ loop: entry.loop, cutZ: cutZ });
		}
	}

	cutPairs.sort(function(a, b) { return b.cutZ - a.cutZ; });
	for (let i = 0; i < cutPairs.length; i++) {
		const cp = cutPairs[i];
		const tpath = cp.loop.map(function(p) {
			return { x: p.x * viewScale, y: p.y * viewScale, z: cp.cutZ };
		});
		const first = tpath[0];
		const last = tpath[tpath.length - 1];
		if (Math.abs(first.x - last.x) > 0.01 || Math.abs(first.y - last.y) > 0.01) {
			tpath.push({ x: first.x, y: first.y, z: cp.cutZ });
		}
		allPaths.push({ tpath: tpath, passStart: true });
	}

	workerLog('3D ProfileWorker:contour:done', {
		cutPairCount: cutPairs.length,
		toolpathCount: allPaths.length
	});
	return allPaths;
}

function generateRasterPaths(payload) {
	const hm = payload.heightMap;
	const bb = payload.model.bbox3d;
	const toolDiameter = payload.toolDiameter;
	const toolRadius = payload.toolRadius;
	const stepover = payload.stepover;
	const angle = payload.angle;
	const maxDepth = payload.maxDepth;
	const stepDown = payload.stepDown;
	const restToolDiameter = payload.restToolDiameter;
	const restToolRadius = payload.restToolRadius;
	const restTolerance = payload.restTolerance;
	const viewScale = payload.viewScale;
	const numPasses = Math.max(1, Math.ceil(maxDepth / stepDown));
	const allPaths = [];
	const sampleInterval = Math.max(hm.cellSize, toolDiameter / 2);

	if (stepover <= 0 || sampleInterval <= 0) {
		throw new Error('Invalid stepover or tool diameter');
	}

	const angleRad = angle * Math.PI / 180;
	const cosA = Math.cos(angleRad);
	const sinA = Math.sin(angleRad);
	const cx = (bb.min.x + bb.max.x) / 2;
	const cy = (bb.min.y + bb.max.y) / 2;
	const expandedBB = {
		minX: bb.min.x - toolRadius,
		maxX: bb.max.x + toolRadius,
		minY: bb.min.y - toolRadius,
		maxY: bb.max.y + toolRadius
	};
	const corners = [
		{ x: expandedBB.minX, y: expandedBB.minY },
		{ x: expandedBB.maxX, y: expandedBB.minY },
		{ x: expandedBB.maxX, y: expandedBB.maxY },
		{ x: expandedBB.minX, y: expandedBB.maxY }
	];
	const rotCorners = corners.map(function(p) {
		return {
			x: cosA * (p.x - cx) + sinA * (p.y - cy) + cx,
			y: -sinA * (p.x - cx) + cosA * (p.y - cy) + cy
		};
	});
	const rMinX = Math.min.apply(null, rotCorners.map(function(p) { return p.x; }));
	const rMaxX = Math.max.apply(null, rotCorners.map(function(p) { return p.x; }));
	const rMinY = Math.min.apply(null, rotCorners.map(function(p) { return p.y; }));
	const rMaxY = Math.max.apply(null, rotCorners.map(function(p) { return p.y; }));
	let lineIndex = 0;

	workerLog('3D ProfileWorker:raster:start', {
		sampleInterval: sampleInterval,
		stepover: stepover,
		angle: angle,
		numPasses: numPasses,
		restToolDiameter: restToolDiameter
	});

	for (let pass = 0; pass < numPasses; pass++) {
		const passMinZ = pass < numPasses - 1 ? -(pass + 1) * stepDown : -maxDepth;
		let firstLineInPass = true;
		let passSegmentCount = 0;

		for (let y = rMinY; y <= rMaxY; y += stepover) {
			const rawPts = [];
			for (let x = rMinX; x <= rMaxX; x += sampleInterval) {
				const worldX = cosA * (x - cx) - sinA * (y - cy) + cx;
				const worldY = sinA * (x - cx) + cosA * (y - cy) + cy;
				let zc = dropCutter(hm, worldX, worldY, toolRadius);

				if (isNaN(zc)) {
					rawPts.push(null);
				} else {
					let tipZ = zc - toolRadius;
					tipZ = Math.max(tipZ, passMinZ);

					if (restToolRadius > 0) {
						const stockZc = dropCutter(hm, worldX, worldY, restToolRadius);
						if (!isNaN(stockZc)) {
							const stockTipZ = Math.max(stockZc - restToolRadius, passMinZ);
							if (tipZ >= stockTipZ - restTolerance) {
								rawPts.push(null);
								continue;
							}
						}
					}

					rawPts.push({ x: worldX, y: worldY, z: tipZ });
				}
			}

			if (lineIndex % 2 !== 0) rawPts.reverse();

			let segment = [];
			for (let i = 0; i < rawPts.length; i++) {
				if (rawPts[i] === null) {
					if (segment.length > 1) {
						const tpath = segment.map(function(p) {
							return { x: p.x * viewScale, y: p.y * viewScale, z: p.z };
						});
						allPaths.push({ tpath: tpath, passStart: firstLineInPass });
						firstLineInPass = false;
						passSegmentCount++;
					}
					segment = [];
				} else {
					segment.push(rawPts[i]);
				}
			}

			if (segment.length > 1) {
				const tpath = segment.map(function(p) {
					return { x: p.x * viewScale, y: p.y * viewScale, z: p.z };
				});
				allPaths.push({ tpath: tpath, passStart: firstLineInPass });
				firstLineInPass = false;
				passSegmentCount++;
			}
			lineIndex++;
		}

		workerLog('3D ProfileWorker:raster:pass', {
			pass: pass,
			passMinZ: passMinZ,
			lineIndex: lineIndex,
			passSegmentCount: passSegmentCount,
			totalToolpaths: allPaths.length
		});
	}

	workerLog('3D ProfileWorker:raster:done', {
		toolpathCount: allPaths.length,
		restMode: restToolDiameter > 0 ? 'rest' : 'full'
	});
	return allPaths;
}

function generate3dProfileToolpaths(payload) {
	const model = payload.model;
	const heightMap = payload.heightMap;
	const strategy = payload.strategy || 'raster';
	const allPaths = strategy === 'contour'
		? generateContourPaths(payload)
		: generateRasterPaths(payload);

	if (!allPaths || allPaths.length === 0) {
		return { createdCount: 0, toolpaths: [] };
	}

	return {
		createdCount: 1,
		toolpaths: [{
			paths: allPaths,
			name: '3dProfile',
			operation: '3dProfile',
			svgId: payload.svgId || null,
			svgIds: payload.svgIds || []
		}]
	};
}

self.onmessage = function(event) {
	try {
		const payload = event.data || {};
		workerLog('3D ProfileWorker:start', {
			strategy: payload.strategy,
			toolDiameter: payload.toolDiameter,
			toolRadius: payload.toolRadius,
			stepover: payload.stepover,
			angle: payload.angle,
			maxDepth: payload.maxDepth,
			stepDown: payload.stepDown,
			svgId: payload.svgId || null
		});
		const result = generate3dProfileToolpaths(payload);
		workerLog('3D ProfileWorker:complete', {
			createdCount: result.createdCount,
			toolpathCount: result.toolpaths.length
		});
		self.postMessage({ ok: true, result: result });
	} catch (error) {
		self.postMessage({
			ok: false,
			error: error && error.message ? error.message : String(error)
		});
	}
};
