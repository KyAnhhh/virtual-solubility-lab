import {
  clampSpoonXZ,
  computeTipY,
  SPOON_MAX_RADIUS,
  SPOON_MIN_TIP_Y,
} from '../simulation/constants/beaker';
import type { RodPose } from '../simulation/core/SimulationState';
import {
  intersectRayHorizontalPlane,
  type Ray3D,
} from './RayPlaneProjection';
import {
  AngularVelocityEstimator,
  type EstimatorSnapshot,
} from './AngularVelocityEstimator';

export interface ManualStirControllerState {
  isActive: boolean;
  activePointerId: number | null;
  captureGeneration: number;
  planeY: number;
  dragOffset: { x: number; z: number };
  pose: RodPose;
  omega: number;
}

export interface StartDragParams {
  pointerId: number;
  ray: Ray3D;
  currentPose: RodPose;
  captureGeneration: number;
  inputTimeMs?: number;
}

export interface OnPointerMoveParams {
  pointerId: number;
  ray: Ray3D;
  currentTipY?: number;
  inputTimeMs?: number;
}

export interface DragStepResult {
  accepted: boolean;
  pose: RodPose;
  omega: number;
  isAnchor?: boolean;
  snapshot?: EstimatorSnapshot;
}

/**
 * ManualStirController
 * Headless controller for manual spoon positioning and angular velocity estimation.
 * Standard defined in SCIENTIFIC_SPEC §4–§6 & IMPLEMENTATION_TASKS V2-05, V2-06.
 *
 * Key guarantees:
 * - Pure mathematical ray-plane projection against a horizontal X/Z plane.
 * - Drag plane Y (planeY) is locked to current authoritative tipY at pointerdown and invariant during the drag.
 * - Pose continuity: drag offset (rodXZ - planePointXZ) is captured at pointerdown, preserving exact pose at t0 without jumping.
 * - Radial bounds clamping: candidate position (planePointXZ + dragOffset) clamped radially to r <= 0.74 scene units.
 * - At center (r < 1e-6), previous valid theta is preserved without producing NaN or divide-by-zero.
 * - Angular velocity inference: unwraps +-PI, exponential smoothing (tau = 0.08 s), capped at +-8 rad/s.
 * - Deadzone: r < 0.0435 resets velocity to 0 and clears angular history.
 * - Stale watchdog: gap > 150 ms re-anchors, watchdog releases drive after 150 ms.
 * - Rollback capability: restores estimator snapshot if command is rejected by engine.
 */
export class ManualStirController {
  private isActive = false;
  private activePointerId: number | null = null;
  private captureGeneration = 0;
  private planeY = SPOON_MIN_TIP_Y;
  private dragOffset = { x: 0, z: 0 };
  private currentPose: RodPose = {
    x: 0.3,
    z: 0,
    tipY: computeTipY(0.12),
    theta: 0,
    radius: 0.3,
  };
  private readonly estimator = new AngularVelocityEstimator();

  constructor(initialPose?: Partial<RodPose>) {
    if (initialPose) {
      this.resetToPose(initialPose);
    }
  }

  getState(): Readonly<ManualStirControllerState> {
    return {
      isActive: this.isActive,
      activePointerId: this.activePointerId,
      captureGeneration: this.captureGeneration,
      planeY: this.planeY,
      dragOffset: { ...this.dragOffset },
      pose: { ...this.currentPose },
      omega: this.estimator.getOmega(),
    };
  }

  isDragActive(): boolean {
    return this.isActive;
  }

  getActivePointerId(): number | null {
    return this.activePointerId;
  }

  getCaptureGeneration(): number {
    return this.captureGeneration;
  }

  getPlaneY(): number {
    return this.planeY;
  }

  getDragOffset(): { x: number; z: number } {
    return { ...this.dragOffset };
  }

  getPose(): RodPose {
    return { ...this.currentPose };
  }

  getOmega(): number {
    return this.estimator.getOmega();
  }

  getEstimator(): AngularVelocityEstimator {
    return this.estimator;
  }

