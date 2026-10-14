import type { IconName } from "../components/icon";

export function notificationIcon(type: string): IconName {
  const value = type.toLowerCase();
  if (value.includes("invite")) return "mail";
  if (value.includes("message")) return "message";
  if (value.includes("tour")) return "calendar";
  if (value.includes("loi") || value.includes("negotiation") || value.includes("terms")) return "doc";
  if (value.includes("seller_access")) return "key";
  if (value.includes("document") || value.includes("badge") || value.includes("verif")) return "check-shield";
  return "bell";
}

/** "Today", "Yesterday", then "Sep 25" (adds the year outside the current one). Dates are UTC day keys. */
export function relativeDay(dayKey: string, today: Date) {
  const date = new Date(`${dayKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dayKey;
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);
  if (dayKey === todayKey) return "Today";
  if (dayKey === yesterday) return "Yesterday";
  const sameYear = date.getUTCFullYear() === today.getUTCFullYear();
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}
