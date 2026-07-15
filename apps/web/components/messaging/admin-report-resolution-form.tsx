"use client";

import { useActionState, useState } from "react";
import { resolveAdminMessageReport, type AdminReportActionState } from "../../app/admin/reports/actions";
import type { AdminMessageReport } from "./types";

export function AdminReportResolutionForm({
  initialResolution,
  initialStatus,
  reportId,
}: {
  initialResolution: string;
  initialStatus: AdminMessageReport["status"];
  reportId: string;
}) {
  const [state, action, pending] = useActionState<AdminReportActionState, FormData>(
    resolveAdminMessageReport,
    { message: "", ok: false },
  );
  const [status, setStatus] = useState(initialStatus === "OPEN" ? "IN_REVIEW" : initialStatus);

  return (
    <form action={action} aria-busy={pending} className="message-admin-resolution stack tight">
      <input name="reportId" type="hidden" value={reportId} />
      <div className="field">
        <label htmlFor={`report-status-${reportId}`}>Resolution status</label>
        <select
          id={`report-status-${reportId}`}
          disabled={pending}
          name="status"
          onChange={(event) => setStatus(event.target.value as "ACTIONED" | "DISMISSED" | "IN_REVIEW")}
          value={status}
        >
          <option value="IN_REVIEW">In review</option>
          <option value="ACTIONED">Actioned</option>
          <option value="DISMISSED">Dismissed</option>
        </select>
      </div>
      {status === "ACTIONED" || status === "DISMISSED" ? (
        <div className="field">
          <label htmlFor={`report-resolution-${reportId}`}>Internal resolution note</label>
          <textarea
            defaultValue={initialResolution}
            disabled={pending}
            id={`report-resolution-${reportId}`}
            maxLength={2_000}
            name="resolution"
            required
            rows={3}
          />
        </div>
      ) : <input name="resolution" type="hidden" value="" />}
      {status === "ACTIONED" ? (
        <label className="checkbox-row">
          <input disabled={pending} name="redactMessage" type="checkbox" value="true" />
          <span>Replace the reported message with the reviewed-removal notice</span>
        </label>
      ) : null}
      {state.message ? (
        <p aria-live="polite" className={state.ok ? "auth-alert success" : "auth-alert error"} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      ) : null}
      <button className="button primary self-start" disabled={pending} type="submit">
        {pending ? "Saving…" : "Save resolution"}
      </button>
    </form>
  );
}
