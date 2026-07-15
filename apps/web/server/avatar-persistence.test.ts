import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const schemaUrl = new URL("../../../packages/db/prisma/schema.prisma", import.meta.url);
const migrationUrl = new URL(
  "../../../packages/db/prisma/migrations/20260715081708_persist_user_avatar/migration.sql",
  import.meta.url,
);

describe("user avatar persistence", () => {
  it("backfills and requires one valid stored avatar for every user", async () => {
    const [schema, migration] = await Promise.all([
      readFile(schemaUrl, "utf8"),
      readFile(migrationUrl, "utf8"),
    ]);

    expect(schema).toMatch(/avatarVariant\s+String\s+@default\(dbgenerated\(/);
    expect(migration).toContain('UPDATE public."User"');
    expect(migration).toContain('ADD CONSTRAINT "User_avatarVariant_check"');
    expect(migration).toContain('ALTER COLUMN "avatarVariant" SET DEFAULT');
    expect(migration).toContain('ALTER COLUMN "avatarVariant" SET NOT NULL');
  });
});
