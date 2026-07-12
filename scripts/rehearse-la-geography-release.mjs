import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import {
  assertLaReleaseWriteConfiguration,
  loadAndValidateDataset,
} from "./service-area-import-lib.mjs";

const datasetVersion = "la-county-06037-2026-07-12-v2";
const stageSql = "SELECT geography_admin.stage_service_area_dataset($1::jsonb,$2::jsonb,$3::text,$4::text,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb) result";
const activationSql = "SELECT geography_admin.activate_service_area_dataset($1::text,$2::text,$3::text) result";
const rollbackSql = "SELECT geography_admin.rollback_service_area_dataset($1::text) result";
let savepointSequence = 0;
const manifestPath = path.resolve(
  process.argv[2] ?? "data/geography/los-angeles-county/la-county-06037-2026-07-12-v2/manifest.json",
);
if (process.argv.length > 3) throw new Error("Usage: npm run db:rehearse-la-geography -- [manifest.json]");
const databaseUrl = process.env.LA_GEOGRAPHY_REHEARSAL_DATABASE_URL;
assertLaReleaseWriteConfiguration({
  action: "stage",
  allowWrites: process.env.LA_GEOGRAPHY_REHEARSAL_ALLOW_ROLLBACK_ONLY,
  confirmation: process.env.LA_GEOGRAPHY_REHEARSAL_CONFIRM,
  databaseUrl,
  datasetVersion,
  expectedProjectRef: process.env.LA_GEOGRAPHY_REHEARSAL_PROJECT_REF,
});

