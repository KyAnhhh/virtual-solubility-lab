import {
  BEAKER_INNER_RADIUS,
  computeParticleBounds,
  PARTICLE_RADIUS,
  volumeToHeight,
  type BeakerRegions,
  type ParticleBounds,
} from '../constants/beaker';
import { VISUAL_ML_PER_GRAM } from '../constants/ingredients';
import {
  MATERIAL_IDS,
  type MaterialId,
  type PoolKind,
  type RenderPoolRange,
  type RenderStamp,
  type RenderTarget,
  type ScienceMassCompartments,
} from '../core/SimulationState';

export { type PoolKind };

export const POOL_KINDS: readonly PoolKind[] = [
  'sugarBed',
  'sugarSusp',
  'sandBed',
  'sandSusp',
  'oilDroplet',
] as const;

export const POOL_MATERIAL: Record<PoolKind, MaterialId> = {
  sugarBed: MATERIAL_IDS.sugar,
  sugarSusp: MATERIAL_IDS.sugar,
  sandBed: MATERIAL_IDS.sand,
  sandSusp: MATERIAL_IDS.sand,
  oilDroplet: MATERIAL_IDS.oilDroplet,
};

export const POOL_DISCRIMINATOR: Record<PoolKind, number> = {
  sugarBed: 0x101,
  sugarSusp: 0x102,
  sandBed: 0x103,
  sandSusp: 0x104,
  oilDroplet: 0x105,
};

export const PARTICLE_RADIUS_OIL_DROPLET = 0.028;
export const TRANSPORT_DRAG = 4.0; // s^-1
export const SETTLE_SPEED_WATER = 0.08; // scene units / s
export const SETTLE_SPEED_OIL = 0.03; // scene units / s
export const DROPLET_RISE_SPEED = 0.06; // scene units / s

export const DEFAULT_PARTICLE_BUDGET_PER_POOL = 100;
export const VISUAL_HIDE_THRESHOLD_GRAMS = 0.001; // SPEC §8 visual hide threshold

/**
 * 32-bit stateless integer hash mixer (FNV-1a prime mixing followed by MurmurHash3 finalizer).
 * Guaranteed deterministic across platforms and runtimes.
 */
