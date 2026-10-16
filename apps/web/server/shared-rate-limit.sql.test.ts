import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());

vi.mock("@liber/db", () => ({
  prisma: { $queryRaw: queryRaw },
}));

import { assertSharedRateLimit, consumeSharedRateLimit } from "./shared-rate-limit";

const repositoryRoot = path.resolve(process.cwd(), "../..");
const source = (relativePath: string) => readFileSync(path.join(repositoryRoot, relativePath), "utf8");
const limiterMigration = source(
  "packages/db/prisma/migrations/20261016033000_codify_shared_rate_limiter/migration.sql",
);
const legacyLimiterMigration = source(
  "packages/db/prisma/migrations/20260713230000_fix_rate_limit_timestamp_variable/migration.sql",
);
const driftCheck = source("docs/engineering/SHARED_RATE_LIMITER_DRIFT_CHECK.sql");
const handAppliedLimiter = proposalLimiterSection(
  source("docs/engineering/AUTH_SECURITY_FOLLOWUP_FORWARD.sql").replace(/\r\n/g, "\n"),
);

type LimiterRow = { allowed: boolean; limit_value: number; retry_after_seconds: number };

describe("shared rate limiter migration in isolated PostgreSQL", () => {
  let database: PGlite;

  beforeAll(async () => {
    database = await migratedDatabase();
  }, 30_000);

  beforeEach(async () => {
    // Production mode turns any SQL failure into an error instead of the local fallback.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_RATE_LIMIT_PEPPER", "shared-limiter-sql-test-pepper-0123456789");
    queryRaw.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.reduce((query, segment, index) => query + (index ? `$${index}` : "") + segment, "");
      return database.query(sql, values).then((result) => result.rows);
    });
    await database.exec("BEGIN");
  });

  afterEach(async () => {
    await database.exec("ROLLBACK");
    vi.unstubAllEnvs();
    queryRaw.mockReset();
  });

  afterAll(async () => database?.close());

  it("serves the application's four-argument call and denies once the budget is spent", async () => {
    const request = {
      identifier: "buyer@example.test",
      limit: 2,
      namespace: "auth:login:email",
      windowSeconds: 60,
    };

    await expect(consumeSharedRateLimit(request)).resolves.toEqual({ allowed: true, limit: 2, retryAfterSeconds: 0 });
    await expect(consumeSharedRateLimit(request)).resolves.toEqual({ allowed: true, limit: 2, retryAfterSeconds: 0 });
    const denied = await consumeSharedRateLimit(request);
    expect(denied).toMatchObject({ allowed: false, limit: 2 });
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60);
    await expect(assertSharedRateLimit(request)).rejects.toThrow("Rate limit reached. Try again later.");

    const { rows } = await database.query("SELECT namespace, key_hash, hit_count FROM app_private.rate_limit_buckets");
    expect(rows).toEqual([{
      namespace: "auth:login:email",
      key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      hit_count: 4,
    }]);
  });

  it("opens a new window after expiry or when the window length changes", async () => {
    const consume = async (windowSeconds: number) => (await database.query<LimiterRow>(
      "SELECT * FROM app_private.consume_rate_limit($1, $2, $3, $4)",
      ["auth:recover:ip", "b".repeat(64), 1, windowSeconds],
    )).rows[0];

    expect(await consume(60)).toMatchObject({ allowed: true });
    expect(await consume(60)).toMatchObject({ allowed: false });
    await database.exec("UPDATE app_private.rate_limit_buckets SET expires_at = now() - interval '1 second'");
    expect(await consume(60)).toMatchObject({ allowed: true });
    expect(await consume(60)).toMatchObject({ allowed: false });
    expect(await consume(120)).toMatchObject({ allowed: true });
  });

  it("rejects malformed limiter arguments without writing a bucket", async () => {
    for (const args of [
      [null, "c".repeat(64), 1, 60],
      [" ", "c".repeat(64), 1, 60],
      ["n".repeat(129), "c".repeat(64), 1, 60],
      ["auth:login:email", "buyer@example.test", 1, 60],
      ["auth:login:email", "C".repeat(64), 1, 60],
      ["auth:login:email", "c".repeat(64), 0, 60],
      ["auth:login:email", "c".repeat(64), 1, 0],
    ]) {
      await database.exec("SAVEPOINT malformed_arguments");
      await expect(database.query("SELECT * FROM app_private.consume_rate_limit($1, $2, $3, $4)", args))
        .rejects.toMatchObject({ code: "22023", message: "LIBER_RATE_LIMIT_ARGUMENT_INVALID" });
      await database.exec("ROLLBACK TO SAVEPOINT malformed_arguments");
    }

    const { rows } = await database.query("SELECT count(*)::int AS count FROM app_private.rate_limit_buckets");
    expect(rows).toEqual([{ count: 0 }]);
  });

  it("prunes at most one hundred expired buckets per call", async () => {
    await database.exec(`
      INSERT INTO app_private.rate_limit_buckets (
        namespace, key_hash, hit_count, window_seconds, window_started_at, expires_at, updated_at
      )
      SELECT 'expired', lpad(to_hex(sequence), 64, '0'), 1, 60,
        now() - interval '2 minutes', now() - interval '1 minute', now() - interval '1 minute'
      FROM generate_series(1, 150) AS sequence
    `);

    await consumeSharedRateLimit({
      identifier: "203.0.113.9",
      limit: 20,
      namespace: "geography:public:ip",
      windowSeconds: 60,
    });

    const { rows } = await database.query(`
      SELECT namespace, count(*)::int AS count
      FROM app_private.rate_limit_buckets
      GROUP BY namespace
      ORDER BY namespace
    `);
    expect(rows).toEqual([
      { namespace: "expired", count: 50 },
      { namespace: "geography:public:ip", count: 1 },
    ]);
  });

  it("keeps the limiter table and functions private to their owner", async () => {
    const { rows } = await database.query(`
      SELECT
        role_name,
        has_function_privilege(role_name, 'app_private.consume_rate_limit(text,text,integer,integer)', 'EXECUTE') AS consume,
        has_function_privilege(role_name, 'app_private.prune_rate_limit_buckets(timestamptz,integer)', 'EXECUTE') AS prune,
        has_table_privilege(
          role_name,
          'app_private.rate_limit_buckets',
          'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
        ) AS bucket_table
      FROM unnest(ARRAY['postgres', 'anon', 'authenticated', 'service_role']) AS role_name
    `);
    expect(rows).toEqual([
      { role_name: "postgres", consume: true, prune: true, bucket_table: true },
      { role_name: "anon", consume: false, prune: false, bucket_table: false },
      { role_name: "authenticated", consume: false, prune: false, bucket_table: false },
      { role_name: "service_role", consume: false, prune: false, bucket_table: false },
    ]);

    // authenticated keeps the production app_private USAGE grant, so this is the function ACL.
    await database.exec("SET LOCAL ROLE authenticated");
    await expect(database.query(
      "SELECT * FROM app_private.consume_rate_limit($1, $2, 1, 60)",
      ["auth:login:ip", "d".repeat(64)],
    )).rejects.toMatchObject({ code: "42501", message: "permission denied for function consume_rate_limit" });
  });
});

