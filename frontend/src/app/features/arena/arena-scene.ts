import { ARENA_POKEMON, ENERGY_RGB, type CostType, type Energy } from './arena-cards';
import { RULES, type Card, type Game, type GameEvent, type InPlay, type Side } from './arena-engine';
import { INSTANCE_FLOATS, KIND } from './arena-shaders';
import { makeCamera, pointInPolygon, project, quadCorners, type Camera, type Vec3 } from './arena-math';

/**
 * Cảnh 3D của sân đấu: mỗi lá bài (theo uid) là một "Visual" bám theo mục tiêu do trạng thái ván đấu quyết định
 * (tay/chiến đấu/băng ghế/chồng bài/bỏ). Chuyển động = làm mượt dần tới mục tiêu nên mọi sự kiện đều mượt mà không cần
 * kịch bản riêng; hiệu ứng (lao tới, đạn, đồng xu, vụ nổ, rung camera) là lớp phủ tạm thời.
 */
export type Zone = 'hand' | 'active' | 'bench' | 'deck' | 'discard' | 'prize';
export interface Pick { uid: number; side: Side; zone: Zone; index: number }
export interface Popup { text: string; kind: 'damage' | 'weak' | 'heal' | 'coin' | 'ko'; world: Vec3 }
export interface UiState {
  /** uid của lá đang chọn trong tay (Năng lượng chờ chọn đích). */
  selected: number | null;
  /** uid các Pokémon hợp lệ để chọn (đích gắn Năng lượng, ứng viên rút lui/lên Chiến đấu). */
  targets: ReadonlySet<number>;
  hover: number | null;
  /** Thẻ cần nhấn mạnh trong bước hướng dẫn (quầng vàng nhấp nháy). */
  guide: ReadonlySet<number>;
  /** Khu vực cần nhấn mạnh: "side:zone", ví dụ "0:active", "0:bench", "1:prize". */
  guideZones: ReadonlySet<string>;
  /** Vị trí con trỏ trong khung hình, -1..1 (dùng để nghiêng thẻ cho hiệu ứng ánh kim). */
  pointer: readonly [number, number];
}

interface Pose { x: number; y: number; z: number; rz: number; rx: number; ry: number; w: number; alpha: number }
const POSE_KEYS: (keyof Pose)[] = ['x', 'y', 'z', 'rz', 'rx', 'ry', 'w', 'alpha'];
interface Visual {
  uid: number; layer: number; energy: Energy | null; side: Side; zone: Zone; index: number;
  pose: Pose; target: Pose; face: boolean; foil: number; flash: number; pickable: boolean;
  inPlay: InPlay | null; hp: number; hpTarget: number; orb: boolean; attachTo: number; attachSlot: number; attachCount: number;
  lunge: { dx: number; dy: number; start: number; dur: number } | null; shake: number; glow: [number, number, number, number];
}
interface Particle { ambient?: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; r: number; g: number; b: number; glow: number }
interface Timer { at: number; run: () => void }

export const CARD_ASPECT = 495 / 360;
const MAX_PARTICLES = 420;
export const BOARD = {
  active: { x: 0, y: 1.85, w: 2.3 }, bench: { y: 5.0, w: 1.7, dx: 2.75 }, hand: { y: 8.15, w: 2.0 },
  deck: { x: 6.0, y: 3.5, w: 1.4 }, discard: { x: 6.0, y: 0.7, w: 1.4 }, prize: { x: -6.0, y: 0.8, w: 1.1, dy: 1.5 },
} as const;
const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const typeColor = (type: CostType): [number, number, number] => ENERGY_RGB[type];

const emptyPose = (): Pose => ({ x: 0, y: 0, z: 0, rz: 0, rx: 0, ry: 0, w: 1.3, alpha: 0 });
const layerOf = (card: Card) => (card.kind === 'pokemon' ? Math.max(0, ARENA_POKEMON.findIndex(p => p.id === card.def.id)) : ARENA_POKEMON.length);

export class ArenaScene {
  popup: ((popup: Popup) => void) | null = null;
  readonly aspect = { value: 16 / 9 };
  private visuals = new Map<number, Visual>();
  private order: Visual[] = [];
  private particles: Particle[] = [];
  private timers: Timer[] = [];
  private clock = 0;
  private game: Game | null = null;
  private ui: UiState = { selected: null, targets: new Set(), hover: null, guide: new Set(), guideZones: new Set(), pointer: [0, 0] };
  private camera: Camera = makeCamera(16 / 9);
  private shakeAmp = 0;
  private coin: { start: number; dur: number; heads: boolean; x: number; y: number } | null = null;
  private lastPolygons = new Map<number, [number, number][]>();
  private screen = { width: 1, height: 1 };
  private prizeVisuals: Visual[][] = [[], []];
  private rngState = 1;
  private moving = true;
  private turnGlow: [number, number] = [0, 0];
  private ambientCount = 0;

