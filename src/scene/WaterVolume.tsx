import { DoubleSide } from 'three';
import { BEAKER_INNER_RADIUS, volumeToHeight } from '../simulation/constants/beaker';
import { computeSurfaceRipple } from './fluidSurfaceRipple';

export interface WaterVolumeProps {
  volume: number;
  base: number;
  intensity?: number;
  elapsedSeconds?: number;
  paused?: boolean;
}

export function WaterVolume({
  volume,
  base,
  intensity = 0,
  elapsedSeconds = 0,
  paused = false,
}: WaterVolumeProps) {
  if (volume <= 0) return null;
  const height = volumeToHeight(volume);
  if (height <= 0.0001) return null;

  const ripple = computeSurfaceRipple(intensity, elapsedSeconds, paused, 0);

  return (
    <group>
      <mesh position={[0, base + height / 2, 0]} renderOrder={2} raycast={() => null}>
        <cylinderGeometry args={[BEAKER_INNER_RADIUS, BEAKER_INNER_RADIUS, height, 80]} />
        <meshPhysicalMaterial
          color="#38bdf8"
          transparent
          opacity={0.38}
          roughness={0.05}
          depthWrite={false}
        />
      </mesh>
      <mesh
        position={[0, base + height + ripple.offsetY, 0]}
        rotation={[-Math.PI / 2 + ripple.tiltX, 0, ripple.tiltZ]}
        renderOrder={2}
        raycast={() => null}
      >
        <circleGeometry args={[BEAKER_INNER_RADIUS - 0.003, 64]} />
        <meshPhysicalMaterial
          color="#38bdf8"
          transparent
          opacity={0.50}
          roughness={0.04}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

