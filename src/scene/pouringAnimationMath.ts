/**
 * Pure mathematical functions and trajectory formulas for stock vessel pouring animation.
 * Complies with specification:
 * - Idle -> Lift -> Move -> Tilt -> Pour -> Return -> Idle (~2.2s duration)
 * - Zero cumulative drift (exact return to initial transform)
 * - Elevated above 500ml beaker: Base altitude >= 2.35 during flight, spout at (-0.50, 2.75, 0.0)
 * - Clearly above 500ml beaker rim (2.32) with visible vertical gap (0.43 units)
 * - Stream trajectory drops under gravity into 500ml beaker (-0.38, Y_liquid, 0.0) without clipping walls
 */

export interface VesselTransform {
  position: [number, number, number];
  rotationZ: number;
  contentCounterRotationZ: number;
  isPouringStream: boolean;
  streamProgress: number; // 0 to 1 during pour phase
}

export const POUR_DURATIONS = {
  total: 2.20,
  liftEnd: 0.35,
  moveEnd: 0.85,
  tiltEnd: 1.15,
  pourEnd: 1.65,
  commitTime: 1.15,
} as const;

import {
  BEAKER_CENTER,
  BEAKER_INNER_RADIUS,
  BEAKER_OUTER_RADIUS,
  BEAKER_RIM_Y,
} from '../simulation/constants/beaker';

export {
  BEAKER_CENTER,
  BEAKER_INNER_RADIUS,
  BEAKER_OUTER_RADIUS,
  BEAKER_RIM_Y,
};

/**
 * Architectural Guarantee:
 * In LaboratoryScene.tsx, <Beaker /> and <IngredientVessels /> are direct children
 * of <Canvas> in world space (root identity transform: position [0, 0, 0], rotation [0, 0, 0], scale [1, 1, 1]).
 * All coordinates here are therefore simultaneously local and canonical scene world coordinates.
 */

/**
 * Relative Geometric Pour Offsets (derived relative to Beaker dimensions):
 * - Spout penetrates 0.50 units radially inside beaker mouth (inner radius = 0.87)
 * - Spout elevated with 0.43 units vertical air gap above rim (2.32 + 0.43 = 2.75)
 * - Pour tilt: ~48.7 degrees (0.85 rad) clockwise
 * - Stream landing target: 0.38 units inside mouth from center, safely clearing central rod
 */
export const POUR_GEOMETRY = {
  spoutRadialPenetration: 0.50,
  spoutClearanceAboveRim: 0.43,
  spoutTiltAngle: 0.85,
  streamLandingX: BEAKER_CENTER.x - 0.38,
} as const;

export const SPOUT_TARGET = {
  x: BEAKER_CENTER.x - POUR_GEOMETRY.spoutRadialPenetration, // -0.50
  y: BEAKER_RIM_Y + POUR_GEOMETRY.spoutClearanceAboveRim,    // 2.75
  z: BEAKER_CENTER.z,                                        // 0.0
  tiltAngle: POUR_GEOMETRY.spoutTiltAngle,                   // 0.85 rad
} as const;

/**
 * Computes exact 3D world position of the vessel's physical spout lip
 * given its base position and clockwise tilt angle.
 */
export function computeSpoutPosition(
  vesselPos: readonly [number, number, number],
  tiltAngleRad: number,
  rVessel: number = 0.38,
  hVessel: number = 1.05
): [number, number, number] {
  const sinT = Math.sin(tiltAngleRad);
  const cosT = Math.cos(tiltAngleRad);
  return [
    vesselPos[0] + rVessel * cosT + hVessel * sinT,
    vesselPos[1] - rVessel * sinT + hVessel * cosT,
    vesselPos[2],
  ];
}

