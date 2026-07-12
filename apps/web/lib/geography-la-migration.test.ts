import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("LA County geography migration", () => {
  const sql = readFileSync(
    path.resolve(process.cwd(), "../../packages/db/prisma/migrations/20260712090000_expand_la_county_geography/migration.sql"),
    "utf8",
  );
  const advisorIndexSql = readFileSync(
    path.resolve(process.cwd(), "../../packages/db/prisma/migrations/20260712100500_cover_service_area_search_term_market_fk/migration.sql"),
    "utf8",
  );
  const stagingFunction = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION geography_admin.stage_service_area_dataset"),
    sql.indexOf("REVOKE ALL ON FUNCTION geography_admin.stage_service_area_dataset"),
  );
  const activationAssertion = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION geography_admin.assert_la_county_activation_current"),
    sql.indexOf("REVOKE ALL ON FUNCTION geography_admin.assert_la_county_activation_current"),
  );
  const activationFunction = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION geography_admin.activate_service_area_dataset"),
    sql.indexOf("REVOKE ALL ON FUNCTION geography_admin.activate_service_area_dataset"),
  );
  const rollbackFunction = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION geography_admin.rollback_service_area_dataset"),
    sql.indexOf("REVOKE ALL ON FUNCTION geography_admin.rollback_service_area_dataset"),
  );

  it("is transactional, extension-explicit, checksum-pinned, and owner-only", () => {
    expect(sql).toMatch(/^--[\s\S]*\nBEGIN;/);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions");
    expect(sql).toContain("postgis_schema IS DISTINCT FROM 'public'");
    expect(sql).toContain("extensions.digest");
    expect(sql).toContain("public.ST_Intersection");
    expect(sql).toContain("'06037'");
    expect(sql).toContain("Imported area % is not inactive");
    expect(sql).toContain("2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47");
    expect(sql).toContain("5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8");
    expect(sql).toContain("55813f467a184a26398b7f52d9995dcdcf5678db98b4f5950b1740ee9fd92443");
    expect(stagingFunction).toContain("provided_manifest_sha256 IS DISTINCT FROM '2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47'");
    expect(stagingFunction).toContain("provided_relationships_sha256 IS DISTINCT FROM '5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8'");
    expect(stagingFunction).toContain("convert_to(county_bundle::text, 'utf8')");
    expect(stagingFunction).toContain("5fd4460f31d6c942c3733d99f8d874ad6b88398c94b4d84e1dea97bb909f72b1");
    expect(stagingFunction).toContain("346b290d5312d8dd253e9d5fabc158d8c12776e98cf684143b521d8575c0ec68");
    expect(stagingFunction).toContain("0362d1953502b989d59a43f792e405fcc36a27c0847e25d518ce36f1295fdaf5");
    expect(stagingFunction).toContain("c2bdcf416b62703755dcb36e0ef952b3abb698661bbcf2a5612e171e700afcd5");
    expect(sql).not.toContain("GRANT EXECUTE ON FUNCTION geography_admin");
  });

  it("stages immutable evidence without mutating live geography", () => {
    expect(stagingFunction).toContain("INSERT INTO public.geography_dataset_versions");
    expect(stagingFunction).toContain("INSERT INTO public.service_area_geometry_versions");
    expect(stagingFunction).toContain("INSERT INTO public.market_display_geometry_versions");
    expect(stagingFunction).toContain("'stagedOfficialDisplayParents'");
    expect(stagingFunction).toContain("'stagedOfficialRollups'");
    expect(stagingFunction).toContain("existingActiveAreasUntouched");
    expect(stagingFunction).toContain("'activeAreasChanged', 0");
    expect(stagingFunction).toContain("'currentGeometryPointersChanged', 0");
    expect(stagingFunction).toContain("'marketBoundsChanged', 0");
    expect(stagingFunction).toContain("'liveRelationshipsChanged', 0");
    expect(stagingFunction).not.toContain("UPDATE public.markets");
    expect(stagingFunction).not.toContain("UPDATE public.service_areas");
    expect(stagingFunction).not.toContain("current_geometry_id =");
    expect(stagingFunction).not.toContain("INSERT INTO public.service_area_relationships");
    expect(stagingFunction).not.toContain("DELETE FROM public.service_area_search_terms");
  });

  it("activates only the reviewed city/ZIP allowlist and records executable rollback", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION geography_admin.activate_service_area_dataset");
    expect(sql).toContain("manifest_area->>'type' IN ('city', 'zip')");
    expect(sql).toContain("activeCities', 88");
    expect(sql).toContain("activeZctas', 304");
    expect(sql).toContain("INSERT INTO public.geography_activation_snapshots");
    expect(sql).toContain("'preexisting_search_terms'");
    expect(sql).toContain("'preexisting_relationships'");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION geography_admin.rollback_service_area_dataset");
    expect(rollbackFunction).toContain("DELETE FROM public.service_area_relationships relationship");
    expect(rollbackFunction).toContain("snapshot_record.snapshot->'preexisting_relationships'");
    expect(rollbackFunction).toContain("snapshot_record.snapshot->'preexisting_search_terms'");
    expect(rollbackFunction).not.toContain("relationship.source = requested_dataset_version");
    expect(rollbackFunction).not.toContain("search_term.source = requested_dataset_version");
    expect(sql).toContain("SET CONSTRAINTS ALL IMMEDIATE");
  });

  it("blocks buyer-invalidating rollback and rejects release-owned metadata drift", () => {
    expect(rollbackFunction).toContain("Rollback would deactivate an ACTIVE buyer primary service area");
    expect(rollbackFunction).toContain("previous.active = false");
    expect(rollbackFunction).toContain("LA County rollback left an invalid ACTIVE buyer profile");
    expect(activationAssertion).toContain("search_term.term_kind = 'DATASET_REVIEWED_ALIAS'");
    expect(activationAssertion).toContain("search_term.source = dataset_record.dataset_version");
    expect(activationAssertion).toContain("stored.source = dataset_record.dataset_version");
    expect(activationAssertion).toContain("stored.reviewed_at IS NOT DISTINCT FROM (relationship.value->>'reviewedAt')::timestamptz");
  });

  it("rejects additive release-owned drift and leaves none after rollback", () => {
    expect(activationAssertion).toContain("Release-owned geography contains an unapproved live key");
    expect(activationAssertion).toContain("search_term.source = dataset_record.dataset_version");
    expect(activationAssertion).toContain("stored.source = dataset_record.dataset_version");
    expect(activationFunction).toContain("Release-owned live geography rows already exist before activation");
    expect(activationFunction).toContain("WHERE source = requested_dataset_version");
    expect(rollbackFunction).toContain("SELECT 1 FROM public.service_area_search_terms");
    expect(rollbackFunction).toContain("SELECT 1 FROM public.service_area_relationships");
    expect(rollbackFunction).toContain("WHERE source = requested_dataset_version");
  });

  it("scopes stable IDs and search terms to a market and deduplicates lookup", () => {
    expect(stagingFunction).toContain("Stable ID and market slug resolve to different service areas");
    expect(sql).toContain("service_areas_market_id_stable_external_id_key");
    expect(sql).toContain("ON public.service_areas(market_id, stable_external_id)");
    expect(stagingFunction).toContain("WHERE area.market_id = market_id_value");
    expect(stagingFunction).not.toContain("belongs to another market");
    expect(sql).toContain("service_area_search_terms_service_area_id_market_id_fkey");
    expect(sql).toContain("REFERENCES public.service_areas(id, market_id)");
    expect(sql).toContain("area.market_id = selected_market.id");
    expect(sql).toContain("GROUP BY search_term.service_area_id");
    expect(sql).toContain("replace(area.slug, '-', ' ') = input.term THEN 1");
    expect(sql).toContain("area.postal_code = input.term THEN 2");
    expect(sql).toContain("AS best_exact_rank");
    expect(sql).toContain("ORDER BY exact_match DESC, ranked.exact_rank, ranked.matched_term, ranked.service_area_id");
    expect(sql).toContain("least(greatest(coalesce(requested_limit, 8), 1), 8)");
  });

  it("stores public geometry as privacy-safe Features and revalidates activated state", () => {
    expect(stagingFunction).toContain("jsonb_build_object(");
    expect(stagingFunction).toContain("'type', 'Feature'");
    expect(stagingFunction).toContain("'kind', area_record->>'type'");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION geography_admin.assert_la_county_activation_current");
    expect(sql).toContain("VOLATILE");
    expect(sql).toContain("PERFORM geography_admin.assert_la_county_activation_current(dataset_record.id)");
  });

  it("covers the composite same-market search-term foreign key", () => {
    expect(advisorIndexSql).toContain("DROP INDEX IF EXISTS public.service_area_search_terms_area_idx");
    expect(advisorIndexSql).toContain("ON public.service_area_search_terms(service_area_id, market_id)");
  });
});
