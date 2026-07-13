import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
describe("public buyer preview service-area filters", () => {
  it("matches only canonical selected service-area UUIDs in the active market", async () => {
    process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/liber_test";
    const { serviceAreaPreviewWhere } = await import("./buyer-preview");
    expect(serviceAreaPreviewWhere(["area-91604"], "los-angeles")).toEqual({
      desiredServiceAreas: {
        some: {
          isPrimary: true,
          source: "SELECTED",
          serviceAreaId: { in: ["area-91604"] },
          serviceArea: { active: true, market: { active: true, slug: "los-angeles" } },
        },
      },
    });
  });

  it("keeps more than four same-area preview pins visually distinct", async () => {
    process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/liber_test";
    const { approximatePreviewPoint } = await import("./buyer-preview");
    const center = { lat: 34.15, lng: -118.4 };
    const points = Array.from({ length: 5 }, (_, index) => approximatePreviewPoint(center, index, 5));

    expect(new Set(points.map((point) => JSON.stringify(point))).size).toBe(5);
  });

  it("wires only the validated server session UUID into the homepage preview query", () => {
    const homepage = readFileSync(path.resolve("app/page.tsx"), "utf8");

    expect(homepage).toContain("const user = await getSessionUser();");
    expect(homepage).toContain("getPublicBuyerPreviews(market.slug, selectedServiceArea, user?.id)");
    expect(homepage).toContain("isSignedIn={Boolean(user)}");
    expect(homepage).toContain("if (isSignedIn) return null;");
  });
});
