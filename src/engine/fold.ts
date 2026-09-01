import { DIAGONAL_CREASE_ID, MOVING_FACET_ID } from "./sheet.js";
import type {
  Facet,
  FoldEngine,
  FoldRequest,
  FoldResult,
  Point3,
  Sheet,
} from "./types.js";

const rotateAroundAxis = (
  point: Point3,
  start: Point3,
  end: Point3,
  angle: number,
): Point3 => {
  const axisX = end.x - start.x;
  const axisY = end.y - start.y;
  const axisZ = end.z - start.z;
  const axisLength = Math.hypot(axisX, axisY, axisZ);
  const unitX = axisX / axisLength;
  const unitY = axisY / axisLength;
  const unitZ = axisZ / axisLength;
  const x = point.x - start.x;
  const y = point.y - start.y;
  const z = point.z - start.z;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dot = unitX * x + unitY * y + unitZ * z;

  return {
    x:
      start.x +
      x * cosine +
      (unitY * z - unitZ * y) * sine +
      unitX * dot * (1 - cosine),
    y:
      start.y +
      y * cosine +
      (unitZ * x - unitX * z) * sine +
      unitY * dot * (1 - cosine),
    z:
      start.z +
      z * cosine +
      (unitX * y - unitY * x) * sine +
      unitZ * dot * (1 - cosine),
  };
};

const reject = (sheet: Sheet, reason: string): FoldResult => ({
  ok: false,
  sheet,
  reason,
});

const rotateFacet = (
  facet: Facet,
  axisStart: Point3,
  axisEnd: Point3,
  angleRadians: number,
): Facet => ({
  ...facet,
  layer: 1,
  vertices: [
    rotateAroundAxis(facet.vertices[0], axisStart, axisEnd, angleRadians),
    rotateAroundAxis(facet.vertices[1], axisStart, axisEnd, angleRadians),
    rotateAroundAxis(facet.vertices[2], axisStart, axisEnd, angleRadians),
  ],
});

export const foldSingleDiagonal = (
  sheet: Sheet,
  request: FoldRequest,
): FoldResult => {
  if (request.creaseId !== DIAGONAL_CREASE_ID || request.type !== "valley") {
    return reject(sheet, `Day 1 only supports ${DIAGONAL_CREASE_ID} as a valley fold.`);
  }

  if (sheet.foldedCreaseIds.includes(DIAGONAL_CREASE_ID)) {
    return reject(sheet, `${DIAGONAL_CREASE_ID} is already folded.`);
  }

  const crease = sheet.creases[0];
  if (!crease) {
    return reject(sheet, "The hardcoded Day 1 crease is missing.");
  }

  const angleRadians = Math.PI;
  const facets = sheet.facets.map<Facet>((facet) =>
    facet.id === MOVING_FACET_ID
      ? rotateFacet(facet, crease.start, crease.end, angleRadians)
      : facet,
  );

  return {
    ok: true,
    sheet: {
      ...sheet,
      facets,
      foldCount: sheet.foldCount + 1,
      foldedCreaseIds: [...sheet.foldedCreaseIds, DIAGONAL_CREASE_ID],
    },
    fold: {
      creaseId: crease.id,
      movingFacetId: MOVING_FACET_ID,
      axisStart: crease.start,
      axisEnd: crease.end,
      angleRadians,
    },
  };
};

export const singleDiagonalFoldEngine: FoldEngine = {
  fold: foldSingleDiagonal,
};
