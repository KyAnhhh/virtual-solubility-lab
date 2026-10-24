import { Plane, Vector3 } from 'three';
import type { IngredientId, PourMode } from '../types/experiment';
import {
  computeFreePourTransform,
  computeFreePourLiftTransform,
  FREE_POUR_LIFT_DURATION,
  isPointInDropZone,
  isVesselNearBeaker,
  isVesselTouchingBeaker,
  SPOUT_TARGET,
  BEAKER_CENTER,
  type VesselTransform,
} from '../scene/pouringAnimationMath';
import {
  FREE_POUR_RATES,
  formatDeciTicks,
  getAvailableCapacityTicks,
} from '../simulation/constants/ingredients';
import type { SimulationBridge } from '../simulation/bridge/SimulationBridge';

export interface PointerCaptureTarget {
  setPointerCapture: (pointerId: number) => void;
  releasePointerCapture: (pointerId: number) => void;
  hasPointerCapture?: (pointerId: number) => boolean;
}

export interface CameraControlTarget {
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
}

export interface VesselPourStoreTarget {
  pourMode?: PourMode;
  getPourMode?: () => PourMode;
  startVesselDrag: (id: IngredientId, pointerId: number, initialPos?: [number, number, number]) => { ok: boolean; reason?: string };
  updateVesselDragPos: (
    pos: [number, number, number],
    isInsideDropZone: boolean,
    isTouchingBeaker?: boolean,
    isNearBeaker?: boolean,
    freePourPhase?: 'dragging' | 'lifting' | 'pouring' | 'returning'
  ) => void;
  triggerContactPour?: (ingredient: IngredientId, contactPos: [number, number, number]) => boolean;
  updateFreePourStatus?: (totalAddedDeciTicks: number, isPouringStream: boolean) => void;
  endVesselDragDrop: (finalDropPos?: [number, number, number]) => boolean;
  cancelVesselDrag: (reason?: string) => void;
  setMessage?: (msg: string) => void;
  isPourRunning?: () => boolean;
}

export interface VesselPointerDownParams {
  ingredient: IngredientId;
  pointerId: number;
  pointerType?: string;
  button: number;
  hitPoint: Vector3;
  homePos: readonly [number, number, number];
  rayDirection?: Vector3;
  cameraDirection?: Vector3;
}

export interface RayLike {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
}

/** Canonical default camera constants matching LaboratoryScene.tsx */
export const DEFAULT_CAMERA_POS = new Vector3(3.9, 3.4, 5.5);
export const DEFAULT_CAMERA_TARGET = new Vector3(0, 1.25, 0);
export const DEFAULT_CAMERA_DIR = new Vector3()
  .subVectors(DEFAULT_CAMERA_TARGET, DEFAULT_CAMERA_POS)
  .normalize();

/**
 * Helper to construct perspective camera rays identical to runtime Three.js Raycaster.
 * Ray origin is at camera position, and direction points towards the target point in world space.
 */
export function createCameraRay(
  cameraPos: Vector3,
  targetPoint: { x: number; y: number; z: number }
): RayLike {
  const dir = new Vector3(
    targetPoint.x - cameraPos.x,
    targetPoint.y - cameraPos.y,
    targetPoint.z - cameraPos.z
  ).normalize();
  return {
    origin: { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z },
    direction: { x: dir.x, y: dir.y, z: dir.z },
  };
}

/** Declared presentation interruption threshold: terminates session if frame gap >300ms */
export const PRESENTATION_INTERRUPTION_THRESHOLD_MS = 300;
/** Cadence for batching continuous free pour additions to the authoritative engine */
export const FREE_POUR_CADENCE_MS = 100;
/** Duration to transition smoothly from upright drag to tilted spout pour pose */
export const TILT_TRANSITION_DURATION_S = 0.25;
/** Duration to transition smoothly back from pour pose to upright drag */
export const UNTILT_TRANSITION_DURATION_S = 0.20;

