/**
 * PropertiesManager - Data-driven properties panel generator
 *
 * Provides a unified, declarative approach to defining, displaying, and collecting
 * operation properties in the side panel.
 *
 * Field spec format:
 * {
 *   key:     'myField',         // DOM id suffix (id="pm-{key}") and form name
 *   label:   'My Field',        // Display label
 *   type:    'dimension',       // dimension | number | choice | checkbox | radio-grid
 *   default: 20,                // Fallback value when no last-used or path value
 *   min:     1,                 // (dimension/number) minimum value
 *   max:     100,               // (dimension/number) maximum value
 *   step:    1,                 // (number) step increment
 *   integer: false,             // (number) parse as integer instead of float
 *   options: [{value, label}],  // (choice/radio-grid) array of options
 *   cols:    3,                 // (radio-grid) number of columns, default 3
 *   help:    'Hint text',       // Optional helper text shown below input
 *   persist: false              // Set false to exclude this field from localStorage persistence
 * }
 *
 * Value resolution priority (three-way):
 *   1. pathProperties[key]  — editing an existing path (from creationProperties)
 *   2. lastUsed[key]        — last-used values stored on the operation instance
 *   3. field.default        — the spec's hard-coded default
 */
class PropertiesManager {

    /**
     * Resolve the display value for one field.
     * @param {Object} field          - Field spec
     * @param {Object} pathProperties - Values from path.creationProperties (may be null)
     * @param {Object} lastUsed       - In-memory last-used values (may be null)
     * @returns resolved value (stored unit, e.g. mm for dimensions)
     */
    static resolveValue(field, pathProperties, lastUsed) {
        if (pathProperties && pathProperties[field.key] !== undefined) {
            return pathProperties[field.key];
        }
        if (lastUsed && lastUsed[field.key] !== undefined) {
            return lastUsed[field.key];
        }
        return field.default;
    }

    /**
     * Generate HTML for a single field using its resolved value.
     * @param {Object} field - Field spec
     * @param {*}      value - Resolved value (from resolveValue)
     * @returns HTML string
     */
    static fieldHTML(field, value) {
        switch (field.type) {
            case 'dimension':  return this._dimensionHTML(field, value);
            case 'number':     return this._numberHTML(field, value);
            case 'text':       return this._textHTML(field, value);
            case 'textarea':   return this._textareaHTML(field, value);
            case 'choice':     return this._choiceHTML(field, value);
            case 'checkbox':   return this._checkboxHTML(field, value);
            case 'range':      return this._rangeHTML(field, value);
            case 'radio-grid': return this._radioGridHTML(field, value);
            default:
                console.warn(`PropertiesManager: unknown field type "${field.type}" for key "${field.key}"`);
                return '';
        }
    }

    /**
     * Generate complete form HTML for a list of field specs.
     * @param {Array}  fields         - Field spec array
     * @param {Object} pathProperties - Values from path.creationProperties when editing (or null)
     * @param {Object} lastUsed       - In-memory last-used values (or null)
     * @returns HTML string for all fields
     */
    static formHTML(fields, pathProperties, lastUsed) {
        return fields.map(field => {
            const value = this.resolveValue(field, pathProperties, lastUsed);
            return this.fieldHTML(field, value);
        }).join('');
    }

