import { GLOW_WGSL, MIP_WGSL, SOLID_WGSL } from './hero-shaders';
import { HeroFrame, INST_FLOATS, MAX_INSTANCES } from './hero-scene';
import { BIG_SIZE, HeroTextures, SMALL_SIZE, Surface } from './hero-textures';

/** TS lib.dom có kiểu GPU nhưng không có hằng số usage → khai báo theo đặc tả WebGPU. */
const BUFFER = { MAP_READ: 0x01, COPY_DST: 0x08, UNIFORM: 0x40, STORAGE: 0x80 } as const;
const TEXTURE = { COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04, RENDER_ATTACHMENT: 0x10 } as const;
const SAMPLES = 4;
const TEX_FORMAT: GPUTextureFormat = 'rgba8unorm-srgb';
const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';

export class HeroGpuUnavailableError extends Error {
  constructor(reason: string) { super(reason); this.name = 'HeroGpuUnavailableError'; }
}

/**
 * Bộ vẽ WebGPU thuần cho hộp game ở hero: một storage buffer instance, hai pipeline
 * (vật thể đặc có depth + alpha-to-coverage; nhóm cộng sáng không ghi depth), MSAA 4× resolve thẳng ra canvas.
 * Canvas trong suốt (premultiplied) để nền gradient CSS đổi màu phía sau.
 */
export class HeroRenderer {
  private readonly context: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly globals: GPUBuffer;
  private readonly instances: GPUBuffer;
  private readonly solidPipeline: GPURenderPipeline;
  private readonly glowPipeline: GPURenderPipeline;
  private readonly solidGroup: GPUBindGroup;
  private readonly glowGroup: GPUBindGroup;
  private readonly textures: GPUTexture[];
  private readonly globalsData = new Float32Array(28);
  private msaa: GPUTexture | null = null;
  private depth: GPUTexture | null = null;
  private width = 0;
  private height = 0;
  private disposed = false;
  readonly lost: Promise<GPUDeviceLostInfo>;

