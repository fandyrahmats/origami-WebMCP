/** Small DOM builders. The app has no UI framework, so these stand in for one. */

export interface ElementOptions {
  readonly className?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
}

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: readonly Node[] = [],
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);

  if (options.className !== undefined) {
    node.className = options.className;
  }

  if (options.text !== undefined) {
    node.textContent = options.text;
  }

  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(name, value);
  }

  node.append(...children);

  return node;
};

/**
 * A glyph control. The copy rules guarantee there is no visible caption, so the
 * accessible label is not optional: this helper refuses to build one without it.
 */
export const glyphButton = (
  glyph: string,
  label: string,
  onClick: () => void,
  className = "glyph",
): HTMLButtonElement => {
  if (label.trim().length === 0) {
    throw new Error(`Glyph control "${glyph}" needs an accessible label.`);
  }

  const button = el("button", {
    className,
    text: glyph,
    attrs: { type: "button", "aria-label": label, title: label },
  });
  button.addEventListener("click", onClick);

  return button;
};

export const microLabel = (text: string): HTMLElement =>
  el("span", { className: "micro", text });

export const clear = (node: HTMLElement): void => {
  node.replaceChildren();
};

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
