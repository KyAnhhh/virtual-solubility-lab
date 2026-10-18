import type { ScienceMassCompartments, ScienceState } from '../core/SimulationState';
import {
  DENSITY_OIL,
  SAND_LIFT_MAX,
  SAND_SETTLE_OIL,
  SAND_SETTLE_WATER,
} from '../constants/science';
import {
  applyPairedTransfer,
  type PhaseTransferPair,
  type TransferExecutionResult,
} from './MassLedger';

export interface SandStepOptions {
  /**
   * Flow stirring intensity normalized to [0, 1].
   */
  intensity: number;

  /**
   * Timestep in simulated seconds (typically h = 1/60 s).
   */
  h: number;

  /**
   * Optional lift coefficient override (default kLiftMax = 0.6 s^-1).
   */
  kLiftMax?: number;

  /**
   * Optional water sedimentation rate override (default settleWater = 0.15 s^-1).
   */
  settleWater?: number;

  /**
   * Optional oil sedimentation rate override (default settleOil = 0.06 s^-1).
   */
  settleOil?: number;
}

export interface SandStepOutput {
  /**
   * Transferred mass in grams for this timestep.
   */
  dTransfer: number;

  /**
   * Phase transfer pair ('sand_suspension' or 'sand_sedimentation' or null).
   */
  pair: PhaseTransferPair | null;

  /**
   * Equilibrium suspended sand mass in grams.
   */
  SsEq: number;

  /**
   * Next suspended sand mass before state commit.
   */
  SsNext: number;

  /**
   * Next bed sand mass before state commit.
   */
  SbNext: number;

  /**
   * Effective lift rate (s^-1).
   */
  kLift: number;

  /**
   * Effective settling rate (s^-1).
   */
  kSettle: number;

  /**
   * Total exchange rate lambda = kLift + kSettle (s^-1).
   */
  lambda: number;

  /**
   * Carrier volumetric fraction of water in total liquid.
   */
  waterFraction: number;

  /**
   * Whether liquid carrier (water or oil) is present.
   */
  hasCarrier: boolean;
}

/**
 * Computes volumetric carrier fractions according to SCIENTIFIC_SPEC §5.3:
 * Wml = W / rhoW (rhoW = 1.0 g/ml)
 * Oml = Ot / rhoO (rhoO = 0.9 g/ml)
 * waterFraction = Wml / (Wml + Oml)
 */
export function computeCarrierFractions(
  mass: Readonly<Pick<ScienceMassCompartments, 'W' | 'Ot'>>
): {
  Wml: number;
  Oml: number;
  totalLiquidMl: number;
  waterFraction: number;
  hasCarrier: boolean;
} {
  const Wml = Math.max(0, Number.isFinite(mass.W) ? mass.W : 0);
  const Oml = Math.max(0, Number.isFinite(mass.Ot) ? mass.Ot / DENSITY_OIL : 0);
  const totalLiquidMl = Wml + Oml;

  if (totalLiquidMl <= 1e-9) {
    return {
      Wml,
      Oml,
      totalLiquidMl: 0,
      waterFraction: 0,
      hasCarrier: false,
    };
  }

  return {
    Wml,
    Oml,
    totalLiquidMl,
    waterFraction: Wml / totalLiquidMl,
    hasCarrier: true,
  };
}

/**
 * Computes suspension dynamic rates kLift, kSettle, and lambda according to SCIENTIFIC_SPEC §5.3:
 * kLift = kLiftMax * I^2
 * kSettleBase = settleWater * waterFraction + settleOil * (1 - waterFraction)
 * kSettle = kSettleBase / (1 + 2 * I)
 * lambda = kLift + kSettle
 */
export function computeSuspensionRates(
  intensity: number,
  waterFraction: number,
  hasCarrier: boolean,
  kLiftMax = SAND_LIFT_MAX,
  settleWater = SAND_SETTLE_WATER,
  settleOil = SAND_SETTLE_OIL
): {
  kLift: number;
  kSettle: number;
  lambda: number;
} {
  if (!hasCarrier) {
    return { kLift: 0, kSettle: 0, lambda: 0 };
  }

  const clampedI = Math.min(1.0, Math.max(0.0, Number.isFinite(intensity) ? intensity : 0));
  const clampedWf = Math.min(1.0, Math.max(0.0, Number.isFinite(waterFraction) ? waterFraction : 0));

  const kLift = kLiftMax * clampedI * clampedI;
  const kSettleBase = settleWater * clampedWf + settleOil * (1.0 - clampedWf);
  const kSettle = kSettleBase / (1.0 + 2.0 * clampedI);
  const lambda = kLift + kSettle;

  return { kLift, kSettle, lambda };
}

