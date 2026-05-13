# toGcode Technical Documentation

This document contains technical information about toGcode's architecture, development, and code structure. For user-facing documentation, see [README.md](README.md).

## Architecture Overview

### Core Technologies

- **Frontend**: Vanilla JavaScript with HTML5 Canvas
- **3D Graphics**: Three.js v0.181.0 (local ES6 modules) for 3D visualization and simulation
- **UI Framework**: Bootstrap 5 with responsive layout
- **Geometry**: Paper.js for SVG parsing and geometric operations
- **Path Operations**: ClipperJS for offsetting and boolean operations
- **Parametric Shapes**: Maker.js for generating geometric primitives
- **Typography**: OpenType.js for font handling
- **AI Integration**: Google Gemini API for text-to-SVG generation
- **Icons**: Lucide icon system
- **Storage**: Browser localStorage for project persistence

### Operation System Pattern

The application uses an **object-oriented operation system** where each tool/mode (Select, Pen, Text, Transform, etc.) is a class that extends `Operation.js`:

```javascript
class MyOperation extends Operation {
    constructor() {
        super('MyOperation', 'icon-class');
    }

    // Lifecycle hooks
    start() { /* Called when operation becomes active */ }
    stop() { /* Called when operation deactivates */ }

    // Mouse event handlers 
    onMouseDown(canvas, evt) { }
    onMouseMove(canvas, evt) { }
    onMouseUp(canvas, evt) { }

    // Canvas drawing (called every frame)
    draw(ctx) { }

    // Properties panel (see below)
    getPropertiesHTML() { }
    getEditPropertiesHTML(path) { }  // For editable objects only
    onPropertiesChanged(data) { }
}
```

**Registration & Lifecycle:**
- All operations registered in `CncController.js` constructor
- `OperationManager.js` handles operation switching and event routing
- Only one operation active at a time
- Mouse events automatically routed to active operation

**Location:** `js/operations/` directory

**Available Operations:**
- **Drawing Tools**: Select, Transform, PathEdit, Pen, Polygon, Shape, Text, Drill
- **Configuration Tools**: Workpiece, Origin, Pan
- **Advanced Tools**: Boolean (path operations), Gemini (AI SVG generation)

### Properties Panel System

Operations can define **two types of property editors**:

1. **Creation Properties** - `getPropertiesHTML()`
   - Shown when the operation/tool is active
   - Used for configuring NEW objects before creation
   - Example: Text tool shows font/size inputs before placing text

2. **Edit Properties** - `getEditPropertiesHTML(path)`
   - Shown when selecting an EXISTING path to edit
   - Only implemented for operations that create editable objects (Text, Polygon)
   - Receives the path object with `creationProperties` to populate form

**Key Pattern:**
```javascript
// In Text.js
const AVAILABLE_FONTS = [
    { value: 'fonts/Roboto-Regular.ttf', label: 'Roboto' },
    // ...
];

getPropertiesHTML() {
    return `<select>${AVAILABLE_FONTS.map(f =>
        `<option value="${f.value}">${f.label}</option>`
    ).join('')}</select>`;
}

getEditPropertiesHTML(path) {
    // Same structure, populated from path.creationProperties
    return `<select>${AVAILABLE_FONTS.map(f =>
        `<option value="${f.value}"
         ${path.creationProperties.font === f.value ? 'selected' : ''}>
         ${f.label}</option>`
    ).join('')}</select>`;
}
```

**Editable Objects Store Creation Context:**
```javascript
svgPath = {
    id: 'Text123',
    path: [...points],
    creationTool: 'Text',  // Which operation created this
    creationProperties: {   // Original creation parameters
        text: 'Hello',
        font: 'fonts/Roboto-Regular.ttf',
        fontSize: 20,
        position: { x: 100, y: 100 }
    }
}
```

### Coordinate System

**Multiple coordinate spaces** are used throughout:

1. **Screen Coordinates** - Canvas pixel coordinates (0,0 at top-left)
2. **World Coordinates** - Internal scaled coordinates for computation
3. **MM Coordinates** - Real-world millimeters for display/export

**Key Constants:**
```javascript
viewScale = 10          // World units per mm (10 means 1mm = 10 world units)
svgscale = viewScale * 25.4 / pixelsPerInch  // SVG import scaling
```

