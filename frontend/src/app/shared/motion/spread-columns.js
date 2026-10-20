// User-supplied Column Spread engine. Preserve maths, constants and draw order.
function We(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
function Le(t, e, n) { return t + (e - t) * n; }
function xe(t, e, n) { return n <= e ? (t >= n ? 1 : 0) : We((t - e) / (n - e)); }
function bs(t) {
  let e = t >>> 0;
  return () => {
    ((e |= 0), (e = (e + 1831565813) | 0));
    let n = Math.imul(e ^ (e >>> 15), 1 | e);
    return ((n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n), ((n ^ (n >>> 14)) >>> 0) / 4294967296);
  };
}
const _5 = (t) => t;
const Va = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const D6 = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const Hm = (t) => 1 + 3.2 * Math.pow(t - 1, 3) + 2.2 * Math.pow(t - 1, 2);
const P6 = (t) => {
  const n = 2.5949095;
  return t < 0.5 ? (Math.pow(2 * t, 2) * ((n + 1) * 2 * t - n)) / 2
    : (Math.pow(2 * t - 2, 2) * ((n + 1) * (t * 2 - 2) + n) + 2) / 2;
};
const L6 = (t) => t < 1 / 2.75 ? 7.5625 * t * t
  : t < 2 / 2.75 ? 7.5625 * (t -= 1.5 / 2.75) * t + 0.75
  : t < 2.5 / 2.75 ? 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375
  : 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
const U6 = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const e = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * e) + 1;
};
function Ci(t, e, n, a) {
  const r = 3 * t, o = 3 * (n - t) - r, c = 1 - r - o,
    d = 3 * e, h = 3 * (a - e) - d, f = 1 - d - h,
    p = (y) => ((c * y + o) * y + r) * y,
    m = (y) => ((f * y + h) * y + d) * y,
    b = (y) => (3 * c * y + 2 * o) * y + r;
  return (y) => {
    if (y <= 0) return 0;
    if (y >= 1) return 1;
    let _ = y;
    for (let E = 0; E < 6; E++) {
      const T = p(_) - y;
      if (Math.abs(T) < 1e-5) return m(_);
      const k = b(_);
      if (Math.abs(k) < 1e-6) break;
      _ -= T / k;
    }
    let x = 0, w = 1;
    for (_ = y; w - x > 1e-5;) (p(_) < y ? (x = _) : (w = _), (_ = (x + w) / 2));
    return m(_);
  };
}
function I6(t) {
  const e = t.split(',').map(Number);
  return e.length !== 4 || e.some(Number.isNaN) ? null
    : [Math.min(1, Math.max(0, e[0])), e[1], Math.min(1, Math.max(0, e[2])), e[3]];
}
const H6 = { linear: _5, smooth: Va, natural: Ci(0.4, 0, 0.2, 1), slowdown: Ci(0, 0, 0.35, 1),
  snappy: D6, accelerate: Ci(0.55, 0, 0.85, 0.3), overshoot: Hm, bounce: L6, elastic: U6,
  impulse: Ci(0.5, -0.6, 0.3, 1), swing: P6 };
