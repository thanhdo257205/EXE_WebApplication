import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { AdminContentService } from '../../../core/admin/admin-content.service';
import { CardImageError, prepareCardImage } from '../../../core/admin/card-image';

/**
 * Tải ảnh thẻ lên kho đám mây (qua backend). Ảnh được co/nén WebP ngay trên trình duyệt, sau đó trả về đường dẫn
 * `/media/cards/<hash>.webp` để dán vào trường ảnh của thẻ. Cùng một ảnh tải lại sẽ ra cùng đường dẫn.
 */
@Component({
  selector: 'app-card-image-upload',
  templateUrl: './card-image-upload.component.html',
  styleUrl: './card-image-upload.component.css',
})
export class CardImageUploadComponent {
  private readonly admin = inject(AdminContentService);
  private readonly destroyRef = inject(DestroyRef);
  private uploadSub?: Subscription;
  private selection = 0;

  readonly disabled = input(false);
  readonly uploaded = output<string>();
  readonly busyChange = output<boolean>();

  /** Bộ nén ảnh; tách thành trường để kiểm thử thay bằng bản giả (jsdom không có canvas/createImageBitmap). */
  prepareImage: (file: File) => Promise<Blob> = prepareCardImage;
  readonly busy = signal(false);
  readonly error = signal('');
  readonly result = signal<{ url: string; bytes: number } | null>(null);
  readonly preview = signal('');
  readonly copied = signal(false);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.uploadSub?.unsubscribe();
      const old = this.preview();
      if (old) URL.revokeObjectURL(old);
    });
  }

  async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.disabled()) return;

    // Huỷ yêu cầu tải cũ nếu có và xoá kết quả cũ trước khi bắt đầu tải mới
    this.uploadSub?.unsubscribe();
    this.reset();
    const selection = this.selection;
    this.uploaded.emit('');
    this.setBusy(true);

    try {
      const blob = await this.prepareImage(file);
      if (this.destroyRef.destroyed || selection !== this.selection) return;

      const old = this.preview();
      if (old) URL.revokeObjectURL(old);
      this.preview.set(URL.createObjectURL(blob));

      this.uploadSub = this.admin
        .uploadCardImage(blob)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: response => {
            this.result.set({ url: response.url, bytes: response.bytes });
            this.setBusy(false);
            this.uploaded.emit(response.url);
          },
          error: (problem: { title?: string; message?: string; status?: number }) => {
            this.error.set(this.explain(problem));
            this.setBusy(false);
          },
        });
    } catch (error) {
      if (!this.destroyRef.destroyed && selection === this.selection) {
        this.error.set(error instanceof CardImageError ? error.message : 'Không xử lý được ảnh.');
        this.setBusy(false);
      }
    }
  }

  async copy(): Promise<void> {
    const url = this.result()?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  reset(): void {
    ++this.selection;
    this.uploadSub?.unsubscribe();
    this.uploadSub = undefined;
    const old = this.preview();
    if (old) URL.revokeObjectURL(old);
    this.preview.set('');
    this.result.set(null);
    this.error.set('');
    this.copied.set(false);
    this.setBusy(false);
  }

  private setBusy(value: boolean): void {
    this.busy.set(value);
    this.busyChange.emit(value);
  }

  private explain(problem: { title?: string; message?: string; status?: number }): string {
    if (problem.status === 503) return 'Kho ảnh chưa được cấu hình hoặc đang lỗi. Vui lòng thử lại sau.';
    if (problem.status === 415) return 'Định dạng ảnh không được hỗ trợ.';
    if (problem.status === 413) return 'Ảnh vượt quá 1 MB sau khi nén.';
    if (problem.status === 403) return 'Phiên quản trị đã hết hạn, hãy đăng nhập lại.';
    return problem.title || problem.message || 'Tải ảnh lên thất bại.';
  }
}
