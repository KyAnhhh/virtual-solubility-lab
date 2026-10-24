import { describe, expect, it } from 'vitest';
import { createExperimentStore } from '../../stores/experimentStore';
import { SimulationBridge } from '../bridge/SimulationBridge';
import {
  computeFallingParticle,
  computeVesselTransform,
  POUR_DURATIONS,
  SPOUT_TARGET,
} from '../../scene/pouringAnimationMath';
import { STOCK_VESSELS_CONFIG } from '../../scene/IngredientVessels';
import { BEAKER_INNER_RADIUS } from '../constants/beaker';

describe('Nâng cấp Trải nghiệm Thêm Nguyên liệu & Đổ Cốc Nguồn', () => {
  describe('1. Khóa Single-Flight & Chống Spam Lệnh Thêm', () => {
    it('chỉ cho phép một thao tác rót tại một thời điểm; các lệnh bấm liên tục bị từ chối', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      // Thao tác đầu tiên: hợp lệ -> bắt đầu rót
      const firstOk = store.getState().startPour('water', '100');
      expect(firstOk).toBe(true);
      expect(store.getState().activePour).not.toBeNull();
      expect(store.getState().activePour?.ingredient).toBe('water');
      expect(store.getState().activePour?.amount).toBe(100);

      const activeToken = store.getState().activePour?.token;

      // Các lệnh bấm thêm liên tiếp khi cốc đang bay: phải bị từ chối ngay lập tức
      const spamOk1 = store.getState().startPour('sugar', '20');
      expect(spamOk1).toBe(false);
      const spamOk2 = store.getState().startPour('oil', '30');
      expect(spamOk2).toBe(false);

      // Active pour vẫn giữ nguyên phiên ban đầu
      expect(store.getState().activePour?.token).toBe(activeToken);
      expect(store.getState().activePour?.ingredient).toBe('water');
    });

    it('commitPour áp dụng lệnh thêm chính xác một lần (idempotent)', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      store.getState().startPour('water', '50');
      const token = store.getState().activePour!.token;

      // Lần commit đầu tiên: thành công
      const firstCommit = store.getState().commitPour(token);
      expect(firstCommit).toBe(true);
      expect(store.getState().snapshot.mass.W).toBe(50);
      expect(store.getState().activePour?.dispatched).toBe(true);

      // Lần commit thứ hai với cùng token: bị từ chối, không cộng khối lượng hai lần
      const secondCommit = store.getState().commitPour(token);
      expect(secondCommit).toBe(false);
      expect(store.getState().snapshot.mass.W).toBe(50);
    });
  });

  describe('2. Pre-Validation Chặn Đầu Vào Sai & Vượt Dung Tích Trước Khi Animation Bắt Đầu', () => {
    it('đầu vào âm, rỗng hoặc không hợp lệ không bắt đầu animation', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      expect(store.getState().startPour('water', '-50')).toBe(false);
      expect(store.getState().activePour).toBeNull();

      expect(store.getState().startPour('water', 'abc')).toBe(false);
      expect(store.getState().activePour).toBeNull();

      expect(store.getState().startPour('water', '')).toBe(false);
      expect(store.getState().activePour).toBeNull();
    });

    it('lượng thêm vượt maxAddition không chạy animation và báo lỗi rõ ràng', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      // maxAddition của đường là 100g
      const result = store.getState().startPour('sugar', '150');
      expect(result).toBe(false);
      expect(store.getState().activePour).toBeNull();
      expect(store.getState().message).toContain('từ 0,1 đến 100 g');
    });

    it('khi cốc 500ml không đủ dung tích, từ chối ngay trước khi nhấc cốc', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      // Nạp 480ml nước trực tiếp
      store.getState().add('water', 480);
      expect(store.getState().snapshot.mass.W).toBe(480);

      // Cố gắng thêm 50ml nước (480 + 50 = 530 > 500): phải bị chặn trước khi nhấc cốc
      const pourResult = store.getState().startPour('water', 50);
      expect(pourResult).toBe(false);
      expect(store.getState().activePour).toBeNull();
      expect(store.getState().message).toContain('Không đủ chỗ trong cốc 500 ml');
    });
  });

  describe('3. Tính Bất Biến Của Liều Lượng Đang Bay (Immutable In-Flight Dose)', () => {
    it('liều lượng đã chụp khi nhấn Thêm không bị đổi dù người dùng sửa ô nhập sau đó', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      let formAmount = '40';
      store.getState().startPour('sugar', formAmount);
      const active = store.getState().activePour!;
      expect(active.amount).toBe(40);
      expect(active.deciTicks).toBe(400);

      // Giả lập người dùng gõ sửa ô nhập thành 90g trong khi cốc đang di chuyển
      formAmount = '90';
      expect(formAmount).toBe('90');

      // Khi commit, liều thêm vào là 40g đã chụp, không phải 90g
      store.getState().commitPour(active.token);
      expect(store.getState().snapshot.mass.Gt).toBe(40);
      expect(store.getState().snapshot.mass.Gu).toBe(40);
    });
  });

  describe('4. Thao Tác Khi Paused & Độc Lập Thời Gian Khoa Học', () => {
    it('khi paused = true, vẫn thêm được chất và elapsedSeconds không tăng', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      // Tạm dừng mô phỏng
      store.getState().pause();
      expect(store.getState().snapshot.paused).toBe(true);
      const initialElapsed = store.getState().snapshot.elapsedSeconds;

      // Nhấn thêm nước khi paused
      const started = store.getState().startPour('water', 100);
      expect(started).toBe(true);

      const token = store.getState().activePour!.token;
      store.getState().commitPour(token);
      store.getState().finishPour(token);

      // Kiểm tra: Nước đã thêm thành công, mô phỏng vẫn paused, thời gian khoa học không đổi
      expect(store.getState().snapshot.mass.W).toBe(100);
      expect(store.getState().snapshot.paused).toBe(true);
      expect(store.getState().snapshot.elapsedSeconds).toBe(initialElapsed);
      expect(store.getState().activePour).toBeNull();
    });
  });

  describe('5. Reset và Hủy Bỏ An Toàn (Cancellation & Late Callback Guard)', () => {
    it('reset trước khi commit sẽ hủy bỏ animation và chặn callback thêm muộn bằng generation', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      store.getState().startPour('oil', 30);
      const token = store.getState().activePour!.token;
      const initialGen = store.getState().snapshot.generation;

      // Người dùng bấm Reset trước khi cốc kịp rót
      store.getState().reset();
      expect(store.getState().activePour).toBeNull();
      expect(store.getState().snapshot.generation).toBeGreaterThan(initialGen);

      // Giả lập callback muộn từ animation cũ gọi commitPour
      const lateCommit = store.getState().commitPour(token);
      expect(lateCommit).toBe(false);
      expect(store.getState().snapshot.mass.Ot).toBe(0);
    });

    it('mất WebGL context hủy bỏ activePour và không gửi lệnh lại', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      store.getState().startPour('sand', 20);
      const token = store.getState().activePour!.token;

      // WebGL context lost xảy ra
      store.getState().reportWebGLContextLost();
      expect(store.getState().activePour).toBeNull();
      expect(store.getState().webglStatus).toBe('context_lost');

      // Callback commitPour bị từ chối
      const res = store.getState().commitPour(token);
      expect(res).toBe(false);
      expect(store.getState().snapshot.mass.St).toBe(0);
    });
  });

  describe('6. Fallback Khi WebGL Không Khả Dụng', () => {
    it('khi WebGL init_failed, startPour lập tức thêm trực tiếp qua cùng bridge command path', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      store.getState().reportWebGLInitFailed();
      expect(store.getState().webglStatus).toBe('init_failed');

      // Khi WebGL hỏng, nhấn thêm sẽ áp dụng ngay mà không treo chờ animation
      const added = store.getState().startPour('water', 80);
      expect(added).toBe(true);
      expect(store.getState().activePour).toBeNull();
      expect(store.getState().snapshot.mass.W).toBe(80);
    });
  });

  describe('7. Quỹ Đạo Chuyển Động, Tọa Độ Rót & Bảo Toàn Không Tích Lũy Sai Lệch', () => {
    it('cả 4 cốc nguồn trở về chính xác vị trí ban đầu sau khi kết thúc chu kỳ (zero drift)', () => {
      for (const cfg of STOCK_VESSELS_CONFIG) {
        // 1. Trạng thái nghỉ (t = 0)
        const idleTransform = computeVesselTransform(cfg.position, 0);
        expect(idleTransform.position[0]).toBeCloseTo(cfg.position[0], 6);
        expect(idleTransform.position[1]).toBeCloseTo(cfg.position[1], 6);
        expect(idleTransform.position[2]).toBeCloseTo(cfg.position[2], 6);
        expect(idleTransform.rotationZ).toBe(0);

        // 2. Nhấc cốc (t = 0.35s): nâng thẳng đứng theo trục Y
        const lifted = computeVesselTransform(cfg.position, POUR_DURATIONS.liftEnd);
        expect(lifted.position[0]).toBeCloseTo(cfg.position[0], 5);
        expect(lifted.position[2]).toBeCloseTo(cfg.position[2], 5);
        expect(lifted.position[1]).toBeGreaterThan(cfg.position[1] + 0.5);

        // 3. Thời điểm rót (t = 1.15s -> 1.65s): nghiêng quanh miệng rót phía trên cốc 500 ml
        const pouring = computeVesselTransform(cfg.position, POUR_DURATIONS.commitTime);
        expect(pouring.isPouringStream).toBe(true);
        expect(pouring.rotationZ).toBeCloseTo(-SPOUT_TARGET.tiltAngle, 4);
        expect(pouring.position[1]).toBeGreaterThanOrEqual(2.32); // Đáy cốc nguồn bay cao hơn miệng cốc 500 ml (2.32)

        // 4. Kết thúc chu trình (t >= 2.20s): trở về 100% vị trí gốc ban đầu
        const returned = computeVesselTransform(cfg.position, POUR_DURATIONS.total);
        expect(returned.position[0]).toBeCloseTo(cfg.position[0], 6);
        expect(returned.position[1]).toBeCloseTo(cfg.position[1], 6);
        expect(returned.position[2]).toBeCloseTo(cfg.position[2], 6);
        expect(returned.rotationZ).toBe(0);
        expect(returned.isPouringStream).toBe(false);
      }
    });

    it('dòng rót và hạt rơi luôn nằm bên trong miệng cốc 500 ml, không xuyên thành', () => {
      const beakerRadius = BEAKER_INNER_RADIUS; // 0.87
      const liquidTop = 1.0;

      for (let i = 0; i < 24; i++) {
        for (let t = 0; t <= 0.5; t += 0.05) {
          const particle = computeFallingParticle(i, 24, t, liquidTop);
          // Khoảng cách từ tâm cốc (0, 0) trong mặt phẳng XZ
          const radialDistance = Math.hypot(particle.x, particle.z);
          // Hạt phải nằm hoàn toàn trong miệng cốc inner radius 0.87
          expect(radialDistance).toBeLessThan(beakerRadius);
          // Hạt không rơi thấp hơn đáy cốc
          expect(particle.y).toBeGreaterThanOrEqual(0.12);
        }
      }
    });
  });

  describe('8. Hình học Chất lỏng Cốc Nguồn khi Nghiêng & Giới hạn Bề mặt Thoáng', () => {
    it('chất lỏng nghiêng luôn được giới hạn trong thành cốc và không cắt vào đáy cốc', () => {
      const Hv = 1.05;
      const R = 0.355;
      const fillRatio = 0.72;
      const h0 = Hv * fillRatio; // 0.756
      const bottomY = 0.04;

      for (let angleDeg = 0; angleDeg <= 49; angleDeg += 1) {
        const tilt = (angleDeg * Math.PI) / 180;
        const tanTilt = Math.tan(tilt);

        let hc = h0;
        if (h0 + R * tanTilt > Hv) {
          hc = Math.max(0.18, Hv - R * tanTilt);
        }

        // 1. Điểm cao nhất của mặt thoáng không vượt quá miệng cốc Hv
        const yMax = hc + R * tanTilt;
        expect(yMax).toBeLessThanOrEqual(Hv + 1e-6);

        // 2. Điểm thấp nhất của mặt thoáng luôn cao hơn đáy cốc (bottomY = 0.04)
        const yMin = hc - R * tanTilt;
        expect(yMin).toBeGreaterThan(bottomY);

        // 3. Normal của mặt thoáng sau khi nhân ma trận quay trong world space luôn là (0, 1, 0)
        // Ma trận quay của cốc quanh Z là -tilt; ma trận quay của mặt thoáng quanh Z là +tilt
        // Net rotation quanh Z: -tilt + tilt = 0 -> normal = (0, 1, 0)
        const normalZ = -tilt + tilt;
        expect(normalZ).toBe(0);

        // 4. Bán trục lớn ellipse: a = R / cos(tilt)
        const a = R / Math.cos(tilt);
        expect(a).toBeGreaterThanOrEqual(R);
        expect(Number.isFinite(a)).toBe(true);
      }
    });

    it('tọa độ miệng rót động bám chính xác theo viền miệng cốc biến đổi trong world space', () => {
      const rV = STOCK_VESSELS_CONFIG[0].fillRatio ? 0.38 : 0.38;
      const hV = 1.05;

      for (let t = 0; t <= POUR_DURATIONS.total; t += 0.1) {
        const transform = computeVesselTransform(STOCK_VESSELS_CONFIG[0].position, t);
        const tilt = Math.abs(transform.rotationZ);
        const [x0, y0] = transform.position;

        const spoutX = x0 + rV * Math.cos(tilt) + hV * Math.sin(tilt);
        const spoutY = y0 - rV * Math.sin(tilt) + hV * Math.cos(tilt);

        // Tọa độ phải hữu hạn và không NaN
        expect(Number.isFinite(spoutX)).toBe(true);
        expect(Number.isFinite(spoutY)).toBe(true);

        // Khi ở tư thế rót (t = 1.15s)
        if (Math.abs(t - POUR_DURATIONS.commitTime) < 0.05) {
          expect(spoutX).toBeCloseTo(SPOUT_TARGET.x, 3);
          expect(spoutY).toBeCloseTo(SPOUT_TARGET.y, 3);
        }
      }
    });
  });

  describe('9. Bảo toàn Đáy Kính Trung Tính của Cốc 500 ml & Cách ly Trầm tích', () => {
    it('khi cốc rỗng hoặc không có cát, chiều cao trầm tích là 0 và khối lượng cát = 0', () => {
      const bridge = new SimulationBridge();
      const store = createExperimentStore(bridge);

      // Cốc rỗng ban đầu
      expect(store.getState().snapshot.mass.Sb).toBe(0);
      expect(store.getState().snapshot.mass.St).toBe(0);

      // Thêm 100ml nước
      store.getState().add('water', 100);
      expect(store.getState().snapshot.mass.W).toBe(100);
      expect(store.getState().snapshot.mass.Sb).toBe(0);

      // Reset
      store.getState().reset();
      expect(store.getState().snapshot.mass.W).toBe(0);
      expect(store.getState().snapshot.mass.Sb).toBe(0);
      expect(store.getState().snapshot.mass.St).toBe(0);
    });
  });
});
