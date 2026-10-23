import { backOut, chain, clamp01, dir, easeIn2, easeInOut, easeOut3, lerp, M4, mul, perspective, point, project, rotX, rotY, rotZ, scaling, seeded, span, translate, V3, viewFrom } from './hero-math';

/**
 * Cảnh hộp game 3D ở hero trang chủ (logic thuần, không đụng GPU/DOM để kiểm thử được).
 * Mỗi mặt hộp, nắp, thẻ đều là một "quad" có hướng; renderer vẽ instanced từ một storage buffer.
 *
 * Instance = 5 × vec4:
 *  a: tâm xyz, kind
 *  b: nửa trục ngang (right × w/2) xyz, lớp texture mặt trước
 *  c: nửa trục dọc (up × h/2) xyz, lớp texture mặt sau (−1 = mặt sau vẽ thủ tục)
 *  d: màu rgba (màu mặt sau thẻ / màu hạt)
 *  e: alpha, foil, glow, bán kính bo góc (theo tỉ lệ cạnh ngắn)
 */
export const INST_FLOATS = 20;
export const KIND = { face: 0, card: 1, particle: 2, halo: 3 } as const;

/**
 * Chỉ số lớp texture logic. Lớp < BIG_LAYERS nằm ở mảng lớn (mặt hộp, cần nét), còn lại ở mảng nhỏ (gờ, vách, thẻ).
 */
export const LAYER = { front: 0, bottom: 3, inside: 4, lidRim: 5, wall: 6, card: 7 } as const;
export const BIG_LAYERS = 5;
export const CARD_COUNT = 12;
export const LAYER_COUNT = LAYER.card + CARD_COUNT;

export interface HeroTheme { color: string; ink: string }
export const HERO_THEMES: readonly HeroTheme[] = [
  { color: '#dafa76', ink: '#183c2b' },
  { color: '#ffacc9', ink: '#4f203c' },
  { color: '#b7cfff', ink: '#1d3760' },
];

/** Kích thước hộp (đơn vị thế giới). */
export const BOX = { w: 2.4, h: 3.1, d: 0.62, lid: 0.2 } as const;
const FLOATERS = 9;
const INNER = 5;
const PARTICLES = 90;
export const MAX_INSTANCES = 64 + FLOATERS * 2 + INNER * 2 + PARTICLES;

export interface HeroInput {
  /** Giây. */
  time: number;
  /** Con trỏ chuẩn hóa −0.5..0.5 (null khi không có chuột). */
  pointer: readonly [number, number] | null;
  /** Con trỏ theo px CSS trong khung canvas. */
  pointerPx: readonly [number, number] | null;
  /** Tiến độ cuộn trong đoạn ghim hero, 0..1. */
  scroll: number;
  width: number;
  height: number;
  /** Bật hạt/bong bóng (máy yếu thì tắt). */
  particles: boolean;
}

export interface HeroFrame {
  viewProj: M4;
  eye: V3;
  light: V3;
  /** Màu chủ đề tuyến tính hiện tại (đang chuyển màu thì nội suy). */
  theme: V3;
  instances: Float32Array;
  /** [đầu, số lượng] của nhóm vật thể đặc (có depth) và nhóm cộng sáng. */
  solids: [number, number];
  glows: [number, number];
  /** Độ nhòe chuyển động khi xoay đổi chủ đề (px CSS). */
  blur: number;
}

interface Floater { base: V3; next: V3; size: number; spin: number; phase: number; dur: number; rx: number; ry: number; angle: number }
interface Particle { x: number; y: number; z: number; speed: number; size: number; drift: number; phase: number }

const SWITCH = { spinIn: 0.6, spinOut: 1.5, implode: 0.5, hold: 0.3, explode: 0.9 } as const;

export function srgbToLinear(hex: string): V3 {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return [c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)];
}

export class HeroScene {
  readonly instances = new Float32Array(MAX_INSTANCES * INST_FLOATS);
  private count = 0;
  private readonly floaters: Floater[] = [];
  private readonly particles: Particle[] = [];
  private readonly rand: () => number;
  private mouse: [number, number] = [0, 0];
  private theme = 0;
  private fromTheme = 0;
  private switchAt = -1;
  private lastTime = 0;
  /** Lớp mặt hộp đang hiển thị (đổi ở đỉnh vòng xoay). */
  frontTheme = 0;
  /** Bộ thẻ đang hiển thị (đổi khi thẻ đã thu vào giữa). */
  cardTheme = 0;

