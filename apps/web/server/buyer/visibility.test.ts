import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  audit: vi.fn(),
  findProfile: vi.fn(),
  queryRaw: vi.fn(),
  session: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@liber/db", async () => {
  const { Prisma } = await import("../../../../packages/db/src/generated/client");
  return { Prisma, prisma: { $transaction: db.transaction } };
});
vi.mock("../session", async () => (await import("../session-mock.test-helper")).sessionModuleMock(db.session));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { Prisma } from "@liber/db";
import { BUYER_PROFILE_REQUIRED, setBuyerProfileVisibility } from "./commands";
import { publicationGap } from "./publication";

const userId = "11111111-1111-4111-8111-111111111111";
const owner = { roles: ["BUYER"], status: "ACTIVE" };
const area = { isPrimary: true, source: "SELECTED", serviceArea: { active: true, market: { active: true } } };
const complete = {
  budgetMax: 900000,
  budgetMin: 700000,
  buyerType: "Cash",
  buyingPurpose: "House",
  criteria: [{ id: "criteria-1" }],
  desiredServiceAreas: [area],
};
const profile = (visibilityStatus: string, overrides: Partial<typeof complete> = {}) => ({
  id: "buyer-profile-1", visibilityStatus, ...complete, ...overrides,
});

describe("buyer profile publication rules", () => {
  it("accepts a complete saved profile", () => {
    expect(publicationGap(complete)).toBeNull();
    expect(publicationGap({ ...complete, budgetMin: 0 })).toBeNull();
  });

  it.each([
    [{ buyerType: null }, "Purchase type and seeking property type are required before publishing."],
    [{ buyingPurpose: "" }, "Purchase type and seeking property type are required before publishing."],
    [{ budgetMax: null }, "Budget range is required before publishing."],
    [{ desiredServiceAreas: [] }, "Choose an active Liber service area before publishing your profile."],
    [{ desiredServiceAreas: [{ ...area, source: "DERIVED" }] }, "Choose an active Liber service area before publishing your profile."],
    [{ desiredServiceAreas: [{ ...area, serviceArea: { active: false, market: { active: true } } }] }, "Choose an active Liber service area before publishing your profile."],
    [{ desiredServiceAreas: [{ ...area, serviceArea: { active: true, market: { active: false } } }] }, "Choose an active Liber service area before publishing your profile."],
    [{ criteria: [] }, "Buyer criteria are required before publishing."],
  ])("reports the first unmet rule: %j", (change, message) => {
    expect(publicationGap({ ...complete, ...change } as typeof complete)).toBe(message);
  });
});

describe("buyer pause and republish", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.session.mockResolvedValue({ id: userId, roles: ["BUYER"] });
    db.queryRaw.mockResolvedValue([owner]);
    db.findProfile.mockResolvedValue(profile("ACTIVE"));
    db.transaction.mockImplementation(async (operation) => operation({
      $queryRaw: db.queryRaw,
      adminAuditLog: { create: db.audit },
      buyerProfile: { findUnique: db.findProfile, update: db.update },
    }));
  });

  it("requires a buyer session and accepts only DRAFT or ACTIVE", async () => {
    db.session.mockResolvedValue({ id: userId, roles: ["SELLER"] });
    await expect(setBuyerProfileVisibility({ visibilityStatus: "DRAFT" })).rejects.toThrow("redirect:/seller/properties");
    db.session.mockResolvedValue({ id: userId, roles: ["BUYER"] });
    await expect(setBuyerProfileVisibility({ visibilityStatus: "HIDDEN" })).rejects.toThrow();
    await expect(setBuyerProfileVisibility({ visibilityStatus: "SUSPENDED" })).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("pauses a live profile as a buyer-controlled draft under the owner and profile locks", async () => {
    const form = new FormData();
    form.set("visibilityStatus", "DRAFT");
    await expect(setBuyerProfileVisibility(form)).resolves.toEqual({ buyerProfileId: "buyer-profile-1", changed: true, visibilityStatus: "DRAFT" });
    const [ownerLock, ownerId] = db.queryRaw.mock.calls[0];
    expect(ownerLock.join("")).toContain('FROM public."User"');
    expect(ownerLock.join("")).toContain("FOR UPDATE");
    expect(ownerId).toBe(userId);
    expect(db.findProfile).toHaveBeenCalledWith(expect.objectContaining({ where: { userId } }));
    expect(db.queryRaw.mock.calls[1][0].join("")).toContain('FROM public."BuyerProfile"');
    expect(db.update).toHaveBeenCalledWith({ where: { id: "buyer-profile-1" }, data: { visibilityStatus: "DRAFT" } });
    expect(db.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "pause_buyer_profile", actorUserId: userId, targetId: "buyer-profile-1" }) });
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("republishes a complete paused profile and refreshes it", async () => {
    db.findProfile.mockResolvedValue(profile("DRAFT"));
    await expect(setBuyerProfileVisibility({ visibilityStatus: "ACTIVE" })).resolves.toMatchObject({ changed: true, visibilityStatus: "ACTIVE" });
    expect(db.update).toHaveBeenCalledWith({
      where: { id: "buyer-profile-1" }, data: { lastRefreshedAt: expect.any(Date), visibilityStatus: "ACTIVE" },
    });
    expect(db.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "republish_buyer_profile" }) });
  });

  it("refuses to republish a draft that no longer meets the publication rules", async () => {
    db.findProfile.mockResolvedValue(profile("DRAFT", { desiredServiceAreas: [{ ...area, serviceArea: { active: false, market: { active: true } } }] }));
    await expect(setBuyerProfileVisibility({ visibilityStatus: "ACTIVE" }))
      .rejects.toThrow("Choose an active Liber service area before publishing your profile.");
    expect(db.update).not.toHaveBeenCalled();
    expect(db.audit).not.toHaveBeenCalled();
  });

  it.each(["HIDDEN", "SUSPENDED"])("leaves an admin-controlled %s profile alone", async (visibilityStatus) => {
    db.findProfile.mockResolvedValue(profile(visibilityStatus));
    await expect(setBuyerProfileVisibility({ visibilityStatus: "ACTIVE" })).rejects.toThrow("controlled by admin review");
    await expect(setBuyerProfileVisibility({ visibilityStatus: "DRAFT" })).rejects.toThrow("controlled by admin review");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("treats the current visibility as a no-op", async () => {
    await expect(setBuyerProfileVisibility({ visibilityStatus: "ACTIVE" })).resolves.toMatchObject({ changed: false });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.audit).not.toHaveBeenCalled();
  });

  it("needs a saved profile and an active buyer account", async () => {
    db.findProfile.mockResolvedValue(null);
    await expect(setBuyerProfileVisibility({ visibilityStatus: "DRAFT" })).rejects.toThrow(BUYER_PROFILE_REQUIRED);
    db.queryRaw.mockResolvedValue([{ ...owner, status: "SUSPENDED" }]);
    await expect(setBuyerProfileVisibility({ visibilityStatus: "DRAFT" })).rejects.toThrow("Buyer account is no longer active or authorized.");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("retries a serialization conflict and rechecks the account", async () => {
    db.findProfile.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" }));
    await expect(setBuyerProfileVisibility({ visibilityStatus: "DRAFT" })).resolves.toMatchObject({ changed: true });
    expect(db.transaction).toHaveBeenCalledTimes(2);
  });
});
