import * as THREE from "three";

import type { CreaseType } from "../engine/types.js";

/** How near the pointer must come to a crease line, in world units. */
const PICK_THRESHOLD = 0.045;

/** Pointer travel past this counts as an orbit drag, not a click. */
const DRAG_SLOP = 6;

export interface CreasePicker {
  /** Clear cached pointer attention after a drag or sheet-state change. */
  reset(): void;
  dispose(): void;
}

export interface PickerHandlers {
  /** Fires as the pointer moves, so the scene can preview before committing. */
  onHover(creaseId: string | null): void;
  onPick(creaseId: string, type: CreaseType): void;
}

export const createCreasePicker = (
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  creaseGroup: THREE.Object3D,
  handlers: PickerHandlers,
): CreasePicker => {
  // Scratch values reused across events rather than allocated per move.
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: PICK_THRESHOLD };

  let downX = 0;
  let downY = 0;
  let hovered: string | null = null;

  const creaseUnder = (clientX: number, clientY: number): string | null => {
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(creaseGroup.children, false);
    const creaseId = hits[0]?.object.userData.creaseId;

    return typeof creaseId === "string" ? creaseId : null;
  };

  const setHovered = (next: string | null): void => {
    if (next === hovered) {
      return;
    }

    hovered = next;
    canvas.dataset.overCrease = next ? "yes" : "no";
    handlers.onHover(next);
  };

  const reset = (): void => {
    hovered = null;
    canvas.dataset.overCrease = "no";
  };

  const down = (event: PointerEvent): void => {
    downX = event.clientX;
    downY = event.clientY;
    setHovered(null);
  };

  const move = (event: PointerEvent): void => {
    // While dragging the view, stale hover must not mask an agent's cue.
    if (event.buttons !== 0) {
      setHovered(null);
      return;
    }

    setHovered(creaseUnder(event.clientX, event.clientY));
  };

  const up = (event: PointerEvent): void => {
    const travelled =
      Math.abs(event.clientX - downX) + Math.abs(event.clientY - downY);
    const creaseId = creaseUnder(event.clientX, event.clientY);

    // Recompute even after an orbit because the camera moved under the pointer.
    setHovered(creaseId);

    if (travelled > DRAG_SLOP) {
      return;
    }

    if (creaseId) {
      handlers.onPick(creaseId, event.shiftKey ? "mountain" : "valley");
    }
  };

  const leave = (): void => setHovered(null);

  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointerleave", leave);

  return {
    reset,
    dispose: () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", leave);
    },
  };
};