const dataset = await loadAndValidateDataset(manifestPath);
if (dataset.manifest.datasetVersion !== datasetVersion) throw new Error("Rehearsal dataset version is not approved.");
const migrationPath = path.resolve(
  "packages/db/prisma/migrations/20260712090000_expand_la_county_geography/migration.sql",
);
const migrationBody = stripTransactionWrappers(await readFile(migrationPath, "utf8"));
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
let transactionOpen = false;
try {
  const before = await baselineState(client);
  if (before.serviceAreas !== 15 || before.activeServiceAreas !== 15 || before.hasReleaseSchema) {
    throw new Error("Rehearsal requires the pre-release 15-area schema baseline.");
  }

  await client.query("BEGIN");
  transactionOpen = true;
  await client.query("SET LOCAL statement_timeout = '180s'");
  await client.query(migrationBody);
  const parameters = [
    dataset.manifest,
    dataset.relationships,
    dataset.checksums["manifest.json"],
    dataset.checksums["relationships.json"],
    dataset.bundles["county.geojson.gz"],
    dataset.bundles["csa-land.geojson.gz"],
    dataset.bundles["zcta.geojson.gz"],
    dataset.bundles["legal-city.geojson.gz"],
  ];
  await expectQueryFailure(client, stageSql, [
    ...parameters.slice(0, 2),
    "0".repeat(64),
    ...parameters.slice(3),
  ], "Dataset ledger checksums do not match the reviewed release");
  const alteredCsaBundle = alterFirstFeature(dataset.bundles["csa-land.geojson.gz"]);
  await expectQueryFailure(client, stageSql, [
    ...parameters.slice(0, 5),
    alteredCsaBundle,
    ...parameters.slice(6),
  ], "Source bundle JSON differs from the reviewed canonical release");
  if (await releaseDatasetCount(client) !== 0) {
    throw new Error("Rejected release evidence wrote a dataset ledger row.");
  }

  await withRolledBackSavepoint(client, async () => {
    const sentinel = "__la_rehearsal_inert_stage__";
    const changed = await client.query(`
      UPDATE public.service_areas area
      SET label = $1, source = $1, active = false
      FROM public.markets market
      WHERE market.id = area.market_id
        AND market.slug = 'los-angeles'
        AND area.slug = 'encino'
      RETURNING to_jsonb(area) AS state
    `, [sentinel]);
    if (changed.rowCount !== 1) throw new Error("Inert-stage rehearsal requires the existing Encino row.");
    const beforeStage = changed.rows[0].state;
    await functionResult(client, stageSql, parameters);
    const afterStage = (await client.query(`
      SELECT to_jsonb(area) AS state
      FROM public.service_areas area
      JOIN public.markets market ON market.id = area.market_id
      WHERE market.slug = 'los-angeles' AND area.slug = 'encino'
    `)).rows[0]?.state;
    if (JSON.stringify(afterStage) !== JSON.stringify(beforeStage)) {
      throw new Error("Staging mutated an existing inactive service-area row.");
    }
  });
  if (await releaseDatasetCount(client) !== 0) {
    throw new Error("Inert-stage savepoint did not restore the release ledger.");
  }

  const staged = await functionResult(client, stageSql, parameters);
  const stagedAgain = await functionResult(client, stageSql, parameters);
  const activationParameters = [
    datasetVersion,
    dataset.checksums["manifest.json"],
    dataset.checksums["relationships.json"],
  ];
  await assertActivationRejectsPreownedRow(client, activationParameters);
  const activated = await functionResult(client, activationSql, activationParameters);
  const activatedAgain = await functionResult(client, activationSql, activationParameters);
  const live = (await client.query(`
    SELECT
      count(*) FILTER (WHERE active AND type = 'city')::int AS cities,
      count(*) FILTER (WHERE active AND type = 'zip')::int AS zctas,
      count(*) FILTER (WHERE active AND type = 'neighborhood')::int AS neighborhoods,
      count(*) FILTER (WHERE current_geometry_id IS NOT NULL)::int AS geometry_pointers,
      count(*) FILTER (WHERE current_geometry_id IS NOT NULL AND is_pilot = false)::int AS non_pilot_pointers,
      (SELECT count(*)::int FROM geography_admin.search_active_service_areas('los-angeles', '91325', 8) WHERE exact_match) AS zip_exact,
      (SELECT area.slug FROM geography_admin.search_active_service_areas('los-angeles', '91325', 8) result
        JOIN public.service_areas area ON area.id = result.service_area_id
        WHERE result.exact_match LIMIT 1) AS zip_exact_slug,
      (SELECT count(*)::int FROM geography_admin.search_active_service_areas('los-angeles', 'northridge', 8) WHERE exact_match) AS neighborhood_exact,
      (SELECT area.slug FROM geography_admin.search_active_service_areas('los-angeles', 'northridge', 8) result
        JOIN public.service_areas area ON area.id = result.service_area_id
        WHERE result.exact_match LIMIT 1) AS neighborhood_exact_slug,
      (SELECT count(*)::int FROM public.service_area_geometry_versions
        WHERE dataset_version = $1 AND geojson->>'type' = 'Feature') AS feature_geometries
    FROM public.service_areas
    WHERE market_id = (SELECT id FROM public.markets WHERE slug = 'los-angeles')
  `, [datasetVersion])).rows[0];
  const display = (await client.query(`
    SELECT octet_length(geojson::text)::int AS json_bytes,
           jsonb_array_length(geojson->'features')::int AS features,
           sha256,
           (geojson::text ~* '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}') AS has_uuid
    FROM public.market_display_geometry_versions WHERE dataset_version = $1
  `, [datasetVersion])).rows[0];
  await assertRollbackRejectsMetadataDrift(client, "search term", `
    WITH target AS (
      SELECT id FROM public.service_area_search_terms
      WHERE source = $1 ORDER BY id LIMIT 1
    )
    UPDATE public.service_area_search_terms stored
    SET source = '__la_rehearsal_drift__'
    FROM target WHERE stored.id = target.id
    RETURNING stored.id
  `);
  await assertRollbackRejectsMetadataDrift(client, "relationship", `
    WITH target AS (
      SELECT parent_service_area_id, child_service_area_id, relation_type
      FROM public.service_area_relationships
      WHERE source = $1
      ORDER BY parent_service_area_id, child_service_area_id, relation_type
      LIMIT 1
    )
    UPDATE public.service_area_relationships stored
    SET source = '__la_rehearsal_drift__'
    FROM target
    WHERE stored.parent_service_area_id = target.parent_service_area_id
      AND stored.child_service_area_id = target.child_service_area_id
      AND stored.relation_type = target.relation_type
    RETURNING stored.parent_service_area_id
  `);
  await assertRollbackRejectsMetadataDrift(client, "additive search term", `
    INSERT INTO public.service_area_search_terms(
      market_id, service_area_id, term_normalized, term_kind, source, reviewed_at
    )
    SELECT area.market_id, area.id, 'la rehearsal additive drift',
           'DATASET_REVIEWED_ALIAS', $1, now()
    FROM public.service_areas area
    JOIN public.markets market ON market.id = area.market_id
    WHERE market.slug = 'los-angeles'
    ORDER BY area.id
    LIMIT 1
    RETURNING id
  `, "Release-owned geography contains an unapproved live key");
  await assertRollbackRejectsMetadataDrift(client, "additive relationship", `
    WITH candidate AS (
      SELECT parent.id AS parent_id, child.id AS child_id
      FROM public.service_areas parent
      JOIN public.service_areas child
        ON child.market_id = parent.market_id AND child.id <> parent.id
      JOIN public.markets market ON market.id = parent.market_id
      WHERE market.slug = 'los-angeles'
        AND NOT EXISTS (
          SELECT 1 FROM public.service_area_relationships stored
          WHERE stored.parent_service_area_id = parent.id
            AND stored.child_service_area_id = child.id
            AND stored.relation_type = 'DISPLAY_PARENT'
        )
      ORDER BY parent.id, child.id
      LIMIT 1
    )
    INSERT INTO public.service_area_relationships(
      parent_service_area_id, child_service_area_id, relation_type, source, reviewed_at
    )
    SELECT parent_id, child_id, 'DISPLAY_PARENT', $1, now()
    FROM candidate
    RETURNING parent_service_area_id
  `, "Release-owned geography contains an unapproved live key");
  await assertBuyerRollbackGuard(client);

  const rolledBack = await functionResult(client, rollbackSql, [datasetVersion]);
  const restoredActive = Number((await client.query(
    "SELECT count(*) FROM public.service_areas WHERE active",
  )).rows[0].count);
  const remainingReleaseOwned = (await client.query(`
    SELECT
      (SELECT count(*)::int FROM public.service_area_search_terms WHERE source = $1) AS search_terms,
      (SELECT count(*)::int FROM public.service_area_relationships WHERE source = $1) AS relationships
  `, [datasetVersion])).rows[0];
  assertEvidence({
    staged, stagedAgain, activated, activatedAgain, live, display, rolledBack,
    restoredActive, remainingReleaseOwned,
  });

  await client.query("ROLLBACK");
  transactionOpen = false;
  const after = await baselineState(client);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error("Outer rollback did not restore the pre-release schema and row counts.");
  }
  console.log(JSON.stringify({
    staged,
    stagedAgain,
    activated,
    activatedAgain,
    live,
    display,
    rolledBack,
    restoredActive,
    remainingReleaseOwned,
    exactChecksumGuardVerified: true,
    canonicalBundleGuardVerified: true,
    inertStagingVerified: true,
    metadataDriftGuardsVerified: true,
    additiveDriftGuardsVerified: true,
    preownedActivationGuardVerified: true,
    buyerRollbackGuardVerified: true,
    outerRollbackVerified: true,
  }, null, 2));
} catch (error) {
  if (transactionOpen) {
    try { await client.query("ROLLBACK"); } catch {}
  }
  throw error;
} finally {
  await client.end();
}

