import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), findMany: vi.fn() }));

vi.mock("@liber/db", () => ({ prisma: { verificationDocument: { findMany: mocks.findMany } } }));
vi.mock("../session", () => ({ getSessionUser: mocks.session }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));

import { listCurrentBuyerVerificationDocuments } from "./buyer-documents";

const document = {
  id: "test-document",
  documentType: "PRE_APPROVAL",
  originalFilename: "test-letter.pdf",
  createdAt: new Date("2026-09-29T09:30:00Z"),
  reviewStatus: "PENDING",
  rejectionReason: null,
};

describe("current buyer's submitted verification documents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ id: "current-buyer", roles: ["BUYER"] });
    mocks.findMany.mockResolvedValue([document]);
  });

  it("rejects signed-out and inactive sessions before querying documents", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(listCurrentBuyerVerificationDocuments()).rejects.toThrow("redirect:/login?next=%2Fbuyer%2Fbadges");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it.each([["SELLER"], ["ADMIN"], ["SELLER", "ADMIN"]])("requires the buyer role even for %j", async (...roles) => {
    mocks.session.mockResolvedValue({ id: "not-a-buyer", roles });
    await expect(listCurrentBuyerVerificationDocuments()).rejects.toThrow("redirect:");
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("requires both document and buyer-profile ownership, even for an admin buyer", async () => {
    mocks.session.mockResolvedValue({ id: "current-buyer", roles: ["BUYER", "ADMIN"] });
    await listCurrentBuyerVerificationDocuments();
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        userId: "current-buyer",
        buyerProfile: { userId: "current-buyer" },
        propertyId: null,
        documentType: { in: ["PRE_APPROVAL", "VERIFIED_FUNDS", "IDENTITY"] },
      },
      select: {
        id: true,
        documentType: true,
        originalFilename: true,
        createdAt: true,
        reviewStatus: true,
        rejectionReason: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
  });

  it("serializes only owner-visible fields, never private metadata or Storage access", async () => {
    mocks.findMany.mockResolvedValue([{
      ...document,
      reviewStatus: "REJECTED",
      rejectionReason: "The letter is no longer current. Please upload a recent one.",
      storageBucket: "verification-documents",
      storagePath: "private/path.pdf",
      signedUrl: "https://private.invalid/token",
      fileSha256: "private-hash",
      userId: "current-buyer",
      reviewNotes: "Private admin notes",
      reviewChecklist: { internal: true },
      reviewedByUserId: "admin-id",
    }]);
    expect(await listCurrentBuyerVerificationDocuments()).toEqual([{
      id: document.id,
      documentType: "PRE_APPROVAL",
      originalFilename: document.originalFilename,
      createdAt: "2026-09-29T09:30:00.000Z",
      reviewStatus: "REJECTED",
      rejectionReason: "The letter is no longer current. Please upload a recent one.",
    }]);
  });

  it.each(["PENDING", "APPROVED"])("does not expose stale rejection reasons for %s evidence", async (reviewStatus) => {
    mocks.findMany.mockResolvedValue([{ ...document, reviewStatus, rejectionReason: "Old reason" }]);
    expect((await listCurrentBuyerVerificationDocuments())[0].rejectionReason).toBeNull();
  });

  it("keeps unsupported evidence types outside the output contract", async () => {
    mocks.findMany.mockResolvedValue([{ ...document, documentType: "OWNERSHIP" }, { ...document, documentType: "OTHER" }]);
    expect(await listCurrentBuyerVerificationDocuments()).toEqual([]);
  });

  it("returns an empty list when the current buyer has no submitted documents", async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(await listCurrentBuyerVerificationDocuments()).toEqual([]);
  });
});
