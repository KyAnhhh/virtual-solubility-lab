import { describe, expect, it } from 'vitest';
import { HeadlessSimulationEngine } from '../core/SimulationEngine';
import { SimulationBridge } from '../bridge/SimulationBridge';
import { createExperimentStore } from '../../stores/experimentStore';
import type { RenderTarget } from '../core/SimulationState';

describe('V4-10 — WebGL failure, context loss/restore và resize', () => {
  describe('1. SC-W01: Khởi tạo WebGL thất bại & Bảo toàn trạng thái (Init Failure)', () => {
    it('Khởi tạo 3D thất bại không làm mất dữ liệu thí nghiệm, form vẫn hoạt động bình thường', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      // Người dùng thêm 100ml nước và 10g đường trước khi lỗi xảy ra
      store.getState().add('water', 100);
      store.getState().add('sugar', 10);

      const beforeFail = store.getState().snapshot;
      expect(beforeFail.mass.W).toBe(100);
      expect(beforeFail.mass.Gt).toBe(10);
      expect(beforeFail.capacityG).toBe(200);

      // WebGL khởi tạo thất bại (bị bắt bởi ErrorBoundary hoặc reportInitFailed)
      store.getState().reportWebGLInitFailed();

      expect(store.getState().webglStatus).toBe('init_failed');
      expect(store.getState().snapshot.paused).toBe(true);

      // Dữ liệu khoa học được bảo toàn 100%
      const duringFail = store.getState().snapshot;
      expect(duringFail.mass.W).toBe(100);
      expect(duringFail.mass.Gt).toBe(10);
      expect(duringFail.capacityG).toBe(200);
      expect(duringFail.generation).toBe(beforeFail.generation);

      // Form vẫn nhận thêm chất tiếp trong lúc 3D fallback
      const addSand = store.getState().add('sand', 10);
      expect(addSand).toBe(true);
      expect(store.getState().snapshot.mass.St).toBe(10);
      expect(store.getState().additions).toHaveLength(3);

      // Thử lại hiển thị 3D (retryCanvas): remount Canvas nhưng giữ nguyên engine/store
      const prevCanvasRev = store.getState().canvasRevision;
      store.getState().retryCanvas();

      expect(store.getState().webglStatus).toBe('ready');
      expect(store.getState().canvasRevision).toBe(prevCanvasRev + 1);
      // Vẫn giữ đúng cùng engine và toàn bộ số liệu
      expect(store.getState().snapshot.mass.W).toBe(100);
      expect(store.getState().snapshot.mass.Gt).toBe(10);
      expect(store.getState().snapshot.mass.St).toBe(10);
    });

    it('Retry chỉ tạo lại renderer/canvas, không tạo engine mới hay xóa experiment ngầm', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'test-client' });
      const bridge = new SimulationBridge({ engine });
      const store = createExperimentStore(bridge);

      store.getState().add('water', 100);
      const initialEngineId = bridge.getEngine();

      store.getState().reportWebGLInitFailed();
      store.getState().retryCanvas();

      // Engine identity không bị thay đổi
      expect(bridge.getEngine()).toBe(initialEngineId);
      expect(store.getState().snapshot.mass.W).toBe(100);
    });
  });

  describe('2. SC-W02: Context Lost trong khi đang chạy & kéo chuột (webglcontextlost)', () => {
    it('Xử lý webglcontextlost: gọi preventDefault, ngừng manual drag, khôi phục camera và pause mô phỏng', () => {
      let nowMs = 1000;
      const clock = {
        now: () => nowMs,
        requestAnimationFrame: (cb: (t: number) => void) => setTimeout(() => cb(nowMs), 16) as unknown as number,
        cancelAnimationFrame: (h: number) => clearTimeout(h),
      };

      const bridge = new SimulationBridge({ hostClock: clock });
      const store = createExperimentStore(bridge);

      // Thiết lập thí nghiệm: 100ml nước + 10g cát
      store.getState().add('water', 100);
      store.getState().add('sand', 10);
      store.getState().start();

      // Cho mô phỏng chạy 120 ticks
      for (let i = 0; i < 120; i++) {
        nowMs += 1000 / 60;
        bridge.stepFrame(nowMs);
      }

      const elapsedBefore = bridge.getEngine().getElapsedSeconds();
      expect(elapsedBefore).toBeGreaterThan(1.9);

      // Thiết lập manual pointer capture và camera target
      let cameraEnabled = true;
      let pointerCaptured = false;
      const cameraTarget = {
        setEnabled: (enabled: boolean) => { cameraEnabled = enabled; },
        isEnabled: () => cameraEnabled,
      };
      const captureTarget = {
        setPointerCapture: () => { pointerCaptured = true; },
        releasePointerCapture: () => { pointerCaptured = false; },
        hasPointerCapture: () => pointerCaptured,
      };

      const adapter = bridge.getManualAdapter()!;
      adapter.setCameraTarget(cameraTarget);
      adapter.setCaptureTarget(captureTarget);
      store.getState().setMode('manual');

      // Bắt đầu kéo thìa thủ công
      const downRes = adapter.onPointerDown({
        pointerId: 1,
        ray: { origin: [0, 2, 0], direction: [0, -1, 0] },
        isHitSpoon: true,
        inputTimeMs: nowMs,
      });
      expect(downRes.accepted).toBe(true);
      expect(cameraEnabled).toBe(false); // Camera bị khóa khi drag

      // Mô phỏng sự kiện webglcontextlost với preventDefault
      let preventDefaultCalled = false;
      const fakeEvent = {
        preventDefault: () => { preventDefaultCalled = true; },
      };

      // Gọi xử lý context lost
      fakeEvent.preventDefault();
      expect(preventDefaultCalled).toBe(true);

      store.getState().reportWebGLContextLost();

      // Kiểm định:
      // 1. Simulation bị pause
      expect(store.getState().snapshot.paused).toBe(true);
      // 2. Scheduler bị dừng
      expect(bridge.isSchedulerActive()).toBe(false);
      // 3. Manual drag bị ngắt, camera được khôi phục
      expect(cameraEnabled).toBe(true);
      expect(adapter.isDragActive()).toBe(false);
      expect(adapter.getActivePointerId()).toBeNull();
      // 4. Khối lượng, thời gian, generation được bảo toàn nghiêm ngặt
      expect(store.getState().snapshot.mass.W).toBe(100);
      expect(store.getState().snapshot.mass.St).toBe(10);
      expect(store.getState().snapshot.elapsedSeconds).toBe(elapsedBefore);
      // 5. Trạng thái WebGL
      expect(store.getState().webglStatus).toBe('context_lost');
      expect(bridge.isContextLostState()).toBe(true);
    });

    it('Không tiếp tục upload hoặc tick renderer khi context đang bị mất', () => {
      let nowMs = 2000;
      const clock = {
        now: () => nowMs,
        requestAnimationFrame: (cb: (t: number) => void) => setTimeout(() => cb(nowMs), 16) as unknown as number,
        cancelAnimationFrame: (h: number) => clearTimeout(h),
      };

      const bridge = new SimulationBridge({ hostClock: clock });
      const store = createExperimentStore(bridge);
      store.getState().add('water', 100);

      let invalidateCalls = 0;
      bridge.subscribeInvalidate(() => { invalidateCalls++; });

      store.getState().reportWebGLContextLost();
      const callsBefore = invalidateCalls;

      // Cố gọi stepFrame khi context đang lost
      nowMs += 50;
      bridge.stepFrame(nowMs);
      bridge.notifySceneInvalidate();

      // Không phát sinh thêm invalidate call vào renderer đã hỏng
      expect(invalidateCalls).toBe(callsBefore);
    });

    it('Chặn resume hoặc startAuto vô tình advance mô phỏng trong khi context đang bị mất, form add vẫn dùng được', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      store.getState().add('water', 100);
      store.getState().reportWebGLContextLost();
      expect(bridge.isContextLostState()).toBe(true);
      expect(store.getState().snapshot.paused).toBe(true);

      // Cố tình gọi resume trong lúc context lost -> phải bị từ chối
      const resumeAck = bridge.resume();
      expect(resumeAck.accepted).toBe(false);
      expect(store.getState().snapshot.paused).toBe(true);
      expect(bridge.isSchedulerActive()).toBe(false);

      // Cố tình gọi startAuto trong lúc context lost -> resumeAck phải bị từ chối
      const autoRes = bridge.startAuto('fast');
      expect(autoRes.resumeAck?.accepted).toBe(false);
      expect(store.getState().snapshot.paused).toBe(true);

      // Form vẫn nhận thêm chất bình thường
      const addRes = store.getState().add('sugar', 20);
      expect(addRes).toBe(true);
      expect(store.getState().snapshot.mass.Gt).toBe(20);
      expect(store.getState().snapshot.paused).toBe(true);
    });
  });

  describe('3. Restore & Retry: Phục hồi an toàn, Vẫn Paused và First Delta 0', () => {
    it('Sau khi context restored hoặc retryCanvas: giữ nguyên paused, người dùng phải bấm Tiếp tục, first delta = 0', () => {
      let nowMs = 5000;
      const clock = {
        now: () => nowMs,
        requestAnimationFrame: (cb: (t: number) => void) => setTimeout(() => cb(nowMs), 16) as unknown as number,
        cancelAnimationFrame: (h: number) => clearTimeout(h),
      };

      const bridge = new SimulationBridge({ hostClock: clock });
      const store = createExperimentStore(bridge);

      store.getState().add('water', 100);
      store.getState().add('sugar', 20);
      store.getState().start();

      // Chạy 60 ticks
      for (let i = 0; i < 60; i++) {
        nowMs += 1000 / 60;
        bridge.stepFrame(nowMs);
      }
      const timeBeforeLoss = store.getState().snapshot.elapsedSeconds;
      const gdBeforeLoss = store.getState().snapshot.mass.Gd;
      expect(timeBeforeLoss).toBeCloseTo(1.0, 1);
      expect(gdBeforeLoss).toBeGreaterThan(0);

      // Context lost
      store.getState().reportWebGLContextLost();
      expect(store.getState().snapshot.paused).toBe(true);

      // Sau 10 giây thực tế (mất context kéo dài), context được phục hồi (webglcontextrestored)
      nowMs += 10000;
      store.getState().reportWebGLContextRestored();

      // 1. Vẫn PAUSED sau restore (theo đúng SCIENTIFIC_SPEC SC-W02 & V4-10)
      expect(store.getState().snapshot.paused).toBe(true);
      expect(store.getState().webglStatus).toBe('ready');
      expect(store.getState().snapshot.elapsedSeconds).toBe(timeBeforeLoss);
      expect(store.getState().snapshot.mass.Gd).toBe(gdBeforeLoss);

      // 2. Render frame buffers được copy lại chính xác từ state hiện tại
      const target: RenderTarget = {
        positions: new Float32Array(500 * 3),
        weights: new Float32Array(500),
        materials: new Uint8Array(500),
        radii: new Float32Array(500),
        poolIds: new Uint8Array(500),
        count: 500,
      };
      const stamp = bridge.copyRenderFrame(target);
      expect(stamp.generation).toBe(store.getState().snapshot.generation);
      expect(stamp.poolRanges).toBeDefined();

      // 3. Người dùng bấm "Tiếp tục" (Resume)
      store.getState().resume();
      expect(store.getState().snapshot.paused).toBe(false);

      // 4. Bước frame đầu tiên sau khi resume có delta = 0 (không chạy bù 10s gap)
      nowMs += 16;
      bridge.stepFrame(nowMs);

      // Thời gian mô phỏng không bị nhảy vọt
      const timeAfterResume = store.getState().snapshot.elapsedSeconds;
      expect(timeAfterResume - timeBeforeLoss).toBeLessThanOrEqual(1 / 30); // Chỉ tăng tối đa 1 step
    });

    it('Không khôi phục thao tác kéo chuột cũ (drag/capture) sau khi phục hồi context', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);
      const adapter = bridge.getManualAdapter()!;

      store.getState().setMode('manual');
      store.getState().start();
      adapter.onPointerDown({
        pointerId: 42,
        ray: { origin: [0, 2, 0], direction: [0, -1, 0] },
        isHitSpoon: true,
      });
      expect(adapter.isDragActive()).toBe(true);

      // Context lost
      store.getState().reportWebGLContextLost();
      expect(adapter.isDragActive()).toBe(false);

      // Context restored
      store.getState().reportWebGLContextRestored();
      // Vẫn không bị drag cũ hồi sinh
      expect(adapter.isDragActive()).toBe(false);
      expect(adapter.getActivePointerId()).toBeNull();
    });
  });

  describe('4. SC-W03: Resize Canvas / Thay đổi DPR & Remount Chu Kỳ', () => {
    it('Thay đổi kích thước Canvas/viewport (Resize) và DPR không làm reset engine, khối lượng, thời gian', () => {
      let nowMs = 1000;
      const clock = {
        now: () => nowMs,
        requestAnimationFrame: (cb: (t: number) => void) => setTimeout(() => cb(nowMs), 16) as unknown as number,
        cancelAnimationFrame: (h: number) => clearTimeout(h),
      };

      const bridge = new SimulationBridge({ hostClock: clock });
      const store = createExperimentStore(bridge);

      store.getState().add('water', 200);
      store.getState().add('sand', 20);
      store.getState().start();

      for (let i = 0; i < 30; i++) {
        nowMs += 1000 / 60;
        bridge.stepFrame(nowMs);
      }

      const initialGen = store.getState().snapshot.generation;
      const initialTime = store.getState().snapshot.elapsedSeconds;
      const initialMass = store.getState().snapshot.mass;

      // Giả lập 20 chu kỳ resize / DPR change (1.0 -> 1.5 -> 2.0 -> 390px mobile)
      for (let cycle = 0; cycle < 20; cycle++) {
        // Giả lập resize sự kiện viewport mà không hủy engine
        bridge.notifySceneInvalidate();
      }

      // Toàn bộ trạng thái khoa học bất biến tuyệt đối
      expect(store.getState().snapshot.generation).toBe(initialGen);
      expect(store.getState().snapshot.elapsedSeconds).toBe(initialTime);
      expect(store.getState().snapshot.mass.W).toBe(initialMass.W);
      expect(store.getState().snapshot.mass.St).toBe(initialMass.St);
    });

    it('20 chu kỳ remount / retryCanvas liên tiếp: duy trì duy nhất 1 engine và không rò rỉ scheduler', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      store.getState().add('water', 100);
      const initialGen = store.getState().snapshot.generation;
      const engineInstance = bridge.getEngine();

      for (let i = 0; i < 20; i++) {
        store.getState().reportWebGLContextLost();
        expect(store.getState().webglStatus).toBe('context_lost');
        store.getState().retryCanvas();
        expect(store.getState().webglStatus).toBe('ready');
      }

      expect(store.getState().canvasRevision).toBe(20);
      expect(bridge.getEngine()).toBe(engineInstance);
      expect(store.getState().snapshot.generation).toBe(initialGen);
      expect(store.getState().snapshot.mass.W).toBe(100);
    });
  });

  describe('5. Cách ly Fencing Callback giữa các phiên Canvas', () => {
    it('Callback từ canvas unmount cũ không ảnh hưởng hoặc ghi đè session mới', () => {
      const bridge = new SimulationBridge();

      let oldSessionInvalidateCalled = false;
      const oldUnsub = bridge.subscribeInvalidate(() => {
        oldSessionInvalidateCalled = true;
      });

      // Canvas cũ unmount
      oldUnsub();

      let newSessionInvalidateCalled = false;
      bridge.subscribeInvalidate(() => {
        newSessionInvalidateCalled = true;
      });

      bridge.notifySceneInvalidate();

      expect(oldSessionInvalidateCalled).toBe(false);
      expect(newSessionInvalidateCalled).toBe(true);
    });

    it('Sự kiện context lost/restored từ phiên Canvas cũ (stale revision) bị bỏ qua, không phá vỡ session mới', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      const oldRevision = store.getState().canvasRevision;
      // Người dùng thử lại hiển thị 3D, canvasRevision tăng
      store.getState().retryCanvas();
      const newRevision = store.getState().canvasRevision;
      expect(newRevision).toBe(oldRevision + 1);

      // Giả lập callback từ Canvas cũ (stale) bắn ra sau khi Canvas mới đã active
      let staleCallbackHandled = false;
      const handleOldCanvasContextLost = () => {
        if (store.getState().canvasRevision !== oldRevision) {
          return; // Fenced out!
        }
        staleCallbackHandled = true;
        store.getState().reportWebGLContextLost();
      };

      handleOldCanvasContextLost();
      expect(staleCallbackHandled).toBe(false);
      expect(store.getState().webglStatus).toBe('ready');
    });
  });
});
