/**
 * 2D Simulation Module
 *
 * Complete rewrite of the 2D simulation system.
 * Line-number-driven with interpolation-based tool visualization.
 *
 * Features:
 * - Feed-rate responsive point interpolation
 * - V-bit circle radius based on tool angle and depth
 * - Tool change tracking and preprocessing
 * - Canvas-based visualization
 *
 * Note: Uses movement type constants from gcodeParser.js (NON_MOVEMENT=-1, RAPID=0, CUT=1)
 */

// Global simulation state
var simulation2D = {
    // Control state
    isRunning: false,
    isPaused: false,
    speed: 5.0,

    // G-code and parsing
    gcode: '',
    gcodeLines: [],
    currentLineIndex: 0,

    // Precomputed points (new: one point per G-code line)
    precomputedPoints: [],  // Array of {moveType, x, y, z, startX, startY, startZ, feedRate, moveTime, toolRadius, tool, frustumData, isFrustum}
    currentLineProgress: 0,  // 0 to 1: position within current segment for interpolation
    lastFrameTime: null,    // Timestamp for delta-time calculation

    // Animation
    animationFrameId: null,

    // Display tracking
    totalElapsedTime: 0,    // Accumulated elapsed time during simulation
    totalSimulationTime: 0  // Pre-calculated total time for entire G-code
};

/**
 * Setup simulation: generate G-code and parse with profile-aware parser
 * @returns {boolean} Success indicator
 */
function setupSimulation2D() {
    try {
        // Generate G-code from toolpaths
        simulation2D.gcode = toGcode();

        if (!simulation2D.gcode || simulation2D.gcode.length === 0) {
            console.error('No G-code generated. Check that toolpaths exist.');
            return false;
        }

        // Initialize state
        simulation2D.currentLineIndex = 0;
        simulation2D.totalElapsedTime = 0;
        simulation2D.totalSimulationTime = 0;

        // Parse G-code using profile-aware parser
        // This respects axis inversions, custom ordering, and extracts tool metadata
        const profile = window.currentGcodeProfile || null;
        const parseConfig = createGcodeParseConfig(profile);
        const parseResult = parseGcodeFile(simulation2D.gcode, parseConfig,false);
        const movements = parseResult.movements;
        const tools = parseResult.tools;

        if (!movements || movements.length === 0) {
            console.error('No valid movements parsed from G-code.');
            return false;
        }

        // Store movements, tools, and line mapping for animation and seeking
        // lineMap[i] = original G-code line number for movements[i]
        simulation2D.movements = movements;
        simulation2D.tools = tools;
        simulation2D.lineMap = parseResult.lineMap || null;

        // Also keep gcodeLines for display (split original gcode)
        simulation2D.gcodeLines = simulation2D.gcode
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        // Pre-calculate total execution time from parsed movements
        let totalTime = 0;
        let prevPos = { x: 0, y: 0, z: 0 };

        for (const movement of movements) {
            if (movement.m !== NON_MOVEMENT) {  // Both RAPID (0) and CUT (1) moves have time
                const dx = movement.x - prevPos.x;
                const dy = movement.y - prevPos.y;
                const dz = movement.z - prevPos.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                const feedRate = movement.f || (movement.m === CUT ? DEFAULT_CUT_FEED : DEFAULT_RAPID_FEED);
                const moveTime = distance > 0 ? (distance / feedRate) * 60 : 0.001;  // seconds
                totalTime += moveTime;

                prevPos = { x: movement.x, y: movement.y, z: movement.z };
            }
        }

        simulation2D.totalSimulationTime = totalTime;

        // Precompute all G-code points for fast seeking and animation
        simulation2D.precomputedPoints = precomputePoints(movements, tools);


        // Show G-code viewer panel and populate with G-code
        if (typeof gcodeView !== 'undefined' && gcodeView) {
            gcodeView.populate(simulation2D.gcode);
            showGcodeViewerPanel();
        }

        return true;
    } catch (error) {
        console.error('Error setting up 2D simulation:', error);
        return false;
    }
}

/**
 * Precompute G-code points from parser movements
 * Stores points in WORLD SPACE (with viewScale and origin applied)
 * This enables instant seeking and simplified animation loop
 * Parser already respects axis inversions and custom ordering from profile
 *
 * Movement structure (optimized):
 *   x, y, z - coordinates
 *   f - feed rate
 *   t - tool index (-1 for no tool, 0+ for tools array index)
 *   m - movement type: 0=non-movement, 1=rapid, 2=cutting
 *
 * @param {Array} movements - Optimized movements from gcodeParser
 * @param {Array} tools - Shared tools array from gcodeParser
 * @returns {Array} Array of precomputed points, one per movement (0-based line indexing)
 */
