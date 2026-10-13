"use client";

import { LOI_RESPONSE_WINDOW_HOURS } from "@liber/validators";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { LoiNegotiation } from "./loi-types";
import { canActOnLoi, canEditLoi, type LoiWorkspaceViewState } from "./loi-workspace-state";

export function LoiActionBar({ negotiation, view, pending, error, financingEvidenceRequired = false, liveTotal = null, onCurrent, onEdit, onReview, onSave, onDiscard, onSubmit, onDecision, onSaveTemplate, onUseTemplate }: {
  negotiation: LoiNegotiation;
  view: LoiWorkspaceViewState;
  pending: string | null;
  error?: string;
  financingEvidenceRequired?: boolean;
  liveTotal?: { label: string; value: string } | null;
  onCurrent: () => void;
  onEdit: () => void;
  onReview: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onSubmit: () => void;
  onDecision: (decision: "agree" | "decline" | "withdraw") => void;
  onSaveTemplate?: () => void;
  onUseTemplate?: () => void;
}) {
  const more = useRef<HTMLDetailsElement>(null);
  const busy = Boolean(pending);
  const canEdit = canEditLoi(negotiation);
  const canAct = canActOnLoi(negotiation);
  const completed = negotiation.status === "TERMS_ALIGNED";
  const editing = view.mode === "EDITING" && canEdit;
  const reviewing = view.mode === "REVIEWING" && canEdit;
  const historical = view.mode === "HISTORICAL";
  const withdraw = canAct && negotiation.allowedActions.includes("WITHDRAW");
  const decline = canAct && negotiation.allowedActions.includes("DECLINE");
  const agree = canAct && negotiation.allowedActions.includes("AGREE");
  const useTemplate = canEdit && (editing || reviewing) && onUseTemplate;
  const needsSave = view.dirty || view.draftVersion < 1;
  const backToMessages = !historical && negotiation.currentSequence > 0 && !canEdit && !agree && !decline;
  const waiting = negotiation.status === "AWAITING_BUYER_RESPONSE" || negotiation.status === "AWAITING_SELLER_RESPONSE";

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !more.current?.contains(event.target)) more.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  if (!historical && !canEdit && !withdraw && !decline && !agree && !backToMessages) return null;

  return (
    <div aria-busy={busy} aria-label="LOI actions" className="loi-action-bar" role="region">
      <div className="loi-action-context" id="loi-action-help">
        <strong>{historical ? "Viewing a past version" : completed ? "Completed LOI · Read-only" : editing ? "Step 1 of 3 · Draft your terms" : reviewing ? "Step 2 of 3 · Review before sending" : agree ? "Your response" : canEdit ? "Prepare your draft" : waiting ? "LOI submitted" : "Continue in messages"}</strong>
        {error ? <p className="field-hint invalid" role="alert">{error}</p> : <span>{historical ? "Return to the latest terms and status."
          : completed ? "Both parties can return to view these final terms."
          : editing ? view.staleDraft ? "Load the latest saved draft to continue." : "Your draft stays private until you submit it."
          : reviewing ? `Next: submit. The other party then has ${LOI_RESPONSE_WINDOW_HOURS} hours to respond.`
          : agree ? `Respond to version ${negotiation.currentSequence} after reviewing its terms.`
          : canEdit ? "Start with the current terms, then review your changes."
          : waiting ? "Your terms were sent. Continue the conversation while you wait."
          : "Return to the conversation for next steps."}</span>}
        {liveTotal ? <p aria-hidden="true" className="loi-action-live">{liveTotal.label} <strong>{liveTotal.value}</strong></p> : null}
      </div>
      <div className="loi-action-controls">
        {error && financingEvidenceRequired && negotiation.viewerRole === "BUYER" ? <Link className="button secondary" href="/buyer/profile#buyer-verification-card">Upload pre-approval letter</Link> : null}
        {onSaveTemplate || useTemplate || (!historical && !reviewing && (editing || withdraw || decline)) ? (
          <details className="loi-more-actions" key={`${view.mode}:${negotiation.currentSequence}`} onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.currentTarget.removeAttribute("open");
            event.currentTarget.querySelector("summary")?.focus();
          }} ref={more}>
            <summary>More options</summary>
            <div className="loi-more-panel">
              {onSaveTemplate ? <button className="button secondary" disabled={busy || view.staleDraft} onClick={onSaveTemplate} type="button">Save LOI template</button> : null}
              {useTemplate ? <button className="button secondary" disabled={busy || view.staleDraft} onClick={useTemplate} type="button">Use saved template</button> : null}
              {!historical && !reviewing && editing ? <>
                <button className="button secondary" disabled={busy || !needsSave || view.staleDraft} onClick={onSave} type="button">{pending === "save" ? "Saving…" : "Save draft for later"}</button>
                <button className="button secondary" disabled={busy || view.staleDraft} onClick={onDiscard} type="button">{negotiation.currentSequence === 0 ? "Reset initial draft" : "Discard counter draft"}</button>
              </> : null}
              {!historical && !reviewing && !editing && decline ? <button className="button warning" disabled={busy} onClick={() => onDecision("decline")} type="button">Decline version {negotiation.currentSequence}</button> : null}
              {!historical && !reviewing && withdraw ? <button className="button warning" disabled={busy} onClick={() => onDecision("withdraw")} type="button">Withdraw LOI</button> : null}
            </div>
          </details>
        ) : null}
        {historical ? (
          <button className="button primary" disabled={busy} onClick={onCurrent} type="button">Return to current version {negotiation.currentSequence}</button>
        ) : reviewing ? (
          <>
            <button className="button secondary" disabled={busy} onClick={onEdit} type="button">Back to edit</button>
            <button aria-describedby="loi-action-help" className="button primary" disabled={busy || needsSave || view.staleDraft} onClick={onSubmit} type="button">
              {pending === "submit" ? "Submitting…" : negotiation.currentSequence ? `Submit counter · version ${negotiation.currentSequence + 1}` : "Submit LOI · version 1"}
            </button>
          </>
        ) : (
          <>
            {editing ? (
              <button aria-describedby="loi-action-help" className="button primary" disabled={busy || view.staleDraft} onClick={onReview} type="button">{pending === "save" ? "Saving…" : needsSave ? "Save and review" : "Review LOI"}</button>
            ) : <>
              {canEdit ? <button className={`button ${agree ? "secondary" : "primary"}`} disabled={busy} onClick={onEdit} type="button">{negotiation.draft ? "Resume private draft" : negotiation.currentSequence === 0 ? "Start initial draft" : "Propose changes"}</button> : null}
              {agree ? <button className="button primary" disabled={busy} onClick={() => onDecision("agree")} type="button">Agree to terms · version {negotiation.currentSequence}</button> : null}
              {backToMessages ? <Link aria-disabled={busy || undefined} className="button primary" href={`/messages/${encodeURIComponent(negotiation.conversationId)}`} onClick={(event) => { if (busy) event.preventDefault(); }} tabIndex={busy ? -1 : undefined}>Back to messages</Link> : null}
            </>}
          </>
        )}
      </div>
    </div>
  );
}
