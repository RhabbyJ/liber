import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const migrationName = "20261013120000_activate_la_county_communities";
const sql = readFileSync(path.join(repoRoot, "packages/db/prisma/migrations", migrationName, "migration.sql"), "utf8");
const baselineCopy = readFileSync(
  path.join(repoRoot, "packages/db/prisma/current-baseline/migrations", migrationName, "migration.sql"),
  "utf8",
);
const manifest = JSON.parse(readFileSync(
  path.join(repoRoot, "data/geography/los-angeles-county/la-county-06037-2026-07-12-v2/manifest.json"),
  "utf8",
)) as { areas: Array<{ label: string; slug: string; stableExternalId: string; type: string }> };
const releaseManager = readFileSync(path.join(repoRoot, "scripts/manage-la-geography-release.mjs"), "utf8");
const rehearsal = readFileSync(path.join(repoRoot, "scripts/rehearse-la-community-layer.mjs"), "utf8");

function section(start: string, end: string) {
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from);
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return sql.slice(from, to);
}

const layerVersion = "la-county-06037-2026-10-13-communities-v1";
const aliasFunction = section(
  "CREATE OR REPLACE FUNCTION geography_admin.la_county_community_aliases",
  "REVOKE ALL ON FUNCTION geography_admin.la_county_community_aliases",
);
const assertion = section(
  "CREATE OR REPLACE FUNCTION geography_admin.assert_la_county_activation_current",
  "REVOKE ALL ON FUNCTION geography_admin.assert_la_county_activation_current",
);
const activation = section(
  "CREATE OR REPLACE FUNCTION geography_admin.activate_la_county_communities",
  "REVOKE ALL ON FUNCTION geography_admin.activate_la_county_communities",
);
const rollback = section(
  "CREATE OR REPLACE FUNCTION geography_admin.rollback_la_county_communities",
  "REVOKE ALL ON FUNCTION geography_admin.rollback_la_county_communities",
);
const search = section(
  "CREATE OR REPLACE FUNCTION geography_admin.search_active_service_areas",
  "REVOKE ALL ON FUNCTION geography_admin.search_active_service_areas",
);

