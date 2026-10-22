import { ARENA_POKEMON, DECK_ENERGY, type AttackDef, type CostType, type Energy, type PokemonDef } from './arena-cards';

/** Luật rút gọn: mỗi bên 24 lá (9 Pokémon + 15 Năng lượng), tay 5 lá, băng ghế 3, thắng khi lấy đủ 3 Giải thưởng. */
export const RULES = { handSize: 5, bench: 3, prizes: 3 } as const;
export type Rng = () => number;
export type Side = 0 | 1;

export type Card = { uid: number; kind: 'pokemon'; def: PokemonDef } | { uid: number; kind: 'energy'; type: Energy };
export interface AttachedEnergy { uid: number; type: Energy }
export interface InPlay {
  uid: number; def: PokemonDef; damage: number; energy: AttachedEnergy[];
  paralyzed: boolean; shielded: boolean; tailWagged: boolean;
}
export interface PlayerState { deck: Card[]; hand: Card[]; active: InPlay | null; bench: InPlay[]; prizesTaken: number; discard: Card[] }
export type Phase = 'setup' | 'main' | 'promote' | 'over';
export interface Game {
  sides: [PlayerState, PlayerState]; turn: Side; phase: Phase; turnNumber: number;
  attached: boolean; retreated: boolean; ready: [boolean, boolean]; pending: Side[];
  winner: Side | null; reason: string; nextUid: number;
}
export type Action =
  | { t: 'place'; hand: number }
  | { t: 'ready' }
  | { t: 'attach'; hand: number; target: number } // target -1 = Pokémon Chiến đấu, 0.. = băng ghế
  | { t: 'retreat'; bench: number }
  | { t: 'attack'; index: number }
  | { t: 'promote'; bench: number }
  | { t: 'end' };
export type GameEvent =
  | { t: 'say'; text: string }
  | { t: 'draw'; side: Side; uid: number }
  | { t: 'play'; side: Side; uid: number; to: 'active' | 'bench' }
  | { t: 'attach'; side: Side; energyUid: number; targetUid: number }
  | { t: 'retreat'; side: Side; uid: number }
  | { t: 'promote'; side: Side; uid: number }
  | { t: 'attack'; side: Side; attacker: number; defender: number; name: string; type: CostType }
  | { t: 'damage'; side: Side; uid: number; amount: number; weak: boolean }
  | { t: 'heal'; side: Side; uid: number; amount: number }
  | { t: 'coin'; heads: boolean }
  | { t: 'ko'; side: Side; uid: number }
  | { t: 'prize'; side: Side }
  | { t: 'turn'; side: Side; number: number }
  | { t: 'over'; winner: Side };
export interface Result { game: Game; events: GameEvent[] }

export class RuleError extends Error {}
const fail = (message: string): never => { throw new RuleError(message); };

