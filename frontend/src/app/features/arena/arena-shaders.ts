/** WGSL cho sân đấu. Mọi tính toán ánh sáng ở không gian tuyến tính HDR; bước cuối tone-map + gamma. */

/** Instance = 5 × vec4: pos(x,y,z,kind) rot(rz,rx,ry,_) size(w,h,layer,alpha) fx(glow,foil,flash,fill/pad) color(rgba). */
export const INSTANCE_FLOATS = 20;
export const KIND = { card: 0, energyCard: 1, shadow: 2, orb: 3, particle: 4, slot: 5, bar: 6, glow: 7, table: 8, coin: 9 } as const;

export const SCENE_WGSL = /* wgsl */ `
struct Globals {
  viewProj: mat4x4<f32>,
  eye: vec4<f32>,
  time: vec4<f32>,   // x = giây, y = aspect
  light: vec4<f32>,
};
struct Inst { pos: vec4<f32>, rot: vec4<f32>, size: vec4<f32>, fx: vec4<f32>, color: vec4<f32> };
@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var<storage, read> insts: array<Inst>;
@group(0) @binding(2) var tex: texture_2d_array<f32>;
@group(0) @binding(3) var samp: sampler;

struct VOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) local: vec2<f32>,
  @location(2) @interpolate(flat) ii: u32,
  @location(3) world: vec3<f32>,
  @location(4) normal: vec3<f32>,
};

fn rot3(rz: f32, rx: f32, ry: f32) -> mat3x3<f32> {
  let cz = cos(rz); let sz = sin(rz); let cx = cos(rx); let sx = sin(rx); let cy = cos(ry); let sy = sin(ry);
  let mz = mat3x3<f32>(vec3<f32>(cz, sz, 0.0), vec3<f32>(-sz, cz, 0.0), vec3<f32>(0.0, 0.0, 1.0));
  let mx = mat3x3<f32>(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, cx, sx), vec3<f32>(0.0, -sx, cx));
  let my = mat3x3<f32>(vec3<f32>(cy, 0.0, -sy), vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(sy, 0.0, cy));
  return mz * mx * my;
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0));
  let c = corners[vi];
  let inst = insts[ii];
  let r = rot3(inst.rot.x, inst.rot.y, inst.rot.z);
  let wp = inst.pos.xyz + r * vec3<f32>(c.x * inst.size.x * 0.5, c.y * inst.size.y * 0.5, 0.0);
  var o: VOut;
  o.clip = g.viewProj * vec4<f32>(wp, 1.0);
  o.uv = vec2<f32>(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5);
  o.local = c;
  o.ii = ii;
  o.world = wp;
  o.normal = r * vec3<f32>(0.0, 0.0, 1.0);
  return o;
}

fn sdBox(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let q = abs(p) - b + vec2<f32>(r, r);
  return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
fn hash21(p: vec2<f32>) -> f32 {
  var q = fract(p * vec2<f32>(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}
fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2<f32>(1.0, 0.0)), u.x), mix(hash21(i + vec2<f32>(0.0, 1.0)), hash21(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}

fn cardBack(p: vec2<f32>, hb: vec2<f32>) -> vec3<f32> {
  let q = p / hb;
  let r = length(q);
  let rings = 0.5 + 0.5 * sin(r * 26.0 - g.time.x * 0.35);
  var col = mix(vec3<f32>(0.004, 0.008, 0.045), vec3<f32>(0.012, 0.010, 0.120), rings * (1.0 - 0.4 * r));
  let inner = sdBox(p, hb - vec2<f32>(0.075, 0.075), 0.05);
  col = mix(col, vec3<f32>(0.55, 0.9, 0.12), (1.0 - smoothstep(0.0, 0.018, abs(inner))) * 0.9);
  let emblem = abs(length(q * vec2<f32>(1.0, 0.73)) - 0.34);
  col = mix(col, vec3<f32>(0.6, 0.95, 0.2), (1.0 - smoothstep(0.0, 0.035, emblem)) * 0.85);
  let dot2 = length(q * vec2<f32>(1.0, 0.73));
  col += vec3<f32>(0.1, 0.25, 0.04) * (1.0 - smoothstep(0.0, 0.2, dot2));
  return col;
}

fn orbShade(l: vec2<f32>, base: vec3<f32>, glow: f32) -> vec4<f32> {
  let d = length(l);
  let a = 1.0 - smoothstep(0.9, 1.0, d);
  let z = sqrt(max(1.0 - d * d, 0.0));
  let n = vec3<f32>(l.x, l.y, z);
  let ld = normalize(vec3<f32>(-0.45, 0.6, 0.65));
  let diff = 0.28 + 0.9 * max(dot(n, ld), 0.0);
  let h = normalize(ld + vec3<f32>(0.0, 0.0, 1.0));
  let spec = pow(max(dot(n, h), 0.0), 48.0);
  let rim = pow(1.0 - z, 2.5);
  let col = base * diff * (1.0 + glow) + vec3<f32>(1.0, 1.0, 1.0) * spec * 1.2 + base * rim * 0.6;
  return vec4<f32>(col, a);
}

@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
  let inst = insts[in.ii];
  let kind = i32(inst.pos.w + 0.5);
  let layer = max(i32(inst.size.z + 0.5), 0);
  let texel = textureSample(tex, samp, in.uv, layer);
  let t = g.time.x;
  let alphaMul = inst.size.w;
  let pad = inst.fx.w;
  let dl = fwidth(in.local); // đạo hàm phải tính ngoài nhánh rẽ (kind đọc từ buffer nên không đồng nhất)

  if (kind == 0 || kind == 1) {
    let hb = inst.size.xy * 0.5;
    let p = in.local * hb;
    let sd = sdBox(p, hb, 0.1);
    let aa = max(dl.x * hb.x, dl.y * hb.y) * 0.9 + 0.0005;
    let mask = 1.0 - smoothstep(-aa, aa, sd);
    if (mask <= 0.003) { discard; }
    let nrm = normalize(in.normal);
    let v = normalize(g.eye.xyz - in.world);
    let facing = dot(nrm, v);
    let n = select(-nrm, nrm, facing >= 0.0);
    let l = normalize(g.light.xyz);
    let diff = 0.55 + 0.38 * max(dot(n, l), 0.0);
    var col: vec3<f32>;
    if (facing < 0.0) {
      col = cardBack(p, hb) * (0.8 + 0.4 * max(dot(n, l), 0.0));
    } else if (kind == 0) {
      col = texel.rgb * diff;
      let h = normalize(l + v);
      let spec = pow(max(dot(n, h), 0.0), 60.0);
      let ang = dot(n.xy, vec2<f32>(2.4, 1.7)) * 2.2 + in.uv.x * 1.3 + in.uv.y * 1.0 + t * 0.05;
      let rainbow = 0.5 + 0.5 * cos(6.2831853 * (ang + vec3<f32>(0.0, 0.33, 0.67)));
      let foil = inst.fx.y;
      col = mix(col, col * (0.7 + 1.1 * rainbow), foil * 0.3) + vec3<f32>(1.0, 0.93, 0.8) * spec * foil * 0.7;
      // Gờ sáng mảnh ở mép thẻ.
      col += vec3<f32>(0.8, 0.9, 1.0) * (1.0 - smoothstep(0.0, 0.03, abs(sd + 0.02))) * 0.08;
    } else {
      let q = p / hb;
      let base = inst.color.rgb;
      var bg = mix(vec3<f32>(0.004, 0.006, 0.012), base * 0.15, smoothstep(1.2, 0.0, length(q - vec2<f32>(0.0, 0.1))));
      let orb = orbShade((q - vec2<f32>(0.0, 0.12)) / 0.52, base * 1.3, 0.35);
      col = mix(bg, orb.rgb, orb.a);
      let frame = 1.0 - smoothstep(0.0, 0.02, abs(sdBox(p, hb - vec2<f32>(0.08, 0.08), 0.06)));
      col += base * frame * 0.5;
      col *= diff;
    }
    col = mix(col, vec3<f32>(1.4, 0.15, 0.1), clamp(inst.fx.z, 0.0, 1.0) * 0.6);
    let a = mask * alphaMul;
    return vec4<f32>(col * a, a);
  }
  if (kind == 2) { // bóng đổ mềm
    let hb = inst.size.xy * 0.5 - vec2<f32>(pad, pad);
    let p = in.local * inst.size.xy * 0.5;
    let sd = sdBox(p, hb, 0.1);
    let a = (1.0 - smoothstep(-pad * 0.8, pad * 0.9, sd)) * inst.color.a * alphaMul;
    return vec4<f32>(0.0, 0.0, 0.0, a);
  }
  if (kind == 3 || kind == 9) { // Năng lượng / đồng xu
    let o = orbShade(in.local, inst.color.rgb, inst.fx.x);
    let a = o.a * alphaMul;
    return vec4<f32>(o.rgb * a, a);
  }
  if (kind == 4) { // hạt cộng sáng
    let d = length(in.local);
    let a = exp(-d * d * 4.5) * (1.0 - smoothstep(0.85, 1.0, d)) * alphaMul;
    return vec4<f32>(inst.color.rgb * a * (1.0 + inst.fx.x), 0.0);
  }
  if (kind == 5) { // ô trống: viền nét đứt
    let hb = inst.size.xy * 0.5;
    let p = in.local * hb;
    let sd = sdBox(p, hb - vec2<f32>(0.04, 0.04), 0.12);
    let ring = 1.0 - smoothstep(0.0, 0.03, abs(sd));
    let ang = atan2(p.y, p.x) / 6.2831853;
    let dashes = step(0.5, fract((ang + t * 0.01) * 36.0));
    let pulse = mix(0.7, 0.55 + 0.45 * sin(t * 3.2), inst.fx.x);
    let fill = (1.0 - smoothstep(-0.01, 0.01, sd)) * (0.035 + 0.1 * inst.fx.x);
    let a = (ring * (0.35 + 0.65 * dashes) * pulse + fill) * inst.color.a * alphaMul;
    return vec4<f32>(inst.color.rgb * a * (1.0 + inst.fx.x), a);
  }
  if (kind == 6) { // thanh HP
    let hb = inst.size.xy * 0.5;
    let p = in.local * hb;
    let sd = sdBox(p, hb, hb.y);
    let aa = max(dl.x * hb.x, dl.y * hb.y) * 0.9 + 0.0005;
    let mask = 1.0 - smoothstep(-aa, aa, sd);
    if (mask <= 0.003) { discard; }
    let f = clamp(inst.fx.w, 0.0, 1.0);
    let x = in.local.x * 0.5 + 0.5;
    let low = vec3<f32>(0.9, 0.12, 0.08); let mid = vec3<f32>(0.95, 0.75, 0.1); let high = vec3<f32>(0.25, 0.85, 0.2);
    let fillCol = mix(mix(low, mid, smoothstep(0.0, 0.5, f)), high, smoothstep(0.5, 1.0, f));
    let inFill = 1.0 - smoothstep(f - 0.01, f + 0.01, x);
    let gloss = 1.0 + 0.5 * (1.0 - in.uv.y);
    var col = mix(vec3<f32>(0.004, 0.006, 0.01), fillCol * gloss * 0.75, inFill);
    col += vec3<f32>(1.0) * (1.0 - smoothstep(0.0, 0.025, abs(sd + 0.01))) * 0.05;
    let a = mask * alphaMul;
    return vec4<f32>(col * a, a);
  }
  if (kind == 7) { // quầng sáng quanh thẻ (cộng sáng)
    let hb = inst.size.xy * 0.5 - vec2<f32>(pad, pad);
    let p = in.local * inst.size.xy * 0.5;
    let sd = sdBox(p, hb, 0.1);
    let pulse = 0.75 + 0.25 * sin(t * 4.0);
    let a = exp(-max(sd, 0.0) * 6.5 / max(pad, 0.01)) * (1.0 - smoothstep(pad * 0.95, pad, sd)) * inst.fx.x * pulse * alphaMul;
    return vec4<f32>(inst.color.rgb * a, 0.0);
  }
  // kind 8: mặt bàn
  let w = in.world.xy;
  let rr = length(w * vec2<f32>(0.075, 0.105));
  var col = mix(vec3<f32>(0.016, 0.085, 0.060), vec3<f32>(0.002, 0.010, 0.014), smoothstep(0.05, 1.2, rr));
  let grain = vnoise(w * 46.0) * 0.55 + vnoise(w * 13.0) * 0.45;
  col *= 0.88 + 0.28 * grain;
  col += vec3<f32>(0.55, 0.9, 0.15) * exp(-abs(w.y) * 26.0) * 0.012;
  let pool0 = exp(-length((w - vec2<f32>(0.0, 1.75)) * vec2<f32>(0.38, 0.55)) * 1.8);
  let pool1 = exp(-length((w - vec2<f32>(0.0, -1.75)) * vec2<f32>(0.38, 0.55)) * 1.8);
  col += vec3<f32>(0.01, 0.075, 0.05) * (pool0 + pool1) * 0.55;
  return vec4<f32>(col, 1.0);
}
`;

