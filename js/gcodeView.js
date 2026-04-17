/**
 * GcodeView - Virtualized G-code viewer for simulation.
 * Only renders the visible rows in the DOM (~50 elements) instead of all lines,
 * so setCurrentLine is O(1) regardless of file size.
 */
class GcodeView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.lineTexts = [];                // Array of raw line strings
        this.currentLineNumber = -1;        // Currently highlighted line
        this.gcodeText = '';                // Full G-code text
        this.lineHeight = 20;              // Estimated px height per line
        this.visibleStart = 0;             // First visible line index
        this.visibleEnd = 0;               // Last visible line index (exclusive)
        this.renderedElements = [];        // Currently rendered DOM elements (sparse by line index)
        this._viewport = null;             // Scrollable viewport div
        this._content = null;              // Inner content div (sized to full height)
        this._linesContainer = null;       // Container for visible line divs
    }

    /**
     * Populate the view with G-code text
     * @param {string} gcodeText - Raw G-code with newlines
     */
    populate(gcodeText) {
        this.gcodeText = gcodeText;
        this.currentLineNumber = -1;

        let lines = gcodeText.split('\n');
        // Remove trailing empty lines
        while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
            lines.pop();
        }
        this.lineTexts = lines;
        this._buildVirtualizedDOM();
    }

    /**
     * Highlight the current line and scroll it into view
     * @param {number} lineNumber - G-code line number (0-based)
     */
    setCurrentLine(lineNumber) {
        if (lineNumber === this.currentLineNumber) {
            return;
        }

        const oldLine = this.currentLineNumber;
        this.currentLineNumber = lineNumber;

        // Scroll so the current line is visible
        if (this._viewport && lineNumber >= 0 && lineNumber < this.lineTexts.length) {
            const targetScrollTop = lineNumber * this.lineHeight;
            const viewportHeight = this._viewport.clientHeight;
            const currentScrollTop = this._viewport.scrollTop;

            // Only scroll if the line is outside the visible area
            if (targetScrollTop < currentScrollTop || targetScrollTop > currentScrollTop + viewportHeight - this.lineHeight) {
                // Center the line in the viewport
                this._viewport.scrollTop = targetScrollTop - viewportHeight / 2;
            } else {
                // Line is already visible, just update highlights
                this._updateHighlight(oldLine, lineNumber);
                return;
            }
            // _renderVisibleLines will be called by the scroll event
        }
    }

    show() {
        if (this.container) {
            this.container.style.display = '';
        }
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
        this.lineTexts = [];
        this.currentLineNumber = -1;
        this.renderedElements = [];
        this._viewport = null;
        this._content = null;
        this._linesContainer = null;
        this.gcodeText = '';
    }

    /**
     * Build the virtualized DOM structure:
     *   container > viewport (scrollable) > content (full height) > linesContainer (visible lines only)
     */
    _buildVirtualizedDOM() {
        if (!this.container) return;

        this.container.innerHTML = '';
        this.renderedElements = [];
        this.visibleStart = -1;
        this.visibleEnd = -1;

        // Viewport - scrollable container
        this._viewport = document.createElement('div');
        this._viewport.className = 'gcode-viewport';

        // Content - sized to full virtual height for correct scrollbar
        this._content = document.createElement('div');
        this._content.className = 'gcode-content';
        this._content.style.height = `${this.lineTexts.length * this.lineHeight}px`;

        // Lines container - holds only the visible line elements
        this._linesContainer = document.createElement('div');
        this._linesContainer.className = 'gcode-lines-container';

        this._content.appendChild(this._linesContainer);
        this._viewport.appendChild(this._content);
        this.container.appendChild(this._viewport);

        // Re-render on scroll
        this._viewport.addEventListener('scroll', () => {
            this._renderVisibleLines();
        });

        // Render initial visible lines - use requestAnimationFrame so the
        // viewport has been laid out and clientHeight is available
        requestAnimationFrame(() => {
            this._renderVisibleLines();
        });
    }

    /**
     * Render only the lines currently visible in the viewport
     */
    _renderVisibleLines() {
        if (!this._viewport || this.lineTexts.length === 0) return;

        const scrollTop = this._viewport.scrollTop;
        let viewportHeight = this._viewport.clientHeight;

        // If viewport has no height yet (container hidden/not laid out),
        // use a reasonable default so we render enough lines
        if (viewportHeight <= 0) {
            viewportHeight = 600;
        }

        // Calculate visible range with buffer lines above and below
        const buffer = 10;
        const newStart = Math.max(0, Math.floor(scrollTop / this.lineHeight) - buffer);
        const newEnd = Math.min(this.lineTexts.length, Math.ceil((scrollTop + viewportHeight) / this.lineHeight) + buffer);

        // Skip if range hasn't changed
        if (newStart === this.visibleStart && newEnd === this.visibleEnd) return;

        this.visibleStart = newStart;
        this.visibleEnd = newEnd;

        // Rebuild visible lines
        const fragment = document.createDocumentFragment();
        this.renderedElements = [];

        for (let i = newStart; i < newEnd; i++) {
            const div = document.createElement('div');
            div.className = 'gcode-line';
            if (i === this.currentLineNumber) {
                div.className += ' active-gcode-line';
            }
            div.style.top = `${i * this.lineHeight}px`;
            div.style.height = `${this.lineHeight}px`;
            div.style.lineHeight = `${this.lineHeight}px`;

            const lineNum = document.createElement('span');
            lineNum.className = 'gcode-line-number';
            lineNum.textContent = (i + 1) + ': ';

            const codeText = document.createElement('span');
            codeText.className = 'gcode-line-code';
            codeText.textContent = this.lineTexts[i].trim() || '(empty)';

            div.appendChild(lineNum);
            div.appendChild(codeText);

            // Click handler for seeking
            div.addEventListener('click', () => this._handleLineClick(i));

            fragment.appendChild(div);
            this.renderedElements[i] = div;
        }

        this._linesContainer.innerHTML = '';
        this._linesContainer.appendChild(fragment);
    }

    /**
     * Update highlight without re-rendering (when line is already in visible range)
     */
    _updateHighlight(oldLine, newLine) {
        if (oldLine >= 0 && this.renderedElements[oldLine]) {
            this.renderedElements[oldLine].classList.remove('active-gcode-line');
        }
        if (newLine >= 0 && this.renderedElements[newLine]) {
            this.renderedElements[newLine].classList.add('active-gcode-line');
        }
    }

    /**
     * Handle click on a G-code line
     */
    _handleLineClick(lineNumber) {
        this.setCurrentLine(lineNumber);

        if (typeof simulation2D !== 'undefined' && (simulation2D.isRunning || simulation2D.isPaused)) {
            if (typeof setSimulation2DLineNumber === 'function') {
                setSimulation2DLineNumber(lineNumber);
            }
        } else if (typeof setSimulation3DProgress === 'function') {
            setSimulation3DProgress(lineNumber);
        }
    }
}
