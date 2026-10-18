import { describe, expect, it } from 'vitest';
import {
  BEAKER_BASE_Y,
  BEAKER_CAPACITY_ML,
  BEAKER_FILL_HEIGHT,
  BEAKER_FILL_TOP,
  BEAKER_INNER_RADIUS,
  BEAKER_OUTER_RADIUS,
  BEAKER_VOLUME_SCALE,
  clampSpoonXZ,
  computeBeakerRegions,
  computeBeakerRegionsFromQuantities,
  computeMechanicalContact,
  computeParticleBounds,
  computeTipY,
  heightToVolume,
  PARTICLE_MARGIN,
  PARTICLE_RADIUS,
  type PhaseMasses,
  SPOON_ACTIVE_LENGTH,
  SPOON_ENVELOPE_RADIUS,
  SPOON_MAX_RADIUS,
  SPOON_MAX_TIP_Y,
  SPOON_MIN_TIP_Y,
  SPOON_WALL_MARGIN,
  volumeToHeight,
} from '../constants/beaker';

describe('V1-05: Constants and volume <-> height mapping', () => {
  it('has consistent capacity, dimensions, and scaling factors', () => {
    expect(BEAKER_CAPACITY_ML).toBe(500);
    expect(BEAKER_INNER_RADIUS).toBe(0.87);
    expect(BEAKER_OUTER_RADIUS).toBe(0.91);
    expect(BEAKER_BASE_Y).toBe(0.12);
    expect(BEAKER_FILL_HEIGHT).toBe(2.1);
    expect(BEAKER_FILL_TOP).toBeCloseTo(0.12 + 2.1, 8);
    expect(BEAKER_VOLUME_SCALE).toBe(0.0042);
    expect(SPOON_MAX_RADIUS).toBeCloseTo(BEAKER_INNER_RADIUS - SPOON_ENVELOPE_RADIUS - SPOON_WALL_MARGIN, 8);
    expect(SPOON_MIN_TIP_Y).toBe(0.14);
    expect(SPOON_MAX_TIP_Y).toBe(2.00);
    expect(SPOON_ACTIVE_LENGTH).toBe(0.20);
    expect(PARTICLE_MARGIN).toBe(0.01);
  });

  it('maps 0 ml and 500 ml continuously and invertibly', () => {
    expect(volumeToHeight(0)).toBe(0);
    expect(volumeToHeight(-10)).toBe(0);
    expect(volumeToHeight(500)).toBeCloseTo(2.1, 8);
    expect(volumeToHeight(250)).toBeCloseTo(1.05, 8);
    expect(heightToVolume(0)).toBe(0);
    expect(heightToVolume(2.1)).toBeCloseTo(500, 8);
    expect(heightToVolume(volumeToHeight(350))).toBeCloseTo(350, 8);
  });
});

