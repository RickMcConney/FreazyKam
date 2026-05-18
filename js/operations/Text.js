
const TEXT_EDIT_HANDLE_SIZE = 8;
const TEXT_EDIT_HANDLE_HIT_RADIUS = 28;
const TEXT_EDIT_ROTATE_OFFSET_PX = 36;
const TEXT_EDIT_ROTATION_SNAP_DEG = 5;
const TEXT_MIN_SIZE = 1;

function rotateTextPointAround(point, centerX, centerY, angleRad) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = point.x - centerX;
    const dy = point.y - centerY;

    return {
        x: centerX + dx * cos - dy * sin,
        y: centerY + dx * sin + dy * cos
    };
}

class Text extends Operation {
    constructor() {
        super('Text', 'type-outline', 'Create text paths using TTF fonts');

        this.textField = {
            key: 'text',
            label: 'Text',
            type: 'text',
            default: 'Sample Text'
        };

        this.fontField = {
            key: 'font',
            label: 'Font',
            type: 'choice',
            default: 'fonts/Roboto-Regular.ttf',
            options: AVAILABLE_FONTS.map(f => ({ value: f.value, label: f.label }))
        };

        this.alignField = {
            key: 'align',
            label: 'Alignment',
            type: 'choice',
            default: 'center',
            options: [
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' }
            ]
        };

        this.lineHeightField = {
            key: 'lineHeight',
            label: 'Line Height',
            type: 'number',
            default: 1.2,
            min: 0.5,
            max: 3,
            step: 0.05
        };

        this.xField = {
            key: 'x',
            label: 'X',
            type: 'dimension',
            default: 0,
            persist: false
        };

        this.yField = {
            key: 'y',
            label: 'Y',
            type: 'dimension',
            default: 0,
            persist: false
        };

        this.widthField = {
            key: 'width',
            label: 'Width',
            type: 'dimension',
            default: 0,
            persist: false
        };

        this.heightField = {
            key: 'height',
            label: 'Height',
            type: 'dimension',
            default: 0,
            persist: false
        };

        this.rotationField = {
            key: 'rotation',
            label: 'Angle',
            type: 'number',
            default: 0,
            step: 1,
            persist: false
        };

        this.lockObjectField = {
            key: 'lockObject',
            label: 'Lock object',
            type: 'checkbox',
            default: false,
            persist: false
        };

        this.lockRatioField = {
            key: 'lockRatio',
            label: 'Lock ratio',
            type: 'checkbox',
            default: true,
            persist: false
        };

        this.currentPath = null;
        this.pendingUpdateTimer = null;
        this.activeHandle = null;
        this.hoverHandle = null;
        this.initialHandleProperties = null;
        this.dragStartMouse = null;
        this.isDraggingText = false;
        this.textChangedDuringDrag = false;
        this.mouseDown = false;
        this.pendingDimensionKey = null;
    }

    getDefaultCutOperationName() {
        return 'Profile';
    }

    // Build the fontSize field spec at call-time since it depends on runtime options
    _getFontSizeField() {
        const useInches = getOption('Inches');
        const maxDimension = Math.max(getOption('workpieceWidth') || 300, getOption('workpieceLength') || 200);
        return {
            key: 'fontSize',
            label: 'Font Size',
            type: 'range',
            default: useInches ? 25.4 : 20,
            min: useInches ? 0.125 : 5,
            max: useInches ? Math.ceil(maxDimension / 25.4) : maxDimension,
            step: useInches ? 0.125 : 1,
            dimension: true,
            mmPerUnit: useInches ? 25.4 : 1
        };
    }

    _fields() {
        return [
            this.textField,
            this.fontField,
            this._getFontSizeField(),
            this.alignField,
            this.lineHeightField,
            this.xField,
            this.yField,
            this.widthField,
            this.heightField,
            this.rotationField,
            this.lockRatioField,
            this.lockObjectField
        ];
    }

    get fields() {
        return Object.fromEntries(this._fields().map(f => [f.key, f]));
    }

    getProperties() {
        const useInches = getOption('Inches');
        const defaultGridSize = getOption('gridSize') || 10;
        const defaultFontSize = useInches ? 25.4 : (defaultGridSize * 2);
        const savedFontSize = getOption('textFontSize');
        this.properties.fontSize = (savedFontSize !== null && savedFontSize !== undefined) ? savedFontSize : defaultFontSize;
        this.properties.font = getOption('textFont') || 'fonts/Roboto-Regular.ttf';
        this.properties.text = getOption('textSample') || 'Sample Text';
        this.properties.align = getOption('textAlign') || 'center';
        this.properties.lineHeight = Number(getOption('textLineHeight')) || 1.2;
        this.properties.lockRatio = getOption('textLockRatio') !== false;
    }

    // Lifecycle methods
    start() {
        this.getProperties();
        super.start();
    }

    stop() {
        this._clearPendingUpdate();
        this.currentPath = null;
        this.activeHandle = null;
        this.hoverHandle = null;
        this.initialHandleProperties = null;
        this.dragStartMouse = null;
        this.isDraggingText = false;
        this.textChangedDuringDrag = false;
        this.mouseDown = false;
        this.pendingDimensionKey = null;
        super.stop();
    }

