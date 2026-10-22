import { aiNext } from './arena-ai';
import { ENERGY_LABEL, type AttackDef, type CostType, type Energy } from './arena-cards';
import { apply, hpLeft, mulberry32, newGame, RuleError, type Action, type Game, type GameEvent, type InPlay, type Rng, type Side } from './arena-engine';

/** Lớp trình bày (cảnh 3D hoặc bản giả khi kiểm thử). `present` trả về số giây cần chờ trước khi sang bước kế. */
export interface Presenter {
  reset(game: Game): void;
  present(events: readonly GameEvent[], game: Game): number;
}

export const AI_THINK_SECONDS = 0.75;
const MAX_LOG = 80;

/**
 * Điều phối ván đấu: người chơi (bên 0) và máy (bên 1) đi qua cùng một engine; mỗi hành động tạo một "bước"
 * được xếp hàng để cảnh trình bày lần lượt. Giao diện chỉ cho thao tác khi hàng đợi đã cạn (`canAct`).
 */
export class ArenaController {
  /** Trạng thái chuẩn (đã tính hết các bước đã xếp hàng). */
  game!: Game;
  /** Trạng thái đang hiển thị trên cảnh (đã qua các bước đã trình bày). */
  displayed!: Game;
  readonly log: string[] = [];
  private queue: { game: Game; events: GameEvent[] }[] = [];
  private holdUntil = 0;
  private aiAt = 0;
  private rng: Rng;

  constructor(private readonly presenter: Presenter, private readonly onChange: () => void, seed = Date.now()) {
    this.rng = mulberry32(seed);
  }

  /** `options.first` ép người đi trước (dùng cho chế độ hướng dẫn: người chơi đi trước). */
  start(seed?: number, options: { first?: Side } = {}): void {
    if (seed !== undefined) this.rng = mulberry32(seed);
    const { game, events } = newGame(this.rng, options);
    this.game = game; this.displayed = game; this.queue = []; this.holdUntil = 0; this.aiAt = 0;
    this.log.length = 0;
    this.addLog(events);
    this.presenter.reset(game);
    this.onChange();
  }

  get busy(): boolean { return this.queue.length > 0 || this.holdUntil > 0; }
  get over(): boolean { return this.displayed.phase === 'over' && !this.busy; }

  /** Người chơi có thể thao tác ngay lúc này không. */
  canAct(): boolean {
    if (this.busy) return false;
    const g = this.displayed;
    if (g.phase === 'over') return false;
    if (g.phase === 'setup') return true;
    if (g.phase === 'promote') return g.pending[0] === 0;
    return g.turn === 0;
  }

  /** Thực hiện hành động của người chơi; trả lý do từ chối (tiếng Việt) hoặc null nếu thành công. */
  act(action: Action): string | null {
    if (!this.canAct()) return 'Chưa đến lượt bạn.';
    try { this.push(apply(this.game, action, this.rng, 0)); } catch (error) {
      if (error instanceof RuleError) { this.say(error.message); return error.message; }
      throw error;
    }
    return null;
  }

  /** Gọi mỗi khung hình với thời gian tính bằng giây. */
  tick(now: number): void {
    if (this.holdUntil > 0) { if (now < this.holdUntil) return; this.holdUntil = 0; this.onChange(); }
    const step = this.queue.shift();
    if (step) {
      this.displayed = step.game; this.addLog(step.events);
      this.holdUntil = now + this.presenter.present(step.events, step.game);
      this.onChange();
      return;
    }
    const g = this.game;
    const aiTurn = g.phase === 'promote' ? g.pending[0] === 1 : g.phase === 'main' && g.turn === 1;
    if (!aiTurn) { this.aiAt = 0; return; }
    if (this.aiAt === 0) this.aiAt = now + AI_THINK_SECONDS;
    if (now < this.aiAt) return;
    this.aiAt = 0;
    this.push(apply(g, aiNext(g, this.rng, 1), this.rng, 1));
  }

  private push(result: { game: Game; events: GameEvent[] }): void {
    this.game = result.game;
    this.queue.push(result);
    this.onChange();
  }
  private say(text: string): void { this.addLog([{ t: 'say', text }]); this.onChange(); }
  private addLog(events: readonly GameEvent[]): void {
    for (const event of events) if (event.t === 'say') this.log.push(event.text);
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);
  }
}

export interface Inspect {
  uid: number; name: string; code: string; hp: number; hpLeft: number; type: CostType; typeLabel: string;
  weakness: string | null; retreat: number; attacks: { attack: AttackDef; costLabel: string }[];
  energy: { type: Energy; label: string }[]; status: string[]; side: Side; hidden: boolean;
}

export const costLabel = (cost: readonly CostType[]): string => cost.map(c => ENERGY_LABEL[c]).join(' · ');

/** Thông tin hiển thị cho bảng "xem thẻ" (Pokémon trên bàn hoặc thẻ trong tay/bỏ). */
export function inspect(game: Game, uid: number): Inspect | null {
  for (const s of [0, 1] as Side[]) {
    const side = game.sides[s];
    const pk: InPlay | undefined = [side.active, ...side.bench].find((p): p is InPlay => !!p && p.uid === uid);
    const card = pk ? { def: pk.def } : [...side.hand, ...side.discard].map(c => (c.kind === 'pokemon' && c.uid === uid ? c : null)).find(Boolean);
    const energyCard = [...side.hand, ...side.discard].find(c => c.kind === 'energy' && c.uid === uid);
    if (!card && energyCard && energyCard.kind === 'energy') {
      return { uid, name: `Năng lượng ${ENERGY_LABEL[energyCard.type]}`, code: '', hp: 0, hpLeft: 0, type: energyCard.type, typeLabel: ENERGY_LABEL[energyCard.type], weakness: null, retreat: 0, attacks: [], energy: [], status: [], side: s, hidden: false };
    }
    if (!card || !('def' in card) || !card.def) continue;
    const def = card.def, hidden = s === 1 && game.phase === 'setup';
    if (hidden) return { uid, name: 'Thẻ úp', code: '', hp: 0, hpLeft: 0, type: 'Colorless', typeLabel: '', weakness: null, retreat: 0, attacks: [], energy: [], status: [], side: s, hidden: true };
    const status: string[] = [];
    if (pk?.paralyzed) status.push('Tê liệt');
    if (pk?.shielded) status.push('Được bảo vệ');
    if (pk?.tailWagged) status.push('Bị Tail Wag');
    return {
      uid, name: def.name, code: def.code, hp: def.hp, hpLeft: pk ? hpLeft(pk) : def.hp, type: def.type, typeLabel: ENERGY_LABEL[def.type],
      weakness: def.weakness ? ENERGY_LABEL[def.weakness] : null, retreat: def.retreat,
      attacks: def.attacks.map(attack => ({ attack, costLabel: costLabel(attack.cost) })),
      energy: (pk?.energy ?? []).map(e => ({ type: e.type, label: ENERGY_LABEL[e.type] })), status, side: s, hidden: false,
    };
  }
  return null;
}