describe('V1-05: SPEC §4.1 Nine Numerical Fixtures', () => {
  it('Fixture E: empty', () => {
    const phases: PhaseMasses = {
      Wml: 0, Oml: 0, Gt: 0, Gu: 0, Gd: 0, fGu: 0,
      St: 0, Sb: 0, Ss: 0, Ot: 0, Ol: 0, Od: 0,
    };
    const r = computeBeakerRegions(phases);
    expect(r.category).toBe('empty');
    expect(r.totalReserveMl).toBe(0);
    expect(r.bed.volumeMl).toBe(0);
    expect(r.aqueous.volumeMl).toBe(0);
    expect(r.oil.volumeMl).toBe(0);

    expect(r.bed.bottom).toBeCloseTo(0.120, 5);
    expect(r.bed.top).toBeCloseTo(0.120, 5);
    expect(r.aqueous.top).toBeCloseTo(0.120, 5);
    expect(r.oil.top).toBeCloseTo(0.120, 5);

    const tipY = computeTipY(r.bed.top);
    expect(tipY).toBeCloseTo(0.14, 5);
    expect(computeMechanicalContact(r, tipY)).toBe(0);
  });

  it('Fixture D: dry G10g, S10g', () => {
    const phases: PhaseMasses = {
      Wml: 0, Oml: 0, Gt: 10, Gu: 10, Gd: 0, fGu: 0,
      St: 10, Sb: 10, Ss: 0, Ot: 0, Ol: 0, Od: 0,
    };
    const r = computeBeakerRegions(phases);
    expect(r.category).toBe('dry');
    expect(r.bed.volumeMl).toBeCloseTo(12.5, 4);
    expect(r.aqueous.volumeMl).toBe(0);
    expect(r.oil.volumeMl).toBe(0);
    expect(r.totalReserveMl).toBeCloseTo(12.5, 4);

    expect(r.bed.bottom).toBeCloseTo(0.120, 4);
    expect(r.bed.top).toBeCloseTo(0.1725, 4);
    expect(r.aqueous.top).toBeCloseTo(0.1725, 4);
    expect(r.oil.top).toBeCloseTo(0.1725, 4);

    const tipY = computeTipY(r.bed.top);
    expect(tipY).toBeCloseTo(0.1925, 4);
    expect(computeMechanicalContact(r, tipY)).toBe(0);
  });

  it('Fixture O: oil 100ml, S10g, stirred fixture (no water)', () => {
    // Ot=90g (=100ml), Ol=90, Od=0, Sb=4g, Ss=6g
    const phases: PhaseMasses = {
      Wml: 0, Oml: 100, Gt: 0, Gu: 0, Gd: 0, fGu: 0,
      St: 10, Sb: 4, Ss: 6, Ot: 90, Ol: 90, Od: 0,
    };
    const r = computeBeakerRegions(phases);
    expect(r.category).toBe('oil-only');
    expect(r.bed.volumeMl).toBeCloseTo(2.4, 4);
    expect(r.aqueous.volumeMl).toBe(0);
    expect(r.oil.volumeMl).toBeCloseTo(103.6, 4);
    expect(r.totalReserveMl).toBeCloseTo(106.0, 4);

    expect(r.bed.bottom).toBeCloseTo(0.120, 5);
    expect(r.bed.top).toBeCloseTo(0.13008, 5);
    expect(r.aqueous.top).toBeCloseTo(0.13008, 5);
    expect(r.oil.top).toBeCloseTo(0.56520, 5);

    const tipY = computeTipY(r.bed.top);
    expect(tipY).toBeCloseTo(0.15008, 5);
    expect(computeMechanicalContact(r, tipY)).toBe(1);
  });

  it('Fixture G0: W100ml, G10g un-dissolved', () => {
    const phases: PhaseMasses = {
      Wml: 100, Oml: 0, Gt: 10, Gu: 10, Gd: 0, fGu: 0,
      St: 0, Sb: 0, Ss: 0, Ot: 0, Ol: 0, Od: 0,
    };
    const r = computeBeakerRegions(phases);
    expect(r.category).toBe('water-only');
    expect(r.bed.volumeMl).toBeCloseTo(6.5, 4);
    expect(r.aqueous.volumeMl).toBeCloseTo(100, 4);
    expect(r.oil.volumeMl).toBe(0);

    expect(r.bed.bottom).toBeCloseTo(0.120, 5);
    expect(r.bed.top).toBeCloseTo(0.14730, 5);
    expect(r.aqueous.top).toBeCloseTo(0.56730, 5);
    expect(r.oil.top).toBeCloseTo(0.56730, 5);

    const tipY = computeTipY(r.bed.top);
    expect(tipY).toBeCloseTo(0.16730, 5);
    expect(computeMechanicalContact(r, tipY)).toBe(1);
  });

  it('Fixture G1: W100ml, G10g with 5g dissolved', () => {
    const phases: PhaseMasses = {
      Wml: 100, Oml: 0, Gt: 10, Gu: 5, Gd: 5, fGu: 0,
      St: 0, Sb: 0, Ss: 0, Ot: 0, Ol: 0, Od: 0,
    };
    const r = computeBeakerRegions(phases);
    expect(r.category).toBe('water-only');
    expect(r.bed.volumeMl).toBeCloseTo(3.25, 4);
    expect(r.aqueous.volumeMl).toBeCloseTo(103.25, 4);
    expect(r.oil.volumeMl).toBe(0);

    expect(r.bed.bottom).toBeCloseTo(0.120, 5);
    expect(r.bed.top).toBeCloseTo(0.13365, 5);
    expect(r.aqueous.top).toBeCloseTo(0.56730, 5);
    expect(r.oil.top).toBeCloseTo(0.56730, 5);

    // Total top is identical to G0 because total mass is unchanged
    expect(r.liquidTop).toBeCloseTo(0.56730, 5);
  });

  it('Fixture L0: W100ml, O20ml at rest', () => {
    // Ot=18g (=20ml), Ol=18, Od=0
    const phases: PhaseMasses = {
      Wml: 100, Oml: 20, Gt: 0, Gu: 0, Gd: 0, fGu: 0,
      St: 0, Sb: 0, Ss: 0, Ot: 18, Ol: 18, Od: 0,
    };
    const r = computeBeakerRegions(phases);
    expect(r.category).toBe('mixed');
    expect(r.bed.volumeMl).toBe(0);
    expect(r.aqueous.volumeMl).toBeCloseTo(100, 4);
    expect(r.oil.volumeMl).toBeCloseTo(20, 4);

    expect(r.bed.bottom).toBeCloseTo(0.120, 4);
    expect(r.bed.top).toBeCloseTo(0.120, 4);
    expect(r.aqueous.top).toBeCloseTo(0.540, 4);
    expect(r.oil.top).toBeCloseTo(0.624, 4);
    expect(r.liquidTop).toBeCloseTo(0.624, 4);
  });

  it('Fixture L1: W100ml, O20ml with 9g (10ml) dispersed', () => {
    const phases: PhaseMasses = {
      Wml: 100, Oml: 20, Gt: 0, Gu: 0, Gd: 0, fGu: 0,
      St: 0, Sb: 0, Ss: 0, Ot: 18, Ol: 9, Od: 9,
    };
    const r = computeBeakerRegions(phases);
    expect(r.category).toBe('mixed');
    expect(r.bed.volumeMl).toBe(0);
    expect(r.aqueous.volumeMl).toBeCloseTo(110, 4);
    expect(r.oil.volumeMl).toBeCloseTo(10, 4);

    expect(r.bed.bottom).toBeCloseTo(0.120, 4);
    expect(r.bed.top).toBeCloseTo(0.120, 4);
    expect(r.aqueous.top).toBeCloseTo(0.582, 4);
    expect(r.oil.top).toBeCloseTo(0.624, 4);
    expect(r.liquidTop).toBeCloseTo(0.624, 4);
  });

  it('Fixture X: W300ml, O70ml, G100g, S100g complex mixture', () => {
    // Gd=50, Gu=50, fGu=0.2 (GuSusp=10, GuBed=40), Sb=80, Ss=20, Ol=45g (50ml), Od=18g (20ml)
    const phases: PhaseMasses = {
      Wml: 300, Oml: 70, Gt: 100, Gu: 50, Gd: 50, fGu: 0.2,
      St: 100, Sb: 80, Ss: 20, Ot: 63, Ol: 45, Od: 18,
    };
    const r = computeBeakerRegions(phases);
    expect(r.category).toBe('mixed');
    expect(r.bed.volumeMl).toBeCloseTo(74, 4);
    expect(r.aqueous.volumeMl).toBeCloseTo(371, 4);
    expect(r.oil.volumeMl).toBeCloseTo(50, 4);
    expect(r.totalReserveMl).toBeCloseTo(495, 4);

    expect(r.bed.bottom).toBeCloseTo(0.120, 4);
    expect(r.bed.top).toBeCloseTo(0.4308, 4);
    expect(r.aqueous.top).toBeCloseTo(1.9890, 4);
    expect(r.oil.top).toBeCloseTo(2.1990, 4);

    const tipY = computeTipY(r.bed.top);
    expect(tipY).toBeCloseTo(0.4508, 4);
    expect(computeMechanicalContact(r, tipY)).toBe(1);
  });

  it('Fixture T: W0.1ml thin liquid layer', () => {
    const phases: PhaseMasses = {
      Wml: 0.1, Oml: 0, Gt: 0, Gu: 0, Gd: 0, fGu: 0,
      St: 0, Sb: 0, Ss: 0, Ot: 0, Ol: 0, Od: 0,
    };
    const r = computeBeakerRegions(phases);
    expect(r.category).toBe('water-only');
    expect(r.bed.volumeMl).toBe(0);
    expect(r.aqueous.volumeMl).toBeCloseTo(0.1, 4);
    expect(r.oil.volumeMl).toBe(0);

    expect(r.bed.bottom).toBeCloseTo(0.120, 5);
    expect(r.bed.top).toBeCloseTo(0.120, 5);
    expect(r.aqueous.top).toBeCloseTo(0.12042, 5);
    expect(r.liquidTop).toBeCloseTo(0.12042, 5);

    const tipY = computeTipY(r.bed.top);
    expect(tipY).toBeCloseTo(0.14, 4); // Clamped to min 0.14
    // liquidTop 0.12042 is below tipY 0.14 -> contact = 0!
    expect(computeMechanicalContact(r, tipY)).toBe(0);
  });
});

