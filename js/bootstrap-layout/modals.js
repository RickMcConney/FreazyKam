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
                        <div id="options-workpiece-settings"></div>
                        <div class="table-responsive">
                            <table class="table options-table" id="options-table">
                                <thead>
                                    <tr>
                                        <th>Option</th>
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
                            <button type="button" class="btn btn-primary" id="save-options">Save</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(optionsModal);

    const projectPanelsModal = document.createElement('div');
    projectPanelsModal.innerHTML = `
        <div class="modal fade" id="projectPanelModal" tabindex="-1">
            <div class="modal-dialog modal-xl modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="project-panel-modal-title">Project</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="project-panel-modal-body"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(projectPanelsModal);
 
    // Help modal
    const helpModal = document.createElement('div');
    helpModal.innerHTML = `
        <div class="modal fade" id="helpModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-info bg-opacity-10">
                        <h5 class="modal-title text-info-emphasis">
                            <i data-lucide="help-circle"></i>
                            Help
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
                                <li class="mb-2"><strong>Assign cut operations:</strong> Apply machining operations to selected paths</li>
                                <li class="mb-2"><strong>Set cut settings:</strong> Select the bit you want to use and configure cutting parameters</li>
                                <li class="mb-2"><strong>Simulate Toolpaths:</strong> Preview machining in 3D simulation</li>
                                <li class="mb-2"><strong>Export G-code:</strong> Export your "Gcode" to your CNC machine</li>
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

                        <div class="text-center">
                            <p class="text-muted small mb-0">CC BY-NC 4.0</p>
                            <p class="text-muted small">Source: <a href="https://github.com/iarchi/freazykam" target="_blank">GitHub</a></p>
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

    const reorderOperationsModal = document.createElement('div');
    reorderOperationsModal.innerHTML = `
        <div class="modal fade" id="reorderOperationsModal" tabindex="-1" aria-labelledby="reorder-operations-title" aria-hidden="true">
            <div class="modal-dialog modal-dialog-scrollable modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <div>
                            <h5 class="modal-title" id="reorder-operations-title">Reorder Operations</h5>
                            <div class="small text-muted">Drag and drop operations to optimize their sequence.</div>
                        </div>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div id="reorder-operations-empty" class="text-muted small d-none">No operations available.</div>
                        <div id="reorder-operations-list" class="reorder-operations-list" aria-live="polite"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(reorderOperationsModal);

    const textCreationModal = document.createElement('div');
    textCreationModal.innerHTML = `
        <div class="modal fade" id="textCreationModal" tabindex="-1" aria-labelledby="text-creation-title" aria-hidden="true">
            <div class="modal-dialog modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="text-creation-title">
                            <i data-lucide="type-outline"></i>
                            Create Text
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div id="text-creation-form"></div>
                        <div id="text-creation-error" class="invalid-feedback d-block" style="display: none;"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="confirm-text-creation">Create</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(textCreationModal);

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

    // SVG Pixels Per Inch Input Modal
    const svgPpiModal = document.createElement('div');
    svgPpiModal.innerHTML = `
        <div class="modal fade" id="svgPpiModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i data-lucide="ruler"></i>
                            SVG Scale
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-3">This SVG does not identify its pixels-per-inch scale. Enter the PPI value to use for import.</p>
                        <div class="mb-3">
                            <label for="svg-ppi-input" class="form-label">Pixels per inch</label>
                            <input type="number" class="form-control" id="svg-ppi-input" min="0.001" step="0.1" value="96" inputmode="decimal">
                            <div class="invalid-feedback" id="svg-ppi-error">
                                Enter a positive pixels-per-inch value.
                            </div>
                            <div class="form-text">Common values: 96 for browser/Inkscape SVGs, 72 for older Illustrator SVGs.</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="confirm-svg-ppi">Import</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(svgPpiModal);

    // DXF Unit Selection Modal
    const dxfUnitsModal = document.createElement('div');
    dxfUnitsModal.innerHTML = `
        <div class="modal fade" id="dxfUnitsModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i data-lucide="ruler"></i>
                            DXF Units
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-3">This DXF does not declare its drawing units. Choose the units to use for import.</p>
                        <div class="mb-3">
                            <label for="dxf-units-select" class="form-label">Drawing units</label>
                            <select class="form-select" id="dxf-units-select">
                                <option value="mm">Millimeters</option>
                                <option value="cm">Centimeters</option>
                                <option value="in">Inches</option>
                                <option value="m">Meters</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="confirm-dxf-units">Import</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    body.appendChild(dxfUnitsModal);

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
    document.getElementById('confirm-text-creation').addEventListener('click', confirmTextCreation);
    document.getElementById('textCreationModal').addEventListener('shown.bs.modal', function () {
        const textInput = document.getElementById('pm-text');
        if (textInput) {
            textInput.focus();
            if (typeof textInput.select === 'function') {
                textInput.select();
            }
        }
    });
}

function getTextCreationOperation() {
    return window.cncController?.operationManager?.getOperation('Text') || null;
}

function getTextCreationFields(textOperation) {
    if (!textOperation) return [];

    return [
        {
            ...textOperation.textField,
            type: 'textarea',
            rows: 3,
            help: 'Press Enter to create multiple lines.'
        },
        textOperation.fontField,
        textOperation._getFontSizeField(),
        textOperation.alignField,
        textOperation.lineHeightField
    ];
}

function getTextCreationValues(textOperation) {
    if (!textOperation) return null;

    textOperation.getProperties();
    return {
        text: textOperation.properties.text ?? textOperation.textField.default,
        font: textOperation.properties.font ?? textOperation.fontField.default,
        fontSize: textOperation.properties.fontSize ?? textOperation._getFontSizeField().default,
        align: textOperation.properties.align ?? textOperation.alignField.default,
        lineHeight: textOperation.properties.lineHeight ?? textOperation.lineHeightField.default
    };
}

function renderTextCreationForm() {
    const textOperation = getTextCreationOperation();
    const form = document.getElementById('text-creation-form');
    const error = document.getElementById('text-creation-error');
    if (!textOperation || !form || !error) return false;

    const values = getTextCreationValues(textOperation);
    form.innerHTML = buildTextCreationCompactForm(textOperation, values);
    initializeTextCreationCompactForm(textOperation, values);
    error.textContent = '';
    error.style.display = 'none';
    return true;
}

