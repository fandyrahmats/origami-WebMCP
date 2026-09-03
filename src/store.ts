import { legalCreases } from "./engine/creases.js";
import { foldSheet, previewFold } from "./engine/fold.js";
import {
  appliedEntries,
  canRedo,
  canUndo,
  createHistory,
  currentSheet,
  pushHistory,
  redoHistory,
  seekHistory,
  undoHistory,
} from "./engine/history.js";
import type { History, HistoryEntry } from "./engine/history.js";
import { findModel } from "./engine/models.js";
import type { OrigamiModel } from "./engine/models.js";
import { maxOverlapDepth } from "./engine/overlap.js";
import { progressFor } from "./engine/progress.js";
import type { Progress } from "./engine/progress.js";
import { createSquareSheet, flipSheet } from "./engine/sheet.js";
import type {
  AppliedFold,
  CreaseType,
  FoldOrigin,
  FoldPreview,
  FoldResult,
  LegalCrease,
  Sheet,
} from "./engine/types.js";
import {
  boundedLine,
  clamp,
  STATUS_LIMIT,
  SUMMARY_LIMIT,
} from "./lib/format.js";

/** Folds beyond this make `reset_sheet` demand an explicit confirmation. */
export const RESET_GUARD_FOLDS = 3;

const ACTIVITY_LIMIT = 40;

export interface ViewState {
  readonly azimuth: number;
  readonly elevation: number;
  readonly zoom: number;
}

export interface ActivityEntry {
  readonly serial: number;
  readonly origin: FoldOrigin;
  readonly tool: string;
  readonly summary: string;
  readonly ok: boolean;
}

/**
 * What the console is allowed to claim. `live` is only true when a real model
 * context answered, and `toolCount` is only ever the number the runtime
 * actually registered.
 */
export type RegistryStatus =
  | "working"
  | "offline"
  | "live"
  | "degraded"
  | "error";

export interface RegistryState {
  readonly status: RegistryStatus;
  readonly live: boolean;
  readonly toolCount: number;
  readonly surface: string;
}

export interface StatusEvent {
  readonly id: number;
  readonly text: string;
  readonly ok: boolean;
}

