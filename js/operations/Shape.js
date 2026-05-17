var AVAILABLE_SHAPES = [
    { value: 'Square', label: 'Square', icon: 'square', tooltip: 'Create squares and rectangles from a center point' },
    { value: 'Circle', label: 'Circle', icon: 'circle', tooltip: 'Create circles and ellipses from a center point' },
    { value: 'Triangle', label: 'Triangle', icon: 'triangle', tooltip: 'Create isosceles triangles from a center point' },
    { value: 'Star', label: 'Star', icon: 'star', tooltip: 'Create star shapes from a center point' },
    { value: 'HalfCircle', label: 'Half circle', icon: 'circle', tooltip: 'Create half circles from a center point' },
    { value: 'RightTriangle', label: 'Right triangle', icon: 'triangle', tooltip: 'Create right triangles from a center point' },
    { value: 'DrillShape', label: 'Drill', icon: 'circle-plus', tooltip: 'Create a drill point from a center point' }
];

const SHAPE_TOOL_NAMES = AVAILABLE_SHAPES.map(shape => shape.value);
const DEFAULT_SHAPE_WIDTH = 40;
const DEFAULT_SHAPE_HEIGHT = 40;
const DEFAULT_SHAPE_ANGLE = 0;
const DEFAULT_SHAPE_LOCK_RATIO = false;
const DEFAULT_SHAPE_NAME = '';
const DEFAULT_SHAPE_LOCK_OBJECT = false;
const DEFAULT_DRILL_SHAPE_DIAMETER = 6;
const MIN_SHAPE_SIZE = 1;
const SHAPE_EDIT_HANDLE_SIZE = 8;
const SHAPE_EDIT_HANDLE_HIT_RADIUS = 28;
const SHAPE_EDIT_ROTATE_OFFSET_PX = 36;
const SHAPE_EDIT_ROTATION_SNAP_DEG = 5;

function clampShapeSize(value, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(MIN_SHAPE_SIZE, numericValue);
}

function normalizeAngle(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : DEFAULT_SHAPE_ANGLE;
}

function normalizeLockRatio(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeLockObject(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

function getAspectRatio(width, height) {
    const numericWidth = Number(width);
    const numericHeight = Number(height);
    if (!Number.isFinite(numericWidth) || !Number.isFinite(numericHeight) || numericWidth <= 0 || numericHeight <= 0) {
        return 1;
    }
    return numericWidth / numericHeight;
}

function getLockedDimensionsFromAxis(changedKey, primaryValue, ratio) {
    const safeRatio = Number.isFinite(Number(ratio)) && Number(ratio) > 0 ? Number(ratio) : 1;

    if (changedKey === 'width') {
        let width = clampShapeSize(primaryValue, DEFAULT_SHAPE_WIDTH);
        let height = width / safeRatio;
        if (height < MIN_SHAPE_SIZE) {
            height = MIN_SHAPE_SIZE;
            width = height * safeRatio;
        }
        return { width, height };
    }

    let height = clampShapeSize(primaryValue, DEFAULT_SHAPE_HEIGHT);
    let width = height * safeRatio;
    if (width < MIN_SHAPE_SIZE) {
        width = MIN_SHAPE_SIZE;
        height = width / safeRatio;
    }
    return { width, height };
}

function getLockedDimensionsFromBounds(widthValue, heightValue, ratio) {
    const width = clampShapeSize(widthValue, DEFAULT_SHAPE_WIDTH);
    const height = clampShapeSize(heightValue, DEFAULT_SHAPE_HEIGHT);
    const safeRatio = Number.isFinite(Number(ratio)) && Number(ratio) > 0 ? Number(ratio) : 1;

    if ((width / height) >= safeRatio) {
        return getLockedDimensionsFromAxis('width', width, safeRatio);
    }

    return getLockedDimensionsFromAxis('height', height, safeRatio);
}

function rotatePointAround(point, centerX, centerY, angleRad) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = point.x - centerX;
    const dy = point.y - centerY;

    return {
        x: centerX + dx * cos - dy * sin,
        y: centerY + dx * sin + dy * cos
    };
}

function rotatePath(points, centerX, centerY, angleDeg) {
    if (!angleDeg) return points;
    const angleRad = angleDeg * Math.PI / 180;
    return points.map(point => rotatePointAround(point, centerX, centerY, angleRad));
}

function isDrillShape(shape) {
    return shape === 'DrillShape';
}

function closePath(points) {
    if (!points.length) return [];
    const closed = points.map(point => ({ x: point.x, y: point.y }));
    closed.push({ ...closed[0] });
    return closed;
}

function getCurveSegments(width, height) {
    const maxSize = Math.max(width, height);
    return Math.max(24, Math.min(96, Math.ceil(maxSize)));
}

function createEllipsePoints(centerX, centerY, radiusX, radiusY) {
    const segments = getCurveSegments(radiusX * 2, radiusY * 2);
    const points = [];

    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push({
            x: centerX + Math.cos(angle) * radiusX,
            y: centerY + Math.sin(angle) * radiusY
        });
    }

    return points;
}

function createHalfEllipsePoints(centerX, centerY, radiusX, radiusY) {
    const segments = Math.max(16, Math.floor(getCurveSegments(radiusX * 2, radiusY * 2) / 2));
    const points = [];

    for (let i = 0; i <= segments; i++) {
        const angle = Math.PI - (i / segments) * Math.PI;
        points.push({
            x: centerX + Math.cos(angle) * radiusX,
            y: centerY - Math.sin(angle) * radiusY
        });
    }

    return points;
}

function createStarPoints(centerX, centerY, width, height) {
    const points = [];
    const outerRadiusX = width / 2;
    const outerRadiusY = height / 2;
    const innerRadiusX = outerRadiusX * 0.45;
    const innerRadiusY = outerRadiusY * 0.45;

    for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const radiusX = i % 2 === 0 ? outerRadiusX : innerRadiusX;
        const radiusY = i % 2 === 0 ? outerRadiusY : innerRadiusY;
        points.push({
            x: centerX + Math.cos(angle) * radiusX,
            y: centerY + Math.sin(angle) * radiusY
        });
    }

    return points;
}

function getPathMetrics(path) {
    const segments = [];
    let perimeter = 0;

    if (!Array.isArray(path) || path.length < 2) {
        return { segments, perimeter };
    }

    for (let i = 0; i < path.length; i++) {
        const p1 = path[i];
        const p2 = path[(i + 1) % path.length];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.hypot(dx, dy);
        if (length <= 0) continue;

        segments.push({
            index: i,
            p1,
            p2,
            dx,
            dy,
            length,
            startDistance: perimeter
        });
        perimeter += length;
    }

    return { segments, perimeter };
}

