"use client";

import { useActionState, useId } from "react";
import type { SellerAccessReviewFormState } from "../lib/seller-access-review-form";
import "./disclosure-action.css";

export function SellerAccessReviewForm({
  userId,
  accessStatus,
  accountActive,
  action,
}: {
  userId: string;
  accessStatus: string | null;
  accountActive: boolean;
  action: (state: SellerAccessReviewFormState, formData: FormData) => Promise<SellerAccessReviewFormState>;
}) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, { message: "", ok: false });
  // Approved access is withdrawn by suspending it; rejection answers a request.
  const canReject = accessStatus !== "APPROVED" && accessStatus !== "REJECTED";

  return (
    <div aria-busy={pending} className="stack tight">
      <form action={formAction}>
        <input name="userId" type="hidden" value={userId} />
        <div className="actions inline">
          <button
            className="button primary sm"
            disabled={pending || accessStatus === "APPROVED" || !accountActive}
            name="status"
            type="submit"
            value="APPROVED"
          >
            {accessStatus === "APPROVED" ? "Seller approved" : "Approve seller"}
          </button>
          <button
            className="button secondary sm"
            disabled={pending || accessStatus === "SUSPENDED"}
            name="status"
            type="submit"
            value="SUSPENDED"
          >
            {accessStatus === "SUSPENDED" ? "Seller suspended" : "Suspend seller"}
          </button>
        </div>
      </form>
      {canReject ? (
        <details className="disclosure-action">
          <summary className="button secondary sm">Reject seller</summary>
          <form action={formAction} className="disclosure-action-panel">
            <input name="userId" type="hidden" value={userId} />
            <input name="status" type="hidden" value="REJECTED" />
            <div className="field">
              <label htmlFor={`${id}-reason`}>Reason (shared with the seller)</label>
              <textarea disabled={pending} id={`${id}-reason`} maxLength={500} name="notes" required rows={2} />
            </div>
            <button className="button warning sm" disabled={pending} type="submit">Reject access</button>
          </form>
        </details>
      ) : null}
      {pending ? <span role="status">Saving seller access…</span> : null}
      {state.message ? (
        <p className={state.ok ? "auth-alert success" : "auth-alert error"} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