describe('V1-05: Spoon contact and radial limits', () => {
  it('Water 7 ml, no bed: partial contact ≈ 0.047 (SC-H02)', () => {
    const phases: PhaseMasses = {
      Wml: 7, Oml: 0, Gt: 0, Gu: 0, Gd: 0, fGu: 0,
      St: 0, Sb: 0, Ss: 0, Ot: 0, Ol: 0, Od: 0,
    };
    const r = computeBeakerRegions(phases);
    expect(r.liquidTop).toBeCloseTo(0.12 + 0.0042 * 7, 5); // 0.1494
    const tipY = computeTipY(r.bed.top); // 0.14
    const contact = computeMechanicalContact(r, tipY);
    // overlap = 0.1494 - 0.14 = 0.0094; contact = 0.0094 / 0.20 = 0.047
    expect(contact).toBeCloseTo(0.047, 3);
  });

  it('clamps spoon horizontal center within radius <= 0.74', () => {
    expect(clampSpoonXZ(0, 0)).toEqual({ x: 0, z: 0, radius: 0 });
    expect(clampSpoonXZ(0.5, 0)).toEqual({ x: 0.5, z: 0, radius: 0.5 });
    expect(clampSpoonXZ(0.74, 0)).toEqual({ x: 0.74, z: 0, radius: 0.74 });

    const outsideX = clampSpoonXZ(1.0, 0);
    expect(outsideX.radius).toBeCloseTo(0.74, 8);
    expect(outsideX.x).toBeCloseTo(0.74, 8);
    expect(outsideX.z).toBe(0);

    const diagonal = clampSpoonXZ(0.6, 0.6);
    expect(diagonal.radius).toBeCloseTo(0.74, 8);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(0.74, 8);
  });

  it('clamps tipY adapting to bed top within [0.14, 2.0]', () => {
    expect(computeTipY(0.10)).toBe(0.14); // 0.10 + 0.02 = 0.12 < 0.14 -> clamped to 0.14
    expect(computeTipY(0.12)).toBe(0.14); // 0.12 + 0.02 = 0.14
    expect(computeTipY(0.50)).toBeCloseTo(0.52, 8);
    expect(computeTipY(2.10)).toBe(2.00); // 2.10 + 0.02 = 2.12 > 2.00 -> clamped to 2.00
  });
});

