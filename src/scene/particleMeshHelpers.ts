import { InstancedMesh, Object3D } from 'three';
import type { RenderTarget } from '../simulation/core/SimulationState';

const helper = new Object3D();
export const MAX_POOL_CAPACITY = 700;
export const MAX_BUFFER_CAPACITY = MAX_POOL_CAPACITY * 5;

const warnedPools = new Set<string>();

/**
 * Updates instance matrix transformations and active count for a pool's InstancedMesh.
 * Reads effective particle radius from target.radii to scale instances appropriately.
 * Supports smooth visual scale interpolation (anti-popping) in the render layer:
 * - When particles enter active count, they scale up smoothly (short ~120ms fade-in).
 * - When paused, transitions freeze.
 * - On reset/empty, all visual scales clear immediately without ghost instances.
 * - Under no circumstances are physics buffers or scalar mass trajectories altered.
 */
export function updatePoolInstancedMesh(
  mesh: InstancedMesh | null,
  range: { offset: number; count: number } | undefined,
  target: RenderTarget & { radii?: Float32Array },
  defaultRadius: number,
  poolKey?: string,
  scaleCache?: Float32Array,
  effectiveDeltaSeconds?: number,
  isReset?: boolean
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
    if (scaleCache) {
      scaleCache.fill(0);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return;
  }

  if (isReset && scaleCache) {
    scaleCache.fill(0);
  }

  const offset = range!.offset;
  const positions = target.positions;
  const radii = target.radii;
  const dt = effectiveDeltaSeconds ?? 0;

  for (let i = 0; i < count; i++) {
    const pIdx = (offset + i) * 3;
    const x = positions[pIdx];
    const y = positions[pIdx + 1];
    const z = positions[pIdx + 2];
    const r = radii ? radii[offset + i] : defaultRadius;
    const targetScale = r > 0 ? r : defaultRadius;

    let displayScale = targetScale;
    if (scaleCache) {
      if (scaleCache[i] <= 0.0001) {
        // Start newly spawned particles at small scale to eliminate visual pop
        scaleCache[i] = targetScale * 0.3;
      }
      if (dt > 0) {
        const lerpFactor = Math.min(1, dt * 14.0);
        scaleCache[i] += (targetScale - scaleCache[i]) * lerpFactor;
        if (scaleCache[i] > targetScale) {
          scaleCache[i] = targetScale;
        }
      }
      displayScale = Math.min(targetScale, scaleCache[i]);
    }

    helper.position.set(x, y, z);
    helper.scale.set(displayScale, displayScale, displayScale);
    helper.rotation.set(i * 0.73, i * 1.31, i * 0.47);
    helper.updateMatrix();
    mesh.setMatrixAt(i, helper.matrix);
  }

  // Clear inactive tail entries in cache
  if (scaleCache && count < scaleCache.length) {
    for (let i = count; i < Math.min(count + 20, scaleCache.length); i++) {
      scaleCache[i] = 0;
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
}

