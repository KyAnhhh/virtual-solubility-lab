import type { Quantities } from '../../types/experiment';
import { VISUAL_ML_PER_GRAM } from './ingredients';

/**
 * Canonical geometric constants for the 3D Beaker and Stirring Spoon.
 * Standard defined in SCIENTIFIC_SPEC §4–§6.
 */
export const BEAKER_CAPACITY_ML = 500;
export const BEAKER_INNER_RADIUS = 0.87; // scene units
export const BEAKER_OUTER_RADIUS = 0.91; // scene units (glass wall cylinder)
export const BEAKER_BASE_Y = 0.12;       // bottom inside surface of the beaker
export const BEAKER_FILL_HEIGHT = 2.1;   // height of 500 ml volume in scene units
export const BEAKER_FILL_TOP = 2.22;      // BEAKER_BASE_Y + BEAKER_FILL_HEIGHT
export const BEAKER_VOLUME_SCALE = 0.0042; // 2.1 / 500 = 0.0042 scene units per ml

// Spoon / rod constants
export const SPOON_ACTIVE_LENGTH = 0.20; // scene units
export const SPOON_ENVELOPE_RADIUS = 0.12; // scene units
export const SPOON_WALL_MARGIN = 0.01;   // scene units
export const SPOON_MAX_RADIUS = 0.74;    // BEAKER_INNER_RADIUS - SPOON_ENVELOPE_RADIUS - SPOON_WALL_MARGIN = 0.87 - 0.12 - 0.01
export const SPOON_MIN_TIP_Y = 0.14;     // BEAKER_BASE_Y + 0.02
export const SPOON_MAX_TIP_Y = 2.00;     // BEAKER_FILL_TOP - 0.22

// Particle constants
export const PARTICLE_MARGIN = 0.01;
export const PARTICLE_RADIUS = {
  sand: 0.023,
  sugar: 0.028,
} as const;

/**
 * Pure function: converts a volume in ml to height in scene units.
 */
export function volumeToHeight(volumeMl: number): number {
  if (!Number.isFinite(volumeMl) || volumeMl <= 0) return 0;
  return volumeMl * BEAKER_VOLUME_SCALE;
}

/**
 * Pure function: converts a height in scene units to volume in ml.
 */
export function heightToVolume(height: number): number {
  if (!Number.isFinite(height) || height <= 0) return 0;
  return height / BEAKER_VOLUME_SCALE;
}

/**
 * Scientific phase masses contract as specified in SCIENTIFIC_SPEC §2 & §4.
 */
export interface PhaseMasses {
  Wml: number; // Water in ml
  Oml: number; // Oil in ml (Ot / rhoO)
  Gt: number;  // Total sugar in g
  Gu: number;  // Undissolved sugar in g
  Gd: number;  // Dissolved sugar in g
  fGu: number; // Suspended fraction of undissolved sugar [0, 1]
  St: number;  // Total sand in g
  Sb: number;  // Bed sand in g
  Ss: number;  // Suspended sand in g
  Ot: number;  // Total oil in g
  Ol: number;  // Layered oil in g
  Od: number;  // Dispersed oil droplets in g
}

export interface RegionBoundaries {
  bottom: number;
  top: number;
  height: number;
  volumeMl: number;
}

export type RegionCategory = 'empty' | 'dry' | 'water-only' | 'oil-only' | 'mixed';

export interface BeakerRegions {
  category: RegionCategory;
  totalReserveMl: number;
  bed: RegionBoundaries;
  aqueous: RegionBoundaries;
  oil: RegionBoundaries;
  liquidTop: number;
}

/**
 * Minimal adapter to convert Phase 1 quantities to PhaseMasses without fake engine simulation.
 */
