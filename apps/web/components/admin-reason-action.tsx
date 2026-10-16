"use client";

import { useActionState, useId } from "react";
import { initialActionFeedback, type ActionFeedbackState } from "../lib/action-feedback";
import "./disclosure-action.css";

/**
 * Confirm-first admin moderation control: opens a panel that asks for a reason
 * (audit-logged by the server) before submitting, and shows the result inline.
 */
export function AdminReasonAction({
  action,
  confirmLabel,
  fields,
  label,
  pendingLabel,
  prompt,
  reasonLabel,
  reasonRequired = true,
  tone = "secondary",
}: {
  action: (state: ActionFeedbackState, formData: FormData) => Promise<ActionFeedbackState>;
  confirmLabel: string;
  fields: Record<string, string>;
  label: string;
  pendingLabel: string;
  prompt?: string;
  reasonLabel: string;
  reasonRequired?: boolean;
  tone?: "secondary" | "warning";
}) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, initialActionFeedback);

  return (
    <details className="disclosure-action">
      <summary className="button secondary sm">{label}</summary>
      <form action={formAction} aria-busy={pending} className="disclosure-action-panel">
        {Object.entries(fields).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
        {prompt ? <p>{prompt}</p> : null}
        <div className="field">
          <label htmlFor={`${id}-reason`}>{reasonLabel}</label>
          <textarea disabled={pending} id={`${id}-reason`} maxLength={500} name="reason" required={reasonRequired} rows={2} />
        </div>
        <button className={`button ${tone === "warning" ? "warning" : "primary"} sm`} disabled={pending} type="submit">
          {pending ? pendingLabel : confirmLabel}
        </button>
        {state.message ? (
          <p className={`auth-alert ${state.ok ? "success" : "error"}`} role={state.ok ? "status" : "alert"}>{state.message}</p>
        ) : null}
      </form>
    </details>
  );
}
