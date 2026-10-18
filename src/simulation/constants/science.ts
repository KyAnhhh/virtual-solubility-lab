import { CAPACITY_MILLI_ML, CAPACITY_ML } from './ingredients';

/**
 * Teaching model densities and conversion factors.
 * Standard defined in SCIENTIFIC_SPEC §1, §4, §8, §10.
 */
export const DENSITY_WATER = 1.0; // g/ml
export const DENSITY_OIL = 0.9;   // g/ml

/**
 * Teaching model solubility default (mô hình giáo khoa mặc định):
 * S0 = 2.0 g sugar per g water (g/g-water), capacityG = S0 * W.
 * Với khối lượng riêng mẫu rhoW = 1.0 g/ml, 1.0 ml nước tương đương 1.0 g nước.
 * Lưu ý: Đây là hệ số mô hình giáo khoa giả định, dự án MVP chưa mô phỏng nhiệt độ
 * hoặc hiệu chuẩn định lượng thực nghiệm (SCIENTIFIC_SPEC §5.2).
 */
export const SOLUBILITY_SUGAR_DEFAULT = 2.0; // g sugar per g water
export const SOLUBILITY_SUGAR_20C = SOLUBILITY_SUGAR_DEFAULT;

/**
 * Teaching dissolution kinetic rates (mô hình giáo khoa mặc định):
 * kG0 = 0.025 /s (tốc độ hòa tan nền không khuấy)
 * kG1 = 0.25 /s (hệ số gia tốc khi khuấy tối đa)
 * Chuẩn đặc tả trong SCIENTIFIC_SPEC §5.
 */
export const DISSOLUTION_RATE_BASE = 0.025;   // s^-1
export const DISSOLUTION_RATE_STIRRED = 0.25; // s^-1

/**
 * Teaching suspension & sedimentation kinetic rates for sand and fGu (SCIENTIFIC_SPEC §5):
 * kLiftMax = 0.6 /s (hệ số nâng tối đa khi khuấy mạnh)
 * settleWater = 0.15 /s (tốc độ lắng tự nhiên trong nước)
 * settleOil = 0.06 /s (tốc độ lắng tự nhiên trong dầu)
 */
export const SAND_LIFT_MAX = 0.6;          // s^-1
export const SAND_SETTLE_WATER = 0.15;     // s^-1
export const SAND_SETTLE_OIL = 0.06;       // s^-1

/**
 * Teaching oil breakup & separation kinetic rates (SCIENTIFIC_SPEC §5.4):
 * kBreak = OIL_BREAKUP_COEFF * I^2 * waterFraction (default 0.5 s^-1)
 * kSeparate = OIL_SEPARATE_BASE / (1 + 3 * I) (default 0.10 s^-1)
 */
export const OIL_BREAKUP_COEFF = 0.5;      // s^-1
export const OIL_SEPARATE_BASE = 0.10;     // s^-1

/**
 * Visual occupancy displacement coefficients (ml/g).
 * Note: Visual representation only, not measured density or solution contraction.
 */
export const DISPLACEMENT_ML_PER_G_SUGAR = 0.65;
export const DISPLACEMENT_ML_PER_G_SAND = 0.60;

export const MAX_RESERVATION_MILLI_ML = CAPACITY_MILLI_ML; // 500,000 milli-ml = 500 ml
export const MAX_BEAKER_CAPACITY_ML = CAPACITY_ML;         // 500 ml

/**
 * Canonical mass epsilon function according to SCIENTIFIC_SPEC §8 & §10:
 * eps(totalG) = max(1e-8 g, 1e-9 * totalG)
 */
export function epsilonMass(totalG: number): number {
  if (!Number.isFinite(totalG) || totalG <= 0) {
    return 1e-8;
  }
  return Math.max(1e-8, 1e-9 * totalG);
}

/**
 * Significance label threshold according to SCIENTIFIC_SPEC §8:
 * L(totalG) = max(0.01 g, 0.01 * totalG)
 * Used for UX / educational labels ("gần tan hết"), NOT for numerical invariant snapping.
 */
export function significanceThreshold(totalG: number): number {
  if (!Number.isFinite(totalG) || totalG <= 0) {
    return 0.01;
  }
  return Math.max(0.01, 0.01 * totalG);
}

/**
 * Converts integer deciTicks (0.1 ml) to water mass in grams (rhoW = 1.0 g/ml).
 */
export function ticksToWaterMassG(ticks: number): number {
  return (ticks * DENSITY_WATER) / 10;
}

/**
 * Converts integer deciTicks (0.1 ml) to oil mass in grams (rhoO = 0.9 g/ml).
 */
export function ticksToOilMassG(ticks: number): number {
  return (ticks * DENSITY_OIL) / 10;
}

/**
 * Converts integer deciTicks (0.1 g) to sugar mass in grams.
 */
export function ticksToSugarMassG(ticks: number): number {
  return ticks / 10;
}

/**
 * Converts integer deciTicks (0.1 g) to sand mass in grams.
 */
export function ticksToSandMassG(ticks: number): number {
  return ticks / 10;
}

/**
 * Computes maximum sugar dissolution capacity for a given water mass in grams:
 * capacityG = W * SOLUBILITY_SUGAR_DEFAULT (S0 = 2.0 g đường / g nước).
 */
export function computeWaterCapacityG(waterMassG: number): number {
  if (!Number.isFinite(waterMassG) || waterMassG <= 0) {
    return 0;
  }
  return waterMassG * SOLUBILITY_SUGAR_DEFAULT;
}
