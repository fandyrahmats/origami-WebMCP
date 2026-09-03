import type { Store } from "../../store.js";
import type { Args } from "./args.js";

/**
 * Every handler returns a one-line summary a person could read aloud, plus
 * structured data for the cases where exact values matter. Handlers are pure
 * adapters over the store: no DOM, no rendering, no waiting on animation.
 */
export interface HandlerReply {
  readonly ok: boolean;
  readonly summary: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export type Handler = (store: Store, args: Args) => HandlerReply;
