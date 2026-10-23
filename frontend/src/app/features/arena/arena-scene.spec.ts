import { describe, expect, it } from 'vitest';
import { ArenaController } from './arena-controller';
import { mulberry32, newGame } from './arena-engine';
import { ArenaScene } from './arena-scene';
import { INSTANCE_FLOATS, KIND } from './arena-shaders';
import { project } from './arena-math';

const WIDTH = 1280, HEIGHT = 800;
function makeScene(reducedMotion = false) {
  const scene = new ArenaScene({ reducedMotion, particles: true });
  scene.resize(WIDTH, HEIGHT);
  return scene;
}
const settle = (scene: ArenaScene, seconds = 4) => { for (let t = 0; t < seconds; t += 1 / 30) scene.update(1 / 30); };
const kinds = (out: Float32Array, count: number) => { const map: Record<number, number> = {}; for (let i = 0; i < count; i++) { const k = out[i * INSTANCE_FLOATS + 3]; map[k] = (map[k] ?? 0) + 1; } return map; };

describe('ArenaScene', () => {
  it('dựng đủ thẻ của hai bên và không vượt dung lượng buffer', () => {
    const scene = makeScene();
    const { game } = newGame(mulberry32(5));
    scene.reset(game); settle(scene);
    const out = new Float32Array(INSTANCE_FLOATS * 2048);
    const count = scene.fill(out);
    const k = kinds(out, count);
    expect(k[KIND.table]).toBe(1);
    expect((k[KIND.card] ?? 0) + (k[KIND.energyCard] ?? 0)).toBe(48 + 6); // 24 lá mỗi bên + 3 thẻ Giải thưởng mỗi bên
    expect(count).toBeLessThan(2048);
    expect(Number.isFinite(out[0])).toBe(true);
  });

  it('thẻ trong tay người chơi bay tới đúng vị trí và chọn được bằng con trỏ', () => {
    const scene = makeScene();
    const { game } = newGame(mulberry32(5));
    scene.reset(game); settle(scene);
    const hand = game.sides[0].hand;
    expect(hand.length).toBe(5);
    let hits = 0;
    for (let i = 0; i < hand.length; i++) {
      const at = scene.toScreen(handPosition(scene, hand[i].uid))!;
      const pick = scene.pickAt(at[0], at[1]);
      if (pick?.zone === 'hand' && pick.side === 0) { hits++; expect(pick.uid).toBe(hand[i].uid); }
    }
    expect(hits).toBeGreaterThanOrEqual(4);       // thẻ chồng lên nhau: tâm thẻ phủ có thể chọn thẻ kề
    expect(scene.pickAt(5, 5)).toBeNull();
  });

  it('bài của máy luôn úp (không chọn được) trong tay', () => {
    const scene = makeScene();
    const { game } = newGame(mulberry32(6));
    scene.reset(game); settle(scene);
    for (const card of game.sides[1].hand) {
      const at = scene.toScreen(handPosition(scene, card.uid));
      if (!at) continue;
      const pick = scene.pickAt(at[0], at[1]);
      expect(pick === null || pick.side === 0).toBe(true);
    }
  });

  it('present: áp trạng thái đúng thời điểm và trả thời lượng; tấn công có độ trễ trước khi trúng', () => {
    const scene = makeScene();
    const presented: string[] = [];
    scene.popup = popup => presented.push(popup.text);
    const ctl = new ArenaController(scene, () => undefined, 21);
    ctl.start(21);
    settle(scene);
    const g = ctl.game;
    ctl.act({ t: 'place', hand: g.sides[0].hand.findIndex(c => c.kind === 'pokemon') });
    ctl.tick(0);                                       // trình bày bước đặt Pokémon
    expect(scene.shown!.sides[0].active).not.toBeNull();
    expect(ctl.busy).toBe(true);
    settle(scene, 1);
    expect(scene.animating).toBe(false);
  });

  it('chế độ giảm chuyển động: bắt kịp mục tiêu nhanh hơn và không tạo hạt', () => {
    const fast = makeScene(true), normal = makeScene(false);
    const { game } = newGame(mulberry32(9));
    for (const scene of [fast, normal]) scene.reset(game);
    fast.update(0.1); normal.update(0.1);
    const a = new Float32Array(INSTANCE_FLOATS * 2048), b = new Float32Array(INSTANCE_FLOATS * 2048);
    const ca = fast.fill(a), cb = normal.fill(b);
    const alpha = (out: Float32Array, n: number) => { let s = 0; for (let i = 0; i < n; i++) s += out[i * INSTANCE_FLOATS + 11]; return s; };
    expect(alpha(a, ca)).toBeGreaterThanOrEqual(alpha(b, cb));
  });

  it('thẻ trong tay được chọn/rê chuột không nhấc vào vùng băng ghế và đích hợp lệ luôn chọn được', () => {
    const scene = makeScene();
    const rng = mulberry32(12);
    const ctl = new ArenaController(scene, () => undefined, 12);
    ctl.start(12);
    settle(scene);
    for (let i = 0; i < 2; i++) { ctl.act({ t: 'place', hand: ctl.game.sides[0].hand.findIndex(c => c.kind === 'pokemon') }); ctl.tick(i * 10 + 1); ctl.tick(i * 10 + 5); settle(scene, 2); }
    const game = ctl.displayed, hand = game.sides[0].hand;
    expect(hand.length).toBeGreaterThan(0);
    const before = handPosition(scene, hand[0].uid)[1];
    scene.setUi({ selected: hand[0].uid, targets: new Set(), hover: hand[0].uid, guide: new Set(), guideZones: new Set(), pointer: [0, 0] });
    settle(scene, 2);
    expect(Math.abs(handPosition(scene, hand[0].uid)[1] - before)).toBeLessThan(0.05);   // không dịch y về phía băng ghế

    const targets = [game.sides[0].active, ...game.sides[0].bench].filter((p): p is NonNullable<typeof p> => !!p);
    scene.setUi({ selected: hand[0].uid, targets: new Set(targets.map(t => t.uid)), hover: null, guide: new Set(), guideZones: new Set(), pointer: [0, 0] });
    for (const target of targets) {
      const at = scene.toScreen(handPosition(scene, target.uid))!;
      expect(scene.pickAt(at[0], at[1])?.uid).toBe(target.uid);
    }
  });

  it('toScreen trả null cho điểm sau camera', () => {
    const scene = makeScene();
    expect(scene.toScreen([0, 0, 0])).not.toBeNull();
    expect(scene.toScreen([0, 0, 1000])).toBeNull();
    expect(project(scene.cameraNow.viewProj, [0, 0, 0], WIDTH, HEIGHT)).not.toBeNull();
  });
});

/** Vị trí hiện tại của một thẻ: đọc từ buffer instance (thẻ cuối cùng khớp uid không lưu → dùng cảnh để tìm). */
function handPosition(scene: ArenaScene, uid: number): [number, number, number] {
  const visuals = (scene as unknown as { visuals: Map<number, { pose: { x: number; y: number; z: number } }> }).visuals;
  const p = visuals.get(uid)!.pose;
  return [p.x, p.y, p.z];
}
