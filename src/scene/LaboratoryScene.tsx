import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Html } from '@react-three/drei';
import { Component, useEffect, useRef, type ReactNode, type ElementRef } from 'react';
import { Raycaster, Vector2 } from 'three';
import { useExperimentStore } from '../stores/experimentStore';
import { ManualStirAdapter } from '../interactions/ManualStirAdapter';
import { Beaker } from './Beaker';
import { IngredientVessels } from './IngredientVessels';
import { WaterVolume } from './WaterVolume';
import { OilVolume } from './OilVolume';
import { ParticleRenderer } from './ParticleRenderer';
import { StirringRod } from './StirringRod';
import {
  BEAKER_BASE_Y,
  computeBeakerRegions,
  volumeToHeight,
  type PhaseMasses,
} from '../simulation/constants/beaker';

interface WebGLFallbackViewProps {
  status?: 'init_failed' | 'context_lost' | 'unsupported';
  onRetry?: () => void;
}

export function WebGLFallbackView({ status = 'init_failed', onRetry }: WebGLFallbackViewProps) {
  const retryCanvas = useExperimentStore((s) => s.retryCanvas);
  const handleRetry = onRetry ?? retryCanvas;

  return (
    <div className="scene-fallback" role="alert" style={{ height: '100%', minHeight: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: '440px', margin: 'auto', padding: '24px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>
          {status === 'context_lost' ? '⚡' : '⚠️'}
        </div>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
          {status === 'context_lost'
            ? 'Mất kết nối đồ họa 3D (WebGL Context Lost)'
            : 'Không thể khởi tạo hiển thị 3D'}
        </h3>
        <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6, marginBottom: '20px' }}>
          {status === 'context_lost'
            ? 'Trình duyệt đã ngắt kết nối đồ họa WebGL (do GPU bận hoặc hệ thống thu hồi). Mô phỏng đã tự động tạm dừng; toàn bộ số liệu và thời gian thí nghiệm được bảo toàn nguyên vẹn.'
            : 'Trình duyệt cần hỗ trợ WebGL để xem cốc thí nghiệm 3D. Bảng điều khiển nguyên liệu, kết quả và trạng thái khoa học vẫn hoạt động bình thường.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            style={{
              padding: '8px 16px',
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              width: '100%',
              maxWidth: '240px',
            }}
            onClick={handleRetry}
          >
            ↺ Thử lại hiển thị 3D
          </button>
          <button
            type="button"
            style={{
              padding: '6px 12px',
              background: 'transparent',
              color: '#64748b',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '11px',
              cursor: 'pointer',
              width: '100%',
              maxWidth: '240px',
            }}
            onClick={() => {
              if (typeof window !== 'undefined') window.location.reload();
            }}
            title="Lưu ý: Tải lại trang sẽ xóa toàn bộ thí nghiệm hiện tại"
          >
            Tải lại trang (mất dữ liệu thí nghiệm)
          </button>
        </div>
      </div>
    </div>
  );
}

interface SceneBoundaryProps {
  children: ReactNode;
  onRetry?: () => void;
}

