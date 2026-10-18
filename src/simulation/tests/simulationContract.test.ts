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
  initialEmptyPausedFixture,
  oilOnlyRegionFixture,
  ownershipAndBufferFixture,
  resetReplayAndDistinctResetFixture,
  staleManualSampleFixture,
} from '../core/contractFixtures';
import type {
  Ack,
  Command,
  RejectionReason,
} from '../core/SimulationEngine';
import {
  createInitialScienceState,
  DEFAULT_SEED,
  MATERIAL_IDS,
  normalizeSeed,
  type ScalarSnapshot,
} from '../core/SimulationState';

describe('V1-07 — Simulation State Contract & Factory', () => {
  describe('createInitialScienceState', () => {
    it('initializes state at g0/v0/tick0/elapsed0/paused with default seed 1729', () => {
      const state = createInitialScienceState();
      expect(state.generation).toBe(0);
      expect(state.stateVersion).toBe(0);
      expect(state.tickIndex).toBe(0);
      expect(state.elapsedSeconds).toBe(0);
      expect(state.seed).toBe(DEFAULT_SEED);
      expect(state.paused).toBe(true);
      expect(state.mode).toBe('observe');
      expect(state.autoDriveEnabled).toBe(false);
      expect(state.autoLevel).toBe('slow');

      // Input ticks all zero
      expect(state.input).toEqual({
        water: 0,
        oil: 0,
        sugar: 0,
        sand: 0,
      });

      // Mass compartments all zero
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

      // Rod pose and omega values
      expect(state.rod).toEqual({
        x: 0.3,
        z: 0,
        tipY: computeTipY(BEAKER_BASE_Y), // 0.14
        theta: 0,
        radius: 0.3,
      });
      expect(state.omegaRod).toBe(0);
      expect(state.omegaDrive).toBe(0);
      expect(state.omegaFlow).toBe(0);
    });

    it('allocates isolated object references for input, mass, and rod', () => {
      const stateA = createInitialScienceState();
      const stateB = createInitialScienceState();

      expect(stateA.input).not.toBe(stateB.input);
      expect(stateA.mass).not.toBe(stateB.mass);
      expect(stateA.rod).not.toBe(stateB.rod);

      // Mutating stateA does not affect stateB
      stateA.input.water = 1000;
      stateA.mass.W = 100;
      stateA.rod.tipY = 0.99;

      expect(stateB.input.water).toBe(0);
      expect(stateB.mass.W).toBe(0);
      expect(stateB.rod.tipY).toBe(0.14);
    });

    it('accepts explicit valid unsigned 32-bit seeds', () => {
      const state0 = createInitialScienceState(0);
      expect(state0.seed).toBe(0);

      const stateMax = createInitialScienceState(4294967295);
      expect(stateMax.seed).toBe(4294967295);

      const stateCustom = createInitialScienceState(123456);
      expect(stateCustom.seed).toBe(123456);
    });
  });

  describe('normalizeSeed', () => {
    it('returns DEFAULT_SEED when seed is undefined', () => {
      expect(normalizeSeed(undefined)).toBe(DEFAULT_SEED);
    });

    it('returns valid uint32 unchanged', () => {
      expect(normalizeSeed(0)).toBe(0);
      expect(normalizeSeed(1729)).toBe(1729);
      expect(normalizeSeed(0xffffffff)).toBe(4294967295);
    });

    it('throws TypeError for non-uint32 values', () => {
      expect(() => normalizeSeed(-1)).toThrow(TypeError);
      expect(() => normalizeSeed(1.5)).toThrow(TypeError);
      expect(() => normalizeSeed(0x100000000)).toThrow(TypeError);
      expect(() => normalizeSeed(NaN)).toThrow(TypeError);
      expect(() => normalizeSeed(Infinity)).toThrow(TypeError);
      expect(() => normalizeSeed(-Infinity)).toThrow(TypeError);
      expect(() => normalizeSeed('1729')).toThrow(TypeError);
      expect(() => normalizeSeed(null)).toThrow(TypeError);
      expect(() => normalizeSeed({})).toThrow(TypeError);
    });
  });

  describe('Material IDs and Constants', () => {
    it('defines distinct material IDs for sugar, sand, and oil droplets', () => {
      expect(MATERIAL_IDS.sugar).toBe(0);
      expect(MATERIAL_IDS.sand).toBe(1);
      expect(MATERIAL_IDS.oilDroplet).toBe(2);
    });
  });
});

