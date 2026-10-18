import type { SimulationModel } from '../core/SimulationEngine';
import {
  A_STIR,
  B_STIR,
  FLOW_NORMALIZATION_RAD_PER_SEC,
  MAX_ROD_SPEED_RAD_PER_SEC,
  RADIAL_COUPLING_NORMALIZATION,
} from '../constants/flow';

export interface StirringFlowModel extends SimulationModel {
  readonly kind: 'stirring-flow';
}

export interface FlowConfig {
  a: number;
  b: number;
  normalization: number;
  maxRodSpeed: number;
}

export const DEFAULT_FLOW_CONFIG: FlowConfig = {
  a: A_STIR,
  b: B_STIR,
  normalization: FLOW_NORMALIZATION_RAD_PER_SEC,
  maxRodSpeed: MAX_ROD_SPEED_RAD_PER_SEC,
};

export interface StirringFlowStepInput {
  omegaFlow: number;
  omegaRod: number;
  contact: number;
  radius: number;
  hasCarrier: boolean;
  h: number;
  config?: Partial<FlowConfig>;
}

export interface StirringFlowStepOutput {
  omegaDrive: number;
  omegaFlow: number;
  intensity: number;
  contact: number;
  radialCoupling: number;
  omegaEq: number;
}

/**
 * Computes radial coupling according to SCIENTIFIC_SPEC §5.1:
 * radialCoupling = min(radius / 0.4, 1.0)
 * Returns 0 if radius <= 0 or not finite.
 */
export function computeRadialCoupling(radius: number): number {
  if (!Number.isFinite(radius) || radius <= 0) {
    return 0;
  }
  return Math.min(1.0, radius / RADIAL_COUPLING_NORMALIZATION);
}

/**
 * Computes drive coupling according to SCIENTIFIC_SPEC §5.1:
 * omegaDrive = contact * radialCoupling * omegaRod
 * Clamps contact to [0, 1], radialCoupling to [0, 1], omegaRod to [-maxRodSpeed, maxRodSpeed].
 */
export function computeDriveCoupling(
  contact: number,
  radialCoupling: number,
  omegaRod: number,
  maxRodSpeed = MAX_ROD_SPEED_RAD_PER_SEC
): number {
  if (!Number.isFinite(omegaRod) || !Number.isFinite(contact) || !Number.isFinite(radialCoupling)) {
    return 0;
  }
  const clampedContact = Math.min(1.0, Math.max(0.0, contact));
  const clampedCoupling = Math.min(1.0, Math.max(0.0, radialCoupling));
  const clampedRod = Math.min(maxRodSpeed, Math.max(-maxRodSpeed, omegaRod));
  return clampedContact * clampedCoupling * clampedRod;
}

/**
 * Computes asymptotic steady-state flow velocity:
 * omegaEq = (a / (a + b)) * omegaDrive
 * In case of a + b <= 0, returns 0.
 */
export function computeFlowEquilibrium(
  omegaDrive: number,
  a = A_STIR,
  b = B_STIR
): number {
  if (!Number.isFinite(omegaDrive) || !Number.isFinite(a) || !Number.isFinite(b)) {
    return 0;
  }
  const lambda = a + b;
  if (lambda <= 0) {
    return 0;
  }
  return (a / lambda) * omegaDrive;
}

/**
 * Computes next flow velocity over timestep h using exponential update:
 * omegaFlowNext = omegaEq + (omegaFlow - omegaEq) * exp(-(a + b) * h)
 * In case lambda <= 0, preserves omegaFlow (SPEC §5.1: no division by zero).
 */
export function computeFlowNext(
  omegaFlow: number,
  omegaDrive: number,
  h: number,
  a = A_STIR,
  b = B_STIR
): number {
  if (!Number.isFinite(omegaFlow) || !Number.isFinite(omegaDrive) || !Number.isFinite(h) || h < 0) {
    return Number.isFinite(omegaFlow) ? omegaFlow : 0;
  }
  const lambda = a + b;
  if (lambda <= 0) {
    return omegaFlow;
  }
  const omegaEq = (a / lambda) * omegaDrive;
  return omegaEq + (omegaFlow - omegaEq) * Math.exp(-lambda * h);
}

/**
 * Computes non-negative flow intensity normalized to [0, 1]:
 * intensity = clamp(|omegaFlow| / normalization, 0, 1)
 */
export function computeFlowIntensity(
  omegaFlow: number,
  normalization = FLOW_NORMALIZATION_RAD_PER_SEC
): number {
  if (!Number.isFinite(omegaFlow) || !Number.isFinite(normalization) || normalization <= 0) {
    return 0;
  }
  return Math.min(1.0, Math.max(0.0, Math.abs(omegaFlow) / normalization));
}

/**
 * Single fixed-step execution of the stirring flow model.
 * If no carrier exists (!hasCarrier), drive is 0 and flow is 0.
 */
export function stepStirringFlow(input: StirringFlowStepInput): StirringFlowStepOutput {
  const {
    omegaFlow,
    omegaRod,
    contact,
    radius,
    hasCarrier,
    h,
    config,
  } = input;

  const a = config?.a ?? A_STIR;
  const b = config?.b ?? B_STIR;
  const normalization = config?.normalization ?? FLOW_NORMALIZATION_RAD_PER_SEC;
  const maxRodSpeed = config?.maxRodSpeed ?? MAX_ROD_SPEED_RAD_PER_SEC;

  // Dry or no liquid carrier: drive is 0 and flow is 0 (SPEC §5.1)
  if (!hasCarrier) {
    return {
      omegaDrive: 0,
      omegaFlow: 0,
      intensity: 0,
      contact: 0,
      radialCoupling: 0,
      omegaEq: 0,
    };
  }

  const radialCoupling = computeRadialCoupling(radius);
  const omegaDrive = computeDriveCoupling(contact, radialCoupling, omegaRod, maxRodSpeed);
  const omegaEq = computeFlowEquilibrium(omegaDrive, a, b);
  const omegaFlowNext = computeFlowNext(omegaFlow, omegaDrive, h, a, b);
  const intensity = computeFlowIntensity(omegaFlowNext, normalization);

  return {
    omegaDrive,
    omegaFlow: omegaFlowNext,
    intensity,
    contact: Math.min(1.0, Math.max(0.0, contact)),
    radialCoupling,
    omegaEq,
  };
}

/**
 * Analytical closed-form solution at arbitrary continuous time t:
 * omegaFlow(t) = omegaEq + (initialFlow - omegaEq) * exp(-(a + b) * t)
 */
export function computeAnalyticFlow(
  t: number,
  initialFlow: number,
  drive: number,
  config?: Partial<FlowConfig>
): number {
  if (!Number.isFinite(t) || t < 0) return initialFlow;
  const a = config?.a ?? A_STIR;
  const b = config?.b ?? B_STIR;
  const lambda = a + b;
  if (lambda <= 0) return initialFlow;
  const omegaEq = (a / lambda) * drive;
  return omegaEq + (initialFlow - omegaEq) * Math.exp(-lambda * t);
}