export function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export function computeVesselTransform(
  initialPos: readonly [number, number, number],
  elapsedSeconds: number,
  rVessel: number = 0.38,
  hVessel: number = 1.05
): VesselTransform {
  const [x0, y0, z0] = initialPos;

  // Idle state: strictly returns exact initial position with zero drift
  if (elapsedSeconds <= 0 || elapsedSeconds >= POUR_DURATIONS.total) {
    return {
      position: [x0, y0, z0],
      rotationZ: 0,
      contentCounterRotationZ: 0,
      isPouringStream: false,
      streamProgress: 0,
    };
  }

  const t = Math.max(0, Math.min(POUR_DURATIONS.total, elapsedSeconds));
  const flightHeight = 2.35; // base altitude during horizontal travel (strictly above beaker rim 2.32)
  const maxTilt = SPOUT_TARGET.tiltAngle;

  // At max tilt, calculate base position so spout is exactly at SPOUT_TARGET
  const sinMax = Math.sin(maxTilt);
  const cosMax = Math.cos(maxTilt);
  const xBasePour = SPOUT_TARGET.x - hVessel * sinMax - rVessel * cosMax;
  const yBasePour = SPOUT_TARGET.y - hVessel * cosMax + rVessel * sinMax;
  const zBasePour = SPOUT_TARGET.z;

  let x = x0;
  let y = y0;
  let z = z0;
  let tilt = 0;
  let isPouringStream = false;
  let streamProgress = 0;

  if (t < POUR_DURATIONS.liftEnd) {
    // 1. Lift phase (0 -> 0.35s): lift straight up from table to flight height
    const u = smoothstep(t / POUR_DURATIONS.liftEnd);
    x = x0;
    y = y0 + u * flightHeight;
    z = z0;
    tilt = 0;
  } else if (t < POUR_DURATIONS.moveEnd) {
    // 2. Move phase (0.35 -> 0.85s): fly horizontally above beaker rim to pre-tilt position
    const u = smoothstep((t - POUR_DURATIONS.liftEnd) / (POUR_DURATIONS.moveEnd - POUR_DURATIONS.liftEnd));
    x = x0 + u * (xBasePour - x0);
    y = flightHeight + u * (yBasePour - flightHeight);
    z = z0 + u * (zBasePour - z0);
    tilt = 0;
  } else if (t < POUR_DURATIONS.tiltEnd) {
    // 3. Tilt phase (0.85 -> 1.15s): tilt smoothly into pouring pose pinned at spout
    const u = smoothstep((t - POUR_DURATIONS.moveEnd) / (POUR_DURATIONS.tiltEnd - POUR_DURATIONS.moveEnd));
    tilt = u * maxTilt;
    const sinT = Math.sin(tilt);
    const cosT = Math.cos(tilt);
    x = SPOUT_TARGET.x - hVessel * sinT - rVessel * cosT;
    y = SPOUT_TARGET.y - hVessel * cosT + rVessel * sinT;
    z = zBasePour;
  } else if (t < POUR_DURATIONS.pourEnd) {
    // 4. Pour phase (1.15 -> 1.65s): hold at pouring pose, stream active
    tilt = maxTilt;
    x = xBasePour;
    y = yBasePour;
    z = zBasePour;
    isPouringStream = true;
    streamProgress = (t - POUR_DURATIONS.tiltEnd) / (POUR_DURATIONS.pourEnd - POUR_DURATIONS.tiltEnd);
  } else {
    // 5. Return phase (1.65 -> 2.20s): untilt, fly back, lower to table
    const returnDur = POUR_DURATIONS.total - POUR_DURATIONS.pourEnd;
    const u = (t - POUR_DURATIONS.pourEnd) / returnDur;

    // Untilts in first 35% of return while still hovering above beaker
    if (u < 0.35) {
      const uTilt = smoothstep(u / 0.35);
      tilt = (1 - uTilt) * maxTilt;
      const sinT = Math.sin(tilt);
      const cosT = Math.cos(tilt);
      x = SPOUT_TARGET.x - hVessel * sinT - rVessel * cosT;
      y = SPOUT_TARGET.y - hVessel * cosT + rVessel * sinT;
      z = zBasePour;
    } else {
      tilt = 0;
      // Fly back to spot and descend in remaining 65%
      const uMove = (u - 0.35) / 0.65;
      const returnXBase = SPOUT_TARGET.x - rVessel;
      if (uMove < 0.60) {
        // Fly horizontally back to above table position (x0, flightHeight, z0)
        const uHoriz = smoothstep(uMove / 0.60);
        x = returnXBase + uHoriz * (x0 - returnXBase);
        y = flightHeight;
        z = zBasePour + uHoriz * (z0 - zBasePour);
      } else {
        // Descend vertically to table (x0, 0, z0)
        const uDescend = smoothstep((uMove - 0.60) / 0.40);
        x = x0;
        y = flightHeight * (1 - uDescend);
        z = z0;
      }
    }
  }

  return {
    position: [x, y, z],
    rotationZ: tilt === 0 ? 0 : -tilt,
    contentCounterRotationZ: tilt,
    isPouringStream,
    streamProgress,
  };
}

