/** Giới hạn của backend (`MAX_IMAGE_BYTES`) và kích thước đích: thẻ 5:7, tối đa 750×1050 (gấp 1,5 lần cỡ hiển thị lớn nhất). */
export const MAX_UPLOAD_BYTES = 1024 * 1024;
export const CARD_MAX = { width: 750, height: 1050 } as const;
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Co ảnh vào khung tối đa mà giữ tỉ lệ; không phóng to ảnh nhỏ. */
export function fitWithin(width: number, height: number, max: { width: number; height: number } = CARD_MAX): { width: number; height: number } {
  const scale = Math.min(1, max.width / width, max.height / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export class CardImageError extends Error {}

/**
 * Chuẩn bị ảnh trước khi tải lên: kiểm tra loại, co về tối đa 750×1050 và nén WebP, hạ dần chất lượng cho tới khi ≤ 1 MiB.
 * Ảnh WebP đã nhỏ và đúng khung được giữ nguyên để không nén hai lần.
 */
export async function prepareCardImage(file: File): Promise<Blob> {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) throw new CardImageError('Chỉ nhận ảnh PNG, JPEG hoặc WebP.');
  if (file.size > 25 * 1024 * 1024) throw new CardImageError('Ảnh gốc quá lớn (tối đa 25 MB).');
  const bitmap = await createImageBitmap(file).catch(() => { throw new CardImageError('Không đọc được ảnh này.'); });
  try {
    const target = fitWithin(bitmap.width, bitmap.height);
    const resized = target.width !== bitmap.width || target.height !== bitmap.height;
    if (file.type === 'image/webp' && !resized && file.size <= MAX_UPLOAD_BYTES) return file;
    const canvas = document.createElement('canvas');
    canvas.width = target.width; canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new CardImageError('Trình duyệt không xử lý được ảnh.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    for (const quality of [0.9, 0.82, 0.72, 0.6, 0.45]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (blob && blob.type === 'image/webp' && blob.size <= MAX_UPLOAD_BYTES) return blob;
    }
    throw new CardImageError('Không nén được ảnh xuống dưới 1 MB.');
  } finally { bitmap.close(); }
}
