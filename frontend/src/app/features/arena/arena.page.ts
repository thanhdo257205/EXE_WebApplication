import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PERF_TIER_EVENT } from '../../shared/utils/perf-tier';
import { ENERGY_RGB, ARENA_POKEMON, type CostType } from './arena-cards';
import { ArenaController, inspect, type Inspect, type Presenter } from './arena-controller';
import type { Action } from './arena-engine';
import { ArenaRenderer, loadPosterBitmaps, WebGpuUnavailableError, type ArenaQuality } from './arena-renderer';
import { ArenaScene, type Pick, type Popup } from './arena-scene';
import type { Vec3 } from './arena-math';
import { Tutorial, type TutorialView } from './arena-tutorial';
import { RotateGateComponent } from './rotate-gate.component';
import { INSTANCE_FLOATS } from './arena-shaders';
import { buildView, type ArenaView } from './arena-view';

type QualityLevel = 'high' | 'medium' | 'low';
const QUALITY: Record<QualityLevel, ArenaQuality & { particles: boolean; dprCap: number; label: string }> = {
  high: { scale: 1, bloom: true, particles: true, dprCap: 2, label: 'Cao' },
  medium: { scale: 0.8, bloom: true, particles: true, dprCap: 1.5, label: 'Vừa' },
  low: { scale: 0.6, bloom: false, particles: false, dprCap: 1.25, label: 'Thấp' },
};
const QUALITY_ORDER: QualityLevel[] = ['high', 'medium', 'low'];
const IDLE_FRAME_SECONDS = 1 / 20;
const ACTIVE_WINDOW_SECONDS = 2.2;
const SLOW_FRAME_MS = 26;

interface PopupView { id: number; text: string; kind: Popup['kind']; x: number; y: number }

const TUTORIAL_KEY = 'arena-tutorial-v1';
interface CoachAnchor { mode: 'above' | 'below' | 'center'; ring: boolean; x: number; y: number; left: number; width: number; vertical: number; tailX: number }
interface LabelView { text: string; x: number; y: number; align: string; side: number }

const textPresenter: Presenter = { reset: () => undefined, present: () => 0.35 };

