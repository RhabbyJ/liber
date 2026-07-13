import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sameDatabaseTarget } from "../../../scripts/database-target.mjs";

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
      await expect(prisma.serviceArea.create({
        data: {
          ...serviceAreaData(market.id, `outside-bounds-${suffix}`, "Outside bounds", "city"),
          bboxWest: market.bboxWest - 0.1,
        },
      })).rejects.toThrow("inside its market bounds");
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

      await prisma.serviceArea.update({ where: { id: studioCityZip.id }, data: { active: true } });
      expect((await prisma.buyerProfile.findUnique({
        where: { id: buyerProfileId },
        select: { visibilityStatus: true },
      }))?.visibilityStatus).toBe("DRAFT");
      expect(await matchingBuyerIds(prisma, marketSlug, [studioCityZip.id])).toEqual([]);

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

      await prisma.market.update({ where: { id: market.id }, data: { active: true } });
      expect((await prisma.buyerProfile.findUnique({
        where: { id: buyerProfileId },
        select: { visibilityStatus: true },
      }))?.visibilityStatus).toBe("DRAFT");
      expect(await matchingBuyerIds(prisma, marketSlug, [studioCityZip.id])).toEqual([]);
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

  it("keeps canonical geography grants, RLS, policies, and function access exact", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("@liber/db");
    await assertDisposableE2EDatabase(prisma, databaseUrl!);

    const tables = [
      "buyer_desired_service_areas",
      "markets",
      "service_area_relationships",
      "service_areas",
    ];
    const acl = await prisma.$queryRaw<Array<{
      grantee: string;
      privilege: string;
      tableName: string;
    }>>`
      SELECT relation.relname AS "tableName",
             CASE WHEN exploded.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
             exploded.privilege_type AS privilege
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) exploded
      LEFT JOIN pg_roles grantee ON grantee.oid = exploded.grantee
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY(${tables}::text[])
        AND (exploded.grantee = 0 OR grantee.rolname IN ('anon', 'authenticated', 'service_role'))
      ORDER BY relation.relname, grantee, exploded.privilege_type
    `;
    expect(acl).toEqual(tables.flatMap((tableName) =>
      ["DELETE", "INSERT", "SELECT", "UPDATE"].map((privilege) => ({
        grantee: "service_role",
        privilege,
        tableName,
      })),
    ));

    const rls = await prisma.$queryRaw<Array<{ rlsEnabled: boolean; tableName: string }>>`
      SELECT relation.relname AS "tableName", relation.relrowsecurity AS "rlsEnabled"
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = ANY(${tables}::text[])
      ORDER BY relation.relname
    `;
    expect(rls).toEqual(tables.map((tableName) => ({ rlsEnabled: true, tableName })));

    const policies = await prisma.$queryRaw<Array<{
      command: string;
      policyName: string;
      roles: string;
      tableName: string;
    }>>`
      SELECT tablename AS "tableName", policyname AS "policyName", cmd AS command,
             array_to_string(roles, ',') AS roles
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = ANY(${tables}::text[])
      ORDER BY tablename, policyname
    `;
    expect(policies).toEqual([
      {
        command: "SELECT",
        policyName: "Active markets are public metadata",
        roles: "anon,authenticated",
        tableName: "markets",
      },
      {
        command: "SELECT",
        policyName: "Reviewed relationships in active markets are public metadata",
        roles: "anon,authenticated",
        tableName: "service_area_relationships",
      },
      {
        command: "SELECT",
        policyName: "Active service areas in active markets are public metadata",
        roles: "anon,authenticated",
        tableName: "service_areas",
      },
    ]);

    const functionAccess = await prisma.$queryRaw<Array<{
      canExecute: boolean;
      canUseSchema: boolean;
      roleName: string;
    }>>`
      SELECT role_name AS "roleName",
             has_schema_privilege(role_name, 'geography_admin', 'USAGE') AS "canUseSchema",
             has_function_privilege(
               role_name,
               'geography_admin.search_active_service_areas(text,text,integer)',
               'EXECUTE'
             ) AS "canExecute"
      FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) role_name
      ORDER BY role_name
    `;
    expect(functionAccess).toEqual([
      { canExecute: false, canUseSchema: false, roleName: "anon" },
      { canExecute: false, canUseSchema: false, roleName: "authenticated" },
      { canExecute: false, canUseSchema: false, roleName: "service_role" },
    ]);

    const scratchSuffix = randomUUID().replaceAll("-", "");
    const scratchTable = `geography_acl_table_${scratchSuffix}`;
    const scratchSequence = `geography_acl_sequence_${scratchSuffix}`;
    const scratchFunction = `geography_acl_function_${scratchSuffix}`;
    try {
      await prisma.$executeRawUnsafe(`CREATE TABLE public.${scratchTable} (id bigint)`);
      await prisma.$executeRawUnsafe(`CREATE SEQUENCE public.${scratchSequence}`);
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION public.${scratchFunction}() RETURNS integer LANGUAGE sql AS 'SELECT 1'`,
      );
      const effectiveDefaults = await prisma.$queryRawUnsafe<Array<{
        canDeleteTable: boolean;
        canExecuteFunction: boolean;
        canInsertTable: boolean;
        canMaintainTable: boolean;
        canReferenceTable: boolean;
        canSelectSequence: boolean;
        canSelectTable: boolean;
        canTriggerTable: boolean;
        canTruncateTable: boolean;
        canUpdateSequence: boolean;
        canUpdateTable: boolean;
        canUseSequence: boolean;
        roleName: string;
      }>>(`
        SELECT role_name AS "roleName",
               has_table_privilege(role_name, $1, 'SELECT') AS "canSelectTable",
               has_table_privilege(role_name, $1, 'INSERT') AS "canInsertTable",
               has_table_privilege(role_name, $1, 'UPDATE') AS "canUpdateTable",
               has_table_privilege(role_name, $1, 'DELETE') AS "canDeleteTable",
               has_table_privilege(role_name, $1, 'TRUNCATE') AS "canTruncateTable",
               has_table_privilege(role_name, $1, 'REFERENCES') AS "canReferenceTable",
               has_table_privilege(role_name, $1, 'TRIGGER') AS "canTriggerTable",
               has_table_privilege(role_name, $1, 'MAINTAIN') AS "canMaintainTable",
               has_sequence_privilege(role_name, $2, 'SELECT') AS "canSelectSequence",
               has_sequence_privilege(role_name, $2, 'UPDATE') AS "canUpdateSequence",
               has_sequence_privilege(role_name, $2, 'USAGE') AS "canUseSequence",
               has_function_privilege(role_name, $3, 'EXECUTE') AS "canExecuteFunction"
        FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) role_name
        ORDER BY role_name
      `, `public.${scratchTable}`, `public.${scratchSequence}`, `public.${scratchFunction}()`);
      expect(effectiveDefaults).toEqual(["anon", "authenticated", "service_role"].map((roleName) => ({
        canDeleteTable: false,
        canExecuteFunction: false,
        canInsertTable: false,
        canMaintainTable: false,
        canReferenceTable: false,
        canSelectSequence: false,
        canSelectTable: false,
        canTriggerTable: false,
        canTruncateTable: false,
        canUpdateSequence: false,
        canUpdateTable: false,
        canUseSequence: false,
        roleName,
      })));
    } finally {
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public.${scratchFunction}()`);
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS public.${scratchTable}`);
      await prisma.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS public.${scratchSequence}`);
    }

    await assertPostgisSecurityGate(prisma);
  }, 30_000);

  it("uses the covering index for bounded service-area prefix lookup", async () => {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("@liber/db");
    await assertDisposableE2EDatabase(prisma, databaseUrl!);
    const suffix = randomUUID().slice(0, 8);
    const market = await prisma.market.create({
      data: {
        active: true,
        bboxEast: -118.2,
        bboxNorth: 34.3,
        bboxSouth: 34.0,
        bboxWest: -118.5,
        centerLat: 34.15,
        centerLng: -118.35,
        country: "US",
        label: `Plan ${suffix}`,
        slug: `plan-${suffix}`,
        state: "CA",
      },
    });
    const area = await prisma.serviceArea.create({
      data: serviceAreaData(market.id, `plan-area-${suffix}`, "Plan area", "city"),
    });

    try {
      await prisma.$executeRaw`
        INSERT INTO public.service_area_search_terms (
          market_id, service_area_id, term_normalized, term_kind, source, reviewed_at
        )
        SELECT ${market.id}::uuid, ${area.id}::uuid,
               'a' || lpad(series::text, 5, '0'), 'PLAN_FIXTURE', 'e2e-plan', now()
        FROM generate_series(1, 2000) series
        UNION ALL
        SELECT ${market.id}::uuid, ${area.id}::uuid,
               '91325', 'PLAN_FIXTURE', 'e2e-plan', now()
      `;
      await prisma.$executeRawUnsafe("ANALYZE public.service_area_search_terms");

      const planRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        WITH input AS (
          SELECT lower(btrim(regexp_replace(coalesce($2::text, ''), '[^a-zA-Z0-9]+', ' ', 'g'))) COLLATE "C" AS term,
                 least(greatest(coalesce($3::integer, 8), 1), 8) AS row_limit
        ), selected_market AS (
          SELECT market.id FROM public.markets market
          WHERE market.slug = $1 AND market.active = true
        ), matches AS (
          SELECT search_term.service_area_id,
                 min(CASE
                   WHEN replace(area.slug, '-', ' ') = input.term THEN 1
                   WHEN area.postal_code = input.term THEN 2
                   WHEN lower(btrim(regexp_replace(area.label, '[^a-zA-Z0-9]+', ' ', 'g'))) COLLATE "C" = input.term THEN 3
                   WHEN search_term.term_normalized = input.term THEN 4
                   ELSE 99
                 END) AS exact_rank,
                 min(search_term.term_normalized) AS matched_term
          FROM input
          JOIN selected_market ON true
          JOIN public.service_area_search_terms search_term
            ON search_term.market_id = selected_market.id
           AND search_term.term_normalized >= input.term
           AND search_term.term_normalized < input.term || U&'\\FFFF'
           AND search_term.term_normalized LIKE input.term || '%'
          JOIN public.service_areas area
            ON area.id = search_term.service_area_id
           AND area.market_id = selected_market.id
           AND area.active = true
          WHERE input.term <> ''
          GROUP BY search_term.service_area_id
        ), ranked AS (
          SELECT matches.*,
                 min(matches.exact_rank) FILTER (WHERE matches.exact_rank < 99) OVER () AS best_exact_rank
          FROM matches
        )
        SELECT ranked.service_area_id,
               ranked.exact_rank < 99 AND ranked.exact_rank = ranked.best_exact_rank AS exact_match
        FROM ranked, input
        ORDER BY exact_match DESC, ranked.exact_rank, ranked.matched_term, ranked.service_area_id
        LIMIT (SELECT row_limit FROM input)
      `, market.slug, "91325", 8);
      const indexPlan = findPlanNode(planRows[0]?.["QUERY PLAN"], (node) =>
        node["Index Name"] === "service_area_search_terms_market_term_prefix_idx",
      );
      expect(indexPlan).not.toBeNull();
      expect(String(indexPlan?.["Index Cond"])).toMatch(/term_normalized.*(>=|~>=~)/);
      expect(String(indexPlan?.["Index Cond"])).toMatch(/term_normalized.*(<|~<~)/);

      const results = await prisma.$queryRaw<Array<{ serviceAreaId: string }>>`
        SELECT service_area_id::text AS "serviceAreaId"
        FROM geography_admin.search_active_service_areas(${market.slug}, '91325', 8)
      `;
      expect(results).toEqual([{ serviceAreaId: area.id }]);
    } finally {
      await prisma.serviceArea.deleteMany({ where: { marketId: market.id } });
      await prisma.market.delete({ where: { id: market.id } });
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
  if (configuredSharedDatabaseUrls.some((sharedUrl) => sameDatabaseTarget(sharedUrl, url))) {
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

async function assertPostgisSecurityGate(prisma: any) {
  const tableFindings = await prisma.$queryRaw<Array<{
    objectName: string;
    ownerCapable: boolean;
    ownerName: string;
    secure: boolean;
  }>>`
    SELECT 'public.spatial_ref_sys' AS "objectName",
           pg_get_userbyid(relation.relowner) AS "ownerName",
           current_role.rolsuper
             OR relation.relowner = current_role.oid AS "ownerCapable",
           relation.relrowsecurity
             AND NOT EXISTS (
               SELECT 1
               FROM aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) privilege
               LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
               WHERE privilege.grantee = 0
                  OR grantee.rolname IN ('anon', 'authenticated', 'service_role')
             ) AS secure
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles current_role ON current_role.rolname = current_user
    WHERE namespace.nspname = 'public' AND relation.relname = 'spatial_ref_sys'
  `;
  expect(tableFindings).toHaveLength(1);

  const functionFindings = await prisma.$queryRaw<Array<{
    objectName: string;
    ownerCapable: boolean;
    ownerName: string;
    secure: boolean;
  }>>`
    SELECT procedure.oid::regprocedure::text AS "objectName",
           pg_get_userbyid(procedure.proowner) AS "ownerName",
           current_role.rolsuper
             OR procedure.proowner = current_role.oid AS "ownerCapable",
           NOT has_function_privilege('anon', procedure.oid, 'EXECUTE')
             AND NOT has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
             AND NOT has_function_privilege('service_role', procedure.oid, 'EXECUTE') AS secure
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_roles current_role ON current_role.rolname = current_user
    WHERE namespace.nspname = 'public' AND procedure.proname = 'st_estimatedextent'
    ORDER BY procedure.oid::regprocedure::text
  `;
  expect(functionFindings).toHaveLength(3);

  const unresolved = [...tableFindings, ...functionFindings].filter((finding) => !finding.secure);
  expect(
    unresolved.every((finding) => finding.ownerName === "supabase_admin" && !finding.ownerCapable),
    `Unexpected owner-capable PostGIS findings: ${JSON.stringify(unresolved)}`,
  ).toBe(true);
  if (unresolved.length > 0) {
    process.stderr.write(`POSTGIS_SUPPORTED_PLATFORM_GATE ${JSON.stringify(unresolved)}\n`);
  }
}

function findPlanNode(
  raw: unknown,
  predicate: (node: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  const document = Array.isArray(raw) ? raw[0] : raw;
  const root = document && typeof document === "object" && "Plan" in document
    ? (document as Record<string, unknown>).Plan
    : document;
  if (!root || typeof root !== "object") return null;
  const node = root as Record<string, unknown>;
  if (predicate(node)) return node;
  if (!Array.isArray(node.Plans)) return null;
  for (const child of node.Plans) {
    const match = findPlanNode(child, predicate);
    if (match) return match;
  }
  return null;
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
