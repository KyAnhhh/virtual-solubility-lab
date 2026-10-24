import {
  type Ack,
  HeadlessSimulationEngine,
  HeadlessSimulationFacade,
  type Mode,
  type RodPose,
} from '../simulation/core/SimulationEngine';
import {
  ManualStirController,
} from './ManualStirController';
import {
  type Ray3D,
  rayFromThreeRay,
} from './RayPlaneProjection';

export interface PointerCaptureTarget {
  setPointerCapture: (pointerId: number) => void;
  releasePointerCapture: (pointerId: number) => void;
  hasPointerCapture?: (pointerId: number) => boolean;
}

export interface CameraControlTarget {
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
}

export type InteractionState = 'observe' | 'auto' | 'manual-idle' | 'manual-drag';

export interface PointerDownEventParams {
  pointerId: number;
  ray: Ray3D;
  pointerType?: string; // e.g. 'mouse', 'touch', 'pen'
  button?: number; // 0 is primary
  isHitSpoon?: boolean; // hit valid spoon geometry
  inputTimeMs?: number;
}

export interface ManualStirAdapterOptions {
  engine: HeadlessSimulationEngine;
  facade?: HeadlessSimulationFacade;
  controller?: ManualStirController;
  clientId?: string;
  now?: () => number;
  captureTarget?: PointerCaptureTarget;
  cameraTarget?: CameraControlTarget;
  getShowRod?: () => boolean;
}

export interface AdapterPointerResult {
  accepted: boolean;
  pose: RodPose;
  omega?: number;
  ack?: Ack;
}

export interface StaleCheckResult {
  released: boolean;
  ack?: Ack;
}

/**
 * ManualStirAdapter
 * Bridge adapter connecting pointer ray events to the headless simulation engine.
 * Responsibilities for V2-05, V2-06, V2-07:
 * - Pure adapter between Ray events (Three.js or numeric) and HeadlessSimulationEngine.
 * - Interaction state machine with 4 states: observe, auto, manual-idle, manual-drag.
 * - Single pointer owner: enforces active pointer lock and rejects second pointers.
 * - Camera ownership: disables OrbitControls during drag, restores camera on all exit paths.
 * - Pointer capture: captures pointer on valid down, idempotent release on all exits.
 * - Enforces scientific policies:
 *   1. When simulation is paused or suspended, pointermove events do NOT alter the authoritative scientific pose (SCIENTIFIC_SPEC §6).
 *   2. Stale captureGeneration (e.g. after simulation reset) is rejected.
 *   3. Mode guard: manual samples are only dispatched when in 'manual' mode.
 *   4. Angular velocity estimation: dispatches manualSample with canonical omegaRod, driving physical flow.
 *   5. Stale watchdog: host clock watchdog releases drive if pointer is held still for >= 150 ms without releasing capture or camera.
 *   6. Stale session guard: stale sessions cannot release drivers of auto mode or new generations.
 *   7. Rollback: rolls back candidate estimator history if command is rejected by engine or capture fails.
 *   8. All exit paths: up, cancel, lostcapture, blur, hidden, hideRod, pause, reset, mode change, unmount.
 */
export class ManualStirAdapter {
  private readonly engine: HeadlessSimulationEngine;
  private readonly facade: HeadlessSimulationFacade;
  private readonly controller: ManualStirController;
  private readonly now: () => number;

  private captureTarget?: PointerCaptureTarget;
  private cameraTarget?: CameraControlTarget;
  private getShowRod?: () => boolean;
  private getIsVesselDragging?: () => boolean;
  private capturedPointerId: number | null = null;
  private isCleaningUp = false;

  constructor(options: ManualStirAdapterOptions) {
    this.engine = options.engine;
    this.facade = options.facade ?? new HeadlessSimulationFacade(this.engine);
    this.controller = options.controller ?? new ManualStirController(this.engine.getRodPose());
    this.now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.captureTarget = options.captureTarget;
    this.cameraTarget = options.cameraTarget;
    this.getShowRod = options.getShowRod;
  }

  getController(): ManualStirController {
    return this.controller;
  }

  getEngine(): HeadlessSimulationEngine {
    return this.engine;
  }

