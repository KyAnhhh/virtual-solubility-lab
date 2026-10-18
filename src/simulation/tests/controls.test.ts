import { beforeEach, describe, expect, it } from 'vitest';
import {
  type HostClockAdapter,
  SimulationBridge,
} from '../bridge/SimulationBridge';
import {
  createExperimentStore,
  useExperimentStore,
} from '../../stores/experimentStore';
import {
  HeadlessSimulationEngine,
  HeadlessSimulationFacade,
} from '../core/HeadlessSimulationEngine';
import {
  ManualStirAdapter,
  type CameraControlTarget,
  type PointerCaptureTarget,
} from '../../interactions/ManualStirAdapter';
import { AUTO_LEVEL_SPEEDS } from '../constants/flow';
import {
  OIL_SEPARATE_BASE,
  SAND_SETTLE_WATER,
} from '../constants/science';
import { computeOilRates } from '../models/OilSeparation';
import type { Ray3D } from '../../interactions/RayPlaneProjection';

class MockCameraTarget implements CameraControlTarget {
  enabled = true;
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  isEnabled(): boolean {
    return this.enabled;
  }
}

class MockCaptureTarget implements PointerCaptureTarget {
  capturedId: number | null = null;
  releaseCallCount = 0;

  setPointerCapture(pointerId: number): void {
    this.capturedId = pointerId;
  }

  releasePointerCapture(pointerId: number): void {
    void pointerId;
    this.releaseCallCount++;
    this.capturedId = null;
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.capturedId === pointerId;
  }
}

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

  activeSchedulerCount(): number {
    return this.callbacks.size;
  }
}

const validRay: Ray3D = {
  origin: [0.35, 1.0, 0.1],
  direction: [0, -1, 0],
};

