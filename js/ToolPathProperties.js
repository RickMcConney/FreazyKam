/**
 * ToolPathProperties
 *
 * Single entry point for all toolpath operation UI. Uses PropertiesManager
 * for converted operations. Delegates to the legacy ToolpathPropertiesManager
 * for operations not yet converted — remove each delegation case as operations
 * are ported, then delete ToolpathPropertiesManager entirely.
 *
 * Adding a new operation:
 *   1. Add compatible bit types to _compatibleBits
 *   2. Add default values to _operationDefaults
 *   3. Add a _buildXxxFields() method
 *   4. Add an entry in _operationMeta
 *   That's it — HTML generation, field collection, and validation are all automatic.
 */

class ToolPathProperties {

    constructor() {
    }

    // All toolpath operations — converted ones use PM, rest delegate to legacy manager
    _compatibleBits = {
        'Profile':   ['End Mill', 'Ball Nose', 'VBit'],
        'Pocket':    ['End Mill', 'Ball Nose'],
        'VCarve':    ['VBit'],
        'Drill':     ['Drill', 'End Mill'],
        'Surfacing': ['End Mill'],
        '3dProfile': ['Ball Nose'],
        'Inlay':     ['End Mill', 'Ball Nose'],
    };

    // Per-operation metadata drives HTML generation, field collection, and validation.
    // buildFields: function that returns the fields array for PropertiesManager
    // extraValidate: optional function(data, errors) for operation-specific rules
    get _operationMeta() {
        return {
            'Profile': {
                label:       'Profile',
                description: 'Cut along the profile of the selected path',
                noToolMsg:   'Please add an End Mill, Ball Nose, or VBit in the tool library.',
                buttonLabel: 'Update Toolpath',
                buildFields: (d) => this._buildProfileFields(d),
            },
            'Pocket': {
                label:       'Pocket',
                description: 'Remove all material inside the path',
                noToolMsg:   'Please add an End Mill or Ball Nose in the tool library.',
                buttonLabel: 'Update Toolpath',
                buildFields: (d) => this._buildPocketFields(d),
            },
            'VCarve': {
                label:       'VCarve',
                description: 'V-carve inside the path with tapered cuts',
                noToolMsg:   'Please add a VBit in the tool library.',
                buttonLabel: 'Update Toolpath',
                buildFields: (d) => this._buildVCarveFields(d),
            },
            'Drill': {
                label:       'Drill',
                description: 'Drill holes at selected points or helical drill selected circles',
                noToolMsg:   'Please add a Drill or End Mill in the tool library.',
                buttonLabel: 'Update Toolpath',
                buildFields: (d) => this._buildDrillFields(d),
            },
            '3dProfile': {
                label:       '3D Profile',
                description: 'Raster toolpath following STL surface with ball nose bit',
                noToolMsg:   'Please add a Ball Nose in the tool library.',
                buttonLabel: 'Generate 3D Profile',
                buildFields: (d) => this._build3dProfileFields(d),
            },
            'Surfacing': {
                label:       'Surfacing',
                description: 'Surface the entire workpiece with parallel passes',
                noToolMsg:   'Please add an End Mill in the tool library.',
                buttonLabel: 'Apply Surfacing',
                buildFields: (d) => this._buildSurfacingFields(d),
            },
            'Inlay': {
                label:       'Inlay',
                description: 'Create male plug or female socket for inlay work',
                noToolMsg:   'Please add an End Mill or Ball Nose in the tool library.',
                buttonLabel: 'Generate Inlay',
                buildFields: (d) => this._buildInlayFields(d),
                extraValidate(data, errors) {
                    if (!data.finishingToolId) errors.push('Please select a finishing tool');
                    if (data.clearance < 0)    errors.push('Clearance must be 0 or greater');
                },
            },
        };
    }

    // ── Defaults ──────────────────────────────────────────────────────────────

    _operationDefaults(operationName) {
        const thickness = typeof getOption === 'function' ? (getOption('workpieceThickness') || 10) : 10;
        const base = {
            toolId: null, depth: thickness, step: thickness * 0.25,
            stepover: 25, angle: 0, inside: 'inside', direction: 'climb',
            numLoops: 1, overCut: 0,
        };
        const overrides = {
            'Pocket':    { strategy: 'adaptive' },
            'Surfacing': { depth: 1, stepover: 75 },
            '3dProfile': { stepover: 15, strategy: 'raster' },
            'Inlay':     { inlayType: 'female', mirror: true, vcarveStrategy: 'profile',
                           finishingToolId: null, clearance: 0.1, glueGap: 0.5, cutOut: false },
        };
        return { ...base, ...(overrides[operationName] || {}) };
    }

