import { afterNextRender, Component, DestroyRef, ElementRef, inject, input, NgZone, signal, viewChild } from '@angular/core';
import TEMPLATE from '../../motion/spread-columns.js';
import { PERF_TIER_EVENT } from '../../utils/perf-tier';

export const SPREAD_PARAMS = { cornerRadius: 3, padding: 6, shadowEnabled: false, rows: 3, rowsOdd: 3, rowGap: 3, cardGap: 3, stackStyle: 'single', stackScale: 50, zoom: 50, drift: 16, rowDelay: 4, cardAspect: 'auto', backgroundType: 'color', background: 'rgba(0,0,0,0)' };
export const POKEMON_POSTER_NAMES = [
  'charizard',
  'blastoise',
  'venusaur',
  'mewtwo',
  'pikachu',
  'bulbasaur',
  'charmander',
  'squirtle',
  'eevee',
] as const;
const UNIQUE_POKEMON_CARDS = POKEMON_POSTER_NAMES.map(name => `/assets/cards/pokemon/${name}-poster.webp`);
export const DECORATIVE_CARDS = [
  ...UNIQUE_POKEMON_CARDS,
  ...UNIQUE_POKEMON_CARDS.slice(0, 3),
];

/**
 * Ngân sách vẽ canvas theo thiết bị: số điểm ảnh tỷ lệ với DPR², nên hạ DPR là cách giảm tải rẻ nhất.
 * Máy mạnh giữ DPR cap 2 như cũ; màn cảm ứng cap 1,5; máy bị `perf-tier=low` dùng DPR 1 và tối đa ~30 khung/giây.
 */
export function spreadRenderBudget(devicePixelRatio: number, coarsePointer: boolean, lowTier: boolean): { dpr: number; minFrameMs: number } {
  const cap = lowTier ? 1 : coarsePointer ? 1.5 : 2;
  return { dpr: Math.min(devicePixelRatio || 1, cap), minFrameMs: lowTier ? 33 : 0 };
}

/**
 * Pure Fisher-Yates shuffle over an array of slot indices or elements.
 * Guarantees that the resulting permutation differs from the input order
 * when length >= 2 (falls back to a 1-element cyclic rotate if RNG produces identity).
 */
export function shuffleIndices(
  source: readonly number[],
  rng: () => number = Math.random
): number[] {
  const result = source.slice();
  const n = result.length;
  if (n <= 1) return result;

  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }

  // Ensure next permutation differs from input when RNG yields identity
  let isIdentical = true;
  for (let i = 0; i < n; i++) {
    if (result[i] !== source[i]) {
      isIdentical = false;
      break;
    }
  }

  if (isIdentical) {
    const first = result.shift()!;
    result.push(first);
  }

  return result;
}

