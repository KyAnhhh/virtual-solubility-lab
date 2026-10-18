import { BEAKER_INNER_RADIUS, volumeToHeight } from '../simulation/constants/beaker';

export function OilVolume({ volume, base }: { volume: number; base: number }) {
  if (volume <= 0) return null;
  const height = volumeToHeight(volume);
  if (height <= 0.0001) return null;
  return (
    <mesh position={[0, base + height / 2, 0]} renderOrder={2} raycast={() => null}>
      <cylinderGeometry args={[BEAKER_INNER_RADIUS, BEAKER_INNER_RADIUS, height, 80]} />
      <meshStandardMaterial
        color="#f5c842"
        transparent
        opacity={0.48}
        roughness={0.15}
        depthWrite={false}
      />
    </mesh>
  );
}

