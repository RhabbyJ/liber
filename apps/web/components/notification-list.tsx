import { notificationIcon, relativeDay } from "../lib/notification-format";
import { Icon } from "./icon";

export type NotificationItem = {
  body: string;
  createdAt: string;
  id: string;
  readAt: string | null;
  title: string;
  type: string;
};

/** Portal-style notification feed: type icon, title, body, relative day, unread marker. */
export function NotificationList({ notifications, today = new Date() }: { notifications: NotificationItem[]; today?: Date }) {
  return (
    <ul className="notification-list">
      {notifications.map((notification) => {
        const unread = !notification.readAt;
        return (
          <li className={`notification-row${unread ? " unread" : ""}`} key={notification.id}>
            <span aria-hidden="true" className="notification-row-icon">
              <Icon name={notificationIcon(notification.type)} size={20} />
            </span>
            <div className="notification-row-text">
              <strong>{notification.title}</strong>
              <p>{notification.body}</p>
              <small>
                <time dateTime={notification.createdAt}>{relativeDay(notification.createdAt, today)}</time>
                {unread ? <span className="visually-hidden"> (unread)</span> : null}
              </small>
            </div>
            {unread ? <span aria-hidden="true" className="notification-dot" /> : null}
          </li>
        );
      })}
    </ul>
  );
}