function precomputePoints(movements, tools) {
    const points = [];
    let toolPos = { x: 0, y: 0, z: 0 };  // MM coordinates
    let currentTool = null;
    let currentFeedRate = 500;  // Default feed rate

    for (let i = 0; i < movements.length; i++) {
        const movement = movements[i];

        // Handle non-movement entries (NON_MOVEMENT: comments, empty lines, unrecognized commands)
        if (movement.m === NON_MOVEMENT) {
            // Update tool if this movement has a tool reference (shouldn't for non-movements, but check)
            if (movement.t >= 0 && tools && tools[movement.t]) {
                currentTool = tools[movement.t];
            }

            // Add placeholder point for non-movement line
            // This keeps the precomputedPoints array in 1-to-1 sync with G-code lines (0-based)
            const placeholderPoint = {
                moveType: NON_MOVEMENT,
                x: toolPos.x * viewScale + origin.x,
                y: origin.y - toolPos.y * viewScale,
                z: toolPos.z,
                startX: toolPos.x * viewScale + origin.x,
                startY: origin.y - toolPos.y * viewScale,
                startZ: toolPos.z,
                feedRate: currentFeedRate,
                moveTime: 0.001,  // Minimal time for non-movement lines
                toolRadius: 0,
                tool: currentTool
            };
            points.push(placeholderPoint);
            continue;
        }

        // Update tool if this movement has a tool reference
        if (movement.t >= 0 && tools && tools[movement.t]) {
            currentTool = tools[movement.t];
        }

        // Get feed rate for this movement
        const feedRate = movement.f || (movement.m === CUT ? DEFAULT_CUT_FEED : DEFAULT_RAPID_FEED);
        currentFeedRate = feedRate;

        // Build point from parser movement (coordinates already respect profile inversions)
        const isCuttingMove = movement.m === CUT;
        let point = {
            moveType: isCuttingMove ? CUT : RAPID,
            x: movement.x * viewScale + origin.x,           // Endpoint in WORLD SPACE
            y: origin.y - movement.y * viewScale,           // Y inverted for screen space
            z: movement.z,
            startX: toolPos.x * viewScale + origin.x,       // Start point for interpolation (WORLD SPACE)
            startY: origin.y - toolPos.y * viewScale,       // Y inverted for screen space
            startZ: toolPos.z,
            feedRate: feedRate,
            moveTime: 0.001,        // Will be calculated below
            toolRadius: 0,          // Will be calculated below
            tool: currentTool
        };

        // Calculate movement properties
        const dx = movement.x - toolPos.x;
        const dy = movement.y - toolPos.y;
        const dz = movement.z - toolPos.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const moveTime = distance > 0 ? (distance / point.feedRate) * 60 : 0.001;  // seconds
        point.moveTime = moveTime;

        // Calculate tool radius (for V-bits, this is at the endpoint Z)
        if (isCuttingMove) {
            const calcRadius = getToolCircleRadius(movement.z, currentTool);
            point.toolRadius = calcRadius * viewScale;

            // Calculate frustum geometry for segments with significant Z changes
            const zDistance = Math.abs(movement.z - toolPos.z);
            if (zDistance >= 0.01) {
                // Calculate radius at start and end of segment
                const radiusStart = getToolCircleRadius(toolPos.z, currentTool) * viewScale;
                const radiusEnd = getToolCircleRadius(movement.z, currentTool) * viewScale;
                const radiusDiff = Math.abs(radiusEnd - radiusStart);

                // Only calculate frustum if radii differ significantly (> 0.1mm)
                if (radiusDiff > 0.1) {
                    // Calculate frustum geometry for rendering
                    const startX = toolPos.x * viewScale + origin.x;
                    const startY = origin.y - toolPos.y * viewScale;
                    const endX = movement.x * viewScale + origin.x;
                    const endY = origin.y - movement.y * viewScale;

                    const frustumData = calculateFrustumGeometry(
                        startX, startY, radiusStart,
                        endX, endY, radiusEnd
                    );

                    if (frustumData) {
                        point.frustumData = frustumData;
                        point.isFrustum = true;
                    }
                }
            }
        } else {  // Rapid move
            point.toolRadius = 0.5 * viewScale;  // Small visualization for rapids
        }

        // Update position for next iteration
        toolPos = { x: movement.x, y: movement.y, z: movement.z };
        points.push(point);
    }

    return points;
}

/**
 * Calculate frustum geometry (tangent lines between two circles)
 * Used for rendering actual tool shape when Z changes
 *
 * @param {number} x1 - Circle 1 center X (world space)
 * @param {number} y1 - Circle 1 center Y (world space)
 * @param {number} r1 - Circle 1 radius (world space)
 * @param {number} x2 - Circle 2 center X (world space)
 * @param {number} y2 - Circle 2 center Y (world space)
 * @param {number} r2 - Circle 2 radius (world space)
 * @returns {Object|null} Frustum geometry with tangent points and angles, or null if degenerate
 */
function calculateFrustumGeometry(x1, y1, r1, x2, y2, r2) {
    // Calculate distance between centers
    const dx = x2 - x1;
    const dy = y2 - y1;
    const d = Math.sqrt(dx * dx + dy * dy);

    // Handle degenerate cases
    // - Circles too close together
    // - One circle inside the other (but allow if one radius is 0 for cone case)
    if (d < 0.01 || (d < Math.abs(r2 - r1) && r1 > 0.01 && r2 > 0.01)) {
        return null;
    }

    // Angle of line connecting centers
    const centerAngle = Math.atan2(dy, dx);

    // Calculate angle offset for tangent lines
    const radiusDiff = r2 - r1;
    const tangentOffsetAngle = Math.asin(Math.min(1, Math.abs(radiusDiff) / d));

    // Two external tangent angles
    const tangent1Angle = centerAngle + tangentOffsetAngle;
    const tangent2Angle = centerAngle - tangentOffsetAngle;

    // Calculate tangent points on circle 1
    const t1p1_x = x1 + r1 * Math.cos(tangent1Angle + Math.PI / 2);
    const t1p1_y = y1 + r1 * Math.sin(tangent1Angle + Math.PI / 2);
    const t2p1_x = x1 + r1 * Math.cos(tangent2Angle - Math.PI / 2);
    const t2p1_y = y1 + r1 * Math.sin(tangent2Angle - Math.PI / 2);

    // Calculate tangent points on circle 2
    const t1p2_x = x2 + r2 * Math.cos(tangent1Angle + Math.PI / 2);
    const t1p2_y = y2 + r2 * Math.sin(tangent1Angle + Math.PI / 2);
    const t2p2_x = x2 + r2 * Math.cos(tangent2Angle - Math.PI / 2);
    const t2p2_y = y2 + r2 * Math.sin(tangent2Angle - Math.PI / 2);

    // Calculate angles for arc drawing on circles
    // Only calculate if radius is non-zero (zero radius is a point, no arc)
    let arc1Start = 0, arc1End = 0;
    if (r1 > 0.01) {
        arc1Start = Math.atan2(t2p1_y - y1, t2p1_x - x1);
        arc1End = Math.atan2(t1p1_y - y1, t1p1_x - x1);
    }

    let arc2Start = 0, arc2End = 0;
    if (r2 > 0.01) {
        arc2Start = Math.atan2(t1p2_y - y2, t1p2_x - x2);
        arc2End = Math.atan2(t2p2_y - y2, t2p2_x - x2);
    }

    return {
        // Circle 1 data
        x1: x1,
        y1: y1,
        r1: r1,
        arc1Start: arc1Start,
        arc1End: arc1End,
        t1p1: { x: t1p1_x, y: t1p1_y },  // Upper tangent point on circle 1
        t2p1: { x: t2p1_x, y: t2p1_y },  // Lower tangent point on circle 1

        // Circle 2 data
        x2: x2,
        y2: y2,
        r2: r2,
        arc2Start: arc2Start,
        arc2End: arc2End,
        t1p2: { x: t1p2_x, y: t1p2_y },  // Upper tangent point on circle 2
        t2p2: { x: t2p2_x, y: t2p2_y }   // Lower tangent point on circle 2
    };
}

