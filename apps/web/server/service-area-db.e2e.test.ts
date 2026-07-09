import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.SERVICE_AREA_E2E_DATABASE_URL;
const configuredSharedDatabaseUrls = sharedDatabaseUrls();
const enabled = Boolean(databaseUrl && process.env.SERVICE_AREA_E2E_ALLOW_WRITES === "true");

describe.skipIf(!enabled)("database-backed canonical service areas", () => {
  it("keeps stale city text out of matching and pin placement while relationships and market status change", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("@liber/db");
    await assertDisposableE2EDatabase(prisma, databaseUrl!);
    const { approximateBuyerPoint } = await import("../lib/buyer-map-point");
    const { findServiceAreaBySlug } = await import("../lib/service-areas");
    const { approximatePreviewPoint, serviceAreaPreviewWhere } = await import("./buyer-preview");
    const { getActiveMarketOrFallback, getActiveServiceAreaBySlug, getSearchCoverageServiceAreaIds } = await import("./service-areas");

    const suffix = randomUUID().slice(0, 8);
    const marketSlug = `e2e-${suffix}`;
    const userId = randomUUID();
    const buyerProfileId = `e2e-buyer-${suffix}`;
    let marketId = "";
    let secondaryMarketId = "";

    try {
      const market = await prisma.market.create({
        data: {
          active: false,
          bboxEast: -118.2,
          bboxNorth: 34.3,
          bboxSouth: 34.0,
          bboxWest: -118.5,
          centerLat: 34.15,
          centerLng: -118.35,
          country: "US",
          label: `E2E ${suffix}`,
          slug: marketSlug,
          state: "CA",
        },
      });
      marketId = market.id;

      const secondaryMarket = await prisma.market.create({
        data: {
          active: true,
          bboxEast: -117.8,
          bboxNorth: 34.3,
          bboxSouth: 34.0,
          bboxWest: -118.1,
          centerLat: 34.15,
          centerLng: -117.95,
          country: "US",
          label: `E2E Secondary ${suffix}`,
          slug: `e2e-secondary-${suffix}`,
          state: "CA",
        },
      });
      secondaryMarketId = secondaryMarket.id;
      await expect(prisma.market.update({
        where: { id: secondaryMarket.id },
        data: { state: "AZ" },
      })).rejects.toThrow("Market jurisdiction is immutable");

      const [firstParent, secondParent, studioCityZip, dbOnlyZip] = await Promise.all([
        prisma.serviceArea.create({ data: serviceAreaData(market.id, `first-${suffix}`, "First parent", "neighborhood") }),
        prisma.serviceArea.create({ data: serviceAreaData(market.id, `second-${suffix}`, "Second parent", "neighborhood") }),
        prisma.serviceArea.create({
          data: {
            ...serviceAreaData(market.id, `studio-${suffix}`, "91604", "zip"),
            centerLat: 34.139536,
            centerLng: -118.391708,
            city: "Studio City",
            postalCode: "91604",
          },
        }),
        prisma.serviceArea.create({
          data: {
            ...serviceAreaData(market.id, `db-only-${suffix}`, "99998", "zip"),
            city: "Database Only",
            postalCode: "99998",
          },
        }),
      ]);

      const sameSlugInSecondaryMarket = await prisma.serviceArea.create({
        data: {
          ...serviceAreaData(secondaryMarket.id, studioCityZip.slug, "Same name, second market", "zip"),
          bboxEast: -117.9,
          bboxNorth: 34.2,
          bboxSouth: 34.1,
          bboxWest: -118.0,
          centerLat: 34.15,
          centerLng: -117.95,
        },
      });

      await expect(prisma.serviceArea.create({
        data: { ...serviceAreaData(market.id, `wrong-state-${suffix}`, "Wrong state", "city"), state: "AZ" },
      })).rejects.toThrow("state must match its market state");
      await expect(prisma.market.update({
        where: { id: market.id },
        data: { state: "AZ" },
      })).rejects.toThrow("Market jurisdiction is immutable");
      await expect(prisma.market.update({
        where: { id: market.id },
        data: { id: randomUUID() },
      })).rejects.toThrow("primary keys are immutable");
      await expect(prisma.serviceArea.update({
        where: { id: dbOnlyZip.id },
        data: { id: randomUUID() },
      })).rejects.toThrow("primary keys are immutable");
      await expect(prisma.serviceArea.update({
        where: { id: dbOnlyZip.id },
        data: { marketId: secondaryMarket.id },
      })).rejects.toThrow("market membership is immutable");

      expect(await getActiveServiceAreaBySlug(studioCityZip.slug, marketSlug)).toBeNull();
      expect((await getActiveServiceAreaBySlug(studioCityZip.slug, secondaryMarket.slug))?.id).toBe(
        sameSlugInSecondaryMarket.id,
      );
      await prisma.market.update({ where: { id: market.id }, data: { active: true } });
      for (const role of ["anon", "authenticated"] as const) {
        expect(await visibleMarketIdsAsRole(prisma, role)).toContain(market.id);
        expect(await visibleAreaIdsAsRole(prisma, role, market.id)).toEqual(expect.arrayContaining([
          firstParent.id,
          secondParent.id,
          studioCityZip.id,
          dbOnlyZip.id,
        ]));
      }
      expect((await getActiveServiceAreaBySlug(studioCityZip.slug, marketSlug))?.id).toBe(studioCityZip.id);
      expect(findServiceAreaBySlug(dbOnlyZip.slug)).toBeNull();
      expect((await getActiveServiceAreaBySlug(dbOnlyZip.slug, marketSlug))?.id).toBe(dbOnlyZip.id);

      await prisma.serviceAreaRelationship.create({
        data: {
          childServiceAreaId: studioCityZip.id,
          parentServiceAreaId: firstParent.id,
          relationType: "SEARCH_ROLLUP",
          reviewedAt: new Date(),
          source: "e2e",
        },
      });
      await prisma.serviceAreaRelationship.create({
        data: {
          childServiceAreaId: dbOnlyZip.id,
          parentServiceAreaId: secondParent.id,
          relationType: "DISPLAY_PARENT",
          reviewedAt: null,
          source: "e2e-unreviewed",
        },
      });
      for (const role of ["anon", "authenticated"] as const) {
        expect(await visibleRelationshipSourcesAsRole(prisma, role, market.id)).toContain("e2e");
        expect(await visibleRelationshipSourcesAsRole(prisma, role, market.id)).not.toContain("e2e-unreviewed");
      }
      await expect(prisma.serviceAreaRelationship.create({
        data: {
          childServiceAreaId: sameSlugInSecondaryMarket.id,
          parentServiceAreaId: firstParent.id,
          relationType: "SEARCH_ROLLUP",
          reviewedAt: new Date(),
          source: "e2e-cross-market",
        },
      })).rejects.toThrow("relationships must stay within one market");
      await expect(prisma.serviceAreaRelationship.create({
        data: {
          childServiceAreaId: firstParent.id,
          parentServiceAreaId: studioCityZip.id,
          relationType: "SEARCH_ROLLUP",
          reviewedAt: new Date(),
          source: "e2e-cycle",
        },
      })).rejects.toThrow("cannot contain cycles");

      await prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: { email: `e2e-${suffix}@example.invalid`, id: userId, roles: ["BUYER"] },
        });
        await tx.buyerProfile.create({
          data: {
            desiredCity: "Burbank",
            desiredLat: 34.182145,
            desiredLng: -118.325147,
            desiredPostalCode: "91604",
            desiredState: "CA",
            displayName: "E2E Buyer",
            id: buyerProfileId,
            userId,
            visibilityStatus: "DRAFT",
          },
        });
        await tx.buyerDesiredServiceArea.create({
          data: {
            buyerProfileId,
            isPrimary: true,
            serviceAreaId: studioCityZip.id,
            source: "SELECTED",
          },
        });
        await tx.buyerProfile.update({ where: { id: buyerProfileId }, data: { visibilityStatus: "ACTIVE" } });
      });
      await expect(prisma.buyerDesiredServiceArea.delete({
        where: {
          buyerProfileId_serviceAreaId: {
            buyerProfileId,
            serviceAreaId: studioCityZip.id,
          },
        },
      })).rejects.toThrow("requires exactly one active primary selected service area");

      await prisma.serviceAreaMigrationQuarantine.create({
        data: {
          buyerProfileId,
          candidateServiceAreaIds: [],
          legacyLocation: { desiredCity: "Stale city", desiredState: "CA" },
          reason: "UNRESOLVED_LEGACY_LOCATION",
        },
      });
      await expect(prisma.serviceAreaMigrationQuarantine.update({
        where: { buyerProfileId },
        data: { reason: "MIGRATED_REVIEW_REQUIRED" },
      })).rejects.toThrow("quarantine evidence is immutable");
      await expect(prisma.serviceAreaMigrationQuarantine.update({
        where: { buyerProfileId },
        data: { id: randomUUID() },
      })).rejects.toThrow("quarantine evidence is immutable");
      await expect(prisma.serviceAreaMigrationQuarantine.update({
        where: { buyerProfileId },
        data: { resolvedAt: new Date() },
      })).rejects.toThrow();
      for (const role of ["anon", "authenticated"] as const) {
        expect(await quarantinePrivileges(prisma, role)).toEqual({
          canDelete: false,
          canInsert: false,
          canSelect: false,
          canUpdate: false,
        });
        await expectPermissionDenied(quarantineCountAsRole(prisma, role, buyerProfileId));
      }
      expect(await quarantinePrivileges(prisma, "service_role")).toEqual({
        canDelete: false,
        canInsert: true,
        canSelect: true,
        canUpdate: true,
      });
      await expect(resolveQuarantineAsServiceRole(
        prisma,
        buyerProfileId,
        userId,
        studioCityZip.id,
      )).resolves.toBe(1);
      await expect(quarantineCountAsRole(prisma, "service_role", buyerProfileId)).resolves.toBe(1);
      await expect(prisma.serviceAreaMigrationQuarantine.update({
        where: { buyerProfileId },
        data: {
          resolution: {
            actorUserId: userId,
            serviceAreaId: dbOnlyZip.id,
            source: "BUYER_CONFIRMED",
          },
        },
      })).rejects.toThrow("resolved geography quarantine audit cannot be changed");
      const firstCoverage = await getSearchCoverageServiceAreaIds(firstParent.id, marketSlug);
      expect(firstCoverage).toContain(studioCityZip.id);
      expect(await matchingBuyerIds(prisma, marketSlug, firstCoverage)).toContain(buyerProfileId);
      expect(await getSearchCoverageServiceAreaIds(studioCityZip.id, secondaryMarket.slug)).toEqual([]);
      expect(await matchingBuyerIds(prisma, secondaryMarket.slug, [sameSlugInSecondaryMarket.id])).toEqual([]);
      expect(await prisma.buyerProfile.findMany({
        where: { visibilityStatus: "ACTIVE", ...serviceAreaPreviewWhere(firstCoverage, marketSlug) },
        select: { id: true },
      })).toEqual([{ id: buyerProfileId }]);

      await prisma.$transaction([
        prisma.serviceAreaRelationship.delete({
          where: {
            parentServiceAreaId_childServiceAreaId_relationType: {
              childServiceAreaId: studioCityZip.id,
              parentServiceAreaId: firstParent.id,
              relationType: "SEARCH_ROLLUP",
            },
          },
        }),
        prisma.serviceAreaRelationship.create({
          data: {
            childServiceAreaId: studioCityZip.id,
            parentServiceAreaId: secondParent.id,
            relationType: "SEARCH_ROLLUP",
            reviewedAt: new Date(),
            source: "e2e-changed",
          },
        }),
      ]);

      expect(await matchingBuyerIds(prisma, marketSlug, await getSearchCoverageServiceAreaIds(firstParent.id, marketSlug))).toEqual([]);
      expect(await matchingBuyerIds(prisma, marketSlug, await getSearchCoverageServiceAreaIds(secondParent.id, marketSlug))).toEqual([buyerProfileId]);

      const area = await getActiveServiceAreaBySlug(studioCityZip.slug, marketSlug);
      expect(area?.id).toBe(studioCityZip.id);
      const sellerPoint = approximateBuyerPoint({
        lat: 34.182145,
        lng: -118.325147,
        primaryServiceArea: {
          center: area!.center,
          id: area!.id,
          marketSlug,
          slug: area!.slug,
        },
      } as any);
      expect(sellerPoint).toEqual(area!.center);
      const publicPoint = approximatePreviewPoint(area!.center, 0);
      expect(publicPoint).not.toBeNull();
      expect(publicPoint!.lng).toBeCloseTo(area!.center.lng + 0.008, 6);

      const activeAreas = await prisma.serviceArea.findMany({ where: { active: true, marketId: market.id } });
      for (const activeArea of activeAreas) {
        expect(activeArea.bboxWest).toBeGreaterThanOrEqual(market.bboxWest);
        expect(activeArea.bboxSouth).toBeGreaterThanOrEqual(market.bboxSouth);
        expect(activeArea.bboxEast).toBeLessThanOrEqual(market.bboxEast);
        expect(activeArea.bboxNorth).toBeLessThanOrEqual(market.bboxNorth);
      }

      await prisma.serviceArea.update({ where: { id: studioCityZip.id }, data: { active: false } });
      expect((await prisma.buyerProfile.findUnique({
        where: { id: buyerProfileId },
        select: { visibilityStatus: true },
      }))?.visibilityStatus).toBe("DRAFT");
      for (const role of ["anon", "authenticated"] as const) {
        expect(await visibleAreaIdsAsRole(prisma, role, market.id)).not.toContain(studioCityZip.id);
        expect(await visibleRelationshipSourcesAsRole(prisma, role, market.id)).not.toContain("e2e-changed");
      }

      await prisma.serviceArea.update({ where: { id: studioCityZip.id }, data: { active: true } });
      expect((await prisma.buyerProfile.findUnique({
        where: { id: buyerProfileId },
        select: { visibilityStatus: true },
      }))?.visibilityStatus).toBe("DRAFT");
      expect(await matchingBuyerIds(prisma, marketSlug, [studioCityZip.id])).toEqual([]);
      for (const role of ["anon", "authenticated"] as const) {
        expect(await visibleAreaIdsAsRole(prisma, role, market.id)).toContain(studioCityZip.id);
        expect(await visibleRelationshipSourcesAsRole(prisma, role, market.id)).toContain("e2e-changed");
      }

      await prisma.buyerProfile.update({
        where: { id: buyerProfileId },
        data: { visibilityStatus: "ACTIVE" },
      });
      expect(await matchingBuyerIds(prisma, marketSlug, [studioCityZip.id])).toEqual([buyerProfileId]);

      await prisma.market.update({ where: { id: market.id }, data: { active: false } });
      expect((await getActiveMarketOrFallback(market.slug)).slug).not.toBe(market.slug);
      expect(await getActiveServiceAreaBySlug(studioCityZip.slug, marketSlug)).toBeNull();
      expect(await matchingBuyerIds(prisma, marketSlug, [studioCityZip.id])).toEqual([]);
      expect((await prisma.buyerProfile.findUnique({
        where: { id: buyerProfileId },
        select: { visibilityStatus: true },
      }))?.visibilityStatus).toBe("DRAFT");
      for (const role of ["anon", "authenticated"] as const) {
        expect(await visibleMarketIdsAsRole(prisma, role)).not.toContain(market.id);
        expect(await visibleAreaIdsAsRole(prisma, role, market.id)).toEqual([]);
        expect(await visibleRelationshipSourcesAsRole(prisma, role, market.id)).toEqual([]);
      }

      await prisma.market.update({ where: { id: market.id }, data: { active: true } });
      expect((await prisma.buyerProfile.findUnique({
        where: { id: buyerProfileId },
        select: { visibilityStatus: true },
      }))?.visibilityStatus).toBe("DRAFT");
      expect(await matchingBuyerIds(prisma, marketSlug, [studioCityZip.id])).toEqual([]);
      for (const role of ["anon", "authenticated"] as const) {
        expect(await visibleMarketIdsAsRole(prisma, role)).toContain(market.id);
        expect(await visibleAreaIdsAsRole(prisma, role, market.id)).toContain(studioCityZip.id);
      }
    } finally {
      if (marketId) {
        await prisma.buyerProfile.updateMany({ where: { id: buyerProfileId }, data: { visibilityStatus: "DRAFT" } });
        await prisma.user.deleteMany({ where: { id: userId } });
        await prisma.serviceArea.deleteMany({ where: { marketId } });
        await prisma.market.deleteMany({ where: { id: marketId } });
      }
      if (secondaryMarketId) {
        await prisma.serviceArea.deleteMany({ where: { marketId: secondaryMarketId } });
        await prisma.market.deleteMany({ where: { id: secondaryMarketId } });
      }
    }
  }, 30_000);
});

