import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const getSessionUser = vi.hoisted(() => vi.fn());
const assertRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@liber/db", () => ({
  prisma: {
    $transaction: transaction,
    user: { findUnique },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirected");
  }),
}));

vi.mock("./rate-limit", () => ({ assertRateLimit }));
vi.mock("./session", () => ({ getSessionUser }));

import {
  approveCurrentSellerForCeoPreview,
  ceoPreviewSellerSelfApprovalEnabled,
  ceoPreviewToolsEnabled,
  ensureCeoPreviewDemoPrivileges,
  grantCurrentAdminForCeoPreview,
} from "./ceo-preview";

const sellerId = "11111111-1111-4111-8111-111111111111";
const testerId = "22222222-2222-4222-8222-222222222222";

function enabledEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL: "true",
    LIBER_CEO_PREVIEW_TARGET: "ceo-preview",
    ...overrides,
  };
}

function transactionClient(status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" | null, roles: string[] = ["SELLER"]) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ roles, status: "ACTIVE" }]),
    adminAuditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    notification: { create: vi.fn().mockResolvedValue({ id: "notification-1" }) },
    sellerAccess: {
      findUnique: vi.fn().mockResolvedValue(status ? { status } : null),
      upsert: vi.fn().mockResolvedValue({ status: "APPROVED" }),
    },
    user: {
      update: vi.fn().mockResolvedValue({ roles: [...roles, "ADMIN"] }),
    },
  };
}

function stubExistingUser(
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" | null,
  roles: string[],
  accountStatus: "ACTIVE" | "SUSPENDED" = "ACTIVE",
) {
  findUnique.mockResolvedValue({
    roles,
    sellerAccess: status ? { status } : null,
    status: accountStatus,
  });
}

describe("CEO-preview seller self-approval gate", () => {
  it("requires both exact server-side opt-ins", () => {
    expect(ceoPreviewSellerSelfApprovalEnabled(enabledEnv())).toBe(true);
    expect(ceoPreviewToolsEnabled(enabledEnv())).toBe(true);
    expect(ceoPreviewSellerSelfApprovalEnabled(enabledEnv({ LIBER_CEO_PREVIEW_TARGET: "production" }))).toBe(false);
    expect(ceoPreviewSellerSelfApprovalEnabled(enabledEnv({ LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL: "1" }))).toBe(false);
    expect(ceoPreviewSellerSelfApprovalEnabled({})).toBe(false);
  });
});

