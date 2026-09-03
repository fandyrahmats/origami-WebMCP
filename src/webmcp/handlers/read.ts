import { describeSheet } from "../../engine/describe.js";
import { appliedEntries } from "../../engine/history.js";
import { MODELS } from "../../engine/models.js";
import { round, shorten } from "../../lib/format.js";
import type { Handler, HandlerReply } from "./kind.js";

/** Compact tuple so every authored state's full legal set fits the budget. */
const creaseRow = (crease: {
  id: string;
  label: string;
  start: { x: number; z: number };
  end: { x: number; z: number };
  movingFacets: number;
}): readonly unknown[] => [
  crease.id,
  crease.label,
  round(crease.start.x),
  round(crease.start.z),
  round(crease.end.x),
  round(crease.end.z),
  crease.movingFacets,
];

export const READ_HANDLERS: Readonly<Record<string, Handler>> = {
  get_sheet: (store): HandlerReply => {
    const state = store.getState();

    return {
      ok: true,
      summary: `${state.sheet.facets.length} flat regions, ${state.sheet.foldCount} folds, stack ${state.stack} deep, ${state.creases.length} creases foldable.`,
      data: {
        facets: state.sheet.facets.length,
        folds: state.sheet.foldCount,
        stack: state.stack,
        flipped: state.sheet.flipped,
        foldable: state.creases.length,
        can_undo: state.canUndo,
        can_redo: state.canRedo,
      },
    };
  },

  list_creases: (store): HandlerReply => {
    const { creases } = store.getState();

    return {
      ok: true,
      summary:
        creases.length === 0
          ? "No crease can be folded from here."
          : `${creases.length} creases are foldable now.`,
      data: {
        columns: [
          "id",
          "label",
          "from_x",
          "from_z",
          "to_x",
          "to_z",
          "moves",
        ],
        creases: creases.map(creaseRow),
      },
    };
  },

  describe_sheet: (store): HandlerReply => {
    const state = store.getState();
    const description = describeSheet(
      state.sheet,
      state.creases,
      state.stack,
      state.progress,
    );

    return { ok: true, summary: description, data: { description } };
  },

  list_models: (): HandlerReply => ({
    ok: true,
    summary: `${MODELS.length} authored models: ${MODELS.map((model) => model.id).join(", ")}.`,
    data: {
      note: "Simple-fold models only. No reverse or petal folds, so no crane.",
      models: MODELS.map((model) => ({
        id: model.id,
        name: model.name,
        difficulty: model.difficulty,
        steps: model.steps.length,
      })),
    },
  }),

  get_active_model: (store): HandlerReply => {
    const { model, progress } = store.getState();

    if (!model || !progress) {
      return {
        ok: false,
        summary: "No model is selected. Call select_model first.",
        data: { selected: null },
      };
    }

    return {
      ok: true,
      summary: `${model.name}, ${progress.completed} of ${progress.total} steps done${progress.onPath ? "" : ", sheet off sequence"}.`,
      data: {
        id: model.id,
        name: model.name,
        completed: progress.completed,
        total: progress.total,
        on_path: progress.onPath,
      },
    };
  },

  get_next_step: (store): HandlerReply => {
    const state = store.getState();
    const { model, progress } = state;

    if (!model || !progress) {
      return {
        ok: false,
        summary: "No model is selected. Call select_model first.",
        data: {},
      };
    }

    if (!progress.onPath) {
      return {
        ok: false,
        summary: `The sheet has left the ${model.name} sequence. Call check_progress.`,
        data: { on_path: false },
      };
    }

    if (!progress.nextStep) {
      return {
        ok: true,
        summary: `${model.name} is complete.`,
        data: { complete: true },
      };
    }

    const crease = state.creases.find(
      (entry) => entry.id === progress.nextStep?.creaseId,
    );
    const creaseName = crease?.label ?? progress.nextStep.creaseId;

    return {
      ok: true,
      summary: `Step ${progress.completed + 1} of ${progress.total}: ${progress.nextStep.type} fold on ${creaseName} (${progress.nextStep.creaseId}), ${progress.nextStep.note}.`,
      data: {
        index: progress.completed + 1,
        total: progress.total,
        crease_id: progress.nextStep.creaseId,
        crease_label: crease?.label ?? null,
        moves: crease?.movingFacets ?? null,
        type: progress.nextStep.type,
        note: progress.nextStep.note,
      },
    };
  },

  check_progress: (store): HandlerReply => {
    const { model, progress } = store.getState();

    if (!model || !progress) {
      return { ok: false, summary: "No model is selected.", data: {} };
    }

    return {
      ok: true,
      summary: progress.onPath
        ? `On sequence, ${progress.completed} of ${progress.total} steps of ${model.name} done.`
        : `Off sequence. The sheet does not match any step of ${model.name}. Undo back to it, or reset.`,
      data: {
        on_path: progress.onPath,
        completed: progress.completed,
        total: progress.total,
      },
    };
  },

  get_fold_history: (store): HandlerReply => {
    const entries = appliedEntries(store.getState().history);
    const recent = entries.slice(-10);

    return {
      ok: true,
      summary:
        entries.length === 0
          ? "No changes yet."
          : `${entries.length} applied changes; returning the newest ${recent.length}.`,
      data: {
        total: entries.length,
        returned: recent.length,
        truncated: recent.length < entries.length,
        changes: recent.map((entry, index) => ({
          n: entries.length - recent.length + index + 1,
          origin: entry.origin,
          action: entry.action,
          crease_id: entry.creaseId,
          type: entry.type,
        })),
      },
    };
  },

  get_view: (store): HandlerReply => {
    const { view } = store.getState();

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

  get_tool_activity: (store): HandlerReply => {
    const { activity } = store.getState();
    const recent = activity.slice(-8);

    return {
      ok: true,
      summary:
        recent.length === 0
          ? "No tool calls recorded yet."
          : `${recent.length} recent calls, newest last.`,
      data: {
        calls: recent.map((entry) => ({
          n: entry.serial,
          origin: entry.origin,
          tool: entry.tool,
          ok: entry.ok,
          summary: shorten(entry.summary, 80),
        })),
      },
    };
  },
};
