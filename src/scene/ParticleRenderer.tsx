import { useRef } from 'react';
import { InstancedMesh } from 'three';
import { useFrame } from '@react-three/fiber';
import { useExperimentStore } from '../stores/experimentStore';
import { VISUAL_ML_PER_GRAM } from '../simulation/constants/ingredients';
import {
  PARTICLE_RADIUS,
  volumeToHeight,
  type BeakerRegions,
} from '../simulation/constants/beaker';
import { PARTICLE_RADIUS_OIL_DROPLET } from '../simulation/models/ParticleTransport';
import type {
  RenderTarget,
  RenderStamp,
} from '../simulation/core/SimulationState';

import {
  updatePoolInstancedMesh,
  MAX_POOL_CAPACITY,
  MAX_BUFFER_CAPACITY,
} from './particleMeshHelpers';

export interface ParticleRendererProps {
  regions?: BeakerRegions;
  sandMass?: number;
  sugarBedMass?: number;
}

export function ParticleRenderer({
  regions,
  sandMass = 0,
  sugarBedMass = 0,
}: ParticleRendererProps) {
  const sandBedMeshRef = useRef<InstancedMesh>(null);
  const sandSuspMeshRef = useRef<InstancedMesh>(null);
  const sugarBedMeshRef = useRef<InstancedMesh>(null);
  const sugarSuspMeshRef = useRef<InstancedMesh>(null);
  const oilDropletMeshRef = useRef<InstancedMesh>(null);
  const lastRenderedGenerationRef = useRef<number>(-1);

  // Pre-allocated caller-owned reusable buffers, isolated from Zustand and engine private arrays
  const targetRef = useRef<RenderTarget & { radii: Float32Array; poolIds: Uint8Array }>({
    positions: new Float32Array(MAX_BUFFER_CAPACITY * 3),
    weights: new Float32Array(MAX_BUFFER_CAPACITY),
    materials: new Uint8Array(MAX_BUFFER_CAPACITY),
    radii: new Float32Array(MAX_BUFFER_CAPACITY),
    poolIds: new Uint8Array(MAX_BUFFER_CAPACITY),
    count: MAX_BUFFER_CAPACITY,
  });

  const zeroAllMeshes = () => {
    if (sandBedMeshRef.current) {
      sandBedMeshRef.current.count = 0;
      sandBedMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (sandSuspMeshRef.current) {
      sandSuspMeshRef.current.count = 0;
      sandSuspMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (sugarBedMeshRef.current) {
      sugarBedMeshRef.current.count = 0;
      sugarBedMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (sugarSuspMeshRef.current) {
      sugarSuspMeshRef.current.count = 0;
      sugarSuspMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (oilDropletMeshRef.current) {
      oilDropletMeshRef.current.count = 0;
      oilDropletMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  };

  useFrame(() => {
    const bridge = useExperimentStore.getState().getBridge();
    if (!bridge) return;

    // Dynamically resize target buffers if engine was configured with a higher particle budget
    const budgetPerPool = bridge.getEngine().getParticleBudget();
    const requiredCapacity = budgetPerPool * 5;
    // Capacity must be derived from underlying array length (radii.length) rather than ambiguous active count
    if (targetRef.current.radii.length < requiredCapacity) {
      targetRef.current = {
        positions: new Float32Array(requiredCapacity * 3),
        weights: new Float32Array(requiredCapacity),
        materials: new Uint8Array(requiredCapacity),
        radii: new Float32Array(requiredCapacity),
        poolIds: new Uint8Array(requiredCapacity),
        count: requiredCapacity,
      };
    }

    const target = targetRef.current;
    let stamp: RenderStamp;
    try {
      stamp = bridge.copyRenderFrame(target);
    } catch (err) {
      console.error('[ParticleRenderer] copyRenderFrame failed:', err);
      zeroAllMeshes();
      return;
    }

    if (!stamp || !stamp.poolRanges) {
      zeroAllMeshes();
      return;
    }

    // Authoritative generation check: reject stale frames from an older generation
    if (stamp.generation < lastRenderedGenerationRef.current) {
      zeroAllMeshes();
      return;
    }
    lastRenderedGenerationRef.current = stamp.generation;

    // If simulation reset or empty beaker, zero all instances immediately (even while paused)
    if (stamp.count === 0) {
      zeroAllMeshes();
      return;
    }

    // 1. Sand bed particles (using science constant PARTICLE_RADIUS.sand = 0.026)
    updatePoolInstancedMesh(sandBedMeshRef.current, stamp.poolRanges.sandBed, target, PARTICLE_RADIUS.sand, 'sandBed');

    // 2. Suspended sand particles swirling in fluid (PARTICLE_RADIUS.sand = 0.026)
    updatePoolInstancedMesh(sandSuspMeshRef.current, stamp.poolRanges.sandSusp, target, PARTICLE_RADIUS.sand, 'sandSusp');

    // 3. Sugar bed particles (PARTICLE_RADIUS.sugar = 0.022)
    updatePoolInstancedMesh(sugarBedMeshRef.current, stamp.poolRanges.sugarBed, target, PARTICLE_RADIUS.sugar, 'sugarBed');

    // 4. Suspended sugar particles swirling in fluid (PARTICLE_RADIUS.sugar = 0.022)
    updatePoolInstancedMesh(sugarSuspMeshRef.current, stamp.poolRanges.sugarSusp, target, PARTICLE_RADIUS.sugar, 'sugarSusp');

    // 5. Dispersed oil droplets swirling in aqueous carrier (PARTICLE_RADIUS_OIL_DROPLET = 0.028)
    updatePoolInstancedMesh(oilDropletMeshRef.current, stamp.poolRanges.oilDroplet, target, PARTICLE_RADIUS_OIL_DROPLET, 'oilDroplet');
  });

  // Calculate bed volume layers if regions provided
  const sandBedHeight = sandMass >= 0.001 ? volumeToHeight(sandMass * VISUAL_ML_PER_GRAM.sand) : 0;
  const sugarBedHeight =
    sugarBedMass >= 0.001 ? volumeToHeight(sugarBedMass * VISUAL_ML_PER_GRAM.sugar) : 0;
  const bedBottom = regions ? regions.bed.bottom : 0.12;
  const sugarBase = bedBottom + sandBedHeight;

  return (
    <group>
      {/* 1. Sand Bed Bulk Sediment Volume (aggregate representation) */}
      {sandBedHeight > 0.001 && (
        <mesh position={[0, bedBottom + sandBedHeight / 2, 0]} renderOrder={1} raycast={() => null}>
          <cylinderGeometry args={[0.865, 0.865, sandBedHeight, 64]} />
          <meshStandardMaterial color="#c29452" roughness={0.95} transparent opacity={0.65} />
        </mesh>
      )}

      {/* 2. Sugar Bed Bulk Sediment Volume */}
      {sugarBedHeight > 0.001 && (
        <mesh position={[0, sugarBase + sugarBedHeight / 2, 0]} renderOrder={1} raycast={() => null}>
          <cylinderGeometry args={[0.865, 0.865, sugarBedHeight, 64]} />
          <meshStandardMaterial color="#ede8db" roughness={0.85} transparent opacity={0.65} />
        </mesh>
      )}

      {/* 3. Sand Bed Particles */}
      <instancedMesh
        ref={sandBedMeshRef}
        args={[undefined, undefined, MAX_POOL_CAPACITY]}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={1}
      >
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#c89650" roughness={0.9} depthWrite={true} />
      </instancedMesh>

      {/* 4. Suspended Sand Particles (swirling with transport) */}
      <instancedMesh
        ref={sandSuspMeshRef}
        args={[undefined, undefined, MAX_POOL_CAPACITY]}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={1}
      >
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#d9a35a" roughness={0.85} depthWrite={true} />
      </instancedMesh>

      {/* 5. Sugar Bed Particles */}
      <instancedMesh
        ref={sugarBedMeshRef}
        args={[undefined, undefined, MAX_POOL_CAPACITY]}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={1}
      >
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#f0ede6" roughness={0.5} metalness={0.1} depthWrite={true} />
      </instancedMesh>

      {/* 6. Suspended Sugar Particles (swirling with transport and dissolving) */}
      <instancedMesh
        ref={sugarSuspMeshRef}
        args={[undefined, undefined, MAX_POOL_CAPACITY]}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={1}
      >
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.2}
          metalness={0.15}
          transparent
          opacity={0.92}
          depthWrite={true}
        />
      </instancedMesh>

      {/* 7. Dispersed Oil Droplets (swirling and rising in water) */}
      <instancedMesh
        ref={oilDropletMeshRef}
        args={[undefined, undefined, MAX_POOL_CAPACITY]}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={1}
      >
        <sphereGeometry args={[1, 14, 10]} />
        <meshPhysicalMaterial
          color="#f59e0b"
          roughness={0.15}
          metalness={0.05}
          transparent
          opacity={0.85}
          depthWrite={true}
        />
      </instancedMesh>
    </group>
  );
}
