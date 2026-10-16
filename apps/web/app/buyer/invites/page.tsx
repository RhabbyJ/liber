import Link from "next/link";
import type { ReactNode } from "react";
import { BuyerInviteCard } from "../../../components/buyer-invite-card";
import { EmptyState } from "../../../components/empty-state";
import { Icon } from "../../../components/icon";
import { PageTitle } from "../../../components/page-title";
import { WorkspaceTabs } from "../../../components/workspace-tabs";
import type { InviteView } from "../../../lib/invite-status";
import { listBuyerInvites, listNotifications } from "../../../server/contracts";
import { respondToBuyerInvite } from "../../../server/form-actions";
import { groupBuyerInvites } from "./invite-groups";
import "./invites.css";

export default async function BuyerInvitesPage({ searchParams }: {
  searchParams?: Promise<{ error?: string; status?: string }>;
}) {
  const { error = "", status = "" } = searchParams ? await searchParams : {};
  const [{ data: invites }, { data: notifications }] = await Promise.all([listBuyerInvites(), listNotifications()]);
  const unread = notifications.filter((notification) => !notification.read).length;
  const awaitingReply = invites.filter((invite) => invite.status === "Sent" || invite.status === "Viewed").length;
  const groups = groupBuyerInvites(invites);

  return (
    <div className="page stack loose buyer-invite-page">
      <PageTitle
        actions={<Link className="button secondary" href="/messages"><Icon name="message" size={16} />Messages</Link>}
        title="Received invites"
      >
        {awaitingReply ? `${awaitingReply} awaiting your reply` : "Properties shared just with you"}
      </PageTitle>
      <WorkspaceTabs
        current="/buyer/invites"
        label="Buyer activity"
        tabs={[
          { href: "/buyer/invites", label: "Received invites" },
          { badge: unread, href: "/buyer/notifications", label: "Notifications" },
        ]}
      />
      {status === "accepted" ? <Notice tone="success">Invite accepted. Continue in your private chat with the seller.</Notice> : null}
      {status === "declined" ? <Notice tone="success">Invite declined. You can still receive invites from other sellers.</Notice> : null}
      {status === "blocked" ? <Notice tone="success">Seller blocked. Future invites from this seller are unavailable.</Notice> : null}
      {error === "invite-locked" ? <Notice tone="warning">This invite has closed or changed. Refresh to see the latest status.</Notice> : null}
      {error === "question" ? <Notice tone="warning">Add a question of up to 500 characters. Keep personal information out of chat.</Notice> : null}
      {invites.length ? (
        groups.length > 1 ? groups.map((group) => (
          <section aria-labelledby={`invite-group-${group.key}`} className="buyer-invite-group" key={group.key}>
            <h2 className="buyer-invite-group-title" id={`invite-group-${group.key}`}>{group.title} <span>{group.invites.length}</span></h2>
            <InviteList invites={group.invites} />
          </section>
        )) : <InviteList invites={invites} />
      ) : <EmptyState icon="mail" title="No invites yet" description="When a seller finds a match, their property invite appears here. Keep your buyer profile current so they know what you want." actions={<Link className="button primary" href="/buyer/profile">Review your profile</Link>} />}
    </div>
  );
}

function InviteList({ invites }: { invites: InviteView[] }) {
  return (
    <div className="buyer-invite-list">
      {invites.map((invite) => <BuyerInviteCard action={respondToBuyerInvite} actionId={crypto.randomUUID()} invite={invite} key={invite.id} />)}
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
