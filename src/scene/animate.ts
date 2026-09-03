import type { AppliedFold, LegalCrease, Sheet } from "../engine/types.js";
import type { SheetView } from "./sheetMesh.js";

/** Roughly the duration a real flap takes to fall. */
const FOLD_MS = 400;

export interface FoldQueue {
  /** Queue a fold. Never blocks, so a tool result never waits on a frame. */
  push(fold: AppliedFold, sheet: Sheet, creases: readonly LegalCrease[]): void;
  /** Redraw from state without animating, for undo, reset, flip and resize. */
  settle(sheet: Sheet, creases: readonly LegalCrease[]): void;
  update(nowMs: number): void;
  readonly busy: boolean;
}

const easeInOut = (progress: number): number =>
  progress < 0.5
    ? 2 * progress * progress
    : 1 - (-2 * progress + 2) ** 2 / 2;

interface Job {
  readonly fold: AppliedFold;
  readonly sheet: Sheet;
  readonly creases: readonly LegalCrease[];
}

export const createFoldQueue = (
  view: SheetView,
  onIdle: () => void = () => undefined,
): FoldQueue => {
  const pending: Job[] = [];
  let active: Job | null = null;
  let startedAt = 0;
  let idleScheduled = false;

  const reduceMotion =
    typeof window === "undefined"
      ? null
      : window.matchMedia("(prefers-reduced-motion: reduce)");

  const signalIdle = (): void => {
    if (idleScheduled) {
      return;
    }

    idleScheduled = true;
    queueMicrotask(() => {
      idleScheduled = false;

      // Coalesce synchronous reduced-motion folds and ignore a stale signal if
      // new work arrived before this microtask ran.
      if (active === null && pending.length === 0) {
        onIdle();
      }
    });
  };

  const finish = (job: Job): void => {
    view.clearMovingPieces();
    view.update(job.sheet, job.creases, []);
    active = null;

    // Restore presentation-only attention after the final queued fold has
    // rebuilt the scene. Never announce idle between older pending jobs.
    if (pending.length === 0) {
      signalIdle();
    }
  };

  const begin = (job: Job): void => {
    // A fold that arrives mid-animation queues rather than interleaving, so two
    // rapid agent folds cannot corrupt the visual state.
    if (reduceMotion?.matches) {
      finish(job);
      return;
    }

    active = job;
    startedAt = performance.now();

    // Draw the new state with the moved facets hidden, then deform a subdivided
    // copy of the pre-fold flap. It curls around the crease through mid-fold and
    // becomes the exact engine reflection at the end.
    view.update(job.sheet, job.creases, job.fold.movedFacetIds);
    view.prepareFold(
      job.fold.movingPieces,
      job.fold.axisStart,
      job.fold.axisEnd,
    );
    view.deformFold(0, 0);
  };

  return {
    get busy() {
      return active !== null || pending.length > 0;
    },

    push: (fold, sheet, creases) => {
      const job: Job = { fold, sheet, creases };

      // Pending work is occupied work too. Starting a newcomer while an older
      // job waits would let the older sheet repaint over the authoritative one.
      if (active || pending.length > 0) {
        pending.push(job);
        return;
      }

      begin(job);
    },

    settle: (sheet, creases) => {
      // A history change supersedes every presentation job. Without clearing
      // both active and pending work, an old fold could repaint over undo/reset.
      pending.length = 0;
      active = null;
      view.clearMovingPieces();
      view.update(sheet, creases, []);
    },

    update: (nowMs) => {
      if (!active) {
        const next = pending.shift();

        if (next) {
          begin(next);
        }

        return;
      }

      const progress = Math.min((nowMs - startedAt) / FOLD_MS, 1);
      view.deformFold(
        active.fold.angleRadians * easeInOut(progress),
        progress,
      );

      if (progress >= 1) {
        finish(active);
      }
    },
  };
};