**Coordinate Conversion Functions:**
```javascript
worldToScreen(x, y)  // World → Screen (for drawing)
screenToWorld(x, y)  // Screen → World (for mouse input)
toMM(x, y)          // World → MM (for display/export)
```

**Important:**
- Mouse events in operations receive screen coordinates use var mouse = this.normalizeEvent(canvas, evt); to convert to internal
- Canvas drawing uses **screen coordinates** (convert via `worldToScreen()`)
- G-code export uses **MM coordinates** (convert via `toMM()`)
- SVG import scaling handles different DPI assumptions (Adobe Illustrator vs Inkscape)

### Global State Management

**Primary Data Structures:**
```javascript
svgpaths[]   // Imported/created SVG paths
             // { id, name, path: [{x,y}...], bbox, selected, visible,
             //   creationTool, creationProperties }

toolpaths[]  // Generated CNC toolpaths
             // { id, name, path: [{x,y}...], depth, tool, operation }

tools[]      // Tool library (stored in localStorage)
             // { name, diameter, feed, zfeed, depth, step, stepover, bit }

options[]    // Application settings (stored in localStorage)
             // { workpieceWidth, workpieceLength, gridSize, showGrid, etc. }
```

**Undo System:**
- Snapshots stored in `undoList[]` as serialized JSON
- `addUndo(clearRedo, paths, toolpaths)` creates snapshot
- Captures svgpaths, toolpaths, tools, options state

**Persistence:**
- Tools and options automatically saved to localStorage on changes
- Project state can be saved/loaded via "Save/Load Project" buttons
- No server-side storage - everything is client-side

### Data Flow

1. **Import**: SVG files imported and parsed into internal path format using Paper.js
2. **Storage**: Paths stored in `svgpaths[]` array with selection, visibility, and bounding box data
3. **Configuration**: Workpiece dimensions and origin position stored in global `options[]` array
4. **Tool Selection**: Active tool selected from `tools[]` library with material-specific parameters
5. **Operation**: CNC operations generate toolpaths using ClipperJS for tool radius compensation
6. **Optimization**: Toolpaths optimized using Lighten algorithm and stored in `toolpaths[]` array
7. **Export**: G-code generated from toolpaths with proper feed rates, depths, and tool changes
8. **Persistence**: Project state (paths, toolpaths, tools, options) saved to browser localStorage

### Design Patterns

- **Operation System**: Object-oriented operation classes with inheritance
- **Event-Driven**: CncController manages mouse events and operation lifecycle
- **Properties Panel**: Dynamic UI generation from operation properties
- **State Management**: Global state with undo stack (serialized JSON snapshots)
- **Responsive Layout**: Bootstrap grid with resizable panels

## Project Structure

```
toGcode/
├── index.html                      # Main application entry point
├── css/
│   └── app.css                     # Application styles and theming
├── js/
│   ├── cnc.js                      # Core CNC logic and toolpath generation
│   ├── bootstrap-layout.js         # Bootstrap 5 UI layout and components
│   ├── vcarve.js                   # V-carve algorithms and optimization
│   ├── CncController.js            # Main controller and event orchestration
│   ├── ToolPropertiesEditor.js     # Dynamic properties panel system
│   ├── StepWiseHelpSystem.js       # Contextual help system
│   ├── 3dView.js                   # 3D visualization with Three.js
│   ├── voxels/                     # Voxel-based material removal system
│   │   ├── VoxelGrid.js            # Height-map voxel grid renderer
│   │   └── VoxelMaterialRemover.js # Tool-specific cutting calculations
│   ├── operations/                 # Operation implementations
│   │   ├── Operation.js            # Base operation class
│   │   ├── Select.js               # Selection tool
│   │   ├── Workpiece.js            # Workpiece configuration
│   │   ├── Origin.js               # Origin setting tool
│   │   ├── Pan.js                  # Pan/navigation tool
│   │   ├── Transform.js            # Transform operations
│   │   ├── Pen.js                  # Freehand drawing
│   │   ├── Shape.js                # Parametric shape library
│   │   ├── Text.js                 # Text tool
│   │   ├── Drill.js                # Drilling operations
│   │   ├── PathEdit.js             # Path control point editing
│   │   ├── Boolean.js              # Boolean operations
│   │   ├── Gemini.js               # AI SVG generation
│   │   └── OperationManager.js     # Operation lifecycle manager
│   ├── simplify.js                 # Path simplification
│   ├── clipperf.js                 # ClipperJS wrapper
│   ├── maker.js                    # Maker.js parametric shapes
│   ├── paper-full.js               # Paper.js library
│   ├── opentype.js                 # OpenType font library
│   ├── lucide.js                   # Lucide icon library
│   ├── three.module.js             # Three.js main module (local ES6)
│   └── three.core.js               # Three.js core implementation (local ES6)
├── icons/                          # Application icons
└── svg/                            # Sample SVG files for testing
```

