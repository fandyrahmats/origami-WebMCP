import { ON_LINE } from "./geometry.js";
import type { Point2, Sheet } from "./types.js";

interface Edge {
  readonly from: Point2;
  readonly to: Point2;
  readonly facet: number;
}

interface Interval {
  readonly low: number;
  readonly high: number;
}

const cross = (ax: number, az: number, bx: number, bz: number): number =>
  ax * bz - az * bx;

/** X coordinate where two finite edges cross; endpoints are harmless duplicates. */
const intersectionX = (left: Edge, right: Edge): number | null => {
  const rx = left.to.x - left.from.x;
  const rz = left.to.z - left.from.z;
  const sx = right.to.x - right.from.x;
  const sz = right.to.z - right.from.z;
  const denominator = cross(rx, rz, sx, sz);

  if (Math.abs(denominator) <= ON_LINE) return null;

  const qx = right.from.x - left.from.x;
  const qz = right.from.z - left.from.z;
  const alongLeft = cross(qx, qz, sx, sz) / denominator;
  const alongRight = cross(qx, qz, rx, rz) / denominator;

  if (
    alongLeft < -ON_LINE ||
    alongLeft > 1 + ON_LINE ||
    alongRight < -ON_LINE ||
    alongRight > 1 + ON_LINE
  ) {
    return null;
  }

  return left.from.x + alongLeft * rx;
};

const uniqueSorted = (values: readonly number[]): readonly number[] => {
  const ordered = [...values].sort((left, right) => left - right);
  const unique: number[] = [];

  for (const value of ordered) {
    const previous = unique[unique.length - 1];
    if (previous === undefined || Math.abs(value - previous) > ON_LINE) {
      unique.push(value);
    }
  }

  return unique;
};

/** Vertical interior interval through one convex facet. */
const crossSection = (
  polygon: readonly Point2[],
  x: number,
): Interval | null => {
  const crossings: number[] = [];

  for (let index = 0; index < polygon.length; index += 1) {
    const from = polygon[index];
    const to = polygon[(index + 1) % polygon.length];
    if (!from || !to) continue;

    const crossesX =
      (from.x < x && x < to.x) || (to.x < x && x < from.x);
    if (!crossesX) continue;

    const ratio = (x - from.x) / (to.x - from.x);
    crossings.push(from.z + (to.z - from.z) * ratio);
  }

  if (crossings.length < 2) return null;

  return {
    low: Math.min(...crossings),
    high: Math.max(...crossings),
  };
};

/**
 * Maximum number of paper facets covering the same positive-area region.
 * Arrangement depth is constant between polygon-vertex/edge-intersection X
 * events, so one vertical sample per slab and one Z sample per interval is exact
 * for the convex fragments produced by this engine.
 */
export const maxOverlapDepth = (sheet: Sheet): number => {
  const edges: Edge[] = [];
  const xEvents: number[] = [];

  sheet.facets.forEach((facet, facetIndex) => {
    facet.polygon.forEach((from, index) => {
      const to = facet.polygon[(index + 1) % facet.polygon.length];
      if (!to) return;
      xEvents.push(from.x);
      edges.push({ from, to, facet: facetIndex });
    });
  });

  for (let left = 0; left < edges.length; left += 1) {
    for (let right = left + 1; right < edges.length; right += 1) {
      const a = edges[left];
      const b = edges[right];
      if (!a || !b || a.facet === b.facet) continue;
      const crossing = intersectionX(a, b);
      if (crossing !== null) xEvents.push(crossing);
    }
  }

  const xs = uniqueSorted(xEvents);
  let deepest = sheet.facets.length > 0 ? 1 : 0;

  for (let index = 0; index + 1 < xs.length; index += 1) {
    const lowX = xs[index];
    const highX = xs[index + 1];
    if (lowX === undefined || highX === undefined || highX - lowX <= ON_LINE) {
      continue;
    }

    const x = (lowX + highX) / 2;
    const intervals = sheet.facets.flatMap((facet) => {
      const interval = crossSection(facet.polygon, x);
      return interval && interval.high - interval.low > ON_LINE ? [interval] : [];
    });
    const zs = uniqueSorted(intervals.flatMap(({ low, high }) => [low, high]));

    for (let zIndex = 0; zIndex + 1 < zs.length; zIndex += 1) {
      const lowZ = zs[zIndex];
      const highZ = zs[zIndex + 1];
      if (lowZ === undefined || highZ === undefined || highZ - lowZ <= ON_LINE) {
        continue;
      }

      const z = (lowZ + highZ) / 2;
      const depth = intervals.filter(
        (interval) => interval.low < z && z < interval.high,
      ).length;
      deepest = Math.max(deepest, depth);
    }
  }

  return deepest;
};
