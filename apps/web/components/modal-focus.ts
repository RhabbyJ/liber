const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Where Tab (or Shift+Tab when `backwards`) should wrap to at a modal's edges, or null to
 * let the browser move focus normally. Focus outside the modal is pulled back in.
 */
export function tabWrapTarget<T>(focusable: readonly T[], active: T | null, activeInside: boolean, backwards: boolean): T | null {
  if (focusable.length === 0) return null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (backwards) return !activeInside || active === first ? last : null;
  return !activeInside || active === last ? first : null;
}

/** Keeps Tab and Shift+Tab inside a modal dialog's container. */
export function keepTabInside(container: HTMLElement, event: KeyboardEvent) {
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((element) => element.getClientRects().length > 0);
  const active = document.activeElement as HTMLElement | null;
  const target = tabWrapTarget(focusable, active, Boolean(active && container.contains(active)), event.shiftKey);
  if (!target) return;
  event.preventDefault();
  target.focus();
}