function projectPointOnPath(point, path) {
    const metrics = getPathMetrics(path);
    if (!point || metrics.segments.length === 0 || metrics.perimeter <= 0) {
        return null;
    }

    let closest = null;
    let closestDistanceSq = Infinity;

    metrics.segments.forEach(segment => {
        const closestPoint = closestPointOnSegment(point, segment.p1, segment.p2);
        const dx = point.x - closestPoint.x;
        const dy = point.y - closestPoint.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq >= closestDistanceSq) return;

        const segmentDistance = ((closestPoint.x - segment.p1.x) * segment.dx + (closestPoint.y - segment.p1.y) * segment.dy) / segment.length;
        const positionFraction = Math.max(0, Math.min(1, segmentDistance / segment.length));
        const pathDistance = segment.startDistance + segment.length * positionFraction;

        closestDistanceSq = distanceSq;
        closest = {
            edgeIndex: segment.index,
            positionFraction,
            pathDistance,
            pathFraction: pathDistance / metrics.perimeter
        };
    });

    return closest;
}

function getPathPlacementAtFraction(path, pathFraction) {
    const metrics = getPathMetrics(path);
    if (metrics.segments.length === 0 || metrics.perimeter <= 0) {
        return null;
    }

    const clampedFraction = Math.max(0, Math.min(1, Number(pathFraction) || 0));
    let targetDistance = metrics.perimeter * clampedFraction;

    if (targetDistance >= metrics.perimeter) {
        targetDistance = metrics.perimeter - Number.EPSILON;
    }

    for (const segment of metrics.segments) {
        if (targetDistance > segment.startDistance + segment.length) continue;

        const localDistance = targetDistance - segment.startDistance;
        const positionFraction = segment.length > 0 ? Math.max(0, Math.min(1, localDistance / segment.length)) : 0;
        return {
            edgeIndex: segment.index,
            positionFraction,
            pathDistance: segment.startDistance + segment.length * positionFraction
        };
    }

    const lastSegment = metrics.segments[metrics.segments.length - 1];
    return {
        edgeIndex: lastSegment.index,
        positionFraction: 1,
        pathDistance: metrics.perimeter
    };
}

function getTabConvexityForEdge(path, edgeIndex) {
    if (!Array.isArray(path) || path.length < 3 || edgeIndex == null) return true;
    if (edgeIndex <= 0 || edgeIndex >= path.length - 1) return true;

    const point1 = path[edgeIndex - 1];
    const point2 = path[edgeIndex];
    const point3 = path[(edgeIndex + 1) % path.length];
    const v1x = point2.x - point1.x;
    const v1y = point2.y - point1.y;
    const v2x = point3.x - point2.x;
    const v2y = point3.y - point2.y;
    const crossProduct = v1x * v2y - v1y * v2x;
    return isClockwise(path) ? crossProduct < 0 : crossProduct > 0;
}

function buildTabFromPlacement(path, placement, baseTab) {
    if (!placement) return null;

    const p1 = path[placement.edgeIndex];
    const p2 = path[(placement.edgeIndex + 1) % path.length];
    if (!p1 || !p2) return null;

    const x = p1.x + (p2.x - p1.x) * placement.positionFraction;
    const y = p1.y + (p2.y - p1.y) * placement.positionFraction;

    return {
        ...baseTab,
        x,
        y,
        angle: Math.atan2(p2.y - p1.y, p2.x - p1.x),
        pathDistance: placement.pathDistance,
        isConvex: getTabConvexityForEdge(path, placement.edgeIndex),
        edgeIndex: placement.edgeIndex,
        edgeP1: { x: p1.x, y: p1.y },
        edgeP2: { x: p2.x, y: p2.y },
        positionFraction: placement.positionFraction
    };
}

function captureShapeTabLayout(svgPath) {
    const tabs = svgPath?.creationProperties?.tabs;
    if (!tabs || !tabs.length || !Array.isArray(svgPath?.path)) return null;

    const currentMetrics = getPathMetrics(svgPath.path);
    return {
        edgeCount: currentMetrics.segments.length,
        tabs: tabs.map(tab => {
            const projected = projectPointOnPath(tab, svgPath.path);
            if (!projected) return null;

            return {
                tab: { ...tab },
                edgeIndex: projected.edgeIndex,
                positionFraction: projected.positionFraction,
                pathFraction: projected.pathFraction
            };
        }).filter(Boolean)
    };
}

function rebuildShapeTabs(svgPath, tabLayout) {
    if (!tabLayout || !svgPath?.creationProperties || !Array.isArray(svgPath.path)) return;

    const nextMetrics = getPathMetrics(svgPath.path);
    if (nextMetrics.segments.length === 0 || nextMetrics.perimeter <= 0) {
        svgPath.creationProperties.tabs = [];
        return;
    }

    svgPath.creationProperties.tabs = tabLayout.tabs.map(tabAnchor => {
        let placement = null;

        if (tabLayout.edgeCount === nextMetrics.segments.length && tabAnchor.edgeIndex != null) {
            placement = {
                edgeIndex: tabAnchor.edgeIndex,
                positionFraction: Math.max(0, Math.min(1, tabAnchor.positionFraction ?? 0.5)),
                pathDistance: 0
            };

            const segment = nextMetrics.segments.find(candidate => candidate.index === placement.edgeIndex);
            if (segment) {
                placement.pathDistance = segment.startDistance + segment.length * placement.positionFraction;
            } else {
                placement = null;
            }
        }

        if (!placement) {
            placement = getPathPlacementAtFraction(svgPath.path, tabAnchor.pathFraction);
        }

        return buildTabFromPlacement(svgPath.path, placement, tabAnchor.tab);
    }).filter(Boolean);
}

class Shape extends Operation {
    constructor(fixedShape = null, icon = 'pentagon', tooltip = 'Create basic shapes (square, circle, triangle, star, etc.)') {
        const displayName = AVAILABLE_SHAPES.find(shape => shape.value === fixedShape)?.label || 'Shape';
        super(fixedShape || 'Shape', icon, tooltip, displayName);

        this.fixedShape = fixedShape;

        this.geometryFields = [
            {
                key: 'x',
                label: 'X',
                type: 'dimension',
                default: 0,
                persist: false
            },
            {
                key: 'y',
                label: 'Y',
                type: 'dimension',
                default: 0,
                persist: false
            },
            {
                key: 'width',
                label: 'Width',
                type: 'dimension',
                default: DEFAULT_SHAPE_WIDTH,
                persist: false
            },
            {
                key: 'height',
                label: 'Height',
                type: 'dimension',
                default: DEFAULT_SHAPE_HEIGHT,
                persist: false
            },
            {
                key: 'angle',
                label: 'Angle',
                type: 'number',
                default: DEFAULT_SHAPE_ANGLE,
                step: 1,
                persist: false
            }
        ];

        this.shapeField = {
            key: 'shape',
            label: 'Shape',
            type: 'choice',
            default: 'Square',
            options: AVAILABLE_SHAPES.map(s => ({ value: s.value, label: s.label }))
        };

        this.nameField = {
            key: 'name',
            label: 'Name',
            type: 'text',
            default: DEFAULT_SHAPE_NAME,
            persist: false
        };

        this.lockObjectField = {
            key: 'lockObject',
            label: 'Lock object',
            type: 'checkbox',
            default: DEFAULT_SHAPE_LOCK_OBJECT,
            persist: false
        };

        // Last-used values (persisted across tool activations within the session)
        this.properties = {};
        // Currently-editing path (null when creating new)
        this.currentPath = null;
        this.activeHandle = null;
        this.hoverHandle = null;
        this.initialHandleProperties = null;
        this.dragStartMouse = null;
        this.isDraggingShape = false;
        this.shapeChangedDuringDrag = false;
        this.mouseDown = false;
        this.pendingDimensionKey = null;
    }