    _usesWorkpieceDepthDefault(operationName) {
        return ['Drill', 'Profile', 'Pocket', 'VCarve', 'Inlay', '3dProfile'].includes(operationName);
    }

    getDefaults(operationName) {
        const currentDefaults = this._operationDefaults(operationName);
        const saved = PropertiesManager.loadSaved(operationName);
        const defaults = { ...currentDefaults, ...saved };

        if (this._usesWorkpieceDepthDefault(operationName)) {
            defaults.depth = currentDefaults.depth;
        }

        return defaults;
    }

    saveDefaults(operationName, values) {
        const defaults = this.getDefaults(operationName);
        const fields = this._operationMeta[operationName]?.buildFields(defaults) ?? [];
        PropertiesManager.save(operationName, values, fields);
    }

    // ── Tool helpers ──────────────────────────────────────────────────────────

    hasOperation(operationName) {
        return operationName in this._compatibleBits;
    }

    getCompatibleTools(operationName) {
        const bits = this._compatibleBits[operationName] || [];
        return (window.tools || []).filter(t => bits.includes(t.bit));
    }

    getToolById(toolId) {
        return (window.tools || []).find(t => t.recid === toolId) || null;
    }

    // ── Profile fields ────────────────────────────────────────────────────────

    _buildProfileFields(defaults) {
        const tools    = this.getCompatibleTools('Profile');
        const toolOpts = tools.map(t => ({ value: t.recid, label: `${t.name} (${t.diameter}mm ${t.bit})` }));

        return [
            { key: 'toolpathName', label: 'Name', persist: false,           type: 'text',      default: '', help: 'Leave empty to auto-name from the linked shape.' },
            { key: 'toolId',       label: 'Tool',           type: 'choice',    default: tools[0]?.recid ?? null, options: toolOpts },
            { key: 'inside',       label: 'Cutting Side',   type: 'choice',    default: defaults.inside,
              options: [{ value: 'inside', label: 'Inside' }, { value: 'outside', label: 'Outside' }, { value: 'center', label: 'Center' }] },
            { key: 'direction',    label: 'Direction',      type: 'choice',    default: defaults.direction,
              options: [{ value: 'climb', label: 'Climb' }, { value: 'conventional', label: 'Conventional' }] },
            { key: 'depth',        label: 'Depth',          type: 'dimension', default: defaults.depth,    help: 'Cutting depth' },
            { key: 'step',         label: 'Step Down',      type: 'dimension', default: defaults.step,     help: 'Depth per pass' },
            { key: 'numLoops',     label: 'Profile Loops',  type: 'number',    default: defaults.numLoops,
              min: 1, step: 1, integer: true, help: 'Number of offset passes (1 = single pass)' },
            { key: 'overCut',      label: 'Over/Under Cut', type: 'dimension', default: defaults.overCut,
              help: '+ leaves stock, − cuts past the line' },
        ];
    }

    // ── Pocket fields ─────────────────────────────────────────────────────────

    _buildPocketFields(defaults) {
        const tools    = this.getCompatibleTools('Pocket');
        const toolOpts = tools.map(t => ({ value: t.recid, label: `${t.name} (${t.diameter}mm ${t.bit})` }));

        return [
            { key: 'toolpathName', label: 'Name', persist: false,          type: 'text',      default: '', help: 'Leave empty to auto-name from the linked shape.' },
            { key: 'toolId',       label: 'Tool',          type: 'choice',    default: tools[0]?.recid ?? null, options: toolOpts },
            { key: 'strategy',     label: 'Strategy',      type: 'choice',    default: defaults.strategy,
              options: [{ value: 'adaptive', label: 'Adaptive' }, { value: 'raster', label: 'Raster' }, { value: 'contour', label: 'Contour' }],
              help: 'Adaptive combines contour and raster for optimal clearing' },
            { key: 'direction',    label: 'Direction',     type: 'choice',    default: defaults.direction,
              options: [{ value: 'climb', label: 'Climb' }, { value: 'conventional', label: 'Conventional' }] },
            { key: 'depth',        label: 'Depth',         type: 'dimension', default: defaults.depth,    help: 'Cutting depth' },
            { key: 'step',         label: 'Step Down',     type: 'dimension', default: defaults.step,     help: 'Depth per pass' },
            { key: 'stepover',     label: 'Stepover (%)',  type: 'number',    default: defaults.stepover,
              min: 1, max: 100, step: 1, integer: true, help: 'Percentage of tool diameter to step over' },
            { key: 'angle',        label: 'Infill Angle °', type: 'number',   default: defaults.angle,
              min: 0, max: 180, step: 1, help: 'Angle of infill lines from horizontal (0–180°)' },
        ];
    }