/**
 * Interpolate position within a segment based on progress (0 to 1)
 * Points are already in WORLD SPACE, just interpolate and recalculate radius if needed
 * @param {Object} point - Precomputed point with startX/Y/Z and x/y/Z (in WORLD SPACE)
 * @param {number} progress - Progress through segment (0 to 1)
 * @returns {Object} Interpolated position {x, y, z, radius} in world coordinates
 */
function interpolateSegmentPosition(point, progress) {
    // Linear interpolation in world space
    const t = Math.max(0, Math.min(1, progress));

    const interpX = point.startX + (point.x - point.startX) * t;
    const interpY = point.startY + (point.y - point.startY) * t;
    const interpZ = point.startZ + (point.z - point.startZ) * t;

    // For V-bits, radius varies with depth
    let interpRadius = point.toolRadius;
    if (point.tool && point.tool.angle && point.tool.angle > 0) {
        // Recalculate radius for interpolated Z
        interpRadius = getToolCircleRadius(interpZ, point.tool);
    }

    // Return in world coordinates (no conversion needed)
    return {
        x: interpX,
        y: interpY,
        z: interpZ,
        radius: interpRadius
    };
}


/**
 * Calculate tool circle radius based on tool type and depth
 *
 * For V-bits: radius grows with depth (cone geometry)
 *   - Formula: radius = abs(depth) * tan(angle/2)
 *   - At surface (Z = 0): radius = 0 (cone comes to point)
 *   - At depth (Z < 0): radius grows linearly
 *   - Above material (Z > 0): radius = 0
 *
 * For Ball Nose bits: radius depends on sphere geometry
 *   - Sphere tip at depth, center at (depth + radius)
 *   - Formula: radius = sqrt(toolRadius² - (toolZ + toolRadius - Z)²)
 *   - At depth Z: circle of sphere cross-section
 *   - Above material (Z >= 0): radius = 0
 *
 * For End Mill, Drill: constant radius
 *   - Above material (Z >= 0): radius = 0.5 (rapid)
 *   - At any cutting depth (Z < 0): constant radius = diameter/2
 *
 * @param {number} depth - Current Z depth (negative for cuts, 0 at surface, positive = above material)
 * @param {Object} tool - Tool information object with properties: type, diameter, angle
 * @returns {number} Circle radius in millimeters
 */
function getToolCircleRadius(depth, tool) {
    if (!tool) {
        return 0;
    }

    // Validate tool properties
    const diameter = tool.diameter || 0;
    const angle = tool.angle || 0;

    if (isNaN(diameter) || isNaN(angle) || isNaN(depth)) {
        notify('Simulation: invalid tool or depth values — check tool settings.', 'warning');
        return 0;
    }

    // Check if V-bit tool (angle > 0)
    if (angle > 0) {
        // Validate angle is in valid range
        let vBitAngle = angle;
        if (vBitAngle <= 0 || vBitAngle >= 180 || isNaN(vBitAngle)) {
            notify('Simulation: V-bit angle ' + vBitAngle + '° is out of range — clamping to (0°, 180°).', 'warning');
            vBitAngle = Math.max(0.1, Math.min(179.9, vBitAngle));
        }

        // V-bit: at Z=0 (surface) radius is 0, grows as depth increases (Z < 0)
        // At Z > 0 (above material): also radius 0 (rapid move)
        if (depth >= 0) {
            return 0;  // At or above surface
        }

        const halfAngleRad = (vBitAngle / 2) * (Math.PI / 180);
        // At depth 0: radius = 0, grows as depth increases
        let radius = Math.abs(depth) * Math.tan(halfAngleRad);
        return isNaN(radius) ? 0 : radius;
    }

    // Ball Nose bit: spherical geometry
    // Sphere tip at depth, center at (depth + toolRadius)
    // Radius at given depth Z: sqrt(toolRadius² - (toolZ + toolRadius - Z)²)
    if (tool.type === 'Ball Nose' && diameter > 0) {
        // Above material (Z >= 0): no cut
        if (depth >= 0) {
            return 0;  // At or above surface
        }

        const toolRadius = diameter / 2;
        // Distance from sphere center to current Z
        const distFromCenter = Math.abs(depth + toolRadius);  // How far below the center we are

        // If we're below the sphere, the cylindrical shaft engages at full diameter
        if (distFromCenter > toolRadius) {
            return toolRadius;
        }

        // Sphere equation: distXY² + distFromCenter² = toolRadius²
        // Solving for distXY: distXY = sqrt(toolRadius² - distFromCenter²)
        const radiusSq = (toolRadius * toolRadius) - (distFromCenter * distFromCenter);
        const radius = Math.sqrt(Math.max(0, radiusSq));  // max(0) prevents NaN from rounding errors
        return isNaN(radius) ? 0 : radius;
    }

    // End Mill, Drill, and other tools above material (Z >= 0)
    if (depth >= 0) {
        return 0.5;  // Small rapid circle
    }

    // End Mill, Drill, and other tools: constant radius
    if (diameter <= 0) {
        return 0.5;  // Default small radius if no diameter specified
    }

    const radius = diameter / 2;
    return isNaN(radius) ? 0 : radius;
}

