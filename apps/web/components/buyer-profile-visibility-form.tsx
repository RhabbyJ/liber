"use client";

import { useActionState } from "react";
import { initialActionFeedback, type ActionFeedbackState } from "../lib/action-feedback";
import "./disclosure-action.css";

type VisibilityAction = (state: ActionFeedbackState, formData: FormData) => Promise<ActionFeedbackState>;

/** Republish a paused profile in one step; pausing a live profile asks for confirmation first. */
export function BuyerProfileVisibilityForm({ action, target }: { action: VisibilityAction; target: "ACTIVE" | "DRAFT" }) {
  const [state, formAction, pending] = useActionState(action, initialActionFeedback);
  const error = state.message ? <p className="auth-alert error" role="alert">{state.message}</p> : null;

  if (target === "ACTIVE") {
    return (
      <form action={formAction} aria-busy={pending} className="stack tight">
        <input name="visibilityStatus" type="hidden" value="ACTIVE" />
        <button className="button primary" disabled={pending} type="submit">
          {pending ? "Republishing…" : "Republish profile"}
        </button>
        {error}
      </form>
    );
  }

  return (
    <details className="disclosure-action">
      <summary className="button secondary">Pause profile</summary>
      <form action={formAction} aria-busy={pending} className="disclosure-action-panel">
        <input name="visibilityStatus" type="hidden" value="DRAFT" />
        <p>
          While paused, sellers can’t find or invite you. Your open invites are withdrawn and their conversations
          become read-only; republishing doesn’t reopen them.
        </p>
        <button className="button warning sm" disabled={pending} type="submit">
          {pending ? "Pausing…" : "Pause profile"}
        </button>
        {error}
      </form>
    </details>
  );
}
