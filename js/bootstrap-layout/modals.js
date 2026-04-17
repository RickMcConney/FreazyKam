// Modal dialogs and the Options panel.
// Builds the modal DOM (Options, Help, profile name input, delete confirmations,
// generic confirm, reset confirmation) and exposes show* helpers + the
// Options table renderer / save / reset flow.
// Extracted from js/bootstrap-layout.js. Loaded as a global-scope script
// (no ES6 modules) — see CLAUDE.md for the script-order constraint.
//
// `notify`, `w2alert`, `w2popup` intentionally remain in bootstrap-layout.js
// because they're called from 16 other files as a cross-cutting utility.
// External callers of this file:
//   - cnc.js (showConfirmModal)
//   - operations/Workpiece.js (recalculateToolPercentages)

function createModals() {
    const body = document.body;

    // Options modal
    const optionsModal = document.createElement('div');
    optionsModal.innerHTML = `
        <div class="modal fade" id="optionsModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Options</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="table-responsive">
                            <table class="table options-table" id="options-table">
                                <thead>
                                    <tr>
                                        <th>Option</th>
                                        <th>Description</th>
                                        <th>Value</th>
                                    </tr>
                                </thead>
                                <tbody id="options-table-body">
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-danger" id="reset-options">Reset to Defaults</button>
                        <div class="ms-auto">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            <button type="button" class="btn btn-primary" id="save-options">Save</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(optionsModal);

    // Help modal
    const helpModal = document.createElement('div');
    helpModal.innerHTML = `
        <div class="modal fade" id="helpModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-info bg-opacity-10">
                        <h5 class="modal-title text-info-emphasis">
                            <i data-lucide="help-circle"></i>
                            FreazyKam Help
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <!-- Getting Started -->
                        <div class="mb-4">
                            <h6 class="text-primary mb-3">
                                <i data-lucide="play-circle"></i>
                                Getting Started
                            </h6>
                            <ol class="small">
                                <li class="mb-2"><strong>Import SVG:</strong> Click "Import SVG" to import your design file</li>
                                <li class="mb-2"><strong>Configure Workpiece:</strong> Set material dimensions and origin point</li>
                                <li class="mb-2"><strong>Select Paths:</strong> Choose which SVG paths to machine</li>
                                <li class="mb-2"><strong>Assign Operations:</strong> Apply machining operations to selected paths</li>
                                <li class="mb-2"><strong>Set Tools:</strong> Define cutting tools in the Tool Library</li>
                                <li class="mb-2"><strong>Simulate Toolpaths:</strong> Preview machining in 2D/3D simulation</li>
                                <li class="mb-2"><strong>Export G-code:</strong> Click "Gcode" to download your toolpaths</li>
                            </ol>
                        </div>

                        <hr>

                        <!-- Mouse Controls -->
                        <div class="mb-4">
                            <h6 class="text-primary mb-3">
                                <i data-lucide="mouse"></i>
                                Mouse Controls
                            </h6>
                            <div class="row small">
                                <div class="col-md-6">
                                    <ul class="list-unstyled">
                                        <li class="mb-2">
                                            <span class="badge bg-secondary">Scroll Wheel</span>
                                            Zoom in/out
                                        </li>
                                        <li class="mb-2">
                                            <span class="badge bg-secondary">Middle Click + Drag</span>
                                            Pan view
                                        </li>
                                    </ul>
                                </div>
                                <div class="col-md-6">
                                    <ul class="list-unstyled">
                                        <li class="mb-2">
                                            <span class="badge bg-secondary">Left Click</span>
                                            Select/Draw
                                        </li>
                                        <li class="mb-2">
                                            <span class="badge bg-secondary">Left Click + Drag</span>
                                            Select/Draw
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <hr>

                        <!-- Keyboard Shortcuts -->
                        <div class="mb-4">
                            <h6 class="text-primary mb-3">
                                <i data-lucide="keyboard"></i>
                                Keyboard Shortcuts
                            </h6>
                            <div class="row small">
                                <div class="col-md-6">
                                    <ul class="list-unstyled">
                                        <li class="mb-2">
                                            <kbd>Ctrl/Cmd + Z</kbd> Undo
                                        </li>
                                        <li class="mb-2">
                                            <kbd>Ctrl/Cmd + Y</kbd> Redo
                                        </li>
                                        <li class="mb-2">
                                            <kbd>Delete</kbd> Delete selected
                                        </li>
                                    </ul>
                                </div>
                                <div class="col-md-6">
                                    <ul class="list-unstyled">
                                        <li class="mb-2">
                                            <kbd>Ctrl/Cmd + S</kbd> Save project
                                        </li>
                                        <li class="mb-2">
                                            <kbd>Ctrl/Cmd + O</kbd> Open SVG
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <hr>

                        <!-- Tips & Tricks -->
                        <div class="mb-4">
                            <h6 class="text-primary mb-3">
                                <i data-lucide="lightbulb"></i>
                                Tips & Tricks
                            </h6>
                            <ul class="small">
                                <li class="mb-2"><strong>Tool Library:</strong> Configure your tools in the Tools tab - set diameter, feed rates, and RPM</li>
                                <li class="mb-2"><strong>Operation Order:</strong> Toolpaths are cut in the order they are in the side panel. Use the toolpath context menu to reorder operations</li>
                                <li class="mb-2"><strong>Visibility:</strong> Toggle path visibility with the eye icon to control what gets exported</li>
                                <li class="mb-2"><strong>G-code Profiles:</strong> Create custom post-processor profiles for different CNC machines</li>
                                <li class="mb-2"><strong>Material Selection:</strong> Choose wood species in Workpiece settings for optimized feed rates</li>
                                <li class="mb-2"><strong>Simulation:</strong> Use the 2D or 3Dsimulation controls to preview toolpaths before exporting</li>
                            </ul>
                        </div>

                        <hr>

                        <!-- Advanced Features -->
                        <div class="mb-4">
                            <h6 class="text-primary mb-3">
                                <i data-lucide="settings"></i>
                                Advanced Features
                            </h6>
                            <div class="small">
                                <p class="mb-2"><strong>Post Processor Templates:</strong></p>
                                <ul>
                                    <li>Use <code>X Y Z F S</code> placeholders in G-code templates</li>
                                    <li>Axis inversion: <code>-X -Y -Z</code> negates values</li>
                                    <li>Axis swapping: <code>Y X Z</code> swaps coordinates</li>
                                    <li><code>S</code> placeholder uses tool RPM for spindle speed</li>
                                </ul>
                                <p class="mb-2 mt-3"><strong>Path Editing:</strong></p>
                                <ul>
                                    <li>Use "Edit" tool to modify path vertices</li>
                                    <li>Text objects can be re-edited after creation</li>
                                    <li>Shape properties can be changed after creation</li>
                                </ul>
                            </div>
                        </div>

                        <hr>

                        <div class="text-center">
                            <p class="text-muted small mb-0">&copy; 2025 Rick McConney</p>
                            <p class="text-muted small">Browser-based CNC CAM Application</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Got it!</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(helpModal);

    // Profile Name Input Modal
    const profileNameModal = document.createElement('div');
    profileNameModal.innerHTML = `
        <div class="modal fade" id="profileNameModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i data-lucide="file-plus"></i>
                            New G-code Profile
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label for="profile-name-input" class="form-label">Profile Name</label>
                            <input type="text" class="form-control" id="profile-name-input" placeholder="Enter profile name" autofocus>
                            <div class="invalid-feedback" id="profile-name-error">
                                A profile with this name already exists
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="confirm-profile-name">Create</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(profileNameModal);

    // Delete Profile Confirmation Modal
    const deleteConfirmModal = document.createElement('div');
    deleteConfirmModal.innerHTML = `
        <div class="modal fade" id="deleteConfirmModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-danger text-white">
                        <h5 class="modal-title">
                            <i data-lucide="alert-triangle"></i>
                            Delete Profile
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete the profile "<strong id="delete-profile-name"></strong>"?</p>
                        <p class="text-muted mb-0">This action cannot be undone.</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-danger" id="confirm-delete-profile">Delete</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(deleteConfirmModal);

    // Delete Tool Confirmation Modal
    const deleteToolModal = document.createElement('div');
    deleteToolModal.innerHTML = `
        <div class="modal fade" id="deleteToolModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-danger text-white">
                        <h5 class="modal-title">
                            <i data-lucide="alert-triangle"></i>
                            Delete Tool
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete the tool "<strong id="delete-tool-name"></strong>"?</p>
                        <p class="text-muted mb-0">This action cannot be undone.</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-danger" id="confirm-delete-tool">Delete</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(deleteToolModal);

    // Generic Confirmation Modal (reusable)
    const confirmModal = document.createElement('div');
    confirmModal.innerHTML = `
        <div class="modal fade" id="confirmModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header" id="confirm-modal-header">
                        <h5 class="modal-title" id="confirm-modal-title">
                            <i data-lucide="alert-triangle"></i>
                            Confirm Action
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body" id="confirm-modal-body">
                        <p>Are you sure?</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-danger" id="confirm-modal-confirm">Confirm</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(confirmModal);

    // Reset Options Confirmation Modal
    const resetOptionsModal = document.createElement('div');
    resetOptionsModal.innerHTML = `
        <div class="modal fade" id="resetOptionsModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-warning text-dark">
                        <h5 class="modal-title">
                            <i data-lucide="alert-triangle"></i>
                            Reset Options
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to reset all options to their default values?</p>
                        <p class="text-muted mb-0">This will also reset the workpiece properties.</p>
                        <p class="text-muted mb-0">This action cannot be undone.</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-danger" id="confirm-reset-options">Reset</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(resetOptionsModal);

    // Add options modal event handlers
    document.getElementById('save-options').addEventListener('click', saveOptions);
    document.getElementById('reset-options').addEventListener('click', showResetOptionsConfirmation);
}

function showOptionsModal() {
    renderOptionsTable();
    const modal = new bootstrap.Modal(document.getElementById('optionsModal'));
    modal.show();
}

function showHelpModal() {
    const modal = new bootstrap.Modal(document.getElementById('helpModal'));
    modal.show();
    // Initialize Lucide icons in the modal
    lucide.createIcons();
}

/**
 * Show a reusable confirmation dialog
 * @param {Object} options - Configuration options
 * @param {string} options.title - Modal title (default: "Confirm Action")
 * @param {string} options.message - Message to display (HTML supported)
 * @param {string} options.confirmText - Text for confirm button (default: "Confirm")
 * @param {string} options.confirmClass - Bootstrap class for confirm button (default: "btn-danger")
 * @param {string} options.headerClass - Bootstrap class for header (default: "bg-danger text-white")
 * @param {Function} options.onConfirm - Callback function when confirmed
 */
function showConfirmModal(options) {
    const {
        title = 'Confirm Action',
        message = 'Are you sure?',
        confirmText = 'Confirm',
        confirmClass = 'btn-danger',
        headerClass = 'bg-danger text-white',
        onConfirm = null
    } = options;

    const modalElement = document.getElementById('confirmModal');
    const header = document.getElementById('confirm-modal-header');
    const titleElement = document.getElementById('confirm-modal-title');
    const body = document.getElementById('confirm-modal-body');
    const confirmBtn = document.getElementById('confirm-modal-confirm');
    const closeBtn = header.querySelector('.btn-close');

    // Set header styling
    header.className = `modal-header ${headerClass}`;

    // Update close button styling based on header
    if (headerClass.includes('text-white')) {
        closeBtn.classList.add('btn-close-white');
    } else {
        closeBtn.classList.remove('btn-close-white');
    }

    // Set content
    titleElement.innerHTML = `<i data-lucide="alert-triangle"></i> ${title}`;
    body.innerHTML = message;

    // Set button text and styling
    confirmBtn.textContent = confirmText;
    confirmBtn.className = `btn ${confirmClass}`;

    // Remove any existing event listeners by replacing the button
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    // Add new event listener
    if (onConfirm) {
        newConfirmBtn.addEventListener('click', function () {
            onConfirm();
            const modal = bootstrap.Modal.getInstance(modalElement);
            modal.hide();
        }, { once: true });
    }

    // Show the modal
    const modal = new bootstrap.Modal(modalElement);
    modal.show();

    // Initialize Lucide icons
    lucide.createIcons();
}

function renderOptionsTable() {
    const tbody = document.getElementById('options-table-body');
    tbody.innerHTML = '';

    // These options are managed by the Workpiece panel — always exclude from Options panel
    const workpieceManaged = new Set([
        'showGrid', 'showOrigin', 'workpieceWidth', 'workpieceLength', 'workpieceThickness',
        'woodSpecies', 'originPosition', 'gridSize', 'showWorkpiece', 'snapGrid'
    ]);
    // Only show options that have a desc (declared in defaults) and aren't workpiece-managed.
    // Options pushed dynamically by setOption() at runtime (internal state like textFont,
    // lastUsedShape, etc.) have no desc and should never appear here.
    const filteredOptions = options.filter(option => option.desc && !workpieceManaged.has(option.option));

    filteredOptions.forEach((option, filteredIndex) => {
        // Find the original index in the full options array for the change handler
        const originalIndex = options.findIndex(opt => opt.option === option.option);
        const row = document.createElement('tr');
        let inputHtml = '';

        if (typeof option.value === 'boolean') {
            inputHtml = `<div class="form-check">
                         <input type="checkbox" class="form-check-input" ${option.value ? 'checked' : ''}
                                data-option-index="${originalIndex}">
                       </div>`;
        } else if (option.option === 'woodSpecies') {
            // Create dropdown for wood species (this should never appear since woodSpecies is filtered out)
            const speciesOptions = Object.keys(woodSpeciesDatabase).map(species =>
                `<option value="${species}" ${option.value === species ? 'selected' : ''}>${species}</option>`
            ).join('');
            inputHtml = `<select class="form-select" data-option-index="${originalIndex}">
                           ${speciesOptions}
                         </select>`;
        } else {
            // Use step 0.1 for tolerance and zbacklash, step 1 for other numeric fields
            const step = (option.option === 'tolerance' || option.option === 'zbacklash') ? '0.1' : '1';
            inputHtml = `<input type="number" class="form-control" value="${option.value}"
                              data-option-index="${originalIndex}" step="${step}">`;
        }

        row.innerHTML = `
            <td><strong>${option.option}</strong></td>
            <td>${option.desc}</td>
            <td>${inputHtml}</td>
        `;
        tbody.appendChild(row);
    });

    // Add change handlers
    tbody.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.optionIndex);
            let value;
            if (input.type === 'checkbox') {
                value = input.checked;
            } else if (input.tagName === 'SELECT') {
                value = input.value;
            } else {
                value = parseFloat(input.value);
            }

            const optionName = options[index].option;
            const oldValue = options[index].value;
            options[index].value = value;

            // If switching between mm and inches, round workpiece dimensions
            if (optionName === 'Inches' && oldValue !== value) {
                roundWorkpieceDimensions(value); // true = switching to inches, false = switching to mm
            }

            toggleTooltips(getOption('showTooltips'));
            redraw();
        });
    });
}

// Calculate depth or step value from percentage of workpiece thickness
function calculateFromPercentage(percent) {
    const thickness = getOption("workpieceThickness") || 19;
    return (thickness * percent) / 100;
}

// Recalculate all tool depths and steps based on percentages when workpiece thickness changes
function recalculateToolPercentages() {
    let needsSave = false;
    tools.forEach(tool => {
        if (tool.depthPercent !== null && tool.depthPercent !== undefined) {
            tool.depth = calculateFromPercentage(tool.depthPercent);
            needsSave = true;
        }
        if (tool.stepPercent !== null && tool.stepPercent !== undefined) {
            tool.step = calculateFromPercentage(tool.stepPercent);
            needsSave = true;
        }
    });

    if (needsSave) {
        localStorage.setItem('tools', JSON.stringify(tools));
    }
}

function updateToolTableHeaders() {
    // Update unit labels in tool table headers
    const unitLabel = getUnitLabel();
    const unitElem = document.getElementById('tool-table-unit');
    const feedUnitElem = document.getElementById('tool-table-feed-unit');
    const zfeedUnitElem = document.getElementById('tool-table-zfeed-unit');

    if (unitElem) unitElem.textContent = unitLabel;
    if (feedUnitElem) feedUnitElem.textContent = unitLabel + '/min';
    if (zfeedUnitElem) zfeedUnitElem.textContent = unitLabel + '/min';
}

function roundWorkpieceDimensions(useInches) {
    // Get current dimensions (always stored in mm)
    const width = getOption("workpieceWidth") || 300;
    const length = getOption("workpieceLength") || 200;
    const thickness = getOption("workpieceThickness") || 19;
    const gridSize = getOption("gridSize") || 10;

    let roundedWidth, roundedLength, roundedThickness, roundedGridSize;

    if (useInches) {
        // Converting from mm to inches - round to nearest 0.5 inch
        const widthInches = width / 25.4;
        const lengthInches = length / 25.4;
        const thicknessInches = thickness / 25.4;
        const gridInches = gridSize / 25.4;

        // Round to nearest 0.5 inch, then convert back to mm
        roundedWidth = Math.round(widthInches * 2) / 2 * 25.4;
        roundedLength = Math.round(lengthInches * 2) / 2 * 25.4;
        roundedThickness = Math.round(thicknessInches * 2) / 2 * 25.4;
        roundedGridSize = Math.round(gridInches * 2) / 2 * 25.4;
    } else {
        // Converting from inches to mm - round to nearest 10mm
        roundedWidth = Math.round(width / 10) * 10;
        roundedLength = Math.round(length / 10) * 10;
        roundedThickness = Math.round(thickness / 10) * 10;
        roundedGridSize = Math.round(gridSize / 10) * 10;
    }

    // Update the options
    setOption("workpieceWidth", roundedWidth);
    setOption("workpieceLength", roundedLength);
    setOption("workpieceThickness", roundedThickness);
    setOption("gridSize", roundedGridSize);

    // Update origin if Workpiece tool is active
    const width_scaled = roundedWidth * viewScale;
    const length_scaled = roundedLength * viewScale;
    const position = getOption("originPosition") || 'middle-center';
    const newOrigin = calculateOriginFromPosition(position, width_scaled, length_scaled);

    if (typeof origin !== 'undefined') {
        origin.x = newOrigin.x;
        origin.y = newOrigin.y;
    }

    // Update tool table headers and refresh table display
    updateToolTableHeaders();
    renderToolsTable();
}

function saveOptions() {
    localStorage.setItem('options', JSON.stringify(options));
    const modal = bootstrap.Modal.getInstance(document.getElementById('optionsModal'));
    modal.hide();
    redraw();
}

function showResetOptionsConfirmation() {
    // Show the confirmation modal
    const modalElement = document.getElementById('resetOptionsModal');
    const modal = new bootstrap.Modal(modalElement);
    const confirmBtn = document.getElementById('confirm-reset-options');

    // Handle confirm button click
    const handleConfirm = function () {
        performOptionsReset();
        modal.hide();

        // Clean up event listener
        confirmBtn.removeEventListener('click', handleConfirm);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    modal.show();
}

function performOptionsReset() {
    // Clear localStorage options
    localStorage.removeItem('options');

    // Load default options
    options = getDefaultOptions();

    // Recalculate origin based on reset workpiece dimensions
    if (typeof calculateOriginFromPosition === 'function' && typeof origin !== 'undefined' && typeof viewScale !== 'undefined') {
        const width = getOption("workpieceWidth") * viewScale;
        const length = getOption("workpieceLength") * viewScale;
        const originPosition = getOption("originPosition") || 'middle-center';

        const originCoords = calculateOriginFromPosition(originPosition, width, length);
        origin.x = originCoords.x;
        origin.y = originCoords.y;
    }

    // Re-center the workpiece in the viewport
    if (typeof centerWorkpiece === 'function') {
        centerWorkpiece();
    }

    // Re-render the options table to show default values
    renderOptionsTable();

    // Redraw the canvas to apply changes
    redraw();

    // Show success notification
    notify('Options reset to defaults', 'success');
}
