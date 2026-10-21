import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TEMPLATE from '../../motion/spread-columns.js';
import { ColumnSpreadComponent } from './column-spread.component';

class Preference extends EventTarget {
  matches = false;
  change(value: boolean) { this.matches = value; this.dispatchEvent(new Event('change')); }
}

describe('Column spread frame scheduling', () => {
  let fixture: ComponentFixture<ColumnSpreadComponent>;
  let frames: Map<number, FrameRequestCallback>, nextId: number;
  let intersect: IntersectionObserverCallback, resized: ResizeObserverCallback;
  let media: Preference, hidden: boolean;
  let images: { onload: (() => void) | null; onerror: (() => void) | null; src: string }[];
  let clear: ReturnType<typeof vi.fn>;
  const flush = (now = 100) => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now)); };
  const visibility = (value: boolean) => intersect([{ isIntersecting: value } as IntersectionObserverEntry], {} as IntersectionObserver);
  beforeEach(async () => {
    frames = new Map(); nextId = 0; images = []; hidden = false; media = new Preference(); clear = vi.fn();
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
    vi.stubGlobal('Image', class { onload = null; onerror = null; src = ''; constructor() { images.push(this); } });
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

  it('defers offscreen work and coalesces image loads and resize bursts into one frame', () => {
    images.forEach(image => image.onload?.());
    expect(frames.size).toBe(0); expect(TEMPLATE.render).not.toHaveBeenCalled();
    visibility(true);
    for (let i = 0; i < 20; i++) resized([], {} as ResizeObserver);
    expect(frames.size).toBe(1); flush();
    expect(TEMPLATE.render).toHaveBeenCalledOnce(); expect(clear).toHaveBeenCalledOnce();
    expect(frames.size).toBe(1);
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
});
