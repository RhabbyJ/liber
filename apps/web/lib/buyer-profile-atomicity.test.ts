import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { publishBuyerProfileSchema } from "@liber/validators";
import {
  buyerCriteriaSnapshotData,
  buyerProfileSnapshotData,
} from "../server/buyer-profile-publication";

const repoRoot = process.cwd().replaceAll("\\", "/").endsWith("/apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

describe("buyer profile publication atomicity", () => {
  it("clears stale optional profile and criteria values in a full snapshot", () => {
    const snapshot = publishBuyerProfileSchema.parse({
      buyerType: "Conventional financing",
      buyingPurpose: "Condo",
      desiredMarketSlug: "los-angeles",
      desiredServiceAreaSlug: "90001",
    });

    expect(buyerProfileSnapshotData(snapshot)).toEqual({
      bio: null,
      budgetMax: null,
      budgetMin: null,
      buyerType: "Conventional financing",
      buyingPurpose: "Condo",
      downPaymentMax: null,
      downPaymentMin: null,
    });
    expect(buyerCriteriaSnapshotData(snapshot)).toEqual({
      bathroomsMin: null,
      bedroomsMin: null,
      condition: null,
      features: [],
      lotSizeMax: null,
      lotSizeMin: null,
      priceMax: null,
      priceMin: null,
      propertyCategory: "HOME",
      propertySubtype: "CONDO",
      squareFeetMax: null,
      squareFeetMin: null,
      yearBuiltMin: null,
    });
  });

  it("keeps publication as the only profile write and shares its owner lock with admin hide", () => {
    const formActions = readFileSync(path.join(repoRoot, "apps/web/server/form-actions.ts"), "utf8");
    const contracts = readFileSync(path.join(repoRoot, "apps/web/server/contracts.ts"), "utf8");

    expect(formActions).toContain("await publishBuyerProfile(formData)");
    expect(contracts).not.toMatch(/export async function (createBuyerProfile|updateBuyerProfile|upsertBuyerCriteria|setBuyerProfileVisibility)/);
    expect(contracts).toContain('WHERE id = ${authUserId}::uuid');
    expect(contracts).toContain("FOR UPDATE");
    const publication = contracts.slice(
      contracts.indexOf("async function publishDbBuyerProfile"),
      contracts.indexOf("async function syncBuyerDesiredServiceArea"),
    );
    const moderation = contracts.slice(
      contracts.indexOf("export async function hideBuyerProfile"),
      contracts.indexOf("export async function listAuditLog"),
    );
    expect(publication).toContain("await lockBuyerOwnership(tx, user.id)");
    expect(moderation).toContain("await lockBuyerOwnership(tx, profile.userId)");
  });

  it("proposes a real uniqueness constraint and deferred activation guards", () => {
    const proposal = readFileSync(
      path.join(repoRoot, "packages/db/prisma/proposals/buyer-profile-atomicity.sql"),
      "utf8",
    );
    const rollback = readFileSync(
      path.join(repoRoot, "packages/db/prisma/proposals/buyer-profile-atomicity.rollback.sql"),
      "utf8",
    );
    const schema = readFileSync(path.join(repoRoot, "packages/db/prisma/schema.prisma"), "utf8");

    expect(schema).toContain("criteria            BuyerCriteria?");
    expect(schema).toContain("buyerProfileId String       @unique");
    expect(proposal).toContain(
      'ADD CONSTRAINT "BuyerCriteria_buyerProfileId_key" UNIQUE ("buyerProfileId")',
    );
    expect(proposal).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(proposal).toContain("buyer_profile_active_criteria_check");
    expect(proposal).toContain("buyer_criteria_active_profile_check");
    expect(proposal).toContain("buyer_criteria_immutable_profile");
    expect(rollback).toContain('DROP CONSTRAINT IF EXISTS "BuyerCriteria_buyerProfileId_key"');
    expect(rollback).toContain('CREATE INDEX IF NOT EXISTS "BuyerCriteria_buyerProfileId_idx"');
  });
});
