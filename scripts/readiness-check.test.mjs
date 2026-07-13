import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import {
  assessMigrationReadiness,
  readLocalMigrationNames,
} from "./migration-readiness.mjs";

const readinessScript = path.resolve("scripts/readiness-check.mjs");
const migrationsDirectory = path.resolve("packages/db/prisma/migrations");

function appliedMigration(migrationName) {
  return {
    migration_name: migrationName,
    finished_at: new Date("2026-07-13T00:00:00.000Z"),
    rolled_back_at: null,
  };
}

test("the complete current local migration set passes when every migration is applied", async () => {
  const localMigrations = await readLocalMigrationNames(migrationsDirectory);

  assert.ok(localMigrations.includes("20260712090000_expand_la_county_geography"));
  assert.ok(localMigrations.includes("20260712100500_cover_service_area_search_term_market_fk"));
  assert.deepEqual(
    assessMigrationReadiness(localMigrations, localMigrations.map(appliedMigration)),
    { missing: [], failed: [], rolledBack: [], databaseOnly: [] },
  );
});

test("migration readiness reports a local migration missing from the database", () => {
  assert.deepEqual(
    assessMigrationReadiness(
      ["20260712090000_expand_la_county_geography", "20260712100500_cover_service_area_search_term_market_fk"],
      [appliedMigration("20260712090000_expand_la_county_geography")],
    ),
    {
      missing: ["20260712100500_cover_service_area_search_term_market_fk"],
      failed: [],
      rolledBack: [],
      databaseOnly: [],
    },
  );
});

test("migration readiness distinguishes failed and rolled-back local migrations", () => {
  assert.deepEqual(
    assessMigrationReadiness(
      ["20260712090000_expand_la_county_geography", "20260712100500_cover_service_area_search_term_market_fk"],
      [
        {
          migration_name: "20260712090000_expand_la_county_geography",
          finished_at: null,
          rolled_back_at: null,
        },
        {
          migration_name: "20260712100500_cover_service_area_search_term_market_fk",
          finished_at: null,
          rolled_back_at: new Date("2026-07-13T00:00:00.000Z"),
        },
      ],
    ),
    {
      missing: [],
      failed: ["20260712090000_expand_la_county_geography"],
      rolledBack: ["20260712100500_cover_service_area_search_term_market_fk"],
      databaseOnly: [],
    },
  );
});

test("migration readiness fails an unresolved attempt even when another attempt succeeded", () => {
  const migrationName = "20260712090000_expand_la_county_geography";
  assert.deepEqual(
    assessMigrationReadiness(
      [migrationName],
      [
        appliedMigration(migrationName),
        { migration_name: migrationName, finished_at: null, rolled_back_at: null },
      ],
    ),
    { missing: [], failed: [migrationName], rolledBack: [], databaseOnly: [] },
  );

  assert.deepEqual(
    assessMigrationReadiness(
      [migrationName],
      [
        appliedMigration(migrationName),
        {
          migration_name: migrationName,
          finished_at: null,
          rolled_back_at: new Date("2026-07-13T00:00:00.000Z"),
        },
      ],
    ),
    { missing: [], failed: [], rolledBack: [], databaseOnly: [] },
  );
});

test("migration readiness reports database-only migrations separately", () => {
  assert.deepEqual(
    assessMigrationReadiness(
      ["20260712090000_expand_la_county_geography"],
      [
        appliedMigration("20260712090000_expand_la_county_geography"),
        appliedMigration("20260713000000_database_only"),
      ],
    ),
    {
      missing: [],
      failed: [],
      rolledBack: [],
      databaseOnly: ["20260713000000_database_only"],
    },
  );
});

test("production readiness requires a sufficiently long Auth rate-limit pepper", () => {
  const result = spawnSync(process.execPath, [readinessScript, "--production"], {
    cwd: path.dirname(readinessScript),
    encoding: "utf8",
    env: {
      ...process.env,
      AUTH_RATE_LIMIT_PEPPER: "too-short",
      CRON_SECRET: "",
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /AUTH_RATE_LIMIT_PEPPER must contain at least 32 characters/);
});