/**
 * Pure calculation of the sand suspension step (Sb <-> Ss) without mutating state.
 * Standard formulas defined in SCIENTIFIC_SPEC §5.3.
 */
export function computeSandSuspensionStep(
  mass: Readonly<ScienceMassCompartments>,
  options: SandStepOptions
): SandStepOutput {
  const { intensity, h, kLiftMax, settleWater, settleOil } = options;

  if (!Number.isFinite(h) || h < 0) {
    throw new Error(`Invalid timestep h in computeSandSuspensionStep: ${h}`);
  }

  const { waterFraction, hasCarrier } = computeCarrierFractions(mass);
  const { kLift, kSettle, lambda } = computeSuspensionRates(
    intensity,
    waterFraction,
    hasCarrier,
    kLiftMax,
    settleWater,
    settleOil
  );

  const St = Math.max(0, Number.isFinite(mass.St) ? mass.St : 0);
  const Ss = Math.max(0, Number.isFinite(mass.Ss) ? mass.Ss : 0);
  const Sb = Math.max(0, Number.isFinite(mass.Sb) ? mass.Sb : 0);

  // 1. Dry carrier gate: when no water or oil is present, all sand settles to bed
  if (!hasCarrier) {
    if (Ss > 0) {
      return {
        dTransfer: Ss,
        pair: 'sand_sedimentation',
        SsEq: 0,
        SsNext: 0,
        SbNext: St,
        kLift: 0,
        kSettle: 0,
        lambda: 0,
        waterFraction: 0,
        hasCarrier: false,
      };
    }
    return {
      dTransfer: 0,
      pair: null,
      SsEq: 0,
      SsNext: 0,
      SbNext: St,
      kLift: 0,
      kSettle: 0,
      lambda: 0,
      waterFraction: 0,
      hasCarrier: false,
    };
  }

  // 2. Wet carrier: zero total sand or degenerate zero lambda
  if (St <= 1e-12) {
    return {
      dTransfer: 0,
      pair: null,
      SsEq: 0,
      SsNext: 0,
      SbNext: 0,
      kLift,
      kSettle,
      lambda,
      waterFraction,
      hasCarrier: true,
    };
  }

  if (lambda <= 1e-12 || h === 0) {
    return {
      dTransfer: 0,
      pair: null,
      SsEq: 0,
      SsNext: Ss,
      SbNext: Sb,
      kLift,
      kSettle,
      lambda,
      waterFraction,
      hasCarrier: true,
    };
  }

  // 3. Equilibrium and exponential continuous step
  const SsEq = (St * kLift) / lambda;
  // expm1(-x) = exp(-x) - 1, so -expm1(-x) = 1 - exp(-x)
  const decayFactor = -Math.expm1(-lambda * h);
  const dSs = (SsEq - Ss) * decayFactor;
  let SsNext = Ss + dSs;

  // Numerical bounding within [0, St]
  if (SsNext < 0) {
    SsNext = 0;
  } else if (SsNext > St) {
    SsNext = St;
  }
  const SbNext = St - SsNext;

  if (SsNext > Ss) {
    const dTransfer = Math.min(Sb, SsNext - Ss);
    return {
      dTransfer,
      pair: 'sand_suspension',
      SsEq,
      SsNext,
      SbNext,
      kLift,
      kSettle,
      lambda,
      waterFraction,
      hasCarrier: true,
    };
  }

  if (SsNext < Ss) {
    const dTransfer = Math.min(Ss, Ss - SsNext);
    return {
      dTransfer,
      pair: 'sand_sedimentation',
      SsEq,
      SsNext,
      SbNext,
      kLift,
      kSettle,
      lambda,
      waterFraction,
      hasCarrier: true,
    };
  }

  return {
    dTransfer: 0,
    pair: null,
    SsEq,
    SsNext: Ss,
    SbNext: Sb,
    kLift,
    kSettle,
    lambda,
    waterFraction,
    hasCarrier: true,
  };
}

/**
 * Pure calculation of the undissolved sugar suspended fraction fGu step according to SCIENTIFIC_SPEC §4.2:
 * fEq = kLift / lambda
 * fGuNext = fEq + (fGu - fEq) * exp(-lambda * h)
 *
 * Rules:
 * - When Gu === 0 or dry (no liquid carrier): fGuNext = 0.
 * - When wet and Gu > 0: follows identical lift & settle rates as sand.
 * - If lambda === 0: preserves current fGu.
 * - Result is strictly bounded in [0, 1].
 */
