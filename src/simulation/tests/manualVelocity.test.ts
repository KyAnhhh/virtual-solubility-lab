import { describe, it, expect, vi } from 'vitest';
import {
  AngularVelocityEstimator,
  unwrapAngleDelta,
  MANUAL_MAX_SPEED_RAD_PER_SEC,
  MANUAL_FILTER_TAU_SECONDS,
} from '../../interactions/AngularVelocityEstimator';
import {
  ManualStirAdapter,
} from '../../interactions/ManualStirAdapter';
import type { Ray3D } from '../../interactions/RayPlaneProjection';
import {
  HeadlessSimulationEngine,
  HeadlessSimulationFacade,
  TickBoundaryReplayHarness,
  type TraceItem,
} from '../core/SimulationEngine';
import {
  SimulationBridge,
  type HostClockAdapter,
} from '../bridge/SimulationBridge';
import { A_STIR, B_STIR } from '../constants/flow';
import { DEFAULT_H } from '../core/SimulationClock';

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

// Helper to construct a top-down ray intersecting a plane at (x, planeY, z)
function makeTopDownRay(x: number, z: number, fromY = 1.0): Ray3D {
  return {
    origin: [x, fromY, z],
    direction: [0, -1, 0],
  };
}

describe('V2-06: Manual Angular Velocity Inference & Stale Watchdog', () => {
  // ===========================================================================
  // Part 1: Pure Angular Velocity Estimator Math (Tests 1–12)
  // ===========================================================================
  describe('Part 1: Pure Angular Velocity Estimator Math', () => {
    it('1. Anchor first: initial sample yields omega = 0 and isAnchor = true', () => {
      const estimator = new AngularVelocityEstimator();
      expect(estimator.getHasAnchor()).toBe(false);

      const res = estimator.update(0.3, 0, 0, 100);
      expect(res.accepted).toBe(true);
      expect(res.omega).toBe(0);
      expect(res.isAnchor).toBe(true);
      expect(res.inDeadzone).toBe(false);

      expect(estimator.getHasAnchor()).toBe(true);
      expect(estimator.getOmega()).toBe(0);
      expect(estimator.getLastValidSampleTimeMs()).toBe(100);
    });

    it('2. Two samples infer raw omega and filter with analytical accuracy', () => {
      const estimator = new AngularVelocityEstimator();
      // Sample 1: Anchor at t = 0 ms, theta = 0 rad
      estimator.update(0.3, 0, 0, 0);

      // Sample 2: at t = 100 ms (0.1 s), theta = PI / 4 rad
      const theta1 = Math.PI / 4;
      const res = estimator.update(
        0.3 * Math.cos(theta1),
        0.3 * Math.sin(theta1),
        theta1,
        100
      );

      // Raw velocity: (PI / 4) / 0.1 s = 2.5 PI ≈ 7.85398 rad/s <= 8.0 rad/s
      const rawOmega = theta1 / 0.1;
      const alpha = 1.0 - Math.exp(-0.1 / MANUAL_FILTER_TAU_SECONDS);
      const expectedSmoothed = 0 + alpha * (rawOmega - 0);

      expect(res.accepted).toBe(true);
      expect(res.isAnchor).toBe(false);
      expect(res.omega).toBeCloseTo(expectedSmoothed, 6);
      expect(estimator.getOmega()).toBeCloseTo(expectedSmoothed, 6);
    });

    it('3. +-PI unwrap handles boundary crossing in both directions', () => {
      // Case A: Positive motion across +PI boundary (+3.10 -> -3.10)
      const estPos = new AngularVelocityEstimator();
      estPos.update(0.3 * Math.cos(3.10), 0.3 * Math.sin(3.10), 3.10, 0);

      const resPos = estPos.update(
        0.3 * Math.cos(-3.10),
        0.3 * Math.sin(-3.10),
        -3.10,
        50
      );
      const dThetaPos = unwrapAngleDelta(-3.10, 3.10);
      // dTheta should be positive: -6.20 + 2*PI ≈ 0.083185 rad
      expect(dThetaPos).toBeGreaterThan(0);
      expect(resPos.omega).toBeGreaterThan(0);

      // Case B: Negative motion across -PI boundary (-3.10 -> +3.10)
      const estNeg = new AngularVelocityEstimator();
      estNeg.update(0.3 * Math.cos(-3.10), 0.3 * Math.sin(-3.10), -3.10, 0);

      const resNeg = estNeg.update(
        0.3 * Math.cos(3.10),
        0.3 * Math.sin(3.10),
        3.10,
        50
      );
      const dThetaNeg = unwrapAngleDelta(3.10, -3.10);
      // dTheta should be negative: 6.20 - 2*PI ≈ -0.083185 rad
      expect(dThetaNeg).toBeLessThan(0);
      expect(resNeg.omega).toBeLessThan(0);
    });

    it('4. dt <= 0 and out-of-order samples are dropped without corrupting history', () => {
      const estimator = new AngularVelocityEstimator();
      estimator.update(0.3, 0, 0, 100);

      // Duplicate timestamp (dt = 0)
      const resDup = estimator.update(0.3, 0.1, 0.3, 100);
      expect(resDup.accepted).toBe(false);
      expect(resDup.omega).toBe(0);

      // Out-of-order timestamp (dt < 0)
      const resRetro = estimator.update(0.3, 0.1, 0.3, 90);
      expect(resRetro.accepted).toBe(false);
      expect(resRetro.omega).toBe(0);

      // Legitimate subsequent sample at t = 150 ms (dt = 50 ms from original anchor)
      const resValid = estimator.update(0.3 * Math.cos(0.2), 0.3 * Math.sin(0.2), 0.2, 150);
      expect(resValid.accepted).toBe(true);
      expect(resValid.omega).toBeGreaterThan(0);
    });

    it('5. NaN and Infinity coordinate or timestamp samples are dropped safely', () => {
      const estimator = new AngularVelocityEstimator();
      estimator.update(0.3, 0, 0, 100);

      expect(estimator.update(NaN, 0, 0, 120).accepted).toBe(false);
      expect(estimator.update(0.3, Infinity, 0, 120).accepted).toBe(false);
      expect(estimator.update(0.3, 0, NaN, 120).accepted).toBe(false);
      expect(estimator.update(0.3, 0, 0, NaN).accepted).toBe(false);
      expect(estimator.update(0.3, 0, 0, -50).accepted).toBe(false);

      // Internal state unchanged
      expect(estimator.getOmega()).toBe(0);
      expect(estimator.getLastValidSampleTimeMs()).toBe(100);
    });

    it('6. Exponential smoothing with tau = 0.08 matches exact recurrence', () => {
      const estimator = new AngularVelocityEstimator();
      const dtMs = 20; // 0.02s
      const dtSec = dtMs / 1000.0;
      const rawOmegaTarget = 4.0; // rad/s
      const dTheta = rawOmegaTarget * dtSec;

      let time = 0;
      let theta = 0;
      estimator.update(0.3 * Math.cos(theta), 0.3 * Math.sin(theta), theta, time);

      let expectedOmega = 0;
      const alpha = 1.0 - Math.exp(-dtSec / MANUAL_FILTER_TAU_SECONDS);

      for (let i = 1; i <= 5; i++) {
        time += dtMs;
        theta += dTheta;
        const res = estimator.update(0.3 * Math.cos(theta), 0.3 * Math.sin(theta), theta, time);
        expectedOmega = expectedOmega + alpha * (rawOmegaTarget - expectedOmega);

        expect(res.accepted).toBe(true);
        expect(res.omega).toBeCloseTo(expectedOmega, 6);
      }
    });

    it('7. Capping at +-8 rad/s prevents large mouse spikes from corrupting filter', () => {
      const estimator = new AngularVelocityEstimator();
      estimator.update(0.3, 0, 0, 0);

      // Huge mouse jump: theta from 0 to 3.0 in 10 ms -> raw omega = 300 rad/s
      const resSpike = estimator.update(
        0.3 * Math.cos(3.0),
        0.3 * Math.sin(3.0),
        3.0,
        10
      );

      // Raw velocity is capped to 8.0 BEFORE the filter
      const dtSec = 0.01;
      const alpha = 1.0 - Math.exp(-dtSec / MANUAL_FILTER_TAU_SECONDS);
      const expectedFiltered = 0 + alpha * (MANUAL_MAX_SPEED_RAD_PER_SEC - 0);

      expect(resSpike.accepted).toBe(true);
      expect(resSpike.omega).toBeCloseTo(expectedFiltered, 6);
      expect(resSpike.omega).toBeLessThanOrEqual(MANUAL_MAX_SPEED_RAD_PER_SEC);

      // Filter decays smoothly when motion stops
      const resFollow = estimator.update(
        0.3 * Math.cos(3.0),
        0.3 * Math.sin(3.0),
        3.0,
        30
      );
      expect(resFollow.accepted).toBe(true);
      expect(resFollow.omega).toBeLessThan(resSpike.omega);
    });

    it('8. Deadzone entry clears history/drive, and exiting deadzone re-anchors', () => {
      const estimator = new AngularVelocityEstimator();
      // Moving outside deadzone (r = 0.3)
      estimator.update(0.3, 0, 0, 0);
      estimator.update(0.3 * Math.cos(0.2), 0.3 * Math.sin(0.2), 0.2, 50);
      expect(estimator.getOmega()).toBeGreaterThan(0);
      expect(estimator.isInDeadzone()).toBe(false);

      // Move into deadzone (r = 0.02 < 0.0435)
      const resDead = estimator.update(0.01, 0.01, 0, 100);
      expect(resDead.accepted).toBe(true);
      expect(resDead.omega).toBe(0);
      expect(resDead.inDeadzone).toBe(true);
      expect(estimator.getOmega()).toBe(0);
      expect(estimator.isInDeadzone()).toBe(true);

      // Move exiting deadzone (r = 0.3 > 0.0435)
      const resExit = estimator.update(0.3, 0, 0, 150);
      expect(resExit.accepted).toBe(true);
      expect(resExit.omega).toBe(0);
      expect(resExit.isAnchor).toBe(true);
      expect(resExit.inDeadzone).toBe(false);
      expect(estimator.isInDeadzone()).toBe(false);

      // Subsequent move infers velocity again
      const resResume = estimator.update(0.3 * Math.cos(0.2), 0.3 * Math.sin(0.2), 0.2, 200);
      expect(resResume.accepted).toBe(true);
      expect(resResume.omega).toBeGreaterThan(0);
      expect(resResume.isAnchor).toBe(false);
    });

    it('9. Center crossing through deadzone produces no angular velocity spike', () => {
      const estimator = new AngularVelocityEstimator();

      // Sweeping along X axis across center: -0.3 -> -0.1 -> 0 -> +0.1 -> +0.3
      const points = [
        { x: -0.3, z: 0, theta: Math.PI, t: 0 },
        { x: -0.1, z: 0, theta: Math.PI, t: 20 },
        { x: 0, z: 0, theta: 0, t: 40 }, // in deadzone (r = 0)
        { x: 0.1, z: 0, theta: 0, t: 60 }, // exiting deadzone -> anchor
        { x: 0.3, z: 0, theta: 0, t: 80 }, // normal move
      ];

      const omegas: number[] = [];
      for (const p of points) {
        const res = estimator.update(p.x, p.z, p.theta, p.t);
        omegas.push(res.omega);
      }

      // At no point should angular velocity spike
      for (const w of omegas) {
        expect(Math.abs(w)).toBeLessThanOrEqual(MANUAL_MAX_SPEED_RAD_PER_SEC);
        expect(Number.isFinite(w)).toBe(true);
      }
      // Center and exit steps are 0
      expect(omegas[2]).toBe(0); // deadzone
      expect(omegas[3]).toBe(0); // re-anchor
    });

    it('10. Gap > 150 ms between samples re-anchors with omega = 0', () => {
      const estimator = new AngularVelocityEstimator();
      estimator.update(0.3, 0, 0, 0);
      estimator.update(0.3 * Math.cos(0.2), 0.3 * Math.sin(0.2), 0.2, 50);
      expect(estimator.getOmega()).toBeGreaterThan(0);

      // Gap of 200 ms (> 150 ms)
      const resGap = estimator.update(0.3 * Math.cos(0.5), 0.3 * Math.sin(0.5), 0.5, 250);
      expect(resGap.accepted).toBe(true);
      expect(resGap.isAnchor).toBe(true);
      expect(resGap.omega).toBe(0);
      expect(estimator.getOmega()).toBe(0);
    });

    it('11. Boundary timing at 149.9 ms, 150.0 ms, and 150.1 ms', () => {
      // Test at 149.9 ms: valid sample (<= 150.0 ms)
      const est1 = new AngularVelocityEstimator();
      est1.update(0.3, 0, 0, 0);
      const res1 = est1.update(0.3 * Math.cos(0.3), 0.3 * Math.sin(0.3), 0.3, 149.9);
      expect(res1.isAnchor).toBe(false);
      expect(res1.omega).toBeGreaterThan(0);

      // Test at 150.0 ms: valid sample (<= 150.0 ms)
      const est2 = new AngularVelocityEstimator();
      est2.update(0.3, 0, 0, 0);
      const res2 = est2.update(0.3 * Math.cos(0.3), 0.3 * Math.sin(0.3), 0.3, 150.0);
      expect(res2.isAnchor).toBe(false);
      expect(res2.omega).toBeGreaterThan(0);

      // Test at 150.1 ms: gap exceeded (> 150.0 ms) -> re-anchor
      const est3 = new AngularVelocityEstimator();
      est3.update(0.3, 0, 0, 0);
      const res3 = est3.update(0.3 * Math.cos(0.3), 0.3 * Math.sin(0.3), 0.3, 150.1);
      expect(res3.isAnchor).toBe(true);
      expect(res3.omega).toBe(0);
    });

    it('12. Estimator snapshot and rollback restores exact previous state', () => {
      const estimator = new AngularVelocityEstimator();
      estimator.update(0.3, 0, 0, 0);
      estimator.update(0.3 * Math.cos(0.2), 0.3 * Math.sin(0.2), 0.2, 50);
      const snapshot = estimator.snapshot();
      const priorOmega = estimator.getOmega();

      // Corrupt state with subsequent update
      estimator.update(0.3 * Math.cos(0.8), 0.3 * Math.sin(0.8), 0.8, 100);
      expect(estimator.getOmega()).not.toBe(priorOmega);

      // Rollback
      estimator.rollback(snapshot);
      expect(estimator.getOmega()).toBe(priorOmega);
      expect(estimator.getLastValidSampleTimeMs()).toBe(50);
      expect(estimator.getHasAnchor()).toBe(true);
    });
  });

  // ===========================================================================
  // Part 2: Watchdog & Adapter Integration (Tests 13–20)
  // ===========================================================================
  describe('Part 2: Watchdog & Adapter Integration', () => {
    it('13. Held pointer releases drive after >= 150 ms without move/up', () => {
      const engine = new HeadlessSimulationEngine();
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      const adapter = new ManualStirAdapter({ engine });
      const ray = makeTopDownRay(0.3, 0);

      // Pointerdown at t = 1000 ms
      adapter.onPointerDown(1, ray, 1000);
      expect(adapter.getController().isDragActive()).toBe(true);

      // Pointer held still: at t = 1100 ms (< 150 ms elapsed), not released
      const check1 = adapter.checkStale(1100);
      expect(check1.released).toBe(false);

      // At t = 1150 ms (>= 150 ms elapsed), watchdog releases drive
      const check2 = adapter.checkStale(1150);
      expect(check2.released).toBe(true);
      expect(check2.ack?.accepted).toBe(true);
      expect(engine.getState().omegaRod).toBe(0);
      expect(engine.getState().omegaDrive).toBe(0);
    });

    it('14. Invalid ray or different pointer does not extend deadline', () => {
      const engine = new HeadlessSimulationEngine();
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      const adapter = new ManualStirAdapter({ engine });
      adapter.onPointerDown(1, makeTopDownRay(0.3, 0), 1000);

      // Event from different pointerId at t = 1100 ms
      adapter.onPointerMove(2, makeTopDownRay(0.35, 0), 1100);

      // Parallel ray event at t = 1120 ms
      const parallelRay: Ray3D = { origin: [0, 0.5, 0], direction: [1, 0, 0] };
      adapter.onPointerMove(1, parallelRay, 1120);

      // Watchdog check at t = 1150 ms: deadline was NOT extended from t = 1000 ms
      const check = adapter.checkStale(1150);
      expect(check.released).toBe(true);
    });

    it('15. Single release dispatched per stale interval', () => {
      const engine = new HeadlessSimulationEngine();
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      const adapter = new ManualStirAdapter({ engine });
      adapter.onPointerDown(1, makeTopDownRay(0.3, 0), 1000);

      // First check at t = 1150 ms triggers release
      expect(adapter.checkStale(1150).released).toBe(true);

      // Subsequent checks during the same stationary period do NOT dispatch duplicate releases
      expect(adapter.checkStale(1160).released).toBe(false);
      expect(adapter.checkStale(1200).released).toBe(false);
      expect(adapter.checkStale(2000).released).toBe(false);
    });

    it('16. Pointer move after stale release re-anchors on first sample', () => {
      const engine = new HeadlessSimulationEngine();
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      const adapter = new ManualStirAdapter({ engine });
      adapter.onPointerDown(1, makeTopDownRay(0.3, 0), 1000);

      // Stale release triggers
      adapter.checkStale(1150);

      // Move begins again at t = 1300 ms
      // First move after stale release must act as anchor with omega = 0
      const move1 = adapter.onPointerMove(1, makeTopDownRay(0.3, 0.05), 1300);
      expect(move1.accepted).toBe(true);
      expect(move1.omega).toBe(0);

      // Second move at t = 1330 ms computes angular velocity
      const move2 = adapter.onPointerMove(1, makeTopDownRay(0.28, 0.1), 1330);
      expect(move2.accepted).toBe(true);
      expect(move2.omega).toBeGreaterThan(0);
    });

    it('17. Pause, reset, and mode change properly reset histories', () => {
      const engine = new HeadlessSimulationEngine();
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      const adapter = new ManualStirAdapter({ engine });
      adapter.onPointerDown(1, makeTopDownRay(0.3, 0), 1000);

      // When engine is paused, pointermove does not change state or emit intent
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'pause' },
      });

      const movePaused = adapter.onPointerMove(1, makeTopDownRay(0.2, 0.2), 1050);
      expect(movePaused.accepted).toBe(false);

      // Resetting adapter restores baseline pose
      adapter.reset();
      expect(adapter.getController().isDragActive()).toBe(false);
      expect(adapter.getController().getOmega()).toBe(0);
    });

    it('18. Stale session does not release auto or new-generation driver', () => {
      const engine = new HeadlessSimulationEngine();
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      const adapter = new ManualStirAdapter({ engine });
      adapter.onPointerDown(1, makeTopDownRay(0.3, 0), 1000);

      // Engine switches to auto mode
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      expect(engine.getState().mode).toBe('auto');
      expect(engine.getState().autoDriveEnabled).toBe(true);

      // Watchdog from the old manual adapter must NOT release auto drive
      const check = adapter.checkStale(1200);
      expect(check.released).toBe(false);
      expect(engine.getState().autoDriveEnabled).toBe(true);
    });

    it('19. Engine rejection rolls back candidate history in adapter and controller', () => {
      const engine = new HeadlessSimulationEngine();
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      const facade = new HeadlessSimulationFacade(engine);
      const adapter = new ManualStirAdapter({ engine, facade });
      adapter.onPointerDown(1, makeTopDownRay(0.3, 0), 1000);

      const priorPose = { ...adapter.getController().getPose() };

      // Mock facade to return rejection on subsequent move
      vi.spyOn(facade, 'dispatchIntent').mockReturnValueOnce({
        clientId: engine.getClientId(),
        seq: 99,
        accepted: false,
        duplicate: false,
        reason: 'INVALID_PAYLOAD',
        generation: 0,
        stateVersion: 2,
        appliedAtTick: 0,
        controlOrdinal: null,
      });

      const res = adapter.onPointerMove(1, makeTopDownRay(0.5, 0.2), 1050);

      expect(res.accepted).toBe(false);
      expect(res.ack?.accepted).toBe(false);
      // History rolled back to previous valid pose
      expect(adapter.getController().getPose().x).toBeCloseTo(priorPose.x, 6);
      expect(adapter.getController().getPose().z).toBeCloseTo(priorPose.z, 6);
    });

    it('20. Captured generation is retained during active drag', () => {
      const engine = new HeadlessSimulationEngine();
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      const adapter = new ManualStirAdapter({ engine });
      adapter.onPointerDown(1, makeTopDownRay(0.3, 0), 1000);

      expect(adapter.getController().getCaptureGeneration()).toBe(0);
      const move = adapter.onPointerMove(1, makeTopDownRay(0.35, 0.05), 1050);
      expect(move.accepted).toBe(true);
      expect(move.ack?.accepted).toBe(true);
    });
  });

  // ===========================================================================
  // Part 3: Engine & Bridge Integration (Tests 21–28)
  // ===========================================================================
  describe('Part 3: Engine & Bridge Integration', () => {
    it('21. Manual omega drives flow via stepStirringFlow', () => {
      const engine = new HeadlessSimulationEngine();
      // Add water
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 200 },
      });
      // Set mode manual and resume
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      // Dispatch manual sample with positive omega
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 4,
        expectedGeneration: 0,
        payload: {
          type: 'manualSample',
          x: 0.35,
          z: 0.1,
          inputTimeMs: 100,
          captureGeneration: 0,
          omegaRod: 5.0,
        },
      });

      expect(engine.getState().omegaRod).toBe(5.0);

      // Advance physics
      engine.advance(0.1);
      expect(engine.getState().omegaFlow).toBeGreaterThan(0);
      expect(engine.getState().omegaDrive).toBeGreaterThan(0);
    });

    it('22. Omega 0 does not zero residual flow (decay only)', () => {
      const engine = new HeadlessSimulationEngine();
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 200 },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      // Drive flow up
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 4,
        expectedGeneration: 0,
        payload: {
          type: 'manualSample',
          x: 0.35,
          z: 0.1,
          inputTimeMs: 100,
          captureGeneration: 0,
          omegaRod: 6.0,
        },
      });
      engine.advance(0.5);
      const activeFlow = engine.getState().omegaFlow;
      expect(activeFlow).toBeGreaterThan(0.2);

      // Now stop rod drive (omegaRod = 0)
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 5,
        expectedGeneration: 0,
        payload: {
          type: 'manualSample',
          x: 0.35,
          z: 0.1,
          inputTimeMs: 600,
          captureGeneration: 0,
          omegaRod: 0,
        },
      });

      // Advance one tick (DEFAULT_H = 1/60 s)
      engine.advance(DEFAULT_H);
      const decayedFlow = engine.getState().omegaFlow;

      // Flow must NOT drop immediately to 0
      expect(decayedFlow).toBeGreaterThan(0);
      expect(decayedFlow).toBeLessThan(activeFlow);

      // Exact decay check: omegaNext = activeFlow * exp(-(A_STIR + B_STIR) * h)
      const expectedDecay = activeFlow * Math.exp(-(A_STIR + B_STIR) * DEFAULT_H);
      expect(decayedFlow).toBeCloseTo(expectedDecay, 6);
    });

    it('23. Watchdog release decays flow smoothly in SimulationBridge', () => {
      const hostClock = new MockHostClock();
      hostClock.currentTime = 1000;
      const engine = new HeadlessSimulationEngine();
      const bridge = new SimulationBridge({ engine, hostClock });
      const adapter = new ManualStirAdapter({
        engine,
        facade: bridge.getFacade(),
      });
      bridge.setManualAdapter(adapter);

      bridge.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 200 });
      bridge.dispatchIntent({ type: 'setMode', mode: 'manual' });
      bridge.dispatchIntent({ type: 'resume' });

      // Step first frame to initialize clock timestamp anchor at 1000 ms
      bridge.stepFrame(1000);

      // Start drag and move to spin up flow
      adapter.onPointerDown(1, makeTopDownRay(0.3, 0), 1000);
      adapter.onPointerMove(1, makeTopDownRay(0.3 * Math.cos(0.5), 0.3 * Math.sin(0.5)), 1050);

      // Step bridge frame at 1050 ms (delta = 50ms)
      bridge.stepFrame(1050);
      expect(engine.getState().omegaFlow).toBeGreaterThan(0);

      // Mouse stops moving; step frames until watchdog fires (>= 150 ms)
      bridge.stepFrame(1250); // 200 ms later

      // Watchdog should have released drive
      expect(engine.getState().omegaRod).toBe(0);
      expect(engine.getState().omegaDrive).toBe(0);

      // Flow decays continuously
      const flowAfterRelease = engine.getState().omegaFlow;
      expect(flowAfterRelease).toBeGreaterThan(0);

      bridge.stepFrame(1300);
      expect(engine.getState().omegaFlow).toBeLessThan(flowAfterRelease);

      bridge.destroy();
    });

    it('24. Watchdog operates on monotonic host time independent of sim accumulator', () => {
      const engine = new HeadlessSimulationEngine();
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      const adapter = new ManualStirAdapter({ engine });
      adapter.onPointerDown(1, makeTopDownRay(0.3, 0), 5000);

      // Host time elapsed 150 ms
      const res = adapter.checkStale(5150);
      expect(res.released).toBe(true);
    });

    it('25. Stale checks alone do not advance simulation time or mass', () => {
      const engine = new HeadlessSimulationEngine();
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 100 },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });

      const adapter = new ManualStirAdapter({ engine });
      const initialTick = engine.getState().tickIndex;
      const initialElapsed = engine.getState().elapsedSeconds;
      const initialMass = engine.getState().mass.W;

      // Call checkStale multiple times
      for (let t = 1000; t <= 2000; t += 100) {
        adapter.checkStale(t);
      }

      expect(engine.getState().tickIndex).toBe(initialTick);
      expect(engine.getState().elapsedSeconds).toBe(initialElapsed);
      expect(engine.getState().mass.W).toBe(initialMass);
    });

    it('26. Recorded release replays identically across 30, 60, and 120 FPS', () => {
      const createTrace = (): TraceItem[] => {
        const clientId = 'replay-client';
        return [
          {
            appliedAtTick: 0,
            command: {
              clientId,
              seq: 1,
              expectedGeneration: 0,
              payload: { type: 'add', ingredient: 'water', deciTicks: 200 },
            },
          },
          {
            appliedAtTick: 0,
            command: {
              clientId,
              seq: 2,
              expectedGeneration: 0,
              payload: { type: 'add', ingredient: 'sugar', deciTicks: 100 },
            },
          },
          {
            appliedAtTick: 0,
            command: {
              clientId,
              seq: 3,
              expectedGeneration: 0,
              payload: { type: 'setMode', mode: 'manual' },
            },
          },
          {
            appliedAtTick: 0,
            command: {
              clientId,
              seq: 4,
              expectedGeneration: 0,
              payload: { type: 'resume' },
            },
          },
          // Stir for 10 ticks
          {
            appliedAtTick: 2,
            command: {
              clientId,
              seq: 5,
              expectedGeneration: 0,
              payload: {
                type: 'manualSample',
                x: 0.3,
                z: 0.1,
                inputTimeMs: 33,
                captureGeneration: 0,
                omegaRod: 4.0,
              },
            },
          },
          // Watchdog release command at tick 12
          {
            appliedAtTick: 12,
            command: {
              clientId,
              seq: 6,
              expectedGeneration: 0,
              payload: { type: 'releaseDrive' },
            },
          },
        ];
      };

      const runReplayAtFps = (fps: number) => {
        const engine = new HeadlessSimulationEngine({ clientId: 'replay-client' });
        const trace = createTrace();
        TickBoundaryReplayHarness.replay(engine, trace, {
          fps,
          totalDurationSeconds: 0.5, // 30 ticks at h = 1/60s
        });
        return {
          tickIndex: engine.getState().tickIndex,
          elapsedSeconds: engine.getState().elapsedSeconds,
          omegaFlow: engine.getState().omegaFlow,
          Gd: engine.getState().mass.Gd,
          stateVersion: engine.getState().stateVersion,
        };
      };

      const res30 = runReplayAtFps(30);
      const res60 = runReplayAtFps(60);
      const res120 = runReplayAtFps(120);

      expect(res30.tickIndex).toBe(res60.tickIndex);
      expect(res60.tickIndex).toBe(res120.tickIndex);

      expect(res30.elapsedSeconds).toBeCloseTo(res60.elapsedSeconds, 9);
      expect(res60.elapsedSeconds).toBeCloseTo(res120.elapsedSeconds, 9);

      expect(res30.omegaFlow).toBeCloseTo(res60.omegaFlow, 6);
      expect(res60.omegaFlow).toBeCloseTo(res120.omegaFlow, 6);

      expect(res30.Gd).toBeCloseTo(res60.Gd, 6);
      expect(res60.Gd).toBeCloseTo(res120.Gd, 6);

      expect(res30.stateVersion).toBe(res60.stateVersion);
      expect(res60.stateVersion).toBe(res120.stateVersion);
    });

    it('27. Single scheduler without timer leaks under lifecycle attach/detach', () => {
      const hostClock = new MockHostClock();
      const bridge = new SimulationBridge({ hostClock });

      const listeners: Record<string, () => void> = {};
      const fakeDoc = {
        hidden: false,
        addEventListener: vi.fn((event: string, cb: () => void) => {
          listeners[event] = cb;
        }),
        removeEventListener: vi.fn((event: string, cb: () => void) => {
          if (listeners[event] === cb) {
            delete listeners[event];
          }
        }),
      };

      vi.stubGlobal('document', fakeDoc);

      try {
        const cleanup1 = bridge.attachLifecycle();
        cleanup1();

        const cleanup2 = bridge.attachLifecycle();
        bridge.start();
        expect(bridge.isSchedulerActive()).toBe(true);

        cleanup2();
        expect(bridge.isSchedulerActive()).toBe(false);
      } finally {
        vi.unstubAllGlobals();
        bridge.destroy();
      }
    });

    it('28. Full regression: all core invariants and models hold under manual interaction', () => {
      const engine = new HeadlessSimulationEngine();
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 100 },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 50 },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'manual' },
      });
      engine.dispatch({
        clientId: engine.getClientId(),
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      const adapter = new ManualStirAdapter({ engine });
      adapter.onPointerDown(1, makeTopDownRay(0.3, 0), 0);

      // Simulate a circle trajectory
      for (let i = 1; i <= 20; i++) {
        const t = i * 20; // ms
        const angle = (i * 0.15) % (2 * Math.PI);
        const x = 0.3 * Math.cos(angle);
        const z = 0.3 * Math.sin(angle);
        adapter.onPointerMove(1, makeTopDownRay(x, z), t);
        engine.advance(0.02);
      }

      // Check invariants
      const state = engine.getState();
      expect(state.mass.W).toBeCloseTo(10, 6);
      expect(state.mass.Gt).toBeCloseTo(5, 6);
      expect(state.mass.Gd + state.mass.Gu).toBeCloseTo(5, 6);
      expect(state.omegaFlow).toBeGreaterThan(0);
      expect(state.fGu).toBeGreaterThanOrEqual(0);
    });
  });
});
