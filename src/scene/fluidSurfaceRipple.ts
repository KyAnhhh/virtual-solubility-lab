export interface FluidSurfaceRipple {
  offsetY: number;
  tiltX: number;
  tiltZ: number;
}

export function computeSurfaceRipple(
  intensity: number = 0,
  elapsedSeconds: number = 0,
  paused: boolean = false,
  phaseOffset: number = 0
): FluidSurfaceRipple {
  if (paused || intensity <= 0) {
    return { offsetY: 0, tiltX: 0, tiltZ: 0 };
  }
  const clampedIntensity = Math.min(Math.max(intensity, 0), 2.0);
  const maxAmp = 0.004 * clampedIntensity; // strictly <= 0.004 * intensity
  const t = elapsedSeconds * 6.0 + phaseOffset;
  const offsetY = Math.sin(t) * maxAmp;
  const tiltX = Math.cos(t * 0.8) * (0.012 * clampedIntensity);
  const tiltZ = Math.sin(t * 1.2) * (0.012 * clampedIntensity);

  return { offsetY, tiltX, tiltZ };
}
