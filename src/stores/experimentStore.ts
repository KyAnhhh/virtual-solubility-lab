import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type {
  ActivePour,
  Addition,
  DeciTicks,
  DraggedVesselState,
  ExperimentSnapshot,
  IngredientId,
  PourMode,
  Quantities,
} from '../types/experiment';
import {
  CAPACITY_MILLI_ML,
  getAvailableCapacityTicks,
  INGREDIENTS,
  formatDeciTicks,
  occupiedVolumeMilliMl,
  parseInputAmount,
  ticksToQuantities,
} from '../simulation/constants/ingredients';
import { SimulationBridge } from '../simulation/bridge/SimulationBridge';
import type { Ack, AutoLevel, Mode } from '../simulation/core/SimulationEngine';
import type { ScalarSnapshot, ScienceInputTicks } from '../simulation/core/SimulationState';

function inputToDeciTicks(input: ScienceInputTicks): DeciTicks {
  return {
    water: input.water,
    sugar: input.sugar,
    sand: input.sand,
    oil: input.oil,
  };
}

export type WebGLStatus = 'ready' | 'init_failed' | 'context_lost' | 'restoring';

export interface ExperimentStore extends ExperimentSnapshot {
  // Authoritative detached scalar snapshot published by the engine
  snapshot: ScalarSnapshot;

  // Single authoritative source for quantities and deciTicks derived from snapshot.input
  deciTicks: DeciTicks;
  quantities: Quantities;

  // Active pour state
  activePour: ActivePour | null;

  // Form input doses (shared with 3D vessel drag)
  inputDoses: Record<IngredientId, string>;
  setInputDose: (id: IngredientId, dose: string) => void;

  // Pour mode
  pourMode: PourMode;
  setPourMode: (mode: PourMode) => void;

  // Drag-and-drop vessel state
  draggedVessel: DraggedVesselState | null;
  startVesselDrag: (id: IngredientId, pointerId: number, initialPos?: [number, number, number]) => { ok: boolean; reason?: string };
  updateVesselDragPos: (
    pos: [number, number, number],
    isInsideDropZone: boolean,
    isTouchingBeaker?: boolean,
    isNearBeaker?: boolean,
    freePourPhase?: 'dragging' | 'lifting' | 'pouring' | 'returning'
  ) => void;
  triggerContactPour: (ingredient: IngredientId, contactPos: [number, number, number]) => boolean;
  updateFreePourStatus: (totalAddedDeciTicks: number, isPouringStream: boolean) => void;
  endVesselDragDrop: (finalDropPos?: [number, number, number]) => boolean;
  cancelVesselDrag: (reason?: string) => void;

  // UI state
  additions: Addition[];
  message: string;
  setMessage: (msg: string) => void;
  lastAck: Ack | null;
  showRod: boolean;
  cameraRevision: number;
  hasStarted: boolean;
  webglStatus: WebGLStatus;
  canvasRevision: number;

