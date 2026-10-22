import { describe, expect, it } from 'vitest';
import { ARENA_POKEMON } from './arena-cards';
import { apply, mulberry32, newGame, type Game } from './arena-engine';
import { buildView } from './arena-view';

const pokemon = (id: string) => ARENA_POKEMON.find(p => p.id === id)!;
const inPlay = (uid: number, id: string, energy: string[] = []) => ({ uid, def: pokemon(id), damage: 0, energy: energy.map((type, i) => ({ uid: 900 + uid * 10 + i, type: type as never })), paralyzed: false, shielded: false, tailWagged: false });

function duel(): Game {
  const { game } = newGame(mulberry32(3));
  game.phase = 'main'; game.turn = 0; game.turnNumber = 3; game.attached = false; game.retreated = false;
  game.sides[0].active = inPlay(1, 'charmander', ['Fire', 'Fire']);
  game.sides[0].bench = [inPlay(2, 'pikachu')];
  game.sides[1].active = inPlay(3, 'squirtle');
  game.sides[1].bench = [];
  return game;
}

describe('buildView', () => {
  it('giai đoạn chuẩn bị: hướng dẫn đặt Pokémon và chỉ hiện "Sẵn sàng" khi đã có Pokémon Chiến đấu', () => {
    const { game } = newGame(mulberry32(1));
    expect(buildView(game, true).status).toContain('Chuẩn bị');
    expect(buildView(game, true).canReady).toBe(false);
    game.sides[0].active = inPlay(1, 'pikachu');
    expect(buildView(game, true).canReady).toBe(true);
    expect(buildView(game, false).canReady).toBe(false);
  });

  it('bật đúng đòn đánh theo Năng lượng và theo quyền thao tác', () => {
    const game = duel();
    const view = buildView(game, true);
    expect(view.attacks.map(a => [a.name, a.enabled])).toEqual([['Scratch', true], ['Ember', true]]);
    expect(view.canEnd).toBe(true);
    expect(buildView(game, false).attacks.every(a => !a.enabled)).toBe(true);
    expect(buildView(game, false).canEnd).toBe(false);
  });

  it('không tấn công được ở lượt đầu và nói rõ lý do', () => {
    const game = duel(); game.turnNumber = 1;
    const view = buildView(game, true);
    expect(view.attacks.every(a => !a.enabled)).toBe(true);
    expect(view.attacks[0].reason).toContain('lượt đầu');
  });

  it('rút lui cần đủ Năng lượng; Năng lượng trong tay bị chặn sau khi đã gắn', () => {
    const game = duel();
    expect(buildView(game, true).canRetreat).toBe(true);
    game.sides[0].active!.energy = [];
    game.sides[0].active = inPlay(1, 'charmander', []);
    game.sides[0].active.def = pokemon('charizard');
    expect(buildView(game, true).retreatReason).toContain('Năng lượng');
    game.attached = true;
    game.sides[0].hand = [{ uid: 77, kind: 'energy', type: 'Fire' }];
    expect(buildView(game, true).hand[0]).toMatchObject({ kind: 'energy', enabled: false });
  });

  it('bảng theo dõi tóm tắt HP/Năng lượng/Giải thưởng; Pokémon máy úp trong lúc chuẩn bị', () => {
    const game = duel(); game.sides[0].active!.damage = 20;
    const board = buildView(game, true).board;
    expect(board[0].active).toMatchObject({ name: 'Charmander', hpLeft: 30, hp: 50, energy: ['Lửa', 'Lửa'] });
    expect(board[0].bench.map(p => p.name)).toEqual(['Pikachu']);
    expect(board[1].prizesLeft).toBe(3);
    const setup = newGame(mulberry32(4)).game;
    expect(buildView(setup, true).board[1].active?.name).toBe('Thẻ úp');
  });

  it('kết thúc ván: nêu người thắng và lý do', () => {
    const game = duel(); game.phase = 'over'; game.winner = 0; game.reason = 'Bạn đã lấy đủ 3 thẻ Giải thưởng!';
    const view = buildView(game, false);
    expect(view.over).toBe(true); expect(view.status).toContain('Bạn thắng');
  });

  it('phản ánh trạng thái sau khi áp dụng hành động thật của engine', () => {
    const game = duel();
    const result = apply(game, { t: 'attack', index: 0 }, mulberry32(1), 0);
    expect(buildView(result.game, false).board[1].active?.hpLeft).toBeLessThan(40);
  });
});
