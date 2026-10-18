import {
  BEAKER_BASE_Y,
  computeBeakerRegions,
  computeMechanicalContact,
  computeTipY,
  clampSpoonXZ,
  type BeakerRegions,
  type PhaseMasses,
} from '../constants/beaker';
import {
  CAPACITY_MILLI_ML,
  VISUAL_MILLI_ML_PER_TICK,
} from '../constants/ingredients';
import type {
  Ack,
  AutoLevel,
  Command,
  Ingredient,
  Intent,
  Mode,
  RejectionReason,
} from './SimulationEngine';
import {
  type AdvanceResult,
  type ReadonlyClock,
  SimulationClock,
} from './SimulationClock';
import {
  computeFlowIntensity,
  stepStirringFlow,
} from '../models/StirringFlow';
import {
  type ClockConfig,
  cloneScienceState,
  createInitialScienceState,
  DEFAULT_SEED,
  normalizeSeed,
  type RenderStamp,
  type RenderTarget,
  type RodPose,
  type ScalarSnapshot,
  type ScienceState,
} from './SimulationState';
import { AUTO_LEVEL_SPEEDS } from '../constants/flow';
import { AutoStirController } from '../../interactions/AutoStirController';
import { assertMassInvariants } from '../models/MassLedger';
import { computeWaterCapacityG } from '../constants/science';
import {
  computeDissolutionProgress,
  computeSaturationRatio,
  stepDissolution,
} from '../models/Dissolution';
import { stepSandSuspension } from '../models/SandSuspension';
import { stepOilSeparation } from '../models/OilSeparation';
import {
  ParticleTransportSystem,
} from '../models/ParticleTransport';

export interface RenderPoseCapture {
  x: number;
  z: number;
  tipY: number;
  theta: number;
  radius: number;
  generation: number;
  tickIndex: number;
  stateVersion: number;
}

export const MAX_ADDITION_DECI_TICKS: Record<Ingredient, number> = {
  water: 5000,
  oil: 2000,
  sugar: 1000,
  sand: 1000,
};

export const MAX_ACK_CACHE_SIZE = 256;

interface CachedAckEntry {
  ack: Ack;
  fingerprint: string;
}

/**
 * Generates an order-independent canonical JSON string of a command payload.
 */
export function canonicalFingerprint(payload: unknown): string {
  if (payload === null || typeof payload !== 'object') {
    return JSON.stringify(payload);
  }
  if (Array.isArray(payload)) {
    return '[' + payload.map(canonicalFingerprint).join(',') + ']';
  }
  const keys = Object.keys(payload as Record<string, unknown>).sort();
  return '{' + keys.map((k) => `${JSON.stringify(k)}:${canonicalFingerprint((payload as Record<string, unknown>)[k])}`).join(',') + '}';
}

export interface EngineOptions {
  clientId?: string;
  seed?: number;
  clockConfig?: Partial<ClockConfig>;
  particleBudgetPerPool?: number;
}

/**
 * Command-only core capability interface implemented in V2-01 and extended in V2-02, V3-05.
 */
export interface CommandEngineCore {
  dispatch(command: Command): Ack;
  advance(realDeltaSeconds: number): AdvanceResult;
  snapshot(): ScalarSnapshot;
  copyRenderFrame(target: RenderTarget): RenderStamp;
  getState(): Readonly<ScienceState>;
  getCurrentGeneration(): number;
  isPaused(): boolean;
  getNextSequence(): number;
  getClientId(): string;
  getMode(): Mode;
  getTickIndex(): number;
  getElapsedSeconds(): number;
  getStateVersion(): number;
  getOmegaRod(): number;
  getOmegaFlow(): number;
  getOmegaDrive(): number;
}

/**
 * HeadlessSimulationEngine
 * Core headless simulation engine responsible for:
 * - Private ScienceState encapsulation
 * - Synchronous command validation and atomic commit
 * - Client sequence and generation fencing
 * - Bounded LRU-256 duplicate ack caching and payload fingerprinting
 * - Detached deep-copied scalar snapshot publication
 * - Geometry and constraints adaptation via V1-05 helpers
 * - Representative particle pools transport and non-aliased copyRenderFrame
 */
