"use client";

import { useEffect, useState } from "react";
import { site, type StoreId } from "@/content/site";
import { track } from "@/lib/track";

function detectStore(): StoreId | null {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  // iPadOS reports a desktop Mac user agent, so also check for touch support.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return null;
}

/**
 * Sends phones straight to the right store. `location.replace` keeps this page
 * out of the history, so the back button returns to where the visitor came from.
 * Desktop visitors stay and see both options.
 */
export function AppRedirect() {
  const [store, setStore] = useState<StoreId | null>(null);

  useEffect(() => {
    const detected = detectStore();
    if (!detected) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the user agent, which only exists in the browser
    setStore(detected);
    track({ name: "get_app_redirect", props: { store: detected } });
    window.location.replace(site.stores[detected].url);
  }, []);

  if (!store) return null;
  return (
    <p role="status" className="mt-6 text-[0.95rem] font-semibold text-white/80">
      Opening {site.stores[store].label}…
    </p>
  );
}
