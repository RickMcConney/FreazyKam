/**
 * QuadtreeVoxelGrid - Adaptive voxel grid using a quadtree for sparse material removal.
 *
 * Coarse 8mm cells cover areas with no toolpath; fine cells (matching the requested
 * voxelSize) are placed only where the tool actually cuts.  Drop-in API replacement
 * for VoxelGrid.  Key differences from VoxelGrid:
 *   - Call buildFromMovements() once after construction, before adding to the scene.
 *   - voxelSize property reflects the finest cell size (for external step-distance calc).
 *   - Per-instance flat colour instead of per-vertex colours (no top/side distinction).
 */

import * as THREE from '../lib/three.module.js';

const COARSE_CELL_SIZE = 64;   // mm – mandatory coarse grid pitch
const MAX_FINE_DEPTH = 9;   // cap tree depth inside a coarse cell

// ── QuadTreeNode ────────────────────────────────────────────────────────────

class QuadTreeNode {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.children = null;  // null ⟹ leaf
    this.leafIndex = -1;    // assigned during flatten pass
  }

  get cx() { return this.x + this.w * 0.5; }
  get cy() { return this.y + this.h * 0.5; }
  get isLeaf() { return this.children === null; }

  subdivide() {
    const hw = this.w * 0.5, hh = this.h * 0.5;
    this.children = [
      new QuadTreeNode(this.x, this.y, hw, hh),
      new QuadTreeNode(this.x + hw, this.y, hw, hh),
      new QuadTreeNode(this.x, this.y + hh, hw, hh),
      new QuadTreeNode(this.x + hw, this.y + hh, hw, hh),
    ];
  }

  // Fast AABB-square intersection
  intersectsSquare(cx, cy, r) {
    const { x, y, w, h } = this;

    // Check if point is outside the rectangle's bounds
    return !(
      cx + r < x ||
      cx - r > x + w ||
      cy + r < y ||
      cy - r > y + h
    );
  }

  // Fast AABB-circle intersection
  intersectsCircle(cx, cy, rsq) {
    const { x, y, w, h } = this; // Local stack access is fastest
    let nx = cx;
    let ny = cy;

    if (nx < x) nx = x;
    else if (nx > x + w) nx = x + w;

    if (ny < y) ny = y;
    else if (ny > y + h) ny = y + h;

    const dx = cx - nx;
    const dy = cy - ny;

    return (dx * dx + dy * dy) <= rsq;
  }
}

// ── QuadtreeVoxelGrid ────────────────────────────────────────────────────────

class QuadtreeVoxelGrid {
  /**
   * @param {number} workpieceWidth     - Width (X) of the region in mm
   * @param {number} workpieceLength    - Length (Y) of the region in mm
   * @param {number} workpieceThickness - Thickness (Z) in mm
   * @param {number} voxelSize          - Target fine cell size in mm (matched as closely as possible)
   * @param {THREE.Vector3} originOffset - Centre of region in world space
   * @param {number|string} workpieceColor - Hex colour for uncut wood
   */
  constructor(
    workpieceWidth, workpieceLength, workpieceThickness,
    voxelSize = 1.0,
    originOffset = new THREE.Vector3(),
    workpieceColor = 0x8B6914
  ) {
    this.workpieceWidth = workpieceWidth;
    this.workpieceLength = workpieceLength;
    this.workpieceThickness = workpieceThickness;
    this.originOffset = originOffset;
    this.workpieceColor = workpieceColor;
    this.materialBottomZ = -workpieceThickness;

    // Compute fine-cell depth so that leaf size ≈ voxelSize
    const idealDepth = Math.round(Math.log2(COARSE_CELL_SIZE / Math.max(voxelSize, 0.05)));
    this._maxFineDepth = Math.min(MAX_FINE_DEPTH, Math.max(1, idealDepth));
    this.minCellSize = COARSE_CELL_SIZE / Math.pow(2, this._maxFineDepth);

    // Expose as voxelSize so external code (step-distance calc) works unchanged
    this.voxelSize = this.minCellSize;

    this.root = new QuadTreeNode(
      originOffset.x - workpieceWidth / 2,
      originOffset.y - workpieceLength / 2,
      workpieceWidth,
      workpieceLength
    );

    this.leaves = [];
    this.voxelTopZ = null;
    this.voxelHeightChanged = new Set();
    this.mesh = null;


    // gridWidth / gridLength exposed so external profiling code (3dView.js ~line 997) works.
    // Before buildFromMovements these are the raw input dimensions; after, they reflect the
    // actual leaf count via a synthetic product (gridWidth=leaves.length, gridLength=1).
    this.gridWidth = Math.ceil(workpieceWidth / this.voxelSize);
    this.gridLength = Math.ceil(workpieceLength / this.voxelSize);
  }

