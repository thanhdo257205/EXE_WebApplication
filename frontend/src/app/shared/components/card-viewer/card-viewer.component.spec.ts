import { TestBed, ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_VIEWER_LOADER, CardViewerComponent } from './card-viewer.component';

const runtime = { mount: vi.fn() };

describe('Card viewer lifecycle', () => {
  let fixture: ComponentFixture<CardViewerComponent>;
  let intersect: IntersectionObserverCallback;
  let handle: {
    dispose: ReturnType<typeof vi.fn>;
    rotate: ReturnType<typeof vi.fn>;
    side: ReturnType<typeof vi.fn>;
    zoom: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
  };
  beforeEach(async () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersect = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    handle = { dispose: vi.fn(), rotate: vi.fn(), side: vi.fn(), zoom: vi.fn(), reset: vi.fn() };
    runtime.mount.mockReset().mockResolvedValue(handle);
    await TestBed.configureTestingModule({
      imports: [CardViewerComponent],
      providers: [
        { provide: CARD_VIEWER_LOADER, useValue: async () => ({ mountCardViewer: runtime.mount }) },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CardViewerComponent);
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    vi.unstubAllGlobals();
  });
  it('opts the viewer out of Lenis smooth scroll so wheel zoom does not scroll the page', () => {
    expect(fixture.nativeElement.querySelector('.viewer-panel')?.hasAttribute('data-lenis-prevent')).toBe(true);
  });
  it('waits for visibility, delegates controls, then aborts and disposes on navigation', async () => {
    expect(runtime.mount).not.toHaveBeenCalled();
    intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await vi.waitFor(() => expect(fixture.componentInstance.status()).toBe('ready'));
    fixture.detectChanges();
    const stage = fixture.nativeElement.querySelector('.viewer-stage') as HTMLElement;
    stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(handle.rotate).toHaveBeenCalledWith(1, 0);
    const abort = runtime.mount.mock.calls[0][2] as AbortSignal;
    fixture.destroy();
    expect(abort.aborted).toBe(true);
    expect(handle.dispose).toHaveBeenCalledOnce();
  });
  it('retains the poster and offers retry after a WebGL failure', async () => {
    runtime.mount.mockRejectedValueOnce(new Error('WebGL unavailable'));
    await fixture.componentInstance.start();
    fixture.detectChanges();
    expect(fixture.componentInstance.status()).toBe('error');
    expect(fixture.nativeElement.querySelector('.viewer-poster')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.viewer-controls button').disabled).toBe(true);
    await fixture.componentInstance.start();
    fixture.detectChanges();
    expect(fixture.componentInstance.status()).toBe('ready');
    expect(fixture.nativeElement.querySelector('.viewer-poster')).toBeNull();
  });
  it('disposes a model that finishes decoding after the viewer is destroyed', async () => {
    let finish!: (value: typeof handle) => void;
    runtime.mount.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const pending = fixture.componentInstance.start();
    await vi.waitFor(() => expect(runtime.mount).toHaveBeenCalled());
    fixture.destroy();
    finish(handle);
    await pending;
    expect(handle.dispose).toHaveBeenCalledOnce();
  });
  it('keeps the selected poster while waiting and forwards only its texture when visible', async () => {
    fixture.componentRef.setInput('poster', '/assets/cards/pokemon/charizard-poster.webp');
    fixture.componentRef.setInput('frontTexture', '/assets/cards/pokemon/charizard.webp');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.viewer-poster').getAttribute('src')).toBe('/assets/cards/pokemon/charizard-poster.webp');
    expect(runtime.mount).not.toHaveBeenCalled();
    intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await vi.waitFor(() => expect(fixture.componentInstance.status()).toBe('ready'));
    expect(runtime.mount.mock.calls[0][4]).toBe('/assets/cards/pokemon/charizard.webp');
  });
  it('aborts an old variant and disposes its late result when inputs change', async () => {
    let finish!: (value: typeof handle) => void;
    runtime.mount.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fixture.componentRef.setInput('frontTexture', '/assets/cards/pokemon/charizard.webp');
    fixture.detectChanges();
    const pending = fixture.componentInstance.start();
    await vi.waitFor(() => expect(runtime.mount).toHaveBeenCalledOnce());
    const oldSignal = runtime.mount.mock.calls[0][2] as AbortSignal;
    const nextHandle = { ...handle, dispose: vi.fn() };
    runtime.mount.mockResolvedValueOnce(nextHandle);
    fixture.componentRef.setInput('frontTexture', '/assets/cards/pokemon/blastoise.webp');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.status()).toBe('ready'));
    expect(oldSignal.aborted).toBe(true);
    expect(runtime.mount.mock.calls.at(-1)![4]).toBe('/assets/cards/pokemon/blastoise.webp');
    finish(handle); await pending;
    expect(handle.dispose).toHaveBeenCalledOnce();
    expect(nextHandle.dispose).not.toHaveBeenCalled();
  });
});
