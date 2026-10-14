import { EmptyState } from "../../../components/empty-state";
import { NotificationList } from "../../../components/notification-list";
import { PageTitle } from "../../../components/page-title";
import { WorkspaceTabs } from "../../../components/workspace-tabs";
import { listNotifications } from "../../../server/contracts";

export default async function BuyerNotificationsPage() {
  const { data: notifications } = await listNotifications();
  const unread = notifications.filter((notification) => !notification.readAt).length;

  return (
    <div className="page stack loose">
      <PageTitle title="Notifications">{unread ? `${unread} unread` : "You’re all caught up"}</PageTitle>
      <WorkspaceTabs
        current="/buyer/notifications"
        label="Buyer activity"
        tabs={[
          { href: "/buyer/invites", label: "Received invites" },
          { badge: unread, href: "/buyer/notifications", label: "Notifications" },
        ]}
      />
      {notifications.length === 0 ? (
        <EmptyState icon="bell" title="No notifications yet" description="Updates appear here when sellers reach out." />
      ) : (
        <NotificationList notifications={notifications} />
      )}
    </div>
  );
}
