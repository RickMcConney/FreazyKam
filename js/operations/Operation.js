class Operation {
    constructor(name, icon=null, tooltip='') {
        this.name = name;
        this.icon = icon;
        this.tooltip = tooltip;
        this.properties = {};
        this.isInPropertiesMode = false;
    }

    // Lifecycle methods
    start() {
        if (window.stepWiseHelp) {
            window.stepWiseHelp.setActiveOperation(this.name);
        }
    }

    stop() {
        if (window.stepWiseHelp) {
            window.stepWiseHelp.clearActiveOperation();
        }
    }

    // Mouse event handlers
    onMouseDown(evt) { }
    onMouseMove(canvas, evt) { }
    onMouseUp(evt) { }

    // Drawing
    draw(ctx) { }

    // Canvas drawing helpers
    drawCircle(ctx, x, y, radius, fillColor, strokeColor, lineWidth) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        if (fillColor) {
            ctx.fillStyle = fillColor;
            ctx.fill();
        }
        if (strokeColor) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = lineWidth || 1;
            ctx.stroke();
        }
    }

    drawHandle(ctx, x, y, size, fillColor, strokeColor, lineWidth) {
        this.drawCircle(ctx, x, y, size, fillColor, strokeColor, lineWidth || 2);
    }

    drawLine(ctx, x1, y1, x2, y2, color, lineWidth, dash) {
        ctx.beginPath();
        if (dash) ctx.setLineDash(dash);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth || 1;
        ctx.stroke();
        if (dash) ctx.setLineDash([]);
    }

    drawCrosshair(ctx, x, y, size, color, lineWidth) {
        ctx.beginPath();
        ctx.moveTo(x - size, y);
        ctx.lineTo(x + size, y);
        ctx.moveTo(x, y - size);
        ctx.lineTo(x, y + size);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth || 1;
        ctx.stroke();
    }

    // Properties Editor Interface
    getPropertiesHTML() {
        return '<p class="text-muted">No properties available for this tool.</p>';
    }

    updateFromProperties(data) {
        
        this.onPropertiesChanged(data);
        this.properties = { ...this.properties, ...data };
    }

    onPropertiesChanged(data) {
        // Override in subclasses to handle property changes
        redraw(); // Trigger redraw by default
    }

    // Return raw world coordinates without snap (for drag delta calculations)
    normalizeEventRaw(target, e) {
        var rect = target.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        if (typeof screenToWorld === 'function') {
            return screenToWorld(x, y);
        }
        return { x, y };
    }

    // Snap-to-grid functionality
    snapToGrid(x, y) {
        // Only snap if snap is enabled
        if (typeof getOption === 'function' && getOption("snapGrid") === false) {
            return { x, y };
        }

        // Get grid size (default 10mm)
        const gridSize = (typeof getOption === 'function' && getOption("gridSize")) || 10;

        // Calculate snap interval: 1/10 of grid size in world coordinates
        // gridSize is in mm, viewScale converts to world units
        const snapInterval = (gridSize * viewScale) / 10;

        // Round to nearest snap interval
        return {
            x: Math.round(x / snapInterval) * snapInterval,
            y: Math.round(y / snapInterval) * snapInterval
        };
    }

    normalizeEvent(target, e) {
        if (!e) { e = window.event; }
        var rect = target.getBoundingClientRect();
        var x = (e.clientX - rect.left) / (rect.right - rect.left) * target.width;
        var y = (e.clientY - rect.top) / (rect.bottom - rect.top) * target.height;

        // Convert screen to world coordinates
        var worldCoords = screenToWorld(x, y);

        // Apply snap-to-grid
        return this.snapToGrid(worldCoords.x, worldCoords.y);
    }

    // Like normalizeEvent but without snap-to-grid — use for hit testing so
    // the snap offset doesn't push the cursor away from paths at high zoom.
    normalizeEventWorld(target, e) {
        if (!e) { e = window.event; }
        var rect = target.getBoundingClientRect();
        var x = (e.clientX - rect.left) / (rect.right - rect.left) * target.width;
        var y = (e.clientY - rect.top) / (rect.bottom - rect.top) * target.height;
        return screenToWorld(x, y);
    }

        /**
         * Check if any edge of a path intersects the edges of a selection box
         */
        pathIntersectsRect(path, box) {
            const corners = [
                {x: box.minx, y: box.miny}, {x: box.maxx, y: box.miny},
                {x: box.maxx, y: box.maxy}, {x: box.minx, y: box.maxy}
            ];
            for (var j = 0; j < path.length; j++) {
                var k = (j + 1) % path.length;
                for (var e = 0; e < 4; e++) {
                    if (lineIntersects(path[j], path[k], corners[e], corners[(e + 1) % 4])) {
                        return true;
                    }
                }
            }
            return false;
        }

        highlightPathsInRect(selectBox) {
        const containMode = selectBox.rl; // left-to-right = contain, right-to-left = touch
        for (var i = 0; i < svgpaths.length; i++) {
            if (!svgpaths[i].visible) continue;
            var path = svgpaths[i].path;

            if (containMode) {
                // Path must be fully inside: all points inside, OR edges cross the box
                // but every point must be contained
                var allInside = path.length > 0;
                for (var j = 0; j < path.length; j++) {
                    if (!pointInBoundingBox(path[j], selectBox)) {
                        allInside = false;
                        break;
                    }
                }
                svgpaths[i].highlight = allInside;
            } else {
                // Any point inside OR any edge crossing the box selects the path
                svgpaths[i].highlight = false;
                for (var j = 0; j < path.length; j++) {
                    if (pointInBoundingBox(path[j], selectBox)) {
                        svgpaths[i].highlight = true;
                        break;
                    }
                }
                if (!svgpaths[i].highlight) {
                    svgpaths[i].highlight = this.pathIntersectsRect(path, selectBox);
                }
            }
        }
    }


}
