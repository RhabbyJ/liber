import "dotenv/config";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { sameDatabaseTarget, supabaseProjectRef } from "./database-target.mjs";

// Intentionally never creates a sentinel or resets a target. Provision and mark
// a disposable current Liber database before opting into this proof.
const mode = process.argv[2] ?? "deploy";
if (!["deploy", "behavior"].includes(mode)) throw new Error("Usage: node scripts/test-tour-database.mjs deploy|behavior");
const url = process.env.TOUR_DATABASE_TEST_URL;
const sentinel = process.env.TOUR_DATABASE_TEST_SENTINEL;
const shared = [process.env.DIRECT_URL, process.env.DATABASE_URL];
const migration = "20260927201152_add_tour_scheduling";
const root = process.cwd();
if (!url || !sentinel || sentinel.length < 16 || process.env.TOUR_DATABASE_TEST_ALLOW_WRITES !== "true" || shared.some((value) => !value)) {
  throw new Error("Tour database proof requires TOUR_DATABASE_TEST_URL, TOUR_DATABASE_TEST_SENTINEL (16+ characters), TOUR_DATABASE_TEST_ALLOW_WRITES=true, and both DIRECT_URL/DATABASE_URL shared-target deny URLs.");
}
if (supabaseProjectRef(url) === "qfjcrhkjlczvzakxives" || shared.some((value) => sameDatabaseTarget(value, url))) {
  throw new Error("Refusing tour proof against production or a configured shared database.");
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const guard = await client.query("SELECT EXISTS (SELECT 1 FROM public.tour_database_test_sentinel WHERE token = $1) AS verified", [sentinel]);
  if (!guard.rows[0]?.verified) throw new Error("Disposable tour sentinel does not match.");
  const ledger = await client.query("SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations");
  if (ledger.rows.some((row) => !row.finished_at && !row.rolled_back_at)) throw new Error("Target contains an unfinished migration.");
  const baseline = ledger.rows.some((row) => row.migration_name === "20260714190000_current_supported_baseline" && row.finished_at && !row.rolled_back_at);
  const migrationRoot = path.join(root, baseline ? "packages/db/prisma/current-baseline/migrations" : "packages/db/prisma/migrations");
  const names = (await readdir(migrationRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const name of names.filter((name) => name !== migration)) {
    const bytes = await readFile(path.join(migrationRoot, name, "migration.sql"));
    const expected = createHash("sha256").update(bytes).digest("hex");
    const row = ledger.rows.find((entry) => entry.migration_name === name && entry.finished_at && !entry.rolled_back_at);
    if (!row || row.checksum !== expected) throw new Error(`Target is not at the reviewed current pre-tour schema: ${name}.`);
  }
  if (mode === "deploy") {
    runNode("node_modules/prisma/build/index.js", ["migrate", "deploy", "--config", baseline ? "prisma.baseline.config.ts" : "prisma.config.ts"], root);
  }
  const bytes = await readFile(path.join(root, "packages/db/prisma/migrations", migration, "migration.sql"));
  const baselineBytes = await readFile(path.join(root, "packages/db/prisma/current-baseline/migrations", migration, "migration.sql"));
  if (!bytes.equals(baselineBytes)) throw new Error("Tour migration roots differ.");
  const expected = createHash("sha256").update(bytes).digest("hex");
  const applied = await client.query("SELECT checksum FROM public._prisma_migrations WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL", [migration]);
  if (applied.rowCount !== 1 || applied.rows[0].checksum !== expected) throw new Error("Reviewed tour migration checksum is not applied.");
} finally { await client.end(); }

runNode("node_modules/vitest/vitest.mjs", ["run", "server/messaging/tours.database.test.ts", "--maxWorkers=1", "--no-file-parallelism"], path.join(root, "apps/web"));
console.log("Tour migration and real PostgreSQL lifecycle/authorization/concurrency proof passed. Synthetic records remain only on the disposable target; retire that target after evidence review.");

function runNode(script, args, cwd) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd, stdio: "inherit", env: {
      ...process.env, DIRECT_URL: url, DATABASE_URL: url, DATABASE_POOL_MAX: "8",
      TOUR_DATABASE_TEST_SHARED_URLS: JSON.stringify(shared),
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Tour database proof command failed (${result.status}).`);
}
