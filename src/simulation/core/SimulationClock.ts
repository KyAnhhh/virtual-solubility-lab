import type { ClockConfig } from './SimulationState';

export const DEFAULT_H = 1 / 60;
export const DEFAULT_MAX_REAL_DELTA = 0.1;
export const DEFAULT_MAX_STEPS = 6;
export const CLOCK_EPSILON = 1e-12;

export interface AdvanceResult {
  ok: boolean;
  stepsExecuted: number;
  droppedWallTime: number;
  error?: 'INVALID_DELTA' | 'INVALID_TIMESTAMP' | 'NON_MONOTONIC_TIMESTAMP';
}

export interface TimingDiagnostics {
  accumulator: number;
  droppedActiveWallTime: number;
  isSuspended: boolean;
  lastTimestampMs: number | null;
  config: ClockConfig;
}

export interface ReadonlyClock {
  getConfig(): Readonly<ClockConfig>;
  getAccumulator(): number;
  getDroppedActiveWallTime(): number;
  getIsSuspended(): boolean;
  getLastTimestampMs(): number | null;
  getDiagnostics(): TimingDiagnostics;
}

/**
 * Validates clock configuration.
 * - h must be finite positive number.
 * - maxRealDelta must be finite positive number.
 * - maxSteps must be safe positive integer.
 */
export function validateClockConfig(config?: Partial<ClockConfig>): ClockConfig {
  const h = config?.h ?? DEFAULT_H;
  if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
    throw new TypeError(`Timestep h must be a finite positive number, received: ${String(h)}`);
  }

  const maxRealDelta = config?.maxRealDelta ?? DEFAULT_MAX_REAL_DELTA;
  if (typeof maxRealDelta !== 'number' || !Number.isFinite(maxRealDelta) || maxRealDelta <= 0) {
    throw new TypeError(`maxRealDelta must be a finite positive number, received: ${String(maxRealDelta)}`);
  }

  let defaultSteps = DEFAULT_MAX_STEPS;
  if (Math.abs(h - 1 / 120) < 1e-6) {
    defaultSteps = 12;
  }
  const maxSteps = config?.maxSteps ?? defaultSteps;
  if (typeof maxSteps !== 'number' || !Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new TypeError(`maxSteps must be a positive integer, received: ${String(maxSteps)}`);
  }

  return { h, maxRealDelta, maxSteps };
}

/**
 * SimulationClock
 * Headless fixed timestep clock with clamped accumulator and lifecycle management.
 * Strictly adheres to SCIENTIFIC_SPEC §7:
 * - h = 1/60s (or configurable uint32-compatible rate).
 * - maxRealDelta = 0.1s cap on wall delta per frame.
 * - excess active time added to droppedActiveWallTime.
 * - accumulator steps h up to maxSteps.
 * - integer step backlog dropped to droppedActiveWallTime.
 * - fractional remainder preserved in [0, h) with 1e-12s clock epsilon.
 * - pause / suspend clears fractional remainder into droppedActiveWallTime without counting paused duration.
 * - first frame after resume / visible has delta 0.
 */
export class SimulationClock implements ReadonlyClock {
  private readonly config: ClockConfig;
  private accumulator = 0;
  private droppedActiveWallTime = 0;
  private isSuspended = false;
  private lastTimestampMs: number | null = null;
  private readonly onStep?: (h: number) => void;
  private readonly onBeforeStep?: () => void;

  constructor(
    config?: Partial<ClockConfig>,
    onStep?: (h: number) => void,
    onBeforeStep?: () => void
  ) {
    this.config = validateClockConfig(config);
    this.onStep = onStep;
    this.onBeforeStep = onBeforeStep;
  }

  getConfig(): Readonly<ClockConfig> {
    return this.config;
  }

  getAccumulator(): number {
    return this.accumulator;
  }

  getDroppedActiveWallTime(): number {
    return this.droppedActiveWallTime;
  }

  getIsSuspended(): boolean {
    return this.isSuspended;
  }

  getLastTimestampMs(): number | null {
    return this.lastTimestampMs;
  }

  getDiagnostics(): TimingDiagnostics {
    return {
      accumulator: this.accumulator,
      droppedActiveWallTime: this.droppedActiveWallTime,
      isSuspended: this.isSuspended,
      lastTimestampMs: this.lastTimestampMs,
      config: { ...this.config },
    };
  }

