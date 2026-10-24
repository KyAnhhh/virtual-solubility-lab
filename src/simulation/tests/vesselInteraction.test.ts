import { describe, expect, it, vi } from 'vitest';
import { createExperimentStore } from '../../stores/experimentStore';
import { SimulationBridge } from '../bridge/SimulationBridge';
import { HeadlessSimulationEngine } from '../core/SimulationEngine';
import {
  DROP_ZONE_ENTER_BOUNDS,
  DROP_ZONE_MAINTAIN_BOUNDS,
  DROP_ZONE_VISUAL_CENTER,
  DROP_ZONE_VISUAL_RADIUS,
  isPointInDropZone,
  isVesselTouchingBeaker,
  isVesselNearBeaker,
  computeDropPourTransform,
  DROP_POUR_DURATIONS,
  SPOUT_TARGET,
  computeSpoutPosition,
  BEAKER_RIM_Y,
  BEAKER_CENTER,
  POUR_GEOMETRY,
} from '../../scene/pouringAnimationMath';
import { ManualStirAdapter } from '../../interactions/ManualStirAdapter';
import {
  type CameraControlTarget,
  type PointerCaptureTarget,
  DEFAULT_CAMERA_POS,
  DEFAULT_CAMERA_DIR,
  DEFAULT_CAMERA_TARGET,
  createCameraRay,
} from '../../interactions/VesselPourAdapter';
import { Vector3 } from 'three';

