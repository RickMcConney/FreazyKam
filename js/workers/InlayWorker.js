self.importScripts('../lib/clipperf.js', '../util.js', '../toolPath.js', './pocketWorker.js');

function roundConcaveCorners(path, radius) {
	if (radius <= 0) return path;
	let offsetOut = offsetPath(path, radius, true);
	if (offsetOut.length === 0) return path;
	let offsetIn = offsetPath(offsetOut[0], radius, false);
	if (offsetIn.length === 0) return path;
	return offsetIn[0];
}

function roundConvexCorners(path, radius) {
	if (radius <= 0) return path;
	let offsetIn = offsetPath(path, radius, false);
	if (offsetIn.length === 0) return path;
	let offsetOut = offsetPath(offsetIn[0], radius, true);
	if (offsetOut.length === 0) return path;
	return offsetOut[0];
}

function workerLog(message, details) {
	self.postMessage({
		ok: true,
		log: true,
		message: 'InlayWorker ' + message,
		details: details || null
	});
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

function buildExpandedHullBoundary(allClearanceOuters, expand) {
	let allPts = [];
	for (let co of allClearanceOuters) {
		for (let pt of co) allPts.push({ x: pt.x, y: pt.y });
	}
	let hull = convexHull(allPts);
	let expanded = offsetPath(hull, expand, true);
	if (expanded.length === 0) return null;
	let outerBoundary = expanded[0];
	if (outerBoundary.length > 0 &&
		(outerBoundary[0].x !== outerBoundary[outerBoundary.length - 1].x ||
		 outerBoundary[0].y !== outerBoundary[outerBoundary.length - 1].y)) {
		outerBoundary.push({ x: outerBoundary[0].x, y: outerBoundary[0].y });
	}
	return outerBoundary;
}

function appendCutOutGroup(cutOut, outerBoundary, pocketRadius, direction, materialDepth, cutOutGroups) {
	if (!cutOut) return;
	let cutOutOffset = offsetPath(outerBoundary, pocketRadius, false);
	if (cutOutOffset.length > 0) {
		let cutOutContour = cutOutOffset[0].slice();
		if (direction == 'climb') cutOutContour = reversePath(cutOutContour);
		cutOutGroups.push([{ tpath: cutOutContour, isContour: true, cutOutDepth: materialDepth }]);
	}
}

function pocketOddDepthIslands(clearancePaths, inputPaths, pocketRadius, stepover, angle, direction, finishRadius, pocketPaths, pathTransform) {
	const transform = pathTransform || (p => p);
	for (let cp of clearancePaths) {
		if (cp.depth % 2 !== 1) continue;
		let subIslands = [];
		for (let cp2 of clearancePaths) {
			if (cp2.depth === cp.depth + 1 && pathIn(inputPaths[cp.idx], inputPaths[cp2.idx])) {
				let sub = transform(cp2.path);
				if (sub) subIslands.push(sub);
			}
		}
		let boundary = transform(cp.path);
		if (boundary) {
			let islandPocket = generatePocketPaths(boundary, subIslands, pocketRadius, stepover, angle, direction, finishRadius);
			pocketPaths.push(...islandPocket);
		}
	}
}

function buildClearancePaths(inputPaths, depths, clearance, joinType, prepPath) {
	let clearancePaths = [];
	for (let i = 0; i < inputPaths.length; i++) {
		let isRaised = (depths[i] % 2 === 0);
		let base = prepPath ? prepPath(inputPaths[i], isRaised) : inputPaths[i];
		let adjusted = base;
		if (clearance > 0) {
			let co = new clipper.ClipperOffset(20, 0.25);
			co.AddPath(base, joinType, ClipperLib.EndType.etClosedPolygon);
			let cr = [];
			co.Execute(cr, isRaised ? -clearance : clearance);
			if (cr.length > 0) {
				cr[0].push(cr[0][0]);
				adjusted = cr[0];
			}
		}
		clearancePaths.push({ path: adjusted, depth: depths[i], idx: i });
	}
	return clearancePaths;
}

function generateInlayFemalePaths(outerPath, islandPaths, pocketRadius, finishRadius, stepover, angle, direction, pocketGroups, profileGroups) {
	let roundedOuter = roundConvexCorners(roundConcaveCorners(outerPath, finishRadius), finishRadius);
	let roundedIslands = islandPaths.map(p => roundConcaveCorners(roundConvexCorners(p, finishRadius), finishRadius));

	let pocketPaths = generatePocketPaths(roundedOuter, roundedIslands, pocketRadius, stepover, angle, direction, finishRadius);
	if (pocketPaths.length > 0) pocketGroups.push(pocketPaths);

	let shapeProfPaths = [];
	let profileOffset = offsetPath(roundedOuter, finishRadius, false);
	if (profileOffset.length > 0) {
		let profileContour = profileOffset[0].slice();
		if (direction == 'climb') profileContour = reversePath(profileContour);
		shapeProfPaths.push({ tpath: profileContour, isContour: true, passStart: true });
	}
	for (let island of roundedIslands) {
		let islandProfileOffset = offsetPath(island, finishRadius, true);
		if (islandProfileOffset.length > 0) {
			let islandContour = islandProfileOffset[0].slice();
			if (direction != 'climb') islandContour = reversePath(islandContour);
			shapeProfPaths.push({ tpath: islandContour, isContour: true, passStart: true });
		}
	}
	if (shapeProfPaths.length > 0) profileGroups.push(rotateContoursToNearestEntry(shapeProfPaths));
}

function generateInlayMalePaths(inputPaths, depths, clearance, diameterScale, pocketRadius, finishRadius, stepover, angle, direction, cutOut, materialDepth, pocketGroups, profileGroups, cutOutGroups) {
	let expand = 2 * diameterScale;
	let clearancePaths = buildClearancePaths(inputPaths, depths, clearance, ClipperLib.JoinType.jtRound,
		(path, isRaised) => isRaised
			? roundConcaveCorners(roundConvexCorners(path, finishRadius), finishRadius)
			: roundConvexCorners(roundConcaveCorners(path, finishRadius), finishRadius));

	let allClearanceOuters = clearancePaths.filter(c => c.depth === 0).map(c => c.path);
	let outerBoundary = buildExpandedHullBoundary(allClearanceOuters, expand);
	if (!outerBoundary) return;

	let pocketPaths = generatePocketPaths(outerBoundary, allClearanceOuters, pocketRadius, stepover, angle, direction, finishRadius);
	pocketOddDepthIslands(clearancePaths, inputPaths, pocketRadius, stepover, angle, direction, finishRadius, pocketPaths, null);
	if (pocketPaths.length > 0) pocketGroups.push(optimizePocketPaths(pocketPaths));

	let shapeProfPaths = [];
	for (let cp of clearancePaths) {
		let isRaised = (cp.depth % 2 === 0);
		let profileOffset = offsetPath(cp.path, finishRadius, isRaised);
		if (profileOffset.length > 0) {
			let profileContour = profileOffset[0].slice();
			if (isRaised) {
				if (direction != 'climb') profileContour = reversePath(profileContour);
			} else {
				if (direction == 'climb') profileContour = reversePath(profileContour);
			}
			shapeProfPaths.push({ tpath: profileContour, isContour: true, passStart: true });
		}
	}
	if (shapeProfPaths.length > 0) profileGroups.push(rotateContoursToNearestEntry(shapeProfPaths));
	appendCutOutGroup(cutOut, outerBoundary, pocketRadius, direction, materialDepth, cutOutGroups);
}

function buildInlayToolpathEntries(pocketGroups, profileGroups, cutOutGroups, pocketingTool, finishingTool, typeName, selectedSvgIds) {
	const depthMM = pocketingTool.depth;
	const toolpathEntries = [];

	let allPocketPaths = optimizeGroupOrder(pocketGroups);
	if (allPocketPaths.length > 0) {
		toolpathEntries.push({
			name: 'Inlay ' + typeName,
			operation: 'Inlay',
			svgId: null,
			svgIds: selectedSvgIds,
			label: depthMM + 'mm ' + typeName,
			tool: { ...pocketingTool },
			paths: allPocketPaths
		});
	}

	let allProfilePaths = optimizeGroupOrder(profileGroups);
	if (allProfilePaths.length > 0) {
		toolpathEntries.push({
			name: 'Inlay ' + typeName + ' Profile',
			operation: 'Inlay',
			svgId: null,
			svgIds: selectedSvgIds,
			label: depthMM + 'mm ' + typeName + ' Profile',
			tool: { ...finishingTool, depth: pocketingTool.depth, step: pocketingTool.step },
			paths: allProfilePaths
		});
	}

	let allCutOutPaths = optimizeGroupOrder(cutOutGroups);
	if (allCutOutPaths.length > 0) {
		let materialDepth = allCutOutPaths[0].cutOutDepth;
		let cleanCutOutPaths = allCutOutPaths.map(p => ({ tpath: p.tpath, isContour: p.isContour }));
		toolpathEntries.push({
			name: 'Inlay Plug Cutout',
			operation: 'Inlay',
			svgId: null,
			svgIds: selectedSvgIds,
			label: depthMM + 'mm Plug Cutout',
			tool: { ...pocketingTool, depth: materialDepth },
			paths: cleanCutOutPaths
		});
	}

	return toolpathEntries;
}

function generateInlayToolpaths(payload) {
	const {
		selectionGroups,
		props,
		viewScale,
		pocketingTool,
		finishingTool,
		materialDepth
	} = payload;
	const inlayType = props?.inlayType || 'female';
	const clearanceMM = props?.clearance || 0.1;
	const clearance = clearanceMM * viewScale;
	const cutOut = props?.cutOut || false;
	const angle = props?.angle || 0;
	const direction = pocketingTool.direction || 'climb';
	const pocketRadius = pocketingTool.diameter / 2 * viewScale;
	const finishRadius = finishingTool.diameter / 2 * viewScale;
	const stepover = 2 * pocketRadius * pocketingTool.stepover / 100;
	const createdGroups = [];
	let createdCount = 0;

	workerLog('start', {
		groupCount: selectionGroups.length,
		inlayType: inlayType,
		pocketRadius: pocketRadius,
		finishRadius: finishRadius,
		stepover: stepover,
		angle: angle,
		direction: direction
	});

	for (let g = 0; g < selectionGroups.length; g++) {
		const group = selectionGroups[g];
		let inputPaths = group.paths.map(function(path) {
			return path.path;
		});
		const selectedSvgIds = group.paths.map(function(path) {
			return path.id;
		});
		workerLog('group:start', {
			groupIndex: g,
			svgIds: selectedSvgIds,
			pathCount: inputPaths.length
		});

		if (inlayType === 'male' && props?.mirror) {
			var allBbox = boundingBox(inputPaths.flat());
			var centerX = (allBbox.minx + allBbox.maxx) / 2;
			inputPaths = inputPaths.map(function(path) {
				return path.map(function(pt) {
					return { x: 2 * centerX - pt.x, y: pt.y };
				});
			});
			workerLog('group:mirrored', {
				groupIndex: g,
				centerX: centerX
			});
		}

		inputPaths = normalizeWindingOrder(inputPaths);
		let depths = computeNestingDepths(inputPaths);
		let allOuters = [];
		let allIslands = [];
		for (let i = 0; i < inputPaths.length; i++) {
			if (depths[i] % 2 === 0) allOuters.push(inputPaths[i]);
			else allIslands.push(inputPaths[i]);
		}

		if (allOuters.length === 0) {
			workerLog('group:skipped-no-outer', {
				groupIndex: g,
				svgIds: selectedSvgIds
			});
			continue;
		}

		let pocketGroups = [];
		let profileGroups = [];
		let cutOutGroups = [];
		const typeName = inlayType === 'female' ? 'Socket' : 'Plug';

		if (inlayType === 'female') {
			for (let oi = 0; oi < allOuters.length; oi++) {
				let outerPath = allOuters[oi];
				let outerIdx = inputPaths.indexOf(outerPath);
				let outerDepth = depths[outerIdx];
				let islandPaths = [];
				for (let j = 0; j < inputPaths.length; j++) {
					if (depths[j] === outerDepth + 1 && pathIn(outerPath, inputPaths[j])) {
						islandPaths.push(inputPaths[j]);
					}
				}
				generateInlayFemalePaths(outerPath, islandPaths, pocketRadius, finishRadius, stepover, angle, direction, pocketGroups, profileGroups);
			}
		} else {
			generateInlayMalePaths(inputPaths, depths, clearance, pocketingTool.diameter * viewScale, pocketRadius, finishRadius, stepover, angle, direction, cutOut, materialDepth, pocketGroups, profileGroups, cutOutGroups);
		}

		const toolpaths = buildInlayToolpathEntries(pocketGroups, profileGroups, cutOutGroups, pocketingTool, finishingTool, typeName, selectedSvgIds);
		workerLog('group:done', {
			groupIndex: g,
			svgIds: selectedSvgIds,
			resultCount: toolpaths.length,
			pocketGroupCount: pocketGroups.length,
			profileGroupCount: profileGroups.length,
			cutOutGroupCount: cutOutGroups.length
		});
		createdGroups.push({
			groupIndex: g,
			svgIds: selectedSvgIds,
			toolpaths: toolpaths
		});
		if (toolpaths.length > 0) createdCount++;
	}

	workerLog('done', {
		createdCount: createdCount,
		groupResultCount: createdGroups.length
	});
	return {
		createdCount: createdCount,
		groups: createdGroups
	};
}

self.onmessage = function(event) {
	try {
		const result = generateInlayToolpaths(event.data);
		self.postMessage({ ok: true, result: result });
	} catch (error) {
		self.postMessage({
			ok: false,
			error: error && error.message ? error.message : String(error)
		});
	}
};