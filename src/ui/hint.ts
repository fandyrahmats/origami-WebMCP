import { el } from "../lib/dom.js";
import type { StudioState } from "../store.js";
import type { Panel } from "./panel.js";

const RESTING = "drag to orbit   scroll to zoom   click a crease to fold";

/** One terse line: refusal, active flap preview, authored next step, or controls. */
export const createHint = (): Panel => {
  const root = el("p", { className: "hint", text: RESTING });

  return {
    element: root,
    render: (state: StudioState) => {
      if (state.preview) {
        const { creaseLabel, movingFacets, totalFacets } = state.preview;
        root.textContent = `${creaseLabel}   moves ${movingFacets} of ${totalFacets}   click valley   shift+click mountain`;
        root.dataset.tone =
          state.previewSource === "agent" ? "agent" : "preview";
        return;
      }

      if (state.status && !state.status.ok) {
        root.textContent = state.status.text;
        root.dataset.tone = "refused";
        return;
      }

      if (state.progress && !state.progress.onPath) {
        root.textContent = "off sequence   undo or reset";
        root.dataset.tone = "warn";
        return;
      }

      if (state.progress?.nextStep) {
        const next = state.progress.nextStep;
        root.textContent = `fold ${state.progress.completed + 1}/${state.progress.total}   ${next.type}   ${next.note}   press ＋`;
        root.dataset.tone = "guide";
        return;
      }

      if (state.model && state.progress?.completed === state.progress?.total) {
        root.textContent = `${state.model.name.toLowerCase()}   complete`;
        root.dataset.tone = "done";
        return;
      }

      root.textContent = RESTING;
      root.dataset.tone = "calm";
    },
  };
};
