import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import type { SellerBuyerSummaryDTO } from "../../../../lib/buyer-dtos";

const mocks = vi.hoisted(() => ({
  canViewBuyerDirectory: vi.fn(),
  getSessionUser: vi.fn(),
  searchBuyers: vi.fn(),
}));

vi.mock("../../../../server/access", () => ({
  canViewBuyerDirectory: mocks.canViewBuyerDirectory,
}));

vi.mock("../../../../server/contracts", () => ({
  searchBuyers: mocks.searchBuyers,
}));

vi.mock("../../../../server/seller-search-query", () => ({
  SellerSearchCursorError: class SellerSearchCursorError extends Error {},
}));

vi.mock("../../../../server/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

import { GET } from "./route";

const ownBuyer = {
  id: "buyer-profile-owner",
  isDemo: false,
  avatarSeed: "Maple Haven",
  avatarVariant: "avatarka:animals:7",
  name: "Maple Haven",
  badges: [],
  budgetMax: 900_000,
  budgetMin: 700_000,
  canInvite: false,
  criteria: [],
  criteriaDetails: [],
  city: "Sherman Oaks",
  state: "CA",
  downPaymentMax: 250_000,
  downPaymentMin: 150_000,
  location: "Sherman Oaks, CA",
  marketSlug: "los-angeles",
  serviceAreaSlug: "sherman-oaks",
  lat: 34.1467,
  lng: -118.433314,
  purpose: "House",
  propertySubtypes: ["HOME"],
  type: "Conventional financing",
  visibility: "active",
  bio: "Seeking a house in the selected service area.",
  needs: [],
  wants: [],
  refreshedAt: "2026-07-09",
} satisfies SellerBuyerSummaryDTO;

describe("GET /api/seller/buyers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({
      email: "seller@example.test",
      id: "seller-user-id",
      roles: ["SELLER"],
    });
    mocks.canViewBuyerDirectory.mockResolvedValue(true);
    mocks.searchBuyers.mockResolvedValue({
      data: {
        items: [ownBuyer],
        pageInfo: {
          hasMore: false,
          nextCursor: null,
          pageSize: 24,
          snapshotAt: "2026-07-09T12:00:00.000Z",
        },
      },
      ok: true,
    });
  });

  it("serializes the seller-safe envelope and preserves non-invitable own demand", async () => {
    const response = await GET(new Request(
      "http://localhost/api/seller/buyers?market=los-angeles&serviceArea=sherman-oaks&bedrooms=3",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toEqual({
      items: [ownBuyer],
      pageInfo: {
        hasMore: false,
        nextCursor: null,
        pageSize: 24,
        snapshotAt: "2026-07-09T12:00:00.000Z",
      },
    });
    expect(body.items[0].canInvite).toBe(false);
    expect(body.items[0].id).toBe("buyer-profile-owner");
    expect(body.items[0].name).toBe("Maple Haven");
    expect(JSON.stringify(body)).not.toContain("seller-user-id");
    expectNoForbiddenFields(body);
    expect(mocks.searchBuyers).toHaveBeenCalledWith(expect.objectContaining({
      bedrooms: "3",
      market: "los-angeles",
      serviceArea: "sherman-oaks",
    }));
  });

  it("returns controlled authorization responses before querying buyers", async () => {
    mocks.getSessionUser.mockResolvedValueOnce(null);
    const unauthenticated = await GET(new Request("http://localhost/api/seller/buyers"));
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.searchBuyers).not.toHaveBeenCalled();

    mocks.getSessionUser.mockResolvedValueOnce({ id: "seller-user-id", roles: ["SELLER"] });
    mocks.canViewBuyerDirectory.mockResolvedValueOnce(false);
    const forbidden = await GET(new Request("http://localhost/api/seller/buyers"));
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.searchBuyers).not.toHaveBeenCalled();
  });

  it("does not serialize unexpected internal error details", async () => {
    const internalDetail = "INTERNAL_QUERY_DETAIL_DO_NOT_SERIALIZE";
    mocks.searchBuyers.mockRejectedValueOnce(new Error(internalDetail));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new Request("http://localhost/api/seller/buyers?market=los-angeles"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toEqual({ error: "Unable to search buyers.", items: [], pageInfo: null });
    expect(JSON.stringify(body)).not.toContain(internalDetail);
    expect(log).toHaveBeenCalledWith(
      "[seller-buyers-api] search failed",
      { name: "Error" },
    );
  });

  it("maps known rate-limit and validation failures to controlled responses", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.searchBuyers.mockRejectedValueOnce(new Error("Rate limit reached. Try again later."));
    const limited = await GET(new Request("http://localhost/api/seller/buyers?market=los-angeles"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("cache-control")).toBe("private, no-store");
    expect(await limited.json()).toEqual({
      error: "Too many buyer searches. Try again later.",
      items: [],
      pageInfo: null,
    });

    mocks.searchBuyers.mockRejectedValueOnce(new ZodError([]));
    const invalid = await GET(new Request("http://localhost/api/seller/buyers?market=los-angeles"));
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("cache-control")).toBe("private, no-store");
    expect(await invalid.json()).toEqual({
      error: "Invalid buyer search filters.",
      items: [],
      pageInfo: null,
    });
    expect(log).not.toHaveBeenCalled();
  });
});

const forbiddenKeys = new Set([
  "userId",
  "displayName",
  "email",
  "phone",
  "criteriaId",
  "serviceAreaId",
  "desiredLat",
  "desiredLng",
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
    if (key === "id") {
      expect(location, "Only the top-level buyer routing ID is permitted").toMatch(/^response\.items\[\d+\]$/);
    }
    expectNoForbiddenFields(nestedValue, `${location}.${key}`);
  }
}
