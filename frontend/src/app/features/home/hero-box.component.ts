import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import type { HeroRuntime } from './hero3d/hero-runtime';

/**
 * Hộp game 3D (WebGPU) ở hero trang chủ. Mã cảnh/renderer nạp lười sau khi trang đã hiển thị;
 * không có WebGPU, bật reduced motion hoặc máy đã bị hạ cấp thì không chạy và trang giữ bản CSS tĩnh.
 */
@Component({
  selector: 'app-hero-box',
  template: '<canvas #canvas class="hero-canvas" aria-hidden="true"></canvas>',
  styles: ':host{position:absolute;inset:0;z-index:15;pointer-events:none}.hero-canvas{display:block;width:100%;height:100%;opacity:0;transition:opacity .9s ease}:host(.ready) .hero-canvas{opacity:1}',
  host: { '[class.ready]': 'isReady()' },
})
export class HeroBoxComponent {
  readonly theme = input(0);
  /** Phần tử dài bao hero, dùng tính tiến độ cuộn. */
  readonly track = input.required<HTMLElement>();
  /** true khi cảnh 3D đã vẽ khung đầu; false nếu mất GPU giữa chừng (bên ngoài hiện lại bản tĩnh). */
  readonly active = output<boolean>();
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private runtime: HeroRuntime | null = null;
  readonly isReady = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    const abort = new AbortController();
    destroyRef.onDestroy(() => abort.abort());
    effect(() => { const theme = this.theme(); this.runtime?.setTheme(theme); });
    afterNextRender(() => {
      if (!('gpu' in navigator) || !navigator.gpu || matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset['perf'] === 'low') return;
      const idle = (cb: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 300));
      idle(() => {
        if (abort.signal.aborted) return;
        const canvas = this.canvas().nativeElement;
        canvas.addEventListener('hero-lost', () => { this.runtime?.dispose(); this.runtime = null; this.isReady.set(false); this.active.emit(false); }, { once: true });
        import('./hero3d/hero-runtime')
          .then(({ startHeroRuntime }) => startHeroRuntime({
            canvas, track: this.track(), theme: this.theme(), signal: abort.signal,
            onReady: () => { this.isReady.set(true); this.active.emit(true); },
          }))
          .then(runtime => { this.runtime = runtime; runtime.setTheme(this.theme()); })
          .catch(error => { if (!abort.signal.aborted) console.info('[hero] giữ bản tĩnh:', (error as Error)?.message ?? error); });
      });
    });
  }
}
