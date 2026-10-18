import { describe, it, expect, beforeEach } from 'vitest';
import {
  intersectRayHorizontalPlane,
  rayFromThreeRay,
  type Ray3D,
} from '../../interactions/RayPlaneProjection';
import {
  ManualStirController,
} from '../../interactions/ManualStirController';
import {
  ManualStirAdapter,
} from '../../interactions/ManualStirAdapter';
import {
  HeadlessSimulationEngine,
  type RodPose,
} from '../core/SimulationEngine';
import {
  SPOON_MAX_RADIUS,
} from '../constants/beaker';

describe('V2-05: Ray-Plane Projection, Spoon Clamp & Position Controller', () => {
  // ---------------------------------------------------------------------------
  // Part 1: Pure Ray-Plane Projection (Tests 1 - 6)
  // ---------------------------------------------------------------------------
  describe('Part 1: Pure Ray–Plane Projection', () => {
    it('1. Ray from above straight down produces exact expected point', () => {
      // Ray origin: (0.2, 1.5, -0.3), direction: (0, -1, 0), planeY: 0.14
      // Analytical t = (0.14 - 1.5) / (-1) = 1.36
      const ray: Ray3D = {
        origin: [0.2, 1.5, -0.3],
        direction: [0, -1, 0],
      };
      const result = intersectRayHorizontalPlane(ray, 0.14);
      expect(result).not.toBeNull();
      expect(result!.t).toBeCloseTo(1.36, 9);
      expect(result!.point[0]).toBeCloseTo(0.2, 9);
      expect(result!.point[1]).toBeCloseTo(0.14, 9);
      expect(result!.point[2]).toBeCloseTo(-0.3, 9);
    });

    it('2. Slanted ray with independent analytical oracle', () => {
      // Ray origin: (1.0, 2.0, 3.0), direction: (0.5, -1.0, -0.5), planeY: 0.2
      // Analytical t = (0.2 - 2.0) / (-1.0) = 1.8
      // Expected point: [1.0 + 1.8 * 0.5, 0.2, 3.0 + 1.8 * (-0.5)] = [1.9, 0.2, 2.1]
      const ray: Ray3D = {
        origin: [1.0, 2.0, 3.0],
        direction: [0.5, -1.0, -0.5],
      };
      const result = intersectRayHorizontalPlane(ray, 0.2);
      expect(result).not.toBeNull();
      expect(result!.t).toBeCloseTo(1.8, 9);
      expect(result!.point[0]).toBeCloseTo(1.9, 9);
      expect(result!.point[1]).toBeCloseTo(0.2, 9);
      expect(result!.point[2]).toBeCloseTo(2.1, 9);
    });

    it('3. Parallel and near-parallel rays are strictly rejected', () => {
      // Exactly parallel (dy = 0)
      const parallelRay: Ray3D = {
        origin: [0, 1.0, 0],
        direction: [1.0, 0.0, 0.0],
      };
      expect(intersectRayHorizontalPlane(parallelRay, 0.14)).toBeNull();

      // Near-parallel below threshold (|normalizedDy| < 1e-5)
      // len = sqrt(1^2 + (0.5e-5)^2) ≈ 1.0, normDy = 0.5e-5 < 1e-5
      const nearParallelRay: Ray3D = {
        origin: [0, 1.0, 0],
        direction: [1.0, 0.5e-5, 0.0],
      };
      expect(intersectRayHorizontalPlane(nearParallelRay, 0.14)).toBeNull();

      // Slightly above threshold: should be accepted if pointing towards plane
      // origin Y = 1.0, planeY = 0.5 -> dy must be negative to hit
      const validSteepRay: Ray3D = {
        origin: [0, 1.0, 0],
        direction: [1.0, -2e-5, 0.0],
      };
      const validResult = intersectRayHorizontalPlane(validSteepRay, 0.5);
      expect(validResult).not.toBeNull();
      expect(validResult!.point[1]).toBeCloseTo(0.5, 9);
    });

    it('4. Intersection behind ray origin (t < 0) is strictly rejected', () => {
      // Origin at Y = 1.0, pointing UP (+Y), plane at Y = 0.14
      // t = (0.14 - 1.0) / 1.0 = -0.86 < 0
      const pointingUpRay: Ray3D = {
        origin: [0, 1.0, 0],
        direction: [0, 1.0, 0],
      };
      expect(intersectRayHorizontalPlane(pointingUpRay, 0.14)).toBeNull();

      // Origin at Y = 0.0, pointing DOWN (-Y), plane at Y = 1.0
      // t = (1.0 - 0.0) / (-1.0) = -1.0 < 0
      const pointingDownBelowPlane: Ray3D = {
        origin: [0, 0.0, 0],
        direction: [1.0, -1.0, 0],
      };
      expect(intersectRayHorizontalPlane(pointingDownBelowPlane, 1.0)).toBeNull();
    });

    it('5. NaN, Infinity, and zero direction vectors return null without throwing', () => {
      // Zero direction
      expect(
        intersectRayHorizontalPlane(
          { origin: [0, 1, 0], direction: [0, 0, 0] },
          0.14
        )
      ).toBeNull();

      // NaN in origin
      expect(
        intersectRayHorizontalPlane(
          { origin: [NaN, 1, 0], direction: [0, -1, 0] },
          0.14
        )
      ).toBeNull();

      // Infinity in direction
      expect(
        intersectRayHorizontalPlane(
          { origin: [0, 1, 0], direction: [0, Infinity, 0] },
          0.14
        )
      ).toBeNull();

      // NaN in planeY
      expect(
        intersectRayHorizontalPlane(
          { origin: [0, 1, 0], direction: [0, -1, 0] },
          NaN
        )
      ).toBeNull();
    });

    it('6. Different camera positions and ray angles converge to the exact same world plane point', () => {
      const targetWorldPoint = [0.35, 0.14, -0.25];

      // Camera 1 at (0, 3.0, 2.0)
      const cam1 = [0, 3.0, 2.0];
      const dir1: [number, number, number] = [
        targetWorldPoint[0] - cam1[0],
        targetWorldPoint[1] - cam1[1],
        targetWorldPoint[2] - cam1[2],
      ];
      const res1 = intersectRayHorizontalPlane({ origin: [cam1[0], cam1[1], cam1[2]], direction: dir1 }, 0.14);

      // Camera 2 at (2.5, 2.0, -1.5)
      const cam2 = [2.5, 2.0, -1.5];
      const dir2: [number, number, number] = [
        targetWorldPoint[0] - cam2[0],
        targetWorldPoint[1] - cam2[1],
        targetWorldPoint[2] - cam2[2],
      ];
      const res2 = intersectRayHorizontalPlane({ origin: [cam2[0], cam2[1], cam2[2]], direction: dir2 }, 0.14);

      expect(res1).not.toBeNull();
      expect(res2).not.toBeNull();

      expect(res1!.point[0]).toBeCloseTo(targetWorldPoint[0], 8);
      expect(res1!.point[1]).toBeCloseTo(targetWorldPoint[1], 8);
      expect(res1!.point[2]).toBeCloseTo(targetWorldPoint[2], 8);

      expect(res2!.point[0]).toBeCloseTo(targetWorldPoint[0], 8);
      expect(res2!.point[1]).toBeCloseTo(targetWorldPoint[1], 8);
      expect(res2!.point[2]).toBeCloseTo(targetWorldPoint[2], 8);

      expect(Math.abs(res1!.point[0] - res2!.point[0])).toBeLessThan(1e-9);
      expect(Math.abs(res1!.point[2] - res2!.point[2])).toBeLessThan(1e-9);
    });
  });

  // ---------------------------------------------------------------------------
  // Part 2: ManualStirController (Tests 7 - 14)
  // ---------------------------------------------------------------------------
  describe('Part 2: ManualStirController State & Pose Continuity', () => {
    let controller: ManualStirController;

    beforeEach(() => {
      controller = new ManualStirController();
    });

    it('7. Pointerdown preserves exact authoritative pose within tolerance 1e-9 (SC-J01)', () => {
      const initialPose: RodPose = {
        x: 0.35,
        z: 0.15,
        tipY: 0.14,
        theta: Math.atan2(0.15, 0.35),
        radius: Math.hypot(0.35, 0.15),
      };

      // Ray clicks somewhere on the plane, e.g. at (0.5, 0.14, 0.2)
      const ray: Ray3D = {
        origin: [0.5, 2.0, 0.2],
        direction: [0, -1, 0],
      };

      const result = controller.startDrag({
        pointerId: 1,
        ray,
        currentPose: initialPose,
        captureGeneration: 0,
      });

      expect(result.accepted).toBe(true);
      expect(Math.abs(result.pose.x - initialPose.x)).toBeLessThan(1e-9);
      expect(Math.abs(result.pose.z - initialPose.z)).toBeLessThan(1e-9);
      expect(Math.abs(result.pose.tipY - initialPose.tipY)).toBeLessThan(1e-9);
      expect(Math.abs(result.pose.radius - initialPose.radius)).toBeLessThan(1e-9);
      expect(Math.abs(result.pose.theta - initialPose.theta)).toBeLessThan(1e-9);

      // Verify drag offset captured
      const offset = controller.getDragOffset();
      expect(offset.x).toBeCloseTo(0.35 - 0.5, 9);
      expect(offset.z).toBeCloseTo(0.15 - 0.2, 9);
    });

    it('8. Move applies drag offset BEFORE clamping', () => {
      const initialPose: RodPose = {
        x: 0.4,
        z: 0.0,
        tipY: 0.14,
        theta: 0,
        radius: 0.4,
      };

      // Pointerdown clicks at (0.1, 0.0) -> offset = (0.4 - 0.1, 0) = (+0.3, 0)
      controller.startDrag({
        pointerId: 1,
        ray: { origin: [0.1, 2.0, 0.0], direction: [0, -1, 0] },
        currentPose: initialPose,
        captureGeneration: 0,
      });

      // Move ray to (0.3, 0.0) -> candidate = 0.3 + 0.3 = 0.6 <= 0.74 (unclamped)
      const res1 = controller.onPointerMove({
        pointerId: 1,
        ray: { origin: [0.3, 2.0, 0.0], direction: [0, -1, 0] },
      });
      expect(res1.accepted).toBe(true);
      expect(res1.pose.x).toBeCloseTo(0.6, 9);
      expect(res1.pose.z).toBeCloseTo(0.0, 9);

      // Move ray to (0.6, 0.0) -> candidate = 0.6 + 0.3 = 0.9 > 0.74 (clamped to 0.74)
      const res2 = controller.onPointerMove({
        pointerId: 1,
        ray: { origin: [0.6, 2.0, 0.0], direction: [0, -1, 0] },
      });
      expect(res2.accepted).toBe(true);
      expect(res2.pose.x).toBeCloseTo(0.74, 9);
      expect(res2.pose.z).toBeCloseTo(0.0, 9);
      expect(res2.pose.radius).toBeCloseTo(0.74, 9);
    });

    it('9. Radial bounds clamp preserves direction outside wall without square box artifacts', () => {
      const initialPose: RodPose = {
        x: 0.0,
        z: 0.0,
        tipY: 0.14,
        theta: 0,
        radius: 0.0,
      };
      controller.startDrag({
        pointerId: 1,
        ray: { origin: [0.0, 2.0, 0.0], direction: [0, -1, 0] },
        currentPose: initialPose,
        captureGeneration: 0,
      });

      // Move candidate diagonally far outside: (1.0, 1.0) -> radius sqrt(2) ≈ 1.4142
      // Must be radially projected to radius 0.74 at angle 45 deg: x = 0.74 / sqrt(2) ≈ 0.523259, z ≈ 0.523259
      const res = controller.onPointerMove({
        pointerId: 1,
        ray: { origin: [1.0, 2.0, 1.0], direction: [0, -1, 0] },
      });
      expect(res.accepted).toBe(true);
      expect(res.pose.radius).toBeCloseTo(SPOON_MAX_RADIUS, 9);

      const expectedDiagonal = SPOON_MAX_RADIUS / Math.SQRT2;
      expect(res.pose.x).toBeCloseTo(expectedDiagonal, 8);
      expect(res.pose.z).toBeCloseTo(expectedDiagonal, 8);
      // Strictly NOT square clamping (x != 0.74 and z != 0.74)
      expect(res.pose.x).not.toBeCloseTo(0.74, 2);
    });

    it('10. Moving to exact center preserves previous valid theta without NaN', () => {
      const initialPose: RodPose = {
        x: 0.3,
        z: 0.0,
        tipY: 0.14,
        theta: Math.PI / 3, // 60 deg
        radius: 0.3,
      };
      controller.startDrag({
        pointerId: 1,
        ray: { origin: [0.3, 2.0, 0.0], direction: [0, -1, 0] },
        currentPose: initialPose,
        captureGeneration: 0,
      });

      // Move ray to origin (0, 0) -> candidate at center (0, 0)
      const res = controller.onPointerMove({
        pointerId: 1,
        ray: { origin: [0.0, 2.0, 0.0], direction: [0, -1, 0] },
      });
      expect(res.accepted).toBe(true);
      expect(res.pose.x).toBeCloseTo(0.0, 9);
      expect(res.pose.z).toBeCloseTo(0.0, 9);
      expect(res.pose.radius).toBeCloseTo(0.0, 9);
      expect(Number.isFinite(res.pose.theta)).toBe(true);
      expect(res.pose.theta).toBeCloseTo(Math.PI / 3, 9);
    });

    it('11. Different pointerId cannot hijack session or modify pose (SC-J04)', () => {
      const initialPose: RodPose = {
        x: 0.3,
        z: 0.0,
        tipY: 0.14,
        theta: 0,
        radius: 0.3,
      };
      controller.startDrag({
        pointerId: 1,
        ray: { origin: [0.3, 2.0, 0.0], direction: [0, -1, 0] },
        currentPose: initialPose,
        captureGeneration: 0,
      });

      // Pointer 2 tries startDrag -> rejected
      const p2Start = controller.startDrag({
        pointerId: 2,
        ray: { origin: [0.5, 2.0, 0.0], direction: [0, -1, 0] },
        currentPose: initialPose,
        captureGeneration: 0,
      });
      expect(p2Start.accepted).toBe(false);

      // Pointer 2 tries onPointerMove -> rejected
      const p2Move = controller.onPointerMove({
        pointerId: 2,
        ray: { origin: [0.7, 2.0, 0.0], direction: [0, -1, 0] },
      });
      expect(p2Move.accepted).toBe(false);

      // Controller state and active pointer remain strictly 1
      expect(controller.getActivePointerId()).toBe(1);
      expect(controller.getPose().x).toBeCloseTo(0.3, 9);
    });

    it('12. Invalid move sample does not corrupt or lose drag offset', () => {
      const initialPose: RodPose = {
        x: 0.4,
        z: 0.0,
        tipY: 0.14,
        theta: 0,
        radius: 0.4,
      };
      controller.startDrag({
        pointerId: 1,
        ray: { origin: [0.2, 2.0, 0.0], direction: [0, -1, 0] }, // offset = +0.2
        currentPose: initialPose,
        captureGeneration: 0,
      });

      // Send invalid ray (pointing up)
      const invalidRes = controller.onPointerMove({
        pointerId: 1,
        ray: { origin: [0.2, 2.0, 0.0], direction: [0, 1, 0] },
      });
      expect(invalidRes.accepted).toBe(false);
      expect(controller.getPose().x).toBeCloseTo(0.4, 9);

      // Subsequent valid ray: offset (+0.2) must still be intact
      const validRes = controller.onPointerMove({
        pointerId: 1,
        ray: { origin: [0.3, 2.0, 0.0], direction: [0, -1, 0] },
      });
      expect(validRes.accepted).toBe(true);
      expect(validRes.pose.x).toBeCloseTo(0.3 + 0.2, 9);
    });

    it('13. Drag plane Y remains fixed even when authoritative tipY changes during drag (SC-R04)', () => {
      const initialPose: RodPose = {
        x: 0.3,
        z: 0.0,
        tipY: 0.14,
        theta: 0,
        radius: 0.3,
      };
      controller.startDrag({
        pointerId: 1,
        ray: { origin: [0.3, 2.0, 0.0], direction: [0, -1, 0] },
        currentPose: initialPose,
        captureGeneration: 0,
      });

      expect(controller.getPlaneY()).toBeCloseTo(0.14, 9);

      // Bed changes in background, authoritative tipY becomes 0.25
      const res = controller.onPointerMove({
        pointerId: 1,
        ray: { origin: [0.4, 2.0, 0.0], direction: [0, -1, 0] },
        currentTipY: 0.25,
      });

      expect(res.accepted).toBe(true);
      // Projection plane remains strictly 0.14
      expect(controller.getPlaneY()).toBeCloseTo(0.14, 9);
      // But output tipY reflects authoritative bed height
      expect(res.pose.tipY).toBeCloseTo(0.25, 9);
    });

    it('14. End and reset session clear offsets; subsequent session starts fresh', () => {
      const initialPose: RodPose = {
        x: 0.4,
        z: 0.0,
        tipY: 0.14,
        theta: 0,
        radius: 0.4,
      };
      controller.startDrag({
        pointerId: 1,
        ray: { origin: [0.1, 2.0, 0.0], direction: [0, -1, 0] }, // offset +0.3
        currentPose: initialPose,
        captureGeneration: 0,
      });
      expect(controller.getDragOffset().x).toBeCloseTo(0.3, 9);

      controller.endDrag(1);
      expect(controller.isDragActive()).toBe(false);
      expect(controller.getActivePointerId()).toBeNull();

      // New session starts with ray at (0.4, 0.0) -> offset 0.0
      controller.startDrag({
        pointerId: 2,
        ray: { origin: [0.4, 2.0, 0.0], direction: [0, -1, 0] },
        currentPose: controller.getPose(),
        captureGeneration: 0,
      });
      expect(controller.getActivePointerId()).toBe(2);
      expect(controller.getDragOffset().x).toBeCloseTo(0.0, 9);
    });
  });

  // ---------------------------------------------------------------------------
  // Part 3: Engine & Adapter Integration (Tests 15 - 22)
  // ---------------------------------------------------------------------------
  describe('Part 3: Headless Engine & Adapter Integration', () => {
    let engine: HeadlessSimulationEngine;
    let adapter: ManualStirAdapter;

    beforeEach(() => {
      engine = new HeadlessSimulationEngine({ clientId: 'test-client' });
      adapter = new ManualStirAdapter({ engine });
    });

    it('15. Valid position updates through authoritative engine path', () => {
      // Set mode to manual and unpause
      engine.dispatch({
        clientId: 'test-client',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: 'test-client',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      const currentRod = engine.getRodPose();
      const rayDown: Ray3D = {
        origin: [currentRod.x, 2.0, currentRod.z],
        direction: [0, -1, 0],
      };

      const downRes = adapter.onPointerDown(1, rayDown, 100);
      expect(downRes.accepted).toBe(true);

      const rayMove: Ray3D = {
        origin: [0.5, 2.0, -0.3],
        direction: [0, -1, 0],
      };
      const moveRes = adapter.onPointerMove(1, rayMove, 116);
      expect(moveRes.accepted).toBe(true);

      const engineRod = engine.getRodPose();
      expect(engineRod.x).toBeCloseTo(0.5, 5);
      expect(engineRod.z).toBeCloseTo(-0.3, 5);
      expect(engineRod.radius).toBeCloseTo(Math.hypot(0.5, -0.3), 5);
    });

    it('16. Position-only dragging does NOT generate omegaDrive (remains 0)', () => {
      engine.dispatch({
        clientId: 'test-client',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });
      engine.dispatch({
        clientId: 'test-client',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: 'test-client',
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      adapter.onPointerDown(1, { origin: [0.3, 2.0, 0.0], direction: [0, -1, 0] }, 100);

      // Pure radial translation along +X axis (constant theta = 0, no angular stirring)
      for (let i = 1; i <= 60; i++) {
        const x = 0.3 + (i / 60) * 0.3;
        const z = 0.0;
        adapter.onPointerMove(1, { origin: [x, 2.0, z], direction: [0, -1, 0] }, 100 + i * 16);
        engine.advance(1 / 60);
      }

      const state = engine.getState();
      expect(state.omegaRod).toBe(0);
      expect(state.omegaDrive).toBe(0);
      expect(state.omegaFlow).toBe(0);
    });

    it('17. Stale captureGeneration after simulation reset is strictly rejected (SC-C05)', () => {
      engine.dispatch({
        clientId: 'test-client',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: 'test-client',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      adapter.onPointerDown(1, { origin: [0.3, 2.0, 0.0], direction: [0, -1, 0] }, 100);

      // Simulation reset increments generation from 0 to 1
      const resetAck = adapter.getFacade().dispatchIntent({ type: 'reset' });
      expect(resetAck.accepted).toBe(true);
      expect(engine.getState().generation).toBe(1);

      // Move with stale session (captureGen 0 != engineGen 1)
      const res = adapter.onPointerMove(1, { origin: [0.5, 2.0, 0.0], direction: [0, -1, 0] }, 200);
      expect(res.accepted).toBe(false);

      // Engine rod is at initial default reset pose (x=0.3, z=0), not (0.5, 0)
      expect(engine.getRodPose().x).toBeCloseTo(0.3, 5);
      expect(engine.getRodPose().z).toBeCloseTo(0.0, 5);
    });

    it('18. Move while paused does NOT alter scientific pose by policy (SCIENTIFIC_SPEC §6)', () => {
      engine.dispatch({
        clientId: 'test-client',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      // Engine starts paused
      expect(engine.getState().paused).toBe(true);

      const initialPose = engine.getRodPose();
      adapter.onPointerDown(1, { origin: [initialPose.x, 2.0, initialPose.z], direction: [0, -1, 0] }, 100);

      // Move attempt while paused
      const moveRes = adapter.onPointerMove(1, { origin: [0.6, 2.0, 0.0], direction: [0, -1, 0] }, 116);
      expect(moveRes.accepted).toBe(false);

      // Scientific pose in engine remains unchanged
      expect(engine.getRodPose().x).toBeCloseTo(initialPose.x, 9);
      expect(engine.getRodPose().z).toBeCloseTo(initialPose.z, 9);
    });

    it('19. Rejected or duplicate samples preserve state and do not corrupt pose', () => {
      const poseBefore = { ...engine.getRodPose() };

      // Dispatch manualSample with NaN x
      const rejectAck = engine.dispatch({
        clientId: 'test-client',
        seq: 1,
        expectedGeneration: 0,
        payload: {
          type: 'manualSample',
          x: NaN,
          z: 0.0,
          inputTimeMs: 100,
          captureGeneration: 0,
        },
      });
      expect(rejectAck.accepted).toBe(false);
      expect(rejectAck.reason).toBe('INVALID_PAYLOAD');

      // Pose after rejected command is unchanged
      const poseAfter = engine.getRodPose();
      expect(poseAfter.x).toBe(poseBefore.x);
      expect(poseAfter.z).toBe(poseBefore.z);
    });

    it('20. Manual-pose fixture to auto entry preserves pose continuity at t0 (SC-J01)', () => {
      engine.dispatch({
        clientId: 'test-client',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: 'test-client',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      // Drag rod to specific pose: (0.35, -0.2)
      adapter.onPointerDown(1, { origin: [0.3, 2.0, 0.0], direction: [0, -1, 0] }, 100);
      adapter.onPointerMove(1, { origin: [0.35, 2.0, -0.2], direction: [0, -1, 0] }, 116);

      const manualPose = engine.getRodPose();
      expect(manualPose.x).toBeCloseTo(0.35, 5);
      expect(manualPose.z).toBeCloseTo(-0.2, 5);

      // Transition mode to auto
      engine.dispatch({
        clientId: 'test-client',
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });

      // Pose at t0 of auto entry must match exact previous manual pose (within 1e-9)
      const autoPoseAtT0 = engine.getRodPose();
      expect(Math.abs(autoPoseAtT0.x - manualPose.x)).toBeLessThan(1e-9);
      expect(Math.abs(autoPoseAtT0.z - manualPose.z)).toBeLessThan(1e-9);

      // Advance 15 ticks (0.25 s at 60 Hz)
      for (let i = 0; i < 15; i++) {
        engine.advance(1 / 60);
      }

      // Radius smoothly approaches target 0.4
      expect(engine.getRodPose().radius).toBeCloseTo(0.4, 2);
    });

    it('21. Dragging rod does NOT alter masses, input totals, or reservation', () => {
      // Setup mixed baseline
      engine.dispatch({
        clientId: 'test-client',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });
      engine.dispatch({
        clientId: 'test-client',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 200 },
      });
      engine.dispatch({
        clientId: 'test-client',
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
      });
      engine.dispatch({
        clientId: 'test-client',
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 200 },
      });
      engine.dispatch({
        clientId: 'test-client',
        seq: 5,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: 'test-client',
        seq: 6,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      const initialMass = { ...engine.getState().mass };
      const initialInput = { ...engine.getState().input };

      adapter.onPointerDown(1, { origin: [0.3, 2.0, 0.0], direction: [0, -1, 0] }, 100);

      // Perform 50 rapid moves
      for (let i = 1; i <= 50; i++) {
        const theta = (i / 50) * Math.PI * 2;
        const x = 0.5 * Math.cos(theta);
        const z = 0.5 * Math.sin(theta);
        adapter.onPointerMove(1, { origin: [x, 2.0, z], direction: [0, -1, 0] }, 100 + i * 16);
      }

      const finalState = engine.getState();
      expect(finalState.mass.W).toBe(initialMass.W);
      expect(finalState.mass.Gt).toBe(initialMass.Gt);
      expect(finalState.mass.St).toBe(initialMass.St);
      expect(finalState.mass.Ot).toBe(initialMass.Ot);
      expect(finalState.input.water).toBe(initialInput.water);
      expect(finalState.input.sugar).toBe(initialInput.sugar);
      expect(finalState.input.sand).toBe(initialInput.sand);
      expect(finalState.input.oil).toBe(initialInput.oil);
    });

    it('22. Helper rayFromThreeRay correctly extracts 3D ray data', () => {
      const threeRay = {
        origin: { x: 1.2, y: 3.4, z: -5.6 },
        direction: { x: 0.1, y: -0.9, z: 0.4 },
      };
      const ray = rayFromThreeRay(threeRay);
      expect(ray.origin).toEqual([1.2, 3.4, -5.6]);
      expect(ray.direction).toEqual([0.1, -0.9, 0.4]);
    });
  });
});
