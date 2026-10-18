import { describe, expect, it } from 'vitest';
import { HeadlessSimulationEngine } from '../core/HeadlessSimulationEngine';
import { HeadlessSimulationFacade } from '../core/SimulationEngine';
import {
  BEAKER_BASE_Y,
  computeBeakerRegions,
  computeParticleBounds,
  PARTICLE_RADIUS,
  volumeToHeight,
  type PhaseMasses,
} from '../constants/beaker';
import { VISUAL_ML_PER_GRAM, formatPhaseMass } from '../constants/ingredients';
import {
  computePoolBounds,
  getPoolPhaseMass,
  ParticleTransportSystem,
} from '../models/ParticleTransport';
import type { ScienceMassCompartments } from '../core/SimulationState';

describe('V4-02 — Render Sugar và Sand theo Compartments', () => {
  const seed = 1729;

  describe('1. Phân chia Compartment Đường và Động học Hòa tan', () => {
    it('ánh xạ Gu thành Gu_bed = Gu * (1 - fGu) và Gu_susp = Gu * fGu', () => {
      const mass = {
        W: 100,
        Gt: 20,
        Gu: 12,
        Gd: 8,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const fGu = 0.35;
      const phases: PhaseMasses = {
        Wml: mass.W,
        Oml: 0,
        Gt: mass.Gt,
        Gu: mass.Gu,
        Gd: mass.Gd,
        fGu,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const regions = computeBeakerRegions(phases);

      const sugarBedMass = getPoolPhaseMass('sugarBed', mass, fGu, regions);
      const sugarSuspMass = getPoolPhaseMass('sugarSusp', mass, fGu, regions);

      expect(sugarBedMass).toBeCloseTo(12 * (1 - 0.35), 8); // 7.8 g
      expect(sugarSuspMass).toBeCloseTo(12 * 0.35, 8); // 4.2 g
      expect(sugarBedMass + sugarSuspMass).toBeCloseTo(mass.Gu, 8);
    });

    it('Gd (đường đã tan) hoàn toàn KHÔNG sinh hạt đại diện', () => {
      const transport = new ParticleTransportSystem(100);
      const mass = {
        W: 100,
        Gt: 20,
        Gu: 0, // toàn bộ đã tan
        Gd: 20,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const phases: PhaseMasses = {
        Wml: 100,
        Oml: 0,
        Gt: 20,
        Gu: 0,
        Gd: 20,
        fGu: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const regions = computeBeakerRegions(phases);

      transport.reconcile(mass, 0, regions, seed, 0);

      const sugarBed = transport.getPool('sugarBed');
      const sugarSusp = transport.getPool('sugarSusp');

      expect(sugarBed.activeCount).toBe(0);
      expect(sugarSusp.activeCount).toBe(0);
      expect(transport.getTotalActiveCount()).toBe(0);
    });

    it('trong hệ không nước (khô hoặc chỉ dầu), Gd luôn bằng 0 và đường giữ nguyên ở pha rắn', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'sugar-no-water', seed });
      const facade = new HeadlessSimulationFacade(engine);

      // Thêm 20g đường và 50ml dầu (không có nước)
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      facade.dispatchIntent({ type: 'add', ingredient: 'oil', deciTicks: 500 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      for (let i = 0; i < 300; i++) {
        engine.advance(1 / 60);
      }

      const state = engine.getState();
      expect(state.mass.W).toBe(0);
      expect(state.mass.Gd).toBe(0);
      expect(state.mass.Gu).toBe(20);
      expect(state.mass.Gt).toBe(20);
    });

    it('khi Gu < 0.1g, formatPhaseMass hiển thị "<0,1 g" và không đánh đồng với 0g', () => {
      expect(formatPhaseMass(0.08)).toBe('<0,1 g');
      expect(formatPhaseMass(0.01)).toBe('<0,1 g');
      expect(formatPhaseMass(0.001)).toBe('<0,1 g');
      expect(formatPhaseMass(0)).toBe('0 g');
    });

    it('ngưỡng ẩn trực quan VISUAL_HIDE_THRESHOLD_GRAMS = 0.001 ẩn hạt mà không làm mất mass trên ledger', () => {
      const transport = new ParticleTransportSystem(100);
      const tinyMass = 0.0005; // 0.5 mg < 1 mg
      const mass = {
        W: 100,
        Gt: tinyMass,
        Gu: tinyMass,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const phases: PhaseMasses = {
        Wml: 100,
        Oml: 0,
        Gt: tinyMass,
        Gu: tinyMass,
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

      transport.reconcile(mass, 0, regions, seed, 0);

      const pool = transport.getPool('sugarBed');
      expect(pool.activeCount).toBe(0);
      // Khối lượng vẫn nguyên vẹn trong mass ledger
      expect(mass.Gu).toBe(tinyMass);
    });
  });

  describe('2. Phân chia Compartment Cát và Động học Lắng Thật', () => {
    it('cát phân chia nghiêm ngặt giữa Sb (đáy) và Ss (lơ lửng), không bao giờ tan', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'sand-test', seed });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 }); // 100ml
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 }); // 10g

      expect(engine.getState().mass.Sb).toBe(10);
      expect(engine.getState().mass.Ss).toBe(0);

      // Khuấy auto fast 120 ticks (2s)
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      for (let i = 0; i < 120; i++) {
        engine.advance(1 / 60);
      }

      const s1 = engine.getState();
      expect(s1.mass.Ss).toBeGreaterThan(0.5); // Cát đã được nâng lên lơ lửng
      expect(s1.mass.Sb).toBeLessThan(9.5); // Cát đáy giảm tương ứng
      expect(s1.mass.Sb + s1.mass.Ss).toBeCloseTo(10, 10); // Bảo toàn khối lượng tuyệt đối
    });

    it('ngừng khuấy làm dòng chảy suy giảm dần và cát lắng tự nhiên về đáy (không drop tức thì)', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'sand-settle', seed });
      const facade = new HeadlessSimulationFacade(engine);

      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 1000 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 100 });
      facade.dispatchIntent({ type: 'setMode', mode: 'auto' });
      facade.dispatchIntent({ type: 'setAutoLevel', level: 'fast' });
      facade.dispatchIntent({ type: 'resume' });

      // Khuấy 180 ticks (3s) để phân tán cát
      for (let i = 0; i < 180; i++) {
        engine.advance(1 / 60);
      }
      const ssBeforeStop = engine.getState().mass.Ss;
      expect(ssBeforeStop).toBeGreaterThan(1.0);

      // Ngắt lực thìa (stopAuto / releaseDrive) nhưng simulation clock vẫn chạy
      facade.dispatchIntent({ type: 'releaseDrive' });

      // Sau 60 ticks (1s) dòng chảy suy giảm và cát lắng dần
      for (let i = 0; i < 60; i++) {
        engine.advance(1 / 60);
      }
      const ss1s = engine.getState().mass.Ss;
      expect(ss1s).toBeLessThan(ssBeforeStop);
      expect(engine.getState().mass.Sb).toBeGreaterThan(10 - ssBeforeStop);

      // Sau 300 ticks tiếp theo (5s), cát tiếp tục lắng thêm
      for (let i = 0; i < 300; i++) {
        engine.advance(1 / 60);
      }
      const ss6s = engine.getState().mass.Ss;
      expect(ss6s).toBeLessThan(ss1s);
      expect(engine.getState().mass.Sb + engine.getState().mass.Ss).toBeCloseTo(10, 10);
    });
  });

  describe('3. Ranh giới Phân vùng Đáy (Bed Geometry) & Khớp computeBeakerRegions', () => {
    it('chiều cao lớp cát đáy và lớp đường đáy khớp chính xác với regions.bed.height và regions.bed.top', () => {
      const phases: PhaseMasses = {
        Wml: 100,
        Oml: 0,
        Gt: 20,
        Gu: 15,
        Gd: 5,
        fGu: 0.2, // 3g susp, 12g bed
        St: 10,
        Sb: 8,
        Ss: 2,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const regions = computeBeakerRegions(phases);

      const guBed = phases.Gu * (1 - phases.fGu); // 12g
      const sb = phases.Sb; // 8g

      const sandBedHeight = volumeToHeight(sb * VISUAL_ML_PER_GRAM.sand);
      const sugarBedHeight = volumeToHeight(guBed * VISUAL_ML_PER_GRAM.sugar);

      expect(sandBedHeight + sugarBedHeight).toBeCloseTo(regions.bed.height, 8);
      expect(regions.bed.bottom + sandBedHeight + sugarBedHeight).toBeCloseTo(regions.bed.top, 8);
      expect(regions.aqueous.bottom).toBeCloseTo(regions.bed.top, 8);
    });

    it('tọa độ không gian computePoolBounds chia tách chính xác lớp cát dưới đáy và lớp đường đọng bên trên', () => {
      // Dùng 30g cát và 30g đường để chiều cao mỗi lớp > 2 * particleRadius (dày hơn đường kính hạt)
      const massThick: ScienceMassCompartments = {
        W: 100,
        Gt: 30,
        Gu: 30,
        Gd: 0,
        St: 30,
        Sb: 30,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const phasesThick: PhaseMasses = {
        Wml: 100,
        Oml: 0,
        Gt: 30,
        Gu: 30,
        Gd: 0,
        fGu: 0,
        St: 30,
        Sb: 30,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const regionsThick = computeBeakerRegions(phasesThick);

      const sandBoundsThick = computePoolBounds('sandBed', massThick, 0, regionsThick);
      const sugarBoundsThick = computePoolBounds('sugarBed', massThick, 0, regionsThick);

      const sandBedHeightThick = volumeToHeight(30 * VISUAL_ML_PER_GRAM.sand);

      expect(sandBoundsThick.active).toBe(true);
      expect(sugarBoundsThick.active).toBe(true);

      // Cát ở lớp đáy thấp nhất (dày hơn đường kính nên yBottom = bottom + radius, yTop = top - radius)
      expect(sandBoundsThick.yBottom).toBeCloseTo(regionsThick.bed.bottom + PARTICLE_RADIUS.sand, 6);
      expect(sandBoundsThick.yTop).toBeCloseTo(regionsThick.bed.bottom + sandBedHeightThick - PARTICLE_RADIUS.sand, 6);

      // Đường ở lớp phía trên cát
      expect(sugarBoundsThick.yBottom).toBeCloseTo(regionsThick.bed.bottom + sandBedHeightThick + PARTICLE_RADIUS.sugar, 6);
      expect(sugarBoundsThick.yTop).toBeCloseTo(regionsThick.bed.top - PARTICLE_RADIUS.sugar, 6);

      // Với lớp mỏng (10g cát có chiều cao 0.0252 < đường kính 0.052), đặt tại midpoint và co bán kính
      const massThin: ScienceMassCompartments = {
        W: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 10,
        Sb: 10,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const phasesThin: PhaseMasses = {
        Wml: 100,
        Oml: 0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        fGu: 0,
        St: 10,
        Sb: 10,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const regionsThin = computeBeakerRegions(phasesThin);
      const sandBoundsThin = computePoolBounds('sandBed', massThin, 0, regionsThin);
      const thinHeight = volumeToHeight(10 * VISUAL_ML_PER_GRAM.sand);
      expect(sandBoundsThin.yBottom).toBeCloseTo(regionsThin.bed.bottom + thinHeight / 2, 6);
      expect(sandBoundsThin.yTop).toBeCloseTo(regionsThin.bed.bottom + thinHeight / 2, 6);
      expect(sandBoundsThin.effectiveParticleRadius).toBeCloseTo(thinHeight / 2, 6);
    });
  });

  describe('4. Hệ Chỉ Dầu (Oil-Only Carrier Envelope)', () => {
    it('trong hệ chỉ dầu, cát lơ lửng và đường lơ lửng nằm hoàn toàn trong phong bì dầu regions.oil', () => {
      const massOil: ScienceMassCompartments = {
        W: 0,
        Gt: 10,
        Gu: 10,
        Gd: 0,
        St: 10,
        Sb: 4,
        Ss: 6,
        Ot: 90,
        Ol: 90,
        Od: 0,
      };
      const phases: PhaseMasses = {
        Wml: 0, // Không có nước
        Oml: 100,
        Gt: 10,
        Gu: 10,
        Gd: 0,
        fGu: 0.4, // 4g sugar lơ lửng trong dầu
        St: 10,
        Sb: 4,
        Ss: 6, // 6g cát lơ lửng trong dầu
        Ot: 90,
        Ol: 90,
        Od: 0,
      };
      const regions = computeBeakerRegions(phases);

      expect(regions.category).toBe('oil-only');
      expect(regions.aqueous.volumeMl).toBe(0);
      expect(regions.oil.volumeMl).toBeGreaterThan(100);

      const sandSuspBounds = computePoolBounds('sandSusp', massOil, phases.fGu, regions);
      const sugarSuspBounds = computePoolBounds('sugarSusp', massOil, phases.fGu, regions);

      // Các hạt lơ lửng phải nằm trong bounds của dầu [regions.oil.bottom, regions.oil.top]
      expect(sandSuspBounds.yBottom).toBeGreaterThanOrEqual(regions.oil.bottom);
      expect(sandSuspBounds.yTop).toBeLessThanOrEqual(regions.oil.top);

      expect(sugarSuspBounds.yBottom).toBeGreaterThanOrEqual(regions.oil.bottom);
      expect(sugarSuspBounds.yTop).toBeLessThanOrEqual(regions.oil.top);
    });
  });

  describe('5. Tỷ lệ Bán kính Hữu hiệu (Effective Radius) trong Lớp Mỏng', () => {
    it('khi bề dày lớp nhỏ hơn đường kính hạt, r_eff được co lại = height/2 để hạt không lồi ra ngoài biên', () => {
      const bottom = BEAKER_BASE_Y;
      const top = bottom + 0.02; // Bề dày 0.02 < đường kính cát (0.052)
      const bounds = computeParticleBounds(bottom, top, PARTICLE_RADIUS.sand);

      expect(bounds.active).toBe(true);
      expect(bounds.effectiveParticleRadius).toBeCloseTo(0.01, 6); // height / 2
      expect(bounds.yBottom).toBeCloseTo(bottom + 0.01, 6);
      expect(bounds.yTop).toBeCloseTo(bottom + 0.01, 6);
    });
  });

  describe('6. Thêm Chất khi Tạm dừng (Paused Addition & Remap)', () => {
    it('thêm đường và cát khi paused cập nhật ngay phân vùng và tọa độ hạt nhưng không tăng thời gian hay vận tốc', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'paused-add', seed });
      const facade = new HeadlessSimulationFacade(engine);

      // Ban đầu rỗng ở tick 0
      expect(engine.getState().tickIndex).toBe(0);
      expect(engine.getState().elapsedSeconds).toBe(0);

      // Thêm nước, đường, cát khi paused
      facade.dispatchIntent({ type: 'add', ingredient: 'water', deciTicks: 500 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 200 });
      facade.dispatchIntent({ type: 'add', ingredient: 'sand', deciTicks: 200 });

      const state = engine.getState();
      expect(state.tickIndex).toBe(0);
      expect(state.elapsedSeconds).toBe(0);
      expect(state.mass.W).toBe(50);
      expect(state.mass.Gt).toBe(20);
      expect(state.mass.Gu).toBe(20);
      expect(state.mass.Gd).toBe(0);
      expect(state.mass.St).toBe(20);
      expect(state.mass.Sb).toBe(20);

      // Đọc render stamp qua copyRenderFrame
      const target = {
        positions: new Float32Array(1500),
        weights: new Float32Array(500),
        materials: new Uint8Array(500),
        radii: new Float32Array(500),
        poolIds: new Uint8Array(500),
        count: 500,
      };
      const stamp = engine.copyRenderFrame(target);
      expect(stamp.count).toBe(200); // 100 sugarBed + 100 sandBed
      expect(stamp.poolRanges).toBeDefined();
      expect(stamp.poolRanges!.sugarBed.count).toBe(100);
      expect(stamp.poolRanges!.sandBed.count).toBe(100);
      expect(stamp.poolRanges!.sugarSusp.count).toBe(0);
      expect(stamp.poolRanges!.sandSusp.count).toBe(0);

      // Mọi vị trí hạt đều hữu hạn và nằm trong bed
      const snap = engine.snapshot();
      const phases: PhaseMasses = {
        Wml: snap.mass.W,
        Oml: 0,
        Gt: snap.mass.Gt,
        Gu: snap.mass.Gu,
        Gd: snap.mass.Gd,
        fGu: snap.fGu ?? 0,
        St: snap.mass.St,
        Sb: snap.mass.Sb,
        Ss: snap.mass.Ss,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const regions = computeBeakerRegions(phases);

      for (let i = 0; i < stamp.count; i++) {
        const y = target.positions[i * 3 + 1];
        expect(y).toBeGreaterThanOrEqual(regions.bed.bottom - 1e-6);
        expect(y).toBeLessThanOrEqual(regions.bed.top + 1e-6);
      }
    });
  });

  describe('7. Độc lập Ngân sách Hạt và Cô lập Buffer (Buffer Safety)', () => {
    it('thay đổi particle budget N=10/100/700 bảo toàn tính chất hạt và không sinh memory leak', () => {
      const transport = new ParticleTransportSystem(100);
      const mass = {
        W: 100,
        Gt: 20,
        Gu: 20,
        Gd: 0,
        St: 10,
        Sb: 10,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const phases: PhaseMasses = {
        Wml: 100,
        Oml: 0,
        Gt: 20,
        Gu: 20,
        Gd: 0,
        fGu: 0,
        St: 10,
        Sb: 10,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const regions = computeBeakerRegions(phases);

      // Khởi tạo tại budget 100
      transport.reconcile(mass, 0, regions, seed, 0);
      expect(transport.getBudgetPerPool()).toBe(100);
      expect(transport.getTotalActiveCount()).toBe(200); // 100 sugarBed + 100 sandBed

      // Nâng lên 700
      transport.setBudgetPerPool(700, mass, 0, regions, seed, 0);
      expect(transport.getBudgetPerPool()).toBe(700);
      expect(transport.getTotalActiveCount()).toBe(1400); // 700 sugarBed + 700 sandBed

      // Hạ xuống 10
      transport.setBudgetPerPool(10, mass, 0, regions, seed, 0);
      expect(transport.getBudgetPerPool()).toBe(10);
      expect(transport.getTotalActiveCount()).toBe(20);
    });

    it('caller ghi đè dữ liệu trên target buffer không làm biến đổi dữ liệu engine', () => {
      const engine = new HeadlessSimulationEngine({ clientId: 'buffer-isolation', seed });
      const facade = new HeadlessSimulationFacade(engine);
      facade.dispatchIntent({ type: 'add', ingredient: 'sugar', deciTicks: 100 });

      const target = {
        positions: new Float32Array(300),
        weights: new Float32Array(100),
        materials: new Uint8Array(100),
        radii: new Float32Array(100),
        poolIds: new Uint8Array(100),
        count: 100,
      };

      engine.copyRenderFrame(target);
      const originalY0 = target.positions[1];

      // Caller làm hỏng buffer
      target.positions.fill(999.0);
      target.weights.fill(-1.0);

      // Frame copy tiếp theo vẫn chuẩn xác
      engine.copyRenderFrame(target);
      expect(target.positions[1]).toBeCloseTo(originalY0, 6);
      expect(target.weights[0]).toBeGreaterThan(0);
    });
  });
});
