import Link from "next/link";
import { BuyerInviteCard } from "../../../components/buyer-invite-card";
import { EmptyState } from "../../../components/empty-state";
import { Icon } from "../../../components/icon";
import { PageTitle } from "../../../components/page-title";
import { listBuyerInvites } from "../../../server/contracts";
import { respondToBuyerInvite } from "../../../server/form-actions";
import "./invites.css";

export default async function BuyerInvitesPage({ searchParams }: {
  searchParams?: Promise<{ error?: string; status?: string }>;
}) {
  const { error = "", status = "" } = searchParams ? await searchParams : {};
  const { data: invites } = await listBuyerInvites();
  const awaitingReply = invites.filter((invite) => invite.status === "Sent" || invite.status === "Viewed").length;

  return (
    <div className="page stack loose buyer-invite-page">
      <PageTitle eyebrow={awaitingReply ? `${awaitingReply} awaiting your reply` : "Your invite inbox"} title="A place worth a conversation" tone="buyer" actions={<Link className="button secondary" href="/messages"><Icon name="message" size={15} />Messages</Link>}>
        Properties shared just with you. Ask a question, plan a tour, or prepare a non-binding LOI.
      </PageTitle>
      {status === "accepted" ? <p className="auth-alert success" role="status">Invite accepted. Continue in your private chat with the seller.</p> : null}
      {status === "declined" ? <p className="auth-alert success" role="status">Invite declined. You can still receive invites from other sellers.</p> : null}
      {status === "blocked" ? <p className="auth-alert success" role="status">Seller blocked. Future invites from this seller are unavailable.</p> : null}
      {error === "invite-locked" ? <p className="auth-alert warning" role="alert">This invite has closed or changed. Refresh to see the latest status.</p> : null}
      {error === "question" ? <p className="auth-alert warning" role="alert">Add a question of up to 500 characters. Keep personal information out of chat.</p> : null}
      {invites.length ? (
        <div className="buyer-invite-grid">
          {invites.map((invite) => <BuyerInviteCard action={respondToBuyerInvite} actionId={crypto.randomUUID()} invite={invite} key={invite.id} />)}
        </div>
      ) : <EmptyState icon="mail" title="Your next conversation starts here" description="When a seller finds a match, their property invite will appear here. Keep your buyer profile current so they know what you’re looking for." actions={<Link className="button primary" href="/buyer/profile">Review your profile<Icon name="arrow-right" size={14} /></Link>} />}
    </div>
  );
}