export interface ParticleDropState {
  x: number;
  y: number;
  z: number;
  scale: number;
  visible: boolean;
}

export function computeFallingParticle(
  index: number,
  totalCount: number,
  t: number,
  targetY: number,
  spoutPos: readonly [number, number, number] = [SPOUT_TARGET.x, SPOUT_TARGET.y - 0.05, SPOUT_TARGET.z]
): ParticleDropState {
  const cycleTime = 0.42; // seconds per full loop
  const phase = index / totalCount;
  const p = ((t / cycleTime) + phase) % 1.0;

  const startX = spoutPos[0];
  const startY = spoutPos[1];
  const startZ = spoutPos[2];
  const endX = POUR_GEOMETRY.streamLandingX;
  const endY = Math.max(0.15, targetY);

  // Slight deterministic jitter based on index (no Math.random())
  const jitterX = Math.sin(index * 4.3) * 0.035;
  const jitterZ = Math.cos(index * 6.7) * 0.045;

  const x = startX + p * (endX - startX) + jitterX * p;
  const z = startZ + jitterZ * p;
  // Quadratic gravity drop
  const dropP = p * p;
  const y = startY - dropP * (startY - endY);

  // Scale: fades in near spout, normal during drop, shrinks as it enters liquid/bed
  let scale = 1.0;
  if (p < 0.15) {
    scale = p / 0.15;
  } else if (p > 0.85) {
    scale = (1.0 - p) / 0.15;
  }

  return {
    x,
    y,
    z,
    scale,
    visible: p > 0.02 && p < 0.98,
  };
}

export const DROP_POUR_DURATIONS = {
  total: 2.20,
  liftEnd: 0.35,
  settleEnd: 0.75,
  commitTime: 0.75,
  pourEnd: 1.50,
} as const;

export const FREE_POUR_LIFT_DURATION = 0.25;

/**
 * Drop Zone Bounds derived relative to Beaker 500 ml geometry:
 * - Centered horizontally around the beaker and spout pour trajectory
 * - Altitude covers approach and pour heights above beaker rim
 * - Enter bounds require deliberate intention near mouth
 * - Maintain bounds provide hysteresis envelope preventing boundary chatter
 */
export const DROP_ZONE_ENTER_BOUNDS = {
  minX: BEAKER_CENTER.x - BEAKER_OUTER_RADIUS - 0.84, // -1.75
  maxX: BEAKER_CENTER.x + 0.15,                      // 0.15
  minY: BEAKER_RIM_Y - 0.37,                         // 1.95
  maxY: BEAKER_RIM_Y + 1.43,                         // 3.75
  minZ: BEAKER_CENTER.z - 0.75,                      // -0.75
  maxZ: BEAKER_CENTER.z + 0.75,                      // 0.75
} as const;

export const DROP_ZONE_MAINTAIN_BOUNDS = {
  minX: BEAKER_CENTER.x - BEAKER_OUTER_RADIUS - 0.99, // -1.90
  maxX: BEAKER_CENTER.x + 0.30,                      // 0.30
  minY: BEAKER_RIM_Y - 0.52,                         // 1.80
  maxY: BEAKER_RIM_Y + 1.58,                         // 3.90
  minZ: BEAKER_CENTER.z - 0.90,                      // -0.90
  maxZ: BEAKER_CENTER.z + 0.90,                      // 0.90
} as const;

/**
 * Visual Drop Zone Indicator placement derived directly from DROP_ZONE_ENTER_BOUNDS:
 * - Center X is midpoint of horizontal entry envelope
 * - Height is anchored directly above the beaker rim (BEAKER_RIM_Y + 0.15 = 2.47)
 * - Radius reflects the entry target aperture, perfectly matching where user drags vessel
 */
