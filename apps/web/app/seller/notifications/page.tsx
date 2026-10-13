import { EmptyState } from "../../../components/empty-state";
import { PageTitle } from "../../../components/page-title";
import { listNotifications } from "../../../server/contracts";

export default async function SellerNotificationsPage() {
  const { data: notifications } = await listNotifications();

  return (
    <div className="page narrow stack loose">
      <PageTitle title="Notifications" />
      {notifications.length === 0 ? (
        <EmptyState icon="bell" title="You’re all caught up" description="No notifications yet. Updates appear here when buyers respond." />
      ) : (
        <ul className="notification-list">
          {notifications.map((notification) => (
            <li className={`notification-row${notification.readAt ? "" : " unread"}`} key={notification.id}>
              <span aria-hidden="true" className="notification-dot" />
              <div>
                <strong>{notification.title}</strong>
                <p>{notification.body}</p>
                <small>
                  {notification.createdAt}
                  {notification.readAt ? null : <span className="visually-hidden"> (unread)</span>}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
