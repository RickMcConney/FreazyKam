// G-code post-processor profile management.
// Persists profiles to localStorage and renders the profile selector
// + post-processor form in the sidebar.
// Extracted from js/bootstrap-layout.js. Loaded as a global-scope script
// (no ES6 modules) — see CLAUDE.md for the script-order constraint.
//
// `gcodeProfiles` and `currentGcodeProfile` are read by gcode.js,
// 2dSimulation.js, 3dView.js and cnc.js, so they must remain globals.
// `populateGcodeProfileSelector` is also called from cnc.js after a
// project load.

var gcodeProfiles = [];
var currentGcodeProfile = null;

// Load G-code profiles from localStorage
function loadGcodeProfiles() {
    var profileData = localStorage.getItem('gcodeProfiles');
    if (profileData) {
        gcodeProfiles = JSON.parse(profileData);
    } else {
        // Initialize with default profiles
        gcodeProfiles = [
            {
                recid: 1,
                name: 'GRBL',
                startGcode: 'G0 G54 G17 G21 G90 G94',
                endGcode: 'G0 Z5\nG0 X0 Y0',
                toolChangeGcode: 'M5\nG0 Z5\n(Tool Change)\nM0',
                rapidTemplate: 'G0 X Y Z F',
                cutTemplate: 'G1 X Y Z F',
                spindleOnGcode: 'M3 S',
                spindleOffGcode: 'M5',
                cwArcTemplate: 'G2 X Y I J F',
                ccwArcTemplate: 'G3 X Y I J F',
                useArcs: true,
                commentChar: '(',
                commentsEnabled: true,
                gcodeUnits: 'mm'  // 'mm' or 'inches'
            },
            {
                recid: 2,
                name: 'FluidNC',
                startGcode: 'G0 G54 G17 G21 G90 G94',
                endGcode: 'G0 Z5\nG0 X0 Y0',
                toolChangeGcode: 'M5\nG0 Z5\n(Tool Change)\nM0',
                rapidTemplate: 'G0 X Y Z F',
                cutTemplate: 'G1 X Y Z F',
                spindleOnGcode: 'M3 S',
                spindleOffGcode: 'M5',
                cwArcTemplate: 'G2 X Y I J F',
                ccwArcTemplate: 'G3 X Y I J F',
                useArcs: true,
                commentChar: '(',
                commentsEnabled: true,
                gcodeUnits: 'mm'  // 'mm' or 'inches'
            }
        ];
    }

    if (gcodeProfiles.length > 0) {
        currentGcodeProfile = gcodeProfiles[0];
    }
}

// Save G-code profiles to localStorage
function saveGcodeProfiles() {
    localStorage.setItem('gcodeProfiles', JSON.stringify(gcodeProfiles));
}

function initializeGcodeProfilesUI() {
    populateGcodeProfileSelector();

    // Add event listeners
    document.getElementById('gcode-profile-select').addEventListener('change', loadSelectedGcodeProfile);
    document.getElementById('new-gcode-profile').addEventListener('click', createNewGcodeProfile);
    document.getElementById('delete-gcode-profile').addEventListener('click', deleteCurrentGcodeProfile);
    document.getElementById('save-gcode-profile').addEventListener('click', saveCurrentGcodeProfile);

}