/**
 * Feed rate constants (mm/min)
 */
const DEFAULT_RAPID_FEED = 3000;  // Typical rapid feed rate
const DEFAULT_CUT_FEED = 500;     // Conservative cutting feed rate

/**
 * Convert multiple points to screen coordinates in a batch
 * More efficient than multiple worldToScreen() calls
 * @param {...Object} points - Variable number of point objects with {x, y} or coordinate pairs
 * @returns {Array} Array of screen coordinate objects {x, y}
 */
function convertPointsToScreen(...points) {
    return points.map(p => {
        if (typeof p === 'object' && p !== null) {
            return worldToScreen(p.x, p.y);
        }
        return p;  // Pass through non-objects as-is
    });
}

// Interpolate a precomputed point at progress t (0–1) along its segment.
// Returns a drawPoint with interpolated x, y, z and recalculated radius.
function createDrawPoint(point, t) {
    const x = point.startX + (point.x - point.startX) * t;
    const y = point.startY + (point.y - point.startY) * t;
    const z = point.startZ + (point.z - point.startZ) * t;
    let radius = point.toolRadius;
    if (point.tool && point.tool.angle && point.tool.angle > 0) {
        radius = getToolCircleRadius(z, point.tool) * viewScale;
    }
    return { x, y, z, radius, moveType: point.moveType, frustumData: point.frustumData, isFrustum: point.isFrustum };
}

/**
 * Draw material removal from precomputed points
 * Draws dashed red lines for rapids, brown slots for cuts
 * Draws only from line 0 to currentLineIndex
 */
