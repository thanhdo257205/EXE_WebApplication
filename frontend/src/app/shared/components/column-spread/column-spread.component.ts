import { afterNextRender, Component, DestroyRef, ElementRef, inject, input, NgZone, signal, viewChild } from '@angular/core';
import TEMPLATE from '../../motion/spread-columns.js';

export const SPREAD_PARAMS = { cornerRadius: 3, padding: 6, shadowEnabled: false, rows: 3, rowsOdd: 3, rowGap: 3, cardGap: 3, stackStyle: 'single', stackScale: 50, zoom: 50, drift: 16, rowDelay: 4, cardAspect: '1:1', backgroundType: 'color', background: 'rgba(0,0,0,0)' };
export const DECORATIVE_CARDS = Array.from({ length: 12 }, (_, i) => `/assets/cards/card-${String(i + 1).padStart(2, '0')}.svg`);

@Component({
  selector: 'app-column-spread',
  template: `<div class="spread-stage" #stage>
    <img class="still" src="/assets/cards/card-01.svg" [src]="imageSources()[0]" alt="" [class.ready]="ready()" />
    <canvas #canvas role="img" aria-label="Bộ mặt thẻ minh họa tách thành ba cột rồi thu về một chồng" [class.ready]="ready()"></canvas>
    @if (!reducedMotion()) { <button type="button" class="motion-control" (click)="togglePause()" [attr.aria-pressed]="paused()">{{ paused() ? 'Phát chuyển động' : 'Dừng chuyển động' }}</button> }
  </div>`,
  styles: `:host { display:block; }.spread-stage { position:relative; aspect-ratio:16/9; overflow:hidden; background:#0c0b10; }canvas { display:block; width:100%; height:100%; opacity:0; }canvas.ready { opacity:1; }.still { position:absolute; width:30%; aspect-ratio:1; object-fit:cover; left:35%; top:23%; border-radius:12px; }.still.ready { visibility:hidden; }.motion-control { position:absolute; right:16px; bottom:16px; padding:10px 14px; background:#f9f6e9; color:#17392c; border-radius:24px; font-size:12px; font-weight:700; }.motion-control:focus-visible { outline:3px solid #ff91b2; outline-offset:3px; }`,
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
    const images: (HTMLImageElement | undefined)[] = Array(12).fill(undefined);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let t = 0.12, last = 0, frame = 0, visible = false, destroyed = false;
    let dirty = true, sizeDirty = true;
    const running = () => !media.matches && !this.paused();
    const schedule = () => {
      if (!destroyed && visible && !document.hidden && !frame && (dirty || running())) frame = requestAnimationFrame(tick);
    };
    const draw = () => {
      if (destroyed || !canvas.width || !canvas.height) return;
      // The supplied engine already resets and clears the complete canvas.
      TEMPLATE.render({ ctx, t, width: canvas.width, height: canvas.height, params: SPREAD_PARAMS, images, background: null });
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
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.round(container.clientWidth * dpr), height = Math.round(container.clientHeight * dpr);
        // Assigning an unchanged dimension still clears/reallocates the bitmap.
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        sizeDirty = false;
      }
      if (running()) {
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        t = (t + dt / 8.0) % 1; last = now;
      } else last = 0;
      draw(); dirty = false; schedule();
    };
    const playback = () => {
      if (media.matches) { t = 0.12; dirty = true; }
      if (destroyed || !visible || document.hidden || !running()) {
        cancelAnimationFrame(frame); frame = 0; last = 0;
      }
      schedule();
    };
    this.paused.set(media.matches); this.reducedMotion.set(media.matches); this.updatePlayback = playback;
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container);
    const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; playback(); });
    intersection.observe(container);
    const preferenceChanged = () => { this.paused.set(media.matches); this.reducedMotion.set(media.matches); playback(); };
    media.addEventListener('change', preferenceChanged); document.addEventListener('visibilitychange', playback);
    const loaders = this.imageSources().slice(0, 12).map((src, index) => {
      const image = new Image();
      image.onload = () => { if (!destroyed) { images[index] = image; dirty = true; schedule(); } };
      image.onerror = () => { dirty = true; schedule(); }; image.src = src; return image;
    });
    resize(); playback();
    this.destroyRef.onDestroy(() => {
      destroyed = true; cancelAnimationFrame(frame); resizeObserver.disconnect(); intersection.disconnect();
      media.removeEventListener('change', preferenceChanged); document.removeEventListener('visibilitychange', playback);
      loaders.forEach(image => { image.onload = null; image.onerror = null; }); this.updatePlayback = () => {};
    });
  }
}