function buildTextCreationCompactForm(textOperation, values) {
    const fontOptions = (textOperation.fontField.options || []).map(option => {
        const previewFamily = option.previewFamily
            ? ` style="font-family: '${option.previewFamily}', sans-serif;"`
            : '';
        const selectedClass = option.value === values.font ? ' is-selected' : '';
        return `
            <button type="button"
                    class="dropdown-item text-creation-font-option${selectedClass}"
                    data-font-value="${option.value}"
                    data-font-label="${option.label}"
                    data-font-family="${option.previewFamily || ''}">
                <span class="text-creation-font-option__name"${previewFamily}>${option.label}</span>
                <span class="text-creation-font-option__preview"${previewFamily}>Aa Bb 123</span>
            </button>
        `;
    }).join('');

    const lineHeightOptions = [
        0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2
    ].map(value => {
        const selected = Number(values.lineHeight) === value ? ' selected' : '';
        return `<option value="${value}"${selected}>${value.toFixed(value % 1 === 0 ? 0 : 2).replace(/\.00$/, '')}</option>`;
    }).join('');

    const fontSizeField = textOperation._getFontSizeField();
    const sliderValue = fontSizeField.dimension
        ? values.fontSize / (fontSizeField.mmPerUnit || 1)
        : values.fontSize;
    const fontSizeDisplay = fontSizeField.dimension
        ? formatDimension(values.fontSize, true)
        : String(values.fontSize);
    const selectedFontOption = (textOperation.fontField.options || []).find(option => option.value === values.font)
        || textOperation.fontField.options?.[0]
        || null;
    const selectedFontFamily = selectedFontOption?.previewFamily
        ? ` style="font-family: '${selectedFontOption.previewFamily}', sans-serif;"`
        : '';

    return `
        <div class="text-creation-compact-form">
            <div class="text-creation-toolbar card card-body py-2 px-2">
                <div class="text-creation-toolbar-row">
                    <div class="text-creation-control text-creation-control--font flex-grow-1">
                        <label for="pm-font-trigger" class="form-label small text-uppercase text-muted mb-1">Font</label>
                        <input type="hidden" id="pm-font" name="font" value="${selectedFontOption?.value || values.font}">
                        <div class="dropdown text-creation-font-dropdown">
                            <button class="btn btn-sm btn-outline-secondary dropdown-toggle text-creation-font-trigger"
                                    type="button"
                                    id="pm-font-trigger"
                                    data-bs-toggle="dropdown"
                                    data-bs-auto-close="true"
                                    aria-expanded="false">
                                <span class="text-creation-font-trigger__label"${selectedFontFamily}>${selectedFontOption?.label || ''}</span>
                            </button>
                            <div class="dropdown-menu text-creation-font-menu">
                                ${fontOptions}
                            </div>
                        </div>
                    </div>
                    <div class="text-creation-control text-creation-control--align">
                        <label class="form-label small text-uppercase text-muted mb-1 d-block">Align</label>
                        <input type="hidden" id="pm-align" name="align" value="${values.align}">
                        <div class="btn-group btn-group-sm text-creation-align-group" role="group" aria-label="Text alignment">
                            <input type="radio" class="btn-check" name="align" id="pm-align-left" value="left" ${values.align === 'left' ? 'checked' : ''}>
                            <label class="btn btn-outline-secondary" for="pm-align-left" title="Align left">
                                <i data-lucide="align-left"></i>
                            </label>
                            <input type="radio" class="btn-check" name="align" id="pm-align-center" value="center" ${values.align === 'center' ? 'checked' : ''}>
                            <label class="btn btn-outline-secondary" for="pm-align-center" title="Align center">
                                <i data-lucide="align-center"></i>
                            </label>
                            <input type="radio" class="btn-check" name="align" id="pm-align-right" value="right" ${values.align === 'right' ? 'checked' : ''}>
                            <label class="btn btn-outline-secondary" for="pm-align-right" title="Align right">
                                <i data-lucide="align-right"></i>
                            </label>
                        </div>
                    </div>
                    <div class="text-creation-control text-creation-control--lineheight">
                        <label for="pm-lineHeight" class="form-label small text-uppercase text-muted mb-1">Line</label>
                        <select class="form-select form-select-sm" id="pm-lineHeight" name="lineHeight">
                            ${lineHeightOptions}
                        </select>
                    </div>
                </div>
                <div class="text-creation-toolbar-row text-creation-toolbar-row--size">
                    <label for="pm-fontSize" class="form-label small text-uppercase text-muted mb-1">Size</label>
                    <div class="text-creation-size-row">
                        <input type="range" class="form-range" id="pm-fontSize" name="fontSize"
                               data-key="fontSize"
                               data-display-id="pm-fontSize-display"
                               data-dimension-range="${fontSizeField.dimension ? 'true' : 'false'}"
                               data-mm-per-unit="${fontSizeField.mmPerUnit || 1}"
                               min="${fontSizeField.min}" max="${fontSizeField.max}" step="${fontSizeField.step}" value="${sliderValue}">
                        <span class="badge text-bg-light text-creation-size-badge" id="pm-fontSize-display">${fontSizeDisplay}</span>
                    </div>
                </div>
            </div>
            <div class="mb-3">
                <label for="pm-text" class="form-label small text-uppercase text-muted mb-1">Text</label>
                <textarea class="form-control form-control-sm text-creation-textarea" id="pm-text" name="text" rows="3" placeholder="Sample Text">${String(values.text ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                <div class="form-text">Press Enter to create multiple lines.</div>
            </div>
        </div>
    `;
}

