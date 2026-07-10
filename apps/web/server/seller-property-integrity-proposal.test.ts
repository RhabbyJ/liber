import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd().replaceAll("\\", "/").endsWith("/apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

function source(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("seller-property integrity proposal", () => {
  it("quarantines every legacy ownership decision and makes property owners immutable", () => {
    const forward = source("packages/db/prisma/proposals/seller-property-integrity.forward.sql");

    expect(forward).toContain("legacy_ownership_evidence_quarantined");
    expect(forward).toContain("legacy_property_ownership_reopened");
    expect(forward).toContain("LIBER_PROPERTY_OWNER_IMMUTABLE");
    expect(forward).toContain("Invite_expiresAt_after_sentAt_check");
    expect(forward).not.toContain('AND document."ownershipEvidenceKind" IS NULL;');
  });

  it("keeps rollback identifiers aligned and removes the expiry constraint", () => {
    const rollback = source("packages/db/prisma/proposals/seller-property-integrity.rollback.sql");

    expect(rollback).toContain("legacy_ownership_evidence_quarantined");
    expect(rollback).toContain("legacy_property_ownership_reopened");
    expect(rollback).toContain('DROP CONSTRAINT IF EXISTS "Invite_expiresAt_after_sentAt_check"');
  });

  it("uses database time, one-winner review, and structured admin discriminants", () => {
    const contracts = source("apps/web/server/contracts.ts");
    const adminPage = source("apps/web/app/admin/documents/page.tsx");

    expect(contracts).toContain("pg_catalog.clock_timestamp()");
    expect(contracts).toContain('where: { id: data.documentId, reviewStatus: "PENDING" }');
    expect(contracts).toContain("documentType: document.documentType");
    expect(adminPage).toContain('document.documentType === "OWNERSHIP"');
    expect(adminPage).not.toContain("startsWith");
  });
});
