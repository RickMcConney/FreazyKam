// Simulation control overlays for the 2D and 3D canvas tabs.
// Extracted from js/bootstrap-layout.js. Loaded as a global-scope script
// (no ES6 modules) — see CLAUDE.md for the script-order constraint.

var simulationControls2DRefs = null;
var simulationControls3DRefs = null;

function set3DSimulationControlsReady(isReady) {
    const refs = ensure3DSimulationControls();
    if (!refs) {
        return;
    }

    refs.isSimulationReady = !!isReady;

    if (refs.summaryRow) {
        refs.summaryRow.classList.toggle('d-none', refs.isSimulationReady);
    }

    if (refs.controlsRow) {
        refs.controlsRow.classList.toggle('d-none', !refs.isSimulationReady);
    }

    ['summaryMenu', 'controlsMenu'].forEach(function(menuKey) {
        const menuRefs = refs[menuKey];
        const showToolWrapper = menuRefs && menuRefs.showTool ? menuRefs.showTool.closest('.dropdown-item') : null;
        const followToolWrapper = menuRefs && menuRefs.followTool ? menuRefs.followTool.closest('.dropdown-item') : null;
        if (showToolWrapper) {
            showToolWrapper.classList.toggle('d-none', !refs.isSimulationReady);
        }
        if (followToolWrapper) {
            followToolWrapper.classList.toggle('d-none', !refs.isSimulationReady);
        }
    });

    if (typeof setToolVisibility3D === 'function') {
        const showTool = refs.isSimulationReady && get3DSimulationControlState('showTool', true);
        setToolVisibility3D(showTool);
    }

    update3DSimulationOverlayLayout();

    if (typeof requestThreeRender === 'function') {
        requestThreeRender();
    }
}

window.set3DSimulationControlsReady = set3DSimulationControlsReady;

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

function create3DSimulationMenuItem(id, labelText, checked) {
    const wrapper = document.createElement('label');
    wrapper.className = 'dropdown-item d-flex align-items-center gap-2 mb-0';
    wrapper.style.cursor = 'pointer';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'form-check-input mt-0';
    input.id = id;
    input.checked = checked;

    const text = document.createElement('span');
    text.className = 'small';
    text.textContent = labelText;

    wrapper.appendChild(input);
    wrapper.appendChild(text);

    return { wrapper: wrapper, input: input };
}

function create3DSimulationMenu(prefix) {
    const container = document.createElement('div');
    container.className = 'col-auto dropdown';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-outline-secondary btn-sm 3d-simulation-menu-button';
    button.setAttribute('data-bs-toggle', 'dropdown');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', '3D display options');
    button.innerHTML = '<span class="three-dots-vertical" aria-hidden="true"></span>';

    const menu = document.createElement('div');
    menu.className = 'dropdown-menu dropdown-menu-end simulation-overlay-menu';

    const showWorkpiece = false; //create3DSimulationMenuItem(prefix + '-show-workpiece', 'Workpiece', true);
    const showAxes = create3DSimulationMenuItem(prefix + '-show-axes', 'Axis', true);
    const showTool = create3DSimulationMenuItem(prefix + '-show-tool', 'Tool', true);
    const followTool = create3DSimulationMenuItem(prefix + '-follow-tool', 'Follow Tool', false);
    if (!!showWorkpiece) menu.appendChild(showWorkpiece.wrapper);
    menu.appendChild(showAxes.wrapper);
    menu.appendChild(showTool.wrapper);
    menu.appendChild(followTool.wrapper);

    container.appendChild(button);
    container.appendChild(menu);

    return {
        container: container,
        showWorkpiece: !!showWorkpiece ?showWorkpiece.input: false,
        showAxes: showAxes.input,
        showTool: showTool.input,
        followTool: followTool.input
    };
}

function sync3DSimulationMenuState(controlName, checked) {
    if (!simulationControls3DRefs) {
        return;
    }

    ['summaryMenu', 'controlsMenu'].forEach(function(menuKey) {
        const input = simulationControls3DRefs[menuKey] && simulationControls3DRefs[menuKey][controlName];
        if (input) {
            input.checked = checked;
        }
    });
}

