import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  profile: vi.fn(),
  account: vi.fn(),
  testPreapprovals: vi.fn(),
}));

vi.mock("@liber/db", () => ({
  prisma: { buyerProfile: { findUnique: mocks.profile }, user: { findUnique: mocks.account } },
}));
vi.mock("../session", async () => (await import("../session-mock.test-helper")).sessionModuleMock(mocks.session));
vi.mock("../test-preapproval", () => ({ activeTestPreapprovalProfileIds: mocks.testPreapprovals }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { getCurrentBuyerProfile } from "./buyer-profile";

const userId = "11111111-1111-4111-8111-111111111111";
const serviceArea = {
  active: true, centerLat: 34.2, centerLng: -118.5, city: "Northridge", id: "area-1", label: "91325",
  market: { active: true, slug: "los-angeles" }, postalCode: "91325", slug: "91325", state: "CA", type: "zip",
};
const savedProfile = (visibilityStatus: string, overrides: Record<string, unknown> = {}) => ({
  badges: [], bio: null, budgetMax: 900000, budgetMin: 700000, buyerType: "Cash", buyingPurpose: "House",
  criteria: [{
    bathroomsMin: null, bedroomsMin: 3, condition: null, features: [], id: "criteria-1", lotSizeMax: null, lotSizeMin: null,
    priceMax: 900000, priceMin: 700000, propertyCategory: "HOME", propertySubtype: "HOME", squareFeetMax: null, squareFeetMin: null, yearBuiltMin: null,
  }],
  desiredServiceAreas: [{ isPrimary: true, serviceArea, source: "SELECTED" }],
  displayName: "Synthetic", downPaymentMax: null, downPaymentMin: null, id: "buyer-profile-1",
  lastRefreshedAt: null, updatedAt: new Date("2026-10-01T00:00:00Z"), user: { avatarVariant: null, name: "Synthetic Buyer" },
  userId, visibilityStatus, ...overrides,
});

describe("owner buyer profile read", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ id: userId, name: "Synthetic Buyer", roles: ["BUYER"] });
    mocks.account.mockResolvedValue({ avatarVariant: null, name: "Synthetic Buyer" });
    mocks.testPreapprovals.mockResolvedValue(new Set());
  });

  it("marks a complete saved draft as paused and republishable", async () => {
    mocks.profile.mockResolvedValue(savedProfile("DRAFT"));
    const { data } = await getCurrentBuyerProfile();
    expect(data).toMatchObject({ canRepublish: true, visibility: "draft" });
  });

  it.each([
    ["live", savedProfile("ACTIVE")],
    ["incomplete", savedProfile("DRAFT", { budgetMin: null })],
    ["out-of-area", savedProfile("DRAFT", { desiredServiceAreas: [] })],
    ["admin-hidden", savedProfile("HIDDEN")],
  ])("does not offer republish for a %s profile", async (_case, profile) => {
    mocks.profile.mockResolvedValue(profile);
    expect((await getCurrentBuyerProfile()).data.canRepublish).toBe(false);
  });

  it("does not offer republish before the first save", async () => {
    mocks.profile.mockResolvedValue(null);
    expect((await getCurrentBuyerProfile()).data).toMatchObject({ canRepublish: false, id: "new-profile" });
  });
});
