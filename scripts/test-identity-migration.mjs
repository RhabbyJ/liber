import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const testUrl = process.env.IDENTITY_MIGRATION_TEST_DATABASE_URL;
await assertDisposableDatabase(testUrl);

const migrationRoot = path.resolve("packages/db/prisma/migrations");
const identityMigration = "20260709000016_harden_auth_identity_ownership";
const oldUserId = randomUUID();
const newUserId = randomUUID();
const inFlightUserId = randomUUID();
const oldEmail = `identity-reuse-${oldUserId}@example.invalid`;
const client = new pg.Client({ connectionString: testUrl });

await client.connect();
try {
  await prepareCanonicalSchema(client);
  await assertUpgradeBaseline(client);
  await seedOwnedIdentity(client);
  const lockProof = await applyBehindInFlightAuthInsert();
  const catalog = await assertHardenedCatalog(client);
  const immutability = await assertOwnershipCannotMove(client);
  const lifecycle = await assertRestrictedDeletionAndFreshReregistration(client);

  process.stdout.write(
    `${JSON.stringify({ catalog, immutability, lifecycle, lockProof }, null, 2)}\n`,
  );
} finally {
  await client.end();
}

async function migrationSql(name) {
  return readFile(path.join(migrationRoot, name, "migration.sql"), "utf8");
}

async function prepareCanonicalSchema(db) {
  await prepareHistoricalBaselineIfRequested(db);
  const state = await db.query(`
    SELECT
      to_regclass('public.markets') IS NOT NULL AS has_markets,
      to_regclass('public.service_area_migration_quarantine') IS NOT NULL AS has_quarantine
  `);
  const row = state.rows[0];
  if (row?.has_quarantine) return;
  if (row?.has_markets) {
    throw new Error("Disposable identity target has a partial geography cutover.");
  }

  for (const name of [
    "20260709000013_add_markets_and_buyer_service_area_slugs",
    "20260709000014_add_search_rollup_relation_type",
    "20260709000015_canonical_service_area_cutover",
  ]) {
    await db.query(await migrationSql(name));
  }
}

