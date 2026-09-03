import "@fontsource/archivo-black/latin-400.css";
import "@fontsource/space-mono/latin-400.css";
import "@fontsource/space-mono/latin-700.css";
import "./styles.css";

import { createCreasePicker } from "./scene/creasePicker.js";
import { createHighlighter } from "./scene/highlight.js";
import { frameForSheet } from "./scene/framing.js";
import { createPresentationCoordinator } from "./scene/presentation.js";
import { createStage } from "./scene/renderer.js";
import { createSheetView } from "./scene/sheetMesh.js";
import { createStore } from "./store.js";
import { createAnnouncer, createTextAlternative } from "./ui/a11y.js";
import { createConsole } from "./ui/console.js";
import { createControls } from "./ui/controls.js";
import { createHint } from "./ui/hint.js";
import { createMarquee } from "./ui/marquee.js";
import { createSignal } from "./ui/signal.js";
import { createTimeline } from "./ui/timeline.js";
import type { Panel } from "./ui/panel.js";
import { registerTools } from "./webmcp/runtime.js";

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("The studio stage root was not found.");
}

const store = createStore();
const stage = createStage(app);
const sheetView = createSheetView();
const highlighter = createHighlighter(sheetView);
stage.scene.add(sheetView.root);

const panels: readonly Panel[] = [
  createMarquee(),
  createSignal(store),
  createConsole(),
  createControls(store),
  createTimeline(store),
  createHint(),
  createTextAlternative(stage.renderer.domElement),
  createAnnouncer(),
];

app.append(...panels.map((panel) => panel.element));

const picker = createCreasePicker(
  stage.renderer.domElement,
  stage.camera,
  sheetView.creaseGroup,
  {
    onHover: (creaseId) => store.setHovered(creaseId),
    onPick: (creaseId, type) => {
      const result = store.fold(creaseId, type, "person");
      store.logTool(
        "fold_crease",
        "person",
        result.ok ? `${type} ${creaseId}` : result.reason,
        result.ok,
      );
    },
  },
);
const presentation = createPresentationCoordinator(sheetView, picker);

// Engine state changes immediately; presentation interpolates independently.
store.onFold((fold) => {
  presentation.acceptFold(fold, store.getState());
});

store.subscribe((state) => {
  for (const panel of panels) {
    panel.render(state);
  }

  presentation.sync(state);
  highlighter.set(
    state.hovered ?? state.highlighted,
    state.previewSource ?? "person",
  );
  const frame = frameForSheet(state.sheet);
  stage.setFraming(frame.centerX, frame.centerZ, frame.radius);
  stage.applyView(state.view);
});

const detachOrbit = stage.attachOrbit((next) => {
  store.setView(next);
});

stage.renderer.setAnimationLoop((time) => {
  presentation.update(time);
  highlighter.update(time);
  stage.tickCamera();
  stage.renderer.render(stage.scene, stage.camera);
});

// Registration is the product, so it happens on startup and reports the real
// count. When no model context exists the studio stays playable by hand.
const registration = registerTools(store).catch((error: unknown) => {
  console.error("[studio] tool registration failed", error);
  const registry = store.getState().registry;
  store.setRegistry({
    status: "error",
    live: false,
    toolCount: registry.toolCount,
    surface: registry.surface,
  });
  return null;
});

window.addEventListener(
  "pagehide",
  () => {
    void registration.then((result) => result?.unregister());
    picker.dispose();
    detachOrbit();
    sheetView.dispose();
    stage.dispose();
  },
  { once: true },
);
