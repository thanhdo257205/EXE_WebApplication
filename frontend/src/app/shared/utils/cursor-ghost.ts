/**
 * CursorGhost - Hiệu ứng Motion Smear Cursor Trail
 * Vanilla TypeScript/JavaScript + CSS, không phụ thuộc thư viện bên ngoài.
 *
 * Tiêu chuẩn tiếp cận (Accessibility):
 * - Không ẩn con trỏ chuột gốc (giữ nguyên con trỏ hệ thống và trạng thái pointer/text).
 * - Canvas overlay có pointer-events: none, aria-hidden="true".
 * - Tự động tắt khi người dùng bật `prefers-reduced-motion: reduce` hoặc trên thiết bị cảm ứng (touch).
 * - Tự động biến mất hoàn toàn khi con trỏ đứng yên.
 */

export interface CursorGhostOptions {
  ghosts?: number;          // Số lượng bản sao (mặc định: 6)
  size?: number;            // Kích thước con trỏ px (mặc định: 22)
  headFollow?: number;      // Tỷ lệ lerp con trỏ đầu đàn (mặc định: 0.42)
  smear?: number;           // Độ nhòe tối đa px (mặc định: 5)
  color?: string;           // Màu con trỏ (mặc định: #FFFFFF)
  interactiveTint?: string; // Đổi màu nhẹ khi hover a, button, input (mặc định: #60a5fa)
}

interface GhostNode {
  x: number;
  y: number;
  followRate: number;
}

export class CursorGhost {
  private container: HTMLElement;
  private isBody: boolean;
  private options: Required<CursorGhostOptions>;
  private ghosts: GhostNode[] = [];

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private arrowPath: Path2D | null = null;
  private sprites = new Map<string, { canvas: HTMLCanvasElement; padding: number; extent: number }>();
  private painted: { left: number; top: number; right: number; bottom: number } | null = null;

  private clearPainted(): void {
    if (!this.ctx || !this.painted) return;
    const box = this.painted;
    this.ctx.clearRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
    this.painted = null;
  }

  private sprite(index: number, color: string) {
    const key = `${index}:${color}`;
    const cached = this.sprites.get(key);
    if (cached) return cached;
    const scale = this.options.size / 24;
    const blur = ((index + 1) / this.options.ghosts) * this.options.smear;
    const padding = Math.ceil(Math.max(blur * Math.max(1, scale) * 4, 3) + 4);
    const extent = Math.ceil(this.options.size + padding * 2);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.ceil(extent * this.dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx || !this.arrowPath) return null;
    ctx.scale(this.dpr, this.dpr);
    ctx.translate(padding, padding);
    ctx.scale(scale, scale);
    ctx.filter = `blur(${blur.toFixed(1)}px)`;
    ctx.fillStyle = color;
    ctx.fill(this.arrowPath);
    // A sharp dark rim stays visible on lime/paper; the light fill works on dark surfaces.
    // Rasterize both tones once, without reading background pixels during pointer input.
    ctx.filter = `blur(${Math.min(blur, .4).toFixed(1)}px)`;
    ctx.strokeStyle = '#10232d';
    ctx.lineWidth = 1.25 / scale;
    ctx.stroke(this.arrowPath);
    const result = { canvas, padding, extent: canvas.width / this.dpr };
    this.sprites.set(key, result);
    return result;
  }

  private target = { x: 0, y: 0 };
  private pointer = { x: 0, y: 0 };
  private isInside = false;
  private visibilityFade = 0;
  private isHoveringInteractive = false;
  private hasMoved = false;
  private isRunning = false;
  private rafId: number | null = null;
  private dpr = 1;
  private width = 0;
  private height = 0;

  private motionQuery: MediaQueryList | null = null;
  private pointerQuery: MediaQueryList | null = null;
  private onMediaChange: (() => void) | null = null;

  private onPointerMove: ((e: PointerEvent) => void) | null = null;
  private onPointerEnter: ((e: PointerEvent) => void) | null = null;
  private onPointerLeave: (() => void) | null = null;
  private onResize: (() => void) | null = null;
  private onVisibilityChange = () => {
    if (document.hidden) {
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
      this.rafId = null;
      this.handlePointerLeave();
      this.visibilityFade = 0;
      this.clearPainted();
    }
  };
  private readonly tick = () => { this.rafId = null; this.render(); };

