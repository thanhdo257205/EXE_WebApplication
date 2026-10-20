import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface CardViewerHandle {
  side(back: boolean): void;
  rotate(horizontal: number, vertical?: number): void;
  zoom(closer: boolean): void;
  reset(): void;
  dispose(): void;
}

/** Loaded only for a visible card detail. No continuous animation loop. */
export async function mountCardViewer(
  host: HTMLElement,
  source: string,
  signal: AbortSignal,
  onLost: () => void,
): Promise<CardViewerHandle> {
  signal.throwIfAborted();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 40);
  camera.position.set(0.24, 0.1, 5);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  const canvas = renderer.domElement;
  canvas.className = 'card-webgl';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:grab;';
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setClearColor(0x000000, 0);
  host.append(canvas);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.autoRotate = false;
  controls.minDistance = 2.4;
  controls.maxDistance = 9;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.75;
  controls.minPolarAngle = 0.04;
  controls.maxPolarAngle = Math.PI - 0.04;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb0c3d2, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.1);
  fill.position.set(-3, 1, -5);
  scene.add(fill);
  let disposed = false,
    frame = 0,
    visible = true;
  let resizeObserver: ResizeObserver | undefined, intersection: IntersectionObserver | undefined;
  const render = () => {
    frame = 0;
    if (!disposed && visible && !document.hidden) renderer.render(scene, camera);
  };
  const requestRender = () => {
    if (!disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(render);
  };
  const resize = () => {
    if (disposed || !host.clientWidth || !host.clientHeight) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    requestRender();
  };
  const visibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else requestRender();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    intersection?.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    signal.removeEventListener('abort', dispose);
    canvas.removeEventListener('webglcontextlost', contextLost);
    controls.removeEventListener('change', requestRender);
    controls.dispose();
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    textures.forEach((texture) => {
      (texture.source.data as { close?: () => void } | null)?.close?.();
      texture.dispose();
    });
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    if (!disposed) {
      dispose();
      onLost();
    }
  };
  canvas.addEventListener('webglcontextlost', contextLost);
  signal.addEventListener('abort', dispose, { once: true });
  try {
    const response = await fetch(source, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    });
    if (!response.ok) throw new Error('Không tải được model thẻ.');
    const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
    // Keep model data reachable for disposal even if navigation aborted during image decoding.
    if (disposed || signal.aborted) {
      const temporary = gltf.scene;
      temporary.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) {
              (value.source.data as { close?: () => void } | null)?.close?.();
              value.dispose();
            }
          material.dispose();
        }
      });
      throw new DOMException('Viewer was removed', 'AbortError');
    }
    const model = new THREE.Group();
    model.add(gltf.scene);
    model.rotation.y = -Math.PI / 2;
    scene.add(model);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model),
      size = bounds.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0)
      throw new Error('Model không có kích thước hợp lệ.');
    model.scale.setScalar(2.8 / size.y);
    model.updateMatrixWorld(true);
    model.position.sub(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()));
    scene.add(model);
    controls.update();
    controls.saveState();
    controls.addEventListener('change', requestRender);
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    if (typeof IntersectionObserver === 'function') {
      intersection = new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        if (visible) requestRender();
        else {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      });
      intersection.observe(host);
    }
    document.addEventListener('visibilitychange', visibility);
    resize();
    return {
      side(back) {
        if (disposed) return;
        const distance = controls.getDistance();
        camera.position.set(back ? -0.15 : 0.15, 0.06, back ? -distance : distance);
        controls.update();
        requestRender();
      },
      rotate(horizontal, vertical = 0) {
        if (disposed) return;
        controls.rotateLeft((horizontal * Math.PI) / 8);
        controls.rotateUp((vertical * Math.PI) / 12);
        controls.update();
        requestRender();
      },
      zoom(closer) {
        if (disposed) return;
        if (closer) controls.dollyIn(1.18);
        else controls.dollyOut(1.18);
        controls.update();
        requestRender();
      },
      reset() {
        if (!disposed) {
          controls.reset();
          requestRender();
        }
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