  constructor(seed = 7) {
    this.rand = seeded(seed);
    // Vị trí gốc rải quanh hộp, tránh vùng giữa (tỉ lệ theo phần prompt Soda: thẻ lớn gần, nhỏ xa).
    const layout: [number, number, number, number][] = [
      [-3.2, -0.5, 0.4, 0.85], [3.4, 0.4, -0.6, 0.7], [-2.4, -2.4, 0.9, 0.8], [-5.2, 0.9, -2.2, 0.65],
      [1.6, -2.7, 1.2, 0.6], [0.4, 3.0, -2.0, 0.5], [-1.7, 2.8, -1.4, 0.55], [5.6, -0.9, -2.8, 0.55], [1.5, 3.2, -2.6, 0.5],
    ];
    layout.forEach(([x, y, z, size], i) => this.floaters.push({
      base: [x, y, z], next: [x, y, z], size, spin: (this.rand() - 0.5) * 0.6, phase: this.rand() * 6.28,
      dur: [5, 7, 6, 8, 5.5, 6.5, 9, 11, 10][i], rx: 0, ry: 0, angle: this.rand() * 6.28,
    }));
    for (let i = 0; i < PARTICLES; i++) {
      this.particles.push({ x: (this.rand() - 0.5) * 16, y: this.rand() * 12, z: -4 + this.rand() * 6.5, speed: 0.25 + this.rand() * 0.55, size: 0.03 + this.rand() * 0.09, drift: this.rand() * 6.28, phase: this.rand() });
    }
  }

  get activeTheme(): number { return this.theme; }
  get switching(): boolean { return this.switchAt >= 0 && this.lastTime - this.switchAt < SWITCH.spinIn + SWITCH.spinOut; }

  /** Bắt đầu chuyển chủ đề (xoay 720°, thẻ thu vào rồi bung ra). Trả false nếu đang chuyển dở. */
  setTheme(index: number, now: number): boolean {
    if (index === this.theme || this.switching) return false;
    this.fromTheme = this.theme;
    this.theme = index;
    this.switchAt = now;
    for (const f of this.floaters) {
      const jitter = (): number => (this.rand() - 0.5) * 1.1;
      f.next = [f.base[0] + jitter(), f.base[1] + jitter(), f.base[2] + jitter() * 0.6];
    }
    return true;
  }

  /** Đặt chủ đề ngay (không hoạt ảnh) — dùng khi khởi tạo. */
  jumpTheme(index: number): void { this.theme = this.fromTheme = this.frontTheme = this.cardTheme = index; this.switchAt = -1; }

