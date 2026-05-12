self.importScripts('../lib/clipperf.js', '../util.js', '../toolPath.js');

const POCKET_WORKER_MAX_POINTS = 2000;

function workerLog(message, details) {
	self.postMessage({
		ok: true,
		log: true,
		message: message,
		details: details || null
	});
}

function simplifyClosedPathForPocket(path, maxPoints) {
	if (!Array.isArray(path) || path.length <= maxPoints) return path;
	const isClosed = path.length > 2 && path[0].x === path[path.length - 1].x && path[0].y === path[path.length - 1].y;
	const core = isClosed ? path.slice(0, -1) : path.slice();
	if (core.length <= maxPoints) return path;

	const step = Math.ceil(core.length / maxPoints);
	const reduced = [];
	for (let i = 0; i < core.length; i += step) {
		reduced.push(core[i]);
	}
	const last = core[core.length - 1];
	const tail = reduced[reduced.length - 1];
	if (!tail || tail.x !== last.x || tail.y !== last.y) {
		reduced.push(last);
	}
	if (isClosed && reduced.length > 2) {
		reduced.push({ x: reduced[0].x, y: reduced[0].y });
	}
	return reduced;
}

function preparePocketInputPath(path, label) {
	const simplified = simplifyClosedPathForPocket(path, POCKET_WORKER_MAX_POINTS);
	if (simplified !== path) {
		workerLog('Pocket path simplified', {
			label: label,
			originalPointCount: path.length,
			simplifiedPointCount: simplified.length,
			maxPoints: POCKET_WORKER_MAX_POINTS
		});
	}
	return simplified;
}

function computePathPerimeter(path) {
	let len = 0;
	for (let i = 0; i < path.length - 1; i++) {
		let dx = path[i + 1].x - path[i].x;
		let dy = path[i + 1].y - path[i].y;
		len += Math.sqrt(dx * dx + dy * dy);
	}
	return len;
}

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
			let area = Math.abs(ClipperLib.Clipper.Area(rem));
			if (area < minArea) continue;
			rem.push(rem[0]);
			validFragments.push(rem);
		}
	}
	return validFragments;
}

