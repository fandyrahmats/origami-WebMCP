import * as THREE from "three";

import type { ViewState } from "../store.js";
import {
  FRESH_FRAME_RADIUS,
  displayFrameRadius,
  framingDistance,
} from "./framing.js";

/** Clip-plane margin, also in sheet radii, so depth precision stays scale free. */
const CLIP_MARGIN = 1.6;

/** How fast the camera dollies when the paper changes size. */
const FRAME_EASING = 0.12;

export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  applyView(view: ViewState): void;
  /**
   * Follow the actual silhouette centre, but retain some fresh-sheet framing so
   * completed folds visibly look smaller instead of being zoomed back to full.
   */
  setFraming(centerX: number, centerZ: number, sheetRadius: number): void;
  /** Eases the dolly. Presentation only; nothing waits on it. */
  tickCamera(): void;
  /** Drag and wheel report back so the person and the agent share one view. */
  attachOrbit(onChange: (next: Partial<ViewState>) => void): () => void;
  dispose(): void;
}

export const createStage = (container: HTMLElement): Stage => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  // The stage background is the page background, so the canvas floats in the
  // same space as the readouts rather than sitting on a second dark rectangle.
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.className = "stage-canvas";
  container.append(renderer.domElement);

  // A dark studio: one dim ambient for shape, one key light, and emissive line
  // work for the glow. No HDRI, no post-processing pass.
  const ambient = new THREE.AmbientLight(0x6f6b93, 1.05);
  const key = new THREE.DirectionalLight(0xfff4e6, 2.9);
  key.position.set(-1.6, 2.6, 1.7);
  const rim = new THREE.DirectionalLight(0x39ed82, 0.5);
  rim.position.set(1.9, 0.7, -1.8);
  scene.add(ambient, key, rim);

  let frame = FRESH_FRAME_RADIUS;
  let frameTarget = FRESH_FRAME_RADIUS;
  let centerX = 0;
  let centerZ = 0;
  let centerTargetX = 0;
  let centerTargetZ = 0;
  let view: ViewState = { azimuth: 38, elevation: 34, zoom: 1 };
  const lookTarget = new THREE.Vector3();

  const place = (): void => {
    const azimuth = THREE.MathUtils.degToRad(view.azimuth);
    const elevation = THREE.MathUtils.degToRad(view.elevation);
    // Portrait viewports are width-limited. Pull back by inverse aspect so the
    // whole silhouette remains visible instead of framing only its centre.
    const radius = framingDistance(frame, camera.aspect, view.zoom);

    camera.position.set(
      centerX + radius * Math.cos(elevation) * Math.sin(azimuth),
      radius * Math.sin(elevation),
      centerZ + radius * Math.cos(elevation) * Math.cos(azimuth),
    );
    lookTarget.set(centerX, 0, centerZ);
    camera.lookAt(lookTarget);

    // Tight clip planes keep the depth buffer precise. The paper compresses its
    // layers to hair-thin gaps once it is deeply folded, and a 0.1-to-40 range
    // does not have the resolution to separate them.
    const margin = frame * CLIP_MARGIN;
    camera.near = Math.max(0.02, radius - margin);
    camera.far = radius + margin;
    camera.updateProjectionMatrix();
  };

  const resize = (): void => {
    const { width, height } = container.getBoundingClientRect();
    const safeHeight = Math.max(height, 1);
    renderer.setSize(width, safeHeight, false);
    camera.aspect = width / safeHeight;
    camera.updateProjectionMatrix();
    place();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  place();

  const attachOrbit = (
    onChange: (next: Partial<ViewState>) => void,
  ): (() => void) => {
    const canvas = renderer.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let azimuth = view.azimuth;
    let elevation = view.elevation;

    const down = (event: PointerEvent): void => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      // Start from the shared view, not from the camera, so a dolly in progress
      // cannot skew the drag.
      azimuth = view.azimuth;
      elevation = view.elevation;
      canvas.setPointerCapture(event.pointerId);
    };

    const move = (event: PointerEvent): void => {
      if (!dragging) {
        return;
      }

      azimuth -= (event.clientX - lastX) * 0.4;
      elevation += (event.clientY - lastY) * 0.3;
      lastX = event.clientX;
      lastY = event.clientY;
      onChange({ azimuth, elevation });
    };

    const up = (event: PointerEvent): void => {
      dragging = false;

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const wheel = (event: WheelEvent): void => {
      event.preventDefault();
      onChange({ zoom: view.zoom * (event.deltaY > 0 ? 0.92 : 1.08) });
    };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
    };
  };

  return {
    renderer,
    scene,
    camera,

    applyView: (next) => {
      view = next;
      place();
    },

    setFraming: (nextCenterX, nextCenterZ, sheetRadius) => {
      centerTargetX = nextCenterX;
      centerTargetZ = nextCenterZ;
      frameTarget = displayFrameRadius(sheetRadius);
    },

    tickCamera: () => {
      const settled =
        Math.abs(frameTarget - frame) < 1e-4 &&
        Math.abs(centerTargetX - centerX) < 1e-4 &&
        Math.abs(centerTargetZ - centerZ) < 1e-4;
      if (settled) return;

      frame += (frameTarget - frame) * FRAME_EASING;
      centerX += (centerTargetX - centerX) * FRAME_EASING;
      centerZ += (centerTargetZ - centerZ) * FRAME_EASING;
      place();
    },

    attachOrbit,

    dispose: () => {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
};
