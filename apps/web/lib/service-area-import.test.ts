import { appendFile, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// The operational importer is plain ESM so it can run without a TS runtime.
// @ts-expect-error JavaScript helper intentionally has no generated declaration file.
import { assertImportWriteConfiguration, loadAndValidateDataset, validateAreaFeatureEvidence, validateServiceAreaDataset } from "../../../scripts/service-area-import-lib.mjs";

const datasetRoot = path.resolve(
  process.cwd(),
  "../../data/geography/los-angeles-county/la-county-06037-2026-07-09-v1",
);

describe("reviewed LA County service-area dataset", () => {
  it("verifies the complete checksum ledger, source features, and official relationship evidence", async () => {
    const dataset = await loadAndValidateDataset(path.join(datasetRoot, "manifest.json"));

    expect(dataset.manifest.market).toMatchObject({
      jurisdictionGeoid: "06037",
      jurisdictionType: "county",
      label: "Los Angeles County",
      stableExternalId: "urn:census:county:06037",
    });
    expect(dataset.manifest.counts).toEqual({ areas: 661, cities: 88, communities: 269, zctas: 304 });
    expect(dataset.manifest.areas.every((area: { active: boolean }) => area.active === false)).toBe(true);
    expect(Object.keys(dataset.checksums)).toHaveLength(5);
    expect(dataset.relationships.counts).toEqual({
      displayParents: 149,
      relationships: 298,
      searchRollups: 149,
      zctaAssignments: 0,
    });
    expect(dataset.relationships.relationships.every((relationship: { relationType: string }) => (
      relationship.relationType === "DISPLAY_PARENT" || relationship.relationType === "SEARCH_ROLLUP"
    ))).toBe(true);
  });

  it("rejects a byte change even when JSON remains parseable", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "liber-geography-checksum-"));
    try {
      await cp(datasetRoot, temporaryRoot, { recursive: true });
      await appendFile(path.join(temporaryRoot, "relationships.json"), " ");
      await expect(loadAndValidateDataset(path.join(temporaryRoot, "manifest.json"))).rejects.toThrow(
        "Checksum ledger mismatch for relationships.json",
      );
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it("rejects per-area source evidence that does not match bundle features", async () => {
    const { bundles, manifest } = await loadAndValidateDataset(path.join(datasetRoot, "manifest.json"));
    const altered = {
      ...manifest,
      areas: manifest.areas.map((area: { geometry: Record<string, unknown>; slug: string }) => area.slug === "90001"
        ? { ...area, geometry: { ...area.geometry, sha256: "0".repeat(64) } }
        : area),
    };
    expect(() => validateAreaFeatureEvidence(altered, bundles)).toThrow(
      "Area 90001 source geometry checksum does not match its bundle features",
    );
  });

  it("fails closed for activation, the wrong county, and inferred relationships", async () => {
    const { manifest, relationships } = await loadAndValidateDataset(path.join(datasetRoot, "manifest.json"));
    expect(() => validateServiceAreaDataset({
      ...manifest,
      activation: { ...manifest.activation, activateSlugs: ["90001"] },
    }, relationships)).toThrow("must not activate");
    expect(() => validateServiceAreaDataset({
      ...manifest,
      market: { ...manifest.market, jurisdictionGeoid: "06059" },
    }, relationships)).toThrow("GEOID 06037");
    expect(() => validateServiceAreaDataset(manifest, {
      ...relationships,
      relationships: relationships.relationships.map((relationship: Record<string, unknown>, index: number) => (
        index === 0 ? { ...relationship, relationType: "CONTAINS" } : relationship
      )),
    })).toThrow("Only official CSA city/community DISPLAY_PARENT and SEARCH_ROLLUP");
  });

  it("requires explicit disposable-target write authorization", () => {
    const disposable = "postgresql://postgres@db.disposableprojectref.supabase.co:5432/postgres";
    const shared = "postgresql://postgres.sharedprojectref@aws-0-us-west-1.pooler.supabase.com:6543/postgres";
    expect(() => assertImportWriteConfiguration({
      allowWrites: undefined,
      databaseUrl: disposable,
      sentinel: "a-long-disposable-sentinel",
    })).toThrow("Writing requires");
    expect(() => assertImportWriteConfiguration({
      allowWrites: "true",
      databaseUrl: shared,
      sentinel: "a-long-disposable-sentinel",
      sharedDatabaseUrls: ["postgresql://postgres@db.sharedprojectref.supabase.co:5432/postgres"],
    })).toThrow("configured shared database");
    expect(() => assertImportWriteConfiguration({
      allowWrites: "true",
      databaseUrl: disposable,
      sentinel: "a-long-disposable-sentinel",
      sharedDatabaseUrls: [shared],
    })).not.toThrow();
  });
});
