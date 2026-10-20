import { afterNextRender, DestroyRef, Directive, ElementRef, inject, NgZone } from '@angular/core';

/** Pointer light and a measured nav lens; visual effects never own navigation. */
@Directive({ selector: '[appLiquidGlass]', host: { class: 'liquid-glass' } })
export class LiquidGlassDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  constructor() {
    afterNextRender(() => {
      if (typeof matchMedia !== 'function' || typeof ResizeObserver !== 'function') return;
      this.zone.runOutsideAngular(() => this.mount());
    });
  }
  private mount() {
    const element = this.element;
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const nav = element.matches('nav');
    let frame = 0, px = 0, py = 0, inside = false, destroyed = false, layoutDirty = true;
    let hover: HTMLElement | null = null, focused: HTMLElement | null = null, lens: HTMLElement | null = null;
    let box: DOMRect | undefined;
    let itemBoxes = new WeakMap<HTMLElement, DOMRect>();
    let active = nav ? element.querySelector<HTMLElement>('a.active') : null;
    let opened = nav ? element.querySelector<HTMLElement>('a[data-glass-open]') : null;
    const linkFor = (target: EventTarget | null): HTMLElement | null => {
      if (!nav || !(target instanceof Element)) return null;
      return target.closest<HTMLElement>('a') ?? target.closest('[data-glass-item]')?.querySelector<HTMLElement>('a') ?? null;
    };
    const values = new Map<string, string>();
    const write = (name: string, value: string) => {
      if (values.get(name) === value) return;
      values.set(name, value); element.style.setProperty(name, value);
    };
    const update = () => {
      frame = 0;
      if (destroyed) return;
      if (!box || layoutDirty) {
        box = element.getBoundingClientRect(); itemBoxes = new WeakMap(); layoutDirty = false;
      }
      const enabled = fine.matches && !reduced.matches;
      const x = enabled && inside ? Math.max(0, Math.min(1, (px - box.left) / (box.width || 1))) : .5;
      const y = enabled && inside ? Math.max(0, Math.min(1, (py - box.top) / (box.height || 1))) : .5;
      const target = nav && box.width ? hover ?? opened ?? focused ?? active : null;
      // Finish geometry reads before changing styles/attributes.
      let item: DOMRect | undefined;
      if (target) {
        item = itemBoxes.get(target);
        if (!item) { item = target.getBoundingClientRect(); itemBoxes.set(target, item); }
      }
      if (nav) {
        write('--glass-light-x', `${Math.round(x * box.width * 10) / 10}px`);
        if (target !== lens) {
          lens?.removeAttribute('data-glass-lens');
          target?.setAttribute('data-glass-lens', 'true'); lens = target;
        }
        if (target && item) {
          write('--lens-x', `${item.left - box.left}px`); write('--lens-width', `${item.width}px`);
          if (!element.hasAttribute('data-lens-ready')) element.dataset['lensReady'] = 'true';
        } else {
          write('--lens-width', '0px');
          if (element.hasAttribute('data-lens-ready')) delete element.dataset['lensReady'];
        }
      } else {
        write('--glass-x', `${Math.round(x * 1000) / 10}%`);
        write('--glass-y', `${Math.round(y * 1000) / 10}%`);
        write('--glass-rx', `${enabled && inside ? Math.round((y - .5) * -800) / 100 : 0}deg`);
        write('--glass-ry', `${enabled && inside ? Math.round((x - .5) * 1000) / 100 : 0}deg`);
      }
    };
    const schedule = () => { if (!frame && !destroyed && !document.hidden) frame = requestAnimationFrame(update); };
    const invalidate = () => { layoutDirty = true; schedule(); };
    const move = (event: PointerEvent) => {
      if (!fine.matches || reduced.matches || event.pointerType === 'touch') return;
      if (!inside) layoutDirty = true;
      px = event.clientX; py = event.clientY; inside = true;
      hover = linkFor(event.target);
      schedule();
    };
    const reset = () => { inside = false; hover = null; schedule(); };
    const focus = (event: FocusEvent) => {
      hover = null; inside = false;
      focused = linkFor(event.target);
      schedule();
    };
    const unfocus = () => { focused = null; schedule(); };
    const scroll = () => { layoutDirty = true; if (inside || focused) schedule(); };
    const visibility = () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; inside = false; hover = null; }
      else invalidate();
    };
    const observer = new ResizeObserver(invalidate); observer.observe(element);
    const mutations = nav ? new MutationObserver(() => {
      active = element.querySelector<HTMLElement>('a.active');
      opened = element.querySelector<HTMLElement>('a[data-glass-open]'); invalidate();
    }) : null;
    mutations?.observe(element, { subtree: true, attributes: true, attributeFilter: ['class', 'data-glass-open'], childList: true });
    element.addEventListener('pointermove', move, { passive: true });
    element.addEventListener('pointerleave', reset);
    element.addEventListener('focusin', focus); element.addEventListener('focusout', unfocus);
    window.addEventListener('resize', invalidate);
    window.addEventListener('scroll', scroll, { passive: true, capture: true });
    document.addEventListener('visibilitychange', visibility);
    fine.addEventListener('change', reset); reduced.addEventListener('change', reset);
    schedule();
    this.destroyRef.onDestroy(() => {
      destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); mutations?.disconnect();
      element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', reset);
      element.removeEventListener('focusin', focus); element.removeEventListener('focusout', unfocus);
      window.removeEventListener('resize', invalidate); window.removeEventListener('scroll', scroll, true);
      document.removeEventListener('visibilitychange', visibility);
      fine.removeEventListener('change', reset); reduced.removeEventListener('change', reset);
    });
  }
}
