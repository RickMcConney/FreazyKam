
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

        this.currentPath = null;
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
        return [this.textField, this.fontField, this._getFontSizeField()];
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
    }

    // Lifecycle methods
    start() {
        this.getProperties();
        super.start();
    }

    stop() {
        this.currentPath = null;
        super.stop();
    }

    setEditPath(path) {
        this.currentPath = path;
    }

    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);
        if (this.properties.text && this.properties.text.trim() !== '') {
            this.addText(this.properties.text, mouse.x, mouse.y, this.properties.fontSize, this.properties.font);
            window.stepWiseHelp?.setStep(3);
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

    updateFromProperties(data) {
        // Manage parsing ourselves so the base class doesn't overwrite with raw slider values
        this.onPropertiesChanged(data);
    }

    onPropertiesChanged(data) {
        const values = PropertiesManager.collectValues(this._fields());
        this.properties = { ...this.properties, ...values };
        this._saveTextOptions(values.text, values.font, values.fontSize);
        if (this.currentPath && this.currentPath.creationProperties) {
            this.updateTextInPlace(this.currentPath);
        }
    }

    // Options Management Helper Method
    _saveTextOptions(text, font, sizeInMM) {
        if (typeof setOption !== 'undefined') {
            setOption("textFontSize", sizeInMM); // Always stored in mm
            if (font) {
                setOption("textFont", font);
            }
            if (text) {
                setOption("textSample", text);
            }
        }
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

    _createSvgPathsFromSubpaths(allPaths, char, textGroupId, x, y, text, fontname, sizeInMM, pathIdMap = null) {
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
                var pathId, pathName, isSelected;
                if (pathIdMap && pathIdCounter < pathIdMap.length) {
                    pathId = pathIdMap[pathIdCounter].id;
                    pathName = pathIdMap[pathIdCounter].name;
                    isSelected = pathIdMap[pathIdCounter].selected;
                } else {
                    // Create new path
                    pathId = 'Text' + svgpathId;
                    pathName = 'Text_' + char + '_' + pathType + '_' + svgpathId;
                    isSelected = 1;
                    svgpathId++;
                }

                var svgPath = {
                    id: pathId,
                    type: 'path',
                    name: pathName,
                    selected: isSelected,
                    visible: true,
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
                        pathType: pathType
                    }
                };

                createdPaths.push(svgPath);
                pathIdCounter++;
            }
        });

        return createdPaths;
    }

    async addText(text, x, y, sizeInMM = 20, fontname) {
        // Generate a unique group ID for all paths in this text
        const textGroupId = 'TextGroup' + Date.now();

        let fontUrl = fontname;


        // Use opentype.js for local TTF fonts
        opentype.load(fontUrl, (err, font) => {
            if (err) {
                console.error('Could not load font:', err);
                var fontEntry = AVAILABLE_FONTS.find(f => f.value === fontname);
                var displayName = fontEntry ? fontEntry.label : 'Unknown';
                notify('Failed to load font "' + displayName + '". Check your internet connection.', 'error');
                return;
            }
            else {
                this.createTextPath(font, text, x, y, sizeInMM, fontname, textGroupId);
                redraw();
            }
        });

    }

    // Compute scaled font size so capital 'H' matches sizeInMM in world units.
    _computeFontSize(font, sizeInMM) {
        const referenceBBox = font.charToGlyph('H').getBoundingBox();
        const referenceHeight = referenceBBox.y2 - referenceBBox.y1;
        return sizeInMM * viewScale * (font.unitsPerEm / referenceHeight);
    }

    createTextPath(font, text, x, y, sizeInMM, fontname, textGroupId) {
        let fontSize = this._computeFontSize(font, sizeInMM);

        // Center the text horizontally on the click position
        const chars = text.split('');
        let totalWidth = 0;
        chars.forEach(char => { totalWidth += font.getAdvanceWidth(char, fontSize); });
        let currentX = x - totalWidth / 2;

        addUndo(false, true, false);
        chars.forEach((char, index) => {
            // Create path for single character
            var path = font.getPath(char, currentX, y, fontSize);

            // Process font commands to get subpaths
            var allPaths = this._processFontCommands(path, currentX, y, fontname);

            // Create SVG paths from subpaths
            const createdPaths = this._createSvgPathsFromSubpaths(
                allPaths, char, textGroupId, x, y, text, fontname, sizeInMM
            );

            // Add created paths to svgpaths array
            createdPaths.forEach(svgPath => {
                svgpaths.push(svgPath);
                selectMgr.selectPath(svgPath);
            });

            // Move to next character position
            currentX += font.getAdvanceWidth(char, fontSize);
        });

        // Add the text group to sidebar after all paths are created
        const textPaths = svgpaths.filter(p => p.textGroupId === textGroupId);
        if (typeof addTextGroup === 'function' && textPaths.length > 0) {
            addTextGroup(textGroupId, text, textPaths);
        }

        // Set currentPath to enable immediate editing
        if (textPaths.length > 0) {
            this.currentPath = textPaths[0];
        }
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
        const savedTransformHistory = textPaths[0].transformHistory || null;
        const originalPathIds = textPaths.map(p => p.id);
        const originalPaths = textPaths.map(p => ({
            id: p.id,
            name: p.name
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

        let fontSizeScaled = this._computeFontSize(font, sizeInMM);
        let pathIdCounter = 0; // Track which original ID to reuse

        // Center the text horizontally on the original click position
        const chars = text.split('');
        let totalWidth = 0;
        chars.forEach(char => { totalWidth += font.getAdvanceWidth(char, fontSizeScaled); });
        let currentX = x - totalWidth / 2;
        chars.forEach((char, index) => {
            var fontPath = font.getPath(char, currentX, y, fontSizeScaled);

            // Process font commands to get subpaths
            var allPaths = this._processFontCommands(fontPath, currentX, y, fontname);

            // Create SVG paths from subpaths, reusing original IDs
            const createdPaths = this._createSvgPathsFromSubpaths(
                allPaths, char, textGroupId, x, y, text, fontname, sizeInMM,
                originalPaths.slice(pathIdCounter) // Pass remaining original paths for ID reuse
            );

            // Add created paths to svgpaths array, restoring transforms
            createdPaths.forEach(svgPath => {
                if (savedTransformHistory) {
                    svgPath.transformHistory = savedTransformHistory.map(t => ({...t}));
                    applyTransformHistory(svgPath);
                }
                svgpaths.push(svgPath);
                selectMgr.selectPath(svgPath);
                this.currentPath = svgPath;
                pathIdCounter++;
            });

            // Move to next character position
            currentX += font.getAdvanceWidth(char, fontSizeScaled);
        });

        // Add the updated text group to sidebar
        const updatedTextPaths = svgpaths.filter(p => p.textGroupId === textGroupId);
        if (updatedTextPaths.length > 0) {
            addTextGroup(textGroupId, text, updatedTextPaths);
        }

        // Re-run linked toolpath operations on the new text paths
        if (linkedToolpaths.length > 0 && updatedTextPaths.length > 0) {
            // Deduplicate by operation type (only need to run each operation once)
            const seen = new Set();
            const uniqueOps = linkedToolpaths.filter(lt => {
                if (seen.has(lt.operation)) return false;
                seen.add(lt.operation);
                return true;
            });

            selectMgr.unselectAll();
            updatedTextPaths.forEach(p => selectMgr.selectPath(p));

            for (const lt of uniqueOps) {
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
        }
    }


}