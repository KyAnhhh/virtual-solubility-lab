import { BEAKER_BASE_Y, computeTipY } from '../constants/beaker';
import type { AutoLevel, Mode } from './SimulationEngine';

export type DeepReadonly<T> = T extends (infer R)[]
  ? ReadonlyArray<DeepReadonly<R>>
  : T extends (...args: readonly unknown[]) => unknown
  ? T
  : T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

export interface RodPose {
  x: number;
  z: number;
  tipY: number;
  theta: number;
  radius: number;
}

export interface ScienceInputTicks {
  water: number;
  oil: number;
  sugar: number;
  sand: number;
}

export interface ScienceMassCompartments {
  W: number;  // water mass in grams
  Gt: number; // total sugar in grams
  Gu: number; // undissolved sugar in grams
  Gd: number; // dissolved sugar in grams
  St: number; // total sand in grams
  Sb: number; // bed sand in grams
  Ss: number; // suspended sand in grams
  Ot: number; // total oil in grams
  Ol: number; // layered oil in grams
  Od: number; // dispersed oil droplets in grams
}

export interface ScienceState {
  generation: number;
  stateVersion: number;
  tickIndex: number;
  elapsedSeconds: number;
  seed: number;
  paused: boolean;
  mode: Mode;
  autoDriveEnabled: boolean;
  autoLevel: AutoLevel;
  input: ScienceInputTicks;
  mass: ScienceMassCompartments;
  fGu: number; // suspended fraction of undissolved sugar [0, 1]
  rod: RodPose;
  omegaRod: number;
  omegaDrive: number;
  omegaFlow: number;
}

export type ScalarSnapshot = DeepReadonly<{
  generation: number;
  stateVersion: number;
  tickIndex: number;
  elapsedSeconds: number;
  paused: boolean;
  mode: Mode;
  autoDriveEnabled: boolean;
  autoLevel: AutoLevel;
  input: ScienceState['input'];
  mass: ScienceState['mass'];
  fGu: number;
  rod: RodPose;
  intensity: number;
  contact: number;
  capacityG: number;
  saturationRatio: number | null;
  dissolutionProgress: number | null;
}>;

export interface ClockConfig {
  h: number;            // simulation timestep, default 1/60 s
  maxRealDelta: number; // maximum clamped real dt per frame, default 0.1 s
  maxSteps: number;     // maximum sub-steps per frame, default 6
}

export const MATERIAL_IDS = {
  sugar: 0,
  sand: 1,
  oilDroplet: 2,
} as const;

export type MaterialId = typeof MATERIAL_IDS[keyof typeof MATERIAL_IDS];

export type PoolKind =
  | 'sugarBed'
  | 'sugarSusp'
  | 'sandBed'
  | 'sandSusp'
  | 'oilDroplet';

export interface RenderPoolRange {
  offset: number;
  count: number;
}

export interface RenderTarget {
  positions: Float32Array; // 3 floats per particle: [x, y, z] -> length >= count * 3
  weights: Float32Array;   // 1 float per particle: mass weight in grams -> length >= count
  materials: Uint8Array;   // 1 byte per particle: MaterialId -> length >= count
  count: number;           // maximum particle capacity allocated by caller
  radii?: Float32Array;    // optional: 1 float per particle: effective particle radius
  poolIds?: Uint8Array;    // optional: 1 byte per particle: PoolKind index (0..4)
}

export interface RenderStamp {
  generation: number;
  stateVersion: number;
  renderRevision: number;
  count: number;           // actual active particles copied into caller-owned target
  poolRanges?: Record<PoolKind, RenderPoolRange>;
}

// Backward-compatibility aliases for legacy interfaces
export type SimulationState = ScienceState;
export interface ParticleState {
  id: number;
  material: 'sugar' | 'sand';
  position: [number, number, number];
  velocity: [number, number, number];
  massGrams: number;
}

export const DEFAULT_SEED = 1729;

/**
 * Validates that seed is an unsigned 32-bit integer (0 to 4294967295).
 * Defaults to 1729 if undefined.
 */
export function normalizeSeed(seed?: unknown): number {
  if (seed === undefined) return DEFAULT_SEED;
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new TypeError(
      `Seed must be an unsigned 32-bit integer (0 to 4294967295), received: ${String(seed)}`
    );
  }
  return seed >>> 0;
}

/**
 * Creates a brand new, isolated initial ScienceState at g0/v0/tick0/time0.
 * Allocates fresh nested objects for input, mass, and rod to ensure reference isolation.
 */
export function createInitialScienceState(seed?: number): ScienceState {
  const normalizedSeed = normalizeSeed(seed);
  return {
    generation: 0,
    stateVersion: 0,
    tickIndex: 0,
    elapsedSeconds: 0,
    seed: normalizedSeed,
    paused: true,
    mode: 'observe',
    autoDriveEnabled: false,
    autoLevel: 'slow',
    input: {
      water: 0,
      oil: 0,
      sugar: 0,
      sand: 0,
    },
    mass: {
      W: 0,
      Gt: 0,
      Gu: 0,
      Gd: 0,
      St: 0,
      Sb: 0,
      Ss: 0,
      Ot: 0,
      Ol: 0,
      Od: 0,
    },
    fGu: 0,
    rod: {
      x: 0.3,
      z: 0,
      tipY: computeTipY(BEAKER_BASE_Y), // 0.14
      theta: 0,
      radius: 0.3,
    },
    omegaRod: 0,
    omegaDrive: 0,
    omegaFlow: 0,
  };
}

/**
 * Creates a completely detached, unaliased deep copy of ScienceState.
 * Clones all nested objects (input, mass, rod) to guarantee strict state encapsulation.
 */
export function cloneScienceState(state: ScienceState): ScienceState {
  return {
    generation: state.generation,
    stateVersion: state.stateVersion,
    tickIndex: state.tickIndex,
    elapsedSeconds: state.elapsedSeconds,
    seed: state.seed,
    paused: state.paused,
    mode: state.mode,
    autoDriveEnabled: state.autoDriveEnabled,
    autoLevel: state.autoLevel,
    input: {
      water: state.input.water,
      oil: state.input.oil,
      sugar: state.input.sugar,
      sand: state.input.sand,
    },
    mass: {
      W: state.mass.W,
      Gt: state.mass.Gt,
      Gu: state.mass.Gu,
      Gd: state.mass.Gd,
      St: state.mass.St,
      Sb: state.mass.Sb,
      Ss: state.mass.Ss,
      Ot: state.mass.Ot,
      Ol: state.mass.Ol,
      Od: state.mass.Od,
    },
    fGu: state.fGu,
    rod: {
      x: state.rod.x,
      z: state.rod.z,
      tipY: state.rod.tipY,
      theta: state.rod.theta,
      radius: state.rod.radius,
    },
    omegaRod: state.omegaRod,
    omegaDrive: state.omegaDrive,
    omegaFlow: state.omegaFlow,
  };
}
