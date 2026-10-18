import { useRef } from 'react';
import type { Group } from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useExperimentStore } from '../stores/experimentStore';
import { ManualStirAdapter } from '../interactions/ManualStirAdapter';
import {
  clampSpoonXZ,
  computeTipY,
  SPOON_ACTIVE_LENGTH,
  SPOON_ENVELOPE_RADIUS,
} from '../simulation/constants/beaker';

interface StirringRodProps {
  tipY?: number;
  x?: number;
  z?: number;
}

export function StirringRod(props: StirringRodProps) {
  const groupRef = useRef<Group>(null);
  const bridge = useExperimentStore.getState().getBridge();

  const initialPose = bridge
    ? bridge.getRodPose()
    : {
        x: props.x ?? 0.3,
        z: props.z ?? 0,
        tipY: props.tipY ?? computeTipY(0.12),
        theta: 0,
        radius: 0.3,
      };
  const clampedInitial = clampSpoonXZ(initialPose.x, initialPose.z);

  const headHalfHeight = SPOON_ACTIVE_LENGTH / 2;
  const shaftLength = 2.6;
  const shaftCenterY = SPOON_ACTIVE_LENGTH + shaftLength / 2;

  useFrame(() => {
    if (!groupRef.current) return;
    const bridgeInstance = useExperimentStore.getState().getBridge();
    if (!bridgeInstance) return;

    const currentPose = bridgeInstance.getRodPose();
    const clamped = clampSpoonXZ(currentPose.x, currentPose.z);
    groupRef.current.position.set(clamped.x, currentPose.tipY, clamped.z);
    groupRef.current.rotation.y = -currentPose.theta;
  });

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    // Only primary button and mouse pointer type allowed
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    e.stopPropagation();

    const bridgeInstance = useExperimentStore.getState().getBridge();
    const adapter = bridgeInstance?.getManualAdapter();
    if (!adapter) return;

    const ray = ManualStirAdapter.rayFromThree(e.ray);
    const result = adapter.onPointerDown({
      pointerId: e.pointerId,
      ray,
      pointerType: e.pointerType,
      button: e.button,
      isHitSpoon: true,
      inputTimeMs: performance.now(),
    });

    if (result.accepted) {
      bridgeInstance.notifySceneInvalidate();
    }
  };

  return (
    <group
      ref={groupRef}
      position={[clampedInitial.x, initialPose.tipY, clampedInitial.z]}
      rotation={[0, -initialPose.theta, 0]}
      onPointerDown={handlePointerDown}
    >
      <mesh position={[0, shaftCenterY, 0]}>
        <cylinderGeometry args={[0.035, 0.035, shaftLength, 20]} />
        <meshStandardMaterial color="#a9bdc7" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, headHalfHeight, 0]} scale={[SPOON_ENVELOPE_RADIUS, headHalfHeight, 0.055]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial color="#a9bdc7" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}
