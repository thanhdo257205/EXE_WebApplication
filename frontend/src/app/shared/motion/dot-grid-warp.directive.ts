import { afterNextRender, DestroyRef, Directive, ElementRef, inject, NgZone } from '@angular/core';
import { mountDotGridWarp } from './dot-grid-warp';

@Directive({ selector: '[appDotGridWarp]' })
export class DotGridWarpDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  constructor() {
    afterNextRender(() => {
      if (typeof matchMedia !== 'function' || typeof ResizeObserver !== 'function') return;
      const stop = this.zone.runOutsideAngular(() => mountDotGridWarp(this.element));
      this.destroyRef.onDestroy(stop);
    });
  }
}
