/**
 * Simplified toolpath property model.
 *
 * The floating popup now exposes only the minimal persisted fields required by
 * operations (`tool`, `depth`, `operationType`). Advanced machining settings are edited
 * separately via the Cut settings panel and resolved transiently when toolpaths
 * are generated or updated.
 */
class ToolPathProperties {
    constructor() {
        this._advancedDefaults = {
            direction: 'auto',
            plunge: 'vertical',
            strategy: 'adaptive'
        };

        this._operationMeta = {
            Profile: {
                label: 'Cut',
                description: 'Cut the selected shape using the chosen path side.',
                noToolMsg: 'Please add an End Mill, Ball Nose, or VBit in the tool library.',
                defaultOperationType: 'none',
                operationTypeOptions: [
                    { value: 'none', label: 'None' },
                    //{ value: 'vcarve', label: 'VCarve' },
                    { value: 'pocket', label: 'Clear out a pocket' },
                    { value: 'center', label: 'Cut on shape path' },
                    { value: 'outside', label: 'Cut outside shape path' },
                    { value: 'inside', label: 'Cut inside shape path' }
                ],
                compatibleBits: ['End Mill', 'Ball Nose', 'VBit']
            },
            Pocket: {
                label: 'Cut',
                description: 'Clear material inside the selected shape.',
                noToolMsg: 'Please add an End Mill or Ball Nose in the tool library.',
                defaultOperationType: 'pocket',
                operationTypeOptions: [
                    { value: 'pocket', label: 'Clear out a pocket' }
                ],
                compatibleBits: ['End Mill', 'Ball Nose']
            },
            Drill: {
                label: 'Cut',
                description: 'Drill the selected points or circles.',
                noToolMsg: 'Please add a Drill or End Mill in the tool library.',
                defaultOperationType: 'drill',
                operationTypeOptions: [
                    { value: 'drill', label: 'Cut on shape path' }
                ],
                compatibleBits: ['Drill', 'End Mill']
            },
            VCarve: {
                label: 'Cut',
                description: 'V-carve the selected shape.',
                noToolMsg: 'Please add a VBit in the tool library.',
                defaultOperationType: 'pocket',
                operationTypeOptions: [
                    { value: 'pocket', label: 'Clear out a pocket' },
                    { value: 'inside', label: 'Cut inside shape path' },
                    { value: 'outside', label: 'Cut outside shape path' },
                    { value: 'center', label: 'Cut on shape path' }
                ],
                compatibleBits: ['VBit']
            }
        };
    }

    hasOperation(operationName) {
        return operationName in this._operationMeta;
    }

    getMeta(operationName) {
        return this._operationMeta[operationName] || null;
    }

    getCompatibleTools(operationName) {
        const compatibleBits = this._operationMeta[operationName]?.compatibleBits || [];
        return (window.tools || []).filter(tool => compatibleBits.includes(tool.bit));
    }

    getToolById(toolId) {
        const numericId = Number(toolId);
        return (window.tools || []).find(tool => Number(tool.recid) === numericId) || null;
    }

    _getWorkpieceThickness() {
        return typeof getOption === 'function' ? Number(getOption('workpieceThickness')) || 10 : 10;
    }

    _getSafeDefaultToolId(operationName) {
        const compatibleTools = this.getCompatibleTools(operationName);
        return compatibleTools[0]?.recid ?? null;
    }

    getAdvancedDefaults(operationName) {
        const compatibleToolId = this._getSafeDefaultToolId(operationName);
        const saved = PropertiesManager.loadSaved(`${operationName}.cutSettings`);
        return {
            tool: compatibleToolId,
            direction: this._advancedDefaults.direction,
            plunge: this._advancedDefaults.plunge,
            strategy: this._advancedDefaults.strategy,
            ...saved,
            tool: saved.tool ?? compatibleToolId
        };
    }