export class HeadlessSimulationEngine implements CommandEngineCore {
  private state: ScienceState;
  private readonly clientId: string;
  private highWaterSeq = 0;
  private readonly ackCache = new Map<number, CachedAckEntry>();
  private readonly clock: SimulationClock;
  private readonly autoController = new AutoStirController();
  private readonly transport: ParticleTransportSystem;
  private beforeStepHook?: (currentTick: number) => void;

  constructor(options?: EngineOptions) {
    this.clientId = options?.clientId ?? 'client-1';
    this.state = createInitialScienceState(options?.seed);
    this.transport = new ParticleTransportSystem(options?.particleBudgetPerPool);
    this.recalculateGeometryAndConstraints();
    this.autoController.resetToPose(this.state.rod);
    this.clock = new SimulationClock(
      options?.clockConfig,
      (h) => this.stepFixedTick(h),
      () => this.onBeforeTickStep()
    );
  }

  /**
   * Internal test seam for injecting validated non-baseline fixtures (e.g. SC-A01)
   * while maintaining private state encapsulation in production code.
   */
  static createForTesting(initialState: ScienceState, options?: EngineOptions): HeadlessSimulationEngine {
    // Validate invariants
    if (!Number.isInteger(initialState.generation) || initialState.generation < 0) {
      throw new Error(`Invalid generation for testing: ${initialState.generation}`);
    }
    if (!Number.isInteger(initialState.stateVersion) || initialState.stateVersion < 0) {
      throw new Error(`Invalid stateVersion for testing: ${initialState.stateVersion}`);
    }
    if (!Number.isInteger(initialState.tickIndex) || initialState.tickIndex < 0) {
      throw new Error(`Invalid tickIndex for testing: ${initialState.tickIndex}`);
    }
    if (!Number.isFinite(initialState.elapsedSeconds) || initialState.elapsedSeconds < 0) {
      throw new Error(`Invalid elapsedSeconds for testing: ${initialState.elapsedSeconds}`);
    }

    assertMassInvariants(initialState, {
      generation: initialState.generation,
      tickIndex: initialState.tickIndex,
      stateVersion: initialState.stateVersion,
      stage: 'createForTesting',
    });
    if (!Number.isFinite(initialState.omegaRod) || Math.abs(initialState.omegaRod) > 8.000001) {
      throw new Error(`Invalid omegaRod for testing: ${initialState.omegaRod}`);
    }
    if (!Number.isFinite(initialState.omegaDrive)) {
      throw new Error(`Invalid omegaDrive for testing: ${initialState.omegaDrive}`);
    }
    if (!Number.isFinite(initialState.omegaFlow)) {
      throw new Error(`Invalid omegaFlow for testing: ${initialState.omegaFlow}`);
    }

    const engine = new HeadlessSimulationEngine({
      clientId: options?.clientId ?? 'client-1',
      seed: initialState.seed,
      clockConfig: options?.clockConfig,
      particleBudgetPerPool: options?.particleBudgetPerPool,
    });

    // Deep clone state into private engine state
    engine.state = {
      ...initialState,
      input: { ...initialState.input },
      mass: { ...initialState.mass },
      rod: { ...initialState.rod },
    };

    engine.recalculateGeometryAndConstraints();
    engine.autoController.resetToPose(engine.state.rod);
    if (engine.state.mode === 'auto' && engine.state.autoDriveEnabled) {
      engine.autoController.start(engine.state.rod, engine.state.autoLevel);
    }
    return engine;
  }

  getClientId(): string {
    return this.clientId;
  }

  getCurrentGeneration(): number {
    return this.state.generation;
  }

  isPaused(): boolean {
    return this.state.paused;
  }

  getNextSequence(): number {
    return this.highWaterSeq + 1;
  }

  getState(): Readonly<ScienceState> {
    return cloneScienceState(this.state);
  }

  getMode(): Mode {
    return this.state.mode;
  }

  getTickIndex(): number {
    return this.state.tickIndex;
  }

  getElapsedSeconds(): number {
    return this.state.elapsedSeconds;
  }

  getStateVersion(): number {
    return this.state.stateVersion;
  }

  getOmegaRod(): number {
    return this.state.omegaRod;
  }

