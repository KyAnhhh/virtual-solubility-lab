import { describe, expect, it } from 'vitest';
import { HeadlessSimulationEngine } from '../core/HeadlessSimulationEngine';
import { HeadlessSimulationFacade } from '../core/SimulationEngine';
import {
  computeBeakerRegions,
  computeMechanicalContact,
  computeParticleBounds,
  volumeToHeight,
  type PhaseMasses,
} from '../constants/beaker';
import {
  DISSOLUTION_RATE_BASE,
  DISSOLUTION_RATE_STIRRED,
  epsilonMass,
  SOLUBILITY_SUGAR_DEFAULT,
} from '../constants/science';
import {
  computeAnalyticDissolution,
  computeDissolutionStep,
  stepDissolution,
} from '../models/Dissolution';
import {
  computePoolBounds,
  PARTICLE_RADIUS_OIL_DROPLET,
} from '../models/ParticleTransport';
import type { ScienceMassCompartments, ScienceState } from '../core/SimulationState';
import { createInitialScienceState } from '../core/SimulationState';

describe('V4-03 — Render Nước và Dầu (Layer/Droplets) & Đính chính Hòa tan', () => {
  const seed = 1729;

  describe('1. Xác minh Sai lệch Công thức Hòa tan & Ba Regressions Bắt buộc', () => {
    it('đặc tả dự án quy định kG = 0.025 + 0.25*I, capacityG = 2*W, dG = available*(1 - exp(-kG*h))', () => {
      expect(DISSOLUTION_RATE_BASE).toBe(0.025);
      expect(DISSOLUTION_RATE_STIRRED).toBe(0.25);
      expect(SOLUBILITY_SUGAR_DEFAULT).toBe(2.0);

      const mass: ScienceMassCompartments = {
        W: 10,
        Gt: 30,
        Gu: 30,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };

      const stepI0 = computeDissolutionStep(mass, { intensity: 0, h: 1 / 60 });
      expect(stepI0.kG).toBe(0.025);
      expect(stepI0.capacityG).toBe(20);
      expect(stepI0.gap).toBe(20);
      expect(stepI0.available).toBe(20);

      const stepI1 = computeDissolutionStep(mass, { intensity: 1, h: 1 / 60 });
      expect(stepI1.kG).toBe(0.275);
    });

    it('Regression 1: Có nước, I=0 (không khuấy): đường vẫn tan ở tốc độ nền kG0 = 0.025 s^-1', () => {
      // W=10g, Gt=30g, Gu=30g, Gd=0g sau 1s (60 ticks, h=1/60s) ở I=0:
      // Gd(1s) = 20 * (1 - exp(-0.025 * 1)) ≈ 0.493801759 g
      const analyticGd = computeAnalyticDissolution(1.0, 10, 30, 0);
      expect(analyticGd).toBeCloseTo(0.493801759, 8);

      // Tích phân từng bước 60 ticks
      const state: ScienceState = {
        ...createInitialScienceState(seed),
        input: {
          water: 100, // 100 deciTicks = 10 g
          sugar: 300, // 300 deciTicks = 30 g
          sand: 0,
          oil: 0,
        },
        mass: {
          W: 10,
          Gt: 30,
          Gu: 30,
          Gd: 0,
          St: 0,
          Sb: 0,
          Ss: 0,
          Ot: 0,
          Ol: 0,
          Od: 0,
        },
      };

      for (let i = 0; i < 60; i++) {
        stepDissolution(state, { intensity: 0, h: 1 / 60 });
      }

      expect(state.mass.Gd).toBeCloseTo(0.493801759, 7);
      expect(state.mass.Gu).toBeCloseTo(30 - 0.493801759, 7);
      expect(state.mass.Gu + state.mass.Gd).toBeCloseTo(30, 10);
    });

    it('Regression 2: Có nước nhưng contact=0 (thìa không chạm nước) hoặc I=0: vẫn có hòa tan nền 0.025 s^-1', () => {
      // 1. Kiểm tra với W = 0.1ml (Fixture T, mức chất lỏng 0.12042 < tipY 0.14 nên contact = 0)
      const phasesContact0: PhaseMasses = {
        Wml: 0.1,
        Oml: 0,
        Gt: 1.0,
        Gu: 1.0,
        Gd: 0,
        fGu: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const regions = computeBeakerRegions(phasesContact0);
      const contact = computeMechanicalContact(regions, 0.14);
      expect(contact).toBe(0); // Thìa hoàn toàn chưa chạm nước

      // Dù contact = 0, mô hình hòa tan dựa trên W > 0 và kG0 = 0.025 s^-1
      const massT: ScienceMassCompartments = {
        W: 0.1,
        Gt: 1.0,
        Gu: 1.0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const step = computeDissolutionStep(massT, { intensity: 0, h: 1 / 60 });
      expect(step.dG).toBeGreaterThan(0); // Vẫn có hòa tan nền!
      expect(step.kG).toBe(0.025);

      // 2. Kiểm tra trên engine thật ở chế độ observe (intensity = 0, thìa nghỉ)
      const engine = new HeadlessSimulationEngine({ clientId: 'observe-dissolve', seed });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 100 }); // 10ml
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 300 }); // 30g
      facade.dispatchIntent({ type: 'resume' });

      for (let i = 0; i < 60; i++) {
        engine.advance(1 / 60);
      }

      const snap = engine.snapshot();
      expect(snap.intensity).toBe(0);
      expect(snap.mass.Gd).toBeCloseTo(0.493801759, 5); // Hòa tan nền đúng 1s
    });

    it('Regression 3: Không có nước (W=0), dù có dầu và khuấy mạnh: KHÔNG hòa tan đường', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'no-water-dissolve', seed });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 1000 }); // 100ml dầu
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 }); // 20g đường
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      for (let i = 0; i < 180; i++) {
        engine.advance(1 / 60);
      }

      const state = engine.getState();
      expect(state.mass.W).toBe(0);
      expect(state.mass.Gd).toBe(0); // Không tan
      expect(state.mass.Gu).toBe(20);
      expect(state.mass.Gt).toBe(20);
    });

    it('Numeric Fixture độc lập: W10g, Gt30g sau 1s ở Fixed I=1 đạt Gd ≈ 4.808557536 g', () => {
      // kG = 0.025 + 0.25 * 1 = 0.275 s^-1
      // Gd(1s) = 20 * (1 - exp(-0.275 * 1)) ≈ 4.808557536 g
      const analyticGd = computeAnalyticDissolution(1.0, 10, 30, 1.0);
      expect(analyticGd).toBeCloseTo(4.808557536, 8);

      const state: ScienceState = {
        ...createInitialScienceState(seed),
        input: {
          water: 100, // 100 deciTicks = 10 g
          sugar: 300, // 300 deciTicks = 30 g
          sand: 0,
          oil: 0,
        },
        mass: {
          W: 10,
          Gt: 30,
          Gu: 30,
          Gd: 0,
          St: 0,
          Sb: 0,
          Ss: 0,
          Ot: 0,
          Ol: 0,
          Od: 0,
        },
      };

      for (let i = 0; i < 60; i++) {
        stepDissolution(state, { intensity: 1.0, h: 1 / 60 });
      }

      expect(state.mass.Gd).toBeCloseTo(4.808557536, 6);
      expect(state.mass.Gu + state.mass.Gd).toBeCloseTo(30, 10);
      expect(Math.abs(state.mass.Gu + state.mass.Gd - 30)).toBeLessThan(epsilonMass(30));
    });
  });

  describe('2. Bốn Fixtures Chuẩn SPEC §4: L0, L1, O, X', () => {
    it('Fixture L0: W100ml, O20ml nghỉ (Ol18g, Od0g) -> aqueous 100ml, oil 20ml, bed 0ml', () => {
      const phases: PhaseMasses = {
        Wml: 100,
        Oml: 20,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        fGu: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 18,
        Ol: 18,
        Od: 0,
      };
      const regions = computeBeakerRegions(phases);

      expect(regions.category).toBe('mixed');
      expect(regions.bed.volumeMl).toBeCloseTo(0, 9);
      expect(regions.aqueous.volumeMl).toBeCloseTo(100, 9);
      expect(regions.oil.volumeMl).toBeCloseTo(20, 9);
      expect(regions.totalReserveMl).toBeCloseTo(120, 9);

      // Boundaries y scene units
      expect(regions.bed.bottom).toBeCloseTo(0.12, 6);
      expect(regions.bed.top).toBeCloseTo(0.12, 6);
      expect(regions.aqueous.bottom).toBeCloseTo(0.12, 6);
      expect(regions.aqueous.top).toBeCloseTo(0.54, 6); // 0.12 + 100 * 0.0042 = 0.540
      expect(regions.oil.bottom).toBeCloseTo(0.54, 6);
      expect(regions.oil.top).toBeCloseTo(0.624, 6); // 0.54 + 20 * 0.0042 = 0.624
      expect(regions.liquidTop).toBeCloseTo(0.624, 6);
    });

    it('Fixture L1: Cùng input L0 nhưng dispersed 9g (Ol9g, Od9g) -> aqueous 110ml, oil 10ml', () => {
      const phases: PhaseMasses = {
        Wml: 100,
        Oml: 20,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        fGu: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 18,
        Ol: 9,
        Od: 9,
      };
      const regions = computeBeakerRegions(phases);

      expect(regions.category).toBe('mixed');
      expect(regions.bed.volumeMl).toBeCloseTo(0, 9);
      // Od = 9g / 0.9 = 10ml chuyển sang nằm trong aqueous envelope
      expect(regions.aqueous.volumeMl).toBeCloseTo(110, 9);
      // Ol = 9g / 0.9 = 10ml là lớp dầu phân tầng còn lại
      expect(regions.oil.volumeMl).toBeCloseTo(10, 9);
      expect(regions.totalReserveMl).toBeCloseTo(120, 9);

      // Boundaries y scene units
      expect(regions.bed.bottom).toBeCloseTo(0.12, 6);
      expect(regions.bed.top).toBeCloseTo(0.12, 6);
      expect(regions.aqueous.bottom).toBeCloseTo(0.12, 6);
      expect(regions.aqueous.top).toBeCloseTo(0.582, 6); // 0.12 + 110 * 0.0042 = 0.582
      expect(regions.oil.bottom).toBeCloseTo(0.582, 6);
      expect(regions.oil.top).toBeCloseTo(0.624, 6); // 0.582 + 10 * 0.0042 = 0.624
      expect(regions.liquidTop).toBeCloseTo(0.624, 6);

      // Mặt thoáng liquidTop giữ nguyên chính xác 0.624 giữa L0 và L1 (không có double-count thể tích dầu)
    });

    it('Fixture O: Oil 100ml, Sand 10g (Sb4g, Ss6g, W=0) -> bed 2.4ml, oil 103.6ml, aqueous 0ml', () => {
      const phases: PhaseMasses = {
        Wml: 0,
        Oml: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        fGu: 0,
        St: 10,
        Sb: 4,
        Ss: 6,
        Ot: 90,
        Ol: 90,
        Od: 0,
      };
      const regions = computeBeakerRegions(phases);

      expect(regions.category).toBe('oil-only');
      expect(regions.bed.volumeMl).toBeCloseTo(2.4, 6); // 4g * 0.6 = 2.4 ml
      expect(regions.aqueous.volumeMl).toBe(0); // Không có nước
      expect(regions.oil.volumeMl).toBeCloseTo(103.6, 6); // 100ml + 6g * 0.6 = 103.6 ml
      expect(regions.totalReserveMl).toBeCloseTo(106, 6);

      // Boundaries y scene units
      expect(regions.bed.bottom).toBeCloseTo(0.12, 5);
      expect(regions.bed.top).toBeCloseTo(0.13008, 5); // 0.12 + 2.4 * 0.0042 = 0.13008
      expect(regions.aqueous.bottom).toBeCloseTo(0.13008, 5);
      expect(regions.aqueous.top).toBeCloseTo(0.13008, 5);
      expect(regions.oil.bottom).toBeCloseTo(0.13008, 5);
      expect(regions.oil.top).toBeCloseTo(0.56520, 5); // 0.13008 + 103.6 * 0.0042 = 0.56520
    });

    it('Fixture X: W300ml, O70ml, G100g, S100g -> bed 74ml, aqueous 371ml, oil 50ml, total 495ml', () => {
      // W300, Gd50, Gu50, fGu 0.2 (GuSusp 10g, GuBed 40g), Sb 80g, Ss 20g, Ol 45g (50ml), Od 18g (20ml)
      const phases: PhaseMasses = {
        Wml: 300,
        Oml: 70,
        Gt: 100,
        Gu: 50,
        Gd: 50,
        fGu: 0.2,
        St: 100,
        Sb: 80,
        Ss: 20,
        Ot: 63,
        Ol: 45,
        Od: 18,
      };
      const regions = computeBeakerRegions(phases);

      expect(regions.category).toBe('mixed');
      // Vbed = 0.65 * 40 + 0.6 * 80 = 26 + 48 = 74 ml
      expect(regions.bed.volumeMl).toBeCloseTo(74, 6);
      // Vaqueous = 300 + 0.65*50 + 0.65*10 + 0.6*20 + 18/0.9 = 300 + 32.5 + 6.5 + 12 + 20 = 371 ml
      expect(regions.aqueous.volumeMl).toBeCloseTo(371, 6);
      // Voil = 45 / 0.9 = 50 ml
      expect(regions.oil.volumeMl).toBeCloseTo(50, 6);
      expect(regions.totalReserveMl).toBeCloseTo(495, 6);

      // Boundaries y scene units
      expect(regions.bed.bottom).toBeCloseTo(0.12, 4);
      expect(regions.bed.top).toBeCloseTo(0.4308, 4);
      expect(regions.aqueous.bottom).toBeCloseTo(0.4308, 4);
      expect(regions.aqueous.top).toBeCloseTo(1.9890, 4);
      expect(regions.oil.bottom).toBeCloseTo(1.9890, 4);
      expect(regions.oil.top).toBeCloseTo(2.1990, 4);
    });
  });

  describe('3. Động học Giọt Dầu (Oil Droplets) & Bảo toàn Phân tầng', () => {
    it('khuấy tạo giọt dầu Od làm giảm thể tích lớp dầu phân tầng Voil và tăng Vaqueous tương ứng', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'oil-droplet-test', seed });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 }); // 100ml
      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 }); // 20ml = 18g
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      // Ban đầu ở tick 0: Od = 0, Ol = 18g
      expect(engine.getState().mass.Od).toBe(0);
      expect(engine.getState().mass.Ol).toBe(18);

      // Khuấy 120 ticks (2s)
      for (let i = 0; i < 120; i++) {
        engine.advance(1 / 60);
      }

      const s1 = engine.getState();
      expect(s1.mass.Od).toBeGreaterThan(0.5); // Giọt dầu đã hình thành
      expect(s1.mass.Ol).toBeLessThan(17.5); // Lớp dầu giảm tương ứng
      expect(s1.mass.Ol + s1.mass.Od).toBeCloseTo(18, 10); // Bảo toàn khối lượng dầu tuyệt đối

      // Đọc stamp: pool oilDroplet có hạt đại diện hoạt động
      const target = {
        positions: new Float32Array(1500),
        weights: new Float32Array(500),
        materials: new Uint8Array(500),
        radii: new Float32Array(500),
        poolIds: new Uint8Array(500),
        count: 500,
      };
      const stamp = engine.copyRenderFrame(target);
      expect(stamp.poolRanges!.oilDroplet.count).toBeGreaterThan(0);
    });

    it('ngừng khuấy làm giọt dầu nổi và tách dần về lớp dầu (kSeparate) mà không cần solver hợp giọt giả', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'oil-separate-test', seed });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      // Khuấy 180 ticks để tạo giọt
      for (let i = 0; i < 180; i++) {
        engine.advance(1 / 60);
      }
      const odPeak = engine.getState().mass.Od;
      expect(odPeak).toBeGreaterThan(1.0);

      // Ngừng khuấy (releaseDrive)
      facade.dispatchIntent({ type: 'releaseDrive' });

      // Chạy 120 ticks (2s) để dòng chảy suy giảm và tách dầu
      for (let i = 0; i < 120; i++) {
        engine.advance(1 / 60);
      }
      const odAfter2s = engine.getState().mass.Od;
      expect(odAfter2s).toBeLessThan(odPeak);
      expect(engine.getState().mass.Ol).toBeGreaterThan(18 - odPeak);

      // Chạy tiếp 300 ticks (5s)
      for (let i = 0; i < 300; i++) {
        engine.advance(1 / 60);
      }
      const odAfter7s = engine.getState().mass.Od;
      expect(odAfter7s).toBeLessThan(odAfter2s);
      expect(engine.getState().mass.Ol + engine.getState().mass.Od).toBeCloseTo(18, 10);
    });
  });

  describe('4. Ranh giới Không gian và Phong bì Khối lỏng', () => {
    it('các giọt dầu oilDroplet nằm hoàn toàn trong phong bì nước regions.aqueous', () => {
      const phases: PhaseMasses = {
        Wml: 100,
        Oml: 20,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        fGu: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 18,
        Ol: 9,
        Od: 9,
      };
      const regions = computeBeakerRegions(phases);
      const mass: ScienceMassCompartments = {
        W: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 18,
        Ol: 9,
        Od: 9,
      };

      const bounds = computePoolBounds('oilDroplet', mass, 0, regions);
      expect(bounds.active).toBe(true);
      expect(bounds.yBottom).toBeGreaterThanOrEqual(regions.aqueous.bottom);
      expect(bounds.yTop).toBeLessThanOrEqual(regions.aqueous.top);
      expect(bounds.effectiveParticleRadius).toBeCloseTo(PARTICLE_RADIUS_OIL_DROPLET, 6);
    });

    it('vùng có thể tích bằng 0 không sinh phantom mesh hoặc bounds âm', () => {
      // Khi không có dầu (water-only):
      const phases: PhaseMasses = {
        Wml: 100,
        Oml: 0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        fGu: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const regions = computeBeakerRegions(phases);

      expect(regions.oil.volumeMl).toBe(0);
      expect(regions.oil.height).toBe(0);
      expect(regions.oil.bottom).toBe(regions.oil.top);

      // Thể tích nước = 100ml > 0
      expect(regions.aqueous.volumeMl).toBe(100);
      expect(regions.aqueous.height).toBeGreaterThan(0);
    });

    it('bề dày rất mỏng (Fixture T, W=0.1ml) co bán kính hữu hiệu và không sinh NaN/lỗi đảo cận', () => {
      const phases: PhaseMasses = {
        Wml: 0.1,
        Oml: 0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        fGu: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const regions = computeBeakerRegions(phases);
      expect(regions.aqueous.volumeMl).toBeCloseTo(0.1, 6);
      expect(regions.aqueous.height).toBeCloseTo(volumeToHeight(0.1), 6); // 0.00042 scene units

      const bounds = computeParticleBounds(regions.aqueous.bottom, regions.aqueous.top, 0.026);
      expect(bounds.active).toBe(true);
      expect(bounds.effectiveParticleRadius).toBeCloseTo(regions.aqueous.height / 2, 6);
      expect(bounds.yBottom).toBeCloseTo(bounds.midpointY, 6);
      expect(bounds.yTop).toBeCloseTo(bounds.midpointY, 6);
    });
  });

  describe('5. Thao tác Điều khiển Tạm dừng, Khôi phục và Remount', () => {
    it('thêm dầu khi paused tăng Ol và Ot tức thì nhưng giữ nguyên Od=0 và thời gian không đổi', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'add-oil-paused', seed });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 500 }); // 50ml
      expect(engine.getState().elapsedSeconds).toBe(0);

      // Thêm 20ml dầu khi paused
      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 }); // 20ml = 18g

      const state = engine.getState();
      expect(state.elapsedSeconds).toBe(0);
      expect(state.tickIndex).toBe(0);
      expect(state.mass.Ot).toBe(18);
      expect(state.mass.Ol).toBe(18);
      expect(state.mass.Od).toBe(0); // Không tự tạo giọt khi paused

      const snap = engine.snapshot();
      expect(snap.mass.Ol).toBe(18);
      expect(snap.mass.Od).toBe(0);
    });

    it('reset thí nghiệm dọn sạch toàn bộ phân tầng chất lỏng và hạt đại diện, tạo generation mới', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'reset-liquids', seed });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 500 });
      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 });

      expect(engine.getCurrentGeneration()).toBe(0);

      facade.dispatchIntent({ type: 'reset' });

      expect(engine.getCurrentGeneration()).toBe(1);
      const state = engine.getState();
      expect(state.mass.W).toBe(0);
      expect(state.mass.Ot).toBe(0);
      expect(state.mass.Ol).toBe(0);
      expect(state.mass.Od).toBe(0);

      const target = {
        positions: new Float32Array(300),
        weights: new Float32Array(100),
        materials: new Uint8Array(100),
        radii: new Float32Array(100),
        poolIds: new Uint8Array(100),
        count: 100,
      };
      const stamp = engine.copyRenderFrame(target);
      expect(stamp.count).toBe(0);
      expect(stamp.generation).toBe(1);
    });

    it('camera reset và remount không làm thay đổi state khoa học, khối lượng hay scheduler', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'camera-remount', seed });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 200 });

      const stateBefore = engine.getState();

      // Giả lập 10 lần camera reset (chỉ tăng UI cameraRevision, không gọi command reset)
      for (let i = 0; i < 10; i++) {
        expect(engine.getCurrentGeneration()).toBe(stateBefore.generation);
        expect(engine.getState().mass.W).toBe(100);
        expect(engine.getState().mass.Ot).toBe(18);
      }

      expect(engine.getState().tickIndex).toBe(stateBefore.tickIndex);
      expect(engine.getState().stateVersion).toBe(stateBefore.stateVersion);
    });
  });
});
