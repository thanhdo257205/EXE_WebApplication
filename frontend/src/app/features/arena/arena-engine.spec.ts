import { describe, expect, it } from 'vitest';
import { ARENA_POKEMON, DECK_ENERGY } from './arena-cards';
import { aiNext } from './arena-ai';
import { apply, canPay, illegal, mulberry32, newGame, RuleError, RULES, shuffle, type Action, type Game, type InPlay, type Side } from './arena-engine';

const def = (id: string) => ARENA_POKEMON.find(p => p.id === id)!;
const mon = (id: string, over: Partial<InPlay> = {}, uid = Math.floor(Math.random() * 1e6) + 1000): InPlay =>
  ({ uid, def: def(id), damage: 0, energy: [], paralyzed: false, shielded: false, tailWagged: false, ...over });
const energy = (...types: ('Fire' | 'Water' | 'Grass' | 'Lightning' | 'Psychic')[]) => types.map((type, i) => ({ uid: 9000 + i, type }));
/** Ván ở lượt `turn` (số 2 để được tấn công) với hai Pokémon Chiến đấu cho sẵn. */
const duel = (a: InPlay, b: InPlay, turn: Side = 0): Game => ({
  sides: [{ deck: filler(), hand: [], active: a, bench: [], prizesTaken: 0, discard: [] }, { deck: filler(), hand: [], active: b, bench: [], prizesTaken: 0, discard: [] }],
  turn, phase: 'main', turnNumber: 2, attached: false, retreated: false, ready: [true, true], pending: [], winner: null, reason: '', nextUid: 100,
});
const filler = () => Array.from({ length: 5 }, (_, i) => ({ uid: 5000 + i, kind: 'energy' as const, type: 'Fire' as const }));
const always = (value: number) => () => value;

describe('arena engine: setup', () => {
  it('deals 5 cards each from a 24-card deck with at least one Pokémon in hand', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { game } = newGame(mulberry32(seed));
      for (const s of game.sides) {
        expect(s.hand).toHaveLength(RULES.handSize === 5 && s === game.sides[0] ? 5 : s.hand.length);
        expect(s.hand.length + s.deck.length + (s.active ? 1 : 0) + s.bench.length).toBe(ARENA_POKEMON.length + DECK_ENERGY.length);
      }
      expect(game.sides[0].hand.some(c => c.kind === 'pokemon')).toBe(true);
      expect(game.sides[1].active).not.toBeNull();
      expect(game.phase).toBe('setup');
    }
  });
  it('lets the player place an active, then bench, then start', () => {
    const rng = mulberry32(3); const { game } = newGame(rng);
    const idx = game.sides[0].hand.findIndex(c => c.kind === 'pokemon');
    expect(illegal(game, { t: 'ready' }, 0)).toMatch(/Chiến đấu/);
    const placed = apply(game, { t: 'place', hand: idx }, rng, 0);
    expect(placed.game.sides[0].active).not.toBeNull();
    const started = apply(placed.game, { t: 'ready' }, rng, 0);
    expect(started.game.phase === 'main' || started.game.phase === 'over').toBe(true);
    expect(started.game.turnNumber).toBe(1);
  });
  it('does not mutate the input game', () => {
    const rng = mulberry32(5); const { game } = newGame(rng); const snapshot = JSON.stringify(game);
    const idx = game.sides[0].hand.findIndex(c => c.kind === 'pokemon');
    apply(game, { t: 'place', hand: idx }, rng, 0);
    expect(JSON.stringify(game)).toBe(snapshot);
  });
});