function initializeTextCreationCompactForm(textOperation, values) {
    const fontInput = document.getElementById('pm-font');
    const fontTrigger = document.getElementById('pm-font-trigger');
    const fontTriggerLabel = fontTrigger?.querySelector('.text-creation-font-trigger__label') || null;
    const fontOptions = document.querySelectorAll('.text-creation-font-option');
    const fontSizeInput = document.getElementById('pm-fontSize');
    const fontSizeDisplay = document.getElementById('pm-fontSize-display');
    const alignInput = document.getElementById('pm-align');
    const alignRadios = document.querySelectorAll('.text-creation-align-group input[type="radio"]');

    if (fontInput && fontTrigger && fontTriggerLabel && fontOptions.length > 0) {
        const updateSelectedFont = fontValue => {
            const option = (textOperation.fontField.options || []).find(entry => entry.value === fontValue);
            fontInput.value = option?.value || fontValue;
            fontTriggerLabel.textContent = option?.label || '';
            fontTriggerLabel.style.fontFamily = option?.previewFamily
                ? `'${option.previewFamily}', sans-serif`
                : '';
            fontOptions.forEach(button => {
                button.classList.toggle('is-selected', button.dataset.fontValue === fontInput.value);
            });
        };

        updateSelectedFont(fontInput.value || values.font);

        fontOptions.forEach(button => {
            button.addEventListener('click', function() {
                updateSelectedFont(this.dataset.fontValue);
                const dropdown = bootstrap.Dropdown.getOrCreateInstance(fontTrigger);
                dropdown.hide();
            });
        });
    }

    if (fontSizeInput && fontSizeDisplay) {
        PropertiesManager.updateRangeDisplay(fontSizeInput, fontSizeDisplay);
        fontSizeInput.addEventListener('input', function() {
            PropertiesManager.updateRangeDisplay(this, fontSizeDisplay);
        });
    }

    if (alignInput && alignRadios.length > 0) {
        alignRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                if (this.checked) {
                    alignInput.value = this.value;
                }
            });
        });
    }

    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
}

function showTextCreationModal() {
    const modalElement = document.getElementById('textCreationModal');
    if (!modalElement) return;

    showToolsList();
    if (!renderTextCreationForm()) {
        return;
    }

    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

async function confirmTextCreation() {
    const textOperation = getTextCreationOperation();
    const modalElement = document.getElementById('textCreationModal');
    const error = document.getElementById('text-creation-error');
    const confirmButton = document.getElementById('confirm-text-creation');
    if (!textOperation || !modalElement || !error || !confirmButton) return;

    const fields = getTextCreationFields(textOperation);
    const values = PropertiesManager.collectValues(fields);
    const textValue = String(values.text ?? '');

    if (!textValue.trim()) {
        error.textContent = 'Enter some text before creating the SVG paths.';
        error.style.display = 'block';
        document.getElementById('pm-text')?.focus();
        return;
    }

    error.textContent = '';
    error.style.display = 'none';
    confirmButton.disabled = true;

    textOperation.properties = {
        ...textOperation.properties,
        ...values,
        text: textValue
    };
    textOperation._saveTextOptions(textValue, values.font, values.fontSize, values.align, values.lineHeight);

    bootstrap.Modal.getOrCreateInstance(modalElement).hide();

    try {
        const createdPath = await textOperation.createAtCanvasCenter();
        if (!createdPath) {
            return;
        }

        redraw();
    } finally {
        confirmButton.disabled = false;
    }
}

function showOptionsModal() {
    renderOptionsTable();
    const modal = new bootstrap.Modal(document.getElementById('optionsModal'));
    modal.show();
}

function renderOptionsWorkpieceSettings() {
    const container = document.getElementById('options-workpiece-settings');
    if (!container) return;

    const workpieceController = typeof getWorkpieceConfigController === 'function'
        ? getWorkpieceConfigController()
        : null;

    const optionKeys = ['showGrid', 'showOrigin', 'showWorkpiece', 'originPosition'];
    const fields = optionKeys
        .map(key => workpieceController?.fields?.[key])
        .filter(Boolean);

    if (!workpieceController || fields.length !== optionKeys.length) {
        container.innerHTML = '';
        return;
    }

    const fh = (field, value) => PropertiesManager.fieldHTML(field, value);
    container.innerHTML = `
        <div class="alert alert-info mb-3">
            <strong>Display & Origin</strong><br>
            Configure the grid, visibility toggles, and workpiece origin from this popup.
        </div>
        <div class="row g-2">
            <div class="col-md-4">${fh(workpieceController.fields.showGrid, getOption('showGrid') !== false)}</div>
            <div class="col-md-4">${fh(workpieceController.fields.showOrigin, getOption('showOrigin') !== false)}</div>
            <div class="col-md-4">${fh(workpieceController.fields.showWorkpiece, getOption('showWorkpiece') !== false)}</div>
        </div>
        ${fh(workpieceController.fields.originPosition, getOption('originPosition') || 'middle-center')}
        <hr class="mt-4 mb-3">
    `;

    const inputs = container.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        function handleInputChange() {
            const data = collectOperationProperties(workpieceController);
            workpieceController.updateFromProperties(data);
            workpieceController.onPropertiesChanged(data);

            if (workpieceController.fields) {
                PropertiesManager.save(workpieceController.name, data, Object.values(workpieceController.fields));
            }
        }

        input.addEventListener('change', handleInputChange);
        if (input.type === 'text' || input.type === 'number' || input.type === 'range' || input.tagName === 'TEXTAREA') {
            input.addEventListener('input', handleInputChange);
        }
    });
}

function showProjectPanelModal(title, renderCallback) {
    const modalElement = document.getElementById('projectPanelModal');
    const dialogElement = modalElement?.querySelector('.modal-dialog');
    const titleElement = document.getElementById('project-panel-modal-title');
    const bodyElement = document.getElementById('project-panel-modal-body');
    if (!modalElement || !titleElement || !bodyElement || !dialogElement) return;

    dialogElement.className = 'modal-dialog modal-xl modal-dialog-scrollable';
    bodyElement.className = '';

    titleElement.textContent = title;
    bodyElement.innerHTML = '<div id="project-panel-content"></div>';

    const renderOptions =
        typeof renderCallback === 'function'
            ? (renderCallback('project-panel-content') || {})
            : {};

    if (renderOptions.dialogClass) {
        dialogElement.className = `modal-dialog ${renderOptions.dialogClass}`;
    }

    if (renderOptions.bodyClass) {
        bodyElement.classList.add(renderOptions.bodyClass);
    }

    modalElement.addEventListener('hidden.bs.modal', function handleProjectPanelHidden() {
        if (typeof showToolsList === 'function') {
            showToolsList();
        }
    }, { once: true });

    const modal = new bootstrap.Modal(modalElement);
    modal.show();
    lucide.createIcons();

    if (title === 'GRBL' && typeof initializeGcodeProfilesUI === 'function') {
        initializeGcodeProfilesUI();
    }
}

function showToolsModal() {
    showProjectPanelModal('Tools', createToolPanel);
}

function showWorkpieceModal() {
    showProjectPanelModal('Workpiece', createWorkpiecePanel);
}

function showGrblModal() {
    showProjectPanelModal('GRBL', createGrblPanel);
}

