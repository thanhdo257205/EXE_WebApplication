/** Màn mở trang và cuộn mượt. Curtain nằm sẵn trong index.html; `data-boot` trên <html> cho các reveal biết khi nào được chạy. */
export const BOOT_EVENT = 'app-booted';
const MIN_VISIBLE_MS = 1100;
const MAX_VISIBLE_MS = 2600;
const EXIT_MS = 850;

export function runBoot(root: HTMLElement = document.documentElement): void {
  const done = () => { root.dataset['boot'] = 'done'; window.dispatchEvent(new Event(BOOT_EVENT)); };
  const curtain = document.getElementById('boot-curtain');
  if (!curtain || root.dataset['boot'] === 'done') return done();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { curtain.remove(); return done(); }

  let finished = false;
  const leave = () => {
    if (finished) return;
    finished = true;
    done();
    curtain.classList.add('leave');
    setTimeout(() => curtain.remove(), EXIT_MS + 50);
  };
  const waitMin = Math.max(0, MIN_VISIBLE_MS - performance.now());
  const afterLoad = () => setTimeout(leave, waitMin);
  if (document.readyState === 'complete') afterLoad(); else window.addEventListener('load', afterLoad, { once: true });
  setTimeout(leave, Math.max(0, MAX_VISIBLE_MS - performance.now()));
}

export type StopSmoothScroll = () => void;

/** Lenis nạp trễ để không nằm trong bundle đầu. Trả hàm dừng; bỏ qua khi reduced motion. */
export async function startSmoothScroll(): Promise<StopSmoothScroll> {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => undefined;
  const { default: Lenis } = await import('lenis');
  // Không dùng autoRaf (chạy 60 khung/giây cả khi trang đứng yên): chỉ chạy vòng rAF khi có thao tác cuộn,
  // tự dừng sau vài khung đứng yên.
  const lenis = new Lenis({ duration: 1.1, anchors: true, autoRaf: false });
  let raf = 0, still = 0;
  const tick = (time: number) => {
    lenis.raf(time);
    still = lenis.isScrolling ? 0 : still + 1;
    raf = still > 12 ? 0 : requestAnimationFrame(tick);
  };
  const wake = () => { still = 0; if (!raf) raf = requestAnimationFrame(tick); };
  const events = ['wheel', 'touchstart', 'keydown', 'pointerdown', 'scroll', 'click'] as const;
  events.forEach(type => addEventListener(type, wake, { passive: true, capture: true }));
  wake();
  return () => {
    cancelAnimationFrame(raf);
    events.forEach(type => removeEventListener(type, wake, { capture: true }));
    lenis.destroy();
  };
}
