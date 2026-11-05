import { describe, expect, it } from 'vitest';
import { DANMAKU_DURATION_S, DanmakuOverlayComponent, LaneState, laneReadyAt, pickDanmakuLane } from './danmaku-overlay.component';

const D = DANMAKU_DURATION_S * 1000;
const CW = 960;

/** x position (left edge, px from the player's left) of a bullet at time t. */
function headX(lane: LaneState, t: number) {
  const speed = (lane.containerWidth + lane.width) / D;
  return lane.containerWidth - speed * (t - lane.startMs);
}

describe('danmaku lanes', () => {
  it('moves at player-relative speed: a 940px player is crossed in the fixed duration, not 150vw', () => {
    const overlay = new DanmakuOverlayComponent();
    overlay.ngOnInit();
    overlay.emitBullet({ id: 'a', nickname: 'x', text: 'xin chào', timeOffset: 0, color: '#fff', createdAt: '' });
    const [bullet] = overlay.activeBullets();
    expect(bullet.travel).toBeGreaterThan(960);
    expect(bullet.travel).toBeLessThan(960 + 200);
    // ~(960 + ~100) / 9 s ≈ 118 px/s, versus ~360 px/s before.
    expect(bullet.travel / DANMAKU_DURATION_S).toBeLessThan(140);
    overlay.ngOnDestroy();
  });

  it('a free lane is ready immediately; a busy lane waits for the tail plus a gap', () => {
    expect(laneReadyAt(undefined, 100, CW, D)).toBe(0);
    const lane: LaneState = { startMs: 1000, width: 200, containerWidth: CW };
    const ready = laneReadyAt(lane, 100, CW, D);
    const speed = (CW + 200) / D;
    expect(ready).toBeGreaterThanOrEqual(1000 + (200 + 24) / speed - 1e-6);
  });

  it('never lets a later, longer (faster) bullet overlap the previous one in the same lane', () => {
    // Simulate a burst of bullets of random widths and check every pair sharing a lane.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const lanes: (LaneState | undefined)[] = new Array(8).fill(undefined);
    const placed: LaneState[][] = Array.from({ length: 8 }, () => []);
    let dropped = 0;
    for (let i = 0; i < 400; i++) {
      const now = i * 120;
      const width = 40 + Math.floor(rand() * 600);
      const lane = pickDanmakuLane(lanes, now, width, CW, D);
      if (lane < 0) { dropped++; continue; }
      lanes[lane] = { startMs: now, width, containerWidth: CW };
      placed[lane].push(lanes[lane]!);
    }
    expect(dropped).toBeGreaterThan(0); // bursts beyond capacity are dropped, not stacked
    for (const list of placed) {
      for (let k = 1; k < list.length; k++) {
        const prev = list[k - 1], next = list[k];
        for (let t = next.startMs; t <= prev.startMs + D; t += 50) {
          const prevTail = headX(prev, t) + prev.width;
          expect(headX(next, t)).toBeGreaterThanOrEqual(prevTail - 1e-6);
        }
      }
    }
  });

  it('drops a duplicate id and does not draw while hidden', () => {
    const overlay = new DanmakuOverlayComponent();
    overlay.ngOnInit();
    const item = { id: 'dup', nickname: 'x', text: 'một', timeOffset: 0, color: '#fff', createdAt: '' };
    expect(overlay.emitBullet(item)).toBe(true);
    expect(overlay.emitBullet(item)).toBe(false);
    overlay.toggleEnabled(false);
    expect(overlay.emitBullet({ ...item, id: 'hidden' })).toBe(false);
    expect(overlay.activeBullets().length).toBe(1);
    overlay.removeBullet(overlay.activeBullets()[0].id);
    expect(overlay.activeBullets().length).toBe(0);
    overlay.ngOnDestroy();
  });
});