  getOmegaFlow(): number {
    return this.state.omegaFlow;
  }

  getOmegaDrive(): number {
    return this.state.omegaDrive;
  }

  getRodPose(): RodPose {
    return {
      x: this.state.rod.x,
      z: this.state.rod.z,
      tipY: this.state.rod.tipY,
      theta: this.state.rod.theta,
      radius: this.state.rod.radius,
    };
  }

  getRenderPose(): RenderPoseCapture {
    return {
      x: this.state.rod.x,
      z: this.state.rod.z,
      tipY: this.state.rod.tipY,
      theta: this.state.rod.theta,
      radius: this.state.rod.radius,
      generation: this.state.generation,
      tickIndex: this.state.tickIndex,
      stateVersion: this.state.stateVersion,
    };
  }

  getAutoController(): AutoStirController {
    return this.autoController;
  }

  getClock(): ReadonlyClock {
    return {
      getConfig: () => this.clock.getConfig(),
      getAccumulator: () => this.clock.getAccumulator(),
      getDroppedActiveWallTime: () => this.clock.getDroppedActiveWallTime(),
      getIsSuspended: () => this.clock.getIsSuspended(),
      getLastTimestampMs: () => this.clock.getLastTimestampMs(),
      getDiagnostics: () => this.clock.getDiagnostics(),
    };
  }

  getAccumulator(): number {
    return this.clock.getAccumulator();
  }

  getDroppedActiveWallTime(): number {
    return this.clock.getDroppedActiveWallTime();
  }

  setBeforeStepHook(hook?: (currentTick: number) => void): void {
    this.beforeStepHook = hook;
  }

  advance(realDeltaSeconds: number): AdvanceResult {
    const startGen = this.state.generation;
    return this.clock.advance(
      realDeltaSeconds,
      () => !this.state.paused && this.state.generation === startGen
    );
  }

  advanceTimestamp(timestampMs: number): AdvanceResult {
    const startGen = this.state.generation;
    return this.clock.advanceTimestamp(
      timestampMs,
      () => !this.state.paused && this.state.generation === startGen
    );
  }

  suspend(): void {
    this.clock.suspend();
  }

  visible(): void {
    this.clock.visible();
  }

  private onBeforeTickStep(): void {
    this.beforeStepHook?.(this.state.tickIndex);
  }

  private stepFixedTick(h: number): void {
    // 1. Advance auto controller if active and running
    if (this.state.mode === 'auto') {
      if (this.state.autoDriveEnabled && !this.state.paused) {
        this.state.omegaRod = AUTO_LEVEL_SPEEDS[this.state.autoLevel];
        const nextPose = this.autoController.step(h, this.state.autoLevel, this.state.rod.tipY);
        this.state.rod.x = nextPose.x;
        this.state.rod.z = nextPose.z;
        this.state.rod.radius = nextPose.radius;
        this.state.rod.theta = nextPose.theta;
      } else {
        this.state.omegaRod = 0;
      }
    } else {
      if (this.state.paused) {
        this.state.omegaRod = 0;
      }
      // When not paused and mode !== 'auto', preserve this.state.omegaRod (test seam / manual)
    }

    // 2. Geometry and contact
    const rhoO = 0.9;
    const phases: PhaseMasses = {
      Wml: this.state.mass.W,
      Oml: this.state.mass.Ot / rhoO,
      Gt: this.state.mass.Gt,
      Gu: this.state.mass.Gu,
      Gd: this.state.mass.Gd,
      fGu: this.state.fGu,
      St: this.state.mass.St,
      Sb: this.state.mass.Sb,
      Ss: this.state.mass.Ss,
      Ot: this.state.mass.Ot,
      Ol: this.state.mass.Ol,
      Od: this.state.mass.Od,
    };
    const regions = computeBeakerRegions(phases);
    this.state.rod.tipY = computeTipY(regions.bed.top);
    const contact = computeMechanicalContact(regions, this.state.rod.tipY);
    const hasCarrier = phases.Wml + phases.Oml > 0;

    // 3. Stirring flow model
    const flowResult = stepStirringFlow({
      omegaFlow: this.state.omegaFlow,
      omegaRod: this.state.omegaRod,
      contact,
      radius: this.state.rod.radius,
      hasCarrier,
      h,
    });

    this.state.omegaDrive = flowResult.omegaDrive;
    this.state.omegaFlow = flowResult.omegaFlow;

    // 4. Dissolution model (SCIENTIFIC_SPEC §5.2 & §7)
    stepDissolution(this.state, {
      intensity: flowResult.intensity,
      h,
    });

    // 5. Sand suspension/sedimentation and fGu kinetics (SCIENTIFIC_SPEC §4.2, §5.3, §7)
    stepSandSuspension(this.state, {
      intensity: flowResult.intensity,
      h,
    });

    // 6. Oil droplets dispersion and separation (SCIENTIFIC_SPEC §5.4, §7)
    stepOilSeparation(this.state, {
      intensity: flowResult.intensity,
      h,
    });

    // 7. Update regions, rod tip height and reconcile particle pools
    const nextRegions = this.recalculateGeometryAndConstraints();

    // 8. Fixed-step particle transport integration (SCIENTIFIC_SPEC §9)
    this.transport.step(
      h,
      this.state.omegaFlow,
      flowResult.intensity,
      this.state.elapsedSeconds,
      nextRegions.category
    );

    // 9. Invariants and tick/time/version
    this.state.tickIndex++;
    this.state.elapsedSeconds = this.state.tickIndex * h;
    this.state.stateVersion++;

    assertMassInvariants(this.state, {
      generation: this.state.generation,
      tickIndex: this.state.tickIndex,
      stateVersion: this.state.stateVersion,
      stage: 'stepFixedTick',
    });
  }

