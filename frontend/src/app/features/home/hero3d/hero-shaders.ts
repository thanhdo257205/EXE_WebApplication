/** WGSL cho hộp game 3D ở hero. Tính sáng ở không gian tuyến tính, cuối cùng đưa về sRGB thủ công (canvas không dùng định dạng -srgb). */

const COMMON = /* wgsl */ `
struct Globals {
  viewProj: mat4x4<f32>,
  eye: vec4<f32>,
  light: vec4<f32>,  // vị trí đèn chính
  theme: vec4<f32>,  // rgb tuyến tính, w = giây
};
struct Inst { a: vec4<f32>, b: vec4<f32>, c: vec4<f32>, color: vec4<f32>, fx: vec4<f32> };
@group(0) @binding(0) var<uniform> g: Globals;
@group(0) @binding(1) var<storage, read> insts: array<Inst>;

struct VOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) local: vec2<f32>,
  @location(2) @interpolate(flat) ii: u32,
  @location(3) world: vec3<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0));
  let c = corners[vi];
  let inst = insts[ii];
  let kind = i32(inst.a.w + 0.5);
  var wp = inst.a.xyz + inst.b.xyz * c.x + inst.c.xyz * c.y;
  if (kind >= 2) {
    // Hạt và quầng luôn quay mặt về camera (billboard): dùng độ dài trục làm kích thước.
    wp = inst.a.xyz + vec3<f32>(c.x * length(inst.b.xyz), c.y * length(inst.c.xyz), 0.0);
  }
  var o: VOut;
  o.clip = g.viewProj * vec4<f32>(wp, 1.0);
  o.uv = vec2<f32>(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5);
  o.local = c;
  o.ii = ii;
  o.world = wp;
  return o;
}

fn toSrgb(c: vec3<f32>) -> vec3<f32> {
  let x = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
  return select(1.055 * pow(x, vec3<f32>(1.0 / 2.4)) - 0.055, x * 12.92, x <= vec3<f32>(0.0031308));
}
fn sdBox(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let q = abs(p) - b + vec2<f32>(r, r);
  return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
`;