export interface StudioState {
  readonly sheet: Sheet;
  readonly history: History;
  readonly creases: readonly LegalCrease[];
  readonly stack: number;
  readonly model: OrigamiModel | null;
  readonly progress: Progress | null;
  readonly highlighted: string | null;
  /** The crease the person's pointer or focus is on. Kept apart from the
   *  agent's highlight so a stray mouse cannot erase what the agent pointed at. */
  readonly hovered: string | null;
  /** What the crease under attention would do. Null when nothing is. */
  readonly preview: FoldPreview | null;
  /** Whose attention produced the preview, so the scene can colour it. */
  readonly previewSource: FoldOrigin | null;
  readonly view: ViewState;
  readonly activity: readonly ActivityEntry[];
  readonly status: StatusEvent | null;
  readonly registry: RegistryState;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export type Unsubscribe = () => void;

export interface Outcome {
  readonly ok: boolean;
  readonly message: string;
}

export interface Store {
  getState(): StudioState;
  subscribe(listener: (state: StudioState) => void): Unsubscribe;
  /** Presentation channel. Tools never wait on it. */
  onFold(listener: (fold: AppliedFold) => void): Unsubscribe;
  fold(creaseId: string, type: CreaseType, origin: FoldOrigin): FoldResult;
  advanceStep(origin: FoldOrigin): Outcome;
  undo(origin: FoldOrigin): Outcome;
  redo(origin: FoldOrigin): Outcome;
  /** Scrub to any point in the history. Exact, because states are snapshots. */
  seek(index: number): Outcome;
  reset(origin: FoldOrigin, confirm: boolean): Outcome;
  flip(origin: FoldOrigin): Outcome;
  selectModel(modelId: string): Outcome;
  setView(next: Partial<ViewState>): ViewState;
  highlight(creaseId: string): Outcome;
  clearHighlight(): void;
  /** Pointer or focus attention. Presentation only; never enters the history. */
  setHovered(creaseId: string | null): void;
  logTool(tool: string, origin: FoldOrigin, summary: string, ok: boolean): void;
  report(message: string, ok: boolean): void;
  setRegistry(registry: RegistryState): void;
}

interface Mutable {
  history: History;
  modelId: string | null;
  highlighted: string | null;
  hovered: string | null;
  view: ViewState;
  activity: ActivityEntry[];
  status: StatusEvent | null;
  registry: RegistryState;
  serial: number;
  statusSerial: number;
}

export const createStore = (): Store => {
  const inner: Mutable = {
    history: createHistory(createSquareSheet()),
    modelId: null,
    highlighted: null,
    hovered: null,
    view: { azimuth: 38, elevation: 34, zoom: 1 },
    activity: [],
    status: null,
    registry: {
      status: "working",
      live: false,
      toolCount: 0,
      surface: "none",
    },
    serial: 0,
    statusSerial: 0,
  };

  const stateListeners = new Set<(state: StudioState) => void>();
  const foldListeners = new Set<(fold: AppliedFold) => void>();
  let measuredSheet: Sheet | null = null;
  let measuredStack = 1;

  const stackFor = (sheet: Sheet): number => {
    if (sheet !== measuredSheet) {
      measuredSheet = sheet;
      measuredStack = maxOverlapDepth(sheet);
    }

    return measuredStack;
  };

  const snapshot = (): StudioState => {
    const sheet = currentSheet(inner.history);
    const model = inner.modelId ? findModel(inner.modelId) : null;
    const creases = legalCreases(sheet);
    const exists = (creaseId: string | null): creaseId is string =>
      creaseId !== null && creases.some((crease) => crease.id === creaseId);
    const hovered = exists(inner.hovered) ? inner.hovered : null;
    const highlighted = exists(inner.highlighted) ? inner.highlighted : null;

    // The person's current pointer wins over the agent's persistent mark. Both
    // are revalidated against this exact sheet so stale ids cannot mask a cue.
    const focus = hovered ?? highlighted;
    const source: FoldOrigin | null = hovered
      ? "person"
      : highlighted
        ? "agent"
        : null;

    return {
      sheet,
      history: inner.history,
      creases,
      stack: stackFor(sheet),
      model,
      progress: model ? progressFor(model, sheet) : null,
      highlighted,
      hovered,
      preview: focus ? previewFold(sheet, focus) : null,
      previewSource: source,
      view: inner.view,
      activity: inner.activity,
      status: inner.status,
      registry: inner.registry,
      canUndo: canUndo(inner.history),
      canRedo: canRedo(inner.history),
    };
  };

  const publish = (): void => {
    const state = snapshot();
    stateListeners.forEach((listener) => listener(state));
  };

  const say = (text: string, ok: boolean): void => {
    inner.status = {
      id: (inner.statusSerial += 1),
      text: boundedLine(text, STATUS_LIMIT),
      ok,
    };
  };

  const respond = (message: string, ok: boolean): Outcome => {
    say(message, ok);
    publish();
    return { ok, message };
  };

  const clearAttention = (): void => {
    inner.highlighted = null;
    inner.hovered = null;
  };

  const commit = (
    entry: HistoryEntry,
    sheet: Sheet,
  ): void => {
    inner.history = pushHistory(inner.history, entry, sheet);
  };

  const applyFold = (
    creaseId: string,
    type: CreaseType,
    origin: FoldOrigin,
  ): FoldResult => {
    const sheet = currentSheet(inner.history);
    const result = foldSheet(sheet, { creaseId, type });

    if (!result.ok) {
      say(result.reason, false);
      publish();
      return result;
    }

    commit(
      {
        origin,
        action: "fold",
        label: `${type} on ${result.fold.creaseLabel}`,
        creaseId,
        type,
      },
      result.sheet,
    );

    clearAttention();

    say(`${type} fold on the ${result.fold.creaseLabel}.`, true);
    foldListeners.forEach((listener) => listener(result.fold));
    publish();

    return result;
  };

  return {
    getState: snapshot,

    subscribe: (listener) => {
      stateListeners.add(listener);
      listener(snapshot());
      return () => stateListeners.delete(listener);
    },

    onFold: (listener) => {
      foldListeners.add(listener);
      return () => foldListeners.delete(listener);
    },

    fold: applyFold,

    advanceStep: (origin) => {
      const state = snapshot();

      if (!state.model || !state.progress) {
        return respond("No model is selected.", false);
      }

      if (!state.progress.onPath) {
        return respond(
          `The sheet has left the ${state.model.name} sequence. Read check_progress, then reset or undo back onto it.`,
          false,
        );
      }

      const step = state.progress.nextStep;

      if (!step) {
        return respond(`${state.model.name} is already complete.`, false);
      }

      const result = applyFold(step.creaseId, step.type, origin);

      return result.ok
        ? { ok: true, message: `Step ${state.progress.completed + 1} of ${state.progress.total}: ${step.note}.` }
        : { ok: false, message: result.reason };
    },

    undo: (origin) => {
      if (!canUndo(inner.history)) {
        return respond("There is nothing to undo.", false);
      }

      // Console entries are written by whoever initiated the call, so nothing
      // here logs: doing both would show one call twice.
      inner.history = undoHistory(inner.history);
      clearAttention();
      say("Undid the last change.", true);
      publish();

      return { ok: true, message: "Undid the last change." };
    },

    redo: (origin) => {
      if (!canRedo(inner.history)) {
        return respond("There is nothing to redo.", false);
      }

      inner.history = redoHistory(inner.history);
      clearAttention();
      say("Redid one change.", true);
      publish();

      return { ok: true, message: "Redid one change." };
    },

    seek: (index) => {
      const moved = seekHistory(inner.history, index);

      if (moved === inner.history) {
        return respond("Already there.", false);
      }

      inner.history = moved;
      clearAttention();
      say(
        moved.cursor === 0
          ? "Back to the fresh square."
          : `At change ${moved.cursor} of ${moved.states.length - 1}.`,
        true,
      );
      publish();

      return { ok: true, message: `At change ${moved.cursor}.` };
    },

    reset: (origin, confirm) => {
      const folds = currentSheet(inner.history).foldCount;

      if (folds > RESET_GUARD_FOLDS && !confirm) {
        return respond(
          `Resetting discards ${folds} folds. Call again with confirm true.`,
          false,
        );
      }

      // Reset discards the history, so there is no entry left to tag with an
      // origin. The console still records who called it.
      inner.history = createHistory(createSquareSheet());
      clearAttention();
      say("Back to a fresh square.", true);
      publish();

      return { ok: true, message: "Back to a fresh square." };
    },

    flip: (origin) => {
      const flipped = flipSheet(currentSheet(inner.history));
      commit(
        { origin, action: "flip", label: "turned the model over", creaseId: null, type: null },
        flipped,
      );
      clearAttention();
      say("Turned the model over.", true);
      publish();

      return { ok: true, message: "Turned the model over." };
    },

    selectModel: (modelId) => {
      const model = findModel(modelId);

      if (!model) {
        return respond(`There is no model called ${modelId}.`, false);
      }

      inner.modelId = model.id;
      clearAttention();
      say(`${model.name} selected, ${model.steps.length} steps.`, true);
      publish();

      return { ok: true, message: `${model.name} selected.` };
    },

    setView: (next) => {
      // A view change moves the projection under a stationary pointer. Release
      // stale person hover first so it cannot mask the agent's persistent cue.
      inner.hovered = null;

      // The elevation floor is 15, not 0: the sheet is flat, so a grazing view
      // collapses it to a sliver and carries no information.
      inner.view = {
        azimuth: ((next.azimuth ?? inner.view.azimuth) % 360 + 360) % 360,
        elevation: clamp(next.elevation ?? inner.view.elevation, 15, 85),
        zoom: clamp(next.zoom ?? inner.view.zoom, 0.5, 2.2),
      };
      publish();

      return inner.view;
    },

    highlight: (creaseId) => {
      const exists = snapshot().creases.some((crease) => crease.id === creaseId);

      if (!exists) {
        return respond(`${creaseId} is not a crease on this sheet.`, false);
      }

      inner.highlighted = creaseId;
      say(`Highlighted ${creaseId}.`, true);
      publish();

      return { ok: true, message: `Highlighted ${creaseId}.` };
    },

    clearHighlight: () => {
      inner.highlighted = null;
      publish();
    },

    setHovered: (creaseId) => {
      if (inner.hovered === creaseId) {
        return;
      }

      inner.hovered = creaseId;
      if (creaseId) inner.status = null;
      publish();
    },

    logTool: (tool, origin, summary, ok) => {
      inner.activity = [
        ...inner.activity,
        {
          serial: (inner.serial += 1),
          origin,
          tool,
          summary: boundedLine(summary, SUMMARY_LIMIT),
          ok,
        },
      ].slice(-ACTIVITY_LIMIT);
      publish();
    },

    report: (message, ok) => {
      say(message, ok);
      publish();
    },

    setRegistry: (registry) => {
      inner.registry = registry;
      publish();
    },
  };
};

export { appliedEntries };