function showCutSettingsModal() {
    showProjectPanelModal('Cut Settings', function(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const fields = getCutSettingsFields();
        const currentValues = {
            ...getSavedCutSettings()
        };

        if ((window.tools || []).length === 0) {
            container.innerHTML = '<div class="alert alert-warning mb-0">Add at least one tool in the tool library before generating G-code.</div>';
            return;
        }

        container.innerHTML = `
            <div class="cut-settings-sections row g-3">
                <section class="col-12 col-lg-6">
                    <div class="cut-settings-section-card h-100">
                        <div id="cut-settings-workpiece-panel"></div>
                    </div>
                </section>
                <section class="col-12 col-lg-6">
                    <div class="cut-settings-section-card h-100 d-flex flex-column">
                        <div><h5>Cut Settings</h5></div>
                        <div id="cut-settings-machining-panel">
                            ${PropertiesManager.formHTML(fields, currentValues, null)}
                        </div>
                        <div class="d-flex justify-content-end mt-3">
                            <button type="button" class="btn btn-primary" id="project-save-cut-settings-button">Save</button>
                        </div>
                    </div>
                </section>
            </div>
        `;

        if (typeof createWorkpiecePanel === 'function') {
            createWorkpiecePanel('cut-settings-workpiece-panel');
        }

        loadCutSettingsIntoForm(currentValues);
        bindCutSettingsForm(fields);

        const saveButton = document.getElementById('project-save-cut-settings-button');
        if (!saveButton) {
            return;
        }

        saveButton.addEventListener('click', function() {
            const values = collectCurrentCutSettingsFormValues();

            const errors = validateCutSettings(values);
            if (errors.length > 0) {
                notify(errors.join(', '), 'error');
                return;
            }

            saveCutSettings(values);
            notify('Cut settings saved', 'success');

            if (typeof window.schedulePrepared3DGcodeRefresh === 'function') {
                window.schedulePrepared3DGcodeRefresh({ delay: 0 });
            }

            const modalElement = document.getElementById('projectPanelModal');
            const modalInstance = modalElement && typeof bootstrap !== 'undefined' && bootstrap?.Modal
                ? bootstrap.Modal.getInstance(modalElement)
                : null;
            if (modalInstance) {
                modalInstance.hide();
            }
        });

        return {
            dialogClass: 'modal-lg modal-dialog-scrollable',
            bodyClass: 'project-panel-modal-body--cut-settings'
        };
    });
}

function refreshCutSettingsPanelForUnits() {
    const modalElement = document.getElementById('projectPanelModal');
    const titleElement = document.getElementById('project-panel-modal-title');
    const bodyElement = document.getElementById('project-panel-modal-body');
    if (!modalElement || !titleElement || !bodyElement) return;
    if (titleElement.textContent !== 'Cut Settings') return;
    if (modalElement.classList.contains('show') === false) return;

    const toolInput = document.getElementById('pm-tool');
    const directionInput = document.getElementById('pm-direction');
    const autoDirectionInput = document.getElementById('pm-autoDirection');
    const stepInput = document.getElementById('pm-step');
    const autoStepInput = document.getElementById('pm-autoStep');
    const rpmInput = document.getElementById('pm-rpm');
    const feedInput = document.getElementById('pm-feed');
    const autoFeedInput = document.getElementById('pm-autoFeedRate');
    const zfeedInput = document.getElementById('pm-zfeed');
    const autoZFeedInput = document.getElementById('pm-autoZFeedRate');
    const plungeInput = document.getElementById('pm-plunge');
    const strategyInput = document.getElementById('pm-strategy');

    const currentValues = {
        ...getSavedCutSettings(),
        tool: toolInput ? Number(toolInput.value) || null : undefined,
        direction: directionInput ? directionInput.value : undefined,
        autoDirection: autoDirectionInput ? !!autoDirectionInput.checked : undefined,
        step: stepInput ? parseDimension(stepInput.value) : undefined,
        autoStep: autoStepInput ? !!autoStepInput.checked : undefined,
        rpm: rpmInput ? Number(rpmInput.value) || 0 : undefined,
        feed: feedInput ? parseDimension(feedInput.value) : undefined,
        autoFeedRate: autoFeedInput ? !!autoFeedInput.checked : undefined,
        zfeed: zfeedInput ? parseDimension(zfeedInput.value) : undefined,
        autoZFeedRate: autoZFeedInput ? !!autoZFeedInput.checked : undefined,
        plunge: plungeInput ? plungeInput.value : undefined,
        strategy: strategyInput ? strategyInput.value : undefined
    };

    showCutSettingsModal();
    loadCutSettingsIntoForm(currentValues);

    const refreshedStepInput = document.getElementById('pm-step');
    const refreshedAutoStepInput = document.getElementById('pm-autoStep');
    const refreshedFeedInput = document.getElementById('pm-feed');
    const refreshedAutoFeedInput = document.getElementById('pm-autoFeedRate');
    const refreshedZFeedInput = document.getElementById('pm-zfeed');
    const refreshedAutoZFeedInput = document.getElementById('pm-autoZFeedRate');

    if (refreshedStepInput && Number.isFinite(currentValues.step) && currentValues.step > 0) {
        const formattedStep = formatDimension(currentValues.step, true);
        refreshedStepInput.dataset.manualValueMm = String(currentValues.step);
        if (!refreshedAutoStepInput?.checked) {
            refreshedStepInput.value = formattedStep;
        }
    }

    if (refreshedFeedInput && Number.isFinite(currentValues.feed) && currentValues.feed > 0) {
        const formattedFeed = formatDimension(currentValues.feed, true);
        refreshedFeedInput.dataset.manualValueMm = String(currentValues.feed);
        if (!refreshedAutoFeedInput?.checked) {
            refreshedFeedInput.value = formattedFeed;
        }
    }

    if (refreshedZFeedInput && Number.isFinite(currentValues.zfeed) && currentValues.zfeed > 0) {
        const formattedZFeed = formatDimension(currentValues.zfeed, true);
        refreshedZFeedInput.dataset.manualValueMm = String(currentValues.zfeed);
        if (!refreshedAutoZFeedInput?.checked) {
            refreshedZFeedInput.value = formattedZFeed;
        }
    }

    if (typeof syncAutoFeedRatePreview === 'function') {
        syncAutoFeedRatePreview();
    }
}

