/**
 * AngularVelocityEstimator
 * Pure mathematical estimator for manual stirring rod angular velocity.
 * Implements angle unwrap across +-PI, first-order exponential smoothing (tau = 0.08 s),
 * maximum velocity cap (+-8 rad/s), deadzone clamping (radius < 0.0435 scene units),
 * sample gap re-anchoring (> 150 ms), and stale watchdog tracking.
 * Standard defined in SCIENTIFIC_SPEC §5.1, §6 & IMPLEMENTATION_TASKS V2-06.
 */

export const MANUAL_DEADZONE_RADIUS = 0.0435; // scene units (SCIENTIFIC_SPEC §6)
export const MANUAL_STALE_TIMEOUT_MS = 150;    // ms (SCIENTIFIC_SPEC §6)
export const MANUAL_MAX_SPEED_RAD_PER_SEC = 8.0; // rad/s (SCIENTIFIC_SPEC §5.1, §6)
export const MANUAL_FILTER_TAU_SECONDS = 0.08;   // seconds (SCIENTIFIC_SPEC §6)

export interface EstimatorSnapshot {
  hasAnchor: boolean;
  prevTheta: number | null;
  prevTimeMs: number | null;
  smoothedOmega: number;
  lastValidSampleTimeMs: number | null;
  inDeadzone: boolean;
  isStaleReleased: boolean;
}

export interface EstimatorUpdateResult {
  accepted: boolean;
  omega: number;
  isAnchor: boolean;
  inDeadzone: boolean;
}

/**
 * Pure function: unwraps the difference between two angles into (-PI, PI].
 * dTheta > 0 corresponds to motion from +X towards +Z.
 */
export function unwrapAngleDelta(thetaNow: number, thetaPrev: number): number {
  const dTheta = thetaNow - thetaPrev;
  return Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
}

/**
 * Pure function: first-order exponential smoothing.
 * alpha = 1 - exp(-dt / tau).
 * Returns omegaPrev if dtSeconds <= 0 or not finite.
 */
export function computeExponentialSmoothing(
  omegaPrev: number,
  omegaInput: number,
  dtSeconds: number,
  tau = MANUAL_FILTER_TAU_SECONDS
): number {
  if (dtSeconds <= 0 || !Number.isFinite(dtSeconds)) {
    return omegaPrev;
  }
  const alpha = 1.0 - Math.exp(-dtSeconds / tau);
  return omegaPrev + alpha * (omegaInput - omegaPrev);
}

export class AngularVelocityEstimator {
  private hasAnchor = false;
  private prevTheta: number | null = null;
  private prevTimeMs: number | null = null;
  private smoothedOmega = 0;
  private lastValidSampleTimeMs: number | null = null;
  private inDeadzone = false;
  private isStaleReleased = false;

  constructor() {
    this.reset();
  }

  getOmega(): number {
    return this.smoothedOmega;
  }

  getHasAnchor(): boolean {
    return this.hasAnchor;
  }

  isInDeadzone(): boolean {
    return this.inDeadzone;
  }

  getLastValidSampleTimeMs(): number | null {
    return this.lastValidSampleTimeMs;
  }

  getIsStaleReleased(): boolean {
    return this.isStaleReleased;
  }

  snapshot(): EstimatorSnapshot {
    return {
      hasAnchor: this.hasAnchor,
      prevTheta: this.prevTheta,
      prevTimeMs: this.prevTimeMs,
      smoothedOmega: this.smoothedOmega,
      lastValidSampleTimeMs: this.lastValidSampleTimeMs,
      inDeadzone: this.inDeadzone,
      isStaleReleased: this.isStaleReleased,
    };
  }

  rollback(snap: EstimatorSnapshot): void {
    this.hasAnchor = snap.hasAnchor;
    this.prevTheta = snap.prevTheta;
    this.prevTimeMs = snap.prevTimeMs;
    this.smoothedOmega = snap.smoothedOmega;
    this.lastValidSampleTimeMs = snap.lastValidSampleTimeMs;
    this.inDeadzone = snap.inDeadzone;
    this.isStaleReleased = snap.isStaleReleased;
  }

  reset(): void {
    this.hasAnchor = false;
    this.prevTheta = null;
    this.prevTimeMs = null;
    this.smoothedOmega = 0;
    this.lastValidSampleTimeMs = null;
    this.inDeadzone = false;
    this.isStaleReleased = false;
  }

  /**
   * Processes a candidate position sample and updates the estimated angular velocity.
   */
  update(x: number, z: number, theta: number, inputTimeMs: number): EstimatorUpdateResult {
    // 1. Validation
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      !Number.isFinite(theta) ||
      !Number.isFinite(inputTimeMs) ||
      inputTimeMs < 0
    ) {
      return {
        accepted: false,
        omega: this.smoothedOmega,
        isAnchor: false,
        inDeadzone: this.inDeadzone,
      };
    }