  // Authoritative actions dispatched via bridge
  add: (id: IngredientId, amount: unknown) => boolean;
  startPour: (
    id: IngredientId,
    amount: unknown,
    options?: { fromDrop?: boolean; dropPos?: readonly [number, number, number] }
  ) => boolean;
  commitPour: (token: number) => boolean;
  finishPour: (token: number) => void;
  cancelPour: () => void;
  isPourRunning: () => boolean;
  reset: (seed?: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  startAuto: (level?: AutoLevel) => void;
  stopAuto: () => void;
  setAutoLevel: (level: AutoLevel) => void;
  setMode: (mode: Mode) => void;
  toggleRod: () => void;
  resetCamera: () => void;

  // WebGL context recovery actions (V4-10)
  retryCanvas: () => void;
  reportWebGLInitFailed: () => void;
  reportWebGLContextLost: () => void;
  reportWebGLContextRestored: () => void;

  // Bridge connection & management
  getBridge: () => SimulationBridge;
  setBridge: (bridge: SimulationBridge) => void;
  setSnapshot: (snapshot: ScalarSnapshot) => void;
}

let pourTokenSeq = 0;

export function createExperimentStore(initialBridge?: SimulationBridge): UseBoundStore<StoreApi<ExperimentStore>> {
  let bridge = initialBridge ?? new SimulationBridge();
  let cleanupBridgeSub: (() => void) | null = null;

  const store = create<ExperimentStore>((set, get) => {
    // Setup snapshot subscription to bridge
    const attachBridge = (newBridge: SimulationBridge) => {
      cleanupBridgeSub?.();
      bridge = newBridge;

      cleanupBridgeSub = bridge.subscribeSnapshot((snapshot) => {
        // Drop stale async snapshots if generation/version regressed
        const current = get()?.snapshot;
        if (
          current &&
          (snapshot.generation < current.generation ||
            (snapshot.generation === current.generation &&
              snapshot.stateVersion < current.stateVersion))
        ) {
          return;
        }

        const ticks = inputToDeciTicks(snapshot.input);
        set((state) => ({
          snapshot,
          deciTicks: ticks,
          quantities: ticksToQuantities(ticks),
          hasStarted:
            current && snapshot.generation > current.generation
              ? !snapshot.paused
              : state.hasStarted || !snapshot.paused,
        }));
      });
    };

    const initialSnapshot = bridge.getSnapshot();
    const initialDeciTicks = inputToDeciTicks(initialSnapshot.input);

    const vAdapter = bridge.getVesselAdapter();
    if (vAdapter) {
      vAdapter.setStoreGetter(() => get());
    }

    return {
      snapshot: initialSnapshot,
      deciTicks: initialDeciTicks,
      quantities: ticksToQuantities(initialDeciTicks),
      activePour: null,
      additions: [],
      message: 'Bắt đầu bằng cách thêm nước vào cốc.',
      lastAck: null,
      showRod: true,
      cameraRevision: 0,
      hasStarted: !initialSnapshot.paused,
      webglStatus: 'ready',
      canvasRevision: 0,

      inputDoses: {
        water: '100',
        sugar: '10',
        sand: '10',
        oil: '20',
      },
      setInputDose: (id: IngredientId, dose: string) => {
        set((s) => ({ inputDoses: { ...s.inputDoses, [id]: dose } }));
      },

      pourMode: 'by_dose',
      setPourMode: (mode: PourMode) => {
        if (get().activePour !== null || get().draggedVessel !== null) return;
        set({ pourMode: mode });
      },
      setMessage: (msg: string) => set({ message: msg }),

      draggedVessel: null,

      startVesselDrag: (id: IngredientId, pointerId: number, initialPos?: [number, number, number]): { ok: boolean; reason?: string } => {
        const state = get();
        // 1. Single-flight lock: reject if a pour or drag is already running
        if (state.activePour !== null || state.draggedVessel !== null) {
          return { ok: false, reason: 'BUSY' };
        }

        // 2. WebGL status must be ready
        if (state.webglStatus !== 'ready') {
          return { ok: false, reason: 'WEBGL_NOT_READY' };
        }

        const definition = INGREDIENTS.find((item) => item.id === id);
        if (!definition) {
          set({ message: 'Nguyên liệu không xác định.' });
          return { ok: false, reason: 'UNKNOWN_INGREDIENT' };
        }

        const mode = state.pourMode;
        const token = ++pourTokenSeq;
        const startPos: [number, number, number] = initialPos ? [...initialPos] : [0, 0, 0];

        if (mode === 'by_dose') {
          // Pre-validate input dose from store.inputDoses
          const rawAmount = state.inputDoses[id] ?? (id === 'water' ? '100' : id === 'oil' ? '20' : '10');
          const parsed = parseInputAmount(rawAmount);
          if (!parsed.ok) {
            set({ message: parsed.error });
            return { ok: false, reason: parsed.error };
          }

          if (parsed.ticks > definition.maxAddition * 10) {
            const errorMsg = `Nhập lượng từ 0,1 đến ${definition.maxAddition} ${definition.unit}.`;
            set({
              message: errorMsg,
              lastAck: {
                clientId: 'pre-check',
                seq: 0,
                accepted: false,
                duplicate: false,
                reason: 'EXCEEDS_MAX_ADDITION',
                generation: state.snapshot.generation,
                stateVersion: state.snapshot.stateVersion,
                appliedAtTick: state.snapshot.tickIndex,
                controlOrdinal: null,
              },
            });
            return { ok: false, reason: errorMsg };
          }

          // Pre-validate capacity
          const currentTicks = state.deciTicks;
          const projectedTicks = { ...currentTicks, [id]: currentTicks[id] + parsed.ticks };
          if (occupiedVolumeMilliMl(projectedTicks) > CAPACITY_MILLI_ML) {
            const errorMsg = 'Không đủ chỗ trong cốc 500 ml. Giảm lượng thêm hoặc làm mới cốc.';
            set({
              message: errorMsg,
              lastAck: {
                clientId: 'pre-check',
                seq: 0,
                accepted: false,
                duplicate: false,
                reason: 'CAPACITY_EXCEEDED',
                generation: state.snapshot.generation,
                stateVersion: state.snapshot.stateVersion,
                appliedAtTick: state.snapshot.tickIndex,
                controlOrdinal: null,
              },
            });
            return { ok: false, reason: errorMsg };
          }

          bridge.getManualAdapter()?.endManualDrag();

          set({
            draggedVessel: {
              token,
              ingredient: id,
              pointerId,
              mode: 'by_dose',
              snapshotAmount: parsed.amount,
              snapshotDeciTicks: parsed.ticks,
              unit: definition.unit,
              name: definition.name,
              position: [startPos[0], startPos[1] + 0.35, startPos[2]],
              isInsideDropZone: false,
              isPouringStream: false,
              totalAddedAmount: 0,
              startedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
            },
            message: `Đang cầm cốc ${definition.name.toLowerCase()} (${formatDeciTicks(parsed.ticks)} ${definition.unit}). Kéo tới miệng cốc 500 ml để rót.`,
          });
        } else {
          // Free Pour mode: Does NOT use form input dose!
          // Check if beaker has capacity for at least 1 tick (0.1 ml / 0.1 g)
          const availableTicks = getAvailableCapacityTicks(id, state.deciTicks);
          if (availableTicks <= 0) {
            const errorMsg = 'Cốc 500 ml đã đạt giới hạn dung tích.';
            set({
              message: errorMsg,
              lastAck: {
                clientId: 'pre-check',
                seq: 0,
                accepted: false,
                duplicate: false,
                reason: 'CAPACITY_EXCEEDED',
                generation: state.snapshot.generation,
                stateVersion: state.snapshot.stateVersion,
                appliedAtTick: state.snapshot.tickIndex,
                controlOrdinal: null,
              },
            });
            return { ok: false, reason: 'CAPACITY_FULL' };
          }

          bridge.getManualAdapter()?.endManualDrag();

          set({
            draggedVessel: {
              token,
              ingredient: id,
              pointerId,
              mode: 'free',
              snapshotAmount: 0,
              snapshotDeciTicks: 0,
              unit: definition.unit,
              name: definition.name,
              position: [startPos[0], startPos[1] + 0.35, startPos[2]],
              isInsideDropZone: false,
              isPouringStream: false,
              totalAddedAmount: 0,
              startedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
            },
            message: `Đang cầm cốc ${definition.name.toLowerCase()} (Rót tự do). Kéo tới miệng cốc 500 ml và giữ chuột để rót.`,
          });
        }

        bridge.notifySceneInvalidate();
        return { ok: true };
      },

      updateVesselDragPos: (
        pos: [number, number, number],
        isInsideDropZone: boolean,
        isTouchingBeaker?: boolean,
        isNearBeaker?: boolean,
        freePourPhase?: 'dragging' | 'lifting' | 'pouring' | 'returning'
      ) => {
        const current = get().draggedVessel;
        if (!current) return;
        current.position[0] = pos[0];
        current.position[1] = pos[1];
        current.position[2] = pos[2];
        const changed =
          current.isInsideDropZone !== isInsideDropZone ||
          current.isTouchingBeaker !== isTouchingBeaker ||
          current.isNearBeaker !== isNearBeaker ||
          current.freePourPhase !== freePourPhase;

        if (changed) {
          set({
            draggedVessel: {
              ...current,
              isInsideDropZone,
              isTouchingBeaker: isTouchingBeaker ?? current.isTouchingBeaker,
              isNearBeaker: isNearBeaker ?? current.isNearBeaker,
              freePourPhase: freePourPhase ?? current.freePourPhase,
            },
          });
        }
        bridge.notifySceneInvalidate();
      },

      triggerContactPour: (ingredient: IngredientId, contactPos: [number, number, number]): boolean => {
        const current = get().draggedVessel;
        if (!current || current.ingredient !== ingredient) return false;
        const amount = current.snapshotAmount;
        // Clear draggedVessel state
        set({ draggedVessel: null });
        // Immediately initiate pour from contact point
        return get().startPour(ingredient, amount, {
          fromDrop: true,
          dropPos: [...contactPos],
        });
      },

      updateFreePourStatus: (totalAddedDeciTicks: number, isPouringStream: boolean) => {
        const current = get().draggedVessel;
        if (!current || current.mode !== 'free') return;
        const totalAddedAmount = totalAddedDeciTicks / 10;
        if (current.totalAddedAmount !== totalAddedAmount || current.isPouringStream !== isPouringStream) {
          set({
            draggedVessel: {
              ...current,
              totalAddedAmount,
              isPouringStream,
            },
          });
        }
        bridge.notifySceneInvalidate();
      },

      endVesselDragDrop: (finalDropPos?: [number, number, number]): boolean => {
        const current = get().draggedVessel;
        if (!current) return false;
        const dropPos = finalDropPos ?? current.position;
        const ingredient = current.ingredient;
        const amount = current.snapshotAmount;
        const isInside = current.isInsideDropZone;
        const mode = current.mode;

        // Clear draggedVessel state
        set({ draggedVessel: null });

        if (mode === 'free') {
          const addedTicks = current.totalAddedAmount ? Math.round(current.totalAddedAmount * 10) : 0;
          if (addedTicks > 0) {
            const def = INGREDIENTS.find((i) => i.id === ingredient);
            set({
              message: `Đã thêm ${formatDeciTicks(addedTicks)} ${def?.unit ?? ''} ${def?.name.toLowerCase() ?? ''}.`,
            });
          }
          bridge.notifySceneInvalidate();
          return true;
        }

        if (!isInside) {
          set({ message: 'Kéo cốc nguyên liệu chạm cốc lớn để rót.' });
          bridge.notifySceneInvalidate();
          return false;
        }

        // Dropped inside drop zone -> start pour animation from drop position
        return get().startPour(ingredient, amount, {
          fromDrop: true,
          dropPos: [...dropPos],
        });
      },

      cancelVesselDrag: (reason?: string) => {
        if (get().draggedVessel !== null) {
          set({
            draggedVessel: null,
            message: reason ?? 'Kéo cốc nguyên liệu chạm cốc lớn để rót.',
          });
          bridge.notifySceneInvalidate();
        }
      },

      add: (id: IngredientId, amount: unknown): boolean => {
        // Parse input to get numerical amount for addition history
        const parsed = parseInputAmount(amount);

        const res = bridge.add(id, amount);

        if (res.ok && parsed.ok) {
          const nextId = (get().additions.at(-1)?.id ?? 0) + 1;
          set((state) => ({
            additions: [
              ...state.additions,
              {
                id: nextId,
                ingredient: id,
                amount: parsed.amount,
                deciTicks: parsed.ticks,
              },
            ],
            message: res.message,
            lastAck: res.ack ?? null,
          }));
          return true;
        }

        set({
          message: res.message,
          lastAck: res.ack ?? null,
        });
        return false;
      },

      startPour: (
        id: IngredientId,
        amount: unknown,
        options?: { fromDrop?: boolean; dropPos?: readonly [number, number, number] }
      ): boolean => {
        const state = get();
        // 1. Single-flight lock: reject if a pour is already running
        if (state.activePour !== null) {
          return false;
        }

        // 2. Check for reduced motion or non-ready WebGL -> fallback to immediate add
        const isReducedMotion =
          typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (state.webglStatus !== 'ready' || isReducedMotion) {
          return state.add(id, amount);
        }

        // 3. Pre-validate input
        const definition = INGREDIENTS.find((item) => item.id === id);
        if (!definition) {
          set({ message: 'Nguyên liệu không xác định.' });
          return false;
        }

        const parsed = parseInputAmount(amount);
        if (!parsed.ok) {
          set({ message: parsed.error });
          return false;
        }

        if (parsed.ticks > definition.maxAddition * 10) {
          set({
            message: `Nhập lượng từ 0,1 đến ${definition.maxAddition} ${definition.unit}.`,
            lastAck: {
              clientId: 'pre-check',
              seq: 0,
              accepted: false,
              duplicate: false,
              reason: 'EXCEEDS_MAX_ADDITION',
              generation: state.snapshot.generation,
              stateVersion: state.snapshot.stateVersion,
              appliedAtTick: state.snapshot.tickIndex,
              controlOrdinal: null,
            },
          });
          return false;
        }

        // 4. Pre-validate capacity
        const currentTicks = state.deciTicks;
        const projectedTicks = { ...currentTicks, [id]: currentTicks[id] + parsed.ticks };
        if (occupiedVolumeMilliMl(projectedTicks) > CAPACITY_MILLI_ML) {
          set({
            message: 'Không đủ chỗ trong cốc 500 ml. Giảm lượng thêm hoặc làm mới cốc.',
            lastAck: {
              clientId: 'pre-check',
              seq: 0,
              accepted: false,
              duplicate: false,
              reason: 'CAPACITY_EXCEEDED',
              generation: state.snapshot.generation,
              stateVersion: state.snapshot.stateVersion,
              appliedAtTick: state.snapshot.tickIndex,
              controlOrdinal: null,
            },
          });
          return false;
        }

        // 5. Clean up any active manual spoon drag before starting vessel movement
        bridge.getManualAdapter()?.endManualDrag();

        // 6. Start pour animation
        const token = ++pourTokenSeq;
        const formattedAmount = formatDeciTicks(parsed.ticks);
        set({
          activePour: {
            token,
            generation: state.snapshot.generation,
            ingredient: id,
            amount: parsed.amount,
            deciTicks: parsed.ticks,
            unit: definition.unit,
            name: definition.name,
            dispatched: false,
            startTime: typeof performance !== 'undefined' ? performance.now() : Date.now(),
            fromDrop: options?.fromDrop,
            dropPos: options?.dropPos,
          },
          message: `Đang thêm ${formattedAmount} ${definition.unit} ${definition.name.toLowerCase()}...`,
        });

        bridge.notifySceneInvalidate();
        return true;
      },

      commitPour: (token: number): boolean => {
        const current = get().activePour;
        if (!current || current.token !== token || current.dispatched) {
          return false;
        }
        // Token invalidated by reset or generation change
        if (get().snapshot.generation !== current.generation) {
          return false;
        }

        // Mark dispatched in store so it cannot be dispatched again
        set((s) => (s.activePour ? { activePour: { ...s.activePour, dispatched: true } } : {}));

        // Authoritative dispatch through bridge
        const res = bridge.add(current.ingredient, current.amount);
        if (res.ok) {
          const nextId = (get().additions.at(-1)?.id ?? 0) + 1;
          set((state) => ({
            additions: [
              ...state.additions,
              {
                id: nextId,
                ingredient: current.ingredient,
                amount: current.amount,
                deciTicks: current.deciTicks,
              },
            ],
            message: res.message,
            lastAck: res.ack ?? null,
          }));
          return true;
        }

        set({
          message: res.message,
          lastAck: res.ack ?? null,
        });
        return false;
      },

      finishPour: (token: number) => {
        const current = get().activePour;
        if (!current || current.token !== token) return;
        set({ activePour: null });
        bridge.notifySceneInvalidate();
      },

      cancelPour: () => {
        if (get().activePour !== null) {
          set({ activePour: null });
          bridge.notifySceneInvalidate();
        }
      },

      isPourRunning: () => get().activePour !== null || get().draggedVessel !== null,

      reset: (seed?: number) => {
        set({ activePour: null, draggedVessel: null });
        bridge.getVesselAdapter()?.onReset();
        const ack = bridge.reset(seed);
        set({
          additions: [],
          message: 'Đã làm mới cốc. Bạn có thể bắt đầu thí nghiệm khác.',
          lastAck: ack,
          hasStarted: false,
        });
      },

      start: () => {
        const ack = bridge.start();
        if (ack.accepted) {
          set({
            message: 'Đang chạy mô phỏng.',
            lastAck: ack,
            hasStarted: true,
          });
        } else {
          set({
            lastAck: ack,
          });
        }
      },

      pause: () => {
        const ack = bridge.pause();
        set({
          message: 'Đã tạm dừng mô phỏng.',
          lastAck: ack,
        });
      },

      resume: () => {
        const ack = bridge.resume();
        if (ack.accepted) {
          set({
            message: 'Đang chạy mô phỏng.',
            lastAck: ack,
            hasStarted: true,
          });
        } else {
          set({
            lastAck: ack,
          });
        }
      },

      startAuto: (level?: AutoLevel) => {
        const { showRod } = get();
        if (!showRod) {
          set({ message: 'Hiện thìa trước khi bắt đầu khuấy tự động.' });
          return;
        }
        const res = bridge.startAuto(level);
        if (res.modeAck.accepted) {
          set({
            message: 'Đang khuấy tự động.',
            lastAck: res.modeAck,
            hasStarted: true,
          });
        } else {
          set({
            lastAck: res.modeAck,
          });
        }
      },

      stopAuto: () => {
        const ack = bridge.stopAuto();
        set({
          message: 'Đã ngừng khuấy. Dòng chảy đang suy giảm.',
          lastAck: ack,
        });
      },

      setAutoLevel: (level: AutoLevel) => {
        const ack = bridge.setAutoLevel(level);
        set({
          lastAck: ack,
        });
      },

      setMode: (mode: Mode) => {
        const ack = bridge.setMode(mode);
        let message = 'Đã chuyển chế độ.';
        if (mode === 'manual') {
          message = get().showRod
            ? 'Chọn thủ công, kéo thìa để khuấy. Thả chuột để ngừng truyền lực.'
            : 'Hiện thìa khuấy để sử dụng tính năng kéo thìa thủ công.';
        } else if (mode === 'auto') {
          message = get().showRod
            ? 'Đang ở chế độ khuấy tự động.'
            : 'Hiện thìa trước khi bắt đầu khuấy tự động.';
        } else if (mode === 'observe') {
          message = 'Đang ở chế độ quan sát.';
        }
        set({
          message,
          lastAck: ack,
        });
      },

      toggleRod: () => {
        const { showRod } = get();
        if (showRod) {
          // Release drive before hiding rod as required by SPEC §3.4
          bridge.getManualAdapter()?.onHideRod();
          bridge.releaseDrive();
          set({ showRod: false });
        } else {
          // Show rod without restarting drive
          set({ showRod: true });
        }
      },

      resetCamera: () => {
        set((state) => ({ cameraRevision: state.cameraRevision + 1 }));
      },

      retryCanvas: () => {
        bridge.handleContextRestored();
        set((state) => ({
          activePour: null,
          canvasRevision: state.canvasRevision + 1,
          webglStatus: 'ready',
          message: 'Đang kết nối lại đồ họa 3D...',
        }));
      },

      reportWebGLInitFailed: () => {
        bridge.handleContextLost();
        set({
          activePour: null,
          webglStatus: 'init_failed',
          message: 'Không thể khởi tạo đồ họa 3D. Bảng điều khiển vẫn hoạt động bình thường.',
        });
      },

      reportWebGLContextLost: () => {
        bridge.handleContextLost();
        set({
          activePour: null,
          webglStatus: 'context_lost',
          message: 'Mất kết nối đồ họa 3D (WebGL context lost). Mô phỏng đã tạm dừng; dữ liệu được bảo toàn.',
        });
      },

      reportWebGLContextRestored: () => {
        bridge.handleContextRestored();
        set({
          webglStatus: 'ready',
          message: 'Đã phục hồi kết nối 3D. Nhấn Tiếp tục để tiếp tục mô phỏng.',
        });
      },

      getBridge: () => bridge,

      setBridge: (newBridge: SimulationBridge) => {
        attachBridge(newBridge);
        const vAdapter = newBridge.getVesselAdapter();
        if (vAdapter) {
          vAdapter.setStoreGetter(() => get());
        }
        const snap = newBridge.getSnapshot();
        const ticks = inputToDeciTicks(snap.input);
        set({
          snapshot: snap,
          deciTicks: ticks,
          quantities: ticksToQuantities(ticks),
          additions: [],
          lastAck: null,
        });
      },

      setSnapshot: (snapshot: ScalarSnapshot) => {
        const ticks = inputToDeciTicks(snapshot.input);
        set({
          snapshot,
          deciTicks: ticks,
          quantities: ticksToQuantities(ticks),
        });
      },
    };
  });

  // Attach subscription for initial bridge
  store.getState().setBridge(bridge);
  return store;
}

export const useExperimentStore = createExperimentStore();
