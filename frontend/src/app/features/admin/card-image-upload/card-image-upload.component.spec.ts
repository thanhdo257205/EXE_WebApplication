import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AdminContentService } from '../../../core/admin/admin-content.service';
import { CardImageError } from '../../../core/admin/card-image';
import { CardImageUploadComponent } from './card-image-upload.component';

const prepare = vi.fn();

function setup(upload: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({ imports: [CardImageUploadComponent], providers: [{ provide: AdminContentService, useValue: { uploadCardImage: upload } }] });
  const fixture = TestBed.createComponent(CardImageUploadComponent);
  fixture.componentInstance.prepareImage = prepare;
  fixture.detectChanges();
  const pick = async (file: File) => {
    const input = fixture.nativeElement.querySelector('input[type=file]') as HTMLInputElement;
    const event = { target: { files: [file], value: 'x' } } as unknown as Event;
    await fixture.componentInstance.choose(event); fixture.detectChanges();
    return input;
  };
  return { fixture, pick, el: fixture.nativeElement as HTMLElement };
}

describe('Tải ảnh thẻ lên R2 (admin)', () => {
  it('nén rồi tải lên và hiện đường dẫn trả về', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview'); URL.revokeObjectURL = vi.fn();
    const blob = new Blob(['webp'], { type: 'image/webp' });
    prepare.mockResolvedValue(blob);
    const upload = vi.fn(() => of({ url: `/media/cards/${'a'.repeat(64)}.webp`, bytes: 51200, contentType: 'image/webp' }));
    const { pick, el } = setup(upload);
    await pick(new File(['x'], 'the.png', { type: 'image/png' }));
    expect(upload).toHaveBeenCalledWith(blob);
    expect(el.querySelector('code')?.textContent).toContain(`/media/cards/${'a'.repeat(64)}.webp`);
    expect(el.textContent).toContain('50 kB');
  });

  it('báo lỗi dễ hiểu khi kho R2 chưa cấu hình (503) hoặc ảnh không hợp lệ', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview'); URL.revokeObjectURL = vi.fn();
    prepare.mockResolvedValue(new Blob(['w'], { type: 'image/webp' }));
    const { pick, el } = setup(vi.fn(() => throwError(() => ({ status: 503, title: 'MEDIA_STORAGE_DISABLED' }))));
    await pick(new File(['x'], 'the.png', { type: 'image/png' }));
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Kho ảnh chưa được cấu hình');
    prepare.mockRejectedValue(new CardImageError('Chỉ nhận ảnh PNG, JPEG hoặc WebP.'));
    await pick(new File(['x'], 'a.gif', { type: 'image/gif' }));
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Chỉ nhận ảnh');
  });
});
