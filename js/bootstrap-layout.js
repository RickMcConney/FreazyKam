/**
 * Bootstrap-based UI Layout System
 * Replaces w2ui components with Bootstrap equivalents
 */

// Version number based on latest commit date
var APP_VERSION = "Ver 2026-04-26";

var mode = "Select";
var options = [];
var tools = [];
var currentTool = null;
var currentFileName = "none";

function importReferenceImage(dataUrl, filename) {
    var img = new Image();
    img.onload = function() {
        var name = filename.replace(/\.[^.]+$/, '');
        var wpW = getOption("workpieceWidth") * viewScale;
        var wpH = getOption("workpieceLength") * viewScale;
        var imgAspect = img.naturalWidth / img.naturalHeight;
        var wpAspect = wpW / wpH;

        var w, h;
        if (imgAspect > wpAspect) {
            w = wpW * 0.8;
            h = w / imgAspect;
        } else {
            h = wpH * 0.8;
            w = h * imgAspect;
        }

        var x0 = (wpW - w) / 2;
        var y0 = (wpH - h) / 2;

        addUndo(false, true, false);

        var id = 'IMG' + svgpathId++;
        var svgpath = {
            id: id,
            name: name,
            type: 'image',
            imageData: dataUrl,
            imageNaturalWidth: img.naturalWidth,
            imageNaturalHeight: img.naturalHeight,
            path: [
                { x: x0,     y: y0 },
                { x: x0 + w, y: y0 },
                { x: x0 + w, y: y0 + h },
                { x: x0,     y: y0 + h },
            ],
            bbox: { minx: x0, miny: y0, maxx: x0 + w, maxy: y0 + h },
            visible: true,
            creationTool: 'Image'
        };

        svgpaths.push(svgpath);
        addSvgPath(id, name);
        redraw();
    };
    img.src = dataUrl;
}

function setProjectName(name) {
    const el = document.getElementById('project-name-display');
    if (el) el.textContent = name || '';
}
// gcodeProfiles, currentGcodeProfile and the profile management functions
// (load/save/initializeGcodeProfilesUI/populateGcodeProfileSelector/etc.)
// extracted to js/bootstrap-layout/gcodeProfiles.js
var currentOperationName = null;


// Wood species database with cutting parameters
var woodSpeciesDatabase = {
    'Pine': {
        color: '#F5DEB3', // Wheat
        density: 0.5,
        feedMultiplier: 1.2,
        speedMultiplier: 1.0
    },
    'Oak': {
        color: '#DEB887', // Burlywood
        density: 0.75,
        feedMultiplier: 0.8,
        speedMultiplier: 0.9
    },
    'Maple': {
        color: '#F0E68C', // Khaki
        density: 0.7,
        feedMultiplier: 0.9,
        speedMultiplier: 0.95
    },
    'Cherry': {
        color: '#FFB6C1', // Light Pink
        density: 0.6,
        feedMultiplier: 1.0,
        speedMultiplier: 1.0
    },
    'Walnut': {
        color: '#D2B48C', // Tan
        density: 0.65,
        feedMultiplier: 0.95,
        speedMultiplier: 0.95
    },
    'Birch': {
        color: '#FFF8DC', // Cornsilk
        density: 0.68,
        feedMultiplier: 0.9,
        speedMultiplier: 0.95
    },
    'Poplar': {
        color: '#e6f7c1', // patel green
        density: 0.45,
        feedMultiplier: 1.3,
        speedMultiplier: 1.1
    },
    'Cedar': {
        color: '#f8d091', // Lavender
        density: 0.35,
        feedMultiplier: 1.4,
        speedMultiplier: 1.2
    },
    'Ash': {
        color: '#FFFACD', // Lemon Chiffon
        density: 0.72,
        feedMultiplier: 0.85,
        speedMultiplier: 0.9
    },
    'Mahogany': {
        color: '#f5c373', // Misty Rose
        density: 0.55,
        feedMultiplier: 1.1,
        speedMultiplier: 1.0
    }
};

function getDefaultOptions() {
    return [
        { recid: 1,  option: 'showGrid',           value: true,            desc: 'Show Grid',                                   hidden: true  },
        { recid: 2,  option: 'showOrigin',          value: true,            desc: 'Show Origin',                                 hidden: true  },
        { recid: 3,  option: 'Inches',              value: false,           desc: 'Display Inches',                              hidden: false },
        { recid: 4,  option: 'safeHeight',          value: 5,               desc: 'Safe Height in mm',                           hidden: false },
        { recid: 5,  option: 'tolerance',           value: 0.1,             desc: 'Tool path tolerance (mm)',                    hidden: false },
        { recid: 6,  option: 'zbacklash',           value: 0.1,             desc: 'Back lash compensation in mm',                hidden: false },
        { recid: 7,  option: 'workpieceWidth',      value: 300,             desc: 'Workpiece Width (mm)',                        hidden: true  },
        { recid: 8,  option: 'workpieceLength',     value: 200,             desc: 'Workpiece Length (mm)',                       hidden: true  },
        { recid: 9,  option: 'workpieceThickness',  value: 19,              desc: 'Workpiece Thickness (mm)',                    hidden: true  },
        { recid: 10, option: 'woodSpecies',         value: 'Pine',          desc: 'Wood Species',                                hidden: true  },
        { recid: 11, option: 'autoFeedRate',        value: false,           desc: 'Auto Calculate Feed Rates',                   hidden: false },
        { recid: 12, option: 'minFeedRate',         value: 100,             desc: 'Minimum Feed Rate (mm/min)',                  hidden: false },
        { recid: 13, option: 'maxFeedRate',         value: 1000,            desc: 'Maximum Feed Rate (mm/min)',                  hidden: false },
        { recid: 14, option: 'originPosition',      value: 'middle-center', desc: 'Origin Position',                             hidden: true  },
        { recid: 15, option: 'gridSize',            value: 10,              desc: 'Grid Size (mm)',                              hidden: true  },
        { recid: 16, option: 'showWorkpiece',       value: true,            desc: 'Show Workpiece',                              hidden: true  },
        { recid: 17, option: 'tableWidth',          value: 4000,            desc: 'Max cutting width (X travel) in mm',          hidden: false },
        { recid: 18, option: 'tableDepth',          value: 2000,            desc: 'Max cutting length (Y travel) in mm',         hidden: false },
        { recid: 21, option: 'tableHeight',         value: 100,             desc: 'Max cutting depth (Z travel) in mm',          hidden: false },
        { recid: 19, option: 'showTooltips',        value: true,            desc: 'Tooltips enabled',                            hidden: false },
        { recid: 20, option: 'snapGrid',            value: true,            desc: 'Snap to Grid',                                hidden: true  }
    ];
}

// Load options from localStorage
function loadOptions() {
    var optionData = localStorage.getItem('options');
    if (optionData) {
        options = JSON.parse(optionData);
    } else {
        options = getDefaultOptions();
    }
}

// Load tools from localStorage
function loadTools() {
    var toolData = localStorage.getItem('tools');
    if (toolData) {
        tools = JSON.parse(toolData);
    } else {
        // Calculate default depth/step based on default workpiece thickness (19mm)
        const defaultThickness = 19;
        const endMillDepth = defaultThickness * 1.0; // 100%
        const endMillStep = defaultThickness * 0.25; // 25%
        const drillDepth = defaultThickness * 1.0; // 100%
        const drillStep = defaultThickness * 0.25; // 25%

        tools = [{
            recid: 1,
            color: '9FC5E8',
            name: "6mm End Mill",
            direction: 'Climb',
            diameter: 6,
            flutes: 2,
            rpm: 18000,
            feed: 600,
            zfeed: 200,
            angle: 0,
            bit: 'End Mill',
            depth: endMillDepth,
            step: endMillStep,
            stepover: 25,
            depthPercent: 100,
            stepPercent: 25,
        }, {
            recid: 2,
            color: '6FA8DC',
            name: "6mm VBit",
            direction: 'Climb',
            diameter: 6,
            flutes: 4,
            rpm: 16000,
            feed: 500,
            zfeed: 200,
            angle: 60,
            bit: 'VBit',
            depth: 6,
            step: 0,
            stepover: 25,
            depthPercent: null,
            stepPercent: null,
        }, {
            recid: 3,
            color: '3D85C6',
            name: "6mm Drill",
            direction: 'Conventional',
            diameter: 6,
            flutes: 2,
            rpm: 12000,
            feed: 500,
            zfeed: 200,
            angle: 0,
            bit: 'Drill',
            depth: drillDepth,
            step: drillStep,
            stepover: 0,
            depthPercent: 100,
            stepPercent: 25,
        }, {
            recid: 4,
            color: '0E5EB4',
            name: "6mm Ball Nose",
            direction: 'Climb',
            diameter: 6,
            flutes: 2,
            rpm: 16000,
            feed: 400,
            zfeed: 150,
            angle: 0,
            bit: 'Ball Nose',
            depth: 6,
            step: 2,
            stepover: 50,
            depthPercent: 100,
            stepPercent: 25,
        }];
    }

    // Migration: Add flutes, rpm, and percentage fields to existing tools that don't have them
    let needsSave = false;
    tools.forEach(tool => {
        if (tool.flutes === undefined) {
            tool.flutes = 2; // Default to 2 flutes
            needsSave = true;
        }
        if (tool.rpm === undefined) {
            // Set RPM based on tool type
            if (tool.bit === 'VBit') {
                tool.rpm = 16000;
            } else if (tool.bit === 'Drill') {
                tool.rpm = 12000;
            } else {
                tool.rpm = 18000;
            }
            needsSave = true;
        }
        // Add percentage fields if they don't exist (null means no percentage, use absolute value)
        if (tool.depthPercent === undefined) {
            tool.depthPercent = null;
            needsSave = true;
        }
        if (tool.stepPercent === undefined) {
            tool.stepPercent = null;
            needsSave = true;
        }
    });

    if (needsSave) {
        localStorage.setItem('tools', JSON.stringify(tools));
    }

    if (tools.length > 0) {
        currentTool = tools[0];
    }
    renderToolsTable();
}
// File input handlers
var fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.svg,.stl,.png,.jpg,.jpeg,.gcode,.nc,.ngc,.tap';
fileInput.id = 'fileInput';
fileInput.addEventListener('change', function (e) {
    autoCloseToolProperties('file import');

    var file = fileInput.files[0];
    currentFileName = file.name.split('.').shift();

    var ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'gcode' || ext === 'nc' || ext === 'ngc' || ext === 'tap') {
        var reader = new FileReader();
        reader.onload = function (event) {
            window._importedGcode = event.target.result;
            window._cachedGcode = event.target.result;
            // Switch to 3D tab to run simulation
            var tab3D = document.getElementById('3d-tab');
            if (tab3D) {
                tab3D.click();
            }
        };
        reader.readAsText(file);
        fileInput.value = "";
        return;
    }
    if (ext === 'stl') {
        if (typeof window.importSTLFile === 'function') {
            window.importSTLFile(file);
        } else {
            alert('STL import module not loaded yet. Please try again.');
        }
        fileInput.value = "";
        return;
    }

    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
        var reader = new FileReader();
        reader.onload = function (event) {
            importReferenceImage(event.target.result, file.name);
        };
        reader.readAsDataURL(file);
        fileInput.value = "";
        return;
    }

    var reader = new FileReader();
    reader.onload = function (event) {
        parseSvgContent(event.target.result, file.name);
        redraw();
    };
    reader.readAsText(file);
    fileInput.value = "";
});

var fileOpen = document.createElement('input');
fileOpen.type = 'file';
fileOpen.accept = '.json';
fileOpen.addEventListener('change', function (e) {
    autoCloseToolProperties('project open');

    var file = fileOpen.files[0];
    currentFileName = file.name.split('.').shift();
    setProjectName(currentFileName);

    var reader = new FileReader();
    reader.onload = function (event) {
        loadProject(event.target.result);
    };
    reader.readAsText(file);
    fileOpen.value = "";
});

