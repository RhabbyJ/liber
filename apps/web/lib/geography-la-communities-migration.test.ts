import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeServiceAreaQuery } from "./service-area-search";

const root = path.resolve(process.cwd(), "../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const release = "la-county-06037-2026-07-12-v2-communities-2026-10-13";

function functionBody(sql: string, name: string) {
  const start = sql.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION geography_admin\\.${name}\\b`));
  const end = sql.indexOf(`REVOKE ALL ON FUNCTION geography_admin.${name}`, start);
  if (start < 0 || end < 0) throw new Error(`Missing function ${name}`);
  return sql.slice(start, end);
}

describe("LA County community activation migration", () => {
  const sql = read("packages/db/prisma/migrations/20261013090000_activate_la_county_communities/migration.sql");
  const v2Sql = read("packages/db/prisma/migrations/20260712090000_expand_la_county_geography/migration.sql");

  it("replaces the unreferenced production prototype deterministically", () => {
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS geography_admin.la_county_community_aliases();\nCREATE FUNCTION geography_admin.la_county_community_aliases()",
    );
    expect(sql).toContain("RETURNS TABLE(stable_external_id text, term_normalized text)");
    expect(sql).not.toContain("area_slug");
  });

  it("is one transaction that changes no live rows by itself", () => {
    expect(sql).toMatch(/^--[\s\S]*\nBEGIN;/);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
    expect(sql.match(/^\s*(BEGIN|COMMIT);\s*$/gm)).toHaveLength(2);
    const outsideFunctions = sql.replace(/AS \$\$[\s\S]*?\$\$;/g, "");
    expect(outsideFunctions).not.toMatch(/\b(UPDATE|INSERT INTO|DELETE FROM)\b/);
  });

  it("changes the approved v2 invariant only to accept the live community overlay", () => {
    const original = functionBody(v2Sql, "assert_la_county_activation_current");
    const replacement = functionBody(sql, "assert_la_county_activation_current");
    const expected = original
      .replace(
        "  dataset_record public.geography_dataset_versions%ROWTYPE;\nBEGIN",
        "  communities_live boolean;\n  dataset_record public.geography_dataset_versions%ROWTYPE;\nBEGIN",
      )
      .replace(
        "    RAISE EXCEPTION 'Activated geography dataset is missing.' USING ERRCODE = '23514';\n  END IF;\n",
        `    RAISE EXCEPTION 'Activated geography dataset is missing.' USING ERRCODE = '23514';\n  END IF;\n  communities_live := EXISTS (\n    SELECT 1 FROM public.geography_activation_snapshots community_snapshot\n    WHERE community_snapshot.dataset_version = '${release}'\n      AND community_snapshot.market_id = dataset_record.market_id\n      AND community_snapshot.rolled_back_at IS NULL\n  );\n`,
      )
      .replace(
        "          OR manifest_area->>'slug' IN ('encino', 'northridge', 'tarzana')\n        )",
        "          OR manifest_area->>'slug' IN ('encino', 'northridge', 'tarzana')\n          OR (communities_live AND manifest_area->>'type' = 'neighborhood')\n        )",
      );
    expect(replacement).toBe(expected);
  });

  it("keeps every new geography function owner-only and pinned to the reviewed release", () => {
    for (const name of [
      "assert_la_county_activation_current(uuid)",
      "la_county_community_aliases()",
      "assert_la_county_communities_current(text)",
      "activate_la_county_communities(text, text, text)",
      "rollback_la_county_communities(text)",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION geography_admin.${name}\nFROM PUBLIC, anon, authenticated, service_role;`);
    }
    const activation = functionBody(sql, "activate_la_county_communities");
    expect(activation).toContain("2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47");
    expect(activation).toContain("5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8");
    expect(activation).toContain("<> 266");
    expect(activation).toContain("pg_advisory_xact_lock(hashtextextended('service-area-activation:'");
    expect(activation).toContain("PERFORM geography_admin.assert_la_county_communities_current(requested_release)");
    const rollback = functionBody(sql, "rollback_la_county_communities");
    expect(rollback).toContain("Rollback would deactivate an ACTIVE buyer primary service area");
    expect(rollback).toContain("PERFORM geography_admin.assert_la_county_activation_current(dataset_id)");
  });

  it("adds only normalized, unique nickname terms", () => {
    const aliasFunction = functionBody(sql, "la_county_community_aliases");
    const aliases = [...aliasFunction.matchAll(/\('(urn:lacounty:csa:(?:city:)?[a-z0-9-]+)', '([^']+)'\)/g)].map((match) => [match[1], match[2]]);
    expect(aliases.length).toBe(30);
    for (const [, term] of aliases) expect(normalizeServiceAreaQuery(term)).toBe(term);
    expect(new Set(aliases.map(([slug, term]) => `${slug}:${term}`)).size).toBe(aliases.length);
  });

  it("uses the same release identifier in the release and rehearsal commands", () => {
    expect(sql.split(`'${release}'`).length - 1).toBe(4);
    expect(read("scripts/manage-la-geography-release.mjs")).toContain(`"${release}"`);
    expect(read("scripts/rehearse-la-community-release.mjs")).toContain(`"${release}"`);
  });
});
