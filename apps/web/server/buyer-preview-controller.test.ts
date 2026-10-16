import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchBuyersSchema } from "@liber/validators";

const mocks = vi.hoisted(() => ({
  demoAuditRows: vi.fn(),
  findMany: vi.fn(),
  fixtureProfiles: vi.fn(),
  queryIds: vi.fn(),
  testPreapprovalIds: vi.fn(),
}));

vi.mock("@liber/db", () => ({
  prisma: {
    adminAuditLog: { findMany: mocks.demoAuditRows },
    buyerProfile: { findMany: (query: { where: { user?: { email?: string } } }) => query.where.user?.email ? mocks.fixtureProfiles(query) : mocks.findMany(query) },
  },
}));
vi.mock("./seller-search-query", async (importOriginal) => ({
  ...await importOriginal<typeof import("./seller-search-query")>(),
  querySellerSearchIds: mocks.queryIds,
}));
vi.mock("./test-preapproval", () => ({ activeTestPreapprovalProfileIds: mocks.testPreapprovalIds }));

import { searchDemandPreviews } from "./buyer-preview";
import { SellerSearchCursorError } from "./seller-search-query";
import { avatarVariantFromSeed } from "../lib/avatar-variant";
import { publicNameForDisplay } from "./public-identity";

const filters = (input: Record<string, unknown> = {}) => searchBuyersSchema.parse({ market: "los-angeles", ...input });
const idPage = (ids: string[], extra: Record<string, unknown> = {}) => ({
  hasMore: false,
  ids,
  nextCursor: null,
  pageSize: 24,
  snapshotAt: new Date().toISOString(),
  ...extra,
});

const previewProfileRow = {
  id: "buyer-profile-public-id",
  userId: "11111111-1111-1111-1111-111111111111",
  displayName: "Maple Haven",
  badges: [{ badgeType: "PRE_APPROVED" }],
  budgetMax: 950_000,
  budgetMin: 700_000,
  buyerType: "Conventional financing",
  buyingPurpose: "House",
  criteria: [{
    bathroomsMin: 2,
    bedroomsMin: 3,
    condition: "Move-in ready",
    features: ["Garage"],
    squareFeetMin: 1_600,
  }],
  desiredServiceAreas: [{
    serviceArea: {
      active: true,
      centerLat: 34.1467,
      centerLng: -118.433314,
      city: "Sherman Oaks",
      label: "Sherman Oaks",
      market: { active: true },
      state: "CA",
      type: "neighborhood",
    },
  }],
  user: { avatarVariant: "avatarka:animals:7", name: "  Julie   PrivateSurname  ", status: "ACTIVE" },
  visibilityStatus: "ACTIVE",
};

