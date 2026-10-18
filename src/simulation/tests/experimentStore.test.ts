import { beforeEach, describe, expect, it } from 'vitest';
import { useExperimentStore } from '../../stores/experimentStore';
import {
  formatDeciTicks,
  formatPhaseMass,
  parseAmountString,
  parseInputAmount,
} from '../constants/ingredients';

beforeEach(() => useExperimentStore.getState().reset());

describe('phase 1 ingredient actions — baseline compatibility', () => {
  it('adds quantities cumulatively and records all four ingredients', () => {
    const { add } = useExperimentStore.getState();
    add('water', 100);
    add('water', 50);
    add('sugar', 10);
    add('sand', 20);
    add('oil', 30);
    expect(useExperimentStore.getState().quantities).toEqual({ water: 150, sugar: 10, sand: 20, oil: 30 });
    expect(useExperimentStore.getState().deciTicks).toEqual({ water: 1500, sugar: 100, sand: 200, oil: 300 });
    expect(useExperimentStore.getState().additions).toHaveLength(5);
  });

  it('rejects non-finite, nonpositive, excessive and overflowing additions', () => {
    const { add } = useExperimentStore.getState();
    for (const amount of [NaN, Infinity, 0, -10, 501]) add('water', amount);
    expect(useExperimentStore.getState().quantities.water).toBe(0);
    add('water', 500);
    add('oil', 1);
    add('sand', 1);
    expect(useExperimentStore.getState().quantities).toEqual({ water: 500, sugar: 0, sand: 0, oil: 0 });
    expect(useExperimentStore.getState().additions).toHaveLength(1);
  });

  it('clears contents and history when reset', () => {
    useExperimentStore.getState().add('sugar', 10);
    useExperimentStore.getState().reset();
    expect(useExperimentStore.getState().quantities.sugar).toBe(0);
    expect(useExperimentStore.getState().deciTicks.sugar).toBe(0);
    expect(useExperimentStore.getState().additions).toEqual([]);
  });
});

describe('V1-04: Vietnamese raw string parser (SPEC §1.1 & SC-IN01)', () => {
  it('parses valid raw strings with comma or dot into exact deci-ticks', () => {
    expect(parseAmountString(' 1,2 ')).toEqual({ ok: true, ticks: 12, amount: 1.2 });
    expect(parseAmountString('1.2')).toEqual({ ok: true, ticks: 12, amount: 1.2 });
    expect(parseAmountString('0001')).toEqual({ ok: true, ticks: 10, amount: 1.0 });
    expect(parseAmountString('0.1')).toEqual({ ok: true, ticks: 1, amount: 0.1 });
    expect(parseAmountString(' 0,1 ')).toEqual({ ok: true, ticks: 1, amount: 0.1 });
    expect(parseAmountString('500')).toEqual({ ok: true, ticks: 5000, amount: 500.0 });
    expect(parseAmountString('10,0')).toEqual({ ok: true, ticks: 100, amount: 10.0 });
  });

  it('rejects empty, whitespace, sign, exponent, grouping, trailing junk, zero, and multi-decimal strings', () => {
    const invalidInputs = [
      '',
      '   ',
      '.1',
      '1.',
      ',1',
      '1,',
      '1e2',
      '1.2x',
      '1,000.0',
      '1 000',
      '0.14',
      '0',
      '-1',
      '+1',
      '0.0',
      '0,0',
      '000',
      '1.2.3',
      '1,2,3',
      '1.2,3',
    ];

    for (const input of invalidInputs) {
      const result = parseAmountString(input);
      expect(result.ok, `Expected parseAmountString("${input}") to be rejected`).toBe(false);
    }
  });

  it('rejects invalid types and non-finite payloads', () => {
    expect(parseInputAmount(null).ok).toBe(false);
    expect(parseInputAmount(undefined).ok).toBe(false);
    expect(parseInputAmount(true).ok).toBe(false);
    expect(parseInputAmount({}).ok).toBe(false);
    expect(parseInputAmount(NaN).ok).toBe(false);
    expect(parseInputAmount(Infinity).ok).toBe(false);
    expect(parseInputAmount(-5).ok).toBe(false);
    expect(parseInputAmount(0).ok).toBe(false);
    expect(parseInputAmount(0.14).ok).toBe(false); // Invalid step (two decimal places)
  });
});

