/**
 * Bootstrap-based UI Layout System
 * Replaces w2ui components with Bootstrap equivalents
 */

// Version number based on latest commit date
var APP_VERSION = "Ver 2026-05-04";

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

// gcodeProfiles, currentGcodeProfile and the profile management functions
// (load/save/initializeGcodeProfilesUI/populateGcodeProfileSelector/etc.)
// extracted to js/bootstrap-layout/gcodeProfiles.js
var currentOperationName = null;


// Wood species database with cutting parameters
const materialsDatabase = {
    'Softwood / MDF': {
        color: '#F5DEB3', // wheat
        chipLoad: {
            base: 0.30,
            min: 0.22,
            max: 0.38
        }
    },

    'Hardwood / Plywood': {
        color: '#DEB887', // burlywood
        chipLoad: {
            base: 0.18,
            min: 0.14,
            max: 0.24
        }
    },

    'PVC Foam': {
        color: '#E0FFFF', // light cyan
        chipLoad: {
            base: 0.40,
            min: 0.30,
            max: 0.50
        }
    },

    'POM / PMMA / PC': {
        color: '#ADD8E6', // light blue
        chipLoad: {
            base: 0.10,
            min: 0.08,
            max: 0.14
        }
    },

    'Copper / Brass': {
        color: '#FFD700', // gold
        chipLoad: {
            base: 0.07,
            min: 0.05,
            max: 0.09
        }
    }
};