function drawMaterialRemovalCircles() {
    if (!ctx) return;

    // If no precomputed points, nothing to draw
    if (!simulation2D.precomputedPoints || simulation2D.precomputedPoints.length === 0) {
        return;
    }

    ctx.save();
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Get the current line index (how far we've progressed through G-code)
    // Always include the current line (+1) so it draws when paused/single-stepping too
    let endLineIndex = simulation2D.currentLineIndex + 1;


    // Draw segments from 0 to current line
    let prevPoint = null;
    let currentSegmentType = null;
    let segmentPoints = [];

    for (let i = 0; i < endLineIndex && i < simulation2D.precomputedPoints.length; i++) {
        const point = simulation2D.precomputedPoints[i];
        const pointType = point.moveType;

        // Skip non-movement points (comments, empty lines, etc.) - don't draw them
        if (pointType === NON_MOVEMENT) {
            continue;
        }

        // For the currently animating segment, interpolate; otherwise use full endpoint
        const t = (i === simulation2D.currentLineIndex && simulation2D.isRunning && simulation2D.currentLineProgress < 1.0)
            ? simulation2D.currentLineProgress
            : 1.0;
        const drawPoint = createDrawPoint(point, t);

        // If type changed, draw and reset segment
        if (currentSegmentType !== null && pointType !== currentSegmentType) {
            // Draw the previous segment
            if (currentSegmentType === RAPID) {
                drawDashedSegment(segmentPoints);
            } else if (currentSegmentType === CUT) {
                drawCutSegment(segmentPoints);
            }
            segmentPoints = [];
        }

        // Add the endpoint of this segment
        segmentPoints.push(drawPoint);

        currentSegmentType = pointType;
    }

    // Draw final segment (including partially drawn current segment)
    if (segmentPoints.length > 0) {
        if (currentSegmentType === RAPID) {
            drawDashedSegment(segmentPoints);
        } else if (currentSegmentType === CUT) {
            drawCutSegment(segmentPoints);
        }
    }

    ctx.restore();

    // Draw filled circle at current tool position (outside save/restore to avoid inherited state)
    drawToolPositionCircle();
}

/**
 * Draw a filled circle at the current tool position during 2D simulation.
 * Blue depth gradient for cutting moves (deeper = darker blue).
 * Red depth gradient for rapid moves (Z=0 dark red, positive Z lighter red).
 */
function drawToolPositionCircle() {
    if (!simulation2D.precomputedPoints || simulation2D.precomputedPoints.length === 0) return;

    const idx = simulation2D.currentLineIndex;
    if (idx < 0 || idx >= simulation2D.precomputedPoints.length) return;

    const point = simulation2D.precomputedPoints[idx];
    if (!point || point.moveType === NON_MOVEMENT) return;

    // Interpolate position and V-bit radius
    const t = simulation2D.currentLineProgress || 0;
    const { x: toolX, y: toolY, z: toolZ, radius: vbitRadius } = createDrawPoint(point, t);

    // For rapids, use the full nominal tool diameter instead of depth-based radius
    let radius;
    if (point.moveType !== CUT && point.tool && point.tool.diameter) {
        radius = (point.tool.diameter / 2) * viewScale;
    } else {
        radius = vbitRadius;
    }

    const screenRadius = Math.max(2, radius * zoomLevel);
    const screenPt = worldToScreen(toolX, toolY);

    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    if (point.moveType === CUT) {
        // Blue depth gradient: shallow = light blue, deep = dark blue
        const maxDepth = (typeof getOption === 'function' ? getOption('workpieceThickness') : 19) || 19;
        const depth = Math.abs(toolZ);
        const dt = Math.min(Math.max(depth / maxDepth, 0), 1);
        const r = Math.round(160 * (1 - dt));
        const g = Math.round(200 - 160 * dt);
        const b = Math.round(255 - 95 * dt);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.strokeStyle = `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 20)})`;
    } else {
        // Rapid color: red (#FF1E00) at Z=0 to green (#3CCC34) at safeZ
        // Interpolate in HSL to avoid brown midpoint
        const safeZ = (typeof getOption === 'function' ? getOption('safeHeight') : 5) || 5;
        const rt = Math.min(Math.max(toolZ / safeZ, 0), 1);  // 0 at Z=0, 1 at safeZ
        // #FF1E00 ≈ hsl(7, 100%, 50%), #3CCC34 ≈ hsl(115, 60%, 50%)
        const h = 7 + 108 * rt;       // 7° → 115°
        const s = 100 - 40 * rt;      // 100% → 60%
        const l = 50;                  // constant lightness
        ctx.fillStyle = `hsl(${h}, ${s}%, ${l}%)`;
        ctx.strokeStyle = `hsl(${h}, ${Math.max(0, s - 15)}%, ${Math.max(0, l - 10)}%)`;
    }

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(screenPt.x, screenPt.y, screenRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

/**
 * Draw a rapid movement segment as dashed red line
 */
function drawDashedSegment(points) {
    if (points.length < 2) return;
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';  // Red for rapids
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    // Batch convert all points to screen coordinates for better performance
    const screenPoints = convertPointsToScreen(...points);

    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);

    for (let i = 1; i < screenPoints.length; i++) {
        ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);  // Clear line dash
}

/**
 * Draw a frustum shape (tapered tool geometry) between two circles
 * Used when Z changes and tool radius varies significantly
 *
 * @param {Object} frustumData - Precomputed frustum geometry from calculateFrustumGeometry()
 * @param {string} color - Fill color (e.g., 'rgba(139, 69, 19, 0.3)')
 */
function drawFrustumShape(frustumData, color) {
    if (!frustumData) return;

    const { x1, y1, r1, arc1Start, arc1End, t1p1, t2p1, x2, y2, r2, arc2Start, arc2End, t1p2, t2p2 } = frustumData;

    // Batch convert multiple points to screen coordinates for better performance
    const [c1, c2, tp1p1, tp2p1, tp1p2, tp2p2] = convertPointsToScreen(
        {x: x1, y: y1},
        {x: x2, y: y2},
        t1p1,
        t2p1,
        t1p2,
        t2p2
    );

    // Scale radii by zoom level
    const r1Screen = r1 * zoomLevel;
    const r2Screen = r2 * zoomLevel;

    // Check if this is a cone (one radius near zero) or a frustum
    const r1IsZero = r1Screen < 0.5;  // Near-zero radius becomes a point
    const r2IsZero = r2Screen < 0.5;

    // Set rendering context
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color;

    // Build the shape path
    ctx.beginPath();

    if (r1IsZero && !r2IsZero) {
        // Cone with apex at circle 1: arc on circle 2 (curving outward), then lines to apex and back
        ctx.moveTo(tp2p2.x, tp2p2.y);  // Start at lower tangent
        ctx.arc(c2.x, c2.y, r2Screen, arc2End, arc2Start, false);  // Arc from lower to upper tangent (counterclockwise/outward)
        ctx.lineTo(c1.x, c1.y);  // Line to apex
        ctx.lineTo(tp2p2.x, tp2p2.y);  // Line back to start
    } else if (r2IsZero && !r1IsZero) {
        // Cone with apex at circle 2: arc on circle 1 (curving outward), then lines to apex and back
        ctx.moveTo(tp2p1.x, tp2p1.y);
        ctx.arc(c1.x, c1.y, r1Screen, arc1Start, arc1End, true);  // Arc from lower to upper tangent (counterclockwise)
        ctx.lineTo(c2.x, c2.y);  // Line to apex
        ctx.lineTo(tp2p1.x, tp2p1.y);  // Line back to start
    } else if (r1IsZero && r2IsZero) {
        // Both points (degenerate line) - just skip
        return;
    } else {
        // Normal frustum: arcs on both circles connected by tangent lines
        ctx.moveTo(tp2p1.x, tp2p1.y);
        ctx.arc(c1.x, c1.y, r1Screen, arc2End, arc1End, false);
        ctx.lineTo(tp1p2.x, tp1p2.y);
        ctx.arc(c2.x, c2.y, r2Screen, arc2Start, arc1Start, true);
        ctx.lineTo(tp2p1.x, tp2p1.y);
    }

    // Fill the shape
    ctx.fill();
}

/**
 * Draw a cutting movement segment as brown slots
 * Handles both simple endpoints and interpolated points for smooth radius transitions
 */
function drawCutSegment(points) {
    if (points.length < 1) return;

    // Setup rendering context for strokes
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(139, 69, 19, 0.4)';

    // Process each point: either draw frustum or stroke to previous point
    for (let i = 0; i < points.length; i++) {
        const point = points[i];

        // If this point has precomputed frustum geometry, draw it
        if (point.isFrustum && point.frustumData) {
            drawFrustumShape(point.frustumData, 'rgba(139, 69, 19, 0.3)');
        }
        // Otherwise, draw a stroke from previous point to this point
        else if (i > 0) {
            const fromPoint = points[i - 1];
            const fromPt = worldToScreen(fromPoint.x, fromPoint.y);
            const toPt = worldToScreen(point.x, point.y);

            // Use minimum radius of the two points to avoid overdrawing when radius changes
            const minRadius = Math.min(fromPoint.radius || 0, point.radius || 0);
            ctx.lineWidth = Math.max(1, minRadius * 2 * zoomLevel);

            ctx.beginPath();
            ctx.moveTo(fromPt.x, fromPt.y);
            ctx.lineTo(toPt.x, toPt.y);
            ctx.stroke();
        }
    }
}

/**
 * Main simulation animation loop (REFACTORED)
 * Simplified: increments line number based on elapsed time
 * Animation rendering: interpolates within current segment for smooth visualization
 */
function runSimulation2D() {
    if (!simulation2D.isRunning || simulation2D.isPaused) {
        // Still schedule next frame even if paused (for resume)
        if (simulation2D.isRunning && simulation2D.isPaused) {
            simulation2D.animationFrameId = requestAnimationFrame(runSimulation2D);
        }
        return;
    }

    // Check if we've reached the end
    if (simulation2D.currentLineIndex >= simulation2D.precomputedPoints.length) {
        finishSimulation2D();
        return;
    }

    // Get current segment's precomputed point
    const currentPoint = simulation2D.precomputedPoints[simulation2D.currentLineIndex];
    if (!currentPoint) {
        finishSimulation2D();
        return;
    }

    // Calculate elapsed time since last frame for accurate animation
    const now = Date.now();
    const lastTime = simulation2D.lastFrameTime || now;
    const elapsedMs = now - lastTime;
    simulation2D.lastFrameTime = now;

    // Get segment duration in milliseconds and apply speed multiplier
    const segmentDurationMs = (currentPoint.moveTime * 1000) / simulation2D.speed;

    // Update progress within segment
    if (segmentDurationMs > 0) {
        simulation2D.currentLineProgress += elapsedMs / segmentDurationMs;
    } else {
        // Zero-duration segment (noop), skip immediately
        simulation2D.currentLineProgress = 1.0;
    }

    // If segment complete, advance to next line
    if (simulation2D.currentLineProgress >= 1.0) {
        // Accumulate the moveTime from the completed segment (real time, not affected by playback speed)
        const completedPoint = simulation2D.precomputedPoints[simulation2D.currentLineIndex];
        if (completedPoint && completedPoint.moveTime > 0) {
            simulation2D.totalElapsedTime += completedPoint.moveTime;
        }

        simulation2D.currentLineIndex++;
        simulation2D.currentLineProgress = 0;
        simulation2D.lastFrameTime = Date.now();

        // Check if we've finished all lines
        if (simulation2D.currentLineIndex >= simulation2D.precomputedPoints.length) {
            simulation2D.currentLineIndex--;
            simulation2D.currentLineProgress = 1.0;
            finishSimulation2D();
           
            return;
        }
    }

    // Update UI displays (line number, elapsed time, feed rate)
    updateSimulation2DDisplay();

    // Update G-code viewer highlight (0-based indexing)
    if (typeof gcodeView !== 'undefined' && gcodeView) {
        var displayLine = simulation2D.lineMap
            ? simulation2D.lineMap[simulation2D.currentLineIndex]
            : simulation2D.currentLineIndex;
        gcodeView.setCurrentLine(displayLine);
    }

    // Trigger canvas redraw (draws with interpolation)
    redrawImmediate();

    // Schedule next frame
    simulation2D.animationFrameId = requestAnimationFrame(runSimulation2D);
}

/**
 * Start the simulation
 */
function startSimulation2D() {
    // Check if we're resuming from pause
    if (simulation2D.isRunning && simulation2D.isPaused) {
        // Resume from pause
        simulation2D.isPaused = false;
        simulation2D.lastFrameTime = null;  // Reset timing

        // Re-enable pause button when resuming
        const pauseBtn = document.getElementById('pause-simulation');
        if (pauseBtn) {
            pauseBtn.disabled = false;
        }

        // Schedule animation frame if not already scheduled
        if (!simulation2D.animationFrameId) {
            simulation2D.animationFrameId = requestAnimationFrame(runSimulation2D);
        }

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }

        return;
    }

    if (simulation2D.isRunning) {
        return; // Already running
    }

    // Start a fresh simulation
    // Always setup fresh (ensures we have latest G-code)
    if (!setupSimulation2D()) {
        alert('Cannot start simulation: ' + (
            (!svgpaths || svgpaths.length === 0) ? 'No paths to simulate' :
                (!toolpaths || toolpaths.length === 0) ? 'No toolpaths generated. Run a CNC operation first.' :
                    'Failed to generate G-code'
        ));
        return;
    }

    // Show gcode viewer when starting 2D simulation
    if (typeof gcodeView !== 'undefined' && gcodeView) {
        const gcode = simulation2D.gcode;
        gcodeView.populate(gcode);
        if (typeof showGcodeViewerPanel === 'function') {
            showGcodeViewerPanel();
        }
    }

    simulation2D.currentLineIndex = 0;
    simulation2D.currentLineProgress = 0;
    simulation2D.lastFrameTime = null;  // Will be set on first frame
    simulation2D.totalElapsedTime = 0;  // Reset elapsed time for fresh simulation

    // Read speed from slider and apply it before starting
    const speedSlider = document.getElementById('simulation-speed');
    if (speedSlider) {
        const sliderSpeed = parseFloat(speedSlider.value);
        updateSimulation2DSpeed(sliderSpeed);
    }

    simulation2D.isRunning = true;
    simulation2D.isPaused = false;

    // Update button states: disable start, enable pause and stop
    const startBtn = document.getElementById('start-simulation');
    const pauseBtn = document.getElementById('pause-simulation');
    const stopBtn = document.getElementById('stop-simulation');
    const progressSlider = document.getElementById('simulation-step');

    if (startBtn) startBtn.disabled = true;
    if (pauseBtn) {
        pauseBtn.disabled = false;
        pauseBtn.innerHTML = `<i data-lucide="pause"></i>`;
    }
    if (stopBtn) stopBtn.disabled = false;
    // Keep slider enabled so user can seek at any time

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    runSimulation2D();
}

/**
 * Pause the simulation
 */
function pauseSimulation2D() {
    if (!simulation2D.isRunning || simulation2D.isPaused) {
        return;  // Can't pause if not running or already paused
    }

    simulation2D.isPaused = true;

    // Update button states when paused
    const startBtn = document.getElementById('start-simulation');
    const pauseBtn = document.getElementById('pause-simulation');

    if (startBtn) {
        startBtn.disabled = false;  // Enable play button so user can resume
    }
    if (pauseBtn) {
        pauseBtn.disabled = true;   // Disable pause button when paused
    }

    // Slider is always enabled - user can seek at any time
}

/**
 * Finish the simulation (reached end of G-code)
 * Pauses the simulation but keeps material points visible
 * User can click play to restart or stop to clear
 */
function finishSimulation2D() {
    simulation2D.isRunning = false;
    simulation2D.isPaused = true;

    // Keep G-code viewer visible so user can review the completed simulation
    // Do NOT hide it - only hide when user explicitly clicks stop

    // Update button states: enable start, disable pause
    const startBtn = document.getElementById('start-simulation');
    const pauseBtn = document.getElementById('pause-simulation');
    const stopBtn = document.getElementById('stop-simulation');

    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) {
        pauseBtn.disabled = true;  // Disable pause button at end of simulation
        pauseBtn.innerHTML = `<i data-lucide="pause"></i>`;
    }
    if (stopBtn) stopBtn.disabled = false;
    // Slider always stays enabled

    // Reload lucide icons after changing them
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    // Keep material removal points visible - do NOT clear them
    // Keep current state - user can restart by clicking play
    updateSimulation2DDisplay();
    redrawImmediate();
}

