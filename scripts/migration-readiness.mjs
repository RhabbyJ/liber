import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { supabaseProjectRef } from "./database-target.mjs";

const reviewedRetainedLineage = new Map([
  ["qfjcrhkjlczvzakxives", [{
    appliedChecksum: "14b7876154c7f480d2d4d481edfed2ce0a74f70cc99065b58c7e585af7a38004",
    canonicalChecksum: "22d8892fa82867af14ee2d5896e03539bd20de088a146b75a23986e33dae9190",
    migrationName: "20260707000009_add_avatar_variant",
  }]],
]);

export async function readLocalMigrations(migrationsDirectory) {
  const names = await readLocalMigrationNames(migrationsDirectory);
  return Promise.all(names.map(async (migrationName) => {
    const migrationPath = migrationsDirectory instanceof URL
      ? new URL(`${migrationName}/migration.sql`, migrationsDirectory)
      : path.join(migrationsDirectory, migrationName, "migration.sql");
    const contents = await readFile(migrationPath);
    return {
      checksum: createHash("sha256").update(contents).digest("hex"),
      migrationName,
    };
  }));
}

export async function readLocalMigrationNames(migrationsDirectory) {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function supabaseProjectRefFromUrl(value) {
  try {
    return supabaseProjectRef(value);
  } catch {
    return null;
  }
}

export function reviewedRetainedProjectRef(apiUrl, directDatabaseUrl) {
  const apiProjectRef = supabaseProjectRefFromUrl(apiUrl);
  const databaseProjectRef = supabaseProjectRefFromUrl(directDatabaseUrl);
  return apiProjectRef && apiProjectRef === databaseProjectRef
    ? apiProjectRef
    : null;
}

export async function readReviewedRetainedMigrationChecksums({
  migrationsDirectory,
  projectRef,
  retainedLineageDirectory = new URL("../packages/db/prisma/retained-lineage/", import.meta.url),
}) {
  const reviewed = reviewedRetainedLineage.get(projectRef) ?? [];
  const checksums = new Map();

  for (const entry of reviewed) {
    const canonicalPath = resolveMigrationPath(migrationsDirectory, entry.migrationName);
    const retainedPath = resolveMigrationPath(
      retainedLineageDirectory,
      `${projectRef}/${entry.migrationName}`,
    );
    const [canonical, retained] = await Promise.all([
      readFile(canonicalPath),
      readFile(retainedPath),
    ]);
    if (sha256(canonical) !== entry.canonicalChecksum
      || sha256(retained) !== entry.appliedChecksum) {
      throw new Error(`Reviewed retained migration bytes changed: ${entry.migrationName}.`);
    }
    if (commentStrippedSql(canonical) !== commentStrippedSql(retained)) {
      throw new Error(`Reviewed retained migration is no longer comment-only: ${entry.migrationName}.`);
    }
    checksums.set(entry.migrationName, new Set([entry.appliedChecksum]));
  }

  return checksums;
}

export function assessMigrationReadiness(localMigrationNames, databaseMigrations, localChecksums = new Map()) {
  const localNames = new Set(localMigrationNames);
  const databaseRowsByName = new Map();

  for (const migration of databaseMigrations) {
    const rows = databaseRowsByName.get(migration.migration_name) ?? [];
    rows.push(migration);
    databaseRowsByName.set(migration.migration_name, rows);
  }

  const result = { missing: [], failed: [], rolledBack: [], checksumDrift: [], databaseOnly: [] };

  for (const migrationName of [...localNames].sort()) {
    const rows = databaseRowsByName.get(migrationName) ?? [];
    if (rows.length === 0) {
      result.missing.push(migrationName);
    } else if (rows.some((row) => row.finished_at == null && row.rolled_back_at == null)) {
      result.failed.push(migrationName);
    } else if (rows.some((row) => row.finished_at != null && row.rolled_back_at == null)) {
      const expectedChecksum = localChecksums.get(migrationName);
      const appliedRows = rows.filter((row) => row.finished_at != null && row.rolled_back_at == null);
      if (expectedChecksum && appliedRows.some((row) => !checksumMatches(expectedChecksum, row.checksum))) {
        result.checksumDrift.push(migrationName);
      }
      continue;
    } else {
      result.rolledBack.push(migrationName);
    }
  }

  result.databaseOnly = [...databaseRowsByName.keys()]
    .filter((migrationName) => !localNames.has(migrationName))
    .sort();

  return result;
}

// Auth, LOI, and public-geography limits call this overload. Production once
// carried it outside the ledger, so check the catalog, not only migration names.
export const sharedRateLimiterCatalogQuery = `
  SELECT
    pg_get_function_result(
      to_regprocedure('app_private.consume_rate_limit(text,text,integer,integer)')
    ) AS consume_result,
    to_regprocedure('app_private.prune_rate_limit_buckets(timestamp with time zone,integer)') IS NOT NULL
      AS has_prune,
    to_regclass('app_private.rate_limit_buckets') IS NOT NULL AS has_buckets
`;

export function assessSharedRateLimiter(row) {
  const failures = [];
  if (row?.consume_result == null) {
    failures.push("Shared rate limiter app_private.consume_rate_limit(text, text, integer, integer) is missing.");
  } else if (row.consume_result !== "TABLE(allowed boolean, limit_value integer, retry_after_seconds integer)") {
    failures.push(`Shared rate limiter app_private.consume_rate_limit(text, text, integer, integer) returns ${row.consume_result}.`);
  }
  if (!row?.has_prune) {
    failures.push("Shared rate limiter dependency app_private.prune_rate_limit_buckets(timestamptz, integer) is missing.");
  }
  if (!row?.has_buckets) {
    failures.push("Shared rate limiter table app_private.rate_limit_buckets is missing.");
  }
  return failures;
}

// Every scheduled maintenance worker records a heartbeat after a successful run;
// a stale or missing row means its cron is not running or keeps failing.
export const maintenanceWorkerHeartbeats = [
  ["email-outbox", "Email outbox"],
  ["auth-operations", "Auth operations"],
  ["upload-cleanup", "Abandoned upload cleanup"],
  ["marketplace-expiry", "Marketplace expiry"],
];
export const workerHeartbeatMaxAgeSeconds = 5 * 60;

// Prisma stores "lastRunAt" as UTC wall-clock time without a zone. Computing the
// age in SQL avoids node-postgres reading it in the checking machine's zone.
export const workerHeartbeatQuery = `
  SELECT worker,
    extract(epoch FROM ((now() AT TIME ZONE 'UTC') - "lastRunAt"))::double precision AS age_seconds
  FROM public."WorkerHeartbeat"
  WHERE worker = ANY($1::text[])
`;

export function assessWorkerHeartbeats(rows) {
  const ageByWorker = new Map(rows.map((row) => [row.worker, Number(row.age_seconds)]));
  const failures = [];
  for (const [worker, label] of maintenanceWorkerHeartbeats) {
    const ageSeconds = ageByWorker.get(worker);
    if (ageSeconds === undefined || !Number.isFinite(ageSeconds)) {
      failures.push(`${label} worker heartbeat (${worker}) is missing.`);
    } else if (ageSeconds > workerHeartbeatMaxAgeSeconds) {
      failures.push(`${label} worker heartbeat (${worker}) must be less than five minutes old.`);
    }
  }
  return failures;
}

function checksumMatches(expected, actual) {
  if (expected instanceof Set) return expected.has(actual);
  if (Array.isArray(expected)) return expected.includes(actual);
  return expected === actual;
}

function resolveMigrationPath(root, migrationName) {
  return root instanceof URL
    ? new URL(`${migrationName}/migration.sql`, root)
    : path.join(root, migrationName, "migration.sql");
}

function commentStrippedSql(contents) {
  return contents.toString("utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}
