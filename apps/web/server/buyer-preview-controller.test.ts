import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceAreaResult } from "./service-areas";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  fixtureProfiles: vi.fn(),
  getSearchCoverageServiceAreaIds: vi.fn(),
  testPreapprovalIds: vi.fn(),
}));

vi.mock("@liber/db", () => ({
  prisma: { buyerProfile: { findMany: (query: { where: { user?: { email?: string } } }) => query.where.user?.email ? mocks.fixtureProfiles(query) : mocks.findMany(query) } },
}));

vi.mock("./service-areas", () => ({
  getSearchCoverageServiceAreaIds: mocks.getSearchCoverageServiceAreaIds,
}));
vi.mock("./test-preapproval", () => ({ activeTestPreapprovalProfileIds: mocks.testPreapprovalIds }));

import { getPublicBuyerPreviews } from "./buyer-preview";
import { avatarVariantFromSeed } from "../lib/avatar-variant";
import { publicNameForDisplay } from "./public-identity";

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
    mocks.fixtureProfiles.mockResolvedValue([]);
    mocks.testPreapprovalIds.mockResolvedValue(new Set());
  });

  it("queries through the narrow projection and serializes only preview-safe fields", async () => {
    const previews = await getPublicBuyerPreviews("los-angeles");
    const query = mocks.findMany.mock.calls[0]?.[0];

    expect(query).toMatchObject({
      orderBy: { lastRefreshedAt: "desc" },
      take: 4,
      where: {
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
      budgetLabel: "$700K\u2013$950K",
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

  it("labels a test marker separately from verified pre-approval without exposing audit or profile identifiers", async () => {
    mocks.findMany.mockResolvedValue([{ ...previewProfileRow, badges: [] }]);
    mocks.testPreapprovalIds.mockResolvedValue(new Set([previewProfileRow.id]));
    const previews = await getPublicBuyerPreviews("los-angeles");
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

    const [preview] = await getPublicBuyerPreviews("los-angeles");
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

    const [preview] = await getPublicBuyerPreviews("los-angeles");
    expect(preview.condition).toBe(condition);
  });

  it.each([undefined, "viewer-user-id"])("omits arbitrary condition text for preview audience %s", async (viewerUserId) => {
    const unapprovedText = "PRIVATE_FREE_TEXT_MARKER";
    mocks.findMany.mockResolvedValue([{
      ...previewProfileRow,
      criteria: [{ ...previewProfileRow.criteria[0], condition: unapprovedText }],
    }]);

    const [preview] = await getPublicBuyerPreviews("los-angeles", null, viewerUserId);
    expect(preview.condition).toBeUndefined();
    expect(JSON.stringify(preview)).not.toContain(unapprovedText);
    expect(preview.amenities).toEqual(["Garage"]);
  });

  it("adds a truthful demo label without disclosing the fixture email or profile ID", async () => {
    mocks.fixtureProfiles.mockResolvedValue([{ id: previewProfileRow.id }]);
    const previews = await getPublicBuyerPreviews("los-angeles");
    expect(previews[0].badges).toEqual(["Demo buyer", "Pre-approved"]);
    expect(JSON.stringify(previews)).not.toContain(previewProfileRow.id);
    expectNoForbiddenFields(previews);
  });

  it("returns every eligible privacy-safe preview after sign-in while excluding the viewer", async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 6 }, () => previewProfileRow));
    const previews = await getPublicBuyerPreviews("los-angeles", null, "viewer-user-id");
    const query = mocks.findMany.mock.calls[0]?.[0];

    expect(query.take).toBeUndefined();
    expect(query.where.userId).toEqual({ not: "viewer-user-id" });
    expect(query.select.userId).toBe(true);
    expect(JSON.stringify(previews)).not.toContain(previewProfileRow.userId);
    expect(previews).toHaveLength(6);
    expectNoForbiddenFields(JSON.parse(JSON.stringify(previews)));
  });

  it("uses selected-area coverage in the Prisma predicate without serializing its ID", async () => {
    mocks.getSearchCoverageServiceAreaIds.mockResolvedValue(["area-a", "area-b"]);
    const selectedArea = {
      active: true,
      bbox: [-118.5, 34.1, -118.3, 34.2],
      center: { lat: 34.15, lng: -118.4 },
      city: "Sherman Oaks",
      county: "Los Angeles County",
      disclaimer: "Approximate service area.",
      geojsonPath: "/geo/service-areas/sherman-oaks.geojson",
      id: "selected-area-id",
      isPilot: false,
      label: "Sherman Oaks",
      marketSlug: "los-angeles",
      postalCode: null,
      slug: "sherman-oaks",
      source: "test",
      sourceVersion: "2026",
      state: "CA",
      type: "neighborhood",
    } satisfies ServiceAreaResult;

    const previews = await getPublicBuyerPreviews("los-angeles", selectedArea);
    const query = mocks.findMany.mock.calls[0]?.[0];

    expect(mocks.getSearchCoverageServiceAreaIds).toHaveBeenCalledWith(
      "selected-area-id",
      "los-angeles",
    );
    expect(query.where.desiredServiceAreas.some.serviceAreaId).toEqual({
      in: ["area-a", "area-b"],
    });
    expect(JSON.stringify(previews)).not.toContain("selected-area-id");
    expect(previews[0].pin).toEqual({ latitude: 34.1467, longitude: -118.433314 });
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
