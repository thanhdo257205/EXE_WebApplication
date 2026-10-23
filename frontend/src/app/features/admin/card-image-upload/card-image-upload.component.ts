import { Component, inject, signal } from '@angular/core';
import { AdminContentService } from '../../../core/admin/admin-content.service';
import { CardImageError, prepareCardImage } from '../../../core/admin/card-image';

/**
 * Tải ảnh thẻ lên kho R2 (qua backend). Ảnh được co/nén WebP ngay trên trình duyệt, sau đó trả về đường dẫn
 * `/media/cards/<hash>.webp` để dán vào trường ảnh của thẻ. Cùng một ảnh tải lại sẽ ra cùng đường dẫn.
 */
@Component({
  selector: 'app-card-image-upload',
  templateUrl: './card-image-upload.component.html',
  styleUrl: './card-image-upload.component.css',
})
export class CardImageUploadComponent {
  private readonly admin = inject(AdminContentService);
  /** Bộ nén ảnh; tách thành trường để kiểm thử thay bằng bản giả (jsdom không có canvas/createImageBitmap). */
  prepareImage: (file: File) => Promise<Blob> = prepareCardImage;
  readonly busy = signal(false);
  readonly error = signal('');
  readonly result = signal<{ url: string; bytes: number } | null>(null);
  readonly preview = signal('');
  readonly copied = signal(false);

  async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.busy.set(true); this.error.set(''); this.result.set(null); this.copied.set(false);
    try {
      const blob = await this.prepareImage(file);
      const old = this.preview(); if (old) URL.revokeObjectURL(old);
      this.preview.set(URL.createObjectURL(blob));
      this.admin.uploadCardImage(blob).subscribe({
        next: response => { this.result.set({ url: response.url, bytes: response.bytes }); this.busy.set(false); },
        error: (problem: { title?: string; message?: string; status?: number }) => { this.error.set(this.explain(problem)); this.busy.set(false); },
      });
    } catch (error) {
      this.error.set(error instanceof CardImageError ? error.message : 'Không xử lý được ảnh.');
      this.busy.set(false);
    }
  }

  async copy(): Promise<void> {
    const url = this.result()?.url;
    if (!url) return;
    try { await navigator.clipboard.writeText(url); this.copied.set(true); } catch { this.copied.set(false); }
  }

  private explain(problem: { title?: string; message?: string; status?: number }): string {
    if (problem.status === 503) return 'Kho ảnh chưa được cấu hình hoặc đang lỗi. Kiểm tra biến R2 trên máy chủ.';
    if (problem.status === 415) return 'Định dạng ảnh không được hỗ trợ.';
    if (problem.status === 413) return 'Ảnh vượt quá 1 MB sau khi nén.';
    if (problem.status === 403) return 'Phiên quản trị đã hết hạn, hãy đăng nhập lại.';
    return problem.title || problem.message || 'Tải ảnh lên thất bại.';
  }
}
