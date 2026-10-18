import type { ScienceMassCompartments, ScienceState } from '../core/SimulationState';
import {
  DENSITY_OIL,
  OIL_BREAKUP_COEFF,
  OIL_SEPARATE_BASE,
} from '../constants/science';
import {
  applyPairedTransfer,
  type PhaseTransferPair,
  type TransferExecutionResult,
} from './MassLedger';

export interface OilStepOptions {
  /**
   * Stirring flow intensity normalized to [0, 1].
   */
  intensity: number;

  /**
   * Timestep in simulated seconds (typically h = 1/60 s).
   */
  h: number;

  /**
   * Optional breakup rate coefficient override (default OIL_BREAKUP_COEFF = 0.5 s^-1).
   */
  kBreakCoeff?: number;

  /**
   * Optional separation base rate override (default OIL_SEPARATE_BASE = 0.10 s^-1).
   */
  kSeparateBase?: number;
}

export interface OilStepOutput {
  /**
   * Transferred mass in grams for this timestep.
   */
  dTransfer: number;

  /**
   * Phase transfer pair ('oil_dispersion' or 'oil_separation' or null).
   */
  pair: PhaseTransferPair | null;

  /**
   * Equilibrium dispersed oil mass in grams.
   */
  OdEq: number;

  /**
   * Next dispersed oil mass before state commit.
   */
  OdNext: number;

  /**
   * Next layered oil mass before state commit.
   */
  OlNext: number;

  /**
   * Effective breakup rate kBreak (s^-1).
   */
  kBreak: number;

  /**
   * Effective separation rate kSeparate (s^-1).
   */
  kSeparate: number;

  /**
   * Total exchange rate lambda = kBreak + kSeparate (s^-1).
   */
  lambda: number;

  /**
   * Volumetric fraction of water in total liquid carrier.
   */
  waterFraction: number;

  /**
   * Whether both water and oil are present to support dispersion.
   */
  hasBothWaterAndOil: boolean;
}

/**
 * Computes volumetric carrier fractions according to SCIENTIFIC_SPEC §4.2, §5.4:
 * Wml = W / rhoW (rhoW = 1.0 g/ml)
 * Oml = Ot / rhoO (rhoO = 0.9 g/ml) - using total oil Ot, not just layered oil.
 * waterFraction = Wml / (Wml + Oml)
 *
 * Note on threshold: totalLiquidMl <= 1e-9 is a floating-point zero guard for Wml + Oml == 0.
 * Since the minimum user addition is 1 deciTick (0.1 ml or 0.1 g / 0.09 g), any valid liquid
 * addition yields >= 0.1 ml >> 1e-9 ml. Thus this threshold never alters physical semantics.
 */
export function computeOilCarrierFractions(
  mass: Readonly<Pick<ScienceMassCompartments, 'W' | 'Ot'>>
): {
  Wml: number;
  Oml: number;
  totalLiquidMl: number;
  waterFraction: number;
  hasBothWaterAndOil: boolean;
} {
  const Wml = Math.max(0, Number.isFinite(mass.W) ? mass.W : 0);
  const Oml = Math.max(0, Number.isFinite(mass.Ot) ? mass.Ot / DENSITY_OIL : 0);
  const totalLiquidMl = Wml + Oml;

  if (Wml <= 1e-9 || Oml <= 1e-9 || totalLiquidMl <= 1e-9) {
    return {
      Wml,
      Oml,
      totalLiquidMl,
      waterFraction: totalLiquidMl > 1e-9 ? Wml / totalLiquidMl : 0,
      hasBothWaterAndOil: false,
    };
  }

  return {
    Wml,
    Oml,
    totalLiquidMl,
    waterFraction: Wml / totalLiquidMl,
    hasBothWaterAndOil: true,
  };
}

/**
 * Computes breakup rate kBreak, separation rate kSeparate, and lambda according to SCIENTIFIC_SPEC §5.4:
 * kBreak = kBreakCoeff * I^2 * waterFraction
 * kSeparate = kSeparateBase / (1 + 3 * I)
 * lambda = kBreak + kSeparate
 */
