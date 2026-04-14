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
            } else if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
                el.value = value;
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
        const display = (typeof formatDimension === 'function')
            ? formatDimension(parseDimension(value), true)
            : String(value);
        return `<div class="mb-3 pm-field">
            <label for="pm-${field.key}" class="form-label small"><strong>${field.label}:</strong></label>
            <input type="text" class="form-control form-control-sm"
                   id="pm-${field.key}" name="${field.key}"
                   value="${display}"
                   onblur="this.value = formatDimension(parseDimension(this.value), true)"
                   onkeydown="if(event.key==='Enter'){this.value=formatDimension(parseDimension(this.value),true);this.blur();}">${field.help ? `
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
        const optionsHTML = (field.options || []).map(opt => {
            const v = typeof opt === 'string' ? opt : opt.value;
            const l = typeof opt === 'string' ? opt : opt.label;
            return `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`;
        }).join('');
        return `<div class="mb-3 pm-field">
            <label for="pm-${field.key}" class="form-label small"><strong>${field.label}:</strong></label>
            <select class="form-select form-select-sm" id="pm-${field.key}" name="${field.key}">
                ${optionsHTML}
            </select>${field.help ? `
            <div class="form-text">${field.help}</div>` : ''}
        </div>`;
    }

    static _rangeHTML(field, value) {
        const min  = field.min  !== undefined ? field.min  : 0;
        const max  = field.max  !== undefined ? field.max  : 100;
        const step = field.step !== undefined ? field.step : 1;
        // Dimension ranges: value is stored in mm; slider operates in display units
        const mmPerUnit   = field.mmPerUnit ?? 1;
        const sliderValue = field.dimension ? value / mmPerUnit : value;
        const displayNow  = field.dimension ? formatDimension(value, true) : value;
        const oninput     = field.dimension
            ? `formatDimension(parseFloat(this.value)*${mmPerUnit},true)`
            : `this.value`;
        return `<div class="mb-3 pm-field">
            <label for="pm-${field.key}" class="form-label small">
                <strong>${field.label}:</strong> <span id="pm-${field.key}-display">${displayNow}</span>
            </label>
            <input type="range" class="form-range"
                   id="pm-${field.key}" name="${field.key}"
                   min="${min}" max="${max}" step="${step}" value="${sliderValue}"
                   oninput="document.getElementById('pm-${field.key}-display').textContent=${oninput}">${field.help ? `
            <div class="form-text">${field.help}</div>` : ''}
        </div>`;
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
