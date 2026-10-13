"use client";

import Link from "next/link";
import type { MessagingLoiSummary } from "../../lib/messaging-loi-summary";
import { Icon } from "../icon";
import "./chat-loi-action.css";

export function ChatLoiAction({ loi, busy, onStart }: {
  loi: MessagingLoiSummary;
  busy: boolean;
  onStart: () => void;
}) {
  if (!loi.available || (!loi.id && !loi.canCreate)) return null;
  const completed = Boolean(loi.id && loi.status === "TERMS_ALIGNED");

  return (
    <section aria-label="LOI proposal" className="chat-loi-action">
      <div className="chat-loi-copy">
        <strong>{completed ? "Completed LOI" : loi.id ? "Continue your proposal" : "Ready to discuss terms?"}</strong>
        <p>{completed ? "Both parties can view the final terms. This LOI is read-only." : "Prepare a non-binding LOI for this property."}</p>
      </div>
      {loi.id ? (
        <Link className="button primary chat-loi-button" href={`/negotiations/${encodeURIComponent(loi.id)}`}>
          <Icon name="doc" size={18} /> {completed ? "View completed LOI" : "Open LOI"} <Icon name="arrow-right" size={17} />
        </Link>
      ) : (
        <button className="button primary chat-loi-button" disabled={busy} onClick={onStart} type="button">
          <Icon name="doc" size={18} /> {busy ? "Opening LOI…" : "Start LOI"} <Icon name="arrow-right" size={17} />
        </button>
      )}
    </section>
  );
}
