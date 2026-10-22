import { describe, expect, it } from 'vitest';
import { fitDistance, makeCamera, multiply, perspective, lookAt, pointInPolygon, project, quadCorners, rotate } from './arena-math';

describe('arena-math', () => {
  it('chiếu điểm trước camera vào giữa khung và bỏ điểm nằm sau camera', () => {
    const vp = multiply(perspective(Math.PI / 2, 1, 0.1, 100), lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]));
    const center = project(vp, [0, 0, 0], 200, 100)!;
    expect(center[0]).toBeCloseTo(100); expect(center[1]).toBeCloseTo(50);
    expect(project(vp, [0, 0, 10], 200, 100)).toBeNull();
  });

  it('độ sâu WebGPU: điểm gần = 0, điểm xa = 1', () => {
    const p = perspective(Math.PI / 2, 1, 1, 11);
    const depth = (z: number) => (p[10] * z + p[14]) / (p[11] * z);
    expect(depth(-1)).toBeCloseTo(0); expect(depth(-11)).toBeCloseTo(1);
  });

  it('quay giống shader (Ry rồi Rx rồi Rz) và lật thẻ úp/ngửa', () => {
    const flipped = rotate([0, 0, 1], 0, 0, Math.PI);
    expect(flipped[2]).toBeCloseTo(-1);
    const tilted = rotate([0, 0, 1], 0, Math.PI / 2, 0);
    expect(tilted[1]).toBeCloseTo(-1); // rx > 0 nghiêng mặt thẻ về phía camera (−y)
    const [a, b, c] = quadCorners([1, 2, 3], 2, 4, 0, 0, 0);
    expect(a).toEqual([0, 0, 3]); expect(b).toEqual([2, 0, 3]); expect(c).toEqual([2, 4, 3]);
  });

  it('điểm trong/ngoài đa giác', () => {
    const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(pointInPolygon([5, 5], square)).toBe(true);
    expect(pointInPolygon([11, 5], square)).toBe(false);
  });

  it('camera tự lùi để mọi điểm của sân lọt khung ở nhiều tỉ lệ màn hình', () => {
    for (const aspect of [0.56, 0.75, 1, 1.6, 2.4]) {
      const { viewProj } = makeCamera(aspect);
      for (const corner of [[-7.2, 7, 0.3], [7.2, 7, 0.3], [-7.2, -9.4, 0.9], [7.2, -9.4, 0.9]] as const) {
        const s = project(viewProj, corner, 1000, 1000)!;
        expect(s[0]).toBeGreaterThan(0); expect(s[0]).toBeLessThan(1000);
        expect(s[1]).toBeGreaterThan(0); expect(s[1]).toBeLessThan(1000);
      }
    }
    expect(fitDistance(0.5)).toBeGreaterThan(fitDistance(2));
  });
});
