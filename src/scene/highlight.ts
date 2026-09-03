import * as THREE from "three";

import type { FoldOrigin } from "../engine/types.js";
import type { SheetView } from "./sheetMesh.js";

const RESTING = 0x8a86a8;
/** Fallback for lines created before a scene mode has been assigned. */
const RESTING_OPACITY = 0.22;

const PERSON = 0xff496c;
const AGENT = 0x39ed82;

export interface Highlighter {
  /**
   * Point at one crease. Pink is the person's own pointer, green is a crease an
   * agent marked, which is the same pairing the ghost preview uses.
   */
  set(creaseId: string | null, tone: FoldOrigin): void;
  update(nowMs: number): void;
}

export const createHighlighter = (view: SheetView): Highlighter => {
  let creaseId: string | null = null;
  let colour = PERSON;
  const reduceMotion =
    typeof window === "undefined"
      ? null
      : window.matchMedia("(prefers-reduced-motion: reduce)");

  const materialFor = (id: string): THREE.LineBasicMaterial | null => {
    const material = view.creaseLineFor(id)?.material;
    return material instanceof THREE.LineBasicMaterial ? material : null;
  };

  const paint = (id: string, intensity: number): void => {
    const material = materialFor(id);

    if (!material) {
      return;
    }

    material.color.setHex(colour);
    // Opacity carries the cue as well as hue, so the highlight survives for
    // anyone who cannot separate pink from green.
    material.opacity = 0.6 + intensity * 0.4;
  };

  const restore = (id: string): void => {
    const line = view.creaseLineFor(id);
    const material = line?.material;

    if (line && material instanceof THREE.LineBasicMaterial) {
      const resting = line.userData.restingOpacity;
      material.color.setHex(RESTING);
      material.opacity =
        typeof resting === "number" ? resting : RESTING_OPACITY;
    }
  };

  return {
    set: (next, tone) => {
      if (creaseId && creaseId !== next) {
        restore(creaseId);
      }

      creaseId = next;
      colour = tone === "agent" ? AGENT : PERSON;

      if (next) {
        paint(next, 1);
      }
    },

    update: (nowMs) => {
      if (!creaseId) {
        return;
      }

      if (reduceMotion?.matches) {
        paint(creaseId, 1);
        return;
      }

      paint(creaseId, (Math.sin(nowMs / 220) + 1) / 2);
    },
  };
};
