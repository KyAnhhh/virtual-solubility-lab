import type { ScalarSnapshot } from '../../simulation/core/SimulationState';
import {
  epsilonMass,
  significanceThreshold,
  SOLUBILITY_SUGAR_DEFAULT,
} from '../../simulation/constants/science';
import { formatPhaseMass } from '../../simulation/constants/ingredients';
import { computeDissolutionRate } from '../../simulation/models/Dissolution';
import {
  computeCarrierFractions,
  computeSuspensionRates,
} from '../../simulation/models/SandSuspension';
import {
  computeOilCarrierFractions,
  computeOilRates,
} from '../../simulation/models/OilSeparation';

export { formatPhaseMass };

export interface HysteresisState {
  nearSaturation: boolean;
  nearComplete: boolean;
}

export const INITIAL_HYSTERESIS_STATE: HysteresisState = {
  nearSaturation: false,
  nearComplete: false,
};

/**
 * Formats maximum solvent capacity in grams:
 * Returns "N/A" if water mass is 0 or non-finite (SPEC §8).
 */
export function formatCapacity(capacityG: number, waterG: number): string {
  if (!Number.isFinite(waterG) || waterG <= 0 || !Number.isFinite(capacityG) || capacityG <= 0) {
    return 'N/A';
  }
  return formatPhaseMass(capacityG, 'g');
}

/**
 * Formats saturation ratio as a Vietnamese-locale percentage (e.g. "49,5%").
 * Returns "N/A" if ratio is null or non-finite (SPEC §8).
 */
export function formatSaturationRatio(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio) || ratio < 0) {
    return 'N/A';
  }
  const pct = Math.round(ratio * 1000) / 10;
  return `${pct.toFixed(1).replace('.', ',')}%`;
}

/**
 * Formats dissolution progress as a Vietnamese-locale percentage.
 * Rules (SPEC §8 & SC-U02):
 * - If progress is null or non-finite: return "N/A".
 * - If headroom > 1e-8 (or progress < 1.0 when headroom not provided) and progress rounds to >= 99.95%:
 *   cap display at "99,9%" (prevents rounding up to 100% before the dissolvable amount is reached).
 * - When headroom <= 1e-8 (or progress >= 1.0 when headroom not provided) and progress >= 99.95%:
 *   display "100%".
 */
export function formatDissolutionProgress(progress: number | null, headroomG?: number): string {
  if (progress === null || !Number.isFinite(progress) || progress < 0) {
    return 'N/A';
  }
  const hasHeadroom = headroomG !== undefined ? headroomG > 1e-8 : progress < 1.0;
  const pct = Math.round(progress * 1000) / 10;
  if (hasHeadroom && pct >= 100) {
    return '99,9%';
  }
  if (!hasHeadroom && pct >= 100) {
    return '100%';
  }
  return `${pct.toFixed(1).replace('.', ',')}%`;
}

/**
 * Updates hysteresis state for near-saturation and near-complete flags according to SCIENTIFIC_SPEC §8:
 * - nearSaturation: enter >= 0.99, exit < 0.98.
 * - nearComplete: enter Gu <= L(Gt), exit Gu > 1.2 * L(Gt) (for Gu > 0 and Gt > 0).
 *   Cannot be nearComplete if excess sugar exists (Gt > capacityG + eps).
 */
export function updateHysteresisState(
  prev: HysteresisState,
  current: {
    saturationRatio: number | null;
    Gu: number;
    Gt: number;
    W: number;
    capacityG?: number;
  }
): HysteresisState {
  let nearSaturation = prev.nearSaturation;
  if (current.W <= 0 || current.saturationRatio === null) {
    nearSaturation = false;
  } else if (!prev.nearSaturation && current.saturationRatio >= 0.99) {
    nearSaturation = true;
  } else if (prev.nearSaturation && current.saturationRatio < 0.98) {
    nearSaturation = false;
  }

  let nearComplete = prev.nearComplete;
  if (current.Gt <= 0 || current.W <= 0) {
    nearComplete = false;
  } else {
    const capacity = current.capacityG ?? (current.W * SOLUBILITY_SUGAR_DEFAULT);
    const eps = epsilonMass(current.Gt);
    const hasExcess = current.Gt > capacity + eps;
    if (hasExcess) {
      nearComplete = false;
    } else {
      const L = significanceThreshold(current.Gt);
      if (!prev.nearComplete && current.Gu <= L && current.Gu > eps) {
        nearComplete = true;
      } else if (prev.nearComplete && (current.Gu > 1.2 * L || current.Gu <= eps)) {
        nearComplete = false;
      }
    }
  }

  return { nearSaturation, nearComplete };
}

/**
 * Pure continuous phase exchange rates derived from canonical model formulas.
 * Does NOT mutate state and does NOT use finite-differencing over snapshots.
 */
