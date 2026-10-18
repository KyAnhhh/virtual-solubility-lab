import { InstancedMesh, Object3D } from 'three';
import type { RenderTarget } from '../simulation/core/SimulationState';

const helper = new Object3D();
export const MAX_POOL_CAPACITY = 700;
export const MAX_BUFFER_CAPACITY = MAX_POOL_CAPACITY * 5;

const warnedPools = new Set<string>();

/**
 * Updates instance matrix transformations and active count for a pool's InstancedMesh.
 * Reads effective particle radius from target.radii to scale instances appropriately,
 * without double-multiplication or ignoring thin layers.
 */
export function updatePoolInstancedMesh(
  mesh: InstancedMesh | null,
  range: { offset: number; count: number } | undefined,
  target: RenderTarget & { radii?: Float32Array },
  defaultRadius: number,
  poolKey?: string
): void {
  if (!mesh) return;
  const maxMeshCapacity = mesh.instanceMatrix.count;
  if (range && range.count > maxMeshCapacity) {
    const key = poolKey ?? 'default';
    if (!warnedPools.has(key)) {
      warnedPools.add(key);
      console.warn(`[ParticleRenderer] Pool ${key} range count (${range.count}) exceeds max mesh capacity (${maxMeshCapacity}). Clamping.`);
    }
  }
  const count = range ? Math.min(Math.max(0, range.count), maxMeshCapacity) : 0;
  mesh.count = count;
  if (count <= 0) {
    mesh.instanceMatrix.needsUpdate = true;
    return;
  }

  const offset = range!.offset;
  const positions = target.positions;
  const radii = target.radii;

  for (let i = 0; i < count; i++) {
    const pIdx = (offset + i) * 3;
    const x = positions[pIdx];
    const y = positions[pIdx + 1];
    const z = positions[pIdx + 2];
    const r = radii ? radii[offset + i] : defaultRadius;
    const scale = r > 0 ? r : defaultRadius;

    helper.position.set(x, y, z);
    helper.scale.set(scale, scale, scale);
    helper.rotation.set(i * 0.73, i * 1.31, i * 0.47);
    helper.updateMatrix();
    mesh.setMatrixAt(i, helper.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
}
