import type { ScienceMassCompartments, ScienceState } from '../core/SimulationState';
import {
  computeWaterCapacityG,
  DISSOLUTION_RATE_BASE,
  DISSOLUTION_RATE_STIRRED,
  epsilonMass,
  significanceThreshold,
} from '../constants/science';
import { applyPairedTransfer, type TransferExecutionResult } from './MassLedger';

export interface DissolutionStepOptions {
  /**
   * Flow stirring intensity normalized to [0, 1].
   */
  intensity: number;

  /**
   * Timestep in simulated seconds (typically h = 1/60 s).
   */
  h: number;

  /**
   * Optional base dissolution rate override (default kG0 = 0.025 s^-1).
   */
  kG0?: number;

  /**
   * Optional stirred rate factor override (default kG1 = 0.25 s^-1).
   */
  kG1?: number;
}

export interface DissolutionStepOutput {
  /**
   * Transferred mass in grams for this timestep (Gu -> Gd).
   */
  dG: number;

  /**
   * Effective kinetic dissolution rate kG in s^-1.
   */
  kG: number;

  /**
   * Maximum solvent capacity in grams of sugar for current water mass.
   */
  capacityG: number;

  /**
   * Remaining capacity headroom (capacityG - Gd).
   */
  gap: number;

  /**
   * Available sugar mass bounded by headroom and undissolved sugar: min(Gu, gap).
   */
  available: number;
}

/**
 * Computes the kinetic dissolution rate constant kG according to SCIENTIFIC_SPEC §5.2:
 * kG = kG0 + kG1 * I
 * Clamps intensity to [0, 1].
 */
export function computeDissolutionRate(
  intensity: number,
  kG0 = DISSOLUTION_RATE_BASE,
  kG1 = DISSOLUTION_RATE_STIRRED
): number {
  if (!Number.isFinite(intensity) || intensity <= 0) {
    return kG0;
  }
  const clampedIntensity = Math.min(1.0, intensity);
  return kG0 + kG1 * clampedIntensity;
}

/**
 * Pure calculation of the dissolution transfer for a single fixed tick.
 * Standard formulas defined in SCIENTIFIC_SPEC §5.2:
 * capacityG = S0 * W
 * gap = max(0, capacityG - Gd)
 * available = min(Gu, gap)
 * kG = kG0 + kG1 * I
 * dG = (W > 0) ? available * (1 - exp(-kG * h)) : 0
 *
 * Uses -Math.expm1(-kG * h) for high numerical precision when kG * h is small.
 */
export function computeDissolutionStep(
  mass: Readonly<ScienceMassCompartments>,
  options: DissolutionStepOptions
): DissolutionStepOutput {
  const { intensity, h, kG0 = DISSOLUTION_RATE_BASE, kG1 = DISSOLUTION_RATE_STIRRED } = options;

  const capacityG = computeWaterCapacityG(mass.W);
  const gap = Math.max(0, capacityG - mass.Gd);
  const available = Math.min(Math.max(0, mass.Gu), gap);
  const kG = computeDissolutionRate(intensity, kG0, kG1);

  let dG = 0;
  if (mass.W > 0 && available > 0 && Number.isFinite(h) && h > 0 && kG > 0) {
    // -expm1(-x) = 1 - exp(-x) with full float precision for small x
    const rateFactor = -Math.expm1(-kG * h);
    dG = Math.min(available, available * rateFactor);
  }

  return {
    dG,
    kG,
    capacityG,
    gap,
    available,
  };
}

/**
 * Applies a single fixed-tick dissolution step to an authoritative ScienceState.
 * Updates mass compartments Gu and Gd atomically via applyPairedTransfer,
 * preserving all scientific mass conservation invariants.
 */
export function stepDissolution(
  state: ScienceState,
  options: DissolutionStepOptions
): TransferExecutionResult {
  const { dG } = computeDissolutionStep(state.mass, options);

  if (dG <= 0) {
    return {
      ok: true,
      transferredGrams: 0,
      pair: 'sugar_dissolution',
      sourceBefore: state.mass.Gu,
      destBefore: state.mass.Gd,
      sourceAfter: state.mass.Gu,
      destAfter: state.mass.Gd,
      total: state.mass.Gt,
    };
  }

  return applyPairedTransfer(state, {
    pair: 'sugar_dissolution',
    requestedGrams: dG,
  });
}

/**
 * Closed-form analytical solution for sugar dissolution under constant flow intensity.
 * Used as an independent mathematical oracle for unit test verification (SPEC §5.2 & §8.1).
 *
 * limit = min(Gt, capacityG)
 * Gd(t) = limit - (limit - initialGd) * exp(-kG * t)
 */
export function computeAnalyticDissolution(
  t: number,
  W: number,
  Gt: number,
  intensity: number,
  initialGd = 0,
  kG0 = DISSOLUTION_RATE_BASE,
  kG1 = DISSOLUTION_RATE_STIRRED
): number {
  if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(W) || W <= 0 || !Number.isFinite(Gt) || Gt <= 0) {
    return initialGd;
  }

  const capacityG = computeWaterCapacityG(W);
  const limit = Math.min(Gt, capacityG);
  if (limit <= 0) {
    return initialGd;
  }

  const kG = computeDissolutionRate(intensity, kG0, kG1);
  const clampedInitial = Math.min(limit, Math.max(0, initialGd));
  return limit - (limit - clampedInitial) * Math.exp(-kG * t);
}

// ----------------------------------------------------------------------------
// Educational / UX Predicates (SCIENTIFIC_SPEC §8)
// ----------------------------------------------------------------------------

/**
 * Computes saturation ratio: Gd / capacityG.
 * Returns null if no water is present (W === 0) or capacity is 0 (SPEC §8).
 */
export function computeSaturationRatio(
  Gd: number,
  capacityG: number,
  W: number
): number | null {
  if (!Number.isFinite(W) || W <= 0 || !Number.isFinite(capacityG) || capacityG <= 0) {
    return null;
  }
  return Gd / capacityG;
}

/**
 * Computes dissolution progress relative to maximum dissolvable sugar:
 * progress = Gd / min(Gt, capacityG).
 * Returns null if no water is present or dissolvable amount is 0 (SPEC §8).
 */
export function computeDissolutionProgress(
  Gd: number,
  Gt: number,
  capacityG: number,
  W: number
): number | null {
  if (!Number.isFinite(W) || W <= 0) {
    return null;
  }
  const dissolvable = Math.min(Gt, capacityG);
  if (!Number.isFinite(dissolvable) || dissolvable <= 0) {
    return null;
  }
  return Gd / dissolvable;
}

/**
 * Determines if solution is near saturation (saturation ratio >= 0.99).
 */
export function isNearSaturation(Gd: number, capacityG: number): boolean {
  if (!Number.isFinite(capacityG) || capacityG <= 0) {
    return false;
  }
  return Gd / capacityG >= 0.99;
}

/**
 * Determines if the mixture has excess sugar exceeding solvent capacity (Gt > capacityG + eps).
 */
export function hasExcessSugar(Gt: number, capacityG: number, W: number): boolean {
  if (!Number.isFinite(W) || W <= 0) {
    return false;
  }
  const eps = epsilonMass(Gt);
  return Gt > capacityG + eps;
}

/**
 * Determines if undissolved sugar remains above the educational significance threshold (Gu > L(Gt)).
 */
export function hasResidualSolidSugar(Gu: number, Gt: number): boolean {
  if (!Number.isFinite(Gu) || Gu <= 0) {
    return false;
  }
  const L = significanceThreshold(Gt);
  return Gu > L;
}
