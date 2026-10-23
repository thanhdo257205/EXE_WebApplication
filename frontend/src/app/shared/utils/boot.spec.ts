import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOT_EVENT, runBoot, startSmoothScroll } from './boot';

const lenisState = vi.hoisted(() => ({ scrolling: false as false | 'smooth', rafCalls: 0, destroyed: false }));
vi.mock('lenis', () => ({
  default: class {
    get isScrolling() { return lenisState.scrolling; }
    raf() { lenisState.rafCalls++; }
    destroy() { lenisState.destroyed = true; }
  },
}));

describe('runBoot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.dataset['boot'] = 'pending';
    document.body.innerHTML = '<div id="boot-curtain"></div>';
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

  it('giữ màn mở trang rồi gỡ sau khi trượt lên', () => {
    const booted = vi.fn();
    window.addEventListener(BOOT_EVENT, booted);
    runBoot();
    expect(document.documentElement.dataset['boot']).toBe('pending');
    vi.advanceTimersByTime(2700);
    expect(document.documentElement.dataset['boot']).toBe('done');
    expect(document.getElementById('boot-curtain')).toBeNull();
  });

  it('thêm class leave khi bắt đầu trượt lên', () => {
    runBoot();
    vi.advanceTimersByTime(1200);
    expect(document.getElementById('boot-curtain')?.classList.contains('leave')).toBe(true);
  });

  it('đặt boot=done và phát sự kiện', () => {
    const booted = vi.fn();
    window.addEventListener(BOOT_EVENT, booted);
    runBoot();
    vi.advanceTimersByTime(2700);
    expect(booted).toHaveBeenCalledTimes(1);
    window.removeEventListener(BOOT_EVENT, booted);
  });

  it('reduced motion bỏ màn mở trang ngay', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    runBoot();
    expect(document.documentElement.dataset['boot']).toBe('done');
    expect(document.getElementById('boot-curtain')).toBeNull();
  });
});

describe('startSmoothScroll', () => {
  let frames: FrameRequestCallback[] = [];
  const flush = (n: number) => { for (let i = 0; i < n; i++) { const pending = frames; frames = []; pending.forEach(cb => cb(i * 16)); } };
  beforeEach(() => {
    frames = []; lenisState.scrolling = false; lenisState.rafCalls = 0; lenisState.destroyed = false;
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => { frames = []; });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('chỉ chạy vòng rAF khi đang cuộn rồi tự dừng, thức lại khi có wheel', async () => {
    const stop = await startSmoothScroll();
    flush(30);
    expect(frames).toHaveLength(0); // đã nghỉ sau ~12 khung đứng yên
    const idleCalls = lenisState.rafCalls;
    flush(30);
    expect(lenisState.rafCalls).toBe(idleCalls);
    lenisState.scrolling = 'smooth';
    window.dispatchEvent(new Event('wheel'));
    flush(20);
    expect(frames).toHaveLength(1); // còn cuộn thì còn chạy
    lenisState.scrolling = false;
    flush(20);
    expect(frames).toHaveLength(0);
    stop();
    expect(lenisState.destroyed).toBe(true);
  });
});
