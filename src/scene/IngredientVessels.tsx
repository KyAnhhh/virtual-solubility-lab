import { Html } from '@react-three/drei';
import type { IngredientId } from '../types/experiment';
import { Beaker } from './Beaker';

export interface StockVesselConfig {
  readonly id: IngredientId;
  readonly name: string;
  readonly color: string;
  readonly position: readonly [number, number, number];
  readonly fillRatio: number;
}

export const STOCK_VESSEL_RADIUS = 0.38;
export const STOCK_VESSEL_HEIGHT = 1.05;

/**
 * Deterministic spatial layout for the 4 stock reagent vessels on the lab table.
 * Arranged along the left side of the table (x in [-2.5, -2.2]) facing the central beaker.
 * Leaves > 1.25 units of open space around the 500ml experiment beaker (radius 0.90).
 */
export const STOCK_VESSELS_CONFIG: readonly StockVesselConfig[] = [
  {
    id: 'water',
    name: 'Nước',
    color: '#66bce0',
    position: [-2.6, 0, -0.6],
    fillRatio: 0.72,
  },
  {
    id: 'sugar',
    name: 'Đường',
    color: '#e8e3d4',
    position: [-2.7, 0, 0.4],
    fillRatio: 0.70,
  },
  {
    id: 'sand',
    name: 'Cát',
    color: '#c89757',
    position: [-2.5, 0, 1.4],
    fillRatio: 0.70,
  },
  {
    id: 'oil',
    name: 'Dầu ăn',
    color: '#e4bd49',
    position: [-2.1, 0, 2.3],
    fillRatio: 0.72,
  },
] as const;

/**
 * Pre-computed deterministic surface grain offsets for solid beds (sugar crystals / sand grains).
 * Calculated via golden-angle trigonometry; does NOT use Math.random() or science RNG.
 */
interface StaticGrainOffset {
  x: number;
  y: number;
  z: number;
  scale: number;
}

const STATIC_GRAIN_OFFSETS: readonly StaticGrainOffset[] = Array.from(
  { length: 14 },
  (_, i) => {
    const angle = i * 2.39996; // Golden angle approximation in radians
    const r = 0.10 + 0.20 * Math.sqrt((i + 1) / 14);
    return {
      x: r * Math.cos(angle),
      y: 0.65 + 0.04 * Math.sin(i * 1.7),
      z: r * Math.sin(angle),
      scale: 0.024 + 0.008 * Math.cos(i * 2.3),
    };
  }
);

interface SingleStockVesselProps {
  config: StockVesselConfig;
}

