// Simulation control overlays for the 2D and 3D canvas tabs.
// Extracted from js/bootstrap-layout.js. Loaded as a global-scope script
// (no ES6 modules) — see CLAUDE.md for the script-order constraint.

function create2DSimulationControls() {
    const overlayControls = document.getElementById('2d-simulation-controls');
    overlayControls.innerHTML = `
        <div class="row g-2 w-100">
            <div class="col-auto">
                <button type="button" class="btn btn-outline-primary btn-sm" id="start-simulation">
                    <i data-lucide="play"></i>
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="pause-simulation" disabled>
                    <i data-lucide="pause"></i>
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="stop-simulation" disabled>
                    <i data-lucide="octagon-x"></i>
                </button>
            </div>

            <div class="col-auto d-flex align-items-center gap-2">
                <span class="small">Speed:</span>
                <input type="range" class="form-range form-range-sm" id="simulation-speed" min="1" max="10" step="0.5" value="5" style="width: 60px;">
                <span id="speed-display" class="small">5x</span>
            </div>

            <div class="col-auto d-flex align-items-center gap-2">
                <hspacer style="width: 1px; height: 20px; margin: 0 8px; background-color: var(--bs-secondary);"></hspacer>
                <span class="small">Progress:</span>
                <input type="range" class="form-range form-range-sm" id="simulation-step" min="0" max="100" step="1" value="0" style="width: 150px;">
            </div>

            <div class="col-auto d-flex align-items-center gap-2">
                <span class="small">G-code:</span>
                <span id="2d-step-display" class="small">0 / 0</span>
            </div>

            <div class="col-auto d-flex align-items-center gap-2">
                <span class="small">Feed:</span>
                <span class="small"><span id="2d-feed-rate-display">0</span> mm/min</span>
            </div>

            <div class="col-auto d-flex align-items-center gap-2">
                <span class="small">Time:</span>
                <span class="small"><span id="2d-simulation-time">0:00</span> / <span id="2d-total-time">0:00</span></span>
            </div>

            <div class="col-auto d-flex align-items-center gap-2">
                <span class="small">Z:</span>
                <span class="small"><span id="2d-z-depth-display">0.00</span> mm</span>
            </div>
        </div>
    `;

    // Add simulation control event handlers
    const startBtn = document.getElementById('start-simulation');
    const pauseBtn = document.getElementById('pause-simulation');
    const stopBtn = document.getElementById('stop-simulation');

    if (startBtn && typeof startSimulation2D === 'function') {
        startBtn.addEventListener('click', startSimulation2D);
    }
    if (pauseBtn && typeof pauseSimulation2D === 'function') {
        pauseBtn.addEventListener('click', pauseSimulation2D);
    }
    if (stopBtn && typeof stopSimulation2D === 'function') {
        stopBtn.addEventListener('click', stopSimulation2D);
    }

    // Simulation speed control
    document.getElementById('simulation-speed').addEventListener('input', function (e) {
        const speed = parseFloat(e.target.value);
        document.getElementById('speed-display').textContent = speed + 'x';
        if (typeof updateSimulation2DSpeed === 'function') {
            updateSimulation2DSpeed(speed);
        }
    });

    // Simulation step control (progress slider) - seek to G-code line
    document.getElementById('simulation-step').addEventListener('input', function (e) {
        const lineIndex = parseInt(e.target.value);  // 0-indexed from slider (array index is line number)
        if (typeof setSimulation2DLineNumber === 'function') {
            setSimulation2DLineNumber(lineIndex);  // Pass 0-based line number directly
        }
    });
}

