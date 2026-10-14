import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import {
  assertLaReleaseWriteConfiguration,
  loadAndValidateDataset,
} from "./service-area-import-lib.mjs";

// Rollback-only proof for the LA County community activation. Every statement,
// including the migration body, runs inside one transaction that is rolled back.
const datasetVersion = "la-county-06037-2026-07-12-v2";
const communityRelease = "la-county-06037-2026-07-12-v2-communities-2026-10-13";
const activateSql = "SELECT geography_admin.activate_la_county_communities($1::text,$2::text,$3::text) result";
const rollbackSql = "SELECT geography_admin.rollback_la_county_communities($1::text) result";
const v2ActivateSql = "SELECT geography_admin.activate_service_area_dataset($1::text,$2::text,$3::text) result";
const v2RollbackSql = "SELECT geography_admin.rollback_service_area_dataset($1::text) result";
let savepointSequence = 0;

if (process.argv.length > 3) throw new Error("Usage: npm run db:rehearse-la-communities -- [manifest.json]");
const manifestPath = path.resolve(
  process.argv[2] ?? `data/geography/los-angeles-county/${datasetVersion}/manifest.json`,
);
const databaseUrl = process.env.LA_GEOGRAPHY_REHEARSAL_DATABASE_URL;
assertLaReleaseWriteConfiguration({
  action: "activate",
  allowWrites: process.env.LA_GEOGRAPHY_REHEARSAL_ALLOW_ROLLBACK_ONLY,
  confirmation: process.env.LA_GEOGRAPHY_REHEARSAL_CONFIRM,
  databaseUrl,
  datasetVersion: communityRelease,
  expectedProjectRef: process.env.LA_GEOGRAPHY_REHEARSAL_PROJECT_REF,
});

const dataset = await loadAndValidateDataset(manifestPath);
if (dataset.manifest.datasetVersion !== datasetVersion) throw new Error("Rehearsal dataset version is not approved.");
const ledger = [communityRelease, dataset.checksums["manifest.json"], dataset.checksums["relationships.json"]];
const v2Ledger = [datasetVersion, dataset.checksums["manifest.json"], dataset.checksums["relationships.json"]];
const migrationBody = stripTransactionWrappers(await readFile(path.resolve(
  "packages/db/prisma/migrations/20261013090000_activate_la_county_communities/migration.sql",
), "utf8"));

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
let transactionOpen = false;
try {
  const before = await liveState(client);
  if (before.neighborhoods !== 3 || before.cities !== 88 || before.zctas !== 304 || before.communitySnapshots !== 0) {
    throw new Error(`Rehearsal requires the live v2 state with three pilot communities: ${JSON.stringify(before)}`);
  }

  await client.query("BEGIN");
  transactionOpen = true;
  await client.query("SET LOCAL statement_timeout = '180s'");
  await client.query(migrationBody);

  await expectQueryFailure(client, activateSql, ["la-county-unknown", ...ledger.slice(1)], "exact reviewed LA County v2 checksum ledger");
  await expectQueryFailure(client, activateSql, [communityRelease, "0".repeat(64), ledger[2]], "exact reviewed LA County v2 checksum ledger");
  await expectQueryFailure(client, rollbackSql, [communityRelease], "active community rollback snapshot is not available");

  const activated = await functionResult(client, activateSql, ledger);
  const activatedAgain = await functionResult(client, activateSql, ledger);
  const afterActivation = await liveState(client);
  const lookups = await communityLookups(client);
  const v2Idempotent = await functionResult(client, v2ActivateSql, v2Ledger);
  await expectQueryFailure(client, v2RollbackSql, [datasetVersion], "blocked by missing or newer live geography state");
  await assertBuyerRollbackGuard(client);

  const rolledBack = await functionResult(client, rollbackSql, [communityRelease]);
  const afterRollback = await liveState(client);
  const v2AfterRollback = await functionResult(client, v2ActivateSql, v2Ledger);
  await expectQueryFailure(client, activateSql, ledger, "rolled-back community release cannot be reactivated");

  await client.query("ROLLBACK");
  transactionOpen = false;
  const after = await liveState(client);

  const evidence = {
    activated,
    activatedAgain,
    afterActivation,
    afterRollback,
    before,
    lookups,
    outerRollbackRestoredState: JSON.stringify(after) === JSON.stringify(before),
    rolledBack,
    v2AfterRollback,
    v2Idempotent,
  };
  assertEvidence(evidence);
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  if (transactionOpen) {
    try { await client.query("ROLLBACK"); } catch {}
  }
  throw error;
} finally {
  await client.end();
}

function assertEvidence(evidence) {
  const failures = [];
  if (evidence.activated?.activatedCommunities !== 266 || evidence.activated?.idempotent !== false) failures.push("activation");
  if (evidence.activatedAgain?.idempotent !== true) failures.push("idempotent activation");
  if (evidence.afterActivation.neighborhoods !== 269 || evidence.afterActivation.cities !== 88
    || evidence.afterActivation.zctas !== 304 || evidence.afterActivation.communitySnapshots !== 1) failures.push("activated counts");
  if (evidence.afterActivation.invalidActiveBuyers !== 0) failures.push("active buyers after activation");
  if (!evidence.lookups.granadaHillsActive || !evidence.lookups.nohoAlias || !evidence.lookups.losAngelesRollsUpGranadaHills) failures.push("lookups");
  if (evidence.v2Idempotent?.idempotent !== true || evidence.v2AfterRollback?.idempotent !== true) failures.push("v2 invariant");
  if (evidence.rolledBack?.rolledBack !== true) failures.push("rollback");
  if (evidence.afterRollback.neighborhoods !== 3 || evidence.afterRollback.communityTerms !== 0) failures.push("rollback counts");
  if (!evidence.outerRollbackRestoredState) failures.push("outer transaction rollback");
  if (failures.length > 0) throw new Error(`Community rehearsal failed: ${failures.join(", ")}`);
}

