import "./styles.css";

import { createSquareSheet, DIAGONAL_CREASE_ID } from "./engine/sheet.js";
import { createCreasePicker } from "./interaction/creasePicker.js";
import { createFoldHandler } from "./interaction/foldHandler.js";
import { createFoldAnimator } from "./scene/animate.js";
import { createStage } from "./scene/renderer.js";
import { createSheetView } from "./scene/sheetMesh.js";

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("<NAMA> stage root was not found.");
}

app.dataset.product = "<NAMA>";

const initialSheet = createSquareSheet();
const stage = createStage(app);
const sheetView = createSheetView(initialSheet);
const animator = createFoldAnimator(sheetView.movingFacet);
stage.scene.add(sheetView.root);

const foldHandler = createFoldHandler(initialSheet, (result) => {
  animator.start(result.fold);
  stage.renderer.domElement.setAttribute(
    "aria-label",
    "<NAMA> sheet folded once along its diagonal crease.",
  );
});

const picker = createCreasePicker(
  stage.renderer.domElement,
  stage.camera,
  sheetView.creaseTarget,
  () => foldHandler.handleCrease(DIAGONAL_CREASE_ID),
);

stage.renderer.setAnimationLoop((time) => {
  animator.update(time);
  stage.renderer.render(stage.scene, stage.camera);
});

window.addEventListener(
  "pagehide",
  () => {
    picker.dispose();
    sheetView.dispose();
    stage.dispose();
  },
  { once: true },
);