  /**
   * Initiates a drag session on pointerdown.
   * Locks pointerId, captureGeneration, planeY, computes dragOffset, and establishes initial velocity anchor.
   */
  startDrag(params: StartDragParams): DragStepResult {
    // 1. If already active with another pointer, reject second pointer
    if (this.isActive && this.activePointerId !== null && this.activePointerId !== params.pointerId) {
      return { accepted: false, pose: { ...this.currentPose }, omega: this.estimator.getOmega() };
    }

    // 2. Validate current authoritative pose
    const { currentPose, pointerId, captureGeneration, ray, inputTimeMs } = params;
    if (
      !Number.isFinite(currentPose.x) ||
      !Number.isFinite(currentPose.z) ||
      !Number.isFinite(currentPose.tipY) ||
      !Number.isInteger(pointerId) ||
      !Number.isInteger(captureGeneration) ||
      captureGeneration < 0
    ) {
      return { accepted: false, pose: { ...this.currentPose }, omega: this.estimator.getOmega() };
    }

    // 3. Lock drag plane Y to authoritative tipY at pointerdown
    const lockedPlaneY = currentPose.tipY;

    // 4. Project ray onto locked plane
    const intersection = intersectRayHorizontalPlane(ray, lockedPlaneY);
    if (!intersection) {
      // Invalid sample drops without altering active session or pose
      return { accepted: false, pose: { ...this.currentPose }, omega: this.estimator.getOmega() };
    }

    const [px, , pz] = intersection.point;

    // 5. Establish drag offset: dragOffsetXZ = rodXZ - planePointXZ
    this.dragOffset = {
      x: currentPose.x - px,
      z: currentPose.z - pz,
    };

    // 6. Lock session parameters
    this.isActive = true;
    this.activePointerId = pointerId;
    this.captureGeneration = captureGeneration;
    this.planeY = lockedPlaneY;

    // Preserve exact authoritative pose at t0 (no jump)
    const initialRadius = Number.isFinite(currentPose.radius)
      ? currentPose.radius
      : Math.hypot(currentPose.x, currentPose.z);

    const initialTheta = Number.isFinite(currentPose.theta)
      ? currentPose.theta
      : (initialRadius >= 1e-6 ? Math.atan2(currentPose.z, currentPose.x) : 0);

    this.currentPose = {
      x: currentPose.x,
      z: currentPose.z,
      tipY: lockedPlaneY,
      theta: initialTheta,
      radius: Math.min(SPOON_MAX_RADIUS, Math.max(0, initialRadius)),
    };

    // 7. Initialize velocity estimator with initial anchor sample
    this.estimator.reset();
    if (inputTimeMs !== undefined && Number.isFinite(inputTimeMs)) {
      this.estimator.update(this.currentPose.x, this.currentPose.z, initialTheta, inputTimeMs);
    }

    return {
      accepted: true,
      pose: { ...this.currentPose },
      omega: 0,
      isAnchor: true,
      snapshot: this.estimator.snapshot(),
    };
  }

