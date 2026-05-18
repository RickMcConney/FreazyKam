# Maslow CAM

<p align="center">
  <img src="icons/logo.svg" alt="Maslow CAM Logo" width="200">
</p>

**[Launch Maslow CAM](https://iarchi.github.io/MaslowCAM/)**

Free and easy browser-based CAM for CNC machines. Turn your designs into G-code — no software to install, no accounts, no cost. Import SVGs, set up your project, and export G-code ready for your router.

## Quick Start

1. **Open Maslow CAM** - Click the link above (no installation needed)
2. **Set up your workpiece** - Enter dimensions and choose your wood species
3. **Add your design** - Import an SVG or draw directly in the browser
4. **Create toolpaths** - Choose your operation (profile, pocket, V-carve, inlay, etc.)
5. **Export** - Save the G-code file for your CNC machine

Everything runs in your browser. Your files never leave your computer.

## Features

### Design Tools
- **SVG Import** - Load designs from Illustrator, Inkscape, or any vector editor
- **Drawing Tools** - Freehand pen, geometric shapes, and text with font support
- **AI Design** - Generate SVG designs with Google Gemini AI integration
- **Parametric Shapes** - Create precise geometric patterns with Maker.js

### CNC Operations
- **Profile Cuts** - Inside, outside, or center-line cuts along design edges
- **Pocket Cuts** - Adaptive contour/raster clearing with island support
- **V-Carving** - Decorative engraving with variable-depth V-bit cuts
- **V-Bit Inlay** - Sharp-feature-preserving inlay with V-bit socket and plug generation
- **End Mill Inlay** - Traditional inlay with rounded corners for end mill finishing
- **Drilling** - Standard and helical drilling operations
- **Surfacing** - Flatten your workpiece stock
- **3D Profiling** - Surface-following cuts from imported STL models

### V-Bit Inlay
The V-bit inlay mode preserves sharp design features that end mill inlay cannot reach:
- Uses the inscribed circle (V-carve) algorithm to compute variable-depth toolpaths along design edges
- **Socket (female)**: V-bit profiles inside the design boundary, end mill roughs the flat bottom
- **Plug (male)**: V-bit profiles outside the design boundary with clearance offset, end mill clears surrounding material
- Narrow features (star points, serifs) are handled automatically — the V-bit depth adapts to the local geometry
- Configurable clearance, glue gap, and optional plug cutout

### Visualization & Simulation
- **2D Canvas** - Real-time view of design and toolpaths on your workpiece
- **3D Simulation** - Watch a voxel-based material removal simulation before cutting
- **Playback Controls** - Play, pause, speed up, and step through the simulation

### Tools & Materials
- **Tool Library** - End mills, ball nose, V-bits, and drills with persistent settings
- **Wood Species Database** - Automatic feed/speed calculation for common woods
- **G-code Profiles** - Configurable post-processor profiles for different CNC controllers

### Workpiece Setup
- **Dimensions** - Width, length, and thickness in mm or inches
- **Origin Point** - Configurable origin (corners, center, edges)
- **Tab Support** - Holding tabs for profile cuts to prevent parts from moving

## Getting Started

### Using Maslow CAM Online (Easiest)

Just click here: **[Launch FreazMaslow CAMyKam](https://iarchi.github.io/MaslowCAM/)**

Works in any modern browser (Chrome, Firefox, Safari, Edge). No installation needed.

### Running Locally

```bash
# Clone the repository
git clone https://github.com/iarchi/MaslowCAM.git
cd toGcode

# Start a local web server (required for ES6 modules)
python -m http.server 8000
# OR
npx http-server

# Open http://localhost:8000
```

### Step-by-Step Workflow

**Step 1: Set Up Your Workpiece**
- Click the "Workpiece" button in the left panel
- Enter your stock dimensions (width, length, thickness)
- Choose your wood species
- Pick your origin point

**Step 2: Create or Import Your Design**
- **Import**: Click "Import SVG" to load a vector design
- **Draw**: Use the pen, shapes, or text tools to create directly

**Step 3: Set Up Your Tools**
- Add your CNC bits with diameter, speeds, and feeds in the tools tab

**Step 4: Create Toolpaths**
- Select your design on the canvas
- Choose the operation (Profile, Pocket, V-Carve, Inlay, Drill, etc.)
- Adjust depth, stepover, and other settings
- For inlay: select pocketing tool and finishing tool (V-bit for sharp features, end mill for rounded)

**Step 5: Check Your Work**
- Switch to the 3D tab to watch the cutting simulation
- Use playback controls to review

**Step 6: Export**
- Click export and save the G-code file
- Load it into your CNC controller

## Limitations

- Very large or complex designs may slow down the browser
- 2.5D cuts (no full 3D sculptural machining beyond STL surface following)
- G-code settings may need adjustment for your specific CNC machine

## Notes

**Feed Rate Limits**: Automatic feed rate calculation caps at 1000 mm/min by default. Adjust in options or set speeds manually per tool.

**Your Data is Safe**: Everything runs locally in your browser. No files are uploaded anywhere.

## Contributing

This project welcomes contributions:

- Feature implementations and bug fixes
- Testing with different SVG sources, CNC machines, and browsers
- Post-processor profiles for additional CNC controllers
- Bug reports with reproduction steps
- Feature requests with use case descriptions

## Support

- **Issues**: [GitHub Issues](https://github.com/iarchi/MaslowCAM/issues)
- **Discussions**: [GitHub Discussions](https://github.com/iarchi/MaslowCAM/discussions)

## License

This project is open source. Please check the repository for specific license terms.

---

*Maslow CAM - Free and easy CAM for makers, woodworkers, and hobbyists*