@Component({
  selector: 'app-column-spread',
  template: `<div class="spread-stage" #stage>
    <img class="still" [src]="imageSources()[0]" alt="" loading="lazy" decoding="async" [class.ready]="ready()" />
    <canvas #canvas role="img" aria-label="Bộ mặt thẻ minh họa tách thành ba cột rồi thu về một chồng" [class.ready]="ready()"></canvas>
    @if (!reducedMotion()) { <button type="button" class="motion-control" (click)="togglePause()" [attr.aria-pressed]="paused()">{{ paused() ? 'Phát chuyển động' : 'Dừng chuyển động' }}</button> }
  </div>`,
  styles: `:host { display:block; }.spread-stage { position:relative; aspect-ratio:16/9; overflow:hidden; background:#0c0b10; }canvas { display:block; width:100%; height:100%; opacity:0; }canvas.ready { opacity:1; }.still { position:absolute; width:auto; height:70%; aspect-ratio:360/495; object-fit:contain; left:50%; top:50%; transform:translate(-50%, -50%); border-radius:12px; }.still.ready { visibility:hidden; }.motion-control { position:absolute; right:16px; bottom:16px; padding:10px 14px; background:#f9f6e9; color:#17392c; border-radius:24px; font-size:12px; font-weight:700; }.motion-control:focus-visible { outline:3px solid #ff91b2; outline-offset:3px; }`,
})
export class ColumnSpreadComponent {
  readonly imageSources = input<string[]>(DECORATIVE_CARDS);
  readonly paused = signal(false);
  readonly reducedMotion = signal(false);
  readonly ready = signal(false);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private updatePlayback = () => {};
  constructor() { afterNextRender(() => this.zone.runOutsideAngular(() => this.mount())); }
  togglePause() { this.paused.update(value => !value); this.updatePlayback(); }
  private mount() {
    if (typeof matchMedia !== 'function' || typeof ResizeObserver !== 'function' || typeof IntersectionObserver !== 'function') return;
    const container = this.stage().nativeElement, canvas = this.canvas().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fixed 12-slot buffer for decoded HTMLImageElements indexed by source position (0..11)
    const sourceImages: (HTMLImageElement | undefined)[] = Array(12).fill(undefined);
    // Display buffer passed to TEMPLATE.render; reuses same array to avoid heap allocations
    const displayImages: (HTMLImageElement | undefined)[] = Array(12).fill(undefined);
    // Stable slot indices 0..11 representing display card permutation
    let currentPermutation = shuffleIndices(Array.from({ length: 12 }, (_, i) => i));

    const syncDisplayImages = () => {
      for (let i = 0; i < 12; i++) {
        displayImages[i] = sourceImages[currentPermutation[i]];
      }
    };
    syncDisplayImages();

    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = matchMedia('(pointer: coarse)');
    const budget = () => spreadRenderBudget(window.devicePixelRatio, coarse.matches, document.documentElement.dataset['perf'] === 'low');
    let t = 0.12, last = 0, frame = 0, visible = false, destroyed = false;
    let dirty = true, sizeDirty = true;
    let initiated = false;
    const loaders: HTMLImageElement[] = [];
    let firstDecodedImage: HTMLImageElement | null = null;

    const running = () => !media.matches && !this.paused();
    const schedule = () => {
      if (!destroyed && visible && !document.hidden && !frame && (dirty || running())) frame = requestAnimationFrame(tick);
    };
    const draw = () => {
      if (destroyed || !canvas.width || !canvas.height) return;
      // The supplied engine already resets and clears the complete canvas.
      TEMPLATE.render({ ctx, t, width: canvas.width, height: canvas.height, params: SPREAD_PARAMS, images: displayImages, background: null });
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#0c0b10';
      ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore();
      this.ready.set(true);
    };
    const resize = () => { sizeDirty = true; dirty = true; schedule(); };
    const tick = (now: number) => {
      frame = 0;
      if (destroyed || !visible || document.hidden) { last = 0; return; }
      if (sizeDirty) {
        const { dpr } = budget();
        const width = Math.round(container.clientWidth * dpr), height = Math.round(container.clientHeight * dpr);
        // Assigning an unchanged dimension still clears/reallocates the bitmap.
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        sizeDirty = false;
      }
      if (running()) {
        const { minFrameMs } = budget();
        // Giới hạn tốc độ khung khi máy giật: bỏ khung này, dt tích lũy sang khung sau nên nhịp 8s không đổi.
        if (minFrameMs && last && now - last < minFrameMs - 2 && !dirty) { schedule(); return; }
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        const nextT = t + dt / 8.0;
        if (last > 0 && nextT >= 1) {
          currentPermutation = shuffleIndices(currentPermutation);
          syncDisplayImages();
        }
        t = nextT % 1; last = now;
      } else last = 0;
      draw(); dirty = false; schedule();
    };

    const loadImages = () => {
      if (initiated || destroyed || !visible || document.hidden) return;
      initiated = true;

      const sources = this.imageSources().slice(0, 12);
      const urlToIndices = new Map<string, number[]>();
      sources.forEach((src, idx) => {
        const list = urlToIndices.get(src);
        if (list) list.push(idx);
        else urlToIndices.set(src, [idx]);
      });

      urlToIndices.forEach((indices, src) => {
        const img = new Image();
        img.decoding = 'async';
        loaders.push(img);

        const onReady = () => {
          if (destroyed) return;
          const assignImage = () => {
            if (destroyed) return;
            if (!firstDecodedImage) firstDecodedImage = img;
            indices.forEach(idx => { sourceImages[idx] = img; });
            syncDisplayImages();
            dirty = true;
            schedule();
          };

          if (typeof img.decode === 'function') {
            img.decode().then(assignImage).catch(() => {
              // If decode() rejects (or image format issue), fallback or reuse first decoded
              if (destroyed) return;
              if (firstDecodedImage) {
                indices.forEach(idx => { sourceImages[idx] = firstDecodedImage!; });
                syncDisplayImages();
              }
              dirty = true;
              schedule();
            });
          } else {
            assignImage();
          }
        };

        img.onload = () => {
          img.onload = null;
          img.onerror = null;
          onReady();
        };

        img.onerror = () => {
          img.onload = null;
          img.onerror = null;
          if (destroyed) return;
          if (firstDecodedImage) {
            indices.forEach(idx => { sourceImages[idx] = firstDecodedImage!; });
            syncDisplayImages();
          }
          dirty = true;
          schedule();
        };

        img.src = src;
      });
    };

    const playback = () => {
      if (media.matches) { t = 0.12; dirty = true; }
      if (destroyed || !visible || document.hidden || !running()) {
        cancelAnimationFrame(frame); frame = 0; last = 0;
      }
      if (visible && !document.hidden && !initiated) {
        loadImages();
      }
      schedule();
    };
    this.paused.set(media.matches); this.reducedMotion.set(media.matches); this.updatePlayback = playback;
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container);
    const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; playback(); });
    intersection.observe(container);
    const preferenceChanged = () => { this.paused.set(media.matches); this.reducedMotion.set(media.matches); playback(); };
    const tierChanged = () => { sizeDirty = true; dirty = true; schedule(); };
    media.addEventListener('change', preferenceChanged); document.addEventListener('visibilitychange', playback);
    window.addEventListener(PERF_TIER_EVENT, tierChanged);
    resize(); playback();
    this.destroyRef.onDestroy(() => {
      destroyed = true; cancelAnimationFrame(frame); resizeObserver.disconnect(); intersection.disconnect();
      media.removeEventListener('change', preferenceChanged); document.removeEventListener('visibilitychange', playback);
      window.removeEventListener(PERF_TIER_EVENT, tierChanged);
      loaders.forEach(image => { image.onload = null; image.onerror = null; }); this.updatePlayback = () => {};
    });
  }
}