function stripTransactionWrappers(sql) {
  const wrappers = [...sql.matchAll(/^\s*(BEGIN|COMMIT);\s*$/gmi)].map((match) => match[1].toUpperCase());
  if (JSON.stringify(wrappers) !== JSON.stringify(["BEGIN", "COMMIT"])) {
    throw new Error("Migration transaction wrappers changed; rehearsal refuses to strip them.");
  }
  const withoutBegin = sql.replace(/^([\s\S]*?\n)?BEGIN;\s*/i, (match, prefix = "") => prefix);
  const body = withoutBegin.replace(/\s*COMMIT;\s*$/i, "");
  if (/^\s*(BEGIN|COMMIT);\s*$/gmi.test(body)) throw new Error("Migration body still contains a transaction boundary.");
  return body;
}

async function expectQueryFailure(db, sql, parameters, expectedMessage) {
  const savepoint = `la_expected_failure_${++savepointSequence}`;
  await db.query(`SAVEPOINT ${savepoint}`);
  let queryError;
  try {
    await db.query(sql, parameters);
  } catch (error) {
    queryError = error;
  }
  await db.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await db.query(`RELEASE SAVEPOINT ${savepoint}`);
  if (!queryError) throw new Error(`Expected database failure containing: ${expectedMessage}`);
  if (!String(queryError.message).includes(expectedMessage)) throw queryError;
}

async function withRolledBackSavepoint(db, work) {
  const savepoint = `la_rolled_back_${++savepointSequence}`;
  await db.query(`SAVEPOINT ${savepoint}`);
  try {
    await work();
  } finally {
    await db.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await db.query(`RELEASE SAVEPOINT ${savepoint}`);
  }
}

