"use client";

import { useActionState } from "react";
import type { SellerAccessReviewFormState } from "../lib/seller-access-review-form";

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
  const [state, formAction, pending] = useActionState(action, { message: "", ok: false });

  return (
    <form action={formAction} aria-busy={pending} className="stack tight">
      <input name="userId" type="hidden" value={userId} />
      <div className="actions inline">
        <button
          className="button"
          disabled={pending || accessStatus === "APPROVED" || !accountActive}
          name="status"
          type="submit"
          value="APPROVED"
        >
          {accessStatus === "APPROVED" ? "Seller approved" : "Approve Seller"}
        </button>
        <button
          className="button secondary"
          disabled={pending || accessStatus === "SUSPENDED"}
          name="status"
          type="submit"
          value="SUSPENDED"
        >
          {accessStatus === "SUSPENDED" ? "Seller suspended" : "Suspend Seller"}
        </button>
      </div>
      {pending ? <span role="status">Saving seller access…</span> : null}
      {state.message ? (
        <p className={state.ok ? "auth-alert success" : "auth-alert error"} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
