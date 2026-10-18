import { DoubleSide } from 'three';
import { BEAKER_BASE_Y, BEAKER_OUTER_RADIUS, volumeToHeight } from '../simulation/constants/beaker';

export interface BeakerProps {
  radius?: number;
  height?: number;
  showGraduations?: boolean;
  opacity?: number;
}

export function Beaker({
  radius = BEAKER_OUTER_RADIUS,
  height = 2.28,
  showGraduations = true,
  opacity = 0.18,
}: BeakerProps = {}) {
  const isDefault500ml = radius === BEAKER_OUTER_RADIUS && height === 2.28;
  const centerY = isDefault500ml ? 1.18 : height / 2 + 0.04;
  const baseCenterY = isDefault500ml ? 0.065 : 0.03;
  const baseThickness = isDefault500ml ? 0.09 : 0.06;
  const ringY1 = isDefault500ml ? 0.1 : 0.05;
  const ringY2 = isDefault500ml ? 2.32 : height + 0.04;
  const rimTube = isDefault500ml ? 0.028 : 0.015;

  return (
    <group>
      <mesh position={[0, centerY, 0]} renderOrder={3} raycast={() => null}>
        <cylinderGeometry args={[radius, radius, height, isDefault500ml ? 96 : 48, 1, true]} />
        <meshPhysicalMaterial
          color="#d7eff5"
          transparent
          opacity={opacity}
          roughness={0.12}
          metalness={0.05}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, baseCenterY, 0]} raycast={() => null}>
        <cylinderGeometry args={[radius, radius, baseThickness, isDefault500ml ? 96 : 48]} />
        <meshPhysicalMaterial color="#cce6ed" transparent opacity={0.4} roughness={0.12} />
      </mesh>
      {[ringY1, ringY2].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <torusGeometry args={[radius, rimTube, 12, isDefault500ml ? 96 : 48]} />
          <meshStandardMaterial color="#b1cdd5" transparent opacity={0.7} />
        </mesh>
      ))}
      {showGraduations && Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} position={[0.23, BEAKER_BASE_Y + (i + 1) * volumeToHeight(50), 0.879]} raycast={() => null}>
          <boxGeometry args={[i % 2 === 1 ? 0.27 : 0.15, 0.014, 0.012]} />
          <meshBasicMaterial color="#39616d" />
        </mesh>
      ))}
    </group>
  );
}

