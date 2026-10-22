import { BLOOM_BLUR_WGSL, BLOOM_EXTRACT_WGSL, COMPOSITE_WGSL, INSTANCE_FLOATS, MIP_WGSL, SCENE_WGSL } from './arena-shaders';
import type { Vec3 } from './arena-math';

/** TS 6 lib.dom có kiểu GPU nhưng không có các hằng số usage → khai báo thủ công theo đặc tả WebGPU. */
const BUFFER = { MAP_READ: 0x01, COPY_DST: 0x08, UNIFORM: 0x40, STORAGE: 0x80 } as const;
const TEXTURE = { COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04, RENDER_ATTACHMENT: 0x10 } as const;

export const MAX_INSTANCES = 2048;
export const POSTER_SIZE = { width: 360, height: 495 } as const;
const HDR_FORMAT: GPUTextureFormat = 'rgba16float';
const POSTER_FORMAT: GPUTextureFormat = 'rgba8unorm-srgb';
const BLOOM_PASSES = 2;

export interface ArenaQuality {
  /** Hệ số độ phân giải nội bộ so với canvas (0.5–1). */
  scale: number;
  bloom: boolean;
}

export interface FrameData {
  viewProj: Float32Array;
  eye: Vec3;
  light: Vec3;
  /** Giây kể từ lúc mở trang. */
  time: number;
  aspect: number;
  instances: Float32Array;
  count: number;
}

export class WebGpuUnavailableError extends Error {
  constructor(reason: string) { super(reason); this.name = 'WebGpuUnavailableError'; }
}

const ALPHA_OVER: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

/** Tải poster về ImageBitmap cùng kích thước để xếp vào một texture array. */
export async function loadPosterBitmaps(urls: readonly string[], signal?: AbortSignal): Promise<ImageBitmap[]> {
  return Promise.all(urls.map(async url => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`poster ${url}: ${response.status}`);
    return createImageBitmap(await response.blob(), {
      resizeWidth: POSTER_SIZE.width, resizeHeight: POSTER_SIZE.height, resizeQuality: 'high', premultiplyAlpha: 'none',
    });
  }));
}

/**
 * Bộ vẽ WebGPU thuần cho sân đấu:
 *  1) cảnh → HDR rgba16float (một draw instanced duy nhất, dữ liệu từ storage buffer);
 *  2) bloom nửa độ phân giải (lọc sáng + Gauss tách trục);
 *  3) ghép + tone-map ACES ra canvas.
 */
export class ArenaRenderer {
  private readonly context: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly globals: GPUBuffer;
  private readonly post: GPUBuffer;
  private readonly instances: GPUBuffer;
  private readonly sampler: GPUSampler;
  private readonly linear: GPUSampler;
  private readonly sceneBindGroup: GPUBindGroup;
  private readonly scenePipeline: GPURenderPipeline;
  private readonly extractPipeline: GPURenderPipeline;
  private readonly blurPipeline: GPURenderPipeline;
  private readonly compositePipeline: GPURenderPipeline;
  private readonly globalsData = new Float32Array(28);
  private readonly postData = new Float32Array(4);
  private readonly blurBuffers: GPUBuffer[] = [];
  private posters: GPUTexture;
  private targets: {
    hdr: GPUTexture; bloomA: GPUTexture; bloomB: GPUTexture;
    extract: GPUBindGroup; blurs: GPUBindGroup[]; composite: GPUBindGroup;
    hdrView: GPUTextureView; bloomAView: GPUTextureView; bloomBView: GPUTextureView;
  } | null = null;
  private quality: ArenaQuality = { scale: 1, bloom: true };
  private width = 0;
  private height = 0;
  private disposed = false;
  readonly lost: Promise<GPUDeviceLostInfo>;

