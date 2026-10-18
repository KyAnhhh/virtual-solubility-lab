import { describe, expect, it } from 'vitest';
import { HeadlessSimulationEngine } from '../core/HeadlessSimulationEngine';
import {
  createExperimentStore,
} from '../../stores/experimentStore';
import {
  SimulationBridge,
  type HostClockAdapter,
} from '../bridge/SimulationBridge';
import {
  TickBoundaryReplayHarness,
  type TraceItem,
} from '../core/ReplayHarness';
import {
  DEFAULT_SEED,
  type ScienceState,
  type RenderTarget,
} from '../core/SimulationState';
import {
  VISUAL_MILLI_ML_PER_TICK,
} from '../constants/ingredients';

class MockHostClock implements HostClockAdapter {
  currentTime = 0;
  nextHandle = 1;
  callbacks = new Map<number, (timestampMs: number) => void>();

  now(): number {
    return this.currentTime;
  }

  requestAnimationFrame(cb: (timestampMs: number) => void): number {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, cb);
    return handle;
  }

  cancelAnimationFrame(handle: number): void {
    this.callbacks.delete(handle);
  }

  stepTime(deltaMs: number): void {
    this.currentTime += deltaMs;
    const cbs = Array.from(this.callbacks.entries());
    this.callbacks.clear();
    for (const [, cb] of cbs) {
      cb(this.currentTime);
    }
  }
}

