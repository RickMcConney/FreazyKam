importScripts('../gcodeParser.js');

self.onmessage = function(event) {
	const data = event.data || {};
	const requestId = data.requestId;

	try {
		const result = preprocessGcode(data.gcode, data.profile, data.config || {});
		self.postMessage({ ok: true, requestId: requestId, result: result });
	} catch (error) {
		self.postMessage({
			ok: false,
			requestId: requestId,
			error: error && error.message ? error.message : String(error)
		});
	}
};

function preprocessGcode(gcode, profile, config) {
	const parseConfig = createGcodeParseConfig(profile || null);
	const parseResult = parseGcodeFile(gcode, parseConfig, true);
	const parsedMovements = parseResult.movements || [];
	const parsedLineMap = parseResult.lineMap || [];
	const rapidFeedRate = config.rapidFeedRate || 6000;

	const gcodeLines = gcode.split('\n');
	const flattenedPath = [];
	const movements = [];
	const visualizationMovements = [];
	const movementTiming = [];
	const toolCommentsByLineIndex = {};
	const toolCommentsInOrder = [];
	const toolChangePoints = [];
	const lineNumberToTimeEntries = [];
	let toolCommentLines = [];

	let toolInfo = {};
	let totalAnimationTime = 0;
	let totalJobTime = 0;
	let currentToolInfo = null;
	let prevX = 0;
	let prevY = 0;
	let prevZ = 5;

	for (let lineIndex = 0; lineIndex < gcodeLines.length; lineIndex++) {
		const trimmed = gcodeLines[lineIndex].trim();
		if (!trimmed.includes('Tool:')) continue;

		const toolMatch = trimmed.match(/Tool:\s*ID=(\d+)\s+Type=([A-Za-z ]+)\s+Diameter=([\d.]+)\s+Angle=([\d.]+)(?:\s+StepDown=([\d.]+))?/);
		if (!toolMatch) continue;

		const toolData = {
			id: toolMatch[1],
			type: toolMatch[2].trim(),
			diameter: parseFloat(toolMatch[3]),
			angle: parseFloat(toolMatch[4]),
			vbitAngle: parseFloat(toolMatch[4]),
			stepDown: toolMatch[5] ? parseFloat(toolMatch[5]) : null
		};

		toolCommentsByLineIndex[lineIndex] = toolData;
		if (toolCommentsInOrder.length === 0) {
			toolInfo = toolData;
		}

		if (toolCommentsInOrder.length === 0 || toolCommentsInOrder[toolCommentsInOrder.length - 1].id !== toolData.id) {
			toolCommentsInOrder.push(toolData);
			toolCommentLines.push(lineIndex);
		}
	}

	for (let i = 0; i < toolCommentsInOrder.length; i++) {
		toolChangePoints.push({ lineNumber: toolCommentLines[i], toolInfo: toolCommentsInOrder[i] });
	}
	toolChangePoints.sort(function(a, b) { return a.lineNumber - b.lineNumber; });

	let firstPosition = null;
	if (parsedMovements.length > 0) {
		firstPosition = {
			x: parsedMovements[0].x,
			y: parsedMovements[0].y,
			z: parsedMovements[0].z
		};
	}

	if (firstPosition) {
		const syntheticMove = {
			x: firstPosition.x,
			y: firstPosition.y,
			z: 5,
			f: rapidFeedRate,
			t: -1,
			m: 0
		};
		movements.push(syntheticMove);
		visualizationMovements.push(syntheticMove);
	}

	for (let i = 0; i < parsedMovements.length; i++) {
		const movement = parsedMovements[i];
		movements.push(movement);
		visualizationMovements.push(movement);

		if (movement.m === CUT) {
			flattenedPath.push({
				x: movement.x,
				y: movement.y,
				z: movement.z,
				isCutting: true
			});
		}
	}

	for (let i = 0; i < movements.length; i++) {
		const move = movements[i];
		if (move.m === NON_MOVEMENT) continue;

		const gcodeLineNumber = i === 0 && firstPosition
			? undefined
			: parsedLineMap[i - (firstPosition ? 1 : 0)];

		if (gcodeLineNumber !== undefined) {
			currentToolInfo = getToolForLineNumber(toolChangePoints, gcodeLineNumber) || currentToolInfo;
		}

		const dx = move.x - prevX;
		const dy = move.y - prevY;
		const dz = move.z - prevZ;
		const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
		const feedRate = move.f || (move.m === CUT ? 600 : rapidFeedRate);
		const feedRateMMPerSec = feedRate / 60;
		const segmentTime = distance > 0 ? distance / feedRateMMPerSec : 0;
		totalAnimationTime += segmentTime;

		movementTiming.push({
			x: move.x,
			y: move.y,
			z: move.z,
			cumulativeTime: totalAnimationTime,
			feedRate: feedRate,
			isG1: move.m === CUT,
			distance: distance,
			gcodeLineNumber: gcodeLineNumber
		});

		if (gcodeLineNumber !== undefined) {
			lineNumberToTimeEntries.push([gcodeLineNumber, totalAnimationTime]);
			if (currentToolInfo && currentToolInfo.diameter) {
				movementTiming[movementTiming.length - 1].toolRadius = currentToolInfo.diameter / 2;
			}
			totalJobTime = Math.max(totalJobTime, totalAnimationTime);
		}

		prevX = move.x;
		prevY = move.y;
		prevZ = move.z;
	}

	return {
		gcodeLines: gcodeLines,
		totalGcodeLines: gcodeLines.length,
		movements: movements,
		visualizationMovements: visualizationMovements,
		flattenedPath: flattenedPath,
		movementTiming: movementTiming,
		totalAnimationTime: totalAnimationTime,
		toolInfo: toolInfo,
		toolCommentsByLineIndex: toolCommentsByLineIndex,
		toolCommentsInOrder: toolCommentsInOrder,
		toolChangePoints: toolChangePoints,
		lineNumberToTimeEntries: lineNumberToTimeEntries,
		totalJobTime: totalJobTime
	};
}

function getToolForLineNumber(toolChangePoints, lineNumber) {
	let activeToolInfo = null;
	for (let i = 0; i < toolChangePoints.length; i++) {
		const changePoint = toolChangePoints[i];
		if (changePoint.lineNumber <= lineNumber) {
			activeToolInfo = changePoint.toolInfo;
		} else {
			break;
		}
	}
	return activeToolInfo;
}
