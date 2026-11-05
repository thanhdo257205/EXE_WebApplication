import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { COMPOSITION_BUFFER_MODE, FormsModule } from '@angular/forms';
import { ImeEnterDirective } from '../../shared/forms/ime-enter.directive';
import { Router, RouterModule } from '@angular/router';
import { WatchRoomService } from '../../core/watch-room/watch-room.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-watch-room-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ImeEnterDirective],
  // Vietnamese IMEs: the model must include the word still being composed when the form is sent.
  providers: [{ provide: COMPOSITION_BUFFER_MODE, useValue: false }],
  template: `
    <div class="min-h-screen bg-[#0e0f14] text-slate-100 flex flex-col font-sans">
      <!-- Header -->
      <header class="border-b border-white/10 bg-[#161820]/90 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <a routerLink="/" class="text-xs uppercase tracking-wider text-pink-400 font-bold hover:text-pink-300 transition-colors flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-pink-500"></span>
            Nhà Này Hơi Báo
          </a>
          <span class="text-white/20">/</span>
          <h1 class="font-bold text-base sm:text-lg text-white">Tạo phòng chiếu phim chung</h1>
        </div>
      </header>

      <!-- Main Creation Form -->
      <main class="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div class="w-full max-w-xl bg-[#161820] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6">
          <div>
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-500/20 text-pink-400 text-xs font-bold border border-pink-500/30 mb-2">
              Bilibili Watch Room
            </div>
            <h2 class="text-xl sm:text-2xl font-bold text-white mb-1">Tạo phòng chiếu trực tiếp</h2>
            <p class="text-slate-400 text-xs sm:text-sm">
              Chia sẻ liên kết cho 5-30 người cùng xem video đồng bộ thời gian thực với bình luận chạy ngang.
            </p>
          </div>

          @if (errorMessage()) {
            <div class="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <span>⚠️</span>
              <span>{{ errorMessage() }}</span>
            </div>
          }

          <form (ngSubmit)="submitCreate()" class="flex flex-col gap-5">
            <!-- Room Title -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-bold text-slate-300 uppercase tracking-wider">Tiêu đề buổi chiếu *</label>
              <input
                type="text"
                [(ngModel)]="title"
                name="title"
                appImeEnter
                (imeEnter)="submitCreate()"
                required
                maxlength="120"
                placeholder="Ví dụ: Đêm chiếu phim anime cùng cả nhà..."
                class="w-full bg-white/5 border border-white/15 focus:border-pink-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors"
              />
            </div>

            <!-- Video Source -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Nguồn video (Azure Blob Path hoặc URL MP4) *</span>
                <span class="text-[10px] text-pink-400 font-normal">H.264 / AAC</span>
              </label>
              <input
                type="text"
                [(ngModel)]="videoSource"
                name="videoSource"
                required
                maxlength="1024"
                placeholder="Ví dụ: videos/demo.mp4 hoặc https://...mp4"
                class="w-full bg-white/5 border border-white/15 focus:border-pink-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors font-mono"
              />

              <!-- Presets / Samples helper -->
              <div class="flex flex-wrap items-center gap-2 pt-1">
                <span class="text-[11px] text-slate-500">Mẫu thử:</span>
                <button
                  type="button"
                  (click)="videoSource = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'"
                  class="text-[11px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/10 cursor-pointer"
                >
                  Big Buck Bunny (MP4)
                </button>
                <button
                  type="button"
                  (click)="videoSource = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'"
                  class="text-[11px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/10 cursor-pointer"
                >
                  Elephants Dream (MP4)
                </button>
              </div>
            </div>

            <!-- Start Mode -->
            <div class="flex flex-col gap-2">
              <label class="text-xs font-bold text-slate-300 uppercase tracking-wider">Chế độ bắt đầu *</label>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  class="p-3.5 rounded-xl border flex flex-col gap-1 cursor-pointer transition-all"
                  [ngClass]="mode === 'HOST_TRIGGER' ? 'border-pink-500 bg-pink-500/10 text-white' : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'"
                >
                  <div class="flex items-center gap-2 font-bold text-sm">
                    <input type="radio" [(ngModel)]="mode" name="mode" value="HOST_TRIGGER" class="accent-pink-500" />
                    <span>Host bấm Bắt đầu</span>
                  </div>
                  <span class="text-xs opacity-80">Phòng ở trạng thái sảnh chờ, host bấm là cả phòng cùng xem.</span>
                </label>

                <label
                  class="p-3.5 rounded-xl border flex flex-col gap-1 cursor-pointer transition-all"
                  [ngClass]="mode === 'SCHEDULED' ? 'border-pink-500 bg-pink-500/10 text-white' : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'"
                >
                  <div class="flex items-center gap-2 font-bold text-sm">
                    <input type="radio" [(ngModel)]="mode" name="mode" value="SCHEDULED" class="accent-pink-500" />
                    <span>Hẹn giờ công chiếu</span>
                  </div>
                  <span class="text-xs opacity-80">Đếm ngược đến giờ hẹn rồi tự động phát cho mọi người.</span>
                </label>
              </div>
            </div>

            <!-- Scheduled Time Input -->
            @if (mode === 'SCHEDULED') {
              <div class="flex flex-col gap-1.5 p-3.5 rounded-xl bg-white/[0.03] border border-white/10">
                <label class="text-xs font-bold text-slate-300">Thời điểm công chiếu *</label>
                <input
                  type="datetime-local"
                  [(ngModel)]="scheduledTimeLocal"
                  name="scheduledTimeLocal"
                  required
                  class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
                />
                <span class="text-[11px] text-slate-500">Giờ sẽ được chuẩn hoá theo UTC trên máy chủ.</span>
              </div>
            }

            <!-- Submit Button -->
            <button
              type="submit"
              [disabled]="isSubmitting() || !title.trim() || !videoSource.trim()"
              class="w-full mt-2 py-3.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-bold text-sm shadow-xl shadow-pink-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
            >
              {{ isSubmitting() ? 'Đang khởi tạo phòng...' : '🚀 Tạo phòng & Vào xem ngay' }}
            </button>
          </form>
        </div>
      </main>
    </div>
  `,
})
export class WatchRoomCreatePage {
  private readonly router = inject(Router);
  private readonly watchRoomService = inject(WatchRoomService);

