/**
 * VoxelMaterialRemover - Utility class for managing material removal during simulation
 * Provides a clean interface for removing voxels based on tool geometry and movement
 */

class VoxelMaterialRemover {
  /**
   * Constructor
   */
  constructor() {
    this.totalVoxelsRemoved = 0;
    this.lastToolPosition = null;

    // Tool constant caching for optimization
    this.lastToolInfo = null;
    this.toolRadiusSq = null;      // Pre-calculated: toolRadius * toolRadius
    this.vbitTangent = null;       // Pre-calculated: Math.tan(vbitAngle/2 * PI/180)
  }

  static BREAKTHROUGH_EPSILON_MM = 0.05;
  static VISUAL_BREAKTHROUGH_OVERCUT_MM = 1.0;

  resolveVisualToolZ(voxelGrid, toolZ) {
    if (!voxelGrid || !Number.isFinite(Number(toolZ))) {
      return toolZ;
    }

    const materialBottomZ = Number(voxelGrid.materialBottomZ);
    if (!Number.isFinite(materialBottomZ)) {
      return toolZ;
    }

    return toolZ <= materialBottomZ + VoxelMaterialRemover.BREAKTHROUGH_EPSILON_MM
      ? materialBottomZ - VoxelMaterialRemover.VISUAL_BREAKTHROUGH_OVERCUT_MM
      : toolZ;
  }

  /**
   * Pre-calculate tool constants when tool changes
   * Calculates values that don't change during a tool's operation
   * @private
   */
  precalculateToolConstants(toolInfo) {
    // Calculate tool radius squared for boundary checks (eliminates sqrt)
    const toolRadius = toolInfo.diameter / 2;
    this.toolRadiusSq = toolRadius * toolRadius;

    // Pre-calculate V-bit tangent if applicable
    // Use G-code tool names directly (VBit)
    if (toolInfo.type === 'VBit') {
      const vbitAngle = toolInfo.angle || toolInfo.vbitAngle || 90;
      const halfAngleRad = (vbitAngle / 2) * (Math.PI / 180);
      this.vbitTangent = Math.tan(halfAngleRad);
    } else {
      this.vbitTangent = null;
    }
  }

  /**
   * Remove material from voxel grid based on tool movement
   * @param {VoxelGrid} voxelGrid - The voxel grid instance
   * @param {number} toolX - Tool X position in world space
   * @param {number} toolY - Tool Y position in world space
   * @param {number} toolZ - Tool Z position in world space
   * @param {Object} toolInfo - Tool information object
   * @param {number} toolInfo.diameter - Tool diameter in mm
   * @param {string} toolInfo.type - Tool type: 'flat', 'ball', 'vbit', 'drill'
   * @param {number} [toolInfo.vbitAngle=90] - V-bit angle in degrees (only for 'vbit')
   * @returns {Array} Array of removed voxel indices in this operation
   */
  removeAtToolPosition(voxelGrid, toolX, toolY, toolZ, toolInfo, options = {}) {
    if (!voxelGrid || !toolInfo) {
      return [];
    }

    const { deferVisualUpdate = false } = options;

    // Pre-calculate tool constants if tool has changed
    if (this.lastToolInfo !== toolInfo) {
      this.precalculateToolConstants(toolInfo);
      this.lastToolInfo = toolInfo;
    }

    const toolRadius = toolInfo.diameter / 2;
    // Use G-code tool type directly (source of truth)
    const toolType = toolInfo.type || 'End Mill';
    const visualToolZ = this.resolveVisualToolZ(voxelGrid, toolZ);

    // Remove voxels at current tool position, passing pre-calculated constants
    const removedVoxels = voxelGrid.removeVoxelsAtToolPosition(
      toolX,
      toolY,
      visualToolZ,
      toolRadius,
      this.toolRadiusSq,
      toolType,
      this.vbitTangent,
      deferVisualUpdate
    );

    this.totalVoxelsRemoved += removedVoxels.length;
    this.lastToolPosition = { x: toolX, y: toolY, z: toolZ };

    return removedVoxels;
  }