  constructor(private readonly options: { reducedMotion: boolean; particles: boolean }) {}

  get cameraNow(): Camera { return this.camera; }
  setOptions(options: Partial<{ reducedMotion: boolean; particles: boolean }>): void { Object.assign(this.options, options); }
  setUi(ui: UiState): void { this.ui = ui; }
  resize(width: number, height: number): void { this.screen = { width, height }; this.aspect.value = width / Math.max(1, height); this.camera = makeCamera(this.aspect.value); }
  private rand(): number { this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) | 0; return ((this.rngState >>> 0) % 100000) / 100000; }

  /** Đặt lại toàn bộ cảnh theo trạng thái (dùng khi bắt đầu ván mới): thẻ xuất hiện ngay tại chồng bài. */
  reset(game: Game): void {
    this.visuals.clear(); this.prizeVisuals = [[], []]; this.timers = []; this.particles = []; this.ambientCount = 0; this.coin = null; this.shakeAmp = 0;
    this.game = null;
    this.sync(game, true);
  }

  /** Trình bày một bước ván đấu: lên lịch hiệu ứng rồi áp trạng thái mới đúng lúc. Trả về thời lượng (giây) cần chờ trước bước kế. */
  present(events: readonly GameEvent[], game: Game): number {
    const slow = this.options.reducedMotion ? 0.5 : 1;
    let cursor = 0, impactAt = -1;
    const impacts: GameEvent[] = [];
    for (const event of events) {
      if (event.t === 'coin') {
        const at = cursor, heads = event.heads;
        this.after(at, () => this.startCoin(heads));
        cursor += 1.05 * slow;
      } else if (event.t === 'attack') {
        const at = cursor, hit = 0.42 * slow;
        this.after(at, () => this.startAttack(event));
        impactAt = at + hit; cursor = impactAt;
      } else if (event.t === 'damage' || event.t === 'ko' || event.t === 'heal' || event.t === 'prize') {
        impacts.push(event);
      } else if (event.t === 'turn' || event.t === 'say' || event.t === 'over') {
        // chỉ ghi log ở lớp trên
      }
    }
    const applyAt = Math.max(cursor, 0);
    this.after(applyAt, () => { this.playImpacts(impacts); this.sync(game, false); });
    // Một số sự kiện cần thời gian nhìn thấy kết quả.
    const hasAttack = impactAt >= 0;
    const hasKo = impacts.some(e => e.t === 'ko');
    const settle = hasAttack ? (hasKo ? 1.25 : 0.85) : events.some(e => e.t === 'retreat' || e.t === 'promote') ? 0.65 : events.some(e => e.t === 'draw') ? 0.55 : 0.45;
    return applyAt + settle * slow;
  }

  /** Cảnh có đang chuyển động (cần vẽ mượt) hay đã yên (có thể hạ tốc độ vẽ). */
  get animating(): boolean { return this.moving; }

  /** Trạng thái đang hiển thị. */
  get shown(): Game | null { return this.game; }

  private after(delay: number, run: () => void): void {
    if (delay <= 0) run(); else this.timers.push({ at: this.clock + delay, run });
  }

  // ---------- Đồng bộ mục tiêu theo trạng thái ----------
  private visualFor(card: Card, side: Side, instant: boolean): Visual {
    let v = this.visuals.get(card.uid);
    if (!v) {
      v = {
        uid: card.uid, layer: layerOf(card), energy: card.kind === 'energy' ? card.type : null, side, zone: 'deck', index: 0,
        pose: emptyPose(), target: emptyPose(), face: false, foil: 0, flash: 0, pickable: false, inPlay: null, hp: 1, hpTarget: 1, orb: false,
        attachTo: 0, attachSlot: 0, attachCount: 0, lunge: null, shake: 0, glow: [0, 0, 0, 0],
      };
      this.visuals.set(card.uid, v);
      const pile = this.deckPose(side, 0);
      v.pose = { ...pile, alpha: instant ? 1 : 0 };
    }
    v.side = side;
    return v;
  }

  private deckPose(side: Side, index: number): Pose {
    const s = side === 0 ? 1 : -1;
    return { x: BOARD.deck.x * s, y: -BOARD.deck.y * s, z: 0.03 + index * 0.022, rz: 0, rx: 0, ry: Math.PI, w: BOARD.deck.w, alpha: 1 };
  }

  private sync(game: Game, instant: boolean): void {
    this.game = game;
    const seen = new Set<number>();
    for (const s of [0, 1] as Side[]) {
      const p = game.sides[s], sign = s === 0 ? -1 : 1;
      const hideOpponentSetup = s === 1 && game.phase === 'setup';
      const assign = (card: Card, zone: Zone, index: number, pose: Pose, face: boolean, inPlay: InPlay | null) => {
        const v = this.visualFor(card, s, instant);
        seen.add(card.uid);
        v.zone = zone; v.index = index; v.face = face; v.inPlay = inPlay; v.orb = false; v.attachTo = 0;
        v.target = pose; v.pickable = face && (zone === 'hand' || zone === 'active' || zone === 'bench' || zone === 'discard');
        v.foil = card.kind === 'pokemon' ? (zone === 'active' ? 0.7 : zone === 'bench' ? 0.4 : 0.3) : 0;
        if (instant) v.pose = { ...pose, alpha: 1 };
        return v;
      };
      p.deck.forEach((card, i) => assign(card, 'deck', i, this.deckPose(s, i), false, null));
      p.discard.forEach((card, i) => {
        const top = p.discard.length - 1 - i; // 0 = trên cùng
        const pose: Pose = { x: BOARD.deck.x * -sign, y: sign * BOARD.discard.y, z: 0.04 + i * 0.02, rz: ((i * 37) % 11 - 5) * 0.012, rx: 0, ry: 0, w: BOARD.discard.w, alpha: top < 3 ? 1 : 0 };
        const v = assign(card, 'discard', i, pose, true, null);
        v.pickable = top === 0;
        v.foil = 0;
      });
      p.hand.forEach((card, i) => {
        const n = p.hand.length, off = i - (n - 1) / 2, spacing = Math.min(s === 0 ? 1.85 : 1.0, (s === 0 ? 10.2 : 6) / Math.max(1, n));
        const pose: Pose = s === 0
          ? { x: off * spacing, y: -BOARD.hand.y + off * off * 0.045, z: 0.5 + i * 0.03, rz: -off * 0.035, rx: 0.62, ry: 0, w: BOARD.hand.w, alpha: 1 }
          : { x: -off * spacing, y: BOARD.hand.y + 0.2 - off * off * 0.02, z: 0.4 + i * 0.03, rz: off * 0.03, rx: -0.2, ry: Math.PI, w: 1.25, alpha: 1 };
        assign(card, 'hand', i, pose, s === 0, null);
      });
      const place = (pk: InPlay, zone: 'active' | 'bench', index: number) => {
        const isActive = zone === 'active';
        const pose: Pose = {
          x: isActive ? BOARD.active.x : (index - (RULES.bench - 1) / 2) * BOARD.bench.dx,
          y: sign * (isActive ? BOARD.active.y : BOARD.bench.y), z: isActive ? 0.08 : 0.06, rz: 0, rx: 0,
          ry: hideOpponentSetup ? Math.PI : 0, w: isActive ? BOARD.active.w : BOARD.bench.w, alpha: 1,
        };
        const v = assign({ uid: pk.uid, kind: 'pokemon', def: pk.def }, zone, index, pose, !hideOpponentSetup, pk);
        v.pickable = !hideOpponentSetup;
        pk.energy.forEach((e, k) => {
          const ev = this.visualFor({ uid: e.uid, kind: 'energy', type: e.type }, s, instant);
          seen.add(e.uid);
          ev.zone = zone; ev.index = index; ev.inPlay = null; ev.orb = true; ev.attachTo = pk.uid; ev.attachSlot = k; ev.attachCount = pk.energy.length;
          ev.pickable = false; ev.face = true; ev.foil = 0;
        });
        const hpFrac = Math.max(0, (pk.def.hp - pk.damage) / pk.def.hp);
        v.hpTarget = hpFrac;
        if (instant) v.hp = hpFrac;
      };
      if (p.active) place(p.active, 'active', 0);
      p.bench.forEach((pk, i) => place(pk, 'bench', i));
      // Giải thưởng còn lại (úp).
      const remaining = RULES.prizes - p.prizesTaken, list = this.prizeVisuals[s];
      for (let i = 0; i < RULES.prizes; i++) {
        let v = list[i];
        if (!v) {
          v = { uid: -(s * 10 + i + 1), layer: 0, energy: null, side: s, zone: 'prize', index: i, pose: emptyPose(), target: emptyPose(), face: false, foil: 0, flash: 0, pickable: false, inPlay: null, hp: 1, hpTarget: 1, orb: false, attachTo: 0, attachSlot: 0, attachCount: 0, lunge: null, shake: 0, glow: [0, 0, 0, 0] };
          list[i] = v; this.visuals.set(v.uid, v);
          v.pose = { ...this.prizePose(s, i), alpha: instant ? 1 : 0 };
        }
        seen.add(v.uid);
        const alive = i < remaining, base = this.prizePose(s, i);
        v.target = alive ? base : { ...base, y: base.y - sign * 1.5, z: 2.4, w: base.w * 1.3, alpha: 0 };
        if (instant) v.pose = { ...v.target };
      }
    }
    // Thẻ không còn xuất hiện (không nên xảy ra) → ẩn.
    for (const [uid, v] of this.visuals) if (!seen.has(uid)) { v.target = { ...v.target, alpha: 0 }; v.pickable = false; }
  }

  private prizePose(side: Side, index: number): Pose {
    const sign = side === 0 ? -1 : 1, x = side === 0 ? BOARD.prize.x : -BOARD.prize.x;
    return { x, y: sign * (BOARD.prize.y + index * BOARD.prize.dy), z: 0.04, rz: ((index * 29) % 7 - 3) * 0.02, rx: 0, ry: Math.PI, w: BOARD.prize.w, alpha: 1 };
  }

  // ---------- Hiệu ứng ----------
  private worldOf(uid: number): Vec3 | null {
    const v = this.visuals.get(uid);
    return v ? [v.pose.x, v.pose.y, v.pose.z] : null;
  }

  private startCoin(heads: boolean): void {
    this.coin = { start: this.clock, dur: 0.95 * (this.options.reducedMotion ? 0.5 : 1), heads, x: 0, y: 0 };
    const label = heads ? 'Ngửa!' : 'Sấp!';
    this.after(this.coin.dur, () => this.popup?.({ text: label, kind: 'coin', world: [0, 0, 1.2] }));
  }

  private startAttack(event: Extract<GameEvent, { t: 'attack' }>): void {
    const from = this.worldOf(event.attacker), to = this.worldOf(event.defender), v = this.visuals.get(event.attacker);
    if (!from || !to || !v) return;
    const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
    v.lunge = { dx: (dx / len) * Math.min(1.7, len * 0.4), dy: (dy / len) * Math.min(1.7, len * 0.4), start: this.clock, dur: 0.6 };
    const [r, g, b] = typeColor(event.type);
    if (this.options.particles && !this.options.reducedMotion) {
      const steps = 22;
      for (let i = 0; i < steps; i++) {
        const delay = 0.04 + (i / steps) * 0.3;
        this.after(delay, () => {
          const k = (i + 1) / steps;
          this.spawn(lerp(from[0], to[0], k), lerp(from[1], to[1], k), 0.9 + Math.sin(k * Math.PI) * 1.2, (this.rand() - 0.5) * 1.2, (this.rand() - 0.5) * 1.2, 0.6 + this.rand(), 0.45, 0.28 + this.rand() * 0.3, r, g, b, 1.1);
        });
      }
    }
  }

  private playImpacts(events: readonly GameEvent[]): void {
    for (const event of events) {
      if (event.t === 'damage') {
        const v = this.visuals.get(event.uid);
        if (!v) continue;
        v.flash = 1; v.shake = 1;
        this.shakeAmp = Math.max(this.shakeAmp, Math.min(0.35, 0.08 + event.amount / 260));
        this.burst(v.pose.x, v.pose.y, 1.2, event.weak ? [1, 0.85, 0.3] : [1, 0.5, 0.25], event.weak ? 30 : 16);
        this.popup?.({ text: `−${event.amount}`, kind: event.weak ? 'weak' : 'damage', world: [v.pose.x, v.pose.y, 1.4] });
      } else if (event.t === 'heal') {
        const v = this.visuals.get(event.uid);
        if (v) {
          this.burst(v.pose.x, v.pose.y, 1.1, [0.4, 1, 0.5], 12);
          this.popup?.({ text: `+${event.amount}`, kind: 'heal', world: [v.pose.x, v.pose.y, 1.4] });
        }
      } else if (event.t === 'ko') {
        const v = this.visuals.get(event.uid);
        if (v) { this.burst(v.pose.x, v.pose.y, 1.2, [1, 0.9, 0.7], 46); this.shakeAmp = Math.max(this.shakeAmp, 0.4); this.popup?.({ text: 'Hạ gục!', kind: 'ko', world: [v.pose.x, v.pose.y, 1.6] }); }
      } else if (event.t === 'prize') {
        const list = this.prizeVisuals[event.side], alive = list.filter(v => v.target.alpha > 0).length;
        const v = list[Math.max(0, alive - 1)];
        if (v) this.burst(v.pose.x, v.pose.y, 0.6, [1, 0.85, 0.3], 14);
      }
    }
  }

  private burst(x: number, y: number, z: number, color: readonly [number, number, number], count: number): void {
    if (!this.options.particles || this.options.reducedMotion) return;
    for (let i = 0; i < count; i++) {
      const a = this.rand() * Math.PI * 2, sp = 1.2 + this.rand() * 4.2;
      this.spawn(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, 1.5 + this.rand() * 3.5, 0.55 + this.rand() * 0.5, 0.22 + this.rand() * 0.34, color[0], color[1], color[2], 1.4);
    }
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, r: number, g: number, b: number, glow: number): void {
    if (this.particles.length >= MAX_PARTICLES) { const old = this.particles.find(p => !p.ambient); if (old) this.particles.splice(this.particles.indexOf(old), 1); else return; }
    this.particles.push({ x, y, z, vx, vy, vz, life, max: life, size, r, g, b, glow });
  }

  // ---------- Cập nhật mỗi khung hình ----------
  update(dt: number): void {
    dt = Math.min(dt, 0.05);
    this.clock += dt;
    if (this.timers.length) {
      const due = this.timers.filter(timer => timer.at <= this.clock).sort((a, b) => a.at - b.at);
      if (due.length) { this.timers = this.timers.filter(timer => timer.at > this.clock); due.forEach(timer => timer.run()); }
    }
    const rate = this.options.reducedMotion ? 22 : 9, k = ease(rate, dt), ui = this.ui;
    let moving = this.timers.length > 0 || this.particles.length > this.ambientCount || this.coin !== null || this.shakeAmp > 0.002;
    this.order.length = 0;
    for (const v of this.visuals.values()) {
      const tgt = { ...v.target };
      if (v.orb) {
        const parent = this.visuals.get(v.attachTo);
        if (parent) {
          const n = v.attachCount, spacing = Math.min(0.44, (parent.pose.w * 0.9) / Math.max(1, n));
          tgt.x = parent.pose.x + (v.attachSlot - (n - 1) / 2) * spacing;
          tgt.y = parent.pose.y - (parent.pose.w * CARD_ASPECT) / 2 - 0.26;
          tgt.z = parent.pose.z + 0.05; tgt.w = 0.5; tgt.rz = 0; tgt.rx = 0; tgt.ry = 0; tgt.alpha = parent.pose.alpha;
        }
      }
      const hover = v.uid === ui.hover && v.pickable;
      if (hover) {
        tgt.z += 0.5; tgt.w *= v.zone === 'hand' ? 1.12 : 1.06;
        if (v.zone === 'hand') { tgt.y += 0.7; tgt.rx = 0.28; tgt.rz = 0; }
        tgt.rx += -ui.pointer[1] * 0.2; tgt.rz += 0; tgt.ry += ui.pointer[0] * 0.22 * (v.face ? 1 : 0);
      }
      if (v.uid === ui.selected) { tgt.y += (v.side === 0 ? 1 : -1) * 0.9; tgt.z += 0.6; tgt.rx = 0.3; }
      const dist = Math.hypot(tgt.x - v.pose.x, tgt.y - v.pose.y);
      if (dist > 0.004 || Math.abs(tgt.alpha - v.pose.alpha) > 0.004 || Math.abs(tgt.z - v.pose.z) > 0.004 || v.lunge || v.flash > 0 || v.shake > 0) moving = true;
      for (const key of POSE_KEYS) v.pose[key] = lerp(v.pose[key], tgt[key], key === 'alpha' ? Math.min(1, k * 1.4) : k);
      v.pose.z += Math.min(2.6, dist * 0.22) * k * 2; // vòng cung khi bay
      v.pose.z = lerp(v.pose.z, tgt.z, k * 0.9);
      v.flash = Math.max(0, v.flash - dt * 2.8);
      v.shake = Math.max(0, v.shake - dt * 2.2);
      v.hp = lerp(v.hp, v.hpTarget, ease(5, dt));
      // glow: hợp lệ / chọn / hover / trạng thái
      let glow: [number, number, number, number] = [0, 0, 0, 0];
      if (v.inPlay?.shielded) glow = [0.3, 0.8, 1, 0.8];
      else if (v.inPlay?.paralyzed) glow = [1, 0.9, 0.2, 0.7];
      if (ui.guide.has(v.uid)) glow = [1, 0.8, 0.22, 0.65 + 0.35 * Math.sin(this.clock * 5)];
      if (ui.targets.has(v.uid)) glow = [0.55, 1, 0.3, 1];
      if (v.uid === ui.selected) glow = [1, 0.95, 0.6, 1];
      else if (hover) glow = [1, 1, 1, 0.6];
      v.glow[0] = lerp(v.glow[0], glow[0], k); v.glow[1] = lerp(v.glow[1], glow[1], k); v.glow[2] = lerp(v.glow[2], glow[2], k); v.glow[3] = lerp(v.glow[3], glow[3], k);
      this.order.push(v);
    }
    this.moving = moving;
    this.order.sort((a, b) => (a.pose.z - b.pose.z) || (b.pose.y - a.pose.y));
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { if (p.ambient) this.ambientCount--; this.particles.splice(i, 1); continue; }
      if (p.ambient) { p.x += (p.vx + Math.sin(this.clock * 0.7 + p.z * 9) * 0.05) * dt; p.y += p.vy * dt; p.z += p.vz * dt; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 5 * dt; p.vx *= 1 - dt * 1.4; p.vy *= 1 - dt * 1.4;
      if (p.z < 0.05) { p.z = 0.05; p.vz *= -0.3; }
    }
    // Đốm sáng trôi chậm quanh bàn (chỉ khi bật hạt và không giảm chuyển động).
    if (this.options.particles && !this.options.reducedMotion) {
      while (this.ambientCount < 26 && this.rand() < 0.5) {
        const life = 5 + this.rand() * 5;
        this.particles.push({ ambient: true, x: (this.rand() - 0.5) * 17, y: (this.rand() - 0.5) * 20, z: 0.4 + this.rand() * 2.2, vx: (this.rand() - 0.5) * 0.18, vy: (this.rand() - 0.5) * 0.18, vz: 0.1 + this.rand() * 0.14, life, max: life, size: 0.07 + this.rand() * 0.1, r: 0.7, g: 1, b: 0.55, glow: 0.45 });
        this.ambientCount++;
      }
    }
    // Quầng sáng lượt chơi chuyển mượt giữa hai nửa sân.
    const g = this.game;
    const active: Side | null = !g || g.phase === 'over' ? null : g.phase === 'setup' ? 0 : g.phase === 'promote' ? (g.pending[0] ?? null) : g.turn;
    for (const s of [0, 1] as const) this.turnGlow[s] = lerp(this.turnGlow[s], active === s ? 1 : 0, ease(3, dt));
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 1.1);
    if (this.coin && this.clock - this.coin.start > this.coin.dur + 0.55) this.coin = null;
    // camera + polygon pick cache
    if (this.shakeAmp > 0.002 && !this.options.reducedMotion) {
      const a = this.shakeAmp, t = this.clock * 55;
      this.camera = makeCamera(this.aspect.value, [Math.sin(t) * a * 0.5, Math.cos(t * 1.3) * a * 0.4, Math.sin(t * 0.7) * a * 0.15]);
    } else this.camera = makeCamera(this.aspect.value);
  }

  /** Tóm tắt Pokémon/thẻ dưới con trỏ (từ cuối danh sách vẽ = nằm trên cùng). */
  pickAt(px: number, py: number): Pick | null {
    const { width, height } = this.screen, vp = this.camera.viewProj;
    for (let i = this.order.length - 1; i >= 0; i--) {
      const v = this.order[i];
      if (!v.pickable || v.pose.alpha < 0.6) continue;
      const h = v.pose.w * CARD_ASPECT;
      const polygon: [number, number][] = [];
      let behind = false;
      for (const c of quadCorners([v.pose.x, v.pose.y, v.pose.z], v.pose.w, h, v.pose.rz, v.pose.rx, v.pose.ry)) {
        const s = project(vp, c, width, height);
        if (!s) { behind = true; break; }
        polygon.push(s);
      }
      if (!behind && pointInPolygon([px, py], polygon)) return { uid: v.uid, side: v.side, zone: v.zone, index: v.index };
    }
    return null;
  }

  /** Điểm neo nhãn tên khu vực (toạ độ thế giới) cho lớp DOM phủ lên cảnh. */
  zoneLabels(): { text: string; world: Vec3; align: 'left' | 'right' | 'center'; side: Side }[] {
    const out: { text: string; world: Vec3; align: 'left' | 'right' | 'center'; side: Side }[] = [];
    for (const s of [0, 1] as Side[]) {
      const sign = s === 0 ? -1 : 1, dir = s === 0 ? -1 : 1, align = s === 0 ? 'right' as const : 'left' as const;
      out.push({ text: 'CHIẾN ĐẤU', world: [dir * (BOARD.active.w / 2 + 0.3), sign * BOARD.active.y, 0.02], align, side: s });
      out.push({ text: 'BĂNG GHẾ', world: [dir * (BOARD.bench.dx + BOARD.bench.w / 2 + 0.3), sign * BOARD.bench.y, 0.02], align, side: s });
      out.push({ text: 'BÀI', world: [BOARD.deck.x * -sign, sign * (BOARD.deck.y + 1.3), 0.02], align: 'center', side: s });
      out.push({ text: 'BỎ', world: [BOARD.deck.x * -sign, sign * (BOARD.discard.y + 1.3), 0.02], align: 'center', side: s });
      out.push({ text: 'GIẢI', world: [(s === 0 ? BOARD.prize.x : -BOARD.prize.x), sign * (BOARD.prize.y + 2 * BOARD.prize.dy + 1.1), 0.02], align: 'center', side: s });
    }
    return out;
  }

  /** Vị trí màn hình (px CSS) của một điểm thế giới — dùng đặt số sát thương/nhãn DOM. */
  toScreen(world: Vec3): [number, number] | null { return project(this.camera.viewProj, world, this.screen.width, this.screen.height); }

  // ---------- Ghi instance ----------
  fill(out: Float32Array): number {
    let n = 0;
    const t = this.clock;
    const put = (kind: number, x: number, y: number, z: number, rz: number, rx: number, ry: number, w: number, h: number, layer: number, alpha: number, glow: number, foil: number, flash: number, fill: number, r: number, g: number, b: number, a: number) => {
      if (n >= out.length / INSTANCE_FLOATS) return;
      const o = n++ * INSTANCE_FLOATS;
      out[o] = x; out[o + 1] = y; out[o + 2] = z; out[o + 3] = kind;
      out[o + 4] = rz; out[o + 5] = rx; out[o + 6] = ry; out[o + 7] = 0;
      out[o + 8] = w; out[o + 9] = h; out[o + 10] = layer; out[o + 11] = alpha;
      out[o + 12] = glow; out[o + 13] = foil; out[o + 14] = flash; out[o + 15] = fill;
      out[o + 16] = r; out[o + 17] = g; out[o + 18] = b; out[o + 19] = a;
    };
    put(KIND.table, 0, 0, 0, 0, 0, 0, 90, 90, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1);
    // Ô đặt thẻ (viền nét đứt): sáng lên khi là đích hợp lệ.
    const slot = (x: number, y: number, w: number, lit: number, color: readonly [number, number, number]) =>
      put(KIND.slot, x, y, 0.012, 0, 0, 0, w + 0.18, w * CARD_ASPECT + 0.18, 0, 1, lit, 0, 0, 0, color[0], color[1], color[2], 1);
    const zones = this.ui.guideZones;
    for (const s of [0, 1] as Side[]) {
      const sign = s === 0 ? -1 : 1, col: readonly [number, number, number] = s === 0 ? [0.6, 0.95, 0.3] : [0.55, 0.7, 0.85];
      const lit = (zone: string) => (zones.has(`${s}:${zone}`) ? 1 : 0);
      // Quầng sáng nửa sân của bên đang tới lượt.
      if (this.turnGlow[s] > 0.01) put(KIND.glow, 0, sign * 4.6, 0.014, 0, 0, 0, 15.5, 9.4, 0, 1, this.turnGlow[s] * 0.2, 0, 0, 3.6, col[0], col[1], col[2], 1);
      slot(0, sign * BOARD.active.y, BOARD.active.w, lit('active'), col);
      for (let i = 0; i < RULES.bench; i++) slot((i - (RULES.bench - 1) / 2) * BOARD.bench.dx, sign * BOARD.bench.y, BOARD.bench.w, lit('bench'), col);
      slot(BOARD.deck.x * -sign, sign * BOARD.deck.y, BOARD.deck.w, lit('deck'), col);
      slot(BOARD.deck.x * -sign, sign * BOARD.discard.y, BOARD.discard.w, lit('discard'), col);
      for (let i = 0; i < RULES.prizes; i++) { const pz = this.prizePose(s, i); slot(pz.x, pz.y, BOARD.prize.w, lit('prize'), col); }
    }
    // Bóng đổ.
    for (const v of this.order) {
      if (v.orb || v.pose.alpha < 0.02) continue;
      const w = v.pose.w, h = w * CARD_ASPECT, lift = Math.max(0, v.pose.z - 0.05), spread = 0.16 + lift * 0.06;
      put(KIND.shadow, v.pose.x + 0.08 + lift * 0.1, v.pose.y - 0.1 - lift * 0.22, 0.016, 0, 0, 0, w + spread * 2, h + spread * 2, 0, v.pose.alpha, 0, 0, 0, spread, 0, 0, 0, Math.max(0.15, 0.55 - lift * 0.07));
    }
    // Thẻ theo thứ tự xa → gần (kèm quầng sáng phía sau).
    for (const v of this.order) {
      const p = v.pose;
      if (p.alpha < 0.02 || v.orb) continue;
      const lunge = v.lunge ? this.lungeOffset(v) : null;
      const shakeX = v.shake > 0 ? Math.sin(t * 90) * v.shake * 0.12 : 0;
      const x = p.x + (lunge ? lunge[0] : 0) + shakeX, y = p.y + (lunge ? lunge[1] : 0), z = p.z + (lunge ? lunge[2] : 0);
      const h = p.w * CARD_ASPECT, g = v.glow;
      if (g[3] > 0.02) put(KIND.glow, x, y, z - 0.01, p.rz, p.rx, p.ry, p.w + 0.9, h + 0.9, 0, p.alpha, g[3], 0, 0, 0.45, g[0], g[1], g[2], 1);
      const isEnergy = v.energy !== null;
      put(isEnergy ? KIND.energyCard : KIND.card, x, y, z, p.rz, p.rx, p.ry, p.w, h, v.layer, p.alpha, 0, v.foil, v.flash, 0, ...(isEnergy ? [...typeColor(v.energy!), 1] as [number, number, number, number] : [1, 1, 1, 1] as [number, number, number, number]));
    }
    // Thanh HP phía trên thẻ Pokémon đang chơi, Năng lượng dạng quả cầu phía dưới.
    for (const v of this.order) {
      const p = v.pose;
      if (p.alpha < 0.02) continue;
      if (v.orb && v.energy) {
        const c = typeColor(v.energy);
        put(KIND.orb, p.x, p.y, p.z, 0, 0, 0, p.w, p.w, 0, p.alpha, 0.35, 0, 0, 0, c[0], c[1], c[2], 1);
        continue;
      }
      if (v.inPlay && (v.zone === 'active' || v.zone === 'bench') && v.face) {
        const lunge = v.lunge ? this.lungeOffset(v) : null;
        put(KIND.bar, p.x + (lunge ? lunge[0] : 0), p.y + (lunge ? lunge[1] : 0) + (p.w * CARD_ASPECT) / 2 + 0.2, p.z + 0.04, 0, 0, 0, p.w * 0.92, 0.15, 0, p.alpha, 0, 0, 0, v.hp, 1, 1, 1, 1);
      }
    }
    // Đồng xu.
    if (this.coin) {
      const c = this.coin, p = Math.min(1, (t - c.start) / c.dur), spin = p * Math.PI * 7 + (c.heads ? 0 : Math.PI);
      const fade = t - c.start > c.dur ? Math.max(0, 1 - (t - c.start - c.dur) / 0.5) : 1;
      const arc = Math.sin(p * Math.PI);
      const gold: [number, number, number] = c.heads ? [1, 0.78, 0.22] : [0.72, 0.8, 0.95];
      put(KIND.coin, c.x, c.y, 0.9 + arc * 3.2, 0, spin, 0, 0.95, 0.95, 0, fade, 0.5, 0, 0, 0, gold[0], gold[1], gold[2], 1);
      put(KIND.shadow, c.x, c.y, 0.02, 0, 0, 0, 1.1 + arc * 0.5, 1.1 + arc * 0.5, 0, fade, 0, 0, 0, 0.3, 0, 0, 0, 0.4 - arc * 0.2);
    }
    // Hạt sáng (cộng sáng) vẽ sau cùng.
    for (const p of this.particles) {
      const k = p.life / p.max;
      const a = p.ambient ? Math.min(1, Math.min(k, 1 - k) * 4) * 0.7 : k;
      put(KIND.particle, p.x, p.y, p.z, 0, 0, 0, p.size * (p.ambient ? 1 : 0.5 + k), p.size * (p.ambient ? 1 : 0.5 + k), 0, a, p.glow, 0, 0, 0, p.r, p.g, p.b, 1);
    }
    return n;
  }

  private lungeOffset(v: Visual): [number, number, number] | null {
    const l = v.lunge;
    if (!l) return null;
    const p = (this.clock - l.start) / l.dur;
    if (p >= 1) { v.lunge = null; return null; }
    const out = p < 0.35 ? 1 - Math.pow(1 - p / 0.35, 3) : 1 - Math.pow((p - 0.35) / 0.65, 2);
    return [l.dx * out, l.dy * out, 0.8 * Math.sin(Math.min(1, p / 0.35) * Math.PI * 0.5) * (1 - Math.max(0, (p - 0.35) / 0.65))];
  }
}
