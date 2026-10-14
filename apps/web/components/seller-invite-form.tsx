"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { initialInviteSendFormState, type InviteSendFormState } from "../lib/invite-send-form";
import { Icon } from "./icon";
import { PropertyCoverPhoto } from "./property-cover-photo";

export function SellerInviteForm({ buyer, properties, propertyId: initialPropertyId, templateVersion, action }: {
  buyer: { id: string; name: string };
  properties: { coverImageId?: string; id: string; title: string; status: string; propertyType: string }[];
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

      <fieldset className="invite-property-choices" aria-describedby={`${id}-property-hint`}>
        <legend>Property to share</legend>
        {properties.map((property) => (
          <label className="invite-property-choice" key={property.id}>
            <input
              checked={propertyId === property.id}
              disabled={pending}
              name="propertyId"
              onChange={() => setPropertyId(property.id)}
              type="radio"
              value={property.id}
            />
            <PropertyCoverPhoto className="invite-property-thumb" imageId={property.coverImageId} propertyType={property.propertyType} seed={property.id} showSampleTag={false} sizes="96px" />
            <span className="invite-property-text">
              <strong>{property.title}</strong>
              <small>{property.status}</small>
            </span>
            <span aria-hidden="true" className="invite-property-check"><Icon name="check" size={14} /></span>
          </label>
        ))}
        <span className="field-hint" id={`${id}-property-hint`}>Uses the approved property version. Edit the property first if details changed.</span>
      </fieldset>

      <div className="invite-receives">
        <span aria-hidden="true" className="invite-receives-icon"><Icon name="mail" size={20} /></span>
        <p>
          <strong>{buyer.name} receives a private property invitation.</strong>
          Add details and answer their questions in the chat after sending.
        </p>
      </div>

      <label className="checkbox-row">
        <input name="termsAccepted" required type="checkbox" value="true" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} disabled={pending} />
        <span>I confirm this is a manual invite only — not an offer, escrow, or funds transfer — and I am authorized to invite buyers for this property.</span>
      </label>
      {state.message ? (
        <div className="inline-alert warning" role="alert">
          <Icon name="info" size={20} />
          <p>
            {state.message}
            {state.action ? <> <Link className="text-link" href={state.action.href}>{state.action.label}</Link></> : null}
          </p>
        </div>
      ) : null}
      <div className="invite-compose-actions">
        <button className="button primary lg block" disabled={pending} type="submit">
          {pending ? "Sending invite…" : "Send invite"}
        </button>
        <Link className="text-link" href={`/buyers/${buyer.id}`}>Cancel</Link>
      </div>
    </form>
  );
}