var pngFileInput = document.createElement('input');
pngFileInput.type = 'file';
pngFileInput.accept = '.png,.jpg,.jpeg';
pngFileInput.id = 'pngFileInput';
pngFileInput.addEventListener('change', function (e) {
    autoCloseToolProperties('PNG import');

    var file = pngFileInput.files[0];
    if (!file) return;

    currentFileName = file.name.split('.').shift();

    var reader = new FileReader();
    reader.onload = function (event) {
        importReferenceImage(event.target.result, file.name);
    };
    reader.readAsDataURL(file);
    pngFileInput.value = "";
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Remove boundary/corner paths from ImageTracer SVG output
 * These are typically rectangular paths at the image edges
 */
function removeBoundaryPaths(svgString) {
    try {
        // Parse SVG string into DOM
        var parser = new DOMParser();
        var svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
        var svgElement = svgDoc.querySelector('svg');

        if (!svgElement) return svgString;

        // Get SVG dimensions
        var viewBox = svgElement.getAttribute('viewBox');
        var width, height;

        if (viewBox) {
            var vb = viewBox.split(/\s+/);
            width = parseFloat(vb[2]);
            height = parseFloat(vb[3]);
        } else {
            width = parseFloat(svgElement.getAttribute('width')) || 0;
            height = parseFloat(svgElement.getAttribute('height')) || 0;
        }

        if (!width || !height) return svgString;

        // Get all path elements
        var paths = svgDoc.querySelectorAll('path');
        var pathsToRemove = [];

        // Threshold for considering a path as boundary (within 2 pixels of edge)
        var edgeThreshold = 2;

        paths.forEach(function(pathElement) {
            var d = pathElement.getAttribute('d');
            if (!d) return;

            // Extract all coordinate pairs from the path
            var coordMatches = d.match(/(-?[\d.]+)\s+(-?[\d.]+)/g);
            if (!coordMatches || coordMatches.length === 0) return;

            var coords = coordMatches.map(function(pair) {
                var parts = pair.trim().split(/\s+/);
                return {
                    x: parseFloat(parts[0]),
                    y: parseFloat(parts[1])
                };
            });

            // Check if path has any actual corner coordinates
            // A corner point must have BOTH x at edge AND y at edge (same point)
            var hasTopLeftCorner = coords.some(function(c) {
                return c.x <= edgeThreshold && c.y <= edgeThreshold;
            });
            var hasTopRightCorner = coords.some(function(c) {
                return c.x >= width - edgeThreshold && c.y <= edgeThreshold;
            });
            var hasBottomLeftCorner = coords.some(function(c) {
                return c.x <= edgeThreshold && c.y >= height - edgeThreshold;
            });
            var hasBottomRightCorner = coords.some(function(c) {
                return c.x >= width - edgeThreshold && c.y >= height - edgeThreshold;
            });

            // Count how many different corners this path touches
            var cornerCount = 0;
            if (hasTopLeftCorner) cornerCount++;
            if (hasTopRightCorner) cornerCount++;
            if (hasBottomLeftCorner) cornerCount++;
            if (hasBottomRightCorner) cornerCount++;

            // Remove if path touches any corner (boundary artifacts)
            if (cornerCount >= 1) {
                pathsToRemove.push(pathElement);
            }
        });

        // Remove identified boundary paths
        pathsToRemove.forEach(function(path) {
            path.parentNode.removeChild(path);
        });

        // Serialize back to string
        var serializer = new XMLSerializer();
        return serializer.serializeToString(svgDoc);

    } catch (e) {
        console.error('Error removing boundary paths:', e);
        return svgString; // Return original on error
    }
}

/**
 * Collect properties for an operation via PropertiesManager.
 */
function collectOperationProperties(operation) {
    return PropertiesManager.collectValues(Object.values(operation?.fields ?? {}));
}

/**
 * Replace event listener on an element by cloning it
 * This removes all existing event listeners and adds a new one
 * @param {HTMLElement} element - The element to update
 * @param {string} eventType - The event type (e.g., 'click')
 * @param {Function} handler - The new event handler
 * @param {Object} options - Optional event listener options
 * @returns {HTMLElement} The new cloned element
 */
/**
 * Create a generic context menu
 * @param {Event} event - The contextmenu event
 * @param {Object} config - Configuration object
 * @param {Array} config.items - Array of menu items {label, icon, action, danger, divider}
 * @param {Function} config.onAction - Callback for menu actions (action, data)
 * @param {*} config.data - Data to pass to the action handler
 */
function createContextMenu(event, config) {
    event.preventDefault();

    // Remove existing context menu
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const menu = document.createElement('div');
    menu.className = 'dropdown-menu show context-menu';
    menu.style.position = 'fixed';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.style.zIndex = '9999';

    // Build menu items HTML
    const itemsHtml = config.items.map(item => {
        if (item.divider) {
            return '<div class="dropdown-divider"></div>';
        }
        const dangerClass = item.danger ? 'text-danger' : '';
        return `
            <button class="dropdown-item ${dangerClass}" data-action="${item.action}">
                <i data-lucide="${item.icon}"></i> ${item.label}
            </button>
        `;
    }).join('');

    menu.innerHTML = itemsHtml;
    document.body.appendChild(menu);
    lucide.createIcons();

    // Adjust position after icons render so menu height is accurate
    requestAnimationFrame(() => {
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.bottom > window.innerHeight) {
            menu.style.top = Math.max(0, window.innerHeight - menuRect.height - 4) + 'px';
        }
        if (menuRect.right > window.innerWidth) {
            menu.style.left = Math.max(0, window.innerWidth - menuRect.width - 4) + 'px';
        }
    });

    // Add event handlers
    menu.addEventListener('click', function (e) {
        const button = e.target.closest('[data-action]');
        if (button && config.onAction) {
            const action = button.dataset.action;
            config.onAction(action, config.data);
        }
        menu.remove();
    });

    // Remove menu when clicking/touching elsewhere (delay to avoid the triggering event)
    setTimeout(() => {
        function closeMenu() {
            menu.remove();
            document.removeEventListener('click', closeMenu);
            document.removeEventListener('touchstart', closeMenu);
        }
        document.addEventListener('click', closeMenu);
        document.addEventListener('touchstart', closeMenu);
    }, 300);
}

/**
 * Get nested property value from an object using dot notation
 * @param {Object} obj - The object to get the value from
 * @param {string} path - The property path (e.g., 'tool.name')
 * @returns {*} The value at the path
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
}

/**
 * Set visibility for items in a collection based on a filter
 * @param {Array} collection - The array to filter (svgpaths or toolpaths)
 * @param {string} filterKey - The property to filter on (supports dot notation like 'tool.name')
 * @param {*} filterValue - The value to match
 * @param {boolean} visible - Whether to show or hide
 * @param {string} itemLabel - Label for notification (e.g., 'path(s)', 'toolpath(s)')
 */
function setGroupVisibility(collection, filterKey, filterValue, visible, itemLabel = 'item(s)') {
    let changedCount = 0;
    collection.forEach(function (item) {
        if (getNestedValue(item, filterKey) === filterValue) {
            item.visible = visible;
            changedCount++;
            if (item.id) updatePathVisibilityIcon(item.id, visible);
        }
    });

    if (changedCount > 0) {
        notify(`${visible ? 'Shown' : 'Hidden'} ${changedCount} ${itemLabel}`, 'success');
        redraw();
    }
}

/**
 * Delete a group of items with confirmation
 * @param {Object} config - Configuration object
 * @param {Array} config.collection - The array to delete from
 * @param {string} config.filterKey - The property to filter on (supports dot notation like 'tool.name')
 * @param {*} config.filterValue - The value to match
 * @param {string} config.title - Modal title
 * @param {string} config.groupLabel - Label for the group (e.g., 'Tool Folder', 'SVG Group')
 * @param {string} config.itemLabel - Label for items (e.g., 'toolpath(s)', 'path(s)')
 * @param {string} config.selectorAttr - Attribute selector for DOM element (e.g., 'data-tool-name')
 * @param {Function} config.onComplete - Optional callback after deletion
 */
function deleteGroup(config) {
    const itemsToDelete = config.collection.filter(item => getNestedValue(item, config.filterKey) === config.filterValue);

    if (itemsToDelete.length === 0) return;

    showConfirmModal({
        title: `Delete ${config.groupLabel}`,
        message: `
            <p>Are you sure you want to delete all <strong>${itemsToDelete.length}</strong> ${config.itemLabel} for <strong>"${config.filterValue}"</strong>?</p>
            <p class="text-muted mb-0">This action cannot be undone.</p>
        `,
        confirmText: 'Delete All',
        confirmClass: 'btn-danger',
        headerClass: 'bg-danger text-white',
        onConfirm: function () {
            // Delete all items with this filter value
            for (let i = config.collection.length - 1; i >= 0; i--) {
                if (getNestedValue(config.collection[i], config.filterKey) === config.filterValue) {
                    config.collection.splice(i, 1);
                }
            }

            // Remove the DOM element if selector provided
            if (config.selectorAttr) {
                const element = document.querySelector(`[${config.selectorAttr}="${config.filterValue}"]`);
                if (element) {
                    element.remove();
                }
            }

            // Call completion callback if provided
            if (config.onComplete) {
                config.onComplete();
            }

            notify(`Deleted ${itemsToDelete.length} ${config.itemLabel}`, 'success');
            redraw();
        }
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize layout
function initializeLayout() {
    loadOptions();
    loadGcodeProfiles();
    createToolbar();
    createSidebar();
    createToolPanel();
    createModals();
    initializeGcodeView();
    cncController.operationManager.addOperations();
    lucide.createIcons();
    updateSnapButton();
}

// Toolbar creation
function createToolbar() {
    const toolbar = document.getElementById('toolbar');
    toolbar.innerHTML = `
        <div class="d-flex align-items-center w-100">
            <div class="toolbar-section">
                <button type="button" class="btn btn-outline-primary btn-sm btn-toolbar" data-action="new" data-bs-toggle="tooltip" data-bs-placement="bottom" title="New Project">
                    <i data-lucide="file-plus"></i>New
                </button>
                <button type="button" class="btn btn-outline-primary btn-sm btn-toolbar" data-action="open" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Open Project">
                    <i data-lucide="folder-open"></i>Open
                </button>
                <button type="button" class="btn btn-outline-primary btn-sm btn-toolbar" data-action="save" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Save Project">
                    <i data-lucide="save"></i>Save
                </button>
                <button type="button" class="btn btn-outline-primary btn-sm btn-toolbar" data-action="import" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Import SVG, STL, G-code, or image files">
                    <i data-lucide="import"></i>Import
                </button>
                <button type="button" class="btn btn-outline-success btn-sm btn-toolbar" data-action="gcode" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Save G-code">
                    <i data-lucide="file-cog"></i>G-code
                </button>
            </div>
            <div class="toolbar-separator"></div>
            <div class="toolbar-section">
                <button type="button" class="btn btn-outline-secondary btn-sm btn-toolbar" data-action="undo" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Undo last action (Ctrl/Cmd+Z)">
                    <i data-lucide="undo-2"></i>Undo
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm btn-toolbar" data-action="redo" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Redo last action (Ctrl/Cmd+Y)">
                    <i data-lucide="redo-2"></i>Redo
                </button>
            </div>
            <div class="toolbar-separator"></div>
            <div class="toolbar-section">
                <button type="button" id="snap-toggle-btn" class="btn btn-sm btn-toolbar btn-outline-secondary" data-action="snap" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Snap to Grid (S)">
                    <svg id="snap-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6c757d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;">
                        <path d="m12 15 4 4"/>
                        <path d="M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z"/>
                        <path d="m5 8 4 4"/>
                        <path id="snap-pole-left" d="M5 8 L2.352 10.648 L2.352 12.352 L4.648 14.648 L6.352 14.648 L9 12 Z" stroke="none" fill="none"/>
                        <path id="snap-pole-right" d="M12 15 L9.352 17.648 L9.352 19.352 L11.648 21.648 L13.352 21.648 L16 19 Z" stroke="none" fill="none"/>
                    </svg>Snap
                </button>
            </div>
            <div class="ms-auto toolbar-section">
                <button type="button" class="btn btn-outline-info btn-sm btn-toolbar" data-action="options" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Application Options">
                    <i data-lucide="settings"></i>Options
                </button>
                <button type="button" class="btn btn-outline-info btn-sm btn-toolbar" data-action="help" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Help">
                    <i data-lucide="help-circle"></i>Help
                </button>
            </div>
        </div>
    `;

    // Add toolbar event handlers
    toolbar.addEventListener('click', function (e) {
        const button = e.target.closest('[data-action]');
        if (!button) return;

        const action = button.dataset.action;

        // Auto-close tool properties on toolbar actions (except undo/redo)
        if (action !== 'undo' && action !== 'redo') {
            autoCloseToolProperties('toolbar action: ' + action);
        }

        switch (action) {
            case 'new':
                // Switch to 2D view before creating new project so canvas has proper dimensions
                const canvas2DTab = document.getElementById('2d-tab');
                if (canvas2DTab) {
                    const tab = new bootstrap.Tab(canvas2DTab);
                    tab.show();
                }
                currentFileName = "none";
                setProjectName('');
                window._importedGcode = null;
                newProject();
                const drawToolsTab = document.getElementById('draw-tools-tab');
                if (drawToolsTab) new bootstrap.Tab(drawToolsTab).show();
                break;
            case 'open':
                fileOpen.click();
                break;
            case 'save':
                saveProject();
                break;
            case 'import':
                fileInput.click();
                break;
            case 'gcode':
                doGcode();
                break;
            case 'undo':
                doUndo();
                break;
            case 'redo':
                doRedo();
                break;
            case 'snap':
                toggleSnap();
                break;
            case 'options':
                showOptionsModal();
                break;
            case 'help':
                showHelpModal();
                break;
        }
    });
}

function toggleSnap() {
    const current = getOption("snapGrid") !== false;
    setOption("snapGrid", !current);
    updateSnapButton();
}

function updateSnapButton() {
    const button = document.getElementById('snap-toggle-btn');
    const icon = document.getElementById('snap-icon');
    if (!button || !icon) return;
    const on = getOption("snapGrid") !== false;
    const color = on ? '#106efd' : '#6c757d';
    icon.setAttribute('stroke', color);
    button.style.color = on ? color : '';
    const fill = on ? color : 'none';
    const poleLeft = document.getElementById('snap-pole-left');
    const poleRight = document.getElementById('snap-pole-right');
    if (poleLeft) poleLeft.setAttribute('fill', fill);
    if (poleRight) poleRight.setAttribute('fill', fill);
}


// Sidebar creation
function createSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = `
        <!-- Tab Navigation (fixed at top) -->
        <nav class="nav nav-tabs border-bottom flex-shrink-0" id="sidebar-tabs" role="tablist">
            <button class="nav-link active" id="draw-tools-tab" data-bs-toggle="tab" data-bs-target="#draw-tools" type="button" role="tab">
                <i data-lucide="drafting-compass"></i> Draw Tools
            </button>
            <button class="nav-link" id="operations-tab" data-bs-toggle="tab" data-bs-target="#operations" type="button" role="tab">
                <i data-lucide="cog"></i> Operations
            </button>
            <button type="button" class="btn-close ms-auto me-2 align-self-center" id="panel-close-button" aria-label="Close" style="display: none;" title="Close panel"></button>
        </nav>

        <!-- Tab Content (scrollable) -->
        <div class="sidebar-tab-content" id="sidebar-content" style="flex: 1; min-height: 0; overflow-y: auto;">
            <!-- Draw Tools Tab -->
            <div class="tab-pane fade show active h-100" id="draw-tools" role="tabpanel">
                <div id="draw-tools-list" class="p-3">
                    <!-- Draw Tools will be added dynamically -->
                </div>

                

                <!-- Tool Properties Editor (hidden by default) -->
                <div id="tool-properties-editor" class="p-3" style="display: none;">
                    <div class="mb-3 pb-3 border-bottom d-flex justify-content-between align-items-center">
                        <h6 class="mb-0" id="tool-properties-title">Tool Properties</h6>
                    </div>

                    <!-- Properties form will be injected here -->
                    <div id="tool-properties-form"></div>

                    <!-- Help section -->
                    <div class="mt-4">
                        <h6 class="text-muted mb-2">
                            <i data-lucide="help-circle"></i> How to use
                        </h6>
                        <div id="tool-help-content" class="small text-muted mb-3">
                            Select a tool to see instructions here.
                        </div>
                    </div>
                </div>

                <!-- SVG Paths Section -->
                    <div class="sidebar-section mt-4">
                        <div class="sidebar-section-header" data-bs-toggle="collapse" data-bs-target="#svg-paths-section" aria-expanded="true">
                            <span>SVG Paths</span>
                            <i data-lucide="chevron-down" class="collapse-chevron"></i>
                        </div>
                        <div class="collapse show" id="svg-paths-section">
                            <!-- SVG paths will be added dynamically -->
                        </div>
                    </div>


            </div>

            <!-- Operations Tab -->
            <div class="tab-pane fade h-100" id="operations" role="tabpanel">
                <div id="operations-list" class="p-3">
                    <div class="sidebar-item" data-operation="Drill" data-bs-toggle="tooltip" data-bs-placement="right" title="Drill holes at selected points">
                        <i data-lucide="circle-plus"></i>Drill
                    </div>
                    <div class="sidebar-item" data-operation="Profile" data-bs-toggle="tooltip" data-bs-placement="right" title="Cut inside or outside the selected path">
                        <i data-lucide="circle"></i>Profile
                    </div>

                    <div class="sidebar-item" data-operation="Pocket" data-bs-toggle="tooltip" data-bs-placement="right" title="Remove material inside the path">
                        <i data-lucide="target"></i>Pocket
                    </div>
                    <div class="sidebar-item" data-operation="VCarve" data-bs-toggle="tooltip" data-bs-placement="right" title="V-carve inside or outside the path">
                        <i data-lucide="star"></i>V-Carve
                    </div>
                    <div class="sidebar-item" data-operation="Inlay" data-bs-toggle="tooltip" data-bs-placement="right" title="Create male plug or female socket for inlay work">
                        <i data-lucide="inlay"></i>Inlay
                    </div>
                    <div class="sidebar-item" data-operation="Surfacing" data-bs-toggle="tooltip" data-bs-placement="right" title="Surface the entire workpiece with parallel passes">
                        <i data-lucide="align-justify"></i>Surfacing
                    </div>
                    <div class="sidebar-item" data-operation="3dProfile" data-bs-toggle="tooltip" data-bs-placement="right" title="3D raster toolpath following STL surface with ball nose bit">
                        <i data-lucide="mountain"></i>3D Profile
                    </div>
                </div>
                <!-- Operation Properties Editor (hidden by default) -->
                <div id="operation-properties-editor" class="p-3" style="display: none;">
                    <div class="mb-3 pb-3 border-bottom d-flex justify-content-between align-items-center">
                        <h6 class="mb-0" id="operation-properties-title">Operation Properties</h6>
                    </div>

                    <!-- Operation properties form will be injected here -->
                    <div id="operation-properties-form"></div>

                    <!-- Help section -->
                    <div class="mt-4">
                        <h6 class="text-muted mb-2">
                            <i data-lucide="help-circle"></i> How to use
                        </h6>
                        <div id="operation-help-content" class="small text-muted mb-3">
                            Select an operation to see instructions here.
                        </div>
                    </div>
                </div>
                    <!-- Tool Paths Section -->
                    <div class="sidebar-section mt-4">
                        <div class="sidebar-section-header" data-bs-toggle="collapse" data-bs-target="#tool-paths-section" aria-expanded="true">
                            <span>Tool Paths</span>
                            <i data-lucide="chevron-down" class="collapse-chevron"></i>
                        </div>
                        <div class="collapse show" id="tool-paths-section">
                            <!-- Tool paths will be added dynamically -->
                        </div>
                    </div>

                    <!-- Gcodes Section -->
                    <div class="sidebar-section mt-4">
                        <div class="sidebar-section-header" data-bs-toggle="collapse" data-bs-target="#gcodes-section" aria-expanded="false">
                            <span id="gcode-section-title">G-code Post Processor</span>
                            <i data-lucide="chevron-down" class="collapse-chevron"></i>
                        </div>
                        <div class="collapse" id="gcodes-section">
                            <div class="p-2">
                                <!-- Profile Selector -->
                                <div class="mb-3">
                                    <label for="gcode-profile-select" class="form-label small">Profile</label>
                                    <div class="d-flex gap-1">
                                        <select class="form-select form-select-sm" id="gcode-profile-select">
                                            <!-- Profiles will be populated dynamically -->
                                        </select>
                                        <button type="button" class="btn btn-outline-primary btn-sm" id="new-gcode-profile" data-bs-toggle="tooltip" title="New Profile">
                                            <i data-lucide="plus" style="width: 14px; height: 14px;"></i>
                                        </button>
                                        <button type="button" class="btn btn-outline-danger btn-sm" id="delete-gcode-profile" data-bs-toggle="tooltip" title="Delete Profile">
                                            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                                        </button>
                                    </div>
                                </div>

                                <!-- G-code Settings Form (generated by PropertiesManager) -->
                                <form id="gcode-profile-form">
                                    <div id="gcode-profile-fields"></div>
                                    <button type="button" class="btn btn-primary btn-sm w-100" id="save-gcode-profile">
                                        <i data-lucide="save"></i> Save Profile
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>



            </div>
        </div>

        <!-- G-Code Viewer (shown during simulation) -->
        <div id="gcode-viewer" class="d-flex flex-column" style="display: none; visibility: hidden; height: 0; overflow: hidden; background-color: white;">
            <div class="p-2 border-bottom">
                <small class="text-muted">Current G-code execution</small>
            </div>
            <div id="gcode-viewer-container" class="flex-grow-1 overflow-auto" style="font-family: monospace; font-size: 12px; line-height: 1.4;">
                <!-- G-code lines will be rendered here -->
            </div>
        </div>
    `;

    setupSidebarEventHandlers(sidebar);
    setupSidebarTabHandlers();
    setupCanvasTabHandlers();
    initializeGcodeProfilesUI();
}

function setupSidebarEventHandlers(sidebar) {
    sidebar.addEventListener('click', function (e) {
        const item = e.target.closest('.sidebar-item');
        const closeButton = e.target.closest('#panel-close-button');

        if (closeButton) {
            showToolsList();
            return;
        }

        if (!item) return;

        // Touch devices: tap on ⋮ area (right 40px) triggers context menu
        if ('ontouchstart' in window) {
            const rect = item.getBoundingClientRect();
            if (e.clientX >= rect.right - 40) {
                const pathId = item.dataset.pathId;
                if (pathId) {
                    showContextMenu({ clientX: rect.right - 20, clientY: rect.top + rect.height / 2, preventDefault() {} }, pathId);
                    return;
                }
            }
        }

        const operation = item.dataset.operation;
        const pathId = item.dataset.pathId;

        if (operation) {
            const isDrawTool = ['Select', 'Workpiece', 'Move', 'Edit', 'Pen', 'Curve', 'Shape', 'Boolean', 'Gemini', 'Text', 'Tabs', 'Offset', 'Pattern'].includes(operation);

            if (isDrawTool) {
                showToolPropertiesEditor(operation);
                handleOperationClick(operation);
            } else if (operation === 'Drill') {
                // Drill lives in the Operations panel but also activates an interactive canvas mode
                showOperationPropertiesEditor(operation);
                handleOperationClick(operation);
            } else {
                showOperationPropertiesEditor(operation);
                generateToolpathForSelection();
            }
        } else if (pathId) {
            handlePathClick(pathId);
        }
    });

    sidebar.addEventListener('contextmenu', function (e) {
        const item = e.target.closest('.sidebar-item');
        if (!item) return;

        const toolFolder = item.closest('[data-tool-name]');
        if (toolFolder && e.target.closest('.sidebar-item.fw-bold')) {
            e.preventDefault();
            showToolFolderContextMenu(e, toolFolder.dataset.toolName);
            return;
        }

        const svgGroup = item.closest('[data-svg-group-id]');
        if (svgGroup && item.dataset.svgGroupHeader) {
            e.preventDefault();
            showSvgGroupContextMenu(e, item.dataset.svgGroupHeader);
            return;
        }

        const patternGroup = item.closest('[data-pattern-group-id]');
        if (patternGroup && item.dataset.patternGroupHeader) {
            e.preventDefault();
            showGroupContextMenu(e, item.dataset.patternGroupHeader, 'patternGroupId', 'Pattern Group', 'data-pattern-group-id');
            return;
        }

        const textGroup = item.closest('[data-text-group-id]');
        if (textGroup && item.dataset.textGroupHeader) {
            e.preventDefault();
            showTextGroupContextMenu(e, item.dataset.textGroupHeader);
            return;
        }

        if (item.dataset.pathId) {
            e.preventDefault();
            showContextMenu(e, item.dataset.pathId);
        }
    });

    sidebar.addEventListener('dblclick', function (e) {
        const item = e.target.closest('#tool-paths-section .sidebar-item[data-path-id]');
        if (!item) return;
        const pathId = item.dataset.pathId;
        const toolpath = toolpaths.find(tp => tp.id === pathId);
        if (toolpath) showToolpathPropertiesEditor(toolpath);
    });
}

function setupSidebarTabHandlers() {
    const drawToolsTab = document.getElementById('draw-tools-tab');
    const operationsTab = document.getElementById('operations-tab');

    drawToolsTab.addEventListener('shown.bs.tab', function () {
        autoCloseToolProperties('tab switch to Draw Tools');
        hideBottomPanel();
        const canvas2DView = document.getElementById('2d-view');
        if (canvas2DView && canvas2DView.classList.contains('active')) {
            const overlay2D = document.getElementById('simulation-overlay-2d');
            if (overlay2D) overlay2D.classList.add('d-none');
        }
    });

    operationsTab.addEventListener('shown.bs.tab', function () {
        autoCloseToolProperties('tab switch to Operations');
        showBottomPanel();
        const canvas2DView = document.getElementById('2d-view');
        if (canvas2DView && canvas2DView.classList.contains('active')) {
            const overlay2D = document.getElementById('simulation-overlay-2d');
            if (overlay2D) overlay2D.classList.remove('d-none');
        }
    });

    // Initialize panel visibility based on current active tab
    const activeTab = document.querySelector('#sidebar-tabs .nav-link.active');
    if (activeTab && activeTab.id === 'operations-tab') {
        showBottomPanel();
        const canvas2DView = document.getElementById('2d-view');
        if (canvas2DView && canvas2DView.classList.contains('active')) {
            const overlay2D = document.getElementById('simulation-overlay-2d');
            if (overlay2D) overlay2D.classList.remove('d-none');
        }
    } else {
        hideBottomPanel();
        const overlay2D = document.getElementById('simulation-overlay-2d');
        if (overlay2D) overlay2D.classList.add('d-none');
    }
}

function setupCanvasTabHandlers() {
    const canvas2DTab = document.getElementById('2d-tab');
    const canvas3DTab = document.getElementById('3d-tab');
    const canvasToolsTab = document.getElementById('tools-tab');

    if (canvas2DTab) {
        canvas2DTab.addEventListener('shown.bs.tab', function () {
            if (typeof stopSimulation3D === 'function') stopSimulation3D();
            if (typeof hideGcodeViewerPanel === 'function') hideGcodeViewerPanel();

            const currentSidebarTab = document.querySelector('#sidebar-tabs .nav-link.active');
            const overlay2D = document.getElementById('simulation-overlay-2d');
            if (overlay2D) {
                if (currentSidebarTab && currentSidebarTab.id === 'draw-tools-tab') {
                    overlay2D.classList.add('d-none');
                } else {
                    overlay2D.classList.remove('d-none');
                }
            }
            const overlay3D = document.getElementById('simulation-overlay-3d');
            if (overlay3D) overlay3D.classList.add('d-none');

            requestAnimationFrame(() => {
                centerWorkpiece();
                redraw();
            });
        });
    }

    if (canvas3DTab) {
        canvas3DTab.addEventListener('shown.bs.tab', function () {
            if (typeof stopSimulation2D === 'function') stopSimulation2D();

            if (typeof gcodeView !== 'undefined' && gcodeView) {
                let gcode;
                if (window._importedGcode) {
                    gcode = window._importedGcode;
                } else if (typeof toGcode === 'function') {
                    gcode = toGcode();
                }
                if (gcode) {
                    window._cachedGcode = gcode;
                    gcodeView.populate(gcode);
                    if (typeof showGcodeViewerPanel === 'function') showGcodeViewerPanel();
                }
            }

            const overlay2D = document.getElementById('simulation-overlay-2d');
            if (overlay2D) overlay2D.classList.add('d-none');
            const overlay3D = document.getElementById('simulation-overlay-3d');
            if (overlay3D) overlay3D.classList.remove('d-none');

            if (typeof updateSimulation3DUI === 'function') updateSimulation3DUI();
            if (typeof updateSimulation3DDisplays === 'function') updateSimulation3DDisplays();
        });

        canvas3DTab.addEventListener('hidden.bs.tab', function () {
            if (typeof stopSimulation3D === 'function') stopSimulation3D();
            if (typeof cleanup3DView === 'function') cleanup3DView();
        });
    }

    if (canvasToolsTab) {
        canvasToolsTab.addEventListener('shown.bs.tab', function () {
            if (typeof stopSimulation2D === 'function') stopSimulation2D();
            if (typeof stopSimulation3D === 'function') stopSimulation3D();
            if (typeof hideGcodeViewerPanel === 'function') hideGcodeViewerPanel();

            const overlay2D = document.getElementById('simulation-overlay-2d');
            if (overlay2D) overlay2D.classList.add('d-none');
            const overlay3D = document.getElementById('simulation-overlay-3d');
            if (overlay3D) overlay3D.classList.add('d-none');
        });
    }
}

// G-code viewer panel (initializeGcodeView, show/hideGcodeViewerPanel,
// gcodeView, previousActiveSidebarTab) extracted to
// js/bootstrap-layout/gcodeViewerPanel.js

// Initialize G-code profiles UI
// Properties Editor Control Functions
function showToolPropertiesEditor(operationName) {
    const toolsList = document.getElementById('draw-tools-list');
    const propertiesEditor = document.getElementById('tool-properties-editor');
    const title = document.getElementById('tool-properties-title');
    const form = document.getElementById('tool-properties-form');
    const helpContent = document.getElementById('tool-help-content');

    // Hide tools list and show properties editor
    toolsList.style.display = 'none';
    propertiesEditor.style.display = 'block';

    // Show close button in tab bar
    var closeBtn = document.getElementById('panel-close-button');
    if (closeBtn) closeBtn.style.display = 'block';

    currentOperationName = operationName;

    // Get the operation instance first (needed for icon and properties)
    const operation = window.cncController?.operationManager?.getOperation(operationName);

    // Update title with icon if available
    if (operation && operation.icon) {
        title.innerHTML = `<i data-lucide="${operation.icon}"></i> ${operationName} Tool`;
        lucide.createIcons(); // Re-render newly added Lucide icons
    } else {
        title.textContent = `${operationName} Tool`;
    }
    if (operation && typeof operation.getPropertiesHTML === 'function') {
        // Restore persisted last-used values before rendering
        if (operation.fields) {
            const saved = PropertiesManager.loadSaved(operation.name);
            if (Object.keys(saved).length > 0)
                operation.properties = { ...operation.properties, ...saved };
        }
        form.innerHTML = operation.getPropertiesHTML();

        // Add event listeners directly to input elements
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            function handleInputChange() {
                if (operation && typeof operation.updateFromProperties === 'function') {
                    const data = collectOperationProperties(operation);
                    operation.updateFromProperties(data);
                    if (operation.fields)
                        PropertiesManager.save(operation.name, data, Object.values(operation.fields));
                }
            }

            // Add both change and input events for real-time updates
            input.addEventListener('change', handleInputChange);
            if (input.type === 'text' || input.tagName === 'TEXTAREA') {
                input.addEventListener('input', handleInputChange);
            }
        });

        // Handle operation-specific buttons (e.g., Generate Tabs, Apply Smoothing)
        const buttons = form.querySelectorAll('button');
        buttons.forEach(button => {
            if (button.id === 'generateTabsBtn') {
                button.addEventListener('click', () => {
                    const data = collectOperationProperties(operation);
                    operation.updateFromProperties(data);
                    if (typeof operation.generateTabs === 'function') {
                        operation.generateTabs();
                    }
                });
            } else if (button.id === 'removeAllTabsBtn') {
                button.addEventListener('click', () => {
                    if (typeof operation.removeAllTabs === 'function') {
                        operation.removeAllTabs();
                    }
                });
            } else if (button.id === 'applySmoothBtn') {
                button.addEventListener('click', () => {
                    if (typeof operation.applySmoothingToPath === 'function') {
                        operation.applySmoothingToPath();
                    }
                });
            }
        });

        // Refresh Lucide icons after adding all HTML and handlers
        if (window.lucide) {
            window.lucide.createIcons();
        }
    } else {
        form.innerHTML = '<p class="text-muted">No properties available for this tool.</p>';
    }

    // Help content is managed by StepWiseHelpSystem when operation.start() is called
    // No need to set it here - it will be updated automatically
}

/**
 * Centralized helper to set active toolpaths
 * This ensures consistent active state management across all code paths
 */
function setActiveToolpaths(toolpathsArray) {
    // Clear all active states first
    if (window.toolpaths) {
        toolpaths.forEach(tp => tp.active = false);
    }

    // Mark specified toolpaths as active
    toolpathsArray.forEach(tp => {
        tp.active = true;
    });

    // Trigger redraw to show active highlights
    if (typeof redraw === 'function') {
        redraw();
    }

    return toolpathsArray;
}

/**
 * Get all currently active toolpaths
 * This filters the actual toolpaths array, so it's always in sync
 */
function getActiveToolpaths() {
    if (!window.toolpaths) return [];
    return toolpaths.filter(tp => tp.active === true);
}

function generateToolpathForSelection() {
    // Collect form data
    if (currentOperationName == null) return;

    const data   = window.toolPathProperties.collectFormData(currentOperationName);
    const errors = window.toolPathProperties.validateFormData(currentOperationName, data);
    if (errors.length > 0) {
        notify(errors.join(', '), 'error');
        return null;
    }

    window.toolPathProperties.saveDefaults(currentOperationName, data);

    const selectedTool = window.toolPathProperties.getToolById(data.toolId);
    if (!selectedTool) {
        notify('Selected tool not found', 'error');
        return null;
    }

    // Store current tool and temporarily replace it with the selected one
    const originalTool = window.currentTool;
    window.currentTool = {
        ...selectedTool,
        depth: data.depth,
        step: data.step,
        stepover: data.stepover,
        inside: data.inside,
        direction: data.direction,
        numLoops: data.numLoops || 1,
        overCut: data.overCut || 0
    };

    // Store the properties for later reference (to be used by pushToolPath)
    window.currentToolpathProperties = { ...data };

    // Store before toolpath count to detect ALL new toolpaths
    const beforeCount = toolpaths.length;

    // Execute the operation
    try {
        handleOperationClick(currentOperationName);
    } finally {
        // Restore original tool
        window.currentTool = originalTool;
    }

    // Find ALL newly created toolpaths (not just the last one)
    const afterCount = toolpaths.length;

    if (afterCount > beforeCount) {
        // Get all the newly created toolpaths
        const newToolpaths = toolpaths.slice(beforeCount);

        // Use centralized helper to set active state
        setActiveToolpaths(newToolpaths);

        // Clear the properties after successful generation
        window.currentToolpathProperties = null;

        return newToolpaths;
    }

    // Clear the properties even if generation failed
    window.currentToolpathProperties = null;
    redraw();
    return null;
}

/**
 * Wire depth input to auto-update the name field when name still matches the default pattern.
 */
function wireDepthToNameAutoUpdate(operationName) {
    const depthInput = document.getElementById('pm-depth') || document.getElementById('depth-input');
    const nameInput  = document.getElementById('pm-toolpathName') || document.getElementById('toolpath-name-input');
    if (!depthInput || !nameInput) return;

    // Remember the current default so we know if the user has customized the name
    let lastAutoName = nameInput.value;

    depthInput.addEventListener('input', function () {
        // Only auto-update if the name still matches the last auto-generated value
        if (nameInput.value !== lastAutoName) return;
        const depth = parseDimension(depthInput.value);
        if (depth > 0) {
            const newName = formatDimension(depth, false) + ' deep ' + operationName;
            nameInput.value = newName;
            lastAutoName = newName;
        }
    });
}

function showOperationPropertiesEditor(operationName) {
    const operationsList = document.getElementById('operations-list');
    const propertiesEditor = document.getElementById('operation-properties-editor');
    const title = document.getElementById('operation-properties-title');
    const form = document.getElementById('operation-properties-form');
    const helpContent = document.getElementById('operation-help-content');

    // Hide operations list and show properties editor
    operationsList.style.display = 'none';
    propertiesEditor.style.display = 'block';

    // Show close button in tab bar
    var closeBtn = document.getElementById('panel-close-button');
    if (closeBtn) closeBtn.style.display = 'block';

    // Update title with icon
    currentOperationName = operationName;
    const operationIcon = getOperationIcon(operationName);
    if (operationIcon) {
        title.innerHTML = `<i data-lucide="${operationIcon}"></i> ${operationName} Operation`;
        lucide.createIcons(); // Re-render newly added Lucide icons
    } else {
        title.textContent = `${operationName} Operation`;
    }

    // Check if this is a toolpath operation
    const isToolpathOperation = window.toolPathProperties?.hasOperation(operationName);

    if (isToolpathOperation) {
        form.innerHTML = window.toolPathProperties.getPropertiesHTML(operationName);

        // Store the active operation name for path selection handler
        window.activeToolpathOperation = operationName;

        // Set up the "Update Toolpath" button using the shared handler
        setupToolpathUpdateButton(operationName);

        // Auto-update name when depth changes
        wireDepthToNameAutoUpdate(operationName);
    } else {
        // Use the old behavior for drawing tool operations
        const operation = window.cncController?.operationManager?.getOperation(operationName);
        if (operation && typeof operation.getPropertiesHTML === 'function') {
            // Restore persisted last-used values before rendering
            if (operation.fields) {
                const saved = PropertiesManager.loadSaved(operation.name);
                if (Object.keys(saved).length > 0)
                    operation.properties = { ...operation.properties, ...saved };
            }
            form.innerHTML = operation.getPropertiesHTML();

            // Add event listeners directly to input elements
            const inputs = form.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                function handleInputChange() {
                    if (operation && typeof operation.updateFromProperties === 'function') {
                        const data = collectOperationProperties(operation);
                        operation.updateFromProperties(data);
                        if (operation.fields)
                            PropertiesManager.save(operation.name, data, Object.values(operation.fields));
                    }
                }

                // Add both change and input events for real-time updates
                input.addEventListener('change', handleInputChange);
            });
        } else {
            form.innerHTML = '<p class="text-muted">No properties available for this operation.</p>';
        }
    }

    // Update help content
    if (window.stepWiseHelp) {
        window.stepWiseHelp.setActiveOperation(operationName);
    }

    lucide.createIcons();
}

