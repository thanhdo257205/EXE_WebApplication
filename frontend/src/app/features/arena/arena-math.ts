/** Toán 3D nhỏ gọn cho camera và chọn thẻ (không phụ thuộc thư viện). Ma trận cột-chủ đạo (column-major) như WGSL. */
export type Vec3 = readonly [number, number, number];
export type Mat4 = Float32Array;

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalize = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Phối cảnh với độ sâu WebGPU (z clip 0..1). */
export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2), m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = far / (near - far); m[11] = -1; m[14] = (far * near) / (near - far);
  return m;
}
export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const z = normalize(sub(eye, target)), x = normalize(cross(up, z)), y = cross(z, x), m = new Float32Array(16);
  m[0] = x[0]; m[1] = y[0]; m[2] = z[0]; m[4] = x[1]; m[5] = y[1]; m[6] = z[1]; m[8] = x[2]; m[9] = y[2]; m[10] = z[2];
  m[12] = -dot(x, eye); m[13] = -dot(y, eye); m[14] = -dot(z, eye); m[15] = 1;
  return m;
}
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = s;
  }
  return out;
}
/** Chiếu điểm thế giới ra tọa độ màn hình (px CSS); trả null nếu nằm sau camera. */
export function project(viewProj: Mat4, p: Vec3, width: number, height: number): [number, number] | null {
  const x = viewProj[0] * p[0] + viewProj[4] * p[1] + viewProj[8] * p[2] + viewProj[12];
  const y = viewProj[1] * p[0] + viewProj[5] * p[1] + viewProj[9] * p[2] + viewProj[13];
  const w = viewProj[3] * p[0] + viewProj[7] * p[1] + viewProj[11] * p[2] + viewProj[15];
  if (w <= 1e-6) return null;
  return [(x / w * 0.5 + 0.5) * width, (1 - (y / w * 0.5 + 0.5)) * height];
}
export interface Camera { eye: Vec3; target: Vec3; fovY: number; viewProj: Mat4 }
/** Các điểm phải luôn lọt khung hình (bàn đấu + tay bài hai bên). */
const FIT_POINTS: readonly Vec3[] = [[-7.2, 7.0, 0.3], [7.2, 7.0, 0.3], [-7.2, -9.7, 0.9], [7.2, -9.7, 0.9], [-4.6, -10.1, 0.9], [4.6, -10.1, 0.9]];
const CAMERA_DIR = normalize([0, -9.2, 11.4]);
const CAMERA_FOV = (36 * Math.PI) / 180;
const fitCache = new Map<number, number>();

function buildCamera(aspect: number, distance: number, shake: Vec3): Camera {
  const target: Vec3 = [shake[0], -0.2 + shake[1], shake[2]];
  const eye = add(add(target, scale(CAMERA_DIR, distance)), [shake[0] * 0.6, shake[1] * 0.6, 0]);
  const viewProj = multiply(perspective(CAMERA_FOV, aspect, 0.5, 90), lookAt(eye, target, [0, 0, 1]));
  return { eye, target, fovY: CAMERA_FOV, viewProj };
}

/** Khoảng cách camera nhỏ nhất để mọi điểm FIT_POINTS nằm trong khung (giữ lề 3%). */
export function fitDistance(aspect: number): number {
  const key = Math.round(aspect * 1000);
  const cached = fitCache.get(key);
  if (cached) return cached;
  let distance = 10;
  for (; distance < 60; distance += 0.1) {
    const { viewProj } = buildCamera(aspect, distance, [0, 0, 0]);
    const inside = FIT_POINTS.every(point => {
      const s = project(viewProj, point, 2, 2);
      return !!s && s[0] > 0.03 && s[0] < 1.97 && s[1] > 0.03 && s[1] < 1.97;
    });
    if (inside) break;
  }
  fitCache.set(key, distance);
  return distance;
}

/** Camera nhìn xiên xuống mặt bàn, tự lùi để toàn bộ sân (kể cả tay bài) luôn nằm trong khung. */
export function makeCamera(aspect: number, shake: Vec3 = [0, 0, 0]): Camera {
  return buildCamera(aspect, fitDistance(Math.max(0.3, aspect)), shake);
}

/** Quay vector theo cách shader làm: Rz * Rx * Ry. */
export function rotate(v: Vec3, rz: number, rx: number, ry: number): Vec3 {
  let [x, y, z] = v;
  { const c = Math.cos(ry), s = Math.sin(ry); [x, z] = [c * x + s * z, -s * x + c * z]; }
  { const c = Math.cos(rx), s = Math.sin(rx); [y, z] = [c * y - s * z, s * y + c * z]; }
  { const c = Math.cos(rz), s = Math.sin(rz); [x, y] = [c * x - s * y, s * x + c * y]; }
  return [x, y, z];
}
/** 4 góc thế giới của một thẻ (đã quay/tịnh tiến), thứ tự quanh viền. */
export function quadCorners(pos: Vec3, w: number, h: number, rz: number, rx: number, ry: number): Vec3[] {
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([cx, cy]) => add(pos, rotate([cx * w / 2, cy * h / 2, 0], rz, rx, ry)));
}
export function pointInPolygon(point: readonly [number, number], polygon: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
