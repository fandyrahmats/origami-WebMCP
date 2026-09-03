import type { CreaseType } from "./types.js";

/**
 * Authored targets. Every step names a crease from the engine's reference set,
 * so a model is a guided path through folds the engine already accepts rather
 * than a solver result. The verifier walks each sequence end to end, which is
 * what stops a broken model from ever shipping.
 *
 * These are simple-fold models. A crane needs reverse and petal folds, which
 * this engine does not do, so no crane is offered. The README says so plainly.
 */
export interface ModelStep {
  readonly creaseId: string;
  readonly type: CreaseType;
  /** Short enough for a counter-sized readout. No prose. */
  readonly note: string;
}

export type Difficulty = "starter" | "easy" | "medium";

export interface OrigamiModel {
  readonly id: string;
  readonly name: string;
  /** Single glyph for the picker chip. Always paired with an aria-label. */
  readonly glyph: string;
  readonly difficulty: Difficulty;
  readonly steps: readonly ModelStep[];
}

const valley = (creaseId: string, note: string): ModelStep => ({
  creaseId,
  type: "valley",
  note,
});

export const MODELS: readonly OrigamiModel[] = [
  {
    id: "triangle",
    name: "Triangle",
    glyph: "◺",
    difficulty: "starter",
    steps: [valley("diag-a", "corner to corner")],
  },
  {
    id: "book",
    name: "Book fold",
    glyph: "▯",
    difficulty: "starter",
    steps: [valley("mid-v", "edge to edge")],
  },
  {
    id: "corner-tuck",
    name: "Corner tuck",
    glyph: "◩",
    difficulty: "starter",
    steps: [valley("blintz-ne", "north-east corner in")],
  },
  {
    id: "small-square",
    name: "Small square",
    glyph: "◧",
    difficulty: "easy",
    steps: [
      valley("mid-v", "fold in half"),
      valley("mid-h", "and in half again"),
    ],
  },
  {
    id: "diagonal-packet",
    name: "Diagonal packet",
    glyph: "◪",
    difficulty: "easy",
    steps: [
      valley("diag-a", "corner to corner"),
      valley("mid-v", "fold the triangle in half"),
    ],
  },
  {
    id: "letter-fold",
    name: "Letter fold",
    glyph: "▤",
    difficulty: "easy",
    steps: [
      valley("third-w", "west third in"),
      valley("third-e", "east third over"),
    ],
  },
  {
    id: "three-corner",
    name: "Three-corner tuck",
    glyph: "◇",
    difficulty: "easy",
    steps: [
      valley("blintz-ne", "north-east corner in"),
      valley("blintz-se", "south-east corner in"),
      valley("blintz-sw", "south-west corner in"),
    ],
  },
  {
    id: "blintz",
    name: "Blintz base",
    glyph: "◈",
    difficulty: "easy",
    steps: [
      valley("blintz-ne", "north-east corner in"),
      valley("blintz-se", "south-east corner in"),
      valley("blintz-sw", "south-west corner in"),
      valley("blintz-nw", "north-west corner in"),
    ],
  },
  {
    id: "four-fold-packet",
    name: "Four-fold packet",
    glyph: "◆",
    difficulty: "medium",
    steps: [
      valley("diag-a", "corner to corner"),
      valley("mid-v", "fold the triangle in half"),
      valley("mid-h", "fold the packet across"),
      valley("diag-b", "close the diagonal flap"),
    ],
  },
  {
    id: "nine-panel-packet",
    name: "Nine-panel packet",
    glyph: "▦",
    difficulty: "medium",
    steps: [
      valley("third-w", "west third in"),
      valley("third-e", "east third over"),
      valley("third-s", "south third in"),
      valley("third-n", "north third over"),
    ],
  },
  {
    id: "eight-fold-packet",
    name: "Eight-fold packet",
    glyph: "✦",
    difficulty: "medium",
    steps: [
      valley("blintz-ne", "north-east corner in"),
      valley("blintz-se", "south-east corner in"),
      valley("blintz-sw", "south-west corner in"),
      valley("blintz-nw", "north-west corner in"),
      valley("packet-n", "north edge to centre packet"),
      valley("packet-e", "east edge to centre packet"),
      valley("packet-s", "south edge to centre packet"),
      valley("packet-w", "west edge to centre packet"),
    ],
  },
];

export const findModel = (modelId: string): OrigamiModel | null =>
  MODELS.find((model) => model.id === modelId) ?? null;

export const modelIds = (): readonly string[] =>
  MODELS.map((model) => model.id);
