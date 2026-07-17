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
