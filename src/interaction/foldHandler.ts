import { singleDiagonalFoldEngine } from "../engine/fold.js";
import type {
  FoldEngine,
  FoldResult,
  Sheet,
} from "../engine/types.js";

type AppliedFoldResult = Extract<FoldResult, { readonly ok: true }>;
type FoldAppliedListener = (result: AppliedFoldResult) => void;

export interface FoldHandler {
  getSheet(): Sheet;
  handleCrease(creaseId: string): FoldResult;
}

export const createFoldHandler = (
  initialSheet: Sheet,
  onApplied: FoldAppliedListener = () => undefined,
  engine: FoldEngine = singleDiagonalFoldEngine,
): FoldHandler => {
  let sheet = initialSheet;

  return {
    getSheet: () => sheet,
    handleCrease: (creaseId) => {
      const result = engine.fold(sheet, { creaseId, type: "valley" });

      if (result.ok) {
        sheet = result.sheet;
        onApplied(result);
      }

      return result;
    },
  };
};