/**
 * Setup the Update Toolpath button handler (shared by both creation and editing flows)
 */
function updateSurfacingToolpath(operationName, activeToolpaths, selectedTool, data) {
    const originalTool = window.currentTool;
    window.currentTool = {
        ...selectedTool,
        depth: data.depth,
        stepover: data.stepover
    };
    window.currentToolpathProperties = { ...data };
    window.toolpathUpdateTargets = [...activeToolpaths];

    try {
        if (operationName === '3dProfile' && typeof window.do3dProfile === 'function') {
            window.do3dProfile();
        } else {
            doSurfacing();
        }
    } finally {
        window.currentTool = originalTool;
        window.currentToolpathProperties = null;
        window.toolpathUpdateTargets = null;
    }
}

function updateHelicalDrillToolpath(activeToolpaths, selectedTool, data) {
    for (const toolpath of activeToolpaths) {
        if (toolpath.operation !== 'HelicalDrill') continue;
        toolpath.toolpathProperties = { ...data };
        if (data.toolpathName) toolpath.label = data.toolpathName;
        toolpath.tool = {
            ...selectedTool,
            depth: data.depth,
            step: data.step
        };

        const svgPath = svgpaths.find(p => p.id === toolpath.svgId);
        if (svgPath && typeof Drill !== 'undefined') {
            const drillOp = cncController.operationManager.getOperation('Drill');
            if (drillOp) {
                const circleInfo = drillOp.detectCircle(svgPath);
                if (circleInfo) {
                    const newRadius = (selectedTool.diameter / 2) * viewScale;
                    if (circleInfo.radius <= newRadius) {
                        var circleDiaMM = (circleInfo.radius * 2 / viewScale).toFixed(2);
                        var toolDiaMM = selectedTool.diameter.toFixed(2);
                        notify('Circle diameter (' + circleDiaMM + 'mm) is smaller than tool diameter (' + toolDiaMM + 'mm). Use a smaller end mill.', 'error');
                    } else {
                        const helixPath = generateHelixPath(circleInfo, data.depth, data.step, newRadius);
                        toolpath.paths = [{ tpath: helixPath, path: helixPath }];
                    }
                }
            }
        }
    }
}

