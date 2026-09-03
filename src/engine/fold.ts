import { creasePlans, legalCreases, planFor } from "./creases.js";
import type { CreasePlan } from "./creases.js";
import { reflectPoint } from "./geometry.js";
import {
  MAX_LAYERS,
  createSquareSheet,
  flipSheet,
  layerCount,
  normaliseLayers,
} from "./sheet.js";
import { foldTopology } from "./topology.js";
import type { FacetFragment } from "./topology.js";
import type {
  CreaseType,
  Facet,
  FoldEngine,
  FoldPreview,
  FoldRequest,
  FoldResult,
  MovingPiece,
  Point2,
  Sheet,
} from "./types.js";

const FOLD_TYPES: readonly CreaseType[] = ["valley", "mountain"];

const reject = (sheet: Sheet, reason: string): FoldResult => ({
  ok: false,
  sheet,
  reason,
});

/** Valley places the flap above; mountain tucks it below. */
const restack = (
  layer: number,
  highest: number,
  type: CreaseType,
): number =>
  type === "valley" ? 2 * highest + 1 - layer : -1 - layer;

const movingFragments = (
  sheet: Sheet,
  plan: CreasePlan,
): readonly FacetFragment[] => {
  const topology = foldTopology(sheet, plan.line);
  return plan.movingSign === 1
    ? topology.positive.fragments
    : topology.negative.fragments;
};

/**
 * Answer "which part folds, and where does it go" without changing anything.
 * Only material-connected fragments reachable from the crease are shown.
 */
export const previewFold = (
  sheet: Sheet,
  creaseId: string,
): FoldPreview | null => {
  const plan = planFor(sheet, creaseId);
  if (!plan) return null;

  const fragments = movingFragments(sheet, plan);
  const from: MovingPiece[] = [];
  const to: MovingPiece[] = [];

  for (const fragment of fragments) {
    from.push({
      polygon: fragment.polygon,
      layer: fragment.facet.layer,
      faceUp: fragment.facet.faceUp,
    });
    to.push({
      polygon: fragment.polygon.map((vertex) =>
        reflectPoint(vertex, plan.line),
      ),
      layer: fragment.facet.layer,
      faceUp: !fragment.facet.faceUp,
    });
  }

  return {
    creaseId: plan.crease.id,
    creaseLabel: plan.crease.label,
    movingFacets: from.length,
    totalFacets: sheet.facets.length,
    from,
    to,
  };
};

interface Division {
  readonly staying: readonly Facet[];
  readonly moving: readonly Facet[];
  readonly pieces: readonly MovingPiece[];
}

/**
 * Rebuild the complete sheet from source-aware fragments. A projected polygon
 * on the moving half-plane stays put unless its material edges connect it back
 * to the crease; this is what keeps an overlapped sheet from visually tearing.
 */
const divide = (sheet: Sheet, plan: CreasePlan, type: CreaseType): Division => {
  const highest = sheet.facets.reduce(
    (top, facet) => Math.max(top, facet.layer),
    0,
  );
  const topology = foldTopology(sheet, plan.line);
  const selected = new Set(
    plan.movingSign === 1
      ? topology.positive.fragments
      : topology.negative.fragments,
  );
  const staying: Facet[] = [];
  const moving: Facet[] = [];
  const pieces: MovingPiece[] = [];
  let serial = 0;

  for (const fragment of topology.all) {
    serial += 1;
    const id = `${fragment.facet.id}-f${sheet.foldCount + 1}-${serial}`;

    if (!selected.has(fragment)) {
      staying.push({
        ...fragment.facet,
        id,
        polygon: fragment.polygon,
        materialPolygon: fragment.materialPolygon,
      });
      continue;
    }

    pieces.push({
      polygon: fragment.polygon,
      layer: fragment.facet.layer,
      faceUp: fragment.facet.faceUp,
    });
    moving.push({
      id,
      layer: restack(fragment.facet.layer, highest, type),
      faceUp: !fragment.facet.faceUp,
      polygon: fragment.polygon.map<Point2>((vertex) =>
        reflectPoint(vertex, plan.line),
      ),
      // Material coordinates are an identity map and never reflect.
      materialPolygon: fragment.materialPolygon,
    });
  }

  return { staying, moving, pieces };
};

export const foldSheet = (sheet: Sheet, request: FoldRequest): FoldResult => {
  if (typeof request.creaseId !== "string" || request.creaseId.length === 0) {
    return reject(sheet, "A crease id is required.");
  }
  if (!FOLD_TYPES.includes(request.type)) {
    return reject(sheet, "Fold type must be valley or mountain.");
  }

  const plan = planFor(sheet, request.creaseId);
  if (!plan) {
    const legal = legalCreases(sheet)
      .map((crease) => crease.id)
      .join(", ");
    return reject(
      sheet,
      `${request.creaseId} is not foldable right now. Legal creases: ${legal || "none"}.`,
    );
  }
  if (layerCount(sheet) >= MAX_LAYERS) {
    return reject(
      sheet,
      `The model already uses ${layerCount(sheet)} layer-order ranks, at this engine's ${MAX_LAYERS} ordering cap.`,
    );
  }

  const { staying, moving, pieces } = divide(sheet, plan, request.type);
  if (moving.length === 0) {
    return reject(sheet, `${request.creaseId} has no connected flap to move.`);
  }
  if (staying.length === 0) {
    return reject(
      sheet,
      `${request.creaseId} would move the whole sheet instead of folding it.`,
    );
  }

  const folded = normaliseLayers({
    ...sheet,
    facets: [...staying, ...moving],
    foldCount: sheet.foldCount + 1,
    pattern: [
      ...sheet.pattern,
      {
        id: plan.crease.id,
        type: request.type,
        start: plan.crease.start,
        end: plan.crease.end,
      },
    ],
  });

  if (layerCount(folded) > MAX_LAYERS) {
    return reject(
      sheet,
      `That fold would require ${layerCount(folded)} layer-order ranks, past this engine's ${MAX_LAYERS} ordering cap.`,
    );
  }

  const direction = request.type === "valley" ? -1 : 1;
  return {
    ok: true,
    sheet: folded,
    fold: {
      creaseId: plan.crease.id,
      creaseLabel: plan.crease.label,
      type: request.type,
      axisStart: plan.crease.start,
      axisEnd: plan.crease.end,
      angleRadians: direction * plan.movingSign * Math.PI,
      movingPieces: pieces,
      movedFacetIds: moving.map((facet) => facet.id),
    },
  };
};

export const foldEngine: FoldEngine = {
  reset: createSquareSheet,
  legalCreases,
  fold: foldSheet,
  flip: flipSheet,
};

export { creasePlans, legalCreases, planFor };
