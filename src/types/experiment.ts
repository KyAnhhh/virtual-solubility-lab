export type IngredientId = 'water' | 'sugar' | 'sand' | 'oil';
export type Unit = 'ml' | 'g';
export interface IngredientDefinition { id: IngredientId; name: string; unit: Unit; color: string; description: string; maxAddition: number; step: number }
export interface Addition { id: number; ingredient: IngredientId; amount: number; deciTicks?: number }
export type Quantities = Record<IngredientId, number>;
export type DeciTicks = Record<IngredientId, number>;
export interface ExperimentSnapshot { deciTicks: DeciTicks; quantities: Quantities; additions: Addition[] }

export interface ActivePour {
  token: number;
  generation: number;
  ingredient: IngredientId;
  amount: number;
  deciTicks: number;
  unit: Unit;
  name: string;
  dispatched: boolean;
  startTime: number;
  fromDrop?: boolean;
  dropPos?: readonly [number, number, number];
}

export type PourMode = 'by_dose' | 'free';

export interface DraggedVesselState {
  token: number;
  ingredient: IngredientId;
  pointerId: number;
  mode: PourMode;
  snapshotAmount: number;
  snapshotDeciTicks: number;
  unit: Unit;
  name: string;
  position: [number, number, number];
  isInsideDropZone: boolean;
  isTouchingBeaker?: boolean;
  isNearBeaker?: boolean;
  freePourPhase?: 'dragging' | 'lifting' | 'pouring' | 'returning';
  isPouringStream?: boolean;
  totalAddedAmount?: number;
  startedAt: number;
}