  update(input: HeroInput): HeroFrame {
    const t = input.time;
    this.lastTime = t;
    this.count = 0;
    const aspect = Math.max(0.3, input.width / Math.max(1, input.height));
    // Camera lùi lại trên màn dọc để hộp + vài thẻ vẫn lọt khung.
    const fov = (30 * Math.PI) / 180, tanHalf = Math.tan(fov / 2);
    // Màn dọc (điện thoại): hộp nhỏ hơn và hạ xuống khoảng trống giữa phần chữ và bộ chọn chủ đề.
    const compact = aspect < 0.8;
    const camZ = Math.max(10.5, (compact ? 3.0 : 2.1) / (tanHalf * aspect));
    const proj = perspective(fov, aspect, 0.5, 60);
    const viewProj = mul(proj, viewFrom(0, 0, camZ));
    const eye: V3 = [0, 0, camZ];
    const light: V3 = [-5.5, 6.5, 9];
    const p = clamp01(input.scroll);

    // Con trỏ làm mượt (lerp 0.05 như prompt Soda, tính theo 60fps).
    const target = input.pointer ?? [0, 0];
    const k = 0.05;
    this.mouse[0] += (target[0] - this.mouse[0]) * k;
    this.mouse[1] += (target[1] - this.mouse[1]) * k;

    // --- Đổi chủ đề ---
    let spin = 0, blur = 0, gather = 0;
    let themeMix = 1;
    if (this.switchAt >= 0) {
      const e = t - this.switchAt;
      if (e < SWITCH.spinIn) {
        const u = easeIn2(e / SWITCH.spinIn);
        spin = u * Math.PI * 2; blur = u * 12;
      } else if (e < SWITCH.spinIn + SWITCH.spinOut) {
        const u = (e - SWITCH.spinIn) / SWITCH.spinOut;
        spin = Math.PI * 2 + backOut(u, 0.7) * Math.PI * 2; blur = (1 - u) * 12;
        this.frontTheme = this.theme;
      } else { this.frontTheme = this.theme; }
      if (e < SWITCH.implode) gather = easeIn2(e / SWITCH.implode);
      else {
        // Thẻ đã thu nhỏ ở giữa: đổi bộ thẻ và vị trí gốc mới (không thấy bước nhảy), rồi bung ra kiểu back.out.
        if (this.cardTheme !== this.theme) { this.cardTheme = this.theme; for (const f of this.floaters) f.base = f.next; }
        if (e < SWITCH.implode + SWITCH.hold) gather = 1;
        else if (e < SWITCH.implode + SWITCH.hold + SWITCH.explode) gather = 1 - backOut((e - SWITCH.implode - SWITCH.hold) / SWITCH.explode, 1.5);
        else if (e > SWITCH.spinIn + SWITCH.spinOut) this.switchAt = -1;
      }
      themeMix = clamp01(e / 1.5);
    }
    const from = srgbToLinear(HERO_THEMES[this.fromTheme].color), to = srgbToLinear(HERO_THEMES[this.theme].color);
    const mix = easeInOut(themeMix);
    const theme: V3 = [lerp(from[0], to[0], mix), lerp(from[1], to[1], mix), lerp(from[2], to[2], mix)];

    // --- Hộp ---
    const settle = easeInOut(span(p, 0, 0.35));
    // Khi mở hộp: nghiêng nhẹ để thấy chiều sâu khay thay vì nhìn thẳng một mặt phẳng.
    const yaw = lerp(this.mouse[0] * 0.7 - 0.32, -0.22 + this.mouse[0] * 0.15, settle) + spin;
    const pitch = lerp(this.mouse[1] * 0.35 + 0.12, -0.3, settle);
    const roll = lerp(-0.14, 0, settle);
    const bob = Math.sin(t * (Math.PI * 2 / 6)) * 0.12 * (1 - settle);
    const lift = lerp(0, -1.6, easeInOut(span(p, 0.25, 0.75)));
    const size = lerp(1, 0.8, easeInOut(span(p, 0.2, 0.7)));
    const drop = compact ? lerp(-0.9, 0, settle) : 0;
    const root = chain(translate(0, -0.15 + bob + lift + drop, 0), rotY(yaw), rotX(pitch), rotZ(roll), scaling(size));
    const open = easeInOut(span(p, 0.18, 0.55)) * 1.95;
    this.pushBox(root, open);

    // --- Thẻ trong hộp: bay lên xòe quạt khi cuộn ---
    const rise = easeInOut(span(p, 0.38, 0.8));
    const away = easeIn2(span(p, 0.84, 1));
    for (let i = 0; i < INNER; i++) {
      const o = i - (INNER - 1) / 2;
      const inBox = point(root, [0, -0.1, -BOX.d / 2 + 0.06 + i * 0.03]);
      const fan: V3 = [o * 1.3 * Math.min(1, aspect * 0.75), -0.15 - Math.abs(o) * 0.2 + Math.sin(t * 1.3 + i) * 0.05, 1.6 + i * 0.02];
      const out: V3 = [o * 6, fan[1] + 2.5 + Math.abs(o) * 0.6, 5];
      const r = Math.min(1, rise * 1.25 - i * 0.06);
      const ri = clamp01(r);
      let pos: V3 = [lerp(inBox[0], fan[0], ri), lerp(inBox[1], fan[1], ri), lerp(inBox[2], fan[2], ri)];
      pos = [lerp(pos[0], out[0], away), lerp(pos[1], out[1], away), lerp(pos[2], out[2], away)];
      if (rise <= 0.001) continue; // còn nằm trong hộp đóng: không vẽ
      const basis = chain(rotZ(-o * 0.16 * ri), rotX(lerp(pitch, 0, ri)), rotY(lerp(yaw, 0, ri) + away * o * 0.6));
      const card = this.cardLayer(i * 2 + 1);
      this.pushCard(pos, basis, 1.15, card, theme, 0.9);
    }

    // --- Thẻ bay quanh (berries): trôi, xoay, bị con trỏ đẩy, thu/bung khi đổi chủ đề ---
    const spread = 1 + 0.9 * easeOut3(span(p, 0.05, 0.7));
    const center = point(root, [0, 0, 0]);
    this.floaters.forEach((f, i) => {
      const phase = (t + i * 0.7) * (Math.PI * 2 / f.dur);
      const floatY = Math.sin(phase) * 0.15;
      const base: V3 = [f.base[0] * spread * Math.min(1, 0.55 + aspect * 0.32), f.base[1] * spread, f.base[2]];
      // Đẩy theo con trỏ trong không gian màn hình (bán kính 400px, lực 80px như prompt), quy đổi px → đơn vị thế giới.
      let targetRx = 0, targetRy = 0, speed = 1;
      const screen = input.pointerPx ? project(viewProj, base, input.width, input.height) : null;
      if (screen && input.pointerPx) {
        const dx = input.pointerPx[0] - screen[0], dy = input.pointerPx[1] - screen[1], dist = Math.hypot(dx, dy) || 1;
        if (dist < 400) {
          const force = (400 - dist) / 400;
          const worldPerPx = (2 * tanHalf * (camZ - base[2])) / input.height;
          targetRx = (dx / dist) * force * -80 * worldPerPx;
          targetRy = -(dy / dist) * force * -80 * worldPerPx;
          speed = 1 + force * 5;
        }
      }
      f.rx += (targetRx - f.rx) * 0.1;
      f.ry += (targetRy - f.ry) * 0.1;
      f.angle += 0.0035 * speed;
      const parallax = 0.6 + (f.base[2] + 3) * 0.25;
      let pos: V3 = [base[0] + f.rx + this.mouse[0] * parallax, base[1] + f.ry + floatY - this.mouse[1] * parallax, base[2]];
      let s = f.size;
      if (gather > 0) {
        pos = [lerp(pos[0], center[0], gather), lerp(pos[1], center[1], gather), lerp(pos[2], center[2], gather)];
        s = f.size * lerp(1, 0.1, gather);
      } else if (gather < 0) s = f.size * (1 - gather * 0.3); // vượt nhẹ khi bung ra
      const fade = 1 - easeIn2(span(p, 0.55, 0.95));
      if (fade <= 0.01 || s <= 0.02) return;
      const basis = chain(rotZ(Math.cos(phase) * 0.1 + f.spin), rotY(f.angle + i), rotX(0.2 * Math.sin(phase * 0.5)));
      this.pushCard(pos, basis, s * fade, this.cardLayer(i), theme, 0.6);
    });
    const solids: [number, number] = [0, this.count];

    // --- Nhóm cộng sáng: quầng sau hộp + bong bóng/hạt bay lên ---
    const glowFirst = this.count;
    this.pushHalo([center[0], center[1], -2.2], 4.6 + 0.6 * Math.sin(t * 0.8), theme, 0.32 + rise * 0.25);
    if (input.particles) {
      const range = 12;
      for (const q of this.particles) {
        const y = ((q.y + t * q.speed) % range) - range / 2;
        const x = q.x * Math.min(1.2, 0.5 + aspect * 0.35) + Math.sin(t * 0.6 + q.drift) * 0.25;
        const life = Math.sin(((y + range / 2) / range) * Math.PI);
        this.pushParticle([x, y, q.z], q.size, theme, life * (0.35 + 0.65 * q.phase));
      }
    }
    return { viewProj, eye, light, theme, instances: this.instances, solids, glows: [glowFirst, this.count - glowFirst], blur };
  }

