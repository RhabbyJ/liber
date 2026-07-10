import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { sameDatabaseTarget } from "./database-target.mjs";

const testUrl = process.env.GEOGRAPHY_MIGRATION_TEST_DATABASE_URL;
await assertDisposableDatabase(testUrl);

const migrationRoot = path.resolve("packages/db/prisma/migrations");
const migrations = [
  "20260708000012_add_property_subtypes_and_ownership_evidence",
  "20260709000013_add_markets_and_buyer_service_area_slugs",
  "20260709000014_add_search_rollup_relation_type",
];
const baselineMigrations = [
  "20260521000005_audit_hardening",
  "20260526000006_sprint1_security_hardening",
  "20260526000007_harden_auth_user_sync",
  "20260611000008_trim_v1_unused_schema",
  "20260707000009_add_avatar_variant",
  "20260707000010_update_auth_user_avatar_trigger",
  "20260708000011_add_service_areas",
];
const cutover = "20260709000015_canonical_service_area_cutover";
const client = new pg.Client({ connectionString: testUrl });

await client.connect();
try {
  await prepareBaselineIfRequested(client);
  await assertUpgradeBaseline(client);
  for (const migration of migrations) {
    await client.query(await migrationSql(migration));
  }

  await seedRepresentativeUpgrade(client);
  const pre = await snapshotCounts(client, "pre");
  await applyCutoverBehindInFlightBuyerWrite(testUrl, client, await migrationSql(cutover));
  const evidence = await assertUpgradeResult(client, pre);
  const concurrency = await assertConcurrentGeographyTransitions(testUrl, client);
  process.stdout.write(`${JSON.stringify({ ...evidence, concurrency }, null, 2)}\n`);
} finally {
  await client.end();
}

