import * as THREE from "three";

export interface CreasePicker {
  dispose(): void;
}

export const createCreasePicker = (
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  creaseTarget: THREE.Object3D,
  onPick: () => void,
): CreasePicker => {
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  const handleClick = (event: MouseEvent): void => {
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);

    if (raycaster.intersectObject(creaseTarget, false).length > 0) {
      onPick();
    }
  };

  canvas.addEventListener("click", handleClick);
  return {
    dispose: () => canvas.removeEventListener("click", handleClick),
  };
};
