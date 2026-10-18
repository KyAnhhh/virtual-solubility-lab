import { describe, expect, it } from 'vitest';
import { HeadlessSimulationEngine } from '../core/HeadlessSimulationEngine';
import { createExperimentStore } from '../../stores/experimentStore';
import { SimulationBridge, type HostClockAdapter } from '../bridge/SimulationBridge';
import {
  computeBeakerRegions,
  type PhaseMasses,
} from '../constants/beaker';
import {
  evaluateScienceState,
  formatCapacity,
  formatDissolutionProgress,
  formatPhaseMass,
  formatSaturationRatio,
  INITIAL_HYSTERESIS_STATE,
  updateHysteresisState,
} from '../../components/results/contentsHelpers';
import {
  computeDissolutionProgress,
  computeSaturationRatio,
} from '../models/Dissolution';
import {
  computeWaterCapacityG,
  SOLUBILITY_SUGAR_DEFAULT,
} from '../constants/science';

class MockHostClock implements HostClockAdapter {
  private currentTime = 0;
  private nextHandle = 1;
  private callbacks = new Map<number, (timestamp: number) => void>();

  now = (): number => {
    return this.currentTime;
  };

  requestAnimationFrame = (cb: (timestamp: number) => void): number => {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, cb);
    return handle;
  };

  cancelAnimationFrame = (handle: number): void => {
    this.callbacks.delete(handle);
  };

  stepTime(deltaMs: number): void {
    this.currentTime += deltaMs;
    const currentCallbacks = Array.from(this.callbacks.entries());
    this.callbacks.clear();
    for (const [, cb] of currentCallbacks) {
      cb(this.currentTime);
    }
  }

  pendingCallbacksCount(): number {
    return this.callbacks.size;
  }
}