    // ── VCarve fields ─────────────────────────────────────────────────────────

    _buildVCarveFields(defaults) {
        const tools    = this.getCompatibleTools('VCarve');
        const toolOpts = tools.map(t => ({ value: t.recid, label: `${t.name} (${t.diameter}mm ${t.bit})` }));

        return [
            { key: 'toolpathName', label: 'Name', persist: false,           type: 'text',      default: '', help: 'Leave empty to auto-name from the linked shape.' },
            { key: 'toolId',       label: 'Tool',           type: 'choice',    default: tools[0]?.recid ?? null, options: toolOpts },
            { key: 'inside',       label: 'Cutting Side',   type: 'choice',    default: defaults.inside,
              options: [{ value: 'inside', label: 'Inside' }, { value: 'outside', label: 'Outside' }, { value: 'center', label: 'Center' }] },
            { key: 'depth',        label: 'Max Depth',      type: 'dimension', default: defaults.depth,   help: 'Maximum cutting depth' },
            { key: 'overCut',      label: 'Over/Under Cut', type: 'dimension', default: defaults.overCut, help: '+ leaves stock, − cuts past the line' },
        ];
    }

    // ── Drill fields ──────────────────────────────────────────────────────────

    _buildDrillFields(defaults) {
        const tools    = this.getCompatibleTools('Drill');
        const toolOpts = tools.map(t => ({ value: t.recid, label: `${t.name} (${t.diameter}mm ${t.bit})` }));

        return [
            { key: 'toolpathName', label: 'Name', persist: false,       type: 'text',      default: '', help: 'Leave empty to auto-name from the linked shape.' },
            { key: 'toolId',       label: 'Tool',       type: 'choice',    default: tools[0]?.recid ?? null, options: toolOpts },
            { key: 'depth',        label: 'Depth',      type: 'dimension', default: defaults.depth, help: 'Drilling depth' },
            { key: 'step',         label: 'Step Down',  type: 'dimension', default: defaults.step,  help: 'Depth per pass (helical drill only)' },
        ];
    }

    // ── 3D Profile fields ─────────────────────────────────────────────────────

    _build3dProfileFields(defaults) {
        const tools    = this.getCompatibleTools('3dProfile');
        const toolOpts = tools.map(t => ({ value: t.recid, label: `${t.name} (${t.diameter}mm ${t.bit})` }));

        // Rest machining: unique Ball Nose diameters, largest first
        const ballNoseDiameters = [...new Set((window.tools || [])
            .filter(t => t.bit === 'Ball Nose').map(t => t.diameter))]
            .sort((a, b) => b - a);
        const restToolOpts = [
            { value: 0, label: 'None (full cut from stock)' },
            ...ballNoseDiameters.map(d => ({ value: d, label: `${d}mm Ball Nose` }))
        ];

        return [
            { key: 'toolpathName',    label: 'Name',            type: 'text',    default: '', help: 'Leave empty to auto-name from the linked shape.' },
            { key: 'strategy',        label: 'Strategy',        type: 'choice',  default: defaults.strategy,
              options: [{ value: 'raster', label: 'Raster' }, { value: 'contour', label: 'Contour (Waterline)' }],
              help: 'Raster for curved surfaces, Contour for vertical walls' },
            { key: 'toolId',          label: 'Tool',            type: 'choice',  default: tools[0]?.recid ?? null, options: toolOpts },
            { key: 'depth',           label: 'Max Depth',       type: 'dimension', default: defaults.depth,   help: 'Maximum cutting depth below surface' },
            { key: 'step',            label: 'Step Down',       type: 'dimension', default: defaults.step,    help: 'Depth per pass' },
            { key: 'stepover',        label: 'Stepover (%)',    type: 'number',  default: defaults.stepover,
              min: 1, max: 100, step: 1, integer: true, help: 'Percentage of tool diameter to step over' },
            { key: 'angle',           label: 'Infill Angle °',  type: 'number',  default: defaults.angle,
              min: 0, max: 180, step: 1, help: 'Angle of raster lines from horizontal (0–180°)' },
            { key: 'restToolDiameter',label: 'Previous Tool',   type: 'choice',  default: defaults.restToolDiameter ?? 0, options: restToolOpts,
              help: 'Roughing tool used in a previous pass — skips air where that tool already cut' },
        ];
    }

