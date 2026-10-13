"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { initialBadgeReviewFormState, type BadgeReviewFormState } from "../lib/badge-review-form";

const badgeOptions = [
  { value: "PRE_APPROVED", label: "Admin-verified pre-approval", documentType: "PRE_APPROVAL", evidenceLabel: "pre-approval letter" },
  { value: "VERIFIED_FUNDS", label: "Verified funds", documentType: "VERIFIED_FUNDS", evidenceLabel: "proof of funds" },
  { value: "VERIFIED_IDENTITY", label: "Verified identity", documentType: "IDENTITY", evidenceLabel: "identity document" },
] as const;
type ReviewAction = (state: BadgeReviewFormState, formData: FormData) => Promise<BadgeReviewFormState>;
type ApprovedDocument = { id: string; documentType: string; originalFilename: string | null };

export function AdminBadgeGrantForm({ buyerProfileId, documents, action }: {
  buyerProfileId: string; documents: ApprovedDocument[]; action: ReviewAction;
}) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, initialBadgeReviewFormState);
  const [badgeType, setBadgeType] = useState<string>(() => badgeOptions.find((option) => documents.some((document) => document.documentType === option.documentType))?.value ?? "PRE_APPROVED");
  const [documentId, setDocumentId] = useState("");
  const option = badgeOptions.find((item) => item.value === badgeType)!;
  const compatible = documents.filter((document) => document.documentType === option.documentType);
  const evidenceId = compatible.some((document) => document.id === documentId) ? documentId : compatible[0]?.id ?? "";

  return <form action={formAction} aria-busy={pending} className="stack tight">
    <input name="buyerProfileId" type="hidden" value={buyerProfileId} />
    <div className="field">
      <label htmlFor={`${id}-badge`}>Badge type</label>
      <select disabled={pending} id={`${id}-badge`} name="badgeType" onChange={(event) => { setBadgeType(event.target.value); setDocumentId(""); }} value={badgeType}>
        {badgeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </div>
    <div className="field">
      <label htmlFor={`${id}-evidence`}>Approved evidence</label>
      <select aria-describedby={`${id}-guidance`} disabled={pending || !compatible.length} id={`${id}-evidence`} name="evidenceDocumentId" onChange={(event) => setDocumentId(event.target.value)} required value={evidenceId}>
        {!compatible.length ? <option value="">No approved {option.evidenceLabel}</option> : null}
        {compatible.map((document) => <option key={document.id} value={document.id}>{document.originalFilename || `Approved ${option.evidenceLabel}`}</option>)}
      </select>
      <p className="field-hint" id={`${id}-guidance`}>
        {compatible.length ? `This approved ${option.evidenceLabel} will support the badge.` : `Approve this buyer’s ${option.evidenceLabel} in Documents first, then return here to grant the badge.`}
      </p>
    </div>
    {!compatible.length ? <Link className="text-link" href="/admin/documents">Review documents first →</Link> : null}
    <button className="button" disabled={pending || !evidenceId} type="submit">{pending ? "Granting badge…" : "Grant badge"}</button>
    <ReviewFeedback state={state} />
  </form>;
}

export function AdminBadgeRevokeForm({ badgeId, label, action }: { badgeId: string; label: string; action: ReviewAction }) {
  const [state, formAction, pending] = useActionState(action, initialBadgeReviewFormState);
  return <form action={formAction} aria-busy={pending} className="stack tight">
    <input name="badgeId" type="hidden" value={badgeId} />
    <button className="button secondary" disabled={pending} type="submit">{pending ? "Revoking…" : `Revoke ${label}`}</button>
    <ReviewFeedback state={state} />
  </form>;
}

function ReviewFeedback({ state }: { state: BadgeReviewFormState }) {
  return state.message ? <p className={`auth-alert ${state.ok ? "success" : "error"}`} role={state.ok ? "status" : "alert"}>{state.message}</p> : null;
}