function showHelpModal() {
    const modal = new bootstrap.Modal(document.getElementById('helpModal'));
    modal.show();
    // Initialize Lucide icons in the modal
    lucide.createIcons();
}

function getCutSettingsStorageKey() {
    return 'Gcode.cutSettings';
}

function getCutSettingsFields() {
    const unitLabel = getUnitLabel();
    const toolOptions = (window.tools || []).map(tool => ({
        value: tool.recid,
        label: `${tool.name} (${tool.diameter}mm ${tool.bit})`
    }));

    const defaultToolId = toolOptions[0]?.value ?? '';

    return [
        {
            key: 'tool',
            label: 'Tool',
            type: 'choice',
            default: defaultToolId,
            options: toolOptions,
            help: toolOptions.length === 0 ? 'Add at least one tool in the tool library before generating G-code.' : ''
        },
        {
            key: 'direction',
            label: 'Milling direction',
            type: 'choice',
            default: 'climb',
            options: [
                { value: 'climb', label: 'Climb' },
                { value: 'conventional', label: 'Conventional' }
            ]
        },
        {
            key: 'autoDirection',
            label: 'Auto Calculate Milling Direction',
            type: 'checkbox',
            default: true
        },
        {
            key: 'step',
            label: `Depth per pass (${unitLabel})`,
            type: 'dimension',
            default: toolOptions.length > 0
                ? ((window.tools || []).find(tool => tool.recid === defaultToolId)?.step || 1)
                : 1,
            min: 0.01
        },
        {
            key: 'autoStep',
            label: 'Auto Calculate Depth per Pass',
            type: 'checkbox',
            default: true
        },
        {
            key: 'rpm',
            label: 'RPM',
            type: 'number',
            default: toolOptions.length > 0
                ? ((window.tools || []).find(tool => Number(tool.recid) === Number(defaultToolId))?.rpm || 18000)
                : 18000,
            min: 1000,
            max: 30000,
            step: 100
        },
        {
            key: 'feed',
            label: `Feed rate (${unitLabel}/min)`,
            type: 'dimension',
            default: toolOptions.length > 0
                ? ((window.tools || []).find(tool => Number(tool.recid) === Number(defaultToolId))?.feed || 600)
                : 600,
            min: 1,
        },
        {
            key: 'autoFeedRate',
            label: 'Auto Calculate Feed Rates',
            type: 'checkbox',
            default: true
        },
        {
            key: 'zfeed',
            label: `Plunge rate (${unitLabel}/min)`,
            type: 'dimension',
            default: toolOptions.length > 0
                ? ((window.tools || []).find(tool => Number(tool.recid) === Number(defaultToolId))?.zfeed || 200)
                : 200,
            min: 1,
        },
        {
            key: 'autoZFeedRate',
            label: 'Auto Calculate Plunge Rate',
            type: 'checkbox',
            default: true
        },
        {
            key: 'plunge',
            label: 'Plunge',
            type: 'choice',
            default: 'vertical',
            options: [
                { value: 'vertical', label: 'Vertical' },
                { value: 'ramp-5', label: 'Ramp 5°' },
                { value: 'ramp-20', label: 'Ramp 20°' }
            ]
        },
        {
            key: 'strategy',
            label: 'Fill method',
            type: 'choice',
            default: 'adaptive',
            options: [
                { value: 'adaptive', label: 'Adaptive' },
                { value: 'raster', label: 'Raster' },
                { value: 'contour', label: 'Contour' }
            ]
        }
    ];
}

function getSavedCutSettings() {
    const fields = getCutSettingsFields();
    const saved = PropertiesManager.loadSaved(getCutSettingsStorageKey());
    const defaultToolField = fields.find(field => field.key === 'tool');
    const defaultToolId = defaultToolField?.default ?? '';
    const toolOptions = Array.isArray(defaultToolField?.options) ? defaultToolField.options : [];
    const savedToolId = Number(saved.tool);
    const hasSavedTool = toolOptions.some(option => Number(option.value) === savedToolId);
    const defaultStep = defaultToolId
        ? (window.tools || []).find(tool => Number(tool.recid) === Number(defaultToolId))?.step || 1
        : 1;

    return {
        tool: hasSavedTool ? savedToolId : defaultToolId,
        direction: saved.direction === 'conventional'
            ? 'conventional'
            : (saved.direction === 'climb' ? 'climb' : 'auto'),
        autoDirection: saved.autoDirection !== undefined
            ? !!saved.autoDirection
            : !(saved.direction === 'climb' || saved.direction === 'conventional'),
        step: Number(saved.step) > 0 ? Number(saved.step) : defaultStep,
        autoStep: saved.autoStep !== undefined ? !!saved.autoStep : true,
        rpm: Number(saved.rpm) > 0 ? Number(saved.rpm) : ((window.tools || []).find(tool => Number(tool.recid) === Number(defaultToolId))?.rpm || 18000),
        feed: Number(saved.feed) > 0 ? Number(saved.feed) : ((window.tools || []).find(tool => Number(tool.recid) === Number(defaultToolId))?.feed || 600),
	        autoFeedRate: saved.autoFeedRate !== undefined ? !!saved.autoFeedRate : true,
        zfeed: Number(saved.zfeed) > 0 ? Number(saved.zfeed) : ((window.tools || []).find(tool => Number(tool.recid) === Number(defaultToolId))?.zfeed || 200),
        autoZFeedRate: saved.autoZFeedRate !== undefined ? !!saved.autoZFeedRate : true,
        plunge: saved.plunge || 'vertical',
        strategy: saved.strategy || 'adaptive'
    };
}

function validateCutSettings(values) {
    const errors = [];

    if (!Number(values.tool)) {
        errors.push('Please select a tool');
    }

    if (!Number.isFinite(values.step) || values.step <= 0) {
        errors.push('Depth per pass must be greater than 0');
    }

    if (!Number.isFinite(values.rpm) || values.rpm <= 0) {
        errors.push('RPM must be greater than 0');
    }

    if (!Number.isFinite(values.feed) || values.feed <= 0) {
        errors.push('Feed rate must be greater than 0');
    }

    if (!Number.isFinite(values.zfeed) || values.zfeed <= 0) {
        errors.push('Plunge rate must be greater than 0');
    }

    return errors;
}

function saveCutSettings(values) {
    const fields = getCutSettingsFields();
    PropertiesManager.save(getCutSettingsStorageKey(), values, fields);
    window.gcodeCutSettings = { ...values };
    return window.gcodeCutSettings;
}

