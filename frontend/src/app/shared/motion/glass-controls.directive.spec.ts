import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountGlassControls } from './glass-controls.directive';

class Preference extends EventTarget {
  constructor(public matches: boolean) { super(); }
  change(value: boolean) { this.matches = value; this.dispatchEvent(new Event('change')); }
}

describe('Delegated glass controls', () => {
  let root: HTMLElement, button: HTMLButtonElement;
  let controller: ReturnType<typeof mountGlassControls>;
  let frames: Map<number, FrameRequestCallback>, nextId: number;
  let fine: Preference, reduced: Preference, opaque: Preference;
  let resized: ResizeObserverCallback;
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(16)); };
  const move = (element: Element, x = 50, y = 30) => element.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));
  const rect = () => ({ left: 10, top: 10, right: 110, bottom: 50, width: 100, height: 40 } as DOMRect);
  beforeEach(() => {
    frames = new Map(); nextId = 0; fine = new Preference(true); reduced = new Preference(false); opaque = new Preference(false);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal('matchMedia', (query: string) => query.includes('pointer: fine') ? fine : query.includes('reduced-motion') ? reduced : opaque);
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resized = callback; } observe() {} disconnect() {} });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    root = document.createElement('div'); root.innerHTML = '<button><span>Action</span></button>';
    document.body.append(root); button = root.querySelector('button')!;
    vi.spyOn(button, 'getBoundingClientRect').mockImplementation(rect);
    controller = mountGlassControls(root);
  });
  afterEach(() => { controller.destroy(); root.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('coalesces pointer bursts, caches the active rect and only writes changed values', () => {
    expect(frames.size).toBe(0);
    for (let i = 0; i < 100; i++) move(button.firstElementChild!, 60);
    expect(frames.size).toBe(1); flush();
    expect(button.getBoundingClientRect).toHaveBeenCalledOnce();
    expect(button.style.getPropertyValue('--control-glass-x')).toBe('50%');
    expect(button.hasAttribute('data-control-glass-active')).toBe(true);
    const writes = vi.spyOn(button.style, 'setProperty');
    move(button, 60); flush();
    expect(writes).not.toHaveBeenCalled(); expect(button.getBoundingClientRect).toHaveBeenCalledOnce();
    move(button, 80); flush();
    expect(button.getBoundingClientRect).toHaveBeenCalledOnce();
    resized([], {} as ResizeObserver); flush();
    expect(button.getBoundingClientRect).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('scroll')); flush();
    expect(button.getBoundingClientRect).toHaveBeenCalledTimes(3);
    expect(frames.size).toBe(0);
  });

  it('supports newly inserted controls while keeping only one enhanced control', () => {
    move(button); flush();
    const second = document.createElement('button'); second.textContent = 'Dynamic'; root.append(second);
    vi.spyOn(second, 'getBoundingClientRect').mockImplementation(rect);
    move(second); flush();
    expect(button.hasAttribute('data-control-glass-active')).toBe(false);
    expect(button.style.getPropertyValue('--control-glass-x')).toBe('');
    expect(root.querySelectorAll('[data-control-glass-active]')).toHaveLength(1);
    second.disabled = true; move(second); flush();
    expect(root.querySelectorAll('[data-control-glass-active]')).toHaveLength(0);
    second.disabled = false; second.setAttribute('aria-disabled', 'true'); move(second);
    expect(frames.size).toBe(0);
  });

  it('does not intercept clicks, text links, keyboard focus or existing optical navigation', () => {
    const click = vi.fn(); button.addEventListener('click', click);
    button.click(); expect(click).toHaveBeenCalledOnce();
    root.insertAdjacentHTML('beforeend', '<a href="#">Text link</a><nav appLiquidGlass><button>Menu</button></nav><button appLiquidGlass>Existing</button>');
    for (const element of root.querySelectorAll('a, nav button, button[appLiquidGlass]')) move(element);
    expect(frames.size).toBe(0);
    move(button); flush(); button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(button.hasAttribute('data-control-glass-active')).toBe(false);
    expect(frames.size).toBe(0);
  });

  it('respects coarse/reduced/opaque modes, tab visibility, detached nodes and teardown', () => {
    move(button); flush(); reduced.change(true); move(button); expect(frames.size).toBe(0);
    reduced.change(false); fine.change(false); move(button); expect(frames.size).toBe(0);
    fine.change(true); opaque.change(true); move(button); expect(frames.size).toBe(0);
    opaque.change(false); move(button); expect(frames.size).toBe(1);
    document.dispatchEvent(new Event('visibilitychange')); expect(frames.size).toBe(0);
    move(button); button.remove(); flush();
    expect(button.hasAttribute('data-control-glass-active')).toBe(false);
    root.append(button); move(button); controller.destroy(); flush();
    move(button); window.dispatchEvent(new Event('resize'));
    expect(frames.size).toBe(0); expect(button.style.getPropertyValue('--control-glass-x')).toBe('');
  });
});