function updateDrillToolpath(activeToolpaths, selectedTool, data) {
    for (const toolpath of activeToolpaths) {
        toolpath.toolpathProperties = { ...data };
        if (data.toolpathName) toolpath.label = data.toolpathName;
        toolpath.tool = {
            ...selectedTool,
            depth: data.depth,
            step: data.step,
            stepover: data.stepover,
            inside: data.inside,
            direction: data.direction
        };

        if (selectedTool.diameter) {
            const newRadius = (selectedTool.diameter / 2) * viewScale;
            if (toolpath.paths && Array.isArray(toolpath.paths)) {
                toolpath.paths.forEach(pathObj => {
                    if (pathObj.path && Array.isArray(pathObj.path)) {
                        pathObj.path.forEach(point => {
                            if (point.r !== undefined) point.r = newRadius;
                        });
                    }
                    if (pathObj.tpath && Array.isArray(pathObj.tpath)) {
                        pathObj.tpath.forEach(point => {
                            if (point.r !== undefined) point.r = newRadius;
                        });
                    }
                });
            }
        }
    }
}

function regenerateToolpathFromSvg(operationName, activeToolpaths, selectedTool, data) {
    const svgPathsToRegenerate = [];
    for (const toolpath of activeToolpaths) {
        if (toolpath.svgIds && Array.isArray(toolpath.svgIds)) {
            toolpath.svgIds.forEach(id => {
                const svgPath = svgpaths.find(p => p.id === id);
                if (svgPath) svgPathsToRegenerate.push(svgPath);
            });
        } else {
            const svgPath = svgpaths.find(p => p.id === toolpath.svgId);
            if (svgPath) svgPathsToRegenerate.push(svgPath);
        }
    }

    if (svgPathsToRegenerate.length === 0) {
        notify('Original paths not found', 'error');
        return;
    }

    // For VCarve on text, expand selection to include all paths in the same
    // text group so hole detection works (e.g. letter "e", "o", "i").
    // Remove all existing VCarve toolpaths for the group — the regeneration
    // will create the correct number fresh (inside: one per path, center: one per outer).
    if (operationName === 'VCarve') {
        const textGroupIds = new Set();
        svgPathsToRegenerate.forEach(p => {
            if (p.textGroupId) textGroupIds.add(p.textGroupId);
        });
        if (textGroupIds.size > 0) {
            // Expand source path selection to full text group
            svgpaths.forEach(p => {
                if (p.textGroupId && textGroupIds.has(p.textGroupId) &&
                    !svgPathsToRegenerate.some(sp => sp.id === p.id)) {
                    svgPathsToRegenerate.push(p);
                }
            });

            // Remove all VCarve toolpaths linked to this text group
            const allGroupPathIds = new Set(svgPathsToRegenerate.map(p => p.id));
            for (let i = toolpaths.length - 1; i >= 0; i--) {
                const tp = toolpaths[i];
                if (tp.operation !== 'VCarve In' && tp.operation !== 'VCarve Out' && tp.operation !== 'VCarve') continue;
                const tpIds = tp.svgIds || (tp.svgId ? [tp.svgId] : []);
                if (tpIds.some(id => allGroupPathIds.has(id))) {
                    toolpaths.splice(i, 1);
                    removeToolPath(tp.id);
                }
            }
            // Clear update targets — all old toolpaths are removed, create fresh
            activeToolpaths = [];
        }
    }

    selectMgr.unselectAll();
    svgPathsToRegenerate.forEach(p => selectMgr.selectPath(p));

    const originalTool = window.currentTool;
    window.currentTool = {
        ...selectedTool,
        depth: data.depth,
        step: data.step,
        stepover: data.stepover,
        inside: data.inside,
        direction: data.direction,
        numLoops: data.numLoops || 1,
        overCut: data.overCut || 0
    };
    window.currentToolpathProperties = { ...data };
    window.toolpathUpdateTargets = [...activeToolpaths];

    try {
        handleOperationClick(operationName);
    } finally {
        window.currentTool = originalTool;
        window.currentToolpathProperties = null;
        window.toolpathUpdateTargets = null;
    }

    if (typeof refreshToolPathsDisplay === 'function') {
        refreshToolPathsDisplay();
    }

    // After VCarve mode switches, the number of toolpaths may have changed.
    // Mark all toolpaths linked to the regenerated source paths as active.
    const regenIds = new Set(svgPathsToRegenerate.map(p => p.id));
    const newActive = toolpaths.filter(tp => {
        const tpIds = tp.svgIds || (tp.svgId ? [tp.svgId] : []);
        return tpIds.some(id => regenIds.has(id));
    });
    setActiveToolpaths(newActive.length > 0 ? newActive : activeToolpaths);
}

function setupToolpathUpdateButton(operationName) {
    const updateButton = document.getElementById('update-toolpath-button');
    if (!updateButton) return;

    const newButton = updateButton.cloneNode(true);
    updateButton.parentNode.replaceChild(newButton, updateButton);

    newButton.addEventListener('click', function () {
        const activeToolpaths = getActiveToolpaths();

        if (activeToolpaths.length === 0) {
            notify('No toolpath to update. Select a path first.', 'info');
            return;
        }

        const data   = window.toolPathProperties.collectFormData(operationName);
        const errors = window.toolPathProperties.validateFormData(operationName, data);
        if (errors.length > 0) {
            notify(errors.join(', '), 'error');
            return;
        }

        window.toolPathProperties.saveDefaults(operationName, data);

        const selectedTool = window.toolPathProperties.getToolById(data.toolId);
        if (!selectedTool) {
            notify('Selected tool not found', 'error');
            return;
        }

        if (operationName === 'Surfacing' || operationName === '3dProfile') {
            updateSurfacingToolpath(operationName, activeToolpaths, selectedTool, data);
        } else if (operationName === 'Drill' && activeToolpaths.some(tp => tp.operation === 'HelicalDrill')) {
            updateHelicalDrillToolpath(activeToolpaths, selectedTool, data);
        } else if (operationName === 'Drill') {
            updateDrillToolpath(activeToolpaths, selectedTool, data);
        } else {
            regenerateToolpathFromSvg(operationName, activeToolpaths, selectedTool, data);
        }

        refreshToolPathsDisplay();
        notify(`${activeToolpaths.length} toolpath(s) updated`, 'success');
        redraw();
    });
}