/**
 * VesselPourAdapter
 * Comprehensive controller managing 3D reagent vessels interaction across two distinct modes:
 * 1. "Rót theo lượng" (By Dose): Drag and drop vessel into beaker zone; single commit pour animation.
 * 2. "Rót tự do" (Free Pouring): Hold mouse while in drop zone; continuous 10Hz batch dispatch;
 *    halt stream when leaving zone or at capacity; final batch flush on normal release;
 *    zero rollback of accepted batches on cancel.
 *
 * Guarantees:
 * - Single pointer owner (rejects secondary pointers).
 * - Disables OrbitControls during vessel drag, re-enables on all exit paths.
 * - Idempotent cleanup with token fencing.
 * - Hysteresis drop zone detection (enter 0.45 / maintain 0.75).
 * - Zero cumulative transform drift.
 * - Un-snapped drag anchor evaluation for zone membership (prevents getting stuck).
 * - High-frequency drag position in adapter ref (no full React re-render per mousemove).
 */
export class VesselPourAdapter {
  private activePointerId: number | null = null;
  private draggedIngredient: IngredientId | null = null;
  private activeMode: PourMode = 'by_dose';
  private dragPlane: Plane = new Plane();
  private grabOffset: Vector3 = new Vector3();
  private dragPosition: [number, number, number] = [0, 0, 0];
  private homePosition: [number, number, number] = [0, 0, 0];
  private isInsideDropZone: boolean = false;
  private isTouchingBeaker: boolean = false;
  private isNearBeaker: boolean = false;
  private isContactLatched: boolean = false;
  private releasedNormally: boolean = false;
  private gestureToken: number = 0;

  // Camera ownership tracking
  private hasCameraControl: boolean = false;
  private previousCameraEnabled: boolean = true;

  // Free pour state
  private freePourPhase: 'dragging' | 'lifting' | 'pouring' | 'returning' = 'dragging';
  private freePourTiltProgress: number = 0; // 0 (upright) to 1.0 (fully tilted at spout)
  private accumulatedDeciTicks: number = 0;
  private totalAcceptedDeciTicks: number = 0;
  private lastBatchTimestamp: number = 0;
  private lastFrameTimestamp: number = 0;
  private isStreamActive: boolean = false;
  private isCapacityFull: boolean = false;
  private hasNotifiedCapacityFull: boolean = false;
  private acceptedAckSeqSet: Set<number> = new Set();
  private liftStartPos: [number, number, number] | null = null;
  private liftElapsedTime: number = 0;

  private captureTarget?: PointerCaptureTarget;
  private cameraTarget?: CameraControlTarget;
  private storeTarget?: VesselPourStoreTarget;
  private storeGetter?: () => VesselPourStoreTarget;
  private bridgeTarget?: SimulationBridge;
  private bridgeGetter?: () => SimulationBridge;

  setCaptureTarget(target?: PointerCaptureTarget): void {
    this.captureTarget = target;
  }

  setCameraTarget(target?: CameraControlTarget): void {
    this.cameraTarget = target;
  }

  setStoreTarget(target?: VesselPourStoreTarget): void {
    this.storeTarget = target;
  }

  setStoreGetter(getter?: () => VesselPourStoreTarget): void {
    this.storeGetter = getter;
  }

  setBridgeTarget(bridge?: SimulationBridge): void {
    this.bridgeTarget = bridge;
  }

  setBridgeGetter(getter?: () => SimulationBridge): void {
    this.bridgeGetter = getter;
  }

  private getStore(): VesselPourStoreTarget | undefined {
    if (this.storeTarget) return this.storeTarget;
    if (this.storeGetter) return this.storeGetter();
    return undefined;
  }

  private getBridge(): SimulationBridge | undefined {
    if (this.bridgeTarget) return this.bridgeTarget;
    if (this.bridgeGetter) return this.bridgeGetter();
    return undefined;
  }

  isDragging(): boolean {
    return this.activePointerId !== null;
  }

  isBusy(): boolean {
    return this.activePointerId !== null || Boolean(this.getStore()?.isPourRunning?.());
  }

  hasCameraOwnership(): boolean {
    return this.hasCameraControl;
  }

  getActivePointerId(): number | null {
    return this.activePointerId;
  }

  getDraggedIngredient(): IngredientId | null {
    return this.draggedIngredient;
  }

  getActiveMode(): PourMode {
    return this.activeMode;
  }

  getDragPosition(): [number, number, number] {
    return [...this.dragPosition];
  }

  getHomePosition(): [number, number, number] {
    return [...this.homePosition];
  }

  isPointInDropZoneStatus(): boolean {
    return this.isInsideDropZone;
  }

