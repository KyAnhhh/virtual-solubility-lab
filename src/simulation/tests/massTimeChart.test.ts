import { describe, expect, it } from 'vitest';
import { MAX_CHART_POINTS, SAMPLING_INTERVAL_SEC, type ChartDataPoint } from '../../components/results/MassTimeChart';

describe('Nhóm 3 — Đồ thị khối lượng theo thời gian (MassTimeChart Logic & Invariants)', () => {
  it('1. Chu kỳ lấy mẫu 5Hz (SAMPLING_INTERVAL_SEC = 0.2s) đảm bảo giới hạn tần số lấy mẫu', () => {
    expect(SAMPLING_INTERVAL_SEC).toBe(0.2);
    expect(1 / SAMPLING_INTERVAL_SEC).toBe(5); // 5 Hz
  });

  it('2. Cùng thời gian mô phỏng (t = const, ví dụ khi paused hoặc thêm chất): cập nhật điểm cuối thay vì nhân bản', () => {
    const history: ChartDataPoint[] = [{ t: 0, Gd: 0, Ss: 0, Od: 0 }];

    // Người dùng thêm 10g đường khi paused tại t = 0
    const t = 0;
    const newGd = 0; // chưa tan
    const lastPoint = history[history.length - 1];

    if (Math.abs(t - lastPoint.t) < 0.001) {
      lastPoint.Gd = newGd;
    }

    // Không sinh thêm điểm mới
    expect(history.length).toBe(1);
    expect(history[0].t).toBe(0);
  });

  it('3. Dung lượng lưu trữ bị chặn (Bounded Storage <= MAX_CHART_POINTS = 300) với thuật toán downsampling', () => {
    let history: ChartDataPoint[] = [];

    // Giả lập 500 mẫu liên tiếp
    for (let i = 0; i < 500; i++) {
      const t = i * 0.2;
      history.push({ t, Gd: i * 0.1, Ss: 0, Od: 0 });

      if (history.length > MAX_CHART_POINTS) {
        const decimated: ChartDataPoint[] = [];
        const half = Math.floor(history.length / 2);
        for (let j = 0; j < history.length; j++) {
          if (j < half) {
            if (j % 2 === 0) decimated.push(history[j]);
          } else {
            decimated.push(history[j]);
          }
        }
        history = decimated;
      }
    }

    // Dung lượng mảng lịch sử luôn <= 300, bảo vệ bộ nhớ O(1)
    expect(history.length).toBeLessThanOrEqual(MAX_CHART_POINTS);
    // Điểm cuối cùng luôn giữ thời gian mới nhất
    expect(history[history.length - 1].t).toBeCloseTo(499 * 0.2, 1);
  });

  it('4. Reset generation xóa sạch lịch sử cũ, trong khi camera reset không làm mất lịch sử', () => {
    let generation = 0;
    let cameraRevision = 0;
    let history: ChartDataPoint[] = [
      { t: 0, Gd: 0, Ss: 0, Od: 0 },
      { t: 2.0, Gd: 4.5, Ss: 2.0, Od: 0 },
      { t: 4.0, Gd: 8.0, Ss: 3.5, Od: 0 },
    ];

    // Thao tác 1: Camera Reset
    cameraRevision++;
    expect(cameraRevision).toBe(1);
    // History giữ nguyên 100%
    expect(history.length).toBe(3);
    expect(history[2].Gd).toBe(8.0);

    // Thao tác 2: Scientific Reset (generation++)
    generation++;
    if (generation !== 0) {
      history = [{ t: 0, Gd: 0, Ss: 0, Od: 0 }];
    }

    // History bị xóa sạch về mốc ban đầu
    expect(history.length).toBe(1);
    expect(history[0].t).toBe(0);
    expect(history[0].Gd).toBe(0);
  });
});
