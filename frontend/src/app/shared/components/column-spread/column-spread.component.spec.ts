import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TEMPLATE from '../../motion/spread-columns.js';
import { ColumnSpreadComponent, DECORATIVE_CARDS, POKEMON_POSTER_NAMES, SPREAD_PARAMS, shuffleIndices, spreadRenderBudget } from './column-spread.component';

class Preference extends EventTarget {
  matches = false;
  change(value: boolean) { this.matches = value; this.dispatchEvent(new Event('change')); }
}

describe('spreadRenderBudget', () => {
  it('keeps the original DPR cap of 2 and no frame limit on capable devices', () => {
    expect(spreadRenderBudget(3, false, false)).toEqual({ dpr: 2, minFrameMs: 0 });
    expect(spreadRenderBudget(1.25, false, false)).toEqual({ dpr: 1.25, minFrameMs: 0 });
  });
  it('lowers the DPR cap to 1.5 on coarse pointers', () => {
    expect(spreadRenderBudget(3, true, false)).toEqual({ dpr: 1.5, minFrameMs: 0 });
    expect(spreadRenderBudget(1, true, false)).toEqual({ dpr: 1, minFrameMs: 0 });
  });
  it('uses DPR 1 and ~30fps when perf-tier is low, and tolerates a missing DPR', () => {
    expect(spreadRenderBudget(3, true, true)).toEqual({ dpr: 1, minFrameMs: 33 });
    expect(spreadRenderBudget(0, false, true)).toEqual({ dpr: 1, minFrameMs: 33 });
  });
});