  isVesselTouching(): boolean {
    return this.isTouchingBeaker;
  }

  isVesselNear(): boolean {
    return this.isNearBeaker;
  }

  getFreePourPhase(): string {
    return this.freePourPhase;
  }

  isContactLatchedStatus(): boolean {
    return this.isContactLatched;
  }

  isStreamFlowing(): boolean {
    return this.isStreamActive;
  }

  isStreamActiveFor(id: IngredientId): boolean {
    return this.draggedIngredient === id && this.isStreamActive;
  }

  getFreePourTiltProgress(): number {
    return this.freePourTiltProgress;
  }

  getTotalAcceptedDeciTicks(): number {
    return this.totalAcceptedDeciTicks;
  }

  getTotalAcceptedAmount(): number {
    return this.totalAcceptedDeciTicks / 10;
  }

  getGestureToken(): number {
    return this.gestureToken;
  }

  /**
   * Evaluates available capacity in 500ml beaker for this ingredient from authoritative engine state.
   */
  getAvailableCapacity(ingredient: IngredientId): number {
    const bridge = this.getBridge();
    if (!bridge) return 0;
    const snap = bridge.getSnapshot();
    const currentTicks = {
      water: snap.input.water,
      sugar: snap.input.sugar,
      sand: snap.input.sand,
      oil: snap.input.oil,
    };
    return getAvailableCapacityTicks(ingredient, currentTicks);
  }

  onPointerDown(params: VesselPointerDownParams): { accepted: boolean; reason?: string } {
    // 1. Primary button (left click) and mouse pointer only
    if (params.button !== 0) {
      return { accepted: false, reason: 'NOT_PRIMARY_BUTTON' };
    }
    if (params.pointerType && params.pointerType !== 'mouse') {
      return { accepted: false, reason: 'ONLY_MOUSE_SUPPORTED' };
    }

    // 2. Reject if already dragging a vessel
    if (this.activePointerId !== null) {
      return { accepted: false, reason: 'ALREADY_DRAGGING' };
    }

    const bridge = this.getBridge();
    // 3. Mutual exclusivity: Reject if manual stirring rod is being dragged
    if (bridge?.getManualAdapter()?.isDragActive()) {
      return { accepted: false, reason: 'MANUAL_STIR_ACTIVE' };
    }

    const store = this.getStore();
    if (!store) {
      return { accepted: false, reason: 'STORE_UNAVAILABLE' };
    }

    // Read current pour mode from store
    const mode = store.getPourMode ? store.getPourMode() : (store.pourMode ?? 'by_dose');
    this.activeMode = mode;

    // 4. Initiate drag in storeTarget
    const result = store.startVesselDrag(
      params.ingredient,
      params.pointerId,
      [params.homePos[0], params.homePos[1], params.homePos[2]]
    );

    if (!result.ok) {
      return { accepted: false, reason: result.reason };
    }

    this.activePointerId = params.pointerId;
    this.draggedIngredient = params.ingredient;
    this.homePosition = [params.homePos[0], params.homePos[1], params.homePos[2]];
    this.dragPosition = [params.homePos[0], params.homePos[1] + 0.25, params.homePos[2]];
    this.releasedNormally = false;
    this.isInsideDropZone = false;
    this.isTouchingBeaker = false;
    this.isNearBeaker = false;
    this.isContactLatched = false;
    this.freePourPhase = 'dragging';
    this.gestureToken++;

    // Reset free pour state for this new gesture
    this.freePourTiltProgress = 0;
    this.accumulatedDeciTicks = 0;
    this.totalAcceptedDeciTicks = 0;
    this.acceptedAckSeqSet.clear();
    this.isStreamActive = false;
    this.isCapacityFull = false;
    this.hasNotifiedCapacityFull = false;
    this.lastBatchTimestamp = 0;
    this.lastFrameTimestamp = 0;
    this.liftStartPos = null;
    this.liftElapsedTime = 0;

    // 4. Capture pointer and record camera ownership
    this.previousCameraEnabled = this.cameraTarget ? this.cameraTarget.isEnabled() : true;
    this.hasCameraControl = true;
    this.cameraTarget?.setEnabled(false);
    try {
      this.captureTarget?.setPointerCapture(params.pointerId);
    } catch {
      // In testing or environments lacking setPointerCapture
    }

    // 5. Establish vertical drag plane containing the path from vessel home to beaker, oriented towards camera
    const [x0, y0, z0] = params.homePos;
    const liftPoint = new Vector3(x0, y0 + 0.35, z0);

    const vAlong = new Vector3(
      BEAKER_CENTER.x - x0,
      0,
      BEAKER_CENTER.z - z0
    ).normalize();

    // Normal perpendicular to vAlong in the XZ plane (strictly vertical: normal.y = 0)
    const normal = new Vector3(-vAlong.z, 0, vAlong.x).normalize();
    if (normal.lengthSq() < 0.001) {
      normal.set(0, 0, 1);
    }

    // Determine view direction from cameraDirection, rayDirection, or canonical default camera
    const viewDir = params.cameraDirection
      ? params.cameraDirection
      : params.rayDirection
      ? params.rayDirection
      : DEFAULT_CAMERA_DIR;

    // Ensure normal points towards camera so denom = normal.dot(rayDir) < 0
    if (normal.dot(viewDir) > 0) {
      normal.negate();
    }

    this.dragPlane.setFromNormalAndCoplanarPoint(normal, liftPoint);

    // Grab offset between hitPoint and liftPoint
    this.grabOffset.copy(params.hitPoint).sub(liftPoint);

    return { accepted: true };
  }

