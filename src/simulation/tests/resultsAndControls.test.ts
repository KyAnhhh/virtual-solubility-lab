import { describe, expect, it } from 'vitest';
import {
  computePhaseRates,
  evaluateScienceState,
  formatCapacity,
  formatDissolutionProgress,
  formatPhaseMass,
  formatSaturationRatio,
  INITIAL_HYSTERESIS_STATE,
  updateHysteresisState,
} from '../../components/results/contentsHelpers';
import {
  significanceThreshold,
  SOLUBILITY_SUGAR_DEFAULT,
} from '../constants/science';
import type { ScalarSnapshot } from '../core/SimulationState';
import { createInitialScienceState } from '../core/SimulationState';
import { type HostClockAdapter, SimulationBridge } from '../bridge/SimulationBridge';
import { createExperimentStore } from '../../stores/experimentStore';

class MockHostClock implements HostClockAdapter {
  currentTime = 0;
  nextHandle = 1;
  callbacks = new Map<number, (timestampMs: number) => void>();

  now(): number {
    return this.currentTime;
  }

  requestAnimationFrame(cb: (timestampMs: number) => void): number {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, cb);
    return handle;
  }

  cancelAnimationFrame(handle: number): void {
    this.callbacks.delete(handle);
  }

  stepTime(deltaMs: number): void {
    this.currentTime += deltaMs;
    const cbs = Array.from(this.callbacks.entries());
    this.callbacks.clear();
    for (const [, cb] of cbs) {
      cb(this.currentTime);
    }
  }

  activeSchedulerCount(): number {
    return this.callbacks.size;
  }
}

