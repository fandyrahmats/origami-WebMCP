import { clear, el, glyphButton } from "../lib/dom.js";
import type { Store, StudioState } from "../store.js";
import type { Panel } from "./panel.js";

/**
 * Every fold is reachable here by keyboard, not only by pointing at the canvas.
 * A canvas is invisible to assistive technology, and this control list is what
 * makes the studio playable without it.
 */
export const createControls = (store: Store): Panel => {
  const list = el("div", {
    className: "crease-list",
    attrs: { role: "group", "aria-label": "Foldable creases" },
  });

  const record = (tool: string, detail: string, ok: boolean): void => {
    store.logTool(tool, "person", detail, ok);
  };

  const advance = glyphButton("＋", "Fold the next step of the model", () => {
    const outcome = store.advanceStep("person");
    record("advance_step", outcome.message, outcome.ok);
  });
  let nextCrease: string | null = null;
  const previewNext = (): void => {
    if (nextCrease) store.setHovered(nextCrease);
  };
  advance.addEventListener("mouseenter", previewNext);
  advance.addEventListener("mouseleave", () => store.setHovered(null));
  advance.addEventListener("focus", previewNext);
  advance.addEventListener("blur", () => store.setHovered(null));
  const undo = glyphButton("↶", "Undo the last change", () => {
    const outcome = store.undo("person");
    record("undo_fold", outcome.message, outcome.ok);
  });
  const redo = glyphButton("↷", "Redo the undone change", () => {
    const outcome = store.redo("person");
    record("redo_fold", outcome.message, outcome.ok);
  });
  const flip = glyphButton("✧", "Turn the model over", () => {
    const outcome = store.flip("person");
    record("flip_sheet", outcome.message, outcome.ok);
  });
  const reset = glyphButton("↻", "Reset to a fresh square", () => {
    const first = store.reset("person", false);

    // The guard exists to stop a casual call wiping real work. A person who
    // clicks twice has confirmed.
    if (!first.ok && window.confirm(`${first.message} Reset anyway?`)) {
      const forced = store.reset("person", true);
      record("reset_sheet", forced.message, forced.ok);
      return;
    }

    record("reset_sheet", first.message, first.ok);
  });

  const actions = el(
    "div",
    { className: "actions", attrs: { role: "group", "aria-label": "Fold actions" } },
    [advance, undo, redo, flip, reset],
  );

  const root = el("section", { className: "controls" }, [
    el("span", { className: "micro", text: "FOLD CONTROL" }),
    actions,
    list,
  ]);

  let signature = "";

  return {
    element: root,

    render: (state: StudioState) => {
      const authoredNext =
        state.progress?.onPath === true ? state.progress.nextStep : null;
      nextCrease = authoredNext?.creaseId ?? null;
      advance.disabled = !authoredNext;

      const advanceLabel = authoredNext
        ? `Fold step ${(state.progress?.completed ?? 0) + 1} of ${state.progress?.total ?? 0}: ${authoredNext.type} fold, ${authoredNext.note}`
        : state.model && state.progress?.completed === state.progress?.total
          ? `${state.model.name} is complete`
          : "Fold the next step of the model";
      advance.setAttribute("aria-label", advanceLabel);
      advance.title = advanceLabel;
      undo.disabled = !state.canUndo;
      redo.disabled = !state.canRedo;

      const next = state.creases.map((crease) => crease.id).join("|");

      // Rebuilding on every state change would steal focus mid-keyboard-use, so
      // the list only redraws when the legal set actually changed.
      if (next === signature) {
        return;
      }

      signature = next;
      clear(list);

      if (state.creases.length === 0) {
        list.append(
          el("p", { className: "crease-empty", text: "no foldable crease" }),
        );
        return;
      }

      for (const crease of state.creases) {
        const row = el("div", { className: "crease-row" }, [
          el("span", { className: "crease-id", text: crease.id }),
        ]);

        // Pointing at a row previews the flap, same as hovering the crease in
        // the scene. Leaving hands attention back to whatever the agent marked.
        row.addEventListener("mouseenter", () => store.setHovered(crease.id));
        row.addEventListener("mouseleave", () => store.setHovered(null));

        for (const [glyph, type] of [
          ["∨", "valley"],
          ["∧", "mountain"],
        ] as const) {
          const button = glyphButton(
            glyph,
            `${type} fold on the ${crease.label}`,
            () => {
              const result = store.fold(crease.id, type, "person");
              record(
                "fold_crease",
                result.ok ? `${type} ${crease.id}` : result.reason,
                result.ok,
              );
            },
            "glyph glyph-small",
          );
          // Focus previews too, so a keyboard user sees which flap moves before
          // committing rather than after.
          button.addEventListener("focus", () => store.setHovered(crease.id));
          button.addEventListener("blur", () => store.setHovered(null));
          row.append(button);
        }

        list.append(row);
      }
    },
  };
};
