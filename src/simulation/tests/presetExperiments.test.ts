import { describe, expect, it } from 'vitest';
import { PRESET_EXPERIMENTS } from '../../components/presets/PresetExperiments';
import { SimulationBridge } from '../bridge/SimulationBridge';
import { createExperimentStore } from '../../stores/experimentStore';

describe('Nhóm 4 — Thí nghiệm mẫu một nút (PresetExperiments Canonical Logic)', () => {
  it('1. Đầy đủ 4 kịch bản mẫu với các liều lượng chuẩn xác theo kịch bản sư phạm', () => {
    expect(PRESET_EXPERIMENTS).toHaveLength(4);

    const presetA = PRESET_EXPERIMENTS.find((p) => p.id === 'sugar-dissolve')!;
    expect(presetA).toBeDefined();
    expect(presetA.doses).toEqual([
      { ingredient: 'water', amount: 100 },
      { ingredient: 'sugar', amount: 10 },
    ]);

    const presetB = PRESET_EXPERIMENTS.find((p) => p.id === 'sugar-saturated')!;
    expect(presetB).toBeDefined();
    expect(presetB.doses).toEqual([
      { ingredient: 'water', amount: 40 },
      { ingredient: 'sugar', amount: 100 },
    ]);

    const presetC = PRESET_EXPERIMENTS.find((p) => p.id === 'sand-settle')!;
    expect(presetC).toBeDefined();
    expect(presetC.doses).toEqual([
      { ingredient: 'water', amount: 100 },
      { ingredient: 'sand', amount: 10 },
    ]);

    const presetD = PRESET_EXPERIMENTS.find((p) => p.id === 'oil-separation')!;
    expect(presetD).toBeDefined();
    expect(presetD.doses).toEqual([
      { ingredient: 'water', amount: 100 },
      { ingredient: 'oil', amount: 20 },
    ]);
  });

  it('2. Nạp Preset B (Đường dư): tạo đúng sức chứa 80g và lượng dư 20g, kết thúc ở trạng thái paused', () => {
    const bridge = new SimulationBridge();
    const store = createExperimentStore(bridge);

    const presetB = PRESET_EXPERIMENTS.find((p) => p.id === 'sugar-saturated')!;

    // Thực hiện canonical reset & add từng liều lượng
    store.getState().reset();
    for (const dose of presetB.doses) {
      const ok = store.getState().add(dose.ingredient, dose.amount);
      expect(ok).toBe(true);
    }
    store.getState().pause();

    const snapshot = store.getState().snapshot;
    expect(snapshot.mass.W).toBe(40);
    expect(snapshot.mass.Gt).toBe(100);
    expect(snapshot.capacityG).toBe(80); // 40ml * 2.0 g/ml = 80g
    expect(snapshot.mass.Gt - snapshot.capacityG).toBe(20); // Dư 20g
    expect(snapshot.paused).toBe(true); // Trạng thái sẵn sàng chờ người học bấm bắt đầu
  });

  it('3. Nạp Preset C (Cát lắng): cát không tan, khối lượng Sb = 10g, không sinh đường hay dầu', () => {
    const bridge = new SimulationBridge();
    const store = createExperimentStore(bridge);

    const presetC = PRESET_EXPERIMENTS.find((p) => p.id === 'sand-settle')!;

    store.getState().reset();
    for (const dose of presetC.doses) {
      const ok = store.getState().add(dose.ingredient, dose.amount);
      expect(ok).toBe(true);
    }
    store.getState().pause();

    const snapshot = store.getState().snapshot;
    expect(snapshot.mass.W).toBe(100);
    expect(snapshot.mass.St).toBe(10);
    expect(snapshot.mass.Sb).toBe(10);
    expect(snapshot.mass.Gt).toBe(0);
    expect(snapshot.mass.Ot).toBe(0);
    expect(snapshot.paused).toBe(true);
  });

  it('4. Nạp Preset D (Dầu tách lớp): tạo lớp dầu 20ml (18g) trên mặt nước 100ml', () => {
    const bridge = new SimulationBridge();
    const store = createExperimentStore(bridge);

    const presetD = PRESET_EXPERIMENTS.find((p) => p.id === 'oil-separation')!;

    store.getState().reset();
    for (const dose of presetD.doses) {
      const ok = store.getState().add(dose.ingredient, dose.amount);
      expect(ok).toBe(true);
    }
    store.getState().pause();

    const snapshot = store.getState().snapshot;
    expect(snapshot.mass.W).toBe(100);
    expect(snapshot.mass.Ot).toBe(18); // 20ml * 0.9 g/ml = 18g
    expect(snapshot.mass.Ol).toBe(18); // Ban đầu ở lớp dầu
    expect(snapshot.mass.Od).toBe(0);
    expect(snapshot.paused).toBe(true);
  });
});
