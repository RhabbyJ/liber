/**
 * False when the element is missing, detached, or inside a `display: none`
 * subtree (for example the inbox sidebar beside an open thread on phones),
 * because such elements have no layout boxes.
 */
export function isElementRendered(element: Pick<Element, "getClientRects"> | null | undefined) {
  return Boolean(element && element.getClientRects().length > 0);
}
