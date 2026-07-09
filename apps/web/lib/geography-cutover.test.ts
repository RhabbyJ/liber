import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("canonical geography cutover migration", () => {
  it("quarantines state-scoped legacy candidates without promoting them", () => {
    const migrationRoot = path.resolve(process.cwd(), "../../packages/db/prisma/migrations");
    const initial = readFileSync(
      path.join(migrationRoot, "20260709000013_add_markets_and_buyer_service_area_slugs/migration.sql"),
      "utf8",
    );
    const corrective = readFileSync(
      path.join(migrationRoot, "20260709000015_canonical_service_area_cutover/migration.sql"),
      "utf8",
    );

    expect(initial).not.toContain("'MIGRATED'::\"BuyerDesiredServiceAreaSource\"");
    expect(corrective).toContain("AMBIGUOUS_LEGACY_LOCATION");
    expect(corrective).toContain("MIGRATED_REVIEW_REQUIRED");
    expect(corrective).toContain("source = 'SELECTED'");
    expect(corrective).toContain("upper(trim(buyer_profile.\"desiredState\")) = upper(trim(service_area.state))");
    expect(corrective).toContain("AND market.country = 'US'");
    expect(corrective).toContain("SELECT buyer_profile_id, min(priority) AS priority");
    expect(corrective).toContain("'desiredState', buyer_profile.\"desiredState\"");
    expect(corrective).toContain("DROP INDEX IF EXISTS public.service_areas_market_active_type_idx");
    expect(corrective).not.toContain("INSERT INTO public.buyer_desired_service_areas");
    expect(corrective.indexOf("DROP INDEX IF EXISTS public.service_areas_market_active_type_idx")).toBeLessThan(
      corrective.indexOf("DROP COLUMN market_slug"),
    );
    expect(corrective.indexOf("DROP INDEX IF EXISTS public.buyer_desired_service_areas_service_area_slug_idx")).toBeLessThan(
      corrective.indexOf("DROP COLUMN service_area_slug"),
    );
    expect(corrective).toContain("Canonical service-area state must match its market state.");
    expect(corrective).toContain("Service-area market membership is immutable");
    expect(corrective).toContain("Reviewed SEARCH_ROLLUP relationships cannot contain cycles.");
    expect(corrective).toContain("service_area_migration_quarantine_resolution_check");
    expect(corrective).toContain("preserve_service_area_quarantine_audit");
    expect(corrective).toContain("draft_buyers_for_deactivated_geography");
    expect(corrective).toContain('OR buyer_profile."desiredState" IS NOT NULL');
    expect(corrective).toContain("service_areas_zip_postal_code_check");
    expect(corrective).toContain("postal_code IS NOT NULL AND postal_code ~ '^[0-9]{5}$'");
    expect(corrective).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(corrective).toContain("FOR UPDATE OF buyer_profile NOWAIT");
    expect(corrective).toContain("FOR SHARE");
    expect(corrective).toContain('LOCK TABLE public."BuyerProfile" IN SHARE ROW EXCLUSIVE MODE');
    expect(corrective).toContain("Market jurisdiction is immutable; create a new market instead.");
    expect(corrective.replace(/\r\n/g, "\n")).toContain(
      "WHERE market.id = parent_market_id\n    FOR UPDATE",
    );
  });
});
