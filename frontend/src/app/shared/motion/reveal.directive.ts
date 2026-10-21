import { afterNextRender, DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';

/** Fade + trượt lên một lần khi vào khung nhìn. Trạng thái ẩn chỉ đặt sau hydrate; reduced motion giữ nguyên nội dung. */
@Directive({ selector: '[appReveal]' })
export class RevealDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  /** Độ trễ (ms), dùng để so le theo chỉ số. */
  readonly appReveal = input<number | ''>(0);

  constructor() {
    afterNextRender(() => {
      if (typeof IntersectionObserver !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const el = this.element;
      const rect = el.getBoundingClientRect();
      if (rect.top < innerHeight && rect.bottom > 0 && document.documentElement.dataset['boot'] !== 'pending') return; // đã thấy ngay từ đầu
      el.dataset['reveal'] = 'pending';
      el.style.setProperty('--reveal-delay', `${Number(this.appReveal()) || 0}ms`);
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        el.dataset['reveal'] = 'shown';
        observer.disconnect();
      }, { rootMargin: '0px 0px -8% 0px' });
      observer.observe(el);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
