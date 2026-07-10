import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { sameDatabaseTarget } from "./database-target.mjs";

const testUrl = process.env.GEOGRAPHY_MIGRATION_TEST_DATABASE_URL;
await assertDisposableDatabase(testUrl);

const testEnv = {
  ...process.env,
  DATABASE_URL: testUrl,
  DIRECT_URL: testUrl,
  SERVICE_AREA_E2E_ALLOW_WRITES: "true",
  SERVICE_AREA_E2E_DATABASE_URL: testUrl,
  SERVICE_AREA_E2E_SHARED_DATABASE_URLS: JSON.stringify(
    [process.env.DIRECT_URL, process.env.DATABASE_URL].filter(Boolean),
  ),
};

run(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", "migrate", "reset", "--force"], testEnv);

const client = new pg.Client({ connectionString: testUrl });
await client.connect();
try {
  const failed = await client.query(`
    SELECT migration_name, logs
    FROM public._prisma_migrations
    WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
    ORDER BY started_at
  `);
  if (failed.rowCount !== 0) throw new Error(`Fresh migration ledger contains failures: ${JSON.stringify(failed.rows)}`);

  const expectedMigrations = (await readdir(path.resolve("packages/db/prisma/migrations"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const recorded = await client.query(`
    SELECT migration_name, count(*)::int AS applications
    FROM public._prisma_migrations
    GROUP BY migration_name
    ORDER BY migration_name
  `);
  assertExactMigrationLedger(recorded.rows, expectedMigrations);
  await client.query(`
    CREATE TABLE public.geography_migration_test_sentinel (
      token text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query("REVOKE ALL ON public.geography_migration_test_sentinel FROM PUBLIC, anon, authenticated, service_role");
  await client.query("INSERT INTO public.geography_migration_test_sentinel(token) VALUES ($1)", [
    process.env.GEOGRAPHY_MIGRATION_TEST_SENTINEL,
  ]);
} finally {
  await client.end();
}

try {
  run(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["test", "-w", "@liber/web", "--", "server/service-area-db.e2e.test.ts"],
    testEnv,
  );
} finally {
  await dropSentinel(testUrl);
}

process.stdout.write("Fresh geography migration path and database E2E passed.\n");

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${result.status}.`);
}

function assertExactMigrationLedger(rows, expectedMigrations) {
  const actualNames = rows.map((row) => row.migration_name);
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedMigrations)) {
    throw new Error(`Fresh migration ledger differs from checked-in migrations: ${JSON.stringify(actualNames)}`);
  }
  const duplicate = rows.find((row) => row.applications !== 1);
  if (duplicate) throw new Error(`Fresh migration ${duplicate.migration_name} was recorded ${duplicate.applications} times.`);
}

async function assertDisposableDatabase(url) {
  const sentinel = process.env.GEOGRAPHY_MIGRATION_TEST_SENTINEL;
  if (!url || !sentinel || sentinel.length < 16 || process.env.GEOGRAPHY_MIGRATION_TEST_ALLOW_RESET !== "true") {
    throw new Error(
      "Set the database URL, reset opt-in, and a 16+ character disposable-database sentinel.",
    );
  }
  for (const sharedUrl of [process.env.DIRECT_URL, process.env.DATABASE_URL]) {
    if (sharedUrl && sameDatabaseTarget(sharedUrl, url)) {
      throw new Error("Refusing to reset the configured shared database.");
    }
  }

  const guard = new pg.Client({ connectionString: url });
  await guard.connect();
  try {
    const table = await guard.query(
      "SELECT to_regclass('public.geography_migration_test_sentinel') IS NOT NULL AS present",
    );
    if (!table.rows[0]?.present) throw new Error("Disposable-database sentinel table is missing.");
    const verified = await guard.query(
      "SELECT EXISTS (SELECT 1 FROM public.geography_migration_test_sentinel WHERE token = $1) AS verified",
      [sentinel],
    );
    if (!verified.rows[0]?.verified) throw new Error("Disposable-database sentinel does not match.");
  } finally {
    await guard.end();
  }
}

async function dropSentinel(url) {
  const cleanup = new pg.Client({ connectionString: url });
  await cleanup.connect();
  try {
    await cleanup.query("DROP TABLE IF EXISTS public.geography_migration_test_sentinel");
  } finally {
    await cleanup.end();
  }
}