describe("shared rate limiter migration on existing targets", () => {
  it("is a no-op where the proposal objects were applied by hand", async () => {
    const database = await supabaseDatabase();
    try {
      await database.exec(handAppliedLimiter);
      await database.exec(`
        INSERT INTO app_private.rate_limit_buckets (
          namespace, key_hash, hit_count, window_seconds, window_started_at, expires_at, updated_at
        ) VALUES ('auth:login:ip', '${"e".repeat(64)}', 3, 600, now(), now() + interval '10 minutes', now())
      `);
      const before = await catalogSnapshot(database);

      await database.exec(limiterMigration);
      await database.exec(limiterMigration);

      expect(await catalogSnapshot(database)).toEqual(before);
      expect(await driftMismatches(database)).toEqual([]);
      const buckets = await database.query("SELECT namespace, hit_count FROM app_private.rate_limit_buckets");
      expect(buckets.rows).toEqual([{ namespace: "auth:login:ip", hit_count: 3 }]);
      const overloads = await database.query<{ legacy: boolean; shared: boolean }>(`
        SELECT
          (SELECT allowed FROM app_private.consume_rate_limit('legacy-key', 1, 60000)) AS legacy,
          (SELECT allowed FROM app_private.consume_rate_limit('auth:login:ip', '${"f".repeat(64)}', 1, 60)) AS shared
      `);
      expect(overloads.rows).toEqual([{ legacy: true, shared: true }]);
    } finally {
      await database.close();
    }
  }, 30_000);

  it("builds the proposal's exact definitions on a database created from migrations", async () => {
    const migrated = await migratedDatabase();
    const handApplied = await supabaseDatabase();
    try {
      await handApplied.exec(handAppliedLimiter);
      expect(await catalogSnapshot(migrated)).toEqual(await catalogSnapshot(handApplied));
      expect(await driftMismatches(migrated)).toEqual([]);
    } finally {
      await Promise.all([migrated.close(), handApplied.close()]);
    }
  }, 30_000);

  it("adds a missing expiry index to an otherwise reviewed bucket table", async () => {
    const database = await supabaseDatabase();
    try {
      await database.exec(handAppliedLimiter);
      await database.exec("DROP INDEX app_private.rate_limit_buckets_expires_at_idx");
      expect(await driftMismatches(database)).toEqual(["rate_limit_buckets: indexes"]);

      await database.exec(limiterMigration);
      expect(await driftMismatches(database)).toEqual([]);
    } finally {
      await database.close();
    }
  }, 30_000);

  it("aborts without changes when an existing bucket table has drifted", async () => {
    const database = await supabaseDatabase();
    try {
      await database.exec(`
        CREATE TABLE app_private.rate_limit_buckets (
          namespace text NOT NULL,
          key_hash text NOT NULL,
          hit_count integer NOT NULL,
          PRIMARY KEY (namespace, key_hash)
        )
      `);

      await expect(database.exec(limiterMigration))
        .rejects.toThrow("app_private.rate_limit_buckets differs from the reviewed shared limiter table");
      await database.exec("ROLLBACK");

      const { rows } = await database.query(`
        SELECT
          to_regprocedure('app_private.consume_rate_limit(text,text,integer,integer)') IS NULL AS consume_absent,
          to_regclass('app_private.rate_limit_buckets_expires_at_idx') IS NULL AS index_absent
      `);
      expect(rows).toEqual([{ consume_absent: true, index_absent: true }]);
      expect(await driftMismatches(database)).toEqual(expect.arrayContaining([
        "consume_rate_limit: signature",
        "prune_rate_limit_buckets: signature",
        "rate_limit_buckets: columns",
        "rate_limit_buckets: indexes",
      ]));
    } finally {
      await database.close();
    }
  }, 30_000);

  it("reports a drifted function and converges it to the reviewed definition", async () => {
    const database = await migratedDatabase();
    try {
      await database.exec(`
        CREATE OR REPLACE FUNCTION app_private.prune_rate_limit_buckets(p_before timestamptz, p_limit integer)
        RETURNS integer
        LANGUAGE sql
        SECURITY DEFINER
        SET search_path = ''
        AS $$ SELECT 0 $$;
        GRANT EXECUTE ON FUNCTION app_private.consume_rate_limit(text, text, integer, integer) TO service_role;
      `);
      expect(await driftMismatches(database)).toEqual([
        "consume_rate_limit: non-owner grants",
        "prune_rate_limit_buckets: body md5",
        "prune_rate_limit_buckets: attributes",
      ]);

      await database.exec(limiterMigration);
      expect(await driftMismatches(database)).toEqual([]);
    } finally {
      await database.close();
    }
  }, 30_000);
});

