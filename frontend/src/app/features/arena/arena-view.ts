import { ENERGY_LABEL } from './arena-cards';
import { costLabel } from './arena-controller';
import { hpLeft, illegal, names, RULES, type Game, type InPlay, type Side } from './arena-engine';

export interface AttackButton { index: number; name: string; cost: string; damage: string; text: string; enabled: boolean; reason: string | null }
export interface HandItem { index: number; uid: number; kind: 'pokemon' | 'energy'; label: string; enabled: boolean; reason: string | null }
export interface TargetItem { uid: number; zone: 'active' | 'bench'; index: number; label: string }
export interface Tracker { uid: number; name: string; hp: number; hpLeft: number; energy: string[]; status: string[] }
export interface SideSummary { name: string; active: Tracker | null; bench: Tracker[]; prizesLeft: number; deck: number; hand: number }
export interface ArenaView {
  status: string;
  canAct: boolean;
  over: boolean;
  winner: Side | null;
  reason: string;
  turnNumber: number;
  attacks: AttackButton[];
  canReady: boolean;
  canEnd: boolean;
  canRetreat: boolean;
  retreatReason: string | null;
  hand: HandItem[];
  prizesLeft: [number, number];
  deckLeft: [number, number];
  bench: TargetItem[];
  active: TargetItem | null;
  board: [SideSummary, SideSummary];
}

const kindLabel = (zone: 'active' | 'bench') => (zone === 'active' ? 'Chiến đấu' : 'băng ghế');

/** Mô hình hiển thị cho phần giao diện DOM (nút, trạng thái, danh sách trợ năng). Hàm thuần, không đụng tới cảnh 3D. */
export function buildView(game: Game, canAct: boolean): ArenaView {
  const me = game.sides[0];
  const attacks: AttackButton[] = (me.active?.def.attacks ?? []).map((attack, index) => {
    const reason = canAct && game.phase === 'main' ? illegal(game, { t: 'attack', index }, 0) : 'Chưa đến lượt bạn.';
    const damage = attack.damage ? `${attack.damage}${/^(hydroPump|psychicPlus|quickAttack)$/.test(attack.effect ?? '') ? '+' : ''}` : '—';
    return { index, name: attack.name, cost: costLabel(attack.cost), damage, text: attack.text, enabled: reason === null, reason };
  });
  const retreatReason = canAct && game.phase === 'main'
    ? (me.bench.length ? illegal(game, { t: 'retreat', bench: 0 }, 0) : 'Băng ghế trống.')
    : 'Chưa đến lượt bạn.';
  const hand: HandItem[] = me.hand.map((card, index) => {
    if (card.kind === 'pokemon') {
      const reason = canAct && (game.phase === 'setup' || game.phase === 'main') ? illegal(game, { t: 'place', hand: index }, 0) : 'Chưa đến lượt bạn.';
      return { index, uid: card.uid, kind: 'pokemon', label: `${card.def.name} (${card.def.hp} HP)`, enabled: reason === null, reason };
    }
    const reason = canAct && game.phase === 'main' ? (game.attached ? 'Mỗi lượt chỉ gắn được 1 Năng lượng.' : null) : 'Chưa đến lượt bạn.';
    return { index, uid: card.uid, kind: 'energy', label: `Năng lượng ${ENERGY_LABEL[card.type]}`, enabled: reason === null, reason };
  });
  const toTarget = (pk: InPlay, zone: 'active' | 'bench', index: number): TargetItem => ({ uid: pk.uid, zone, index, label: `${pk.def.name} (${kindLabel(zone)}, còn ${hpLeft(pk)} HP)` });
  const track = (pk: InPlay, hidden: boolean): Tracker => hidden
    ? { uid: pk.uid, name: 'Thẻ úp', hp: 0, hpLeft: 0, energy: [], status: [] }
    : { uid: pk.uid, name: pk.def.name, hp: pk.def.hp, hpLeft: hpLeft(pk), energy: pk.energy.map(e => ENERGY_LABEL[e.type]),
        status: [pk.paralyzed ? 'Tê liệt' : '', pk.shielded ? 'Được bảo vệ' : '', pk.tailWagged ? 'Bị Tail Wag' : ''].filter(Boolean) };
  const summarize = (side: Side): SideSummary => {
    const p = game.sides[side], hidden = side === 1 && game.phase === 'setup';
    return { name: names[side], active: p.active ? track(p.active, hidden) : null, bench: p.bench.map(pk => track(pk, hidden)), prizesLeft: RULES.prizes - p.prizesTaken, deck: p.deck.length, hand: p.hand.length };
  };
  const winnerText = game.winner === null ? '' : game.winner === 0 ? 'Bạn thắng!' : 'Máy thắng.';
  let status: string;
  if (game.phase === 'over') status = `${winnerText} ${game.reason}`;
  else if (game.phase === 'setup') status = 'Chuẩn bị: đặt Pokémon Chiến đấu từ tay, thêm tối đa 3 Pokémon lên băng ghế rồi bấm "Sẵn sàng".';
  else if (game.phase === 'promote') status = game.pending[0] === 0 ? 'Chọn Pokémon Chiến đấu mới từ băng ghế.' : 'Máy đang chọn Pokémon Chiến đấu mới…';
  else status = game.turn === 0 ? `Lượt ${game.turnNumber} — lượt của bạn.` : `Lượt ${game.turnNumber} — ${names[1]} đang suy nghĩ…`;
  return {
    status, canAct, over: game.phase === 'over', winner: game.winner, reason: game.reason, turnNumber: game.turnNumber, attacks,
    canReady: canAct && game.phase === 'setup' && !!me.active,
    canEnd: canAct && game.phase === 'main',
    canRetreat: retreatReason === null, retreatReason,
    hand,
    prizesLeft: [RULES.prizes - game.sides[0].prizesTaken, RULES.prizes - game.sides[1].prizesTaken],
    deckLeft: [game.sides[0].deck.length, game.sides[1].deck.length],
    bench: me.bench.map((pk, i) => toTarget(pk, 'bench', i)),
    active: me.active ? toTarget(me.active, 'active', 0) : null,
    board: [summarize(0), summarize(1)],
  };
}