describe('V1-05: Particle representative spatial bounds', () => {
  it('computes correct bounds in normal region', () => {
    const b = computeParticleBounds(0.12, 0.62, PARTICLE_RADIUS.sand);
    expect(b.active).toBe(true);
    expect(b.horizontalRadius).toBeCloseTo(0.87 - 0.023 - 0.01, 8);
    expect(b.yBottom).toBeCloseTo(0.12 + 0.023, 8);
    expect(b.yTop).toBeCloseTo(0.62 - 0.023, 8);
    expect(b.effectiveParticleRadius).toBe(PARTICLE_RADIUS.sand);
  });

  it('scales particle radius down and sets midpoint in thin region', () => {
    const height = 0.02; // thinner than diameter 2 * 0.028 = 0.056
    const b = computeParticleBounds(0.12, 0.12 + height, PARTICLE_RADIUS.sugar);
    expect(b.active).toBe(true);
    expect(b.effectiveParticleRadius).toBeCloseTo(0.01, 8);
    expect(b.yBottom).toBeCloseTo(0.13, 8);
    expect(b.yTop).toBeCloseTo(0.13, 8);
    expect(b.midpointY).toBeCloseTo(0.13, 8);
  });

  it('deactivates particles when region height is 0 without NaN or inverted bounds', () => {
    const b = computeParticleBounds(0.12, 0.12, PARTICLE_RADIUS.sugar);
    expect(b.active).toBe(false);
    expect(b.effectiveParticleRadius).toBe(0);
    expect(b.yBottom).toBe(0.12);
    expect(b.yTop).toBe(0.12);
    expect(Number.isNaN(b.yBottom)).toBe(false);
  });
});

describe('V1-05: Scene integration adapter', () => {
  it('computes beaker regions from Quantities', () => {
    const r = computeBeakerRegionsFromQuantities({ water: 100, sugar: 10, sand: 20, oil: 30 });
    expect(r.category).toBe('mixed');
    expect(r.bed.volumeMl).toBeCloseTo(10 * 0.65 + 20 * 0.6, 4); // 18.5 ml
    expect(r.aqueous.volumeMl).toBeCloseTo(100, 4);
    expect(r.oil.volumeMl).toBeCloseTo(30, 4);
    expect(r.totalReserveMl).toBeCloseTo(148.5, 4);
    expect(r.bed.bottom).toBe(0.12);
    expect(r.aqueous.bottom).toBe(r.bed.top);
    expect(r.oil.bottom).toBe(r.aqueous.top);
  });
});