function getDefaultOptions() {
    const defaultGridSize = getDefaultGridSizeMM(false);
    return [
        { recid: 1,  option: 'showGrid',           value: true,            desc: 'Show Grid',                                    hidden: true  },
        { recid: 2,  option: 'showOrigin',          value: true,            desc: 'Show Origin',                                 hidden: true  },
        { recid: 3,  option: 'Inches',              value: false,           desc: 'Display Inches',                              hidden: false },
        { recid: 4,  option: 'safeHeight',          value: 5,               desc: 'Safe Height in mm',                           hidden: false },
        { recid: 5,  option: 'tolerance',           value: 0.01,             desc: 'Tool path tolerance (mm)',                   hidden: false },
        { recid: 6,  option: 'zbacklash',           value: 0.1,             desc: 'Back lash compensation in mm',                hidden: false },
        { recid: 7,  option: 'workpieceWidth',      value: 300,             desc: 'Workpiece Width (mm)',                        hidden: true  },
        { recid: 8,  option: 'workpieceLength',     value: 200,             desc: 'Workpiece Length (mm)',                       hidden: true  },
        { recid: 9,  option: 'workpieceThickness',  value: 19,              desc: 'Workpiece Thickness (mm)',                    hidden: true  },
        { recid: 10, option: 'material',            value: 'Softwood / MDF', desc: 'Material',                                   hidden: true  },
        { recid: 11, option: 'autoFeedRate',        value: false,           desc: 'Auto Calculate Feed Rates',                   hidden: false },
        { recid: 12, option: 'minFeedRate',         value: 100,             desc: 'Minimum Feed Rate (mm/min)',                  hidden: false },
        { recid: 13, option: 'maxFeedRate',         value: 2000,            desc: 'Maximum Feed Rate (mm/min)',                  hidden: false },
        { recid: 14, option: 'originPosition',      value: 'middle-center', desc: 'Origin Position',                             hidden: true  },
        { recid: 15, option: 'gridSize',            value: defaultGridSize, desc: 'Grid Size (mm)',                              hidden: true  },
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

    if (typeof updateCanvasUnitToggleUI === 'function') {
        updateCanvasUnitToggleUI();
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
    if (document.getElementById('tool-table-body')) {
        renderToolsTable();
    }
}
// File input handlers
var fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.svg,.dxf,.stl,.png,.jpg,.jpeg,.gcode,.nc,.ngc,.tap';
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
            } else if (typeof window.schedule3DViewRefresh === 'function') {
                window.schedule3DViewRefresh({ preserveProgress: false, resetIfMissing: true, showLoading: true, force: true });
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

    if (ext === 'dxf') {
        var reader = new FileReader();
        reader.onload = async function (event) {
            await parseDxfContent(event.target.result, file.name);
            redraw();
        };
        reader.readAsText(file);
        fileInput.value = "";
        return;
    }

    var reader = new FileReader();
    reader.onload = async function (event) {
        await parseSvgContent(event.target.result, file.name);
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

function getPropertyInputKey(input) {
    if (!input) return null;
    if (input.name) return input.name;
    if (input.id && input.id.startsWith('pm-')) return input.id.slice(3);
    return input.id || null;
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
            changedCount++;
            if (item.id && collection === svgpaths && typeof setVisibility === 'function') {
                setVisibility(item.id, visible, { suppressRefresh: true, suppressRedraw: true });
            } else {
                item.visible = visible;
                if (item.id) updatePathVisibilityIcon(item.id, visible);
            }
        }
    });

    if (changedCount > 0) {
        if (collection === svgpaths && typeof updatePathVisibilityIcon === 'function') {
            updatePathVisibilityIcon(filterValue, visible);
        }
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
    cncController.operationManager.addOperations();
    ensureMachiningOperationsInSidebar();
    createCanvasSidePanels();
    createModals();
    initializeGcodeView();
    lucide.createIcons();
    updateSnapButton();
}

// Toolbar creation
function createToolbar() {
    const toolbar = document.getElementById('toolbar');
    toolbar.innerHTML = `
        <div class="app-menu-bar w-100" role="menubar" aria-label="Application menu">
            <div class="dropdown app-menu-group">
                <button type="button" class="btn app-menu-trigger dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                    File
                </button>
                <div class="dropdown-menu app-menu-dropdown">
                    <button type="button" class="dropdown-item app-menu-item" data-action="new" title="New Project">
                        <i data-lucide="file-plus"></i>
                        <span>New</span>
                    </button>
                    <button type="button" class="dropdown-item app-menu-item" data-action="open" title="Open Project">
                        <i data-lucide="folder-open"></i>
                        <span>Open</span>
                    </button>
                    <button type="button" class="dropdown-item app-menu-item" data-action="save" title="Save Project">
                        <i data-lucide="save"></i>
                        <span>Save</span>
                    </button>
                    <button type="button" class="dropdown-item app-menu-item" data-action="import" title="Import SVG, STL, G-code, or image files">
                        <i data-lucide="import"></i>
                        <span>Import</span>
                    </button>
                    <div class="dropdown-divider"></div>
                    <button type="button" class="dropdown-item app-menu-item" data-action="gcode" title="Save G-code">
                        <i data-lucide="file-cog"></i>
                        <span>Export G-code</span>
                    </button>
                </div>
            </div>
            <div class="dropdown app-menu-group">
                <button type="button" class="btn app-menu-trigger dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                    Edit
                </button>
                <div class="dropdown-menu app-menu-dropdown">
                    <button type="button" class="dropdown-item app-menu-item" data-action="undo" title="Undo last action (Ctrl/Cmd+Z)">
                        <i data-lucide="undo-2"></i>
                        <span>Undo</span>
                        <span class="app-menu-shortcut">Ctrl/Cmd+Z</span>
                    </button>
                    <button type="button" class="dropdown-item app-menu-item" data-action="redo" title="Redo last action (Ctrl/Cmd+Y)">
                        <i data-lucide="redo-2"></i>
                        <span>Redo</span>
                        <span class="app-menu-shortcut">Ctrl/Cmd+Y</span>
                    </button>
                </div>
            </div>
            <div class="dropdown app-menu-group">
                <button type="button" class="btn app-menu-trigger dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                    Project
                </button>
                <div class="dropdown-menu app-menu-dropdown">
                    <button type="button" class="dropdown-item app-menu-item" data-action="project-tools" title="Open Tools">
                        <i data-lucide="wrench"></i>
                        <span>Tools</span>
                    </button>
                    <button type="button" class="dropdown-item app-menu-item" data-action="project-workpiece" title="Open Workpiece">
                        <i data-lucide="package"></i>
                        <span>Workpiece</span>
                    </button>
                    <button type="button" class="dropdown-item app-menu-item" data-action="project-grbl" title="Open GRBL">
                        <i data-lucide="cpu"></i>
                        <span>GRBL</span>
                    </button>
                    <button type="button" class="dropdown-item app-menu-item" data-action="project-cut-settings" title="Open Cut Settings">
                        <i data-lucide="scissors"></i>
                        <span>Cut Settings</span>
                    </button>
                </div>
            </div>
            <div class="dropdown app-menu-group">
                <button type="button" class="btn app-menu-trigger dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
                    View
                </button>
                <div class="dropdown-menu app-menu-dropdown">
                    <button type="button" id="snap-toggle-btn" class="dropdown-item app-menu-item" data-action="snap" title="Snap to Grid (S)">
                        <svg id="snap-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6c757d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;">
                            <path d="m12 15 4 4"/>
                            <path d="M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z"/>
                            <path d="m5 8 4 4"/>
                            <path id="snap-pole-left" d="M5 8 L2.352 10.648 L2.352 12.352 L4.648 14.648 L6.352 14.648 L9 12 Z" stroke="none" fill="none"/>
                            <path id="snap-pole-right" d="M12 15 L9.352 17.648 L9.352 19.352 L11.648 21.648 L13.352 21.648 L16 19 Z" stroke="none" fill="none"/>
                        </svg>
                        <span>Snap to Grid</span>
                        <span class="app-menu-shortcut">S</span>
                    </button>
                    <button type="button" class="dropdown-item app-menu-item" data-action="options" title="Options">
                        <i data-lucide="settings"></i>
                        <span>Options</span>
                    </button>
                </div>
            </div>
            <div class="app-menu-group">
                <button type="button" class="btn app-menu-trigger app-menu-item" data-action="help" title="Help">
                    <span>Help</span>
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
            case 'project-tools':
                showToolsModal();
                break;
            case 'project-workpiece':
                showWorkpieceModal();
                break;
            case 'project-grbl':
                showGrblModal();
                break;
            case 'project-cut-settings':
                showCutSettingsModal();
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
function updateSidebarCompactMode() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    sidebar.classList.add('is-icon-only');
    sidebar.classList.remove('is-tabs-icon-only');
    sidebar.style.width = '86px';

}

function createSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML = `
        <!-- Tab Navigation (fixed at top) -->
        <nav class="nav nav-tabs border-bottom flex-shrink-0" id="sidebar-tabs" role="tablist">
            <button class="nav-link active" id="draw-tools-tab" data-bs-toggle="tab" data-bs-target="#draw-tools" type="button" role="tab" title="Draw Tools" aria-label="Draw Tools">
                <i data-lucide="drafting-compass"></i><span>Draw Tools</span>
            </button>
        </nav>

        <!-- Tab Content (scrollable) -->
        <div class="sidebar-tab-content" id="sidebar-content" style="flex: 1; min-height: 0; overflow-y: auto;">
            <!-- Draw Tools Tab -->
            <div class="tab-pane fade show active h-100" id="draw-tools" role="tabpanel">
                <div id="draw-tools-list" class="p-3">
                    <!-- Draw Tools will be added dynamically -->
                </div>

                <!-- Operation Properties Editor (rendered inside floating popup) -->
                <div id="operation-properties-editor" class="floating-properties-content p-3" style="display: none;">
                    <!-- Operation properties form will be injected here -->
                    <div id="operation-properties-form"></div>
                </div>

                <!-- Tool Properties Editor (rendered inside floating popup) -->
                <div id="tool-properties-editor" class="floating-properties-content p-3" style="display: none;">
                    <!-- Properties form will be injected here -->
                    <div id="tool-properties-form"></div>
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
    updateSidebarCompactMode();
}

function getToolpathSourceIds(toolpath) {
    if (Array.isArray(toolpath?.svgIds) && toolpath.svgIds.length > 0) {
        return toolpath.svgIds.slice();
    }

    return toolpath?.svgId ? [toolpath.svgId] : [];
}

function buildLinkedToolpathName(toolpath) {
    if (!toolpath) return '';

    const sourceIds = getToolpathSourceIds(toolpath);
    if (sourceIds.length === 0) return '';

    const sourcePaths = sourceIds
        .map(id => svgpaths.find(path => path.id === id))
        .filter(Boolean);

    if (sourcePaths.length === 0) return '';

    const sourceNames = Array.from(new Set(sourcePaths.map(path => path.name).filter(Boolean)));
    if (sourceNames.length === 0) return '';

    if (sourceNames.length === 1) {
        return sourceNames[0] + ' ' + toolpath.operation;
    }

    return sourceNames[0] + ' +' + (sourceNames.length - 1) + ' ' + toolpath.operation;
}

function getToolpathDisplayName(toolpath) {
    if (!toolpath) return '';
    const baseName = toolpath.label || buildLinkedToolpathName(toolpath) || `${toolpath.name} ${toolpath.id.replace('T', '')}`;
    return toolpath.pending ? `${baseName} (pending)` : baseName;
}

function getToolpathDepthLabel(toolpath) {
    const depth = toolpath?.toolpathProperties?.depth ?? toolpath?.tool?.depth;
    if (typeof depth !== 'number' || !isFinite(depth)) return '';
    if (depth <= 0) return '';
    return formatDimension(depth, false);
}

function getToolpathPositionMeta(toolpath) {
    if (!toolpath || !Array.isArray(toolpaths) || toolpaths.length === 0) return '';
    const index = toolpaths.findIndex(tp => tp.id === toolpath.id);
    if (index < 0) return '';
    return `${index + 1}/${toolpaths.length}`;
}

function getObjectTypeLabel(path) {
    if (!path) return 'Path';
    if (path.creationTool === 'Text' || path.textGroupId) return 'Text';
    if (path.creationTool === 'STL') return 'STL';
    if (path.creationTool === 'Image') return 'Image';
    if (path.creationTool === 'Pattern') return 'Pattern';
    if (path.creationTool === 'Offset') return 'Offset';
    if (path.creationTool === 'Curve') return 'Curve';
    if (path.creationTool === 'Pen') return 'Pen';
    if (path.svgGroupId) return 'Imported SVG';
    return 'Shape';
}

function renderSidebarLeafItem(config) {
    const {
        id,
        icon,
        title,
        meta,
        leadingMeta,
        visible,
        itemClass = '',
        dataset = {},
        secondaryMeta = [],
        pending = false
    } = config;

    const item = document.createElement('div');
    item.className = `sidebar-item sidebar-tree-leaf ${itemClass}`.trim();
    if (id) item.dataset.pathId = id;

    Object.entries(dataset).forEach(([key, value]) => {
        if (value !== undefined && value !== null) item.dataset[key] = value;
    });

    if (visible === false) item.classList.add('is-hidden');

    const metaParts = [];
    if (leadingMeta) metaParts.push(`<span class="sidebar-item-meta-index">${leadingMeta}</span>`);
    if (meta) metaParts.push(`<span class="sidebar-item-meta-tag">${meta}</span>`);
    secondaryMeta.filter(Boolean).forEach(part => {
        metaParts.push(`<span class="sidebar-item-meta-chip">${part}</span>`);
    });

    item.title = title;
    item.setAttribute('aria-label', title);
    item.innerHTML = `
        ${pending ? '<span class="sidebar-item-spinner" aria-hidden="true"></span>' : `<i data-lucide="${icon}"></i>`}
        <div class="sidebar-item-body">
            <div class="sidebar-item-title-row">
                <span class="sidebar-item-title">${title}</span>
            </div>
            ${metaParts.length > 0 ? `<div class="sidebar-item-meta">${metaParts.join('')}</div>` : ''}
        </div>
        ${id ? `
        <button type="button" class="sidebar-visibility-toggle" data-visibility-toggle="path" data-path-id="${id}" aria-label="${visible === false ? 'Show' : 'Hide'} ${title}">
            <i data-lucide="${visible === false ? 'eye-off' : 'eye'}"></i>
        </button>
        ` : ''}
    `;

    return item;
}

function renderObjectSidebarGroup(config) {
    const {
        groupId,
        path,
        title,
        headerIcon,
        headerMeta,
        headerBadges = [],
        contextData = {},
        toolpaths = []
    } = config;

    const groupContainer = document.createElement('div');
    groupContainer.className = 'sidebar-object-group';
    groupContainer.dataset.objectGroupId = groupId;
    if (path?.textGroupId) groupContainer.dataset.textGroupId = path.textGroupId;
    if (path?.svgGroupId) groupContainer.dataset.svgGroupId = path.svgGroupId;
    if (path?.patternGroupId) groupContainer.dataset.patternGroupId = path.patternGroupId;

    const header = document.createElement('div');
    header.className = 'sidebar-item sidebar-object-header d-flex align-items-start justify-content-between';
    header.dataset.objectGroupHeader = groupId;
    header.dataset.pathId = path.id;
    if (contextData.textGroupHeader) header.dataset.textGroupHeader = contextData.textGroupHeader;
    if (contextData.svgGroupHeader) header.dataset.svgGroupHeader = contextData.svgGroupHeader;
    if (contextData.patternGroupHeader) header.dataset.patternGroupHeader = contextData.patternGroupHeader;
    if (path.visible === false) header.classList.add('is-hidden');

    const headerBadgesMarkup = headerBadges.filter(Boolean).map(badge => `<span class="sidebar-item-meta-chip">${badge}</span>`).join('');
    header.title = title;
    header.setAttribute('aria-label', title);
    header.innerHTML = `
        <div class="sidebar-object-header-main d-flex align-items-start">
            <i data-lucide="${headerIcon}"></i>
            <div class="sidebar-item-body">
                <div class="sidebar-item-title-row">
                    <span class="sidebar-item-title">${title}</span>
                </div>
                <div class="sidebar-item-meta">
                    <span class="sidebar-item-meta-tag">${headerMeta}</span>
                    ${headerBadgesMarkup}
                </div>
            </div>
        </div>
        <div class="sidebar-object-actions">
            <button type="button" class="sidebar-visibility-toggle" data-visibility-toggle="group" aria-label="${path.visible === false ? 'Show' : 'Hide'} ${title}">
                <i data-lucide="${path.visible === false ? 'eye-off' : 'eye'}"></i>
            </button>
            <span class="sidebar-object-chevron" data-bs-toggle="collapse" data-bs-target="#${groupId}" aria-expanded="true">
                <i data-lucide="chevron-down" class="collapse-chevron"></i>
            </span>
        </div>
    `;

    const collapseContainer = document.createElement('div');
    collapseContainer.className = 'collapse show sidebar-object-children';
    collapseContainer.id = groupId;

    toolpaths.forEach(toolpath => {
        const secondaryMeta = [getToolpathDepthLabel(toolpath)].filter(Boolean);
        const toolpathItem = renderSidebarLeafItem({
            id: toolpath.id,
            icon: getOperationIcon(toolpath.name),
            title: getToolpathDisplayName(toolpath),
            leadingMeta: getToolpathPositionMeta(toolpath),
            meta: toolpath.operation === 'HelicalDrill' ? 'Drill' : toolpath.operation,
            secondaryMeta,
            visible: toolpath.visible,
            pending: toolpath.pending === true,
            itemClass: 'sidebar-toolpath-item ms-4',
            dataset: {
                linkedObjectId: path.id,
                sourceCount: getToolpathSourceIds(toolpath).length
            }
        });
        collapseContainer.appendChild(toolpathItem);
    });

    groupContainer.appendChild(header);
    groupContainer.appendChild(collapseContainer);
    return groupContainer;
}

function buildObjectSidebarGroups() {
    if (typeof svgpaths === 'undefined' || !svgpaths) return [];

    const grouped = [];
    const seen = new Set();

    svgpaths.forEach(path => {
        if (path.textGroupId) {
            if (seen.has(`text:${path.textGroupId}`)) return;
            seen.add(`text:${path.textGroupId}`);
            const paths = svgpaths.filter(p => p.textGroupId === path.textGroupId);
            grouped.push({
                id: `text:${path.textGroupId}`,
                kind: 'text',
                path: paths[0],
                paths,
                title: `"${(path.creationProperties && path.creationProperties.text) || path.name}"`,
                headerIcon: 'type-outline',
                headerMeta: 'Text',
                contextData: { textGroupHeader: path.textGroupId }
            });
            return;
        }

        if (path.patternGroupId) {
            if (seen.has(`pattern:${path.patternGroupId}`)) return;
            seen.add(`pattern:${path.patternGroupId}`);
            const paths = svgpaths.filter(p => p.patternGroupId === path.patternGroupId);
            grouped.push({
                id: `pattern:${path.patternGroupId}`,
                kind: 'pattern',
                path: paths[0],
                paths,
                title: paths[0]?.name || 'Pattern',
                headerIcon: 'grid-3x3',
                headerMeta: 'Pattern',
                contextData: { patternGroupHeader: path.patternGroupId }
            });
            return;
        }

        if (path.svgGroupId) {
            if (seen.has(`svg:${path.svgGroupId}`)) return;
            seen.add(`svg:${path.svgGroupId}`);
            const paths = svgpaths.filter(p => p.svgGroupId === path.svgGroupId);
            grouped.push({
                id: `svg:${path.svgGroupId}`,
                kind: 'svg',
                path: paths[0],
                paths,
                title: paths[0]?.name || 'Imported SVG',
                headerIcon: 'folder',
                headerMeta: 'Imported SVG',
                contextData: { svgGroupHeader: path.svgGroupId }
            });
            return;
        }

        grouped.push({
            id: `path:${path.id}`,
            kind: 'path',
            path,
            paths: [path],
            title: path.name,
            headerIcon: getIconForPath(path),
            headerMeta: getObjectTypeLabel(path)
        });
    });

    return grouped;
}

function buildOrphanToolpaths(toolpathIndex) {
    if (typeof toolpaths === 'undefined' || !toolpaths) return [];
    return toolpaths.filter(toolpath => !toolpathIndex.has(toolpath.id));
}

function activateSidebarObjectGroup(item) {
    if (!item) return false;

    if (item.dataset.textGroupHeader) {
        const textPaths = svgpaths.filter(p => p.textGroupId === item.dataset.textGroupHeader);
        if (textPaths.length === 0) return true;
        selectMgr.unselectAll();
        textPaths.forEach(path => selectMgr.selectPath(path));
        document.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        if (textPaths[0].creationTool && textPaths[0].creationProperties) {
            showPathPropertiesEditor(textPaths[0]);
            cncController.setMode('Text');
        }
        redraw();
        return true;
    }

    if (item.dataset.patternGroupHeader) {
        const groupPaths = svgpaths.filter(p => p.patternGroupId === item.dataset.patternGroupHeader);
        if (groupPaths.length === 0) return true;
        document.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        const firstPath = groupPaths[0];
        if (firstPath.creationTool && firstPath.creationProperties) {
            selectMgr.unselectAll();
            groupPaths.forEach(path => selectMgr.selectPath(path));
            if (firstPath.creationProperties.sourceIds) {
                firstPath.creationProperties.sourceIds.forEach(srcId => {
                    const srcPath = svgpaths.find(path => path.id === srcId);
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
            cncController.setMode('Pattern');
        }
        redraw();
        return true;
    }

    if (item.dataset.svgGroupHeader) {
        const svgGroupPaths = svgpaths.filter(p => p.svgGroupId === item.dataset.svgGroupHeader);
        if (svgGroupPaths.length === 0) return true;
        selectMgr.unselectAll();
        svgGroupPaths.forEach(path => selectMgr.selectPath(path));
        document.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        redraw();
        return true;
    }

    return false;
}

function moveToolpathRelative(toolpathId, direction) {
    const idx = toolpaths.findIndex(tp => tp.id === toolpathId);
    if (idx < 0) return false;

    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= toolpaths.length) return false;

    [toolpaths[idx], toolpaths[targetIdx]] = [toolpaths[targetIdx], toolpaths[idx]];
    refreshToolPathsDisplay();
    redraw();
    return true;
}

function syncReorderOperationsModal() {
    const modalList = document.getElementById('reorder-operations-list');
    const emptyState = document.getElementById('reorder-operations-empty');
    if (!modalList || !emptyState) return;

    modalList.replaceChildren();

    if (!Array.isArray(toolpaths) || toolpaths.length === 0) {
        emptyState.classList.remove('d-none');
        return;
    }

    emptyState.classList.add('d-none');
    const fragment = document.createDocumentFragment();

    toolpaths.forEach(toolpath => {
        const depthLabel = getToolpathDepthLabel(toolpath);
        const item = document.createElement('div');
        item.className = 'reorder-operation-item';
        item.draggable = true;
        item.dataset.pathId = toolpath.id;
        item.innerHTML = `
            <div class="reorder-operation-handle" aria-hidden="true">
                <i data-lucide="grip-vertical"></i>
            </div>
            <div class="reorder-operation-body">
                <div class="reorder-operation-title-row">
                    <span class="reorder-operation-position">${getToolpathPositionMeta(toolpath)}</span>
                    <span class="reorder-operation-title">${getToolpathDisplayName(toolpath)}</span>
                </div>
                <div class="reorder-operation-meta">
                    <span class="reorder-operation-type">${toolpath.operation === 'HelicalDrill' ? 'Drill' : toolpath.operation}</span>
                    ${toolpath.tool?.name ? `<span class="reorder-operation-chip">${toolpath.tool.name}</span>` : ''}
                    ${depthLabel ? `<span class="reorder-operation-chip">${depthLabel}</span>` : ''}
                </div>
            </div>
        `;
        fragment.appendChild(item);
    });

    modalList.appendChild(fragment);
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
}

function setupReorderOperationsModal() {
    const modalElement = document.getElementById('reorderOperationsModal');
    const modalList = document.getElementById('reorder-operations-list');
    if (!modalElement || !modalList || modalList.dataset.initialized === 'true') return;

    modalList.dataset.initialized = 'true';
    let draggedId = null;

    modalElement.addEventListener('shown.bs.modal', function () {
        syncReorderOperationsModal();
    });

    modalList.addEventListener('dragstart', function (event) {
        const item = event.target.closest('.reorder-operation-item');
        if (!item) return;
        draggedId = item.dataset.pathId;
        item.classList.add('is-dragging');
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', draggedId);
        }
    });

    modalList.addEventListener('dragend', function (event) {
        const item = event.target.closest('.reorder-operation-item');
        if (item) item.classList.remove('is-dragging');
        modalList.querySelectorAll('.reorder-operation-item.is-drop-target').forEach(node => node.classList.remove('is-drop-target'));
        draggedId = null;
    });

    modalList.addEventListener('dragover', function (event) {
        const target = event.target.closest('.reorder-operation-item');
        if (!target || !draggedId || target.dataset.pathId === draggedId) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        modalList.querySelectorAll('.reorder-operation-item.is-drop-target').forEach(node => {
            if (node !== target) node.classList.remove('is-drop-target');
        });
        target.classList.add('is-drop-target');
    });

    modalList.addEventListener('dragleave', function (event) {
        const target = event.target.closest('.reorder-operation-item');
        if (target) target.classList.remove('is-drop-target');
    });

    modalList.addEventListener('drop', function (event) {
        const target = event.target.closest('.reorder-operation-item');
        if (!target || !draggedId) return;

        event.preventDefault();
        target.classList.remove('is-drop-target');

        const fromIndex = toolpaths.findIndex(tp => tp.id === draggedId);
        const toIndex = toolpaths.findIndex(tp => tp.id === target.dataset.pathId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

        const targetRect = target.getBoundingClientRect();
        const insertAfterTarget = event.clientY > targetRect.top + (targetRect.height / 2);
        const [moved] = toolpaths.splice(fromIndex, 1);
        let insertIndex = toIndex;
        if (fromIndex < toIndex) insertIndex -= 1;
        if (insertAfterTarget) insertIndex += 1;
        toolpaths.splice(insertIndex, 0, moved);
        refreshToolPathsDisplay();
        syncReorderOperationsModal();
        redraw();
    });

    modalList.addEventListener('contextmenu', function (event) {
        const item = event.target.closest('.reorder-operation-item');
        if (!item) return;

        const pathId = item.dataset.pathId;
        const index = toolpaths.findIndex(tp => tp.id === pathId);
        const items = [];
        if (index > 0) items.push({ label: 'Move Up', icon: 'arrow-up', action: 'move-up' });
        if (index < toolpaths.length - 1) items.push({ label: 'Move Down', icon: 'arrow-down', action: 'move-down' });
        if (items.length === 0) return;

        createContextMenu(event, {
            items,
            data: pathId,
            onAction: function (action, toolpathId) {
                if (action === 'move-up') moveToolpathUp(toolpathId);
                if (action === 'move-down') moveToolpathDown(toolpathId);
                syncReorderOperationsModal();
            }
        });
    });
}

function showReorderOperationsModal() {
    const modalElement = document.getElementById('reorderOperationsModal');
    if (!modalElement) return;
    setupReorderOperationsModal();
    syncReorderOperationsModal();
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

function setupSidebarEventHandlers(sidebar) {
    sidebar.addEventListener('click', function (e) {
        const item = e.target.closest('.sidebar-item');
        const objectChevron = e.target.closest('.sidebar-object-chevron');
        const visibilityToggle = e.target.closest('.sidebar-visibility-toggle');

        if (visibilityToggle) {
            e.preventDefault();
            e.stopPropagation();
            toggleSidebarItemVisibility(visibilityToggle);
            return;
        }

        if (!item) return;
        if (objectChevron) {
            e.stopPropagation();
            return;
        }

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

        if (item.dataset.shapeToolsToggle || item.dataset.modifyToolsToggle) {
            return;
        }

        if (activateSidebarObjectGroup(item)) {
            return;
        }

        if (operation) {
            const isDrawTool = ['Select', 'Move', 'Edit', 'Shape', 'Boolean', 'Tabs', 'Offset', 'Pattern', ...(window.SHAPE_TOOL_NAMES || [])].includes(operation);

            if (item.dataset.autoCreateShape === 'true') {
                createShapeAtCanvasCenter(operation);
                return;
            }

            if (isDrawTool) {
                showToolPropertiesEditor(operation);
                handleOperationClick(operation);
            } else if (operation === 'Drill') {
                // Drill lives in the Operations panel but also activates an interactive canvas mode
                showOperationPropertiesEditor(operation);
                handleOperationClick(operation);
            } else {
                // Machining operations like Profile/Pocket use the properties panel and
                // canvas selection, so leave any interactive tool mode such as Drill first.
                cncController.setMode('Select');
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
        const item = e.target.closest('#svg-paths-section .sidebar-toolpath-item[data-path-id]');
        if (!item) return;
        const pathId = item.dataset.pathId;
        const toolpath = toolpaths.find(tp => tp.id === pathId);
        if (toolpath) showToolpathPropertiesEditor(toolpath);
    });
}

function setupSidebarTabHandlers() {
    const drawToolsTab = document.getElementById('draw-tools-tab');

    drawToolsTab.addEventListener('shown.bs.tab', function () {
        autoCloseToolProperties('tab switch to Draw Tools');
        hideBottomPanel();
        const canvas2DView = document.getElementById('2d-view');
        if (canvas2DView && canvas2DView.classList.contains('active')) {
            const overlay2D = document.getElementById('simulation-overlay-2d');
            if (overlay2D) overlay2D.classList.add('d-none');
        }
    });

    hideBottomPanel();
    const overlay2D = document.getElementById('simulation-overlay-2d');
    if (overlay2D) overlay2D.classList.add('d-none');
}

function setupCanvasTabHandlers() {
    const canvas2DTab = document.getElementById('2d-tab');
    const canvas3DTab = document.getElementById('3d-tab');
    const canvasToolsTab = document.getElementById('tools-tab');

    if (!canvas2DTab && !canvas3DTab) {
        const overlay2D = document.getElementById('simulation-overlay-2d');
        if (overlay2D) overlay2D.classList.add('d-none');
        const overlay3D = document.getElementById('simulation-overlay-3d');
        if (overlay3D) overlay3D.classList.remove('d-none');
        if (typeof update3DSimulationOverlayLayout === 'function') update3DSimulationOverlayLayout();
        if (typeof updateSimulation3DUI === 'function') updateSimulation3DUI();
        if (typeof updateSimulation3DDisplays === 'function') updateSimulation3DDisplays();
        return;
    }

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
            if (typeof update3DSimulationOverlayLayout === 'function') update3DSimulationOverlayLayout();
 
			requestAnimationFrame(() => {
				fitWorkpieceInView();
				redraw();
			});
});
    }

    if (canvas3DTab) {
        canvas3DTab.addEventListener('shown.bs.tab', function () {
            if (typeof stopSimulation2D === 'function') stopSimulation2D();
            hideFloatingPropertiesPopup();

            if (typeof gcodeView !== 'undefined' && gcodeView) {
                gcodeView.clear();
                if (typeof showGcodeViewerPanel === 'function') showGcodeViewerPanel();
            }

            const overlay2D = document.getElementById('simulation-overlay-2d');
            if (overlay2D) overlay2D.classList.add('d-none');
            const overlay3D = document.getElementById('simulation-overlay-3d');
            if (overlay3D) overlay3D.classList.remove('d-none');
            if (typeof update3DSimulationOverlayLayout === 'function') update3DSimulationOverlayLayout();
 
            if (typeof updateSimulation3DUI === 'function') updateSimulation3DUI();
            if (typeof updateSimulation3DDisplays === 'function') updateSimulation3DDisplays();
});

        canvas3DTab.addEventListener('hidden.bs.tab', function () {
            if (typeof stopSimulation3D === 'function') stopSimulation3D();
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
            if (typeof update3DSimulationOverlayLayout === 'function') update3DSimulationOverlayLayout();
        });
    }
}

// G-code viewer panel (initializeGcodeView, show/hideGcodeViewerPanel,
// gcodeView, previousActiveSidebarTab) extracted to
// js/bootstrap-layout/gcodeViewerPanel.js

// Initialize G-code profiles UI
// Properties Editor Control Functions
function getFloatingPropertiesElements() {
    return {
        popup: document.getElementById('floating-properties-popup'),
        windowEl: document.getElementById('floating-properties-window'),
        body: document.getElementById('floating-properties-body'),
        title: document.getElementById('floating-properties-popup-title'),
        subtitle: document.getElementById('floating-properties-popup-subtitle'),
        close: document.getElementById('floating-properties-close'),
        header: document.getElementById('floating-properties-header')
    };
}

function ensureFloatingPropertiesPopup() {
    const elements = getFloatingPropertiesElements();
    if (!elements.popup || !elements.windowEl || elements.popup.dataset.initialized === 'true') {
        return elements;
    }

    const popupState = {
        dragging: false,
        offsetX: 0,
        offsetY: 0
    };

    const positionPopupOnRight = () => {
        const margin = 16;
        const popupWidth = elements.windowEl.getBoundingClientRect().width || elements.windowEl.offsetWidth || 360;
        const left = Math.max(margin, window.innerWidth - popupWidth - margin);
        const top = 96;
        elements.windowEl.style.left = `${left}px`;
        elements.windowEl.style.top = `${top}px`;
    };
 
    const clampPopupPosition = () => {
        const margin = 16;
        const maxLeft = Math.max(margin, window.innerWidth - elements.windowEl.offsetWidth - margin);
        const maxTop = Math.max(margin, window.innerHeight - elements.windowEl.offsetHeight - margin);
        const left = parseFloat(elements.windowEl.style.left || elements.windowEl.offsetLeft || margin);
        const top = parseFloat(elements.windowEl.style.top || elements.windowEl.offsetTop || margin);
        elements.windowEl.style.left = `${Math.min(Math.max(left, margin), maxLeft)}px`;
        elements.windowEl.style.top = `${Math.min(Math.max(top, margin), maxTop)}px`;
    };
const stopDragging = () => {
        popupState.dragging = false;
        document.body.classList.remove('floating-properties-dragging');
    };

    const onPointerMove = (event) => {
        if (!popupState.dragging) return;
        const margin = 16;
        const maxLeft = Math.max(margin, window.innerWidth - elements.windowEl.offsetWidth - margin);
        const maxTop = Math.max(margin, window.innerHeight - elements.windowEl.offsetHeight - margin);
        const nextLeft = Math.min(Math.max(event.clientX - popupState.offsetX, margin), maxLeft);
        const nextTop = Math.min(Math.max(event.clientY - popupState.offsetY, margin), maxTop);
        elements.windowEl.style.left = `${nextLeft}px`;
        elements.windowEl.style.top = `${nextTop}px`;
    };

    elements.header.addEventListener('pointerdown', (event) => {
        if (event.target.closest('button, input, select, textarea, label, a')) {
            return;
        }
        popupState.dragging = true;
        const rect = elements.windowEl.getBoundingClientRect();
        popupState.offsetX = event.clientX - rect.left;
        popupState.offsetY = event.clientY - rect.top;
        document.body.classList.add('floating-properties-dragging');
        elements.header.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    window.addEventListener('resize', clampPopupPosition);
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (elements.popup.style.display === 'none' || getComputedStyle(elements.popup).display === 'none') return;
        elements.close?.click();
    });
 
    elements.close?.addEventListener('click', () => showToolsList());
 
    elements.popup.dataset.initialized = 'true';
    positionPopupOnRight();
    clampPopupPosition();
    return elements;
}

function extractPropertiesPanelMeta(htmlContent) {
    const temp = document.createElement('div');
    temp.innerHTML = htmlContent || '';

    const infoAlert = temp.querySelector('.alert.alert-info');
    if (!infoAlert) {
        return {
            titleHtml: 'Properties',
            subtitle: ''
        };
    }

    const infoStrong = infoAlert.querySelector('strong');
    const titleHtml = infoStrong ? infoStrong.innerHTML.trim() : 'Properties';
    const alertClone = infoAlert.cloneNode(true);
    alertClone.querySelectorAll('strong, br').forEach(node => node.remove());
    const subtitle = alertClone.textContent.trim().replace(/\s+/g, ' ');

    infoAlert.remove();

    return {
        titleHtml,
        subtitle,
        cleanedHtml: temp.innerHTML
    };
}

function syncFloatingPropertiesPopupText(meta) {
    const elements = getFloatingPropertiesElements();
    if (!elements.title) return;
 
    elements.title.innerHTML = meta?.titleHtml || 'Properties';
    if (elements.subtitle) {
        elements.subtitle.textContent = '';
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

function getFloatingPopupFooter() {
    return document.getElementById('floating-properties-footer');
}

function clearFloatingPopupFooter() {
    const footer = getFloatingPopupFooter();
    if (!footer) return;
    footer.innerHTML = '';
    footer.classList.remove('is-visible');
}

function setFloatingPopupFooterContent(content) {
    const footer = getFloatingPopupFooter();
    if (!footer) return;

    if (!content) {
        clearFloatingPopupFooter();
        return;
    }

    footer.innerHTML = content;
    footer.classList.add('is-visible');
}

function getSelectedSvgPathIds() {
    return selectMgr.selectedPaths()
        .filter(path => svgpaths.includes(path))
        .map(path => path.id);
}

function getCanvasCenterWorld() {
    const canvas = document.getElementById('canvas');
    if (!canvas) return { x: 0, y: 0 };

    return screenToWorld(canvas.width / 2, canvas.height / 2);
}

function createShapeAtCanvasCenter(shapeName) {
    const shapeOperation = window.cncController?.operationManager?.getOperation(shapeName);
    if (!shapeOperation || typeof shapeOperation.makeShape !== 'function') {
        return null;
    }

    const center = getCanvasCenterWorld();
    const createdPath = shapeOperation.makeShape(shapeName, center.x, center.y, null, null);
    if (!createdPath) return null;

    openPathEditor(createdPath);
    return createdPath;
}

function buildShapeCutPopupHTML(shapeOperation, path, operationName) {
    const toolpathProperties = window.toolPathProperties;
    const cutHtml = toolpathProperties.getPropertiesHTML(operationName, path?.toolpathProperties || null, {
        showUpdateButton: false
    });
    const cutMeta = extractPropertiesPanelMeta(cutHtml);

    return {
        html: `
            <div class="shape-cut-popup">
                <ul class="nav nav-tabs shape-cut-tabs mb-3" role="tablist">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link active" id="shape-cut-tab-shape" data-bs-toggle="tab" data-bs-target="#shape-cut-panel-shape" type="button" role="tab" aria-controls="shape-cut-panel-shape" aria-selected="true">Shape</button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" id="shape-cut-tab-cut" data-bs-toggle="tab" data-bs-target="#shape-cut-panel-cut" type="button" role="tab" aria-controls="shape-cut-panel-cut" aria-selected="false">Cut</button>
                    </li>
                </ul>
                <div class="tab-content shape-cut-tab-content">
                    <div class="tab-pane fade show active" id="shape-cut-panel-shape" role="tabpanel" aria-labelledby="shape-cut-tab-shape">
                        <div id="shape-properties-panel">
                            ${shapeOperation.renderGeometryFields(path ? shapeOperation.getPathShapeProperties(path) : null)}
                        </div>
                    </div>
                    <div class="tab-pane fade" id="shape-cut-panel-cut" role="tabpanel" aria-labelledby="shape-cut-tab-cut">
                        <div id="shape-cut-properties-panel">
                            ${cutMeta.cleanedHtml || ''}
                        </div>
                    </div>
                </div>
            </div>`,
        cutMeta
    };
}

function bindShapeCutPopup(path, shapeOperation, operationName) {
    const form = document.getElementById('tool-properties-form');
    if (!form) return;

    if (typeof shapeOperation.bindPropertiesUI === 'function') {
        const shapePanel = form.querySelector('#shape-properties-panel') || form;
        shapeOperation.bindPropertiesUI(shapePanel);
    }

    form.querySelectorAll('#shape-properties-panel input, #shape-properties-panel select, #shape-properties-panel textarea').forEach(input => {
        function handleShapeChange() {
            updateExistingPath(path, form, getPropertyInputKey(input));
        }

        input.addEventListener('change', handleShapeChange);
        if (input.type === 'text' || input.type === 'number' || input.tagName === 'TEXTAREA') {
            input.addEventListener('input', handleShapeChange);
        }
    });

    form.querySelectorAll('#shape-cut-properties-panel input, #shape-cut-properties-panel select, #shape-cut-properties-panel textarea').forEach(input => {
        function handleCutChange() {
            if (!path) return;
            const data = window.toolPathProperties.collectFormData(operationName);
            const sanitized = sanitizeToolpathProperties(data);
            path.toolpathProperties = sanitized || {};
            path.toolpathProperties.operation = data.operation || operationName;
            redraw();
            scheduleShapeMachiningToolpathSync(path, { createIfMissing: true });
        }

        input.addEventListener('change', handleCutChange);
        if (input.type === 'text' || input.type === 'number' || input.type === 'range' || input.tagName === 'TEXTAREA') {
            input.addEventListener('input', handleCutChange);
        }
    });

    redraw();
}

function setFloatingPropertiesPopupContext(context = null) {
    window.floatingPropertiesPopupContext = context;
}

function shouldCloseFloatingPropertiesPopupForDeletedItem(id) {
    const context = window.floatingPropertiesPopupContext;
    if (!context || !id) return false;

    if (context.type === 'shape') {
        return context.id === id;
    }

    if (context.type === 'toolpath') {
        if (context.id === id) return true;
        if (Array.isArray(context.svgIds) && context.svgIds.includes(id)) return true;
    }

    return false;
}

function closeFloatingPropertiesPopupIfEditingDeletedItem(id) {
    if (!shouldCloseFloatingPropertiesPopupForDeletedItem(id)) return;
    showToolsList();
}

function showFloatingPropertiesPopup(contentElement, meta = null) {
    const elements = ensureFloatingPropertiesPopup();
    if (!elements.popup || !elements.body || !contentElement) return;

    Array.from(elements.body.children).forEach(child => {
        child.classList.remove('is-active');
        child.style.display = 'none';
    });

    if (contentElement.parentElement !== elements.body) {
        elements.body.appendChild(contentElement);
    }

    syncFloatingPropertiesPopupText(meta);

    elements.popup.style.display = 'block';
    contentElement.classList.add('is-active');
    contentElement.style.display = 'block';
}

function hideFloatingPropertiesPopup() {
    const elements = getFloatingPropertiesElements();
    if (!elements.popup || !elements.body) return;

    Array.from(elements.body.children).forEach(child => {
        child.classList.remove('is-active');
        child.style.display = 'none';
    });

    elements.popup.style.display = 'none';
    clearFloatingPopupFooter();
    setFloatingPropertiesPopupContext(null);
}

function showToolPropertiesEditor(operationName) {
    const toolsList = document.getElementById('draw-tools-list');
    const propertiesEditor = document.getElementById('tool-properties-editor');
    const operationPropertiesEditor = document.getElementById('operation-properties-editor');
    const form = document.getElementById('tool-properties-form');

    clearFloatingPopupFooter();
 
    // Keep tools list visible while preparing popup content
    toolsList.style.display = 'block';
    if (operationPropertiesEditor) operationPropertiesEditor.style.display = 'none';
 
    currentOperationName = operationName;

    // Get the operation instance first (needed for icon and properties)
    const operation = window.cncController?.operationManager?.getOperation(operationName);

    document.querySelectorAll('#draw-tools-list .sidebar-item.selected').forEach(el => el.classList.remove('selected'));
    const selectedToolItem = document.querySelector(`#draw-tools-list [data-operation="${operationName}"]`);
    if (selectedToolItem) selectedToolItem.classList.add('selected');
    syncGroupedToolSelection();

    if (operation && typeof operation.getPropertiesHTML === 'function') {
        // Restore persisted last-used values before rendering
        if (operation.fields) {
            const saved = PropertiesManager.loadSaved(operation.name);
            if (Object.keys(saved).length > 0)
                operation.properties = { ...operation.properties, ...saved };
        }
        const propertiesMeta = extractPropertiesPanelMeta(operation.getPropertiesHTML());
        form.innerHTML = propertiesMeta.cleanedHtml || '';

        if (operation && typeof operation.bindPropertiesUI === 'function') {
            operation.bindPropertiesUI(form);
        }

        // Add event listeners directly to input elements
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            function handleInputChange() {
                if (operation && typeof operation.updateFromProperties === 'function') {
                    const data = collectOperationProperties(operation);
                    operation.updateFromProperties(data, { changedKey: getPropertyInputKey(input) });
                    if (operation.fields)
                        PropertiesManager.save(operation.name, data, Object.values(operation.fields));
                }
            }

            // Add both change and input events for real-time updates
            input.addEventListener('change', handleInputChange);
            if (input.type === 'text' || input.type === 'number' || input.type === 'range' || input.tagName === 'TEXTAREA') {
                input.addEventListener('input', handleInputChange);
            }
        });

        // Handle operation-specific buttons (e.g., Generate Tabs, Apply Smoothing))
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
        showFloatingPropertiesPopup(propertiesEditor, {
            titleHtml: operation && operation.icon
                ? `<i data-lucide="${operation.icon}"></i> ${propertiesMeta.titleHtml}`
                : propertiesMeta.titleHtml,
            subtitle: propertiesMeta.subtitle
        });
    } else {
        form.innerHTML = '<p class="text-muted">No properties available for this tool.</p>';
        showFloatingPropertiesPopup(propertiesEditor, {
            titleHtml: 'Properties',
            subtitle: ''
        });
    }

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

function isWholeWorkpieceOperation(operationName) {
    return operationName === 'Surfacing';
}

/**
 * Get all currently active toolpaths
 * This filters the actual toolpaths array, so it's always in sync
 */
function getActiveToolpaths() {
    if (!window.toolpaths) return [];
    return toolpaths.filter(tp => tp.active === true);
}

function isSameToolpathSource(toolpath, selectedSvgIds) {
    const toolpathSvgIds = Array.isArray(toolpath.svgIds) && toolpath.svgIds.length > 0
        ? toolpath.svgIds.slice()
        : (toolpath.svgId ? [toolpath.svgId] : []);

    if (toolpathSvgIds.length !== selectedSvgIds.length) return false;

    const normalizedToolpathIds = toolpathSvgIds.slice().sort();
    const normalizedSelectedIds = selectedSvgIds.slice().sort();

    for (let i = 0; i < normalizedToolpathIds.length; i++) {
        if (normalizedToolpathIds[i] !== normalizedSelectedIds[i]) return false;
    }

    return true;
}

function findExistingToolpathsForSelection(operationName, selectedSvgIds) {
    const normalizedOperation = operationName === 'Drill' ? 'HelicalDrill' : operationName;
	if (isWholeWorkpieceOperation(operationName)) {
		return toolpaths.filter(toolpath => {
			if (toolpath.operation !== normalizedOperation) return false;
			return getToolpathSourceIds(toolpath).length === 0;
		});
	}

	const selectedPaths = Array.isArray(selectedSvgIds)
		? selectedSvgIds.map(id => svgpaths.find(path => path.id === id)).filter(Boolean)
		: [];
	const selectionGroups = buildMachiningSelectionIdGroups(selectedPaths);

	if (selectionGroups.length === 0) {
		return [];
	}

	const groupKeys = selectionGroups.map(ids => ids.slice().sort().join(','));
	const matchedToolpaths = toolpaths.filter(toolpath => {
		if (toolpath.operation !== normalizedOperation) return false;
		const sourceIds = getToolpathSourceIds(toolpath);
		if (sourceIds.length === 0) return false;
		const toolpathKey = sourceIds.slice().sort().join(',');
		return groupKeys.includes(toolpathKey);
	});
	const matchedKeys = new Set(matchedToolpaths.map(toolpath => getToolpathSourceIds(toolpath).slice().sort().join(',')));

	for (let i = 0; i < groupKeys.length; i++) {
		if (!matchedKeys.has(groupKeys[i])) {
			return [];
		}
	}

	return matchedToolpaths;
}

const pendingShapeMachiningSyncs = new Map();

function getShapePreviewToolpaths(pathId) {
    if (!pathId || !Array.isArray(toolpaths)) {
        return [];
    }

    return toolpaths.filter(toolpath => {
        if (!toolpath || toolpath.isShapePreviewToolpath !== true) {
            return false;
        }

        const sourceIds = getToolpathSourceIds(toolpath);
        return sourceIds.length === 1 && sourceIds[0] === pathId;
    });
}

function markShapePreviewToolpaths(pathId, toolpathsToMark) {
    if (!pathId || !Array.isArray(toolpathsToMark)) {
        return;
    }

    toolpathsToMark.forEach(toolpath => {
        if (!toolpath) return;
        toolpath.isShapePreviewToolpath = true;
        toolpath.shapePreviewSourceId = pathId;
    });
}

function removeShapePreviewToolpaths(pathId) {
    if (!pathId) {
        return 0;
    }

    let removedCount = 0;
    for (let index = toolpaths.length - 1; index >= 0; index--) {
        const toolpath = toolpaths[index];
        if (!toolpath || toolpath.isShapePreviewToolpath !== true) {
            continue;
        }

        const sourceIds = getToolpathSourceIds(toolpath);
        if (sourceIds.length === 1 && sourceIds[0] === pathId) {
            toolpaths.splice(index, 1);
            removedCount++;
        }
    }

    if (removedCount > 0) {
        if (typeof refreshToolPathsDisplay === 'function') {
            refreshToolPathsDisplay();
        }
        redraw();
    }

    return removedCount;
}

function syncShapeMachiningToolpath(path, options = {}) {
    if (!path || !path.id || !path.toolpathProperties || !window.toolPathProperties) {
        return false;
    }

    const data = sanitizeToolpathProperties(path.toolpathProperties);
    if (!data) {
        return false;
    }

    if (data.operationType === 'none') {
        return removeShapePreviewToolpaths(path.id) > 0;
    }

    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('[ShapePreview] sync request', {
            pathId: path.id,
            operationType: data.operationType,
            depth: data.depth,
            tool: data.tool,
            createIfMissing: options.createIfMissing === true
        });
    }

    const descriptor = window.toolPathProperties.getOperationDescriptor('Profile', data.operationType);
    const selectedTool = window.toolPathProperties.getToolById(data.tool);
    if (!descriptor || !selectedTool) {
        return false;
    }

    const executionOperation = descriptor.executionOperation || 'Profile';
    if (executionOperation !== 'Profile' && executionOperation !== 'Pocket') {
        return false;
    }

    if (path.visible === false) {
        return false;
    }

    const previewToolpaths = getShapePreviewToolpaths(path.id);
    if (previewToolpaths.some(toolpath => toolpath.pending === true)) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('[ShapePreview] skip sync because preview generation is pending', {
                pathId: path.id,
                previewCount: previewToolpaths.length
            });
        }
        return false;
    }

    if (previewToolpaths.length === 0 && options.createIfMissing !== true) {
        if (typeof console !== 'undefined' && typeof console.debug === 'function') {
            console.debug('[ShapePreview] skip sync because no preview toolpath exists yet', {
                pathId: path.id
            });
        }
        return false;
    }

    const savedSelectionIds = selectMgr.selectedPaths().map(selectedPath => selectedPath.id);
    const originalTool = window.currentTool;
    const originalToolpathProperties = window.currentToolpathProperties;
    const originalToolpathDescriptor = window.currentToolpathDescriptor;
    const originalUpdateTargets = window.toolpathUpdateTargets;
    const beforeCount = toolpaths.length;

    selectMgr.unselectAll();
    selectMgr.selectPath(path);

    window.currentTool = {
        ...selectedTool,
        depth: data.depth,
        step: selectedTool.step,
        stepover: selectedTool.stepover,
        inside: data.inside,
        direction: data.direction,
        numLoops: 1,
        overCut: 0,
        plunge: data.plunge,
        strategy: data.strategy
    };
    window.currentToolpathProperties = data;
    window.currentToolpathDescriptor = descriptor;
    window.toolpathUpdateTargets = previewToolpaths.slice();

    try {
        if (executionOperation === 'Pocket') {
            doPocket({ silent: true });
        } else {
            doProfile({ silent: true });
        }
    } finally {
        window.currentTool = originalTool;
        window.currentToolpathProperties = originalToolpathProperties;
        window.currentToolpathDescriptor = originalToolpathDescriptor;
        window.toolpathUpdateTargets = originalUpdateTargets;

        selectMgr.unselectAll();
        savedSelectionIds.forEach(pathId => {
            const selectedPath = svgpaths.find(svgPath => svgPath.id === pathId);
            if (selectedPath) {
                selectMgr.selectPath(selectedPath);
            }
        });
    }

    const newPreviewToolpaths = toolpaths.slice(beforeCount).filter(toolpath => {
        const sourceIds = getToolpathSourceIds(toolpath);
        return sourceIds.length === 1 && sourceIds[0] === path.id;
    });
    markShapePreviewToolpaths(path.id, previewToolpaths.concat(newPreviewToolpaths));

    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        const finalPreviewToolpaths = getShapePreviewToolpaths(path.id);
        console.debug('[ShapePreview] sync result', {
            pathId: path.id,
            previewCount: finalPreviewToolpaths.length,
            operations: finalPreviewToolpaths.map(toolpath => toolpath.operation),
            pending: finalPreviewToolpaths.map(toolpath => toolpath.pending === true),
            pathCounts: finalPreviewToolpaths.map(toolpath => Array.isArray(toolpath.paths) ? toolpath.paths.length : 0)
        });
    }

    if (typeof refreshToolPathsDisplay === 'function') {
        refreshToolPathsDisplay();
    }

    return true;
}

