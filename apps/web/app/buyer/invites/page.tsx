import Link from "next/link";
import type { ReactNode } from "react";
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
      <PageTitle
        actions={<Link className="button secondary" href="/messages"><Icon name="message" size={16} />Messages</Link>}
        title="Received invites"
      >
        {awaitingReply ? `${awaitingReply} awaiting your reply` : "Properties shared just with you"}
      </PageTitle>
      {status === "accepted" ? <Notice tone="success">Invite accepted. Continue in your private chat with the seller.</Notice> : null}
      {status === "declined" ? <Notice tone="success">Invite declined. You can still receive invites from other sellers.</Notice> : null}
      {status === "blocked" ? <Notice tone="success">Seller blocked. Future invites from this seller are unavailable.</Notice> : null}
      {error === "invite-locked" ? <Notice tone="warning">This invite has closed or changed. Refresh to see the latest status.</Notice> : null}
      {error === "question" ? <Notice tone="warning">Add a question of up to 500 characters. Keep personal information out of chat.</Notice> : null}
      {invites.length ? (
        <div className="buyer-invite-grid">
          {invites.map((invite) => <BuyerInviteCard action={respondToBuyerInvite} actionId={crypto.randomUUID()} invite={invite} key={invite.id} />)}
        </div>
      ) : <EmptyState icon="mail" title="No invites yet" description="When a seller finds a match, their property invite appears here. Keep your buyer profile current so they know what you want." actions={<Link className="button primary" href="/buyer/profile">Review your profile</Link>} />}
    </div>
  );
}

function Notice({ children, tone }: { children: ReactNode; tone: "success" | "warning" }) {
  return (
    <div className={`inline-alert ${tone}`} role={tone === "success" ? "status" : "alert"}>
      <Icon name={tone === "success" ? "check" : "info"} size={20} />
      <p>{children}</p>
    </div>
  );
}
