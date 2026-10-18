import {
  computeWaterCapacityG,
  epsilonMass,
  MAX_RESERVATION_MILLI_ML,
  ticksToOilMassG,
  ticksToSandMassG,
  ticksToSugarMassG,
  ticksToWaterMassG,
} from '../constants/science';
import { VISUAL_MILLI_ML_PER_TICK } from '../constants/ingredients';
import type { ScienceMassCompartments, ScienceState } from '../core/SimulationState';

export interface InvariantViolation {
  name: string;
  ingredient?: string;
  phase?: string;
  expected: number | string;
  actual: number | string;
  tolerance?: string;
  message: string;
  generation?: number;
  tickIndex?: number;
  stateVersion?: number;
}

export interface InvariantContext {
  generation?: number;
  tickIndex?: number;
  stateVersion?: number;
  stage?: string;
}

export class MassInvariantError extends Error {
  public readonly violations: readonly InvariantViolation[];
  public readonly context?: InvariantContext;

  constructor(violations: InvariantViolation[], context?: InvariantContext) {
    const summary = violations
      .map(
        (v) =>
          `[${v.name}] ${v.ingredient ?? ''}${v.phase ? `/${v.phase}` : ''}: expected ${v.expected}, actual ${v.actual} (tol: ${v.tolerance ?? 'exact'}) -> ${v.message}`
      )
      .join('; ');
    const ctxStr = context
      ? ` (gen: ${context.generation ?? '?'}, tick: ${context.tickIndex ?? '?'}, ver: ${context.stateVersion ?? '?'}${context.stage ? `, stage: ${context.stage}` : ''})`
      : '';
    super(`Mass invariant violation${ctxStr}: ${summary}`);
    this.name = 'MassInvariantError';
    this.violations = Object.freeze([...violations]);
    this.context = context;
  }
}

export interface MassInvariantValidationResult {
  valid: boolean;
  violations: InvariantViolation[];
}

/**
 * Validates all scientific mass invariants according to SCIENTIFIC_SPEC §1, §4, §8, §10.
 * Invariants checked:
 * 1. Safe non-negative integer input ticks.
 * 2. Non-negative, finite phase masses.
 * 3. Total mass conversion alignment with input ticks within eps(total).
 * 4. Exact partition sums (Gu + Gd = Gt, Sb + Ss = St, Ol + Od = Ot) within eps(total).
 * 5. Kinematic fGu fraction in [0, 1], and fGu === 0 when Gu === 0.
 * 6. Dissolved sugar Gd does not exceed water capacity within eps(Gt).
 * 7. Dry/carrier gates: if W === 0, Gd === 0 and Od === 0.
 * 8. Reservation capacity does not exceed 500,000 milli-ml.
 */