  private cardLayer(i: number): number { return LAYER.card + ((i + this.cardTheme * 4) % CARD_COUNT); }

  private push(kind: number, c: V3, right: V3, up: V3, front: number, back: number, color: readonly number[], fx: readonly number[]): void {
    if (this.count >= MAX_INSTANCES) return;
    const o = this.count++ * INST_FLOATS, a = this.instances;
    a[o] = c[0]; a[o + 1] = c[1]; a[o + 2] = c[2]; a[o + 3] = kind;
    a[o + 4] = right[0]; a[o + 5] = right[1]; a[o + 6] = right[2]; a[o + 7] = front;
    a[o + 8] = up[0]; a[o + 9] = up[1]; a[o + 10] = up[2]; a[o + 11] = back;
    a[o + 12] = color[0]; a[o + 13] = color[1]; a[o + 14] = color[2]; a[o + 15] = color[3];
    a[o + 16] = fx[0]; a[o + 17] = fx[1]; a[o + 18] = fx[2]; a[o + 19] = fx[3];
  }

  /** Một mặt phẳng của hộp: tâm/trục trong hệ cục bộ, đổi sang thế giới bằng ma trận m. */
  private face(m: M4, c: V3, right: V3, up: V3, front: number, back: number): void {
    this.push(KIND.face, point(m, c), dir(m, right), dir(m, up), front, back, [0, 0, 0, 1], [1, 0, 0, 0]);
  }