    // ── Surfacing fields ──────────────────────────────────────────────────────

    _buildSurfacingFields(defaults) {
        const tools    = this.getCompatibleTools('Surfacing');
        const toolOpts = tools.map(t => ({ value: t.recid, label: `${t.name} (${t.diameter}mm ${t.bit})` }));

        return [
            { key: 'toolpathName', label: 'Name', persist: false,           type: 'text',    default: '' },
            { key: 'toolId',       label: 'Tool',           type: 'choice',  default: tools[0]?.recid ?? null, options: toolOpts },
            { key: 'depth',        label: 'Depth',          type: 'dimension', default: defaults.depth,    help: 'Cutting depth per pass' },
            { key: 'stepover',     label: 'Stepover (%)',   type: 'number',  default: defaults.stepover,
              min: 1, max: 100, step: 1, integer: true, help: 'Percentage of tool diameter to step over' },
            { key: 'angle',        label: 'Infill Angle °', type: 'number',  default: defaults.angle,
              min: 0, max: 180, step: 1, help: 'Angle of pass lines from horizontal (0–180°)' },
        ];
    }

    // ── Inlay fields ──────────────────────────────────────────────────────────

    _buildInlayFields(defaults) {
        const pocketTools   = this.getCompatibleTools('Inlay');
        const finishTools   = (window.tools || []).filter(t => ['End Mill', 'VBit', 'Ball Nose'].includes(t.bit));
        const pocketOpts    = pocketTools.map(t => ({ value: t.recid, label: `${t.name} (${t.diameter}mm ${t.bit})` }));
        const finishOpts    = finishTools.map(t => ({ value: t.recid, label: `${t.name} (${t.diameter}mm ${t.bit})` }));

        return [
            { key: 'toolpathName',   label: 'Name',              type: 'text',      default: '', help: 'Leave empty to auto-name from the linked shape.' },
            { key: 'inlayType',      label: 'Inlay Type',        type: 'choice',    default: defaults.inlayType,
              options: [{ value: 'female', label: 'Female Socket' }, { value: 'male', label: 'Male Plug' }],
              help: 'Socket: pockets inside the path. Plug: pockets outside the path.' },
            { key: 'mirror',         label: 'Mirror plug',       type: 'checkbox',  default: defaults.mirror,
              help: 'Mirror the selected path horizontally before generating the male plug' },
            { key: 'vcarveStrategy', label: 'V-Carve Strategy',  type: 'choice',    default: defaults.vcarveStrategy,
              options: [{ value: 'profile', label: 'Profile' }, { value: 'center', label: 'Center (Medial Axis)' }],
              help: 'Profile follows edges, Center uses medial axis (better for text/letters)' },
            { key: 'toolId',         label: 'Pocketing Tool',    type: 'choice',    default: pocketTools[0]?.recid ?? null, options: pocketOpts },
            { key: 'finishingToolId',label: 'Finishing Tool',    type: 'choice',    default: finishTools[0]?.recid ?? null, options: finishOpts,
              help: 'Tool for the finishing profile pass (End Mill or V-Bit)' },
            { key: 'depth',          label: 'Depth',             type: 'dimension', default: defaults.depth,    help: 'Cutting depth' },
            { key: 'step',           label: 'Step Down',         type: 'dimension', default: defaults.step,     help: 'Depth per pass' },
            { key: 'stepover',       label: 'Stepover (%)',      type: 'number',    default: defaults.stepover,
              min: 1, max: 100, step: 1, integer: true, help: 'Percentage of tool diameter to step over' },
            { key: 'clearance',      label: 'Clearance',         type: 'dimension', default: defaults.clearance, help: 'Gap between male and female parts for fit' },
            { key: 'glueGap',        label: 'Glue Gap',          type: 'dimension', default: defaults.glueGap,   help: 'Vertical clearance between plug and socket bottom for glue (V-bit inlay)' },
            { key: 'angle',          label: 'Infill Angle °',    type: 'number',    default: defaults.angle,
              min: 0, max: 180, step: 1, help: 'Angle of infill lines from horizontal (0–180°)' },
            { key: 'direction',      label: 'Direction',         type: 'choice',    default: defaults.direction,
              options: [{ value: 'climb', label: 'Climb' }, { value: 'conventional', label: 'Conventional' }] },
            { key: 'cutOut',         label: 'Cut out plug',      type: 'checkbox',  default: defaults.cutOut,
              help: 'Profile around the plug at full material depth to separate it' },
        ];
    }