  getFacade(): HeadlessSimulationFacade {
    return this.facade;
  }

  setCaptureTarget(target?: PointerCaptureTarget): void {
    this.captureTarget = target;
  }

  setCameraTarget(target?: CameraControlTarget): void {
    this.cameraTarget = target;
  }

  setGetShowRod(fn?: () => boolean): void {
    this.getShowRod = fn;
  }

  setGetIsVesselDragging(fn?: () => boolean): void {
    this.getIsVesselDragging = fn;
  }

  getCapturedPointerId(): number | null {
    return this.capturedPointerId;
  }

  getActivePointerId(): number | null {
    return this.capturedPointerId;
  }

  getInteractionState(): InteractionState {
    const mode = this.engine.getMode();
    if (mode === 'observe') return 'observe';
    if (mode === 'auto') return 'auto';
    return this.controller.isDragActive() ? 'manual-drag' : 'manual-idle';
  }

  isDragActive(): boolean {
    return this.controller.isDragActive();
  }

  isCameraLocked(): boolean {
    return this.controller.isDragActive() && (this.cameraTarget ? !this.cameraTarget.isEnabled() : true);
  }

  /**
   * Handles pointerdown event with full guard checks according to SCIENTIFIC_SPEC §6.
   * Supports both overload formats:
   * 1. onPointerDown(pointerId, ray, inputTimeMs)
   * 2. onPointerDown(params: PointerDownEventParams)
   */
  onPointerDown(
    pointerIdOrParams: number | PointerDownEventParams,
    rayArg?: Ray3D,
    inputTimeMsArg?: number
  ): AdapterPointerResult {
    let pointerId: number;
    let ray: Ray3D;
    let inputTimeMs: number | undefined;
    let pointerType: string | undefined;
    let button: number | undefined;
    let isHitSpoon: boolean | undefined;

    if (typeof pointerIdOrParams === 'number') {
      pointerId = pointerIdOrParams;
      ray = rayArg!;
      inputTimeMs = inputTimeMsArg;
    } else {
      pointerId = pointerIdOrParams.pointerId;
      ray = pointerIdOrParams.ray;
      inputTimeMs = pointerIdOrParams.inputTimeMs;
      pointerType = pointerIdOrParams.pointerType;
      button = pointerIdOrParams.button;
      isHitSpoon = pointerIdOrParams.isHitSpoon;
    }

    // 1. Guard: Only allow manual interaction when mode is manual
    if (this.engine.getMode() !== 'manual') {
      return { accepted: false, pose: this.engine.getRodPose(), omega: 0 };
    }

    // 2. Guard: Spoon must be visible
    if (this.getShowRod && !this.getShowRod()) {
      return { accepted: false, pose: this.engine.getRodPose(), omega: 0 };
    }

    // 3. Guard: Simulation must be running and not suspended
    if (this.engine.isPaused() || this.engine.getClock().getIsSuspended()) {
      return { accepted: false, pose: this.engine.getRodPose(), omega: 0 };
    }

    // 4. Guard: Pointer type must be mouse (touch/pen not allowed as manual driver)
    if (pointerType !== undefined && pointerType !== 'mouse') {
      return { accepted: false, pose: this.engine.getRodPose(), omega: 0 };
    }

    // 5. Guard: Mouse button must be primary (0)
    if (button !== undefined && button !== 0) {
      return { accepted: false, pose: this.engine.getRodPose(), omega: 0 };
    }

    // 6. Guard: Must hit valid spoon geometry
    if (isHitSpoon === false) {
      return { accepted: false, pose: this.engine.getRodPose(), omega: 0 };
    }

    // 7. Guard: Only one pointer owner (if already dragging, reject second pointer)
    if (this.controller.isDragActive()) {
      return { accepted: false, pose: this.engine.getRodPose(), omega: 0 };
    }

    // 8. Guard: Vessel dragging mutual exclusivity (cannot stir while pouring/dragging vessel)
    if (this.getIsVesselDragging && this.getIsVesselDragging()) {
      return { accepted: false, pose: this.engine.getRodPose(), omega: 0 };
    }

    const currentAuthoritativePose = this.engine.getRodPose();
    const timestamp = inputTimeMs ?? this.now();
    const currentGeneration = this.engine.getCurrentGeneration();

    const result = this.controller.startDrag({
      pointerId,
      ray,
      currentPose: currentAuthoritativePose,
      captureGeneration: currentGeneration,
      inputTimeMs: timestamp,
    });

    if (!result.accepted) {
      return { accepted: false, pose: currentAuthoritativePose, omega: 0 };
    }

    // 8. Disable camera controls before gesture starts
    this.cameraTarget?.setEnabled(false);

    // 9. Attempt pointer capture
    if (this.captureTarget) {
      try {
        this.captureTarget.setPointerCapture(pointerId);
        this.capturedPointerId = pointerId;
      } catch {
        // Capture failure rollback: restore camera, roll back controller, clear session
        this.cameraTarget?.setEnabled(true);
        this.controller.endDrag(pointerId);
        this.capturedPointerId = null;
        return { accepted: false, pose: currentAuthoritativePose, omega: 0 };
      }
    } else {
      this.capturedPointerId = pointerId;
    }

    // 10. Initial sample dispatch to commit pose at t0 with omegaRod = 0
    const ack = this.facade.dispatchIntent({
      type: 'manualSample',
      x: result.pose.x,
      z: result.pose.z,
      inputTimeMs: timestamp,
      captureGeneration: currentGeneration,
      omegaRod: 0,
    });

    if (!ack.accepted) {
      this.endManualDrag(pointerId);
      return { accepted: false, pose: currentAuthoritativePose, omega: 0, ack };
    }

    return {
      accepted: true,
      pose: result.pose,
      omega: 0,
      ack,
    };
  }

