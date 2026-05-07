var makerjs = require('makerjs');

var AVAILABLE_SHAPES = [
    { value: 'Belt', label: "Belt" },
    { value: 'Circle', label: "Circle" },
    { value: 'Ellipse', label: "Ellipse" },
    { value: 'Heart', label: "Heart" },
    { value: 'Polygon', label: "Polygon" },
    { value: 'Rectangle', label: "Rectangle" },
    { value: 'RoundRectangle', label: "Round Rectangle" },
    { value: 'Sign', label: "Sign" },
    { value: 'Star', label: "Star" }
]

function invertArc(arc) {
    var chord = new makerjs.paths.Chord(arc);
    var midPoint = makerjs.point.middle(chord);
    makerjs.path.rotate(arc, 180, midPoint);
}

function Heart(r, a2) {

    var a = a2 / 2;

    var a_radians = makerjs.angle.toRadians(a);

    var x = Math.cos(a_radians) * r;
    var y = Math.sin(a_radians) * r;

    var z = makerjs.solvers.solveTriangleASA(90, 2 * r, 90 - a);

    let paths = {
        arc1: new makerjs.paths.Arc([x, 0], r, -a, 180 - a),
        line1: new makerjs.paths.Line([x * 2, -y], [0, -z + y])
    };


    paths.arc1 = makerjs.path.mirror(paths.arc1, false, true);
    paths.line1 = makerjs.path.mirror(paths.line1, false, true);
    paths.arc2 = makerjs.path.mirror(paths.arc1, true, false);
    paths.line2 = makerjs.path.mirror(paths.line1, true, false);



    var model = { paths: paths };

    return model;
}

// Dimension-type parameter titles — these use text input + parseDimension/formatDimension
const DIMENSION_PARAM_TITLES = ["radius", "distance", "width", "height", "left", "right", "inner", "outer", "radiusX", "radiusY"];

function isDimensionTitle(title) {
    const firstWord = title.split(" ")[0].toLowerCase();
    return DIMENSION_PARAM_TITLES.includes(firstWord);
}

class Shape extends Operation {
    constructor() {
        super('Shape', 'pentagon', 'Create basic shapes (circle, rectangle, polygon, star, etc.)');

        // Raw metaParameter defaults per shape (used for initial defaults)
        this._metaDefaults = {};

        // PropertiesManager field specs per shape
        this.fieldSpecs = {};

        const shapeMeta = {
            Star: (() => {
                const m = makerjs.models.Star.metaParameters.slice(0, 3);
                m[0].value = 5; m[1].value = 40; m[2].value = 20;
                return m;
            })(),
            Belt:          makerjs.models.Belt.metaParameters,
            Circle:        [{ title: 'radius', value: 20, min: 1, max: 100 }],
            Ellipse:       makerjs.models.Ellipse.metaParameters,
            Polygon:       (() => {
                const m = makerjs.models.Polygon.metaParameters.slice(0, 3);
                m[1].value = 20;
                return m;
            })(),
            Rectangle:     (() => {
                const m = makerjs.models.Rectangle.metaParameters;
                m[0].value = 100; m[1].value = 50;
                return m;
            })(),
            RoundRectangle: (() => {
                const m = makerjs.models.RoundRectangle.metaParameters;
                m[0].value = 100; m[1].value = 50;
                return m;
            })(),
            Sign:          (() => {
                const m = makerjs.models.RoundRectangle.metaParameters;
                m[0].value = 100; m[1].value = 50;
                return m;
            })(),
            Heart:         [
                { title: 'radius', value: 20, min: 1, max: 100 },
                { title: 'angle',  value: 90, min: 60, max: 120 }
            ]
        };

        for (const shape of AVAILABLE_SHAPES) {
            const meta = shapeMeta[shape.value];
            if (!meta) continue;
            this._metaDefaults[shape.value] = meta;

            // Build PropertiesManager field specs from metaParameters
            this.fieldSpecs[shape.value] = meta.map(param => {
                const firstWord = param.title.split(" ")[0].toLowerCase();
                const key = shape.value + '_' + firstWord;
                const isDim = DIMENSION_PARAM_TITLES.includes(firstWord);

                // Store paramName back for getArgs positional lookup
                param.paramName = key;

                return {
                    key,
                    label: param.title.charAt(0).toUpperCase() + param.title.slice(1),
                    type: isDim ? 'dimension' : 'number',
                    default: param.value,
                    min: param.min,
                    max: param.max,
                    step: isDim ? undefined : 1,
                    integer: !isDim
                };
            });
        }

        this.shapeField = {
            key: 'shape',
            label: 'Shape',
            type: 'choice',
            default: 'Polygon',
            options: AVAILABLE_SHAPES.map(s => ({ value: s.value, label: s.label }))
        };

        // Last-used values (persisted across tool activations within the session)
        this.properties = {};
        // Currently-editing path (null when creating new)
        this.currentPath = null;
    }

