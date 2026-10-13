import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), transaction: vi.fn() }));
vi.mock("@liber/db", () => ({ prisma: { notification: mocks, $transaction: mocks.transaction } }));

import { markNotificationsRead, readNotificationActivity } from "./notifications";
import type { SessionUser } from "./authz";

const buyer: SessionUser = { id: "buyer-owner", roles: ["BUYER"] };
const invite = { id: "cmnotification", createdAt: new Date("2026-10-06T12:00:00Z"), readAt: null };

describe("notification activity ownership", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.count.mockResolvedValue(2);
    mocks.findFirst.mockResolvedValue(invite);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it("counts only the session owner's unread notifications and projects a stable invite hint", async () => {
    expect(await readNotificationActivity(buyer)).toEqual({
      unreadCount: 2, latestInvite: { id: invite.id, createdAt: "2026-10-06T12:00:00.000Z", read: false },
    });
    expect(mocks.count).toHaveBeenCalledWith({ where: { userId: buyer.id, readAt: null } });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { userId: buyer.id, type: "invite_received" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, createdAt: true, readAt: true },
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("reads buyer count and latest hint in one repeatable-read snapshot", async () => {
    await readNotificationActivity(buyer);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.transaction).toHaveBeenCalledWith([
      mocks.count.mock.results[0].value,
      mocks.findFirst.mock.results[0].value,
    ], { isolationLevel: "RepeatableRead" });
    expect(mocks.count).toHaveBeenCalledOnce();
    expect(mocks.findFirst).toHaveBeenCalledOnce();
  });

  it("does not fall back to incoherent independent reads when the snapshot fails", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(readNotificationActivity(buyer)).rejects.toThrow("database unavailable");
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.count).toHaveBeenCalledOnce();
    expect(mocks.findFirst).toHaveBeenCalledOnce();
  });

  it("keeps the latest read invite as the stable deduplication hint", async () => {
    mocks.findFirst.mockResolvedValue({ ...invite, readAt: new Date() });
    expect((await readNotificationActivity(buyer)).latestInvite?.read).toBe(true);
    expect((mocks.findFirst.mock.calls[0][0]).where).not.toHaveProperty("readAt");
  });

  it("does not fetch buyer invite hints for sellers or administrators", async () => {
    for (const roles of [["SELLER"], ["ADMIN"]] as SessionUser["roles"][]) {
      expect(await readNotificationActivity({ id: "other-owner", roles })).toEqual({ unreadCount: 2, latestInvite: null });
    }
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("allows a mixed-role buyer and returns null when there is no invite", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await readNotificationActivity({ ...buyer, roles: ["SELLER", "BUYER"] })).toEqual({ unreadCount: 2, latestInvite: null });
  });

  it("updates an individual ID only within the owner scope, including administrator sessions", async () => {
    await markNotificationsRead({ id: "administrator", roles: ["ADMIN"] }, { notificationId: "foreign-id" });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: "administrator", readAt: null, id: "foreign-id" },
      data: { readAt: expect.any(Date) },
    });
  });

  it("marks all unread only for the active owner", async () => {
    await markNotificationsRead(buyer, { all: true });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: buyer.id, readAt: null }, data: { readAt: expect.any(Date) },
    });
  });

  it("makes unknown, non-owned, and already read IDs idempotent without an existence lookup", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await markNotificationsRead(buyer, { notificationId: "unknown" })).toEqual(await readNotificationActivity(buyer));
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: buyer.id, type: "invite_received" } }));
  });
});
