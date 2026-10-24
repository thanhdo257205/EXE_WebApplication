/**
 * Hiệu ứng "liquid reveal" của prompt Lumora: con trỏ quét một vệt cọ mềm, vẽ ảnh màu lên trên ảnh nền đã làm nhạt;
 * vệt phai dần mỗi khung, đứng yên ~2 giây thì xóa hẳn và dừng vòng rAF. Bỏ qua trên màn cảm ứng và khi reduced motion.
 */
const BRUSH_PX = 143, DECAY = 0.016, IDLE_FRAMES = 120;

export function startLiquidReveal(container: HTMLElement, canvas: HTMLCanvasElement, src: string, signal: AbortSignal): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(pointer: coarse)').matches) return;
  const ctx = canvas.getContext('2d');
  const brush = document.createElement('canvas');
  const bctx = brush.getContext('2d');
  if (!ctx || !bctx) return;
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  let cover: HTMLCanvasElement | null = null;
  let dpr = 1, radius = 0, raf = 0, idle = IDLE_FRAMES, rectDirty = false;
  let rect = container.getBoundingClientRect();
  let points: [number, number][] = [];
  let last: [number, number] | null = null;

  const layout = () => {
    if (!image.naturalWidth) return;
    rect = container.getBoundingClientRect(); rectDirty = false;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    // Ảnh phủ kín khung (object-fit: cover) vẽ sẵn một lần ở đúng độ phân giải canvas.
    cover = document.createElement('canvas');
    cover.width = canvas.width; cover.height = canvas.height;
    const scale = Math.max(cover.width / image.naturalWidth, cover.height / image.naturalHeight);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    cover.getContext('2d')!.drawImage(image, (cover.width - w) / 2, (cover.height - h) / 2, w, h);
    radius = BRUSH_PX * dpr;
    brush.width = brush.height = Math.ceil(radius * 2);
  };
  const stamp = (x: number, y: number) => {
    const d = brush.width, c = d / 2;
    bctx.clearRect(0, 0, d, d);
    bctx.globalCompositeOperation = 'source-over';
    const gradient = bctx.createRadialGradient(c, c, 0, c, c, c);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,.82)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    bctx.fillStyle = gradient;
    bctx.fillRect(0, 0, d, d);
    bctx.globalCompositeOperation = 'source-in';
    bctx.drawImage(cover!, x - c, y - c, d, d, 0, 0, d, d);
    ctx.drawImage(brush, x - c, y - c);
  };
  const tick = () => {
    raf = 0;
    const drawing = points.length > 0;
    if (drawing) idle = 0;
    else if (++idle >= IDLE_FRAMES) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${drawing ? DECAY : Math.min(DECAY + idle * 0.004, 0.5)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    if (drawing) { points.forEach(([x, y]) => stamp(x, y)); points = []; }
    raf = requestAnimationFrame(tick);
  };
  const onMove = (event: PointerEvent) => {
    if (!cover || event.pointerType === 'touch') return;
    if (rectDirty) { rect = container.getBoundingClientRect(); rectDirty = false; }
    const x = (event.clientX - rect.left) * dpr, y = (event.clientY - rect.top) * dpr;
    if (x < -radius || y < -radius || x > canvas.width + radius || y > canvas.height + radius) { last = null; return; }
    if (last) {
      const dx = x - last[0], dy = y - last[1];
      const n = Math.min(Math.ceil(Math.hypot(dx, dy) / Math.max(radius * 0.3, 1)), 60);
      for (let i = 1; i <= n; i++) points.push([last[0] + (dx * i) / n, last[1] + (dy * i) / n]);
    } else points.push([x, y]);
    last = [x, y];
    if (!raf) raf = requestAnimationFrame(tick);
  };

  image.addEventListener('load', layout, { once: true, signal });
  const resize = new ResizeObserver(layout);
  resize.observe(container);
  addEventListener('pointermove', onMove, { passive: true, signal });
  addEventListener('scroll', () => { rectDirty = true; }, { passive: true, signal });
  signal.addEventListener('abort', () => { cancelAnimationFrame(raf); resize.disconnect(); });
}
