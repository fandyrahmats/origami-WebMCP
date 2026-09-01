import * as THREE from "three";

export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  dispose(): void;
}

export const createStage = (container: HTMLElement): Stage => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);
  camera.position.set(1.35, 1.2, 1.45);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.className = "stage-canvas";
  renderer.domElement.setAttribute(
    "aria-label",
    "<NAMA> sheet with one clickable diagonal valley crease.",
  );
  container.append(renderer.domElement);

  const ambient = new THREE.AmbientLight(0x777797, 1.15);
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(-1.5, 2.4, 1.8);
  scene.add(ambient, key);

  const resize = (): void => {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  return {
    renderer,
    scene,
    camera,
    dispose: () => {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
};
