import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  checkRateLimit: vi.fn(),
  findUnique: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
  upsert: vi.fn(),
  notification: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@liber/db", () => ({ prisma: {
  user: { findUnique: mocks.findUnique },
  sellerAccess: { upsert: mocks.upsert },
  notification: { create: mocks.notification },
  adminAuditLog: { create: mocks.audit },
  $transaction: mocks.transaction,
} }));
vi.mock("./session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("./rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { reviewSellerAccessCommand } from "./seller-access-review";

const adminId = "11111111-1111-4111-8111-111111111111";
const sellerId = "22222222-2222-4222-8222-222222222222";
const approval = { userId: sellerId, status: "APPROVED" };

function expectNoWrites() {
  expect(mocks.upsert).not.toHaveBeenCalled();
  expect(mocks.notification).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
}

const tx = {
  $queryRaw: mocks.lock,
  user: { findUnique: mocks.findUnique },
  sellerAccess: { upsert: mocks.upsert },
  notification: { create: mocks.notification },
  adminAuditLog: { create: mocks.audit },
};

describe("seller access review", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: adminId, roles: ["ADMIN"] });
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.findUnique.mockResolvedValue({ roles: ["SELLER"], status: "ACTIVE", sellerAccess: { status: "PENDING" } });
    mocks.upsert.mockReturnValue("access-write");
    mocks.notification.mockReturnValue("notification-write");
    mocks.audit.mockReturnValue("audit-write");
    mocks.lock.mockResolvedValue([{ id: sellerId }]);
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
  });

  it("requires an authenticated admin before inspecting or changing a seller", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    await expect(reviewSellerAccessCommand(approval)).rejects.toThrow("redirect:/login");
    mocks.getSessionUser.mockResolvedValue({ id: adminId, roles: ["SELLER"] });
    await expect(reviewSellerAccessCommand(approval)).rejects.toThrow("redirect:/seller/");
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each(["APPROVED", "SUSPENDED"])("allows an authenticated admin to review their own access as %s", async (status) => {
    await expect(reviewSellerAccessCommand({ userId: adminId, status })).resolves.toMatchObject({ ok: true, changed: true });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: adminId },
      update: expect.objectContaining({ status, reviewedByUserId: adminId }),
    }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUserId: adminId, targetId: adminId }) }));
  });

  it.each([adminId, sellerId])("makes an already-approved repeat harmless for %s", async (userId) => {
    mocks.findUnique.mockResolvedValue({ roles: ["SELLER"], status: "ACTIVE", sellerAccess: { status: "APPROVED" } });
    await expect(reviewSellerAccessCommand({ ...approval, userId })).resolves.toMatchObject({ ok: true, changed: false });
    expectNoWrites();
  });

  it("commits another seller's approval, notification, and audit together", async () => {
    const form = new FormData();
    form.set("userId", sellerId);
    form.set("status", "APPROVED");
    await expect(reviewSellerAccessCommand(form)).resolves.toEqual({ ok: true, changed: true, data: approval });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: sellerId },
      update: expect.objectContaining({ status: "APPROVED", reviewedByUserId: adminId }),
    }));
    expect(mocks.notification).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: sellerId }) }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUserId: adminId, targetId: sellerId }) }));
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.findUnique.mock.invocationCallOrder[0]);
    expect(mocks.findUnique.mock.invocationCallOrder[0]).toBeLessThan(mocks.upsert.mock.invocationCallOrder[0]);
  });

  it("does not grant usable access to a suspended account", async () => {
    mocks.findUnique.mockResolvedValue({ roles: ["SELLER"], status: "SUSPENDED", sellerAccess: { status: "SUSPENDED" } });
    await expect(reviewSellerAccessCommand(approval)).resolves.toMatchObject({ ok: false, message: expect.stringContaining("account is suspended") });
    expectNoWrites();
  });

  it("returns validation feedback before querying a malformed review", async () => {
    await expect(reviewSellerAccessCommand({ ...approval, status: "ACTIVE" })).resolves.toMatchObject({ ok: false });
    await expect(reviewSellerAccessCommand({ ...approval, userId: "bad-uuid" })).resolves.toMatchObject({ ok: false });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each([null, { roles: ["BUYER"], status: "ACTIVE" }])("rejects an unavailable seller", async (user) => {
    mocks.findUnique.mockResolvedValue(user);
    await expect(reviewSellerAccessCommand(approval)).resolves.toMatchObject({ ok: false, message: expect.stringContaining("no longer available") });
    expectNoWrites();
  });

  it("keeps the review budget and gives its actual retry interval", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 125 });
    await expect(reviewSellerAccessCommand(approval)).resolves.toEqual({ ok: false, message: "Review limit reached. Try again in 3 minutes." });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(`admin-review:${adminId}`, 120, 3_600_000);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("does not claim success if the atomic write fails", async () => {
    mocks.transaction.mockRejectedValue(new Error("write failed"));
    await expect(reviewSellerAccessCommand(approval)).rejects.toThrow("write failed");
  });

  it("rechecks approval after acquiring the lock to avoid duplicate review effects", async () => {
    mocks.lock.mockImplementation(async () => {
      // Another request completed its approval while this request waited for the row.
      mocks.findUnique.mockResolvedValue({ roles: ["SELLER"], status: "ACTIVE", sellerAccess: { status: "APPROVED" } });
      return [{ id: sellerId }];
    });
    await expect(reviewSellerAccessCommand(approval)).resolves.toMatchObject({ ok: true, changed: false });
    expectNoWrites();
  });
});