/**
 * Regenerate all toolpaths linked to the given svgpath IDs.
 * Used after transforms to keep toolpaths in sync with their source paths.
 */
function regenerateToolpathsForPaths(changedPathIds) {
    if (!changedPathIds || changedPathIds.length === 0) return;

    // Find all toolpaths linked to any of the changed paths
    const affectedToolpaths = toolpaths.filter(tp => {
        if (tp.svgIds && Array.isArray(tp.svgIds)) {
            return tp.svgIds.some(id => changedPathIds.includes(id));
        }
        if (tp.svgId && changedPathIds.includes(tp.svgId)) return true;
        // For 3dProfile toolpaths without svgId links, check if any changed path is an STL bounding box
        if (tp.operation === '3dProfile' && !tp.svgId) {
            return changedPathIds.some(id => {
                const sp = svgpaths.find(p => p.id === id);
                return sp && sp.creationProperties && sp.creationProperties.stlModelId;
            });
        }
        return false;
    });

    if (affectedToolpaths.length === 0) return;

    // Save current state to restore after regeneration
    const savedSelection = selectMgr.selectedPaths().map(p => p.id);
    const originalTool = window.currentTool;
    const originalToolpathProps = window.currentToolpathProperties;

    // Save originalPath refs — unselectAll destroys them but Transform needs them
    const savedOriginalPaths = new Map();
    svgpaths.forEach(p => {
        if (p.originalPath) savedOriginalPaths.set(p.id, p.originalPath);
    });

    // Group affected toolpaths by operation + source SVG IDs so multi-output
    // operations like Inlay (which produce Socket, Profile, Cutout) are regenerated
    // together in a single call with all their update targets.
    const regenGroups = new Map();
    for (const toolpath of affectedToolpaths) {
        if (toolpath.operation === 'Drill') continue;

        if (toolpath.operation === 'HelicalDrill') {
            let sourceIds = toolpath.svgIds || (toolpath.svgId ? [toolpath.svgId] : []);
            let sourcePath = sourceIds.map(id => svgpaths.find(p => p.id === id)).filter(Boolean)[0];
            if (sourcePath && typeof Drill !== 'undefined') {
                const drillOp = new Drill();
                const circleInfo = drillOp.detectCircle(sourcePath);
                if (circleInfo) {
                    const originalTool = window.currentTool;
                    window.currentTool = { ...toolpath.tool };
                    window.currentToolpathProperties = toolpath.toolpathProperties ? { ...toolpath.toolpathProperties } : null;
                    window.toolpathUpdateTargets = [toolpath];
                    try {
                        makeHelicalHole(circleInfo, sourcePath.id);
                    } finally {
                        window.currentTool = originalTool;
                        window.currentToolpathProperties = null;
                        window.toolpathUpdateTargets = null;
                    }
                }
            }
            continue;
        }

        // Group key: operation + sorted source SVG IDs
        let sourceIds = toolpath.svgIds || (toolpath.svgId ? [toolpath.svgId] : []);
        let key = toolpath.operation + '|' + sourceIds.slice().sort().join(',');
        if (!regenGroups.has(key)) {
            regenGroups.set(key, { operation: toolpath.operation, sourceIds: sourceIds, toolpaths: [] });
        }
        regenGroups.get(key).toolpaths.push(toolpath);
    }

    for (const [key, group] of regenGroups) {
        let sourcePaths = group.sourceIds.map(id => svgpaths.find(p => p.id === id)).filter(Boolean);
        // For unlinked 3dProfile, use the changed STL bounding box path
        if (sourcePaths.length === 0 && group.operation === '3dProfile') {
            sourcePaths = changedPathIds
                .map(id => svgpaths.find(p => p.id === id))
                .filter(p => p && p.creationProperties && p.creationProperties.stlModelId);
        }
        if (sourcePaths.length === 0) continue;

        // Select source paths
        selectMgr.unselectAll();
        sourcePaths.forEach(p => selectMgr.selectPath(p));

        // Reconstruct tool from the first toolpath's stored snapshot
        const firstTp = group.toolpaths[0];
        window.currentTool = { ...firstTp.tool };
        window.currentToolpathProperties = firstTp.toolpathProperties ? { ...firstTp.toolpathProperties } : null;
        // Provide ALL toolpaths in the group as update targets so each pushToolPath
        // call updates one in-place instead of creating duplicates
        window.toolpathUpdateTargets = [...group.toolpaths];

        // Normalize operation names (e.g. 'VCarve In'/'VCarve Out' -> 'VCarve')
        let opName = group.operation;
        if (opName === 'VCarve In' || opName === 'VCarve Out') opName = 'VCarve';

        try {
            handleOperationClick(opName);
        } finally {
            window.toolpathUpdateTargets = null;
            window.currentToolpathProperties = null;
        }
    }

    // Restore original state
    window.currentTool = originalTool;
    window.currentToolpathProperties = originalToolpathProps;
    selectMgr.unselectAll();
    savedSelection.forEach(id => {
        const p = svgpaths.find(sp => sp.id === id);
        if (p) selectMgr.selectPath(p);
    });

    // Restore originalPath refs for Transform tool continuity
    savedOriginalPaths.forEach((origPath, id) => {
        const p = svgpaths.find(sp => sp.id === id);
        if (p) p.originalPath = origPath;
    });
}

/**
 * Show toolpath properties editor for editing an existing toolpath
 */
function showToolpathPropertiesEditor(toolpath) {
    // Use centralized helper to set active state
    setActiveToolpaths([toolpath]);

    // Auto-select the source svgpaths linked to this toolpath
    const sourceIds = toolpath.svgIds || (toolpath.svgId ? [toolpath.svgId] : []);
    if (sourceIds.length > 0) {
        selectMgr.unselectAll();
        sourceIds.forEach(id => {
            const sp = svgpaths.find(p => p.id === id);
            if (sp) selectMgr.selectPath(sp);
        });
        redraw();
    }

    // Switch to operations tab
    const operationsTab = document.getElementById('operations-tab');
    const operationsPane = document.getElementById('operations');

    document.querySelectorAll('#sidebar-tabs .nav-link').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('#sidebar-tabs ~ .sidebar-tab-content .tab-pane').forEach(pane => pane.classList.remove('show', 'active'));

    operationsTab.classList.add('active');
    operationsPane.classList.add('show', 'active');

    // Show the operation properties editor
    const operationsList = document.getElementById('operations-list');
    const propertiesEditor = document.getElementById('operation-properties-editor');
    const title = document.getElementById('operation-properties-title');
    const form = document.getElementById('operation-properties-form');

    operationsList.style.display = 'none';
    propertiesEditor.style.display = 'block';

    // Show close button in tab bar
    var closeBtn = document.getElementById('panel-close-button');
    if (closeBtn) closeBtn.style.display = 'block';

    // Map HelicalDrill to Drill for properties panel
    const propsOperation = toolpath.operation === 'HelicalDrill' ? 'Drill' : toolpath.operation;
    currentOperationName = propsOperation;
    // Update title
    title.textContent = `Edit ${toolpath.operation === 'HelicalDrill' ? 'Helical Drill' : toolpath.operation} Toolpath`;

    // Generate properties HTML with existing values
    if (window.toolPathProperties?.hasOperation(propsOperation)) {
        // Build properties from the toolpath's own stored data
        let properties = toolpath.toolpathProperties ? { ...toolpath.toolpathProperties } : {
            toolId: toolpath.tool.recid,
            depth: toolpath.tool.depth,
            step: toolpath.tool.step,
            stepover: toolpath.tool.stepover
        };
        // Fill in any missing fields from the tool object
        if (properties.inside === undefined && toolpath.tool.inside) properties.inside = toolpath.tool.inside;
        if (properties.direction === undefined && toolpath.tool.direction) properties.direction = toolpath.tool.direction;
        if (properties.numLoops === undefined && toolpath.tool.numLoops) properties.numLoops = toolpath.tool.numLoops;
        if (properties.overCut === undefined && toolpath.tool.overCut !== undefined) properties.overCut = toolpath.tool.overCut;
        if (properties.angle === undefined && toolpath.tool.angle !== undefined) properties.angle = toolpath.tool.angle;
        if (toolpath.label) properties.toolpathName = toolpath.label;

        form.innerHTML = window.toolPathProperties.getPropertiesHTML(propsOperation, properties);

        // Set up the "Update Toolpath" button using the shared handler
        setupToolpathUpdateButton(propsOperation);

        // Auto-update name when depth changes
        wireDepthToNameAutoUpdate(propsOperation);

        // Update help content
        if (window.stepWiseHelp) {
            window.stepWiseHelp.setActiveOperation(propsOperation);
        }

        lucide.createIcons();
    } else {
        form.innerHTML = '<p class="text-muted">This toolpath cannot be edited.</p>';
    }
}

// Auto-close tool properties when context switches
function autoCloseToolProperties(reason) {
    const toolPropertiesEditor = document.getElementById('tool-properties-editor');
    const operationPropertiesEditor = document.getElementById('operation-properties-editor');

    const isToolEditorOpen = toolPropertiesEditor && toolPropertiesEditor.style.display !== 'none' && toolPropertiesEditor.style.display !== '';
    const isOperationEditorOpen = operationPropertiesEditor && operationPropertiesEditor.style.display !== 'none' && operationPropertiesEditor.style.display !== '';

    if (isToolEditorOpen || isOperationEditorOpen) {
        showToolsList();
    }
}

function showToolsList() {
    currentOperationName = null;
    // Hide close button in tab bar
    var closeBtn = document.getElementById('panel-close-button');
    if (closeBtn) closeBtn.style.display = 'none';
    const activeTab = document.querySelector('#sidebar-tabs .nav-link.active');
    const form = document.getElementById('tool-properties-form');
    form.innerHTML = "";
    if (activeTab && activeTab.id === 'draw-tools-tab') {
        const toolsList = document.getElementById('draw-tools-list');
        const propertiesEditor = document.getElementById('tool-properties-editor');

        toolsList.style.display = 'block';
        propertiesEditor.style.setProperty('display', 'none', 'important');
    } else if (activeTab && activeTab.id === 'operations-tab') {
        const operationsList = document.getElementById('operations-list');
        const propertiesEditor = document.getElementById('operation-properties-editor');

        operationsList.style.display = 'block';
        propertiesEditor.style.setProperty('display', 'none', 'important');
    }

    selectMgr.unselectAll();
    if (window.toolpaths) {
        toolpaths.forEach(tp => tp.active = false);
    }


    // Return to Select mode
    if (window.cncController) {
        window.cncController.setMode('Select');
        handleOperationClick('Select');
    }
}


// Path Properties Editor for editing existing paths
function showPathPropertiesEditor(path) {
    const toolsList = document.getElementById('draw-tools-list');
    const propertiesEditor = document.getElementById('tool-properties-editor');
    const title = document.getElementById('tool-properties-title');
    const form = document.getElementById('tool-properties-form');
    const helpContent = document.getElementById('tool-help-content');

    // Hide tools list and show properties editor
    toolsList.style.display = 'none';
    propertiesEditor.style.display = 'flex';
    propertiesEditor.style.flexDirection = 'column';

    // Show close button in tab bar
    var closeBtn = document.getElementById('panel-close-button');
    if (closeBtn) closeBtn.style.display = 'block';

    // Update title
    currentOperationName = path.creationTool;
    title.textContent = `Edit ${path.creationTool} - ${path.name}`;

    // Get properties HTML from the operation
    let propertiesHTML = '';
    const operation = window.cncController?.operationManager?.getOperation(path.creationTool);



    // Now get the properties HTML (works for both edit and creation modes)
    if (operation && typeof operation.getPropertiesHTML === 'function') {
        if (operation && typeof operation.setEditPath === 'function') {
            operation.setEditPath(path);
            //operation.onPropertiesChanged(path.creationProperties.properties); // Ensure properties are synced
        }
        propertiesHTML = operation.getPropertiesHTML(path);
        form.innerHTML = propertiesHTML;
        
        if (operation && typeof operation.update === 'function') {
            operation.update(path);
        }
        // Set the edit context before getting properties HTML

    } else {
        // Fallback for operations without properties
        propertiesHTML = '<p class="text-muted">No editable properties available for this path.</p>';
    }




    // Add event listeners directly to input elements for path editing
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        function handlePathEditChange() {
            updateExistingPath(path, form);
        }

        // Add both change and input events for real-time updates
        input.addEventListener('change', handlePathEditChange);
        if (input.type === 'text' || input.tagName === 'TEXTAREA') {
            input.addEventListener('input', handlePathEditChange);
        }
    });

    // Update help content
    helpContent.innerHTML = `
        <div class="help-step">
            <div class="help-text">Editing existing ${path.creationTool.toLowerCase()}. Changes will update the path in real-time.</div>
        </div>
    `;

    lucide.createIcons();
}

// Function to update an existing path with new properties
function updateExistingPath(path, form) {
    const operation = window.cncController?.operationManager?.getOperation(path.creationTool);
    const data = collectOperationProperties(operation);

    if (path.creationTool === 'Text') {
        if (operation) {
            operation.setEditPath(path);
            operation.updateFromProperties(data);
        }
    }
    else if (path.creationTool === 'Shape') {
        // For shapes, update in place
        updateShapeInPlace(path, data);
    }


    redraw();
}

function updateShapeInPlace(path, data) {
    const operation = window.cncController?.operationManager?.getOperation(path.creationTool);
    operation.setEditPath(path);
    operation.onPropertiesChanged(data);
}




// Tool panel creation
// Create 2D simulation controls in overlay
function createToolPanel() {
    const toolPanel = document.getElementById('tool-panel');
    toolPanel.innerHTML = `
        <div class="tool-controls">
            <div class="d-flex gap-2 mb-3 align-items-center flex-wrap">
                <button type="button" class="btn btn-outline-success btn-sm" id="add-tool">
                    <i data-lucide="plus"></i> Add Tool
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" id="delete-tool" disabled>
                    <i data-lucide="trash-2"></i> Delete
                </button>
            </div>
        </div>

        <div class="table-responsive">
            <table class="table table-sm tool-table" id="tool-table">
                <thead>
                    <tr>
                        <th><i data-lucide="wrench" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Tool type"></i> Type</th>
                        <th><i data-lucide="tag" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Tool name"></i> Name</th>
                        <th><i data-lucide="wrench" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Tool"></i> Tool</th>
                        <th><i data-lucide="diameter" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Diameter"></i>Diameter (<span id="tool-table-unit">${getUnitLabel()}</span>)</th>
                        <th><i data-lucide="hash" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Number of cutting edges"></i> Flutes</th>
                        <th><i data-lucide="gauge" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Spindle speed (RPM)"></i> RPM</th>
                        <th><i data-lucide="move" data-bs-toggle="tooltip" data-bs-placement="bottom" title="XY Feed"></i> XY Feed (<span id="tool-table-feed-unit">${getUnitLabel()}/min</span>)</th>
                        <th><i data-lucide="arrow-down" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Z Feed"></i> Z Feed (<span id="tool-table-zfeed-unit">${getUnitLabel()}/min</span>)</th>
                        <th><i data-lucide="triangle" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Angle"></i> Angle</th>
                    </tr>
                </thead>
                <tbody id="tool-table-body">
                </tbody>
            </table>
        </div>
    `;

    // Add tool control event handlers
    document.getElementById('add-tool').addEventListener('click', addTool);
    document.getElementById('delete-tool').addEventListener('click', deleteTool);

    // Render tools table
    renderToolsTable();

    // Create 2D simulation controls in overlay
    create2DSimulationControls();

    // Create 3D simulation controls in overlay
    create3DSimulationControls();
}