describe('V2-11 Water–Sugar Vertical Slice Acceptance & Scientific Accuracy', () => {
  it('1. Gu > 0 and < 0.001 g: particles visually hidden, ledger preserves exact mass', () => {
    const engine = new HeadlessSimulationEngine({ seed: 1729 });
    const cid = engine.getClientId();
    let seq = 1;

    // Add Water 100 ml, Sugar 1.0 g
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
    });
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 10 },
    });

    // Start auto fast and resume
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'setMode', mode: 'auto' },
    });
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'setAutoLevel', level: 'fast' },
    });
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'resume' },
    });

    // Advance 45 seconds (2700 ticks at h = 1/60s)
    for (let i = 0; i < 2700; i++) {
      engine.advance(1 / 60);
    }

    const snap = engine.snapshot();

    // 1. Visual hide threshold in SPEC §8: Gu < 0.001 g
    expect(snap.mass.Gu).toBeLessThan(0.001);
    expect(snap.mass.Gu).toBeGreaterThan(0);

    // 2. 3D Beaker regions: solid bed volume derived from Gu * 0.65 is < 0.001 ml (hidden visually)
    const phases: PhaseMasses = {
      Wml: snap.mass.W,
      Oml: 0,
      Gt: snap.mass.Gt,
      Gu: snap.mass.Gu,
      Gd: snap.mass.Gd,
      fGu: snap.fGu,
      St: 0,
      Sb: 0,
      Ss: 0,
      Ot: 0,
      Ol: 0,
      Od: 0,
    };
    const regions = computeBeakerRegions(phases);
    expect(regions.bed.volumeMl).toBeLessThan(0.001);

    // 3. Ledger preserves exact mass without snapping to 0
    expect(snap.mass.Gu + snap.mass.Gd).toBeCloseTo(1.0, 10);
    expect(snap.mass.Gd).toBeGreaterThan(0.999);
  });

  it('2. Tiny positive Gu: formatPhaseMass outputs "<0,1 g", never "0 g"', () => {
    // Exact zero
    expect(formatPhaseMass(0)).toBe('0 g');
    expect(formatPhaseMass(-0)).toBe('0 g');

    // Tiny positive numbers (from float simulation) must strictly format as "<0,1 g"
    expect(formatPhaseMass(1e-12)).toBe('<0,1 g');
    expect(formatPhaseMass(1e-6)).toBe('<0,1 g');
    expect(formatPhaseMass(0.0005)).toBe('<0,1 g');
    expect(formatPhaseMass(0.001)).toBe('<0,1 g');
    expect(formatPhaseMass(0.09)).toBe('<0,1 g');
    expect(formatPhaseMass(0.099)).toBe('<0,1 g');

    // Numbers >= 0.1 g
    expect(formatPhaseMass(0.1)).toBe('0,1 g');
    expect(formatPhaseMass(1.0)).toBe('1 g');
    expect(formatPhaseMass(1.23)).toBe('1,2 g');
    expect(formatPhaseMass(20.5)).toBe('20,5 g');
  });

  it('3. Near-complete label does not mean exact Gu = 0', () => {
    const Gt = 100;
    // L(100) = max(0.01, 100 * 0.01) = 1.0 g
    let hState = INITIAL_HYSTERESIS_STATE;

    // Gu = 0.5 g (> 0, <= 1.0 g)
    hState = updateHysteresisState(hState, {
      saturationRatio: 0.5,
      Gu: 0.5,
      Gt,
      W: 100,
    });
    expect(hState.nearComplete).toBe(true);

    const mockSnapshot = {
      generation: 0,
      stateVersion: 100,
      tickIndex: 600,
      elapsedSeconds: 10,
      paused: false,
      mode: 'auto' as const,
      autoDriveEnabled: true,
      autoLevel: 'fast' as const,
      input: { water: 1000, sugar: 1000, sand: 0, oil: 0 },
      mass: {
        W: 100,
        Gt: 100,
        Gu: 0.5,
        Gd: 99.5,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      },
      fGu: 0.1,
      rod: { x: 0, z: 0, tipY: 0, theta: 0, radius: 0.4 },
      omegaRod: 6,
      omegaDrive: 6,
      omegaFlow: 4.28,
      intensity: 0.71,
      contact: 1,
      capacityG: 200,
      saturationRatio: 0.4975,
      dissolutionProgress: 0.995,
    };

    const evaluation = evaluateScienceState(mockSnapshot, hState);
    // Gu is positive, so it is near complete but NOT fully dissolved!
    expect(evaluation.isNearComplete).toBe(true);
    expect(evaluation.isFullyDissolved).toBe(false);
  });

  it('4. Gu = 0 fixture for truly zero solid sugar displays "Đã tan hoàn toàn" and 100% progress', () => {
    const mockZeroSolidSnapshot = {
      generation: 0,
      stateVersion: 200,
      tickIndex: 1200,
      elapsedSeconds: 20,
      paused: false,
      mode: 'auto' as const,
      autoDriveEnabled: true,
      autoLevel: 'fast' as const,
      input: { water: 1000, sugar: 10, sand: 0, oil: 0 },
      mass: {
        W: 100,
        Gt: 1.0,
        Gu: 0, // Truly zero solid sugar
        Gd: 1.0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      },
      fGu: 0,
      rod: { x: 0, z: 0, tipY: 0, theta: 0, radius: 0.4 },
      omegaRod: 6,
      omegaDrive: 6,
      omegaFlow: 4.28,
      intensity: 0.71,
      contact: 1,
      capacityG: 200,
      saturationRatio: 0.005,
      dissolutionProgress: 1.0,
    };

    const evaluation = evaluateScienceState(mockZeroSolidSnapshot, INITIAL_HYSTERESIS_STATE);
    expect(evaluation.isFullyDissolved).toBe(true);
    expect(evaluation.isNearComplete).toBe(false);
    expect(evaluation.explanation).toContain('Đường đã hòa tan hoàn toàn');

    // Headroom = min(Gt, cap) - Gd = 1.0 - 1.0 = 0
    const headroom = Math.max(0, Math.min(1.0, 200) - 1.0);
    expect(formatDissolutionProgress(1.0, headroom)).toBe('100%');
  });

  it('5. Gt = 0 (water present, no sugar) has no successful dissolution label or saturation badge', () => {
    const mockWaterOnlySnapshot = {
      generation: 0,
      stateVersion: 10,
      tickIndex: 0,
      elapsedSeconds: 0,
      paused: true,
      mode: 'observe' as const,
      autoDriveEnabled: false,
      autoLevel: 'slow' as const,
      input: { water: 1000, sugar: 0, sand: 0, oil: 0 },
      mass: {
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
      },
      fGu: 0,
      rod: { x: 0.3, z: 0, tipY: 0, theta: 0, radius: 0.3 },
      omegaRod: 0,
      omegaDrive: 0,
      omegaFlow: 0,
      intensity: 0,
      contact: 1,
      capacityG: 200,
      saturationRatio: 0,
      dissolutionProgress: null,
    };

    const evaluation = evaluateScienceState(mockWaterOnlySnapshot, INITIAL_HYSTERESIS_STATE);
    expect(evaluation.isFullyDissolved).toBe(false);
    expect(evaluation.isNearComplete).toBe(false);
    expect(evaluation.isSaturated).toBe(false);
    expect(evaluation.isNearSaturation).toBe(false);
    expect(evaluation.hasExcess).toBe(false);
    expect(evaluation.explanation).toContain('Trong cốc có nước, chưa thêm đường');
  });

  it('6. Saturated mixture (W=10, Gt=30): progress is based on 20g target, reaches 100% when headroom = 0 with Gu = 10g', () => {
    const capacityG = 20.0;
    const Gt = 30.0;
    const dissolvableTarget = Math.min(Gt, capacityG); // 20.0 g

    // Case 6A: Near target, Gd = 19.992 g, headroom = 0.008 g > 1e-8
    const gdNear = 19.992;
    const progressNear = gdNear / dissolvableTarget; // 0.9996
    const headroomNear = Math.max(0, dissolvableTarget - gdNear);
    expect(formatDissolutionProgress(progressNear, headroomNear)).toBe('99,9%');

    // Case 6B: Target reached, Gd = 20.0 g, headroom = 0, Gu = 10.0 g > 0
    const gdFull = 20.0;
    const progressFull = gdFull / dissolvableTarget; // 1.0
    const headroomFull = Math.max(0, dissolvableTarget - gdFull); // 0
    expect(headroomFull).toBe(0);
    // Even though Gu = 10.0 g > 0, dissolvable target progress reaches 100%!
    expect(formatDissolutionProgress(progressFull, headroomFull)).toBe('100%');

    // Evaluate science state for saturated snapshot with excess sugar
    const mockSaturatedSnapshot = {
      generation: 0,
      stateVersion: 1000,
      tickIndex: 36000,
      elapsedSeconds: 600,
      paused: false,
      mode: 'auto' as const,
      autoDriveEnabled: true,
      autoLevel: 'fast' as const,
      input: { water: 100, sugar: 300, sand: 0, oil: 0 },
      mass: {
        W: 10,
        Gt: 30,
        Gu: 10,
        Gd: 20,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      },
      fGu: 0.1,
      rod: { x: 0, z: 0, tipY: 0, theta: 0, radius: 0.4 },
      omegaRod: 6,
      omegaDrive: 6,
      omegaFlow: 4.28,
      intensity: 0.71,
      contact: 1,
      capacityG: 20,
      saturationRatio: 1.0,
      dissolutionProgress: 1.0,
    };

    let h = INITIAL_HYSTERESIS_STATE;
    h = updateHysteresisState(h, {
      saturationRatio: 1.0,
      Gu: 10,
      Gt: 30,
      W: 10,
    });
    const evalResult = evaluateScienceState(mockSaturatedSnapshot, h);
    expect(evalResult.hasExcess).toBe(true);
    expect(evalResult.isSaturated).toBe(true);
    expect(evalResult.isNearSaturation).toBe(false);
    expect(evalResult.explanation).toContain('Dung dịch đã đạt giới hạn bão hòa');
  });

  it('7. W = 0 implies solvent capacity, saturation ratio, and dissolution progress are N/A', () => {
    expect(formatCapacity(0, 0)).toBe('N/A');
    expect(formatCapacity(200, 0)).toBe('N/A');
    expect(computeSaturationRatio(0, 0, 0)).toBeNull();
    expect(computeSaturationRatio(10, 20, 0)).toBeNull();
    expect(formatSaturationRatio(null)).toBe('N/A');

    expect(computeDissolutionProgress(0, 10, 0, 0)).toBeNull();
    expect(computeDissolutionProgress(10, 10, 20, 0)).toBeNull();
    expect(formatDissolutionProgress(null)).toBe('N/A');
  });

  it('8. Near saturation hysteresis two-way transitions (enter >= 0.99, exit < 0.98)', () => {
    let h = INITIAL_HYSTERESIS_STATE;
    expect(h.nearSaturation).toBe(false);

    // Below 0.99: remains false
    h = updateHysteresisState(h, { saturationRatio: 0.985, Gu: 10, Gt: 30, W: 10 });
    expect(h.nearSaturation).toBe(false);

    // Enter at 0.99
    h = updateHysteresisState(h, { saturationRatio: 0.99, Gu: 10, Gt: 30, W: 10 });
    expect(h.nearSaturation).toBe(true);

    // Deadband [0.98, 0.99): remains true
    h = updateHysteresisState(h, { saturationRatio: 0.985, Gu: 10, Gt: 30, W: 10 });
    expect(h.nearSaturation).toBe(true);

    // Exits strictly below 0.98
    h = updateHysteresisState(h, { saturationRatio: 0.979, Gu: 10, Gt: 30, W: 10 });
    expect(h.nearSaturation).toBe(false);

    // Returns to deadband from below: remains false
    h = updateHysteresisState(h, { saturationRatio: 0.985, Gu: 10, Gt: 30, W: 10 });
    expect(h.nearSaturation).toBe(false);
  });

  it('9. Label "Đạt giới hạn hòa tan (trong sai số)" is distinct from "Gần bão hòa"', () => {
    const W = 10;
    const capacityG = 20;

    // Subcase 9A: Near saturation (ratio = 0.992, gap = 0.16 g > eps)
    const snapNear = {
      generation: 0,
      stateVersion: 100,
      tickIndex: 100,
      elapsedSeconds: 5,
      paused: false,
      mode: 'auto' as const,
      autoDriveEnabled: true,
      autoLevel: 'fast' as const,
      input: { water: 100, sugar: 300, sand: 0, oil: 0 },
      mass: {
        W,
        Gt: 30,
        Gu: 10.16,
        Gd: 19.84,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      },
      fGu: 0.1,
      rod: { x: 0, z: 0, tipY: 0, theta: 0, radius: 0.4 },
      omegaRod: 6,
      omegaDrive: 6,
      omegaFlow: 4.28,
      intensity: 0.71,
      contact: 1,
      capacityG,
      saturationRatio: 19.84 / 20,
      dissolutionProgress: 19.84 / 20,
    };

    const hNear = updateHysteresisState(INITIAL_HYSTERESIS_STATE, {
      saturationRatio: snapNear.saturationRatio,
      Gu: snapNear.mass.Gu,
      Gt: snapNear.mass.Gt,
      W: snapNear.mass.W,
    });
    const evalNear = evaluateScienceState(snapNear, hNear);
    expect(evalNear.isSaturated).toBe(false);
    expect(evalNear.isNearSaturation).toBe(true);

    // Subcase 9B: Fully saturated within numerical epsilon (gap <= 1e-8)
    const snapSat = {
      ...snapNear,
      mass: {
        ...snapNear.mass,
        Gu: 10.0,
        Gd: 20.0,
      },
      saturationRatio: 1.0,
      dissolutionProgress: 1.0,
    };
    const hSat = updateHysteresisState(hNear, {
      saturationRatio: snapSat.saturationRatio,
      Gu: snapSat.mass.Gu,
      Gt: snapSat.mass.Gt,
      W: snapSat.mass.W,
    });
    const evalSat = evaluateScienceState(snapSat, hSat);
    expect(evalSat.isSaturated).toBe(true);
    // When isSaturated is true, isNearSaturation must NOT be active
    expect(evalSat.isNearSaturation).toBe(false);
  });

  it('10. Capacity dynamically scales with actual water mass (S0 * W) and ignores oil', () => {
    // S0 = 2.0 g/g water
    expect(SOLUBILITY_SUGAR_DEFAULT).toBe(2.0);

    expect(computeWaterCapacityG(50)).toBe(100);
    expect(computeWaterCapacityG(100)).toBe(200);

    const engine = new HeadlessSimulationEngine({ seed: 1729 });
    const cid = engine.getClientId();
    let seq = 1;

    // Add 50 ml water (500 deciTicks)
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 500 },
    });
    expect(engine.snapshot().capacityG).toBe(100);

    // Add 50 ml oil (500 deciTicks) -> Capacity must still be 100 g!
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'oil', deciTicks: 500 },
    });
    expect(engine.snapshot().capacityG).toBe(100);

    // Add another 50 ml water (500 deciTicks) -> Capacity scales to 200 g
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 500 },
    });
    expect(engine.snapshot().capacityG).toBe(200);
  });

  it('11. Add water while paused preserves Gd and elapsed time, increases capacity, and updates labels', () => {
    const hostClock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock });
    const store = createExperimentStore(bridge);
    const state = store.getState();

    // Add W10, G30
    state.add('water', '10');
    state.add('sugar', '30');
    state.start();

    // Advance 600 ticks (10s)
    for (let i = 0; i < 600; i++) {
      hostClock.stepTime(1000 / 60);
    }

    state.pause();
    let snap = store.getState().snapshot;
    expect(snap.paused).toBe(true);
    const gdAtPause = snap.mass.Gd;
    const timeAtPause = snap.elapsedSeconds;
    expect(gdAtPause).toBeGreaterThan(0);
    expect(snap.capacityG).toBe(20);

    // Add 10 ml water while paused
    state.add('water', '10');
    snap = store.getState().snapshot;

    // Time and Gd remain unchanged!
    expect(snap.elapsedSeconds).toBe(timeAtPause);
    expect(snap.mass.Gd).toBe(gdAtPause);
    // Water and capacity doubled
    expect(snap.mass.W).toBe(20);
    expect(snap.capacityG).toBe(40);
    // Saturation ratio halved
    expect(snap.saturationRatio).toBeCloseTo(gdAtPause / 40, 6);

    bridge.destroy();
  });

  it('12. Reset clears old hysteresis and resets science state back to clean baseline', () => {
    const hostClock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock });
    const store = createExperimentStore(bridge);
    const state = store.getState();

    state.add('water', '100');
    state.add('sugar', '10');
    state.start();

    for (let i = 0; i < 120; i++) {
      hostClock.stepTime(1000 / 60);
    }

    let snap = store.getState().snapshot;
    expect(snap.mass.Gd).toBeGreaterThan(0);

    // Dispatch reset
    state.reset();

    snap = store.getState().snapshot;
    expect(snap.generation).toBe(1);
    expect(snap.tickIndex).toBe(0);
    expect(snap.elapsedSeconds).toBe(0);
    expect(snap.paused).toBe(true);
    expect(snap.mass.W).toBe(0);
    expect(snap.mass.Gt).toBe(0);
    expect(snap.mass.Gu).toBe(0);
    expect(snap.mass.Gd).toBe(0);

    // Scientific evaluation on clean reset snapshot
    const evaluation = evaluateScienceState(snap, INITIAL_HYSTERESIS_STATE);
    expect(evaluation.isFullyDissolved).toBe(false);
    expect(evaluation.isNearComplete).toBe(false);
    expect(evaluation.isSaturated).toBe(false);
    expect(evaluation.isNearSaturation).toBe(false);
    expect(evaluation.explanation).toContain('Cốc rỗng');

    bridge.destroy();
  });

  it('13. Auto smoke sequence matches paused-button policy (resume on auto, showRod guard)', () => {
    const hostClock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock });
    const store = createExperimentStore(bridge);
    const state = store.getState();

    // Initially paused
    expect(store.getState().snapshot.paused).toBe(true);

    // (a) Activating startAuto directly from paused: automatically resumes simulation
    state.startAuto('fast');
    expect(store.getState().snapshot.mode).toBe('auto');
    expect(store.getState().snapshot.autoLevel).toBe('fast');
    expect(store.getState().snapshot.autoDriveEnabled).toBe(true);
    expect(store.getState().snapshot.paused).toBe(false);

    // (b) Guard: when showRod is false, startAuto is rejected
    state.toggleRod(); // hides rod
    expect(store.getState().showRod).toBe(false);
    // Try to call startAuto
    state.startAuto('medium');
    expect(store.getState().message).toBe('Hiện thìa trước khi bắt đầu khuấy tự động.');

    bridge.destroy();
  });

  it('14. Continuous finite-time simulation does not require exact Gu = 0 or exact Gd = capacityG', () => {
    const engine = new HeadlessSimulationEngine({ seed: 1729 });
    const cid = engine.getClientId();
    let seq = 1;

    // Add W100, G1.0g
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
    });
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 10 },
    });
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'resume' },
    });

    // Run for 1.0 simulated second (60 ticks)
    for (let i = 0; i < 60; i++) {
      engine.advance(1 / 60);
    }

    const snap = engine.snapshot();
    // Analytic oracle: Gd(1s) = 1.0 * (1 - exp(-0.025 * 1.0))
    const analyticGd = 1.0 * (1 - Math.exp(-0.025 * 1.0));
    expect(snap.mass.Gd).toBeCloseTo(analyticGd, 5);
    expect(snap.mass.Gu).toBeCloseTo(1.0 - analyticGd, 5);

    // Simulation does NOT jump prematurely to exact 0 at finite time
    expect(snap.mass.Gu).toBeGreaterThan(0);
    expect(snap.mass.Gd).toBeLessThan(1.0);
    expect(snap.mass.Gu + snap.mass.Gd).toBeCloseTo(1.0, 10);
  });

  it('15. UC1 standard smoke test (W = 40 ml + G = 100 g, capacity 80g, excess 20g)', () => {
    const engine = new HeadlessSimulationEngine({ seed: 1729 });
    const cid = engine.getClientId();
    let seq = 1;

    // UC1 fixture from TEST_CASES.md: Water 40 ml (400 deciTicks) + Sugar 100 g (1000 deciTicks)
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'water', deciTicks: 400 },
    });
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 1000 },
    });

    let snap = engine.snapshot();
    expect(snap.mass.W).toBe(40);
    expect(snap.mass.Gt).toBe(100);
    expect(snap.mass.Gu).toBe(100);
    expect(snap.mass.Gd).toBe(0);
    // Capacity S0 * W = 2.0 * 40 = 80 g
    expect(snap.capacityG).toBe(80);

    // Start auto fast and resume
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'setMode', mode: 'auto' },
    });
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'setAutoLevel', level: 'fast' },
    });
    engine.dispatch({
      clientId: cid,
      seq: seq++,
      expectedGeneration: 0,
      payload: { type: 'resume' },
    });

    // Run for 300 simulated seconds (18,000 ticks at h = 1/60s)
    for (let i = 0; i < 18000; i++) {
      engine.advance(1 / 60);
    }

    snap = engine.snapshot();
    expect(snap.elapsedSeconds).toBeCloseTo(300, 3);

    // Dissolved sugar approaches capacity 80g (>= 79.99 g)
    expect(snap.mass.Gd).toBeLessThanOrEqual(80.0);
    expect(snap.mass.Gd).toBeGreaterThan(79.99);

    // Residual solid sugar at bed must remain ~20g
    expect(snap.mass.Gu).toBeGreaterThanOrEqual(20.0);
    expect(snap.mass.Gu).toBeCloseTo(20.0, 1);
    expect(snap.mass.Gu + snap.mass.Gd).toBeCloseTo(100.0, 8);

    // 3D Scene regions check:
    const phases: PhaseMasses = {
      Wml: snap.mass.W,
      Oml: 0,
      Gt: snap.mass.Gt,
      Gu: snap.mass.Gu,
      Gd: snap.mass.Gd,
      fGu: snap.fGu,
      St: 0,
      Sb: 0,
      Ss: 0,
      Ot: 0,
      Ol: 0,
      Od: 0,
    };
    const regions = computeBeakerRegions(phases);
    // Under V3-03, fGu kinetics lifts a fraction of undissolved sugar while stirring
    // Bed volume = 0.65 * GuBed = 0.65 * Gu * (1 - fGu)
    const expectedGuBed = snap.mass.Gu * (1 - (snap.fGu ?? 0));
    const expectedGuSusp = snap.mass.Gu * (snap.fGu ?? 0);
    expect(regions.bed.volumeMl).toBeCloseTo(expectedGuBed * 0.65, 3);
    // Aqueous volume expands: W + 0.65 * Gd + 0.65 * GuSusp
    expect(regions.aqueous.volumeMl).toBeCloseTo(40 + 0.65 * snap.mass.Gd + 0.65 * expectedGuSusp, 3);
    // Total reservation volume is strictly preserved: 40 + 0.65 * 100 = 105.0 ml
    expect(regions.bed.volumeMl + regions.aqueous.volumeMl).toBeCloseTo(105.0, 3);

    // Dissolvable target is min(100, 80) = 80g
    // Dissolvable progress approaches 100% of the 80g target
    expect(snap.dissolutionProgress).toBeGreaterThan(0.999);
  });
});
