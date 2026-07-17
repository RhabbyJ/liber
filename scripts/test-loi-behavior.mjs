import "dotenv/config";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";
import { sameDatabaseTarget } from "./database-target.mjs";

const databaseUrl = process.env.LOI_BEHAVIOR_TEST_DATABASE_URL;
const sentinel = process.env.LOI_BEHAVIOR_TEST_SENTINEL;
const migrationNames = [
  "20260716030741_add_loi_negotiations",
  "20260716120000_harden_loi_event_semantics",
  "20260717023000_grant_authenticated_app_private_usage",
  "20260717033000_harden_app_private_function_defaults",
];
const expectedChecksums = Object.fromEntries(await Promise.all(migrationNames.map(async (migrationName) => {
  const bytes = await readFile(`packages/db/prisma/migrations/${migrationName}/migration.sql`);
  return [migrationName, createHash("sha256").update(bytes).digest("hex")];
})));

await assertDisposableTarget(databaseUrl, sentinel);

const sharedDatabaseUrls = [process.env.DIRECT_URL, process.env.DATABASE_URL].filter(Boolean);
const command = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(command, [
  "run",
  "test",
  "-w",
  "@liber/web",
  "--",
  "server/loi/service.database.test.ts",
  "--maxWorkers=1",
  "--no-file-parallelism",
], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_POOL_MAX: "8",
    DATABASE_URL: databaseUrl,
    LOI_BEHAVIOR_TEST_SHARED_DATABASE_URLS: JSON.stringify(sharedDatabaseUrls),
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`LOI behavior suite exited with ${result.status}.`);

async function assertDisposableTarget(connectionString, token) {
  const missing = [
    !connectionString && "LOI_BEHAVIOR_TEST_DATABASE_URL",
    (!token || token.length < 16) && "LOI_BEHAVIOR_TEST_SENTINEL (16+ characters)",
    process.env.LOI_BEHAVIOR_TEST_ALLOW_WRITES !== "true" && "LOI_BEHAVIOR_TEST_ALLOW_WRITES=true",
    !process.env.DIRECT_URL && "DIRECT_URL shared-target deny URL",
    !process.env.DATABASE_URL && "DATABASE_URL shared-target deny URL",
  ].filter(Boolean);
  if (missing.length) throw new Error(`LOI behavior proof not run: missing ${missing.join(", ")}.`);
  for (const sharedUrl of [process.env.DIRECT_URL, process.env.DATABASE_URL]) {
    if (sameDatabaseTarget(sharedUrl, connectionString)) {
      throw new Error("Refusing to run LOI behavior proof against the configured shared database.");
    }
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const [guard, migrations] = await Promise.all([
      client.query(
        `SELECT to_regclass('public.loi_migration_test_sentinel') IS NOT NULL AS present,
          EXISTS (SELECT 1 FROM public.loi_migration_test_sentinel WHERE token = $1) AS verified`,
        [token],
      ).catch((error) => error?.code === "42P01"
        ? { rows: [{ present: false, verified: false }] }
        : Promise.reject(error)),
      client.query(`SELECT migration_name, checksum FROM public._prisma_migrations
        WHERE migration_name = ANY($1::text[])
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL`, [migrationNames]),
    ]);
    if (!guard.rows[0]?.present || !guard.rows[0]?.verified) {
      throw new Error("Disposable LOI behavior sentinel is missing or does not match.");
    }
    if (migrations.rowCount !== migrationNames.length
      || migrations.rows.some((row) => row.checksum !== expectedChecksums[row.migration_name])) {
      throw new Error("LOI behavior target does not contain all reviewed LOI migration checksums.");
    }
  } finally {
    await client.end();
  }
}
