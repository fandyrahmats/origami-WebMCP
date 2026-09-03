import { MIN_AREA, point } from "./geometry.js";
import type { Bounds } from "./geometry.js";
import { sheetBounds } from "./sheet.js";
import { foldTopology } from "./topology.js";
import type { LegalCrease, Line, Sheet } from "./types.js";

const SOURCE_HALF = 0.5;
const SOURCE_QUARTER = 0.25;
const SOURCE_THIRD = 1 / 6;

/**
 * The studio folds along a discrete reference set, not an arbitrary user-drawn
 * line. Twelve role-based candidates are re-derived from the current bounds, so
 * `diag-a` always means the rising diagonal on stage. Four source-frame thirds
 * keep letter folds stable; four source-frame packet lines keep opposite edge
 * folds symmetric after earlier folds have changed the visible bounds.
 */
interface Candidate {
  readonly id: string;
  readonly label: string;
  readonly line: Line;
}

const candidatesFor = (bounds: Bounds): readonly Candidate[] => {
  const { minX, maxX, minZ, maxZ } = bounds;
  const centreX = (minX + maxX) / 2;
  const centreZ = (minZ + maxZ) / 2;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const westQuarter = minX + width / 4;
  const eastQuarter = maxX - width / 4;
  const southQuarter = minZ + depth / 4;
  const northQuarter = maxZ - depth / 4;

  return [
    {
      id: "mid-v",
      label: "vertical mid-line",
      line: { start: point(centreX, minZ), end: point(centreX, maxZ) },
    },
    {
      id: "mid-h",
      label: "horizontal mid-line",
      line: { start: point(minX, centreZ), end: point(maxX, centreZ) },
    },
    {
      id: "diag-a",
      label: "rising diagonal",
      line: { start: point(minX, minZ), end: point(maxX, maxZ) },
    },
    {
      id: "diag-b",
      label: "falling diagonal",
      line: { start: point(minX, maxZ), end: point(maxX, minZ) },
    },
    {
      id: "quarter-w",
      label: "west quarter line",
      line: { start: point(westQuarter, minZ), end: point(westQuarter, maxZ) },
    },
    {
      id: "quarter-e",
      label: "east quarter line",
      line: { start: point(eastQuarter, minZ), end: point(eastQuarter, maxZ) },
    },
    {
      id: "quarter-s",
      label: "south quarter line",
      line: { start: point(minX, southQuarter), end: point(maxX, southQuarter) },
    },
    {
      id: "quarter-n",
      label: "north quarter line",
      line: { start: point(minX, northQuarter), end: point(maxX, northQuarter) },
    },
    {
      id: "third-w",
      label: "west third line",
      line: {
        start: point(-SOURCE_THIRD, -SOURCE_HALF),
        end: point(-SOURCE_THIRD, SOURCE_HALF),
      },
    },
    {
      id: "third-e",
      label: "east third line",
      line: {
        start: point(SOURCE_THIRD, -SOURCE_HALF),
        end: point(SOURCE_THIRD, SOURCE_HALF),
      },
    },
    {
      id: "third-s",
      label: "south third line",
      line: {
        start: point(-SOURCE_HALF, -SOURCE_THIRD),
        end: point(SOURCE_HALF, -SOURCE_THIRD),
      },
    },
    {
      id: "third-n",
      label: "north third line",
      line: {
        start: point(-SOURCE_HALF, SOURCE_THIRD),
        end: point(SOURCE_HALF, SOURCE_THIRD),
      },
    },
    {
      id: "packet-n",
      label: "north packet line",
      line: {
        start: point(-SOURCE_HALF, SOURCE_QUARTER),
        end: point(SOURCE_HALF, SOURCE_QUARTER),
      },
    },
    {
      id: "packet-e",
      label: "east packet line",
      line: {
        start: point(SOURCE_QUARTER, -SOURCE_HALF),
        end: point(SOURCE_QUARTER, SOURCE_HALF),
      },
    },
    {
      id: "packet-s",
      label: "south packet line",
      line: {
        start: point(-SOURCE_HALF, -SOURCE_QUARTER),
        end: point(SOURCE_HALF, -SOURCE_QUARTER),
      },
    },
    {
      id: "packet-w",
      label: "west packet line",
      line: {
        start: point(-SOURCE_QUARTER, -SOURCE_HALF),
        end: point(-SOURCE_QUARTER, SOURCE_HALF),
      },
    },
    {
      id: "blintz-ne",
      label: "north-east corner",
      line: { start: point(centreX, maxZ), end: point(maxX, centreZ) },
    },
    {
      id: "blintz-se",
      label: "south-east corner",
      line: { start: point(maxX, centreZ), end: point(centreX, minZ) },
    },
    {
      id: "blintz-sw",
      label: "south-west corner",
      line: { start: point(centreX, minZ), end: point(minX, centreZ) },
    },
    {
      id: "blintz-nw",
      label: "north-west corner",
      line: { start: point(minX, centreZ), end: point(centreX, maxZ) },
    },
  ];
};

interface Measurement {
  readonly positiveArea: number;
  readonly negativeArea: number;
  readonly positiveFacets: number;
  readonly negativeFacets: number;
  readonly span: Line | null;
}

/**
 * Measure only material-connected paper reachable from the crease. A polygon can
 * sit on the same projected half-plane after several folds without being joined
 * to this hinge; counting it is what made old builds tear the sheet visually.
 */
const measure = (sheet: Sheet, line: Line): Measurement => {
  const topology = foldTopology(sheet, line);

  return {
    positiveArea: topology.positive.area,
    negativeArea: topology.negative.area,
    positiveFacets: topology.positive.fragments.length,
    negativeFacets: topology.negative.fragments.length,
    span: topology.span,
  };
};

export interface CreasePlan {
  readonly crease: LegalCrease;
  readonly line: Line;
  /** Which side of the directed line moves. Deterministic, never random. */
  readonly movingSign: 1 | -1;
}

const planFrom = (
  candidate: Candidate,
  measurement: Measurement,
): CreasePlan | null => {
  const { span, positiveArea, negativeArea } = measurement;

  if (!span || positiveArea <= MIN_AREA || negativeArea <= MIN_AREA) {
    return null;
  }

  // The smaller side is the flap that moves, which is what a person would do.
  // An exact tie resolves to the positive side so the result never varies.
  const movingSign: 1 | -1 = positiveArea <= negativeArea ? 1 : -1;
  const movingFacets =
    movingSign === 1
      ? measurement.positiveFacets
      : measurement.negativeFacets;

  return {
    line: candidate.line,
    movingSign,
    crease: {
      id: candidate.id,
      label: candidate.label,
      start: span.start,
      end: span.end,
      movingFacets,
    },
  };
};

export const creasePlans = (sheet: Sheet): readonly CreasePlan[] => {
  const bounds = sheetBounds(sheet);

  return candidatesFor(bounds).flatMap((candidate) => {
    const plan = planFrom(candidate, measure(sheet, candidate.line));
    return plan ? [plan] : [];
  });
};

export const legalCreases = (sheet: Sheet): readonly LegalCrease[] =>
  creasePlans(sheet).map((plan) => plan.crease);

export const planFor = (sheet: Sheet, creaseId: string): CreasePlan | null =>
  creasePlans(sheet).find((plan) => plan.crease.id === creaseId) ?? null;