  /**
   * Synchronous command dispatch according to SCIENTIFIC_SPEC §2 & §3.
   */
  dispatch(command: Command): Ack {
    // 1. Envelope & Client Validation
    if (command === null || typeof command !== 'object') {
      return this.rejectMalformed(command, 'MALFORMED_ENVELOPE');
    }
    if (typeof command.clientId !== 'string' || command.clientId.trim() === '') {
      return this.rejectMalformed(command, 'MALFORMED_ENVELOPE');
    }
    if (command.clientId !== this.clientId) {
      return this.rejectMalformed(command, 'MALFORMED_ENVELOPE');
    }
    if (
      typeof command.seq !== 'number' ||
      !Number.isInteger(command.seq) ||
      command.seq < 1 ||
      command.seq > Number.MAX_SAFE_INTEGER
    ) {
      return this.rejectMalformed(command, 'MALFORMED_ENVELOPE');
    }
    if (
      typeof command.expectedGeneration !== 'number' ||
      !Number.isInteger(command.expectedGeneration) ||
      command.expectedGeneration < 0
    ) {
      return this.rejectMalformed(command, 'MALFORMED_ENVELOPE');
    }
    if (
      command.payload === null ||
      typeof command.payload !== 'object' ||
      typeof command.payload.type !== 'string'
    ) {
      return this.rejectMalformed(command, 'MALFORMED_ENVELOPE');
    }

    const expectedSeq = this.highWaterSeq + 1;

    // 2. Dedup & Sequence Ordering Check (BEFORE Generation Check to handle replay of old resets)
    if (command.seq <= this.highWaterSeq) {
      const cached = this.getCachedAck(command.seq);
      const payloadFingerprint = canonicalFingerprint(command.payload);

      if (cached) {
        if (cached.fingerprint === payloadFingerprint) {
          // Idempotent duplicate: return original ack with duplicate = true
          return {
            ...cached.ack,
            duplicate: true,
          };
        }
        // Sequence ID reused with different payload
        return {
          clientId: this.clientId,
          seq: command.seq,
          accepted: false,
          duplicate: false,
          reason: 'ID_REUSED',
          generation: this.state.generation,
          stateVersion: this.state.stateVersion,
          appliedAtTick: this.state.tickIndex,
          controlOrdinal: null,
        };
      }

      // Past sequence ID that has been evicted from the 256-entry LRU cache
      return {
        clientId: this.clientId,
        seq: command.seq,
        accepted: false,
        duplicate: false,
        reason: 'DUPLICATE_EXPIRED',
        generation: this.state.generation,
        stateVersion: this.state.stateVersion,
        appliedAtTick: this.state.tickIndex,
        controlOrdinal: null,
      };
    }

    if (command.seq > expectedSeq) {
      // Future sequence ID: out-of-order, do not consume
      return {
        clientId: this.clientId,
        seq: command.seq,
        accepted: false,
        duplicate: false,
        reason: 'OUT_OF_ORDER',
        generation: this.state.generation,
        stateVersion: this.state.stateVersion,
        appliedAtTick: this.state.tickIndex,
        controlOrdinal: null,
      };
    }

    // 3. New sequence ID (command.seq === expectedSeq): consumed by engine
    const appliedAtTick = this.state.tickIndex;

    // Generation Check
    if (command.expectedGeneration !== this.state.generation) {
      return this.rejectConsumed(command, 'STALE_GENERATION', appliedAtTick);
    }

    // 4. Payload Validation & Atomic Execution
    const payload = command.payload;

    switch (payload.type) {
      case 'add': {
        const { ingredient, deciTicks } = payload;
        if (!['water', 'oil', 'sugar', 'sand'].includes(ingredient)) {
          return this.rejectConsumed(command, 'INVALID_PAYLOAD', appliedAtTick);
        }
        if (typeof deciTicks !== 'number' || !Number.isSafeInteger(deciTicks) || deciTicks < 1) {
          return this.rejectConsumed(command, 'INVALID_PAYLOAD', appliedAtTick);
        }

        if (deciTicks > MAX_ADDITION_DECI_TICKS[ingredient]) {
          return this.rejectConsumed(command, 'EXCEEDS_MAX_ADDITION', appliedAtTick);
        }

        // Capacity check using latest state
        const projectedInput = { ...this.state.input };
        projectedInput[ingredient] += deciTicks;
        const milliMl =
          projectedInput.water * VISUAL_MILLI_ML_PER_TICK.water +
          projectedInput.oil * VISUAL_MILLI_ML_PER_TICK.oil +
          projectedInput.sugar * VISUAL_MILLI_ML_PER_TICK.sugar +
          projectedInput.sand * VISUAL_MILLI_ML_PER_TICK.sand;

        if (milliMl > CAPACITY_MILLI_ML) {
          return this.rejectConsumed(command, 'CAPACITY_EXCEEDED', appliedAtTick);
        }

        // Commit Add
        this.state.input[ingredient] += deciTicks;
        const delta = deciTicks / 10;

        if (ingredient === 'water') {
          this.state.mass.W += delta; // 1 ml water = 1.0 g
        } else if (ingredient === 'sugar') {
          const oldGu = this.state.mass.Gu;
          const oldSuspended = oldGu * this.state.fGu;
          this.state.mass.Gt += delta;
          this.state.mass.Gu += delta;
          this.state.fGu = this.state.mass.Gu > 0 ? oldSuspended / this.state.mass.Gu : 0;
        } else if (ingredient === 'sand') {
          this.state.mass.St += delta;
          this.state.mass.Sb += delta;
        } else if (ingredient === 'oil') {
          const deltaMass = delta * 0.9; // 1 ml oil = 0.9 g
          this.state.mass.Ot += deltaMass;
          this.state.mass.Ol += deltaMass;
        }

        this.recalculateGeometryAndConstraints();
        this.state.stateVersion++;
        assertMassInvariants(this.state, {
          generation: this.state.generation,
          tickIndex: this.state.tickIndex,
          stateVersion: this.state.stateVersion,
          stage: 'dispatch:add',
        });
        return this.acceptConsumed(command, appliedAtTick);
      }

      case 'reset': {
        let newSeed = DEFAULT_SEED;
        if (payload.seed !== undefined) {
          if (
            typeof payload.seed !== 'number' ||
            !Number.isInteger(payload.seed) ||
            payload.seed < 0 ||
            payload.seed > 0xffffffff
          ) {
            return this.rejectConsumed(command, 'INVALID_SEED', appliedAtTick);
          }
          newSeed = normalizeSeed(payload.seed);
        }

        // Commit Reset: increment generation, reset material state, keep transport-control metadata
        this.state.generation++;
        this.state.stateVersion++;
        this.state.tickIndex = 0;
        this.state.elapsedSeconds = 0;
        this.state.seed = newSeed;
        this.state.paused = true;
        this.state.mode = 'observe';
        this.state.autoDriveEnabled = false;
        this.state.autoLevel = 'slow';
        this.state.input = { water: 0, oil: 0, sugar: 0, sand: 0 };
        this.state.mass = {
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
        };
        this.state.fGu = 0;
        this.state.rod = {
          x: 0.3,
          z: 0,
          tipY: computeTipY(BEAKER_BASE_Y),
          theta: 0,
          radius: 0.3,
        };
        this.state.omegaRod = 0;
        this.state.omegaDrive = 0;
        this.state.omegaFlow = 0;
        this.autoController.resetToPose(this.state.rod);
        this.transport.reset();
        this.recalculateGeometryAndConstraints();

        this.clock.reset();
        assertMassInvariants(this.state, {
          generation: this.state.generation,
          tickIndex: this.state.tickIndex,
          stateVersion: this.state.stateVersion,
          stage: 'dispatch:reset',
        });

        return this.acceptConsumed(command, appliedAtTick);
      }

      case 'pause': {
        this.state.paused = true;
        this.state.omegaRod = 0;
        this.state.omegaDrive = 0;
        this.clock.onPause();
        // NOTE: autoDriveEnabled is preserved so resume can restore auto configuration
        this.state.stateVersion++;
        return this.acceptConsumed(command, appliedAtTick);
      }

      case 'resume': {
        this.state.paused = false;
        this.clock.onResume();
        if (this.state.mode === 'auto' && this.state.autoDriveEnabled) {
          this.state.omegaRod = AUTO_LEVEL_SPEEDS[this.state.autoLevel];
        }
        this.state.stateVersion++;
        return this.acceptConsumed(command, appliedAtTick);
      }

      case 'releaseDrive': {
        this.state.autoDriveEnabled = false;
        this.state.omegaRod = 0;
        this.state.omegaDrive = 0;
        this.autoController.stop();
        this.state.stateVersion++;
        return this.acceptConsumed(command, appliedAtTick);
      }

      case 'setMode': {
        const mode = payload.mode as Mode;
        if (!['observe', 'auto', 'manual'].includes(mode)) {
          return this.rejectConsumed(command, 'INVALID_PAYLOAD', appliedAtTick);
        }
        this.state.mode = mode;
        if (mode === 'auto') {
          this.state.autoDriveEnabled = true;
          this.autoController.start(this.state.rod, this.state.autoLevel);
          if (!this.state.paused) {
            this.state.omegaRod = AUTO_LEVEL_SPEEDS[this.state.autoLevel];
          } else {
            this.state.omegaRod = 0;
          }
        } else {
          this.state.autoDriveEnabled = false;
          this.state.omegaRod = 0;
          this.state.omegaDrive = 0;
          this.autoController.stop();
        }
        this.state.stateVersion++;
        return this.acceptConsumed(command, appliedAtTick);
      }

      case 'setAutoLevel': {
        const level = payload.level as AutoLevel;
        if (!['slow', 'medium', 'fast'].includes(level)) {
          return this.rejectConsumed(command, 'INVALID_PAYLOAD', appliedAtTick);
        }
        this.state.autoLevel = level;
        if (this.state.mode === 'auto' && this.state.autoDriveEnabled && !this.state.paused) {
          this.state.omegaRod = AUTO_LEVEL_SPEEDS[level];
        }
        this.state.stateVersion++;
        return this.acceptConsumed(command, appliedAtTick);
      }

      case 'manualSample': {
        if (typeof payload.captureGeneration !== 'number' || payload.captureGeneration !== this.state.generation) {
          return this.rejectConsumed(command, 'STALE_GENERATION', appliedAtTick);
        }
        if (
          typeof payload.x !== 'number' ||
          !Number.isFinite(payload.x) ||
          typeof payload.z !== 'number' ||
          !Number.isFinite(payload.z) ||
          typeof payload.inputTimeMs !== 'number' ||
          !Number.isFinite(payload.inputTimeMs) ||
          payload.inputTimeMs < 0 ||
          (payload.omegaRod !== undefined && (typeof payload.omegaRod !== 'number' || !Number.isFinite(payload.omegaRod))) ||
          'omega' in (payload as unknown as Record<string, unknown>)
        ) {
          return this.rejectConsumed(command, 'INVALID_PAYLOAD', appliedAtTick);
        }

        const clamped = clampSpoonXZ(payload.x, payload.z);
        this.state.rod.x = clamped.x;
        this.state.rod.z = clamped.z;
        this.state.rod.radius = Math.hypot(clamped.x, clamped.z);
        if (this.state.rod.radius >= 1e-6) {
          this.state.rod.theta = Math.atan2(clamped.z, clamped.x);
        }
        if (payload.omegaRod !== undefined) {
          this.state.omegaRod = Math.min(8, Math.max(-8, payload.omegaRod));
        }
        this.state.stateVersion++;
        return this.acceptConsumed(command, appliedAtTick);
      }

      default:
        return this.rejectConsumed(command, 'INVALID_PAYLOAD', appliedAtTick);
    }
  }

