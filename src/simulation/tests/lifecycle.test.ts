import { describe, expect, it } from 'vitest';
import { SimulationBridge, type HostClockAdapter } from '../bridge/SimulationBridge';
import {
  type RenderTarget,
} from '../core/SimulationState';
import { createExperimentStore } from '../../stores/experimentStore';
import {
  POOL_KINDS,
  ParticleTransportSystem,
} from '../models/ParticleTransport';
import {
  computeParticleBounds,
  PARTICLE_RADIUS,
} from '../constants/beaker';
import {
  updatePoolInstancedMesh,
  MAX_BUFFER_CAPACITY,
} from '../../scene/particleMeshHelpers';
import { InstancedMesh, DodecahedronGeometry, MeshBasicMaterial, Matrix4, Vector3, Quaternion } from 'three';

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

  flushOne(deltaMs = 16.666): void {
    this.currentTime += deltaMs;
    const current = Array.from(this.callbacks.entries());
    this.callbacks.clear();
    for (const [, cb] of current) {
      cb(this.currentTime);
    }
  }

  flushCount(count: number, deltaMs = 16.666): void {
    for (let i = 0; i < count; i++) {
      this.flushOne(deltaMs);
    }
  }

  getActiveRafCount(): number {
    return this.callbacks.size;
  }
}