    /**
     * Collect and parse values from DOM for a field spec array.
     * Elements are located by id "pm-{field.key}".
     * Returns an object with parsed, internal-unit values.
     * @param {Array} fields - Field spec array
     * @returns {Object} parsed values keyed by field.key
     */
    static collectValues(fields) {
        const data = {};
        for (const field of fields) {
            // radio-grid has no single container element — handle before the getElementById guard
            if (field.type === 'radio-grid') {
                const checked = document.querySelector(`input[name="${field.key}"]:checked`);
                if (checked) data[field.key] = checked.value;
                continue;
            }
            const el = document.getElementById(`pm-${field.key}`);
            if (!el) continue;
            switch (field.type) {
                case 'dimension':
                    data[field.key] = parseDimension(el.value);
                    break;
                case 'number':
                    data[field.key] = field.integer
                        ? (parseInt(el.value) || (field.default ?? 0))
                        : (parseFloat(el.value));
                    if (isNaN(data[field.key])) data[field.key] = field.default ?? 0;
                    break;
                case 'choice':
                    data[field.key] = el.value;
                    break;
                case 'checkbox':
                    data[field.key] = el.checked;
                    break;
                case 'range':
                    data[field.key] = parseFloat(el.value);
                    if (isNaN(data[field.key])) data[field.key] = field.default ?? 0;
                    // Dimension ranges store in display units on the slider; convert back to mm
                    if (field.dimension && field.mmPerUnit) data[field.key] *= field.mmPerUnit;
                    break;
                case 'text':
                    data[field.key] = el.value;
                    break;
                case 'textarea':
                    data[field.key] = el.value;
                    break;
            }
        }
        return data;
    }