function scheduleShapeMachiningToolpathSync(path, options = {}) {
    if (!path || !path.id) {
        return;
    }

    const existingTimeoutId = pendingShapeMachiningSyncs.get(path.id);
    if (existingTimeoutId) {
        clearTimeout(existingTimeoutId);
    }

    const delay = Number.isFinite(options.delay) ? options.delay : 120;
    const timeoutId = window.setTimeout(() => {
        pendingShapeMachiningSyncs.delete(path.id);
        const changed = syncShapeMachiningToolpath(path, options);
        if (changed) {
            refresh3DPreviewForShape(path);
        }
    }, Math.max(0, delay));

    pendingShapeMachiningSyncs.set(path.id, timeoutId);
}

function refresh3DPreviewForShape(path) {
    if (!path || path.visible === false || typeof window.schedule3DViewRefresh !== 'function') {
        return;
    }

    if (typeof window.schedulePrepared3DGcodeRefresh === 'function') {
        window.schedulePrepared3DGcodeRefresh();
    }

    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('[ShapePreview] refresh 3D preview', {
            pathId: path.id,
            linkedPreviewToolpaths: getShapePreviewToolpaths(path.id).map(toolpath => ({
                id: toolpath.id,
                operation: toolpath.operation,
                pending: toolpath.pending === true,
                segments: Array.isArray(toolpath.paths) ? toolpath.paths.length : 0
            }))
        });
    }

    window.schedule3DViewRefresh({
        preserveProgress: false,
        resetIfMissing: true,
        seekToLatestState: true
    });
}

