import { describe, expect, it } from 'vitest';
import { aiNext } from './arena-ai';
import { apply, mulberry32, newGame, type Game } from './arena-engine';
import { Tutorial } from './arena-tutorial';

const ctx = (canAct = true, canAttack = false) => ({ canAct, canAttack });

/** Chạy lượt máy cho tới khi tới lượt người chơi (hoặc hết ván). */
function runAi(game: Game, rng: () => number): Game {
  let g = game;
  for (let i = 0; i < 40 && g.phase !== 'over' && (g.phase === 'promote' ? g.pending[0] === 1 : g.turn === 1); i++) g = apply(g, aiNext(g, rng, 1), rng, 1).game;
  return g;
}

describe('Tutorial', () => {
  it('đi hết các bước theo ván thật: giới thiệu → đặt Pokémon → Sẵn sàng → gắn Năng lượng → kết thúc lượt', () => {
    const rng = mulberry32(5);
    let { game } = newGame(rng, { first: 0 });
    expect(game.turn).toBe(0);
    const tutorial = new Tutorial(); tutorial.start();

    expect(tutorial.current(game, ctx())!.id).toBe('welcome');
    tutorial.next(game); expect(tutorial.current(game, ctx())!.id).toBe('board');
    tutorial.next(game);
    const place = tutorial.current(game, ctx())!;
    expect(place.id).toBe('place-active'); expect(place.cards).toBe('hand-pokemon'); expect(place.manual).toBe(false);

    game = apply(game, { t: 'place', hand: game.sides[0].hand.findIndex(c => c.kind === 'pokemon') }, rng, 0).game;
    expect(tutorial.current(game, ctx())!.id).toBe('place-bench');   // tự qua khi đã có Pokémon Chiến đấu
    tutorial.next(game);
    expect(tutorial.current(game, ctx())!).toMatchObject({ id: 'ready', button: 'ready' });

    game = apply(game, { t: 'ready' }, rng, 0).game;
    expect(game.phase).toBe('main');
    expect(tutorial.current(game, ctx())!.id).toBe('hp');            // lượt của người chơi: bỏ qua bước chờ
    tutorial.next(game);
    const attach = tutorial.current(game, ctx());
    expect(attach!.id).toBe('attach'); expect(attach!.cards).toBe('hand-energy');

    const energy = game.sides[0].hand.findIndex(c => c.kind === 'energy');
    game = apply(game, { t: 'attach', hand: energy, target: -1 }, rng, 0).game;
    const attack = tutorial.current(game, ctx())!;
    expect(attack.id).toBe('attack'); expect(attack.text).toContain('không được tấn công');   // lượt đầu

    game = apply(game, { t: 'end' }, rng, 0).game;
    game = runAi(game, rng);
    expect(tutorial.current(game, ctx())!.id).toBe('weakness');       // đã qua lượt → các mẹo
    tutorial.next(game); expect(tutorial.current(game, ctx())!.id).toBe('retreat');
    tutorial.next(game); expect(tutorial.current(game, ctx())!.id).toBe('finish');
    expect(tutorial.next(game)).toBe(true);
    expect(tutorial.active).toBe(false); expect(tutorial.completed).toBe(true);
    expect(tutorial.current(game, ctx())).toBeNull();
  });

  it('bỏ qua các bước không còn khả thi và không chặn người chơi làm khác thứ tự', () => {
    const rng = mulberry32(8);
    let { game } = newGame(rng, { first: 0 });
    const tutorial = new Tutorial(); tutorial.start();
    // Người chơi đặt Pokémon và bấm Sẵn sàng ngay, trước khi hướng dẫn kịp tới bước đó.
    game = apply(game, { t: 'place', hand: game.sides[0].hand.findIndex(c => c.kind === 'pokemon') }, rng, 0).game;
    game = apply(game, { t: 'ready' }, rng, 0).game;
    tutorial.next(game); tutorial.next(game);                    // welcome, board
    expect(['hp']).toContain(tutorial.current(game, ctx())!.id);   // đặt/Sẵn sàng đã xong → nhảy tới bước kế tiếp hợp lệ
  });

  it('bước tấn công đổi lời khuyên theo khả năng đánh và nhắc rõ khi chưa đủ Năng lượng', () => {
    const rng = mulberry32(2);
    let { game } = newGame(rng, { first: 0 });
    game = apply(game, { t: 'place', hand: game.sides[0].hand.findIndex(c => c.kind === 'pokemon') }, rng, 0).game;
    game = apply(game, { t: 'ready' }, rng, 0).game;
    game.turnNumber = 3; game.attached = true;
    const tutorial = new Tutorial(); tutorial.start();
    for (let i = 0; i < 6; i++) { const step = tutorial.current(game, ctx(true, true))!; if (step.id === 'attack') break; if (step.manual) tutorial.next(game); }
    expect(tutorial.current(game, ctx(true, true))!.text).toContain('bấm để tấn công');
    expect(tutorial.current(game, ctx(true, false))!.text).toContain('Chưa đủ Năng lượng');
  });

  it('khi phải chọn Pokémon thay thế sẽ hiện bước riêng, rồi quay lại luồng thường', () => {
    const rng = mulberry32(3);
    let { game } = newGame(rng, { first: 0 });
    game = apply(game, { t: 'place', hand: game.sides[0].hand.findIndex(c => c.kind === 'pokemon') }, rng, 0).game;
    game = apply(game, { t: 'ready' }, rng, 0).game;
    const tutorial = new Tutorial(); tutorial.start();
    tutorial.next(game); tutorial.next(game);
    expect(tutorial.current(game, ctx())!.id).toBe('hp');
    const real = game.phase;
    game.phase = 'promote'; game.pending = [0];
    expect(tutorial.current(game, ctx())!).toMatchObject({ id: 'promote', cards: 'bench', manual: false });
    game.phase = real; game.pending = [];
    expect(tutorial.current(game, ctx())!.id).toBe('hp');
  });

  it('dừng/bỏ qua không còn trả về bước nào', () => {
    const { game } = newGame(mulberry32(4), { first: 0 });
    const tutorial = new Tutorial();
    expect(tutorial.current(game, ctx())).toBeNull();
    tutorial.start(); expect(tutorial.current(game, ctx())).not.toBeNull();
    tutorial.stop(); expect(tutorial.current(game, ctx())).toBeNull();
  });
});
