import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.resolve(
    "../../packages/db/prisma/migrations/20260715071054_retire_legacy_ownership_version/migration.sql",
  ),
  "utf8",
);

describe("legacy property ownership version retirement", () => {
  it("fails closed before removing conflicting legacy version state", () => {
    expect(migration).toContain('"ownershipVersion" IS DISTINCT FROM "identityVersion"');
    expect(migration).toContain('"propertyOwnershipVersion" IS NOT NULL');
    expect(migration).toContain('"propertyIdentityVersion" IS NULL');
    expect(migration).toContain("RAISE EXCEPTION");
  });

  it("removes only the retired parallel lifecycle and restores the supported evidence index", () => {
    expect(migration).toContain("DROP TRIGGER IF EXISTS enforce_ownership_evidence_binding");
    expect(migration).toContain("DROP TRIGGER IF EXISTS enforce_property_ownership_state");
    expect(migration).toContain('DROP COLUMN IF EXISTS "propertyOwnershipVersion"');
    expect(migration).toContain('DROP COLUMN IF EXISTS "ownershipVersion"');
    expect(migration).toContain('"VerificationDocument_propertyId_ownershipEvidenceKind_idx"');
  });
});
