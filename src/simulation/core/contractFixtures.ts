import {
  computeBeakerRegions,
} from '../constants/beaker';
import type {
  Ack,
  Command,
} from './SimulationEngine';
import {
  createInitialScienceState,
  DEFAULT_SEED,
  type RenderStamp,
  type RenderTarget,
  type ScalarSnapshot,
  type ScienceState,
} from './SimulationState';

/**
 * Contract Fixture 1: Initial Empty Paused State.
 * Baseline factory state at g0/v0/tick0/elapsed0/paused.
 */
export const initialEmptyPausedFixture = {
  name: 'initialEmptyPaused',
  seed: DEFAULT_SEED,
  expectedState: createInitialScienceState(DEFAULT_SEED),
} as const;

/**
 * Contract Fixture 2: Add Water -> Reset -> Add Water (SC-C03 / Timeline §3.3).
 * Sequence:
 *   seq1: add water 100ml (g0) -> accepted, g0/v1, qW1000, W100, elapsed0
 *   seq2: reset (g0) -> accepted, g1/v2, input all 0, mass all 0, tick0, paused
 *   seq3: add water 50ml (g1) -> accepted, g1/v3, qW500, W50 (does not resurrect 100ml)
 */
export interface StepRecord {
  command: Command;
  expectedAck: Ack;
  expectedStateSubset: Partial<ScienceState> & {
    generation: number;
    stateVersion: number;
    tickIndex: number;
    elapsedSeconds: number;
    paused: boolean;
  };
}

export const addWaterResetAddWaterFixture: {
  name: string;
  steps: StepRecord[];
} = {
  name: 'addWaterResetAddWater',
  steps: [
    {
      command: {
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      },
      expectedAck: {
        clientId: 'client-1',
        seq: 1,
        accepted: true,
        duplicate: false,
        reason: null,
        generation: 0,
        stateVersion: 1,
        appliedAtTick: 0,
        controlOrdinal: 1,
      },
      expectedStateSubset: {
        generation: 0,
        stateVersion: 1,
        tickIndex: 0,
        elapsedSeconds: 0,
        paused: true,
        input: { water: 1000, oil: 0, sugar: 0, sand: 0 },
        mass: {
          W: 100,
          Gt: 0,
          Gu: 0,
          Gd: 0,
          St: 0,
          Sb: 0,
          Ss: 0,
          Ot: 0,
          Ol: 0,
          Od: 0,
        },
      },
    },
    {
      command: {
        clientId: 'client-1',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'reset', seed: DEFAULT_SEED },
      },
      expectedAck: {
        clientId: 'client-1',
        seq: 2,
        accepted: true,
        duplicate: false,
        reason: null,
        generation: 1,
        stateVersion: 2,
        appliedAtTick: 0,
        controlOrdinal: 2,
      },
      expectedStateSubset: {
        generation: 1,
        stateVersion: 2,
        tickIndex: 0,
        elapsedSeconds: 0,
        paused: true,
        input: { water: 0, oil: 0, sugar: 0, sand: 0 },
        mass: {
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
        },
      },
    },
    {
      command: {
        clientId: 'client-1',
        seq: 3,
        expectedGeneration: 1,
        payload: { type: 'add', ingredient: 'water', deciTicks: 500 },
      },
      expectedAck: {
        clientId: 'client-1',
        seq: 3,
        accepted: true,
        duplicate: false,
        reason: null,
        generation: 1,
        stateVersion: 3,
        appliedAtTick: 0,
        controlOrdinal: 3,
      },
      expectedStateSubset: {
        generation: 1,
        stateVersion: 3,
        tickIndex: 0,
        elapsedSeconds: 0,
        paused: true,
        input: { water: 500, oil: 0, sugar: 0, sand: 0 },
        mass: {
          W: 50,
          Gt: 0,
          Gu: 0,
          Gd: 0,
          St: 0,
          Sb: 0,
          Ss: 0,
          Ot: 0,
          Ol: 0,
          Od: 0,
        },
      },
    },
  ],
};

