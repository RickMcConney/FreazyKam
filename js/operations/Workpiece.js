class Workpiece extends Operation {
    constructor() {
        super('Workpiece', 'cuboid', 'Configure your workpiece dimensions and material properties');

        this.fields = {
            workpieceWidth:     { key: 'workpieceWidth',     label: 'Width (X)',       type: 'dimension',  default: 300  },
            workpieceLength:    { key: 'workpieceLength',    label: 'Length (Y)',      type: 'dimension',  default: 200  },
            workpieceThickness: { key: 'workpieceThickness', label: 'Thickness (Z)',   type: 'dimension',  default: 19   },
            material:           { key: 'material',           label: 'Material',        type: 'choice',     default: 'Softwood / MDF', options: [] },
            showGrid:           { key: 'showGrid',           label: 'Show Grid',       type: 'checkbox',   default: true },
            showOrigin:         { key: 'showOrigin',         label: 'Show Origin',     type: 'checkbox',   default: true },
            showWorkpiece:      { key: 'showWorkpiece',      label: 'Show Workpiece',  type: 'checkbox',   default: true },
            originPosition:     { key: 'originPosition',     label: 'Origin Position', type: 'radio-grid', default: 'middle-center',
                cols: 3,
                options: [
                    'top-left', 'top-center', 'top-right',
                    'middle-left', 'middle-center', 'middle-right',
                    'bottom-left', 'bottom-center', 'bottom-right'
                ],
                help: 'Select where to place the X,Y origin (0,0) on your workpiece. Z origin is top of workpiece'
            },
        };
    }

    getDimensionValue(data, key, fallback, useInches) {
        const rawValue = data[key];
        if (typeof rawValue === 'number') {
            return rawValue > 0 ? rawValue : fallback;
        }

        const parsedValue = parseDimension(rawValue, useInches);
        return parsedValue > 0 ? parsedValue : fallback;
    }

    // No mouse interactions needed for workpiece tool
    onMouseDown(canvas, evt) {
        // No canvas interaction needed
    }

    onMouseMove(canvas, evt) {
        // No canvas interaction needed
    }

    onMouseUp(canvas, evt) {
        // No canvas interaction needed
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        const currentWidth     = getOption("workpieceWidth")     || 300;
        const currentLength    = getOption("workpieceLength")    || 200;
        const currentThickness = getOption("workpieceThickness") || 19;
        const currentMaterial   = getOption("material")          || 'Softwood / MDF';

        // Build dynamic material options
        const materialField = { ...this.fields.material };
        materialField.options = Object.keys(materialsDatabase).map(s => ({ value: s, label: s }));

        const fh = (field, value) => PropertiesManager.fieldHTML(field, value);

        return `
            <div><h5>Workpiece Setup</h5></div>
            <div class="row g-2">
                <div class="col-6">${fh(this.fields.workpieceWidth,  formatDimension(currentWidth,     true))}</div>
                <div class="col-6">${fh(this.fields.workpieceLength, formatDimension(currentLength,    true))}</div>
            </div>
            <div class="row g-2">
                <div class="col-6">${fh(this.fields.workpieceThickness, formatDimension(currentThickness, true))}</div>
                <div class="col-6">${fh(materialField, currentMaterial)}</div>
            </div>

            <div class="alert alert-light">
                <small class="text-muted">
                    <strong>Note:</strong> Changing workpiece dimensions will automatically re-center the workpiece in the viewport.
                </small>
            </div>`;
    }

    updateFromProperties(data) {
        super.updateFromProperties(data);



        let dimensionChanged = false;
        let originChanged = false;
        const useInches = getOption('Inches');

        // Update global options when properties change
        // Dimension fields are already parsed to mm by PropertiesManager when they
        // come from the rendered form. Keep string parsing only as a fallback.
        if ('workpieceWidth' in data) {
            let newValue = this.getDimensionValue(data, 'workpieceWidth', 300, useInches);
            const tableWidth = getOption("tableWidth");
            const value = useInches ? newValue / 25.4 : newValue;
            if (tableWidth && value > tableWidth) {
                notify(`Workpiece width clamped to machine table limit (${tableWidth}mm)`, 'warning');
                newValue = tableWidth;
                const el = document.getElementById('pm-workpieceWidth');
                if (el) el.value = useInches ? (newValue / 25.4).toFixed(2) : newValue;
            }
            setOption("workpieceWidth", newValue);
            dimensionChanged = true;
        }

        if ('workpieceLength' in data) {
            let newValue = this.getDimensionValue(data, 'workpieceLength', 200, useInches);
            const tableDepth = getOption("tableDepth");
            const value = useInches ? newValue / 25.4 : newValue;
            if (tableDepth && value > tableDepth) {
                notify(`Workpiece length clamped to machine table limit (${tableDepth}mm)`, 'warning');
                newValue = tableDepth;
                const el = document.getElementById('pm-workpieceLength');
                if (el) el.value = useInches ? (newValue / 25.4).toFixed(2) : newValue;
            }
            setOption("workpieceLength", newValue);
            dimensionChanged = true;
        }

        if ('workpieceThickness' in data) {
            const newValue = this.getDimensionValue(data, 'workpieceThickness', 19, useInches);
            setOption("workpieceThickness", newValue);

            // Recalculate tool depths and steps that are percentage-based
            recalculateToolPercentages();
            renderToolsTable();
        }

        if ('material' in data) {
            setOption("material", data.material);
        }

        if ('originPosition' in data) {

            setOption("originPosition", data.originPosition);
            originChanged = true;
        }

        if ('showGrid' in data) {
            setOption("showGrid", data.showGrid);
        }

        if ('showOrigin' in data) {
            setOption("showOrigin", data.showOrigin);
        }

        if ('showWorkpiece' in data) {
            setOption("showWorkpiece", data.showWorkpiece);
        }

        // Update origin position if dimensions or origin position changed
        if (dimensionChanged || originChanged) {
            // Use the values from options (already parsed and saved above)
            const width = getOption("workpieceWidth") * viewScale;
            const length = getOption("workpieceLength") * viewScale;
            const position = getOption("originPosition") || 'middle-center';

            const newOrigin = calculateOriginFromPosition(position, width, length);


            origin.x = newOrigin.x;
            origin.y = newOrigin.y;
        }

		// If dimensions changed, re-center the workpiece view
		if (dimensionChanged) {
			fitWorkpieceInView();
		}

        // Regenerate surfacing toolpaths when anything that affects their geometry changes.
        // This runs after all setOption calls so getOption returns the new values.
        if (dimensionChanged || originChanged || 'material' in data) {
            const surfacingPaths = toolpaths.filter(tp => tp.operation === 'Surfacing');
            if (surfacingPaths.length > 0) {
                const originalTool = window.currentTool;
                for (const tp of surfacingPaths) {
                    window.currentTool = { ...tp.tool };
                    window.currentToolpathProperties = tp.toolpathProperties ? { ...tp.toolpathProperties } : {};
                    window.toolpathUpdateTargets = [tp];
                    doSurfacing();
                }
                window.currentTool = originalTool;
                window.currentToolpathProperties = null;
                window.toolpathUpdateTargets = null;
            }
        }
    }

    onPropertiesChanged(data) {
        // Force immediate canvas redraw when workpiece properties change
        redraw();

        // Update 3D workpiece if any dimensions or species changed
        if ((('workpieceWidth' in data) || ('workpieceLength' in data) || ('workpieceThickness' in data) ||
             ('originPosition' in data) || ('material' in data)) && typeof window.updateWorkpiece3D === 'function') {
            const useInches = getOption('Inches');

            // Parse new dimension values if they're in the change data
            const newWidth = ('workpieceWidth' in data) ?
                this.getDimensionValue(data, 'workpieceWidth', getOption('workpieceWidth'), useInches) :
                getOption('workpieceWidth');
            const newLength = ('workpieceLength' in data) ?
                this.getDimensionValue(data, 'workpieceLength', getOption('workpieceLength'), useInches) :
                getOption('workpieceLength');
            const newThickness = ('workpieceThickness' in data) ?
                this.getDimensionValue(data, 'workpieceThickness', getOption('workpieceThickness'), useInches) :
                getOption('workpieceThickness');
            const newOriginPosition = ('originPosition' in data) ?
                data.originPosition :
                getOption('originPosition');
            const newMaterial = ('material' in data) ?
                data.material :
                getOption('material');

            window.updateWorkpiece3D(newWidth, newLength, newThickness, newOriginPosition, newMaterial);
        }

        if (typeof window.schedulePrepared3DGcodeRefresh === 'function') {
            window.schedulePrepared3DGcodeRefresh({
                preserveProgress: true,
                resetIfMissing: true,
                reloadIfLoaded: false
            });
        }

        // Force a second redraw on next frame to ensure all updates are visible
        requestAnimationFrame(() => redraw());

    }

    // Help system integration
    getHelpSteps() {
        return [
            'Configure your workpiece dimensions: width, length, and thickness.',
            'Select your wood species from the dropdown to optimize cutting parameters.',
            'Use the Options popup to configure grid size, display toggles, and workpiece origin position.',
            'All changes update the canvas immediately and are saved automatically.'
        ];
    }

    getHelpText() {
        // Return all steps as a formatted list for the workpiece tool
        const steps = this.getHelpSteps();
        return `
            <strong>Workpiece Configuration:</strong>
            <ul>
                ${steps.map(step => `<li>${step}</li>`).join('')}
            </ul>
        `;
    }
}