function alterFirstFeature(bundle) {
  const [first, ...remaining] = bundle.features;
  if (!first) throw new Error("Canonical bundle has no feature to alter.");
  return {
    ...bundle,
    features: [{
      ...first,
      properties: { ...first.properties, __laRehearsalMutation: true },
    }, ...remaining],
  };
}

async function releaseDatasetCount(db) {
  const result = await db.query(
    "SELECT count(*)::int AS count FROM public.geography_dataset_versions WHERE dataset_version = $1",
    [datasetVersion],
  );
  return result.rows[0].count;
}

async function assertActivationRejectsPreownedRow(db, activationParameters) {
  await withRolledBackSavepoint(db, async () => {
    const inserted = await db.query(`
      WITH candidate AS (
        SELECT dataset.market_id, area.id AS service_area_id, term.value,
               (dataset.manifest#>>'{relationshipPolicy,reviewedAt}')::timestamptz AS reviewed_at
        FROM public.geography_dataset_versions dataset
        CROSS JOIN LATERAL jsonb_array_elements(dataset.manifest->'areas') manifest_area
        JOIN public.service_areas area
          ON area.market_id = dataset.market_id AND area.slug = manifest_area->>'slug'
        CROSS JOIN LATERAL jsonb_array_elements_text(manifest_area->'searchTerms') term(value)
        LEFT JOIN public.service_area_search_terms stored
          ON stored.market_id = dataset.market_id
         AND stored.service_area_id = area.id
         AND stored.term_normalized = term.value
        WHERE dataset.dataset_version = $1 AND stored.id IS NULL
        ORDER BY area.id, term.value
        LIMIT 1
      )
      INSERT INTO public.service_area_search_terms(
        market_id, service_area_id, term_normalized, term_kind, source, reviewed_at
      )
      SELECT market_id, service_area_id, value, 'DATASET_REVIEWED_ALIAS', $1, reviewed_at
      FROM candidate
      RETURNING id
    `, [datasetVersion]);
    if (inserted.rowCount !== 1) throw new Error("Activation guard rehearsal requires one unclaimed reviewed term.");
    await expectQueryFailure(
      db,
      activationSql,
      activationParameters,
      "Release-owned live geography rows already exist before activation",
    );
  });
}

async function assertRollbackRejectsMetadataDrift(
  db,
  label,
  mutationSql,
  expectedMessage = "Live LA County geography differs from its approved activation",
) {
  await withRolledBackSavepoint(db, async () => {
    const changed = await db.query(mutationSql, [datasetVersion]);
    if (changed.rowCount !== 1) throw new Error(`Rehearsal could not mutate one release-owned ${label}.`);
    await expectQueryFailure(
      db,
      rollbackSql,
      [datasetVersion],
      expectedMessage,
    );
  });
}

async function assertBuyerRollbackGuard(db) {
  await withRolledBackSavepoint(db, async () => {
    const target = (await db.query(`
      SELECT area.id
      FROM public.geography_activation_snapshots snapshot
      CROSS JOIN LATERAL jsonb_to_recordset(snapshot.snapshot->'areas') AS previous(id uuid, active boolean)
      JOIN public.service_areas area ON area.id = previous.id
      WHERE snapshot.dataset_version = $1
        AND previous.active = false
        AND area.active = true
      ORDER BY area.id
      LIMIT 1
    `, [datasetVersion])).rows[0];
    if (!target) throw new Error("Buyer rollback rehearsal requires a newly activated service area.");

    const selection = (await db.query(`
      SELECT desired.buyer_profile_id, desired.service_area_id
      FROM public."BuyerProfile" buyer
      JOIN public.buyer_desired_service_areas desired
        ON desired.buyer_profile_id = buyer.id
       AND desired.source = 'SELECTED'
       AND desired.is_primary = true
      JOIN public.service_areas area ON area.id = desired.service_area_id
      JOIN public.markets market ON market.id = area.market_id
      WHERE buyer."visibilityStatus" = 'ACTIVE'
        AND area.active = true
        AND market.active = true
        AND desired.service_area_id <> $1
      ORDER BY buyer.id
      LIMIT 1
      FOR UPDATE OF buyer, desired
    `, [target.id])).rows[0];
    if (!selection) throw new Error("Buyer rollback rehearsal requires one ACTIVE buyer selection.");

    await db.query(`
      UPDATE public."BuyerProfile"
      SET "visibilityStatus" = 'DRAFT', "updatedAt" = now()
      WHERE id = $1
    `, [selection.buyer_profile_id]);
    const removed = await db.query(`
      DELETE FROM public.buyer_desired_service_areas
      WHERE buyer_profile_id = $1 AND service_area_id = $2
    `, [selection.buyer_profile_id, selection.service_area_id]);
    if (removed.rowCount !== 1) throw new Error("Buyer rollback rehearsal could not remove the prior selection.");
    await db.query(`
      INSERT INTO public.buyer_desired_service_areas(
        buyer_profile_id, service_area_id, source, is_primary, created_at, updated_at
      ) VALUES ($1, $2, 'SELECTED', true, now(), now())
    `, [selection.buyer_profile_id, target.id]);
    const republished = await db.query(`
      UPDATE public."BuyerProfile"
      SET "visibilityStatus" = 'ACTIVE', "updatedAt" = now()
      WHERE id = $1
    `, [selection.buyer_profile_id]);
    if (republished.rowCount !== 1) throw new Error("Buyer rollback rehearsal could not republish the profile.");
    await expectQueryFailure(
      db,
      rollbackSql,
      [datasetVersion],
      "Rollback would deactivate an ACTIVE buyer primary service area",
    );
  });
}