describe('V4-04 — Kết quả, Giải thích, Hysteresis & Responsive Controls', () => {
  const seed = 1729;

  function createMockSnapshot(overrides?: Partial<ScalarSnapshot>): ScalarSnapshot {
    const base = createInitialScienceState(seed);
    const mass = { ...base.mass, ...(overrides?.mass ?? {}) };
    const input = {
      water: overrides?.input?.water ?? (mass.W * 10),
      sugar: overrides?.input?.sugar ?? (mass.Gt * 10),
      sand: overrides?.input?.sand ?? (mass.St * 10),
      oil: overrides?.input?.oil ?? (mass.Ot > 0 ? Math.round((mass.Ot / 0.9) * 10) : 0),
    };
    const capacityG = mass.W * SOLUBILITY_SUGAR_DEFAULT;
    const saturationRatio = mass.W > 0 && capacityG > 0 ? mass.Gd / capacityG : null;
    const target = Math.min(mass.Gt, capacityG);
    const dissolutionProgress = mass.W > 0 && target > 0 ? mass.Gd / target : null;

    return {
      generation: 0,
      stateVersion: 0,
      tickIndex: 0,
      elapsedSeconds: 0,
      paused: false,
      mode: 'observe',
      autoDriveEnabled: false,
      autoLevel: 'slow',
      input,
      mass,
      fGu: overrides?.fGu ?? base.fGu,
      rod: { ...base.rod, ...(overrides?.rod ?? {}) },
      intensity: 0,
      contact: 0,
      capacityG,
      saturationRatio,
      dissolutionProgress,
      ...overrides,
    };
  }

  describe('1. Formatting, Nullable & Boundary Handling (SC-U01, SC-U02)', () => {
    it('formatCapacity: trả về N/A khi không có nước (W=0) hoặc giá trị không hữu hạn', () => {
      expect(formatCapacity(0, 0)).toBe('N/A');
      expect(formatCapacity(200, 0)).toBe('N/A');
      expect(formatCapacity(0, 100)).toBe('N/A');
      expect(formatCapacity(NaN, 100)).toBe('N/A');
      expect(formatCapacity(200, 100)).toBe('200 g');
    });

    it('formatSaturationRatio: trả về N/A khi ratio là null hoặc không hữu hạn, format phần trăm có dấu phẩy', () => {
      expect(formatSaturationRatio(null)).toBe('N/A');
      expect(formatSaturationRatio(NaN)).toBe('N/A');
      expect(formatSaturationRatio(-0.5)).toBe('N/A');
      expect(formatSaturationRatio(0.4952)).toBe('49,5%');
      expect(formatSaturationRatio(1.0)).toBe('100,0%');
    });

    it('formatDissolutionProgress: cap 99,9% khi còn headroom, 100% khi hết headroom (SC-U02)', () => {
      expect(formatDissolutionProgress(null)).toBe('N/A');
      expect(formatDissolutionProgress(NaN)).toBe('N/A');
      // Khi còn headroom > 1e-8 nhưng làm tròn ra >= 99.95%:
      expect(formatDissolutionProgress(0.9996, 0.05)).toBe('99,9%');
      // Khi headroom <= 1e-8 và progress >= 99.95%:
      expect(formatDissolutionProgress(0.9998, 0)).toBe('100%');
      expect(formatDissolutionProgress(1.0, 0)).toBe('100%');
      // Tiến độ thông thường:
      expect(formatDissolutionProgress(0.422)).toBe('42,2%');
    });

    it('formatPhaseMass: mass dương < 0.1g hiển thị "<0,1 g", không làm tròn thành 0g', () => {
      expect(formatPhaseMass(0)).toBe('0 g');
      expect(formatPhaseMass(-0.001)).toBe('0 g');
      expect(formatPhaseMass(0.0001)).toBe('<0,1 g');
      expect(formatPhaseMass(0.05)).toBe('<0,1 g');
      expect(formatPhaseMass(0.099)).toBe('<0,1 g');
      expect(formatPhaseMass(0.1)).toBe('0,1 g');
      expect(formatPhaseMass(10.5)).toBe('10,5 g');
      expect(formatPhaseMass(20.0)).toBe('20 g');
    });
  });

  describe('2. Hai Chiều Hysteresis (Near-Saturation & Near-Complete) (SPEC §8)', () => {
    it('Near-saturation: enter >= 0.99, duy trì trong [0.98, 0.99), exit < 0.98', () => {
      let hyst = INITIAL_HYSTERESIS_STATE;
      expect(hyst.nearSaturation).toBe(false);

      // Dưới ngưỡng: ratio 0.95 -> false
      hyst = updateHysteresisState(hyst, { saturationRatio: 0.95, Gu: 5, Gt: 20, W: 10 });
      expect(hyst.nearSaturation).toBe(false);

      // Đạt 0.99 -> enter true
      hyst = updateHysteresisState(hyst, { saturationRatio: 0.99, Gu: 0.2, Gt: 20, W: 10 });
      expect(hyst.nearSaturation).toBe(true);

      // Giảm xuống 0.985 (nằm trong dải hysteresis [0.98, 0.99)) -> vẫn giữ true
      hyst = updateHysteresisState(hyst, { saturationRatio: 0.985, Gu: 0.3, Gt: 20, W: 10 });
      expect(hyst.nearSaturation).toBe(true);

      // Thoát dưới 0.98 (ví dụ 0.978 khi thêm nước) -> exit false
      hyst = updateHysteresisState(hyst, { saturationRatio: 0.978, Gu: 0.44, Gt: 20, W: 10 });
      expect(hyst.nearSaturation).toBe(false);

      // Khi không có nước W=0 -> luôn false
      hyst = updateHysteresisState(hyst, { saturationRatio: null, Gu: 0, Gt: 20, W: 0 });
      expect(hyst.nearSaturation).toBe(false);
    });

    it('Near-complete: enter Gu <= L(Gt), duy trì trong (L, 1.2L], exit > 1.2L (SPEC §8)', () => {
      let hyst = INITIAL_HYSTERESIS_STATE;
      const Gt = 20; // L = max(0.01, 0.01 * 20) = 0.2 g; 1.2 * L = 0.24 g
      const L = significanceThreshold(Gt);
      expect(L).toBe(0.2);

      // Gu = 1.0 > L -> false
      hyst = updateHysteresisState(hyst, { saturationRatio: 0.5, Gu: 1.0, Gt, W: 50 });
      expect(hyst.nearComplete).toBe(false);

      // Gu = 0.18 <= L -> enter true
      hyst = updateHysteresisState(hyst, { saturationRatio: 0.99, Gu: 0.18, Gt, W: 50 });
      expect(hyst.nearComplete).toBe(true);

      // Gu tăng lên 0.22 (nằm trong dải (0.2, 0.24]) -> vẫn giữ true
      hyst = updateHysteresisState(hyst, { saturationRatio: 0.98, Gu: 0.22, Gt, W: 50 });
      expect(hyst.nearComplete).toBe(true);

      // Gu tăng vượt 0.24 (ví dụ 0.25) -> exit false
      hyst = updateHysteresisState(hyst, { saturationRatio: 0.98, Gu: 0.25, Gt, W: 50 });
      expect(hyst.nearComplete).toBe(false);

      // Khi có đường dư vượt sức chứa (Gt > capacityG + eps): không bao giờ được phép nearComplete
      hyst = updateHysteresisState(hyst, { saturationRatio: 1.0, Gu: 0.15, Gt: 100, W: 10, capacityG: 20 });
      expect(hyst.nearComplete).toBe(false);
    });
  });

  describe('3. Tiến Độ Hòa Tan khi Có Đường Dư Vượt Sức Chứa (SC-U02)', () => {
    it('Gu > 0 không ngăn cản progress đạt gần 100% nếu lượng dư vượt capacity (SC-U02)', () => {
      // W=10g -> capacityG = 20g; Gt = 30g (dư 10g)
      // Khi Gd = 19.99g, lượng có thể tan target = min(30, 20) = 20g
      // progress = 19.99 / 20 = 99.95% -> cap 99,9% vì còn headroom 0.01g
      const dissolvableTarget = Math.min(30, 20);
      const Gd = 19.99;
      const progress = Gd / dissolvableTarget;
      const headroom = dissolvableTarget - Gd;

      expect(formatDissolutionProgress(progress, headroom)).toBe('99,9%');

      // Khi Gd = 20g (đạt giới hạn), headroom = 0
      const progressMax = 20 / dissolvableTarget;
      expect(formatDissolutionProgress(progressMax, 0)).toBe('100%');
    });
  });

  describe('4. Continuous Phase Rates & Settling / Separating Predicates', () => {
    it('computePhaseRates trả về tỷ lệ liên tục không mutate snapshot, paused cho rates = 0', () => {
      const snap = createMockSnapshot({
        mass: {
          W: 100,
          Gt: 20,
          Gu: 10,
          Gd: 10,
          St: 10,
          Sb: 5,
          Ss: 5,
          Ot: 18,
          Ol: 9,
          Od: 9,
        },
        intensity: 0.5,
      });

      const rates = computePhaseRates(snap);
      expect(rates.dG_dt).toBeGreaterThan(0);
      expect(typeof rates.dSs_dt).toBe('number');
      expect(typeof rates.dOd_dt).toBe('number');

      // Khi paused: rates bằng 0 tuyệt đối
      const pausedSnap = createMockSnapshot({
        ...snap,
        paused: true,
      });
      const pausedRates = computePhaseRates(pausedSnap);
      expect(pausedRates.dG_dt).toBe(0);
      expect(pausedRates.dSs_dt).toBe(0);
      expect(pausedRates.dOd_dt).toBe(0);
    });

    it('Đồng thời ghi nhận hiện tượng cát lắng và dầu tách lớp mà không ép trạng thái che khuất lẫn nhau', () => {
      // Cốc có nước, cát Ss đang lắng (intensity = 0 -> dSs/dt < 0) và dầu Od đang tách (intensity = 0 -> dOd/dt < 0)
      const snap = createMockSnapshot({
        mass: {
          W: 100,
          Gt: 0,
          Gu: 0,
          Gd: 0,
          St: 10,
          Sb: 2,
          Ss: 8,
          Ot: 18,
          Ol: 5,
          Od: 13,
        },
        intensity: 0,
        paused: false,
      });

      const evalResult = evaluateScienceState(snap, INITIAL_HYSTERESIS_STATE);
      expect(evalResult.isSettling).toBe(true);
      expect(evalResult.isSeparating).toBe(true);
      expect(evalResult.explanation).toContain('Cát không tan: đang lắng dần');
      expect(evalResult.explanation).toContain('Dầu không tan trong nước: các giọt dầu đang nổi lên và tách lớp');
    });

    it('Không suy ra "đang lắng" hoặc "đang tách lớp" nếu Ss hoặc Od không đáng kể (<= L)', () => {
      // Ss rất nhỏ (0.005g < L=0.1g)
      const snap = createMockSnapshot({
        mass: {
          W: 100,
          Gt: 0,
          Gu: 0,
          Gd: 0,
          St: 10,
          Sb: 9.995,
          Ss: 0.005,
          Ot: 0,
          Ol: 0,
          Od: 0,
        },
        intensity: 0,
        paused: false,
      });

      const evalResult = evaluateScienceState(snap, INITIAL_HYSTERESIS_STATE);
      expect(evalResult.isSettling).toBe(false);
      expect(evalResult.explanation).toContain('toàn bộ cát lắng đọng thành lớp ở đáy cốc');
    });
  });

  describe('5. Thứ Tự Ưu Tiên Giải Thích Hiện Tượng (Condition Priority)', () => {
    it('Ưu tiên 1: Cốc rỗng (Empty)', () => {
      const snap = createMockSnapshot({
        input: { water: 0, sugar: 0, sand: 0, oil: 0 },
        mass: { W: 0, Gt: 0, Gu: 0, Gd: 0, St: 0, Sb: 0, Ss: 0, Ot: 0, Ol: 0, Od: 0 },
      });
      const evalResult = evaluateScienceState(snap, INITIAL_HYSTERESIS_STATE);
      expect(evalResult.explanation).toContain('Cốc rỗng');
    });

    it('Ưu tiên 2: Tạm dừng (Paused) - không báo quá trình đang tiến triển khi có nhiều chất', () => {
      const snap = createMockSnapshot({
        input: { water: 1000, sugar: 200, sand: 0, oil: 0 },
        mass: { W: 100, Gt: 20, Gu: 10, Gd: 10, St: 0, Sb: 0, Ss: 0, Ot: 0, Ol: 0, Od: 0 },
        paused: true,
      });
      const evalResult = evaluateScienceState(snap, INITIAL_HYSTERESIS_STATE);
      expect(evalResult.explanation).toContain('Mô phỏng đang tạm dừng');
      expect(evalResult.explanation).not.toContain('đang tan nhanh hơn');
      expect(evalResult.explanation).not.toContain('đang lắng');
    });

    it('Ưu tiên 3: Không có nước (Dry / Oil-only)', () => {
      const snap = createMockSnapshot({
        input: { water: 0, sugar: 200, sand: 0, oil: 0 },
        mass: { W: 0, Gt: 20, Gu: 20, Gd: 0, St: 0, Sb: 0, Ss: 0, Ot: 0, Ol: 0, Od: 0 },
        paused: false,
      });
      const evalResult = evaluateScienceState(snap, INITIAL_HYSTERESIS_STATE);
      expect(evalResult.explanation).toContain('Chưa có nước');
    });
  });

  describe('6. Ba Kịch Bản Người Học (UC1, UC2, UC3) trên Engine & Store Thật', () => {
    it('UC1 — Đường: tốc độ và lượng có thể tan (Observe vs Auto Fast & Saturation & Paused Add)', () => {
      const bridgeObs = new SimulationBridge({ hostClock: new MockHostClock() });
      const storeObs = createExperimentStore(bridgeObs);
      const bridgeFast = new SimulationBridge({ hostClock: new MockHostClock() });
      const storeFast = createExperimentStore(bridgeFast);

      // Thêm 100ml nước + 1g đường cho cả hai
      storeObs.getState().add('water', 100);
      storeObs.getState().add('sugar', 1);
      storeFast.getState().add('water', 100);
      storeFast.getState().add('sugar', 1);

      // Sức chứa của cả hai đều là 200g (2.0 * 100)
      expect(bridgeObs.getEngine().getState().mass.W * SOLUBILITY_SUGAR_DEFAULT).toBe(200);
      expect(bridgeFast.getEngine().getState().mass.W * SOLUBILITY_SUGAR_DEFAULT).toBe(200);

      // Chạy 15 sim seconds = 900 ticks
      storeObs.getState().start();
      storeFast.getState().start();
      storeFast.getState().startAuto('fast'); // 6.0 rad/s

      for (let i = 0; i < 900; i++) {
        bridgeObs.getEngine().advance(1 / 60);
        bridgeFast.getEngine().advance(1 / 60);
      }

      // Fast khuấy làm tăng tốc độ hòa tan rõ rệt so với observe
      const stateObs = bridgeObs.getEngine().getState();
      const stateFast = bridgeFast.getEngine().getState();
      expect(stateFast.mass.Gd).toBeGreaterThan(stateObs.mass.Gd);
      expect(stateFast.mass.Gt).toBe(1.0);
      expect(stateObs.mass.Gt).toBe(1.0);

      // Lượt saturation riêng: W=40ml, G=100g -> capacity 80g
      const bridgeSat = new SimulationBridge({ hostClock: new MockHostClock() });
      const storeSat = createExperimentStore(bridgeSat);
      storeSat.getState().add('water', 40);
      storeSat.getState().add('sugar', 100);
      const capacitySat = bridgeSat.getEngine().getState().mass.W * SOLUBILITY_SUGAR_DEFAULT;
      expect(capacitySat).toBe(80);

      storeSat.getState().start();
      storeSat.getState().startAuto('fast');
      for (let i = 0; i < 3600; i++) {
        bridgeSat.getEngine().advance(1 / 60);
      }
      const satState = bridgeSat.getEngine().getState();
      expect(satState.mass.Gd).toBeLessThanOrEqual(80 + 1e-8);
      expect(satState.mass.Gu).toBeGreaterThanOrEqual(20 - 1e-8); // Dư ít nhất 20g

      // Thêm nước 10ml khi paused: capacity tăng lên 100g, nhưng Gd và thời gian giữ nguyên
      storeSat.getState().pause();
      const gdBeforeAdd = satState.mass.Gd;
      const timeBeforeAdd = satState.elapsedSeconds;
      storeSat.getState().add('water', 10);
      const stateAfterAdd = bridgeSat.getEngine().getState();
      expect(stateAfterAdd.mass.W).toBe(50);
      expect(stateAfterAdd.mass.W * SOLUBILITY_SUGAR_DEFAULT).toBe(100);
      expect(stateAfterAdd.mass.Gd).toBe(gdBeforeAdd);
      expect(stateAfterAdd.elapsedSeconds).toBe(timeBeforeAdd);
    });

    it('UC2 — Cát: phân tán không phải tan (Suspension, Stop settling, Pause freezes, No dissolved sand)', () => {
      const bridge = new SimulationBridge({ hostClock: new MockHostClock() });
      const store = createExperimentStore(bridge);

      store.getState().add('water', 100);
      store.getState().add('sand', 10);
      store.getState().start();
      store.getState().startAuto('fast');

      // Chạy 600 ticks (10s) -> cát lơ lửng Ss tăng
      for (let i = 0; i < 600; i++) {
        bridge.getEngine().advance(1 / 60);
      }
      const stateStirred = bridge.getEngine().getState();
      expect(stateStirred.mass.Ss).toBeGreaterThan(1.0);
      expect(stateStirred.mass.St).toBe(10);

      // Ngừng khuấy (stopAuto): đồng hồ tiếp tục chạy, dòng chảy suy giảm, cát lắng dần
      store.getState().stopAuto();
      expect(bridge.getEngine().getState().paused).toBe(false);
      expect(bridge.getEngine().getState().autoDriveEnabled).toBe(false);

      for (let i = 0; i < 600; i++) {
        bridge.getEngine().advance(1 / 60);
      }
      const stateSettled = bridge.getEngine().getState();
      expect(stateSettled.mass.Ss).toBeLessThan(stateStirred.mass.Ss);
      expect(stateSettled.mass.Sb).toBeGreaterThan(stateStirred.mass.Sb);
      expect(stateSettled.mass.Sb + stateSettled.mass.Ss).toBeCloseTo(10, 8);

      // Cát không bao giờ tan
      expect(stateSettled.mass.St).toBe(10);
      // Tạm dừng đóng băng tiến trình
      store.getState().pause();
      const ssPaused = bridge.getEngine().getState().mass.Ss;
      const tPaused = bridge.getEngine().getState().elapsedSeconds;
      bridge.getEngine().advance(1 / 60);
      expect(bridge.getEngine().getState().mass.Ss).toBe(ssPaused);
      expect(bridge.getEngine().getState().elapsedSeconds).toBe(tPaused);
    });

    it('UC3 — Bốn chất, Pause/Add/Resume/Reset, Hysteresis reset & Preference preservation', () => {
      const bridge = new SimulationBridge({ hostClock: new MockHostClock() });
      const store = createExperimentStore(bridge);

      store.getState().add('water', 100);
      store.getState().add('oil', 20);
      store.getState().add('sugar', 10);
      store.getState().add('sand', 10);

      store.getState().start();
      store.getState().startAuto('fast');
      for (let i = 0; i < 300; i++) bridge.getEngine().advance(1 / 60);

      // Chuyển manual rồi stop
      store.getState().setMode('manual');
      for (let i = 0; i < 300; i++) bridge.getEngine().advance(1 / 60);

      // Pause rồi add
      store.getState().pause();
      const gen1 = bridge.getEngine().getState().generation;
      const time1 = bridge.getEngine().getState().elapsedSeconds;
      store.getState().add('water', 10);
      store.getState().add('sugar', 1);

      expect(bridge.getEngine().getState().generation).toBe(gen1);
      expect(bridge.getEngine().getState().elapsedSeconds).toBe(time1);
      expect(bridge.getEngine().getState().mass.W).toBe(110);
      expect(bridge.getEngine().getState().mass.Gt).toBe(11);

      // Camera reset không làm thay đổi state khoa học
      const camRevBefore = store.getState().cameraRevision;
      store.getState().resetCamera();
      expect(store.getState().cameraRevision).toBe(camRevBefore + 1);
      expect(bridge.getEngine().getState().generation).toBe(gen1);
      expect(bridge.getEngine().getState().mass.W).toBe(110);

      // Resume
      store.getState().resume();
      for (let i = 0; i < 120; i++) bridge.getEngine().advance(1 / 60);

      // Scientific Reset: tăng generation, làm sạch state, time về 0, giữ cameraRevision và showRod
      const showRodBefore = store.getState().showRod;
      store.getState().reset();
      const resetState = bridge.getEngine().getState();
      expect(resetState.generation).toBe(gen1 + 1);
      expect(resetState.tickIndex).toBe(0);
      expect(resetState.elapsedSeconds).toBe(0);
      expect(resetState.paused).toBe(true);
      expect(resetState.mass.W).toBe(0);
      expect(resetState.mass.Gt).toBe(0);
      expect(resetState.mass.St).toBe(0);
      expect(resetState.mass.Ot).toBe(0);
      expect(store.getState().showRod).toBe(showRodBefore);
      expect(store.getState().cameraRevision).toBe(camRevBefore + 1);
    });
  });
});
