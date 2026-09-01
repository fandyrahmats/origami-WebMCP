import * as THREE from "three";

import type { AppliedFold } from "../engine/types.js";
import { PAPER_LAYER_GAP } from "./sheetMesh.js";

export interface FoldAnimator {
  start(fold: AppliedFold): void;
  update(time: number): void;
}

const easeInOut = (progress: number): number =>
  progress < 0.5
    ? 2 * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 2) / 2;

export const createFoldAnimator = (movingFacet: THREE.Group): FoldAnimator => {
  const axis = new THREE.Vector3();
  let angleRadians = 0;
  let startedAt = 0;
  let active = false;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const applyProgress = (progress: number): void => {
    const eased = easeInOut(progress);
    movingFacet.quaternion.setFromAxisAngle(axis, angleRadians * eased);
    movingFacet.position.y = PAPER_LAYER_GAP * eased;
  };

  return {
    start: (fold) => {
      axis
        .set(
          fold.axisEnd.x - fold.axisStart.x,
          fold.axisEnd.y - fold.axisStart.y,
          fold.axisEnd.z - fold.axisStart.z,
        )
        .normalize();
      angleRadians = fold.angleRadians;

      if (reduceMotion.matches) {
        applyProgress(1);
        active = false;
        return;
      }

      startedAt = performance.now();
      active = true;
    },
    update: (time) => {
      if (!active) {
        return;
      }

      const progress = Math.min((time - startedAt) / 400, 1);
      applyProgress(progress);
      active = progress < 1;
    },
  };
};