// Render tools table
function renderToolsTable() {
    const tbody = document.getElementById('tool-table-body');
    tbody.innerHTML = '';

    tools.forEach((tool, index) => {
        const row = createToolRow(tool, index);
        tbody.appendChild(row);
    });

    if (tools.length > 0 && !currentTool) {
        selectTool(0);
    }
}

function createToolRow(tool, index) {
    const row = document.createElement('tr');
    row.dataset.toolIndex = index;
    row.dataset.recid = tool.recid;

    // Get display units
    const useInches = getOption('Inches');

    // Convert dimensional values for display (stored in mm, display with fractions in inch mode)
    const displayDiameter = formatDimension(tool.diameter, useInches, true);

    // Feed rates - convert mm/min to in/min if needed
    const displayFeed = useInches ? Math.round(tool.feed / 25.4) : tool.feed;
    const displayZFeed = useInches ? Math.round(tool.zfeed / 25.4) : tool.zfeed;

    // Ranges
    const diameterMax = useInches ? 1 : 25;
    const diameterMin = useInches ? 0.01 : 0.1;
    const diameterStep = useInches ? 0.001 : 0.1;
    const feedMax = useInches ? 40 : 1000;
    const feedMin = useInches ? 1 : 10;
    const feedStep = useInches ? 1 : 10;

    row.innerHTML = `
        <td>
            <img src="icons/${getToolIcon(tool.bit)}" alt="${tool.bit}" width="80" height="32" data-bs-toggle="tooltip" title="${tool.bit}">
        </td>
        <td><input type="text" value="${tool.name}" data-field="name" class="form-control-plaintext"></td>
        <td>
            <select data-field="bit" class="form-select form-select-sm">
                <option value="End Mill" ${tool.bit === 'End Mill' ? 'selected' : ''}>End Mill</option>
                <option value="Ball Nose" ${tool.bit === 'Ball Nose' ? 'selected' : ''}>Ball Nose</option>
                <option value="VBit" ${tool.bit === 'VBit' ? 'selected' : ''}>VBit</option>
                <option value="Drill" ${tool.bit === 'Drill' ? 'selected' : ''}>Drill</option>
            </select>
        </td>

        <td><input type="text" value="${displayDiameter}" data-field="diameter" data-unit-type="${useInches ? 'inches' : 'mm'}" class="form-control-plaintext" placeholder="${useInches ? '1/4' : '6'}"></td>
        <td><input type="number" value="${tool.flutes || 2}" data-field="flutes" min="1" max="6" step="1" data-bs-toggle="tooltip" title="Number of cutting edges"></td>
        <td><input type="number" value="${tool.rpm || 18000}" data-field="rpm" min="1000" max="30000" step="100" data-bs-toggle="tooltip" title="Spindle speed (RPM)"></td>
        <td><input type="number" value="${displayFeed}" data-field="feed" min="${feedMin}" max="${feedMax}" step="${feedStep}" data-unit-type="${useInches ? 'inches' : 'mm'}"></td>
        <td><input type="number" value="${displayZFeed}" data-field="zfeed" min="${feedMin}" max="${feedMax}" step="${feedStep}" data-unit-type="${useInches ? 'inches' : 'mm'}"></td>
        <td><input type="number" value="${tool.angle}" data-field="angle" min="0" max="90" step="5"></td>
    `;

    // Add event handlers for row selection and editing
    row.addEventListener('click', () => selectTool(index));

    // Add change handlers for inline editing
    row.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('change', (e) => updateTool(index, e.target.dataset.field, e.target.value));
    });

    // Update tool icon when bit type changes
    row.querySelector('[data-field="bit"]').addEventListener('change', (e) => {
        const img = row.querySelector('img');
        if (img) {
            img.src = 'icons/' + getToolIcon(e.target.value);
            img.alt = e.target.value;
            img.title = e.target.value;
        }
    });

    return row;
}

function selectTool(index) {
    // Remove previous selection
    document.querySelectorAll('#tool-table-body tr.selected').forEach(row => {
        row.classList.remove('selected');
    });

    // Select new tool
    const row = document.querySelector(`#tool-table-body tr[data-tool-index="${index}"]`);
    if (row) {
        row.classList.add('selected');
        currentTool = tools[index];
        setMode(null);

        // Enable/disable buttons
        document.getElementById('delete-tool').disabled = false;

    }
}

function updateTool(index, field, value) {
    if (tools[index]) {
        // Convert numeric fields
        if (['diameter', 'feed', 'zfeed', 'angle'].includes(field)) {
            // Check if we're in inch mode
            const useInches = getOption('Inches');

            if (field === 'diameter') {
                // Diameter doesn't support percentage
                if (useInches) {
                    value = parseDimension(value, true);
                } else {
                    value = parseFloat(value);
                }
            } else {
                // For other numeric fields (feed, zfeed, angle)
                value = parseFloat(value);

                // Convert feed rates from in/min to mm/min if needed
                if (useInches && ['feed', 'zfeed'].includes(field)) {
                    value = value * 25.4;
                }
                // angle is not unit-dependent
            }
        }

        tools[index][field] = value;
        localStorage.setItem('tools', JSON.stringify(tools));

        // Refresh tool table
        renderToolsTable();

        if (currentTool && currentTool.recid === tools[index].recid) {
            currentTool = tools[index];
            toolChanged(currentTool);
            setMode(null);
        }
    }
}

function addTool() {
    const newTool = {
        recid: freeToolId(),
        color: currentTool ? currentTool.color : '9FC5E8',
        name: (currentTool ? currentTool.name : "New Tool") + " copy",
        direction: currentTool ? currentTool.direction : 'Climb',
        diameter: currentTool ? currentTool.diameter : 6,
        flutes: currentTool ? currentTool.flutes : 2,
        rpm: currentTool ? currentTool.rpm : 18000,
        feed: currentTool ? currentTool.feed : 600,
        zfeed: currentTool ? currentTool.zfeed : 200,
        angle: currentTool ? currentTool.angle : 0,
        bit: currentTool ? currentTool.bit : 'End Mill',
        depth: currentTool ? currentTool.depth : 1.5,
        step: currentTool ? currentTool.step : 1,
        stepover: currentTool ? currentTool.stepover : 25,
        depthPercent: currentTool ? currentTool.depthPercent : null,
        stepPercent: currentTool ? currentTool.stepPercent : null,
    };

    tools.push(newTool);
    localStorage.setItem('tools', JSON.stringify(tools));
    renderToolsTable();
    selectTool(tools.length - 1);
}

function deleteTool() {
    const selectedIndex = getCurrentToolIndex();

    if (selectedIndex < 0) {
        notify('Please select a tool to delete', 'error');
        return;
    }

    if (tools.length <= 1) {
        notify('Cannot delete the last tool', 'error');
        return;
    }

    const toolToDelete = tools[selectedIndex];

    // Show the confirmation modal
    const modalElement = document.getElementById('deleteToolModal');
    const modal = new bootstrap.Modal(modalElement);
    const toolNameSpan = document.getElementById('delete-tool-name');
    const confirmBtn = document.getElementById('confirm-delete-tool');

    // Set the tool name in the modal
    toolNameSpan.textContent = toolToDelete.name;

    // Handle confirm button click
    const handleConfirm = function () {
        tools.splice(selectedIndex, 1);
        localStorage.setItem('tools', JSON.stringify(tools));
        renderToolsTable();

        // Select a different tool
        if (selectedIndex >= tools.length) {
            selectTool(tools.length - 1);
        } else {
            selectTool(selectedIndex);
        }

        notify('Tool deleted successfully', 'success');

        // Clean up event listener
        confirmBtn.removeEventListener('click', handleConfirm);

        modal.hide();
    };

    confirmBtn.addEventListener('click', handleConfirm, { once: true });

    modal.show();
}



function getCurrentToolIndex() {
    const selectedRow = document.querySelector('#tool-table-body tr.selected');
    return selectedRow ? parseInt(selectedRow.dataset.toolIndex) : -1;
}



// Modal dialogs and Options panel (createModals, show*Modal, renderOptionsTable,
// saveOptions, performOptionsReset, etc.) extracted to
// js/bootstrap-layout/modals.js. notify/w2alert/w2popup remain here as
// cross-cutting utilities.

// Function to refresh tools display when loaded from project
function refreshToolsGrid() {
    // Re-render the tools table to reflect loaded tools
    renderToolsTable();

    // Update currentTool if it exists in the loaded tools
    if (tools.length > 0) {
        currentTool = tools[0]; // Default to first tool
    }
}

// Operation handlers
function handleOperationClick(operation) {
    // addUndo() will be called by individual operation functions as needed

    // Check if this is a toolpath operation managed by the properties panel
    const isToolpathOperation = window.toolPathProperties?.hasOperation(operation);

    // If it's a toolpath operation and we're NOT generating from properties,
    // then we should NOT execute the operation yet - just set the mode
    const isGeneratingFromProperties = window.currentToolpathProperties !== null &&
        window.currentToolpathProperties !== undefined;

    // Execute the appropriate operation
    switch (operation) {

        // Drawing/Interaction Tools
        case 'Select':
            doSelect(operation);
            break;
        case 'Origin':
            doOrigin();
            break;
        case 'Workpiece':
            doWorkpiece();
            break;
        case 'Pan':
            doPan();
            break;
        case 'Move':
            doMove();
            break;
        case 'Edit':
            doEditPoints();
            break;
        case 'Boolean':
            doBoolean();
            setMode("Select");
            break;
        case 'Gemini':
            doGemini();
            break;
        case 'Pen':
            doPen();
            break;
        case 'Curve':
            doCurve();
            break;
        case 'Shape':
            doShape();
            break;
        case 'Text':
            doText();
            break;
        case 'Tabs':
            doTabEditor();
            break;
        case 'Offset':
            doOffset();
            break;
        case 'Pattern':
            doPattern();
            break;
        // Machining Operations — batch all generated toolpaths into a single undo step
        case 'Drill':
            beginUndoBatch();
            doDrill();
            endUndoBatch();
            break;

        case 'Profile':
            beginUndoBatch();
            doProfile();
            endUndoBatch();
            selectMgr.unselectAll();
            setMode("Select");
            break;
        case 'Pocket':
            beginUndoBatch();
            doPocket();
            endUndoBatch();
            selectMgr.unselectAll();
            setMode("Select");
            break;
        case 'VCarve':
            beginUndoBatch();
            doVcarve();
            endUndoBatch();
            selectMgr.unselectAll();
            setMode("Select");
            break;
        case 'Inlay':
            beginUndoBatch();
            doInlay();
            endUndoBatch();
            selectMgr.unselectAll();
            setMode("Select");
            break;
        case 'Surfacing':
            beginUndoBatch();
            doSurfacing();
            endUndoBatch();
            setMode("Select");
            break;
        case '3dProfile':
            beginUndoBatch();
            if (typeof window.do3dProfile === 'function') {
                window.do3dProfile();
            }
            endUndoBatch();
            selectMgr.unselectAll();
            setMode("Select");
            break;
        default:
            doSelect(operation);
            break;
    }

}

function handlePathClick(pathId) {
    // If a machining operation panel is open, replace selection and regenerate
    if (currentOperationName && window.toolPathProperties?.hasOperation(currentOperationName)) {
        const path = svgpaths.find(p => p.id === pathId);
        if (path) {
            selectMgr.unselectAll();
            selectMgr.selectPath(path);
            generateToolpathForSelection();
            redraw();
            return;
        }
    }

    doSelect(pathId);

    // Check if this is a toolpath
    if (pathId) {
        const toolpath = toolpaths.find(tp => tp.id === pathId);
        if (toolpath) {
            // Check if this operation has properties manager support
            // Map HelicalDrill to Drill for properties lookup
            const opForProps = toolpath.operation === 'HelicalDrill' ? 'Drill' : toolpath.operation;
            const hasPropertiesSupport = window.toolPathProperties?.hasOperation(opForProps);

            if (hasPropertiesSupport) {
                // Show toolpath properties editor
                showToolpathPropertiesEditor(toolpath);
                return;
            }
        }
    }

    // Check if this path has creation properties for editing
    const path = svgpaths.find(p => p.id === pathId);
    if (path && path.creationTool && path.creationProperties) {
        // Only show properties editor if this is a draw tool that supports editing
        if (path.creationTool === 'Text' || path.creationTool === 'Shape' || path.creationTool === 'Offset' || path.creationTool === 'Pattern' || path.creationTool === 'Curve' || path.creationTool === 'Pen') {
            // Always switch to Draw Tools tab when editing from paths list
            const drawToolsTab = document.getElementById('draw-tools-tab');
            const drawToolsPane = document.getElementById('draw-tools');

            // Switch to draw tools tab
            document.querySelectorAll('#sidebar-tabs .nav-link').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('#sidebar-tabs ~ .sidebar-tab-content .tab-pane').forEach(pane => pane.classList.remove('show', 'active'));

            drawToolsTab.classList.add('active');
            drawToolsPane.classList.add('show', 'active');

            cncController.setMode(path.creationTool);

            // For Curve/Pen: enter edit mode first so getPropertiesHTML shows editing status
            if (path.creationTool === 'Curve' || path.creationTool === 'Pen') {
                const op = cncController.operationManager.getOperation(path.creationTool);
                if (op) op.enterEditMode(path);
            }

            showPathPropertiesEditor(path);

            // For Offset/Pattern: select generated paths first (red), source paths last (magenta)
            if ((path.creationTool === 'Offset' || path.creationTool === 'Pattern') && path.creationProperties.sourceIds) {
                selectMgr.unselectAll();
                // Select generated paths first (they'll draw red)
                const sourceIds = path.creationProperties.sourceIds;
                svgpaths.filter(p => p.creationTool === path.creationTool && p.creationProperties &&
                    p.creationProperties.sourceIds && arraysEqual(p.creationProperties.sourceIds, sourceIds))
                    .forEach(p => selectMgr.selectPath(p));
                // Select source paths last (they'll draw magenta)
                sourceIds.forEach(srcId => {
                    const srcPath = svgpaths.find(p => p.id === srcId);
                    if (srcPath) selectMgr.selectPath(srcPath);
                });
                redraw();
            }
        }
    }
}

