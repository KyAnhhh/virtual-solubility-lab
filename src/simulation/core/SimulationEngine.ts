import type { IngredientId } from '../../types/experiment';
import type {
  RenderStamp,
  RenderTarget,
  ScalarSnapshot,
  ScienceState,
} from './SimulationState';

export type Ingredient = IngredientId;
export type { IngredientId };
export type { ScienceMassCompartments, ScienceState, ScalarSnapshot, RodPose } from './SimulationState';

export type Mode = 'observe' | 'auto' | 'manual';
export type AutoLevel = 'slow' | 'medium' | 'fast';

export interface AddIntent {
  type: 'add';
  ingredient: Ingredient;
  deciTicks: number; // integer >= 1
  clientTimestamp?: number;
}

export interface ResetIntent {
  type: 'reset';
  seed?: number; // uint32
  clientTimestamp?: number;
}

export interface PauseIntent {
  type: 'pause';
  clientTimestamp?: number;
}

export interface ResumeIntent {
  type: 'resume';
  clientTimestamp?: number;
}

export interface ReleaseDriveIntent {
  type: 'releaseDrive';
  clientTimestamp?: number;
}

export interface SetModeIntent {
  type: 'setMode';
  mode: Mode;
  clientTimestamp?: number;
}

export interface SetAutoLevelIntent {
  type: 'setAutoLevel';
  level: AutoLevel;
  clientTimestamp?: number;
}

export interface ManualSampleIntent {
  type: 'manualSample';
  x: number;
  z: number;
  inputTimeMs: number;
  captureGeneration: number;
  omegaRod?: number;
  clientTimestamp?: number;
}

export type Intent =
  | AddIntent
  | ResetIntent
  | PauseIntent
  | ResumeIntent
  | ReleaseDriveIntent
  | SetModeIntent
  | SetAutoLevelIntent
  | ManualSampleIntent;

export interface Command {
  clientId: string;
  seq: number; // strictly monotonic integer per client session starting at 1
  expectedGeneration: number;
  payload: Intent;
}

export type RejectionReason =
  | 'STALE_GENERATION'
  | 'OUT_OF_ORDER'
  | 'ID_REUSED'
  | 'DUPLICATE_EXPIRED'
  | 'CAPACITY_EXCEEDED'
  | 'MALFORMED_ENVELOPE'
  | 'INVALID_PAYLOAD'
  | 'EXCEEDS_MAX_ADDITION'
  | 'INVALID_SEED'
  | 'CONTEXT_LOST';

export interface Ack {
  clientId: string;
  seq: number;
  accepted: boolean;
  duplicate: boolean;
  reason: RejectionReason | null;
  generation: number;
  stateVersion: number;
  appliedAtTick: number;
  controlOrdinal: number | null;
}

/**
 * SimulationEngine interface contract across Phase 2 and Phase 3:
 * - dispatch & snapshot: implemented in V2-01 (HeadlessSimulationEngine)
 * - advance: scheduled for V2-02 (Fixed timestep and accumulator)
 * - copyRenderFrame: scheduled for V3-05 (Particle pool and render copy)
 */
export interface SimulationEngine {
  dispatch(command: Command): Ack;
  advance(realDeltaSeconds: number): void;
  snapshot(): ScalarSnapshot;
  copyRenderFrame(target: RenderTarget): RenderStamp;

  // Optional backward compatibility methods and scalar accessors
  getState?(): Readonly<ScienceState>;
  getCurrentGeneration?(): number;
  isPaused?(): boolean;
  getMode?(): Mode;
  getTickIndex?(): number;
  getElapsedSeconds?(): number;
  getStateVersion?(): number;
  getOmegaRod?(): number;
  getOmegaFlow?(): number;
  getOmegaDrive?(): number;
  step?(deltaSeconds: number): void;
  reset?(): void;
}

export interface SimulationModel {
  update(state: Readonly<ScienceState>, deltaSeconds: number): ScienceState;
}

// Backward compatibility alias for legacy SimulationCommand
export type SimulationCommand =
  | Command
  | { type: 'add'; ingredient: IngredientId; amount: number }
  | { type: 'reset' }
  | { type: 'stir'; angularVelocity: number };

export {
  canonicalFingerprint,
  HeadlessSimulationEngine,
  HeadlessSimulationFacade,
  MAX_ACK_CACHE_SIZE,
  MAX_ADDITION_DECI_TICKS,
  type CommandEngineCore,
  type EngineOptions,
  type RenderPoseCapture,
} from './HeadlessSimulationEngine';

export {
  CLOCK_EPSILON,
  DEFAULT_H,
  DEFAULT_MAX_REAL_DELTA,
  DEFAULT_MAX_STEPS,
  SimulationClock,
  validateClockConfig,
  type AdvanceResult,
  type ReadonlyClock,
  type TimingDiagnostics,
} from './SimulationClock';

export {
  TickBoundaryReplayHarness,
  type ReplayOptions,
  type ReplayReport,
  type TraceItem,
} from './ReplayHarness';

