import {
  type Ack,
  type AutoLevel,
  HeadlessSimulationEngine,
  HeadlessSimulationFacade,
  type Intent,
  type Mode,
  type RenderPoseCapture,
} from '../core/SimulationEngine';
import type { RodPose, ScalarSnapshot, RenderTarget, RenderStamp } from '../core/SimulationState';
import {
  formatDeciTicks,
  INGREDIENTS,
  parseInputAmount,
} from '../constants/ingredients';
import type { IngredientId } from '../../types/experiment';

import {
  ManualStirAdapter,
} from '../../interactions/ManualStirAdapter';

export interface HostClockAdapter {
  now: () => number;
  requestAnimationFrame: (callback: (timestampMs: number) => void) => number;
  cancelAnimationFrame: (handle: number) => void;
}

export const defaultHostClock: HostClockAdapter = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  requestAnimationFrame: (cb) => {
    if (typeof requestAnimationFrame !== 'undefined') {
      return requestAnimationFrame(cb);
    }
    return setTimeout(() => cb(defaultHostClock.now()), 16) as unknown as number;
  },
  cancelAnimationFrame: (handle) => {
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(handle);
    } else {
      clearTimeout(handle);
    }
  },
};

export interface BridgeOptions {
  engine?: HeadlessSimulationEngine;
  hostClock?: HostClockAdapter;
  onSnapshot?: (snapshot: ScalarSnapshot) => void;
  onInvalidateScene?: () => void;
  manualAdapter?: ManualStirAdapter;
}

export const TICK_PUBLISH_INTERVAL_MS = 100; // ~10Hz scalar publish throttling

/**
 * SimulationBridge
 * Authoritative bridge connecting HeadlessSimulationEngine with React/Zustand UI.
 * Key responsibilities according to SCIENTIFIC_SPEC §2–§4 & MASTER_PLAN §4:
 * - Single source of truth: Engine owns all scientific state, input ticks, mass, time.
 * - Single scheduler: App-level RAF loop advancing engineTimestamp without duplicate useFrame loops.
 * - Forced immediate publish on accepted control commands (add, reset, pause, resume, etc.).
 * - Throttled (~10Hz) scalar publish during fixed-step running animation.
 * - Visibility lifecycle integration (suspend on hidden, visible on unhide, preserving user pause).
 * - Safe snapshot publication with DevFreeze isolation.
 */
export class SimulationBridge {
  private readonly engine: HeadlessSimulationEngine;
  private readonly facade: HeadlessSimulationFacade;
  private readonly hostClock: HostClockAdapter;

  private currentSnapshot: ScalarSnapshot;
  private readonly snapshotSubscribers = new Set<(snapshot: ScalarSnapshot) => void>();
  private readonly sceneInvalidateSubscribers = new Set<() => void>();

  private manualAdapter?: ManualStirAdapter;

  private rafHandle: number | null = null;
  private isSchedulerRunning = false;
  private lastTickPublishTimestampMs = 0;
  private isDestroyed = false;
  private isContextLost = false;
  private lifecycleCleanup: (() => void) | null = null;

  constructor(options?: BridgeOptions) {
    this.engine = options?.engine ?? new HeadlessSimulationEngine({ clientId: 'ui-client' });
    this.facade = new HeadlessSimulationFacade(this.engine);
    this.hostClock = options?.hostClock ?? defaultHostClock;
    this.manualAdapter = options?.manualAdapter ?? new ManualStirAdapter({
      engine: this.engine,
      facade: this.facade,
    });

    this.currentSnapshot = this.engine.snapshot();

    if (options?.onSnapshot) {
      this.snapshotSubscribers.add(options.onSnapshot);
      options.onSnapshot(this.currentSnapshot);
    }
    if (options?.onInvalidateScene) {
      this.sceneInvalidateSubscribers.add(options.onInvalidateScene);
    }
  }

  getManualAdapter(): ManualStirAdapter | undefined {
    return this.manualAdapter;
  }

  setManualAdapter(adapter?: ManualStirAdapter): void {
    this.manualAdapter = adapter;
  }

  getEngine(): HeadlessSimulationEngine {
    return this.engine;
  }

  getFacade(): HeadlessSimulationFacade {
    return this.facade;
  }

  getSnapshot(): ScalarSnapshot {
    return this.currentSnapshot;
  }

  getGeneration(): number {
    return this.engine.getCurrentGeneration();
  }

  isPaused(): boolean {
    return this.engine.isPaused();
  }

  getRodPose(): RodPose {
    return this.engine.getRodPose();
  }

  getRenderPose(): RenderPoseCapture {
    return this.engine.getRenderPose();
  }

  copyRenderFrame(target: RenderTarget): RenderStamp {
    return this.engine.copyRenderFrame(target);
  }

  subscribeSnapshot(cb: (snapshot: ScalarSnapshot) => void): () => void {
    this.snapshotSubscribers.add(cb);
    cb(this.currentSnapshot);
    return () => {
      this.snapshotSubscribers.delete(cb);
    };
  }