/** Sân đấu mô phỏng: WebGPU thuần (không thư viện); khi thiếu WebGPU vẫn chơi được bằng bảng chữ + nút. */
@Component({
  selector: 'app-arena-page',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet, RotateGateComponent],
  templateUrl: './arena.page.html',
  styleUrls: ['./arena.page.css', './arena-coach.css'],
})
export class ArenaPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly stageRef = viewChild.required<ElementRef<HTMLElement>>('stage');

  readonly state = signal<'loading' | 'ready' | 'text' | 'lost'>('loading');
  readonly unsupportedReason = signal('');
  readonly view = signal<ArenaView | null>(null);
  readonly log = signal<string[]>([]);
  readonly inspected = signal<Inspect | null>(null);
  readonly selectedUid = signal<number | null>(null);
  readonly retreating = signal(false);
  readonly hint = signal('');
  readonly popups = signal<PopupView[]>([]);
  readonly coach = signal<TutorialView | null>(null);
  readonly labels = signal<LabelView[]>([]);
  /** Vị trí hộp hướng dẫn trên sân (null khi không có bước hoặc chưa đo được sân). */
  readonly coachAnchor = signal<CoachAnchor | null>(null);
  /** Điện thoại đang cầm dọc: chặn chơi cho tới khi xoay ngang. */
  readonly portraitPhone = signal(false);
  readonly quality = signal<QualityLevel>('high');
  readonly qualityLabel = () => QUALITY[this.quality()].label;
  readonly energyColor = (label: string) => this.energyCss[label] ?? '#cfd2c8';

  private readonly energyCss: Record<string, string> = Object.fromEntries(
    (Object.entries(ENERGY_RGB) as [CostType, [number, number, number]][]).map(([type, rgb]) => [
      ({ Fire: 'Lửa', Water: 'Nước', Grass: 'Cỏ', Lightning: 'Điện', Psychic: 'Tâm linh', Colorless: 'Vô sắc' } as const)[type], `rgb(${rgb.map(c => Math.round(c * 255)).join(' ')})`,
    ]),
  );
  private scene = new ArenaScene({ reducedMotion: false, particles: true });
  private ctl!: ArenaController;
  private renderer: ArenaRenderer | null = null;
  private instances = new Float32Array(INSTANCE_FLOATS * 2048);
  private raf = 0;
  private running = false;
  private visible = true;
  private lastTs = 0;
  private lastDraw = 0;
  private activeUntil = 0;
  private hoverUid: number | null = null;
  private pinnedUid: number | null = null;
  private pointer: readonly [number, number] = [0, 0];
  private frameTimes: number[] = [];
  private slowStrikes = 0;
  private autoQuality = true;
  private popupId = 0;
  private hintTimer: ReturnType<typeof setTimeout> | undefined;
  private reduced = false;
  private cleanups: (() => void)[] = [];
  private destroyed = false;
  private readonly tutorial = new Tutorial();
  /** Số lượt lúc người chơi bấm tấn công (null nếu chưa tấn công trong ván hướng dẫn). */
  private attackTurn: number | null = null;
  private stageSize = { w: 0, h: 0 };
  private frameCount = 0;
  private guideUids: ReadonlySet<number> = new Set();
  private guideZones: ReadonlySet<string> = new Set();

  constructor() {
    afterNextRender(() => void this.boot());
    this.destroyRef.onDestroy(() => this.teardown());
  }

  // ---------- Khởi tạo ----------
  private async boot(): Promise<void> {
    const canvas = this.canvasRef().nativeElement, stage = this.stageRef().nativeElement;
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reduced = media?.matches ?? false;
    const lowTier = document.documentElement.dataset['perf'] === 'low';
    if (lowTier) { this.quality.set('low'); this.autoQuality = false; }
    this.scene.setOptions({ reducedMotion: this.reduced, particles: QUALITY[this.quality()].particles });
    this.scene.popup = popup => this.showPopup(popup);
    this.watchOrientation();
    this.ctl = new ArenaController(this.scene, () => this.refresh());

    let renderer: ArenaRenderer | null = null;
    try {
      if (!media || !('gpu' in navigator) || !navigator.gpu) throw new WebGpuUnavailableError('no-webgpu');
      renderer = await ArenaRenderer.create(canvas, await loadPosterBitmaps(ARENA_POKEMON.map(p => p.poster)));
    } catch (error) {
      this.unsupportedReason.set(error instanceof WebGpuUnavailableError ? 'Trình duyệt hoặc thiết bị này chưa bật WebGPU.' : 'Không khởi tạo được WebGPU trên thiết bị này.');
    }
    if (this.destroyed) { renderer?.dispose(); return; }
    if (!renderer) {
      this.ctl = new ArenaController(textPresenter, () => this.refresh());
      this.state.set('text');
      this.beginGame(!this.tutorialSeen());
      this.startTextLoop();
      return;
    }
    this.renderer = renderer;
    renderer.setQuality(QUALITY[this.quality()]);
    void renderer.lost.then(() => { if (this.renderer === renderer) { this.stopLoop(); this.state.set('lost'); } });
    this.state.set('ready');
    this.observe(stage, canvas, media!);
    this.beginGame(!this.tutorialSeen());
    this.startLoop();
  }

  private observe(stage: HTMLElement, canvas: HTMLCanvasElement, media: MediaQueryList): void {
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height || !this.renderer) return;
      const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality()].dprCap);
      this.renderer.resize(rect.width * dpr, rect.height * dpr);
      this.scene.resize(rect.width, rect.height);
      this.stageSize = { w: rect.width, h: rect.height };
      this.updateLabels();
      this.updateCoachAnchor();
      this.wake();
    };
    let pending = 0;
    const resizeObserver = new ResizeObserver(() => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; resize(); }); });
    resizeObserver.observe(stage);
    resize();
    this.applyResize = resize;
    const intersection = new IntersectionObserver(entries => { this.visible = entries[0]?.isIntersecting ?? true; this.syncLoop(); });
    intersection.observe(canvas);
    const onVisibility = () => this.syncLoop();
    const onMedia = () => { this.reduced = media.matches; this.scene.setOptions({ reducedMotion: this.reduced }); };
    const onTier = () => this.setQuality('low', false);
    document.addEventListener('visibilitychange', onVisibility);
    media.addEventListener('change', onMedia);
    window.addEventListener(PERF_TIER_EVENT, onTier);
    this.cleanups.push(() => {
      resizeObserver.disconnect(); intersection.disconnect(); if (pending) cancelAnimationFrame(pending);
      document.removeEventListener('visibilitychange', onVisibility); media.removeEventListener('change', onMedia); window.removeEventListener(PERF_TIER_EVENT, onTier);
    });
  }
  private applyResize: () => void = () => undefined;

  // ---------- Vòng lặp vẽ ----------
  private startLoop(): void { this.running = true; this.lastTs = 0; this.schedule(); }
  private stopLoop(): void { this.running = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  private schedule(): void { if (!this.raf && this.running && this.visible && !document.hidden && !this.portraitPhone()) this.raf = requestAnimationFrame(this.frame); }
  private syncLoop(): void { if (this.running && this.visible && !document.hidden && !this.portraitPhone()) { this.lastTs = 0; this.schedule(); } else if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } }
  private wake(): void { this.activeUntil = performance.now() / 1000 + ACTIVE_WINDOW_SECONDS; this.schedule(); }

  private readonly frame = (ts: number): void => {
    this.raf = 0;
    if (!this.running || !this.renderer) return;
    const now = ts / 1000;
    const active = this.activeUntil > now || this.ctl.busy || this.scene.animating;
    if (!active && now - this.lastDraw < IDLE_FRAME_SECONDS) { this.schedule(); return; }
    const dt = this.lastTs ? Math.min(0.1, now - this.lastTs) : 1 / 60;
    this.lastTs = now; this.lastDraw = now;
    this.ctl.tick(now);
    this.scene.setUi({ selected: this.selectedUid(), targets: this.targetSet(), hover: this.hoverUid, guide: this.guideUids, guideZones: this.guideZones, pointer: this.pointer });
    this.scene.update(dt);
    if (this.coach() && ++this.frameCount % 8 === 0) this.updateCoachAnchor();
    const count = this.scene.fill(this.instances);
    const cam = this.scene.cameraNow;
    this.renderer.render({ viewProj: cam.viewProj, eye: cam.eye, light: [0.3, -0.5, 1], time: now, aspect: this.scene.aspect.value, instances: this.instances, count });
    if (active) this.trackPerformance(dt * 1000);
    this.schedule();
  };

  private startTextLoop(): void {
    const tick = () => { this.ctl.tick(performance.now() / 1000); if (this.state() === 'text') this.raf = requestAnimationFrame(tick); };
    this.running = true; this.raf = requestAnimationFrame(tick);
  }

  /** Tự hạ đồ họa khi nhiều khung chậm liên tiếp (chỉ đo lúc đang hoạt động, bỏ khung >250ms do tab ẩn). */
  private trackPerformance(ms: number): void {
    if (!this.autoQuality || ms > 250) return;
    this.frameTimes.push(ms);
    if (this.frameTimes.length < 90) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b), median = sorted[sorted.length >> 1];
    this.frameTimes = [];
    this.slowStrikes = median > SLOW_FRAME_MS ? this.slowStrikes + 1 : 0;
    if (this.slowStrikes >= 2) {
      this.slowStrikes = 0;
      const next = QUALITY_ORDER[QUALITY_ORDER.indexOf(this.quality()) + 1];
      if (next) this.setQuality(next, false);
    }
  }

  setQuality(level: QualityLevel, manual: boolean): void {
    if (manual) this.autoQuality = false;
    this.quality.set(level);
    const q = QUALITY[level];
    this.scene.setOptions({ particles: q.particles });
    this.renderer?.setQuality(q);
    this.applyResize();
  }
  cycleQuality(): void { this.setQuality(QUALITY_ORDER[(QUALITY_ORDER.indexOf(this.quality()) + 1) % QUALITY_ORDER.length], true); }

  // ---------- Giao diện ----------
  private refresh(): void {
    if (!this.ctl?.displayed) return;
    const game = this.ctl.displayed;
    this.view.set(buildView(game, this.ctl.canAct()));
    this.log.set([...this.ctl.log].reverse());
    const hand = game.sides[0].hand;
    const selected = this.selectedUid();
    if (selected !== null && !hand.some(card => card.uid === selected)) this.selectedUid.set(null);
    if (!this.ctl.canAct()) this.retreating.set(false);
    this.refreshCoach();
    this.refreshInspect();
    this.wake();
  }

  private refreshInspect(): void {
    const uid = this.hoverUid ?? this.pinnedUid ?? this.selectedUid();
    this.inspected.set(uid === null || !this.ctl?.displayed ? null : inspect(this.ctl.displayed, uid));
  }

  /** Chế độ chọn đích hiện tại (để hiện đúng danh sách nút trợ năng). */
  mode(): 'attach' | 'retreat' | 'promote' | null {
    const view = this.view(), selected = this.selectedUid();
    if (!view?.canAct) return null;
    const game = this.ctl.displayed;
    if (game.phase === 'promote') return 'promote';
    if (selected !== null && game.sides[0].hand.some(card => card.uid === selected && card.kind === 'energy')) return 'attach';
    return this.retreating() ? 'retreat' : null;
  }
  selectedIsPokemon(): boolean {
    const selected = this.selectedUid();
    return selected !== null && !!this.ctl?.displayed.sides[0].hand.some(card => card.uid === selected && card.kind === 'pokemon');
  }
  clickTarget(item: { uid: number; zone: 'active' | 'bench'; index: number }): void { this.clickMine(item.zone, item.index, item.uid); }

  private targetSet(): ReadonlySet<number> {
    const view = this.view(), mode = this.mode();
    if (!view || !mode) return EMPTY;
    if (mode === 'attach') return new Set([...(view.active ? [view.active.uid] : []), ...view.bench.map(t => t.uid)]);
    return new Set(view.bench.map(t => t.uid));
  }

  private showPopup(popup: Popup): void {
    const at = this.scene.toScreen(popup.world);
    if (!at) return;
    const id = ++this.popupId;
    this.popups.update(list => [...list.slice(-6), { id, text: popup.text, kind: popup.kind, x: at[0], y: at[1] }]);
    setTimeout(() => this.popups.update(list => list.filter(p => p.id !== id)), 1500);
  }

  private flash(text: string): void {
    this.hint.set(text); clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hint.set(''), 3600);
  }

  private act(action: Action): boolean {
    const error = this.ctl.act(action);
    if (error) { this.flash(error); return false; }
    this.selectedUid.set(null); this.retreating.set(false); this.pinnedUid = null; this.hint.set('');
    this.refresh();
    return true;
  }

  // ---------- Thao tác (chuột/cảm ứng và nút DOM dùng chung) ----------
  clickHand(index: number): void {
    const game = this.ctl.displayed, card = game.sides[0].hand[index];
    if (!card) return;
    if (!this.ctl.canAct()) { this.pinnedUid = card.uid; this.refreshInspect(); return; }
    if (game.phase === 'promote') { this.flash('Hãy chọn Pokémon Chiến đấu mới trên băng ghế.'); return; }
    if (this.selectedUid() === card.uid) {
      if (card.kind === 'pokemon') this.act({ t: 'place', hand: index }); else { this.selectedUid.set(null); this.refresh(); }
      return;
    }
    this.retreating.set(false); this.pinnedUid = null;
    if (card.kind === 'energy') {
      if (game.phase === 'setup') { this.flash('Chưa gắn Năng lượng được ở bước chuẩn bị — hãy đặt Pokémon trước.'); return; }
      if (game.attached) { this.flash('Mỗi lượt chỉ gắn được 1 Năng lượng.'); return; }
      this.flash('Chọn Pokémon của bạn để gắn Năng lượng.');
    } else this.flash('Nhấn lần nữa (hoặc nút "Đặt xuống bàn") để đặt Pokémon này.');
    this.selectedUid.set(card.uid);
    this.refresh();
  }

  placeSelected(): void {
    const index = this.ctl.displayed.sides[0].hand.findIndex(card => card.uid === this.selectedUid());
    if (index >= 0) this.act({ t: 'place', hand: index });
  }

  clickMine(zone: 'active' | 'bench', index: number, uid: number): void {
    const game = this.ctl.displayed, selected = this.selectedUid();
    if (this.ctl.canAct()) {
      const energyIndex = selected === null ? -1 : game.sides[0].hand.findIndex(card => card.uid === selected && card.kind === 'energy');
      if (energyIndex >= 0) { this.act({ t: 'attach', hand: energyIndex, target: zone === 'active' ? -1 : index }); return; }
      if (zone === 'bench' && game.phase === 'promote') { this.act({ t: 'promote', bench: index }); return; }
      if (zone === 'bench' && this.retreating()) { this.act({ t: 'retreat', bench: index }); return; }
    }
    this.pinnedUid = uid; this.refreshInspect();
  }

  attack(index: number): void {
    const turn = this.ctl.displayed.turnNumber;
    if (this.act({ t: 'attack', index })) this.attackTurn = turn;
  }
  endTurn(): void { this.act({ t: 'end' }); }
  ready(): void { this.act({ t: 'ready' }); }
  toggleRetreat(): void {
    if (this.retreating()) { this.retreating.set(false); return; }
    const reason = this.view()?.retreatReason;
    if (reason) { this.flash(reason); return; }
    this.selectedUid.set(null); this.retreating.set(true); this.flash('Chọn Pokémon trên băng ghế để đổi lên Chiến đấu.');
  }
  newGame(): void { this.tutorial.stop(); this.beginGame(false); }
  startTutorial(): void { this.beginGame(true); }

  /** Bắt đầu ván mới; chế độ hướng dẫn ép người chơi đi trước để có đủ các bước (gắn Năng lượng, tấn công). */
  private beginGame(tutorial: boolean): void {
    this.selectedUid.set(null); this.retreating.set(false); this.pinnedUid = null; this.hoverUid = null; this.popups.set([]); this.hint.set('');
    this.attackTurn = null;
    if (tutorial) this.tutorial.start(); else this.tutorial.stop();
    this.ctl.start(undefined, tutorial ? { first: 0 } : {});
    this.refresh();
    if (tutorial) this.revealStage();
  }

  /** Cuộn để sân nằm trọn trong khung nhìn (dưới thanh header) khi bắt đầu hướng dẫn. */
  private revealStage(): void {
    if (typeof window === 'undefined' || this.state() === 'text') return;
    const top = this.stageRef().nativeElement.getBoundingClientRect().top;
    if (Math.abs(top - 84) > 24) window.scrollBy({ top: top - 84, behavior: this.reduced ? 'auto' : 'smooth' });
  }

  // ---------- Hướng dẫn từng bước ----------
  private tutorialSeen(): boolean { try { return localStorage.getItem(TUTORIAL_KEY) === '1'; } catch { return false; } }
  private markTutorialSeen(): void { try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* chế độ riêng tư: bỏ qua */ } }

  private refreshCoach(): void {
    const game = this.ctl.displayed, view = this.view();
    const selectedUid = this.selectedUid();
    const selectedCard = selectedUid === null ? undefined : game.sides[0].hand.find(c => c.uid === selectedUid);
    // Đòn đánh chỉ tính là "đã xong" khi cảnh đã trình bày xong lượt tấn công (lượt đổi hoặc ván kết thúc/chờ chọn thay thế).
    const attacked = this.attackTurn !== null && (game.turnNumber !== this.attackTurn || game.phase === 'over' || game.phase === 'promote');
    const step = this.tutorial.active && view
      ? this.tutorial.current(game, { canAct: view.canAct, canAttack: view.attacks.some(a => a.enabled), selected: selectedCard?.kind ?? null, attacked })
      : null;
    this.coach.set(step);
    if (this.tutorial.completed) this.markTutorialSeen();
    const me = game.sides[0], canAct = !!view?.canAct;
    const uids: number[] = [];
    if (step && canAct) {
      if (step.cards === 'hand-pokemon') uids.push(...me.hand.filter(c => c.kind === 'pokemon').map(c => c.uid));
      else if (step.cards === 'hand-energy' && !game.attached) uids.push(...me.hand.filter(c => c.kind === 'energy').map(c => c.uid));
      else if (step.cards === 'bench') uids.push(...me.bench.map(b => b.uid));
    }
    this.guideUids = new Set(uids);
    this.guideZones = new Set(step?.zones ?? []);
    this.labelsBig.set(!!step && step.id.startsWith('tour-'));
    this.updateCoachAnchor();
  }
  readonly labelsBig = signal(false);

  coachNext(): void {
    if (this.tutorial.next(this.ctl.displayed)) this.markTutorialSeen();
    this.refresh();
  }
  skipTutorial(): void { this.tutorial.stop(); this.markTutorialSeen(); this.refresh(); }
  /** Nút được nhấn mạnh trong bước hướng dẫn hiện tại ("attack" đổi thành "end" khi chưa đánh được). */
  guided(button: 'ready' | 'attack' | 'end' | 'retreat'): boolean {
    const step = this.coach(), view = this.view();
    if (!step?.button) return false;
    const target = step.button === 'attack' && (this.ctl.displayed.turnNumber === 1 || !view?.attacks.some(a => a.enabled)) ? 'end' : step.button;
    return target === button;
  }

  /** Điểm thế giới mà bước hiện tại chỉ vào; null nếu không chỉ vào đâu trên bàn. */
  private resolveTarget(target: string): Vec3 | null {
    const me = this.ctl.displayed.sides[0], selected = this.selectedUid();
    if (target.startsWith('zone:')) { const [, side, zone] = target.split(':'); return this.scene.zoneWorld(Number(side) as 0 | 1, zone); }
    if (target.startsWith('hp:')) return this.scene.hpWorld(Number(target.slice(3)) as 0 | 1);
    if (target === 'hand-pokemon' || target === 'hand-energy') {
      const kind = target === 'hand-pokemon' ? 'pokemon' : 'energy';
      if (selected !== null && me.hand.some(c => c.uid === selected && c.kind === kind)) return this.scene.zoneWorld(0, 'active');
      const card = me.hand.find(c => c.kind === kind);
      return card ? this.scene.cardWorld(card.uid) : null;
    }
    return null;
  }

  private updateCoachAnchor(): void {
    const step = this.coach(), { w, h } = this.stageSize;
    if (!step || !w || !h) { if (this.coachAnchor()) this.coachAnchor.set(null); return; }
    const width = Math.min(380, w - 16);
    let next: CoachAnchor;
    const world = step.target === 'button' || step.target === 'center' ? null : this.resolveTarget(step.target);
    const at = world ? this.scene.toScreen(world) : null;
    if (step.target === 'button') next = { mode: 'above', ring: false, x: w / 2, y: h, left: (w - width) / 2, width, vertical: 12, tailX: width / 2 };
    else if (!at) next = { mode: 'center', ring: false, x: w / 2, y: h / 2, left: (w - width) / 2, width, vertical: h / 2, tailX: width / 2 };
    else {
      const x = Math.min(w - 20, Math.max(20, at[0])), y = Math.min(h - 20, Math.max(20, at[1])), above = y > h * 0.5;
      const left = Math.min(w - width - 8, Math.max(8, x - width / 2));
      next = { mode: above ? 'above' : 'below', ring: true, x, y, left, width, vertical: above ? h - y + 40 : y + 40, tailX: Math.min(width - 28, Math.max(28, x - left)) };
    }
    const cur = this.coachAnchor();
    if (!cur || cur.mode !== next.mode || cur.ring !== next.ring || Math.abs(cur.x - next.x) > 1.5 || Math.abs(cur.y - next.y) > 1.5 || Math.abs(cur.left - next.left) > 1.5 || cur.width !== next.width || Math.abs(cur.vertical - next.vertical) > 1.5) this.coachAnchor.set(next);
  }

  /**
   * Điện thoại cầm dọc → hiện màn "xoay ngang" và dừng vẽ; cầm ngang → dùng toàn bộ chiều cao (ẩn header/footer của site).
   * Chỉ áp dụng cho thiết bị cảm ứng; máy tính và máy tính bảng lớn không bị chặn.
   */
  private watchOrientation(): void {
    if (typeof matchMedia !== 'function') return;
    const portrait = matchMedia('(orientation: portrait) and (max-width: 900px) and (pointer: coarse)');
    const landscapePhone = matchMedia('(orientation: landscape) and (max-height: 520px) and (pointer: coarse)');
    const root = document.documentElement;
    const apply = () => {
      this.portraitPhone.set(portrait.matches);
      if (landscapePhone.matches) root.dataset['arenaFocus'] = 'true'; else delete root.dataset['arenaFocus'];
      if (portrait.matches) { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } } else { this.lastTs = 0; this.schedule(); }
      setTimeout(() => this.applyResize(), 0);
    };
    apply();
    portrait.addEventListener?.('change', apply); landscapePhone.addEventListener?.('change', apply);
    this.cleanups.push(() => { portrait.removeEventListener?.('change', apply); landscapePhone.removeEventListener?.('change', apply); delete root.dataset['arenaFocus']; });
  }

  /** Thử vào toàn màn hình rồi khóa hướng ngang (Chrome Android); iOS/trình duyệt khác không hỗ trợ thì người dùng tự xoay máy. */
  async enterLandscape(): Promise<void> {
    try {
      await document.documentElement.requestFullscreen?.();
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch { /* không hỗ trợ: bỏ qua */ }
  }

  private updateLabels(): void {
    this.labels.set(this.scene.zoneLabels().flatMap(label => {
      const at = this.scene.toScreen(label.world);
      return at ? [{ text: label.text, x: at[0], y: at[1], align: label.align, side: label.side }] : [];
    }));
  }
  reload(): void { location.reload(); }
  cancel(): void { this.selectedUid.set(null); this.retreating.set(false); this.pinnedUid = null; this.hint.set(''); this.refresh(); }

  // ---------- Con trỏ trên canvas ----------
  onPointerMove(event: PointerEvent): void {
    if (this.state() !== 'ready') return;
    const canvas = event.currentTarget as HTMLCanvasElement, rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    this.pointer = [(x / rect.width) * 2 - 1, (y / rect.height) * 2 - 1];
    const pick = event.pointerType === 'touch' ? null : this.scene.pickAt(x, y);
    const uid = pick ? pick.uid : null;
    canvas.style.cursor = pick && this.clickable(pick) ? 'pointer' : 'default';
    if (uid !== this.hoverUid) { this.hoverUid = uid; this.refreshInspect(); }
    this.wake();
  }
  onPointerLeave(): void { if (this.hoverUid !== null) { this.hoverUid = null; this.pointer = [0, 0]; this.refreshInspect(); } }
  onPointerDown(event: PointerEvent): void {
    if (this.state() !== 'ready' || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const canvas = event.currentTarget as HTMLCanvasElement, rect = canvas.getBoundingClientRect();
    const pick = this.scene.pickAt(event.clientX - rect.left, event.clientY - rect.top);
    this.wake();
    if (!pick) { if (this.selectedUid() !== null || this.retreating()) this.cancel(); else { this.pinnedUid = null; this.refreshInspect(); } return; }
    this.hoverUid = pick.uid;
    if (pick.side === 0 && pick.zone === 'hand') this.clickHand(pick.index);
    else if (pick.side === 0 && (pick.zone === 'active' || pick.zone === 'bench')) this.clickMine(pick.zone, pick.index, pick.uid);
    else { this.pinnedUid = pick.uid; this.refreshInspect(); }
  }
  private clickable(pick: Pick): boolean { return pick.side === 0 && this.ctl.canAct() && pick.zone !== 'discard'; }
  onKey(event: KeyboardEvent): void { if (event.key === 'Escape') this.cancel(); }

  private teardown(): void {
    this.destroyed = true;
    this.stopLoop();
    clearTimeout(this.hintTimer);
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    const renderer = this.renderer;
    this.renderer = null;
    renderer?.dispose();
  }
}

const EMPTY: ReadonlySet<number> = new Set();
