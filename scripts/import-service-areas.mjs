import "dotenv/config";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import {
  assertImportWriteConfiguration,
  loadAndValidateDataset,
} from "./service-area-import-lib.mjs";

const args = process.argv.slice(2);
const positionalArgs = args.filter((value) => !value.startsWith("--"));
const manifestArg = positionalArgs[0];
const write = args.includes("--write");
if (positionalArgs.length !== 1 || (write && args.includes("--validate-only")) || args.includes("--activate")
  || args.some((value) => value.startsWith("--") && value !== "--validate-only" && value !== "--write")) {
  throw new Error("Usage: npm run db:import-service-areas -- <manifest.json> [--validate-only | --write]. LA activation is unavailable.");
}

const dataset = await loadAndValidateDataset(path.resolve(manifestArg));
if (!write) {
  console.log(`Validated ${dataset.manifest.counts.areas} inactive LA County service areas, ${dataset.relationships.counts.displayParents} official display parents, and ${dataset.relationships.counts.searchRollups} official search rollups. No database writes were requested.`);
  process.exit(0);
}
if (dataset.manifest.schemaVersion !== 2) {
  throw new Error("Database staging requires the reviewed schemaVersion 2 LA County dataset with legal-city display evidence.");
}

const connectionString = process.env.SERVICE_AREA_IMPORT_DATABASE_URL;
const sentinel = process.env.SERVICE_AREA_IMPORT_SENTINEL;
assertImportWriteConfiguration({
  allowWrites: process.env.SERVICE_AREA_IMPORT_ALLOW_WRITES,
  databaseUrl: connectionString,
  sentinel,
  sharedDatabaseUrls: configuredSharedDatabaseUrls(),
});

const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await assertDisposableImportTarget(client, sentinel);
  await client.query("BEGIN");
  const proposalCheck = await client.query(
    "SELECT to_regprocedure('geography_admin.stage_service_area_dataset(jsonb,jsonb,text,text,jsonb,jsonb,jsonb,jsonb)') AS procedure",
  );
  if (!proposalCheck.rows[0]?.procedure) {
    throw new Error("The LA County geography migration must be applied on the disposable target before staging this dataset.");
  }
  const result = await client.query(
    "SELECT geography_admin.stage_service_area_dataset($1::jsonb, $2::jsonb, $3::text, $4::text, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb) AS result",
    [
      dataset.manifest,
      dataset.relationships,
      dataset.checksums["manifest.json"],
      dataset.checksums["relationships.json"],
      dataset.bundles["county.geojson.gz"],
      dataset.bundles["csa-land.geojson.gz"],
      dataset.bundles["zcta.geojson.gz"],
      dataset.bundles["legal-city.geojson.gz"],
    ],
  );
  await client.query("COMMIT");
  console.log(JSON.stringify(result.rows[0]?.result ?? {}, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}

async function assertDisposableImportTarget(client, expectedSentinel) {
  const table = await client.query(
    "SELECT to_regclass('public.geography_migration_test_sentinel') IS NOT NULL AS present",
  );
  if (!table.rows[0]?.present) throw new Error("Disposable geography sentinel table is missing.");
  const verified = await client.query(
    "SELECT EXISTS (SELECT 1 FROM public.geography_migration_test_sentinel WHERE token = $1) AS verified",
    [expectedSentinel],
  );
  if (!verified.rows[0]?.verified) throw new Error("Disposable geography sentinel does not match.");
}

function configuredSharedDatabaseUrls() {
  const explicit = process.env.SERVICE_AREA_IMPORT_SHARED_DATABASE_URLS;
  if (explicit !== undefined) {
    const parsed = JSON.parse(explicit);
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
      throw new Error("SERVICE_AREA_IMPORT_SHARED_DATABASE_URLS must be a JSON string array.");
    }
    return parsed;
  }
  return [process.env.DIRECT_URL, process.env.DATABASE_URL].filter(Boolean);
}
