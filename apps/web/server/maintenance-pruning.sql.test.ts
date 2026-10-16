import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock("@liber/db", () => ({ prisma: { $queryRaw: queryRaw } }));

import { pruneExpiredRateLimitBuckets, RATE_LIMIT_PRUNE_BATCH_SIZE } from "./maintenance";

const repositoryRoot = path.resolve(process.cwd(), "../..");
const migration = (name: string) =>
  readFileSync(path.join(repositoryRoot, "packages/db/prisma/migrations", name, "migration.sql"), "utf8");

const now = new Date("2026-10-16T12:00:00.000Z");
let database: PGlite;

describe("rate-limit bucket pruning in isolated PostgreSQL", () => {
  beforeAll(async () => {
    database = new PGlite();
    await database.exec(`
      CREATE ROLE postgres NOLOGIN;
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN;
      GRANT ALL ON SCHEMA public TO postgres;
      CREATE SCHEMA app_private AUTHORIZATION postgres;
      SET ROLE postgres;
      CREATE TABLE public."RateLimitBucket" (
        key text PRIMARY KEY,
        count integer NOT NULL,
        "windowStart" timestamp(3) NOT NULL,
        "expiresAt" timestamp(3) NOT NULL,
        "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
        CONSTRAINT "RateLimitBucket_count_check" CHECK (count > 0)
      );
      CREATE INDEX "RateLimitBucket_expiresAt_idx" ON public."RateLimitBucket" ("expiresAt");
      CREATE TABLE public."UploadSession" (id text PRIMARY KEY, status text NOT NULL, "expiresAt" timestamp(3) NOT NULL);
    `);
    await database.exec(migration("20260713230000_fix_rate_limit_timestamp_variable"));
    await database.exec(migration("20261016033000_codify_shared_rate_limiter"));
    await database.exec("RESET ROLE");
  }, 30_000);

  beforeEach(async () => {
    // The application connects as postgres, the owner of the private limiter functions.
    await database.exec("BEGIN; SET LOCAL ROLE postgres");
    queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.reduce((text, segment, index) => text + (index ? `$${index}` : "") + segment, "");
      return (await database.query(sql, values)).rows;
    });
  });

  afterEach(async () => {
    await database.exec("ROLLBACK");
    queryRaw.mockReset();
  });

  afterAll(async () => database?.close());

  it("deletes only expired buckets and leaves upload sessions to their own worker", async () => {
    await database.exec(`
      INSERT INTO app_private.rate_limit_buckets
        (namespace, key_hash, hit_count, window_seconds, window_started_at, expires_at, updated_at)
      VALUES
        ('auth:login:ip', repeat('a', 64), 1, 60, '2026-10-16 11:58:00+00', '2026-10-16 11:59:00+00', '2026-10-16 11:59:00+00'),
        ('auth:login:ip', repeat('b', 64), 1, 60, '2026-10-16 11:58:30+00', '2026-10-16 11:59:30+00', '2026-10-16 11:59:30+00'),
        ('auth:login:ip', repeat('c', 64), 2, 60, '2026-10-16 11:59:30+00', '2026-10-16 12:00:30+00', '2026-10-16 11:59:45+00');
      INSERT INTO public."RateLimitBucket" (key, count, "windowStart", "expiresAt", "updatedAt") VALUES
        ('legacy-stale', 3, '2026-10-14 11:00:00', '2026-10-14 12:00:00', '2026-10-14 12:00:00'),
        ('legacy-recent', 3, '2026-10-16 00:00:00', '2026-10-16 01:00:00', '2026-10-16 01:00:00'),
        ('legacy-live', 1, '2026-10-16 11:59:00', '2026-10-16 13:00:00', '2026-10-16 11:59:00');
      INSERT INTO public."UploadSession" VALUES ('abandoned-session', 'PENDING', '2026-10-01 00:00:00');
    `);

    await expect(pruneExpiredRateLimitBuckets(now)).resolves.toEqual({
      hasMore: false,
      legacyBucketsPruned: 1,
      sharedBucketsPruned: 2,
    });

    const shared = await database.query<{ key_hash: string }>(
      "SELECT key_hash FROM app_private.rate_limit_buckets ORDER BY key_hash",
    );
    const legacy = await database.query<{ key: string }>('SELECT key FROM public."RateLimitBucket" ORDER BY key');
    const uploads = await database.query('SELECT status FROM public."UploadSession"');
    expect(shared.rows).toEqual([{ key_hash: "c".repeat(64) }]);
    expect(legacy.rows).toEqual([{ key: "legacy-live" }, { key: "legacy-recent" }]);
    expect(uploads.rows).toEqual([{ status: "PENDING" }]);
  });

  it("bounds each run and reports when more expired buckets remain", async () => {
    await database.query(`
      INSERT INTO app_private.rate_limit_buckets
        (namespace, key_hash, hit_count, window_seconds, window_started_at, expires_at, updated_at)
      SELECT 'geography:public:ip', lpad(to_hex(sequence), 64, '0'), 1, 60,
        $1::timestamptz - interval '2 minutes', $1::timestamptz - interval '1 minute', $1::timestamptz - interval '1 minute'
      FROM generate_series(1, $2::integer) AS sequence
    `, [now.toISOString(), RATE_LIMIT_PRUNE_BATCH_SIZE + 1]);

    await expect(pruneExpiredRateLimitBuckets(now)).resolves.toMatchObject({
      hasMore: true,
      sharedBucketsPruned: RATE_LIMIT_PRUNE_BATCH_SIZE,
    });
    await expect(pruneExpiredRateLimitBuckets(now)).resolves.toEqual({
      hasMore: false,
      legacyBucketsPruned: 0,
      sharedBucketsPruned: 1,
    });
  });
});
