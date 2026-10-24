import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DoubleSide,
  Group,
  InstancedMesh,
  Object3D,
  Plane,
  Vector3,
} from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { DraggedVesselState, IngredientId } from '../types/experiment';
import { Beaker } from './Beaker';
import { BEAKER_BASE_Y } from '../simulation/constants/beaker';
import { INGREDIENTS, formatDeciTicks } from '../simulation/constants/ingredients';
import { useExperimentStore } from '../stores/experimentStore';
import {
  computeCancelReturnTransform,
  computeDropPourTransform,
  computeFallingParticle,
  computeSpoutPosition,
  computeVesselTransform,
  DROP_POUR_DURATIONS,
  DROP_ZONE_VISUAL_CENTER,
  DROP_ZONE_VISUAL_RADIUS,
  POUR_DURATIONS,
  SPOUT_TARGET,
  type VesselTransform,
} from './pouringAnimationMath';

export interface StockVesselConfig {
  readonly id: IngredientId;
  readonly name: string;
  readonly tag: string;
  readonly color: string;
  readonly position: readonly [number, number, number];
  readonly fillRatio: number;
}

export const STOCK_VESSEL_RADIUS = 0.38;
export const STOCK_VESSEL_HEIGHT = 1.05;

/**
 * Spaced spatial layout for the 4 stock reagent vessels on the lab table.
 * Each vessel has >= 1.1 units of separation in Z to eliminate label crowding.
 * Leaves open space around the 500ml experiment beaker (radius 0.91).
 */
export const STOCK_VESSELS_CONFIG: readonly StockVesselConfig[] = [
  {
    id: 'water',
    name: 'Nước',
    tag: 'Chất lỏng',
    color: '#66bce0',
    position: [-2.6, 0, -1.1],
    fillRatio: 0.72,
  },
  {
    id: 'sugar',
    name: 'Đường',
    tag: 'Hạt tinh thể',
    color: '#e8e3d4',
    position: [-2.8, 0, 0.0],
    fillRatio: 0.70,
  },
  {
    id: 'sand',
    name: 'Cát',
    tag: 'Hạt khoáng',
    color: '#c89757',
    position: [-2.6, 0, 1.2],
    fillRatio: 0.70,
  },
  {
    id: 'oil',
    name: 'Dầu ăn',
    tag: 'Chất lỏng',
    color: '#e4bd49',
    position: [-2.2, 0, 2.3],
    fillRatio: 0.72,
  },
] as const;

const STATIC_GRAIN_COUNT = 96;

interface StaticGrainData {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotX: number;
  rotY: number;
  rotZ: number;
}

/**
 * Pre-computes 96 deterministic crystal/sand grain facets:
 * - 48 grains scattered over the top mound surface.
 * - 48 grains lining the inside of the glass wall so crystalline structure
 *   is clearly visible through the glass (eliminates any milky-liquid appearance!).
 */
function generateStaticGrains(type: 'sugar' | 'sand'): StaticGrainData[] {
  return Array.from({ length: STATIC_GRAIN_COUNT }, (_, i) => {
    if (i < 48) {
      // Zone A: Surface mound grains
      const angle = i * 2.39996; // Golden angle
      const r = 0.04 + 0.28 * Math.sqrt((i + 1) / 48);
      const x = r * Math.cos(angle);
      const z = r * Math.sin(angle);
      const coneProfile = Math.max(0, 1 - r / 0.34) * 0.18;
      const y = 0.04 + 0.32 + coneProfile + 0.015 * Math.sin(i * 3.7);
      const scale = (type === 'sugar' ? 0.042 : 0.034) * (0.8 + 0.4 * Math.cos(i * 2.1));
      return { x, y, z, scale, rotX: i * 0.7, rotY: i * 1.2, rotZ: i * 0.5 };
    } else {
      // Zone B: Perimeter grains pressed against the glass wall
      const k = i - 48;
      const angle = k * 1.35;
      const r = 0.325 + 0.015 * Math.sin(k * 2.7);
      const x = r * Math.cos(angle);
      const z = r * Math.sin(angle);
      const y = 0.08 + (k / 48) * 0.40;
      const scale = (type === 'sugar' ? 0.038 : 0.030) * (0.85 + 0.3 * Math.cos(k * 1.9));
      return { x, y, z, scale, rotX: k * 0.9, rotY: k * 1.4, rotZ: k * 0.6 };
    }
  });
}

