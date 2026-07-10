import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { sameDatabaseTarget } from "./database-target.mjs";

const connectionString = process.env.BUYER_PROFILE_TEST_DATABASE_URL;
await assertDisposableDatabase(connectionString);

const proposalPath = path.resolve("packages/db/prisma/proposals/buyer-profile-atomicity.sql");
const ownerUserId = randomUUID();
const victimUserId = randomUUID();
const noLocationUserId = randomUUID();
const marketId = randomUUID();
const firstAreaId = randomUUID();
const secondAreaId = randomUUID();
const ownerProfileId = `atomic-owner-${randomUUID()}`;
const victimProfileId = `atomic-victim-${randomUUID()}`;
const noLocationProfileId = `atomic-no-location-${randomUUID()}`;
const db = new pg.Client({ connectionString });

await db.connect();
try {
  await assertPreparedTarget(db);
  await db.query(await readFile(proposalPath, "utf8"));
  await assertProposalCatalog(db);
  await seedFixture(db);

  const results = {};
  results.activation = await assertActivationRequiresAreaAndCriteria(db);
  results.cross_user = await assertCrossUserMutationBlocked(db);
  results.concurrent_save = await assertConcurrentSavesSerialize(db);
  results.admin_hide = await assertAdminHideSerializesWithPublication(db);
  results.uniqueness = await assertCriteriaUniqueness(db);
  results.rollback_injection = await assertInjectedFailureRollsBack(db);
  results.deactivation = await assertGeographyDeactivationFailsClosed(db);

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} finally {
  await db.end();
}

async function assertPreparedTarget(client) {
  const result = await client.query(`
    SELECT
      to_regclass('public."User"') IS NOT NULL AS has_user,
      to_regclass('public."BuyerProfile"') IS NOT NULL AS has_buyer_profile,
      to_regclass('public."BuyerCriteria"') IS NOT NULL AS has_buyer_criteria,
      to_regclass('public.markets') IS NOT NULL AS has_markets,
      to_regclass('public.service_areas') IS NOT NULL AS has_service_areas,
      to_regclass('public.buyer_desired_service_areas') IS NOT NULL AS has_buyer_areas,
      to_regprocedure('app_private.enforce_active_buyer_primary_service_area()') IS NOT NULL AS has_area_guard,
      NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public."BuyerCriteria"'::regclass
          AND conname = 'BuyerCriteria_buyerProfileId_key'
      ) AS proposal_not_applied
  `);
  if (Object.values(result.rows[0] ?? {}).some((value) => value !== true)) {
    throw new Error(`Buyer atomicity target is not a prepared pre-proposal database: ${JSON.stringify(result.rows[0])}`);
  }
}

