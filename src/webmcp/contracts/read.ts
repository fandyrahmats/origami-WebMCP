import { noArguments } from "./types.js";
import type { ToolContract } from "./types.js";

const readOnly = { readOnlyHint: true } as const;

/**
 * Reads never touch the sheet. They exist so an agent has no excuse to guess:
 * the legal crease set, the step it is on, and the layer stack are all cheap to
 * ask for, which is exactly what a canvas cannot offer.
 */
export const READ_CONTRACTS: readonly ToolContract[] = [
  {
    name: "get_sheet",
    title: "Get sheet state",
    description:
      "Summary of the paper on the stage: how many flat regions it has, how many folds have been applied, how deep the layer stack is, whether it is turned over, and how many creases are foldable now. Returns counts, not geometry.",
    inputSchema: noArguments,
    annotations: readOnly,
  },
  {
    name: "list_creases",
    title: "List foldable creases",
    description:
      "Every crease that can be folded from the current state, with its id, a short label, its endpoints in sheet coordinates, and how many flat regions the fold would move. Only these ids are accepted by fold_crease.",
    inputSchema: noArguments,
    annotations: readOnly,
  },
  {
    name: "describe_sheet",
    title: "Describe the sheet",
    description:
      "The current state in plain sentences, suitable for reading aloud to the person. Same text the canvas exposes as its accessible description.",
    inputSchema: noArguments,
    annotations: readOnly,
  },
  {
    name: "list_models",
    title: "List target models",
    description:
      "The authored catalogue: each model's id, name, difficulty, and step count. These are simple-fold models; the engine does not do reverse or petal folds, so no crane is offered.",
    inputSchema: noArguments,
    annotations: readOnly,
  },
  {
    name: "get_active_model",
    title: "Get active model",
    description:
      "Which model is selected, how many of its steps the sheet has completed, and whether the sheet is still on its sequence.",
    inputSchema: noArguments,
    annotations: readOnly,
  },
  {
    name: "get_next_step",
    title: "Get the next step",
    description:
      "The next authored step for the active model, naming the crease id, the fold type, and a short note. Fails when no model is selected or the sheet has left the sequence.",
    inputSchema: noArguments,
    annotations: readOnly,
  },
  {
    name: "check_progress",
    title: "Check progress",
    description:
      "Whether the sheet matches the expected state for the active model. Progress is measured by replaying the model and comparing geometry, so a fold the person made by hand is reported honestly rather than assumed away.",
    inputSchema: noArguments,
    annotations: readOnly,
  },
  {
    name: "get_fold_history",
    title: "Get action history",
    description:
      "Applied sheet changes in order, including folds and whole-model flips, each tagged person or agent. Returns at most the newest ten plus total and truncation counts; undone changes are excluded.",
    inputSchema: noArguments,
    annotations: readOnly,
  },
  {
    name: "get_view",
    title: "Get camera view",
    description:
      "The shared camera as azimuth degrees, elevation degrees, and zoom factor. The person and the agent drive the same view.",
    inputSchema: noArguments,
    annotations: readOnly,
  },
  {
    name: "get_tool_activity",
    title: "Get tool activity",
    description:
      "Recent tool calls this page recorded, newest last, each tagged with its origin. Entries include text supplied by the caller.",
    inputSchema: noArguments,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
];
