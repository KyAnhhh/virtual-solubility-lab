import { describe, expect, it } from 'vitest';
import {
  computeAnalyticDissolution,
  computeDissolutionProgress,
  computeDissolutionRate,
  computeDissolutionStep,
  computeSaturationRatio,
  hasExcessSugar,
  hasResidualSolidSugar,
  isNearSaturation,
  stepDissolution,
} from '../models/Dissolution';
import {
  computeWaterCapacityG,
  DISSOLUTION_RATE_BASE,
  DISSOLUTION_RATE_STIRRED,
  significanceThreshold,
  SOLUBILITY_SUGAR_20C,
} from '../constants/science';
import {
  createInitialScienceState,
  DEFAULT_SEED,
  type ScienceMassCompartments,
} from '../core/SimulationState';
import {
  HeadlessSimulationEngine,
  HeadlessSimulationFacade,
} from '../core/HeadlessSimulationEngine';
import { validateMassInvariants } from '../models/MassLedger';

/**
 * Helper to advance headless engine by simulated seconds using fixed timestep h = 1/60 s.
 * Calls engine.advance(h) repeatedly to comply with SimulationClock accumulator clamping (max 0.1s per step).
 */
function advanceSeconds(engine: HeadlessSimulationEngine, seconds: number, h = 1 / 60): void {
  const steps = Math.round(seconds / h);
  for (let i = 0; i < steps; i++) {
    engine.advance(h);
  }
}

