import { beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.SELLER_SEARCH_TEMP_BENCHMARK === "true";

let db: typeof import("@liber/db");
let queryModule: typeof import("./seller-search-query");
let validators: typeof import("@liber/validators");

beforeAll(async () => {
  if (!enabled) return;
  db = await import("@liber/db");
  queryModule = await import("./seller-search-query");
  validators = await import("@liber/validators");
});

describe.skipIf(!enabled)("seller search temporary-table benchmark", () => {
  it("executes every filter, 137-row cursors, same-name markets, concurrent inserts, and EXPLAIN ANALYZE", async () => {
    const benchmarkAt = new Date("2026-07-09T20:00:00.000Z");

    await db.prisma.$transaction(async (tx) => {
      await createBenchmarkTables(tx);
      await seedBenchmarkData(tx, benchmarkAt);
      await createProposedIndexes(tx);
      await tx.$executeRawUnsafe("ANALYZE");

      const base = {
        market: "market-a",
        pageSize: 100,
        serviceArea: "shared-name",
        sort: "recently_active",
      } as const;
      const baseIds = await collectIds(tx, base, benchmarkAt);
      expect(baseIds).toHaveLength(137);
      expect(new Set(baseIds).size).toBe(137);
      expect(baseIds).not.toContain("other-market-buyer");

      const filterCases = [
        { budgetMin: 1_000_000 },
        { budgetMax: 650_000 },
        { propertyCategory: "HOME" },
        { propertySubtype: "CONDO" },
        { bedrooms: 3 },
        { bathrooms: 2 },
        { squareFeet: 1_750 },
        { lotSize: 6_000 },
        { condition: "Fixer" },
        { amenities: ["Pool", "ADU"] },
        { badges: ["PRE_APPROVED"] },
      ] as const;
      for (const filter of filterCases) {
        const ids = await collectIds(tx, { ...base, ...filter }, benchmarkAt);
        expect(ids.length, JSON.stringify(filter)).toBeGreaterThan(0);
        expect(ids.length, JSON.stringify(filter)).toBeLessThanOrEqual(137);
      }

      for (const sort of ["recommended", "recently_active", "highest_budget", "most_verified"] as const) {
        const ids = await collectIds(tx, { ...base, pageSize: 23, sort }, benchmarkAt);
        expect(ids).toHaveLength(137);
        expect(new Set(ids).size).toBe(137);
      }

      const firstPageFilters = validators.searchBuyersSchema.parse({ ...base, pageSize: 50 });
      const firstPage = await queryModule.querySellerSearchIds(
        tx,
        firstPageFilters,
        benchmarkAt,
        db.Prisma.raw("pg_temp"),
      );
      await insertConcurrentBuyer(tx, new Date(benchmarkAt.getTime() + 1_000));
      const remainingIds = await collectIds(tx, {
        ...base,
        cursor: firstPage.nextCursor!,
        pageSize: 50,
      }, benchmarkAt);
      const stableIds = [...firstPage.ids, ...remainingIds];
      expect(stableIds).toHaveLength(137);
      expect(new Set(stableIds).size).toBe(137);
      expect(stableIds).not.toContain("concurrent-buyer");

      const planFilters = validators.searchBuyersSchema.parse({
        market: "market-a",
        pageSize: 100,
        sort: "recently_active",
      });
      const planQuery = queryModule.buildSellerSearchQuery(
        planFilters,
        benchmarkAt,
        null,
        db.Prisma.raw("pg_temp"),
      );
      const plan = await tx.$queryRaw<Array<{ "QUERY PLAN": unknown }>>(
        db.Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${planQuery}`,
      );
      const summary = explainSummary(plan[0]?.["QUERY PLAN"]);
      expect(summary.actualRows).toBe(101);
      expect(summary.executionTimeMs).toBeGreaterThan(0);
      console.info(`SELLER_SEARCH_EXPLAIN ${JSON.stringify(summary)}`);
    }, { timeout: 120_000 });
  }, 120_000);
});

async function collectIds(
  tx: any,
  input: Record<string, unknown>,
  now: Date,
) {
  const ids: string[] = [];
  let cursor = typeof input.cursor === "string" ? input.cursor : undefined;
  do {
    const filters = validators.searchBuyersSchema.parse({ ...input, cursor });
    const page = await queryModule.querySellerSearchIds(tx, filters, now, db.Prisma.raw("pg_temp"));
    ids.push(...page.ids);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return ids;
}

async function createBenchmarkTables(tx: any) {
  const statements = [
    `CREATE TEMP TABLE markets (id uuid PRIMARY KEY, slug text NOT NULL, active boolean NOT NULL) ON COMMIT DROP`,
    `CREATE TEMP TABLE service_areas (id uuid PRIMARY KEY, market_id uuid NOT NULL, slug text NOT NULL, active boolean NOT NULL) ON COMMIT DROP`,
    `CREATE TEMP TABLE service_area_relationships (parent_service_area_id uuid NOT NULL, child_service_area_id uuid NOT NULL, relation_type text NOT NULL, reviewed_at timestamptz) ON COMMIT DROP`,
    `CREATE TEMP TABLE "User" (id uuid PRIMARY KEY, status text NOT NULL) ON COMMIT DROP`,
    `CREATE TEMP TABLE "BuyerProfile" (id text PRIMARY KEY, "userId" uuid NOT NULL, "budgetMin" numeric, "budgetMax" numeric, "visibilityStatus" text NOT NULL, "createdAt" timestamptz NOT NULL, "lastRefreshedAt" timestamptz, "updatedAt" timestamptz NOT NULL) ON COMMIT DROP`,
    `CREATE TEMP TABLE buyer_desired_service_areas (buyer_profile_id text NOT NULL, service_area_id uuid NOT NULL, is_primary boolean NOT NULL, source text NOT NULL) ON COMMIT DROP`,
    `CREATE TEMP TABLE "BuyerCriteria" ("buyerProfileId" text NOT NULL, "propertyCategory" text NOT NULL, "propertySubtype" text NOT NULL, "bedroomsMin" integer, "bathroomsMin" integer, "squareFeetMin" integer, "squareFeetMax" integer, "lotSizeMin" integer, "lotSizeMax" integer, condition text, features text[] NOT NULL) ON COMMIT DROP`,
    `CREATE TEMP TABLE "BuyerBadge" ("buyerProfileId" text NOT NULL, "badgeType" text NOT NULL, status text NOT NULL, "expiresAt" timestamptz) ON COMMIT DROP`,
  ];
  for (const statement of statements) await tx.$executeRawUnsafe(statement);
}

async function seedBenchmarkData(tx: any, benchmarkAt: Date) {
  await tx.$executeRaw`
    INSERT INTO pg_temp.markets (id, slug, active) VALUES
      ('10000000-0000-4000-8000-000000000001', 'market-a', true),
      ('10000000-0000-4000-8000-000000000002', 'market-b', true)
  `;
  await tx.$executeRaw`
    INSERT INTO pg_temp.service_areas (id, market_id, slug, active) VALUES
      ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'shared-name', true),
      ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'child-a', true),
      ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'child-b', true),
      ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'shared-name', true)
  `;
  await tx.$executeRaw`
    INSERT INTO pg_temp.service_area_relationships
      (parent_service_area_id, child_service_area_id, relation_type, reviewed_at)
    VALUES
      ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'SEARCH_ROLLUP', ${benchmarkAt})
  `;
  await tx.$executeRawUnsafe(`
    INSERT INTO pg_temp."User" (id, status)
    SELECT ('30000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid, 'ACTIVE'
    FROM generate_series(1, 25001) series
  `);
  await tx.$executeRaw`
    INSERT INTO pg_temp."BuyerProfile"
      (id, "userId", "budgetMin", "budgetMax", "visibilityStatus", "createdAt", "lastRefreshedAt", "updatedAt")
    SELECT
      'buyer-' || lpad(series::text, 5, '0'),
      ('30000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
      500000 + (series % 20) * 50000,
      900000 + (series % 20) * 50000,
      'ACTIVE',
      ${benchmarkAt}::timestamptz - interval '1 day',
      ${benchmarkAt}::timestamptz - (series % 30) * interval '1 minute',
      ${benchmarkAt}::timestamptz - (series % 30) * interval '1 minute'
    FROM generate_series(1, 25000) series
  `;
  await tx.$executeRaw`
    INSERT INTO pg_temp."BuyerProfile"
      (id, "userId", "budgetMin", "budgetMax", "visibilityStatus", "createdAt", "lastRefreshedAt", "updatedAt")
    VALUES (
      'other-market-buyer', '30000000-0000-4000-8000-000000025001', 500000, 1000000,
      'ACTIVE', ${benchmarkAt}::timestamptz - interval '1 day', ${benchmarkAt}::timestamptz, ${benchmarkAt}::timestamptz
    )
  `;
  await tx.$executeRawUnsafe(`
    INSERT INTO pg_temp.buyer_desired_service_areas
      (buyer_profile_id, service_area_id, is_primary, source)
    SELECT
      'buyer-' || lpad(series::text, 5, '0'),
      CASE WHEN series <= 137
        THEN '20000000-0000-4000-8000-000000000002'::uuid
        ELSE '20000000-0000-4000-8000-000000000003'::uuid
      END,
      true,
      'SELECTED'
    FROM generate_series(1, 25000) series
  `);
  await tx.$executeRawUnsafe(`
    INSERT INTO pg_temp.buyer_desired_service_areas VALUES
      ('other-market-buyer', '20000000-0000-4000-8000-000000000004', true, 'SELECTED')
  `);
  await tx.$executeRawUnsafe(`
    INSERT INTO pg_temp."BuyerCriteria"
      ("buyerProfileId", "propertyCategory", "propertySubtype", "bedroomsMin", "bathroomsMin", "squareFeetMin", "squareFeetMax", "lotSizeMin", "lotSizeMax", condition, features)
    SELECT
      'buyer-' || lpad(series::text, 5, '0'),
      'HOME',
      CASE WHEN series % 3 = 0 THEN 'CONDO' ELSE 'HOME' END,
      2 + (series % 4),
      1 + (series % 3),
      1200 + (series % 5) * 200,
      2200 + (series % 5) * 300,
      4000 + (series % 4) * 1000,
      8000 + (series % 4) * 1000,
      CASE WHEN series % 2 = 0 THEN 'Fixer' ELSE 'Move-in ready' END,
      CASE WHEN series % 5 = 0 THEN ARRAY['Pool', 'ADU']::text[] ELSE ARRAY['Garage']::text[] END
    FROM generate_series(1, 25000) series
  `);
  await tx.$executeRaw`
    INSERT INTO pg_temp."BuyerBadge" ("buyerProfileId", "badgeType", status, "expiresAt")
    SELECT
      'buyer-' || lpad(series::text, 5, '0'),
      'PRE_APPROVED',
      CASE WHEN series % 2 = 0 THEN 'ACTIVE' ELSE 'EXPIRED' END,
      ${benchmarkAt}::timestamptz + interval '30 days'
    FROM generate_series(1, 25000) series
  `;
}

async function createProposedIndexes(tx: any) {
  const statements = [
    `CREATE INDEX benchmark_buyer_active_recency_idx ON pg_temp."BuyerProfile" ((COALESCE("lastRefreshedAt", "updatedAt")) DESC, id ASC) WHERE "visibilityStatus" = 'ACTIVE'`,
    `CREATE INDEX benchmark_buyer_active_budget_idx ON pg_temp."BuyerProfile" ((COALESCE("budgetMax", 0)) DESC, id ASC) INCLUDE ("budgetMin") WHERE "visibilityStatus" = 'ACTIVE'`,
    `CREATE INDEX benchmark_selection_area_idx ON pg_temp.buyer_desired_service_areas (service_area_id, buyer_profile_id) WHERE is_primary = true AND source = 'SELECTED'`,
    `CREATE INDEX benchmark_criteria_buyer_fit_idx ON pg_temp."BuyerCriteria" ("buyerProfileId", "propertySubtype", "bedroomsMin", "bathroomsMin", "squareFeetMin", "squareFeetMax")`,
    `CREATE INDEX benchmark_criteria_features_idx ON pg_temp."BuyerCriteria" USING GIN (features)`,
    `CREATE INDEX benchmark_badge_active_idx ON pg_temp."BuyerBadge" ("buyerProfileId", "badgeType", "expiresAt") WHERE status = 'ACTIVE'`,
    `CREATE INDEX benchmark_relationship_parent_idx ON pg_temp.service_area_relationships (parent_service_area_id, relation_type, reviewed_at)`,
  ];
  for (const statement of statements) await tx.$executeRawUnsafe(statement);
}

async function insertConcurrentBuyer(tx: any, createdAt: Date) {
  await tx.$executeRawUnsafe(`
    INSERT INTO pg_temp."User" VALUES ('40000000-0000-4000-8000-000000000001', 'ACTIVE')
  `);
  await tx.$executeRaw`
    INSERT INTO pg_temp."BuyerProfile" VALUES
      ('concurrent-buyer', '40000000-0000-4000-8000-000000000001', 500000, 1000000, 'ACTIVE', ${createdAt}, ${createdAt}, ${createdAt})
  `;
  await tx.$executeRawUnsafe(`
    INSERT INTO pg_temp.buyer_desired_service_areas VALUES
      ('concurrent-buyer', '20000000-0000-4000-8000-000000000002', true, 'SELECTED')
  `);
}

function explainSummary(raw: unknown) {
  const document = Array.isArray(raw) ? raw[0] as Record<string, any> : raw as Record<string, any>;
  const plan = document?.Plan ?? {};
  return {
    actualRows: Number(plan["Actual Rows"] ?? 0),
    executionTimeMs: Number(document?.["Execution Time"] ?? 0),
    planningTimeMs: Number(document?.["Planning Time"] ?? 0),
    rootNode: String(plan["Node Type"] ?? "unknown"),
    scans: planScans(plan),
    sharedHitBlocks: sumPlanMetric(plan, "Shared Hit Blocks"),
    tempReadBlocks: sumPlanMetric(plan, "Temp Read Blocks"),
    tempWrittenBlocks: sumPlanMetric(plan, "Temp Written Blocks"),
  };
}

function planScans(node: Record<string, any>): string[] {
  const current = typeof node["Node Type"] === "string" && /Scan$/.test(node["Node Type"])
    ? [`${node["Node Type"]}:${node["Index Name"] ?? node["Relation Name"] ?? "unknown"}`]
    : [];
  return current.concat(
    Array.isArray(node.Plans)
      ? node.Plans.flatMap((child: Record<string, any>) => planScans(child))
      : [],
  );
}

function sumPlanMetric(node: Record<string, any>, key: string): number {
  return Number(node[key] ?? 0)
    + (Array.isArray(node.Plans)
      ? node.Plans.reduce((sum: number, child: Record<string, any>) => sum + sumPlanMetric(child, key), 0)
      : 0);
}