function show3DPane() {
    const tab3D = document.getElementById('3d-tab');
    if (tab3D && typeof bootstrap !== 'undefined' && bootstrap?.Tab) {
        bootstrap.Tab.getOrCreateInstance(tab3D).show();
        return;
    }

    const overlay3D = document.getElementById('simulation-overlay-3d');
    if (overlay3D) overlay3D.classList.remove('d-none');
    if (typeof update3DSimulationOverlayLayout === 'function') update3DSimulationOverlayLayout();
    if (typeof updateSimulation3DUI === 'function') updateSimulation3DUI();
    if (typeof updateSimulation3DDisplays === 'function') updateSimulation3DDisplays();
}

window.show3DPane = show3DPane;

function generateToolpathForSelection() {
    // Collect form data
    if (currentOperationName == null) return;

    const selectedSvgIds = selectMgr.selectedPaths().map(path => path.id);
    if (!isWholeWorkpieceOperation(currentOperationName) && selectedSvgIds.length === 0) {
        notify('Select a path first', 'info');
        return null;
    }

    const existingToolpaths = findExistingToolpathsForSelection(currentOperationName, selectedSvgIds);
    if (existingToolpaths.length > 0) {
        setActiveToolpaths(existingToolpaths);
        redraw();
        return existingToolpaths;
    }

    const data   = window.toolPathProperties.collectFormData(currentOperationName);
    const errors = window.toolPathProperties.validateFormData(currentOperationName, data);
    if (errors.length > 0) {
        notify(errors.join(', '), 'error');
        return null;
    }

    window.toolPathProperties.saveDefaults(currentOperationName, data);

    const descriptor = window.toolPathProperties.getOperationDescriptor(currentOperationName, data.operationType);
    const selectedTool = window.toolPathProperties.getToolById(data.tool);
    if (!selectedTool) {
        notify('Selected tool not found', 'error');
        return null;
    }

    // Store current tool and temporarily replace it with the selected one
    const originalTool = window.currentTool;
    window.currentTool = {
        ...selectedTool,
        depth: data.depth,
        step: selectedTool.step,
        stepover: selectedTool.stepover,
        inside: data.inside,
        direction: data.direction,
        numLoops: 1,
        overCut: 0,
        plunge: data.plunge,
        strategy: data.strategy
    };

    // Store the properties for later reference (to be used by pushToolPath)
    window.currentToolpathProperties = sanitizeToolpathProperties(data);
    window.currentToolpathDescriptor = descriptor;

    // Store before toolpath count to detect ALL new toolpaths
    const beforeCount = toolpaths.length;

    // Execute the operation
    try {
        handleOperationClick(descriptor.executionOperation || currentOperationName);
    } finally {
        // Restore original tool
        window.currentTool = originalTool;
        window.currentToolpathDescriptor = null;
    }

    // Find ALL newly created toolpaths (not just the last one)
    const afterCount = toolpaths.length;

    if (afterCount > beforeCount) {
        // Get all the newly created toolpaths
        const newToolpaths = toolpaths.slice(beforeCount);

        // Use centralized helper to set active state
        setActiveToolpaths(newToolpaths);

        const editedOperationName = getToolpathDisplayName(newToolpaths[0]) || descriptor.popupTitle || currentOperationName;
        const operationIcon = descriptor.icon || getOperationIcon(descriptor.displayOperation || currentOperationName);
        syncFloatingPopupOperationName(operationIcon, editedOperationName);

        const popupContextSvgIds = newToolpaths.flatMap(tp => getToolpathSourceIds(tp));
        setFloatingPropertiesPopupContext({
            type: 'toolpath',
            id: newToolpaths[0]?.id || null,
            operationName: descriptor.executionOperation,
            svgIds: Array.from(new Set(popupContextSvgIds))
        });

        const refreshedPropertiesMeta = extractPropertiesPanelMeta(window.toolPathProperties.getPropertiesHTML(currentOperationName, data, {
            showUpdateButton: true
        }));
        const operationForm = document.getElementById('operation-properties-form');
        if (operationForm) {
            operationForm.innerHTML = refreshedPropertiesMeta.cleanedHtml || '';
        }
        setupToolpathUpdateButton(currentOperationName);
        wireDepthToNameAutoUpdate(currentOperationName, operationIcon);

        // Keep the operations tool highlighted in creation mode after generation.
        redraw();

        // Clear the properties after successful generation
        window.currentToolpathProperties = null;
        window.currentToolpathDescriptor = null;

        return newToolpaths;
    }
    // Clear the properties even if generation failed
    window.currentToolpathProperties = null;
    window.currentToolpathDescriptor = null;
    redraw();
    return null;
}

