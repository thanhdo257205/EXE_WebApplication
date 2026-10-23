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
  let visible = true, raf = 0, ready = false, disposed = false, lastScroll = -1, rectDirty = false, lastFilter = '';
  // Vị trí đoạn ghim tính một lần khi đổi kích thước → mỗi khung chỉ đọc scrollY, không ép trình duyệt tính layout.
  let trackTop = 0, trackRange = 0;
  // Độ phân giải thích ứng: hạ từng nấc khi khung hình chậm, nâng lại khi dư sức (không đổi hiệu ứng, chỉ đổi số pixel).
  let quality = 1, lastFrame = 0, slow = 0, fast = 0;
  const start = performance.now();
  /** Ngân sách pixel nội bộ (MSAA 4×): màn rất lớn/DPR cao không vẽ quá ~3,6 triệu điểm ảnh. */
  const MAX_PIXELS = 3.6e6;
  const FRAME_MS = 1000 / 61; // màn 120/144 Hz vẫn vẽ ~60 khung/giây: chuyển động như nhau, GPU làm một nửa

  const resize = () => {
    rect = canvas.getBoundingClientRect(); rectDirty = false;
    const box = track.getBoundingClientRect();
    trackTop = box.top + scrollY; trackRange = box.height - innerHeight;
    const cap = low ? 1 : coarse ? 1.5 : 1.75;
    let dpr = Math.min(devicePixelRatio || 1, cap) * quality;
    const pixels = rect.width * rect.height * dpr * dpr;
    if (pixels > MAX_PIXELS) dpr *= Math.sqrt(MAX_PIXELS / pixels);
    renderer.resize(rect.width * dpr, rect.height * dpr);
  };
  const progress = () => (trackRange > 0 ? Math.min(1, Math.max(0, (scrollY - trackTop) / trackRange)) : 0);
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    if (rectDirty) { rect = canvas.getBoundingClientRect(); rectDirty = false; }
    pointer = [event.clientX / innerWidth - 0.5, event.clientY / innerHeight - 0.5];
    pointerPx = [event.clientX - rect.left, event.clientY - rect.top];
  };
  const adapt = (now: number) => {
    const dt = lastFrame ? now - lastFrame : 16;
    lastFrame = now;
    if (dt > 100) return; // tab vừa quay lại / cuộn giật một lần: bỏ qua
    if (dt > 24) { slow++; fast = 0; } else if (dt < 18) { fast++; slow = Math.max(0, slow - 1); }
    if (slow > 45 && quality > 0.55) { quality = Math.max(0.55, quality - 0.15); slow = 0; resize(); }
    else if (fast > 240 && quality < 1) { quality = Math.min(1, quality + 0.15); fast = 0; resize(); }
  };
  const onLeave = () => { pointer = null; pointerPx = null; };
  const onPerf = () => { low = document.documentElement.dataset['perf'] === 'low'; resize(); };
  const loop = (now: number) => {
    raf = 0;
    if (disposed || !visible || document.hidden) return;
    if (lastFrame && now - lastFrame < FRAME_MS - 2) { raf = requestAnimationFrame(loop); return; }
    adapt(now);
    const time = (now - start) / 1000;
    if (pending !== null && !scene.switching) { scene.setTheme(pending, time); pending = null; }
    const scroll = progress();
    if (Math.abs(scroll - lastScroll) > 0.0005) { track.style.setProperty('--p', scroll.toFixed(4)); track.toggleAttribute('data-open', scroll > 0.25); lastScroll = scroll; }
    const frame = scene.update({ time, pointer, pointerPx, scroll, width: rect.width, height: rect.height, particles: !low });
    renderer.render(frame, time);
    const filter = frame.blur > 0.3 ? `blur(${frame.blur.toFixed(1)}px)` : '';
    if (filter !== lastFilter) { canvas.style.filter = filter; lastFilter = filter; }
    if (!ready) { ready = true; options.onReady(); }
    raf = requestAnimationFrame(loop);
  };
  const wake = () => { if (!raf && visible && !document.hidden && !disposed) { lastFrame = 0; raf = requestAnimationFrame(loop); } };

  const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); wake(); });
  observer.observe(canvas);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resizeObserver.observe(track);
  addEventListener('pointermove', onPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  addEventListener('scroll', () => { rectDirty = true; }, { passive: true, signal });
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
