import { NotificationList } from "../../../components/notification-list";
import { PageTitle } from "../../../components/page-title";
import { WorkspaceTabs } from "../../../components/workspace-tabs";
import { listNotifications } from "../../../server/contracts";

export default async function SellerNotificationsPage() {
  const { data: notifications } = await listNotifications();
  const unread = notifications.filter((notification) => !notification.read).length;

  return (
    <div className="page stack loose">
      <PageTitle title="Notifications">{unread ? `${unread} unread` : "You’re all caught up"}</PageTitle>
      <WorkspaceTabs
        current="/seller/notifications"
        label="Seller activity"
        tabs={[
          { href: "/seller/invites", label: "Sent invites" },
          { badge: unread, href: "/seller/notifications", label: "Notifications" },
        ]}
      />
      <NotificationList items={notifications} now={new Date().toISOString()} />
    </div>
  );
}