  private updateDragPositionFromRay(ray: RayLike): void {
    if (this.isContactLatched && this.activeMode === 'by_dose') return;

    const rOrigin = new Vector3(ray.origin.x, ray.origin.y, ray.origin.z);
    const rDir = new Vector3(ray.direction.x, ray.direction.y, ray.direction.z).normalize();

    const denom = this.dragPlane.normal.dot(rDir);
    if (Math.abs(denom) < 0.001) return;

    const t = -(rOrigin.dot(this.dragPlane.normal) + this.dragPlane.constant) / denom;
    if (t < 0 || t > 25) return;

    const hitPoint = rOrigin.clone().addScaledVector(rDir, t);
    const targetPos = hitPoint.sub(this.grabOffset);

    // Apply safe bench boundary clamps
    targetPos.x = Math.max(-3.5, Math.min(1.5, targetPos.x));
    targetPos.y = Math.max(0.12, Math.min(3.5, targetPos.y));
    targetPos.z = Math.max(-2.5, Math.min(3.0, targetPos.z));

    this.dragPosition[0] = targetPos.x;
    this.dragPosition[1] = targetPos.y;
    this.dragPosition[2] = targetPos.z;

    const near = isVesselNearBeaker(this.dragPosition);
    this.isNearBeaker = near;

    const touching = isVesselTouchingBeaker(this.dragPosition);
    this.isTouchingBeaker = touching;

    // Test drop zone membership for backward compatibility with existing tests
    const inDrop = isPointInDropZone(this.dragPosition, this.isInsideDropZone);
    this.isInsideDropZone = inDrop;

    const isTriggered = touching || inDrop;

    if (this.activeMode === 'by_dose') {
      if (isTriggered && !this.isContactLatched) {
        this.isContactLatched = true;
        const ing = this.draggedIngredient;
        const pos: [number, number, number] = [...this.dragPosition];
        const pid = this.activePointerId;
        this.activePointerId = null;
        this.draggedIngredient = null;
        this.isInsideDropZone = false;
        this.isTouchingBeaker = false;
        this.isNearBeaker = false;
        if (pid !== null) {
          this.releaseCaptureAndCamera(pid);
        }
        if (ing) {
          this.getStore()?.triggerContactPour?.(ing, pos);
        }
        return;
      }

      if (!this.isContactLatched) {
        this.getStore()?.updateVesselDragPos(this.dragPosition, inDrop, touching, near, this.freePourPhase);
        if (near) {
          this.getStore()?.setMessage?.('Đưa cốc chạm vào cốc lớn để rót');
        }
      }
    } else {
      // Free Pour mode
      if (isTriggered) {
        if (this.freePourPhase === 'dragging') {
          this.freePourPhase = 'lifting';
          this.getStore()?.setMessage?.('Đang chuẩn bị rót...');
        }
      } else {
        if (this.freePourPhase === 'lifting') {
          this.freePourPhase = 'dragging';
          this.freePourTiltProgress = 0;
        }
      }

      this.getStore()?.updateVesselDragPos(this.dragPosition, inDrop, touching, near, this.freePourPhase);
      if (near && !isTriggered) {
        this.getStore()?.setMessage?.('Đưa cốc chạm vào cốc lớn để rót tự do');
      }
    }
  }

