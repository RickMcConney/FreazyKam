// G-code viewer panel: replaces the sidebar tabs with a virtualized
// G-code listing while a simulation is running, then restores the
// previously-active sidebar tab on hide.
// Extracted from js/bootstrap-layout.js. Loaded as a global-scope script
// (no ES6 modules) — see CLAUDE.md for the script-order constraint.
//
// `gcodeView` is read by 2dSimulation.js and 3dView.js via
// `typeof gcodeView !== 'undefined'` guards, so it must remain a global.

// Global GcodeView instance and state
var gcodeView = null;
var previousActiveSidebarTab = null;

// Initialize G-code View
function initializeGcodeView() {
    // Create GcodeView instance
    gcodeView = new GcodeView('gcode-viewer-container');

    // Initially hide the G-code viewer
    const viewer = document.getElementById('gcode-viewer');
    if (viewer) {
        viewer.style.display = 'none';
    }
}

// Show G-code viewer and hide current sidebar tabs
function showGcodeViewerPanel() {
    if (!gcodeView) return;

    // Save the currently active sidebar tab
    previousActiveSidebarTab = document.querySelector('#sidebar-tabs .nav-link.active');

    // Hide the sidebar tab navigation and content
    const sidebarTabs = document.getElementById('sidebar-tabs');
    if (sidebarTabs) {
        sidebarTabs.style.display = 'none';
    }

    const sidebarContent = document.getElementById('sidebar-content');
    if (sidebarContent) {
        sidebarContent.style.display = 'none';
    }

    // Show the G-code viewer
    const viewer = document.getElementById('gcode-viewer');
    if (viewer) {
        viewer.style.display = '';
        viewer.style.visibility = 'visible';
        viewer.style.height = '';
        viewer.style.overflow = '';
        viewer.classList.add('h-100');
    }

    gcodeView.show();
}

// Hide G-code viewer and restore previous sidebar tab
function hideGcodeViewerPanel() {
    if (!gcodeView) return;

    gcodeView.clear();

    // Hide the G-code viewer
    const viewer = document.getElementById('gcode-viewer');
    if (viewer) {
        viewer.classList.remove('h-100');
        viewer.style.display = 'none';
        viewer.style.visibility = 'hidden';
        viewer.style.height = '0';
        viewer.style.overflow = 'hidden';
    }

    // Show the sidebar tab navigation and content
    const sidebarTabs = document.getElementById('sidebar-tabs');
    if (sidebarTabs) {
        sidebarTabs.style.display = '';
    }

    const sidebarContent = document.getElementById('sidebar-content');
    if (sidebarContent) {
        sidebarContent.style.display = '';
    }

    // Restore the previous active tab
    if (previousActiveSidebarTab) {
        const bootstrapTab = new bootstrap.Tab(previousActiveSidebarTab);
        bootstrapTab.show();
    }
}
