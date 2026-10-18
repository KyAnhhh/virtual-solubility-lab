export type IngredientId = 'water' | 'sugar' | 'sand' | 'oil';
export type Unit = 'ml' | 'g';
export interface IngredientDefinition { id: IngredientId; name: string; unit: Unit; color: string; description: string; maxAddition: number; step: number }
export interface Addition { id: number; ingredient: IngredientId; amount: number; deciTicks?: number }
export type Quantities = Record<IngredientId, number>;
export type DeciTicks = Record<IngredientId, number>;
export interface ExperimentSnapshot { deciTicks: DeciTicks; quantities: Quantities; additions: Addition[] }
