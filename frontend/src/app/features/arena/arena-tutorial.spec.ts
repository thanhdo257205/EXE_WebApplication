import { describe, expect, it } from 'vitest';
import { aiNext } from './arena-ai';
import { apply, mulberry32, newGame, type Game } from './arena-engine';
import { Tutorial, type TutorialContext } from './arena-tutorial';

const ctx = (over: Partial<TutorialContext> = {}): TutorialContext => ({ canAct: true, canAttack: false, selected: null, attacked: false, ...over });

/** Chạy lượt máy cho tới khi tới lượt người chơi (hoặc hết ván). */
function runAi(game: Game, rng: () => number): Game {
  let g = game;
  for (let i = 0; i < 40 && g.phase !== 'over' && (g.phase === 'promote' ? g.pending[0] === 1 : g.turn === 1); i++) g = apply(g, aiNext(g, rng, 1), rng, 1).game;
  return g;
}
const placeFirst = (game: Game, rng: () => number): Game => apply(game, { t: 'place', hand: game.sides[0].hand.findIndex(c => c.kind === 'pokemon') }, rng, 0).game;

describe('Tutorial', () => {
  it('đi hết các bước theo ván thật và dẫn tới đòn tấn công đầu tiên', () => {
    const rng = mulberry32(5);
    let { game } = newGame(rng, { first: 0 });
    expect(game.turn).toBe(0);
    const tutorial = new Tutorial(); tutorial.start();

    expect(tutorial.current(game, ctx())!.id).toBe('welcome');
    for (const id of ['tour-foe', 'tour-active', 'tour-bench', 'tour-deck', 'tour-prize']) {
      tutorial.next(game);
      const tour = tutorial.current(game, ctx())!;
      expect(tour.id).toBe(id); expect(tour.target).toMatch(/^zone:/);   // mỗi bước giới thiệu chỉ vào một khu vực trên bàn
    }
    tutorial.next(game);
    const place = tutorial.current(game, ctx())!;
    expect(place).toMatchObject({ id: 'place-active', cards: 'hand-pokemon', manual: false, target: 'hand-pokemon' });

    game = placeFirst(game, rng);
    expect(tutorial.current(game, ctx())!.id).toBe('place-bench');   // tự qua khi đã có Pokémon Chiến đấu
    tutorial.next(game);
    expect(tutorial.current(game, ctx())!).toMatchObject({ id: 'ready', button: 'ready' });

    game = apply(game, { t: 'ready' }, rng, 0).game;
    expect(tutorial.current(game, ctx())!.id).toBe('hp');            // lượt của người chơi: bỏ qua bước chờ
    tutorial.next(game);
    const intro = tutorial.current(game, ctx())!;
    expect(intro.id).toBe('energy-intro'); expect(intro.text).toContain('cần');   // nêu chi phí đòn đánh của Pokémon thật
    tutorial.next(game);

    const attach = tutorial.current(game, ctx())!;
    expect(attach).toMatchObject({ id: 'attach', cards: 'hand-energy', target: 'hand-energy' });
    const picked = tutorial.current(game, ctx({ selected: 'energy' }))!;   // đã chọn Năng lượng → chỉ sang Pokémon để gắn
    expect(picked).toMatchObject({ id: 'attach', target: 'zone:0:active', cards: 'none' });

    const energy = game.sides[0].hand.findIndex(c => c.kind === 'energy');
    game = apply(game, { t: 'attach', hand: energy, target: -1 }, rng, 0).game;
    const first = tutorial.current(game, ctx())!;
    expect(first.id).toBe('first-attack'); expect(first.text).toContain('không được tấn công'); expect(first).toMatchObject({ target: 'button', button: 'end' });

    game = apply(game, { t: 'end' }, rng, 0).game;
    game = runAi(game, rng);
    expect(game.turn).toBe(0);
    expect(tutorial.current(game, ctx({ canAct: false }))!.title).toContain('Chờ');            // máy đang đi
    expect(tutorial.current(game, ctx({ canAttack: true }))!).toMatchObject({ id: 'first-attack', button: 'attack', target: 'button' });

    // Chỉ khi người chơi thật sự tấn công mới sang các mẹo; đổi lượt mà chưa tấn công thì vẫn ở bước tấn công.
    expect(tutorial.current(game, ctx())!.id).toBe('first-attack');
    expect(tutorial.current(game, ctx({ attacked: true }))!).toMatchObject({ id: 'after-attack', target: 'hp:1' });
    tutorial.next(game); expect(tutorial.current(game, ctx())!.id).toBe('weakness');
    tutorial.next(game); expect(tutorial.current(game, ctx())!.id).toBe('retreat');
    tutorial.next(game); expect(tutorial.current(game, ctx())!.id).toBe('finish');
    expect(tutorial.next(game)).toBe(true);
    expect(tutorial.active).toBe(false); expect(tutorial.completed).toBe(true);
    expect(tutorial.current(game, ctx())).toBeNull();
  });

  it('bước tấn công thích ứng: gắn thêm Năng lượng khi còn thẻ, nhắc kết thúc lượt khi hết cách', () => {
    const rng = mulberry32(2);
    let { game } = newGame(rng, { first: 0 });
    game = placeFirst(game, rng);
    game = apply(game, { t: 'ready' }, rng, 0).game;
    game.turnNumber = 3; game.attached = true;                            // đã gắn Năng lượng ở bước trước
    game.sides[0].hand = [{ uid: 9001, kind: 'energy', type: 'Fire' }];
    const tutorial = new Tutorial(); tutorial.start();
    for (let i = 0; i < 40; i++) { const step = tutorial.current(game, ctx())!; if (step.id === 'first-attack') break; if (step.manual) tutorial.next(game); else break; }

    game.attached = false;                                               // lượt mới: được gắn thêm 1 Năng lượng
    expect(tutorial.current(game, ctx())!).toMatchObject({ id: 'first-attack', target: 'hand-energy', cards: 'hand-energy' });
    expect(tutorial.current(game, ctx())!.text).toContain('Chưa đủ Năng lượng');
    expect(tutorial.current(game, ctx({ selected: 'energy' }))!).toMatchObject({ target: 'zone:0:active' });
    expect(tutorial.current(game, ctx({ canAttack: true }))!.text).toContain('đã đủ Năng lượng');
    game.sides[0].hand = []; game.attached = true;                       // hết Năng lượng để gắn
    expect(tutorial.current(game, ctx())!).toMatchObject({ target: 'button', button: 'end' });
  });

  it('bỏ qua các bước không còn khả thi và không chặn người chơi làm khác thứ tự', () => {
    const rng = mulberry32(8);
    let { game } = newGame(rng, { first: 0 });
    const tutorial = new Tutorial(); tutorial.start();
    game = placeFirst(game, rng);
    game = apply(game, { t: 'ready' }, rng, 0).game;
    for (let i = 0; i < 6; i++) tutorial.next(game);                   // welcome + 5 bước giới thiệu sân
    expect(tutorial.current(game, ctx())!.id).toBe('hp');              // đặt/Sẵn sàng đã xong → nhảy tới bước kế tiếp hợp lệ
  });

  it('khi phải chọn Pokémon thay thế sẽ hiện bước riêng, rồi quay lại luồng thường', () => {
    const rng = mulberry32(3);
    let { game } = newGame(rng, { first: 0 });
    game = placeFirst(game, rng);
    game = apply(game, { t: 'ready' }, rng, 0).game;
    const tutorial = new Tutorial(); tutorial.start();
    for (let i = 0; i < 6; i++) tutorial.next(game);
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