// Mirrors the Supabase objects the migration depends on. PGlite's session user
// is a superuser, so objects are created and called as a non-superuser postgres
// owner to keep privilege checks meaningful.
async function supabaseDatabase() {
  const database = new PGlite();
  await database.exec(`
    CREATE ROLE postgres NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    GRANT ALL ON SCHEMA public TO postgres;
    CREATE SCHEMA app_private AUTHORIZATION postgres;
    GRANT USAGE ON SCHEMA app_private TO authenticated;
    SET ROLE postgres;
    CREATE TABLE public."RateLimitBucket" (
      key text PRIMARY KEY,
      count integer NOT NULL,
      "windowStart" timestamp(3) NOT NULL,
      "expiresAt" timestamp(3) NOT NULL,
      "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
      CONSTRAINT "RateLimitBucket_count_check" CHECK (count > 0)
    );
  `);
  await database.exec(legacyLimiterMigration);
  return database;
}

async function migratedDatabase() {
  const database = await supabaseDatabase();
  await database.exec(limiterMigration);
  return database;
}

function proposalLimiterSection(proposal: string) {
  const start = proposal.indexOf("CREATE TABLE app_private.rate_limit_buckets (");
  const lastStatement = "REVOKE ALL ON FUNCTION app_private.consume_rate_limit(text, text, integer, integer)\n"
    + "  FROM PUBLIC, anon, authenticated, service_role;\n";
  const end = proposal.indexOf(lastStatement);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("The shared limiter section of AUTH_SECURITY_FOLLOWUP_FORWARD.sql moved.");
  }
  return proposal.slice(start, end + lastStatement.length);
}

async function catalogSnapshot(database: PGlite) {
  const { rows } = await database.query(`
    SELECT 'function ' || function_row.oid::regprocedure::text AS object,
      concat_ws(' | ',
        pg_get_functiondef(function_row.oid),
        pg_get_userbyid(function_row.proowner),
        function_row.proacl::text
      ) AS definition
    FROM pg_proc AS function_row
    WHERE function_row.pronamespace = 'app_private'::regnamespace
    UNION ALL
    SELECT 'relation ' || relation.oid::regclass::text,
      concat_ws(' | ',
        relation.relkind,
        pg_get_userbyid(relation.relowner),
        relation.relacl::text,
        relation.relrowsecurity::text,
        CASE WHEN relation.relkind = 'i' THEN pg_get_indexdef(relation.oid) END
      )
    FROM pg_class AS relation
    WHERE relation.relnamespace = 'app_private'::regnamespace
    UNION ALL
    SELECT 'column ' || attribute.attrelid::regclass::text || '.' || attribute.attname,
      concat_ws(' | ', format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull::text)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    WHERE relation.relnamespace = 'app_private'::regnamespace
      AND relation.relkind = 'r'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
    UNION ALL
    SELECT 'constraint ' || table_constraint.conname, pg_get_constraintdef(table_constraint.oid)
    FROM pg_constraint AS table_constraint
    WHERE table_constraint.connamespace = 'app_private'::regnamespace
    ORDER BY 1
  `);
  return rows;
}

async function driftMismatches(database: PGlite) {
  const { rows } = await database.query<{ check_name: string; matches: boolean }>(driftCheck);
  return rows.filter((row) => !row.matches).map((row) => row.check_name);
}