const SUGAR_GRAINS = generateStaticGrains('sugar');
const SAND_GRAINS = generateStaticGrains('sand');

interface SingleStockVesselProps {
  config: StockVesselConfig;
  transform: VesselTransform;
  isActive: boolean;
  isHovered: boolean;
  isDragged: boolean;
  doseText?: string;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}

function SingleStockVessel({
  config,
  transform,
  isActive,
  isHovered,
  isDragged,
  doseText,
  onPointerOver,
  onPointerOut,
  onPointerDown,
}: SingleStockVesselProps) {
  const { id, name, tag, color, fillRatio } = config;
  const contentRadius = STOCK_VESSEL_RADIUS - 0.025; // 0.355
  const isFluid = id === 'water' || id === 'oil';
  const Hv = STOCK_VESSEL_HEIGHT; // 1.05
  const R = contentRadius; // 0.355
  const h0 = Hv * fillRatio; // resting fluid height e.g. 1.05 * 0.72 = 0.756
  const tilt = Math.abs(transform.rotationZ); // tilt in radians >= 0

  // Central liquid height along cylinder axis
  // As vessel tilts, fluid rises on spout side: y_max = hc + R * tan(tilt)
  // When liquid touches the spout rim Hv, it is pinned to the rim: hc = Hv - R * tan(tilt)
  const tanTilt = Math.tan(tilt);
  let hc = h0;
  if (h0 + R * tanTilt > Hv) {
    hc = Math.max(0.18, Hv - R * tanTilt);
  }
  // During active pouring, liquid level inside the stock vessel decreases smoothly
  if (transform.isPouringStream) {
    hc = Math.max(0.18, hc - 0.10 * transform.streamProgress);
  } else if (isActive && transform.streamProgress > 0) {
    hc = Math.max(0.18, hc - 0.10);
  }

  // World-space clipping plane
  // Center of liquid surface in local space is at (0, 0.04 + hc, 0).
  // In world space, with rotation -tilt around Z and base Y translation:
  const worldSurfaceY = transform.position[1] + (0.04 + hc) * Math.cos(tilt);
  const clipPlane = useMemo(() => new Plane(new Vector3(0, -1, 0), 0), []);
  clipPlane.normal.set(0, -1, 0);
  clipPlane.constant = worldSurfaceY;

  // Meniscus disc horizontal scaling along tilt direction
  // Intersection of circular cylinder of radius R cut at angle tilt is an ellipse:
  // Semi-minor axis (along Z) is R; semi-major axis (along tilt slope) is R / cos(tilt).
  const cosTilt = Math.max(0.001, Math.cos(tilt));
  const ellipseScaleX = Math.min(1.75, 1 / cosTilt);

  // Instanced mesh refs for sugar crystals and sand grains
  const sugarMeshRef = useRef<InstancedMesh>(null);
  const sandMeshRef = useRef<InstancedMesh>(null);

  // Initialize static instanced matrices on mount
  useMemo(() => {
    const dummy = new Object3D();
    if (id === 'sugar') {
      setTimeout(() => {
        if (!sugarMeshRef.current) return;
        SUGAR_GRAINS.forEach((pt, idx) => {
          dummy.position.set(pt.x, pt.y, pt.z);
          dummy.rotation.set(pt.rotX, pt.rotY, pt.rotZ);
          dummy.scale.setScalar(pt.scale);
          dummy.updateMatrix();
          sugarMeshRef.current?.setMatrixAt(idx, dummy.matrix);
        });
        sugarMeshRef.current.instanceMatrix.needsUpdate = true;
      }, 0);
    } else if (id === 'sand') {
      setTimeout(() => {
        if (!sandMeshRef.current) return;
        SAND_GRAINS.forEach((pt, idx) => {
          dummy.position.set(pt.x, pt.y, pt.z);
          dummy.rotation.set(pt.rotX, pt.rotY, pt.rotZ);
          dummy.scale.setScalar(pt.scale);
          dummy.updateMatrix();
          sandMeshRef.current?.setMatrixAt(idx, dummy.matrix);
        });
        sandMeshRef.current.instanceMatrix.needsUpdate = true;
      }, 0);
    }
  }, [id]);

  return (
    <group position={transform.position} rotation={[0, 0, transform.rotationZ]}>
      {/* 0. Invisible grab hit target for easy mouse dragging */}
      <mesh
        position={[0, 0.04 + Hv / 2, 0]}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onPointerDown={onPointerDown}
      >
        <cylinderGeometry args={[STOCK_VESSEL_RADIUS + 0.06, STOCK_VESSEL_RADIUS + 0.06, Hv + 0.15, 16]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* 1. Scaled transparent glass beaker without graduations */}
      <Beaker
        radius={STOCK_VESSEL_RADIUS}
        height={STOCK_VESSEL_HEIGHT}
        showGraduations={false}
        opacity={0.18}
      />

      {/* 2. Visual substance content inside vessel */}
      {isFluid && (
        <group>
          {/* Liquid column cylinder: strictly aligned with vessel inside glass walls */}
          <mesh position={[0, 0.04 + Hv / 2, 0]} raycast={() => null}>
            <cylinderGeometry args={[contentRadius, contentRadius, Hv, 48]} />
            <meshPhysicalMaterial
              color={id === 'water' ? '#38bdf8' : '#f59e0b'}
              transparent
              opacity={id === 'water' ? 0.46 : 0.72}
              roughness={id === 'water' ? 0.03 : 0.12}
              metalness={0.02}
              clippingPlanes={[clipPlane]}
              clipShadows={true}
              side={DoubleSide}
              depthWrite={false}
            />
          </mesh>

          {/* Meniscus surface disc: placed at hc, rotated +tilt so normal is (0,1,0) horizontal in world space */}
          <group position={[0, 0.04 + hc, 0]} rotation={[0, 0, tilt]}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              scale={[ellipseScaleX, 1, 1]}
              raycast={() => null}
            >
              <circleGeometry args={[contentRadius - 0.002, 48]} />
              <meshStandardMaterial
                color={id === 'water' ? '#7dd3fc' : '#fbbf24'}
                transparent
                opacity={id === 'water' ? 0.75 : 0.82}
                roughness={id === 'water' ? 0.04 : 0.10}
                side={DoubleSide}
                depthWrite={false}
              />
            </mesh>
            {/* Subtle meniscus edge ring highlight */}
            <mesh
              position={[0, 0.001, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              scale={[ellipseScaleX, 1, 1]}
              raycast={() => null}
            >
              <ringGeometry args={[contentRadius - 0.02, contentRadius - 0.002, 48]} />
              <meshBasicMaterial
                color={id === 'water' ? '#bae6fd' : '#fde047'}
                transparent
                opacity={id === 'water' ? 0.85 : 0.70}
                side={DoubleSide}
              />
            </mesh>
          </group>
        </group>
      )}

      {id === 'sugar' && (
        <group>
          {/* Sugar core: unbleached ivory granular base, NOT milky white liquid! */}
          <mesh position={[0, 0.04 + 0.32 / 2, 0]} raycast={() => null}>
            <cylinderGeometry args={[contentRadius - 0.015, contentRadius - 0.015, 0.32, 16]} />
            <meshStandardMaterial color="#e8e2d4" roughness={0.96} metalness={0.0} />
          </mesh>
          {/* Irregular granular mound top */}
          <mesh position={[0, 0.04 + 0.32 + 0.09, 0]} raycast={() => null}>
            <coneGeometry args={[contentRadius - 0.01, 0.18, 16]} />
            <meshStandardMaterial color="#f2ede4" roughness={0.95} metalness={0.0} />
          </mesh>
          {/* 96 Instanced crystalline sugar grains with specular facets and glints */}
          <instancedMesh
            ref={sugarMeshRef}
            args={[undefined, undefined, STATIC_GRAIN_COUNT]}
            raycast={() => null}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial
              color="#ffffff"
              roughness={0.35}
              metalness={0.08}
            />
          </instancedMesh>
        </group>
      )}

      {id === 'sand' && (
        <group>
          {/* Sand sediment bed: warm earthy golden-brown texture */}
          <mesh position={[0, 0.04 + 0.32 / 2, 0]} raycast={() => null}>
            <cylinderGeometry args={[contentRadius - 0.015, contentRadius - 0.015, 0.32, 16]} />
            <meshStandardMaterial color="#b5894b" roughness={0.98} metalness={0.0} />
          </mesh>
          {/* Rough conical sand mound top */}
          <mesh position={[0, 0.04 + 0.32 + 0.09, 0]} raycast={() => null}>
            <coneGeometry args={[contentRadius - 0.01, 0.18, 16]} />
            <meshStandardMaterial color="#a07436" roughness={0.98} metalness={0.0} />
          </mesh>
          {/* 96 Instanced matte sand grains */}
          <instancedMesh
            ref={sandMeshRef}
            args={[undefined, undefined, STATIC_GRAIN_COUNT]}
            raycast={() => null}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial
              color="#bf9659"
              roughness={0.96}
            />
          </instancedMesh>
        </group>
      )}

      {/* 3. Reagent name label card floating above vessel rim */}
      <Html
        position={[0, STOCK_VESSEL_HEIGHT + 0.16, 0]}
        center
        distanceFactor={7.5}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <div
          style={{
            background: isActive || isDragged ? '#0284c7' : isHovered ? 'rgba(240, 249, 255, 0.98)' : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(4px)',
            border: `1.5px solid ${isActive || isDragged || isHovered ? '#38bdf8' : color}`,
            boxShadow: isActive || isDragged
              ? '0 0 14px rgba(2, 132, 199, 0.50)'
              : isHovered
              ? '0 0 10px rgba(56, 189, 248, 0.40)'
              : '0 2px 6px rgba(0, 0, 0, 0.08)',
            borderRadius: '10px',
            padding: '3px 8px',
            color: isActive || isDragged ? '#ffffff' : '#1e293b',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            lineHeight: 1.2,
            transition: 'all 0.15s ease',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isActive || isDragged ? '#ffffff' : color,
              border: '1px solid rgba(0, 0, 0, 0.12)',
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', fontWeight: 700 }}>
              {isActive
                ? 'Đang rót...'
                : isDragged
                ? `Đang kéo · ${doseText ?? ''}`
                : isHovered
                ? `${name} · ${doseText ?? ''}`
                : name}
            </span>
            {!isActive && !isDragged && !isHovered && (
              <span style={{ fontSize: '8.5px', color: '#64748b', fontWeight: 500 }}>
                {tag}
              </span>
            )}
          </div>
        </div>
      </Html>
    </group>
  );
}

const STREAM_PARTICLE_COUNT = 32;

interface PouringStreamProps {
  ingredient: IngredientId;
  liquidTop: number;
  elapsedPourTime: number;
  spoutPos?: readonly [number, number, number];
}

/**
 * PouringStream
 * Renders the visible pouring stream into the 500ml beaker during the pour phase.
 * Originates directly from the tilted spout hovering at (-0.50, 2.70, 0.0) above the beaker.
 * Liquid ribbon for water/oil; discrete falling instanced particles for sugar/sand.
 */
function PouringStream({ ingredient, liquidTop, elapsedPourTime, spoutPos }: PouringStreamProps) {
  const particlesRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  const targetY = Math.max(0.15, liquidTop);
  const activeSpout = spoutPos ?? ([SPOUT_TARGET.x, SPOUT_TARGET.y - 0.05, SPOUT_TARGET.z] as const);

  // Liquid ribbon geometry calculations for water / oil
  const isLiquid = ingredient === 'water' || ingredient === 'oil';
  const startX = activeSpout[0];
  const startY = activeSpout[1];
  const startZ = activeSpout[2];
  const endX = -0.38;
  const endY = targetY;
  const endZ = 0;

  const dx = endX - startX;
  const dy = endY - startY;
  const dz = endZ - startZ;
  const streamLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const angleZ = -Math.atan2(dx, -dy);
  const centerX = (startX + endX) / 2;
  const centerY = (startY + endY) / 2;
  const centerZ = (startZ + endZ) / 2;

  // Update discrete tumbling particles for sugar / sand each frame
  useFrame(() => {
    if (isLiquid || !particlesRef.current) return;

    for (let i = 0; i < STREAM_PARTICLE_COUNT; i++) {
      const state = computeFallingParticle(i, STREAM_PARTICLE_COUNT, elapsedPourTime, targetY, activeSpout);
      if (state.visible) {
        dummy.position.set(state.x, state.y, state.z);
        dummy.rotation.set(i * 1.5 + elapsedPourTime * 5, i * 2.2, i * 0.9);
        dummy.scale.setScalar(state.scale * 0.038);
      } else {
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      particlesRef.current.setMatrixAt(i, dummy.matrix);
    }
    particlesRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {/* 1. Continuous Liquid Stream for Water & Oil */}
      {isLiquid && (
        <group>
          {/* Tapered liquid cylinder stream */}
          <mesh
            position={[centerX, centerY, centerZ]}
            rotation={[0, 0, angleZ]}
            renderOrder={4}
            raycast={() => null}
          >
            <cylinderGeometry
              args={[
                ingredient === 'oil' ? 0.026 : 0.020,
                ingredient === 'oil' ? 0.016 : 0.012,
                streamLength,
                16,
              ]}
            />
            <meshPhysicalMaterial
              color={ingredient === 'oil' ? '#f59e0b' : '#38bdf8'}
              transparent
              opacity={ingredient === 'oil' ? 0.82 : 0.65}
              roughness={0.03}
              depthWrite={false}
            />
          </mesh>

          {/* Impact surface ripple ring on liquid inside beaker */}
          <mesh
            position={[endX, endY + 0.005, endZ]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={4}
            raycast={() => null}
          >
            <ringGeometry args={[0.02, 0.08, 20]} />
            <meshBasicMaterial
              color={ingredient === 'oil' ? '#fbbf24' : '#7dd3fc'}
              transparent
              opacity={0.60}
              side={DoubleSide}
            />
          </mesh>
        </group>
      )}

      {/* 2. Discrete Falling Particles for Sugar & Sand */}
      {!isLiquid && (
        <instancedMesh
          ref={particlesRef}
          args={[undefined, undefined, STREAM_PARTICLE_COUNT]}
          renderOrder={4}
          raycast={() => null}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color={ingredient === 'sugar' ? '#ffffff' : '#c29b62'}
            roughness={ingredient === 'sugar' ? 0.35 : 0.95}
            metalness={ingredient === 'sugar' ? 0.08 : 0.0}
          />
        </instancedMesh>
      )}
    </group>
  );
}

function DropZoneIndicator({ isActive, activeText }: { isActive: boolean; activeText?: string }) {
  const haloRef = useRef<Group>(null);

  useFrame((_, delta) => {
    if (haloRef.current) {
      haloRef.current.rotation.y += delta * (isActive ? 2.5 : 0.8);
    }
  });

  return (
    <group position={[DROP_ZONE_VISUAL_CENTER.x, DROP_ZONE_VISUAL_CENTER.y, DROP_ZONE_VISUAL_CENTER.z]}>
      {/* Outer pulsing ring */}
      <group ref={haloRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[DROP_ZONE_VISUAL_RADIUS.inner, DROP_ZONE_VISUAL_RADIUS.outer, 32]} />
          <meshBasicMaterial
            color={isActive ? '#10b981' : '#38bdf8'}
            transparent
            opacity={isActive ? 0.75 : 0.35}
            side={DoubleSide}
          />
        </mesh>
        {/* Cardinal tick markers */}
        {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((rot, i) => (
          <mesh key={i} rotation={[0, rot, 0]} position={[DROP_ZONE_VISUAL_RADIUS.outer + 0.03, 0, 0]}>
            <boxGeometry args={[0.08, 0.015, 0.02]} />
            <meshBasicMaterial color={isActive ? '#34d399' : '#7dd3fc'} />
          </mesh>
        ))}
      </group>

      {/* Floating guidance badge */}
      <Html
        position={[0, 0.45, 0]}
        center
        distanceFactor={7.5}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <div
          style={{
            background: isActive ? '#059669' : 'rgba(15, 23, 42, 0.85)',
            color: '#ffffff',
            padding: '4px 10px',
            borderRadius: '16px',
            fontSize: '11px',
            fontWeight: 700,
            boxShadow: isActive
              ? '0 0 16px rgba(16, 185, 129, 0.6)'
              : '0 2px 8px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            border: `1.5px solid ${isActive ? '#34d399' : '#38bdf8'}`,
            transition: 'all 0.15s ease',
          }}
        >
          <span>{isActive ? '✓' : '⬇'}</span>
          <span>{isActive ? (activeText ?? 'Thả chuột để rót') : 'Kéo cốc tới đây để rót'}</span>
        </div>
      </Html>
    </group>
  );
}

export interface IngredientVesselsProps {
  liquidTop?: number;
}

export function IngredientVessels({ liquidTop = BEAKER_BASE_Y + 0.1 }: IngredientVesselsProps) {
  const activePour = useExperimentStore((s) => s.activePour);
  const commitPour = useExperimentStore((s) => s.commitPour);
  const finishPour = useExperimentStore((s) => s.finishPour);
  const draggedVessel = useExperimentStore((s) => s.draggedVessel);
  const inputDoses = useExperimentStore((s) => s.inputDoses);
  const pourMode = useExperimentStore((s) => s.pourMode);
  const { invalidate, gl } = useThree();

  const [hoveredVessel, setHoveredVessel] = useState<IngredientId | null>(null);
  const [cancelAnim, setCancelAnim] = useState<{
    id: IngredientId;
    startPos: [number, number, number];
    startTime: number;
  } | null>(null);
  const prevDraggedRef = useRef<DraggedVesselState | null>(null);

  // Trigger smooth cancel animation when a drag stops without an active pour
  useEffect(() => {
    if (prevDraggedRef.current && !draggedVessel && !activePour) {
      setCancelAnim({
        id: prevDraggedRef.current.ingredient,
        startPos: [...prevDraggedRef.current.position],
        startTime: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      });
    }
    prevDraggedRef.current = draggedVessel;
  }, [draggedVessel, activePour]);

  // Clean cursor on unmount
  useEffect(() => {
    return () => {
      try {
        if (gl?.domElement) gl.domElement.style.cursor = 'auto';
      } catch {
        // Safe unmount
      }
    };
  }, [gl]);

  // Invalidate R3F frames continuously while a pour animation or drag/cancel is active
  useFrame(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const bridge = useExperimentStore.getState().getBridge();
    const adapter = bridge.getVesselAdapter();

    // Step free pour physics and batch accumulation
    if (adapter && draggedVessel && draggedVessel.mode === 'free') {
      adapter.stepFreePour(now);
      invalidate();
    }

    // Dynamic cursor management
    if (gl?.domElement) {
      if (draggedVessel) {
        gl.domElement.style.cursor = 'grabbing';
      } else if (hoveredVessel && !activePour) {
        gl.domElement.style.cursor = 'grab';
      } else if (!hoveredVessel) {
        const rodDrag = useExperimentStore.getState().getBridge().getManualAdapter()?.isDragActive();
        if (!rodDrag) {
          gl.domElement.style.cursor = 'auto';
        }
      }
    }

    if (cancelAnim) {
      invalidate();
      if ((now - cancelAnim.startTime) / 1000 >= 0.35) {
        setCancelAnim(null);
      }
    }

    if (draggedVessel) {
      invalidate();
    }

    if (!activePour) return;

    // Demand rendering keep-alive for animation duration
    invalidate();

    const elapsed = (now - activePour.startTime) / 1000;
    const isDrop = Boolean(activePour.fromDrop && activePour.dropPos);
    const commitTime = isDrop ? DROP_POUR_DURATIONS.commitTime : POUR_DURATIONS.commitTime;
    const totalTime = isDrop ? DROP_POUR_DURATIONS.total : POUR_DURATIONS.total;

    // 1. Authoritative dispatch at the exact moment stream enters beaker
    if (elapsed >= commitTime && !activePour.dispatched) {
      commitPour(activePour.token);
    }

    // 2. Conclude animation when vessel returns and settles on table
    if (elapsed >= totalTime) {
      finishPour(activePour.token);
    }
  });

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsed = activePour ? (now - activePour.startTime) / 1000 : 0;
  const isDrop = Boolean(activePour?.fromDrop && activePour?.dropPos);

  const activeCfg = STOCK_VESSELS_CONFIG.find((c) => c.id === activePour?.ingredient);
  const activeTransform = activePour && activeCfg
    ? isDrop && activePour.dropPos
      ? computeDropPourTransform(activePour.dropPos, activeCfg.position, elapsed)
      : computeVesselTransform(activeCfg.position, elapsed)
    : null;

  const activeTilt = activeTransform ? Math.abs(activeTransform.rotationZ) : SPOUT_TARGET.tiltAngle;
  const activeSpoutPos: [number, number, number] = activeTransform
    ? (() => {
        const pt = computeSpoutPosition(activeTransform.position, activeTilt);
        return [pt[0], pt[1] - 0.04, pt[2]] as const;
      })()
    : [SPOUT_TARGET.x, SPOUT_TARGET.y - 0.05, SPOUT_TARGET.z];

  const handlePointerDown = (cfg: StockVesselConfig, e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || e.pointerType !== 'mouse') return;
    e.stopPropagation();

    const bridge = useExperimentStore.getState().getBridge();
    const adapter = bridge.getVesselAdapter();
    if (!adapter) return;

    const camDir = new Vector3();
    e.camera.getWorldDirection(camDir);

    adapter.onPointerDown({
      ingredient: cfg.id,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      button: e.button,
      hitPoint: e.point,
      homePos: cfg.position,
      cameraDirection: camDir,
      rayDirection: e.ray ? e.ray.direction.clone() : undefined,
    });
  };

  const handlePointerOver = (id: IngredientId, e: ThreeEvent<PointerEvent>) => {
    if (e.pointerType !== 'mouse') return;
    setHoveredVessel(id);
  };

  const handlePointerOut = (id: IngredientId, e: ThreeEvent<PointerEvent>) => {
    if (e.pointerType !== 'mouse') return;
    setHoveredVessel((prev) => (prev === id ? null : prev));
  };

  const streamStartTime = isDrop ? DROP_POUR_DURATIONS.commitTime : POUR_DURATIONS.commitTime;
  const streamEndTime = isDrop ? DROP_POUR_DURATIONS.pourEnd : POUR_DURATIONS.pourEnd;

  return (
    <group>
      {STOCK_VESSELS_CONFIG.map((cfg) => {
        const isActive = activePour?.ingredient === cfg.id;
        const isDragged = draggedVessel?.ingredient === cfg.id;
        const isCancelling = cancelAnim?.id === cfg.id;
        const isHovered = hoveredVessel === cfg.id;

        let transform: VesselTransform;
        if (isActive && activeTransform) {
          transform = activeTransform;
        } else if (isDragged && draggedVessel) {
          const adapter = useExperimentStore.getState().getBridge().getVesselAdapter();
          if (adapter) {
            transform = adapter.getCurrentTransform(cfg.id, cfg.position);
          } else {
            transform = {
              position: draggedVessel.position,
              rotationZ: 0,
              contentCounterRotationZ: 0,
              isPouringStream: false,
              streamProgress: 0,
            };
          }
        } else if (isCancelling && cancelAnim) {
          const cancelElapsed = Math.max(0, (now - cancelAnim.startTime) / 1000);
          const pos = computeCancelReturnTransform(cancelAnim.startPos, cfg.position, cancelElapsed, 0.35);
          transform = {
            position: pos,
            rotationZ: 0,
            contentCounterRotationZ: 0,
            isPouringStream: false,
            streamProgress: 0,
          };
        } else {
          transform = computeVesselTransform(cfg.position, 0);
        }

        const def = INGREDIENTS.find((i) => i.id === cfg.id);
        const isFreeMode = pourMode === 'free';
        let doseText = '';
        if (!isFreeMode) {
          const doseValue = inputDoses[cfg.id] ?? (cfg.id === 'water' ? '100' : cfg.id === 'oil' ? '20' : '10');
          if (isDragged) {
            if (draggedVessel?.isTouchingBeaker) {
              doseText = 'Đang chuẩn bị rót...';
            } else if (draggedVessel?.isNearBeaker) {
              doseText = 'Chạm cốc để rót';
            } else {
              doseText = `${doseValue} ${def?.unit ?? ''}`;
            }
          } else {
            doseText = `${doseValue} ${def?.unit ?? ''}`;
          }
        } else {
          if (isDragged) {
            const added = draggedVessel?.totalAddedAmount ?? 0;
            const adapter = useExperimentStore.getState().getBridge().getVesselAdapter();
            if (adapter?.isStreamFlowing()) {
              doseText = `Đang rót... +${formatDeciTicks(Math.round(added * 10))} ${def?.unit ?? ''}`;
            } else if (draggedVessel?.isTouchingBeaker || draggedVessel?.isInsideDropZone) {
              doseText = 'Đang chuẩn bị rót...';
            } else if (draggedVessel?.isNearBeaker) {
              doseText = 'Chạm cốc để rót';
            } else {
              doseText = 'Kéo tới cốc 500 ml';
            }
          } else {
            doseText = 'Giữ chuột để rót';
          }
        }

        return (
          <SingleStockVessel
            key={cfg.id}
            config={cfg}
            transform={transform}
            isActive={isActive}
            isHovered={isHovered}
            isDragged={isDragged}
            doseText={doseText}
            onPointerOver={(e) => handlePointerOver(cfg.id, e)}
            onPointerOut={(e) => handlePointerOut(cfg.id, e)}
            onPointerDown={(e) => handlePointerDown(cfg, e)}
          />
        );
      })}

      {/* Visual Drop Zone indicator above 500ml beaker */}
      {draggedVessel && (
        <DropZoneIndicator
          isActive={Boolean(draggedVessel.isTouchingBeaker || draggedVessel.isInsideDropZone)}
          activeText={
            draggedVessel.mode === 'free'
              ? useExperimentStore.getState().getBridge().getVesselAdapter()?.isStreamFlowing()
                ? `✓ Đang rót... +${formatDeciTicks(Math.round((draggedVessel.totalAddedAmount ?? 0) * 10))} ${draggedVessel.unit} (Thả chuột để dừng)`
                : draggedVessel.isTouchingBeaker || draggedVessel.isInsideDropZone
                ? '✓ Đang chuẩn bị rót...'
                : draggedVessel.isNearBeaker
                ? 'Đưa cốc chạm vào cốc lớn để rót'
                : 'Kéo cốc chạm vào cốc 500 ml để rót tự do'
              : draggedVessel.isTouchingBeaker || draggedVessel.isInsideDropZone
              ? `✓ Đang chuẩn bị rót ${draggedVessel.snapshotAmount} ${draggedVessel.unit}...`
              : draggedVessel.isNearBeaker
              ? 'Đưa cốc chạm vào cốc lớn để rót'
              : 'Kéo cốc chạm vào cốc 500 ml để rót'
          }
        />
      )}

      {/* Active Pouring Stream for By-Dose Mode */}
      {activePour && elapsed >= streamStartTime && elapsed <= streamEndTime && (
        <PouringStream
          ingredient={activePour.ingredient}
          liquidTop={liquidTop}
          elapsedPourTime={elapsed - streamStartTime}
          spoutPos={activeSpoutPos}
        />
      )}

      {/* Active Pouring Stream for Free Pour Mode */}
      {draggedVessel && draggedVessel.mode === 'free' && useExperimentStore.getState().getBridge().getVesselAdapter()?.isStreamFlowing() && (
        <PouringStream
          ingredient={draggedVessel.ingredient}
          liquidTop={liquidTop}
          elapsedPourTime={now / 1000}
          spoutPos={(() => {
            const adapter = useExperimentStore.getState().getBridge().getVesselAdapter();
            if (!adapter) return [SPOUT_TARGET.x, SPOUT_TARGET.y - 0.05, SPOUT_TARGET.z];
            const tr = adapter.getCurrentTransform(draggedVessel.ingredient, draggedVessel.position);
            const pt = computeSpoutPosition(tr.position, Math.abs(tr.rotationZ));
            return [pt[0], pt[1] - 0.04, pt[2]] as const;
          })()}
        />
      )}

      {/* Guidance badge on table surface */}
      <Html
        position={[-2.35, 0.01, 2.3]}
        center
        distanceFactor={8.5}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            color: '#64748b',
            background: 'rgba(255, 255, 255, 0.88)',
            padding: '2px 7px',
            borderRadius: '4px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          {pourMode === 'by_dose'
            ? 'Nhấn "+ Thêm" hoặc kéo cốc chạm vào cốc 500 ml để tự động rót'
            : 'Kéo cốc chạm vào cốc 500 ml và giữ chuột để rót tự do'}
        </span>
      </Html>
    </group>
  );
}
