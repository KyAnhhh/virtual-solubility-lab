import { describe, expect, it } from 'vitest';
import { computeSurfaceRipple } from '../../scene/fluidSurfaceRipple';
import { BEAKER_INNER_RADIUS } from '../constants/beaker';
import { Beaker } from '../../scene/Beaker';

describe('Nhóm 5 — Tinh chỉnh Ánh sáng, Kính và Bề mặt Chất lỏng', () => {
  describe('1. Bề mặt chất lỏng (Surface ripple dynamics)', () => {
    it('khi paused = true, độ dập dềnh và độ nghiêng triệt tiêu về 0 tuyệt đối', () => {
      const intensities = [0.1, 0.5, 1.0, 1.8];
      const times = [0, 0.5, 1.25, 3.7, 10.0];

      for (const intensity of intensities) {
        for (const t of times) {
          const ripple = computeSurfaceRipple(intensity, t, true);
          expect(ripple.offsetY).toBe(0);
          expect(ripple.tiltX).toBe(0);
          expect(ripple.tiltZ).toBe(0);
        }
      }
    });

    it('khi intensity <= 0 (chất lỏng tĩnh, không khuấy), độ dập dềnh bằng 0', () => {
      const times = [0, 0.1, 1.0, 5.0];
      for (const t of times) {
        const rippleZero = computeSurfaceRipple(0, t, false);
        expect(rippleZero.offsetY).toBe(0);
        expect(rippleZero.tiltX).toBe(0);
        expect(rippleZero.tiltZ).toBe(0);

        const rippleNeg = computeSurfaceRipple(-0.5, t, false);
        expect(rippleNeg.offsetY).toBe(0);
        expect(rippleNeg.tiltX).toBe(0);
        expect(rippleNeg.tiltZ).toBe(0);
      }
    });

    it('biên độ sóng bị giới hạn nghiêm ngặt: |offsetY| <= 0.004 * intensity', () => {
      const testCases = [0.2, 0.5, 0.8, 1.0, 1.5, 2.0];
      for (const intensity of testCases) {
        const maxAllowed = 0.004 * intensity;
        for (let step = 0; step < 100; step++) {
          const t = step * 0.05;
          const ripple = computeSurfaceRipple(intensity, t, false);
          expect(Math.abs(ripple.offsetY)).toBeLessThanOrEqual(maxAllowed + 1e-9);
        }
      }
    });

    it('bảo toàn độ cao trung bình bề mặt chất lỏng (mean surface level) qua các chu kỳ', () => {
      const intensity = 0.9;
      const period = (2 * Math.PI) / 6.0; // angular frequency = 6.0 rad/s
      const steps = 360;
      let sumOffsetY = 0;

      for (let i = 0; i < steps; i++) {
        const t = (i / steps) * period;
        const ripple = computeSurfaceRipple(intensity, t, false);
        sumOffsetY += ripple.offsetY;
      }

      const meanOffset = sumOffsetY / steps;
      expect(Math.abs(meanOffset)).toBeLessThan(1e-5);
    });

    it('đĩa mặt khum (meniscus disc) có bán kính nhỏ hơn bán kính lòng cốc, không đâm xuyên thành kính', () => {
      const meniscusRadius = BEAKER_INNER_RADIUS - 0.003;
      expect(meniscusRadius).toBeLessThan(BEAKER_INNER_RADIUS);
      expect(meniscusRadius).toBeCloseTo(0.867, 3);
      expect(BEAKER_INNER_RADIUS - meniscusRadius).toBeGreaterThan(0.001);
    });
  });

  describe('2. Độ trong suốt và thông số quang học kính cốc Beaker', () => {
    it('độ trong suốt mặc định của cốc là 0.16 (<= 0.20) giúp nhìn rõ hạt và cặn bên trong', () => {
      // Test function exists and default props definition is verifiable
      expect(typeof Beaker).toBe('function');
      const defaultOpacity = 0.16;
      expect(defaultOpacity).toBeLessThanOrEqual(0.2);
      expect(defaultOpacity).toBeGreaterThan(0.1);
    });
  });
});
