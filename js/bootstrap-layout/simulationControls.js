// Simulation control overlays for the 2D and 3D canvas tabs.
// Extracted from js/bootstrap-layout.js. Loaded as a global-scope script
// (no ES6 modules) — see CLAUDE.md for the script-order constraint.

var simulationControls2DRefs = null;
var simulationControls3DRefs = null;

function createIconNode(iconName) {
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', iconName);
    return icon;
}

function createSimulationMetric(label, valueNode, unitText) {
    const wrapper = document.createElement('div');
    wrapper.className = 'col-auto d-flex align-items-center gap-2';

    const labelNode = document.createElement('span');
    labelNode.className = 'small';
    labelNode.textContent = label;

    const valueWrapper = document.createElement('span');
    valueWrapper.className = 'small';
    valueWrapper.appendChild(valueNode);
    if (unitText) {
        valueWrapper.appendChild(document.createTextNode(unitText));
    }

    wrapper.appendChild(labelNode);
    wrapper.appendChild(valueWrapper);

    return wrapper;
}

function createSimulationDivider() {
    const divider = document.createElement('hspacer');
    divider.style.width = '0.5px';
    divider.style.height = '14px';
    divider.style.margin = '0 6px';
    divider.style.backgroundColor = 'rgba(108, 117, 125, 0.35)';
    return divider;
}

function ensure2DSimulationControls() {
    const overlayControls = document.getElementById('2d-simulation-controls');
    if (!overlayControls) {
        return null;
    }

    if (simulationControls2DRefs && simulationControls2DRefs.container === overlayControls) {
        return simulationControls2DRefs;
    }

    const fragment = document.createDocumentFragment();
    const row = document.createElement('div');
    row.className = 'row g-2 w-100';

    const buttonsCol = document.createElement('div');
    buttonsCol.className = 'col-auto';

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'btn btn-outline-primary btn-sm';
    startBtn.id = 'start-simulation';
    startBtn.appendChild(createIconNode('play'));

    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.className = 'btn btn-outline-secondary btn-sm';
    pauseBtn.id = 'pause-simulation';
    pauseBtn.disabled = true;
    pauseBtn.appendChild(createIconNode('pause'));

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'btn btn-outline-secondary btn-sm';
    stopBtn.id = 'stop-simulation';
    stopBtn.disabled = true;
    stopBtn.appendChild(createIconNode('octagon-x'));

    buttonsCol.appendChild(startBtn);
    buttonsCol.appendChild(pauseBtn);
    buttonsCol.appendChild(stopBtn);
    row.appendChild(buttonsCol);

    const speedCol = document.createElement('div');
    speedCol.className = 'col-auto d-flex align-items-center gap-2';

    const speedLabel = document.createElement('span');
    speedLabel.className = 'small';
    speedLabel.textContent = 'Speed:';

    const speedInput = document.createElement('input');
    speedInput.type = 'range';
    speedInput.className = 'form-range form-range-sm';
    speedInput.id = 'simulation-speed';
    speedInput.min = '1';
    speedInput.max = '50';
    speedInput.step = '0.5';
    speedInput.value = '5';
    speedInput.style.width = '60px';

    const speedDisplay = document.createElement('span');
    speedDisplay.id = 'speed-display';
    speedDisplay.className = 'small';
    speedDisplay.textContent = '5x';

    speedCol.appendChild(speedLabel);
    speedCol.appendChild(speedInput);
    speedCol.appendChild(speedDisplay);
    row.appendChild(speedCol);

    const progressCol = document.createElement('div');
    progressCol.className = 'col-auto d-flex align-items-center gap-2';
    progressCol.appendChild(createSimulationDivider());

    const progressLabel = document.createElement('span');
    progressLabel.className = 'small';
    progressLabel.textContent = 'Progress:';

    const progressInput = document.createElement('input');
    progressInput.type = 'range';
    progressInput.className = 'form-range form-range-sm';
    progressInput.id = 'simulation-step';
    progressInput.min = '0';
    progressInput.max = '100';
    progressInput.step = '1';
    progressInput.value = '0';
    progressInput.style.width = '150px';

    progressCol.appendChild(progressLabel);
    progressCol.appendChild(progressInput);
    row.appendChild(progressCol);

    const stepDisplay = document.createElement('span');
    stepDisplay.id = '2d-step-display';
    stepDisplay.className = 'small';
    stepDisplay.textContent = '0 / 0';
    row.appendChild(createSimulationMetric('G-code:', stepDisplay));

    const feedValue = document.createElement('span');
    feedValue.id = '2d-feed-rate-display';
    feedValue.textContent = '0';
    row.appendChild(createSimulationMetric('Feed:', feedValue, ' mm/min'));

    const timeValue = document.createElement('span');
    const simulationTime = document.createElement('span');
    simulationTime.id = '2d-simulation-time';
    simulationTime.textContent = '0:00';
    const totalTime = document.createElement('span');
    totalTime.id = '2d-total-time';
    totalTime.textContent = '0:00';
    timeValue.appendChild(simulationTime);
    timeValue.appendChild(document.createTextNode(' / '));
    timeValue.appendChild(totalTime);
    row.appendChild(createSimulationMetric('Time:', timeValue));

    const zDepthValue = document.createElement('span');
    zDepthValue.id = '2d-z-depth-display';
    zDepthValue.textContent = '0.00';
    row.appendChild(createSimulationMetric('Z:', zDepthValue, ' mm'));

    fragment.appendChild(row);
    overlayControls.replaceChildren(fragment);

    if (typeof startSimulation2D === 'function') {
        startBtn.addEventListener('click', startSimulation2D);
    }
    if (typeof pauseSimulation2D === 'function') {
        pauseBtn.addEventListener('click', pauseSimulation2D);
    }
    if (typeof stopSimulation2D === 'function') {
        stopBtn.addEventListener('click', stopSimulation2D);
    }

    speedInput.addEventListener('input', function (e) {
        const speed = parseFloat(e.target.value);
        speedDisplay.textContent = speed + 'x';
        if (typeof updateSimulation2DSpeed === 'function') {
            updateSimulation2DSpeed(speed);
        }
    });

    progressInput.addEventListener('input', function (e) {
        const lineIndex = parseInt(e.target.value, 10);
        if (typeof setSimulation2DLineNumber === 'function') {
            setSimulation2DLineNumber(lineIndex);
        }
    });

    simulationControls2DRefs = {
        container: overlayControls,
        startBtn: startBtn,
        pauseBtn: pauseBtn,
        stopBtn: stopBtn,
        speedInput: speedInput,
        speedDisplay: speedDisplay,
        progressInput: progressInput,
        stepDisplay: stepDisplay,
        feedValue: feedValue,
        simulationTime: simulationTime,
        totalTime: totalTime,
        zDepthValue: zDepthValue
    };

    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }

    return simulationControls2DRefs;
}

