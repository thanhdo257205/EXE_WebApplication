import { afterNextRender, DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';

/** Đếm số từ 0 lên giá trị đích khi phần tử vào khung nhìn. Nội dung gốc (giá trị thật) giữ nguyên khi thiếu JS hoặc reduced motion. */
@Directive({ selector: '[appCountUp]' })
export class CountUpDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  readonly appCountUp = input.required<number>();
  /** Thời lượng (ms). */
  readonly countDuration = input(1400);

  constructor() {
    afterNextRender(() => {
      if (typeof IntersectionObserver !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const el = this.element, target = this.appCountUp();
      if (!Number.isFinite(target) || target <= 0) return;
      let frame = 0;
      el.textContent = '0';
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        const start = performance.now(), duration = this.countDuration();
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
          if (t < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      }, { rootMargin: '0px 0px -10% 0px' });
      observer.observe(el);
      this.destroyRef.onDestroy(() => { observer.disconnect(); cancelAnimationFrame(frame); el.textContent = String(target); });
    });
  }
}