  subscribeInvalidate(cb: () => void): () => void {
    this.sceneInvalidateSubscribers.add(cb);
    return () => {
      this.sceneInvalidateSubscribers.delete(cb);
    };
  }

  notifySceneInvalidate(): void {
    if (this.isContextLost) return;
    for (const cb of this.sceneInvalidateSubscribers) {
      try {
        cb();
      } catch (err) {
        console.error('Scene invalidation error:', err);
      }
    }
  }

  /**
   * Called when WebGL context is lost (SC-W02):
   * - Sets isContextLost flag to halt rendering
   * - Stops RAF scheduler
   * - Releases manual pointer drag, restores camera controls
   * - Explicitly pauses simulation, preserving mass, time, inputs and generation
   */
  handleContextLost(): void {
    this.isContextLost = true;
    this.stopScheduler();
    this.manualAdapter?.onContextLost();
    this.pause();
  }

  /**
   * Called when WebGL context is restored or retry canvas is executed (SC-W02 / SC-W01):
   * - Clears isContextLost flag
   * - Simulation remains paused (requires explicit user resume per SPEC)
   * - Notifies scene subscribers to rebind and redraw from current state
   */
  handleContextRestored(): void {
    this.isContextLost = false;
    this.notifySceneInvalidate();
  }

  isContextLostState(): boolean {
    return this.isContextLost;
  }

  private publishSnapshot(): void {
    this.currentSnapshot = this.engine.snapshot();
    for (const subscriber of this.snapshotSubscribers) {
      try {
        subscriber(this.currentSnapshot);
      } catch (err) {
        console.error('Snapshot subscription error:', err);
      }
    }
  }

  /**
   * Synchronously dispatches an intent to the engine facade.
   * If accepted, immediately performs a forced snapshot publish.
   */
  dispatchIntent(intent: Intent): Ack {
    if (this.isDestroyed) {
      throw new Error('Cannot dispatch intent to destroyed SimulationBridge');
    }

    // Guard: Prevent advancing or resuming simulation while WebGL context is lost
    if (this.isContextLost && intent.type === 'resume') {
      return {
        clientId: 'bridge-internal',
        seq: 0,
        accepted: false,
        duplicate: false,
        reason: 'CONTEXT_LOST',
        generation: this.currentSnapshot.generation,
        stateVersion: this.currentSnapshot.stateVersion,
        appliedAtTick: this.currentSnapshot.tickIndex,
        controlOrdinal: null,
      };
    }

    const ack = this.facade.dispatchIntent(intent);

    if (ack.accepted) {
      // Notify manual adapter of lifecycle / mode transitions
      if (intent.type === 'pause') {
        this.manualAdapter?.onPause();
      } else if (intent.type === 'reset') {
        this.manualAdapter?.onReset();
      } else if (intent.type === 'setMode' && intent.mode !== 'manual') {
        this.manualAdapter?.onModeChange(intent.mode);
      } else if (intent.type === 'releaseDrive') {
        this.manualAdapter?.endManualDrag();
      }

      // Forced immediate publish upon accepted control command (no 10Hz throttle)
      this.lastTickPublishTimestampMs = this.hostClock.now();
      this.publishSnapshot();
      this.notifySceneInvalidate();

      // Check running state to manage scheduler
      if (intent.type === 'resume') {
        this.startScheduler();
      } else if (intent.type === 'pause' || intent.type === 'reset') {
        this.stopScheduler();
      }
    }

    return ack;
  }

  /**
   * Form addition helper validating raw input and dispatching AddIntent.
   */
  add(id: IngredientId, amount: unknown): { ok: boolean; message: string; ack?: Ack } {
    const definition = INGREDIENTS.find((item) => item.id === id);
    if (!definition) {
      return { ok: false, message: 'Nguyên liệu không xác định.' };
    }

    const parsed = parseInputAmount(amount);
    if (!parsed.ok) {
      return { ok: false, message: parsed.error };
    }

    if (parsed.ticks > definition.maxAddition * 10) {
      return {
        ok: false,
        message: `Nhập lượng từ 0,1 đến ${definition.maxAddition} ${definition.unit}.`,
      };
    }

    const ack = this.dispatchIntent({
      type: 'add',
      ingredient: id,
      deciTicks: parsed.ticks,
    });

    if (ack.accepted) {
      const formattedAmount = formatDeciTicks(parsed.ticks);
      return {
        ok: true,
        message: `Đã thêm ${formattedAmount} ${definition.unit} ${definition.name.toLowerCase()}.`,
        ack,
      };
    }

    let errorMessage = 'Không thể thêm chất.';
    if (ack.reason === 'CAPACITY_EXCEEDED') {
      errorMessage = 'Không đủ chỗ trong cốc 500 ml. Giảm lượng thêm hoặc làm mới cốc.';
    } else if (ack.reason === 'EXCEEDS_MAX_ADDITION') {
      errorMessage = `Nhập lượng từ 0,1 đến ${definition.maxAddition} ${definition.unit}.`;
    }

    return {
      ok: false,
      message: errorMessage,
      ack,
    };
  }

  reset(seed?: number): Ack {
    return this.dispatchIntent({ type: 'reset', seed });
  }