function generateConcentricContours(outerPath, islandPaths, stepover, pocketRadius) {
	let contours = [];
	let contourLevels = [];
	let currentOuters = [outerPath];
	let minArea = stepover * stepover * 0.1;
	let level = 0;

	workerLog('generateConcentricContours:start', {
		initialOuterPointCount: outerPath.length,
		islandCount: islandPaths.length,
		stepover: stepover,
		pocketRadius: pocketRadius
	});

	while (currentOuters.length > 0) {
		workerLog('generateConcentricContours:level', {
			level: level,
			currentOuterCount: currentOuters.length
		});
		let nextOuters = [];
		for (let outerIndex = 0; outerIndex < currentOuters.length; outerIndex++) {
			let outer = currentOuters[outerIndex];
			contours.push(outer);
			contourLevels.push(level);
			workerLog('generateConcentricContours:offset', {
				level: level,
				outerIndex: outerIndex,
				pointCount: outer.length
			});
			let co = new clipper.ClipperOffset(20, 0.025);
			co.AddPath(outer, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
			let result = [];
			co.Execute(result, -stepover);
			workerLog('generateConcentricContours:offsetResult', {
				level: level,
				outerIndex: outerIndex,
				resultCount: result.length
			});

			let validFragments = subtractIslandsAndFilter(result, islandPaths, minArea);
			workerLog('generateConcentricContours:validFragments', {
				level: level,
				outerIndex: outerIndex,
				fragmentCount: validFragments.length
			});

			if (validFragments.length === 0 && pocketRadius > 0 && stepover > pocketRadius) {
				workerLog('generateConcentricContours:fillAttempt', {
					level: level,
					outerIndex: outerIndex,
					fillOffset: pocketRadius
				});
				let fillCo = new clipper.ClipperOffset(20, 0.025);
				fillCo.AddPath(outer, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
				let fillResult = [];
				fillCo.Execute(fillResult, -pocketRadius);
				workerLog('generateConcentricContours:fillResult', {
					level: level,
					outerIndex: outerIndex,
					resultCount: fillResult.length
				});
				validFragments.push(...subtractIslandsAndFilter(fillResult, islandPaths, minArea));
				workerLog('generateConcentricContours:fillFragments', {
					level: level,
					outerIndex: outerIndex,
					fragmentCount: validFragments.length
				});
			}

			nextOuters.push(...validFragments);
		}
		currentOuters = nextOuters;
		level++;
	}
	workerLog('generateConcentricContours:done', {
		levelCount: level,
		contourCount: contours.length
	});
	return { contours, contourLevels, levelCount: level };
}

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

function generateRasterInfill(machinedOuter, machinedIslands, islandPaths, switchLevel, stepover, pocketRadius, angle) {
	let rasterOffset = offsetPath(machinedOuter, (switchLevel - 1) * stepover, false);
	if (rasterOffset.length === 0) rasterOffset = [machinedOuter];
	let rasterBoundaries = [rasterOffset[0]];
	for (let island of machinedIslands) {
		rasterBoundaries.push(island);
	}

	let tpaths = generateClipperInfill(rasterBoundaries, stepover, pocketRadius, angle);
	let chains = extractConnectivityChains(tpaths, stepover, angle);

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

function computeAdaptiveSwitchLevel(allContours, contourLevels, totalLevels, machinedOuter, machinedIslands, stepover, pocketRadius, angle) {
	for (let lvl = 1; lvl < totalLevels; lvl++) {
		let levelPerimeter = 0;
		for (let i = 0; i < allContours.length; i++) {
			if (contourLevels[i] === lvl) {
				levelPerimeter += computePathPerimeter(allContours[i]);
			}
		}
		if (levelPerimeter <= 0) continue;

		let rasterOuter = offsetPath(machinedOuter, lvl * stepover, false);
		if (rasterOuter.length === 0) continue;
		let rasterBoundaries = [rasterOuter[0], ...machinedIslands];

		let rasterTravel = computeRasterTravel(rasterBoundaries, stepover, pocketRadius, angle);
		if (rasterTravel > 0 && rasterTravel < levelPerimeter) {
			return lvl;
		}
	}
	return totalLevels;
}

function rotateContoursToNearestEntry(paths) {
	let prevEnd = null;
	for (let i = 0; i < paths.length; i++) {
		const obj = paths[i];
		const tp = obj.tpath;
		if (!tp || tp.length < 4) {
			if (tp) prevEnd = tp[tp.length - 1];
			continue;
		}

		if (obj.isContour && prevEnd) {
			const fp = tp[0], lp = tp[tp.length - 1];
			if ((fp.x - lp.x) ** 2 + (fp.y - lp.y) ** 2 < 1e-6) {
				const core = tp.slice(0, tp.length - 1);
				let bestIdx = 0, bestDist = Infinity;
				for (let j = 0; j < core.length; j++) {
					const d = (prevEnd.x - core[j].x) ** 2 + (prevEnd.y - core[j].y) ** 2;
					if (d < bestDist) {
						bestDist = d;
						bestIdx = j;
					}
				}
				if (bestIdx > 0) {
					const rotated = core.slice(bestIdx).concat(core.slice(0, bestIdx));
					rotated.push(rotated[0]);
					paths[i] = { ...obj, tpath: rotated };
					prevEnd = rotated[rotated.length - 1];
					continue;
				}
			}
		}
		prevEnd = tp[tp.length - 1];
	}
	return paths;
}

function eliminateUnnecessaryRetracts(paths, machinedIslands, originalIslands, machinedOuter, originalOuter) {
	if (paths.length <= 1) return paths;

	let islandObstacles = [];
	if (machinedIslands) islandObstacles.push(...machinedIslands);
	if (originalIslands) islandObstacles.push(...originalIslands);

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

		let unsafe = false;
		for (let island of islandObstacles) {
			if (lineIntersectsPath(endPt, startPt, island) > 0) {
				unsafe = true;
				break;
			}
		}
		if (!unsafe) {
			for (let outer of outerBoundaries) {
				if (lineIntersectsPath(endPt, startPt, outer) > 0) {
					unsafe = true;
					break;
				}
			}
		}

		if (!unsafe) paths[i].passStart = false;
	}
	return optimizePocketPaths(paths);
}

function generatePocketPaths(outerPath, islandPaths, pocketRadius, stepover, angle, direction, finishingRadius, strategy) {
	if (!strategy) strategy = 'adaptive';

	let outerOffset = offsetPath(outerPath, pocketRadius, false);
	if (outerOffset.length === 0) return [];
	let machinedOuter = outerOffset[0];

	let machinedIslands = [];
	for (let p of islandPaths) {
		let islandOffset = offsetPath(p, pocketRadius, true);
		if (islandOffset.length === 0) continue;
		machinedIslands.push(islandOffset[0]);
	}

	let contourData = generateConcentricContours(machinedOuter, machinedIslands, stepover, pocketRadius);
	let allContours = contourData.contours;
	let contourLevels = contourData.contourLevels;
	let totalLevels = contourData.levelCount;

	let switchLevel;
	if (strategy === 'raster') {
		switchLevel = 1;
	} else if (strategy === 'contour') {
		switchLevel = totalLevels;
	} else {
		switchLevel = computeAdaptiveSwitchLevel(allContours, contourLevels, totalLevels, machinedOuter, machinedIslands, stepover, pocketRadius, angle);
	}

	let skipOutermost = (finishingRadius >= pocketRadius) && (totalLevels > 1 || switchLevel < totalLevels);
	let startLevel = skipOutermost ? 1 : 0;

	let contoursByLevel = {};
	for (let lvl = switchLevel - 1; lvl >= startLevel; lvl--) {
		let levelPaths = [];
		for (let i = 0; i < allContours.length; i++) {
			if (contourLevels[i] !== lvl) continue;
			let contour = allContours[i].slice();
			if (direction == 'climb') contour = reversePath(contour);
			levelPaths.push({ tpath: contour, isContour: true, passStart: true });
		}
		if (levelPaths.length > 0) {
			contoursByLevel[lvl] = levelPaths;
		}
	}

	if (!skipOutermost) {
		if (!contoursByLevel[startLevel]) contoursByLevel[startLevel] = [];
		for (let island of machinedIslands) {
			let islandContour = island.slice();
			if (direction != 'climb') islandContour = reversePath(islandContour);
			contoursByLevel[startLevel].push({ tpath: islandContour, isContour: true, passStart: true });
		}
	}

	let innerContours = [];
	let outerContours = contoursByLevel[startLevel] ? optimizePathListOrder(contoursByLevel[startLevel]) : [];
	for (let lvl = switchLevel - 1; lvl > startLevel; lvl--) {
		if (contoursByLevel[lvl]) {
			innerContours.push(...optimizePathListOrder(contoursByLevel[lvl]));
		}
	}

	if (switchLevel < totalLevels) {
		let infillPaths = generateRasterInfill(machinedOuter, machinedIslands, islandPaths, switchLevel, stepover, pocketRadius, angle);
		let result = [...infillPaths, ...innerContours, ...outerContours];
		return rotateContoursToNearestEntry(eliminateUnnecessaryRetracts(result, machinedIslands, islandPaths, machinedOuter, outerPath));
	}

	let result = [...innerContours, ...outerContours];
	return rotateContoursToNearestEntry(eliminateUnnecessaryRetracts(result, machinedIslands, islandPaths, machinedOuter, outerPath));
}

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

function optimizeGroupOrder(groups) {
	if (groups.length === 0) return [];
	if (groups.length === 1) return groups[0];
	let remaining = groups.map((g, i) => {
		let p = g[0].tpath[0];
		return { idx: i, x: p.x, y: p.y };
	});
	let ordered = [];
	remaining.sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y));
	let current = remaining.shift();
	ordered.push(...groups[current.idx]);
	while (remaining.length > 0) {
		let lastPath = ordered[ordered.length - 1].tpath;
		let endPt = lastPath[lastPath.length - 1];
		let bestIdx = 0;
		let bestDist = Infinity;
		for (let i = 0; i < remaining.length; i++) {
			let dx = remaining[i].x - endPt.x;
			let dy = remaining[i].y - endPt.y;
			let d = dx * dx + dy * dy;
			if (d < bestDist) {
				bestDist = d;
				bestIdx = i;
			}
		}
		current = remaining.splice(bestIdx, 1)[0];
		ordered.push(...groups[current.idx]);
	}
	return ordered;
}