## Key Components

### Core CNC Logic
- `js/cnc.js` - Core CNC logic and toolpath generation

### UI & Layout
- `js/bootstrap-layout.js` - Bootstrap 5 UI implementation and layout management
- `js/CncController.js` - Main controller orchestrating operations and UI
- `js/ToolPropertiesEditor.js` - Dynamic properties panel system
- `js/StepWiseHelpSystem.js` - Contextual help and guidance system

### V-Carving
- `js/vcarve.js` - V-carve specific algorithms and optimization

### 3D Visualization
- `js/3dView.js` - 3D visualization engine with Three.js integration
  - `ToolpathAnimation` - Orchestrates cutting simulation and playback
  - `WorkpieceManager` - 3D workpiece rendering and material preview
  - `ToolpathVisualizer` - Renders toolpath visualization in 3D

### Voxel System
- `js/voxels/VoxelGrid.js` - 2D height-map voxel grid with instance rendering
- `js/voxels/VoxelMaterialRemover.js` - Tool-specific material removal calculations

### Operations
- `js/operations/Operation.js` - Base operation class
- `js/operations/OperationManager.js` - Operation lifecycle and event handling
- `js/operations/Select.js` - Selection and manipulation tool
- `js/operations/Transform.js` - Move, rotate, scale operations
- `js/operations/PathEdit.js` - Control point editing
- `js/operations/Workpiece.js` - Workpiece configuration interface
- `js/operations/Origin.js` - Origin setting tool
- `js/operations/Pan.js` - Canvas navigation
- `js/operations/Pen.js`, `Shape.js`, `Text.js`, `Drill.js` - Drawing tools
- `js/operations/Boolean.js` - Boolean operations (union, intersection, difference)
- `js/operations/Gemini.js` - AI-powered SVG generation

## 3D Visualization and Voxel System

### Three.js Setup
- Three.js v0.181.0 (latest) is checked into the repository as modular ES6 files:
  - `js/three.module.js` - Main module file (612 KB)
  - `js/three.core.js` - Core implementation (1.3 MB)
- Loaded via import map in `index.html`: `"three": "./js/three.module.js"`
- Import map automatically resolves internal dependencies between the modules
- Pre-built, non-minified ES6 modules - no build process required
- To update Three.js: Download both files from CDN and replace them:
  ```bash
  curl -o js/three.module.js https://cdn.jsdelivr.net/npm/three@VERSION/build/three.module.js
  curl -o js/three.core.js https://cdn.jsdelivr.net/npm/three@VERSION/build/three.core.js
  ```
- Benefits: Fully offline capable, explicit version control, no external CDN dependencies

### Voxel Grid System
- `VoxelGrid.js` - 2D grid of height-map voxels representing material removal
  - Each voxel tracks current cut height (`voxelTopZ`)
  - Instance coloring: material color by default, yellow when being cut
  - Efficient rendering using THREE.InstancedMesh
  - Dynamic height scaling shows material as it's removed during simulation
  - Supports filler boxes for uncut areas to show complete workpiece

### Material Removal Calculations
- `VoxelMaterialRemover.js` - Processes tool movements and updates voxel heights
  - `removeMaterial()` - Main entry point for voxel material removal
  - Calls tool-specific penetration functions based on tool type:
    - `getEndMillPenetration()` - Flat bottom tool
    - `getVBitPenetration()` - V-bit cone geometry (with diameter constraint)
    - `getDrillPenetration()` - Drill bit with plunge checking
  - Updates voxel heights and colors to visualize cutting

### 3D Animation & Simulation
- `ToolpathAnimation` class orchestrates the cutting simulation
  - `loadFromGcode()` - Parse G-code and extract movement timing
  - `update()` - Step through animation based on elapsed time
  - `setProgress()` - Jump to specific point in animation, properly resets voxel colors and heights
  - Support for tool changes during animation via `toolChangesByTime`

