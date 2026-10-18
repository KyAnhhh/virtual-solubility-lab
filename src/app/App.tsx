import { Component, lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react';
import { LabHeader } from '../components/layout/LabHeader';
import { IngredientPanel } from '../components/ingredients/IngredientPanel';
import { ControlPanel } from '../components/controls/ControlPanel';
import { ContentsPanel } from '../components/results/ContentsPanel';
import { useExperimentStore } from '../stores/experimentStore';

interface AppSceneBoundaryProps {
  children?: ReactNode;
}

interface AppSceneBoundaryState {
  hasError: boolean;
  error: Error | null;
  SceneComponent: ComponentType;
}

/**
 * App-level boundary wrapping the lazy-loaded LaboratoryScene chunk.
 * Satisfies TEST_CASES SC-W05: handles chunk download / network failures
 * without resetting the experiment store or engine state.
 *
 * NOTE: The lazy component reference MUST live outside Suspense (here in Boundary state).
 * Storing it inside a Suspense child component resets its fiber upon initial suspension in React 19,
 * causing an infinite recreation / re-render loop.
 */
class AppSceneBoundary extends Component<AppSceneBoundaryProps, AppSceneBoundaryState> {
  state: AppSceneBoundaryState = {
    hasError: false,
    error: null,
    SceneComponent: lazy(() => import('../scene/LaboratoryScene')),
  };

  static getDerivedStateFromError(error: Error): Partial<AppSceneBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('[AppSceneBoundary] Failed to load 3D scene chunk:', error);
    useExperimentStore.getState().reportWebGLInitFailed();
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      SceneComponent: lazy(() => import('../scene/LaboratoryScene')),
    });
    useExperimentStore.getState().retryCanvas();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="scene-fallback" role="alert" style={{ height: '100%', minHeight: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ maxWidth: '440px', margin: 'auto', padding: '24px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
              Không thể tải module thí nghiệm 3D
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6, marginBottom: '20px' }}>
              Không thể tải gói tài nguyên hiển thị 3D (có thể do kết nối mạng). Dữ liệu khối lượng và bảng điều khiển vẫn hoạt động bình thường.
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
                onClick={this.handleRetry}
              >
                ↺ Thử lại tải 3D
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
    const SceneComponent = this.state.SceneComponent;
    return (
      <Suspense fallback={<div className="scene-fallback">Đang chuẩn bị bàn thí nghiệm…</div>}>
        <SceneComponent />
      </Suspense>
    );
  }
}

export default function App() {
  const message = useExperimentStore((s) => s.message);
  const paused = useExperimentStore((s) => s.snapshot.paused);
  const elapsedSeconds = useExperimentStore((s) => s.snapshot.elapsedSeconds);

  useEffect(() => {
    const bridge = useExperimentStore.getState().getBridge();
    return bridge.attachLifecycle();
  }, []);

  return (
    <>
      <LabHeader />
      <main>
        <div className="intro">
          <div>
            <p className="eyebrow">KHÁM PHÁ CHẤT & HỖN HỢP</p>
            <h1>Một chiếc cốc. Nhiều khám phá.</h1>
            <p>Thêm nguyên liệu và quan sát chúng trong không gian ba chiều.</p>
          </div>
          <span className="experiment-label">
            THÍ NGHIỆM<br />
            <strong>Độ tan trong nước</strong>
          </span>
        </div>
        <div className="lab-grid">
          <IngredientPanel />
          <section className="scene-panel" aria-label="Không gian thí nghiệm 3D">
            <div className="scene-heading">
              <span className="eyebrow">BÀN THÍ NGHIỆM</span>
              <span>Cốc thủy tinh · 500 ml · {paused ? 'Tạm dừng' : 'Đang chạy'} ({elapsedSeconds.toFixed(1)}s)</span>
            </div>
            <div className="canvas-container">
              <AppSceneBoundary />
            </div>
            <div className="scene-caption">
              <span className={`status-dot ${paused ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              <span role="status" aria-live="polite">{message}</span>
            </div>
          </section>
          <aside className="right-column">
            <ControlPanel />
            <ContentsPanel />
          </aside>
        </div>
        <footer>
          <span>VSL / PHÒNG THÍ NGHIỆM ĐỘ TAN</span>
          <p>Mô hình giáo dục tương tác 3D. Đồng hồ và trạng thái vật lý thống nhất.</p>
        </footer>
      </main>
    </>
  );
}
