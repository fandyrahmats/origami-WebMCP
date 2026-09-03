/** Formatting helpers shared by the readouts and the tool replies. */

export const round = (value: number, places = 3): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

/** Compact point form for tool output, where the character budget is tight. */
export const pointText = (point: { x: number; z: number }): string =>
  `(${round(point.x)}, ${round(point.z)})`;

export const stepText = (completed: number, total: number): string =>
  `${completed}/${total}`;

/**
 * The console's one state line. Deliberately JSON-ish rather than JSON so it
 * reads as a readout and stays on one line.
 */
export const stateLine = (fields: Readonly<Record<string, string | number | boolean>>): string => {
  const body = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");

  return `{ ${body} }`;
};

export const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

/** Maximum persisted console/tool summary length, including ellipsis. */
export const SUMMARY_LIMIT = 180;

/** Maximum polite live-region message length, including ellipsis. */
export const STATUS_LIMIT = 240;

/**
 * Collapse caller-controlled text to one bounded display line. The return value
 * never exceeds `limit`, including its ellipsis.
 */
export const boundedLine = (text: string, limit: number): string => {
  const line = text
    .replace(/[\r\n\u2028\u2029]+/gu, " ")
    .replace(/[\t\f\v ]+/gu, " ")
    .trim();

  if (line.length <= limit) {
    return line;
  }

  if (limit <= 3) {
    return ".".repeat(Math.max(0, limit));
  }

  const cut = line.slice(0, limit - 3);
  const lastSpace = cut.lastIndexOf(" ");
  const end = lastSpace > (limit - 3) * 0.6 ? cut.slice(0, lastSpace) : cut;

  return `${end}...`;
};

/** Trim a string for a live region without cutting mid-word where avoidable. */
export const shorten = (text: string, limit: number): string =>
  boundedLine(text, limit);
