import { boundedLine, SUMMARY_LIMIT } from "../lib/format.js";
import { OUTPUT_LIMIT } from "./contracts/index.js";
import type { ToolContract } from "./contracts/index.js";
import type { HandlerReply } from "./handlers/index.js";

/**
 * Shape of the parts of the WebMCP surface this app uses. Declared locally
 * because the specification is still moving and there is no ambient type to
 * lean on yet; nothing here invents a method the API does not have.
 */
export interface ModelContextSurface {
  registerTool(
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema: unknown;
      annotations?: unknown;
      execute: (input: unknown, context?: unknown) => Promise<string>;
    },
    options?: { signal?: AbortSignal },
  ): Promise<unknown> | unknown;
}

export interface ResolvedSurface {
  readonly surface: ModelContextSurface | null;
  /** Where it was found, reported verbatim by the console. Never guessed. */
  readonly origin: "document.modelContext" | "navigator.modelContext" | "none";
}

const asSurface = (candidate: unknown): ModelContextSurface | null => {
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }

  const registerTool = (candidate as { registerTool?: unknown }).registerTool;

  return typeof registerTool === "function"
    ? (candidate as ModelContextSurface)
    : null;
};

/**
 * Prefer `document.modelContext` and fall back to `navigator.modelContext`,
 * because the specification has used both. When neither answers, the app stays
 * fully playable by hand and says so rather than pretending.
 */
export const resolveModelContext = (): ResolvedSurface => {
  if (typeof document !== "undefined") {
    const fromDocument = asSurface(
      (document as unknown as { modelContext?: unknown }).modelContext,
    );

    if (fromDocument) {
      return { surface: fromDocument, origin: "document.modelContext" };
    }
  }

  if (typeof navigator !== "undefined") {
    const fromNavigator = asSurface(
      (navigator as unknown as { modelContext?: unknown }).modelContext,
    );

    if (fromNavigator) {
      return { surface: fromNavigator, origin: "navigator.modelContext" };
    }
  }

  return { surface: null, origin: "none" };
};

/**
 * Return one escaped JSON envelope. A caller-controlled line break can never
 * become a framing delimiter, and the defensive overflow envelope remains
 * valid JSON instead of slicing through structured data.
 */
export const formatReply = (reply: HandlerReply): string => {
  const summary = boundedLine(reply.summary, SUMMARY_LIMIT);
  const body = JSON.stringify({
    ok: reply.ok,
    summary,
    data: reply.data,
  });

  if (body.length <= OUTPUT_LIMIT) {
    return body;
  }

  const suffix = " [structured data omitted]";
  return JSON.stringify({
    ok: reply.ok,
    summary: `${boundedLine(summary, SUMMARY_LIMIT - suffix.length)}${suffix}`,
    data: {
      truncated: true,
      original_chars: body.length,
    },
  });
};

/** Registration payload built straight from the contract, never hand-copied. */
export const toolPayload = (
  contract: ToolContract,
  execute: (input: unknown) => Promise<string>,
): Parameters<ModelContextSurface["registerTool"]>[0] => ({
  name: contract.name,
  title: contract.title,
  description: contract.description,
  inputSchema: contract.inputSchema,
  annotations: contract.annotations,
  execute,
});
