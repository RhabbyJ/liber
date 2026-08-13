import Link from "next/link";
import { EmptyState } from "../../../components/empty-state";
import { Icon } from "../../../components/icon";
import { PageTitle } from "../../../components/page-title";
import { PrivatePropertyImages } from "../../../components/private-property-images";
import { listBuyerInvites } from "../../../server/contracts";
import { blockInviteConversation, respondToBuyerInvite } from "../../../server/form-actions";

export default async function BuyerInvitesPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; status?: string }>;
}) {
  const { error = "", status = "" } = searchParams ? await searchParams : {};
  const { data: invites } = await listBuyerInvites();

  return (
    <div className="page stack loose">
      <PageTitle
        eyebrow="Invite inbox"
        title="Property invites from sellers"
        tone="buyer"
        actions={
          <Link className="button ghost" href="/buyer/notifications">
            <Icon name="bell" size={14} />
            Notifications
          </Link>
        }
      >
        Decline, ask a question, request a tour, or start an LOI. Liber never triggers offers, payments, or escrow on your behalf.
      </PageTitle>

      {status === "accepted" ? (
        <div className="auth-alert success" role="status">
          <strong>Invite accepted</strong>
          <span>Open the conversation when you’re ready to talk with the seller.</span>
        </div>
      ) : null}
      {status === "declined" ? (
        <div className="auth-alert success" role="status">
          <strong>Invite declined</strong>
          <span>This invite is closed. New invites can still arrive from other sellers.</span>
        </div>
      ) : null}
      {status === "blocked" ? (
        <div className="auth-alert success" role="status">
          <strong>Profile blocked</strong>
          <span>Future invites from this seller will be unavailable.</span>
        </div>
      ) : null}
      {error === "invite-locked" ? (
        <div className="auth-alert warning" role="status">
          <strong>Invite already settled</strong>
          <span>This invite can’t be changed again after a response or expiration.</span>
        </div>
      ) : null}
      {error === "question" ? (
        <div className="auth-alert warning" role="status">
          <strong>Add a question</strong>
          <span>Questions are limited to 500 characters and must not include personal information.</span>
        </div>
      ) : null}

      {invites.length === 0 ? (
        <EmptyState
          icon="mail"
          title="No invites yet"
          description="Sellers will reach out as your profile matches their property. Add verification badges to stand out faster."
          actions={
            <Link className="button" href="/buyer/badges">
              <Icon name="shield" size={14} />
              Get verified
            </Link>
          }
        />
      ) : (
        <div className="grid two">
          {invites.map((invite) => {
            const verified = invite.propertyStatus === "Ownership verified";
            const canRespond = invite.status === "Sent" || invite.status === "Viewed";
            const canOpenConversation = invite.status === "Accepted"
              && invite.conversationAvailable
              && Boolean(invite.conversationId);
            return (
              <article className="card stack" key={invite.id}>
                <div className="section-head compact">
                  <div>
                    <p className="eyebrow">{invite.property}</p>
                    <h2 style={{ fontSize: 20, marginTop: 6 }}>{invite.title}</h2>
                  </div>
                  <span className={`status-dot ${verified ? "active" : "warning"}`}>
                    <Icon name={verified ? "check-shield" : "info"} size={12} />
                    {invite.propertyStatus || "Ownership not submitted"}
                  </span>
                </div>
                <p className="muted">{invite.message}</p>
                <PrivatePropertyImages imageIds={invite.imageIds ?? []} />
                {canRespond ? <p className="muted small">{inviteResponseNote(invite.expiresAt)}</p> : null}
                <div className="actions between">
                  <span className={`status-dot ${invite.status === "Accepted" ? "active" : invite.status === "Declined" ? "danger" : ""}`}>
                    <Icon name="calendar" size={12} />
                    {invite.status}
                  </span>
                  <div className="stack tight buyer-invite-actions">
                    {canOpenConversation ? (
                      <Link className="button primary" href={`/messages/${invite.conversationId}`}>
                        <Icon name="message" size={14} />
                        Open conversation
                      </Link>
                    ) : null}
                    {canRespond ? (
                      <>
                        <form action={respondToBuyerInvite}>
                          <input name="inviteId" type="hidden" value={invite.id} />
                          <input name="response" type="hidden" value="DECLINED" />
                          <button className="button ghost" type="submit">Decline</button>
                        </form>
                        <form action={respondToBuyerInvite} className="stack tight">
                          <input name="inviteId" type="hidden" value={invite.id} />
                          <input name="conversationId" type="hidden" value={invite.conversationId ?? ""} />
                          <input name="intent" type="hidden" value="QUESTION" />
                          <label className="small" htmlFor={`invite-question-${invite.id}`}>Ask a question</label>
                          <textarea id={`invite-question-${invite.id}`} maxLength={500} name="question" required rows={3} />
                          <p className="muted small">Do not include personal information such as SSN, account numbers, or protected characteristics.</p>
                          <button className="button secondary" type="submit">Send question</button>
                        </form>
                        <form action={respondToBuyerInvite}>
                          <input name="inviteId" type="hidden" value={invite.id} />
                          <input name="conversationId" type="hidden" value={invite.conversationId ?? ""} />
                          <input name="intent" type="hidden" value="TOUR" />
                          <button className="button secondary" type="submit">Request a tour</button>
                        </form>
                        <form action={respondToBuyerInvite}>
                          <input name="inviteId" type="hidden" value={invite.id} />
                          <input name="intent" type="hidden" value="LOI" />
                          <button className="button primary" type="submit">Start LOI</button>
                        </form>
                      </>
                    ) : null}
                    {invite.conversationId ? (
                      <form action={blockInviteConversation}>
                        <input name="conversationId" type="hidden" value={invite.conversationId} />
                        <button className="button ghost" type="submit">Block seller</button>
                      </form>
                    ) : null}
                    {invite.status === "Accepted" && !canOpenConversation ? (
                      <span className="muted small">Conversation unavailable right now.</span>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function inviteResponseNote(expiresAt?: string) {
  if (!expiresAt) return "Please respond within 48 hours.";
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "Please respond within 48 hours.";
  return `Please respond within 48 hours. This invite expires ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date)}.`;
}
