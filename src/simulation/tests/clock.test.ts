import { describe, expect, it } from 'vitest';
import {
  DEFAULT_H,
  DEFAULT_MAX_REAL_DELTA,
  DEFAULT_MAX_STEPS,
  SimulationClock,
  validateClockConfig,
} from '../core/SimulationClock';
import {
  HeadlessSimulationEngine,
} from '../core/HeadlessSimulationEngine';
import {
  TickBoundaryReplayHarness,
  type TraceItem,
} from '../core/ReplayHarness';

describe('V2-02 — SimulationClock & Timestep Accumulator', () => {
  describe('1. Default config & invalid config validation', () => {
    it('initializes with default clock configuration', () => {
      const clock = new SimulationClock();
      const config = clock.getConfig();

      expect(config.h).toBeCloseTo(DEFAULT_H, 10);
      expect(config.h).toBeCloseTo(1 / 60, 10);
      expect(config.maxRealDelta).toBe(DEFAULT_MAX_REAL_DELTA);
      expect(config.maxRealDelta).toBe(0.1);
      expect(config.maxSteps).toBe(DEFAULT_MAX_STEPS);
      expect(config.maxSteps).toBe(6);
      expect(clock.getAccumulator()).toBe(0);
      expect(clock.getDroppedActiveWallTime()).toBe(0);
      expect(clock.getIsSuspended()).toBe(false);
      expect(clock.getLastTimestampMs()).toBeNull();
    });

    it('rejects invalid h (non-positive, non-finite, not number)', () => {
      expect(() => validateClockConfig({ h: 0 })).toThrow(TypeError);
      expect(() => validateClockConfig({ h: -0.01 })).toThrow(TypeError);
      expect(() => validateClockConfig({ h: NaN })).toThrow(TypeError);
      expect(() => validateClockConfig({ h: Infinity })).toThrow(TypeError);
      expect(() => validateClockConfig({ h: '1/60' as unknown as number })).toThrow(TypeError);
    });

    it('rejects invalid maxRealDelta (non-positive, non-finite)', () => {
      expect(() => validateClockConfig({ maxRealDelta: 0 })).toThrow(TypeError);
      expect(() => validateClockConfig({ maxRealDelta: -0.1 })).toThrow(TypeError);
      expect(() => validateClockConfig({ maxRealDelta: Infinity })).toThrow(TypeError);
    });

    it('rejects invalid maxSteps (non-integer, non-positive)', () => {
      expect(() => validateClockConfig({ maxSteps: 0 })).toThrow(TypeError);
      expect(() => validateClockConfig({ maxSteps: -5 })).toThrow(TypeError);
      expect(() => validateClockConfig({ maxSteps: 2.5 })).toThrow(TypeError);
    });
  });

  describe('2. dt0, negative dt, NaN, Infinity; invalid calls do not alter clock', () => {
    it('handles dt = 0 as pure no-op', () => {
      let stepCount = 0;
      const clock = new SimulationClock(undefined, () => stepCount++);

      const res = clock.advance(0, true);
      expect(res.ok).toBe(true);
      expect(res.stepsExecuted).toBe(0);
      expect(res.droppedWallTime).toBe(0);
      expect(clock.getAccumulator()).toBe(0);
      expect(stepCount).toBe(0);
    });

    it('rejects negative, NaN, and Infinity dt with diagnostic without altering clock', () => {
      let stepCount = 0;
      const clock = new SimulationClock(undefined, () => stepCount++);

      const resNeg = clock.advance(-0.016, true);
      expect(resNeg.ok).toBe(false);
      expect(resNeg.error).toBe('INVALID_DELTA');
      expect(resNeg.stepsExecuted).toBe(0);

      const resNaN = clock.advance(NaN, true);
      expect(resNaN.ok).toBe(false);
      expect(resNaN.error).toBe('INVALID_DELTA');

      const resInf = clock.advance(Infinity, true);
      expect(resInf.ok).toBe(false);
      expect(resInf.error).toBe('INVALID_DELTA');

      expect(clock.getAccumulator()).toBe(0);
      expect(clock.getDroppedActiveWallTime()).toBe(0);
      expect(stepCount).toBe(0);
    });
  });

  describe('3. Four calls of 1/240 produce exactly 1 tick (SC-T03)', () => {
    it('accumulates four 1/240s calls to execute exactly one 1/60s step', () => {
      let stepCount = 0;
      const clock = new SimulationClock(undefined, () => stepCount++);

      const dt = 1 / 240;

      const res1 = clock.advance(dt, true);
      expect(res1.stepsExecuted).toBe(0);
      expect(clock.getAccumulator()).toBeCloseTo(1 / 240, 10);

      const res2 = clock.advance(dt, true);
      expect(res2.stepsExecuted).toBe(0);
      expect(clock.getAccumulator()).toBeCloseTo(2 / 240, 10);

      const res3 = clock.advance(dt, true);
      expect(res3.stepsExecuted).toBe(0);
      expect(clock.getAccumulator()).toBeCloseTo(3 / 240, 10);

      const res4 = clock.advance(dt, true);
      expect(res4.stepsExecuted).toBe(1);
      expect(clock.getAccumulator()).toBeCloseTo(0, 10);
      expect(stepCount).toBe(1);
    });
  });

  describe('4. Large delta 5s: cap, step budget, dropped time (SC-T03 / §7)', () => {
    it('clamps 5s to 0.1s, executes 6 steps and records 4.9s dropped time', () => {
      let stepCount = 0;
      const clock = new SimulationClock(undefined, () => stepCount++);

      const res = clock.advance(5.0, true);
      expect(res.ok).toBe(true);
      expect(res.stepsExecuted).toBe(6);
      expect(res.droppedWallTime).toBeCloseTo(4.9, 8);
      expect(clock.getDroppedActiveWallTime()).toBeCloseTo(4.9, 8);
      expect(clock.getAccumulator()).toBeCloseTo(0, 10);
      expect(stepCount).toBe(6);
    });
  });

  describe('5. Custom low budget: drops integer backlog and preserves fractional remainder', () => {
    it('drops integer backlog when step budget is lower than needed', () => {
      let stepCount = 0;
      // h = 1/60, maxSteps = 2, maxRealDelta = 0.1
      const clock = new SimulationClock({ maxSteps: 2, maxRealDelta: 0.1 }, () => stepCount++);

      // 0.1s requires 6 steps. With budget 2, executes 2 steps, drops 4 steps (4/60s)
      const res = clock.advance(0.1, true);
      expect(res.ok).toBe(true);
      expect(res.stepsExecuted).toBe(2);
      expect(stepCount).toBe(2);
      expect(res.droppedWallTime).toBeCloseTo(4 / 60, 8);
      expect(clock.getDroppedActiveWallTime()).toBeCloseTo(4 / 60, 8);
      expect(clock.getAccumulator()).toBeCloseTo(0, 10);
    });

    it('preserves fractional remainder when backlog is dropped', () => {
      let stepCount = 0;
      const clock = new SimulationClock({ maxSteps: 2, maxRealDelta: 0.1 }, () => stepCount++);

      // dt = 0.045s -> 2 full steps of 1/60s (0.033333s) + remainder 0.01166666s
      const res = clock.advance(0.045, true);
      expect(res.ok).toBe(true);
      expect(res.stepsExecuted).toBe(2);
      expect(res.droppedWallTime).toBe(0);
      expect(clock.getAccumulator()).toBeCloseTo(0.045 - 2 / 60, 10);
      expect(stepCount).toBe(2);
    });
  });

  describe('6. h = 1/120: budget 12 and correct time (SC-T03)', () => {
    it('automatically defaults maxSteps to 12 when h is 1/120', () => {
      let stepCount = 0;
      const clock = new SimulationClock({ h: 1 / 120 }, () => stepCount++);

      expect(clock.getConfig().maxSteps).toBe(12);

      // 0.1s delta produces exactly 12 steps of 1/120s
      const res = clock.advance(0.1, true);
      expect(res.ok).toBe(true);
      expect(res.stepsExecuted).toBe(12);
      expect(res.droppedWallTime).toBe(0);
      expect(clock.getAccumulator()).toBeCloseTo(0, 10);
      expect(stepCount).toBe(12);
    });
  });

  describe('7. Pause with remainder h/2: drops remainder into droppedActiveWallTime (SC-T02)', () => {
    it('clears fractional remainder on pause without counting paused duration in dropped time', () => {
      const clock = new SimulationClock();

      // Accumulate h/2 (1/120 s) while running
      clock.advance(1 / 120, true);
      expect(clock.getAccumulator()).toBeCloseTo(1 / 120, 10);
      expect(clock.getDroppedActiveWallTime()).toBe(0);

      // Trigger pause
      clock.onPause();
      expect(clock.getAccumulator()).toBe(0);
      expect(clock.getDroppedActiveWallTime()).toBeCloseTo(1 / 120, 10);

      // Advance 10s while paused: must NOT add 10s to droppedActiveWallTime!
      const resPaused = clock.advance(10.0, false);
      expect(resPaused.stepsExecuted).toBe(0);
      expect(resPaused.droppedWallTime).toBe(0);
      expect(clock.getDroppedActiveWallTime()).toBeCloseTo(1 / 120, 10);
    });
  });

  describe('8. Hidden 5s -> visible: no advance, first delta 0, hidden gap not dropped (SC-T02)', () => {
    it('handles suspend and visible correctly without fast-forward', () => {
      let stepCount = 0;
      const clock = new SimulationClock(undefined, () => stepCount++);

      // Running with timestamp adapter
      clock.advanceTimestamp(1000, true); // first frame: dt = 0
      clock.advanceTimestamp(1000 + 1000 / 60, true); // frame 2: 1/60s -> 1 step
      expect(stepCount).toBe(1);

      // Accumulate h/2
      clock.advanceTimestamp(1000 + 1000 / 60 + 1000 / 120, true);
      expect(clock.getAccumulator()).toBeCloseTo(1 / 120, 10);

      // Page hidden: suspend
      clock.suspend();
      expect(clock.getIsSuspended()).toBe(true);
      expect(clock.getAccumulator()).toBe(0);
      expect(clock.getDroppedActiveWallTime()).toBeCloseTo(1 / 120, 10);

      // 5 seconds pass while hidden: advance calls do nothing
      clock.advance(5.0, true);
      expect(clock.getDroppedActiveWallTime()).toBeCloseTo(1 / 120, 10); // hidden gap NOT dropped

      // Page becomes visible
      clock.visible();
      expect(clock.getIsSuspended()).toBe(false);

      // First timestamp after visible: delta is 0, no fast-forward!
      const resFirst = clock.advanceTimestamp(6000, true);
      expect(resFirst.stepsExecuted).toBe(0);
      expect(resFirst.droppedWallTime).toBe(0);
      expect(stepCount).toBe(1);

      // Next timestamp advances normally
      const resNext = clock.advanceTimestamp(6000 + 1000 / 60, true);
      expect(resNext.stepsExecuted).toBe(1);
      expect(stepCount).toBe(2);
    });
  });

  describe('9. User pause preserved after suspend/visible', () => {
    it('keeps user pause when visible is called on a paused engine', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      // Engine is paused by default
      expect(engine.getState().paused).toBe(true);

      engine.suspend();
      expect(engine.getClock().getIsSuspended()).toBe(true);

      engine.visible();
      expect(engine.getClock().getIsSuspended()).toBe(false);
      // User pause MUST remain true
      expect(engine.getState().paused).toBe(true);

      // advance while paused does not advance tick
      engine.advance(1.0);
      expect(engine.getState().tickIndex).toBe(0);
      expect(engine.getState().elapsedSeconds).toBe(0);
    });
  });

  describe('10. Reset clears old timing; duplicate reset does not clear timing', () => {
    it('clears accumulator and resets clock on new reset; preserves timing on duplicate reset', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      // Resume and advance 6 steps
      engine.dispatch({ clientId: 'client-1', seq: 1, expectedGeneration: 0, payload: { type: 'resume' } });
      engine.advance(0.1);
      expect(engine.getState().tickIndex).toBe(6);

      // Add h/2 remainder
      engine.advance(1 / 120);
      expect(engine.getAccumulator()).toBeCloseTo(1 / 120, 10);

      // Distinct reset seq 2
      engine.dispatch({ clientId: 'client-1', seq: 2, expectedGeneration: 0, payload: { type: 'reset' } });
      expect(engine.getState().tickIndex).toBe(0);
      expect(engine.getState().elapsedSeconds).toBe(0);
      expect(engine.getAccumulator()).toBe(0);
      expect(engine.getDroppedActiveWallTime()).toBe(0);

      // In generation 1: resume and add remainder
      engine.dispatch({ clientId: 'client-1', seq: 3, expectedGeneration: 1, payload: { type: 'resume' } });
      engine.advance(1 / 120);
      expect(engine.getAccumulator()).toBeCloseTo(1 / 120, 10);

      // Duplicate replay of seq 2 reset: MUST NOT reset timing or clear accumulator!
      const dupAck = engine.dispatch({
        clientId: 'client-1',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'reset' },
      });
      expect(dupAck.duplicate).toBe(true);
      expect(engine.getAccumulator()).toBeCloseTo(1 / 120, 10); // preserved!
    });
  });

  describe('11. StateVersion increases on accepted command and each tick; rejection/duplicate does not', () => {
    it('strictly tracks stateVersion increment rules', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      expect(engine.getState().stateVersion).toBe(0);

      // Accepted command: version -> 1
      engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 100 },
      });
      expect(engine.getState().stateVersion).toBe(1);

      // Duplicate command: version remains 1
      engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 100 },
      });
      expect(engine.getState().stateVersion).toBe(1);

      // Rejected command (exceeds max): version remains 1
      engine.dispatch({
        clientId: 'client-1',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 99999 },
      });
      expect(engine.getState().stateVersion).toBe(1);

      // Resume: version -> 2
      engine.dispatch({
        clientId: 'client-1',
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });
      expect(engine.getState().stateVersion).toBe(2);

      // Advance 1 step: version -> 3
      engine.advance(1 / 60);
      expect(engine.getState().stateVersion).toBe(3);

      // Advance 2 steps: version -> 5
      engine.advance(2 / 60);
      expect(engine.getState().stateVersion).toBe(5);
    });
  });

  describe('12. Command at tick 120 has appliedAtTick 120 and takes effect before step 121 (SC-T01)', () => {
    it('dispatches command during multi-step advance exactly at tick 120 before step 121', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      // Start by adding water and resuming at tick 0
      engine.dispatch({ clientId: 'client-1', seq: 1, expectedGeneration: 0, payload: { type: 'add', ingredient: 'water', deciTicks: 1000 } });
      engine.dispatch({ clientId: 'client-1', seq: 2, expectedGeneration: 0, payload: { type: 'resume' } });

      let dispatchedAck: unknown = null;
      let massAtStep121 = 0;

      // Before-step hook to inject command at tick 120
      engine.setBeforeStepHook((currentTick) => {
        if (currentTick === 120) {
          dispatchedAck = engine.dispatch({
            clientId: 'client-1',
            seq: 3,
            expectedGeneration: 0,
            payload: { type: 'add', ingredient: 'sugar', deciTicks: 100 }, // 10g sugar
          });
        }
        if (currentTick === 121) {
          massAtStep121 = engine.getState().mass.Gt;
        }
      });

      // Advance 2.5 seconds (150 steps). A single frame advances 2 steps at a time
      for (let i = 0; i < 75; i++) {
        engine.advance(2 / 60);
      }

      expect(engine.getState().tickIndex).toBe(150);
      expect(dispatchedAck).toEqual({
        clientId: 'client-1',
        seq: 3,
        accepted: true,
        duplicate: false,
        reason: null,
        generation: 0,
        stateVersion: expect.any(Number),
        appliedAtTick: 120, // number of completed steps before command
        controlOrdinal: 3,
      });

      // Sugar mass was already updated before step 121 ran!
      expect(massAtStep121).toBe(10);
    });
  });

  describe('13. Same trace at 30, 60, 120 FPS produces identical results (SC-T01 / SC-N01)', () => {
    it('produces identical state and ticks across 30, 60, and 120 FPS', () => {
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
            payload: { type: 'resume' },
          },
        },
        {
          appliedAtTick: 120,
          command: {
            clientId: 'client-1',
            seq: 3,
            expectedGeneration: 0,
            payload: { type: 'add', ingredient: 'sugar', deciTicks: 100 },
          },
        },
        {
          appliedAtTick: 240,
          command: {
            clientId: 'client-1',
            seq: 4,
            expectedGeneration: 0,
            payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
          },
        },
      ];

      // Run at 30 FPS for 10 sim seconds (600 steps)
      const engine30 = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const report30 = TickBoundaryReplayHarness.replay(engine30, createTrace(), {
        fps: 30,
        totalDurationSeconds: 10.0,
      });

      // Run at 60 FPS for 10 sim seconds (600 steps)
      const engine60 = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const report60 = TickBoundaryReplayHarness.replay(engine60, createTrace(), {
        fps: 60,
        totalDurationSeconds: 10.0,
      });

      // Run at 120 FPS for 10 sim seconds (600 steps)
      const engine120 = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const report120 = TickBoundaryReplayHarness.replay(engine120, createTrace(), {
        fps: 120,
        totalDurationSeconds: 10.0,
      });

      expect(report30.ok).toBe(true);
      expect(report60.ok).toBe(true);
      expect(report120.ok).toBe(true);

      // All three engines reach exactly 600 steps
      expect(engine30.getState().tickIndex).toBe(600);
      expect(engine60.getState().tickIndex).toBe(600);
      expect(engine120.getState().tickIndex).toBe(600);

      expect(engine30.getState().elapsedSeconds).toBeCloseTo(10.0, 10);
      expect(engine60.getState().elapsedSeconds).toBeCloseTo(10.0, 10);
      expect(engine120.getState().elapsedSeconds).toBeCloseTo(10.0, 10);

      // State equality
      expect(engine30.getState().mass).toEqual(engine60.getState().mass);
      expect(engine60.getState().mass).toEqual(engine120.getState().mass);
      expect(engine30.getState().stateVersion).toBe(engine60.getState().stateVersion);
      expect(engine60.getState().stateVersion).toBe(engine120.getState().stateVersion);

      // Acks match
      expect(report30.acks).toEqual(report60.acks);
      expect(report60.acks).toEqual(report120.acks);
    });
  });

  describe('14. Replay across reset and paused controls without deadlock (SC-C03 / SC-T01)', () => {
    it('replays trace through paused states, reset, and resumes without deadlock', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

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
            payload: { type: 'resume' },
          },
        },
        {
          appliedAtTick: 60,
          command: {
            clientId: 'client-1',
            seq: 3,
            expectedGeneration: 0,
            payload: { type: 'pause' },
          },
        },
        {
          appliedAtTick: 60,
          command: {
            clientId: 'client-1',
            seq: 4,
            expectedGeneration: 0,
            payload: { type: 'add', ingredient: 'sugar', deciTicks: 100 },
          },
        },
        {
          appliedAtTick: 60,
          command: {
            clientId: 'client-1',
            seq: 5,
            expectedGeneration: 0,
            payload: { type: 'resume' },
          },
        },
        {
          appliedAtTick: 120,
          command: {
            clientId: 'client-1',
            seq: 6,
            expectedGeneration: 0,
            payload: { type: 'reset' },
          },
        },
        {
          generation: 1,
          appliedAtTick: 0,
          command: {
            clientId: 'client-1',
            seq: 7,
            expectedGeneration: 1,
            payload: { type: 'add', ingredient: 'water', deciTicks: 500 },
          },
        },
        {
          generation: 1,
          appliedAtTick: 0,
          command: {
            clientId: 'client-1',
            seq: 8,
            expectedGeneration: 1,
            payload: { type: 'resume' },
          },
        },
      ];

      const report = TickBoundaryReplayHarness.replay(engine, trace, {
        fps: 60,
        totalDurationSeconds: 3.0,
      });

      expect(report.ok).toBe(true);
      expect(report.commandsDispatched).toBe(8);
      expect(engine.getState().generation).toBe(1);
      expect(engine.getState().mass.W).toBe(50);
    });

    it('detects deadlock diagnostic when paused trace cannot advance to future tick', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      // Engine starts paused at tick 0. Next command is scheduled for tick 10 without resume at tick 0
      const impossibleTrace: TraceItem[] = [
        {
          appliedAtTick: 10,
          command: {
            clientId: 'client-1',
            seq: 1,
            expectedGeneration: 0,
            payload: { type: 'add', ingredient: 'water', deciTicks: 100 },
          },
        },
      ];

      const report = TickBoundaryReplayHarness.replay(engine, impossibleTrace, {
        fps: 60,
      });

      expect(report.ok).toBe(false);
      expect(report.deadlockDiagnostic).toBeDefined();
      expect(report.deadlockDiagnostic).toContain('DEADLOCK');
    });
  });

  describe('15. Two independent engines & clocks', () => {
    it('runs two engines at different FPS and clocks without interference', () => {
      const engineA = new HeadlessSimulationEngine({ clientId: 'client-A' });
      const engineB = new HeadlessSimulationEngine({ clientId: 'client-B' });

      engineA.dispatch({ clientId: 'client-A', seq: 1, expectedGeneration: 0, payload: { type: 'resume' } });
      engineB.dispatch({ clientId: 'client-B', seq: 1, expectedGeneration: 0, payload: { type: 'resume' } });

      engineA.advance(1 / 30); // 2 steps
      engineB.advance(1 / 60); // 1 step

      expect(engineA.getState().tickIndex).toBe(2);
      expect(engineB.getState().tickIndex).toBe(1);
    });
  });

  describe('16. Monotonic Host Timestamp validation', () => {
    it('rejects invalid or non-monotonic timestamps', () => {
      const clock = new SimulationClock();

      const res1 = clock.advanceTimestamp(1000, true);
      expect(res1.ok).toBe(true);

      // Decreasing timestamp
      const resDecreasing = clock.advanceTimestamp(500, true);
      expect(resDecreasing.ok).toBe(false);
      expect(resDecreasing.error).toBe('NON_MONOTONIC_TIMESTAMP');

      // NaN timestamp
      const resNaN = clock.advanceTimestamp(NaN, true);
      expect(resNaN.ok).toBe(false);
      expect(resNaN.error).toBe('INVALID_TIMESTAMP');
    });
  });
});
