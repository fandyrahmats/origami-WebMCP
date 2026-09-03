import { describeSheet } from "../engine/describe.js";
import { el } from "../lib/dom.js";
import { shorten } from "../lib/format.js";
import type { StudioState } from "../store.js";
import type { Panel } from "./panel.js";

/**
 * A canvas is invisible to assistive technology unless you make it otherwise,
 * which is the same gap WebMCP fills for an agent. Both are answered from one
 * function: `describeSheet`. The visible UI can stay terse because the full
 * state lives here in sentences.
 */
export const createTextAlternative = (canvas: HTMLCanvasElement): Panel => {
  const description = el("p", {
    className: "sr-only",
    attrs: { id: "stage-description" },
  });

  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-describedby", "stage-description");
  canvas.tabIndex = 0;

  return {
    element: description,
    render: (state: StudioState) => {
      const text = describeSheet(
        state.sheet,
        state.creases,
        state.stack,
        state.progress,
      );
      description.textContent = text;
      canvas.setAttribute("aria-label", shorten(text, 180));
    },
  };
};

/** Fold results and refusals are announced politely, never assertively. */
export const createAnnouncer = (): Panel => {
  const region = el("p", {
    className: "sr-only",
    attrs: { role: "status", "aria-live": "polite", "aria-atomic": "true" },
  });

  let announcedId = 0;

  return {
    element: region,
    render: (state: StudioState) => {
      const status = state.status;

      if (!status || status.id === announcedId) {
        return;
      }

      announcedId = status.id;
      // Clearing first makes two identical consecutive outcomes distinct live
      // region events instead of relying on text inequality.
      region.textContent = "";
      queueMicrotask(() => {
        if (announcedId === status.id) region.textContent = status.text;
      });
    },
  };
};