// Populate the G-code profile selector dropdown
function populateGcodeProfileSelector() {
    const select = document.getElementById('gcode-profile-select');
    select.innerHTML = '';

    gcodeProfiles.forEach((profile, index) => {
        const option = document.createElement('option');
        option.value = profile.recid;
        option.textContent = profile.name;
        if (currentGcodeProfile && profile.recid === currentGcodeProfile.recid) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    // Render fields and load the current profile into the form
    if (currentGcodeProfile) {
        renderPostProcessorForm(currentGcodeProfile);
        updateGcodeSectionTitle(currentGcodeProfile.name);
    }
}

// Render the post processor form fields via PropertiesManager
function renderPostProcessorForm(profile) {
    const container = document.getElementById('gcode-profile-fields');
    if (container) {
        container.innerHTML = window.toolPathProperties.getPostProcessorHTML(profile);
    }
}

// Update the G-code section title with the current profile name
function updateGcodeSectionTitle(profileName) {
    const titleElement = document.getElementById('gcode-section-title');
    if (titleElement) {
        titleElement.textContent = profileName || 'G-code Post Processor';
    }
}

// Load selected profile from dropdown
function loadSelectedGcodeProfile() {
    const select = document.getElementById('gcode-profile-select');
    const profileId = parseInt(select.value);
    const profile = gcodeProfiles.find(p => p.recid === profileId);

    if (profile) {
        currentGcodeProfile = profile;
        renderPostProcessorForm(profile);
        updateGcodeSectionTitle(profile.name);
    }
}

// Create a new G-code profile
function createNewGcodeProfile() {
    // Show the modal
    const modalElement = document.getElementById('profileNameModal');
    const modal = new bootstrap.Modal(modalElement);
    const input = document.getElementById('profile-name-input');
    const confirmBtn = document.getElementById('confirm-profile-name');

    // Reset input state
    input.value = 'New Profile';
    input.classList.remove('is-invalid');

    // Focus input when modal is shown
    modalElement.addEventListener('shown.bs.modal', function () {
        input.select();
    }, { once: true });

    // Handle Enter key in input
    const handleEnter = function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        }
    };

    // Handle confirm button click
    const handleConfirm = function () {
        const name = input.value.trim();

        if (!name) {
            input.classList.add('is-invalid');
            document.getElementById('profile-name-error').textContent = 'Profile name is required';
            return;
        }

        // Check if name already exists
        if (gcodeProfiles.some(p => p.name === name)) {
            input.classList.add('is-invalid');
            document.getElementById('profile-name-error').textContent = 'A profile with this name already exists';
            return;
        }

        // Create new profile based on current one or defaults
        const newProfile = {
            recid: freeGcodeProfileId(),
            name: name,
            startGcode: currentGcodeProfile ? currentGcodeProfile.startGcode : 'G0 G54 G17 G21 G90 G94',
            gcodeUnits: currentGcodeProfile ? (currentGcodeProfile.gcodeUnits || 'mm') : 'mm',
            endGcode: currentGcodeProfile ? currentGcodeProfile.endGcode : 'M5\nG0 Z5',
            toolChangeGcode: currentGcodeProfile ? currentGcodeProfile.toolChangeGcode : 'M5\nG0 Z5\n(Tool Change)\nM0',
            rapidTemplate: currentGcodeProfile ? currentGcodeProfile.rapidTemplate : 'G0 X Y Z F',
            cutTemplate: currentGcodeProfile ? currentGcodeProfile.cutTemplate : 'G1 X Y Z F',
            spindleOnGcode: currentGcodeProfile ? currentGcodeProfile.spindleOnGcode : 'M3 S',
            spindleOffGcode: currentGcodeProfile ? currentGcodeProfile.spindleOffGcode : 'M5',
            cwArcTemplate: currentGcodeProfile ? (currentGcodeProfile.cwArcTemplate || 'G2 X Y I J F') : 'G2 X Y I J F',
            ccwArcTemplate: currentGcodeProfile ? (currentGcodeProfile.ccwArcTemplate || 'G3 X Y I J F') : 'G3 X Y I J F',
            useArcs: currentGcodeProfile ? (currentGcodeProfile.useArcs !== false) : true,
            commentChar: currentGcodeProfile ? currentGcodeProfile.commentChar : '(',
            commentsEnabled: currentGcodeProfile ? currentGcodeProfile.commentsEnabled : true
        };

        gcodeProfiles.push(newProfile);
        currentGcodeProfile = newProfile;
        saveGcodeProfiles();
        populateGcodeProfileSelector();
        updateGcodeSectionTitle(newProfile.name);
        notify('Profile created successfully', 'success');

        // Clean up event listeners
        input.removeEventListener('keypress', handleEnter);
        confirmBtn.removeEventListener('click', handleConfirm);

        modal.hide();
    };

    // Add event listeners - removed from any previous modal invocation
    input.removeEventListener('keypress', handleEnter);
    confirmBtn.removeEventListener('click', handleConfirm);

    input.addEventListener('keypress', handleEnter);
    confirmBtn.addEventListener('click', handleConfirm);

    // Clean up when modal is hidden
    modalElement.addEventListener('hidden.bs.modal', function () {
        input.removeEventListener('keypress', handleEnter);
        confirmBtn.removeEventListener('click', handleConfirm);
    }, { once: true });

    modal.show();
}

// Delete the current G-code profile
function deleteCurrentGcodeProfile() {
    if (gcodeProfiles.length <= 1) {
        notify('Cannot delete the last profile', 'error');
        return;
    }

    // Show the confirmation modal
    const modal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    const profileNameSpan = document.getElementById('delete-profile-name');
    const confirmBtn = document.getElementById('confirm-delete-profile');

    // Set the profile name in the modal
    profileNameSpan.textContent = currentGcodeProfile.name;

    // Handle confirm button click
    const handleConfirm = function () {
        const index = gcodeProfiles.findIndex(p => p.recid === currentGcodeProfile.recid);
        if (index >= 0) {
            gcodeProfiles.splice(index, 1);
            currentGcodeProfile = gcodeProfiles[0];
            saveGcodeProfiles();
            populateGcodeProfileSelector();
            updateGcodeSectionTitle(currentGcodeProfile.name);
            notify('Profile deleted successfully', 'success');
        }

        // Clean up event listener
        confirmBtn.removeEventListener('click', handleConfirm);

        modal.hide();
    };

    confirmBtn.addEventListener('click', handleConfirm, { once: true });

    modal.show();
}

// Save the current profile
function saveCurrentGcodeProfile() {
    if (!currentGcodeProfile) return;

    // Collect form values via PropertiesManager
    const data = window.toolPathProperties.collectPostProcessorData();
    Object.assign(currentGcodeProfile, data);

    saveGcodeProfiles();
    notify('Profile saved successfully', 'success');
}

// Get a free profile ID
function freeGcodeProfileId() {
    let id = 1;
    while (gcodeProfiles.find(p => p.recid === id)) {
        id++;
    }
    return id;
}
