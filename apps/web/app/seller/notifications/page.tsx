import { PageTitle } from "../../../components/page-title";
import { listNotifications } from "../../../server/contracts";

export default async function SellerNotificationsPage() {
  const { data: notifications } = await listNotifications();

  return (
    <div className="page stack">
      <PageTitle eyebrow="Seller" title="Notifications" />
      <section className="grid two">
        {notifications.map((notification) => (
          <article className="card stack" key={notification.id}>
            <div className="section-head compact">
              <p className="eyebrow">{notification.type.replace("_", " ")}</p>
              <span className={notification.readAt ? "status-dot" : "status-dot active"}>
                {notification.readAt ? "Read" : "Unread"}
              </span>
            </div>
            <h2>{notification.title}</h2>
            <p className="muted">{notification.body}</p>
            <small>{notification.createdAt}</small>
          </article>
        ))}
      </section>
    </div>
  );
}
