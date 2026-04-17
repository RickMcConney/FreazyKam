class PatternOpp extends Select {
    constructor() {
        super('Pattern', 'grid-3x3');
        this.name = 'Pattern';
        this.icon = 'grid-3x3';
        this.tooltip = 'Create linear or circular arrays of selected paths';

        // Field specs
        this.fields = {
            type:        { key: 'type',        label: 'Pattern Type', type: 'choice',    default: 'linear',
                           options: [{ value: 'linear', label: 'Linear Grid' }, { value: 'circular', label: 'Circular Array' }] },
            cols:        { key: 'cols',        label: 'Columns',      type: 'number',    default: 2,   min: 1, max: 100, integer: true },
            rows:        { key: 'rows',        label: 'Rows',         type: 'number',    default: 1,   min: 1, max: 100, integer: true },
            spacingX:    { key: 'spacingX',    label: 'Spacing X',    type: 'dimension', default: 50 },
            spacingY:    { key: 'spacingY',    label: 'Spacing Y',    type: 'dimension', default: 50 },
            count:       { key: 'count',       label: 'Count',        type: 'number',    default: 6,   min: 2, max: 100, integer: true },
            radius:      { key: 'radius',      label: 'Radius',       type: 'dimension', default: 50 },
            startAngle:  { key: 'startAngle',  label: 'Start Angle',  type: 'number',    default: 0,   min: 0, max: 360 },
            fullCircle:  { key: 'fullCircle',  label: 'Full Circle',  type: 'checkbox',  default: true },
            endAngle:    { key: 'endAngle',    label: 'End Angle',    type: 'number',    default: 360, min: 0, max: 360 },
            rotateItems: { key: 'rotateItems', label: 'Rotate Items', type: 'checkbox',  default: true }
        };

        this.properties = {
            type: 'linear', rows: 1, cols: 2, spacingX: 50, spacingY: 50,
            count: 6, radius: 50, startAngle: 0, fullCircle: true, endAngle: 360, rotateItems: true
        };
        this.currentPath = null;
        this.generatedIds = [];
        this.sourceIds = [];
        this.groupId = null;
    }

    // ── Pattern generation ─────────────────────────────────────────────────

    applyPattern() {
        var selected = selectMgr.selectedPaths();
        if (selected.length === 0) {
            notify("Select at least one path to pattern");
            return;
        }

        var patternType = this.properties.type;

        var sourcePaths;
        var isReapply = this.currentPath && this.currentPath.creationTool === 'Pattern' && this.currentPath.creationProperties.sourceIds;
        if (isReapply) {
            var srcIds = this.currentPath.creationProperties.sourceIds;
            sourcePaths = svgpaths.filter(p => srcIds.includes(p.id));
            if (sourcePaths.length === 0) sourcePaths = selected;
        } else {
            sourcePaths = selected;
        }

        var sourceIds = sourcePaths.map(p => p.id);
        addUndo(false, true, false, sourceIds);

        this.readPropertiesFromForm(patternType);

        var pathDataList = patternType === 'linear'
            ? this.generateLinearPaths(sourcePaths)
            : this.generateCircularPaths(sourcePaths);

        var creationProps = {
            type: patternType,
            sourceIds,
            rows: this.properties.rows,
            cols: this.properties.cols,
            spacingX: this.properties.spacingX,
            spacingY: this.properties.spacingY,
            count: this.properties.count,
            radius: this.properties.radius,
            startAngle: this.properties.startAngle,
            fullCircle: this.properties.fullCircle,
            endAngle: this.properties.endAngle,
            rotateItems: this.properties.rotateItems
        };

        var existingIds = isReapply ? this.generatedIds : [];
        var existingPaths = existingIds.map(id => svgpaths.find(p => p.id === id)).filter(Boolean);
        var newGeneratedIds = [];
        var groupId = this.groupId || ('pattern-group-' + svgpathId);

        for (var i = 0; i < pathDataList.length; i++) {
            if (i < existingPaths.length) {
                existingPaths[i].path = pathDataList[i].path;
                existingPaths[i].bbox = boundingBox(pathDataList[i].path);
                existingPaths[i].creationProperties = creationProps;
                existingPaths[i].patternGroupId = groupId;
                newGeneratedIds.push(existingPaths[i].id);
            } else {
                var svgPath = {
                    id: 'Pattern' + svgpathId,
                    type: 'path',
                    name: 'Pattern ' + svgpathId,
                    visible: true,
                    selected: false,
                    closed: pathDataList[i].closed,
                    path: pathDataList[i].path,
                    bbox: boundingBox(pathDataList[i].path),
                    creationTool: 'Pattern',
                    creationProperties: creationProps,
                    patternGroupId: groupId
                };
                svgpaths.push(svgPath);
                newGeneratedIds.push(svgPath.id);
                svgpathId++;
            }
        }

        for (var i = pathDataList.length; i < existingPaths.length; i++) {
            var idx = svgpaths.indexOf(existingPaths[i]);
            if (idx >= 0) svgpaths.splice(idx, 1);
        }

        this.generatedIds = newGeneratedIds;
        this.sourceIds = sourceIds;
        this.groupId = groupId;

        if (newGeneratedIds.length > 0) {
            this.currentPath = svgpaths.find(p => p.id === newGeneratedIds[0]);
        }

        var groupName = patternType === 'linear'
            ? `${this.properties.cols}x${this.properties.rows} Grid`
            : `${this.properties.count}x Circular`;
        var groupPaths = newGeneratedIds.map(id => svgpaths.find(p => p.id === id)).filter(Boolean);

        var el = document.querySelector(`[data-pattern-group-id="${groupId}"]`);
        if (el) el.remove();

        addPatternGroup(groupId, groupName, 'grid-3x3', groupPaths, 'Pattern');

        selectMgr.unselectAll();
        for (var i = 0; i < sourcePaths.length; i++) {
            selectMgr.selectPath(sourcePaths[i]);
        }

        redraw();
    }

    readPropertiesFromForm(patternType) {
        this.properties.type = patternType;
        if (patternType === 'linear') {
            const values = PropertiesManager.collectValues([
                this.fields.cols, this.fields.rows, this.fields.spacingX, this.fields.spacingY
            ]);
            Object.assign(this.properties, values);
        } else {
            const values = PropertiesManager.collectValues([
                this.fields.count, this.fields.radius, this.fields.startAngle,
                this.fields.fullCircle, this.fields.endAngle, this.fields.rotateItems
            ]);
            Object.assign(this.properties, values);
        }
    }

    generateLinearPaths(sourcePaths) {
        var rows = this.properties.rows;
        var cols = this.properties.cols;
        var spacingXWorld = this.properties.spacingX * viewScale;
        var spacingYWorld = this.properties.spacingY * viewScale;
        var result = [];

        for (var s = 0; s < sourcePaths.length; s++) {
            var srcPath = sourcePaths[s].path;
            for (var row = 0; row < rows; row++) {
                for (var col = 0; col < cols; col++) {
                    if (row === 0 && col === 0) continue;
                    var newPath = srcPath.map(pt => ({ x: pt.x + col * spacingXWorld, y: pt.y + row * spacingYWorld }));
                    result.push({ path: newPath, closed: sourcePaths[s].closed });
                }
            }
        }
        return result;
    }

    generateCircularPaths(sourcePaths) {
        var count = this.properties.count;
        var radiusWorld = this.properties.radius * viewScale;
        var startAngle = this.properties.startAngle;
        var fullCircle = this.properties.fullCircle;
        var endAngle = this.properties.endAngle;
        var rotateItems = this.properties.rotateItems;

        var angleSpan = fullCircle ? 360 : (endAngle - startAngle);
        var angleStep = angleSpan / (fullCircle ? count : Math.max(count - 1, 1));
        var result = [];

        for (var s = 0; s < sourcePaths.length; s++) {
            var srcPath = sourcePaths[s].path;
            var srcBbox = sourcePaths[s].bbox;
            var srcCenterX = (srcBbox.minx + srcBbox.maxx) / 2;
            var srcCenterY = (srcBbox.miny + srcBbox.maxy) / 2;

            for (var n = 1; n < count; n++) {
                var angle = startAngle + n * angleStep;
                var angleRad = angle * Math.PI / 180;
                var dx = radiusWorld * Math.cos(angleRad) - radiusWorld * Math.cos(startAngle * Math.PI / 180);
                var dy = radiusWorld * Math.sin(angleRad) - radiusWorld * Math.sin(startAngle * Math.PI / 180);

                var newPath = [];
                for (var i = 0; i < srcPath.length; i++) {
                    var px = srcPath[i].x;
                    var py = srcPath[i].y;
                    if (rotateItems) {
                        var rx = px - srcCenterX;
                        var ry = py - srcCenterY;
                        var rotAngle = n * angleStep * Math.PI / 180;
                        px = srcCenterX + rx * Math.cos(rotAngle) - ry * Math.sin(rotAngle);
                        py = srcCenterY + rx * Math.sin(rotAngle) + ry * Math.cos(rotAngle);
                    }
                    newPath.push({ x: px + dx, y: py + dy });
                }
                result.push({ path: newPath, closed: sourcePaths[s].closed });
            }
        }
        return result;
    }

    // ── Edit path support ──────────────────────────────────────────────────

    setEditPath(path) {
        this.currentPath = path;
        if (path && path.creationProperties) {
            this.loadPropertiesFromPath(path);
            if (path.patternGroupId) {
                this.groupId = path.patternGroupId;
                this.generatedIds = svgpaths
                    .filter(p => p.patternGroupId === path.patternGroupId)
                    .map(p => p.id);
            }
            if (path.creationProperties.sourceIds) {
                this.sourceIds = path.creationProperties.sourceIds;
            }
        }
    }

    update(path) {
        if (path && path.creationProperties) {
            this.loadPropertiesFromPath(path);
        }
    }

    loadPropertiesFromPath(path) {
        var cp = path.creationProperties;
        this.properties.type        = cp.type        ?? 'linear';
        this.properties.rows        = cp.rows        ?? 1;
        this.properties.cols        = cp.cols        ?? 2;
        this.properties.spacingX    = cp.spacingX    ?? 50;
        this.properties.spacingY    = cp.spacingY    ?? 50;
        this.properties.count       = cp.count       ?? 6;
        this.properties.radius      = cp.radius      ?? 50;
        this.properties.startAngle  = cp.startAngle  ?? 0;
        this.properties.fullCircle  = cp.fullCircle  ?? true;
        this.properties.endAngle    = cp.endAngle    ?? 360;
        this.properties.rotateItems = cp.rotateItems ?? true;
    }

    // ── Properties panel ──────────────────────────────────────────────────

    getPropertiesHTML(path) {
        const pathProps = this.currentPath?.creationProperties ?? null;
        const lastUsed  = this.properties;
        const rv = (field) => PropertiesManager.resolveValue(field, pathProps, lastUsed);
        const fh = (field) => PropertiesManager.fieldHTML(field, rv(field));

        const type           = rv(this.fields.type);
        const linearDisplay  = type === 'linear'   ? 'block' : 'none';
        const circularDisplay= type === 'circular' ? 'block' : 'none';
        const endAngleDisplay= rv(this.fields.fullCircle) ? 'none' : 'block';

        return `
            <div class="alert alert-info mb-3">
                <strong>Pattern Tool</strong><br>
                Create linear or circular arrays of selected paths
            </div>
            ${fh(this.fields.type)}

            <div id="linear-properties" style="display: ${linearDisplay};">
                ${fh(this.fields.cols)}
                ${fh(this.fields.rows)}
                ${fh(this.fields.spacingX)}
                ${fh(this.fields.spacingY)}
            </div>

            <div id="circular-properties" style="display: ${circularDisplay};">
                ${fh(this.fields.count)}
                ${fh(this.fields.radius)}
                ${fh(this.fields.startAngle)}
                ${fh(this.fields.fullCircle)}
                <div id="end-angle-group" style="display: ${endAngleDisplay};">
                    ${fh(this.fields.endAngle)}
                </div>
                ${fh(this.fields.rotateItems)}
            </div>

            <div class="mb-3">
                <button type="button" class="btn btn-primary btn-sm w-100" id="pattern-apply-button"
                        onclick="cncController.operationManager.currentOperation.applyPattern()">
                    <i data-lucide="check"></i> Apply Pattern
                </button>
                <div class="form-text small">Select paths, configure pattern, then click Apply</div>
            </div>`;
    }

    onPropertiesChanged(data) {
        const type = data.type ?? this.properties.type;

        // Toggle section visibility
        const linearEl   = document.getElementById('linear-properties');
        const circularEl = document.getElementById('circular-properties');
        if (linearEl)   linearEl.style.display   = type === 'linear'   ? 'block' : 'none';
        if (circularEl) circularEl.style.display = type === 'circular' ? 'block' : 'none';

        // Collect all field values (only present fields will return values)
        const allFields = Object.values(this.fields);
        const values = PropertiesManager.collectValues(allFields);
        this.properties = { ...this.properties, ...values };

        // Toggle end-angle visibility based on fullCircle
        const endAngleGroup = document.getElementById('end-angle-group');
        if (endAngleGroup) endAngleGroup.style.display = this.properties.fullCircle ? 'none' : 'block';

        super.onPropertiesChanged(data);
    }

    stop() {
        this.currentPath = null;
        this.generatedIds = [];
        this.sourceIds = [];
        this.groupId = null;
    }
}
