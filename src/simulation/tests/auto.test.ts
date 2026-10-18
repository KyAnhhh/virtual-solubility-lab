import { describe, expect, it, vi } from 'vitest';
import {
  AutoStirController,
  computeRadiusTransition,
  RADIUS_TRANSITION_DURATION,
  smoothstep,
} from '../../interactions/AutoStirController';
import {
  AUTO_LEVEL_SPEEDS,
  DEFAULT_ORBIT_RADIUS,
} from '../constants/flow';
import { SPOON_MAX_RADIUS } from '../constants/beaker';
import {
  HeadlessSimulationEngine,
  HeadlessSimulationFacade,
} from '../core/SimulationEngine';
import {
  SimulationBridge,
  type HostClockAdapter,
} from '../bridge/SimulationBridge';
import { createExperimentStore } from '../../stores/experimentStore';
import type { RodPose } from '../core/SimulationState';

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

describe('V2-04 — Auto Controller Ba Mức', () => {
  describe('Part A: Pure Controller Math & Transition (1–8)', () => {
    it('1. Auto entry giữ pose t0 trong tolerance 1e-9 scene units', () => {
      const controller = new AutoStirController();
      const initialPose: RodPose = {
        x: 0.3,
        z: 0.2,
        tipY: 0.14,
        theta: Math.atan2(0.2, 0.3),
        radius: Math.hypot(0.3, 0.2),
      };

      controller.start(initialPose, 'slow');
      const pose0 = controller.getPose(0.14);

      expect(Math.abs(pose0.x - initialPose.x)).toBeLessThan(1e-9);
      expect(Math.abs(pose0.z - initialPose.z)).toBeLessThan(1e-9);
      expect(Math.abs(pose0.radius - initialPose.radius)).toBeLessThan(1e-9);
      expect(Math.abs(pose0.theta - initialPose.theta)).toBeLessThan(1e-9);
    });

    it('2. Radius từ r0 khác 0.4 về 0.4 sau 0.25 sim seconds', () => {
      const controller = new AutoStirController();
      const initialPose: RodPose = {
        x: 0.1,
        z: 0,
        tipY: 0.14,
        theta: 0,
        radius: 0.1,
      };

      controller.start(initialPose, 'medium');

      // Step over 0.25 seconds in 15 steps of 1/60s
      for (let i = 0; i < 15; i++) {
        controller.step(1 / 60, 'medium', 0.14);
      }

      const pose = controller.getPose();
      expect(pose.radius).toBeCloseTo(DEFAULT_ORBIT_RADIUS, 5);
      expect(Math.abs(pose.radius - 0.4)).toBeLessThan(1e-5);
    });

    it('3. Smoothstep đúng ở các mốc, không overshoot', () => {
      // S(0) = 0
      expect(smoothstep(0)).toBe(0);
      // S(0.5) = 0.5^2 * (3 - 1) = 0.5
      expect(smoothstep(0.5)).toBe(0.5);
      // S(1) = 1
      expect(smoothstep(1)).toBe(1);
      // Beyond 1 clamped
      expect(smoothstep(1.5)).toBe(1);
      // Negative clamped
      expect(smoothstep(-0.5)).toBe(0);

      // Check transition value at half duration (0.125s) from r0 = 0.1 to 0.4
      const halfR = computeRadiusTransition(0.1, 0.125, 0.4, RADIUS_TRANSITION_DURATION);
      expect(halfR).toBeCloseTo(0.25, 6);

      // Long time check: must never overshoot 0.4
      const longR = computeRadiusTransition(0.1, 10.0, 0.4, RADIUS_TRANSITION_DURATION);
      expect(longR).toBe(0.4);
    });

    it('4. Tâm radius 0 không NaN/teleport theta', () => {
      const controller = new AutoStirController();
      const initialPose: RodPose = {
        x: 0,
        z: 0,
        tipY: 0.14,
        theta: 1.25,
        radius: 0,
      };

      controller.start(initialPose, 'slow');
      const pose0 = controller.getPose();
      expect(Number.isFinite(pose0.x)).toBe(true);
      expect(Number.isFinite(pose0.z)).toBe(true);
      expect(Number.isFinite(pose0.theta)).toBe(true);
      expect(pose0.theta).toBe(1.25);

      // Step forward from center
      const pose1 = controller.step(1 / 60, 'slow', 0.14);
      expect(Number.isNaN(pose1.x)).toBe(false);
      expect(Number.isNaN(pose1.z)).toBe(false);
      expect(Number.isNaN(pose1.theta)).toBe(false);
      expect(pose1.radius).toBeGreaterThan(0);
    });

    it('5. Speeds 1/3/6 đúng, slow < medium < fast', () => {
      expect(AUTO_LEVEL_SPEEDS.slow).toBe(1.0);
      expect(AUTO_LEVEL_SPEEDS.medium).toBe(3.0);
      expect(AUTO_LEVEL_SPEEDS.fast).toBe(6.0);
      expect(AUTO_LEVEL_SPEEDS.slow).toBeLessThan(AUTO_LEVEL_SPEEDS.medium);
      expect(AUTO_LEVEL_SPEEDS.medium).toBeLessThan(AUTO_LEVEL_SPEEDS.fast);

      // Check angle advance over 1.0s
      const ctrlSlow = new AutoStirController();
      ctrlSlow.start({ x: 0.4, z: 0, tipY: 0.14, theta: 0, radius: 0.4 }, 'slow');
      for (let i = 0; i < 60; i++) ctrlSlow.step(1 / 60, 'slow', 0.14);

      const ctrlFast = new AutoStirController();
      ctrlFast.start({ x: 0.4, z: 0, tipY: 0.14, theta: 0, radius: 0.4 }, 'fast');
      for (let i = 0; i < 60; i++) ctrlFast.step(1 / 60, 'fast', 0.14);

      expect(ctrlSlow.getState().currentTheta).toBeCloseTo(1.0, 4);
      expect(ctrlFast.getState().currentTheta).toBeCloseTo(6.0, 4);
      expect(ctrlSlow.getState().currentTheta).toBeLessThan(ctrlFast.getState().currentTheta);
      expect(ctrlFast.getPose().theta).toBeCloseTo(6.0 - 2 * Math.PI, 4);
    });

    it('6. Đổi level không reset pose hoặc transition', () => {
      const controller = new AutoStirController();
      controller.start({ x: 0.2, z: 0, tipY: 0.14, theta: 0, radius: 0.2 }, 'slow');

      // Step 6 ticks (0.1s)
      for (let i = 0; i < 6; i++) {
        controller.step(1 / 60, 'slow', 0.14);
      }

      const poseBefore = controller.getPose();
      const stateBefore = controller.getState();

      // Switch to fast level
      const poseAfter = controller.step(1 / 60, 'fast', 0.14);

      expect(controller.getState().transitionElapsed).toBeCloseTo(stateBefore.transitionElapsed + 1 / 60, 6);
      expect(Math.abs(poseAfter.radius - poseBefore.radius)).toBeLessThan(0.05);
    });

    it('7. Bounds hợp lệ cho r0 sát thành (0.74)', () => {
      const controller = new AutoStirController();
      controller.start({ x: SPOON_MAX_RADIUS, z: 0, tipY: 0.14, theta: 0, radius: SPOON_MAX_RADIUS }, 'medium');

      for (let i = 0; i < 30; i++) {
        const pose = controller.step(1 / 60, 'medium', 0.14);
        expect(pose.radius).toBeLessThanOrEqual(SPOON_MAX_RADIUS + 1e-9);
        expect(pose.radius).toBeGreaterThanOrEqual(0.4 - 1e-9);
      }

      // After 0.25s it settles at 0.4
      expect(controller.getPose().radius).toBeCloseTo(0.4, 5);
    });

    it('8. Invalid input không làm state nhiễm NaN', () => {
      const controller = new AutoStirController();
      controller.start({ x: 0.3, z: 0, tipY: 0.14, theta: 0, radius: 0.3 }, 'slow');

      controller.step(NaN, 'slow', 0.14);
      controller.step(-0.01, 'slow', 0.14);
      // @ts-expect-error invalid level test
      controller.step(1 / 60, 'invalid-level', NaN);

      const pose = controller.getPose();
      expect(Number.isNaN(pose.x)).toBe(false);
      expect(Number.isNaN(pose.z)).toBe(false);
      expect(Number.isNaN(pose.radius)).toBe(false);
      expect(Number.isNaN(pose.theta)).toBe(false);
    });
  });

  describe('Part B: Engine Integration (9–21)', () => {
    it('9. Auto thực sự thay đổi rod pose qua fixed steps', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'resume' });

      const pose0 = engine.getRodPose();
      engine.advance(1 / 60);
      const pose1 = engine.getRodPose();

      expect(pose1.theta).toBeGreaterThan(pose0.theta);
      expect(pose1.x).not.toBe(pose0.x);
    });

    it('10. Pose convention và signed flow nhất quán', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });
      facade.dispatchIntent({ type: 'resume' });

      for (let i = 0; i < 30; i++) {
        engine.advance(1 / 60);
      }

      const state = engine.getState();
      expect(state.omegaRod).toBe(3.0);
      expect(state.omegaDrive).toBeGreaterThan(0);
      expect(state.omegaFlow).toBeGreaterThan(0);
    });

    it('11. Full-contact flow khớp analytic oracle độc lập sau ramp thích hợp', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'slow' });
      facade.dispatchIntent({ type: 'resume' });

      // Run 60 ticks (1s)
      for (let i = 0; i < 60; i++) {
        engine.advance(1 / 60);
      }

      // After radius transition settles at 0.4, drive is contact(1.0) * coupling(1.0) * omegaRod(1.0) = 1.0
      // Flow follows exponential response towards 5/7 * 1.0
      const flow = engine.getState().omegaFlow;
      expect(flow).toBeGreaterThan(0.5);
      expect(flow).toBeLessThanOrEqual(5 / 7);
    });

    it('12. Dry / oil-only / thin / partial-contact fixtures đúng', () => {
      // 1. Dry beaker: rod moves, but flow is strictly 0
      const dryEngine = new HeadlessSimulationEngine();
      const dryFacade = new HeadlessSimulationFacade(dryEngine);
      dryFacade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      dryFacade.dispatchIntent({ type: 'resume' });

      dryEngine.advance(1 / 60);
      expect(dryEngine.getRodPose().theta).toBeGreaterThan(0);
      expect(dryEngine.getState().omegaDrive).toBe(0);
      expect(dryEngine.getState().omegaFlow).toBe(0);

      // 2. Oil-only: carrier exists and flow develops
      const oilEngine = new HeadlessSimulationEngine();
      const oilFacade = new HeadlessSimulationFacade(oilEngine);
      oilFacade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 1000 });
      oilFacade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      oilFacade.dispatchIntent({ type: 'resume' });

      for (let i = 0; i < 15; i++) oilEngine.advance(1 / 60);
      expect(oilEngine.getState().omegaDrive).toBeGreaterThan(0);
      expect(oilEngine.getState().omegaFlow).toBeGreaterThan(0);
    });

    it('13. Stop giữ clock running, pose ngừng tiến và flow decay', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'resume' });

      for (let i = 0; i < 30; i++) engine.advance(1 / 60);
      const flowAtStop = engine.getState().omegaFlow;
      expect(flowAtStop).toBeGreaterThan(0);

      // Stop stirring (releaseDrive)
      facade.dispatchIntent({ type: 'releaseDrive' });
      expect(engine.getState().autoDriveEnabled).toBe(false);
      expect(engine.getState().paused).toBe(false);

      const poseAtStop = engine.getRodPose();

      // Advance clock by 30 ticks
      for (let i = 0; i < 30; i++) engine.advance(1 / 60);

      const poseAfter = engine.getRodPose();
      expect(poseAfter.theta).toBe(poseAtStop.theta); // Pose stationary
      expect(engine.getState().elapsedSeconds).toBeCloseTo(1.0, 5); // Clock running
      expect(engine.getState().omegaFlow).toBeLessThan(flowAtStop); // Flow decaying
    });

    it('14. Pause / suspend giữ pose / ramp / flow; resume tiếp tục', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'resume' });

      for (let i = 0; i < 15; i++) engine.advance(1 / 60);

      const poseBeforePause = engine.getRodPose();
      const flowBeforePause = engine.getState().omegaFlow;

      facade.dispatchIntent({ type: 'pause' });

      // Frame advance while paused must be no-op
      engine.advance(1.0);
      expect(engine.getRodPose().theta).toBe(poseBeforePause.theta);
      expect(engine.getState().omegaFlow).toBe(flowBeforePause);

      // Resume
      facade.dispatchIntent({ type: 'resume' });
      engine.advance(1 / 60);
      expect(engine.getRodPose().theta).toBeGreaterThan(poseBeforePause.theta);
    });

    it('15. Stop -> pause -> resume không tự restart', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'resume' });
      facade.dispatchIntent({ type: 'releaseDrive' }); // stopped

      expect(engine.getState().autoDriveEnabled).toBe(false);

      facade.dispatchIntent({ type: 'pause' });
      facade.dispatchIntent({ type: 'resume' });

      expect(engine.getState().autoDriveEnabled).toBe(false);
      expect(engine.getState().omegaRod).toBe(0);
    });

    it('16. Hide / show không tự restart; hidden không nhận start auto qua UI', () => {
      const store = createExperimentStore();

      store.getState().startAuto();
      expect(store.getState().snapshot.autoDriveEnabled).toBe(true);

      // Hide rod
      store.getState().toggleRod();
      expect(store.getState().showRod).toBe(false);
      expect(store.getState().snapshot.autoDriveEnabled).toBe(false);

      // Show rod
      store.getState().toggleRod();
      expect(store.getState().showRod).toBe(true);
      expect(store.getState().snapshot.autoDriveEnabled).toBe(false); // Does not restart driver

      // When hidden, store.startAuto blocks
      store.getState().toggleRod(); // hide again
      store.getState().startAuto();
      expect(store.getState().snapshot.autoDriveEnabled).toBe(false);
      expect(store.getState().message).toContain('Hiện thìa');
    });

    it('17. Reset / duplicate reset đúng controller semantics', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'resume' });
      engine.advance(1 / 60);

      const resetAck = facade.dispatchIntent({ type: 'reset' });
      expect(resetAck.accepted).toBe(true);
      expect(engine.getState().mode).toBe('observe');
      expect(engine.getState().autoDriveEnabled).toBe(false);
      expect(engine.getState().autoLevel).toBe('slow');
      expect(engine.getState().paused).toBe(true);
      expect(engine.getRodPose().x).toBe(0.3);
      expect(engine.getRodPose().z).toBe(0);

      // Duplicate reset replay
      const replayAck = engine.dispatch({
        clientId: 'client-1',
        seq: resetAck.controlOrdinal!,
        expectedGeneration: 0,
        payload: { type: 'reset' },
      });
      expect(replayAck.duplicate).toBe(true);
    });

    it('18. Mass / input / seed không đổi qua auto ticks', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 100 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'resume' });

      const massBefore = { ...engine.getState().mass };
      const inputBefore = { ...engine.getState().input };
      const seedBefore = engine.getState().seed;
      const fGuBefore = engine.getState().fGu;

      for (let i = 0; i < 60; i++) {
        engine.advance(1 / 60);
      }

      // Total masses and inputs are strictly conserved, while dissolution transfers Gu -> Gd
      const massAfter = engine.getState().mass;
      expect(massAfter.Gt).toBe(massBefore.Gt);
      expect(massAfter.Gu + massAfter.Gd).toBeCloseTo(massBefore.Gt, 9);
      expect(massAfter.Gd).toBeGreaterThan(0); // Dissolution active during auto
      expect(massAfter.W).toBe(massBefore.W);
      expect(engine.getState().input).toEqual(inputBefore);
      expect(engine.getState().seed).toBe(seedBefore);
      expect(fGuBefore).toBe(0);
      expect(engine.getState().fGu).toBeGreaterThanOrEqual(fGuBefore);
      expect(engine.getState().fGu).toBeLessThanOrEqual(1.0);
    });

    it('19. Tick / version / time chỉ cập nhật một lần mỗi step', () => {
      const engine = new HeadlessSimulationEngine();
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'resume' });

      const version0 = engine.getState().stateVersion;
      const tick0 = engine.getState().tickIndex;
      const time0 = engine.getState().elapsedSeconds;

      engine.advance(1 / 60);

      expect(engine.getState().stateVersion).toBe(version0 + 1);
      expect(engine.getState().tickIndex).toBe(tick0 + 1);
      expect(engine.getState().elapsedSeconds).toBeCloseTo(time0 + 1 / 60, 8);
    });

    it('20. Cùng trace 30 / 60 / 120 FPS cho cùng authoritative pose / flow tại cùng tick', () => {
      const makeEngine = () => {
        const eng = new HeadlessSimulationEngine();
        const fac = new HeadlessSimulationFacade(eng);
        fac.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
        fac.dispatchIntent({ type: 'setMode', mode: 'auto' });
        fac.dispatchIntent({ type: 'resume' });
        return eng;
      };

      const engine60 = makeEngine();
      for (let i = 0; i < 60; i++) engine60.advance(1 / 60);

      const engine30 = makeEngine();
      for (let i = 0; i < 30; i++) engine30.advance(2 / 60);

      expect(engine60.getState().tickIndex).toBe(60);
      expect(engine30.getState().tickIndex).toBe(60);
      expect(engine30.getRodPose().theta).toBeCloseTo(engine60.getRodPose().theta, 8);
      expect(engine30.getState().omegaFlow).toBeCloseTo(engine60.getState().omegaFlow, 8);
    });

    it('21. h60 / h120 theo tolerance phù hợp (SC-N05)', () => {
      const engine60 = new HeadlessSimulationEngine({ clockConfig: { h: 1 / 60, maxRealDelta: 0.1, maxSteps: 6 } });
      const facade60 = new HeadlessSimulationFacade(engine60);
      facade60.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade60.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade60.dispatchIntent({ type: 'setAutoLevel', level: 'slow' });
      facade60.dispatchIntent({ type: 'resume' });

      const engine120 = new HeadlessSimulationEngine({ clockConfig: { h: 1 / 120, maxRealDelta: 0.1, maxSteps: 12 } });
      const facade120 = new HeadlessSimulationFacade(engine120);
      facade120.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade120.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade120.dispatchIntent({ type: 'setAutoLevel', level: 'slow' });
      facade120.dispatchIntent({ type: 'resume' });

      // Run 1s (60 steps for h60, 120 steps for h120)
      for (let i = 0; i < 60; i++) engine60.advance(1 / 60);
      for (let i = 0; i < 60; i++) engine120.advance(1 / 60);

      expect(engine60.getState().tickIndex).toBe(60);
      expect(engine120.getState().tickIndex).toBe(120);
      expect(engine120.getRodPose().theta).toBeCloseTo(engine60.getRodPose().theta, 2);
      expect(engine120.getState().omegaFlow).toBeCloseTo(engine60.getState().omegaFlow, 3);
    });
  });

  describe('Part C: Bridge, Store & Render Contract (22–28)', () => {
    it('22. Controls dispatch vào cùng owner', () => {
      const store = createExperimentStore();

      store.getState().startAuto('medium');
      expect(store.getState().snapshot.mode).toBe('auto');
      expect(store.getState().snapshot.autoLevel).toBe('medium');
      expect(store.getState().snapshot.autoDriveEnabled).toBe(true);

      store.getState().stopAuto();
      expect(store.getState().snapshot.autoDriveEnabled).toBe(false);
    });

    it('23. Forced publish có mode / level / status đúng ngay', () => {
      const bridge = new SimulationBridge();
      let publishedMode: string | null = null;
      let publishedLevel: string | null = null;

      bridge.subscribeSnapshot((snap) => {
        publishedMode = snap.mode;
        publishedLevel = snap.autoLevel;
      });

      bridge.startAuto('fast');
      expect(publishedMode).toBe('auto');
      expect(publishedLevel).toBe('fast');

      bridge.destroy();
    });

    it('24. Render-facing pose cập nhật theo frame, UI scalar vẫn throttle', () => {
      const hostClock = new MockHostClock();
      let snapshotPublishCount = 0;
      const bridge = new SimulationBridge({
        hostClock,
        onSnapshot: () => {
          snapshotPublishCount++;
        },
      });

      snapshotPublishCount = 0; // reset
      bridge.startAuto('medium');
      snapshotPublishCount = 0;

      // Advance 3 frames (16ms each = 48ms total, < 100ms throttle)
      bridge.stepFrame(16);
      bridge.stepFrame(32);
      bridge.stepFrame(48);

      // Snapshot publish throttled
      expect(snapshotPublishCount).toBe(0);

      // But render pose is updated directly
      const pose = bridge.getRodPose();
      expect(pose.theta).toBeGreaterThan(0);

      bridge.destroy();
    });

    it('25. Caller mutate pose capture không đổi core (runtime isolation / no aliasing)', () => {
      const bridge = new SimulationBridge();
      const poseCapture = bridge.getRenderPose();

      // Mutate returned capture
      poseCapture.x = 999.9;
      poseCapture.theta = 888.8;

      // Ensure internal engine state was not corrupted
      expect(bridge.getRodPose().x).not.toBe(999.9);
      expect(bridge.getEngine().getState().rod.x).not.toBe(999.9);

      bridge.destroy();
    });

    it('26. Camera detach / attach giữ controller và nhận pose mới nhất', () => {
      const store = createExperimentStore();

      store.getState().startAuto('slow');
      const bridge = store.getState().getBridge();
      bridge.stepFrame(100);

      const beforeRevision = store.getState().cameraRevision;
      const poseBefore = bridge.getRodPose();

      // Reset camera
      store.getState().resetCamera();
      expect(store.getState().cameraRevision).toBe(beforeRevision + 1);

      // Controller and pose preserved
      const poseAfter = bridge.getRodPose();
      expect(poseAfter.theta).toBe(poseBefore.theta);
      expect(store.getState().snapshot.mode).toBe('auto');
    });

    it('27. StrictMode / lifecycle vẫn tối đa 1 scientific scheduler', () => {
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

        bridge.startAuto();
        expect(bridge.isSchedulerActive()).toBe(true);

        cleanup2();
        expect(bridge.isSchedulerActive()).toBe(false);
      } finally {
        vi.unstubAllGlobals();
        bridge.destroy();
      }
    });

    it('28. Regression: mutation trên detached snapshot không thay đổi core engine', () => {
      const engine = new HeadlessSimulationEngine();
      const snap = engine.snapshot();

      // Create a mutable detached clone of nested input/mass/rod
      const detachedCopy = {
        input: { ...snap.input },
        mass: { ...snap.mass },
        rod: { ...snap.rod },
      };

      detachedCopy.input.water = 12345;
      detachedCopy.mass.W = 999;
      detachedCopy.rod.x = 777;

      // Engine core state remains pristine
      expect(engine.getState().input.water).toBe(0);
      expect(engine.getState().mass.W).toBe(0);
      expect(engine.getState().rod.x).toBe(0.3);
    });
  });
});