    getDefaults(operationName) {
        const thickness = this._getWorkpieceThickness();
        const defaultDepth = thickness / 2;
        const saved = PropertiesManager.loadSaved(operationName);
        const advanced = this.getAdvancedDefaults(operationName);
        const savedOperationType = saved.operationType
            || (saved.operation === 'Pocket' ? 'pocket' : null)
            || (saved.operation === 'VCarve' ? 'vcarve' : null);
        const defaultOperationType = this._operationMeta[operationName]?.defaultOperationType
            || this._operationMeta[operationName]?.operationTypeOptions?.[0]?.value
            || 'center';
        const defaults = {
            depth: defaultDepth,
            extraDepth: 0,
            operationType: savedOperationType || defaultOperationType,
            ...saved,
            tool: advanced.tool
        };

        defaults.depth = defaultDepth;
        return defaults;
    }

    saveDefaults(operationName, values) {
        const persisted = sanitizeToolpathProperties(values);
        if (persisted) {
            PropertiesManager.save(operationName, persisted, this.getFields(operationName));
        }
    }

    saveAdvancedDefaults(operationName, values) {
        PropertiesManager.save(`${operationName}.cutSettings`, values, this.getAdvancedFields(operationName));
    }

    getFields(operationName, values = null) {
        const meta = this.getMeta(operationName);
        const defaults = this.getDefaults(operationName);
        const thickness = this._getWorkpieceThickness();
        const useInches = typeof getOption === 'function' ? !!getOption('Inches') : false;
        const mmPerUnit = useInches ? 25.4 : 1;
        const sliderMax = thickness / mmPerUnit;
        const depthDisplayValue = Math.max(0, Number(values?.depth ?? defaults.depth) || 0)
            + Math.max(0, Number(values?.extraDepth ?? defaults.extraDepth) || 0);
        const sliderStep = sliderMax > 0
            ? Math.max(Number((sliderMax / 100).toFixed(useInches ? 4 : 2)), useInches ? 0.001 : 0.1)
            : (useInches ? 0.001 : 0.1);

        return [
            {
                key: 'operationType',
                label: 'Cut path',
                type: 'choice',
                default: defaults.operationType,
                options: meta?.operationTypeOptions || []
            },
            {
                key: 'depth',
                label: 'Depth',
                type: 'range',
                default: defaults.depth,
                dimension: true,
                displayValue: depthDisplayValue,
                displayAddInputKey: 'extraDepth',
                vertical: true,
                min: 0,
                max: sliderMax,
                step: sliderStep,
                mmPerUnit,
                scaleLabels: [0, sliderMax / 2, sliderMax]
            },
            {
                key: 'extraDepth',
                label: 'Extra depth',
                type: 'dimension',
                default: defaults.extraDepth,
                refreshRangeDisplayKey: 'extraDepth',
                min: 0
            }
        ];
    }

