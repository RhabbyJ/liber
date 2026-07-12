import { appendFile, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
// The operational importer is plain ESM so it can run without a TS runtime.
// @ts-expect-error JavaScript helper intentionally has no generated declaration file.
import { assertImportWriteConfiguration, assertLaReleaseWriteConfiguration, importSharedDatabaseUrls, loadAndValidateDataset, validateAreaFeatureEvidence, validateServiceAreaDataset } from "../../../scripts/service-area-import-lib.mjs";

const datasetRoot = path.resolve(
  process.cwd(),
  "../../data/geography/los-angeles-county/la-county-06037-2026-07-12-v2",
);
const legacyDatasetRoot = path.resolve(
  process.cwd(),
  "../../data/geography/los-angeles-county/la-county-06037-2026-07-09-v1",
);

function expectTextBefore(source: string, first: string, second: string) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  expect(firstIndex).toBeGreaterThan(-1);
  expect(secondIndex).toBeGreaterThan(-1);
  expect(firstIndex).toBeLessThan(secondIndex);
}

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
    expect(Object.keys(dataset.checksums)).toHaveLength(6);
    expect(dataset.manifest.displayBoundaries).toEqual({
      bundles: {
        county: "county.geojson.gz",
        legalCity: "legal-city.geojson.gz",
        zcta: "zcta.geojson.gz",
      },
      counts: { legalCityFeatures: 91, legalCities: 88, zctas: 304 },
      legalCityNameProperty: "CITY_NAME",
    });
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

  it("always protects the standard shared database targets", () => {
    const directUrl = "postgresql://postgres@db.sharedprojectref.supabase.co:5432/postgres";
    const pooledUrl = "postgresql://postgres.sharedprojectref@aws-0-us-west-1.pooler.supabase.com:6543/postgres";
    const extraUrl = "postgresql://postgres@db.disposableprojectref.supabase.co:5432/postgres";
    const sharedUrls = importSharedDatabaseUrls({
      DATABASE_URL: pooledUrl,
      DIRECT_URL: directUrl,
      SERVICE_AREA_IMPORT_SHARED_DATABASE_URLS: JSON.stringify([extraUrl, directUrl]),
    });
    expect(sharedUrls).toEqual([extraUrl, directUrl, pooledUrl]);
    expect(() => assertImportWriteConfiguration({
      allowWrites: "true",
      databaseUrl: pooledUrl,
      sentinel: "a-long-disposable-sentinel",
      sharedDatabaseUrls: sharedUrls,
    })).toThrow("configured shared database");
  });

  it("pins v2 release identity and every legal-city source feature", async () => {
    const { bundles, manifest, relationships } = await loadAndValidateDataset(path.join(datasetRoot, "manifest.json"));
    expect(() => validateServiceAreaDataset({ ...manifest, retrievalDate: "2026-07-13" }, relationships)).toThrow(
      "release identity",
    );
    expect(() => validateServiceAreaDataset({
      ...manifest,
      sources: manifest.sources.map((source: { id: string }) => source.id === "la-county-legal-city-2026-06"
        ? { ...source, sourceVersion: "unexpected" }
        : source),
    }, relationships)).toThrow("Legal-city source registry");
    const legalCities = bundles["legal-city.geojson.gz"];
    expect(() => validateAreaFeatureEvidence(manifest, {
      ...bundles,
      "legal-city.geojson.gz": {
        ...legalCities,
        features: legalCities.features.map((feature: Record<string, unknown>, index: number) => index === 0
          ? { ...feature, properties: { ...(feature.properties as Record<string, unknown>), CITY_NAME: "" } }
          : feature),
      },
    })).toThrow("blank CITY_NAME");
  });

  it("retains read-only validation for the immutable v1 proposal evidence", async () => {
    const dataset = await loadAndValidateDataset(path.join(legacyDatasetRoot, "manifest.json"));

    expect(dataset.manifest.schemaVersion).toBe(1);
    expect(dataset.manifest.counts.areas).toBe(661);
  });

  it("pins production release writes to an exact dataset and Supabase project", () => {
    const datasetVersion = "la-county-06037-2026-07-12-v2";
    const databaseUrl = "postgresql://postgres.qfjcrhkjlczvzakxives@aws-0-us-east-2.pooler.supabase.com:5432/postgres";
    expect(() => assertLaReleaseWriteConfiguration({
      action: "activate",
      allowWrites: "true",
      confirmation: datasetVersion,
      databaseUrl,
      datasetVersion,
      expectedProjectRef: "wrongprojectref00000",
    })).toThrow("confirmed Supabase project");
    expect(() => assertLaReleaseWriteConfiguration({
      action: "activate",
      allowWrites: "true",
      confirmation: datasetVersion,
      databaseUrl,
      datasetVersion,
      expectedProjectRef: "qfjcrhkjlczvzakxives",
    })).not.toThrow();
    expect(() => assertLaReleaseWriteConfiguration({
      action: "activate",
      allowWrites: "true",
      confirmation: datasetVersion,
      databaseUrl: "postgresql://postgres.qfjcrhkjlczvzakxives@attacker.invalid:5432/postgres",
      datasetVersion,
      expectedProjectRef: "qfjcrhkjlczvzakxives",
    })).toThrow("confirmed Supabase project");
    expect(() => assertLaReleaseWriteConfiguration({
      action: "rollback",
      allowWrites: "true",
      confirmation: datasetVersion,
      databaseUrl,
      datasetVersion,
      expectedProjectRef: "qfjcrhkjlczvzakxives",
    })).toThrow("separate destructive confirmation");
  });

  it("binds release writes to the deployed Prisma migration and stable source identity", async () => {
    const importer = await readFile(path.resolve(process.cwd(), "../../scripts/import-service-areas.mjs"), "utf8");
    const releaseManager = await readFile(path.resolve(process.cwd(), "../../scripts/manage-la-geography-release.mjs"), "utf8");
    const builder = await readFile(path.resolve(process.cwd(), "../../scripts/build-la-geography-dataset.mjs"), "utf8");

    expectTextBefore(importer, "commitAttempted = true", 'client.query("COMMIT")');
    expectTextBefore(importer, 'client.query("COMMIT")', "committed = true");
    expect(importer).toContain("Service-area import commit outcome is unknown");
    expect(importer).toContain("Service-area import committed, but result reporting failed");
    expect(releaseManager).toContain("expectedMigrationChecksum");
    expect(releaseManager).toContain("response.rows[0]?.checksum !== expectedMigrationChecksum");
    expectTextBefore(releaseManager, "pg_advisory_xact_lock", 'if (action === "stage")');
    expectTextBefore(releaseManager, "commitAttempted = true", 'client.query("COMMIT")');
    expect(releaseManager).toContain("LA geography commit outcome is unknown; run --status before retrying.");
    expect(builder).toContain("stableJson(csaItemEvidence)");
    expect(builder).toContain("ARCHIVED_CSA_ITEM_EVIDENCE_SHA256");
    expect(builder).not.toContain("sha256(Buffer.from(stableJson(csaItem)))");
  });
});