describe('Column spread frame scheduling', () => {
  let fixture: ComponentFixture<ColumnSpreadComponent>;
  let frames: Map<number, FrameRequestCallback>, nextId: number;
  let intersect: IntersectionObserverCallback, resized: ResizeObserverCallback;
  let media: Preference, hidden: boolean;
  let images: { onload: (() => void) | null; onerror: (() => void) | null; src: string; decoding?: string; decode?: () => Promise<void> }[];
  let clear: ReturnType<typeof vi.fn>;
  const flush = (now = 100) => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now)); };
  const visibility = (value: boolean) => intersect([{ isIntersecting: value } as IntersectionObserverEntry], {} as IntersectionObserver);
  beforeEach(async () => {
    frames = new Map(); nextId = 0; images = []; hidden = false; media = new Preference(); clear = vi.fn();
    vi.spyOn(Math, 'random').mockReturnValue(.99999);
    vi.stubGlobal('matchMedia', () => media);
    // Angular also schedules a change-detection frame when ready changes.
    // Count only the canvas scheduler; fixture.detectChanges drives Angular here.
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++nextId;
      if (callback.name === 'tick') frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resized = callback; } observe() {} disconnect() {} });
    vi.stubGlobal('IntersectionObserver', class { constructor(callback: IntersectionObserverCallback) { intersect = callback; } observe() {} disconnect() {} });
    vi.stubGlobal('Image', class { onload = null; onerror = null; src = ''; decoding = 'auto'; constructor() { images.push(this); } });
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(784);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(441);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: clear, save() {}, restore() {}, setTransform() {}, fillRect() {},
    } as unknown as CanvasRenderingContext2D);
    // Simulate the supplied engine's own full clear, independently of the wrapper.
    vi.spyOn(TEMPLATE, 'render').mockImplementation(({ ctx, width, height }) => ctx.clearRect(0, 0, width, height));
    await TestBed.configureTestingModule({ imports: [ColumnSpreadComponent] }).compileComponents();
    fixture = TestBed.createComponent(ColumnSpreadComponent); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('uses DPR 1 and skips frames closer than ~30fps once perf-tier is low', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
    document.documentElement.dataset['perf'] = 'low';
    try {
      visibility(true); images.forEach(image => image.onload?.());
      flush(100);
      const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas.width).toBe(784);
      expect(TEMPLATE.render).toHaveBeenCalledTimes(1);
      flush(110); // 10ms later: bỏ khung
      expect(TEMPLATE.render).toHaveBeenCalledTimes(1);
      flush(140); // 40ms sau khung vẽ gần nhất: vẽ
      expect(TEMPLATE.render).toHaveBeenCalledTimes(2);
    } finally { delete document.documentElement.dataset['perf']; }
  });

  it('keeps drawing every frame and the DPR cap of 2 on capable devices', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3);
    visibility(true); images.forEach(image => image.onload?.());
    flush(100); flush(110); flush(120);
    expect(TEMPLATE.render).toHaveBeenCalledTimes(3);
    expect((fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement).width).toBe(1568);
  });

  it('configures Pokémon poster defaults in 12 slots with 9 unique sources and cardAspect auto', () => {
    expect(DECORATIVE_CARDS.length).toBe(12);
    expect(POKEMON_POSTER_NAMES.length).toBe(9);
    expect(new Set(DECORATIVE_CARDS).size).toBe(9);
    expect(DECORATIVE_CARDS.every(card => card.startsWith('/assets/cards/pokemon/') && card.endsWith('-poster.webp'))).toBe(true);
    expect(DECORATIVE_CARDS.some(card => card.endsWith('.svg'))).toBe(false);
    expect(SPREAD_PARAMS.cardAspect).toBe('auto');
    const still = fixture.nativeElement.querySelector('img.still') as HTMLImageElement;
    expect(still.getAttribute('loading')).toBe('lazy');
    expect(still.getAttribute('decoding')).toBe('async');
    expect(still.src).toContain(DECORATIVE_CARDS[0]);
  });

  it('defers image instantiation until visible, deduplicates 12 slots to 9 Image loaders, and coalesces into one frame', () => {
    expect(images.length).toBe(0);
    expect(frames.size).toBe(0);
    visibility(true);
    expect(images.length).toBe(9);
    expect(images.every(img => img.decoding === 'async')).toBe(true);
    images.forEach(image => image.onload?.());
    for (let i = 0; i < 20; i++) resized([], {} as ResizeObserver);
    expect(frames.size).toBe(1); flush();
    expect(TEMPLATE.render).toHaveBeenCalledOnce(); expect(clear).toHaveBeenCalledOnce();
    expect(frames.size).toBe(1);
    const assignedImages = vi.mocked(TEMPLATE.render).mock.calls.at(-1)![0].images;
    expect(assignedImages.length).toBe(12);
    // Assert multiset properties: all 9 unique loaded images are present, with exactly 3 appearing twice
    const counts = new Map<unknown, number>();
    assignedImages.forEach(img => counts.set(img, (counts.get(img) || 0) + 1));
    expect(counts.size).toBe(9);
    images.forEach(img => expect(counts.has(img)).toBe(true));
    const duplicates = Array.from(counts.values()).filter(count => count === 2);
    expect(duplicates.length).toBe(3);
    const singles = Array.from(counts.values()).filter(count => count === 1);
    expect(singles.length).toBe(6);
  });

  it('supports image.decode() when available, handles decode rejection gracefully without crashing', async () => {
    visibility(true);
    expect(images.length).toBe(9);
    // Attach decode mock to first image resolving, second image rejecting
    let resolveFirstDecode: () => void = () => {};
    images[0].decode = vi.fn().mockImplementation(() => new Promise<void>(resolve => { resolveFirstDecode = resolve; }));
    images[1].decode = vi.fn().mockRejectedValue(new Error('Decode failed'));

    images[0].onload?.();
    resolveFirstDecode();
    await Promise.resolve();

    images[1].onload?.();
    await vi.waitFor(() => {
      flush();
      const renderedImages = vi.mocked(TEMPLATE.render).mock.calls.at(-1)![0].images;
      // All decoded/assigned slots must be references to images[0] (either loaded directly or fallback)
      const populated = renderedImages.filter(img => img !== undefined);
      expect(populated.length).toBe(4);
      expect(populated.every(img => img === images[0])).toBe(true);
    });
  });

  it('handles onerror without retry loops and reuses first decoded image', () => {
    visibility(true);
    images[0].onload?.();
    images[1].onerror?.();
    flush();
    const renderedImages = vi.mocked(TEMPLATE.render).mock.calls.at(-1)![0].images;
    const populated = renderedImages.filter(img => img !== undefined);
    expect(populated.length).toBe(4);
    expect(populated.every(img => img === images[0])).toBe(true);
  });

  it('does not reset unchanged canvas dimensions and preserves the eight-second timeline', () => {
    visibility(true); flush(100);
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    const width = vi.spyOn(canvas, 'width', 'set'), height = vi.spyOn(canvas, 'height', 'set');
    resized([], {} as ResizeObserver); flush(116);
    expect(width).not.toHaveBeenCalled(); expect(height).not.toHaveBeenCalled();
    expect(vi.mocked(TEMPLATE.render).mock.calls.at(-1)![0].t).toBeCloseTo(.12 + .016 / 8);
  });

  it('stops offscreen/hidden and redraws new images once while paused', () => {
    visibility(true); flush();
    fixture.componentInstance.togglePause(); expect(frames.size).toBe(0);
    images.forEach(image => image.onload?.()); expect(frames.size).toBe(1); flush();
    expect(frames.size).toBe(0);
    const count = vi.mocked(TEMPLATE.render).mock.calls.length;
    visibility(false); resized([], {} as ResizeObserver); images[0].onload?.();
    expect(frames.size).toBe(0); expect(TEMPLATE.render).toHaveBeenCalledTimes(count);
    hidden = true; visibility(true); document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(0);
    hidden = false; document.dispatchEvent(new Event('visibilitychange')); flush();
    expect(TEMPLATE.render).toHaveBeenCalledTimes(count + 1); expect(frames.size).toBe(0);
  });

  it('keeps reduced motion static and cancels pending work on destruction', () => {
    visibility(true); flush(); media.change(true); flush();
    expect(vi.mocked(TEMPLATE.render).mock.calls.at(-1)![0].t).toBe(.12);
    expect(frames.size).toBe(0);
    media.change(false); expect(frames.size).toBe(1);
    fixture.destroy(); expect(frames.size).toBe(0);
    expect(images.every(image => image.onload === null && image.onerror === null)).toBe(true);
  });

  it('ignores a decode completion after destruction and defers hidden startup', async () => {
    hidden = true; visibility(true);
    expect(images).toHaveLength(0);
    hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    expect(images).toHaveLength(9);
    let complete!: () => void;
    const decoded = new Promise<void>(resolve => { complete = resolve; });
    images[0].decode = () => decoded;
    images[0].onload?.(); flush();
    const slots = vi.mocked(TEMPLATE.render).mock.calls.at(-1)![0].images;
    // Slots for images[0] should remain undefined since decode hasn't resolved
    // Filter by whether images[0] was placed
    expect(slots).not.toContain(images[0]);
    fixture.destroy(); complete(); await decoded; await Promise.resolve();
    expect(slots).not.toContain(images[0]); expect(frames.size).toBe(0);
  });

  describe('Random card order and per-cycle reshuffle', () => {
    it('shuffleIndices helper performs deterministic Fisher-Yates and guarantees different permutation', () => {
      // Deterministic pseudo-RNG returning fixed sequence
      let idx = 0;
      const values = [0.1, 0.5, 0.9, 0.2, 0.7];
      const deterministicRng = () => values[idx++ % values.length];

      const input = [0, 1, 2, 3, 4];
      const result = shuffleIndices(input, deterministicRng);
      expect(result).toHaveLength(5);
      expect(result.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
      expect(result).not.toEqual(input);

      // Identity RNG case (e.g. returning 0.9999 so j = i every time)
      const identityRng = () => 0.99999;
      const identityResult = shuffleIndices([0, 1, 2, 3], identityRng);
      expect(identityResult).toHaveLength(4);
      expect(identityResult.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
      // Must not match identity order
      expect(identityResult).not.toEqual([0, 1, 2, 3]);
      // 1-element rotate fallback: [1, 2, 3, 0]
      expect(identityResult).toEqual([1, 2, 3, 0]);
    });

    it('applies initial permutation on mount and keeps order stable during normal frames', () => {
      visibility(true);
      images.forEach(img => img.onload?.());
      flush(100);

      const renderCalls = vi.mocked(TEMPLATE.render).mock.calls;
      expect(renderCalls.length).toBeGreaterThan(0);
      const firstRenderImages = [...renderCalls.at(-1)![0].images];
      expect(firstRenderImages.map(img => img?.src)).toEqual([...DECORATIVE_CARDS.slice(1), DECORATIVE_CARDS[0]]);
      const randomCalls = vi.mocked(Math.random).mock.calls.length;

      // Tick several regular frames (e.g. 50ms each, well within 8s cycle)
      let currentTime = 100;
      for (let i = 0; i < 10; i++) {
        currentTime += 50;
        flush(currentTime);
        const currentRenderImages = renderCalls.at(-1)![0].images;
        // Verify order remains identical between normal frames (no mid-fan shuffle)
        expect(currentRenderImages).toEqual(firstRenderImages);
      }
      expect(Math.random).toHaveBeenCalledTimes(randomCalls);
    });

    it('reshuffles exactly once per completed 8s animation cycle when phase wraps', () => {
      visibility(true);
      images.forEach(img => img.onload?.());
      flush(1000);

      const renderCalls = vi.mocked(TEMPLATE.render).mock.calls;
      const cycle1Order = [...renderCalls.at(-1)![0].images];
      const randomCalls = vi.mocked(Math.random).mock.calls.length;

      // Step time forward until phase wraps (8s = 8000ms; dt capped at 50ms = 0.05s)
      // 160 steps of 50ms = 8000ms. Since t starts at 0.12, (1 - 0.12) * 8000ms = 7040ms needed for first wrap.
      let currentTime = 1000;
      // Advance ~150 frames to complete the cycle and wrap past t >= 1
      for (let i = 0; i < 150; i++) {
        currentTime += 50;
        flush(currentTime);
      }

      // After first wrap, card order must differ from cycle 1
      const cycle2Order = [...renderCalls.at(-1)![0].images];
      expect(cycle2Order).not.toEqual(cycle1Order);
      // But multiset of images must be exactly identical
      expect(cycle2Order.map(img => img?.src).sort()).toEqual(cycle1Order.map(img => img?.src).sort());
      expect(Math.random).toHaveBeenCalledTimes(randomCalls + 11);

      // Advance through a second full cycle (~165 frames of 50ms = ~8250ms)
      for (let i = 0; i < 165; i++) {
        currentTime += 50;
        flush(currentTime);
      }

      // After second wrap, card order must differ again
      const cycle3Order = [...renderCalls.at(-1)![0].images];
      expect(cycle3Order).not.toEqual(cycle2Order);
      expect(cycle3Order.map(img => img?.src).sort()).toEqual(cycle1Order.map(img => img?.src).sort());
      expect(Math.random).toHaveBeenCalledTimes(randomCalls + 22);
    });

    it('does not shuffle on pause, resize, visibility change, or media change', () => {
      visibility(true);
      images.forEach(img => img.onload?.());
      flush(100);

      const renderCalls = vi.mocked(TEMPLATE.render).mock.calls;
      const baselineOrder = [...renderCalls.at(-1)![0].images];

      // Resize
      resized([], {} as ResizeObserver);
      flush(110);
      expect([...renderCalls.at(-1)![0].images]).toEqual(baselineOrder);

      // Pause toggle
      fixture.componentInstance.togglePause();
      expect([...renderCalls.at(-1)![0].images]).toEqual(baselineOrder);

      // Unpause
      fixture.componentInstance.togglePause();
      flush(120);
      expect([...renderCalls.at(-1)![0].images]).toEqual(baselineOrder);

      // Visibility change (hidden then visible)
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      flush(130);
      expect([...renderCalls.at(-1)![0].images]).toEqual(baselineOrder);

      // Reduced motion toggle
      media.change(true);
      flush(140);
      expect([...renderCalls.at(-1)![0].images]).toEqual(baselineOrder);
      media.change(false);
      flush(150);
      expect([...renderCalls.at(-1)![0].images]).toEqual(baselineOrder);

      visibility(false); flush(10000);
      visibility(true); flush(20000);
      expect([...renderCalls.at(-1)![0].images]).toEqual(baselineOrder);
    });

    it('correctly maps late decoding images into shuffled slots and preserves multiset reuse', async () => {
      visibility(true);
      // Load 8 images immediately, hold the 9th image
      for (let i = 0; i < 8; i++) {
        images[i].onload?.();
      }
      flush(100);

      const renderCalls = vi.mocked(TEMPLATE.render).mock.calls;
      const initialImages = [...renderCalls.at(-1)![0].images];
      // 9th image was not yet loaded
      expect(initialImages).not.toContain(images[8]);

      // Decode may finish after the visible permutation has changed to a new cycle.
      let now = 100;
      for (let i = 0; i < 150; i++) { now += 50; flush(now); }
      const beforeLateDecode = [...renderCalls.at(-1)![0].images];

      // Now late load image[8]
      images[8].onload?.();
      flush(now + 50);

      const updatedImages = renderCalls.at(-1)![0].images;
      // image[8] must now appear in the display buffer without disturbing the other assigned images
      expect(updatedImages).toContain(images[8]);
      beforeLateDecode.forEach((image, index) => { if (image) expect(updatedImages[index]).toBe(image); });

      // Multiset count check: all 9 images present, total length 12
      const counts = new Map<unknown, number>();
      updatedImages.forEach(img => counts.set(img, (counts.get(img) || 0) + 1));
      expect(counts.size).toBe(9);
      for (let i = 0; i < 9; i++) {
        expect(counts.has(images[i])).toBe(true);
      }
    });
  });
});
