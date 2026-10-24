import { useRef } from 'react';
import {
  formatDeciTicks,
  INGREDIENTS,
  occupiedVolumeMilliMl,
} from '../../simulation/constants/ingredients';
import { useExperimentStore } from '../../stores/experimentStore';
import {
  evaluateScienceState,
  formatCapacity,
  formatDissolutionProgress,
  formatPhaseMass,
  formatSaturationRatio,
  INITIAL_HYSTERESIS_STATE,
  updateHysteresisState,
} from './contentsHelpers';
import { MassTimeChart } from './MassTimeChart';

export function ContentsPanel() {
  const deciTicks = useExperimentStore((s) => s.deciTicks);
  const snapshot = useExperimentStore((s) => s.snapshot);
  const count = useExperimentStore((s) => s.additions.length);

  const occupiedMilliMl = occupiedVolumeMilliMl(deciTicks);
  const occupiedMl = Math.round(occupiedMilliMl / 1000);

  // Manage hysteresis across snapshot updates and reset on generation bump
  const hysteresisRef = useRef(INITIAL_HYSTERESIS_STATE);
  const lastGenRef = useRef(snapshot.generation);
  if (lastGenRef.current !== snapshot.generation) {
    lastGenRef.current = snapshot.generation;
    hysteresisRef.current = INITIAL_HYSTERESIS_STATE;
  }

  const hysteresis = updateHysteresisState(hysteresisRef.current, {
    saturationRatio: snapshot.saturationRatio,
    Gu: snapshot.mass.Gu,
    Gt: snapshot.mass.Gt,
    W: snapshot.mass.W,
  });
  hysteresisRef.current = hysteresis;

  const evaluation = evaluateScienceState(snapshot, hysteresis);

  // Compute dissolvable target and remaining headroom (SCIENTIFIC_SPEC §8)
  const dissolvableTarget = Math.min(snapshot.mass.Gt, snapshot.capacityG);
  const dissolvableHeadroom = Math.max(0, dissolvableTarget - snapshot.mass.Gd);

  return (
    <section className="panel contents-panel">
      <div className="panel-title">
        <span className="eyebrow">TRONG CỐC</span>
        <span className="small-tag">{count} lần thêm</span>
      </div>

      <h2>Thành phần đã thêm</h2>
      <dl>
        {INGREDIENTS.map((item) => (
          <div className="content-row" key={item.id}>
            <dt>
              <span style={{ background: item.color }} />
              {item.name}
            </dt>
            <dd>
              {formatDeciTicks(deciTicks[item.id])} <small>{item.unit}</small>
            </dd>
          </div>
        ))}
      </dl>

      <div style={{ marginTop: '10px', borderTop: '1px solid #edf1f2', paddingTop: '8px' }}>
        <h3 style={{ fontSize: '12px', margin: '0 0 6px 0', color: '#244c5b' }}>
          Pha nước – đường (Mô hình khoa học)
        </h3>
        <dl>
          <div className="content-row">
            <dt>Lượng nước trong cốc</dt>
            <dd>{formatPhaseMass(snapshot.mass.W, 'g')}</dd>
          </div>
          <div className="content-row">
            <dt>Sức chứa hòa tan của nước</dt>
            <dd>{formatCapacity(snapshot.capacityG, snapshot.mass.W)}</dd>
          </div>
          <div className="content-row">
            <dt>Tổng lượng đường đã thêm</dt>
            <dd>{formatPhaseMass(snapshot.mass.Gt)}</dd>
          </div>
          <div className="content-row">
            <dt>Đường đã hòa tan</dt>
            <dd>{formatPhaseMass(snapshot.mass.Gd)}</dd>
          </div>
          <div className="content-row">
            <dt>Đường rắn còn lại</dt>
            <dd>{formatPhaseMass(snapshot.mass.Gu)}</dd>
          </div>
          {evaluation.hasExcess && (
            <div className="content-row">
              <dt>Lượng đường dư vượt sức chứa</dt>
              <dd>{formatPhaseMass(snapshot.mass.Gt - snapshot.capacityG)}</dd>
            </div>
          )}
          <div className="content-row">
            <dt>Độ bão hòa dung dịch</dt>
            <dd>{formatSaturationRatio(snapshot.saturationRatio)}</dd>
          </div>
          <div className="content-row">
            <dt>Tiến độ lượng có thể tan</dt>
            <dd>{formatDissolutionProgress(snapshot.dissolutionProgress, dissolvableHeadroom)}</dd>
          </div>
        </dl>
      </div>

      {snapshot.mass.St > 0 && (
        <div style={{ marginTop: '8px', borderTop: '1px solid #edf1f2', paddingTop: '6px' }}>
          <h3 style={{ fontSize: '12px', margin: '0 0 6px 0', color: '#244c5b' }}>
            Pha cát — Huyền phù & lắng (Không tan)
          </h3>
          <dl>
            <div className="content-row">
              <dt>Tổng lượng cát</dt>
              <dd>{formatPhaseMass(snapshot.mass.St)}</dd>
            </div>
            <div className="content-row">
              <dt>Cát lắng ở đáy cốc</dt>
              <dd>{formatPhaseMass(snapshot.mass.Sb)}</dd>
            </div>
            <div className="content-row">
              <dt>Cát lơ lửng trong chất lỏng</dt>
              <dd>{formatPhaseMass(snapshot.mass.Ss)}</dd>
            </div>
          </dl>
        </div>
      )}

      {snapshot.mass.Ot > 0 && (
        <div style={{ marginTop: '8px', borderTop: '1px solid #edf1f2', paddingTop: '6px' }}>
          <h3 style={{ fontSize: '12px', margin: '0 0 6px 0', color: '#244c5b' }}>
            Pha dầu — Nhũ tương & tách lớp (Không tan)
          </h3>
          <dl>
            <div className="content-row">
              <dt>Tổng lượng dầu</dt>
              <dd>{formatPhaseMass(snapshot.mass.Ot)}</dd>
            </div>
            <div className="content-row">
              <dt>Dầu thành lớp nổi</dt>
              <dd>{formatPhaseMass(snapshot.mass.Ol)}</dd>
            </div>
            <div className="content-row">
              <dt>Dầu phân tán thành giọt</dt>
              <dd>{formatPhaseMass(snapshot.mass.Od)}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Badges and Educational Observation */}
      <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }} role="status" aria-label="Thẻ trạng thái khoa học">
        {evaluation.isFullyDissolved && (
          <span style={{ fontSize: '10px', background: '#d4edda', color: '#155724', padding: '3px 7px', borderRadius: '4px', fontWeight: 600 }}>
            Đường tan hoàn toàn
          </span>
        )}
        {evaluation.isNearComplete && (
          <span style={{ fontSize: '10px', background: '#e2e3e5', color: '#383d41', padding: '3px 7px', borderRadius: '4px', fontWeight: 600 }}>
            Đường tan gần hết
          </span>
        )}
        {evaluation.isSaturated && (
          <span style={{ fontSize: '10px', background: '#fff3cd', color: '#856404', padding: '3px 7px', borderRadius: '4px', fontWeight: 600 }}>
            Đạt giới hạn hòa tan (trong sai số)
          </span>
        )}
        {evaluation.isNearSaturation && (
          <span style={{ fontSize: '10px', background: '#fff3cd', color: '#856404', padding: '3px 7px', borderRadius: '4px', fontWeight: 600 }}>
            Gần bão hòa
          </span>
        )}
        {evaluation.hasExcess && (
          <span style={{ fontSize: '10px', background: '#f8d7da', color: '#721c24', padding: '3px 7px', borderRadius: '4px', fontWeight: 600 }}>
            Có đường dư
          </span>
        )}
        {evaluation.isSettling && (
          <span style={{ fontSize: '10px', background: '#ffedd5', color: '#9a3412', padding: '3px 7px', borderRadius: '4px', fontWeight: 600 }}>
            Cát đang lắng
          </span>
        )}
        {evaluation.isSandSuspended && !evaluation.isSettling && (
          <span style={{ fontSize: '10px', background: '#e0f2fe', color: '#0369a1', padding: '3px 7px', borderRadius: '4px', fontWeight: 600 }}>
            Cát lơ lửng
          </span>
        )}
        {snapshot.mass.St > 0 && !evaluation.isSandSuspended && !evaluation.isSettling && (
          <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '3px 7px', borderRadius: '4px', fontWeight: 600 }}>
            Cát đọng đáy
          </span>
        )}
        {evaluation.isSeparating && (
          <span style={{ fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '3px 7px', borderRadius: '4px', fontWeight: 600 }}>
            Dầu đang tách lớp
          </span>
        )}
        {evaluation.isOilDispersed && !evaluation.isSeparating && (
          <span style={{ fontSize: '10px', background: '#fef9c3', color: '#854d0e', padding: '3px 7px', borderRadius: '4px', fontWeight: 600 }}>
            Dầu phân tán
          </span>
        )}
        {snapshot.mass.Ot > 0 && !evaluation.isOilDispersed && !evaluation.isSeparating && (
          <span style={{ fontSize: '10px', background: '#fef3c7', color: '#78350f', padding: '3px 7px', borderRadius: '4px', fontWeight: 600 }}>
            Dầu phân tầng
          </span>
        )}
      </div>

      <div style={{
        marginTop: '12px',
        padding: '10px',
        background: '#f4f8f9',
        borderLeft: '3px solid #278397',
        borderRadius: '4px',
        fontSize: '11px',
        lineHeight: '1.5',
        color: '#345561'
      }}>
        <strong>Nhận xét: </strong>{evaluation.explanation}
      </div>

      {/* Group 3: Mass vs Time Chart */}
      <MassTimeChart />

      {/* Visual Legend */}
      <div style={{ marginTop: '16px', borderTop: '1px solid #edf1f2', paddingTop: '12px' }}>
        <h3 style={{ fontSize: '12px', margin: '0 0 8px 0', color: '#244c5b' }}>
          Chú giải trực quan
        </h3>
        <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: '#556e79', lineHeight: 1.6 }}>
          <li><strong style={{ color: '#0284c7' }}>Nước:</strong> Dung môi lỏng trong suốt (xanh lam nhạt).</li>
          <li><strong style={{ color: '#475569' }}>Đường rắn:</strong> Hạt tinh thể trắng ở đáy / lơ lửng. Khi tan, đường hòa tan ở cấp phân tử và không còn hiển thị hạt.</li>
          <li><strong style={{ color: '#b45309' }}>Cát:</strong> Hạt màu nâu ở đáy hoặc lơ lửng khi khuấy (không tan).</li>
          <li><strong style={{ color: '#d97706' }}>Dầu:</strong> Lớp vàng nổi trên mặt hoặc giọt phân tán trong nước (không tan).</li>
        </ul>
        <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#88989f', fontStyle: 'italic' }}>
          * Màu nước hoặc số hạt hiển thị chỉ minh họa trực quan, không dùng thay thế số liệu khối lượng trên bảng.
        </p>
      </div>

      <div className="capacity-label">
        <span>Mức chiếm chỗ minh họa</span>
        <strong>{occupiedMl} / 500 ml</strong>
      </div>
      <progress aria-label="Mức chiếm chỗ minh họa" value={occupiedMilliMl / 1000} max={500} />
      <p className="footnote">
        Quy đổi thể tích hạt chỉ phục vụ hiển thị, không phải kết quả đo.
      </p>

      {/* About the Model */}
      <details style={{ marginTop: '12px', borderTop: '1px solid #edf1f2', paddingTop: '8px', fontSize: '11px', color: '#64748b' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#334155' }}>
          Về mô hình mô phỏng
        </summary>
        <div style={{ marginTop: '6px', lineHeight: 1.5, background: '#f8fafc', padding: '8px', borderRadius: '6px' }}>
          <p style={{ margin: '0 0 6px 0' }}>
            • Đây là mô hình mô phỏng giáo dục gần đúng phục vụ học tập trực quan.
          </p>
          <p style={{ margin: '0 0 6px 0' }}>
            • Các hệ số động học (hòa tan, nâng/lắng cát, phân tán/tách dầu) là các tham số giáo khoa mặc định, chưa qua hiệu chuẩn định lượng thực nghiệm.
          </p>
          <p style={{ margin: '0 0 6px 0' }}>
            • Thể tích cốc 500 ml sử dụng quy đổi chiếm chỗ thể tích minh họa.
          </p>
          <p style={{ margin: 0 }}>
            • Mô hình hiện tại không mô phỏng biến thiên nhiệt độ, thủy động lực học Navier-Stokes (CFD) hay tương tác cấp độ phân tử.
          </p>
        </div>
      </details>
    </section>
  );
}
