"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { BuyerInviteResponseState } from "../lib/buyer-invite-response";
import type { InviteDTO } from "../lib/marketplace-dtos";
import { Icon } from "./icon";
import { PrivatePropertyImages } from "./private-property-images";
import { PropertyFeatureSummary } from "./property-details-fields";

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
  const canChat = active && invite.conversationAvailable && Boolean(invite.conversationId);
  const verified = invite.propertyStatus === "Ownership verified";
  const statusLabel = awaitingReply ? "Awaiting your reply" : invite.status === "Accepted" ? "Conversation started" : invite.status;
  const questionId = `invite-question-${invite.id}`;
  const deadline = invite.expiresAt && !Number.isNaN(Date.parse(invite.expiresAt))
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" }).format(new Date(invite.expiresAt))
    : null;

  return (
    <article className="buyer-invite-card" aria-label={`Property invitation for ${invite.property}`}>
      <div className={`buyer-invite-media ${invite.imageIds?.length ? "has-images" : ""}`}>
        <div className="buyer-invite-art" aria-hidden="true"><Icon name="home" size={52} /></div>
        <PrivatePropertyImages imageIds={(invite.imageIds ?? []).slice(0, 1)} />
        <span className="buyer-invite-share-label"><Icon name="lock" size={12} /> Shared with you</span>
      </div>

      <div className="buyer-invite-content">
        <div className="buyer-invite-topline">
          <span className={`buyer-invite-status ${invite.status === "Accepted" ? "is-active" : ""}`}>
            <Icon name={invite.status === "Accepted" ? "check" : "mail"} size={14} />{statusLabel}
          </span>
          <time dateTime={invite.sentAtDate}>{invite.sentAt}</time>
        </div>
        <div className="buyer-invite-address">
          <p className="eyebrow">Seller’s property</p>
          <h2>{invite.property}</h2>
          <span className="buyer-invite-verification"><Icon name={verified ? "check-shield" : "info"} size={14} />{invite.propertyStatus || "Ownership review pending"}</span>
        </div>
        <PropertyFeatureSummary condition={invite.propertyCondition} features={invite.propertyFeatures} />
        <div className="buyer-invite-opening"><span className="buyer-invite-sender"><Icon name="user" size={16} /></span><p>{invite.message}</p></div>

        {awaitingReply ? <p className="buyer-invite-deadline"><Icon name="calendar" size={14} />Reply within 48 hours{deadline ? ` · by ${deadline}` : ""}</p> : null}

        {state.message ? <p className={`auth-alert ${state.ok ? "success" : "error"}`} role={state.ok ? "status" : "alert"}>{state.message}</p> : null}

        {canChat ? (
          <>
            {invite.status === "Accepted" ? <Link className="button primary buyer-invite-chat-link" href={`/messages/${invite.conversationId}`}><Icon name="message" size={16} />Open chat<Icon name="arrow-right" size={15} /></Link> : null}
            <form action={formAction} className="buyer-invite-responses" aria-busy={pending}>
              <input name="inviteId" type="hidden" value={invite.id} />
              <input name="clientActionId" type="hidden" value={actionId} />
              <button aria-controls={questionId} aria-expanded={questionOpen} className="buyer-invite-response" disabled={pending} onClick={() => setQuestionOpen(!questionOpen)} type="button"><Icon name="message" size={20} /><span>Ask a question</span></button>
              <button className="buyer-invite-response" disabled={pending} name="intent" type="submit" value="TOUR"><Icon name="calendar" size={20} /><span>Request a tour</span></button>
              <button className="buyer-invite-response buyer-invite-loi" disabled={pending} name="intent" type="submit" value="LOI"><Icon name="doc" size={20} /><span>Start LOI</span></button>
            </form>
            {questionOpen ? (
              <form action={formAction} className="buyer-invite-question" aria-busy={pending}>
                <input name="inviteId" type="hidden" value={invite.id} />
                <input name="clientActionId" type="hidden" value={questionActionId} />
                <input name="intent" type="hidden" value="QUESTION" />
                <label htmlFor={questionId}>What would you like to know?</label>
                <textarea aria-describedby={`${questionId}-hint`} disabled={pending} id={questionId} maxLength={500} name="question" onChange={(event) => { setQuestion(event.target.value); setQuestionActionId(crypto.randomUUID()); }} placeholder="Ask about the property, timing, or a viewing…" required rows={3} value={question} />
                <div className="buyer-invite-question-footer"><p id={`${questionId}-hint`}>Keep personal, financial, and sensitive information out of chat.</p><span>{question.length}/500</span></div>
                <button className="button primary" disabled={pending || !question.trim()} type="submit"><Icon name="arrow-right" size={15} />{pending ? "Sending…" : "Send question"}</button>
              </form>
            ) : null}
          </>
        ) : active ? <p className="buyer-invite-unavailable">Chat is unavailable for this invite right now. Refresh to try again; your question won’t be sent until chat is available.</p> : null}

        <form action={formAction} className="buyer-invite-footer" aria-busy={pending}>
          <input name="inviteId" type="hidden" value={invite.id} />
          <input name="clientActionId" type="hidden" value={actionId} />
          {awaitingReply ? <button className="buyer-invite-text-button" disabled={pending} name="intent" type="submit" value="DECLINED">Not a fit? Decline</button> : <span className="muted small">{invite.status === "Accepted" ? "Continue privately with the seller." : "This invite is closed."}</span>}
          {invite.conversationId ? <details className="buyer-invite-more"><summary>More</summary><button className="buyer-invite-text-button" disabled={pending} name="intent" type="submit" value="BLOCK">Block seller</button></details> : null}
        </form>
      </div>
    </article>
  );
}
