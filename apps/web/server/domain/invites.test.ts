import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingError } from "../messaging/errors";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  transaction: vi.fn(),
  ownedInvite: vi.fn(),
  currentInvite: vi.fn(),
  pairLock: vi.fn(),
  lockRow: vi.fn(),
  execute: vi.fn(),
  notification: vi.fn(),
  updateMany: vi.fn(),
  audit: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@liber/db", () => ({
  prisma: { $transaction: mocks.transaction, invite: { findFirst: mocks.currentInvite } },
}));
vi.mock("../session", async () => (await import("../session-mock.test-helper")).sessionModuleMock(mocks.session));
vi.mock("../messaging/service", () => ({ lockAndAssertInvitePairAvailable: mocks.pairLock }));
vi.mock("../rate-limit", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { respondToInvite, withdrawSellerInvite } from "./invites";

const buyerId = "10000000-0000-4000-8000-000000000001";
const sellerId = "10000000-0000-4000-8000-000000000002";
const inviteId = "synthetic-invite";
const tx = {
  $executeRaw: mocks.execute,
  $queryRaw: mocks.lockRow,
  adminAuditLog: { create: mocks.audit },
  invite: { findFirst: mocks.ownedInvite, updateMany: mocks.updateMany },
  notification: { create: mocks.notification },
};
const sql = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");

describe("buyer invite responses", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ id: buyerId, roles: ["BUYER"] });
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.ownedInvite.mockResolvedValue({ sellerId, buyerProfileId: "synthetic-profile", propertyId: "synthetic-property" });
    mocks.lockRow.mockResolvedValue([{ id: inviteId, status: "SENT" }]);
    mocks.execute.mockResolvedValue(1);
  });

  it("requires a buyer session before reading the invite", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(respondToInvite({ inviteId, response: "ACCEPTED" })).rejects.toThrow("redirect:/login");
    mocks.session.mockResolvedValue({ id: sellerId, roles: ["SELLER"] });
    await expect(respondToInvite({ inviteId, response: "ACCEPTED" })).rejects.toThrow("redirect:/seller/properties");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a response outside ACCEPTED and DECLINED before opening a transaction", async () => {
    await expect(respondToInvite({ inviteId, response: "WITHDRAWN" })).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("scopes the invite to the signed-in buyer's profile and refuses another buyer's invite", async () => {
    mocks.ownedInvite.mockResolvedValue(null);
    mocks.currentInvite.mockResolvedValue(null);
    await expect(respondToInvite({ inviteId, response: "DECLINED" }))
      .rejects.toThrow("Invite cannot be changed after response, identity change, or expiration.");
    expect(mocks.ownedInvite).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: inviteId, buyerProfile: { userId: buyerId } },
    }));
    expect(mocks.currentInvite).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: inviteId, buyerProfile: { userId: buyerId } },
    }));
    expect(mocks.pairLock).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("locks the pair before the invite row, then accepts only an open, unexpired, still-valid invite", async () => {
    await expect(respondToInvite({ inviteId, response: "ACCEPTED" })).resolves.toEqual({ ok: true, data: { inviteId, response: "ACCEPTED" } });
    expect(mocks.pairLock).toHaveBeenCalledWith(tx, sellerId, buyerId);
    expect(sql(mocks.lockRow.mock.calls[0])).toContain("FOR UPDATE");
    expect(mocks.pairLock.mock.invocationCallOrder[0]).toBeLessThan(mocks.lockRow.mock.invocationCallOrder[0]);

    const [update, activate] = mocks.execute.mock.calls;
    expect(sql(update)).toContain('SET status = CAST(? AS public."InviteStatus")');
    expect(sql(update)).toContain("AND status IN ('SENT', 'VIEWED')");
    expect(sql(update)).toContain('AND "expiresAt" > now()');
    expect(sql(update)).toContain("AND app_private.is_invite_property_access_valid(id, ?::uuid)");
    expect(update.slice(1)).toEqual(["ACCEPTED", inviteId, buyerId]);
    expect(sql(activate)).toContain("SET status = 'ACTIVE'::public.\"ConversationStatus\"");
    expect(sql(activate)).toContain("AND status = 'AWAITING_BUYER'::public.\"ConversationStatus\"");
    expect(activate.slice(1)).toEqual([inviteId]);
  });

  it("notifies the seller in the same transaction when the buyer accepts", async () => {
    await respondToInvite({ inviteId, response: "ACCEPTED" });
    expect(mocks.notification).toHaveBeenCalledTimes(1);
    expect(mocks.notification).toHaveBeenCalledWith({
      data: {
        body: "A buyer accepted your property invite. Continue in your private conversation.",
        metadata: { buyerProfileId: "synthetic-profile", inviteId, propertyId: "synthetic-property" },
        title: "Invite accepted",
        type: "invite_accepted",
        userId: sellerId,
      },
    });
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(mocks.notification.mock.invocationCallOrder[0]);
  });

  it("declines without activating the conversation and tells the seller", async () => {
    await expect(respondToInvite({ inviteId, response: "DECLINED" })).resolves.toMatchObject({ ok: true });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0].slice(1)).toEqual(["DECLINED", inviteId, buyerId]);
    expect(mocks.notification).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: "Invite declined", type: "invite_declined", userId: sellerId }),
    });
    expect(JSON.stringify(mocks.notification.mock.calls)).not.toContain(buyerId);
  });

  it("treats repeating the current response as a no-op", async () => {
    mocks.lockRow.mockResolvedValue([{ id: inviteId, status: "ACCEPTED" }]);
    await expect(respondToInvite({ inviteId, response: "ACCEPTED" })).resolves.toMatchObject({ ok: true });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.notification).not.toHaveBeenCalled();
  });

  it("refuses to change an answered, expired, withdrawn, or stale invite", async () => {
    mocks.lockRow.mockResolvedValue([{ id: inviteId, status: "WITHDRAWN" }]);
    mocks.execute.mockResolvedValue(0);
    mocks.currentInvite.mockResolvedValue({ status: "WITHDRAWN" });
    await expect(respondToInvite({ inviteId, response: "ACCEPTED" }))
      .rejects.toThrow("Invite cannot be changed after response, identity change, or expiration.");
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.notification).not.toHaveBeenCalled();
  });

  it("accepts a concurrent identical response that won the race", async () => {
    mocks.execute.mockResolvedValue(0);
    mocks.currentInvite.mockResolvedValue({ status: "DECLINED" });
    await expect(respondToInvite({ inviteId, response: "DECLINED" })).resolves.toMatchObject({ ok: true });
    expect(mocks.notification).not.toHaveBeenCalled();
  });

  it("does not update an invite whose pair is blocked", async () => {
    const unavailable = new MessagingError("UNAVAILABLE", "Invitation is unavailable.", 409);
    mocks.pairLock.mockRejectedValue(unavailable);
    await expect(respondToInvite({ inviteId, response: "ACCEPTED" })).rejects.toBe(unavailable);
    expect(mocks.lockRow).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

describe("seller invite withdrawal", () => {
  const sellerInvite = {
    buyerProfile: { userId: buyerId },
    buyerProfileId: "synthetic-profile",
    id: inviteId,
    propertyId: "synthetic-property",
    sellerId,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ id: sellerId, roles: ["SELLER"] });
    mocks.rateLimit.mockResolvedValue({ allowed: true, limit: 60, retryAfterSeconds: 0 });
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.ownedInvite.mockResolvedValue(sellerInvite);
    mocks.lockRow.mockResolvedValue([{ status: "ACCEPTED" }]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  function expectNoWithdrawal() {
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.notification).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  }

  it("requires a seller session, a withdrawal budget, and an invite id before opening a transaction", async () => {
    mocks.session.mockResolvedValue({ id: buyerId, roles: ["BUYER"] });
    await expect(withdrawSellerInvite({ inviteId })).rejects.toThrow("redirect:/buyer/profile");
    mocks.session.mockResolvedValue({ id: sellerId, roles: ["SELLER"] });
    mocks.rateLimit.mockResolvedValue({ allowed: false, limit: 60, retryAfterSeconds: 60 });
    await expect(withdrawSellerInvite({ inviteId })).resolves.toEqual({ ok: false, message: "Withdrawal limit reached. Try again later." });
    expect(mocks.rateLimit).toHaveBeenCalledWith(`invite-withdraw:${sellerId}`, 60, 3_600_000);
    mocks.rateLimit.mockResolvedValue({ allowed: true, limit: 60, retryAfterSeconds: 0 });
    await expect(withdrawSellerInvite({ inviteId: "" })).resolves.toMatchObject({ ok: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("withdraws an open invite under the pair and row locks, then notifies the buyer and audits it", async () => {
    const form = new FormData();
    form.set("inviteId", inviteId);
    form.set("$ACTION_REF_1", "");
    await expect(withdrawSellerInvite(form)).resolves.toEqual({
      ok: true,
      message: "Invite withdrawn. The buyer was notified and the conversation is now read-only.",
    });
    expect(mocks.ownedInvite).toHaveBeenCalledWith(expect.objectContaining({ where: { id: inviteId, sellerId } }));
    expect(mocks.pairLock).toHaveBeenCalledWith(tx, sellerId, buyerId);
    expect(sql(mocks.lockRow.mock.calls[0])).toContain("FOR UPDATE");
    expect(mocks.pairLock.mock.invocationCallOrder[0]).toBeLessThan(mocks.lockRow.mock.invocationCallOrder[0]);
    expect(mocks.lockRow.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateMany.mock.invocationCallOrder[0]);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: inviteId,
        OR: [
          { status: "ACCEPTED" },
          { status: { in: ["SENT", "VIEWED"] }, expiresAt: { gt: expect.any(Date) } },
        ],
      },
      data: { status: "WITHDRAWN" },
    });
    expect(mocks.notification).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: { inviteId, propertyId: "synthetic-property" },
        title: "Invite withdrawn",
        type: "invite_withdrawn",
        userId: buyerId,
      }),
    });
    expect(mocks.audit).toHaveBeenCalledWith({
      data: {
        action: "withdraw_invite",
        actorUserId: sellerId,
        metadata: { buyerProfileId: "synthetic-profile", previousStatus: "ACCEPTED", propertyId: "synthetic-property" },
        targetId: inviteId,
        targetType: "invite",
      },
    });
  });

  it("cannot reach another seller's invite", async () => {
    mocks.ownedInvite.mockResolvedValue(null);
    await expect(withdrawSellerInvite({ inviteId })).resolves.toMatchObject({ ok: false, message: expect.stringContaining("unavailable") });
    expect(mocks.pairLock).not.toHaveBeenCalled();
    expectNoWithdrawal();
  });

  it("treats a repeated withdrawal as a no-op", async () => {
    mocks.lockRow.mockResolvedValue([{ status: "WITHDRAWN" }]);
    await expect(withdrawSellerInvite({ inviteId })).resolves.toEqual({ ok: true, message: "This invite was already withdrawn." });
    expectNoWithdrawal();
  });

  it("refuses declined, expired, or past-deadline invites", async () => {
    mocks.lockRow.mockResolvedValue([{ status: "SENT" }]);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(withdrawSellerInvite({ inviteId })).resolves.toMatchObject({ ok: false, message: expect.stringContaining("no longer open") });
    expect(mocks.notification).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("reports a blocked pair's invite as closed without disclosing the block", async () => {
    mocks.pairLock.mockRejectedValue(new MessagingError("UNAVAILABLE", "Invitation is unavailable.", 409));
    await expect(withdrawSellerInvite({ inviteId })).resolves.toMatchObject({ ok: false, message: expect.stringContaining("no longer open") });
    expect(mocks.lockRow).not.toHaveBeenCalled();
    expectNoWithdrawal();
  });

  it("propagates unexpected lock failures", async () => {
    const failure = new Error("database fixture failure");
    mocks.pairLock.mockRejectedValue(failure);
    await expect(withdrawSellerInvite({ inviteId })).rejects.toBe(failure);
    expectNoWithdrawal();
  });
});
