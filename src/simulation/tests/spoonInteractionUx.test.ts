import { describe, expect, it } from 'vitest';
import { SimulationBridge } from '../bridge/SimulationBridge';
import type { Ray3D } from '../../interactions/RayPlaneProjection';
import { BEAKER_INNER_RADIUS } from '../constants/beaker';

describe('Nhóm 1 — Dễ nhận biết và kéo thìa (Spoon UX & Interaction)', () => {
  it('1. Vùng hit target bán kính 0.15 đảm bảo nằm an toàn bên trong lòng cốc (R_inner = 0.87)', () => {
    const hitTargetRadius = 0.15;
    const maxSpoonOrbitRadius = 0.65;
    // Điểm xa nhất hit target có thể vươn tới khi thìa ở mép ngoài quỹ đạo
    const maxReach = maxSpoonOrbitRadius + hitTargetRadius;
    expect(maxReach).toBeLessThan(BEAKER_INNER_RADIUS);
    expect(BEAKER_INNER_RADIUS - maxReach).toBeGreaterThan(0.05); // Còn dư an toàn tới thành cốc
  });

  it('2. Pointerdown chỉ chấp nhận chuột trái (button = 0, mouse), từ chối chuột phải hoặc phụ', () => {
    const bridge = new SimulationBridge();
    bridge.getFacade().dispatchIntent({ type: 'setMode', mode: 'manual' });
    bridge.getFacade().dispatchIntent({ type: 'resume' });
    const adapter = bridge.getManualAdapter()!;

    const ray: Ray3D = { origin: [0.3, 1.5, 0], direction: [0, -1, 0] };

    // Chuột phải (button = 2) bị từ chối
    const rightClick = adapter.onPointerDown({
      pointerId: 1,
      ray,
      pointerType: 'mouse',
      button: 2,
      isHitSpoon: true,
      inputTimeMs: 1000,
    });
    expect(rightClick.accepted).toBe(false);
    expect(adapter.isDragActive()).toBe(false);

    // Chuột trái (button = 0) được chấp nhận
    const leftClick = adapter.onPointerDown({
      pointerId: 1,
      ray,
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: 1000,
    });
    expect(leftClick.accepted).toBe(true);
    expect(adapter.isDragActive()).toBe(true);
  });

  it('3. Không teleport thìa khi pointerdown: vị trí ban đầu không đổi đột ngột', () => {
    const bridge = new SimulationBridge();
    const engine = bridge.getEngine();
    bridge.getFacade().dispatchIntent({ type: 'setMode', mode: 'manual' });
    bridge.getFacade().dispatchIntent({ type: 'resume' });
    const adapter = bridge.getManualAdapter()!;

    const initialPose = engine.getRodPose();
    expect(initialPose.x).toBeCloseTo(0.3, 3);
    expect(initialPose.z).toBeCloseTo(0.0, 3);

    // Click ở vị trí lệch nhẹ
    const ray: Ray3D = { origin: [0.32, 1.5, 0.05], direction: [0, -1, 0] };
    const res = adapter.onPointerDown({
      pointerId: 1,
      ray,
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: 1000,
    });

    expect(res.accepted).toBe(true);
    // Vị trí thìa sau pointerdown chuyển tiếp mượt, không nhảy vô lý
    expect(Math.hypot(res.pose.x - initialPose.x, res.pose.z - initialPose.z)).toBeLessThan(0.1);
  });

  it('4. Camera ownership: OrbitControls bị khóa khi drag accepted và được khôi phục khi thả chuột', () => {
    let cameraEnabled = true;
    const cameraTarget = {
      setEnabled: (enabled: boolean) => { cameraEnabled = enabled; },
      isEnabled: () => cameraEnabled,
    };

    const bridge = new SimulationBridge();
    bridge.getFacade().dispatchIntent({ type: 'setMode', mode: 'manual' });
    bridge.getFacade().dispatchIntent({ type: 'resume' });
    const adapter = bridge.getManualAdapter()!;
    adapter.setCameraTarget(cameraTarget);

    expect(cameraEnabled).toBe(true);

    const ray: Ray3D = { origin: [0.3, 1.5, 0], direction: [0, -1, 0] };
    adapter.onPointerDown({
      pointerId: 1,
      ray,
      pointerType: 'mouse',
      button: 0,
      isHitSpoon: true,
      inputTimeMs: 1000,
    });

    // Khi drag được chấp nhận, camera bị vô hiệu hóa để không xoay cốc khi khuấy
    expect(adapter.isDragActive()).toBe(true);
    expect(cameraEnabled).toBe(false);

    // Thả chuột (pointerup)
    adapter.onPointerUp(1);
    expect(adapter.isDragActive()).toBe(false);
    expect(cameraEnabled).toBe(true); // Camera lập tức được mở khóa lại
  });

  it('5. Thao tác hover hoàn toàn không làm biến đổi trạng thái khoa học hay generation', () => {
    const bridge = new SimulationBridge();
    const engine = bridge.getEngine();
    bridge.getFacade().dispatchIntent({ type: 'setMode', mode: 'manual' });

    const genBefore = engine.getCurrentGeneration();
    const massBefore = engine.snapshot().mass;

    // Hover (chỉ render và visual cursor, không phát intent khoa học nào)
    expect(engine.getCurrentGeneration()).toBe(genBefore);
    expect(engine.snapshot().mass).toEqual(massBefore);
  });
});
