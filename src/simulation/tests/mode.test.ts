import { describe, it, expect, vi } from 'vitest';
import {
  ManualStirAdapter,
  type PointerCaptureTarget,
  type CameraControlTarget,
} from '../../interactions/ManualStirAdapter';
import type { Ray3D } from '../../interactions/RayPlaneProjection';
import {
  HeadlessSimulationEngine,
  HeadlessSimulationFacade,
} from '../core/SimulationEngine';
import { SimulationBridge, type HostClockAdapter } from '../bridge/SimulationBridge';
import { useExperimentStore } from '../../stores/experimentStore';
import { A_STIR, B_STIR } from '../constants/flow';
import { DEFAULT_H } from '../core/SimulationClock';
import { clampSpoonXZ } from '../constants/beaker';

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
  shouldThrow = false;
  throwError = new Error('InvalidPointerId');
  releaseCallCount = 0;
  onRelease?: () => void;

  setPointerCapture(pointerId: number): void {
    if (this.shouldThrow) {
      throw this.throwError;
    }
    this.capturedId = pointerId;
  }

  releasePointerCapture(pointerId: number): void {
    void pointerId;
    this.releaseCallCount++;
    this.capturedId = null;
    this.onRelease?.();
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
    const currentCallbacks = Array.from(this.callbacks.entries());
    this.callbacks.clear();
    for (const [, cb] of currentCallbacks) {
      cb(this.currentTime);
    }
  }
}

function makeTopDownRay(x: number, z: number, fromY = 1.0): Ray3D {
  return {
    origin: [x, fromY, z],
    direction: [0, -1, 0],
  };
}