describe('V1-04: Exact deci-unit accumulation and single source of truth (SC-IN02)', () => {
  it('adds 0.1 ten times to produce exact 1.0 without float rounding drift', () => {
    const store = useExperimentStore.getState();
    for (let i = 0; i < 10; i++) {
      const success = store.add('sugar', '0.1');
      expect(success).toBe(true);
    }

    const state = useExperimentStore.getState();
    expect(state.deciTicks.sugar).toBe(10);
    expect(state.quantities.sugar).toBe(1.0);
    expect(state.additions).toHaveLength(10);
    for (const addition of state.additions) {
      expect(addition.deciTicks).toBe(1);
      expect(addition.amount).toBe(0.1);
    }
  });

  it('accepts Vietnamese comma string additions in store', () => {
    const store = useExperimentStore.getState();
    expect(store.add('sugar', ' 1,2 ')).toBe(true);
    expect(useExperimentStore.getState().deciTicks.sugar).toBe(12);
    expect(useExperimentStore.getState().quantities.sugar).toBe(1.2);
  });
});

describe('V1-04: Per-add limits and capacity serialization (SC-IN03 & SC-IN04)', () => {
  it('enforces per-add maximum for each ingredient', () => {
    const store = useExperimentStore.getState();

    // water max 500
    expect(store.add('water', '500.1')).toBe(false);
    expect(store.add('water', '500')).toBe(true);
    store.reset();

    // oil max 200
    expect(store.add('oil', '200.1')).toBe(false);
    expect(store.add('oil', '200')).toBe(true);
    store.reset();

    // sugar max 100
    expect(store.add('sugar', '100.1')).toBe(false);
    expect(store.add('sugar', '100')).toBe(true);
    store.reset();

    // sand max 100
    expect(store.add('sand', '100.1')).toBe(false);
    expect(store.add('sand', '100')).toBe(true);
  });

  it('rejects additions exceeding capacity based on latest state without altering previous totals', () => {
    const store = useExperimentStore.getState();

    // Add 499.9 ml water (4999 ticks = 499,900 milli-ml)
    expect(store.add('water', '499.9')).toBe(true);
    expect(useExperimentStore.getState().deciTicks.water).toBe(4999);

    // Add 0.1 ml water (5000 ticks = 500,000 milli-ml) -> exactly fills 500 ml
    expect(store.add('water', '0.1')).toBe(true);
    expect(useExperimentStore.getState().deciTicks.water).toBe(5000);

    // Any further addition must be rejected
    expect(store.add('oil', '0.1')).toBe(false);
    expect(store.add('sugar', '0.1')).toBe(false);
    expect(store.add('sand', '0.1')).toBe(false);

    // Totals and additions remain unchanged
    const finalState = useExperimentStore.getState();
    expect(finalState.deciTicks).toEqual({ water: 5000, sugar: 0, sand: 0, oil: 0 });
    expect(finalState.quantities).toEqual({ water: 500, sugar: 0, sand: 0, oil: 0 });
    expect(finalState.additions).toHaveLength(2);
  });

  it('rejects unknown ingredient id gracefully', () => {
    const store = useExperimentStore.getState();
    // @ts-expect-error testing unknown ingredient
    expect(store.add('salt', '10')).toBe(false);
    expect(useExperimentStore.getState().additions).toHaveLength(0);
  });
});

describe('V1-04: Formatting utilities (SPEC §1.1)', () => {
  it('formats deci-ticks correctly into Vietnamese decimal strings', () => {
    expect(formatDeciTicks(0)).toBe('0');
    expect(formatDeciTicks(1)).toBe('0,1');
    expect(formatDeciTicks(10)).toBe('1');
    expect(formatDeciTicks(12)).toBe('1,2');
    expect(formatDeciTicks(100)).toBe('10');
    expect(formatDeciTicks(1500)).toBe('150');
    expect(formatDeciTicks(4999)).toBe('499,9');
  });

  it('formats phase mass according to SPEC §1.1 thresholds', () => {
    expect(formatPhaseMass(0)).toBe('0 g');
    expect(formatPhaseMass(0.04)).toBe('<0,1 g');
    expect(formatPhaseMass(0.099)).toBe('<0,1 g');
    expect(formatPhaseMass(0.1)).toBe('0,1 g');
    expect(formatPhaseMass(1.2)).toBe('1,2 g');
    expect(formatPhaseMass(5)).toBe('5 g');
    expect(formatPhaseMass(10.0)).toBe('10 g');
  });
});
