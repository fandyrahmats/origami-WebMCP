/**
 * Direct tool calls are not guaranteed to be schema validated, so handlers read
 * their arguments through these rather than trusting the caller to have followed
 * the schema. Every reader returns null on anything it did not expect.
 */

import { TEXT_PARAMETER_LIMIT } from "../contracts/types.js";

export type Args = Readonly<Record<string, unknown>>;

export const asArgs = (input: unknown): Args =>
  typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Args)
    : {};

const LINE_BREAK = /[\r\n\u2028\u2029]/u;

export const readText = (args: Args, key: string): string | null => {
  const value = args[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 &&
    trimmed.length <= TEXT_PARAMETER_LIMIT &&
    !LINE_BREAK.test(trimmed)
    ? trimmed
    : null;
};

export const readNumber = (args: Args, key: string): number | null => {
  const value = args[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  // Agents sometimes send numerals as strings; accept that rather than refuse.
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const readFlag = (args: Args, key: string): boolean => {
  const value = args[key];

  if (typeof value === "boolean") {
    return value;
  }

  return typeof value === "string" && value.toLowerCase() === "true";
};

export const readChoice = <T extends string>(
  args: Args,
  key: string,
  options: readonly T[],
): T | null => {
  const value = readText(args, key);

  if (value === null) {
    return null;
  }

  const lowered = value.toLowerCase();
  return options.find((option) => option === lowered) ?? null;
};