    getAdvancedFields(operationName) {
        const defaults = this.getAdvancedDefaults(operationName);
        const tools = this.getCompatibleTools(operationName);
        const toolOptions = tools.map(tool => ({
            value: tool.recid,
            label: `${tool.name} (${tool.diameter}mm ${tool.bit})`
        }));

        return [
            {
                key: 'tool',
                label: 'Tool',
                type: 'choice',
                default: defaults.tool,
                options: toolOptions
            },
            {
                key: 'direction',
                label: 'Milling direction',
                type: 'choice',
                default: defaults.direction,
                options: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'climb', label: 'Climb' },
                    { value: 'conventional', label: 'Conventional' }
                ]
            },
            {
                key: 'plunge',
                label: 'Plunge',
                type: 'choice',
                default: defaults.plunge,
                options: [
                    { value: 'vertical', label: 'Vertical' },
                    { value: 'ramp-5', label: 'Ramp 5°' },
                    { value: 'ramp-20', label: 'Ramp 20°' }
                ]
            },
            {
                key: 'strategy',
                label: 'Fill method',
                type: 'choice',
                default: defaults.strategy,
                options: [
                    { value: 'adaptive', label: 'Adaptive' },
                    { value: 'raster', label: 'Raster' },
                    { value: 'contour', label: 'Contour' }
                ]
            }
        ];
    }

    collectFormData(operationName) {
        const values = PropertiesManager.collectValues(this.getFields(operationName));
        const thickness = this._getWorkpieceThickness();
        const baseDepth = Number(values.depth) || 0;
        const extraDepth = Math.max(0, Number(values.extraDepth) || 0);
        const resolvedDepth = Math.min(thickness, Math.max(0, baseDepth)) + extraDepth;
        const operationType = values.operationType || this.getDefaults(operationName).operationType;
        const resolvedOperationName = this._resolveOperationName(operationName, operationType);
        const advanced = this.getAdvancedDefaults(resolvedOperationName);

        return {
            operation: resolvedOperationName,
            tool: Number(advanced.tool) || null,
            depth: resolvedDepth,
            cutDepth: Math.min(thickness, Math.max(0, baseDepth)),
            extraDepth,
            operationType,
            direction: advanced.direction,
            plunge: advanced.plunge,
            strategy: advanced.strategy,
            inside: this._mapOperationTypeToInside(operationName, operationType),
            toolId: Number(advanced.tool) || null,
            angle: 0,
            stepover: this.getToolById(advanced.tool)?.stepover ?? 25,
            step: this.getToolById(advanced.tool)?.step ?? resolvedDepth,
            numLoops: 1,
            overCut: 0
        };
    }

    collectAdvancedFormData(operationName) {
        const values = PropertiesManager.collectValues(this.getAdvancedFields(operationName));
        return {
            tool: Number(values.tool) || null,
            direction: values.direction || this._advancedDefaults.direction,
            plunge: values.plunge || this._advancedDefaults.plunge,
            strategy: values.strategy || this._advancedDefaults.strategy
        };
    }

    getDefaultShapeCutProperties(operationName = 'Profile') {
        if (operationName === 'Drill') {
            return sanitizeToolpathProperties(this.collectDefaultFormData(operationName, {
                operationType: 'drill'
            }));
        }
        return sanitizeToolpathProperties(this.collectDefaultFormData(operationName, {
            operationType: 'none'
        }));
    }

    collectDefaultFormData(operationName, overrides = null) {
        const defaults = this.getDefaults(operationName);
        const thickness = this._getWorkpieceThickness();
        const resolvedDefaults = {
            ...defaults,
            ...(overrides || {})
        };
        const baseDepth = Number(resolvedDefaults.depth) || 0;
        const extraDepth = Math.max(0, Number(resolvedDefaults.extraDepth) || 0);
        const resolvedDepth = Math.min(thickness, Math.max(0, baseDepth)) + extraDepth;
        const operationType = resolvedDefaults.operationType || defaults.operationType || this.getDefaults(operationName).operationType;
        const resolvedOperationName = this._resolveOperationName(operationName, operationType);
        const advanced = this.getAdvancedDefaults(resolvedOperationName);

        return {
            operation: resolvedOperationName,
            tool: Number(advanced.tool) || null,
            depth: resolvedDepth,
            cutDepth: Math.min(thickness, Math.max(0, baseDepth)),
            extraDepth,
            operationType,
            direction: advanced.direction,
            plunge: advanced.plunge,
            strategy: advanced.strategy,
            inside: this._mapOperationTypeToInside(operationName, operationType),
            toolId: Number(advanced.tool) || null,
            angle: 0,
            stepover: this.getToolById(advanced.tool)?.stepover ?? 25,
            step: this.getToolById(advanced.tool)?.step ?? resolvedDepth,
            numLoops: 1,
            overCut: 0
        };
    }

    validateFormData(operationName, data) {
        const errors = [];
        const thickness = this._getWorkpieceThickness();

        if (operationName === 'Profile' && data.operationType === 'none') {
            errors.push('Please select a cut path');
        }

        if (operationName === 'Drill' && data.operationType !== 'drill') {
            errors.push('Drill shapes only support drilling');
        }

        if (!data.tool) {
            errors.push('Please select a tool in Cut settings');
        }
        if (!Number.isFinite(data.depth) || data.depth <= 0) {
            errors.push('Depth must be greater than 0');
        }
        if (!Number.isFinite(data.cutDepth) || data.cutDepth < 0 || data.cutDepth > thickness) {
            errors.push('Cut depth must stay within the workpiece thickness');
        }
        if (!Number.isFinite(data.extraDepth) || data.extraDepth < 0) {
            errors.push('Extra depth cannot be negative');
        }

        return errors;
    }

    getOperationDescriptor(operationName, operationType) {
        const normalizedType = operationType || this.getDefaults(operationName).operationType;
        if (normalizedType === 'none') {
            return null;
        }
        switch (this._resolveOperationName(operationName, normalizedType)) {
            case 'Pocket':
                return {
                    executionOperation: 'Pocket',
                    displayOperation: 'Pocket',
                    sidebarLabel: 'Clear out a pocket',
                    popupTitle: 'Pocket',
                    icon: 'target'
                };
            case 'Drill':
                return {
                    executionOperation: 'Drill',
                    displayOperation: 'Drill',
                    sidebarLabel: 'Cut on shape path',
                    popupTitle: 'Drill',
                    icon: 'circle-plus'
                };
            case 'VCarve':
                return {
                    executionOperation: 'VCarve',
                    displayOperation: 'VCarve',
                    sidebarLabel: this._describeOperationType(normalizedType),
                    popupTitle: this._describeOperationType(normalizedType),
                    icon: 'star'
                };
            case 'Profile':
            default:
                return {
                    executionOperation: 'Profile',
                    displayOperation: this._mapProfileOperationTypeToDisplay(normalizedType),
                    sidebarLabel: this._describeOperationType(normalizedType),
                    popupTitle: this._describeOperationType(normalizedType),
                    icon: 'circle'
                };
        }
    }

    _mapOperationTypeToInside(operationName, operationType) {
        if (operationType === 'none') return null;
        const resolvedOperationName = this._resolveOperationName(operationName, operationType);
        if (resolvedOperationName === 'Pocket') return 'inside';
        if (resolvedOperationName === 'Drill') return 'center';
        if (resolvedOperationName === 'VCarve') return 'center';
        return operationType === 'outside' || operationType === 'inside' || operationType === 'center'
            ? operationType
            : 'center';
    }

    _mapProfileOperationTypeToDisplay(operationType) {
        if (operationType === 'none') return 'None';
        if (operationType === 'pocket') return 'Pocket';
        if (operationType === 'inside') return 'Inside';
        if (operationType === 'outside') return 'Outside';
        return 'Center';
    }

    _resolveOperationName(operationName, operationType) {
        if (operationType === 'drill') return 'Drill';
        if (operationType === 'pocket') return 'Pocket';
        if (operationType === 'vcarve') return 'VCarve';
        return operationName;
    }

    _describeOperationType(operationType) {
        switch (operationType) {
            case 'none': return 'None';
            case 'vcarve': return 'VCarve';
            case 'pocket': return 'Clear out a pocket';
            case 'outside': return 'Cut outside shape path';
            case 'inside': return 'Cut inside shape path';
            case 'drill':
            case 'center':
            default:
                return 'Cut on shape path';
        }
    }

    getPropertiesHTML(operationName, existingProperties = null, options = {}) {
        const meta = this.getMeta(operationName);
        if (!meta) return '<p class="text-danger">Unknown operation</p>';

        const tools = this.getCompatibleTools(operationName);
        if (tools.length === 0) {
            return `
                <div class="alert alert-info mb-3">
                    <strong>${meta.label}</strong><br>${meta.description}
                </div>
                <p class="text-danger">No compatible tools available. ${meta.noToolMsg}</p>`;
        }

        const defaults = this.getDefaults(operationName);
        const values = {
            ...defaults,
            ...(existingProperties || {})
        };

        if (existingProperties) {
            const existingCutDepth = Number(existingProperties.cutDepth);
            const existingExtraDepth = Math.max(0, Number(existingProperties.extraDepth) || 0);
            const existingResolvedDepth = Number(existingProperties.depth);

            if (Number.isFinite(existingCutDepth) && existingCutDepth >= 0) {
                values.depth = existingCutDepth;
            } else if (Number.isFinite(existingResolvedDepth) && existingResolvedDepth >= 0) {
                values.depth = Math.max(0, existingResolvedDepth - existingExtraDepth);
            }
        }

        if (!values.operationType) {
            if (existingProperties?.operation === 'Pocket') {
                values.operationType = 'pocket';
            } else if (existingProperties?.operation === 'VCarve') {
                values.operationType = 'vcarve';
            }
        }

        return `
            <div class="alert alert-info mb-3">
                <strong>${meta.label}</strong><br>${meta.description}
            </div>
            ${PropertiesManager.formHTML(this.getFields(operationName, values), values, defaults)}`;
    }

    _postProcessorFields() {
        return [
            { key: 'startGcode',      label: 'Start G-code',       type: 'textarea', default: 'G0 G54 G17 G21 G90 G94', rows: 2 },
            { key: 'gcodeUnits',      label: 'G-code Units',       type: 'choice',   default: 'mm',
              options: [{ value: 'mm', label: 'Millimeters (G21)' }, { value: 'inches', label: 'Inches (G20)' }],
              help: 'Units for coordinate output in G-code (independent of display units)' },
            { key: 'spindleOnGcode',  label: 'Spindle On',         type: 'text',     default: 'M3 S',
              help: 'Use S placeholder for spindle speed' },
            { key: 'rapidTemplate',   label: 'Rapid Template',     type: 'text',     default: 'G0 X Y Z F',
              help: 'Use X Y Z F placeholders' },
            { key: 'cutTemplate',     label: 'Cut Template',       type: 'text',     default: 'G1 X Y Z F',
              help: 'Use X Y Z F placeholders' },
            { key: 'toolChangeGcode', label: 'Tool Change',        type: 'textarea', default: 'M5\nG0 Z5\n(Tool Change)\nM0', rows: 2 },
            { key: 'spindleOffGcode', label: 'Spindle Off',        type: 'text',     default: 'M5' },
            { key: 'endGcode',        label: 'End G-code',         type: 'textarea', default: 'G0 Z5\nG0 X0 Y0', rows: 2 },
            { key: 'cwArcTemplate',   label: 'CW Arc (G2)',        type: 'text',     default: 'G2 X Y I J F',
              help: 'Use X Y I J F placeholders. Leave blank to disable arc output.' },
            { key: 'ccwArcTemplate',  label: 'CCW Arc (G3)',       type: 'text',     default: 'G3 X Y I J F',
              help: 'Use X Y I J F placeholders. Leave blank to disable arc output.' },
            { key: 'useArcs',         label: 'Use Arc Commands',   type: 'checkbox', default: true,
              help: 'Detect arcs in toolpaths and output G2/G3 instead of many G1 segments' },
            { key: 'commentChar',     label: 'Comment Character',  type: 'text',     default: '(', maxlength: 1 },
            { key: 'commentsEnabled', label: 'Enable Comments',    type: 'checkbox', default: true }
        ];
    }

    getPostProcessorHTML(profile) {
        return PropertiesManager.formHTML(this._postProcessorFields(), profile, null);
    }

    collectPostProcessorData() {
        return PropertiesManager.collectValues(this._postProcessorFields());
    }

    loadPostProcessorProfile(profile) {
        const fields = this._postProcessorFields();
        for (const field of fields) {
            const value = profile[field.key] !== undefined ? profile[field.key] : field.default;
            PropertiesManager.setValue(field.key, value);
        }
    }
}

if (typeof window !== 'undefined') {
    window.toolPathProperties = new ToolPathProperties();
}
