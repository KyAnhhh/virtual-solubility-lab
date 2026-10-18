import { describe, expect, it } from 'vitest';
import {
  type HostClockAdapter,
  SimulationBridge,
} from '../bridge/SimulationBridge';
import { createExperimentStore } from '../../stores/experimentStore';
import { AUTO_LEVEL_SPEEDS } from '../constants/flow';
import type { RenderTarget, RenderStamp } from '../core/SimulationState';
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

describe('V4-01 — Mở rộng Bridge cho Đầy đủ Phase và Render Outputs', () => {
  describe('1. SC-B01 & Render Copy Contract: Buffer Isolation and Zero Aliasing', () => {
    it('copies representative particles into caller-owned target without exposing engine private buffers', () => {
      const bridge = new SimulationBridge();
      bridge.add('water', 100);
      bridge.add('sugar', 20);
      bridge.add('sand', 15);
      bridge.add('oil', 25);

      const capacity = 500;
      const target: RenderTarget = {
        positions: new Float32Array(capacity * 3),
        weights: new Float32Array(capacity),
        materials: new Uint8Array(capacity),
        radii: new Float32Array(capacity),
        poolIds: new Uint8Array(capacity),
        count: capacity,
      };

      const stamp: RenderStamp = bridge.copyRenderFrame(target);
      expect(stamp.count).toBeGreaterThan(0);
      expect(stamp.generation).toBe(0);
      expect(stamp.poolRanges).toBeDefined();

      const origX = target.positions[0];
      const origWeight = target.weights[0];
      expect(Number.isFinite(origX)).toBe(true);
      expect(origWeight).toBeGreaterThan(0);

      // Caller mutates target buffers (corrupting external view)
      target.positions.fill(999.0);
      target.weights.fill(-99.0);
      target.materials.fill(255);

      // Next copy must produce valid uncorrupted values, proving engine private state was completely isolated
      const nextStamp = bridge.copyRenderFrame(target);
      expect(nextStamp.count).toBe(stamp.count);
      expect(target.positions[0]).toBeCloseTo(origX, 5);
      expect(target.weights[0]).toBeCloseTo(origWeight, 5);
      expect(target.materials[0]).not.toBe(255);

      bridge.destroy();
    });

    it('returns poolRanges for all 5 pools (sugarBed, sugarSusp, sandBed, sandSusp, oilDroplet)', () => {
      const bridge = new SimulationBridge();
      bridge.add('water', 100);
      bridge.add('sugar', 20);
      bridge.add('sand', 20);
      bridge.add('oil', 20);

      const target: RenderTarget = {
        positions: new Float32Array(500 * 3),
        weights: new Float32Array(500),
        materials: new Uint8Array(500),
        radii: new Float32Array(500),
        poolIds: new Uint8Array(500),
        count: 500,
      };

      const stamp = bridge.copyRenderFrame(target);
      expect(stamp.poolRanges).toBeDefined();
      const pools = stamp.poolRanges!;
      expect(pools.sugarBed).toBeDefined();
      expect(pools.sugarSusp).toBeDefined();
      expect(pools.sandBed).toBeDefined();
      expect(pools.sandSusp).toBeDefined();
      expect(pools.oilDroplet).toBeDefined();

      // Total count matches sum of pool counts
      const totalPoolCount =
        pools.sugarBed.count +
        pools.sugarSusp.count +
        pools.sandBed.count +
        pools.sandSusp.count +
        pools.oilDroplet.count;
      expect(totalPoolCount).toBe(stamp.count);

      bridge.destroy();
    });
  });

  describe('2. Full Scalar Snapshot & Detached Phases', () => {
    it('publishes complete snapshot with all 10 mass compartments and physical metrics', () => {
      const bridge = new SimulationBridge();
      bridge.add('water', 100);
      bridge.add('sugar', 20);
      bridge.add('sand', 15);
      bridge.add('oil', 20);

      const snap = bridge.getSnapshot();

      // 10 mass compartments
      expect(snap.mass.W).toBe(100);
      expect(snap.mass.Gt).toBe(20);
      expect(snap.mass.Gu).toBe(20);
      expect(snap.mass.Gd).toBe(0);
      expect(snap.mass.St).toBe(15);
      expect(snap.mass.Sb).toBe(15);
      expect(snap.mass.Ss).toBe(0);
      expect(snap.mass.Ot).toBe(18);
      expect(snap.mass.Ol).toBe(18);
      expect(snap.mass.Od).toBe(0);

      // Suspension fraction
      expect(snap.fGu).toBe(0);

      // Physical metrics
      expect(snap.capacityG).toBe(200); // 2.0 * W
      expect(snap.saturationRatio).toBe(0); // Gd / capacity = 0 / 200
      expect(snap.dissolutionProgress).toBe(0); // Gd / min(Gt, capacity) = 0 / 20

      // Rod pose and contact
      expect(snap.rod).toBeDefined();
      expect(snap.rod.radius).toBeCloseTo(0.3, 2);
      expect(snap.rod.tipY).toBeGreaterThanOrEqual(0.14);
      expect(snap.contact).toBeGreaterThan(0);
      expect(snap.intensity).toBe(0);

      // Lifecycle / Mode
      expect(snap.paused).toBe(true);
      expect(snap.mode).toBe('observe');
      expect(snap.autoLevel).toBe('slow');
      expect(snap.autoDriveEnabled).toBe(false);
      expect(snap.generation).toBe(0);
      expect(snap.tickIndex).toBe(0);
      expect(snap.elapsedSeconds).toBe(0);

      bridge.destroy();
    });

    it('enforces nullable semantics when water is absent (W=0)', () => {
      const bridge = new SimulationBridge();
      bridge.add('sugar', 20);
      bridge.add('sand', 10);
      bridge.add('oil', 15);

      const snap = bridge.getSnapshot();
      expect(snap.mass.W).toBe(0);
      expect(snap.capacityG).toBe(0);
      expect(snap.saturationRatio).toBeNull();
      expect(snap.dissolutionProgress).toBeNull();

      bridge.destroy();
    });

    it('freezes snapshot objects in test/dev environment preventing accidental UI mutations', () => {
      const bridge = new SimulationBridge();
      bridge.add('water', 50);
      const snap = bridge.getSnapshot();

      expect(Object.isFrozen(snap)).toBe(true);
      expect(Object.isFrozen(snap.input)).toBe(true);
      expect(Object.isFrozen(snap.mass)).toBe(true);
      expect(Object.isFrozen(snap.rod)).toBe(true);

      expect(() => {
        // @ts-expect-error mutating frozen object
        snap.mass.W = 9999;
      }).toThrow();

      expect(bridge.getSnapshot().mass.W).toBe(50);
      bridge.destroy();
    });
  });

  describe('3. Forced Immediate Publish vs Throttled 10Hz Tick Publish', () => {
    it('forces immediate publish on accepted commands without waiting for tick or throttle interval', () => {
      const hostClock = new MockHostClock();
      const bridge = new SimulationBridge({ hostClock });

      const published: number[] = [];
      bridge.subscribeSnapshot((s) => {
        published.push(s.stateVersion);
      });

      // Initial subscription
      expect(published).toHaveLength(1);
      const initialVer = published[0];

      // Add intent (immediate forced publish)
      bridge.add('water', 100);
      expect(published).toHaveLength(2);
      expect(published[1]).toBeGreaterThan(initialVer);

      // Pause intent (immediate forced publish)
      bridge.pause();
      expect(published).toHaveLength(3);

      // Resume intent (immediate forced publish)
      bridge.resume();
      expect(published).toHaveLength(4);

      // SetMode intent (immediate forced publish)
      bridge.setMode('auto');
      expect(published).toHaveLength(5);

      // SetAutoLevel intent (immediate forced publish)
      bridge.setAutoLevel('fast');
      expect(published).toHaveLength(6);

      // Reset intent (immediate forced publish)
      bridge.reset();
      expect(published).toHaveLength(7);

      bridge.destroy();
    });

    it('throttles tick-driven publish to ~10Hz (100ms interval) during fixed-step running animation', () => {
      const hostClock = new MockHostClock();
      const bridge = new SimulationBridge({ hostClock });
      bridge.add('water', 100);
      bridge.add('sugar', 20);
      bridge.resume();

      let snapshotPublishCount = 0;
      bridge.subscribeSnapshot(() => {
        snapshotPublishCount++;
      });
      // Initial count after subscription
      expect(snapshotPublishCount).toBe(1);

      // Advance 16ms (1 host frame ~60FPS): 1 tick executes, but time < 100ms => NO scalar publish
      hostClock.stepTime(16);
      bridge.stepFrame();
      expect(snapshotPublishCount).toBe(1);

      // Advance another 16ms (total 32ms): NO publish
      hostClock.stepTime(16);
      bridge.stepFrame();
      expect(snapshotPublishCount).toBe(1);

      // Advance another 48ms (total 80ms): NO publish
      hostClock.stepTime(48);
      bridge.stepFrame();
      expect(snapshotPublishCount).toBe(1);

      // Advance 25ms (total 105ms >= TICK_PUBLISH_INTERVAL_MS 100ms): triggers throttled publish!
      hostClock.stepTime(25);
      bridge.stepFrame();
      expect(snapshotPublishCount).toBe(2);

      // Next frame at 121ms (delta from 105ms is 16ms < 100ms): NO publish
      hostClock.stepTime(16);
      bridge.stepFrame();
      expect(snapshotPublishCount).toBe(2);

      bridge.destroy();
    });
  });

  describe('4. Metadata Handshake & Stale Frame Dropping (SC-B03)', () => {
    it('synchronizes generation, stateVersion, and renderRevision across snapshot and renderFrame', () => {
      const bridge = new SimulationBridge();
      bridge.add('water', 100);
      bridge.add('sugar', 20);

      const snap = bridge.getSnapshot();
      const pose = bridge.getRenderPose();

      expect(pose.generation).toBe(snap.generation);
      expect(pose.stateVersion).toBe(snap.stateVersion);
      expect(pose.tickIndex).toBe(snap.tickIndex);

      const target: RenderTarget = {
        positions: new Float32Array(500 * 3),
        weights: new Float32Array(500),
        materials: new Uint8Array(500),
        radii: new Float32Array(500),
        poolIds: new Uint8Array(500),
        count: 500,
      };
      const stamp = bridge.copyRenderFrame(target);
      expect(stamp.generation).toBe(snap.generation);
      expect(stamp.stateVersion).toBe(snap.stateVersion);

      bridge.destroy();
    });

    it('increments generation on reset while cameraRevision operates independently without scientific reset', () => {
      const store = createExperimentStore();
      store.getState().add('water', 100);
      const initialGen = store.getState().snapshot.generation;
      expect(initialGen).toBe(0);
      expect(store.getState().cameraRevision).toBe(0);

      // Reset camera 20 times: cameraRevision increments, generation remains strictly 0
      for (let i = 0; i < 20; i++) {
        store.getState().resetCamera();
      }
      expect(store.getState().cameraRevision).toBe(20);
      expect(store.getState().snapshot.generation).toBe(0);
      expect(store.getState().quantities.water).toBe(100);

      // Scientific reset: generation increments, quantities reset to 0
      store.getState().reset();
      expect(store.getState().snapshot.generation).toBe(1);
      expect(store.getState().quantities.water).toBe(0);

      store.getState().getBridge().destroy();
    });
  });

  describe('5. Paused Add & Immediate Remap (SC-C07, SC-R04, SC-A01)', () => {
    it('updates beaker regions, rod tipY, and remaps particle representations at tick 0 without advancing time', () => {
      const bridge = new SimulationBridge();
      expect(bridge.isPaused()).toBe(true);

      const snap0 = bridge.getSnapshot();
      expect(snap0.tickIndex).toBe(0);
      expect(snap0.elapsedSeconds).toBe(0);
      const tip0 = snap0.rod.tipY;

      // Add sand: builds bed
      bridge.add('sand', 50);
      const snapSand = bridge.getSnapshot();
      expect(snapSand.tickIndex).toBe(0);
      expect(snapSand.elapsedSeconds).toBe(0);
      expect(snapSand.mass.Sb).toBe(50);
      expect(snapSand.rod.tipY).toBeGreaterThan(tip0); // Tip adapts to bed top

      // Add water: expands aqueous region
      bridge.add('water', 150);
      const snapWater = bridge.getSnapshot();
      expect(snapWater.tickIndex).toBe(0);
      expect(snapWater.elapsedSeconds).toBe(0);
      expect(snapWater.mass.W).toBe(150);

      // Particles are immediately generated and queryable without stepping clock
      const target: RenderTarget = {
        positions: new Float32Array(500 * 3),
        weights: new Float32Array(500),
        materials: new Uint8Array(500),
        radii: new Float32Array(500),
        poolIds: new Uint8Array(500),
        count: 500,
      };
      const stamp = bridge.copyRenderFrame(target);
      expect(stamp.count).toBeGreaterThan(0);
      expect(stamp.generation).toBe(0);

      bridge.destroy();
    });
  });

  describe('6. Auto Speed Mapping Constants (AUTO_LEVEL_SPEEDS)', () => {
    it('verifies exact speeds: slow = 1.0, medium = 3.0, fast = 6.0 rad/s', () => {
      expect(AUTO_LEVEL_SPEEDS.slow).toBe(1.0);
      expect(AUTO_LEVEL_SPEEDS.medium).toBe(3.0);
      expect(AUTO_LEVEL_SPEEDS.fast).toBe(6.0);
    });

    it('updates engine and snapshot autoLevel via bridge methods', () => {
      const bridge = new SimulationBridge();
      expect(bridge.getSnapshot().autoLevel).toBe('slow');

      bridge.setAutoLevel('medium');
      expect(bridge.getSnapshot().autoLevel).toBe('medium');

      bridge.setAutoLevel('fast');
      expect(bridge.getSnapshot().autoLevel).toBe('fast');

      bridge.destroy();
    });
  });

  describe('7. Four Key Interaction Flows of Virtual Solubility Lab', () => {
    it('Flow 1: Sugar dissolution rate strictly follows stirring speed: fast > medium > slow > rest', () => {
      // Run 4 identical simulations (W=100ml, G=20g) for 60 ticks (~1s)
      const runDissolution = (level: 'rest' | 'slow' | 'medium' | 'fast'): number => {
        const hostClock = new MockHostClock();
        const bridge = new SimulationBridge({
          hostClock,
          engine: new HeadlessSimulationEngine({ clientId: `flow-${level}`, seed: 1729 }),
        });
        bridge.stopScheduler();
        bridge.add('water', 100);
        bridge.add('sugar', 20);

        if (level !== 'rest') {
          bridge.startAuto(level);
        } else {
          bridge.resume();
        }
        bridge.stopScheduler();

        // Advance 60 frames of 16.67ms (1.0 sim second)
        for (let i = 1; i <= 60; i++) {
          bridge.stepFrame(i * 16.67);
        }
        bridge.pause(); // forces immediate snapshot publish
        const gd = bridge.getSnapshot().mass.Gd;
        bridge.destroy();
        return gd;
      };

      const gdRest = runDissolution('rest');
      const gdSlow = runDissolution('slow');
      const gdMed = runDissolution('medium');
      const gdFast = runDissolution('fast');

      // Dissolved sugar amount must strictly follow: fast > medium > slow > rest
      expect(gdSlow).toBeGreaterThan(gdRest);
      expect(gdMed).toBeGreaterThan(gdSlow);
      expect(gdFast).toBeGreaterThan(gdMed);
    });

    it('Flow 2: Saturation and water addition (SC-D05)', () => {
      const hostClock = new MockHostClock();
      const bridge = new SimulationBridge({ hostClock });
      bridge.stopScheduler();
      // W=10ml (capacity = 20g), G=30g (excess = 10g)
      bridge.add('water', 10);
      bridge.add('sugar', 30);
      bridge.startAuto('fast');
      bridge.stopScheduler();

      // Run 10s of fast auto stirring (600 frames: 600 * 16.67ms = 10,000ms)
      for (let i = 1; i <= 600; i++) {
        bridge.stepFrame(i * 16.67);
      }
      bridge.pause(); // forces publish

      let snap = bridge.getSnapshot();
      expect(snap.capacityG).toBe(20.0);
      expect(snap.mass.Gd).toBeGreaterThan(5.0);
      expect(snap.mass.Gu).toBeGreaterThan(10.0);
      expect(snap.saturationRatio).toBeGreaterThan(0.4);

      const gdBeforeAddWater = snap.mass.Gd;

      // Add 10ml water: capacity increases to 40g, resuming dissolution
      bridge.add('water', 10);
      snap = bridge.getSnapshot();
      expect(snap.mass.W).toBe(20);
      expect(snap.capacityG).toBe(40.0); // Doubled solvent capacity
      expect(snap.saturationRatio).toBeCloseTo(gdBeforeAddWater / 40.0, 4); // Saturation ratio dropped

      bridge.resume();
      bridge.stopScheduler();
      // Run another 10s of fast auto stirring
      const baseTime = 10000;
      for (let i = 1; i <= 600; i++) {
        bridge.stepFrame(baseTime + i * 16.67);
      }
      bridge.pause(); // forces publish

      snap = bridge.getSnapshot();
      // More sugar has dissolved under expanded capacity
      expect(snap.mass.Gd).toBeGreaterThan(gdBeforeAddWater);
      expect(snap.mass.Gu).toBeLessThan(30 - gdBeforeAddWater);

      // Adding oil does NOT expand solvent capacity
      bridge.add('oil', 20);
      expect(bridge.getSnapshot().capacityG).toBe(40.0);

      bridge.destroy();
    });

    it('Flow 3: Sand suspension and oil droplet separation kinetics', () => {
      const hostClock = new MockHostClock();
      const bridge = new SimulationBridge({ hostClock });
      bridge.stopScheduler();
      bridge.add('water', 100);
      bridge.add('sand', 10);
      bridge.add('oil', 20);

      // Initial state: sand in bed, oil in layer
      let snap = bridge.getSnapshot();
      expect(snap.mass.Sb).toBe(10);
      expect(snap.mass.Ss).toBe(0);
      expect(snap.mass.Ol).toBe(18); // 20ml * 0.9 = 18g
      expect(snap.mass.Od).toBe(0);

      // Start auto stirring (fast)
      bridge.startAuto('fast');
      bridge.stopScheduler();
      for (let i = 1; i <= 180; i++) {
        bridge.stepFrame(i * 16.67);
      }
      bridge.pause();

      snap = bridge.getSnapshot();
      // Sand has suspended into carrier, oil has dispersed into droplets
      expect(snap.mass.Ss).toBeGreaterThan(1.0);
      expect(snap.mass.Od).toBeGreaterThan(1.0);
      const ssPeak = snap.mass.Ss;
      const odPeak = snap.mass.Od;

      // Stop stirring: flow decays, sand settles, oil droplets merge back to layer
      bridge.resume();
      bridge.stopScheduler();
      bridge.stopAuto();
      const baseTime = 3000;
      for (let i = 1; i <= 600; i++) {
        bridge.stepFrame(baseTime + i * 16.67);
      }
      bridge.pause();

      snap = bridge.getSnapshot();
      // Sand settles back to bed, oil droplets merge back to oil layer
      expect(snap.mass.Ss).toBeLessThan(ssPeak);
      expect(snap.mass.Od).toBeLessThan(odPeak);
      expect(snap.mass.Sb).toBeCloseTo(10 - snap.mass.Ss, 8);
      expect(snap.mass.Ol).toBeCloseTo(18 - snap.mass.Od, 8);
      expect(snap.mass.Sb).toBeGreaterThan(10 - ssPeak);
      expect(snap.mass.Ol).toBeGreaterThan(18 - odPeak);

      bridge.destroy();
    });

    it('Flow 4: Interaction controls, stale watchdog, and rod visibility lifecycle (SC-J02, SC-J03)', () => {
      const hostClock = new MockHostClock();
      const bridge = new SimulationBridge({ hostClock });
      bridge.stopScheduler(); // Stop automatic RAF loop
      bridge.add('water', 100);
      bridge.setMode('manual');
      bridge.resume();
      bridge.stopScheduler();

      const adapter = bridge.getManualAdapter();
      expect(adapter).toBeDefined();

      // Begin manual drag with pointerId 1
      adapter?.onPointerDown(1, { origin: [0.3, 1.0, 0], direction: [0, -1, 0] }, 100);
      adapter?.onPointerMove(1, { origin: [0.35, 1.0, 0.05], direction: [0, -1, 0] }, 116);

      expect(adapter?.isDragActive()).toBe(true);
      expect(adapter?.getCapturedPointerId()).toBe(1);

      // Wait 160ms (> 150ms stale watchdog threshold) without pointer move
      const staleCheck = adapter?.checkStale(276);
      expect(staleCheck?.released).toBe(true);

      // Rod toggle: hiding rod dispatches releaseDrive before hiding
      const store = createExperimentStore(bridge);
      expect(store.getState().showRod).toBe(true);
      store.getState().toggleRod();
      expect(store.getState().showRod).toBe(false);
      expect(bridge.getEngine().getState().autoDriveEnabled).toBe(false);

      bridge.destroy();
    });
  });

  describe('8. Lifecycle and Subscription Cleanup', () => {
    it('properly unsubscribes from snapshot and scene invalidation without leaks', () => {
      const bridge = new SimulationBridge();
      let snapshotCalls = 0;
      let invalidateCalls = 0;

      const unsubSnap = bridge.subscribeSnapshot(() => {
        snapshotCalls++;
      });
      const unsubInval = bridge.subscribeInvalidate(() => {
        invalidateCalls++;
      });

      expect(snapshotCalls).toBe(1); // initial snapshot call
      expect(invalidateCalls).toBe(0);

      bridge.add('water', 50);
      expect(snapshotCalls).toBe(2);
      expect(invalidateCalls).toBe(1);

      // Unsubscribe both
      unsubSnap();
      unsubInval();

      bridge.add('sugar', 10);
      expect(snapshotCalls).toBe(2); // No new calls
      expect(invalidateCalls).toBe(1); // No new calls

      bridge.destroy();
    });

    it('attaches and detaches lifecycle listeners idempotently without duplicate registrations', () => {
      const bridge = new SimulationBridge();
      let visibilityListenerCount = 0;

      const fakeDoc = {
        hidden: false,
        addEventListener: (event: string) => {
          if (event === 'visibilitychange') visibilityListenerCount++;
        },
        removeEventListener: (event: string) => {
          if (event === 'visibilitychange') visibilityListenerCount--;
        },
      };

      // First attach
      bridge.attachLifecycle(fakeDoc as unknown as Document);
      expect(visibilityListenerCount).toBe(1);

      // Second attach (idempotent: cleans up previous first)
      const cleanup2 = bridge.attachLifecycle(fakeDoc as unknown as Document);
      expect(visibilityListenerCount).toBe(1);

      cleanup2();
      expect(visibilityListenerCount).toBe(0);

      bridge.destroy();
    });
  });
});
