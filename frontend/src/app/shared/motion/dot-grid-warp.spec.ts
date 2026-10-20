import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountDotGridWarp } from './dot-grid-warp';

class Preference extends EventTarget {
  constructor(public matches: boolean) { super(); }
  change(value: boolean) { this.matches = value; this.dispatchEvent(new Event('change')); }
}

describe('Dot grid bitmap and scheduler stability', () => {
  const originalHitTest = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
  let stop: () => void;
  let fine: Preference, reduced: Preference;
  let surface: HTMLElement;
  let top: number, now: number, nextId: number;
  let frames: Map<number, FrameRequestCallback>;
  let contexts: Map<HTMLCanvasElement, ReturnType<typeof makeContext>>;
  let widthSetter: ReturnType<typeof vi.spyOn>;
  const makeContext = () => ({
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), moveTo: vi.fn(), arc: vi.fn(), fill: vi.fn(), drawImage: vi.fn(),
  });
  const flush = () => {
    for (let n = 0; frames.size && n < 160; n++) {
      const pending = [...frames.values()]; frames.clear(); now += 16;
      pending.forEach(callback => callback(now));
    }
    expect(frames.size).toBe(0);
  };
  const field = () => document.querySelector<HTMLCanvasElement>('.dot-grid-warp')!;

  beforeEach(() => {
    top = 80; now = 0; nextId = 0; frames = new Map(); contexts = new Map();
    fine = new Preference(true); reduced = new Preference(false);
    vi.stubGlobal('matchMedia', (query: string) => query.includes('reduced-motion') ? reduced : fine);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 0, right: 1000, bottom: 900, width: 1000, height: 900, x: 0, y: 0, toJSON() {} }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function(this: HTMLCanvasElement) {
      const ctx = makeContext(); contexts.set(this, ctx); return ctx as unknown as CanvasRenderingContext2D;
    });
    widthSetter = vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set');
    surface = document.createElement('section'); document.body.append(surface);
    vi.spyOn(surface, 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top, right: 1000, bottom: top + 800, width: 1000, height: 800, x: 0, y: top, toJSON() {} }));
    stop = mountDotGridWarp(surface); flush();
  });
  afterEach(() => {
    stop(); surface.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    if (originalHitTest) Object.defineProperty(document, 'elementFromPoint', originalHitTest);
    else Reflect.deleteProperty(document, 'elementFromPoint');
  });

  it('does not reallocate a painted bitmap on same-size resize bursts', () => {
    const canvas = field(), ctx = contexts.get(canvas)!;
    const allocations = widthSetter.mock.calls.length, clears = ctx.clearRect.mock.calls.length;
    for (let i = 0; i < 30; i++) window.dispatchEvent(new Event('resize'));
    expect(frames.size).toBe(1);
    expect(ctx.clearRect).toHaveBeenCalledTimes(clears);
    flush();
    expect(field()).toBe(canvas);
    expect(widthSetter.mock.calls.length).toBe(allocations);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });
  it('retains the bitmap offscreen and repaints the same canvas when returning', () => {
    const canvas = field(), ctx = contexts.get(canvas)!;
    const clears = ctx.clearRect.mock.calls.length;
    top = -1000; window.dispatchEvent(new Event('scroll')); flush();
    expect(canvas.style.visibility).toBe('hidden');
    expect(ctx.clearRect).toHaveBeenCalledTimes(clears);
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 300 }));
    expect(frames.size).toBe(0);
    top = 80; window.dispatchEvent(new Event('scroll')); flush();
    expect(field()).toBe(canvas);
    expect(canvas.style.visibility).toBe('visible');
    expect(ctx.drawImage.mock.calls.length + ctx.fill.mock.calls.length).toBeGreaterThan(1);
  });
  it('ignores redundant preference events but tears down for reduced/coarse input', () => {
    const original = field();
    fine.change(true); reduced.change(false); flush();
    expect(field()).toBe(original);
    reduced.change(true); expect(field()).toBeNull();
    reduced.change(false); flush(); expect(field()).not.toBe(original);
    fine.change(false); expect(field()).toBeNull();
    stop(); fine.change(true); flush(); expect(field()).toBeNull();
  });
  it('limits moving draws to nearby rows/columns and restores the static field on blur', () => {
    const canvas = field(), ctx = contexts.get(canvas)!;
    ctx.arc.mockClear(); ctx.clearRect.mockClear(); ctx.drawImage.mockClear();
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 400 }));
    const pending = [...frames.values()]; frames.clear(); now += 16;
    pending.forEach(callback => callback(now));
    // The complete fixture contains over 1,000 dots; the patch needs under 400.
    expect(ctx.arc.mock.calls.length).toBeGreaterThan(0);
    expect(ctx.arc.mock.calls.length).toBeLessThan(400);
    expect(ctx.clearRect.mock.calls.every(([, , width, height]) => width * height < canvas.width * canvas.height)).toBe(true);
    flush();
    window.dispatchEvent(new Event('blur')); flush();
    expect(ctx.drawImage.mock.calls.some(args => args.length === 9)).toBe(true);
    expect(frames.size).toBe(0);
  });
  it('keeps patch coordinates finite and clipped near viewport edges', () => {
    const canvas = field(), ctx = contexts.get(canvas)!;
    ctx.clearRect.mockClear();
    for (const [clientX, clientY] of [[0, 80], [999, 899], [10, 400]]) {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY })); flush();
    }
    expect(ctx.clearRect.mock.calls.length).toBeGreaterThan(0);
    expect(ctx.clearRect.mock.calls.every(([left, top, width, height]) =>
      [left, top, width, height].every(Number.isFinite) && left >= 0 && top >= 0 &&
      width > 0 && height > 0 && left + width <= canvas.width && top + height <= canvas.height)).toBe(true);
  });
  it('coalesces pointer bursts into one frame and eventually returns to idle', () => {
    for (let i = 0; i < 100; i++) window.dispatchEvent(new MouseEvent('pointermove', { clientX: 350 + i, clientY: 350 }));
    expect(frames.size).toBe(1);
    flush();
    const ctx = contexts.get(field())!;
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.arc.mock.calls.every(args => args.every(Number.isFinite))).toBe(true);
    window.dispatchEvent(new Event('blur')); flush();
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(field().style.visibility).toBe('visible');
  });
});
