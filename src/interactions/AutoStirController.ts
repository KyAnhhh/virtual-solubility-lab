import {
  AUTO_LEVEL_SPEEDS,
  DEFAULT_ORBIT_RADIUS,
} from '../simulation/constants/flow';
import { SPOON_MAX_RADIUS, SPOON_MIN_TIP_Y } from '../simulation/constants/beaker';
import type { AutoLevel } from '../simulation/core/SimulationEngine';
import type { RodPose } from '../simulation/core/SimulationState';

export const RADIUS_TRANSITION_DURATION = 0.25; // simulated seconds for smoothstep to 0.4

/**
 * Canonical smoothstep S(u) = u^2 * (3 - 2u) clamped to u in [0, 1].
 */
export function smoothstep(u: number): number {
  if (!Number.isFinite(u) || u <= 0) return 0;
  if (u >= 1) return 1;
  return u * u * (3 - 2 * u);
}

/**
 * Computes radius transition from r0 towards targetRadius using smoothstep.
 * Monotonic without overshoot; clamps within [0, SPOON_MAX_RADIUS].
 */
export function computeRadiusTransition(
  r0: number,
  elapsedSeconds: number,
  targetRadius = DEFAULT_ORBIT_RADIUS,
  duration = RADIUS_TRANSITION_DURATION
): number {
  if (!Number.isFinite(r0)) return targetRadius;
  const clampedR0 = Math.min(SPOON_MAX_RADIUS, Math.max(0, r0));
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return clampedR0;
  }
  const u = Math.min(1.0, Math.max(0.0, elapsedSeconds / duration));
  const s = smoothstep(u);
  const r = clampedR0 + (targetRadius - clampedR0) * s;
  return Math.min(SPOON_MAX_RADIUS, Math.max(0, r));
}

export interface AutoStirControllerState {
  isActive: boolean;
  activeLevel: AutoLevel;
  r0: number;
  theta0: number;
  transitionElapsed: number; // in simulated seconds
  currentRadius: number;
  currentTheta: number;
}

/**
 * AutoStirController
 * Headless controller for automatic stirring rod trajectory and prescribed speed levels.
 * Standard defined in SCIENTIFIC_SPEC §5.1, §6 & IMPLEMENTATION_TASKS V2-04.
 */
export class AutoStirController {
  private isActive = false;
  private r0 = 0;
  private theta0 = 0;
  private transitionElapsed = 0;
  private currentRadius = 0;
  private currentTheta = 0;
  private lastTipY = SPOON_MIN_TIP_Y;

  // Cache initial exact pose for t0 tolerance guarantees
  private initialX = 0;
  private initialZ = 0;
  private hasInitialExact = false;
  private activeLevel: AutoLevel = 'slow';

  constructor(initialPose?: Partial<RodPose>) {
    if (initialPose) {
      this.resetToPose(initialPose);
    }
  }

  getState(): Readonly<AutoStirControllerState> {
    return {
      isActive: this.isActive,
      activeLevel: this.activeLevel,
      r0: this.r0,
      theta0: this.theta0,
      transitionElapsed: this.transitionElapsed,
      currentRadius: this.currentRadius,
      currentTheta: this.currentTheta,
    };
  }

  isAutoActive(): boolean {
    return this.isActive;
  }

  /**
   * Activates auto mode preserving exact initial pose at t0 without teleporting.
   */
  start(initialPose: RodPose, level?: AutoLevel): void {
    this.isActive = true;
    if (level) {
      this.activeLevel = level;
    }

    const initialRadius = Number.isFinite(initialPose.radius)
      ? initialPose.radius
      : Math.hypot(initialPose.x, initialPose.z);

    this.r0 = Math.min(SPOON_MAX_RADIUS, Math.max(0, initialRadius));

    // Preserve theta if finite, otherwise derive from (x, z) or keep 0 at center
    if (Number.isFinite(initialPose.theta)) {
      this.theta0 = initialPose.theta;
    } else if (this.r0 > 1e-6) {
      this.theta0 = Math.atan2(initialPose.z, initialPose.x);
    } else {
      this.theta0 = 0;
    }

    this.transitionElapsed = 0;
    this.currentRadius = this.r0;
    this.currentTheta = this.theta0;

    if (Number.isFinite(initialPose.x) && Number.isFinite(initialPose.z)) {
      this.initialX = initialPose.x;
      this.initialZ = initialPose.z;
      this.hasInitialExact = true;
    } else {
      this.hasInitialExact = false;
    }

    if (Number.isFinite(initialPose.tipY)) {
      this.lastTipY = initialPose.tipY;
    }
  }

