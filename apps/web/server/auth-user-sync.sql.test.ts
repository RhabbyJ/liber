import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(process.cwd(), "../..");
const source = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8").replace(/\r\n/g, "\n");

const syncMigration = source(
  "packages/db/prisma/migrations/20261016040000_codify_auth_user_sync_triggers/migration.sql",
);
const identityMigration = source(
  "packages/db/prisma/migrations/20260709000016_harden_auth_identity_ownership/migration.sql",
);
const initialMigration = source("packages/db/prisma/migrations/20260519000000_initial/migration.sql");
const driftCheck = source("docs/engineering/AUTH_USER_SYNC_DRIFT_CHECK.sql");
const proposal = source("docs/engineering/AUTH_SECURITY_FOLLOWUP_FORWARD.sql");

// The state every migration before the fix left behind: identity-hardened
// functions that still copy metadata names, fired on every auth.users update.
const historicalSync = [
  statement(identityMigration, "CREATE OR REPLACE FUNCTION app_private.handle_new_user()", "\n$$;\n"),
  statement(identityMigration, "CREATE OR REPLACE FUNCTION app_private.handle_update_user()", "\n$$;\n"),
  statement(initialMigration, "CREATE OR REPLACE TRIGGER on_auth_user_created", ";\n"),
  statement(initialMigration, "CREATE OR REPLACE TRIGGER on_auth_user_updated", ";\n"),
  statement(identityMigration, "REVOKE ALL ON FUNCTION app_private.handle_new_user()", ";\n"),
  statement(identityMigration, "REVOKE ALL ON FUNCTION app_private.handle_update_user()", ";\n"),
].join("\n");

// What production received by hand: the proposal pasted from a CRLF checkout.
const handAppliedSync = statement(
  proposal,
  "CREATE OR REPLACE FUNCTION app_private.handle_new_user()",
  "never synchronized from later user-editable Auth metadata.';\n",
).replace(/\n/g, "\r\n");

const buyerId = "019f62c5-1c07-4a62-9f9a-8302778aa101";
const sellerId = "019f62c5-1c07-4a62-9f9a-8302778aa102";
const orphanId = "019f62c5-1c07-4a62-9f9a-8302778aa103";

describe("Auth user sync before the codifying migration", () => {
  it("lets a metadata-only Auth update rewrite the account name", async () => {
    const database = await historicalDatabase();
    try {
      await signUp(database, buyerId, "buyer@example.test", { name: "Signup Name" });
      expect(await appUser(database, buyerId)).toMatchObject({ name: "Signup Name" });

      await asAuthAdmin(database, `UPDATE auth.users SET raw_user_meta_data = '{"name":"Rewritten"}' WHERE id = '${buyerId}'`);

      expect(await appUser(database, buyerId)).toMatchObject({ name: "Rewritten" });
      expect(await driftMismatches(database)).toEqual([
        "handle_new_user: body md5",
        "handle_update_user: body md5",
        "on_auth_user_updated: definition",
      ]);
    } finally {
      await database.close();
    }
  }, 60_000);
});