  title = '';
  videoSource = 'videos/1105-20261105-h264.mp4';
  mode: 'SCHEDULED' | 'HOST_TRIGGER' = 'HOST_TRIGGER';
  scheduledTimeLocal = '';
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  constructor() {
    // Default scheduled time: 10 minutes from now
    const d = new Date(Date.now() + 10 * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    this.scheduledTimeLocal = d.toISOString().slice(0, 16);
  }

  submitCreate() {
    this.errorMessage.set('');
    if (!this.title.trim()) {
      this.errorMessage.set('Vui lòng nhập tiêu đề phòng.');
      return;
    }
    if (!this.videoSource.trim()) {
      this.errorMessage.set('Vui lòng nhập nguồn video.');
      return;
    }

    let scheduledAt: string | null = null;
    if (this.mode === 'SCHEDULED') {
      if (!this.scheduledTimeLocal) {
        this.errorMessage.set('Vui lòng chọn thời gian công chiếu.');
        return;
      }
      const scheduledMs = Date.parse(this.scheduledTimeLocal);
      if (!Number.isFinite(scheduledMs) || scheduledMs <= Date.now()) {
        this.errorMessage.set('Vui lòng chọn thời điểm công chiếu trong tương lai.');
        return;
      }
      scheduledAt = new Date(scheduledMs).toISOString();
    }

    this.isSubmitting.set(true);

    this.watchRoomService.createRoom({
      title: this.title.trim(),
      videoSource: this.videoSource.trim(),
      mode: this.mode,
      scheduledAt,
    }).subscribe({
      next: (res) => {
        this.isSubmitting.set(false);
        // Save host token
        if (res.hostToken) {
          this.watchRoomService.setStoredHostToken(res.id, res.hostToken);
        }
        // Navigate to room
        this.router.navigate(['/room', res.id]);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        if (err.status === 401 || err.status === 403) {
          this.errorMessage.set('Chỉ quản trị viên (Admin) mới có quyền tạo phòng chiếu. Vui lòng đăng nhập tài khoản quản trị.');
        } else {
          this.errorMessage.set('Không thể tạo phòng chiếu. Vui lòng thử lại.');
        }
      },
    });
  }
}