  /**
   * Publishes a detached, deep-copied ScalarSnapshot according to SCIENTIFIC_SPEC §2 & §8.
   */
  snapshot(): ScalarSnapshot {
    const rhoO = 0.9;
    const phases: PhaseMasses = {
      Wml: this.state.mass.W,
      Oml: this.state.mass.Ot / rhoO,
      Gt: this.state.mass.Gt,
      Gu: this.state.mass.Gu,
      Gd: this.state.mass.Gd,
      fGu: this.state.fGu,
      St: this.state.mass.St,
      Sb: this.state.mass.Sb,
      Ss: this.state.mass.Ss,
      Ot: this.state.mass.Ot,
      Ol: this.state.mass.Ol,
      Od: this.state.mass.Od,
    };

    const regions = computeBeakerRegions(phases);
    const contact = computeMechanicalContact(regions, this.state.rod.tipY);
    const intensity = computeFlowIntensity(this.state.omegaFlow);

    const capacityG = computeWaterCapacityG(this.state.mass.W);
    const saturationRatio = computeSaturationRatio(this.state.mass.Gd, capacityG, this.state.mass.W);
    const dissolutionProgress = computeDissolutionProgress(
      this.state.mass.Gd,
      this.state.mass.Gt,
      capacityG,
      this.state.mass.W
    );

    // Freeze detached copies in development/testing to catch accidental mutations
    const snapshotObj = Object.freeze({
      generation: this.state.generation,
      stateVersion: this.state.stateVersion,
      tickIndex: this.state.tickIndex,
      elapsedSeconds: this.state.elapsedSeconds,
      paused: this.state.paused,
      mode: this.state.mode,
      autoDriveEnabled: this.state.autoDriveEnabled,
      autoLevel: this.state.autoLevel,
      input: Object.freeze({ ...this.state.input }),
      mass: Object.freeze({ ...this.state.mass }),
      fGu: this.state.fGu,
      rod: Object.freeze({ ...this.state.rod }),
      intensity,
      contact,
      capacityG,
      saturationRatio,
      dissolutionProgress,
    });

    return snapshotObj as ScalarSnapshot;
  }