export interface PhaseRates {
  dG_dt: number;  // sugar dissolution rate (g/s) >= 0
  dSs_dt: number; // sand suspension rate (g/s), negative when settling
  dOd_dt: number; // oil droplet breakup/separation rate (g/s), negative when separating
}

export function computePhaseRates(snapshot: ScalarSnapshot): PhaseRates {
  if (snapshot.paused) {
    return { dG_dt: 0, dSs_dt: 0, dOd_dt: 0 };
  }

  const { mass, intensity } = snapshot;

  // 1. Sugar dissolution rate dG/dt = available * kG (continuous rate in g/s)
  let dG_dt = 0;
  if (mass.W > 0) {
    const capacityG = mass.W * SOLUBILITY_SUGAR_DEFAULT;
    const gap = Math.max(0, capacityG - mass.Gd);
    const available = Math.min(Math.max(0, mass.Gu), gap);
    if (available > 0) {
      const kG = computeDissolutionRate(intensity);
      dG_dt = available * kG;
    }
  }

  // 2. Sand suspension rate dSs/dt = kLift * Sb - kSettle * Ss
  let dSs_dt = 0;
  const { waterFraction: sandWf, hasCarrier } = computeCarrierFractions(mass);
  if (hasCarrier && mass.St > 0) {
    const { kLift, kSettle } = computeSuspensionRates(intensity, sandWf, hasCarrier);
    dSs_dt = kLift * Math.max(0, mass.Sb) - kSettle * Math.max(0, mass.Ss);
  } else if (!hasCarrier && mass.Ss > 0) {
    dSs_dt = -mass.Ss;
  }

  // 3. Oil droplet rate dOd/dt = kBreak * Ol - kSeparate * Od
  let dOd_dt = 0;
  const { waterFraction: oilWf, hasBothWaterAndOil } = computeOilCarrierFractions(mass);
  if (hasBothWaterAndOil && mass.Ot > 0) {
    const { kBreak, kSeparate } = computeOilRates(intensity, oilWf, hasBothWaterAndOil);
    dOd_dt = kBreak * Math.max(0, mass.Ol) - kSeparate * Math.max(0, mass.Od);
  }

  return { dG_dt, dSs_dt, dOd_dt };
}

export interface ScienceEvaluation {
  isFullyDissolved: boolean;
  isNearComplete: boolean;
  isSaturated: boolean;
  isNearSaturation: boolean;
  hasExcess: boolean;
  hasUndissolvedResidual: boolean;
  isSandSuspended: boolean;
  isSettling: boolean;
  isOilDispersed: boolean;
  isSeparating: boolean;
  rates: PhaseRates;
  explanation: string;
}

/**
 * Evaluates educational observations and state tags from snapshot and hysteresis state.
 * Implements strict condition priority and multi-substance co-occurrence (SPEC §8 & V4-04).
 */
