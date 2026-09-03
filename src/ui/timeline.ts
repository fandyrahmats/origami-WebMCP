import { appliedEntries } from "../engine/history.js";
import { clear, el } from "../lib/dom.js";
import type { Store, StudioState } from "../store.js";
import type { Panel } from "./panel.js";

/**
 * Scrub the action history. Origami Simulator has a Fold Percent slider that
 * drives every crease at once; the equivalent for a step-based studio is a scrub
 * across the steps that were actually taken.
 *
 * It doubles as the timeline of who did what: one segment per change, green for
 * the agent and pink for the person, in the order they happened. A change is a
 * transition rather than a moment, so a segment spans the gap between two states
 * and lines up with the slider by construction.
 */
export const createTimeline = (store: Store): Panel => {
  const ribbon = el("div", { className: "ribbon", attrs: { "aria-hidden": "true" } });

  const scrub = el("input", {
    className: "scrub",
    attrs: {
      type: "range",
      min: "0",
      max: "0",
      step: "1",
      value: "0",
      "aria-label": "Scrub the action history",
    },
  });

  const readout = el("span", { className: "timeline-count", text: "0/0" });

  scrub.addEventListener("input", () => {
    store.seek(Number(scrub.value));
  });

  const root = el("section", { className: "timeline" }, [
    el("div", { className: "timeline-head" }, [
      el("span", { className: "micro", text: "ACTION HISTORY" }),
      readout,
    ]),
    ribbon,
    scrub,
  ]);

  let signature = "";

  return {
    element: root,

    render: (state: StudioState) => {
      const total = state.history.states.length - 1;
      const cursor = state.history.cursor;

      readout.textContent = `${cursor}/${total}`;
      scrub.max = String(total);
      scrub.disabled = total === 0;

      // Do not fight the pointer: only write the value when it actually differs.
      if (scrub.value !== String(cursor)) {
        scrub.value = String(cursor);
      }

      const entries = state.history.entries;
      const next = `${entries.map((entry) => entry.origin[0]).join("")}|${cursor}`;

      if (next === signature) {
        return;
      }

      signature = next;
      clear(ribbon);

      for (const [index, entry] of entries.entries()) {
        const segment = el("span", { className: "ribbon-cell" });
        segment.dataset.origin = entry.origin;
        // Everything past the cursor has been scrubbed away but is still redoable.
        segment.dataset.applied = index < cursor ? "yes" : "no";
        segment.title = `${index + 1}. ${entry.origin}: ${entry.label}`;
        ribbon.append(segment);
      }

      const applied = appliedEntries(state.history);
      root.dataset.empty = applied.length === 0 ? "yes" : "no";
    },
  };
};
