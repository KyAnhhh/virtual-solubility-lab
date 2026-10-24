import { useState } from 'react';
import { useExperimentStore } from '../../stores/experimentStore';
import type { IngredientId } from '../../types/experiment';

export interface PresetDefinition {
  id: string;
  title: string;
  tag: string;
  doses: readonly { ingredient: IngredientId; amount: number }[];
  hint: string;
  color: string;
}

export const PRESET_EXPERIMENTS: readonly PresetDefinition[] = [
  {
    id: 'sugar-dissolve',
    title: 'Đường tan',
    tag: 'Nước 100ml + Đường 10g',
    doses: [
      { ingredient: 'water', amount: 100 },
      { ingredient: 'sugar', amount: 10 },
    ],
    hint: 'Sức chứa tối đa 200g. Hãy so sánh tốc độ hòa tan giữa Chế độ quan sát (tự tan chậm) và Khuấy tự động (tan nhanh hơn). Khuấy làm tăng tốc độ tan nhưng không làm tăng sức chứa tối đa.',
    color: '#0284c7',
  },
  {
    id: 'sugar-saturated',
    title: 'Đường dư (Bão hòa)',
    tag: 'Nước 40ml + Đường 100g',
    doses: [
      { ingredient: 'water', amount: 40 },
      { ingredient: 'sugar', amount: 100 },
    ],
    hint: 'Sức chứa của 40ml nước là 80g đường, do đó 20g đường còn lại sẽ không thể tan (bão hòa). Hãy thử bấm Tạm dừng rồi thêm 10ml nước để nâng sức chứa lên 100g và quan sát tiếp.',
    color: '#0369a1',
  },
  {
    id: 'sand-settle',
    title: 'Cát lắng',
    tag: 'Nước 100ml + Cát 10g',
    doses: [
      { ingredient: 'water', amount: 100 },
      { ingredient: 'sand', amount: 10 },
    ],
    hint: 'Cát không tan trong nước. Bật Khuấy tự động hoặc Kéo thìa để cát bị cuốn lơ lửng, sau đó Ngừng khuấy (Stop) để quan sát các hạt cát dần dần chìm lắng xuống đáy cốc (phân biệt giữa Ngừng khuấy và Tạm dừng).',
    color: '#b45309',
  },
  {
    id: 'oil-separation',
    title: 'Dầu tách lớp',
    tag: 'Nước 100ml + Dầu 20ml',
    doses: [
      { ingredient: 'water', amount: 100 },
      { ingredient: 'oil', amount: 20 },
    ],
    hint: 'Dầu nhẹ hơn nước và không tan trong nước, tạo thành lớp nổi ở trên. Khi khuấy mạnh, dầu bị xé thành các giọt nhỏ phân tán vào nước. Khi ngừng khuấy, các giọt dầu dần nổi lên và hợp nhất lại thành lớp trên bề mặt.',
    color: '#d97706',
  },
] as const;

export function PresetExperiments() {
  const reset = useExperimentStore((s) => s.reset);
  const add = useExperimentStore((s) => s.add);
  const pause = useExperimentStore((s) => s.pause);
  const additions = useExperimentStore((s) => s.additions);
  const mass = useExperimentStore((s) => s.snapshot.mass);
  const showRod = useExperimentStore((s) => s.showRod);
  const activePour = useExperimentStore((s) => s.activePour);
  const isPouring = activePour !== null;

  const [pendingPreset, setPendingPreset] = useState<PresetDefinition | null>(null);
  const [activePreset, setActivePreset] = useState<PresetDefinition | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasContents =
    additions.length > 0 || mass.W > 0 || mass.Gt > 0 || mass.St > 0 || mass.Ot > 0;

  const executePreset = (preset: PresetDefinition) => {
    if (isPouring) return;
    setErrorMessage(null);

    // 1. Reset simulation via authoritative action
    reset();

    // 2. Add doses sequentially, validating each acceptance
    for (const dose of preset.doses) {
      const accepted = add(dose.ingredient, dose.amount);
      if (!accepted) {
        setErrorMessage(`Không thể nạp nguyên liệu ${dose.ingredient} cho kịch bản.`);
        return;
      }
    }

    // 3. Ensure preset begins in paused state so the user actively decides when to start
    pause();
    setActivePreset(preset);
    setPendingPreset(null);
  };

  const handlePresetClick = (preset: PresetDefinition) => {
    if (isPouring) return;
    if (hasContents) {
      setPendingPreset(preset);
    } else {
      executePreset(preset);
    }
  };

  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid #edf1f2', paddingTop: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ fontSize: '12px', margin: 0, color: '#1e3a47', fontWeight: 600 }}>
          Thí nghiệm mẫu một nút
        </h3>
        <span style={{ fontSize: '10px', color: '#64748b' }}>4 kịch bản</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        {PRESET_EXPERIMENTS.map((preset) => {
          const isSelected = activePreset?.id === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className="secondary"
              disabled={isPouring}
              style={{
                padding: '8px 6px',
                textAlign: 'left',
                border: isSelected ? `2px solid ${preset.color}` : '1px solid #cbd5e1',
                background: isSelected ? '#f0fdf4' : '#ffffff',
                borderRadius: '6px',
                cursor: isPouring ? 'not-allowed' : 'pointer',
                opacity: isPouring ? 0.5 : 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
              onClick={() => handlePresetClick(preset)}
              title={`Chuẩn bị thí nghiệm mẫu: ${preset.title}`}
            >
              <strong style={{ fontSize: '11px', color: preset.color }}>
                {preset.title}
              </strong>
              <span style={{ fontSize: '9px', color: '#64748b', whiteSpace: 'nowrap' }}>
                {preset.tag}
              </span>
            </button>
          );
        })}
      </div>

      {/* Confirmation Modal / Alert when resetting existing beaker */}
      {pendingPreset && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            marginTop: '10px',
            padding: '10px',
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            borderRadius: '6px',
          }}
        >
          <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#92400e', lineHeight: 1.4 }}>
            ⚠️ Cốc đang có nguyên liệu. Chuẩn bị thí nghiệm <strong>{pendingPreset.title}</strong> sẽ làm mới cốc thí nghiệm. Bạn có muốn tiếp tục?
          </p>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              style={{
                flex: 1,
                padding: '5px',
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => executePreset(pendingPreset)}
            >
              Làm mới & Chuẩn bị
            </button>
            <button
              type="button"
              style={{
                padding: '5px 8px',
                background: '#f8fafc',
                color: '#64748b',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
              onClick={() => setPendingPreset(null)}
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div style={{ marginTop: '8px', padding: '6px', background: '#fee2e2', color: '#b91c1c', fontSize: '10px', borderRadius: '4px' }}>
          {errorMessage}
        </div>
      )}

      {/* Active Preset Study Hint */}
      {activePreset && !pendingPreset && (
        <div
          style={{
            marginTop: '10px',
            padding: '8px',
            background: '#f0f9ff',
            borderLeft: `3px solid ${activePreset.color}`,
            borderRadius: '4px',
            fontSize: '11px',
            lineHeight: 1.45,
            color: '#0c4a6e',
          }}
        >
          <strong>Kịch bản: {activePreset.title}</strong>
          <p style={{ margin: '4px 0 0 0' }}>{activePreset.hint}</p>
          {!showRod && (
            <p style={{ margin: '6px 0 0 0', fontStyle: 'italic', color: '#0369a1', fontSize: '10px' }}>
              💡 Gợi ý: Hãy tích chọn &quot;Hiển thị thìa khuấy&quot; ở bảng Điều khiển để quan sát và thao tác khuấy.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
