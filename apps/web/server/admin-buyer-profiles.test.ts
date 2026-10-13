import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(), buyers: vi.fn(), documents: vi.fn(), syntheticProfiles: vi.fn(), testPreapprovalIds: vi.fn(),
}));
vi.mock("@liber/db", async () => ({
  Prisma: (await import("../../../packages/db/src/generated/client")).Prisma,
  prisma: { buyerProfile: { findMany: mocks.buyers }, verificationDocument: { findMany: mocks.documents } },
}));
vi.mock("./session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("./test-preapproval", () => ({ activeTestPreapprovalProfileIds: mocks.testPreapprovalIds }));
vi.mock("./synthetic-property-review", async (importOriginal) => ({
  ...await importOriginal<typeof import("./synthetic-property-review")>(),
  syntheticJourneyBuyerProfileIds: mocks.syntheticProfiles,
}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { listAdminBuyerProfiles } from "./contracts";
import { getPublicBuyerPreviews } from "./buyer-preview";
import { sellerBuyerSelect, sellerBuyerSummary, type SellerBuyerRow } from "./buyer/read-models";
import { publicNameForDisplay } from "./public-identity";

const buyer = {
  id: "buyer-first", userId: "11111111-1111-4111-8111-111111111111", displayName: "Maple Haven",
  badges: [], criteria: [], bio: null, budgetMin: 700000, budgetMax: 900000,
  buyerType: "Cash", buyingPurpose: "House", downPaymentMin: 200000, downPaymentMax: 300000,
  lastRefreshedAt: null, updatedAt: new Date("2026-09-29T00:00:00Z"), visibilityStatus: "ACTIVE",
  user: { avatarVariant: "avatarka:animals:7", name: "Private Buyer One", email: "private-buyer-one@example.com" },
  desiredServiceAreas: [{
    isPrimary: true, source: "SELECTED",
    serviceArea: {
      id: "area-fixture", active: true, centerLat: 34.2, centerLng: -118.5,
      city: "Northridge", label: "91325", market: { active: true, slug: "los-angeles" },
      postalCode: "91325", slug: "91325", state: "CA", type: "zip",
    },
  }],
};
const secondBuyer = {
  ...buyer, id: "buyer-second", userId: "22222222-2222-4222-8222-222222222222", displayName: "Laurel Hearth",
  user: { ...buyer.user, name: "Private Buyer Two", email: "private-buyer-two@example.com" },
};
const firstDocument = {
  id: "document-first", buyerProfileId: buyer.id, documentType: "PRE_APPROVAL",
  fileSha256: null, originalFilename: "preapproval-fixture.pdf",
};
const secondDocument = {
  ...firstDocument, id: "document-second", buyerProfileId: secondBuyer.id, documentType: "VERIFIED_FUNDS",
};

describe("admin buyer identity projection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "admin-fixture", roles: ["ADMIN"] });
    mocks.buyers.mockResolvedValue([buyer, secondBuyer]);
    mocks.documents.mockResolvedValue([firstDocument, secondDocument]);
    mocks.syntheticProfiles.mockResolvedValue(new Set());
    mocks.testPreapprovalIds.mockResolvedValue(new Set());
  });

  it.each([{ roles: null }, { roles: ["BUYER"] }, { roles: ["SELLER"] }, { roles: ["BUYER", "SELLER"] }])("blocks a non-admin session (%j) before querying account identity or evidence", async ({ roles }) => {
    mocks.getSessionUser.mockResolvedValue(roles ? { id: "non-admin-fixture", roles } : null);
    await expect(listAdminBuyerProfiles()).rejects.toThrow("redirect:");
    expect(mocks.buyers).not.toHaveBeenCalled();
    expect(mocks.documents).not.toHaveBeenCalled();
    expect(mocks.testPreapprovalIds).not.toHaveBeenCalled();
  });

  it("selects account identity only after admin authorization and keeps each buyer's evidence separate", async () => {
    const result = await listAdminBuyerProfiles();
    expect(mocks.getSessionUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.buyers.mock.invocationCallOrder[0]);
    expect(mocks.getSessionUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.documents.mock.invocationCallOrder[0]);
    expect(mocks.buyers).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ user: { select: { avatarVariant: true, name: true, email: true } } }),
    }));
    expect(mocks.documents).toHaveBeenCalledWith({
      where: { buyerProfileId: { not: null }, reviewStatus: "APPROVED" },
      orderBy: { reviewedAt: "desc" },
      select: { documentType: true, fileSha256: true, id: true, buyerProfileId: true, originalFilename: true },
    });
    expect(result.data).toEqual([
      expect.objectContaining({ id: buyer.id, name: publicNameForDisplay(buyer.user.name, buyer.userId), accountName: buyer.user.name,
        accountEmail: buyer.user.email, approvedDocuments: [firstDocument] }),
      expect.objectContaining({ id: secondBuyer.id, accountName: secondBuyer.user.name,
        accountEmail: secondBuyer.user.email, approvedDocuments: [secondDocument] }),
    ]);
    expect(result.data[0]).not.toHaveProperty("user");
    expect(JSON.stringify(result.data[0].approvedDocuments)).not.toContain(secondDocument.id);
  });

  it("returns an empty approved-evidence list when none belongs to the listed buyer", async () => {
    mocks.buyers.mockResolvedValue([buyer]);
    mocks.documents.mockResolvedValue([secondDocument, { ...firstDocument, id: "unscoped", buyerProfileId: null }]);
    const result = await listAdminBuyerProfiles();
    expect(result.data[0].approvedDocuments).toEqual([]);
  });

  it("decorates only the marked buyer after one scoped test-marker read without creating evidence", async () => {
    mocks.testPreapprovalIds.mockResolvedValue(new Set([buyer.id]));
    const result = await listAdminBuyerProfiles();
    expect(mocks.testPreapprovalIds).toHaveBeenCalledTimes(1);
    expect(mocks.testPreapprovalIds).toHaveBeenCalledWith(expect.anything(), [buyer.id, secondBuyer.id]);
    expect(result.data[0].badges).toContainEqual(expect.objectContaining({ type: "TEST_PRE_APPROVED", label: "Test pre-approval — not verified" }));
    expect(result.data[1].badges).toEqual([]);
    expect(result.data[0].approvedDocuments).toEqual([firstDocument]);
    expect(result.data[0].badges.some((badge) => badge.type === "PRE_APPROVED")).toBe(false);
  });

  it("keeps full account names and email out of the public preview even if an over-broad mock row contains them", async () => {
    mocks.buyers.mockResolvedValue([buyer]);
    const result = await getPublicBuyerPreviews("los-angeles");
    expect(result).toHaveLength(1);
    expect(mocks.buyers.mock.calls[0][0].select.user).toEqual({ select: { avatarVariant: true, name: true } });
    const serialized = JSON.stringify(result);
    for (const value of [buyer.user.name, buyer.user.email, buyer.userId, "accountName", "accountEmail", "approvedDocuments"]) {
      expect(serialized).not.toContain(value);
    }
    expect(result[0].alias).toBe(publicNameForDisplay(buyer.user.name, buyer.userId));
  });

  it("keeps the seller directory projection and DTO free of private account identity", () => {
    expect(sellerBuyerSelect().user).toEqual({ select: { avatarVariant: true, name: true } });
    const result = sellerBuyerSummary(buyer as unknown as SellerBuyerRow, "different-seller");
    const serialized = JSON.stringify(result);
    for (const value of [buyer.user.name, buyer.user.email, buyer.userId, "accountName", "accountEmail", "approvedDocuments"]) {
      expect(serialized).not.toContain(value);
    }
    expect(result.name).toBe(publicNameForDisplay(buyer.user.name, buyer.userId));
  });
});
