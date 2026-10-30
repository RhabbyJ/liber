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

  it("keeps same-area preview pins anchored to canonical geography", async () => {
    process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/liber_test";
    const { approximatePreviewPoint } = await import("./buyer-preview");
    const center = { lat: 34.15, lng: -118.4 };
    const points = Array.from({ length: 5 }, () => approximatePreviewPoint(center));

    expect(points).toEqual(Array.from({ length: 5 }, () => center));
    expect(approximatePreviewPoint(null)).toBeNull();
  });

  it("wires only the validated server session UUID into the one map and gates full results on directory access", () => {
    const homepage = readFileSync(path.resolve("app/page.tsx"), "utf8");

    expect(homepage).toContain("const user = await getSessionUser();");
    expect(homepage).toContain("const canSearch = user ? await canViewBuyerDirectory(user) : false;");
    expect(homepage).toContain("searchDemandPreviews(input, user?.id)");
    expect(homepage).toMatch(/if \(canSearch\) \{\s+const \{ data \} = await searchBuyers\(input\);/);
    expect(homepage).toMatch(/canSearch\s+\? buyers\.map\(\(buyer\) => <BuyerCard/);
    expect(homepage).toContain("{user ? null : <GuestTeaser");
  });

  it("keeps seller search links working by redirecting them to the one map", () => {
    const sellerSearch = readFileSync(path.resolve("app/seller/search/page.tsx"), "utf8");

    expect(sellerSearch).toContain("redirect(demandSearchHref(await searchParams));");
    expect(sellerSearch).not.toContain("searchBuyers");
  });
});