/**
 * Stop the simulation
 */
function stopSimulation2D() {
    simulation2D.isRunning = false;
    simulation2D.isPaused = false;

    // Cancel any pending animation frames
    if (simulation2D.animationFrameId) {
        cancelAnimationFrame(simulation2D.animationFrameId);
        simulation2D.animationFrameId = null;
    }

    // Hide gcode viewer when stopping 2D simulation
    if (typeof hideGcodeViewerPanel === 'function') {
        hideGcodeViewerPanel();
    }

    // Update button states: enable start, disable pause and stop
    const startBtn = document.getElementById('start-simulation');
    const pauseBtn = document.getElementById('pause-simulation');
    const stopBtn = document.getElementById('stop-simulation');

    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) {
        pauseBtn.disabled = true;
        pauseBtn.innerHTML = `<i data-lucide="pause"></i>`;
    }
    if (stopBtn) stopBtn.disabled = true;
    // Slider always stays enabled

    // Reload lucide icons after changing them
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    // Reset state
    simulation2D.currentLineIndex = 0;
    simulation2D.totalElapsedTime = 0;

    // Clear parsed data to free memory (will be re-parsed if simulation is restarted)
    simulation2D.movements = [];
    simulation2D.tools = [];
    simulation2D.precomputedPoints = [];
    simulation2D.gcode = '';
    simulation2D.gcodeLines = [];

    // Reset status line displays to zero
    const stepDisplay = document.getElementById('2d-step-display');
    if (stepDisplay) stepDisplay.textContent = '0 / 0';
    const feedDisplay = document.getElementById('2d-feed-rate-display');
    if (feedDisplay) feedDisplay.textContent = '0';
    const timeElapsed = document.getElementById('2d-simulation-time');
    if (timeElapsed) timeElapsed.textContent = '0:00';
    const timeTotal = document.getElementById('2d-total-time');
    if (timeTotal) timeTotal.textContent = '0:00';
    const zDepth = document.getElementById('2d-z-depth-display');
    if (zDepth) zDepth.textContent = '0.00';
    const progressSlider = document.getElementById('simulation-step');
    if (progressSlider) { progressSlider.value = 0; progressSlider.max = 100; }

    redrawImmediate();
}

