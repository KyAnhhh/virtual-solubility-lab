import { BEAKER_INNER_RADIUS, volumeToHeight } from '../simulation/constants/beaker';

export function WaterVolume({ volume, base }: { volume: number; base: number }) {
  if (volume <= 0) return null;
  const height = volumeToHeight(volume);
  if (height <= 0.0001) return null;
  return (
    <mesh position={[0, base + height / 2, 0]} renderOrder={2} raycast={() => null}>
      <cylinderGeometry args={[BEAKER_INNER_RADIUS, BEAKER_INNER_RADIUS, height, 80]} />
      <meshPhysicalMaterial
        color="#62c4e8"
        transparent
        opacity={0.32}
        roughness={0.08}
        depthWrite={false}
      />
    </mesh>
  );
}

