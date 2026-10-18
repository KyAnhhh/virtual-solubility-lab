import { describe, expect, it } from 'vitest';
import {
  STOCK_VESSEL_HEIGHT,
  STOCK_VESSEL_RADIUS,
  STOCK_VESSELS_CONFIG,
} from '../../scene/IngredientVessels';
import {
  BEAKER_BASE_Y,
  BEAKER_INNER_RADIUS,
  BEAKER_OUTER_RADIUS,
} from '../constants/beaker';
import {
  CAPACITY_ML,
  INGREDIENTS,
} from '../constants/ingredients';
import { SOLUBILITY_SUGAR_DEFAULT } from '../constants/science';
import { SimulationBridge } from '../bridge/SimulationBridge';
import { createExperimentStore } from '../../stores/experimentStore';
import {
  evaluateScienceState,
  INITIAL_HYSTERESIS_STATE,
} from '../../components/results/contentsHelpers';

describe('V1-06 — Bổ sung bốn cốc chứa nguyên liệu 3D & Saturation Regression', () => {
  describe('1. Cấu hình Bốn Cốc Nguồn (Stock Vessels Configuration)', () => {
    it('Định nghĩa đúng 4 loại nguyên liệu với tên tiếng Việt và màu sắc khớp INGREDIENTS', () => {
      expect(STOCK_VESSELS_CONFIG).toHaveLength(4);

      const expected = [
        { id: 'water', name: 'Nước', color: '#66bce0' },
        { id: 'sugar', name: 'Đường', color: '#e8e3d4' },
        { id: 'sand', name: 'Cát', color: '#c89757' },
        { id: 'oil', name: 'Dầu ăn', color: '#e4bd49' },
      ];

      for (let i = 0; i < expected.length; i++) {
        const vessel = STOCK_VESSELS_CONFIG[i];
        const exp = expected[i];
        expect(vessel.id).toBe(exp.id);
        expect(vessel.name).toBe(exp.name);
        expect(vessel.color).toBe(exp.color);

        // Khớp với bảng định nghĩa INGREDIENTS chính
        const def = INGREDIENTS.find((item) => item.id === exp.id);
        expect(def).toBeDefined();
        expect(def?.name).toBe(exp.name);
        expect(def?.color).toBe(exp.color);
      }
    });

    it('Bố trí không gian xác định (deterministic layout), không va chạm và nằm gọn trên bàn', () => {
      // 1. Kích thước bàn: 9 x 7 (X in [-4.5, 4.5], Z in [-3.5, 3.5])
      const TABLE_HALF_WIDTH = 4.5;
      const TABLE_HALF_DEPTH = 3.5;

      for (const vessel of STOCK_VESSELS_CONFIG) {
        const [x, y, z] = vessel.position;
        expect(y).toBe(0); // Đặt chuẩn trên mặt bàn

        // Nằm trọn vẹn trong biên bàn thí nghiệm (có xét bán kính cốc)
        expect(Math.abs(x) + STOCK_VESSEL_RADIUS).toBeLessThan(TABLE_HALF_WIDTH);
        expect(Math.abs(z) + STOCK_VESSEL_RADIUS).toBeLessThan(TABLE_HALF_DEPTH);
      }

      // 2. Khoảng cách giữa các cốc nguồn: không giao nhau (khoảng cách tâm > 2 * bán kính)
      for (let i = 0; i < STOCK_VESSELS_CONFIG.length; i++) {
        for (let j = i + 1; j < STOCK_VESSELS_CONFIG.length; j++) {
          const vA = STOCK_VESSELS_CONFIG[i];
          const vB = STOCK_VESSELS_CONFIG[j];
          const dx = vA.position[0] - vB.position[0];
          const dz = vA.position[2] - vB.position[2];
          const dist = Math.hypot(dx, dz);

          // Khoảng cách tối thiểu phải lớn hơn đường kính 2 * 0.38 = 0.76
          expect(dist).toBeGreaterThan(2 * STOCK_VESSEL_RADIUS);
        }
      }

      // 3. Khoảng cách tới cốc thí nghiệm ở tâm (0, 0, 0): không che khuất và cách xa vùng khuấy
      for (const vessel of STOCK_VESSELS_CONFIG) {
        const [x, , z] = vessel.position;
        const distToCenter = Math.hypot(x, z);
        const minClearance = BEAKER_OUTER_RADIUS + STOCK_VESSEL_RADIUS; // 0.90 + 0.38 = 1.28
        // Thực tế bố trí cách tâm >= 2.5 đơn vị, để lại hơn 1.2 đơn vị khoảng trống
        expect(distToCenter).toBeGreaterThan(minClearance + 1.0);
      }

      // 4. Kích thước cốc nguồn nhỏ hơn rõ rệt so với cốc thí nghiệm 500ml
      expect(STOCK_VESSEL_RADIUS).toBeLessThan(BEAKER_OUTER_RADIUS);
      expect(STOCK_VESSEL_HEIGHT).toBeLessThan(2.28);
    });
  });

  describe('2. Tính Độc Lập Khoa Học & Không Tiêu Hao (Science Isolation)', () => {
    it('Cốc nguồn độc lập hoàn toàn với experiment mass ledger và không bị tiêu hao', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      // Thêm nguyên liệu vào cốc thí nghiệm
      const addWater = store.getState().add('water', 100);
      const addSugar = store.getState().add('sugar', 50);
      expect(addWater).toBe(true);
      expect(addSugar).toBe(true);

      // Cốc nguồn vẫn giữ nguyên cấu hình không bị trừ hay mutate
      expect(STOCK_VESSELS_CONFIG).toHaveLength(4);
      expect(STOCK_VESSELS_CONFIG[0].fillRatio).toBe(0.72);
      expect(STOCK_VESSELS_CONFIG[1].fillRatio).toBe(0.70);

      // Reset thí nghiệm
      store.getState().reset();
      const stateAfterReset = bridge.getEngine().getState();
      expect(stateAfterReset.mass.W).toBe(0);
      expect(stateAfterReset.mass.Gt).toBe(0);

      // Cốc nguồn vẫn giữ nguyên 4 loại sau scientific reset
      expect(STOCK_VESSELS_CONFIG).toHaveLength(4);
      expect(STOCK_VESSELS_CONFIG.map((c) => c.id)).toEqual(['water', 'sugar', 'sand', 'oil']);
    });

    it('Bảo toàn các hằng số hình học và khoa học của cốc thí nghiệm 500ml', () => {
      expect(BEAKER_OUTER_RADIUS).toBe(0.91);
      expect(BEAKER_INNER_RADIUS).toBe(0.87);
      expect(BEAKER_BASE_Y).toBe(0.12);
      expect(CAPACITY_ML).toBe(500);
      expect(SOLUBILITY_SUGAR_DEFAULT).toBe(2.0);
    });
  });

  describe('3. Saturation Equality & Per-Add Limit Regression (UC1 Fixture)', () => {
    it('Giới hạn thêm mỗi lần: đường tối đa 100g, không cho phép thêm 200g một lần', () => {
      const bridge = new SimulationBridge();

      // Thử thêm 200g đường (vượt maxAddition = 100g)
      const res = bridge.add('sugar', 200);
      expect(res.ok).toBe(false);
      expect(res.message).toContain('Nhập lượng từ 0,1 đến 100 g.');

      // Thêm đúng 100g đường: thành công
      const validAdd = bridge.add('sugar', 100);
      expect(validAdd.ok).toBe(true);
      expect(bridge.getEngine().getState().mass.Gt).toBe(100);
    });

    it('Phân biệt chính xác giữa Gt == capacity (bão hòa) và Gt > capacity (đường dư vượt sức chứa)', () => {
      const bridge = new SimulationBridge();

      // Trường hợp 1: W = 50ml -> capacity = 100g. Thêm Gt = 100g (Gt == capacity)
      bridge.add('water', 50);
      bridge.add('sugar', 100);
      const snapEqual = bridge.getSnapshot();
      expect(snapEqual.capacityG).toBe(100);
      expect(snapEqual.mass.Gt).toBe(100);

      const evalEqual = evaluateScienceState(snapEqual, INITIAL_HYSTERESIS_STATE);
      // Gt == capacity KHÔNG PHẢI là vượt sức chứa
      expect(evalEqual.hasExcess).toBe(false);

      // Trường hợp 2: Fixture UC1 chuẩn: W = 40ml -> capacity = 80g. Thêm Gt = 100g
      const bridgeUC1 = new SimulationBridge();
      bridgeUC1.add('water', 40);
      bridgeUC1.add('sugar', 100);
      const snapUC1 = bridgeUC1.getSnapshot();
      expect(snapUC1.capacityG).toBe(80);
      expect(snapUC1.mass.Gt).toBe(100);

      const evalUC1 = evaluateScienceState(snapUC1, INITIAL_HYSTERESIS_STATE);
      // 100g > 80g -> có lượng đường dư vượt sức chứa 20g
      expect(evalUC1.hasExcess).toBe(true);
      expect(snapUC1.mass.Gt - snapUC1.capacityG).toBe(20);

      // Khi paused, thêm tiếp 10ml nước -> capacity nâng lên 100g -> hết đường dư vượt sức chứa
      const addMoreWater = bridgeUC1.add('water', 10);
      expect(addMoreWater.ok).toBe(true);
      const snapAfterWater = bridgeUC1.getSnapshot();
      expect(snapAfterWater.capacityG).toBe(100);
      expect(snapAfterWater.mass.Gt).toBe(100);

      const evalAfterWater = evaluateScienceState(snapAfterWater, INITIAL_HYSTERESIS_STATE);
      expect(evalAfterWater.hasExcess).toBe(false);
    });
  });
});