    setEditPath(path) {
        this._clearPendingUpdate();
        this.currentPath = path;
        this.activeHandle = null;
        this.hoverHandle = null;
        this.initialHandleProperties = null;
        this.dragStartMouse = null;
        this.isDraggingText = false;
        this.textChangedDuringDrag = false;
        this.mouseDown = false;
        if (path?.creationProperties) {
            this.properties = {
                ...this.properties,
                ...this.getPathTextProperties(path)
            };
        }
    }

    onMouseDown(canvas, evt) {
        if (!this.currentPath) return;

        const mouse = this.normalizeEventWorld(canvas, evt);
        if (this.isObjectLocked()) {
            const clickedPath = Select.getInstance().pointInPath(mouse);
            if (!this.isPathInCurrentGroup(clickedPath)) {
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
            this.initialHandleProperties = this.getPathTextProperties(this.currentPath);
            this.dragStartMouse = null;
            this.isDraggingText = false;
            this.textChangedDuringDrag = false;
            redraw();
            return;
        }

        const clickedPath = Select.getInstance().pointInPath(mouse);
        if (this.isPathInCurrentGroup(clickedPath)) {
            addUndo(false, true, false);
            this.mouseDown = true;
            this.activeHandle = null;
            this.hoverHandle = null;
            this.initialHandleProperties = this.getPathTextProperties(this.currentPath);
            this.dragStartMouse = { x: mouse.x, y: mouse.y };
            this.isDraggingText = true;
            this.textChangedDuringDrag = false;
            redraw();
            return;
        }

        this.stop();
        showToolsList();
        redraw();
    }

    onMouseMove(canvas, evt) {
        if (!this.currentPath) return;

        const mouse = this.normalizeEventWorld(canvas, evt);

        if (this.mouseDown && this.activeHandle) {
            this.applyHandleEdit(mouse);
            redraw();
            return;
        }

        if (this.mouseDown && this.isDraggingText) {
            this.applyTextDrag(mouse);
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

        const shouldSyncMachining = this.textChangedDuringDrag;
        const editedPath = this.currentPath;

        this.mouseDown = false;
        this.activeHandle = null;
        this.initialHandleProperties = null;
        this.dragStartMouse = null;
        this.isDraggingText = false;
        this.textChangedDuringDrag = false;

        if (shouldSyncMachining) {
            const groupPaths = this.getGroupPaths(editedPath);
            const changedIds = groupPaths.map(path => path.id);

            if (typeof regenerateToolpathsForPaths === 'function' && changedIds.length > 0) {
                regenerateToolpathsForPaths(changedIds);
            }
        }
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        const pathProperties = this.currentPath?.creationProperties ?? null;
        if (!pathProperties) this.getProperties(); // ensure this.properties is fresh for new text
        return `
            <div class="alert alert-info mb-3">
                <strong>Text Tool</strong><br>
                Create text paths using TTF fonts
            </div>
            ${PropertiesManager.formHTML(this._fields(), pathProperties, this.properties)}`;
    }

    getPathTextProperties(path) {
        const creationProperties = path?.creationProperties || {};
        const groupPaths = this.getGroupPaths(path);
        const bbox = this.getGroupBoundingBox(groupPaths);
        const center = bbox
            ? {
                x: (bbox.minx + bbox.maxx) / 2,
                y: (bbox.miny + bbox.maxy) / 2
            }
            : { x: 0, y: 0 };
        const displayPosition = this.toDisplayPosition(this.toExternal(center.x), this.toExternal(center.y));
        return {
            text: creationProperties.text ?? this.properties.text ?? this.textField.default,
            font: creationProperties.font ?? this.properties.font ?? this.fontField.default,
            fontSize: creationProperties.fontSize ?? this.properties.fontSize ?? this._getFontSizeField().default,
            align: creationProperties.align ?? this.properties.align ?? this.alignField.default,
            lineHeight: creationProperties.lineHeight ?? this.properties.lineHeight ?? this.lineHeightField.default,
            x: displayPosition.x,
            y: displayPosition.y,
            width: bbox ? this.toExternal(bbox.maxx - bbox.minx) : 0,
            height: bbox ? this.toExternal(bbox.maxy - bbox.miny) : 0,
            rotation: this.getGroupRotation(groupPaths),
            lockRatio: creationProperties.lockRatio ?? this.properties.lockRatio ?? true,
            lockObject: this.isObjectLocked(path)
        };
    }

    renderGeometryFields(pathProperties = null) {
        const values = pathProperties || this.getPathTextProperties(this.currentPath);
        return `
            <div class="text-properties-stack mb-3">
                <div class="text-properties-grid-main">
                    ${PropertiesManager.fieldHTML(this.textField, values.text)}
                </div>
                <div class="text-properties-grid-side">
                    ${PropertiesManager.fieldHTML(this.fontField, values.font)}
                </div>
            </div>
            <h5 class="mt-3 mb-2">Position</h5>
            ${PropertiesManager.fieldHTML(this.xField, values.x)}
            ${PropertiesManager.fieldHTML(this.yField, values.y)}
            <h5 class="mt-3 mb-2">Size</h5>
            <div class="d-flex align-items-start gap-2">
                <div class="flex-grow-1">
                    ${PropertiesManager.fieldHTML(this.widthField, values.width)}
                    ${PropertiesManager.fieldHTML(this.heightField, values.height)}
                </div>
                ${this.getRatioLockButtonHTML(values.lockRatio)}
            </div>
            <h5 class="mt-3 mb-2">Rotation</h5>
            ${PropertiesManager.fieldHTML(this.rotationField, values.rotation)}
            ${PropertiesManager.fieldHTML(this.lockObjectField, values.lockObject)}
        `;
    }

    createAtCanvasCenter() {
        const canvas = document.getElementById('canvas');
        if (!canvas || typeof screenToWorld !== 'function') return null;

        this.getProperties();
        const center = screenToWorld(canvas.width / 2, canvas.height / 2);
        const textValue = (this.properties.text || '').trim();
        if (!textValue) return null;

        return this.addText(textValue, center.x, center.y, this.properties.fontSize, this.properties.font, {
            delayPreviewSync: true
        });
    }

    updateFromProperties(data, options = {}) {
        // Manage parsing ourselves so the base class doesn't overwrite with raw slider values
        this.onPropertiesChanged(data, options);
    }

    update(path) {
        if (!path) return;
        this.properties = {
            ...this.properties,
            ...this.getPathTextProperties(path)
        };
    }

    onPropertiesChanged(data, options = {}) {
        const values = data && Object.keys(data).length > 0
            ? data
            : PropertiesManager.collectValues(this._fields());
        const currentValues = this.currentPath ? this.getPathTextProperties(this.currentPath) : null;
        this.properties = { ...this.properties, ...values };
        this._saveTextOptions(values.text, values.font, values.fontSize, values.align, values.lineHeight);
        if (this.currentPath && this.currentPath.creationProperties) {
            if (options.changedKey === 'x' || options.changedKey === 'y' || options.changedKey === 'width'
                || options.changedKey === 'height' || options.changedKey === 'rotation' || options.changedKey === 'lockObject'
                || options.changedKey === 'lockRatio') {
                this.applyGeometryProperties({ ...currentValues, ...values }, options.changedKey);
                return;
            }
            this._scheduleTextUpdate(options.changedKey || null);
        }
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

    getReferenceAspectRatio(primary, fallback = null) {
        const primaryRatio = Number(primary?.width) > 0 && Number(primary?.height) > 0
            ? Number(primary.width) / Number(primary.height)
            : 0;
        if (primaryRatio > 0) return primaryRatio;

        const fallbackRatio = Number(fallback?.width) > 0 && Number(fallback?.height) > 0
            ? Number(fallback.width) / Number(fallback.height)
            : 0;
        if (fallbackRatio > 0) return fallbackRatio;

        return 1;
    }

    getRatioLockButtonHTML(lockRatio) {
        const locked = lockRatio !== false && lockRatio !== 'false';
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

        const normalizedLocked = locked !== false && locked !== 'false';
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
        const normalizedLocked = locked !== false && locked !== 'false';
        this.properties = {
            ...this.properties,
            lockRatio: normalizedLocked
        };
        this.updateRatioLockButton(normalizedLocked);

        if (this.currentPath) {
            this.applyGeometryProperties({
                ...this.getPathTextProperties(this.currentPath),
                lockRatio: normalizedLocked
            }, 'lockRatio');
        }
    }

    isPathInCurrentGroup(path) {
        if (!path || !this.currentPath) return false;
        if (this.currentPath.textGroupId) {
            return path.textGroupId === this.currentPath.textGroupId;
        }
        return path.id === this.currentPath.id;
    }

    getGroupPaths(path = this.currentPath) {
        if (!path) return [];
        if (!path.textGroupId) return [path];
        return svgpaths.filter(candidate => candidate.textGroupId === path.textGroupId);
    }

    getGroupPathIds(path = this.currentPath) {
        return this.getGroupPaths(path).map(candidate => candidate.id).sort();
    }

    getGroupBoundingBox(paths) {
        if (!Array.isArray(paths) || paths.length === 0) return null;
        let minx = Infinity;
        let miny = Infinity;
        let maxx = -Infinity;
        let maxy = -Infinity;

        paths.forEach(path => {
            const bbox = path?.bbox || (path?.path ? boundingBox(path.path) : null);
            if (!bbox) return;
            minx = Math.min(minx, bbox.minx);
            miny = Math.min(miny, bbox.miny);
            maxx = Math.max(maxx, bbox.maxx);
            maxy = Math.max(maxy, bbox.maxy);
        });

        if (!Number.isFinite(minx) || !Number.isFinite(miny) || !Number.isFinite(maxx) || !Number.isFinite(maxy)) {
            return null;
        }

        return { minx, miny, maxx, maxy };
    }

    getGroupRotation(paths) {
        const firstPath = Array.isArray(paths) && paths.length > 0 ? paths[0] : null;
        if (!firstPath?.transformHistory) return 0;
        return firstPath.transformHistory.reduce((sum, transform) => sum + (transform.rotation || 0), 0);
    }

    isObjectLocked(path = this.currentPath) {
        if (!path) return false;
        return path.locked === true
            || path.locked === 'true'
            || path.creationProperties?.lockObject === true
            || path.creationProperties?.lockObject === 'true';
    }

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

    applyGeometryProperties(values, changedKey = null) {
        const groupPaths = this.getGroupPaths(this.currentPath);
        if (groupPaths.length === 0) return;

        const bbox = this.getGroupBoundingBox(groupPaths);
        if (!bbox) return;

        const centerX = (bbox.minx + bbox.maxx) / 2;
        const centerY = (bbox.miny + bbox.maxy) / 2;
        const currentWidth = Math.max(Number.EPSILON, this.toExternal(bbox.maxx - bbox.minx));
        const currentHeight = Math.max(Number.EPSILON, this.toExternal(bbox.maxy - bbox.miny));
        const currentRotation = this.getGroupRotation(groupPaths);
        const lockRatio = values.lockRatio !== false && values.lockRatio !== 'false';
        const referenceRatio = this.getReferenceAspectRatio({ width: currentWidth, height: currentHeight }, values);
        let targetWidth = Math.max(Number.EPSILON, Number(values.width) || currentWidth);
        let targetHeight = Math.max(Number.EPSILON, Number(values.height) || currentHeight);

        if (lockRatio && changedKey === 'width') {
            targetHeight = targetWidth / referenceRatio;
            PropertiesManager.setValue('height', formatDimension(targetHeight, true));
        } else if (lockRatio && changedKey === 'height') {
            targetWidth = targetHeight * referenceRatio;
            PropertiesManager.setValue('width', formatDimension(targetWidth, true));
        }

        const storedTarget = this.toStoredPosition(Number(values.x) || 0, Number(values.y) || 0);
        const targetCenterX = this.toInternal(storedTarget.x);
        const targetCenterY = this.toInternal(storedTarget.y);
        const scaleX = targetWidth / currentWidth;
        const scaleY = targetHeight / currentHeight;
        const rotation = Number(values.rotation) || 0;
        const rotationDelta = rotation - currentRotation;
        const deltaX = targetCenterX - centerX;
        const deltaY = targetCenterY - centerY;
        const lockObject = values.lockObject === true || values.lockObject === 'true';

        groupPaths.forEach(path => {
            path.path = path.path.map(point => {
                let nextX = centerX + (point.x - centerX) * scaleX;
                let nextY = centerY + (point.y - centerY) * scaleY;

                if (rotationDelta !== 0) {
                    const rad = -rotationDelta * Math.PI / 180;
                    const dx = nextX - centerX;
                    const dy = nextY - centerY;
                    const cos = Math.cos(rad);
                    const sin = Math.sin(rad);
                    nextX = centerX + (dx * cos - dy * sin);
                    nextY = centerY + (dx * sin + dy * cos);
                }

                return {
                    x: nextX + deltaX,
                    y: nextY + deltaY
                };
            });

            path.bbox = boundingBox(path.path);
            path.locked = lockObject;
            path.creationProperties = {
                ...path.creationProperties,
                lockRatio,
                lockObject
            };
            if (!Array.isArray(path.transformHistory)) {
                path.transformHistory = [];
            }
            path.transformHistory.push({
                centerX,
                centerY,
                scaleX,
                scaleY,
                rotation: rotationDelta,
                skewX: 0,
                skewY: 0,
                deltaX,
                deltaY,
                pivotCenterX: centerX,
                pivotCenterY: centerY
            });
        });

        this.properties = {
            ...this.properties,
            ...values,
            width: targetWidth,
            height: targetHeight,
            lockRatio,
            lockObject
        };

        this.updateRatioLockButton(lockRatio);
        redraw();
    }

    draw(ctx) {
        if (!this.currentPath) return;
        if (this.isObjectLocked()) return;
        this.drawEditOverlay(ctx);
    }

    getEditGeometry() {
        if (!this.currentPath) return null;

        const properties = this.getPathTextProperties(this.currentPath);
        const center = this.toStoredPosition(properties.x, properties.y);
        const centerX = this.toInternal(center.x);
        const centerY = this.toInternal(center.y);
        const width = this.toInternal(properties.width);
        const height = this.toInternal(properties.height);
        const angleDeg = Number(properties.rotation) || 0;
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
            rotateTextPointAround({ x: centerX - halfWidth, y: centerY - halfHeight }, centerX, centerY, angleRad),
            rotateTextPointAround({ x: centerX + halfWidth, y: centerY - halfHeight }, centerX, centerY, angleRad),
            rotateTextPointAround({ x: centerX + halfWidth, y: centerY + halfHeight }, centerX, centerY, angleRad),
            rotateTextPointAround({ x: centerX - halfWidth, y: centerY + halfHeight }, centerX, centerY, angleRad)
        ];
    }

    getEditHandles() {
        const geometry = this.getEditGeometry();
        if (!geometry) return [];

        const outline = this.getEditOutlinePoints();
        const topMid = rotateTextPointAround(
            { x: geometry.centerX, y: geometry.centerY - geometry.halfHeight },
            geometry.centerX,
            geometry.centerY,
            geometry.angleRad
        );
        const rotateOffset = TEXT_EDIT_ROTATE_OFFSET_PX / zoomLevel;
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
        const hitRadius = TEXT_EDIT_HANDLE_HIT_RADIUS / zoomLevel;
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
            this.drawCircle(ctx, screenHandle.x, screenHandle.y, TEXT_EDIT_HANDLE_SIZE, ctx.fillStyle, null);

            const arrowRadius = TEXT_EDIT_HANDLE_SIZE + 2;
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
            screenHandle.x - TEXT_EDIT_HANDLE_SIZE,
            screenHandle.y - TEXT_EDIT_HANDLE_SIZE,
            TEXT_EDIT_HANDLE_SIZE * 2,
            TEXT_EDIT_HANDLE_SIZE * 2
        );
        ctx.fill();
        ctx.stroke();
    }

    applyHandleEdit(mouse) {
        if (!this.currentPath || !this.activeHandle || !this.initialHandleProperties) return;

        const properties = { ...this.initialHandleProperties };
        const center = this.toStoredPosition(properties.x, properties.y);
        const centerX = this.toInternal(center.x);
        const centerY = this.toInternal(center.y);

        if (this.activeHandle.type === 'rotate') {
            const dx = mouse.x - centerX;
            const dy = mouse.y - centerY;
            if (dx === 0 && dy === 0) return;

            const rawAngle = Math.atan2(dx, -dy) * 180 / Math.PI;
            const snappedAngle = Math.round(rawAngle / TEXT_EDIT_ROTATION_SNAP_DEG) * TEXT_EDIT_ROTATION_SNAP_DEG;
            this.applyGeometryProperties({ ...properties, rotation: snappedAngle }, 'rotation');
            this.textChangedDuringDrag = true;
            return;
        }

        const angleRad = (Number(properties.rotation) || 0) * Math.PI / 180;
        const dx = mouse.x - centerX;
        const dy = mouse.y - centerY;
        const localX = dx * Math.cos(angleRad) + dy * Math.sin(angleRad);
        const localY = -dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

        const width = Math.max(TEXT_MIN_SIZE, this.toExternal(Math.abs(localX) * 2));
        const height = Math.max(TEXT_MIN_SIZE, this.toExternal(Math.abs(localY) * 2));
        this.applyGeometryProperties({ ...properties, width, height }, Math.abs(localX) >= Math.abs(localY) ? 'width' : 'height');
        this.textChangedDuringDrag = true;
    }

    applyTextDrag(mouse) {
        if (!this.currentPath || !this.initialHandleProperties || !this.dragStartMouse) return;

        const dx = mouse.x - this.dragStartMouse.x;
        const dy = mouse.y - this.dragStartMouse.y;
        const properties = { ...this.initialHandleProperties };
        const storedPosition = this.toStoredPosition(properties.x, properties.y);

        this.applyGeometryProperties({
            ...properties,
            x: this.toDisplayPosition(storedPosition.x + this.toExternal(dx), storedPosition.y).x,
            y: this.toDisplayPosition(storedPosition.x, storedPosition.y - this.toExternal(dy)).y
        }, 'x');
        this.textChangedDuringDrag = true;
    }

    // Options Management Helper Method
    _saveTextOptions(text, font, sizeInMM, align, lineHeight) {
        if (typeof setOption !== 'undefined') {
            setOption("textFontSize", sizeInMM); // Always stored in mm
            if (font) {
                setOption("textFont", font);
            }
            if (text !== undefined) {
                setOption("textSample", text);
            }
            if (align) {
                setOption("textAlign", align);
            }
            if (lineHeight !== undefined && lineHeight !== null) {
                setOption("textLineHeight", lineHeight);
            }
            if (this.properties.lockRatio !== undefined) {
                setOption("textLockRatio", this.properties.lockRatio);
            }
        }
    }

    _clearPendingUpdate() {
        if (this.pendingUpdateTimer) {
            clearTimeout(this.pendingUpdateTimer);
            this.pendingUpdateTimer = null;
        }
    }

    _scheduleTextUpdate(changedKey = null) {
        if (!this.currentPath) return;

        this._clearPendingUpdate();
        this.pendingUpdateTimer = setTimeout(() => {
            this.pendingUpdateTimer = null;
            addUndo(false, true, false);
            this.updateTextInPlace(this.currentPath, { changedKey });
        }, 120);
    }

    // Font Processing Helper Methods
    _processFontCommands(fontPath, currentX, y, fontname) {
        // Track separate subpaths
        var currentPathData = [];
        var allPaths = [];
        var lastX = currentX;
        var lastY = y;
        var firstPoint = null;

        fontPath.commands.forEach(function (cmd) {
            switch (cmd.type) {
                case 'M': // Move - Start new subpath
                    if (currentPathData.length >= 2) {
                        // Close previous subpath if start and end are near each other
                        var last = currentPathData[currentPathData.length - 1];
                        if (firstPoint && (last.x !== firstPoint.x || last.y !== firstPoint.y)) {
                            var dist = Math.hypot(last.x - firstPoint.x, last.y - firstPoint.y);
                            if (dist < 2) {
                                currentPathData.push(firstPoint);
                            }
                        }
                        allPaths.push([...currentPathData]);
                    }
                    // Start new subpath
                    currentPathData = [];
                    firstPoint = { x: cmd.x, y: cmd.y };
                    currentPathData.push(firstPoint);


                    lastX = cmd.x;
                    lastY = cmd.y;
                    break;

                case 'L': // Line
                    if(firstPoint.x == cmd.x && firstPoint.y == cmd.y)
                        currentPathData.push(firstPoint);
                    else
                        currentPathData.push({ x: cmd.x, y: cmd.y });
                    lastX = cmd.x;
                    lastY = cmd.y;
                    break;

                case 'C': // Curve
                    // Convert bezier curve to line segments
                    var startIndex = (currentPathData.length === 0) ? 0 : 1;
                    var steps = 10;
                    for (var i = startIndex; i <= steps; i++) {
                        var t = i / steps;
                        var mt = 1 - t, mt2 = mt * mt, mt3 = mt2 * mt;
                        var t2 = t * t, t3 = t2 * t;
                        var tx = mt3 * lastX + 3 * mt2 * t * cmd.x1 + 3 * mt * t2 * cmd.x2 + t3 * cmd.x;
                        var ty = mt3 * lastY + 3 * mt2 * t * cmd.y1 + 3 * mt * t2 * cmd.y2 + t3 * cmd.y;
                        currentPathData.push({ x: tx, y: ty });
                    }
                    lastX = cmd.x;
                    lastY = cmd.y;
                    break;

                case 'Q': // Quadratic curve
                    var startIndex = (currentPathData.length === 0) ? 0 : 1;
                    var steps = 10;
                    for (var i = startIndex; i <= steps; i++) {
                        var t = i / steps;
                        var mt = 1 - t, mt2 = mt * mt, t2 = t * t;
                        var tx = mt2 * lastX + 2 * mt * t * cmd.x1 + t2 * cmd.x;
                        var ty = mt2 * lastY + 2 * mt * t * cmd.y1 + t2 * cmd.y;
                        currentPathData.push({ x: tx, y: ty });
                    }
                    lastX = cmd.x;
                    lastY = cmd.y;
                    break;

                case 'Z': // Close path
                    if (firstPoint && currentPathData.length > 0) {
                        if(firstPoint.x != currentPathData[currentPathData.length-1].x || firstPoint.y != currentPathData[currentPathData.length-1].y)
                            currentPathData.push(firstPoint);
                    }
                    break;
            }
        });

        // Add the last subpath if it exists, closing it if start and end are near
        if (currentPathData.length >= 2) {
            var last = currentPathData[currentPathData.length - 1];
            if (firstPoint && (last.x !== firstPoint.x || last.y !== firstPoint.y)) {
                var dist = Math.hypot(last.x - firstPoint.x, last.y - firstPoint.y);
                if (dist < 2) {
                    currentPathData.push(firstPoint);
                }
            }
            allPaths.push(currentPathData);
        }

        return allPaths;
    }

    _createSvgPathsFromSubpaths(allPaths, char, textGroupId, x, y, text, fontname, sizeInMM, pathIdMap = null, extraCreationProperties = null) {
        const createdPaths = [];
        let pathIdCounter = 0;

        // Find the largest path by bbox area to label as outer
        var largestArea = -1;
        var largestIdx = 0;
        for (var ai = 0; ai < allPaths.length; ai++) {
            var bb = boundingBox(allPaths[ai]);
            var area = (bb.maxx - bb.minx) * (bb.maxy - bb.miny);
            if (area > largestArea) {
                largestArea = area;
                largestIdx = ai;
            }
        }

        allPaths.forEach((pathData, pathIndex) => {
            pathData = clipper.JS.Lighten(pathData, getOption("tolerance") * viewScale);
            if (pathData.length > 0) {
                var pathType = pathIndex === largestIdx ? 'outer' : 'inner';

                // Reuse original ID and name if available (for updates), otherwise create new
                var pathId, pathName, isSelected, isVisible;
                if (pathIdMap && pathIdCounter < pathIdMap.length) {
                    pathId = pathIdMap[pathIdCounter].id;
                    pathName = pathIdMap[pathIdCounter].name;
                    isSelected = pathIdMap[pathIdCounter].selected;
                    isVisible = pathIdMap[pathIdCounter].visible;
                } else {
                    // Create new path
                    pathId = 'Text' + svgpathId;
                    pathName = 'Text_' + char + '_' + pathType + '_' + svgpathId;
                    isSelected = 1;
                    isVisible = true;
                    svgpathId++;
                }

                var svgPath = {
                    id: pathId,
                    type: 'path',
                    name: pathName,
                    selected: isSelected,
                    visible: isVisible !== false,
                    path: pathData,
                    bbox: boundingBox(pathData),
                    // Store creation properties for editing
                    creationTool: 'Text',
                    textGroupId: textGroupId,
                    creationProperties: {
                        text: text,
                        font: fontname,
                        fontSize: sizeInMM,
                        position: { x: x, y: y },
                        character: char,
                        pathType: pathType,
                        ...(extraCreationProperties || {})
                    }
                };

                createdPaths.push(svgPath);
                pathIdCounter++;
            }
        });

        return createdPaths;
    }

    addText(text, x, y, sizeInMM = 20, fontname, options = {}) {
        // Generate a unique group ID for all paths in this text
        const textGroupId = options.textGroupId || ('TextGroup' + Date.now());

        let fontUrl = fontname;

        return new Promise(resolve => {


            // Use opentype.js for local TTF fonts
            opentype.load(fontUrl, (err, font) => {
                if (err) {
                    console.error('Could not load font:', err);
                    var fontEntry = AVAILABLE_FONTS.find(f => f.value === fontname);
                    var displayName = fontEntry ? fontEntry.label : 'Unknown';
                    notify('Failed to load font "' + displayName + '". Check your internet connection.', 'error');
                    resolve(null);
                    return;
                }

                const createdPath = this.createTextPath(font, text, x, y, sizeInMM, fontname, textGroupId, options);
                redraw();
                resolve(createdPath);
            });
        });
    }

    // Compute scaled font size so capital 'H' matches sizeInMM in world units.
    _computeFontSize(font, sizeInMM) {
        const referenceBBox = font.charToGlyph('H').getBoundingBox();
        const referenceHeight = referenceBBox.y2 - referenceBBox.y1;
        return sizeInMM * viewScale * (font.unitsPerEm / referenceHeight);
    }

    _getTextLines(text) {
        const normalizedText = String(text ?? '');
        const lines = normalizedText.split(/\r?\n/);
        return lines.length > 0 ? lines : [''];
    }

    _getLineWidth(font, line, fontSize) {
        let width = 0;
        line.split('').forEach(char => {
            width += font.getAdvanceWidth(char, fontSize);
        });
        return width;
    }

    _getLineStartX(anchorX, lineWidth, align) {
        if (align === 'left') return anchorX;
        if (align === 'right') return anchorX - lineWidth;
        return anchorX - lineWidth / 2;
    }

    _getLineAdvance(font, fontSize, lineHeight) {
        const safeLineHeight = Number.isFinite(Number(lineHeight)) ? Number(lineHeight) : 1.2;
        return ((font.ascender - font.descender) / font.unitsPerEm) * fontSize * safeLineHeight;
    }

    _buildTextPaths(font, text, x, y, sizeInMM, fontname, textGroupId, pathIdMap = null, properties = {}) {
        const createdPaths = [];
        const fontSize = this._computeFontSize(font, sizeInMM);
        const lines = this._getTextLines(text);
        const align = properties.align || 'center';
        const lineHeight = Number(properties.lineHeight) || 1.2;
        const lineAdvance = this._getLineAdvance(font, fontSize, lineHeight);
        let reusedPathCount = 0;

        lines.forEach((line, lineIndex) => {
            const lineWidth = this._getLineWidth(font, line, fontSize);
            const lineY = y + lineIndex * lineAdvance;
            let currentX = this._getLineStartX(x, lineWidth, align);

            line.split('').forEach(char => {
                const fontPath = font.getPath(char, currentX, lineY, fontSize);
                const allPaths = this._processFontCommands(fontPath, currentX, lineY, fontname);
                const charPaths = this._createSvgPathsFromSubpaths(
                    allPaths,
                    char,
                    textGroupId,
                    x,
                    y,
                    text,
                    fontname,
                    sizeInMM,
                    pathIdMap ? pathIdMap.slice(reusedPathCount) : null,
                    {
                        align,
                        lineHeight,
                        lineIndex,
                        lineCount: lines.length
                    }
                );

                createdPaths.push(...charPaths);
                reusedPathCount += charPaths.length;
                currentX += font.getAdvanceWidth(char, fontSize);
            });
        });

        return createdPaths;
    }

    createTextPath(font, text, x, y, sizeInMM, fontname, textGroupId, options = {}) {
        if (options.skipUndo !== true) {
            addUndo(false, true, false);
        }
        const createdPaths = this._buildTextPaths(font, text, x, y, sizeInMM, fontname, textGroupId, null, this.properties);
        createdPaths.forEach(svgPath => {
            if (!svgPath.toolpathProperties) {
                svgPath.toolpathProperties = window.toolPathProperties?.getDefaultShapeCutProperties(this.getDefaultCutOperationName()) || null;
            }
            svgpaths.push(svgPath);
            selectMgr.selectPath(svgPath);
            if (typeof options.onCreated === 'function') {
                options.onCreated(svgPath);
            }
        });

        // Add the text group to sidebar after all paths are created
        const textPaths = svgpaths.filter(p => p.textGroupId === textGroupId);
        if (typeof addTextGroup === 'function' && textPaths.length > 0) {
            addTextGroup(textGroupId, text, textPaths);
        }

        // Set currentPath to enable immediate editing
        if (textPaths.length > 0) {
            this.currentPath = textPaths[0];
            const unifiedIds = this.getGroupPathIds(this.currentPath);
            textPaths.forEach(path => {
                path.svgId = unifiedIds[0] || path.id;
                path.svgIds = unifiedIds.slice();
            });
            if (typeof scheduleShapeMachiningToolpathSync === 'function' && options.delayPreviewSync !== true) {
                textPaths.forEach(path => scheduleShapeMachiningToolpathSync(path, { createIfMissing: true, delay: 0 }));
            }
        }

        return textPaths[0] || null;
    }

    // Update text paths in place
    updateTextInPlace(path) {
        // Find all paths that belong to this text creation
        const data = this.properties;
        if (path === undefined)
            path = this.currentPath;
        if (!path || !path.creationProperties) return;
        const relatedPaths = svgpaths.filter(p =>
            p.textGroupId === path.textGroupId
        );


        // Text or font changed, need to recreate paths
        if (typeof opentype !== 'undefined') {
            opentype.load(data.font, (err, font) => {
                if (err) {
                    var fontEntry = AVAILABLE_FONTS.find(f => f.value === data.font);
                    var displayName = fontEntry ? fontEntry.label : 'Unknown';
                    notify('Failed to load font "' + displayName + '". Check your internet connection.', 'error');
                    return;
                }
                if (font) {
                    this.updateTextPathsInPlace(relatedPaths, font, data);
                    redraw();
                }
            });
        }

    }

    // Update existing text paths without creating new ones
    updateTextPathsInPlace(textPaths, font, data) {
        const text = data.text;
        const sizeInMM = data.fontSize;
        const fontname = data.font;

        if (!textPaths.length) return;

        // Get position from the first path
        const position = textPaths[0].creationProperties.position;
        const x = position.x;
        const y = position.y;

        // Store original path IDs, names, textGroupId, and transformHistory to preserve them
        const textGroupId = textPaths[0].textGroupId || ('TextGroup' + Date.now());
        const originalPathIds = textPaths.map(p => p.id);
        const originalPaths = textPaths.map(p => ({
            id: p.id,
            name: p.name,
            selected: p.selected,
            visible: p.visible,
            toolpathProperties: p.toolpathProperties ? { ...p.toolpathProperties } : null,
            transformHistory: Array.isArray(p.transformHistory)
                ? p.transformHistory.map(t => ({ ...t }))
                : null
        }));

        // Find and remove toolpaths linked to any of the old text paths
        const linkedToolpaths = [];
        for (let i = toolpaths.length - 1; i >= 0; i--) {
            const tp = toolpaths[i];
            const tpIds = tp.svgIds || (tp.svgId ? [tp.svgId] : []);
            if (tpIds.some(id => originalPathIds.includes(id))) {
                linkedToolpaths.push({ operation: tp.operation, tool: { ...tp.tool }, toolpathProperties: tp.toolpathProperties ? { ...tp.toolpathProperties } : null });
                toolpaths.splice(i, 1);
                removeToolPath(tp.id);
            }
        }

        // Remove existing text paths from sidebar and array
        selectMgr.unselectAll();
        textPaths.forEach(textPath => {
            const pathIndex = svgpaths.findIndex(p => p.id === textPath.id);
            if (pathIndex !== -1) {
                removeSvgPath(textPath.id);
                svgpaths.splice(pathIndex, 1);
            }
        });

        const recreatedPaths = this._buildTextPaths(font, text, x, y, sizeInMM, fontname, textGroupId, originalPaths, data);
        let firstCreatedPath = null;

        recreatedPaths.forEach((svgPath, index) => {
            const originalMeta = originalPaths[index];
            if (originalMeta?.transformHistory?.length) {
                svgPath.transformHistory = originalMeta.transformHistory.map(t => ({ ...t }));
                applyTransformHistory(svgPath);
            }
            if (originalMeta?.toolpathProperties) {
                svgPath.toolpathProperties = { ...originalMeta.toolpathProperties };
            } else if (!svgPath.toolpathProperties) {
                svgPath.toolpathProperties = window.toolPathProperties?.getDefaultShapeCutProperties(this.getDefaultCutOperationName()) || null;
            }
            svgpaths.push(svgPath);
            selectMgr.selectPath(svgPath);
            if (!firstCreatedPath) {
                firstCreatedPath = svgPath;
            }
        });

        this.currentPath = firstCreatedPath;

        // Add the updated text group to sidebar
        const updatedTextPaths = svgpaths.filter(p => p.textGroupId === textGroupId);
        if (updatedTextPaths.length > 0) {
            addTextGroup(textGroupId, text, updatedTextPaths);
        }

        // Re-run linked toolpath operations on the new text paths
        if (linkedToolpaths.length > 0 && updatedTextPaths.length > 0) {
            selectMgr.unselectAll();
            updatedTextPaths.forEach(p => selectMgr.selectPath(p));

            for (const lt of linkedToolpaths) {
                const originalTool = window.currentTool;
                window.currentTool = lt.tool;
                window.currentToolpathProperties = lt.toolpathProperties;
                // Normalize operation names (e.g. 'VCarve In'/'VCarve Out' -> 'VCarve')
                let opName = lt.operation;
                if (opName === 'VCarve In' || opName === 'VCarve Out') opName = 'VCarve';
                try {
                    handleOperationClick(opName);
                } finally {
                    window.currentTool = originalTool;
                    window.currentToolpathProperties = null;
                }
            }
        } else if (typeof scheduleShapeMachiningToolpathSync === 'function') {
            updatedTextPaths.forEach(updatedPath => {
                if (updatedPath.toolpathProperties) {
                    scheduleShapeMachiningToolpathSync(updatedPath, { createIfMissing: true, delay: 0 });
                }
            });
        }

        const unifiedIds = this.getGroupPathIds(this.currentPath);
        updatedTextPaths.forEach(updatedPath => {
            updatedPath.svgId = unifiedIds[0] || updatedPath.id;
            updatedPath.svgIds = unifiedIds.slice();
        });

        redraw();
    }


}
