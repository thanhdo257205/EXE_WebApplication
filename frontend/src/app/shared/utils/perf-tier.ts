/**
 * Tự hạ cấp hiệu ứng nặng khi thiết bị thật sự giật.
 * - Chỉ đo khung hình (rAF) trong lúc có tương tác/cuộn, nghỉ khi idle hoặc tab ẩn.
 * - Ngưỡng tính theo nhịp màn hình (p10 của khung) nên màn 30Hz/tiết kiệm pin không bị coi là yếu.
 * - Chỉ hạ, không tự nâng lại trong phiên; kết quả lưu sessionStorage.
 * - `?perf=1` hiển thị FPS và mức hiện tại để kiểm tra.
 */
export type PerfTier = 'high' | 'low';

export const PERF_TIER_EVENT = 'perf-tier-change';
const STORAGE_KEY = 'perf-tier';
const WINDOW_FRAMES = 60;
const WINDOW_MS = 1500; // máy rất chậm: đủ 10 khung trong 1,5s là đánh giá luôn
const WINDOW_MIN_FRAMES = 10;
const IDLE_MS = 1500;
const STRIKES_TO_DOWNGRADE = 2;
const JANK_FRACTION = 0.4;

/** Tỷ lệ khung chậm so với nhịp thường của màn hình; bỏ qua khoảng dừng >200ms (tab ẩn, nghẽn lớn). */
export function jankFraction(deltas: readonly number[]): number {
  const valid = deltas.filter(delta => delta > 0 && delta <= 200);
  if (valid.length < 2) return 0;
  const sorted = [...valid].sort((a, b) => a - b);
  const base = sorted[Math.floor(sorted.length * 0.1)];
  const threshold = Math.min(50, Math.max(24, base * 1.6)); // dưới ~20fps luôn tính là giật, kể cả khi máy chậm đều
  return valid.filter(delta => delta > threshold).length / valid.length;
}

function safeStorage<T>(read: () => T, fallback: T): T {
  try { return read(); } catch { return fallback; }
}

export function startPerfMonitor(root: HTMLElement = document.documentElement): () => void {
  if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') return () => undefined;

  const debug = new URLSearchParams(location.search).get('perf') === '1';
  let tier: PerfTier = 'high';
  let hud: HTMLElement | null = null;
  let raf = 0, last = 0, lastActivity = 0, running = false, strikes = 0, frames: number[] = [], lastFps = 0;

  const publish = () => {
    root.dataset['perf'] = tier;
    if (hud) hud.textContent = `perf: ${tier} · ${lastFps ? Math.round(lastFps) : '–'} fps`;
  };
  const setLow = () => {
    if (tier === 'low') return;
    tier = 'low';
    safeStorage(() => sessionStorage.setItem(STORAGE_KEY, 'low'), undefined);
    publish();
    window.dispatchEvent(new CustomEvent(PERF_TIER_EVENT, { detail: tier }));
    stop();
  };

  const tick = (now: number) => {
    raf = 0;
    if (!running) return;
    if (last) {
      frames.push(now - last);
      const total = frames.reduce((sum, delta) => sum + Math.min(delta, 200), 0);
      if (frames.length >= WINDOW_FRAMES || (total >= WINDOW_MS && frames.length >= WINDOW_MIN_FRAMES)) {
        lastFps = total ? (frames.length * 1000) / total : 0;
        strikes = jankFraction(frames) > JANK_FRACTION ? strikes + 1 : 0;
        frames = [];
        publish();
        if (strikes >= STRIKES_TO_DOWNGRADE) return setLow();
      }
    }
    last = now;
    if (document.hidden || now - lastActivity > IDLE_MS) return stop();
    raf = requestAnimationFrame(tick);
  };

  const stop = () => {
    running = false; last = 0; frames = [];
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  const wake = () => {
    if (tier === 'low' || document.hidden) return;
    lastActivity = performance.now();
    if (running) return;
    running = true; last = 0; frames = [];
    raf = requestAnimationFrame(tick);
  };

  if (safeStorage(() => sessionStorage.getItem(STORAGE_KEY), null) === 'low') tier = 'low';
  if (debug) {
    hud = document.createElement('div');
    hud.setAttribute('aria-hidden', 'true');
    hud.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;padding:4px 8px;border-radius:6px;font:12px/1.2 monospace;color:#fff;background:#000c;pointer-events:none';
    document.body.appendChild(hud);
  }
  publish();
  if (tier === 'low') return () => hud?.remove();

  const events = ['scroll', 'pointermove', 'wheel', 'touchmove', 'keydown'] as const;
  for (const name of events) window.addEventListener(name, wake, { passive: true });
  document.addEventListener('visibilitychange', wake);
  const startTimer = setTimeout(wake, 800);

  return () => {
    clearTimeout(startTimer);
    stop();
    for (const name of events) window.removeEventListener(name, wake);
    document.removeEventListener('visibilitychange', wake);
    hud?.remove();
  };
}
