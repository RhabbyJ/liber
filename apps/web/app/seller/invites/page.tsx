import Link from "next/link";
import { EmptyState } from "../../../components/empty-state";
import { GeneratedAvatar } from "../../../components/generated-avatar";
import { Icon } from "../../../components/icon";
import { relativeDay } from "../../../lib/notification-format";
import { PageTitle } from "../../../components/page-title";
import { WorkspaceTabs } from "../../../components/workspace-tabs";
import { listNotifications, listSellerInvites } from "../../../server/contracts";

const statusTone: Record<string, "active" | "pending" | "declined" | "closed"> = {
  Accepted: "active",
  Declined: "declined",
  Expired: "closed",
  Sent: "pending",
  Viewed: "pending",
};

export default async function SellerInvitesPage() {
  const [{ data: invites }, { data: notifications }] = await Promise.all([listSellerInvites(), listNotifications()]);
  const unread = notifications.filter((notification) => !notification.readAt).length;
  const today = new Date();

  return (
    <div className="page stack loose">
      <PageTitle
        actions={(
          <Link className="button primary" href="/seller/search">
            <Icon name="search" size={16} />
            Find buyers
          </Link>
        )}
        title="Sent invites"
      >
        {invites.length === 1 ? "1 invite" : `${invites.length} invites`}
      </PageTitle>
      <WorkspaceTabs
        current="/seller/invites"
        label="Seller activity"
        tabs={[
          { href: "/seller/invites", label: "Sent invites" },
          { badge: unread, href: "/seller/notifications", label: "Notifications" },
        ]}
      />

      {invites.length === 0 ? (
        <EmptyState
          icon="mail"
          title="No invites sent yet"
          description="Search buyers and send a manual invite once you find a fit."
          actions={<Link className="button primary" href="/seller/search">Find buyers</Link>}
        />
      ) : (
        <ul className="activity-list" aria-label="Sent invites">
          {invites.map((invite) => {
            const verified = invite.propertyStatus === "Ownership verified";
            const canOpen = invite.conversationAvailable && invite.conversationId;
            return (
              <li className="activity-row" key={invite.id}>
                <GeneratedAvatar className="activity-row-avatar" decorative name={invite.buyer} seed={invite.buyerProfileId} />
                <div className="activity-row-main">
                  <p className="activity-row-title">
                    <Link href={`/buyers/${invite.buyerProfileId}`}>{invite.buyer}</Link>
                    <span className={`status-tag ${statusTone[invite.status] ?? "pending"}`}>{invite.status}</span>
                  </p>
                  <p className="activity-row-meta">
                    <Icon name="home" size={14} />
                    {invite.property}
                    <span aria-hidden="true">·</span>
                    <span className={verified ? "activity-verified" : undefined}>
                      {invite.propertyStatus || "Ownership not submitted"}
                    </span>
                  </p>
                </div>
                <p className="activity-row-date">
                  Sent <time dateTime={invite.sentAtDate}>{invite.sentAtDate ? relativeDay(invite.sentAtDate, today) : invite.sentAt}</time>
                </p>
                <div className="activity-row-action">
                  {canOpen ? (
                    <Link className="button secondary sm" href={`/messages/${invite.conversationId}`}>
                      <Icon name="message" size={16} />
                      Open conversation
                    </Link>
                  ) : (
                    <span className="activity-row-muted">Conversation unavailable</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