/**
 * Wire depth input to auto-update the name field when name still matches the default pattern.
 */
function syncFloatingPopupOperationName(operationIcon, name) {
    const displayName = name || 'Operation';
    syncFloatingPropertiesPopupText({
        titleHtml: operationIcon
            ? `<i data-lucide="${operationIcon}"></i> Edit ${displayName}`
            : `Edit ${displayName}`,
        subtitle: getFloatingPropertiesElements().subtitle?.textContent || ''
    });
}

function wireDepthToNameAutoUpdate(operationName, operationIcon = null) {
    const nameInput  = document.getElementById('pm-name') || document.getElementById('pm-toolpathName') || document.getElementById('toolpath-name-input');
    if (!nameInput) return;

    const syncTitleFromInput = () => {
        const trimmedName = nameInput.value.trim();
        syncFloatingPopupOperationName(operationIcon, trimmedName || operationName);
    };

    syncTitleFromInput();
    nameInput.addEventListener('input', syncTitleFromInput);
}

function showOperationPropertiesEditor(operationName) {
    const toolsList = document.getElementById('draw-tools-list');
    const propertiesEditor = document.getElementById('operation-properties-editor');
    const toolPropertiesEditor = document.getElementById('tool-properties-editor');
    const form = document.getElementById('operation-properties-form');

    clearFloatingPopupFooter();

    document.querySelectorAll('#draw-tools-list .sidebar-item.selected').forEach(el => el.classList.remove('selected'));
    const selectedOperationItem = document.querySelector(`#draw-tools-list [data-operation="${operationName}"]`);
    if (selectedOperationItem) selectedOperationItem.classList.add('selected');
    syncGroupedToolSelection();
 
    // Keep tools list visible while preparing popup content
    toolsList.style.display = 'block';
    if (toolPropertiesEditor) toolPropertiesEditor.style.display = 'none';
 
    currentOperationName = operationName;
    const operationIcon = getOperationIcon(operationName);

    // Check if this is a toolpath operation
    const isToolpathOperation = window.toolPathProperties?.hasOperation(operationName);

    if (isToolpathOperation) {
        const selectedSvgIds = typeof getSelectedSvgPathIds === 'function'
            ? getSelectedSvgPathIds().filter(Boolean)
            : [];
        const existingToolpaths = (selectedSvgIds.length > 0 || isWholeWorkpieceOperation(operationName))
            ? findExistingToolpathsForSelection(operationName, selectedSvgIds)
            : [];
        const hasAssociatedShape = existingToolpaths.length > 0;
        const propertiesMeta = extractPropertiesPanelMeta(window.toolPathProperties.getPropertiesHTML(operationName, null, {
            showUpdateButton: hasAssociatedShape
        }));
        form.innerHTML = propertiesMeta.cleanedHtml || '';
 
        // Store the active operation name for path selection handler
        window.activeToolpathOperation = operationName;

        if (hasAssociatedShape) {
            setActiveToolpaths(existingToolpaths);
            setupToolpathUpdateButton(operationName);
        }
 
        const creationTitle = `${operationName} tool`;
        const editingTitle = (document.getElementById('pm-name') || document.getElementById('pm-toolpathName') || document.getElementById('toolpath-name-input'))?.value || operationName;
 
        // Auto-update name when depth changes and keep popup title in sync with the name field
        if (hasAssociatedShape) {
            wireDepthToNameAutoUpdate(operationName, operationIcon);
        }
 
        setFloatingPropertiesPopupContext(hasAssociatedShape
            ? { type: 'toolpath', id: existingToolpaths[0]?.id || null, operationName, svgIds: selectedSvgIds.slice() }
            : null);

        showFloatingPropertiesPopup(propertiesEditor, {
            titleHtml: operationIcon
                ? `<i data-lucide="${operationIcon}"></i> ${hasAssociatedShape ? `Edit ${editingTitle}` : creationTitle}`
                : (hasAssociatedShape ? `Edit ${editingTitle}` : creationTitle),
            subtitle: propertiesMeta.subtitle
        });
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
            const propertiesMeta = extractPropertiesPanelMeta(operation.getPropertiesHTML());
            form.innerHTML = propertiesMeta.cleanedHtml || '';

            if (operation && typeof operation.bindPropertiesUI === 'function') {
                operation.bindPropertiesUI(form);
            }

            // Add event listeners directly to input elements
            const inputs = form.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                function handleInputChange() {
                    if (operation && typeof operation.updateFromProperties === 'function') {
                        const data = collectOperationProperties(operation);
                        operation.updateFromProperties(data, { changedKey: getPropertyInputKey(input) });
                        if (operation.fields)
                            PropertiesManager.save(operation.name, data, Object.values(operation.fields));
                    }
                }

                // Add both change and input events for real-time updates
                input.addEventListener('change', handleInputChange);
                if (input.type === 'text' || input.type === 'number' || input.type === 'range' || input.tagName === 'TEXTAREA') {
                    input.addEventListener('input', handleInputChange);
                }
            });

            showFloatingPropertiesPopup(propertiesEditor, {
                titleHtml: operationIcon
                    ? `<i data-lucide="${operationIcon}"></i> ${propertiesMeta.titleHtml}`
                    : propertiesMeta.titleHtml,
                subtitle: propertiesMeta.subtitle
            });
        } else {
            form.innerHTML = '<p class="text-muted">No properties available for this operation.</p>';
            showFloatingPropertiesPopup(propertiesEditor, {
                titleHtml: 'Properties',
                subtitle: ''
            });
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
        stepover: selectedTool.stepover,
        direction: data.direction,
        strategy: data.strategy,
        plunge: data.plunge
    };
    window.currentToolpathProperties = sanitizeToolpathProperties(data);
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
        window.currentToolpathDescriptor = null;
    }
}

function updateHelicalDrillToolpath(activeToolpaths, selectedTool, data) {
    for (const toolpath of activeToolpaths) {
        if (toolpath.operation !== 'HelicalDrill') continue;
        toolpath.toolpathProperties = sanitizeToolpathProperties(data) || {};
        setToolpathLabel(toolpath, getToolpathPropertyName(data) || toolpath.label);
        toolpath.tool = {
            ...selectedTool,
            depth: data.depth,
            step: selectedTool.step,
            plunge: data.plunge
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
        toolpath.toolpathProperties = sanitizeToolpathProperties(data) || {};
        setToolpathLabel(toolpath, getToolpathPropertyName(data) || toolpath.label);
        toolpath.tool = {
            ...selectedTool,
            depth: data.depth,
            step: selectedTool.step,
            stepover: selectedTool.stepover,
            inside: data.inside,
            direction: data.direction,
            plunge: data.plunge
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
    let svgPathsToRegenerate = [];
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

    const selectedSvgPaths = svgpaths.filter(path => path.selected === true);
    if (selectedSvgPaths.length > 0) {
        svgPathsToRegenerate = selectedSvgPaths.slice();
        activeToolpaths = activeToolpaths.filter(toolpath => {
            const toolpathSourceIds = toolpath.svgIds || (toolpath.svgId ? [toolpath.svgId] : []);
            return toolpathSourceIds.some(id => selectedSvgPaths.some(path => path.id === id));
        });
    }

    if (svgPathsToRegenerate.length === 0) {
        notify('Original paths not found', 'error');
        return;
    }

    const seenSvgPathIds = new Set();
    svgPathsToRegenerate = svgPathsToRegenerate.filter(path => {
        if (!path || seenSvgPathIds.has(path.id)) return false;
        seenSvgPathIds.add(path.id);
        return true;
    });

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
        step: selectedTool.step,
        stepover: selectedTool.stepover,
        inside: data.inside,
        direction: data.direction,
        numLoops: 1,
        overCut: 0,
        strategy: data.strategy,
        plunge: data.plunge
    };
    window.currentToolpathProperties = sanitizeToolpathProperties(data);
    window.toolpathUpdateTargets = [...activeToolpaths];

    try {
        handleOperationClick(window.currentToolpathDescriptor?.executionOperation || operationName);
    } finally {
        window.currentTool = originalTool;
        window.currentToolpathProperties = null;
        window.toolpathUpdateTargets = null;
        window.currentToolpathDescriptor = null;
    }

    const updatedOperationIcon = getOperationIcon(operationName);
        const updatedNameInput = document.getElementById('pm-name') || document.getElementById('pm-toolpathName') || document.getElementById('toolpath-name-input');
        syncFloatingPopupOperationName(updatedOperationIcon, updatedNameInput?.value?.trim() || operationName);
 
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
    const bodyButton = document.getElementById('update-toolpath-button');
    const footer = getFloatingPopupFooter();
    if (!bodyButton || !footer) return;

    footer.innerHTML = '';
    footer.classList.remove('is-visible');

    const footerButtonWrapper = bodyButton.parentNode;
    if (!footerButtonWrapper) return;

    footer.appendChild(footerButtonWrapper);
    footer.classList.add('is-visible');

    const footerButton = document.getElementById('update-toolpath-button');
    if (!footerButton) return;

    const newButton = footerButton.cloneNode(true);
    footerButton.parentNode.replaceChild(newButton, footerButton);

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

        const selectedTool = window.toolPathProperties.getToolById(data.tool);
        if (!selectedTool) {
            notify('Selected tool not found', 'error');
            window.currentToolpathDescriptor = null;
            return;
        }

        window.currentToolpathDescriptor = window.toolPathProperties.getOperationDescriptor(operationName, data.operationType);

        if (operationName === 'Surfacing' || operationName === '3dProfile') {
            updateSurfacingToolpath(operationName, activeToolpaths, selectedTool, data);
        } else if (operationName === 'Drill' && activeToolpaths.some(tp => tp.operation === 'HelicalDrill')) {
            updateHelicalDrillToolpath(activeToolpaths, selectedTool, data);
        } else if (operationName === 'Drill') {
            updateDrillToolpath(activeToolpaths, selectedTool, data);
            window.currentToolpathDescriptor = null;
        } else {
            regenerateToolpathFromSvg(operationName, activeToolpaths, selectedTool, data);
        }

        refreshToolPathsDisplay();
        notify(`${activeToolpaths.length} toolpath(s) updated`, 'success');
        window.currentToolpathDescriptor = null;
        redraw();
    });
}

function clearFloatingPropertiesFooter() {
    clearFloatingPopupFooter();
}

