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
    <section aria-label="LOI proposal" className={`chat-loi-action${completed ? " completed" : ""}`}>
      <span aria-hidden="true" className="chat-loi-icon">
        <Icon name={completed ? "check" : "doc"} size={20} />
      </span>
      <div className="chat-loi-copy">
        <strong>{completed ? "Completed LOI" : loi.id ? "Continue your proposal" : "Ready to discuss terms?"}</strong>
        <p>{completed ? "Both parties can view the final terms. This LOI is read-only." : "Prepare a non-binding LOI for this property."}</p>
      </div>
      {loi.id ? (
        <Link className="button primary chat-loi-button" href={`/negotiations/${encodeURIComponent(loi.id)}`}>
          {completed ? "View completed LOI" : "Open LOI"}
        </Link>
      ) : (
        <button className="button primary chat-loi-button" disabled={busy} onClick={onStart} type="button">
          {busy ? "Opening LOI…" : "Start LOI"}
        </button>
      )}
    </section>
  );
}