export function hash32(...inputs: number[]): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < inputs.length; i++) {
    const k = inputs[i] >>> 0;
    h ^= k & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (k >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (k >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (k >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Maps a 32-bit unsigned integer to a uniform float in [0, 1).
 */
export function sampleUnitFloat(hashVal: number): number {
  return (hashVal >>> 0) / 4294967296.0;
}

/**
 * Clamps particle position within region boundaries and removes velocity components
 * directed outward from walls and vertical boundaries, while preserving tangential components.
 */
export function clampParticlePositionAndVelocity(
  p: [number, number, number],
  v: [number, number, number],
  bounds: ParticleBounds
): { pNext: [number, number, number]; vNext: [number, number, number] } {
  let [x, y, z] = p;
  let [vx, vy, vz] = v;

  if (!bounds.active) {
    return { pNext: [x, bounds.yBottom, z], vNext: [0, 0, 0] };
  }

  // 1. Horizontal beaker cylinder boundary
  const r = Math.hypot(x, z);
  const maxR = bounds.horizontalRadius;
  if (r > maxR) {
    if (r > 1e-9) {
      const nx = x / r;
      const nz = z / r;
      x = nx * maxR;
      z = nz * maxR;

      // Normal velocity component pointing outward: vn = vx * nx + vz * nz
      const vn = vx * nx + vz * nz;
      if (vn > 0) {
        vx -= vn * nx;
        vz -= vn * nz;
      }
    } else {
      x = 0;
      z = 0;
    }
  }

  // 2. Vertical boundaries
  if (bounds.yBottom >= bounds.yTop) {
    // Thin region clamped to midpoint
    y = bounds.midpointY;
    vy = 0;
  } else {
    if (y < bounds.yBottom) {
      y = bounds.yBottom;
      if (vy < 0) vy = 0;
    } else if (y > bounds.yTop) {
      y = bounds.yTop;
      if (vy > 0) vy = 0;
    }
  }

  return { pNext: [x, y, z], vNext: [vx, vy, vz] };
}

/**
 * Computes smooth, bounded horizontal falloff: 1 at center, 0.75 near beaker inner radius.
 */
export function computeHorizontalFalloff(r: number, innerRadius = BEAKER_INNER_RADIUS): number {
  if (innerRadius <= 0) return 1.0;
  const ratio = Math.min(1.0, Math.max(0.0, r / innerRadius));
  return Math.max(0.0, 1.0 - 0.25 * ratio * ratio);
}

/**
 * Computes deterministic, bounded pseudo-turbulent vertical field in [-1, 1].
 */
export function computeTurbulentVerticalField(
  x: number,
  y: number,
  z: number,
  omegaFlow: number,
  elapsedSeconds: number
): number {
  const phase = 0.5 * omegaFlow * elapsedSeconds;
  return Math.sin(3 * x + 2 * y + phase) * Math.cos(3 * z + phase);
}

export interface ParticlePoolData {
  kind: PoolKind;
  material: MaterialId;
  budget: number;
  activeCount: number;
  positions: Float32Array;      // budget * 3
  velocities: Float32Array;     // budget * 3
  weights: Float32Array;        // budget
  birthOrdinals: Uint32Array;   // budget
  effectiveRadii: Float32Array; // budget
  bounds: ParticleBounds;
}

export function createParticlePool(
  kind: PoolKind,
  budget = DEFAULT_PARTICLE_BUDGET_PER_POOL
): ParticlePoolData {
  const safeBudget = Math.max(1, Math.floor(budget));
  return {
    kind,
    material: POOL_MATERIAL[kind],
    budget: safeBudget,
    activeCount: 0,
    positions: new Float32Array(safeBudget * 3),
    velocities: new Float32Array(safeBudget * 3),
    weights: new Float32Array(safeBudget),
    birthOrdinals: new Uint32Array(safeBudget),
    effectiveRadii: new Float32Array(safeBudget),
    bounds: {
      active: false,
      horizontalRadius: 0,
      yBottom: 0,
      yTop: 0,
      midpointY: 0,
      effectiveParticleRadius: 0,
    },
  };
}

/**
 * Computes the spatial interval [yBottom, yTop] and ParticleBounds for a specific pool.
 */
export function computePoolBounds(
  kind: PoolKind,
  mass: Readonly<ScienceMassCompartments>,
  fGu: number,
  regions: BeakerRegions
): ParticleBounds {
  const sandBedHeight = volumeToHeight(Math.max(0, mass.Sb) * VISUAL_ML_PER_GRAM.sand);
  const sugarBedHeight = volumeToHeight(
    Math.max(0, mass.Gu * (1 - Math.min(1, Math.max(0, fGu)))) * VISUAL_ML_PER_GRAM.sugar
  );

  switch (kind) {
    case 'sandBed': {
      const bottom = regions.bed.bottom;
      const top = bottom + sandBedHeight;
      return computeParticleBounds(bottom, top, PARTICLE_RADIUS.sand);
    }
    case 'sugarBed': {
      const bottom = regions.bed.bottom + sandBedHeight;
      const top = bottom + sugarBedHeight;
      return computeParticleBounds(bottom, top, PARTICLE_RADIUS.sugar);
    }
    case 'sandSusp': {
      if (regions.category === 'oil-only') {
        return computeParticleBounds(regions.oil.bottom, regions.oil.top, PARTICLE_RADIUS.sand);
      }
      return computeParticleBounds(regions.aqueous.bottom, regions.aqueous.top, PARTICLE_RADIUS.sand);
    }
    case 'sugarSusp': {
      if (regions.category === 'oil-only') {
        return computeParticleBounds(regions.oil.bottom, regions.oil.top, PARTICLE_RADIUS.sugar);
      }
      return computeParticleBounds(regions.aqueous.bottom, regions.aqueous.top, PARTICLE_RADIUS.sugar);
    }
    case 'oilDroplet': {
      if (regions.category !== 'mixed') {
        return computeParticleBounds(regions.aqueous.bottom, regions.aqueous.bottom, PARTICLE_RADIUS_OIL_DROPLET);
      }
      return computeParticleBounds(regions.aqueous.bottom, regions.aqueous.top, PARTICLE_RADIUS_OIL_DROPLET);
    }
  }
}

/**
 * Computes the authoritative scalar phase mass for a pool.
 */
export function getPoolPhaseMass(
  kind: PoolKind,
  mass: Readonly<ScienceMassCompartments>,
  fGu: number,
  regions: BeakerRegions
): number {
  const clampedFGu = Math.min(1, Math.max(0, Number.isFinite(fGu) ? fGu : 0));
  switch (kind) {
    case 'sugarBed':
      return Math.max(0, mass.Gu * (1 - clampedFGu));
    case 'sugarSusp':
      return Math.max(0, mass.Gu * clampedFGu);
    case 'sandBed':
      return Math.max(0, mass.Sb);
    case 'sandSusp':
      return Math.max(0, mass.Ss);
    case 'oilDroplet':
      return regions.category === 'mixed' ? Math.max(0, mass.Od) : 0;
  }
}

/**
 * Reconciles pool active count, weights, and spatial projection after phase transfer or command.
 */
export function reconcilePool(
  pool: ParticlePoolData,
  phaseMass: number,
  bounds: ParticleBounds,
  seed: number,
  generation: number
): void {
  pool.bounds = bounds;

  if (phaseMass < VISUAL_HIDE_THRESHOLD_GRAMS || !bounds.active) {
    pool.activeCount = 0;
    pool.weights.fill(0);
    return;
  }

  const targetCount = pool.budget;
  const weightPerParticle = phaseMass / targetCount;
  const wasActive = pool.activeCount > 0;
  const poolDisc = POOL_DISCRIMINATOR[pool.kind];

  if (!wasActive) {
    // Fresh initialization of all particles in pool using stateless hash32
    for (let i = 0; i < targetCount; i++) {
      const birthOrdinal = i;
      pool.birthOrdinals[i] = birthOrdinal;

      const uR = Math.sqrt(sampleUnitFloat(hash32(seed, generation, poolDisc, i, birthOrdinal, 0)));
      const theta = 2.0 * Math.PI * sampleUnitFloat(hash32(seed, generation, poolDisc, i, birthOrdinal, 1));
      const r = uR * bounds.horizontalRadius;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);
      const ySpan = bounds.yTop - bounds.yBottom;
      const y =
        ySpan > 0
          ? bounds.yBottom + sampleUnitFloat(hash32(seed, generation, poolDisc, i, birthOrdinal, 2)) * ySpan
          : bounds.midpointY;

      pool.positions[i * 3] = x;
      pool.positions[i * 3 + 1] = y;
      pool.positions[i * 3 + 2] = z;

      pool.velocities[i * 3] = 0;
      pool.velocities[i * 3 + 1] = 0;
      pool.velocities[i * 3 + 2] = 0;

      pool.weights[i] = weightPerParticle;
      pool.effectiveRadii[i] = bounds.effectiveParticleRadius;
    }
    pool.activeCount = targetCount;
  } else {
    // Retained particles: update weights, clamp out-of-bounds positions, zero outward velocities
    const countToUpdate = Math.min(pool.activeCount, targetCount);
    for (let i = 0; i < countToUpdate; i++) {
      pool.weights[i] = weightPerParticle;
      pool.effectiveRadii[i] = bounds.effectiveParticleRadius;

      const p: [number, number, number] = [
        pool.positions[i * 3],
        pool.positions[i * 3 + 1],
        pool.positions[i * 3 + 2],
      ];
      const v: [number, number, number] = [
        pool.velocities[i * 3],
        pool.velocities[i * 3 + 1],
        pool.velocities[i * 3 + 2],
      ];

      const clamped = clampParticlePositionAndVelocity(p, v, bounds);
      pool.positions[i * 3] = clamped.pNext[0];
      pool.positions[i * 3 + 1] = clamped.pNext[1];
      pool.positions[i * 3 + 2] = clamped.pNext[2];

      pool.velocities[i * 3] = clamped.vNext[0];
      pool.velocities[i * 3 + 1] = clamped.vNext[1];
      pool.velocities[i * 3 + 2] = clamped.vNext[2];
    }

    // If budget expanded, sample additional particles independently
    for (let i = countToUpdate; i < targetCount; i++) {
      const birthOrdinal = i;
      pool.birthOrdinals[i] = birthOrdinal;

      const uR = Math.sqrt(sampleUnitFloat(hash32(seed, generation, poolDisc, i, birthOrdinal, 0)));
      const theta = 2.0 * Math.PI * sampleUnitFloat(hash32(seed, generation, poolDisc, i, birthOrdinal, 1));
      const r = uR * bounds.horizontalRadius;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);
      const ySpan = bounds.yTop - bounds.yBottom;
      const y =
        ySpan > 0
          ? bounds.yBottom + sampleUnitFloat(hash32(seed, generation, poolDisc, i, birthOrdinal, 2)) * ySpan
          : bounds.midpointY;

      pool.positions[i * 3] = x;
      pool.positions[i * 3 + 1] = y;
      pool.positions[i * 3 + 2] = z;

      pool.velocities[i * 3] = 0;
      pool.velocities[i * 3 + 1] = 0;
      pool.velocities[i * 3 + 2] = 0;

      pool.weights[i] = weightPerParticle;
      pool.effectiveRadii[i] = bounds.effectiveParticleRadius;
    }
    pool.activeCount = targetCount;
  }
}

/**
 * Integrates velocity and position of particles in a pool over timestep h according to SCIENTIFIC_SPEC §9.
 */
export function stepPoolTransport(
  pool: ParticlePoolData,
  h: number,
  omegaFlow: number,
  intensity: number,
  elapsedSeconds: number,
  category: BeakerRegions['category']
): void {
  if (pool.activeCount <= 0 || !pool.bounds.active || h <= 0) return;

  const isBed = pool.kind === 'sugarBed' || pool.kind === 'sandBed';
  const isDroplet = pool.kind === 'oilDroplet';
  const isOilOnly = category === 'oil-only';

  const settleSpeed = isOilOnly ? SETTLE_SPEED_OIL : SETTLE_SPEED_WATER;
  const decay = Math.exp(-TRANSPORT_DRAG * h);

  for (let i = 0; i < pool.activeCount; i++) {
    const x = pool.positions[i * 3];
    const y = pool.positions[i * 3 + 1];
    const z = pool.positions[i * 3 + 2];

    const vx = pool.velocities[i * 3];
    const vy = pool.velocities[i * 3 + 1];
    const vz = pool.velocities[i * 3 + 2];

    let targetVx = 0;
    let targetVy = 0;
    let targetVz = 0;

    if (!isBed) {
      const r = Math.hypot(x, z);
      const falloff = computeHorizontalFalloff(r);

      // Horizontal swirl field: 0.25 * omegaFlow * (-z, x) * falloff
      targetVx = -0.25 * omegaFlow * z * falloff;
      targetVz = 0.25 * omegaFlow * x * falloff;

      const turb = computeTurbulentVerticalField(x, y, z, omegaFlow, elapsedSeconds);
      if (isDroplet) {
        // Vertical field: 0.1 * I * turb + riseSpeed
        targetVy = 0.1 * intensity * turb + DROPLET_RISE_SPEED;
      } else {
        // Vertical field: 0.1 * I * turb - settleSpeed
        targetVy = 0.1 * intensity * turb - settleSpeed;
      }
    }

    // Velocity relaxation via exponential drag: vNext = vTarget + (v - vTarget) * exp(-drag * h)
    const nextVx = targetVx + (vx - targetVx) * decay;
    const nextVy = targetVy + (vy - targetVy) * decay;
    const nextVz = targetVz + (vz - targetVz) * decay;

    // Position integration: pNext = p + vNext * h
    const pNext: [number, number, number] = [x + nextVx * h, y + nextVy * h, z + nextVz * h];
    const vNext: [number, number, number] = [nextVx, nextVy, nextVz];

    // Clamping to region bounds and removing outward velocity components
    const clamped = clampParticlePositionAndVelocity(pNext, vNext, pool.bounds);

    pool.positions[i * 3] = clamped.pNext[0];
    pool.positions[i * 3 + 1] = clamped.pNext[1];
    pool.positions[i * 3 + 2] = clamped.pNext[2];

    pool.velocities[i * 3] = clamped.vNext[0];
    pool.velocities[i * 3 + 1] = clamped.vNext[1];
    pool.velocities[i * 3 + 2] = clamped.vNext[2];
  }
}

/**
 * High-level manager orchestrating the 5 representative particle pools,
 * private engine-owned memory, and copyRenderFrame execution.
 */
export class ParticleTransportSystem {
  private readonly pools: Map<PoolKind, ParticlePoolData>;
  private budgetPerPool: number;
  private renderRevision: number = 0;

  constructor(budgetPerPool = DEFAULT_PARTICLE_BUDGET_PER_POOL) {
    this.budgetPerPool = Math.max(1, Math.floor(budgetPerPool));
    this.pools = new Map();
    for (const kind of POOL_KINDS) {
      this.pools.set(kind, createParticlePool(kind, this.budgetPerPool));
    }
  }

  getBudgetPerPool(): number {
    return this.budgetPerPool;
  }

  getRenderRevision(): number {
    return this.renderRevision;
  }

  getPool(kind: PoolKind): Readonly<ParticlePoolData> {
    const pool = this.pools.get(kind);
    if (!pool) throw new Error(`Unknown pool kind: ${kind}`);
    return pool;
  }

  /**
   * Resets all pools on scientific reset (g++).
   */
  reset(): void {
    for (const pool of this.pools.values()) {
      pool.activeCount = 0;
      pool.weights.fill(0);
      pool.positions.fill(0);
      pool.velocities.fill(0);
      pool.birthOrdinals.fill(0);
      pool.effectiveRadii.fill(0);
      pool.bounds = {
        active: false,
        horizontalRadius: 0,
        yBottom: 0,
        yTop: 0,
        midpointY: 0,
        effectiveParticleRadius: 0,
      };
    }
    this.renderRevision++;
  }

  /**
   * Reconfigures particle budget (supports 10, 100, 700).
   * Retains existing particles 0..min(oldN, newN)-1 with birthOrdinals intact.
   */
  setBudgetPerPool(
    newBudget: number,
    mass: Readonly<ScienceMassCompartments>,
    fGu: number,
    regions: BeakerRegions,
    seed: number,
    generation: number
  ): void {
    const safeBudget = Math.max(1, Math.floor(newBudget));
    if (safeBudget === this.budgetPerPool) return;

    this.budgetPerPool = safeBudget;
    for (const kind of POOL_KINDS) {
      const oldPool = this.pools.get(kind)!;
      const newPool = createParticlePool(kind, safeBudget);

      // Copy retained arrays up to min(oldBudget, newBudget)
      const countToKeep = Math.min(oldPool.activeCount, safeBudget);
      newPool.positions.set(oldPool.positions.subarray(0, countToKeep * 3), 0);
      newPool.velocities.set(oldPool.velocities.subarray(0, countToKeep * 3), 0);
      newPool.weights.set(oldPool.weights.subarray(0, countToKeep), 0);
      newPool.birthOrdinals.set(oldPool.birthOrdinals.subarray(0, countToKeep), 0);
      newPool.effectiveRadii.set(oldPool.effectiveRadii.subarray(0, countToKeep), 0);
      newPool.activeCount = countToKeep;
      newPool.bounds = oldPool.bounds;

      this.pools.set(kind, newPool);
    }

    this.reconcile(mass, fGu, regions, seed, generation);
  }

  /**
   * Reconciles all pools after command or phase change.
   */
  reconcile(
    mass: Readonly<ScienceMassCompartments>,
    fGu: number,
    regions: BeakerRegions,
    seed: number,
    generation: number
  ): void {
    for (const kind of POOL_KINDS) {
      const pool = this.pools.get(kind)!;
      const bounds = computePoolBounds(kind, mass, fGu, regions);
      const phaseMass = getPoolPhaseMass(kind, mass, fGu, regions);
      reconcilePool(pool, phaseMass, bounds, seed, generation);
    }
    this.renderRevision++;
  }

  /**
   * Steps transport for all pools during fixed scientific tick.
   */
  step(
    h: number,
    omegaFlow: number,
    intensity: number,
    elapsedSeconds: number,
    category: BeakerRegions['category']
  ): void {
    for (const pool of this.pools.values()) {
      stepPoolTransport(pool, h, omegaFlow, intensity, elapsedSeconds, category);
    }
    this.renderRevision++;
  }

  /**
   * Returns the total active particles count across all pools.
   */
  getTotalActiveCount(): number {
    let total = 0;
    for (const pool of this.pools.values()) {
      total += pool.activeCount;
    }
    return total;
  }

  /**
   * Copies all active particles into caller-owned target arrays without leaking internal views.
   * Atomic validation: throws if target capacity is insufficient BEFORE writing any data.
   */
  copyRenderFrame(
    target: RenderTarget & { radii?: Float32Array },
    generation: number,
    stateVersion: number
  ): RenderStamp {
    if (!target || typeof target !== 'object') {
      throw new TypeError('RenderTarget must be an object');
    }
    if (!(target.positions instanceof Float32Array)) {
      throw new TypeError('RenderTarget.positions must be a Float32Array');
    }
    if (!(target.weights instanceof Float32Array)) {
      throw new TypeError('RenderTarget.weights must be a Float32Array');
    }
    if (!(target.materials instanceof Uint8Array)) {
      throw new TypeError('RenderTarget.materials must be a Uint8Array');
    }
    if (typeof target.count !== 'number' || !Number.isInteger(target.count) || target.count < 0) {
      throw new TypeError('RenderTarget.count must be a non-negative integer');
    }

    const totalActive = this.getTotalActiveCount();

    if (
      target.count < totalActive ||
      target.positions.length < totalActive * 3 ||
      target.weights.length < totalActive ||
      target.materials.length < totalActive
    ) {
      throw new RangeError(
        `RenderTarget insufficient capacity: required ${totalActive} active particles, but target capacity is ${target.count} (positions len: ${target.positions.length}, weights len: ${target.weights.length}, materials len: ${target.materials.length})`
      );
    }

    if (target.radii !== undefined) {
      if (!(target.radii instanceof Float32Array) || target.radii.length < totalActive) {
        throw new RangeError(
          `RenderTarget.radii must be a Float32Array of length at least ${totalActive}`
        );
      }
    }

    if (target.poolIds !== undefined) {
      if (!(target.poolIds instanceof Uint8Array) || target.poolIds.length < totalActive) {
        throw new RangeError(
          `RenderTarget.poolIds must be a Uint8Array of length at least ${totalActive}`
        );
      }
    }

    let offset = 0;
    const poolRanges = {} as Record<PoolKind, RenderPoolRange>;

    for (const pool of this.pools.values()) {
      const count = pool.activeCount;
      poolRanges[pool.kind] = { offset, count };
      if (count <= 0) continue;

      // Copy positions (3 floats per particle)
      target.positions.set(pool.positions.subarray(0, count * 3), offset * 3);

      // Copy weights (1 float per particle)
      target.weights.set(pool.weights.subarray(0, count), offset);

      // Copy materials (1 byte per particle)
      for (let i = 0; i < count; i++) {
        target.materials[offset + i] = pool.material;
      }

      // Copy poolIds if caller provided buffer
      if (target.poolIds) {
        const poolIndex = POOL_KINDS.indexOf(pool.kind);
        for (let i = 0; i < count; i++) {
          target.poolIds[offset + i] = poolIndex;
        }
      }

      // Copy effective radii if caller allocated radii buffer
      if (target.radii) {
        target.radii.set(pool.effectiveRadii.subarray(0, count), offset);
      }

      offset += count;
    }

    return {
      generation,
      stateVersion,
      renderRevision: this.renderRevision,
      count: totalActive,
      poolRanges,
    };
  }
}
