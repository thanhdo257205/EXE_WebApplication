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
import { PremiereCountdownComponent } from './premiere-countdown.component';

@Component({
  selector: 'app-watch-room',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DanmakuOverlayComponent, RiseHeadingDirective, PremiereCountdownComponent],
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
            <video #videoPlayer class="wr-video" [class.wr-hidden]="isLobby()" [src]="streamUrl()" playsinline preload="metadata"
              (loadedmetadata)="syncAfterMetadata()"
              (error)="onVideoError()" (loadstart)="videoError.set('')"
              (click)="onVideoClick()" (waiting)="isBuffering.set(true)"
              (playing)="isBuffering.set(false); isPlaying.set(true)" (pause)="isPlaying.set(false)"
              (volumechange)="onVolumeChange()"></video>

            <app-danmaku-overlay #danmakuOverlay [laneCount]="8"></app-danmaku-overlay>
            @if (videoError()) {
              <div class="wr-layer wr-video-error" role="alert">
                <h2 class="wr-layer-title">Không tải được video</h2>
                <p class="wr-layer-text">{{ videoError() }}</p>
                @if (canChangeVideo()) { <button type="button" class="wr-cta" (click)="openVideoEditor()">Đổi video</button> }
                @else { <p class="wr-layer-text">Vui lòng báo admin kiểm tra nguồn video.</p> }
              </div>
            }

            <div class="wr-corner" aria-hidden="true">
              <span class="wr-corner-tag">Công chiếu</span>
              <span>{{ viewerCount() }} đang xem</span>
            </div>

            @if (!hasUserEntered()) {
              <div class="wr-layer wr-enter">
                <p class="wr-layer-kicker">{{ premiereLabel() }}</p>
                <h2 class="wr-layer-title">Cùng xem, cùng bình luận</h2>
                <p class="wr-layer-text">Nhập tên để vào phòng. Mọi người sẽ thấy tên bạn trong danh sách đang xem và cạnh bình luận.</p>
                <form class="wr-join" (ngSubmit)="enterWatchRoom()">
                  <label class="wr-join-label" for="wr-join-name">Tên của bạn</label>
                  <input id="wr-join-name" name="joinName" type="text" [(ngModel)]="tempNickname" maxlength="32" required
                    autocomplete="nickname" placeholder="Ví dụ: Siêu nhân đỏ" />
                  <button type="submit" class="wr-cta" [disabled]="!tempNickname.trim()">Vào xem ngay</button>
                </form>
              </div>
            } @else if (isLobby() && isScheduled()) {
              <!-- Lobby video (canvas countdown) sits under the danmaku layer so chat stays visible. -->
              <div class="wr-lobby">
                <app-premiere-countdown [seconds]="snapshot()?.countdownSeconds || 0" />
                <p class="wr-lobby-caption">Đếm ngược công chiếu · {{ viewerCount() }} người đang chờ · bạn có thể chat và gửi danmaku ngay</p>
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
                [placeholder]="hasUserEntered() ? 'Gửi một bình luận chạy ngang…' : 'Nhập tên và vào phòng để bình luận'" aria-label="Nội dung danmaku" [disabled]="!hasUserEntered()" />
              <button type="button" class="wr-send" (click)="sendComment()" [disabled]="!hasUserEntered() || !inputText.trim()">Gửi</button>
            </div>
          </div>

          @if (watchError()) { <p class="wr-alert" role="alert">{{ watchError() }}</p> }

          @if (canChangeVideo()) {
            <div class="wr-host"><b>Quản lý video · Admin</b><span class="wr-spacer"></span>
              <button type="button" (click)="openVideoEditor()">Đổi video</button>
            </div>
            @if (showVideoEditor) {
              <form class="wr-video-form" (ngSubmit)="saveVideo()">
                <label for="wr-video-source">Nguồn video (đường dẫn Azure hoặc URL MP4)</label>
                <input id="wr-video-source" name="videoSource" [(ngModel)]="videoSourceDraft" maxlength="1024" required />
                <button type="button" (click)="useUploadedVideo()">Chọn video 1105 đã tải lên</button>
                <label for="wr-video-duration">Thời lượng (giây, có thể để 0 nếu chưa biết)</label>
                <input id="wr-video-duration" type="number" name="duration" [(ngModel)]="videoDurationDraft" min="0" max="86400" />
                <p>Đổi video sẽ đưa cả phòng về đầu phim và chờ bắt đầu; lịch hẹn còn ở tương lai được giữ nguyên.</p>
                @if (videoSaveError()) { <p role="alert">{{ videoSaveError() }}</p> }
                <div><button type="submit" [disabled]="savingVideo() || !videoSourceDraft.trim()">{{ savingVideo() ? 'Đang lưu…' : 'Lưu video cho cả phòng' }}</button>
                  <button type="button" (click)="showVideoEditor = false" [disabled]="savingVideo()">Huỷ</button></div>
              </form>
            }
          }
          @if (isHost()) {
            <div class="wr-host">
              <span class="wr-host-label">Bảng điều khiển chủ phòng · <b>{{ premiereLabel() }}</b></span>
              <span class="wr-spacer"></span>
              @if (seekNotice()) { <span class="wr-host-label wr-seek-notice" aria-live="polite">{{ seekNotice() }}</span> }
              @if (isLobby()) {
                <!-- Before the film starts the host moves the premiere time, like seeking. -->
                <span class="wr-host-label">{{ isScheduled() && scheduledLabel() ? 'Công chiếu lúc ' + scheduledLabel() : 'Chưa hẹn giờ' }}</span>
                <button type="button" (click)="hostShiftSchedule(-5)" [disabled]="!canMoveEarlier()"
                  [attr.title]="canMoveEarlier() ? 'Công chiếu sớm hơn 5 phút' : 'Còn dưới 5 phút, dùng Chiếu ngay'">−5 phút</button>
                <button type="button" (click)="hostShiftSchedule(5)" title="Công chiếu muộn hơn 5 phút">+5 phút</button>
                <label class="wr-sched-pick">
                  <span class="wr-visually-hidden">Giờ công chiếu mới</span>
                  <input type="datetime-local" [(ngModel)]="scheduleDraft" [min]="scheduleMin()" />
                </label>
                <button type="button" (click)="hostSetSchedule()" [disabled]="!scheduleDraft">Đặt giờ</button>
                <button type="button" class="wr-host-main" (click)="hostStartNow()">Chiếu ngay</button>
              } @else {
                <button type="button" (click)="hostSeekRelative(-10)" title="Tua lùi 10 giây cho cả phòng">−10 giây</button>
                <button type="button" (click)="hostSeekRelative(10)" title="Tua tới 10 giây cho cả phòng">+10 giây</button>
                <button type="button" class="wr-host-main" (click)="hostTogglePlay()">{{ isPlaying() ? 'Tạm dừng cả phòng' : 'Tiếp tục phát' }}</button>
              }
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

          <div class="wr-card wr-people">
            <p class="wr-people-head">Đang trong phòng <span class="wr-count">{{ viewerCount() }}</span></p>
            @if (viewers().length) {
              <ul class="wr-people-list">
                @for (v of viewers(); track v.id) {
                  <li [class.wr-me-row]="v.id === myViewerId()">
                    <span class="wr-people-avatar" aria-hidden="true">{{ initial(v.nickname) }}</span>
                    <span class="wr-people-name">{{ v.nickname }}</span>
                    @if (v.isHost) { <span class="wr-people-tag">Chủ phòng</span> }
                    @if (v.id === myViewerId()) { <span class="wr-people-tag wr-you">Bạn</span> }
                  </li>
                }
              </ul>
              @if (viewerCount() > viewers().length) { <p class="wr-empty">và {{ viewerCount() - viewers().length }} người khác</p> }
            } @else {
              <p class="wr-empty">{{ hasUserEntered() ? 'Đang kết nối…' : 'Nhập tên và vào phòng để xem ai đang xem cùng.' }}</p>
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
                    <span class="wr-row-time">{{ msg.phase === 'LOBBY' ? 'Phòng chờ' : formatTime(msg.timeOffset) }}</span>
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
              <span>Bạn là <b>{{ nickname() || "chưa đặt tên" }}</b></span>
              <button type="button" (click)="tempNickname = nickname(); showNicknamePrompt = true">Đổi tên</button>
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
  readonly canChangeVideo = computed(() => this.auth.currentUser()?.role === 'ADMIN');
  readonly videoError = signal('');
  readonly videoSaveError = signal('');
  readonly savingVideo = signal(false);
  showVideoEditor = false;
  videoSourceDraft = '';
  videoDurationDraft = 0;
  private readonly clock = signal(Date.now());
  readonly snapshot = computed(() => this.watchRoomService.getLivePlaybackSnapshot(this.clock()));
  readonly watchError = this.watchRoomService.lastError;
  readonly viewerCount = this.watchRoomService.viewerCount;
  readonly isHost = this.watchRoomService.isHost;
  readonly viewers = this.watchRoomService.viewers;
  readonly myViewerId = this.watchRoomService.myViewerId;

  readonly hasUserEntered = signal<boolean>(false);
  readonly isPlaying = signal<boolean>(false);
  readonly isBuffering = signal<boolean>(false);
  readonly isMuted = signal<boolean>(false);
  readonly currentVideoTime = signal<number>(0);
  /** Short confirmation after a host seek, e.g. "Đã tua tới 01:23". */
  readonly seekNotice = signal<string>('');
  private seekNoticeTimer?: ReturnType<typeof setTimeout>;
  /** Value of the host's datetime-local picker ("YYYY-MM-DDTHH:mm", local time). */
  scheduleDraft = '';
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
  private refreshInterval?: ReturnType<typeof setInterval>;
  private subs = new Subscription();
  private roomId = '';
  private hostToken: string | undefined;

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
    let savedName: string | null = null;
    try { savedName = localStorage.getItem('watch_room_nickname'); } catch {}
    const user = this.auth.currentUser();
    // Prefill only a real name (account or last used); otherwise the viewer must type one.
    const initialName = (user?.displayName || savedName || '').trim().slice(0, 32);
    this.nickname.set(initialName);
    this.tempNickname = initialName;

    const hostToken = this.watchRoomService.getStoredHostToken(this.roomId) || undefined;
    this.hostToken = hostToken;

    // Load initial room data
    this.subs.add(this.watchRoomService.getRoom(this.roomId, hostToken).subscribe({
      next: (room) => {
        if (room.videoDuration) {
          this.videoDuration.set(room.videoDuration);
        }
        // Admin hosts get their token from GET; keep it for the socket opened on enter.
        this.hostToken = room.hostToken || hostToken;
        // The WebSocket (and the viewer list entry) starts only after the viewer enters with a name.
      },
      error: (err) => {
        console.error('Failed to load watch room', err);
      },
    }));

    // Load historical Danmaku
    this.subs.add(this.watchRoomService.getDanmakuHistory(this.roomId).subscribe({
      next: (history) => {
        this.chatMessages.update(current => [...new Map([...history, ...current].map(item => [item.id, item])).values()].slice(-1000));
      },
    }));

    // Subscribe to new Danmaku from WebSocket
    this.subs.add(this.watchRoomService.videoChanged$.subscribe(() => {
      this.videoError.set('');
      this.isBuffering.set(false);
      this.currentVideoTime.set(0);
      this.videoDuration.set(this.room()?.videoDuration || 0);
      this.isPlaying.set(false);
    }));
    this.subs.add(
      this.watchRoomService.newDanmaku$.subscribe((item) => {
        this.chatMessages.update((list) => [...list, item].slice(-1000));
        if (this.hasUserEntered()) this.danmakuOverlay?.emitBullet(item);
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
        this.performVideoSync(this.snapshot(), action !== 'TICK');
      })
    );

    // Start background sync timer
    this.syncInterval = setInterval(() => {
      this.onSyncTick();
    }, 250);
    // Refresh short-lived video URLs even when a premiere is scheduled hours ahead.
    this.refreshInterval = setInterval(() => {
      this.subs.add(this.watchRoomService.getRoom(this.roomId, this.watchRoomService.getStoredHostToken(this.roomId) || undefined).subscribe({ error: () => {} }));
    }, 30 * 60 * 1000);
  }

  ngOnDestroy() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    clearTimeout(this.seekNoticeTimer);
    this.subs.unsubscribe();
    this.watchRoomService.disconnect(true);
  }

  enterWatchRoom() {
    const name = this.tempNickname.trim().slice(0, 32);
    if (!name || this.hasUserEntered()) return;
    this.nickname.set(name);
    try { localStorage.setItem('watch_room_nickname', name); } catch {}
    this.watchRoomService.connectWebSocket(this.roomId, name, this.hostToken);
    this.hasUserEntered.set(true);
    const video = this.videoPlayerRef?.nativeElement;
    if (video) {
      video.muted = false;
      this.isMuted.set(video.muted);
      this.performVideoSync(this.snapshot(), true);
    }
  }

  private onSyncTick() {
    this.clock.set(Date.now());
    const video = this.videoPlayerRef?.nativeElement;
    if (!video || !this.hasUserEntered()) return;

    // A broken or not-yet-loaded video has no meaningful currentTime: show the room's synced position.
    const videoUsable = !video.error && video.readyState >= 1;
    this.currentVideoTime.set(videoUsable ? video.currentTime : this.watchRoomService.getSynchronizedTargetPosition(this.snapshot()));
    if (video.duration && Number.isFinite(video.duration)) {
      this.videoDuration.set(video.duration);
      if (this.room() && !this.room()!.videoDuration) {
        this.room.update(room => room ? { ...room, videoDuration: video.duration } : room);
      }
    }

    // Check history danmaku trigger as video progresses
    if (this.danmakuOverlay && this.playbackStatus() === 'PLAYING') {
      this.danmakuOverlay.checkHistoryTrigger(this.chatMessages(), video.currentTime);
    }

    const snap = this.snapshot();
    if (!snap) return;

    // Synchronize video with server position
    this.performVideoSync(snap, false);
  }

  private performVideoSync(snap: PlaybackSnapshot | null, forceSeek = false) {
    const video = this.videoPlayerRef?.nativeElement;
    if (!video || !snap || !this.hasUserEntered() || this.videoError()) return;

    const targetPos = this.watchRoomService.getSynchronizedTargetPosition(snap);
    // Preserve the original audio timing; time-stretching can audibly distort voices.
    video.playbackRate = 1;
    video.preservesPitch = true;

    if (snap.status === 'PLAYING') {
      const delta = video.currentTime - targetPos;

      // Hard seek if drift exceeds ~1.5 seconds or forceSeek
      if (forceSeek || Math.abs(delta) > 1.5) {
        video.currentTime = targetPos;
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
    } else {
      if (!video.paused) {
        video.pause();
      }
      if (forceSeek || Math.abs(video.currentTime - targetPos) > 1.0) {
        video.currentTime = targetPos;
      }
      video.playbackRate = 1.0;
    }
  }

  syncAfterMetadata() {
    this.videoError.set('');
    const duration = this.videoPlayerRef?.nativeElement.duration;
    if (duration && Number.isFinite(duration)) {
      this.videoDuration.set(duration);
      this.room.update(room => room ? { ...room, videoDuration: duration } : room);
    }
    this.performVideoSync(this.snapshot(), true);
  }

  onVideoError() {
    this.isBuffering.set(false);
    this.isPlaying.set(false);
    this.videoError.set('Nguồn video không truy cập được, đã hết hạn hoặc trình duyệt không hỗ trợ. Admin có thể đổi nguồn ngay trong phòng.');
  }

  openVideoEditor() {
    if (!this.canChangeVideo()) return;
    this.videoSourceDraft = this.room()?.videoSource || '';
    this.videoDurationDraft = this.room()?.videoDuration || 0;
    this.videoSaveError.set('');
    this.showVideoEditor = true;
  }

  useUploadedVideo() {
    this.videoSourceDraft = 'videos/1105-20261105-h264.mp4';
    this.videoDurationDraft = 241.371905;
  }

  saveVideo() {
    if (!this.canChangeVideo() || this.savingVideo() || !this.videoSourceDraft.trim()) return;
    this.savingVideo.set(true);
    this.videoSaveError.set('');
    this.subs.add(this.watchRoomService.changeVideo(this.roomId, this.videoSourceDraft.trim(), this.videoDurationDraft).subscribe({
      next: () => { this.savingVideo.set(false); this.showVideoEditor = false; },
      error: err => { this.savingVideo.set(false); this.videoSaveError.set(err.status === 401 || err.status === 403
        ? 'Chỉ tài khoản admin đang đăng nhập mới được đổi video.' : 'Không thể lưu video. Kiểm tra nguồn và thử lại.'); },
    }));
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
    if (!this.isHost() || this.isLobby()) return;
    const bar = event.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const target = percent * this.videoDuration();
    this.watchRoomService.sendHostControl('SEEK', target);
  }

  hostTogglePlay() {
    if (this.isLobby()) {
      if (!this.isScheduled()) this.hostTriggerStart();
      return;
    }
    if (this.isPlaying()) {
      this.watchRoomService.sendHostControl('PAUSE');
    } else {
      this.watchRoomService.sendHostControl('RESUME');
    }
  }

  hostTriggerStart() {
    this.watchRoomService.sendHostControl('START');
  }

  /** Moving the premiere 5 minutes earlier must leave a future start; below that, "Chiếu ngay". */
  readonly canMoveEarlier = computed(() => {
    const at = this.room()?.scheduledAt;
    if (!this.isScheduled() || !at) return false;
    return Date.parse(at) - 5 * 60_000 > Date.now();
  });

  /** Earliest value for the picker: now, as local "YYYY-MM-DDTHH:mm". */
  readonly scheduleMin = computed(() => this.toLocalInput(new Date(this.clock())));

  hostShiftSchedule(deltaMin: number) {
    if (!this.isHost() || !this.isLobby()) return;
    const at = this.room()?.scheduledAt;
    const base = this.isScheduled() && at ? Date.parse(at) : Date.now();
    const target = new Date(Math.max(Date.now(), base + deltaMin * 60_000));
    this.watchRoomService.reschedule(target);
    this.flashNotice(`Dời giờ công chiếu tới ${this.clockTime(target.toISOString())}`);
  }

  hostSetSchedule() {
    if (!this.isHost() || !this.isLobby() || !this.scheduleDraft) return;
    const target = new Date(this.scheduleDraft); // datetime-local is interpreted in local time
    if (Number.isNaN(target.getTime())) return;
    this.watchRoomService.reschedule(target);
    this.flashNotice(`Đặt giờ công chiếu lúc ${this.clockTime(target.toISOString())}`);
  }

  hostStartNow() {
    if (!this.isHost() || !this.isLobby()) return;
    if (!this.isScheduled()) this.hostTriggerStart();
    else this.watchRoomService.reschedule(new Date());
    this.flashNotice('Bắt đầu chiếu ngay');
  }

  private flashNotice(text: string) {
    this.seekNotice.set(text);
    clearTimeout(this.seekNoticeTimer);
    this.seekNoticeTimer = setTimeout(() => this.seekNotice.set(''), 2500);
  }

  private toLocalInput(d: Date): string {
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  hostSeekRelative(deltaSec: number) {
    if (!this.isHost() || this.isLobby()) return;
    // Seek from the room's synced position, not the local <video> (it may lag, buffer or have failed).
    const base = this.watchRoomService.getSynchronizedTargetPosition(this.snapshot());
    const duration = this.videoDuration();
    const target = Math.max(0, Math.min(base + deltaSec, duration > 0 ? duration : Number.POSITIVE_INFINITY));
    this.watchRoomService.sendHostControl('SEEK', target);
    this.flashNotice(`Đã tua tới ${this.formatTime(target)}`);
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
    if (!text || !this.hasUserEntered()) return;

    const timeOffset = this.currentVideoTime();
    if (this.watchRoomService.sendDanmaku(text, timeOffset, this.selectedColor()) !== false) this.inputText = '';
  }

  saveNickname() {
    const name = this.tempNickname.trim().slice(0, 32);
    if (!name) return;
    this.nickname.set(name);
    try { localStorage.setItem('watch_room_nickname', name); } catch {}
    if (this.hasUserEntered()) this.watchRoomService.rename(name);
    this.showNicknamePrompt = false;
  }

  /** First letter for the viewer avatar (handles Vietnamese/emoji graphemes). */
  initial(name: string): string {
    return (Array.from(name.trim())[0] || '?').toUpperCase();
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