  onPointerMove(pointerId: number, ray: RayLike): void {
    if (this.activePointerId !== pointerId || !this.draggedIngredient) return;
    this.updateDragPositionFromRay(ray);
  }

  /**
   * Advances the continuous Free Pour state machine. Called each animation frame.
   * - Smoothly lifts and tilts into pouring pose when contact occurs (freePourPhase === 'lifting').
   * - Streams substance and dispatches batches at ~10Hz cadence once at pouring pose (freePourPhase === 'pouring').
   * - Pauses stream and untilts if at maximum capacity.
   * - Interruption threshold: Skips accumulation if dt > 300ms.
   */
  stepFreePour(nowMs: number): void {
    if (this.activePointerId === null || this.draggedIngredient === null || this.activeMode !== 'free') {
      return;
    }

    if (this.lastFrameTimestamp === 0) {
      this.lastFrameTimestamp = nowMs;
      this.lastBatchTimestamp = nowMs;
      return;
    }

    const dt = (nowMs - this.lastFrameTimestamp) / 1000;
    this.lastFrameTimestamp = nowMs;

    // Guard against non-positive dt (e.g. clock jumps or same timestamp)
    if (dt <= 0) {
      return;
    }

    // Interruption threshold: if presentation was suspended or frozen > 300ms,
    // immediately TERMINATE the active pour session, release capture and camera, and require a fresh gesture.
    if (dt > PRESENTATION_INTERRUPTION_THRESHOLD_MS / 1000) {
      this.terminateOnInterruption();
      return;
    }

    const bridge = this.getBridge();
    const store = this.getStore();

    // Check available capacity before processing
    const availTicks = this.getAvailableCapacity(this.draggedIngredient);
    if (availTicks <= 0) {
      if (!this.isCapacityFull) {
        this.isCapacityFull = true;
        this.isStreamActive = false;
        store?.updateFreePourStatus?.(this.totalAcceptedDeciTicks, false);
        if (!this.hasNotifiedCapacityFull) {
          this.hasNotifiedCapacityFull = true;
          store?.setMessage?.('Cốc 500 ml đã đầy. Không thể thêm tiếp.');
        }
      }
    }

    const isEngaged =
      this.freePourPhase === 'lifting' ||
      this.freePourPhase === 'pouring' ||
      this.isInsideDropZone ||
      this.isTouchingBeaker;

    if (isEngaged && !this.isCapacityFull) {
      if (this.freePourPhase === 'dragging') {
        this.freePourPhase = 'lifting';
        this.liftStartPos = [...this.dragPosition];
        this.liftElapsedTime = 0;
        store?.setMessage?.('Đang chuẩn bị rót...');
      }

      if (this.freePourPhase === 'lifting') {
        this.liftElapsedTime += dt;
        this.freePourTiltProgress = Math.max(0.0, Math.min(1.0, this.liftElapsedTime / FREE_POUR_LIFT_DURATION));

        if (this.freePourTiltProgress >= 0.98) {
          this.freePourPhase = 'pouring';
          if (!this.isStreamActive) {
            this.isStreamActive = true;
            this.lastBatchTimestamp = nowMs;
            store?.updateFreePourStatus?.(this.totalAcceptedDeciTicks, true);
            store?.setMessage?.('Đang rót...');
            return;
          }
        } else {
          this.isStreamActive = false;
          return;
        }
      }

      if (this.freePourPhase === 'pouring') {
        this.isStreamActive = true;
        const rate = FREE_POUR_RATES[this.draggedIngredient] ?? 100;
        this.accumulatedDeciTicks += dt * rate;

        // Cadence check: send batch at max ~10 Hz (every 100ms)
        if (nowMs - this.lastBatchTimestamp >= FREE_POUR_CADENCE_MS) {
          const wholeTicks = Math.floor(this.accumulatedDeciTicks + 1e-6);
          if (wholeTicks >= 1 && bridge) {
            const currentAvail = this.getAvailableCapacity(this.draggedIngredient);
            const batchTicks = Math.min(wholeTicks, currentAvail);

            if (batchTicks >= 1) {
              const res = bridge.add(this.draggedIngredient, formatDeciTicks(batchTicks));
              if (res.ok && res.ack?.accepted) {
                if (!this.acceptedAckSeqSet.has(res.ack.seq)) {
                  this.acceptedAckSeqSet.add(res.ack.seq);
                  this.totalAcceptedDeciTicks += batchTicks;
                }
                this.accumulatedDeciTicks -= batchTicks;
                this.lastBatchTimestamp = nowMs;
                store?.updateFreePourStatus?.(this.totalAcceptedDeciTicks, true);
              } else {
                this.isStreamActive = false;
                store?.updateFreePourStatus?.(this.totalAcceptedDeciTicks, false);
              }
            }

            if (currentAvail <= batchTicks) {
              // Full capacity reached
              this.isCapacityFull = true;
              this.isStreamActive = false;
              store?.updateFreePourStatus?.(this.totalAcceptedDeciTicks, false);
              if (!this.hasNotifiedCapacityFull) {
                this.hasNotifiedCapacityFull = true;
                store?.setMessage?.('Cốc 500 ml đã đầy. Không thể thêm tiếp.');
              }
            }
          }
        }
      }
    } else {
      // Outside contact/zone or capacity full: halt stream and untilt
      this.isStreamActive = false;
      this.freePourTiltProgress = Math.max(0.0, this.freePourTiltProgress - dt / UNTILT_TRANSITION_DURATION_S);
      this.lastBatchTimestamp = nowMs;
      store?.updateFreePourStatus?.(this.totalAcceptedDeciTicks, false);
    }
  }