  private constructor(private readonly canvas: HTMLCanvasElement, private readonly device: GPUDevice, context: GPUCanvasContext, posters: ImageBitmap[]) {
    this.context = context;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.lost = device.lost;
    device.addEventListener('uncapturederror', event => console.warn('[arena] WebGPU:', (event as GPUUncapturedErrorEvent).error.message));
    context.configure({ device, format: this.format, alphaMode: 'opaque', usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.COPY_SRC });

    this.globals = device.createBuffer({ label: 'arena-globals', size: this.globalsData.byteLength, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
    this.post = device.createBuffer({ label: 'arena-post', size: 16, usage: BUFFER.UNIFORM | BUFFER.COPY_DST });
    this.instances = device.createBuffer({ label: 'arena-instances', size: MAX_INSTANCES * INSTANCE_FLOATS * 4, usage: BUFFER.STORAGE | BUFFER.COPY_DST });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', maxAnisotropy: 4 });
    this.linear = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

    this.posters = this.uploadPosters(posters);
    const module = (code: string, label: string) => device.createShaderModule({ label, code });

    this.scenePipeline = device.createRenderPipeline({
      label: 'arena-scene', layout: 'auto',
      vertex: { module: module(SCENE_WGSL, 'arena-scene'), entryPoint: 'vs' },
      fragment: { module: module(SCENE_WGSL, 'arena-scene-fs'), entryPoint: 'fs', targets: [{ format: HDR_FORMAT, blend: ALPHA_OVER }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    this.sceneBindGroup = device.createBindGroup({
      layout: this.scenePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.globals } },
        { binding: 1, resource: { buffer: this.instances } },
        { binding: 2, resource: this.posters.createView({ dimension: '2d-array' }) },
        { binding: 3, resource: this.sampler },
      ],
    });
    this.extractPipeline = device.createRenderPipeline({
      label: 'arena-bloom-extract', layout: 'auto',
      vertex: { module: module(BLOOM_EXTRACT_WGSL, 'arena-extract'), entryPoint: 'vs' },
      fragment: { module: module(BLOOM_EXTRACT_WGSL, 'arena-extract-fs'), entryPoint: 'fs', targets: [{ format: HDR_FORMAT }] },
    });
    this.blurPipeline = device.createRenderPipeline({
      label: 'arena-bloom-blur', layout: 'auto',
      vertex: { module: module(BLOOM_BLUR_WGSL, 'arena-blur'), entryPoint: 'vs' },
      fragment: { module: module(BLOOM_BLUR_WGSL, 'arena-blur-fs'), entryPoint: 'fs', targets: [{ format: HDR_FORMAT }] },
    });
    this.compositePipeline = device.createRenderPipeline({
      label: 'arena-composite', layout: 'auto',
      vertex: { module: module(COMPOSITE_WGSL, 'arena-composite'), entryPoint: 'vs' },
      fragment: { module: module(COMPOSITE_WGSL, 'arena-composite-fs'), entryPoint: 'fs', targets: [{ format: this.format }] },
    });
    for (let i = 0; i < BLOOM_PASSES * 2; i++) {
      this.blurBuffers.push(device.createBuffer({ label: `arena-blur-dir-${i}`, size: 16, usage: BUFFER.UNIFORM | BUFFER.COPY_DST }));
    }
  }

  /** Tạo bộ vẽ; ném `WebGpuUnavailableError` khi trình duyệt/thiết bị không hỗ trợ. */
  static async create(canvas: HTMLCanvasElement, posters: ImageBitmap[]): Promise<ArenaRenderer> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) throw new WebGpuUnavailableError('no-webgpu');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new WebGpuUnavailableError('no-adapter');
    const device = await adapter.requestDevice({ label: 'arena-device' });
    const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext | null;
    if (!context) { device.destroy(); throw new WebGpuUnavailableError('no-context'); }
    return new ArenaRenderer(canvas, device, context, posters);
  }

  setQuality(quality: ArenaQuality): void {
    const changed = quality.scale !== this.quality.scale;
    this.quality = { scale: Math.min(1, Math.max(0.4, quality.scale)), bloom: quality.bloom };
    if (changed && this.width) this.resize(this.width, this.height);
  }

  /** Kích thước canvas tính bằng pixel thiết bị. */
  resize(width: number, height: number): void {
    if (this.disposed) return;
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    const w = Math.max(1, Math.floor(this.width * this.quality.scale));
    const h = Math.max(1, Math.floor(this.height * this.quality.scale));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.destroyTargets();
    const device = this.device;
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    const make = (label: string, tw: number, th: number) => device.createTexture({
      label, size: [tw, th], format: HDR_FORMAT, usage: TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING,
    });
    const hdr = make('arena-hdr', w, h), bloomA = make('arena-bloom-a', hw, hh), bloomB = make('arena-bloom-b', hw, hh);
    const hdrView = hdr.createView(), bloomAView = bloomA.createView(), bloomBView = bloomB.createView();
    const extract = device.createBindGroup({
      layout: this.extractPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: hdrView }, { binding: 1, resource: this.linear }],
    });
    // Mỗi vòng: ngang (A→B) rồi dọc (B→A); bán kính tăng dần để quầng sáng rộng mà vẫn rẻ.
    const blurs: GPUBindGroup[] = [];
    for (let pass = 0; pass < BLOOM_PASSES; pass++) {
      const radius = 1 + pass * 1.6;
      this.device.queue.writeBuffer(this.blurBuffers[pass * 2], 0, new Float32Array([radius / hw, 0, 0, 0]));
      this.device.queue.writeBuffer(this.blurBuffers[pass * 2 + 1], 0, new Float32Array([0, radius / hh, 0, 0]));
      blurs.push(
        device.createBindGroup({ layout: this.blurPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: bloomAView }, { binding: 1, resource: this.linear }, { binding: 2, resource: { buffer: this.blurBuffers[pass * 2] } }] }),
        device.createBindGroup({ layout: this.blurPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: bloomBView }, { binding: 1, resource: this.linear }, { binding: 2, resource: { buffer: this.blurBuffers[pass * 2 + 1] } }] }),
      );
    }
    const composite = device.createBindGroup({
      layout: this.compositePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: hdrView }, { binding: 1, resource: bloomAView }, { binding: 2, resource: this.linear }, { binding: 3, resource: { buffer: this.post } }],
    });
    this.targets = { hdr, bloomA, bloomB, extract, blurs, composite, hdrView, bloomAView, bloomBView };
  }

  render(frame: FrameData): void {
    this.draw(frame);
  }

  /** Vẽ một khung rồi đọc ngược pixel canvas (RGBA, từng hàng khít `width*4` byte); dùng cho kiểm thử ảnh. */
  async capture(frame: FrameData): Promise<{ width: number; height: number; rgba: Uint8Array }> {
    const width = this.width, height = this.height, bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const buffer = this.device.createBuffer({ label: 'arena-capture', size: bytesPerRow * height, usage: BUFFER.MAP_READ | BUFFER.COPY_DST });
    this.draw(frame, (encoder, texture) => encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, [width, height]));
    await buffer.mapAsync(1);
    const mapped = new Uint8Array(buffer.getMappedRange()), rgba = new Uint8Array(width * height * 4);
    const bgra = this.format.startsWith('bgra');
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const from = y * bytesPerRow + x * 4, to = (y * width + x) * 4;
        rgba[to] = mapped[from + (bgra ? 2 : 0)]; rgba[to + 1] = mapped[from + 1]; rgba[to + 2] = mapped[from + (bgra ? 0 : 2)]; rgba[to + 3] = 255;
      }
    }
    buffer.destroy();
    return { width, height, rgba };
  }

  private draw(frame: FrameData, after?: (encoder: GPUCommandEncoder, texture: GPUTexture) => void): void {
    const targets = this.targets;
    if (this.disposed || !targets) return;
    const count = Math.min(frame.count, MAX_INSTANCES);
    const g = this.globalsData;
    g.set(frame.viewProj, 0);
    g.set([frame.eye[0], frame.eye[1], frame.eye[2], 1], 16);
    g.set([frame.time, frame.aspect, 0, 0], 20);
    g.set([frame.light[0], frame.light[1], frame.light[2], 0], 24);
    const queue = this.device.queue;
    queue.writeBuffer(this.globals, 0, g);
    if (count > 0) queue.writeBuffer(this.instances, 0, frame.instances.buffer, frame.instances.byteOffset, count * INSTANCE_FLOATS * 4);
    this.postData.set([this.quality.bloom ? 0.7 : 0, frame.time, 0.45, 0.012]);
    queue.writeBuffer(this.post, 0, this.postData);

    const encoder = this.device.createCommandEncoder({ label: 'arena-frame' });
    const scene = encoder.beginRenderPass({
      colorAttachments: [{ view: targets.hdrView, clearValue: { r: 0.002, g: 0.004, b: 0.006, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    });
    scene.setPipeline(this.scenePipeline);
    scene.setBindGroup(0, this.sceneBindGroup);
    if (count > 0) scene.draw(6, count);
    scene.end();

    if (this.quality.bloom) {
      const fullscreen = (view: GPUTextureView, pipeline: GPURenderPipeline, group: GPUBindGroup) => {
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
        pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end();
      };
      fullscreen(targets.bloomAView, this.extractPipeline, targets.extract);
      for (let pass = 0; pass < BLOOM_PASSES; pass++) {
        fullscreen(targets.bloomBView, this.blurPipeline, targets.blurs[pass * 2]);
        fullscreen(targets.bloomAView, this.blurPipeline, targets.blurs[pass * 2 + 1]);
      }
    }
    const backbuffer = this.context.getCurrentTexture();
    const out = encoder.beginRenderPass({
      colorAttachments: [{ view: backbuffer.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    out.setPipeline(this.compositePipeline);
    out.setBindGroup(0, targets.composite);
    out.draw(3);
    out.end();
    after?.(encoder, backbuffer);
    queue.submit([encoder.finish()]);
  }

  /** Chờ GPU xử lý xong các lệnh đã gửi (dùng khi chụp ảnh kiểm thử). */
  idle(): Promise<void> { return this.device.queue.onSubmittedWorkDone().catch(() => undefined); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.destroyTargets();
    this.posters.destroy();
    this.globals.destroy(); this.post.destroy(); this.instances.destroy();
    this.blurBuffers.forEach(buffer => buffer.destroy());
    this.context.unconfigure();
    this.device.destroy();
  }

  private destroyTargets(): void {
    if (!this.targets) return;
    this.targets.hdr.destroy(); this.targets.bloomA.destroy(); this.targets.bloomB.destroy();
    this.targets = null;
  }

  /** Đưa poster lên texture array + sinh mipmap bằng render pass (mỗi cấp một lần blit lọc tuyến tính). */
  private uploadPosters(bitmaps: ImageBitmap[]): GPUTexture {
    const device = this.device;
    const layers = bitmaps.length + 1; // lớp cuối để trống (thẻ Năng lượng không dùng poster)
    const mips = Math.floor(Math.log2(Math.max(POSTER_SIZE.width, POSTER_SIZE.height))) + 1;
    const texture = device.createTexture({
      label: 'arena-posters', size: [POSTER_SIZE.width, POSTER_SIZE.height, layers], format: POSTER_FORMAT, mipLevelCount: mips,
      usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
    });
    bitmaps.forEach((bitmap, layer) => {
      device.queue.copyExternalImageToTexture({ source: bitmap }, { texture, origin: [0, 0, layer] }, [POSTER_SIZE.width, POSTER_SIZE.height]);
    });
    const module = device.createShaderModule({ label: 'arena-mip', code: MIP_WGSL });
    const pipeline = device.createRenderPipeline({
      label: 'arena-mip', layout: 'auto',
      vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: POSTER_FORMAT }] },
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const encoder = device.createCommandEncoder({ label: 'arena-mips' });
    for (let layer = 0; layer < layers; layer++) {
      for (let level = 1; level < mips; level++) {
        const src = texture.createView({ dimension: '2d', baseMipLevel: level - 1, mipLevelCount: 1, baseArrayLayer: layer, arrayLayerCount: 1 });
        const dst = texture.createView({ dimension: '2d', baseMipLevel: level, mipLevelCount: 1, baseArrayLayer: layer, arrayLayerCount: 1 });
        const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: src }, { binding: 1, resource: sampler }] });
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: dst, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
        pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end();
      }
    }
    device.queue.submit([encoder.finish()]);
    return texture;
  }
}
