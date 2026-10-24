import { INGREDIENTS, parseInputAmount } from '../../simulation/constants/ingredients';
import { useExperimentStore } from '../../stores/experimentStore';
import type { IngredientDefinition, PourMode } from '../../types/experiment';
import { PresetExperiments } from '../presets/PresetExperiments';

function IngredientCard({ ingredient, mode }: { ingredient: IngredientDefinition; mode: PourMode }) {
  const amount = useExperimentStore((s) => s.inputDoses[ingredient.id] ?? (ingredient.id === 'water' ? '100' : ingredient.id === 'oil' ? '20' : '10'));
  const setInputDose = useExperimentStore((s) => s.setInputDose);
  const startPour = useExperimentStore((s) => s.startPour);
  const activePour = useExperimentStore((s) => s.activePour);
  const draggedVessel = useExperimentStore((s) => s.draggedVessel);

  const isPouring = activePour !== null;
  const isDragging = draggedVessel !== null;
  const isBusy = isPouring || isDragging;
  const isThisPouring = activePour?.ingredient === ingredient.id;
  const isThisDragging = draggedVessel?.ingredient === ingredient.id;
  const isFree = mode === 'free';
  const inputId = `quantity-${ingredient.id}`;

  // Inline validation for by-dose mode
  let validationError: string | null = null;
  if (!isFree) {
    const parsed = parseInputAmount(amount);
    if (!parsed.ok) {
      validationError = parsed.error ?? 'Số không hợp lệ';
    } else if (parsed.amount > ingredient.maxAddition) {
      validationError = `Tối đa ${ingredient.maxAddition} ${ingredient.unit}`;
    }
  }

  const freeRateLabel =
    ingredient.id === 'water' ? '25 ml/s' : ingredient.id === 'oil' ? '15 ml/s' : '10 g/s';

  return (
    <form
      className="ingredient"
      onSubmit={(event) => {
        event.preventDefault();
        if (isFree || validationError) return;
        startPour(ingredient.id, amount);
      }}
      style={{ padding: '8px 10px', marginBottom: '6px' }}
    >
      <div className="flex items-center gap-3">
        <span className={`sample sample-${ingredient.id}`} style={{ backgroundColor: ingredient.color }} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: '13px' }}>{ingredient.name}</h3>
            {isFree && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#0369a1',
                  background: '#e0f2fe',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                {freeRateLabel}
              </span>
            )}
          </div>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
            {isFree ? 'Kéo cốc chạm cốc 500 ml để rót' : ingredient.description}
          </p>
        </div>
      </div>

      {!isFree && (
        <div style={{ marginTop: '6px' }}>
          <div className="dose-row" style={{ display: 'flex', gap: '6px' }}>
            <label className="quantity-input" htmlFor={inputId} style={{ flex: 1 }}>
              <span className="sr-only">Lượng {ingredient.name.toLowerCase()} ({ingredient.unit})</span>
              <input
                id={inputId}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                required
                disabled={isBusy}
                value={amount}
                aria-label={`Lượng ${ingredient.name.toLowerCase()} (${ingredient.unit})`}
                onChange={(e) => setInputDose(ingredient.id, e.target.value)}
                style={validationError ? { borderColor: '#ef4444' } : undefined}
              />
              <span>{ingredient.unit}</span>
            </label>
            <button
              type="submit"
              disabled={isBusy || Boolean(validationError)}
              aria-label={`Thêm ${ingredient.name.toLowerCase()}`}
              style={isBusy || Boolean(validationError) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            >
              {isThisPouring ? 'Đang rót...' : isThisDragging ? 'Đang kéo...' : '+ Thêm'}
            </button>
          </div>
          {validationError && (
            <div
              style={{
                fontSize: '10px',
                color: '#ef4444',
                marginTop: '3px',
                fontWeight: 500,
              }}
              role="alert"
            >
              {validationError}
            </div>
          )}
        </div>
      )}
    </form>
  );
}

export function IngredientPanel() {
  const pourMode = useExperimentStore((s) => s.pourMode);
  const setPourMode = useExperimentStore((s) => s.setPourMode);
  const isBusy = Boolean(useExperimentStore((s) => s.activePour || s.draggedVessel));

  return (
    <aside className="panel ingredients-panel">
      <div className="panel-title">
        <span className="eyebrow">NGUYÊN LIỆU</span>
        <span className="small-tag">4 chất</span>
      </div>
      <h2>Thêm vào cốc</h2>

      {/* Mode selection segmented toggle */}
      <div
        role="tablist"
        aria-label="Chế độ rót nguyên liệu"
        style={{
          display: 'flex',
          background: '#f1f5f9',
          borderRadius: '8px',
          padding: '3px',
          marginBottom: '10px',
          gap: '4px',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={pourMode === 'by_dose'}
          disabled={isBusy}
          onClick={() => setPourMode('by_dose')}
          style={{
            flex: 1,
            padding: '6px 8px',
            fontSize: '12px',
            fontWeight: pourMode === 'by_dose' ? 600 : 500,
            color: pourMode === 'by_dose' ? '#0284c7' : '#64748b',
            background: pourMode === 'by_dose' ? '#ffffff' : 'transparent',
            borderRadius: '6px',
            border: 'none',
            boxShadow: pourMode === 'by_dose' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            cursor: isBusy ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Rót theo lượng
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pourMode === 'free'}
          disabled={isBusy}
          onClick={() => setPourMode('free')}
          style={{
            flex: 1,
            padding: '6px 8px',
            fontSize: '12px',
            fontWeight: pourMode === 'free' ? 600 : 500,
            color: pourMode === 'free' ? '#0284c7' : '#64748b',
            background: pourMode === 'free' ? '#ffffff' : 'transparent',
            borderRadius: '6px',
            border: 'none',
            boxShadow: pourMode === 'free' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            cursor: isBusy ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Rót tự do
        </button>
      </div>

      <p className="panel-description">
        {pourMode === 'by_dose'
          ? 'Chọn lượng, sau đó nhấn "+ Thêm" hoặc kéo cốc vào miệng cốc 500 ml để rót.'
          : 'Kéo cốc vào miệng cốc 500 ml và giữ chuột để rót tự do. Thả chuột để dừng.'}
      </p>

      <div className="ingredient-list">
        {INGREDIENTS.map((ingredient) => (
          <IngredientCard key={ingredient.id} ingredient={ingredient} mode={pourMode} />
        ))}
      </div>
      <p className="footnote">
        {pourMode === 'by_dose'
          ? 'Có thể thêm mỗi chất nhiều lần. Lượng hiển thị là tổng đã thêm.'
          : 'Tốc độ thao tác: Nước 25 ml/s, Dầu 15 ml/s, Đường/Cát 10 g/s. Giới hạn cốc 500 ml.'}
      </p>

      {/* Group 4: 1-Click Preset Experiments */}
      <PresetExperiments />
    </aside>
  );
}
