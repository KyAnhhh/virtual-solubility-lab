import type {
  Ack,
  Command,
} from './SimulationEngine';
import type { HeadlessSimulationEngine } from './HeadlessSimulationEngine';

export interface TraceItem {
  generation?: number;
  appliedAtTick: number;
  command: Command;
  expectedAck?: Partial<Ack>;
}

export interface ReplayOptions {
  fps?: number; // e.g. 30, 60, 120
  frameDt?: number; // custom frame delta seconds
  totalDurationSeconds?: number;
  maxFrames?: number;
}

export interface ReplayReport {
  ok: boolean;
  totalFrames: number;
  totalSteps: number;
  commandsDispatched: number;
  acks: Ack[];
  deadlockDiagnostic?: string;
}

/**
 * TickBoundaryReplayHarness
 * Replays command traces at exact scientific tick boundaries according to SCIENTIFIC_SPEC §7:
 * - Commands due at appliedAtTick = N are dispatched after step N, before step N+1.
 * - In a single multi-step frame, commands are injected before the due step, not at frame end.
 * - Commands at the same tick are dispatched in queue/ordinal order.
 * - Paused commands at current tick flush immediately without deadlock.
 * - Detects impossible future-tick events while paused and halts with diagnostic instead of spinning.
 * - Follows trace generation order across resets without sorting by tickIndex.
 */
export class TickBoundaryReplayHarness {
  static replay(
    engine: HeadlessSimulationEngine,
    trace: TraceItem[],
    options?: ReplayOptions
  ): ReplayReport {
    const traceQueue = [...trace];
    const acks: Ack[] = [];
    let commandsDispatched = 0;

    const flushDueCommands = () => {
      while (traceQueue.length > 0) {
        const next = traceQueue[0];
        if (next.generation !== undefined && next.generation !== engine.getCurrentGeneration()) {
          break;
        }
        if (next.appliedAtTick === engine.getTickIndex()) {
          const item = traceQueue.shift()!;
          const ack = engine.dispatch(item.command);
          acks.push(ack);
          commandsDispatched++;
        } else {
          break;
        }
      }
    };

    // Install beforeStepHook on engine to inject due commands immediately before step executes
    engine.setBeforeStepHook((currentTick: number) => {
      while (traceQueue.length > 0) {
        const next = traceQueue[0];
        if (next.generation !== undefined && next.generation !== engine.getCurrentGeneration()) {
          break;
        }
        if (next.appliedAtTick === currentTick) {
          const item = traceQueue.shift()!;
          const ack = engine.dispatch(item.command);
          acks.push(ack);
          commandsDispatched++;
        } else {
          break;
        }
      }
    });

    const frameDt = options?.frameDt ?? (options?.fps ? 1 / options.fps : 1 / 60);
    const maxFrames = options?.maxFrames ?? 20000;
    let frame = 0;

    // Flush any initial commands due at current state before time advance (e.g. tick 0)
    flushDueCommands();

    while (frame < maxFrames) {
      if (
        options?.totalDurationSeconds !== undefined &&
        engine.getElapsedSeconds() >= options.totalDurationSeconds - 1e-12
      ) {
        break;
      }
      if (traceQueue.length === 0 && options?.totalDurationSeconds === undefined) {
        break;
      }

      // Deadlock check: simulation is paused, but next command is scheduled for a future tick
      if (
        engine.isPaused() &&
        traceQueue.length > 0 &&
        traceQueue[0].appliedAtTick > engine.getTickIndex()
      ) {
        engine.setBeforeStepHook(undefined);
        return {
          ok: false,
          totalFrames: frame,
          totalSteps: engine.getTickIndex(),
          commandsDispatched,
          acks,
          deadlockDiagnostic: `DEADLOCK: Simulation is paused at tick ${engine.getTickIndex()} but next command requires tick ${traceQueue[0].appliedAtTick}.`,
        };
      }

      engine.advance(frameDt);
      frame++;

      // Flush commands in case a command (e.g. resume) or pause changed state
      flushDueCommands();
    }

    engine.setBeforeStepHook(undefined);

    return {
      ok: traceQueue.length === 0,
      totalFrames: frame,
      totalSteps: engine.getTickIndex(),
      commandsDispatched,
      acks,
    };
  }
}
