import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jankFraction, PERF_TIER_EVENT, startPerfMonitor } from './perf-tier';

describe('jankFraction', () => {
  it('coi 60fps đều là mượt', () => expect(jankFraction(Array(90).fill(16.7))).toBe(0));
  it('coi màn 30Hz đều là mượt (ngưỡng theo nhịp màn hình)', () => expect(jankFraction(Array(90).fill(33.3))).toBe(0));
  it('đếm khung chậm so với nhịp thường', () => {
    const deltas = [...Array(60).fill(16.7), ...Array(30).fill(60)];
    expect(jankFraction(deltas)).toBeCloseTo(1 / 3, 2);
  });
  it('bỏ khoảng dừng >200ms', () => expect(jankFraction([...Array(50).fill(16.7), 800, 900])).toBe(0));
  it('không đủ mẫu thì trả 0', () => expect(jankFraction([16])).toBe(0));
});

describe('startPerfMonitor', () => {
  let now = 0;
  let callbacks: FrameRequestCallback[] = [];
  beforeEach(() => {
    now = 0; callbacks = [];
    sessionStorage.clear();
    delete document.documentElement.dataset['perf'];
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => callbacks.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const run = (frames: number, step: number) => {
    for (let i = 0; i < frames; i++) {
      const cb = callbacks.shift();
      if (!cb) return;
      now += step;
      window.dispatchEvent(new Event('pointermove'));
      cb(now);
    }
  };

  it('giữ high khi mượt', () => {
    const stop = startPerfMonitor();
    window.dispatchEvent(new Event('pointermove'));
    run(400, 16.7);
    expect(document.documentElement.dataset['perf']).toBe('high');
    stop();
  });

  it('hạ xuống low sau 2 cửa sổ giật liên tiếp, phát sự kiện và lưu phiên', () => {
    const listener = vi.fn();
    window.addEventListener(PERF_TIER_EVENT, listener);
    const stop = startPerfMonitor();
    window.dispatchEvent(new Event('pointermove'));
    run(20, 16.7);
    run(400, 70);
    expect(document.documentElement.dataset['perf']).toBe('low');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('perf-tier')).toBe('low');
    window.removeEventListener(PERF_TIER_EVENT, listener);
    stop();
  });

  it('áp dụng ngay low đã lưu và không đo nữa', () => {
    sessionStorage.setItem('perf-tier', 'low');
    const stop = startPerfMonitor();
    expect(document.documentElement.dataset['perf']).toBe('low');
    window.dispatchEvent(new Event('pointermove'));
    expect(callbacks.length).toBe(0);
    stop();
  });
});
