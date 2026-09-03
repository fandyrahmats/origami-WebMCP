/**
 * Pure engine types. Nothing in `src/engine` may import Three.js, touch the
 * DOM, or read a browser API. The engine models the sheet as a flat set of
 * polygonal facets plus an explicit layer order, and every fold is a validated
 * transition from one sheet state to the next.
 */

export type CreaseType = "valley" | "mountain";

/** Who asked for a fold. The console colours the history by this. */
export type FoldOrigin = "person" | "agent";

/**
 * A point in the paper plane. The sheet lies in XZ with Y up, so the engine
 * only ever needs two coordinates; the scene adds Y from the layer index.
 */
export interface Point2 {
  readonly x: number;
  readonly z: number;
}

/** A directed, infinite line described by two points on it. */
export interface Line {
  readonly start: Point2;
  readonly end: Point2;
}

/** One flat region of paper. `layer` 0 is the bottom of the stack. */
export interface Facet {
  readonly id: string;
  readonly layer: number;
  /** Current position in the folded paper plane. */
  readonly polygon: readonly Point2[];
  /**
   * One-to-one coordinates in the untouched square. They never reflect, so two
   * fragments can still prove they share a physical edge after many overlaps.
   */
  readonly materialPolygon: readonly Point2[];
  /** True when the cream front face points up. Flips on every fold. */
  readonly faceUp: boolean;
}

/** A crease the engine will accept a fold along, given the current state. */
export interface LegalCrease {
  readonly id: string;
  readonly label: string;
  readonly start: Point2;
  readonly end: Point2;
  /** How many facets the fold would move. Lets an agent pick sensibly. */
  readonly movingFacets: number;
}

/** A crease that has already been folded, kept so the pattern can be drawn. */
export interface FoldedCrease {
  readonly id: string;
  readonly type: CreaseType;
  readonly start: Point2;
  readonly end: Point2;
}

export interface Sheet {
  readonly facets: readonly Facet[];
  readonly pattern: readonly FoldedCrease[];
  readonly foldCount: number;
  /** True when the whole model has been turned over an odd number of times. */
  readonly flipped: boolean;
}

export interface FoldRequest {
  readonly creaseId: string;
  readonly type: CreaseType;
}

/** Pre-fold geometry that rotates, handed to the scene purely to animate. */
export interface MovingPiece {
  readonly polygon: readonly Point2[];
  readonly layer: number;
  readonly faceUp: boolean;
}

export interface AppliedFold {
  readonly creaseId: string;
  readonly creaseLabel: string;
  readonly type: CreaseType;
  readonly axisStart: Point2;
  readonly axisEnd: Point2;
  /** Signed so the moving side sweeps up for a valley, under for a mountain. */
  readonly angleRadians: number;
  readonly movingPieces: readonly MovingPiece[];
  /** Facets in the new sheet the scene hides while the pieces above animate. */
  readonly movedFacetIds: readonly string[];
}

export type FoldResult =
  | { readonly ok: true; readonly sheet: Sheet; readonly fold: AppliedFold }
  | { readonly ok: false; readonly sheet: Sheet; readonly reason: string };

/**
 * What a fold would do, without doing it. The scene draws this as a ghost so a
 * person can see which flap moves and where it lands before committing, which
 * is the one thing a bare crease line cannot tell them.
 */
export interface FoldPreview {
  readonly creaseId: string;
  readonly creaseLabel: string;
  readonly movingFacets: number;
  readonly totalFacets: number;
  /** The flap as it is now. */
  readonly from: readonly MovingPiece[];
  /** Where that flap lands after the fold. */
  readonly to: readonly MovingPiece[];
}

/**
 * The seam a stronger geometry backend would replace. The WebMCP contract and
 * the UI both talk to this and nothing deeper.
 */
export interface FoldEngine {
  reset(): Sheet;
  legalCreases(sheet: Sheet): readonly LegalCrease[];
  fold(sheet: Sheet, request: FoldRequest): FoldResult;
  flip(sheet: Sheet): Sheet;
}
