import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  signal,
} from '@angular/core';
import { DanmakuItem } from '../../core/watch-room/watch-room.service';

/** Seconds a bullet takes to cross the player, whatever its length (fixed-duration scrolling, as on Bilibili). */
export const DANMAKU_DURATION_S = 9;
/** Empty space kept between two bullets in the same lane, in px. */
const LANE_GAP_PX = 24;
/** Fallback player width before the first measurement (and in unit tests). */
const DEFAULT_WIDTH_PX = 960;

interface ActiveBullet {
  id: string;
  text: string;
  color: string;
  lane: number;
  topPercent: number;
  /** Total travel in px: player width + text width, so speed is (cw + w) / duration. */
  travel: number;
}

/** What a lane remembers about its last bullet. */
export interface LaneState {
  startMs: number;
  width: number;
  containerWidth: number;
}

/**
 * Earliest time a new bullet of `width` can enter a lane without overlapping the previous one.
 * With a fixed duration D, a bullet of width w moves at v = (cw + w) / D.
 *  1. The previous bullet's tail (plus a gap) must have entered the screen:
 *     t >= start + (w_prev + gap) / v_prev
 *  2. The new bullet must not catch up with the previous one before it leaves on the left:
 *     its head reaches x = 0 at t + D * cw / (cw + w), which must be >= start + D,
 *     i.e. t >= start + D * w / (cw + w).
 */
export function laneReadyAt(lane: LaneState | undefined, width: number, containerWidth: number, durationMs: number): number {
  if (!lane) return 0;
  const prevSpeed = (lane.containerWidth + lane.width) / durationMs;
  const tailClear = lane.startMs + (lane.width + LANE_GAP_PX) / prevSpeed;
  const noCatchUp = lane.startMs + (durationMs * width) / (containerWidth + width);
  return Math.max(tailClear, noCatchUp);
}

/**
 * Picks the first lane (top first) that is free now; returns -1 when every lane is busy,
 * so a burst of comments is dropped from the screen instead of being drawn on top of each other
 * (they still appear in the chat list).
 */
export function pickDanmakuLane(lanes: (LaneState | undefined)[], nowMs: number, width: number, containerWidth: number, durationMs: number): number {
  for (let i = 0; i < lanes.length; i++) {
    if (nowMs >= laneReadyAt(lanes[i], width, containerWidth, durationMs)) return i;
  }
  return -1;
}

let measureCanvas: HTMLCanvasElement | null = null;
function measureTextWidth(text: string, fontSize: number): number {
  try {
    measureCanvas ??= document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    if (ctx) {
      ctx.font = `700 ${fontSize}px "Be Vietnam Pro", system-ui, sans-serif`;
      return Math.ceil(ctx.measureText(text).width) + 8;
    }
  } catch {}
  return Math.ceil(Array.from(text).length * fontSize * 0.62) + 8;
}