describe("LA County community-layer migration", () => {
  it("is one transaction, pins pg_trgm to extensions, and stays owner-only", () => {
    expect(sql).toMatch(/^--[\s\S]*\nBEGIN;/);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions");
    expect(sql).toContain("Liber service-area search requires pg_trgm in extensions");
    expect(sql).not.toMatch(/GRANT\s+(EXECUTE|SELECT|ALL)/i);
    for (const signature of [
      "geography_admin.la_county_community_aliases()",
      "geography_admin.assert_la_county_activation_current(uuid)",
      "geography_admin.activate_la_county_communities(text, text, text)",
      "geography_admin.rollback_la_county_communities(text)",
      "geography_admin.search_active_service_areas(text, text, integer)",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature}\nFROM PUBLIC, anon, authenticated, service_role;`);
    }
    for (const body of [aliasFunction, assertion, activation, rollback, search]) {
      expect(body).toContain("SECURITY INVOKER");
      expect(body).toContain("SET search_path = ''");
    }
    expect(baselineCopy).toBe(sql);
  });

  it("maps every reviewed alias to exactly one reviewed city or community", () => {
    const aliases = [...aliasFunction.matchAll(/\('([^']+)', '([^']+)'\)/g)].map(([, id, term]) => ({ id, term }));
    expect(aliases).toHaveLength(13);
    for (const alias of aliases) {
      const matches = manifest.areas.filter((area) => area.stableExternalId === alias.id);
      expect(matches, alias.id).toHaveLength(1);
      expect(["city", "neighborhood"]).toContain(matches[0].type);
      expect(alias.term).toMatch(/^[a-z0-9]+( [a-z0-9]+)*$/);
    }
    const target = (term: string) => manifest.areas.find(
      (area) => area.stableExternalId === aliases.find((alias) => alias.term === term)?.id,
    )?.slug;
    expect(target("noho")).toBe("north-hollywood");
    expect(target("dtla")).toBe("downtown-los-angeles");
    expect(target("silver lake")).toBe("silverlake");
    expect(target("weho")).toBe("west-hollywood");
    expect(target("la")).toBe("los-angeles");
  });

  it("activates only the staged reviewed communities behind the exact County release", () => {
    expect(activation).toContain(`requested_layer_version IS DISTINCT FROM '${layerVersion}'`);
    expect(activation).toContain("2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47");
    expect(activation).toContain("5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8");
    expect(activation).toContain("The reviewed LA County release must be active before its community layer.");
    expect(activation).toContain("pg_advisory_xact_lock(hashtextextended('service-area-activation:'");
    expect(activation).toContain("A rolled-back community layer cannot be reactivated");
    expect(activation).toContain("Layer-owned live geography rows already exist before activation");
    expect(activation.indexOf("Layer-owned live geography rows already exist"))
      .toBeLessThan(activation.indexOf("INSERT INTO public.geography_activation_snapshots"));
    expect(activation.indexOf("PERFORM geography_admin.assert_la_county_activation_current"))
      .toBeLessThan(activation.indexOf("UPDATE public.service_areas area SET"));
    expect(activation).toContain("clock_timestamp()");
    expect(activation).toContain("manifest_area->>'type' = 'neighborhood'");
    expect(activation).toContain("'COMMUNITY_REVIEWED_ALIAS'");
    expect(activation).toContain("'preexisting_alias_terms'");
    expect(activation).toContain("newly_activated <> 266");
    expect(activation).toContain("type = 'neighborhood') <> 269");
    expect(activation).toContain("SET CONSTRAINTS ALL IMMEDIATE");
    expect(activation).not.toContain("INSERT INTO public.service_area_relationships");
    expect(activation).not.toContain("UPDATE public.markets");
    expect(activation).not.toContain("current_geometry_id =");
  });

  it("revalidates the County release and the community layer together", () => {
    expect(assertion).toContain(`WHERE snapshot.dataset_version = '${layerVersion}'`);
    expect(assertion).toContain("communities_live := layer_snapshot.id IS NOT NULL AND layer_snapshot.rolled_back_at IS NULL");
    expect(assertion).toContain("OR (communities_live AND manifest_area->>'type' = 'neighborhood')");
    expect(assertion).toContain("Community-layer geography contains an unapproved live key");
    expect(assertion).toContain("Community-layer search aliases differ from their approved activation");
    expect(assertion).toContain("'55813f467a184a26398b7f52d9995dcdcf5678db98b4f5950b1740ee9fd92443'");
    expect(assertion).toContain("Release-owned geography contains an unapproved live key");
    expect(assertion).toContain("Live LA County geography differs from its approved activation");
  });

  it("rolls back only layer-owned state and refuses to strand ACTIVE buyers", () => {
    expect(rollback).toContain(`requested_layer_version IS DISTINCT FROM '${layerVersion}'`);
    expect(rollback).toContain("Rollback is blocked by missing or newer live geography state");
    expect(rollback).toContain("Rollback would deactivate an ACTIVE buyer primary service area");
    expect(rollback.indexOf("Rollback would deactivate an ACTIVE buyer"))
      .toBeLessThan(rollback.indexOf("DELETE FROM public.service_area_search_terms"));
    expect(rollback).toContain("layer_snapshot.snapshot->'aliases'");
    expect(rollback).toContain("layer_snapshot.snapshot->'preexisting_alias_terms'");
    expect(rollback).toContain("active = previous.active");
    expect(rollback).toContain("rolled_back_at = clock_timestamp()");
    expect(rollback).toContain("Community rollback left an invalid ACTIVE buyer profile");
    expect(rollback.lastIndexOf("PERFORM geography_admin.assert_la_county_activation_current"))
      .toBeGreaterThan(rollback.indexOf("rolled_back_at = clock_timestamp()"));
  });

  it("keeps indexed exact/prefix lookup and adds bounded word and typo suggestions", () => {
    expect(search).toContain("search_term.term_normalized >= input.term");
    expect(search).toContain("search_term.term_normalized < input.term || U&'\\FFFF'");
    expect(search).toContain("search_term.term_normalized LIKE input.term || '%'");
    expect(search).toContain("least(greatest(coalesce(requested_limit, 8), 1), 8)");
    expect(search).toContain("WHEN replace(area.slug, '-', ' ') = input.term THEN 1");
    expect(search).toContain("WHEN area.postal_code = input.term THEN 2");
    expect(search).toContain("WHEN candidates.term_exact THEN 4");
    expect(search).toContain("AS best_exact_rank");
    expect(search).toContain("named.name LIKE '% ' || input.term || '%'");
    expect(search).toContain("extensions.similarity(names.name, input.term)");
    expect(search).toContain("extensions.word_similarity(input.term, names.name)");
    expect(search).toContain("AND NOT EXISTS (SELECT 1 FROM lexical)");
    expect(search).toContain("greatest(0.45, scored.best_similarity - 0.15)");
    // Fuzzy rows never become exact matches, and areas without reviewed terms stay unsearchable.
    expect(search).toContain("SELECT fuzzy.service_area_id, 3, 1 - fuzzy.similarity, false");
    expect(search).toMatch(/WHERE EXISTS \(\s*SELECT 1 FROM public\.service_area_search_terms search_term/);
    expect(search).toContain("ORDER BY exact_match DESC,");
  });

  it("ships guarded release and rehearsal commands for the layer", () => {
    expect(releaseManager).toContain(`const communityLayerVersion = "${layerVersion}"`);
    expect(releaseManager).toContain(`const communityMigrationName = "${migrationName}"`);
    expect(releaseManager).toContain("response.rows[0]?.checksum !== expectedCommunityMigrationChecksum");
    expect(releaseManager).toContain("datasetVersion: communityAction ? communityLayerVersion : expectedDatasetVersion");
    expect(releaseManager).toContain("geography_admin.activate_la_county_communities($1::text,$2::text,$3::text)");
    expect(releaseManager).toContain("geography_admin.rollback_la_county_communities($1::text)");
    expect(rehearsal).toContain('action: "activate-communities"');
    expect(rehearsal).toContain("countyRollbackBlockedWhileLayerLive: true");
    expect(rehearsal).toContain('await client.query("ROLLBACK");');
  });
});
