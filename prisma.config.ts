import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DIRECT_URL or DATABASE_URL is required.");
}

export default defineConfig({
  schema: "packages/db/prisma/schema.prisma",
  migrations: {
    path: "packages/db/prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