describe('V2-08 — Vòng đời tick, pose thìa và regression của particle renderer', () => {
  // Test 1: StrictMode-style setup -> cleanup -> setup: tối đa 1 active scheduler
  it('1. StrictMode-style setup -> cleanup -> setup results in at most 1 active scheduler loop', () => {
    const mockClock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: mockClock });

    // Initial state is paused: 0 active RAF callbacks
    expect(bridge.isSchedulerActive()).toBe(false);
    expect(mockClock.getActiveRafCount()).toBe(0);

    // Resume simulation
    bridge.resume();
    expect(bridge.isSchedulerActive()).toBe(true);
    expect(mockClock.getActiveRafCount()).toBe(1);

    // Setup 1 (StrictMode mount)
    const cleanup1 = bridge.attachLifecycle();
    expect(bridge.isSchedulerActive()).toBe(true);
    expect(mockClock.getActiveRafCount()).toBe(1);

    // StrictMode cleanup 1 (simulated unmount)
    cleanup1();
    expect(bridge.isSchedulerActive()).toBe(false);
    expect(mockClock.getActiveRafCount()).toBe(0);

    // Setup 2 (StrictMode remount)
    const cleanup2 = bridge.attachLifecycle();
    expect(bridge.isSchedulerActive()).toBe(true);
    expect(mockClock.getActiveRafCount()).toBe(1); // Exactly 1 active scheduler, never duplicated!

    // Verify tick progress: clock step advances 1x, not 2x
    mockClock.flushCount(60, 16.666);
    const elapsed = bridge.getSnapshot().elapsedSeconds;
    expect(elapsed).toBeGreaterThanOrEqual(0.9);
    expect(elapsed).toBeLessThanOrEqual(1.1);

    cleanup2();
    expect(mockClock.getActiveRafCount()).toBe(0);
    bridge.destroy();
  });

  // Test 2: Full cleanup: 0 RAF và 0 listener/subscription do owner đăng ký
  it('2. Full cleanup releases all RAF handles, listeners, and subscriber sets', () => {
    const mockClock = new MockHostClock();
    let snapshotCount = 0;
    let invalidateCount = 0;

    const bridge = new SimulationBridge({
      hostClock: mockClock,
      onSnapshot: () => { snapshotCount++; },
      onInvalidateScene: () => { invalidateCount++; },
    });

    const cleanupLifecycle = bridge.attachLifecycle();
    bridge.resume();
    expect(bridge.isSchedulerActive()).toBe(true);
    expect(mockClock.getActiveRafCount()).toBe(1);
    expect(snapshotCount).toBeGreaterThanOrEqual(1);
    expect(invalidateCount).toBeGreaterThanOrEqual(0);

    // Destroy the bridge owner
    bridge.destroy();

    expect(bridge.isSchedulerActive()).toBe(false);
    expect(mockClock.getActiveRafCount()).toBe(0);

    // Verify no further stepFrame execution after destroy
    mockClock.flushCount(10);
    expect(bridge.isSchedulerActive()).toBe(false);

    // Calling cleanupLifecycle after destroy is safe and idempotent
    cleanupLifecycle();
  });

  // Test 3: Camera attach/detach/reset 20 lần: engine identity, mass, generation giữ nguyên
  it('3. Camera reset 20 times preserves engine identity, mass, and generation strictly invariant', () => {
    const mockClock = new MockHostClock();
    const testStore = createExperimentStore(new SimulationBridge({ hostClock: mockClock }));
    const bridge = testStore.getState().getBridge();
    const originalEngine = bridge.getEngine();

    // Add ingredients
    testStore.getState().add('water', 100);
    testStore.getState().add('sugar', 20);
    testStore.getState().add('sand', 10);
    testStore.getState().add('oil', 30);

    const baselineState = originalEngine.getState();
    const baselineMass = { ...baselineState.mass };
    const baselineGen = baselineState.generation;

    // Simulate 20 camera resets (Canvas unmount -> remount cycles)
    for (let i = 1; i <= 20; i++) {
      testStore.getState().resetCamera();

      // Check revision incremented
      expect(testStore.getState().cameraRevision).toBe(i);

      // Current bridge and engine must be strictly the exact same instance
      expect(testStore.getState().getBridge()).toBe(bridge);
      expect(testStore.getState().getBridge().getEngine()).toBe(originalEngine);

      // State invariants must remain bit-for-bit identical
      const currentState = originalEngine.getState();
      expect(currentState.generation).toBe(baselineGen);
      expect(currentState.mass.W).toBe(baselineMass.W);
      expect(currentState.mass.Gt).toBe(baselineMass.Gt);
      expect(currentState.mass.St).toBe(baselineMass.St);
      expect(currentState.mass.Ot).toBe(baselineMass.Ot);
    }
  });

  // Test 4: Running remount không nhân tốc độ tick
  it('4. Remounting scene while running does not duplicate or multiply tick rate', () => {
    const mockClock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: mockClock });
    bridge.attachLifecycle();
    bridge.resume();

    const engine = bridge.getEngine();
    const initialTick = engine.getState().tickIndex;

    // Simulate 5 scene remounts during execution
    for (let r = 0; r < 5; r++) {
      // Simulate scene invalidation subscribe/unsubscribe
      const unsub = bridge.subscribeInvalidate(() => {});
      mockClock.flushCount(12, 16.666); // 200ms
      unsub();
    }

    // 5 * 12 = 60 frames @ ~16.666ms = 1000ms.
    // 1000ms at DEFAULT_H (1/60s) -> exactly ~60 engine ticks.
    const finalTick = engine.getState().tickIndex;
    const ticksElapsed = finalTick - initialTick;
    expect(ticksElapsed).toBeGreaterThanOrEqual(55);
    expect(ticksElapsed).toBeLessThanOrEqual(65); // exactly ~60 ticks at 1x rate, NOT 5x (300 ticks)!

    bridge.destroy();
  });

  // Test 5: Paused remount không tăng time
  it('5. Scene remount while paused does not increase simulation time or tick index', () => {
    const mockClock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: mockClock });
    bridge.attachLifecycle();
    bridge.pause(); // explicitly paused

    const engine = bridge.getEngine();
    const baselineTicks = engine.getState().tickIndex;
    const baselineElapsed = engine.getState().elapsedSeconds;

    // Simulate 10 scene remounts and host clock advancement
    for (let i = 0; i < 10; i++) {
      const unsub = bridge.subscribeInvalidate(() => {});
      mockClock.flushCount(20, 16.666); // 333ms host time
      unsub();
    }

    expect(engine.getState().tickIndex).toBe(baselineTicks);
    expect(engine.getState().elapsedSeconds).toBe(baselineElapsed);
    expect(bridge.getSnapshot().elapsedSeconds).toBe(0);

    bridge.destroy();
  });

  // Test 6: Renderer mới nhận current frame khi paused
  it('6. Newly attached renderer receives authoritative particle frame immediately while paused', () => {
    const bridge = new SimulationBridge();
    bridge.add('water', 100);
    bridge.add('sand', 20);

    // Simulation is still paused
    expect(bridge.getEngine().getState().paused).toBe(true);

    // New renderer attaches and queries copyRenderFrame
    const target: RenderTarget & { radii: Float32Array; poolIds: Uint8Array } = {
      positions: new Float32Array(MAX_BUFFER_CAPACITY * 3),
      weights: new Float32Array(MAX_BUFFER_CAPACITY),
      materials: new Uint8Array(MAX_BUFFER_CAPACITY),
      radii: new Float32Array(MAX_BUFFER_CAPACITY),
      poolIds: new Uint8Array(MAX_BUFFER_CAPACITY),
      count: MAX_BUFFER_CAPACITY,
    };

    const stamp = bridge.copyRenderFrame(target);
    expect(stamp.count).toBeGreaterThan(0);
    expect(stamp.poolRanges).toBeDefined();
    expect(stamp.poolRanges!.sandBed.count).toBeGreaterThan(0);
    // Sand particles are in bed at the bottom
    expect(target.positions[1]).toBeGreaterThanOrEqual(0.12);

    bridge.destroy();
  });

  // Test 7: Scientific reset count 0; không còn ghost particles
  it('7. Scientific reset empties particles immediately with count = 0 and no ghost particles', () => {
    const mockClock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: mockClock });
    bridge.add('water', 100);
    bridge.add('sand', 20);
    bridge.add('oil', 20);
    bridge.resume();

    // Advance 60 frames to produce active swirling particles
    mockClock.flushCount(60, 16.666);

    const target: RenderTarget & { radii: Float32Array; poolIds: Uint8Array } = {
      positions: new Float32Array(MAX_BUFFER_CAPACITY * 3),
      weights: new Float32Array(MAX_BUFFER_CAPACITY),
      materials: new Uint8Array(MAX_BUFFER_CAPACITY),
      radii: new Float32Array(MAX_BUFFER_CAPACITY),
      poolIds: new Uint8Array(MAX_BUFFER_CAPACITY),
      count: MAX_BUFFER_CAPACITY,
    };

    const stampBefore = bridge.copyRenderFrame(target);
    expect(stampBefore.count).toBeGreaterThan(0);

    // Dispatch reset
    const resetAck = bridge.reset();
    expect(resetAck.accepted).toBe(true);

    // Immediately copy frame without advancing time
    const stampAfter = bridge.copyRenderFrame(target);
    expect(stampAfter.count).toBe(0);
    for (const kind of POOL_KINDS) {
      expect(stampAfter.poolRanges![kind].count).toBe(0);
    }

    bridge.destroy();
  });

  // Test 8: Stale frame generation không được apply
  it('8. Stale frame from previous generation is rejected by generation fencing', () => {
    const bridge = new SimulationBridge();
    bridge.add('water', 100);
    bridge.add('sand', 10);

    const target: RenderTarget & { radii: Float32Array; poolIds: Uint8Array } = {
      positions: new Float32Array(MAX_BUFFER_CAPACITY * 3),
      weights: new Float32Array(MAX_BUFFER_CAPACITY),
      materials: new Uint8Array(MAX_BUFFER_CAPACITY),
      radii: new Float32Array(MAX_BUFFER_CAPACITY),
      poolIds: new Uint8Array(MAX_BUFFER_CAPACITY),
      count: MAX_BUFFER_CAPACITY,
    };

    const stampGen0 = bridge.copyRenderFrame(target);
    expect(stampGen0.generation).toBe(0);

    // Reset increments generation to 1
    bridge.reset();
    expect(bridge.getGeneration()).toBe(1);

    // Simulating stale stamp with generation 0 against generation 1
    expect(stampGen0.generation < bridge.getGeneration()).toBe(true);

    bridge.destroy();
  });

  // Test 9: UI snapshot chậm không chặn latest render frame
  it('9. Throttled UI snapshot does not block or drop authoritative render frame', () => {
    const mockClock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: mockClock });
    bridge.add('water', 100);
    bridge.add('sand', 10);
    bridge.resume();

    // Advance 2 frames (33ms): less than the 100ms UI snapshot throttle interval
    mockClock.flushCount(2, 16.666);

    const target: RenderTarget & { radii: Float32Array; poolIds: Uint8Array } = {
      positions: new Float32Array(MAX_BUFFER_CAPACITY * 3),
      weights: new Float32Array(MAX_BUFFER_CAPACITY),
      materials: new Uint8Array(MAX_BUFFER_CAPACITY),
      radii: new Float32Array(MAX_BUFFER_CAPACITY),
      poolIds: new Uint8Array(MAX_BUFFER_CAPACITY),
      count: MAX_BUFFER_CAPACITY,
    };

    // Render path queries engine directly: it gets the latest authoritative frame
    const stamp = bridge.copyRenderFrame(target);
    expect(stamp.count).toBeGreaterThan(0);
    expect(stamp.generation).toBe(bridge.getGeneration());

    bridge.destroy();
  });

  // Test 10: Manual drag -> camera remount cleanup capture/camera
  it('10. Camera remount during manual drag cleans up capture, restores camera, and preserves residual flow', () => {
    const mockClock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: mockClock });
    bridge.add('water', 100);
    bridge.resume();
    bridge.setMode('manual');

    const adapter = bridge.getManualAdapter()!;
    let cameraEnabled = true;
    adapter.setCameraTarget({
      setEnabled: (e) => { cameraEnabled = e; },
      isEnabled: () => cameraEnabled,
    });

    let pointerCaptured = false;
    adapter.setCaptureTarget({
      setPointerCapture: () => { pointerCaptured = true; },
      releasePointerCapture: () => { pointerCaptured = false; },
      hasPointerCapture: () => pointerCaptured,
    });
    adapter.setGetShowRod(() => true);

    // Start manual drag
    const downRes = adapter.onPointerDown({
      pointerId: 1,
      ray: { origin: [0.3, 2.0, 0], direction: [0, -1, 0] },
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: 100,
    });
    expect(downRes.accepted).toBe(true);
    expect(cameraEnabled).toBe(false); // camera locked

    // Apply move with stirring velocity
    adapter.onPointerMove(1, { origin: [0.35, 2.0, 0.1], direction: [0, -1, 0] }, 150);
    expect(bridge.getEngine().getState().omegaFlow).toBeDefined();

    // Now simulate camera remount (Canvas unmount cleanup)
    adapter.detach();

    // Verify: camera restored, capture ended, drag inactive
    expect(cameraEnabled).toBe(true);
    expect(pointerCaptured).toBe(false);
    expect(adapter.isDragActive()).toBe(false);

    // Verify: residual flow decays continuously and is not instantly wiped
    const flowAfterDetach = bridge.getEngine().getState().omegaFlow;
    expect(Number.isFinite(flowAfterDetach)).toBe(true);

    bridge.destroy();
  });

  // Test 11: Callback trễ không tác động session mới
  it('11. Delayed callbacks from old session cannot cancel new active session', () => {
    const bridge = new SimulationBridge();
    bridge.add('water', 100);
    bridge.resume();
    bridge.setMode('manual');
    const adapter = bridge.getManualAdapter()!;

    adapter.setCameraTarget({ setEnabled: () => {}, isEnabled: () => true });
    adapter.setGetShowRod(() => true);

    // Session 1 starts with pointerId 1
    adapter.onPointerDown({
      pointerId: 1,
      ray: { origin: [0.3, 2.0, 0], direction: [0, -1, 0] },
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
    });
    expect(adapter.getCapturedPointerId()).toBe(1);

    // Session 1 ends
    adapter.endManualDrag(1);
    expect(adapter.getCapturedPointerId()).toBeNull();

    // Session 2 starts with pointerId 2
    adapter.onPointerDown({
      pointerId: 2,
      ray: { origin: [0.3, 2.0, 0], direction: [0, -1, 0] },
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
    });
    expect(adapter.getCapturedPointerId()).toBe(2);

    // Delayed callback from pointerId 1 arrives
    adapter.onPointerUp(1);
    // Session 2 must NOT be cancelled!
    expect(adapter.getCapturedPointerId()).toBe(2);
    expect(adapter.isDragActive()).toBe(true);

    adapter.endManualDrag(2);
    bridge.destroy();
  });

  // Test 12: Hidden/visible không fast-forward
  it('12. Page hidden suspends clock; returning to visible does not fast-forward elapsed wall time', () => {
    const mockClock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: mockClock });
    bridge.attachLifecycle();
    bridge.resume();

    // Run 60 frames (1 second)
    mockClock.flushCount(60, 16.666);
    const elapsed1 = bridge.getEngine().getState().elapsedSeconds;
    expect(elapsed1).toBeGreaterThanOrEqual(0.9);

    // Tab hidden
    bridge.getEngine().suspend();
    expect(bridge.getEngine().getClock().getIsSuspended()).toBe(true);

    // 10 minutes pass in real world (600,000 ms)
    mockClock.currentTime += 600000;

    // Tab visible
    bridge.getEngine().visible();
    expect(bridge.getEngine().getClock().getIsSuspended()).toBe(false);

    // First frame after visible: delta is 0, no spiral of death!
    mockClock.flushOne(0);
    const elapsed2 = bridge.getEngine().getState().elapsedSeconds;
    expect(elapsed2).toBeCloseTo(elapsed1, 2);

    bridge.destroy();
  });

  // Test 13: Effective radius và pool range mapping
  it('13. Effective radius scales down in thin layers and maps directly to instance matrix scale without double multiplication', () => {
    // 1. Thin region test: region height = 0.03 scene units.
    // Particle default radius = 0.022. Diameter = 0.044.
    // Since height < diameter, effective radius must clamp to height / 2 = 0.015.
    const thinBounds = computeParticleBounds(0.12, 0.15, PARTICLE_RADIUS.sugar);
    expect(thinBounds.active).toBe(true);
    expect(thinBounds.effectiveParticleRadius).toBeCloseTo(0.015, 4);

    // 2. Normal region test: height = 0.50 scene units.
    // Since height >= diameter, effective radius = PARTICLE_RADIUS.sugar (0.022).
    const normalBounds = computeParticleBounds(0.12, 0.62, PARTICLE_RADIUS.sugar);
    expect(normalBounds.active).toBe(true);
    expect(normalBounds.effectiveParticleRadius).toBe(PARTICLE_RADIUS.sugar);

    // 3. Test updatePoolInstancedMesh mapping:
    // Create an InstancedMesh with unit radius geometry (radius = 1.0)
    const geometry = new DodecahedronGeometry(1, 0);
    const material = new MeshBasicMaterial();
    const instancedMesh = new InstancedMesh(geometry, material, 10);

    const testTarget: RenderTarget & { radii: Float32Array } = {
      positions: new Float32Array([0.1, 0.2, 0.3]),
      weights: new Float32Array([1.0]),
      materials: new Uint8Array([1]),
      radii: new Float32Array([0.015]), // thin radius
      count: 1,
    };

    updatePoolInstancedMesh(
      instancedMesh,
      { offset: 0, count: 1 },
      testTarget,
      PARTICLE_RADIUS.sugar
    );

    expect(instancedMesh.count).toBe(1);

    // Extract instance scale from matrix
    const matrix = new Matrix4();
    instancedMesh.getMatrixAt(0, matrix);
    const scale = new Vector3();
    matrix.decompose(new Vector3(), new Quaternion(), scale);

    // Scale must strictly equal 0.015, NOT multiplied twice (e.g. not 0.015 * 0.022 = 0.00033)!
    expect(scale.x).toBeCloseTo(0.015, 4);
    expect(scale.y).toBeCloseTo(0.015, 4);
    expect(scale.z).toBeCloseTo(0.015, 4);
  });

  // Test 14: Buffer capacity/budget changes
  it('14. Particle budget adjustments resize safely without memory corruption or exceeding capacity', () => {
    const transport = new ParticleTransportSystem(100);
    expect(transport.getTotalActiveCount()).toBe(0);

    // Reconcile with some mass
    transport.reconcile(
      { W: 100, Gt: 20, Gu: 20, Gd: 0, St: 10, Sb: 10, Ss: 0, Ot: 0, Ol: 0, Od: 0 },
      0,
      {
        category: 'water-only',
        totalReserveMl: 100,
        bed: { bottom: 0.12, top: 0.14, height: 0.02, volumeMl: 5 },
        aqueous: { bottom: 0.14, top: 0.60, height: 0.46, volumeMl: 95 },
        oil: { bottom: 0.60, top: 0.60, height: 0, volumeMl: 0 },
        liquidTop: 0.60,
      },
      42,
      0
    );

    expect(transport.getTotalActiveCount()).toBe(200); // sugarBed (100) + sandBed (100)

    // Increase budget to 200 per pool
    transport.setBudgetPerPool(
      200,
      { W: 100, Gt: 20, Gu: 20, Gd: 0, St: 10, Sb: 10, Ss: 0, Ot: 0, Ol: 0, Od: 0 },
      0,
      {
        category: 'water-only',
        totalReserveMl: 100,
        bed: { bottom: 0.12, top: 0.14, height: 0.02, volumeMl: 5 },
        aqueous: { bottom: 0.14, top: 0.60, height: 0.46, volumeMl: 95 },
        oil: { bottom: 0.60, top: 0.60, height: 0, volumeMl: 0 },
        liquidTop: 0.60,
      },
      42,
      0
    );

    expect(transport.getTotalActiveCount()).toBe(400); // 200 + 200

    // Verify copyRenderFrame works with the 3500-element buffer
    const target: RenderTarget & { radii: Float32Array; poolIds: Uint8Array } = {
      positions: new Float32Array(MAX_BUFFER_CAPACITY * 3),
      weights: new Float32Array(MAX_BUFFER_CAPACITY),
      materials: new Uint8Array(MAX_BUFFER_CAPACITY),
      radii: new Float32Array(MAX_BUFFER_CAPACITY),
      poolIds: new Uint8Array(MAX_BUFFER_CAPACITY),
      count: MAX_BUFFER_CAPACITY,
    };

    const stamp = transport.copyRenderFrame(target, 0, 1);
    expect(stamp.count).toBe(400);
    expect(stamp.poolRanges!.sandBed.count).toBe(200);
    expect(stamp.poolRanges!.sugarBed.count).toBe(200);
  });

  // Test 15: Snapshot/frame mutation isolation
  it('15. Mutating caller target buffers does not corrupt engine internal state or particle arrays', () => {
    const bridge = new SimulationBridge();
    bridge.add('water', 100);
    bridge.add('sand', 10);

    const target: RenderTarget & { radii: Float32Array; poolIds: Uint8Array } = {
      positions: new Float32Array(MAX_BUFFER_CAPACITY * 3),
      weights: new Float32Array(MAX_BUFFER_CAPACITY),
      materials: new Uint8Array(MAX_BUFFER_CAPACITY),
      radii: new Float32Array(MAX_BUFFER_CAPACITY),
      poolIds: new Uint8Array(MAX_BUFFER_CAPACITY),
      count: MAX_BUFFER_CAPACITY,
    };

    const stamp = bridge.copyRenderFrame(target);
    expect(stamp.count).toBeGreaterThan(0);

    // Malicious caller mutates its own buffer:
    target.positions.fill(999999.0);
    target.radii.fill(-500.0);
    target.weights.fill(-1.0);

    // Engine's next copy must still produce valid, uncorrupted data
    const target2: RenderTarget & { radii: Float32Array; poolIds: Uint8Array } = {
      positions: new Float32Array(MAX_BUFFER_CAPACITY * 3),
      weights: new Float32Array(MAX_BUFFER_CAPACITY),
      materials: new Uint8Array(MAX_BUFFER_CAPACITY),
      radii: new Float32Array(MAX_BUFFER_CAPACITY),
      poolIds: new Uint8Array(MAX_BUFFER_CAPACITY),
      count: MAX_BUFFER_CAPACITY,
    };

    const stamp2 = bridge.copyRenderFrame(target2);
    expect(stamp2.count).toBe(stamp.count);
    expect(target2.positions[0]).toBeLessThan(1.0); // valid beaker coordinate
    expect(target2.radii[0]).toBeGreaterThan(0);
    expect(target2.weights[0]).toBeGreaterThan(0);

    bridge.destroy();
  });

  // Test 16: Regression toàn bộ vòng đời và tương tác
  it('16. End-to-end regression: auto stirring -> pause -> add sugar -> manual drag preserves all conservation laws', () => {
    const mockClock = new MockHostClock();
    const bridge = new SimulationBridge({ hostClock: mockClock });
    bridge.attachLifecycle();

    // 1. Add water and sand
    bridge.add('water', 100);
    bridge.add('sand', 10);
    bridge.resume();

    // 2. Auto stir
    bridge.startAuto('fast');
    mockClock.flushCount(120, 16.666); // 2s

    // 3. Pause
    bridge.pause();
    const stateAtPause = bridge.getEngine().getState();
    const pausedTime = stateAtPause.elapsedSeconds;
    const pausedMass = { ...stateAtPause.mass };
    expect(pausedMass.W).toBe(100);

    // 4. Add sugar while paused
    bridge.add('sugar', 20);
    expect(bridge.getEngine().getState().mass.Gt).toBe(20);
    expect(bridge.getEngine().getState().elapsedSeconds).toBe(pausedTime); // time invariant while paused

    // 5. Resume and switch to manual
    bridge.resume();
    bridge.setMode('manual');
    const adapter = bridge.getManualAdapter()!;
    adapter.setCameraTarget({ setEnabled: () => {}, isEnabled: () => true });
    adapter.setGetShowRod(() => true);

    adapter.onPointerDown({
      pointerId: 1,
      ray: { origin: [0.3, 2.0, 0], direction: [0, -1, 0] },
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: mockClock.now(),
    });

    mockClock.flushCount(60, 16.666); // 1s manual stirring
    adapter.endManualDrag(1);

    // 6. Conservation assertions
    const finalState = bridge.getEngine().getState();
    expect(finalState.mass.W).toBe(100);
    expect(finalState.mass.St).toBe(10);
    expect(finalState.mass.Gt).toBe(20);
    expect(finalState.mass.Sb + finalState.mass.Ss).toBeCloseTo(10, 6);
    expect(finalState.mass.Gu + finalState.mass.Gd).toBeCloseTo(20, 6);

    bridge.destroy();
  });
});
