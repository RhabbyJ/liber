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
const layerVersion = "la-county-06037-2026-10-13-communities-v1";
const activationSql = "SELECT geography_admin.activate_la_county_communities($1::text,$2::text,$3::text) result";
const rollbackSql = "SELECT geography_admin.rollback_la_county_communities($1::text) result";
const countyRollbackSql = "SELECT geography_admin.rollback_service_area_dataset($1::text) result";
let savepointSequence = 0;
const manifestPath = path.resolve(
  process.argv[2] ?? "data/geography/los-angeles-county/la-county-06037-2026-07-12-v2/manifest.json",
);
if (process.argv.length > 3) throw new Error("Usage: npm run db:rehearse-la-communities -- [manifest.json]");
const databaseUrl = process.env.LA_GEOGRAPHY_REHEARSAL_DATABASE_URL;
assertLaReleaseWriteConfiguration({
  action: "activate-communities",
  allowWrites: process.env.LA_GEOGRAPHY_REHEARSAL_ALLOW_ROLLBACK_ONLY,
  confirmation: process.env.LA_GEOGRAPHY_REHEARSAL_CONFIRM,
  databaseUrl,
  datasetVersion: layerVersion,
  expectedProjectRef: process.env.LA_GEOGRAPHY_REHEARSAL_PROJECT_REF,
});

