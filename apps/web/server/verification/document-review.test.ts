import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), transaction: vi.fn(), find: vi.fn(), update: vi.fn(), notify: vi.fn(), audit: vi.fn(),
}));
vi.mock("@liber/db", async () => {
  const { Prisma } = await import("../../../../packages/db/src/generated/client");
  return { Prisma, prisma: { $transaction: mocks.transaction } };
});
vi.mock("../session", () => ({ getSessionUser: mocks.session }));
vi.mock("../rate-limit", () => ({ assertRateLimit: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { reviewDocument } from "../contracts";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ id: "admin-test", roles: ["ADMIN"] });
  mocks.find.mockResolvedValue({ id: "doc_test", userId: "owner-test", documentType: "IDENTITY", reviewStatus: "PENDING", propertyId: null });
  mocks.transaction.mockImplementation(async (operation) => operation({
    verificationDocument: { findUnique: mocks.find, updateMany: mocks.update },
    notification: { create: mocks.notify },
    adminAuditLog: { create: mocks.audit },
  }));
});

describe("immutable document reviews", () => {
  it("allows only one outcome/notification when conflicting reviews read the same pending snapshot", async () => {
    let status = "PENDING";
    mocks.update.mockImplementation(async ({ where, data }) => {
      if (where.reviewStatus !== status) return { count: 0 };
      status = data.reviewStatus;
      return { count: 1 };
    });

    const results = await Promise.allSettled([
      reviewDocument({ documentId: "doc_test", decision: "APPROVED" }),
      reviewDocument({ documentId: "doc_test", decision: "REJECTED", rejectionReason: "Synthetic review" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(status).toBe("APPROVED");
  });
});