  /**
   * Terminates active pour session immediately upon presentation interruption (>300ms gap).
   * Drops unsent fractional ticks, shuts off stream, releases pointer capture and camera,
   * preserves accepted engine ledger amounts, and requires a fresh user gesture to pour again.
   */
  private terminateOnInterruption(): void {
    if (this.activePointerId !== null) {
      this.releaseCaptureAndCamera(this.activePointerId);
    }
    this.isStreamActive = false;
    this.accumulatedDeciTicks = 0;
    this.freePourTiltProgress = 0;
    this.freePourPhase = 'dragging';
    this.liftStartPos = null;
    this.liftElapsedTime = 0;
    this.gestureToken++;

    const store = this.getStore();
    if (this.totalAcceptedDeciTicks > 0) {
      store?.endVesselDragDrop(this.dragPosition);
    } else {
      store?.cancelVesselDrag('Kéo cốc nguyên liệu chạm cốc lớn để rót.');
    }

    this.activePointerId = null;
    this.draggedIngredient = null;
    this.isInsideDropZone = false;
    this.releasedNormally = false;
    this.lastFrameTimestamp = 0;
    this.lastBatchTimestamp = 0;
  }

  onPointerUp(pointerId: number, finalRay?: RayLike, nowMs?: number): void {
    if (this.activePointerId !== pointerId) return;

    if (finalRay) {
      this.updateDragPositionFromRay(finalRay);
    }

    this.releasedNormally = true;
    this.releaseCaptureAndCamera(pointerId);

    const store = this.getStore();
    const bridge = this.getBridge();

    if (this.activeMode === 'free') {
      let isInterrupted = false;
      // If explicit nowMs is provided and advances beyond lastFrameTimestamp:
      if (nowMs !== undefined && this.lastFrameTimestamp > 0) {
        const dt = (nowMs - this.lastFrameTimestamp) / 1000;
        if (dt > PRESENTATION_INTERRUPTION_THRESHOLD_MS / 1000) {
          isInterrupted = true;
        } else if (nowMs > this.lastFrameTimestamp && this.isStreamActive && this.draggedIngredient && !this.isCapacityFull) {
          const rate = FREE_POUR_RATES[this.draggedIngredient] ?? 100;
          this.accumulatedDeciTicks += dt * rate;
        }
      }

      // If interrupted prior to release, discard unsent remainder and do NOT flush
      if (isInterrupted) {
        this.accumulatedDeciTicks = 0;
        this.isStreamActive = false;
      }

      // If user released before streaming started (e.g. during drag or lift phase):
      // cancel immediately with ZERO addition
      if (
        this.freePourPhase === 'dragging' ||
        (this.freePourPhase === 'lifting' && !this.isStreamActive && this.totalAcceptedDeciTicks === 0)
      ) {
        this.accumulatedDeciTicks = 0;
        this.freePourTiltProgress = 0;
        this.freePourPhase = 'dragging';
        this.liftStartPos = null;
        this.liftElapsedTime = 0;
        store?.cancelVesselDrag('Kéo cốc nguyên liệu chạm cốc lớn để rót.');
      } else {
        // If stream was active at release and not interrupted, flush final batch for whole deciticks accumulated up to now
        if (this.isStreamActive && !this.isCapacityFull && bridge && this.draggedIngredient) {
          const finalWhole = Math.floor(this.accumulatedDeciTicks + 1e-6);
          const availTicks = this.getAvailableCapacity(this.draggedIngredient);
          const finalBatch = Math.min(finalWhole, availTicks);
          if (finalBatch >= 1) {
            const res = bridge.add(this.draggedIngredient, formatDeciTicks(finalBatch));
            if (res.ok && res.ack?.accepted) {
              if (!this.acceptedAckSeqSet.has(res.ack.seq)) {
                this.acceptedAckSeqSet.add(res.ack.seq);
                this.totalAcceptedDeciTicks += finalBatch;
              }
            }
          }
        }

        // Remainder < 1 decitick (< 0.1 ml/g) is strictly dropped!
        this.accumulatedDeciTicks = 0;
        this.isStreamActive = false;
        this.freePourTiltProgress = 0;
        this.freePourPhase = 'returning';
        this.liftStartPos = null;
        this.liftElapsedTime = 0;

        // Complete session in store
        store?.endVesselDragDrop(this.dragPosition);
      }
    } else {
      // By-dose mode:
      if (!this.isContactLatched) {
        store?.cancelVesselDrag('Kéo cốc nguyên liệu chạm cốc lớn để rót.');
      } else {
        store?.endVesselDragDrop(this.dragPosition);
      }
    }

    this.activePointerId = null;
    this.draggedIngredient = null;
    this.isInsideDropZone = false;
    this.isTouchingBeaker = false;
    this.isNearBeaker = false;
    this.isContactLatched = false;
    this.freePourPhase = 'dragging';
  }

