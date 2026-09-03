import { el, prefersReducedMotion } from "../lib/dom.js";
import { stateLine } from "../lib/format.js";
import type { StudioState } from "../store.js";
import type { Panel } from "./panel.js";

const STREAM_LIMIT = 24;

/**
 * The signature surface and the proof surface at once. Two rules govern it and
 * neither bends: it never shows a call that did not happen, and the LIVE badge
 * is only lit when a real model context is present.
 */
export const createConsole = (): Panel => {
  const live = el("span", { className: "console-live", text: "OFFLINE" });
  const count = el("span", { className: "console-count", text: "TOOLS 0" });
  const stream = el("ol", {
    className: "console-stream",
    attrs: { "aria-label": "Tool call stream" },
  });
  const line = el("p", { className: "console-state" });

  const root = el("section", { className: "console" }, [
    el("div", { className: "console-head" }, [
      el("span", { className: "console-uri", text: "origami://model-context" }),
      live,
    ]),
    count,
    stream,
    line,
  ]);

  // Tracked by serial, not by index: the store caps its activity list, so an
  // index would stop matching once the oldest entries start dropping off.
  let lastSerial = 0;

  return {
    element: root,

    render: (state: StudioState) => {
      const { status, surface, toolCount } = state.registry;
      const labels = {
        working: "LINKING",
        offline: "OFFLINE",
        live: "LIVE",
        degraded: "DEGRADED",
        error: "ERROR",
      } as const;
      live.textContent = labels[status];
      live.dataset.live = status === "live" ? "yes" : "no";
      live.dataset.status = status;
      live.title =
        status === "offline"
          ? "No model context on this page"
          : `${labels[status]} at ${surface}`;

      count.textContent = `TOOLS ${toolCount}`;

      // Append only what is new, so the stream reads as a log rather than a
      // list that redraws itself.
      const fresh = state.activity.filter((entry) => entry.serial > lastSerial);

      for (const entry of fresh) {
        const item = el("li", { className: "console-row" }, [
          el("span", { className: "console-mark", text: "›" }),
          el("span", { className: "console-tool", text: entry.tool }),
          el("span", {
            className: "console-note",
            text: entry.summary,
            attrs: { title: entry.summary },
          }),
        ]);
        item.dataset.origin = entry.origin;
        item.dataset.ok = entry.ok ? "yes" : "no";
        stream.append(item);
      }

      lastSerial = state.activity.reduce(
        (highest, entry) => Math.max(highest, entry.serial),
        lastSerial,
      );

      while (stream.children.length > STREAM_LIMIT) {
        stream.firstElementChild?.remove();
      }

      if (fresh.length > 0 && !prefersReducedMotion()) {
        stream.scrollTop = stream.scrollHeight;
      }

      const step = state.progress
        ? `${state.progress.completed}/${state.progress.total}`
        : "none";

      line.textContent = stateLine({
        step,
        creases: state.creases.length,
        facets: state.sheet.facets.length,
        stack: state.stack,
      });
    },
  };
};