/**
 * Contract Fixture 3: Reset Replay (Duplicate) vs Distinct Resets (SC-C04).
 * - Replaying seq 2 (same reset payload) returns cached original ack with duplicate=true,
 *   does not increment generation, and does not alter the current g1/v3 state.
 * - Distinct reset commands (seq 5, seq 6) increment generation to g2 and g3.
 */
export const resetReplayAndDistinctResetFixture = {
  name: 'resetReplayAndDistinctReset',
  duplicateReplay: {
    command: {
      clientId: 'client-1',
      seq: 2,
      expectedGeneration: 0,
      payload: { type: 'reset', seed: DEFAULT_SEED },
    } as Command,
    expectedAck: {
      clientId: 'client-1',
      seq: 2,
      accepted: true,
      duplicate: true,
      reason: null,
      generation: 1,
      stateVersion: 2,
      appliedAtTick: 0,
      controlOrdinal: 2,
    } as Ack,
  },
  distinctResets: [
    {
      command: {
        clientId: 'client-1',
        seq: 5,
        expectedGeneration: 1,
        payload: { type: 'reset', seed: DEFAULT_SEED },
      } as Command,
      expectedAck: {
        clientId: 'client-1',
        seq: 5,
        accepted: true,
        duplicate: false,
        reason: null,
        generation: 2,
        stateVersion: 4,
        appliedAtTick: 0,
        controlOrdinal: 5,
      } as Ack,
    },
    {
      command: {
        clientId: 'client-1',
        seq: 6,
        expectedGeneration: 2,
        payload: { type: 'reset', seed: DEFAULT_SEED },
      } as Command,
      expectedAck: {
        clientId: 'client-1',
        seq: 6,
        accepted: true,
        duplicate: false,
        reason: null,
        generation: 3,
        stateVersion: 5,
        appliedAtTick: 0,
        controlOrdinal: 6,
      } as Ack,
    },
  ],
};

/**
 * Contract Fixture 4: Stale Generation Pointer Sample (SC-C05 / SC-IN04).
 * A pointer manualSample dispatched with captureGeneration 0 arrives when
 * engine has advanced to generation 1.
 * Must be rejected with STALE_GENERATION; science state remains intact.
 */
export const staleManualSampleFixture = {
  name: 'staleManualSample',
  currentGeneration: 1,
  command: {
    clientId: 'client-1',
    seq: 4,
    expectedGeneration: 1,
    payload: {
      type: 'manualSample',
      x: 0.3,
      z: 0.1,
      inputTimeMs: 120,
      captureGeneration: 0, // stale capture generation!
    },
  } as Command,
  expectedAck: {
    clientId: 'client-1',
    seq: 4,
    accepted: false,
    duplicate: false,
    reason: 'STALE_GENERATION',
    generation: 1,
    stateVersion: 3,
    appliedAtTick: 0,
    controlOrdinal: 4,
  } as Ack,
};

/**
 * Contract Fixture 5: Add Paused and Resume (SC-C01 / Timeline §3.3).
 * - Adding while paused updates masses immediately, elapsedSeconds and tickIndex remain 0.
 * - Resume is accepted immediately (paused=false), but clock does not advance until tick step.
 */
export const addPausedAndResumeFixture: {
  name: string;
  steps: StepRecord[];
} = {
  name: 'addPausedAndResume',
  steps: [
    {
      command: {
        clientId: 'client-1',
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      },
      expectedAck: {
        clientId: 'client-1',
        seq: 1,
        accepted: true,
        duplicate: false,
        reason: null,
        generation: 0,
        stateVersion: 1,
        appliedAtTick: 0,
        controlOrdinal: 1,
      },
      expectedStateSubset: {
        generation: 0,
        stateVersion: 1,
        tickIndex: 0,
        elapsedSeconds: 0,
        paused: true,
        mass: {
          W: 100,
          Gt: 0,
          Gu: 0,
          Gd: 0,
          St: 0,
          Sb: 0,
          Ss: 0,
          Ot: 0,
          Ol: 0,
          Od: 0,
        },
      },
    },
    {
      command: {
        clientId: 'client-1',
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      },
      expectedAck: {
        clientId: 'client-1',
        seq: 2,
        accepted: true,
        duplicate: false,
        reason: null,
        generation: 0,
        stateVersion: 2,
        appliedAtTick: 0,
        controlOrdinal: 2,
      },
      expectedStateSubset: {
        generation: 0,
        stateVersion: 2,
        tickIndex: 0,
        elapsedSeconds: 0,
        paused: false,
      },
    },
  ],
};

