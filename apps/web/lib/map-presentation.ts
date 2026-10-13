import type { MapboxMap, MapboxPopup } from "./mapbox-gl-loader";

// Real-estate maps read cleaner without business POIs and transit labels competing with pins.
const quietLayerPattern = /(poi-label|transit-label|airport-label)/;

export function quietBasemap(map: MapboxMap) {
  for (const layer of map.getStyle()?.layers ?? []) {
    if (quietLayerPattern.test(layer.id)) map.setLayoutProperty(layer.id, "visibility", "none");
  }
}

/** Rotation has no compass to undo it here, so keep every map north-up. */
export function lockMapOrientation(map: MapboxMap) {
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
}

/**
 * Popup cards: Escape closes and returns focus to the pin, keyboard-opened cards take focus,
 * and internal links navigate in-app so the map and its view survive the round trip.
 */
export function wirePopupInteractions(
  popup: MapboxPopup,
  {
    focusLink = false,
    navigate,
    returnFocusTo,
  }: { focusLink?: boolean; navigate?: (href: string) => void; returnFocusTo?: HTMLElement },
) {
  const element = popup.getElement();
  if (!element) return;
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    popup.remove();
    returnFocusTo?.focus();
  });
  if (navigate) {
    for (const link of element.querySelectorAll<HTMLAnchorElement>("a[href^='/']")) {
      link.addEventListener("click", (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(link.getAttribute("href") ?? "/");
      });
    }
  }
  if (focusLink) element.querySelector<HTMLElement>("a[href]")?.focus();
}

export function canHover() {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type PinBox = { bottom: number; left: number; right: number; top: number };

/**
 * Keeps budget labels readable: in result order, a pin keeps its price label
 * only when it does not overlap an already-labelled pin; the rest render as dots.
 */
export function declutterPricePins(
  map: MapboxMap,
  pins: Array<{ lat: number; lng: number; node: HTMLElement; offset: [number, number] }>,
) {
  const placed: PinBox[] = [];
  for (const pin of pins) {
    const point = map.project([pin.lng, pin.lat]);
    const width = Number(pin.node.dataset.labelWidth) || 56;
    const x = point.x + pin.offset[0];
    const y = point.y + pin.offset[1];
    const box = { bottom: y + 2, left: x - width / 2 - 3, right: x + width / 2 + 3, top: y - 26 };
    const collides = placed.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
    pin.node.classList.toggle("as-dot", collides);
    if (!collides) placed.push(box);
  }
}
