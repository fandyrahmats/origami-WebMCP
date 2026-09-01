export type CreaseType = "valley" | "mountain";

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type Triangle = readonly [Point3, Point3, Point3];

export interface Facet {
  readonly id: string;
  readonly layer: number;
  readonly vertices: Triangle;
}

export interface Crease {
  readonly id: string;
  readonly type: CreaseType;
  readonly start: Point3;
  readonly end: Point3;
  readonly movingFacetId: string;
}

export interface Sheet {
  readonly facets: readonly Facet[];
  readonly creases: readonly Crease[];
  readonly foldCount: number;
  readonly foldedCreaseIds: readonly string[];
}

export interface FoldRequest {
  readonly creaseId: string;
  readonly type: CreaseType;
}

export interface AppliedFold {
  readonly creaseId: string;
  readonly movingFacetId: string;
  readonly axisStart: Point3;
  readonly axisEnd: Point3;
  readonly angleRadians: number;
}

export type FoldResult =
  | { readonly ok: true; readonly sheet: Sheet; readonly fold: AppliedFold }
  | { readonly ok: false; readonly sheet: Sheet; readonly reason: string };

export interface FoldEngine {
  fold(sheet: Sheet, request: FoldRequest): FoldResult;
}
