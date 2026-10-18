import { describe, expect, it } from 'vitest';
import {
  A_STIR,
  computeAnalyticFlow,
  computeDriveCoupling,
  computeFlowEquilibrium,
  computeFlowIntensity,
  computeFlowNext,
  computeRadialCoupling,
  DEFAULT_H,
  FLOW_LAMBDA,
  HeadlessSimulationEngine,
  HeadlessSimulationFacade,
  MAX_ROD_SPEED_RAD_PER_SEC,
  stepStirringFlow,
} from '../core/SimulationEngine';
import {
  computeBeakerRegions,
  computeMechanicalContact,
  type PhaseMasses,
} from '../constants/beaker';

describe('V2-03 — Flow Response & Inertia Decay', () => {
  describe('Part A: Pure Model Unit Tests (1-10)', () => {
    // 1. Zero initial flow, constant positive drive: compare with analytic solution at 1s and 10s
    it('1. matches analytic solution from zero initial flow under constant positive drive at 1s and 10s', () => {
      const drive = 6.0; // rad/s
      const h = 1 / 60;
      let flow = 0.0;

      // Advance 60 ticks (1.0 second)
      for (let i = 0; i < 60; i++) {
        flow = computeFlowNext(flow, drive, h);
      }

      const expected1s = computeAnalyticFlow(1.0, 0.0, drive);
      // Independent formula check: omegaEq * (1 - exp(-2.8 * 1.0))
      const omegaEq = (A_STIR / FLOW_LAMBDA) * drive; // (2 / 2.8) * 6 = 30 / 7
      const independent1s = omegaEq * (1 - Math.exp(-2.8 * 1.0));

      expect(expected1s).toBeCloseTo(independent1s, 10);
      expect(flow).toBeCloseTo(expected1s, 8);
      expect(flow).toBeCloseTo(4.02509973, 5);

      // Advance another 540 ticks (total 600 ticks = 10.0 seconds)
      for (let i = 60; i < 600; i++) {
        flow = computeFlowNext(flow, drive, h);
      }

      const expected10s = computeAnalyticFlow(10.0, 0.0, drive);
      expect(flow).toBeCloseTo(expected10s, 8);
      // After 10s (28 decay constants), flow is within 1e-10 of equilibrium 30/7
      expect(flow).toBeCloseTo(30 / 7, 7);
      expect(computeFlowIntensity(flow)).toBeCloseTo(5 / 7, 7);
    });

    // 2. Negative drive: signed negative flow with strictly positive intensity
    it('2. preserves signed negative flow with non-negative intensity under negative drive', () => {
      const drive = -6.0;
      const h = 1 / 60;
      let flow = 0.0;

      for (let i = 0; i < 60; i++) {
        flow = computeFlowNext(flow, drive, h);
      }

      expect(flow).toBeLessThan(0);
      expect(flow).toBeCloseTo(-4.02509973, 5);

      const intensity = computeFlowIntensity(flow);
      expect(intensity).toBeGreaterThan(0);
      expect(intensity).toBeCloseTo(4.02509973 / 6, 5);
    });

    // 3. Drive sign change: smooth continuous transition crossing zero
    it('3. transitions continuously through zero when drive flips sign', () => {
      const h = 1 / 60;
      let flow = 30 / 7; // start at +4.2857 rad/s
      const reverseDrive = -6.0;
      const history: number[] = [flow];

      // Step until well into negative territory
      for (let i = 0; i < 30; i++) {
        flow = computeFlowNext(flow, reverseDrive, h);
        history.push(flow);
      }

      // Check continuity: monotonic decrease
      for (let i = 1; i < history.length; i++) {
        expect(history[i]).toBeLessThan(history[i - 1]);
      }

      // Zero-crossing check: analytical t* = ln(2) / 2.8 ≈ 0.24755s (between tick 14 and 15)
      expect(history[14]).toBeGreaterThan(0);
      expect(history[15]).toBeLessThan(0);
    });

    // 4. Stop from omegaFlow = 30/7: exponential decay omegaFlow(t) = (30/7) * exp(-2.8 * t)
    it('4. matches exact exponential decay after stop from 30/7 (SC-F02)', () => {
      const h = 1 / 60;
      let flow = 30 / 7;

      // Run 60 ticks (1.0 second)
      for (let i = 0; i < 60; i++) {
        flow = stepStirringFlow({
          omegaFlow: flow,
          omegaRod: 0,
          contact: 1.0,
          radius: 0.4,
          hasCarrier: true,
          h,
        }).omegaFlow;
      }

      const expectedDecay1s = (30 / 7) * Math.exp(-2.8 * 1.0);
      expect(flow).toBeCloseTo(expectedDecay1s, 8);
      expect(flow).toBeCloseTo(0.26061455, 6);

      // Run another 60 ticks (total 2.0 seconds)
      for (let i = 0; i < 60; i++) {
        flow = stepStirringFlow({
          omegaFlow: flow,
          omegaRod: 0,
          contact: 1.0,
          radius: 0.4,
          hasCarrier: true,
          h,
        }).omegaFlow;
      }

      const expectedDecay2s = (30 / 7) * Math.exp(-2.8 * 2.0);
      expect(flow).toBeCloseTo(expectedDecay2s, 8);
      expect(flow).toBeCloseTo(0.01584798, 6);
    });

    // 5. Prescribed rod speeds (1, 3, 6, 8 rad/s) and their equilibrium values
    it('5. computes exact equilibrium and asymptotic intensities for rod speeds 1, 3, 6, 8 rad/s', () => {
      const speeds = [
        { speed: 1.0, expectedOmegaEq: 5 / 7, expectedIeq: 5 / 42 },
        { speed: 3.0, expectedOmegaEq: 15 / 7, expectedIeq: 5 / 14 },
        { speed: 6.0, expectedOmegaEq: 30 / 7, expectedIeq: 5 / 7 },
        { speed: 8.0, expectedOmegaEq: 40 / 7, expectedIeq: 20 / 21 },
      ];

      for (const { speed, expectedOmegaEq, expectedIeq } of speeds) {
        const drive = computeDriveCoupling(1.0, 1.0, speed);
        const omegaEq = computeFlowEquilibrium(drive);
        const intensity = computeFlowIntensity(omegaEq);

        expect(omegaEq).toBeCloseTo(expectedOmegaEq, 10);
        expect(intensity).toBeCloseTo(expectedIeq, 10);
      }
    });

    // 6. Partial contact (0.047) and radial coupling (0.0, 0.2, 0.4)
    it('6. calculates partial contact coupling in W7ml and radial dependence (SC-H02)', () => {
      // W = 7 ml, no bed -> contact = 0.047
      const phasesW7ml: PhaseMasses = {
        Wml: 7,
        Oml: 0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        fGu: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const regions = computeBeakerRegions(phasesW7ml);
      const contact = computeMechanicalContact(regions, 0.14);
      expect(contact).toBeCloseTo(0.047, 4);

      // radius = 0.4 -> radialCoupling = 1.0, rod = 6 rad/s
      const coupling04 = computeRadialCoupling(0.4);
      expect(coupling04).toBe(1.0);
      const drive04 = computeDriveCoupling(contact, coupling04, 6.0);
      expect(drive04).toBeCloseTo(0.282, 4);
      const omegaEq04 = computeFlowEquilibrium(drive04);
      expect(omegaEq04).toBeCloseTo(0.201428571, 7);

      // radius = 0.2 -> radialCoupling = 0.5
      const coupling02 = computeRadialCoupling(0.2);
      expect(coupling02).toBe(0.5);
      const drive02 = computeDriveCoupling(contact, coupling02, 6.0);
      expect(drive02).toBeCloseTo(0.141, 4);
      const omegaEq02 = computeFlowEquilibrium(drive02);
      expect(omegaEq02).toBeCloseTo(0.100714286, 7);

      // radius = 0.0 -> center coupling = 0
      const coupling0 = computeRadialCoupling(0.0);
      expect(coupling0).toBe(0.0);
      const drive0 = computeDriveCoupling(contact, coupling0, 6.0);
      expect(drive0).toBe(0.0);
    });

    // 7. Thin liquid and dry bed gate
    it('7. produces zero drive with flow decay in thin liquid, and forces zero flow when dry (SC-H01)', () => {
      // Thin liquid: W = 0.1 ml -> contact = 0
      const phasesThin: PhaseMasses = {
        Wml: 0.1,
        Oml: 0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        fGu: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const regionsThin = computeBeakerRegions(phasesThin);
      const contactThin = computeMechanicalContact(regionsThin, 0.14);
      expect(contactThin).toBe(0);

      // Thin liquid has carrier (W > 0), so previous flow decays exponentially
      const resThin = stepStirringFlow({
        omegaFlow: 2.0,
        omegaRod: 6.0,
        contact: contactThin,
        radius: 0.4,
        hasCarrier: true,
        h: 1 / 60,
      });
      expect(resThin.omegaDrive).toBe(0);
      expect(resThin.omegaFlow).toBeCloseTo(2.0 * Math.exp(-2.8 / 60), 8);
      expect(resThin.omegaFlow).toBeLessThan(2.0);

      // Dry bed: W = 0, O = 0, G = 10g, S = 10g -> hasCarrier = false -> flow immediately 0
      const resDry = stepStirringFlow({
        omegaFlow: 2.0,
        omegaRod: 6.0,
        contact: 1.0,
        radius: 0.4,
        hasCarrier: false,
        h: 1 / 60,
      });
      expect(resDry.omegaDrive).toBe(0);
      expect(resDry.omegaFlow).toBe(0);
      expect(resDry.intensity).toBe(0);
    });

    // 8. Oil-only creates valid carrier and coupling
    it('8. provides valid carrier and coupling in oil-only system (SC-R01)', () => {
      const phasesOilOnly: PhaseMasses = {
        Wml: 0,
        Oml: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        fGu: 0,
        St: 10,
        Sb: 4,
        Ss: 6,
        Ot: 90,
        Ol: 90,
        Od: 0,
      };
      const regions = computeBeakerRegions(phasesOilOnly);
      const contact = computeMechanicalContact(regions, 0.15008);
      expect(contact).toBe(1.0);

      const res = stepStirringFlow({
        omegaFlow: 0,
        omegaRod: 6.0,
        contact,
        radius: 0.4,
        hasCarrier: true,
        h: 1 / 60,
      });
      expect(res.omegaDrive).toBe(6.0);
      expect(res.omegaFlow).toBeGreaterThan(0);
    });

    // 9. Fallback a=b=0 and robustness against invalid inputs
    it('9. preserves flow when a=b=0 and safely handles invalid non-finite inputs without NaN', () => {
      // When a = 0 and b = 0, lambda = 0 -> retains omegaFlow without dividing by zero
      const resZeroLambda = computeFlowNext(3.5, 6.0, 1 / 60, 0, 0);
      expect(resZeroLambda).toBe(3.5);

      // Non-finite omegaRod or contact
      expect(computeDriveCoupling(NaN, 1.0, 6.0)).toBe(0);
      expect(computeDriveCoupling(1.0, NaN, 6.0)).toBe(0);
      expect(computeDriveCoupling(1.0, 1.0, NaN)).toBe(0);
      expect(computeDriveCoupling(1.0, 1.0, Infinity)).toBe(0);

      // Non-finite radial coupling
      expect(computeRadialCoupling(NaN)).toBe(0);
      expect(computeRadialCoupling(-0.5)).toBe(0);

      // Non-finite flow intensity
      expect(computeFlowIntensity(NaN)).toBe(0);
      expect(computeFlowIntensity(Infinity)).toBe(0);
    });

    // 10. Intensity bounded in [0, 1] and signed flow direction preserved
    it('10. bounds intensity to [0, 1] and preserves signed flow orientation', () => {
      // Flow exceeding normalization (6 rad/s)
      expect(computeFlowIntensity(12.0)).toBe(1.0);
      expect(computeFlowIntensity(-12.0)).toBe(1.0);

      // Flow at 3 rad/s
      expect(computeFlowIntensity(3.0)).toBe(0.5);
      expect(computeFlowIntensity(-3.0)).toBe(0.5);

      // Flow at 0
      expect(computeFlowIntensity(0)).toBe(0);

      // Rod angular speed cap of 8 rad/s
      const driveMax = computeDriveCoupling(1.0, 1.0, 100.0);
      expect(driveMax).toBe(MAX_ROD_SPEED_RAD_PER_SEC);

      const driveMin = computeDriveCoupling(1.0, 1.0, -100.0);
      expect(driveMin).toBe(-MAX_ROD_SPEED_RAD_PER_SEC);
    });
  });

  describe('Part B: Engine Integration Tests (11-20)', () => {
    // 11. Flow advances over fixed steps on engine
    it('11. advances flow over fixed steps on HeadlessSimulationEngine (SC-F01)', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const facade = new HeadlessSimulationFacade(engine);

      // Add 100ml water and resume
      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'resume' });

      // Inject constant prescribed rod speed = 6 rad/s at radius 0.4
      // Using createForTesting with validated state
      const state = { ...engine.getState() };
      state.omegaRod = 6.0;
      state.rod = { ...state.rod, radius: 0.4, x: 0.4, z: 0 };
      const testEngine = HeadlessSimulationEngine.createForTesting(state);

      // Advance 60 ticks (1.0 second active time)
      for (let i = 0; i < 60; i++) {
        testEngine.advance(1 / 60);
      }

      const snap = testEngine.snapshot();
      expect(snap.contact).toBe(1.0);
      expect(snap.intensity).toBeCloseTo(4.02509973 / 6, 5);
      expect(testEngine.getState().omegaDrive).toBeCloseTo(6.0, 6);
      expect(testEngine.getState().omegaFlow).toBeCloseTo(4.02509973, 5);
    });

    // 12. Stop (releaseDrive) does not pause and decays flow continuously
    it('12. keeps clock running and decays flow exponentially upon releaseDrive (SC-F02)', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'resume' });

      // Start spinning with omegaFlow = 30/7
      const state = { ...engine.getState() };
      state.omegaFlow = 30 / 7;
      state.omegaRod = 6.0;
      state.rod = { ...state.rod, radius: 0.4, x: 0.4, z: 0 };
      const testEngine = HeadlessSimulationEngine.createForTesting(state);

      // Dispatch releaseDrive (stop)
      const testFacade = new HeadlessSimulationFacade(testEngine);
      const ackStop = testFacade.dispatchIntent({ type: 'releaseDrive' });
      expect(ackStop.accepted).toBe(true);

      // Check invariants immediately after releaseDrive:
      // Clock is NOT paused, omegaRod = 0, omegaDrive = 0, but omegaFlow is NOT zeroed!
      expect(testEngine.getState().paused).toBe(false);
      expect(testEngine.getState().omegaRod).toBe(0);
      expect(testEngine.getState().omegaDrive).toBe(0);
      expect(testEngine.getState().omegaFlow).toBeCloseTo(30 / 7, 8);

      // Advance 60 ticks (1.0 second) -> decay
      for (let i = 0; i < 60; i++) {
        testEngine.advance(1 / 60);
      }

      const expectedDecay = (30 / 7) * Math.exp(-2.8 * 1.0);
      expect(testEngine.getState().omegaFlow).toBeCloseTo(expectedDecay, 6);
      expect(testEngine.getState().omegaRod).toBe(0);
      expect(testEngine.getState().omegaDrive).toBe(0);
    });

    // 13. Pause freezes flow, resume continues
    it('13. freezes flow without decay during pause, and resumes decay afterward', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'resume' });

      const state = { ...engine.getState() };
      state.omegaFlow = 3.0;
      const testEngine = HeadlessSimulationEngine.createForTesting(state);
      const testFacade = new HeadlessSimulationFacade(testEngine);

      // Pause simulation
      testFacade.dispatchIntent({ type: 'pause' });
      expect(testEngine.getState().paused).toBe(true);
      expect(testEngine.getState().omegaFlow).toBe(3.0);

      // Advance while paused: no steps executed, flow remains frozen
      const resPaused = testEngine.advance(5.0);
      expect(resPaused.stepsExecuted).toBe(0);
      expect(testEngine.getState().omegaFlow).toBe(3.0);

      // Resume simulation and advance 60 ticks (1.0s) -> decays from 3.0
      testFacade.dispatchIntent({ type: 'resume' });
      for (let i = 0; i < 60; i++) {
        testEngine.advance(1 / 60);
      }

      const expectedFlow = 3.0 * Math.exp(-2.8 * 1.0);
      expect(testEngine.getState().omegaFlow).toBeCloseTo(expectedFlow, 6);
    });

    // 14. Reset zeroes flow, drive, rod, and duplicate reset behaves correctly
    it('14. resets flow to 0 on scientific reset, and duplicate reset does not reapply (SC-C04)', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'resume' });

      const state = { ...engine.getState() };
      state.omegaFlow = 4.0;
      state.omegaRod = 6.0;
      state.omegaDrive = 6.0;
      const testEngine = HeadlessSimulationEngine.createForTesting(state);

      // Dispatch reset
      const resetCmd = {
        clientId: 'client-1',
        seq: testEngine.getNextSequence(),
        expectedGeneration: testEngine.getCurrentGeneration(),
        payload: { type: 'reset' as const },
      };
      const ackReset = testEngine.dispatch(resetCmd);
      expect(ackReset.accepted).toBe(true);
      expect(ackReset.duplicate).toBe(false);

      expect(testEngine.getState().omegaRod).toBe(0);
      expect(testEngine.getState().omegaDrive).toBe(0);
      expect(testEngine.getState().omegaFlow).toBe(0);
      expect(testEngine.getState().paused).toBe(true);

      // Replay same reset command: duplicate acknowledged, state unchanged
      const ackDuplicate = testEngine.dispatch(resetCmd);
      expect(ackDuplicate.accepted).toBe(true);
      expect(ackDuplicate.duplicate).toBe(true);
      expect(ackDuplicate.generation).toBe(ackReset.generation);
      expect(testEngine.getState().omegaFlow).toBe(0);
    });

    // 15. Detached snapshot reflects committed state and contact/intensity
    it('15. provides detached snapshot with consistent contact and intensity (SC-B01)', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'resume' });

      const state = { ...engine.getState() };
      state.omegaFlow = 3.0; // intensity = 3 / 6 = 0.5
      const testEngine = HeadlessSimulationEngine.createForTesting(state);

      const snap = testEngine.snapshot();
      expect(snap.intensity).toBe(0.5);
      expect(snap.contact).toBe(1.0);

      // Mutate snapshot properties: core state must NOT change
      expect(() => {
        // @ts-expect-error - readonly freeze check
        snap.intensity = 0.99;
      }).toThrow();
      expect(testEngine.snapshot().intensity).toBe(0.5);
    });

    // 16. Mass, input deciTicks, fGu, seed remain invariant across flow steps
    it('16. strictly preserves mass compartments, input ticks, fGu, and seed during flow stepping', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      facade.dispatchIntent({ type: 'resume' });

      const beforeMass = { ...engine.getState().mass };
      const beforeInput = { ...engine.getState().input };
      const beforeFGu = engine.getState().fGu;
      const beforeSeed = engine.getState().seed;

      // Advance 120 ticks (2.0 seconds)
      engine.advance(2.0);

      const afterState = engine.getState();
      expect(afterState.mass.Gt).toBe(beforeMass.Gt);
      expect(afterState.mass.Gu + afterState.mass.Gd).toBeCloseTo(beforeMass.Gt, 9);
      expect(afterState.mass.Gd).toBeGreaterThan(0); // Background dissolution proceeds
      expect(afterState.mass.W).toBe(beforeMass.W);
      expect(afterState.input).toEqual(beforeInput);
      expect(afterState.fGu).toBe(beforeFGu);
      expect(afterState.seed).toBe(beforeSeed);
    });

    // 17. TickIndex, stateVersion, and elapsedSeconds increment exactly once per step
    it('17. increments tickIndex, stateVersion, and elapsedSeconds exactly once per fixed step', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'resume' });

      const initialTick = engine.getState().tickIndex;
      const initialVersion = engine.getState().stateVersion;

      // Advance exactly 5 steps (5 * 1/60s)
      engine.advance(5 / 60);

      expect(engine.getState().tickIndex).toBe(initialTick + 5);
      expect(engine.getState().stateVersion).toBe(initialVersion + 5);
      expect(engine.getState().elapsedSeconds).toBeCloseTo((initialTick + 5) * (1 / 60), 10);
    });

    // 18. Exact tick-boundary trace produces identical flow trajectory at 30, 60, and 120 FPS
    it('18. produces identical flow trajectory across 30, 60, and 120 FPS (SC-N01 / SC-T01)', () => {
      const runAtFps = (frameDelta: number) => {
        const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
        const facade = new HeadlessSimulationFacade(engine);
        facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
        facade.dispatchIntent({ type: 'resume' });

        const state = { ...engine.getState() };
        state.omegaRod = 6.0;
        state.rod = { ...state.rod, radius: 0.4, x: 0.4, z: 0 };
        const testEngine = HeadlessSimulationEngine.createForTesting(state);

        // Advance 1.0 second active time at specified FPS
        const totalFrames = Math.round(1.0 / frameDelta);
        for (let f = 0; f < totalFrames; f++) {
          testEngine.advance(frameDelta);
        }
        return testEngine.getState().omegaFlow;
      };

      const flow30 = runAtFps(1 / 30);  // 30 FPS (2 steps/frame)
      const flow60 = runAtFps(1 / 60);  // 60 FPS (1 step/frame)
      const flow120 = runAtFps(1 / 120); // 120 FPS (1 step every 2 frames)

      expect(flow30).toBeCloseTo(flow60, 6);
      expect(flow120).toBeCloseTo(flow60, 6);
      expect(flow60).toBeCloseTo(4.02509973, 5);
    });

    // 19. Compatibility between h=1/60 and h=1/120 with analytic solution
    it('19. aligns h=1/60 and h=1/120 simulations with the continuous analytic solution (SC-N05)', () => {
      // 1.0s simulation with h = 1/60
      const engine60 = new HeadlessSimulationEngine({
        clientId: 'client-1',
        clockConfig: { h: 1 / 60, maxSteps: 6 },
      });
      const facade60 = new HeadlessSimulationFacade(engine60);
      facade60.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade60.dispatchIntent({ type: 'resume' });

      const state60 = { ...engine60.getState(), omegaRod: 6.0 };
      state60.rod = { ...state60.rod, radius: 0.4, x: 0.4, z: 0 };
      const testEngine60 = HeadlessSimulationEngine.createForTesting(state60, {
        clockConfig: { h: 1 / 60, maxSteps: 6 },
      });
      for (let i = 0; i < 60; i++) {
        testEngine60.advance(1 / 60);
      }

      // 1.0s simulation with h = 1/120
      const engine120 = new HeadlessSimulationEngine({
        clientId: 'client-1',
        clockConfig: { h: 1 / 120, maxSteps: 12 },
      });
      const facade120 = new HeadlessSimulationFacade(engine120);
      facade120.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade120.dispatchIntent({ type: 'resume' });

      const state120 = { ...engine120.getState(), omegaRod: 6.0 };
      state120.rod = { ...state120.rod, radius: 0.4, x: 0.4, z: 0 };
      const testEngine120 = HeadlessSimulationEngine.createForTesting(state120, {
        clockConfig: { h: 1 / 120, maxSteps: 12 },
      });
      for (let i = 0; i < 120; i++) {
        testEngine120.advance(1 / 120);
      }

      const analytic1s = computeAnalyticFlow(1.0, 0, 6.0);

      expect(testEngine60.getState().omegaFlow).toBeCloseTo(analytic1s, 6);
      expect(testEngine120.getState().omegaFlow).toBeCloseTo(analytic1s, 6);
      expect(testEngine120.getState().tickIndex).toBe(120);
      expect(testEngine60.getState().tickIndex).toBe(60);
    });

    // 20. Regression & timing contract checks
    it('20. verifies timing contracts: advance vs advanceTimestamp, ReadonlyClock, and step hook reset fencing', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'resume' });

      // Contract 2a: advance(realDeltaSeconds) does NOT drop active delta after resume
      const resAdvance = engine.advance(1 / 60);
      expect(resAdvance.stepsExecuted).toBe(1);
      expect(resAdvance.droppedWallTime).toBe(0);

      // Contract 2b: advanceTimestamp(ms) drops wall gap on first frame after resume/pause
      facade.dispatchIntent({ type: 'pause' });
      facade.dispatchIntent({ type: 'resume' });
      const resFirstTs = engine.advanceTimestamp(5000);
      expect(resFirstTs.stepsExecuted).toBe(0); // first timestamp sets anchor with delta 0
      const resSecondTs = engine.advanceTimestamp(5000 + 1000 / 60);
      expect(resSecondTs.stepsExecuted).toBe(1);

      // Contract 6a: getClock returns ReadonlyClock without direct advance/reset mutators
      const clockView = engine.getClock();
      expect(clockView.getConfig().h).toBeCloseTo(DEFAULT_H, 10);
      expect(typeof clockView.getAccumulator).toBe('function');
      // @ts-expect-error - advance must not be accessible on ReadonlyClock view
      expect(clockView.advance).toBeUndefined();

      // Contract 6b: reset inside beforeStepHook cleanly halts the advance loop
      let hookTriggered = false;
      engine.setBeforeStepHook((tick) => {
        if (tick === 2) {
          hookTriggered = true;
          // Dispatch reset inside hook
          facade.dispatchIntent({ type: 'reset' });
        }
      });

      // Try advancing 4 steps in one frame: step at tick 2 triggers reset, halting execution before step completes
      const advanceResult = engine.advance(4 / 60);
      expect(hookTriggered).toBe(true);
      expect(advanceResult.stepsExecuted).toBe(0);
      expect(engine.getState().paused).toBe(true);
      expect(engine.getState().generation).toBe(1);
    });
  });
});
