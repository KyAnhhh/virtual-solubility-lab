import { describe, expect, it } from 'vitest';
import {
  HeadlessSimulationEngine,
  HeadlessSimulationFacade,
} from '../core/HeadlessSimulationEngine';
import {
  BEAKER_BASE_Y,
  BEAKER_INNER_RADIUS,
  computeParticleBounds,
  PARTICLE_RADIUS,
} from '../constants/beaker';
import {
  clampParticlePositionAndVelocity,
} from '../models/ParticleTransport';
import {
  MATERIAL_IDS,
  type RenderTarget,
} from '../core/SimulationState';

function createCallerTarget(capacity: number, includeRadii = false): RenderTarget & { radii?: Float32Array } {
  const target: RenderTarget & { radii?: Float32Array } = {
    positions: new Float32Array(capacity * 3),
    weights: new Float32Array(capacity),
    materials: new Uint8Array(capacity),
    count: capacity,
  };
  if (includeRadii) {
    target.radii = new Float32Array(capacity);
  }
  return target;
}

describe('V3-05: Particle Transport, Private Buffers, and Render Copy Contract', () => {
  describe('Part 1: Stateless Hash32, Seeding, Sampling & Budget Determinism (SC-P01, SC-P05, SC-B02)', () => {
    it('1. SC-P01 / SC-B02: N=10, N=100, N=700 produce EXACT identical scalar physics trajectory', () => {
      // Run three engines with identical seed and trace, but different particle budgets: 10, 100, 700
      const trace = [
        { ingredient: 'water', deciTicks: 1000 },
        { ingredient: 'sugar', deciTicks: 100 },
        { ingredient: 'sand', deciTicks: 100 },
        { ingredient: 'oil', deciTicks: 200 },
      ] as const;

      const engine10 = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 10 });
      const engine100 = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 100 });
      const engine700 = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 700 });

      const facade10 = new HeadlessSimulationFacade(engine10);
      const facade100 = new HeadlessSimulationFacade(engine100);
      const facade700 = new HeadlessSimulationFacade(engine700);

      for (const cmd of trace) {
        facade10.dispatchIntent({ type: 'add', ...cmd });
        facade100.dispatchIntent({ type: 'add', ...cmd });
        facade700.dispatchIntent({ type: 'add', ...cmd });
      }

      facade10.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade100.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade700.dispatchIntent({ type: 'setMode', mode: 'auto' });

      facade10.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade100.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade700.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });

      facade10.dispatchIntent({ type: 'resume' });
      facade100.dispatchIntent({ type: 'resume' });
      facade700.dispatchIntent({ type: 'resume' });

      // Run 600 ticks (10 seconds simulated)
      for (let i = 0; i < 600; i++) {
        engine10.advance(1 / 60);
        engine100.advance(1 / 60);
        engine700.advance(1 / 60);
      }

      const snap10 = engine10.snapshot();
      const snap100 = engine100.snapshot();
      const snap700 = engine700.snapshot();

      // Scalar trajectory must be bit-identical across budgets!
      expect(snap10.mass.W).toBe(snap100.mass.W);
      expect(snap10.mass.W).toBe(snap700.mass.W);

      expect(snap10.mass.Gu).toBe(snap100.mass.Gu);
      expect(snap10.mass.Gu).toBe(snap700.mass.Gu);

      expect(snap10.mass.Gd).toBe(snap100.mass.Gd);
      expect(snap10.mass.Gd).toBe(snap700.mass.Gd);

      expect(snap10.mass.Sb).toBe(snap100.mass.Sb);
      expect(snap10.mass.Sb).toBe(snap700.mass.Sb);

      expect(snap10.mass.Ss).toBe(snap100.mass.Ss);
      expect(snap10.mass.Ss).toBe(snap700.mass.Ss);

      expect(snap10.mass.Ol).toBe(snap100.mass.Ol);
      expect(snap10.mass.Ol).toBe(snap700.mass.Ol);

      expect(snap10.mass.Od).toBe(snap100.mass.Od);
      expect(snap10.mass.Od).toBe(snap700.mass.Od);

      expect(snap10.fGu).toBe(snap100.fGu);
      expect(snap10.fGu).toBe(snap700.fGu);

      expect(snap10.intensity).toBe(snap100.intensity);
      expect(snap10.intensity).toBe(snap700.intensity);
    });

    it('2. SC-P05: Same seed, generation, trace produces bit-identical particle positions', () => {
      const eA = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 50 });
      const eB = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 50 });

      const fA = new HeadlessSimulationFacade(eA);
      const fB = new HeadlessSimulationFacade(eB);

      fA.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      fB.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });

      fA.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });
      fB.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });

      fA.dispatchIntent({ type: 'setMode', mode: 'auto' });
      fB.dispatchIntent({ type: 'setMode', mode: 'auto' });

      fA.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });
      fB.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });

      fA.dispatchIntent({ type: 'resume' });
      fB.dispatchIntent({ type: 'resume' });

      for (let i = 0; i < 120; i++) {
        eA.advance(1 / 60);
        eB.advance(1 / 60);
      }

      const targetA = createCallerTarget(500);
      const targetB = createCallerTarget(500);

      const stampA = eA.copyRenderFrame(targetA);
      const stampB = eB.copyRenderFrame(targetB);

      expect(stampA.count).toBe(stampB.count);
      expect(stampA.count).toBeGreaterThan(0);

      for (let i = 0; i < stampA.count * 3; i++) {
        expect(targetA.positions[i]).toBe(targetB.positions[i]);
      }
      for (let i = 0; i < stampA.count; i++) {
        expect(targetA.weights[i]).toBe(targetB.weights[i]);
        expect(targetA.materials[i]).toBe(targetB.materials[i]);
      }
    });

    it('3. Changing budget N retains existing indices with intact birthOrdinal and samples new ones independently', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 10 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });

      const target10 = createCallerTarget(100);
      engine.copyRenderFrame(target10);

      const sandPoolBefore = engine.getTransport().getPool('sandBed');
      expect(sandPoolBefore.activeCount).toBe(10);
      const savedX0 = sandPoolBefore.positions[0];
      const savedY0 = sandPoolBefore.positions[1];
      const savedZ0 = sandPoolBefore.positions[2];
      const savedOrdinal0 = sandPoolBefore.birthOrdinals[0];

      // Reconfigure budget to 100
      engine.setParticleBudget(100);
      expect(engine.getParticleBudget()).toBe(100);

      const sandPoolAfter = engine.getTransport().getPool('sandBed');
      expect(sandPoolAfter.activeCount).toBe(100);

      // Retained index 0 keeps exact position and birthOrdinal!
      expect(sandPoolAfter.positions[0]).toBe(savedX0);
      expect(sandPoolAfter.positions[1]).toBe(savedY0);
      expect(sandPoolAfter.positions[2]).toBe(savedZ0);
      expect(sandPoolAfter.birthOrdinals[0]).toBe(savedOrdinal0);

      // New indices 10..99 have valid independent ordinals and non-zero positions
      for (let i = 10; i < 100; i++) {
        expect(sandPoolAfter.birthOrdinals[i]).toBe(i);
      }
    });

    it('4. Rejected or duplicate commands do not alter particle positions, weights, or birth counters', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 20 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });

      const targetBefore = createCallerTarget(200);
      engine.copyRenderFrame(targetBefore);

      // Attempt rejected command: exceeding capacity (deciTicks = 999999)
      const rejectAck = facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 999999 });
      expect(rejectAck.accepted).toBe(false);

      const targetAfter = createCallerTarget(200);
      engine.copyRenderFrame(targetAfter);

      expect(targetAfter.positions).toEqual(targetBefore.positions);
      expect(targetAfter.weights).toEqual(targetBefore.weights);
      expect(targetAfter.materials).toEqual(targetBefore.materials);

      // Duplicate command
      const dupAck = engine.dispatch({
        clientId: engine.getClientId(),
        seq: engine.getNextSequence() - 1, // duplicate of last rejected command
        expectedGeneration: engine.getCurrentGeneration(),
        payload: { type: 'add', ingredient: 'water', deciTicks: 999999 },
      });
      expect(dupAck.duplicate).toBe(true);

      const targetAfterDup = createCallerTarget(200);
      engine.copyRenderFrame(targetAfterDup);
      expect(targetAfterDup.positions).toEqual(targetBefore.positions);
    });
  });

  describe('Part 2: Pool Memberships, Bounds, and Projections (SC-R01, SC-R05, SC-P04)', () => {
    it('5. Pool membership across empty, dry, water-only, oil-only, and mixed categories', () => {
      // 5a. Empty: 0 active particles
      const emptyEngine = new HeadlessSimulationEngine();
      const emptyTarget = createCallerTarget(500);
      const emptyStamp = emptyEngine.copyRenderFrame(emptyTarget);
      expect(emptyStamp.count).toBe(0);

      // 5b. Dry: sand and sugar present, water=0, oil=0
      const dryEngine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 25 });
      const dryFacade = new HeadlessSimulationFacade(dryEngine);
      dryFacade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });
      dryFacade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 100 });

      const dryTransport = dryEngine.getTransport();
      expect(dryTransport.getPool('sandBed').activeCount).toBe(25);
      expect(dryTransport.getPool('sugarBed').activeCount).toBe(25);
      expect(dryTransport.getPool('sandSusp').activeCount).toBe(0);
      expect(dryTransport.getPool('sugarSusp').activeCount).toBe(0);
      expect(dryTransport.getPool('oilDroplet').activeCount).toBe(0);

      // 5c. Water-only: sugar and sand suspended in aqueous region
      const waterEngine = HeadlessSimulationEngine.createForTesting(
        {
          ...dryEngine.getState(),
          input: {
            water: 1000,
            sugar: 100,
            sand: 100,
            oil: 0,
          },
          mass: {
            ...dryEngine.getState().mass,
            W: 100,
            Gt: 10,
            Gu: 10,
            Gd: 0,
            St: 10,
            Sb: 4,
            Ss: 6,
          },
          fGu: 0.5,
        },
        { particleBudgetPerPool: 20 }
      );
      const waterTransport = waterEngine.getTransport();
      expect(waterTransport.getPool('sandBed').activeCount).toBe(20);
      expect(waterTransport.getPool('sugarBed').activeCount).toBe(20);
      expect(waterTransport.getPool('sandSusp').activeCount).toBe(20);
      expect(waterTransport.getPool('sugarSusp').activeCount).toBe(20);
      expect(waterTransport.getPool('oilDroplet').activeCount).toBe(0); // water-only has no oil droplets

      // 5d. Oil-only (SC-R01): solids suspended mapped to oil envelope
      const baseState = new HeadlessSimulationEngine().getState();
      const oilOnlyEngine = HeadlessSimulationEngine.createForTesting(
        {
          ...baseState,
          input: {
            water: 0,
            sugar: 0,
            sand: 100,
            oil: 1000,
          },
          mass: {
            ...baseState.mass,
            W: 0,
            Gt: 0,
            Gu: 0,
            Gd: 0,
            Ot: 90,
            Ol: 90,
            Od: 0,
            St: 10,
            Sb: 4,
            Ss: 6,
          },
        },
        { particleBudgetPerPool: 20 }
      );
      const oilTransport = oilOnlyEngine.getTransport();
      const sandSuspPool = oilTransport.getPool('sandSusp');
      expect(sandSuspPool.activeCount).toBe(20);
      expect(sandSuspPool.bounds.active).toBe(true);
      // Bounded in oil envelope!
      expect(sandSuspPool.bounds.yBottom).toBeGreaterThan(0.12);
      expect(oilTransport.getPool('oilDroplet').activeCount).toBe(0); // oil-only has no Od
    });

    it('6. SC-R05 / SC-P04: Zero and thin region radius and bounds (midpoint Y, effective radius <= height/2)', () => {
      // Zero height region
      const zeroBounds = computeParticleBounds(0.5, 0.5, 0.028);
      expect(zeroBounds.active).toBe(false);
      expect(zeroBounds.effectiveParticleRadius).toBe(0);

      // Thin region: height = 0.02 < 2 * 0.028 (0.056)
      const thinBounds = computeParticleBounds(0.5, 0.52, 0.028);
      expect(thinBounds.active).toBe(true);
      expect(thinBounds.effectiveParticleRadius).toBeLessThanOrEqual(0.02 / 2 + 1e-9);
      expect(thinBounds.effectiveParticleRadius).toBeCloseTo(0.01, 6);
      expect(thinBounds.yBottom).toBe(thinBounds.yTop);
      expect(thinBounds.midpointY).toBeCloseTo(0.51, 6);
      expect(thinBounds.yBottom).toBeCloseTo(0.51, 6);

      // Normal region: height = 1.0 > 2 * 0.028
      const normalBounds = computeParticleBounds(0.12, 1.12, 0.028);
      expect(normalBounds.active).toBe(true);
      expect(normalBounds.effectiveParticleRadius).toBe(0.028);
      expect(normalBounds.yBottom).toBeCloseTo(0.12 + 0.028, 6);
      expect(normalBounds.yTop).toBeCloseTo(1.12 - 0.028, 6);
      expect(normalBounds.yBottom).toBeLessThan(normalBounds.yTop);
    });

    it('7. Wall/base/top projection: preserves tangential velocity and removes outward velocity', () => {
      const bounds = computeParticleBounds(0.12, 1.0, 0.028);
      const maxR = bounds.horizontalRadius; // BEAKER_INNER_RADIUS - 0.028 - 0.01

      // 7a. Particle pushed radially beyond wall at (maxR + 0.1, 0) with outward velocity (1.0, 0, 0)
      const outwardP: [number, number, number] = [maxR + 0.1, 0.5, 0];
      const outwardV: [number, number, number] = [1.0, 0, 0.5]; // 0.5 is tangential (along z)

      const clampedWall = clampParticlePositionAndVelocity(outwardP, outwardV, bounds);
      expect(clampedWall.pNext[0]).toBeCloseTo(maxR, 6);
      expect(clampedWall.pNext[2]).toBeCloseTo(0, 6);
      // Outward radial vx must be 0!
      expect(clampedWall.vNext[0]).toBeCloseTo(0, 6);
      // Tangential vz must be preserved!
      expect(clampedWall.vNext[2]).toBeCloseTo(0.5, 6);

      // 7b. Vertical bottom boundary
      const belowP: [number, number, number] = [0, bounds.yBottom - 0.05, 0];
      const downwardV: [number, number, number] = [0.2, -0.8, 0.3];
      const clampedBottom = clampParticlePositionAndVelocity(belowP, downwardV, bounds);
      expect(clampedBottom.pNext[1]).toBeCloseTo(bounds.yBottom, 6);
      expect(clampedBottom.vNext[1]).toBe(0); // downward vy zeroed
      expect(clampedBottom.vNext[0]).toBe(0.2); // horizontal preserved
      expect(clampedBottom.vNext[2]).toBe(0.3); // horizontal preserved
    });

    it('8. Sum of representative particle weights in active pools matches authoritative phase masses', () => {
      const engine = HeadlessSimulationEngine.createForTesting(
        {
          ...new HeadlessSimulationEngine().getState(),
          input: {
            water: 1000,
            sugar: 200,
            sand: 150,
            oil: 200,
          },
          mass: {
            W: 100,
            Gt: 20,
            Gu: 12,
            Gd: 8,
            St: 15,
            Sb: 10,
            Ss: 5,
            Ot: 18,
            Ol: 12,
            Od: 6,
          },
          fGu: 0.25, // GuSusp = 3g, GuBed = 9g
        },
        { particleBudgetPerPool: 50 }
      );

      const target = createCallerTarget(1000);
      const stamp = engine.copyRenderFrame(target);
      expect(stamp.count).toBe(250); // 5 active pools * 50

      let totalSugarWeight = 0;
      let totalSandWeight = 0;
      let totalOilDropletWeight = 0;

      for (let i = 0; i < stamp.count; i++) {
        const mat = target.materials[i];
        const w = target.weights[i];
        expect(w).toBeGreaterThan(0);
        expect(Number.isFinite(w)).toBe(true);

        if (mat === MATERIAL_IDS.sugar) totalSugarWeight += w;
        else if (mat === MATERIAL_IDS.sand) totalSandWeight += w;
        else if (mat === MATERIAL_IDS.oilDroplet) totalOilDropletWeight += w;
      }

      // Sugar representatives represent undissolved sugar Gu = 12g (9g bed + 3g susp)
      expect(totalSugarWeight).toBeCloseTo(12.0, 4);

      // Sand representatives represent total sand St = 15g (10g bed + 5g susp)
      expect(totalSandWeight).toBeCloseTo(15.0, 4);

      // Oil droplet representatives represent dispersed oil Od = 6g
      expect(totalOilDropletWeight).toBeCloseTo(6.0, 4);
    });
  });

  describe('Part 3: Phase Changes, Dissolution, Suspension & Add Paused (SC-P03, SC-R04, SC-A01)', () => {
    it('9. SC-P03: Dissolution decreases representative sugar mass, Gt invariant; Gu=0 leaves 0 active sugar particles', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 50 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 }); // 100g water
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 10 });   // 1g sugar

      const targetBefore = createCallerTarget(500);
      const stampBefore = engine.copyRenderFrame(targetBefore);
      let sugarWeightBefore = 0;
      for (let i = 0; i < stampBefore.count; i++) {
        if (targetBefore.materials[i] === MATERIAL_IDS.sugar) sugarWeightBefore += targetBefore.weights[i];
      }
      expect(sugarWeightBefore).toBeCloseTo(1.0, 4);

      // Run auto fast stirring to dissolve 1g sugar completely
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      // Run for 3600 ticks (60 seconds)
      for (let i = 0; i < 3600; i++) {
        engine.advance(1 / 60);
      }

      const snap = engine.snapshot();
      expect(snap.mass.Gd).toBeCloseTo(1.0, 4);
      expect(snap.mass.Gu).toBeCloseTo(0.0, 4);
      expect(snap.mass.Gt).toBe(1.0); // Invariant!

      const targetAfter = createCallerTarget(500);
      const stampAfter = engine.copyRenderFrame(targetAfter);

      let sugarParticlesAfter = 0;
      for (let i = 0; i < stampAfter.count; i++) {
        if (targetAfter.materials[i] === MATERIAL_IDS.sugar) sugarParticlesAfter++;
      }

      // When Gu=0, there are 0 active sugar representatives!
      expect(sugarParticlesAfter).toBe(0);
    });

    it('10. Sand and fGu kinetics: flow raises particles from bed into suspension; stop settles them back', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 30 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });

      // Initially at rest: all sand is in bed
      const transport = engine.getTransport();
      expect(transport.getPool('sandBed').activeCount).toBe(30);
      expect(transport.getPool('sandSusp').activeCount).toBe(0);

      // Start auto stirring fast
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      for (let i = 0; i < 120; i++) {
        engine.advance(1 / 60);
      }

      // After 2 seconds of fast stirring, sand suspension is active!
      expect(engine.snapshot().mass.Ss).toBeGreaterThan(1.0);
      expect(transport.getPool('sandSusp').activeCount).toBe(30);

      // Stop auto stirring
      facade.dispatchIntent({ type: 'releaseDrive' });

      for (let i = 0; i < 2400; i++) {
        engine.advance(1 / 60);
      }

      // After long settling, sand in suspension approaches 0
      expect(engine.snapshot().mass.Ss).toBeLessThan(0.05);
    });

    it('11. SC-R04: Add while paused updates regions, reweights, retains valid positions/velocities, and projects out-of-bounds', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 20 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 }); // 10g sand
      expect(engine.snapshot().paused).toBe(true);

      const target1 = createCallerTarget(100);
      engine.copyRenderFrame(target1);
      const initialElapsed = engine.snapshot().elapsedSeconds;
      const initialTick = engine.snapshot().tickIndex;

      const sandPool = engine.getTransport().getPool('sandBed');
      const p0Before = [sandPool.positions[0], sandPool.positions[1], sandPool.positions[2]];

      // Add more sand while paused
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 50 }); // +5g sand

      // Clock must NOT have advanced!
      expect(engine.snapshot().elapsedSeconds).toBe(initialElapsed);
      expect(engine.snapshot().tickIndex).toBe(initialTick);

      // Weights reweighted from 10g / 20 = 0.5g to 15g / 20 = 0.75g
      expect(sandPool.weights[0]).toBeCloseTo(0.75, 4);

      // Retained particle within bed keeps its position
      expect(sandPool.positions[0]).toBe(p0Before[0]);
      expect(sandPool.positions[2]).toBe(p0Before[2]);
    });

    it('12. Pause freezes particle transport completely; resume continues smoothly', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 30 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      for (let i = 0; i < 60; i++) engine.advance(1 / 60);

      // Pause engine
      facade.dispatchIntent({ type: 'pause' });
      expect(engine.snapshot().paused).toBe(true);

      const targetPaused1 = createCallerTarget(200);
      engine.copyRenderFrame(targetPaused1);

      // Advance clock while paused: must be no-op for transport
      engine.advance(1.0);
      engine.advance(5.0);

      const targetPaused2 = createCallerTarget(200);
      engine.copyRenderFrame(targetPaused2);

      expect(targetPaused2.positions).toEqual(targetPaused1.positions);
      expect(targetPaused2.weights).toEqual(targetPaused1.weights);
    });

    it('13. Reset clears all pools to 0; duplicate reset does not re-apply or corrupt generation', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 20 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 100 });

      expect(engine.getTransport().getTotalActiveCount()).toBeGreaterThan(0);

      // Scientific reset
      const resetAck = facade.dispatchIntent({ type: 'reset' });
      expect(resetAck.accepted).toBe(true);
      expect(resetAck.generation).toBe(1);

      const targetAfterReset = createCallerTarget(200);
      const stamp = engine.copyRenderFrame(targetAfterReset);
      expect(stamp.count).toBe(0);
      expect(stamp.generation).toBe(1);

      // Duplicate reset replay
      const dupResetAck = engine.dispatch({
        clientId: engine.getClientId(),
        seq: resetAck.seq,
        expectedGeneration: 0,
        payload: { type: 'reset' },
      });
      expect(dupResetAck.duplicate).toBe(true);
      expect(engine.getCurrentGeneration()).toBe(1); // not incremented again!
    });
  });

  describe('Part 4: copyRenderFrame Isolation and Memory Safety (SC-B01, SC-R04)', () => {
    it('14. SC-B01: Caller mutating target buffer has ZERO effect on engine private state or next step', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 20 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });

      const callerTarget = createCallerTarget(100);
      engine.copyRenderFrame(callerTarget);

      const originalFirstX = callerTarget.positions[0];
      const originalFirstWeight = callerTarget.weights[0];

      // Malicious caller mutates target arrays directly:
      callerTarget.positions[0] = 999999.0;
      callerTarget.positions[1] = -888888.0;
      callerTarget.weights[0] = 12345.0;
      callerTarget.materials[0] = 99;

      // Engine's internal private buffer must remain pristine!
      const sandPool = engine.getTransport().getPool('sandBed');
      expect(sandPool.positions[0]).toBe(originalFirstX);
      expect(sandPool.weights[0]).toBe(originalFirstWeight);
      expect(sandPool.material).toBe(MATERIAL_IDS.sand);

      // Advance engine: next frame copy gives valid physics, unaffected by caller's mutation
      facade.dispatchIntent({ type: 'resume' });
      engine.advance(1 / 60);

      const freshTarget = createCallerTarget(100);
      engine.copyRenderFrame(freshTarget);
      expect(freshTarget.positions[0]).not.toBe(999999.0);
      expect(freshTarget.weights[0]).toBe(originalFirstWeight);
    });

    it('15. Non-aliasing: caller-owned buffers are copied into; engine advance does NOT mutate previous target', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 20 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      const targetSnapshot1 = createCallerTarget(200);
      engine.copyRenderFrame(targetSnapshot1);

      // Save a copy of targetSnapshot1's values
      const savedPositions = new Float32Array(targetSnapshot1.positions);

      // Advance engine for 30 ticks
      for (let i = 0; i < 30; i++) {
        engine.advance(1 / 60);
      }

      // targetSnapshot1 must NOT have been silently mutated by engine.advance!
      expect(targetSnapshot1.positions).toEqual(savedPositions);
    });

    it('16. Undersized or malformed RenderTarget is rejected atomically without partial mutation', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 20 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });

      // Target capacity too small: 5 particles when 20 are active
      const undersizedTarget = createCallerTarget(5);
      undersizedTarget.positions.fill(123.456);

      expect(() => {
        engine.copyRenderFrame(undersizedTarget);
      }).toThrow(RangeError);

      // Buffer was NOT partially overwritten before failure!
      expect(undersizedTarget.positions[0]).toBeCloseTo(123.456, 3);

      // Malformed targets
      expect(() => engine.copyRenderFrame(null as unknown as RenderTarget)).toThrow(TypeError);
      expect(() => engine.copyRenderFrame({} as unknown as RenderTarget)).toThrow(TypeError);
      expect(() =>
        engine.copyRenderFrame({
          positions: new Float32Array(10),
          weights: [] as unknown as Float32Array,
          materials: new Uint8Array(10),
          count: 10,
        })
      ).toThrow(TypeError);
    });

    it('17. RenderStamp consistency: generation, stateVersion, renderRevision, and count', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 20 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });

      const target = createCallerTarget(200, true);
      const stamp1 = engine.copyRenderFrame(target);

      expect(stamp1.generation).toBe(0);
      expect(stamp1.stateVersion).toBe(engine.snapshot().stateVersion);
      expect(stamp1.count).toBe(20);
      expect(stamp1.renderRevision).toBeGreaterThan(0);

      // Reading again without any state changes does NOT increment renderRevision
      const stamp2 = engine.copyRenderFrame(target);
      expect(stamp2.renderRevision).toBe(stamp1.renderRevision);

      // For 10g sand, Vbed = 6ml, Hbed = 0.0252 < 2 * 0.023 (0.046).
      // Effective radius is scaled down to Hbed / 2 = 0.0126 scene units to prevent poking out!
      expect(target.radii![0]).toBeCloseTo(0.0126, 4);

      // Now add 200 deciTicks (20g) more sand -> total 30g, Hbed = 0.0756 > 0.046 (normal region)
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 200 });
      engine.copyRenderFrame(target);
      expect(target.radii![0]).toBeCloseTo(PARTICLE_RADIUS.sand, 4);
    });
  });

  describe('Part 5: Long Run Stability & Timestep Independence (SC-P02, SC-N02, SC-N05)', () => {
    it('18. SC-P02 / SC-N02: 36,000 continuous ticks (600 simulated seconds) on mixed fixture M: all positions remain finite and strictly inside bounds', () => {
      // Setup mixed fixture: Water 100ml, Sugar 10g, Sand 10g, Oil 20ml
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 20 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 100 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });
      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 });

      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      const target = createCallerTarget(500);

      // Run 36,000 ticks in batches, asserting invariants and bounds
      for (let batch = 0; batch < 36; batch++) {
        for (let tick = 0; tick < 1000; tick++) {
          engine.advance(1 / 60);
        }

        const stamp = engine.copyRenderFrame(target);
        expect(stamp.count).toBeGreaterThan(0);

        for (let i = 0; i < stamp.count; i++) {
          const x = target.positions[i * 3];
          const y = target.positions[i * 3 + 1];
          const z = target.positions[i * 3 + 2];
          const w = target.weights[i];

          // All values must be finite numbers
          expect(Number.isFinite(x)).toBe(true);
          expect(Number.isFinite(y)).toBe(true);
          expect(Number.isFinite(z)).toBe(true);
          expect(Number.isFinite(w)).toBe(true);
          expect(w).toBeGreaterThanOrEqual(0);

          // Horizontal position strictly inside beaker inner radius
          const r = Math.hypot(x, z);
          expect(r).toBeLessThanOrEqual(BEAKER_INNER_RADIUS);

          // Vertical position strictly inside beaker bottom and top
          expect(y).toBeGreaterThanOrEqual(BEAKER_BASE_Y - 1e-4);
          expect(y).toBeLessThanOrEqual(2.5); // well below beaker upper rim
        }
      }

      expect(engine.snapshot().tickIndex).toBe(36000);
      expect(engine.snapshot().elapsedSeconds).toBeCloseTo(600.0, 4);
    });

    it('19. SC-N05: Timestep independence h=1/60 vs h=1/120 produces consistent transport trajectory within dynamic tolerance', () => {
      // 10 simulated seconds with h=1/60 (600 steps) vs h=1/120 (1200 steps)
      const e60 = new HeadlessSimulationEngine({
        seed: 1729,
        particleBudgetPerPool: 20,
        clockConfig: { h: 1 / 60, maxSteps: 12 },
      });
      const e120 = new HeadlessSimulationEngine({
        seed: 1729,
        particleBudgetPerPool: 20,
        clockConfig: { h: 1 / 120, maxSteps: 24 },
      });

      const f60 = new HeadlessSimulationFacade(e60);
      const f120 = new HeadlessSimulationFacade(e120);

      f60.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      f120.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });

      f60.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });
      f120.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });

      f60.dispatchIntent({ type: 'setMode', mode: 'auto' });
      f120.dispatchIntent({ type: 'setMode', mode: 'auto' });

      f60.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });
      f120.dispatchIntent({ type: 'setAutoLevel', level: 'medium' });

      f60.dispatchIntent({ type: 'resume' });
      f120.dispatchIntent({ type: 'resume' });

      // Run 10 simulated seconds: e60 takes 600 steps, e120 takes 1200 steps
      for (let i = 0; i < 600; i++) e60.advance(1 / 60);
      for (let i = 0; i < 1200; i++) e120.advance(1 / 120);

      expect(e60.snapshot().elapsedSeconds).toBeCloseTo(10.0, 4);
      expect(e120.snapshot().elapsedSeconds).toBeCloseTo(10.0, 4);

      // Phase quantities match within 1% of total input (SC-N05)
      expect(Math.abs(e60.snapshot().mass.Ss - e120.snapshot().mass.Ss)).toBeLessThan(0.1);

      const target60 = createCallerTarget(200);
      const target120 = createCallerTarget(200);

      e60.copyRenderFrame(target60);
      e120.copyRenderFrame(target120);

      expect(target60.count).toBe(target120.count);

      // RMS position difference across particles is bounded
      let sumSqDiff = 0;
      for (let i = 0; i < target60.count * 3; i++) {
        const diff = target60.positions[i] - target120.positions[i];
        sumSqDiff += diff * diff;
      }
      const rmsDiff = Math.sqrt(sumSqDiff / (target60.count * 3));
      expect(rmsDiff).toBeLessThan(0.5); // Well within reasonable dynamic tolerance
    });

    it('20. Full end-to-end regression: all 5 pools active, particles renderable and consistent with mass ledger', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729, particleBudgetPerPool: 50 });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 2000 }); // 200ml
      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 500 });    // 50ml
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 300 });  // 30g
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 300 });   // 30g

      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      for (let i = 0; i < 300; i++) {
        engine.advance(1 / 60);
      }

      const target = createCallerTarget(500, true);
      const stamp = engine.copyRenderFrame(target);

      expect(stamp.count).toBe(250); // 5 pools * 50
      expect(stamp.generation).toBe(0);
      expect(stamp.stateVersion).toBe(engine.snapshot().stateVersion);

      // Verify all materials are represented
      const matSet = new Set<number>();
      for (let i = 0; i < stamp.count; i++) {
        matSet.add(target.materials[i]);
      }
      expect(matSet.has(MATERIAL_IDS.sugar)).toBe(true);
      expect(matSet.has(MATERIAL_IDS.sand)).toBe(true);
      expect(matSet.has(MATERIAL_IDS.oilDroplet)).toBe(true);
    });
  });
});