  /**
   * Analyse toolpath movements and build the adaptive quadtree.
   * Must be called once after construction, before the mesh is added to the scene.
   *
   * @param {Array}  movementTiming - Array of {x,y,z,isG1,toolRadius,...} from ToolpathAnimation
   * @param {number} maxToolRadius  - Fallback radius for moves without a toolRadius annotation (mm)
   */
  buildFromMovements(movementTiming, maxToolRadius = 3) {
    // Group cutting moves by their per-move tool radius so each section of the
    // toolpath is sampled at the correct density for that tool.
    // Moves annotated with move.toolRadius (set by 3dView before calling this)
    // use that radius; unannotated moves fall back to maxToolRadius.
    const radiusGroups = new Map();  // Map<radius, flat [x,y,...] array>
    let prevX = null, prevY = null, prevR = null;

    for (const move of movementTiming) {
      if (move.isG1 && move.z <= 0.001) {
        const r = move.toolRadius || maxToolRadius;
        if (!radiusGroups.has(r)) radiusGroups.set(r, []);
        const pts = radiusGroups.get(r);
        const sampleStep = r;

        if (prevX !== null && prevR === r) {
          // Same tool — sample at this tool's radius interval so adjacent
          // circles of radius r overlap and cover the full swept area.
          const dx = move.x - prevX, dy = move.y - prevY;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < sampleStep) {
            pts.push(move.x, move.y);
          } else {
            const steps = Math.ceil(len / sampleStep);
            for (let i = 0; i <= steps; i++) {
              const t = i / steps;
              pts.push(prevX + dx * t, prevY + dy * t);
            }
          }
        } else {
          // Start of new path segment or tool change — add endpoint only.
          pts.push(move.x, move.y);
        }
        prevX = move.x;
        prevY = move.y;
        prevR = r;
      } else {
        // Rapid (G0) or non-cutting move: break path continuity
        prevX = null;
        prevY = null;
        prevR = null;
      }
    }

    // Each group uses its own radius as the subdivision buffer so the fine zone
    // matches the actual tool envelope for that section of the toolpath.
    // (No single subdivisionRadius — each _subdivide call uses the group's r.)

    const t0 = performance.now();

    // Pre-limit fine depth before any recursion.
    // For full-coverage toolpaths (e.g. surfacing) _subdivide will try to subdivide every
    // coarse cell all the way to _maxFineDepth, allocating numCoarseCells * 4^depth
    // QuadTreeNode objects in one shot — easily tens of millions for a large workpiece,
    // which freezes the browser before the rebuild loop below can scale back.
    // Capping depth here so the worst-case leaf count stays under MAX_VOXELS prevents
    // runaway allocation on the very first attempt.
    {
      const numCoarseX = Math.ceil(this.workpieceWidth / COARSE_CELL_SIZE);
      const numCoarseY = Math.ceil(this.workpieceLength / COARSE_CELL_SIZE);
      const numCoarseCells = numCoarseX * numCoarseY;
      const maxSafeDepth = Math.max(1, Math.floor(
        Math.log(QuadtreeVoxelGrid.MAX_VOXELS / numCoarseCells) / Math.log(4)
      ));
      if (this._maxFineDepth > maxSafeDepth) {
        this._maxFineDepth = maxSafeDepth;
        this.minCellSize = COARSE_CELL_SIZE / Math.pow(2, this._maxFineDepth);
        this.voxelSize = this.minCellSize;
        // console.log(
        //   `[QuadtreeVoxelGrid] Pre-capping fine depth to ${maxSafeDepth} ` +
        //   `(${this.minCellSize.toFixed(2)}mm cells) for ${numCoarseCells} coarse cells`
        // );
      }
    }

    // Build tree, then reduce fine resolution if the leaf count exceeds MAX_VOXELS.
    // This mirrors the original VoxelGrid auto-scaling and keeps GPU instance count
    // within a renderable budget.  Rebuilding takes < 100ms and happens at most a
    // handful of times for very dense toolpaths.
    let N;
    for (let attempt = 0; attempt < 8; attempt++) {
      // Reset tree before each attempt
      this.root = new QuadTreeNode(
        this.originOffset.x - this.workpieceWidth / 2,
        this.originOffset.y - this.workpieceLength / 2,
        this.workpieceWidth,
        this.workpieceLength
      );

      // Process each radius group separately. _subdivide is idempotent on
      // already-subdivided interior nodes, so multiple passes on the same
      // tree are safe and additive.
      for (const [r, pts] of radiusGroups) {
        this._subdivide(this.root, pts, r);
      }

      this.leaves = [];
      this._flatten(this.root);
      N = this.leaves.length;

      if (N <= QuadtreeVoxelGrid.MAX_VOXELS) break;

      // Too many voxels: coarsen fine cells by one depth level (doubles minCellSize)
      this._maxFineDepth = Math.max(1, this._maxFineDepth - 1);
      this.minCellSize = COARSE_CELL_SIZE / Math.pow(2, this._maxFineDepth);
      this.voxelSize = this.minCellSize;
    }

