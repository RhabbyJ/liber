"use client";

import Link from "next/link";
import { useActionState } from "react";
import { submitSelfTestPreapproval } from "../app/admin/badges/test-actions";
import { Icon } from "./icon";

const initialState = { ok: false, message: "" };

export function AdminTestPreapproval({ active, buyerProfileId }: { active: boolean; buyerProfileId: string }) {
  const [state, action, pending] = useActionState(submitSelfTestPreapproval, initialState);

  return (
    <section className="card stack" aria-labelledby="admin-test-preapproval-title">
      <div className="section-head compact">
        <h2 id="admin-test-preapproval-title">Test your buyer badge</h2>
        <span className={`status-dot ${active ? "warning" : "info"}`}>
          <Icon name="info" size={12} />
          {active ? "Test badge active" : "No test badge"}
        </span>
      </div>
      <p className="muted small">
        Add a test pre-approval badge to your own buyer profile. It is labeled “Test pre-approval — not verified”
        and expires after 24 hours. It does not verify financing or approve documents.
      </p>
      <form action={action} className="stack">
        <input name="decision" type="hidden" value={active ? "REVOKE" : "GRANT"} />
        {active ? null : (
          <label className="check-row">
            <input disabled={pending} name="confirmTest" required type="checkbox" value="true" />
            <span>I understand this badge is for testing and is not lender verification.</span>
          </label>
        )}
        {state.message ? (
          <p className={`auth-alert ${state.ok ? "success" : "warning"}`} role={state.ok ? "status" : "alert"}>
            {state.message}
          </p>
        ) : null}
        <div className="actions inline">
          <button className={`button ${active ? "secondary" : "primary"}`} disabled={pending} type="submit">
            {pending ? "Updating test badge…" : active ? "Remove my test pre-approval badge" : "Give myself a test pre-approval badge"}
          </button>
          <Link className="button ghost" href={`/buyers/${buyerProfileId}`}>View my buyer profile</Link>
        </div>
      </form>
    </section>
  );
}