export {
  A_STIR,
  B_STIR,
  FLOW_LAMBDA,
  FLOW_NORMALIZATION_RAD_PER_SEC,
  MAX_ROD_SPEED_RAD_PER_SEC,
  DEFAULT_ORBIT_RADIUS,
  RADIAL_COUPLING_NORMALIZATION,
  AUTO_LEVEL_SPEEDS,
} from '../constants/flow';

export {
  computeAnalyticFlow,
  computeDriveCoupling,
  computeFlowEquilibrium,
  computeFlowIntensity,
  computeFlowNext,
  computeRadialCoupling,
  DEFAULT_FLOW_CONFIG,
  stepStirringFlow,
  type FlowConfig,
  type StirringFlowModel,
  type StirringFlowStepInput,
  type StirringFlowStepOutput,
} from '../models/StirringFlow';

export {
  AutoStirController,
  RADIUS_TRANSITION_DURATION,
  smoothstep,
  computeRadiusTransition,
  type AutoStirControllerState,
} from '../../interactions/AutoStirController';

export {
  DENSITY_WATER,
  DENSITY_OIL,
  SOLUBILITY_SUGAR_20C,
  DISPLACEMENT_ML_PER_G_SUGAR,
  DISPLACEMENT_ML_PER_G_SAND,
  MAX_RESERVATION_MILLI_ML,
  MAX_BEAKER_CAPACITY_ML,
  epsilonMass,
  significanceThreshold,
  ticksToWaterMassG,
  ticksToOilMassG,
  ticksToSugarMassG,
  ticksToSandMassG,
  computeWaterCapacityG,
  DISSOLUTION_RATE_BASE,
  DISSOLUTION_RATE_STIRRED,
} from '../constants/science';

export {
  validateMassInvariants,
  assertMassInvariants,
  MassInvariantError,
  computePairedTransfer,
  applyPairedTransfer,
  type InvariantViolation,
  type InvariantContext,
  type MassInvariantValidationResult,
  type PhaseTransferPair,
  type TransferRequest,
  type TransferExecutionResult,
} from '../models/MassLedger';

export {
  computeDissolutionRate,
  computeDissolutionStep,
  stepDissolution,
  computeAnalyticDissolution,
  computeSaturationRatio,
  computeDissolutionProgress,
  isNearSaturation,
  hasExcessSugar,
  hasResidualSolidSugar,
  type DissolutionStepOptions,
  type DissolutionStepOutput,
} from '../models/Dissolution';

export {
  computeCarrierFractions,
  computeSuspensionRates,
  computeSandSuspensionStep,
  computeFGuStep,
  stepSandSuspension,
  computeAnalyticSandSuspension,
  computeAnalyticFGu,
  type SandStepOptions,
  type SandStepOutput,
  type AnalyticSandOptions,
} from '../models/SandSuspension';

export {
  computeOilCarrierFractions,
  computeOilRates,
  computeOilSeparationStep,
  stepOilSeparation,
  computeAnalyticOilSeparation,
  type OilStepOptions,
  type OilStepOutput,
  type AnalyticOilOptions,
} from '../models/OilSeparation';

export {
  ParticleTransportSystem,
  createParticlePool,
  computePoolBounds,
  getPoolPhaseMass,
  reconcilePool,
  stepPoolTransport,
  clampParticlePositionAndVelocity,
  computeHorizontalFalloff,
  computeTurbulentVerticalField,
  hash32,
  sampleUnitFloat,
  POOL_KINDS,
  POOL_MATERIAL,
  POOL_DISCRIMINATOR,
  DEFAULT_PARTICLE_BUDGET_PER_POOL,
  PARTICLE_RADIUS_OIL_DROPLET,
  TRANSPORT_DRAG,
  SETTLE_SPEED_WATER,
  SETTLE_SPEED_OIL,
  DROPLET_RISE_SPEED,
  type PoolKind,
  type ParticlePoolData,
} from '../models/ParticleTransport';

export {
  intersectRayHorizontalPlane,
  rayFromThreeRay,
  NEAR_PARALLEL_THRESHOLD,
  type Ray3D,
  type RayPlaneIntersection,
  type Vector3Tuple,
} from '../../interactions/RayPlaneProjection';

export {
  ManualStirController,
  type ManualStirControllerState,
  type StartDragParams,
  type OnPointerMoveParams,
  type DragStepResult,
} from '../../interactions/ManualStirController';

export {
  ManualStirAdapter,
  type ManualStirAdapterOptions,
  type AdapterPointerResult,
  type StaleCheckResult,
  type PointerCaptureTarget,
  type CameraControlTarget,
  type InteractionState,
  type PointerDownEventParams,
} from '../../interactions/ManualStirAdapter';

export {
  AngularVelocityEstimator,
  computeExponentialSmoothing,
  unwrapAngleDelta,
  MANUAL_DEADZONE_RADIUS,
  MANUAL_STALE_TIMEOUT_MS,
  MANUAL_MAX_SPEED_RAD_PER_SEC,
  MANUAL_FILTER_TAU_SECONDS,
  type EstimatorSnapshot,
  type EstimatorUpdateResult,
} from '../../interactions/AngularVelocityEstimator';