    get fields() {
        if (isDrillShape(this.fixedShape)) {
            return {
                x: this.geometryFields.find(field => field.key === 'x'),
                y: this.geometryFields.find(field => field.key === 'y'),
                lockObject: this.lockObjectField,
                name: this.nameField
            };
        }

        if (this.fixedShape) {
            return {
                ...Object.fromEntries(this.geometryFields.map(field => [field.key, field])),
                lockObject: this.lockObjectField,
                name: this.nameField
            };
        }

        return {
            shape: this.shapeField,
            ...Object.fromEntries(this.geometryFields.map(field => [field.key, field])),
            lockObject: this.lockObjectField,
            name: this.nameField
        };
    }

    getShapeFields(shape) {
        if (isDrillShape(shape)) {
            return this.geometryFields.filter(field => field.key === 'x' || field.key === 'y');
        }
        return this.geometryFields;
    }

    getDefaultPathName(shape, svgPathId) {
        if (isDrillShape(shape)) {
            return 'Drill ' + svgPathId;
        }
        const shapeLabel = AVAILABLE_SHAPES.find(item => item.value === shape)?.label || shape;
        return shapeLabel + ' ' + svgPathId;
    }

    // ── Shape construction ─────────────────────────────────────────────────

    toInternal(value) {
        return value * viewScale;
    }

    toExternal(value) {
        return value / viewScale;
    }

    getOriginExternal() {
        return {
            x: typeof origin !== 'undefined' && Number.isFinite(origin.x) ? origin.x / viewScale : 0,
            y: typeof origin !== 'undefined' && Number.isFinite(origin.y) ? origin.y / viewScale : 0
        };
    }

    toDisplayPosition(x, y) {
        if (typeof toMM === 'function') {
            const coords = toMM(this.toInternal(x), this.toInternal(y));
            return { x: coords.x, y: coords.y };
        }

        const originExternal = this.getOriginExternal();
        return {
            x: x - originExternal.x,
            y: originExternal.y - y
        };
    }

    toStoredPosition(x, y) {
        const originExternal = this.getOriginExternal();
        return {
            x: x + originExternal.x,
            y: originExternal.y - y
        };
    }

    buildStoredProperties(values) {
        return {
            name: values.name,
            x: values.x,
            y: values.y,
            width: values.width,
            height: values.height,
            angle: values.angle,
            shape: values.shape,
            lockRatio: values.lockRatio,
            lockObject: values.lockObject
        };
    }

    getPathShapeProperties(path) {
        const stored = { ...(path?.creationProperties?.properties || {}) };
        const bbox = path?.bbox || (path?.path ? boundingBox(path.path) : null);
        const center = path?.creationProperties?.center || (bbox
            ? {
                x: (bbox.minx + bbox.maxx) / 2,
                y: (bbox.miny + bbox.maxy) / 2
            }
            : { x: 0, y: 0 });

        return {
            shape: path?.creationProperties?.shape || stored.shape || this.fixedShape || 'Square',
            name: stored.name !== undefined ? stored.name : (path?.name || DEFAULT_SHAPE_NAME),
            x: stored.x !== undefined ? stored.x : this.toExternal(center.x),
            y: stored.y !== undefined ? stored.y : this.toExternal(center.y),
            width: stored.width !== undefined ? stored.width : (bbox ? this.toExternal(bbox.maxx - bbox.minx) : DEFAULT_SHAPE_WIDTH),
            height: stored.height !== undefined ? stored.height : (bbox ? this.toExternal(bbox.maxy - bbox.miny) : DEFAULT_SHAPE_HEIGHT),
            angle: stored.angle !== undefined ? stored.angle : DEFAULT_SHAPE_ANGLE,
            lockRatio: stored.lockRatio !== undefined ? normalizeLockRatio(stored.lockRatio) : DEFAULT_SHAPE_LOCK_RATIO,
            lockObject: stored.lockObject !== undefined ? normalizeLockObject(stored.lockObject) : DEFAULT_SHAPE_LOCK_OBJECT
        };
    }

    normalizeShapeValues(shape, values, fallbackCenter = null) {
        const fallbackX = fallbackCenter ? this.toExternal(fallbackCenter.x) : 0;
        const fallbackY = fallbackCenter ? this.toExternal(fallbackCenter.y) : 0;

        const isDrill = isDrillShape(shape);
        const width = isDrill ? DEFAULT_DRILL_SHAPE_DIAMETER : clampShapeSize(values.width, DEFAULT_SHAPE_WIDTH);
        const height = isDrill ? DEFAULT_DRILL_SHAPE_DIAMETER : clampShapeSize(values.height, DEFAULT_SHAPE_HEIGHT);
        const angle = isDrill ? 0 : normalizeAngle(values.angle);
        const lockRatio = isDrill ? true : normalizeLockRatio(values.lockRatio);

        return {
            shape,
            name: typeof values.name === 'string' ? values.name.trim() : DEFAULT_SHAPE_NAME,
            x: Number.isFinite(Number(values.x)) ? Number(values.x) : fallbackX,
            y: Number.isFinite(Number(values.y)) ? Number(values.y) : fallbackY,
            width,
            height,
            angle,
            lockRatio,
            lockObject: normalizeLockObject(values.lockObject)
        };
    }

    isObjectLocked(path = this.currentPath) {
        if (!path) return false;
        return normalizeLockObject(this.getPathShapeProperties(path).lockObject);
    }

    resetCreationProperties(shape = null) {
        const nextShape = shape || this.fixedShape || this.properties.shape || this.shapeField.default;
        this.properties = {
            shape: nextShape,
            name: DEFAULT_SHAPE_NAME,
            x: 0,
            y: 0,
            width: DEFAULT_SHAPE_WIDTH,
            height: DEFAULT_SHAPE_HEIGHT,
            angle: DEFAULT_SHAPE_ANGLE,
            lockRatio: DEFAULT_SHAPE_LOCK_RATIO,
            lockObject: DEFAULT_SHAPE_LOCK_OBJECT
        };
    }