export function computeFGuStep(
  fGu: number,
  Gu: number,
  options: SandStepOptions,
  carrierInfo?: { waterFraction: number; hasCarrier: boolean }
): number {
  if (!Number.isFinite(Gu) || Gu <= 0) {
    return 0;
  }

  const { intensity, h, kLiftMax, settleWater, settleOil } = options;
  if (!Number.isFinite(h) || h < 0) {
    throw new Error(`Invalid timestep h in computeFGuStep: ${h}`);
  }

  const hasCarrier = carrierInfo?.hasCarrier ?? true;
  const waterFraction = carrierInfo?.waterFraction ?? 1.0;

  if (!hasCarrier) {
    return 0;
  }

  const { kLift, lambda } = computeSuspensionRates(
    intensity,
    waterFraction,
    hasCarrier,
    kLiftMax,
    settleWater,
    settleOil
  );

  if (lambda <= 1e-12 || h === 0) {
    return Math.min(1.0, Math.max(0.0, Number.isFinite(fGu) ? fGu : 0));
  }

  const fEq = kLift / lambda;
  const currentFGu = Math.min(1.0, Math.max(0.0, Number.isFinite(fGu) ? fGu : 0));
  const decayFactor = -Math.expm1(-lambda * h);
  const df = (fEq - currentFGu) * decayFactor;
  const nextFGu = currentFGu + df;

  return Math.min(1.0, Math.max(0.0, nextFGu));
}

/**
 * Applies a single fixed-tick sand suspension and fGu step to an authoritative ScienceState.
 * - Updates fGu deterministically according to §4.2.
 * - Updates mass compartments Sb and Ss atomically via applyPairedTransfer.
 * - Preserves all scientific mass conservation invariants.
 */
export function stepSandSuspension(
  state: ScienceState,
  options: SandStepOptions
): TransferExecutionResult | null {
  const carrierInfo = computeCarrierFractions(state.mass);

  // 1. Advance fGu kinematic state
  state.fGu = computeFGuStep(state.fGu, state.mass.Gu, options, carrierInfo);

  // 2. Advance sand suspension/sedimentation
  const sandOutput = computeSandSuspensionStep(state.mass, options);

  if (sandOutput.dTransfer <= 0 || !sandOutput.pair) {
    return null;
  }

  return applyPairedTransfer(state, {
    pair: sandOutput.pair,
    requestedGrams: sandOutput.dTransfer,
  });
}

// ----------------------------------------------------------------------------
// Continuous Analytical Oracles (for independent test verification)
// ----------------------------------------------------------------------------

export interface AnalyticSandOptions {
  waterFraction?: number;
  hasCarrier?: boolean;
  kLiftMax?: number;
  settleWater?: number;
  settleOil?: number;
}

/**
 * Computes exact continuous analytical solution for sand suspension at simulated time t (seconds)
 * under constant flow intensity and carrier composition:
 * Ss(t) = SsEq + (initialSs - SsEq) * exp(-lambda * t)
 */
export function computeAnalyticSandSuspension(
  t: number,
  initialSs: number,
  St: number,
  intensity: number,
  options?: AnalyticSandOptions
): number {
  if (t <= 0) return initialSs;
  const hasCarrier = options?.hasCarrier ?? true;
  if (!hasCarrier) return 0;

  const waterFraction = options?.waterFraction ?? 1.0;
  const { kLift, lambda } = computeSuspensionRates(
    intensity,
    waterFraction,
    hasCarrier,
    options?.kLiftMax,
    options?.settleWater,
    options?.settleOil
  );

  if (lambda <= 1e-12) return initialSs;
  const SsEq = (St * kLift) / lambda;
  return SsEq + (initialSs - SsEq) * Math.exp(-lambda * t);
}

/**
 * Computes exact continuous analytical solution for fGu at simulated time t (seconds)
 * under constant flow intensity and carrier composition:
 * fGu(t) = fEq + (initialFGu - fEq) * exp(-lambda * t)
 */
export function computeAnalyticFGu(
  t: number,
  initialFGu: number,
  intensity: number,
  options?: AnalyticSandOptions
): number {
  if (t <= 0) return initialFGu;
  const hasCarrier = options?.hasCarrier ?? true;
  if (!hasCarrier) return 0;

  const waterFraction = options?.waterFraction ?? 1.0;
  const { kLift, lambda } = computeSuspensionRates(
    intensity,
    waterFraction,
    hasCarrier,
    options?.kLiftMax,
    options?.settleWater,
    options?.settleOil
  );

  if (lambda <= 1e-12) return initialFGu;
  const fEq = kLift / lambda;
  return fEq + (initialFGu - fEq) * Math.exp(-lambda * t);
}