async function assertProposalCatalog(client) {
  const result = await client.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public."BuyerCriteria"'::regclass
          AND conname = 'BuyerCriteria_buyerProfileId_key'
          AND contype = 'u'
      ) AS unique_criteria,
      EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public."BuyerCriteria"'::regclass
          AND tgname = 'buyer_criteria_active_profile_check'
          AND tgdeferrable AND tginitdeferred AND NOT tgisinternal
      ) AS deferred_criteria_guard,
      EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public."BuyerProfile"'::regclass
          AND tgname = 'buyer_profile_active_criteria_check'
          AND tgdeferrable AND tginitdeferred AND NOT tgisinternal
      ) AS deferred_profile_guard,
      EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public."BuyerCriteria"'::regclass
          AND tgname = 'buyer_criteria_immutable_profile'
          AND NOT tgisinternal
      ) AS immutable_owner_guard
  `);
  if (Object.values(result.rows[0] ?? {}).some((value) => value !== true)) {
    throw new Error(`Buyer atomicity catalog assertion failed: ${JSON.stringify(result.rows[0])}`);
  }
}

async function seedFixture(client) {
  for (const [id, label] of [
    [ownerUserId, "Owner"],
    [victimUserId, "Victim"],
    [noLocationUserId, "No location"],
  ]) {
    await client.query(
      `INSERT INTO auth.users (
         id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
       ) VALUES ($1::uuid, $2, '{}'::jsonb, jsonb_build_object('name', $3::text), now(), now())`,
      [id, `buyer-atomicity-${id}@example.invalid`, label],
    );
  }

  await client.query(`
    INSERT INTO public.markets (
      id, slug, label, state, country, center_lat, center_lng,
      bbox_west, bbox_south, bbox_east, bbox_north, active, created_at, updated_at
    ) VALUES (
      $1::uuid, $2, 'Buyer Atomicity Market', 'CA', 'US', 34.2, -118.5,
      -118.8, 33.9, -118.2, 34.5, true, now(), now()
    )
  `, [marketId, `buyer-atomicity-${marketId}`]);

  for (const [id, slug, postalCode, centerLat, centerLng] of [
    [firstAreaId, "atomic-area-a", "91001", 34.20, -118.50],
    [secondAreaId, "atomic-area-b", "91002", 34.25, -118.45],
  ]) {
    await client.query(`
      INSERT INTO public.service_areas (
        id, market_id, slug, label, type, postal_code, city, state,
        center_lat, center_lng, bbox_west, bbox_south, bbox_east, bbox_north,
        geojson_path, source, source_version, search_terms, active, is_pilot,
        created_at, updated_at
      ) VALUES (
        $1::uuid, $2::uuid, $3, $4, 'zip', $4, 'Atomic City', 'CA',
        $5, $6, $6 - 0.02, $5 - 0.02, $6 + 0.02, $5 + 0.02,
        $7, 'buyer-atomicity-test', '1', ARRAY[$3, $4], true, false, now(), now()
      )
    `, [id, marketId, slug, postalCode, centerLat, centerLng, `/atomic/${slug}.geojson`]);
  }

  for (const [profileId, userId, alias] of [
    [ownerProfileId, ownerUserId, "Atomic Owner"],
    [victimProfileId, victimUserId, "Atomic Victim"],
    [noLocationProfileId, noLocationUserId, "Atomic No Location"],
  ]) {
    await client.query(`
      INSERT INTO public."BuyerProfile" (
        id, "userId", "displayName", "visibilityStatus", "createdAt", "updatedAt"
      ) VALUES ($1, $2::uuid, $3, 'DRAFT', now(), now())
    `, [profileId, userId, alias]);
  }
}

async function assertActivationRequiresAreaAndCriteria(client) {
  await client.query(`
    INSERT INTO public.buyer_desired_service_areas (
      buyer_profile_id, service_area_id, source, is_primary, created_at, updated_at
    ) VALUES ($1, $2::uuid, 'SELECTED', true, now(), now())
  `, [victimProfileId, firstAreaId]);
  const missingCriteria = await expectTransactionError(client, async () => {
    await client.query(
      `UPDATE public."BuyerProfile" SET "visibilityStatus" = 'ACTIVE' WHERE id = $1`,
      [victimProfileId],
    );
  }, "23514", "requires exactly one criteria row");

  await client.query(`
    INSERT INTO public."BuyerCriteria" (
      id, "buyerProfileId", "propertyCategory", "propertySubtype", features, "createdAt", "updatedAt"
    ) VALUES ($1, $2, 'HOME', 'HOME', ARRAY[]::text[], now(), now())
  `, [`criteria-${noLocationProfileId}`, noLocationProfileId]);
  const missingArea = await expectTransactionError(client, async () => {
    await client.query(
      `UPDATE public."BuyerProfile" SET "visibilityStatus" = 'ACTIVE' WHERE id = $1`,
      [noLocationProfileId],
    );
  }, "23514", "requires exactly one active primary selected service area");

  return { missing_area_sqlstate: missingArea.code, missing_criteria_sqlstate: missingCriteria.code };
}

async function assertCrossUserMutationBlocked(client) {
  await client.query(`
    INSERT INTO public."BuyerCriteria" (
      id, "buyerProfileId", "propertyCategory", "propertySubtype", condition, features, "createdAt", "updatedAt"
    ) VALUES ($1, $2, 'HOME', 'HOME', 'victim-original', ARRAY[]::text[], now(), now())
  `, [`criteria-${victimProfileId}`, victimProfileId]);

  const profileMutation = await client.query(`
    UPDATE public."BuyerProfile" AS buyer_profile
    SET bio = 'cross-user-profile-mutation'
    WHERE id = $1 AND "userId" = $2::uuid
  `, [victimProfileId, ownerUserId]);
  const criteriaMutation = await client.query(`
    UPDATE public."BuyerCriteria" buyer_criteria
    SET condition = 'cross-user-criteria-mutation'
    WHERE buyer_criteria."buyerProfileId" = $1
      AND EXISTS (
        SELECT 1
        FROM public."BuyerProfile" buyer_profile
        WHERE buyer_profile.id = buyer_criteria."buyerProfileId"
          AND buyer_profile."userId" = $2::uuid
      )
  `, [victimProfileId, ownerUserId]);
  const victim = await client.query(`
    SELECT buyer_profile.bio, buyer_criteria.condition
    FROM public."BuyerProfile" buyer_profile
    JOIN public."BuyerCriteria" buyer_criteria ON buyer_criteria."buyerProfileId" = buyer_profile.id
    WHERE buyer_profile.id = $1 AND buyer_profile."userId" = $2::uuid
  `, [victimProfileId, victimUserId]);

  assertEqual(profileMutation.rowCount, 0, "cross-user profile update count");
  assertEqual(criteriaMutation.rowCount, 0, "cross-user criteria update count");
  assertEqual(victim.rows[0], { bio: null, condition: "victim-original" }, "victim state");
  return { criteria_updates: criteriaMutation.rowCount, profile_updates: profileMutation.rowCount };
}

async function assertConcurrentSavesSerialize(client) {
  const first = new pg.Client({ connectionString });
  const second = new pg.Client({ connectionString });
  await Promise.all([first.connect(), second.connect()]);
  try {
    await first.query("BEGIN");
    await applyAtomicSave(first, {
      areaId: firstAreaId,
      bio: "first-save",
      condition: "first-condition",
      userId: ownerUserId,
    });

    const pendingSecond = atomicSave(second, {
      areaId: secondAreaId,
      bio: "second-save",
      condition: "second-condition",
      userId: ownerUserId,
    });
    await waitUntilBlocked(client, second.processID);
    await first.query("COMMIT");
    await pendingSecond;

    const state = await buyerState(client, ownerProfileId);
    assertEqual(state, {
      area_id: secondAreaId,
      bio: "second-save",
      condition: "second-condition",
      criteria_count: 1,
      visibility: "ACTIVE",
    }, "concurrent final state");
    return state;
  } catch (error) {
    await first.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await Promise.all([first.end(), second.end()]);
  }
}

async function assertAdminHideSerializesWithPublication(client) {
  const publisher = new pg.Client({ connectionString });
  const moderator = new pg.Client({ connectionString });
  await Promise.all([publisher.connect(), moderator.connect()]);
  try {
    await publisher.query("BEGIN");
    await publisher.query('SELECT id FROM public."User" WHERE id = $1::uuid FOR UPDATE', [ownerUserId]);
    await publisher.query(`
      UPDATE public."BuyerProfile"
      SET bio = 'publication-before-hide', "visibilityStatus" = 'ACTIVE', "updatedAt" = now()
      WHERE id = $1 AND "userId" = $2::uuid
    `, [ownerProfileId, ownerUserId]);

    const pendingHide = (async () => {
      await moderator.query("BEGIN");
      const profile = await moderator.query(
        'SELECT "userId" FROM public."BuyerProfile" WHERE id = $1',
        [ownerProfileId],
      );
      await moderator.query(
        'SELECT id FROM public."User" WHERE id = $1::uuid FOR UPDATE',
        [profile.rows[0].userId],
      );
      await moderator.query(`
        UPDATE public."BuyerProfile"
        SET "visibilityStatus" = 'HIDDEN', "updatedAt" = now()
        WHERE id = $1 AND "userId" = $2::uuid
      `, [ownerProfileId, ownerUserId]);
      await moderator.query("COMMIT");
    })();
    await waitUntilBlocked(client, moderator.processID);
    await publisher.query("COMMIT");
    await pendingHide;

    const afterPublicationFirst = await client.query(
      'SELECT "visibilityStatus"::text AS visibility FROM public."BuyerProfile" WHERE id = $1',
      [ownerProfileId],
    );
    assertEqual(afterPublicationFirst.rows[0]?.visibility, "HIDDEN", "publication-before-hide status");

    await moderator.query("BEGIN");
    await moderator.query('SELECT id FROM public."User" WHERE id = $1::uuid FOR UPDATE', [ownerUserId]);
    const pendingPublication = (async () => {
      await publisher.query("BEGIN");
      await publisher.query('SELECT id FROM public."User" WHERE id = $1::uuid FOR UPDATE', [ownerUserId]);
      const profile = await publisher.query(
        'SELECT "visibilityStatus"::text AS visibility FROM public."BuyerProfile" WHERE id = $1 AND "userId" = $2::uuid',
        [ownerProfileId, ownerUserId],
      );
      if (["HIDDEN", "SUSPENDED"].includes(profile.rows[0]?.visibility)) {
        await publisher.query("ROLLBACK");
        return "REJECTED_BY_MODERATION";
      }
      await publisher.query("ROLLBACK");
      return "UNEXPECTEDLY_ALLOWED";
    })();
    await waitUntilBlocked(client, publisher.processID);
    await moderator.query("COMMIT");
    const publicationResult = await pendingPublication;
    assertEqual(publicationResult, "REJECTED_BY_MODERATION", "hide-before-publication result");

    // Restore the active fixture for the later geography-deactivation assertion.
    await client.query("BEGIN");
    try {
      await client.query('SELECT id FROM public."User" WHERE id = $1::uuid FOR UPDATE', [ownerUserId]);
      await client.query(
        'UPDATE public."BuyerProfile" SET "visibilityStatus" = \'ACTIVE\', "updatedAt" = now() WHERE id = $1',
        [ownerProfileId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    return { hide_after_publish: "HIDDEN", publish_after_hide: publicationResult };
  } catch (error) {
    await Promise.all([
      publisher.query("ROLLBACK").catch(() => undefined),
      moderator.query("ROLLBACK").catch(() => undefined),
    ]);
    throw error;
  } finally {
    await Promise.all([publisher.end(), moderator.end()]);
  }
}

async function assertCriteriaUniqueness(client) {
  const error = await expectPgError(
    () => client.query(`
      INSERT INTO public."BuyerCriteria" (
        id, "buyerProfileId", "propertyCategory", "propertySubtype", features, "createdAt", "updatedAt"
      ) VALUES ($1, $2, 'HOME', 'HOME', ARRAY[]::text[], now(), now())
    `, [`duplicate-${randomUUID()}`, ownerProfileId]),
    "23505",
    "BuyerCriteria_buyerProfileId_key",
  );
  return { sqlstate: error.code };
}

async function assertInjectedFailureRollsBack(client) {
  const before = await buyerState(client, ownerProfileId);
  const error = await expectPgError(
    () => atomicSave(client, {
      areaId: firstAreaId,
      bio: "must-roll-back",
      condition: "must-roll-back",
      injectFailure: true,
      userId: ownerUserId,
    }),
    "P0001",
    "BUYER_PROFILE_ROLLBACK_INJECTION",
  );
  const after = await buyerState(client, ownerProfileId);
  assertEqual(after, before, "rollback-injection state");
  return { preserved: true, sqlstate: error.code };
}

async function assertGeographyDeactivationFailsClosed(client) {
  await client.query("UPDATE public.markets SET active = false WHERE id = $1::uuid", [marketId]);
  let state = await buyerState(client, ownerProfileId);
  assertEqual(state.visibility, "DRAFT", "profile status after market deactivation");
  await client.query("UPDATE public.markets SET active = true WHERE id = $1::uuid", [marketId]);
  state = await buyerState(client, ownerProfileId);
  assertEqual(state.visibility, "DRAFT", "profile status after market reactivation");
  return { after_deactivation: "DRAFT", after_reactivation: state.visibility };
}

async function atomicSave(client, values) {
  await client.query("BEGIN");
  try {
    await applyAtomicSave(client, values);
    if (values.injectFailure) {
      await client.query("DO $$ BEGIN RAISE EXCEPTION 'BUYER_PROFILE_ROLLBACK_INJECTION'; END $$;");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function applyAtomicSave(client, { areaId, bio, condition, userId }) {
  const owner = await client.query(`
    SELECT id
    FROM public."User"
    WHERE id = $1::uuid
    FOR UPDATE
  `, [userId]);
  if (owner.rowCount !== 1) throw new Error("Owner lock failed.");

  const profile = await client.query(`
    SELECT id
    FROM public."BuyerProfile"
    WHERE "userId" = $1::uuid
  `, [userId]);
  if (profile.rowCount !== 1) throw new Error("Owned buyer profile was not found.");
  const profileId = profile.rows[0].id;

  const area = await client.query(`
    SELECT service_area.*, market.slug AS market_slug
    FROM public.service_areas service_area
    JOIN public.markets market ON market.id = service_area.market_id
    WHERE service_area.id = $1::uuid AND service_area.active AND market.active
  `, [areaId]);
  if (area.rowCount !== 1) throw new Error("Active canonical area was not found.");
  const selected = area.rows[0];

  const updated = await client.query(`
    UPDATE public."BuyerProfile"
    SET bio = $3,
        "buyerType" = 'Cash',
        "buyingPurpose" = 'House',
        "budgetMin" = 700000,
        "budgetMax" = 900000,
        "desiredLocationText" = selected.label || ', ' || selected.state,
        "desiredCity" = selected.city,
        "desiredNeighborhood" = NULL,
        "desiredPostalCode" = selected.postal_code,
        "desiredState" = selected.state,
        "desiredLat" = selected.center_lat,
        "desiredLng" = selected.center_lng,
        "visibilityStatus" = 'ACTIVE',
        "lastRefreshedAt" = now(),
        "updatedAt" = now()
    FROM public.service_areas selected
    WHERE buyer_profile.id = $2
      AND buyer_profile."userId" = $1::uuid
      AND selected.id = $4::uuid
    RETURNING buyer_profile.id
  `, [userId, profileId, bio, areaId]);
  if (updated.rowCount !== 1) throw new Error("Exact-owner profile update failed.");

  await client.query(`
    DELETE FROM public.buyer_desired_service_areas buyer_area
    WHERE buyer_area.buyer_profile_id = $1
      AND EXISTS (
        SELECT 1 FROM public."BuyerProfile" buyer_profile
        WHERE buyer_profile.id = buyer_area.buyer_profile_id
          AND buyer_profile."userId" = $2::uuid
      )
  `, [profileId, userId]);
  await client.query(`
    INSERT INTO public.buyer_desired_service_areas (
      buyer_profile_id, service_area_id, source, is_primary, created_at, updated_at
    ) VALUES ($1, $2::uuid, 'SELECTED', true, now(), now())
  `, [profileId, areaId]);
  await client.query(`
    INSERT INTO public."BuyerCriteria" (
      id, "buyerProfileId", "propertyCategory", "propertySubtype",
      "priceMin", "priceMax", condition, features, "createdAt", "updatedAt"
    ) VALUES ($1, $2, 'HOME', 'HOME', 700000, 900000, $3, ARRAY[]::text[], now(), now())
    ON CONFLICT ("buyerProfileId") DO UPDATE
    SET "propertyCategory" = EXCLUDED."propertyCategory",
        "propertySubtype" = EXCLUDED."propertySubtype",
        "priceMin" = EXCLUDED."priceMin",
        "priceMax" = EXCLUDED."priceMax",
        condition = EXCLUDED.condition,
        features = EXCLUDED.features,
        "updatedAt" = now()
  `, [`criteria-${profileId}`, profileId, condition]);
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
}

async function buyerState(client, profileId) {
  const result = await client.query(`
    SELECT
      buyer_profile.bio,
      buyer_profile."visibilityStatus"::text AS visibility,
      buyer_area.service_area_id::text AS area_id,
      buyer_criteria.condition,
      (SELECT count(*)::int FROM public."BuyerCriteria" count_criteria
       WHERE count_criteria."buyerProfileId" = buyer_profile.id) AS criteria_count
    FROM public."BuyerProfile" buyer_profile
    LEFT JOIN public.buyer_desired_service_areas buyer_area
      ON buyer_area.buyer_profile_id = buyer_profile.id
    LEFT JOIN public."BuyerCriteria" buyer_criteria
      ON buyer_criteria."buyerProfileId" = buyer_profile.id
    WHERE buyer_profile.id = $1
  `, [profileId]);
  return result.rows[0];
}

async function expectTransactionError(client, operation, expectedCode, expectedText) {
  await client.query("BEGIN");
  try {
    await operation();
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error?.code === expectedCode && String(error.message).includes(expectedText)) return error;
    throw error;
  }
  await client.query("ROLLBACK");
  throw new Error(`Expected PostgreSQL ${expectedCode} containing ${expectedText}.`);
}

async function expectPgError(operation, expectedCode, expectedText) {
  try {
    await operation();
  } catch (error) {
    if (error?.code === expectedCode && String(error.message).includes(expectedText)) return error;
    throw new Error(
      `Expected PostgreSQL ${expectedCode} containing ${expectedText}, received ${error?.code}: ${error?.message}`,
      { cause: error },
    );
  }
  throw new Error(`Expected PostgreSQL ${expectedCode} containing ${expectedText}.`);
}

async function waitUntilBlocked(client, pid) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await client.query("SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked", [pid]);
    if (result.rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Backend ${pid} did not block on the exact-owner row lock.`);
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

