/**
 * VoxelGrid - Manages voxel-based material representation for CNC simulation
 * Uses a single InstancedMesh with 2D X-Y layout and per-voxel height tracking
 * Single layer at Z=0 (material surface), with voxelTopZ tracking actual cut depth
 * Material color on top face, yellow on exposed surfaces when cut
 */

import * as THREE from '../lib/three.module.js';

class VoxelGrid {
  /**
   * Initialize a voxel grid representation of the workpiece
   * @param {number} workpieceWidth - Width of workpiece in mm
   * @param {number} workpieceLength - Length of workpiece in mm
   * @param {number} workpieceThickness - Thickness of workpiece in mm
   * @param {number} voxelSize - Size of X and Y voxels in mm
   * @param {THREE.Vector3} originOffset - Offset of workpiece origin in world space
   * @param {string} workpieceColor - Hex color or material color for voxels
   */
  constructor(workpieceWidth, workpieceLength, workpieceThickness, voxelSize = 1.0, originOffset = new THREE.Vector3(0, 0, 0), workpieceColor = 0x8B6914) {
    this.workpieceWidth = workpieceWidth;
    this.workpieceLength = workpieceLength;
    this.workpieceThickness = workpieceThickness;
    this.voxelSize = voxelSize;  // XY voxel size
    this.originOffset = originOffset;
    this.workpieceColor = workpieceColor;

    // Calculate grid dimensions (2D grid only - no Z dimension)
    this.gridWidth = Math.ceil(workpieceWidth / voxelSize);
    this.gridLength = Math.ceil(workpieceLength / voxelSize);

    // Total voxel count (2D grid)
    this.maxVoxels = this.gridWidth * this.gridLength;

    // Material thickness and bounds
    this.materialBottomZ = -this.workpieceThickness;  // Bottom of material (negative)

    // Per-voxel height tracking
    this.voxelTopZ = new Float32Array(this.maxVoxels);  // Z position of each voxel's top surface
    this.voxelWorldX = new Float32Array(this.maxVoxels); // Cached X world position (never changes)
    this.voxelWorldY = new Float32Array(this.maxVoxels); // Cached Y world position (never changes)
    this.voxelHeightChanged = new Set();  // Track which voxels have been cut for color updates

    // Single Three.js mesh for rendering
    this.mesh = null;

    // Debug tracking
    this.frameNumber = 0;

    // Initialize the grid with all voxels at material surface
    this.initializeGrid();
  }

  /**
   * Create BoxGeometry for voxels with per-vertex colors
   * Top and bottom faces: material color
   * Side faces: yellow (to show exposed cut surfaces)
   * X and Y: voxelSize, Z: workpieceThickness (full height)
   * @private
   * @returns {THREE.BoxGeometry} Geometry with per-vertex colors
   */
  createGeometry() {
    const geometry = new THREE.BoxGeometry(
      this.voxelSize,
      this.voxelSize,
      this.workpieceThickness
    );

    // Create per-vertex color array using face normals
    // BoxGeometry has pre-computed normals that tell us which face each vertex belongs to
    // Top/bottom faces: normals point in Z direction (0, 0, ±1)
    // Side faces: normals point in XY directions

    geometry.computeVertexNormals();  // Ensure normals are computed

    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal.array;
    const materialColor = new THREE.Color(this.workpieceColor);
    const yellowColor = new THREE.Color(0xFFFF00);

    const colors = [];
    for (let i = 0; i < positions.length; i += 3) {
      const normalX = normals[i];
      const normalY = normals[i + 1];
      const normalZ = normals[i + 2];

      const absNormalZ = Math.abs(normalZ);

      if (absNormalZ > 0.8) {
        // Top or bottom face (normal is Z-dominant) - material color
        colors.push(materialColor.r, materialColor.g, materialColor.b);
      } else {
        // Side faces (normal points sideways) - yellow
        colors.push(yellowColor.r, yellowColor.g, yellowColor.b);
      }
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    return geometry;
  }

  /**
   * Initialize the voxel grid with all voxels at material surface
   * Creates a single InstancedMesh with 2D X-Y layout
   * All voxels initialized with topZ = 0 (material surface)
   */
  // Return the world-space center position for voxel (x, y).
  _voxelWorldPos(x, y) {
    return {
      x: this.originOffset.x - this.workpieceWidth  / 2 + x * this.voxelSize + this.voxelSize / 2,
      y: this.originOffset.y - this.workpieceLength / 2 + y * this.voxelSize + this.voxelSize / 2,
      z: this.originOffset.z - this.workpieceThickness / 2
    };
  }

  initializeGrid() {
    // Create geometry (single unified geometry)
    const geometry = this.createGeometry();

    // Create material with vertex colors enabled
    // Per-vertex colors from geometry define the appearance
    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,  // Use per-vertex colors from geometry
      shininess: 30,
      transparent: false,
      opacity: 1.0,
      wireframe: false
    });

