import { describe, expect, it } from 'vitest';
import {
  BEAKER_BASE_Y,
  computeTipY,
} from '../constants/beaker';
import {
  addPausedAndResumeFixture,
  addPhaseAllocationFixture,
  addWaterResetAddWaterFixture,
  capacitySerializationFixture,
  resetReplayAndDistinctResetFixture,
  staleManualSampleFixture,
} from '../core/contractFixtures';
import {
  canonicalFingerprint,
  HeadlessSimulationEngine,
  HeadlessSimulationFacade,
  MAX_ACK_CACHE_SIZE,
  MAX_ADDITION_DECI_TICKS,
} from '../core/HeadlessSimulationEngine';
import type {
  Command,
} from '../core/SimulationEngine';
import {
  DEFAULT_SEED,
  type ScienceState,
} from '../core/SimulationState';

describe('V2-01 — HeadlessSimulationEngine Runtime', () => {
  describe('1. Baseline empty/paused, default seed 1729, and engine isolation', () => {
    it('initializes with baseline paused state and default seed 1729', () => {
      const engine = new HeadlessSimulationEngine();
      const state = engine.getState();

      expect(state.generation).toBe(0);
      expect(state.stateVersion).toBe(0);
      expect(state.tickIndex).toBe(0);
      expect(state.elapsedSeconds).toBe(0);
      expect(state.seed).toBe(DEFAULT_SEED);
      expect(state.paused).toBe(true);
      expect(state.mode).toBe('observe');
      expect(state.autoDriveEnabled).toBe(false);
      expect(state.autoLevel).toBe('slow');

      expect(state.input).toEqual({ water: 0, oil: 0, sugar: 0, sand: 0 });
      expect(state.mass).toEqual({
        W: 0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      });
      expect(state.fGu).toBe(0);
      expect(state.rod.tipY).toBe(computeTipY(BEAKER_BASE_Y));
    });

    it('isolates state completely between two engine instances', () => {
      const engineA = new HeadlessSimulationEngine({ clientId: 'client-A' });
      const engineB = new HeadlessSimulationEngine({ clientId: 'client-B' });

      engineA.dispatch({
        clientId: 'client-A',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });

      expect(engineA.getState().mass.W).toBe(100);
      expect(engineB.getState().mass.W).toBe(0);
      expect(engineA.getNextSequence()).toBe(2);
      expect(engineB.getNextSequence()).toBe(1);
    });
  });

  describe('2. Add100 -> Reset -> Add50 (SC-C03 / Timeline §3.3)', () => {
    it('executes timeline sequence exactly matching contract fixture', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const { steps } = addWaterResetAddWaterFixture;

      // Step 1: add water 100ml (1000 deciTicks)
      const ack1 = engine.dispatch(steps[0].command);
      expect(ack1).toEqual(steps[0].expectedAck);
      expect(engine.getState().mass.W).toBe(100);
      expect(engine.getState().input.water).toBe(1000);
      expect(engine.getState().generation).toBe(0);
      expect(engine.getState().stateVersion).toBe(1);

      // Step 2: reset
      const ack2 = engine.dispatch(steps[1].command);
      expect(ack2).toEqual(steps[1].expectedAck);
      expect(engine.getState().mass.W).toBe(0);
      expect(engine.getState().input.water).toBe(0);
      expect(engine.getState().generation).toBe(1);
      expect(engine.getState().stateVersion).toBe(2);

      // Step 3: add water 50ml (500 deciTicks) at generation 1
      const ack3 = engine.dispatch(steps[2].command);
      expect(ack3).toEqual(steps[2].expectedAck);
      expect(engine.getState().mass.W).toBe(50);
      expect(engine.getState().input.water).toBe(500);
      expect(engine.getState().generation).toBe(1);
      expect(engine.getState().stateVersion).toBe(3);
      // Does not resurrect 100ml from generation 0
      expect(engine.getState().mass.W).not.toBe(150);
    });
  });

  describe('3. Replay reset same ID vs distinct resets (SC-C04)', () => {
    it('returns duplicate=true on replay of same reset and does not reset again', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      // Run SC-C03 first: add 100ml -> reset (seq 2) -> add 50ml (seq 3)
      for (const step of addWaterResetAddWaterFixture.steps) {
        engine.dispatch(step.command);
      }
      expect(engine.getState().mass.W).toBe(50);
      expect(engine.getState().generation).toBe(1);

      // Dispatch seq 4 (stale manual sample from timeline §3.3)
      const ack4 = engine.dispatch(staleManualSampleFixture.command);
      expect(ack4).toEqual(staleManualSampleFixture.expectedAck);

      // Replay seq 2 with identical payload
      const dupAck = engine.dispatch(resetReplayAndDistinctResetFixture.duplicateReplay.command);
      expect(dupAck).toEqual(resetReplayAndDistinctResetFixture.duplicateReplay.expectedAck);
      // State is NOT reset again; remains at g1/v3 with W=50
      expect(engine.getState().mass.W).toBe(50);
      expect(engine.getState().generation).toBe(1);
      expect(engine.getState().stateVersion).toBe(3);

      // Distinct reset seq 5
      const reset5Ack = engine.dispatch(resetReplayAndDistinctResetFixture.distinctResets[0].command);
      expect(reset5Ack).toEqual(resetReplayAndDistinctResetFixture.distinctResets[0].expectedAck);
      expect(engine.getState().generation).toBe(2);
      expect(engine.getState().stateVersion).toBe(4);
      expect(engine.getState().mass.W).toBe(0);

      // Distinct reset seq 6
      const reset6Ack = engine.dispatch(resetReplayAndDistinctResetFixture.distinctResets[1].command);
      expect(reset6Ack).toEqual(resetReplayAndDistinctResetFixture.distinctResets[1].expectedAck);
      expect(engine.getState().generation).toBe(3);
      expect(engine.getState().stateVersion).toBe(5);
    });
  });

  describe('4. Stale generation and stale manual capture (SC-C05 / SC-IN04)', () => {
    it('rejects command with stale expectedGeneration without changing science state', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      // Step 1: add water 100ml (seq 1, g0)
      engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });
      // Step 2: reset (seq 2, g0 -> g1)
      engine.dispatch({
        clientId: 'client-1',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'reset' },
      });
      // Step 3: add water 50ml (seq 3, g1)
      engine.dispatch({
        clientId: 'client-1',
        seq: 3,
        expectedGeneration: 1,
        payload: { type: 'add', ingredient: 'water', deciTicks: 500 },
      });

      // Command with old expectedGeneration: 0 sent at generation 1
      const staleCmd: Command = {
        clientId: 'client-1',
        seq: 4,
        expectedGeneration: 0, // stale!
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 100 },
      };

      const ack = engine.dispatch(staleCmd);
      expect(ack.accepted).toBe(false);
      expect(ack.reason).toBe('STALE_GENERATION');
      expect(ack.controlOrdinal).toBe(4); // consumed
      expect(ack.generation).toBe(1);
      expect(ack.stateVersion).toBe(3); // stateVersion did NOT increase

      // Science state untouched
      expect(engine.getState().mass.Gt).toBe(0);
      expect(engine.getState().mass.W).toBe(50);
    });

    it('rejects manualSample with stale captureGeneration (SC-C05)', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      // Bring to generation 1 with W=50
      for (const step of addWaterResetAddWaterFixture.steps) {
        engine.dispatch(step.command);
      }

      const { command, expectedAck } = staleManualSampleFixture;
      const ack = engine.dispatch(command);

      expect(ack).toEqual(expectedAck);
      expect(engine.getState().generation).toBe(1);
      expect(engine.getState().stateVersion).toBe(3);
      expect(engine.getState().mass.W).toBe(50);
    });
  });

  describe('5. Add paused and resume synchronous (SC-C01 / Timeline §3.3)', () => {
    it('updates masses immediately when paused while keeping elapsedSeconds at 0', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const { steps } = addPausedAndResumeFixture;

      const ack1 = engine.dispatch(steps[0].command);
      expect(ack1).toEqual(steps[0].expectedAck);
      expect(engine.getState().mass.W).toBe(100);
      expect(engine.getState().paused).toBe(true);
      expect(engine.getState().elapsedSeconds).toBe(0);
      expect(engine.getState().tickIndex).toBe(0);

      const ack2 = engine.dispatch(steps[1].command);
      expect(ack2).toEqual(steps[1].expectedAck);
      expect(engine.getState().paused).toBe(false);
      expect(engine.getState().elapsedSeconds).toBe(0);
      expect(engine.getState().tickIndex).toBe(0);
    });
  });

  describe('6. Capacity serialization and rejection (SC-C02)', () => {
    it('accepts up to 500000 milli-ml and rejects overflow based on latest state', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      // Advance to g3 via 3 resets
      engine.dispatch({ clientId: 'client-1', seq: 1, expectedGeneration: 0, payload: { type: 'reset' } });
      engine.dispatch({ clientId: 'client-1', seq: 2, expectedGeneration: 1, payload: { type: 'reset' } });
      engine.dispatch({ clientId: 'client-1', seq: 3, expectedGeneration: 2, payload: { type: 'reset' } });
      expect(engine.getState().generation).toBe(3);

      // Fast-forward sequence to seq 6 to match fixture's seq 7, 8, 9
      engine.dispatch({ clientId: 'client-1', seq: 4, expectedGeneration: 3, payload: { type: 'pause' } });
      engine.dispatch({ clientId: 'client-1', seq: 5, expectedGeneration: 3, payload: { type: 'pause' } });
      engine.dispatch({ clientId: 'client-1', seq: 6, expectedGeneration: 3, payload: { type: 'pause' } });

      const { steps } = capacitySerializationFixture;

      // seq 7: 499.9 ml water -> accepted (499900 milli-ml)
      const ack7 = engine.dispatch(steps[0].command);
      expect(ack7.accepted).toBe(true);
      expect(ack7.generation).toBe(3);

      // seq 8: 0.1 ml water -> accepted (500000 milli-ml)
      const ack8 = engine.dispatch(steps[1].command);
      expect(ack8.accepted).toBe(true);
      expect(ack8.generation).toBe(3);

      // seq 9: 0.1 ml oil -> rejected CAPACITY_EXCEEDED
      const ack9 = engine.dispatch(steps[2].command);
      expect(ack9.accepted).toBe(false);
      expect(ack9.reason).toBe('CAPACITY_EXCEEDED');
      expect(ack9.controlOrdinal).toBe(9); // consumed!

      // Oil was NOT added
      expect(engine.getState().mass.Ot).toBe(0);
      expect(engine.getState().mass.W).toBe(500);
    });
  });

  describe('7. Rejected seq=next consumes seq and allows subsequent seq+1', () => {
    it('consumes seq on rejection and allows the next monotonic sequence command', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      // Seq 1: rejected due to EXCEEDS_MAX_ADDITION (6000 ticks water > 5000)
      const ack1 = engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 6000 },
      });
      expect(ack1.accepted).toBe(false);
      expect(ack1.reason).toBe('EXCEEDS_MAX_ADDITION');
      expect(ack1.controlOrdinal).toBe(1);
      expect(engine.getNextSequence()).toBe(2);

      // Seq 2: valid addition
      const ack2 = engine.dispatch({
        clientId: 'client-1',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 100 },
      });
      expect(ack2.accepted).toBe(true);
      expect(ack2.controlOrdinal).toBe(2);
      expect(engine.getState().mass.W).toBe(10);
      expect(engine.getNextSequence()).toBe(3);
    });
  });

  describe('8. Out-of-order, malformed envelope, wrong clientId do not consume', () => {
    it('rejects OUT_OF_ORDER when seq > next without consuming or caching', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      const ack = engine.dispatch({
        clientId: 'client-1',
        seq: 5, // out of order! next is 1
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 100 },
      });

      expect(ack.accepted).toBe(false);
      expect(ack.reason).toBe('OUT_OF_ORDER');
      expect(ack.controlOrdinal).toBeNull();
      expect(engine.getNextSequence()).toBe(1); // seq 1 is still expected!

      // Seq 1 can now be dispatched normally
      const ack1 = engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 100 },
      });
      expect(ack1.accepted).toBe(true);
    });

    it('rejects MALFORMED_ENVELOPE when clientId does not match', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      const ack = engine.dispatch({
        clientId: 'client-2', // wrong client
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'pause' },
      });

      expect(ack.accepted).toBe(false);
      expect(ack.reason).toBe('MALFORMED_ENVELOPE');
      expect(ack.controlOrdinal).toBeNull();
      expect(engine.getNextSequence()).toBe(1);
    });

    it('rejects MALFORMED_ENVELOPE on invalid seq or payload envelope', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      const ackNegativeSeq = engine.dispatch({
        clientId: 'client-1',
        seq: -1,
        expectedGeneration: 0,
        payload: { type: 'pause' },
      });
      expect(ackNegativeSeq.reason).toBe('MALFORMED_ENVELOPE');

      const ackNonIntegerSeq = engine.dispatch({
        clientId: 'client-1',
        seq: 1.5,
        expectedGeneration: 0,
        payload: { type: 'pause' },
      });
      expect(ackNonIntegerSeq.reason).toBe('MALFORMED_ENVELOPE');

      const ackNullPayload = engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: null as unknown as Command['payload'],
      });
      expect(ackNullPayload.reason).toBe('MALFORMED_ENVELOPE');
    });
  });

  describe('9. Duplicate accepted and duplicate rejected return original cached ack', () => {
    it('returns original ack with duplicate=true for accepted command duplicate', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      const cmd: Command = {
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 50 },
      };

      const ackOriginal = engine.dispatch(cmd);
      expect(ackOriginal.accepted).toBe(true);
      expect(ackOriginal.duplicate).toBe(false);

      const ackDup = engine.dispatch(cmd);
      expect(ackDup.duplicate).toBe(true);
      expect(ackDup.accepted).toBe(true);
      expect(ackDup.controlOrdinal).toBe(1);
      expect(ackDup.stateVersion).toBe(ackOriginal.stateVersion);
      // Mass was not added twice
      expect(engine.getState().mass.Gt).toBe(5);
    });

    it('returns original ack with duplicate=true for rejected command duplicate', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      const cmd: Command = {
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 99999 }, // exceeds max
      };

      const ackOriginal = engine.dispatch(cmd);
      expect(ackOriginal.accepted).toBe(false);
      expect(ackOriginal.reason).toBe('EXCEEDS_MAX_ADDITION');

      const ackDup = engine.dispatch(cmd);
      expect(ackDup.duplicate).toBe(true);
      expect(ackDup.accepted).toBe(false);
      expect(ackDup.reason).toBe('EXCEEDS_MAX_ADDITION');
      expect(ackDup.controlOrdinal).toBe(1);
    });
  });

  describe('10. ID_REUSED and DUPLICATE_EXPIRED', () => {
    it('returns ID_REUSED when seq is re-sent with a different payload', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'pause' },
      });

      // Same seq 1, but payload is resume
      const ackReused = engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      expect(ackReused.accepted).toBe(false);
      expect(ackReused.reason).toBe('ID_REUSED');
      expect(ackReused.controlOrdinal).toBeNull();
    });
  });

  describe('11. LRU Cache bound at 256 entries and DUPLICATE_EXPIRED', () => {
    it('evicts oldest entries beyond 256 and returns DUPLICATE_EXPIRED on replay', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      // Dispatch 260 valid commands
      for (let s = 1; s <= 260; s++) {
        const ack = engine.dispatch({
          clientId: 'client-1',
          seq: s,
          expectedGeneration: 0,
          payload: { type: 'pause' },
        });
        expect(ack.accepted).toBe(true);
      }

      expect(MAX_ACK_CACHE_SIZE).toBe(256);

      // Replay seq 1 (evicted because cache holds max 256 entries: 5 to 260)
      const ack1Evicted = engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'pause' },
      });
      expect(ack1Evicted.accepted).toBe(false);
      expect(ack1Evicted.reason).toBe('DUPLICATE_EXPIRED');

      // Replay seq 260 (still in cache)
      const ack260InCache = engine.dispatch({
        clientId: 'client-1',
        seq: 260,
        expectedGeneration: 0,
        payload: { type: 'pause' },
      });
      expect(ack260InCache.accepted).toBe(true);
      expect(ack260InCache.duplicate).toBe(true);
    });
  });

  describe('12. Add phase allocation on fixture with existing phases (SC-A01 test seam)', () => {
    it('preserves existing dissolved and suspended amounts, applying dilution formula', () => {
      const { baseline, additions } = addPhaseAllocationFixture;

      const initialScienceState: ScienceState = {
        generation: 0,
        stateVersion: 10,
        tickIndex: baseline.tickIndex,
        elapsedSeconds: baseline.elapsedSeconds,
        seed: DEFAULT_SEED,
        paused: true,
        mode: 'observe',
        autoDriveEnabled: false,
        autoLevel: 'slow',
        input: {
          water: baseline.W * 10,
          oil: Math.round((baseline.Ot / 0.9) * 10),
          sugar: baseline.Gt * 10,
          sand: baseline.St * 10,
        },
        mass: {
          W: baseline.W,
          Gt: baseline.Gt,
          Gu: baseline.Gu,
          Gd: baseline.Gd,
          St: baseline.St,
          Sb: baseline.Sb,
          Ss: baseline.Ss,
          Ot: baseline.Ot,
          Ol: baseline.Ol,
          Od: baseline.Od,
        },
        fGu: baseline.fGu,
        rod: {
          x: 0.3,
          z: 0,
          tipY: 0.14,
          theta: 0,
          radius: 0.3,
        },
        omegaRod: 0,
        omegaDrive: 0,
        omegaFlow: 0,
      };

      const engine = HeadlessSimulationEngine.createForTesting(initialScienceState, {
        clientId: 'client-1',
      });

      // 1. Add 1.0g sugar
      engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 10 },
      });
      const sugarAdd = additions[0];
      expect(engine.getState().mass.Gt).toBe(sugarAdd.expectedMassChange.Gt);
      expect(engine.getState().mass.Gu).toBe(sugarAdd.expectedMassChange.Gu);
      expect(engine.getState().mass.Gd).toBe(sugarAdd.expectedMassChange.Gd);
      expect(engine.getState().fGu).toBeCloseTo(sugarAdd.expectedMassChange.fGu!, 6);

      // 2. Add 1.0g sand
      engine.dispatch({
        clientId: 'client-1',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sand', deciTicks: 10 },
      });
      const sandAdd = additions[1];
      expect(engine.getState().mass.St).toBe(sandAdd.expectedMassChange.St);
      expect(engine.getState().mass.Sb).toBe(sandAdd.expectedMassChange.Sb);
      expect(engine.getState().mass.Ss).toBe(sandAdd.expectedMassChange.Ss);

      // 3. Add 1.0ml oil
      engine.dispatch({
        clientId: 'client-1',
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 10 },
      });
      const oilAdd = additions[2];
      expect(engine.getState().mass.Ot).toBeCloseTo(oilAdd.expectedMassChange.Ot!, 6);
      expect(engine.getState().mass.Ol).toBeCloseTo(oilAdd.expectedMassChange.Ol!, 6);
      expect(engine.getState().mass.Od).toBe(oilAdd.expectedMassChange.Od);

      // 4. Add 1.0ml water
      engine.dispatch({
        clientId: 'client-1',
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 10 },
      });
      const waterAdd = additions[3];
      expect(engine.getState().mass.W).toBe(waterAdd.expectedMassChange.W);

      // Elapsed time remains unchanged
      expect(engine.getState().elapsedSeconds).toBe(baseline.elapsedSeconds);
      expect(engine.getState().tickIndex).toBe(baseline.tickIndex);
    });
  });

  describe('13. Reset seed validation and atomic rejection', () => {
    it('rejects invalid seeds with INVALID_SEED and leaves state intact', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 500 },
      });
      expect(engine.getState().mass.W).toBe(50);

      // Try reset with negative seed
      const ackNeg = engine.dispatch({
        clientId: 'client-1',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'reset', seed: -1 },
      });
      expect(ackNeg.accepted).toBe(false);
      expect(ackNeg.reason).toBe('INVALID_SEED');
      expect(engine.getState().mass.W).toBe(50); // state was NOT reset!

      // Try reset with float seed
      const ackFloat = engine.dispatch({
        clientId: 'client-1',
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'reset', seed: 12.34 },
      });
      expect(ackFloat.accepted).toBe(false);
      expect(ackFloat.reason).toBe('INVALID_SEED');
      expect(engine.getState().mass.W).toBe(50);

      // Valid uint32 reset
      const ackValid = engine.dispatch({
        clientId: 'client-1',
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'reset', seed: 42 },
      });
      expect(ackValid.accepted).toBe(true);
      expect(engine.getState().seed).toBe(42);
      expect(engine.getState().mass.W).toBe(0);
      expect(engine.getState().generation).toBe(1);
    });
  });

  describe('14. Detached ScalarSnapshot and mutation isolation', () => {
    it('produces a deep-copied snapshot where external mutations cannot affect engine', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });
      engine.dispatch({
        clientId: 'client-1',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 200 },
      });

      const snap1 = engine.snapshot();
      expect(snap1.mass.W).toBe(100);
      expect(snap1.mass.Gt).toBe(20);
      expect(snap1.capacityG).toBe(200); // 2 * W
      expect(snap1.saturationRatio).toBe(0); // Gd = 0
      expect(snap1.dissolutionProgress).toBe(0);
      expect(snap1.contact).toBeGreaterThan(0); // water 100ml gives contact

      // Attempting to mutate snapshot fields
      expect(Object.isFrozen(snap1)).toBe(true);
      expect(Object.isFrozen(snap1.mass)).toBe(true);

      // Engine state remains clean
      expect(engine.getState().mass.W).toBe(100);
    });
  });

  describe('15. Control intents (pause, releaseDrive, setMode, setAutoLevel, manualSample)', () => {
    it('correctly handles pause, releaseDrive, setMode, and setAutoLevel', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      // setMode auto
      engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      expect(engine.getState().mode).toBe('auto');
      expect(engine.getState().autoDriveEnabled).toBe(true);

      // pause preserves autoDriveEnabled
      engine.dispatch({
        clientId: 'client-1',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'pause' },
      });
      expect(engine.getState().paused).toBe(true);
      expect(engine.getState().autoDriveEnabled).toBe(true);

      // releaseDrive disables autoDriveEnabled
      engine.dispatch({
        clientId: 'client-1',
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'releaseDrive' },
      });
      expect(engine.getState().autoDriveEnabled).toBe(false);

      // setAutoLevel
      engine.dispatch({
        clientId: 'client-1',
        seq: 4,
        expectedGeneration: 0,
        payload: { type: 'setAutoLevel', level: 'fast' },
      });
      expect(engine.getState().autoLevel).toBe('fast');
    });

    it('clamps manualSample coordinates within maximum radius', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });

      // manualSample far outside (x=2.0, z=0.0) -> clamped to radius 0.74
      engine.dispatch({
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: {
          type: 'manualSample',
          x: 2.0,
          z: 0.0,
          inputTimeMs: 50,
          captureGeneration: 0,
        },
      });

      expect(engine.getState().rod.x).toBeCloseTo(0.74, 5);
      expect(engine.getState().rod.z).toBeCloseTo(0.0, 5);
      expect(engine.getState().rod.radius).toBeCloseTo(0.74, 5);
    });
  });

  describe('16. HeadlessSimulationFacade intent binding', () => {
    it('automatically binds monotonic seq and current generation at dispatch time', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'client-1' });
      const facade = new HeadlessSimulationFacade(engine);

      const ack1 = facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      expect(ack1.seq).toBe(1);
      expect(ack1.generation).toBe(0);
      expect(ack1.accepted).toBe(true);

      const ack2 = facade.dispatchIntent({ type: 'reset' });
      expect(ack2.seq).toBe(2);
      expect(ack2.generation).toBe(1);
      expect(ack2.accepted).toBe(true);

      // Next intent automatically binds to generation 1 without being stale
      const ack3 = facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 500 });
      expect(ack3.seq).toBe(3);
      expect(ack3.generation).toBe(1);
      expect(ack3.accepted).toBe(true);
      expect(engine.getState().mass.W).toBe(50);
    });
  });

  describe('17. canonicalFingerprint helper', () => {
    it('produces identical fingerprints regardless of object key insertion order', () => {
      const obj1 = { type: 'add', ingredient: 'water', deciTicks: 100 };
      const obj2 = { deciTicks: 100, ingredient: 'water', type: 'add' };

      expect(canonicalFingerprint(obj1)).toBe(canonicalFingerprint(obj2));
    });
  });

  describe('18. Max addition deciTicks validation', () => {
    it('verifies max per-add additions for all 4 ingredients', () => {
      expect(MAX_ADDITION_DECI_TICKS.water).toBe(5000);
      expect(MAX_ADDITION_DECI_TICKS.oil).toBe(2000);
      expect(MAX_ADDITION_DECI_TICKS.sugar).toBe(1000);
      expect(MAX_ADDITION_DECI_TICKS.sand).toBe(1000);
    });
  });
});
