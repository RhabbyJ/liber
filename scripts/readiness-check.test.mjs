import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assessMigrationReadiness,
  readLocalMigrations,
  readLocalMigrationNames,
} from "./migration-readiness.mjs";

const readinessScript = path.resolve("scripts/readiness-check.mjs");
const migrationsDirectory = path.resolve("packages/db/prisma/migrations");

test("protected release workflows validate messaging rollout and disposable migrations", () => {
  const readinessWorkflow = readFileSync(path.resolve(".github/workflows/release-readiness.yml"), "utf8");
  const proofWorkflow = readFileSync(path.resolve(".github/workflows/release-proof.yml"), "utf8");

  assert.match(readinessWorkflow, /LIBER_MESSAGING_V1_ENABLED: \$\{\{ vars\.LIBER_MESSAGING_V1_ENABLED \}\}/);
  assert.match(readinessWorkflow, /LIBER_MESSAGING_V1_COHORT_USER_IDS: \$\{\{ vars\.LIBER_MESSAGING_V1_COHORT_USER_IDS \}\}/);
  assert.match(readinessWorkflow, /LIBER_LOI_V1_COHORT_USER_IDS: \$\{\{ vars\.LIBER_LOI_V1_COHORT_USER_IDS \}\}/);
  assert.match(readinessWorkflow, /LIBER_LOI_V1_ENABLED: \$\{\{ vars\.LIBER_LOI_V1_ENABLED \}\}/);
  assert.match(readinessWorkflow, /SITE_URL: \$\{\{ vars\.SITE_URL \}\}/);
  assert.match(readinessWorkflow, /run: npm ci/);
  assert.match(proofWorkflow, /environment: disposable-messaging-proof/);
  assert.match(proofWorkflow, /MESSAGING_MIGRATION_TEST_DATABASE_URL: \$\{\{ secrets\.MESSAGING_UPGRADE_DATABASE_URL \}\}/);
  assert.match(proofWorkflow, /MESSAGING_MIGRATION_TEST_DATABASE_URL: \$\{\{ secrets\.MESSAGING_FRESH_DATABASE_URL \}\}/);
  assert.match(proofWorkflow, /MESSAGING_MIGRATION_TEST_SENTINEL: \$\{\{ secrets\.MESSAGING_UPGRADE_SENTINEL \}\}/);
  assert.match(proofWorkflow, /MESSAGING_MIGRATION_TEST_SENTINEL: \$\{\{ secrets\.MESSAGING_FRESH_SENTINEL \}\}/);
  assert.match(proofWorkflow, /run: npm run db:test-messaging:upgrade/);
  assert.match(proofWorkflow, /run: npm run db:test-messaging:fresh/);
});

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
    { missing: [], failed: [], rolledBack: [], checksumDrift: [], databaseOnly: [] },
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
      checksumDrift: [],
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
      checksumDrift: [],
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
    { missing: [], failed: [migrationName], rolledBack: [], checksumDrift: [], databaseOnly: [] },
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
    { missing: [], failed: [], rolledBack: [], checksumDrift: [], databaseOnly: [] },
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
      checksumDrift: [],
      databaseOnly: ["20260713000000_database_only"],
    },
  );
});

