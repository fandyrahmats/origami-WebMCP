import type { Crease, Facet, Point3, Sheet } from "./types.js";

export const DIAGONAL_CREASE_ID = "diagonal-a";
export const FIXED_FACET_ID = "facet-fixed";
export const MOVING_FACET_ID = "facet-moving";

const point = (x: number, y: number, z: number): Point3 => ({ x, y, z });

export const createSquareSheet = (): Sheet => {
  const bottomLeft = point(-0.5, 0, -0.5);
  const topRight = point(0.5, 0, 0.5);

  const facets: readonly Facet[] = [
    {
      id: FIXED_FACET_ID,
      layer: 0,
      vertices: [bottomLeft, point(-0.5, 0, 0.5), topRight],
    },
    {
      id: MOVING_FACET_ID,
      layer: 0,
      vertices: [bottomLeft, topRight, point(0.5, 0, -0.5)],
    },
  ];

  const creases: readonly Crease[] = [
    {
      id: DIAGONAL_CREASE_ID,
      type: "valley",
      start: bottomLeft,
      end: topRight,
      movingFacetId: MOVING_FACET_ID,
    },
  ];

  return { facets, creases, foldCount: 0, foldedCreaseIds: [] };
};
