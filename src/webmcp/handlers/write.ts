import type { CreaseType } from "../../engine/types.js";
import { round } from "../../lib/format.js";
import type { Store } from "../../store.js";
import { readChoice, readFlag, readNumber, readText } from "./args.js";
import type { Handler, HandlerReply } from "./kind.js";

const FOLD_TYPES: readonly CreaseType[] = ["valley", "mountain"];

const refuse = (store: Store, summary: string): HandlerReply => {
  store.report(summary, false);
  return { ok: false, summary, data: {} };
};

/** Shared tail so every write reports the state it produced. */
const summarise = (
  facets: number,
  folds: number,
  stack: number,
  foldable: number,
): Record<string, unknown> => ({ facets, folds, stack, foldable });

export const WRITE_HANDLERS: Readonly<Record<string, Handler>> = {
  fold_crease: (store, args): HandlerReply => {
    const creaseId = readText(args, "crease_id");
    const type = readChoice(args, "type", FOLD_TYPES);

    if (!creaseId) {
      return refuse(
        store,
        "crease_id is required. Call list_creases for the legal ids.",
      );
    }

    if (!type) {
      return refuse(store, "type must be valley or mountain.");
    }

    const result = store.fold(creaseId, type, "agent");

    // Never report a fold as applied when the engine rejected it.
    if (!result.ok) {
      return { ok: false, summary: result.reason, data: { applied: false } };
    }

    const state = store.getState();

    return {
      ok: true,
      summary: `Folded ${type} on the ${result.fold.creaseLabel}. ${state.sheet.facets.length} regions, stack ${state.stack} deep.`,
      data: {
        applied: true,
        crease_id: creaseId,
        type,
        ...summarise(
          state.sheet.facets.length,
          state.sheet.foldCount,
          state.stack,
          state.creases.length,
        ),
      },
    };
  },

  advance_step: (store): HandlerReply => {
    const outcome = store.advanceStep("agent");
    const state = store.getState();

    return {
      ok: outcome.ok,
      summary: outcome.message,
      data: outcome.ok
        ? {
            applied: true,
            completed: state.progress?.completed ?? 0,
            total: state.progress?.total ?? 0,
            ...summarise(
              state.sheet.facets.length,
              state.sheet.foldCount,
              state.stack,
              state.creases.length,
            ),
          }
        : { applied: false },
    };
  },

  undo_fold: (store): HandlerReply => {
    const outcome = store.undo("agent");
    const state = store.getState();

    return {
      ok: outcome.ok,
      summary: outcome.message,
      data: {
        ...summarise(
          state.sheet.facets.length,
          state.sheet.foldCount,
          state.stack,
          state.creases.length,
        ),
      },
    };
  },

  redo_fold: (store): HandlerReply => {
    const outcome = store.redo("agent");
    const state = store.getState();

    return {
      ok: outcome.ok,
      summary: outcome.message,
      data: {
        ...summarise(
          state.sheet.facets.length,
          state.sheet.foldCount,
          state.stack,
          state.creases.length,
        ),
      },
    };
  },

  reset_sheet: (store, args): HandlerReply => {
    const outcome = store.reset("agent", readFlag(args, "confirm"));

    return {
      ok: outcome.ok,
      summary: outcome.message,
      data: { reset: outcome.ok },
    };
  },

  flip_sheet: (store): HandlerReply => {
    const outcome = store.flip("agent");
    const state = store.getState();

    return {
      ok: outcome.ok,
      summary: outcome.message,
      data: { flipped: state.sheet.flipped, foldable: state.creases.length },
    };
  },

  select_model: (store, args): HandlerReply => {
    const modelId = readText(args, "model_id");

    if (!modelId) {
      return refuse(
        store,
        "model_id is required. Call list_models for the ids.",
      );
    }

    const outcome = store.selectModel(modelId);
    const state = store.getState();

    return {
      ok: outcome.ok,
      summary: outcome.ok
        ? `${outcome.message} ${state.progress?.completed ?? 0} of ${state.progress?.total ?? 0} steps already done.`
        : outcome.message,
      data: outcome.ok
        ? {
            id: state.model?.id ?? null,
            completed: state.progress?.completed ?? 0,
            total: state.progress?.total ?? 0,
            on_path: state.progress?.onPath ?? false,
          }
        : {},
    };
  },

  highlight_crease: (store, args): HandlerReply => {
    const creaseId = readText(args, "crease_id");

    if (!creaseId) {
      return refuse(store, "crease_id is required.");
    }

    const outcome = store.highlight(creaseId);

    return {
      ok: outcome.ok,
      summary: outcome.ok
        ? `Highlighted ${creaseId} in the scene.`
        : outcome.message,
      data: { highlighted: outcome.ok ? creaseId : null },
    };
  },

  clear_highlight: (store): HandlerReply => {
    store.clearHighlight();

    return {
      ok: true,
      summary: "Cleared the highlight.",
      data: { highlighted: null },
    };
  },

  set_view: (store, args): HandlerReply => {
    const azimuth = readNumber(args, "azimuth");
    const elevation = readNumber(args, "elevation");
    const zoom = readNumber(args, "zoom");

    if (azimuth === null && elevation === null && zoom === null) {
      return refuse(
        store,
        "Give at least one of azimuth, elevation, or zoom.",
      );
    }

    const view = store.setView({
      ...(azimuth === null ? {} : { azimuth }),
      ...(elevation === null ? {} : { elevation }),
      ...(zoom === null ? {} : { zoom }),
    });

    return {
      ok: true,
      summary: `Camera at azimuth ${Math.round(view.azimuth)}, elevation ${Math.round(view.elevation)}, zoom ${round(view.zoom, 2)}.`,
      data: {
        azimuth: round(view.azimuth, 1),
        elevation: round(view.elevation, 1),
        zoom: round(view.zoom, 2),
      },
    };
  },
};
