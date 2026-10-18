import { describe, it, expect } from 'vitest';
import { HeadlessSimulationEngine } from '../core/HeadlessSimulationEngine';
import { SimulationBridge } from '../bridge/SimulationBridge';
import { createExperimentStore } from '../../stores/experimentStore';
import {
  type ScienceState,
  type ScienceMassCompartments,
  type RenderTarget,
  DEFAULT_SEED,
} from '../core/SimulationState';
import type { IngredientId } from '../../types/experiment';
import {
  VISUAL_MILLI_ML_PER_TICK,
} from '../constants/ingredients';
import {
  type PhaseMasses,
  computeBeakerRegions,
} from '../constants/beaker';
import { assertMassInvariants } from '../models/MassLedger';
import { MAX_BUFFER_CAPACITY } from '../../scene/particleMeshHelpers';

const ING_WATER: IngredientId = 'water';
const ING_SUGAR: IngredientId = 'sugar';
const ING_SAND: IngredientId = 'sand';
const ING_OIL: IngredientId = 'oil';

/**
 * Standard doses for combinatorial tests (all well under beaker capacity):
 * Water: 100 ml (1000 deciTicks)
 * Sugar: 10 g (100 deciTicks)
 * Sand: 10 g (100 deciTicks)
 * Oil: 20 ml (200 deciTicks) -> 18 g oil
 * Total volume reservation: 100 + 6.5 + 6.0 + 20 = 132.5 ml = 132,500 milli-ml.
 */
const STANDARD_DOSES: Record<IngredientId, number> = {
  [ING_WATER]: 1000, // 100 ml
  [ING_SUGAR]: 100,  // 10 g
  [ING_SAND]: 100,   // 10 g
  [ING_OIL]: 200,    // 20 ml
};

const ALL_INGREDIENTS: IngredientId[] = [ING_WATER, ING_SUGAR, ING_SAND, ING_OIL];

/**
 * Helper to map engine ScienceState into PhaseMasses for computeBeakerRegions.
 */
function stateToPhaseMasses(state: ScienceState): PhaseMasses {
  const rhoO = 0.9;
  return {
    Wml: state.mass.W,
    Oml: state.mass.Ot / rhoO,
    Gt: state.mass.Gt,
    Gu: state.mass.Gu,
    Gd: state.mass.Gd,
    fGu: state.fGu,
    St: state.mass.St,
    Sb: state.mass.Sb,
    Ss: state.mass.Ss,
    Ot: state.mass.Ot,
    Ol: state.mass.Ol,
    Od: state.mass.Od,
  };
}

/**
 * Deterministically generates all 16 subsets of the 4 ingredients.
 */
function generateAllSubsets(): IngredientId[][] {
  const subsets: IngredientId[][] = [];
  for (let mask = 0; mask < 16; mask++) {
    const subset: IngredientId[] = [];
    if (mask & 1) subset.push(ING_WATER);
    if (mask & 2) subset.push(ING_SUGAR);
    if (mask & 4) subset.push(ING_SAND);
    if (mask & 8) subset.push(ING_OIL);
    subsets.push(subset);
  }
  return subsets;
}

/**
 * Deterministically generates all 24 permutations of the 4 ingredients.
 */
function generateAllPermutations(items: IngredientId[]): IngredientId[][] {
  if (items.length <= 1) return [items];
  const result: IngredientId[][] = [];
  for (let i = 0; i < items.length; i++) {
    const current = items[i];
    const remaining = [...items.slice(0, i), ...items.slice(i + 1)];
    const subPerms = generateAllPermutations(remaining);
    for (const p of subPerms) {
      result.push([current, ...p]);
    }
  }
  return result;
}

/**
 * Helper to compute expected reservation volume in milli-ml directly from input ticks.
 */
function computeExpectedReservation(input: ScienceState['input']): number {
  return (
    input.water * VISUAL_MILLI_ML_PER_TICK.water +
    input.sugar * VISUAL_MILLI_ML_PER_TICK.sugar +
    input.sand * VISUAL_MILLI_ML_PER_TICK.sand +
    input.oil * VISUAL_MILLI_ML_PER_TICK.oil
  );
}

/**
 * Helper to assert comprehensive scientific invariants on a given state.
 */
function assertComprehensiveStateInvariants(state: ScienceState, context: string): void {
  // 1. Ledger invariants
  assertMassInvariants(state, { stage: context });

  // 2. Exact match with input ticks
  expect(state.mass.W).toBeCloseTo(state.input.water * 0.1, 8);
  expect(state.mass.Gt).toBeCloseTo(state.input.sugar * 0.1, 8);
  expect(state.mass.St).toBeCloseTo(state.input.sand * 0.1, 8);
  expect(state.mass.Ot).toBeCloseTo(state.input.oil * 0.1 * 0.9, 8);

  // 3. Compartment sums
  expect(state.mass.Gu + state.mass.Gd).toBeCloseTo(state.mass.Gt, 8);
  expect(state.mass.Sb + state.mass.Ss).toBeCloseTo(state.mass.St, 8);
  expect(state.mass.Ol + state.mass.Od).toBeCloseTo(state.mass.Ot, 8);

  // 4. Non-negative and finite
  for (const [k, v] of Object.entries(state.mass)) {
    expect(Number.isFinite(v), `${context}: mass.${k} is finite`).toBe(true);
    expect(v, `${context}: mass.${k} is non-negative`).toBeGreaterThanOrEqual(0);
  }

  // 5. Dry gate
  if (state.mass.W === 0 && state.mass.Ot === 0) {
    expect(state.mass.Gd).toBe(0);
    expect(state.mass.Od).toBe(0);
    expect(state.mass.Ss).toBe(0);
    expect(state.fGu).toBe(0);
  }

  // 6. Water solvent gate
  if (state.mass.W === 0) {
    expect(state.mass.Gd).toBe(0);
    expect(state.mass.Od).toBe(0);
  }

  // 7. Dissolution capacity
  const capacity = 2.0 * state.mass.W;
  expect(state.mass.Gd).toBeLessThanOrEqual(capacity + 1e-8);

  // 8. Regions volume match reservation
  const regions = computeBeakerRegions(stateToPhaseMasses(state));
  const expectedVolMl = computeExpectedReservation(state.input) / 1000;
  expect(regions.totalReserveMl).toBeCloseTo(expectedVolMl, 6);
}