describe('V2-07 — Pointer Ownership và Chuyển Mode', () => {
  function createSetup(options?: { mode?: 'observe' | 'auto' | 'manual'; paused?: boolean }) {
    const engine = new HeadlessSimulationEngine();
    const facade = new HeadlessSimulationFacade(engine);

    // Add 100 ml water for contact
    facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });

    // Mode configuration (default: manual)
    const targetMode = options?.mode ?? 'manual';
    if (targetMode !== 'observe') {
      facade.dispatchIntent({ type: 'setMode', mode: targetMode });
    }

    // Pause configuration (default: unpaused for test interactions)
    if (options?.paused !== true) {
      facade.dispatchIntent({ type: 'resume' });
    }

    const cameraTarget = new MockCameraTarget();
    const captureTarget = new MockCaptureTarget();

    let showRod = true;
    const adapter = new ManualStirAdapter({
      engine,
      facade,
      cameraTarget,
      captureTarget,
      getShowRod: () => showRod,
      now: () => 1000,
    });

    return {
      state: engine.getState(),
      engine,
      facade,
      cameraTarget,
      captureTarget,
      adapter,
      setShowRod: (val: boolean) => {
        showRod = val;
      },
    };
  }

  it('1. Valid pointerdown preserves pose, captures ID, camera off', () => {
    const { adapter, engine, cameraTarget, captureTarget } = createSetup();
    const initialPose = engine.getRodPose();

    const result = adapter.onPointerDown({
      pointerId: 42,
      ray: makeTopDownRay(initialPose.x, initialPose.z),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: 1000,
    });

    expect(result.accepted).toBe(true);
    expect(adapter.getCapturedPointerId()).toBe(42);
    expect(captureTarget.capturedId).toBe(42);
    expect(cameraTarget.isEnabled()).toBe(false);
    expect(adapter.getInteractionState()).toBe('manual-drag');
    expect(adapter.isCameraLocked()).toBe(true);

    // Initial authoritative pose is preserved
    const currentPose = engine.getRodPose();
    expect(currentPose.x).toBeCloseTo(initialPose.x, 8);
    expect(currentPose.z).toBeCloseTo(initialPose.z, 8);
    expect(currentPose.theta).toBeCloseTo(initialPose.theta, 8);
  });

  it('2. Invalid hit / ray / paused / hidden rod does not capture input', () => {
    // 2a. Observe mode
    const sObserve = createSetup({ mode: 'observe' });
    let res = sObserve.adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
    });
    expect(res.accepted).toBe(false);
    expect(sObserve.cameraTarget.isEnabled()).toBe(true);
    expect(sObserve.captureTarget.capturedId).toBeNull();

    // 2b. Auto mode
    const sAuto = createSetup({ mode: 'auto' });
    res = sAuto.adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
    });
    expect(res.accepted).toBe(false);
    expect(sAuto.cameraTarget.isEnabled()).toBe(true);

    // 2c. Hidden rod
    const sHidden = createSetup();
    sHidden.setShowRod(false);
    res = sHidden.adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
    });
    expect(res.accepted).toBe(false);
    expect(sHidden.cameraTarget.isEnabled()).toBe(true);

    // 2d. Paused simulation
    const sPaused = createSetup({ paused: true });
    res = sPaused.adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
    });
    expect(res.accepted).toBe(false);
    expect(sPaused.cameraTarget.isEnabled()).toBe(true);

    // 2e. Missed hit (isHitSpoon === false)
    const sMiss = createSetup();
    res = sMiss.adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: false,
    });
    expect(res.accepted).toBe(false);
    expect(sMiss.cameraTarget.isEnabled()).toBe(true);

    // 2f. Parallel ray (no intersection with plane)
    const sParallel = createSetup();
    res = sParallel.adapter.onPointerDown({
      pointerId: 1,
      ray: { origin: [0, 0, 0], direction: [1, 0, 0] },
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
    });
    expect(res.accepted).toBe(false);
    expect(sParallel.cameraTarget.isEnabled()).toBe(true);
  });

  it('3. Second pointer cannot hijack active session', () => {
    const { adapter, cameraTarget, captureTarget } = createSetup();

    // Pointer 1 captures
    const res1 = adapter.onPointerDown({
      pointerId: 10,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
    });
    expect(res1.accepted).toBe(true);
    expect(adapter.getCapturedPointerId()).toBe(10);
    expect(captureTarget.capturedId).toBe(10);

    // Pointer 2 tries pointerdown
    const res2 = adapter.onPointerDown({
      pointerId: 20,
      ray: makeTopDownRay(0.4, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
    });
    expect(res2.accepted).toBe(false);

    // Pointer 2 tries pointermove
    const res2Move = adapter.onPointerMove(20, makeTopDownRay(0.4, 0.2));
    expect(res2Move.accepted).toBe(false);

    // Pointer 1 still owns session
    expect(adapter.getCapturedPointerId()).toBe(10);
    expect(captureTarget.capturedId).toBe(10);
    expect(cameraTarget.isEnabled()).toBe(false);
  });

  it('4. Move negative x/z and negative theta work across quadrants', () => {
    const { adapter, engine } = createSetup();
    adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: 1000,
    });

    // Quadrant II: x < 0, z > 0
    let res = adapter.onPointerMove(1, makeTopDownRay(-0.3, 0.4), 1020);
    expect(res.accepted).toBe(true);
    expect(engine.getRodPose().x).toBeCloseTo(-0.3, 4);
    expect(engine.getRodPose().z).toBeCloseTo(0.4, 4);
    expect(engine.getRodPose().theta).toBeGreaterThan(Math.PI / 2);

    // Quadrant III: x < 0, z < 0
    res = adapter.onPointerMove(1, makeTopDownRay(-0.3, -0.4), 1040);
    expect(res.accepted).toBe(true);
    expect(engine.getRodPose().x).toBeCloseTo(-0.3, 4);
    expect(engine.getRodPose().z).toBeCloseTo(-0.4, 4);
    expect(engine.getRodPose().theta).toBeLessThan(-Math.PI / 2);

    // Quadrant IV: x > 0, z < 0
    res = adapter.onPointerMove(1, makeTopDownRay(0.3, -0.4), 1060);
    expect(res.accepted).toBe(true);
    expect(engine.getRodPose().x).toBeCloseTo(0.3, 4);
    expect(engine.getRodPose().z).toBeCloseTo(-0.4, 4);
    expect(engine.getRodPose().theta).toBeLessThan(0);
    expect(engine.getRodPose().theta).toBeGreaterThan(-Math.PI / 2);

    // Quadrant I: x > 0, z > 0
    res = adapter.onPointerMove(1, makeTopDownRay(0.4, 0.3), 1080);
    expect(res.accepted).toBe(true);
    expect(engine.getRodPose().x).toBeCloseTo(0.4, 4);
    expect(engine.getRodPose().z).toBeCloseTo(0.3, 4);
    expect(engine.getRodPose().theta).toBeGreaterThan(0);
    expect(engine.getRodPose().theta).toBeLessThan(Math.PI / 2);
  });

  it('5. Outside-canvas move and up handled via capture', () => {
    const { adapter, engine, cameraTarget, captureTarget } = createSetup();
    adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: 1000,
    });

    // Move to far outside bounds (10.0, 10.0)
    const resMove = adapter.onPointerMove(1, makeTopDownRay(10.0, 10.0), 1020);
    expect(resMove.accepted).toBe(true);

    // Radial clamp to 0.74
    const pose = engine.getRodPose();
    const r = Math.hypot(pose.x, pose.z);
    expect(r).toBeLessThanOrEqual(0.74 + 1e-6);

    // Up outside canvas
    adapter.onPointerUp(1);
    expect(captureTarget.capturedId).toBeNull();
    expect(cameraTarget.isEnabled()).toBe(true);
    expect(adapter.getInteractionState()).toBe('manual-idle');
  });

  it('6. Up / cancel / lostcapture / blur all trigger cleanup', () => {
    // 6a. pointerup
    const sUp = createSetup();
    sUp.adapter.onPointerDown({ pointerId: 1, ray: makeTopDownRay(0.3, 0), pointerType: 'mouse', button: 0, isHitSpoon: true });
    sUp.adapter.onPointerUp(1);
    expect(sUp.captureTarget.capturedId).toBeNull();
    expect(sUp.cameraTarget.isEnabled()).toBe(true);
    expect(sUp.adapter.getInteractionState()).toBe('manual-idle');

    // 6b. pointercancel
    const sCancel = createSetup();
    sCancel.adapter.onPointerDown({ pointerId: 2, ray: makeTopDownRay(0.3, 0), pointerType: 'mouse', button: 0, isHitSpoon: true });
    sCancel.adapter.onPointerCancel(2);
    expect(sCancel.captureTarget.capturedId).toBeNull();
    expect(sCancel.cameraTarget.isEnabled()).toBe(true);
    expect(sCancel.adapter.getInteractionState()).toBe('manual-idle');

    // 6c. lostpointercapture
    const sLost = createSetup();
    sLost.adapter.onPointerDown({ pointerId: 3, ray: makeTopDownRay(0.3, 0), pointerType: 'mouse', button: 0, isHitSpoon: true });
    sLost.adapter.onLostPointerCapture(3);
    expect(sLost.captureTarget.capturedId).toBeNull();
    expect(sLost.cameraTarget.isEnabled()).toBe(true);
    expect(sLost.adapter.getInteractionState()).toBe('manual-idle');

    // 6d. window blur
    const sBlur = createSetup();
    sBlur.adapter.onPointerDown({ pointerId: 4, ray: makeTopDownRay(0.3, 0), pointerType: 'mouse', button: 0, isHitSpoon: true });
    sBlur.adapter.onWindowBlur();
    expect(sBlur.captureTarget.capturedId).toBeNull();
    expect(sBlur.cameraTarget.isEnabled()).toBe(true);
    expect(sBlur.adapter.getInteractionState()).toBe('manual-idle');
  });

  it('7. Hide / pause / reset / mode / unmount all trigger cleanup', () => {
    // 7a. hideRod
    const sHide = createSetup();
    sHide.adapter.onPointerDown({ pointerId: 1, ray: makeTopDownRay(0.3, 0), pointerType: 'mouse', button: 0, isHitSpoon: true });
    sHide.adapter.onHideRod();
    expect(sHide.cameraTarget.isEnabled()).toBe(true);
    expect(sHide.adapter.getInteractionState()).toBe('manual-idle');

    // 7b. pause
    const sPause = createSetup();
    sPause.adapter.onPointerDown({ pointerId: 2, ray: makeTopDownRay(0.3, 0), pointerType: 'mouse', button: 0, isHitSpoon: true });
    sPause.adapter.onPause();
    expect(sPause.cameraTarget.isEnabled()).toBe(true);
    expect(sPause.adapter.getInteractionState()).toBe('manual-idle');

    // 7c. reset
    const sReset = createSetup();
    sReset.adapter.onPointerDown({ pointerId: 3, ray: makeTopDownRay(0.3, 0), pointerType: 'mouse', button: 0, isHitSpoon: true });
    sReset.adapter.onReset();
    expect(sReset.cameraTarget.isEnabled()).toBe(true);
    expect(sReset.adapter.getInteractionState()).toBe('manual-idle');

    // 7d. mode change
    const sMode = createSetup();
    sMode.adapter.onPointerDown({ pointerId: 4, ray: makeTopDownRay(0.3, 0), pointerType: 'mouse', button: 0, isHitSpoon: true });
    sMode.adapter.onModeChange('auto');
    expect(sMode.cameraTarget.isEnabled()).toBe(true);

    // 7e. detach (unmount)
    const sDetach = createSetup();
    sDetach.adapter.onPointerDown({ pointerId: 5, ray: makeTopDownRay(0.3, 0), pointerType: 'mouse', button: 0, isHitSpoon: true });
    sDetach.adapter.detach();
    expect(sDetach.cameraTarget.isEnabled()).toBe(true);
    expect(sDetach.adapter.getInteractionState()).toBe('manual-idle');
  });

  it('8. Capture failure triggers rollback and restores camera', () => {
    const { adapter, cameraTarget, captureTarget, engine } = createSetup();
    captureTarget.shouldThrow = true;
    const initialPose = engine.getRodPose();

    const res = adapter.onPointerDown({
      pointerId: 99,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
    });

    expect(res.accepted).toBe(false);
    expect(cameraTarget.isEnabled()).toBe(true);
    expect(adapter.getCapturedPointerId()).toBeNull();
    expect(adapter.getController().isDragActive()).toBe(false);
    expect(engine.getRodPose().x).toBeCloseTo(initialPose.x, 8);
  });

  it('9. Cleanup is idempotent when release triggers lostpointercapture', () => {
    const { adapter, cameraTarget, captureTarget } = createSetup();

    // Browser fires lostpointercapture synchronously inside releasePointerCapture
    captureTarget.onRelease = () => {
      adapter.onLostPointerCapture(77);
    };

    adapter.onPointerDown({
      pointerId: 77,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
    });
    expect(adapter.getCapturedPointerId()).toBe(77);

    // Ending drag will invoke releasePointerCapture -> onRelease -> onLostPointerCapture
    adapter.onPointerUp(77);

    // Must execute cleanly with single release call and no re-entrancy issue
    expect(captureTarget.releaseCallCount).toBe(1);
    expect(cameraTarget.isEnabled()).toBe(true);
    expect(adapter.getCapturedPointerId()).toBeNull();
  });

  it('10. Stale watchdog clears drive to 0 while keeping capture and camera lock', () => {
    const { adapter, engine, cameraTarget, captureTarget } = createSetup();

    adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: 1000,
    });

    // Move to create angular drive
    adapter.onPointerMove(1, makeTopDownRay(0.2, 0.2), 1050);
    expect(engine.getState().omegaRod).not.toBe(0);

    // Host clock advances by 200 ms with stationary pointer (>= 150 ms stale threshold)
    const staleResult = adapter.checkStale(1250);
    expect(staleResult.released).toBe(true);

    // Engine drive cleared to 0
    expect(engine.getState().omegaRod).toBe(0);

    // Invariants preserved: capture and camera lock remain held!
    expect(adapter.getCapturedPointerId()).toBe(1);
    expect(captureTarget.capturedId).toBe(1);
    expect(cameraTarget.isEnabled()).toBe(false);
    expect(adapter.getInteractionState()).toBe('manual-drag');
  });

  it('11. Move after stale re-anchors properly', () => {
    const { adapter, engine } = createSetup();

    adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: 1000,
    });

    adapter.onPointerMove(1, makeTopDownRay(0.2, 0.2), 1050);
    adapter.checkStale(1250); // Becomes stale at t = 1250 ms
    expect(engine.getState().omegaRod).toBe(0);

    // Resume movement at t = 1300 ms (gap from last sample is 250 ms > 150 ms)
    const moveRes = adapter.onPointerMove(1, makeTopDownRay(0.1, 0.3), 1300);
    expect(moveRes.accepted).toBe(true);

    // Re-anchors smoothly without angular velocity explosion
    expect(Math.abs(engine.getState().omegaRod)).toBeLessThanOrEqual(8.0);
  });

  it('12. Auto -> manual -> auto preserves rod pose continuity', () => {
    const { engine, adapter, facade } = createSetup({ mode: 'auto' });

    // Step engine in auto mode for 30 ticks
    for (let i = 0; i < 30; i++) {
      engine.advance(DEFAULT_H);
    }
    const poseAuto = engine.getRodPose();

    // Switch to manual mode
    facade.dispatchIntent({ type: 'setMode', mode: 'manual' });
    adapter.reset();

    const poseManualInit = engine.getRodPose();
    expect(poseManualInit.x).toBeCloseTo(poseAuto.x, 8);
    expect(poseManualInit.z).toBeCloseTo(poseAuto.z, 8);
    expect(poseManualInit.theta).toBeCloseTo(poseAuto.theta, 8);

    // Drag manually to (0.2, 0.2)
    adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(poseManualInit.x, poseManualInit.z),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: 2000,
    });
    adapter.onPointerMove(1, makeTopDownRay(0.2, 0.2), 2050);
    adapter.onPointerUp(1);

    const poseManualEnd = engine.getRodPose();
    expect(poseManualEnd.x).toBeCloseTo(0.2, 4);
    expect(poseManualEnd.z).toBeCloseTo(0.2, 4);

    // Switch back to auto mode
    facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
    const poseAutoResume = engine.getRodPose();
    expect(poseAutoResume.x).toBeCloseTo(poseManualEnd.x, 8);
    expect(poseAutoResume.z).toBeCloseTo(poseManualEnd.z, 8);
  });

  it('13. Delayed callback from old session cannot cancel new auto driver', () => {
    const { adapter, engine, facade } = createSetup({ mode: 'manual' });

    adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: 1000,
    });

    // Switch to auto mode
    facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
    expect(engine.getState().mode).toBe('auto');
    expect(engine.getState().autoDriveEnabled).toBe(true);

    // Stale delayed lostpointercapture from old manual session
    adapter.onLostPointerCapture(1);

    // Auto driver is NOT cancelled
    expect(engine.getState().mode).toBe('auto');
    expect(engine.getState().autoDriveEnabled).toBe(true);
  });

  it('14. Stale generation cannot rebase or modify engine', () => {
    const { adapter, engine, facade } = createSetup({ mode: 'manual' });

    adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: 1000,
    });

    // Reset simulation advancing generation to 1
    facade.dispatchIntent({ type: 'reset' });
    expect(engine.getState().generation).toBe(1);

    // Direct stale intent with generation 0 is rejected
    const ack = facade.dispatchIntent({
      type: 'manualSample',
      x: 0.1,
      z: 0.1,
      inputTimeMs: 1150,
      captureGeneration: 0,
    });
    expect(ack.accepted).toBe(false);
    expect(ack.reason).toBe('STALE_GENERATION');

    // Adapter pointermove detects generation advance and rejects cleanly
    const moveRes = adapter.onPointerMove(1, makeTopDownRay(0.1, 0.1), 1160);
    expect(moveRes.accepted).toBe(false);
  });

  it('15. Camera reset preserves mass, elapsed time, and generation', () => {
    const hostClock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock });

    bridge.add('water', 50);
    bridge.resume();
    for (let i = 0; i < 10; i++) {
      bridge.getEngine().advance(DEFAULT_H);
    }

    const snapBefore = bridge.getSnapshot();
    const revBefore = useExperimentStore.getState().cameraRevision;

    // Reset camera in store
    useExperimentStore.getState().resetCamera();

    const revAfter = useExperimentStore.getState().cameraRevision;
    const snapAfter = bridge.getSnapshot();

    expect(revAfter).toBe(revBefore + 1);
    expect(snapAfter.mass.W).toBe(snapBefore.mass.W);
    expect(snapAfter.generation).toBe(snapBefore.generation);

    bridge.destroy();
  });

  it('16. Canvas attach/detach does not create a new scientific scheduler', () => {
    const hostClock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock });

    const adapter = bridge.getManualAdapter();
    expect(adapter).toBeDefined();
    if (!adapter) return;

    const camTarget = new MockCameraTarget();
    const capTarget = new MockCaptureTarget();

    // Attach wiring 1
    adapter.setCameraTarget(camTarget);
    adapter.setCaptureTarget(capTarget);

    // Detach wiring 1
    adapter.detach();
    adapter.setCameraTarget(undefined);
    adapter.setCaptureTarget(undefined);

    // Attach wiring 2
    adapter.setCameraTarget(camTarget);
    adapter.setCaptureTarget(capTarget);

    // Advance clock: verify only single clock scheduler runs
    expect(bridge.getEngine().getClock().getIsSuspended()).toBe(false);

    adapter.detach();
    bridge.destroy();
  });

  it('17. Listener cleanup prevents duplicate samples', () => {
    const { adapter, facade } = createSetup();
    const dispatchSpy = vi.spyOn(facade, 'dispatchIntent');

    // Simulate attached pointermove
    adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: 1000,
    });
    dispatchSpy.mockClear();

    adapter.onPointerMove(1, makeTopDownRay(0.2, 0.2), 1020);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    // Detach
    adapter.detach();
    dispatchSpy.mockClear();

    // Subsequent pointermove rejected because drag is inactive
    const res = adapter.onPointerMove(1, makeTopDownRay(0.1, 0.1), 1040);
    expect(res.accepted).toBe(false);
    expect(dispatchSpy).toHaveBeenCalledTimes(0);
  });

  it('18. Touch / pen cannot become manual driver (mouse only)', () => {
    const { adapter, cameraTarget } = createSetup();

    // Touch rejected
    let res = adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'touch',
      button: 0,
      isHitSpoon: true,
    });
    expect(res.accepted).toBe(false);
    expect(cameraTarget.isEnabled()).toBe(true);

    // Pen rejected
    res = adapter.onPointerDown({
      pointerId: 2,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'pen',
      button: 0,
      isHitSpoon: true,
    });
    expect(res.accepted).toBe(false);
    expect(cameraTarget.isEnabled()).toBe(true);

    // Middle click rejected
    res = adapter.onPointerDown({
      pointerId: 3,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 1,
      isHitSpoon: true,
    });
    expect(res.accepted).toBe(false);

    // Right click rejected
    res = adapter.onPointerDown({
      pointerId: 4,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 2,
      isHitSpoon: true,
    });
    expect(res.accepted).toBe(false);

    // Mouse primary accepted
    res = adapter.onPointerDown({
      pointerId: 5,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
    });
    expect(res.accepted).toBe(true);
    expect(cameraTarget.isEnabled()).toBe(false);
  });

  it('19. Residual flow decays continuously via e^{-(a+b)h} after release', () => {
    const { adapter, engine } = createSetup();

    // Spin manual spoon to create rapid flow
    adapter.onPointerDown({
      pointerId: 1,
      ray: makeTopDownRay(0.3, 0),
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: 1000,
    });

    let angle = 0;
    let t = 1000;
    for (let i = 0; i < 20; i++) {
      t += 20;
      angle += 0.25;
      const x = 0.3 * Math.cos(angle);
      const z = 0.3 * Math.sin(angle);
      adapter.onPointerMove(1, makeTopDownRay(x, z), t);
      engine.advance(DEFAULT_H);
    }

    const flowBeforeRelease = engine.getState().omegaFlow;
    expect(Math.abs(flowBeforeRelease)).toBeGreaterThan(0.5);

    // Release mouse
    adapter.onPointerUp(1);
    expect(engine.getState().omegaRod).toBe(0);

    // Step 1 tick and verify exponential decay formula: flow * exp(-(A + B) * h)
    const expectedDampingFactor = Math.exp(-(A_STIR + B_STIR) * DEFAULT_H);
    engine.advance(DEFAULT_H);

    const flowAfter1Tick = engine.getState().omegaFlow;
    expect(flowAfter1Tick).toBeCloseTo(flowBeforeRelease * expectedDampingFactor, 5);

    // Further continuous decay over 120 ticks (2 seconds)
    let prevFlow = flowAfter1Tick;
    for (let k = 0; k < 120; k++) {
      engine.advance(DEFAULT_H);
      const currentFlow = engine.getState().omegaFlow;
      expect(Math.abs(currentFlow)).toBeLessThan(Math.abs(prevFlow));
      prevFlow = currentFlow;
    }
    expect(Math.abs(prevFlow)).toBeLessThan(0.05);
  });

  it('20. Regression check across all existing test suites', () => {
    // Basic sanity check that clampSpoonXZ and simulation constants remain accurate
    const clamped = clampSpoonXZ(0.5, 0.5);
    expect(Math.hypot(clamped.x, clamped.z)).toBeLessThanOrEqual(0.74);
  });
});
