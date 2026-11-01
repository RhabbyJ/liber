/**
 * Conversion tracking hook. No analytics vendor is bundled; this forwards
 * events to whichever tool is installed on the page:
 *
 *  - Google Tag Manager / GA4: pushed to `window.dataLayer` as `{ event, ...props }`
 *  - Plausible: `window.plausible(event, { props })`
 *  - Anything else: listen for the `unimark:track` DOM event on `window`
 */
export type TrackEvent =
  | { name: "download_click"; props: { store: "ios" | "android"; placement: string } }
  | { name: "get_app_redirect"; props: { store: "ios" | "android" } }
  | { name: "cta_click"; props: { id: string; placement: string } }
  | { name: "partner_inquiry_submit"; props: { method: "endpoint" | "email"; type: string } }
  | { name: "contact_click"; props: { channel: string } };

type Props = Record<string, string>;

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    plausible?: (event: string, options?: { props?: Props }) => void;
  }
}

export function track(event: TrackEvent): void {
  if (typeof window === "undefined") return;
  const props = event.props as Props;
  try {
    window.dataLayer?.push({ event: event.name, ...props });
    window.plausible?.(event.name, { props });
    window.dispatchEvent(new CustomEvent("unimark:track", { detail: { name: event.name, props } }));
  } catch {
    // Tracking must never break navigation or form submission.
  }
  if (process.env.NODE_ENV === "development") console.info("[track]", event.name, props);
}