export function computeOilRates(
  intensity: number,
  waterFraction: number,
  hasBothWaterAndOil: boolean,
  kBreakCoeff = OIL_BREAKUP_COEFF,
  kSeparateBase = OIL_SEPARATE_BASE
): {
  kBreak: number;
  kSeparate: number;
  lambda: number;
} {
  if (!hasBothWaterAndOil) {
    return { kBreak: 0, kSeparate: 0, lambda: 0 };
  }

  const clampedI = Math.min(1.0, Math.max(0.0, Number.isFinite(intensity) ? intensity : 0));
  const clampedWf = Math.min(1.0, Math.max(0.0, Number.isFinite(waterFraction) ? waterFraction : 0));

  const kBreak = kBreakCoeff * clampedI * clampedI * clampedWf;
  const kSeparate = kSeparateBase / (1.0 + 3.0 * clampedI);
  const lambda = kBreak + kSeparate;

  return { kBreak, kSeparate, lambda };
}

/**
 * Pure calculation of the oil exchange step (Ol <-> Od) without mutating state.
 * Equations and contracts defined in SCIENTIFIC_SPEC §5.4 and §10:
 *
 * if Wml == 0 or Ot == 0:
 *   OdNext = 0; OlNext = Ot
 * else:
 *   kBreak = 0.5 * I^2 * waterFraction
 *   kSeparate = 0.10 / (1 + 3 * I)
 *   lambda = kBreak + kSeparate
 *   OdEq = Ot * kBreak / lambda
 *   OdNext = OdEq + (Od - OdEq) * exp(-lambda * h)
 *   OlNext = Ot - OdNext
 */
export function computeOilSeparationStep(
  mass: Readonly<ScienceMassCompartments>,
  options: OilStepOptions
): OilStepOutput {
  const { intensity, h, kBreakCoeff, kSeparateBase } = options;

  if (!Number.isFinite(h) || h < 0) {
    throw new Error(`Invalid timestep h in computeOilSeparationStep: ${h}`);
  }

  const { waterFraction, hasBothWaterAndOil } = computeOilCarrierFractions(mass);
  const { kBreak, kSeparate, lambda } = computeOilRates(
    intensity,
    waterFraction,
    hasBothWaterAndOil,
    kBreakCoeff,
    kSeparateBase
  );

  const Ot = Math.max(0, Number.isFinite(mass.Ot) ? mass.Ot : 0);
  const Ol = Math.max(0, Number.isFinite(mass.Ol) ? mass.Ol : 0);
  const Od = Math.max(0, Number.isFinite(mass.Od) ? mass.Od : 0);

  // 1. If water or oil is absent (e.g. water-only, oil-only, dry), Od cannot exist as dispersed droplets
  if (!hasBothWaterAndOil) {
    if (Od > 0) {
      // Recombine any residual dispersed oil into layered oil
      return {
        dTransfer: Od,
        pair: 'oil_separation',
        OdEq: 0,
        OdNext: 0,
        OlNext: Ot,
        kBreak: 0,
        kSeparate: 0,
        lambda: 0,
        waterFraction,
        hasBothWaterAndOil: false,
      };
    }
    return {
      dTransfer: 0,
      pair: null,
      OdEq: 0,
      OdNext: 0,
      OlNext: Ot,
      kBreak: 0,
      kSeparate: 0,
      lambda: 0,
      waterFraction,
      hasBothWaterAndOil: false,
    };
  }

  // 2. Both water and oil are present: zero total oil or zero timestep / zero lambda
  if (Ot <= 1e-12) {
    return {
      dTransfer: 0,
      pair: null,
      OdEq: 0,
      OdNext: 0,
      OlNext: 0,
      kBreak,
      kSeparate,
      lambda,
      waterFraction,
      hasBothWaterAndOil: true,
    };
  }

  if (lambda <= 1e-12 || h === 0) {
    return {
      dTransfer: 0,
      pair: null,
      OdEq: 0,
      OdNext: Od,
      OlNext: Ol,
      kBreak,
      kSeparate,
      lambda,
      waterFraction,
      hasBothWaterAndOil: true,
    };
  }

  // 3. Continuous exponential step toward equilibrium
  const OdEq = (Ot * kBreak) / lambda;
  // expm1(-x) = exp(-x) - 1, so -expm1(-x) = 1 - exp(-x)
  const decayFactor = -Math.expm1(-lambda * h);
  const dOd = (OdEq - Od) * decayFactor;
  let OdNext = Od + dOd;

  // Numerical bounding within [0, Ot]
  if (OdNext < 0) {
    OdNext = 0;
  } else if (OdNext > Ot) {
    OdNext = Ot;
  }
  const OlNext = Ot - OdNext;

  if (OdNext > Od) {
    const dTransfer = Math.min(Ol, OdNext - Od);
    return {
      dTransfer,
      pair: 'oil_dispersion',
      OdEq,
      OdNext,
      OlNext,
      kBreak,
      kSeparate,
      lambda,
      waterFraction,
      hasBothWaterAndOil: true,
    };
  }

  if (OdNext < Od) {
    const dTransfer = Math.min(Od, Od - OdNext);
    return {
      dTransfer,
      pair: 'oil_separation',
      OdEq,
      OdNext,
      OlNext,
      kBreak,
      kSeparate,
      lambda,
      waterFraction,
      hasBothWaterAndOil: true,
    };
  }

  return {
    dTransfer: 0,
    pair: null,
    OdEq,
    OdNext: Od,
    OlNext: Ol,
    kBreak,
    kSeparate,
    lambda,
    waterFraction,
    hasBothWaterAndOil: true,
  };
}

