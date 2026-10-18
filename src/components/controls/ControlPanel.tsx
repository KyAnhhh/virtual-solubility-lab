import { useExperimentStore } from '../../stores/experimentStore';

export function ControlPanel() {
  const showRod = useExperimentStore((s) => s.showRod);
  const toggleRod = useExperimentStore((s) => s.toggleRod);
  const resetCamera = useExperimentStore((s) => s.resetCamera);
  const reset = useExperimentStore((s) => s.reset);
  const start = useExperimentStore((s) => s.start);
  const pause = useExperimentStore((s) => s.pause);
  const resume = useExperimentStore((s) => s.resume);
  const paused = useExperimentStore((s) => s.snapshot.paused);
  const elapsedSeconds = useExperimentStore((s) => s.snapshot.elapsedSeconds);
  const mode = useExperimentStore((s) => s.snapshot.mode);
  const autoDriveEnabled = useExperimentStore((s) => s.snapshot.autoDriveEnabled);
  const autoLevel = useExperimentStore((s) => s.snapshot.autoLevel);
  const startAuto = useExperimentStore((s) => s.startAuto);
  const stopAuto = useExperimentStore((s) => s.stopAuto);
  const setAutoLevel = useExperimentStore((s) => s.setAutoLevel);

  const isAutoRunning = mode === 'auto' && autoDriveEnabled;
  const setMode = useExperimentStore((s) => s.setMode);
  const hasStarted = useExperimentStore((s) => s.hasStarted);
  const webglStatus = useExperimentStore((s) => s.webglStatus);
  const isContextBlocked = webglStatus !== 'ready';

  return (
    <section className="panel control-panel">
      <div className="panel-title">
        <span className="eyebrow">ĐIỀU KHIỂN</span>
        <span className="small-tag">
          {paused ? (hasStarted ? 'Tạm dừng' : 'Chưa chạy') : 'Đang chạy'} · {elapsedSeconds.toFixed(1)}s
        </span>
      </div>

      <h2>Tiến trình mô phỏng</h2>
      <div className="sim-controls" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
        {paused ? (
          <button
            className="reset-button w-full"
            onClick={hasStarted ? resume : start}
            disabled={isContextBlocked}
            style={isContextBlocked ? { background: '#94a3b8', cursor: 'not-allowed' } : undefined}
            title={isContextBlocked ? 'Không gian 3D đang gián đoạn hoặc đang phục hồi. Vui lòng bấm Thử lại 3D trước khi tiếp tục.' : undefined}
          >
            ▶ {hasStarted ? 'Tiếp tục mô phỏng' : 'Bắt đầu mô phỏng'}
          </button>
        ) : (
          <button className="secondary w-full" onClick={pause} style={{ background: '#f8fafc', fontWeight: 600 }}>
            ⏸ Tạm dừng mô phỏng
          </button>
        )}
        <button className="secondary w-full" onClick={() => reset()}>
          ↺ Làm mới cốc thí nghiệm
        </button>
      </div>
      <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', marginBottom: '16px', lineHeight: 1.4 }}>
        * Ngừng khuấy chỉ ngắt lực của thìa. Tạm dừng đóng băng toàn bộ mô phỏng.
      </div>

      <h2>Chế độ tương tác</h2>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
        {(
          [
            { id: 'observe', label: 'Quan sát' },
            { id: 'auto', label: 'Khuấy tự động' },
            { id: 'manual', label: 'Kéo thủ công' },
          ] as const
        ).map((m) => {
          const isSelected = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              className="secondary"
              style={{
                flex: 1,
                padding: '6px 4px',
                fontSize: '11px',
                fontWeight: isSelected ? 700 : 500,
                border: isSelected ? '2px solid #0284c7' : '1px solid #cbd5e1',
                background: isSelected ? '#e0f2fe' : '#ffffff',
                color: isSelected ? '#0369a1' : '#334155',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === 'manual' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: '6px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              fontSize: '12px',
              color: '#166534',
              lineHeight: 1.4,
            }}
          >
            <strong>Kéo thìa thủ công:</strong> Chọn thủ công, kéo thìa để khuấy. Thả chuột để ngừng truyền lực.
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
            {!showRod
              ? 'Hiện thìa khuấy để sử dụng tính năng kéo thìa thủ công.'
              : paused
              ? 'Mô phỏng đang tạm dừng — tiếp tục mô phỏng để kéo thìa.'
              : 'Dùng chuột kéo thìa trong cốc 3D để tạo lực khuấy.'}
          </div>
        </div>
      ) : mode === 'auto' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['slow', 'medium', 'fast'] as const).map((lvl) => {
              const isSelected = autoLevel === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  className="secondary"
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    fontSize: '12px',
                    fontWeight: isSelected ? 700 : 500,
                    border: isSelected ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                    background: isSelected ? '#eff6ff' : '#ffffff',
                    color: isSelected ? '#1d4ed8' : '#334155',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                  onClick={() => setAutoLevel(lvl)}
                >
                  {lvl === 'slow' ? 'Chậm' : lvl === 'medium' ? 'Vừa' : 'Nhanh'}
                </button>
              );
            })}
          </div>

          {isAutoRunning ? (
            <button
              className="secondary w-full"
              style={{
                background: '#fef3c7',
                borderColor: '#f59e0b',
                color: '#92400e',
                fontWeight: 600,
              }}
              onClick={stopAuto}
            >
              ⏹ Ngừng khuấy
            </button>
          ) : (
            <button
              className="reset-button w-full"
              style={{
                background: (!showRod || isContextBlocked) ? '#94a3b8' : undefined,
                cursor: (!showRod || isContextBlocked) ? 'not-allowed' : 'pointer',
              }}
              disabled={!showRod || isContextBlocked}
              onClick={() => startAuto(autoLevel)}
              title={isContextBlocked ? 'Không gian 3D đang gián đoạn. Vui lòng thử lại 3D trước.' : undefined}
            >
              🌀 Bắt đầu khuấy tự động
            </button>
          )}

          <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
            {!showRod
              ? 'Hiện thìa khuấy để sử dụng tính năng khuấy tự động.'
              : paused && isAutoRunning
              ? 'Thìa tạm dừng — đứng yên.'
              : isAutoRunning
              ? `Đang khuấy: ${autoLevel === 'slow' ? '1 rad/s' : autoLevel === 'medium' ? '3 rad/s' : '6 rad/s'}`
              : 'Đã ngừng khuấy (thìa ở trạng thái nghỉ).'}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '16px', textAlign: 'center' }}>
          {paused
            ? 'Chế độ quan sát — mô phỏng đang tạm dừng.'
            : 'Chế độ quan sát — mô phỏng đang chạy.'}
        </div>
      )}

      <h2>Góc quan sát</h2>
      <div className="gesture">
        <span>↔</span>
        <div>
          <strong>Xoay quanh cốc</strong>
          <p>Kéo chuột hoặc vuốt một ngón</p>
        </div>
      </div>
      <div className="gesture">
        <span>⊕</span>
        <div>
          <strong>Phóng to / thu nhỏ</strong>
          <p>Cuộn chuột hoặc chụm hai ngón</p>
        </div>
      </div>
      <button className="secondary w-full" onClick={resetCamera}>
        ↺ Đặt lại góc nhìn
      </button>

      <div className="rod-toggle">
        <label htmlFor="rod">Hiển thị thìa khuấy</label>
        <input id="rod" type="checkbox" checked={showRod} onChange={toggleRod} />
      </div>
    </section>
  );
}
