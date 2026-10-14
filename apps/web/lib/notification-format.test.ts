import { describe, expect, it } from "vitest";
import { notificationIcon, relativeDay } from "./notification-format";

describe("notification formatting", () => {
  const today = new Date("2026-10-13T18:00:00Z");

  it.each([
    ["2026-10-13", "Today"],
    ["2026-10-12", "Yesterday"],
    ["2026-09-25", "Sep 25"],
    ["2025-12-31", "Dec 31, 2025"],
    ["not-a-date", "not-a-date"],
  ])("labels %s as %s", (dayKey, label) => {
    expect(relativeDay(dayKey, today)).toBe(label);
  });

  it.each([
    ["INVITE", "mail"],
    ["MESSAGE_UNREAD", "message"],
    ["TOUR_UPDATE", "calendar"],
    ["LOI_UPDATE", "doc"],
    ["seller_access_reviewed", "key"],
    ["verification_document_approved", "check-shield"],
    ["something_else", "bell"],
  ])("maps %s to the %s icon", (type, icon) => {
    expect(notificationIcon(type)).toBe(icon);
  });
});
