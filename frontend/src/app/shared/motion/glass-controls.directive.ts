import { afterNextRender, DestroyRef, Directive, ElementRef, inject, NgZone } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';

/** Keep in sync with glass-controls.css; plain text links remain text links. */
export const GLASS_CONTROL_SELECTOR = 'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"], a[data-glass-control], a.primary-cta, a.submit-btn, a.google-btn, a.action-btn-primary, a.action-btn-secondary, a.cart-link, a.liquid-glass, span.view-3d';

/** One delegated pointer controller for dynamic controls across all routes. */
export function mountGlassControls(root: HTMLElement): { reset(): void; destroy(): void } {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const opaque = matchMedia('(forced-colors: active), (prefers-reduced-transparency: reduce)');
  let active: HTMLElement | null = null, box: DOMRect | undefined;
  let frame = 0, px = 0, py = 0, lastX = '', lastY = '', destroyed = false;
  const removers: (() => void)[] = [];
  const enabled = () => fine.matches && !reduced.matches && !opaque.matches && !document.hidden;
  const available = (control: HTMLElement) => control.isConnected && root.contains(control) &&
    !control.matches(':disabled, [aria-disabled="true"]') && !control.closest('[inert]');
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => invalidate()) : undefined;

  const reset = () => {
    cancelAnimationFrame(frame); frame = 0; observer?.disconnect();
    if (active) {
      active.removeAttribute('data-control-glass-active');
      active.style.removeProperty('--control-glass-x'); active.style.removeProperty('--control-glass-y');
    }
    active = null; box = undefined; lastX = ''; lastY = '';
  };
  const update = () => {
    frame = 0;
    if (destroyed || !active) return;
    if (!enabled() || !available(active)) { reset(); return; }
    box ??= active.getBoundingClientRect();
    if (!box.width || !box.height || px < box.left || px > box.right || py < box.top || py > box.bottom) { reset(); return; }
    const x = `${Math.round((px - box.left) / box.width * 1000) / 10}%`;
    const y = `${Math.round((py - box.top) / box.height * 1000) / 10}%`;
    if (x !== lastX) { active.style.setProperty('--control-glass-x', x); lastX = x; }
    if (y !== lastY) { active.style.setProperty('--control-glass-y', y); lastY = y; }
    if (!active.hasAttribute('data-control-glass-active')) active.setAttribute('data-control-glass-active', '');
  };
  const schedule = () => { if (!destroyed && active && enabled() && !frame) frame = requestAnimationFrame(update); };
  const invalidate = () => { box = undefined; schedule(); };
  const move = (event: PointerEvent) => {
    if (!enabled() || event.pointerType === 'touch') { if (active) reset(); return; }
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>(GLASS_CONTROL_SELECTOR) : null;
    // Existing optical nav/CTA directives already own their pointer highlights.
    if (!target || !available(target) || target.matches('[appLiquidGlass]') || target.closest('nav[appLiquidGlass]')) {
      if (active) reset(); return;
    }
    if (active !== target) { reset(); active = target; observer?.observe(target); }
    px = event.clientX; py = event.clientY; schedule();
  };
  const out = (event: PointerEvent) => {
    if (active && (!(event.relatedTarget instanceof Node) || !active.contains(event.relatedTarget))) reset();
  };
  const listen = (target: EventTarget, type: string, callback: EventListener, options?: AddEventListenerOptions) => {
    target.addEventListener(type, callback, options);
    removers.push(() => target.removeEventListener(type, callback, options));
  };
  listen(root, 'pointermove', move as EventListener, { passive: true });
  listen(root, 'pointerout', out as EventListener, { passive: true });
  listen(root, 'pointerleave', reset);
  listen(root, 'focusin', reset);
  listen(window, 'resize', invalidate, { passive: true });
  listen(window, 'scroll', invalidate, { passive: true, capture: true });
  listen(window, 'blur', reset);
  listen(document, 'visibilitychange', reset);
  for (const query of [fine, reduced, opaque]) listen(query, 'change', reset);
  return {
    reset,
    destroy() { if (destroyed) return; reset(); destroyed = true; removers.forEach(remove => remove()); },
  };
}

@Directive({ selector: '[appGlassControls]' })
export class GlassControlsDirective {
  private readonly root = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  private readonly router = inject(Router, { optional: true });
  constructor() {
    afterNextRender(() => {
      if (typeof matchMedia !== 'function') return;
      this.zone.runOutsideAngular(() => {
        const controller = mountGlassControls(this.root);
        const navigation = this.router?.events.subscribe(event => { if (event instanceof NavigationStart) controller.reset(); });
        this.destroyRef.onDestroy(() => { navigation?.unsubscribe(); controller.destroy(); });
      });
    });
  }
}