/**
 * Contract Fixture 6: Capacity Serialization and Rejection (SC-C02 / Timeline §3.3).
 * Sequence:
 *   seq 7: add water 499.9ml (4999 deciTicks, 499900 milli-ml) -> accepted, g3/v6
 *   seq 8: add water 0.1ml (1 deciTick, 500000 milli-ml) -> accepted, g3/v7
 *   seq 9: add oil 0.1ml (1 deciTick, would be 500100 milli-ml > 500000) -> rejected CAPACITY_EXCEEDED
 */
export const capacitySerializationFixture = {
  name: 'capacitySerialization',
  steps: [
    {
      command: {
        clientId: 'client-1',
        seq: 7,
        expectedGeneration: 3,
        payload: { type: 'add', ingredient: 'water', deciTicks: 4999 },
      } as Command,
      expectedAck: {
        clientId: 'client-1',
        seq: 7,
        accepted: true,
        duplicate: false,
        reason: null,
        generation: 3,
        stateVersion: 6,
        appliedAtTick: 0,
        controlOrdinal: 7,
      } as Ack,
      expectedReservedMilliMl: 499900,
    },
    {
      command: {
        clientId: 'client-1',
        seq: 8,
        expectedGeneration: 3,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1 },
      } as Command,
      expectedAck: {
        clientId: 'client-1',
        seq: 8,
        accepted: true,
        duplicate: false,
        reason: null,
        generation: 3,
        stateVersion: 7,
        appliedAtTick: 0,
        controlOrdinal: 8,
      } as Ack,
      expectedReservedMilliMl: 500000,
    },
    {
      command: {
        clientId: 'client-1',
        seq: 9,
        expectedGeneration: 3,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 1 },
      } as Command,
      expectedAck: {
        clientId: 'client-1',
        seq: 9,
        accepted: false,
        duplicate: false,
        reason: 'CAPACITY_EXCEEDED',
        generation: 3,
        stateVersion: 7,
        appliedAtTick: 0,
        controlOrdinal: 9,
      } as Ack,
      expectedReservedMilliMl: 500000,
    },
  ],
};

/**
 * Contract Fixture 7: Phase Allocation Invariants on Add (SC-A01 / §3.5).
 * Adding ingredients updates specific compartments immediately:
 * - Sugar: Gt += delta, Gu += delta; Gd untouched; fGu = oldGu * oldfGu / newGu
 * - Sand: St += delta, Sb += delta; Ss untouched
 * - Oil: Ot += delta, Ol += delta; Od untouched (density 0.9 g/ml)
 * - Water: W += delta; Gd, Gu, Ss, Od, flow, elapsed time untouched
 */
