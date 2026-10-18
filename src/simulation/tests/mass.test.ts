import { describe, expect, it } from 'vitest';
import {
  applyPairedTransfer,
  assertMassInvariants,
  computePairedTransfer,
  computeWaterCapacityG,
  DENSITY_OIL,
  DENSITY_WATER,
  DISPLACEMENT_ML_PER_G_SAND,
  DISPLACEMENT_ML_PER_G_SUGAR,
  epsilonMass,
  HeadlessSimulationEngine,
  HeadlessSimulationFacade,
  MAX_RESERVATION_MILLI_ML,
  MassInvariantError,
  significanceThreshold,
  ticksToOilMassG,
  ticksToSandMassG,
  ticksToSugarMassG,
  ticksToWaterMassG,
  validateMassInvariants,
  type ScienceMassCompartments,
  type TransferRequest,
} from '../core/SimulationEngine';
import { createInitialScienceState, DEFAULT_SEED } from '../core/SimulationState';
import { computeBeakerRegions, type PhaseMasses } from '../constants/beaker';

/**
 * Deterministic pseudo-random number generator (Mulberry32) for reproducible tests.
 * Standard seed = 1729.
 */
function createPrng(seed = 1729) {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('V3-01 — Mass ledger và transfer primitive', () => {
  // ==========================================================================
  // Part A: Unit primitives (Tests 1–11)
  // ==========================================================================

  describe('Part A: Unit primitives', () => {
    // 1. Transfer 0 keeps state unchanged
    it('1. transfer 0 leaves source and destination exactly unchanged', () => {
      const mass: ScienceMassCompartments = {
        W: 100,
        Gt: 10,
        Gu: 6,
        Gd: 4,
        St: 10,
        Sb: 8,
        Ss: 2,
        Ot: 18,
        Ol: 10,
        Od: 8,
      };

      const result = computePairedTransfer(mass, {
        pair: 'sugar_dissolution',
        requestedGrams: 0,
      });

      expect(result.ok).toBe(true);
      expect(result.transferredGrams).toBe(0);
      expect(result.sourceAfter).toBe(6);
      expect(result.destAfter).toBe(4);
      expect(result.total).toBe(10);
    });

    // 2. Transfer small fraction with many decimal digits
    it('2. transfers small fractions with high decimal precision without truncation', () => {
      const mass: ScienceMassCompartments = {
        W: 100,
        Gt: 10,
        Gu: 10,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };

      const tinyAmount = 0.000123456789;
      const result = computePairedTransfer(mass, {
        pair: 'sugar_dissolution',
        requestedGrams: tinyAmount,
      });

      expect(result.ok).toBe(true);
      expect(result.transferredGrams).toBe(tinyAmount);
      expect(result.destAfter).toBe(tinyAmount);
      expect(result.sourceAfter).toBeCloseTo(10 - tinyAmount, 10);
      expect(result.sourceAfter + result.destAfter).toBeCloseTo(10, 10);
    });

    // 3. Request exactly equal to source
    it('3. transfers 100% of source when request equals source', () => {
      const mass: ScienceMassCompartments = {
        W: 100,
        Gt: 5,
        Gu: 5,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };

      const result = computePairedTransfer(mass, {
        pair: 'sugar_dissolution',
        requestedGrams: 5,
      });

      expect(result.ok).toBe(true);
      expect(result.transferredGrams).toBe(5);
      expect(result.destAfter).toBe(5);
      expect(result.sourceAfter).toBe(0);
      expect(result.sourceAfter + result.destAfter).toBe(5);
    });

    // 4. Request greater than source is bounded by source
    it('4. bounds requested transfer exceeding source to available source amount', () => {
      const mass: ScienceMassCompartments = {
        W: 100,
        Gt: 10,
        Gu: 3.5,
        Gd: 6.5,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };

      const result = computePairedTransfer(mass, {
        pair: 'sugar_dissolution',
        requestedGrams: 100.0,
      });

      expect(result.ok).toBe(true);
      expect(result.transferredGrams).toBe(3.5);
      expect(result.sourceAfter).toBe(0);
      expect(result.destAfter).toBe(10);
      expect(result.sourceAfter + result.destAfter).toBe(10);
    });

    // 5. Destination headroom limits transfer (sugar saturation capacity)
    it('5. strictly bounds transfer by destination headroom (sugar water capacity)', () => {
      // 10 ml water -> capacity = 20 g sugar at 20°C
      // Already dissolved: 18 g -> headroom is 2 g
      const mass: ScienceMassCompartments = {
        W: 10,
        Gt: 30,
        Gu: 12,
        Gd: 18,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };

      const result = computePairedTransfer(mass, {
        pair: 'sugar_dissolution',
        requestedGrams: 10.0,
      });

      expect(result.ok).toBe(true);
      expect(result.transferredGrams).toBe(2.0); // exactly 20 - 18 = 2g
      expect(result.destAfter).toBe(20.0);
      expect(result.sourceAfter).toBe(10.0); // 30 - 20 = 10g
      expect(result.sourceAfter + result.destAfter).toBe(30);

      // Custom destination headroom override
      const customResult = computePairedTransfer(mass, {
        pair: 'sugar_dissolution',
        requestedGrams: 10.0,
        destinationHeadroom: 0.5,
      });
      expect(customResult.ok).toBe(true);
      expect(customResult.transferredGrams).toBe(0.5);
      expect(customResult.destAfter).toBe(18.5);
      expect(customResult.sourceAfter).toBe(11.5);
    });

    // 6. Source 0 or headroom 0 transfers 0 mass
    it('6. produces zero transfer and creates no phantom mass when source or headroom is 0', () => {
      const massDry: ScienceMassCompartments = {
        W: 0, // no water
        Gt: 10,
        Gu: 10,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };

      // W = 0 -> capacity is 0 -> headroom is 0
      const dryResult = computePairedTransfer(massDry, {
        pair: 'sugar_dissolution',
        requestedGrams: 5.0,
      });
      expect(dryResult.ok).toBe(true);
      expect(dryResult.transferredGrams).toBe(0);
      expect(dryResult.sourceAfter).toBe(10);
      expect(dryResult.destAfter).toBe(0);

      // Source is 0
      const massEmptySource: ScienceMassCompartments = {
        W: 100,
        Gt: 10,
        Gu: 0,
        Gd: 10,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const emptySourceResult = computePairedTransfer(massEmptySource, {
        pair: 'sugar_dissolution',
        requestedGrams: 2.0,
      });
      expect(emptySourceResult.ok).toBe(true);
      expect(emptySourceResult.transferredGrams).toBe(0);
      expect(emptySourceResult.sourceAfter).toBe(0);
      expect(emptySourceResult.destAfter).toBe(10);
    });

    // 7. Negative / NaN / Infinity / wrong type rejected atomically
    it('7. atomically rejects negative, NaN, Infinity, and invalid types without mutation', () => {
      const state = createInitialScienceState(DEFAULT_SEED);
      state.input.water = 1000;
      state.mass.W = 100;
      state.input.sugar = 100;
      state.mass.Gt = 10;
      state.mass.Gu = 10;
      state.mass.Gd = 0;

      const initialGu = state.mass.Gu;
      const initialGd = state.mass.Gd;

      const invalidRequests = [
        -1.0,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        'invalid' as unknown as number,
        null as unknown as number,
        undefined as unknown as number,
      ];

      for (const req of invalidRequests) {
        const pureResult = computePairedTransfer(state.mass, {
          pair: 'sugar_dissolution',
          requestedGrams: req,
        });
        expect(pureResult.ok).toBe(false);
        expect(pureResult.transferredGrams).toBe(0);
        expect(pureResult.error).toBeDefined();

        expect(() => {
          applyPairedTransfer(state, {
            pair: 'sugar_dissolution',
            requestedGrams: req,
          });
        }).toThrow();

        // Ensure state was not mutated
        expect(state.mass.Gu).toBe(initialGu);
        expect(state.mass.Gd).toBe(initialGd);
      }
    });

    // 8. Corrupt initial partition rejected without silent normalization
    it('8. rejects corrupt initial partition without silently normalizing or fixing', () => {
      // Corrupt state: Gu (5) + Gd (3) = 8 != Gt (10)
      const corruptMass: ScienceMassCompartments = {
        W: 100,
        Gt: 10,
        Gu: 5,
        Gd: 3,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };

      const result = computePairedTransfer(corruptMass, {
        pair: 'sugar_dissolution',
        requestedGrams: 1.0,
      });

      expect(result.ok).toBe(false);
      expect(result.transferredGrams).toBe(0);
      expect(result.error).toContain('Initial partition corrupted');
    });

    // 9. Bidirectional transfer for sand and oil preserves totals
    it('9. preserves exact totals across multiple bidirectional transfers for sand and oil', () => {
      const state = createInitialScienceState(DEFAULT_SEED);
      state.input.water = 1000;
      state.mass.W = 100;
      state.input.sand = 100;
      state.mass.St = 10;
      state.mass.Sb = 10;
      state.mass.Ss = 0;
      state.input.oil = 200;
      state.mass.Ot = 18;
      state.mass.Ol = 18;
      state.mass.Od = 0;

      // Sand suspension: Sb -> Ss
      applyPairedTransfer(state, { pair: 'sand_suspension', requestedGrams: 3.5 });
      expect(state.mass.Ss).toBeCloseTo(3.5, 9);
      expect(state.mass.Sb).toBeCloseTo(6.5, 9);
      expect(state.mass.Sb + state.mass.Ss).toBeCloseTo(10, 9);

      // Sand sedimentation: Ss -> Sb
      applyPairedTransfer(state, { pair: 'sand_sedimentation', requestedGrams: 1.2 });
      expect(state.mass.Ss).toBeCloseTo(2.3, 9);
      expect(state.mass.Sb).toBeCloseTo(7.7, 9);
      expect(state.mass.Sb + state.mass.Ss).toBeCloseTo(10, 9);

      // Oil dispersion: Ol -> Od
      applyPairedTransfer(state, { pair: 'oil_dispersion', requestedGrams: 7.2 });
      expect(state.mass.Od).toBeCloseTo(7.2, 9);
      expect(state.mass.Ol).toBeCloseTo(10.8, 9);
      expect(state.mass.Ol + state.mass.Od).toBeCloseTo(18, 9);

      // Oil separation: Od -> Ol
      applyPairedTransfer(state, { pair: 'oil_separation', requestedGrams: 2.5 });
      expect(state.mass.Od).toBeCloseTo(4.7, 9);
      expect(state.mass.Ol).toBeCloseTo(13.3, 9);
      expect(state.mass.Ol + state.mass.Od).toBeCloseTo(18, 9);

      // Full invariants pass
      expect(validateMassInvariants(state).valid).toBe(true);
    });

    // 10. Small residual mass below label/hide threshold is preserved in ledger
    it('10. preserves small residual mass (< 0.01g or < 0.001g) without snapping to 0', () => {
      const state = createInitialScienceState(DEFAULT_SEED);
      state.input.water = 1000;
      state.mass.W = 100;
      state.input.sugar = 10; // 1.0 g total
      state.mass.Gt = 1.0;
      state.mass.Gu = 1.0;
      state.mass.Gd = 0;

      // Dissolve 0.9995 g -> residual Gu is 0.0005 g (< 0.001 g visual hide threshold)
      applyPairedTransfer(state, {
        pair: 'sugar_dissolution',
        requestedGrams: 0.9995,
      });

      expect(state.mass.Gu).toBeCloseTo(0.0005, 9);
      expect(state.mass.Gu).toBeGreaterThan(0); // MUST NOT be snapped to 0!
      expect(state.mass.Gd).toBeCloseTo(0.9995, 9);
      expect(state.mass.Gu + state.mass.Gd).toBeCloseTo(1.0, 9);

      // Contrast with significance threshold
      const L = significanceThreshold(state.mass.Gt); // max(0.01, 0.01*1.0) = 0.01g
      expect(state.mass.Gu).toBeLessThan(L); // Below UX label threshold, but remains in ledger!
    });

    // 11. Pure computePairedTransfer does not mutate input objects
    it('11. does not mutate input objects when calling pure computePairedTransfer', () => {
      const originalMass: ScienceMassCompartments = Object.freeze({
        W: 100,
        Gt: 10,
        Gu: 6,
        Gd: 4,
        St: 10,
        Sb: 5,
        Ss: 5,
        Ot: 18,
        Ol: 9,
        Od: 9,
      });

      const request: TransferRequest = Object.freeze({
        pair: 'sugar_dissolution',
        requestedGrams: 2.0,
      });

      const result = computePairedTransfer(originalMass, request);
      expect(result.ok).toBe(true);
      expect(result.transferredGrams).toBe(2.0);
      expect(originalMass.Gu).toBe(6);
      expect(originalMass.Gd).toBe(4);
    });
  });

  // ==========================================================================
  // Part B: Randomized deterministic tests (Tests 12–16)
  // ==========================================================================

  describe('Part B: Randomized deterministic tests', () => {
    // 12. Fixed seed, 1,000 steps bounded transfers
    it('12. executes 1,000 randomized bounded transfers using fixed seed 1729', () => {
      const seed = 1729;
      const rng = createPrng(seed);
      const steps = 1000;

      const state = createInitialScienceState(seed);
      state.input.water = 2000;
      state.mass.W = 200;
      state.input.sugar = 500;
      state.mass.Gt = 50;
      state.mass.Gu = 50;
      state.mass.Gd = 0;
      state.input.sand = 500;
      state.mass.St = 50;
      state.mass.Sb = 50;
      state.mass.Ss = 0;
      state.input.oil = 500;
      state.mass.Ot = 45;
      state.mass.Ol = 45;
      state.mass.Od = 0;

      const pairs: TransferRequest['pair'][] = [
        'sugar_dissolution',
        'sand_suspension',
        'sand_sedimentation',
        'oil_dispersion',
        'oil_separation',
      ];

      for (let i = 0; i < steps; i++) {
        const pair = pairs[Math.floor(rng() * pairs.length)];
        const requestedGrams = 0.001 + rng() * 10.0;
        const res = applyPairedTransfer(state, { pair, requestedGrams });
        expect(res.ok).toBe(true);
      }

      expect(state.mass.Gu + state.mass.Gd).toBeCloseTo(50, 9);
      expect(state.mass.Sb + state.mass.Ss).toBeCloseTo(50, 9);
      expect(state.mass.Ol + state.mass.Od).toBeCloseTo(45, 9);
    });

    // 13. Assert mass invariants at every step
    it('13. asserts mass invariants at every single step across all 1,000 transfers', () => {
      const seed = 1729;
      const rng = createPrng(seed);
      const steps = 1000;

      const state = createInitialScienceState(seed);
      state.input.water = 2000;
      state.mass.W = 200;
      state.input.sugar = 500;
      state.mass.Gt = 50;
      state.mass.Gu = 50;
      state.mass.Gd = 0;
      state.input.sand = 500;
      state.mass.St = 50;
      state.mass.Sb = 50;
      state.mass.Ss = 0;
      state.input.oil = 500;
      state.mass.Ot = 45;
      state.mass.Ol = 45;
      state.mass.Od = 0;

      const pairs: TransferRequest['pair'][] = [
        'sugar_dissolution',
        'sand_suspension',
        'sand_sedimentation',
        'oil_dispersion',
        'oil_separation',
      ];

      for (let i = 0; i < steps; i++) {
        const pair = pairs[Math.floor(rng() * pairs.length)];
        const requestedGrams = 0.001 + rng() * 10.0;
        applyPairedTransfer(state, { pair, requestedGrams });

        // Assert at EVERY step
        assertMassInvariants(state, { tickIndex: i });
        const invRes = validateMassInvariants(state, { tickIndex: i });
        expect(invRes.valid).toBe(true);
        expect(invRes.violations.length).toBe(0);
      }
    });

    // 14. Record seed, step count, and max observed error
    it('14. records seed 1729, 1000 steps, and bounds max observed mass error <= 1e-12 g', () => {
      const seed = 1729;
      const rng = createPrng(seed);
      const steps = 1000;

      const state = createInitialScienceState(seed);
      state.input.water = 2000;
      state.mass.W = 200;
      state.input.sugar = 500;
      state.mass.Gt = 50;
      state.mass.Gu = 50;
      state.mass.Gd = 0;
      state.input.sand = 500;
      state.mass.St = 50;
      state.mass.Sb = 50;
      state.mass.Ss = 0;
      state.input.oil = 500;
      state.mass.Ot = 45;
      state.mass.Ol = 45;
      state.mass.Od = 0;

      const pairs: TransferRequest['pair'][] = [
        'sugar_dissolution',
        'sand_suspension',
        'sand_sedimentation',
        'oil_dispersion',
        'oil_separation',
      ];

      let maxSugarError = 0;
      let maxSandError = 0;
      let maxOilError = 0;

      for (let i = 0; i < steps; i++) {
        const pair = pairs[Math.floor(rng() * pairs.length)];
        const requestedGrams = 0.001 + rng() * 10.0;
        applyPairedTransfer(state, { pair, requestedGrams });

        const sugarErr = Math.abs(state.mass.Gu + state.mass.Gd - state.mass.Gt);
        const sandErr = Math.abs(state.mass.Sb + state.mass.Ss - state.mass.St);
        const oilErr = Math.abs(state.mass.Ol + state.mass.Od - state.mass.Ot);

        if (sugarErr > maxSugarError) maxSugarError = sugarErr;
        if (sandErr > maxSandError) maxSandError = sandErr;
        if (oilErr > maxOilError) maxOilError = oilErr;
      }

      // Max observed error across all 1,000 steps
      expect(maxSugarError).toBeLessThan(1e-12);
      expect(maxSandError).toBeLessThan(1e-12);
      expect(maxOilError).toBeLessThan(1e-12);
    });

    // 15. Reproducibility with seeded PRNG (no unseeded Math.random)
    it('15. ensures deterministic reproducibility across identical seeded runs without Math.random', () => {
      const runExperiment = (seed: number) => {
        const rng = createPrng(seed);
        const state = createInitialScienceState(seed);
        state.input.water = 1000;
        state.mass.W = 100;
        state.input.sugar = 1000;
        state.mass.Gt = 100;
        state.mass.Gu = 100;
        state.mass.Gd = 0;

        for (let i = 0; i < 5; i++) {
          applyPairedTransfer(state, {
            pair: 'sugar_dissolution',
            requestedGrams: 0.1 + rng() * 2.0,
          });
        }
        return { ...state.mass };
      };

      const result1 = runExperiment(1729);
      const result2 = runExperiment(1729);
      const resultDifferentSeed = runExperiment(42);

      expect(result1.Gu).toBe(result2.Gu);
      expect(result1.Gd).toBe(result2.Gd);
      expect(result1.Gu).toBeGreaterThan(0);
      expect(result1.Gu).not.toBe(resultDifferentSeed.Gu);
    });

    // 16. Independent conservation assertion without re-invoking helper
    it('16. independently verifies mass conservation sum without relying on helper formulas', () => {
      const state = createInitialScienceState(1729);
      state.input.water = 1000;
      state.mass.W = 100;
      state.input.sugar = 300;
      state.mass.Gt = 30;
      state.mass.Gu = 30;
      state.mass.Gd = 0;

      // Independent total recorded at t0
      const initialGt = 30.0;

      // Execute transfers
      applyPairedTransfer(state, { pair: 'sugar_dissolution', requestedGrams: 7.25 });
      applyPairedTransfer(state, { pair: 'sugar_dissolution', requestedGrams: 8.5 });

      // Raw arithmetic sum check directly
      const directSum = state.mass.Gu + state.mass.Gd;
      expect(directSum).toBe(initialGt);
    });
  });

  // ==========================================================================
  // Part C: Engine integration (Tests 17–28)
  // ==========================================================================

  describe('Part C: Engine integration', () => {
    // 17. Add allocation fixture SC-A01 preserves existing phases and dilution
    it('17. preserves existing phases and applies dilution formula on add (SC-A01)', () => {
      const state = createInitialScienceState(DEFAULT_SEED);
      // Pre-populate with existing dissolved and suspended amounts
      state.input.water = 1000;
      state.mass.W = 100;
      state.input.sugar = 100;
      state.mass.Gt = 10;
      state.mass.Gu = 5;
      state.mass.Gd = 5;
      state.fGu = 0.4; // suspended sugar = 5 * 0.4 = 2.0g
      state.input.sand = 100;
      state.mass.St = 10;
      state.mass.Sb = 7;
      state.mass.Ss = 3;
      state.input.oil = 200;
      state.mass.Ot = 18; // 20 * 0.9 = 18g
      state.mass.Ol = 10;
      state.mass.Od = 8;

      const engine = HeadlessSimulationEngine.createForTesting(state, { clientId: 'client-1' });

      // Add 1.0g sugar (10 deciTicks)
      const ackSugar = engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 10 },
      });
      expect(ackSugar.accepted).toBe(true);
      expect(engine.getState().mass.Gt).toBe(11);
      expect(engine.getState().mass.Gu).toBe(6);
      expect(engine.getState().mass.Gd).toBe(5); // Gd unchanged
      expect(engine.getState().fGu).toBeCloseTo(2.0 / 6.0, 9); // Diluted: 2.0 / 6 = 1/3

      // Add 1.0g sand (10 deciTicks)
      const ackSand = engine.dispatch({
        clientId: 'client-1',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sand', deciTicks: 10 },
      });
      expect(ackSand.accepted).toBe(true);
      expect(engine.getState().mass.St).toBe(11);
      expect(engine.getState().mass.Sb).toBe(8);
      expect(engine.getState().mass.Ss).toBe(3); // Ss unchanged

      // Add 1.0ml oil (10 deciTicks = 0.9g at density 0.9)
      const ackOil = engine.dispatch({
        clientId: 'client-1',
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 10 },
      });
      expect(ackOil.accepted).toBe(true);
      expect(engine.getState().mass.Ot).toBeCloseTo(18.9, 9);
      expect(engine.getState().mass.Ol).toBeCloseTo(10.9, 9);
      expect(engine.getState().mass.Od).toBe(8); // Od unchanged

      // Add 1.0ml water (10 deciTicks = 1.0g at density 1.0)
      const ackWater = engine.dispatch({
        clientId: 'client-1',
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 10 },
      });
      expect(ackWater.accepted).toBe(true);
      expect(engine.getState().mass.W).toBe(101);
      expect(engine.getState().mass.Gd).toBe(5); // Gd still unchanged
      expect(engine.getState().mass.Gu).toBe(6); // Gu still unchanged
    });

    // 18. Water and oil conversions have correct units
    it('18. verifies correct units and densities for water and oil conversions', () => {
      expect(DENSITY_WATER).toBe(1.0);
      expect(DENSITY_OIL).toBe(0.9);

      // Water: 100 ticks = 10 ml = 10.0 g
      expect(ticksToWaterMassG(100)).toBe(10.0);
      // Oil: 100 ticks = 10 ml = 9.0 g
      expect(ticksToOilMassG(100)).toBe(9.0);
      // Sugar: 100 ticks = 10 g = 10.0 g
      expect(ticksToSugarMassG(100)).toBe(10.0);
      // Sand: 100 ticks = 10 g = 10.0 g
      expect(ticksToSandMassG(100)).toBe(10.0);

      // Water solubility capacity at 20°C: 2.0 g/ml -> 100 g water dissolves 200 g sugar
      expect(computeWaterCapacityG(100)).toBe(200.0);
      expect(computeWaterCapacityG(0)).toBe(0);
    });

    // 19. Rejected command does not alter masses, input, or stateVersion
    it('19. preserves masses, input ticks, and stateVersion upon rejected command', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      const versionBefore = engine.getState().stateVersion;
      const massBefore = { ...engine.getState().mass };
      const inputBefore = { ...engine.getState().input };

      // Attempt to add exceeding per-add maximum (sugar max is 1000 deciTicks = 100g)
      const ackExceed = facade.dispatchIntent({
        type: 'add',
        ingredient: 'sugar',
        deciTicks: 2000,
      });
      expect(ackExceed.accepted).toBe(false);
      expect(ackExceed.reason).toBe('EXCEEDS_MAX_ADDITION');

      // State version and mass MUST be completely untouched
      expect(engine.getState().stateVersion).toBe(versionBefore);
      expect(engine.getState().mass).toEqual(massBefore);
      expect(engine.getState().input).toEqual(inputBefore);
    });

    // 20. Invariant checks actively run in engine and reject invalid states
    it('20. actively executes invariant checks in engine test seam and throws MassInvariantError on violation', () => {
      const corruptState = createInitialScienceState(DEFAULT_SEED);
      corruptState.input.sugar = 100;
      corruptState.mass.Gt = 10;
      corruptState.mass.Gu = 5;
      corruptState.mass.Gd = 2; // 5 + 2 = 7 != 10 (corrupt partition)

      expect(() => {
        HeadlessSimulationEngine.createForTesting(corruptState);
      }).toThrow(MassInvariantError);

      try {
        HeadlessSimulationEngine.createForTesting(corruptState);
      } catch (e) {
        expect(e).toBeInstanceOf(MassInvariantError);
        const invErr = e as MassInvariantError;
        expect(invErr.violations.some((v) => v.name === 'SUGAR_PARTITION_CONSERVATION')).toBe(true);
      }
    });

    // 21. Running auto and flow over many ticks does not alter masses
    it('21. leaves masses and compartments completely invariant across 600 ticks of auto/flow', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });
      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      const initialMass = { ...engine.getState().mass };
      const initialInput = { ...engine.getState().input };

      // Advance 600 ticks (10.0 seconds)
      for (let i = 0; i < 600; i++) {
        engine.advance(1 / 60);
      }

      const finalState = engine.getState();
      expect(finalState.tickIndex).toBe(600);
      expect(finalState.elapsedSeconds).toBeCloseTo(10.0, 9);
      expect(finalState.mass.W).toBe(initialMass.W);
      expect(finalState.mass.Gt).toBe(initialMass.Gt);
      expect(finalState.mass.Gu + finalState.mass.Gd).toBeCloseTo(initialMass.Gt, 9);
      expect(finalState.mass.Gd).toBeGreaterThan(0); // Dissolution occurred in water!
      expect(finalState.mass.St).toBe(initialMass.St);
      expect(finalState.mass.Sb + finalState.mass.Ss).toBeCloseTo(initialMass.St, 9);
      expect(finalState.mass.Ot).toBe(initialMass.Ot);
      expect(finalState.mass.Ol + finalState.mass.Od).toBeCloseTo(initialMass.Ot, 9);
      expect(finalState.input).toEqual(initialInput);
      expect(finalState.omegaFlow).toBeGreaterThan(0);
    });

    // 22. Reset / duplicate reset preserves semantics and zeros masses
    it('22. resets mass ledger cleanly to baseline and ignores duplicate reset replay', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      expect(engine.getState().mass.W).toBe(100);
      expect(engine.getState().mass.Gt).toBe(20);

      // Reset
      const ackReset = facade.dispatchIntent({ type: 'reset', seed: 42 });
      expect(ackReset.accepted).toBe(true);
      expect(ackReset.duplicate).toBe(false);
      expect(engine.getState().generation).toBe(1);
      expect(engine.getState().mass.W).toBe(0);
      expect(engine.getState().mass.Gt).toBe(0);
      expect(engine.getState().input.water).toBe(0);
      expect(engine.getState().input.sugar).toBe(0);

      // Replay same reset command
      const replayCmd = {
        clientId: 'client-1',
        seq: ackReset.seq,
        expectedGeneration: 0,
        payload: { type: 'reset' as const, seed: 42 },
      };
      const ackDuplicate = engine.dispatch(replayCmd);
      expect(ackDuplicate.duplicate).toBe(true);
      expect(engine.getState().generation).toBe(1); // Generation does NOT increment again
    });

    // 23. Two engine instances are completely isolated
    it('23. maintains strict state and ledger isolation between multiple engine instances', () => {
      const engineA = new HeadlessSimulationEngine({ clientId: 'client-A' });
      const engineB = new HeadlessSimulationEngine({ clientId: 'client-B' });
      const facadeA = new HeadlessSimulationFacade(engineA);
      const facadeB = new HeadlessSimulationFacade(engineB);

      facadeA.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facadeA.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });

      expect(engineA.getState().mass.W).toBe(100);
      expect(engineA.getState().mass.Gt).toBe(20);
      expect(engineB.getState().mass.W).toBe(0);
      expect(engineB.getState().mass.Gt).toBe(0);

      facadeB.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 300 });
      expect(engineB.getState().mass.St).toBe(30);
      expect(engineA.getState().mass.St).toBe(0);
    });

    // 24. Snapshot mutation does not affect engine ledger
    it('24. protects internal mass ledger from external mutations to ScalarSnapshot', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      const snap = engine.snapshot();
      expect(snap.mass.W).toBe(100);

      // Attempt mutating snapshot clone
      const copy = { ...snap, mass: { ...snap.mass } };
      (copy.mass as { W: number }).W = 9999;

      expect(engine.getState().mass.W).toBe(100);
      expect(engine.snapshot().mass.W).toBe(100);
    });

    // 25. Transfer of sugar does not reduce capacity reservation
    it('25. ensures capacity reservation does not shrink when sugar dissolves into solution', () => {
      // 100 ml water = 1000 ticks (100,000 milli-ml)
      // 50 g sugar = 500 ticks (500 * 65 = 32,500 milli-ml)
      // Total reservation = 132,500 milli-ml
      const state = createInitialScienceState(DEFAULT_SEED);
      state.input.water = 1000;
      state.mass.W = 100;
      state.input.sugar = 500;
      state.mass.Gt = 50;
      state.mass.Gu = 50;
      state.mass.Gd = 0;

      const engine = HeadlessSimulationEngine.createForTesting(state, { clientId: 'client-1' });

      const snapBefore = engine.snapshot();
      expect(snapBefore.input.sugar).toBe(500);

      // Apply transfer dissolving 40g sugar
      applyPairedTransfer(state, {
        pair: 'sugar_dissolution',
        requestedGrams: 40,
      });

      // Even with 40g sugar dissolved into solution:
      // - input.sugar is STILL 500 ticks
      // - reservation is still 100*1000 + 65*500 = 132,500 milli-ml
      const reservation =
        state.input.water * 100 +
        state.input.oil * 100 +
        state.input.sugar * 65 +
        state.input.sand * 60;

      expect(reservation).toBe(132500);
      expect(state.mass.Gd).toBe(40);
      expect(state.mass.Gu).toBe(10);
    });

    // 26. Near-capacity subsequent add is still blocked by input totals (SC-IN03)
    it('26. blocks subsequent add when total reservation hits 500,000 milli-ml even if dissolved (SC-IN03)', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const facade = new HeadlessSimulationFacade(engine);

      // Add 500 ml water (5000 ticks -> 500,000 milli-ml, exact capacity)
      const ackW = facade.dispatchIntent({
        type: 'add',
        ingredient: 'water',
        deciTicks: 5000,
      });
      expect(ackW.accepted).toBe(true);

      // Adding even 0.1 ml oil (1 tick) must be rejected with CAPACITY_EXCEEDED
      const ackOverflow = facade.dispatchIntent({
        type: 'add',
        ingredient: 'oil',
        deciTicks: 1,
      });
      expect(ackOverflow.accepted).toBe(false);
      expect(ackOverflow.reason).toBe('CAPACITY_EXCEEDED');
    });

    // 27. Regions fixtures with dissolved/suspended/dispersed phases sum correctly to Vreserve
    it('27. calculates beaker regions summing exactly to Vreserve with non-baseline phase partitions', () => {
      // Mixed fixture with dissolved sugar, suspended sand, and oil droplets
      const phases: PhaseMasses = {
        Wml: 100,
        Oml: 20, // 18g oil / 0.9 = 20ml
        Gt: 20,
        Gu: 10,
        Gd: 10,
        fGu: 0.5, // 5g suspended, 5g bed
        St: 15,
        Sb: 10,
        Ss: 5,
        Ot: 18,
        Ol: 12,
        Od: 6, // 6g droplets
      };

      const regions = computeBeakerRegions(phases);

      // Vreserve = Wml + Oml + 0.65*Gt + 0.6*St
      // = 100 + 20 + 0.65*20 + 0.6*15 = 120 + 13 + 9 = 142 ml
      const expectedVreserve = 100 + 20 + 0.65 * 20 + 0.6 * 15;
      expect(regions.totalReserveMl).toBeCloseTo(expectedVreserve, 9);

      // Sum of regions: Vbed + Vaqueous + Voil must equal Vreserve
      const sumRegions = regions.bed.volumeMl + regions.aqueous.volumeMl + regions.oil.volumeMl;
      expect(sumRegions).toBeCloseTo(expectedVreserve, 9);
      expect(regions.category).toBe('mixed');
    });

    // 28. Regression across all existing tests
    it('28. confirms all unit and physics constants match scientific spec defaults', () => {
      expect(DENSITY_WATER).toBe(1.0);
      expect(DENSITY_OIL).toBe(0.9);
      expect(DISPLACEMENT_ML_PER_G_SUGAR).toBe(0.65);
      expect(DISPLACEMENT_ML_PER_G_SAND).toBe(0.60);
      expect(MAX_RESERVATION_MILLI_ML).toBe(500000);
      expect(epsilonMass(0)).toBe(1e-8);
      expect(epsilonMass(100)).toBeCloseTo(1e-7, 10); // max(1e-8, 1e-9 * 100) = 1e-7
    });
  });
});
