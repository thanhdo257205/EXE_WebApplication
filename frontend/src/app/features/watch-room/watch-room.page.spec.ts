import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, Subject } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WatchRoomPage } from './watch-room.page';
import { WatchRoomService, WatchRoomInfo, DanmakuItem, PlaybackSnapshot } from '../../core/watch-room/watch-room.service';
import { AuthService } from '../../core/auth/auth.service';
import { signal } from '@angular/core';

describe('WatchRoomPage', () => {
  let fixture: ComponentFixture<WatchRoomPage>;
  let component: WatchRoomPage;

  const mockRoom: WatchRoomInfo = {
    id: 'room_test123',
    title: 'Phim Hoạt Hình Test',
    mode: 'HOST_TRIGGER',
    scheduledAt: null,
    videoDuration: 600,
    status: 'LOBBY',
    streamUrl: 'https://example.com/test.mp4',
    snapshot: {
      status: 'LOBBY',
      position: 0,
      serverTime: Date.now(),
      countdownSeconds: null,
      startedAt: null,
    },
    viewerCount: 5,
    isHost: true,
    hostToken: 'host_secret_123',
  };

  const newDanmaku$ = new Subject<DanmakuItem>();
  const deletedDanmaku$ = new Subject<string>();
  const playbackSync$ = new Subject<{ action: string; snapshot: PlaybackSnapshot }>();

  const currentRoomSig = signal<WatchRoomInfo | null>(mockRoom);
  const snapshotSig = signal<PlaybackSnapshot | null>(mockRoom.snapshot);
  const viewerCountSig = signal<number>(5);
  const isHostSig = signal<boolean>(true);

  const mockWatchRoomService = {
    currentRoom: currentRoomSig,
    playbackSnapshot: snapshotSig,
    viewerCount: viewerCountSig,
    isHost: isHostSig,
    newDanmaku$,
    deletedDanmaku$,
    playbackSync$,
    getRoom: vi.fn().mockReturnValue(of(mockRoom)),
    getDanmakuHistory: vi.fn().mockReturnValue(of([])),
    connectWebSocket: vi.fn(),
    disconnect: vi.fn(),
    getStoredHostToken: vi.fn().mockReturnValue('host_secret_123'),
    getSynchronizedTargetPosition: vi.fn().mockReturnValue(0),
    sendDanmaku: vi.fn(),
    sendHostControl: vi.fn(),
    deleteDanmaku: vi.fn(),
  };

  const mockAuthService = {
    currentUser: signal({ id: 'u1', displayName: 'AdminTester', role: 'ADMIN' }),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WatchRoomPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? 'room_test123' : null),
              },
            },
          },
        },
        { provide: WatchRoomService, useValue: mockWatchRoomService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchRoomPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the watch room component and sets up title and viewer count', () => {
    expect(component).toBeTruthy();
    expect(component.room()?.title).toBe('Phim Hoạt Hình Test');
    expect(component.viewerCount()).toBe(5);
    expect(component.isHost()).toBe(true);
  });

  it('formats video playback time properly in mm:ss', () => {
    expect(component.formatTime(0)).toBe('00:00');
    expect(component.formatTime(65)).toBe('01:05');
    expect(component.formatTime(600)).toBe('10:00');
    expect(component.formatTime(-5)).toBe('00:00');
  });

  it('unlocks autoplay on user interaction when entering watch room', () => {
    expect(component.hasUserEntered()).toBe(false);
    component.enterWatchRoom();
    expect(component.hasUserEntered()).toBe(true);
  });

  it('toggles danmaku layer on and off', () => {
    expect(component.danmakuEnabled()).toBe(true);
    component.toggleDanmaku();
    expect(component.danmakuEnabled()).toBe(false);
    component.toggleDanmaku();
    expect(component.danmakuEnabled()).toBe(true);
  });

  it('dispatches new danmaku when host or viewer sends comment', () => {
    component.inputText = 'Tuyệt vời quá! 2333';
    component.sendComment();

    expect(mockWatchRoomService.sendDanmaku).toHaveBeenCalledWith(
      'Tuyệt vời quá! 2333',
      0,
      '#ffffff'
    );
    expect(component.inputText).toBe('');
  });

  it('triggers host play/pause control', () => {
    component.hostTogglePlay();
    expect(mockWatchRoomService.sendHostControl).toHaveBeenCalledWith('RESUME');
  });
});
