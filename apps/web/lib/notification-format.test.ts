import { describe, expect, it } from "vitest";
import { relativeDay, relativeTime } from "./notification-format";

describe("notification formatting", () => {
  const today = new Date("2026-10-13T18:00:00Z");

  it.each([
    ["2026-10-13", "Today"],
    ["2026-10-12", "Yesterday"],
    ["2026-09-25", "Sep 25"],
    ["2025-12-31", "Dec 31, 2025"],
    ["not-a-date", "not-a-date"],
  ])("labels day %s as %s", (dayKey, label) => {
    expect(relativeDay(dayKey, today)).toBe(label);
  });

  it.each([
    ["2026-10-13T17:59:40Z", "Just now"],
    ["2026-10-13T17:55:00Z", "5m ago"],
    ["2026-10-13T15:00:00Z", "3h ago"],
    ["2026-10-12T12:00:00Z", "Yesterday"],
    ["2026-10-09T18:00:00Z", "4d ago"],
    ["2026-09-25T10:00:00Z", "Sep 25"],
    ["2025-12-31T10:00:00Z", "Dec 31, 2025"],
    ["garbage", ""],
  ])("labels time %s as %s", (iso, label) => {
    expect(relativeTime(iso, today)).toBe(label);
  });
});