function generatePocketToolpaths(payload) {
	const { selectionGroups, radius, stepover, angle, direction, strategy } = payload;
	let createdCount = 0;
	const toolpaths = [];

	workerLog('Pocket worker started', {
		groupCount: selectionGroups.length,
		radius: radius,
		stepover: stepover,
		angle: angle,
		direction: direction,
		strategy: strategy
	});

	for (let g = 0; g < selectionGroups.length; g++) {
		const group = selectionGroups[g];
		let inputPaths = group.paths.map(function(path, pathIndex) {
			return preparePocketInputPath(path.path, 'group-' + g + '-path-' + pathIndex);
		});
		workerLog('Processing pocket group', {
			groupIndex: g,
			pathCount: inputPaths.length,
			svgIds: group.paths.map(function(path) { return path.id; })
		});
		inputPaths = normalizeWindingOrder(inputPaths);
		const selectedSvgIds = group.paths.map(function(path) {
			return path.id;
		});
		let depths = computeNestingDepths(inputPaths);
		let pocketGroups = [];

		for (let i = 0; i < inputPaths.length; i++) {
			if (depths[i] % 2 !== 0) continue;
			let outerPath = inputPaths[i];
			let directIslands = [];
			for (let j = 0; j < inputPaths.length; j++) {
				if (i === j) continue;
				if (depths[j] === depths[i] + 1 && pathIn(outerPath, inputPaths[j])) {
					directIslands.push(inputPaths[j]);
				}
			}
			workerLog('Generating sub-pocket', {
				groupIndex: g,
				outerIndex: i,
				depth: depths[i],
				outerPointCount: outerPath.length,
				islandCount: directIslands.length
			});
			let paths = generatePocketPaths(outerPath, directIslands, radius, stepover, angle, direction, 0, strategy);
			workerLog('Sub-pocket generated', {
				groupIndex: g,
				outerIndex: i,
				generatedPathCount: paths.length
			});
			if (paths.length > 0) pocketGroups.push(paths);
		}

		if (pocketGroups.length === 0) {
			workerLog('Pocket group produced no paths', {
				groupIndex: g,
				svgIds: selectedSvgIds
			});
			continue;
		}
		let allPaths = optimizeGroupOrder(pocketGroups);
		workerLog('Pocket group completed', {
			groupIndex: g,
			groupPocketCount: pocketGroups.length,
			flattenedPathCount: allPaths.length
		});
		toolpaths.push({
			paths: allPaths,
			name: 'Pocket',
			operation: 'Pocket',
			svgId: null,
			svgIds: selectedSvgIds
		});
		createdCount++;
	}

	workerLog('Pocket worker completed', {
		createdCount: createdCount,
		toolpathCount: toolpaths.length
	});

	return { createdCount, toolpaths };
}

self.onmessage = function(event) {
	try {
		const result = generatePocketToolpaths(event.data);
		self.postMessage({ ok: true, result: result });
	} catch (error) {
		self.postMessage({
			ok: false,
			error: error && error.message ? error.message : String(error)
		});
	}
};
