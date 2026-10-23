import { describe, expect, it } from 'vitest';
import { HeroInput, HeroScene, INST_FLOATS, KIND, LAYER } from './hero-scene';

const input = (over: Partial<HeroInput> = {}): HeroInput => ({ time: 1, pointer: null, pointerPx: null, scroll: 0, width: 1440, height: 820, particles: true, ...over });
const field = (frame: { instances: Float32Array }, index: number, offset: number) => frame.instances[index * INST_FLOATS + offset];
const normal = (frame: { instances: Float32Array }, i: number) => {
  const r = [field(frame, i, 4), field(frame, i, 5), field(frame, i, 6)], u = [field(frame, i, 8), field(frame, i, 9), field(frame, i, 10)];
  const n = [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]];
  const l = Math.hypot(n[0], n[1], n[2]);
  return n.map(v => v / l);
};

describe('Cảnh hộp game ở hero', () => {
  it('lúc đầu: 10 mặt hộp + 9 thẻ bay, thẻ trong hộp chưa hiện; nhóm sáng gồm quầng + hạt', () => {
    const frame = new HeroScene().update(input());
    expect(frame.solids).toEqual([0, 19]);
    const kinds = Array.from({ length: frame.solids[1] }, (_, i) => field(frame, i, 3));
    expect(kinds.filter(k => k === KIND.face).length).toBe(10);
    expect(kinds.filter(k => k === KIND.card).length).toBe(9);
    expect(frame.glows[1]).toBeGreaterThan(1);
    expect(field(frame, frame.glows[0], 3)).toBe(KIND.halo);
    expect(new HeroScene().update(input({ particles: false })).glows[1]).toBe(1);
  });

  it('cuộn thì nắp lật lên (pháp tuyến mặt nắp quay về +y) và 5 thẻ bay ra khỏi hộp', () => {
    const closed = new HeroScene().update(input());
    const lid = 5; // sau 5 mặt khay
    expect(field(closed, lid, 7)).toBe(LAYER.front);
    expect(normal(closed, lid)[1]).toBeLessThan(0.5);
    const open = new HeroScene().update(input({ scroll: 0.7 }));
    expect(normal(open, lid)[1]).toBeGreaterThan(0.6);
    const cards = Array.from({ length: open.solids[1] }, (_, i) => field(open, i, 3)).filter(k => k === KIND.card).length;
    expect(cards).toBeGreaterThanOrEqual(5);
  });

  it('đổi chủ đề: xoay có nhòe, đổi mặt hộp ở đỉnh vòng xoay, không nhận lệnh mới khi đang chuyển', () => {
    const scene = new HeroScene();
    scene.update(input({ time: 1 }));
    expect(scene.setTheme(1, 1)).toBe(true);
    const mid = scene.update(input({ time: 1.4 }));
    expect(mid.blur).toBeGreaterThan(3);
    expect(scene.frontTheme).toBe(0);
    expect(scene.setTheme(2, 1.4)).toBe(false);
    scene.update(input({ time: 1.7 }));
    expect(scene.frontTheme).toBe(1);
    const lid = scene.update(input({ time: 1.9 }));
    expect(field(lid, 5, 7)).toBe(LAYER.front + 1);
    expect(scene.cardTheme).toBe(1);
    scene.update(input({ time: 3.4 }));
    expect(scene.switching).toBe(false);
    expect(scene.update(input({ time: 3.5 })).blur).toBe(0);
    expect(scene.setTheme(1, 3.5)).toBe(false); // đã là chủ đề hiện tại
  });

  it('thẻ bay bị con trỏ đẩy ra xa', () => {
    const calm = new HeroScene(), pushed = new HeroScene();
    let a = calm.update(input()), b = pushed.update(input());
    const first = a.solids[0] + 10; // thẻ bay đầu tiên
    const x0 = field(a, first, 0), y0 = field(a, first, 1);
    // Đặt con trỏ ngay cạnh thẻ (bên phải) rồi cho chạy vài chục khung.
    for (let i = 0; i < 40; i++) {
      a = calm.update(input({ time: 1 + i / 60 }));
      b = pushed.update(input({ time: 1 + i / 60, pointerPx: [460, 470], pointer: [0, 0] }));
    }
    const dCalm = Math.hypot(field(a, first, 0) - x0, field(a, first, 1) - y0);
    const dPushed = Math.hypot(field(b, first, 0) - x0, field(b, first, 1) - y0);
    expect(dPushed).toBeGreaterThan(dCalm + 0.05);
  });
});
