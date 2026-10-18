export type Vector3Tuple = [number, number, number];

export interface Ray3D {
  origin: Vector3Tuple;
  direction: Vector3Tuple;
}

export interface RayPlaneIntersection {
  point: Vector3Tuple;
  t: number;
}

/**
 * Threshold for rejecting rays nearly parallel to the horizontal drag plane.
 * Threshold is applied to the normalized direction's Y component: |normDy| < 1e-5.
 * Standard defined in SCIENTIFIC_SPEC §6 & IMPLEMENTATION_TASKS V2-05.
 */
export const NEAR_PARALLEL_THRESHOLD = 1e-5;

/**
 * Pure function: computes the intersection of a 3D ray with a horizontal plane at Y = planeY.
 * Coordinate conventions:
 * - +Y points UP.
 * - Horizontal plane is spanned by X and Z.
 * - Ray: P(t) = origin + t * direction.
 *
 * Validation rules:
 * 1. planeY and all components of origin and direction must be finite.
 * 2. direction must have non-zero length (> 1e-12).
 * 3. Near-parallel rays with |normalizedDirectionY| < 1e-5 are rejected (returns null).
 * 4. Intersections behind the ray origin (t < 0) are rejected (returns null).
 * 5. Returns exact intersection point [px, planeY, pz] and parameter t >= 0.
 *
 * Note: Never substitutes (0, 0, 0) or beaker center when projection is invalid.
 */
export function intersectRayHorizontalPlane(
  ray: Ray3D,
  planeY: number
): RayPlaneIntersection | null {
  if (!Number.isFinite(planeY)) {
    return null;
  }

  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;

  if (
    !Number.isFinite(ox) ||
    !Number.isFinite(oy) ||
    !Number.isFinite(oz) ||
    !Number.isFinite(dx) ||
    !Number.isFinite(dy) ||
    !Number.isFinite(dz)
  ) {
    return null;
  }

  const lenSq = dx * dx + dy * dy + dz * dz;
  if (!Number.isFinite(lenSq) || lenSq <= 1e-24) {
    return null;
  }

  const len = Math.sqrt(lenSq);
  const normDy = dy / len;

  // Reject near-parallel rays
  if (Math.abs(normDy) < NEAR_PARALLEL_THRESHOLD) {
    return null;
  }

  // t = (planeY - oy) / dy
  const t = (planeY - oy) / dy;
  if (!Number.isFinite(t) || t < 0) {
    return null;
  }

  const px = ox + t * dx;
  const pz = oz + t * dz;

  if (!Number.isFinite(px) || !Number.isFinite(pz)) {
    return null;
  }

  return {
    point: [px, planeY, pz],
    t,
  };
}

/**
 * Adapter utility: converts a generic object with { origin: {x,y,z}, direction: {x,y,z} }
 * (such as a Three.js Ray) to Ray3D tuple format.
 */
export function rayFromThreeRay(threeRay: {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
}): Ray3D {
  return {
    origin: [threeRay.origin.x, threeRay.origin.y, threeRay.origin.z],
    direction: [threeRay.direction.x, threeRay.direction.y, threeRay.direction.z],
  };
}
