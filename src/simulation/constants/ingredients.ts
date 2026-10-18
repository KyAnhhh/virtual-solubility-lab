import type { DeciTicks, IngredientDefinition, IngredientId, Quantities } from '../../types/experiment';

export const CAPACITY_ML = 500;
export const CAPACITY_MILLI_ML = 500_000;

// Visual occupancy only: not measured density or a solution-volume prediction.
export const VISUAL_ML_PER_GRAM = { sugar: 0.65, sand: 0.6 };

export const VISUAL_MILLI_ML_PER_TICK: Record<IngredientId, number> = {
  water: 100,
  oil: 100,
  sugar: 65,
  sand: 60,
};

export const INGREDIENTS: IngredientDefinition[] = [
  { id: 'water', name: 'Nước', unit: 'ml', color: '#66bce0', description: 'Dung môi · lớp xanh trong', maxAddition: 500, step: 10 },
  { id: 'sugar', name: 'Đường', unit: 'g', color: '#e8e3d4', description: 'Hạt trắng · hiển thị nguyên hạt', maxAddition: 100, step: 5 },
  { id: 'sand', name: 'Cát', unit: 'g', color: '#c89757', description: 'Hạt vàng nâu · ở đáy cốc', maxAddition: 100, step: 5 },
  { id: 'oil', name: 'Dầu ăn', unit: 'ml', color: '#e4bd49', description: 'Lớp vàng · phía trên nước', maxAddition: 200, step: 10 },
];

const RAW_DECIMAL_REGEX = /^\d+(?:[.,]\d)?$/;

export type ParseAmountResult =
  | { ok: true; ticks: number; amount: number }
  | { ok: false; error: string };

export function parseAmountString(raw: string): ParseAmountResult {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Kiểu dữ liệu lượng thêm không hợp lệ.' };
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Lượng thêm không được để trống.' };
  }
  if (!RAW_DECIMAL_REGEX.test(trimmed)) {
    return {
      ok: false,
      error: 'Định dạng lượng không hợp lệ. Chỉ nhập số nguyên hoặc một chữ số thập phân (bước 0,1).',
    };
  }

  const normalized = trimmed.replace(',', '.');
  const [intPartStr, decPartStr] = normalized.split('.');

  if (intPartStr.length > 15) {
    return { ok: false, error: 'Giá trị quá lớn, vượt giới hạn số nguyên an toàn.' };
  }
  const intPart = Number(intPartStr);
  if (!Number.isSafeInteger(intPart) || intPart > Math.floor(Number.MAX_SAFE_INTEGER / 10)) {
    return { ok: false, error: 'Giá trị quá lớn, vượt giới hạn số nguyên an toàn.' };
  }

  const decPart = decPartStr !== undefined ? Number(decPartStr) : 0;
  const ticks = intPart * 10 + decPart;

  if (!Number.isSafeInteger(ticks) || ticks <= 0) {
    return { ok: false, error: 'Lượng thêm phải là số dương lớn hơn 0.' };
  }

  return { ok: true, ticks, amount: ticks / 10 };
}

export function parseInputAmount(raw: unknown): ParseAmountResult {
  if (typeof raw === 'string') {
    return parseAmountString(raw);
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || Number.isNaN(raw) || raw <= 0) {
      return { ok: false, error: 'Lượng thêm phải là số hữu hạn lớn hơn 0.' };
    }
    const roundedTicks = Math.round(raw * 10);
    if (Math.abs(roundedTicks / 10 - raw) > 1e-9) {
      return { ok: false, error: 'Lượng thêm chỉ được có tối đa một chữ số thập phân (bước 0,1).' };
    }
    if (!Number.isSafeInteger(roundedTicks) || roundedTicks <= 0) {
      return { ok: false, error: 'Lượng thêm không hợp lệ.' };
    }
    return { ok: true, ticks: roundedTicks, amount: roundedTicks / 10 };
  }
  return { ok: false, error: 'Kiểu dữ liệu lượng thêm không hợp lệ.' };
}

export const occupiedVolumeMilliMl = (ticks: DeciTicks): number =>
  ticks.water * VISUAL_MILLI_ML_PER_TICK.water +
  ticks.oil * VISUAL_MILLI_ML_PER_TICK.oil +
  ticks.sugar * VISUAL_MILLI_ML_PER_TICK.sugar +
  ticks.sand * VISUAL_MILLI_ML_PER_TICK.sand;

export const occupiedVolume = (q: Quantities): number =>
  q.water + q.oil + q.sugar * VISUAL_ML_PER_GRAM.sugar + q.sand * VISUAL_ML_PER_GRAM.sand;

export const ticksToQuantities = (ticks: DeciTicks): Quantities => ({
  water: ticks.water / 10,
  sugar: ticks.sugar / 10,
  sand: ticks.sand / 10,
  oil: ticks.oil / 10,
});

export function formatDeciTicks(ticks: number): string {
  if (!Number.isSafeInteger(ticks) || ticks <= 0) return '0';
  const intPart = Math.floor(ticks / 10);
  const fracPart = ticks % 10;
  if (fracPart === 0) return intPart.toString();
  return `${intPart},${fracPart}`;
}

export function formatPhaseMass(massGrams: number, unit = 'g'): string {
  if (!Number.isFinite(massGrams) || massGrams <= 0 || Object.is(massGrams, -0)) {
    return `0 ${unit}`;
  }
  if (massGrams < 0.1) {
    return `<0,1 ${unit}`;
  }
  const rounded = Math.round(massGrams * 10) / 10;
  const intPart = Math.floor(rounded);
  const fracPart = Math.round((rounded - intPart) * 10);
  if (fracPart === 0) return `${intPart} ${unit}`;
  return `${intPart},${fracPart} ${unit}`;
}
