import { CARD_COUNT, HERO_THEMES } from './hero-scene';

/** Kích thước lớp texture: mảng lớn cho mặt hộp, mảng nhỏ cho gờ/vách/thẻ. */
export const BIG_SIZE = { width: 768, height: 992 } as const;
export const SMALL_SIZE = { width: 384, height: 538 } as const;

/** Nội dung 12 mặt thẻ (theo bộ thẻ minh họa có sẵn trong `public/assets/cards`). */
export const CARD_FACES: readonly { top: string; bottom: string; color: string }[] = [
  { top: 'QUỸ', bottom: 'NHÀ CHUNG', color: '#edff78' }, { top: 'CHUYỆN', bottom: 'CÙNG NHÀ', color: '#ff91b2' },
  { top: 'HẾT', bottom: 'TIỀN RỒI!', color: '#a9c9ff' }, { top: 'ĐẾN', bottom: 'LƯỢT BẠN', color: '#ffa55c' },
  { top: 'TIỀN', bottom: 'ĐIỆN NƯỚC', color: '#edff78' }, { top: 'NHÀ', bottom: 'CÓ KHÁCH', color: '#ff91b2' },
  { top: 'CHIA', bottom: 'ĐỀU NHA', color: '#a9c9ff' }, { top: 'NGÀY', bottom: 'CUỐI THÁNG', color: '#ffa55c' },
  { top: 'MỘT', bottom: 'NHÀ VUI', color: '#edff78' }, { top: 'THÊM', bottom: 'CHÚT DRAMA', color: '#ff91b2' },
  { top: 'CHỐT', bottom: 'KÈO NÀO', color: '#a9c9ff' }, { top: 'VỀ', bottom: 'NHÀ THÔI', color: '#ffa55c' },
];
const CARD_INK = '#19382a';
const DISPLAY = "'Anton', Impact, sans-serif";
const BODY = "'Be Vietnam Pro', system-ui, sans-serif";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Surface = HTMLCanvasElement | OffscreenCanvas;

function surface(width: number, height: number): { canvas: Surface; ctx: Ctx } {
  const canvas: Surface = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('canvas-2d');
  return { canvas, ctx };
}

/** Vẽ ở khung đúng tỉ lệ mặt (w×h) rồi co giãn vào lớp texture; khi dán lên mặt cùng tỉ lệ thì hết méo. */
function layer(size: { width: number; height: number }, w: number, h: number, draw: (ctx: Ctx, w: number, h: number) => void): Surface {
  const art = surface(w, h);
  draw(art.ctx, w, h);
  const out = surface(size.width, size.height);
  out.ctx.drawImage(art.canvas as CanvasImageSource, 0, 0, size.width, size.height);
  return out.canvas;
}

function fitText(ctx: Ctx, text: string, font: (px: number) => string, maxWidth: number, start: number): number {
  let px = start;
  ctx.font = font(px);
  while (px > 8 && ctx.measureText(text).width > maxWidth) { px -= 2; ctx.font = font(px); }
  return px;
}