export const DROP_ZONE_VISUAL_CENTER = {
  x: (DROP_ZONE_ENTER_BOUNDS.minX + DROP_ZONE_ENTER_BOUNDS.maxX) / 2, // -0.80
  y: BEAKER_RIM_Y + 0.15,                                           // 2.47
  z: (DROP_ZONE_ENTER_BOUNDS.minZ + DROP_ZONE_ENTER_BOUNDS.maxZ) / 2, // 0.0
} as const;

export const DROP_ZONE_VISUAL_RADIUS = {
  inner: 0.50,
  outer: 0.65,
} as const;

export function isPointInDropZone(
  point: readonly [number, number, number],
  isAlreadyInZone: boolean = false
): boolean {
  const bounds = isAlreadyInZone ? DROP_ZONE_MAINTAIN_BOUNDS : DROP_ZONE_ENTER_BOUNDS;
  const [x, y, z] = point;
  return (
    x >= bounds.minX &&
    x <= bounds.maxX &&
    y >= bounds.minY &&
    y <= bounds.maxY &&
    z >= bounds.minZ &&
    z <= bounds.maxZ
  );
}

/**
 * 3D Geometric contact test between a stock reagent vessel and the 500 ml beaker.
 * Both geometries are modeled as 3D cylindrical volumes in world space.
 * Beaker: Base [0, 0, 0], Outer Radius 0.91, Height 2.28 - 2.32 (Rim Y = 2.32).
 * Stock Vessel: Cylinder radius 0.38, height 1.05.
 *
 * Contact occurs when:
 * 1. Horizontal distance between axes <= R_beaker + R_vessel + contactMargin (0.91 + 0.38 + 0.21 = 1.50).
 * 2. Vertical overlap: vessel base <= BEAKER_RIM_Y + 0.35 and vessel top (y + hVessel) >= 0.0.
 *
 * Evaluated strictly in 3D world space (including Z depth) to prevent false positives from 2D screen overlap.
 */
export function isVesselTouchingBeaker(
  vesselPos: readonly [number, number, number],
  rVessel: number = 0.38,
  hVessel: number = 1.05
): boolean {
  const dx = vesselPos[0] - BEAKER_CENTER.x;
  const dz = vesselPos[2] - BEAKER_CENTER.z;
  const distXZ = Math.sqrt(dx * dx + dz * dz);
  const contactRadius = BEAKER_OUTER_RADIUS + rVessel + 0.21; // 1.50

  const yBase = vesselPos[1];
  const yTop = yBase + hVessel;

  const isWithinHoriz = distXZ <= contactRadius;
  const isWithinVert = yBase <= BEAKER_RIM_Y + 0.50 && yTop >= 0.0;

  return isWithinHoriz && isWithinVert;
}

/**
 * Proximity threshold for subtle visual highlight and user guidance.
 * Active when vessel approaches within distance <= 2.20 of beaker axis.
 */
export function isVesselNearBeaker(
  vesselPos: readonly [number, number, number],
  rVessel: number = 0.38,
  hVessel: number = 1.05
): boolean {
  const dx = vesselPos[0] - BEAKER_CENTER.x;
  const dz = vesselPos[2] - BEAKER_CENTER.z;
  const distXZ = Math.sqrt(dx * dx + dz * dz);
  const proximityRadius = BEAKER_OUTER_RADIUS + rVessel + 0.91; // 2.20

  const yBase = vesselPos[1];
  const yTop = yBase + hVessel;

  return distXZ <= proximityRadius && yBase <= BEAKER_RIM_Y + 0.50 && yTop >= 0.0;
}