async function assertDisposableDatabase(url) {
  const sentinel = process.env.BUYER_PROFILE_TEST_SENTINEL;
  if (!url || !sentinel || sentinel.length < 16 || process.env.BUYER_PROFILE_TEST_ALLOW_WRITES !== "true") {
    throw new Error("Set the buyer-profile database URL, write opt-in, and a 16+ character disposable sentinel.");
  }
  for (const sharedUrl of [process.env.DIRECT_URL, process.env.DATABASE_URL]) {
    if (sharedUrl && sameDatabaseTarget(sharedUrl, url)) {
      throw new Error("Refusing to run the destructive buyer-profile test against the configured shared database.");
    }
  }

  const guard = new pg.Client({ connectionString: url });
  await guard.connect();
  try {
    const table = await guard.query(
      "SELECT to_regclass('public.buyer_profile_atomicity_test_sentinel') IS NOT NULL AS present",
    );
    if (!table.rows[0]?.present) throw new Error("Disposable buyer-profile sentinel table is missing.");
    const result = await guard.query(`
      SELECT EXISTS (
        SELECT 1 FROM public.buyer_profile_atomicity_test_sentinel WHERE token = $1
      ) AS verified
    `, [sentinel]);
    if (!result.rows[0]?.verified) throw new Error("Disposable buyer-profile sentinel does not match.");
  } finally {
    await guard.end();
  }
}