function grain(ctx: Ctx, w: number, h: number, alpha: number, seed = 1): void {
  let a = seed;
  const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  ctx.save();
  for (let i = 0; i < (w * h) / 90; i++) {
    ctx.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 1.4})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
  }
  ctx.restore();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function cover(ctx: Ctx, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number): void {
  const s = Math.max(w / img.width, h / img.height), sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/** Mặt nắp hộp theo chủ đề: nền mực đậm, chữ khổng lồ, ô cửa sổ ảnh căn nhà. */
function drawFront(ctx: Ctx, w: number, h: number, theme: number, house: ImageBitmap | null): void {
  const { color, ink } = HERO_THEMES[theme];
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, ink); g.addColorStop(1, shade(ink, -0.35));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, 0.035, 11 + theme);
  const m = w * 0.075;
  ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = 3;
  ctx.strokeRect(m * 0.5, m * 0.5, w - m, h - m);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.font = `700 ${w * 0.03}px ${BODY}`;
  ctx.textBaseline = 'top';
  ctx.fillText('CHƯA GIÀU ĐÃ LỚN', m, m * 1.05);
  ctx.textAlign = 'right'; ctx.fillText('BOARD GAME', w - m, m * 1.05); ctx.textAlign = 'left';
  const titleW = w - m * 2;
  const px = fitText(ctx, 'HƠI BÁO!', p => `400 ${p}px ${DISPLAY}`, titleW, w * 0.27);
  ctx.font = `400 ${px}px ${DISPLAY}`;
  // Anton có dấu tiếng Việt cao: đặt theo đường chân chữ để dấu không đè dòng nhãn phía trên.
  ctx.textBaseline = 'alphabetic';
  const top = m * 1.75 + px * 1.02;
  ctx.fillText('NHÀ NÀY', m, top);
  ctx.fillText('HƠI BÁO!', m, top + px * 1.04);
  ctx.textBaseline = 'top';
  const imgY = top + px * 1.04 + m * 0.5, imgH = h * 0.33;
  ctx.save(); roundRect(ctx, m, imgY, titleW, imgH, 18); ctx.clip();
  if (house) cover(ctx, house, m, imgY, titleW, imgH);
  else { ctx.fillStyle = shade(ink, 0.25); ctx.fillRect(m, imgY, titleW, imgH); }
  const v = ctx.createLinearGradient(0, imgY, 0, imgY + imgH);
  v.addColorStop(0.55, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = v; ctx.fillRect(m, imgY, titleW, imgH);
  ctx.restore();
  ctx.strokeStyle = color; ctx.lineWidth = 4; roundRect(ctx, m, imgY, titleW, imgH, 18); ctx.stroke();
  const capY = imgY + imgH + m * 0.55;
  ctx.font = `800 ${w * 0.04}px ${BODY}`;
  ctx.fillText('MỘT NHÀ. NHIỀU CHUYỆN.', m, capY);
  ctx.globalAlpha = 0.75; ctx.font = `500 ${w * 0.026}px ${BODY}`;
  ctx.fillText('Chia tiền · Chia việc · Chia vui · Chơi chung', m, capY + w * 0.065);
  ctx.globalAlpha = 0.55; ctx.font = `600 ${w * 0.022}px ${BODY}`;
  ctx.fillText('THIẾT KẾ MINH HỌA', m, h - m * 1.15);
  ctx.globalAlpha = 1;
  // Huy hiệu chữ N (logo tạm của site).
  const r = w * 0.085, cx = w - m - r, cy = h - m - r * 0.95;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ink; ctx.font = `400 ${r * 1.25}px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy + r * 0.05);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function drawBottom(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = '#10261c'; ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, 0.03, 5);
  const m = w * 0.08;
  ctx.fillStyle = '#dafa76'; ctx.textBaseline = 'top';
  ctx.font = `400 ${w * 0.11}px ${DISPLAY}`;
  ctx.fillText('NHÀ NÀY HƠI BÁO!', m, m);
  ctx.fillStyle = '#e8e6dd'; ctx.font = `500 ${w * 0.032}px ${BODY}`;
  const lines = ['Một board game về sống chung,', 'những hóa đơn và cả đống', 'chuyện bất ngờ.'];
  lines.forEach((line, i) => ctx.fillText(line, m, m + w * 0.17 + i * w * 0.05));
  ctx.globalAlpha = 0.5; ctx.font = `600 ${w * 0.024}px ${BODY}`;
  ctx.fillText('THIẾT KẾ MINH HỌA', m, h - m * 1.2);
  ctx.globalAlpha = 1;
}

/** Lòng hộp: nền xanh sẫm với lưới chấm xanh chanh mờ. */
function drawInside(ctx: Ctx, w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, '#1d4232'); g.addColorStop(1, '#0a1a13');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(218,250,118,0.16)';
  const step = w / 18;
  for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill(); }
}

function drawStrip(ctx: Ctx, w: number, h: number, text: string, bg: string, fg: string): void {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, 0.03, 3);
  ctx.fillStyle = fg; ctx.textBaseline = 'middle';
  ctx.font = `800 ${h * 0.42}px ${BODY}`;
  const step = ctx.measureText(text + '   ·   ').width;
  for (let x = h * 0.4; x < w; x += step) ctx.fillText(text + '   ·   ', x, h / 2);
}

/** Mặt thẻ 5:7 cùng phong cách bộ thẻ minh họa (màu nền, chữ lớn, biểu tượng xúc xắc). */
function drawCard(ctx: Ctx, w: number, h: number, index: number): void {
  const face = CARD_FACES[index];
  ctx.fillStyle = face.color; ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, 0.03, 21 + index);
  const m = w * 0.075;
  ctx.fillStyle = CARD_INK; ctx.textBaseline = 'top';
  ctx.font = `800 ${w * 0.042}px ${BODY}`;
  ctx.fillText('NHÀ NÀY HƠI BÁO!', m, m);
  ctx.textAlign = 'right'; ctx.fillText(String(index + 1).padStart(2, '0'), w - m, m); ctx.textAlign = 'left';
  ctx.font = `400 ${fitText(ctx, face.top, p => `400 ${p}px ${DISPLAY}`, w - m * 2, w * 0.24)}px ${DISPLAY}`;
  ctx.fillText(face.top, m, m * 2.2);
  // Ô vuông xoay + chấm xúc xắc.
  ctx.save();
  ctx.translate(w / 2, h * 0.53); ctx.rotate(((index % 4) - 1.5) * 0.12);
  const s = w * 0.42;
  roundRect(ctx, -s / 2, -s / 2, s, s, s * 0.16); ctx.fill();
  ctx.fillStyle = face.color;
  const pips = [[[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]]][index % 4];
  for (const [px, py] of pips) { ctx.beginPath(); ctx.arc(px * s * 0.25, py * s * 0.25, s * 0.075, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = CARD_INK;
  ctx.font = `400 ${fitText(ctx, face.bottom, p => `400 ${p}px ${DISPLAY}`, w - m * 2, w * 0.15)}px ${DISPLAY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(face.bottom, m, h - m * 1.6);
  ctx.font = `600 ${w * 0.026}px ${BODY}`;
  ctx.fillText('MẶT THẺ MINH HỌA', m, h - m * 0.75);
}

/** Làm sáng/tối một màu hex (t ∈ −1..1). */
export function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export interface HeroTextures { big: Surface[]; small: Surface[] }

/** Tải font + ảnh căn nhà rồi vẽ toàn bộ lớp. Thiếu ảnh vẫn vẽ được (ô ảnh tô màu). */
export async function buildHeroTextures(houseUrl: string, signal?: AbortSignal): Promise<HeroTextures> {
  if (typeof document !== 'undefined' && document.fonts) {
    await Promise.all([document.fonts.load(`400 64px Anton`), document.fonts.load(`800 32px 'Be Vietnam Pro'`), document.fonts.load(`500 32px 'Be Vietnam Pro'`)]).catch(() => undefined);
  }
  let house: ImageBitmap | null = null;
  try {
    const response = await fetch(houseUrl, { signal });
    if (response.ok) house = await createImageBitmap(await response.blob());
  } catch (error) { if (signal?.aborted) throw error; }
  const frontW = 616, frontH = 794; // tỉ lệ mặt nắp (2.45 × 3.15)
  const big: Surface[] = [
    ...HERO_THEMES.map((_, i) => layer(BIG_SIZE, frontW, frontH, (ctx, w, h) => drawFront(ctx, w, h, i, house))),
    layer(BIG_SIZE, 600, 775, drawBottom),
    layer(BIG_SIZE, 600, 775, drawInside),
  ];
  const small: Surface[] = [
    layer(SMALL_SIZE, 1200, 98, (ctx, w, h) => drawStrip(ctx, w, h, 'NHÀ NÀY HƠI BÁO!', '#0e2a1f', '#dafa76')),
    layer(SMALL_SIZE, 1200, 295, (ctx, w, h) => drawStrip(ctx, w, h, 'CHƯA GIÀU ĐÃ LỚN', '#123526', '#e8e6dd')),
    ...Array.from({ length: CARD_COUNT }, (_, i) => layer(SMALL_SIZE, 500, 700, (ctx, w, h) => drawCard(ctx, w, h, i))),
  ];
  house?.close();
  return { big, small };
}