function SingleStockVessel({ config }: SingleStockVesselProps) {
  const { id, name, color, position, fillRatio } = config;
  const contentRadius = STOCK_VESSEL_RADIUS - 0.025; // 0.355
  const contentHeight = STOCK_VESSEL_HEIGHT * fillRatio; // ~0.74
  const contentCenterY = 0.04 + contentHeight / 2;

  return (
    <group position={position as [number, number, number]}>
      {/* 1. Scaled transparent glass beaker without 500ml graduations */}
      <Beaker
        radius={STOCK_VESSEL_RADIUS}
        height={STOCK_VESSEL_HEIGHT}
        showGraduations={false}
        opacity={0.22}
      />

      {/* 2. Visual substance content inside vessel */}
      {id === 'water' && (
        <group>
          {/* Water liquid column */}
          <mesh position={[0, contentCenterY, 0]} raycast={() => null}>
            <cylinderGeometry args={[contentRadius, contentRadius, contentHeight, 36]} />
            <meshPhysicalMaterial
              color="#7ec8e8"
              transparent
              opacity={0.65}
              roughness={0.10}
              metalness={0.02}
            />
          </mesh>
          {/* Water surface meniscus */}
          <mesh position={[0, 0.04 + contentHeight, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <circleGeometry args={[contentRadius, 36]} />
            <meshStandardMaterial color="#bfe5f7" transparent opacity={0.7} roughness={0.08} />
          </mesh>
        </group>
      )}

      {id === 'oil' && (
        <group>
          {/* Oil liquid column */}
          <mesh position={[0, contentCenterY, 0]} raycast={() => null}>
            <cylinderGeometry args={[contentRadius, contentRadius, contentHeight, 36]} />
            <meshPhysicalMaterial
              color="#eab308"
              transparent
              opacity={0.82}
              roughness={0.25}
              metalness={0.02}
            />
          </mesh>
          {/* Oil surface meniscus */}
          <mesh position={[0, 0.04 + contentHeight, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <circleGeometry args={[contentRadius, 36]} />
            <meshStandardMaterial color="#fef08a" transparent opacity={0.85} roughness={0.15} />
          </mesh>
        </group>
      )}

      {id === 'sugar' && (
        <group>
          {/* Sugar crystalline bed column */}
          <mesh position={[0, 0.04 + 0.58 / 2, 0]} raycast={() => null}>
            <cylinderGeometry args={[contentRadius, contentRadius, 0.58, 36]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.92} metalness={0.0} />
          </mesh>
          {/* Sugar mound top */}
          <mesh position={[0, 0.04 + 0.58 + 0.06, 0]} raycast={() => null}>
            <coneGeometry args={[contentRadius, 0.12, 32]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.95} metalness={0.0} />
          </mesh>
          {/* Static deterministic crystal facets on surface */}
          {STATIC_GRAIN_OFFSETS.map((pt, idx) => (
            <mesh key={idx} position={[pt.x, pt.y, pt.z]} rotation={[idx, idx * 0.5, 0]} raycast={() => null}>
              <boxGeometry args={[pt.scale, pt.scale, pt.scale]} />
              <meshStandardMaterial color="#ffffff" roughness={0.85} />
            </mesh>
          ))}
        </group>
      )}

      {id === 'sand' && (
        <group>
          {/* Sand sediment bed column */}
          <mesh position={[0, 0.04 + 0.58 / 2, 0]} raycast={() => null}>
            <cylinderGeometry args={[contentRadius, contentRadius, 0.58, 36]} />
            <meshStandardMaterial color="#c29b62" roughness={0.96} metalness={0.0} />
          </mesh>
          {/* Sand mound top */}
          <mesh position={[0, 0.04 + 0.58 + 0.06, 0]} raycast={() => null}>
            <coneGeometry args={[contentRadius, 0.12, 32]} />
            <meshStandardMaterial color="#b58d52" roughness={0.98} metalness={0.0} />
          </mesh>
          {/* Static deterministic sand grains on surface */}
          {STATIC_GRAIN_OFFSETS.map((pt, idx) => (
            <mesh key={idx} position={[pt.x, pt.y, pt.z]} rotation={[idx * 0.7, idx, 0]} raycast={() => null}>
              <boxGeometry args={[pt.scale, pt.scale, pt.scale]} />
              <meshStandardMaterial color={idx % 2 === 0 ? '#a17838' : '#d4a86a'} roughness={0.95} />
            </mesh>
          ))}
        </group>
      )}

      {/* 3. Reagent name label pill floating right above vessel rim */}
      <Html
        position={[0, STOCK_VESSEL_HEIGHT + 0.18, 0]}
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
            background: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(3px)',
            border: `1.5px solid ${color}`,
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
            borderRadius: '12px',
            padding: '2px 8px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#1e293b',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            lineHeight: 1.2,
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: color,
              border: '1px solid rgba(0, 0, 0, 0.15)',
              display: 'inline-block',
            }}
          />
          <span>{name}</span>
        </div>
      </Html>
    </group>
  );
}

/**
 * IngredientVessels
 * Renders four 3D stock reagent beakers (Water, Sugar, Sand, Oil) on the lab table.
 * Meets V1-06 specification:
 * - Visual-only supply vessels on the laboratory bench.
 * - Independent of experiment mass ledger (no stock depletion or inventory bookkeeping).
 * - Safe presentation scaling with no 500ml graduations on stock beakers.
 * - raycast={() => null} on all meshes ensures zero interference with stirring or camera.
 */
export function IngredientVessels() {
  return (
    <group>
      {STOCK_VESSELS_CONFIG.map((cfg) => (
        <SingleStockVessel key={cfg.id} config={cfg} />
      ))}
      {/* Subtle guidance badge on table surface */}
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
          Thêm nguyên liệu bằng bảng điều khiển
        </span>
      </Html>
    </group>
  );
}