function w5(t, e = 60, n = '') {
  if (t === 'custom') {
    const a = I6(n);
    if (a) return Ci(...a);
    const r = Math.max(-100, Math.min(100, e)) / 100;
    if (r === 0) return _5;
    const o = 1 + Math.abs(r) * 4;
    return r > 0 ? (c) => 1 - Math.pow(1 - c, o) : (c) => Math.pow(c, o);
  }
  return H6[t] ?? Va;
}
function H(t, e, n) { const a = t[e]; return typeof a == 'number' ? a : n; }
function he(t, e, n) { const a = t[e]; return typeof a == 'string' ? a : n; }
function Bm(t, e, n) { const a = t[e]; return typeof a == 'boolean' ? a : n; }
function k5(t, e) { return Math.min(t, e) / 100; }
function G6(t, e, n) {
  const a = k5(t, e) * n;
  return { x: a, y: a, w: t - a * 2, h: e - a * 2 };
}
function Fm(t) { return 'videoWidth' in t ? { w: t.videoWidth, h: t.videoHeight } : { w: t.width, h: t.height }; }
function Xa(t, e, n, a, r, o) {
  const c = Math.max(0, Math.min(o, a / 2, r / 2));
  if ((t.beginPath(), typeof t.roundRect == 'function')) { t.roundRect(e, n, a, r, c); return; }
  (t.moveTo(e + c, n), t.arcTo(e + a, n, e + a, n + r, c), t.arcTo(e + a, n + r, e, n + r, c),
    t.arcTo(e, n + r, e, n, c), t.arcTo(e, n, e + a, n, c), t.closePath());
}
function Y6(t, e, n, a, r = 1, o = 0, c = 0) {
  const d = Math.max(n / t, a / e) * Math.max(r, 1e-4), h = n / d, f = a / d,
    p = (t - h) / 2, m = (e - f) / 2;
  return { sx: p * (1 + Math.max(-1, Math.min(1, o))), sy: m * (1 + Math.max(-1, Math.min(1, c))), sw: h, sh: f };
}
let jc = null;
function W6(t) { jc = t; }
let T5 = !1;
function V6(t) { T5 = t; }
function M5(t, e, n, a, r) {
  const o = r.unit > 0 ? a / r.unit : 1;
  (t.save(), (t.shadowColor = r.color), (t.shadowBlur = r.blur * o));
  let c = 0, d = 0, h = !1;
  const f = 1e5;
  try {
    const m = t.getTransform(), b = m.a * m.d - m.b * m.c;
    b && ((c = (-f * m.d) / b), (d = (f * m.b) / b), (h = !0));
  } catch {}
  ((t.shadowOffsetX = (h ? f : 0) + r.offX), (t.shadowOffsetY = r.offY));
  const p = h ? r.spread : Math.min(r.spread, -1);
  (Xa(t, e.x + c - p, e.y + d - p, Math.max(0, e.w + p * 2), Math.max(0, e.h + p * 2), Math.max(0, n + p)),
    (t.fillStyle = '#000'), t.fill(), t.restore());
}
function qm(t, e, n, a) {
  (t.save(), Xa(t, e.x, e.y, e.w, e.h, n), t.clip());
  const r = 30 + ((a * 11) % 30);
  ((t.fillStyle = `hsl(230, 6%, ${r}%)`), t.fillRect(e.x, e.y, e.w, e.h), t.restore());
}
function Ds(t, e, n, a, r = {}) {
  if (n.w <= 0 || n.h <= 0) return;
  const o = r.alpha ?? 1;
  if (o <= 0) return;
  const c = e ? Fm(e) : null;
  if (!e || !c || c.w <= 0 || c.h <= 0) { (t.save(), (t.globalAlpha *= o), qm(t, n, a, 0), t.restore()); return; }
  const d = Y6(c.w, c.h, n.w, n.h, r.zoom, r.panX, r.panY);
  (t.save(), (t.globalAlpha *= o), Xa(t, n.x, n.y, n.w, n.h, a), t.clip(),
    t.drawImage(e, d.sx, d.sy, d.sw, d.sh, n.x, n.y, n.w, n.h), t.restore());
}
function Re(t, e, n, a, r, o = {}) {
  if (a.w <= 0 || a.h <= 0) return;
  const c = o.alpha ?? 1;
  if (c <= 0) return;
  const d = e ? Fm(e) : null, h = e && d && d.w > 0 && d.h > 0;
  if (T5 && h) {
    const f = d.w / d.h;
    let p = a.w, m = a.h;
    (p / m > f ? (p = m * f) : (m = p / f),
      (a = { x: a.x + (a.w - p) / 2, y: a.y + (a.h - m) / 2, w: p, h: m }));
  }
  (t.save(), (t.globalAlpha *= c), o.shadow && o.shadow > 0 && jc && M5(t, a, r, o.shadow, jc),
    h ? Ds(t, e, a, r, { zoom: o.zoom, panX: o.panX, panY: o.panY }) : qm(t, a, r, n), t.restore());
}
const om = [
  { id: 'dusk', label: 'Dusk', angle: 135, stops: [{ at: 0, color: '#2b1055' }, { at: 1, color: '#7597de' }] },
  { id: 'ember', label: 'Ember', angle: 135, stops: [{ at: 0, color: '#f12711' }, { at: 1, color: '#f5af19' }] },
  { id: 'mint', label: 'Mint', angle: 135, stops: [{ at: 0, color: '#0f2027' }, { at: 0.5, color: '#203a43' }, { at: 1, color: '#2c5364' }] },
  { id: 'grape', label: 'Grape', angle: 135, stops: [{ at: 0, color: '#41295a' }, { at: 1, color: '#2f0743' }] },
  { id: 'peach', label: 'Peach', angle: 135, stops: [{ at: 0, color: '#ee9ca7' }, { at: 1, color: '#ffdde1' }] },
  { id: 'slate', label: 'Slate', angle: 135, stops: [{ at: 0, color: '#232526' }, { at: 1, color: '#414345' }] },
  { id: 'halo', label: 'Halo', angle: 0, radial: !0, stops: [{ at: 0, color: '#3a3a5a' }, { at: 1, color: '#0d0d14' }] },
];
function X6(t) { return om.find((e) => e.id === t); }
function J6(t) {
  try {
    const e = JSON.parse(t);
    if (!e || !Array.isArray(e.stops) || e.stops.length < 2) return null;
    const n = e.stops.filter((a) => a && typeof a.color == 'string')
      .map((a) => ({ at: Math.min(1, Math.max(0, Number(a.at) || 0)), color: a.color }));
    return n.length < 2 ? null : { id: 'custom', label: 'Custom', angle: Number(e.angle) || 0, radial: !!e.radial, stops: n };
  } catch { return null; }
}
function Z6(t, e, n, a) {
  let r;
  if (a.radial) { const o = Math.hypot(e, n) / 2; r = t.createRadialGradient(e / 2, n / 2, 0, e / 2, n / 2, o); }
  else {
    const o = (a.angle * Math.PI) / 180, c = e / 2, d = n / 2,
      h = (Math.abs(Math.cos(o)) * e + Math.abs(Math.sin(o)) * n) / 2,
      f = Math.cos(o) * h, p = Math.sin(o) * h;
    r = t.createLinearGradient(c - f, d - p, c + f, d + p);
  }
  for (const o of a.stops) r.addColorStop(o.at, o.color);
  ((t.fillStyle = r), t.fillRect(0, 0, e, n));
}
const Q6 = [{ value: '1:1', label: '1:1' }, { value: '4:3', label: '4:3' }, { value: '3:4', label: '3:4' },
  { value: '4:5', label: '4:5' }, { value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }];
