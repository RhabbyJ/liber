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
}));

vi.mock("@liber/db", () => ({
  prisma: { $transaction: mocks.transaction, invite: { findFirst: mocks.currentInvite } },
}));
vi.mock("../session", async () => (await import("../session-mock.test-helper")).sessionModuleMock(mocks.session));
vi.mock("../messaging/service", () => ({ lockAndAssertInvitePairAvailable: mocks.pairLock }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { respondToInvite } from "./invites";

const buyerId = "10000000-0000-4000-8000-000000000001";
const sellerId = "10000000-0000-4000-8000-000000000002";
const inviteId = "synthetic-invite";
const tx = {
  $executeRaw: mocks.execute,
  $queryRaw: mocks.lockRow,
  invite: { findFirst: mocks.ownedInvite },
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

  it("declines without activating the conversation", async () => {
    await expect(respondToInvite({ inviteId, response: "DECLINED" })).resolves.toMatchObject({ ok: true });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0].slice(1)).toEqual(["DECLINED", inviteId, buyerId]);
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
  });

  it("accepts a concurrent identical response that won the race", async () => {
    mocks.execute.mockResolvedValue(0);
    mocks.currentInvite.mockResolvedValue({ status: "DECLINED" });
    await expect(respondToInvite({ inviteId, response: "DECLINED" })).resolves.toMatchObject({ ok: true });
  });

  it("does not update an invite whose pair is blocked", async () => {
    const unavailable = new MessagingError("UNAVAILABLE", "Invitation is unavailable.", 409);
    mocks.pairLock.mockRejectedValue(unavailable);
    await expect(respondToInvite({ inviteId, response: "ACCEPTED" })).rejects.toBe(unavailable);
    expect(mocks.lockRow).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
