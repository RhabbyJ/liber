import Link from "next/link";
import { EmptyState } from "../../../components/empty-state";
import { Icon } from "../../../components/icon";
import { PageTitle } from "../../../components/page-title";
import { listNotifications } from "../../../server/contracts";

export default async function SellerNotificationsPage() {
  const { data: notifications } = await listNotifications();

  return (
    <div className="page stack loose">
      <PageTitle
        eyebrow="Activity"
        title="Notifications"
        tone="seller"
        actions={
          <Link className="button ghost" href="/seller/invites">
            <Icon name="mail" size={14} />
            Sent invites
          </Link>
        }
      />
      {notifications.length === 0 ? (
        <EmptyState icon="sparkle" visual="notifications" title="All quiet" description="No new activity yet. Check back after buyers respond." />
      ) : (
        <section className="activity-list">
          {notifications.map((notification) => (
            <article className="activity-row" key={notification.id}>
              <div className="section-head compact">
                <p className="eyebrow seller">{notification.type.replace(/_/g, " ")}</p>
                <span className={notification.readAt ? "status-dot" : "status-dot warning"}>
                  {notification.readAt ? "Read" : "Unread"}
                </span>
              </div>
              <h2 style={{ fontSize: 18 }}>{notification.title}</h2>
              <p className="muted">{notification.body}</p>
              <small>{notification.createdAt}</small>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
