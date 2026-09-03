import type { CreaseType, FoldOrigin, Sheet } from "./types.js";

export type HistoryAction = "fold" | "flip" | "reset";

/**
 * One entry per accepted change, tagged with who asked for it. This is the
 * proof surface for the demo: a person's folds and an agent's folds land in the
 * same list, through the same engine, and the console colours them apart.
 */
export interface HistoryEntry {
  readonly origin: FoldOrigin;
  readonly action: HistoryAction;
  readonly label: string;
  readonly creaseId: string | null;
  readonly type: CreaseType | null;
}

/**
 * Snapshots rather than inverse operations. Sheets are small and immutable, so
 * keeping every state makes undo exact instead of approximately reversible.
 */
export interface History {
  readonly states: readonly Sheet[];
  readonly entries: readonly HistoryEntry[];
  readonly cursor: number;
}

export const createHistory = (initial: Sheet): History => ({
  states: [initial],
  entries: [],
  cursor: 0,
});

export const currentSheet = (history: History): Sheet => {
  const sheet = history.states[history.cursor];

  if (!sheet) {
    throw new Error("Fold history lost its current state.");
  }

  return sheet;
};

/** Append a change, discarding any redo tail the person had walked back over. */
export const pushHistory = (
  history: History,
  entry: HistoryEntry,
  sheet: Sheet,
): History => ({
  states: [...history.states.slice(0, history.cursor + 1), sheet],
  entries: [...history.entries.slice(0, history.cursor), entry],
  cursor: history.cursor + 1,
});

export const canUndo = (history: History): boolean => history.cursor > 0;

export const canRedo = (history: History): boolean =>
  history.cursor < history.states.length - 1;

export const undoHistory = (history: History): History =>
  canUndo(history) ? { ...history, cursor: history.cursor - 1 } : history;

/**
 * Jump anywhere in the history. Snapshots make this exact rather than a replay,
 * so scrubbing back and forth cannot accumulate drift.
 */
export const seekHistory = (history: History, index: number): History => {
  const target = Math.min(
    Math.max(Math.round(index), 0),
    history.states.length - 1,
  );

  return target === history.cursor ? history : { ...history, cursor: target };
};

export const redoHistory = (history: History): History =>
  canRedo(history) ? { ...history, cursor: history.cursor + 1 } : history;

/** The entry that produced the current state, or null at the fresh sheet. */
export const currentEntry = (history: History): HistoryEntry | null =>
  history.cursor === 0 ? null : history.entries[history.cursor - 1] ?? null;

/** Entries up to the cursor, oldest first. Undone folds are not reported. */
export const appliedEntries = (history: History): readonly HistoryEntry[] =>
  history.entries.slice(0, history.cursor);
