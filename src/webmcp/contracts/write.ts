import { flag, noArguments, number, schema, text } from "./types.js";
import type { ToolContract } from "./types.js";

const writes = { readOnlyHint: false } as const;
const callerTextWrites = {
  readOnlyHint: false,
  untrustedContentHint: true,
} as const;

/**
 * Writes go through the same engine the pointer and the keyboard use, so a fold
 * an agent asked for and a fold a person asked for are provably the same code
 * path. Every write returns the resulting summary, so an agent never needs a
 * follow-up read to learn what happened.
 */
export const WRITE_CONTRACTS: readonly ToolContract[] = [
  {
    name: "fold_crease",
    title: "Fold along a crease",
    description:
      "Fold the sheet along one currently legal crease. Refuses any id outside the legal set and names the legal ids in the refusal. Returns the resulting sheet summary.",
    inputSchema: schema(
      {
        crease_id: text("Crease id from list_creases, for example diag-a."),
        type: text("valley folds the flap up and over, mountain tucks it under.", [
          "valley",
          "mountain",
        ]),
      },
      ["crease_id", "type"],
    ),
    annotations: callerTextWrites,
  },
  {
    name: "advance_step",
    title: "Fold the next step",
    description:
      "Perform the next authored step of the active model. Fails when no model is selected, when the model is complete, or when the sheet has left the sequence. It never silently corrects the sheet.",
    inputSchema: noArguments,
    annotations: writes,
  },
  {
    name: "undo_fold",
    title: "Undo the last change",
    description:
      "Step back one change in the action history, whether a fold or whole-model flip. The person can always take over, so undo is available to both of you.",
    inputSchema: noArguments,
    annotations: writes,
  },
  {
    name: "redo_fold",
    title: "Redo an undone change",
    description: "Reapply the most recently undone fold or whole-model flip, when one exists.",
    inputSchema: noArguments,
    annotations: writes,
  },
  {
    name: "reset_sheet",
    title: "Reset to a fresh square",
    description:
      "Discard all folds and return to a fresh square. Past three folds this requires confirm true, so a casual call cannot wipe the person's work.",
    inputSchema: schema({
      confirm: flag("Must be true to discard more than three folds."),
    }),
    annotations: writes,
  },
  {
    name: "flip_sheet",
    title: "Turn the model over",
    description:
      "Turn the whole model over, the diagram instruction that usually loses people. Layer order and face colours invert with it.",
    inputSchema: noArguments,
    annotations: writes,
  },
  {
    name: "select_model",
    title: "Select a target model",
    description:
      "Set the active target from the authored catalogue. Does not fold anything on its own; use advance_step to walk the sequence.",
    inputSchema: schema(
      { model_id: text("Model id from list_models, for example blintz.") },
      ["model_id"],
    ),
    annotations: callerTextWrites,
  },
  {
    name: "highlight_crease",
    title: "Highlight a crease",
    description:
      "Make one crease pulse in the scene so the person can see which flap you mean. This is how you point at the answer instead of describing it.",
    inputSchema: schema(
      { crease_id: text("Crease id from list_creases.") },
      ["crease_id"],
    ),
    annotations: callerTextWrites,
  },
  {
    name: "clear_highlight",
    title: "Clear the highlight",
    description: "Remove any crease highlight from the scene.",
    inputSchema: noArguments,
    annotations: writes,
  },
  {
    name: "set_view",
    title: "Move the camera",
    description:
      "Orbit and zoom the shared camera so the person sees what you are working on. Omitted values stay as they are.",
    inputSchema: schema({
      azimuth: number("Horizontal angle in degrees.", 0, 360),
      elevation: number(
        "Vertical angle in degrees, 15 to 85. The sheet is flat, so lower is not useful.",
        15,
        85,
      ),
      zoom: number("Zoom factor, 0.5 to 2.2. The camera already frames the sheet.", 0.5, 2.2),
    }),
    annotations: writes,
  },
];
