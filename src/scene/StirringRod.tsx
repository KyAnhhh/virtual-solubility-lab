import { useEffect, useRef, useState } from 'react';
import type { Group } from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
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
  const haloRef = useRef<Group>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { gl } = useThree();

  const mode = useExperimentStore((s) => s.snapshot.mode);
  const paused = useExperimentStore((s) => s.snapshot.paused);
  const showRod = useExperimentStore((s) => s.showRod);
  const webglStatus = useExperimentStore((s) => s.webglStatus);
  const isPouring = useExperimentStore((s) => Boolean(s.activePour));
  const isDraggingVessel = useExperimentStore((s) => Boolean(s.draggedVessel));

  const isInteractive = mode === 'manual' && !paused && showRod && webglStatus === 'ready' && !isPouring && !isDraggingVessel;

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
  const gripCenterY = SPOON_ACTIVE_LENGTH + shaftLength - 0.25;

  // Cleanup cursor on unmount or when interaction becomes invalid
  useEffect(() => {
    return () => {
      try {
        if (gl?.domElement) {
          gl.domElement.style.cursor = 'auto';
        }
      } catch {
        // Safe guard for unmounting environments
      }
    };
  }, [gl]);

  // Reset hover/drag if mode changes away from manual or paused
  useEffect(() => {
    if (!isInteractive) {
      setIsHovered(false);
      setIsDragging(false);
      if (gl?.domElement) {
        gl.domElement.style.cursor = 'auto';
      }
    }
  }, [isInteractive, gl]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const bridgeInstance = useExperimentStore.getState().getBridge();
    if (!bridgeInstance) return;

    const currentPose = bridgeInstance.getRodPose();
    const clamped = clampSpoonXZ(currentPose.x, currentPose.z);
    groupRef.current.position.set(clamped.x, currentPose.tipY, clamped.z);
    groupRef.current.rotation.y = -currentPose.theta;

    // Check if adapter stopped dragging (watchdog timeout, pointerup, etc.)
    const adapter = bridgeInstance.getManualAdapter();
    const activeDrag = Boolean(adapter && adapter.isDragActive());
    if (isDragging !== activeDrag) {
      setIsDragging(activeDrag);
      if (gl?.domElement) {
        gl.domElement.style.cursor = activeDrag ? 'grabbing' : isHovered ? 'grab' : 'auto';
      }
    }

    // Animate halo rotation during drag
    if (haloRef.current && (isDragging || isHovered)) {
      haloRef.current.rotation.y = state.clock.getElapsedTime() * (isDragging ? 3 : 1);
    }
  });

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (!isInteractive) return;
    if (e.pointerType !== 'mouse') return;
    setIsHovered(true);
    if (!isDragging && gl?.domElement) {
      gl.domElement.style.cursor = 'grab';
    }
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    if (!isInteractive) return;
    if (e.pointerType !== 'mouse') return;
    setIsHovered(false);
    if (!isDragging && gl?.domElement) {
      gl.domElement.style.cursor = 'auto';
    }
  };

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    // Only primary button and mouse pointer type allowed
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (!isInteractive) return;
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
      setIsDragging(true);
      if (gl?.domElement) {
        gl.domElement.style.cursor = 'grabbing';
      }
      bridgeInstance.notifySceneInvalidate();
    }
  };

  // Visual highlight colors
  const rodColor = isDragging ? '#60a5fa' : isHovered ? '#93c5fd' : '#a9bdc7';
  const emissiveColor = isDragging ? '#0284c7' : isHovered ? '#38bdf8' : '#000000';
  const emissiveIntensity = isDragging ? 0.6 : isHovered ? 0.3 : 0;

  return (
    <group
      ref={groupRef}
      position={[clampedInitial.x, initialPose.tipY, clampedInitial.z]}
      rotation={[0, -initialPose.theta, 0]}
    >
      {/* 1. Visible Metallic Shaft */}
      <mesh position={[0, shaftCenterY, 0]}>
        <cylinderGeometry args={[0.035, 0.035, shaftLength, 20]} />
        <meshStandardMaterial
          color={rodColor}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* 2. Visible Ergonomic Grip at Top of Shaft */}
      <mesh position={[0, gripCenterY, 0]}>
        <cylinderGeometry args={[0.046, 0.046, 0.42, 20]} />
        <meshStandardMaterial
          color={mode === 'manual' ? (isDragging ? '#0284c7' : '#0ea5e9') : '#64748b'}
          emissive={isDragging ? '#38bdf8' : isHovered ? '#0284c7' : '#000000'}
          emissiveIntensity={isDragging ? 0.8 : isHovered ? 0.4 : 0}
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>

      {/* 3. Spoon Head Blade */}
      <mesh position={[0, headHalfHeight, 0]} scale={[SPOON_ENVELOPE_RADIUS, headHalfHeight, 0.055]}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshStandardMaterial
          color={rodColor}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* 4. Interactive Visual Halo / Stir Ring when hovered or dragged */}
      {isInteractive && (isHovered || isDragging) && (
        <group ref={haloRef} position={[0, headHalfHeight, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <torusGeometry args={[0.22, 0.015, 16, 32]} />
            <meshBasicMaterial
              color={isDragging ? '#38bdf8' : '#7dd3fc'}
              transparent
              opacity={isDragging ? 0.85 : 0.45}
            />
          </mesh>
        </group>
      )}

      {/* 5. Invisible Generous Hit Target Cylinder (radius 0.15, does not occupy beaker walls R=0.91) */}
      <mesh
        position={[0, shaftCenterY - 0.2, 0]}
        onPointerDown={handlePointerDown}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <cylinderGeometry args={[0.15, 0.15, shaftLength + SPOON_ACTIVE_LENGTH, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