describe("public buyer preview controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([previewProfileRow]);
    mocks.demoAuditRows.mockResolvedValue([]);
    mocks.fixtureProfiles.mockResolvedValue([]);
    mocks.queryIds.mockResolvedValue(idPage([previewProfileRow.id]));
    mocks.testPreapprovalIds.mockResolvedValue(new Set());
  });

  it("queries through the narrow projection and serializes only preview-safe fields", async () => {
    const { items: previews } = await searchDemandPreviews(filters());
    const query = mocks.findMany.mock.calls[0]?.[0];

    expect(query).toMatchObject({
      where: {
        id: { in: [previewProfileRow.id] },
        user: { status: "ACTIVE" },
        visibilityStatus: "ACTIVE",
      },
    });
    expect(query.select).toMatchObject({
      id: true,
      userId: true,
      displayName: true,
      budgetMax: true,
      budgetMin: true,
    });
    expect(query.select.user).toEqual({ select: { avatarVariant: true, name: true } });
    expect(query.where.userId).toBeUndefined();
    expect(JSON.stringify(query.select)).not.toMatch(
      /desiredLat|desiredLng|email|storagePath|serviceAreaId/,
    );

    const serialized = JSON.parse(JSON.stringify(previews));
    expect(serialized).toEqual([{
      alias: publicNameForDisplay("Julie PrivateSurname", previewProfileRow.userId),
      amenities: ["Garage"],
      area: "Sherman Oaks, CA",
      avatarVariant: "avatarka:animals:7",
      badges: ["Pre-approved"],
      bathroomsMin: 2,
      bedroomsMin: 3,
      budgetLabel: "$700K–$950K",
      condition: "Move-in ready",
      label: "House",
      pin: { latitude: 34.1467, longitude: -118.433314 },
      squareFeetMin: 1_600,
    }]);
    expect(JSON.stringify(serialized)).not.toContain("buyer-profile-public-id");
    expect(JSON.stringify(serialized)).not.toContain(previewProfileRow.userId);
    expect(JSON.stringify(serialized)).not.toContain("PrivateSurname");
    expect(previews[0].alias).toMatch(/^Julie P\. #[A-F0-9]{12}$/);
    expectNoForbiddenFields(serialized);
  });

  it("caps guests at the teaser size with no cursor while reporting that more match", async () => {
    mocks.queryIds.mockResolvedValue(idPage([previewProfileRow.id], { hasMore: true, nextCursor: "guest-cursor" }));
    const page = await searchDemandPreviews(filters({ cursor: "ignored-for-guests", pageSize: 50 }));
    const [, guestFilters, , , viewer] = mocks.queryIds.mock.calls[0];

    expect(guestFilters).toMatchObject({ cursor: undefined, pageSize: 4 });
    expect(viewer).toBeUndefined();
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBeNull();
  });

  it("applies the seller search filters and blocks for a signed-in viewer and excludes their own profile", async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 6 }, () => previewProfileRow));
    mocks.queryIds.mockResolvedValue(idPage(Array.from({ length: 6 }, () => previewProfileRow.id), { hasMore: true, nextCursor: "next-page" }));
    const applied = filters({ amenities: ["Garage"], bedrooms: "3", budgetMax: "1000000", serviceArea: "sherman-oaks" });
    const page = await searchDemandPreviews(applied, "viewer-user-id");
    const [, viewerFilters, , , viewer] = mocks.queryIds.mock.calls[0];
    const query = mocks.findMany.mock.calls[0]?.[0];

    expect(viewerFilters).toEqual(applied);
    expect(viewer).toBe("viewer-user-id");
    expect(query.take).toBeUndefined();
    expect(query.where.userId).toEqual({ not: "viewer-user-id" });
    expect(page.nextCursor).toBe("next-page");
    expect(page.items).toHaveLength(6);
    expect(JSON.stringify(page)).not.toContain(previewProfileRow.userId);
    expectNoForbiddenFields(JSON.parse(JSON.stringify(page.items)));
  });

  it("keeps the search order rather than the database row order", async () => {
    const second = { ...previewProfileRow, id: "second-profile", user: { ...previewProfileRow.user, name: "Zed Second" } };
    mocks.findMany.mockResolvedValue([previewProfileRow, second]);
    mocks.queryIds.mockResolvedValue(idPage(["second-profile", previewProfileRow.id]));
    const { items } = await searchDemandPreviews(filters(), "viewer-user-id");
    expect(items.map((item) => item.alias.split(" ")[0])).toEqual(["Zed", "Julie"]);
  });

  it("rethrows stale cursors so the page can drop them, and degrades other failures to an empty page", async () => {
    mocks.queryIds.mockRejectedValueOnce(new SellerSearchCursorError());
    await expect(searchDemandPreviews(filters({ cursor: "stale" }), "viewer-user-id")).rejects.toBeInstanceOf(SellerSearchCursorError);

    mocks.queryIds.mockRejectedValueOnce(new Error("database unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(searchDemandPreviews(filters())).resolves.toEqual({ hasMore: false, items: [], nextCursor: null });
    error.mockRestore();
  });

  it("labels a test marker separately from verified pre-approval without exposing audit or profile identifiers", async () => {
    mocks.findMany.mockResolvedValue([{ ...previewProfileRow, badges: [] }]);
    mocks.testPreapprovalIds.mockResolvedValue(new Set([previewProfileRow.id]));
    const { items: previews } = await searchDemandPreviews(filters());
    expect(mocks.testPreapprovalIds).toHaveBeenCalledTimes(1);
    expect(mocks.testPreapprovalIds).toHaveBeenCalledWith(expect.anything(), [previewProfileRow.id]);
    expect(previews[0].badges).toEqual(["Test pre-approval — not verified"]);
    expect(JSON.stringify(previews)).not.toContain(previewProfileRow.id);
    expect(JSON.stringify(previews)).not.toContain(previewProfileRow.userId);
    expectNoForbiddenFields(previews);
  });

  it("normalizes stale public identity fields without leaking the profile id", async () => {
    const profileId = "legacy-profile-private-id";
    const alias = publicNameForDisplay(null, previewProfileRow.userId);
    mocks.findMany.mockResolvedValue([{
      ...previewProfileRow,
      displayName: "Julie P.",
      id: profileId,
      user: { avatarVariant: "https://example.test/avatar.png", name: null, status: "ACTIVE" },
    }]);
    mocks.queryIds.mockResolvedValue(idPage([profileId]));

    const { items: [preview] } = await searchDemandPreviews(filters());
    const serialized = JSON.stringify(preview);

    expect(preview.alias).toBe(alias);
    expect(preview.avatarVariant).toBe(avatarVariantFromSeed(profileId));
    expect(serialized).not.toContain("Julie P.");
    expect(serialized).not.toContain(profileId);
    expectNoForbiddenFields(preview);
  });

  it.each(["Move-in ready", "Mild fixer", "Fixer"])("preserves the approved %s condition label", async (condition) => {
    mocks.findMany.mockResolvedValue([{
      ...previewProfileRow,
      criteria: [{ ...previewProfileRow.criteria[0], condition }],
    }]);

    const { items: [preview] } = await searchDemandPreviews(filters());
    expect(preview.condition).toBe(condition);
  });

  it.each([undefined, "viewer-user-id"])("omits arbitrary condition text for preview audience %s", async (viewerUserId) => {
    const unapprovedText = "PRIVATE_FREE_TEXT_MARKER";
    mocks.findMany.mockResolvedValue([{
      ...previewProfileRow,
      criteria: [{ ...previewProfileRow.criteria[0], condition: unapprovedText }],
    }]);

    const { items: [preview] } = await searchDemandPreviews(filters(), viewerUserId);
    expect(preview.condition).toBeUndefined();
    expect(JSON.stringify(preview)).not.toContain(unapprovedText);
    expect(preview.amenities).toEqual(["Garage"]);
  });

  it("adds a truthful demo label without disclosing the fixture email or profile ID", async () => {
    mocks.fixtureProfiles.mockResolvedValue([{ id: previewProfileRow.id }]);
    const { items: previews } = await searchDemandPreviews(filters());
    expect(previews[0].badges).toEqual(["Demo buyer", "Pre-approved"]);
    expect(JSON.stringify(previews)).not.toContain(previewProfileRow.id);
    expectNoForbiddenFields(previews);
  });

  it("labels buyers seeded by the demo tooling, checking only the profiles on this page", async () => {
    const seeded = { ...previewProfileRow, badges: [], id: "seeded-demo-profile", user: { ...previewProfileRow.user, name: "Liber Demo Buyer Alpha" } };
    mocks.findMany.mockResolvedValue([seeded, previewProfileRow]);
    mocks.queryIds.mockResolvedValue(idPage([seeded.id, previewProfileRow.id]));
    mocks.demoAuditRows.mockResolvedValue([{ targetId: seeded.id }]);

    const { items: previews } = await searchDemandPreviews(filters());

    expect(mocks.demoAuditRows).toHaveBeenCalledWith({
      select: { targetId: true },
      where: { action: "seed_demo_buyer", targetId: { in: [seeded.id, previewProfileRow.id] }, targetType: "buyer_profile" },
    });
    expect(previews.map((preview) => preview.badges)).toEqual([["Demo buyer"], ["Pre-approved"]]);
    expect(JSON.stringify(previews)).not.toContain(seeded.id);
    expectNoForbiddenFields(previews);
  });

  it("never lets trust badges crowd out the demo label", async () => {
    mocks.findMany.mockResolvedValue([{
      ...previewProfileRow,
      badges: [{ badgeType: "PRE_APPROVED" }, { badgeType: "VERIFIED_FUNDS" }, { badgeType: "VERIFIED_IDENTITY" }],
      buyerType: "Cash",
    }]);
    mocks.demoAuditRows.mockResolvedValue([{ targetId: previewProfileRow.id }]);

    const { items: [preview] } = await searchDemandPreviews(filters());

    expect(preview.badges[0]).toBe("Demo buyer");
  });

  it("skips the demo lookup when no previews match", async () => {
    mocks.queryIds.mockResolvedValue(idPage([]));
    await expect(searchDemandPreviews(filters())).resolves.toEqual({ hasMore: false, items: [], nextCursor: null });
    expect(mocks.demoAuditRows).not.toHaveBeenCalled();
  });
});

const forbiddenKeys = new Set([
  "id",
  "buyerProfileId",
  "avatarSeed",
  "userId",
  "name",
  "displayName",
  "email",
  "phone",
  "bio",
  "criteriaId",
  "serviceAreaId",
  "desiredLat",
  "desiredLng",
  "lat",
  "lng",
  "centerLat",
  "centerLng",
  "documents",
  "storagePath",
]);

function expectNoForbiddenFields(value: unknown, location = "response") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectNoForbiddenFields(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nestedValue] of Object.entries(value)) {
    expect(forbiddenKeys.has(key), `${location}.${key} is forbidden`).toBe(false);
    expectNoForbiddenFields(nestedValue, `${location}.${key}`);
  }
}
