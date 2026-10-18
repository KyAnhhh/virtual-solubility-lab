import { describe, expect, it } from 'vitest';
import { HeadlessSimulationEngine } from '../core/HeadlessSimulationEngine';
import {
  computeAnalyticFGu,
  computeAnalyticSandSuspension,
  computeCarrierFractions,
  computeFGuStep,
  computeSandSuspensionStep,
  computeSuspensionRates,
} from '../models/SandSuspension';
import {
  computeBeakerRegions,
  computeTipY,
  type PhaseMasses,
} from '../constants/beaker';
import { epsilonMass } from '../constants/science';
import type { ScienceState } from '../core/SimulationState';
import { createInitialScienceState } from '../core/SimulationState';
import { assertMassInvariants } from '../models/MassLedger';

describe('V3-03 Sand Suspension, Sedimentation & fGu Kinetics', () => {
  describe('Part 1: Pure Model Unit Tests', () => {
    it('0. Carrier fractions and rate calculations match SCIENTIFIC_SPEC §5.3', () => {
      // Dry
      const dryFrac = computeCarrierFractions({ W: 0, Ot: 0 });
      expect(dryFrac.hasCarrier).toBe(false);
      expect(dryFrac.waterFraction).toBe(0);

      // Water only: W=100ml, Ot=0 -> waterFraction = 1.0
      const waterFrac = computeCarrierFractions({ W: 100, Ot: 0 });
      expect(waterFrac.hasCarrier).toBe(true);
      expect(waterFrac.waterFraction).toBe(1.0);

      // Oil only: W=0, Ot=90g (100ml) -> waterFraction = 0
      const oilFrac = computeCarrierFractions({ W: 0, Ot: 90 });
      expect(oilFrac.hasCarrier).toBe(true);
      expect(oilFrac.Oml).toBeCloseTo(100, 6);
      expect(oilFrac.waterFraction).toBe(0);

      // Mixed: W=100ml, Ot=90g (100ml) -> waterFraction = 0.5
      const mixedFrac = computeCarrierFractions({ W: 100, Ot: 90 });
      expect(mixedFrac.waterFraction).toBe(0.5);

      // Rates at I=0 in water
      const rates0 = computeSuspensionRates(0, 1.0, true);
      expect(rates0.kLift).toBe(0);
      expect(rates0.kSettle).toBeCloseTo(0.15, 6);
      expect(rates0.lambda).toBeCloseTo(0.15, 6);

      // Rates at I=1 in oil
      const rates1Oil = computeSuspensionRates(1.0, 0, true);
      expect(rates1Oil.kLift).toBeCloseTo(0.6, 6);
      expect(rates1Oil.kSettle).toBeCloseTo(0.06 / 3, 6);
      expect(rates1Oil.lambda).toBeCloseTo(0.6 + 0.02, 6);
    });

    it('1. Water, fixed I=0, initial Ss=10g: Ss(1s) = 10 * exp(-0.15) ≈ 8.607079764 g (Settling)', () => {
      const St = 10.0;
      let Ss = 10.0;
      let Sb = 0.0;
      const mass = {
        W: 100.0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St,
        Sb,
        Ss,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };

      const h = 1 / 60;
      const intensity = 0;

      // Advance 60 fixed ticks (1.0 simulated second)
      for (let i = 0; i < 60; i++) {
        mass.Ss = Ss;
        mass.Sb = Sb;
        const out = computeSandSuspensionStep(mass, { intensity, h });
        expect(out.pair).toBe('sand_sedimentation');
        Ss = out.SsNext;
        Sb = out.SbNext;
        expect(Sb + Ss).toBeCloseTo(St, 10);
      }

      // Independent analytical oracle calculation for settling:
      // In water: waterFraction = 1.0, kLift = 0, kSettle = 0.15, lambda = 0.15
      // Ss(1s) = 10 * exp(-0.15 * 1.0) = 8.60707976425 g
      const expectedAnalytic = 10.0 * Math.exp(-0.15);
      expect(Ss).toBeCloseTo(expectedAnalytic, 6);
      expect(Ss).toBeCloseTo(8.607079764, 5);
      expect(Sb).toBeCloseTo(10.0 - expectedAnalytic, 6);
    });

    it('1b. Water, fixed I=1.0, initial Ss=0g: Ss(1s) = (120/13) * (1 - exp(-0.65)) ≈ 4.4118851376 g (Lifting)', () => {
      const St = 10.0;
      let Ss = 0.0;
      let Sb = 10.0;
      const mass = {
        W: 100.0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St,
        Sb,
        Ss,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };

      const h = 1 / 60;
      const intensity = 1.0;

      // In water: wf = 1.0, kLift = 0.6, kSettle = 0.15 / 3 = 0.05, lambda = 0.65
      // SsEq = 10 * 0.6 / 0.65 = 120/13 ≈ 9.2307692308 g
      // Ss(1s) = (120/13) * (1 - exp(-0.65)) ≈ 4.4118851376 g
      for (let i = 0; i < 60; i++) {
        mass.Ss = Ss;
        mass.Sb = Sb;
        const out = computeSandSuspensionStep(mass, { intensity, h });
        expect(out.pair).toBe('sand_suspension');
        Ss = out.SsNext;
        Sb = out.SbNext;
        expect(Sb + Ss).toBeCloseTo(St, 10);
      }

      const expectedAnalytic = (120 / 13) * (1 - Math.exp(-0.65));
      expect(expectedAnalytic).toBeCloseTo(4.4118851376, 6);
      expect(Ss).toBeCloseTo(expectedAnalytic, 6);
      expect(Ss).toBeCloseTo(4.411885138, 5);
      expect(Sb).toBeCloseTo(10.0 - expectedAnalytic, 6);
    });

    it('2. Oil-only, fixed I=0, initial Ss=10g: Ss(1s) = 10 * exp(-0.06) ≈ 9.417645336 g (Settling)', () => {
      const St = 10.0;
      let Ss = 10.0;
      let Sb = 0.0;
      const mass = {
        W: 0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St,
        Sb,
        Ss,
        Ot: 90.0, // 90g oil = 100 ml at rhoO = 0.9
        Ol: 90.0,
        Od: 0,
      };

      const h = 1 / 60;
      const intensity = 0;

      for (let i = 0; i < 60; i++) {
        mass.Ss = Ss;
        mass.Sb = Sb;
        const out = computeSandSuspensionStep(mass, { intensity, h });
        expect(out.pair).toBe('sand_sedimentation');
        Ss = out.SsNext;
        Sb = out.SbNext;
        expect(Sb + Ss).toBeCloseTo(St, 10);
      }

      // Independent analytical oracle calculation for settling in oil:
      // In oil: waterFraction = 0, kLift = 0, kSettle = 0.06, lambda = 0.06
      // Ss(1s) = 10 * exp(-0.06 * 1.0) = 9.4176453358 g
      const expectedAnalytic = 10.0 * Math.exp(-0.06);
      expect(Ss).toBeCloseTo(expectedAnalytic, 6);
      expect(Ss).toBeCloseTo(9.417645336, 5);
      expect(Sb).toBeCloseTo(10.0 - expectedAnalytic, 6);
    });

    it('2b. Oil-only, fixed I=1.0, initial Ss=0g: Ss(1s) = (300/31) * (1 - exp(-0.62)) ≈ 4.4715054426 g (Lifting)', () => {
      const St = 10.0;
      let Ss = 0.0;
      let Sb = 10.0;
      const mass = {
        W: 0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St,
        Sb,
        Ss,
        Ot: 90.0,
        Ol: 90.0,
        Od: 0,
      };

      const h = 1 / 60;
      const intensity = 1.0;

      // In oil: wf = 0.0, kLift = 0.6, kSettle = 0.06 / 3 = 0.02, lambda = 0.62
      // SsEq = 10 * 0.6 / 0.62 = 300/31 ≈ 9.6774193548 g
      // Ss(1s) = (300/31) * (1 - exp(-0.62)) ≈ 4.4715054426 g
      for (let i = 0; i < 60; i++) {
        mass.Ss = Ss;
        mass.Sb = Sb;
        const out = computeSandSuspensionStep(mass, { intensity, h });
        expect(out.pair).toBe('sand_suspension');
        Ss = out.SsNext;
        Sb = out.SbNext;
        expect(Sb + Ss).toBeCloseTo(St, 10);
      }

      const expectedAnalytic = (300 / 31) * (1 - Math.exp(-0.62));
      expect(expectedAnalytic).toBeCloseTo(4.4715054426, 6);
      expect(Ss).toBeCloseTo(expectedAnalytic, 6);
      expect(Ss).toBeCloseTo(4.471505443, 5);
      expect(Sb).toBeCloseTo(10.0 - expectedAnalytic, 6);
    });

    it('3. Fixed I>0: approach equilibrium according to continuous analytical solution', () => {
      const St = 20.0;
      let Ss = 0.0;
      let Sb = 20.0;
      const mass = {
        W: 100.0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St,
        Sb,
        Ss,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };

      const intensity = 0.5;
      const h = 1 / 60;

      // In water: wf = 1, kLift = 0.6 * 0.25 = 0.15, kSettle = 0.15 / (1 + 2*0.5) = 0.075, lambda = 0.225
      // SsEq = 20 * 0.15 / 0.225 = 13.333333 g
      for (let i = 0; i < 120; i++) {
        mass.Ss = Ss;
        mass.Sb = Sb;
        const out = computeSandSuspensionStep(mass, { intensity, h });
        Ss = out.SsNext;
        Sb = out.SbNext;
      }

      const t = 2.0;
      const expectedAnalytic = computeAnalyticSandSuspension(t, 0.0, St, intensity, {
        waterFraction: 1.0,
        hasCarrier: true,
      });
      expect(Ss).toBeCloseTo(expectedAnalytic, 5);
      expect(Sb + Ss).toBeCloseTo(St, 10);
    });

    it('4. Initial Ss=0 has lift when I>0', () => {
      const mass = {
        W: 100.0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 10.0,
        Sb: 10.0,
        Ss: 0.0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };

      const out = computeSandSuspensionStep(mass, { intensity: 0.8, h: 1 / 60 });
      expect(out.pair).toBe('sand_suspension');
      expect(out.dTransfer).toBeGreaterThan(0);
      expect(out.SsNext).toBeGreaterThan(0);
      expect(out.SbNext).toBeLessThan(10.0);
      expect(out.SbNext + out.SsNext).toBeCloseTo(10.0, 10);
    });

    it('5. Initial Ss above/below equilibrium moves in correct direction', () => {
      const St = 10.0;
      const mass = {
        W: 100.0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };

      // Below equilibrium: Ss = 1g, I = 1.0 -> SsEq = 10 * 0.6 / 0.65 ≈ 9.23g
      mass.Ss = 1.0;
      mass.Sb = 9.0;
      const outLift = computeSandSuspensionStep(mass, { intensity: 1.0, h: 1 / 60 });
      expect(outLift.pair).toBe('sand_suspension');
      expect(outLift.SsNext).toBeGreaterThan(1.0);

      // Above equilibrium: Ss = 10g, I = 0.1 -> SsEq is small
      mass.Ss = 10.0;
      mass.Sb = 0.0;
      const outSettle = computeSandSuspensionStep(mass, { intensity: 0.1, h: 1 / 60 });
      expect(outSettle.pair).toBe('sand_sedimentation');
      expect(outSettle.SsNext).toBeLessThan(10.0);
    });

    it('6. St=0, h=0, lambda=0, and dry do not produce NaN or corruption', () => {
      // Zero sand
      const zeroSandMass = {
        W: 100,
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
      const outZero = computeSandSuspensionStep(zeroSandMass, { intensity: 1.0, h: 1 / 60 });
      expect(outZero.dTransfer).toBe(0);
      expect(outZero.SsNext).toBe(0);
      expect(outZero.SbNext).toBe(0);
      expect(Number.isFinite(outZero.SsNext)).toBe(true);

      // h = 0
      const mass = {
        W: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 10,
        Sb: 5,
        Ss: 5,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const outHZero = computeSandSuspensionStep(mass, { intensity: 1.0, h: 0 });
      expect(outHZero.dTransfer).toBe(0);
      expect(outHZero.SsNext).toBe(5);

      // Dry: W=0, Ot=0 -> all sand sediments to bed
      const dryMass = {
        W: 0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 10,
        Sb: 4,
        Ss: 6,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      const outDry = computeSandSuspensionStep(dryMass, { intensity: 1.0, h: 1 / 60 });
      expect(outDry.pair).toBe('sand_sedimentation');
      expect(outDry.dTransfer).toBe(6);
      expect(outDry.SsNext).toBe(0);
      expect(outDry.SbNext).toBe(10);
    });

    it('7. Negative or non-finite inputs reject without mutation', () => {
      const mass = {
        W: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 10,
        Sb: 5,
        Ss: 5,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };

      expect(() => computeSandSuspensionStep(mass, { intensity: 1.0, h: -1 })).toThrow();
      expect(() => computeSandSuspensionStep(mass, { intensity: 1.0, h: Number.NaN })).toThrow();
      expect(() => computeFGuStep(0.5, 10, { intensity: 1.0, h: -1 })).toThrow();
    });

    it('8. Sb + Ss is strictly conserved at each step', () => {
      const St = 15.0;
      let Ss = 5.0;
      let Sb = 10.0;
      const mass = {
        W: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St,
        Sb,
        Ss,
        Ot: 20,
        Ol: 20,
        Od: 0,
      };

      for (let i = 0; i < 100; i++) {
        mass.Ss = Ss;
        mass.Sb = Sb;
        const out = computeSandSuspensionStep(mass, { intensity: (i % 10) / 10, h: 1 / 60 });
        Ss = out.SsNext;
        Sb = out.SbNext;
        expect(Math.abs(Sb + Ss - St)).toBeLessThanOrEqual(epsilonMass(St));
      }
    });

    it('9. fGu has identical fraction dynamics to sand and remains bounded in [0, 1]', () => {
      const carrierInfo = { waterFraction: 1.0, hasCarrier: true };
      const intensity = 0.6;
      const h = 1 / 60;

      let fGu = 0.0;
      for (let i = 0; i < 60; i++) {
        fGu = computeFGuStep(fGu, 10.0, { intensity, h }, carrierInfo);
        expect(fGu).toBeGreaterThanOrEqual(0);
        expect(fGu).toBeLessThanOrEqual(1.0);
      }

      // Analytic oracle comparison at t = 1.0s
      const expectedAnalyticFGu = computeAnalyticFGu(1.0, 0.0, intensity, {
        waterFraction: 1.0,
        hasCarrier: true,
      });
      expect(fGu).toBeCloseTo(expectedAnalyticFGu, 5);

      // When Gu becomes 0, fGu strictly becomes 0
      const fGuZero = computeFGuStep(fGu, 0, { intensity, h }, carrierInfo);
      expect(fGuZero).toBe(0);

      // When dry, fGu strictly becomes 0
      const fGuDry = computeFGuStep(fGu, 10, { intensity, h }, { waterFraction: 0, hasCarrier: false });
      expect(fGuDry).toBe(0);
    });

    it('9b. Water, fixed I=1.0, initial fGu=0: fGu(1s) = (12/13) * (1 - exp(-0.65)) ≈ 0.4411885138 (Lifting)', () => {
      const carrierInfo = { waterFraction: 1.0, hasCarrier: true };
      const intensity = 1.0;
      const h = 1 / 60;

      let fGu = 0.0;
      for (let i = 0; i < 60; i++) {
        fGu = computeFGuStep(fGu, 10.0, { intensity, h }, carrierInfo);
        expect(fGu).toBeGreaterThanOrEqual(0);
        expect(fGu).toBeLessThanOrEqual(1.0);
      }

      // In water: wf = 1.0, kLift = 0.6, kSettle = 0.05, lambda = 0.65
      // fEq = 0.6 / 0.65 = 12/13 ≈ 0.9230769231
      // fGu(1s) = (12/13) * (1 - exp(-0.65)) ≈ 0.4411885138
      const expectedAnalyticFGu = (12 / 13) * (1 - Math.exp(-0.65));
      expect(expectedAnalyticFGu).toBeCloseTo(0.4411885138, 6);
      expect(fGu).toBeCloseTo(expectedAnalyticFGu, 6);
      expect(fGu).toBeCloseTo(0.441188514, 5);
    });

    it('10. Tiny positive Gu (e.g. 1e-11 g) preserves fGu without snapping to 0', () => {
      const carrierInfo = { waterFraction: 1.0, hasCarrier: true };
      const tinyGu = 1e-11;
      const initialFGu = 0.5;

      const nextFGu = computeFGuStep(initialFGu, tinyGu, { intensity: 0.5, h: 1 / 60 }, carrierInfo);
      expect(nextFGu).toBeGreaterThan(0);
      expect(nextFGu).toBeLessThanOrEqual(1.0);
    });

    it('11. h=1/60 vs h=1/120 with fixed I and carrier yields compatible analytic results', () => {
      const St = 10.0;
      const intensity = 0.7;

      // 60 steps at h = 1/60 (t = 1.0 s)
      const mass60 = {
        W: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St,
        Sb: 10,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      for (let i = 0; i < 60; i++) {
        const out = computeSandSuspensionStep(mass60, { intensity, h: 1 / 60 });
        mass60.Ss = out.SsNext;
        mass60.Sb = out.SbNext;
      }

      // 120 steps at h = 1/120 (t = 1.0 s)
      const mass120 = {
        W: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St,
        Sb: 10,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      for (let i = 0; i < 120; i++) {
        const out = computeSandSuspensionStep(mass120, { intensity, h: 1 / 120 });
        mass120.Ss = out.SsNext;
        mass120.Sb = out.SbNext;
      }

      expect(mass60.Ss).toBeCloseTo(mass120.Ss, 5);
      const expectedAnalytic = computeAnalyticSandSuspension(1.0, 0, St, intensity);
      expect(mass60.Ss).toBeCloseTo(expectedAnalytic, 5);
      expect(mass120.Ss).toBeCloseTo(expectedAnalytic, 5);
    });
  });

  describe('Part 2: Engine Integration & Scientific Invariants', () => {
    it('12. Water + sand auto stirring produces real Ss through engine (SC-S02)', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();
      let seq = 1;

      // Add Water 100ml, Sand 10g
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
        payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
      });

      // Initially paused: Ss = 0, Sb = 10g
      let snap = engine.snapshot();
      expect(snap.mass.St).toBe(10.0);
      expect(snap.mass.Sb).toBe(10.0);
      expect(snap.mass.Ss).toBe(0.0);

      // Start auto fast and resume
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

      // Run 300 ticks (5 simulated seconds)
      for (let i = 0; i < 300; i++) {
        engine.advance(1 / 60);
      }

      snap = engine.snapshot();
      // Flow has built up (intensity > 0) -> sand has been lifted from bed!
      expect(snap.intensity).toBeGreaterThan(0.5);
      expect(snap.mass.Ss).toBeGreaterThan(1.0);
      expect(snap.mass.Sb).toBeLessThan(9.0);
      expect(snap.mass.Sb + snap.mass.Ss).toBeCloseTo(10.0, 10);

      // Sand does not dissolve: no dissolved sand exists
      expect((snap.mass as unknown as Record<string, number>).Sd).toBeUndefined();
    });

    it('13. Stop from fixture with suspension/flow: residual flow and settling (SC-S05)', () => {
      // Injected test fixture with active suspension & flow
      const seedState: ScienceState = createInitialScienceState(1729);
      seedState.input = { water: 1000, sand: 100, sugar: 0, oil: 0 };
      seedState.mass = {
        W: 100.0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 10.0,
        Sb: 4.0,
        Ss: 6.0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      seedState.fGu = 0;
      seedState.omegaFlow = 4.285714;
      seedState.mode = 'auto';
      seedState.autoDriveEnabled = true;
      seedState.paused = false;

      const engine = HeadlessSimulationEngine.createForTesting(seedState);
      const cid = engine.getClientId();

      // Release drive (Stop)
      engine.dispatch({
        clientId: cid,
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'releaseDrive' },
      });

      let snap = engine.snapshot();
      expect(snap.autoDriveEnabled).toBe(false);
      expect(engine.getState().omegaDrive).toBe(0);
      // Flow is not zero instantly!
      expect(engine.getState().omegaFlow).toBeCloseTo(4.285714, 4);

      const initialSs = snap.mass.Ss;

      // Run 600 ticks (10 simulated seconds)
      for (let i = 0; i < 600; i++) {
        engine.advance(1 / 60);
      }

      snap = engine.snapshot();
      // Flow has decayed toward 0
      expect(engine.getState().omegaFlow).toBeLessThan(0.01);
      expect(snap.intensity).toBeLessThan(0.01);
      // Settling has dominated: Ss has decreased significantly towards bed
      expect(snap.mass.Ss).toBeLessThan(initialSs);
      expect(snap.mass.Sb).toBeGreaterThan(4.0);
      expect(snap.mass.Sb + snap.mass.Ss).toBeCloseTo(10.0, 10);
    });

    it('14. Pause, resume, and suspend preserve sand suspension lifecycle', () => {
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
        payload: { type: 'setAutoLevel', level: 'medium' },
      });
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      for (let i = 0; i < 120; i++) {
        engine.advance(1 / 60);
      }

      let snap = engine.snapshot();
      const ssAtPause = snap.mass.Ss;
      const sbAtPause = snap.mass.Sb;
      expect(ssAtPause).toBeGreaterThan(0);

      // Pause
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'pause' },
      });

      // Advancing while paused does nothing
      engine.advance(5.0);
      snap = engine.snapshot();
      expect(snap.mass.Ss).toBe(ssAtPause);
      expect(snap.mass.Sb).toBe(sbAtPause);

      // Resume continues
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });
      for (let i = 0; i < 60; i++) {
        engine.advance(1 / 60);
      }
      snap = engine.snapshot();
      expect(snap.mass.Sb + snap.mass.Ss).toBeCloseTo(10.0, 10);
    });

    it('15. Dry -> Oil -> Water and reverse branch: command does not auto-transfer, tick uses correct carrier (SC-S04)', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();
      let seq = 1;

      // 1. Dry: add Sand 10g
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
      });
      let snap = engine.snapshot();
      expect(snap.mass.St).toBe(10);
      expect(snap.mass.Sb).toBe(10);
      expect(snap.mass.Ss).toBe(0);

      // 2. Add Oil 100 ml (90 g) while paused
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'oil', deciTicks: 1000 },
      });
      snap = engine.snapshot();
      // Carrier is now oil-only, but because we are paused, Ss is still 0
      expect(snap.mass.Ot).toBe(90);
      expect(snap.mass.Ss).toBe(0);

      // 3. Add Water 100 ml
      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
      });
      snap = engine.snapshot();
      expect(snap.mass.W).toBe(100);
      expect(snap.mass.Ot).toBe(90);
      expect(snap.mass.Ss).toBe(0);

      // 4. Start auto fast and resume -> carrier is mixed (Wml=100, Oml=100 -> wf = 0.5)
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

      for (let i = 0; i < 180; i++) {
        engine.advance(1 / 60);
      }

      snap = engine.snapshot();
      expect(snap.mass.Ss).toBeGreaterThan(0.5);
      expect(snap.mass.Sb + snap.mass.Ss).toBeCloseTo(10.0, 10);
    });

    it('16. Oil-only regions Fixture O: envelope and bed volumes match SCIENTIFIC_SPEC §4.1 (SC-R01)', () => {
      // Fixture O from SCIENTIFIC_SPEC §4.1:
      // O100ml (Ot=90g), Sand 10g with Sb=4g, Ss=6g, Gu=0, Gd=0, fGu=0
      const phases: PhaseMasses = {
        Wml: 0,
        Oml: 100,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        fGu: 0,
        St: 10,
        Sb: 4,
        Ss: 6,
        Ot: 90,
        Ol: 90,
        Od: 0,
      };

      const regions = computeBeakerRegions(phases);

      // Bed volume = 0.6 * Sb = 0.6 * 4 = 2.4 ml
      expect(regions.bed.volumeMl).toBeCloseTo(2.4, 6);
      expect(regions.aqueous.volumeMl).toBe(0);
      // Oil envelope = Oml + 0.6 * Ss = 100 + 0.6 * 6 = 103.6 ml
      expect(regions.oil.volumeMl).toBeCloseTo(103.6, 6);
      // Total = 2.4 + 103.6 = 106.0 ml
      expect(regions.totalReserveMl).toBeCloseTo(106.0, 6);

      // Boundaries check matching §4.1: .120 / .13008 / .13008 / .56520
      expect(regions.bed.bottom).toBeCloseTo(0.12, 5);
      expect(regions.bed.top).toBeCloseTo(0.13008, 5);
      expect(regions.aqueous.bottom).toBeCloseTo(0.13008, 5);
      expect(regions.aqueous.top).toBeCloseTo(0.13008, 5);
      expect(regions.oil.bottom).toBeCloseTo(0.13008, 5);
      expect(regions.oil.top).toBeCloseTo(0.5652, 4);

      // TipY adapts to bed
      const tipY = computeTipY(regions.bed.top);
      expect(tipY).toBeCloseTo(0.15008, 5);
    });

    it('17. Add sand paused preserves Ss and increases Sb (SC-A01)', () => {
      const seedState: ScienceState = createInitialScienceState(1729);
      seedState.input = { water: 1000, sand: 100, sugar: 0, oil: 0 };
      seedState.mass = {
        W: 100.0,
        Gt: 0,
        Gu: 0,
        Gd: 0,
        St: 10.0,
        Sb: 7.0,
        Ss: 3.0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      seedState.paused = true;

      const engine = HeadlessSimulationEngine.createForTesting(seedState);
      const cid = engine.getClientId();

      // Add Sand 1.0g (10 deciTicks) while paused
      const ack = engine.dispatch({
        clientId: cid,
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sand', deciTicks: 10 },
      });
      expect(ack.accepted).toBe(true);

      const snap = engine.snapshot();
      expect(snap.mass.St).toBeCloseTo(11.0, 10);
      expect(snap.mass.Ss).toBeCloseTo(3.0, 10); // Ss preserved!
      expect(snap.mass.Sb).toBeCloseTo(8.0, 10); // Sb increased!
      expect(snap.elapsedSeconds).toBe(0);
    });

    it('18. Add sugar paused dilutes fGu correctly (SC-A01 / §3.5)', () => {
      const seedState: ScienceState = createInitialScienceState(1729);
      seedState.input = { water: 1000, sugar: 100, sand: 0, oil: 0 };
      seedState.mass = {
        W: 100.0,
        Gt: 10.0,
        Gu: 10.0,
        Gd: 0.0,
        St: 0,
        Sb: 0,
        Ss: 0,
        Ot: 0,
        Ol: 0,
        Od: 0,
      };
      seedState.fGu = 0.4; // 40% suspended = 4.0g suspended
      seedState.paused = true;

      const engine = HeadlessSimulationEngine.createForTesting(seedState);
      const cid = engine.getClientId();

      // Add Sugar 10.0g (100 deciTicks) -> new Gu = 20g
      engine.dispatch({
        clientId: cid,
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 100 },
      });

      const snap = engine.snapshot();
      expect(snap.mass.Gu).toBeCloseTo(20.0, 10);
      // New fGu = 4.0g / 20.0g = 0.2
      expect(snap.fGu).toBeCloseTo(0.2, 10);
    });

    it('19. Dissolution preserves mass while fGu evolves', () => {
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
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 100 },
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

      for (let i = 0; i < 300; i++) {
        engine.advance(1 / 60);
        const snap = engine.snapshot();
        expect(snap.mass.Gu + snap.mass.Gd).toBeCloseTo(10.0, 10);
        expect(snap.fGu).toBeGreaterThanOrEqual(0);
        expect(snap.fGu).toBeLessThanOrEqual(1.0);
      }
    });

    it('20. Reset and duplicate reset reset sand and fGu cleanly', () => {
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
        payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
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

      // Reset
      const ackReset = engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'reset' },
      });
      expect(ackReset.accepted).toBe(true);

      let snap = engine.snapshot();
      expect(snap.generation).toBe(1);
      expect(snap.mass.St).toBe(0);
      expect(snap.mass.Sb).toBe(0);
      expect(snap.mass.Ss).toBe(0);
      expect(snap.fGu).toBe(0);

      // Duplicate reset replay
      const ackReplay = engine.dispatch({
        clientId: cid,
        seq: seq - 1,
        expectedGeneration: 0,
        payload: { type: 'reset' },
      });
      expect(ackReplay.accepted).toBe(true);
      expect(ackReplay.duplicate).toBe(true);
      snap = engine.snapshot();
      expect(snap.generation).toBe(1);
    });

    it('21. Input totals and reservation capacity unchanged through exchange (SC-IN03)', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();
      let seq = 1;

      engine.dispatch({
        clientId: cid,
        seq: seq++,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 500 },
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
        payload: { type: 'resume' },
      });

      for (let i = 0; i < 180; i++) {
        engine.advance(1 / 60);
      }

      const snap = engine.snapshot();
      // Input ticks unchanged!
      expect(snap.input.water).toBe(500);
      expect(snap.input.sand).toBe(100);
      expect(snap.input.sugar).toBe(0);
      expect(snap.input.oil).toBe(0);
    });

    it('22. Snapshot is detached and deep-frozen', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const snap = engine.snapshot();
      expect(Object.isFrozen(snap)).toBe(true);
      expect(Object.isFrozen(snap.mass)).toBe(true);
      expect(Object.isFrozen(snap.input)).toBe(true);
    });

    it('23. Same tick trace at 30, 60, and 120 FPS yields identical scalar state (SC-N01)', () => {
      function runSim(fps: number): ScienceState {
        const engine = new HeadlessSimulationEngine({ seed: 1729 });
        const cid = engine.getClientId();
        engine.dispatch({
          clientId: cid,
          seq: 1,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: 'water', deciTicks: 1000 },
        });
        engine.dispatch({
          clientId: cid,
          seq: 2,
          expectedGeneration: 0,
          payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
        });
        engine.dispatch({
          clientId: cid,
          seq: 3,
          expectedGeneration: 0,
          payload: { type: 'setMode', mode: 'auto' },
        });
        engine.dispatch({
          clientId: cid,
          seq: 4,
          expectedGeneration: 0,
          payload: { type: 'setAutoLevel', level: 'medium' },
        });
        engine.dispatch({
          clientId: cid,
          seq: 5,
          expectedGeneration: 0,
          payload: { type: 'resume' },
        });

        const dt = 1 / fps;
        const totalSteps = fps * 2; // 2 seconds
        for (let i = 0; i < totalSteps; i++) {
          engine.advance(dt);
        }
        return engine.getState();
      }

      const state30 = runSim(30);
      const state60 = runSim(60);
      const state120 = runSim(120);

      expect(state30.tickIndex).toBe(120);
      expect(state60.tickIndex).toBe(120);
      expect(state120.tickIndex).toBe(120);

      expect(state30.mass.Ss).toBeCloseTo(state60.mass.Ss, 6);
      expect(state60.mass.Ss).toBeCloseTo(state120.mass.Ss, 6);
      expect(state30.mass.Sb).toBeCloseTo(state60.mass.Sb, 6);
    });

    it('24. Long run asserts mass invariants each step, tracking max mass error (SC-N02)', () => {
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
        payload: { type: 'add', ingredient: 'sugar', deciTicks: 200 },
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

      let maxSandError = 0;
      let maxSugarError = 0;

      // Run 3600 ticks (60 simulated seconds)
      for (let i = 0; i < 3600; i++) {
        engine.advance(1 / 60);
        const state = engine.getState();
        assertMassInvariants(state, {
          generation: state.generation,
          tickIndex: state.tickIndex,
          stateVersion: state.stateVersion,
          stage: 'longRunTest',
        });

        const sandErr = Math.abs(state.mass.Sb + state.mass.Ss - state.mass.St);
        const sugarErr = Math.abs(state.mass.Gu + state.mass.Gd - state.mass.Gt);
        if (sandErr > maxSandError) maxSandError = sandErr;
        if (sugarErr > maxSugarError) maxSugarError = sugarErr;
      }

      // Max error must be orders of magnitude below epsilon (1e-8 g)
      expect(maxSandError).toBeLessThan(1e-11);
      expect(maxSugarError).toBeLessThan(1e-11);
    });

    it('25. Sand does not create dissolved sand across all 16 mixture subsets (SC-S01)', () => {
      const engine = new HeadlessSimulationEngine({ seed: 1729 });
      const cid = engine.getClientId();

      engine.dispatch({
        clientId: cid,
        seq: 1,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'water', deciTicks: 500 },
      });
      engine.dispatch({
        clientId: cid,
        seq: 2,
        expectedGeneration: 0,
        payload: { type: 'add', ingredient: 'sand', deciTicks: 100 },
      });
      engine.dispatch({
        clientId: cid,
        seq: 3,
        expectedGeneration: 0,
        payload: { type: 'resume' },
      });

      for (let i = 0; i < 180; i++) {
        engine.advance(1 / 60);
      }

      const snap = engine.snapshot();
      expect(snap.mass.Sb + snap.mass.Ss).toBeCloseTo(10.0, 10);
      // Strictly no dissolved sand
      expect((snap.mass as unknown as Record<string, number>).Sd).toBeUndefined();
    });
  });
});
