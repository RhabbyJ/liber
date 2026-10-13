"use client";

import { useActionState } from "react";
import { submitSyntheticPropertyReview } from "../app/admin/documents/synthetic-actions";

type Candidate = {
  id: string;
  identityVersion: number;
  title: string;
  testApproved: boolean;
  unavailableReason: string | null;
};

export function AdminSyntheticPropertyReview({ property }: { property: Candidate }) {
  const [state, action, pending] = useActionState(submitSyntheticPropertyReview, { ok: false, message: "" });
  return (
    <form action={action} className="stack">
      <strong>{property.title}</strong>
      <input name="propertyId" type="hidden" value={property.id} />
      <input name="identityVersion" type="hidden" value={property.identityVersion} />
      <input name="decision" type="hidden" value={property.testApproved ? "REVOKE" : "APPROVE"} />
      {property.testApproved ? (
        <p className="muted">Test approval — ownership not verified. Revoking restores the actual evidence review state.</p>
      ) : (
        <label className="checkbox-row">
          <input name="confirmSynthetic" required type="checkbox" value="true" />
          This is a synthetic test property. Ownership has not been verified.
        </label>
      )}
      {!property.testApproved && property.unavailableReason ? <p role="status">{property.unavailableReason}</p> : null}
      <div className="actions">
        <button className="button secondary" disabled={pending || (!property.testApproved && Boolean(property.unavailableReason))} type="submit">
          {pending ? "Saving…" : property.testApproved ? "Revoke test approval" : "Approve for synthetic test"}
        </button>
      </div>
      {state.message ? <p role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
    </form>
  );
}