export const MIP_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
struct V { @builtin(position) p: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var pts = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o: V; o.p = vec4<f32>(pts[i], 0.0, 1.0); o.uv = vec2<f32>(pts[i].x * 0.5 + 0.5, 0.5 - pts[i].y * 0.5); return o;
}
@fragment fn fs(v: V) -> @location(0) vec4<f32> { return textureSample(src, smp, v.uv); }
`;

const FULLSCREEN = /* wgsl */ `
struct V { @builtin(position) p: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var pts = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o: V; o.p = vec4<f32>(pts[i], 0.0, 1.0); o.uv = vec2<f32>(pts[i].x * 0.5 + 0.5, 0.5 - pts[i].y * 0.5); return o;
}
`;

/** Lọc phần sáng (ngưỡng mềm) xuống nửa độ phân giải. */
export const BLOOM_EXTRACT_WGSL = FULLSCREEN + /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@fragment fn fs(v: V) -> @location(0) vec4<f32> {
  let c = textureSample(src, smp, v.uv).rgb;
  let lum = max(c.r, max(c.g, c.b));
  let k = smoothstep(0.85, 2.0, lum);
  return vec4<f32>(c * k, 1.0);
}
`;

/** Gauss 9 điểm tách trục; hướng/độ lệch texel nằm trong uniform. */
export const BLOOM_BLUR_WGSL = FULLSCREEN + /* wgsl */ `
struct Dir { d: vec4<f32> };
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> dir: Dir;
@fragment fn fs(v: V) -> @location(0) vec4<f32> {
  var w = array<f32, 5>(0.2270270270, 0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162);
  var c = textureSample(src, smp, v.uv).rgb * w[0];
  for (var i = 1; i < 5; i++) {
    let o = dir.d.xy * f32(i) * 1.35;
    c += textureSample(src, smp, v.uv + o).rgb * w[i];
    c += textureSample(src, smp, v.uv - o).rgb * w[i];
  }
  return vec4<f32>(c, 1.0);
}
`;

/** Ghép cảnh + bloom, tone-map ACES, vignette, grain nhẹ, mã hóa sRGB. */
export const COMPOSITE_WGSL = FULLSCREEN + /* wgsl */ `
struct Post { p: vec4<f32> }; // x = bloom, y = giây, z = vignette, w = grain
@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var bloom: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;
@group(0) @binding(3) var<uniform> post: Post;
fn aces(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}
fn srgb(c: vec3<f32>) -> vec3<f32> {
  return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
fn hash(p: vec2<f32>) -> f32 { return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453); }
@fragment fn fs(v: V) -> @location(0) vec4<f32> {
  var c = textureSample(scene, smp, v.uv).rgb;
  c += textureSample(bloom, smp, v.uv).rgb * post.p.x;
  c = aces(c * 1.05);
  let q = v.uv - vec2<f32>(0.5, 0.5);
  c *= 1.0 - post.p.z * smoothstep(0.25, 0.95, length(q * vec2<f32>(1.0, 1.15)));
  c = srgb(c);
  c += (hash(v.uv * 913.0 + post.p.y) - 0.5) * post.p.w;
  return vec4<f32>(c, 1.0);
}
`;