describe("ensureCeoPreviewDemoPrivileges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LIBER_CEO_PREVIEW_TARGET", "ceo-preview");
    vi.stubEnv("LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL", "true");
  });

  it("grants ADMIN and approves pending seller access together", async () => {
    stubExistingUser("PENDING", ["SELLER"]);
    const tx = transactionClient("PENDING", ["SELLER"]);
    transaction.mockImplementation(async (callback) => callback(tx));

    await expect(ensureCeoPreviewDemoPrivileges(sellerId)).resolves.toEqual({
      adminChanged: true,
      roles: ["SELLER", "ADMIN"],
      sellerAccessStatus: "APPROVED",
      sellerChanged: true,
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: sellerId },
      data: { roles: ["SELLER", "ADMIN"] },
    });
    expect(tx.sellerAccess.upsert).toHaveBeenCalled();
    expect(tx.adminAuditLog.create).toHaveBeenCalledTimes(2);
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
  });

  it("is a no-op when already elevated", async () => {
    stubExistingUser("APPROVED", ["SELLER", "ADMIN"]);

    await expect(ensureCeoPreviewDemoPrivileges(sellerId)).resolves.toEqual({
      adminChanged: false,
      roles: ["SELLER", "ADMIN"],
      sellerAccessStatus: "APPROVED",
      sellerChanged: false,
    });

    expect(transaction).not.toHaveBeenCalled();
  });

  it("never restores suspended seller access", async () => {
    stubExistingUser("SUSPENDED", ["SELLER", "ADMIN"]);

    await expect(ensureCeoPreviewDemoPrivileges(sellerId)).resolves.toEqual({
      adminChanged: false,
      roles: ["SELLER", "ADMIN"],
      sellerAccessStatus: "SUSPENDED",
      sellerChanged: false,
    });

    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("CEO-preview seller self-approval command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LIBER_CEO_PREVIEW_TARGET", "ceo-preview");
    vi.stubEnv("LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL", "true");
    getSessionUser.mockResolvedValue({ id: sellerId, roles: ["SELLER"] });
    assertRateLimit.mockResolvedValue({ allowed: true });
  });

  it("approves only the signed-in seller and records the preview transition", async () => {
    stubExistingUser("PENDING", ["SELLER"]);
    const tx = transactionClient("PENDING", ["SELLER"]);
    transaction.mockImplementation(async (callback) => callback(tx));

    await expect(approveCurrentSellerForCeoPreview()).resolves.toEqual({
      changed: true,
      status: "APPROVED",
    });

    expect(tx.sellerAccess.upsert).toHaveBeenCalledWith({
      where: { userId: sellerId },
      update: {
        reviewedAt: null,
        reviewedByUserId: null,
        status: "APPROVED",
      },
      create: { status: "APPROVED", userId: sellerId },
      select: { status: true },
    });
    expect(tx.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "seller_access_preview_self_approval",
        actorUserId: sellerId,
        targetId: sellerId,
      }),
    });
  });

  it("does not create seller mutations once approved", async () => {
    stubExistingUser("APPROVED", ["SELLER", "ADMIN"]);

    await expect(approveCurrentSellerForCeoPreview()).resolves.toEqual({
      changed: false,
      status: "APPROVED",
    });

    expect(transaction).not.toHaveBeenCalled();
  });

  it("cannot restore suspended seller access", async () => {
    stubExistingUser("SUSPENDED", ["SELLER", "ADMIN"]);

    await expect(approveCurrentSellerForCeoPreview()).rejects.toThrow(
      "Suspended seller access requires an admin review.",
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a non-seller before consuming the mutation budget", async () => {
    getSessionUser.mockResolvedValue({ id: sellerId, roles: ["BUYER"] });

    await expect(approveCurrentSellerForCeoPreview()).rejects.toThrow("A seller account is required.");
    expect(assertRateLimit).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("CEO-preview admin self-grant command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LIBER_CEO_PREVIEW_TARGET", "ceo-preview");
    vi.stubEnv("LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL", "true");
    getSessionUser.mockResolvedValue({ id: testerId, roles: ["BUYER"] });
    assertRateLimit.mockResolvedValue({ allowed: true });
  });

  it("grants ADMIN to any active signed-in tester and records the transition", async () => {
    stubExistingUser(null, ["BUYER"]);
    const tx = transactionClient(null, ["BUYER"]);
    tx.user.update.mockResolvedValue({ roles: ["BUYER", "ADMIN"] });
    transaction.mockImplementation(async (callback) => callback(tx));

    await expect(grantCurrentAdminForCeoPreview()).resolves.toEqual({
      changed: true,
      roles: ["BUYER", "ADMIN"],
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: testerId },
      data: { roles: ["BUYER", "ADMIN"] },
    });
    expect(tx.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "admin_role_preview_self_grant",
        actorUserId: testerId,
        targetId: testerId,
      }),
    });
    expect(tx.notification.create).toHaveBeenCalledOnce();
  });

  it("is a no-op when ADMIN is already present", async () => {
    stubExistingUser(null, ["BUYER", "ADMIN"]);

    await expect(grantCurrentAdminForCeoPreview()).resolves.toEqual({
      changed: false,
      roles: ["BUYER", "ADMIN"],
    });

    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects inactive accounts", async () => {
    stubExistingUser(null, ["BUYER"], "SUSPENDED");

    await expect(grantCurrentAdminForCeoPreview()).rejects.toThrow("An active account is required.");
    expect(transaction).not.toHaveBeenCalled();
  });
});