describe('V3-07 — Combinations and Permutations Matrix', () => {
  // =========================================================================
  // SECTION 1: 16 SUBSETS MATRIX (SC-M01)
  // =========================================================================
  describe('1. 16 Subsets Matrix (including Empty)', () => {
    const allSubsets = generateAllSubsets();

    it('generates exactly 16 unique subsets', () => {
      expect(allSubsets.length).toBe(16);
      const uniqueKeys = new Set(allSubsets.map((s) => s.slice().sort().join('+')));
      expect(uniqueKeys.size).toBe(16);
      expect(allSubsets[0]).toEqual([]); // Empty set
      expect(allSubsets[15].slice().sort()).toEqual(ALL_INGREDIENTS.slice().sort()); // All four
    });

    it('executes all 16 subsets across 60 simulated ticks without invariant violation (SC-M01)', () => {
      let scenarioCount = 0;

      for (let i = 0; i < allSubsets.length; i++) {
        const subset = allSubsets[i];
        scenarioCount++;
        const caseId = `SC-M01-subset-${i}-${subset.join('_') || 'empty'}`;

        // Fresh engine per scenario
        const engine = new HeadlessSimulationEngine({ clientId: `client-${caseId}` });

        // Add ingredients in subset when paused
        let seq = 1;
        for (const ing of subset) {
          const ack = engine.dispatch({
            clientId: `client-${caseId}`,
            seq: seq++,
            expectedGeneration: 0,
            payload: { type: 'add', ingredient: ing, deciTicks: STANDARD_DOSES[ing] },
          });
          expect(ack.accepted, `${caseId}: add ${ing} accepted`).toBe(true);
        }

        // Check paused initial state
        const stateAt0 = engine.getState();
        expect(stateAt0.tickIndex).toBe(0);
        expect(stateAt0.elapsedSeconds).toBe(0);
        assertComprehensiveStateInvariants(stateAt0, `${caseId}-at-t0`);

        // Set mode to auto fast and unpause
        engine.dispatch({
          clientId: `client-${caseId}`,
          seq: seq++,
          expectedGeneration: 0,
          payload: { type: 'setMode', mode: 'auto' },
        });
        engine.dispatch({
          clientId: `client-${caseId}`,
          seq: seq++,
          expectedGeneration: 0,
          payload: { type: 'setAutoLevel', level: 'fast' },
        });
        engine.dispatch({
          clientId: `client-${caseId}`,
          seq: seq++,
          expectedGeneration: 0,
          payload: { type: 'resume' },
        });

        // Run 60 ticks (1.0 second)
        for (let tick = 1; tick <= 60; tick++) {
          engine.advance(1 / 60);
          if (tick % 20 === 0) {
            assertComprehensiveStateInvariants(engine.getState(), `${caseId}-tick-${tick}`);
          }
        }

        const stateAt60 = engine.getState();
        expect(stateAt60.tickIndex).toBe(60);
        expect(stateAt60.elapsedSeconds).toBeCloseTo(1.0, 6);
        assertComprehensiveStateInvariants(stateAt60, `${caseId}-final`);

        // Pool-specific checks based on presence of substances
        const hasWater = subset.includes(ING_WATER);
        const hasSugar = subset.includes(ING_SUGAR);
        const hasSand = subset.includes(ING_SAND);
        const hasOil = subset.includes(ING_OIL);

        if (!hasWater) {
          expect(stateAt60.mass.Gd).toBe(0);
          expect(stateAt60.mass.Od).toBe(0);
        }
        if (hasWater && hasSugar) {
          expect(stateAt60.mass.Gd).toBeGreaterThan(0);
        }
        if (hasSand) {
          // Sand is either in bed or suspended, but never dissolved
          expect(stateAt60.mass.Sb + stateAt60.mass.Ss).toBeCloseTo(10, 8);
          if (hasWater || hasOil) {
            expect(stateAt60.mass.Ss).toBeGreaterThan(0); // stirred lift
          } else {
            expect(stateAt60.mass.Ss).toBe(0); // dry sand cannot suspend
          }
        }
        if (hasWater && hasOil) {
          expect(stateAt60.mass.Od).toBeGreaterThan(0); // droplets formed
          expect(stateAt60.mass.Ol).toBeLessThan(18);
        }
        if (!hasWater && hasOil) {
          expect(stateAt60.mass.Od).toBe(0); // oil cannot disperse in air
          expect(stateAt60.mass.Ol).toBeCloseTo(18, 8);
        }

        // Verify representative particle transport buffers
        const target: RenderTarget & { radii: Float32Array } = {
          positions: new Float32Array(MAX_BUFFER_CAPACITY * 3),
          weights: new Float32Array(MAX_BUFFER_CAPACITY),
          materials: new Uint8Array(MAX_BUFFER_CAPACITY),
          radii: new Float32Array(MAX_BUFFER_CAPACITY),
          count: MAX_BUFFER_CAPACITY,
        };
        const stamp = engine.copyRenderFrame(target);
        expect(stamp.count).toBeGreaterThanOrEqual(0);
        for (let p = 0; p < stamp.count; p++) {
          expect(Number.isFinite(target.positions[p * 3])).toBe(true);
          expect(Number.isFinite(target.positions[p * 3 + 1])).toBe(true);
          expect(Number.isFinite(target.positions[p * 3 + 2])).toBe(true);
        }
      }

      expect(scenarioCount).toBe(16);
    });
  });

  // =========================================================================
  // SECTION 2: 24 PERMUTATIONS MATRIX (SC-M02)
  // =========================================================================
  describe('2. 24 Permutations Matrix (SC-M02)', () => {
    const allPermutations = generateAllPermutations(ALL_INGREDIENTS);

    it('generates exactly 24 unique permutations', () => {
      expect(allPermutations.length).toBe(24);
      const uniqueKeys = new Set(allPermutations.map((p) => p.join('>')));
      expect(uniqueKeys.size).toBe(24);
    });

    it('all 24 additions while paused result in identical initial states and identical evolution (SC-M02 Part A)', () => {
      let baselineFinalState: ScienceState | null = null;

      for (let i = 0; i < allPermutations.length; i++) {
        const order = allPermutations[i];
        const caseId = `SC-M02-paused-${i}-${order.join('_')}`;

        const engine = new HeadlessSimulationEngine({ clientId: `client-${caseId}` });

        let seq = 1;
        for (const ing of order) {
          const ack = engine.dispatch({
            clientId: `client-${caseId}`,
            seq: seq++,
            expectedGeneration: 0,
            payload: { type: 'add', ingredient: ing, deciTicks: STANDARD_DOSES[ing] },
          });
          expect(ack.accepted, `${caseId}: add ${ing} accepted`).toBe(true);
          expect(engine.getState().tickIndex, `${caseId}: tick remains 0`).toBe(0);
          expect(engine.getState().elapsedSeconds, `${caseId}: time remains 0`).toBe(0);
        }

        const stateAt0 = engine.getState();
        assertComprehensiveStateInvariants(stateAt0, `${caseId}-t0`);

        // Check exact paused baseline values
        expect(stateAt0.mass.W).toBe(100);
        expect(stateAt0.mass.Gt).toBe(10);
        expect(stateAt0.mass.Gu).toBe(10);
        expect(stateAt0.mass.Gd).toBe(0);
        expect(stateAt0.mass.St).toBe(10);
        expect(stateAt0.mass.Sb).toBe(10);
        expect(stateAt0.mass.Ss).toBe(0);
        expect(stateAt0.mass.Ot).toBeCloseTo(18, 8);
        expect(stateAt0.mass.Ol).toBeCloseTo(18, 8);
        expect(stateAt0.mass.Od).toBe(0);
        expect(stateAt0.fGu).toBe(0);

        // Advance 60 ticks under auto fast
        engine.dispatch({
          clientId: `client-${caseId}`,
          seq: seq++,
          expectedGeneration: 0,
          payload: { type: 'setMode', mode: 'auto' },
        });
        engine.dispatch({
          clientId: `client-${caseId}`,
          seq: seq++,
          expectedGeneration: 0,
          payload: { type: 'setAutoLevel', level: 'fast' },
        });
        engine.dispatch({
          clientId: `client-${caseId}`,
          seq: seq++,
          expectedGeneration: 0,
          payload: { type: 'resume' },
        });

        for (let tick = 0; tick < 60; tick++) {
          engine.advance(1 / 60);
        }

        const stateAt60 = engine.getState();
        assertComprehensiveStateInvariants(stateAt60, `${caseId}-t60`);

        if (!baselineFinalState) {
          baselineFinalState = stateAt60;
        } else {
          // All 24 permutations added while paused MUST reach the exact same state at t=60
          expect(stateAt60.mass.W).toBeCloseTo(baselineFinalState.mass.W, 8);
          expect(stateAt60.mass.Gd).toBeCloseTo(baselineFinalState.mass.Gd, 8);
          expect(stateAt60.mass.Gu).toBeCloseTo(baselineFinalState.mass.Gu, 8);
          expect(stateAt60.mass.Ss).toBeCloseTo(baselineFinalState.mass.Ss, 8);
          expect(stateAt60.mass.Sb).toBeCloseTo(baselineFinalState.mass.Sb, 8);
          expect(stateAt60.mass.Od).toBeCloseTo(baselineFinalState.mass.Od, 8);
          expect(stateAt60.mass.Ol).toBeCloseTo(baselineFinalState.mass.Ol, 8);
          expect(stateAt60.fGu).toBeCloseTo(baselineFinalState.fGu, 8);
          expect(stateAt60.omegaFlow).toBeCloseTo(baselineFinalState.omegaFlow, 8);
        }
      }
    });

    it('interleaved scientific additions across 24 orders maintain invariants while yielding history-dependent transients (SC-M02 Part B)', () => {
      const finalStates: Record<string, ScienceMassCompartments> = {};

      for (let i = 0; i < allPermutations.length; i++) {
        const order = allPermutations[i];
        const key = order.join('>');
        const caseId = `SC-M02-interleaved-${i}-${order.join('_')}`;

        const engine = new HeadlessSimulationEngine({ clientId: `client-${caseId}` });

        // Add 1st ingredient at tick 0
        engine.dispatch({
          clientId: `client-${caseId}`,
          seq: 1,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: order[0], deciTicks: STANDARD_DOSES[order[0]] },
        });

        // Start auto fast
        engine.dispatch({
          clientId: `client-${caseId}`,
          seq: 2,
          expectedGeneration: 0,
          payload: { type: 'setMode', mode: 'auto' },
        });
        engine.dispatch({
          clientId: `client-${caseId}`,
          seq: 3,
          expectedGeneration: 0,
          payload: { type: 'setAutoLevel', level: 'fast' },
        });
        engine.dispatch({
          clientId: `client-${caseId}`,
          seq: 4,
          expectedGeneration: 0,
          payload: { type: 'resume' },
        });

        // Step 30 ticks
        for (let t = 0; t < 30; t++) engine.advance(1 / 60);
        assertComprehensiveStateInvariants(engine.getState(), `${caseId}-step30`);

        // Add 2nd ingredient at tick 30
        engine.dispatch({
          clientId: `client-${caseId}`,
          seq: 5,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: order[1], deciTicks: STANDARD_DOSES[order[1]] },
        });
        for (let t = 0; t < 30; t++) engine.advance(1 / 60);
        assertComprehensiveStateInvariants(engine.getState(), `${caseId}-step60`);

        // Add 3rd ingredient at tick 60
        engine.dispatch({
          clientId: `client-${caseId}`,
          seq: 6,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: order[2], deciTicks: STANDARD_DOSES[order[2]] },
        });
        for (let t = 0; t < 30; t++) engine.advance(1 / 60);
        assertComprehensiveStateInvariants(engine.getState(), `${caseId}-step90`);

        // Add 4th ingredient at tick 90
        engine.dispatch({
          clientId: `client-${caseId}`,
          seq: 7,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: order[3], deciTicks: STANDARD_DOSES[order[3]] },
        });
        for (let t = 0; t < 30; t++) engine.advance(1 / 60);

        const finalState = engine.getState();
        expect(finalState.tickIndex).toBe(120);
        assertComprehensiveStateInvariants(finalState, `${caseId}-final`);

        // Totals must match standard doses
        expect(finalState.mass.W).toBe(100);
        expect(finalState.mass.Gt).toBe(10);
        expect(finalState.mass.St).toBe(10);
        expect(finalState.mass.Ot).toBeCloseTo(18, 8);

        finalStates[key] = { ...finalState.mass };
      }

      // History dependency assertion:
      // Orders where water was added first and sugar second (e.g. water>sugar>sand>oil)
      // allow sugar to dissolve from tick 30 to tick 120 (90 ticks of dissolution).
      // Orders where water was added last (e.g. sugar>sand>oil>water)
      // only allow sugar to dissolve from tick 90 to tick 120 (30 ticks of dissolution).
      // Therefore, Gd(water>sugar>sand>oil) MUST be strictly greater than Gd(sugar>sand>oil>water).
      const gdWaterFirst = finalStates['water>sugar>sand>oil'].Gd;
      const gdWaterLast = finalStates['sugar>sand>oil>water'].Gd;
      expect(gdWaterFirst).toBeGreaterThan(gdWaterLast);
    });
  });

  // =========================================================================
  // SECTION 3: CAPACITY UNDER / AT / OVER & REJECTION MATRIX (SC-IN03, SC-M05)
  // =========================================================================
  describe('3. Capacity Under / At / Over & Rejection Matrix', () => {
    it('Water 500ml boundary: 5 x 100ml accepted (500ml), next 0.1ml rejected atomically (SC-IN03)', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-cap-water' });

      // Add 5 x 100ml
      for (let i = 1; i <= 5; i++) {
        const ack = engine.dispatch({
          clientId: 'client-cap-water',
          seq: i,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
        });
        expect(ack.accepted).toBe(true);
      }

      const s500 = engine.getState();
      expect(computeExpectedReservation(s500.input)).toBe(500000);
      expect(s500.mass.W).toBe(500);

      // Attempt 6: Add 0.1 ml water (1 deciTick) -> Exceeds 500ml
      const ackReject = engine.dispatch({
        clientId: 'client-cap-water',
        seq: 6,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1 },
      });
      expect(ackReject.accepted).toBe(false);
      expect(ackReject.reason).toBe('CAPACITY_EXCEEDED');

      // State is preserved completely
      const sAfter = engine.getState();
      expect(computeExpectedReservation(sAfter.input)).toBe(500000);
      expect(sAfter.mass.W).toBe(500);
      expect(sAfter.stateVersion).toBe(s500.stateVersion);
    });

    it('Water 499.9ml + 0.1ml reaches exact capacity, next 0.1ml rejected', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-cap-precise' });

      // 4 x 100ml
      for (let i = 1; i <= 4; i++) {
        engine.dispatch({
          clientId: 'client-cap-precise',
          seq: i,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
        });
      }

      // 1 x 99.9ml (999 deciTicks)
      const ack999 = engine.dispatch({
        clientId: 'client-cap-precise',
        seq: 5,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 999 },
      });
      expect(ack999.accepted).toBe(true);
      expect(computeExpectedReservation(engine.getState().input)).toBe(499900);

      // Add 0.1ml (1 deciTick) -> exact 500,000 milli-ml
      const ack1 = engine.dispatch({
        clientId: 'client-cap-precise',
        seq: 6,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1 },
      });
      expect(ack1.accepted).toBe(true);
      expect(computeExpectedReservation(engine.getState().input)).toBe(500000);

      // Next add 0.1ml -> rejected
      const ackFail = engine.dispatch({
        clientId: 'client-cap-precise',
        seq: 7,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1 },
      });
      expect(ackFail.accepted).toBe(false);
      expect(ackFail.reason).toBe('CAPACITY_EXCEEDED');
      expect(computeExpectedReservation(engine.getState().input)).toBe(500000);
    });

    it('Mixed Fixture X (495ml) + 5ml water reaches exact 500ml, next 0.1ml oil rejected (SC-M05)', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-sc-m05' });

      // Build Fixture X:
      // Water: 300 ml = 3000 deciTicks (3 x 1000)
      for (let i = 1; i <= 3; i++) {
        engine.dispatch({
          clientId: 'client-sc-m05',
          seq: i,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
        });
      }
      // Oil: 70 ml = 700 deciTicks
      engine.dispatch({
        clientId: 'client-sc-m05',
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 700 },
      });
      // Sugar: 100 g = 1000 deciTicks
      engine.dispatch({
        clientId: 'client-sc-m05',
        seq: 5,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 1000 },
      });
      // Sand: 100 g = 1000 deciTicks
      engine.dispatch({
        clientId: 'client-sc-m05',
        seq: 6,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sand', deciTicks: 1000 },
      });

      // Total reservation: 300 + 70 + 65 + 60 = 495 ml = 495,000 milli-ml
      expect(computeExpectedReservation(engine.getState().input)).toBe(495000);

      // Add 5 ml water (50 deciTicks) -> 5,000 milli-ml -> exactly 500,000
      const ackWater5 = engine.dispatch({
        clientId: 'client-sc-m05',
        seq: 7,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 50 },
      });
      expect(ackWater5.accepted).toBe(true);
      expect(computeExpectedReservation(engine.getState().input)).toBe(500000);

      // In the same control flush or next command, attempt to add 0.1 ml oil (1 deciTick = 100 milli-ml)
      const ackOilOverflow = engine.dispatch({
        clientId: 'client-sc-m05',
        seq: 8,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 1 },
      });
      expect(ackOilOverflow.accepted).toBe(false);
      expect(ackOilOverflow.reason).toBe('CAPACITY_EXCEEDED');
      expect(computeExpectedReservation(engine.getState().input)).toBe(500000);
    });

    it('Dissolution does NOT free capacity: reservation is strictly based on input ticks', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-dissolution-cap' });

      // Add 10ml water + 30g sugar
      engine.dispatch({
        clientId: 'client-dissolution-cap',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 100 },
      });
      engine.dispatch({
        clientId: 'client-dissolution-cap',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 300 },
      });

      // Reservation: 10 ml + 30 * 0.65 = 10 + 19.5 = 29.5 ml = 29,500 milli-ml
      expect(computeExpectedReservation(engine.getState().input)).toBe(29500);

      // Unpause and run 600 ticks to dissolve sugar
      engine.dispatch({
        clientId: 'client-dissolution-cap',
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      engine.dispatch({
        clientId: 'client-dissolution-cap',
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'setAutoLevel', level: 'fast' },
      });
      engine.dispatch({
        clientId: 'client-dissolution-cap',
        seq: 5,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      for (let t = 0; t < 600; t++) engine.advance(1 / 60);

      const stateAfter = engine.getState();
      expect(stateAfter.mass.Gd).toBeGreaterThan(5); // dissolution definitely occurred
      expect(stateAfter.mass.Gu).toBeGreaterThan(5); // excess undissolved sugar remains

      // Reservation is still exactly 29,500 milli-ml!
      expect(computeExpectedReservation(stateAfter.input)).toBe(29500);

      // An addition of 471 ml water (4,710 deciTicks = 471,000 milli-ml) would make:
      // 29,500 + 471,000 = 500,500 > 500,000 -> MUST BE REJECTED
      const ackOverflow = engine.dispatch({
        clientId: 'client-dissolution-cap',
        seq: 6,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 4710 },
      });
      expect(ackOverflow.accepted).toBe(false);
      expect(ackOverflow.reason).toBe('CAPACITY_EXCEEDED');
    });

    it('Per-add maximum validation: amounts exceeding ingredient maxAddition rejected with EXCEEDS_MAX_ADDITION (SC-IN04)', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-per-add-max' });

      // Sugar maxAddition is 100g. 100.1g (1001 deciTicks) exceeds max.
      const ackSugar = engine.dispatch({
        clientId: 'client-per-add-max',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 1001 },
      });
      expect(ackSugar.accepted).toBe(false);
      expect(ackSugar.reason).toBe('EXCEEDS_MAX_ADDITION');

      // Water maxAddition is 500ml. 500.1ml (5001 deciTicks) exceeds max.
      const ackWater = engine.dispatch({
        clientId: 'client-per-add-max',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 5001 },
      });
      expect(ackWater.accepted).toBe(false);
      expect(ackWater.reason).toBe('EXCEEDS_MAX_ADDITION');

      expect(engine.getState().mass.Gt).toBe(0);
      expect(engine.getState().mass.W).toBe(0);
    });
  });

  // =========================================================================
  // SECTION 4: PHASE TRANSITION TIMELINES (SC-R01, SC-R02, SC-M04)
  // =========================================================================
  describe('4. Phase Transition Timelines', () => {
    it('Dry sugar/sand -> Oil -> Water (dry -> oil-only -> mixed) preserves masses and carrier bounds (SC-R02, SC-S04)', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-trans-oil-water' });

      // Tick 0: Add dry sugar 10g + sand 10g
      engine.dispatch({
        clientId: 'client-trans-oil-water',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 100 },
      });
      engine.dispatch({
        clientId: 'client-trans-oil-water',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
      });

      // Run dry under auto fast for 60 ticks: flow is 0, no lift, no dissolution
      engine.dispatch({
        clientId: 'client-trans-oil-water',
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      engine.dispatch({
        clientId: 'client-trans-oil-water',
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'setAutoLevel', level: 'fast' },
      });
      engine.dispatch({
        clientId: 'client-trans-oil-water',
        seq: 5,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      for (let t = 0; t < 60; t++) engine.advance(1 / 60);

      const sDry = engine.getState();
      expect(sDry.omegaFlow).toBe(0);
      expect(sDry.mass.Gd).toBe(0);
      expect(sDry.mass.Ss).toBe(0);
      expect(sDry.fGu).toBe(0);

      // Tick 60: Add Oil 20ml (oil-only)
      engine.dispatch({
        clientId: 'client-trans-oil-water',
        seq: 6,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 200 },
      });

      // Step 60 ticks in oil-only: flow develops, sand lifts in oil, sugar does NOT dissolve, no oil droplets
      for (let t = 0; t < 60; t++) engine.advance(1 / 60);

      const sOilOnly = engine.getState();
      expect(sOilOnly.omegaFlow).toBeGreaterThan(0);
      expect(sOilOnly.mass.Gd).toBe(0); // sugar never dissolves in oil
      expect(sOilOnly.mass.Od).toBe(0); // no oil droplets in oil-only
      expect(sOilOnly.mass.Ss).toBeGreaterThan(0); // sand suspends in oil carrier!

      const rOilOnly = computeBeakerRegions(stateToPhaseMasses(sOilOnly));
      expect(rOilOnly.category).toBe('oil-only');

      // Tick 120: Add Water 100ml (mixed)
      engine.dispatch({
        clientId: 'client-trans-oil-water',
        seq: 7,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });

      // Step 60 ticks in mixed: sugar dissolves, oil droplets form
      for (let t = 0; t < 60; t++) engine.advance(1 / 60);

      const sMixed = engine.getState();
      const rMixed = computeBeakerRegions(stateToPhaseMasses(sMixed));
      expect(rMixed.category).toBe('mixed');
      expect(sMixed.mass.Gd).toBeGreaterThan(0); // sugar dissolving in water
      expect(sMixed.mass.Od).toBeGreaterThan(0); // oil droplets dispersing in water
      assertComprehensiveStateInvariants(sMixed, 'dry-oil-water-mixed');
    });

    it('Oil-only with suspended sand stays strictly inside oil bounds (SC-R01)', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-oil-only-bounds' });

      // Oil 100ml (1000 deciTicks = 90g) + Sand 10g (100 deciTicks)
      engine.dispatch({
        clientId: 'client-oil-only-bounds',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 1000 },
      });
      engine.dispatch({
        clientId: 'client-oil-only-bounds',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
      });
      engine.dispatch({
        clientId: 'client-oil-only-bounds',
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      engine.dispatch({
        clientId: 'client-oil-only-bounds',
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'setAutoLevel', level: 'fast' },
      });
      engine.dispatch({
        clientId: 'client-oil-only-bounds',
        seq: 5,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      for (let t = 0; t < 120; t++) engine.advance(1 / 60);

      const state = engine.getState();
      const regions = computeBeakerRegions(stateToPhaseMasses(state));
      expect(regions.category).toBe('oil-only');
      expect(state.mass.Ss).toBeGreaterThan(0);

      // Verify particles in transport system
      const target: RenderTarget & { radii: Float32Array } = {
        positions: new Float32Array(MAX_BUFFER_CAPACITY * 3),
        weights: new Float32Array(MAX_BUFFER_CAPACITY),
        materials: new Uint8Array(MAX_BUFFER_CAPACITY),
        radii: new Float32Array(MAX_BUFFER_CAPACITY),
        count: MAX_BUFFER_CAPACITY,
      };
      const stamp = engine.copyRenderFrame(target);
      expect(stamp.count).toBeGreaterThan(0);
      expect(stamp.poolRanges).toBeDefined();

      // 1. Bed sand particles stay in bed bounds
      const sandBedRange = stamp.poolRanges!.sandBed;
      for (let i = 0; i < sandBedRange.count; i++) {
        const y = target.positions[(sandBedRange.offset + i) * 3 + 1];
        expect(y).toBeGreaterThanOrEqual(regions.bed.bottom - 1e-4);
        expect(y).toBeLessThanOrEqual(regions.bed.top + 1e-4);
      }

      // 2. Suspended sand particles in oil-only stay in oil bounds
      const sandSuspRange = stamp.poolRanges!.sandSusp;
      expect(sandSuspRange.count).toBeGreaterThan(0);
      for (let i = 0; i < sandSuspRange.count; i++) {
        const y = target.positions[(sandSuspRange.offset + i) * 3 + 1];
        expect(y).toBeGreaterThanOrEqual(regions.oil.bottom - 1e-4);
        expect(y).toBeLessThanOrEqual(regions.oil.top + 1e-4);
      }
    });

    it('Saturated sugar + sand + oil runs 600 ticks without invariant drift (SC-M04)', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-sc-m04' });

      // Water 10ml, Sugar 30g (capacity 20g), Sand 10g, Oil 20ml
      engine.dispatch({
        clientId: 'client-sc-m04',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 100 },
      });
      engine.dispatch({
        clientId: 'client-sc-m04',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 300 },
      });
      engine.dispatch({
        clientId: 'client-sc-m04',
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
      });
      engine.dispatch({
        clientId: 'client-sc-m04',
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 200 },
      });
      engine.dispatch({
        clientId: 'client-sc-m04',
        seq: 5,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      engine.dispatch({
        clientId: 'client-sc-m04',
        seq: 6,
        expectedGeneration: 0,
        payload: { type: 'setAutoLevel', level: 'slow' },
      });
      engine.dispatch({
        clientId: 'client-sc-m04',
        seq: 7,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      for (let t = 1; t <= 600; t++) {
        engine.advance(1 / 60);
        if (t % 100 === 0) {
          assertComprehensiveStateInvariants(engine.getState(), `SC-M04-tick-${t}`);
        }
      }

      const sFinal = engine.getState();
      expect(sFinal.mass.Gd).toBeLessThanOrEqual(20.0 + 1e-8); // strictly bounded by capacity
      expect(sFinal.mass.Gu).toBeGreaterThanOrEqual(10.0 - 1e-8); // excess sugar remains
      expect(sFinal.mass.Ss).toBeGreaterThan(0);
      expect(sFinal.mass.Od).toBeGreaterThan(0);
    });

    it('Stop drive while clock continues decays flow continuously and settles/separates phases', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-stop-decay' });

      // Water 100ml, Sugar 10g, Sand 10g, Oil 20ml
      engine.dispatch({
        clientId: 'client-stop-decay',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });
      engine.dispatch({
        clientId: 'client-stop-decay',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
      });
      engine.dispatch({
        clientId: 'client-stop-decay',
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 200 },
      });
      engine.dispatch({
        clientId: 'client-stop-decay',
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      engine.dispatch({
        clientId: 'client-stop-decay',
        seq: 5,
        expectedGeneration: 0,
        payload: { type: 'setAutoLevel', level: 'fast' },
      });
      engine.dispatch({
        clientId: 'client-stop-decay',
        seq: 6,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      // Run 120 ticks under fast auto
      for (let t = 0; t < 120; t++) engine.advance(1 / 60);

      const sActive = engine.getState();
      expect(sActive.omegaFlow).toBeGreaterThan(1.0);
      const omegaActive = sActive.omegaFlow;
      const ssActive = sActive.mass.Ss;
      const odActive = sActive.mass.Od;

      // Stop auto: release drive while simulation clock continues running!
      engine.dispatch({
        clientId: 'client-stop-decay',
        seq: 7,
        expectedGeneration: 0,
        payload: { type: 'releaseDrive' },
      });

      expect(engine.getState().paused).toBe(false);
      expect(engine.getState().autoDriveEnabled).toBe(false);

      // Run 240 ticks: flow decays, sand settles, oil separates
      for (let t = 0; t < 240; t++) engine.advance(1 / 60);

      const sDecayed = engine.getState();
      expect(sDecayed.omegaFlow).toBeLessThan(omegaActive);
      expect(sDecayed.mass.Ss).toBeLessThan(ssActive); // sand settling
      expect(sDecayed.mass.Od).toBeLessThan(odActive); // oil separating
      assertComprehensiveStateInvariants(sDecayed, 'post-stop-decay');
    });

    it('Rapid synchronous additions return monotonic state versions and ordered acks (SC-C02)', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-sync-adds' });

      const acks = [
        engine.dispatch({
          clientId: 'client-sync-adds',
          seq: 1,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: 'water', deciTicks: 100 },
        }),
        engine.dispatch({
          clientId: 'client-sync-adds',
          seq: 2,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: 'sugar', deciTicks: 100 },
        }),
        engine.dispatch({
          clientId: 'client-sync-adds',
          seq: 3,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
        }),
        engine.dispatch({
          clientId: 'client-sync-adds',
          seq: 4,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: 'oil', deciTicks: 100 },
        }),
      ];

      expect(acks.every((a) => a.accepted)).toBe(true);
      expect(acks[0].stateVersion).toBe(1);
      expect(acks[1].stateVersion).toBe(2);
      expect(acks[2].stateVersion).toBe(3);
      expect(acks[3].stateVersion).toBe(4);
      expect(engine.getState().stateVersion).toBe(4);
      expect(engine.getState().tickIndex).toBe(0); // all executed at tick 0!
    });
  });

  // =========================================================================
  // SECTION 5: V3-06 VERIFICATION REGRESSIONS (SC-A01 Canonical, Buffer & Store)
  // =========================================================================
  describe('5. V3-06 Verification Regressions', () => {
    it('Canonical SC-A01 baseline (Gu=5, Gd=5, fGu=0.4) and sequential additions (SC-A01)', () => {
      // Canonical SC-A01 fixture defined in SCIENTIFIC_SPEC §11.1:
      // Paused baseline: W=100, G10 (Gu=5, Gd=5, fGu=0.4), S10 (Sb=7, Ss=3), O20 (Ot=18, Ol=9, Od=9)
      const baselineState: ScienceState = {
        generation: 0,
        stateVersion: 0,
        tickIndex: 0,
        elapsedSeconds: 0,
        seed: DEFAULT_SEED,
        paused: true,
        mode: 'observe',
        autoDriveEnabled: false,
        autoLevel: 'slow',
        input: {
          water: 1000, // 100 ml
          sugar: 100,  // 10 g
          sand: 100,   // 10 g
          oil: 200,    // 20 ml
        },
        mass: {
          W: 100,
          Gt: 10,
          Gu: 5,
          Gd: 5,
          St: 10,
          Sb: 7,
          Ss: 3,
          Ot: 18,
          Ol: 9,
          Od: 9,
        },
        fGu: 0.4,
        omegaRod: 0,
        omegaDrive: 0,
        omegaFlow: 0,
        rod: {
          x: 0.4,
          z: 0,
          tipY: 0.14,
          theta: 0,
          radius: 0.4,
        },
      };

      const engine = HeadlessSimulationEngine.createForTesting(baselineState, { clientId: 'client-sc-a01' });

      // Step 1: Add 1g Sugar (10 deciTicks)
      const ack1 = engine.dispatch({
        clientId: 'client-sc-a01',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 10 },
      });
      expect(ack1.accepted).toBe(true);

      const s1 = engine.getState();
      expect(s1.mass.Gt).toBe(11);
      expect(s1.mass.Gu).toBe(6);
      expect(s1.mass.Gd).toBe(5); // Gd preserved
      // fGu dilution: 0.4 * (5 / 6) = 2 / 6 = 1/3
      expect(s1.fGu).toBeCloseTo(1 / 3, 10);
      expect(s1.tickIndex).toBe(0);

      // Step 2: Add 1g Sand (10 deciTicks)
      const ack2 = engine.dispatch({
        clientId: 'client-sc-a01',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sand', deciTicks: 10 },
      });
      expect(ack2.accepted).toBe(true);

      const s2 = engine.getState();
      expect(s2.mass.St).toBe(11);
      expect(s2.mass.Sb).toBe(8);
      expect(s2.mass.Ss).toBe(3); // Ss preserved

      // Step 3: Add 1ml Oil (10 deciTicks = 0.9g oil)
      const ack3 = engine.dispatch({
        clientId: 'client-sc-a01',
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 10 },
      });
      expect(ack3.accepted).toBe(true);

      const s3 = engine.getState();
      expect(s3.mass.Ot).toBeCloseTo(18.9, 8);
      expect(s3.mass.Ol).toBeCloseTo(9.9, 8);
      expect(s3.mass.Od).toBe(9); // Od preserved

      // Step 4: Add 1ml Water (10 deciTicks = 1.0g water)
      const ack4 = engine.dispatch({
        clientId: 'client-sc-a01',
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 10 },
      });
      expect(ack4.accepted).toBe(true);

      const s4 = engine.getState();
      expect(s4.mass.W).toBe(101);
      expect(s4.paused).toBe(true);
      expect(s4.tickIndex).toBe(0);
      expect(s4.elapsedSeconds).toBe(0);
    });

    it('hasStarted accurately tracks simulation start across start, resume, startAuto, and resets', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      // Initially paused at t=0
      expect(store.getState().hasStarted).toBe(false);
      expect(store.getState().snapshot.paused).toBe(true);

      // Add substance while paused: hasStarted must remain false
      store.getState().add('water', '100');
      expect(store.getState().hasStarted).toBe(false);

      // Calling startAuto from paused: must transition hasStarted to true
      store.getState().startAuto('fast');
      expect(store.getState().hasStarted).toBe(true);
      expect(store.getState().snapshot.paused).toBe(false);

      // Pause: hasStarted remains true (it has started in this generation)
      store.getState().pause();
      expect(store.getState().hasStarted).toBe(true);
      expect(store.getState().snapshot.paused).toBe(true);

      // Resume: hasStarted remains true
      store.getState().resume();
      expect(store.getState().hasStarted).toBe(true);
      expect(store.getState().snapshot.paused).toBe(false);

      // Reset: hasStarted must reset to false!
      store.getState().reset();
      expect(store.getState().hasStarted).toBe(false);
      expect(store.getState().snapshot.paused).toBe(true);

      bridge.destroy();
    });

    it('Renderer target buffers maintain memory reference across multiple frames when budget is constant', () => {
      const bridge = new SimulationBridge();

      // Allocate target buffer using explicit array lengths (as done in ParticleRenderer)
      const target: RenderTarget & { radii: Float32Array; poolIds: Uint8Array } = {
        positions: new Float32Array(MAX_BUFFER_CAPACITY * 3),
        weights: new Float32Array(MAX_BUFFER_CAPACITY),
        materials: new Uint8Array(MAX_BUFFER_CAPACITY),
        radii: new Float32Array(MAX_BUFFER_CAPACITY),
        poolIds: new Uint8Array(MAX_BUFFER_CAPACITY),
        count: MAX_BUFFER_CAPACITY,
      };

      const originalPositionsRef = target.positions;
      const originalRadiiRef = target.radii;

      // Add water and sugar
      bridge.add('water', '100');
      bridge.add('sugar', '10');
      bridge.start();

      // Step 20 frames
      for (let f = 1; f <= 20; f++) {
        bridge.stepFrame(f * 16.6667);

        // Derive capacity from array length
        const budgetPerPool = bridge.getEngine().getParticleBudget();
        const requiredCapacity = budgetPerPool * 5;
        expect(target.radii.length).toBeGreaterThanOrEqual(requiredCapacity);

        // Copy frame
        const stamp = bridge.copyRenderFrame(target);
        expect(stamp.count).toBeGreaterThan(0);

        // Verify buffer reference is strictly preserved (zero reallocation / zero GC pressure)
        expect(target.positions).toBe(originalPositionsRef);
        expect(target.radii).toBe(originalRadiiRef);
      }

      bridge.destroy();
    });
  });
});
