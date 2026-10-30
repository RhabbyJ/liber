"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Icon } from "../icon";
import "./loi-received-celebration.css";

// Owner switch: set to false to turn the new-LOI celebration off everywhere.
export const LOI_RECEIVED_CELEBRATION_ENABLED = true;
const SEEN_PREFIX = "liber:loi-received-seen:";
const wholeUsd = new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 0, style: "currency" });

// Shown once per received LOI in this browser. The burst is decorative and
// skipped entirely when the viewer prefers reduced motion.
export function LoiReceivedCelebration({ buyerName, priceCents, revisionId }: { buyerName: string; priceCents: number; revisionId: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!LOI_RECEIVED_CELEBRATION_ENABLED) return;
    const key = SEEN_PREFIX + revisionId;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      // Storage can be unavailable; celebrate without remembering.
    }
    setVisible(true);
  }, [revisionId]);

  if (!visible) return null;
  return <section aria-label="New LOI received" className="loi-received" role="status">
    <span aria-hidden="true" className="loi-received-burst">
      {Array.from({ length: 12 }, (_, index) => <i key={index} style={{ "--i": index } as CSSProperties} />)}
    </span>
    <div className="loi-received-copy">
      <p className="loi-received-eyebrow">New offer</p>
      <h3>You received an LOI</h3>
      <p>{buyerName} offered {wholeUsd.format(priceCents / 100)}. Review the terms below, then agree or counter any line.</p>
    </div>
    <button aria-label="Dismiss new offer message" className="loi-received-close" onClick={() => setVisible(false)} type="button"><Icon name="close" size={18} /></button>
  </section>;
}