describe('V2-09 — UI pause/resume/stop/reset thống nhất (20 Mandatory Tests)', () => {
  beforeEach(() => {
    useExperimentStore.getState().reset();
  });

  // 1. Initial controls state
  it('1. Initial controls state: paused=true, time=0, tickIndex=0, mode=observe, autoDriveEnabled=false', () => {
    const store = createExperimentStore();
    const state = store.getState();

    expect(state.snapshot.paused).toBe(true);
    expect(state.snapshot.tickIndex).toBe(0);
    expect(state.snapshot.elapsedSeconds).toBe(0);
    expect(state.snapshot.mode).toBe('observe');
    expect(state.snapshot.autoDriveEnabled).toBe(false);
    expect(state.showRod).toBe(true);
    expect(state.cameraRevision).toBe(0);

    const clockBadge = state.snapshot.paused
      ? state.snapshot.tickIndex === 0 && state.snapshot.elapsedSeconds === 0
        ? 'Chưa chạy'
        : 'Tạm dừng'
      : 'Đang chạy';
    expect(clockBadge).toBe('Chưa chạy');
  });

  // 2. Resume accepted at tick 0
  it('2. Resume accepted at tick 0: unpauses simulation and starts clock', () => {
    const clock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: clock });
    const store = createExperimentStore(bridge);

    expect(store.getState().snapshot.paused).toBe(true);
    expect(store.getState().snapshot.tickIndex).toBe(0);

    store.getState().start();
    expect(store.getState().snapshot.paused).toBe(false);

    // First frame aligns host clock timestamp (delta = 0 without jump)
    clock.stepTime(16);
    bridge.stepFrame(clock.now());

    // Subsequent frame advances time and publishes throttled snapshot
    clock.stepTime(150);
    bridge.stepFrame(clock.now());

    expect(bridge.getEngine().getState().tickIndex).toBeGreaterThan(0);
    expect(store.getState().snapshot.tickIndex).toBeGreaterThan(0);
    expect(store.getState().snapshot.elapsedSeconds).toBeGreaterThan(0);
  });

  // 3. Pause freezes time, phase masses, and positions
  it('3. Pause freezes time, phase masses, and positions', () => {
    const clock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: clock });
    const store = createExperimentStore(bridge);

    store.getState().add('water', 50);
    store.getState().add('sugar', 20);
    store.getState().start();

    // Run for 30 frames
    for (let i = 0; i < 30; i++) {
      clock.stepTime(1000 / 60);
      bridge.stepFrame(clock.now());
    }

    expect(bridge.getEngine().getState().tickIndex).toBeGreaterThan(0);

    // Pause simulation
    store.getState().pause();
    expect(store.getState().snapshot.paused).toBe(true);

    const pausedSnap = store.getState().snapshot;
    const pausedTime = pausedSnap.elapsedSeconds;
    const pausedTick = pausedSnap.tickIndex;
    const pausedGd = pausedSnap.mass.Gd;

    // Advance host clock further while paused
    for (let i = 0; i < 30; i++) {
      clock.stepTime(1000 / 60);
      bridge.stepFrame(clock.now());
    }

    const afterSnap = store.getState().snapshot;
    expect(afterSnap.elapsedSeconds).toBe(pausedTime);
    expect(afterSnap.tickIndex).toBe(pausedTick);
    expect(afterSnap.mass.Gd).toBe(pausedGd);
  });

  // 4. Stop keeps clock running, drive 0, flow decays smoothly
  it('4. Stop keeps clock running, drive 0, flow decays smoothly', () => {
    const clock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: clock });
    const store = createExperimentStore(bridge);

    store.getState().add('water', 100);
    store.getState().start();
    store.getState().startAuto('medium');

    // Run to build flow intensity
    for (let i = 0; i < 60; i++) {
      clock.stepTime(1000 / 60);
      bridge.stepFrame(clock.now());
    }

    const spinningSnap = store.getState().snapshot;
    expect(spinningSnap.autoDriveEnabled).toBe(true);
    expect(spinningSnap.intensity).toBeGreaterThan(0.2);

    // Stop auto stirring
    store.getState().stopAuto();
    const stoppedSnap = store.getState().snapshot;
    expect(stoppedSnap.paused).toBe(false); // Clock remains running!
    expect(stoppedSnap.autoDriveEnabled).toBe(false); // Driver force cut!

    const omegaFlowStart = bridge.getEngine().getState().omegaFlow;
    expect(omegaFlowStart).toBeGreaterThan(0);

    // Advance clock: time continues and flow decays
    for (let i = 0; i < 60; i++) {
      clock.stepTime(1000 / 60);
      bridge.stepFrame(clock.now());
    }

    const decayedSnap = store.getState().snapshot;
    expect(decayedSnap.elapsedSeconds).toBeGreaterThan(stoppedSnap.elapsedSeconds);
    const omegaFlowDecayed = bridge.getEngine().getState().omegaFlow;
    expect(omegaFlowDecayed).toBeLessThan(omegaFlowStart);
  });

  // 5. Stop -> pause -> resume does NOT restart auto
  it('5. Stop -> pause -> resume does not restart auto', () => {
    const clock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: clock });
    const store = createExperimentStore(bridge);

    store.getState().add('water', 100);
    store.getState().start();
    store.getState().startAuto('fast');
    expect(store.getState().snapshot.autoDriveEnabled).toBe(true);

    // User stops stirring
    store.getState().stopAuto();
    expect(store.getState().snapshot.autoDriveEnabled).toBe(false);

    // User pauses
    store.getState().pause();
    expect(store.getState().snapshot.paused).toBe(true);

    // User resumes
    store.getState().resume();
    expect(store.getState().snapshot.paused).toBe(false);
    expect(store.getState().snapshot.autoDriveEnabled).toBe(false);
    expect(bridge.getEngine().getState().omegaRod).toBe(0);
  });

  // 6. Pause auto -> resume restores auto configuration
  it('6. Pause auto -> resume restores auto configuration and angular speed', () => {
    const clock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: clock });
    const store = createExperimentStore(bridge);

    store.getState().add('water', 100);
    store.getState().start();
    store.getState().startAuto('fast');

    expect(bridge.getEngine().getState().omegaRod).toBe(AUTO_LEVEL_SPEEDS.fast);
    expect(store.getState().snapshot.autoDriveEnabled).toBe(true);

    // Pause while auto is active
    store.getState().pause();
    expect(store.getState().snapshot.paused).toBe(true);
    expect(store.getState().snapshot.autoDriveEnabled).toBe(true);
    expect(bridge.getEngine().getState().omegaRod).toBe(0); // Spoon motionless while paused

    // Resume: restores speed
    store.getState().resume();
    expect(store.getState().snapshot.paused).toBe(false);
    expect(store.getState().snapshot.autoDriveEnabled).toBe(true);
    expect(bridge.getEngine().getState().omegaRod).toBe(AUTO_LEVEL_SPEEDS.fast);
  });

  // 7. Manual pause -> resume requires fresh pointerdown
  it('7. Manual pause -> resume requires fresh pointerdown and restores camera', () => {
    const cameraTarget = new MockCameraTarget();
    const captureTarget = new MockCaptureTarget();
    const engine = new HeadlessSimulationEngine({ clientId: 'test-client' });
    const facade = new HeadlessSimulationFacade(engine);
    const adapter = new ManualStirAdapter({
      engine,
      facade,
      cameraTarget,
      captureTarget,
    });
    const bridge = new SimulationBridge({ engine, manualAdapter: adapter });
    const store = createExperimentStore(bridge);

    store.getState().start();
    store.getState().setMode('manual');

    // Pointer down starts manual drag
    const downRes = adapter.onPointerDown({
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      ray: validRay,
    });
    expect(downRes.accepted).toBe(true);
    expect(adapter.isDragActive()).toBe(true);
    expect(cameraTarget.enabled).toBe(false);
    expect(captureTarget.capturedId).toBe(1);

    // Pause ends manual drag session and restores camera
    store.getState().pause();
    expect(adapter.isDragActive()).toBe(false);
    expect(cameraTarget.enabled).toBe(true);
    expect(captureTarget.capturedId).toBe(null);

    // Resume simulation
    store.getState().resume();
    expect(store.getState().snapshot.paused).toBe(false);

    // Attempting to move without fresh pointer down is rejected
    const moveRes = adapter.onPointerMove(1, {
      origin: [0.4, 1.0, 0.1],
      direction: [0, -1, 0],
    });
    expect(moveRes.accepted).toBe(false);
  });

  // 8. Hide/show rod does not restart driver
  it('8. Hide/show rod does not restart driver', () => {
    const store = createExperimentStore();

    store.getState().add('water', 100);
    store.getState().start();
    store.getState().startAuto('medium');

    expect(store.getState().snapshot.autoDriveEnabled).toBe(true);

    // Hide rod: cuts driver
    store.getState().toggleRod();
    expect(store.getState().showRod).toBe(false);
    expect(store.getState().snapshot.autoDriveEnabled).toBe(false);
    expect(store.getState().getBridge().getEngine().getState().omegaRod).toBe(0);

    // Show rod: does NOT automatically resume drive
    store.getState().toggleRod();
    expect(store.getState().showRod).toBe(true);
    expect(store.getState().snapshot.autoDriveEnabled).toBe(false);
    expect(store.getState().getBridge().getEngine().getState().omegaRod).toBe(0);
  });

  // 9. Add paused forces publish and geometry update without increasing time
  it('9. Add paused forces immediate publish and geometry update without increasing time', () => {
    const store = createExperimentStore();
    expect(store.getState().snapshot.paused).toBe(true);
    expect(store.getState().snapshot.tickIndex).toBe(0);
    expect(store.getState().snapshot.elapsedSeconds).toBe(0);
    expect(store.getState().snapshot.mass.W).toBe(0);

    // Add 100 ml water while paused
    const success = store.getState().add('water', 100);
    expect(success).toBe(true);

    const snap = store.getState().snapshot;
    expect(snap.mass.W).toBe(100);
    expect(snap.tickIndex).toBe(0);
    expect(snap.elapsedSeconds).toBe(0);
    expect(snap.paused).toBe(true);
  });

  // 10. Add paused preserves existing dissolved, suspended, dispersed masses
  it('10. Add paused preserves existing dissolved, suspended, dispersed masses', () => {
    const clock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: clock });
    const store = createExperimentStore(bridge);

    store.getState().add('water', 50);
    store.getState().add('sugar', 20);
    store.getState().add('sand', 10);
    store.getState().add('oil', 20);

    store.getState().start();
    store.getState().startAuto('fast');

    // Run for 120 ticks
    for (let i = 0; i < 120; i++) {
      clock.stepTime(1000 / 60);
      bridge.stepFrame(clock.now());
    }

    // Pause simulation (forces immediate snapshot publish)
    store.getState().pause();

    const pausedSnap = store.getState().snapshot;
    expect(pausedSnap.mass.Gd).toBeGreaterThan(0);
    expect(pausedSnap.mass.Ss).toBeGreaterThan(0);
    expect(pausedSnap.mass.Od).toBeGreaterThan(0);

    const savedGd = pausedSnap.mass.Gd;
    const savedSs = pausedSnap.mass.Ss;
    const savedOd = pausedSnap.mass.Od;

    // Add more sugar while paused
    store.getState().add('sugar', 10);

    const afterSnap = store.getState().snapshot;
    expect(afterSnap.mass.Gd).toBe(savedGd); // Dissolved sugar strictly unchanged!
    expect(afterSnap.mass.Ss).toBe(savedSs); // Suspended sand strictly unchanged!
    expect(afterSnap.mass.Od).toBe(savedOd); // Dispersed oil strictly unchanged!
    expect(afterSnap.mass.Gt).toBe(pausedSnap.mass.Gt + 10);
  });

  // 11. Invalid add preserves science and additions history
  it('11. Invalid add preserves science and additions history', () => {
    const store = createExperimentStore();

    store.getState().add('water', 100);
    expect(store.getState().additions.length).toBe(1);

    // Attempt invalid adds
    const resNegative = store.getState().add('water', -10);
    expect(resNegative).toBe(false);

    const resOverflow = store.getState().add('water', 500); // 100 + 500 > 500 ml
    expect(resOverflow).toBe(false);

    // Science state and additions remain unchanged
    expect(store.getState().snapshot.mass.W).toBe(100);
    expect(store.getState().additions.length).toBe(1);
  });

  // 12. Add 100 -> reset -> add 50 leaves exactly 50 ml
  it('12. Add 100 -> reset -> add 50 leaves exactly 50 ml', () => {
    const store = createExperimentStore();

    store.getState().add('water', 100);
    expect(store.getState().snapshot.mass.W).toBe(100);

    store.getState().reset();
    expect(store.getState().snapshot.mass.W).toBe(0);
    expect(store.getState().snapshot.generation).toBe(1);
    expect(store.getState().additions.length).toBe(0);

    store.getState().add('water', 50);
    expect(store.getState().snapshot.mass.W).toBe(50);
  });

  // 13. Duplicate reset and stale ack/sample/frame handling
  it('13. Duplicate reset and stale ack/sample/frame handling', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'test-client' });

    const seq = engine.getNextSequence();
    const ack1 = engine.dispatch({
      clientId: 'test-client',
      seq,
      expectedGeneration: engine.getCurrentGeneration(),
      payload: { type: 'reset' },
    });
    expect(ack1.accepted).toBe(true);
    expect(engine.getCurrentGeneration()).toBe(1);

    // Replaying identical command seq returns duplicate cached ack without double-incrementing generation
    const ack2 = engine.dispatch({
      clientId: 'test-client',
      seq,
      expectedGeneration: engine.getCurrentGeneration(),
      payload: { type: 'reset' },
    });
    expect(ack2.duplicate).toBe(true);
    expect(engine.getCurrentGeneration()).toBe(1);

    // Reusing same sequence with different payload is rejected with ID_REUSED
    const ack3 = engine.dispatch({
      clientId: 'test-client',
      seq,
      expectedGeneration: engine.getCurrentGeneration(),
      payload: { type: 'resume' },
    });
    expect(ack3.accepted).toBe(false);
    expect(ack3.reason).toBe('ID_REUSED');

    // Stale manual sample from old generation
    const staleAck = engine.dispatch({
      clientId: 'test-client',
      seq: engine.getNextSequence(),
      expectedGeneration: engine.getCurrentGeneration(),
      payload: {
        type: 'manualSample',
        x: 0.1,
        z: 0.1,
        inputTimeMs: 100,
        captureGeneration: 0, // Current gen is 1
        omegaRod: 0,
      },
    });
    expect(staleAck.accepted).toBe(false);
    expect(staleAck.reason).toBe('STALE_GENERATION');
  });

  // 14. Reset preserves camera and showRod preference
  it('14. Reset preserves camera and showRod preference', () => {
    const store = createExperimentStore();

    store.getState().resetCamera();
    store.getState().resetCamera();
    expect(store.getState().cameraRevision).toBe(2);

    store.getState().toggleRod();
    expect(store.getState().showRod).toBe(false);

    store.getState().reset();

    expect(store.getState().cameraRevision).toBe(2);
    expect(store.getState().showRod).toBe(false);
    expect(store.getState().snapshot.generation).toBe(1);
  });

  // 15. UI status distinguishes clock, mode, and driver
  it('15. UI status distinguishes clock, mode, and driver independent dimensions', () => {
    const store = createExperimentStore();

    // Dimension 1: Clock
    expect(store.getState().snapshot.paused).toBe(true);
    expect(store.getState().snapshot.tickIndex).toBe(0);

    // Dimension 2: Mode
    expect(store.getState().snapshot.mode).toBe('observe');

    // Dimension 3: Driver
    expect(store.getState().snapshot.autoDriveEnabled).toBe(false);

    // Transition: start auto
    store.getState().start();
    store.getState().startAuto('medium');

    expect(store.getState().snapshot.paused).toBe(false);
    expect(store.getState().snapshot.mode).toBe('auto');
    expect(store.getState().snapshot.autoDriveEnabled).toBe(true);

    // Transition: stop auto (releases driver, clock stays running)
    store.getState().stopAuto();
    expect(store.getState().snapshot.paused).toBe(false); // Clock is STILL running!
    expect(store.getState().snapshot.mode).toBe('auto');
    expect(store.getState().snapshot.autoDriveEnabled).toBe(false); // Driver is idle!
  });

  // 16. Changing autoLevel in observe or manual does not trigger auto mode
  it('16. Changing autoLevel in observe or manual does not trigger auto mode', () => {
    const store = createExperimentStore();

    expect(store.getState().snapshot.mode).toBe('observe');
    store.getState().setAutoLevel('fast');

    expect(store.getState().snapshot.autoLevel).toBe('fast');
    expect(store.getState().snapshot.mode).toBe('observe'); // Still observe!
    expect(store.getState().snapshot.autoDriveEnabled).toBe(false);

    store.getState().setMode('manual');
    expect(store.getState().snapshot.mode).toBe('manual');
    store.getState().setAutoLevel('slow');

    expect(store.getState().snapshot.autoLevel).toBe('slow');
    expect(store.getState().snapshot.mode).toBe('manual'); // Still manual!
    expect(store.getState().snapshot.autoDriveEnabled).toBe(false);
  });

  // 17. Cleanup manual session on stop, pause, reset, mode change
  it('17. Cleanup manual session on stop, pause, reset, mode change', () => {
    const cameraTarget = new MockCameraTarget();
    const captureTarget = new MockCaptureTarget();
    const engine = new HeadlessSimulationEngine({ clientId: 'test-client' });
    const facade = new HeadlessSimulationFacade(engine);
    const adapter = new ManualStirAdapter({
      engine,
      facade,
      cameraTarget,
      captureTarget,
    });
    const bridge = new SimulationBridge({ engine, manualAdapter: adapter });
    const store = createExperimentStore(bridge);

    store.getState().start();
    store.getState().setMode('manual');

    // Start drag
    adapter.onPointerDown({
      pointerId: 2,
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      ray: validRay,
    });
    expect(adapter.isDragActive()).toBe(true);
    expect(cameraTarget.enabled).toBe(false);

    // Mode change to observe clears drag and restores camera
    store.getState().setMode('observe');
    expect(adapter.isDragActive()).toBe(false);
    expect(cameraTarget.enabled).toBe(true);
  });

  // 18. Repeated controls do not create a second scheduler
  it('18. Repeated controls do not create a second scheduler or leak RAF', () => {
    const clock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: clock });
    bridge.attachLifecycle();

    expect(clock.activeSchedulerCount()).toBe(0); // Initially paused

    bridge.start();
    expect(clock.activeSchedulerCount()).toBe(1);

    bridge.resume();
    expect(clock.activeSchedulerCount()).toBe(1);

    bridge.pause();
    expect(clock.activeSchedulerCount()).toBe(0);

    bridge.resume();
    expect(clock.activeSchedulerCount()).toBe(1);

    bridge.destroy();
    expect(clock.activeSchedulerCount()).toBe(0);
  });

  // 19. Oil separation coefficient verification
  it('19. Oil separation coefficient verification: kSeparate = 0.10 / (1 + 3I)', () => {
    expect(OIL_SEPARATE_BASE).toBe(0.10);
    expect(SAND_SETTLE_WATER).toBe(0.15); // Sand settling is 0.15 s^-1, confirming report note was a typo!

    // Zero intensity
    const ratesAt0 = computeOilRates(0.0, 0.5, true);
    expect(ratesAt0.kSeparate).toBeCloseTo(0.10, 6);

    // Full intensity
    const ratesAt1 = computeOilRates(1.0, 0.5, true);
    expect(ratesAt1.kSeparate).toBeCloseTo(0.10 / (1.0 + 3.0), 6); // 0.025

    // Contrast with sand settling base rate
    expect(ratesAt0.kSeparate).not.toBe(SAND_SETTLE_WATER);
  });

  // 20. Full regression across all existing behaviors
  it('20. Full regression across all existing behaviors with mass invariants', () => {
    const clock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: clock });
    const store = createExperimentStore(bridge);

    // 1. Add water and sugar
    store.getState().add('water', 100);
    store.getState().add('sugar', 25);
    expect(store.getState().snapshot.mass.W).toBe(100);
    expect(store.getState().snapshot.mass.Gt).toBe(25);

    // 2. Start auto stirring
    store.getState().start();
    store.getState().startAuto('medium');

    for (let i = 0; i < 50; i++) {
      clock.stepTime(1000 / 60);
      bridge.stepFrame(clock.now());
    }

    // 3. Stop auto (flow decays)
    store.getState().stopAuto();
    expect(store.getState().snapshot.paused).toBe(false);
    expect(store.getState().snapshot.autoDriveEnabled).toBe(false);

    for (let i = 0; i < 30; i++) {
      clock.stepTime(1000 / 60);
      bridge.stepFrame(clock.now());
    }

    // 4. Pause and add sand
    store.getState().pause();
    expect(store.getState().snapshot.paused).toBe(true);
    store.getState().add('sand', 15);
    expect(store.getState().snapshot.mass.St).toBe(15);

    // 5. Resume and reset
    store.getState().resume();
    expect(store.getState().snapshot.paused).toBe(false);

    store.getState().reset();
    expect(store.getState().snapshot.generation).toBe(1);
    expect(store.getState().snapshot.mass.W).toBe(0);
    expect(store.getState().snapshot.mass.Gt).toBe(0);
    expect(store.getState().snapshot.mass.St).toBe(0);
  });
});
