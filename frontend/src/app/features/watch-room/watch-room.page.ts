import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  WatchRoomService,
  WatchRoomInfo,
  DanmakuItem,
  PlaybackSnapshot,
} from '../../core/watch-room/watch-room.service';
import { DanmakuOverlayComponent } from './danmaku-overlay.component';
import { AuthService } from '../../core/auth/auth.service';
import { RiseHeadingDirective } from '../../shared/motion/rise-heading.directive';

@Component({
  selector: 'app-watch-room',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DanmakuOverlayComponent, RiseHeadingDirective],
  template: `
    <div class="wr" [class.wr-chat-hidden]="chatCollapsed()">
      <div class="wr-grid">
        <section class="wr-main" aria-label="Khu xem phim">
          <!-- Title block (Bilibili premiere style: title, badge, meta row) -->
          <header class="wr-head">
            <h1 class="wr-title" [title]="room()?.title || 'Phòng chiếu'">{{ room()?.title || 'Đang tải phòng chiếu…' }}</h1>
            <div class="wr-meta">
              <span class="wr-badge" [attr.data-state]="premiereState()">
                @if (premiereState() === 'live') { <span class="wr-dot" aria-hidden="true"></span> }
                {{ premiereLabel() }}
              </span>
              <span class="wr-meta-item"><strong>{{ viewerCount() }}</strong> người đang xem</span>
              <span class="wr-meta-item"><strong>{{ chatMessages().length }}</strong> bình luận đã nạp</span>
              @if (scheduledLabel()) { <span class="wr-meta-item">Công chiếu lúc {{ scheduledLabel() }}</span> }
              <button type="button" class="wr-share" (click)="copyRoomLink()">{{ copiedLink() ? 'Đã sao chép link' : 'Chia sẻ phòng' }}</button>
            </div>
          </header>

          <!-- Player frame -->
          <div class="wr-player" #playerContainer [class.wr-paused]="!isPlaying()" [class.wr-covered]="!hasUserEntered() || isLobby() || playbackStatus() === 'ENDED'">
            <video #videoPlayer class="wr-video" [src]="streamUrl()" playsinline preload="auto"
              (click)="onVideoClick()" (waiting)="isBuffering.set(true)"
              (playing)="isBuffering.set(false); isPlaying.set(true)" (pause)="isPlaying.set(false)"
              (volumechange)="onVolumeChange()"></video>

            <app-danmaku-overlay #danmakuOverlay [laneCount]="8"></app-danmaku-overlay>

            <div class="wr-corner" aria-hidden="true">
              <span class="wr-corner-tag">Công chiếu</span>
              <span>{{ viewerCount() }} đang xem</span>
            </div>

            @if (!hasUserEntered()) {
              <div class="wr-layer wr-enter">
                <p class="wr-layer-kicker">{{ premiereLabel() }}</p>
                <h2 class="wr-layer-title">Cùng xem, cùng bình luận</h2>
                <p class="wr-layer-text">Bấm để vào phòng. Video sẽ chạy đồng bộ với mọi người, kể cả âm thanh.</p>
                <button type="button" class="wr-cta" (click)="enterWatchRoom()">Vào xem ngay</button>
              </div>
            } @else if (isLobby() && isScheduled()) {
              <div class="wr-layer">
                <p class="wr-layer-kicker">Đếm ngược công chiếu</p>
                <div class="wr-countdown" aria-live="polite">
                  @for (part of countdownParts(); track part.label) {
                    <span class="wr-cd-cell"><b>{{ part.value }}</b><small>{{ part.label }}</small></span>
                  }
                </div>
                <p class="wr-layer-text">{{ viewerCount() }} người đang chờ cùng bạn. Phim sẽ tự chạy khi đến giờ.</p>
              </div>
            } @else if (isLobby()) {
              <div class="wr-layer">
                <p class="wr-layer-kicker">Sắp công chiếu</p>
                <h2 class="wr-layer-title">Đang chờ chủ phòng</h2>
                <p class="wr-layer-text">Khi chủ phòng bấm bắt đầu, tất cả mọi người sẽ xem cùng một lúc.</p>
                @if (isHost()) { <button type="button" class="wr-cta" (click)="hostTriggerStart()">Bắt đầu công chiếu</button> }
              </div>
            } @else if (playbackStatus() === 'ENDED') {
              <div class="wr-layer">
                <p class="wr-layer-kicker">Đã kết thúc</p>
                <h2 class="wr-layer-title">Buổi công chiếu đã kết thúc</h2>
                <p class="wr-layer-text">Cảm ơn bạn đã xem cùng mọi người. Bình luận vẫn còn ở danh sách bên cạnh.</p>
              </div>
            }

            @if (isMuted() && hasUserEntered()) {
              <button type="button" class="wr-muted" (click)="unmuteVideo()">Trình duyệt đang tắt tiếng · bấm để bật</button>
            }
            @if (isBuffering()) { <div class="wr-spinner" aria-label="Đang tải video"></div> }

            <!-- In-player controls -->
            <div class="wr-controls">
              <div class="wr-progress" [class.wr-locked]="!isHost()" (click)="onProgressClick($event)"
                [attr.title]="isHost() ? 'Tua cho cả phòng' : 'Đang công chiếu: không tua được'">
                <span class="wr-progress-fill" [style.width.%]="progressPercent()"></span>
              </div>
              <div class="wr-ctrl-row">
                @if (isHost()) {
                  <button type="button" class="wr-icon" (click)="hostTogglePlay()" [attr.aria-label]="isPlaying() ? 'Tạm dừng cả phòng' : 'Phát cho cả phòng'">
                    @if (isPlaying()) { <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> }
                    @else { <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg> }
                  </button>
                }
                <span class="wr-time">{{ formatTime(currentVideoTime()) }} / {{ formatTime(videoDuration()) }}</span>
                @if (!isHost()) { <span class="wr-lock-note">Công chiếu · không tua</span> }
                <span class="wr-spacer"></span>
                <button type="button" class="wr-icon wr-icon-text" (click)="toggleDanmaku()" [attr.aria-pressed]="danmakuEnabled()">
                  {{ danmakuEnabled() ? 'Danmaku bật' : 'Danmaku tắt' }}
                </button>
                <button type="button" class="wr-icon" (click)="toggleFullscreen()" aria-label="Toàn màn hình">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5v2H6v3H4zm10-5h6v5h-2V6h-4V4zM4 15h2v3h3v2H4v-5zm14 3v-3h2v5h-5v-2h3z"/></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Danmaku send bar under the player -->
          <div class="wr-sendbar">
            <div class="wr-send-info"><strong>{{ viewerCount() }}</strong> người đang xem · đã nạp <strong>{{ chatMessages().length }}</strong> bình luận</div>
            <div class="wr-send-tools">
              <button type="button" class="wr-tool" [class.wr-on]="danmakuEnabled()" (click)="toggleDanmaku()" [attr.aria-pressed]="danmakuEnabled()" title="Bật/tắt danmaku" aria-label="Bật/tắt danmaku"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H8l-4 4V5zm3 4v2h10V9H7zm0 3v2h6v-2H7z"/></svg></button>
              <div class="wr-pop-wrap">
                <button type="button" class="wr-tool" (click)="showDanmakuSettings = !showDanmakuSettings; showColorPicker = false" title="Cài đặt danmaku" aria-label="Cài đặt danmaku">⚙</button>
                @if (showDanmakuSettings) {
                  <div class="wr-pop">
                    <p class="wr-pop-title">Cài đặt danmaku</p>
                    <label class="wr-pop-label">Độ đậm {{ (danmakuOpacity() * 100).toFixed(0) }}%
                      <input type="range" min="0.2" max="1" step="0.1" [value]="danmakuOpacity()" (input)="onOpacityChange($event)" />
                    </label>
                    <p class="wr-pop-label">Cỡ chữ</p>
                    <div class="wr-seg">
                      @for (sz of fontSizes; track sz.label) {
                        <button type="button" [class.wr-on]="danmakuFontSize() === sz.px" (click)="setFontSize(sz.px)">{{ sz.label }}</button>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
            <div class="wr-input">
              <div class="wr-pop-wrap">
                <button type="button" class="wr-swatch" [style.--ctrl-glass-bg-tint]="selectedColor()" [style.--ctrl-glass-bg-hover]="selectedColor()" (click)="showColorPicker = !showColorPicker; showDanmakuSettings = false" aria-label="Chọn màu bình luận"></button>
                @if (showColorPicker) {
                  <div class="wr-pop wr-colors">
                    @for (col of colorPalette; track col) {
                      <button type="button" class="wr-swatch" [style.--ctrl-glass-bg-tint]="col" [style.--ctrl-glass-bg-hover]="col" (click)="selectColor(col)" [attr.aria-label]="'Màu ' + col"></button>
                    }
                  </div>
                }
              </div>
              <input type="text" [(ngModel)]="inputText" (keydown.enter)="sendComment()" maxlength="60"
                placeholder="Gửi một bình luận chạy ngang…" aria-label="Nội dung danmaku" />
              <button type="button" class="wr-send" (click)="sendComment()" [disabled]="!inputText.trim()">Gửi</button>
            </div>
          </div>

          @if (isHost()) {
            <div class="wr-host">
              <span class="wr-host-label">Bảng điều khiển chủ phòng · <b>{{ premiereLabel() }}</b></span>
              <span class="wr-spacer"></span>
              <button type="button" (click)="hostSeekRelative(-10)">−10 giây</button>
              <button type="button" (click)="hostSeekRelative(10)">+10 giây</button>
              @if (isLobby()) { <button type="button" class="wr-host-main" (click)="hostTriggerStart()">Bắt đầu công chiếu</button> }
              @else { <button type="button" class="wr-host-main" (click)="hostTogglePlay()">{{ isPlaying() ? 'Tạm dừng cả phòng' : 'Tiếp tục phát' }}</button> }
            </div>
          }
        </section>

        <!-- Right column: host card, premiere card, danmaku list -->
        <aside class="wr-side" aria-label="Thông tin công chiếu và danh sách bình luận">
          <div class="wr-card wr-up">
            <span class="wr-avatar" aria-hidden="true">5</span>
            <div class="wr-up-text">
              <p class="wr-up-name">5 anh em siêu nhân</p>
              <p class="wr-up-sub">Phòng chiếu chung · ai có link đều vào xem được</p>
            </div>
          </div>

          <div class="wr-card wr-info">
            <p class="wr-info-state" [attr.data-state]="premiereState()">{{ premiereLabel() }}</p>
            @if (isLobby() && isScheduled()) {
              <p class="wr-info-big">{{ countdownDisplay() }}</p>
              <p class="wr-info-sub">còn lại trước giờ công chiếu</p>
            } @else {
              <p class="wr-info-big">{{ formatTime(currentVideoTime()) }} <small>/ {{ formatTime(videoDuration()) }}</small></p>
              <div class="wr-info-bar"><span [style.width.%]="progressPercent()"></span></div>
            }
          </div>

          <div class="wr-card wr-list">
            <div class="wr-list-head">
              <button type="button" class="wr-list-toggle" (click)="chatCollapsed.set(!chatCollapsed())" [attr.aria-expanded]="!chatCollapsed()">
                Danh sách danmaku <span class="wr-count">{{ chatMessages().length }}</span>
                <span aria-hidden="true">{{ chatCollapsed() ? '▾' : '▴' }}</span>
              </button>
            </div>
            @if (!chatCollapsed()) {
              <div class="wr-list-cols" aria-hidden="true"><span>Mốc phim</span><span>Nội dung</span><span>Gửi lúc</span></div>
              <div class="wr-list-body" #chatScrollArea>
                @for (msg of chatMessages(); track msg.id) {
                  <div class="wr-row">
                    <span class="wr-row-time">{{ formatTime(msg.timeOffset) }}</span>
                    <span class="wr-row-text" [title]="msg.nickname + ': ' + msg.text"><b>{{ msg.nickname }}:</b><span [style.color]="msg.color || null">{{ msg.text }}</span></span>
                    <span class="wr-row-sent">{{ clockTime(msg.createdAt) }}</span>
                    @if (isHost()) { <button type="button" class="wr-row-del" (click)="deleteMessage(msg.id)" aria-label="Xoá bình luận này">Xoá</button> }
                  </div>
                } @empty {
                  <p class="wr-empty">Chưa có bình luận nào. Gửi câu đầu tiên đi!</p>
                }
              </div>
            }
            <div class="wr-me">
              <span>Bạn là <b>{{ nickname() }}</b></span>
              <button type="button" (click)="showNicknamePrompt = true">Đổi tên</button>
            </div>
          </div>
        </aside>
      </div>

      @if (showNicknamePrompt) {
        <div class="wr-modal" role="dialog" aria-modal="true" aria-labelledby="wr-nick-title">
          <div class="wr-modal-card">
            <h3 id="wr-nick-title">Chọn biệt danh trong phòng</h3>
            <p>Tên này hiện cạnh bình luận của bạn trên video và trong danh sách.</p>
            <input type="text" [(ngModel)]="tempNickname" (keydown.enter)="saveNickname()" maxlength="32" placeholder="Nhập biệt danh…" aria-label="Biệt danh" />
            <div class="wr-modal-actions">
              <button type="button" (click)="showNicknamePrompt = false">Hủy</button>
              <button type="button" class="wr-send" (click)="saveNickname()">Xác nhận</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styleUrls: ['./watch-room.page.css', './watch-room-side.css', './watch-room-extra.css'],
})
export class WatchRoomPage implements OnInit, OnDestroy {
  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('playerContainer') playerContainerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('danmakuOverlay') danmakuOverlay!: DanmakuOverlayComponent;
  @ViewChild('chatScrollArea') chatScrollArea!: ElementRef<HTMLDivElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly watchRoomService = inject(WatchRoomService);
  private readonly auth = inject(AuthService);

  readonly room = this.watchRoomService.currentRoom;
  readonly snapshot = this.watchRoomService.playbackSnapshot;
  readonly viewerCount = this.watchRoomService.viewerCount;
  readonly isHost = this.watchRoomService.isHost;

  readonly hasUserEntered = signal<boolean>(false);
  readonly isPlaying = signal<boolean>(false);
  readonly isBuffering = signal<boolean>(false);
  readonly isMuted = signal<boolean>(false);
  readonly currentVideoTime = signal<number>(0);
  readonly videoDuration = signal<number>(0);
  readonly copiedLink = signal<boolean>(false);
  readonly chatCollapsed = signal<boolean>(false);

  readonly danmakuEnabled = signal<boolean>(true);
  readonly danmakuOpacity = signal<number>(0.9);
  readonly danmakuFontSize = signal<number>(18);

  readonly nickname = signal<string>('Khách');
  readonly chatMessages = signal<DanmakuItem[]>([]);

  readonly selectedColor = signal<string>('#ffffff');
  inputText = '';
  tempNickname = '';
  showNicknamePrompt = false;
  showDanmakuSettings = false;
  showColorPicker = false;

  readonly colorPalette = [
    '#ffffff',
    '#00e5ff',
    '#ff4081',
    '#ffeb3b',
    '#ff9800',
    '#76ff03',
  ];

  readonly fontSizes = [
    { label: 'Nhỏ', px: 14 },
    { label: 'Vừa', px: 18 },
    { label: 'Lớn', px: 24 },
  ];

  private syncInterval: any = null;
  private subs = new Subscription();
  private roomId = '';

  readonly streamUrl = computed(() => {
    return this.room()?.streamUrl || '';
  });

  readonly playbackStatus = computed(() => {
    return this.snapshot()?.status || 'LOBBY';
  });

  readonly isLobby = computed(() => {
    return this.playbackStatus() === 'LOBBY';
  });

  readonly isScheduled = computed(() => {
    return this.room()?.mode === 'SCHEDULED';
  });

  /** Bilibili-style premiere state for badges: upcoming, live, paused or ended. */
  readonly premiereState = computed<'upcoming' | 'live' | 'paused' | 'ended'>(() => {
    const st = this.playbackStatus();
    return st === 'PLAYING' ? 'live' : st === 'PAUSED' ? 'paused' : st === 'ENDED' ? 'ended' : 'upcoming';
  });

  readonly premiereLabel = computed(() => {
    switch (this.premiereState()) {
      case 'live': return 'Đang công chiếu';
      case 'paused': return 'Tạm dừng';
      case 'ended': return 'Đã kết thúc';
      default: return 'Sắp công chiếu';
    }
  });

  readonly scheduledLabel = computed(() => {
    const at = this.room()?.scheduledAt;
    if (!at || !this.isScheduled()) return '';
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())} ngày ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
  });

  readonly countdownParts = computed(() => {
    const sec = Math.max(0, Math.floor(this.snapshot()?.countdownSeconds || 0));
    const p = (n: number) => n.toString().padStart(2, '0');
    return [
      { label: 'giờ', value: p(Math.floor(sec / 3600)) },
      { label: 'phút', value: p(Math.floor((sec % 3600) / 60)) },
      { label: 'giây', value: p(sec % 60) },
    ];
  });

  readonly countdownDisplay = computed(() => this.countdownParts().map((x) => x.value).join(':'));

  readonly progressPercent = computed(() => {
    const dur = this.videoDuration();
    if (!dur || dur <= 0) return 0;
    return Math.min(100, Math.max(0, (this.currentVideoTime() / dur) * 100));
  });

  ngOnInit() {
    this.roomId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.roomId) {
      this.router.navigate(['/']);
      return;
    }

    // Initialize nickname from localStorage or currentUser
    const savedName = typeof window !== 'undefined' ? localStorage.getItem('watch_room_nickname') : null;
    const user = this.auth.currentUser();
    const initialName = user?.displayName || savedName || `CưDân_${Math.floor(1000 + Math.random() * 9000)}`;
    this.nickname.set(initialName);
    this.tempNickname = initialName;

    const hostToken = this.watchRoomService.getStoredHostToken(this.roomId) || undefined;

    // Load initial room data
    this.watchRoomService.getRoom(this.roomId, hostToken).subscribe({
      next: (room) => {
        if (room.videoDuration) {
          this.videoDuration.set(room.videoDuration);
        }
        // Connect WebSocket
        this.watchRoomService.connectWebSocket(this.roomId, this.nickname(), hostToken);
      },
      error: (err) => {
        console.error('Failed to load watch room', err);
      },
    });

    // Load historical Danmaku
    this.watchRoomService.getDanmakuHistory(this.roomId).subscribe({
      next: (history) => {
        this.chatMessages.set(history);
      },
    });

    // Subscribe to new Danmaku from WebSocket
    this.subs.add(
      this.watchRoomService.newDanmaku$.subscribe((item) => {
        this.chatMessages.update((list) => [...list, item]);
        this.danmakuOverlay?.emitBullet(item);
        this.scrollChatToBottom();
      })
    );

    // Subscribe to Danmaku deletion
    this.subs.add(
      this.watchRoomService.deletedDanmaku$.subscribe((id) => {
        this.chatMessages.update((list) => list.filter((m) => m.id !== id));
      })
    );

    // Subscribe to playback sync actions
    this.subs.add(
      this.watchRoomService.playbackSync$.subscribe(({ action, snapshot }) => {
        this.performVideoSync(snapshot, true);
      })
    );

    // Start background sync timer
    this.syncInterval = setInterval(() => {
      this.onSyncTick();
    }, 250);
  }

  ngOnDestroy() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.subs.unsubscribe();
    this.watchRoomService.disconnect(true);
  }

  enterWatchRoom() {
    this.hasUserEntered.set(true);
    const video = this.videoPlayerRef?.nativeElement;
    if (video) {
      video.muted = false;
      this.isMuted.set(video.muted);
      this.performVideoSync(this.snapshot(), true);
    }
  }

  private onSyncTick() {
    const video = this.videoPlayerRef?.nativeElement;
    if (!video || !this.hasUserEntered()) return;

    this.currentVideoTime.set(video.currentTime);
    if (video.duration && Number.isFinite(video.duration)) {
      this.videoDuration.set(video.duration);
    }

    // Check history danmaku trigger as video progresses
    if (this.danmakuOverlay) {
      this.danmakuOverlay.checkHistoryTrigger(this.chatMessages(), video.currentTime);
    }

    const snap = this.snapshot();
    if (!snap) return;

    // Synchronize video with server position
    this.performVideoSync(snap, false);
  }

  private performVideoSync(snap: PlaybackSnapshot | null, forceSeek = false) {
    const video = this.videoPlayerRef?.nativeElement;
    if (!video || !snap || !this.hasUserEntered()) return;

    const targetPos = this.watchRoomService.getSynchronizedTargetPosition();

    if (snap.status === 'PLAYING') {
      const delta = video.currentTime - targetPos;

      // Hard seek if drift exceeds ~1.5 seconds or forceSeek
      if (forceSeek || Math.abs(delta) > 1.5) {
        video.currentTime = targetPos;
        video.playbackRate = 1.0;
      } else if (Math.abs(delta) > 0.3) {
        // Minor drift compensation: adjust playbackRate smoothly (0.97 - 1.03)
        video.playbackRate = delta > 0 ? 0.97 : 1.03;
      } else {
        video.playbackRate = 1.0;
      }

      if (video.paused) {
        video.play().catch(() => {
          // If browser policy blocked unmuted play, fallback to muted
          video.muted = true;
          this.isMuted.set(true);
          video.play().catch(() => {});
        });
      }
    } else if (snap.status === 'PAUSED' || snap.status === 'LOBBY') {
      if (!video.paused) {
        video.pause();
      }
      if (forceSeek || Math.abs(video.currentTime - targetPos) > 1.0) {
        video.currentTime = targetPos;
      }
      video.playbackRate = 1.0;
    }
  }

  unmuteVideo() {
    const video = this.videoPlayerRef?.nativeElement;
    if (video) {
      video.muted = false;
      this.isMuted.set(false);
    }
  }

  onVideoClick() {
    if (this.isHost()) {
      this.hostTogglePlay();
    }
  }

  onVolumeChange() {
    const video = this.videoPlayerRef?.nativeElement;
    if (video) {
      this.isMuted.set(video.muted);
    }
  }

  onProgressClick(event: MouseEvent) {
    if (!this.isHost()) return;
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const target = percent * this.videoDuration();
    this.watchRoomService.sendHostControl('SEEK', target);
  }

  hostTogglePlay() {
    if (this.isPlaying()) {
      this.watchRoomService.sendHostControl('PAUSE');
    } else {
      this.watchRoomService.sendHostControl('RESUME');
    }
  }

  hostTriggerStart() {
    this.watchRoomService.sendHostControl('START');
  }

  hostSeekRelative(deltaSec: number) {
    const target = Math.max(0, this.currentVideoTime() + deltaSec);
    this.watchRoomService.sendHostControl('SEEK', target);
  }

  deleteMessage(danmakuId: string) {
    this.watchRoomService.deleteDanmaku(danmakuId);
  }

  toggleDanmaku() {
    const next = !this.danmakuEnabled();
    this.danmakuEnabled.set(next);
    this.danmakuOverlay?.toggleEnabled(next);
  }

  onOpacityChange(event: Event) {
    const val = Number((event.target as HTMLInputElement).value);
    this.danmakuOpacity.set(val);
    this.danmakuOverlay?.setOpacity(val);
  }

  setFontSize(px: number) {
    this.danmakuFontSize.set(px);
    this.danmakuOverlay?.setFontSize(px);
    this.showDanmakuSettings = false;
  }

  selectColor(col: string) {
    this.selectedColor.set(col);
    this.showColorPicker = false;
  }

  sendComment() {
    const text = this.inputText.trim();
    if (!text) return;

    const timeOffset = this.currentVideoTime();
    this.watchRoomService.sendDanmaku(text, timeOffset, this.selectedColor());
    this.inputText = '';
  }

  saveNickname() {
    const name = this.tempNickname.trim();
    if (!name) return;
    this.nickname.set(name);
    if (typeof window !== 'undefined') {
      localStorage.setItem('watch_room_nickname', name);
    }
    this.showNicknamePrompt = false;
  }

  toggleFullscreen() {
    const el = this.playerContainerRef?.nativeElement;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }

  copyRoomLink() {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      this.copiedLink.set(true);
      setTimeout(() => this.copiedLink.set(false), 2000);
    });
  }

  private scrollChatToBottom() {
    setTimeout(() => {
      const el = this.chatScrollArea?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  /** Wall-clock HH:mm a danmaku was sent, for the list's last column. */
  clockTime(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