  stop(): void {
    this.isActive = false;
  }

  reset(): void {
    this.isActive = false;
    this.activeLevel = 'slow';
    this.r0 = 0;
    this.theta0 = 0;
    this.transitionElapsed = 0;
    this.currentRadius = 0;
    this.currentTheta = 0;
    this.lastTipY = SPOON_MIN_TIP_Y;
    this.initialX = 0;
    this.initialZ = 0;
    this.hasInitialExact = false;
  }

  resetToPose(pose: Partial<RodPose>): void {
    this.reset();
    if (Number.isFinite(pose.x) && Number.isFinite(pose.z)) {
      this.initialX = pose.x!;
      this.initialZ = pose.z!;
      this.currentRadius = Math.min(SPOON_MAX_RADIUS, Math.hypot(pose.x!, pose.z!));
      this.currentTheta = pose.theta ?? Math.atan2(pose.z!, pose.x!);
    }
    if (Number.isFinite(pose.tipY)) {
      this.lastTipY = pose.tipY!;
    }
  }

  /**
   * Advances the controller by simulated timestep h.
   * Only advances when active and h > 0.
   */
  step(h: number, level: AutoLevel, tipY: number): RodPose {
    if (Number.isFinite(tipY)) {
      this.lastTipY = tipY;
    }

    if (!Number.isFinite(h) || h <= 0 || !this.isActive) {
      return this.getPose(this.lastTipY);
    }

    // Once a step occurs, exact t0 cache is no longer used
    this.hasInitialExact = false;

    const speed = AUTO_LEVEL_SPEEDS[level] ?? AUTO_LEVEL_SPEEDS.slow;
    this.transitionElapsed += h;
    this.currentRadius = computeRadiusTransition(this.r0, this.transitionElapsed);
    this.currentTheta += speed * h;

    const x = this.currentRadius * Math.cos(this.currentTheta);
    const z = this.currentRadius * Math.sin(this.currentTheta);
    const radius = this.currentRadius;
    const theta = radius < 1e-6 ? this.currentTheta : Math.atan2(z, x);

    return {
      x,
      z,
      tipY: this.lastTipY,
      theta,
      radius,
    };
  }

  getPose(tipY?: number): RodPose {
    const y = tipY !== undefined && Number.isFinite(tipY) ? tipY : this.lastTipY;

    if (this.hasInitialExact && this.transitionElapsed === 0) {
      const radius = this.currentRadius;
      const theta = radius < 1e-6 ? this.currentTheta : Math.atan2(this.initialZ, this.initialX);
      return {
        x: this.initialX,
        z: this.initialZ,
        tipY: y,
        theta,
        radius,
      };
    }

    const x = this.currentRadius * Math.cos(this.currentTheta);
    const z = this.currentRadius * Math.sin(this.currentTheta);
    const radius = this.currentRadius;
    const theta = radius < 1e-6 ? this.currentTheta : Math.atan2(z, x);

    return {
      x,
      z,
      tipY: y,
      theta,
      radius,
    };
  }

  getOmegaRod(level?: AutoLevel): number {
    if (!this.isActive) return 0;
    const effective = level ?? this.activeLevel;
    return AUTO_LEVEL_SPEEDS[effective] ?? AUTO_LEVEL_SPEEDS.slow;
  }
}