test("production readiness fails closed on database-only migrations", () => {
  const readinessSource = readFileSync(readinessScript, "utf8");
  const databaseOnlyBranch = readinessSource.slice(
    readinessSource.indexOf("if (migrationReadiness.databaseOnly.length > 0)"),
    readinessSource.indexOf("const geography =", readinessSource.indexOf("if (migrationReadiness.databaseOnly.length > 0)")),
  );

  assert.match(databaseOnlyBranch, /collection\.push\(/);
  assert.doesNotMatch(databaseOnlyBranch, /warningCollection/);
});

test("migration readiness rejects edited-in-place applied migration SQL", async () => {
  const [migration] = await readLocalMigrations(migrationsDirectory);
  const applied = {
    ...appliedMigration(migration.migrationName),
    checksum: "0".repeat(64),
  };

  assert.deepEqual(
    assessMigrationReadiness(
      [migration.migrationName],
      [applied],
      new Map([[migration.migrationName, migration.checksum]]),
    ),
    {
      missing: [],
      failed: [],
      rolledBack: [],
      checksumDrift: [migration.migrationName],
      databaseOnly: [],
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

test("production readiness requires a sufficiently strong maintenance secret", () => {
  const result = spawnSync(process.execPath, [readinessScript, "--production"], {
    cwd: path.dirname(readinessScript),
    encoding: "utf8",
    env: { ...process.env, CRON_SECRET: "short" },
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /CRON_SECRET must contain at least 32 characters/);
});

test("readiness rejects privileged browser keys and public server keys", () => {
  const serviceRoleJwt = fakeJwt("service_role");
  const anonJwt = fakeJwt("anon");
  const cases = [
    {
      env: { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_private-key", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_ci_only_not_real" },
      expected: /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key/,
    },
    {
      env: { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: serviceRoleJwt, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_ci_only_not_real" },
      expected: /legacy anon-role JWT/,
    },
    {
      env: { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser-key", SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_ci_only_not_real" },
      expected: /SUPABASE_SERVICE_ROLE_KEY must be a secret key/,
    },
    {
      env: { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser-key", SUPABASE_SERVICE_ROLE_KEY: anonJwt },
      expected: /legacy service-role JWT/,
    },
  ];

  for (const testCase of cases) {
    const result = spawnSync(process.execPath, [readinessScript], {
      cwd: path.dirname(readinessScript),
      encoding: "utf8",
      env: { ...process.env, ...testCase.env },
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, testCase.expected);
  }
});

test("production readiness requires an explicit messaging cohort", () => {
  const result = spawnSync(process.execPath, [readinessScript, "--production"], {
    cwd: path.dirname(readinessScript),
    encoding: "utf8",
    env: {
      ...process.env,
      LIBER_MESSAGING_V1_COHORT_USER_IDS: "*",
      LIBER_MESSAGING_V1_ENABLED: "true",
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /must use an explicit reviewed UUID cohort/);
});

test("messaging readiness rejects an empty parsed cohort", () => {
  const result = spawnSync(process.execPath, [readinessScript, "--production"], {
    cwd: path.dirname(readinessScript),
    encoding: "utf8",
    env: {
      ...process.env,
      LIBER_MESSAGING_V1_COHORT_USER_IDS: " , ",
      LIBER_MESSAGING_V1_ENABLED: "true",
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /must include at least one reviewed UUID/);
});

test("production readiness requires exactly two explicit LOI participant UUIDs", () => {
  for (const cohort of ["*", "019f62c5-1c07-4a62-9f9a-8302778aa011", "019f62c5-1c07-4a62-9f9a-8302778aa011,", "019f62c5-1c07-4a62-9f9a-8302778aa011,019f62c5-1c07-4a62-9f9a-8302778aa012,", "019f62c5-1c07-4a62-9f9a-8302778aa011,,019f62c5-1c07-4a62-9f9a-8302778aa012", "019f62c5-1c07-4a62-9f9a-8302778aa011,019f62c5-1c07-4a62-9f9a-8302778aa011", "019f62c5-1c07-4a62-9f9a-8302778aa011,019f62c5-1c07-4a62-9f9a-8302778aa012,019f62c5-1c07-4a62-9f9a-8302778aa012", "019f62c5-1c07-4a62-9f9a-8302778aa011,019f62c5-1c07-4a62-9f9a-8302778aa012,019f62c5-1c07-4a62-9f9a-8302778aa013"]) {
    const result = spawnSync(process.execPath, [readinessScript, "--production"], {
      cwd: path.dirname(readinessScript),
      encoding: "utf8",
      env: { ...process.env, LIBER_LOI_V1_COHORT_USER_IDS: cohort, LIBER_LOI_V1_ENABLED: "true" },
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /LOI_V1_COHORT_USER_IDS|explicit reviewed UUIDs/);
  }
});

test("production readiness requires a canonical HTTPS email-link origin", () => {
  for (const [siteUrl, expected] of [
    ["", /SITE_URL is required/],
    ["http://liber.example", /SITE_URL must use https in production/],
    ["https://user:password@liber.example", /SITE_URL must not contain credentials/],
  ]) {
    const result = spawnSync(process.execPath, [readinessScript, "--production"], {
      cwd: path.dirname(readinessScript),
      encoding: "utf8",
      env: { ...process.env, SITE_URL: siteUrl },
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, expected);
  }
});

function fakeJwt(role) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  return `${header}.${payload}.test-signature`;
}
