/** "Today", "Yesterday", then "Sep 25" (adds the year outside the current one). Dates are UTC day keys. */
export function relativeDay(dayKey: string, today: Date) {
  const date = new Date(`${dayKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dayKey;
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);
  if (dayKey === todayKey) return "Today";
  if (dayKey === yesterday) return "Yesterday";
  return shortDate(date, today);
}

/** Portal-style age for an ISO timestamp: Just now, 5m ago, 3h ago, Yesterday, 4d ago, then Sep 25. */
export function relativeTime(iso: string, now: Date) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return shortDate(date, now);
}

function shortDate(date: Date, now: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(date.getUTCFullYear() === now.getUTCFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}