  private constructor(private readonly canvas: HTMLCanvasElement, private readonly device: GPUDevice, context: GPUCanvasContext, art: HeroTextures) {
    this.context = context;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.lost = device.lost;
    device.addEventListener('uncapturederror', event => console.warn('[hero] WebGPU:', (event as GPUUncapturedErrorEvent).error.message));
    context.configure({ device, format: this.format, alphaMode: 'premultiplied', usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.COPY_SRC });

    this.globals = device.createBuffer({ label: 'hero-globals', size: this.globalsData.byteLength, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
    this.instances = device.createBuffer({ label: 'hero-instances', size: MAX_INSTANCES * INST_FLOATS * 4, usage: BUFFER.STORAGE | BUFFER.COPY_DST });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', maxAnisotropy: 8 });
    const big = this.upload('hero-big', art.big, BIG_SIZE);
    const small = this.upload('hero-small', art.small, SMALL_SIZE);
    this.textures = [big, small];

    const solid = device.createShaderModule({ label: 'hero-solid', code: SOLID_WGSL });
    const glow = device.createShaderModule({ label: 'hero-glow', code: GLOW_WGSL });
    const multisample: GPUMultisampleState = { count: SAMPLES };
    this.solidPipeline = device.createRenderPipeline({
      label: 'hero-solid', layout: 'auto',
      vertex: { module: solid, entryPoint: 'vs' },
      fragment: { module: solid, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
      multisample: { ...multisample, alphaToCoverageEnabled: true },
    });
    this.glowPipeline = device.createRenderPipeline({
      label: 'hero-glow', layout: 'auto',
      vertex: { module: glow, entryPoint: 'vs' },
      fragment: {
        module: glow, entryPoint: 'fs', targets: [{
          format: this.format,
          blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } },
        }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'less' },
      multisample,
    });
    this.solidGroup = device.createBindGroup({
      layout: this.solidPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.globals } },
        { binding: 1, resource: { buffer: this.instances } },
        { binding: 2, resource: big.createView({ dimension: '2d-array' }) },
        { binding: 3, resource: small.createView({ dimension: '2d-array' }) },
        { binding: 4, resource: sampler },
      ],
    });
    this.glowGroup = device.createBindGroup({
      layout: this.glowPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.globals } }, { binding: 1, resource: { buffer: this.instances } }],
    });
  }

  /** Ném `HeroGpuUnavailableError` khi trình duyệt/thiết bị không có WebGPU. */
  static async create(canvas: HTMLCanvasElement, art: HeroTextures): Promise<HeroRenderer> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) throw new HeroGpuUnavailableError('no-webgpu');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new HeroGpuUnavailableError('no-adapter');
    const device = await adapter.requestDevice({ label: 'hero-device' });
    const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext | null;
    if (!context) { device.destroy(); throw new HeroGpuUnavailableError('no-context'); }
    return new HeroRenderer(canvas, device, context, art);
  }

  /** Kích thước tính bằng pixel thiết bị. */
  resize(width: number, height: number): void {
    if (this.disposed) return;
    const w = Math.max(1, Math.floor(width)), h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    this.canvas.width = w; this.canvas.height = h;
    this.msaa?.destroy(); this.depth?.destroy();
    this.msaa = this.device.createTexture({ label: 'hero-msaa', size: [w, h], format: this.format, sampleCount: SAMPLES, usage: TEXTURE.RENDER_ATTACHMENT });
    this.depth = this.device.createTexture({ label: 'hero-depth', size: [w, h], format: DEPTH_FORMAT, sampleCount: SAMPLES, usage: TEXTURE.RENDER_ATTACHMENT });
  }

  render(frame: HeroFrame, time: number): void { this.draw(frame, time); }

  /** Vẽ rồi đọc ngược pixel (RGBA, alpha giữ nguyên) — dùng cho kiểm thử ảnh không đầu. */
  async capture(frame: HeroFrame, time: number): Promise<{ width: number; height: number; rgba: Uint8Array }> {
    const width = this.width, height = this.height, bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const buffer = this.device.createBuffer({ label: 'hero-capture', size: bytesPerRow * height, usage: BUFFER.MAP_READ | BUFFER.COPY_DST });
    this.draw(frame, time, (encoder, texture) => encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, [width, height]));
    await buffer.mapAsync(1);
    const mapped = new Uint8Array(buffer.getMappedRange()), rgba = new Uint8Array(width * height * 4);
    const bgra = this.format.startsWith('bgra');
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const from = y * bytesPerRow + x * 4, to = (y * width + x) * 4;
      rgba[to] = mapped[from + (bgra ? 2 : 0)]; rgba[to + 1] = mapped[from + 1]; rgba[to + 2] = mapped[from + (bgra ? 0 : 2)]; rgba[to + 3] = mapped[from + 3];
    }
    buffer.destroy();
    return { width, height, rgba };
  }

  private draw(frame: HeroFrame, time: number, after?: (encoder: GPUCommandEncoder, texture: GPUTexture) => void): void {
    if (this.disposed || !this.msaa || !this.depth) return;
    const g = this.globalsData;
    g.set(frame.viewProj, 0);
    g.set([frame.eye[0], frame.eye[1], frame.eye[2], 1], 16);
    g.set([frame.light[0], frame.light[1], frame.light[2], 0], 20);
    g.set([frame.theme[0], frame.theme[1], frame.theme[2], time], 24);
    const queue = this.device.queue;
    queue.writeBuffer(this.globals, 0, g);
    const used = Math.min(MAX_INSTANCES, frame.glows[0] + frame.glows[1]);
    if (used > 0) queue.writeBuffer(this.instances, 0, frame.instances.buffer, frame.instances.byteOffset, used * INST_FLOATS * 4);

    const encoder = this.device.createCommandEncoder({ label: 'hero-frame' });
    const target = this.context.getCurrentTexture();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: this.msaa.createView(), resolveTarget: target.createView(), loadOp: 'clear', storeOp: 'discard', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
      depthStencilAttachment: { view: this.depth.createView(), depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 1 },
    });
    if (frame.solids[1] > 0) {
      pass.setPipeline(this.solidPipeline); pass.setBindGroup(0, this.solidGroup);
      pass.draw(6, frame.solids[1], 0, frame.solids[0]);
    }
    if (frame.glows[1] > 0) {
      pass.setPipeline(this.glowPipeline); pass.setBindGroup(0, this.glowGroup);
      pass.draw(6, frame.glows[1], 0, frame.glows[0]);
    }
    pass.end();
    after?.(encoder, target);
    queue.submit([encoder.finish()]);
  }

  idle(): Promise<void> { return this.device.queue.onSubmittedWorkDone().catch(() => undefined); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.msaa?.destroy(); this.depth?.destroy();
    this.textures.forEach(texture => texture.destroy());
    this.globals.destroy(); this.instances.destroy();
    this.context.unconfigure();
    this.device.destroy();
  }

  /** Đưa các lớp lên texture array + sinh mipmap bằng render pass. */
  private upload(label: string, layers: Surface[], size: { width: number; height: number }): GPUTexture {
    const device = this.device;
    const mips = Math.floor(Math.log2(Math.max(size.width, size.height))) + 1;
    const texture = device.createTexture({
      label, size: [size.width, size.height, layers.length], format: TEX_FORMAT, mipLevelCount: mips,
      usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
    });
    layers.forEach((source, layer) => device.queue.copyExternalImageToTexture({ source }, { texture, origin: [0, 0, layer] }, [size.width, size.height]));
    const module = device.createShaderModule({ label: `${label}-mip`, code: MIP_WGSL });
    const pipeline = device.createRenderPipeline({ label: `${label}-mip`, layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: TEX_FORMAT }] } });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const encoder = device.createCommandEncoder({ label: `${label}-mips` });
    for (let layer = 0; layer < layers.length; layer++) for (let level = 1; level < mips; level++) {
      const src = texture.createView({ dimension: '2d', baseMipLevel: level - 1, mipLevelCount: 1, baseArrayLayer: layer, arrayLayerCount: 1 });
      const dst = texture.createView({ dimension: '2d', baseMipLevel: level, mipLevelCount: 1, baseArrayLayer: layer, arrayLayerCount: 1 });
      const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: src }, { binding: 1, resource: sampler }] });
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: dst, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end();
    }
    device.queue.submit([encoder.finish()]);
    return texture;
  }
}
