import { canPay, hpLeft, illegal, pokemonOf, type Action, type Game, type InPlay, type Rng, type Side } from './arena-engine';
import type { Energy } from './arena-cards';

const attackValue = (game: Game, side: Side, index: number): number => {
  const mine = game.sides[side].active!, foe = game.sides[side === 0 ? 1 : 0].active!, attack = mine.def.attacks[index];
  let value = attack.damage;
  if (attack.effect === 'psychicPlus') value += foe.energy.length * 10;
  if (attack.effect === 'quickAttack') value += 10;
  if (attack.effect === 'hydroPump') value += Math.min(2, Math.max(0, mine.energy.filter(e => e.type === 'Water').length - 3)) * 10;
  if (value > 0 && foe.def.weakness === mine.def.type) value *= 2;
  if (attack.effect === 'barrier') value = 12; if (attack.effect === 'withdraw') value = 8; if (attack.effect === 'tailWag') value = 6; if (attack.effect === 'bubble') value += 8;
  if (attack.effect === 'discard2') value -= 15; if (attack.effect === 'discard1Fire') value -= 8; if (attack.effect === 'thunderJolt') value -= 5;
  if (value >= hpLeft(foe)) value += 100; // hạ gục được thì ưu tiên tối đa
  return value;
};

const attachScore = (p: InPlay, type: Energy, isActive: boolean): number => {
  const next = [...p.energy, { type }];
  let score = isActive ? 3 : 0;
  for (const attack of p.def.attacks) {
    if (canPay(next, attack.cost) && !canPay(p.energy, attack.cost)) score += 100 + attack.damage;
    else if (!canPay(p.energy, attack.cost)) {
      const have = p.energy.filter(e => e.type === type).length, need = attack.cost.filter(c => c === type).length;
      if (need > have) score += 20; else if (attack.cost.includes('Colorless')) score += 5;
    }
  }
  return score;
};

/** Hành động kế tiếp của máy cho `side` (mặc định bên 1). Gọi lặp lại đến khi trả về 'attack' hoặc 'end'. */
export function aiNext(game: Game, _rng: Rng, side: Side = 1): Action {
  const me = game.sides[side];
  if (game.phase === 'promote') {
    let best = 0, bestScore = -1;
    me.bench.forEach((p, i) => { const s = hpLeft(p) + p.energy.length * 15; if (s > bestScore) { bestScore = s; best = i; } });
    return { t: 'promote', bench: best };
  }
  // 1) đặt Pokémon lên băng ghế (con HP cao trước)
  const pokemon = me.hand.map((c, i) => ({ c, i })).filter(x => x.c.kind === 'pokemon').sort((a, b) => (b.c as { def: { hp: number } }).def.hp - (a.c as { def: { hp: number } }).def.hp);
  if (pokemon.length) { const action: Action = { t: 'place', hand: pokemon[0].i }; if (!illegal(game, action, side)) return action; }
  // 2) gắn Năng lượng vào Pokémon có lợi nhất
  if (!game.attached) {
    const energies = me.hand.map((c, i) => ({ c, i })).filter(x => x.c.kind === 'energy');
    let best: Action | null = null, bestScore = -1;
    for (const { c, i } of energies) {
      const type = (c as { type: Energy }).type;
      pokemonOf(me).forEach((p, n) => { const s = attachScore(p, type, n === 0 && !!me.active); if (s > bestScore) { bestScore = s; best = { t: 'attach', hand: i, target: me.active ? n - 1 : n }; } });
    }
    if (best && !illegal(game, best, side)) return best;
  }
  // 3) rút lui nếu Pokémon Chiến đấu không đánh được mà một Pokémon ở băng ghế đánh được
  if (me.active && !game.retreated && !me.active.def.attacks.some(a => canPay(me.active!.energy, a.cost))) {
    const idx = me.bench.findIndex(p => p.def.attacks.some(a => canPay(p.energy, a.cost)));
    if (idx >= 0) { const action: Action = { t: 'retreat', bench: idx }; if (!illegal(game, action, side)) return action; }
  }
  // 4) tấn công bằng đòn tốt nhất có thể
  let attack = -1, bestValue = -Infinity;
  me.active?.def.attacks.forEach((_, i) => { if (!illegal(game, { t: 'attack', index: i }, side)) { const v = attackValue(game, side, i); if (v > bestValue) { bestValue = v; attack = i; } } });
  return attack >= 0 ? { t: 'attack', index: attack } : { t: 'end' };
}
