import { el } from "../lib/dom.js";
import type { StudioState } from "../store.js";
import type { Panel } from "./panel.js";

/**
 * The marquee carries the pitch, not a product name. Naming the product is the
 * entrant's call, so the title placeholder lives in index.html and nothing here
 * invents one.
 */
export const createMarquee = (): Panel => {
  const badge = el("span", {
    className: "badge",
    attrs: { role: "status" },
  });

  const root = el(
    "header",
    { className: "marquee" },
    [
      el("h1", { className: "marquee-lines" }, [
        el("span", { text: "Paper folds." }),
        el("span", { text: "Agents read it." }),
      ]),
      badge,
    ],
  );

  let registrySignature = "";

  return {
    element: root,
    render: (state: StudioState) => {
      const { status, live, toolCount, surface } = state.registry;
      const nextSignature = `${status}|${live}|${toolCount}|${surface}`;

      // This is a live region. Unrelated orbit, hover, or fold publications
      // must not rewrite it and cause assistive-technology chatter.
      if (nextSignature === registrySignature) {
        return;
      }

      registrySignature = nextSignature;
      const labels = {
        working: "LINKING",
        offline: "HAND MODE",
        live: "WEBMCP READY",
        degraded: "LINK DEGRADED",
        error: "LINK ERROR",
      } as const;
      badge.textContent = labels[status];
      badge.dataset.live = live ? "yes" : "no";
      badge.dataset.status = status;
      badge.setAttribute(
        "aria-label",
        status === "offline"
          ? "No model context found. The studio is playable by hand."
          : `${labels[status]}, ${toolCount} tools registered at ${surface}`,
      );
    },
  };
};