  /**
   * Remove material along a linear tool path
   * @param {VoxelGrid} voxelGrid - The voxel grid instance
   * @param {THREE.Vector3} startPos - Start position of tool
   * @param {THREE.Vector3} endPos - End position of tool
   * @param {Object} toolInfo - Tool information object
   * @param {number} stepDistance - Distance between samples along the path in mm
   * @returns {number} Cumulative total voxels removed across all operations (not just this call)
   */
  removeAlongPath(voxelGrid, startPos, endPos, toolInfo, stepDistance = 1.0, options = {}) {
    if (!voxelGrid || !toolInfo) {
      return 0;
    }

    const { deferVisualUpdate = false } = options;

    // Calculate path length
    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const dz = endPos.z - startPos.z;
    const pathLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (pathLength === 0) {
      // No movement, just remove at current position
      this.removeAtToolPosition(voxelGrid, startPos.x, startPos.y, startPos.z, toolInfo, { deferVisualUpdate });
      return this.totalVoxelsRemoved;
    }

    // Sample along the path
    const numSteps = Math.ceil(pathLength / stepDistance);

    for (let i = 0; i <= numSteps; i++) {
      const t = numSteps > 0 ? i / numSteps : 0;
      const x = startPos.x + dx * t;
      const y = startPos.y + dy * t;
      const z = startPos.z + dz * t;

      this.removeAtToolPosition(voxelGrid, x, y, z, toolInfo, { deferVisualUpdate });
    }

    return this.totalVoxelsRemoved;
  }

  removeClosedRegion(voxelGrid, closedPath, options = {}) {
    if (!voxelGrid || !Array.isArray(closedPath) || closedPath.length < 4 || typeof pointInPolygon !== 'function') {
      return 0;
    }

    const { deferVisualUpdate = false } = options;
    const updatedIndices = [];
    const hiddenTopZ = voxelGrid.materialBottomZ - VoxelMaterialRemover.VISUAL_BREAKTHROUGH_OVERCUT_MM;

    if (Array.isArray(voxelGrid.leaves) && voxelGrid.leaves.length > 0) {
      for (let index = 0; index < voxelGrid.leaves.length; index++) {
        const leaf = voxelGrid.leaves[index];
        if (!leaf) continue;
        if (!pointInPolygon({ x: leaf.cx, y: leaf.cy }, closedPath)) continue;
        if (typeof voxelGrid.updateVoxelHeight === 'function' && voxelGrid.updateVoxelHeight(index, hiddenTopZ)) {
          updatedIndices.push(index);
        }
      }

      if (updatedIndices.length > 0) {
        if (deferVisualUpdate && voxelGrid.pendingMatrixUpdates) {
          for (const index of updatedIndices) {
            voxelGrid.pendingMatrixUpdates.add(index);
          }
        } else if (typeof voxelGrid._updateMatrices === 'function') {
          voxelGrid._updateMatrices(updatedIndices);
          if (typeof voxelGrid._updateColors === 'function') {
            voxelGrid._updateColors();
          }
        }
      }

      this.totalVoxelsRemoved += updatedIndices.length;
      return updatedIndices.length;
    }

    const voxelWorldX = voxelGrid.voxelWorldX;
    const voxelWorldY = voxelGrid.voxelWorldY;
    const maxVoxels = Number(voxelGrid.maxVoxels) || 0;
    if (!voxelWorldX || !voxelWorldY || maxVoxels <= 0) {
      return 0;
    }

    for (let index = 0; index < maxVoxels; index++) {
      if (!pointInPolygon({ x: voxelWorldX[index], y: voxelWorldY[index] }, closedPath)) continue;
      if (typeof voxelGrid.updateVoxelHeight === 'function' && voxelGrid.updateVoxelHeight(index, hiddenTopZ)) {
        updatedIndices.push(index);
      }
    }

    if (updatedIndices.length > 0) {
      if (typeof voxelGrid.updateVoxelMatrices === 'function') {
        voxelGrid.updateVoxelMatrices(updatedIndices);
      }
      if (typeof voxelGrid.updateVoxelColors === 'function') {
        voxelGrid.updateVoxelColors();
      }
    }

    this.totalVoxelsRemoved += updatedIndices.length;
    return updatedIndices.length;
  }

  /**
   * Reset removal tracker
   */
  reset() {
    this.totalVoxelsRemoved = 0;
    this.lastToolPosition = null;
    this.lastToolInfo = null;  // IMPORTANT: Also reset the cached tool info
    this.toolRadiusSq = null;
    this.vbitTangent = null;
  }
}

export { VoxelMaterialRemover };