async function liveState(db) {
  const result = await db.query(`
    SELECT
      count(*) FILTER (WHERE area.active AND area.type = 'city')::int AS cities,
      count(*) FILTER (WHERE area.active AND area.type = 'zip')::int AS zctas,
      count(*) FILTER (WHERE area.active AND area.type = 'neighborhood')::int AS neighborhoods,
      (SELECT count(*)::int FROM public.service_area_search_terms WHERE source = $1) AS "communityTerms",
      (SELECT count(*)::int FROM public.geography_activation_snapshots
        WHERE dataset_version = $1 AND rolled_back_at IS NULL) AS "communitySnapshots",
      (SELECT count(*)::int FROM public."BuyerProfile" buyer
        WHERE buyer."visibilityStatus" = 'ACTIVE' AND 1 <> (
          SELECT count(*) FROM public.buyer_desired_service_areas desired
          JOIN public.service_areas selected ON selected.id = desired.service_area_id
          JOIN public.markets market ON market.id = selected.market_id
          WHERE desired.buyer_profile_id = buyer.id AND desired.source = 'SELECTED'
            AND desired.is_primary AND selected.active AND market.active
        )) AS "invalidActiveBuyers"
    FROM public.service_areas area
    JOIN public.markets market ON market.id = area.market_id
    WHERE market.slug = 'los-angeles'
  `, [communityRelease]);
  return result.rows[0];
}

async function communityLookups(db) {
  const result = await db.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM public.service_areas area
        JOIN public.service_area_search_terms term ON term.service_area_id = area.id
        WHERE area.slug = 'granada-hills' AND area.active AND term.term_normalized = 'granada hills'
      ) AS "granadaHillsActive",
      EXISTS (
        SELECT 1 FROM public.service_areas area
        JOIN public.service_area_search_terms term ON term.service_area_id = area.id
        WHERE area.slug = 'north-hollywood' AND area.active AND term.term_normalized = 'noho'
      ) AS "nohoAlias",
      EXISTS (
        SELECT 1 FROM public.service_area_relationships relationship
        JOIN public.service_areas parent ON parent.id = relationship.parent_service_area_id
        JOIN public.service_areas child ON child.id = relationship.child_service_area_id
        WHERE parent.slug = 'los-angeles' AND child.slug = 'granada-hills'
          AND relationship.relation_type = 'SEARCH_ROLLUP' AND relationship.reviewed_at IS NOT NULL
          AND child.active
      ) AS "losAngelesRollsUpGranadaHills"
  `);
  return result.rows[0];
}

async function assertBuyerRollbackGuard(db) {
  await withRolledBackSavepoint(db, async () => {
    const target = (await db.query(
      "SELECT area.id FROM public.service_areas area WHERE area.slug = 'granada-hills' AND area.active",
    )).rows[0];
    const selection = (await db.query(`
      SELECT desired.buyer_profile_id, desired.service_area_id
      FROM public."BuyerProfile" buyer
      JOIN public.buyer_desired_service_areas desired
        ON desired.buyer_profile_id = buyer.id AND desired.source = 'SELECTED' AND desired.is_primary = true
      WHERE buyer."visibilityStatus" = 'ACTIVE' AND desired.service_area_id <> $1
      ORDER BY buyer.id
      LIMIT 1
      FOR UPDATE OF buyer, desired
    `, [target?.id])).rows[0];
    if (!target || !selection) throw new Error("Buyer rollback rehearsal requires Granada Hills and one ACTIVE buyer.");

    await db.query(`UPDATE public."BuyerProfile" SET "visibilityStatus" = 'DRAFT', "updatedAt" = now() WHERE id = $1`, [selection.buyer_profile_id]);
    await db.query(
      "DELETE FROM public.buyer_desired_service_areas WHERE buyer_profile_id = $1 AND service_area_id = $2",
      [selection.buyer_profile_id, selection.service_area_id],
    );
    await db.query(`
      INSERT INTO public.buyer_desired_service_areas(
        buyer_profile_id, service_area_id, source, is_primary, created_at, updated_at
      ) VALUES ($1, $2, 'SELECTED', true, now(), now())
    `, [selection.buyer_profile_id, target.id]);
    await db.query(`UPDATE public."BuyerProfile" SET "visibilityStatus" = 'ACTIVE', "updatedAt" = now() WHERE id = $1`, [selection.buyer_profile_id]);
    await expectQueryFailure(db, rollbackSql, [communityRelease], "Rollback would deactivate an ACTIVE buyer primary service area");
  });
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
  const savepoint = `la_community_expected_failure_${++savepointSequence}`;
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
  const savepoint = `la_community_rolled_back_${++savepointSequence}`;
  await db.query(`SAVEPOINT ${savepoint}`);
  try {
    await work();
  } finally {
    await db.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await db.query(`RELEASE SAVEPOINT ${savepoint}`);
  }
}

async function functionResult(db, sql, parameters) {
  return (await db.query(sql, parameters)).rows[0]?.result ?? null;
}
