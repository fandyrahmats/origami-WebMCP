import {
  MIN_AREA,
  ON_LINE,
  point,
  polygonArea,
  projectOnto,
  signedDistance,
} from "./geometry.js";
import type { Facet, Line, Point2, Sheet } from "./types.js";

const EDGE_EPSILON = 1e-7;

export interface FacetFragment {
  readonly facet: Facet;
  readonly polygon: readonly Point2[];
  /** Same vertices in the untouched square the sheet started as. */
  readonly materialPolygon: readonly Point2[];
  readonly side: 1 | -1;
  readonly touchesCrease: boolean;
  readonly area: number;
}

export interface TopologySide {
  readonly fragments: readonly FacetFragment[];
  readonly area: number;
}

export interface FoldTopology {
  readonly all: readonly FacetFragment[];
  readonly positive: TopologySide;
  readonly negative: TopologySide;
  readonly span: Line | null;
}

interface PairSplit {
  readonly positive: readonly [Point2, Point2][];
  readonly negative: readonly [Point2, Point2][];
}

/** Drop duplicate world vertices while retaining their paired material vertex. */
const compactPairs = (
  pairs: readonly [Point2, Point2][],
): readonly [Point2, Point2][] => {
  const result: [Point2, Point2][] = [];
  for (const pair of pairs) {
    const previous = result[result.length - 1]?.[0];
    if (
      !previous ||
      Math.abs(previous.x - pair[0].x) > EDGE_EPSILON ||
      Math.abs(previous.z - pair[0].z) > EDGE_EPSILON
    ) {
      result.push(pair);
    }
  }
  const first = result[0]?.[0];
  const last = result[result.length - 1]?.[0];
  if (
    first &&
    last &&
    Math.abs(first.x - last.x) < EDGE_EPSILON &&
    Math.abs(first.z - last.z) < EDGE_EPSILON
  ) {
    result.pop();
  }
  return result;
};

/**
 * Split world and material polygons with the same edge ratios. Reflection only
 * changes world coordinates; material coordinates remain a permanent identity
 * map back to the original square.
 */
const splitFacet = (facet: Facet, line: Line): PairSplit => {
  const positive: [Point2, Point2][] = [];
  const negative: [Point2, Point2][] = [];

  for (let index = 0; index < facet.polygon.length; index += 1) {
    const current = facet.polygon[index];
    const next = facet.polygon[(index + 1) % facet.polygon.length];
    const material = facet.materialPolygon[index];
    const nextMaterial =
      facet.materialPolygon[(index + 1) % facet.materialPolygon.length];
    if (!current || !next || !material || !nextMaterial) continue;

    const here = signedDistance(current, line);
    const there = signedDistance(next, line);
    if (here > -ON_LINE) positive.push([current, material]);
    if (here < ON_LINE) negative.push([current, material]);

    if (
      (here < -ON_LINE && there > ON_LINE) ||
      (here > ON_LINE && there < -ON_LINE)
    ) {
      const ratio = here / (here - there);
      const crossing = point(
        current.x + (next.x - current.x) * ratio,
        current.z + (next.z - current.z) * ratio,
      );
      const materialCrossing = point(
        material.x + (nextMaterial.x - material.x) * ratio,
        material.z + (nextMaterial.z - material.z) * ratio,
      );
      positive.push([crossing, materialCrossing]);
      negative.push([crossing, materialCrossing]);
    }
  }

  return {
    positive: compactPairs(positive),
    negative: compactPairs(negative),
  };
};

const cross = (a: Point2, b: Point2, c: Point2): number =>
  (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

/** True when two source-paper boundary segments share non-zero length. */
const edgesOverlap = (
  a0: Point2,
  a1: Point2,
  b0: Point2,
  b1: Point2,
): boolean => {
  const dx = a1.x - a0.x;
  const dz = a1.z - a0.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < EDGE_EPSILON ** 2) return false;

  const scale = Math.sqrt(lengthSquared);
  if (
    Math.abs(cross(a0, a1, b0)) > EDGE_EPSILON * scale ||
    Math.abs(cross(a0, a1, b1)) > EDGE_EPSILON * scale
  ) {
    return false;
  }

  const project = (subject: Point2): number =>
    ((subject.x - a0.x) * dx + (subject.z - a0.z) * dz) / lengthSquared;
  const bStart = project(b0);
  const bEnd = project(b1);
  const overlap =
    Math.min(1, Math.max(bStart, bEnd)) -
    Math.max(0, Math.min(bStart, bEnd));
  return overlap * scale > EDGE_EPSILON;
};

