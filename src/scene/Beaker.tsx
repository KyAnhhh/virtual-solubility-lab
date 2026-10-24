import { DoubleSide } from 'three';
import {
  BEAKER_BASE_Y,
  BEAKER_CENTER,
  BEAKER_OUTER_RADIUS,
  BEAKER_RIM_Y,
  volumeToHeight,
} from '../simulation/constants/beaker';

export interface BeakerProps {
  radius?: number;
  height?: number;
  showGraduations?: boolean;
  opacity?: number;
  isHighlighted?: boolean;
}

export function Beaker({
  radius = BEAKER_OUTER_RADIUS,
  height = 2.28,
  showGraduations = true,
  opacity = 0.16,
  isHighlighted = false,
}: BeakerProps = {}) {
  const isDefault500ml = radius === BEAKER_OUTER_RADIUS && height === 2.28;
  const centerY = isDefault500ml ? 1.18 : height / 2 + 0.04;
  const baseCenterY = isDefault500ml ? 0.065 : 0.03;
  const baseThickness = isDefault500ml ? 0.09 : 0.06;
  const ringY1 = isDefault500ml ? 0.1 : 0.05;
  const ringY2 = isDefault500ml ? BEAKER_RIM_Y : height + 0.04;
  const rimTube = isDefault500ml ? 0.028 : 0.015;

  return (
    <group position={[BEAKER_CENTER.x, BEAKER_CENTER.y, BEAKER_CENTER.z]}>
      <mesh position={[0, centerY, 0]} renderOrder={3} raycast={() => null}>
        <cylinderGeometry args={[radius, radius, height, isDefault500ml ? 96 : 48, 1, true]} />
        <meshPhysicalMaterial
          color={isHighlighted ? '#e0f2fe' : '#e2f0f4'}
          transparent
          opacity={isHighlighted ? Math.max(opacity, 0.28) : opacity}
          roughness={0.06}
          metalness={0.02}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, baseCenterY, 0]} renderOrder={2} raycast={() => null}>
        <cylinderGeometry args={[radius, radius, baseThickness, isDefault500ml ? 96 : 48]} />
        <meshPhysicalMaterial
          color="#d5e8ee"
          transparent
          opacity={0.22}
          roughness={0.06}
          metalness={0.02}
          depthWrite={false}
        />
      </mesh>
      {[ringY1, ringY2].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={3} raycast={() => null}>
          <torusGeometry args={[radius, rimTube, 12, isDefault500ml ? 96 : 48]} />
          <meshStandardMaterial
            color={isHighlighted && y === ringY2 ? '#38bdf8' : '#8faec0'}
            transparent
            opacity={isHighlighted && y === ringY2 ? 0.85 : 0.45}
            roughness={0.08}
            depthWrite={false}
          />
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