    // Create single InstancedMesh with capacity for all voxels
    this.mesh = new THREE.InstancedMesh(geometry, material, this.maxVoxels);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    const materialColor = new THREE.Color(this.workpieceColor);

    // Position all voxels in the 2D grid
    // 2D indexing: index = y + x * gridLength
    for (let x = 0; x < this.gridWidth; x++) {
      for (let y = 0; y < this.gridLength; y++) {
        const index = y + x * this.gridLength;

        // Calculate world position (centered in each voxel cell)
        const wp = this._voxelWorldPos(x, y);

        // Cache X/Y — these never change after init
        this.voxelWorldX[index] = wp.x;
        this.voxelWorldY[index] = wp.y;

        // Initialize all instance colors to material color (uncut state)
        this.mesh.setColorAt(index, materialColor);

        // Initialize voxel top Z to material surface (0)
        this.voxelTopZ[index] = 0;
      }
    }

    this._seedMatrices();
  }

  _seedMatrices() {
    const dummy = new THREE.Object3D();
    for (let x = 0; x < this.gridWidth; x++) {
      for (let y = 0; y < this.gridLength; y++) {
        const index = y + x * this.gridLength;
        const wp = this._voxelWorldPos(x, y);
        dummy.position.set(wp.x, wp.y, wp.z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(index, dummy.matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Convert 2D grid coordinates to linear index
   * @param {number} x - X grid coordinate
   * @param {number} y - Y grid coordinate
   * @returns {number} Linear index or -1 if out of bounds
   */
  coordsToIndex(x, y) {
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridLength) {
      return -1;
    }
    return y + x * this.gridLength;
  }

  /**
   * Convert linear index to 2D grid coordinates
   * @param {number} index - Linear index
   * @returns {Object} {x, y} coordinates or null if invalid
   */
  indexToCoords(index) {
    if (index < 0 || index >= this.maxVoxels) return null;
    const x = Math.floor(index / this.gridLength);
    const y = index % this.gridLength;
    return { x, y };
  }

  /**
   * Get world position of a voxel center by grid index
   * @param {number} index - Linear voxel index
   * @returns {THREE.Vector3} World position
   */
  getVoxelWorldPosition(index) {
    const coords = this.indexToCoords(index);
    if (!coords) return null;

    const worldX = this.originOffset.x - this.workpieceWidth / 2 + coords.x * this.voxelSize + this.voxelSize / 2;
    const worldY = this.originOffset.y - this.workpieceLength / 2 + coords.y * this.voxelSize + this.voxelSize / 2;
    const worldZ = this.voxelTopZ[index];  // Return current top Z of voxel

    return new THREE.Vector3(worldX, worldY, worldZ);
  }

  /**
   * Update voxel height based on tool penetration
   * Only shrinks height, never increases it
   * @param {number} index - Linear voxel index
   * @param {number} newTopZ - New Z position of voxel top (must be negative or 0)
   * @returns {boolean} True if height changed, false otherwise
   */
  updateVoxelHeight(index, newTopZ) {
    if (index < 0 || index >= this.maxVoxels) return false;

    const currentTopZ = this.voxelTopZ[index];

    // Only shrink, never increase (newTopZ must be more negative)
    if (newTopZ >= currentTopZ) return false;

        // Mark this voxel as cut for color update
    if(this.voxelTopZ[index] == 0)
      this.voxelHeightChanged.add(index);
    // Update voxel top Z
    this.voxelTopZ[index] = newTopZ;

    return true;
  }

  /**
   * Signal that instance matrices have been updated and need to be re-rendered
   */
  updateInstanceMatrices() {
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Update instance colors for cut voxels
   * Cut-through voxels (height == 0) get background blue; partially cut voxels get yellow
   */
  updateVoxelColors() {
    if (this.voxelHeightChanged.size === 0) return;

    const yellowColor = new THREE.Color(0xFFFF00);
    const blueColor = new THREE.Color(0xadd8e6);

    for (const index of this.voxelHeightChanged) {
      const isCutThrough = this.voxelTopZ[index] <= this.materialBottomZ;
      this.mesh.setColorAt(index, isCutThrough ? blueColor : yellowColor);
    }

    // Mark instance colors as needing update
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
    this.voxelHeightChanged.clear();
  }

  /**
   * Update voxel heights based on tool position
   * Only shrinks voxel heights, never increases them
   * @param {number} toolX - Tool X position in world space
   * @param {number} toolY - Tool Y position in world space
   * @param {number} toolZ - Tool Z position in world space (cutting depth, negative)
   * @param {number} toolRadius - Tool radius in mm
   * @param {number} toolRadiusSq - Pre-calculated tool radius squared (for optimization)
   * @param {string} toolType - Type of tool: 'flat', 'ball', 'vbit', 'drill'
   * @param {number|null} vbitTangent - Pre-calculated V-bit tangent (only for 'vbit')
   * @returns {Array} Array of updated voxel indices
   */
  removeVoxelsAtToolPosition(toolX, toolY, toolZ, toolRadius, toolRadiusSq, toolType = 'flat', vbitTangent = null) {
    const updatedVoxels = [];
    this.frameNumber++;

    const searchRadiusVoxels = Math.ceil(toolRadius / this.voxelSize);

    // Convert tool position to grid coordinates
    let gridX = Math.floor((toolX - this.originOffset.x + this.workpieceWidth / 2 - this.voxelSize / 2) / this.voxelSize);
    let gridY = Math.floor((toolY - this.originOffset.y + this.workpieceLength / 2 - this.voxelSize / 2) / this.voxelSize);

    // Clamp to valid grid bounds
    gridX = Math.max(0, Math.min(this.gridWidth - 1, gridX));
    gridY = Math.max(0, Math.min(this.gridLength - 1, gridY));

    // PRE-SELECT penetration function based on tool type (OPTIMIZATION: Move outside loop)
    // This eliminates 40,000+ switch statement evaluations
    // Uses G-code tool names: End Mill, Ball Nose, VBit, Drill
    let penetrationFunc;
    switch (toolType) {
      case 'Ball Nose':
        penetrationFunc = (distSq) =>
          this.getBallNosePenetration(distSq, toolX, toolY, toolZ, toolRadius, toolRadiusSq);
        break;
      case 'VBit':
        penetrationFunc = (distSq) =>
          this.getVBitPenetration(distSq, toolX, toolY, toolZ, toolRadius, toolRadiusSq, vbitTangent);
        break;
      case 'End Mill':
      case 'Drill':
      default:
        penetrationFunc = () => toolZ;
    }

    // Pre-calculate world coordinate base offsets (OPTIMIZATION: Avoid repeated math)
    const baseWorldX = this.originOffset.x - this.workpieceWidth / 2 + this.voxelSize / 2;
    const baseWorldY = this.originOffset.y - this.workpieceLength / 2 + this.voxelSize / 2;

    // Search within radius
    for (let dx = -searchRadiusVoxels; dx <= searchRadiusVoxels; dx++) {
      for (let dy = -searchRadiusVoxels; dy <= searchRadiusVoxels; dy++) {
        const x = gridX + dx;
        const y = gridY + dy;

        // Grid bounds check (OPTIMIZATION: Faster than calculating index first)
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridLength) continue;

        // Calculate world position directly (OPTIMIZATION: Eliminate getVoxelWorldPosition() call)
        const voxelWorldX = baseWorldX + x * this.voxelSize;
        const voxelWorldY = baseWorldY + y * this.voxelSize;

        // Distance check BEFORE index calculation (OPTIMIZATION: Early exit if tool doesn't reach)
        const dxWorld = voxelWorldX - toolX;
        const dyWorld = voxelWorldY - toolY;
        const distSq = dxWorld * dxWorld + dyWorld * dyWorld;

        if (distSq > toolRadiusSq) continue;

        // Only calculate index when we know we need it (OPTIMIZATION: Index not needed for failed checks)
        const index = y + x * this.gridLength;

        // Calculate penetration using pre-selected function (OPTIMIZATION: Pass distSq for tools that need it)
        const penetrationZ = penetrationFunc(distSq);

        // Update voxel height if tool penetrates
 
        if (this.updateVoxelHeight(index, penetrationZ)) {
          updatedVoxels.push(index);
        }

    }
    }

    // Batch update: notify Three.js that matrices changed (only once)
    if (updatedVoxels.length > 0) {
      this.updateVoxelMatrices(updatedVoxels);
      this.updateVoxelColors();
    }

    return updatedVoxels;
  }

  /**
   * Update instance matrices and Z scales for affected voxels
   * Optimized: Only recalculates Z values, X and Y never change during material removal
   * Uses single dummy object to avoid repeated allocation
   * @private
   */
  updateVoxelMatrices(voxelIndices) {
    const dummy = new THREE.Object3D();
    const bottomZ = this.materialBottomZ;
    const originalHeight = 0 - bottomZ;  // 0 to bottom (negative value)

    for (const index of voxelIndices) {
      if (index < 0 || index >= this.maxVoxels) continue;

      const topZ = this.voxelTopZ[index];

      // Voxel Z position: center between top and bottom
      const worldZ = (topZ + bottomZ) / 2;

      // Voxel Z scale: current height / original height
      const currentHeight = topZ - bottomZ;
      const scaleZ = Math.max(0, currentHeight / originalHeight);

      // Use cached X/Y — they never change after initializeGrid()
      dummy.position.set(this.voxelWorldX[index], this.voxelWorldY[index], worldZ);
      dummy.scale.set(scaleZ > 0 ? 1 : 0, scaleZ > 0 ? 1 : 0, scaleZ);
      dummy.updateMatrix();

      this.mesh.setMatrixAt(index, dummy.matrix);
    }

    this.updateInstanceMatrices();
  }

  /**
   * Get penetration depth for flat endmill at voxel position
   * Simplified: Distance boundary check already done before calling this function
   * Flat endmill: cylindrical shape with flat bottom
   * @private
   */
  /**
   * Get penetration depth for ball nose at voxel position
   * Ball nose is a sphere: tip at toolZ, extends upward
   * Simplified: Distance boundary check already done before calling this function
   * @private
   */
  getBallNosePenetration(distSq, toolX, toolY, toolZ, toolRadius, toolRadiusSq) {
    // Voxel is guaranteed to be within tool radius (checked before this call)
    // Ball nose sphere: tip (lowest point) at toolZ, center at (toolX, toolY, toolZ + toolRadius)
    // Sphere equation: distXY² + (z - (toolZ + toolRadius))² = toolRadius²
    // Solving for z (cutting surface): z = (toolZ + toolRadius) - sqrt(toolRadius² - distXY²)
    //
    // At distXY = 0: z = toolZ + r - r = toolZ ✓ (tip is at toolZ)
    // At distXY = r/2: z = toolZ + r - sqrt(r² - r²/4) = toolZ + r - r√3/2 (shallower away from center) ✓
    const heightAboveTip = Math.sqrt(toolRadiusSq - distSq);  // Use distSq directly
    const penetrationZ = toolZ + toolRadius - heightAboveTip;

    return penetrationZ;
  }

  /**
   * Get penetration depth for V-bit at voxel position
   * V-bit is a cone: tip at toolZ, expands upward toward surface
   * Simplified: Distance boundary check already done before calling this function
   * @private
   */
  getVBitPenetration(distSq, toolX, toolY, toolZ, toolRadius, toolRadiusSq, vbitTangent) {
    // Voxel is guaranteed to be within tool radius (checked before this call)
    // At the voxel's XY distance, the cone surface rises toward surface:
    // Tip is at toolZ (negative, below surface)
    // As distance increases, Z increases (closer to surface)
    // z = toolZ + (distXY / tanAngle)
    //
    // Example: toolZ = -3mm, distXY = 2mm, angle = 45° (tan=1)
    // z = -3 + 2/1 = -1 (cuts shallower away from center) ✓
    const distXY = Math.sqrt(distSq);
    const penetrationZ = toolZ + (distXY / vbitTangent);

    return penetrationZ;
  }

  /**
   * Reset all voxels to initial state (uncut, at material surface)
   * Resets heights and colors to default
   */
  reset() {
    // Reset all voxel heights to material surface
    for (let i = 0; i < this.maxVoxels; i++) {
      this.voxelTopZ[i] = 0;
    }

    // Clear cut tracking
    this.voxelHeightChanged.clear();

    // Reset all voxel matrices to full height
    this._seedMatrices();

    // Reset voxel colors to material color
    this.resetVoxelColors();
  }

  /**
   * Reset all voxel colors to material color (remove yellow cutting visualization)
   * @private
   */
  resetVoxelColors() {
    if (!this.mesh || !this.mesh.instanceColor) return;

    const materialColor = new THREE.Color(this.workpieceColor);

    // Reset all instance colors to material color using setColorAt
    for (let i = 0; i < this.maxVoxels; i++) {
      this.mesh.setColorAt(i, materialColor);
    }

    // Mark instance colors as needing update
    this.mesh.instanceColor.needsUpdate = true;
  }

  /**
   * Get the Three.js mesh for rendering
   * @returns {THREE.InstancedMesh} Single mesh instance
   */
  getMesh() {
    return this.mesh;
  }

  /**
   * Dispose of Three.js resources
   */
  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
    this.voxelTopZ = null;
    this.voxelHeightChanged.clear();
  }
}

export { VoxelGrid };