    get fields() {
        const all = { shape: this.shapeField };
        for (const specs of Object.values(this.fieldSpecs)) {
            for (const f of specs) all[f.key] = f;
        }
        return all;
    }

    // ── Shape construction ─────────────────────────────────────────────────

    walkOptions = {
        onPath: function (wp) {
            if (wp.pathContext.type === 'arc') {
                invertArc(wp.pathContext);
            }
        }
    };

    toInternal(value) {
        return value * viewScale;
    }

    makeShape(shape, x, y, svgPath, data) {
        // Collect current field values from DOM and sync into this.properties so that
        // creationProperties is always fully populated (even when no input was ever changed).
        const fields = this.fieldSpecs[shape] || [];
        const values = PropertiesManager.collectValues(fields);
        this.properties = { ...this.properties, ...values, shape };

        const arg = fields.map(field => values[field.key] !== undefined ? values[field.key] : field.default);

        switch (shape) {
            case 'Star':
                this.model = new makerjs.models.Star(arg[0], this.toInternal(arg[1]), this.toInternal(arg[2]), 2);
                break;
            case 'Belt':
                this.model = new makerjs.models.Belt(this.toInternal(arg[0]), this.toInternal(arg[1]), this.toInternal(arg[2]));
                break;
            case 'Circle':
                this.model = new makerjs.models.Ellipse(this.toInternal(arg[0]), this.toInternal(arg[0]));
                break;
            case 'Ellipse':
                this.model = new makerjs.models.Ellipse(this.toInternal(arg[0]), this.toInternal(arg[1]));
                break;
            case 'Polygon':
                this.model = new makerjs.models.Polygon(arg[0], this.toInternal(arg[1]), arg[2], false);
                break;
            case 'Sign': {
                const sign = new makerjs.models.RoundRectangle(this.toInternal(arg[0]), this.toInternal(arg[1]), this.toInternal(arg[2]));
                makerjs.model.walk(sign, this.walkOptions);
                this.model = sign;
                break;
            }
            case 'Rectangle':
                this.model = new makerjs.models.Rectangle(this.toInternal(arg[0]), this.toInternal(arg[1]));
                break;
            case 'RoundRectangle':
                this.model = new makerjs.models.RoundRectangle(this.toInternal(arg[0]), this.toInternal(arg[1]), this.toInternal(arg[2]));
                break;
            case 'Heart':
                this.model = Heart(this.toInternal(arg[0]), arg[1]);
                break;
        }

        this.model.origin = [x, y];
        if (shape == "Rectangle" || shape == "RoundRectangle" || shape == "Sign")
            this.model.origin = [x - this.toInternal(arg[0]) / 2, y - this.toInternal(arg[1]) / 2];
        var chain = makerjs.model.findSingleChain(this.model);
        if (!chain) return;

        this.points = makerjs.chain.toKeyPoints(chain, 1 * viewScale);

        var path = [];
        for (let p of this.points) {
            path.push({ x: p[0], y: p[1] });
        }
        if (path[0].x == path[path.length - 1].x && path[0].y == path[path.length - 1].y)
            path.pop();

        path.push(path[0]);

        let oldId = null;
        let oldsvgpathId = null;
        if (svgPath != null) {
            oldId = svgPath.id;
            oldsvgpathId = svgPath.svgpathId;
        }
        if (svgPath == null) {
            addUndo(false, true, false);
            svgPath = {
                closed: true,
                svgpathId: svgpathId,
                id: shape + '_' + svgpathId,
                type: 'path',
                name: shape + ' ' + svgpathId,
                selected: false,
                visible: true,
                path: path,
                bbox: boundingBox(path),
                creationTool: 'Shape',
                creationProperties: {
                    shape: shape,
                    properties: { ...this.properties },
                    center: { x: x, y: y }
                }
            };
            svgpaths.push(svgPath);

            selectSidebarNode(svgPath.id);
            this.currentPath = svgPath;

            svgpathId++;
        }
        else {
            svgPath.path = path;
            svgPath.id = shape + '_' + oldsvgpathId;
            svgPath.name = shape + ' ' + oldsvgpathId;
            svgPath.bbox = boundingBox(path);
            svgPath.creationProperties.shape = shape;
            svgPath.creationProperties.properties = { ...this.properties };
            if (svgPath.transformHistory) {
                applyTransformHistory(svgPath);
            }
        }

        addOrReplaceSvgPath(oldId, svgPath.id, svgPath.name);
        selectMgr.unselectAll();
        selectMgr.selectPath(svgPath);

        const title = document.getElementById('tool-properties-title');
        title.textContent = `Edit ${shape} - ${svgPath.name}`;

        if (oldId != null && typeof regenerateToolpathsForPaths === 'function') {
            if (oldId !== svgPath.id) {
                toolpaths.forEach(tp => {
                    if (tp.svgId === oldId) tp.svgId = svgPath.id;
                    if (tp.svgIds && Array.isArray(tp.svgIds)) {
                        tp.svgIds = tp.svgIds.map(id => id === oldId ? svgPath.id : id);
                    }
                });
            }
            regenerateToolpathsForPaths([svgPath.id]);
        }

        redraw();
    }

