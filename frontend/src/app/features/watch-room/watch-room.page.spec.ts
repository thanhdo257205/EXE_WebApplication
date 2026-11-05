import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, Subject } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    getLivePlaybackSnapshot: () => snapshotSig(),
    lastError: signal(''),
    viewerCount: viewerCountSig,
    isHost: isHostSig,
    viewers: viewersSig,
    myViewerId: myViewerIdSig,
    rename: vi.fn(),
    newDanmaku$,
    deletedDanmaku$,
    videoChanged$: new Subject<void>(),
    changeVideo: vi.fn().mockReturnValue(of(mockRoom)),
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
    vi.clearAllMocks();
    currentRoomSig.set(mockRoom);
    snapshotSig.set(mockRoom.snapshot);
    mockAuthService.currentUser.set({ id: 'u1', displayName: 'AdminTester', role: 'ADMIN' });
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
  afterEach(() => { fixture.destroy(); });

  it('allows an admin to change video inside the room', () => {
    component.openVideoEditor();
    component.useUploadedVideo();
    component.saveVideo();
    expect(mockWatchRoomService.changeVideo).toHaveBeenCalledWith('room_test123', 'videos/1105-20261105-h264.mp4', 241.371905);
    expect(component.showVideoEditor).toBe(false);
  });

  it('does not let a non-admin host change video', () => {
    mockAuthService.currentUser.set({ id: 'u1', displayName: 'Host', role: 'CUSTOMER' });
    component.videoSourceDraft = 'https://example.com/new.mp4';
    component.openVideoEditor();
    component.saveVideo();
    fixture.detectChanges();
    expect(component.showVideoEditor).toBe(false);
    expect(mockWatchRoomService.changeVideo).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('Quản lý video · Admin');
  });

  it('shows a clear load error', () => {
    component.onVideoError();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Không tải được video');
    expect(component.isBuffering()).toBe(false);
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
    expect(mockWatchRoomService.sendHostControl).toHaveBeenCalledWith('START');
  });

  it('keeps chat and live bullets available while the premiere countdown is visible', () => {
    currentRoomSig.set({ ...mockRoom, mode: 'SCHEDULED', scheduledAt: new Date(Date.now() + 60000).toISOString() });
    snapshotSig.set({ ...mockRoom.snapshot, countdownSeconds: 60 });
    component.enterWatchRoom();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-premiere-countdown')).toBeTruthy();
    const emit = vi.spyOn(component.danmakuOverlay, 'emitBullet');
    const item = { id: 'lobby-1', nickname: 'Khách', text: 'Chờ phim!', phase: 'LOBBY', timeOffset: 0, color: '#ffffff', createdAt: new Date().toISOString() } as DanmakuItem;
    newDanmaku$.next(item);
    fixture.detectChanges();
    expect(emit).toHaveBeenCalledWith(item);
    expect(fixture.nativeElement.textContent).toContain('Chờ phim!');
    expect(fixture.nativeElement.textContent).toContain('Phòng chờ');
    snapshotSig.set({ ...mockRoom.snapshot, status: 'PLAYING' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-premiere-countdown')).toBeNull();
  });

  it('retains the comment draft when disconnected', () => {
    mockWatchRoomService.sendDanmaku.mockReturnValueOnce(false);
    component.inputText = 'Đợi kết nối';
    component.sendComment();
    expect(component.inputText).toBe('Đợi kết nối');
  });

  it('keeps original audio speed when correcting moderate playback drift', () => {
    const video = { currentTime: 10.8, playbackRate: 0.97, preservesPitch: false, paused: false };
    component.hasUserEntered.set(true);
    component.videoPlayerRef = { nativeElement: video } as any;
    mockWatchRoomService.getSynchronizedTargetPosition.mockReturnValueOnce(10);
    (component as any).performVideoSync({ ...mockRoom.snapshot, status: 'PLAYING', position: 10 });
    expect(video.playbackRate).toBe(1);
    expect(video.preservesPitch).toBe(true);
    expect(video.currentTime).toBe(10.8);
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
  it('seeks ±10s from the synced room position, clamps to the film and is disabled while waiting', () => {
    mockWatchRoomService.sendHostControl.mockClear();
    snapshotSig.set({ ...mockRoom.snapshot, status: 'PLAYING' });
    mockWatchRoomService.getSynchronizedTargetPosition.mockReturnValueOnce(30);
    component.hostSeekRelative(10);
    expect(mockWatchRoomService.sendHostControl).toHaveBeenLastCalledWith('SEEK', 40);
    expect(component.seekNotice()).toBe('Đã tua tới 00:40');

    mockWatchRoomService.getSynchronizedTargetPosition.mockReturnValueOnce(595);
    component.hostSeekRelative(10);
    expect(mockWatchRoomService.sendHostControl).toHaveBeenLastCalledWith('SEEK', 600);
    mockWatchRoomService.getSynchronizedTargetPosition.mockReturnValueOnce(4);
    component.hostSeekRelative(-10);
    expect(mockWatchRoomService.sendHostControl).toHaveBeenLastCalledWith('SEEK', 0);

    snapshotSig.set(mockRoom.snapshot); // LOBBY
    mockWatchRoomService.sendHostControl.mockClear();
    component.hostSeekRelative(10);
    expect(mockWatchRoomService.sendHostControl).not.toHaveBeenCalled();
    fixture.detectChanges();
    // While waiting, the strip offers premiere-time controls instead of ±10 s.
    const labels = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.wr-host button')).map((b) => b.textContent?.trim());
    expect(labels).not.toContain('+10 giây');
    expect(labels).toEqual(expect.arrayContaining(['−5 phút', '+5 phút', 'Đặt giờ', 'Chiếu ngay']));
  });

  it('lets the host move a scheduled premiere like seeking: ±5 min, a picked time, or start now', () => {
    const svc = mockWatchRoomService as any;
    svc.reschedule = vi.fn();
    const start = Date.now() + 3600_000;
    currentRoomSig.set({ ...mockRoom, mode: 'SCHEDULED', scheduledAt: new Date(start).toISOString() });
    snapshotSig.set({ ...mockRoom.snapshot, status: 'LOBBY', countdownSeconds: 3600 });

    component.hostShiftSchedule(5);
    expect(svc.reschedule.mock.calls[0][0].getTime()).toBe(start + 5 * 60_000);
    component.hostShiftSchedule(-5);
    expect(svc.reschedule.mock.calls[1][0].getTime()).toBe(start - 5 * 60_000);
    expect(component.canMoveEarlier()).toBe(true);

    component.scheduleDraft = '2030-01-02T20:30';
    component.hostSetSchedule();
    expect(svc.reschedule.mock.calls[2][0].getTime()).toBe(new Date('2030-01-02T20:30').getTime());

    component.hostStartNow();
    expect(Math.abs(svc.reschedule.mock.calls[3][0].getTime() - Date.now())).toBeLessThan(1000);

    // Under 5 minutes left: "earlier" is disabled (would start in the past).
    currentRoomSig.set({ ...mockRoom, mode: 'SCHEDULED', scheduledAt: new Date(Date.now() + 120_000).toISOString() });
    expect(component.canMoveEarlier()).toBe(false);

    // Host-trigger room: "Chiếu ngay" keeps the START command.
    currentRoomSig.set(mockRoom);
    mockWatchRoomService.sendHostControl.mockClear();
    component.hostStartNow();
    expect(mockWatchRoomService.sendHostControl).toHaveBeenCalledWith('START');
    snapshotSig.set(mockRoom.snapshot);
  });
});