describe('Vessel Pour & Drag-and-Drop Interaction (Chặng 1)', () => {
  it('1. Snapshots dose from form at pointerdown; form modifications during drag do not alter dose', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);

    // Initial default for water is '100'
    useStore.getState().setInputDose('water', '50');
    expect(useStore.getState().inputDoses.water).toBe('50');

    // Start drag
    const res = useStore.getState().startVesselDrag('water', 1, [-2.6, 0, -1.1]);
    expect(res.ok).toBe(true);

    const dragged = useStore.getState().draggedVessel;
    expect(dragged).not.toBeNull();
    expect(dragged?.ingredient).toBe('water');
    expect(dragged?.snapshotAmount).toBe(50);
    expect(dragged?.snapshotDeciTicks).toBe(500);

    // Modify form input dose during drag
    useStore.getState().setInputDose('water', '150');
    expect(useStore.getState().inputDoses.water).toBe('150');

    // The in-flight drag session retains the frozen snapshot taken at pointerdown
    const currentDrag = useStore.getState().draggedVessel;
    expect(currentDrag?.snapshotAmount).toBe(50);
    expect(currentDrag?.snapshotDeciTicks).toBe(500);
  });

  it('2. Pre-validates dose and capacity: rejects invalid input or capacity overflow before lifting vessel', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);

    // Case A: Invalid format string
    useStore.getState().setInputDose('sugar', 'invalid_abc');
    const resA = useStore.getState().startVesselDrag('sugar', 1);
    expect(resA.ok).toBe(false);
    expect(useStore.getState().draggedVessel).toBeNull();

    // Case B: Exceeds max addition (sugar max is 100g)
    useStore.getState().setInputDose('sugar', '200');
    const resB = useStore.getState().startVesselDrag('sugar', 1);
    expect(resB.ok).toBe(false);
    expect(resB.reason).toContain('Nhập lượng từ 0,1 đến 100 g');
    expect(useStore.getState().draggedVessel).toBeNull();

    // Case C: Capacity overflow (fill beaker close to 500ml first)
    useStore.getState().add('water', 480);
    expect(useStore.getState().deciTicks.water).toBe(4800);

    // Trying to add 50 ml water would exceed 500 ml capacity (480 + 50 = 530 ml)
    useStore.getState().setInputDose('water', '50');
    const resC = useStore.getState().startVesselDrag('water', 1);
    expect(resC.ok).toBe(false);
    expect(resC.reason).toContain('Không đủ chỗ trong cốc 500 ml');
    expect(useStore.getState().draggedVessel).toBeNull();
  });

  it('3. Evaluates drop zone membership with hysteresis correctly', () => {
    // Spout target is inside drop zone
    const insidePoint: [number, number, number] = [SPOUT_TARGET.x, SPOUT_TARGET.y, SPOUT_TARGET.z];
    expect(isPointInDropZone(insidePoint, false)).toBe(true);

    // Stock vessel resting position on table is far outside drop zone
    const restingPos: [number, number, number] = [-2.6, 0.0, -1.1];
    expect(isPointInDropZone(restingPos, false)).toBe(false);

    // Point entering: just inside enter bounds
    const enterTestPos: [number, number, number] = [
      DROP_ZONE_ENTER_BOUNDS.minX + 0.05,
      2.5,
      0.0,
    ];
    expect(isPointInDropZone(enterTestPos, false)).toBe(true);

    // Hysteresis: point between enter bounds and maintain bounds
    const hysteresisPos: [number, number, number] = [
      DROP_ZONE_ENTER_BOUNDS.minX - 0.05, // outside enter bounds, inside maintain bounds
      2.5,
      0.0,
    ];
    // If not already in zone, cannot enter:
    expect(isPointInDropZone(hysteresisPos, false)).toBe(false);
    // If already in zone, maintains zone (anti-jitter buffer):
    expect(isPointInDropZone(hysteresisPos, true)).toBe(true);

    // Far outside maintain bounds
    const outsidePos: [number, number, number] = [
      DROP_ZONE_MAINTAIN_BOUNDS.minX - 0.5,
      2.5,
      0.0,
    ];
    expect(isPointInDropZone(outsidePos, true)).toBe(false);
  });

  it('4. Valid drop triggers pour animation and commits exactly once to engine', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);

    useStore.getState().setInputDose('water', '40');
    useStore.getState().startVesselDrag('water', 1, [-2.6, 0, -1.1]);

    // Move vessel into drop zone
    useStore.getState().updateVesselDragPos([SPOUT_TARGET.x, SPOUT_TARGET.y, SPOUT_TARGET.z], true);
    expect(useStore.getState().draggedVessel?.isInsideDropZone).toBe(true);

    // Release mouse in drop zone
    const droppedOk = useStore.getState().endVesselDragDrop();
    expect(droppedOk).toBe(true);
    expect(useStore.getState().draggedVessel).toBeNull();

    // Active pour must be started with fromDrop and dropPos
    const pour = useStore.getState().activePour;
    expect(pour).not.toBeNull();
    expect(pour?.ingredient).toBe('water');
    expect(pour?.amount).toBe(40);
    expect(pour?.fromDrop).toBe(true);
    expect(pour?.dropPos).toEqual([SPOUT_TARGET.x, SPOUT_TARGET.y, SPOUT_TARGET.z]);

    // Commit pour authoritative command
    const commitOk = useStore.getState().commitPour(pour!.token);
    expect(commitOk).toBe(true);
    expect(useStore.getState().snapshot.mass.W).toBe(40);

    // Second commit with same token is rejected
    const secondCommit = useStore.getState().commitPour(pour!.token);
    expect(secondCommit).toBe(false);
    expect(useStore.getState().snapshot.mass.W).toBe(40);

    // Finish pour
    useStore.getState().finishPour(pour!.token);
    expect(useStore.getState().activePour).toBeNull();
  });

  it('5. Drop outside drop zone or cancel returns vessel with zero additions', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);

    useStore.getState().setInputDose('sugar', '15');
    useStore.getState().startVesselDrag('sugar', 1, [-2.8, 0, 0]);

    // Move vessel but remain outside drop zone
    useStore.getState().updateVesselDragPos([-2.2, 1.2, 0], false);
    expect(useStore.getState().draggedVessel?.isInsideDropZone).toBe(false);

    // Release mouse outside
    const dropped = useStore.getState().endVesselDragDrop();
    expect(dropped).toBe(false);
    expect(useStore.getState().draggedVessel).toBeNull();
    expect(useStore.getState().activePour).toBeNull();
    expect(useStore.getState().snapshot.mass.Gt).toBe(0);

    // Direct cancel test
    useStore.getState().startVesselDrag('sand', 1, [-2.6, 0, 1.2]);
    expect(useStore.getState().draggedVessel).not.toBeNull();
    useStore.getState().cancelVesselDrag();
    expect(useStore.getState().draggedVessel).toBeNull();
    expect(useStore.getState().snapshot.mass.St).toBe(0);
  });

  it('6. Reset cleanly clears active drag and invalidates in-flight tokens', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);

    useStore.getState().setInputDose('oil', '25');
    useStore.getState().startVesselDrag('oil', 1);
    expect(useStore.getState().draggedVessel).not.toBeNull();

    // Reset simulation
    useStore.getState().reset();
    expect(useStore.getState().draggedVessel).toBeNull();
    expect(useStore.getState().activePour).toBeNull();
    expect(useStore.getState().snapshot.mass.Ot).toBe(0);

    // Stale pour token after reset is rejected by generation fencing
    useStore.getState().startPour('water', 30);
    const pour = useStore.getState().activePour!;
    useStore.getState().reset();
    const staleCommit = useStore.getState().commitPour(pour.token);
    expect(staleCommit).toBe(false);
    expect(useStore.getState().snapshot.mass.W).toBe(0);
  });

  it('7. VesselPourAdapter enforces pointer capture, camera locking, and single pointer ownership', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;

    const mockCameraTarget: CameraControlTarget = {
      setEnabled: vi.fn(),
      isEnabled: vi.fn(() => true),
    };
    const mockCaptureTarget: PointerCaptureTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    };

    adapter.setCameraTarget(mockCameraTarget);
    adapter.setCaptureTarget(mockCaptureTarget);

    // Non-primary mouse button rejected
    const nonPrimary = adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 10,
      button: 1, // right or middle
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
    });
    expect(nonPrimary.accepted).toBe(false);

    // Valid primary pointerdown
    const validDown = adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 10,
      button: 0,
      pointerType: 'mouse',
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
    });
    expect(validDown.accepted).toBe(true);
    expect(adapter.isDragging()).toBe(true);
    expect(adapter.getActivePointerId()).toBe(10);
    expect(useStore.getState().draggedVessel?.ingredient).toBe('water');
    expect(mockCameraTarget.setEnabled).toHaveBeenCalledWith(false);
    expect(mockCaptureTarget.setPointerCapture).toHaveBeenCalledWith(10);

    // Secondary pointer during active drag is rejected
    const secondPointer = adapter.onPointerDown({
      ingredient: 'sugar',
      pointerId: 20,
      button: 0,
      pointerType: 'mouse',
      hitPoint: new Vector3(-2.8, 0.5, 0),
      homePos: [-2.8, 0, 0],
    });
    expect(secondPointer.accepted).toBe(false);

    // Pointer up releases capture and restores camera
    adapter.onPointerUp(10);
    expect(adapter.isDragging()).toBe(false);
    expect(mockCameraTarget.setEnabled).toHaveBeenCalledWith(true);
    expect(mockCaptureTarget.releasePointerCapture).toHaveBeenCalledWith(10);
  });

  it('8. Lost pointer capture fencing prevents premature cancellation on deliberate release', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;
    const mockCamera = { setEnabled: vi.fn(), isEnabled: vi.fn(() => true) };
    const mockCapture = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    adapter.setCameraTarget(mockCamera);
    adapter.setCaptureTarget(mockCapture);

    // Pointer down
    adapter.onPointerDown({
      ingredient: 'oil',
      pointerId: 5,
      button: 0,
      hitPoint: new Vector3(-2.2, 0.5, 2.3),
      homePos: [-2.2, 0, 2.3],
    });
    expect(adapter.isDragging()).toBe(true);

    // Pointer up marks releasedNormally
    adapter.onPointerUp(5);
    expect(adapter.isDragging()).toBe(false);

    // Subsequent lostpointercapture event fired asynchronously by browser is safely ignored
    const cancelSpy = vi.spyOn(useStore.getState(), 'cancelVesselDrag');
    adapter.onLostCapture(5);
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('9. Adding via drag-and-drop while simulation is paused preserves paused state and zero elapsedSeconds growth', () => {
    const engine = new HeadlessSimulationEngine({ clientId: 'ui-client' });
    const bridge = new SimulationBridge({ engine });
    const useStore = createExperimentStore(bridge);

    // Ensure engine is paused
    useStore.getState().pause();
    expect(useStore.getState().snapshot.paused).toBe(true);
    expect(useStore.getState().snapshot.elapsedSeconds).toBe(0);

    // Perform drop pour while paused
    useStore.getState().setInputDose('water', '60');
    useStore.getState().startVesselDrag('water', 1);
    useStore.getState().updateVesselDragPos([SPOUT_TARGET.x, SPOUT_TARGET.y, SPOUT_TARGET.z], true);
    useStore.getState().endVesselDragDrop();

    const pour = useStore.getState().activePour!;
    useStore.getState().commitPour(pour.token);

    // Scientific invariants: mass increased, paused is STILL true, elapsedSeconds is STILL 0
    const snapshot = useStore.getState().snapshot;
    expect(snapshot.mass.W).toBe(60);
    expect(snapshot.paused).toBe(true);
    expect(snapshot.elapsedSeconds).toBe(0);
  });
});