async function baselineState(db) {
  const result = await db.query(`
    SELECT
      (SELECT count(*)::int FROM public.service_areas) AS "serviceAreas",
      (SELECT count(*)::int FROM public.service_areas WHERE active) AS "activeServiceAreas",
      to_regclass('public.market_display_geometry_versions') IS NOT NULL AS "hasReleaseSchema"
  `);
  return result.rows[0];
}

async function functionResult(db, sql, parameters) {
  return (await db.query(sql, parameters)).rows[0]?.result ?? null;
}

function assertEvidence({
  staged,
  stagedAgain,
  activated,
  activatedAgain,
  live,
  display,
  rolledBack,
  restoredActive,
  remainingReleaseOwned,
}) {
  const checks = [
    [staged?.stagedAreas, 661, "staged areas"],
    [staged?.stagedGeometryVersions, 661, "staged geometry versions"],
    [staged?.stagedDisplayFeatures, 393, "staged display features"],
    [staged?.existingActiveAreasUntouched, 15, "untouched active areas"],
    [stagedAgain?.idempotent, true, "second-stage idempotence"],
    [activated?.activeCities, 88, "active cities"],
    [activated?.activeZctas, 304, "active ZCTAs"],
    [activated?.preservedActiveNeighborhoods, 3, "active neighborhoods"],
    [activated?.currentGeometryPointers, 661, "activation geometry pointers"],
    [activatedAgain?.idempotent, true, "second-activation idempotence"],
    [live?.cities, 88, "live cities"],
    [live?.zctas, 304, "live ZCTAs"],
    [live?.neighborhoods, 3, "live neighborhoods"],
    [live?.geometry_pointers, 661, "live geometry pointers"],
    [live?.non_pilot_pointers, 661, "non-pilot pointers"],
    [live?.feature_geometries, 661, "Feature geometries"],
    [live?.zip_exact, 1, "ZIP exact resolution"],
    [live?.zip_exact_slug, "91325", "ZIP exact target"],
    [live?.neighborhood_exact, 1, "neighborhood exact resolution"],
    [live?.neighborhood_exact_slug, "northridge", "neighborhood exact target"],
    [display?.features, 393, "display feature count"],
    [display?.json_bytes, 959052, "display JSON bytes"],
    [display?.sha256, "55813f467a184a26398b7f52d9995dcdcf5678db98b4f5950b1740ee9fd92443", "display SHA-256"],
    [display?.has_uuid, false, "display UUID privacy"],
    [rolledBack?.rolledBack, true, "rollback completion"],
    [restoredActive, 15, "restored active areas"],
    [remainingReleaseOwned?.search_terms, 0, "remaining release-owned search terms"],
    [remainingReleaseOwned?.relationships, 0, "remaining release-owned relationships"],
  ];
  const failed = checks.find(([actual, expected]) => actual !== expected);
  if (failed) throw new Error(`Rehearsal ${failed[2]} mismatch: expected ${failed[1]}, received ${failed[0]}.`);
}
