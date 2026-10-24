import { useRef } from 'react';
import { InstancedMesh, Mesh } from 'three';
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
  const sandBedMeshVolRef = useRef<Mesh>(null);
  const sugarBedMeshVolRef = useRef<Mesh>(null);
  const lastRenderedGenerationRef = useRef<number>(-1);

  const scaleCachesRef = useRef<Record<string, Float32Array>>({
    sandBed: new Float32Array(MAX_POOL_CAPACITY),
    sandSusp: new Float32Array(MAX_POOL_CAPACITY),
    sugarBed: new Float32Array(MAX_POOL_CAPACITY),
    sugarSusp: new Float32Array(MAX_POOL_CAPACITY),
    oilDroplet: new Float32Array(MAX_POOL_CAPACITY),
  });

  const displayedSandBedHeightRef = useRef<number>(0);
  const displayedSugarBedHeightRef = useRef<number>(0);

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
    if (sandBedMeshVolRef.current) {
      sandBedMeshVolRef.current.visible = false;
    }
    if (sugarBedMeshVolRef.current) {
      sugarBedMeshVolRef.current.visible = false;
    }
    Object.values(scaleCachesRef.current).forEach((cache) => cache.fill(0));
    displayedSandBedHeightRef.current = 0;
    displayedSugarBedHeightRef.current = 0;
  };

  useFrame((_state, delta) => {
    const bridge = useExperimentStore.getState().getBridge();
    if (!bridge) return;

    // Dynamically resize target buffers if engine was configured with a higher particle budget
    const budgetPerPool = bridge.getEngine().getParticleBudget();
    const requiredCapacity = budgetPerPool * 5;
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

    const isReset = stamp.generation !== lastRenderedGenerationRef.current;
    if (stamp.generation < lastRenderedGenerationRef.current) {
      zeroAllMeshes();
      return;
    }
    lastRenderedGenerationRef.current = stamp.generation;

    const paused = useExperimentStore.getState().snapshot.paused;
    const effectiveDt = paused ? 0 : Math.min(delta, 0.1);

    // Smooth aggregate bed mesh heights: strictly 0 if sandMass / sugarBedMass < 0.001
    const targetSandHeight = sandMass >= 0.001 ? volumeToHeight(sandMass * VISUAL_ML_PER_GRAM.sand) : 0;
    const targetSugarHeight = sugarBedMass >= 0.001 ? volumeToHeight(sugarBedMass * VISUAL_ML_PER_GRAM.sugar) : 0;
    const bedBottom = regions ? regions.bed.bottom : 0.12;

    if (isReset || sandMass < 0.001) {
      displayedSandBedHeightRef.current = targetSandHeight;
    } else if (effectiveDt > 0) {
      const hLerp = Math.min(1, effectiveDt * 10);
      displayedSandBedHeightRef.current += (targetSandHeight - displayedSandBedHeightRef.current) * hLerp;
    }

    if (isReset || sugarBedMass < 0.001) {
      displayedSugarBedHeightRef.current = targetSugarHeight;
    } else if (effectiveDt > 0) {
      const hLerp = Math.min(1, effectiveDt * 10);
      displayedSugarBedHeightRef.current += (targetSugarHeight - displayedSugarBedHeightRef.current) * hLerp;
    }

    const curSandH = displayedSandBedHeightRef.current;
    const curSugarH = displayedSugarBedHeightRef.current;

    if (sandBedMeshVolRef.current) {
      if (sandMass >= 0.001 && curSandH > 0.001) {
        sandBedMeshVolRef.current.visible = true;
        sandBedMeshVolRef.current.position.set(0, bedBottom + curSandH / 2, 0);
        sandBedMeshVolRef.current.scale.set(1, curSandH, 1);
      } else {
        sandBedMeshVolRef.current.visible = false;
      }
    }

    if (sugarBedMeshVolRef.current) {
      if (sugarBedMass >= 0.001 && curSugarH > 0.001) {
        sugarBedMeshVolRef.current.visible = true;
        const curSugarBase = bedBottom + curSandH;
        sugarBedMeshVolRef.current.position.set(0, curSugarBase + curSugarH / 2, 0);
        sugarBedMeshVolRef.current.scale.set(1, curSugarH, 1);
      } else {
        sugarBedMeshVolRef.current.visible = false;
      }
    }

    if (stamp.count === 0) {
      if (sandBedMeshRef.current) { sandBedMeshRef.current.count = 0; sandBedMeshRef.current.instanceMatrix.needsUpdate = true; }
      if (sandSuspMeshRef.current) { sandSuspMeshRef.current.count = 0; sandSuspMeshRef.current.instanceMatrix.needsUpdate = true; }
      if (sugarBedMeshRef.current) { sugarBedMeshRef.current.count = 0; sugarBedMeshRef.current.instanceMatrix.needsUpdate = true; }
      if (sugarSuspMeshRef.current) { sugarSuspMeshRef.current.count = 0; sugarSuspMeshRef.current.instanceMatrix.needsUpdate = true; }
      if (oilDropletMeshRef.current) { oilDropletMeshRef.current.count = 0; oilDropletMeshRef.current.instanceMatrix.needsUpdate = true; }
      Object.values(scaleCachesRef.current).forEach((cache) => cache.fill(0));
      return;
    }

    const caches = scaleCachesRef.current;

    // 1. Sand bed particles
    updatePoolInstancedMesh(
      sandBedMeshRef.current,
      stamp.poolRanges.sandBed,
      target,
      PARTICLE_RADIUS.sand,
      'sandBed',
      caches.sandBed,
      effectiveDt,
      isReset
    );

    // 2. Suspended sand particles
    updatePoolInstancedMesh(
      sandSuspMeshRef.current,
      stamp.poolRanges.sandSusp,
      target,
      PARTICLE_RADIUS.sand,
      'sandSusp',
      caches.sandSusp,
      effectiveDt,
      isReset
    );

    // 3. Sugar bed particles
    updatePoolInstancedMesh(
      sugarBedMeshRef.current,
      stamp.poolRanges.sugarBed,
      target,
      PARTICLE_RADIUS.sugar,
      'sugarBed',
      caches.sugarBed,
      effectiveDt,
      isReset
    );

    // 4. Suspended sugar particles
    updatePoolInstancedMesh(
      sugarSuspMeshRef.current,
      stamp.poolRanges.sugarSusp,
      target,
      PARTICLE_RADIUS.sugar,
      'sugarSusp',
      caches.sugarSusp,
      effectiveDt,
      isReset
    );

    // 5. Dispersed oil droplets
    updatePoolInstancedMesh(
      oilDropletMeshRef.current,
      stamp.poolRanges.oilDroplet,
      target,
      PARTICLE_RADIUS_OIL_DROPLET,
      'oilDroplet',
      caches.oilDroplet,
      effectiveDt,
      isReset
    );
  });

  return (
    <group>
      {/* 1. Sand Bed Bulk Sediment Volume (unit cylinder with dynamic Y-scaling) */}
      <mesh ref={sandBedMeshVolRef} visible={false} renderOrder={1} raycast={() => null}>
        <cylinderGeometry args={[0.865, 0.865, 1, 64]} />
        <meshStandardMaterial color="#c29452" roughness={0.95} transparent opacity={0.65} />
      </mesh>

      {/* 2. Sugar Bed Bulk Sediment Volume */}
      <mesh ref={sugarBedMeshVolRef} visible={false} renderOrder={1} raycast={() => null}>
        <cylinderGeometry args={[0.865, 0.865, 1, 64]} />
        <meshStandardMaterial color="#ede8db" roughness={0.85} transparent opacity={0.65} />
      </mesh>

      {/* 3. Sand Bed Particles */}
      <instancedMesh
        ref={sandBedMeshRef}
        count={0}
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
        count={0}
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
        count={0}
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
        count={0}
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
        count={0}
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