    // ── Operation lifecycle ────────────────────────────────────────────────

    stop() {
        this.currentPath = null;
    }

    onMouseDown(canvas, evt) {
        if (this.currentPath) {
            const mouse = this.normalizeEvent(canvas, evt);
            const clickedPath = Select.getInstance().pointInPath(mouse);

            if (clickedPath !== this.currentPath) {
                this.stop();
                showToolsList();
            }
            return;
        }

        var mouse = this.normalizeEvent(canvas, evt);
        let shape = this.getShape();
        this.makeShape(shape, mouse.x, mouse.y, null, null);
    }

    setEditPath(path) {
        this.currentPath = path;

        if (path) {
            selectMgr.unselectAll();
            selectMgr.selectPath(path);
        }
    }

    update(path) {
        let shape = path.creationProperties.shape;
        this.showProperties(shape);
        this.properties = { ...this.properties, ...path.creationProperties.properties };
    }

    updateInPlace(svgPath, data) {
        var props = svgPath.creationProperties;
        this.makeShape(data.shape, props.center.x, props.center.y, svgPath, data);
    }

    // ── Properties panel ──────────────────────────────────────────────────

    getCurrentShape() {
        if (this.currentPath) {
            return this.currentPath.creationProperties.shape;
        }
        if (this.properties && this.properties.shape) {
            return this.properties.shape;
        }
        return 'Polygon';
    }

    getShape() {
        return document.getElementById('pm-shape').value;
    }

    showProperties(shape) {
        for (let s of AVAILABLE_SHAPES) {
            const el = document.getElementById(`${s.value}-properties`);
            if (el) el.style.display = (s.value === shape) ? 'block' : 'none';
        }
        const shapeSelect = document.getElementById('pm-shape');
        if (shapeSelect) shapeSelect.value = shape;
    }

    getPropertiesHTML(path) {
        const currentShape = this.getCurrentShape();
        const pathProperties = this.currentPath?.creationProperties?.properties ?? null;

        let html = `
            <div class="alert alert-info mb-3">
                <strong>Shape Tool</strong><br>
                Create basic shapes (circle, rectangle, polygon, star, etc.)
            </div>`;
        html += PropertiesManager.fieldHTML(this.shapeField, currentShape);

        // Per-shape property sections (show/hide via CSS)
        for (const s of AVAILABLE_SHAPES) {
            const fields = this.fieldSpecs[s.value] || [];
            const display = (s.value === currentShape) ? 'block' : 'none';
            html += `<div id="${s.value}-properties" style="display: ${display};">`;
            html += `<h5 class="mt-3 mb-2">${s.label} Properties</h5>`;
            html += PropertiesManager.formHTML(fields, pathProperties, this.properties);
            html += `</div>`;
        }

        return html;
    }

    /**
     * Override base class to manage our own property parsing.
     * The base class would merge raw string values from `data` into this.properties
     * after onPropertiesChanged, overwriting our parsed numbers.
     */
    updateFromProperties(data) {
        this.onPropertiesChanged(data);
    }

    onPropertiesChanged(data) {
        const newShape = data.shape;
        if (newShape) {
            this.showProperties(newShape);
        }

        const shape = newShape || this.getCurrentShape();
        const fields = this.fieldSpecs[shape] || [];

        // Collect parsed values from the DOM for the current shape's fields
        const values = PropertiesManager.collectValues(fields);
        this.properties = { ...this.properties, ...values, shape };

        if (this.currentPath) {
            this.updateInPlace(this.currentPath, { ...this.properties, shape });
        }
    }
}