function collectCurrentCutSettingsFormValues() {
    const values = PropertiesManager.collectValues(getCutSettingsFields());
    values.tool = Number(values.tool) || null;
    values.autoDirection = !!values.autoDirection;
    values.step = Number(values.step) || 0;
    values.rpm = Number(values.rpm) || 0;
    values.autoStep = !!values.autoStep;
    values.feed = Number(values.feed) || 0;
    values.autoFeedRate = !!values.autoFeedRate;
    values.zfeed = Number(values.zfeed) || 0;
    values.autoZFeedRate = !!values.autoZFeedRate;

    if (values.autoDirection) {
        values.direction = 'auto';
    } else if (values.direction !== 'climb' && values.direction !== 'conventional') {
        values.direction = 'climb';
    }

    if (values.autoStep) {
        const previewTool = (window.tools || []).find(tool => Number(tool.recid) === Number(values.tool));
        if (previewTool) {
            values.step = Math.max(0.01, Number(previewTool.diameter) / 2);
        }
    }

    if (values.autoFeedRate) {
        const previewTool = (window.tools || []).find(tool => Number(tool.recid) === Number(values.tool));
        if (previewTool) {
            values.feed = calculateFeedRate({
                ...previewTool,
                step: values.step,
                rpm: values.rpm
            }, getOption('material'), 'Profile', true);
        }
    }

    if (values.autoZFeedRate) {
        const previewTool = (window.tools || []).find(tool => Number(tool.recid) === Number(values.tool));
        if (previewTool) {
            const optimalFeed = calculateFeedRate({
                ...previewTool,
                step: values.step,
                rpm: values.rpm
            }, getOption('material'), 'Profile', true);
            if (Number.isFinite(optimalFeed) && optimalFeed > 0) {
                values.zfeed = Math.max(1, Math.round(optimalFeed / 3));
            }
        }
    }

    return values;
}

function syncCurrentCutSettingsForPreview() {
    if (!document.getElementById('pm-tool')) return null;

    const values = collectCurrentCutSettingsFormValues();
    if (validateCutSettings(values).length > 0) {
        return null;
    }

    window.gcodeCutSettings = { ...values };
    return window.gcodeCutSettings;
}

function refreshPrepared3DFromCurrentCutSettings() {
    const cutSettings = syncCurrentCutSettingsForPreview();
    if (!cutSettings || typeof window.schedulePrepared3DGcodeRefresh !== 'function') {
        return;
    }

    window.schedulePrepared3DGcodeRefresh({
        delay: 0,
        cutSettings,
        preserveProgress: true,
        resetIfMissing: true,
        reloadIfLoaded: false
    });
}

function enhanceCutSettingsAutoControl(fieldKey, autoKey) {
    const valueInput = document.getElementById(`pm-${fieldKey}`);
    const autoInput = document.getElementById(`pm-${autoKey}`);
    if (!valueInput || !autoInput) return;

    const valueField = valueInput.closest('.pm-field');
    const autoField = autoInput.closest('.pm-field');
    if (!valueField || !autoField || valueField.dataset.autoEnhanced === 'true') return;

    const helperText = valueField.querySelector('.form-text');
    const autoLabel = autoField.querySelector(`label[for="pm-${autoKey}"]`) || autoField.querySelector('.form-check-label');
    const formCheck = autoField.querySelector('.form-check') || autoField;
    const row = document.createElement('div');

    row.className = 'cut-settings-auto-row';
    valueInput.classList.add('cut-settings-auto-row__input');

    autoInput.classList.remove('form-check-input');
    autoInput.classList.add('btn-check');

    formCheck.className = 'cut-settings-auto-row__toggle';

    if (autoLabel) {
        autoLabel.textContent = 'AUTO';
        autoLabel.className = 'btn btn-outline-secondary btn-sm cut-settings-auto-row__button';
    }

    row.appendChild(valueInput);
    row.appendChild(formCheck);

    if (helperText) {
        valueField.insertBefore(row, helperText);
    } else {
        valueField.appendChild(row);
    }

    autoField.remove();
    valueField.dataset.autoEnhanced = 'true';
}

function syncCutSettingsDirectionPreview() {
    const directionInput = document.getElementById('pm-direction');
    const autoDirectionInput = document.getElementById('pm-autoDirection');
    if (!directionInput || !autoDirectionInput) return;

    const isAuto = !!autoDirectionInput.checked;
    setCutSettingsAutoButtonState('autoDirection', isAuto);

    if (isAuto) {
        ensureCutSettingsDirectionAutoOption(directionInput, true);
        directionInput.value = 'auto';
        directionInput.disabled = true;
        directionInput.title = 'Resolved automatically during toolpath generation';
        return;
    }

    ensureCutSettingsDirectionAutoOption(directionInput, false);
    directionInput.disabled = false;
    directionInput.title = '';
    if (directionInput.value === 'auto') {
        directionInput.value = 'climb';
    }
}

function ensureCutSettingsDirectionAutoOption(directionInput, isAuto) {
    if (!directionInput) return;

    const existingAutoOption = directionInput.querySelector('option[value="auto"]');
    if (isAuto) {
        if (!existingAutoOption) {
            const autoOption = document.createElement('option');
            autoOption.value = 'auto';
            autoOption.textContent = 'Automatic';
            autoOption.hidden = true;
            directionInput.insertBefore(autoOption, directionInput.firstChild);
        }
        return;
    }

    existingAutoOption?.remove();
}

function setCutSettingsAutoButtonState(autoKey, isActive) {
    const label = document.querySelector(`label[for="pm-${autoKey}"]`);
    if (!label) return;

    label.classList.toggle('btn-primary', isActive);
    label.classList.toggle('btn-outline-secondary', !isActive);
    label.classList.toggle('active', isActive);
    label.setAttribute('aria-pressed', isActive ? 'true' : 'false');
}

function formatCutSettingsDimensionValue(value) {
    const parsed = parseDimension(value);
    return Number.isFinite(parsed) && parsed > 0
        ? formatDimension(parsed, true)
        : value;
}

function restoreCutSettingsManualValue(input) {
    if (!input) return false;
    if (document.activeElement === input) return false;
    const mmValue = Number(input.dataset.manualValueMm);
    if (!Number.isFinite(mmValue) || mmValue <= 0) return false;
    input.value = formatDimension(mmValue, true);
    return true;
}

