import { boundsOf } from "../engine/geometry.js";
import type { Sheet } from "../engine/types.js";

const FRAME_DISTANCE = 3.8;
const MIN_ASPECT = 0.2;

export interface SheetFrame {
  readonly centerX: number;
  readonly centerZ: number;
  readonly radius: number;
}

/** Centre and half-diagonal of the actual projected paper silhouette. */
export const frameForSheet = (sheet: Sheet): SheetFrame => {
  const bounds = boundsOf(sheet.facets.map((facet) => facet.polygon));

  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerZ: (bounds.minZ + bounds.maxZ) / 2,
    radius:
      Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2,
  };
};

export const FRESH_FRAME_RADIUS = Math.SQRT2 / 2;
export const MIN_DISPLAY_RADIUS = FRESH_FRAME_RADIUS * 0.65;

/** Preserve a visible shrink cue without letting small models fall below half-stage. */
export const displayFrameRadius = (sheetRadius: number): number =>
  Math.max(sheetRadius, MIN_DISPLAY_RADIUS);

/** Pull farther back on portrait screens, whose horizontal FOV is limiting. */
export const framingDistance = (
  radius: number,
  aspect: number,
  zoom: number,
): number => {
  const aspectFit = Math.max(1, 1 / Math.max(aspect, MIN_ASPECT));
  return (radius * FRAME_DISTANCE * aspectFit) / zoom;
};