  onPointerCancel(pointerId: number): void {
    if (this.activePointerId !== pointerId) return;

    this.releaseCaptureAndCamera(pointerId);
    this.isStreamActive = false;
    this.accumulatedDeciTicks = 0;
    this.freePourTiltProgress = 0;
    this.freePourPhase = 'dragging';
    this.isContactLatched = false;
    this.isTouchingBeaker = false;
    this.isNearBeaker = false;
    this.liftStartPos = null;
    this.liftElapsedTime = 0;

    const store = this.getStore();
    store?.cancelVesselDrag('Kéo cốc nguyên liệu chạm cốc lớn để rót.');

    this.activePointerId = null;
    this.draggedIngredient = null;
    this.isInsideDropZone = false;
    this.releasedNormally = false;
  }

  onLostCapture(pointerId: number): void {
    if (this.activePointerId !== pointerId) return;

    if (this.releasedNormally) {
      return;
    }

    this.restoreCameraControl();
    this.isStreamActive = false;
    this.accumulatedDeciTicks = 0;
    this.freePourTiltProgress = 0;
    this.freePourPhase = 'dragging';
    this.isContactLatched = false;
    this.isTouchingBeaker = false;
    this.isNearBeaker = false;
    this.liftStartPos = null;
    this.liftElapsedTime = 0;

    this.getStore()?.cancelVesselDrag('Kéo cốc nguyên liệu chạm cốc lớn để rót.');

    this.activePointerId = null;
    this.draggedIngredient = null;
    this.isInsideDropZone = false;
  }

  onEscapeKey(): void {
    if (this.activePointerId === null) return;

    const id = this.activePointerId;
    this.releaseCaptureAndCamera(id);
    this.isStreamActive = false;
    this.accumulatedDeciTicks = 0;
    this.freePourTiltProgress = 0;
    this.freePourPhase = 'dragging';
    this.isContactLatched = false;
    this.isTouchingBeaker = false;
    this.isNearBeaker = false;
    this.liftStartPos = null;
    this.liftElapsedTime = 0;

    const store = this.getStore();
    store?.cancelVesselDrag('Đã dừng thao tác.');
    store?.setMessage?.('Đã dừng thao tác.');

    this.activePointerId = null;
    this.draggedIngredient = null;
    this.isInsideDropZone = false;
    this.releasedNormally = false;
  }

