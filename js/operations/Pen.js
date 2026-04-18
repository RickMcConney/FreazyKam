class Pen extends Curve {
    constructor() {
        super();
        this.name = 'Pen';
        this.icon = 'pen-tool';
        this.tooltip = 'Draw straight-line paths. Click to add corner points. Click near the first point to close, or press Escape to finish.';
        this.alwaysCorner = true;
    }

    getPropertiesHTML() {
        let status;
        if (this.editPath) {
            const n = this.editPath.creationProperties.nodes.length;
            status = `Editing: <strong>${this.editPath.name}</strong><br>${n} point${n !== 1 ? 's' : ''}`;
        } else if (this.nodes.length > 0) {
            status = `Drawing: ${this.nodes.length} point${this.nodes.length !== 1 ? 's' : ''} placed`;
        } else {
            status = 'Click to start drawing, or click a Pen path to edit it.';
        }

        return `
            <div class="alert alert-info mb-3">
                <strong>Pen Tool</strong><br>${status}
            </div>
            <div class="alert alert-secondary">
                <i data-lucide="info"></i>
                <small>
                    <strong>Drawing:</strong><br>
                    • <strong>Click</strong> to add points<br>
                    • <strong>Click near first point</strong> to close path<br>
                    • <strong>Escape</strong> to finish open path<br><br>
                    <strong>Editing:</strong><br>
                    • <strong>Drag</strong> points to reposition them<br>
                    • <strong>Click line</strong> to insert a new point<br>
                    • <strong>Hover + Delete</strong> to remove a point<br>
                    • <strong>Click</strong> another Pen path to edit it<br>
                    • <strong>Click empty space</strong> to start a new path<br>
                    • <strong>Escape</strong> to exit edit mode
                </small>
            </div>`;
    }
}