  /**
   * Processes pointermove within the current drag session.
   * Projects onto locked planeY, applies drag offset, clamps radially, and estimates angular velocity.
   */
  onPointerMove(params: OnPointerMoveParams): DragStepResult {
    // 1. Must be active
    if (!this.isActive) {
      return { accepted: false, pose: { ...this.currentPose }, omega: this.estimator.getOmega() };
    }

    // 2. Reject if event is from a different pointerId
    if (params.pointerId !== this.activePointerId) {
      return { accepted: false, pose: { ...this.currentPose }, omega: this.estimator.getOmega() };
    }

    // Take estimator snapshot for potential rollback
    const snap = this.estimator.snapshot();

    // 3. Project ray onto the locked planeY (planeY does not change during drag)
    const intersection = intersectRayHorizontalPlane(params.ray, this.planeY);
    if (!intersection) {
      // Invalid sample drops without altering pose, offset, active pointer, or session
      return { accepted: false, pose: { ...this.currentPose }, omega: this.estimator.getOmega() };
    }

    const [px, , pz] = intersection.point;

    // 4. Apply drag offset before clamping: candidateXZ = planePointXZ + dragOffsetXZ
    const candX = px + this.dragOffset.x;
    const candZ = pz + this.dragOffset.z;

    // 5. Clamping according to radial bounds (r <= 0.74)
    const clamped = clampSpoonXZ(candX, candZ);
    const radius = clamped.radius;

    // 6. Angular calculation: preserve previous theta at center (r < 1e-6)
    let theta: number;
    if (radius >= 1e-6) {
      theta = Math.atan2(clamped.z, clamped.x);
    } else {
      theta = this.currentPose.theta;
    }

    // 7. Estimate angular velocity if inputTimeMs provided
    let omega = 0;
    let isAnchor = false;
    if (params.inputTimeMs !== undefined && Number.isFinite(params.inputTimeMs)) {
      const estRes = this.estimator.update(clamped.x, clamped.z, theta, params.inputTimeMs);
      if (!estRes.accepted) {
        // e.g. dt <= 0 or out of order: drop sample without altering pose or estimator
        this.estimator.rollback(snap);
        return { accepted: false, pose: { ...this.currentPose }, omega: this.estimator.getOmega() };
      }
      omega = estRes.omega;
      isAnchor = estRes.isAnchor;
    }

    // 8. Rod tipY adapts according to authoritative bed/geometry if provided, otherwise preserves existing tipY
    const effectiveTipY =
      params.currentTipY !== undefined && Number.isFinite(params.currentTipY)
        ? params.currentTipY
        : this.currentPose.tipY;

    this.currentPose = {
      x: clamped.x,
      z: clamped.z,
      tipY: effectiveTipY,
      theta,
      radius,
    };

    return {
      accepted: true,
      pose: { ...this.currentPose },
      omega,
      isAnchor,
      snapshot: snap,
    };
  }

  /**
   * Rollback controller state to a prior snapshot if command is rejected.
   */
  rollback(snap?: EstimatorSnapshot, prevPose?: RodPose): void {
    if (snap) {
      this.estimator.rollback(snap);
    }
    if (prevPose) {
      this.currentPose = { ...prevPose };
    }
  }

  /**
   * Stale watchdog check: returns true if drive release was triggered.
   */
  checkStale(nowMs: number): boolean {
    if (!this.isActive) return false;
    return this.estimator.checkStale(nowMs);
  }

  /**
   * Ends the drag session. If pointerId is specified, only ends if it matches activePointerId.
   */
  endDrag(pointerId?: number): void {
    if (pointerId !== undefined && this.activePointerId !== null && pointerId !== this.activePointerId) {
      return;
    }
    this.isActive = false;
    this.activePointerId = null;
    this.dragOffset = { x: 0, z: 0 };
    this.estimator.reset();
  }

  /**
   * Resets the controller to initial idle state.
   */
  reset(): void {
    this.isActive = false;
    this.activePointerId = null;
    this.captureGeneration = 0;
    this.planeY = SPOON_MIN_TIP_Y;
    this.dragOffset = { x: 0, z: 0 };
    this.currentPose = {
      x: 0.3,
      z: 0,
      tipY: computeTipY(0.12),
      theta: 0,
      radius: 0.3,
    };
    this.estimator.reset();
  }

  /**
   * Resets the controller and initializes current pose.
   */
  resetToPose(pose: Partial<RodPose>): void {
    this.reset();
    const x = Number.isFinite(pose.x) ? pose.x! : 0.3;
    const z = Number.isFinite(pose.z) ? pose.z! : 0;
    const tipY = Number.isFinite(pose.tipY) ? pose.tipY! : computeTipY(0.12);
    const clamped = clampSpoonXZ(x, z);
    const radius = clamped.radius;
    const theta = Number.isFinite(pose.theta)
      ? pose.theta!
      : (radius >= 1e-6 ? Math.atan2(clamped.z, clamped.x) : 0);

    this.planeY = tipY;
    this.currentPose = {
      x: clamped.x,
      z: clamped.z,
      tipY,
      theta,
      radius,
    };
    this.estimator.reset();
  }
}
