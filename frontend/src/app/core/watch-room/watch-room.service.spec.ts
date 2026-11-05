import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WatchRoomService, WatchRoomInfo } from './watch-room.service';
import { AuthService } from '../auth/auth.service';

describe('WatchRoomService synchronized position calculations', () => {
  let service: WatchRoomService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        WatchRoomService,
        { provide: AuthService, useValue: {} },
      ],
    });
    service = TestBed.inject(WatchRoomService);
  });
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); vi.restoreAllMocks(); });

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
    expect(pos).toBeGreaterThanOrEqual(5);
    expect(pos).toBeLessThan(5.5);
  });

  it('advances from snapshot.serverTime, including skew, without counting startedAt twice', () => {
    vi.spyOn(Date, 'now').mockReturnValue(120000);
    service.serverClockOffsetMs.set(1000);
    service.playbackSnapshot.set({ status: 'PLAYING', position: 30, serverTime: 119000,
      startedAt: new Date(89000).toISOString(), countdownSeconds: null });
    expect(service.getSynchronizedTargetPosition()).toBe(32);
  });

  it('counts down and enters the main video at the scheduled server time without another join', () => {
    service.serverClockOffsetMs.set(2000);
    service.currentRoom.set({ mode: 'SCHEDULED', scheduledAt: new Date(110000).toISOString(), videoDuration: 60 } as WatchRoomInfo);
    service.playbackSnapshot.set({ status: 'LOBBY', position: 0, serverTime: 100000, countdownSeconds: 10, startedAt: null });
    expect(service.getLivePlaybackSnapshot(100000)?.countdownSeconds).toBe(8);
    expect(service.getLivePlaybackSnapshot(105000)?.countdownSeconds).toBe(3);
    expect(service.getLivePlaybackSnapshot(108000)).toMatchObject({ status: 'PLAYING', position: 0 });
    expect(service.getLivePlaybackSnapshot(110500)).toMatchObject({ status: 'PLAYING', position: 2.5 });
    expect(service.getLivePlaybackSnapshot(170000)).toMatchObject({ status: 'ENDED', position: 60 });
  });

  it('sends a host action only once over an open WebSocket', () => {
    const send = vi.fn();
    (service as any).ws = { readyState: WebSocket.OPEN, send };
    (service as any).currentRoomId = 'room-test';
    service.sendHostControl('PAUSE');
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][0]).action).toBe('PAUSE');
    TestBed.inject(HttpTestingController).expectNone('/api/v1/watch-rooms/room-test/control');
  });

  it('uses REST fallback when the socket is unavailable', () => {
    (service as any).currentRoomId = 'room-test';
    (service as any).currentHostToken = 'secret-test';
    service.sendHostControl('SEEK', 50);
    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/watch-rooms/room-test/control');
    expect(request.request.headers.get('X-Host-Token')).toBe('secret-test');
    request.flush({ ok: true, snapshot: { status: 'PAUSED', position: 50, serverTime: Date.now() } });
    expect(service.playbackSnapshot()?.position).toBe(50);
  });
});
