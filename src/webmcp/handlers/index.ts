import { READ_HANDLERS } from "./read.js";
import type { Handler } from "./kind.js";
import { WRITE_HANDLERS } from "./write.js";

export const HANDLERS: Readonly<Record<string, Handler>> = {
  ...READ_HANDLERS,
  ...WRITE_HANDLERS,
};

export const handlerFor = (name: string): Handler | null =>
  HANDLERS[name] ?? null;

export type { Handler, HandlerReply } from "./kind.js";
export * from "./args.js";
