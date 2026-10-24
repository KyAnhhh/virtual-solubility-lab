import { describe, expect, it } from 'vitest';
import { updatePoolInstancedMesh } from '../../scene/particleMeshHelpers';
import type { RenderTarget } from '../core/SimulationState';
import { InstancedMesh, BoxGeometry, MeshBasicMaterial } from 'three';

describe('Nhóm 2 — Chuyển động hạt tự nhiên hơn & Giảm popping (Visual Scale Transitions)', () => {
  it('1. Hạt mới kích hoạt có scale bắt đầu 30% và tăng dần mượt mà, không pop đột ngột', () => {
    const geom = new BoxGeometry(1, 1, 1);
    const mat = new MeshBasicMaterial();
    const mesh = new InstancedMesh(geom, mat, 10);

    const target: RenderTarget & { radii: Float32Array } = {
      positions: new Float32Array(30),
      weights: new Float32Array(10),
      materials: new Uint8Array(10),
      radii: new Float32Array(10).fill(0.026),
      count: 10,
    };

    const scaleCache = new Float32Array(10);
    const defaultRadius = 0.026;

    // Frame 1: 1 hạt mới xuất hiện với dt = 0.016s (1 frame 60fps)
    updatePoolInstancedMesh(
      mesh,
      { offset: 0, count: 1 },
      target,
      defaultRadius,
      'sandBed',
      scaleCache,
      0.016,
      false
    );

    // Thang đo đầu tiên phải nhỏ hơn targetScale (giảm popping) nhưng lớn hơn 0
    expect(scaleCache[0]).toBeGreaterThan(0.005);
    expect(scaleCache[0]).toBeLessThan(defaultRadius);

    // Frame 2, 3, 4: Chạy thêm 100ms
    updatePoolInstancedMesh(
      mesh,
      { offset: 0, count: 1 },
      target,
      defaultRadius,
      'sandBed',
      scaleCache,
      0.100,
      false
    );

    // Scale tiệm cận mượt mà về targetScale
    expect(scaleCache[0]).toBeCloseTo(defaultRadius, 3);
    expect(scaleCache[0]).toBeLessThanOrEqual(defaultRadius + 1e-6);
  });

  it('2. Khi tạm dừng (paused, effectiveDt = 0), các giá trị scale visual đóng băng nguyên vẹn', () => {
    const geom = new BoxGeometry(1, 1, 1);
    const mat = new MeshBasicMaterial();
    const mesh = new InstancedMesh(geom, mat, 10);

    const target: RenderTarget & { radii: Float32Array } = {
      positions: new Float32Array(30),
      weights: new Float32Array(10),
      materials: new Uint8Array(10),
      radii: new Float32Array(10).fill(0.026),
      count: 10,
    };

    const scaleCache = new Float32Array(10);
    scaleCache[0] = 0.015;

    // Khi paused, effectiveDt truyền vào là 0
    updatePoolInstancedMesh(
      mesh,
      { offset: 0, count: 1 },
      target,
      0.026,
      'sandBed',
      scaleCache,
      0, // paused
      false
    );

    // Scale được đóng băng đúng giá trị 0.015, không tự tiến triển
    expect(scaleCache[0]).toBeCloseTo(0.015, 4);
  });

  it('3. Khi reset (isReset = true), toàn bộ scale cache bị xóa về 0 ngay lập tức, không để lại ghost', () => {
    const geom = new BoxGeometry(1, 1, 1);
    const mat = new MeshBasicMaterial();
    const mesh = new InstancedMesh(geom, mat, 10);

    const target: RenderTarget & { radii: Float32Array } = {
      positions: new Float32Array(30),
      weights: new Float32Array(10),
      materials: new Uint8Array(10),
      radii: new Float32Array(10).fill(0.026),
      count: 10,
    };

    const scaleCache = new Float32Array(10);
    scaleCache[0] = 0.026;
    scaleCache[1] = 0.020;

    updatePoolInstancedMesh(
      mesh,
      { offset: 0, count: 0 },
      target,
      0.026,
      'sandBed',
      scaleCache,
      0.016,
      true // isReset
    );

    expect(scaleCache[0]).toBe(0);
    expect(scaleCache[1]).toBe(0);
    expect(mesh.count).toBe(0);
  });

  it('4. updatePoolInstancedMesh không làm biến đổi mảng positions hay weights của target (Buffer Mutation Isolation)', () => {
    const geom = new BoxGeometry(1, 1, 1);
    const mat = new MeshBasicMaterial();
    const mesh = new InstancedMesh(geom, mat, 10);

    const positionsOrig = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
    const weightsOrig = new Float32Array([1.5, 2.5]);

    const target: RenderTarget & { radii: Float32Array } = {
      positions: new Float32Array(positionsOrig),
      weights: new Float32Array(weightsOrig),
      materials: new Uint8Array([1, 1]),
      radii: new Float32Array([0.026, 0.026]),
      count: 2,
    };

    const scaleCache = new Float32Array(10);
    updatePoolInstancedMesh(
      mesh,
      { offset: 0, count: 2 },
      target,
      0.026,
      'sandBed',
      scaleCache,
      0.016,
      false
    );

    // Toàn bộ buffer vật lý được bảo toàn tuyệt đối 100%
    expect(target.positions).toEqual(positionsOrig);
    expect(target.weights).toEqual(weightsOrig);
  });
});
