import { useEffect, useRef, useState } from 'react';
import { useExperimentStore } from '../../stores/experimentStore';

export interface ChartDataPoint {
  t: number;  // Simulated time in seconds
  Gd: number; // Dissolved sugar in grams
  Ss: number; // Suspended sand in grams
  Od: number; // Dispersed oil in grams
}

export const MAX_CHART_POINTS = 300;
export const SAMPLING_INTERVAL_SEC = 0.2; // 5Hz sampling of simulated time

export function MassTimeChart() {
  const snapshot = useExperimentStore((s) => s.snapshot);
  const additions = useExperimentStore((s) => s.additions);

  // Series visibility toggles
  const [showGd, setShowGd] = useState(true);
  const [showSs, setShowSs] = useState(true);
  const [showOd, setShowOd] = useState(true);

  // Hover state for interactive inspection
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const historyRef = useRef<ChartDataPoint[]>([
    { t: 0, Gd: 0, Ss: 0, Od: 0 },
  ]);
  const lastGenRef = useRef<number>(snapshot.generation);
  const [, setTick] = useState(0);

  // Sample snapshot according to simulated time (SCIENTIFIC_SPEC §8)
  useEffect(() => {
    // 1. Generation reset: clear history
    if (snapshot.generation !== lastGenRef.current) {
      lastGenRef.current = snapshot.generation;
      historyRef.current = [
        {
          t: 0,
          Gd: snapshot.mass.Gd,
          Ss: snapshot.mass.Ss,
          Od: snapshot.mass.Od,
        },
      ];
      setHoverIndex(null);
      setTick((n) => n + 1);
      return;
    }

    const t = snapshot.elapsedSeconds;
    const history = historyRef.current;
    const lastPoint = history[history.length - 1];

    if (!lastPoint) {
      history.push({
        t,
        Gd: snapshot.mass.Gd,
        Ss: snapshot.mass.Ss,
        Od: snapshot.mass.Od,
      });
      setTick((n) => n + 1);
      return;
    }

    // 2. Same simulated time (e.g. paused or additions made while paused)
    if (Math.abs(t - lastPoint.t) < 0.001) {
      lastPoint.Gd = snapshot.mass.Gd;
      lastPoint.Ss = snapshot.mass.Ss;
      lastPoint.Od = snapshot.mass.Od;
      setTick((n) => n + 1);
      return;
    }

    // 3. Simulated time advanced: sample if interval >= 0.2s (5Hz)
    if (t - lastPoint.t >= SAMPLING_INTERVAL_SEC) {
      history.push({
        t,
        Gd: snapshot.mass.Gd,
        Ss: snapshot.mass.Ss,
        Od: snapshot.mass.Od,
      });

      // Bounded storage: downsample first half when exceeding capacity
      if (history.length > MAX_CHART_POINTS) {
        const decimated: ChartDataPoint[] = [];
        const half = Math.floor(history.length / 2);
        for (let i = 0; i < history.length; i++) {
          if (i < half) {
            if (i % 2 === 0) decimated.push(history[i]);
          } else {
            decimated.push(history[i]);
          }
        }
        historyRef.current = decimated;
      }

      setTick((n) => n + 1);
    }
  }, [snapshot]);

  const history = historyRef.current;
  const hasRelevantSolute =
    snapshot.mass.Gt > 0 || snapshot.mass.St > 0 || snapshot.mass.Ot > 0 || additions.length > 0;

  // Chart coordinates
  const svgWidth = 280;
  const svgHeight = 130;
  const padLeft = 32;
  const padRight = 14;
  const padTop = 12;
  const padBottom = 22;

  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const maxT = Math.max(5, history[history.length - 1]?.t ?? 5);

  let maxMass = 5;
  for (const p of history) {
    if (showGd && p.Gd > maxMass) maxMass = p.Gd;
    if (showSs && p.Ss > maxMass) maxMass = p.Ss;
    if (showOd && p.Od > maxMass) maxMass = p.Od;
  }
  // Add 15% headroom
  const maxY = Math.ceil(maxMass * 1.15);

  const scaleX = (t: number) => padLeft + (t / maxT) * plotW;
  const scaleY = (m: number) => padTop + plotH - (m / maxY) * plotH;

  const makePath = (key: 'Gd' | 'Ss' | 'Od') => {
    if (history.length === 0) return '';
    return history
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.t).toFixed(1)} ${scaleY(p[key]).toFixed(1)}`)
      .join(' ');
  };

  const pathGd = showGd ? makePath('Gd') : '';
  const pathSs = showSs ? makePath('Ss') : '';
  const pathOd = showOd ? makePath('Od') : '';

  // Current or inspected data point
  const activePoint =
    hoverIndex !== null && history[hoverIndex]
      ? history[hoverIndex]
      : history[history.length - 1] ?? { t: 0, Gd: 0, Ss: 0, Od: 0 };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const normX = (mouseX - padLeft) / plotW;
    const targetT = normX * maxT;

    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < history.length; i++) {
      const diff = Math.abs(history[i].t - targetT);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    setHoverIndex(closestIdx);
  };

  return (
    <div
      style={{
        marginTop: '16px',
        borderTop: '1px solid #edf1f2',
        paddingTop: '12px',
      }}
      aria-label="Đồ thị khối lượng theo thời gian"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <h3 style={{ fontSize: '12px', margin: 0, color: '#1e3a47', fontWeight: 600 }}>
          Biến thiên khối lượng theo thời gian
        </h3>
        <span style={{ fontSize: '10px', color: '#64748b' }}>Trục t: mô phỏng</span>
      </div>

      {!hasRelevantSolute ? (
        <div
          style={{
            padding: '16px 12px',
            background: '#f8fafc',
            border: '1px dashed #cbd5e1',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#64748b',
            textAlign: 'center',
          }}
        >
          Chưa có đường, cát hoặc dầu trong cốc để vẽ biểu đồ biến thiên.
        </div>
      ) : (
        <>
          {/* Series Toggle Pills */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowGd(!showGd)}
              style={{
                fontSize: '10px',
                padding: '3px 8px',
                borderRadius: '12px',
                border: '1px solid #0284c7',
                background: showGd ? '#e0f2fe' : '#ffffff',
                color: showGd ? '#0369a1' : '#94a3b8',
                fontWeight: showGd ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Bật / tắt hiển thị đường đã tan Gd"
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#0284c7',
                }}
              />
              Đường tan (Gd)
            </button>

            <button
              type="button"
              onClick={() => setShowSs(!showSs)}
              style={{
                fontSize: '10px',
                padding: '3px 8px',
                borderRadius: '12px',
                border: '1px solid #d97706',
                background: showSs ? '#fef3c7' : '#ffffff',
                color: showSs ? '#b45309' : '#94a3b8',
                fontWeight: showSs ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Bật / tắt hiển thị cát lơ lửng Ss"
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#d97706',
                }}
              />
              Cát lơ lửng (Ss)
            </button>

            <button
              type="button"
              onClick={() => setShowOd(!showOd)}
              style={{
                fontSize: '10px',
                padding: '3px 8px',
                borderRadius: '12px',
                border: '1px solid #eab308',
                background: showOd ? '#fef9c3' : '#ffffff',
                color: showOd ? '#a16207' : '#94a3b8',
                fontWeight: showOd ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Bật / tắt hiển thị dầu phân tán Od"
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#eab308',
                }}
              />
              Dầu phân tán (Od)
            </button>
          </div>

          {/* SVG Chart Container */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '4px',
              position: 'relative',
            }}
          >
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverIndex(null)}
            >
              {/* Grid Lines Y */}
              {[0, 0.5, 1].map((ratio) => {
                const y = padTop + plotH * (1 - ratio);
                const val = (maxY * ratio).toFixed(0);
                return (
                  <g key={ratio}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={padLeft + plotW}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray="2,2"
                    />
                    <text
                      x={padLeft - 4}
                      y={y + 3}
                      textAnchor="end"
                      fontSize="8"
                      fill="#94a3b8"
                      fontFamily="sans-serif"
                    >
                      {val}g
                    </text>
                  </g>
                );
              })}

              {/* Grid Lines X */}
              {[0, 0.5, 1].map((ratio) => {
                const x = padLeft + plotW * ratio;
                const val = (maxT * ratio).toFixed(1);
                return (
                  <g key={ratio}>
                    <line
                      x1={x}
                      y1={padTop}
                      x2={x}
                      y2={padTop + plotH}
                      stroke="#e2e8f0"
                      strokeDasharray="2,2"
                    />
                    <text
                      x={x}
                      y={padTop + plotH + 14}
                      textAnchor="middle"
                      fontSize="8"
                      fill="#94a3b8"
                      fontFamily="sans-serif"
                    >
                      {val}s
                    </text>
                  </g>
                );
              })}

              {/* Main Axes */}
              <line
                x1={padLeft}
                y1={padTop}
                x2={padLeft}
                y2={padTop + plotH}
                stroke="#cbd5e1"
                strokeWidth="1.2"
              />
              <line
                x1={padLeft}
                y1={padTop + plotH}
                x2={padLeft + plotW}
                y2={padTop + plotH}
                stroke="#cbd5e1"
                strokeWidth="1.2"
              />

              {/* Series Curves */}
              {showOd && pathOd && (
                <path
                  d={pathOd}
                  fill="none"
                  stroke="#eab308"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {showSs && pathSs && (
                <path
                  d={pathSs}
                  fill="none"
                  stroke="#d97706"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {showGd && pathGd && (
                <path
                  d={pathGd}
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Hover Crosshair Cursor */}
              {hoverIndex !== null && history[hoverIndex] && (
                <g>
                  <line
                    x1={scaleX(history[hoverIndex].t)}
                    y1={padTop}
                    x2={scaleX(history[hoverIndex].t)}
                    y2={padTop + plotH}
                    stroke="#64748b"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                  />
                  {showGd && (
                    <circle
                      cx={scaleX(history[hoverIndex].t)}
                      cy={scaleY(history[hoverIndex].Gd)}
                      r="3.5"
                      fill="#0284c7"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  )}
                  {showSs && (
                    <circle
                      cx={scaleX(history[hoverIndex].t)}
                      cy={scaleY(history[hoverIndex].Ss)}
                      r="3.5"
                      fill="#d97706"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  )}
                  {showOd && (
                    <circle
                      cx={scaleX(history[hoverIndex].t)}
                      cy={scaleY(history[hoverIndex].Od)}
                      r="3.5"
                      fill="#eab308"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  )}
                </g>
              )}
            </svg>
          </div>

          {/* Value Readout / Accessibility Summary */}
          <div
            style={{
              marginTop: '6px',
              padding: '6px 8px',
              background: '#f1f5f9',
              borderRadius: '4px',
              fontSize: '11px',
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '4px',
            }}
          >
            <span>
              <strong>t:</strong> {activePoint.t.toFixed(1)}s
            </span>
            {showGd && (
              <span style={{ color: '#0369a1' }}>
                <strong>Gd:</strong> {activePoint.Gd.toFixed(1)}g
              </span>
            )}
            {showSs && (
              <span style={{ color: '#b45309' }}>
                <strong>Ss:</strong> {activePoint.Ss.toFixed(1)}g
              </span>
            )}
            {showOd && (
              <span style={{ color: '#a16207' }}>
                <strong>Od:</strong> {activePoint.Od.toFixed(1)}g
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