  onWindowBlur(): void {
    if (this.activePointerId === null) return;
    this.onEscapeKey();
  }

  onReset(): void {
    if (this.activePointerId !== null) {
      this.releaseCaptureAndCamera(this.activePointerId);
    } else {
      this.restoreCameraControl();
    }
    this.activePointerId = null;
    this.draggedIngredient = null;
    this.isInsideDropZone = false;
    this.isTouchingBeaker = false;
    this.isNearBeaker = false;
    this.isContactLatched = false;
    this.freePourPhase = 'dragging';
    this.releasedNormally = false;
    this.isStreamActive = false;
    this.isCapacityFull = false;
    this.hasNotifiedCapacityFull = false;
    this.accumulatedDeciTicks = 0;
    this.freePourTiltProgress = 0;
    this.totalAcceptedDeciTicks = 0;
    this.acceptedAckSeqSet.clear();
    this.gestureToken++;
    this.lastFrameTimestamp = 0;
    this.lastBatchTimestamp = 0;
  }

  cleanup(): void {
    if (this.activePointerId !== null) {
      this.releaseCaptureAndCamera(this.activePointerId);
    } else {
      this.restoreCameraControl();
    }
    this.isStreamActive = false;
    this.accumulatedDeciTicks = 0;
    this.freePourTiltProgress = 0;
    this.freePourPhase = 'dragging';
    this.isTouchingBeaker = false;
    this.isNearBeaker = false;
    this.isContactLatched = false;
    this.hasNotifiedCapacityFull = false;
    this.getStore()?.cancelVesselDrag();
    this.activePointerId = null;
    this.draggedIngredient = null;
    this.isInsideDropZone = false;
    this.releasedNormally = false;
  }

  /**
   * Returns current 3D transform for a vessel mesh.
   */
  getCurrentTransform(cfgId: IngredientId, cfgPos: readonly [number, number, number]): VesselTransform {
    if (this.draggedIngredient !== cfgId || this.activePointerId === null) {
      return {
        position: [cfgPos[0], cfgPos[1], cfgPos[2]],
        rotationZ: 0,
        contentCounterRotationZ: 0,
        isPouringStream: false,
        streamProgress: 0,
      };
    }

    if (this.activeMode === 'free') {
      if (this.freePourPhase === 'lifting') {
        return computeFreePourLiftTransform(
          this.liftStartPos ?? this.dragPosition,
          this.liftElapsedTime
        );
      }
      if (this.freePourPhase === 'pouring') {
        const rVessel = 0.38;
        const hVessel = 1.05;
        const maxTilt = SPOUT_TARGET.tiltAngle;
        const sinMax = Math.sin(maxTilt);
        const cosMax = Math.cos(maxTilt);
        const xBasePour = SPOUT_TARGET.x - hVessel * sinMax - rVessel * cosMax;
        const yBasePour = SPOUT_TARGET.y - hVessel * cosMax + rVessel * sinMax;
        return {
          position: [xBasePour, yBasePour, SPOUT_TARGET.z],
          rotationZ: -maxTilt,
          contentCounterRotationZ: maxTilt,
          isPouringStream: this.isStreamActive,
          streamProgress: 1.0,
        };
      }
      return computeFreePourTransform(
        this.dragPosition,
        this.freePourTiltProgress,
        this.isStreamActive
      );
    }

    return {
      position: this.dragPosition,
      rotationZ: 0,
      contentCounterRotationZ: 0,
      isPouringStream: false,
      streamProgress: 0,
    };
  }

  private restoreCameraControl(): void {
    if (this.hasCameraControl) {
      this.cameraTarget?.setEnabled(this.previousCameraEnabled);
      this.hasCameraControl = false;
    }
  }

  private releaseCaptureAndCamera(pointerId: number): void {
    this.restoreCameraControl();
    try {
      this.captureTarget?.releasePointerCapture(pointerId);
    } catch {
      // Ignore if already released or unmounted
    }
  }
}

export const vesselPourAdapter = new VesselPourAdapter();
