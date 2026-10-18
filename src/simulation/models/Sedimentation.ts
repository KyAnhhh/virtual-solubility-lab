import type { SimulationModel } from '../core/SimulationEngine';
export interface SedimentationModel extends SimulationModel { readonly kind: 'sedimentation' }