function storeCutSettingsManualValue(input) {
    if (!input) return;
    const mmValue = parseDimension(input.value);
    if (!Number.isFinite(mmValue) || mmValue <= 0) return;
    input.dataset.manualValueMm = String(mmValue);
}

function syncAutoFeedRatePreview() {
    const toolIdInput = document.getElementById('pm-tool');
    const stepInput = document.getElementById('pm-step');
    const autoStepInput = document.getElementById('pm-autoStep');
    const rpmInput = document.getElementById('pm-rpm');
    const feedInput = document.getElementById('pm-feed');
    const zfeedInput = document.getElementById('pm-zfeed');
    const autoFeedInput = document.getElementById('pm-autoFeedRate');
    const autoZFeedInput = document.getElementById('pm-autoZFeedRate');
    if (!toolIdInput || !stepInput || !autoStepInput || !rpmInput || !feedInput || !zfeedInput || !autoFeedInput || !autoZFeedInput) return;

    const tool = (window.tools || []).find(candidate => Number(candidate.recid) === Number(toolIdInput.value));
    const step = parseDimension(stepInput.value);
    const autoStep = !!autoStepInput.checked;
    const rpm = Number(rpmInput.value) || 0;
    const autoFeedRate = !!autoFeedInput.checked;
    const autoZFeedRate = !!autoZFeedInput.checked;
    const autoStepValue = tool && Number.isFinite(Number(tool.diameter)) && Number(tool.diameter) > 0
        ? Math.max(0.01, Number(tool.diameter) / 2)
        : null;

    setCutSettingsAutoButtonState('autoStep', autoStep);
    const previewTool = tool ? {
        ...tool,
        step: autoStep && Number.isFinite(autoStepValue) && autoStepValue > 0
            ? autoStepValue
            : (Number.isFinite(step) && step > 0 ? step : (tool.step || 1)),
        rpm: rpm > 0 ? rpm : (tool.rpm || 18000)
    } : null;
    let optimalFeed = null;

    if (autoStep && Number.isFinite(autoStepValue) && autoStepValue > 0) {
        stepInput.value = formatDimension(autoStepValue, true);
        stepInput.disabled = true;
        stepInput.title = 'Automatically calculated as one half of the router bit diameter';
    } else {
        stepInput.disabled = false;
        if (!restoreCutSettingsManualValue(stepInput)) {
            storeCutSettingsManualValue(stepInput);
            restoreCutSettingsManualValue(stepInput);
        }
        stepInput.title = '';
    }

    setCutSettingsAutoButtonState('autoFeedRate', autoFeedRate);
    setCutSettingsAutoButtonState('autoZFeedRate', autoZFeedRate);

    if (autoFeedRate && previewTool && typeof calculateFeedRate === 'function') {
        optimalFeed = calculateFeedRate(previewTool, getOption('material'), 'Profile', true);
        if (Number.isFinite(optimalFeed) && optimalFeed > 0) {
            feedInput.value = formatDimension(optimalFeed, true);
            feedInput.disabled = true;
            feedInput.title = 'Automatically calculated from tool, material, and depth per pass';
        }
    }

    if (!autoFeedRate) {
        feedInput.disabled = false;
        if (!restoreCutSettingsManualValue(feedInput)) {
            storeCutSettingsManualValue(feedInput);
            restoreCutSettingsManualValue(feedInput);
        }
        feedInput.title = '';
    }

    if (!optimalFeed && previewTool && typeof calculateFeedRate === 'function') {
        optimalFeed = calculateFeedRate(previewTool, getOption('material'), 'Profile', true);
    }

    if (autoZFeedRate && Number.isFinite(optimalFeed) && optimalFeed > 0) {
        const autoZFeed = Math.max(1, Math.round(optimalFeed / 3));
        zfeedInput.value = formatDimension(autoZFeed, true);
        zfeedInput.disabled = true;
        zfeedInput.title = 'Automatically calculated as one third of the optimal feed rate';
    } else {
        zfeedInput.disabled = false;
        if (!restoreCutSettingsManualValue(zfeedInput)) {
            storeCutSettingsManualValue(zfeedInput);
            restoreCutSettingsManualValue(zfeedInput);
        }
        zfeedInput.title = '';
    }
}

function bindCutSettingsForm(fields) {
    enhanceCutSettingsAutoControl('direction', 'autoDirection');
    enhanceCutSettingsAutoControl('step', 'autoStep');
    enhanceCutSettingsAutoControl('feed', 'autoFeedRate');
    enhanceCutSettingsAutoControl('zfeed', 'autoZFeedRate');

    const formInputs = fields
        .map(field => document.getElementById(`pm-${field.key}`))
        .filter(Boolean);

    formInputs.forEach(input => {
        if (input.id === 'pm-step') {
            input.addEventListener('input', function() {
                if (!document.getElementById('pm-autoStep')?.checked) {
                    storeCutSettingsManualValue(input);
                }
            });
        }
        if (input.id === 'pm-feed') {
            input.addEventListener('input', function() {
                if (!document.getElementById('pm-autoFeedRate')?.checked) {
                    storeCutSettingsManualValue(input);
                }
            });
        }
        if (input.id === 'pm-zfeed') {
            input.addEventListener('input', function() {
                if (!document.getElementById('pm-autoZFeedRate')?.checked) {
                    storeCutSettingsManualValue(input);
                }
            });
        }
        if (input.id === 'pm-direction') {
            input.addEventListener('change', function() {
                if (!document.getElementById('pm-autoDirection')?.checked && input.value === 'auto') {
                    input.value = 'climb';
                }
                syncCutSettingsDirectionPreview();
            });
        }
        input.addEventListener('change', function() {
            syncCutSettingsDirectionPreview();
            syncAutoFeedRatePreview();
            refreshPrepared3DFromCurrentCutSettings();
        });
        if ((input.type === 'text' || input.type === 'number' || input.tagName === 'TEXTAREA')
            && input.id !== 'pm-step'
            && input.id !== 'pm-feed'
            && input.id !== 'pm-zfeed') {
            input.addEventListener('input', function() {
                syncAutoFeedRatePreview();
                refreshPrepared3DFromCurrentCutSettings();
            });
        }
    });

    syncCutSettingsDirectionPreview();
    syncAutoFeedRatePreview();
    syncCurrentCutSettingsForPreview();
}

