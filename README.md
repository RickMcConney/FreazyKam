# Maslow CAM

<p align="center">
  <img src="icons/logo.svg" alt="Maslow CAM Logo" width="200">
</p>

**[Launch Maslow CAM](https://iarchi.github.io/MaslowCAM/)**

Free and easy browser-based CAM for CNC machines. Turn your designs into G-code — no software to install, no accounts, no cost. Import SVGs, set up your project, and export G-code ready for your router.

**Your Data is Safe**: Everything runs locally in your browser. No files are uploaded anywhere.

## Quick Start

1. **Open Maslow CAM** - Click the link above (no installation needed)
2. **Set up your workpiece** - Enter dimensions and choose your wood species
3. **Add your design** - Import an SVG or draw directly in the browser
4. **Create toolpaths** - Choose your operation (profile, pocket)
5. **Export** - Save the G-code file for your CNC machine

Everything runs in your browser. Your files never leave your computer.

## Features

### Design Tools
- **SVG Import** - Load designs from Illustrator, Inkscape, or any vector editor
- **Drawing Tools** - Freehand pen, geometric shapes, and text with font support
- **Tabs** - Add holding tabs for profile cuts to prevent parts from moving

### CNC Operations
- **Profile Cuts** - Inside, outside, or center-line cuts along design edges
- **Pocket Cuts** - Adaptive contour/raster clearing with island support
- **Drilling** - Standard and helical drilling operations

### Visualization & Simulation
- **2D/3D Canvas** - Real-time view of design and toolpaths on your workpiece
- **3D Simulation** - Watch a material removal simulation before cutting
- **Playback Controls** - Play, pause, speed up, and step through the simulation

### Tools & Materials
- **Tool Library** - End mills, ball nose, V-bits, and drills with persistent settings
- **Material Database** - Automatic feed/speed calculation for common woods
- **G-code Profiles** - Configurable post-processor profiles for different CNC controllers

### Workpiece Setup
- **Dimensions** - Width, length, and thickness in mm or inches
- **Origin Point** - Configurable origin (corners, center, edges)

## Getting Started

### Using MaslowCAM Online (Easiest)

Just click here: **[Launch MaslowCAM](https://iarchi.github.io/MaslowCAM/)**

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
- Click the "Cut settings" button in the bottom right panel
- Enter your stock dimensions (width, length, thickness)
- Choose your material
- Leave parameters to AUTO to let the app decides the best settings

**Step 2: Create or Import Your Design**
- **Import**: Click "Import SVG" to load a vector design
- **Draw**: Use the pen, shapes or text tools to create directly

**Step 3: Set Up Your Tools**
- Add your CNC bits with diameter, speeds, and feeds in the tools tab

**Step 4: Create Toolpaths**
- Select your design on the canvas
- Choose the operation (Profile, Pocket, V-Carve, Inlay, Drill, etc.)
- Adjust depth, stepover, and other settings
- For inlay: select pocketing tool and finishing tool (V-bit for sharp features, end mill for rounded)

**Step 5: Check Your Work**
- Switch to the simulation view to watch the cutting simulation
- Use playback controls to review

**Step 6: Export**
- Save the G-code file
- Load it into your CNC controller

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

This project is open source (CC BY-NC 4.0). Please check the repository for specific license terms.