async function matchingBuyerIds(prisma: any, marketSlug: string, serviceAreaIds: string[]) {
  const { activePrimaryServiceAreaWhere } = await import("./service-area-matching");
  const rows = await prisma.buyerProfile.findMany({
    where: { visibilityStatus: "ACTIVE", ...activePrimaryServiceAreaWhere(marketSlug, serviceAreaIds) },
    select: { id: true },
  });
  return rows.map((row: { id: string }) => row.id);
}

async function assertDisposableE2EDatabase(prisma: any, url: string) {
  const sentinel = process.env.GEOGRAPHY_MIGRATION_TEST_SENTINEL;
  if (!sentinel || sentinel.length < 16) {
    throw new Error("SERVICE_AREA_E2E requires a 16+ character disposable-database sentinel.");
  }
  if (configuredSharedDatabaseUrls.some((sharedUrl) => normalizeDatabaseUrl(sharedUrl) === normalizeDatabaseUrl(url))) {
    throw new Error("Refusing to run the service-area DB E2E against the configured shared database.");
  }
  const [table] = await prisma.$queryRaw<Array<{ present: boolean }>>`
    SELECT to_regclass('public.geography_migration_test_sentinel') IS NOT NULL AS present
  `;
  if (!table?.present) throw new Error("Disposable-database sentinel table is missing.");
  const [verified] = await prisma.$queryRaw<Array<{ verified: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM public.geography_migration_test_sentinel
      WHERE token = ${sentinel}
    ) AS verified
  `;
  if (!verified?.verified) throw new Error("Disposable-database sentinel does not match.");
}

function normalizeDatabaseUrl(value: string) {
  const url = new URL(value);
  url.password = "";
  url.search = "";
  return url.toString();
}

function sharedDatabaseUrls() {
  const explicit = process.env.SERVICE_AREA_E2E_SHARED_DATABASE_URLS;
  if (explicit !== undefined) {
    const parsed = JSON.parse(explicit);
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
      throw new Error("SERVICE_AREA_E2E_SHARED_DATABASE_URLS must be a JSON string array.");
    }
    return parsed as string[];
  }
  return [process.env.DIRECT_URL, process.env.DATABASE_URL].filter(Boolean) as string[];
}

async function visibleMarketIdsAsRole(prisma: any, role: "anon" | "authenticated") {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT market.id::text AS id
      FROM public.markets market
      ORDER BY market.id
    `;
    return rows.map((row: { id: string }) => row.id);
  });
}