describe("Auth user sync after the codifying migration", () => {
  let database: PGlite;

  beforeAll(async () => {
    database = await migratedDatabase();
  }, 60_000);
  beforeEach(async () => database.exec("BEGIN"));
  afterEach(async () => database.exec("ROLLBACK"));
  afterAll(async () => database?.close());

  it("starts a new account with an empty name and no roles regardless of metadata", async () => {
    await signUp(database, buyerId, "buyer@example.test", { name: "Signup Name", role: "ADMIN" });

    expect(await appUser(database, buyerId)).toEqual({
      email: "buyer@example.test",
      name: "",
      roles: "{}",
    });
  });

  it("never copies user-editable metadata into the account name", async () => {
    await signUp(database, buyerId, "buyer@example.test", { name: "Signup Name" });
    await database.exec(`
      UPDATE public."User"
      SET name = 'Reviewed Name', "updatedAt" = '2026-10-01 00:00:00'
      WHERE id = '${buyerId}'
    `);

    await asAuthAdmin(database, `UPDATE auth.users SET raw_user_meta_data = '{"name":"Attacker"}' WHERE id = '${buyerId}'`);
    // Auth may rewrite an unchanged email with the metadata; the WHEN clause skips the sync.
    await asAuthAdmin(database, `
      UPDATE auth.users SET email = email, raw_user_meta_data = '{"name":"Attacker"}'
      WHERE id = '${buyerId}'
    `);

    expect(await appUser(database, buyerId)).toMatchObject({ email: "buyer@example.test", name: "Reviewed Name" });
    expect(await updatedAt(database, buyerId)).toBe("2026-10-01 00:00:00");
  });

  it("syncs a changed Auth email without touching the name", async () => {
    await signUp(database, buyerId, "buyer@example.test", { name: "Signup Name" });
    await database.exec(`
      UPDATE public."User"
      SET name = 'Reviewed Name', "updatedAt" = '2026-10-01 00:00:00'
      WHERE id = '${buyerId}'
    `);

    await asAuthAdmin(database, `
      UPDATE auth.users SET email = 'moved@example.test', raw_user_meta_data = '{"name":"Attacker"}'
      WHERE id = '${buyerId}'
    `);

    expect(await appUser(database, buyerId)).toMatchObject({ email: "moved@example.test", name: "Reviewed Name" });
    expect(await updatedAt(database, buyerId)).not.toBe("2026-10-01 00:00:00");
  });

  it("rejects an email change onto another identity, a blank email, and a missing app user", async () => {
    await signUp(database, buyerId, "buyer@example.test", {});
    await signUp(database, sellerId, "seller@example.test", {});

    expect(await attemptAsAuthAdmin(database, `UPDATE auth.users SET email = ' SELLER@Example.test ' WHERE id = '${buyerId}'`))
      .toMatchObject({ code: "23505", message: "LIBER_IDENTITY_RECOVERY_REQUIRED" });
    expect(await attemptAsAuthAdmin(database, `UPDATE auth.users SET email = ' ' WHERE id = '${buyerId}'`))
      .toMatchObject({ code: "23514", message: "LIBER_AUTH_EMAIL_REQUIRED" });

    // An Auth row without an application user (only possible after manual repair).
    await database.exec(`
      SET LOCAL session_replication_role = replica;
      INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${orphanId}', 'orphan@example.test', '{}');
      SET LOCAL session_replication_role = origin;
    `);
    expect(await attemptAsAuthAdmin(database, `UPDATE auth.users SET email = 'orphan2@example.test' WHERE id = '${orphanId}'`))
      .toMatchObject({ code: "23503", message: "LIBER_AUTH_IDENTITY_MISSING" });

    const { rows } = await database.query("SELECT email FROM auth.users WHERE id = $1", [buyerId]);
    expect(rows).toEqual([{ email: "buyer@example.test" }]);
    expect(await appUser(database, buyerId)).toMatchObject({ email: "buyer@example.test" });
  });

  it("refuses a signup whose normalized email belongs to another identity", async () => {
    await signUp(database, buyerId, "buyer@example.test", {});

    expect(await attemptAsAuthAdmin(
      database,
      `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${sellerId}', ' BUYER@Example.test ', '{}')`,
    )).toMatchObject({ code: "23505", message: "LIBER_IDENTITY_RECOVERY_REQUIRED" });
    expect(await attemptAsAuthAdmin(
      database,
      `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('${sellerId}', NULL, '{}')`,
    )).toMatchObject({ code: "23514", message: "LIBER_AUTH_EMAIL_REQUIRED" });
    expect(await appUser(database, sellerId)).toBeUndefined();
  });

  it("keeps both trigger functions executable only by their owner", async () => {
    const { rows } = await database.query(`
      SELECT
        role_name,
        has_function_privilege(role_name, 'app_private.handle_new_user()', 'EXECUTE') AS new_user,
        has_function_privilege(role_name, 'app_private.handle_update_user()', 'EXECUTE') AS update_user
      FROM unnest(ARRAY['postgres', 'anon', 'authenticated', 'service_role', 'supabase_auth_admin']) AS role_name
    `);

    // The Auth role fires the triggers above without an EXECUTE grant.
    expect(rows).toEqual([
      { role_name: "postgres", new_user: true, update_user: true },
      { role_name: "anon", new_user: false, update_user: false },
      { role_name: "authenticated", new_user: false, update_user: false },
      { role_name: "service_role", new_user: false, update_user: false },
      { role_name: "supabase_auth_admin", new_user: false, update_user: false },
    ]);
  });

  it("matches every drift check row", async () => {
    expect(await driftMismatches(database)).toEqual([]);
  });
});

