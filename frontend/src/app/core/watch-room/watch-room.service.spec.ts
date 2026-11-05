import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach } from 'vitest';
import { WatchRoomService } from './watch-room.service';
import { AuthService } from '../auth/auth.service';

describe('WatchRoomService synchronized position calculations', () => {
  let service: WatchRoomService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        WatchRoomService,
        { provide: AuthService, useValue: {} },
      ],
    });
    service = TestBed.inject(WatchRoomService);
  });

  it('calculates position 0 for LOBBY status', () => {
    (service as any).playbackSnapshot.set({
      status: 'LOBBY',
      position: 0,
      serverTime: 1000000,
      countdownSeconds: null,
      startedAt: null,
    });

    expect(service.getSynchronizedTargetPosition()).toBe(0);
  });

  it('preserves position for PAUSED or ENDED status', () => {
    (service as any).playbackSnapshot.set({
      status: 'PAUSED',
      position: 45.2,
      serverTime: 1000000,
      countdownSeconds: null,
      startedAt: null,
    });

    expect(service.getSynchronizedTargetPosition()).toBe(45.2);
  });

  it('calculates elapsed time considering server clock skew during PLAYING status', () => {
    const now = Date.now();
    const startedMs = now - 10000; // started 10s ago
    (service as any).serverClockOffsetMs.set(0);
    (service as any).playbackSnapshot.set({
      status: 'PLAYING',
      position: 5.0,
      serverTime: now,
      countdownSeconds: null,
      startedAt: new Date(startedMs).toISOString(),
    });

    const pos = service.getSynchronizedTargetPosition();
    expect(pos).toBeGreaterThanOrEqual(14.8);
    expect(pos).toBeLessThanOrEqual(15.5);
  });
});
