import { describe, expect, it } from 'vitest';
import { CARD_MAX, CardImageError, fitWithin, prepareCardImage } from './card-image';

describe('Chuẩn bị ảnh thẻ', () => {
  it('co về khung 750×1050 giữ tỉ lệ, không phóng to ảnh nhỏ', () => {
    expect(fitWithin(1500, 2100)).toEqual({ width: 750, height: 1050 });
    expect(fitWithin(3000, 1000)).toEqual({ width: 750, height: 250 });
    expect(fitWithin(500, 700)).toEqual({ width: 500, height: 700 });
    expect(fitWithin(1, 1, CARD_MAX)).toEqual({ width: 1, height: 1 });
  });

  it('từ chối loại không hỗ trợ và ảnh quá lớn trước khi giải mã', async () => {
    await expect(prepareCardImage(new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }))).rejects.toBeInstanceOf(CardImageError);
    await expect(prepareCardImage(new File(['x'], 'a.gif', { type: 'image/gif' }))).rejects.toThrow(/PNG, JPEG hoặc WebP/);
    const huge = new File([new Uint8Array(1)], 'a.png', { type: 'image/png' });
    Object.defineProperty(huge, 'size', { value: 30 * 1024 * 1024 });
    await expect(prepareCardImage(huge)).rejects.toThrow(/quá lớn/);
  });
});
