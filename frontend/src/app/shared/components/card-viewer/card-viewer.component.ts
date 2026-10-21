import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  InjectionToken,
  NgZone,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DEFAULT_CARD_MODEL, DEFAULT_CARD_POSTER } from '../../../core/content/default-card';
import type { CardViewerHandle } from './card-viewer-runtime';

export const CARD_VIEWER_LOADER = new InjectionToken<
  () => Promise<typeof import('./card-viewer-runtime')>
>('CARD_VIEWER_LOADER', {
  providedIn: 'root',
  factory: () => () => import('./card-viewer-runtime'),
});

@Component({
  selector: 'app-card-viewer',
  templateUrl: './card-viewer.component.html',
  styleUrl: './card-viewer.component.css',
})
export class CardViewerComponent {
  readonly cardName = input('Thẻ minh họa');
  readonly poster = input(DEFAULT_CARD_POSTER);
  readonly frontTexture = input<string | undefined>();
  readonly status = signal<'waiting' | 'loading' | 'ready' | 'error'>('waiting');
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly zone = inject(NgZone);
  private readonly loadRuntime = inject(CARD_VIEWER_LOADER);
  private readonly destroyRef = inject(DestroyRef);
  private controller?: AbortController;
  private handle?: CardViewerHandle;
  private activated = false;
  constructor() {
    effect(() => {
      this.poster(); this.frontTexture();
      untracked(() => {
        if (!this.activated || this.destroyRef.destroyed) return;
        this.controller?.abort(); this.handle?.dispose(); this.handle = undefined;
        this.status.set('waiting');
        void this.start();
      });
    });
    afterNextRender(() =>
      this.zone.runOutsideAngular(() => {
        if (typeof IntersectionObserver !== 'function') {
          void this.start();
          return;
        }
        const observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            void this.start();
          }
        });
        observer.observe(this.stage().nativeElement);
        this.destroyRef.onDestroy(() => observer.disconnect());
      }),
    );
    this.destroyRef.onDestroy(() => {
      this.controller?.abort();
      this.handle?.dispose();
    });
  }
  async start(): Promise<void> {
    if (this.destroyRef.destroyed || this.status() === 'loading' || this.status() === 'ready')
      return;
    this.activated = true;
    this.handle?.dispose();
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    this.status.set('loading');
    try {
      const { mountCardViewer } = await this.loadRuntime();
      if (controller.signal.aborted || this.destroyRef.destroyed) return;
      const handle = await this.zone.runOutsideAngular(() =>
        mountCardViewer(this.stage().nativeElement, DEFAULT_CARD_MODEL, controller.signal, () => {
          if (!controller.signal.aborted && !this.destroyRef.destroyed) this.status.set('error');
        }, this.frontTexture()),
      );
      if (controller.signal.aborted || this.destroyRef.destroyed) {
        handle.dispose();
        return;
      }
      this.handle = handle;
      this.status.set('ready');
    } catch {
      if (!controller.signal.aborted && !this.destroyRef.destroyed) this.status.set('error');
    }
  }
  side(back: boolean): void {
    this.handle?.side(back);
  }
  rotate(horizontal: number, vertical = 0): void {
    this.handle?.rotate(horizontal, vertical);
  }
  zoom(closer: boolean): void {
    this.handle?.zoom(closer);
  }
  reset(): void {
    this.handle?.reset();
  }
  onKey(event: KeyboardEvent): void {
    if (event.target !== this.stage().nativeElement || this.status() !== 'ready') return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => this.rotate(-1),
      ArrowRight: () => this.rotate(1),
      ArrowUp: () => this.rotate(0, 1),
      ArrowDown: () => this.rotate(0, -1),
      '+': () => this.zoom(true),
      '=': () => this.zoom(true),
      '-': () => this.zoom(false),
      Home: () => this.reset(),
    };
    if (actions[event.key]) {
      event.preventDefault();
      actions[event.key]();
    }
  }
}
