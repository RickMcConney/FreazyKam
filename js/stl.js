/**
 * STL Import Module
 * Handles STL file import, parsing, positioning, and height map generation.
 * Uses Three.js STLLoader for parsing binary and ASCII STL files.
 */

import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader';

// Global state for STL models
window.stlModels = window.stlModels || [];
window.stlModelId = window.stlModelId || 0;

const stlLoader = new STLLoader();

/**
 * Import an STL file from a File object (called from bootstrap-layout file input handler)
 */
window.importSTLFile = function(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const arrayBuffer = event.target.result;
        try {
            const geometry = stlLoader.parse(arrayBuffer);
            geometry.computeVertexNormals();

            const model = createSTLModel(geometry, file.name);
            positionSTLModel(model);

            // Save undo point before modifying svgpaths
            if (typeof window.addUndo === 'function') {
                window.addUndo(false, true, false);
            }

            window.stlModels.push(model);

            // Add to 3D view
            addSTLMesh3D(model);

            // Generate height map for 2D view
            generateHeightMap(model, 0.5);

            // Create bounding box svgpath so the STL can be selected/moved/scaled
            createSTLBoundingPath(model);

            if (typeof window.redraw === 'function') window.redraw();
        } catch (e) {
            console.error('Failed to parse STL file:', e);
            alert('Failed to parse STL file: ' + e.message);
        }
    };
    reader.readAsArrayBuffer(file);
};

/**
 * Create an STL model object from parsed geometry
 */
function createSTLModel(geometry, filename) {
    const id = 'STL' + (++window.stlModelId);
    const name = filename.replace(/\.stl$/i, '');

    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;

    return {
        id: id,
        name: name,
        geometry: geometry,
        mesh: null,
        heightMap: null,
        bbox3d: {
            min: { x: bb.min.x, y: bb.min.y, z: bb.min.z },
            max: { x: bb.max.x, y: bb.max.y, z: bb.max.z }
        },
        // Transform applied during positioning (in mm)
        transform: { offsetX: 0, offsetY: 0, offsetZ: 0, scale: 1 },
        visible: true,
        selected: false
    };
}

/**
 * Position STL model on the workpiece:
 * - Center XY on workpiece
 * - Place top surface at Z=0 (CNC convention: Z=0 is stock top)
 * - Scale to fit within workpiece if larger
 */
function positionSTLModel(model) {
    const bb = model.bbox3d;
    const stlWidth = bb.max.x - bb.min.x;
    const stlHeight = bb.max.y - bb.min.y;
    const stlDepth = bb.max.z - bb.min.z;

    // Get workpiece dimensions from global options (in mm)
    const getOpt = window.getOption || (() => undefined);
    const wpWidth = getOpt("workpieceWidth") || 200;
    const wpHeight = getOpt("workpieceLength") || 200;
    const wpDepth = getOpt("workpieceThickness") || 20;

    // Scale to fit within workpiece if needed (leave 10% margin)
    let scale = 1;
    const margin = 0.9;
    if (stlWidth > 0 && stlHeight > 0) {
        const scaleX = (wpWidth * margin) / stlWidth;
        const scaleY = (wpHeight * margin) / stlHeight;
        const scaleZ = wpDepth / stlDepth;
        scale = Math.min(scaleX, scaleY, scaleZ, 1); // Don't upscale
    }

    // Center of STL in its original coordinates
    const stlCenterX = (bb.min.x + bb.max.x) / 2;
    const stlCenterY = (bb.min.y + bb.max.y) / 2;

    // Workpiece center (assuming origin at corner, dimensions in mm)
    const wpCenterX = wpWidth / 2;
    const wpCenterY = wpHeight / 2;

    // Offset to center the scaled STL on the workpiece
    // Y is flipped (negated) because STL Y-up → canvas/world Y-down
    const offsetX = wpCenterX - stlCenterX * scale;
    const offsetY = wpCenterY - (-stlCenterY) * scale; // flip Y
    // Place top of STL at Z=0
    const offsetZ = -bb.max.z * scale;

    model.transform = { offsetX, offsetY, offsetZ, scale, scaleY: -scale, scaleZ: scale };

    // Update bounding box to reflect positioned model (with Y flipped)
    const y1 = -bb.max.y * scale + offsetY; // flipped: STL max.y → min in world
    const y2 = -bb.min.y * scale + offsetY; // flipped: STL min.y → max in world
    model.bbox3d = {
        min: {
            x: bb.min.x * scale + offsetX,
            y: Math.min(y1, y2),
            z: bb.min.z * scale + offsetZ
        },
        max: {
            x: bb.max.x * scale + offsetX,
            y: Math.max(y1, y2),
            z: bb.max.z * scale + offsetZ
        }
    };
}

// ============================================================
// SVG Bounding Path — links STL to the existing selection system
// ============================================================

/**
 * Create a bounding box rectangle in svgpaths[] that references the STL model.
 * This allows the STL to be selected, moved, and scaled using existing tools.
 * The svgpath stores the STL model ID in creationProperties.
 */