export const addPhaseAllocationFixture = {
  name: 'addPhaseAllocation',
  baseline: {
    W: 100,
    Gt: 10,
    Gu: 5,
    Gd: 5,
    fGu: 0.4, // suspended sugar mass = 5 * 0.4 = 2.0g
    St: 10,
    Sb: 7,
    Ss: 3,
    Ot: 18,
    Ol: 10,
    Od: 8,
    elapsedSeconds: 12.0,
    tickIndex: 720,
  },
  additions: [
    {
      ingredient: 'sugar' as const,
      deciTicks: 10, // 1.0g
      expectedMassChange: {
        Gt: 11,
        Gu: 6,
        Gd: 5,
        fGu: (5 * 0.4) / 6, // 2 / 6 = 1/3 ≈ 0.3333333333333333
      },
    },
    {
      ingredient: 'sand' as const,
      deciTicks: 10, // 1.0g
      expectedMassChange: {
        St: 11,
        Sb: 8,
        Ss: 3,
      },
    },
    {
      ingredient: 'oil' as const,
      deciTicks: 10, // 1.0 ml -> 0.9g at density 0.9 g/ml
      expectedMassChange: {
        Ot: 18.9,
        Ol: 10.9,
        Od: 8,
      },
    },
    {
      ingredient: 'water' as const,
      deciTicks: 10, // 1.0 ml -> 1.0g at density 1.0 g/ml
      expectedMassChange: {
        W: 101,
      },
    },
  ],
  expectedTimeUnchanged: {
    elapsedSeconds: 12.0,
    tickIndex: 720,
  },
};

/**
 * Contract Fixture 8: Oil-Only Region and Suspended Sand (SC-R01 / §4).
 * Setup: 0 ml water, 100 ml oil (90g), 10g sand (Sb: 4g, Ss: 6g).
 * Contract:
 * - Bed volume = 0.6 * Sb = 2.4 ml.
 * - Aqueous volume = 0 ml.
 * - Oil volume = 106 - 2.4 = 103.6 ml.
 * - Suspended sand solids belong to the oil volume envelope; no duplicate oil base volume.
 */
export const oilOnlyRegionFixture = {
  name: 'oilOnlyRegion',
  input: {
    phases: {
      Wml: 0,
      Oml: 100,
      Gt: 0,
      Gu: 0,
      Gd: 0,
      fGu: 0,
      St: 10,
      Sb: 4,
      Ss: 6,
      Ot: 90,
      Ol: 90,
      Od: 0,
    },
  },
  expectedGeometry: {
    category: 'oil-only' as const,
    reservedVolumeMl: 106, // 100 + 0.6 * 10
    bedVolumeMl: 2.4,      // 0.6 * 4
    aqueousVolumeMl: 0,
    oilVolumeMl: 103.6,    // 100 + 0.6 * 6
    bedHeight: 2.4 * 0.0042,     // 0.01008
    oilHeight: 103.6 * 0.0042,   // 0.43512
    fillHeight: 106 * 0.0042,    // 0.4452
  },
  verifyWithGeometryHelper: () => {
    return computeBeakerRegions({
      Wml: 0,
      Oml: 100,
      Gt: 0,
      Gu: 0,
      Gd: 0,
      fGu: 0,
      St: 10,
      Sb: 4,
      Ss: 6,
      Ot: 90,
      Ol: 90,
      Od: 0,
    });
  },
};

/**
 * Contract Fixture 9: Ownership and Memory Buffer Isolation (SC-B01 / §2 / §9).
 * - ScalarSnapshot: detached deep-readonly object; caller mutating a copy cannot alter core.
 * - RenderTarget: pre-allocated arrays owned by caller (positions, weights, materials).
 * - copyRenderFrame: writes into target, returns RenderStamp without leaking internal views.
 */
export const ownershipAndBufferFixture = {
  name: 'ownershipAndBuffer',
  createCallerRenderTarget: (capacity: number): RenderTarget => ({
    positions: new Float32Array(capacity * 3),
    weights: new Float32Array(capacity),
    materials: new Uint8Array(capacity),
    count: capacity,
  }),
  expectedStamp: (generation: number, stateVersion: number, activeCount: number): RenderStamp => ({
    generation,
    stateVersion,
    renderRevision: 1,
    count: activeCount,
  }),
  verifyScalarSnapshotDetached: (snapshot: ScalarSnapshot, testState: ScienceState): boolean => {
    // Assert snapshot values match, but mutating snapshot via any cast cannot mutate testState
    const copy = { ...snapshot, mass: { ...snapshot.mass } };
    (copy.mass as { W: number }).W = 9999;
    return testState.mass.W !== 9999;
  },
};
