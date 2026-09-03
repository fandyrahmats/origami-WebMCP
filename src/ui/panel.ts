import type { StudioState } from "../store.js";

/**
 * Panels are pure readers: they render from the store and dispatch the same
 * intents the WebMCP handlers dispatch. None of them mutates the sheet.
 */
export interface Panel {
  readonly element: HTMLElement;
  render(state: StudioState): void;
}
