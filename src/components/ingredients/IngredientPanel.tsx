import { useState } from 'react';
import { INGREDIENTS } from '../../simulation/constants/ingredients';
import { useExperimentStore } from '../../stores/experimentStore';
import type { IngredientDefinition } from '../../types/experiment';
function IngredientCard({ ingredient }: { ingredient: IngredientDefinition }) {
  const [amount, setAmount] = useState(ingredient.id === 'water' ? '100' : ingredient.id === 'oil' ? '20' : '10');
  const add = useExperimentStore((s) => s.add);
  const inputId = `quantity-${ingredient.id}`;
  return (
    <form className="ingredient" onSubmit={(event) => { event.preventDefault(); add(ingredient.id, amount); }}>
      <div className="flex items-center gap-3">
        <span className={`sample sample-${ingredient.id}`} style={{ backgroundColor: ingredient.color }} aria-hidden="true" />
        <div>
          <h3>{ingredient.name}</h3>
          <p>{ingredient.description}</p>
        </div>
      </div>
      <div className="dose-row">
        <label className="quantity-input" htmlFor={inputId}>
          <span className="sr-only">Lượng {ingredient.name.toLowerCase()} ({ingredient.unit})</span>
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            required
            value={amount}
            aria-label={`Lượng ${ingredient.name.toLowerCase()} (${ingredient.unit})`}
            onChange={(e) => setAmount(e.target.value)}
          />
          <span>{ingredient.unit}</span>
        </label>
        <button type="submit" aria-label={`Thêm ${ingredient.name.toLowerCase()}`}>
          + Thêm
        </button>
      </div>
    </form>
  );
}
export function IngredientPanel() {
  return <aside className="panel ingredients-panel"><div className="panel-title"><span className="eyebrow">NGUYÊN LIỆU</span><span className="small-tag">4 chất</span></div><h2>Thêm vào cốc</h2><p className="panel-description">Chọn lượng, sau đó nhấn thêm.</p><div className="ingredient-list">{INGREDIENTS.map((ingredient) => <IngredientCard key={ingredient.id} ingredient={ingredient}/>)}</div><p className="footnote">Có thể thêm mỗi chất nhiều lần. Lượng hiển thị là tổng đã thêm.</p></aside>;
}
