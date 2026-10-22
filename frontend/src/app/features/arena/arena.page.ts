import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PERF_TIER_EVENT } from '../../shared/utils/perf-tier';
import { ENERGY_RGB, ARENA_POKEMON, type CostType } from './arena-cards';
import { ArenaController, inspect, type Inspect, type Presenter } from './arena-controller';
import type { Action } from './arena-engine';
import { ArenaRenderer, loadPosterBitmaps, WebGpuUnavailableError, type ArenaQuality } from './arena-renderer';
import { ArenaScene, type Pick, type Popup } from './arena-scene';
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

const textPresenter: Presenter = { reset: () => undefined, present: () => 0.35 };

/** Sân đấu mô phỏng: WebGPU thuần (không thư viện); khi thiếu WebGPU vẫn chơi được bằng bảng chữ + nút. */
@Component({
  selector: 'app-arena-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './arena.page.html',
  styleUrl: './arena.page.css',
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
      this.ctl.start();
      this.startTextLoop();
      return;
    }
    this.renderer = renderer;
    renderer.setQuality(QUALITY[this.quality()]);
    void renderer.lost.then(() => { if (this.renderer === renderer) { this.stopLoop(); this.state.set('lost'); } });
    this.state.set('ready');
    this.observe(stage, canvas, media!);
    this.ctl.start();
    this.startLoop();
  }

  private observe(stage: HTMLElement, canvas: HTMLCanvasElement, media: MediaQueryList): void {
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height || !this.renderer) return;
      const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality()].dprCap);
      this.renderer.resize(rect.width * dpr, rect.height * dpr);
      this.scene.resize(rect.width, rect.height);
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
  private schedule(): void { if (!this.raf && this.running && this.visible && !document.hidden) this.raf = requestAnimationFrame(this.frame); }
  private syncLoop(): void { if (this.running && this.visible && !document.hidden) { this.lastTs = 0; this.schedule(); } else if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } }
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
    this.scene.setUi({ selected: this.selectedUid(), targets: this.targetSet(), hover: this.hoverUid, pointer: this.pointer });
    this.scene.update(dt);
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

  attack(index: number): void { this.act({ t: 'attack', index }); }
  endTurn(): void { this.act({ t: 'end' }); }
  ready(): void { this.act({ t: 'ready' }); }
  toggleRetreat(): void {
    if (this.retreating()) { this.retreating.set(false); return; }
    const reason = this.view()?.retreatReason;
    if (reason) { this.flash(reason); return; }
    this.selectedUid.set(null); this.retreating.set(true); this.flash('Chọn Pokémon trên băng ghế để đổi lên Chiến đấu.');
  }
  newGame(): void { this.selectedUid.set(null); this.retreating.set(false); this.pinnedUid = null; this.hoverUid = null; this.popups.set([]); this.ctl.start(); }
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