window.clearFloatingPropertiesFooter = clearFloatingPropertiesFooter;

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

    // Switch to draw tools tab
    const drawToolsTab = document.getElementById('draw-tools-tab');
    const drawToolsPane = document.getElementById('draw-tools');

    document.querySelectorAll('#sidebar-tabs .nav-link').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('#sidebar-tabs ~ .sidebar-tab-content .tab-pane').forEach(pane => pane.classList.remove('show', 'active'));

    drawToolsTab.classList.add('active');
    drawToolsPane.classList.add('show', 'active');

    // Show the operation properties editor
    const toolsList = document.getElementById('draw-tools-list');
    const propertiesEditor = document.getElementById('operation-properties-editor');
    const form = document.getElementById('operation-properties-form');

    toolsList.style.display = 'block';
 
    // Map HelicalDrill to Drill for properties panel
    const propsOperation = toolpath.operation === 'HelicalDrill' ? 'Drill' : toolpath.operation;
    currentOperationName = propsOperation;

    let propertiesMeta = null;

    // Generate properties HTML with existing values
    if (window.toolPathProperties?.hasOperation(propsOperation)) {
        // Build properties from the toolpath's own stored data
        const descriptor = window.toolPathProperties.getOperationDescriptor(
            propsOperation,
            toolpath.operation === 'Pocket'
                ? 'pocket'
                : toolpath.operation === 'Inside'
                    ? 'inside'
                    : toolpath.operation === 'Outside'
                        ? 'outside'
                        : 'center'
        );
        let properties = toolpath.toolpathProperties ? { ...toolpath.toolpathProperties } : {};
        if (properties.tool === undefined && toolpath.tool?.recid) properties.tool = toolpath.tool.recid;
        if (properties.depth === undefined && toolpath.tool?.depth !== undefined) properties.depth = toolpath.tool.depth;
        if (properties.operationType === undefined) {
            properties.operationType = toolpath.operation === 'Pocket'
                ? 'pocket'
                : toolpath.operation === 'Inside'
                    ? 'inside'
                    : toolpath.operation === 'Outside'
                        ? 'outside'
                        : 'center';
        }

        propertiesMeta = extractPropertiesPanelMeta(window.toolPathProperties.getPropertiesHTML(propsOperation, properties, {
            showUpdateButton: true
        }));
        form.innerHTML = propertiesMeta.cleanedHtml || '';

        // Set up the "Update Toolpath" button using the shared handler
        setupToolpathUpdateButton(propsOperation);

        // Auto-update name when depth changes and keep popup title in sync with the name field
        wireDepthToNameAutoUpdate(propsOperation, descriptor.icon || getOperationIcon(propsOperation));

        // Update help content
        if (window.stepWiseHelp) {
            window.stepWiseHelp.setActiveOperation(propsOperation);
        }

        lucide.createIcons();
    } else {
        form.innerHTML = '<p class="text-muted">This toolpath cannot be edited.</p>';
    }

    const toolpathOperationIcon = getOperationIcon(toolpath.operation);
    const editedOperationName = (document.getElementById('pm-name') || document.getElementById('pm-toolpathName') || document.getElementById('toolpath-name-input'))?.value
        || toolpath.label
        || buildLinkedToolpathName(toolpath)
        || (toolpath.operation === 'HelicalDrill' ? 'Helical Drill' : propsOperation);
    setFloatingPropertiesPopupContext({
        type: 'toolpath',
        id: toolpath.id,
        operationName: propsOperation,
        svgIds: (toolpath.svgIds || (toolpath.svgId ? [toolpath.svgId] : [])).slice()
    });

    showFloatingPropertiesPopup(propertiesEditor, {
        titleHtml: toolpathOperationIcon
            ? `<i data-lucide="${toolpathOperationIcon}"></i> Edit ${editedOperationName}`
            : `Edit ${editedOperationName}`,
        subtitle: propertiesMeta?.subtitle || ''
    });
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
    hideFloatingPropertiesPopup();
    const form = document.getElementById('tool-properties-form');
    form.innerHTML = "";

    document.querySelectorAll('#draw-tools-list .sidebar-item.selected').forEach(el => el.classList.remove('selected'));
    syncGroupedToolSelection();

    const toolsList = document.getElementById('draw-tools-list');
    const toolPropertiesEditor = document.getElementById('tool-properties-editor');
    const operationPropertiesEditor = document.getElementById('operation-properties-editor');
    toolsList.style.display = 'block';
    toolPropertiesEditor.style.setProperty('display', 'none', 'important');
    operationPropertiesEditor.style.setProperty('display', 'none', 'important');
 
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
    const operationPropertiesEditor = document.getElementById('operation-properties-editor');
    const form = document.getElementById('tool-properties-form');

    clearFloatingPopupFooter();

    // Keep tools list visible while preparing popup content
    toolsList.style.display = 'block';
    if (operationPropertiesEditor) operationPropertiesEditor.style.display = 'none';
    propertiesEditor.style.flexDirection = 'column';
 
    const operation = window.cncController?.operationManager?.getOperation(path.creationTool);
    const operationLabel = operation?.displayName || path.creationTool;
    currentOperationName = path.creationTool;

    const isShapePath = path.creationTool === 'Shape' || (window.SHAPE_TOOL_NAMES || []).includes(path.creationTool);
    const shapeCutOperationName = 'Profile';

    // Get properties HTML from the operation
    let propertiesHTML = '';
    let propertiesMeta = {
        titleHtml: operation?.icon
            ? `<i data-lucide="${operation.icon}"></i> Edit ${path.name}`
            : `Edit ${path.name}`,
        subtitle: '',
        cleanedHtml: ''
    };

    // Now get the properties HTML (works for both edit and creation modes)
    if (isShapePath && operation && typeof operation.renderGeometryFields === 'function') {
        if (typeof operation.setEditPath === 'function') {
            operation.setEditPath(path);
        }

        const popupConfig = buildShapeCutPopupHTML(operation, path, shapeCutOperationName);
        form.innerHTML = popupConfig.html;
        bindShapeCutPopup(path, operation, shapeCutOperationName);

        propertiesMeta = {
            titleHtml: operation?.icon
                ? `<i data-lucide="${operation.icon}"></i> Edit ${path.name}`
                : `Edit ${path.name}`,
            subtitle: ''
        };
    } else if (operation && typeof operation.getPropertiesHTML === 'function') {
        if (operation && typeof operation.setEditPath === 'function') {
            operation.setEditPath(path);
            //operation.onPropertiesChanged(path.creationProperties.properties); // Ensure properties are synced
        }
        propertiesHTML = operation.getPropertiesHTML(path);
        propertiesMeta = extractPropertiesPanelMeta(propertiesHTML);
        propertiesMeta.titleHtml = propertiesMeta.titleHtml || (operation?.icon
            ? `<i data-lucide="${operation.icon}"></i> Edit ${path.name}`
            : `Edit ${path.name}`);
        if (operation?.icon && !propertiesMeta.titleHtml.includes('data-lucide=')) {
            propertiesMeta.titleHtml = `<i data-lucide="${operation.icon}"></i> ${propertiesMeta.titleHtml}`;
        }
        form.innerHTML = propertiesMeta.cleanedHtml || '';
        
        if (operation && typeof operation.update === 'function') {
            operation.update(path);
        }

        if (operation && typeof operation.bindPropertiesUI === 'function') {
            operation.bindPropertiesUI(form);
        }
        // Set the edit context before getting properties HTML

    } else {
        // Fallback for operations without properties
        propertiesHTML = '<p class="text-muted">No editable properties available for this path.</p>';
        form.innerHTML = propertiesHTML;
    }

    setFloatingPropertiesPopupContext({ type: 'shape', id: path.id, operationName: path.creationTool });

    showFloatingPropertiesPopup(propertiesEditor, {
        titleHtml: propertiesMeta.titleHtml || (operation?.icon
            ? `<i data-lucide="${operation.icon}"></i> Edit ${path.name}`
            : `Edit ${path.name}`),
        subtitle: propertiesMeta.subtitle
    });

    if (!isShapePath) {
        // Add event listeners directly to input elements for path editing
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            function handlePathEditChange() {
                updateExistingPath(path, form, getPropertyInputKey(input));
            }

            input.addEventListener('change', handlePathEditChange);
            if (input.type === 'text' || input.type === 'number' || input.type === 'range' || input.tagName === 'TEXTAREA') {
                input.addEventListener('input', handlePathEditChange);
            }
        });
    }

    lucide.createIcons();
}

// Function to update an existing path with new properties
function updateExistingPath(path, form, changedKey = null) {
    const operation = window.cncController?.operationManager?.getOperation(path.creationTool);
    const data = collectOperationProperties(operation);

    if (path.creationTool === 'Text') {
        if (operation) {
            operation.setEditPath(path);
            operation.updateFromProperties(data);
        }
    }
    else if (path.creationTool === 'Shape' || (window.SHAPE_TOOL_NAMES || []).includes(path.creationTool)) {
        // For shapes, update in place
        updateShapeInPlace(path, data, changedKey);
    }


    redraw();
}

function updateShapeInPlace(path, data, changedKey = null) {
    const operation = window.cncController?.operationManager?.getOperation(path.creationTool);
    operation.setEditPath(path);
    operation.onPropertiesChanged(data, { changedKey });
}




// Tool panel creation
// Create 2D simulation controls in overlay
function createToolPanel(targetId) {
    const toolPanel = document.getElementById(targetId || 'tool-panel');
    if (!toolPanel) return;
    toolPanel.innerHTML = `
        <div class="tool-controls">
            <div class="d-flex gap-2 mb-3 align-items-center flex-wrap">
                <button type="button" class="btn btn-outline-success btn-sm" id="add-tool">
                    <i data-lucide="plus"></i> Add Tool
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
                        <th><i data-lucide="move" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Feed rate"></i> Feed rate (<span id="tool-table-feed-unit">${getUnitLabel()}/min</span>)</th>
                        <th><i data-lucide="arrow-down" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Plunge rate"></i> Plunge rate (<span id="tool-table-zfeed-unit">${getUnitLabel()}/min</span>)</th>
                        <th><i data-lucide="triangle" data-bs-toggle="tooltip" data-bs-placement="bottom" title="Angle"></i> Angle</th>
                    </tr>
                </thead>
                <tbody id="tool-table-body">
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('add-tool').addEventListener('click', addTool);
    renderToolsTable();
    create2DSimulationControls();
    create3DSimulationControls();
}

function createCanvasSidePanels() {
    // Project panels are now opened in dedicated modals from the Project menu.
    // Keep simulation controls initialized even without embedded canvas tabs.
    create2DSimulationControls();
    create3DSimulationControls();
}

function getWorkpieceConfigController() {
    if (window.workpieceConfigController) {
        return window.workpieceConfigController;
    }

    const registeredOperation = window.cncController?.operationManager?.getOperation('Workpiece');
    if (registeredOperation) {
        window.workpieceConfigController = registeredOperation;
        return registeredOperation;
    }

    if (typeof Workpiece === 'function') {
        window.workpieceConfigController = new Workpiece();
        return window.workpieceConfigController;
    }

    return null;
}

function createWorkpiecePanel(targetId) {
    const workpiecePanel = document.getElementById(targetId || 'workpiece-panel');
    if (!workpiecePanel) return;

    const workpieceController = getWorkpieceConfigController();
    if (!workpieceController || typeof workpieceController.getPropertiesHTML !== 'function') {
        workpiecePanel.innerHTML = '<div class="alert alert-warning mb-0">Workpiece configuration is unavailable.</div>';
        return;
    }

    if (workpieceController.fields) {
        const saved = PropertiesManager.loadSaved(workpieceController.name);
        if (Object.keys(saved).length > 0) {
            workpieceController.properties = { ...workpieceController.properties, ...saved };
        }
    }

    workpiecePanel.innerHTML = `
        <div class="workpiece-panel-content">
            ${workpieceController.getPropertiesHTML()}
        </div>
    `;

    const inputs = workpiecePanel.querySelectorAll('input, select, textarea');
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
        if (input.type === 'text' || input.type === 'number' || input.tagName === 'TEXTAREA') {
            input.addEventListener('input', handleInputChange);
        }
    });
}

function createGrblPanel(targetId) {
    const grblPanel = document.getElementById(targetId || 'grbl-panel');
    if (!grblPanel) return;

    grblPanel.innerHTML = `
    <div class="sidebar-section">
            <div class="p-2">
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

                <form id="gcode-profile-form">
                    <div id="gcode-profile-fields"></div>
                    <button type="button" class="btn btn-primary btn-sm w-100" id="save-gcode-profile">
                        <i data-lucide="save"></i> Save Profile
                    </button>
                </form>
            </div>
        </div>
    `;
}

function createBootstrapLayoutIconNode(iconName) {
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', iconName);
    return icon;
}

function setInputValueIfNeeded(input, value) {
    const normalizedValue = value == null ? '' : String(value);
    if (input.value !== normalizedValue) {
        input.value = normalizedValue;
    }
}

function createToolRow(tool, index) {
    const row = document.createElement('tr');

    const iconCell = document.createElement('td');
    const iconImg = document.createElement('img');
    iconImg.width = 80;
    iconImg.height = 32;
    iconImg.setAttribute('data-bs-toggle', 'tooltip');
    iconCell.appendChild(iconImg);

    const nameCell = document.createElement('td');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.dataset.field = 'name';
    nameInput.className = 'form-control-plaintext';
    nameCell.appendChild(nameInput);

    const bitCell = document.createElement('td');
    const bitSelect = document.createElement('select');
    bitSelect.dataset.field = 'bit';
    bitSelect.className = 'form-select form-select-sm';
    ['End Mill', 'Ball Nose', 'VBit', 'Drill'].forEach(optionValue => {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue;
        bitSelect.appendChild(option);
    });
    bitCell.appendChild(bitSelect);

    const diameterCell = document.createElement('td');
    const diameterInput = document.createElement('input');
    diameterInput.type = 'text';
    diameterInput.dataset.field = 'diameter';
    diameterInput.className = 'form-control-plaintext';
    diameterCell.appendChild(diameterInput);

    const flutesCell = document.createElement('td');
    const flutesInput = document.createElement('input');
    flutesInput.type = 'number';
    flutesInput.dataset.field = 'flutes';
    flutesInput.min = '1';
    flutesInput.max = '6';
    flutesInput.step = '1';
    flutesInput.setAttribute('data-bs-toggle', 'tooltip');
    flutesInput.title = 'Number of cutting edges';
    flutesCell.appendChild(flutesInput);

    const rpmCell = document.createElement('td');
    const rpmInput = document.createElement('input');
    rpmInput.type = 'number';
    rpmInput.dataset.field = 'rpm';
    rpmInput.min = '1000';
    rpmInput.max = '30000';
    rpmInput.step = '100';
    rpmInput.setAttribute('data-bs-toggle', 'tooltip');
    rpmInput.title = 'Spindle speed (RPM)';
    rpmCell.appendChild(rpmInput);

    const feedCell = document.createElement('td');
    const feedInput = document.createElement('input');
    feedInput.type = 'text';
    feedInput.dataset.field = 'feed';
    feedCell.appendChild(feedInput);

    const zfeedCell = document.createElement('td');
    const zfeedInput = document.createElement('input');
    zfeedInput.type = 'number';
    zfeedInput.dataset.field = 'zfeed';
    zfeedCell.appendChild(zfeedInput);

    const angleCell = document.createElement('td');
    const angleActions = document.createElement('div');
    angleActions.className = 'tool-angle-actions';

    const angleInput = document.createElement('input');
    angleInput.type = 'number';
    angleInput.dataset.field = 'angle';
    angleInput.min = '0';
    angleInput.max = '90';
    angleInput.step = '5';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-outline-danger btn-sm tool-row-delete';
    deleteButton.setAttribute('data-bs-toggle', 'tooltip');
    deleteButton.title = 'Delete this tool';
    deleteButton.appendChild(createBootstrapLayoutIconNode('trash-2'));

    angleActions.appendChild(angleInput);
    angleActions.appendChild(deleteButton);
    angleCell.appendChild(angleActions);

    row.appendChild(iconCell);
    row.appendChild(nameCell);
    row.appendChild(bitCell);
    row.appendChild(diameterCell);
    row.appendChild(flutesCell);
    row.appendChild(rpmCell);
    row.appendChild(feedCell);
    row.appendChild(zfeedCell);
    row.appendChild(angleCell);

    row._toolRefs = {
        iconImg,
        nameInput,
        bitSelect,
        diameterInput,
        flutesInput,
        rpmInput,
        feedInput,
        zfeedInput,
        angleInput,
        deleteButton
    };

    row.addEventListener('click', function (e) {
        if (e.target.closest('input, select, button')) {
            return;
        }
        selectTool(parseInt(row.dataset.toolIndex, 10));
    });

    row.addEventListener('change', function (e) {
        const input = e.target.closest('input, select');
        if (!input || !input.dataset.field) return;
        updateTool(parseInt(row.dataset.toolIndex, 10), input.dataset.field, input.value);
    });

    deleteButton.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteTool(parseInt(row.dataset.toolIndex, 10));
    });

    syncToolRow(row, tool, index);
    return row;
}

function syncToolRow(row, tool, index) {
    if (!row || !tool || !row._toolRefs) return;

    const refs = row._toolRefs;
    const useInches = getOption('Inches');
    const autoFeedRateEnabled = getOption('autoFeedRate');
    const material = getOption('material');

    const displayDiameter = formatDimension(tool.diameter, useInches, true);
    const autoCalculatedFeed = autoFeedRateEnabled ? calculateFeedRate(tool, material, 'Profile') : null;
    const autoCalculatedFeedDisplay = autoCalculatedFeed === null
        ? null
        : (useInches ? Math.round(autoCalculatedFeed / 25.4) : autoCalculatedFeed);
    const feedUnitLabel = useInches ? 'in/min' : 'mm/min';
    const displayFeed = autoFeedRateEnabled
        ? `Auto (${autoCalculatedFeedDisplay} ${feedUnitLabel})`
        : (useInches ? Math.round(tool.feed / 25.4) : tool.feed);
    const displayZFeed = useInches ? Math.round(tool.zfeed / 25.4) : tool.zfeed;

    const feedMax = useInches ? 40 : 1000;
    const feedMin = useInches ? 1 : 10;
    const feedStep = useInches ? 1 : 10;
    const feedTitle = autoFeedRateEnabled && autoCalculatedFeed !== null
        ? `Automatic (${useInches ? Math.round(autoCalculatedFeed / 25.4) : autoCalculatedFeed} ${useInches ? 'in/min' : 'mm/min'})`
        : 'Manual XY feed rate';

    row.dataset.toolIndex = index;
    row.dataset.recid = tool.recid;
    row.classList.toggle('selected', currentTool && currentTool.recid === tool.recid);

    refs.iconImg.src = `icons/${getToolIcon(tool.bit)}`;
    refs.iconImg.alt = tool.bit;
    refs.iconImg.title = tool.bit;

    setInputValueIfNeeded(refs.nameInput, tool.name);
    setInputValueIfNeeded(refs.bitSelect, tool.bit);
    setInputValueIfNeeded(refs.diameterInput, displayDiameter);
    refs.diameterInput.dataset.unitType = useInches ? 'inches' : 'mm';
    refs.diameterInput.placeholder = useInches ? '1/4' : '6';

    setInputValueIfNeeded(refs.flutesInput, tool.flutes || 2);
    setInputValueIfNeeded(refs.rpmInput, tool.rpm || 18000);

    setInputValueIfNeeded(refs.feedInput, displayFeed);
    refs.feedInput.readOnly = autoFeedRateEnabled;
    refs.feedInput.min = String(feedMin);
    refs.feedInput.max = String(feedMax);
    refs.feedInput.step = String(feedStep);
    refs.feedInput.dataset.unitType = useInches ? 'inches' : 'mm';
    refs.feedInput.title = feedTitle;

    setInputValueIfNeeded(refs.zfeedInput, displayZFeed);
    refs.zfeedInput.min = String(feedMin);
    refs.zfeedInput.max = String(feedMax);
    refs.zfeedInput.step = String(feedStep);
    refs.zfeedInput.dataset.unitType = useInches ? 'inches' : 'mm';

    setInputValueIfNeeded(refs.angleInput, tool.angle);
}

function syncToolTableUnits() {
    const unitLabel = getUnitLabel();
    const unitElem = document.getElementById('tool-table-unit');
    const feedUnitElem = document.getElementById('tool-table-feed-unit');
    const zfeedUnitElem = document.getElementById('tool-table-zfeed-unit');
    if (unitElem) unitElem.textContent = unitLabel;
    if (feedUnitElem) feedUnitElem.textContent = `${unitLabel}/min`;
    if (zfeedUnitElem) zfeedUnitElem.textContent = `${unitLabel}/min`;
}

function updateRenderedToolRow(index) {
    const tool = tools[index];
    if (!tool) return;

    const row = document.querySelector(`#tool-table-body tr[data-recid="${tool.recid}"]`);
    if (row) {
        syncToolRow(row, tool, index);
    }
}