### UI Integration
- Simulation controls overlay (unified for both 2D and 3D) via `create3DSimulationControls()` in `bootstrap-layout.js`
- Play/Pause/Stop buttons with proper state management
- Speed slider, progress slider
- Visibility toggles for axes and toolpath visualization

### Key Technical Details
- THREE.Color multiplication with instance colors for material visualization
- Instance matrix updates for voxel height scaling
- `needsUpdate` flags on geometry and color attributes for GPU synchronization
- Tool visualization updates in real-time as animation progresses

## Important Patterns & Conventions

### Adding New Fonts to Text Tool
1. Add font file to `fonts/` directory
2. Update `AVAILABLE_FONTS` array in `js/operations/Text.js`:
   ```javascript
   { value: 'fonts/NewFont.ttf', label: 'Display Name' }
   ```
3. Font automatically appears in both creation and editing dialogs

### Adding New Operations
1. Create class in `js/operations/NewOperation.js` extending `Operation`
2. Implement required methods (`start`, `onMouseDown`, etc.)
3. Register in `CncController.js` constructor:
   ```javascript
   this.operationManager.registerOperation(new NewOperation());
   ```
4. Add script tag in `index.html` (before `CncController.js`):
   ```html
   <script src="js/operations/NewOperation.js"></script>
   ```
5. UI buttons are auto-generated from registered operations

### Working with External APIs
When integrating APIs (like Gemini):
- Store API keys in localStorage, not in code
- Use `localStorage.getItem('key-name')` and `localStorage.setItem('key-name', value)`
- Provide clear UI for key management in properties panel
- Handle async operations with proper loading states
- Parse responses carefully and handle errors gracefully

### Coordinate Transformations
Always use helper functions for coordinate conversion:
- Drawing on canvas? Use `worldToScreen(x, y)`
- Reading mouse position? Already in world coords from `normalizeEvent()`
- Displaying measurements? Use `toMM(x, y)`
- Exporting G-code? Use `toMM(x, y)` and handle Y-axis flip

### Path Selection & Visibility
- `selectMgr` - from Select.js manages selection state
- `path.visible` - Boolean for visibility (eye icon in tree)
- Selection managed by Select/Transform operations
- Tree view updates via `selectSidebarNode(id)` and `deselectAllSidebarNodes()`

### Canvas Drawing
- Always save/restore context: `ctx.save()` ... `ctx.restore()`
- Convert coordinates before drawing: `let screen = worldToScreen(x, y)`
- Redraw triggered by global `redraw()` function
- Operations draw overlays via `draw(ctx)` method (selection boxes, previews, etc.)

### Middle Mouse Button Panning
Built-in canvas panning (not an Operation):
- Implemented directly in `CncController.js` event listeners
- Middle mouse button (button === 1) triggers pan mode
- Updates global `panX` and `panY` variables
- Prevents default browser behavior for middle-click

### Tab System and Overlay Patterns

**Canvas Tab System (2D/3D/Tools views):**
- Main canvas area uses Bootstrap tabs via `#canvasTabs` and `#canvasTabContent`
- Three tabs: 2D View, 3D View, Tools
- CSS: `.tab-pane` elements have `display: none !important` by default, only `.active` tab shows
- **Important:** When selecting tab-panes with `querySelectorAll()`, be specific to avoid selecting both canvas and sidebar tabs:
  - ✅ Use: `document.querySelectorAll('#sidebar-tabs ~ .sidebar-tab-content .tab-pane')`
  - ❌ Avoid: `document.querySelectorAll('.tab-pane')` (matches both canvas and sidebar tabs)

**Simulation Controls Overlay Pattern:**
- `simulation-overlay` containers positioned absolutely at bottom of 2D and 3D views
- Dynamically populated by `create2DSimulationControls()` and `create3DSimulationControls()` functions
- Visibility controlled by canvas tab listeners in `bootstrap-layout.js`:
  - 2D overlay: shown when 2D tab active AND Operations tab active in sidebar
  - 3D overlay: shown when 3D tab active
  - Both hidden when Tools tab active
- Controls use Bootstrap grid layout (`row g-2`, `col-auto`) for responsive horizontal layout

## Help System

**Implementation:** `js/StepWiseHelpSystem.js`

