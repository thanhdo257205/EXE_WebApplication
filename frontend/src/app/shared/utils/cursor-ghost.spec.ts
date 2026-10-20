import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CursorGhost } from './cursor-ghost';

class Preference extends EventTarget {
  constructor(public matches: boolean) { super(); }
  change(value: boolean) { this.matches = value; this.dispatchEvent(new Event('change')); }
}

describe('Cursor ghost rendering budget', () => {
  let ghost: CursorGhost;
  let frames: Map<number, FrameRequestCallback>, nextId: number;
  let reduced: Preference, fine: Preference, hidden: boolean;
  const context = { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), scale: vi.fn(), translate: vi.fn(), fill: vi.fn(), stroke: vi.fn(), drawImage: vi.fn() };
  const flush = () => {
    let count = 0;
    while (frames.size && count++ < 500) {
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(callback => callback(count * 16));
    }
    expect(frames.size).toBe(0);
  };
  const move = (x: number) => document.body.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: 100, bubbles: true }));
  beforeEach(() => {
    frames = new Map(); nextId = 0; hidden = false;
    reduced = new Preference(false); fine = new Preference(true);
    vi.stubGlobal('matchMedia', (query: string) => query.includes('reduced') ? reduced : fine);
    vi.stubGlobal('Path2D', class {});
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    ghost = new CursorGhost(document.body);
  });
  afterEach(() => { ghost.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('allocates only the viewport and avoids layout reads on body pointer input', () => {
    const canvas = document.querySelector<HTMLCanvasElement>('.cursor-ghost-canvas')!;
    expect(canvas.width).toBe(Math.round(window.innerWidth * Math.min(window.devicePixelRatio || 1, 2)));
    expect(canvas.height).toBe(Math.round(window.innerHeight * Math.min(window.devicePixelRatio || 1, 2)));
    const layout = vi.spyOn(document.body, 'getBoundingClientRect');
    move(100); move(400); flush();
    expect(layout).not.toHaveBeenCalled();
  });
  it('sleeps when idle and wakes once for pointer bursts', () => {
    flush();
    move(100); flush(); move(400);
    for (let n = 0; n < 40; n++) move(410 + n);
    expect(frames.size).toBe(1);
    flush(); expect(context.fill).toHaveBeenCalled();
    const draws = context.clearRect.mock.calls.length;
    expect(frames.size).toBe(0);
    move(600); expect(frames.size).toBe(1); flush();
    expect(context.clearRect.mock.calls.length).toBeGreaterThan(draws);
  });
  it('reuses blurred sprites across frames and clears only the previous painted region', () => {
    flush(); move(100); move(400); flush();
    const rasterizations = context.fill.mock.calls.length;
    expect(rasterizations).toBe(6);
    const draws = context.drawImage.mock.calls.length;
    move(500); flush();
    expect(context.fill).toHaveBeenCalledTimes(rasterizations);
    expect(context.drawImage.mock.calls.length).toBeGreaterThan(draws);
    expect(context.clearRect.mock.calls.length).toBeGreaterThan(0);
    expect(context.clearRect.mock.calls.every(([, , width, height]) =>
      width * height < window.innerWidth * window.innerHeight)).toBe(true);
  });
  it('rebuilds sprites at a new display density and after media teardown', () => {
    flush(); move(100); move(400); flush();
    const rasterizations = context.fill.mock.calls.length;
    vi.stubGlobal('devicePixelRatio', 2);
    window.dispatchEvent(new Event('resize'));
    move(600); flush();
    expect(context.fill.mock.calls.length).toBe(rasterizations + 6);
    reduced.change(true); reduced.change(false);
    move(100); move(400); flush();
    expect(context.fill.mock.calls.length).toBe(rasterizations + 12);
  });
  it('cancels rendering while hidden and resumes on fresh input', () => {
    flush(); move(100); move(500);
    hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(0);
    move(600); expect(frames.size).toBe(0);
    hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    move(700); expect(frames.size).toBe(1); flush();
  });
  it('removes the overlay for reduced motion and cleans up queued frames/listeners', () => {
    move(100); move(500); reduced.change(true);
    expect(document.querySelector('.cursor-ghost-canvas')).toBeNull();
    expect(frames.size).toBe(0);
    reduced.change(false); expect(document.querySelectorAll('.cursor-ghost-canvas').length).toBe(1);
    ghost.destroy(); move(700); reduced.change(true); reduced.change(false);
    expect(frames.size).toBe(0);
    expect(document.querySelector('.cursor-ghost-canvas')).toBeNull();
  });
});