async function prepareHistoricalBaselineIfRequested(db) {
  const state = await db.query(`SELECT to_regclass('public."User"') IS NOT NULL AS has_user`);
  if (state.rows[0]?.has_user) return;
  if (process.env.IDENTITY_MIGRATION_TEST_PREPARE_EMPTY !== "true") {
    throw new Error("Identity target is empty; set the explicit disposable empty-baseline opt-in.");
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

  for (const name of [
    "20260519000000_initial",
    "20260520000001_tighten_property_image_storage_policy",
    "20260520000002_add_missing_foreign_key_indexes",
    "20260520000003_add_profile_photos_bucket",
    "20260520000004_enforce_unique_buyer_badges",
    "20260521000005_audit_hardening",
    "20260526000006_sprint1_security_hardening",
    "20260526000007_harden_auth_user_sync",
    "20260611000008_trim_v1_unused_schema",
    "20260707000009_add_avatar_variant",
    "20260707000010_update_auth_user_avatar_trigger",
    "20260708000011_add_service_areas",
    "20260708000012_add_property_subtypes_and_ownership_evidence",
  ]) {
    await db.query(await disposableBaselineSql(name));
  }
}

async function disposableBaselineSql(name) {
  const sql = await migrationSql(name);
  if (name !== "20260521000005_audit_hardening") return sql;

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

async function assertUpgradeBaseline(db) {
  const result = await db.query(`
    SELECT
      to_regprocedure('app_private.handle_new_user()') IS NOT NULL AS has_signup_function,
      to_regclass('public."User"') IS NOT NULL AS has_user,
      to_regclass('public."SellerAccess"') IS NOT NULL AS has_seller_access,
      to_regclass('public."BuyerProfile"') IS NOT NULL AS has_buyer_profile,
      to_regclass('public."SellerProperty"') IS NOT NULL AS has_seller_property,
      to_regclass('public.identity_migration_test_sentinel') IS NOT NULL AS has_sentinel,
      EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app_private'
          AND p.proname = 'handle_new_user'
          AND pg_get_functiondef(p.oid) LIKE '%id = EXCLUDED.id%'
      ) AS has_vulnerable_function,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'User_id_auth_users_fkey'
      ) AS already_hardened,
      (SELECT count(*)::int FROM public."User") AS users
  `);
  const row = result.rows[0];
  if (
    !row?.has_signup_function ||
    !row?.has_user ||
    !row?.has_seller_access ||
    !row?.has_buyer_profile ||
    !row?.has_seller_property ||
    !row?.has_sentinel ||
    !row?.has_vulnerable_function ||
    row?.already_hardened ||
    row?.users !== 0
  ) {
    throw new Error(`Unexpected identity upgrade baseline: ${JSON.stringify(row)}`);
  }
}

async function seedOwnedIdentity(db) {
  await insertAuthUser(db, oldUserId, oldEmail, "Original identity");
  await db.query(
    `UPDATE public."User"
     SET roles = ARRAY['BUYER', 'SELLER', 'ADMIN']::public."UserRole"[]
     WHERE id = $1`,
    [oldUserId],
  );
  await db.query(
    `INSERT INTO public."SellerAccess" (id, "userId", status, "createdAt", "updatedAt")
     VALUES ('identity-seller-access', $1, 'APPROVED', now(), now())`,
    [oldUserId],
  );
  await db.query(
    `INSERT INTO public."BuyerProfile" (id, "userId", "displayName", "createdAt", "updatedAt")
     VALUES ('identity-buyer-profile', $1, 'Identity Fixture', now(), now())`,
    [oldUserId],
  );
  await db.query(
    `INSERT INTO public."SellerProperty" (
       id, "ownerUserId", "propertyType", "createdAt", "updatedAt"
     ) VALUES ('identity-seller-property', $1, 'HOME', now(), now())`,
    [oldUserId],
  );
  await db.query(
    `INSERT INTO public."VerificationDocument" (
       id, "userId", "buyerProfileId", "documentType", "storagePath", "createdAt", "updatedAt"
     ) VALUES ('identity-document', $1, 'identity-buyer-profile', 'IDENTITY', $2, now(), now())`,
    [oldUserId, `${oldUserId}/identity-document.pdf`],
  );
  await db.query(
    `INSERT INTO public."Notification" (id, "userId", type, title, body, "createdAt")
     VALUES ('identity-notification', $1, 'identity-test', 'Identity test', 'Identity test', now())`,
    [oldUserId],
  );
  await db.query(
    `INSERT INTO public."AdminAuditLog" (
       id, "actorUserId", action, "targetType", "targetId", "createdAt"
     ) VALUES ('identity-audit', $1, 'identity_test', 'user', $1::text, now())`,
    [oldUserId],
  );
}

async function applyBehindInFlightAuthInsert() {
  const writer = new pg.Client({ connectionString: testUrl });
  const observer = new pg.Client({ connectionString: testUrl });
  await writer.connect();
  await observer.connect();
  try {
    await writer.query("BEGIN");
    await insertAuthUser(
      writer,
      inFlightUserId,
      `identity-in-flight-${inFlightUserId}@example.invalid`,
      "In-flight identity",
    );

    const migrationStartedAt = Date.now();
    const migrationPromise = client.query(await migrationSql(identityMigration));
    const migrationPid = await waitForBlockedMigration(observer, writer.processID);
    await writer.query("COMMIT");
    await migrationPromise;

    return {
      blocked_by_in_flight_auth_write: Boolean(migrationPid),
      wait_milliseconds: Date.now() - migrationStartedAt,
    };
  } catch (error) {
    await writer.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await observer.end();
    await writer.end();
  }
}

async function waitForBlockedMigration(observer, writerPid) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await observer.query(
      `SELECT pid
       FROM pg_stat_activity
       WHERE pid <> $1
         AND $1 = ANY(pg_blocking_pids(pid))
         AND query LIKE '%LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE%'
       LIMIT 1`,
      [writerPid],
    );
    if (result.rows[0]?.pid) return result.rows[0].pid;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Identity migration did not visibly wait for the in-flight Auth write.");
}

async function assertHardenedCatalog(db) {
  const result = await db.query(`
    WITH user_fks AS (
      SELECT
        count(*) FILTER (WHERE con.confrelid = 'public."User"'::regclass)::int AS child_fk_count,
        count(*) FILTER (
          WHERE con.confrelid = 'public."User"'::regclass
            AND con.confupdtype = 'r'
        )::int AS child_update_restrict_count
      FROM pg_constraint con
      WHERE con.contype = 'f'
        AND con.confrelid = 'public."User"'::regclass
    )
    SELECT
      position('id = EXCLUDED.id' IN pg_get_functiondef(
        'app_private.handle_new_user()'::regprocedure
      )) = 0 AS rebind_removed,
      position('LIBER_IDENTITY_RECOVERY_REQUIRED' IN pg_get_functiondef(
        'app_private.handle_new_user()'::regprocedure
      )) > 0 AS collision_explicit,
      EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public."User"'::regclass
          AND tgname = 'prevent_user_id_update'
          AND NOT tgisinternal
      ) AS immutable_trigger,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public."User"'::regclass
          AND conname = 'User_id_auth_users_fkey'
          AND convalidated
          AND confrelid = 'auth.users'::regclass
          AND confupdtype = 'r'
          AND confdeltype = 'r'
      ) AS validated_auth_fk,
      NOT has_function_privilege('anon', 'app_private.handle_new_user()', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'app_private.handle_new_user()', 'EXECUTE')
        AND NOT has_function_privilege('service_role', 'app_private.handle_new_user()', 'EXECUTE')
        AS trigger_acl_restricted,
      user_fks.child_fk_count,
      user_fks.child_update_restrict_count
    FROM user_fks
  `);
  const row = result.rows[0];
  if (
    !row?.rebind_removed ||
    !row?.collision_explicit ||
    !row?.immutable_trigger ||
    !row?.validated_auth_fk ||
    !row?.trigger_acl_restricted ||
    row?.child_fk_count !== 11 ||
    row?.child_update_restrict_count !== 11
  ) {
    throw new Error(`Identity catalog assertion failed: ${JSON.stringify(row)}`);
  }
  return row;
}

async function assertOwnershipCannotMove(db) {
  const idUpdate = await expectPgError(
    () => db.query(`UPDATE public."User" SET id = $1 WHERE id = $2`, [newUserId, oldUserId]),
    "23514",
    "LIBER_USER_ID_IMMUTABLE",
  );
  const authDelete = await expectPgError(
    () => db.query("DELETE FROM auth.users WHERE id = $1", [oldUserId]),
    "23503",
    "User_id_auth_users_fkey",
  );
  const result = await db.query(
    `SELECT
       (SELECT id = $1 FROM public."User" WHERE id = $1) AS user_unchanged,
       (SELECT "userId" = $1 FROM public."BuyerProfile" WHERE id = 'identity-buyer-profile') AS buyer_unchanged,
       (SELECT "userId" = $1 AND status = 'APPROVED' FROM public."SellerAccess" WHERE id = 'identity-seller-access') AS seller_access_unchanged,
       (SELECT "ownerUserId" = $1 FROM public."SellerProperty" WHERE id = 'identity-seller-property') AS property_unchanged,
       (SELECT 'ADMIN'::public."UserRole" = ANY(roles) FROM public."User" WHERE id = $1) AS admin_stayed_old_uuid`,
    [oldUserId],
  );
  const row = result.rows[0];
  if (Object.values(row).some((value) => value !== true)) {
    throw new Error(`Ownership changed after rejected UUID operations: ${JSON.stringify(row)}`);
  }
  return { ...row, auth_delete_sqlstate: authDelete.code, id_update_sqlstate: idUpdate.code };
}

async function assertRestrictedDeletionAndFreshReregistration(db) {
  await db.query(`ALTER TABLE public."User" DROP CONSTRAINT "User_id_auth_users_fkey"`);
  await db.query("DELETE FROM auth.users WHERE id = $1", [oldUserId]);
  const collision = await expectPgError(
    () => insertAuthUser(db, newUserId, oldEmail, "Collision identity"),
    "23505",
    "LIBER_IDENTITY_RECOVERY_REQUIRED",
  );
  await db.query(`DELETE FROM public."User" WHERE id = $1`, [oldUserId]);
  await db.query(`
    ALTER TABLE public."User"
      ADD CONSTRAINT "User_id_auth_users_fkey"
      FOREIGN KEY (id) REFERENCES auth.users(id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
      NOT VALID;
    ALTER TABLE public."User"
      VALIDATE CONSTRAINT "User_id_auth_users_fkey";
  `);

  await insertAuthUser(db, newUserId, oldEmail, "Fresh identity");
  const result = await db.query(
    `SELECT
       (SELECT count(*)::int FROM public."User" WHERE id = $1) AS old_users,
       (SELECT count(*)::int FROM public."User" WHERE id = $2 AND cardinality(roles) = 0) AS fresh_empty_users,
       (SELECT count(*)::int FROM public."BuyerProfile" WHERE "userId" = $2) AS inherited_buyers,
       (SELECT count(*)::int FROM public."SellerAccess" WHERE "userId" = $2) AS inherited_seller_access,
       (SELECT count(*)::int FROM public."SellerProperty" WHERE "ownerUserId" = $2) AS inherited_properties,
       (SELECT count(*)::int FROM public."VerificationDocument" WHERE "userId" = $2) AS inherited_documents,
       (SELECT count(*)::int FROM public."AdminAuditLog" WHERE id = 'identity-audit' AND "actorUserId" IS NULL) AS retained_audit_with_null_actor`,
    [oldUserId, newUserId],
  );
  const row = result.rows[0];
  if (
    row?.old_users !== 0 ||
    row?.fresh_empty_users !== 1 ||
    row?.inherited_buyers !== 0 ||
    row?.inherited_seller_access !== 0 ||
    row?.inherited_properties !== 0 ||
    row?.inherited_documents !== 0 ||
    row?.retained_audit_with_null_actor !== 1
  ) {
    throw new Error(`Fresh re-registration inherited old ownership: ${JSON.stringify(row)}`);
  }
  return { ...row, collision_sqlstate: collision.code };
}

async function insertAuthUser(db, id, email, name) {
  await db.query(
    `INSERT INTO auth.users (
       id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) VALUES ($1, $2, '{}'::jsonb, jsonb_build_object('name', $3::text), now(), now())`,
    [id, email, name],
  );
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

async function assertDisposableDatabase(url) {
  const sentinel = process.env.IDENTITY_MIGRATION_TEST_SENTINEL;
  if (!url || !sentinel || sentinel.length < 16 || process.env.IDENTITY_MIGRATION_TEST_ALLOW_WRITES !== "true") {
    throw new Error("Set the identity database URL, write opt-in, and a 16+ character disposable sentinel.");
  }
  for (const sharedUrl of [process.env.DIRECT_URL, process.env.DATABASE_URL]) {
    if (sharedUrl && normalizeDatabaseUrl(sharedUrl) === normalizeDatabaseUrl(url)) {
      throw new Error("Refusing to run the destructive identity migration test against the configured shared database.");
    }
  }

  const guard = new pg.Client({ connectionString: url });
  await guard.connect();
  try {
    const result = await guard.query(
      `SELECT EXISTS (
         SELECT 1 FROM public.identity_migration_test_sentinel WHERE token = $1
       ) AS verified`,
      [sentinel],
    );
    if (!result.rows[0]?.verified) throw new Error("Disposable identity sentinel does not match.");
  } finally {
    await guard.end();
  }
}

function normalizeDatabaseUrl(value) {
  const url = new URL(value);
  url.password = "";
  url.search = "";
  return url.toString();
}