describe("Auth user sync migration on the hand-applied production state", () => {
  let production: PGlite;

  beforeAll(async () => {
    production = await productionDatabase();
  }, 60_000);
  afterAll(async () => production?.close());

  it("stores CRLF bodies like production and still matches the drift check", async () => {
    const { rows } = await production.query(`
      SELECT bool_and(position(E'\\r' IN prosrc) > 0) AS crlf
      FROM pg_proc
      WHERE oid IN ('app_private.handle_new_user()'::regprocedure, 'app_private.handle_update_user()'::regprocedure)
    `);

    expect(rows).toEqual([{ crlf: true }]);
    expect(await driftMismatches(production)).toEqual([]);
  });

  it("builds exactly the hand-applied definitions on a database rebuilt from migrations", async () => {
    const migrated = await migratedDatabase();
    try {
      expect(await catalogSnapshot(migrated)).toEqual(await catalogSnapshot(production));
    } finally {
      await migrated.close();
    }
  }, 60_000);

  it("is idempotent and leaves the hand-applied state unchanged in effect", async () => {
    await signUp(production, buyerId, "buyer@example.test", {});
    const before = await catalogSnapshot(production);

    // Runs as postgres, which has the TRIGGER privilege on auth.users but does not own it.
    await asPostgres(production, syncMigration);
    await asPostgres(production, syncMigration);

    expect(await catalogSnapshot(production)).toEqual(before);
    expect(await driftMismatches(production)).toEqual([]);
    expect(await appUser(production, buyerId)).toEqual({ email: "buyer@example.test", name: "", roles: "{}" });
  });
});

describe("application name ownership", () => {
  it("stores the signup name through the application, not Auth metadata", () => {
    const actions = source("apps/web/server/auth-actions.ts");
    const identity = source("apps/web/server/auth-identity.ts");

    expect(actions).toMatch(/persistUserRolesForAuthIdentity\(\{\s*authUser: data\.user,\s*name,\s*roles,\s*\}\)/);
    expect(identity).toContain("...(args.name ? { name: args.name } : {})");
  });
});

// Mirrors the Supabase objects the sync depends on: auth.users is owned by the
// Auth role, and postgres has table privileges (including TRIGGER) but not
// ownership. PGlite's session user is a superuser, so objects are created and
// called as non-superuser roles to keep privilege checks meaningful.
async function supabaseDatabase() {
  const database = new PGlite();
  await database.exec(`
    CREATE ROLE postgres NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE ROLE supabase_auth_admin NOLOGIN;
    CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
    GRANT USAGE ON SCHEMA auth TO postgres;
    SET ROLE supabase_auth_admin;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY,
      email character varying(255),
      raw_user_meta_data jsonb,
      updated_at timestamptz
    );
    GRANT ALL ON TABLE auth.users TO postgres;
    RESET ROLE;
    GRANT ALL ON SCHEMA public TO postgres;
    CREATE SCHEMA app_private AUTHORIZATION postgres;
    SET ROLE postgres;
    CREATE TYPE public."UserRole" AS ENUM ('BUYER', 'SELLER', 'ADMIN');
    CREATE TABLE public."User" (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      email text NOT NULL CONSTRAINT "User_email_key" UNIQUE,
      name text,
      roles public."UserRole"[] NOT NULL DEFAULT ARRAY[]::public."UserRole"[],
      "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" timestamp(3) NOT NULL
    );
    CREATE UNIQUE INDEX "User_email_normalized_key" ON public."User" (lower(btrim(email)));
    RESET ROLE;
  `);
  return database;
}

