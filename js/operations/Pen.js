class Pen extends Operation {
    constructor() {
        super('Pen', 'pen-tool', 'Draw freeform paths by clicking to add points. Click near the first point to close the path, or press Escape to finish an open path.');
        this.fields = {};
        this.closeDistance = 15; // Distance threshold for auto-closing paths
        this.active = false;
        document.addEventListener('keydown', (evt) => {
            if (evt.key === 'Escape' && this.active) {
                this.finishDrawing();
            }

        });
    }

    start() {
        this.active = true;
        this.drawingPoints = [];
        super.start();
    }

    stop() {
        this.active = false;
        this.finishDrawing();
    }

    onMouseDown(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);

        // Check if we should close the current path
        if (this.drawingPoints.length >= 3) { // Need at least 3 points to form a meaningful closed path
            const firstPoint = this.drawingPoints[0];
            const dx = mouse.x - firstPoint.x, dy = mouse.y - firstPoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= this.closeDistance) {
                // Close the current path
                this.closePath();
                window.stepWiseHelp?.reset(); // Reset to step 1 for next path
                return;
            }
        }

        // Continue with normal point addition
        this.drawingPoints.push({ x: mouse.x, y: mouse.y });
        this.lastPoint = { x: mouse.x, y: mouse.y };

        // Advance help steps based on progress
        if (this.drawingPoints.length === 1) {
            window.stepWiseHelp?.nextStep(); // Move to step 2: adding more points
        }
    }

    onMouseMove(canvas, evt) {
        var mouse = this.normalizeEvent(canvas, evt);

        // Check if we're near the first point for closing indication
        this.nearFirstPoint = false;
        if (this.drawingPoints.length >= 3) {
            const firstPoint = this.drawingPoints[0];
            const dx = mouse.x - firstPoint.x, dy = mouse.y - firstPoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            this.nearFirstPoint = distance <= this.closeDistance;

            // Update help step based on position
            if (this.nearFirstPoint) {
                // Near first point - show step 3 (close path instruction)
                if (window.stepWiseHelp?.currentStep !== 2) {
                    window.stepWiseHelp?.setStep(2); // Step 3 (0-indexed as 2)
                }
            } else {
                // Not near first point - show step 4 (escape instruction)
                if (window.stepWiseHelp?.currentStep !== 3) {
                    window.stepWiseHelp?.setStep(3); // Step 4 (0-indexed as 3)
                }
            }
        }

        if (this.lastPoint) {
            // If near first point, show preview line to first point instead of mouse
            if (this.nearFirstPoint) {
                this.previewLine = {
                    start: this.lastPoint,
                    end: { x: this.drawingPoints[0].x, y: this.drawingPoints[0].y },
                    closing: true
                }
            } else {
                this.previewLine = {
                    start: this.lastPoint,
                    end: { x: mouse.x, y: mouse.y },
                    closing: false
                }
            }
            redraw(); // Trigger redraw to show preview line and green circle
        }
    }
    onMouseUp(canvas, evt) {
        this.mouseDown = false;
        this.endDrawing();
    }

    draw(ctx) {
        // Draw all existing line segments
        if (this.drawingPoints.length > 1) {
            ctx.beginPath();
            let p0 = worldToScreen(this.drawingPoints[0].x, this.drawingPoints[0].y);
            ctx.moveTo(p0.x, p0.y);
            for (var i = 1; i < this.drawingPoints.length; i++) {
                let pi = worldToScreen(this.drawingPoints[i].x, this.drawingPoints[i].y);
                ctx.lineTo(pi.x, pi.y);
            }
            ctx.strokeStyle = penLineColor;
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Draw preview line
        if (this.previewLine) {
            let pStart = worldToScreen(this.previewLine.start.x, this.previewLine.start.y);
            let pEnd = worldToScreen(this.previewLine.end.x, this.previewLine.end.y);

            if (this.previewLine.closing) {
                this.drawLine(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y, penCloseLineColor, 2, [5, 5]);
            } else {
                this.drawLine(ctx, pStart.x, pStart.y, pEnd.x, pEnd.y, penLineColor, 1);
            }
        }

        // Highlight first point when near it for closing
        if (this.nearFirstPoint && this.drawingPoints.length >= 3) {
            const firstPoint = this.drawingPoints[0];
            let pFirst = worldToScreen(firstPoint.x, firstPoint.y);
            // Dashed ring around close zone
            ctx.setLineDash([3, 3]);
            this.drawCircle(ctx, pFirst.x, pFirst.y, this.closeDistance, null, penFirstPointColor, 2);
            ctx.setLineDash([]);
            // Filled dot at first point
            this.drawCircle(ctx, pFirst.x, pFirst.y, 4, penFirstPointColor, null);
        }
    }

    endDrawing() {
        // Points are already added in onMouseDown, so we don't need to add them here
        // This method is kept for compatibility but doesn't add duplicate points
    }



    closePath() {
        if (this.drawingPoints.length >= 3) {
            // Close the path by connecting back to the first point
            addUndo(false, true, false);

            // Create a closed path by duplicating first point
            const closedPath = this.drawingPoints.slice();
            closedPath.push(closedPath[0]);

            var svgPath = {
                id: "Pen" + svgpathId,
                type: 'path',
                name: 'Closed Pen ' + svgpathId,
                selected: false,
                visible: true,
                path: closedPath,
                bbox: boundingBox(closedPath),
                closed: true // Mark as closed path
            };
            svgpaths.push(svgPath);
            addSvgPath(svgPath.id, svgPath.name);
            svgpathId++;
        }

        // Reset for new path
        this.drawingPoints = [];
        this.lastPoint = null;
        this.previewLine = null;
    }

    finishDrawing() {
        // Guard check - only finish if we have drawing points
        if (!this.drawingPoints || this.drawingPoints.length === 0) {
            return;
        }

        if (this.drawingPoints.length > 1) {
            addUndo(false, true, false);
            var svgPath = {
                id: "Pen" + svgpathId,
                type: 'path',
                name: 'Pen ' + svgpathId,
                selected: false,
                visible: true,
                path: this.drawingPoints.slice(), // Create a copy of the points
                bbox: boundingBox(this.drawingPoints),
                closed: false // Mark as open path
            };
            svgpaths.push(svgPath);
            addSvgPath(svgPath.id, svgPath.name);
            svgpathId++;
        }

        this.drawingPoints = [];
        this.lastPoint = null;
        this.previewLine = null;
        window.stepWiseHelp?.reset(); // Reset to step 1 for next path

    }

    getPropertiesHTML() {
        return `
            <div class="alert alert-info mb-3">
                <strong>Pen Tool</strong><br>
                Click to add points. Click near the first point to close, or press Escape to finish.
            </div>
        `;
    }
}