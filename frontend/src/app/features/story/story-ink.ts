/**
 * Nền "mực loang trong nước" cho trang Câu chuyện (prompt Flowstate), rút gọn thành một fragment shader WebGL 1:
 * nhiễu fbm uốn miền hai lớp thay cho bộ giải chất lỏng đầy đủ. Vẽ ở độ phân giải thấp rồi phóng bằng CSS (mực vốn mờ),
 * giới hạn ~60 khung/giây (30 khi máy bị hạ cấp), dừng khi ra khỏi khung nhìn hoặc tab ẩn. Một con trỏ ẩn bay quanh tâm;
 * chuột thật kéo xoáy mực theo. Reduced motion: vẽ đúng một khung tĩnh. Trả false nếu không có WebGL (giữ nền CSS).
 */
const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;uniform float uTime;uniform vec2 uPointer;uniform float uGain;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<5;i++){v+=a*noise(p);p=m*p;a*=.5;}return v;}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);
  vec2 d=uv-uPointer;float a=1.8*exp(-dot(d,d)*5.);
  uv=uPointer+mat2(cos(a),-sin(a),sin(a),cos(a))*d;
  float t=uTime;
  vec2 q=vec2(fbm(uv*1.5+vec2(0.,t*.06)),fbm(uv*1.5+vec2(5.2,1.3)-t*.05));
  vec2 r=vec2(fbm(uv*1.5+3.2*q+vec2(1.7,9.2)+t*.08),fbm(uv*1.5+3.2*q+vec2(8.3,2.8)-t*.07));
  float f=fbm(uv*1.7+3.6*r);
  vec3 col=mix(vec3(.48,.3,1.),vec3(1.,.42,.72),clamp(q.x*2.2-.55,0.,1.));
  col=mix(col,vec3(.16,.55,1.),clamp(r.y*1.5-.45,0.,1.));
  col=mix(col,vec3(.85,.98,.46),smoothstep(.74,.96,f)*.5);
  float ink=pow(smoothstep(.28,.78,f),1.6)*(.45+.75*length(r))*uGain;
  gl_FragColor=vec4(vec3(.016,.02,.047)+col*ink*1.25,1.);
}`;

export function startInk(canvas: HTMLCanvasElement, signal: AbortSignal, onReady: () => void): boolean {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return false;
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source); gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return false;
  const program = gl.createProgram()!;
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(program, 'uRes'), uTime = gl.getUniformLocation(program, 'uTime');
  const uPointer = gl.getUniformLocation(program, 'uPointer'), uGain = gl.getUniformLocation(program, 'uGain');

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const low = () => document.documentElement.dataset['perf'] === 'low';
  const start = performance.now();
  let raf = 0, last = 0, visible = true, ready = false, stopped = false;
  let rect = canvas.getBoundingClientRect(), rectDirty = false;
  // Con trỏ thật (chuột/bút) được ưu tiên; đứng yên 2,5 s thì quay về quỹ đạo tự động quanh tâm.
  let target: [number, number] | null = null, moved = 0;
  const pointer: [number, number] = [0.3, 0];

  const resize = () => {
    rect = canvas.getBoundingClientRect();
    const scale = Math.min(devicePixelRatio || 1, 1.5) * (low() ? 0.35 : 0.5);
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (reduced) draw(8);
  };
  const draw = (time: number) => {
    const gain = reduced ? 1 : Math.min(1, time / 0.6) * (1 + 0.8 * Math.exp(-1.6 * time)); // "bùng mực" lúc mở trang rồi lắng
    if (!target || performance.now() - moved > 2500) target = null;
    const [tx, ty] = target ?? [Math.cos(time * 0.45) * 0.42, Math.sin(time * 0.62) * 0.24];
    pointer[0] += (tx - pointer[0]) * 0.06; pointer[1] += (ty - pointer[1]) * 0.06;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, time);
    gl.uniform2f(uPointer, pointer[0], pointer[1]);
    gl.uniform1f(uGain, gain);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!ready) { ready = true; onReady(); }
  };
  const loop = (now: number) => {
    raf = 0;
    if (stopped || !visible || document.hidden) return;
    const frameMs = low() ? 1000 / 31 : 1000 / 61;
    if (!last || now - last >= frameMs - 2) { last = now; draw((now - start) / 1000); }
    raf = requestAnimationFrame(loop);
  };
  const wake = () => { if (!reduced && !raf && visible && !document.hidden && !stopped) raf = requestAnimationFrame(loop); };
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    if (rectDirty) { rect = canvas.getBoundingClientRect(); rectDirty = false; }
    const unit = Math.min(rect.width, rect.height);
    target = [(event.clientX - rect.left - rect.width / 2) / unit, -(event.clientY - rect.top - rect.height / 2) / unit];
    moved = performance.now();
  };
  const onScroll = () => { rectDirty = true; };
  const onLost = (event: Event) => { event.preventDefault(); stop(); canvas.classList.remove('on'); };

  const io = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); wake(); });
  io.observe(canvas);
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', wake);
  canvas.addEventListener('webglcontextlost', onLost);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    io.disconnect(); ro.disconnect();
    removeEventListener('pointermove', onPointer);
    removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', wake);
    canvas.removeEventListener('webglcontextlost', onLost);
  };
  signal.addEventListener('abort', () => { stop(); gl.getExtension('WEBGL_lose_context')?.loseContext(); });
  resize(); // reduced motion: resize đã vẽ khung tĩnh
  wake();
  return true;
}
