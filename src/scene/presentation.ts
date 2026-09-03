import { sheetSignature } from "../engine/sheet.js";
import type { AppliedFold } from "../engine/types.js";
import type { StudioState } from "../store.js";
import { createFoldQueue } from "./animate.js";
import type { SheetView } from "./sheetMesh.js";

export interface AttentionPicker {
  reset(): void;
}

export interface PresentationCoordinator {
  /** Accept an engine fold before the store publishes its new state. */
  acceptFold(fold: AppliedFold, state: StudioState): void;
  /** Converge scene presentation on each authoritative store publication. */
  sync(state: StudioState): void;
  update(nowMs: number): void;
  readonly busy: boolean;
}

/**
 * Own the publication-sensitive seam between synchronous engine state and the
 * asynchronous fold queue. Keeping it DOM-free makes cancellation, FIFO order,
 * and final attention restoration integration-testable.
 */
export const createPresentationCoordinator = (
  view: SheetView,
  picker: AttentionPicker,
): PresentationCoordinator => {
  let latest: StudioState | null = null;
  let lastShape = "";

  const showCurrentPreview = (): void => {
    if (latest?.preview && latest.previewSource) {
      view.showPreview(latest.preview, latest.previewSource);
    } else {
      view.clearPreview();
    }
  };

  const queue = createFoldQueue(view, showCurrentPreview);
  const creaseModeFor = (
    state: StudioState,
  ): "active" | "complete" =>
    state.progress?.onPath === true &&
    state.progress.completed === state.progress.total
      ? "complete"
      : "active";

  return {
    get busy() {
      return queue.busy;
    },

    acceptFold: (fold, state) => {
      latest = state;
      lastShape = sheetSignature(state.sheet);
      view.setCreaseMode(creaseModeFor(state));
      queue.push(fold, state.sheet, state.creases);
    },

    sync: (state) => {
      latest = state;
      view.setCreaseMode(creaseModeFor(state));

      // Store state is authoritative; reset only the picker's local cache and
      // never trigger a re-entrant store publication from this subscriber path.
      if (state.hovered === null) {
        picker.reset();
      }

      const shape = sheetSignature(state.sheet);

      // Undo, redo, reset, seek and flip have no fold event, so they supersede
      // every obsolete presentation job and redraw directly from state.
      if (shape !== lastShape) {
        lastShape = shape;
        queue.settle(state.sheet, state.creases);
      }

      if (queue.busy) {
        view.clearPreview();
      } else {
        showCurrentPreview();
      }
    },

    update: (nowMs) => queue.update(nowMs),
  };
};
