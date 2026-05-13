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
var gcodeViewerPanelRefs = null;

function ensureGcodeViewerPanelRefs() {
    if (
        gcodeViewerPanelRefs &&
        gcodeViewerPanelRefs.viewer &&
        gcodeViewerPanelRefs.sidebarTabs &&
        gcodeViewerPanelRefs.sidebarContent &&
        gcodeViewerPanelRefs.viewer.isConnected &&
        gcodeViewerPanelRefs.sidebarTabs.isConnected &&
        gcodeViewerPanelRefs.sidebarContent.isConnected
    ) {
        return gcodeViewerPanelRefs;
    }

    gcodeViewerPanelRefs = {
        viewer: document.getElementById('gcode-viewer'),
        sidebarTabs: document.getElementById('sidebar-tabs'),
        sidebarContent: document.getElementById('sidebar-content')
    };

    return gcodeViewerPanelRefs;
}

// Initialize G-code View
function initializeGcodeView() {
    // Create GcodeView instance
    gcodeView = new GcodeView('gcode-viewer-container');

    // Initially hide the G-code viewer
    const refs = ensureGcodeViewerPanelRefs();
    const viewer = refs.viewer;
    if (viewer) {
        viewer.style.display = 'none';
        viewer.style.visibility = 'hidden';
        viewer.style.height = '0';
        viewer.style.overflow = 'hidden';
        viewer.classList.remove('h-100');
    }
}

// Show G-code viewer and hide current sidebar tabs
function showGcodeViewerPanel() {
    if (!gcodeView) return;

    const refs = ensureGcodeViewerPanelRefs();

    // Save the currently active sidebar tab
    previousActiveSidebarTab = document.querySelector('#sidebar-tabs .nav-link.active');

    // Hide the sidebar tab navigation and content
    const sidebarTabs = refs.sidebarTabs;
    if (sidebarTabs) {
        sidebarTabs.style.display = 'none';
    }

    const sidebarContent = refs.sidebarContent;
    if (sidebarContent) {
        sidebarContent.style.display = 'none';
    }

    // Show the G-code viewer
    const viewer = refs.viewer;
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

    const refs = ensureGcodeViewerPanelRefs();

    gcodeView.clear();

    // Hide the G-code viewer
    const viewer = refs.viewer;
    if (viewer) {
        viewer.classList.remove('h-100');
        viewer.style.display = 'none';
        viewer.style.visibility = 'hidden';
        viewer.style.height = '0';
        viewer.style.overflow = 'hidden';
    }

    // Show the sidebar tab navigation and content
    const sidebarTabs = refs.sidebarTabs;
    if (sidebarTabs) {
        sidebarTabs.style.display = '';
    }

    const sidebarContent = refs.sidebarContent;
    if (sidebarContent) {
        sidebarContent.style.display = '';
    }

    // Restore the previous active tab
    if (previousActiveSidebarTab) {
        const bootstrapTab = new bootstrap.Tab(previousActiveSidebarTab);
        bootstrapTab.show();
    }
}