export function phaseMassesFromQuantities(q: Quantities): PhaseMasses {
  const Wml = Math.max(0, q.water);
  const Oml = Math.max(0, q.oil);
  const Gt = Math.max(0, q.sugar);
  const St = Math.max(0, q.sand);
  const rhoO = 0.9;
  return {
    Wml,
    Oml,
    Gt,
    Gu: Gt,
    Gd: 0,
    fGu: 0,
    St,
    Sb: St,
    Ss: 0,
    Ot: Oml * rhoO,
    Ol: Oml * rhoO,
    Od: 0,
  };
}

/**
 * Computes non-overlapping bed, aqueous, and oil regions according to SCIENTIFIC_SPEC §4.
 */
export function computeBeakerRegions(phases: PhaseMasses): BeakerRegions {
  const rhoO = 0.9;
  const GuSusp = phases.Gu * phases.fGu;
  const GuBed = phases.Gu - GuSusp;
  const Vbed = VISUAL_ML_PER_GRAM.sugar * GuBed + VISUAL_ML_PER_GRAM.sand * phases.Sb;

  const Wml = phases.Wml;
  const Oml = phases.Oml;

  let category: RegionCategory;
  let Vaqueous = 0;
  let Voil = 0;

  if (Wml === 0 && Oml === 0) {
    category = phases.Gt === 0 && phases.St === 0 ? 'empty' : 'dry';
    Vaqueous = 0;
    Voil = 0;
  } else if (Wml > 0 && Oml === 0) {
    category = 'water-only';
    Vaqueous = Wml + VISUAL_ML_PER_GRAM.sugar * phases.Gd + VISUAL_ML_PER_GRAM.sugar * GuSusp + VISUAL_ML_PER_GRAM.sand * phases.Ss;
    Voil = 0;
  } else if (Wml === 0 && Oml > 0) {
    category = 'oil-only';
    Vaqueous = 0;
    Voil = Oml + VISUAL_ML_PER_GRAM.sugar * GuSusp + VISUAL_ML_PER_GRAM.sand * phases.Ss;
  } else {
    category = 'mixed';
    const OdMl = phases.Od / rhoO;
    const OlMl = phases.Ol / rhoO;
    Vaqueous = Wml + VISUAL_ML_PER_GRAM.sugar * phases.Gd + VISUAL_ML_PER_GRAM.sugar * GuSusp + VISUAL_ML_PER_GRAM.sand * phases.Ss + OdMl;
    Voil = OlMl;
  }

  const bedBottom = BEAKER_BASE_Y;
  const bedHeight = volumeToHeight(Vbed);
  const bedTop = bedBottom + bedHeight;

  const aqBottom = bedTop;
  const aqHeight = volumeToHeight(Vaqueous);
  const aqTop = aqBottom + aqHeight;

  const oilBottom = aqTop;
  const oilHeight = volumeToHeight(Voil);
  const oilTop = oilBottom + oilHeight;

  const totalReserveMl = Vbed + Vaqueous + Voil;
  const liquidTop = (Wml > 0 || Oml > 0) ? oilTop : bedTop;

  return {
    category,
    totalReserveMl,
    bed: {
      bottom: bedBottom,
      top: bedTop,
      height: bedHeight,
      volumeMl: Vbed,
    },
    aqueous: {
      bottom: aqBottom,
      top: aqTop,
      height: aqHeight,
      volumeMl: Vaqueous,
    },
    oil: {
      bottom: oilBottom,
      top: oilTop,
      height: oilHeight,
      volumeMl: Voil,
    },
    liquidTop,
  };
}

/**
 * Computes beaker regions directly from Phase 1 Quantities.
 */
export function computeBeakerRegionsFromQuantities(q: Quantities): BeakerRegions {
  return computeBeakerRegions(phaseMassesFromQuantities(q));
}

/**
 * Computes spoon tip Y position adapted to bed top.
 * Contract: tipY = clamp(bedTop + 0.02, 0.14, 2.0).
 */
export function computeTipY(bedTop: number): number {
  const unclamped = bedTop + 0.02;
  return Math.min(SPOON_MAX_TIP_Y, Math.max(SPOON_MIN_TIP_Y, unclamped));
}

