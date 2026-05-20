const TEXT_EDIT_HANDLE_SIZE = SHAPE_EDIT_HANDLE_SIZE;
const TEXT_EDIT_HANDLE_HIT_RADIUS = SHAPE_EDIT_HANDLE_HIT_RADIUS;
const TEXT_EDIT_ROTATE_OFFSET_PX = SHAPE_EDIT_ROTATE_OFFSET_PX;
const TEXT_EDIT_ROTATION_SNAP_DEG = SHAPE_EDIT_ROTATION_SNAP_DEG;
const TEXT_MIN_SIZE = MIN_SHAPE_SIZE;

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
            options: AVAILABLE_FONTS.map(f => ({
                value: f.value,
                label: f.label,
                previewFamily: f.previewFamily || f.label
            }))
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
            type: 'choice',
            default: 1.2,
            options: [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2].map(value => ({
                value,
                label: String(value)
            }))
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

    start() {
        this.getProperties();
        this.currentPath = null;
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

    onMouseDown(canvas, evt) {
        if (!this.currentPath) return;

        console.debug('[Text.onMouseDown]', {
            currentPath: this.currentPath?.id || null,
            targetTag: evt.target?.tagName || null,
            targetId: evt.target?.id || null
        });

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
            console.debug('[Text.onMouseDown] handle hit', editHandle.id);
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
        if (clickedPath === this.currentPath) {
            console.debug('[Text.onMouseDown] drag current path');
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

        if (clickedPath !== this.currentPath) {
            this.stop();
            showToolsList();
            redraw();
        }
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

        const editedPath = this.currentPath;
        const shouldSyncMachining = this.textChangedDuringDrag;

        this.mouseDown = false;
        this.activeHandle = null;
        this.hoverHandle = null;
        this.initialHandleProperties = null;
        this.dragStartMouse = null;
        this.isDraggingText = false;
        this.textChangedDuringDrag = false;

        if (shouldSyncMachining && editedPath.toolpathProperties && typeof scheduleShapeMachiningToolpathSync === 'function') {
            scheduleShapeMachiningToolpathSync(editedPath, { createIfMissing: true, delay: 0 });
        }
    }

    draw(ctx) {
        if (!this.currentPath) return;
        if (this.isObjectLocked()) return;
        this.drawEditOverlay(ctx);
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

    getPropertiesHTML() {
        const pathProperties = this.currentPath?.creationProperties ?? null;
        if (!pathProperties) this.getProperties();
        return `
            <div class="alert alert-info mb-3">
                <strong>Text Tool</strong><br>
                Create text paths using TTF fonts
            </div>
            ${PropertiesManager.formHTML(this._fields(), pathProperties, this.properties)}`;
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

    getPathTextProperties(path) {
        const creationProperties = path?.creationProperties || {};
        const bbox = path?.bbox || (path?.path ? boundingBox(path.path) : null);
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
            rotation: Array.isArray(path?.transformHistory)
                ? path.transformHistory.reduce((sum, transform) => sum + (transform.rotation || 0), 0)
                : 0,
            lockRatio: creationProperties.lockRatio ?? this.properties.lockRatio ?? true,
            lockObject: this.isObjectLocked(path)
        };
    }

    renderGeometryFields(pathProperties = null) {
        const values = pathProperties || this.getPathTextProperties(this.currentPath);
        return `
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
            onCreated: createdPath => {
                if (!createdPath || typeof openPathEditor !== 'function') return;
                openPathEditor(createdPath);
            }
        });
    }

    updateFromProperties(data, options = {}) {
        this.onPropertiesChanged(data, options);
    }

    update(path) {
        if (!path) return;
        this.properties = {
            ...this.properties,
            ...this.getPathTextProperties(path)
        };
    }

    updateInPlace(svgPath, data) {
        if (!svgPath) return;
        this.setEditPath(svgPath);
        this.onPropertiesChanged(data || {}, {
            changedKey: null
        });
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
            if (options.immediateTextUpdate === true) {
                this.updateTextInPlace(this.currentPath);
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

    applyGeometryProperties(values, changedKey = null) {
        const targetPath = this.currentPath;
        if (!targetPath) return;

        const bbox = targetPath.bbox || (targetPath.path ? boundingBox(targetPath.path) : null);
        if (!bbox) return;

        const centerX = (bbox.minx + bbox.maxx) / 2;
        const centerY = (bbox.miny + bbox.maxy) / 2;
        const currentWidth = Math.max(Number.EPSILON, this.toExternal(bbox.maxx - bbox.minx));
        const currentHeight = Math.max(Number.EPSILON, this.toExternal(bbox.maxy - bbox.miny));
        const currentRotation = Array.isArray(targetPath.transformHistory)
            ? targetPath.transformHistory.reduce((sum, transform) => sum + (transform.rotation || 0), 0)
            : 0;
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

        targetPath.path = targetPath.path.map(point => {
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

        targetPath.bbox = boundingBox(targetPath.path);
        targetPath.locked = lockObject;
        targetPath.creationProperties = {
            ...targetPath.creationProperties,
            lockRatio,
            lockObject
        };
        if (!Array.isArray(targetPath.transformHistory)) {
            targetPath.transformHistory = [];
        }
        targetPath.transformHistory.push({
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
            rotatePointAround({ x: centerX - halfWidth, y: centerY - halfHeight }, centerX, centerY, angleRad),
            rotatePointAround({ x: centerX + halfWidth, y: centerY - halfHeight }, centerX, centerY, angleRad),
            rotatePointAround({ x: centerX + halfWidth, y: centerY + halfHeight }, centerX, centerY, angleRad),
            rotatePointAround({ x: centerX - halfWidth, y: centerY + halfHeight }, centerX, centerY, angleRad)
        ];
    }

    getEditHandles() {
        const geometry = this.getEditGeometry();
        if (!geometry) return [];

        const outline = this.getEditOutlinePoints();
        const topMid = rotatePointAround(
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

        let width = Math.max(TEXT_MIN_SIZE, this.toExternal(Math.abs(localX) * 2));
        let height = Math.max(TEXT_MIN_SIZE, this.toExternal(Math.abs(localY) * 2));

        if (properties.lockRatio) {
            const lockedDimensions = getLockedDimensionsFromBounds(
                width,
                height,
                this.getReferenceAspectRatio(this.initialHandleProperties, properties)
            );
            width = lockedDimensions.width;
            height = lockedDimensions.height;
        }

        this.applyGeometryProperties(
            { ...properties, width, height },
            Math.abs(localX) >= Math.abs(localY) ? 'width' : 'height'
        );
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

    _saveTextOptions(text, font, sizeInMM, align, lineHeight) {
        if (typeof setOption !== 'undefined') {
            setOption('textFontSize', sizeInMM);
            if (font) {
                setOption('textFont', font);
            }
            if (text !== undefined) {
                setOption('textSample', text);
            }
            if (align) {
                setOption('textAlign', align);
            }
            if (lineHeight !== undefined && lineHeight !== null) {
                setOption('textLineHeight', lineHeight);
            }
            if (this.properties.lockRatio !== undefined) {
                setOption('textLockRatio', this.properties.lockRatio);
            }
        }
    }

    _clearPendingUpdate() {
        if (this.pendingUpdateTimer) {
            clearTimeout(this.pendingUpdateTimer);
            this.pendingUpdateTimer = null;
        }
    }

    _scheduleTextUpdate() {
        if (!this.currentPath) return;

        this._clearPendingUpdate();
        this.pendingUpdateTimer = setTimeout(() => {
            this.pendingUpdateTimer = null;
            addUndo(false, true, false);
            this.updateTextInPlace(this.currentPath);
        }, 120);
    }

    _processFontCommands(fontPath) {
        var currentPathData = [];
        var allPaths = [];
        var lastX = 0;
        var lastY = 0;
        var firstPoint = null;

        fontPath.commands.forEach(function (cmd) {
            switch (cmd.type) {
                case 'M':
                    if (currentPathData.length >= 2) {
                        var last = currentPathData[currentPathData.length - 1];
                        if (firstPoint && (last.x !== firstPoint.x || last.y !== firstPoint.y)) {
                            var dist = Math.hypot(last.x - firstPoint.x, last.y - firstPoint.y);
                            if (dist < 2) {
                                currentPathData.push(firstPoint);
                            }
                        }
                        allPaths.push([...currentPathData]);
                    }
                    currentPathData = [];
                    firstPoint = { x: cmd.x, y: cmd.y };
                    currentPathData.push(firstPoint);
                    lastX = cmd.x;
                    lastY = cmd.y;
                    break;

                case 'L':
                    if (firstPoint.x == cmd.x && firstPoint.y == cmd.y)
                        currentPathData.push(firstPoint);
                    else
                        currentPathData.push({ x: cmd.x, y: cmd.y });
                    lastX = cmd.x;
                    lastY = cmd.y;
                    break;

                case 'C': {
                    var startIndexC = (currentPathData.length === 0) ? 0 : 1;
                    var stepsC = 10;
                    for (var iC = startIndexC; iC <= stepsC; iC++) {
                        var tC = iC / stepsC;
                        var mtC = 1 - tC, mt2C = mtC * mtC, mt3C = mt2C * mtC;
                        var t2C = tC * tC, t3C = t2C * tC;
                        var txC = mt3C * lastX + 3 * mt2C * tC * cmd.x1 + 3 * mtC * t2C * cmd.x2 + t3C * cmd.x;
                        var tyC = mt3C * lastY + 3 * mt2C * tC * cmd.y1 + 3 * mtC * t2C * cmd.y2 + t3C * cmd.y;
                        currentPathData.push({ x: txC, y: tyC });
                    }
                    lastX = cmd.x;
                    lastY = cmd.y;
                    break;
                }

                case 'Q': {
                    var startIndexQ = (currentPathData.length === 0) ? 0 : 1;
                    var stepsQ = 10;
                    for (var iQ = startIndexQ; iQ <= stepsQ; iQ++) {
                        var tQ = iQ / stepsQ;
                        var mtQ = 1 - tQ, mt2Q = mtQ * mtQ, t2Q = tQ * tQ;
                        var txQ = mt2Q * lastX + 2 * mtQ * tQ * cmd.x1 + t2Q * cmd.x;
                        var tyQ = mt2Q * lastY + 2 * mtQ * tQ * cmd.y1 + t2Q * cmd.y;
                        currentPathData.push({ x: txQ, y: tyQ });
                    }
                    lastX = cmd.x;
                    lastY = cmd.y;
                    break;
                }

                case 'Z':
                    if (firstPoint && currentPathData.length > 0) {
                        if (firstPoint.x != currentPathData[currentPathData.length - 1].x || firstPoint.y != currentPathData[currentPathData.length - 1].y)
                            currentPathData.push(firstPoint);
                    }
                    break;
            }
        });

        if (currentPathData.length >= 2) {
            var lastFinal = currentPathData[currentPathData.length - 1];
            if (firstPoint && (lastFinal.x !== firstPoint.x || lastFinal.y !== firstPoint.y)) {
                var distFinal = Math.hypot(lastFinal.x - firstPoint.x, lastFinal.y - firstPoint.y);
                if (distFinal < 2) {
                    currentPathData.push(firstPoint);
                }
            }
            allPaths.push(currentPathData);
        }

        return allPaths;
    }

    _createSvgPathsFromSubpaths(allPaths, char, x, y, text, fontname, sizeInMM, pathIdMap = null, extraCreationProperties = null) {
        const createdPaths = [];
        let pathIdCounter = 0;

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
            pathData = clipper.JS.Lighten(pathData, getOption('tolerance') * viewScale);
            if (pathData.length > 0) {
                var pathType = pathIndex === largestIdx ? 'outer' : 'inner';

                var pathId, pathName, isSelected, isVisible;
                if (pathIdMap && pathIdCounter < pathIdMap.length) {
                    pathId = pathIdMap[pathIdCounter].id;
                    pathName = pathIdMap[pathIdCounter].name;
                    isSelected = pathIdMap[pathIdCounter].selected;
                    isVisible = pathIdMap[pathIdCounter].visible;
                } else {
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
                    creationTool: 'Text',
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
        let fontUrl = fontname;

        return new Promise(resolve => {
            opentype.load(fontUrl, (err, font) => {
                if (err) {
                    console.error('Could not load font:', err);
                    var fontEntry = AVAILABLE_FONTS.find(f => f.value === fontname);
                    var displayName = fontEntry ? fontEntry.label : 'Unknown';
                    notify('Failed to load font "' + displayName + '". Check your internet connection.', 'error');
                    resolve(null);
                    return;
                }

                const createdPath = this.createTextPath(font, text, x, y, sizeInMM, fontname, options);
                redraw();
                resolve(createdPath);
            });
        });
    }

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

    _buildTextPaths(font, text, x, y, sizeInMM, fontname, pathIdMap = null, properties = {}) {
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
                const allPaths = this._processFontCommands(fontPath);
                const charPaths = this._createSvgPathsFromSubpaths(
                    allPaths,
                    char,
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
                        lineCount: lines.length,
                        lockRatio: properties.lockRatio,
                        lockObject: properties.lockObject
                    }
                );

                createdPaths.push(...charPaths);
                reusedPathCount += charPaths.length;
                currentX += font.getAdvanceWidth(char, fontSize);
            });
        });

        return createdPaths;
    }

    createTextPath(font, text, x, y, sizeInMM, fontname, options = {}) {
        if (options.skipUndo !== true) {
            addUndo(false, true, false);
        }
        const createdPaths = this._buildTextPaths(font, text, x, y, sizeInMM, fontname, null, this.properties);
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

        if (createdPaths.length > 0) {
            this.currentPath = createdPaths[0];
            createdPaths.forEach(path => {
                path.svgId = path.id;
                path.svgIds = [path.id];
            });
            if (typeof scheduleShapeMachiningToolpathSync === 'function' && options.delayPreviewSync !== true) {
                createdPaths.forEach(path => {
                    scheduleShapeMachiningToolpathSync(path, { createIfMissing: true, delay: 0 });
                });
            }
        }

        return createdPaths[0] || null;
    }

    updateTextInPlace(path) {
        const data = this.properties;
        if (path === undefined)
            path = this.currentPath;
        if (!path || !path.creationProperties) return;
        const relatedPaths = [path];

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

    updateTextPathsInPlace(textPaths, font, data) {
        const text = data.text;
        const sizeInMM = data.fontSize;
        const fontname = data.font;

        if (!textPaths.length) return;

        const position = textPaths[0].creationProperties.position;
        const x = position.x;
        const y = position.y;

        const originalPathIds = textPaths.map(p => p.id);
        const originalPaths = textPaths.map(p => ({
            id: p.id,
            name: p.name,
            selected: p.selected,
            visible: p.visible,
            toolpathProperties: p.toolpathProperties ? { ...p.toolpathProperties } : null
        }));

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

        selectMgr.unselectAll();
        textPaths.forEach(textPath => {
            const pathIndex = svgpaths.findIndex(p => p.id === textPath.id);
            if (pathIndex !== -1) {
                removeSvgPath(textPath.id);
                svgpaths.splice(pathIndex, 1);
            }
        });

        const recreatedPaths = this._buildTextPaths(font, text, x, y, sizeInMM, fontname, originalPaths, data);
        let firstCreatedPath = null;

        recreatedPaths.forEach((svgPath, index) => {
            const originalMeta = originalPaths[index];
            if (Array.isArray(textPaths[index]?.transformHistory) && textPaths[index].transformHistory.length > 0) {
                svgPath.transformHistory = textPaths[index].transformHistory.map(transform => ({ ...transform }));
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

        if (linkedToolpaths.length > 0 && recreatedPaths.length > 0) {
            selectMgr.unselectAll();
            recreatedPaths.forEach(p => selectMgr.selectPath(p));

            for (const lt of linkedToolpaths) {
                const originalTool = window.currentTool;
                window.currentTool = lt.tool;
                window.currentToolpathProperties = lt.toolpathProperties;
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
            recreatedPaths.forEach(updatedPath => {
                if (updatedPath.toolpathProperties) {
                    scheduleShapeMachiningToolpathSync(updatedPath, { createIfMissing: true, delay: 0 });
                }
            });
        }

        recreatedPaths.forEach(updatedPath => {
            updatedPath.svgId = updatedPath.id;
            updatedPath.svgIds = [updatedPath.id];
        });

        redraw();
    }
}