  copyRenderFrame(target: RenderTarget): RenderStamp {
    return this.transport.copyRenderFrame(
      target,
      this.state.generation,
      this.state.stateVersion
    );
  }

  getParticleBudget(): number {
    return this.transport.getBudgetPerPool();
  }

  setParticleBudget(budget: number): void {
    const rhoO = 0.9;
    const phases: PhaseMasses = {
      Wml: this.state.mass.W,
      Oml: this.state.mass.Ot / rhoO,
      Gt: this.state.mass.Gt,
      Gu: this.state.mass.Gu,
      Gd: this.state.mass.Gd,
      fGu: this.state.fGu,
      St: this.state.mass.St,
      Sb: this.state.mass.Sb,
      Ss: this.state.mass.Ss,
      Ot: this.state.mass.Ot,
      Ol: this.state.mass.Ol,
      Od: this.state.mass.Od,
    };
    const regions = computeBeakerRegions(phases);
    this.transport.setBudgetPerPool(
      budget,
      this.state.mass,
      this.state.fGu,
      regions,
      this.state.seed,
      this.state.generation
    );
  }

  getTransport(): ParticleTransportSystem {
    return this.transport;
  }

  private recalculateGeometryAndConstraints(): BeakerRegions {
    const rhoO = 0.9;
    const phases: PhaseMasses = {
      Wml: this.state.mass.W,
      Oml: this.state.mass.Ot / rhoO,
      Gt: this.state.mass.Gt,
      Gu: this.state.mass.Gu,
      Gd: this.state.mass.Gd,
      fGu: this.state.fGu,
      St: this.state.mass.St,
      Sb: this.state.mass.Sb,
      Ss: this.state.mass.Ss,
      Ot: this.state.mass.Ot,
      Ol: this.state.mass.Ol,
      Od: this.state.mass.Od,
    };
    const regions = computeBeakerRegions(phases);
    this.state.rod.tipY = computeTipY(regions.bed.top);
    this.transport.reconcile(
      this.state.mass,
      this.state.fGu,
      regions,
      this.state.seed,
      this.state.generation
    );
    return regions;
  }