describe('V3-02 — Dissolution Bounded theo Nước và Bão Hòa', () => {
  // --------------------------------------------------------------------------
  // Part A: Pure Dissolution Unit Tests
  // --------------------------------------------------------------------------
  describe('Part A: Pure Model Unit Tests (SC-D01 to SC-D06, SPEC §5.2 & §8)', () => {
    // 1. SC-D01: Carrier Gate — Dry Sugar & Oil-Only
    it('1. SC-D01: produces dG = 0 and Gd = 0 when no water is present (W = 0, dry or oil-only)', () => {
      // Dry sugar only
      const dryMass: ScienceMassCompartments = {
        W: 0,
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

      const dryStep = computeDissolutionStep(dryMass, { intensity: 1.0, h: 1 / 60 });
      expect(dryStep.dG).toBe(0);
      expect(dryStep.capacityG).toBe(0);
      expect(dryStep.available).toBe(0);

      // Sugar in oil-only system (100 ml oil = 90 g, 10 g sugar)
      const oilOnlyMass: ScienceMassCompartments = {
        W: 0,
        Gt: 10,
        Gu: 10,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 90,
        Ol: 90,
        Od: 0,
      };

      const oilStep = computeDissolutionStep(oilOnlyMass, { intensity: 1.0, h: 1 / 60 });
      expect(oilStep.dG).toBe(0);
      expect(oilStep.capacityG).toBe(0);
      expect(oilStep.available).toBe(0);
    });

    // 2. SC-D02: Fixed-I Numeric Oracle at 1s for I = 0
    it('2. SC-D02: matches continuous analytic oracle at 1s for fixed I = 0 within 1e-6 g (SPEC §5.2)', () => {
      // Fixture D: W = 10 g, Gt = 30 g -> capacityG = 20 g
      const W = 10;
      const Gt = 30;
      const intensity = 0;
      const h = 1 / 60;
      const totalSteps = 60; // 1.0 second

      // SPEC §5.2 analytic oracle:
      // Gd(1s) = 20 * (1 - exp(-0.025)) ≈ 0.4938017594 g
      const analyticGd1s = computeAnalyticDissolution(1.0, W, Gt, intensity);
      expect(analyticGd1s).toBeCloseTo(0.49380176, 7);

      // Step discrete model for 60 ticks
      const state = createInitialScienceState(DEFAULT_SEED);
      state.input.water = W * 10;
      state.input.sugar = Gt * 10;
      state.mass.W = W;
      state.mass.Gt = Gt;
      state.mass.Gu = Gt;
      state.mass.Gd = 0;

      for (let i = 0; i < totalSteps; i++) {
        stepDissolution(state, { intensity, h });
      }

      // Discrete exponential stepping with -expm1(-kG * h) matches exact analytic solution
      expect(state.mass.Gd).toBeCloseTo(analyticGd1s, 6);
      expect(Math.abs(state.mass.Gd - 0.49380176)).toBeLessThan(1e-6);
      expect(state.mass.Gu + state.mass.Gd).toBeCloseTo(Gt, 9);
      expect(validateMassInvariants(state).valid).toBe(true);
    });

    // 3. SC-D02: Fixed-I Numeric Oracle at 1s for I = 1
    it('3. SC-D02: matches continuous analytic oracle at 1s for fixed I = 1 within 1e-6 g (SPEC §5.2)', () => {
      // Fixture D: W = 10 g, Gt = 30 g -> capacityG = 20 g
      const W = 10;
      const Gt = 30;
      const intensity = 1.0;
      const h = 1 / 60;
      const totalSteps = 60; // 1.0 second

      // SPEC §5.2 analytic oracle:
      // kG = 0.025 + 0.25 * 1 = 0.275 s^-1
      // Gd(1s) = 20 * (1 - exp(-0.275)) ≈ 4.808557536 g
      const analyticGd1s = computeAnalyticDissolution(1.0, W, Gt, intensity);
      expect(analyticGd1s).toBeCloseTo(4.80855754, 7);

      // Step discrete model for 60 ticks
      const state = createInitialScienceState(DEFAULT_SEED);
      state.input.water = W * 10;
      state.input.sugar = Gt * 10;
      state.mass.W = W;
      state.mass.Gt = Gt;
      state.mass.Gu = Gt;
      state.mass.Gd = 0;

      for (let i = 0; i < totalSteps; i++) {
        stepDissolution(state, { intensity, h });
      }

      expect(state.mass.Gd).toBeCloseTo(analyticGd1s, 6);
      expect(Math.abs(state.mass.Gd - 4.80855754)).toBeLessThan(1e-6);
      expect(state.mass.Gu + state.mass.Gd).toBeCloseTo(Gt, 9);
      expect(validateMassInvariants(state).valid).toBe(true);
    });

    // 4. SC-D03: Long Run Saturation Cap at 600s (36,000 ticks)
    it('4. SC-D03: long run at 600s asymptotically approaches capacity (20g) without exceeding it (SPEC §5.2)', () => {
      const W = 10;
      const Gt = 30;
      const capacityG = W * SOLUBILITY_SUGAR_20C; // 20 g
      const intensity = 1.0;
      const h = 1 / 60;
      const totalTicks = 36000; // 600 seconds

      const state = createInitialScienceState(DEFAULT_SEED);
      state.input.water = W * 10;
      state.input.sugar = Gt * 10;
      state.mass.W = W;
      state.mass.Gt = Gt;
      state.mass.Gu = Gt;
      state.mass.Gd = 0;

      for (let i = 0; i < totalTicks; i++) {
        stepDissolution(state, { intensity, h });
      }

      // Gd must not exceed capacityG
      expect(state.mass.Gd).toBeLessThanOrEqual(capacityG);
      // After 600s with kG = 0.275, exp(-0.275 * 600) = exp(-165) ≈ 0 -> virtually fully saturated at 20g
      expect(state.mass.Gd).toBeCloseTo(20.0, 6);
      // Undissolved sugar Gu must be >= 10g (residual excess)
      expect(state.mass.Gu).toBeGreaterThanOrEqual(10.0 - 1e-8);
      expect(state.mass.Gu).toBeCloseTo(10.0, 6);
      expect(state.mass.Gu + state.mass.Gd).toBeCloseTo(Gt, 9);
      expect(validateMassInvariants(state).valid).toBe(true);
    });

    // 5. SC-D04: Stirring Rate Changes Kinetics, Not Capacity
    it('5. SC-D04: stirring increases rate kG but leaves capacity invariant and preserves monotonicity', () => {
      const W = 10;
      const Gt = 30;
      const h = 1 / 60;

      const rate0 = computeDissolutionRate(0);
      const rateMed = computeDissolutionRate(0.5);
      const rateFast = computeDissolutionRate(1.0);

      expect(rate0).toBe(DISSOLUTION_RATE_BASE); // 0.025
      expect(rateMed).toBe(0.025 + 0.25 * 0.5);   // 0.150
      expect(rateFast).toBe(DISSOLUTION_RATE_BASE + DISSOLUTION_RATE_STIRRED); // 0.275
      expect(rate0).toBeLessThan(rateMed);
      expect(rateMed).toBeLessThan(rateFast);

      // Run 60 ticks for each intensity
      const runForTicks = (intensity: number, ticks: number) => {
        const state = createInitialScienceState(DEFAULT_SEED);
        state.input.water = W * 10;
        state.input.sugar = Gt * 10;
        state.mass.W = W;
        state.mass.Gt = Gt;
        state.mass.Gu = Gt;
        state.mass.Gd = 0;
        let prevGd = 0;
        for (let i = 0; i < ticks; i++) {
          stepDissolution(state, { intensity, h });
          expect(state.mass.Gd).toBeGreaterThanOrEqual(prevGd); // Monotonicity
          prevGd = state.mass.Gd;
        }
        return state.mass.Gd;
      };

      const gd0 = runForTicks(0, 60);
      const gdMed = runForTicks(0.5, 60);
      const gdFast = runForTicks(1.0, 60);

      expect(gd0).toBeLessThan(gdMed);
      expect(gdMed).toBeLessThan(gdFast);

      // All share the exact same solvent capacity
      expect(computeWaterCapacityG(W)).toBe(20.0);
    });

    // 6. SC-D06: Robustness on Zero, Dry, and Tiny Amounts
    it('6. SC-D06: handles zero sugar, zero water, and tiny amounts (0.1g / 0.1ml) without NaN or division by zero', () => {
      // Zero sugar
      const zeroSugarMass: ScienceMassCompartments = {
        W: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const resZeroSugar = computeDissolutionStep(zeroSugarMass, { intensity: 1.0, h: 1 / 60 });
      expect(resZeroSugar.dG).toBe(0);
      expect(Number.isFinite(resZeroSugar.dG)).toBe(true);

      // Tiny amount: 0.1 ml water (= 0.1 g), 0.1 g sugar
      const tinyMass: ScienceMassCompartments = {
        W: 0.1,
        Gt: 0.1,
        Gu: 0.1,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      // Capacity = 0.1 * 2.0 = 0.2 g -> sugar can dissolve completely
      const resTiny = computeDissolutionStep(tinyMass, { intensity: 1.0, h: 1 / 60 });
      expect(resTiny.dG).toBeGreaterThan(0);
      expect(resTiny.dG).toBeLessThanOrEqual(0.1);
      expect(Number.isFinite(resTiny.dG)).toBe(true);
      expect(resTiny.capacityG).toBeCloseTo(0.2, 9);
      expect(resTiny.available).toBeCloseTo(0.1, 9);

      // Step tiny mass in state with matching input ticks (1 tick each)
      const tinyState = createInitialScienceState(DEFAULT_SEED);
      tinyState.input.water = 1;
      tinyState.input.sugar = 1;
      Object.assign(tinyState.mass, tinyMass);
      stepDissolution(tinyState, { intensity: 0.5, h: 1 / 60 });
      expect(Number.isFinite(tinyState.mass.Gu)).toBe(true);
      expect(Number.isFinite(tinyState.mass.Gd)).toBe(true);
      expect(tinyState.mass.Gu + tinyState.mass.Gd).toBeCloseTo(0.1, 9);
      expect(validateMassInvariants(tinyState).valid).toBe(true);
    });

    // 7. Small Residual Mass Preservation
    it('7. preserves small residual mass without snapping or truncating to zero', () => {
      const state = createInitialScienceState(DEFAULT_SEED);
      state.input.water = 1000;
      state.input.sugar = 10;
      state.mass.W = 100;
      state.mass.Gt = 1.0;
      state.mass.Gu = 0.0005; // tiny residual < 0.001g
      state.mass.Gd = 0.9995;

      // Single step with tiny remaining sugar
      stepDissolution(state, { intensity: 0, h: 1 / 60 });

      // Gu must decrease smoothly, remaining > 0 without being clamped to 0
      expect(state.mass.Gu).toBeGreaterThan(0);
      expect(state.mass.Gu).toBeLessThan(0.0005);
      expect(state.mass.Gu + state.mass.Gd).toBeCloseTo(1.0, 9);
      expect(validateMassInvariants(state).valid).toBe(true);
    });

    // 8. Timestep Independence: h = 1/60 vs h = 1/120
    it('8. produces mathematically identical results for 60 steps at h=1/60 vs 120 steps at h=1/120', () => {
      const W = 50;
      const Gt = 20;
      const intensity = 0.75;

      // Run 60 steps at h = 1/60 (1.0 second)
      const state1 = createInitialScienceState(DEFAULT_SEED);
      state1.input.water = W * 10;
      state1.input.sugar = Gt * 10;
      state1.mass.W = W;
      state1.mass.Gt = Gt;
      state1.mass.Gu = Gt;
      state1.mass.Gd = 0;
      for (let i = 0; i < 60; i++) {
        stepDissolution(state1, { intensity, h: 1 / 60 });
      }

      // Run 120 steps at h = 1/120 (1.0 second)
      const state2 = createInitialScienceState(DEFAULT_SEED);
      state2.input.water = W * 10;
      state2.input.sugar = Gt * 10;
      state2.mass.W = W;
      state2.mass.Gt = Gt;
      state2.mass.Gu = Gt;
      state2.mass.Gd = 0;
      for (let i = 0; i < 120; i++) {
        stepDissolution(state2, { intensity, h: 1 / 120 });
      }

      // Difference should be practically zero (< 1e-11 g)
      expect(Math.abs(state1.mass.Gd - state2.mass.Gd)).toBeLessThan(1e-11);
      expect(Math.abs(state1.mass.Gu - state2.mass.Gu)).toBeLessThan(1e-11);
    });

    // 9. Educational / UX Predicates (SPEC §8)
    it('9. correctly evaluates educational predicates (nearSaturation, excessSugar, residualSolid, progress)', () => {
      const W = 10;
      const capacityG = computeWaterCapacityG(W); // 20 g
      expect(capacityG).toBe(20.0);

      // Saturated test
      expect(isNearSaturation(19.8, capacityG)).toBe(true);  // 19.8 / 20 = 0.99
      expect(isNearSaturation(19.5, capacityG)).toBe(false); // 19.5 / 20 = 0.975

      // Excess sugar test (Gt > capacity + eps)
      expect(hasExcessSugar(25.0, capacityG, W)).toBe(true);
      expect(hasExcessSugar(20.0, capacityG, W)).toBe(false);
      expect(hasExcessSugar(15.0, capacityG, W)).toBe(false);
      expect(hasExcessSugar(30.0, capacityG, 0)).toBe(false); // No water -> no excess label

      // Residual solid sugar test (Gu > L(Gt))
      const L = significanceThreshold(20); // max(0.01, 0.01*20) = 0.2g
      expect(L).toBe(0.2);
      expect(hasResidualSolidSugar(0.5, 20)).toBe(true); // 0.5 > 0.2 -> true
      expect(hasResidualSolidSugar(0.1, 20)).toBe(false); // 0.1 <= 0.2 -> false
      expect(hasResidualSolidSugar(0, 20)).toBe(false);

      // Saturation ratio and dissolution progress
      expect(computeSaturationRatio(10, 20, W)).toBe(0.5);
      expect(computeSaturationRatio(10, 20, 0)).toBeNull(); // W = 0 -> null
      expect(computeDissolutionProgress(10, 30, 20, W)).toBe(0.5); // 10 / min(30, 20) = 10 / 20 = 0.5
      expect(computeDissolutionProgress(5, 10, 20, W)).toBe(0.5);  // 5 / min(10, 20) = 5 / 10 = 0.5
      expect(computeDissolutionProgress(5, 10, 20, 0)).toBeNull(); // W = 0 -> null
    });
  });

  // --------------------------------------------------------------------------
  // Part B: Engine & Bridge Integration Tests
  // --------------------------------------------------------------------------
  describe('Part B: Engine Integration Tests', () => {
    // 10. Engine Fixed-Step Dissolution
    it('10. running engine dissolves sugar over fixed steps while preserving exact mass invariants', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'test-client' });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 }); // 100 ml = 100 g
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });  // 20 g
      facade.dispatchIntent({ type: 'resume' });

      expect(engine.getState().mass.W).toBe(100);
      expect(engine.getState().mass.Gt).toBe(20);
      expect(engine.getState().mass.Gu).toBe(20);
      expect(engine.getState().mass.Gd).toBe(0);

      // Advance 120 ticks (2.0 seconds) via discrete fixed steps
      advanceSeconds(engine, 2.0);

      const state = engine.getState();
      expect(state.mass.Gd).toBeGreaterThan(0);
      expect(state.mass.Gu).toBeLessThan(20);
      expect(state.mass.Gu + state.mass.Gd).toBeCloseTo(20.0, 9);
      expect(state.mass.W).toBe(100);
      expect(state.tickIndex).toBe(120);
      expect(state.elapsedSeconds).toBeCloseTo(2.0, 9);
      expect(validateMassInvariants(state).valid).toBe(true);
    });

    // 11. Background Dissolution Without Stirring
    it('11. dissolves sugar at base rate kG0 even when observed without auto or rod stirring', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 100 });
      facade.dispatchIntent({ type: 'resume' });

      // Ensure mode is observe and no rod motion
      expect(engine.getState().mode).toBe('observe');
      expect(engine.getState().omegaDrive).toBe(0);
      expect(engine.getState().omegaFlow).toBe(0);

      // Advance 60 ticks (1.0 second)
      advanceSeconds(engine, 1.0);

      // At I = 0, kG = 0.025 s^-1:
      // Gd(1s) = 10 * (1 - exp(-0.025)) ≈ 0.2469 g (since capacity 200g > 10g, limit = 10g)
      const expectedGd = 10 * (1 - Math.exp(-DISSOLUTION_RATE_BASE * 1.0));
      expect(engine.getState().mass.Gd).toBeCloseTo(expectedGd, 4);
    });

    // 12. Auto Fast Stirring Accelerates Dissolution
    it('12. auto fast stirring dissolves sugar significantly faster than background rate', () => {
      // Engine 1: Background only
      const engineBg = new HeadlessSimulationEngine({ clientId: 'bg' });
      const facadeBg = new HeadlessSimulationFacade(engineBg);
      facadeBg.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facadeBg.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      facadeBg.dispatchIntent({ type: 'resume' });
      advanceSeconds(engineBg, 5.0);

      // Engine 2: Auto fast stirring
      const engineFast = new HeadlessSimulationEngine({ clientId: 'fast' });
      const facadeFast = new HeadlessSimulationFacade(engineFast);
      facadeFast.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facadeFast.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      facadeFast.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facadeFast.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facadeFast.dispatchIntent({ type: 'resume' });
      advanceSeconds(engineFast, 5.0);

      // Fast auto stirring must produce more dissolved sugar than background
      const gdBg = engineBg.getState().mass.Gd;
      const gdFast = engineFast.getState().mass.Gd;

      expect(gdFast).toBeGreaterThan(gdBg * 1.5);
    });

    // 13. Paused Timeline Freezes Dissolution
    it('13. pause completely freezes dissolution and timeline, resume continues seamlessly', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 100 });
      facade.dispatchIntent({ type: 'resume' });

      advanceSeconds(engine, 1.0);
      const gdAfter1s = engine.getState().mass.Gd;
      expect(gdAfter1s).toBeGreaterThan(0);

      // Pause
      facade.dispatchIntent({ type: 'pause' });
      expect(engine.getState().paused).toBe(true);

      // Advance during pause: no change in time, tick, or mass
      advanceSeconds(engine, 3.0);
      expect(engine.getState().mass.Gd).toBe(gdAfter1s);
      expect(engine.getState().tickIndex).toBe(60);
      expect(engine.getState().elapsedSeconds).toBeCloseTo(1.0, 9);

      // Resume
      facade.dispatchIntent({ type: 'resume' });
      advanceSeconds(engine, 1.0);
      expect(engine.getState().mass.Gd).toBeGreaterThan(gdAfter1s);
      expect(engine.getState().tickIndex).toBe(120);
    });

    // 14. Stop Auto Decays Flow While Dissolution Continues
    it('14. stop auto (releaseDrive) decays flow while dissolution continues smoothly towards background rate', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      // Run 3 seconds auto
      advanceSeconds(engine, 3.0);
      expect(engine.getState().omegaFlow).toBeGreaterThan(1.0);

      // Release drive (stop auto)
      facade.dispatchIntent({ type: 'releaseDrive' });
      expect(engine.getState().autoDriveEnabled).toBe(false);
      expect(engine.getState().omegaDrive).toBe(0);

      const flowAtStop = engine.getState().omegaFlow;
      const gdAtStop = engine.getState().mass.Gd;

      // Advance 2 seconds after stop
      advanceSeconds(engine, 2.0);

      // Flow decayed
      expect(engine.getState().omegaFlow).toBeLessThan(flowAtStop);
      // Dissolution continued
      expect(engine.getState().mass.Gd).toBeGreaterThan(gdAtStop);
    });

    // 15. SC-D05: Add Water Increases Capacity; Add Oil Does Not
    it('15. SC-D05: adding water increases capacity and resumes dissolution; adding oil does not increase capacity', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      // Fixture D: 10 ml water (10 g) + 30 g sugar -> capacity = 20 g
      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 100 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 300 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      // Advance 10 seconds of fast stirring (600 ticks, matching SC-D05)
      advanceSeconds(engine, 10.0);

      const snap1 = engine.snapshot();
      expect(snap1.capacityG).toBe(20.0);
      expect(snap1.mass.Gd).toBeGreaterThan(3.0);

      const gdBeforeAddWater = engine.getState().mass.Gd;

      // Add 10 ml water (10 g) -> new capacity = 40 g!
      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 100 });

      const snap2 = engine.snapshot();
      expect(snap2.capacityG).toBe(40.0); // Doubled!
      expect(snap2.mass.W).toBe(20.0);

      // Advance 10 more seconds: dissolution resumes with doubled solvent capacity
      advanceSeconds(engine, 10.0);
      expect(engine.getState().mass.Gd).toBeGreaterThan(gdBeforeAddWater);

      const gdBeforeAddOil = engine.getState().mass.Gd;

      // Add 20 ml oil (18 g) -> capacity MUST REMAIN 40 g!
      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 });

      const snap3 = engine.snapshot();
      expect(snap3.capacityG).toBe(40.0); // UNCHANGED!
      expect(snap3.mass.Ot).toBe(18.0);
      expect(snap3.mass.W).toBe(20.0);

      // Advance further: oil did not expand capacity beyond 40g
      advanceSeconds(engine, 10.0);
      expect(engine.getState().mass.Gd).toBeGreaterThan(gdBeforeAddOil);
      expect(engine.getState().mass.Gd).toBeLessThanOrEqual(snap3.capacityG);
      expect(snap3.capacityG).toBe(40.0);
    });

    // 16. Capacity Reservation Invariance (SC-IN03)
    it('16. SC-IN03: sugar dissolution does not shrink beaker capacity reservation (500 ml limit strictly holds)', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      // Add 430 ml water (430,000 milli-ml) + 100 g sugar (65,000 milli-ml) -> total = 495,000 milli-ml
      // 500,000 - 495,000 = 5,000 milli-ml (5.0 ml) headroom left
      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 4300 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      // Run 20 seconds to dissolve sugar
      advanceSeconds(engine, 20.0);
      expect(engine.getState().mass.Gd).toBeGreaterThan(50.0);

      // Try adding 6 ml water (6,000 milli-ml) -> exceeds 5,000 milli-ml headroom!
      // Must be REJECTED with CAPACITY_EXCEEDED even though sugar is dissolved!
      const ack = facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 60 });
      expect(ack.accepted).toBe(false);
      expect(ack.reason).toBe('CAPACITY_EXCEEDED');
    });

    // 17. Dynamic Beaker Geometry Adaptation
    it('17. adapting rod tip adjusts height smoothly as sugar dissolves from solid bed into solution', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 }); // 100 ml water
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 500 });  // 50 g sugar (bed forms!)
      facade.dispatchIntent({ type: 'resume' });

      const tipYInitial = engine.getState().rod.tipY;

      // Advance 10 seconds of dissolution
      advanceSeconds(engine, 10.0);

      const tipYAfter = engine.getState().rod.tipY;
      // As Gu dissolves into Gd, bed height decreases -> rod tip adapts downwards
      expect(tipYAfter).toBeLessThan(tipYInitial);
    });

    // 18. ScalarSnapshot Metrics Accuracy
    it('18. publishes accurate capacityG, saturationRatio, and dissolutionProgress in snapshot', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 }); // 100 ml = 100 g -> capacity 200 g
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 1000 }); // 100 g sugar
      facade.dispatchIntent({ type: 'resume' });

      const snapInit = engine.snapshot();
      expect(snapInit.capacityG).toBe(200.0);
      expect(snapInit.saturationRatio).toBe(0);
      expect(snapInit.dissolutionProgress).toBe(0);

      // Advance 5 seconds
      advanceSeconds(engine, 5.0);

      const snapLater = engine.snapshot();
      expect(snapLater.capacityG).toBe(200.0);
      expect(snapLater.saturationRatio).toBeGreaterThan(0);
      expect(snapLater.saturationRatio).toBe(snapLater.mass.Gd / 200.0);
      // min(100, 200) = 100 -> dissolutionProgress = Gd / 100
      expect(snapLater.dissolutionProgress).toBe(snapLater.mass.Gd / 100.0);
    });

    // 19. FPS Independence across 30, 60, and 120 FPS
    it('19. produces identical scalar dissolution state across 30, 60, and 120 FPS frame advances', () => {
      const runWithFps = (fps: number) => {
        const engine = new HeadlessSimulationEngine({ clientId: `client-${fps}` });
        const facade = new HeadlessSimulationFacade(engine);

        facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
        facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
        facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
        facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
        facade.dispatchIntent({ type: 'resume' });

        const frameDt = 1 / fps;
        const totalFrames = fps * 5; // 5 seconds of active simulation

        for (let f = 0; f < totalFrames; f++) {
          engine.advance(frameDt);
        }

        return engine.getState();
      };

      const state30 = runWithFps(30);
      const state60 = runWithFps(60);
      const state120 = runWithFps(120);

      // All three must produce matching tick counts and identical masses within 1e-6 g
      expect(state30.tickIndex).toBe(300);
      expect(state60.tickIndex).toBe(300);
      expect(state120.tickIndex).toBe(300);

      expect(Math.abs(state30.mass.Gd - state60.mass.Gd)).toBeLessThan(1e-6);
      expect(Math.abs(state60.mass.Gd - state120.mass.Gd)).toBeLessThan(1e-6);
      expect(Math.abs(state30.mass.Gu - state60.mass.Gu)).toBeLessThan(1e-6);
      expect(Math.abs(state60.mass.Gu - state120.mass.Gu)).toBeLessThan(1e-6);
    });
  });
});