function create3DSimulationControls() {
    const overlayControls = document.getElementById('3d-simulation-controls');
    overlayControls.innerHTML = `
        <div class="row g-2 w-100">
            <div class="col-auto">
                <button type="button" class="btn btn-outline-primary btn-sm" id="3d-start-simulation">
                    <i data-lucide="play"></i>
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="3d-pause-simulation" disabled>
                    <i data-lucide="pause"></i>
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="3d-stop-simulation" disabled>
                    <i data-lucide="octagon-x"></i>
                </button>
            </div>

            <div class="col-auto d-flex align-items-center gap-2">
                <span class="small">Speed:</span>
                <input type="range" class="form-range form-range-sm" id="3d-simulation-speed" min="1" max="10" step="0.5" value="4" style="width: 60px;">
                <span id="3d-speed-display" class="small">4x</span>
            </div>

            <div class="col-auto d-flex align-items-center gap-2">
                <label class="form-check-label small" style="display: flex; align-items: center; gap: 6px; cursor: pointer; margin: 0;">
                    <input type="checkbox" class="form-check-input" id="3d-show-axes" checked style="margin: 0; cursor: pointer;">
                    <span>Axes</span>
                </label>
            </div>

            <div class="col-auto d-flex align-items-center gap-2">
                <label class="form-check-label small" style="display: flex; align-items: center; gap: 6px; cursor: pointer; margin: 0;">
                    <input type="checkbox" class="form-check-input" id="3d-show-toolpath" checked style="margin: 0; cursor: pointer;">
                    <span>Toolpath</span>
                </label>
            </div>

            <div class="col-auto d-flex align-items-center gap-2">
                <label class="form-check-label small" style="display: flex; align-items: center; gap: 6px; cursor: pointer; margin: 0;">
                    <input type="checkbox" class="form-check-input" id="3d-show-workpiece" checked style="margin: 0; cursor: pointer;">
                    <span>Workpiece</span>
                </label>
            </div>

            <div class="col-auto d-flex align-items-center gap-2">
                <label class="form-check-label small" style="display: flex; align-items: center; gap: 6px; cursor: pointer; margin: 0;">
                    <input type="checkbox" class="form-check-input" id="3d-show-stl" checked style="margin: 0; cursor: pointer;">
                    <span>STL Model</span>
                </label>
            </div>

            <div class="col-auto d-flex align-items-center gap-2">
            <hspacer style="width: 1px; height: 20px; margin: 0 8px; background-color: var(--bs-secondary);"></hspacer>
                <span class="small">Progress:</span>
                <input type="range" class="form-range form-range-sm" id="3d-simulation-progress" min="0" max="1" step="1" value="0" style="width: 150px;">
                <span id="3d-progress-display" class="small">Line 0 (0%)</span>
            </div>

            <div class="col-auto d-flex align-items-center gap-2">
                <span class="small">G-code:</span>
                <span id="3d-step-display" class="small">0 / 0</span>
            </div>


            <div class="col-auto d-flex align-items-center gap-2">
                <span class="small">Feed:</span>
                <span class="small"><span id="3d-feed-rate-display">0</span> mm/min</span>
            </div>

            <div class="col-auto d-flex align-items-center gap-2">
                <span class="small">Time:</span>
                <span class="small"><span id="3d-simulation-time">0:00</span> / <span id="3d-total-time">0:00</span></span>
            </div>
        </div>
    `;

    // Wire up 3D controls
    document.getElementById('3d-start-simulation').addEventListener('click', () => {
        if (typeof startSimulation3D === 'function') {
            startSimulation3D();
        }
    });

    document.getElementById('3d-pause-simulation').addEventListener('click', () => {
        if (typeof pauseSimulation3D === 'function') {
            pauseSimulation3D();
        }
    });

    document.getElementById('3d-stop-simulation').addEventListener('click', () => {
        if (typeof stopSimulation3D === 'function') {
            stopSimulation3D();
        }
        // Switch back to 2D view (matches 2D stop button behavior)
        const tab2D = document.getElementById('2d-tab');
        if (tab2D) {
            const bsTab = bootstrap.Tab.getOrCreateInstance(tab2D);
            bsTab.show();
        }
    });

    // Speed control
    document.getElementById('3d-simulation-speed').addEventListener('input', function (e) {
        const speed = parseFloat(e.target.value);
        document.getElementById('3d-speed-display').textContent = speed.toFixed(1) + 'x';
        if (typeof updateSimulation3DSpeed === 'function') {
            updateSimulation3DSpeed(speed);
        }
    });

    // Progress control - now line-based instead of percentage-based
    document.getElementById('3d-simulation-progress').addEventListener('input', function (e) {
        const lineNumber = parseInt(e.target.value);
        if (typeof setSimulation3DProgress === 'function') {
            setSimulation3DProgress(lineNumber);
        }
    });

    // Visibility checkboxes
    document.getElementById('3d-show-axes').addEventListener('change', function (e) {
        if (typeof setAxesVisibility3D === 'function') {
            setAxesVisibility3D(e.target.checked);
        }
    });

    document.getElementById('3d-show-toolpath').addEventListener('change', function (e) {
        if (typeof setToolpathVisibility3D === 'function') {
            setToolpathVisibility3D(e.target.checked);
        }
    });

    document.getElementById('3d-show-workpiece').addEventListener('change', function (e) {
        if (typeof setWorkpieceVisibility3D === 'function') {
            setWorkpieceVisibility3D(e.target.checked);
        }
    });

    document.getElementById('3d-show-stl').addEventListener('change', function (e) {
        if (typeof setSTLVisibility3D === 'function') {
            setSTLVisibility3D(e.target.checked);
        }
    });
}
