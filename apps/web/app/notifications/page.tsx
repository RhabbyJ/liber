import { redirect } from "next/navigation";
import { NotificationList } from "../../components/notification-list";
import { PageTitle } from "../../components/page-title";
import { listNotifications } from "../../server/contracts";
import { getSessionUser } from "../../server/session";

/** Notifications for accounts without a buyer or seller workspace (for example admin-only). */
export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fnotifications");
  if (user.roles.includes("BUYER")) redirect("/buyer/notifications");
  if (user.roles.includes("SELLER")) redirect("/seller/notifications");
  const { data: notifications } = await listNotifications();
  const unread = notifications.filter((notification) => !notification.read).length;

  return (
    <div className="page stack loose">
      <PageTitle title="Notifications">{unread ? `${unread} unread` : "You’re all caught up"}</PageTitle>
      <NotificationList items={notifications} now={new Date().toISOString()} />
    </div>
  );
}