    getReferenceAspectRatio(primary, fallback = null) {
        const primaryRatio = getAspectRatio(primary?.width, primary?.height);
        if (primaryRatio > 0) return primaryRatio;

        const fallbackRatio = getAspectRatio(fallback?.width, fallback?.height);
        if (fallbackRatio > 0) return fallbackRatio;

        return getAspectRatio(DEFAULT_SHAPE_WIDTH, DEFAULT_SHAPE_HEIGHT);
    }

    getRatioLockButtonHTML(lockRatio) {
        const locked = normalizeLockRatio(lockRatio);
        const title = locked ? 'Unlock aspect ratio' : 'Lock aspect ratio';
        const icon = locked ? 'lock' : 'unlock';

        return `
            <div class="shape-ratio-lock-wrap d-flex align-items-center justify-content-center">
                <button type="button"
                        id="pm-lock-ratio-toggle"
                        class="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center${locked ? ' active' : ''}"
                        data-locked="${locked ? 'true' : 'false'}"
                        aria-label="${title}"
                        aria-pressed="${locked ? 'true' : 'false'}"
                        title="${title}"
                        style="width: 24px; min-width: 24px; height: 24px;">
                    <i data-lucide="${icon}" style="width: 12px; height: 12px;"></i>
                </button>
            </div>
        `;
    }