function loadCutSettingsIntoForm(values) {
    const fields = getCutSettingsFields();
    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        const nextValue = values[field.key] !== undefined ? values[field.key] : field.default;
        if (field.type === 'dimension' && Number.isFinite(Number(nextValue))) {
            PropertiesManager.setValue(field.key, formatDimension(Number(nextValue), true));
        } else {
            PropertiesManager.setValue(field.key, nextValue);
        }
    }
}

function getCompleteCutSettings() {
    const values = window.gcodeCutSettings || getSavedCutSettings();
    const errors = validateCutSettings(values);
    return errors.length === 0 ? values : null;
}

window.getSavedCutSettings = getSavedCutSettings;
window.getCompleteCutSettings = getCompleteCutSettings;
window.showCutSettingsModal = showCutSettingsModal;
window.refreshCutSettingsPanelForUnits = refreshCutSettingsPanelForUnits;
window.syncAutoFeedRatePreview = syncAutoFeedRatePreview;

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

function showSvgPpiModal(defaultValue) {
    return new Promise(function(resolve) {
        const modalElement = document.getElementById('svgPpiModal');
        const input = document.getElementById('svg-ppi-input');
        const confirmBtn = document.getElementById('confirm-svg-ppi');
        if (!modalElement || !input || !confirmBtn) {
            resolve(null);
            return;
        }

        input.value = defaultValue || 96;
        input.classList.remove('is-invalid');

        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        let resolved = false;
        const modal = new bootstrap.Modal(modalElement);

        function cleanup() {
            modalElement.removeEventListener('hidden.bs.modal', onHidden);
            input.removeEventListener('keydown', onKeyDown);
        }

        function finish(value) {
            if (resolved) return;
            resolved = true;
            cleanup();
            modal.hide();
            resolve(value);
        }

        function onHidden() {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(null);
        }

        function confirmValue() {
            const ppi = parseFloat(input.value);
            if (!isFinite(ppi) || ppi <= 0) {
                input.classList.add('is-invalid');
                input.focus();
                return;
            }
            input.classList.remove('is-invalid');
            finish(ppi);
        }

        function onKeyDown(evt) {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                confirmValue();
            }
        }

        newConfirmBtn.addEventListener('click', confirmValue);
        input.addEventListener('keydown', onKeyDown);
        modalElement.addEventListener('hidden.bs.modal', onHidden);
        modalElement.addEventListener('shown.bs.modal', function() {
            input.focus();
            input.select();
        }, { once: true });

        modal.show();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
}

function showDxfUnitsModal(defaultUnits) {
    return new Promise(function(resolve) {
        const modalElement = document.getElementById('dxfUnitsModal');
        const select = document.getElementById('dxf-units-select');
        const confirmBtn = document.getElementById('confirm-dxf-units');
        if (!modalElement || !select || !confirmBtn) {
            resolve(null);
            return;
        }

        select.value = defaultUnits || 'mm';

        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        let resolved = false;
        const modal = new bootstrap.Modal(modalElement);

        function cleanup() {
            modalElement.removeEventListener('hidden.bs.modal', onHidden);
        }

        function finish(value) {
            if (resolved) return;
            resolved = true;
            cleanup();
            modal.hide();
            resolve(value);
        }

        function onHidden() {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(null);
        }

        newConfirmBtn.addEventListener('click', function() {
            finish(select.value);
        }, { once: true });
        modalElement.addEventListener('hidden.bs.modal', onHidden);
        modalElement.addEventListener('shown.bs.modal', function() {
            select.focus();
        }, { once: true });

        modal.show();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
}

function renderOptionsTable() {
    const tbody = document.getElementById('options-table-body');
    tbody.innerHTML = '';
    renderOptionsWorkpieceSettings();

    // These options are rendered in the dedicated section above the generic options table.
    const workpieceManaged = new Set([
        'showGrid', 'showOrigin', 'workpieceWidth', 'workpieceLength', 'workpieceThickness',
        'material', 'originPosition', 'gridSize', 'showWorkpiece', 'snapGrid'
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
        } else if (option.option === 'material') {
            // Create dropdown for material (this should never appear since material is filtered out)
            const materialOptions = Object.keys(materialsDatabase).map(material =>
                `<option value="${material}" ${option.value === material ? 'selected' : ''}>${material}</option>`
            ).join('');
            inputHtml = `<select class="form-select" data-option-index="${originalIndex}">
                           ${materialOptions}
                         </select>`;
        } else {
            // Use step 0.1 for tolerance and zbacklash, step 1 for other numeric fields
            const step = (option.option === 'tolerance' || option.option === 'zbacklash') ? '0.1' : '1';
            inputHtml = `<input type="number" class="form-control" value="${option.value}"
                              data-option-index="${originalIndex}" step="${step}">`;
        }

        row.innerHTML = `
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

            if (optionName === 'Inches' && oldValue !== value && typeof setDisplayUnits === 'function') {
                setDisplayUnits(value);
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

    if (unitElem) unitElem.textContent = unitLabel;
}

function roundWorkpieceDimensions(useInches) {
    // Get current dimensions (always stored in mm)
    const width = getOption("workpieceWidth") || 300;
    const length = getOption("workpieceLength") || 200;
    const thickness = getOption("workpieceThickness") || 19;

    let roundedWidth, roundedLength, roundedThickness;

    if (useInches) {
        // Converting from mm to inches - round to nearest 0.5 inch
        const widthInches = width / 25.4;
        const lengthInches = length / 25.4;
        const thicknessInches = thickness / 25.4;
        // Round to nearest 0.5 inch, then convert back to mm
        roundedWidth = Math.round(widthInches * 2) / 2 * 25.4;
        roundedLength = Math.round(lengthInches * 2) / 2 * 25.4;
        roundedThickness = Math.round(thicknessInches * 2) / 2 * 25.4;
    } else {
        // Converting from inches to mm - round to nearest 10mm
        roundedWidth = Math.round(width / 10) * 10;
        roundedLength = Math.round(length / 10) * 10;
        roundedThickness = Math.round(thickness / 10) * 10;
    }

    // Update the options
    setOption("workpieceWidth", roundedWidth);
    setOption("workpieceLength", roundedLength);
    setOption("workpieceThickness", roundedThickness);

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
	if (typeof fitWorkpieceInView === 'function') {
		fitWorkpieceInView();
	}

    // Re-render the options table to show default values
    renderOptionsTable();

    // Redraw the canvas to apply changes
    redraw();

    // Show success notification
    notify('Options reset to defaults', 'success');
}