const it = [{ value: 'auto', label: 'Auto' }, ...Q6];
const ez = 0.25;
const tz = 4;
function nz(t) {
  if (!t) return 1;
  for (const e of t.images) {
    if (!e) continue;
    const { w: n, h: a } = Fm(e);
    if (n > 0 && a > 0) return Math.min(Math.max(n / a, ez), tz);
  }
  return 1;
}
function et(t, e) {
  if (t === 'auto') return nz(e);
  switch (t) {
    case '4:3': return 4 / 3;
    case '3:4': return 3 / 4;
    case '16:9': return 16 / 9;
    case '9:16': return 9 / 16;
    case '4:5': return 4 / 5;
    case '5:4': return 5 / 4;
    case '1:1': default: return 1;
  }
}
function sz(t, e) {
  const n = /^#?([0-9a-f]{6})$/i.exec(t.trim());
  if (!n) return `rgba(0,0,0,${e})`;
  const a = parseInt(n[1], 16);
  return `rgba(${(a >> 16) & 255},${(a >> 8) & 255},${a & 255},${e})`;
}
function He(t) {
  const { ctx: e, width: n, height: a, params: r } = t;
  try { ((e.imageSmoothingEnabled = !0), (e.imageSmoothingQuality = 'high')); } catch {}
  (e.setTransform(1, 0, 0, 1, 0, 0), e.clearRect(0, 0, n, a),
    (e.fillStyle = he(r, 'background', '#101014')), e.fillRect(0, 0, n, a));
  const o = he(r, 'backgroundType', 'color');
  if (o === 'gradient') {
    const p = he(r, 'backgroundGradient', ''), m = p === 'custom' ? J6(he(r, 'backgroundGradientCustom', '')) : X6(p);
    m && Z6(e, n, a, m);
  } else (o === 'image' || o === 'preset') && t.background && Ds(e, t.background, { x: 0, y: 0, w: n, h: a }, 0);
  const c = k5(n, a), d = Bm(r, 'shadowEnabled', !1);
  (W6(d ? { offX: c * H(r, 'shadowX', 0), offY: c * H(r, 'shadowY', 1),
    blur: c * H(r, 'shadowBlur', 1.5), spread: c * H(r, 'shadowSpread', -0.25),
    color: sz(he(r, 'shadowColor', '#000000'), H(r, 'shadowOpacity', 40) / 100), unit: c } : null),
    V6(he(r, 'cardAspect', '') === 'auto'));
  const h = c * H(r, 'offsetX', 0), f = c * H(r, 'offsetY', 0);
  return ((h || f) && e.translate(h, f), {
    u: c, content: G6(n, a, H(r, 'padding', 6)), radius: c * H(r, 'cornerRadius', 3),
    easeName: he(r, 'easing', 'smooth'), ease: w5(he(r, 'easing', 'smooth'), H(r, 'easeAmount', 60), he(r, 'easeBezier', '')),
    shadow: d ? c : 0,
  });
}
function je(t, e) { return t.images[e % t.images.length] ?? null; }
const kE = 12;
const Yj = 12;
const pw = [0.08, 0.22];
const gw = [0.7, 0.84];
const Wj = 0.42;
const Vj = 0.9;
function lm(t, e) { return ((t % e) + e) % e; }
function mw(t, e) { for (; e;) [t, e] = [e, t % e]; return t; }
function Xj(t, e, n) {
  for (let a = 0; a <= n; a++) if (lm(t - a * e, n) === 0 || lm(t + a * e, n) === 0) return a;
  return n;
}
const vw = new Map();
function Kj(t, e, n) {
  const a = `${t}:${e}:${n}`, r = vw.get(a);
  if (r) return r;
  const o = Math.max(1, t);
  let c = { a: 1, b: 1, spread: -1, gap: -1, reach: -1 };
  for (let b = 1; b <= o; b++) {
    const y = Math.min(o / mw(b, o), e);
    for (let _ = 1; _ <= o; _++) {
      const x = Math.min(o / mw(_, o), n), w = Xj(_, b, o);
      (x > c.spread || (x === c.spread && (y > c.gap || (y === c.gap && w > c.reach)))) &&
        (c = { a: _, b, spread: x, gap: y, reach: w });
    }
  }
  const d = Array.from({ length: o }, (b, y) => y), h = bs(o);
  for (let b = o - 1; b > 0; b--) {
    const y = Math.floor(h() * (b + 1));
    [d[b], d[y]] = [d[y], d[b]];
  }
  const { a: f, b: p } = c, m = { at: (b, y) => d[lm(f * b + p * y, o)] };
  return (vw.set(a, m), m);
}
function AE(t) {
  const e = t ? 'Column' : 'Row', n = t ? 'columns' : 'rows';
  return [
    { type: 'number', id: 'rows', label: t ? 'Columns' : 'Rows', default: 3, min: 1, max: 7, step: 1, visibleIf: { id: 'stackStyle', values: ['single'] } },
    { type: 'number', id: 'rowsOdd', label: t ? 'Columns' : 'Rows', default: 3, min: 1, max: 7, step: 2, visibleIf: { id: 'stackStyle', values: ['rowEdges'] } },
    { type: 'number', id: 'rowGap', label: `${e} gap`, default: 3, min: 0, max: 12, step: 0.5, unit: '%' },
    { type: 'number', id: 'cardGap', label: 'Card gap', default: 3, min: 0, max: 12, step: 0.5, unit: '%' },
    { type: 'select', id: 'stackStyle', label: 'Stack style', default: 'single', options: [{ value: 'single', label: 'Single point' }, { value: 'rowEdges', label: `${e} edges (odd ${n})` }] },
    { type: 'number', id: 'stackScale', label: 'Stack size', default: 50, min: 10, max: 100, step: 5, unit: '%' },
    { type: 'number', id: 'zoom', label: 'Camera zoom', default: 50, min: 0, max: 120, step: 5, unit: '%' },
    { type: 'number', id: 'drift', label: 'Drift', default: 16, min: 0, max: 40, step: 1, unit: '%' },
    { type: 'number', id: 'rowDelay', label: `${e} delay`, default: 4, min: 0, max: 12, step: 1, unit: '%' },
    { type: 'select', id: 'cardAspect', label: 'Card ratio', default: '1:1', options: it },
  ];
}
function TE(t, e) {
  const { ctx: n, t: a, width: r, height: o, params: c } = t,
    d = He(t),
    h = he(c, 'stackStyle', 'single') === 'rowEdges',
    f = Math.max(1, Math.round(H(c, h ? 'rowsOdd' : 'rows', 3))) | (h ? 1 : 0),
    p = Yj,
    m = Kj(Math.max(1, t.images.length), p, f),
    b = d.u * H(c, 'rowGap', 3),
    y = d.u * H(c, 'cardGap', 3),
    _ = (f - 1) / 2,
    x = H(c, 'stackScale', 50) / 100,
    w = H(c, 'zoom', 50) / 100,
    E = H(c, 'rowDelay', 4) / 100,
    T = e ? o : r,
    k = e ? d.content.w : d.content.h,
    A = e ? d.content.x : d.content.y,
    C = (e ? d.content.h : d.content.w) * (H(c, 'drift', 16) / 100),
    I = (k + b) / f,
    z = Math.max(1, I - b),
    B = et(he(c, 'cardAspect', '1:1'), t),
    O = e ? z : z * B,
    $ = e ? z / B : z,
    L = (e ? $ : O) + y,
    X = 1 + w * (1 - d.ease(xe(a, 0, Wj)) + d.ease(xe(a, Vj, 1)));
  (n.save(), n.translate(r / 2, o / 2), n.scale(X, X), n.translate(-r / 2, -o / 2));
  const Y = T / 2,
    F = (e ? r : o) / 2,
    Q = Array.from({ length: f }, (q, W) => {
      const V = W * E,
        K = d.ease(xe(a, pw[0] + V, pw[1] + V)) - d.ease(xe(a, gw[0] + V, gw[1] + V)),
        M = h ? (W === _ ? (p - 1) / 2 : W < _ ? 0 : p - 1) : (p - 1) / 2,
        U = Y + (W % 2 ? -1 : 1) * C * Math.sin(2 * Math.PI * a),
        N = h ? Y + ((M - (p - 1) / 2) * L) / X : Y,
        j = A + W * I + z / 2;
      return { spread: K, origin: M, laneAlong: U, anchorAlong: N, across: h ? j : Le(F, j, K), far: Math.max(M, p - 1 - M) || 1 };
    }),
    P = Q.flatMap((q, W) => Array.from({ length: p }, (V, K) => ({ l: W, i: K, dist: Math.abs(K - Q[W].origin) })));
  P.sort((q, W) => W.dist - q.dist);
  for (const { l: q, i: W, dist: V } of P) {
    const { spread: K, laneAlong: M, anchorAlong: U, across: N, far: j } = Q[q],
      Z = M + (W - (p - 1) / 2) * L,
      ne = Le(Le(1, x, V / j), 1, K),
      le = Le(U, Z, K),
      te = O * ne,
      se = $ * ne,
      re = (e ? se : te) / 2;
    if (le + re < 0 || le - re > T) continue;
    const fe = e ? N : le, ge = e ? le : N, _e = m.at(q, W);
    Re(n, je(t, _e), _e, { x: fe - te / 2, y: ge - se / 2, w: te, h: se }, d.radius * ne, { shadow: d.shadow });
  }
  n.restore();
}
const Zj = {
  id: 'spread-columns', name: 'Column Spread',
  description: 'A stack splits into drifting columns, then snaps back into a single pile.',
  slotCount: kE, slotRange: { min: 3, max: 24 }, defaultDuration: 8, params: AE(!0), render: (t) => TE(t, !0),
};
export default Zj;
