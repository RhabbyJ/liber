"use client";

import { useActionState } from "react";
import { initialActionFeedback, type ActionFeedbackState } from "../lib/action-feedback";
import "./disclosure-action.css";

/** Confirm-first withdrawal of one of the seller's open invites. */
export function SellerInviteWithdrawForm({ action, buyer, inviteId }: {
  action: (state: ActionFeedbackState, formData: FormData) => Promise<ActionFeedbackState>;
  buyer: string;
  inviteId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionFeedback);

  if (state.ok) return <p className="disclosure-action-result" role="status">{state.message}</p>;

  return (
    <details className="disclosure-action">
      <summary className="button secondary sm">Withdraw</summary>
      <form action={formAction} aria-busy={pending} className="disclosure-action-panel">
        <input name="inviteId" type="hidden" value={inviteId} />
        <p>Withdraw your invite to {buyer}? They are notified, and the conversation becomes read-only for both of you.</p>
        <button className="button warning sm" disabled={pending} type="submit">
          {pending ? "Withdrawing…" : "Withdraw invite"}
        </button>
        {state.message ? <p className="auth-alert error" role="alert">{state.message}</p> : null}
      </form>
    </details>
  );
}
