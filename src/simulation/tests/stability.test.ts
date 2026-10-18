import { describe, expect, it } from 'vitest';
import {
  HeadlessSimulationEngine,
  HeadlessSimulationFacade,
} from '../core/HeadlessSimulationEngine';
import {
  TickBoundaryReplayHarness,
  type TraceItem,
} from '../core/ReplayHarness';
import {
  type RenderTarget,
} from '../core/SimulationState';
import { computeBeakerRegions, type PhaseMasses } from '../constants/beaker';
import { SimulationClock } from '../core/SimulationClock';

function createCallerRenderTarget(capacity: number): RenderTarget {
  return {
    positions: new Float32Array(capacity * 3),
    weights: new Float32Array(capacity),
    materials: new Uint8Array(capacity),
    radii: new Float32Array(capacity),
    poolIds: new Uint8Array(capacity),
    count: capacity,
  };
}

/**
 * Deterministic PRNG: Mulberry32 seeded with a 32-bit unsigned integer.
 * Guarantees 100% reproducible randomized command streams without Math.random.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('V3-08 — Stability và Independence của Render Rate', () => {
  // =========================================================================
  // Part 1: State Ownership & Memory Isolation Tests
  // =========================================================================
  describe('1. State Ownership & Memory Isolation', () => {
    it('caller mutating detached nested objects from getState() does not alter engine core', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const facade = new HeadlessSimulationFacade(engine);
      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });

      const copy = engine.getState();
      expect(copy.mass.W).toBe(100);
      expect(copy.mass.Gt).toBe(20);

      // Caller aggressively mutates the detached copy's nested properties
      (copy.mass as { W: number }).W = 999999;
      (copy.mass as { Gt: number }).Gt = 888888;
      (copy.input as { water: number }).water = 777777;
      (copy.rod as { x: number }).x = 42;
      (copy as { paused: boolean }).paused = false;

      // Authoritative core state must remain pristine
      const freshCopy = engine.getState();
      expect(freshCopy.mass.W).toBe(100);
      expect(freshCopy.mass.Gt).toBe(20);
      expect(freshCopy.input.water).toBe(1000);
      expect(freshCopy.rod.x).toBeCloseTo(0.3, 6);
      expect(freshCopy.paused).toBe(true);
    });

    it('an older state capture does not mutate after engine advances', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const facade = new HeadlessSimulationFacade(engine);
      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });
      facade.dispatchIntent({ type: 'resume' });

      const capturedAtT0 = engine.getState();
      expect(capturedAtT0.tickIndex).toBe(0);
      expect(capturedAtT0.elapsedSeconds).toBe(0);
      expect(capturedAtT0.mass.Gd).toBe(0);

      // Advance engine for 60 ticks (1 second)
      for (let i = 0; i < 60; i++) {
        engine.advance(1 / 60);
      }

      // Check current engine state
      const current = engine.getState();
      expect(current.tickIndex).toBe(60);
      expect(current.elapsedSeconds).toBeCloseTo(1.0, 6);
      expect(current.mass.Gd).toBeGreaterThan(0);

      // Check older capture: must remain at t0 values
      expect(capturedAtT0.tickIndex).toBe(0);
      expect(capturedAtT0.elapsedSeconds).toBe(0);
      expect(capturedAtT0.mass.Gd).toBe(0);
      expect(capturedAtT0.mass.W).toBe(100);
    });

    it('mutating a detached state copy does not alter the next-step physics trajectory', () => {
      const engineA = new HeadlessSimulationEngine({ seed: 1729 });
      const engineB = new HeadlessSimulationEngine({ seed: 1729 });
      const facadeA = new HeadlessSimulationFacade(engineA);
      const facadeB = new HeadlessSimulationFacade(engineB);

      // Setup identical initial states
      facadeA.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facadeA.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      facadeA.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facadeA.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });
      facadeA.dispatchIntent({ type: 'resume' });

      facadeB.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facadeB.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      facadeB.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facadeB.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });
      facadeB.dispatchIntent({ type: 'resume' });

      // Corrupt copy from Engine A
      const copyA = engineA.getState();
      (copyA.mass as { W: number }).W = -9999;
      (copyA.mass as { Gd: number }).Gd = 500;
      (copyA as { omegaFlow: number }).omegaFlow = 100;

      // Advance both engines by 120 ticks
      for (let i = 0; i < 120; i++) {
        engineA.advance(1 / 60);
        engineB.advance(1 / 60);
      }

      const stateAAfter = engineA.getState();
      const stateBAfter = engineB.getState();

      // Trajectories must be exactly bit-identical
      expect(stateAAfter.mass.W).toBe(stateBAfter.mass.W);
      expect(stateAAfter.mass.Gt).toBe(stateBAfter.mass.Gt);
      expect(stateAAfter.mass.Gu).toBe(stateBAfter.mass.Gu);
      expect(stateAAfter.mass.Gd).toBe(stateBAfter.mass.Gd);
      expect(stateAAfter.omegaFlow).toBe(stateBAfter.omegaFlow);
      expect(stateAAfter.omegaRod).toBe(stateBAfter.omegaRod);
      expect(stateAAfter.tickIndex).toBe(stateBAfter.tickIndex);
    });

    it('snapshot reads and render copies do not alter science trajectory or RNG stream', () => {
      const engine1 = new HeadlessSimulationEngine({ seed: 1729 });
      const engine2 = new HeadlessSimulationEngine({ seed: 1729 });
      const facade1 = new HeadlessSimulationFacade(engine1);
      const facade2 = new HeadlessSimulationFacade(engine2);

      facade1.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade1.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      facade1.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });
      facade1.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 });
      facade1.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade1.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });
      facade1.dispatchIntent({ type: 'resume' });

      facade2.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade2.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      facade2.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });
      facade2.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 });
      facade2.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade2.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });
      facade2.dispatchIntent({ type: 'resume' });

      const target = createCallerRenderTarget(500);

      // Run 180 ticks: Engine 1 never queries snapshot or render frame; Engine 2 queries both every tick
      for (let i = 0; i < 180; i++) {
        engine1.advance(1 / 60);

        engine2.advance(1 / 60);
        engine2.snapshot();
        engine2.copyRenderFrame(target);
      }

      const s1 = engine1.getState();
      const s2 = engine2.getState();

      expect(s1.mass.W).toBe(s2.mass.W);
      expect(s1.mass.Gt).toBe(s2.mass.Gt);
      expect(s1.mass.Gu).toBe(s2.mass.Gu);
      expect(s1.mass.Gd).toBe(s2.mass.Gd);
      expect(s1.mass.Sb).toBe(s2.mass.Sb);
      expect(s1.mass.Ss).toBe(s2.mass.Ss);
      expect(s1.mass.Ol).toBe(s2.mass.Ol);
      expect(s1.mass.Od).toBe(s2.mass.Od);
      expect(s1.omegaFlow).toBe(s2.omegaFlow);
    });
  });

  // =========================================================================
  // Part 2: Long-run 600s Verification (SC-N02)
  // =========================================================================
  describe('2. Long-run 600s Verification (SC-N02)', () => {
    it('Mixed fixture M (495ml) over 36,000 ticks preserves strict mass invariants and particle bounds', () => {
      // Mixed fixture M per prompt: W300ml, G100g, S100g, O70ml (reservation 495ml <= 500ml), seed 1729
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 20 });
      const facade = new HeadlessSimulationFacade(engine);

      // Add all 4 ingredients in deciTicks
      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 3000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 700 }); // 70ml * 0.9 = 63.0g

      const target = createCallerRenderTarget(500);

      // Verify initial checkpoint (tick 0)
      const stamp0 = engine.copyRenderFrame(target);
      expect(stamp0.count).toBeGreaterThan(0);

      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });
      facade.dispatchIntent({ type: 'resume' });

      let maxWaterErr = 0;
      let maxSugarErr = 0;
      let maxSandErr = 0;
      let maxOilErr = 0;
      let maxWaterTick = 0;
      let maxSugarTick = 0;
      let maxSandTick = 0;
      let maxOilTick = 0;

      const totalWater = 300.0;
      const totalSugar = 100.0;
      const totalSand = 100.0;
      const totalOil = 63.0; // 70ml * 0.9g/ml

      const checkpoints = [600, 18000, 36000];
      let checkpointIdx = 0;

      // 36,000 ticks = 600 simulated seconds (h = 1/60)
      // Phase 1 (ticks 1..18,000 / 300s): Active auto stirring
      // Phase 2 (ticks 18,001..36,000 / 300s): Stop drive, inertial flow decay & separation
      for (let tick = 1; tick <= 36000; tick++) {
        if (tick === 18001) {
          facade.dispatchIntent({ type: 'releaseDrive' });
        }

        engine.advance(1 / 60);

        // Core asserts mass invariants internally every step in stepFixedTick().
        // In addition, sample and track exact maximum error magnitudes across all 36,000 ticks:
        const s = engine.getState();
        const wErr = Math.abs(s.mass.W - totalWater);
        const gErr = Math.abs(s.mass.Gu + s.mass.Gd - totalSugar);
        const sErr = Math.abs(s.mass.Sb + s.mass.Ss - totalSand);
        const oErr = Math.abs(s.mass.Ol + s.mass.Od - totalOil);

        if (wErr > maxWaterErr) { maxWaterErr = wErr; maxWaterTick = tick; }
        if (gErr > maxSugarErr) { maxSugarErr = gErr; maxSugarTick = tick; }
        if (sErr > maxSandErr) { maxSandErr = sErr; maxSandTick = tick; }
        if (oErr > maxOilErr) { maxOilErr = oErr; maxOilTick = tick; }

        expect(wErr).toBeLessThan(1e-11);
        expect(gErr).toBeLessThan(1e-11);
        expect(sErr).toBeLessThan(1e-11);
        expect(oErr).toBeLessThan(1e-11);

        if (checkpoints[checkpointIdx] === tick) {
          const stamp = engine.copyRenderFrame(target);
          expect(stamp.count).toBeGreaterThan(0);

          // Verify all active positions are strictly finite and within beaker bounds
          const rhoO = 0.9;
          const phases: PhaseMasses = {
            Wml: s.mass.W,
            Oml: s.mass.Ot / rhoO,
            Gt: s.mass.Gt,
            Gu: s.mass.Gu,
            Gd: s.mass.Gd,
            fGu: s.fGu,
            St: s.mass.St,
            Sb: s.mass.Sb,
            Ss: s.mass.Ss,
            Ot: s.mass.Ot,
            Ol: s.mass.Ol,
            Od: s.mass.Od,
          };
          const regions = computeBeakerRegions(phases);

          for (let p = 0; p < stamp.count; p++) {
            const px = target.positions[p * 3];
            const py = target.positions[p * 3 + 1];
            const pz = target.positions[p * 3 + 2];

            expect(Number.isFinite(px)).toBe(true);
            expect(Number.isFinite(py)).toBe(true);
            expect(Number.isFinite(pz)).toBe(true);

            // Container bounds check
            expect(py).toBeGreaterThanOrEqual(regions.bed.bottom - 1e-4);
            expect(py).toBeLessThanOrEqual(regions.oil.top + 1e-4);

            const r = Math.sqrt(px * px + pz * pz);
            expect(r).toBeLessThanOrEqual(0.87 + 1e-4);
          }

          checkpointIdx++;
        }
      }

      expect(engine.getTickIndex()).toBe(36000);
      expect(engine.getElapsedSeconds()).toBeCloseTo(600.0, 6);

      // Verify max errors across 36,000 steps were all below strict epsilon (< 1e-11 g)
      expect(maxWaterErr).toBeLessThan(1e-11);
      expect(maxSugarErr).toBeLessThan(1e-11);
      expect(maxSandErr).toBeLessThan(1e-11);
      expect(maxOilErr).toBeLessThan(1e-11);

      expect(maxWaterTick).toBeGreaterThanOrEqual(0);
      expect(maxSugarTick).toBeGreaterThanOrEqual(0);
      expect(maxSandTick).toBeGreaterThanOrEqual(0);
      expect(maxOilTick).toBeGreaterThanOrEqual(0);

      // Verify long-run separation occurred after drive released (at 600s: flow decayed, oil separated)
      const finalState = engine.getState();
      expect(finalState.omegaFlow).toBeLessThan(0.001);
      expect(finalState.mass.Od).toBeLessThan(1.0); // Droplets settled back into layered oil
      expect(finalState.mass.Ol).toBeGreaterThan(62.0);
    }, 30000);

    it('Representative N=700 visual budget maintains finite bounds and stability', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 700 });
      const facade = new HeadlessSimulationFacade(engine);
      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 200 });
      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });
      facade.dispatchIntent({ type: 'resume' });

      const target = createCallerRenderTarget(3500); // 5 pools * 700

      // Run 600 ticks at N=700
      for (let i = 0; i < 600; i++) {
        engine.advance(1 / 60);
      }

      const stamp = engine.copyRenderFrame(target);
      expect(stamp.count).toBeGreaterThan(1000);

      for (let p = 0; p < stamp.count; p++) {
        expect(Number.isFinite(target.positions[p * 3])).toBe(true);
        expect(Number.isFinite(target.positions[p * 3 + 1])).toBe(true);
        expect(Number.isFinite(target.positions[p * 3 + 2])).toBe(true);
      }
    });
  });

  // =========================================================================
  // Part 3: Frame Rate Replay 30 FPS vs 60 FPS vs 120 FPS (SC-N01 / SC-T01)
  // =========================================================================
  describe('3. Frame Rate Replay 30/60/120 FPS (SC-N01 / SC-T01)', () => {
    it('replays identical command trace across 30, 60, and 120 FPS yielding scalar state difference <= 1e-6 g/rad', () => {
      // Trace with commands scheduled at logical tick boundaries
      const trace: TraceItem[] = [
        {
          appliedAtTick: 0,
          command: {
            clientId: 'client-1',
            seq: 1,
            expectedGeneration: 0,
            payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
          },
        },
        {
          appliedAtTick: 0,
          command: {
            clientId: 'client-1',
            seq: 2,
            expectedGeneration: 0,
            payload: { type: 'add', ingredient: 'sugar', deciTicks: 200 },
          },
        },
        {
          appliedAtTick: 0,
          command: {
            clientId: 'client-1',
            seq: 3,
            expectedGeneration: 0,
            payload: { type: 'setMode', mode: 'auto' },
          },
        },
        {
          appliedAtTick: 0,
          command: {
            clientId: 'client-1',
            seq: 4,
            expectedGeneration: 0,
            payload: { type: 'setAutoLevel', level: 'medium' },
          },
        },
        {
          appliedAtTick: 0,
          command: {
            clientId: 'client-1',
            seq: 5,
            expectedGeneration: 0,
            payload: { type: 'resume' },
          },
        },
        {
          appliedAtTick: 120, // at 2.0s sim-time
          command: {
            clientId: 'client-1',
            seq: 6,
            expectedGeneration: 0,
            payload: { type: 'pause' },
          },
        },
        {
          appliedAtTick: 120, // paused add
          command: {
            clientId: 'client-1',
            seq: 7,
            expectedGeneration: 0,
            payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
          },
        },
        {
          appliedAtTick: 120, // paused add
          command: {
            clientId: 'client-1',
            seq: 8,
            expectedGeneration: 0,
            payload: { type: 'add', ingredient: 'oil', deciTicks: 200 },
          },
        },
        {
          appliedAtTick: 120,
          command: {
            clientId: 'client-1',
            seq: 9,
            expectedGeneration: 0,
            payload: { type: 'resume' },
          },
        },
        {
          appliedAtTick: 240, // at 4.0s sim-time
          command: {
            clientId: 'client-1',
            seq: 10,
            expectedGeneration: 0,
            payload: { type: 'releaseDrive' },
          },
        },
        {
          appliedAtTick: 360, // at 6.0s sim-time
          command: {
            clientId: 'client-1',
            seq: 11,
            expectedGeneration: 0,
            payload: { type: 'setAutoLevel', level: 'fast' },
          },
        },
        {
          appliedAtTick: 360,
          command: {
            clientId: 'client-1',
            seq: 12,
            expectedGeneration: 0,
            payload: { type: 'setMode', mode: 'auto' },
          },
        },
      ];

      const runAtFps = (fps: number) => {
        const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 50 });
        const report = TickBoundaryReplayHarness.replay(
          engine,
          JSON.parse(JSON.stringify(trace)),
          {
            fps,
            totalDurationSeconds: 10.0, // 600 ticks
          }
        );
        return { engine, report };
      };

      const res30 = runAtFps(30);
      const res60 = runAtFps(60);
      const res120 = runAtFps(120);

      // Replay reports check
      expect(res30.report.ok).toBe(true);
      expect(res60.report.ok).toBe(true);
      expect(res120.report.ok).toBe(true);

      expect(res30.report.totalSteps).toBe(600);
      expect(res60.report.totalSteps).toBe(600);
      expect(res120.report.totalSteps).toBe(600);

      expect(res30.report.commandsDispatched).toBe(12);
      expect(res60.report.commandsDispatched).toBe(12);
      expect(res120.report.commandsDispatched).toBe(12);

      // Verify all acks are identical
      for (let i = 0; i < 12; i++) {
        expect(res30.report.acks[i].accepted).toBe(true);
        expect(res60.report.acks[i].accepted).toBe(true);
        expect(res120.report.acks[i].accepted).toBe(true);
        expect(res30.report.acks[i].seq).toBe(res60.report.acks[i].seq);
        expect(res60.report.acks[i].seq).toBe(res120.report.acks[i].seq);
      }

      // Check scalar state convergence between all 3 runs (within 1e-6 g/rad)
      const s30 = res30.engine.getState();
      const s60 = res60.engine.getState();
      const s120 = res120.engine.getState();

      expect(Math.abs(s30.mass.W - s60.mass.W)).toBeLessThan(1e-6);
      expect(Math.abs(s60.mass.W - s120.mass.W)).toBeLessThan(1e-6);

      expect(Math.abs(s30.mass.Gu - s60.mass.Gu)).toBeLessThan(1e-6);
      expect(Math.abs(s60.mass.Gu - s120.mass.Gu)).toBeLessThan(1e-6);

      expect(Math.abs(s30.mass.Gd - s60.mass.Gd)).toBeLessThan(1e-6);
      expect(Math.abs(s60.mass.Gd - s120.mass.Gd)).toBeLessThan(1e-6);

      expect(Math.abs(s30.mass.Sb - s60.mass.Sb)).toBeLessThan(1e-6);
      expect(Math.abs(s60.mass.Sb - s120.mass.Sb)).toBeLessThan(1e-6);

      expect(Math.abs(s30.mass.Ss - s60.mass.Ss)).toBeLessThan(1e-6);
      expect(Math.abs(s60.mass.Ss - s120.mass.Ss)).toBeLessThan(1e-6);

      expect(Math.abs(s30.mass.Ol - s60.mass.Ol)).toBeLessThan(1e-6);
      expect(Math.abs(s60.mass.Ol - s120.mass.Ol)).toBeLessThan(1e-6);

      expect(Math.abs(s30.mass.Od - s60.mass.Od)).toBeLessThan(1e-6);
      expect(Math.abs(s60.mass.Od - s120.mass.Od)).toBeLessThan(1e-6);

      expect(Math.abs(s30.omegaFlow - s60.omegaFlow)).toBeLessThan(1e-6);
      expect(Math.abs(s60.omegaFlow - s120.omegaFlow)).toBeLessThan(1e-6);
    });
  });

  // =========================================================================
  // Part 4: Timestep Independence h=1/60 vs h=1/120 (SC-N05 / SC-T03)
  // =========================================================================
  describe('4. Timestep Independence h=1/60 vs h=1/120 (SC-N05 / SC-T03)', () => {
    it('10 sim seconds comparison yields mass conservation < 1e-12, amounts <= 1% input and pose RMS <= 0.05', () => {
      // Engine 1: h = 1/60, maxSteps = 6
      const engine60 = new HeadlessSimulationEngine({
        seed: 1729,
        clockConfig: { h: 1 / 60, maxSteps: 6, maxRealDelta: 0.1 },
      });
      const facade60 = new HeadlessSimulationFacade(engine60);

      // Engine 2: h = 1/120, maxSteps = 12
      const engine120 = new HeadlessSimulationEngine({
        seed: 1729,
        clockConfig: { h: 1 / 120, maxSteps: 12, maxRealDelta: 0.1 },
      });
      const facade120 = new HeadlessSimulationFacade(engine120);

      const setupEngine = (facade: HeadlessSimulationFacade) => {
        facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
        facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
        facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 200 });
        facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 }); // 18.0g
        facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
        facade.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });
        facade.dispatchIntent({ type: 'resume' });
      };

      setupEngine(facade60);
      setupEngine(facade120);

      let sumSquaredDist = 0;
      let samplesCount = 0;

      // Run both engines for 10 simulated seconds in host frames of 0.05s
      // Total 200 frames * 0.05s = 10.0s sim-time
      for (let frame = 0; frame < 200; frame++) {
        // At t = 5.0s (frame 100), release drive to test deceleration response
        if (frame === 100) {
          facade60.dispatchIntent({ type: 'releaseDrive' });
          facade120.dispatchIntent({ type: 'releaseDrive' });
        }

        engine60.advance(0.05);
        engine120.advance(0.05);

        const pose60 = engine60.getRodPose();
        const pose120 = engine120.getRodPose();

        const dx = pose60.x - pose120.x;
        const dz = pose60.z - pose120.z;
        sumSquaredDist += dx * dx + dz * dz;
        samplesCount++;
      }

      expect(engine60.getElapsedSeconds()).toBeCloseTo(10.0, 5);
      expect(engine120.getElapsedSeconds()).toBeCloseTo(10.0, 5);
      expect(engine60.getTickIndex()).toBe(600);
      expect(engine120.getTickIndex()).toBe(1200);

      const s60 = engine60.getState();
      const s120 = engine120.getState();

      // 1. Strict mass conservation for each run (< 1e-12 g)
      expect(Math.abs(s60.mass.Gu + s60.mass.Gd - 20.0)).toBeLessThan(1e-12);
      expect(Math.abs(s120.mass.Gu + s120.mass.Gd - 20.0)).toBeLessThan(1e-12);

      expect(Math.abs(s60.mass.Sb + s60.mass.Ss - 20.0)).toBeLessThan(1e-12);
      expect(Math.abs(s120.mass.Sb + s120.mass.Ss - 20.0)).toBeLessThan(1e-12);

      expect(Math.abs(s60.mass.Ol + s60.mass.Od - 18.0)).toBeLessThan(1e-12);
      expect(Math.abs(s120.mass.Ol + s120.mass.Od - 18.0)).toBeLessThan(1e-12);

      // 2. Model amounts diff <= 1% of total input
      const sugarInput = 20.0;
      const sandInput = 20.0;
      const oilInput = 18.0;

      const gdDiff = Math.abs(s60.mass.Gd - s120.mass.Gd);
      const ssDiff = Math.abs(s60.mass.Ss - s120.mass.Ss);
      const odDiff = Math.abs(s60.mass.Od - s120.mass.Od);

      expect(gdDiff).toBeLessThanOrEqual(0.01 * sugarInput); // <= 0.2g
      expect(ssDiff).toBeLessThanOrEqual(0.01 * sandInput);  // <= 0.2g
      expect(odDiff).toBeLessThanOrEqual(0.01 * oilInput);   // <= 0.18g

      // 3. Pose RMS <= 0.05 scene units
      const poseRms = Math.sqrt(sumSquaredDist / samplesCount);
      expect(poseRms).toBeLessThanOrEqual(0.05);
    });
  });

  // =========================================================================
  // Part 5: Visual Budget N=10/100/700 Independence (SC-B01 / SC-B02 / SC-P01)
  // =========================================================================
  describe('5. Visual Budget N Independence & Buffer Mutation Isolation', () => {
    it('scalar trajectory is 100% bit-identical for N=10, N=100, and N=700 (SC-P01, SC-B02)', () => {
      const e10 = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 10 });
      const e100 = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 100 });
      const e700 = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 700 });

      const setup = (engine: HeadlessSimulationEngine) => {
        const facade = new HeadlessSimulationFacade(engine);
        facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
        facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
        facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 150 });
        facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 });
        facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
        facade.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });
        facade.dispatchIntent({ type: 'resume' });
      };

      setup(e10);
      setup(e100);
      setup(e700);

      for (let i = 0; i < 300; i++) {
        e10.advance(1 / 60);
        e100.advance(1 / 60);
        e700.advance(1 / 60);
      }

      const s10 = e10.getState();
      const s100 = e100.getState();
      const s700 = e700.getState();

      expect(s10.mass.W).toBe(s100.mass.W);
      expect(s100.mass.W).toBe(s700.mass.W);

      expect(s10.mass.Gu).toBe(s100.mass.Gu);
      expect(s100.mass.Gu).toBe(s700.mass.Gu);

      expect(s10.mass.Gd).toBe(s100.mass.Gd);
      expect(s100.mass.Gd).toBe(s700.mass.Gd);

      expect(s10.mass.Sb).toBe(s100.mass.Sb);
      expect(s100.mass.Sb).toBe(s700.mass.Sb);

      expect(s10.mass.Ss).toBe(s100.mass.Ss);
      expect(s100.mass.Ss).toBe(s700.mass.Ss);

      expect(s10.mass.Ol).toBe(s100.mass.Ol);
      expect(s100.mass.Ol).toBe(s700.mass.Ol);

      expect(s10.mass.Od).toBe(s100.mass.Od);
      expect(s100.mass.Od).toBe(s700.mass.Od);

      expect(s10.omegaFlow).toBe(s100.omegaFlow);
      expect(s100.omegaFlow).toBe(s700.omegaFlow);
    });

    it('caller corrupting target buffer does not corrupt subsequent copyRenderFrame output (SC-B01)', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 50 });
      const facade = new HeadlessSimulationFacade(engine);
      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });
      facade.dispatchIntent({ type: 'resume' });

      for (let i = 0; i < 60; i++) {
        engine.advance(1 / 60);
      }

      const target = createCallerRenderTarget(500);
      const stamp1 = engine.copyRenderFrame(target);
      expect(stamp1.count).toBeGreaterThan(0);

      // Caller mutates all target arrays
      target.positions.fill(999.0);
      target.weights.fill(-1.0);
      target.materials.fill(255);
      if (target.radii) target.radii.fill(99.0);

      // Advance one more tick and copy again
      engine.advance(1 / 60);
      const stamp2 = engine.copyRenderFrame(target);

      expect(stamp2.count).toBeGreaterThan(0);
      for (let p = 0; p < stamp2.count; p++) {
        // Values must be valid, not corrupted 999.0
        expect(target.positions[p * 3]).toBeLessThan(1.0);
        expect(target.weights[p]).toBeGreaterThanOrEqual(0);
        expect(target.materials[p]).toBeLessThanOrEqual(2);
      }
    });
  });

  // =========================================================================
  // Part 6: Timing Edge Cases (SC-N04 / SC-T02 / SC-T03)
  // =========================================================================
  describe('6. Timing Edge Cases (SC-N04 / SC-T02 / SC-T03)', () => {
    it('dt = 0 is a no-op that does not change clock or execute steps', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const res = engine.advance(0);
      expect(res.stepsExecuted).toBe(0);
      expect(res.droppedWallTime).toBe(0);
      expect(engine.getTickIndex()).toBe(0);
      expect(engine.getElapsedSeconds()).toBe(0);
    });

    it('negative or non-finite delta returns error result without state mutation', () => {
      const clock = new SimulationClock();
      expect(clock.advance(-0.01, true).ok).toBe(false);
      expect(clock.advance(NaN, true).ok).toBe(false);
      expect(clock.advance(Infinity, true).ok).toBe(false);
    });

    it('advance 5s from remainder 0 at h60 executes 6 steps and drops 4.9s (SC-N04)', () => {
      let executedSteps = 0;
      const clock = new SimulationClock(
        { h: 1 / 60, maxSteps: 6, maxRealDelta: 0.1 },
        () => { executedSteps++; }
      );
      const res = clock.advance(5.0, true);

      expect(executedSteps).toBe(6);
      expect(res.stepsExecuted).toBe(6);
      expect(res.droppedWallTime).toBeCloseTo(4.9, 10);
      expect(clock.getAccumulator()).toBeLessThan(1e-12);
      expect(clock.getDroppedActiveWallTime()).toBeCloseTo(4.9, 10);
    });

    it('advance 5s from remainder 0 at h120 executes 12 steps and drops 4.9s (SC-T03)', () => {
      let executedSteps = 0;
      const clock = new SimulationClock(
        { h: 1 / 120, maxSteps: 12, maxRealDelta: 0.1 },
        () => { executedSteps++; }
      );
      const res = clock.advance(5.0, true);

      expect(executedSteps).toBe(12);
      expect(res.stepsExecuted).toBe(12);
      expect(res.droppedWallTime).toBeCloseTo(4.9, 10);
      expect(clock.getAccumulator()).toBeLessThan(1e-12);
      expect(clock.getDroppedActiveWallTime()).toBeCloseTo(4.9, 10);
    });

    it('pause / hidden clears active remainder into droppedActiveWallTime (SC-T02)', () => {
      const clock = new SimulationClock({ h: 1 / 60 });
      // advance 1/120s (half a tick remainder) with running = true
      clock.advance(1 / 120, true);
      expect(clock.getAccumulator()).toBeCloseTo(1 / 120, 10);

      // suspend (hidden) drops the active fractional remainder
      clock.suspend();
      expect(clock.getAccumulator()).toBe(0);
      expect(clock.getDroppedActiveWallTime()).toBeCloseTo(1 / 120, 10);

      // 5 wall seconds pass while hidden
      // visible() resumes without counting the 5 wall seconds into dropped active time
      clock.visible();
      expect(clock.getDroppedActiveWallTime()).toBeCloseTo(1 / 120, 10); // unchanged!
    });
  });

  // =========================================================================
  // Part 7: Seeded Randomized Commands Stress Test (SC-N03)
  // =========================================================================
  describe('7. Seeded Randomized Commands Stress Test (SC-N03)', () => {
    it('executes 1000 deterministic seeded commands, asserting strict invariant preservation on every step', () => {
      const rng = mulberry32(1729);
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 50 });
      const facade = new HeadlessSimulationFacade(engine);

      let acceptedCount = 0;
      let rejectedCount = 0;
      let maxMassError = 0;

      const ingredients = ['water', 'sugar', 'sand', 'oil'] as const;
      const autoLevels = ['slow', 'medium', 'fast'] as const;

      for (let cmdIdx = 0; cmdIdx < 1000; cmdIdx++) {
        const dice = rng();

        if (dice < 0.45) {
          // Add command (valid, invalid, edge amounts in deciTicks)
          const ing = ingredients[Math.floor(rng() * ingredients.length)];
          let deciTicks: number;
          const amtDice = rng();
          if (amtDice < 0.08) {
            deciTicks = 0; // Invalid: zero
          } else if (amtDice < 0.16) {
            deciTicks = -50; // Invalid: negative
          } else if (amtDice < 0.24) {
            deciTicks = 6000; // Invalid: exceeds maxAddition (600ml/g)
          } else {
            // Valid random amount between 1 and 200 deciTicks (0.1 to 20.0 units)
            deciTicks = Math.floor(1 + rng() * 200);
          }

          const stateBefore = engine.getState();
          const ack = facade.dispatchIntent({ type: 'add', ingredient: ing, deciTicks });

          if (ack.accepted) {
            acceptedCount++;
          } else {
            rejectedCount++;
            // Immutability on rejection: state mass & input must not have changed
            const stateAfter = engine.getState();
            expect(stateAfter.mass.W).toBe(stateBefore.mass.W);
            expect(stateAfter.mass.Gt).toBe(stateBefore.mass.Gt);
            expect(stateAfter.mass.St).toBe(stateBefore.mass.St);
            expect(stateAfter.mass.Ot).toBe(stateBefore.mass.Ot);
            expect(stateAfter.input.water).toBe(stateBefore.input.water);
          }
        } else if (dice < 0.65) {
          // Stirring / Flow controls
          const ctrlDice = rng();
          if (ctrlDice < 0.3) {
            const level = autoLevels[Math.floor(rng() * autoLevels.length)];
            const ack = facade.dispatchIntent({ type: 'setAutoLevel', level });
            if (ack.accepted) acceptedCount++; else rejectedCount++;
          } else if (ctrlDice < 0.6) {
            const ack = facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
            if (ack.accepted) acceptedCount++; else rejectedCount++;
          } else {
            const ack = facade.dispatchIntent({ type: 'releaseDrive' });
            if (ack.accepted) acceptedCount++; else rejectedCount++;
          }
        } else if (dice < 0.85) {
          // Lifecycle controls (start, pause, resume, reset)
          const lifeDice = rng();
          if (lifeDice < 0.35) {
            const ack = facade.dispatchIntent({ type: 'resume' });
            if (ack.accepted) acceptedCount++; else rejectedCount++;
          } else if (lifeDice < 0.7) {
            const ack = facade.dispatchIntent({ type: 'pause' });
            if (ack.accepted) acceptedCount++; else rejectedCount++;
          } else {
            // Reset with deterministic seed
            const newSeed = Math.floor(rng() * 10000);
            const ack = facade.dispatchIntent({ type: 'reset', seed: newSeed });
            if (ack.accepted) acceptedCount++; else rejectedCount++;
          }
        } else {
          // Advance simulation step
          if (engine.isPaused()) {
            facade.dispatchIntent({ type: 'resume' });
          }
          engine.advance(1 / 60);
          acceptedCount++;
        }

        // Invariant check on every single command
        const s = engine.getState();
        const gErr = Math.abs(s.mass.Gu + s.mass.Gd - s.mass.Gt);
        const sErr = Math.abs(s.mass.Sb + s.mass.Ss - s.mass.St);
        const oErr = Math.abs(s.mass.Ol + s.mass.Od - s.mass.Ot);
        const err = Math.max(gErr, sErr, oErr);
        if (err > maxMassError) maxMassError = err;

        expect(gErr).toBeLessThan(1e-10);
        expect(sErr).toBeLessThan(1e-10);
        expect(oErr).toBeLessThan(1e-10);

        expect(Number.isFinite(s.mass.W)).toBe(true);
        expect(Number.isFinite(s.omegaFlow)).toBe(true);
        expect(Number.isFinite(s.rod.x)).toBe(true);
        expect(Number.isFinite(s.rod.z)).toBe(true);
      }

      expect(acceptedCount).toBeGreaterThan(500);
      expect(rejectedCount).toBeGreaterThan(50);
      expect(maxMassError).toBeLessThan(1e-10);
    });
  });
});
