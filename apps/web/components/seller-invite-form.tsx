"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { initialInviteSendFormState, type InviteSendFormState } from "../lib/invite-send-form";
import { Icon } from "./icon";

export function SellerInviteForm({ buyer, properties, propertyId: initialPropertyId, templateVersion, action }: {
  buyer: { id: string; name: string };
  properties: { id: string; title: string; status: string }[];
  propertyId: string;
  templateVersion: number;
  action: (state: InviteSendFormState, data: FormData) => Promise<InviteSendFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialInviteSendFormState);
  const [propertyId, setPropertyId] = useState(() => properties.some((property) => property.id === state.values?.propertyId)
    ? state.values!.propertyId : initialPropertyId);
  const [termsAccepted, setTermsAccepted] = useState(state.values?.termsAccepted ?? false);
  const id = useId();

  return (
    // React resets forms when an action returns. Returned states are failures;
    // successful sends redirect, so preserve the controls for correction/retry.
    <form action={formAction} onReset={(event) => event.preventDefault()} aria-busy={pending} className="invite-compose-form">
      <input name="buyerProfileId" type="hidden" value={buyer.id} />
      <input name="templateVersion" type="hidden" value={templateVersion} />
      <input name="templateKey" type="hidden" value="SELLER_PRIVATE_VIEWING" />
      <div className="invite-compose-heading">
        <p className="eyebrow seller">Manual invite</p>
        <h2>Share your property with {buyer.name}</h2>
      </div>
      <div className="field">
        <label htmlFor={`${id}-property`}>Property</label>
        <select id={`${id}-property`} name="propertyId" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} disabled={pending}>
          {properties.map((property) => <option key={property.id} value={property.id}>{property.title} — {property.status}</option>)}
        </select>
        <span className="field-hint">Uses the approved property version. Edit the property first if details changed.</span>
      </div>
      <p className="field-hint">The buyer receives a private property invitation. Add details and answer their questions in the chat after sending.</p>
      <div className="divider" />
      <label className="checkbox-row">
        <input name="termsAccepted" required type="checkbox" value="true" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} disabled={pending} />
        <span>I confirm this is a manual invite only — not an offer, escrow, or funds transfer — and I am authorized to invite buyers for this property.</span>
      </label>
      {state.message ? (
        <div className="auth-alert warning stack tight" role="alert">
          <p style={{ margin: 0 }}>{state.message}</p>
          {state.action ? <Link className="text-link" href={state.action.href}>{state.action.label} →</Link> : null}
        </div>
      ) : null}
      <div className="actions between">
        <Link className="button ghost" href={`/buyers/${buyer.id}`}>Cancel</Link>
        <button className="button primary lg" disabled={pending} type="submit">
          <Icon name="mail" size={15} />{pending ? "Sending invite…" : "Send invite"}
        </button>
      </div>
    </form>
  );
}