/**
 * Clamps horizontal spoon center coordinates so the spoon envelope stays inside the beaker wall.
 * Contract: radius <= 0.74 scene units.
 */
export function clampSpoonXZ(x: number, z: number): { x: number; z: number; radius: number } {
  const radius = Math.hypot(x, z);
  if (radius <= SPOON_MAX_RADIUS) {
    return { x, z, radius };
  }
  if (radius === 0) {
    return { x: 0, z: 0, radius: 0 };
  }
  const factor = SPOON_MAX_RADIUS / radius;
  return { x: x * factor, z: z * factor, radius: SPOON_MAX_RADIUS };
}

/**
 * Computes mechanical contact between the active spoon segment and the liquid region.
 * Contract:
 * - Empty/dry: contact = 0 (no liquid carrier).
 * - Active segment: [tipY, tipY + 0.20].
 * - Liquid interval: [bedTop, liquidTop].
 * - Contact = length(activeSegment ∩ liquidInterval) / 0.20, clamped [0, 1].
 */
export function computeMechanicalContact(
  regions: BeakerRegions,
  tipY = computeTipY(regions.bed.top)
): number {
  if (regions.category === 'empty' || regions.category === 'dry') {
    return 0;
  }
  const activeBottom = tipY;
  const activeTop = tipY + SPOON_ACTIVE_LENGTH;

  const liquidBottom = regions.bed.top;
  const liquidTop = regions.liquidTop;

  if (liquidTop <= liquidBottom) {
    return 0;
  }

  const overlapStart = Math.max(activeBottom, liquidBottom);
  const overlapEnd = Math.min(activeTop, liquidTop);
  const overlap = Math.max(0, overlapEnd - overlapStart);

  const contact = overlap / SPOON_ACTIVE_LENGTH;
  if (Math.abs(contact - 1) < 1e-9) return 1;
  if (contact < 1e-9) return 0;
  return Math.min(1, Math.max(0, contact));
}

export interface ParticleBounds {
  active: boolean;
  horizontalRadius: number;
  yBottom: number;
  yTop: number;
  midpointY: number;
  effectiveParticleRadius: number;
}

/**
 * Computes spatial bounds for particle representatives in a region.
 * Contract:
 * - Region height = 0: active = false (no representatives).
 * - Region height < 2 * particleRadius: scale effective radius down to min(particleRadius, height / 2) and place at midpoint.
 * - Otherwise: bounds [bottom + radius, top - radius], horizontal radius clamped to innerRadius - radius - margin.
 */
export function computeParticleBounds(
  regionBottom: number,
  regionTop: number,
  particleRadius: number,
  innerRadius = BEAKER_INNER_RADIUS,
  margin = PARTICLE_MARGIN
): ParticleBounds {
  const height = Math.max(0, regionTop - regionBottom);
  const maxHorizontalRadius = Math.max(0, innerRadius - particleRadius - margin);

  if (height <= 0 || !Number.isFinite(height)) {
    return {
      active: false,
      horizontalRadius: maxHorizontalRadius,
      yBottom: regionBottom,
      yTop: regionBottom,
      midpointY: regionBottom,
      effectiveParticleRadius: 0,
    };
  }

  const diameter = 2 * particleRadius;
  if (height < diameter) {
    const effectiveParticleRadius = Math.min(particleRadius, height / 2);
    const midpointY = regionBottom + height / 2;
    return {
      active: true,
      horizontalRadius: maxHorizontalRadius,
      yBottom: midpointY,
      yTop: midpointY,
      midpointY,
      effectiveParticleRadius,
    };
  }

  const yBottom = regionBottom + particleRadius;
  const yTop = regionTop - particleRadius;
  return {
    active: true,
    horizontalRadius: maxHorizontalRadius,
    yBottom,
    yTop,
    midpointY: regionBottom + height / 2,
    effectiveParticleRadius: particleRadius,
  };
}
