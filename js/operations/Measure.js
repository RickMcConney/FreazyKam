class Measure extends Operation {
    constructor() {
        super('Measure', 'ruler', 'Measure the distance between two points');
        this.startPoint = null;
        this.endPoint = null;
        this.previewPoint = null;
        this.isMeasuring = false;
    }

    start() {
        super.start();
        redrawOverlay();
    }

    stop() {
        super.stop();
        this.clearMeasurement();
    }

    clearMeasurement(redrawCanvas = true) {
        this.startPoint = null;
        this.endPoint = null;
        this.previewPoint = null;
        this.isMeasuring = false;
        this.updatePropertiesPanel();
        if (redrawCanvas) {
            redrawOverlay();
        }
    }

    getMeasuredDistance() {
        if (!this.startPoint || !this.endPoint) {
            return null;
        }

        return distance(this.startPoint, this.endPoint) / viewScale;
    }

    formatDistance(distanceValue) {
        if (!Number.isFinite(distanceValue)) {
            return '-';
        }

        const useInches = typeof getOption === 'function' && getOption('Inches') === true;
        if (useInches) {
            return `${(distanceValue / 25.4).toFixed(3)} in`;
        }

        return `${distanceValue.toFixed(2)} mm`;
    }

    getPropertiesHTML() {
        return `
            <div class="alert alert-info mb-3">
                <strong>Measure</strong><br>
                Click a first point, then a second point to display the distance on the canvas.
            </div>
            <div class="mb-3">
                <label class="form-label">Distance</label>
                <input type="text" id="measure-distance" class="form-control" value="${this.formatDistance(this.getMeasuredDistance())}" readonly>
            </div>
            <div class="d-grid">
                <button type="button" id="measure-reset" class="btn btn-outline-secondary">Clear measurement</button>
            </div>
        `;
    }

    bindPropertiesUI(form) {
        const resetButton = form.querySelector('#measure-reset');
        if (resetButton) {
            resetButton.addEventListener('click', () => this.clearMeasurement());
        }
    }

    updatePropertiesPanel() {
        const distanceField = document.getElementById('measure-distance');
        if (!distanceField) {
            return;
        }

        distanceField.value = this.formatDistance(this.getMeasuredDistance());
    }

    onMouseDown(canvas, evt) {
        const point = this.normalizeEventWorld(canvas, evt);

        if (!this.startPoint || (this.startPoint && this.endPoint)) {
            this.startPoint = point;
            this.endPoint = null;
            this.previewPoint = point;
            this.isMeasuring = true;
        } else {
            this.endPoint = point;
            this.previewPoint = point;
            this.isMeasuring = false;
        }

        this.updatePropertiesPanel();
        redrawOverlay();
    }

    onMouseMove(canvas, evt) {
        if (!this.startPoint || !this.isMeasuring) {
            return;
        }

        this.previewPoint = this.normalizeEventWorld(canvas, evt);
        redrawOverlay();
    }

    draw(ctx) {
        if (!this.startPoint) {
            return;
        }

        const lineEnd = this.endPoint || this.previewPoint;
        if (!lineEnd) {
            this.drawAnchor(ctx, this.startPoint, false);
            return;
        }

        const startScreen = worldToScreen(this.startPoint.x, this.startPoint.y);
        const endScreen = worldToScreen(lineEnd.x, lineEnd.y);
        const midpointScreen = {
            x: (startScreen.x + endScreen.x) / 2,
            y: (startScreen.y + endScreen.y) / 2
        };
        const label = this.formatDistance(distance(this.startPoint, lineEnd) / viewScale);

        ctx.save();
        ctx.strokeStyle = '#0d6efd';
        ctx.fillStyle = '#0d6efd';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(startScreen.x, startScreen.y);
        ctx.lineTo(endScreen.x, endScreen.y);
        ctx.stroke();
        ctx.setLineDash([]);

        this.drawAnchor(ctx, this.startPoint, true);
        this.drawAnchor(ctx, lineEnd, !!this.endPoint);

        ctx.font = '12px sans-serif';
        const paddingX = 8;
        const paddingY = 6;
        const metrics = ctx.measureText(label);
        const textWidth = metrics.width;
        const boxWidth = textWidth + paddingX * 2;
        const boxHeight = 24;
        const boxX = midpointScreen.x - boxWidth / 2;
        const boxY = midpointScreen.y - boxHeight - 10;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.strokeStyle = '#0d6efd';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(boxX, boxY, boxWidth, boxHeight);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0d6efd';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, boxX + paddingX, boxY + boxHeight / 2);
        ctx.restore();
    }

    drawAnchor(ctx, point, isConfirmed) {
        const screenPoint = worldToScreen(point.x, point.y);
        ctx.save();
        ctx.fillStyle = isConfirmed ? '#0d6efd' : 'rgba(13, 110, 253, 0.25)';
        ctx.strokeStyle = '#0d6efd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(screenPoint.x, screenPoint.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}
