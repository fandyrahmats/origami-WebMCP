import { foldSheet } from "./fold.js";
import type { ModelStep, OrigamiModel } from "./models.js";
import { createSquareSheet, sheetSignature } from "./sheet.js";
import type { Sheet } from "./types.js";

/**
 * Progress is measured, not remembered. Replaying the authored sequence from a
 * fresh square and matching the result against the sheet on the stage means the
 * step counter always describes the paper as it actually is. When the person
 * folds something of their own, `onPath` goes false on its own and the agent is
 * told the truth rather than continuing from an assumption.
 */
export interface Progress {
  readonly modelId: string;
  readonly modelName: string;
  readonly completed: number;
  readonly total: number;
  readonly onPath: boolean;
  readonly nextStep: ModelStep | null;
}

/** Every state the authored sequence passes through, fresh square first. */
export const replayModel = (model: OrigamiModel): readonly Sheet[] => {
  const states: Sheet[] = [createSquareSheet()];

  for (const step of model.steps) {
    const from = states[states.length - 1];

    if (!from) {
      break;
    }

    const result = foldSheet(from, {
      creaseId: step.creaseId,
      type: step.type,
    });

    // A model whose steps stop applying is a broken model. The verifier asserts
    // every catalogue entry replays in full, so this never happens in a build
    // that shipped.
    if (!result.ok) {
      break;
    }

    states.push(result.sheet);
  }

  return states;
};

export const progressFor = (model: OrigamiModel, sheet: Sheet): Progress => {
  const states = replayModel(model);
  const target = sheetSignature(sheet);
  let matched = -1;

  for (let index = states.length - 1; index >= 0; index -= 1) {
    const state = states[index];

    if (state && sheetSignature(state) === target) {
      matched = index;
      break;
    }
  }

  const onPath = matched >= 0;

  return {
    modelId: model.id,
    modelName: model.name,
    completed: onPath ? matched : 0,
    total: model.steps.length,
    onPath,
    nextStep: onPath ? (model.steps[matched] ?? null) : null,
  };
};