describe('V1-07 — Contract Fixtures Verification', () => {
  it('Fixture 1: initialEmptyPausedFixture matches factory initial state', () => {
    const initialState = createInitialScienceState();
    expect(initialEmptyPausedFixture.expectedState).toEqual(initialState);
  });

  it('Fixture 2: addWaterResetAddWaterFixture adheres to §3.3 timeline contract', () => {
    const { steps } = addWaterResetAddWaterFixture;
    expect(steps).toHaveLength(3);

    // Step 1: add water 100ml -> g0/v1
    expect(steps[0].command.seq).toBe(1);
    expect(steps[0].command.expectedGeneration).toBe(0);
    expect(steps[0].expectedAck.accepted).toBe(true);
    expect(steps[0].expectedAck.generation).toBe(0);
    expect(steps[0].expectedAck.stateVersion).toBe(1);
    expect(steps[0].expectedStateSubset.mass!.W).toBe(100);

    // Step 2: reset -> g1/v2, mass reset to 0
    expect(steps[1].command.seq).toBe(2);
    expect(steps[1].expectedAck.generation).toBe(1);
    expect(steps[1].expectedAck.stateVersion).toBe(2);
    expect(steps[1].expectedStateSubset.mass!.W).toBe(0);

    // Step 3: add water 50ml -> g1/v3, mass 50 (does not resurrect 100)
    expect(steps[2].command.seq).toBe(3);
    expect(steps[2].command.expectedGeneration).toBe(1);
    expect(steps[2].expectedAck.generation).toBe(1);
    expect(steps[2].expectedAck.stateVersion).toBe(3);
    expect(steps[2].expectedStateSubset.mass!.W).toBe(50);
  });

  it('Fixture 3: resetReplayAndDistinctResetFixture verifies duplicate vs distinct resets', () => {
    const { duplicateReplay, distinctResets } = resetReplayAndDistinctResetFixture;

    // Duplicate replay of seq 2 returns original cached ack with duplicate=true
    expect(duplicateReplay.expectedAck.duplicate).toBe(true);
    expect(duplicateReplay.expectedAck.accepted).toBe(true);
    expect(duplicateReplay.expectedAck.generation).toBe(1);

    // Distinct resets increment generation
    expect(distinctResets[0].command.seq).toBe(5);
    expect(distinctResets[0].expectedAck.generation).toBe(2);
    expect(distinctResets[0].expectedAck.stateVersion).toBe(4);

    expect(distinctResets[1].command.seq).toBe(6);
    expect(distinctResets[1].expectedAck.generation).toBe(3);
    expect(distinctResets[1].expectedAck.stateVersion).toBe(5);
  });

  it('Fixture 4: staleManualSampleFixture rejects pointer sample with STALE_GENERATION', () => {
    const { currentGeneration, command, expectedAck } = staleManualSampleFixture;
    expect(currentGeneration).toBe(1);
    expect(command.payload.type).toBe('manualSample');
    if (command.payload.type === 'manualSample') {
      expect(command.payload.captureGeneration).toBe(0); // stale!
    }
    expect(expectedAck.accepted).toBe(false);
    expect(expectedAck.reason).toBe('STALE_GENERATION');
    expect(expectedAck.controlOrdinal).toBe(4);
  });

  it('Fixture 5: addPausedAndResumeFixture verifies immediate mass update and delayed tick advance', () => {
    const { steps } = addPausedAndResumeFixture;
    expect(steps[0].expectedStateSubset.mass?.W).toBe(100);
    expect(steps[0].expectedStateSubset.elapsedSeconds).toBe(0);
    expect(steps[0].expectedStateSubset.paused).toBe(true);

    expect(steps[1].expectedAck.accepted).toBe(true);
    expect(steps[1].expectedStateSubset.paused).toBe(false);
    expect(steps[1].expectedStateSubset.elapsedSeconds).toBe(0);
    expect(steps[1].expectedStateSubset.tickIndex).toBe(0);
  });

  it('Fixture 6: capacitySerializationFixture enforces 500000 milli-ml capacity limit', () => {
    const { steps } = capacitySerializationFixture;

    expect(steps[0].expectedReservedMilliMl).toBe(499900);
    expect(steps[0].expectedAck.accepted).toBe(true);

    expect(steps[1].expectedReservedMilliMl).toBe(500000);
    expect(steps[1].expectedAck.accepted).toBe(true);

    // 0.1ml addition exceeds 500000 milli-ml capacity limit
    expect(steps[2].expectedAck.accepted).toBe(false);
    expect(steps[2].expectedAck.reason).toBe('CAPACITY_EXCEEDED');
    expect(steps[2].expectedReservedMilliMl).toBe(500000);
  });

  it('Fixture 7: addPhaseAllocationFixture verifies compartment math on additions', () => {
    const { baseline, additions, expectedTimeUnchanged } = addPhaseAllocationFixture;

    // Sugar addition: Gu + 1, Gd unchanged, fGu diluted
    const sugarAdd = additions[0];
    expect(sugarAdd.expectedMassChange.Gt).toBe(baseline.Gt + 1);
    expect(sugarAdd.expectedMassChange.Gu).toBe(baseline.Gu + 1);
    expect(sugarAdd.expectedMassChange.Gd).toBe(baseline.Gd);
    // Suspended sugar mass was 5 * 0.4 = 2.0g. With Gu=6, fGu = 2.0 / 6 = 1/3
    expect(sugarAdd.expectedMassChange.fGu).toBeCloseTo(1 / 3, 6);

    // Sand addition: Sb + 1, Ss unchanged
    const sandAdd = additions[1];
    expect(sandAdd.expectedMassChange.St).toBe(baseline.St + 1);
    expect(sandAdd.expectedMassChange.Sb).toBe(baseline.Sb + 1);
    expect(sandAdd.expectedMassChange.Ss).toBe(baseline.Ss);

    // Oil addition: density 0.9 g/ml -> 1 ml = 0.9g
    const oilAdd = additions[2];
    expect(oilAdd.expectedMassChange.Ot).toBeCloseTo(baseline.Ot + 0.9, 6);
    expect(oilAdd.expectedMassChange.Ol).toBeCloseTo(baseline.Ol + 0.9, 6);
    expect(oilAdd.expectedMassChange.Od).toBe(baseline.Od);

    // Water addition: density 1.0 g/ml -> 1 ml = 1.0g
    const waterAdd = additions[3];
    expect(waterAdd.expectedMassChange.W).toBe(baseline.W + 1.0);

    // Time remains unchanged during command application
    expect(expectedTimeUnchanged.elapsedSeconds).toBe(12.0);
    expect(expectedTimeUnchanged.tickIndex).toBe(720);
  });

  it('Fixture 8: oilOnlyRegionFixture calculates correct geometry bounds without duplicate base volume', () => {
    const { expectedGeometry, verifyWithGeometryHelper } = oilOnlyRegionFixture;
    const computed = verifyWithGeometryHelper();

    expect(computed.category).toBe(expectedGeometry.category);
    expect(computed.bed.volumeMl).toBeCloseTo(expectedGeometry.bedVolumeMl, 6);
    expect(computed.aqueous.volumeMl).toBe(expectedGeometry.aqueousVolumeMl);
    expect(computed.oil.volumeMl).toBeCloseTo(expectedGeometry.oilVolumeMl, 6);

    // Bed + Oil equals total reservation
    expect(computed.bed.volumeMl + computed.oil.volumeMl).toBeCloseTo(expectedGeometry.reservedVolumeMl, 6);

    // Heights check
    expect(computed.bed.height).toBeCloseTo(expectedGeometry.bedHeight, 6);
    expect(computed.oil.height).toBeCloseTo(expectedGeometry.oilHeight, 6);
    expect(computed.oil.top - BEAKER_BASE_Y).toBeCloseTo(expectedGeometry.fillHeight, 6);
  });

  it('Fixture 9: ownershipAndBufferFixture enforces caller memory ownership and detachment', () => {
    const { createCallerRenderTarget, expectedStamp, verifyScalarSnapshotDetached } =
      ownershipAndBufferFixture;

    // Caller allocates target
    const target = createCallerRenderTarget(100);
    expect(target.positions).toBeInstanceOf(Float32Array);
    expect(target.positions.length).toBe(300);
    expect(target.weights.length).toBe(100);
    expect(target.materials.length).toBe(100);

    const stamp = expectedStamp(1, 3, 50);
    expect(stamp.count).toBe(50);
    expect(stamp.generation).toBe(1);
    expect(stamp.stateVersion).toBe(3);

    // Snapshot isolation
    const initial = createInitialScienceState();
    initial.mass.W = 100;
    const detached = verifyScalarSnapshotDetached(initial as unknown as ScalarSnapshot, initial);
    expect(detached).toBe(true);
  });
});