async function visibleAreaIdsAsRole(prisma: any, role: "anon" | "authenticated", marketId: string) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT service_area.id::text AS id
      FROM public.service_areas service_area
      WHERE service_area.market_id = ${marketId}::uuid
      ORDER BY service_area.id
    `;
    return rows.map((row: { id: string }) => row.id);
  });
}

async function visibleRelationshipSourcesAsRole(prisma: any, role: "anon" | "authenticated", marketId: string) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
    const rows = await tx.$queryRaw<Array<{ source: string }>>`
      SELECT relationship.source
      FROM public.service_area_relationships relationship
      JOIN public.service_areas parent ON parent.id = relationship.parent_service_area_id
      WHERE parent.market_id = ${marketId}::uuid
      ORDER BY relationship.source
    `;
    return rows.map((row: { source: string }) => row.source);
  });
}

async function quarantineCountAsRole(
  prisma: any,
  role: "anon" | "authenticated" | "service_role",
  buyerProfileId: string,
) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
    const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count
      FROM public.service_area_migration_quarantine quarantine
      WHERE quarantine.buyer_profile_id = ${buyerProfileId}
    `;
    return Number(rows[0]?.count ?? 0);
  });
}

async function resolveQuarantineAsServiceRole(
  prisma: any,
  buyerProfileId: string,
  actorUserId: string,
  serviceAreaId: string,
) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE service_role");
    return tx.$executeRaw`
      UPDATE public.service_area_migration_quarantine
      SET
        resolution = jsonb_build_object(
          'actorUserId', ${actorUserId},
          'serviceAreaId', ${serviceAreaId},
          'source', 'BUYER_CONFIRMED'
        ),
        resolved_at = now(),
        updated_at = now()
      WHERE buyer_profile_id = ${buyerProfileId}
    `;
  });
}

