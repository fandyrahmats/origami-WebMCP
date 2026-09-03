import type { Progress } from "./progress.js";
import type { LegalCrease, Sheet } from "./types.js";

/**
 * The sheet in words. One function feeds both the `describe_sheet` tool and the
 * canvas text alternative, so a screen reader user and an agent are told exactly
 * the same thing about the paper. That shared source is the whole argument: a
 * canvas carries no text, and this is the text it was missing.
 */
export const describeSheet = (
  sheet: Sheet,
  creases: readonly LegalCrease[],
  stack: number,
  progress: Progress | null,
): string => {
  const sentences: string[] = [];

  sentences.push(
    sheet.foldCount === 0
      ? "A fresh square sheet, one layer, unfolded."
      : `A sheet folded ${sheet.foldCount} ${sheet.foldCount === 1 ? "time" : "times"}, now ${sheet.facets.length} flat regions in a stack ${stack} deep.`,
  );

  if (sheet.flipped) {
    sentences.push("The model is currently turned over.");
  }

  if (creases.length === 0) {
    sentences.push("No crease can be folded from here.");
  } else {
    const named = creases
      .slice(0, 6)
      .map((crease) => crease.label)
      .join(", ");
    const more = creases.length > 6 ? `, and ${creases.length - 6} more` : "";
    sentences.push(
      `${creases.length} ${creases.length === 1 ? "crease is" : "creases are"} foldable: ${named}${more}.`,
    );
  }

  if (progress) {
    sentences.push(
      progress.onPath
        ? `Following ${progress.modelName}, ${progress.completed} of ${progress.total} steps done.`
        : `${progress.modelName} is selected, but the sheet has left its step sequence.`,
    );

    if (progress.onPath && progress.nextStep) {
      sentences.push(
        `Next is a ${progress.nextStep.type} fold on ${progress.nextStep.creaseId}: ${progress.nextStep.note}.`,
      );
    }
  }

  return sentences.join(" ");
};
