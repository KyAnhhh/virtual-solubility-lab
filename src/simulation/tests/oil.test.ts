import { describe, expect, it } from 'vitest';
import { HeadlessSimulationEngine } from '../core/HeadlessSimulationEngine';
import {
  computeAnalyticOilSeparation,
  computeOilCarrierFractions,
  computeOilRates,
  computeOilSeparationStep,
} from '../models/OilSeparation';
import {
  computeBeakerRegions,
  type PhaseMasses,
} from '../constants/beaker';
import {
  epsilonMass,
  OIL_BREAKUP_COEFF,
} from '../constants/science';
import { assertMassInvariants } from '../models/MassLedger';

describe('V3-04 Oil Droplets Dispersion & Separation Kinetics', () => {
  describe('Part 1: Pure Model Unit Tests', () => {
    it('1. SC-O01: Water-only, oil-only, and empty systems yield Od = 0 and Ol = Ot', () => {
      // Empty
      const emptyMass = {
        W: 0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const outEmpty = computeOilSeparationStep(emptyMass, { intensity: 1.0, h: 1 / 60 });
      expect(outEmpty.OdNext).toBe(0);
      expect(outEmpty.OlNext).toBe(0);
      expect(outEmpty.hasBothWaterAndOil).toBe(false);

      // Water only: W = 100ml, Ot = 0 -> Od = 0
      const waterOnlyMass = { ...emptyMass, W: 100 };
      const outWater = computeOilSeparationStep(waterOnlyMass, { intensity: 1.0, h: 1 / 60 });
      expect(outWater.OdNext).toBe(0);
      expect(outWater.OlNext).toBe(0);
      expect(outWater.hasBothWaterAndOil).toBe(false);

      // Oil only: W = 0, Ot = 90g (100ml) -> Od = 0, Ol = 90g
      const oilOnlyMass = { ...emptyMass, Ot: 90, Ol: 90, Od: 0 };
      const outOil = computeOilSeparationStep(oilOnlyMass, { intensity: 1.0, h: 1 / 60 });
      expect(outOil.OdNext).toBe(0);
      expect(outOil.OlNext).toBe(90);
      expect(outOil.hasBothWaterAndOil).toBe(false);

      // Oil only with invalid lingering Od > 0 recombines to Ol
      const oilOnlyWithLingeringOd = { ...emptyMass, Ot: 90, Ol: 80, Od: 10 };
      const outRecombine = computeOilSeparationStep(oilOnlyWithLingeringOd, { intensity: 1.0, h: 1 / 60 });
      expect(outRecombine.pair).toBe('oil_separation');
      expect(outRecombine.dTransfer).toBe(10);
      expect(outRecombine.OdNext).toBe(0);
      expect(outRecombine.OlNext).toBe(90);
    });

    it('2. SC-O03: Rest / zero stirring (I=0), Ot=18g, initial Od=9g, Ol=9g -> Od(1s) = 9 * exp(-0.10) ≈ 8.1435367623 g', () => {
      // W = 100ml, O = 20ml (Ot = 18g at rhoO = 0.9)
      // Wml = 100, Oml = 20, waterFraction = 100 / 120 = 5/6
      // I = 0 -> kBreak = 0, kSeparate = 0.10, lambda = 0.10 s^-1
      const Ot = 18.0;
      let Od = 9.0;
      let Ol = 9.0;
      const mass = {
        W: 100.0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot,
        Ol,
        Od,
      };

      const h = 1 / 60;
      const intensity = 0;

      // 60 ticks = 1.0 simulated second
      for (let i = 0; i < 60; i++) {
        mass.Od = Od;
        mass.Ol = Ol;
        const out = computeOilSeparationStep(mass, { intensity, h });
        expect(out.pair).toBe('oil_separation');
        Od = out.OdNext;
        Ol = out.OlNext;
        expect(Ol + Od).toBeCloseTo(Ot, 10);
      }

      // Independent analytical oracle calculation:
      // Od(1s) = 9.0 * exp(-0.10 * 1.0) = 8.1435367623 g
      const expectedAnalytic = 9.0 * Math.exp(-0.10);
      expect(expectedAnalytic).toBeCloseTo(8.1435367623, 6);
      expect(Od).toBeCloseTo(expectedAnalytic, 6);
      expect(Od).toBeCloseTo(8.143536762, 5);
      expect(Ol).toBeCloseTo(Ot - expectedAnalytic, 6);
    });

    it('3. SC-O02: Active stirring (I=1.0), Ot=18g, initial Od=0g, Ol=18g -> Od(1s) matches analytical solution', () => {
      // W = 100ml, O = 20ml (Ot = 18g)
      // wf = 100 / 120 = 5/6
      // I = 1.0 -> kBreak = 0.5 * 1.0^2 * (5/6) = 5/12 ≈ 0.41666667 s^-1
      // kSeparate = 0.10 / (1 + 3 * 1.0) = 0.025 s^-1
      // lambda = 5/12 + 0.025 = 53/120 ≈ 0.44166667 s^-1
      // OdEq = 18 * (5/12) / (53/120) = 18 * 50 / 53 = 900 / 53 ≈ 16.9811320755 g
      // Od(1s) = (900/53) * (1 - exp(-53/120)) ≈ 6.0628588523 g
      const Ot = 18.0;
      let Od = 0.0;
      let Ol = 18.0;
      const mass = {
        W: 100.0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot,
        Ol,
        Od,
      };

      const h = 1 / 60;
      const intensity = 1.0;

      for (let i = 0; i < 60; i++) {
        mass.Od = Od;
        mass.Ol = Ol;
        const out = computeOilSeparationStep(mass, { intensity, h });
        expect(out.pair).toBe('oil_dispersion');
        Od = out.OdNext;
        Ol = out.OlNext;
        expect(Ol + Od).toBeCloseTo(Ot, 10);
      }

      const expectedLambda = 5 / 12 + 0.025;
      const expectedOdEq = 18 * (5 / 12) / expectedLambda;
      const expectedAnalytic = expectedOdEq * (1 - Math.exp(-expectedLambda));
      expect(expectedAnalytic).toBeCloseTo(6.0628768124, 4);
      expect(Od).toBeCloseTo(expectedAnalytic, 6);
      expect(Od).toBeCloseTo(6.062876812, 5);
      expect(Ol).toBeCloseTo(Ot - expectedAnalytic, 6);
    });

    it('2b. SC-O03 Regression (explicit initialOd=10g): Rest (I=0), Ot=10g, Od0=10g, Ol0=0g -> Od(1s) = 10 * exp(-0.10) ≈ 9.0483741804 g', () => {
      // W = 100ml, Ot = 10g (Oml = 10 / 0.9 = 11.111ml)
      // I = 0 -> kBreak = 0, kSeparate = 0.10 s^-1, lambda = 0.10 s^-1
      const Ot = 10.0;
      let Od = 10.0;
      let Ol = 0.0;
      const mass = {
        W: 100.0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot,
        Ol,
        Od,
      };

      const h = 1 / 60;
      const intensity = 0;

      for (let i = 0; i < 60; i++) {
        mass.Od = Od;
        mass.Ol = Ol;
        const out = computeOilSeparationStep(mass, { intensity, h });
        expect(out.pair).toBe('oil_separation');
        Od = out.OdNext;
        Ol = out.OlNext;
        expect(Ol + Od).toBeCloseTo(Ot, 10);
      }

      // Independent analytical oracle:
      // Od(1s) = 10.0 * exp(-0.10 * 1.0) = 9.0483741804 g
      const expectedAnalytic = 10.0 * Math.exp(-0.10);
      expect(expectedAnalytic).toBeCloseTo(9.0483741804, 6);
      expect(Od).toBeCloseTo(expectedAnalytic, 6);
      expect(Od).toBeCloseTo(9.0483741804, 6);
      expect(Ol).toBeCloseTo(Ot - expectedAnalytic, 6);
    });

    it('3b. SC-O02 Regression (explicit W=100g, Ot=10g, I=1.0, Od0=0g): Active stirring -> Od(1s) ≈ 3.5821415703 g', () => {
      // W = 100g (100ml), Ot = 10g (Oml = 10 / 0.9 = 100/9 ml)
      // wf = 100 / (100 + 100/9) = 900 / 1000 = 0.90
      // I = 1.0 -> kBreak = 0.5 * 1.0^2 * 0.90 = 0.45 s^-1
      // kSeparate = 0.10 / (1 + 3 * 1.0) = 0.025 s^-1
      // lambda = 0.45 + 0.025 = 0.475 s^-1
      // OdEq = 10 * 0.45 / 0.475 = 180 / 19 ≈ 9.4736842105 g
      // Od(1s) = (180/19) * (1 - exp(-0.475)) ≈ 3.5821415703 g
      const Ot = 10.0;
      let Od = 0.0;
      let Ol = 10.0;
      const mass = {
        W: 100.0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot,
        Ol,
        Od,
      };

      const h = 1 / 60;
      const intensity = 1.0;

      for (let i = 0; i < 60; i++) {
        mass.Od = Od;
        mass.Ol = Ol;
        const out = computeOilSeparationStep(mass, { intensity, h });
        expect(out.pair).toBe('oil_dispersion');
        Od = out.OdNext;
        Ol = out.OlNext;
        expect(Ol + Od).toBeCloseTo(Ot, 10);
      }

      const expectedLambda = 0.45 + 0.025;
      const expectedOdEq = (10 * 0.45) / expectedLambda;
      const expectedAnalytic = expectedOdEq * (1 - Math.exp(-expectedLambda));
      expect(expectedAnalytic).toBeCloseTo(3.5821415703, 6);
      expect(Od).toBeCloseTo(expectedAnalytic, 6);
      expect(Od).toBeCloseTo(3.58214157, 5);
      expect(Ol).toBeCloseTo(Ot - expectedAnalytic, 6);
    });

    it('4. Initial Od above/below equilibrium moves in correct direction', () => {
      const Ot = 18.0;
      const mass = {
        W: 100.0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot,
        Ol: 0,
        Od: 0,
      };

      // Below equilibrium: Od = 1g, I = 1.0 -> OdEq ≈ 16.98g -> should disperse
      mass.Od = 1.0;
      mass.Ol = 17.0;
      const outDisp = computeOilSeparationStep(mass, { intensity: 1.0, h: 1 / 60 });
      expect(outDisp.pair).toBe('oil_dispersion');
      expect(outDisp.OdNext).toBeGreaterThan(1.0);
      expect(outDisp.OlNext).toBeLessThan(17.0);

      // Above equilibrium: Od = 18g, I = 0.1 -> OdEq is low -> should separate
      mass.Od = 18.0;
      mass.Ol = 0.0;
      const outSep = computeOilSeparationStep(mass, { intensity: 0.1, h: 1 / 60 });
      expect(outSep.pair).toBe('oil_separation');
      expect(outSep.OdNext).toBeLessThan(18.0);
      expect(outSep.OlNext).toBeGreaterThan(0.0);
    });

    it('5. Water fraction calculation strictly uses liquid volumes (ml), not mass ratio', () => {
      // 90g water (90 ml) + 90g oil (100 ml at rhoO = 0.9)
      // Mass ratio = 90 / 180 = 0.5
      // Volume ratio = 90 / (90 + 100) = 90 / 190 ≈ 0.47368421
      const frac = computeOilCarrierFractions({ W: 90, Ot: 90 });
      expect(frac.hasBothWaterAndOil).toBe(true);
      expect(frac.Wml).toBeCloseTo(90, 6);
      expect(frac.Oml).toBeCloseTo(100, 6);
      expect(frac.waterFraction).toBeCloseTo(90 / 190, 6);
      expect(frac.waterFraction).not.toBeCloseTo(0.5, 3);

      const rates = computeOilRates(1.0, frac.waterFraction, true);
      const expectedKBreak = OIL_BREAKUP_COEFF * 1.0 * (90 / 190);
      expect(rates.kBreak).toBeCloseTo(expectedKBreak, 6);
    });

    it('6. Edge cases: h = 0, Ot = 0, and lambda = 0 behave gracefully', () => {
      const mass = {
        W: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 18,
        Ol: 9,
        Od: 9,
      };

      // h = 0
      const outHZero = computeOilSeparationStep(mass, { intensity: 1.0, h: 0 });
      expect(outHZero.dTransfer).toBe(0);
      expect(outHZero.OdNext).toBe(9);
      expect(outHZero.OlNext).toBe(9);

      // Ot = 0
      const massZeroOt = { ...mass, Ot: 0, Ol: 0, Od: 0 };
      const outZeroOt = computeOilSeparationStep(massZeroOt, { intensity: 1.0, h: 1 / 60 });
      expect(outZeroOt.dTransfer).toBe(0);
      expect(outZeroOt.OdNext).toBe(0);
      expect(outZeroOt.OlNext).toBe(0);
    });

    it('7. Negative or non-finite inputs reject with exception and no mutation', () => {
      const mass = {
        W: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 18,
        Ol: 9,
        Od: 9,
      };

      expect(() => computeOilSeparationStep(mass, { intensity: 1.0, h: -1 })).toThrow();
      expect(() => computeOilSeparationStep(mass, { intensity: 1.0, h: Number.NaN })).toThrow();
    });

    it('8. Small residual positive Od is preserved without snapping to 0', () => {
      const tinyOd = 1e-11;
      const mass = {
        W: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 18,
        Ol: 18 - tinyOd,
        Od: tinyOd,
      };

      const out = computeOilSeparationStep(mass, { intensity: 0, h: 1 / 60 });
      expect(out.OdNext).toBeGreaterThan(0);
      expect(out.OdNext).toBeLessThan(tinyOd);
      expect(out.OlNext + out.OdNext).toBeCloseTo(18, 10);
    });

    it('9. Ol + Od is strictly conserved at each step across diverse flow regimes', () => {
      const Ot = 18.0;
      let Od = 5.0;
      let Ol = 13.0;
      const mass = {
        W: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot,
        Ol,
        Od,
      };

      for (let i = 0; i < 120; i++) {
        mass.Od = Od;
        mass.Ol = Ol;
        const intensity = (i % 10) / 10;
        const out = computeOilSeparationStep(mass, { intensity, h: 1 / 60 });
        Od = out.OdNext;
        Ol = out.OlNext;
        expect(Math.abs(Ol + Od - Ot)).toBeLessThanOrEqual(epsilonMass(Ot));
      }
    });

    it('10. Timestep compatibility: h=1/60 vs h=1/120 matches continuous analytical oracle', () => {
      const Ot = 18.0;
      const intensity = 0.7;

      // 60 steps at h = 1/60 (t = 1.0 s)
      const mass60 = {
        W: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot,
        Ol: 18,
        Od: 0,
      };
      let od60 = 0;
      for (let i = 0; i < 60; i++) {
        mass60.Od = od60;
        mass60.Ol = Ot - od60;
        const out = computeOilSeparationStep(mass60, { intensity, h: 1 / 60 });
        od60 = out.OdNext;
      }

      // 120 steps at h = 1/120 (t = 1.0 s)
      const mass120 = { ...mass60 };
      let od120 = 0;
      for (let i = 0; i < 120; i++) {
        mass120.Od = od120;
        mass120.Ol = Ot - od120;
        const out = computeOilSeparationStep(mass120, { intensity, h: 1 / 120 });
        od120 = out.OdNext;
      }

      const expectedAnalytic = computeAnalyticOilSeparation(1.0, 0, Ot, intensity, {
        waterFraction: 100 / 120,
        hasBothWaterAndOil: true,
      });

      expect(od60).toBeCloseTo(expectedAnalytic, 5);
      expect(od120).toBeCloseTo(expectedAnalytic, 5);
      expect(Math.abs(od60 - od120)).toBeLessThan(1e-5);
    });
  });

  describe('Part 2: Engine Integration Tests', () => {
    it('11. Auto stirring in mixed water + oil creates dispersed droplets Od > 0', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();
      let seq = 1;

      // Add 100ml water (1000 deciTicks) and 20ml oil (200 deciTicks)
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 200 },
      });

      expect(engine.getState().mass.Ot).toBeCloseTo(18.0, 6);
      expect(engine.getState().mass.Ol).toBeCloseTo(18.0, 6);
      expect(engine.getState().mass.Od).toBe(0);

      // Start auto stirring at fast level
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'setAutoLevel', level: 'fast' },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      // Advance 120 ticks (2.0 sim seconds)
      for (let i = 0; i < 120; i++) {
        engine.advance(1 / 60);
      }

      const state = engine.getState();
      expect(state.mass.Od).toBeGreaterThan(0.5);
      expect(state.mass.Ol).toBeLessThan(17.5);
      expect(state.mass.Ol + state.mass.Od).toBeCloseTo(18.0, 10);
    });

    it('12. Auto fast uses realistic flow ramp from omegaFlow=0 without assuming fixed I=1.0', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();
      let seq = 1;

      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 200 },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'setAutoLevel', level: 'fast' },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      // At step 1, omegaFlow starts at 0, intensity is 0, so Od does not instantly jump
      engine.advance(1 / 60);
      const state1 = engine.getState();
      expect(state1.omegaFlow).toBeGreaterThan(0);
      expect(state1.mass.Od).toBeGreaterThan(0);
      // Because flow ramps up gradually, Od at 1s is lower than synthetic fixed I=1.0 (6.06g)
      for (let i = 1; i < 60; i++) {
        engine.advance(1 / 60);
      }
      const state60 = engine.getState();
      expect(state60.mass.Od).toBeLessThan(6.06);
      expect(state60.mass.Od).toBeGreaterThan(1.0);
    });

    it('13. SC-O04: Stop auto keeps clock running, flow decays, and separation dominates long-term', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();
      let seq = 1;

      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 200 },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'setAutoLevel', level: 'fast' },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      // Run 180 ticks to build up Od
      for (let i = 0; i < 180; i++) {
        engine.advance(1 / 60);
      }
      const odPeak = engine.getState().mass.Od;
      expect(odPeak).toBeGreaterThan(3.0);

      // Stop auto (releaseDrive) - clock keeps running, omegaDrive = 0, omegaFlow decays
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'releaseDrive' },
      });

      // Run 3600 ticks (60 seconds)
      for (let i = 0; i < 3600; i++) {
        engine.advance(1 / 60);
      }

      const state60s = engine.getState();
      expect(state60s.omegaFlow).toBeCloseTo(0, 5);
      // Exponential decay at kSeparate = 0.10/s: e^(-6) ≈ 0.00248 of peak (peak ≈ 7.7g -> ~0.019g)
      expect(state60s.mass.Od).toBeLessThan(0.05);
      expect(state60s.mass.Ol).toBeCloseTo(18.0, 1);
      expect(state60s.mass.Ol + state60s.mass.Od).toBeCloseTo(18.0, 10);

      // Run another 1800 ticks (30 seconds, total 90s after stop): e^(-9) ≈ 0.000123
      for (let i = 0; i < 1800; i++) {
        engine.advance(1 / 60);
      }
      const state90s = engine.getState();
      expect(state90s.mass.Od).toBeLessThan(0.005);
      expect(state90s.mass.Ol + state90s.mass.Od).toBeCloseTo(18.0, 10);
    });

    it('14. Pause freezes Ol and Od; resume continues seamlessly', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();
      let seq = 1;

      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 200 },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      for (let i = 0; i < 60; i++) {
        engine.advance(1 / 60);
      }
      const odBeforePause = engine.getState().mass.Od;

      // Pause
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'pause' },
      });

      // Advancing while paused executes 0 steps
      const res = engine.advance(1.0);
      expect(res.stepsExecuted).toBe(0);
      expect(engine.getState().mass.Od).toBe(odBeforePause);

      // Resume
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      engine.advance(1 / 60);
      expect(engine.getState().mass.Od).toBeGreaterThan(odBeforePause);
    });

    it('15. Adding oil while paused increases Ot and Ol, preserving existing Od with 0s elapsed', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();
      let seq = 1;

      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 200 }, // 18g
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      for (let i = 0; i < 60; i++) {
        engine.advance(1 / 60);
      }
      const odBefore = engine.getState().mass.Od;
      const olBefore = engine.getState().mass.Ol;
      const elapsedBefore = engine.getState().elapsedSeconds;

      // Pause
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'pause' },
      });

      // Add another 10ml oil (100 deciTicks = 9.0g) while paused
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 100 },
      });

      const stateAfter = engine.getState();
      expect(stateAfter.mass.Ot).toBeCloseTo(27.0, 10);
      expect(stateAfter.mass.Od).toBe(odBefore);
      expect(stateAfter.mass.Ol).toBeCloseTo(olBefore + 9.0, 10);
      expect(stateAfter.elapsedSeconds).toBe(elapsedBefore);
    });

    it('16. Adding water while paused preserves Od, updates W, and does not prematurely create droplets', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();
      let seq = 1;

      // Add oil only initially (90g = 100ml)
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 1000 },
      });
      expect(engine.getState().mass.Od).toBe(0);
      expect(engine.getState().mass.Ol).toBe(90.0);

      // Add water while paused (100ml = 1000 deciTicks)
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });

      // Immediate command commit does not evolve phase kinetics
      expect(engine.getState().mass.Od).toBe(0);
      expect(engine.getState().mass.Ol).toBe(90.0);
      expect(engine.getState().mass.W).toBe(100.0);
      expect(engine.getState().elapsedSeconds).toBe(0);
    });

    it('17. Oil-only sand suspension and fGu kinetics still operate normally', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();
      let seq = 1;

      // Add 100ml oil (90g) and 10g sand
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 1000 },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'setAutoLevel', level: 'fast' },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      for (let i = 0; i < 60; i++) {
        engine.advance(1 / 60);
      }

      const state = engine.getState();
      expect(state.mass.Od).toBe(0); // Od stays 0 in oil-only
      expect(state.mass.Ol).toBeCloseTo(90.0, 10);
      expect(state.mass.Ss).toBeGreaterThan(1.0); // Sand lifts in oil
      expect(state.mass.Sb + state.mass.Ss).toBeCloseTo(10.0, 10);
    });

    it('18. Sugar dissolution capacity depends strictly on water, unaffected by oil additions', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();
      let seq = 1;

      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 200 }, // 20ml water -> capacity 40g
      });
      const snap1 = engine.snapshot();
      expect(snap1.capacityG).toBeCloseTo(40.0, 10);

      // Add 50ml oil
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 500 },
      });
      const snap2 = engine.snapshot();
      expect(snap2.capacityG).toBeCloseTo(40.0, 10); // Still 40g
    });

    it('19. SC-R03: Beaker regions for L0, L1, and X fixtures verify layer vs droplet allocation', () => {
      // Fixture L0: W=100ml, O=20ml, Ol=18g (20ml), Od=0
      const phasesL0: PhaseMasses = {
        Wml: 100,
        Oml: 20,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        fGu: 0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 18,
        Ol: 18,
        Od: 0,
      };
      const regL0 = computeBeakerRegions(phasesL0);
      expect(regL0.category).toBe('mixed');
      expect(regL0.bed.volumeMl).toBe(0);
      expect(regL0.aqueous.volumeMl).toBe(100);
      expect(regL0.oil.volumeMl).toBe(20);
      expect(regL0.totalReserveMl).toBe(120);

      // Fixture L1: Same totals, but Ol=9g (10ml), Od=9g (10ml)
      // Droplets are inside aqueous region (100 + 10 = 110ml), oil layer is 10ml
      const phasesL1: PhaseMasses = {
        ...phasesL0,
        Ol: 9,
        Od: 9,
      };
      const regL1 = computeBeakerRegions(phasesL1);
      expect(regL1.category).toBe('mixed');
      expect(regL1.bed.volumeMl).toBe(0);
      expect(regL1.aqueous.volumeMl).toBe(110);
      expect(regL1.oil.volumeMl).toBe(10);
      expect(regL1.totalReserveMl).toBe(120);

      // Fixture X: G=100g (Gd=80g, Gu=20g, fGu=0), S=15g (Sb=10g, Ss=5g), W=350ml, O=50ml (Ot=45g, Ol=45g, Od=0)
      // Vbed = 0.65 * 20 + 0.60 * 10 = 13 + 6 = 19 ml
      // Vaq = 350 + 0.65 * 80 + 0.60 * 5 = 350 + 52 + 3 = 405 ml
      // Voil = 50 ml
      // Total = 19 + 405 + 50 = 474 ml
      const phasesX: PhaseMasses = {
        Wml: 350,
        Oml: 50,
        Gt: 100,
        Gu: 20,
        Gd: 80,
        fGu: 0,
        St: 15,
        Sb: 10,
        Ss: 5,
        Ot: 45,
        Ol: 45,
        Od: 0,
      };
      const regX = computeBeakerRegions(phasesX);
      expect(regX.category).toBe('mixed');
      expect(regX.totalReserveMl).toBeCloseTo(474, 6);
    });

    it('20. Reset and duplicate reset reset oil mass compartments to baseline', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();
      let seq = 1;

      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 200 },
      });
      expect(engine.getState().mass.Ot).toBe(18.0);

      // Reset
      const ackReset = engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'reset' },
      });
      expect(ackReset.accepted).toBe(true);
      expect(engine.getState().mass.Ot).toBe(0);
      expect(engine.getState().mass.Ol).toBe(0);
      expect(engine.getState().mass.Od).toBe(0);

      // Duplicate replay of reset returns original ack
      const ackDup = engine.dispatch({
        clientId: cid,
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'reset' },
      });
      expect(ackDup.accepted).toBe(true);
      expect(ackDup.duplicate).toBe(true);
    });

    it('21. Detached snapshot reflects current Ol and Od truthfully', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();
      let seq = 1;

      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 200 },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      for (let i = 0; i < 30; i++) {
        engine.advance(1 / 60);
      }

      const snap = engine.snapshot();
      expect(snap.mass.Ol).toBe(engine.getState().mass.Ol);
      expect(snap.mass.Od).toBe(engine.getState().mass.Od);
      expect(snap.mass.Ol + snap.mass.Od).toBeCloseTo(18.0, 10);
    });

    it('22. Long run 3600 ticks continuous simulation asserts invariants at every step with max error < 1e-11 g', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();
      let seq = 1;

      // Add all four ingredients
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 }, // 100ml
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 200 }, // 20g
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },  // 10g
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 200 },   // 18g
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'setMode', mode: 'auto' },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'setAutoLevel', level: 'medium' },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      let maxObservedOilError = 0;
      for (let tick = 0; tick < 3600; tick++) {
        engine.advance(1 / 60);
        const state = engine.getState();
        const oilError = Math.abs(state.mass.Ol + state.mass.Od - state.mass.Ot);
        if (oilError > maxObservedOilError) {
          maxObservedOilError = oilError;
        }
        assertMassInvariants(state, { stage: `tick_${tick}` });
      }

      expect(maxObservedOilError).toBeLessThan(1e-11);
    });

    it('23. Independence of host frame rate: 30 vs 60 vs 120 FPS produces compatible scalar states', () => {
      function runWithFps(fps: number): { Ol: number; Od: number } {
        const engine = new HeadlessSimulationEngine({ seed: 1729 });
        const cid = engine.getClientId();
        let seq = 1;

        engine.dispatch({
          clientId: cid,
          seq: seq++,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
        });
        engine.dispatch({
          clientId: cid,
          seq: seq++,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: 'oil', deciTicks: 200 },
        });
        engine.dispatch({
          clientId: cid,
          seq: seq++,
          expectedGeneration: 0,
          payload: { type: 'setMode', mode: 'auto' },
        });
        engine.dispatch({
          clientId: cid,
          seq: seq++,
          expectedGeneration: 0,
          payload: { type: 'setAutoLevel', level: 'fast' },
        });
        engine.dispatch({
          clientId: cid,
          seq: seq++,
          expectedGeneration: 0,
          payload: { type: 'resume' },
        });

        const dt = 1 / fps;
        const totalTime = 2.0; // 2 seconds = 120 ticks
        const totalFrames = Math.round(totalTime * fps);

        for (let f = 0; f < totalFrames; f++) {
          engine.advance(dt);
        }

        const state = engine.getState();
        return { Ol: state.mass.Ol, Od: state.mass.Od };
      }

      const res30 = runWithFps(30);
      const res60 = runWithFps(60);
      const res120 = runWithFps(120);

      expect(Math.abs(res30.Od - res60.Od)).toBeLessThan(1e-6);
      expect(Math.abs(res60.Od - res120.Od)).toBeLessThan(1e-6);
      expect(Math.abs(res30.Ol - res60.Ol)).toBeLessThan(1e-6);
    });
  });
});