export function computeDropPourTransform(
  dropPos: readonly [number, number, number],
  initialHomePos: readonly [number, number, number],
  elapsedSeconds: number,
  rVessel: number = 0.38,
  hVessel: number = 1.05
): VesselTransform {
  const [x0, y0, z0] = initialHomePos;
  const [xd, yd, zd] = dropPos;

  if (elapsedSeconds <= 0) {
    return {
      position: [xd, yd, zd],
      rotationZ: 0,
      contentCounterRotationZ: 0,
      isPouringStream: false,
      streamProgress: 0,
    };
  }

  if (elapsedSeconds >= DROP_POUR_DURATIONS.total) {
    return {
      position: [x0, y0, z0],
      rotationZ: 0,
      contentCounterRotationZ: 0,
      isPouringStream: false,
      streamProgress: 0,
    };
  }

  const t = elapsedSeconds;
  const flightHeight = Math.max(2.45, yd + 0.35); // base altitude >= 2.45 is strictly above beaker rim 2.32
  const maxTilt = SPOUT_TARGET.tiltAngle;
  const sinMax = Math.sin(maxTilt);
  const cosMax = Math.cos(maxTilt);
  const xBasePour = SPOUT_TARGET.x - hVessel * sinMax - rVessel * cosMax;
  const yBasePour = SPOUT_TARGET.y - hVessel * cosMax + rVessel * sinMax;
  const zBasePour = SPOUT_TARGET.z;

  let x = xd;
  let y = yd;
  let z = zd;
  let tilt = 0;
  let isPouringStream = false;
  let streamProgress = 0;

  if (t < DROP_POUR_DURATIONS.liftEnd) {
    // 1. Pure vertical lift phase (0 -> 0.35s): strictly outside the beaker glass
    const u = smoothstep(t / DROP_POUR_DURATIONS.liftEnd);
    x = xd;
    y = yd + u * (flightHeight - yd);
    z = zd;
    tilt = 0;
  } else if (t < DROP_POUR_DURATIONS.settleEnd) {
    // 2. Glide & Tilt phase (0.35 -> 0.75s): glide horizontally over rim and tilt into pour pose
    const u = smoothstep((t - DROP_POUR_DURATIONS.liftEnd) / (DROP_POUR_DURATIONS.settleEnd - DROP_POUR_DURATIONS.liftEnd));
    x = xd + u * (xBasePour - xd);
    y = flightHeight + u * (yBasePour - flightHeight);
    z = zd + u * (zBasePour - zd);
    tilt = u * maxTilt;
  } else if (t < DROP_POUR_DURATIONS.pourEnd) {
    // 3. Pour phase (0.75 -> 1.50s): stream active, hold pose
    x = xBasePour;
    y = yBasePour;
    z = zBasePour;
    tilt = maxTilt;
    isPouringStream = true;
    streamProgress = (t - DROP_POUR_DURATIONS.settleEnd) / (DROP_POUR_DURATIONS.pourEnd - DROP_POUR_DURATIONS.settleEnd);
  } else {
    // 4. Return phase (1.50 -> 2.20s): untilt while above rim, fly back over table, descend
    const returnDur = DROP_POUR_DURATIONS.total - DROP_POUR_DURATIONS.pourEnd;
    const u = (t - DROP_POUR_DURATIONS.pourEnd) / returnDur;

    if (u < 0.35) {
      // Untilt while still elevated above rim
      const uTilt = smoothstep(u / 0.35);
      tilt = (1 - uTilt) * maxTilt;
      const sinT = Math.sin(tilt);
      const cosT = Math.cos(tilt);
      x = SPOUT_TARGET.x - hVessel * sinT - rVessel * cosT;
      y = SPOUT_TARGET.y - hVessel * cosT + rVessel * sinT;
      z = zBasePour;
    } else {
      tilt = 0;
      const uMove = (u - 0.35) / 0.65;
      const returnXBase = SPOUT_TARGET.x - rVessel;
      if (uMove < 0.60) {
        // Fly horizontally back to above table position (x0, flightHeight, z0)
        const uHoriz = smoothstep(uMove / 0.60);
        x = returnXBase + uHoriz * (x0 - returnXBase);
        y = flightHeight;
        z = zBasePour + uHoriz * (z0 - zBasePour);
      } else {
        // Descend vertically to table (x0, y0, z0)
        const uDescend = smoothstep((uMove - 0.60) / 0.40);
        x = x0;
        y = flightHeight * (1 - uDescend);
        z = z0;
      }
    }
  }

  return {
    position: [x, y, z],
    rotationZ: tilt === 0 ? 0 : -tilt,
    contentCounterRotationZ: tilt,
    isPouringStream,
    streamProgress,
  };
}

/**
 * Computes smooth transition transform during the lift phase of Free Pour.
 * Lifts vessel vertically above rim before gliding into pour pose.
 */
