import { HeroRenderer } from './hero-renderer';
import { HeroScene } from './hero-scene';
import { buildHeroTextures } from './hero-textures';

export interface HeroRuntimeOptions {
  canvas: HTMLCanvasElement;
  /** Phần tử dài bao quanh hero; tiến độ cuộn = phần đã cuộn qua / (chiều cao − 1 màn). */
  track: HTMLElement;
  theme: number;
  /** Gọi sau khung hình đầu tiên vẽ thành công. */
  onReady: () => void;
  signal: AbortSignal;
}

export interface HeroRuntime {
  setTheme(index: number): void;
  dispose(): void;
}

const PERF_EVENT = 'perf-tier-change';

/**
 * Khởi động cảnh hộp game: vẽ texture, tạo renderer, chạy vòng rAF. Tự dừng khi hero ra khỏi khung nhìn
 * hoặc tab ẩn; tự giảm độ phân giải/tắt hạt khi máy bị hạ cấp hiệu năng. Ném lỗi nếu không có WebGPU
 * (bên gọi giữ bản CSS dự phòng).
 */
export async function startHeroRuntime(options: HeroRuntimeOptions): Promise<HeroRuntime> {
  const { canvas, track, signal } = options;
  const art = await buildHeroTextures('/assets/images/can-nha-ban-dem.webp', signal);
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  const renderer = await HeroRenderer.create(canvas, art);
  if (signal.aborted) { renderer.dispose(); throw new DOMException('aborted', 'AbortError'); }

  const scene = new HeroScene();
  scene.jumpTheme(options.theme);
  const coarse = matchMedia('(pointer: coarse)').matches;
  let low = document.documentElement.dataset['perf'] === 'low';
  let pending: number | null = null;
  let pointer: [number, number] | null = null;
  let pointerPx: [number, number] | null = null;
  let rect = canvas.getBoundingClientRect();
  let visible = true, raf = 0, ready = false, disposed = false, lastScroll = -1;
  const start = performance.now();

  const resize = () => {
    rect = canvas.getBoundingClientRect();
    const cap = low ? 1 : coarse ? 1.5 : 1.75;
    const dpr = Math.min(devicePixelRatio || 1, cap);
    renderer.resize(rect.width * dpr, rect.height * dpr);
  };
  const progress = () => {
    const box = track.getBoundingClientRect();
    const range = box.height - innerHeight;
    return range > 0 ? Math.min(1, Math.max(0, -box.top / range)) : 0;
  };
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    pointer = [event.clientX / innerWidth - 0.5, event.clientY / innerHeight - 0.5];
    pointerPx = [event.clientX - rect.left, event.clientY - rect.top];
  };
  const onLeave = () => { pointer = null; pointerPx = null; };
  const onPerf = () => { low = document.documentElement.dataset['perf'] === 'low'; resize(); };
  const loop = () => {
    raf = 0;
    if (disposed || !visible || document.hidden) return;
    const time = (performance.now() - start) / 1000;
    if (pending !== null && !scene.switching) { scene.setTheme(pending, time); pending = null; }
    const scroll = progress();
    if (Math.abs(scroll - lastScroll) > 0.0005) { track.style.setProperty('--p', scroll.toFixed(4)); track.toggleAttribute('data-open', scroll > 0.25); lastScroll = scroll; }
    const frame = scene.update({ time, pointer, pointerPx, scroll, width: rect.width, height: rect.height, particles: !low });
    renderer.render(frame, time);
    canvas.style.filter = frame.blur > 0.3 ? `blur(${frame.blur.toFixed(1)}px)` : '';
    if (!ready) { ready = true; options.onReady(); }
    raf = requestAnimationFrame(loop);
  };
  const wake = () => { if (!raf && visible && !document.hidden && !disposed) raf = requestAnimationFrame(loop); };

  const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); wake(); });
  observer.observe(canvas);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  addEventListener('pointermove', onPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  addEventListener('scroll', () => { rect = canvas.getBoundingClientRect(); }, { passive: true, signal });
  addEventListener(PERF_EVENT, onPerf);
  document.addEventListener('visibilitychange', wake);
  resize();
  wake();
  void renderer.lost.then(() => { if (!disposed) canvas.dispatchEvent(new CustomEvent('hero-lost')); });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    observer.disconnect(); resizeObserver.disconnect();
    removeEventListener('pointermove', onPointer);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    removeEventListener(PERF_EVENT, onPerf);
    document.removeEventListener('visibilitychange', wake);
    renderer.dispose();
  };
  signal.addEventListener('abort', dispose);
  return {
    setTheme(index: number) {
      const time = (performance.now() - start) / 1000;
      if (scene.switching || !scene.setTheme(index, time)) pending = index === scene.activeTheme ? null : index;
    },
    dispose,
  };
}
