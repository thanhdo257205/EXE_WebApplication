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
import { PremiereCountdownComponent } from './premiere-countdown.component';

@Component({
  selector: 'app-watch-room',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DanmakuOverlayComponent, PremiereCountdownComponent],
  template: `
    <div class="watch-room-root min-h-screen bg-[#0e0f14] text-slate-100 flex flex-col font-sans select-none">
      <!-- Top Bar: Room Title & Live Badge -->
      <header class="border-b border-white/10 bg-[#161820]/90 backdrop-blur-md px-4 py-3 sticky top-0 z-30 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <a routerLink="/" class="text-xs uppercase tracking-wider text-pink-400 font-bold hover:text-pink-300 transition-colors flex items-center gap-1.5 shrink-0">
            <span class="w-2 h-2 rounded-full bg-pink-500"></span>
            Nhà Này Hơi Báo
          </a>
          <span class="text-white/20">/</span>
          <h1 class="font-bold text-sm sm:text-base truncate text-white" [title]="room()?.title || 'Phòng chiếu phim'">
            {{ room()?.title || 'Đang tải phòng chiếu...' }}
          </h1>

          <!-- Live Badge -->
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide bg-pink-500/20 text-pink-400 border border-pink-500/30 shrink-0">
            <span class="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></span>
            LIVE
          </span>
        </div>

        <div class="flex items-center gap-2.5 shrink-0">
          <!-- Viewer Count -->
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300" title="Số người đang xem">
            <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span class="font-semibold text-white">{{ viewerCount() }}</span>
            <span class="hidden sm:inline text-slate-400">người xem</span>
          </div>

          <!-- Nickname Chip -->
          <button
            (click)="showNicknamePrompt = true"
            class="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 transition-colors"
            title="Đổi biệt danh"
          >
            <span>👤</span>
            <span class="font-medium text-cyan-300">{{ nickname() }}</span>
          </button>

          <!-- Copy Link -->
          <button
            (click)="copyRoomLink()"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition-all cursor-pointer active:scale-95"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>{{ copiedLink() ? 'Đã sao chép!' : 'Chia sẻ' }}</span>
          </button>
        </div>
      </header>

      <!-- Main Layout: Player on Left, Chat on Right -->
      <main class="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        <!-- Video Player Section -->
        <section class="flex-1 flex flex-col bg-black min-w-0 relative">
          <!-- Video Container -->
          <div class="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden group" #playerContainer>
            <video
              #videoPlayer
              class="w-full h-full object-contain cursor-pointer"
              [src]="streamUrl()"
              [class.invisible]="isLobby()"
              playsinline
              preload="metadata"
              (loadedmetadata)="syncAfterMetadata()"
              (click)="onVideoClick()"
              (waiting)="isBuffering.set(true)"
              (playing)="isBuffering.set(false); isPlaying.set(true)"
              (pause)="isPlaying.set(false)"
              (volumechange)="onVolumeChange()"
            ></video>

            <!-- Danmaku Overlay -->
            <app-danmaku-overlay
              #danmakuOverlay
              [laneCount]="8"
            ></app-danmaku-overlay>

            <!-- Autoplay / Enter Watch Room Barrier Overlay -->
            @if (!hasUserEntered()) {
              <div class="absolute inset-0 bg-black/85 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center">
                <div class="w-16 h-16 rounded-full bg-pink-500/20 border-2 border-pink-500 flex items-center justify-center mb-4 text-pink-400 animate-pulse">
                  <svg class="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <h2 class="text-xl sm:text-2xl font-bold text-white mb-2">Chào mừng đến phòng chiếu!</h2>
                <p class="text-slate-400 text-sm max-w-md mb-6">
                  Bấm nút bên dưới để tham gia và đồng bộ âm thanh cùng mọi người.
                </p>
                <button
                  (click)="enterWatchRoom()"
                  class="px-8 py-3 rounded-full bg-gradient-to-r from-pink-500 to-rose-600 text-white font-bold text-base shadow-lg shadow-pink-500/30 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  Vào xem ngay
                </button>
              </div>
            }

            <!-- Scheduled Countdown Overlay -->
            @if (hasUserEntered() && isLobby() && isScheduled()) {
              <div class="absolute inset-0 z-10 pointer-events-none text-center">
                <app-premiere-countdown [seconds]="snapshot()?.countdownSeconds || 0" />
                <div class="absolute inset-x-0 bottom-3 sm:bottom-6 flex flex-col items-center gap-1 px-4">
                <span class="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-bold border border-cyan-500/30">
                  CÔNG CHIẾU HẸN GIỜ
                </span>
                <h3 class="text-sm text-white">Phim sẽ tự động bắt đầu khi đếm ngược kết thúc</h3>
                <p class="text-slate-400 text-xs sm:text-sm">
                  {{ viewerCount() }} người đang chờ · Bạn có thể chat và gửi chữ chạy ngay
                </p>
                </div>
              </div>
            }

            <!-- Lobby Overlay for Host Trigger mode -->
            @if (hasUserEntered() && isLobby() && !isScheduled()) {
              <div class="absolute inset-0 bg-black/80 z-10 flex flex-col items-center justify-center p-6 text-center">
                <div class="w-12 h-12 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center mb-3">
                  <svg class="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                </div>
                <h3 class="text-lg sm:text-xl font-bold text-white mb-2">Phòng chờ công chiếu</h3>
                <p class="text-slate-400 text-sm max-w-sm mb-5">
                  Phim đang ở sảnh chờ. Khi chủ phòng ấn "Bắt đầu", tất cả mọi người sẽ cùng xem đồng loạt.
                </p>
                @if (isHost()) {
                  <button
                    (click)="hostTriggerStart()"
                    class="px-6 py-2.5 rounded-full bg-pink-500 hover:bg-pink-600 text-white font-bold text-sm shadow-md transition-all cursor-pointer hover:scale-105 active:scale-95"
                  >
                    ▶ Bắt đầu phát sóng (Chủ phòng)
                  </button>
                }
              </div>
            }

            <!-- Muted Warning Pill -->
            @if (isMuted() && hasUserEntered()) {
              <button
                (click)="unmuteVideo()"
                class="absolute top-4 left-4 z-20 px-3 py-1.5 rounded-full bg-black/80 hover:bg-black/90 border border-white/20 text-yellow-300 text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-lg backdrop-blur-md transition-transform hover:scale-105"
              >
                <span>🔇</span>
                <span>Trình duyệt đang tắt tiếng · Bấm để bật</span>
              </button>
            }

            <!-- Buffering Spinner -->
            @if (isBuffering()) {
              <div class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <div class="w-12 h-12 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin"></div>
              </div>
            }
          </div>

          <!-- Player Controls & Bilibili-Style Danmaku Bar -->
          <div class="bg-[#14161f] border-t border-white/10 p-3 sm:p-4 flex flex-col gap-3">
            <!-- Progress / Scrub bar (Host has control, viewers see current sync) -->
            <div class="flex items-center gap-3 text-xs text-slate-400 font-mono">
              <span>{{ formatTime(currentVideoTime()) }}</span>
              <div class="flex-1 relative flex items-center group cursor-pointer" (click)="onProgressClick($event)">
                <div class="w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-cyan-400 to-pink-500 rounded-full" [style.width.%]="progressPercent()"></div>
                </div>
              </div>
              <span>{{ formatTime(videoDuration()) }}</span>
            </div>

            <!-- Main Control Bar -->
            <div class="flex flex-wrap items-center justify-between gap-3">
              <!-- Left: Play/Pause (for host), Danmaku Settings -->
              <div class="flex items-center gap-2">
                @if (isHost()) {
                  <button
                    (click)="hostTogglePlay()"
                    class="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-white transition-colors cursor-pointer"
                    [title]="isPlaying() ? 'Tạm dừng (Chủ phòng)' : 'Phát (Chủ phòng)'"
                  >
                    @if (isPlaying()) {
                      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    } @else {
                      <svg class="w-5 h-5 text-pink-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    }
                  </button>
                }

                <!-- Danmaku Toggle Switch -->
                <button
                  (click)="toggleDanmaku()"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer"
                  [ngClass]="danmakuEnabled() ? 'bg-pink-500/20 border-pink-500/40 text-pink-300' : 'bg-white/5 border-white/10 text-slate-400'"
                >
                  <span class="text-sm">💬</span>
                  <span class="hidden sm:inline">Danmaku</span>
                  <span class="text-[10px] uppercase font-bold">{{ danmakuEnabled() ? 'BẬT' : 'TẮT' }}</span>
                </button>

                <!-- Danmaku Settings Button -->
                <div class="relative">
                  <button
                    (click)="showDanmakuSettings = !showDanmakuSettings"
                    class="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs"
                    title="Cài đặt bình luận chạy ngang"
                  >
                    ⚙
                  </button>

                  <!-- Danmaku Settings Popover -->
                  @if (showDanmakuSettings) {
                    <div class="absolute bottom-full left-0 mb-2 w-64 bg-[#1e202c] border border-white/15 rounded-xl p-4 shadow-2xl z-40 flex flex-col gap-3">
                      <div class="flex items-center justify-between border-b border-white/10 pb-2">
                        <span class="text-xs font-bold text-white">Cài đặt Danmaku</span>
                        <button (click)="showDanmakuSettings = false" class="text-slate-400 hover:text-white text-xs">✕</button>
                      </div>

                      <!-- Opacity Slider -->
                      <div>
                        <div class="flex justify-between text-xs text-slate-300 mb-1">
                          <span>Độ trong suốt</span>
                          <span>{{ danmakuOpacity() * 100 }}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.2"
                          max="1.0"
                          step="0.1"
                          [value]="danmakuOpacity()"
                          (input)="onOpacityChange($event)"
                          class="w-full accent-pink-500 h-1.5 bg-white/20 rounded cursor-pointer"
                        />
                      </div>

                      <!-- Font Size -->
                      <div>
                        <div class="text-xs text-slate-300 mb-1.5">Cỡ chữ</div>
                        <div class="grid grid-cols-3 gap-1.5">
                          @for (sz of fontSizes; track sz.label) {
                            <button
                              (click)="setFontSize(sz.px)"
                              class="py-1 text-xs rounded border transition-colors cursor-pointer text-center"
                              [ngClass]="danmakuFontSize() === sz.px ? 'border-pink-500 bg-pink-500/20 text-pink-300 font-bold' : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'"
                            >
                              {{ sz.label }}
                            </button>
                          }
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </div>

              <!-- Center/Right: Danmaku Input Bar (Bilibili Style) -->
              <div class="flex-1 max-w-xl flex items-center gap-2">
                <!-- Color Picker Popover Button -->
                <div class="relative">
                  <button
                    (click)="showColorPicker = !showColorPicker"
                    class="w-8 h-8 rounded-lg border border-white/20 flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
                    [style.background-color]="selectedColor()"
                    title="Chọn màu bình luận"
                  ></button>

                  @if (showColorPicker) {
                    <div class="absolute bottom-full left-0 mb-2 bg-[#1e202c] border border-white/15 rounded-xl p-3 shadow-2xl z-40 grid grid-cols-3 gap-2">
                      @for (col of colorPalette; track col) {
                        <button
                          (click)="selectColor(col)"
                          class="w-7 h-7 rounded-md border border-black/30 hover:scale-110 transition-transform cursor-pointer"
                          [style.background-color]="col"
                        ></button>
                      }
                    </div>
                  }
                </div>

                <!-- Input Text Box -->
                <div class="flex-1 relative flex items-center">
                  <input
                    type="text"
                    [(ngModel)]="inputText"
                    (keydown.enter)="sendComment()"
                    maxlength="60"
                    placeholder="Bình luận chạy ngang phim (tối đa 60 ký tự)..."
                    class="w-full bg-white/10 border border-white/15 focus:border-pink-500/80 rounded-full py-1.5 pl-4 pr-12 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none transition-colors"
                  />
                  <button
                    (click)="sendComment()"
                    [disabled]="!inputText.trim()"
                    class="absolute right-1 px-3 py-1 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                  >
                    Gửi
                  </button>
                </div>

                <!-- Fullscreen Toggle Button -->
                <button
                  (click)="toggleFullscreen()"
                  class="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-colors cursor-pointer text-xs"
                  title="Toàn màn hình"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Host Actions Bar (Visible to Host only) -->
            @if (isHost()) {
              <div class="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div class="flex items-center gap-2 text-slate-400">
                  <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
                  <span class="font-bold text-cyan-300">Bảng điều khiển chủ phòng</span>
                  <span class="text-white/20">|</span>
                  <span>Trạng thái: <strong class="text-white">{{ playbackStatus() }}</strong></span>
                </div>

                <div class="flex items-center gap-2">
                  <button
                    (click)="hostSeekRelative(-10)"
                    class="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
                  >
                    ⏪ -10s
                  </button>
                  <button
                    (click)="hostSeekRelative(10)"
                    class="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
                  >
                    ⏩ +10s
                  </button>
                  <button
                    (click)="hostTogglePlay()"
                    class="px-3 py-1 rounded bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 font-bold transition-colors"
                  >
                    {{ isPlaying() ? 'Tạm dừng tất cả' : 'Tiếp tục phát' }}
                  </button>
                </div>
              </div>
            }
          </div>
        </section>

        <!-- Right Side: Live Chat & Danmaku History (Collapsible) -->
        <aside
          class="bg-[#12141c] border-l border-white/10 flex flex-col transition-all duration-300 z-10"
          [ngClass]="chatCollapsed() ? 'w-0 lg:w-0 overflow-hidden border-none' : 'w-full lg:w-80 h-72 lg:h-auto'"
        >
          <!-- Chat Header -->
          @if (watchError()) {
            <p role="alert" class="px-3 py-2 text-xs text-amber-300">{{ watchError() }}</p>
          }
          <div class="p-3 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
            <div class="flex items-center gap-2">
              <span class="font-bold text-xs text-white">Khung trò chuyện</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-slate-400 font-mono">
                {{ chatMessages().length }}
              </span>
            </div>
            <button
              (click)="chatCollapsed.set(true)"
              class="text-slate-400 hover:text-white text-xs p-1 rounded hover:bg-white/5 cursor-pointer"
              title="Thu gọn khung chat"
            >
              ✕
            </button>
          </div>

          <!-- Chat Messages Scroll Area -->
          <div class="flex-1 p-3 overflow-y-auto flex flex-col gap-2.5 text-xs font-sans" #chatScrollArea>
            @for (msg of chatMessages(); track msg.id) {
              <div class="flex items-start justify-between group rounded p-1 hover:bg-white/[0.03] transition-colors">
                <div class="flex-1 min-w-0 pr-2">
                  <div class="flex items-baseline gap-1.5 mb-0.5">
                    <span class="font-bold text-slate-300 truncate max-w-[120px]">{{ msg.nickname }}</span>
                    <span class="text-[10px] text-slate-500 font-mono">{{ msg.phase === 'LOBBY' ? 'Phòng chờ' : formatTime(msg.timeOffset) }}</span>
                  </div>
                  <p class="break-words font-medium" [style.color]="msg.color || '#ffffff'">
                    {{ msg.text }}
                  </p>
                </div>

                <!-- Host delete action -->
                @if (isHost()) {
                  <button
                    (click)="deleteMessage(msg.id)"
                    class="opacity-0 group-hover:opacity-100 text-[10px] text-red-400 hover:text-red-300 px-1 py-0.5 rounded bg-red-500/10 transition-opacity"
                    title="Xoá bình luận này (Chủ phòng)"
                  >
                    Xoá
                  </button>
                }
              </div>
            }
          </div>

          <!-- Mobile Nickname Quick Bar inside Chat -->
          <div class="p-2.5 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-slate-400">
            <span>Bạn là: <strong class="text-cyan-300">{{ nickname() }}</strong></span>
            <button (click)="showNicknamePrompt = true" class="text-pink-400 hover:underline">
              Đổi tên
            </button>
          </div>
        </aside>

        <!-- Toggle Chat Expand Button when collapsed -->
        @if (chatCollapsed()) {
          <button
            (click)="chatCollapsed.set(false)"
            class="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-lg bg-[#161820]/90 border border-white/15 text-xs font-semibold text-white shadow-xl hover:bg-white/10 cursor-pointer flex items-center gap-1.5 backdrop-blur-md"
            title="Mở khung trò chuyện"
          >
            <span>💬</span>
            <span>Khung chat</span>
          </button>
        }
      </main>

      <!-- Nickname Edit Modal -->
      @if (showNicknamePrompt) {
        <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-[#1e202c] border border-white/15 rounded-2xl p-6 w-full max-w-sm shadow-2xl flex flex-col gap-4">
            <h3 class="font-bold text-base text-white">Chọn biệt danh trong phòng</h3>
            <p class="text-slate-400 text-xs">
              Tên này sẽ hiển thị cạnh bình luận của bạn trên video và khung chat.
            </p>
            <input
              type="text"
              [(ngModel)]="tempNickname"
              (keydown.enter)="saveNickname()"
              maxlength="32"
              placeholder="Nhập biệt danh..."
              class="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-pink-500"
            />
            <div class="flex justify-end gap-2">
              <button
                (click)="showNicknamePrompt = false"
                class="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                Hủy
              </button>
              <button
                (click)="saveNickname()"
                class="px-5 py-2 rounded-xl bg-pink-500 text-white font-bold text-xs shadow-md hover:bg-pink-600 active:scale-95 transition-all"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
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
  private readonly clock = signal(Date.now());
  readonly snapshot = computed(() => this.watchRoomService.getLivePlaybackSnapshot(this.clock()));
  readonly watchError = this.watchRoomService.lastError;
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
  private refreshInterval?: ReturnType<typeof setInterval>;
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

  readonly countdownDisplay = computed(() => {
    const snap = this.snapshot();
    const sec = snap?.countdownSeconds || 0;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')} : ${s.toString().padStart(2, '0')}`;
  });

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
    this.subs.add(this.watchRoomService.getRoom(this.roomId, hostToken).subscribe({
      next: (room) => {
        if (room.videoDuration) {
          this.videoDuration.set(room.videoDuration);
        }
        // Connect WebSocket
        this.watchRoomService.connectWebSocket(this.roomId, this.nickname(), room.hostToken || hostToken);
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
    this.clock.set(Date.now());
    const video = this.videoPlayerRef?.nativeElement;
    if (!video || !this.hasUserEntered()) return;

    this.currentVideoTime.set(video.currentTime);
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
    if (!video || !snap || !this.hasUserEntered()) return;

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
    const duration = this.videoPlayerRef?.nativeElement.duration;
    if (duration && Number.isFinite(duration)) {
      this.videoDuration.set(duration);
      this.room.update(room => room ? { ...room, videoDuration: duration } : room);
    }
    this.performVideoSync(this.snapshot(), true);
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

  hostSeekRelative(deltaSec: number) {
    if (!this.isHost() || this.isLobby()) return;
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
    if (this.watchRoomService.sendDanmaku(text, timeOffset, this.selectedColor()) !== false) this.inputText = '';
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

  formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
