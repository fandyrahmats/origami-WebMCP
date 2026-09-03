import { MODELS } from "../engine/models.js";
import type { Difficulty } from "../engine/models.js";
import { el } from "../lib/dom.js";
import type { Store, StudioState } from "../store.js";
import type { Panel } from "./panel.js";

interface Counter {
  readonly root: HTMLElement;
  readonly value: HTMLElement;
}

const DIFFICULTIES = ["starter", "easy", "medium"] as const satisfies readonly Difficulty[];

/** State is numbers, not sentences. */
const counter = (label: string): Counter => {
  const value = el("strong", { className: "counter-value", text: "0" });
  const root = el("div", { className: "counter" }, [
    el("span", { className: "micro", text: label }),
    value,
  ]);

  return { root, value };
};

/** Counters plus one compact, grouped catalogue disclosure. */
export const createSignal = (store: Store): Panel => {
  const step = counter("STEP");
  const creases = counter("CREASES");
  const facets = counter("FACETS");
  const stack = counter("STACK");
  const selectedGlyph = el("span", {
    className: "model-summary-glyph",
    text: "✧",
  });
  const selectedName = el("span", {
    className: "model-summary-name",
    text: "choose model",
  });
  const selectedSteps = el("span", {
    className: "model-summary-steps",
    text: String(MODELS.length),
  });
  const summary = el("summary", { className: "model-summary" }, [
    el("span", { className: "micro", text: "MODEL" }),
    selectedGlyph,
    selectedName,
    selectedSteps,
  ]);
  const tray = el("div", { className: "model-tray" });
  const picker = el("details", { className: "model-picker" }, [summary, tray]);
  const buttons: { readonly id: string; readonly button: HTMLButtonElement }[] = [];

  for (const difficulty of DIFFICULTIES) {
    const labelId = `models-${difficulty}`;
    const label = el("span", {
      className: "micro model-group-label",
      text: difficulty,
    });
    label.id = labelId;
    const chips = el("div", { className: "chips" });

    for (const model of MODELS.filter((entry) => entry.difficulty === difficulty)) {
      const button = el("button", {
        className: "chip",
        text: model.glyph,
        attrs: {
          type: "button",
          "aria-label": `${model.name}, ${model.difficulty}, ${model.steps.length} steps`,
          title: `${model.name} (${model.steps.length} steps)`,
        },
      });
      button.addEventListener("click", () => {
        const outcome = store.selectModel(model.id);
        store.logTool("select_model", "person", model.id, outcome.ok);

        if (outcome.ok) {
          picker.open = false;
          summary.focus();
        }
      });
      chips.append(button);
      buttons.push({ id: model.id, button });
    }

    tray.append(
      el(
        "div",
        {
          className: "model-group",
          attrs: { role: "group", "aria-labelledby": labelId },
        },
        [label, chips],
      ),
    );
  }

  const root = el("section", { className: "signal" }, [
    el("div", { className: "counters" }, [
      step.root,
      creases.root,
      facets.root,
      stack.root,
    ]),
    picker,
  ]);

  return {
    element: root,
    render: (state: StudioState) => {
      step.value.textContent = state.progress
        ? `${state.progress.completed}/${state.progress.total}`
        : "–";
      creases.value.textContent = String(state.creases.length);
      facets.value.textContent = String(state.sheet.facets.length);
      stack.value.textContent = String(state.stack);
      step.root.dataset.warn =
        state.progress && !state.progress.onPath ? "yes" : "no";

      selectedGlyph.textContent = state.model?.glyph ?? "✧";
      selectedName.textContent = state.model?.name ?? "choose model";
      selectedSteps.textContent = state.progress
        ? `${state.progress.completed}/${state.progress.total}`
        : String(MODELS.length);
      summary.setAttribute(
        "aria-label",
        state.model
          ? `Change model. ${state.model.name} selected, ${state.progress?.completed ?? 0} of ${state.model.steps.length} steps complete.`
          : `Choose from ${MODELS.length} target models.`,
      );

      for (const entry of buttons) {
        const active = state.model?.id === entry.id;
        entry.button.dataset.active = active ? "yes" : "no";
        entry.button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    },
  };
};