  private rejectMalformed(command: unknown, reason: RejectionReason): Ack {
    const cmd = command as Record<string, unknown> | null;
    return {
      clientId: typeof cmd?.clientId === 'string' ? cmd.clientId : this.clientId,
      seq: typeof cmd?.seq === 'number' ? cmd.seq : 0,
      accepted: false,
      duplicate: false,
      reason,
      generation: this.state.generation,
      stateVersion: this.state.stateVersion,
      appliedAtTick: this.state.tickIndex,
      controlOrdinal: null,
    };
  }

  private rejectConsumed(command: Command, reason: RejectionReason, appliedAtTick: number): Ack {
    this.highWaterSeq = command.seq;
    const ack: Ack = {
      clientId: this.clientId,
      seq: command.seq,
      accepted: false,
      duplicate: false,
      reason,
      generation: this.state.generation,
      stateVersion: this.state.stateVersion,
      appliedAtTick,
      controlOrdinal: command.seq,
    };
    this.putCachedAck(command.seq, ack, canonicalFingerprint(command.payload));
    return ack;
  }

  private acceptConsumed(command: Command, appliedAtTick: number): Ack {
    this.highWaterSeq = command.seq;
    const ack: Ack = {
      clientId: this.clientId,
      seq: command.seq,
      accepted: true,
      duplicate: false,
      reason: null,
      generation: this.state.generation,
      stateVersion: this.state.stateVersion,
      appliedAtTick,
      controlOrdinal: command.seq,
    };
    this.putCachedAck(command.seq, ack, canonicalFingerprint(command.payload));
    return ack;
  }