  private schedule(): void {
    if (this.isRunning && this.rafId === null && !document.hidden) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  constructor(container: HTMLElement = document.body, options: CursorGhostOptions = {}) {
    this.container = container;
    this.isBody = container === document.body || container === document.documentElement;

    this.options = {
      ghosts: options.ghosts ?? 6,
      size: options.size ?? 22,
      headFollow: options.headFollow ?? 0.42,
      smear: options.smear ?? 5,
      color: options.color ?? '#FFFFFF',
      interactiveTint: options.interactiveTint ?? '#60a5fa'
    };

    // Khởi tạo mảng ghosts với hệ số lerp giảm dần (lagging harder)
    for (let i = 0; i < this.options.ghosts; i++) {
      this.ghosts.push({
        x: 0,
        y: 0,
        followRate: this.options.headFollow * Math.pow(0.84, i)
      });
    }

    if (typeof window !== 'undefined') {
      this.initAccessibilityGuards();
    }
  }

  private initAccessibilityGuards(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

    this.onMediaChange = () => {
      if (this.canRun()) {
        if (!this.canvas) this.mount();
      } else {
        if (this.canvas) this.unmount();
      }
    };

    this.motionQuery.addEventListener('change', this.onMediaChange);
    this.pointerQuery.addEventListener('change', this.onMediaChange);

    if (this.canRun()) {
      this.mount();
    }
  }

  private canRun(): boolean {
    return !this.motionQuery?.matches && !!this.pointerQuery?.matches;
  }

  public mount(): void {
    if (this.canvas || typeof document === 'undefined') return;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cursor-ghost-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');

    if (this.isBody) {
      this.canvas.style.position = 'fixed';
      this.canvas.style.top = '0';
      this.canvas.style.left = '0';
      this.canvas.style.width = '100vw';
      this.canvas.style.height = '100vh';
    } else {
      this.canvas.style.position = 'absolute';
      this.canvas.style.inset = '0';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
    }
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '99999';

    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // Vector con trỏ chuẩn
    this.arrowPath = new Path2D(
      'M 0,0 ' +
      'L 0,19.2 ' +
      'L 4.6,14.8 ' +
      'L 8.2,22.8 ' +
      'L 11.4,21.4 ' +
      'L 7.8,13.8 ' +
      'L 14.2,13.8 ' +
      'Z'
    );

    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerEnter = this.handlePointerEnter.bind(this);
    this.onPointerLeave = this.handlePointerLeave.bind(this);
    this.onResize = this.handleResize.bind(this);

    const targetEventEl = this.isBody ? window : this.container;
    targetEventEl.addEventListener('pointermove', this.onPointerMove as EventListener, { passive: true });
    targetEventEl.addEventListener('pointerenter', this.onPointerEnter as EventListener, { passive: true });
    targetEventEl.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('blur', this.onPointerLeave);

    this.handleResize();

    this.isRunning = true;
    this.schedule();
  }

  private handleResize(): void {
    if (!this.canvas) return;
    // A fixed overlay needs only the viewport, never the full document height.
    const rect = this.isBody ? null : this.container.getBoundingClientRect();
    this.width = rect?.width ?? window.innerWidth;
    this.height = rect?.height ?? window.innerHeight;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (dpr !== this.dpr) this.sprites.clear();
    this.dpr = dpr;
    const width = Math.round(this.width * this.dpr), height = Math.round(this.height * this.dpr);
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.schedule();
  }

  private handlePointerEnter(e: PointerEvent): void {
    const rect = this.isBody ? null : this.container.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;
    const x = this.isBody ? clientX : clientX - rect!.left;
    const y = this.isBody ? clientY : clientY - rect!.top;

    this.target.x = x;
    this.target.y = y;
    this.pointer.x = x;
    this.pointer.y = y;

    this.ghosts.forEach(g => {
      g.x = x;
      g.y = y;
    });

    this.isInside = true;
    this.hasMoved = true;
    this.visibilityFade = 1;
    this.schedule();
  }

  private handlePointerMove(e: PointerEvent): void {
    const rect = this.isBody ? null : this.container.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    if (!this.isBody) {
      const isOutside = (clientX < rect!.left || clientX > rect!.right || clientY < rect!.top || clientY > rect!.bottom);
      if (isOutside) {
        this.handlePointerLeave();
        return;
      }
    }

    const x = this.isBody ? clientX : clientX - rect!.left;
    const y = this.isBody ? clientY : clientY - rect!.top;

    if (!this.isInside || !this.hasMoved) {
      this.handlePointerEnter(e);
      return;
    }

    this.target.x = x;
    this.target.y = y;
    this.isInside = true;

    const elemUnder = e.target instanceof Element ? e.target : null;
    this.isHoveringInteractive = !!(elemUnder && elemUnder.closest('a, button, input'));
    this.schedule();
  }

  private handlePointerLeave(): void {
    this.isInside = false;
    this.isHoveringInteractive = false;
    this.schedule();
  }

  private render(): void {
    if (!this.isRunning || !this.ctx || !this.canvas || !this.arrowPath) return;

    const ctx = this.ctx;
    const { ghosts, size, color, interactiveTint } = this.options;

    if (this.isInside) {
      this.visibilityFade = Math.min(1, this.visibilityFade + 0.2);
    } else {
      this.visibilityFade = Math.max(0, this.visibilityFade - 0.2);
    }

    this.clearPainted();

    if (this.visibilityFade <= 0.001) {
      return;
    }

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this.pointer.x = this.target.x;
    this.pointer.y = this.target.y;

    let prevX = this.pointer.x;
    let prevY = this.pointer.y;

    for (let i = 0; i < ghosts; i++) {
      const g = this.ghosts[i];
      g.x += (prevX - g.x) * g.followRate;
      g.y += (prevY - g.y) * g.followRate;
      prevX = g.x;
      prevY = g.y;
    }

    // Snap the invisible tail to rest and stop scheduling until another input.
    const settled = this.ghosts.every(g => Math.hypot(g.x - this.target.x, g.y - this.target.y) < 0.05);
    if (settled) {
      this.ghosts.forEach(g => { g.x = this.target.x; g.y = this.target.y; });
      ctx.restore();
      return;
    }

    // Vẽ từ ghost xa nhất đến ghost gần nhất
    for (let i = ghosts - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      const dist = Math.hypot(g.x - this.pointer.x, g.y - this.pointer.y);

      // Triệt tiêu khi đứng yên: min(1, dist / (size * 0.5))
      const motionFade = Math.min(1, dist / (size * 0.5));
      if (motionFade <= 0.001) continue;

      const baseAlpha = (1 - (i / ghosts) * 0.65) * 0.45;
      const finalAlpha = baseAlpha * motionFade * this.visibilityFade;
      if (finalAlpha <= 0.001) continue;

      const sprite = this.sprite(i, this.isHoveringInteractive ? interactiveTint : color);
      if (!sprite) continue;
      ctx.globalAlpha = finalAlpha;
      const left = g.x - sprite.padding, top = g.y - sprite.padding;
      ctx.drawImage(sprite.canvas, left, top, sprite.extent, sprite.extent);
      // Track conservative device-pixel bounds, including subpixel sampling.
      const box = {
        left: Math.max(0, Math.floor(left * this.dpr) - 2),
        top: Math.max(0, Math.floor(top * this.dpr) - 2),
        right: Math.min(this.canvas.width, Math.ceil((left + sprite.extent) * this.dpr) + 2),
        bottom: Math.min(this.canvas.height, Math.ceil((top + sprite.extent) * this.dpr) + 2),
      };
      if (box.right > box.left && box.bottom > box.top) {
        if (this.painted) {
          this.painted.left = Math.min(this.painted.left, box.left);
          this.painted.top = Math.min(this.painted.top, box.top);
          this.painted.right = Math.max(this.painted.right, box.right);
          this.painted.bottom = Math.max(this.painted.bottom, box.bottom);
        } else this.painted = box;
      }
    }

    ctx.restore();

    this.schedule();
  }

  public unmount(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    const targetEventEl = this.isBody ? window : this.container;
    if (this.onPointerMove) targetEventEl.removeEventListener('pointermove', this.onPointerMove as EventListener);
    if (this.onPointerEnter) targetEventEl.removeEventListener('pointerenter', this.onPointerEnter as EventListener);
    if (this.onPointerLeave) targetEventEl.removeEventListener('pointerleave', this.onPointerLeave);
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.onPointerLeave) window.removeEventListener('blur', this.onPointerLeave);

    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.sprites.clear();
    this.painted = null;
    this.isInside = false;
    this.hasMoved = false;
    this.visibilityFade = 0;
  }

  public destroy(): void {
    this.unmount();
    if (this.motionQuery && this.onMediaChange) {
      this.motionQuery.removeEventListener('change', this.onMediaChange);
    }
    if (this.pointerQuery && this.onMediaChange) {
      this.pointerQuery.removeEventListener('change', this.onMediaChange);
    }
  }
}