  /**
   * Handles pointermove event.
   * Enforces paused policy (no move when paused), generation fencing, bounds clamping,
   * angular velocity estimation, and rollback on engine rejection.
   */
  onPointerMove(pointerId: number, ray: Ray3D, inputTimeMs?: number): AdapterPointerResult {
    // 1. Policy check: When paused, move events do NOT alter scientific pose (SCIENTIFIC_SPEC §6)
    if (this.engine.isPaused()) {
      return { accepted: false, pose: this.engine.getRodPose(), omega: 0 };
    }

    // 2. Mode guard: Must be in manual mode
    if (this.engine.getMode() !== 'manual') {
      return { accepted: false, pose: this.engine.getRodPose(), omega: 0 };
    }

    // 3. Stale session guard: If engine generation advanced (e.g. reset), reject stale session and end drag
    const currentGeneration = this.engine.getCurrentGeneration();
    if (this.controller.getCaptureGeneration() !== currentGeneration) {
      this.endManualDrag(pointerId);
      return { accepted: false, pose: this.engine.getRodPose(), omega: 0 };
    }

    const prevPose = this.engine.getRodPose();
    const timestamp = inputTimeMs ?? this.now();

    // 4. Update controller candidate position and estimate angular velocity
    const currentTipY = prevPose.tipY;
    const result = this.controller.onPointerMove({
      pointerId,
      ray,
      currentTipY,
      inputTimeMs: timestamp,
    });

    if (!result.accepted) {
      return { accepted: false, pose: this.engine.getRodPose(), omega: this.controller.getOmega() };
    }

    // 5. Dispatch manualSample with canonical omegaRod to authoritative engine
    const ack = this.facade.dispatchIntent({
      type: 'manualSample',
      x: result.pose.x,
      z: result.pose.z,
      inputTimeMs: timestamp,
      captureGeneration: currentGeneration,
      omegaRod: result.omega,
    });

    // 6. Rollback candidate history if command was rejected by engine
    if (!ack.accepted) {
      this.controller.rollback(result.snapshot, prevPose);
      return {
        accepted: false,
        pose: this.engine.getRodPose(),
        omega: this.controller.getOmega(),
        ack,
      };
    }

    return {
      accepted: true,
      pose: this.engine.getRodPose(),
      omega: result.omega,
      ack,
    };
  }

