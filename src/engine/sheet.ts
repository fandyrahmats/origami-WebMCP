import { boundsOf, point, polygonArea } from "./geometry.js";
import type { Bounds } from "./geometry.js";
import type { Sheet } from "./types.js";

/** One world unit is one sheet width. A fresh square is 1 by 1 on the origin. */
export const SHEET_WIDTH = 1;

/**
 * A real sheet stops folding long before this, but the engine needs a hard
 * ceiling so it can refuse with a reason instead of stacking forever.
 */
export const MAX_LAYERS = 32;

export const ROOT_FACET_ID = "facet-0";

export const createSquareSheet = (): Sheet => {
  const square = [
    point(-0.5, -0.5),
    point(0.5, -0.5),
    point(0.5, 0.5),
    point(-0.5, 0.5),
  ] as const;

  return {
    facets: [
      {
        id: ROOT_FACET_ID,
        layer: 0,
        polygon: square,
        materialPolygon: square,
        faceUp: true,
      },
    ],
    pattern: [],
    foldCount: 0,
    flipped: false,
  };
};

export const sheetBounds = (sheet: Sheet): Bounds =>
  boundsOf(sheet.facets.map((facet) => facet.polygon));

export const layerCount = (sheet: Sheet): number =>
  new Set(sheet.facets.map((facet) => facet.layer)).size;

/** Total paper area currently visible from above, ignoring stacking. */
export const silhouetteArea = (sheet: Sheet): number => {
  const bottom = sheet.facets.filter((facet) => facet.layer === 0);
  return bottom.reduce((total, facet) => total + polygonArea(facet.polygon), 0);
};

/**
 * Turn the whole model over. Mirroring X keeps the layer order consistent with
 * what a person sees after physically flipping the paper towards themselves.
 */
export const flipSheet = (sheet: Sheet): Sheet => {
  const highest = sheet.facets.reduce(
    (top, facet) => Math.max(top, facet.layer),
    0,
  );

  return {
    ...sheet,
    flipped: !sheet.flipped,
    facets: sheet.facets.map((facet) => ({
      ...facet,
      layer: highest - facet.layer,
      faceUp: !facet.faceUp,
      polygon: facet.polygon.map((vertex) => point(-vertex.x, vertex.z)),
    })),
    pattern: sheet.pattern.map((crease) => ({
      ...crease,
      start: point(-crease.start.x, crease.start.z),
      end: point(-crease.end.x, crease.end.z),
    })),
  };
};

/**
 * A stable string for the whole state, used to tell whether the sheet still
 * matches an authored step. Vertex order is canonicalised so two routes to the
 * same shape compare equal.
 */
export const sheetSignature = (sheet: Sheet): string => {
  const facets = sheet.facets
    .map((facet) => {
      const vertices = facet.polygon.map((vertex, index) => {
        const material = facet.materialPolygon[index];
        return `${vertex.x.toFixed(6)},${vertex.z.toFixed(6)}@${material?.x.toFixed(6)},${material?.z.toFixed(6)}`;
      });
      const pivot = vertices.reduce(
        (lowest, vertex, index) =>
          vertex < (vertices[lowest] ?? vertex) ? index : lowest,
        0,
      );
      const rotated = [
        ...vertices.slice(pivot),
        ...vertices.slice(0, pivot),
      ].join(";");

      return `${facet.layer}|${facet.faceUp ? "u" : "d"}|${rotated}`;
    })
    .sort();

  return `${sheet.flipped ? "F" : "N"}#${facets.join("/")}`;
};

/**
 * Rewrite layer indices to a dense 0-based ranking while preserving order.
 * Folding produces sparse indices, and every consumer wants `LAYERS 4` to mean
 * four layers rather than a highest index of nine.
 */
export const normaliseLayers = (sheet: Sheet): Sheet => {
  const ordered = [...new Set(sheet.facets.map((facet) => facet.layer))].sort(
    (left, right) => left - right,
  );
  const ranks = new Map(ordered.map((layer, index) => [layer, index]));

  return {
    ...sheet,
    facets: sheet.facets.map((facet) => ({
      ...facet,
      layer: ranks.get(facet.layer) ?? facet.layer,
    })),
  };
};