function get3DSimulationControlState(controlName, fallback) {
    if (!simulationControls3DRefs) {
        return fallback;
    }

    const summaryInput = simulationControls3DRefs.summaryMenu && simulationControls3DRefs.summaryMenu[controlName];
    if (summaryInput) {
        return summaryInput.checked;
    }

    const controlsInput = simulationControls3DRefs.controlsMenu && simulationControls3DRefs.controlsMenu[controlName];
    if (controlsInput) {
        return controlsInput.checked;
    }

    return fallback;
}

window.get3DSimulationControlState = get3DSimulationControlState;

function ensure3DSimulationControls() {
    const overlayControls = document.getElementById('3d-simulation-controls');
    const cutSettingsBtn = document.getElementById('3d-cut-settings');
    const hasExistingCutSettingsHandler = cutSettingsBtn && cutSettingsBtn.dataset.boundCutSettings === 'true';
    if (!overlayControls) {
        return null;
    }

    if (simulationControls3DRefs && simulationControls3DRefs.container === overlayControls) {
        simulationControls3DRefs.cutSettingsBtn = cutSettingsBtn;
        update3DSimulationOverlayLayout();
        return simulationControls3DRefs;
    }

    const fragment = document.createDocumentFragment();
    const summaryRow = document.createElement('div');
    summaryRow.className = 'd-flex w-100 align-items-center justify-content-end gap-3 flex-wrap';

    const simulateBtn = document.createElement('button');
    simulateBtn.type = 'button';
    simulateBtn.className = 'btn btn-primary btn-sm';
    simulateBtn.id = '3d-generate-gcode';
    simulateBtn.appendChild(document.createTextNode('Simulate'));

    const summaryActions = document.createElement('div');
    summaryActions.className = 'd-flex align-items-center gap-2';
    const summaryMenu = create3DSimulationMenu('3d-summary');
    summaryActions.appendChild(simulateBtn);
    summaryActions.appendChild(summaryMenu.container);
    summaryRow.appendChild(summaryActions);

    const controlsRow = document.createElement('div');
    controlsRow.className = 'd-none 3d-simulation-player';

    const topRow = document.createElement('div');
    topRow.className = '3d-simulation-player-top-row';

    const startBtn = document.createElement('span');
    startBtn.className = '3d-simulation-icon-button';
    startBtn.id = '3d-start-simulation';
    startBtn.setAttribute('role', 'button');
    startBtn.tabIndex = 0;
    startBtn.setAttribute('aria-label', 'Play simulation');
    startBtn.setAttribute('aria-disabled', 'true');
    startBtn.appendChild(createIconNode('play'));

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-outline-secondary btn-sm 3d-simulation-close-button';
    closeBtn.id = '3d-close-simulation';
    closeBtn.setAttribute('aria-label', 'Close simulation');
    closeBtn.title = 'Close simulation';
    closeBtn.appendChild(document.createTextNode('X'));

    const timeWrap = document.createElement('div');
    timeWrap.className = '3d-simulation-time-group';

    const simulationTime = document.createElement('span');
    simulationTime.id = '3d-simulation-time';
    simulationTime.textContent = '0:00';

    const totalTime = document.createElement('span');
    totalTime.id = '3d-total-time';
    totalTime.textContent = '0:00';

    timeWrap.appendChild(simulationTime);
    timeWrap.appendChild(document.createTextNode(' / '));
    timeWrap.appendChild(totalTime);

    topRow.appendChild(timeWrap);
    topRow.appendChild(closeBtn);

    const progressRow = document.createElement('div');
    progressRow.className = '3d-simulation-progress-row';

    const progressCol = document.createElement('div');
    progressCol.className = '3d-simulation-progress-track';

    const progressInput = document.createElement('input');
    progressInput.type = 'range';
    progressInput.className = 'form-range form-range-sm 3d-simulation-progress-input';
    progressInput.id = '3d-simulation-progress';
    progressInput.min = '0';
    progressInput.max = '1';
    progressInput.step = '1';
    progressInput.value = '0';
    progressInput.style.setProperty('--range-progress', '0%');

    progressCol.appendChild(progressInput);

    const speedInput = document.createElement('select');
    speedInput.className = 'form-select form-select-sm 3d-simulation-speed-select';
    speedInput.id = '3d-simulation-speed';

    ['1', '2', '4', '8', '16', '32', '50'].forEach((speed) => {
        const option = document.createElement('option');
        option.value = speed;
        option.textContent = speed + 'x';
        if (speed === '4') {
            option.selected = true;
        }
        speedInput.appendChild(option);
    });

    progressRow.appendChild(progressCol);
    progressRow.appendChild(speedInput);

    const controlsMenu = create3DSimulationMenu('3d-controls');
    controlsMenu.container.classList.add('3d-simulation-menu-anchor');

    const bottomRow = document.createElement('div');
    bottomRow.className = '3d-simulation-player-bottom-row';
    bottomRow.appendChild(startBtn);
    bottomRow.appendChild(controlsMenu.container);

    controlsRow.appendChild(topRow);
    controlsRow.appendChild(progressRow);
    controlsRow.appendChild(bottomRow);

    fragment.appendChild(summaryRow);
    fragment.appendChild(controlsRow);
    overlayControls.replaceChildren(fragment);

    function handleStartToggle() {
        if (startBtn.getAttribute('aria-disabled') === 'true') {
            return;
        }
        if (typeof toggleSimulation3DPlayback === 'function') {
            toggleSimulation3DPlayback();
        }
    }

    startBtn.addEventListener('click', handleStartToggle);
    startBtn.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleStartToggle();
        }
    });
    startBtn.addEventListener('mouseenter', function () {
        startBtn.dataset.hovered = 'true';
        update3DSimulationStartButtonVisualState(startBtn);
    });
    startBtn.addEventListener('mouseleave', function () {
        delete startBtn.dataset.hovered;
        update3DSimulationStartButtonVisualState(startBtn);
    });
    startBtn.addEventListener('focus', function () {
        startBtn.dataset.focused = 'true';
        update3DSimulationStartButtonVisualState(startBtn);
    });
    startBtn.addEventListener('blur', function () {
        delete startBtn.dataset.focused;
        update3DSimulationStartButtonVisualState(startBtn);
    });
    update3DSimulationStartButtonVisualState(startBtn);

    speedInput.addEventListener('change', function (e) {
        const speed = parseFloat(e.target.value);
        if (typeof updateSimulation3DSpeed === 'function') {
            updateSimulation3DSpeed(speed);
        }
    });

    if (cutSettingsBtn && !hasExistingCutSettingsHandler) {
        cutSettingsBtn.addEventListener('click', function () {
            if (typeof showCutSettingsModal === 'function') {
                showCutSettingsModal();
            }
        });
        cutSettingsBtn.dataset.boundCutSettings = 'true';
    }

    simulateBtn.addEventListener('click', async function () {
        if (typeof generateAndLoad3DGcode === 'function') {
            const loaded = await generateAndLoad3DGcode({ showLoading: true, seekToLatestState: true });
            if (loaded) {
                set3DSimulationControlsReady(true);
            } else if (typeof notify === 'function') {
                notify('No prepared G-code available for simulation', 'info');
            }
        }
    });

    progressInput.addEventListener('input', function (e) {
        const lineNumber = parseInt(e.target.value, 10);
        if (typeof setSimulation3DProgress === 'function') {
            setSimulation3DProgress(lineNumber);
        }
    });

    progressInput.addEventListener('input', function () {
        update3DSimulationProgressFill(progressInput);
    });

    progressInput.addEventListener('change', function () {
        update3DSimulationProgressFill(progressInput);
    });

    closeBtn.addEventListener('click', function () {
        if (typeof window.schedulePrepared3DGcodeRefresh === 'function') {
            window.schedulePrepared3DGcodeRefresh({ delay: 0 });
        } else {
            set3DSimulationControlsReady(false);
        }
    });

    function bindMenuControls(menuRefs) {
        if (!!menuRefs.showWorkpiece) {
            menuRefs.showWorkpiece.addEventListener('change', function (e) {
                sync3DSimulationMenuState('showWorkpiece', e.target.checked);
                if (typeof setWorkpieceVisibility3D === 'function') {
                    setWorkpieceVisibility3D(e.target.checked);
                }
            });
        }
        menuRefs.showAxes.addEventListener('change', function (e) {
            sync3DSimulationMenuState('showAxes', e.target.checked);
            if (typeof setAxesVisibility3D === 'function') {
                setAxesVisibility3D(e.target.checked);
            }
        });

        menuRefs.showTool.addEventListener('change', function (e) {
            sync3DSimulationMenuState('showTool', e.target.checked);
            if (typeof setToolVisibility3D === 'function') {
                setToolVisibility3D(e.target.checked);
            }
        });

        menuRefs.followTool.addEventListener('change', function (e) {
            sync3DSimulationMenuState('followTool', e.target.checked);
        });

    }

    bindMenuControls(summaryMenu);
    bindMenuControls(controlsMenu);

    simulationControls3DRefs = {
        container: overlayControls,
        summaryRow: summaryRow,
        controlsRow: controlsRow,
        summaryMenu: summaryMenu,
        controlsMenu: controlsMenu,
        startBtn: startBtn,
        speedInput: speedInput,
        cutSettingsBtn: cutSettingsBtn,
        generateGcodeBtn: simulateBtn,
        closeBtn: closeBtn,
        progressInput: progressInput,
        simulationTime: simulationTime,
        totalTime: totalTime,
        isSimulationReady: false
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

function update3DSimulationStartButtonVisualState(startBtn) {
    const control = startBtn || document.getElementById('3d-start-simulation');
    if (!control) {
        return;
    }

    const disabled = control.getAttribute('aria-disabled') === 'true';
    const active = !disabled && (control.dataset.hovered === 'true' || control.dataset.focused === 'true');
    const icon = control.querySelector('svg');

    control.style.display = 'inline-flex';
    control.style.alignItems = 'center';
    control.style.justifyContent = 'center';
    control.style.minWidth = '0';
    control.style.minHeight = '0';
    control.style.padding = '0.18rem';
    control.style.border = 'none';
    control.style.outline = 'none';
    control.style.borderRadius = '999px';
    control.style.background = active ? 'rgba(61, 133, 198, 0.14)' : 'transparent';
    control.style.boxShadow = active ? '0 6px 14px rgba(61, 133, 198, 0.14)' : 'none';
    control.style.cursor = disabled ? 'default' : 'pointer';
    control.style.color = disabled ? 'var(--color-gray-500)' : 'var(--color-icon-blue)';
    control.style.opacity = disabled ? '0.45' : '1';
    control.style.transition = 'background-color 0.16s ease, box-shadow 0.16s ease, color 0.16s ease';

    if (!icon) {
        return;
    }

    icon.style.width = '18px';
    icon.style.height = '18px';
    icon.style.stroke = disabled ? 'var(--color-gray-500)' : 'var(--color-icon-blue)';
    icon.style.fill = active ? 'rgba(61, 133, 198, 0.22)' : 'transparent';
    icon.style.transform = active ? 'scale(1.08)' : 'scale(1)';
    icon.style.transition = 'fill 0.16s ease, stroke 0.16s ease, transform 0.16s ease';
}

window.update3DSimulationStartButtonVisualState = update3DSimulationStartButtonVisualState;

function update3DSimulationProgressFill(progressInput) {
    if (!progressInput) {
        return;
    }

    const min = Number(progressInput.min || 0);
    const max = Number(progressInput.max || 0);
    const value = Number(progressInput.value || 0);
    const range = max - min;
    const ratio = range > 0 ? (value - min) / range : 0;
    const percent = Math.max(0, Math.min(1, ratio)) * 100;
    progressInput.style.setProperty('--range-progress', percent + '%');
}

window.update3DSimulationProgressFill = update3DSimulationProgressFill;