export function evaluateScienceState(
  snapshot: ScalarSnapshot,
  hysteresis: HysteresisState
): ScienceEvaluation {
  const { mass, input, capacityG, paused, autoDriveEnabled, mode, intensity } = snapshot;
  const eps = epsilonMass(mass.Gt);
  const L_Gt = significanceThreshold(mass.Gt);
  const L_St = significanceThreshold(mass.St);
  const L_Ot = significanceThreshold(mass.Ot);

  const rates = computePhaseRates(snapshot);

  const hasExcess = mass.W > 0 && mass.Gt > capacityG + eps;
  const isFullyDissolved = mass.W > 0 && mass.Gt > 0 && mass.Gu <= eps && mass.Gd > 0 && !hasExcess;
  const isNearComplete = !isFullyDissolved && mass.W > 0 && mass.Gt > 0 && mass.Gu > 0 && !hasExcess && hysteresis.nearComplete;
  const isSaturated = mass.W > 0 && mass.Gt > 0 && capacityG > 0 && (capacityG - mass.Gd) <= eps;
  const isNearSaturation = !isSaturated && mass.W > 0 && mass.Gt > 0 && hysteresis.nearSaturation;
  const hasUndissolvedResidual = mass.Gu > L_Gt;

  // Dynamics predicates according to SPEC §8
  const isMixing = Math.abs(intensity) >= 0.05 || (autoDriveEnabled && mode === 'auto');
  const hasResidualFlow = !isMixing && Math.abs(intensity) > 0.005;

  const isSandSuspended = mass.St > 0 && mass.Ss > L_St;
  const isSettling = !paused && mass.St > 0 && mass.Ss > L_St && rates.dSs_dt < -1e-4;

  const isOilDispersed = mass.Ot > 0 && mass.Od > L_Ot;
  const isSeparating = !paused && mass.Ot > 0 && mass.Od > L_Ot && rates.dOd_dt < -1e-4;

  const totalInputTicks = input.water + input.sugar + input.sand + input.oil;
  const totalMass = mass.W + mass.Gt + mass.St + mass.Ot;

  let explanation = '';

  // Condition Priority 1: Empty beaker
  if (totalInputTicks === 0 && totalMass === 0) {
    explanation = 'Cốc rỗng. Thêm nguyên liệu rồi nhấn "Bắt đầu mô phỏng" để quan sát các hiện tượng hòa tan, lơ lửng và phân tách.';
  }
  // Condition Priority 1.5: Water present but no solutes or dispersoids yet
  else if (mass.W > 0 && mass.Gt === 0 && mass.St === 0 && mass.Ot === 0) {
    explanation = 'Trong cốc có nước, chưa thêm đường. Hãy thêm đường để quan sát hiện tượng hòa tan.';
  }
  // Condition Priority 2: Paused
  else if (paused) {
    explanation = 'Mô phỏng đang tạm dừng (các quá trình biến đổi vật lý và đồng hồ được đóng băng). Nhấn "Tiếp tục mô phỏng" để quan sát diễn biến.';
  }
  // Condition Priority 3: No water (Dry / Oil-only)
  else if (mass.W === 0) {
    if (mass.Gt > 0 && mass.Ot === 0 && mass.St === 0) {
      explanation = 'Chưa có nước: đường ở thể rắn đọng dưới đáy cốc, không thể hòa tan khi thiếu dung môi.';
    } else if (mass.St > 0 && mass.Ot === 0 && mass.Gt === 0) {
      explanation = 'Chưa có chất lỏng: cát đọng yên ở đáy cốc.';
    } else if (mass.Ot > 0) {
      if (mass.St > 0 && isSandSuspended) {
        explanation = 'Hệ chỉ có dầu: cát được nâng lơ lửng trong dầu khi khuấy nhưng không bị hòa tan.';
      } else if (mass.Gt > 0) {
        explanation = 'Hệ chỉ có dầu: đường không tan trong dầu và đọng ở đáy.';
      } else {
        explanation = 'Trong cốc chỉ có dầu, chưa có nước hoặc chất rắn.';
      }
    } else {
      explanation = 'Hệ khô không có nước: các chất rắn đọng ở đáy cốc, không có hiện tượng hòa tan hay phân tán.';
    }
  }
  // Condition Priority 4 & 5: Water present with dynamic / equilibrium phenomena
  else {
    const statements: string[] = [];

    // Sugar statement
    if (mass.Gt > 0) {
      if (hasExcess && (isSaturated || isNearSaturation)) {
        statements.push('Dung dịch đã đạt giới hạn bão hòa (2,0 g đường / g nước). Lượng đường dư không thể tan thêm và đọng ở đáy.');
      } else if (isFullyDissolved) {
        statements.push('Đường đã hòa tan hoàn toàn trong nước tạo thành dung dịch trong suốt đồng nhất.');
      } else if (isNearComplete) {
        statements.push('Đường đã tan gần hết vào nước.');
      } else if (isMixing) {
        statements.push('Đang khuấy: dòng đối lưu gia tốc khuếch tán giúp đường tan nhanh hơn (sức chứa bão hòa không đổi).');
      } else if (hasResidualFlow) {
        statements.push('Dòng xoáy suy giảm theo quán tính: đường tiếp tục hòa tan.');
      } else if (mass.Gu > 0) {
        statements.push('Nghỉ khuấy: đường vẫn hòa tan tự nhiên vào nước ở tốc độ nền (0,025 s⁻¹).');
      }
    }

    // Sand statement
    if (mass.St > 0) {
      if (isSettling) {
        statements.push('Cát không tan: đang lắng dần về đáy cốc khi dòng chảy giảm.');
      } else if (isSandSuspended) {
        statements.push('Cát không tan: các hạt cát đang lơ lửng, phân tán trong chất lỏng do dòng khuấy.');
      } else {
        statements.push('Cát không tan: toàn bộ cát lắng đọng thành lớp ở đáy cốc.');
      }
    }

    // Oil statement
    if (mass.Ot > 0) {
      if (isSeparating) {
        statements.push('Dầu không tan trong nước: các giọt dầu đang nổi lên và tách lớp trên bề mặt do nhẹ hơn nước.');
      } else if (isOilDispersed) {
        statements.push('Dầu không tan trong nước: lực khuấy xé dầu thành các giọt li ti phân tán trong nước.');
      } else {
        statements.push('Dầu không tan trong nước: phân tách thành lớp chất lỏng nhẹ nổi trên bề mặt.');
      }
    }

    if (statements.length > 0) {
      explanation = statements.join(' ');
    } else {
      explanation = 'Trong cốc có nước, chưa thêm đường, cát hoặc dầu. Hãy thêm nguyên liệu để quan sát các hiện tượng.';
    }
  }

  return {
    isFullyDissolved,
    isNearComplete,
    isSaturated,
    isNearSaturation,
    hasExcess,
    hasUndissolvedResidual,
    isSandSuspended,
    isSettling,
    isOilDispersed,
    isSeparating,
    rates,
    explanation,
  };
}