/**
 * Set simulation to a specific line number (seeking)
 * NEW: O(1) operation - just sets the current line, doesn't rebuild points
 * Material removal is drawn from precomputed points based on currentLineIndex
 *
 * @param {number} targetLineIndex - 1-indexed line number (from gcode viewer)
 */
function setSimulation2DLineNumber(targetLineNum) {
    // Input: targetLineNum is 0-indexed G-code line number (from G-code viewer with 0-based indexing)
    // Because G2/G3 arcs are expanded into multiple movements, movements[] is longer than gcodeLines[].
    // Use lineMap to find the last movement index that corresponds to this G-code line.

    // Ensure setup is done
    if (simulation2D.precomputedPoints.length === 0) {
        if (!setupSimulation2D()) {
            console.error('Failed to setup simulation for seeking');
            return;
        }
    }

    // Find the last movement index whose lineMap entry is <= targetLineNum.
    // lineMap[i] = original G-code line number for movement i.
    // For expanded arcs, multiple consecutive movements share the same G-code line number,
    // so we want the LAST movement for that line (to show the complete arc).
    let pointIndex = 0;
    if (simulation2D.lineMap && simulation2D.lineMap.length > 0) {
        for (let i = 0; i < simulation2D.lineMap.length; i++) {
            if (simulation2D.lineMap[i] <= targetLineNum) {
                pointIndex = i;
            } else {
                break;
            }
        }
    } else {
        // No lineMap — fall back to direct index (no arc expansion)
        pointIndex = Math.min(targetLineNum, simulation2D.precomputedPoints.length - 1);
    }

    // Stop any running/pending operations and pause the simulation
    simulation2D.isRunning = false;    // Stop the main loop
    simulation2D.isPaused = true;      // Put into paused state so user can resume

    // Cancel any pending animation frame
    if (simulation2D.animationFrameId) {
        cancelAnimationFrame(simulation2D.animationFrameId);
        simulation2D.animationFrameId = null;
    }

    // Set current point index — mark segment as complete so it draws fully
    simulation2D.currentLineIndex = pointIndex;
    simulation2D.currentLineProgress = 1.0;  // Show segment fully drawn when seeking

    // Update display
    updateSimulation2DDisplay();

    // Update G-code viewer highlight (map movement index to original G-code line)
    if (typeof gcodeView !== 'undefined' && gcodeView) {
        var displayLine = simulation2D.lineMap
            ? simulation2D.lineMap[pointIndex]
            : pointIndex;
        gcodeView.setCurrentLine(displayLine);
    }

    // Trigger redraw (will draw up to currentLineIndex)


    // Always leave in paused state after seeking
    // User will click resume (the play button) to continue
    simulation2D.isRunning = true;
    simulation2D.isPaused = true;

    // Update button states - same as pauseSimulation2D()
    const startBtn = document.getElementById('start-simulation');
    const pauseBtn = document.getElementById('pause-simulation');

    if (startBtn) {
        startBtn.disabled = false;  // Enable play button so user can resume
    }
    if (pauseBtn) {
        pauseBtn.disabled = true;   // Disable pause button when paused
        pauseBtn.innerHTML = `<i data-lucide="pause"></i>`;  // Keep pause icon
    }

    // Reload lucide icons after changing them
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    redrawImmediate();

}