  /** Hộp = khay (đáy + 4 vách) + nắp (mặt trên + 4 gờ) quay quanh bản lề ở mép trên. */
  private pushBox(root: M4, open: number): void {
    const { w, h, d, lid } = BOX;
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const ins = LAYER.inside;
    // Khay: đáy nhìn từ sau, sàn trong nhìn từ trước; vách ngoài/vách trong là hai mặt của cùng một quad.
    this.face(root, [0, 0, -hd], [-hw, 0, 0], [0, hh, 0], LAYER.bottom, ins);
    const wallH = d - 0.03;
    const wz = -hd + wallH / 2;
    this.face(root, [0, -hh, wz], [hw, 0, 0], [0, 0, wallH / 2], LAYER.wall, ins);
    this.face(root, [0, hh, wz], [-hw, 0, 0], [0, 0, wallH / 2], LAYER.wall, ins);
    this.face(root, [-hw, 0, wz], [0, -hh, 0], [0, 0, wallH / 2], LAYER.wall, ins);
    this.face(root, [hw, 0, wz], [0, hh, 0], [0, 0, wallH / 2], LAYER.wall, ins);
    // Nắp: bản lề ở (y = +hh, z = +hd); mở = quay quanh trục x ngược chiều để mặt nắp ngửa lên phía sau.
    const pad = 0.025;
    const lw = hw + pad, lh = hh + pad;
    const hinge = chain(root, translate(0, lh, hd), rotX(-open), translate(0, -lh, -hd));
    const front = LAYER.front + this.frontTheme;
    this.face(hinge, [0, 0, hd + 0.001], [lw, 0, 0], [0, lh, 0], front, ins);
    const rz = hd - lid / 2;
    this.face(hinge, [0, -lh, rz], [lw, 0, 0], [0, 0, lid / 2], LAYER.lidRim, ins);
    this.face(hinge, [0, lh, rz], [-lw, 0, 0], [0, 0, lid / 2], LAYER.lidRim, ins);
    this.face(hinge, [-lw, 0, rz], [0, -lh, 0], [0, 0, lid / 2], LAYER.lidRim, ins);
    this.face(hinge, [lw, 0, rz], [0, lh, 0], [0, 0, lid / 2], LAYER.lidRim, ins);
  }

  private pushCard(pos: V3, basis: M4, size: number, layer: number, theme: V3, foil: number): void {
    const w = size * 0.5, h = size * 0.7;
    this.push(KIND.card, pos, dir(basis, [w, 0, 0]), dir(basis, [0, h, 0]), layer, -1, [theme[0], theme[1], theme[2], 1], [1, foil, 0, 0.09]);
  }

  private pushHalo(pos: V3, size: number, theme: V3, strength: number): void {
    this.push(KIND.halo, pos, [size, 0, 0], [0, size, 0], 0, -1, [theme[0], theme[1], theme[2], 1], [strength, 0, 0, 0]);
  }

  private pushParticle(pos: V3, size: number, theme: V3, alpha: number): void {
    if (alpha <= 0.01) return;
    const c = [lerp(1, theme[0], 0.45), lerp(1, theme[1], 0.45), lerp(1, theme[2], 0.45), 1];
    this.push(KIND.particle, pos, [size, 0, 0], [0, size, 0], 0, -1, c, [alpha, 0, 0, 0]);
  }
}