Contextual help that responds to active operation:
- Operation-specific guidance displayed in properties panel
- Step-by-step instructions for complex workflows
- Automatically updates when switching operations
- Integrated via `window.stepWiseHelp` global

## Development Setup

### No Build Process Required
This is a pure client-side JavaScript application with no build step.

### Local Development
```bash
# Clone and navigate to repository
git clone https://github.com/rickmcconney/toGcode.git
cd toGcode

# Start a local web server (required for ES6 modules and CORS)
python -m http.server 8000
# OR
npx http-server

# Open http://localhost:8000 in browser
```

## Common Development Tasks

### Adding Wood Species
Edit `woodSpeciesDatabase` object in `js/bootstrap-layout.js` with material properties:
```javascript
'SpeciesName': {
    color: '#hexcolor',
    density: 0.5,           // relative density
    feedMultiplier: 1.0,    // cutting speed adjustment
    speedMultiplier: 1.0    // spindle speed adjustment
}
```

### Debugging Canvas Issues
- Check browser console for coordinate conversion errors
- Verify `zoomLevel`, `panX`, `panY` values
- Use `worldToScreen()` and `screenToWorld()` helpers
- Test with `redraw()` function manually in console

### Working with 3D Voxel System
When modifying voxel rendering or material removal:
- **Instance color updates**: Always call `setColorAt()` and set `mesh.instanceColor.needsUpdate = true`
- **Height scaling**: Modify `voxelTopZ[index]` and update instance matrix via `setMatrixAt()`, then set `instanceMatrix.needsUpdate = true`
- **Resetting simulation**: Both `voxelGrid.reset()` and `voxelMaterialRemover.reset()` must be called to properly reset heights AND colors
- **Tool-specific penetration**: When adding new tool types, implement penetration function in `VoxelMaterialRemover.js` and add to `removeMaterial()` dispatch logic
- **THREE.js synchronization**: GPU updates require explicit `needsUpdate` flags - missing these will silently fail to show changes
- **Debugging voxel state**: Use `toolpathAnimation.analyzeRemovalPattern()` or `logAllVoxelMappings()` from browser console

## Development Status

### Completed Features
- ✅ SVG import and parsing with multi-software support
- ✅ AI-powered SVG generation via Google Gemini API
- ✅ Complete drawing tools suite (Pen, Polygon, Shape, Text, Drill)
- ✅ Path editing with control point manipulation
- ✅ Boolean operations (union, intersection, difference)
- ✅ Core CNC operations (Inside, Outside, Pocket, Center, V-Carve, Drill)
- ✅ 3D visualization with real-time cutting simulation
  - Voxel-based material removal visualization
  - Tool-specific cutting geometry (End Mill, V-Bit, Drill)
  - Interactive playback controls with variable speed
  - Height-map material preview
- ✅ Comprehensive tool management system
- ✅ Tool library with add/edit/duplicate/delete
- ✅ Material database with 10 wood species properties
- ✅ Auto feed rate calculation
- ✅ Workpiece configuration panel
- ✅ Flexible origin positioning system (9 positions)
- ✅ G-code export with post-processor support
- ✅ Interactive 2D canvas with zoom/pan (mouse wheel + middle button)
- ✅ Interactive 3D visualization with Three.js
- ✅ Snap-to-grid functionality
- ✅ Undo/redo functionality
- ✅ Project save/load with localStorage persistence
- ✅ Bootstrap 5 responsive UI
- ✅ Dynamic properties panel system
- ✅ Contextual help system
- ✅ Resizable UI panels
- ✅ Local Three.js library (v0.181.0) with no external CDN dependencies

### In Progress
- 🔄 Enhanced toolpath optimization algorithms
- 🔄 Improved V-carve performance for complex paths
- 🔄 Additional G-code post-processor profiles

### Planned Features
- 📋 Tab/bridge generation for part hold-down
- 📋 Material database expansion (plastics, metals)
- 📋 Advanced roughing strategies (adaptive clearing)

## Migration Status

The application is migrating from w2ui to Bootstrap 5:
- **Legacy**: `js/layout.js` (w2ui-based, deprecated)
- **Current**: `js/bootstrap-layout.js` (Bootstrap 5, actively developed)
- **Icons**: Migrating from Font Awesome to Lucide

When adding features, use Bootstrap 5 patterns and Lucide icons.