/**
 * Update the control display with current simulation state
 */
function updateSimulation2DDisplay() {
    // Update line number display — show G-code line numbers, not movement indices
    const lineDisplay = document.getElementById('2d-step-display');
    if (lineDisplay && simulation2D.movements && simulation2D.movements.length > 0) {
        // Map movement index back to G-code line number for display
        const currentLineNum = simulation2D.lineMap
            ? (simulation2D.lineMap[simulation2D.currentLineIndex] || 0) + 1
            : simulation2D.currentLineIndex + 1;

        // Total G-code lines (not movements — those include expanded arcs)
        const totalLineNum = simulation2D.gcodeLines ? simulation2D.gcodeLines.length : simulation2D.movements.length;

        lineDisplay.textContent = `${currentLineNum} / ${totalLineNum}`;
    }

    // Update feed rate (from current precomputed point)
    if (simulation2D.currentLineIndex < simulation2D.precomputedPoints.length) {
        const point = simulation2D.precomputedPoints[simulation2D.currentLineIndex];
        const feedDisplay = document.getElementById('2d-feed-rate-display');
        if (feedDisplay && point && point.feedRate) {
            feedDisplay.textContent = `${point.feedRate.toFixed(0)}`;
        }
    }

    // Update time displays
    const timeElapsedDisplay = document.getElementById('2d-simulation-time');
    const timeTotalDisplay = document.getElementById('2d-total-time');

    if (timeElapsedDisplay) {
        timeElapsedDisplay.textContent = formatTimeMMSS(simulation2D.totalElapsedTime);
    }

    if (timeTotalDisplay) {
        // Use pre-calculated total simulation time
        timeTotalDisplay.textContent = formatTimeMMSS(simulation2D.totalSimulationTime);
    }

    // Update progress slider if present — map movement index to G-code line number
    const progressSlider = document.getElementById('simulation-step');
    if (progressSlider && simulation2D.movements && simulation2D.movements.length > 0) {
        const gcodeLineCount = simulation2D.gcodeLines ? simulation2D.gcodeLines.length : simulation2D.movements.length;
        const currentGcodeLine = simulation2D.lineMap
            ? (simulation2D.lineMap[simulation2D.currentLineIndex] || 0)
            : simulation2D.currentLineIndex;
        progressSlider.value = currentGcodeLine;
        progressSlider.max = gcodeLineCount - 1;
    }

    // Update Z depth display (interpolated within current segment)
    const zDepthDisplay = document.getElementById('2d-z-depth-display');
    if (zDepthDisplay && simulation2D.currentLineIndex < simulation2D.precomputedPoints.length) {
        const point = simulation2D.precomputedPoints[simulation2D.currentLineIndex];
        if (point) {
            const pos = interpolateSegmentPosition(point, simulation2D.currentLineProgress);
            zDepthDisplay.textContent = pos.z.toFixed(2);
        }
    }
}

/**
 * Format time in M:SS format
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
function formatTimeMMSS(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Update simulation speed multiplier
 * @param {number} speed - Speed multiplier (1.0 = normal, 2.0 = 2x, etc)
 */
function updateSimulation2DSpeed(speed) {
    simulation2D.speed = Math.max(0.5, Math.min(10, speed)); // Clamp between 0.5x and 10x
}