@Component({
  selector: 'app-danmaku-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #container
      class="danmaku-container"
      [style.opacity]="enabled() ? opacity() : 0"
    >
      @for (bullet of activeBullets(); track bullet.id) {
        <div
          class="danmaku-bullet"
          [style.top.%]="bullet.topPercent"
          [style.color]="bullet.color"
          [style.font-size.px]="fontSize()"
          [style.--travel.px]="bullet.travel"
          [style.animation-duration.s]="durationS"
          (animationend)="removeBullet(bullet.id)"
        >{{ bullet.text }}</div>
      }
    </div>
  `,
  styles: [
    `
      .danmaku-container {
        position: absolute;
        inset: 0;
        z-index: 20;
        overflow: hidden;
        pointer-events: none;
        user-select: none;
        contain: strict;
      }
      /* Starts just past the right edge and moves by (player width + own width): constant, player-relative speed. */
      .danmaku-bullet {
        position: absolute;
        left: 100%;
        white-space: nowrap;
        font-family: 'Be Vietnam Pro', system-ui, sans-serif;
        font-weight: 700;
        line-height: 1.25;
        letter-spacing: 0.3px;
        will-change: transform;
        backface-visibility: hidden;
        transform: translate3d(0, 0, 0);
        animation-name: danmaku-fly;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
        text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
      }
      @keyframes danmaku-fly {
        from { transform: translate3d(0, 0, 0); }
        to { transform: translate3d(calc(var(--travel) * -1), 0, 0); }
      }
      @media (prefers-reduced-motion: reduce) {
        .danmaku-bullet { animation-timing-function: steps(18, end); }
      }
    `,
  ],
})
export class DanmakuOverlayComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() laneCount = 8;
  @ViewChild('container') containerRef?: ElementRef<HTMLDivElement>;

  readonly durationS = DANMAKU_DURATION_S;
  readonly enabled = signal<boolean>(true);
  readonly opacity = signal<number>(0.9);
  readonly fontSize = signal<number>(18);
  readonly activeBullets = signal<ActiveBullet[]>([]);

  private lanes: (LaneState | undefined)[] = [];
  private renderedDanmakuIds = new Set<string>();
  private containerWidth = DEFAULT_WIDTH_PX;
  private resizeObserver?: ResizeObserver;
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  ngOnInit() {
    this.lanes = new Array(this.laneCount).fill(undefined);
  }

  ngAfterViewInit() {
    const el = this.containerRef?.nativeElement;
    if (!el) return;
    this.containerWidth = el.clientWidth || DEFAULT_WIDTH_PX;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width;
        if (width) this.containerWidth = width;
      });
      this.resizeObserver.observe(el);
    }
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    for (const timer of this.cleanupTimers.values()) clearTimeout(timer);
    this.cleanupTimers.clear();
    this.activeBullets.set([]);
  }

  toggleEnabled(val?: boolean) {
    this.enabled.set(val !== undefined ? val : !this.enabled());
  }

  setOpacity(val: number) {
    this.opacity.set(Math.max(0.2, Math.min(1.0, val)));
  }

  setFontSize(px: number) {
    this.fontSize.set(px);
  }

  /** Fire a bullet into the overlay. Returns false when it was a duplicate or every lane was busy. */
  emitBullet(item: DanmakuItem): boolean {
    if (this.renderedDanmakuIds.has(item.id)) return false;
    this.renderedDanmakuIds.add(item.id);
    if (!this.enabled()) return false;

    const now = Date.now();
    const durationMs = DANMAKU_DURATION_S * 1000;
    const width = measureTextWidth(item.text, this.fontSize());
    const lane = pickDanmakuLane(this.lanes, now, width, this.containerWidth, durationMs);
    if (lane < 0) return false;
    this.lanes[lane] = { startMs: now, width, containerWidth: this.containerWidth };

    const bullet: ActiveBullet = {
      id: `${item.id}_${now}`,
      text: item.text,
      color: item.color || '#ffffff',
      lane,
      topPercent: (lane / this.laneCount) * 80 + 4,
      travel: this.containerWidth + width,
    };
    this.activeBullets.update((list) => [...list, bullet]);
    // animationend removes it; the timer is a fallback when the tab was hidden or animations are off.
    this.cleanupTimers.set(bullet.id, setTimeout(() => this.removeBullet(bullet.id), durationMs + 1000));
    return true;
  }

  removeBullet(id: string) {
    const timer = this.cleanupTimers.get(id);
    if (timer) clearTimeout(timer);
    this.cleanupTimers.delete(id);
    this.activeBullets.update((list) => (list.some((b) => b.id === id) ? list.filter((b) => b.id !== id) : list));
  }

  /** Fire stored (VIDEO-phase) comments whose film time matches currentTime. */
  checkHistoryTrigger(history: DanmakuItem[], currentTime: number) {
    for (const item of history) {
      if (item.phase === 'LOBBY') continue;
      if (Math.abs(item.timeOffset - currentTime) <= 0.45) {
        this.emitBullet(item);
      }
    }
  }

  resetRenderedHistory() {
    this.renderedDanmakuIds.clear();
  }
}