    // ── HTML generation ───────────────────────────────────────────────────────

    getPropertiesHTML(operationName, existingProperties = null, options = {}) {
        const meta = this._operationMeta[operationName];
        if (!meta) return '<p class="text-danger">Unknown operation</p>';

        const { showUpdateButton = true } = options;
        const defaults = this.getDefaults(operationName);
        const tools    = this.getCompatibleTools(operationName);

        if (tools.length === 0) {
            return `
                <div class="alert alert-info mb-3">
                    <strong>${meta.label}</strong><br>${meta.description}
                </div>
                <p class="text-danger">No compatible tools available. ${meta.noToolMsg}</p>`;
        }

        const fields = meta.buildFields(defaults);
        const updateButtonHtml = showUpdateButton ? `
            <div class="mb-3">
                <button type="button" class="btn btn-primary btn-sm w-100" id="update-toolpath-button">
                    <i data-lucide="refresh-cw"></i> ${meta.buttonLabel}
                </button>
            </div>` : '';

        return `
            <div class="alert alert-info mb-3">
                <strong>${meta.label}</strong><br>${meta.description}
            </div>
            ${PropertiesManager.formHTML(fields, existingProperties, defaults)}
            ${updateButtonHtml}`;
    }

    // ── Data collection ───────────────────────────────────────────────────────

    collectFormData(operationName) {
        const meta = this._operationMeta[operationName];
        if (!meta) return {};

        const defaults = this.getDefaults(operationName);
        const fields   = meta.buildFields(defaults);
        const data     = PropertiesManager.collectValues(fields);

        // <select> returns a string from the DOM — convert tool IDs to int, diameters to float
        if ('toolId' in data)           data.toolId           = parseInt(data.toolId)           || null;
        if ('finishingToolId' in data)  data.finishingToolId  = parseInt(data.finishingToolId)  || null;
        if ('restToolDiameter' in data) data.restToolDiameter = parseFloat(data.restToolDiameter) || 0;
        return data;
    }

    // ── Validation ────────────────────────────────────────────────────────────

    validateFormData(operationName, data) {
        const meta   = this._operationMeta[operationName];
        if (!meta) return [];

        const errors  = [];
        const defaults = this.getDefaults(operationName);
        const fields   = meta.buildFields(defaults);
        const keys     = new Set(fields.map(f => f.key));

        if (keys.has('toolId') && !data.toolId)
            errors.push('Please select a tool');
        if (keys.has('depth') && (!data.depth || data.depth <= 0))
            errors.push(`${operationName === 'VCarve' || operationName === '3dProfile' ? 'Max d' : 'D'}epth must be greater than 0`);
        if (keys.has('step')) {
            if (!data.step || data.step <= 0)
                errors.push('Step down must be greater than 0');
            else if (data.depth && data.step > data.depth)
                errors.push('Step down cannot be greater than total depth');
        }
        if (keys.has('stepover') && (!data.stepover || data.stepover <= 0 || data.stepover > 100))
            errors.push('Stepover must be between 1 and 100%');

        meta.extraValidate?.(data, errors);
        return errors;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Post Processor (G-code Profile) properties
    // ══════════════════════════════════════════════════════════════════════════

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
            { key: 'commentsEnabled', label: 'Enable Comments',    type: 'checkbox', default: true },
        ];
    }

    getPostProcessorHTML(profile) {
        const fields = this._postProcessorFields();
        return PropertiesManager.formHTML(fields, profile, null);
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