export function computeFreePourLiftTransform(
  liftStartPos: readonly [number, number, number],
  elapsedSeconds: number,
  rVessel: number = 0.38,
  hVessel: number = 1.05
): VesselTransform {
  const [xd, yd, zd] = liftStartPos;
  const t = Math.max(0, Math.min(FREE_POUR_LIFT_DURATION, elapsedSeconds));
  const flightHeight = Math.max(2.45, yd + 0.35);
  const maxTilt = SPOUT_TARGET.tiltAngle;
  const sinMax = Math.sin(maxTilt);
  const cosMax = Math.cos(maxTilt);
  const xBasePour = SPOUT_TARGET.x - hVessel * sinMax - rVessel * cosMax;
  const yBasePour = SPOUT_TARGET.y - hVessel * cosMax + rVessel * sinMax;
  const zBasePour = SPOUT_TARGET.z;

  const liftFraction = 0.45;
  const liftDur = FREE_POUR_LIFT_DURATION * liftFraction;

  if (t < liftDur) {
    const u = smoothstep(t / liftDur);
    return {
      position: [xd, yd + u * (flightHeight - yd), zd],
      rotationZ: 0,
      contentCounterRotationZ: 0,
      isPouringStream: false,
      streamProgress: 0,
    };
  }

  const u = smoothstep((t - liftDur) / (FREE_POUR_LIFT_DURATION - liftDur));
  const tilt = u * maxTilt;
  return {
    position: [
      xd + u * (xBasePour - xd),
      flightHeight + u * (yBasePour - flightHeight),
      zd + u * (zBasePour - zd),
    ],
    rotationZ: -tilt,
    contentCounterRotationZ: tilt,
    isPouringStream: false,
    streamProgress: 0,
  };
}

export function computeCancelReturnTransform(
  cancelStartPos: readonly [number, number, number],
  initialHomePos: readonly [number, number, number],
  elapsedSeconds: number,
  totalDuration = 0.35
): [number, number, number] {
  if (elapsedSeconds <= 0) return [cancelStartPos[0], cancelStartPos[1], cancelStartPos[2]];
  if (elapsedSeconds >= totalDuration) return [initialHomePos[0], initialHomePos[1], initialHomePos[2]];
  const u = smoothstep(elapsedSeconds / totalDuration);
  return [
    cancelStartPos[0] + u * (initialHomePos[0] - cancelStartPos[0]),
    cancelStartPos[1] + u * (initialHomePos[1] - cancelStartPos[1]),
    cancelStartPos[2] + u * (initialHomePos[2] - cancelStartPos[2]),
  ];
}

/**
 * Computes smooth transition transform for interactive Free Pouring mode.
 * - Interpolates between un-snapped drag cursor position and tilted spout pour pose.
 * - Spout remains strictly pinned at SPOUT_TARGET when tiltProgress = 1.0.
 */
export function computeFreePourTransform(
  cursorPos: readonly [number, number, number],
  tiltProgress: number,
  isStreamActive: boolean,
  rVessel: number = 0.38,
  hVessel: number = 1.05
): VesselTransform {
  const maxTilt = SPOUT_TARGET.tiltAngle;
  const sinMax = Math.sin(maxTilt);
  const cosMax = Math.cos(maxTilt);
  const xBasePour = SPOUT_TARGET.x - hVessel * sinMax - rVessel * cosMax;
  const yBasePour = SPOUT_TARGET.y - hVessel * cosMax + rVessel * sinMax;
  const zBasePour = SPOUT_TARGET.z;

  const u = smoothstep(Math.max(0, Math.min(1, tiltProgress)));
  const tilt = u * maxTilt;

  // Interpolate base position towards pour base position
  const x = cursorPos[0] + u * (xBasePour - cursorPos[0]);
  const y = cursorPos[1] + u * (yBasePour - cursorPos[1]);
  const z = cursorPos[2] + u * (zBasePour - cursorPos[2]);

  return {
    position: [x, y, z],
    rotationZ: -tilt,
    contentCounterRotationZ: tilt,
    isPouringStream: isStreamActive && u >= 0.95,
    streamProgress: u,
  };
}
