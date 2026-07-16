import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const migrationStagePath = process.env.LOI_MIGRATION_STAGE_PATH;

if (!databaseUrl) {
  throw new Error("DIRECT_URL or DATABASE_URL is required.");
}
if (!migrationStagePath || !path.isAbsolute(migrationStagePath)) {
  throw new Error("LOI_MIGRATION_STAGE_PATH must be an absolute proof-only migrations path.");
}

export default defineConfig({
  schema: "packages/db/prisma/schema.prisma",
  migrations: {
    path: migrationStagePath,
  },
  datasource: {
    url: databaseUrl,
  },
});