/**
 * Executes one timestep of oil exchange on the authoritative ScienceState.
 * Updates state.mass.Ol and state.mass.Od via atomic applyPairedTransfer.
 */
export function stepOilSeparation(
  state: ScienceState,
  options: OilStepOptions
): TransferExecutionResult {
  const result = computeOilSeparationStep(state.mass, options);

  if (!result.pair || result.dTransfer <= 0) {
    return {
      ok: true,
      transferredGrams: 0,
      pair: 'oil_dispersion',
      sourceBefore: state.mass.Ol,
      destBefore: state.mass.Od,
      sourceAfter: state.mass.Ol,
      destAfter: state.mass.Od,
      total: state.mass.Ot,
    };
  }

  return applyPairedTransfer(state, {
    pair: result.pair,
    requestedGrams: result.dTransfer,
  });
}

// ----------------------------------------------------------------------------
// Analytical Oracles for Tests and Calibration
// ----------------------------------------------------------------------------

export interface AnalyticOilOptions {
  waterFraction?: number;
  hasBothWaterAndOil?: boolean;
  kBreakCoeff?: number;
  kSeparateBase?: number;
}

/**
 * Computes exact continuous analytical solution for dispersed oil mass Od at simulated time t (seconds)
 * under constant flow intensity and liquid composition:
 * Od(t) = OdEq + (initialOd - OdEq) * exp(-lambda * t)
 */
export function computeAnalyticOilSeparation(
  t: number,
  initialOd: number,
  Ot: number,
  intensity: number,
  options?: AnalyticOilOptions
): number {
  if (t <= 0) return initialOd;
  const hasBoth = options?.hasBothWaterAndOil ?? true;
  if (!hasBoth) return 0;

  const waterFraction = options?.waterFraction ?? 1.0;
  const { kBreak, lambda } = computeOilRates(
    intensity,
    waterFraction,
    hasBoth,
    options?.kBreakCoeff,
    options?.kSeparateBase
  );

  if (lambda <= 1e-12) return initialOd;
  const OdEq = (Ot * kBreak) / lambda;
  return OdEq + (initialOd - OdEq) * Math.exp(-lambda * t);
}