export function validateMassInvariants(
  state: Readonly<ScienceState>,
  context?: InvariantContext
): MassInvariantValidationResult {
  const violations: InvariantViolation[] = [];
  const gen = context?.generation ?? state.generation;
  const tick = context?.tickIndex ?? state.tickIndex;
  const ver = context?.stateVersion ?? state.stateVersion;

  const pushViolation = (
    name: string,
    message: string,
    expected: number | string,
    actual: number | string,
    tolerance?: string,
    ingredient?: string,
    phase?: string
  ) => {
    violations.push({
      name,
      ingredient,
      phase,
      expected,
      actual,
      tolerance,
      message,
      generation: gen,
      tickIndex: tick,
      stateVersion: ver,
    });
  };

  // 1. Input safe integer non-negative check
  const inputIngredients = ['water', 'oil', 'sugar', 'sand'] as const;
  for (const ing of inputIngredients) {
    const val = state.input[ing];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0) {
      pushViolation(
        'INPUT_TICK_INTEGRITY',
        `Input tick for ${ing} must be a non-negative safe integer.`,
        'non-negative safe integer',
        String(val),
        'exact',
        ing
      );
    }
  }

  // 2. Masses finite and non-negative
  const massKeys: (keyof ScienceMassCompartments)[] = [
    'W',
    'Gt',
    'Gu',
    'Gd',
    'St',
    'Sb',
    'Ss',
    'Ot',
    'Ol',
    'Od',
  ];
  for (const k of massKeys) {
    const m = state.mass[k];
    if (typeof m !== 'number' || !Number.isFinite(m) || m < 0 || Object.is(m, -0)) {
      pushViolation(
        'MASS_NON_NEGATIVE_FINITE',
        `Mass compartment ${k} must be finite and non-negative (no -0).`,
        '>= 0 g',
        String(m),
        'exact',
        undefined,
        k
      );
    }
  }

  // 3. Conversions between input ticks and total masses
  const expectedW = ticksToWaterMassG(state.input.water);
  const epsW = epsilonMass(expectedW);
  if (Math.abs(state.mass.W - expectedW) > epsW) {
    pushViolation(
      'WATER_INPUT_CONVERSION',
      `Water mass W (${state.mass.W} g) does not match input ticks ${state.input.water} (${expectedW} g).`,
      expectedW,
      state.mass.W,
      `${epsW} g`,
      'water',
      'W'
    );
  }

  const expectedGt = ticksToSugarMassG(state.input.sugar);
  const epsGt = epsilonMass(expectedGt);
  if (Math.abs(state.mass.Gt - expectedGt) > epsGt) {
    pushViolation(
      'SUGAR_INPUT_CONVERSION',
      `Sugar total Gt (${state.mass.Gt} g) does not match input ticks ${state.input.sugar} (${expectedGt} g).`,
      expectedGt,
      state.mass.Gt,
      `${epsGt} g`,
      'sugar',
      'Gt'
    );
  }

  const expectedSt = ticksToSandMassG(state.input.sand);
  const epsSt = epsilonMass(expectedSt);
  if (Math.abs(state.mass.St - expectedSt) > epsSt) {
    pushViolation(
      'SAND_INPUT_CONVERSION',
      `Sand total St (${state.mass.St} g) does not match input ticks ${state.input.sand} (${expectedSt} g).`,
      expectedSt,
      state.mass.St,
      `${epsSt} g`,
      'sand',
      'St'
    );
  }

  const expectedOt = ticksToOilMassG(state.input.oil);
  const epsOt = epsilonMass(expectedOt);
  if (Math.abs(state.mass.Ot - expectedOt) > epsOt) {
    pushViolation(
      'OIL_INPUT_CONVERSION',
      `Oil total Ot (${state.mass.Ot} g) does not match input ticks ${state.input.oil} (${expectedOt} g).`,
      expectedOt,
      state.mass.Ot,
      `${epsOt} g`,
      'oil',
      'Ot'
    );
  }

  // 4. Partition sums
  const sugarSum = state.mass.Gu + state.mass.Gd;
  if (Math.abs(sugarSum - state.mass.Gt) > epsGt) {
    pushViolation(
      'SUGAR_PARTITION_CONSERVATION',
      `Sugar partition Gu (${state.mass.Gu} g) + Gd (${state.mass.Gd} g) = ${sugarSum} g != Gt (${state.mass.Gt} g).`,
      state.mass.Gt,
      sugarSum,
      `${epsGt} g`,
      'sugar',
      'Gu+Gd'
    );
  }

  const sandSum = state.mass.Sb + state.mass.Ss;
  if (Math.abs(sandSum - state.mass.St) > epsSt) {
    pushViolation(
      'SAND_PARTITION_CONSERVATION',
      `Sand partition Sb (${state.mass.Sb} g) + Ss (${state.mass.Ss} g) = ${sandSum} g != St (${state.mass.St} g).`,
      state.mass.St,
      sandSum,
      `${epsSt} g`,
      'sand',
      'Sb+Ss'
    );
  }

  const oilSum = state.mass.Ol + state.mass.Od;
  if (Math.abs(oilSum - state.mass.Ot) > epsOt) {
    pushViolation(
      'OIL_PARTITION_CONSERVATION',
      `Oil partition Ol (${state.mass.Ol} g) + Od (${state.mass.Od} g) = ${oilSum} g != Ot (${state.mass.Ot} g).`,
      state.mass.Ot,
      oilSum,
      `${epsOt} g`,
      'oil',
      'Ol+Od'
    );
  }

  // 5. Kinematic fGu fraction in [0, 1] and zero when Gu === 0
  if (typeof state.fGu !== 'number' || !Number.isFinite(state.fGu) || state.fGu < 0 || state.fGu > 1) {
    pushViolation(
      'KINEMATIC_FGU_BOUNDS',
      `fGu must be a finite number within [0, 1], received: ${state.fGu}.`,
      '[0, 1]',
      String(state.fGu),
      'exact',
      'sugar',
      'fGu'
    );
  } else if (state.mass.Gu === 0 && state.fGu > 0) {
    pushViolation(
      'KINEMATIC_FGU_ZERO_WHEN_GU_ZERO',
      `fGu must be 0 when undissolved sugar Gu is 0, received: ${state.fGu} with Gu=${state.mass.Gu} g.`,
      0,
      state.fGu,
      'exact',
      'sugar',
      'fGu'
    );
  }

  // 6. Water capacity constraint for dissolved sugar Gd
  const waterCapG = computeWaterCapacityG(state.mass.W);
  if (state.mass.Gd > waterCapG + epsGt) {
    pushViolation(
      'SUGAR_DISSOLUTION_CAPACITY',
      `Dissolved sugar Gd (${state.mass.Gd} g) exceeds solvent water capacity (${waterCapG} g).`,
      `<= ${waterCapG} g`,
      state.mass.Gd,
      `${epsGt} g`,
      'sugar',
      'Gd'
    );
  }

  // 7. Dry / carrier gate invariants: W === 0 -> Gd === 0 and Od === 0
  if (state.mass.W <= 1e-9) {
    if (state.mass.Gd > 1e-9) {
      pushViolation(
        'DRY_GATE_DISSOLVED_SUGAR',
        `No water present (W=0 g), but dissolved sugar Gd > 0 (${state.mass.Gd} g).`,
        0,
        state.mass.Gd,
        '1e-9 g',
        'sugar',
        'Gd'
      );
    }
    if (state.mass.Od > 1e-9) {
      pushViolation(
        'DRY_GATE_OIL_DROPLETS',
        `No water present (W=0 g), but dispersed oil droplets Od > 0 (${state.mass.Od} g).`,
        0,
        state.mass.Od,
        '1e-9 g',
        'oil',
        'Od'
      );
    }
  }

  // 8. Reservation capacity limit
  const reservationMilliMl =
    state.input.water * VISUAL_MILLI_ML_PER_TICK.water +
    state.input.oil * VISUAL_MILLI_ML_PER_TICK.oil +
    state.input.sugar * VISUAL_MILLI_ML_PER_TICK.sugar +
    state.input.sand * VISUAL_MILLI_ML_PER_TICK.sand;

  if (reservationMilliMl > MAX_RESERVATION_MILLI_ML) {
    pushViolation(
      'CAPACITY_RESERVATION_LIMIT',
      `Total beaker volume reservation (${reservationMilliMl} milli-ml) exceeds maximum limit (${MAX_RESERVATION_MILLI_ML} milli-ml).`,
      `<= ${MAX_RESERVATION_MILLI_ML}`,
      reservationMilliMl,
      '0 milli-ml'
    );
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Asserts all scientific mass invariants. Throws MassInvariantError with detailed diagnostics on violation.
 */
export function assertMassInvariants(
  state: Readonly<ScienceState>,
  context?: InvariantContext
): void {
  const res = validateMassInvariants(state, context);
  if (!res.valid) {
    throw new MassInvariantError(res.violations, context);
  }
}

// ----------------------------------------------------------------------------
// Bounded Paired Transfer Primitives
// ----------------------------------------------------------------------------

export type PhaseTransferPair =
  | 'sugar_dissolution'  // Gu -> Gd
  | 'sand_suspension'    // Sb -> Ss
  | 'sand_sedimentation' // Ss -> Sb
  | 'oil_dispersion'     // Ol -> Od
  | 'oil_separation';    // Od -> Ol

export interface TransferRequest {
  pair: PhaseTransferPair;
  requestedGrams: number;
  /**
   * Optional destination headroom override (grams).
   * If omitted, natural physics constraints (e.g. water sugar capacity) are used.
   */
  destinationHeadroom?: number;
}

export interface TransferExecutionResult {
  ok: boolean;
  transferredGrams: number;
  pair: PhaseTransferPair;
  sourceBefore: number;
  destBefore: number;
  sourceAfter: number;
  destAfter: number;
  total: number;
  error?: string;
}

/**
 * Pure calculation of a bounded paired phase mass transfer without mutating state.
 * Guarantees:
 * - Two compartments are updated as an atomic transaction.
 * - Source is bounded: cannot transfer more than available in source compartment.
 * - Destination headroom is strictly respected (e.g. water saturation capacity).
 * - Remaining source is derived from total - destAfter to prevent drift.
 * - Negative, NaN, Infinite or invalid types are rejected with diagnostic error.
 * - Corrupt initial partition is rejected without silent normalization.
 * - Small residual mass is NOT clamped or snapped to zero.
 */
export function computePairedTransfer(
  mass: Readonly<ScienceMassCompartments>,
  request: TransferRequest
): TransferExecutionResult {
  const { pair, requestedGrams, destinationHeadroom } = request;

  // 1. Validate requested transfer amount
  if (typeof requestedGrams !== 'number' || !Number.isFinite(requestedGrams) || Number.isNaN(requestedGrams)) {
    return {
      ok: false,
      transferredGrams: 0,
      pair,
      sourceBefore: 0,
      destBefore: 0,
      sourceAfter: 0,
      destAfter: 0,
      total: 0,
      error: `Invalid requested transfer mass: must be a finite number, received ${String(requestedGrams)}.`,
    };
  }

  if (requestedGrams < 0) {
    return {
      ok: false,
      transferredGrams: 0,
      pair,
      sourceBefore: 0,
      destBefore: 0,
      sourceAfter: 0,
      destAfter: 0,
      total: 0,
      error: `Transfer amount cannot be negative: received ${requestedGrams} g.`,
    };
  }

  // 2. Identify source, destination, and total according to pair
  let source: number;
  let dest: number;
  let total: number;
  let naturalHeadroom: number;

  switch (pair) {
    case 'sugar_dissolution': {
      source = mass.Gu;
      dest = mass.Gd;
      total = mass.Gt;
      // Headroom derived from solvent water capacity
      const waterCap = computeWaterCapacityG(mass.W);
      naturalHeadroom = Math.max(0, waterCap - dest);
      break;
    }
    case 'sand_suspension': {
      source = mass.Sb;
      dest = mass.Ss;
      total = mass.St;
      naturalHeadroom = Math.max(0, total - dest);
      break;
    }
    case 'sand_sedimentation': {
      source = mass.Ss;
      dest = mass.Sb;
      total = mass.St;
      naturalHeadroom = Math.max(0, total - dest);
      break;
    }
    case 'oil_dispersion': {
      source = mass.Ol;
      dest = mass.Od;
      total = mass.Ot;
      // Droplets only disperse if carrier water is present (W > 0)
      if (mass.W <= 1e-9) {
        naturalHeadroom = 0;
      } else {
        naturalHeadroom = Math.max(0, total - dest);
      }
      break;
    }
    case 'oil_separation': {
      source = mass.Od;
      dest = mass.Ol;
      total = mass.Ot;
      naturalHeadroom = Math.max(0, total - dest);
      break;
    }
    default: {
      return {
        ok: false,
        transferredGrams: 0,
        pair: pair as PhaseTransferPair,
        sourceBefore: 0,
        destBefore: 0,
        sourceAfter: 0,
        destAfter: 0,
        total: 0,
        error: `Unsupported transfer pair: ${String(pair)}.`,
      };
    }
  }

  // 3. Verify initial partition integrity (must equal total within epsilon)
  const eps = epsilonMass(total);
  if (Math.abs(source + dest - total) > eps) {
    return {
      ok: false,
      transferredGrams: 0,
      pair,
      sourceBefore: source,
      destBefore: dest,
      sourceAfter: source,
      destAfter: dest,
      total,
      error: `Initial partition corrupted for ${pair}: source (${source} g) + dest (${dest} g) != total (${total} g) within tolerance ${eps} g.`,
    };
  }

  // 4. Determine effective headroom
  let effectiveHeadroom = naturalHeadroom;
  if (destinationHeadroom !== undefined) {
    if (typeof destinationHeadroom !== 'number' || !Number.isFinite(destinationHeadroom) || destinationHeadroom < 0) {
      return {
        ok: false,
        transferredGrams: 0,
        pair,
        sourceBefore: source,
        destBefore: dest,
        sourceAfter: source,
        destAfter: dest,
        total,
        error: `Invalid destinationHeadroom: must be a non-negative finite number, received ${String(destinationHeadroom)}.`,
      };
    }
    effectiveHeadroom = Math.min(effectiveHeadroom, destinationHeadroom);
  }

  // 5. Bound the transfer by requested, available source, and destination headroom
  const actualTransfer = Math.min(requestedGrams, Math.max(0, source), Math.max(0, effectiveHeadroom));

  // If actualTransfer is 0 (e.g. requested 0, or source 0, or headroom 0)
  if (actualTransfer <= 0) {
    return {
      ok: true,
      transferredGrams: 0,
      pair,
      sourceBefore: source,
      destBefore: dest,
      sourceAfter: source,
      destAfter: dest,
      total,
    };
  }

  // 6. Compute new destination and derive new source from total to prevent numerical drift
  let destAfter = dest + actualTransfer;
  let sourceAfter = total - destAfter;

  // Boundary clamp check: ensure non-negative within floating precision
  if (sourceAfter < 0) {
    sourceAfter = 0;
    destAfter = total;
  }

  return {
    ok: true,
    transferredGrams: actualTransfer,
    pair,
    sourceBefore: source,
    destBefore: dest,
    sourceAfter,
    destAfter,
    total,
  };
}

/**
 * Applies a bounded paired transfer to a ScienceState atomically.
 * Updates state.mass and kinematics (e.g. fGu = 0 if Gu = 0), then asserts mass invariants.
 */
export function applyPairedTransfer(
  state: ScienceState,
  request: TransferRequest
): TransferExecutionResult {
  const result = computePairedTransfer(state.mass, request);
  if (!result.ok) {
    throw new Error(`Paired transfer failed: ${result.error}`);
  }

  if (result.transferredGrams === 0) {
    return result;
  }

  switch (request.pair) {
    case 'sugar_dissolution': {
      state.mass.Gd = result.destAfter;
      state.mass.Gu = result.sourceAfter;
      if (state.mass.Gu <= 0) {
        state.mass.Gu = 0;
        state.fGu = 0;
      }
      break;
    }
    case 'sand_suspension': {
      state.mass.Ss = result.destAfter;
      state.mass.Sb = result.sourceAfter;
      break;
    }
    case 'sand_sedimentation': {
      state.mass.Sb = result.destAfter;
      state.mass.Ss = result.sourceAfter;
      break;
    }
    case 'oil_dispersion': {
      state.mass.Od = result.destAfter;
      state.mass.Ol = result.sourceAfter;
      break;
    }
    case 'oil_separation': {
      state.mass.Ol = result.destAfter;
      state.mass.Od = result.sourceAfter;
      break;
    }
  }

  // Verify full invariants after applying
  assertMassInvariants(state, {
    generation: state.generation,
    tickIndex: state.tickIndex,
    stateVersion: state.stateVersion,
    stage: `applyPairedTransfer:${request.pair}`,
  });

  return result;
}