  private getCachedAck(seq: number): CachedAckEntry | undefined {
    const entry = this.ackCache.get(seq);
    if (entry) {
      // Refresh LRU order
      this.ackCache.delete(seq);
      this.ackCache.set(seq, entry);
    }
    return entry;
  }

  private putCachedAck(seq: number, ack: Ack, fingerprint: string): void {
    if (this.ackCache.has(seq)) {
      this.ackCache.delete(seq);
    } else if (this.ackCache.size >= MAX_ACK_CACHE_SIZE) {
      // Evict oldest entry
      const oldestKey = this.ackCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.ackCache.delete(oldestKey);
      }
    }
    this.ackCache.set(seq, { ack, fingerprint });
  }
}

/**
 * HeadlessSimulationFacade
 * Binds expectedGeneration from the authoritative engine state at the exact moment
 * of intent dispatch, ensuring intents are not rejected due to stale UI snapshots.
 */
export class HeadlessSimulationFacade {
  constructor(private readonly engine: HeadlessSimulationEngine) {}

  dispatchIntent(payload: Intent): Ack {
    const command: Command = {
      clientId: this.engine.getClientId(),
      seq: this.engine.getNextSequence(),
      expectedGeneration: this.engine.getCurrentGeneration(),
      payload,
    };
    return this.engine.dispatch(command);
  }

  getEngine(): HeadlessSimulationEngine {
    return this.engine;
  }
}
