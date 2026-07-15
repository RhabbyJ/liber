import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

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
      if (expectedChecksum && appliedRows.some((row) => row.checksum !== expectedChecksum)) {
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