// Move a toolpath one position earlier within its tool group
function moveToolpathUp(toolpathId) {
    const idx = toolpaths.findIndex(tp => tp.id === toolpathId);
    if (idx <= 0) return;
    const toolName = toolpaths[idx].tool.name;
    for (let i = idx - 1; i >= 0; i--) {
        if (toolpaths[i].tool.name === toolName) {
            [toolpaths[i], toolpaths[idx]] = [toolpaths[idx], toolpaths[i]];
            refreshToolPathsDisplay();
            redraw();
            return;
        }
    }
}

// Move a toolpath one position later within its tool group
function moveToolpathDown(toolpathId) {
    const idx = toolpaths.findIndex(tp => tp.id === toolpathId);
    if (idx < 0) return;
    const toolName = toolpaths[idx].tool.name;
    for (let i = idx + 1; i < toolpaths.length; i++) {
        if (toolpaths[i].tool.name === toolName) {
            [toolpaths[i], toolpaths[idx]] = [toolpaths[idx], toolpaths[i]];
            refreshToolPathsDisplay();
            redraw();
            return;
        }
    }
}

// Swap two tool groups in the toolpaths array
function swapToolGroups(nameA, nameB) {
    const groupA = toolpaths.filter(tp => tp.tool.name === nameA);
    const groupB = toolpaths.filter(tp => tp.tool.name === nameB);
    const firstAIdx = toolpaths.findIndex(tp => tp.tool.name === nameA);
    const firstBIdx = toolpaths.findIndex(tp => tp.tool.name === nameB);
    const insertAt = Math.min(firstAIdx, firstBIdx);

    // Remove all items from both groups (back-to-front to preserve indices)
    for (let i = toolpaths.length - 1; i >= 0; i--) {
        if (toolpaths[i].tool.name === nameA || toolpaths[i].tool.name === nameB) {
            toolpaths.splice(i, 1);
        }
    }

    // Re-insert with the groups swapped
    const [first, second] = firstAIdx < firstBIdx ? [groupB, groupA] : [groupA, groupB];
    toolpaths.splice(insertAt, 0, ...first, ...second);
    refreshToolPathsDisplay();
    redraw();
}

// Get the ordered list of unique tool group names (by first occurrence in array)
function getToolGroupOrder() {
    const seen = new Set();
    const order = [];
    for (const tp of toolpaths) {
        if (!seen.has(tp.tool.name)) {
            seen.add(tp.tool.name);
            order.push(tp.tool.name);
        }
    }
    return order;
}

// Inline rename for a toolpath sidebar item
function startRenameToolpath(pathId) {
    const item = document.querySelector(`#tool-paths-section [data-path-id="${pathId}"]`);
    if (!item) return;

    const toolpath = toolpaths.find(tp => tp.id === pathId);
    if (!toolpath) return;

    const currentName = toolpath.label || (toolpath.name + ' ' + toolpath.id.replace('T', ''));
    const icon = item.querySelector('i');

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.style.cssText = 'width:calc(100% - 24px);padding:0 4px;height:20px;font-size:inherit;border:1px solid #86b7fe;border-radius:3px;outline:none;background:#fff;color:#000;';

    item.innerHTML = '';
    if (icon) item.appendChild(icon);
    item.appendChild(input);
    input.focus();
    input.select();

    let committed = false;

    function commit() {
        if (committed) return;
        committed = true;
        const newName = input.value.trim();
        if (newName) toolpath.label = newName;
        refreshToolPathsDisplay();
    }

    function cancel() {
        if (committed) return;
        committed = true;
        refreshToolPathsDisplay();
    }

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
}

// Context menu for individual paths
function showContextMenu(event, pathId) {
    const isToolpath = toolpaths.some(tp => tp.id === pathId);
    const items = [];
    if (isToolpath) {
        items.push({ label: 'Move Up', icon: 'arrow-up', action: 'move-up' });
        items.push({ label: 'Move Down', icon: 'arrow-down', action: 'move-down' });
        items.push({ divider: true });
    }
    items.push({ label: 'Show', icon: 'eye', action: 'show' });
    items.push({ label: 'Hide', icon: 'eye-off', action: 'hide' });
    items.push({ divider: true });
    items.push({ label: 'Delete', icon: 'trash-2', action: 'delete', danger: true });
    createContextMenu(event, {
        items,
        data: pathId,
        onAction: function (action, pathId) {
            switch (action) {
                case 'rename':
                    startRenameToolpath(pathId);
                    break;
                case 'move-up':
                    moveToolpathUp(pathId);
                    break;
                case 'move-down':
                    moveToolpathDown(pathId);
                    break;
                case 'show':
                    setVisibility(pathId, true);
                    break;
                case 'hide':
                    setVisibility(pathId, false);
                    break;
                case 'delete':
                    doRemoveToolPath(pathId);
                    break;
            }
        }
    });
}

// Context menu for tool folders
function showToolFolderContextMenu(event, toolName) {
    createContextMenu(event, {
        items: [
            { label: 'Move Group Up', icon: 'arrow-up', action: 'move-up' },
            { label: 'Move Group Down', icon: 'arrow-down', action: 'move-down' },
            { divider: true },
            { label: 'Show All', icon: 'eye', action: 'show-all' },
            { label: 'Hide All', icon: 'eye-off', action: 'hide-all' },
            { divider: true },
            { label: 'Delete All', icon: 'trash-2', action: 'delete-all', danger: true }
        ],
        data: toolName,
        onAction: function (action, toolName) {
            switch (action) {
                case 'move-up': {
                    const order = getToolGroupOrder();
                    const idx = order.indexOf(toolName);
                    if (idx > 0) swapToolGroups(toolName, order[idx - 1]);
                    break;
                }
                case 'move-down': {
                    const order = getToolGroupOrder();
                    const idx = order.indexOf(toolName);
                    if (idx >= 0 && idx < order.length - 1) swapToolGroups(toolName, order[idx + 1]);
                    break;
                }
                case 'show-all':
                    setGroupVisibility(toolpaths, 'tool.name', toolName, true, 'toolpath(s)');
                    break;
                case 'hide-all':
                    setGroupVisibility(toolpaths, 'tool.name', toolName, false, 'toolpath(s)');
                    break;
                case 'delete-all':
                    deleteGroup({
                        collection: toolpaths,
                        filterKey: 'tool.name',
                        filterValue: toolName,
                        groupLabel: 'Tool Folder',
                        itemLabel: 'toolpath(s)',
                        onComplete: refreshToolPathsDisplay
                    });
                    break;
            }
        }
    });
}


// Context menu for SVG group folders
function showGroupContextMenu(event, groupId, filterKey, groupLabel, selectorAttr) {
    createContextMenu(event, {
        items: [
            { label: 'Show All', icon: 'eye', action: 'show-all' },
            { label: 'Hide All', icon: 'eye-off', action: 'hide-all' },
            { divider: true },
            { label: 'Delete All', icon: 'trash-2', action: 'delete-all', danger: true }
        ],
        data: groupId,
        onAction: function (action, groupId) {
            switch (action) {
                case 'show-all':
                    setGroupVisibility(svgpaths, filterKey, groupId, true, 'path(s)');
                    break;
                case 'hide-all':
                    setGroupVisibility(svgpaths, filterKey, groupId, false, 'path(s)');
                    break;
                case 'delete-all':
                    deleteGroup({
                        collection: svgpaths,
                        filterKey: filterKey,
                        filterValue: groupId,
                        groupLabel: groupLabel,
                        itemLabel: 'path(s)',
                        selectorAttr: selectorAttr
                    });
                    break;
            }
        }
    });
}

function showSvgGroupContextMenu(event, groupId) {
    showGroupContextMenu(event, groupId, 'svgGroupId', 'SVG Group', 'data-svg-group-id');
}

function showTextGroupContextMenu(event, groupId) {
    showGroupContextMenu(event, groupId, 'textGroupId', 'Text Group', 'data-text-group-id');
}


function addOrReplaceSvgPath(oldId, id, name) {
    const section = document.getElementById('svg-paths-section');

    // Check for existing item with this ID
    const existingItem = section.querySelector(`[data-path-id="${oldId}"]`);
    if (existingItem) {
        // Replace existing item
        existingItem.dataset.pathId = id;
        existingItem.innerHTML = `
            <i data-lucide="${getPathIcon(name)}"></i>${name}
        `;
    } else {
        // Create new item
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.dataset.pathId = id;
        item.innerHTML = `
            <i data-lucide="${getPathIcon(name)}"></i>${name}
        `;
        section.appendChild(item);
    }

    lucide.createIcons();
}
function showSTLContextMenu(event, stlId) {
    const model = window.stlModels ? window.stlModels.find(m => m.id === stlId) : null;
    if (!model) return;

    const items = [];
    if (model.visible) {
        items.push({ label: 'Hide', icon: 'eye-off', action: 'hide' });
    } else {
        items.push({ label: 'Show', icon: 'eye', action: 'show' });
    }
    items.push({ divider: true });
    items.push({ label: 'Delete', icon: 'trash-2', action: 'delete', danger: true });

    createContextMenu(event, {
        items,
        data: stlId,
        onAction: function(action, stlId) {
            switch (action) {
                case 'show':
                    setSTLVisibility(stlId, true);
                    break;
                case 'hide':
                    setSTLVisibility(stlId, false);
                    break;
                case 'delete':
                    deleteSTLModel(stlId);
                    break;
            }
        }
    });
}

function setSTLVisibility(stlId, visible) {
    if (typeof window.updateSTLMeshVisibility3D === 'function') {
        window.updateSTLMeshVisibility3D(stlId, visible);
    }
    const model = window.stlModels ? window.stlModels.find(m => m.id === stlId) : null;
    if (model) model.visible = visible;

    // Update sidebar item opacity
    const section = document.getElementById('stl-models-section');
    if (section) {
        const item = section.querySelector(`[data-stl-id="${stlId}"]`);
        if (item) item.style.opacity = visible ? '1' : '0.4';
    }
    redraw();
}

function deleteSTLModel(stlId) {
    if (typeof window.removeSTLMesh3D === 'function') {
        window.removeSTLMesh3D(stlId);
    }
    if (window.stlModels) {
        window.stlModels = window.stlModels.filter(m => m.id !== stlId);
    }
    redraw();
}

// Sidebar management functions (maintaining compatibility with existing code)
function addSvgPath(id, name) {
    const section = document.getElementById('svg-paths-section');
    const item = document.createElement('div');
    item.className = 'sidebar-item';
    item.dataset.pathId = id;
    const sp = svgpaths.find(p => p.id === id);
    const icon = sp ? getIconForPath(sp) : getPathIcon(name);
    item.innerHTML = `
        <i data-lucide="${icon}"></i>${name}
    `;
    section.appendChild(item);
    lucide.createIcons();
}

// Add text group to sidebar (groups all character paths together)
// Shared skeleton for all collapsible sidebar groups.
// config: { groupId, containerDataKey, headerDataKey, containerClass,
//           labelHTML, onHeaderClick(groupHeader), getItemIcon(path), paths }
function addCollapsibleGroup(config) {
    const { groupId, containerDataKey, headerDataKey, containerClass,
            labelHTML, onHeaderClick, getItemIcon, paths } = config;

    const section = document.getElementById('svg-paths-section');

    // Remove any existing group with this ID
    // Convert camelCase dataset key to hyphenated attribute name
    const attrName = 'data-' + containerDataKey.replace(/([A-Z])/g, '-$1').toLowerCase();
    const existingGroup = section.querySelector(`[${attrName}="${groupId}"]`);
    if (existingGroup) existingGroup.remove();

    // Group container
    const groupContainer = document.createElement('div');
    groupContainer.dataset[containerDataKey] = groupId;
    groupContainer.className = containerClass;

    // Header
    const groupHeader = document.createElement('div');
    groupHeader.className = 'sidebar-item fw-bold d-flex align-items-center justify-content-between';
    groupHeader.dataset[headerDataKey] = groupId;

    // Folder label
    const folderContent = document.createElement('span');
    folderContent.innerHTML = labelHTML;
    folderContent.style.flex = '1';
    folderContent.style.cursor = 'pointer';

    // Chevron toggle
    const chevronContainer = document.createElement('span');
    chevronContainer.dataset.bsToggle = 'collapse';
    chevronContainer.dataset.bsTarget = `#${groupId}`;
    chevronContainer.setAttribute('aria-expanded', 'false');
    chevronContainer.style.cursor = 'pointer';
    const chevron = document.createElement('i');
    chevron.className = 'collapse-chevron';
    chevron.dataset.lucide = 'chevron-down';
    chevron.style.minWidth = '16px';
    chevronContainer.appendChild(chevron);

    groupHeader.appendChild(folderContent);
    groupHeader.appendChild(chevronContainer);

    chevronContainer.addEventListener('click', (e) => { e.stopPropagation(); });
    folderContent.addEventListener('click', () => onHeaderClick(groupHeader));

    groupContainer.appendChild(groupHeader);

    // Collapse container with path items
    const collapseContainer = document.createElement('div');
    collapseContainer.className = 'collapse';
    collapseContainer.id = groupId;

    paths.forEach(path => {
        const item = document.createElement('div');
        item.className = 'sidebar-item ms-4';
        item.dataset.pathId = path.id;
        item.innerHTML = `<i data-lucide="${getItemIcon(path)}"></i>${path.name}`;
        collapseContainer.appendChild(item);
    });

    groupContainer.appendChild(collapseContainer);
    section.appendChild(groupContainer);
    lucide.createIcons();
}

function addTextGroup(groupId, text, paths) {
    addCollapsibleGroup({
        groupId,
        containerDataKey: 'textGroupId',
        headerDataKey:    'textGroupHeader',
        containerClass:   'text-group',
        labelHTML:        `<i data-lucide="folder"></i>"${text}"`,
        getItemIcon:      () => 'type-outline',
        paths,
        onHeaderClick(groupHeader) {
            const textPaths = svgpaths.filter(p => p.textGroupId === groupId);
            if (textPaths.length === 0) return;
            selectMgr.unselectAll();
            textPaths.forEach(p => selectMgr.selectPath(p));
            document.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));
            groupHeader.classList.add('selected');
            if (textPaths[0].creationTool && textPaths[0].creationProperties) {
                showPathPropertiesEditor(textPaths[0]);
                cncController.setMode("Text");
            }
            redraw();
        }
    });
}

function addSvgGroup(groupId, groupName, paths) {
    addCollapsibleGroup({
        groupId,
        containerDataKey: 'svgGroupId',
        headerDataKey:    'svgGroupHeader',
        containerClass:   'svg-group',
        labelHTML:        `<i data-lucide="folder"></i>${groupName}`,
        getItemIcon:      path => getPathIcon(path.name),
        paths,
        onHeaderClick(groupHeader) {
            const svgPaths = svgpaths.filter(p => p.svgGroupId === groupId);
            if (svgPaths.length === 0) return;
            selectMgr.unselectAll();
            svgPaths.forEach(p => selectMgr.selectPath(p));
            document.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));
            groupHeader.classList.add('selected');
            redraw();
        }
    });
}