async function historicalDatabase() {
  const database = await supabaseDatabase();
  await asPostgres(database, historicalSync);
  return database;
}

async function migratedDatabase() {
  const database = await historicalDatabase();
  await asPostgres(database, syncMigration);
  return database;
}

async function productionDatabase() {
  const database = await historicalDatabase();
  // Replacing a trigger with DROP + CREATE needs table ownership, which
  // whoever applied the proposal by hand had. The migration does not need it.
  await database.exec(handAppliedSync);
  return database;
}

async function asPostgres(database: PGlite, sql: string) {
  await database.exec("SET ROLE postgres");
  try {
    await database.exec(sql);
  } finally {
    await database.exec("RESET ROLE");
  }
}

async function asAuthAdmin(database: PGlite, sql: string) {
  await database.exec("SET ROLE supabase_auth_admin");
  try {
    await database.exec(sql);
  } finally {
    await database.exec("RESET ROLE");
  }
}

// Runs inside the test transaction; a failure rolls back only this statement.
async function attemptAsAuthAdmin(database: PGlite, sql: string) {
  await database.exec("SAVEPOINT auth_attempt");
  try {
    await database.exec(`SET ROLE supabase_auth_admin; ${sql}`);
    await database.exec("RESET ROLE; RELEASE SAVEPOINT auth_attempt");
    return null;
  } catch (error) {
    await database.exec("ROLLBACK TO SAVEPOINT auth_attempt; RESET ROLE");
    return error;
  }
}

async function signUp(database: PGlite, id: string, email: string, metadata: Record<string, string>) {
  await database.exec("SET ROLE supabase_auth_admin");
  try {
    await database.query(
      "INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)",
      [id, email, JSON.stringify(metadata)],
    );
  } finally {
    await database.exec("RESET ROLE");
  }
}

async function appUser(database: PGlite, id: string) {
  const { rows } = await database.query<{ email: string; name: string | null; roles: string }>(
    'SELECT email, name, roles::text AS roles FROM public."User" WHERE id = $1',
    [id],
  );
  return rows[0];
}

async function updatedAt(database: PGlite, id: string) {
  const { rows } = await database.query<{ updated: string }>(
    `SELECT to_char("updatedAt", 'YYYY-MM-DD HH24:MI:SS') AS updated FROM public."User" WHERE id = $1`,
    [id],
  );
  return rows[0]?.updated;
}

async function catalogSnapshot(database: PGlite) {
  const { rows } = await database.query(`
    SELECT 'function ' || function_row.oid::regprocedure::text AS object,
      concat_ws(' | ',
        replace(pg_get_functiondef(function_row.oid), E'\\r', ''),
        pg_get_userbyid(function_row.proowner),
        function_row.proacl::text
      ) AS definition
    FROM pg_proc AS function_row
    WHERE function_row.pronamespace = 'app_private'::regnamespace
    UNION ALL
    SELECT 'trigger ' || trigger_row.tgname,
      concat_ws(' | ', pg_get_triggerdef(trigger_row.oid), trigger_row.tgenabled::text)
    FROM pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid = 'auth.users'::regclass
      AND NOT trigger_row.tgisinternal
    UNION ALL
    SELECT 'comment User.name', col_description('public."User"'::regclass, attribute.attnum)
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public."User"'::regclass AND attribute.attname = 'name'
    ORDER BY 1
  `);
  return rows;
}

async function driftMismatches(database: PGlite) {
  const { rows } = await database.query<{ check_name: string; matches: boolean }>(driftCheck);
  return rows.filter((row) => !row.matches).map((row) => row.check_name);
}

function statement(sql: string, start: string, end: string) {
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from + start.length);
  if (from === -1 || to === -1) throw new Error(`Statement starting with ${start} moved.`);
  return sql.slice(from, to + end.length);
}
