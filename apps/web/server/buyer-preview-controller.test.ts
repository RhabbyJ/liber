import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceAreaResult } from "./service-areas";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getSearchCoverageServiceAreaIds: vi.fn(),
}));

vi.mock("@liber/db", () => ({
  prisma: { buyerProfile: { findMany: mocks.findMany } },
}));

vi.mock("./service-areas", () => ({
  getSearchCoverageServiceAreaIds: mocks.getSearchCoverageServiceAreaIds,
}));

import { getPublicBuyerPreviews } from "./buyer-preview";
import { avatarVariantFromSeed } from "../lib/avatar-variant";
import { buyerAliasFromSeed } from "../lib/buyer-alias";

const previewProfileRow = {
  id: "buyer-profile-public-id",
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
  user: { avatarVariant: "avatarka:animals:7", status: "ACTIVE" },
  visibilityStatus: "ACTIVE",
};

describe("public buyer preview controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([previewProfileRow]);
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
      displayName: true,
      budgetMax: true,
      budgetMin: true,
    });
    expect(query.select.user).toEqual({ select: { avatarVariant: true } });
    expect(query.where.userId).toBeUndefined();
    expect(JSON.stringify(query.select)).not.toMatch(
      /desiredLat|desiredLng|email|storagePath|userId|serviceAreaId/,
    );

    const serialized = JSON.parse(JSON.stringify(previews));
    expect(serialized).toEqual([{
      alias: "Maple Haven",
      amenities: ["Garage"],
      area: "Sherman Oaks, CA",
      avatarVariant: "avatarka:animals:7",
      badges: ["Pre-approved"],
      bathroomsMin: 2,
      bedroomsMin: 3,
      budgetLabel: "$700K\u2013$950K",
      condition: "Move-in ready",
      label: "House",
      pin: { latitude: 34.1467, longitude: -118.425314 },
      squareFeetMin: 1_600,
    }]);
    expect(JSON.stringify(serialized)).not.toContain("buyer-profile-public-id");
    expectNoForbiddenFields(serialized);
  });

  it("normalizes stale public identity fields without leaking the profile id", async () => {
    const profileId = "legacy-profile-private-id";
    const alias = buyerAliasFromSeed(profileId);
    mocks.findMany.mockResolvedValue([{
      ...previewProfileRow,
      displayName: "Julie P.",
      id: profileId,
      user: { avatarVariant: "https://example.test/avatar.png", status: "ACTIVE" },
    }]);

    const [preview] = await getPublicBuyerPreviews("los-angeles");
    const serialized = JSON.stringify(preview);

    expect(preview.alias).toBe(alias);
    expect(preview.avatarVariant).toBe(avatarVariantFromSeed(alias));
    expect(serialized).not.toContain("Julie P.");
    expect(serialized).not.toContain(profileId);
    expectNoForbiddenFields(preview);
  });

  it("returns every eligible privacy-safe preview after sign-in while excluding the viewer", async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 6 }, () => previewProfileRow));
    const previews = await getPublicBuyerPreviews("los-angeles", null, "viewer-user-id");
    const query = mocks.findMany.mock.calls[0]?.[0];

    expect(query.take).toBeUndefined();
    expect(query.where.userId).toEqual({ not: "viewer-user-id" });
    expect(JSON.stringify(query.select)).not.toContain("userId");
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