    this.voxelTopZ = new Float32Array(N);  // all 0 = at surface

    // Update the compat properties so external profiling (gridWidth * gridLength) gives leaf count
    this.gridWidth = N;
    this.gridLength = 1;

    this._createMesh(N);
    console.log(`[QuadtreeVoxelGrid] ${N} adaptive voxels (${radiusGroups.size} radius groups)`);

  }

  // ── Tree construction ──────────────────────────────────────────────────────

  // pts is a flat [x0,y0, x1,y1, ...] array for the points relevant to `node`.
  // Safe to call multiple times on the same tree (for different radius groups):
  // interior nodes (already subdivided) are recursed into without re-splitting.
  _subdivide(node, pts, r) {
    const mustSplit = node.w > COARSE_CELL_SIZE || node.h > COARSE_CELL_SIZE;

    if (!mustSplit) {
      // Fine phase
      if (node.w <= this.minCellSize * 1.001) return;
      if (node.isLeaf) {
        // Unsubdivided leaf: only split if pts overlap this node
        if (pts.length === 0 || !this._anyPtIntersects(node, pts, r)) return;
      }
      // Interior node (subdivided by a prior call): always recurse to propagate new pts
    }

    if (node.isLeaf) node.subdivide();
    for (const child of node.children) {
      const childPts = this._filterPts(child, pts, r);
      this._subdivide(child, childPts, r);
    }
  }

  _anyPtIntersects(node, pts, r) {
    const rsq = r * r;
    for (let i = 0; i < pts.length; i += 2) {
      if (node.intersectsCircle(pts[i], pts[i + 1], rsq)) return true;
    }
    return false;
  }

  // Returns a new flat array with only the points that could affect `node`.
  _filterPts(node, pts, r) {
    const out = [];
    const rsq = r*r;
    for (let i = 0; i < pts.length; i += 2) {
      if (node.intersectsCircle(pts[i], pts[i + 1], rsq)) {
        out.push(pts[i], pts[i + 1]);
      }
    }
    return out;
  }

  _flatten(node) {
    if (node.isLeaf) {
      node.leafIndex = this.leaves.length;
      this.leaves.push(node);
      return;
    }
    for (const child of node.children) this._flatten(child);
  }

  // ── Three.js mesh ──────────────────────────────────────────────────────────

  _createMesh(N) {
    // Unit cube (1×1×1) — scaled per-instance for varying leaf sizes.
    // Use the same vertex-colour + instanceColor scheme as VoxelGrid so that
    // uncut voxels render identically to the filler blocks surrounding them.
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.computeVertexNormals();

    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal.array;
    const matColor = new THREE.Color(this.workpieceColor);
    const yellowColor = new THREE.Color(0xFFFF00);

    const colors = [];
    for (let i = 0; i < positions.length; i += 3) {
      const absNormalZ = Math.abs(normals[i + 2]);
      if (absNormalZ > 0.8) {
        colors.push(matColor.r, matColor.g, matColor.b);      // top / bottom face
      } else {
        colors.push(yellowColor.r, yellowColor.g, yellowColor.b); // side faces
      }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));

    const material = new THREE.MeshLambertMaterial({ vertexColors: true });

    this.mesh = new THREE.InstancedMesh(geometry, material, N);

    const dummy = new THREE.Object3D();
    const midZ = (0 + this.materialBottomZ) / 2;
    const H = this.workpieceThickness;

    for (let i = 0; i < N; i++) {
      const leaf = this.leaves[i];
      dummy.position.set(leaf.cx, leaf.cy, midZ);
      dummy.scale.set(leaf.w, leaf.h, H);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      this.mesh.setColorAt(i, matColor);  // instanceColor × vertexColor matches VoxelGrid & filler blocks
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // ── Public API (mirrors VoxelGrid) ────────────────────────────────────────

  getMesh() { return this.mesh; }

  /**
   * Lower the top surface of a single voxel.  Only shrinks; never grows.
   */
  updateVoxelHeight(index, newTopZ) {
    if (index < 0 || index >= this.leaves.length) return false;
    const cur = this.voxelTopZ[index];
    if (newTopZ >= cur) return false;
    if (cur === 0) this.voxelHeightChanged.add(index);
    this.voxelTopZ[index] = newTopZ;
    return true;
  }

  getVoxelWorldPosition(index) {
    if (index < 0 || index >= this.leaves.length) return null;
    const leaf = this.leaves[index];
    return new THREE.Vector3(leaf.cx, leaf.cy, this.voxelTopZ[index]);
  }

  /**
   * Remove material at a tool position.  Same signature as VoxelGrid.
   */
  removeVoxelsAtToolPosition(
    toolX, toolY, toolZ,
    toolRadius, toolRadiusSq,
    toolType = 'End Mill', vbitTangent = null
  ) {
    let penetrationFn;
    switch (toolType) {
      case 'Ball Nose':
        penetrationFn = (dSq) => toolZ + toolRadius - Math.sqrt(toolRadiusSq - dSq);
        break;
      case 'VBit':
        penetrationFn = (dSq) => toolZ + Math.sqrt(dSq) / vbitTangent;
        break;
      default:   // 'End Mill', 'Drill', flat
        penetrationFn = () => toolZ;
    }

    const updated = [];
    this._queryCircle(this.root, toolX, toolY, toolRadius, toolRadiusSq, penetrationFn, updated);

    if (updated.length > 0) {
      this._updateMatrices(updated);
      this._updateColors();
    }

    return updated;
  }

  // ── Quadtree range query ───────────────────────────────────────────────────

  _queryCircle(node, cx, cy, r, rSq, fn, out) {
    if (!node.intersectsSquare(cx, cy, r)) return;

    if (node.isLeaf) {
      const dx = node.cx - cx, dy = node.cy - cy;
      const dSq = dx * dx + dy * dy;
      if (dSq <= rSq) {
        const pz = fn(dSq);
        if (this.updateVoxelHeight(node.leafIndex, pz)) out.push(node.leafIndex);
      }
      return;
    }

    for (const child of node.children) {
      this._queryCircle(child, cx, cy, r, rSq, fn, out);
    }
  }

  // Public aliases used by 3dView.js after batch seek operations
  updateVoxelColors() { this._updateColors(); }
  updateInstanceMatrices() { if (this.mesh) this.mesh.instanceMatrix.needsUpdate = true; }

  // ── Matrix & colour updates ────────────────────────────────────────────────

  _updateMatrices(indices) {
    const dummy = new THREE.Object3D();
    const botZ = this.materialBottomZ;

    for (const i of indices) {
      const leaf = this.leaves[i];
      const topZ = this.voxelTopZ[i];
      const h = topZ - botZ;
      const visible = h > 0;
      dummy.position.set(leaf.cx, leaf.cy, (topZ + botZ) / 2);
      dummy.scale.set(
        visible ? leaf.w : 0,
        visible ? leaf.h : 0,
        visible ? h : 0
      );
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  _updateColors() {
    if (this.voxelHeightChanged.size === 0) return;
    const yellow = new THREE.Color(0xFFFF00);
    const blue = new THREE.Color(0xadd8e6);
    for (const i of this.voxelHeightChanged) {
      this.mesh.setColorAt(i, this.voxelTopZ[i] <= this.materialBottomZ ? blue : yellow);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.voxelHeightChanged.clear();
  }

  // ── Reset / dispose ────────────────────────────────────────────────────────

  reset() {
    this.voxelTopZ.fill(0);
    this.voxelHeightChanged.clear();
    this._seedMatrices();
    this._resetColors();
  }

  _seedMatrices() {
    const dummy = new THREE.Object3D();
    const midZ = (0 + this.materialBottomZ) / 2;
    const H = this.workpieceThickness;
    for (let i = 0; i < this.leaves.length; i++) {
      const leaf = this.leaves[i];
      dummy.position.set(leaf.cx, leaf.cy, midZ);
      dummy.scale.set(leaf.w, leaf.h, H);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  _resetColors() {
    if (!this.mesh?.instanceColor) return;
    const matColor = new THREE.Color(this.workpieceColor);
    for (let i = 0; i < this.leaves.length; i++) this.mesh.setColorAt(i, matColor);
    this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
    this.voxelTopZ = null;
    this.voxelHeightChanged.clear();
    this.leaves = [];
    this.root = null;
  }
}

// Match the same budget as VoxelGrid's CONFIG.MAX_VOXELS (750 000 × 4 = 3 000 000).
// Rendering more than ~3M InstancedMesh instances per frame reliably drops below 30 fps.
QuadtreeVoxelGrid.MAX_VOXELS = 750000 * 4;

export { QuadtreeVoxelGrid };