// Render tools table
function renderToolsTable() {
    const tbody = document.getElementById('tool-table-body');
    if (!tbody) return;

    syncToolTableUnits();

    const existingRows = new Map();
    Array.from(tbody.children).forEach(row => {
        if (row.dataset && row.dataset.recid) {
            existingRows.set(row.dataset.recid, row);
        }
    });

    const fragment = document.createDocumentFragment();

    tools.forEach((tool, index) => {
        const recid = String(tool.recid);
        const row = existingRows.get(recid) || createToolRow(tool, index);
        syncToolRow(row, tool, index);
        fragment.appendChild(row);
    });

    tbody.replaceChildren(fragment);

    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }

    if (tools.length > 0 && !currentTool) {
        selectTool(0);
    }
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

        updateRenderedToolRow(index);

        if (currentTool && currentTool.recid === tools[index].recid) {
            currentTool = tools[index];
            updateRenderedToolRow(index);
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

function deleteTool(index = null) {
    const selectedIndex = index !== null ? index : getCurrentToolIndex();

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
    // Re-render the tools table to reflect loaded tools when the panel is mounted
    if (document.getElementById('tool-table-body')) {
        renderToolsTable();
    }

    // Update currentTool if it exists in the loaded tools
    if (tools.length > 0) {
        currentTool = tools[0]; // Default to first tool
    }
}

// Operation handlers
function handleOperationClick(operation) {
    // addUndo() will be called by individual operation functions as needed

    if ((window.SHAPE_TOOL_NAMES || []).includes(operation)) {
        doShape(operation);
        return;
    }

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
            cncController.setMode("Select");
            break;
        case 'Shape':
            doShape('Shape');
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
            cncController.setMode("Select");
            break;
        case 'Pocket':
            beginUndoBatch();
            doPocket();
            endUndoBatch();
            selectMgr.unselectAll();
            cncController.setMode("Select");
            break;
        case 'VCarve':
            beginUndoBatch();
            doVcarve();
            endUndoBatch();
            selectMgr.unselectAll();
            cncController.setMode("Select");
            break;
        case 'Inlay':
            beginUndoBatch();
            doInlay();
            endUndoBatch();
            selectMgr.unselectAll();
            cncController.setMode("Select");
            break;
        case 'Surfacing':
            beginUndoBatch();
            doSurfacing();
            endUndoBatch();
            cncController.setMode("Select");
            break;
        case '3dProfile':
            beginUndoBatch();
            if (typeof window.do3dProfile === 'function') {
                window.do3dProfile();
            }
            endUndoBatch();
            selectMgr.unselectAll();
            cncController.setMode("Select");
            break;
        default:
            doSelect(operation);
            break;
    }

}

function canEditCreatedPath(path) {
    if (!path || !path.creationTool || !path.creationProperties) {
        return false;
    }

    return path.creationTool === 'Text'
        || path.creationTool === 'Shape'
        || (window.SHAPE_TOOL_NAMES || []).includes(path.creationTool)
        || path.creationTool === 'Offset'
        || path.creationTool === 'Pattern';
}

function openPathEditor(path) {
    if (!canEditCreatedPath(path)) {
        return false;
    }

    const sidebarNode = document.querySelector(`#svg-paths-section [data-path-id="${path.id}"]`);
    const parentCollapse = sidebarNode ? sidebarNode.closest('.collapse') : null;
    if (parentCollapse && !parentCollapse.classList.contains('show')) {
        parentCollapse.classList.add('show');
    }

    const drawToolsTab = document.getElementById('draw-tools-tab');
    const drawToolsPane = document.getElementById('draw-tools');

    document.querySelectorAll('#sidebar-tabs .nav-link').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('#sidebar-tabs ~ .sidebar-tab-content .tab-pane').forEach(pane => pane.classList.remove('show', 'active'));

    drawToolsTab.classList.add('active');
    drawToolsPane.classList.add('show', 'active');

    cncController.setMode(path.creationTool);

    showPathPropertiesEditor(path);

    if ((path.creationTool === 'Offset' || path.creationTool === 'Pattern') && path.creationProperties.sourceIds) {
        selectMgr.unselectAll();
        const sourceIds = path.creationProperties.sourceIds;
        svgpaths.filter(p => p.creationTool === path.creationTool && p.creationProperties &&
            p.creationProperties.sourceIds && arraysEqual(p.creationProperties.sourceIds, sourceIds))
            .forEach(p => selectMgr.selectPath(p));
        sourceIds.forEach(srcId => {
            const srcPath = svgpaths.find(p => p.id === srcId);
            if (srcPath) selectMgr.selectPath(srcPath);
        });
        redraw();
    }

    return true;
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

    const path = svgpaths.find(p => p.id === pathId);
    openPathEditor(path);
}

// Move a toolpath one position earlier within its tool group
function moveToolpathUp(toolpathId) {
    if (moveToolpathRelative(toolpathId, -1)) {
        syncReorderOperationsModal();
    }
}

