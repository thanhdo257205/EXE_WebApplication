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
  const viewersSig = signal<{ id: string; nickname: string; isHost: boolean }[]>([]);
  const myViewerIdSig = signal<string | null>(null);

  const mockWatchRoomService = {
    currentRoom: currentRoomSig,
    playbackSnapshot: snapshotSig,
    viewerCount: viewerCountSig,
    isHost: isHostSig,
    viewers: viewersSig,
    myViewerId: myViewerIdSig,
    rename: vi.fn(),
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
    component.enterWatchRoom();
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
  it('labels premiere state and splits the countdown into h/m/s', () => {
    expect(component.premiereLabel()).toBe('Sắp công chiếu');
    snapshotSig.set({ ...mockRoom.snapshot, status: 'LOBBY', countdownSeconds: 3725 });
    expect(component.countdownDisplay()).toBe('01:02:05');
    snapshotSig.set({ ...mockRoom.snapshot, status: 'PLAYING' });
    expect(component.premiereLabel()).toBe('Đang công chiếu');
    snapshotSig.set({ ...mockRoom.snapshot, status: 'ENDED' });
    expect(component.premiereState()).toBe('ended');
    snapshotSig.set(mockRoom.snapshot);
  });

  it('renders the premiere layout with the host brand card and danmaku list', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.wr-title')?.textContent).toContain('Phim Hoạt Hình Test');
    expect(el.querySelector('.wr-up-name')?.textContent).toContain('5 anh em siêu nhân');
    expect(el.querySelector('.wr-empty')).toBeTruthy();
    expect(el.querySelector('.wr-enter .wr-cta')?.textContent).toContain('Vào xem ngay');
  });
  it('requires a typed name before entering and only then joins the live room', () => {
    mockWatchRoomService.connectWebSocket.mockClear();
    expect(mockWatchRoomService.connectWebSocket).not.toHaveBeenCalled();
    component.tempNickname = '   ';
    component.enterWatchRoom();
    expect(component.hasUserEntered()).toBe(false);
    expect(mockWatchRoomService.connectWebSocket).not.toHaveBeenCalled();
    fixture.detectChanges();
    const submit = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.wr-join .wr-cta');
    expect(submit?.disabled).toBe(true);

    component.tempNickname = '  Siêu nhân đỏ ';
    component.enterWatchRoom();
    expect(component.hasUserEntered()).toBe(true);
    expect(component.nickname()).toBe('Siêu nhân đỏ');
    expect(mockWatchRoomService.connectWebSocket).toHaveBeenCalledWith('room_test123', 'Siêu nhân đỏ', 'host_secret_123');
  });

  it('shows who is in the room, marking the host and the current viewer', () => {
    viewersSig.set([
      { id: 'a1', nickname: 'Đỏ', isHost: true },
      { id: 'b2', nickname: 'Xanh', isHost: false },
    ]);
    myViewerIdSig.set('b2');
    viewerCountSig.set(2);
    fixture.detectChanges();
    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.wr-people-list li'));
    expect(rows.map((r) => r.querySelector('.wr-people-name')?.textContent?.trim())).toEqual(['Đỏ', 'Xanh']);
    expect(rows[0].textContent).toContain('Chủ phòng');
    expect(rows[1].classList.contains('wr-me-row')).toBe(true);
    expect(rows[1].textContent).toContain('Bạn');
    viewersSig.set([]);
    myViewerIdSig.set(null);
    viewerCountSig.set(5);
  });

  it('renames on the server only after entering the room', () => {
    mockWatchRoomService.rename.mockClear();
    component.tempNickname = 'Vàng';
    component.saveNickname();
    expect(mockWatchRoomService.rename).not.toHaveBeenCalled();
    component.enterWatchRoom();
    component.tempNickname = 'Hồng';
    component.saveNickname();
    expect(mockWatchRoomService.rename).toHaveBeenCalledWith('Hồng');
    expect(component.nickname()).toBe('Hồng');
  });
});