  /**
   * Advances clock by realDeltaSeconds.
   * @param realDeltaSeconds active elapsed real seconds
   * @param isRunning predicate or boolean indicating if engine is unpaused
   */
  advance(
    realDeltaSeconds: number,
    isRunning: boolean | (() => boolean)
  ): AdvanceResult {
    // 1. Validate realDeltaSeconds
    if (
      typeof realDeltaSeconds !== 'number' ||
      !Number.isFinite(realDeltaSeconds) ||
      realDeltaSeconds < 0
    ) {
      return {
        ok: false,
        stepsExecuted: 0,
        droppedWallTime: 0,
        error: 'INVALID_DELTA',
      };
    }

    // 2. dt = 0 is a pure time no-op
    if (realDeltaSeconds === 0) {
      return { ok: true, stepsExecuted: 0, droppedWallTime: 0 };
    }

    const checkRunning = typeof isRunning === 'function' ? isRunning : () => isRunning;

    // 3. If paused or suspended, do not accumulate active time.
    // Paused duration is NOT added to droppedActiveWallTime (SPEC §7).
    if (!checkRunning() || this.isSuspended) {
      return { ok: true, stepsExecuted: 0, droppedWallTime: 0 };
    }

    // 4. Running: clamp dt to maxRealDelta
    let activeDt = realDeltaSeconds;
    let droppedThisCall = 0;

    if (activeDt > this.config.maxRealDelta) {
      const excess = activeDt - this.config.maxRealDelta;
      activeDt = this.config.maxRealDelta;
      droppedThisCall += excess;
      this.droppedActiveWallTime += excess;
    }

    this.accumulator += activeDt;

    // 5. Execute fixed steps up to maxSteps
    let stepsExecuted = 0;
    const { h, maxSteps } = this.config;

    while (this.accumulator >= h - CLOCK_EPSILON && stepsExecuted < maxSteps) {
      if (!checkRunning() || this.isSuspended) {
        // Paused during a step execution (e.g. from a control command)
        this.onPause();
        break;
      }

      this.onBeforeStep?.();

      // Check again if step hook paused the simulation
      if (!checkRunning() || this.isSuspended) {
        this.onPause();
        break;
      }

      this.onStep?.(h);
      this.accumulator -= h;
      stepsExecuted++;

      if (Math.abs(this.accumulator) < CLOCK_EPSILON) {
        this.accumulator = 0;
      }
    }

    // 6. If integer backlog remains due to low step budget, drop it
    if (checkRunning() && !this.isSuspended) {
      const backlogSteps = Math.floor((this.accumulator + CLOCK_EPSILON) / h);
      if (backlogSteps > 0) {
        const droppedBacklog = backlogSteps * h;
        droppedThisCall += droppedBacklog;
        this.droppedActiveWallTime += droppedBacklog;
        this.accumulator -= droppedBacklog;

        if (Math.abs(this.accumulator) < CLOCK_EPSILON) {
          this.accumulator = 0;
        }
      }
    }

    return {
      ok: true,
      stepsExecuted,
      droppedWallTime: droppedThisCall,
    };
  }

  /**
   * Pure monotonic host timestamp adapter (milliseconds).
   * First frame after start/resume/visible produces delta = 0 without fast-forward.
   */
  advanceTimestamp(
    timestampMs: number,
    isRunning: boolean | (() => boolean)
  ): AdvanceResult {
    if (
      typeof timestampMs !== 'number' ||
      !Number.isFinite(timestampMs) ||
      timestampMs < 0
    ) {
      return {
        ok: false,
        stepsExecuted: 0,
        droppedWallTime: 0,
        error: 'INVALID_TIMESTAMP',
      };
    }

    if (this.lastTimestampMs === null) {
      this.lastTimestampMs = timestampMs;
      return this.advance(0, isRunning);
    }

    if (timestampMs < this.lastTimestampMs) {
      return {
        ok: false,
        stepsExecuted: 0,
        droppedWallTime: 0,
        error: 'NON_MONOTONIC_TIMESTAMP',
      };
    }

    const deltaSeconds = (timestampMs - this.lastTimestampMs) / 1000;
    this.lastTimestampMs = timestampMs;
    return this.advance(deltaSeconds, isRunning);
  }

  /**
   * Called on pause: clears fractional remainder into droppedActiveWallTime and clears lastTimestampMs.
   */
  onPause(): void {
    if (this.accumulator > CLOCK_EPSILON) {
      this.droppedActiveWallTime += this.accumulator;
      this.accumulator = 0;
    }
    this.lastTimestampMs = null;
  }

  /**
   * Called on resume: clears lastTimestampMs so next frame starts with delta = 0.
   */
  onResume(): void {
    this.lastTimestampMs = null;
  }

  /**
   * Suspend (e.g. visibility hidden / tab blur).
   */
  suspend(): void {
    this.isSuspended = true;
    if (this.accumulator > CLOCK_EPSILON) {
      this.droppedActiveWallTime += this.accumulator;
      this.accumulator = 0;
    }
    this.lastTimestampMs = null;
  }

  /**
   * Visible (e.g. tab becomes visible again).
   * Lifts suspend flag; does NOT unpause user pause. Next frame has delta 0.
   */
  visible(): void {
    this.isSuspended = false;
    this.lastTimestampMs = null;
  }

  /**
   * Resets clock timing to baseline for new experiment.
   */
  reset(): void {
    this.accumulator = 0;
    this.droppedActiveWallTime = 0;
    this.isSuspended = false;
    this.lastTimestampMs = null;
  }
}