/** Vật thể đặc: mặt hộp + thẻ. Bo góc thẻ bằng alpha-to-coverage (MSAA). */
export const SOLID_WGSL = COMMON + /* wgsl */ `
@group(0) @binding(2) var big: texture_2d_array<f32>;
@group(0) @binding(3) var small: texture_2d_array<f32>;
@group(0) @binding(4) var samp: sampler;

const BIG_LAYERS: i32 = 5;

fn sampleLayer(layer: i32, uv: vec2<f32>) -> vec3<f32> {
  // Lấy mẫu cả hai mảng ngoài nhánh để đạo hàm (mip) đồng nhất, rồi chọn.
  let a = textureSample(big, samp, uv, clamp(layer, 0, BIG_LAYERS - 1)).rgb;
  let b = textureSample(small, samp, uv, max(layer - BIG_LAYERS, 0)).rgb;
  return select(b, a, layer < BIG_LAYERS);
}

fn cardBack(q: vec2<f32>, theme: vec3<f32>, t: f32) -> vec3<f32> {
  let r = length(q * vec2<f32>(1.0, 0.72));
  let rings = 0.5 + 0.5 * sin(r * 30.0 - t * 0.6);
  var col = mix(vec3<f32>(0.006, 0.02, 0.012), theme * 0.08, rings * (1.0 - 0.5 * r));
  let frame = 1.0 - smoothstep(0.0, 0.025, abs(sdBox(q, vec2<f32>(0.86, 0.9), 0.08)));
  col = mix(col, theme, frame * 0.9);
  let emblem = 1.0 - smoothstep(0.0, 0.03, abs(r - 0.3));
  col = mix(col, theme, emblem * 0.85);
  col += theme * 0.25 * (1.0 - smoothstep(0.0, 0.22, r));
  return col;
}

struct FOut { @location(0) color: vec4<f32> };

@fragment
fn fs(in: VOut) -> FOut {
  let inst = insts[in.ii];
  let kind = i32(inst.a.w + 0.5);
  let front = i32(inst.b.w + 0.5);
  let back = i32(inst.c.w + 0.5);
  let t = g.theme.w;
  let theme = g.theme.rgb;
  let texFront = sampleLayer(front, in.uv);
  let texBack = sampleLayer(max(back, 0), vec2<f32>(1.0 - in.uv.x, in.uv.y));
  let dl = fwidth(in.local);

  let right = inst.b.xyz; let up = inst.c.xyz;
  var n = normalize(cross(right, up));
  let v = normalize(g.eye.xyz - in.world);
  let facing = dot(n, v);
  if (facing < 0.0) { n = -n; }
  // Đèn điểm (không phải hướng) để vệt bóng trên mặt phẳng có điểm sáng thay vì phủ đều cả mặt.
  let l = normalize(g.light.xyz - in.world);
  let h = normalize(l + v);
  let ndl = max(dot(n, l), 0.0);
  let fres = pow(1.0 - abs(facing), 3.0);

  var col: vec3<f32>;
  var alpha = 1.0;
  if (kind == 1) {
    // Thẻ: bo góc, mặt trước có ánh foil, mặt sau vẽ thủ tục theo màu chủ đề.
    let hb = vec2<f32>(length(right), length(up));
    let p = in.local * hb;
    let radius = inst.fx.w * min(hb.x, hb.y) * 2.0;
    let sd = sdBox(p, hb, radius);
    let aa = max(dl.x * hb.x, dl.y * hb.y) * 0.75 + 1e-4;
    alpha = 1.0 - smoothstep(-aa, aa, sd);
    if (alpha <= 0.01) { discard; }
    let diff = 0.5 + 0.62 * ndl;
    if (facing >= 0.0) {
      col = texFront * diff;
      let ang = dot(n.xy, vec2<f32>(2.4, 1.7)) * 2.0 + in.uv.x * 1.4 + in.uv.y + t * 0.05;
      let rainbow = 0.5 + 0.5 * cos(6.2831853 * (ang + vec3<f32>(0.0, 0.33, 0.67)));
      col = mix(col, col * (0.75 + 0.9 * rainbow), inst.fx.y * 0.28);
      col += vec3<f32>(1.0, 0.96, 0.88) * pow(max(dot(n, h), 0.0), 120.0) * 0.25 * inst.fx.y;
    } else {
      col = cardBack(in.local, inst.color.rgb, t) * (0.65 + 0.5 * ndl);
    }
    col += vec3<f32>(1.0) * (1.0 - smoothstep(0.0, aa * 3.0, abs(sd + aa * 2.0))) * 0.12;
  } else {
    // Mặt hộp: giấy in hơi bóng + gờ sáng ở mép + phản chiếu màu chủ đề ở góc nghiêng.
    let base = select(texBack, texFront, facing >= 0.0);
    let inside = facing < 0.0;
    let diff = select(0.6 + 0.55 * ndl, 0.3 + 0.45 * ndl, inside);
    col = base * diff;
    col += vec3<f32>(1.0, 0.97, 0.9) * pow(max(dot(n, h), 0.0), 140.0) * select(0.05, 0.01, inside);
    let edge = max(abs(in.local.x) * length(right) - length(right) + 0.025, abs(in.local.y) * length(up) - length(up) + 0.025);
    col += vec3<f32>(1.0) * smoothstep(0.0, 0.025, edge) * select(0.07, 0.02, inside) * (0.4 + ndl);
    col += theme * fres * select(0.35, 0.0, inside);
  }
  var o: FOut;
  o.color = vec4<f32>(toSrgb(col) * alpha, alpha);
  return o;
}
`;

/** Nhóm cộng sáng: quầng sau hộp + bong bóng/hạt bay lên. Không ghi depth. */
export const GLOW_WGSL = COMMON + /* wgsl */ `
@fragment
fn fs(in: VOut) -> @location(0) vec4<f32> {
  let inst = insts[in.ii];
  let kind = i32(inst.a.w + 0.5);
  let d = length(in.local);
  if (d > 1.0) { discard; }
  var c: vec3<f32>;
  if (kind == 3) {
    let k = exp(-d * d * 3.2) * inst.fx.x;
    c = inst.color.rgb * k;
  } else {
    // Bong bóng: viền sáng + chấm phản quang lệch trên-trái.
    let ring = smoothstep(0.62, 0.9, d) * (1.0 - smoothstep(0.9, 1.0, d));
    let spot = exp(-dot(in.local - vec2<f32>(-0.35, 0.38), in.local - vec2<f32>(-0.35, 0.38)) * 28.0);
    let body = (1.0 - d) * 0.12;
    c = inst.color.rgb * (ring * 0.9 + body + spot * 1.1) * inst.fx.x;
  }
  let s = toSrgb(c);
  // Canvas premultiplied: alpha nhỏ hơn màu để phần sáng "cộng" lên nền trang mà không làm tối nền.
  return vec4<f32>(s, max(s.r, max(s.g, s.b)) * 0.35);
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
