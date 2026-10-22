import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TEMPLATE from '../../motion/spread-columns.js';
import { ColumnSpreadComponent, DECORATIVE_CARDS, POKEMON_POSTER_NAMES, SPREAD_PARAMS, pickSlots, shuffleIndices, SPREAD_SLOTS, spreadRenderBudget } from './column-spread.component';

class Preference extends EventTarget {
  matches = false;
  change(value: boolean) { this.matches = value; this.dispatchEvent(new Event('change')); }
}

describe('spreadRenderBudget', () => {
  it('caps DPR at 1.5 (poster sources are only 360px wide) with no frame limit on capable devices', () => {
    expect(spreadRenderBudget(3, false, false)).toEqual({ dpr: 1.5, minFrameMs: 0 });
    expect(spreadRenderBudget(1.25, false, false)).toEqual({ dpr: 1.25, minFrameMs: 0 });
  });
  it('lowers the DPR cap to 1.25 on coarse pointers', () => {
    expect(spreadRenderBudget(3, true, false)).toEqual({ dpr: 1.25, minFrameMs: 0 });
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

  it('draws at most ~30fps while the page is scrolling, then resumes every frame', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      visibility(true); images.forEach(image => image.onload?.());
      flush(100);
      const base = vi.mocked(TEMPLATE.render).mock.calls.length;
      window.dispatchEvent(new Event('scroll'));
      flush(110); // 10ms sau: bỏ khung
      expect(vi.mocked(TEMPLATE.render).mock.calls.length).toBe(base);
      flush(140); // 40ms sau: vẽ
      expect(vi.mocked(TEMPLATE.render).mock.calls.length).toBe(base + 1);
      vi.advanceTimersByTime(200); // hết cuộn
      flush(150); flush(160);
      expect(vi.mocked(TEMPLATE.render).mock.calls.length).toBe(base + 3);
    } finally { vi.useRealTimers(); }
  });

  it('keeps drawing every frame and the DPR cap of 1.5 on capable devices', () => {
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3);
    visibility(true); images.forEach(image => image.onload?.());
    flush(100); flush(110); flush(120);
    expect(TEMPLATE.render).toHaveBeenCalledTimes(3);
    expect((fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement).width).toBe(1176);
  });

  it('configures a pool of 9 unique Pokémon posters shown 6 at a time with cardAspect auto', () => {
    expect(DECORATIVE_CARDS.length).toBe(9);
    expect(SPREAD_SLOTS).toBe(6);
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

  it('defers image instantiation until visible, loads 9 Image loaders, draws only 6 distinct slots, and coalesces into one frame', () => {
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
    expect(assignedImages.length).toBe(6);
    // 6 distinct slots, all drawn from the 9 loaded images (no duplicates)
    expect(new Set(assignedImages).size).toBe(6);
    assignedImages.forEach(img => expect(images).toContain(img));
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
      expect(populated.length).toBe(2);
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
    expect(populated.length).toBe(2);
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

    it('pickSlots picks distinct pool indices and never repeats the previous ordered selection', () => {
      const picked = pickSlots(9, 6, () => 0.99999);
      expect(picked).toEqual([8, 0, 1, 2, 3, 4]);
      expect(new Set(picked).size).toBe(6);
      const again = pickSlots(9, 6, () => 0.99999, picked);
      expect(again).not.toEqual(picked);
      expect(again.slice().sort()).toEqual(picked.slice().sort());
      expect(pickSlots(3, 6, () => 0.5)).toHaveLength(3);
      expect(pickSlots(0, 6)).toEqual([]);
    });

    it('applies the initial random picks on mount and keeps them stable during normal frames', () => {
      visibility(true);
      images.forEach(img => img.onload?.());
      flush(100);

      const renderCalls = vi.mocked(TEMPLATE.render).mock.calls;
      const firstRenderImages = [...renderCalls.at(-1)![0].images];
      expect(firstRenderImages.map(img => img?.src)).toEqual([8, 0, 1, 2, 3, 4].map(i => DECORATIVE_CARDS[i]));
      const randomCalls = vi.mocked(Math.random).mock.calls.length;
      let currentTime = 100;
      for (let i = 0; i < 10; i++) {
        currentTime += 50;
        flush(currentTime);
        expect(renderCalls.at(-1)![0].images).toEqual(firstRenderImages);
      }
      expect(Math.random).toHaveBeenCalledTimes(randomCalls);
    });

    it('re-picks the 6 cards exactly once per completed 8s cycle when the phase wraps', () => {
      visibility(true);
      images.forEach(img => img.onload?.());
      flush(1000);
      const renderCalls = vi.mocked(TEMPLATE.render).mock.calls;
      const cycle1 = [...renderCalls.at(-1)![0].images];
      const randomCalls = vi.mocked(Math.random).mock.calls.length;
      let currentTime = 1000;
      for (let i = 0; i < 150; i++) { currentTime += 50; flush(currentTime); }
      const cycle2 = [...renderCalls.at(-1)![0].images];
      expect(cycle2).not.toEqual(cycle1);
      expect(cycle2).toHaveLength(6);
      expect(new Set(cycle2).size).toBe(6);
      expect(Math.random).toHaveBeenCalledTimes(randomCalls + 6);
      for (let i = 0; i < 165; i++) { currentTime += 50; flush(currentTime); }
      const cycle3 = [...renderCalls.at(-1)![0].images];
      expect(cycle3).not.toEqual(cycle2);
      expect(Math.random).toHaveBeenCalledTimes(randomCalls + 12);
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

    it('maps a late decoded image into its current slot without disturbing already assigned slots', () => {
      visibility(true);
      for (let i = 0; i < 8; i++) images[i].onload?.();
      flush(100);
      const renderCalls = vi.mocked(TEMPLATE.render).mock.calls;
      const before = [...renderCalls.at(-1)![0].images];
      // initial picks are pool indices [8,0,1,2,3,4]; image 8 is still loading
      expect(before[0]).toBeUndefined();
      images[8].onload?.();
      flush(150);
      const after = renderCalls.at(-1)![0].images;
      expect(after[0]).toBe(images[8]);
      before.forEach((image, index) => { if (image) expect(after[index]).toBe(image); });
      expect(new Set(after).size).toBe(6);
    });
  });
});
