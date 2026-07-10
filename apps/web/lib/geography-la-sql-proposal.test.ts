import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("LA geography SQL proposal", () => {
  const sql = readFileSync(
    path.resolve(process.cwd(), "../../packages/db/prisma/proposals/geography-la-coverage.sql"),
    "utf8",
  );
  const stagingFunction = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION geography_admin.stage_service_area_dataset"),
    sql.indexOf("REVOKE ALL ON FUNCTION geography_admin.stage_service_area_dataset"),
  );

  it("is unnumbered, inactive, extension-explicit, and owner-only", () => {
    expect(sql).toContain("UNNUMBERED CTO INTEGRATION PROPOSAL");
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions");
    expect(sql).toContain("postgis_schema IS DISTINCT FROM 'public'");
    expect(sql).toContain("extensions.digest");
    expect(sql).toContain("public.ST_Intersection");
    expect(sql).toContain("'06037'");
    expect(sql).toContain("Imported area % is not inactive");
    expect(sql).not.toContain("GRANT EXECUTE ON FUNCTION geography_admin");
  });

  it("stages immutable evidence without mutating live geography", () => {
    expect(stagingFunction).toContain("INSERT INTO public.geography_dataset_versions");
    expect(stagingFunction).toContain("INSERT INTO public.service_area_geometry_versions");
    expect(stagingFunction).toContain("'stagedOfficialDisplayParents'");
    expect(stagingFunction).toContain("'stagedOfficialRollups'");
    expect(stagingFunction).toContain("existingActiveAreasUntouched");
    expect(stagingFunction).toContain("'activeAreasChanged', 0");
    expect(stagingFunction).toContain("'currentGeometryPointersChanged', 0");
    expect(stagingFunction).toContain("'marketBoundsChanged', 0");
    expect(stagingFunction).toContain("'liveRelationshipsChanged', 0");
    expect(stagingFunction).not.toContain("UPDATE public.markets");
    expect(stagingFunction).not.toContain("current_geometry_id =");
    expect(stagingFunction).not.toContain("INSERT INTO public.service_area_relationships");
    expect(stagingFunction).not.toContain("DELETE FROM public.service_area_search_terms");
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
    expect(sql).toContain("ORDER BY matches.exact_match DESC, matches.matched_term, matches.service_area_id");
    expect(sql).toContain("least(greatest(coalesce(requested_limit, 8), 1), 8)");
  });
});