describe('V1-07 — Static Typing Usage Examples', () => {
  it('verifies Command envelope typing with various intents', () => {
    const addCmd: Command = {
      clientId: 'client-test',
      seq: 1,
      expectedGeneration: 0,
      payload: { type: 'add', ingredient: 'sugar', deciTicks: 50 },
    };
    const pauseCmd: Command = {
      clientId: 'client-test',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'pause' },
    };
    const setModeCmd: Command = {
      clientId: 'client-test',
      seq: 3,
      expectedGeneration: 0,
      payload: { type: 'setMode', mode: 'auto' },
    };

    expect(addCmd.payload.type).toBe('add');
    expect(pauseCmd.payload.type).toBe('pause');
    expect(setModeCmd.payload.type).toBe('setMode');
  });

  it('verifies Ack typing and RejectionReasons', () => {
    const reasons: RejectionReason[] = [
      'STALE_GENERATION',
      'OUT_OF_ORDER',
      'ID_REUSED',
      'DUPLICATE_EXPIRED',
      'CAPACITY_EXCEEDED',
      'MALFORMED_ENVELOPE',
      'INVALID_PAYLOAD',
      'EXCEEDS_MAX_ADDITION',
      'INVALID_SEED',
    ];

    reasons.forEach((reason, index) => {
      const ack: Ack = {
        clientId: 'client-test',
        seq: index + 1,
        accepted: false,
        duplicate: false,
        reason,
        generation: 0,
        stateVersion: 0,
        appliedAtTick: 0,
        controlOrdinal: null,
      };
      expect(ack.reason).toBe(reason);
      expect(ack.accepted).toBe(false);
    });
  });
});
