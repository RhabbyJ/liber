"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { BuyerInviteResponseState } from "../lib/buyer-invite-response";
import type { InviteDTO } from "../lib/marketplace-dtos";
import { Icon } from "./icon";
import { PrivatePropertyImages } from "./private-property-images";
import { PropertyTypeArtwork } from "./property-type-artwork";

export function BuyerInviteCard({ invite, actionId, action }: {
  invite: InviteDTO;
  actionId: string;
  action: (state: BuyerInviteResponseState, formData: FormData) => Promise<BuyerInviteResponseState>;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  const [questionOpen, setQuestionOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [questionActionId, setQuestionActionId] = useState(actionId);
  const awaitingReply = invite.status === "Sent" || invite.status === "Viewed";
  const active = awaitingReply || invite.status === "Accepted";
  const closed = !active;
  const canChat = active && invite.conversationAvailable && Boolean(invite.conversationId);
  const verified = invite.propertyStatus === "Ownership verified";
  const statusLabel = awaitingReply ? "Awaiting your reply" : invite.status === "Accepted" ? "Conversation started" : invite.status;
  const statusTone = awaitingReply ? "pending" : invite.status === "Accepted" ? "active" : "";
  const questionId = `invite-question-${invite.id}`;
  const facts = [...new Set([invite.propertyCondition, ...(invite.propertyFeatures ?? [])].filter((value): value is string => Boolean(value?.trim())))];
  const imageIds = (invite.imageIds ?? []).slice(0, 1);
  const deadline = invite.expiresAt && !Number.isNaN(Date.parse(invite.expiresAt))
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" }).format(new Date(invite.expiresAt))
    : null;

  return (
    <article className={`buyer-invite-card${closed ? " is-closed" : ""}`} aria-label={`Property invitation for ${invite.property}`}>
      <div className="buyer-invite-media">
        {imageIds.length ? (
          <>
            <span aria-hidden="true" className="buyer-invite-placeholder"><Icon name="home" size={40} /></span>
            <PrivatePropertyImages imageIds={imageIds} />
          </>
        ) : (
          <>
            <PropertyTypeArtwork className="listing-card-art buyer-invite-art" seed={invite.propertyId} sizes="(max-width: 639px) 100vw, 280px" value={invite.propertyType ?? "HOME"} />
            <span className="sample-photo-tag">Sample photo</span>
          </>
        )}
        <div className="listing-card-flags buyer-invite-flags">
          <span className="listing-flag"><Icon name="lock" size={13} />Shared with you</span>
          <span className={`listing-flag${verified ? "" : " pending"}`}>
            <Icon name={verified ? "check-shield" : "info"} size={13} />
            {invite.propertyStatus || "Ownership review pending"}
          </span>
        </div>
      </div>

      <div className="buyer-invite-content">
        <div className="buyer-invite-topline">
          <span className={`status-tag ${statusTone}`}>{statusLabel}</span>
          <span className="buyer-invite-sent">Sent <time dateTime={invite.sentAtDate}>{invite.sentAt}</time></span>
        </div>
        <h2 className="buyer-invite-title">{invite.property}</h2>
        {facts.length ? (
          <ul aria-label="Property condition and features" className="buyer-invite-facts">
            {facts.map((fact) => <li key={fact}>{fact}</li>)}
          </ul>
        ) : null}

        <div className="buyer-invite-message">
          <span aria-hidden="true" className="buyer-invite-sender"><Icon name="user" size={16} /></span>
          <p>{invite.message}</p>
        </div>

        {awaitingReply ? <p className="buyer-invite-deadline"><Icon name="calendar" size={16} />Reply within 48 hours{deadline ? ` · by ${deadline}` : ""}</p> : null}

        {state.message ? (
          <p className={`buyer-invite-alert ${state.ok ? "success" : "error"}`} role={state.ok ? "status" : "alert"}>
            <Icon name={state.ok ? "check" : "info"} size={18} />
            <span>{state.message}</span>
          </p>
        ) : null}

        {canChat ? (
          <>
            <div className="buyer-invite-actions">
              {invite.status === "Accepted" ? <Link className="button primary" href={`/messages/${invite.conversationId}`}><Icon name="message" size={16} />Open chat</Link> : null}
              <form action={formAction} className="buyer-invite-responses" aria-busy={pending}>
                <input name="inviteId" type="hidden" value={invite.id} />
                <input name="clientActionId" type="hidden" value={actionId} />
                <button className={`button ${awaitingReply ? "primary" : "secondary"}`} disabled={pending} name="intent" type="submit" value="TOUR"><Icon name="calendar" size={16} />Request a tour</button>
                <button className="button secondary" disabled={pending} name="intent" type="submit" value="LOI"><Icon name="doc" size={16} />Start LOI</button>
                <button aria-controls={questionId} aria-expanded={questionOpen} className="link-button buyer-invite-ask" disabled={pending} onClick={() => setQuestionOpen(!questionOpen)} type="button">
                  <Icon name="message" size={16} />Ask a question<Icon className="buyer-invite-ask-chevron" name="chevron-down" size={16} />
                </button>
              </form>
            </div>
            {questionOpen ? (
              <form action={formAction} className="buyer-invite-question" aria-busy={pending}>
                <input name="inviteId" type="hidden" value={invite.id} />
                <input name="clientActionId" type="hidden" value={questionActionId} />
                <input name="intent" type="hidden" value="QUESTION" />
                <label htmlFor={questionId}>What would you like to know?</label>
                <textarea aria-describedby={`${questionId}-hint`} disabled={pending} id={questionId} maxLength={500} name="question" onChange={(event) => { setQuestion(event.target.value); setQuestionActionId(crypto.randomUUID()); }} placeholder="Ask about the property, timing, or a viewing…" required rows={3} value={question} />
                <div className="buyer-invite-question-footer"><p id={`${questionId}-hint`}>Keep personal, financial, and sensitive information out of chat.</p><span>{question.length}/500</span></div>
                <button className="button primary" disabled={pending || !question.trim()} type="submit">{pending ? "Sending…" : "Send question"}</button>
              </form>
            ) : null}
          </>
        ) : active ? <p className="buyer-invite-unavailable">Chat is unavailable for this invite right now. Refresh to try again; your question won’t be sent until chat is available.</p> : null}

        <form action={formAction} className="buyer-invite-footer" aria-busy={pending}>
          <input name="inviteId" type="hidden" value={invite.id} />
          <input name="clientActionId" type="hidden" value={actionId} />
          {awaitingReply ? <button className="buyer-invite-text-button" disabled={pending} name="intent" type="submit" value="DECLINED">Not a fit? Decline</button> : <span className="buyer-invite-closed-note">{invite.status === "Accepted" ? "Continue privately with the seller." : "This invite is closed."}</span>}
          {invite.conversationId ? (
            <details className="buyer-invite-more">
              <summary>More<Icon name="chevron-down" size={14} /></summary>
              <div className="buyer-invite-more-menu">
                <button className="buyer-invite-text-button danger" disabled={pending} name="intent" type="submit" value="BLOCK">Block seller</button>
              </div>
            </details>
          ) : null}
        </form>
      </div>
    </article>
  );
}
