import { readdir } from "node:fs/promises";

export async function readLocalMigrationNames(migrationsDirectory) {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function assessMigrationReadiness(localMigrationNames, databaseMigrations) {
  const localNames = new Set(localMigrationNames);
  const databaseRowsByName = new Map();

  for (const migration of databaseMigrations) {
    const rows = databaseRowsByName.get(migration.migration_name) ?? [];
    rows.push(migration);
    databaseRowsByName.set(migration.migration_name, rows);
  }

  const result = { missing: [], failed: [], rolledBack: [], databaseOnly: [] };

  for (const migrationName of [...localNames].sort()) {
    const rows = databaseRowsByName.get(migrationName) ?? [];
    if (rows.length === 0) {
      result.missing.push(migrationName);
    } else if (rows.some((row) => row.finished_at == null && row.rolled_back_at == null)) {
      result.failed.push(migrationName);
    } else if (rows.some((row) => row.finished_at != null && row.rolled_back_at == null)) {
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
