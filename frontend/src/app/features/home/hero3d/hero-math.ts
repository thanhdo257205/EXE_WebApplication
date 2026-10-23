/** Ma trận 4×4 cột-chủ đạo (như WGSL) cho cảnh hộp game ở trang chủ. Không phụ thuộc thư viện. */
export type V3 = [number, number, number];
export type M4 = Float32Array;

export const identity = (): M4 => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
export function mul(a: M4, b: M4): M4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = s;
  }
  return out;
}
export const translate = (x: number, y: number, z: number): M4 => { const m = identity(); m[12] = x; m[13] = y; m[14] = z; return m; };
export const scaling = (s: number): M4 => { const m = identity(); m[0] = m[5] = m[10] = s; return m; };
export function rotX(a: number): M4 { const m = identity(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
export function rotY(a: number): M4 { const m = identity(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
export function rotZ(a: number): M4 { const m = identity(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
/** Phiên bản ghi vào ma trận có sẵn (không cấp phát) cho vòng lặp mỗi khung. `out` không được trùng `a`/`b`. */
export function mulInto(out: M4, a: M4, b: M4): M4 {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
}
export function rotInto(out: M4, axis: 'x' | 'y' | 'z', angle: number): M4 {
  out.fill(0); out[15] = 1;
  const c = Math.cos(angle), s = Math.sin(angle);
  if (axis === 'x') { out[0] = 1; out[5] = c; out[6] = s; out[9] = -s; out[10] = c; }
  else if (axis === 'y') { out[5] = 1; out[0] = c; out[2] = -s; out[8] = s; out[10] = c; }
  else { out[10] = 1; out[0] = c; out[1] = s; out[4] = -s; out[5] = c; }
  return out;
}
/** Nhân lần lượt từ trái sang phải: chain(A, B, C) = A·B·C. */
export const chain = (...ms: M4[]): M4 => ms.reduce((acc, m) => mul(acc, m), identity());

export const point = (m: M4, p: V3): V3 => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
export const dir = (m: M4, d: V3): V3 => [
  m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
  m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
  m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
];

export function perspective(fovY: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovY / 2), m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = far / (near - far); m[11] = -1; m[14] = (far * near) / (near - far);
  return m;
}
/** Camera nhìn thẳng trục −z từ (x, y, z). */
export const viewFrom = (x: number, y: number, z: number): M4 => translate(-x, -y, -z);

/** Chiếu điểm thế giới ra px CSS; null nếu nằm sau camera. */
export function project(viewProj: M4, p: V3, width: number, height: number): [number, number] | null {
  const x = viewProj[0] * p[0] + viewProj[4] * p[1] + viewProj[8] * p[2] + viewProj[12];
  const y = viewProj[1] * p[0] + viewProj[5] * p[1] + viewProj[9] * p[2] + viewProj[13];
  const w = viewProj[3] * p[0] + viewProj[7] * p[1] + viewProj[11] * p[2] + viewProj[15];
  if (w <= 1e-6) return null;
  return [(x / w * 0.5 + 0.5) * width, (1 - (y / w * 0.5 + 0.5)) * height];
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Đoạn [a, b] của tiến độ p, chuẩn hóa về 0..1. */
export const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeIn2 = (t: number) => t * t;
export const easeOut3 = (t: number) => 1 - Math.pow(1 - t, 3);
/** back.out như GSAP (vượt nhẹ rồi về). */
export function backOut(t: number, s = 1.70158): number { const u = t - 1; return u * u * ((s + 1) * u + s) + 1; }

/** Số ngẫu nhiên xác định (mulberry32) để bố cục ổn định giữa các lần tải. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
