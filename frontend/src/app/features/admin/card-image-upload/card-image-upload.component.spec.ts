import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AdminContentService } from '../../../core/admin/admin-content.service';
import { CardImageError } from '../../../core/admin/card-image';
import { CardImageUploadComponent } from './card-image-upload.component';

const prepare = vi.fn();

function setup(upload: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    imports: [CardImageUploadComponent],
    providers: [{ provide: AdminContentService, useValue: { uploadCardImage: upload } }],
  });
  const fixture = TestBed.createComponent(CardImageUploadComponent);
  fixture.componentInstance.prepareImage = prepare;
  fixture.detectChanges();
  const pick = async (file: File) => {
    const input = fixture.nativeElement.querySelector('input[type=file]') as HTMLInputElement;
    const event = { target: { files: [file], value: 'x' } } as unknown as Event;
    await fixture.componentInstance.choose(event);
    fixture.detectChanges();
    return input;
  };
  return { fixture, pick, el: fixture.nativeElement as HTMLElement };
}

describe('Tải ảnh thẻ lên kho đám mây (admin)', () => {
  it('nén rồi tải lên và hiện đường dẫn trả về', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    const blob = new Blob(['webp'], { type: 'image/webp' });
    prepare.mockResolvedValue(blob);
    const upload = vi.fn(() => of({ url: `/media/cards/${'a'.repeat(64)}.webp`, bytes: 51200, contentType: 'image/webp' }));
    const { pick, el } = setup(upload);
    await pick(new File(['x'], 'the.png', { type: 'image/png' }));
    expect(upload).toHaveBeenCalledWith(blob);
    expect(el.querySelector('code')?.textContent).toContain(`/media/cards/${'a'.repeat(64)}.webp`);
    expect(el.textContent).toContain('50 kB');
  });

  it('báo lỗi dễ hiểu khi kho R2/Azure chưa cấu hình (503) hoặc ảnh không hợp lệ', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    prepare.mockResolvedValue(new Blob(['w'], { type: 'image/webp' }));
    const { pick, el } = setup(vi.fn(() => throwError(() => ({ status: 503, title: 'MEDIA_STORAGE_DISABLED' }))));
    await pick(new File(['x'], 'the.png', { type: 'image/png' }));
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Kho ảnh chưa được cấu hình');
    prepare.mockRejectedValue(new CardImageError('Chỉ nhận ảnh PNG, JPEG hoặc WebP.'));
    await pick(new File(['x'], 'a.gif', { type: 'image/gif' }));
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Chỉ nhận ảnh');
  });

  it('emits uploaded and busyChange on successful upload', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    const blob = new Blob(['webp'], { type: 'image/webp' });
    prepare.mockResolvedValue(blob);
    const expectedUrl = `/media/cards/${'b'.repeat(64)}.webp`;
    const upload = vi.fn(() => of({ url: expectedUrl, bytes: 20480, contentType: 'image/webp' }));
    const { fixture, pick } = setup(upload);

    let emittedUploaded = '';
    const busyStates: boolean[] = [];

    fixture.componentInstance.uploaded.subscribe(url => (emittedUploaded = url));
    fixture.componentInstance.busyChange.subscribe(busy => busyStates.push(busy));

    await pick(new File(['img'], 'card.jpg', { type: 'image/jpeg' }));

    expect(emittedUploaded).toBe(expectedUrl);
    expect(busyStates).toContain(true);
    expect(busyStates[busyStates.length - 1]).toBe(false);
  });

  it('resets preview, result and error on reset() and on new file selection', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    const blob = new Blob(['webp'], { type: 'image/webp' });
    prepare.mockResolvedValue(blob);
    const uploadSubject = new Subject<{ url: string; bytes: number; contentType: string }>();
    const upload = vi.fn(() => uploadSubject.asObservable());
    const { fixture, pick, el } = setup(upload);

    // Pick first file
    void pick(new File(['f1'], 'first.png', { type: 'image/png' }));
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.componentInstance.busy()).toBe(true);

    // Calling reset() clears state
    fixture.componentInstance.reset();
    fixture.detectChanges();
    expect(fixture.componentInstance.busy()).toBe(false);
    expect(fixture.componentInstance.preview()).toBe('');
    expect(fixture.componentInstance.result()).toBeNull();

    // Emitting on older subject now should not affect state
    uploadSubject.next({ url: '/media/cards/old.webp', bytes: 100, contentType: 'image/webp' });
    fixture.detectChanges();
    expect(fixture.componentInstance.result()).toBeNull();
  });

  it('does not trigger choose or upload when disabled is true', async () => {
    const upload = vi.fn();
    const { fixture, pick } = setup(upload);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    await pick(new File(['x'], 'card.png', { type: 'image/png' }));
    expect(upload).not.toHaveBeenCalled();
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('ignores image preparation that finishes after changing release/reset', async () => {
    let finish!: (blob: Blob) => void;
    prepare.mockReturnValue(new Promise<Blob>(resolve => { finish = resolve; }));
    const upload = vi.fn();
    const { fixture, pick } = setup(upload);
    const pending = pick(new File(['x'], 'old.png', { type: 'image/png' }));
    fixture.componentInstance.reset();
    finish(new Blob(['old'], { type: 'image/webp' }));
    await pending;
    expect(upload).not.toHaveBeenCalled();
    expect(fixture.componentInstance.preview()).toBe('');
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('clears previous artwork and ignores an older compression result after a new selection', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:latest');
    URL.revokeObjectURL = vi.fn();
    let finishOld!: (blob: Blob) => void;
    prepare.mockReturnValueOnce(new Promise<Blob>(resolve => { finishOld = resolve; }));
    const latest = new Blob(['new'], { type: 'image/webp' });
    prepare.mockResolvedValueOnce(latest);
    const url = `/media/cards/${'d'.repeat(64)}.webp`;
    const upload = vi.fn(() => of({ url, bytes: 3, contentType: 'image/webp' }));
    const { fixture, pick } = setup(upload);
    const emissions: string[] = [];
    fixture.componentInstance.uploaded.subscribe(value => emissions.push(value));
    const old = pick(new File(['old'], 'old.png', { type: 'image/png' }));
    await pick(new File(['new'], 'new.png', { type: 'image/png' }));
    finishOld(new Blob(['old'], { type: 'image/webp' }));
    await old;
    expect(upload).toHaveBeenCalledExactlyOnceWith(latest);
    expect(emissions).toEqual(['', '', url]);
    expect(fixture.componentInstance.result()?.url).toBe(url);
  });

  it('falls back to execCommand when the Clipboard API is rejected', async () => {
    const { fixture } = setup(vi.fn());
    fixture.componentInstance.result.set({ url: '/media/cards/fallback.webp', bytes: 1 });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
    });
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: typeof document.execCommand }).execCommand = exec;

    await fixture.componentInstance.copy();

    expect(exec).toHaveBeenCalledWith('copy');
    expect(fixture.componentInstance.copied()).toBe(true);
    expect(fixture.componentInstance.copyError()).toBe('');
  });

  it('asks for manual copy when both clipboard paths are blocked', async () => {
    const { fixture } = setup(vi.fn());
    fixture.componentInstance.preview.set('blob:blocked');
    fixture.componentInstance.result.set({ url: '/media/cards/blocked.webp', bytes: 1 });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
    });
    (document as unknown as { execCommand: typeof document.execCommand }).execCommand = vi.fn(() => false);

    await fixture.componentInstance.copy();
    fixture.detectChanges();

    expect(fixture.componentInstance.copied()).toBe(false);
    expect(fixture.componentInstance.copyError()).toContain('chép thủ công');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('chép thủ công');
  });
});