// Move a toolpath one position later within its tool group
function moveToolpathDown(toolpathId) {
    if (moveToolpathRelative(toolpathId, 1)) {
        syncReorderOperationsModal();
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
    const item = document.querySelector(`#svg-paths-section .sidebar-toolpath-item[data-path-id="${pathId}"]`);
    if (!item) return;

    const toolpath = toolpaths.find(tp => tp.id === pathId);
    if (!toolpath) return;

    const currentName = toolpath.label || buildLinkedToolpathName(toolpath) || (toolpath.name + ' ' + toolpath.id.replace('T', ''));
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
        setToolpathLabel(toolpath, newName);
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
        items.push({ label: 'Reorder', icon: 'grip-vertical', action: 'reorder' });
        items.push({ divider: true });
    }
    items.push({ label: 'Delete', icon: 'trash-2', action: 'delete', danger: true });
    createContextMenu(event, {
        items,
        data: pathId,
        onAction: function (action, pathId) {
            switch (action) {
                case 'rename':
                    startRenameToolpath(pathId);
                    break;
                case 'reorder':
                    showReorderOperationsModal();
                    break;
                case 'delete':
                    doRemoveToolPath(pathId);
                    syncReorderOperationsModal();
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
    refreshToolPathsDisplay();
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
    refreshToolPathsDisplay();
}

function addTextGroup(groupId, text, paths) {
    refreshToolPathsDisplay();
}

function addSvgGroup(groupId, groupName, paths) {
    refreshToolPathsDisplay();
}

// Add pattern group to sidebar (groups all pattern paths together)
function addPatternGroup(groupId, groupName, icon, paths, creationTool) {
    refreshToolPathsDisplay();
}
function addToolPath(id, name, operation, toolName) {
    // Instead of adding directly, we'll refresh the entire display in sorted order
    refreshToolPathsDisplay();
}

function createOrphanToolpathsGroup(count) {
    const groupContainer = document.createElement('div');
    groupContainer.className = 'sidebar-object-group sidebar-object-group-orphan';

    const header = document.createElement('div');
    header.className = 'sidebar-item sidebar-object-header sidebar-orphan-header';

    const main = document.createElement('div');
    main.className = 'sidebar-object-header-main d-flex align-items-start';
    main.appendChild(createBootstrapLayoutIconNode('wrench'));

    const body = document.createElement('div');
    body.className = 'sidebar-item-body';

    const titleRow = document.createElement('div');
    titleRow.className = 'sidebar-item-title-row';
    const title = document.createElement('span');
    title.className = 'sidebar-item-title';
    title.textContent = 'Unlinked Toolpaths';
    titleRow.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'sidebar-item-meta';
    const metaTag = document.createElement('span');
    metaTag.className = 'sidebar-item-meta-tag';
    metaTag.textContent = 'Toolpaths';
    const metaChip = document.createElement('span');
    metaChip.className = 'sidebar-item-meta-chip';
    metaChip.textContent = `${count} item${count !== 1 ? 's' : ''}`;
    meta.appendChild(metaTag);
    meta.appendChild(metaChip);

    body.appendChild(titleRow);
    body.appendChild(meta);
    main.appendChild(body);
    header.appendChild(main);
    groupContainer.appendChild(header);

    return groupContainer;
}

// Refresh the toolpaths display in array order (no auto-sorting)
function refreshToolPathsDisplay() {
    const section = document.getElementById('svg-paths-section');
    if (!section) return;

    const fragment = document.createDocumentFragment();

    if (typeof svgpaths === 'undefined' || !svgpaths || svgpaths.length === 0) {
        const orphanToolpaths = buildOrphanToolpaths(new Set());
        if (orphanToolpaths.length > 0) {
            const orphanGroup = renderSidebarLeafItem({
                icon: 'wrench',
                title: 'Unlinked Toolpaths',
                meta: `${orphanToolpaths.length} item${orphanToolpaths.length > 1 ? 's' : ''}`,
                itemClass: 'sidebar-orphan-header'
            });
            fragment.appendChild(orphanGroup);
            orphanToolpaths.forEach(toolpath => {
                const item = renderSidebarLeafItem({
                    id: toolpath.id,
                    icon: getOperationIcon(toolpath.name),
                    title: getToolpathDisplayName(toolpath),
                    leadingMeta: getToolpathPositionMeta(toolpath),
                    meta: toolpath.operation === 'HelicalDrill' ? 'Drill' : toolpath.operation,
                    secondaryMeta: [getToolpathDepthLabel(toolpath)].filter(Boolean),
                    visible: toolpath.visible,
                    pending: toolpath.pending === true,
                    itemClass: 'sidebar-toolpath-item ms-4'
                });
                fragment.appendChild(item);
            });
        }
        section.replaceChildren(fragment);
        if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }
        if (typeof window.schedule3DViewRefresh === 'function') {
            window.schedule3DViewRefresh({ preserveProgress: true, resetIfMissing: true });
        }
        return;
    }

    const allGroups = buildObjectSidebarGroups();
    const assignedToolpathIds = new Set();

    allGroups.forEach(group => {
        const linkedToolpaths = (toolpaths || []).filter(toolpath => {
            const sourceIds = getToolpathSourceIds(toolpath);
            return sourceIds.some(id => group.paths.some(path => path.id === id));
        });

        linkedToolpaths.forEach(toolpath => assignedToolpathIds.add(toolpath.id));

        const badges = [];
        const showPathCountBadge = group.kind !== 'text' && group.paths.length > 1;
        if (showPathCountBadge) badges.push(`${group.paths.length} paths`);
        badges.push(`${linkedToolpaths.length} toolpath${linkedToolpaths.length !== 1 ? 's' : ''}`);
        if (group.path.visible === false) badges.push('Hidden');

        fragment.appendChild(renderObjectSidebarGroup({
            groupId: `object-sidebar-${group.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
            path: group.path,
            title: group.title,
            headerIcon: group.headerIcon,
            headerMeta: group.headerMeta,
            headerBadges: badges,
            contextData: group.contextData,
            toolpaths: linkedToolpaths
        }));
    });

    const orphanToolpaths = buildOrphanToolpaths(assignedToolpathIds);
    if (orphanToolpaths.length > 0) {
        const orphanContainer = createOrphanToolpathsGroup(orphanToolpaths.length);

        orphanToolpaths.forEach(toolpath => {
            orphanContainer.appendChild(renderSidebarLeafItem({
                id: toolpath.id,
                icon: getOperationIcon(toolpath.name),
                title: getToolpathDisplayName(toolpath),
                leadingMeta: getToolpathPositionMeta(toolpath),
                meta: toolpath.operation === 'HelicalDrill' ? 'Drill' : toolpath.operation,
                secondaryMeta: [getToolpathDepthLabel(toolpath)].filter(Boolean),
                visible: toolpath.visible,
                pending: toolpath.pending === true,
                itemClass: 'sidebar-toolpath-item ms-4'
            }));
        });

        fragment.appendChild(orphanContainer);
    }

    section.replaceChildren(fragment);
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }

    if (typeof window.schedule3DViewRefresh === 'function') {
        window.schedule3DViewRefresh({ preserveProgress: true, resetIfMissing: true });
    }
}

function removeSvgPath(id) {
    refreshToolPathsDisplay();
}

function removeToolPath(id) {
    refreshToolPathsDisplay();
}

function clearSvgPaths() {
    const section = document.getElementById('svg-paths-section');
    if (section) section.replaceChildren();
}

function clearToolPaths() {
    const section = document.getElementById('svg-paths-section');
    if (section) section.replaceChildren();
}

function selectSidebarNode(id) {
    setTimeout(() => {
        const item = document.querySelector(`[data-path-id="${id}"]`);
        if (item) {
            document.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            const group = item.closest('.sidebar-object-group');
            if (group) {
                const header = group.querySelector('.sidebar-object-header');
                if (header && header !== item) header.classList.add('selected');
            }

            const collapse = item.closest('.collapse');
            if (collapse) collapse.classList.add('show');
            syncGroupedToolSelection();
        }
    }, 100);
}

function unselectSidebarNode(id) {
    if (id) {
        const item = document.querySelector(`[data-path-id="${id}"]`);
        if (item) {
            item.classList.remove('selected');
            const group = item.closest('.sidebar-object-group');
            if (group) {
                const selectedChildren = group.querySelectorAll('.sidebar-tree-leaf.selected');
                if (selectedChildren.length === 0) {
                    const header = group.querySelector('.sidebar-object-header');
                    if (header) header.classList.remove('selected');
                }
            }
        }
    } else {
        document.querySelectorAll('.sidebar-item.selected').forEach(el => el.classList.remove('selected'));
    }
}

function syncToolGroupSelection(groupSelector, itemSelector, headerSelector) {
    const group = document.querySelector(groupSelector);
    if (!group) return;

    const children = group.querySelectorAll(itemSelector);
    const hasSelectedChild = Array.from(children).some(item => item.classList.contains('selected'));
    const groupHeader = group.querySelector(headerSelector);

    if (groupHeader) {
        groupHeader.classList.toggle('selected', hasSelectedChild);
    }
}

function syncGroupedToolSelection() {
    const drawToolsList = document.getElementById('draw-tools-list');
    if (!drawToolsList) return;

    const selectedOperation = drawToolsList.querySelector('.sidebar-item.selected[data-operation]');
    const selectedOperationName = selectedOperation ? selectedOperation.dataset.operation : null;

    drawToolsList.querySelectorAll('.sidebar-item.selected[data-operation]').forEach(item => {
        if (item.dataset.operation !== selectedOperationName) {
            item.classList.remove('selected');
        }
    });
}

function ensureMachiningOperationsInSidebar() {
    const machiningOperations = [
        { name: 'Drill', icon: 'circle-plus', tooltip: 'Drill holes at selected points', displayName: 'Drill' },
        { name: 'Profile', icon: 'circle', tooltip: 'Cut inside or outside the selected path', displayName: 'Profile' },
        { name: 'Pocket', icon: 'target', tooltip: 'Remove material inside the path', displayName: 'Pocket' },
        { name: 'VCarve', icon: 'star', tooltip: 'V-carve inside or outside the path', displayName: 'V-Carve' }
    ];

    machiningOperations.forEach(operation => {
        if (!document.querySelector(`#draw-tools-list [data-operation="${operation.name}"]`)) {
            addOperation(operation.name, operation.icon, operation.tooltip, operation.displayName);
        }
    });
}

// Compatibility function for operation manager
function addOperation(name, icon, tooltip, displayName = name) {

    const hiddenOperations = ['Move', 'Edit', 'Boolean', 'Pattern', 'Offset', 'Text', 'Shape'];
    const machiningOperations = ['Drill', 'Profile', 'Pocket', 'VCarve'];

    if (hiddenOperations.includes(name)) {
        return;
    }

    if (icon != null) {
        const drawToolsList = document.getElementById('draw-tools-list');
        if (!drawToolsList) return;

        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.dataset.operation = name;
        item.dataset.bsToggle = 'tooltip';
        item.dataset.bsPlacement = 'right';
        item.title = tooltip;
        if ((window.SHAPE_TOOL_NAMES || []).includes(name)) {
            item.dataset.shapeOperation = 'true';
        }
        if (machiningOperations.includes(name)) {
            item.dataset.machiningOperation = 'true';
        }
        item.appendChild(createBootstrapLayoutIconNode(icon));

        const label = document.createElement('span');
        label.textContent = displayName;
        item.appendChild(label);

        if ((window.SHAPE_TOOL_NAMES || []).includes(name)) {
            item.dataset.autoCreateShape = 'true';
        }

        const tabsItem = drawToolsList.querySelector('[data-operation="Tabs"]');
        if (machiningOperations.includes(name) && tabsItem) {
            if (!drawToolsList.querySelector('[data-machining-operation][data-shape-tools-separator]')) {
                item.dataset.shapeToolsSeparator = 'true';
            }
            let insertAfter = tabsItem;
            while (insertAfter.nextElementSibling?.dataset?.machiningOperation === 'true') {
                insertAfter = insertAfter.nextElementSibling;
            }
            insertAfter.insertAdjacentElement('afterend', item);
        } else {
            drawToolsList.appendChild(item);
        }

        if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }
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
    if (name.includes('Right triangle')) return 'triangle';
    if (name.includes('Half circle')) return 'circle';
    if (name.includes('Right Triangle')) return 'triangle';
    if (name.includes('Half Circle')) return 'circle';
    if (name.includes('Triangle')) return 'triangle';
    if (name.includes('Square')) return 'square';
    if (name.includes('Circle')) return 'circle';
    if (name.includes('Ellipse')) return 'ellipse';
    if (name.includes('RoundRect')) return 'squircle';
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
    if (name.includes('Closed')) return 'vector-square';
    return 'route';
}

function updatePathVisibilityIcon(id, visible) {
    refreshToolPathsDisplay();
}

function toggleSidebarItemVisibility(toggleButton) {
    if (!toggleButton) return;

    const toggleType = toggleButton.dataset.visibilityToggle;
    if (toggleType === 'path') {
        const pathId = toggleButton.dataset.pathId;
        if (!pathId) return;

        const path = svgpaths.find(item => item.id === pathId) || toolpaths.find(item => item.id === pathId);
        if (!path) return;

        setVisibility(pathId, path.visible === false);
        return;
    }

    if (toggleType !== 'group') return;

    const groupHeader = toggleButton.closest('.sidebar-object-header');
    if (!groupHeader) return;

    if (groupHeader.dataset.textGroupHeader) {
        const groupPaths = svgpaths.filter(path => path.textGroupId === groupHeader.dataset.textGroupHeader);
        if (groupPaths.length === 0) return;
        const nextVisible = groupPaths.some(path => path.visible === false);
        setGroupVisibility(svgpaths, 'textGroupId', groupHeader.dataset.textGroupHeader, nextVisible, 'path(s)');
        return;
    }

    if (groupHeader.dataset.patternGroupHeader) {
        const groupPaths = svgpaths.filter(path => path.patternGroupId === groupHeader.dataset.patternGroupHeader);
        if (groupPaths.length === 0) return;
        const nextVisible = groupPaths.some(path => path.visible === false);
        setGroupVisibility(svgpaths, 'patternGroupId', groupHeader.dataset.patternGroupHeader, nextVisible, 'path(s)');
        return;
    }

    if (groupHeader.dataset.svgGroupHeader) {
        const groupPaths = svgpaths.filter(path => path.svgGroupId === groupHeader.dataset.svgGroupHeader);
        if (groupPaths.length === 0) return;
        const nextVisible = groupPaths.some(path => path.visible === false);
        setGroupVisibility(svgpaths, 'svgGroupId', groupHeader.dataset.svgGroupHeader, nextVisible, 'path(s)');
        return;
    }

    const pathId = groupHeader.dataset.pathId;
    if (!pathId) return;

    const path = svgpaths.find(item => item.id === pathId);
    if (!path) return;

    setVisibility(pathId, path.visible === false);
}

function getOperationIcon(operation) {
    switch (operation) {
        case 'Outside': return 'circle';
        case 'Inside': return 'circle-dot';
        case 'Center': return 'circle-dashed';
        case 'Pocket': return 'target';
        case 'VCarve In': return 'astroid';
        case 'VCarve Out': return 'star';
        case 'VCarve': return 'star';
        case 'VCarve Center': return 'sparkle';
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

function getDefaultGridSizeMM(useInches) {
    const imperial = typeof useInches === 'boolean'
        ? useInches
        : !!getOption('Inches');
    return imperial ? (MM_PER_INCH / 2) : 10;
}

function syncGridSizeToDisplayUnits() {
    const nextGridSize = getDefaultGridSizeMM();
    setOption('gridSize', nextGridSize);

    if (typeof window.updateGridSize3D === 'function') {
        window.updateGridSize3D(nextGridSize);
    }
}

function convertDisplayDimensionValue(value, toInches) {
    if (value === null || value === undefined || value === '') return value;
    const numericValue = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(numericValue)) return value;

    const converted = toInches
        ? Math.round((numericValue / MM_PER_INCH) * 1000) / 1000
        : Math.round(numericValue * MM_PER_INCH * 1000) / 1000;

    return converted;
}

function convertPathEditUnits(toInches) {
    const pathEdit = window.cncController?.operationManager?.getOperation('Edit');
    if (!pathEdit || pathEdit.lastRadiusValue === undefined) return;

    pathEdit.lastRadiusValue = String(convertDisplayDimensionValue(pathEdit.lastRadiusValue, toInches));
}

function refreshVisibleDimensionInputs() {
    document.querySelectorAll('input[data-dimension-input="true"]').forEach(input => {
        if (!input || !input.offsetParent) return;
        try {
            const parsed = parseDimension(input.value);
            if (!Number.isFinite(parsed)) return;
            input.value = formatDimension(parsed, true);
        } catch (error) {
            // Ignore fields that are not dimension inputs.
        }
    });
}

function updateCanvasUnitToggleUI() {
    const toggle = document.getElementById('canvas-unit-toggle');
    if (!toggle) return;

    const useInches = !!getOption('Inches');
    toggle.querySelectorAll('.canvas-unit-toggle-button').forEach(button => {
        const isActive = button.dataset.unit === (useInches ? 'in' : 'mm');
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function refreshDisplayUnitsUI() {
    updateCanvasUnitToggleUI();

    if (typeof updateToolTableHeaders === 'function') {
        updateToolTableHeaders();
    }
    if (typeof renderToolsTable === 'function') {
        renderToolsTable();
    }
    if (typeof createWorkpiecePanel === 'function' && document.getElementById('workpiece-panel')) {
        createWorkpiecePanel('workpiece-panel');
    }
    refreshVisibleDimensionInputs();

    redraw();
}

function setDisplayUnits(useInches) {
    const nextValue = !!useInches;
    const currentValue = !!getOption('Inches');
    if (nextValue === currentValue) {
        updateCanvasUnitToggleUI();
        return;
    }

    setOption('Inches', nextValue);
    syncGridSizeToDisplayUnits();
    convertPathEditUnits(nextValue);
    refreshDisplayUnitsUI();
}

window.setDisplayUnits = setDisplayUnits;

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
}

// Compatibility object for grid operations
window.grid = {
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
        toastContainer.className = 'toast-container position-fixed bottom-0 start-50 translate-middle-x p-3';
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
    const canvasLayout = document.getElementById('canvasTabContent');
    const canvasSplitter = document.getElementById('canvas-splitter');

    function notifyWorkspaceResize() {
        if (typeof updateCanvasCenter === 'function') {
            updateCanvasCenter();
            if (typeof redraw === 'function') {
                redraw();
            }
        }

        if (typeof window.requestThreeRender === 'function') {
            window.requestThreeRender();
        }
    }

    function initializeCanvasSplitter() {
        if (!canvasLayout || !canvasSplitter) {
            return;
        }

        const SPLITTER_SIZE = 12;
        const MIN_PANE_SIZE = 260;
        const STACK_BREAKPOINT = 1100;
        let isDragging = false;
        let activePointerId = null;

        function isStackedLayout() {
            return window.innerWidth <= STACK_BREAKPOINT;
        }

        function clampRatio(rawRatio, availableSize) {
            if (availableSize <= MIN_PANE_SIZE * 2) {
                return 0.5;
            }

            const minRatio = MIN_PANE_SIZE / availableSize;
            const maxRatio = 1 - minRatio;
            return Math.min(maxRatio, Math.max(minRatio, rawRatio));
        }

        function setSplitterRatio(rawRatio) {
            const rect = canvasLayout.getBoundingClientRect();
            const stacked = isStackedLayout();
            const totalSize = stacked ? rect.height : rect.width;
            const availableSize = totalSize - SPLITTER_SIZE;
            const ratio = clampRatio(rawRatio, availableSize);

            canvasLayout.dataset.splitRatio = String(ratio);
            canvasSplitter.setAttribute('aria-orientation', stacked ? 'horizontal' : 'vertical');
            canvasSplitter.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));

            if (stacked) {
                canvasLayout.style.gridTemplateColumns = '1fr';
                canvasLayout.style.gridTemplateRows = `minmax(${MIN_PANE_SIZE}px, ${ratio}fr) ${SPLITTER_SIZE}px minmax(${MIN_PANE_SIZE}px, ${1 - ratio}fr)`;
            } else {
                canvasLayout.style.gridTemplateRows = '';
                canvasLayout.style.gridTemplateColumns = `minmax(${MIN_PANE_SIZE}px, ${ratio}fr) ${SPLITTER_SIZE}px minmax(${MIN_PANE_SIZE}px, ${1 - ratio}fr)`;
            }
        }

        function applyRatioFromPointer(clientX, clientY) {
            const rect = canvasLayout.getBoundingClientRect();
            const stacked = isStackedLayout();
            const position = stacked ? (clientY - rect.top) : (clientX - rect.left);
            const availableSize = (stacked ? rect.height : rect.width) - SPLITTER_SIZE;

            if (availableSize <= 0) {
                return;
            }

            setSplitterRatio(position / availableSize);
            notifyWorkspaceResize();
        }

        function stopDragging(event) {
            if (!isDragging || (event && event.pointerId !== activePointerId)) {
                return;
            }

            if (event && canvasSplitter.hasPointerCapture && canvasSplitter.hasPointerCapture(event.pointerId)) {
                canvasSplitter.releasePointerCapture(event.pointerId);
            }

            isDragging = false;
            activePointerId = null;
            canvasSplitter.classList.remove('is-dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            notifyWorkspaceResize();
        }

        canvasSplitter.addEventListener('pointerdown', function (event) {
            isDragging = true;
            activePointerId = event.pointerId;
            canvasSplitter.classList.add('is-dragging');
            canvasSplitter.setPointerCapture(event.pointerId);
            document.body.style.cursor = isStackedLayout() ? 'row-resize' : 'col-resize';
            document.body.style.userSelect = 'none';
            event.preventDefault();
        });

        canvasSplitter.addEventListener('pointermove', function (event) {
            if (!isDragging || event.pointerId !== activePointerId) {
                return;
            }

            applyRatioFromPointer(event.clientX, event.clientY);
            event.preventDefault();
        });

        canvasSplitter.addEventListener('pointerup', stopDragging);
        canvasSplitter.addEventListener('pointercancel', stopDragging);

        canvasSplitter.addEventListener('keydown', function (event) {
            const stacked = isStackedLayout();
            const step = event.shiftKey ? 0.08 : 0.04;
            const currentRatio = Number(canvasLayout.dataset.splitRatio || '0.575');
            let nextRatio = currentRatio;

            if ((!stacked && event.key === 'ArrowLeft') || (stacked && event.key === 'ArrowUp')) {
                nextRatio -= step;
            } else if ((!stacked && event.key === 'ArrowRight') || (stacked && event.key === 'ArrowDown')) {
                nextRatio += step;
            } else if (event.key === 'Home') {
                nextRatio = 0.5;
            } else if (event.key === 'End') {
                nextRatio = 0.7;
            } else {
                return;
            }

            setSplitterRatio(nextRatio);
            notifyWorkspaceResize();
            event.preventDefault();
        });

        setSplitterRatio(Number(canvasLayout.dataset.splitRatio || '0.575'));

        window.addEventListener('resize', function () {
            setSplitterRatio(Number(canvasLayout.dataset.splitRatio || '0.575'));
        });
    }

    initializeCanvasSplitter();

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
            const minWidth = 101;
            const maxWidth = window.innerWidth * 0.5;

            if (newWidth >= minWidth && newWidth <= maxWidth) {
                sidebar.style.width = newWidth + 'px';
                updateSidebarCompactMode();
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