const adjacent = (left: FacetFragment, right: FacetFragment): boolean => {
  for (let a = 0; a < left.materialPolygon.length; a += 1) {
    const a0 = left.materialPolygon[a];
    const a1 = left.materialPolygon[(a + 1) % left.materialPolygon.length];
    if (!a0 || !a1) continue;
    for (let b = 0; b < right.materialPolygon.length; b += 1) {
      const b0 = right.materialPolygon[b];
      const b1 = right.materialPolygon[(b + 1) % right.materialPolygon.length];
      if (b0 && b1 && edgesOverlap(a0, a1, b0, b1)) return true;
    }
  }
  return false;
};

/** Keep only material-connected fragments reachable from the crease. */
const connectedToCrease = (
  fragments: readonly FacetFragment[],
): readonly FacetFragment[] => {
  const selected = new Set<number>();
  const queue: number[] = [];
  fragments.forEach((fragment, index) => {
    if (fragment.touchesCrease) {
      selected.add(index);
      queue.push(index);
    }
  });

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (let index = 0; index < fragments.length; index += 1) {
      if (
        !selected.has(index) &&
        adjacent(fragments[current] as FacetFragment, fragments[index] as FacetFragment)
      ) {
        selected.add(index);
        queue.push(index);
      }
    }
  }
  return fragments.filter((_, index) => selected.has(index));
};

export const foldTopology = (sheet: Sheet, line: Line): FoldTopology => {
  const positive: FacetFragment[] = [];
  const negative: FacetFragment[] = [];
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;

  for (const facet of sheet.facets) {
    const split = splitFacet(facet, line);
    const positivePolygon = split.positive.map(([world]) => world);
    const negativePolygon = split.negative.map(([world]) => world);
    const positiveArea = polygonArea(positivePolygon);
    const negativeArea = polygonArea(negativePolygon);
    const crosses = positiveArea > MIN_AREA && negativeArea > MIN_AREA;

    const add = (
      side: 1 | -1,
      pairs: readonly [Point2, Point2][],
      area: number,
      target: FacetFragment[],
    ): void => {
      if (area <= MIN_AREA) return;
      target.push({
        facet,
        polygon: pairs.map(([world]) => world),
        materialPolygon: pairs.map(([, material]) => material),
        side,
        touchesCrease: crosses,
        area,
      });
    };
    add(1, split.positive, positiveArea, positive);
    add(-1, split.negative, negativeArea, negative);

    if (crosses) {
      for (const [world] of [...split.positive, ...split.negative]) {
        if (Math.abs(signedDistance(world, line)) < EDGE_EPSILON) {
          const along = projectOnto(world, line);
          low = Math.min(low, along);
          high = Math.max(high, along);
        }
      }
    }
  }

  const connectedPositive = connectedToCrease(positive);
  const connectedNegative = connectedToCrease(negative);
  const side = (fragments: readonly FacetFragment[]): TopologySide => ({
    fragments,
    area: fragments.reduce((total, fragment) => total + fragment.area, 0),
  });

  return {
    all: [...positive, ...negative],
    positive: side(connectedPositive),
    negative: side(connectedNegative),
    span:
      Number.isFinite(low) && high - low > EDGE_EPSILON
        ? {
            start: point(
              line.start.x + (line.end.x - line.start.x) * low,
              line.start.z + (line.end.z - line.start.z) * low,
            ),
            end: point(
              line.start.x + (line.end.x - line.start.x) * high,
              line.start.z + (line.end.z - line.start.z) * high,
            ),
          }
        : null,
  };
};