async function quarantinePrivileges(
  prisma: any,
  role: "anon" | "authenticated" | "service_role",
) {
  const [row] = await prisma.$queryRaw<Array<{
    canDelete: boolean;
    canInsert: boolean;
    canSelect: boolean;
    canUpdate: boolean;
  }>>`
    SELECT
      has_table_privilege(${role}, 'public.service_area_migration_quarantine', 'DELETE') AS "canDelete",
      has_table_privilege(${role}, 'public.service_area_migration_quarantine', 'INSERT') AS "canInsert",
      has_table_privilege(${role}, 'public.service_area_migration_quarantine', 'SELECT') AS "canSelect",
      has_table_privilege(${role}, 'public.service_area_migration_quarantine', 'UPDATE') AS "canUpdate"
  `;
  return row;
}

async function expectPermissionDenied(promise: Promise<unknown>) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeDefined();
  const serialized = `${String(caught)} ${JSON.stringify((caught as { meta?: unknown })?.meta)}`;
  expect(serialized).toContain("42501");
  expect(serialized).toMatch(/permission denied/i);
}

function serviceAreaData(marketId: string, slug: string, label: string, type: string) {
  return {
    active: true,
    bboxEast: -118.36,
    bboxNorth: 34.16,
    bboxSouth: 34.12,
    bboxWest: -118.42,
    centerLat: 34.14,
    centerLng: -118.39,
    city: "Los Angeles",
    county: "Los Angeles County",
    geojsonPath: "/geo/service-areas/zip/91604.geojson",
    isPilot: false,
    label,
    marketId,
    postalCode: type === "zip" ? "99999" : null,
    searchTerms: [slug],
    slug,
    source: "e2e",
    sourceVersion: "1",
    state: "CA",
    type,
  };
}
