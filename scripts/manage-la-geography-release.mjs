import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import path from "node:path";
import pg from "pg";
import {
  assertLaReleaseWriteConfiguration,
  loadAndValidateDataset,
} from "./service-area-import-lib.mjs";

const expectedDatasetVersion = "la-county-06037-2026-07-12-v2";
const expectedManifestSha256 = "2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47";
const expectedRelationshipsSha256 = "5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8";
const releaseMigrationName = "20260712090000_expand_la_county_geography";
const releaseMigrationPath = path.resolve("packages/db/prisma/migrations", releaseMigrationName, "migration.sql");
const expectedMigrationChecksum = createHash("sha256")
  .update(await readFile(releaseMigrationPath))
  .digest("hex");
const args = process.argv.slice(2);
const actions = args.filter((value) => value.startsWith("--"));
const positionalArgs = args.filter((value) => !value.startsWith("--"));
const manifestArg = positionalArgs[0];
const action = actions.length === 1 ? actions[0].slice(2) : "";
if (positionalArgs.length !== 1 || !new Set(["status", "stage", "activate", "rollback"]).has(action)) {
  throw new Error("Usage: npm run db:release-la-geography -- <manifest.json> --status|--stage|--activate|--rollback");
}

const dataset = await loadAndValidateDataset(path.resolve(manifestArg));
if (dataset.manifest.datasetVersion !== expectedDatasetVersion
  || dataset.checksums["manifest.json"] !== expectedManifestSha256
  || dataset.checksums["relationships.json"] !== expectedRelationshipsSha256) {
  throw new Error("Release command accepts only the exact reviewed LA County v2 checksum ledger.");
}

const connectionString = process.env.LA_GEOGRAPHY_RELEASE_DATABASE_URL;
if (action !== "status") {
  assertLaReleaseWriteConfiguration({
    action,
    allowRollback: process.env.LA_GEOGRAPHY_RELEASE_ALLOW_ROLLBACK,
    allowWrites: process.env.LA_GEOGRAPHY_RELEASE_ALLOW_WRITES,
    confirmation: process.env.LA_GEOGRAPHY_RELEASE_CONFIRM,
    databaseUrl: connectionString,
    datasetVersion: expectedDatasetVersion,
    expectedProjectRef: process.env.LA_GEOGRAPHY_RELEASE_PROJECT_REF,
    rollbackConfirmation: process.env.LA_GEOGRAPHY_RELEASE_ROLLBACK_CONFIRM,
  });
} else if (!connectionString) {
  throw new Error("LA_GEOGRAPHY_RELEASE_DATABASE_URL is required for release status.");
}

const client = new pg.Client({ connectionString });
await client.connect();
let committed = false;
try {
  let result = null;
  if (action !== "status") {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '180s'");
    await assertMigrationLedger(client);
    if (action === "stage") result = await stageDataset(client, dataset);
    if (action === "activate") result = await activateDataset(client, dataset);
    if (action === "rollback") result = await rollbackDataset(client, dataset);
    await client.query("COMMIT");
    committed = true;
  }
  console.log(JSON.stringify({ action, result, status: await releaseStatus(client) }, null, 2));
} catch (error) {
  if (!committed) {
    try { await client.query("ROLLBACK"); } catch {}
  } else {
    throw new Error("LA geography write committed, but post-commit reconciliation failed; run --status before retrying.", { cause: error });
  }
  throw error;
} finally {
  await client.end();
}

async function assertMigrationLedger(db) {
  const response = await db.query(`
    SELECT
      count(*) FILTER (
        WHERE migration_name = $1
          AND finished_at IS NOT NULL AND rolled_back_at IS NULL
      )::int AS successful,
      count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS unresolved,
      max(checksum) FILTER (
        WHERE migration_name = $1
          AND finished_at IS NOT NULL AND rolled_back_at IS NULL
      ) AS checksum
    FROM public._prisma_migrations
  `, [releaseMigrationName]);
  if (response.rows[0]?.successful !== 1
    || response.rows[0]?.unresolved !== 0
    || response.rows[0]?.checksum !== expectedMigrationChecksum) {
    throw new Error("Prisma migration history is not ready for the LA geography release.");
  }
}

