import type { Line, Point2 } from "./types.js";

/** Tolerance for treating a vertex as lying exactly on a crease line. */
export const ON_LINE = 1e-9;

/** Below this a split fragment is a sliver and gets discarded. */
export const MIN_AREA = 1e-7;

export const point = (x: number, z: number): Point2 => ({ x, z });

/**
 * Distance from `point` to `line`, signed positive on the left of the directed
 * line. Folding uses the sign to decide which side of the crease moves.
 */
export const signedDistance = (subject: Point2, line: Line): number => {
  const dx = line.end.x - line.start.x;
  const dz = line.end.z - line.start.z;
  const length = Math.hypot(dx, dz);

  if (length < ON_LINE) {
    return 0;
  }

  return (
    (dx * (subject.z - line.start.z) - dz * (subject.x - line.start.x)) / length
  );
};

export interface SplitPolygon {
  readonly positive: readonly Point2[];
  readonly negative: readonly Point2[];
}

/**
 * Cut a convex or concave polygon with an infinite line, returning the parts on
 * each side. Vertices sitting on the line belong to both parts, which is what
 * keeps the two fragments sharing an exact edge along the crease.
 */
export const splitPolygon = (
  polygon: readonly Point2[],
  line: Line,
): SplitPolygon => {
  const positive: Point2[] = [];
  const negative: Point2[] = [];
  const count = polygon.length;

  for (let index = 0; index < count; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % count];

    if (!current || !next) {
      continue;
    }

    const here = signedDistance(current, line);
    const there = signedDistance(next, line);

    if (here > -ON_LINE) {
      positive.push(current);
    }
    if (here < ON_LINE) {
      negative.push(current);
    }

    const crossesUp = here < -ON_LINE && there > ON_LINE;
    const crossesDown = here > ON_LINE && there < -ON_LINE;

    if (crossesUp || crossesDown) {
      const ratio = here / (here - there);
      const crossing = point(
        current.x + (next.x - current.x) * ratio,
        current.z + (next.z - current.z) * ratio,
      );
      positive.push(crossing);
      negative.push(crossing);
    }
  }

  return { positive, negative };
};

/** Mirror a point across a line. A simple fold is exactly this reflection. */
export const reflectPoint = (subject: Point2, line: Line): Point2 => {
  const dx = line.end.x - line.start.x;
  const dz = line.end.z - line.start.z;
  const lengthSquared = dx * dx + dz * dz;

  if (lengthSquared < ON_LINE) {
    return subject;
  }

  const relativeX = subject.x - line.start.x;
  const relativeZ = subject.z - line.start.z;
  const projection = (relativeX * dx + relativeZ * dz) / lengthSquared;
  const footX = line.start.x + dx * projection;
  const footZ = line.start.z + dz * projection;

  return point(2 * footX - subject.x, 2 * footZ - subject.z);
};

/** Unsigned shoelace area. Used to find the smaller side and drop slivers. */
export const polygonArea = (polygon: readonly Point2[]): number => {
  let total = 0;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];

    if (!current || !next) {
      continue;
    }

    total += current.x * next.z - next.x * current.z;
  }

  return Math.abs(total) / 2;
};

/** Drop consecutive duplicate vertices left behind by a split. */
export const compactPolygon = (
  polygon: readonly Point2[],
): readonly Point2[] => {
  const result: Point2[] = [];

  for (const vertex of polygon) {
    const previous = result[result.length - 1];
    const isDuplicate =
      previous !== undefined &&
      Math.abs(previous.x - vertex.x) < 1e-7 &&
      Math.abs(previous.z - vertex.z) < 1e-7;

    if (!isDuplicate) {
      result.push(vertex);
    }
  }

  const first = result[0];
  const last = result[result.length - 1];

  if (
    result.length > 1 &&
    first !== undefined &&
    last !== undefined &&
    Math.abs(first.x - last.x) < 1e-7 &&
    Math.abs(first.z - last.z) < 1e-7
  ) {
    result.pop();
  }

  return result;
};

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export const boundsOf = (polygons: readonly (readonly Point2[])[]): Bounds => {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const polygon of polygons) {
    for (const vertex of polygon) {
      minX = Math.min(minX, vertex.x);
      maxX = Math.max(maxX, vertex.x);
      minZ = Math.min(minZ, vertex.z);
      maxZ = Math.max(maxZ, vertex.z);
    }
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  }

  return { minX, maxX, minZ, maxZ };
};

/** Scalar position of a point along a line, used to order crossing points. */
export const projectOnto = (subject: Point2, line: Line): number => {
  const dx = line.end.x - line.start.x;
  const dz = line.end.z - line.start.z;
  const lengthSquared = dx * dx + dz * dz;

  if (lengthSquared < ON_LINE) {
    return 0;
  }

  return (
    ((subject.x - line.start.x) * dx + (subject.z - line.start.z) * dz) /
    lengthSquared
  );
};
