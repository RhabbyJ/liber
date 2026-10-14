import { describe, expect, it } from "vitest";
import type { NotificationActivity } from "../lib/notification-activity";
import { advanceInviteActivity, inviteActivityBaseline, isNotificationActivity } from "./notification-bell-state";

const oldInvite = { id: "old-invite", createdAt: "2026-10-06T10:00:00.000Z", read: false };
const newInvite = { id: "new-invite", createdAt: "2026-10-06T10:01:00.000Z", read: false };
const recentItem = { actionLabel: "Open LOI", body: "A new LOI is ready.", createdAt: "2026-10-13T10:00:00.000Z", href: "/negotiations/neg1", id: "n1", read: false, title: "LOI update", type: "LOI_UPDATE" };
const activity = (unreadCount: number, latestInvite = oldInvite): NotificationActivity => ({ unreadCount, latestInvite, recent: [recentItem] });

describe("invite arrival detection", () => {
  it("establishes a failed initial-load baseline without replaying existing invites", () => {
    const result = advanceInviteActivity(inviteActivityBaseline(null), activity(3));
    expect(result.arrived).toBe(false);
    expect(advanceInviteActivity(result.baseline, activity(4, newInvite)).arrived).toBe(true);
  });

  it("lights the bell on a first new invitation after a confirmed empty inbox", () => {
    const initial = inviteActivityBaseline({ unreadCount: 0, latestInvite: null, recent: [] });
    expect(advanceInviteActivity(initial, activity(1, newInvite)).arrived).toBe(true);
  });

  it("does not replay old invites after dismissing a toast, route changes, or another notification arrives", () => {
    const initial = inviteActivityBaseline(activity(1));
    expect(advanceInviteActivity(initial, activity(1)).arrived).toBe(false);
    const arrived = advanceInviteActivity(initial, activity(2, newInvite));
    expect(arrived.arrived).toBe(true);
    expect(advanceInviteActivity(arrived.baseline, activity(3, newInvite)).arrived).toBe(false);
    expect(advanceInviteActivity(inviteActivityBaseline(activity(2, newInvite)), activity(2, newInvite)).arrived).toBe(false);
  });

  it("suppresses read-count decreases for an existing invite", () => {
    const initial = inviteActivityBaseline(activity(4));
    const result = advanceInviteActivity(initial, activity(3));
    expect(result.arrived).toBe(false);
    expect(advanceInviteActivity(result.baseline, activity(4)).arrived).toBe(false);
  });

  it("announces a new invite even when other notices were read concurrently", () => {
    const initial = inviteActivityBaseline(activity(4));
    const result = advanceInviteActivity(initial, activity(3, newInvite));
    expect(result.arrived).toBe(true);
    expect(advanceInviteActivity(result.baseline, activity(4, newInvite)).arrived).toBe(false);
  });

  it("uses the API ID ordering to detect new invites with identical timestamps", () => {
    const initial = inviteActivityBaseline(activity(1, { ...oldInvite, id: "a-invite" }));
    const tiedInvite = { ...oldInvite, id: "b-invite" };
    const result = advanceInviteActivity(initial, activity(2, tiedInvite));
    expect(result.arrived).toBe(true);
    expect(advanceInviteActivity(result.baseline, activity(1, { ...oldInvite, id: "a-invite" })).arrived).toBe(false);
    expect(advanceInviteActivity(result.baseline, activity(2, tiedInvite)).arrived).toBe(false);
  });

  it("does not replay an older invite when the newest invite is removed or read", () => {
    const initial = inviteActivityBaseline(activity(2, newInvite));
    const older = advanceInviteActivity(initial, activity(2));
    expect(older.arrived).toBe(false);
    expect(advanceInviteActivity(older.baseline, activity(2, newInvite)).arrived).toBe(false);
    expect(advanceInviteActivity(inviteActivityBaseline(activity(1)), activity(2, { ...newInvite, read: true })).arrived).toBe(false);
  });

  it("accepts only valid activity payloads", () => {
    expect(isNotificationActivity(activity(2))).toBe(true);
    expect(isNotificationActivity({ unreadCount: 0, latestInvite: null, recent: [] })).toBe(true);
    for (const bad of [null, {}, { unreadCount: -1, latestInvite: null, recent: [] }, { unreadCount: 1.5, latestInvite: null, recent: [] },
      { unreadCount: 0, latestInvite: null },
      { unreadCount: 0, latestInvite: null, recent: [{ ...recentItem, href: "https://evil.example/x" }] },
      { unreadCount: 0, latestInvite: null, recent: [{ ...recentItem, href: "//evil.example/x" }] },
      { unreadCount: 0, latestInvite: null, recent: [{ ...recentItem, read: "no" }] },
      { unreadCount: 1, latestInvite: { ...oldInvite, createdAt: "invalid" } },
      { unreadCount: 1, latestInvite: { ...oldInvite, read: "false" } }]) {
      expect(isNotificationActivity(bad)).toBe(false);
    }
  });
});
