class Workpiece extends Operation {
    constructor() {
        super('Workpiece', 'box', 'Configure your workpiece dimensions and material properties');

        this.fields = {
            workpieceWidth:     { key: 'workpieceWidth',     label: 'Width (X)',      type: 'dimension', default: 300  },
            workpieceLength:    { key: 'workpieceLength',    label: 'Length (Y)',     type: 'dimension', default: 200  },
            workpieceThickness: { key: 'workpieceThickness', label: 'Thickness (Z)',  type: 'dimension', default: 19   },
            woodSpecies:        { key: 'woodSpecies',        label: 'Wood Species',   type: 'choice',    default: 'Pine', options: [] },
            gridSize:           { key: 'gridSize',           label: 'Grid Size',      type: 'dimension', default: 10   },
            showGrid:           { key: 'showGrid',           label: 'Show Grid',      type: 'checkbox',  default: true },
            snapGrid:           { key: 'snapGrid',           label: 'Snap to Grid',   type: 'checkbox',  default: true },
            showOrigin:         { key: 'showOrigin',         label: 'Show Origin',    type: 'checkbox',  default: true },
            showWorkpiece:      { key: 'showWorkpiece',      label: 'Show Workpiece', type: 'checkbox',  default: true },
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
        const currentGridSize  = getOption("gridSize")           || 10;
        const currentSpecies   = getOption("woodSpecies")        || 'Pine';

        // Build dynamic species options
        const speciesField = { ...this.fields.woodSpecies };
        speciesField.options = Object.keys(woodSpeciesDatabase).map(s => ({ value: s, label: s }));

        const fh = (field, value) => PropertiesManager.fieldHTML(field, value);

        return `
            <div class="alert alert-info mb-3">
                <strong>Workpiece Setup</strong><br>
                Configure your workpiece dimensions and material properties
            </div>

            <div class="row g-2">
                <div class="col-6">${fh(this.fields.workpieceWidth,  formatDimension(currentWidth,     true))}</div>
                <div class="col-6">${fh(this.fields.workpieceLength, formatDimension(currentLength,    true))}</div>
            </div>
            <div class="row g-2">
                <div class="col-6">${fh(this.fields.workpieceThickness, formatDimension(currentThickness, true))}</div>
                <div class="col-6">${fh(speciesField, currentSpecies)}</div>
            </div>

            ${fh(this.fields.gridSize, formatDimension(currentGridSize, true))}

            <div class="row g-2">
                <div class="col-6">${fh(this.fields.showGrid,      getOption("showGrid")      !== false)}</div>
                <div class="col-6">${fh(this.fields.snapGrid,      getOption("snapGrid")      !== false)}</div>
            </div>
            <div class="row g-2">
                <div class="col-6">${fh(this.fields.showOrigin,    getOption("showOrigin")    !== false)}</div>
                <div class="col-6">${fh(this.fields.showWorkpiece, getOption("showWorkpiece") !== false)}</div>
            </div>

            ${fh(this.fields.originPosition, getOption("originPosition") || 'middle-center')}

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
        // Parse inputs using parseDimension to handle both mm and inch inputs
        if ('workpieceWidth' in data) {
            let newValue = parseDimension(data.workpieceWidth, useInches) || 300;
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
            let newValue = parseDimension(data.workpieceLength, useInches) || 200;
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
            const newValue = parseDimension(data.workpieceThickness, useInches) || 19;
            setOption("workpieceThickness", newValue);

            // Recalculate tool depths and steps that are percentage-based
            recalculateToolPercentages();
            renderToolsTable();
        }

        if ('gridSize' in data) {
            const newValue = parseDimension(data.gridSize, useInches) || 10;
            setOption("gridSize", newValue);
        }

        if ('woodSpecies' in data) {
            setOption("woodSpecies", data.woodSpecies);
        }

        if ('originPosition' in data) {

            setOption("originPosition", data.originPosition);
            originChanged = true;
        }

        if ('showGrid' in data) {
            setOption("showGrid", data.showGrid);
        }

        if ('snapGrid' in data) {
            setOption("snapGrid", data.snapGrid);
        }

        if ('showOrigin' in data) {
            setOption("showOrigin", data.showOrigin);
        }

        if ('showWorkpiece' in data) {
            setOption("showWorkpiece", data.showWorkpiece);
        }

        // Note: gridSize is already handled above with parseDimension

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
            centerWorkpiece();
        }

        // Regenerate surfacing toolpaths when anything that affects their geometry changes.
        // This runs after all setOption calls so getOption returns the new values.
        if (dimensionChanged || originChanged || 'woodSpecies' in data) {
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

        // Update 3D grid if gridSize changed - parse the new value and pass it
        if ('gridSize' in data && typeof window.updateGridSize3D === 'function') {
            const useInches = getOption('Inches');
            const newGridSize = parseDimension(data.gridSize, useInches) || 10;  // Parse the string value
            window.updateGridSize3D(newGridSize);
        }

        // Update 3D workpiece if any dimensions or species changed
        if ((('workpieceWidth' in data) || ('workpieceLength' in data) || ('workpieceThickness' in data) ||
             ('originPosition' in data) || ('woodSpecies' in data)) && typeof window.updateWorkpiece3D === 'function') {
            const useInches = getOption('Inches');

            // Parse new dimension values if they're in the change data
            const newWidth = ('workpieceWidth' in data) ?
                (parseDimension(data.workpieceWidth, useInches) || getOption('workpieceWidth')) :
                getOption('workpieceWidth');
            const newLength = ('workpieceLength' in data) ?
                (parseDimension(data.workpieceLength, useInches) || getOption('workpieceLength')) :
                getOption('workpieceLength');
            const newThickness = ('workpieceThickness' in data) ?
                (parseDimension(data.workpieceThickness, useInches) || getOption('workpieceThickness')) :
                getOption('workpieceThickness');
            const newOriginPosition = ('originPosition' in data) ?
                data.originPosition :
                getOption('originPosition');
            const newWoodSpecies = ('woodSpecies' in data) ?
                data.woodSpecies :
                getOption('woodSpecies');

            window.updateWorkpiece3D(newWidth, newLength, newThickness, newOriginPosition, newWoodSpecies);
        }

        // Force a second redraw on next frame to ensure all updates are visible
        requestAnimationFrame(() => redraw());

    }

    // Help system integration
    getHelpSteps() {
        return [
            'Configure your workpiece dimensions: width, length, and thickness.',
            'Select your wood species from the dropdown to optimize cutting parameters.',
            'Set the grid size and toggle display options (grid, origin, workpiece outline).',
            'Choose the origin position by clicking on the 3x3 grid - this sets where (0,0) will be located.',
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