    /**
     * Push a value into a rendered field from outside (e.g. canvas drag events).
     * Skips the element if it is currently focused so the user's typing is not interrupted.
     * Works for input/select elements (sets .value) and any other element (sets .textContent).
     * @param {string} key   - Field key (element id will be "pm-{key}")
     * @param {*}      value - Display value to set
     */
    static setValue(key, value) {
        const el = document.getElementById(`pm-${key}`);
        if (el) {
            if (el === document.activeElement) return;
            if (el.type === 'checkbox') {
                el.checked = !!value;
            } else if (el.dataset.choiceType === 'custom') {
                el.value = value;
                const trigger = document.getElementById(`${el.id}-trigger`);
                const matchingOption = trigger?.parentElement?.querySelector(`.pm-choice__item[data-value="${CSS.escape(String(value))}"]`);
                if (matchingOption) {
                    this._syncCustomChoiceTrigger(trigger, matchingOption.dataset.label || '', matchingOption.dataset.iconPath || '');
                    const menu = matchingOption.closest('.pm-choice__menu');
                    if (menu) {
                        menu.querySelectorAll('.pm-choice__item.active').forEach(activeItem => activeItem.classList.remove('active'));
                    }
                    matchingOption.classList.add('active');
                }
            } else if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
                const display = document.getElementById(`pm-${key}-display`);
                if (el.type === 'range' && display) {
                    const isDimension = el.dataset.dimensionRange === 'true';
                    const mmPerUnit = parseFloat(el.dataset.mmPerUnit || '1') || 1;
                    const sliderValue = isDimension ? Number(value) / mmPerUnit : value;
                    el.value = sliderValue;
                    this.updateRangeDisplay(el, display);
                    this.syncVerticalRangeVisual(el);
                } else {
                    el.value = value;
                    this.refreshLinkedRangeDisplays(key);
                }
            } else {
                el.textContent = value;
            }
        } else {
            // radio-grid: each radio has id="pm-{key}-{value}", no single container element
            const radio = document.getElementById(`pm-${key}-${value}`);
            if (radio && radio.type === 'radio') radio.checked = true;
        }
    }

    /**
     * Update dimension field display values in the DOM after parsing.
     * Call this after collectValues to reformat user input (e.g. "2in" → "50.8 mm").
     * @param {Array}  fields  - Field spec array
     * @param {Object} values  - Parsed values from collectValues
     */
    static refreshDimensionDisplays(fields, values) {
        for (const field of fields) {
            if (field.type !== 'dimension') continue;
            const el = document.getElementById(`pm-${field.key}`);
            if (el && values[field.key] !== undefined) {
                el.value = formatDimension(values[field.key], true);
                this.refreshLinkedRangeDisplays(field.key);
            }
        }
    }

    /**
     * Load persisted values for a namespace from localStorage.
     * @param {string} namespace - Operation name used as storage key
     * @returns {Object} saved values, or {} if nothing saved
     */
    static loadSaved(namespace) {
        try {
            return JSON.parse(localStorage.getItem(`pm.${namespace}`)) ?? {};
        } catch (e) { return {}; }
    }

    /**
     * Persist values for a namespace to localStorage.
     * Fields with persist: false are excluded from storage.
     * @param {string}       namespace - Operation name used as storage key
     * @param {Object}       values    - Values to save (keyed by field key)
     * @param {Array|Object} fields    - Field specs (array or object) to check for persist: false
     */
    static save(namespace, values, fields) {
        const noPersist = new Set(
            (Array.isArray(fields) ? fields : Object.values(fields || {}))
                .filter(f => f.persist === false)
                .map(f => f.key)
        );
        try {
            const toSave = { ...this.loadSaved(namespace) };
            for (const [k, v] of Object.entries(values)) {
                if (!noPersist.has(k)) toSave[k] = v;
            }
            localStorage.setItem(`pm.${namespace}`, JSON.stringify(toSave));
        } catch (e) {}
    }

    // ── Private HTML generators ─────────────────────────────────────────────

    static _textHTML(field, value) {
        const maxlength = field.maxlength ? `maxlength="${field.maxlength}"` : '';
        return `<div class="mb-3 pm-field">
            <label for="pm-${field.key}" class="form-label small"><strong>${field.label}:</strong></label>
            <input type="text" class="form-control form-control-sm"
                   id="pm-${field.key}" name="${field.key}"
                   value="${String(value).replace(/"/g, '&quot;')}" ${maxlength}>${field.help ? `
            <div class="form-text">${field.help}</div>` : ''}
        </div>`;
    }

    static _textareaHTML(field, value) {
        const rows = field.rows || 2;
        const maxlength = field.maxlength ? `maxlength="${field.maxlength}"` : '';
        return `<div class="mb-3 pm-field">
            <label for="pm-${field.key}" class="form-label small"><strong>${field.label}:</strong></label>
            <textarea class="form-control form-control-sm"
                   id="pm-${field.key}" name="${field.key}"
                   rows="${rows}" ${maxlength}>${String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>${field.help ? `
            <div class="form-text">${field.help}</div>` : ''}
        </div>`;
    }

    static _dimensionHTML(field, value) {
        let display = String(value ?? '');

        if (typeof formatDimension === 'function') {
            const parsedValue = typeof value === 'number'
                ? value
                : (typeof parseDimension === 'function' ? parseDimension(value) : Number(value));

            if (Number.isFinite(parsedValue)) {
                display = formatDimension(parsedValue, true);
            }
        }

        return `<div class="mb-3 pm-field">
            <label for="pm-${field.key}" class="form-label small"><strong>${field.label}:</strong></label>
            <input type="text" class="form-control form-control-sm"
                   id="pm-${field.key}" name="${field.key}"
                   data-dimension-input="true"
                    data-refresh-range-display-key="${field.refreshRangeDisplayKey || ''}"
                     value="${display}"
                     oninput="PropertiesManager.handleDimensionInput(this)"
                     onchange="PropertiesManager.handleDimensionInput(this)"
                     onblur="PropertiesManager.handleDimensionBlur(this)"
                     onkeydown="if(event.key==='Enter'){PropertiesManager.handleDimensionBlur(this);}">${field.help ? `
            <div class="form-text">${field.help}</div>` : ''}
        </div>`;
    }

    static _numberHTML(field, value) {
        const min  = field.min  !== undefined ? `min="${field.min}"`   : '';
        const max  = field.max  !== undefined ? `max="${field.max}"`   : '';
        const step = field.step !== undefined ? `step="${field.step}"` : '';
        return `<div class="mb-3 pm-field">
            <label for="pm-${field.key}" class="form-label small"><strong>${field.label}:</strong></label>
            <input type="number" class="form-control form-control-sm"
                   id="pm-${field.key}" name="${field.key}"
                   value="${value}" ${min} ${max} ${step}>${field.help ? `
            <div class="form-text">${field.help}</div>` : ''}
        </div>`;
    }

    static _choiceHTML(field, value) {
        const options = (field.options || []).map(opt => ({
            value: typeof opt === 'string' ? opt : opt.value,
            label: typeof opt === 'string' ? opt : opt.label,
            iconPath: typeof opt === 'string' ? null : (opt.iconPath || null)
        }));
        const hasCustomOptions = options.some(opt => !!opt.iconPath);
        const selectedOption = options.find(opt => opt.value === value) || options[0] || null;

        if (!hasCustomOptions) {
            const optionsHTML = options.map(opt => {
                return `<option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>${opt.label}</option>`;
            }).join('');
            return `<div class="mb-3 pm-field">
                <label for="pm-${field.key}" class="form-label small"><strong>${field.label}:</strong></label>
                <select class="form-select form-select-sm" id="pm-${field.key}" name="${field.key}">
                    ${optionsHTML}
                </select>${field.help ? `
                <div class="form-text">${field.help}</div>` : ''}
            </div>`;
        }

        const selectedLabel = selectedOption?.label ?? '';
        const selectedIconPath = selectedOption?.iconPath ?? null;
        const optionsHTML = (field.options || []).map(opt => {
            const option = typeof opt === 'string'
                ? { value: opt, label: opt, iconPath: null }
                : { value: opt.value, label: opt.label, iconPath: opt.iconPath || null };
            const iconHTML = option.iconPath
                ? `<img src="${option.iconPath}" alt="" class="pm-choice__icon" aria-hidden="true">`
                : '<span class="pm-choice__icon pm-choice__icon--empty" aria-hidden="true"></span>';
            return `<button type="button"
                            class="dropdown-item pm-choice__item${option.value === value ? ' active' : ''}"
                            data-input-id="pm-${field.key}"
                            data-trigger-id="pm-${field.key}-trigger"
                            data-value="${option.value}"
                            data-label="${option.label}"
                            data-icon-path="${option.iconPath || ''}"
                            onclick="PropertiesManager.handleChoiceSelection(this)">
                        ${iconHTML}
                        <span class="pm-choice__text">${option.label}</span>
                    </button>`;
        }).join('');

        const iconHTML = selectedIconPath
            ? `<img src="${selectedIconPath}" alt="" class="pm-choice__icon" aria-hidden="true">`
            : '<span class="pm-choice__icon pm-choice__icon--empty" aria-hidden="true"></span>';

        return `<div class="mb-3 pm-field">
            <label for="pm-${field.key}" class="form-label small"><strong>${field.label}:</strong></label>
            <div class="dropdown pm-choice">
                <input type="hidden" id="pm-${field.key}" name="${field.key}" value="${selectedOption?.value ?? ''}" data-choice-type="custom">
                <button class="btn btn-outline-secondary btn-sm dropdown-toggle pm-choice__trigger" type="button" id="pm-${field.key}-trigger" data-bs-toggle="dropdown" aria-expanded="false">
                    ${iconHTML}
                </button>
                <div class="dropdown-menu pm-choice__menu" aria-labelledby="pm-${field.key}-trigger">
                    ${optionsHTML}
                </div>
            </div>${field.help ? `
            <div class="form-text">${field.help}</div>` : ''}
        </div>`;
    }

    static handleChoiceSelection(item) {
        if (!item) return;

        const input = document.getElementById(item.dataset.inputId || '');
        const trigger = document.getElementById(item.dataset.triggerId || '');
        if (!input || !trigger) return;

        const previousValue = input.value;
        input.value = item.dataset.value || '';
        this._syncCustomChoiceTrigger(trigger, item.dataset.label || '', item.dataset.iconPath || '');

        const menu = item.closest('.pm-choice__menu');
        if (menu) {
            menu.querySelectorAll('.pm-choice__item.active').forEach(activeItem => activeItem.classList.remove('active'));
        }
        item.classList.add('active');

        if (input.value !== previousValue) {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    static _syncCustomChoiceTrigger(trigger, label, iconPath = '') {
        if (!trigger) return;

        let icon = trigger.querySelector('.pm-choice__icon');
        if (iconPath) {
            if (!icon || !icon.tagName || icon.tagName !== 'IMG') {
                if (icon) icon.remove();
                icon = document.createElement('img');
                icon.className = 'pm-choice__icon';
                icon.alt = '';
                icon.setAttribute('aria-hidden', 'true');
                trigger.prepend(icon);
            }
            icon.src = iconPath;
        } else {
            if (icon && icon.tagName === 'IMG') {
                icon.remove();
            }
            if (!trigger.querySelector('.pm-choice__icon--empty')) {
                const spacer = document.createElement('span');
                spacer.className = 'pm-choice__icon pm-choice__icon--empty';
                spacer.setAttribute('aria-hidden', 'true');
                trigger.prepend(spacer);
            }
        }

        const text = trigger.querySelector('.pm-choice__text');
        if (text) {
            text.textContent = label;
        }
    }

    static _rangeHTML(field, value) {
        const min  = field.min  !== undefined ? field.min  : 0;
        const max  = field.max  !== undefined ? field.max  : 100;
        const step = field.step !== undefined ? field.step : 1;
        // Dimension ranges: value is stored in mm; slider operates in display units
        const mmPerUnit   = field.mmPerUnit ?? 1;
        const sliderValue = field.dimension ? value / mmPerUnit : value;
        const displayValue = field.displayValue ?? value;
        const displayNow  = field.dimension ? formatDimension(displayValue, true) : displayValue;
        const orientationClass = field.vertical ? ' pm-range--vertical' : '';
        const orientationAttrs = field.vertical
            ? ' orient="vertical" aria-orientation="vertical"'
            : '';
        if (!field.vertical) {
            return `<div class="mb-3 pm-field">
                <label for="pm-${field.key}" class="form-label small pm-range-label${orientationClass}">
                    <strong>${field.label}:</strong> <span id="pm-${field.key}-display">${displayNow}</span>
                </label>
                <div class="pm-range-wrap${orientationClass}">
                    <input type="range" class="form-range${orientationClass}"
                           id="pm-${field.key}" name="${field.key}"
                           data-key="${field.key}"
                           data-display-id="pm-${field.key}-display"
                           data-display-add-input-key="${field.displayAddInputKey || ''}"
                           data-dimension-range="${field.dimension ? 'true' : 'false'}"
                           data-mm-per-unit="${mmPerUnit}"
                           min="${min}" max="${max}" step="${step}" value="${sliderValue}"
                           oninput="PropertiesManager.handleRangeInput(this, 'pm-${field.key}-display')"${orientationAttrs}>
                </div>${field.help ? `
                <div class="form-text">${field.help}</div>` : ''}
            </div>`;
        }

        const scaleValues = this._buildRangeScaleValues(field, min, max);
        const rangeRatio = max === min
            ? 0
            : Math.min(1, Math.max(0, (sliderValue - min) / (max - min)));
        const scaleHTML = scaleValues.length > 0
            ? `<div class="pm-range-scale" aria-hidden="true">${scaleValues.map(scaleValue => {
                const label = field.dimension
                    ? formatDimension(scaleValue * mmPerUnit, true)
                    : scaleValue;
                const position = max === min
                    ? 0
                    : ((scaleValue - min) / (max - min)) * 100;
                return `<span class="pm-range-scale-label" style="top:${position}%">${label}</span>`;
            }).join('')}</div>`
            : '';
        return `<div class="mb-3 pm-field">
            <label for="pm-${field.key}" class="form-label small pm-range-label${orientationClass}">
                <strong>${field.label}:</strong> <span id="pm-${field.key}-display">${displayNow}</span>
            </label>
            <div class="pm-range-wrap${orientationClass}">
                <div class="pm-vertical-range-shell${orientationClass}" style="--pm-range-ratio:${rangeRatio};">
                    <div class="pm-vertical-range-slider" onpointerdown="PropertiesManager.handleVerticalRangePointerDown(event, 'pm-${field.key}')">
                        <div class="pm-vertical-range-track" aria-hidden="true"></div>
                        <div class="pm-vertical-range-thumb" aria-hidden="true"></div>
                        <input type="range" class="form-range${orientationClass}"
                               id="pm-${field.key}" name="${field.key}"
                               data-key="${field.key}"
                               data-display-id="pm-${field.key}-display"
                               data-display-add-input-key="${field.displayAddInputKey || ''}"
                               data-dimension-range="${field.dimension ? 'true' : 'false'}"
                               data-mm-per-unit="${mmPerUnit}"
                               min="${min}" max="${max}" step="${step}" value="${sliderValue}"
                               oninput="PropertiesManager.handleRangeInput(this, 'pm-${field.key}-display')"${orientationAttrs}>
                    </div>
                    ${scaleHTML}
                </div>
            </div>${field.help ? `
            <div class="form-text">${field.help}</div>` : ''}
        </div>`;
    }

    static handleRangeInput(input, displayId) {
        if (!input) return;
        const display = document.getElementById(displayId);
        this.updateRangeDisplay(input, display);

        this.syncVerticalRangeVisual(input);
    }

    static updateRangeDisplay(input, display = null) {
        if (!input) return;

        const targetDisplay = display || document.getElementById(input.dataset.displayId || `${input.id}-display`);
        if (!targetDisplay) return;

        const isDimension = input.dataset.dimensionRange === 'true';
        const mmPerUnit = parseFloat(input.dataset.mmPerUnit || '1') || 1;
        const inputValue = parseFloat(input.value);
        const baseValue = Number.isFinite(inputValue)
            ? (isDimension ? inputValue * mmPerUnit : inputValue)
            : 0;
        const extraKey = input.dataset.displayAddInputKey;
        const extraInput = extraKey ? document.getElementById(`pm-${extraKey}`) : null;
        const extraValue = extraInput ? parseDimension(extraInput.value) : 0;
        const combinedValue = baseValue + (Number.isFinite(extraValue) ? extraValue : 0);

        targetDisplay.textContent = isDimension
            ? formatDimension(combinedValue, true)
            : String(combinedValue);
    }

    static handleDimensionInput(input) {
        if (!input) return;
        this.refreshLinkedRangeDisplays(input.dataset.refreshRangeDisplayKey);
    }

    static handleDimensionBlur(input) {
        if (!input) return;
        input.value = formatDimension(parseDimension(input.value), true);
        this.handleDimensionInput(input);
        input.blur();
    }

    static refreshLinkedRangeDisplays(changedKey) {
        if (!changedKey) return;

        document.querySelectorAll(`input[type="range"][data-display-add-input-key="${changedKey}"]`).forEach(input => {
            this.updateRangeDisplay(input);
            this.syncVerticalRangeVisual(input);
        });
    }

    static handleVerticalRangePointerDown(event, inputId) {
        const input = document.getElementById(inputId);
        const slider = event.currentTarget;
        if (!input || !slider) return;

        event.preventDefault();

        const update = moveEvent => {
            this._updateVerticalRangeFromPointer(input, slider, moveEvent);
        };

        const stop = () => {
            document.removeEventListener('pointermove', update);
            document.removeEventListener('pointerup', stop);
            document.removeEventListener('pointercancel', stop);
            input.dispatchEvent(new Event('change', { bubbles: true }));
        };

        document.addEventListener('pointermove', update);
        document.addEventListener('pointerup', stop);
        document.addEventListener('pointercancel', stop);

        update(event);
    }

    static _updateVerticalRangeFromPointer(input, slider, event) {
        const rect = slider.getBoundingClientRect();
        if (!rect || rect.height <= 0) return;

        const min = parseFloat(input.min);
        const max = parseFloat(input.max);
        const step = parseFloat(input.step || '1');
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;

        const rawRatio = (event.clientY - rect.top) / rect.height;
        const ratio = Math.min(1, Math.max(0, rawRatio));
        const steppedValue = this._snapRangeValue(min + ratio * (max - min), min, max, step);

        input.value = String(steppedValue);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    static _snapRangeValue(value, min, max, step) {
        const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
        const snapped = min + (Math.round((value - min) / safeStep) * safeStep);
        const clamped = Math.min(max, Math.max(min, snapped));
        const precision = this._rangeStepPrecision(safeStep);
        return Number(clamped.toFixed(precision));
    }

    static _rangeStepPrecision(step) {
        if (!Number.isFinite(step)) return 0;
        const stepString = String(step);
        if (stepString.includes('e-')) {
            return parseInt(stepString.split('e-')[1], 10) || 0;
        }
        const decimals = stepString.split('.')[1];
        return decimals ? decimals.length : 0;
    }

    static syncVerticalRangeVisual(input) {
        const shell = input?.closest('.pm-vertical-range-shell');
        if (!shell) return;

        const min = parseFloat(input.min);
        const max = parseFloat(input.max);
        const value = parseFloat(input.value);
        const ratio = (!Number.isFinite(min) || !Number.isFinite(max) || max === min)
            ? 0
            : Math.min(1, Math.max(0, (value - min) / (max - min)));

        shell.style.setProperty('--pm-range-ratio', String(ratio));
    }

    static _buildRangeScaleValues(field, min, max) {
        if (Array.isArray(field.scaleLabels) && field.scaleLabels.length > 0) {
            return Array.from(new Set(field.scaleLabels.filter(value => Number.isFinite(value))));
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
            return [];
        }
        if (min === max) {
            return [min];
        }
        const midpoint = min + ((max - min) / 2);
        return Array.from(new Set([min, midpoint, max].map(value => Number(value.toFixed(4)))));
    }

    static _checkboxHTML(field, value) {
        return `<div class="mb-3 pm-field">
            <div class="form-check">
                <input type="checkbox" class="form-check-input"
                       id="pm-${field.key}" name="${field.key}"
                       ${value ? 'checked' : ''}>
                <label class="form-check-label small" for="pm-${field.key}">
                    <strong>${field.label}</strong>
                </label>
            </div>${field.help ? `
            <div class="form-text">${field.help}</div>` : ''}
        </div>`;
    }

    static _radioGridHTML(field, value) {
        // cols must evenly divide 12 for valid Bootstrap grid classes (1,2,3,4,6,12)
        const cols = field.cols || 3;
        if (![1, 2, 3, 4, 6, 12].includes(cols)) {
            console.warn(`PropertiesManager: radio-grid cols="${cols}" does not divide 12 evenly; use 1,2,3,4,6, or 12`);
        }
        const colClass = `col-${12 / cols}`;
        const cells = (field.options || []).map(opt => {
            const v = typeof opt === 'string' ? opt : opt.value;
            const checked = v === value ? 'checked' : '';
            return `<div class="${colClass}">
                <div class="pm-radio-cell" onclick="document.getElementById('pm-${field.key}-${v}').click()">
                    <input class="form-check-input" type="radio"
                           id="pm-${field.key}-${v}" name="${field.key}"
                           value="${v}" ${checked}>
                </div>
            </div>`;
        }).join('\n');

        return `<div class="mb-3 pm-field">
            <label class="form-label small"><strong>${field.label}:</strong></label>
            <div class="pm-radio-grid">
                <div class="row g-1">${cells}</div>
            </div>${field.help ? `
            <div class="form-text">${field.help}</div>` : ''}
        </div>`;
    }
}

if (typeof window !== 'undefined') {
    window.PropertiesManager = PropertiesManager;
}