    updateRatioLockButton(locked) {
        const button = document.getElementById('pm-lock-ratio-toggle');
        if (!button) return;

        const normalizedLocked = normalizeLockRatio(locked);
        const title = normalizedLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio';
        const icon = normalizedLocked ? 'lock' : 'unlock';

        button.dataset.locked = normalizedLocked ? 'true' : 'false';
        button.setAttribute('aria-label', title);
        button.setAttribute('aria-pressed', normalizedLocked ? 'true' : 'false');
        button.setAttribute('title', title);
        button.classList.toggle('active', normalizedLocked);
        button.innerHTML = `<i data-lucide="${icon}" style="width: 12px; height: 12px;"></i>`;

        if (typeof window.lucide !== 'undefined' && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    setRatioLock(locked) {
        const normalizedLocked = normalizeLockRatio(locked);
        const shape = this.getCurrentShape();
        const fields = this.getShapeFields(shape);
        const fieldValues = PropertiesManager.collectValues(fields);
        this.updateRatioLockButton(normalizedLocked);

        if (this.currentPath) {
            this.onPropertiesChanged({ ...fieldValues, shape, lockRatio: normalizedLocked });
            return;
        }

        this.properties = {
            ...this.properties,
            ...fieldValues,
            shape,
            lockRatio: normalizedLocked
        };
    }

    setObjectLock(locked) {
        const normalizedLocked = normalizeLockObject(locked);
        this.properties = {
            ...this.properties,
            lockObject: normalizedLocked
        };

        if (this.currentPath) {
            const currentProperties = this.getPathShapeProperties(this.currentPath);
            this.currentPath.creationProperties.properties = {
                ...this.currentPath.creationProperties.properties,
                ...currentProperties,
                lockObject: normalizedLocked
            };
            this.currentPath.locked = normalizedLocked;
        }

        redraw();
    }

    bindPropertiesUI(container) {
        if (!container) return;

        const rememberDimension = key => {
            this.pendingDimensionKey = key;
        };

        ['width', 'height'].forEach(key => {
            const input = container.querySelector(`#pm-${key}`);
            if (!input) return;
            input.addEventListener('focus', () => rememberDimension(key));
            input.addEventListener('input', () => rememberDimension(key));
            input.addEventListener('change', () => rememberDimension(key));
        });

        const ratioButton = container.querySelector('#pm-lock-ratio-toggle');
        if (ratioButton) {
            ratioButton.addEventListener('click', event => {
                event.preventDefault();
                this.setRatioLock(ratioButton.dataset.locked !== 'true');
            });
        }

    }

    buildShapePoints(shape, values) {
        const centerX = this.toInternal(values.x);
        const centerY = this.toInternal(values.y);
        const width = this.toInternal(values.width);
        const height = this.toInternal(values.height);

        let points = [];

        switch (shape) {
            case 'DrillShape':
                points = createEllipsePoints(centerX, centerY, width / 2, height / 2);
                break;
            case 'Square':
                points = [
                    { x: centerX - width / 2, y: centerY - height / 2 },
                    { x: centerX + width / 2, y: centerY - height / 2 },
                    { x: centerX + width / 2, y: centerY + height / 2 },
                    { x: centerX - width / 2, y: centerY + height / 2 }
                ];
                break;
            case 'Circle':
                points = createEllipsePoints(centerX, centerY, width / 2, height / 2);
                break;
            case 'Triangle':
                points = [
                    { x: centerX - width / 2, y: centerY + height / 2 },
                    { x: centerX, y: centerY - height / 2 },
                    { x: centerX + width / 2, y: centerY + height / 2 }
                ];
                break;
            case 'Star':
                points = createStarPoints(centerX, centerY, width, height);
                break;
            case 'HalfCircle':
                points = createHalfEllipsePoints(centerX, centerY, width / 2, height / 2);
                break;
            case 'RightTriangle':
                points = [
                    { x: centerX - width / 2, y: centerY + height / 2 },
                    { x: centerX + width / 2, y: centerY + height / 2 },
                    { x: centerX - width / 2, y: centerY - height / 2 }
                ];
                break;
            default:
                points = [
                    { x: centerX - width / 2, y: centerY - height / 2 },
                    { x: centerX + width / 2, y: centerY - height / 2 },
                    { x: centerX + width / 2, y: centerY + height / 2 },
                    { x: centerX - width / 2, y: centerY + height / 2 }
                ];
                break;
        }

        const rotated = rotatePath(points, centerX, centerY, values.angle);
        return closePath(rotated);
    }

    syncMachiningAfterShapeEdit(svgPath, oldId) {
        if (!svgPath) return;

        if (oldId !== null && oldId !== undefined && oldId !== svgPath.id) {
            toolpaths.forEach(tp => {
                if (tp.svgId === oldId) tp.svgId = svgPath.id;
                if (tp.svgIds && Array.isArray(tp.svgIds)) {
                    tp.svgIds = tp.svgIds.map(id => id === oldId ? svgPath.id : id);
                }
            });
        }

        const linkedToolpaths = toolpaths.filter(tp => {
            const sourceIds = tp.svgIds || (tp.svgId ? [tp.svgId] : []);
            return sourceIds.includes(svgPath.id);
        });
        const hasNonPreviewToolpaths = linkedToolpaths.some(tp => tp.isShapePreviewToolpath !== true);
        const hasPreviewToolpaths = linkedToolpaths.some(tp => tp.isShapePreviewToolpath === true);

        if (hasNonPreviewToolpaths && typeof regenerateToolpathsForPaths === 'function') {
            regenerateToolpathsForPaths([svgPath.id]);
        }

        if (hasPreviewToolpaths && typeof scheduleShapeMachiningToolpathSync === 'function') {
            scheduleShapeMachiningToolpathSync(svgPath, { createIfMissing: true });
        }
    }

    makeShape(shape, x, y, svgPath, data, options = {}) {
        const existingTabLayout = svgPath ? captureShapeTabLayout(svgPath) : null;
        const fields = this.getShapeFields(shape);
        const fallbackCenter = { x, y };
        const rawValues = {
            ...this.properties,
            ...PropertiesManager.collectValues(fields),
            ...(data || {}),
            shape
        };

        if (!svgPath && (!data || data.x === undefined)) rawValues.x = this.toExternal(x);
        if (!svgPath && (!data || data.y === undefined)) rawValues.y = this.toExternal(y);

        const values = this.normalizeShapeValues(shape, rawValues, fallbackCenter);
        const storedProperties = this.buildStoredProperties(values);
        this.properties = { ...this.properties, ...storedProperties, shape };

        const center = {
            x: this.toInternal(values.x),
            y: this.toInternal(values.y)
        };
        const path = this.buildShapePoints(shape, values);
        if (!path.length) return;
        const defaultCutOperationName = isDrillShape(shape) ? 'Drill' : 'Profile';
        const defaultToolpathProperties = window.toolPathProperties?.getDefaultShapeCutProperties(defaultCutOperationName) || null;

        let oldId = null;
        let oldsvgpathId = null;
        if (svgPath != null) {
            oldId = svgPath.id;
            oldsvgpathId = svgPath.svgpathId;
        }
        if (svgPath == null) {
            addUndo(false, true, false);
            const resolvedName = values.name || this.getDefaultPathName(shape, svgpathId);
            svgPath = {
                closed: true,
                svgpathId: svgpathId,
                id: shape + '_' + svgpathId,
                type: 'path',
                name: resolvedName,
                locked: values.lockObject,
                selected: false,
                visible: true,
                path: path,
                bbox: boundingBox(path),
                toolpathProperties: defaultToolpathProperties ? { ...defaultToolpathProperties } : null,
                creationTool: this.name,
                creationProperties: {
                    shape: shape,
                    properties: { ...storedProperties },
                    center: center
                }
            };
            svgpaths.push(svgPath);
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug('Shape default cut preview initialized', svgPath.id, svgPath.toolpathProperties);
            }

            selectSidebarNode(svgPath.id);
            this.currentPath = svgPath;

            svgpathId++;
        }
        else {
            const fallbackName = svgPath.name || this.getDefaultPathName(shape, oldsvgpathId);
            svgPath.path = path;
            svgPath.id = shape + '_' + oldsvgpathId;
            svgPath.name = values.name || fallbackName;
            svgPath.locked = values.lockObject;
            svgPath.bbox = boundingBox(path);
            if (!svgPath.toolpathProperties && defaultToolpathProperties) {
                svgPath.toolpathProperties = { ...defaultToolpathProperties };
            }
            svgPath.creationProperties.shape = shape;
            svgPath.creationProperties.properties = { ...storedProperties };
            svgPath.creationProperties.center = center;
            if (svgPath.transformHistory) {
                applyTransformHistory(svgPath);
            }
            rebuildShapeTabs(svgPath, existingTabLayout);
        }

        addOrReplaceSvgPath(oldId, svgPath.id, svgPath.name);
        selectMgr.unselectAll();
        selectMgr.selectPath(svgPath);

        const floatingTitle = document.getElementById('floating-properties-popup-title');
        const legacyTitle = document.getElementById('tool-properties-title');
        const title = floatingTitle || legacyTitle;
        const shapeConfig = AVAILABLE_SHAPES.find(item => item.value === shape);
        const shapeLabel = shapeConfig?.label || shape;
        if (title) {
            if (title === floatingTitle && shapeConfig?.icon) {
                title.innerHTML = `<i data-lucide="${shapeConfig.icon}"></i> Edit ${svgPath.name}`;
                if (typeof window.lucide !== 'undefined' && typeof window.lucide.createIcons === 'function') {
                    window.lucide.createIcons();
                }
            }
            else {
                title.textContent = `Edit ${svgPath.name}`;
            }
        }

        const displayPosition = this.toDisplayPosition(values.x, values.y);
        PropertiesManager.setValue('name', svgPath.name || '');
        PropertiesManager.setValue('x', formatDimension(displayPosition.x, true));
        PropertiesManager.setValue('y', formatDimension(displayPosition.y, true));
        PropertiesManager.setValue('width', formatDimension(values.width, true));
        PropertiesManager.setValue('height', formatDimension(values.height, true));
        PropertiesManager.setValue('angle', values.angle);
        PropertiesManager.setValue('lockObject', values.lockObject);
        this.updateRatioLockButton(values.lockRatio);
 
        if (oldId !== null) {
            if (!options.deferMachiningSync) {
                this.syncMachiningAfterShapeEdit(svgPath, oldId);
            }
        }

        if (oldId == null && typeof scheduleShapeMachiningToolpathSync === 'function') {
            scheduleShapeMachiningToolpathSync(svgPath, { createIfMissing: true, delay: 0 });
        }

        redraw();

        return svgPath;
    }

    // ── Operation lifecycle ────────────────────────────────────────────────

    stop() {
        const hadEditPath = Boolean(this.currentPath);
        const currentShape = hadEditPath ? this.getCurrentShape() : null;
        this.currentPath = null;
        this.activeHandle = null;
        this.hoverHandle = null;
        this.initialHandleProperties = null;
        this.dragStartMouse = null;
        this.isDraggingShape = false;
        this.mouseDown = false;
        this.pendingDimensionKey = null;

        if (hadEditPath) {
            this.resetCreationProperties(currentShape);
        }
    }

    onMouseDown(canvas, evt) {
        if (this.currentPath) {
            const mouse = this.normalizeEventWorld(canvas, evt);
            if (this.isObjectLocked()) {
                const clickedPath = Select.getInstance().pointInPath(mouse);
                if (clickedPath !== this.currentPath) {
                    this.stop();
                    showToolsList();
                    redraw();
                }
                return;
            }
            const editHandle = this.getEditHandleAtPoint(mouse);

            if (editHandle) {
                addUndo(false, true, false);
                this.mouseDown = true;
                this.activeHandle = editHandle;
                this.hoverHandle = null;
                this.initialHandleProperties = this.getPathShapeProperties(this.currentPath);
                this.dragStartMouse = null;
                this.isDraggingShape = false;
                this.shapeChangedDuringDrag = false;
                redraw();
                return;
            }

            const clickedPath = Select.getInstance().pointInPath(mouse);

            if (clickedPath === this.currentPath) {
                addUndo(false, true, false);
                this.mouseDown = true;
                this.activeHandle = null;
                this.hoverHandle = null;
                this.initialHandleProperties = this.getPathShapeProperties(this.currentPath);
                this.dragStartMouse = { x: mouse.x, y: mouse.y };
                this.isDraggingShape = true;
                this.shapeChangedDuringDrag = false;
                redraw();
                return;
            }

            if (clickedPath !== this.currentPath) {
                this.stop();
                showToolsList();
                redraw();
            }
            return;
        }

        var mouse = this.normalizeEvent(canvas, evt);
        let shape = this.getShape();
        this.makeShape(shape, mouse.x, mouse.y, null, null);
    }

    onMouseMove(canvas, evt) {
        if (!this.currentPath) return;

        const mouse = this.normalizeEventWorld(canvas, evt);

        if (this.mouseDown && this.activeHandle) {
            this.applyHandleEdit(mouse);
            redraw();
            return;
        }

        if (this.mouseDown && this.isDraggingShape) {
            this.applyShapeDrag(mouse);
            redraw();
            return;
        }

        const nextHoverHandle = this.getEditHandleAtPoint(mouse);
        const previousHoverId = this.hoverHandle?.id || null;
        const nextHoverId = nextHoverHandle?.id || null;
        if (previousHoverId !== nextHoverId) {
            this.hoverHandle = nextHoverHandle;
            redraw();
        }
    }

    onMouseUp() {
        if (!this.currentPath) return;

        const editedPath = this.currentPath;
        const shouldSyncMachining = this.shapeChangedDuringDrag;

        this.mouseDown = false;
        this.activeHandle = null;
        this.initialHandleProperties = null;
        this.dragStartMouse = null;
        this.isDraggingShape = false;
        this.shapeChangedDuringDrag = false;

        if (shouldSyncMachining) {
            this.syncMachiningAfterShapeEdit(editedPath, editedPath.id);
        }
    }

    setEditPath(path) {
        this.currentPath = path;
        this.activeHandle = null;
        this.hoverHandle = null;
        this.initialHandleProperties = null;
        this.dragStartMouse = null;
        this.isDraggingShape = false;
        this.shapeChangedDuringDrag = false;
        this.mouseDown = false;

        if (path) {
            path.locked = this.isObjectLocked(path);
            selectMgr.unselectAll();
            selectMgr.selectPath(path);
        }

        redraw();
    }

    draw(ctx) {
        if (!this.currentPath) return;
        if (this.isObjectLocked()) return;
        this.drawEditOverlay(ctx);
    }

    getEditGeometry() {
        if (!this.currentPath) return null;

        const properties = this.getPathShapeProperties(this.currentPath);
        const centerX = this.toInternal(properties.x);
        const centerY = this.toInternal(properties.y);
        const width = this.toInternal(properties.width);
        const height = this.toInternal(properties.height);
        const angleDeg = normalizeAngle(properties.angle);
        const angleRad = angleDeg * Math.PI / 180;

        return {
            ...properties,
            centerX,
            centerY,
            width,
            height,
            angleDeg,
            angleRad,
            halfWidth: width / 2,
            halfHeight: height / 2
        };
    }

    getEditOutlinePoints() {
        const geometry = this.getEditGeometry();
        if (!geometry) return [];

        const { centerX, centerY, halfWidth, halfHeight, angleRad } = geometry;
        return [
            rotatePointAround({ x: centerX - halfWidth, y: centerY - halfHeight }, centerX, centerY, angleRad),
            rotatePointAround({ x: centerX + halfWidth, y: centerY - halfHeight }, centerX, centerY, angleRad),
            rotatePointAround({ x: centerX + halfWidth, y: centerY + halfHeight }, centerX, centerY, angleRad),
            rotatePointAround({ x: centerX - halfWidth, y: centerY + halfHeight }, centerX, centerY, angleRad)
        ];
    }

    getEditHandles() {
        const geometry = this.getEditGeometry();
        if (!geometry) return [];

        if (isDrillShape(geometry.shape)) {
            return [];
        }

        const outline = this.getEditOutlinePoints();
        const topMid = rotatePointAround(
            { x: geometry.centerX, y: geometry.centerY - geometry.halfHeight },
            geometry.centerX,
            geometry.centerY,
            geometry.angleRad
        );
        const rotateOffset = SHAPE_EDIT_ROTATE_OFFSET_PX / zoomLevel;
        const rotateDirection = {
            x: Math.sin(geometry.angleRad),
            y: -Math.cos(geometry.angleRad)
        };

        return [
            { id: 'tl', type: 'scale', x: outline[0].x, y: outline[0].y },
            { id: 'tr', type: 'scale', x: outline[1].x, y: outline[1].y },
            { id: 'br', type: 'scale', x: outline[2].x, y: outline[2].y },
            { id: 'bl', type: 'scale', x: outline[3].x, y: outline[3].y },
            {
                id: 'rotate',
                type: 'rotate',
                x: topMid.x + rotateDirection.x * rotateOffset,
                y: topMid.y + rotateDirection.y * rotateOffset,
                anchorX: topMid.x,
                anchorY: topMid.y
            }
        ];
    }

    getEditHandleAtPoint(point) {
        const hitRadius = SHAPE_EDIT_HANDLE_HIT_RADIUS / zoomLevel;
        return this.getEditHandles().find(handle => {
            const dx = handle.x - point.x;
            const dy = handle.y - point.y;
            return Math.sqrt(dx * dx + dy * dy) <= hitRadius;
        }) || null;
    }

    drawEditOverlay(ctx) {
        const outline = this.getEditOutlinePoints();
        const handles = this.getEditHandles();
        if (outline.length !== 4) return;

        const screenPoints = outline.map(point => worldToScreen(point.x, point.y));
        const rotateHandle = handles.find(handle => handle.type === 'rotate');

        ctx.save();
        ctx.strokeStyle = selectionBoxColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
        screenPoints.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
        ctx.closePath();
        ctx.stroke();

        if (rotateHandle) {
            const screenAnchor = worldToScreen(rotateHandle.anchorX, rotateHandle.anchorY);
            const screenRotate = worldToScreen(rotateHandle.x, rotateHandle.y);
            ctx.beginPath();
            ctx.moveTo(screenAnchor.x, screenAnchor.y);
            ctx.lineTo(screenRotate.x, screenRotate.y);
            ctx.stroke();
        }

        ctx.setLineDash([]);
        handles.forEach(handle => this.drawEditHandle(ctx, handle));
        ctx.restore();
    }

    drawEditHandle(ctx, handle) {
        const screenHandle = worldToScreen(handle.x, handle.y);
        const isActive = this.activeHandle?.id === handle.id;
        const isHovered = this.hoverHandle?.id === handle.id;

        ctx.fillStyle = isActive
            ? handleActiveColor
            : isHovered
                ? handleHoverColor
                : handleNormalColor;
        ctx.strokeStyle = isActive
            ? handleActiveStroke
            : isHovered
                ? handleHoverStroke
                : handleNormalStroke;
        ctx.lineWidth = 2;

        if (handle.type === 'rotate') {
            this.drawCircle(ctx, screenHandle.x, screenHandle.y, SHAPE_EDIT_HANDLE_SIZE, ctx.fillStyle, null);

            const arrowRadius = SHAPE_EDIT_HANDLE_SIZE + 2;
            const nineOClock = Math.PI;
            const tenOClock = Math.PI * 1.17;

            ctx.beginPath();
            ctx.arc(screenHandle.x, screenHandle.y, arrowRadius, nineOClock, tenOClock, true);
            ctx.stroke();

            const ax = screenHandle.x + arrowRadius * Math.cos(tenOClock);
            const ay = screenHandle.y + arrowRadius * Math.sin(tenOClock);
            const legLen = 6;
            ctx.beginPath();
            ctx.moveTo(ax, ay - legLen);
            ctx.lineTo(ax, ay);
            ctx.lineTo(ax + legLen, ay);
            ctx.lineWidth = 2.5;
            ctx.stroke();
            return;
        }

        ctx.beginPath();
        ctx.rect(
            screenHandle.x - SHAPE_EDIT_HANDLE_SIZE,
            screenHandle.y - SHAPE_EDIT_HANDLE_SIZE,
            SHAPE_EDIT_HANDLE_SIZE * 2,
            SHAPE_EDIT_HANDLE_SIZE * 2
        );
        ctx.fill();
        ctx.stroke();
    }

    applyHandleEdit(mouse) {
        if (!this.currentPath || !this.activeHandle || !this.initialHandleProperties) return;

        const properties = { ...this.initialHandleProperties };
        const centerX = this.toInternal(properties.x);
        const centerY = this.toInternal(properties.y);

        if (this.activeHandle.type === 'rotate') {
            const dx = mouse.x - centerX;
            const dy = mouse.y - centerY;
            if (dx === 0 && dy === 0) return;

            const rawAngle = Math.atan2(dx, -dy) * 180 / Math.PI;
            const snappedAngle = Math.round(rawAngle / SHAPE_EDIT_ROTATION_SNAP_DEG) * SHAPE_EDIT_ROTATION_SNAP_DEG;
            this.updateInPlace(this.currentPath, { ...properties, angle: snappedAngle }, { deferMachiningSync: true });
            this.shapeChangedDuringDrag = true;
            return;
        }

        const angleRad = normalizeAngle(properties.angle) * Math.PI / 180;
        const dx = mouse.x - centerX;
        const dy = mouse.y - centerY;
        const localX = dx * Math.cos(angleRad) + dy * Math.sin(angleRad);
        const localY = -dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

        const width = Math.max(MIN_SHAPE_SIZE, this.toExternal(Math.abs(localX) * 2));
        const height = Math.max(MIN_SHAPE_SIZE, this.toExternal(Math.abs(localY) * 2));

        if (properties.lockRatio) {
            const lockedDimensions = getLockedDimensionsFromBounds(
                width,
                height,
                this.getReferenceAspectRatio(this.initialHandleProperties, properties)
            );
            this.updateInPlace(this.currentPath, { ...properties, ...lockedDimensions }, { deferMachiningSync: true });
            this.shapeChangedDuringDrag = true;
            return;
        }

        this.updateInPlace(this.currentPath, { ...properties, width, height }, { deferMachiningSync: true });
        this.shapeChangedDuringDrag = true;
    }

    applyShapeDrag(mouse) {
        if (!this.currentPath || !this.initialHandleProperties || !this.dragStartMouse) return;

        const dx = mouse.x - this.dragStartMouse.x;
        const dy = mouse.y - this.dragStartMouse.y;
        const properties = { ...this.initialHandleProperties };

        this.updateInPlace(this.currentPath, {
            ...properties,
            x: properties.x + this.toExternal(dx),
            y: properties.y + this.toExternal(dy)
        }, { deferMachiningSync: true });
        this.shapeChangedDuringDrag = true;
    }

    update(path) {
        let shape = path.creationProperties.shape;
        this.showProperties(shape);
        const storedProperties = this.getPathShapeProperties(path);
        this.properties = { ...this.properties, ...storedProperties };
    }

    updateInPlace(svgPath, data, options = {}) {
        const currentProperties = this.getPathShapeProperties(svgPath);
        const nextValues = { ...currentProperties, ...(data || {}) };
        this.makeShape(data.shape || this.getCurrentShape(), 0, 0, svgPath, nextValues, options);
    }

    // ── Properties panel ──────────────────────────────────────────────────

    getCurrentShape() {
        if (this.fixedShape) {
            return this.fixedShape;
        }
        if (this.currentPath) {
            return this.currentPath.creationProperties.shape;
        }
        if (this.properties && this.properties.shape) {
            return this.properties.shape;
        }
        return 'Square';
    }

    getShape() {
        if (this.fixedShape) {
            return this.fixedShape;
        }
        return document.getElementById('pm-shape').value;
    }

    showProperties(shape) {
        if (this.fixedShape) return;
        const shapeSelect = document.getElementById('pm-shape');
        if (shapeSelect) shapeSelect.value = shape;
    }

    renderGeometryFields(pathProperties) {
        const currentShape = pathProperties?.shape || this.getCurrentShape();
        const nameField = this.nameField;
        const lockObjectField = this.lockObjectField;
        const xField = this.geometryFields.find(field => field.key === 'x');
        const yField = this.geometryFields.find(field => field.key === 'y');
        const widthField = this.geometryFields.find(field => field.key === 'width');
        const heightField = this.geometryFields.find(field => field.key === 'height');
        const angleField = this.geometryFields.find(field => field.key === 'angle');
        const resolvedName = PropertiesManager.resolveValue(nameField, pathProperties, this.properties);
        const resolvedLockObject = PropertiesManager.resolveValue(lockObjectField, pathProperties, this.properties);
        const resolvedX = PropertiesManager.resolveValue(xField, pathProperties, this.properties);
        const resolvedY = PropertiesManager.resolveValue(yField, pathProperties, this.properties);
        const resolvedWidth = PropertiesManager.resolveValue(widthField, pathProperties, this.properties);
        const resolvedHeight = PropertiesManager.resolveValue(heightField, pathProperties, this.properties);
        const lockRatio = pathProperties?.lockRatio !== undefined
            ? normalizeLockRatio(pathProperties.lockRatio)
            : normalizeLockRatio(this.properties.lockRatio);
        const displayPosition = this.toDisplayPosition(resolvedX, resolvedY);

        if (isDrillShape(currentShape)) {
            return `
                <h5 class="mt-3 mb-2">Position</h5>
                ${PropertiesManager.fieldHTML(xField, displayPosition.x)}
                ${PropertiesManager.fieldHTML(yField, displayPosition.y)}
                ${PropertiesManager.fieldHTML(lockObjectField, resolvedLockObject)}
                ${PropertiesManager.fieldHTML(nameField, resolvedName)}
            `;
        }

        return `
            <h5 class="mt-3 mb-2">Position</h5>
            ${PropertiesManager.fieldHTML(xField, displayPosition.x)}
            ${PropertiesManager.fieldHTML(yField, displayPosition.y)}
            <h5 class="mt-3 mb-2">Size</h5>
            <div class="d-flex align-items-start gap-2">
                <div class="flex-grow-1">
                    ${PropertiesManager.fieldHTML(widthField, resolvedWidth)}
                    ${PropertiesManager.fieldHTML(heightField, resolvedHeight)}
                </div>
                ${this.getRatioLockButtonHTML(lockRatio)}
            </div>
            <h5 class="mt-3 mb-2">Rotation</h5>
            ${PropertiesManager.fieldHTML(angleField, PropertiesManager.resolveValue(angleField, pathProperties, this.properties))}
            ${PropertiesManager.fieldHTML(lockObjectField, resolvedLockObject)}
            ${PropertiesManager.fieldHTML(nameField, resolvedName)}
        `;
    }

    getPropertiesHTML(path) {
        const currentShape = this.getCurrentShape();
        const pathProperties = this.currentPath ? this.getPathShapeProperties(this.currentPath) : null;
 
        if (this.fixedShape) {
            const shapeLabel = AVAILABLE_SHAPES.find(shape => shape.value === this.fixedShape)?.label || this.fixedShape;
 
            const titleText = this.currentPath ? `Edit ${this.currentPath.name}` : `${shapeLabel} Tool`;
            let html = `
                <div class="alert alert-info mb-3">
                    <strong>${titleText}</strong><br>
                    ${this.tooltip}
                </div>`;
            html += this.renderGeometryFields(pathProperties);
            return html;
        }
 
        let html = `
            <div class="alert alert-info mb-3">
                <strong>Shape Tool</strong><br>
                Create and edit simple parametric shapes.
            </div>`;
        html += PropertiesManager.fieldHTML(this.shapeField, currentShape);
        html += this.renderGeometryFields(pathProperties);
 
        return html;
    }
/**
     * Override base class to manage our own property parsing.
     * The base class would merge raw string values from `data` into this.properties
     * after onPropertiesChanged, overwriting our parsed numbers.
     */
    updateFromProperties(data, meta = {}) {
        this.onPropertiesChanged(data, meta);
    }

    onPropertiesChanged(data, meta = {}) {
        const newShape = data.shape;
        if (newShape && !this.fixedShape) {
            this.showProperties(newShape);
        }

        const shape = newShape || this.getCurrentShape();
        const fields = this.getShapeFields(shape);

        const currentPathProperties = this.currentPath ? this.getPathShapeProperties(this.currentPath) : null;
        const rawValues = {
            ...(currentPathProperties || {}),
            ...this.properties,
            ...PropertiesManager.collectValues(Object.values(this.fields)),
            ...(data || {}),
            shape
        };

        const currentLockState = currentPathProperties ? normalizeLockObject(currentPathProperties.lockObject) : normalizeLockObject(this.properties.lockObject);
        const nextLockState = normalizeLockObject(rawValues.lockObject);
        const isUnlockTransition = currentLockState && !nextLockState;

        if (currentLockState && !isUnlockTransition) {
            const lockedName = typeof rawValues.name === 'string' ? rawValues.name.trim() : currentPathProperties?.name || this.properties.name || DEFAULT_SHAPE_NAME;
            rawValues.name = lockedName;
            rawValues.lockObject = true;

            const lockedProperties = currentPathProperties || this.properties;
            const lockedDisplayPosition = this.toDisplayPosition(lockedProperties.x, lockedProperties.y);
            rawValues.x = lockedDisplayPosition.x;
            rawValues.y = lockedDisplayPosition.y;
            rawValues.width = lockedProperties.width;
            rawValues.height = lockedProperties.height;
            rawValues.angle = lockedProperties.angle;
            rawValues.lockRatio = lockedProperties.lockRatio;
        }

        if (rawValues.x !== undefined || rawValues.y !== undefined) {
            const fallbackStoredX = Number.isFinite(Number(currentPathProperties?.x))
                ? Number(currentPathProperties.x)
                : (Number.isFinite(Number(this.properties.x)) ? Number(this.properties.x) : 0);
            const fallbackStoredY = Number.isFinite(Number(currentPathProperties?.y))
                ? Number(currentPathProperties.y)
                : (Number.isFinite(Number(this.properties.y)) ? Number(this.properties.y) : 0);
            const fallbackDisplayPosition = this.toDisplayPosition(fallbackStoredX, fallbackStoredY);
            const displayX = rawValues.x !== undefined ? Number(rawValues.x) : fallbackDisplayPosition.x;
            const displayY = rawValues.y !== undefined ? Number(rawValues.y) : fallbackDisplayPosition.y;
            const storedPosition = this.toStoredPosition(displayX, displayY);
            rawValues.x = storedPosition.x;
            rawValues.y = storedPosition.y;
        }

        const changedKey = meta.changedKey || this.pendingDimensionKey;
        if (normalizeLockRatio(rawValues.lockRatio) && (changedKey === 'width' || changedKey === 'height')) {
            const lockedDimensions = getLockedDimensionsFromAxis(
                changedKey,
                rawValues[changedKey],
                this.getReferenceAspectRatio(currentPathProperties, this.properties)
            );
            rawValues.width = lockedDimensions.width;
            rawValues.height = lockedDimensions.height;

            if (changedKey === 'width') {
                PropertiesManager.setValue('height', formatDimension(lockedDimensions.height, true));
            }
            else {
                PropertiesManager.setValue('width', formatDimension(lockedDimensions.width, true));
            }
        }

        const values = this.normalizeShapeValues(shape, rawValues, currentPathProperties ? {
            x: this.toInternal(currentPathProperties.x),
            y: this.toInternal(currentPathProperties.y)
        } : null);
        const storedProperties = this.buildStoredProperties({ ...values, shape });
        this.properties = { ...this.properties, ...storedProperties, shape };
        this.pendingDimensionKey = null;

        if (this.currentPath) {
            this.updateInPlace(this.currentPath, { ...values, shape });
        } else {
            this.setObjectLock(values.lockObject);
        }
    }
}

if (typeof window !== 'undefined') {
    window.AVAILABLE_SHAPES = AVAILABLE_SHAPES;
    window.SHAPE_TOOL_NAMES = SHAPE_TOOL_NAMES;
}