  start(): Ack {
    return this.dispatchIntent({ type: 'resume' });
  }

  pause(): Ack {
    return this.dispatchIntent({ type: 'pause' });
  }

  resume(): Ack {
    return this.dispatchIntent({ type: 'resume' });
  }

  releaseDrive(): Ack {
    return this.dispatchIntent({ type: 'releaseDrive' });
  }

  setMode(mode: Mode): Ack {
    return this.dispatchIntent({ type: 'setMode', mode });
  }

  setAutoLevel(level: AutoLevel): Ack {
    return this.dispatchIntent({ type: 'setAutoLevel', level });
  }

  startAuto(level?: AutoLevel): { modeAck: Ack; resumeAck?: Ack } {
    if (level) {
      this.setAutoLevel(level);
    }
    const modeAck = this.setMode('auto');
    let resumeAck: Ack | undefined;
    if (this.engine.isPaused()) {
      resumeAck = this.resume();
    }
    return { modeAck, resumeAck };
  }

  stopAuto(): Ack {
    return this.releaseDrive();
  }

  /**
   * Advances simulation timestamp by one frame.
   * Called by RAF loop or directly by tests.
   */
  stepFrame(timestampMs?: number): void {
    if (this.isDestroyed || this.isContextLost) return;

    const time = timestampMs ?? this.hostClock.now();
    const isPausedBefore = this.engine.isPaused();

    const staleResult = this.manualAdapter?.checkStale(time);
    if (staleResult?.released) {
      this.notifySceneInvalidate();
    }

    const result = this.engine.advanceTimestamp(time);

    if (result.stepsExecuted > 0) {
      this.notifySceneInvalidate();

      // Throttle tick-driven scalar publish to ~10Hz
      if (time - this.lastTickPublishTimestampMs >= TICK_PUBLISH_INTERVAL_MS) {
        this.lastTickPublishTimestampMs = time;
        this.publishSnapshot();
      }
    }

    // If simulation became paused during step, stop RAF
    if (!isPausedBefore && this.engine.isPaused()) {
      this.stopScheduler();
    }
  }

  startScheduler(): void {
    if (this.isSchedulerRunning || this.isDestroyed) return;
    this.isSchedulerRunning = true;

    const loop = (timestampMs: number) => {
      if (!this.isSchedulerRunning || this.isDestroyed) return;

      this.stepFrame(timestampMs);

      if (this.isSchedulerRunning && !this.engine.isPaused()) {
        this.rafHandle = this.hostClock.requestAnimationFrame(loop);
      } else {
        this.isSchedulerRunning = false;
        this.rafHandle = null;
      }
    };

    this.rafHandle = this.hostClock.requestAnimationFrame(loop);
  }

  stopScheduler(): void {
    this.isSchedulerRunning = false;
    if (this.rafHandle !== null) {
      this.hostClock.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  isSchedulerActive(): boolean {
    return this.isSchedulerRunning;
  }

  /**
   * Attaches browser lifecycle listeners (visibilitychange) and manages the scheduler.
   * Strictly idempotent: if already attached, cleans up previous listeners before re-attaching.
   * Safe for React StrictMode setup -> cleanup -> setup across browser and headless environments.
   */
  attachLifecycle(docTarget?: { addEventListener: (type: string, listener: () => void) => void; removeEventListener: (type: string, listener: () => void) => void }): () => void {
    const doc = docTarget ?? (typeof document !== 'undefined' ? document : undefined);
    const win = typeof window !== 'undefined' ? window : undefined;

    // Detach previous lifecycle listeners if already active (idempotency guard)
    if (this.lifecycleCleanup) {
      this.lifecycleCleanup();
      this.lifecycleCleanup = null;
    }

    const onVisibilityChange = () => {
      const isHidden = (doc as unknown as { hidden?: boolean })?.hidden ?? false;
      if (isHidden) {
        this.manualAdapter?.onPageHidden();
        this.engine.suspend();
      } else {
        this.engine.visible();
        this.notifySceneInvalidate();
        if (!this.engine.isPaused()) {
          this.startScheduler();
        }
      }
    };

    const onBlur = () => {
      this.manualAdapter?.onWindowBlur();
    };

    doc?.addEventListener('visibilitychange', onVisibilityChange);
    win?.addEventListener('blur', onBlur);

    if (!this.engine.isPaused()) {
      this.startScheduler();
    }

    const cleanup = () => {
      doc?.removeEventListener('visibilitychange', onVisibilityChange);
      win?.removeEventListener('blur', onBlur);
      this.stopScheduler();
      if (this.lifecycleCleanup === cleanup) {
        this.lifecycleCleanup = null;
      }
    };

    this.lifecycleCleanup = cleanup;
    return cleanup;
  }

  destroy(): void {
    this.isDestroyed = true;
    if (this.lifecycleCleanup) {
      this.lifecycleCleanup();
      this.lifecycleCleanup = null;
    }
    this.manualAdapter?.detach();
    this.stopScheduler();
    this.snapshotSubscribers.clear();
    this.sceneInvalidateSubscribers.clear();
  }
}
