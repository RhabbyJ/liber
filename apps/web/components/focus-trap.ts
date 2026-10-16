import { isElementRendered } from "./element-visibility";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(", ");

/** Rendered, focusable elements in and under `roots`, in the order the roots are given. */
export function focusableElements(roots: Array<HTMLElement | null | undefined>) {
  return roots.flatMap((root) => {
    if (!root) return [];
    const own = root.matches(FOCUSABLE) ? [root] : [];
    return [...own, ...Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))];
  }).filter((element) => isElementRendered(element));
}

/**
 * Where a Tab press must send focus to keep it inside `focusables`: wraps at
 * either end and pulls stray focus back in. Null means the browser's own Tab
 * order already stays inside.
 */
export function focusTrapTarget<T>(focusables: readonly T[], active: unknown, backwards: boolean): T | null {
  if (focusables.length === 0) return null;
  const index = focusables.indexOf(active as T);
  if (index === -1) return backwards ? focusables[focusables.length - 1]! : focusables[0]!;
  if (backwards && index === 0) return focusables[focusables.length - 1]!;
  if (!backwards && index === focusables.length - 1) return focusables[0]!;
  return null;
}