export function mulberry32(seed: number): Rng {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const other = (side: Side): Side => (side === 0 ? 1 : 0);
export const names = ['Bạn', 'Máy'] as const;
const clone = (game: Game): Game => structuredClone(game);

/** Có đủ Năng lượng gắn kèm để trả chi phí không (Vô sắc dùng bất kỳ loại nào). */
export function canPay(energy: readonly { type: Energy }[], cost: readonly CostType[]): boolean {
  const pool: Record<string, number> = {};
  for (const e of energy) pool[e.type] = (pool[e.type] ?? 0) + 1;
  let colorless = 0;
  for (const c of cost) {
    if (c === 'Colorless') { colorless++; continue; }
    if ((pool[c] ?? 0) <= 0) return false;
    pool[c]--;
  }
  return Object.values(pool).reduce((sum, n) => sum + n, 0) >= colorless;
}

function buildDeck(game: Game): Card[] {
  const cards: Card[] = [];
  for (const def of ARENA_POKEMON) cards.push({ uid: game.nextUid++, kind: 'pokemon', def });
  for (const type of DECK_ENERGY) cards.push({ uid: game.nextUid++, kind: 'energy', type });
  return cards;
}
const inPlay = (card: Card): InPlay => {
  if (card.kind !== 'pokemon') return fail('Chỉ Pokémon mới đặt xuống bàn được.');
  return { uid: card.uid, def: card.def, damage: 0, energy: [], paralyzed: false, shielded: false, tailWagged: false };
};
const pokemonOf = (side: PlayerState): InPlay[] => (side.active ? [side.active, ...side.bench] : [...side.bench]);

/** Tạo ván mới: chia bài, mulligan nếu tay không có Pokémon, máy tự đặt Pokémon, chọn người đi trước. */
export function newGame(rng: Rng, options: { first?: Side } = {}): Result {
  const game: Game = {
    sides: [{ deck: [], hand: [], active: null, bench: [], prizesTaken: 0, discard: [] }, { deck: [], hand: [], active: null, bench: [], prizesTaken: 0, discard: [] }],
    turn: 0, phase: 'setup', turnNumber: 0, attached: false, retreated: false, ready: [false, false], pending: [], winner: null, reason: '', nextUid: 1,
  };
  const events: GameEvent[] = [];
  for (const s of [0, 1] as Side[]) {
    const side = game.sides[s];
    side.deck = shuffle(buildDeck(game), rng);
    let attempts = 0;
    do {
      side.deck = shuffle([...side.deck, ...side.hand], rng); side.hand = [];
      for (let i = 0; i < RULES.handSize; i++) side.hand.push(side.deck.pop()!);
      if (++attempts > 50) break;
    } while (!side.hand.some(c => c.kind === 'pokemon'));
  }
  const flipped: Side = rng() < 0.5 ? 0 : 1; // luôn tiêu thụ RNG để chuỗi ngẫu nhiên không đổi khi ép người đi trước
  game.turn = options.first ?? flipped;
  events.push({ t: 'say', text: options.first === undefined ? `${names[game.turn]} đi trước (tung đồng xu).` : `${names[game.turn]} đi trước.` });
  // Máy đặt Pokémon: con có HP cao nhất làm Chiến đấu, còn lại lên băng ghế.
  const ai = game.sides[1];
  const picks = ai.hand.map((c, i) => ({ c, i })).filter(x => x.c.kind === 'pokemon').sort((a, b) => (b.c as { def: PokemonDef }).def.hp - (a.c as { def: PokemonDef }).def.hp);
  const chosen = picks.slice(0, 1 + RULES.bench).map(x => x.i).sort((a, b) => b - a);
  const placed = chosen.map(i => ai.hand.splice(i, 1)[0]).sort((a, b) => ((b as { def: PokemonDef }).def.hp) - ((a as { def: PokemonDef }).def.hp));
  placed.forEach((card, n) => { const p = inPlay(card); if (n === 0) ai.active = p; else ai.bench.push(p); });
  game.ready[1] = true;
  events.push({ t: 'say', text: 'Máy đã đặt Pokémon úp xuống. Hãy đặt Pokémon Chiến đấu của bạn.' });
  return { game, events };
}

function startTurn(game: Game, events: GameEvent[]) {
  game.turnNumber++; game.attached = false; game.retreated = false; game.phase = 'main';
  events.push({ t: 'turn', side: game.turn, number: game.turnNumber });
  const side = game.sides[game.turn];
  const card = side.deck.pop();
  if (!card) { finish(game, other(game.turn), `${names[game.turn]} hết bài để rút.`, events); return; }
  side.hand.push(card);
  events.push({ t: 'draw', side: game.turn, uid: card.uid });
}
function finish(game: Game, winner: Side, reason: string, events: GameEvent[]) {
  game.phase = 'over'; game.winner = winner; game.reason = reason; game.pending = [];
  events.push({ t: 'say', text: reason }, { t: 'over', winner });
}
function endTurn(game: Game, events: GameEvent[]) {
  const side = game.turn, foe = other(side);
  const mine = game.sides[side], theirs = game.sides[foe];
  // Kiểm tra giữa lượt: tê liệt của chính mình hết, hiệu ứng "đến lượt tới của đối thủ" của đối thủ hết.
  for (const p of pokemonOf(mine)) { p.paralyzed = false; p.tailWagged = false; }
  for (const p of pokemonOf(theirs)) p.shielded = false;
  game.turn = foe;
  startTurn(game, events);
}

function gather(game: Game, side: Side, events: GameEvent[]) { // dọn Pokémon bị hạ gục và lập danh sách cần chọn lại
  const me = game.sides[side];
  const knocked = pokemonOf(me).filter(p => p.damage >= p.def.hp);
  for (const p of knocked) {
    events.push({ t: 'ko', side, uid: p.uid }, { t: 'say', text: `${p.def.name} (${names[side]}) bị hạ gục!` });
    me.discard.push({ uid: p.uid, kind: 'pokemon', def: p.def }, ...p.energy.map(e => ({ uid: e.uid, kind: 'energy' as const, type: e.type })));
    if (me.active === p) me.active = null; else me.bench = me.bench.filter(b => b !== p);
    const foe = game.sides[other(side)]; foe.prizesTaken++;
    events.push({ t: 'prize', side: other(side) });
  }
  return knocked.length;
}

function say(events: GameEvent[], text: string) { events.push({ t: 'say', text }); }
function flip(rng: Rng, events: GameEvent[]): boolean { const heads = rng() < 0.5; events.push({ t: 'coin', heads }); say(events, `Tung đồng xu: ${heads ? 'ngửa' : 'sấp'}.`); return heads; }
function discardEnergy(game: Game, side: Side, p: InPlay, count: number, only?: Energy) {
  let left = count;
  for (let i = p.energy.length - 1; i >= 0 && left > 0; i--) {
    if (only && p.energy[i].type !== only) continue;
    const [e] = p.energy.splice(i, 1); game.sides[side].discard.push({ uid: e.uid, kind: 'energy', type: e.type }); left--;
  }
}

/** Kiểm tra hợp lệ của hành động; trả về lý do từ chối hoặc null nếu hợp lệ. */
export function illegal(game: Game, action: Action, side: Side = game.turn): string | null {
  if (game.phase === 'over') return 'Ván đấu đã kết thúc.';
  const me = game.sides[side];
  if (game.phase === 'promote') {
    if (action.t !== 'promote') return 'Cần chọn Pokémon Chiến đấu mới.';
    if (game.pending[0] !== side) return 'Chưa đến lượt bạn chọn.';
    return me.bench[action.bench] ? null : 'Không có Pokémon ở vị trí đó.';
  }
  if (game.phase === 'setup') {
    if (side !== 0) return 'Chờ người chơi đặt Pokémon.';
    if (action.t === 'ready') return me.active ? null : 'Hãy đặt Pokémon Chiến đấu trước.';
    if (action.t !== 'place') return 'Đang trong bước chuẩn bị.';
    const card = me.hand[action.hand];
    if (!card || card.kind !== 'pokemon') return 'Hãy chọn một thẻ Pokémon.';
    return me.active && me.bench.length >= RULES.bench ? 'Băng ghế đã đầy.' : null;
  }
  if (side !== game.turn) return 'Chưa đến lượt bạn.';
  switch (action.t) {
    case 'place': {
      const card = me.hand[action.hand];
      if (!card || card.kind !== 'pokemon') return 'Hãy chọn một thẻ Pokémon.';
      return me.bench.length >= RULES.bench ? 'Băng ghế đã đầy.' : null;
    }
    case 'attach': {
      const card = me.hand[action.hand];
      if (!card || card.kind !== 'energy') return 'Hãy chọn một thẻ Năng lượng.';
      if (game.attached) return 'Mỗi lượt chỉ gắn được 1 Năng lượng.';
      const target = action.target === -1 ? me.active : me.bench[action.target];
      return target ? null : 'Không có Pokémon ở vị trí đó.';
    }
    case 'retreat': {
      if (game.retreated) return 'Mỗi lượt chỉ rút lui được 1 lần.';
      if (!me.active || !me.bench[action.bench]) return 'Không có Pokémon để đổi.';
      if (me.active.paralyzed) return 'Pokémon bị Tê liệt không thể rút lui.';
      return me.active.energy.length >= me.active.def.retreat ? null : `Cần ${me.active.def.retreat} Năng lượng để rút lui.`;
    }
    case 'attack': {
      const mine = me.active, foe = game.sides[other(side)].active, attack = mine?.def.attacks[action.index];
      if (!mine || !attack) return 'Không có đòn đánh này.';
      if (game.turnNumber === 1) return 'Người đi trước không được tấn công ở lượt đầu.';
      if (mine.paralyzed) return 'Pokémon bị Tê liệt không thể tấn công.';
      if (!foe) return 'Đối thủ chưa có Pokémon Chiến đấu.';
      if (foe.def.id === 'eevee' && mine.tailWagged) return 'Eevee đã dùng Tail Wag: không thể tấn công Eevee lượt này.';
      return canPay(mine.energy, attack.cost) ? null : 'Chưa đủ Năng lượng.';
    }
    case 'end': return null;
    default: return 'Hành động không hợp lệ trong lượt này.';
  }
}

/** Áp dụng một hành động. Ném RuleError nếu không hợp lệ. Không sửa đối tượng truyền vào. */
export function apply(prev: Game, action: Action, rng: Rng, side: Side = prev.turn): Result {
  const reason = illegal(prev, action, side);
  if (reason) throw new RuleError(reason);
  const game = clone(prev), events: GameEvent[] = [], me = game.sides[side];

  if (game.phase === 'promote') {
    const [p] = me.bench.splice((action as { bench: number }).bench, 1); me.active = p;
    events.push({ t: 'promote', side, uid: p.uid }); say(events, `${names[side]} chọn ${p.def.name} làm Pokémon Chiến đấu.`);
    game.pending.shift();
    if (!game.pending.length) { game.phase = 'main'; endTurn(game, events); }
    return { game, events };
  }
  if (game.phase === 'setup') {
    if (action.t === 'ready') {
      game.ready[0] = true; game.phase = 'main'; game.turnNumber = 0; say(events, 'Bắt đầu trận đấu!'); startTurn(game, events);
      return { game, events };
    }
    const [card] = me.hand.splice((action as { hand: number }).hand, 1), p = inPlay(card);
    if (!me.active) { me.active = p; events.push({ t: 'play', side, uid: p.uid, to: 'active' }); } else { me.bench.push(p); events.push({ t: 'play', side, uid: p.uid, to: 'bench' }); }
    say(events, `${names[side]} đặt ${p.def.name} ${me.active === p ? 'làm Pokémon Chiến đấu' : 'lên băng ghế'}.`);
    return { game, events };
  }

  switch (action.t) {
    case 'place': {
      const [card] = me.hand.splice(action.hand, 1), p = inPlay(card);
      if (!me.active) { me.active = p; events.push({ t: 'play', side, uid: p.uid, to: 'active' }); } else { me.bench.push(p); events.push({ t: 'play', side, uid: p.uid, to: 'bench' }); }
      say(events, `${names[side]} đặt ${p.def.name} xuống bàn.`);
      break;
    }
    case 'attach': {
      const [card] = me.hand.splice(action.hand, 1) as [{ uid: number; kind: 'energy'; type: Energy }];
      const target = (action.target === -1 ? me.active : me.bench[action.target])!;
      target.energy.push({ uid: card.uid, type: card.type }); game.attached = true;
      events.push({ t: 'attach', side, energyUid: card.uid, targetUid: target.uid });
      say(events, `${names[side]} gắn Năng lượng ${card.type} cho ${target.def.name}.`);
      break;
    }
    case 'retreat': {
      const old = me.active!; discardEnergy(game, side, old, old.def.retreat);
      const [next] = me.bench.splice(action.bench, 1); me.bench.push(old); me.active = next; game.retreated = true;
      events.push({ t: 'retreat', side, uid: old.uid }, { t: 'promote', side, uid: next.uid });
      say(events, `${names[side]} rút lui ${old.def.name}, đưa ${next.def.name} lên Chiến đấu.`);
      break;
    }
    case 'attack': attackStep(game, side, action.index, rng, events); return { game, events };
    case 'end': endTurn(game, events); return { game, events };
  }
  return { game, events };
}

function attackStep(game: Game, side: Side, index: number, rng: Rng, events: GameEvent[]) {
  const foeSide = other(side), me = game.sides[side], foeState = game.sides[foeSide];
  const mine = me.active!, foe = foeState.active!, attack: AttackDef = mine.def.attacks[index];
  events.push({ t: 'attack', side, attacker: mine.uid, defender: foe.uid, name: attack.name, type: mine.def.type });
  say(events, `${mine.def.name} (${names[side]}) dùng ${attack.name}!`);
  let damage = attack.damage, blockedEffects = foe.shielded && attack.damage > 0;
  const heads = () => flip(rng, events);
  switch (attack.effect) {
    case 'hydroPump': { const extra = Math.min(2, Math.max(0, mine.energy.filter(e => e.type === 'Water').length - 3)); damage += extra * 10; break; }
    case 'psychicPlus': damage += foe.energy.length * 10; break;
    case 'quickAttack': if (heads()) damage += 20; break;
    case 'barrier': discardEnergy(game, side, mine, 1, 'Psychic'); mine.shielded = true; say(events, 'Barrier: Mewtwo được bảo vệ ở lượt tới của đối thủ.'); break;
    case 'withdraw': if (heads()) { mine.shielded = true; say(events, 'Withdraw: Squirtle chặn mọi sát thương ở lượt tới của đối thủ.'); } break;
    case 'tailWag': if (heads() && !foe.shielded) { foe.tailWagged = true; say(events, 'Pokémon đối thủ không thể tấn công Eevee ở lượt tới.'); } break;
    case 'bubble': if (heads() && !foe.shielded) { foe.paralyzed = true; say(events, `${foe.def.name} bị Tê liệt!`); } break;
    default: break;
  }
  if (damage > 0) {
    let weak = false;
    if (foe.shielded) { damage = 0; say(events, `${foe.def.name} được bảo vệ: không nhận sát thương.`); }
    else if (foe.def.weakness && foe.def.weakness === mine.def.type) { damage *= 2; weak = true; say(events, 'Đánh trúng điểm yếu: sát thương x2!'); }
    if (damage > 0) { foe.damage += damage; events.push({ t: 'damage', side: foeSide, uid: foe.uid, amount: damage, weak }); say(events, `${foe.def.name} nhận ${damage} sát thương.`); }
  }
  void blockedEffects;
  switch (attack.effect) {
    case 'discard2': discardEnergy(game, side, mine, 2); break;
    case 'discard1Fire': discardEnergy(game, side, mine, 1, 'Fire'); break;
    case 'leechSeed': if (damage > 0 && mine.damage > 0) { const heal = Math.min(10, mine.damage); mine.damage -= heal; events.push({ t: 'heal', side, uid: mine.uid, amount: heal }); say(events, `${mine.def.name} hồi ${heal} HP.`); } break;
    case 'thunderJolt': if (!heads()) { mine.damage += 10; events.push({ t: 'damage', side, uid: mine.uid, amount: 10, weak: false }); say(events, 'Pikachu tự nhận 10 sát thương.'); } break;
    default: break;
  }
  const foeKnocked = gather(game, foeSide, events), selfKnocked = gather(game, side, events);
  void foeKnocked; void selfKnocked;
  // Điều kiện thắng.
  for (const s of [side, foeSide]) if (game.sides[s].prizesTaken >= RULES.prizes) { finish(game, s, `${names[s]} đã lấy đủ ${RULES.prizes} thẻ Giải thưởng!`, events); return; }
  for (const s of [foeSide, side]) if (!game.sides[s].active && !game.sides[s].bench.length) { finish(game, other(s), `${names[s]} không còn Pokémon nào trên bàn.`, events); return; }
  game.pending = ([foeSide, side] as Side[]).filter(s => !game.sides[s].active);
  if (game.pending.length) { game.phase = 'promote'; return; }
  endTurn(game, events);
}

export const energyCount = (p: InPlay | null) => p?.energy.length ?? 0;
export const hpLeft = (p: InPlay) => Math.max(0, p.def.hp - p.damage);
export { pokemonOf };