function createSTLBoundingPath(model) {
    const vs = window.viewScale || 10;
    const bb = model.bbox3d;

    // Create rectangle path in world coordinates (mm * viewScale)
    const x1 = bb.min.x * vs;
    const y1 = bb.min.y * vs;
    const x2 = bb.max.x * vs;
    const y2 = bb.max.y * vs;

    const path = [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 },
        { x: x1, y: y1 }  // Close the path
    ];

    const id = 'STL_' + window.svgpathId;
    const svgPath = {
        id: id,
        type: 'path',
        name: model.name,
        selected: false,
        visible: true,
        path: path,
        bbox: window.boundingBox ? window.boundingBox(path) : { minx: x1, miny: y1, maxx: x2, maxy: y2 },
        creationTool: 'STL',
        creationProperties: {
            stlModelId: model.id
        }
    };

    // Store reference back to the svgpath on the model
    model.svgPathId = id;

    window.svgpaths.push(svgPath);
    if (typeof window.addSvgPath === 'function') {
        window.addSvgPath(id, model.name);
    }
    window.svgpathId++;
}

/**
 * Sync STL model transform from its svgpath bounding box.
 * Called before toolpath generation or 3D mesh update.
 * Derives scale and offset from the current svgpath bbox vs original geometry.
 */
function syncSTLFromSvgPath(model) {
    const vs = window.viewScale || 10;
    const svgPath = window.svgpaths.find(p => p.creationProperties && p.creationProperties.stlModelId === model.id);
    if (!svgPath) return;

    const pathBBox = svgPath.bbox || (window.boundingBox ? window.boundingBox(svgPath.path) : null);
    if (!pathBBox) return;

    // Current svgpath bounds in mm
    const curMinX = pathBBox.minx / vs;
    const curMinY = pathBBox.miny / vs;
    const curMaxX = pathBBox.maxx / vs;
    const curMaxY = pathBBox.maxy / vs;
    const curW = curMaxX - curMinX;
    const curH = curMaxY - curMinY;

    // Original STL geometry bounds (before any transform)
    const geom = model.geometry;
    geom.computeBoundingBox();
    const origBB = geom.boundingBox;
    const origW = origBB.max.x - origBB.min.x;
    const origH = origBB.max.y - origBB.min.y;

    if (origW <= 0 || origH <= 0) return;

    // Derive scale (uniform — use average of X and Y)
    const scaleX = curW / origW;
    const scaleYabs = curH / origH;
    const scale = (scaleX + scaleYabs) / 2;

    // Derive offset: position the STL so its scaled bbox matches the svgpath bbox
    // Y is flipped: STL max.y maps to world min.y (curMinY)
    const offsetX = curMinX - origBB.min.x * scale;
    const offsetY = curMinY - (-origBB.max.y) * scale; // flip: -max.y * scale + offsetY = curMinY

    // Get workpiece thickness for Z positioning
    const getOpt = window.getOption || (() => undefined);
    const wpDepth = getOpt("workpieceThickness") || 20;

    // Cap Z depth to workpiece thickness
    const origDepth = origBB.max.z - origBB.min.z;
    const scaledDepth = origDepth * scale;
    const zScale = scaledDepth > wpDepth ? wpDepth / scaledDepth : 1;
    const effectiveZScale = scale * zScale;
    const offsetZ = -origBB.max.z * effectiveZScale;

    // Update model transform (scaleY is negative to flip Y axis, scaleZ may differ)
    model.transform = { offsetX, offsetY, offsetZ, scale, scaleY: -scale, scaleZ: effectiveZScale };
    model.bbox3d = {
        min: { x: curMinX, y: curMinY, z: origBB.min.z * effectiveZScale + offsetZ },
        max: { x: curMaxX, y: curMaxY, z: origBB.max.z * effectiveZScale + offsetZ }
    };
}

/**
 * Update STL 3D mesh and height map after its svgpath has been moved/scaled.
 */
window.syncSTLModels = function() {
    for (const model of window.stlModels) {
        const oldTransform = JSON.stringify(model.transform);
        syncSTLFromSvgPath(model);
        const newTransform = JSON.stringify(model.transform);

        if (oldTransform !== newTransform) {
            // Transform changed — update 3D mesh and height map
            if (model.mesh && window.threeScene) {
                window.threeScene.remove(model.mesh);
                model.mesh.geometry.dispose();
                model.mesh.material.dispose();
                model.mesh = null;
            }
            addSTLMesh3D(model);
            generateHeightMap(model, 0.5);
        }
    }
};

// ============================================================
// 3D View Integration
// ============================================================

/**
 * Add STL mesh to the Three.js 3D scene.
 * If the scene isn't initialized yet (3D tab not opened), queues for later.
 */
function addSTLMesh3D(model) {
    // The 3D scene is intentionally voxel-only, so STL meshes are not attached.
    if (model) {
        model.mesh = null;
    }
}

/**
 * Show/hide all STL model meshes in the 3D view.
 */
window.setSTLVisibility3D = function(visible) {
    if (typeof window.requestThreeRender === 'function') {
        window.requestThreeRender();
    }
};

/**
 * Add any STL models that were imported before the 3D scene was ready.
 * Called when the 3D tab is first shown.
 */
window.addPendingSTLMeshes = function() {
    return;
};

// Listen for 3D tab activation to add pending meshes
const tab3d = document.getElementById('3d-tab');
if (tab3d) {
    tab3d.addEventListener('shown.bs.tab', () => {
        // Small delay to let initThree() finish setting window.threeScene
        setTimeout(() => {
            if (typeof window.addPendingSTLMeshes === 'function') {
                window.addPendingSTLMeshes();
            }
        }, 100);
    });
}

/**
 * Clear all STL models (called from newProject)
 */