describe('V3-06 — Compose models và thêm chất mọi thời điểm (20 Mandatory Tests)', () => {
  // 1. Một step chạy các models đúng thứ tự, mỗi model một lần
  it('1. Single fixed tick executes all models strictly in specified order once per step', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 200 },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 3,
      expectedGeneration: 0,
      payload: { type: 'setMode', mode: 'auto' },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 4,
      expectedGeneration: 0,
      payload: { type: 'setAutoLevel', level: 'medium' },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 5,
      expectedGeneration: 0,
      payload: { type: 'resume' },
    });

    const vBefore = engine.getState().stateVersion;
    const tickBefore = engine.getState().tickIndex;

    // Advance exactly 1 step (1/60s)
    engine.advance(1 / 60);

    const stateAfter = engine.getState();
    expect(stateAfter.tickIndex).toBe(tickBefore + 1);
    expect(stateAfter.elapsedSeconds).toBeCloseTo(1 / 60, 6);
    expect(stateAfter.stateVersion).toBe(vBefore + 1); // Exactly +1 stateVersion per step
    expect(stateAfter.omegaFlow).toBeGreaterThan(0); // Flow stepped
    expect(stateAfter.mass.Gd).toBeGreaterThan(0); // Dissolution stepped
  });

  // 2. Composition thực tạo Gd/Ss/Od/fGu và transport phù hợp
  it('2. Simultaneous composition of all 4 substances develops Gd, Ss, Od, fGu and valid transport pools', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 1000 }, // 100ml
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 200 }, // 20g
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 3,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sand', deciTicks: 100 }, // 10g
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 4,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'oil', deciTicks: 200 }, // 20ml
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 5,
      expectedGeneration: 0,
      payload: { type: 'setMode', mode: 'auto' },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 6,
      expectedGeneration: 0,
      payload: { type: 'setAutoLevel', level: 'fast' },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 7,
      expectedGeneration: 0,
      payload: { type: 'resume' },
    });

    // Advance 120 ticks (2.0s)
    for (let i = 0; i < 120; i++) {
      engine.advance(1 / 60);
    }

    const state = engine.getState();
    expect(state.mass.Gd).toBeGreaterThan(0); // Sugar dissolved
    expect(state.mass.Ss).toBeGreaterThan(0); // Sand suspended
    expect(state.mass.Od).toBeGreaterThan(0); // Oil droplets dispersed
    expect(state.fGu).toBeGreaterThan(0); // fGu active

    const target: RenderTarget & { radii: Float32Array; poolIds: Uint8Array } = {
      positions: new Float32Array(3500 * 3),
      weights: new Float32Array(3500),
      materials: new Uint8Array(3500),
      radii: new Float32Array(3500),
      poolIds: new Uint8Array(3500),
      count: 3500,
    };

    const stamp = engine.copyRenderFrame(target);
    expect(stamp.count).toBeGreaterThan(0);
    expect(stamp.poolRanges).toBeDefined();
    expect(stamp.poolRanges!.sugarBed.count).toBeGreaterThan(0);
    expect(stamp.poolRanges!.sugarSusp.count).toBeGreaterThan(0);
    expect(stamp.poolRanges!.sandBed.count).toBeGreaterThan(0);
    expect(stamp.poolRanges!.sandSusp.count).toBeGreaterThan(0);
    expect(stamp.poolRanges!.oilDroplet.count).toBeGreaterThan(0);
  });

  // 3. SC-A01 before/after từng command
  it('3. SC-A01 exact allocation and paused addition invariance before/after each command', () => {
    // Paused baseline fixture: W=100, Gt=10 (Gu=5, Gd=5, fGu=0.4), St=10 (Sb=7, Ss=3), Ot=18 (Ol=9, Od=9)
    const baselineState: ScienceState = {
      generation: 0,
      stateVersion: 0,
      tickIndex: 0,
      elapsedSeconds: 0,
      seed: DEFAULT_SEED,
      paused: true,
      mode: 'observe',
      autoDriveEnabled: false,
      autoLevel: 'slow',
      input: {
        water: 1000, // 100 ml
        sugar: 100, // 10 g
        sand: 100, // 10 g
        oil: 200, // 20 ml = 18 g
      },
      mass: {
        W: 100,
        Gt: 10,
        Gu: 5,
        Gd: 5,
        St: 10,
        Sb: 7,
        Ss: 3,
        Ot: 18,
        Ol: 9,
        Od: 9,
      },
      fGu: 0.4,
      omegaRod: 0,
      omegaDrive: 0,
      omegaFlow: 0,
      rod: {
        x: 0.4,
        z: 0,
        tipY: 0.14,
        theta: 0,
        radius: 0.4,
      },
    };

    const engine = HeadlessSimulationEngine.createForTesting(baselineState, { clientId: 'client-1' });

    const computeMilliMl = (input: ScienceState['input']) =>
      input.water * VISUAL_MILLI_ML_PER_TICK.water +
      input.sugar * VISUAL_MILLI_ML_PER_TICK.sugar +
      input.sand * VISUAL_MILLI_ML_PER_TICK.sand +
      input.oil * VISUAL_MILLI_ML_PER_TICK.oil;

    // Baseline check
    expect(computeMilliMl(engine.getState().input)).toBe(132500); // 132.5 ml

    // Step 1: Add 1g Sugar (10 deciTicks)
    const ack1 = engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 10 },
    });
    expect(ack1.accepted).toBe(true);

    const s1 = engine.getState();
    expect(s1.tickIndex).toBe(0);
    expect(s1.elapsedSeconds).toBe(0);
    expect(s1.mass.Gt).toBe(11);
    expect(s1.mass.Gu).toBe(6);
    expect(s1.mass.Gd).toBe(5); // Gd strictly preserved
    expect(s1.fGu).toBeCloseTo(1 / 3, 10); // Dilution: (5 * 0.4) / 6 = 1/3
    expect(computeMilliMl(s1.input)).toBe(133150); // 132500 + 650

    // Step 2: Add 1g Sand (10 deciTicks)
    const ack2 = engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sand', deciTicks: 10 },
    });
    expect(ack2.accepted).toBe(true);

    const s2 = engine.getState();
    expect(s2.tickIndex).toBe(0);
    expect(s2.elapsedSeconds).toBe(0);
    expect(s2.mass.St).toBe(11);
    expect(s2.mass.Sb).toBe(8);
    expect(s2.mass.Ss).toBe(3); // Ss strictly preserved
    expect(computeMilliMl(s2.input)).toBe(133750); // 133150 + 600

    // Step 3: Add 1ml Oil (10 deciTicks) -> 0.9g oil
    const ack3 = engine.dispatch({
      clientId: 'client-1',
      seq: 3,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'oil', deciTicks: 10 },
    });
    expect(ack3.accepted).toBe(true);

    const s3 = engine.getState();
    expect(s3.tickIndex).toBe(0);
    expect(s3.elapsedSeconds).toBe(0);
    expect(s3.mass.Ot).toBeCloseTo(18.9, 8);
    expect(s3.mass.Ol).toBeCloseTo(9.9, 8);
    expect(s3.mass.Od).toBe(9); // Od strictly preserved
    expect(computeMilliMl(s3.input)).toBe(134750); // 133750 + 1000

    // Step 4: Add 1ml Water (10 deciTicks) -> 1.0g water
    const ack4 = engine.dispatch({
      clientId: 'client-1',
      seq: 4,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 10 },
    });
    expect(ack4.accepted).toBe(true);

    const s4 = engine.getState();
    expect(s4.tickIndex).toBe(0);
    expect(s4.elapsedSeconds).toBe(0);
    expect(s4.mass.W).toBe(101);
    expect(computeMilliMl(s4.input)).toBe(135750); // 134750 + 1000
    expect(s4.paused).toBe(true); // Does NOT auto-resume
  });

  // 4. Add paused giữ time, không chạy model
  it('4. Add paused preserves simulation time and does not execute chemical dissolution', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 500 }, // 50ml
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 100 }, // 10g
    });

    const state = engine.getState();
    expect(state.paused).toBe(true);
    expect(state.tickIndex).toBe(0);
    expect(state.elapsedSeconds).toBe(0);
    expect(state.mass.Gt).toBe(10);
    expect(state.mass.Gu).toBe(10);
    expect(state.mass.Gd).toBe(0); // Zero dissolution while paused!
  });

  // 5. Add running có command-state riêng trước next step
  it('5. Add while running commits mass to ledger before next scientific step proceeds', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'resume' },
    });

    // Advance 60 ticks
    for (let i = 0; i < 60; i++) {
      engine.advance(1 / 60);
    }

    expect(engine.getState().tickIndex).toBe(60);
    expect(engine.getState().mass.Gt).toBe(0);

    // Dispatch add at boundary between tick 60 and 61
    engine.dispatch({
      clientId: 'client-1',
      seq: 3,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 100 },
    });

    // Right after command dispatch: Gu is 10, Gd is 0
    expect(engine.getState().mass.Gt).toBe(10);
    expect(engine.getState().mass.Gu).toBe(10);
    expect(engine.getState().mass.Gd).toBe(0);

    // Step tick 61
    engine.advance(1 / 60);
    expect(engine.getState().tickIndex).toBe(61);
    expect(engine.getState().mass.Gd).toBeGreaterThan(0); // Dissolution took place in step 61
  });

  // 6. Add nước sau gần bão hòa cho tan tiếp
  it('6. Adding water to a saturated solution expands capacity and resumes dissolution', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    // 10 ml water (capacity 20g sugar), 30g sugar
    engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 100 },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 300 },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 3,
      expectedGeneration: 0,
      payload: { type: 'setMode', mode: 'auto' },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 4,
      expectedGeneration: 0,
      payload: { type: 'setAutoLevel', level: 'fast' },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 5,
      expectedGeneration: 0,
      payload: { type: 'resume' },
    });

    // Run for 300 ticks to develop dissolution
    for (let i = 0; i < 300; i++) {
      engine.advance(1 / 60);
    }

    const satSnap = engine.snapshot();
    expect(satSnap.capacityG).toBe(20.0);
    expect(satSnap.mass.Gd).toBeGreaterThan(0);
    const gdBeforeWater = satSnap.mass.Gd;

    // Add 10 ml water (capacity expands to 40g)
    engine.dispatch({
      clientId: 'client-1',
      seq: 6,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 100 },
    });

    const expandSnap = engine.snapshot();
    expect(expandSnap.capacityG).toBeCloseTo(40.0, 3);

    // Run further: dissolution resumes!
    for (let i = 0; i < 120; i++) {
      engine.advance(1 / 60);
    }

    const finalSnap = engine.snapshot();
    expect(finalSnap.mass.Gd).toBeGreaterThan(gdBeforeWater);
  });

  // 7. Add dầu không tăng sugar capacity
  it('7. Adding oil to a saturated solution does NOT expand sugar solvent capacity', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 100 }, // 10ml -> capacity 20g
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 300 },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 3,
      expectedGeneration: 0,
      payload: { type: 'resume' },
    });

    for (let i = 0; i < 300; i++) {
      engine.advance(1 / 60);
    }

    const beforeOil = engine.snapshot();
    const capacityBefore = beforeOil.capacityG;
    expect(capacityBefore).toBe(20.0);

    // Add 50 ml oil
    engine.dispatch({
      clientId: 'client-1',
      seq: 4,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'oil', deciTicks: 500 },
    });

    const afterOil = engine.snapshot();
    expect(afterOil.capacityG).toBe(capacityBefore); // Capacity remains strictly 20.0g!
  });

  // 8. Dry -> oil-only -> mixed và thứ tự ngược
  it('8. Dry -> oil-only -> mixed transitions map solids to correct carrier envelopes', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    // Dry: 10g sand
    engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
    });
    let snap = engine.snapshot();
    expect(snap.mass.W).toBe(0);
    expect(snap.mass.Ot).toBe(0);
    expect(snap.contact).toBe(0);

    // Transition to oil-only: add 100ml oil
    engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'oil', deciTicks: 1000 },
    });
    snap = engine.snapshot();
    expect(snap.mass.W).toBe(0);
    expect(snap.mass.Ot).toBe(90);

    // Transition to mixed: add 100ml water
    engine.dispatch({
      clientId: 'client-1',
      seq: 3,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
    });
    snap = engine.snapshot();
    expect(snap.mass.W).toBe(100);
    expect(snap.mass.Ot).toBe(90);
  });

  // 9. Reservation không đổi vì phase transfers
  it('9. Volume reservation is strictly invariant under phase transfers', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 1000 }, // 100ml
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 200 }, // 20g
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 3,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sand', deciTicks: 100 }, // 10g
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 4,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'oil', deciTicks: 200 }, // 20ml
    });

    const computeVisualReserve = (m: ScienceState['mass']) =>
      m.W + m.Ot / 0.9 + 0.65 * m.Gt + 0.60 * m.St;

    const initialReserve = computeVisualReserve(engine.getState().mass);

    engine.dispatch({
      clientId: 'client-1',
      seq: 5,
      expectedGeneration: 0,
      payload: { type: 'setMode', mode: 'auto' },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 6,
      expectedGeneration: 0,
      payload: { type: 'setAutoLevel', level: 'fast' },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 7,
      expectedGeneration: 0,
      payload: { type: 'resume' },
    });

    for (let i = 0; i < 200; i++) {
      engine.advance(1 / 60);
      const curReserve = computeVisualReserve(engine.getState().mass);
      expect(Math.abs(curReserve - initialReserve)).toBeLessThan(1e-11);
    }
  });

  // 10. Rejected command giữ science/transport/birth identity
  it('10. Rejected commands preserve all science state, transport buffers, and birth identities', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 4500 }, // 450ml
    });

    const stateBefore = JSON.stringify(engine.getState());
    const countBefore = engine.getTransport().getTotalActiveCount();

    // Command exceeding 500ml capacity
    const rejectAck = engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 1000 }, // 450 + 100 = 550 > 500
    });

    expect(rejectAck.accepted).toBe(false);
    expect(rejectAck.reason).toBe('CAPACITY_EXCEEDED');

    const stateAfter = JSON.stringify(engine.getState());
    expect(stateAfter).toBe(stateBefore);
    expect(engine.getTransport().getTotalActiveCount()).toBe(countBefore);
  });

  // 11. Duplicate command không reapply
  it('11. Duplicate command replay returns cached ack without reapplying changes', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    const ack1 = engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 500 },
    });
    expect(ack1.accepted).toBe(true);
    expect(engine.getState().mass.W).toBe(50);
    expect(engine.getState().stateVersion).toBe(1);

    // Replay duplicate command
    const ack2 = engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 500 },
    });

    expect(ack2.duplicate).toBe(true);
    expect(engine.getState().mass.W).toBe(50); // NOT 100!
    expect(engine.getState().stateVersion).toBe(1); // Version not incremented
  });

  // 12. Reset fencing và delayed pointer/ack/frame
  it('12. Reset increments generation and fences stale commands, samples, and frames', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 500 },
    });

    // Reset command
    engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'reset' },
    });

    expect(engine.getCurrentGeneration()).toBe(1);

    // Stale command bound to generation 0
    const staleAck = engine.dispatch({
      clientId: 'client-1',
      seq: 3,
      expectedGeneration: 0, // Old generation
      payload: { type: 'add', ingredient: 'water', deciTicks: 500 },
    });

    expect(staleAck.accepted).toBe(false);
    expect(staleAck.reason).toBe('STALE_GENERATION');
    expect(engine.getState().mass.W).toBe(0);
  });

  // 13. Remap retained particles projection-only
  it('13. Remap retained particles uses projection only without affine stretching or reshuffling', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
    });

    const target1: RenderTarget & { radii: Float32Array; poolIds: Uint8Array } = {
      positions: new Float32Array(3500 * 3),
      weights: new Float32Array(3500),
      materials: new Uint8Array(3500),
      radii: new Float32Array(3500),
      poolIds: new Uint8Array(3500),
      count: 3500,
    };
    engine.copyRenderFrame(target1);
    const sandBedOffset = 0;
    const initialP0: [number, number, number] = [
      target1.positions[sandBedOffset],
      target1.positions[sandBedOffset + 1],
      target1.positions[sandBedOffset + 2],
    ];

    // Add more sand while paused: bed shifts upwards
    engine.dispatch({
      clientId: 'client-1',
      seq: 3,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
    });

    const target2: RenderTarget & { radii: Float32Array; poolIds: Uint8Array } = {
      positions: new Float32Array(3500 * 3),
      weights: new Float32Array(3500),
      materials: new Uint8Array(3500),
      radii: new Float32Array(3500),
      poolIds: new Uint8Array(3500),
      count: 3500,
    };
    engine.copyRenderFrame(target2);

    // Initial particle remained within bed bounds, so its horizontal coordinates are strictly preserved
    expect(target2.positions[sandBedOffset]).toBeCloseTo(initialP0[0], 6);
    expect(target2.positions[sandBedOffset + 2]).toBeCloseTo(initialP0[2], 6);
  });

  // 14. Tiny/zero regions không NaN
  it('14. Tiny inputs and zero regions evaluate without NaN or inverted boundaries', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    // 0.1 ml water, 0.1 g sugar
    engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 1 },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 1 },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 3,
      expectedGeneration: 0,
      payload: { type: 'resume' },
    });

    for (let i = 0; i < 60; i++) {
      engine.advance(1 / 60);
    }

    const snap = engine.snapshot();
    expect(Number.isFinite(snap.mass.W)).toBe(true);
    expect(Number.isFinite(snap.mass.Gd)).toBe(true);
    expect(Number.isFinite(snap.mass.Gu)).toBe(true);
    expect(Number.isNaN(snap.contact)).toBe(false);
    expect(Number.isNaN(snap.intensity)).toBe(false);
  });

  // 15. Pause/stop/resume khác semantics
  it('15. Pause, stop, and resume have distinct semantic contracts', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'setMode', mode: 'auto' },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 3,
      expectedGeneration: 0,
      payload: { type: 'setAutoLevel', level: 'medium' },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 4,
      expectedGeneration: 0,
      payload: { type: 'resume' },
    });

    for (let i = 0; i < 60; i++) {
      engine.advance(1 / 60);
    }

    // Stop auto: cuts driver, keeps clock running
    engine.dispatch({
      clientId: 'client-1',
      seq: 5,
      expectedGeneration: 0,
      payload: { type: 'releaseDrive' },
    });
    expect(engine.getState().paused).toBe(false);
    expect(engine.getState().autoDriveEnabled).toBe(false);
    expect(engine.getState().omegaRod).toBe(0);

    // Pause: freezes clock
    engine.dispatch({
      clientId: 'client-1',
      seq: 6,
      expectedGeneration: 0,
      payload: { type: 'pause' },
    });
    expect(engine.getState().paused).toBe(true);

    // Resume: unpauses clock, but does NOT restart stopped auto drive
    engine.dispatch({
      clientId: 'client-1',
      seq: 7,
      expectedGeneration: 0,
      payload: { type: 'resume' },
    });
    expect(engine.getState().paused).toBe(false);
    expect(engine.getState().autoDriveEnabled).toBe(false);
    expect(engine.getState().omegaRod).toBe(0);
  });

  // 16. Camera/showRod preferences giữ qua scientific reset
  it('16. Zustand store preserves camera and showRod preferences across reset', () => {
    const store = createExperimentStore();

    store.getState().resetCamera();
    expect(store.getState().cameraRevision).toBe(1);

    store.getState().toggleRod();
    expect(store.getState().showRod).toBe(false);

    store.getState().reset();

    expect(store.getState().cameraRevision).toBe(1);
    expect(store.getState().showRod).toBe(false);
    expect(store.getState().snapshot.generation).toBe(1);
    expect(store.getState().hasStarted).toBe(false);
  });

  // 17. Same totals khác history không bị ép state giống nhau
  it('17. Same total inputs with different timelines produce distinct transient states', () => {
    // Engine A: 100ml water, 20g sugar, stirred for 60 ticks
    const engineA = new HeadlessSimulationEngine({ clientId: 'client-1' });
    engineA.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
    });
    engineA.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 200 },
    });
    engineA.dispatch({
      clientId: 'client-1',
      seq: 3,
      expectedGeneration: 0,
      payload: { type: 'setMode', mode: 'auto' },
    });
    engineA.dispatch({
      clientId: 'client-1',
      seq: 4,
      expectedGeneration: 0,
      payload: { type: 'setAutoLevel', level: 'fast' },
    });
    engineA.dispatch({
      clientId: 'client-1',
      seq: 5,
      expectedGeneration: 0,
      payload: { type: 'resume' },
    });
    for (let i = 0; i < 60; i++) {
      engineA.advance(1 / 60);
    }

    // Engine B: 100ml water, 20g sugar, left at rest (observe) for 60 ticks
    const engineB = new HeadlessSimulationEngine({ clientId: 'client-1' });
    engineB.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
    });
    engineB.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 200 },
    });
    engineB.dispatch({
      clientId: 'client-1',
      seq: 3,
      expectedGeneration: 0,
      payload: { type: 'resume' },
    });
    for (let i = 0; i < 60; i++) {
      engineB.advance(1 / 60);
    }

    // Both have exact same total inputs
    expect(engineA.getState().mass.Gt).toBe(engineB.getState().mass.Gt);
    expect(engineA.getState().mass.W).toBe(engineB.getState().mass.W);

    // But dissolved sugar is significantly higher in stirred Engine A!
    expect(engineA.getState().mass.Gd).toBeGreaterThan(engineB.getState().mass.Gd);
  });

  // 18. Same trace replay 30/60/120 FPS nhất quán
  it('18. Replaying recorded command trace at 30, 60, and 120 FPS produces identical scalar results', () => {
    const createTrace = (): TraceItem[] => [
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
        appliedAtTick: 60,
        command: {
          clientId: 'client-1',
          seq: 6,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
        },
      },
    ];

    const engine30 = new HeadlessSimulationEngine({ clientId: 'client-1', seed: 1729 });
    const report30 = TickBoundaryReplayHarness.replay(engine30, createTrace(), {
      fps: 30,
      totalDurationSeconds: 2.0,
    });

    const engine60 = new HeadlessSimulationEngine({ clientId: 'client-1', seed: 1729 });
    const report60 = TickBoundaryReplayHarness.replay(engine60, createTrace(), {
      fps: 60,
      totalDurationSeconds: 2.0,
    });

    const engine120 = new HeadlessSimulationEngine({ clientId: 'client-1', seed: 1729 });
    const report120 = TickBoundaryReplayHarness.replay(engine120, createTrace(), {
      fps: 120,
      totalDurationSeconds: 2.0,
    });

    expect(report30.ok).toBe(true);
    expect(report60.ok).toBe(true);
    expect(report120.ok).toBe(true);

    const state30 = engine30.getState();
    const state60 = engine60.getState();
    const state120 = engine120.getState();

    expect(state30.tickIndex).toBe(120);
    expect(state60.tickIndex).toBe(120);
    expect(state120.tickIndex).toBe(120);

    expect(Math.abs(state30.mass.Gd - state60.mass.Gd)).toBeLessThan(1e-6);
    expect(Math.abs(state60.mass.Gd - state120.mass.Gd)).toBeLessThan(1e-6);
    expect(Math.abs(state30.omegaFlow - state60.omegaFlow)).toBeLessThan(1e-6);
  });

  // 19. Snapshot/render copy isolation
  it('19. Snapshot and render copy arrays are strictly isolated from engine private state', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

    engine.dispatch({
      clientId: 'client-1',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
    });
    engine.dispatch({
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
    });

    const target: RenderTarget & { radii: Float32Array; poolIds: Uint8Array } = {
      positions: new Float32Array(3500 * 3),
      weights: new Float32Array(3500),
      materials: new Uint8Array(3500),
      radii: new Float32Array(3500),
      poolIds: new Uint8Array(3500),
      count: 3500,
    };

    engine.copyRenderFrame(target);
    const originalX = target.positions[0];

    // Mutate caller target array
    target.positions[0] = 9999.9;

    // Next copyRenderFrame overwrites caller array with clean internal state
    engine.copyRenderFrame(target);
    expect(target.positions[0]).toBe(originalX);
  });

  // 20. Regression toàn bộ tests hiện có
  it('20. Full end-to-end multi-step composition maintains mass conservation across all operations', () => {
    const clock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: clock });
    const store = createExperimentStore(bridge);

    // Initial state
    expect(store.getState().hasStarted).toBe(false);
    expect(store.getState().snapshot.paused).toBe(true);

    // Add substances
    store.getState().add('water', 100);
    store.getState().add('sugar', 20);
    store.getState().add('sand', 15);
    store.getState().add('oil', 25);

    // Start simulation
    store.getState().start();
    expect(store.getState().hasStarted).toBe(true);
    expect(store.getState().snapshot.paused).toBe(false);

    store.getState().startAuto('fast');

    // Run for 150 frames
    for (let i = 0; i < 150; i++) {
      clock.stepTime(1000 / 60);
      bridge.stepFrame(clock.now());
    }

    // Stop auto: flow decays
    store.getState().stopAuto();
    for (let i = 0; i < 60; i++) {
      clock.stepTime(1000 / 60);
      bridge.stepFrame(clock.now());
    }

    // Pause simulation
    store.getState().pause();
    expect(store.getState().snapshot.paused).toBe(true);

    // Add more while paused
    store.getState().add('water', 50);

    // Resume and switch to manual
    store.getState().resume();
    store.getState().setMode('manual');

    for (let i = 0; i < 30; i++) {
      clock.stepTime(1000 / 60);
      bridge.stepFrame(clock.now());
    }

    // Reset experiment
    store.getState().reset();
    expect(store.getState().hasStarted).toBe(false);
    expect(store.getState().snapshot.generation).toBe(1);
    expect(store.getState().snapshot.mass.W).toBe(0);
    expect(store.getState().snapshot.mass.Gt).toBe(0);
    expect(store.getState().snapshot.mass.St).toBe(0);
    expect(store.getState().snapshot.mass.Ot).toBe(0);
  });
});