interface SceneBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class SceneBoundary extends Component<SceneBoundaryProps, SceneBoundaryState> {
  state: SceneBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): SceneBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('[SceneBoundary] WebGL initialization or render error caught:', error);
    useExperimentStore.getState().reportWebGLInitFailed();
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    } else {
      useExperimentStore.getState().retryCanvas();
    }
  };

  render() {
    if (this.state.hasError) {
      return <WebGLFallbackView status="init_failed" onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

/**
 * Handles WebGL context loss and restoration events on the canvas DOM element.
 * Complies with SCIENTIFIC_SPEC SC-W02 and V4-10:
 * - Calls event.preventDefault() to allow browser context restoration
 * - Halts rendering and pauses simulation via store/bridge
 * - Cleans up active manual drag and pointer capture
 */
function WebGLContextHandler() {
  const { gl } = useThree();
  const reportContextLost = useExperimentStore((s) => s.reportWebGLContextLost);
  const reportContextRestored = useExperimentStore((s) => s.reportWebGLContextRestored);
  const activeCanvasRevision = useExperimentStore((s) => s.canvasRevision);

  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      // Guard: ignore if this callback originated from a stale unmounted canvas revision
      if (useExperimentStore.getState().canvasRevision !== activeCanvasRevision) {
        return;
      }
      reportContextLost();
    };

    const handleContextRestored = () => {
      // Guard: ignore if this callback originated from a stale unmounted canvas revision
      if (useExperimentStore.getState().canvasRevision !== activeCanvasRevision) {
        return;
      }
      reportContextRestored();
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, [gl, activeCanvasRevision, reportContextLost, reportContextRestored]);

  return null;
}

/**
 * Invalidation bridge component inside Canvas.
 * When simulation bridge produces steps or forces snapshot publish,
 * triggers R3F invalidate for demand rendering if context is ready.
 */
function SceneInvalidationBridge() {
  const { invalidate } = useThree();
  useEffect(() => {
    const bridge = useExperimentStore.getState().getBridge();
    return bridge.subscribeInvalidate(() => {
      if (useExperimentStore.getState().webglStatus === 'ready') {
        invalidate();
      }
    });
  }, [invalidate]);
  return null;
}

type OrbitControlsHandle = ElementRef<typeof OrbitControls>;

/**
 * Connects OrbitControls and gl.domElement pointer capture targets to ManualStirAdapter.
 * Listens for captured pointermove, pointerup, pointercancel, and lostpointercapture events.
 */
function ManualStirSceneWiring({ controlsRef }: { controlsRef: React.RefObject<OrbitControlsHandle | null> }) {
  const { gl, camera } = useThree();

  useEffect(() => {
    const bridge = useExperimentStore.getState().getBridge();
    const adapter = bridge.getManualAdapter();
    if (!adapter) return;

    // 1. Connect camera target
    adapter.setCameraTarget({
      setEnabled: (enabled: boolean) => {
        if (controlsRef.current) {
          controlsRef.current.enabled = enabled;
        }
      },
      isEnabled: () => (controlsRef.current ? Boolean(controlsRef.current.enabled) : true),
    });

    // 2. Connect capture target
    adapter.setCaptureTarget({
      setPointerCapture: (pointerId: number) => {
        try {
          gl.domElement.setPointerCapture(pointerId);
        } catch {
          // In headless or environments lacking setPointerCapture support
        }
      },
      releasePointerCapture: (pointerId: number) => {
        try {
          gl.domElement.releasePointerCapture(pointerId);
        } catch {
          // Ignore DOMException if already released
        }
      },
      hasPointerCapture: (pointerId: number) => {
        try {
          return gl.domElement.hasPointerCapture ? gl.domElement.hasPointerCapture(pointerId) : false;
        } catch {
          return false;
        }
      },
    });

    // 3. Connect showRod getter
    adapter.setGetShowRod(() => useExperimentStore.getState().showRod);

    const raycaster = new Raycaster();
    const ndc = new Vector2();

    const handlePointerMove = (e: PointerEvent) => {
      if (adapter.getCapturedPointerId() !== e.pointerId) return;

      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      raycaster.setFromCamera(ndc, camera);
      const ray = ManualStirAdapter.rayFromThree(raycaster.ray);

      adapter.onPointerMove(e.pointerId, ray, performance.now());
      bridge.notifySceneInvalidate();
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (adapter.getCapturedPointerId() === e.pointerId) {
        adapter.onPointerUp(e.pointerId);
        bridge.notifySceneInvalidate();
      }
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (adapter.getCapturedPointerId() === e.pointerId) {
        adapter.onPointerCancel(e.pointerId);
        bridge.notifySceneInvalidate();
      }
    };

    const handleLostCapture = (e: PointerEvent) => {
      if (adapter.getCapturedPointerId() === e.pointerId) {
        adapter.onLostPointerCapture(e.pointerId);
        bridge.notifySceneInvalidate();
      }
    };

    const dom = gl.domElement;
    dom.addEventListener('pointermove', handlePointerMove);
    dom.addEventListener('pointerup', handlePointerUp);
    dom.addEventListener('pointercancel', handlePointerCancel);
    dom.addEventListener('lostpointercapture', handleLostCapture);

    return () => {
      dom.removeEventListener('pointermove', handlePointerMove);
      dom.removeEventListener('pointerup', handlePointerUp);
      dom.removeEventListener('pointercancel', handlePointerCancel);
      dom.removeEventListener('lostpointercapture', handleLostCapture);
      adapter.detach();
      adapter.setCameraTarget(undefined);
      adapter.setCaptureTarget(undefined);
      adapter.setGetShowRod(undefined);
    };
  }, [gl, camera, controlsRef]);

  return null;
}

export default function LaboratoryScene() {
  const snapshot = useExperimentStore((s) => s.snapshot);
  const showRod = useExperimentStore((s) => s.showRod);
  const cameraRevision = useExperimentStore((s) => s.cameraRevision);
  const canvasRevision = useExperimentStore((s) => s.canvasRevision);
  const webglStatus = useExperimentStore((s) => s.webglStatus);
  const retryCanvas = useExperimentStore((s) => s.retryCanvas);
  const orbitRef = useRef<OrbitControlsHandle>(null);

  if (webglStatus === 'context_lost') {
    return <WebGLFallbackView status="context_lost" onRetry={retryCanvas} />;
  }

  if (webglStatus === 'init_failed') {
    return <WebGLFallbackView status="init_failed" onRetry={retryCanvas} />;
  }

  const rhoO = 0.9;
  const phases: PhaseMasses = {
    Wml: snapshot.mass.W,
    Oml: snapshot.mass.Ot / rhoO,
    Gt: snapshot.mass.Gt,
    Gu: snapshot.mass.Gu,
    Gd: snapshot.mass.Gd,
    fGu: snapshot.fGu ?? 0,
    St: snapshot.mass.St,
    Sb: snapshot.mass.Sb,
    Ss: snapshot.mass.Ss,
    Ot: snapshot.mass.Ot,
    Ol: snapshot.mass.Ol,
    Od: snapshot.mass.Od,
  };

  const regions = computeBeakerRegions(phases);
  const tipY = snapshot.rod.tipY;
  const fGu = snapshot.fGu ?? 0;
  const guBed = Math.max(0, snapshot.mass.Gu * (1 - fGu));

  return (
    <SceneBoundary onRetry={retryCanvas}>
      <Canvas
        key={`${cameraRevision}-${canvasRevision}`}
        shadows
        dpr={[1, 1.75]}
        frameloop="demand"
        camera={{ position: [3.7, 3.1, 5.2], fov: 39 }}
        fallback={<WebGLFallbackView status="unsupported" onRetry={retryCanvas} />}
      >
        <SceneInvalidationBridge />
        <WebGLContextHandler />
        <ManualStirSceneWiring controlsRef={orbitRef} />
        <color attach="background" args={['#edf3f3']} />
        <ambientLight intensity={1.5} />
        <directionalLight position={[3, 7, 4]} intensity={3} castShadow />
        <directionalLight position={[-4, 3, -2]} intensity={1.5} color="#b8deed" />
        <IngredientVessels />
        <Beaker />
        <WaterVolume volume={regions.aqueous.volumeMl} base={regions.aqueous.bottom} />
        <OilVolume volume={regions.oil.volumeMl} base={regions.oil.bottom} />
        <ParticleRenderer
          regions={regions}
          sandMass={Math.max(0, snapshot.mass.Sb)}
          sugarBedMass={guBed}
        />
        {showRod ? (
          <StirringRod tipY={tipY} x={snapshot.rod.x} z={snapshot.rod.z} />
        ) : null}
        {[100, 200, 300, 400, 500].map((amount) => (
          <Html
            key={amount}
            position={[0.53, BEAKER_BASE_Y + volumeToHeight(amount), 0.82]}
            center
            style={{
              pointerEvents: 'none',
              fontSize: '9px',
              color: '#39616d',
              fontFamily: 'monospace',
            }}
          >
            {amount}
          </Html>
        ))}
        <mesh position={[0, -0.09, 0]} receiveShadow>
          <boxGeometry args={[9, 0.18, 7]} />
          <meshStandardMaterial color="#d7e3e4" roughness={0.9} />
        </mesh>
        <ContactShadows position={[0, 0.005, 0]} opacity={0.3} scale={7} blur={2.5} far={4} />
        <OrbitControls
          ref={orbitRef}
          makeDefault
          target={[0, 1.1, 0]}
          enablePan={false}
          minDistance={3.8}
          maxDistance={9}
          minPolarAngle={0.35}
          maxPolarAngle={Math.PI / 2 - 0.05}
        />
      </Canvas>
    </SceneBoundary>
  );
}
