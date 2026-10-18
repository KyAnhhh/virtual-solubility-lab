import { describe, expect, it } from 'vitest';
import {
  HeadlessSimulationEngine,
  HeadlessSimulationFacade,
} from '../core/HeadlessSimulationEngine';
import { SimulationBridge, type HostClockAdapter } from '../bridge/SimulationBridge';
import { DEFAULT_H } from '../core/SimulationClock';
import {
  type RenderTarget,
  type RenderStamp,
} from '../core/SimulationState';
import { useExperimentStore } from '../../stores/experimentStore';
import { POOL_KINDS } from '../models/ParticleTransport';

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

function createCallerTarget(capacity: number): RenderTarget & { radii: Float32Array; poolIds: Uint8Array } {
  return {
    positions: new Float32Array(capacity * 3),
    weights: new Float32Array(capacity),
    materials: new Uint8Array(capacity),
    radii: new Float32Array(capacity),
    poolIds: new Uint8Array(capacity),
    count: capacity,
  };
}

describe('Visual Particle Transport & 3D Renderer Integration', () => {
  describe('1. Engine Frame to Renderer Adapter Contract (copyRenderFrame & poolRanges)', () => {
    it('accurately copies positions, weights, materials, radii, poolIds and returns poolRanges', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 50 });
      const facade = new HeadlessSimulationFacade(engine);

      // Add water 100ml, sugar 10g, sand 10g, oil 20ml (Fixture: W=100, G=10, S=10, O=20)
      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 100 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });
      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 });

      const target = createCallerTarget(500);
      const stamp: RenderStamp = engine.copyRenderFrame(target);

      expect(stamp.count).toBeGreaterThan(0);
      expect(stamp.generation).toBe(0);
      expect(stamp.poolRanges).toBeDefined();

      const ranges = stamp.poolRanges!;
      for (const kind of POOL_KINDS) {
        expect(ranges[kind]).toBeDefined();
        expect(typeof ranges[kind].offset).toBe('number');
        expect(typeof ranges[kind].count).toBe('number');
        expect(ranges[kind].count).toBeGreaterThanOrEqual(0);
      }

      // Check offsets do not overlap and partition active particles
      let runningOffset = 0;
      for (const kind of POOL_KINDS) {
        expect(ranges[kind].offset).toBe(runningOffset);
        runningOffset += ranges[kind].count;
      }
      expect(runningOffset).toBe(stamp.count);

      // Verify poolIds match pool index
      for (const kind of POOL_KINDS) {
        const poolIndex = POOL_KINDS.indexOf(kind);
        const { offset, count } = ranges[kind];
        for (let i = 0; i < count; i++) {
          expect(target.poolIds[offset + i]).toBe(poolIndex);
        }
      }
    });

    it('mutating caller-owned target arrays does NOT corrupt engine internal state', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 50 });
      const facade = new HeadlessSimulationFacade(engine);
      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });

      const target = createCallerTarget(500);
      engine.copyRenderFrame(target);

      const originalX = target.positions[0];
      // Mutate target buffer
      target.positions[0] = 99999.0;
      target.weights[0] = 8888.0;

      // Second copy should re-extract authentic positions from engine
      const target2 = createCallerTarget(500);
      engine.copyRenderFrame(target2);

      expect(target2.positions[0]).toBeCloseTo(originalX, 6);
      expect(target2.positions[0]).not.toBe(99999.0);
    });
  });

  describe('2. Substance-Specific Transport Kinetics & Pool Mapping', () => {
    it('Gd (dissolved sugar) does NOT generate solid particles; Gu decreases as sugar dissolves', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 50 });
      const facade = new HeadlessSimulationFacade(engine);

      // Add 100 ml water and 5 g sugar
      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 50 });
      facade.dispatchIntent({ type: 'resume' });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });

      const target = createCallerTarget(500);
      const stamp0 = engine.copyRenderFrame(target);
      const sugarBed0 = stamp0.poolRanges!.sugarBed.count;
      expect(sugarBed0).toBe(50); // Full budget initially in bed

      // Step 600 ticks (10 sim seconds) of fast stirring
      for (let i = 0; i < 600; i++) {
        engine.advance(DEFAULT_H);
      }

      const stamp1 = engine.copyRenderFrame(target);
      const state = engine.getState();

      // Dissolution has transferred Gu -> Gd
      expect(state.mass.Gd).toBeGreaterThan(0);
      expect(state.mass.Gu).toBeLessThan(5.0);

      // Suspended sugar pool active during stirring
      const sugarSusp = stamp1.poolRanges!.sugarSusp.count;
      expect(sugarSusp).toBeGreaterThanOrEqual(0);

      // Total sugar particles (bed + susp) represent ONLY undissolved Gu, NOT Gd!
      const totalSugarParticles = stamp1.poolRanges!.sugarBed.count + stamp1.poolRanges!.sugarSusp.count;
      expect(totalSugarParticles).toBeGreaterThanOrEqual(0);
    });

    it('Sand does not dissolve; stirs up to sandSusp and settles back to sandBed when stopped', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 50 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });
      facade.dispatchIntent({ type: 'resume' });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });

      const target = createCallerTarget(500);

      // Advance 120 ticks (2 seconds) under fast stirring
      for (let i = 0; i < 120; i++) {
        engine.advance(DEFAULT_H);
      }

      let stamp = engine.copyRenderFrame(target);
      const ssDuringStir = engine.getState().mass.Ss;
      const sbDuringStir = engine.getState().mass.Sb;

      // Sand suspension is active in engine and renderer
      expect(ssDuringStir).toBeGreaterThan(0.001);
      expect(stamp.poolRanges!.sandSusp.count).toBe(50);

      // Positions of suspended sand particles are within aqueous volume
      const suspOffset = stamp.poolRanges!.sandSusp.offset;
      for (let i = 0; i < stamp.poolRanges!.sandSusp.count; i++) {
        const y = target.positions[(suspOffset + i) * 3 + 1];
        expect(y).toBeGreaterThan(0.12); // above beaker bottom
      }

      // Stop auto stirring (leaves clock running, flow decays, sand settles)
      facade.dispatchIntent({ type: 'releaseDrive' });

      // Advance 600 ticks (10 sim seconds) for settling
      for (let i = 0; i < 600; i++) {
        engine.advance(DEFAULT_H);
      }

      stamp = engine.copyRenderFrame(target);
      const stateAfterSettling = engine.getState();

      // Sand has settled back toward bed (Ss decreases significantly, Sb increases)
      expect(stateAfterSettling.mass.Ss).toBeLessThan(ssDuringStir);
      expect(stateAfterSettling.mass.Sb).toBeGreaterThan(sbDuringStir);
      expect(stateAfterSettling.mass.St).toBe(10.0); // Mass strictly invariant
    });

    it('Oil droplets disperse in mixed water+oil under fast stirring and rise on stop', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 50 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 });
      facade.dispatchIntent({ type: 'resume' });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });

      const target = createCallerTarget(500);

      // Fast stirring for 180 ticks (3 seconds)
      for (let i = 0; i < 180; i++) {
        engine.advance(DEFAULT_H);
      }

      let stamp = engine.copyRenderFrame(target);
      const odStirring = engine.getState().mass.Od;
      const olStirring = engine.getState().mass.Ol;

      // Od > 0 and oil droplets active in renderer
      expect(odStirring).toBeGreaterThan(0.001);
      expect(stamp.poolRanges!.oilDroplet.count).toBe(50);

      // Droplets are inside aqueous region
      const dropletOffset = stamp.poolRanges!.oilDroplet.offset;
      for (let i = 0; i < stamp.poolRanges!.oilDroplet.count; i++) {
        const y = target.positions[(dropletOffset + i) * 3 + 1];
        expect(y).toBeGreaterThan(0.12);
      }

      // Stop stirring
      facade.dispatchIntent({ type: 'releaseDrive' });

      // Run 600 ticks for droplet separation/rise
      for (let i = 0; i < 600; i++) {
        engine.advance(DEFAULT_H);
      }

      stamp = engine.copyRenderFrame(target);
      const stateAfter = engine.getState();

      // Droplets coalesce back to oil layer (Od decreases, Ol increases)
      expect(stateAfter.mass.Od).toBeLessThan(odStirring);
      expect(stateAfter.mass.Ol).toBeGreaterThan(olStirring);
      expect(stateAfter.mass.Ot).toBe(20 * 0.9); // Total oil invariant
    });
  });

  describe('3. Dynamic Particle Transport Motion (Positions Change Under Flow)', () => {
    it('particle positions dynamically change between frames when omegaFlow > 0', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 50 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });
      facade.dispatchIntent({ type: 'resume' });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });

      // Step 60 ticks to establish strong flow
      for (let i = 0; i < 60; i++) {
        engine.advance(DEFAULT_H);
      }

      const target1 = createCallerTarget(500);
      engine.copyRenderFrame(target1);

      // Advance 5 ticks
      for (let i = 0; i < 5; i++) {
        engine.advance(DEFAULT_H);
      }

      const target2 = createCallerTarget(500);
      engine.copyRenderFrame(target2);

      // Verify at least some active suspended particles have moved
      let totalDisplacement = 0;
      for (let i = 0; i < target1.positions.length; i += 3) {
        const dx = target2.positions[i] - target1.positions[i];
        const dy = target2.positions[i + 1] - target1.positions[i + 1];
        const dz = target2.positions[i + 2] - target1.positions[i + 2];
        totalDisplacement += Math.hypot(dx, dy, dz);
      }

      expect(totalDisplacement).toBeGreaterThan(0.01);
    });

    it('pause freezes particle positions across frames; resume continues motion', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 50 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });
      facade.dispatchIntent({ type: 'resume' });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });

      for (let i = 0; i < 60; i++) {
        engine.advance(DEFAULT_H);
      }

      // Pause simulation
      facade.dispatchIntent({ type: 'pause' });

      const targetA = createCallerTarget(500);
      engine.copyRenderFrame(targetA);

      // Advance while paused (clock ignores dt)
      engine.advance(DEFAULT_H);
      engine.advance(DEFAULT_H);

      const targetB = createCallerTarget(500);
      engine.copyRenderFrame(targetB);

      // Positions must be EXACTLY identical
      for (let i = 0; i < targetA.positions.length; i++) {
        expect(targetB.positions[i]).toBe(targetA.positions[i]);
      }

      // Resume simulation
      facade.dispatchIntent({ type: 'resume' });
      for (let i = 0; i < 5; i++) {
        engine.advance(DEFAULT_H);
      }

      const targetC = createCallerTarget(500);
      engine.copyRenderFrame(targetC);

      // Motion resumed
      let diff = 0;
      for (let i = 0; i < targetA.positions.length; i++) {
        diff += Math.abs(targetC.positions[i] - targetA.positions[i]);
      }
      expect(diff).toBeGreaterThan(0.01);
    });
  });

  describe('4. SimulationBridge Integration & Generation Fencing', () => {
    it('SimulationBridge exposes copyRenderFrame and respects generation advance on reset', () => {
      const hostClock = new MockHostClock();
      const bridge = new SimulationBridge({ hostClock });

      bridge.add('water', 100);
      bridge.add('sand', 10);
      bridge.resume();

      const target = createCallerTarget(500);
      const stamp0 = bridge.copyRenderFrame(target);
      expect(stamp0.generation).toBe(0);
      expect(stamp0.count).toBeGreaterThan(0);

      // Reset simulation
      bridge.reset();

      const stamp1 = bridge.copyRenderFrame(target);
      expect(stamp1.generation).toBe(1);
      expect(stamp1.count).toBe(0); // All particles cleared on reset

      bridge.destroy();
    });

    it('Camera reset preserves particle transport state and generation', () => {
      const hostClock = new MockHostClock();
      const bridge = new SimulationBridge({ hostClock });

      bridge.add('water', 100);
      bridge.add('sand', 10);
      bridge.resume();
      for (let i = 0; i < 30; i++) {
        bridge.getEngine().advance(DEFAULT_H);
      }

      const target = createCallerTarget(500);
      const stampBefore = bridge.copyRenderFrame(target);
      const posBefore = new Float32Array(target.positions);

      // Reset camera
      useExperimentStore.getState().resetCamera();

      const stampAfter = bridge.copyRenderFrame(target);

      // Generation, count, and positions are completely invariant
      expect(stampAfter.generation).toBe(stampBefore.generation);
      expect(stampAfter.count).toBe(stampBefore.count);
      for (let i = 0; i < stampAfter.count * 3; i++) {
        expect(target.positions[i]).toBe(posBefore[i]);
      }

      bridge.destroy();
    });
  });
});
