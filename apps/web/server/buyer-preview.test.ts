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
});