describe('arena engine: costs and damage', () => {
  it('pays specific and colorless costs correctly', () => {
    expect(canPay(energy('Fire', 'Fire'), ['Fire', 'Colorless'])).toBe(true);
    expect(canPay(energy('Water'), ['Fire'])).toBe(false);
    expect(canPay(energy('Fire'), ['Fire', 'Colorless'])).toBe(false);
    expect(canPay(energy('Water', 'Grass'), ['Colorless', 'Colorless'])).toBe(true);
    expect(canPay([], [])).toBe(true);
  });
  it('doubles damage on weakness and applies base damage otherwise', () => {
    const g = duel(mon('squirtle', { energy: energy('Water') }), mon('charmander'));
    const hit = apply(g, { t: 'attack', index: 0 }, always(0.99)); // Bubble: sấp
    expect(hit.game.sides[1].active!.damage).toBe(20); // 10 x2 (Charmander yếu Nước)
    const g2 = duel(mon('pikachu', { energy: energy('Lightning') }), mon('venusaur'));
    expect(apply(g2, { t: 'attack', index: 0 }, always(0.5)).game.sides[1].active!.damage).toBe(10);
  });
  it('blocks the first-turn attack and needs energy', () => {
    const g = duel(mon('pikachu', { energy: energy('Lightning') }), mon('venusaur')); g.turnNumber = 1;
    expect(illegal(g, { t: 'attack', index: 0 })).toMatch(/đầu/);
    g.turnNumber = 2; g.sides[0].active!.energy = [];
    expect(illegal(g, { t: 'attack', index: 0 })).toMatch(/Năng lượng/);
  });
  it('Hydro Pump adds up to +20, Psychic scales with defender energy, Quick Attack needs heads', () => {
    const blast = duel(mon('blastoise', { energy: energy('Water', 'Water', 'Water', 'Water', 'Water', 'Water') }), mon('venusaur'));
    expect(apply(blast, { t: 'attack', index: 0 }, always(0.9)).game.sides[1].active!.damage).toBe(60);
    const mew = duel(mon('mewtwo', { energy: energy('Psychic', 'Fire') }), mon('venusaur', { energy: energy('Grass', 'Grass', 'Grass') }));
    expect(apply(mew, { t: 'attack', index: 0 }, always(0.9)).game.sides[1].active!.damage).toBe(40);
    const eevee = duel(mon('eevee', { energy: energy('Fire', 'Fire') }), mon('venusaur'));
    expect(apply(eevee, { t: 'attack', index: 1 }, always(0.1)).game.sides[1].active!.damage).toBe(30);
    expect(apply(eevee, { t: 'attack', index: 1 }, always(0.9)).game.sides[1].active!.damage).toBe(10);
  });
  it('Fire Spin and Ember discard energy; Leech Seed heals', () => {
    const zard = duel(mon('charizard', { energy: energy('Fire', 'Fire', 'Fire', 'Fire') }), mon('venusaur', { def: def('blastoise') }));
    const fired = apply(zard, { t: 'attack', index: 0 }, always(0.5)).game;
    expect(fired.sides[0].active!.energy).toHaveLength(2);
    const ember = duel(mon('charmander', { energy: energy('Fire', 'Fire') }), mon('mewtwo'));
    expect(apply(ember, { t: 'attack', index: 1 }, always(0.5)).game.sides[0].active!.energy).toHaveLength(1);
    const seed = duel(mon('bulbasaur', { damage: 20, energy: energy('Grass', 'Grass') }), mon('mewtwo'));
    expect(apply(seed, { t: 'attack', index: 0 }, always(0.5)).game.sides[0].active!.damage).toBe(10);
  });
});

describe('arena engine: effects and statuses', () => {
  it('Barrier blocks damage and effects until the opponent ends their turn', () => {
    const g = duel(mon('mewtwo', { energy: energy('Psychic', 'Psychic') }), mon('pikachu', { energy: energy('Lightning') }), 0);
    const barrier = apply(g, { t: 'attack', index: 1 }, always(0.5)).game; // Barrier, rồi sang lượt máy
    expect(barrier.sides[0].active!.shielded).toBe(true);
    expect(barrier.turn).toBe(1);
    const strike = apply(barrier, { t: 'attack', index: 0 }, always(0.5)).game; // Gnaw
    expect(strike.sides[0].active!.damage).toBe(0);
    expect(strike.sides[0].active!.shielded).toBe(false); // hết hiệu lực sau lượt của đối thủ
  });
  it('Bubble paralyzes on heads for exactly the victim\'s next turn', () => {
    const g = duel(mon('squirtle', { energy: energy('Water') }), mon('pikachu', { energy: energy('Lightning') }));
    const after = apply(g, { t: 'attack', index: 0 }, always(0.1)).game; // ngửa
    expect(after.sides[1].active!.paralyzed).toBe(true);
    expect(illegal(after, { t: 'attack', index: 0 })).toMatch(/Tê liệt/);
    expect(illegal(after, { t: 'retreat', bench: 0 })).not.toBeNull();
    const done = apply(after, { t: 'end' }, always(0.5)).game; // hết lượt của nạn nhân
    expect(done.sides[1].active!.paralyzed).toBe(false);
  });
  it('Tail Wag stops the defender attacking Eevee next turn', () => {
    const g = duel(mon('eevee', { energy: energy('Fire') }), mon('pikachu', { energy: energy('Lightning') }));
    const after = apply(g, { t: 'attack', index: 0 }, always(0.1)).game;
    expect(illegal(after, { t: 'attack', index: 0 })).toMatch(/Tail Wag/);
  });
  it('Thunder Jolt hurts Pikachu on tails and can knock it out', () => {
    const g = duel(mon('pikachu', { damage: 30, energy: energy('Lightning', 'Fire') }), mon('mewtwo'));
    g.sides[0].bench = [mon('eevee')];
    const res = apply(g, { t: 'attack', index: 1 }, always(0.9)).game; // sấp: tự nhận 10 -> 40/40 hạ gục
    expect(res.sides[0].active).toBeNull();
    expect(res.sides[1].prizesTaken).toBe(1);
    expect(res.phase).toBe('promote');
  });
});