    const radius = Math.hypot(x, z);

    // 2. Deadzone handling (r < 0.0435)
    if (radius < MANUAL_DEADZONE_RADIUS) {
      this.inDeadzone = true;
      this.hasAnchor = false;
      this.prevTheta = null;
      this.prevTimeMs = null;
      this.smoothedOmega = 0;
      this.lastValidSampleTimeMs = inputTimeMs;
      this.isStaleReleased = false;
      return {
        accepted: true,
        omega: 0,
        isAnchor: false,
        inDeadzone: true,
      };
    }

    // 3. Exiting deadzone (was in deadzone, now outside)
    if (this.inDeadzone) {
      this.inDeadzone = false;
      this.hasAnchor = true;
      this.prevTheta = theta;
      this.prevTimeMs = inputTimeMs;
      this.lastValidSampleTimeMs = inputTimeMs;
      this.smoothedOmega = 0;
      this.isStaleReleased = false;
      return {
        accepted: true,
        omega: 0,
        isAnchor: true,
        inDeadzone: false,
      };
    }

    // 4. Initial anchor or re-anchor after stale release
    if (!this.hasAnchor || this.prevTimeMs === null || this.prevTheta === null) {
      this.hasAnchor = true;
      this.prevTheta = theta;
      this.prevTimeMs = inputTimeMs;
      this.lastValidSampleTimeMs = inputTimeMs;
      this.smoothedOmega = 0;
      this.isStaleReleased = false;
      return {
        accepted: true,
        omega: 0,
        isAnchor: true,
        inDeadzone: false,
      };
    }

    // 5. Delta time and out-of-order validation
    const dtMs = inputTimeMs - this.prevTimeMs;
    if (dtMs <= 0) {
      // dt <= 0 or out-of-order: drop sample without altering history or valid time
      return {
        accepted: false,
        omega: this.smoothedOmega,
        isAnchor: false,
        inDeadzone: false,
      };
    }

    // 6. Long gap re-anchoring (> 150 ms)
    if (dtMs > MANUAL_STALE_TIMEOUT_MS) {
      this.hasAnchor = true;
      this.prevTheta = theta;
      this.prevTimeMs = inputTimeMs;
      this.lastValidSampleTimeMs = inputTimeMs;
      this.smoothedOmega = 0;
      this.isStaleReleased = false;
      return {
        accepted: true,
        omega: 0,
        isAnchor: true,
        inDeadzone: false,
      };
    }

    // 7. Valid velocity inference
    const deltaTheta = unwrapAngleDelta(theta, this.prevTheta);
    const dtSeconds = dtMs / 1000.0;
    const omegaRaw = deltaTheta / dtSeconds;

    // Capping order according to SCIENTIFIC_SPEC:
    // a. Raw cap to prevent spike from contaminating filter
    const omegaRawCapped = Math.min(
      MANUAL_MAX_SPEED_RAD_PER_SEC,
      Math.max(-MANUAL_MAX_SPEED_RAD_PER_SEC, omegaRaw)
    );

    // b. First-order exponential smoothing with tau = 0.08 s
    const omegaFiltered = computeExponentialSmoothing(
      this.smoothedOmega,
      omegaRawCapped,
      dtSeconds,
      MANUAL_FILTER_TAU_SECONDS
    );

    // c. Output cap to strictly guarantee output within [-8, 8] rad/s
    const omegaOut = Math.min(
      MANUAL_MAX_SPEED_RAD_PER_SEC,
      Math.max(-MANUAL_MAX_SPEED_RAD_PER_SEC, omegaFiltered)
    );

    this.prevTheta = theta;
    this.prevTimeMs = inputTimeMs;
    this.lastValidSampleTimeMs = inputTimeMs;
    this.smoothedOmega = omegaOut;
    this.isStaleReleased = false;

    return {
      accepted: true,
      omega: omegaOut,
      isAnchor: false,
      inDeadzone: false,
    };
  }

  /**
   * Watchdog check: called by host clock scheduler to release drive when inactive for >= 150 ms.
   * Returns true if drive release was newly triggered.
   * Does NOT return true repeatedly if already released.
   */
  checkStale(nowMs: number): boolean {
    if (!Number.isFinite(nowMs)) {
      return false;
    }
    if (this.lastValidSampleTimeMs === null) {
      return false;
    }
    if (this.isStaleReleased) {
      return false;
    }

    const elapsedMs = nowMs - this.lastValidSampleTimeMs;
    if (elapsedMs >= MANUAL_STALE_TIMEOUT_MS) {
      this.isStaleReleased = true;
      this.hasAnchor = false;
      this.prevTheta = null;
      this.prevTimeMs = null;
      this.smoothedOmega = 0;
      return true;
    }

    return false;
  }
}
