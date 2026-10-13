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
        <div className="invite-list">
          {invites.map((invite) => {
            const verified = invite.propertyStatus === "Ownership verified";
            const canRespond = invite.status === "Sent" || invite.status === "Viewed";
            const canOpenConversation = invite.status === "Accepted"
              && invite.conversationAvailable
              && Boolean(invite.conversationId);
            return (
              <article className="invite-card" key={invite.id}>
                <header className="invite-card-head">
                  <span className="invite-card-icon" aria-hidden="true">
                    <Icon name="home" size={20} />
                  </span>
                  <div className="invite-card-heading">
                    <p className="invite-card-kicker">{invite.property}</p>
                    <h2>{invite.title}</h2>
                  </div>
                  <div className="invite-card-status">
                    <span className={`status-dot ${invite.status === "Accepted" ? "active" : invite.status === "Declined" ? "danger" : ""}`}>
                      <Icon name="calendar" size={12} />
                      {invite.status}
                    </span>
                    <span className={`status-dot ${verified ? "active" : "warning"}`}>
                      <Icon name={verified ? "check-shield" : "info"} size={12} />
                      {invite.propertyStatus || "Ownership not submitted"}
                    </span>
                  </div>
                </header>
                <p className="invite-card-message">{invite.message}</p>
                <PrivatePropertyImages imageIds={invite.imageIds ?? []} />
                {canRespond ? <p className="invite-card-deadline">{inviteResponseNote(invite.expiresAt)}</p> : null}
                {canOpenConversation || canRespond ? (
                  <div className="invite-card-actions">
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
                          <input name="intent" type="hidden" value="LOI" />
                          <button className="button primary" type="submit">Start LOI</button>
                        </form>
                        <form action={respondToBuyerInvite}>
                          <input name="inviteId" type="hidden" value={invite.id} />
                          <input name="conversationId" type="hidden" value={invite.conversationId ?? ""} />
                          <input name="intent" type="hidden" value="TOUR" />
                          <button className="button secondary" type="submit">Request a tour</button>
                        </form>
                        <form action={respondToBuyerInvite}>
                          <input name="inviteId" type="hidden" value={invite.id} />
                          <input name="response" type="hidden" value="DECLINED" />
                          <button className="button secondary" type="submit">Decline</button>
                        </form>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {canRespond ? (
                  <form action={respondToBuyerInvite} className="invite-question">
                    <input name="inviteId" type="hidden" value={invite.id} />
                    <input name="conversationId" type="hidden" value={invite.conversationId ?? ""} />
                    <input name="intent" type="hidden" value="QUESTION" />
                    <div className="field">
                      <label htmlFor={`invite-question-${invite.id}`}>Ask a question</label>
                      <textarea id={`invite-question-${invite.id}`} maxLength={500} name="question" required rows={3} />
                    </div>
                    <div className="invite-question-foot">
                      <p>Do not include personal information such as SSN, account numbers, or protected characteristics.</p>
                      <button className="button secondary sm" type="submit">Send question</button>
                    </div>
                  </form>
                ) : null}
                {invite.conversationId || (invite.status === "Accepted" && !canOpenConversation) ? (
                  <footer className="invite-card-foot">
                    {invite.status === "Accepted" && !canOpenConversation ? (
                      <span className="muted small">Conversation unavailable right now.</span>
                    ) : null}
                    {invite.conversationId ? (
                      <form action={blockInviteConversation}>
                        <input name="conversationId" type="hidden" value={invite.conversationId} />
                        <button className="link-button" type="submit">Block seller</button>
                      </form>
                    ) : null}
                  </footer>
                ) : null}
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
