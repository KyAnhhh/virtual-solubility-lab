import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type {
  Addition,
  DeciTicks,
  ExperimentSnapshot,
  IngredientId,
  Quantities,
} from '../types/experiment';
import {
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

  // UI state
  additions: Addition[];
  message: string;
  lastAck: Ack | null;
  showRod: boolean;
  cameraRevision: number;
  hasStarted: boolean;
  webglStatus: WebGLStatus;
  canvasRevision: number;

  // Authoritative actions dispatched via bridge
  add: (id: IngredientId, amount: unknown) => boolean;
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

    return {
      snapshot: initialSnapshot,
      deciTicks: initialDeciTicks,
      quantities: ticksToQuantities(initialDeciTicks),
      additions: [],
      message: 'Bắt đầu bằng cách thêm nước vào cốc.',
      lastAck: null,
      showRod: true,
      cameraRevision: 0,
      hasStarted: !initialSnapshot.paused,
      webglStatus: 'ready',
      canvasRevision: 0,

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

      reset: (seed?: number) => {
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
          canvasRevision: state.canvasRevision + 1,
          webglStatus: 'ready',
          message: 'Đang kết nối lại đồ họa 3D...',
        }));
      },

      reportWebGLInitFailed: () => {
        bridge.handleContextLost();
        set({
          webglStatus: 'init_failed',
          message: 'Không thể khởi tạo đồ họa 3D. Bảng điều khiển vẫn hoạt động bình thường.',
        });
      },

      reportWebGLContextLost: () => {
        bridge.handleContextLost();
        set({
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