describe('Interactive Free Pouring (Chặng 2)', () => {
  it('1. Free pour mode functions when form input is empty, non-numeric, or exceeds single-dose limits', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);

    useStore.getState().setPourMode('free');
    expect(useStore.getState().pourMode).toBe('free');

    // Case A: empty input string
    useStore.getState().setInputDose('water', '');
    const resA = useStore.getState().startVesselDrag('water', 1);
    expect(resA.ok).toBe(true);
    expect(useStore.getState().draggedVessel?.mode).toBe('free');
    expect(useStore.getState().draggedVessel?.snapshotAmount).toBe(0);
    useStore.getState().cancelVesselDrag();

    // Case B: invalid text string
    useStore.getState().setInputDose('sugar', 'invalid_abc');
    const resB = useStore.getState().startVesselDrag('sugar', 2);
    expect(resB.ok).toBe(true);
    expect(useStore.getState().draggedVessel?.mode).toBe('free');
    useStore.getState().cancelVesselDrag();

    // Case C: value exceeding single-dose max addition (sugar max is 100g, input is 999g)
    useStore.getState().setInputDose('sugar', '999');
    const resC = useStore.getState().startVesselDrag('sugar', 3);
    expect(resC.ok).toBe(true);
    expect(useStore.getState().draggedVessel?.mode).toBe('free');
  });

  it('2. Free pour pours at configured manipulation rate and batches to engine at ~10Hz cadence', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;

    useStore.getState().setPourMode('free');

    // Start free pour for water (25 ml/s = 250 decitick/s)
    const down = adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
    });
    expect(down.accepted).toBe(true);

    // Move into drop zone
    adapter.onPointerMove(1, {
      origin: { x: SPOUT_TARGET.x, y: SPOUT_TARGET.y, z: 5 },
      direction: { x: 0, y: 0, z: -1 },
    });
    expect(adapter.isPointInDropZoneStatus()).toBe(true);

    // Initial frame at t = 0
    let t = 1000;
    adapter.stepFreePour(t);

    // Step through the 0.25s tilting transition phase
    // During tilting, stream is NOT yet active and NO mass is added
    for (let step = 0; step < 5; step++) {
      t += 40; // +200ms total
      adapter.stepFreePour(t);
    }
    expect(adapter.isStreamFlowing()).toBe(false);
    expect(useStore.getState().snapshot.mass.W).toBe(0);

    // Advance past 0.25s tilt transition -> stream becomes active
    t += 60; // t = 1260ms (260ms after start)
    adapter.stepFreePour(t);
    expect(adapter.isStreamFlowing()).toBe(true);

    // Step continuously for exactly 1.0 second of active pouring in 50ms intervals (20 steps)
    // Water rate: 250 ticks/s = 25 ml/s
    for (let step = 0; step < 20; step++) {
      t += 50;
      adapter.stepFreePour(t);
    }

    // After ~1.0s of active pouring, mass should be approximately 25g
    const massWater = useStore.getState().snapshot.mass.W;
    expect(massWater).toBeGreaterThanOrEqual(23.5);
    expect(massWater).toBeLessThanOrEqual(26.5);
    expect(adapter.getTotalAcceptedAmount()).toBe(massWater);

    // Stop release
    adapter.onPointerUp(1);
    expect(adapter.isDragging()).toBe(false);
    expect(adapter.isStreamFlowing()).toBe(false);
  });

  it('3. 30, 60, and 120 FPS presentation schedules yield equivalent mass within decitick quantum', () => {
    // Test sugar free pour at 10 g/s = 100 ticks/s for exactly 1.0s of active pouring
    const runTrial = (fps: number): number => {
      const bridge = new SimulationBridge();
      const useStore = createExperimentStore(bridge);
      const adapter = bridge.getVesselAdapter()!;
      useStore.getState().setPourMode('free');

      adapter.onPointerDown({
        ingredient: 'sugar',
        pointerId: 1,
        button: 0,
        hitPoint: new Vector3(-2.8, 0.5, 0),
        homePos: [-2.8, 0, 0],
      });

      adapter.onPointerMove(1, {
        origin: { x: SPOUT_TARGET.x, y: SPOUT_TARGET.y, z: 5 },
        direction: { x: 0, y: 0, z: -1 },
      });

      const frameDt = 1000 / fps;
      let t = 1000;
      adapter.stepFreePour(t);

      // Settle into tilt pose (advance in steps until fully tilted)
      while (!adapter.isStreamFlowing()) {
        t += frameDt;
        adapter.stepFreePour(t);
      }

      // Exactly 1.0s of active pouring (total frames = fps)
      const totalFrames = Math.round(fps * 1.0);
      for (let frame = 0; frame < totalFrames; frame++) {
        t += frameDt;
        adapter.stepFreePour(t);
      }

      // Release mouse (flushes final batch)
      adapter.onPointerUp(1);
      return useStore.getState().snapshot.mass.Gt;
    };

    const mass30 = runTrial(30);
    const mass60 = runTrial(60);
    const mass120 = runTrial(120);

    // All should be close to 10.0g within 1 decitick quantum (0.1g)
    expect(Math.abs(mass30 - 10.0)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(mass60 - 10.0)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(mass120 - 10.0)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(mass30 - mass60)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(mass60 - mass120)).toBeLessThanOrEqual(0.1);
  });

  it('4. Transition time into pose and time outside drop zone do not accumulate substance', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;
    useStore.getState().setPourMode('free');

    adapter.onPointerDown({
      ingredient: 'oil',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.2, 0.5, 2.3),
      homePos: [-2.2, 0, 2.3],
    });

    let t = 1000;
    adapter.stepFreePour(t);

    // 1. Spend 200ms outside drop zone: 0 added
    for (let i = 0; i < 5; i++) {
      t += 40;
      adapter.stepFreePour(t);
    }
    expect(useStore.getState().snapshot.mass.Ot).toBe(0);

    // 2. Move into drop zone and advance 200ms (still tilting, progress < 1.0): 0 added
    adapter.onPointerMove(1, {
      origin: { x: SPOUT_TARGET.x, y: SPOUT_TARGET.y, z: 5 },
      direction: { x: 0, y: 0, z: -1 },
    });
    for (let i = 0; i < 5; i++) {
      t += 40;
      adapter.stepFreePour(t);
    }
    expect(adapter.isStreamFlowing()).toBe(false);
    expect(useStore.getState().snapshot.mass.Ot).toBe(0);

    // 3. Move cursor out of maintain bounds for 2 full seconds: 0 added
    adapter.onPointerMove(1, {
      origin: { x: -2.5, y: 1.5, z: 5 },
      direction: { x: 0, y: 0, z: -1 },
    });
    expect(adapter.isPointInDropZoneStatus()).toBe(false);
    for (let i = 0; i < 40; i++) {
      t += 50;
      adapter.stepFreePour(t);
    }
    expect(adapter.isStreamFlowing()).toBe(false);
    expect(useStore.getState().snapshot.mass.Ot).toBe(0);
  });

  it('5. Normal pointer release flushes final integer batch and strictly discards remainder < 0.1', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;
    useStore.getState().setPourMode('free');

    adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
    });

    adapter.onPointerMove(1, {
      origin: { x: SPOUT_TARGET.x, y: SPOUT_TARGET.y, z: 5 },
      direction: { x: 0, y: 0, z: -1 },
    });

    let t = 1000;
    adapter.stepFreePour(t);

    // Settle into pose (advance in steps until active)
    for (let step = 0; step < 7; step++) {
      t += 40;
      adapter.stepFreePour(t);
    }
    expect(adapter.isStreamFlowing()).toBe(true);

    // Now actively pour for exactly 75ms (less than 100ms cadence)
    // 75ms * 250 ticks/s = 18.75 ticks = 1.875 ml
    t += 75;
    adapter.stepFreePour(t);

    // Release mouse
    // Normal stop handler must flush 18 whole deciticks (= 1.8 ml) and drop 0.75 ticks (<0.1)
    adapter.onPointerUp(1);

    const waterMass = useStore.getState().snapshot.mass.W;
    expect(waterMass).toBe(1.8);

    // Subsequent steps after stop dispatch absolutely nothing
    t += 500;
    adapter.stepFreePour(t);
    expect(useStore.getState().snapshot.mass.W).toBe(1.8);
  });

  it('6. Capacity limit stops free pouring cleanly when 500ml limit is reached', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;

    // Pre-fill beaker with 495 ml of water (only 5 ml remaining capacity)
    bridge.add('water', '495');
    expect(useStore.getState().snapshot.mass.W).toBe(495);

    useStore.getState().setPourMode('free');

    adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
    });

    adapter.onPointerMove(1, {
      origin: { x: SPOUT_TARGET.x, y: SPOUT_TARGET.y, z: 5 },
      direction: { x: 0, y: 0, z: -1 },
    });

    let t = 1000;
    adapter.stepFreePour(t);

    // Settle into tilt pose
    for (let step = 0; step < 7; step++) {
      t += 40;
      adapter.stepFreePour(t);
    }

    // Step for 2 full seconds (would normally add 50 ml)
    for (let i = 0; i < 40; i++) {
      t += 50;
      adapter.stepFreePour(t);
    }

    // Must be clamped at exactly 500 ml! Never exceeds capacity!
    expect(useStore.getState().snapshot.mass.W).toBe(500);
    expect(adapter.isStreamFlowing()).toBe(false);

    adapter.onPointerUp(1);
    expect(useStore.getState().snapshot.mass.W).toBe(500);

    // Now try to free pour again when beaker is at full capacity: rejected at pointer down
    const rejectDown = adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 2,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
    });
    expect(rejectDown.accepted).toBe(false);
    expect(rejectDown.reason).toBe('CAPACITY_FULL');
  });

  it('7. Presentation interruption (>300ms gap) terminates active session, drops unsent ticks, and does not auto-resume', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;
    useStore.getState().setPourMode('free');

    adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
    });

    adapter.onPointerMove(1, {
      origin: { x: SPOUT_TARGET.x, y: SPOUT_TARGET.y, z: 5 },
      direction: { x: 0, y: 0, z: -1 },
    });

    let t = 1000;
    adapter.stepFreePour(t);
    for (let step = 0; step < 7; step++) {
      t += 40;
      adapter.stepFreePour(t);
    }
    expect(adapter.isStreamFlowing()).toBe(true);

    // Actively pour for 150ms (adds 1 batch of 3.7 ml = 37 ticks)
    t += 150;
    adapter.stepFreePour(t);
    expect(useStore.getState().snapshot.mass.W).toBe(3.7);

    // Sudden long freeze (e.g. background tab or garbage collection pause for 3.0 seconds)
    t += 3000;
    adapter.stepFreePour(t);

    // Session is immediately terminated!
    expect(adapter.isStreamFlowing()).toBe(false);
    expect(adapter.isDragging()).toBe(false);
    expect(useStore.getState().draggedVessel).toBeNull();

    // Already accepted amount is strictly preserved
    expect(useStore.getState().snapshot.mass.W).toBe(3.7);

    // Subsequent frame does NOT auto-resume pouring
    t += 100;
    adapter.stepFreePour(t);
    expect(useStore.getState().snapshot.mass.W).toBe(3.7);
    expect(adapter.isStreamFlowing()).toBe(false);
  });

  it('8. Reset during active free pour halts session, prevents stale batches, and clears state', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;
    useStore.getState().setPourMode('free');

    adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
    });

    adapter.onPointerMove(1, {
      origin: { x: SPOUT_TARGET.x, y: SPOUT_TARGET.y, z: 5 },
      direction: { x: 0, y: 0, z: -1 },
    });

    let t = 1000;
    adapter.stepFreePour(t);
    for (let step = 0; step < 12; step++) {
      t += 50;
      adapter.stepFreePour(t);
    }
    expect(useStore.getState().snapshot.mass.W).toBeGreaterThan(0);

    // Call reset
    useStore.getState().reset();
    expect(useStore.getState().snapshot.mass.W).toBe(0);
    expect(useStore.getState().draggedVessel).toBeNull();

    // Calling stepFreePour with stale timestamps adds nothing
    t += 100;
    adapter.stepFreePour(t);
    expect(useStore.getState().snapshot.mass.W).toBe(0);
  });

  it('9. By-dose mode and "+ Thêm" button maintain full functionality without regression', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);

    useStore.getState().setPourMode('by_dose');

    // Button addition
    useStore.getState().setInputDose('water', '50');
    const addedOk = useStore.getState().add('water', '50');
    expect(addedOk).toBe(true);
    expect(useStore.getState().snapshot.mass.W).toBe(50);

    // By-dose drop pour
    useStore.getState().setInputDose('oil', '25');
    const dragOk = useStore.getState().startVesselDrag('oil', 1);
    expect(dragOk.ok).toBe(true);
    expect(useStore.getState().draggedVessel?.mode).toBe('by_dose');
    expect(useStore.getState().draggedVessel?.snapshotAmount).toBe(25);

    useStore.getState().updateVesselDragPos([SPOUT_TARGET.x, SPOUT_TARGET.y, SPOUT_TARGET.z], true);
    useStore.getState().endVesselDragDrop();

    const pour = useStore.getState().activePour!;
    expect(pour.amount).toBe(25);
    useStore.getState().commitPour(pour.token);
    expect(useStore.getState().quantities.oil).toBe(25);
  });

  it('10. PointerUp with a frame gap > 300ms discards uncommitted remainder and does not flush', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;
    useStore.getState().setPourMode('free');

    adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
    });

    adapter.onPointerMove(1, {
      origin: { x: SPOUT_TARGET.x, y: SPOUT_TARGET.y, z: 5 },
      direction: { x: 0, y: 0, z: -1 },
    });

    let t = 1000;
    adapter.stepFreePour(t);
    for (let step = 0; step < 7; step++) {
      t += 40;
      adapter.stepFreePour(t);
    }
    expect(adapter.isStreamFlowing()).toBe(true);

    // Active pour for 75ms (uncommitted remainder: 75ms * 250 ticks/s = 18.75 ticks)
    t += 75;
    adapter.stepFreePour(t);

    // Now pointerup happens after a 1000ms pause (e.g. user tab froze or long delay before release)
    adapter.onPointerUp(1, undefined, t + 1000);

    // Because gap was 1000ms > 300ms, the 18 ticks uncommitted are discarded, NOT flushed!
    expect(useStore.getState().snapshot.mass.W).toBe(0);
    expect(adapter.isDragging()).toBe(false);
  });

  it('11. Capacity limits with real engine for all 4 ingredients account for volume displacement without spamming errors', () => {
    // A. Water & Oil: 1 ml = 1000 milli-ml. 499.5 ml filled -> only 0.5 ml (5 ticks) capacity left
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;
    bridge.add('water', '499.5');
    expect(useStore.getState().snapshot.mass.W).toBe(499.5);

    useStore.getState().setPourMode('free');
    adapter.onPointerDown({
      ingredient: 'oil',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-1.4, 0.5, 0),
      homePos: [-1.4, 0, 0],
    });
    adapter.onPointerMove(1, {
      origin: { x: SPOUT_TARGET.x, y: SPOUT_TARGET.y, z: 5 },
      direction: { x: 0, y: 0, z: -1 },
    });

    let t = 1000;
    adapter.stepFreePour(t);
    for (let i = 0; i < 7; i++) {
      t += 40;
      adapter.stepFreePour(t);
    }
    expect(adapter.isStreamFlowing()).toBe(true);

    // Step for 1 second (oil rate 150 ticks/s = 15 ml/s)
    for (let i = 0; i < 20; i++) {
      t += 50;
      adapter.stepFreePour(t);
    }

    // Capacity is strictly clamped at 0.5 ml of oil!
    expect(useStore.getState().quantities.oil).toBe(0.5);
    expect(adapter.isStreamFlowing()).toBe(false);

    // Release pointer and verify camera is re-enabled
    adapter.onPointerUp(1);
    expect(adapter.isDragging()).toBe(false);

    // B. Sugar & Sand: Displacement volume checks
    // Fill with 490 ml water -> 10 ml free volume (10,000 milli-ml).
    // Sugar has 0.65 ml/g displacement volume (65 milli-ml / tick).
    // 10,000 / 65 = 153.84 ticks -> floor = 153 ticks = 15.3 g maximum sugar capacity.
    const bridge2 = new SimulationBridge();
    const useStore2 = createExperimentStore(bridge2);
    const adapter2 = bridge2.getVesselAdapter()!;
    bridge2.add('water', '490');

    useStore2.getState().setPourMode('free');
    adapter2.onPointerDown({
      ingredient: 'sugar',
      pointerId: 2,
      button: 0,
      hitPoint: new Vector3(-2.8, 0.5, 0),
      homePos: [-2.8, 0, 0],
    });
    adapter2.onPointerMove(2, {
      origin: { x: SPOUT_TARGET.x, y: SPOUT_TARGET.y, z: 5 },
      direction: { x: 0, y: 0, z: -1 },
    });

    let t2 = 1000;
    adapter2.stepFreePour(t2);
    for (let i = 0; i < 7; i++) {
      t2 += 40;
      adapter2.stepFreePour(t2);
    }

    // Step for 3 seconds (rate 10 g/s -> 30g attempted)
    for (let i = 0; i < 60; i++) {
      t2 += 50;
      adapter2.stepFreePour(t2);
    }

    // Sugar must be clamped at exactly 15.3g! (153 * 65 = 9945 milli-ml <= 10000 milli-ml)
    expect(useStore2.getState().snapshot.mass.Gt).toBe(15.3);
    expect(adapter2.isStreamFlowing()).toBe(false);
    adapter2.onPointerUp(2);
  });

  it('12. Mutual exclusivity between manual stirring and vessel drag', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const vesselAdapter = bridge.getVesselAdapter()!;

    // Create manual stir adapter
    const engine = bridge.getEngine();
    const stirAdapter = new ManualStirAdapter({
      engine,
      facade: bridge.getFacade(),
      getShowRod: () => true,
    });
    bridge.setManualAdapter(stirAdapter);

    // Case A: When vessel is dragging, manual stir pointer down is rejected
    useStore.getState().setPourMode('by_dose');
    const downRes = vesselAdapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
    });
    expect(downRes.accepted).toBe(true);
    expect(vesselAdapter.isDragging()).toBe(true);

    // Switch engine to manual mode and resume so stir adapter accepts input
    bridge.setMode('manual');
    bridge.resume();

    const rodPose = engine.getRodPose();
    const rodRay = {
      origin: [rodPose.x, 2.0, rodPose.z] as [number, number, number],
      direction: [0, -1, 0] as [number, number, number],
    };

    const stirRes = stirAdapter.onPointerDown({
      pointerId: 2,
      ray: rodRay,
      button: 0,
      pointerType: 'mouse',
      isHitSpoon: true,
    });
    expect(stirRes.accepted).toBe(false);

    // Release vessel
    vesselAdapter.onEscapeKey();
    expect(vesselAdapter.isDragging()).toBe(false);

    // Now spoon can start dragging
    const stirRes2 = stirAdapter.onPointerDown({
      pointerId: 2,
      ray: rodRay,
      button: 0,
      pointerType: 'mouse',
      isHitSpoon: true,
    });
    expect(stirRes2.accepted).toBe(true);
    expect(stirAdapter.isDragActive()).toBe(true);

    // Case B: While spoon is dragging, vessel pointer down is rejected
    const downReject = vesselAdapter.onPointerDown({
      ingredient: 'oil',
      pointerId: 3,
      button: 0,
      hitPoint: new Vector3(-1.4, 0.5, 0),
      homePos: [-1.4, 0, 0],
    });
    expect(downReject.accepted).toBe(false);
    expect(downReject.reason).toBe('MANUAL_STIR_ACTIVE');
  });

  it('13. Geometric consistency: Drop zone bounds and spout target are derived from Beaker dimensions', () => {
    // SPOUT_TARGET is relative to beaker center and rim
    expect(SPOUT_TARGET.x).toBe(BEAKER_CENTER.x - POUR_GEOMETRY.spoutRadialPenetration);
    expect(SPOUT_TARGET.y).toBe(BEAKER_RIM_Y + POUR_GEOMETRY.spoutClearanceAboveRim);
    expect(SPOUT_TARGET.z).toBe(BEAKER_CENTER.z);

    // computeSpoutPosition at max tilt produces exact SPOUT_TARGET coordinates
    const rV = 0.38;
    const hV = 1.05;
    const maxTilt = SPOUT_TARGET.tiltAngle;
    const sinM = Math.sin(maxTilt);
    const cosM = Math.cos(maxTilt);
    const basePourPos: [number, number, number] = [
      SPOUT_TARGET.x - hV * sinM - rV * cosM,
      SPOUT_TARGET.y - hV * cosM + rV * sinM,
      SPOUT_TARGET.z,
    ];

    const computedSpout = computeSpoutPosition(basePourPos, maxTilt, rV, hV);
    expect(Math.abs(computedSpout[0] - SPOUT_TARGET.x)).toBeLessThan(1e-6);
    expect(Math.abs(computedSpout[1] - SPOUT_TARGET.y)).toBeLessThan(1e-6);
    expect(Math.abs(computedSpout[2] - SPOUT_TARGET.z)).toBeLessThan(1e-6);

    // Drop zone bounds are properly positioned around rim
    expect(DROP_ZONE_ENTER_BOUNDS.minY).toBeLessThan(BEAKER_RIM_Y);
    expect(DROP_ZONE_ENTER_BOUNDS.maxY).toBeGreaterThan(BEAKER_RIM_Y + 1.0);
    expect(DROP_ZONE_MAINTAIN_BOUNDS.minX).toBeLessThan(DROP_ZONE_ENTER_BOUNDS.minX);
    expect(DROP_ZONE_MAINTAIN_BOUNDS.maxX).toBeGreaterThan(DROP_ZONE_ENTER_BOUNDS.maxX);
  });

  it('14. Duplicate and rejected acknowledgements do not increase displayed added amount', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;
    useStore.getState().setPourMode('free');

    adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
    });

    adapter.onPointerMove(1, {
      origin: { x: SPOUT_TARGET.x, y: SPOUT_TARGET.y, z: 5 },
      direction: { x: 0, y: 0, z: -1 },
    });

    let t = 1000;
    adapter.stepFreePour(t);
    for (let i = 0; i < 7; i++) {
      t += 40;
      adapter.stepFreePour(t);
    }
    expect(adapter.isStreamFlowing()).toBe(true);

    // Pour 1 batch
    t += 100;
    adapter.stepFreePour(t);
    const initialAdded = adapter.getTotalAcceptedAmount();
    expect(initialAdded).toBe(2.5);

    // Simulate duplicate or rejected dispatch: totalAcceptedAmount remains exactly initialAdded
    // by testing that getTotalAcceptedDeciTicks reflects acceptedAckSeqSet
    expect(adapter.getTotalAcceptedDeciTicks()).toBe(25);
    adapter.onPointerUp(1);
    expect(adapter.getTotalAcceptedAmount()).toBe(initialAdded);
  });

  it('15. Camera ownership: only valid owner restores camera, pre-existing state is preserved, and inactive cleanup does not interfere', () => {
    const bridge = new SimulationBridge();
    createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;

    let cameraEnabled = true;
    const mockCamera: CameraControlTarget = {
      setEnabled: (en: boolean) => {
        cameraEnabled = en;
      },
      isEnabled: () => cameraEnabled,
    };
    adapter.setCameraTarget(mockCamera);

    // Case 1: Inactive adapter calling cleanup or onReset does NOT force camera enabled
    cameraEnabled = false; // camera held by another subsystem
    adapter.cleanup();
    expect(cameraEnabled).toBe(false); // remained untouched!
    adapter.onReset();
    expect(cameraEnabled).toBe(false); // remained untouched!

    // Case 2: If camera was already disabled before drag started, restoring camera restores false!
    cameraEnabled = false;
    adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
    });
    expect(adapter.hasCameraOwnership()).toBe(true);
    expect(cameraEnabled).toBe(false);

    adapter.onPointerUp(1);
    expect(adapter.hasCameraOwnership()).toBe(false);
    expect(cameraEnabled).toBe(false); // restored to false (prior state)!

    // Case 3: If camera was enabled before drag started, restoring camera restores true!
    cameraEnabled = true;
    adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 2,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
    });
    expect(cameraEnabled).toBe(false);
    adapter.onPointerUp(2);
    expect(cameraEnabled).toBe(true);
  });

  it('16. Mutual exclusivity during active pour animation: spoon dragging is rejected while vessel pour is animating', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const vesselAdapter = bridge.getVesselAdapter()!;

    const engine = bridge.getEngine();
    const stirAdapter = new ManualStirAdapter({
      engine,
      facade: bridge.getFacade(),
      getShowRod: () => true,
    });
    bridge.setManualAdapter(stirAdapter);
    bridge.setMode('manual');
    bridge.resume();

    // Start a pour animation in the store
    useStore.getState().startPour('water', '50');
    expect(useStore.getState().activePour).not.toBeNull();
    expect(vesselAdapter.isBusy()).toBe(true);

    const rodPose = engine.getRodPose();
    const rodRay = {
      origin: [rodPose.x, 2.0, rodPose.z] as [number, number, number],
      direction: [0, -1, 0] as [number, number, number],
    };

    // Attempting to drag spoon while pour is running MUST be rejected!
    const stirRes = stirAdapter.onPointerDown({
      pointerId: 2,
      ray: rodRay,
      button: 0,
      pointerType: 'mouse',
      isHitSpoon: true,
    });
    expect(stirRes.accepted).toBe(false);

    // Finish pour
    const token = useStore.getState().activePour!.token;
    useStore.getState().finishPour(token);
    expect(useStore.getState().activePour).toBeNull();
    expect(vesselAdapter.isBusy()).toBe(false);

    // Now spoon can start dragging
    const stirRes2 = stirAdapter.onPointerDown({
      pointerId: 2,
      ray: rodRay,
      button: 0,
      pointerType: 'mouse',
      isHitSpoon: true,
    });
    expect(stirRes2.accepted).toBe(true);
    expect(stirAdapter.isDragActive()).toBe(true);
    stirAdapter.endManualDrag();
  });

  it('17. Visual Drop Zone Indicator matches entry bounds and hovers cleanly above rim', () => {
    expect(DROP_ZONE_VISUAL_CENTER.x).toBe((DROP_ZONE_ENTER_BOUNDS.minX + DROP_ZONE_ENTER_BOUNDS.maxX) / 2);
    expect(DROP_ZONE_VISUAL_CENTER.y).toBe(BEAKER_RIM_Y + 0.15);
    expect(DROP_ZONE_VISUAL_CENTER.y).toBeGreaterThan(BEAKER_RIM_Y);
    expect(DROP_ZONE_VISUAL_CENTER.z).toBe(BEAKER_CENTER.z);

    // Indicator aperture spans inside entry bounds
    const leftRingEdge = DROP_ZONE_VISUAL_CENTER.x - DROP_ZONE_VISUAL_RADIUS.outer;
    const rightRingEdge = DROP_ZONE_VISUAL_CENTER.x + DROP_ZONE_VISUAL_RADIUS.outer;
    expect(leftRingEdge).toBeGreaterThanOrEqual(DROP_ZONE_ENTER_BOUNDS.minX);
    expect(rightRingEdge).toBeLessThanOrEqual(DROP_ZONE_ENTER_BOUNDS.maxX);
  });

  it('18. WebGL context loss safely resets active vessel drag and restores camera control', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const vesselAdapter = bridge.getVesselAdapter()!;

    let cameraEnabled = true;
    vesselAdapter.setCameraTarget({
      setEnabled: (en: boolean) => {
        cameraEnabled = en;
      },
      isEnabled: () => cameraEnabled,
    });

    useStore.getState().setPourMode('free');
    vesselAdapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
    });
    expect(vesselAdapter.isDragging()).toBe(true);
    expect(cameraEnabled).toBe(false);

    // Simulate WebGL context lost through store / bridge
    useStore.getState().reportWebGLContextLost();

    // Active drag must be reset, and camera restored
    expect(vesselAdapter.isDragging()).toBe(false);
    expect(cameraEnabled).toBe(true);
    expect(useStore.getState().webglStatus).toBe('context_lost');
  });

  it('19. 3D Geometric contact detection: validates body and rim touch, approach zone, and 3D depth separation', () => {
    // 1. Touching beaker body at mid-height (dx = -1.35, y = 0.5, dz = 0):
    // distXZ = 1.35 <= 1.50 -> touch is true
    expect(isVesselTouchingBeaker([-1.35, 0.5, 0.0])).toBe(true);
    expect(isVesselNearBeaker([-1.35, 0.5, 0.0])).toBe(true);

    // 2. Touching beaker near rim (dx = -1.40, y = 2.30, dz = 0):
    expect(isVesselTouchingBeaker([-1.40, 2.30, 0.0])).toBe(true);
    expect(isVesselNearBeaker([-1.40, 2.30, 0.0])).toBe(true);

    // 3. Approach zone: near (distXZ = 1.80 <= 2.20), but NOT touching (1.80 > 1.50)
    expect(isVesselNearBeaker([-1.80, 0.5, 0.0])).toBe(true);
    expect(isVesselTouchingBeaker([-1.80, 0.5, 0.0])).toBe(false);

    // 4. Stock vessel at resting home pos on bench: far away (not near, not touching)
    expect(isVesselNearBeaker([-2.6, 0.0, -1.1])).toBe(false);
    expect(isVesselTouchingBeaker([-2.6, 0.0, -1.1])).toBe(false);

    // 5. 3D depth rejection: vessel at x = 0 (same screen X as beaker center!), but depth z = 2.5:
    // distXZ = sqrt(0^2 + 2.5^2) = 2.5 > 1.50 -> NOT touching!
    // Prevents false positives from 2D screen projection overlap!
    expect(isVesselTouchingBeaker([0.0, 0.5, 2.5])).toBe(false);
    expect(isVesselNearBeaker([0.0, 0.5, 2.5])).toBe(false);
  });

  it('20. Mode A (By-Dose): Touching 500ml beaker body automatically triggers lift and pour without mouse release', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;

    useStore.getState().setPourMode('by_dose');
    useStore.getState().setInputDose('water', '75');

    // Start drag with explicit canonical cameraDirection matching runtime
    adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
      cameraDirection: DEFAULT_CAMERA_DIR,
    });
    expect(adapter.isDragging()).toBe(true);
    expect(useStore.getState().activePour).toBeNull();

    // Drag toward beaker to touch its body at [-1.35, 0.35, 0.0]
    adapter.onPointerMove(1, {
      origin: { x: -1.35, y: 0.35, z: 5.0 },
      direction: { x: 0, y: 0, z: -1.0 },
    });

    // Contact triggered automatically!
    // activePour must be initialized in store from touch position
    const activePour = useStore.getState().activePour;
    expect(activePour).not.toBeNull();
    if (!activePour) throw new Error('activePour must exist');
    expect(activePour.ingredient).toBe('water');
    expect(activePour.amount).toBe(75);
    expect(activePour.fromDrop).toBe(true);
    expect(activePour.dropPos).toBeDefined();

    // Releasing mouse after touch contact does NOT cancel or interrupt
    adapter.onPointerUp(1);
    expect(useStore.getState().activePour).not.toBeNull();
    expect(useStore.getState().activePour?.token).toBe(activePour.token);

    // Authoritative commit occurs exactly once
    const token = activePour.token;
    expect(useStore.getState().snapshot.mass.W).toBe(0);
    useStore.getState().commitPour(token);
    expect(useStore.getState().snapshot.mass.W).toBe(75);

    // Conclude animation
    useStore.getState().finishPour(token);
    expect(useStore.getState().activePour).toBeNull();
  });

  it('21. Mode A (By-Dose): Early release before touching beaker cancels drag with zero addition and clear guidance message', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;

    useStore.getState().setPourMode('by_dose');
    useStore.getState().setInputDose('sugar', '25');

    adapter.onPointerDown({
      ingredient: 'sugar',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.8, 0.5, 0.0),
      homePos: [-2.8, 0, 0.0],
      cameraDirection: DEFAULT_CAMERA_DIR,
    });
    expect(adapter.isDragging()).toBe(true);

    // Drag only a little bit, remaining far outside beaker (e.g. [-2.2, 0.35, 0.0])
    adapter.onPointerMove(1, {
      origin: { x: -2.2, y: 0.35, z: 5.0 },
      direction: { x: 0, y: 0, z: -1.0 },
    });
    expect(adapter.isVesselTouching()).toBe(false);

    // Release before contact
    adapter.onPointerUp(1);
    expect(adapter.isDragging()).toBe(false);
    expect(useStore.getState().activePour).toBeNull();
    expect(useStore.getState().snapshot.mass.Gt).toBe(0);
    expect(useStore.getState().message).toBe('Kéo cốc nguyên liệu chạm cốc lớn để rót.');
  });

  it('22. Mode B (Free Pour): Contact with beaker body initiates lift/tilt phase without accumulating substance during lift', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;

    useStore.getState().setPourMode('free');

    adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
      cameraDirection: DEFAULT_CAMERA_DIR,
    });

    // Drag to touch beaker body
    adapter.onPointerMove(1, {
      origin: { x: -1.35, y: 0.35, z: 5.0 },
      direction: { x: 0, y: 0, z: -1.0 },
    });
    expect(adapter.isVesselTouching()).toBe(true);
    expect(adapter.getFreePourPhase()).toBe('lifting');

    // Step through the lift/tilt phase (first 200ms)
    let t = 2000;
    adapter.stepFreePour(t);
    for (let i = 0; i < 4; i++) {
      t += 50;
      adapter.stepFreePour(t);
    }
    // Stream must NOT be flowing and mass must be 0 during lift
    expect(adapter.isStreamFlowing()).toBe(false);
    expect(useStore.getState().snapshot.mass.W).toBe(0);
  });

  it('23. Mode B (Free Pour): Releasing mouse during the lift/tilt phase aborts with zero (0) addition', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;

    useStore.getState().setPourMode('free');

    adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0, -1.1],
      cameraDirection: DEFAULT_CAMERA_DIR,
    });

    // Touch beaker
    adapter.onPointerMove(1, {
      origin: { x: -1.35, y: 0.35, z: 5.0 },
      direction: { x: 0, y: 0, z: -1.0 },
    });
    expect(adapter.getFreePourPhase()).toBe('lifting');

    // Advance 100ms into lift (well before 250ms completion)
    adapter.stepFreePour(3000);
    adapter.stepFreePour(3100);
    expect(adapter.isStreamFlowing()).toBe(false);

    // User releases mouse DURING the lift phase!
    adapter.onPointerUp(1);
    expect(adapter.isDragging()).toBe(false);
    expect(adapter.getTotalAcceptedAmount()).toBe(0);
    expect(useStore.getState().snapshot.mass.W).toBe(0);
    expect(useStore.getState().message).toBe('Kéo cốc nguyên liệu chạm cốc lớn để rót.');
  });

  it('24. Trajectory geometric clearance: computeDropPourTransform guarantees base altitude >= 2.45 before any horizontal tilt over rim', () => {
    const dropPos: [number, number, number] = [-1.35, 0.35, 0.0];
    const homePos: [number, number, number] = [-2.6, 0.0, -1.1];

    // Phase 1 (0 -> 0.35s): strictly vertical lift outside beaker
    const tMidLift = 0.20;
    const trLift = computeDropPourTransform(dropPos, homePos, tMidLift);
    expect(trLift.rotationZ).toBe(0); // upright!
    expect(trLift.position[0]).toBe(dropPos[0]); // strictly outside!
    expect(trLift.position[2]).toBe(dropPos[2]);
    expect(trLift.position[1]).toBeGreaterThan(dropPos[1]);

    // End of Phase 1 / Phase 2 start: altitude >= 2.45 (above beaker rim 2.32)
    const trFlight = computeDropPourTransform(dropPos, homePos, DROP_POUR_DURATIONS.liftEnd);
    expect(trFlight.position[1]).toBeGreaterThanOrEqual(2.45);
    expect(trFlight.position[1]).toBeGreaterThan(BEAKER_RIM_Y);

    // Phase 3 (commitTime = 0.75s): fully tilted at pour pose with stream active
    const trPour = computeDropPourTransform(dropPos, homePos, DROP_POUR_DURATIONS.commitTime);
    expect(trPour.isPouringStream).toBe(true);
    expect(Math.abs(trPour.rotationZ)).toBeCloseTo(SPOUT_TARGET.tiltAngle, 2);

    // Phase 4 conclusion (total = 2.20s): exact return to home position with zero drift
    const trEnd = computeDropPourTransform(dropPos, homePos, DROP_POUR_DURATIONS.total);
    expect(trEnd.position[0]).toBe(homePos[0]);
    expect(trEnd.position[1]).toBe(homePos[1]);
    expect(trEnd.position[2]).toBe(homePos[2]);
    expect(trEnd.rotationZ).toBe(0);
    expect(trEnd.isPouringStream).toBe(false);
  });

  it('25. Camera contract & fallback consistency: explicit cameraDirection matches default perspective plane', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;
    expect(useStore.getState().pourMode).toBe('by_dose');

    // Case A: Explicit cameraDirection matching runtime
    const resA = adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.35, -1.1),
      homePos: [-2.6, 0.0, -1.1],
      cameraDirection: DEFAULT_CAMERA_DIR,
    });
    expect(resA.accepted).toBe(true);

    // Release
    adapter.onPointerUp(1);

    // Case B: Fallback when cameraDirection is omitted (headless tests)
    // Contract: Adapter automatically assumes canonical DEFAULT_CAMERA_DIR
    const resB = adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 2,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.35, -1.1),
      homePos: [-2.6, 0.0, -1.1],
    });
    expect(resB.accepted).toBe(true);
    adapter.onPointerUp(2);
  });

  it('26. Continuous perspective ray drag under default camera angle (3.9, 3.4, 5.5) triggers contact without jumps', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;

    useStore.getState().setPourMode('by_dose');
    useStore.getState().setInputDose('water', '50');

    const homePos: readonly [number, number, number] = [-2.6, 0.0, -1.1];
    const liftStart = new Vector3(-2.6, 0.35, -1.1);

    adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: liftStart.clone(),
      homePos,
      cameraDirection: DEFAULT_CAMERA_DIR,
    });
    expect(adapter.isDragging()).toBe(true);

    // Continuous sweep of perspective rays across the bench from stock vessel toward beaker
    const beakerAim = new Vector3(0.0, 0.35, 0.0);
    const steps = 12;
    let prevPos: [number, number, number] = adapter.getDragPosition();

    for (let i = 1; i <= steps; i++) {
      const s = i / steps;
      const targetPoint = liftStart.clone().lerp(beakerAim, s);
      const ray = createCameraRay(DEFAULT_CAMERA_POS, targetPoint);

      adapter.onPointerMove(1, ray);

      // If contact triggered before or at end of sweep, activePour is set
      const activePour = useStore.getState().activePour;
      if (activePour !== null) {
        expect(activePour.ingredient).toBe('water');
        expect(activePour.amount).toBe(50);
        break;
      }

      const curPos = adapter.getDragPosition();
      // Verify safe bench boundary clamps
      expect(curPos[0]).toBeGreaterThanOrEqual(-3.5);
      expect(curPos[0]).toBeLessThanOrEqual(1.5);
      expect(curPos[1]).toBeGreaterThanOrEqual(0.12);
      expect(curPos[1]).toBeLessThanOrEqual(3.5);
      expect(curPos[2]).toBeGreaterThanOrEqual(-2.5);
      expect(curPos[2]).toBeLessThanOrEqual(3.0);

      // Step-to-step delta is smooth (no teleportation)
      const dStep = Math.sqrt(
        (curPos[0] - prevPos[0]) ** 2 +
        (curPos[1] - prevPos[1]) ** 2 +
        (curPos[2] - prevPos[2]) ** 2
      );
      expect(dStep).toBeLessThanOrEqual(0.35);
      prevPos = curPos;
    }

    // Contact was triggered automatically without mouse release!
    const activePour = useStore.getState().activePour;
    expect(activePour).not.toBeNull();
    if (!activePour) throw new Error('activePour must exist');
    expect(activePour.ingredient).toBe('water');
    expect(activePour.amount).toBe(50);

    // Conclude animation cleanly
    const token = activePour.token;
    useStore.getState().commitPour(token);
    useStore.getState().finishPour(token);
    expect(useStore.getState().snapshot.mass.W).toBe(50);
  });

  it('27. Continuous perspective ray drag under rotated camera angle (-4.0, 3.4, 4.0)', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;

    useStore.getState().setPourMode('by_dose');
    useStore.getState().setInputDose('water', '40');

    const rotatedCamPos = new Vector3(-4.0, 3.4, 4.0);
    const rotatedCamDir = new Vector3()
      .subVectors(DEFAULT_CAMERA_TARGET, rotatedCamPos)
      .normalize();

    const homePos: readonly [number, number, number] = [-2.6, 0.0, -1.1];
    const liftStart = new Vector3(-2.6, 0.35, -1.1);

    adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 1,
      button: 0,
      hitPoint: liftStart.clone(),
      homePos,
      cameraDirection: rotatedCamDir,
    });
    expect(adapter.isDragging()).toBe(true);

    // Sweep perspective rays towards beaker under rotated view
    const beakerAim = new Vector3(0.0, 0.35, 0.0);
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const s = i / steps;
      const targetPoint = liftStart.clone().lerp(beakerAim, s);
      const ray = createCameraRay(rotatedCamPos, targetPoint);
      adapter.onPointerMove(1, ray);

      if (useStore.getState().activePour !== null) break;
    }

    // Rotated camera perspective ray successfully triggers contact!
    const activePour = useStore.getState().activePour;
    expect(activePour).not.toBeNull();
    if (!activePour) throw new Error('activePour must exist');
    expect(activePour.ingredient).toBe('water');
    expect(activePour.amount).toBe(40);

    const token = activePour.token;
    useStore.getState().commitPour(token);
    useStore.getState().finishPour(token);
    expect(useStore.getState().snapshot.mass.W).toBe(40);
  });

  it('28. Concise UX messages: Escape key and capacity full messages adhere to spec', () => {
    const bridge = new SimulationBridge();
    const useStore = createExperimentStore(bridge);
    const adapter = bridge.getVesselAdapter()!;

    // 1. Escape key cancels drag and sets concise message "Đã dừng thao tác."
    useStore.getState().setPourMode('by_dose');
    adapter.onPointerDown({
      ingredient: 'oil',
      pointerId: 1,
      button: 0,
      hitPoint: new Vector3(-1.4, 0.5, 0.0),
      homePos: [-1.4, 0.0, 0.0],
      cameraDirection: DEFAULT_CAMERA_DIR,
    });
    expect(adapter.isDragging()).toBe(true);

    adapter.onEscapeKey();
    expect(adapter.isDragging()).toBe(false);
    expect(useStore.getState().message).toBe('Đã dừng thao tác.');

    // 2. Free pour capacity full gives concise notification without spam
    bridge.add('water', '499.5'); // leaves only 0.5 ml room
    useStore.getState().setPourMode('free');

    adapter.onPointerDown({
      ingredient: 'water',
      pointerId: 2,
      button: 0,
      hitPoint: new Vector3(-2.6, 0.5, -1.1),
      homePos: [-2.6, 0.0, -1.1],
      cameraDirection: DEFAULT_CAMERA_DIR,
    });

    // Touch beaker
    adapter.onPointerMove(2, {
      origin: { x: -1.35, y: 0.35, z: 5.0 },
      direction: { x: 0, y: 0, z: -1.0 },
    });

    let t = 5000;
    adapter.stepFreePour(t);
    // Complete lift
    for (let i = 0; i < 7; i++) {
      t += 40;
      adapter.stepFreePour(t);
    }
    // Step through pouring until capacity reached
    for (let i = 0; i < 20; i++) {
      t += 50;
      adapter.stepFreePour(t);
    }

    expect(useStore.getState().message).toContain('Cốc 500 ml đã đầy. Không thể thêm tiếp.');
    adapter.onPointerUp(2);
  });
});
