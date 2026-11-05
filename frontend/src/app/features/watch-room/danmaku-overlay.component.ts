import {
  Component,
  Input,
  OnDestroy,
  OnInit,
  signal,
  ElementRef,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DanmakuItem } from '../../core/watch-room/watch-room.service';

interface ActiveBullet {
  id: string;
  text: string;
  color: string;
  lane: number;
  duration: number; // in seconds
  topPercent: number;
}

@Component({
  selector: 'app-danmaku-overlay',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="danmaku-container absolute inset-0 pointer-events-none overflow-hidden select-none z-20"
      [style.opacity]="enabled() ? opacity() : 0"
    >
      @for (bullet of activeBullets(); track bullet.id) {
        <div
          class="danmaku-bullet absolute whitespace-nowrap font-bold will-change-transform font-sans"
          [style.top.%]="bullet.topPercent"
          [style.color]="bullet.color"
          [style.font-size.px]="fontSize()"
          [style.animation-duration.s]="bullet.duration"
        >
          {{ bullet.text }}
        </div>
      }
    </div>
  `,
  styles: [
    `
      .danmaku-bullet {
        right: 0;
        transform: translate3d(100%, 0, 0);
        animation-name: danmaku-fly;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
        text-shadow:
          -1px -1px 0 #000,
          1px -1px 0 #000,
          -1px 1px 0 #000,
          1px 1px 0 #000,
          0 2px 4px rgba(0, 0, 0, 0.85);
        letter-spacing: 0.5px;
      }

      @keyframes danmaku-fly {
        0% {
          transform: translate3d(100%, 0, 0);
        }
        100% {
          transform: translate3d(-150vw, 0, 0);
        }
      }
    `,
  ],
})
export class DanmakuOverlayComponent implements OnInit, OnDestroy {
  @Input() laneCount = 8;

  readonly enabled = signal<boolean>(true);
  readonly opacity = signal<number>(0.9);
  readonly fontSize = signal<number>(18);
  readonly activeBullets = signal<ActiveBullet[]>([]);

  private laneNextAvailable = new Array(8).fill(0);
  private renderedDanmakuIds = new Set<string>();

  ngOnInit() {
    this.laneNextAvailable = new Array(this.laneCount).fill(0);
  }

  ngOnDestroy() {
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

  /**
   * Fire a bullet into the overlay
   */
  emitBullet(item: DanmakuItem, duration = 6.0) {
    if (this.renderedDanmakuIds.has(item.id)) return;
    this.renderedDanmakuIds.add(item.id);

    const now = Date.now();
    const lane = this.pickLane(now, item.text.length);
    const topPercent = (lane / this.laneCount) * 80 + 5; // keep inside top 85% of screen

    const bullet: ActiveBullet = {
      id: `${item.id}_${now}_${Math.random()}`,
      text: item.text,
      color: item.color || '#ffffff',
      lane,
      duration,
      topPercent,
    };

    this.activeBullets.update((list) => [...list, bullet]);

    // Clean up bullet after it has crossed the screen
    setTimeout(() => {
      this.activeBullets.update((list) => list.filter((b) => b.id !== bullet.id));
    }, (duration + 0.5) * 1000);
  }

  /**
   * Check against historical danmaku list and fire those matching currentTime
   */
  checkHistoryTrigger(history: DanmakuItem[], currentTime: number) {
    for (const item of history) {
      if (Math.abs(item.timeOffset - currentTime) <= 0.45) {
        this.emitBullet(item);
      }
    }
  }

  resetRenderedHistory() {
    this.renderedDanmakuIds.clear();
  }

  private pickLane(nowMs: number, charCount: number): number {
    const clearanceMs = Math.max(1200, charCount * 45 + 800);

    for (let i = 0; i < this.laneCount; i++) {
      if (nowMs >= this.laneNextAvailable[i]) {
        this.laneNextAvailable[i] = nowMs + clearanceMs;
        return i;
      }
    }

    // fallback to earliest available
    let minIdx = 0;
    let minTime = this.laneNextAvailable[0];
    for (let i = 1; i < this.laneCount; i++) {
      if (this.laneNextAvailable[i] < minTime) {
        minTime = this.laneNextAvailable[i];
        minIdx = i;
      }
    }
    this.laneNextAvailable[minIdx] = Math.max(nowMs, minTime) + clearanceMs;
    return minIdx;
  }
}