async function prepareBaselineIfRequested(db) {
  const state = await db.query(`
    SELECT
      to_regclass('public."BuyerProfile"') IS NOT NULL AS has_buyer_profile,
      to_regclass('public.service_areas') IS NOT NULL AS has_service_areas,
      to_regclass('public.markets') IS NOT NULL AS has_markets
  `);
  const row = state.rows[0];
  if (row?.has_service_areas) return;
  if (process.env.GEOGRAPHY_MIGRATION_TEST_PREPARE_FROM_00004 !== "true" || !row?.has_buyer_profile || row?.has_markets) {
    throw new Error("Database is not at 00011; set GEOGRAPHY_MIGRATION_TEST_PREPARE_FROM_00004=true only on a disposable 00004 baseline.");
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS public._prisma_migrations (
      id varchar(36) PRIMARY KEY,
      checksum varchar(64) NOT NULL,
      finished_at timestamptz,
      migration_name varchar(255) NOT NULL,
      logs text,
      rolled_back_at timestamptz,
      started_at timestamptz NOT NULL DEFAULT now(),
      applied_steps_count integer NOT NULL DEFAULT 0
    )
  `);
  for (const migration of baselineMigrations) {
    await db.query(await disposableBaselineSql(migration));
  }
}

async function disposableBaselineSql(name) {
  const sql = await migrationSql(name);
  if (name !== "20260521000005_audit_hardening") return sql;

  // Current Supabase projects own this PostGIS catalog table as supabase_admin,
  // so the postgres migration role cannot repeat these historical hardening
  // statements. This compatibility shim is only for constructing a disposable
  // 00012 upgrade fixture; production migration SQL remains unchanged.
  const unsupportedStatements = [
    "ALTER TABLE IF EXISTS public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;",
    "REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon, authenticated;",
  ];
  let compatibleSql = sql;
  for (const statement of unsupportedStatements) {
    if (!compatibleSql.includes(statement)) {
      throw new Error(`Expected historical 00005 statement was not found: ${statement}`);
    }
    compatibleSql = compatibleSql.replace(statement, "");
  }
  return compatibleSql;
}

async function migrationSql(name) {
  return readFile(path.join(migrationRoot, name, "migration.sql"), "utf8");
}

async function assertDisposableDatabase(url) {
  const sentinel = process.env.GEOGRAPHY_MIGRATION_TEST_SENTINEL;
  if (!url || !sentinel || sentinel.length < 16 || process.env.GEOGRAPHY_MIGRATION_TEST_ALLOW_WRITES !== "true") {
    throw new Error(
      "Set the database URL, write opt-in, and a 16+ character disposable-database sentinel.",
    );
  }
  for (const sharedUrl of [process.env.DIRECT_URL, process.env.DATABASE_URL]) {
    if (sharedUrl && sameDatabaseTarget(sharedUrl, url)) {
      throw new Error("Refusing to run the destructive geography upgrade test against the configured shared database.");
    }
  }

  const guard = new pg.Client({ connectionString: url });
  await guard.connect();
  try {
    const table = await guard.query(
      "SELECT to_regclass('public.geography_migration_test_sentinel') IS NOT NULL AS present",
    );
    if (!table.rows[0]?.present) throw new Error("Disposable-database sentinel table is missing.");
    const verified = await guard.query(
      "SELECT EXISTS (SELECT 1 FROM public.geography_migration_test_sentinel WHERE token = $1) AS verified",
      [sentinel],
    );
    if (!verified.rows[0]?.verified) throw new Error("Disposable-database sentinel does not match.");
  } finally {
    await guard.end();
  }
}

async function assertUpgradeBaseline(db) {
  const result = await db.query(`
    SELECT
      to_regclass('public."BuyerProfile"') IS NOT NULL AS has_buyer_profile,
      to_regclass('public.service_areas') IS NOT NULL AS has_service_areas,
      to_regclass('public.markets') IS NOT NULL AS has_markets
  `);
  const row = result.rows[0];
  if (!row?.has_buyer_profile || !row?.has_service_areas || row?.has_markets) {
    throw new Error("Upgrade test requires the Liber schema through 00011 and no 00013 markets table.");
  }

  const data = await db.query(`
    SELECT
      (SELECT count(*)::int FROM public."User") AS users,
      (SELECT count(*)::int FROM public."BuyerProfile") AS profiles
  `);
  if (data.rows[0]?.users !== 0 || data.rows[0]?.profiles !== 0) {
    throw new Error("Upgrade fixture database must not contain application users or buyer profiles.");
  }
}

async function seedRepresentativeUpgrade(db) {
  await db.query("BEGIN");
  try {
    await db.query(`
      INSERT INTO public.markets (
        slug, label, state, country, center_lat, center_lng,
        bbox_west, bbox_south, bbox_east, bbox_north, active
      ) VALUES (
        'secondary-ca', 'Secondary California', 'CA', 'US', 34.18, -118.10,
        -118.20, 34.10, -118.00, 34.30, true
      )
    `);
    await db.query(`
      INSERT INTO public.service_areas (
        slug, label, type, city, county, state, center_lat, center_lng,
        bbox_west, bbox_south, bbox_east, bbox_north, geojson_path,
        source, source_version, active, is_pilot, market_slug, search_terms
      ) VALUES (
        'glendale-secondary', 'Glendale', 'city', 'Glendale', 'Test County', 'CA', 34.18, -118.10,
        -118.20, 34.10, -118.00, 34.30, '/geo/service-areas/city/glendale.geojson',
        'migration_test', '1', true, false, 'secondary-ca', ARRAY['glendale', 'glendale ca']::text[]
      )
    `);

    const fixtures = [
      profile("selected-single", "ACTIVE", { desiredCity: "Glendale", desiredState: "AZ" }),
      profile("selected-multiple", "ACTIVE", { desiredCity: "Glendale", desiredState: "CA" }),
      profile("zip-priority", "ACTIVE", { desiredCity: "Burbank", desiredPostalCode: "91325", desiredState: "CA" }),
      profile("unique-city", "ACTIVE", { desiredCity: "Burbank", desiredState: "CA" }),
      profile("ambiguous-ca", "ACTIVE", { desiredCity: "Glendale", desiredState: "CA" }),
      profile("glendale-az", "ACTIVE", { desiredCity: "Glendale", desiredState: "AZ" }),
      profile("glendale-missing-state", "ACTIVE", { desiredCity: "Glendale" }),
      profile("unsupported", "ACTIVE", { desiredCity: "Sacramento", desiredState: "CA" }),
      profile("state-only", "DRAFT", { desiredState: "CA" }),
      profile("coordinates-only", "DRAFT", { desiredLat: 34.05, desiredLng: -118.25 }),
      profile("stale-inferred", "ACTIVE", { desiredCity: "Burbank", desiredState: "CA" }),
    ];

    for (const fixture of fixtures) {
      await db.query(
        `INSERT INTO public."User" (id, email, roles, "createdAt", "updatedAt")
         VALUES ($1::uuid, $2, ARRAY['BUYER']::public."UserRole"[], now(), now())`,
        [fixture.userId, `${fixture.key}@geo-migration.invalid`],
      );
      await db.query(
        `INSERT INTO public."BuyerProfile" (
           id, "userId", "displayName", "desiredLocationText", "desiredCity", "desiredState",
           "desiredNeighborhood", "desiredPostalCode", "desiredLat", "desiredLng",
           "visibilityStatus", "createdAt", "updatedAt"
         ) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10,
                   $11::public."BuyerVisibilityStatus", now(), now())`,
        [
          fixture.id,
          fixture.userId,
          `Migration ${fixture.key}`,
          fixture.desiredLocationText,
          fixture.desiredCity,
          fixture.desiredState,
          fixture.desiredNeighborhood,
          fixture.desiredPostalCode,
          fixture.desiredLat,
          fixture.desiredLng,
          fixture.visibility,
        ],
      );
    }

    await insertBuyerArea(db, "selected-single", "91325", "SELECTED");
    await insertBuyerArea(db, "selected-multiple", "91324", "SELECTED");
    await insertBuyerArea(db, "selected-multiple", "91325", "SELECTED");
    await insertBuyerArea(db, "stale-inferred", "burbank", "DERIVED");
    await insertBuyerArea(db, "stale-inferred", "glendale", "MIGRATED");
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

function profile(key, visibility, values = {}) {
  return {
    key,
    id: `geo-upgrade-${key}`,
    userId: randomUUID(),
    visibility,
    desiredLocationText: values.desiredCity ? `${values.desiredCity}${values.desiredState ? `, ${values.desiredState}` : ""}` : null,
    desiredCity: values.desiredCity ?? null,
    desiredState: values.desiredState ?? null,
    desiredNeighborhood: values.desiredNeighborhood ?? null,
    desiredPostalCode: values.desiredPostalCode ?? null,
    desiredLat: values.desiredLat ?? null,
    desiredLng: values.desiredLng ?? null,
  };
}

async function insertBuyerArea(db, profileKey, slug, source) {
  await db.query(
    `INSERT INTO public.buyer_desired_service_areas (buyer_profile_id, service_area_slug, source)
     VALUES ($1, $2, $3::public."BuyerDesiredServiceAreaSource")`,
    [`geo-upgrade-${profileKey}`, slug, source],
  );
}

async function snapshotCounts(db, stage) {
  const result = await db.query(`
    SELECT
      (SELECT count(*)::int FROM public."BuyerProfile") AS profiles,
      (SELECT count(*)::int FROM public."BuyerProfile" WHERE "visibilityStatus" = 'ACTIVE') AS active_profiles,
      (SELECT count(*)::int FROM public.buyer_desired_service_areas) AS selection_rows,
      (SELECT count(*)::int FROM public.buyer_desired_service_areas WHERE source = 'SELECTED') AS selected_rows,
      (SELECT count(*)::int FROM public.buyer_desired_service_areas WHERE source IN ('DERIVED', 'MIGRATED')) AS inferred_rows
  `);
  return { stage, ...result.rows[0] };
}

async function assertUpgradeResult(db, pre) {
  const post = await snapshotCounts(db, "post");
  assertEqual(pre, {
    stage: "pre",
    profiles: 11,
    active_profiles: 9,
    selection_rows: 5,
    selected_rows: 3,
    inferred_rows: 2,
  });
  assertEqual(post, {
    stage: "post",
    profiles: 11,
    active_profiles: 1,
    selection_rows: 1,
    selected_rows: 1,
    inferred_rows: 0,
  });

  const quarantineResult = await db.query(`
    SELECT
      quarantine.buyer_profile_id,
      quarantine.reason,
      quarantine.candidate_service_area_ids,
      quarantine.legacy_location,
      quarantine.resolution,
      quarantine.resolved_at,
      coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', service_area.id,
            'slug', service_area.slug,
            'marketSlug', market.slug
          )
          ORDER BY market.slug, service_area.slug
        )
        FROM jsonb_array_elements_text(quarantine.candidate_service_area_ids) candidate(id)
        JOIN public.service_areas service_area ON service_area.id = candidate.id::uuid
        JOIN public.markets market ON market.id = service_area.market_id
      ), '[]'::jsonb) AS candidate_service_areas
    FROM public.service_area_migration_quarantine quarantine
    ORDER BY quarantine.buyer_profile_id
  `);
  const quarantine = quarantineResult.rows;
  const expectedReasons = new Map([
    ["geo-upgrade-ambiguous-ca", "AMBIGUOUS_LEGACY_LOCATION"],
    ["geo-upgrade-coordinates-only", "UNRESOLVED_LEGACY_LOCATION"],
    ["geo-upgrade-glendale-az", "UNRESOLVED_LEGACY_LOCATION"],
    ["geo-upgrade-glendale-missing-state", "UNRESOLVED_LEGACY_LOCATION"],
    ["geo-upgrade-selected-multiple", "MULTIPLE_SELECTED_AREAS"],
    ["geo-upgrade-stale-inferred", "MIGRATED_REVIEW_REQUIRED"],
    ["geo-upgrade-state-only", "UNRESOLVED_LEGACY_LOCATION"],
    ["geo-upgrade-unique-city", "MIGRATED_REVIEW_REQUIRED"],
    ["geo-upgrade-unsupported", "UNRESOLVED_LEGACY_LOCATION"],
    ["geo-upgrade-zip-priority", "MIGRATED_REVIEW_REQUIRED"],
  ]);
  if (quarantine.length !== expectedReasons.size) {
    throw new Error(`Expected ${expectedReasons.size} quarantine rows, received ${quarantine.length}.`);
  }
  for (const row of quarantine) {
    const expected = expectedReasons.get(row.buyer_profile_id);
    if (row.reason !== expected) throw new Error(`${row.buyer_profile_id}: expected ${expected}, received ${row.reason}.`);
    if (row.resolution !== null || row.resolved_at !== null) throw new Error(`${row.buyer_profile_id}: inferred row was resolved.`);
  }

  assertCandidateCount(quarantine, "geo-upgrade-ambiguous-ca", 2);
  assertCandidateCount(quarantine, "geo-upgrade-selected-multiple", 2);
  assertCandidateCount(quarantine, "geo-upgrade-zip-priority", 1);
  assertCandidateCount(quarantine, "geo-upgrade-unique-city", 1);
  assertCandidateCount(quarantine, "geo-upgrade-stale-inferred", 1);
  assertCandidateCount(quarantine, "geo-upgrade-glendale-az", 0);
  assertCandidateCount(quarantine, "geo-upgrade-glendale-missing-state", 0);
  assertCandidateCount(quarantine, "geo-upgrade-state-only", 0);
  assertCandidateCount(quarantine, "geo-upgrade-coordinates-only", 0);
  assertCandidateAreas(quarantine, "geo-upgrade-ambiguous-ca", [
    "los-angeles/glendale",
    "secondary-ca/glendale-secondary",
  ]);
  assertCandidateAreas(quarantine, "geo-upgrade-selected-multiple", [
    "los-angeles/91324",
    "los-angeles/91325",
  ]);
  assertCandidateAreas(quarantine, "geo-upgrade-zip-priority", ["los-angeles/91325"]);
  assertCandidateAreas(quarantine, "geo-upgrade-unique-city", ["los-angeles/burbank"]);
  assertCandidateAreas(quarantine, "geo-upgrade-stale-inferred", ["los-angeles/burbank"]);
  assertCandidateAreas(quarantine, "geo-upgrade-glendale-az", []);
  assertCandidateAreas(quarantine, "geo-upgrade-glendale-missing-state", []);
  assertLegacyField(quarantine, "geo-upgrade-zip-priority", "desiredPostalCode", "91325");
  assertLegacyField(quarantine, "geo-upgrade-glendale-az", "desiredState", "AZ");
  assertLegacyField(quarantine, "geo-upgrade-glendale-missing-state", "desiredState", null);

  const selections = await db.query(`
    SELECT buyer_area.buyer_profile_id, buyer_area.source::text, service_area.slug, market.slug AS market_slug
    FROM public.buyer_desired_service_areas buyer_area
    JOIN public.service_areas service_area ON service_area.id = buyer_area.service_area_id
    JOIN public.markets market ON market.id = service_area.market_id
    ORDER BY buyer_area.buyer_profile_id
  `);
  assertEqual(selections.rows, [{
    buyer_profile_id: "geo-upgrade-selected-single",
    source: "SELECTED",
    slug: "91325",
    market_slug: "los-angeles",
  }]);

  const invalidActive = await db.query(`
    SELECT buyer_profile.id
    FROM public."BuyerProfile" buyer_profile
    WHERE buyer_profile."visibilityStatus" = 'ACTIVE'
      AND 1 <> (
        SELECT count(*)
        FROM public.buyer_desired_service_areas buyer_area
        JOIN public.service_areas service_area ON service_area.id = buyer_area.service_area_id
        JOIN public.markets market ON market.id = service_area.market_id
        WHERE buyer_area.buyer_profile_id = buyer_profile.id
          AND buyer_area.source = 'SELECTED'
          AND buyer_area.is_primary = true
          AND service_area.active = true
          AND market.active = true
      )
  `);
  if (invalidActive.rowCount !== 0) throw new Error("Active buyer invariant failed after cutover.");

  return {
    pre,
    post,
    selections: selections.rows,
    quarantine,
  };
}

function assertCandidateCount(rows, buyerProfileId, count) {
  const row = rows.find((candidate) => candidate.buyer_profile_id === buyerProfileId);
  if (!row || !Array.isArray(row.candidate_service_area_ids) || row.candidate_service_area_ids.length !== count) {
    throw new Error(`${buyerProfileId}: expected ${count} candidate service areas.`);
  }
}

function assertCandidateAreas(rows, buyerProfileId, expected) {
  const row = rows.find((candidate) => candidate.buyer_profile_id === buyerProfileId);
  const actual = (row?.candidate_service_areas ?? [])
    .map((area) => `${area.marketSlug}/${area.slug}`)
    .sort();
  assertEqual(actual, [...expected].sort());
}

function assertLegacyField(rows, buyerProfileId, field, expected) {
  const row = rows.find((candidate) => candidate.buyer_profile_id === buyerProfileId);
  if (!row) throw new Error(`${buyerProfileId}: quarantine row is missing.`);
  assertEqual(row.legacy_location?.[field] ?? null, expected);
}

function assertEqual(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Assertion failed.\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

async function applyCutoverBehindInFlightBuyerWrite(connectionString, observer, cutoverSql) {
  const writer = new pg.Client({ connectionString });
  const migrator = new pg.Client({ connectionString });
  let writerOpen = false;
  let pendingCutover;
  try {
    await Promise.all([writer.connect(), migrator.connect()]);
    await writer.query("BEGIN");
    writerOpen = true;
    await writer.query(`UPDATE public."BuyerProfile" SET bio = bio WHERE id = 'geo-upgrade-selected-single'`);

    const migratorPid = (await migrator.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    let settled = false;
    pendingCutover = migrator.query(cutoverSql).then(
      () => {
        settled = true;
        return null;
      },
      (error) => {
        settled = true;
        return error;
      },
    );

    let blocked = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (settled) break;
      const result = await observer.query("SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked", [migratorPid]);
      if (result.rows[0]?.blocked) {
        blocked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!blocked) {
      if (settled) {
        const earlyError = await pendingCutover;
        if (earlyError) throw earlyError;
      }
      throw new Error("Canonical cutover lock wait was not observed.");
    }

    await writer.query("COMMIT");
    writerOpen = false;
    const migrationError = await pendingCutover;
    if (migrationError) throw migrationError;
  } finally {
    if (writerOpen) await rollbackQuietly(writer);
    if (pendingCutover) await pendingCutover;
    await Promise.all([writer.end(), migrator.end()]);
  }
}

async function assertConcurrentGeographyTransitions(connectionString, db) {
  const selection = await db.query(`
    SELECT service_area.id AS service_area_id, service_area.market_id
    FROM public.buyer_desired_service_areas buyer_area
    JOIN public.service_areas service_area ON service_area.id = buyer_area.service_area_id
    WHERE buyer_area.buyer_profile_id = 'geo-upgrade-selected-single'
  `);
  if (selection.rowCount !== 1) throw new Error("Concurrency fixture selection is missing.");

  const fixture = {
    marketId: selection.rows[0].market_id,
    serviceAreaId: selection.rows[0].service_area_id,
  };
  const targets = [
    { label: "market", table: "markets", id: fixture.marketId },
    { label: "service_area", table: "service_areas", id: fixture.serviceAreaId },
  ];
  const passed = [];
  for (const target of targets) {
    await activationThenDeactivation(connectionString, db, fixture, target);
    passed.push(`${target.label}:activation_then_deactivation`);
    await deactivationThenActivation(connectionString, db, fixture, target);
    passed.push(`${target.label}:deactivation_then_activation`);
    await deactivationFailsFastOnBuyerWrite(connectionString, db, fixture, target);
    passed.push(`${target.label}:deadlock_avoidance`);
  }
  await concurrentRollupCycleIsRejected(connectionString, db, fixture.marketId);
  passed.push("search_rollup:concurrent_cycle_rejected");
  return passed;
}

async function concurrentRollupCycleIsRejected(connectionString, db, marketId) {
  const areas = await db.query(`
    SELECT id, slug
    FROM public.service_areas
    WHERE market_id = $1::uuid AND slug IN ('91316', '91324')
    ORDER BY slug
  `, [marketId]);
  if (areas.rowCount !== 2) throw new Error("Concurrent rollup fixture areas are missing.");
  const firstAreaId = areas.rows[0].id;
  const secondAreaId = areas.rows[1].id;

  const first = new pg.Client({ connectionString });
  const second = new pg.Client({ connectionString });
  let firstOpen = false;
  let secondOpen = false;
  let pendingReciprocal;
  try {
    await Promise.all([first.connect(), second.connect()]);
    await first.query("BEGIN");
    firstOpen = true;
    await first.query(`
      INSERT INTO public.service_area_relationships (
        parent_service_area_id, child_service_area_id, relation_type, source, reviewed_at
      ) VALUES ($1::uuid, $2::uuid, 'SEARCH_ROLLUP', 'migration-concurrency-first', now())
    `, [firstAreaId, secondAreaId]);

    await second.query("BEGIN");
    secondOpen = true;
    const secondPid = (await second.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    pendingReciprocal = second.query(`
      INSERT INTO public.service_area_relationships (
        parent_service_area_id, child_service_area_id, relation_type, source, reviewed_at
      ) VALUES ($1::uuid, $2::uuid, 'SEARCH_ROLLUP', 'migration-concurrency-second', now())
    `, [secondAreaId, firstAreaId]);
    await waitUntilBlocked(db, secondPid);

    await first.query("COMMIT");
    firstOpen = false;
    const reciprocalError = await captureError(pendingReciprocal);
    if (reciprocalError?.code !== "23514") {
      throw reciprocalError ?? new Error("Concurrent reciprocal SEARCH_ROLLUP unexpectedly committed.");
    }
    await rollbackQuietly(second);
    secondOpen = false;

    const committed = await db.query(`
      SELECT source
      FROM public.service_area_relationships
      WHERE source LIKE 'migration-concurrency-%'
      ORDER BY source
    `);
    assertEqual(committed.rows, [{ source: "migration-concurrency-first" }]);
  } finally {
    if (firstOpen) await rollbackQuietly(first);
    if (pendingReciprocal) await captureError(pendingReciprocal);
    if (secondOpen) await rollbackQuietly(second);
    await Promise.all([first.end(), second.end()]);
    await db.query("DELETE FROM public.service_area_relationships WHERE source LIKE 'migration-concurrency-%'");
  }
}

async function activationThenDeactivation(connectionString, db, fixture, target) {
  await prepareConcurrencyFixture(db, fixture, false);
  const activation = new pg.Client({ connectionString });
  const deactivation = new pg.Client({ connectionString });
  let activationOpen = false;
  let deactivationOpen = false;
  try {
    await Promise.all([activation.connect(), deactivation.connect()]);
    await activation.query("BEGIN");
    activationOpen = true;
    await activation.query(`UPDATE public."BuyerProfile" SET "visibilityStatus" = 'ACTIVE' WHERE id = 'geo-upgrade-selected-single'`);
    await activation.query("SET CONSTRAINTS ALL IMMEDIATE");

    await deactivation.query("BEGIN");
    deactivationOpen = true;
    const deactivationPid = (await deactivation.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const pendingDeactivation = deactivation.query(
      `UPDATE public.${target.table} SET active = false WHERE id = $1::uuid`,
      [target.id],
    );
    await waitUntilBlocked(db, deactivationPid);

    await activation.query("COMMIT");
    activationOpen = false;
    await pendingDeactivation;
    await deactivation.query("COMMIT");
    deactivationOpen = false;
    await assertLifecycleState(db, target, false, "DRAFT");
  } finally {
    if (activationOpen) await rollbackQuietly(activation);
    if (deactivationOpen) await rollbackQuietly(deactivation);
    await Promise.all([activation.end(), deactivation.end()]);
  }
}

async function deactivationThenActivation(connectionString, db, fixture, target) {
  await prepareConcurrencyFixture(db, fixture, false);
  const activation = new pg.Client({ connectionString });
  const deactivation = new pg.Client({ connectionString });
  let activationOpen = false;
  let deactivationOpen = false;
  let pendingValidation;
  try {
    await Promise.all([activation.connect(), deactivation.connect()]);
    await deactivation.query("BEGIN");
    deactivationOpen = true;
    await deactivation.query(`UPDATE public.${target.table} SET active = false WHERE id = $1::uuid`, [target.id]);

    await activation.query("BEGIN");
    activationOpen = true;
    await activation.query(`UPDATE public."BuyerProfile" SET "visibilityStatus" = 'ACTIVE' WHERE id = 'geo-upgrade-selected-single'`);
    const activationPid = (await activation.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    pendingValidation = activation.query("SET CONSTRAINTS ALL IMMEDIATE");
    await waitUntilBlocked(db, activationPid);

    await deactivation.query("COMMIT");
    deactivationOpen = false;
    const validationError = await captureError(pendingValidation);
    if (validationError?.code !== "23514") {
      throw validationError ?? new Error(`${target.label}: concurrent activation unexpectedly committed.`);
    }
    await rollbackQuietly(activation);
    activationOpen = false;
    await assertLifecycleState(db, target, false, "DRAFT");
  } finally {
    if (deactivationOpen) await rollbackQuietly(deactivation);
    if (pendingValidation) await captureError(pendingValidation);
    if (activationOpen) await rollbackQuietly(activation);
    await Promise.all([activation.end(), deactivation.end()]);
  }
}

async function deactivationFailsFastOnBuyerWrite(connectionString, db, fixture, target) {
  await prepareConcurrencyFixture(db, fixture, true);
  const buyerWrite = new pg.Client({ connectionString });
  const deactivation = new pg.Client({ connectionString });
  let buyerWriteOpen = false;
  let deactivationOpen = false;
  try {
    await Promise.all([buyerWrite.connect(), deactivation.connect()]);
    await buyerWrite.query("BEGIN");
    buyerWriteOpen = true;
    await buyerWrite.query(`UPDATE public."BuyerProfile" SET bio = bio WHERE id = 'geo-upgrade-selected-single'`);

    await deactivation.query("BEGIN");
    deactivationOpen = true;
    const deactivationError = await captureError(withTimeout(
      deactivation.query(`UPDATE public.${target.table} SET active = false WHERE id = $1::uuid`, [target.id]),
      2_000,
      `${target.label}: deactivation waited instead of failing fast`,
    ));
    if (deactivationError?.code !== "55P03") {
      throw deactivationError ?? new Error(`${target.label}: deactivation unexpectedly committed during buyer write.`);
    }
    await rollbackQuietly(deactivation);
    deactivationOpen = false;
    await buyerWrite.query("COMMIT");
    buyerWriteOpen = false;
    await assertLifecycleState(db, target, true, "ACTIVE");
  } finally {
    if (buyerWriteOpen) await rollbackQuietly(buyerWrite);
    if (deactivationOpen) await rollbackQuietly(deactivation);
    await Promise.all([buyerWrite.end(), deactivation.end()]);
  }
}

async function prepareConcurrencyFixture(db, fixture, active) {
  await db.query(`UPDATE public."BuyerProfile" SET "visibilityStatus" = 'DRAFT' WHERE id = 'geo-upgrade-selected-single'`);
  await db.query("UPDATE public.markets SET active = true WHERE id = $1::uuid", [fixture.marketId]);
  await db.query("UPDATE public.service_areas SET active = true WHERE id = $1::uuid", [fixture.serviceAreaId]);
  if (active) {
    await db.query(`UPDATE public."BuyerProfile" SET "visibilityStatus" = 'ACTIVE' WHERE id = 'geo-upgrade-selected-single'`);
  }
}

async function assertLifecycleState(db, target, expectedGeographyActive, expectedBuyerStatus) {
  const result = await db.query(`
    SELECT
      (SELECT active FROM public.${target.table} WHERE id = $1::uuid) AS geography_active,
      (SELECT "visibilityStatus"::text FROM public."BuyerProfile" WHERE id = 'geo-upgrade-selected-single') AS buyer_status
  `, [target.id]);
  assertEqual(result.rows[0], {
    geography_active: expectedGeographyActive,
    buyer_status: expectedBuyerStatus,
  });
}

async function waitUntilBlocked(db, pid) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await db.query("SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked", [pid]);
    if (result.rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Backend ${pid} did not enter the expected lock wait.`);
}

async function captureError(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

async function rollbackQuietly(db) {
  try {
    await db.query("ROLLBACK");
  } catch {
    // The original assertion error is more useful than rollback cleanup noise.
  }
}

async function withTimeout(promise, milliseconds, message) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