  /**
   * Watchdog check: called by host clock scheduler to release drive when inactive for >= 150 ms.
   * NOTE: Stale watchdog dispatches releaseDrive, but DOES NOT release pointer capture or enable camera!
   * The user is still holding the mouse down on the spoon in 'manual-drag' state.
   */
  checkStale(nowMs?: number): StaleCheckResult {
    if (!this.controller.isDragActive()) {
      return { released: false };
    }

    if (this.engine.isPaused() || this.engine.getMode() !== 'manual') {
      return { released: false };
    }

    // Stale session guard: old generation cannot release new generation
    if (this.engine.getCurrentGeneration() !== this.controller.getCaptureGeneration()) {
      return { released: false };
    }

    const time = nowMs ?? this.now();
    const isStale = this.controller.checkStale(time);

    if (isStale) {
      const ack = this.facade.dispatchIntent({
        type: 'releaseDrive',
      });
      return { released: true, ack };
    }

    return { released: false };
  }

  /**
   * Comprehensive, idempotent exit path handler for all release/cancel/blur/lifecycle events.
   */
  endManualDrag(pointerId?: number): void {
    if (this.isCleaningUp) return;

    if (!this.controller.isDragActive()) {
      // Even if controller is not active, ensure camera is enabled and capture cleared if lingering
      if (this.capturedPointerId !== null && this.captureTarget) {
        try {
          if (!this.captureTarget.hasPointerCapture || this.captureTarget.hasPointerCapture(this.capturedPointerId)) {
            this.captureTarget.releasePointerCapture(this.capturedPointerId);
          }
        } catch {
          // ignore DOMException
        }
      }
      this.capturedPointerId = null;
      this.cameraTarget?.setEnabled(true);
      return;
    }

    // If pointerId specified, must match active pointer
    if (
      pointerId !== undefined &&
      this.controller.getActivePointerId() !== null &&
      pointerId !== this.controller.getActivePointerId()
    ) {
      return;
    }

    this.isCleaningUp = true;
    try {
      // 1. Release pointer capture
      if (this.captureTarget && this.capturedPointerId !== null) {
        try {
          if (!this.captureTarget.hasPointerCapture || this.captureTarget.hasPointerCapture(this.capturedPointerId)) {
            this.captureTarget.releasePointerCapture(this.capturedPointerId);
          }
        } catch {
          // ignore DOMException
        }
      }
      this.capturedPointerId = null;

      // 2. Restore camera controls
      this.cameraTarget?.setEnabled(true);

      const captureGen = this.controller.getCaptureGeneration();

      // 3. End drag in controller (clears drag offset and resets velocity estimator)
      this.controller.endDrag(pointerId);

      // 4. Release driver in engine if still in manual mode and matching generation
      if (this.engine.getMode() === 'manual' && this.engine.getCurrentGeneration() === captureGen) {
        this.facade.dispatchIntent({ type: 'releaseDrive' });
      }
    } finally {
      this.isCleaningUp = false;
    }
  }

  onPointerUp(pointerId?: number): void {
    this.endManualDrag(pointerId);
  }

  onPointerCancel(pointerId?: number): void {
    this.endManualDrag(pointerId);
  }

  onLostPointerCapture(pointerId?: number): void {
    this.endManualDrag(pointerId);
  }

  onWindowBlur(): void {
    this.endManualDrag();
  }

  onPageHidden(): void {
    this.endManualDrag();
  }

  onHideRod(): void {
    this.endManualDrag();
  }

  onPause(): void {
    this.endManualDrag();
  }

  onReset(): void {
    this.endManualDrag();
  }

  onModeChange(newMode?: Mode): void {
    void newMode;
    this.endManualDrag();
  }

  onContextLost(): void {
    this.endManualDrag();
  }

  detach(): void {
    this.endManualDrag();
  }

  /**
   * Resets adapter and underlying controller.
   */
  reset(): void {
    this.endManualDrag();
    this.controller.resetToPose(this.engine.getRodPose());
  }

  /**
   * Static helper to convert Three.js Ray to Ray3D.
   */
  static rayFromThree(threeRay: {
    origin: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number };
  }): Ray3D {
    return rayFromThreeRay(threeRay);
  }
}