const dataset = await loadAndValidateDataset(manifestPath);
if (dataset.manifest.datasetVersion !== datasetVersion) throw new Error("Rehearsal dataset version is not approved.");
const migrationPath = path.resolve(
  "packages/db/prisma/migrations/20261013120000_activate_la_county_communities/migration.sql",
);
const migrationBody = stripTransactionWrappers(await readFile(migrationPath, "utf8"));
const activationParameters = [
  layerVersion,
  dataset.checksums["manifest.json"],
  dataset.checksums["relationships.json"],
];
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
let transactionOpen = false;
try {
  const before = await baselineState(client);
  if (before.cities !== 88 || before.zctas !== 304 || before.neighborhoods !== 3
    || before.liveCountySnapshots !== 1 || before.hasLayerFunctions) {
    throw new Error("Rehearsal requires the active LA County release before the community-layer migration.");
  }

  await client.query("BEGIN");
  transactionOpen = true;
  await client.query("SET LOCAL statement_timeout = '180s'");
  await client.query(migrationBody);

  await expectQueryFailure(
    client,
    activationSql,
    ["la-county-06037-2026-10-13-communities-v0", ...activationParameters.slice(1)],
    "Community activation requires the exact reviewed layer",
  );
  await expectQueryFailure(
    client,
    activationSql,
    [layerVersion, "0".repeat(64), activationParameters[2]],
    "Community activation requires the exact reviewed layer",
  );
  await assertActivationRejectsPreownedRow(client);

  const searchBefore = await searchEvidence(client);
  const activated = await functionResult(client, activationSql, activationParameters);
  const activatedAgain = await functionResult(client, activationSql, activationParameters);
  const live = await liveState(client);
  const searchAfter = await searchEvidence(client);
  const coverage = (await client.query(`
    WITH RECURSIVE coverage(id) AS (
      SELECT area.id FROM public.service_areas area
      JOIN public.markets market ON market.id = area.market_id
      WHERE market.slug = 'los-angeles' AND area.slug = 'los-angeles' AND area.active
      UNION
      SELECT relationship.child_service_area_id
      FROM public.service_area_relationships relationship
      JOIN coverage parent ON parent.id = relationship.parent_service_area_id
      JOIN public.service_areas child ON child.id = relationship.child_service_area_id
      WHERE relationship.relation_type = 'SEARCH_ROLLUP'
        AND relationship.reviewed_at IS NOT NULL
        AND child.active
    )
    SELECT count(*) FILTER (WHERE area.type = 'neighborhood')::int AS communities,
           bool_or(area.slug = 'granada-hills') AS includes_granada_hills
    FROM coverage JOIN public.service_areas area ON area.id = coverage.id
  `)).rows[0];

  await expectQueryFailure(
    client,
    countyRollbackSql,
    [datasetVersion],
    "Rollback is blocked by missing or newer live geography state",
  );
  await assertRollbackRejectsDrift(client, "alias provenance", `
    WITH target AS (
      SELECT id FROM public.service_area_search_terms
      WHERE source = $1 ORDER BY id LIMIT 1
    )
    UPDATE public.service_area_search_terms stored
    SET source = '__la_rehearsal_drift__'
    FROM target WHERE stored.id = target.id
    RETURNING stored.id
  `, "Community-layer search aliases differ from their approved activation");
  await assertRollbackRejectsDrift(client, "additive alias", `
    INSERT INTO public.service_area_search_terms(
      market_id, service_area_id, term_normalized, term_kind, source, reviewed_at
    )
    SELECT area.market_id, area.id, 'la rehearsal additive drift',
           'COMMUNITY_REVIEWED_ALIAS', $1, now()
    FROM public.service_areas area
    JOIN public.markets market ON market.id = area.market_id
    WHERE market.slug = 'los-angeles' AND area.slug = 'granada-hills'
    RETURNING id
  `, "Community-layer geography contains an unapproved live key");
  await assertRollbackRejectsDrift(client, "community active flag", `
    UPDATE public.service_areas area
    SET active = false, updated_at = now()
    FROM public.markets market
    WHERE market.id = area.market_id
      AND market.slug = 'los-angeles'
      AND area.slug = (
        SELECT candidate.slug FROM public.service_areas candidate
        WHERE candidate.market_id = market.id AND candidate.type = 'neighborhood'
          AND candidate.slug NOT IN ('encino', 'northridge', 'tarzana')
          AND NOT EXISTS (
            SELECT 1 FROM public.buyer_desired_service_areas desired
            WHERE desired.service_area_id = candidate.id
          )
        ORDER BY candidate.slug LIMIT 1
      )
    RETURNING area.id
  `, "Live LA County geography differs from its approved activation", []);
  await assertBuyerRollbackGuard(client);

  const rolledBack = await functionResult(client, rollbackSql, [layerVersion]);
  const restored = await liveState(client);
  const searchRestored = await searchEvidence(client);
  await expectQueryFailure(
    client,
    activationSql,
    activationParameters,
    "A rolled-back community layer cannot be reactivated",
  );
  assertEvidence({
    activated, activatedAgain, live, searchBefore, searchAfter, coverage, rolledBack, restored, searchRestored,
  });

  await client.query("ROLLBACK");
  transactionOpen = false;
  const after = await baselineState(client);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error("Outer rollback did not restore the pre-layer schema and row counts.");
  }
  console.log(JSON.stringify({
    activated,
    activatedAgain,
    live,
    searchBefore,
    searchAfter,
    coverage,
    rolledBack,
    restored,
    searchRestored,
    exactLayerGuardVerified: true,
    preownedActivationGuardVerified: true,
    countyRollbackBlockedWhileLayerLive: true,
    driftGuardsVerified: true,
    buyerRollbackGuardVerified: true,
    reactivationRejected: true,
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

async function assertActivationRejectsPreownedRow(db) {
  await withRolledBackSavepoint(db, async () => {
    const inserted = await db.query(`
      INSERT INTO public.service_area_search_terms(
        market_id, service_area_id, term_normalized, term_kind, source, reviewed_at
      )
      SELECT area.market_id, area.id, 'la rehearsal preowned layer row',
             'COMMUNITY_REVIEWED_ALIAS', $1, now()
      FROM public.service_areas area
      JOIN public.markets market ON market.id = area.market_id
      WHERE market.slug = 'los-angeles' AND area.slug = 'los-angeles'
      RETURNING id
    `, [layerVersion]);
    if (inserted.rowCount !== 1) throw new Error("Activation guard rehearsal requires the Los Angeles city row.");
    await expectQueryFailure(
      db,
      activationSql,
      activationParameters,
      "Layer-owned live geography rows already exist before activation",
    );
  });
}

async function assertRollbackRejectsDrift(db, label, mutationSql, expectedMessage, parameters = [layerVersion]) {
  await withRolledBackSavepoint(db, async () => {
    const changed = await db.query(mutationSql, parameters);
    if (changed.rowCount !== 1) throw new Error(`Rehearsal could not apply one ${label} drift.`);
    await expectQueryFailure(db, rollbackSql, [layerVersion], expectedMessage);
  });
}

async function assertBuyerRollbackGuard(db) {
  await withRolledBackSavepoint(db, async () => {
    const target = (await db.query(`
      SELECT area.id FROM public.service_areas area
      JOIN public.markets market ON market.id = area.market_id
      WHERE market.slug = 'los-angeles' AND area.slug = 'granada-hills' AND area.active
    `)).rows[0];
    if (!target) throw new Error("Buyer rollback rehearsal requires the activated Granada Hills community.");

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
      [layerVersion],
      "Rollback would deactivate an ACTIVE buyer primary service area",
    );
  });
}

async function baselineState(db) {
  const result = await db.query(`
    SELECT
      (SELECT count(*)::int FROM public.service_areas WHERE active AND type = 'city') AS cities,
      (SELECT count(*)::int FROM public.service_areas WHERE active AND type = 'zip') AS zctas,
      (SELECT count(*)::int FROM public.service_areas WHERE active AND type = 'neighborhood') AS neighborhoods,
      (SELECT count(*)::int FROM public.service_area_search_terms) AS "searchTerms",
      (SELECT count(*)::int FROM public.geography_activation_snapshots
        WHERE dataset_version = $1 AND rolled_back_at IS NULL) AS "liveCountySnapshots",
      (SELECT count(*)::int FROM public.geography_activation_snapshots WHERE dataset_version = $2) AS "layerSnapshots",
      to_regprocedure('geography_admin.activate_la_county_communities(text,text,text)') IS NOT NULL AS "hasLayerFunctions"
  `, [datasetVersion, layerVersion]);
  return result.rows[0];
}

async function liveState(db) {
  const result = await db.query(`
    SELECT
      count(*) FILTER (WHERE active AND type = 'city')::int AS cities,
      count(*) FILTER (WHERE active AND type = 'zip')::int AS zctas,
      count(*) FILTER (WHERE active AND type = 'neighborhood')::int AS neighborhoods,
      (SELECT count(*)::int FROM public.service_area_search_terms WHERE source = $1) AS layer_aliases
    FROM public.service_areas
    WHERE market_id = (SELECT id FROM public.markets WHERE slug = 'los-angeles')
  `, [layerVersion]);
  return result.rows[0];
}

async function searchEvidence(db) {
  const probes = ["granada hills", "granda hils", "hills", "noho", "downtown", "arcadia", "91344"];
  const evidence = {};
  for (const probe of probes) {
    const rows = (await db.query(`
      SELECT area.slug, result.exact_match
      FROM geography_admin.search_active_service_areas('los-angeles', $1, 8) result
      JOIN public.service_areas area ON area.id = result.service_area_id
    `, [probe])).rows;
    evidence[probe] = {
      exact: rows.filter((row) => row.exact_match).map((row) => row.slug),
      suggestions: rows.map((row) => row.slug),
    };
  }
  return evidence;
}

async function functionResult(db, sql, parameters) {
  return (await db.query(sql, parameters)).rows[0]?.result ?? null;
}

function assertEvidence({
  activated,
  activatedAgain,
  live,
  searchBefore,
  searchAfter,
  coverage,
  rolledBack,
  restored,
  searchRestored,
}) {
  const checks = [
    [activated?.activeCities, 88, "active cities"],
    [activated?.activeZctas, 304, "active ZCTAs"],
    [activated?.activeCommunities, 269, "active communities"],
    [activated?.newlyActivatedCommunities, 266, "newly activated communities"],
    [activated?.reviewedAliases, 13, "reviewed aliases"],
    [activatedAgain?.idempotent, true, "second-activation idempotence"],
    [live?.cities, 88, "live cities"],
    [live?.zctas, 304, "live ZCTAs"],
    [live?.neighborhoods, 269, "live communities"],
    [live?.layer_aliases, 13, "live layer aliases"],
    [searchBefore["granada hills"].suggestions.includes("granada-hills"), false, "pre-layer Granada Hills absence"],
    [searchAfter["granada hills"].exact.join(","), "granada-hills", "Granada Hills exact resolution"],
    [searchAfter["granda hils"].suggestions[0], "granada-hills", "typo suggestion"],
    [searchAfter.hills.suggestions.includes("granada-hills"), true, "word-prefix suggestion"],
    [searchAfter.noho.exact.join(","), "north-hollywood", "reviewed alias resolution"],
    [searchAfter.downtown.exact.length, 2, "ambiguous downtown"],
    [searchAfter.arcadia.exact.join(","), "arcadia", "city precedence"],
    [searchAfter["91344"].exact.join(","), "91344", "ZIP exact resolution"],
    [coverage?.communities, 139, "Los Angeles community rollup coverage"],
    [coverage?.includes_granada_hills, true, "Granada Hills rollup"],
    [rolledBack?.rolledBack, true, "rollback completion"],
    [rolledBack?.restoredActiveCommunities, 3, "restored active communities"],
    [restored?.neighborhoods, 3, "restored live communities"],
    [restored?.layer_aliases, 0, "remaining layer aliases"],
    [searchRestored["granada hills"].suggestions.includes("granada-hills"), false, "post-rollback Granada Hills absence"],
  ];
  const failed = checks.find(([actual, expected]) => actual !== expected);
  if (failed) throw new Error(`Rehearsal ${failed[2]} mismatch: expected ${failed[1]}, received ${failed[0]}.`);
}