window.clearSTLModels = function() {
    const scene = window.threeScene;
    for (const model of window.stlModels) {
        if (model.mesh && scene) {
            scene.remove(model.mesh);
            model.mesh.geometry.dispose();
            model.mesh.material.dispose();
        }
    }
    window.stlModels = [];
    window.stlModelId = 0;
};

/**
 * Serialize STL models for project save.
 * Stores raw STL binary data as base64 alongside model metadata.
 */
window.saveSTLModels = function() {
    if (!window.stlModels || window.stlModels.length === 0) return null;

    return window.stlModels.map(model => {
        // Extract raw vertex data from BufferGeometry to reconstruct later
        const posAttr = model.geometry.attributes.position;
        const floatArray = new Float32Array(posAttr.array);
        // Convert Float32Array to base64
        const bytes = new Uint8Array(floatArray.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        return {
            id: model.id,
            name: model.name,
            vertexData: base64,
            vertexCount: posAttr.count,
            svgPathId: model.svgPathId,
            transform: model.transform,
            bbox3d: model.bbox3d
        };
    });
};

/**
 * Restore STL models from saved project data.
 * Reconstructs Three.js geometry from base64 vertex data.
 */
window.loadSTLModels = function(savedModels) {
    if (!savedModels || savedModels.length === 0) return;

    for (const saved of savedModels) {
        // Decode base64 back to Float32Array
        const binary = atob(saved.vertexData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const positions = new Float32Array(bytes.buffer);

        // Rebuild BufferGeometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();

        const model = {
            id: saved.id,
            name: saved.name,
            geometry: geometry,
            mesh: null,
            heightMap: null,
            bbox3d: saved.bbox3d,
            transform: saved.transform,
            svgPathId: saved.svgPathId,
            visible: true,
            selected: false
        };

        window.stlModels.push(model);

        // Update stlModelId counter to avoid collisions
        const idNum = parseInt(saved.id.replace('STL', ''), 10);
        if (!isNaN(idNum) && idNum >= window.stlModelId) {
            window.stlModelId = idNum + 1;
        }

        // Add to 3D view
        addSTLMesh3D(model);

        // Generate height map for 2D view
        generateHeightMap(model, 0.5);
    }

    if (typeof window.redraw === 'function') window.redraw();
};

/**
 * Stash for STL models removed by undo, keyed by model ID.
 * Allows redo to restore them without re-parsing the STL file.
 */
const stlUndoStash = {};

/**
 * Reconcile stlModels with current svgpaths state.
 * Removes any STL model whose bounding svgpath no longer exists (e.g. after undo),
 * stashing it so redo can restore it. Re-adds stashed models whose svgpath reappears.
 */
window.syncSTLWithSvgPaths = function() {
    const scene = window.threeScene;
    const currentSvgPaths = window.svgpaths || [];

    // Find STL model IDs referenced by current svgpaths
    const activeStlIds = new Set();
    for (const sp of currentSvgPaths) {
        if (sp.creationProperties && sp.creationProperties.stlModelId) {
            activeStlIds.add(sp.creationProperties.stlModelId);
        }
    }

    // Remove models whose svgpath is gone, stash for redo
    let changed = false;
    for (let i = window.stlModels.length - 1; i >= 0; i--) {
        const model = window.stlModels[i];
        if (!activeStlIds.has(model.id)) {
            // Clean up 3D mesh
            if (model.mesh && scene) {
                scene.remove(model.mesh);
                model.mesh.geometry.dispose();
                model.mesh.material.dispose();
                model.mesh = null;
            }
            // Stash model (keeps geometry and height map) for redo
            stlUndoStash[model.id] = model;
            window.stlModels.splice(i, 1);
            changed = true;
        }
    }

    // Restore stashed models whose svgpath has reappeared (redo)
    for (const stlId of activeStlIds) {
        if (stlUndoStash[stlId] && !window.stlModels.find(m => m.id === stlId)) {
            const model = stlUndoStash[stlId];
            delete stlUndoStash[stlId];
            window.stlModels.push(model);
            // Re-add 3D mesh and regenerate height map
            addSTLMesh3D(model);
            if (!model.heightMap) {
                generateHeightMap(model, 0.5);
            }
            changed = true;
        }
    }

    if (changed) {
        if (typeof window.requestThreeRender === 'function') {
            window.requestThreeRender();
        }
    }
};

/**
 * Fully remove an STL model: 3D mesh, geometry, and height map.
 * Called when the user deletes the STL's svgpath.
 */
window.removeSTLMesh3D = function(modelId) {
    const scene = window.threeScene;
    const model = window.stlModels.find(m => m.id === modelId);
    if (!model) return;

    // Remove 3D mesh
    if (model.mesh && scene) {
        scene.remove(model.mesh);
        model.mesh.geometry.dispose();
        model.mesh.material.dispose();
        model.mesh = null;
    }

    // Dispose geometry and clear height map
    if (model.geometry) {
        model.geometry.dispose();
        model.geometry = null;
    }
    model.heightMap = null;

    if (typeof window.requestThreeRender === 'function') {
        window.requestThreeRender();
    }
};

/**
 * Toggle STL mesh visibility in 3D scene
 */
window.updateSTLMeshVisibility3D = function(modelId, visible) {
    const model = window.stlModels.find(m => m.id === modelId);
    if (model && model.mesh) {
        model.mesh.visible = visible;
        model.visible = visible;
        if (typeof window.requestThreeRender === 'function') {
            window.requestThreeRender();
        }
    }
};

// ============================================================
// Height Map Generation
// ============================================================

/**
 * Generate a height map by rasterizing triangles directly onto a grid.
 * Much faster than raycasting — iterates over triangles and stamps Z values.
 * The height map stores Z values (in mm) for a regular XY grid.
 */
function generateHeightMap(model, resolutionMM) {
    const bb = model.bbox3d;
    const cellSize = resolutionMM || 0.5;

    const width = Math.ceil((bb.max.x - bb.min.x) / cellSize) + 1;
    const height = Math.ceil((bb.max.y - bb.min.y) / cellSize) + 1;
    const data = new Float32Array(width * height);
    data.fill(NaN); // NaN = no surface

    // Get transformed vertex positions
    const geom = model.geometry;
    const pos = geom.attributes.position.array;
    const t = model.transform;
    const sy = t.scaleY !== undefined ? t.scaleY : t.scale; // Y flip support
    const sz = t.scaleZ !== undefined ? t.scaleZ : t.scale; // Z may differ if capped to workpiece
    const triCount = pos.length / 9; // 3 vertices * 3 components, non-indexed

    for (let tri = 0; tri < triCount; tri++) {
        const base = tri * 9;
        // Transform vertices to CNC mm coordinates (Y flipped)
        const v0x = pos[base]     * t.scale + t.offsetX;
        const v0y = pos[base + 1] * sy + t.offsetY;
        const v0z = pos[base + 2] * sz + t.offsetZ;
        const v1x = pos[base + 3] * t.scale + t.offsetX;
        const v1y = pos[base + 4] * sy + t.offsetY;
        const v1z = pos[base + 5] * sz + t.offsetZ;
        const v2x = pos[base + 6] * t.scale + t.offsetX;
        const v2y = pos[base + 7] * sy + t.offsetY;
        const v2z = pos[base + 8] * sz + t.offsetZ;

        // Bounding box of triangle in grid coordinates
        const minIx = Math.max(0, Math.floor((Math.min(v0x, v1x, v2x) - bb.min.x) / cellSize));
        const maxIx = Math.min(width - 1, Math.ceil((Math.max(v0x, v1x, v2x) - bb.min.x) / cellSize));
        const minIy = Math.max(0, Math.floor((Math.min(v0y, v1y, v2y) - bb.min.y) / cellSize));
        const maxIy = Math.min(height - 1, Math.ceil((Math.max(v0y, v1y, v2y) - bb.min.y) / cellSize));

        // Precompute barycentric denominator
        const d00 = v1x - v0x, d01 = v2x - v0x;
        const d10 = v1y - v0y, d11 = v2y - v0y;
        const denom = d00 * d11 - d01 * d10;
        if (Math.abs(denom) < 1e-10) continue; // Degenerate triangle
        const invDenom = 1.0 / denom;

        // Rasterize: for each grid cell in the triangle's bbox, check if inside
        for (let iy = minIy; iy <= maxIy; iy++) {
            const py = bb.min.y + iy * cellSize;
            for (let ix = minIx; ix <= maxIx; ix++) {
                const px = bb.min.x + ix * cellSize;

                // Barycentric coordinates
                const dx = px - v0x, dy = py - v0y;
                const u = (dx * d11 - d01 * dy) * invDenom;
                const v = (d00 * dy - dx * d10) * invDenom;

                if (u >= -0.001 && v >= -0.001 && (u + v) <= 1.001) {
                    // Point is inside triangle — interpolate Z
                    const z = v0z + u * (v1z - v0z) + v * (v2z - v0z);
                    const idx = iy * width + ix;
                    // Keep highest Z (top surface)
                    if (isNaN(data[idx]) || z > data[idx]) {
                        data[idx] = z;
                    }
                }
            }
        }
    }

    model.heightMap = {
        data: data,
        width: width,
        height: height,
        minZ: bb.min.z,
        maxZ: bb.max.z,
        originX: bb.min.x,
        originY: bb.min.y,
        cellSize: cellSize
    };

}

// ============================================================
// 2D View - Height Map Drawing
// ============================================================

/**
 * Draw STL height map as colored overlay on the 2D canvas.
 * Called from redrawCore() in 2dView.js
 */
window.drawSTLHeightMap = function(ctx) {
    if (!window.stlModels) return;

    for (const model of window.stlModels) {
        if (!model.visible || !model.heightMap) continue;

        const hm = model.heightMap;
        const vs = window.viewScale || 10;
        const zl = window.zoomLevel || 1;

        // Draw each height map cell as a colored rectangle
        for (let iy = 0; iy < hm.height; iy++) {
            for (let ix = 0; ix < hm.width; ix++) {
                const z = hm.data[iy * hm.width + ix];
                if (isNaN(z)) continue;

                // Map Z to color: maxZ (surface) = light, minZ (deep) = dark
                const range = hm.maxZ - hm.minZ || 1;
                const t = (z - hm.minZ) / range; // 0=deep, 1=surface

                // Color gradient: dark brown (deep) to light tan (surface)
                const r = Math.round(80 + t * 140);
                const g = Math.round(50 + t * 130);
                const b = Math.round(20 + t * 60);

                // Convert world mm to screen coordinates
                // worldToScreen expects world units (mm * viewScale)
                const worldX = (hm.originX + ix * hm.cellSize) * vs;
                const worldY = (hm.originY + iy * hm.cellSize) * vs;
                const screen = window.worldToScreen(worldX, worldY);
                const cellScreenSize = hm.cellSize * vs * zl;

                ctx.fillStyle = `rgba(${r},${g},${b},0.6)`;
                ctx.fillRect(screen.x, screen.y, Math.max(cellScreenSize, 1), Math.max(cellScreenSize, 1));
            }
        }

        // Draw contour lines
        drawContourLines(ctx, model);
    }
};

/**
 * Draw contour lines at fixed Z intervals on the 2D canvas
 */
function drawContourLines(ctx, model) {
    const hm = model.heightMap;
    if (!hm) return;

    const vs = window.viewScale || 10;
    const range = hm.maxZ - hm.minZ;
    if (range <= 0) return;

    // Draw contours every 1mm of depth
    const interval = Math.max(1, Math.round(range / 10));

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 0.5;

    for (let zLevel = hm.minZ; zLevel <= hm.maxZ; zLevel += interval) {
        for (let iy = 0; iy < hm.height - 1; iy++) {
            for (let ix = 0; ix < hm.width - 1; ix++) {
                const z00 = hm.data[iy * hm.width + ix];
                const z10 = hm.data[iy * hm.width + ix + 1];
                const z01 = hm.data[(iy + 1) * hm.width + ix];
                const z11 = hm.data[(iy + 1) * hm.width + ix + 1];

                // Simple marching squares: check if contour crosses this cell
                if (isNaN(z00) || isNaN(z10) || isNaN(z01) || isNaN(z11)) continue;

                const above00 = z00 >= zLevel;
                const above10 = z10 >= zLevel;
                const above01 = z01 >= zLevel;
                const above11 = z11 >= zLevel;

                // If all same side, no contour here
                if (above00 === above10 && above10 === above01 && above01 === above11) continue;

                // Draw a simple line through the center of the cell
                const cx = hm.originX + (ix + 0.5) * hm.cellSize;
                const cy = hm.originY + (iy + 0.5) * hm.cellSize;
                const screenPos = window.worldToScreen(cx * vs, cy * vs);

                ctx.beginPath();
                ctx.arc(screenPos.x, screenPos.y, 0.5, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }
}

// ============================================================
// 3D Profile Toolpath Generation
// ============================================================

/**
 * Look up the Z height from the height map at a given CNC mm position.
 * Uses bilinear interpolation for smooth results.
 * Returns NaN if outside the height map or no surface data.
 */
function sampleHeightMap(hm, xMM, yMM) {
    const fx = (xMM - hm.originX) / hm.cellSize;
    const fy = (yMM - hm.originY) / hm.cellSize;

    const ix = Math.floor(fx);
    const iy = Math.floor(fy);

    if (ix < 0 || ix >= hm.width - 1 || iy < 0 || iy >= hm.height - 1) return NaN;

    const tx = fx - ix;
    const ty = fy - iy;

    const z00 = hm.data[iy * hm.width + ix];
    const z10 = hm.data[iy * hm.width + ix + 1];
    const z01 = hm.data[(iy + 1) * hm.width + ix];
    const z11 = hm.data[(iy + 1) * hm.width + ix + 1];

    if (isNaN(z00) || isNaN(z10) || isNaN(z01) || isNaN(z11)) return NaN;

    // Bilinear interpolation
    return z00 * (1 - tx) * (1 - ty) + z10 * tx * (1 - ty) +
           z01 * (1 - tx) * ty + z11 * tx * ty;
}

/**
 * Drop cutter algorithm for ball nose bit.
 * For a given (X,Y) position, finds the highest Z the tool center must be at
 * so the ball nose sphere doesn't gouge the surface.
 *
 * The ball nose tip touches at Z_center - R, so we need:
 *   Z_center = max over all (dx,dy) within R of:
 *     heightMap(x+dx, y+dy) + R - sqrt(R^2 - dx^2 - dy^2)
 */
function dropCutter(hm, xMM, yMM, radiusMM) {
    const R = radiusMM;
    const cellSize = hm.cellSize;
    const cellsInRadius = Math.ceil(R / cellSize);
    let maxZc = -Infinity;

    for (let dy = -cellsInRadius; dy <= cellsInRadius; dy++) {
        for (let dx = -cellsInRadius; dx <= cellsInRadius; dx++) {
            const dxMM = dx * cellSize;
            const dyMM = dy * cellSize;
            const distSq = dxMM * dxMM + dyMM * dyMM;
            if (distSq > R * R) continue;

            const surfZ = sampleHeightMap(hm, xMM + dxMM, yMM + dyMM);
            if (isNaN(surfZ)) continue;

            // Ball nose contact: tool center Z = surface Z + R - sqrt(R^2 - dist^2)
            const zc = surfZ + R - Math.sqrt(R * R - distSq);
            if (zc > maxZc) maxZc = zc;
        }
    }

    return maxZc === -Infinity ? NaN : maxZc;
}

// ============================================================
// Contour (Waterline) Toolpath Generation
// ============================================================

/**
 * Slice the STL triangle mesh at a given Z level to find contour loops.
 * Works directly on the 3D triangles (not the height map) so it correctly
 * finds cross-sections at any depth — same approach as 3D printing slicers.
 *
 * Returns an array of closed loops, each loop is an array of {x, y} points in mm.
 */
function extractContourLoops(model, zLevel) {
    const pos = model.geometry.attributes.position.array;
    const t = model.transform;
    const sy = t.scaleY !== undefined ? t.scaleY : t.scale; // Y flip support
    const sz = t.scaleZ !== undefined ? t.scaleZ : t.scale; // Z may differ if capped to workpiece
    const triCount = pos.length / 9;

    // Slightly perturb Z to avoid exact vertex-on-plane degeneracies
    const eps = 1e-6;
    const z = zLevel + eps;

    // Step 1: Find all line segments where triangles intersect the Z plane
    const segments = [];

    for (let tri = 0; tri < triCount; tri++) {
        const base = tri * 9;
        // Transform vertices to CNC mm coordinates (Y flipped)
        const ax = pos[base]     * t.scale + t.offsetX;
        const ay = pos[base + 1] * sy + t.offsetY;
        const az = pos[base + 2] * sz + t.offsetZ;
        const bx = pos[base + 3] * t.scale + t.offsetX;
        const by = pos[base + 4] * sy + t.offsetY;
        const bz = pos[base + 5] * sz + t.offsetZ;
        const cx = pos[base + 6] * t.scale + t.offsetX;
        const cy = pos[base + 7] * sy + t.offsetY;
        const cz = pos[base + 8] * sz + t.offsetZ;

        // Classify vertices relative to the Z plane
        const aAbove = az >= z, bAbove = bz >= z, cAbove = cz >= z;

        // Skip if all on same side
        if (aAbove === bAbove && bAbove === cAbove) continue;

        // Find intersection points on edges that cross the Z plane
        const pts = [];
        const edges = [[ax,ay,az, bx,by,bz], [bx,by,bz, cx,cy,cz], [cx,cy,cz, ax,ay,az]];
        const aboves = [[aAbove, bAbove], [bAbove, cAbove], [cAbove, aAbove]];

        for (let e = 0; e < 3; e++) {
            if (aboves[e][0] !== aboves[e][1]) {
                const [x1,y1,z1, x2,y2,z2] = edges[e];
                const tVal = (z - z1) / (z2 - z1);
                pts.push({
                    x: x1 + tVal * (x2 - x1),
                    y: y1 + tVal * (y2 - y1)
                });
            }
        }

        if (pts.length >= 2) {
            segments.push([pts[0], pts[1]]);
        }
    }

    if (segments.length === 0) {
        console.log('Slice at Z=' + zLevel.toFixed(2) + 'mm: 0 segments');
        return [];
    }

    // Step 2: Chain segments into closed loops by matching endpoints.
    // STL files have non-indexed geometry (duplicated vertices per triangle),
    // so shared edge intersections may not be bitwise identical.
    // Use a coarse spatial grid (~0.01mm) and check neighboring cells.
    const gridSize = 0.01; // mm — coarse enough to absorb STL float imprecision

    function hashKey(x, y) {
        return (Math.round(x / gridSize)) + ',' + (Math.round(y / gridSize));
    }

    // Build adjacency map: gridKey -> [{segIdx, endIdx(0 or 1), x, y}]
    const endpointMap = {};
    for (let i = 0; i < segments.length; i++) {
        for (let e = 0; e < 2; e++) {
            const p = segments[i][e];
            const key = hashKey(p.x, p.y);
            if (!endpointMap[key]) endpointMap[key] = [];
            endpointMap[key].push({ segIdx: i, endIdx: e, x: p.x, y: p.y });
        }
    }

    // Find the closest unvisited matching endpoint, checking neighboring grid cells
    const used = new Uint8Array(segments.length);
    const tolSq = (gridSize * 2) * (gridSize * 2);

    function findNearest(px, py, excludeIdx) {
        const gx = Math.round(px / gridSize);
        const gy = Math.round(py / gridSize);
        let bestDist = tolSq;
        let bestEntry = null;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const key = (gx + dx) + ',' + (gy + dy);
                const bucket = endpointMap[key];
                if (!bucket) continue;
                for (const entry of bucket) {
                    if (entry.segIdx === excludeIdx || used[entry.segIdx]) continue;
                    const ex = entry.x - px, ey = entry.y - py;
                    const d = ex * ex + ey * ey;
                    if (d < bestDist) {
                        bestDist = d;
                        bestEntry = entry;
                    }
                }
            }
        }
        return bestEntry;
    }

    // Trace loops
    const loops = [];

    for (let startIdx = 0; startIdx < segments.length; startIdx++) {
        if (used[startIdx]) continue;

        const loop = [];
        let curIdx = startIdx;
        // Track which end we exit from (always traverse [0] → [1])
        // On first segment, just use it as-is
        let exitPt = null;

        while (true) {
            used[curIdx] = 1;
            const seg = segments[curIdx];

            // Determine traversal direction: the entry point should be close to exitPt
            let p0, p1;
            if (exitPt !== null) {
                const d0x = seg[0].x - exitPt.x, d0y = seg[0].y - exitPt.y;
                const d1x = seg[1].x - exitPt.x, d1y = seg[1].y - exitPt.y;
                if (d0x * d0x + d0y * d0y <= d1x * d1x + d1y * d1y) {
                    p0 = seg[0]; p1 = seg[1]; // enter at [0], exit at [1]
                } else {
                    p0 = seg[1]; p1 = seg[0]; // enter at [1], exit at [0]
                }
            } else {
                p0 = seg[0]; p1 = seg[1];
            }

            loop.push(p1);
            exitPt = p1;

            // Find next segment connected at exitPt
            const next = findNearest(exitPt.x, exitPt.y, curIdx);
            if (!next) break;
            curIdx = next.segIdx;
        }

        if (loop.length >= 3) {
            loops.push(loop);
        }
    }

    return loops;
}

/**
 * Compute bounding box of a 2D loop in mm coordinates.
 */
function loopBBox(loop) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of loop) {
        if (p.x < minx) minx = p.x;
        if (p.y < miny) miny = p.y;
        if (p.x > maxx) maxx = p.x;
        if (p.y > maxy) maxy = p.y;
    }
    return { minx, miny, maxx, maxy };
}

/**
 * Point-in-polygon test (ray casting) for a 2D loop in mm coordinates.
 */
function pointInLoop(px, py, loop) {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const xi = loop[i].x, yi = loop[i].y;
        const xj = loop[j].x, yj = loop[j].y;
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Offset contour loops using ClipperLib (same library used by profile/pocket tools).
 * Takes loops in mm coordinates, converts to world units for Clipper, offsets, converts back.
 *
 * Outer contours (CCW, positive area) are offset outward by +toolRadius so the tool
 * stays outside the part boundary. Inner contours (CW, negative area — carved features)
 * are offset inward by -toolRadius so the tool enters the carved area.
 *
 * Returns array of offset loops (each loop is array of {x, y} in mm).
 */
function offsetContourLoops(loops, offsetMM) {
    const vs = window.viewScale || 10;
    const allResults = [];

    for (const loop of loops) {
        if (loop.length < 3) continue;

        // Convert mm to world coordinates for ClipperLib
        const worldPath = loop.map(p => ({ x: Math.round(p.x * vs), y: Math.round(p.y * vs) }));

        // Determine winding direction via signed area.
        // Note: Y axis is flipped (scaleY < 0) which reverses winding, so:
        //   Negative area = outer boundary → offset outward (+R)
        //   Positive area = inner/carved feature → offset inward (-R)
        const area = ClipperLib.Clipper.Area(worldPath);
        const delta = area < 0 ? offsetMM * vs : -offsetMM * vs;

        const co = new ClipperLib.ClipperOffset(20, 0.25);
        co.AddPath(worldPath, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
        const sol = [];
        co.Execute(sol, delta);

        for (const sp of sol) {
            if (sp.length < 3) continue;
            // Convert back from world to mm
            const mmPath = sp.map(p => ({ x: p.x / vs, y: p.y / vs }));
            // Close the path
            mmPath.push({ x: mmPath[0].x, y: mmPath[0].y });
            allResults.push(mmPath);
        }
    }

    return allResults;
}

/**
 * Generate 3D profile raster toolpaths over the STL surface.
 * Uses the selected svgpath(s) with STL references, or falls back to first visible model.
 * Called from handleOperationClick via window.do3dProfile.
 */
window.do3dProfile = function() {
    const vs = window.viewScale || 10;

    if (typeof Worker === 'undefined') {
        if (typeof window.notify === 'function') window.notify('Web Workers are not supported in this browser', 'error');
        return;
    }

    let model = null;
    let stlSvgPath = null;
    const selectedPaths = window.selectMgr ? window.selectMgr.selectedPaths() : [];
    for (const sp of selectedPaths) {
        if (sp.creationProperties && sp.creationProperties.stlModelId) {
            const m = window.stlModels.find(s => s.id === sp.creationProperties.stlModelId);
            if (m) {
                model = m;
                stlSvgPath = sp;
                break;
            }
        }
    }

    if (!model) {
        if (typeof window.notify === 'function') window.notify('Select an STL path to 3D Profile', 'info');
        return;
    }

    const tool = window.currentTool;
    if (!tool) {
        if (typeof window.notify === 'function') window.notify('No tool selected', 'error');
        return;
    }

    syncSTLFromSvgPath(model);
    generateHeightMap(model, 0.5);

    const hm = model.heightMap;
    if (!hm) {
        if (typeof window.notify === 'function') window.notify('Unable to prepare STL height map', 'error');
        return;
    }

    const props = window.currentToolpathProperties || {};
    const strategy = props.strategy || 'raster';
    const toolDiameter = tool.diameter;
    const toolRadius = toolDiameter / 2;
    const stepoverPct = tool.stepover || props.stepover || 15;
    const stepover = toolDiameter * stepoverPct / 100;
    const angle = props.angle || 0;
    const maxDepth = props.depth || Math.abs(hm.minZ);
    const stepDown = props.step || maxDepth;
    const restToolDiameter = props.restToolDiameter || 0;
    const restToolRadius = restToolDiameter / 2;
    const restTolerance = 0.1;
    const svgId = stlSvgPath ? stlSvgPath.id : null;
    const svgIds = svgId ? [svgId] : [];
    const pendingKey = [
        '3dProfile',
        model.id,
        svgId || 'none',
        strategy,
        tool.recid || tool.name || tool.diameter,
        toolDiameter,
        stepover,
        angle,
        maxDepth,
        stepDown,
        restToolDiameter,
        model.transform.offsetX,
        model.transform.offsetY,
        model.transform.offsetZ,
        model.transform.scale,
        model.transform.scaleY,
        model.transform.scaleZ
    ].join('|');

    const duplicateRequest = toolpaths.some(function(tp) {
        return tp.pending === true && tp.pendingKey === pendingKey;
    });
    if (duplicateRequest) {
        if (typeof window.notify === 'function') window.notify('A 3D Profile generation is already pending for this selection', 'info');
        return;
    }

    const updateTargets = Array.isArray(window.toolpathUpdateTargets)
        ? window.toolpathUpdateTargets.slice()
        : [];
    const pendingToolpaths = [];
    const updateTarget = updateTargets[0] || null;
    if (updateTarget) {
        updateTarget.paths = [];
        updateTarget.visible = true;
        updateTarget.operation = '3dProfile';
        updateTarget.name = '3dProfile';
        updateTarget.tool = { ...tool };
        updateTarget.svgId = svgId;
        updateTarget.svgIds = svgIds.slice();
        updateTarget.pending = true;
        updateTarget.pendingKey = pendingKey;
        if (window.currentToolpathProperties) {
            updateTarget.toolpathProperties = sanitizeToolpathProperties(window.currentToolpathProperties) || {};
            setToolpathLabel(updateTarget, getToolpathPropertyName(window.currentToolpathProperties));
        }
        pendingToolpaths.push(updateTarget);
    } else {
        pendingToolpaths.push(makePendingToolpath(svgIds.slice(), '3dProfile', '3dProfile', pendingKey, {
            svgId: svgId,
            svgIds: svgIds.slice(),
            tool: { ...tool }
        }));
    }
    if (typeof refreshToolPathsDisplay === 'function') refreshToolPathsDisplay();
    if (typeof window.redraw === 'function') window.redraw();

    const worker = new Worker('js/workers/3dProfileWorker.js');
    registerGenerationWorker('profile3d', worker);
    console.log('3D ProfileWorker: queued', {
        pendingKey,
        strategy,
        modelId: model.id,
        svgId,
        toolDiameter,
        stepover,
        angle,
        maxDepth,
        stepDown,
        restToolDiameter
    });
    if (typeof window.notify === 'function') window.notify('Generating 3D Profile paths…', 'info');

    function clearPendingToolpaths() {
        removePendingToolpaths(pendingToolpaths);
    }

    worker.onmessage = function(event) {
        if (!isGenerationWorkerActive('profile3d', worker)) {
            worker.terminate();
            return;
        }

        if (event.data && event.data.log) {
            console.log(event.data.message, event.data.details || '');
            return;
        }

        unregisterGenerationWorker('profile3d', worker);
        worker.terminate();

        if (!event.data || !event.data.ok) {
            clearPendingToolpaths();
            if (typeof window.notify === 'function') {
                window.notify((event.data && event.data.error) || 'Unable to generate 3D Profile paths', 'error');
            }
            return;
        }

        const result = event.data.result || { toolpaths: [], createdCount: 0 };
		for (let i = 0; i < result.toolpaths.length && i < pendingToolpaths.length; i++) {
			const generated = result.toolpaths[i];
			const pendingToolpath = pendingToolpaths[i];
			pendingToolpath.paths = generated.paths;
			pendingToolpath.operation = generated.operation;
			pendingToolpath.displayOperation = generated.displayOperation || generated.operation;
			pendingToolpath.name = generated.name;
			pendingToolpath.svgId = generated.svgId;
            pendingToolpath.svgIds = generated.svgIds;
            pendingToolpath.pending = false;
            delete pendingToolpath.pendingKey;
        }
        for (let i = result.toolpaths.length; i < pendingToolpaths.length; i++) {
            const index = toolpaths.indexOf(pendingToolpaths[i]);
            if (index >= 0) toolpaths.splice(index, 1);
        }
        if (typeof refreshToolPathsDisplay === 'function') refreshToolPathsDisplay();
        if (typeof window.redraw === 'function') window.redraw();

        if (result.createdCount === 0) {
            if (typeof window.notify === 'function') {
                window.notify(strategy === 'contour'
                    ? 'No contour toolpath generated — check STL model and tool settings'
                    : 'No toolpath generated — check STL model and tool settings', 'error');
            }
            return;
        }

        console.log('3D ProfileWorker: completed', {
            pendingKey,
            createdCount: result.createdCount,
            toolpathCount: result.toolpaths.length
        });
    };

    worker.onerror = function(error) {
        unregisterGenerationWorker('profile3d', worker);
        worker.terminate();
        clearPendingToolpaths();
        if (typeof window.notify === 'function') {
            window.notify((error && error.message) || '3D Profile generation failed', 'error');
        }
    };

    worker.postMessage({
        strategy: strategy,
        viewScale: vs,
        toolDiameter: toolDiameter,
        toolRadius: toolRadius,
        stepover: stepover,
        angle: angle,
        maxDepth: maxDepth,
        stepDown: stepDown,
        restToolDiameter: restToolDiameter,
        restToolRadius: restToolRadius,
        restTolerance: restTolerance,
        svgId: svgId,
        svgIds: svgIds.slice(),
        heightMap: {
            originX: hm.originX,
            originY: hm.originY,
            cellSize: hm.cellSize,
            width: hm.width,
            height: hm.height,
            minZ: hm.minZ,
            maxZ: hm.maxZ,
            data: Array.from(hm.data)
        },
        model: {
            id: model.id,
            bbox3d: {
                min: { ...model.bbox3d.min },
                max: { ...model.bbox3d.max }
            },
            transform: { ...model.transform },
            geometryPositions: Array.from(model.geometry.attributes.position.array)
        }
    });
};
