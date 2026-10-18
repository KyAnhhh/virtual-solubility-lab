/**
 * Canonical stirring and fluid flow constants.
 * Standard defined in SCIENTIFIC_SPEC §5.1.
 */

export const A_STIR = 2.0; // s^-1 (coupling rate)
export const B_STIR = 0.8; // s^-1 (damping rate)
export const FLOW_LAMBDA = A_STIR + B_STIR; // 2.8 s^-1
export const FLOW_NORMALIZATION_RAD_PER_SEC = 6.0; // rad/s (flow intensity normalization)
export const MAX_ROD_SPEED_RAD_PER_SEC = 8.0; // rad/s (physical rod angular velocity cap)
export const DEFAULT_ORBIT_RADIUS = 0.4; // scene units (default stirring spoon orbit radius)
export const RADIAL_COUPLING_NORMALIZATION = 0.4; // scene units (denominator for min(r / 0.4, 1))

// Prescribed auto level speeds in rad/s (SPEC §5.1)
export const AUTO_LEVEL_SPEEDS: Record<'slow' | 'medium' | 'fast', number> = {
  slow: 1.0,
  medium: 3.0,
  fast: 6.0,
};
