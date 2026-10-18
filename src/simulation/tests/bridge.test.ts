import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type HostClockAdapter,
  SimulationBridge,
} from '../bridge/SimulationBridge';
import { createExperimentStore, useExperimentStore } from '../../stores/experimentStore';
import { DEFAULT_SEED, type ScalarSnapshot } from '../core/SimulationState';
import { HeadlessSimulationEngine } from '../core/HeadlessSimulationEngine';

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

  pendingCallbacksCount(): number {
    return this.callbacks.size;
  }
}

describe('V2-10 — Early Authoritative Bridge & Controls Tests', () => {
  beforeEach(() => {
    useExperimentStore.getState().reset();
  });

  describe('1. Baseline store & snapshot initialization', () => {
    it('initializes with paused simulation, empty inputs, seed 1729, and default UI state', () => {
      const store = createExperimentStore();
      const state = store.getState();

      expect(state.snapshot.paused).toBe(true);
      expect(state.snapshot.generation).toBe(0);
      expect(state.snapshot.tickIndex).toBe(0);
      expect(state.snapshot.elapsedSeconds).toBe(0);
      expect(store.getState().getBridge().getEngine().getState().seed).toBe(DEFAULT_SEED);

      expect(state.deciTicks).toEqual({ water: 0, sugar: 0, sand: 0, oil: 0 });
      expect(state.quantities).toEqual({ water: 0, sugar: 0, sand: 0, oil: 0 });
      expect(state.additions).toEqual([]);
      expect(state.showRod).toBe(true);
      expect(state.cameraRevision).toBe(0);
      expect(state.message).toContain('Bắt đầu');
    });
  });

  describe('2. Add when paused (SC-C07, SC-C01)', () => {
    it('updates snapshot and store immediately with zero elapsed time when paused', () => {
      const store = createExperimentStore();
      const success = store.getState().add('water', 100);

      expect(success).toBe(true);
      const state = store.getState();
      expect(state.snapshot.input.water).toBe(1000);
      expect(state.deciTicks.water).toBe(1000);
      expect(state.quantities.water).toBe(100);
      expect(state.snapshot.elapsedSeconds).toBe(0);
      expect(state.snapshot.tickIndex).toBe(0);
      expect(state.snapshot.paused).toBe(true);
      expect(state.additions).toHaveLength(1);
      expect(state.additions[0]).toEqual({
        id: 1,
        ingredient: 'water',
        amount: 100,
        deciTicks: 1000,
      });
      expect(state.message).toContain('Đã thêm 100 ml nước');
    });
  });

  describe('3. Locale-aware Vietnamese raw string parsing', () => {
    it('parses both Vietnamese comma " 1,2 " and dot "1.2" to exact 12 deciTicks', () => {
      const store = createExperimentStore();

      expect(store.getState().add('sugar', ' 1,2 ')).toBe(true);
      expect(store.getState().deciTicks.sugar).toBe(12);
      expect(store.getState().quantities.sugar).toBe(1.2);

      expect(store.getState().add('sugar', '1.2')).toBe(true);
      expect(store.getState().deciTicks.sugar).toBe(24);
      expect(store.getState().quantities.sugar).toBe(2.4);

      expect(store.getState().additions).toHaveLength(2);
    });
  });

  describe('4. Invalid and boundary input rejection', () => {
    it('rejects invalid inputs without corrupting store quantities or history', () => {
      const store = createExperimentStore();
      const invalidAmounts = [NaN, Infinity, 0, -5, 'abc', '1e2', '1,000.0', '1.2.3', null, undefined];

      for (const inv of invalidAmounts) {
        const ok = store.getState().add('water', inv);
        expect(ok).toBe(false);
      }

      const state = store.getState();
      expect(state.deciTicks.water).toBe(0);
      expect(state.quantities.water).toBe(0);
      expect(state.additions).toHaveLength(0);
      expect(state.lastAck).toBeNull();
    });
  });

  describe('5. Exact deci-unit accumulation without floating drift (SC-IN02)', () => {
    it('accumulates ten additions of 0.1 to exact 1.0 without float rounding errors', () => {
      const store = createExperimentStore();

      for (let i = 0; i < 10; i++) {
        const ok = store.getState().add('sugar', '0.1');
        expect(ok).toBe(true);
      }

      const state = store.getState();
      expect(state.deciTicks.sugar).toBe(10);
      expect(state.quantities.sugar).toBe(1.0);
      expect(state.snapshot.input.sugar).toBe(10);
      expect(state.additions).toHaveLength(10);
      for (const item of state.additions) {
        expect(item.deciTicks).toBe(1);
        expect(item.amount).toBe(0.1);
      }
    });
  });

  describe('6. Capacity limit enforcement (SC-IN04)', () => {
    it('fills 500ml exactly and immediately rejects subsequent additions with CAPACITY_EXCEEDED', () => {
      const store = createExperimentStore();

      expect(store.getState().add('water', '499.9')).toBe(true);
      expect(store.getState().deciTicks.water).toBe(4999);

      expect(store.getState().add('water', '0.1')).toBe(true);
      expect(store.getState().deciTicks.water).toBe(5000);
      expect(store.getState().quantities.water).toBe(500);

      // Next addition must fail immediately
      expect(store.getState().add('oil', '0.1')).toBe(false);
      const state = store.getState();
      expect(state.lastAck?.accepted).toBe(false);
      expect(state.lastAck?.reason).toBe('CAPACITY_EXCEEDED');
      expect(state.message).toContain('Không đủ chỗ trong cốc 500 ml');
      expect(state.deciTicks).toEqual({ water: 5000, sugar: 0, sand: 0, oil: 0 });
      expect(state.quantities).toEqual({ water: 500, sugar: 0, sand: 0, oil: 0 });
      expect(state.additions).toHaveLength(2);
    });
  });

  describe('7. Add -> Reset -> Add sequence (SC-C03)', () => {
    it('does not resurrect previous additions after reset', () => {
      const store = createExperimentStore();

      store.getState().add('water', 100);
      expect(store.getState().quantities.water).toBe(100);
      expect(store.getState().snapshot.generation).toBe(0);

      store.getState().reset();
      expect(store.getState().quantities.water).toBe(0);
      expect(store.getState().deciTicks.water).toBe(0);
      expect(store.getState().additions).toEqual([]);
      expect(store.getState().snapshot.generation).toBe(1);

      store.getState().add('water', 50);
      expect(store.getState().quantities.water).toBe(50);
      expect(store.getState().deciTicks.water).toBe(500);
      expect(store.getState().additions).toHaveLength(1);
      expect(store.getState().snapshot.generation).toBe(1);
    });
  });

  describe('8. Start/Resume and Pause timeline control (SC-C01, SC-T02)', () => {
    it('advances elapsed seconds when running and freezes them when paused', () => {
      const hostClock = new MockHostClock();
      const bridge = new SimulationBridge({ hostClock });
      const store = createExperimentStore(bridge);

      // Initial state is paused
      bridge.stepFrame(100);
      expect(store.getState().snapshot.elapsedSeconds).toBe(0);
      expect(store.getState().snapshot.tickIndex).toBe(0);

      // Start/Resume
      store.getState().start();
      expect(store.getState().snapshot.paused).toBe(false);

      // Advance clock by 500ms in steps of 16ms
      for (let t = 16; t <= 500; t += 16) {
        bridge.stepFrame(t);
      }

      const elapsed = store.getState().snapshot.elapsedSeconds;
      const ticks = store.getState().snapshot.tickIndex;
      expect(elapsed).toBeGreaterThan(0);
      expect(ticks).toBeGreaterThan(0);

      // Pause
      store.getState().pause();
      expect(store.getState().snapshot.paused).toBe(true);

      const pausedElapsed = store.getState().snapshot.elapsedSeconds;
      const pausedTicks = store.getState().snapshot.tickIndex;

      // Further frame steps must not advance elapsed time or ticks
      for (let t = 516; t <= 1000; t += 16) {
        bridge.stepFrame(t);
      }

      expect(store.getState().snapshot.elapsedSeconds).toBe(pausedElapsed);
      expect(store.getState().snapshot.tickIndex).toBe(pausedTicks);

      bridge.destroy();
    });
  });

  describe('9. Forced command publish bypasses 10Hz throttling', () => {
    it('publishes snapshot immediately upon accepted command regardless of throttle timer', () => {
      const hostClock = new MockHostClock();
      const snapshotCalls: ScalarSnapshot[] = [];
      const bridge = new SimulationBridge({
        hostClock,
        onSnapshot: (snap) => snapshotCalls.push(snap),
      });

      // Clear initial snapshot call
      snapshotCalls.length = 0;

      // Add at t = 10ms
      hostClock.currentTime = 10;
      bridge.add('water', 50);
      expect(snapshotCalls).toHaveLength(1);
      expect(snapshotCalls[0].input.water).toBe(500);

      // Add again at t = 20ms (only 10ms later, well within 100ms throttle)
      hostClock.currentTime = 20;
      bridge.add('sugar', 10);
      expect(snapshotCalls).toHaveLength(2);
      expect(snapshotCalls[1].input.sugar).toBe(100);

      // Reset at t = 25ms
      hostClock.currentTime = 25;
      bridge.reset();
      expect(snapshotCalls).toHaveLength(3);
      expect(snapshotCalls[2].input.water).toBe(0);

      bridge.destroy();
    });
  });

  describe('10. Continuous animation snapshot publish is throttled to ~10Hz', () => {
    it('throttles tick-driven snapshot publishing to 100ms while invalidating scene on every frame', () => {
      const hostClock = new MockHostClock();
      let snapshotCount = 0;
      let invalidateCount = 0;

      const bridge = new SimulationBridge({
        hostClock,
        onSnapshot: () => {
          snapshotCount++;
        },
        onInvalidateScene: () => {
          invalidateCount++;
        },
      });

      // Reset counters after construction
      snapshotCount = 0;
      invalidateCount = 0;

      bridge.resume();
      // Resume itself forces an immediate publish and invalidate
      expect(snapshotCount).toBe(1);
      expect(invalidateCount).toBe(1);

      snapshotCount = 0;
      invalidateCount = 0;

      // Step 5 frames of 16ms each (total 80ms, less than 100ms throttle)
      for (let i = 1; i <= 5; i++) {
        bridge.stepFrame(i * 16);
      }

      // Invalidation occurred on active steps, but snapshot publish was throttled
      expect(invalidateCount).toBe(3);
      expect(snapshotCount).toBe(0);

      // Step frame at 112ms (exceeds 100ms)
      bridge.stepFrame(112);
      expect(invalidateCount).toBeGreaterThan(3);
      expect(snapshotCount).toBe(1);

      bridge.destroy();
    });
  });

  describe('11. Stale or regressed snapshot protection in store', () => {
    it('ignores snapshots with regressed generation or stateVersion', () => {
      const store = createExperimentStore();

      store.getState().add('water', 100);
      const currentSnapshot = store.getState().snapshot;
      expect(currentSnapshot.input.water).toBe(1000);

      // Fabricate a stale snapshot from a previous generation
      const staleSnapshot: ScalarSnapshot = {
        ...currentSnapshot,
        generation: -1,
        input: { water: 0, sugar: 0, sand: 0, oil: 0 },
      };

      // Direct subscriber delivery of stale snapshot
      store.getState().setSnapshot(staleSnapshot);
      // Wait, setSnapshot sets it directly; let's test bridge subscription drop via custom bridge
      const engine = new HeadlessSimulationEngine();
      const bridge = new SimulationBridge({ engine });
      const store2 = createExperimentStore(bridge);

      store2.getState().add('water', 100);
      const validSnap = store2.getState().snapshot;
      expect(validSnap.generation).toBe(0);
      expect(validSnap.input.water).toBe(1000);

      // Now create a regressed snapshot and feed it through subscribers
      const subscribers = (bridge as unknown as { snapshotSubscribers: Set<(s: ScalarSnapshot) => void> })
        .snapshotSubscribers;

      for (const sub of subscribers) {
        sub({
          ...validSnap,
          generation: -1,
          input: { water: 0, sugar: 0, sand: 0, oil: 0 },
        });
      }

      // Store dropped regressed snapshot
      expect(store2.getState().snapshot.input.water).toBe(1000);
      expect(store2.getState().quantities.water).toBe(100);
    });
  });

  describe('12. Camera reset preserves engine and simulation state (SC-B03)', () => {
    it('increments cameraRevision without resetting engine, generation, mass, or elapsed time', () => {
      const hostClock = new MockHostClock();
      const bridge = new SimulationBridge({ hostClock });
      const store = createExperimentStore(bridge);

      store.getState().add('water', 100);
      store.getState().start();

      for (let t = 16; t <= 200; t += 16) {
        bridge.stepFrame(t);
      }

      const beforeState = store.getState();
      const beforeGen = beforeState.snapshot.generation;
      const beforeTime = beforeState.snapshot.elapsedSeconds;
      const beforeTicks = beforeState.snapshot.tickIndex;
      const beforeMass = beforeState.snapshot.mass;
      const beforeAdditions = beforeState.additions;

      expect(beforeState.cameraRevision).toBe(0);
      expect(beforeTime).toBeGreaterThan(0);

      // Reset camera (simulating user clicking "Đặt lại góc nhìn")
      store.getState().resetCamera();

      const afterState = store.getState();
      expect(afterState.cameraRevision).toBe(1);
      expect(afterState.snapshot.generation).toBe(beforeGen);
      expect(afterState.snapshot.elapsedSeconds).toBe(beforeTime);
      expect(afterState.snapshot.tickIndex).toBe(beforeTicks);
      expect(afterState.snapshot.mass).toEqual(beforeMass);
      expect(afterState.additions).toEqual(beforeAdditions);

      bridge.destroy();
    });
  });

  describe('13. StrictMode lifecycle safety (attach -> cleanup -> attach)', () => {
    it('handles mount -> unmount -> mount leaving exactly 1 active scheduler and listener', () => {
      const hostClock = new MockHostClock();
      const bridge = new SimulationBridge({ hostClock });

      // Mock DOM environment for lifecycle
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
        bridge.resume();
        expect(bridge.isSchedulerActive()).toBe(true);

        // First mount
        const cleanup1 = bridge.attachLifecycle();
        expect(fakeDoc.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

        // StrictMode unmount
        cleanup1();
        expect(fakeDoc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
        expect(bridge.isSchedulerActive()).toBe(false);

        // StrictMode remount
        const cleanup2 = bridge.attachLifecycle();
        // Since simulation is running, scheduler is re-started
        expect(bridge.isSchedulerActive()).toBe(true);

        // Final cleanup
        cleanup2();
        expect(bridge.isSchedulerActive()).toBe(false);
      } finally {
        vi.unstubAllGlobals();
        bridge.destroy();
      }
    });
  });

  describe('14. Visibilitychange lifecycle (suspend / visible / user pause preserved) (SC-T03)', () => {
    it('suspends on hidden, restores on visible without time gap, and strictly preserves user pause', () => {
      const hostClock = new MockHostClock();
      const bridge = new SimulationBridge({ hostClock });

      let visibilityCallback: (() => void) | null = null;
      const triggerVisibility = () => {
        visibilityCallback?.();
      };
      const fakeDoc = {
        hidden: false,
        addEventListener: (_event: string, cb: () => void) => {
          visibilityCallback = cb;
        },
        removeEventListener: () => {
          visibilityCallback = null;
        },
      };

      vi.stubGlobal('document', fakeDoc);

      try {
        const cleanup = bridge.attachLifecycle();

        // 1. Running simulation hidden -> suspend
        bridge.resume();
        expect(bridge.getEngine().getState().paused).toBe(false);

        fakeDoc.hidden = true;
        triggerVisibility();
        expect(bridge.getEngine().getClock().getIsSuspended()).toBe(true);

        // 2. Unhide -> visible
        fakeDoc.hidden = false;
        triggerVisibility();
        expect(bridge.getEngine().getClock().getIsSuspended()).toBe(false);
        expect(bridge.getEngine().getState().paused).toBe(false);

        // 3. User manually pauses simulation
        bridge.pause();
        expect(bridge.getEngine().getState().paused).toBe(true);

        // 4. Hide and unhide while paused -> MUST remain paused
        fakeDoc.hidden = true;
        triggerVisibility();
        expect(bridge.getEngine().getClock().getIsSuspended()).toBe(true);

        fakeDoc.hidden = false;
        triggerVisibility();
        expect(bridge.getEngine().getClock().getIsSuspended()).toBe(false);
        // Simulation must strictly preserve paused state!
        expect(bridge.getEngine().getState().paused).toBe(true);
        expect(bridge.isSchedulerActive()).toBe(false);

        cleanup();
      } finally {
        vi.unstubAllGlobals();
        bridge.destroy();
      }
    });
  });

  describe('15. Monotonic sequence and generation fencing across resets', () => {
    it('increments generation and maintains client sequence monotonicity across multiple resets', () => {
      const bridge = new SimulationBridge();

      const ack1 = bridge.add('water', 50);
      expect(ack1.ok).toBe(true);
      expect(ack1.ack?.accepted).toBe(true);
      const seq1 = ack1.ack?.controlOrdinal;

      const resetAck1 = bridge.reset();
      expect(resetAck1.accepted).toBe(true);
      const resetSeq1 = resetAck1.controlOrdinal;
      expect(resetSeq1).toBeGreaterThan(seq1!);

      const ack2 = bridge.add('sugar', 20);
      expect(ack2.ok).toBe(true);
      const seq2 = ack2.ack?.controlOrdinal;
      expect(seq2).toBeGreaterThan(resetSeq1!);

      const resetAck2 = bridge.reset();
      expect(resetAck2.accepted).toBe(true);
      expect(resetAck2.controlOrdinal).toBeGreaterThan(seq2!);

      bridge.destroy();
    });
  });

  describe('16. Multiple independent bridge/store instances', () => {
    it('ensures independent store and bridge instances do not cross-contaminate state', () => {
      const bridgeA = new SimulationBridge();
      const bridgeB = new SimulationBridge();

      const storeA = createExperimentStore(bridgeA);
      const storeB = createExperimentStore(bridgeB);

      storeA.getState().add('water', 100);
      storeA.getState().add('sugar', 10);

      expect(storeA.getState().quantities.water).toBe(100);
      expect(storeA.getState().quantities.sugar).toBe(10);
      expect(storeB.getState().quantities.water).toBe(0);
      expect(storeB.getState().quantities.sugar).toBe(0);

      storeB.getState().add('oil', 50);
      expect(storeA.getState().quantities.oil).toBe(0);
      expect(storeB.getState().quantities.oil).toBe(50);

      bridgeA.destroy();
      bridgeB.destroy();
    });
  });

  describe('17. Snapshot DevFreeze isolation and subscription cleanup', () => {
    it('prevents external mutation of published snapshot and allows unsubscribe', () => {
      const bridge = new SimulationBridge();
      let callCount = 0;

      const unsub = bridge.subscribeSnapshot(() => {
        callCount++;
      });
      // Initial subscription triggers immediate call
      expect(callCount).toBe(1);

      bridge.add('water', 50);
      expect(callCount).toBe(2);

      const snapshot = bridge.getSnapshot();
      // Frozen snapshot mutation should fail/throw in strict mode
      expect(() => {
        // @ts-expect-error mutating frozen object
        snapshot.input.water = 9999;
      }).toThrow();

      // Ensure internal engine state was unaffected
      expect(bridge.getSnapshot().input.water).toBe(500);

      // Unsubscribe
      unsub();
      bridge.add('sugar', 10);
      expect(callCount).toBe(2); // No new calls after unsub

      bridge.destroy();
    });
  });

  describe('18. Stirring rod toggle releases drive (SC-J03 / SPEC §3.4)', () => {
    it('dispatches releaseDrive before hiding rod, and showing rod does not restart drive', () => {
      const store = createExperimentStore();

      expect(store.getState().showRod).toBe(true);

      // Hide rod
      store.getState().toggleRod();
      expect(store.getState().showRod).toBe(false);
      const engineState1 = store.getState().getBridge().getEngine().getState();
      expect(engineState1.autoDriveEnabled).toBe(false);
      expect(engineState1.omegaRod).toBe(0);
      expect(engineState1.omegaDrive).toBe(0);

      // Show rod again
      store.getState().toggleRod();
      expect(store.getState().showRod).toBe(true);
      // Rod is shown, but drive remains released
      const engineState2 = store.getState().getBridge().getEngine().getState();
      expect(engineState2.autoDriveEnabled).toBe(false);
      expect(engineState2.omegaDrive).toBe(0);
    });
  });
});