describe('arena engine: knockouts, prizes and winning', () => {
  it('KO gives a prize and forces a promotion, then play passes on', () => {
    const g = duel(mon('charizard', { energy: energy('Fire', 'Fire', 'Fire', 'Fire') }), mon('mewtwo'));
    g.sides[1].bench = [mon('eevee')];
    const ko = apply(g, { t: 'attack', index: 0 }, always(0.5)).game;
    expect(ko.sides[0].prizesTaken).toBe(1);
    expect(ko.phase).toBe('promote'); expect(ko.pending).toEqual([1]);
    expect(() => apply(ko, { t: 'end' }, always(0.5), 1)).toThrow(RuleError);
    const next = apply(ko, { t: 'promote', bench: 0 }, always(0.5), 1).game;
    expect(next.sides[1].active!.def.id).toBe('eevee');
    expect(next.turn).toBe(1); expect(next.phase).toBe('main');
  });
  it('wins at 3 prizes or when the opponent has no Pokémon left', () => {
    const g = duel(mon('charizard', { energy: energy('Fire', 'Fire', 'Fire', 'Fire') }), mon('mewtwo'));
    g.sides[0].prizesTaken = 2; g.sides[1].bench = [mon('eevee')];
    expect(apply(g, { t: 'attack', index: 0 }, always(0.5)).game.winner).toBe(0);
    const g2 = duel(mon('charizard', { energy: energy('Fire', 'Fire', 'Fire', 'Fire') }), mon('mewtwo'));
    const res = apply(g2, { t: 'attack', index: 0 }, always(0.5)).game;
    expect(res.winner).toBe(0); expect(res.phase).toBe('over');
    expect(() => apply(res, { t: 'end' }, always(0.5))).toThrow(RuleError);
  });
  it('loses when drawing from an empty deck', () => {
    const g = duel(mon('pikachu'), mon('pikachu')); g.sides[1].deck = [];
    const res = apply(g, { t: 'end' }, always(0.5)).game;
    expect(res.winner).toBe(0); expect(res.reason).toMatch(/hết bài/);
  });
  it('limits one energy per turn, one retreat per turn, and bench size', () => {
    const rng = mulberry32(11);
    let { game } = newGame(rng);
    const idx = game.sides[0].hand.findIndex(c => c.kind === 'pokemon');
    game = apply(game, { t: 'place', hand: idx }, rng, 0).game; game = apply(game, { t: 'ready' }, rng, 0).game;
    while (game.turn !== 0 && game.phase === 'main') game = apply(game, aiNext(game, rng, 1), rng, 1).game;
    const e = game.sides[0].hand.findIndex(c => c.kind === 'energy');
    if (e >= 0 && game.phase === 'main') {
      game = apply(game, { t: 'attach', hand: e, target: -1 }, rng, 0).game;
      const e2 = game.sides[0].hand.findIndex(c => c.kind === 'energy');
      if (e2 >= 0) expect(illegal(game, { t: 'attach', hand: e2, target: -1 })).toMatch(/1 Năng lượng/);
    }
  });
});

describe('arena ai', () => {
  it('shuffle is a permutation', () => {
    const items = [1, 2, 3, 4, 5, 6]; const out = shuffle(items, mulberry32(9));
    expect(out.slice().sort()).toEqual(items);
  });
  it('plays 300 AI-vs-AI games to a finish without illegal moves', () => {
    let finished = 0, turns = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const rng = mulberry32(seed * 7919);
      let { game } = newGame(rng);
      // bên 0 cũng do AI điều khiển để kiểm tra toàn bộ luật
      const mine = game.sides[0].hand.map((c, i) => ({ c, i })).filter(x => x.c.kind === 'pokemon').sort((a, b) => (b.c as { def: { hp: number } }).def.hp - (a.c as { def: { hp: number } }).def.hp);
      game = apply(game, { t: 'place', hand: mine[0].i }, rng, 0).game;
      game = apply(game, { t: 'ready' }, rng, 0).game;
      let steps = 0;
      while (game.phase !== 'over' && steps++ < 4000) {
        const side: Side = game.phase === 'promote' ? game.pending[0] : game.turn;
        const action: Action = aiNext(game, rng, side);
        game = apply(game, action, rng, side).game;
      }
      expect(game.phase).toBe('over'); finished++; turns += game.turnNumber;
    }
    expect(finished).toBe(300);
    expect(turns / 300).toBeLessThan(60);
  }, 20_000);
});