function create2DSimulationControls() {
    ensure2DSimulationControls();
}

function update3DSimulationOverlayLayout() {
    const overlay = document.getElementById('simulation-overlay-3d');
    const container = document.getElementById('3d-canvas-container');

    if (!overlay || !container) {
        return;
    }

    const overlayHeight = overlay.classList.contains('d-none') ? 0 : overlay.offsetHeight;
    container.style.height = overlayHeight > 0 ? `calc(100% - ${overlayHeight}px)` : '100%';
}

function create3DVisibilityControl(id, labelText, checked) {
    const wrapper = document.createElement('div');
    wrapper.className = 'col-auto d-flex align-items-center gap-2';

    const label = document.createElement('label');
    label.className = 'form-check-label small';
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    label.style.cursor = 'pointer';
    label.style.margin = '0';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'form-check-input';
    input.id = id;
    input.checked = checked;
    input.style.margin = '0';
    input.style.cursor = 'pointer';

    const text = document.createElement('span');
    text.textContent = labelText;

    label.appendChild(input);
    label.appendChild(text);
    wrapper.appendChild(label);

    return { wrapper: wrapper, input: input };
}

function ensure3DSimulationControls() {
    const overlayControls = document.getElementById('3d-simulation-controls');
    if (!overlayControls) {
        return null;
    }

    if (simulationControls3DRefs && simulationControls3DRefs.container === overlayControls) {
        update3DSimulationOverlayLayout();
        return simulationControls3DRefs;
    }

    const fragment = document.createDocumentFragment();
    const controlsRow = document.createElement('div');
    controlsRow.className = 'row g-2 w-100 align-items-center';

    const metricsRow = document.createElement('div');
    metricsRow.className = 'row gx-4 gy-2 w-100 align-items-center mt-1';

    const buttonsCol = document.createElement('div');
    buttonsCol.className = 'col-auto';

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'btn btn-outline-primary btn-sm';
    startBtn.id = '3d-start-simulation';
    startBtn.appendChild(createIconNode('play'));

    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.className = 'btn btn-outline-secondary btn-sm';
    pauseBtn.id = '3d-pause-simulation';
    pauseBtn.disabled = true;
    pauseBtn.appendChild(createIconNode('pause'));

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'btn btn-outline-secondary btn-sm';
    stopBtn.id = '3d-stop-simulation';
    stopBtn.disabled = true;
    stopBtn.appendChild(createIconNode('octagon-x'));

    buttonsCol.appendChild(startBtn);
    buttonsCol.appendChild(pauseBtn);
    buttonsCol.appendChild(stopBtn);
    controlsRow.appendChild(buttonsCol);

    const speedCol = document.createElement('div');
    speedCol.className = 'col-auto d-flex align-items-center gap-2';

    const speedLabel = document.createElement('span');
    speedLabel.className = 'small';
    speedLabel.textContent = 'Speed:';

    const speedInput = document.createElement('input');
    speedInput.type = 'range';
    speedInput.className = 'form-range form-range-sm';
    speedInput.id = '3d-simulation-speed';
    speedInput.min = '1';
    speedInput.max = '50';
    speedInput.step = '0.5';
    speedInput.value = '4';
    speedInput.style.width = '60px';

    const speedDisplay = document.createElement('span');
    speedDisplay.id = '3d-speed-display';
    speedDisplay.className = 'small';
    speedDisplay.textContent = '4x';

    speedCol.appendChild(speedLabel);
    speedCol.appendChild(speedInput);
    speedCol.appendChild(speedDisplay);
    controlsRow.appendChild(speedCol);

    const axesControl = create3DVisibilityControl('3d-show-axes', 'Axes', true);
    const toolpathControl = create3DVisibilityControl('3d-show-toolpath', 'Toolpath', true);
    const workpieceControl = create3DVisibilityControl('3d-show-workpiece', 'Workpiece', true);
    const stlControl = create3DVisibilityControl('3d-show-stl', 'STL Model', true);
    const followToolControl = create3DVisibilityControl('3d-follow-tool', 'Follow Tool', false);

    controlsRow.appendChild(axesControl.wrapper);
    controlsRow.appendChild(toolpathControl.wrapper);
    controlsRow.appendChild(workpieceControl.wrapper);
    controlsRow.appendChild(stlControl.wrapper);
    controlsRow.appendChild(followToolControl.wrapper);

    const progressCol = document.createElement('div');
    progressCol.className = 'col-auto d-flex align-items-center gap-2';
    progressCol.appendChild(createSimulationDivider());

    const progressLabel = document.createElement('span');
    progressLabel.className = 'small';
    progressLabel.textContent = 'Progress:';

    const progressInput = document.createElement('input');
    progressInput.type = 'range';
    progressInput.className = 'form-range form-range-sm';
    progressInput.id = '3d-simulation-progress';
    progressInput.min = '0';
    progressInput.max = '1';
    progressInput.step = '1';
    progressInput.value = '0';
    progressInput.style.width = '150px';

    const progressDisplay = document.createElement('span');
    progressDisplay.id = '3d-progress-display';
    progressDisplay.className = 'small';
    progressDisplay.textContent = '0/0 (0%)';

    progressCol.appendChild(progressLabel);
    progressCol.appendChild(progressInput);
    controlsRow.appendChild(progressCol);

    metricsRow.appendChild(createSimulationMetric('Line:', progressDisplay));

    const stepDisplay = document.createElement('span');
    stepDisplay.id = '3d-step-display';
    stepDisplay.className = 'small';
    stepDisplay.textContent = '0 / 0';
    metricsRow.appendChild(createSimulationMetric('G-code:', stepDisplay));

    const feedValue = document.createElement('span');
    feedValue.id = '3d-feed-rate-display';
    feedValue.textContent = '0';
    metricsRow.appendChild(createSimulationMetric('Feed:', feedValue, ' mm/min'));

    const timeValue = document.createElement('span');
    const simulationTime = document.createElement('span');
    simulationTime.id = '3d-simulation-time';
    simulationTime.textContent = '0:00';
    const totalTime = document.createElement('span');
    totalTime.id = '3d-total-time';
    totalTime.textContent = '0:00';
    timeValue.appendChild(simulationTime);
    timeValue.appendChild(document.createTextNode(' / '));
    timeValue.appendChild(totalTime);
    metricsRow.appendChild(createSimulationMetric('Time:', timeValue));

    fragment.appendChild(controlsRow);
    fragment.appendChild(metricsRow);
    overlayControls.replaceChildren(fragment);

    startBtn.addEventListener('click', () => {
        if (typeof startSimulation3D === 'function') {
            startSimulation3D();
        }
    });

    pauseBtn.addEventListener('click', () => {
        if (typeof pauseSimulation3D === 'function') {
            pauseSimulation3D();
        }
    });

    stopBtn.addEventListener('click', () => {
        if (typeof stopSimulation3D === 'function') {
            stopSimulation3D();
        }
        const tab2D = document.getElementById('2d-tab');
        if (tab2D) {
            const bsTab = bootstrap.Tab.getOrCreateInstance(tab2D);
            bsTab.show();
        }
    });

    speedInput.addEventListener('input', function (e) {
        const speed = parseFloat(e.target.value);
        speedDisplay.textContent = speed.toFixed(1) + 'x';
        if (typeof updateSimulation3DSpeed === 'function') {
            updateSimulation3DSpeed(speed);
        }
    });

    progressInput.addEventListener('input', function (e) {
        const lineNumber = parseInt(e.target.value, 10);
        if (typeof setSimulation3DProgress === 'function') {
            setSimulation3DProgress(lineNumber);
        }
    });

    axesControl.input.addEventListener('change', function (e) {
        if (typeof setAxesVisibility3D === 'function') {
            setAxesVisibility3D(e.target.checked);
        }
    });

    toolpathControl.input.addEventListener('change', function (e) {
        if (typeof setToolpathVisibility3D === 'function') {
            setToolpathVisibility3D(e.target.checked);
        }
    });

    workpieceControl.input.addEventListener('change', function (e) {
        if (typeof setWorkpieceVisibility3D === 'function') {
            setWorkpieceVisibility3D(e.target.checked);
        }
    });

    stlControl.input.addEventListener('change', function (e) {
        if (typeof setSTLVisibility3D === 'function') {
            setSTLVisibility3D(e.target.checked);
        }
    });

    simulationControls3DRefs = {
        container: overlayControls,
        startBtn: startBtn,
        pauseBtn: pauseBtn,
        stopBtn: stopBtn,
        speedInput: speedInput,
        speedDisplay: speedDisplay,
        progressInput: progressInput,
        progressDisplay: progressDisplay,
        stepDisplay: stepDisplay,
        feedValue: feedValue,
        simulationTime: simulationTime,
        totalTime: totalTime,
        showAxes: axesControl.input,
        showToolpath: toolpathControl.input,
        showWorkpiece: workpieceControl.input,
        showStl: stlControl.input,
        followTool: followToolControl.input
    };

    update3DSimulationOverlayLayout();

    if (window.ResizeObserver) {
        if (window._simulationOverlay3DResizeObserver) {
            window._simulationOverlay3DResizeObserver.disconnect();
        }

        const overlay = document.getElementById('simulation-overlay-3d');
        if (overlay) {
            window._simulationOverlay3DResizeObserver = new ResizeObserver(() => {
                update3DSimulationOverlayLayout();
                if (typeof requestThreeRender === 'function') {
                    requestThreeRender();
                }
            });
            window._simulationOverlay3DResizeObserver.observe(overlay);
        }
    }

    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }

    window.update3DSimulationOverlayLayout = update3DSimulationOverlayLayout;
    return simulationControls3DRefs;
}

function create3DSimulationControls() {
    ensure3DSimulationControls();
}