async function stageDataset(db, reviewedDataset) {
  const signature = await db.query(
    "SELECT to_regprocedure('geography_admin.stage_service_area_dataset(jsonb,jsonb,text,text,jsonb,jsonb,jsonb,jsonb)') AS procedure",
  );
  if (!signature.rows[0]?.procedure) throw new Error("LA geography schema migration is not applied.");
  const response = await db.query(
    "SELECT geography_admin.stage_service_area_dataset($1::jsonb,$2::jsonb,$3::text,$4::text,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb) AS result",
    [
      reviewedDataset.manifest,
      reviewedDataset.relationships,
      reviewedDataset.checksums["manifest.json"],
      reviewedDataset.checksums["relationships.json"],
      reviewedDataset.bundles["county.geojson.gz"],
      reviewedDataset.bundles["csa-land.geojson.gz"],
      reviewedDataset.bundles["zcta.geojson.gz"],
      reviewedDataset.bundles["legal-city.geojson.gz"],
    ],
  );
  return response.rows[0]?.result ?? null;
}

async function activateDataset(db, reviewedDataset) {
  const response = await db.query(
    "SELECT geography_admin.activate_service_area_dataset($1::text,$2::text,$3::text) AS result",
    [
      reviewedDataset.manifest.datasetVersion,
      reviewedDataset.checksums["manifest.json"],
      reviewedDataset.checksums["relationships.json"],
    ],
  );
  return response.rows[0]?.result ?? null;
}

async function rollbackDataset(db, reviewedDataset) {
  const response = await db.query(
    "SELECT geography_admin.rollback_service_area_dataset($1::text) AS result",
    [reviewedDataset.manifest.datasetVersion],
  );
  return response.rows[0]?.result ?? null;
}

async function releaseStatus(db) {
  const response = await db.query(`
    SELECT
      (SELECT count(*)::int FROM public.service_areas) AS service_areas,
      (SELECT count(*)::int FROM public.service_areas WHERE active) AS active_service_areas,
      (SELECT count(*)::int FROM public.service_areas WHERE active AND type = 'city') AS active_cities,
      (SELECT count(*)::int FROM public.service_areas WHERE active AND type = 'zip') AS active_zctas,
      (SELECT count(*)::int FROM public.service_area_geometry_versions WHERE dataset_version = $1) AS geometry_versions,
      (SELECT count(*)::int FROM public.market_display_geometry_versions WHERE dataset_version = $1) AS display_versions,
      (SELECT count(*)::int FROM public.geography_dataset_versions WHERE dataset_version = $1) AS dataset_ledgers,
      (SELECT count(*)::int FROM public.geography_activation_snapshots WHERE dataset_version = $1 AND rolled_back_at IS NULL) AS active_snapshots,
      (SELECT count(*)::int FROM public._prisma_migrations
        WHERE migration_name = $2
          AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS successful_release_migrations,
      (SELECT checksum FROM public._prisma_migrations
        WHERE migration_name = $2
          AND finished_at IS NOT NULL AND rolled_back_at IS NULL
        LIMIT 1) AS release_migration_checksum,
      $3::text AS expected_release_migration_checksum,
      (SELECT count(*)::int FROM public._prisma_migrations
        WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS unresolved_migrations,
      (SELECT count(*)::int FROM public."BuyerProfile" buyer
        WHERE buyer."visibilityStatus" = 'ACTIVE' AND 1 <> (
          SELECT count(*) FROM public.buyer_desired_service_areas desired
          JOIN public.service_areas area ON area.id = desired.service_area_id
          JOIN public.markets market ON market.id = area.market_id
          WHERE desired.buyer_profile_id = buyer.id AND desired.source = 'SELECTED'
            AND desired.is_primary = true AND area.active AND market.active
        )) AS invalid_active_buyers,
      (SELECT jsonb_build_object(
        'label', market.label,
        'bbox', jsonb_build_array(market.bbox_west, market.bbox_south, market.bbox_east, market.bbox_north),
        'hasCountyBoundary', market.current_boundary_id IS NOT NULL,
        'hasDisplayBoundaries', market.current_display_geometry_id IS NOT NULL
      ) FROM public.markets market WHERE market.slug = 'los-angeles') AS market
  `, [expectedDatasetVersion, releaseMigrationName, expectedMigrationChecksum]);
  return response.rows[0] ?? null;
}