// Add pattern group to sidebar (groups all pattern paths together)
function addPatternGroup(groupId, groupName, icon, paths, creationTool) {
    addCollapsibleGroup({
        groupId,
        containerDataKey: 'patternGroupId',
        headerDataKey:    'patternGroupHeader',
        containerClass:   'pattern-group',
        labelHTML:        `<i data-lucide="${icon}"></i>${groupName}`,
        getItemIcon:      () => icon,
        paths,
        onHeaderClick(groupHeader) {
            const groupPaths = svgpaths.filter(p => p.patternGroupId === groupId);
            if (groupPaths.length === 0) return;
            document.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));
            groupHeader.classList.add('selected');
            const firstPath = groupPaths[0];
            if (firstPath.creationTool && firstPath.creationProperties) {
                selectMgr.unselectAll();
                groupPaths.forEach(p => selectMgr.selectPath(p));
                if (firstPath.creationProperties.sourceIds) {
                    firstPath.creationProperties.sourceIds.forEach(srcId => {
                        const srcPath = svgpaths.find(p => p.id === srcId);
                        if (srcPath) selectMgr.selectPath(srcPath);
                    });
                }
                const drawToolsTab = document.getElementById('draw-tools-tab');
                const drawToolsPane = document.getElementById('draw-tools');
                document.querySelectorAll('#sidebar-tabs .nav-link').forEach(tab => tab.classList.remove('active'));
                document.querySelectorAll('#sidebar-tabs ~ .sidebar-tab-content .tab-pane').forEach(pane => pane.classList.remove('show', 'active'));
                drawToolsTab.classList.add('active');
                drawToolsPane.classList.add('show', 'active');
                showPathPropertiesEditor(firstPath);
                cncController.setMode(creationTool);
            }
            redraw();
        }
    });
}
function addToolPath(id, name, operation, toolName) {
    // Instead of adding directly, we'll refresh the entire display in sorted order
    refreshToolPathsDisplay();
}

// Refresh the toolpaths display in array order (no auto-sorting)
function refreshToolPathsDisplay() {
    const section = document.getElementById('tool-paths-section');
    if (!section) return;

    // Clear existing display
    section.innerHTML = '';

    // Check if toolpaths exist in global scope
    if (typeof toolpaths === 'undefined' || !toolpaths || toolpaths.length === 0) {
        return;
    }

    // Group by tool name, preserving the order toolpaths appear in the array
    var toolGroups = {};
    var toolGroupOrder = [];
    toolpaths.forEach(function (toolpath) {
        var toolName = toolpath.tool.name;
        if (!toolGroups[toolName]) {
            toolGroups[toolName] = [];
            toolGroupOrder.push(toolName);
        }
        toolGroups[toolName].push(toolpath);
    });

    // Render each tool group in array order
    toolGroupOrder.forEach(function (toolName) {
        var toolGroup = document.createElement('div');
        toolGroup.className = 'ms-3';
        toolGroup.dataset.toolName = toolName;
        toolGroup.innerHTML = `
            <div class="sidebar-item fw-bold">
                <i data-lucide="folder"></i>${toolName}
            </div>
        `;

        // Add toolpaths for this tool
        toolGroups[toolName].forEach(function (toolpath) {
            var item = document.createElement('div');
            item.className = 'sidebar-item ms-4';
            item.dataset.pathId = toolpath.id;
            const displayName = toolpath.label || (toolpath.name + ' ' + toolpath.id.replace('T', ''));
            const icon = toolpath.visible === false ? 'eye-off' : getOperationIcon(toolpath.name);
            item.innerHTML = `
                <i data-lucide="${icon}"></i>${displayName}
            `;
            toolGroup.appendChild(item);
        });

        section.appendChild(toolGroup);
    });

    lucide.createIcons();
}

function removeSvgPath(id) {
    const item = document.querySelector(`#svg-paths-section [data-path-id="${id}"]`);
    if (item) {
        item.remove();

        // Check if this was part of a text group
        const path = svgpaths.find(p => p.id === id);
        if (path && path.textGroupId) {
            // Check if there are any remaining paths in this group
            const remainingPaths = svgpaths.filter(p => p.textGroupId === path.textGroupId && p.id !== id);
            if (remainingPaths.length === 0) {
                // Remove the entire group if no paths remain
                const groupContainer = document.querySelector(`[data-text-group-id="${path.textGroupId}"]`);
                if (groupContainer) groupContainer.remove();
            }
        }
    }
}

function removeToolPath(id) {
    const item = document.querySelector(`#tool-paths-section [data-path-id="${id}"]`);
    if (item) item.remove();
}

function clearSvgPaths() {
    document.getElementById('svg-paths-section').innerHTML = '';
}

function clearToolPaths() {
    document.getElementById('tool-paths-section').innerHTML = '';
}

function selectSidebarNode(id) {
    setTimeout(() => {
        const item = document.querySelector(`[data-path-id="${id}"]`);
        if (item) {
            document.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            // Only scroll if the paths list is visible (not when tool properties editor is open)
            const propertiesEditor = document.getElementById('tool-properties-editor');
            if (!propertiesEditor || propertiesEditor.style.display === 'none') {
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, 100);
}

function unselectSidebarNode(id) {
    if (id) {
        const item = document.querySelector(`[data-path-id="${id}"]`);
        if (item) item.classList.remove('selected');
    } else {
        document.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));
    }
}

// Compatibility function for operation manager
function addOperation(name, icon, tooltip) {

    if (icon != null) {
        document.getElementById('draw-tools-list').innerHTML += `
        <div class="sidebar-item" data-operation=${name} data-bs-toggle="tooltip" data-bs-placement="right" title="${tooltip}">
         <i data-lucide=${icon}></i>${name}
        </div>`
    }

}


// Helper functions
function getToolIcon(bit) {
    switch (bit) {
        case 'End Mill': return 'endmill.svg';
        case 'Ball Nose': return 'ballnose.svg';
        case 'VBit': return 'vbit.svg';
        case 'Drill': return 'drill.svg';
        default: return 'endmill.svg';
    }
}

function getIconForPath(sp) {
    if (sp.creationTool === 'STL') return 'file-box';
    if (sp.creationTool === 'Image') return 'image';
    if (sp.creationTool === 'Offset') return 'fullscreen';
    if (sp.creationTool === 'Pattern') return 'grid-3x3';
    if (sp.creationTool === 'Curve') return 'spline';
    if (sp.creationTool === 'Pen') return 'pen-tool';
    return getPathIcon(sp.name);
}

function getPathIcon(name) {
    if (name.includes('Circle')) return 'circle';
    if (name.includes('Ellipse')) return 'egg';
    if (name.includes('RoundRect')) return 'square';
    if (name.includes('Rect')) return 'rectangle-horizontal';
    if (name.includes('Line')) return 'minus';
    if (name.includes('Text')) return 'type-outline';
    if (name.includes('Poly')) return 'pentagon';
    if (name.includes('Star')) return 'star';
    if (name.includes('Belt')) return 'egg';
    if (name.includes('Heart')) return 'heart';
    if (name.includes('Sign')) return 'signpost';
    if (name.includes('Union')) return 'squares-unite';
    if (name.includes('Intersect')) return 'squares-intersect';
    if (name.includes('Subtract')) return 'squares-subtract';
    if (name.includes('Gemini')) return 'brain';
    if (name.includes('Closed')) return 'vector-square';
    return 'route';
}

function updatePathVisibilityIcon(id, visible) {
    const item = document.querySelector(`[data-path-id="${id}"]`);
    if (!item) return;

    let iconName, displayName;
    const toolpath = toolpaths.find(tp => tp.id === id);
    if (toolpath) {
        iconName = visible ? getOperationIcon(toolpath.name) : 'eye-off';
        displayName = toolpath.label || (toolpath.name + ' ' + toolpath.id.replace('T', ''));
    } else {
        const svgpath = svgpaths.find(p => p.id === id);
        if (!svgpath) return;
        iconName = visible ? getIconForPath(svgpath) : 'eye-off';
        displayName = svgpath.name;
    }

    item.innerHTML = `<i data-lucide="${iconName}"></i>${displayName}`;
    lucide.createIcons();
}

function getOperationIcon(operation) {
    switch (operation) {
        case 'Outside': return 'circle';
        case 'Inside': return 'circle-dot';
        case 'Center': return 'circle-off';
        case 'Pocket': return 'target';
        case 'VCarve In': return 'star';
        case 'VCarve Out': return 'star';
        case 'VCarve': return 'star';
        case 'Drill': return 'circle-plus';
        case 'HelicalDrill': return 'circle-plus';
        case 'Inlay': return 'inlay';
        case 'Inlay Socket': return 'inlay-socket';
        case 'Inlay Socket Profile': return 'inlay-socket';
        case 'Inlay Plug': return 'inlay-plug';
        case 'Inlay Plug Profile': return 'inlay-plug';
        case 'Inlay Plug Cutout': return 'circle';
        case 'Surfacing': return 'align-justify';
        case '3dProfile': return 'mountain';
        default: return 'circle';
    }
}

function getOption(name) {
    const option = options.find(opt => opt.option === name);
    return option ? option.value : null;
}

function setOption(name, value) {
    const option = options.find(opt => opt.option === name);
    if (option) {
        option.value = value;
    }
    else {
        options.push({ option: name, value: value, hidden: true });
    }
    // Save to localStorage to persist the change
    localStorage.setItem('options', JSON.stringify(options));
}

// Get display units ('mm' or 'inches')
function getDisplayUnits() {
    return getOption('Inches') ? 'inches' : 'mm';
}

// Get unit label for display
function getUnitLabel() {
    return getOption('Inches') ? 'in' : 'mm';
}

function freeToolId() {
    let id = 1;
    while (tools.find(tool => tool.recid === id)) {
        id++;
    }
    return id;
}

function setMode(m) {
    if (m != null) mode = m;
    const statusEl = document.getElementById('status');
    statusEl.innerHTML = `<span>Mode [${mode}]</span><span class="small version">${APP_VERSION}</span>`;
}

// Compatibility object for grid operations
window.grid = {
    status: function (text) {
        // Update status bar with tool information
        const statusEl = document.getElementById('status');
        statusEl.innerHTML = `<span>Mode [${mode}]</span><span class="small version">${APP_VERSION}</span>`;
    },
    get records() {
        return tools;
    }
};

// Toast notification system
function notify(message, type = 'error') {
    // Create toast container if it doesn't exist
    let canvas = document.getElementById('canvas');
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container position-fixed top-50 start-50 translate-middle p-3';
        toastContainer.style.zIndex = '9999';
        document.body.appendChild(toastContainer);
    }

    // Map type to Bootstrap class and icon
    var bgClass = 'primary';
    var icon = 'info';
    if (type === 'error') {
        bgClass = 'danger';
        icon = 'alert-circle';
    } else if (type === 'success') {
        bgClass = 'success';
        icon = 'check-circle';
    } else if (type === 'warning') {
        bgClass = 'warning';
        icon = 'alert-triangle';
    }

    // Create toast element
    const toastId = 'toast-' + Date.now();
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast align-items-center text-bg-${bgClass} border-0`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                <i data-lucide="${icon}"></i>
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;

    toastContainer.appendChild(toast);
    lucide.createIcons();

    // Show toast
    const bsToast = new bootstrap.Toast(toast, {
        autohide: true,
        delay: 3000
    });
    bsToast.show();

    // Clean up after toast is hidden
    toast.addEventListener('hidden.bs.toast', function () {
        toast.remove();
    });
}

// Compatibility functions for existing w2ui code
function w2alert(message, title = 'Alert') {
    notify(message, 'info');
}

function w2popup() {
    // This object provides compatibility with existing w2popup calls
    return {
        open: function (config) {
            // For now, just create a simple modal
            const modalId = 'dynamic-modal-' + Date.now();
            const modal = document.createElement('div');
            modal.innerHTML = `
                <div class="modal fade" id="${modalId}" tabindex="-1">
                    <div class="modal-dialog" style="width: ${config.width || 600}px;">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">${config.title || 'Dialog'}</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                ${config.body || ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const bsModal = new bootstrap.Modal(document.getElementById(modalId));
            bsModal.show();

            // Execute onOpen callback if provided
            if (config.onOpen) {
                const event = { complete: Promise.resolve() };
                config.onOpen(event);
            }

            // Clean up when modal is closed
            modal.addEventListener('hidden.bs.modal', function () {
                modal.remove();
            });

            return {
                close: function () {
                    bsModal.hide();
                }
            };
        },
        close: function () {
            // Close any open modals
            const openModals = document.querySelectorAll('.modal.show');
            openModals.forEach(modal => {
                bootstrap.Modal.getInstance(modal)?.hide();
            });
        }
    };
}

// Make w2popup available globally for compatibility
window.w2popup = w2popup();

// Bottom panel visibility control functions (deprecated - tool panel now in Tools tab)
function showBottomPanel() {
    // Tool panel is now in the Tools tab, no longer a separate container
}

function hideBottomPanel() {
    // Tool panel is now in the Tools tab, no longer a separate container
}

// Resize functionality
function initializeResizeHandles() {
    const sidebarResize = document.getElementById('sidebar-resize');
    const bottomResize = document.getElementById('bottom-resize');
    const sidebar = document.getElementById('sidebar');
    const toolPanelContainer = document.querySelector('.tool-panel-container');

    // Sidebar horizontal resize
    if (sidebarResize && sidebar) {
        let isResizingSidebar = false;
        let startX = 0;
        let startWidth = 0;

        sidebarResize.addEventListener('mousedown', function (e) {
            isResizingSidebar = true;
            startX = e.clientX;
            startWidth = parseInt(window.getComputedStyle(sidebar).width, 10);
            sidebarResize.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', function (e) {
            if (!isResizingSidebar) return;

            const newWidth = startWidth + (e.clientX - startX);
            const minWidth = 200;
            const maxWidth = window.innerWidth * 0.5;

            if (newWidth >= minWidth && newWidth <= maxWidth) {
                sidebar.style.width = newWidth + 'px';
            }
        });

        document.addEventListener('mouseup', function () {
            if (isResizingSidebar) {
                isResizingSidebar = false;
                sidebarResize.classList.remove('dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Update canvas center after sidebar resize
                if (typeof updateCanvasCenter === 'function') {
                    updateCanvasCenter();
                    if (typeof redraw === 'function') {
                        redraw();
                    }
                }
            }
        });
    }

    // Bottom panel resize removed - tool panel now in Tools tab
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    initializeLayout();
    initializeResizeHandles();
    newProject();
    toggleTooltips(getOption('showTooltips'));
});

function toggleTooltips(on) {
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        if (on) {
            const tip = new bootstrap.Tooltip(tooltipTriggerEl, { trigger: 'hover' });
            tooltipTriggerEl.addEventListener('click', () => tip.hide(), { passive: true });
            return tip;
        } else {
            bootstrap.Tooltip.getInstance(tooltipTriggerEl)?.dispose();
            return null;
        }
    });
}
