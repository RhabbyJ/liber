import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { sameDatabaseTarget } from "./database-target.mjs";

const areaTypes = new Set(["city", "neighborhood", "zip"]);
const canonicalBundleNames = ["county.geojson.gz", "csa-land.geojson.gz", "zcta.geojson.gz"];
const displayBundleName = "legal-city.geojson.gz";
const reviewedV2ManifestSha256 = "2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47";
const reviewedV2RelationshipsSha256 = "5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8";

export function validateServiceAreaDataset(manifest, relationships) {
  if (!manifest || typeof manifest !== "object" || !new Set([1, 2]).has(manifest.schemaVersion)) {
    throw new Error("Dataset manifest schemaVersion must be 1 or 2.");
  }
  if (manifest.market?.slug !== "los-angeles"
    || manifest.market?.jurisdictionType !== "county"
    || manifest.market?.jurisdictionGeoid !== "06037"
    || manifest.market?.stableExternalId !== "urn:census:county:06037") {
    throw new Error("Los Angeles coverage must be County GEOID 06037 with its stable jurisdiction ID.");
  }
  if (manifest.market?.state !== "CA" || manifest.market?.country !== "US") {
    throw new Error("Los Angeles County market jurisdiction must be CA, US.");
  }
  if (manifest.activation?.activateMarket !== false || manifest.activation?.activateSlugs?.length !== 0) {
    throw new Error("The reviewed LA dataset must not activate its market or service areas.");
  }
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) throw new Error("Dataset sources are required.");
  const sourcesById = new Map();
  for (const source of manifest.sources) {
    for (const field of ["id", "license", "licenseUrl", "name", "retrievalDate", "retrievalUrl", "sourceUrl", "sourceVersion"]) {
      if (!nonempty(source[field])) throw new Error(`Dataset source ${source.id ?? "<unknown>"} is missing ${field}.`);
    }
    if (sourcesById.has(source.id)) throw new Error(`Duplicate dataset source ID: ${source.id}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.retrievalDate)) throw new Error(`Dataset source ${source.id} has an invalid retrieval date.`);
    assertHttpUrl(source.licenseUrl, `source ${source.id} license URL`);
    assertHttpUrl(source.retrievalUrl, `source ${source.id} retrieval URL`);
    assertHttpUrl(source.sourceUrl, `source ${source.id} landing URL`);
    if (source.evidenceSha256 !== null && source.evidenceSha256 !== undefined) {
      assertSha256(source.evidenceSha256, `source ${source.id} evidence`);
    }
    sourcesById.set(source.id, source);
  }
  if (manifest.schemaVersion === 2
    && (manifest.datasetVersion !== "la-county-06037-2026-07-12-v2" || manifest.retrievalDate !== "2026-07-12")) {
    throw new Error("Schema-v2 release identity must match the reviewed LA County dataset and retrieval date.");
  }
  if (manifest.schemaVersion === 2) {
    const legalCitySource = sourcesById.get("la-county-legal-city-2026-06");
    if (!legalCitySource
      || legalCitySource.name !== "County of Los Angeles City and Unincorporated Boundaries (Legal)"
      || legalCitySource.license !== "County of Los Angeles eGIS Terms of Use"
      || legalCitySource.licenseUrl !== "https://egis-lacounty.hub.arcgis.com/pages/terms-of-use"
      || legalCitySource.retrievalUrl !== "https://public.gis.lacounty.gov/public/rest/services/LACounty_Dynamic/Political_Boundaries/MapServer/19/query"
      || legalCitySource.sourceUrl !== "https://public.gis.lacounty.gov/public/rest/services/LACounty_Dynamic/Political_Boundaries/MapServer/19"
      || legalCitySource.retrievalDate !== "2026-07-12"
      || legalCitySource.sourceVersion !== "Legal city land boundaries; latest source edit 2026-06-02T00:42:59.000Z"
      || legalCitySource.evidenceSha256 !== manifest.bundles?.[displayBundleName]?.contentSha256) {
      throw new Error("Legal-city source registry does not match its reviewed County bundle evidence.");
    }
  }

  if (!Array.isArray(manifest.areas) || manifest.areas.length === 0) throw new Error("Dataset areas are required.");
  const slugs = new Set();
  const externalIds = new Set();
  const areasByExternalId = new Map();
  for (const area of manifest.areas) {
    if (!validSlug(area.slug) || slugs.has(area.slug)) throw new Error(`Invalid or duplicate area slug: ${area.slug ?? ""}`);
    if (!nonempty(area.stableExternalId) || externalIds.has(area.stableExternalId)) {
      throw new Error(`Invalid or duplicate stable external ID: ${area.stableExternalId ?? ""}`);
    }
    slugs.add(area.slug);
    externalIds.add(area.stableExternalId);
    areasByExternalId.set(area.stableExternalId, area);
    if (!areaTypes.has(area.type)) throw new Error(`Unsupported service-area type for ${area.slug}.`);
    if (area.active !== false) throw new Error(`New dataset area ${area.slug} must stage inactive.`);
    if (area.state !== "CA" || area.county !== "Los Angeles County") throw new Error(`Area ${area.slug} is outside the reviewed jurisdiction.`);
    if (area.type === "zip" && !/^\d{5}$/.test(area.postalCode ?? "")) throw new Error(`ZIP area ${area.slug} requires a five-digit postal code.`);
    if (!Array.isArray(area.searchTerms) || area.searchTerms.length === 0) throw new Error(`Area ${area.slug} has no reviewed search terms.`);
    if (new Set(area.searchTerms).size !== area.searchTerms.length
      || area.searchTerms.some((term) => !nonempty(term) || term !== normalizeSearchTerm(term))) {
      throw new Error(`Area ${area.slug} has duplicate or non-normalized reviewed search terms.`);
    }
    if (!nonempty(area.geometry?.bundle)
      || !Array.isArray(area.geometry?.featureIds)
      || area.geometry.featureIds.length === 0
      || new Set(area.geometry.featureIds).size !== area.geometry.featureIds.length) {
      throw new Error(`Area ${area.slug} has invalid source geometry features.`);
    }
    const expectedBundle = area.type === "zip" ? "zcta.geojson.gz" : "csa-land.geojson.gz";
    if (area.geometry.bundle !== expectedBundle) throw new Error(`Area ${area.slug} uses the wrong source bundle.`);
    assertSha256(area.geometry.sha256, `area ${area.slug} geometry`);
    const canonicalSource = sourcesById.get(area.source?.id);
    if (!canonicalSource) throw new Error(`Area ${area.slug} references an unknown source.`);
    for (const field of ["license", "licenseUrl", "retrievalDate", "retrievalUrl", "sourceUrl", "sourceVersion"]) {
      if (area.source[field] !== canonicalSource[field]) throw new Error(`Area ${area.slug} source ${field} does not match its source registry entry.`);
    }
  }
  const actualCounts = {
    areas: manifest.areas.length,
    cities: manifest.areas.filter((area) => area.type === "city").length,
    communities: manifest.areas.filter((area) => area.type === "neighborhood").length,
    zctas: manifest.areas.filter((area) => area.type === "zip").length,
  };
  if (JSON.stringify(manifest.counts) !== JSON.stringify(actualCounts)) throw new Error("Manifest area counts do not match its records.");
  if (actualCounts.areas !== 661 || actualCounts.cities !== 88
    || actualCounts.communities !== 269 || actualCounts.zctas !== 304) {
    throw new Error("LA County dataset must contain exactly 88 cities, 269 communities, and 304 ZCTAs.");
  }
  if (manifest.schemaVersion === 2) validateDisplayBoundaryManifest(manifest.displayBoundaries);

  if (!relationships || relationships.schemaVersion !== 1 || relationships.datasetVersion !== manifest.datasetVersion) {
    throw new Error("Relationship artifact does not match the dataset version.");
  }
  const relationshipKeys = new Set();
  for (const relationship of relationships.relationships ?? []) {
    const parent = areasByExternalId.get(relationship.parentStableExternalId);
    const child = areasByExternalId.get(relationship.childStableExternalId);
    if (!parent || !child) throw new Error("Relationship references an area outside the reviewed dataset.");
    if (!new Set(["DISPLAY_PARENT", "SEARCH_ROLLUP"]).has(relationship.relationType)
      || parent.type !== "city"
      || child.type !== "neighborhood"
      || child.parentStableExternalId !== parent.stableExternalId) {
      throw new Error("Only official CSA city/community DISPLAY_PARENT and SEARCH_ROLLUP relationships are accepted.");
    }
    if (!nonempty(relationship.reviewedAt) || !nonempty(relationship.source)
      || relationship.reviewEvidence?.method !== "Official CSA LCITY membership") {
      throw new Error("Reviewed relationships require official LCITY review evidence.");
    }
    const key = `${relationship.parentStableExternalId}\0${relationship.childStableExternalId}\0${relationship.relationType}`;
    if (relationshipKeys.has(key)) throw new Error("Relationship artifact contains duplicates.");
    relationshipKeys.add(key);
  }
  const displayParents = [...relationshipKeys].filter((key) => key.endsWith("\0DISPLAY_PARENT")).length;
  const searchRollups = [...relationshipKeys].filter((key) => key.endsWith("\0SEARCH_ROLLUP")).length;
  const actualRelationshipCounts = {
    relationships: relationshipKeys.size,
    displayParents,
    searchRollups,
    zctaAssignments: 0,
  };
  if (JSON.stringify(relationships.counts) !== JSON.stringify(actualRelationshipCounts)) {
    throw new Error("Relationship counts do not match the reviewed records.");
  }
  if (relationshipKeys.size !== 298 || displayParents !== 149 || searchRollups !== 149) {
    throw new Error(`Expected 149 official display parents and rollups, received ${displayParents} and ${searchRollups}.`);
  }
  return { manifest, relationships };
}

export async function loadAndValidateDataset(manifestPath) {
  const datasetRoot = path.dirname(path.resolve(manifestPath));
  const manifestBytes = await readFile(path.join(datasetRoot, "manifest.json"));
  const relationshipBytes = await readFile(path.join(datasetRoot, "relationships.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const relationships = JSON.parse(relationshipBytes.toString("utf8"));
  validateServiceAreaDataset(manifest, relationships);

  const bundleNames = Object.keys(manifest.bundles ?? {}).sort();
  const expectedBundleNames = manifest.schemaVersion === 2
    ? [...canonicalBundleNames, displayBundleName].sort()
    : [...canonicalBundleNames].sort();
  if (JSON.stringify(bundleNames) !== JSON.stringify(expectedBundleNames)) {
    throw new Error("Dataset manifest does not declare exactly its reviewed source bundles.");
  }
  const checksums = await verifyChecksumLedger(datasetRoot, [...bundleNames, "manifest.json", "relationships.json"]);
  if (manifest.schemaVersion === 2
    && (checksums["manifest.json"] !== reviewedV2ManifestSha256
      || checksums["relationships.json"] !== reviewedV2RelationshipsSha256)) {
    throw new Error("Schema-v2 checksum ledger does not match the reviewed LA County release.");
  }
  const bundles = {};
  for (const filename of bundleNames) {
    const evidence = manifest.bundles[filename];
    assertSha256(evidence.compressedSha256, `${filename} compressed`);
    assertSha256(evidence.contentSha256, `${filename} content`);
    const compressed = await readFile(path.join(datasetRoot, filename));
    if (sha256(compressed) !== evidence.compressedSha256) throw new Error(`Compressed checksum mismatch for ${filename}.`);
    const content = gunzipSync(compressed);
    if (sha256(content) !== evidence.contentSha256) throw new Error(`Content checksum mismatch for ${filename}.`);
    if (content.length !== evidence.contentSize || compressed.length !== evidence.compressedSize) {
      throw new Error(`Size evidence mismatch for ${filename}.`);
    }
    const geojson = JSON.parse(content.toString("utf8"));
    if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features) || geojson.features.length === 0) {
      throw new Error(`${filename} must contain a non-empty GeoJSON FeatureCollection.`);
    }
    bundles[filename] = geojson;
  }
  validateAreaFeatureEvidence(manifest, bundles);
  return { bundles, checksums, manifest, relationships };
}

export function assertImportWriteConfiguration({ allowWrites, databaseUrl, sentinel, sharedDatabaseUrls = [] }) {
  if (allowWrites !== "true" || !databaseUrl || !sentinel || sentinel.length < 16) {
    throw new Error("Writing requires SERVICE_AREA_IMPORT_ALLOW_WRITES=true, a dedicated database URL, and a 16+ character sentinel.");
  }
  new URL(databaseUrl);
  if (sharedDatabaseUrls.some((sharedUrl) => sharedUrl && sameDatabaseTarget(sharedUrl, databaseUrl))) {
    throw new Error("Refusing to stage geography against a configured shared database target.");
  }
}

export function importSharedDatabaseUrls(environment) {
  const standardUrls = [environment.DIRECT_URL, environment.DATABASE_URL].filter(Boolean);
  const configuredUrls = environment.SERVICE_AREA_IMPORT_SHARED_DATABASE_URLS;
  if (configuredUrls === undefined) return standardUrls;

  const parsed = JSON.parse(configuredUrls);
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new Error("SERVICE_AREA_IMPORT_SHARED_DATABASE_URLS must be a JSON string array.");
  }
  return [...new Set([...parsed, ...standardUrls])];
}

function normalizeSearchTerm(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function verifyChecksumLedger(datasetRoot, requiredDatasetFiles) {
  const ledger = await readFile(path.join(datasetRoot, "CHECKSUMS.sha256"), "utf8");
  const entries = new Map();
  for (const line of ledger.trim().split(/\r?\n/)) {
    const match = line.match(/^([a-f0-9]{64})  ([a-z0-9.-]+)$/);
    if (!match || entries.has(match[2])) throw new Error("Dataset checksum ledger is malformed or contains duplicates.");
    entries.set(match[2], match[1]);
  }
  if (JSON.stringify([...entries.keys()].sort()) !== JSON.stringify([...requiredDatasetFiles].sort())) {
    throw new Error("Dataset checksum ledger must cover exactly the reviewed dataset files.");
  }
  for (const [filename, expected] of entries) {
    const bytes = await readFile(path.join(datasetRoot, filename));
    const checksumBytes = filename.endsWith(".json")
      ? Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"))
      : bytes;
    const actual = sha256(checksumBytes);
    if (actual !== expected) throw new Error(`Checksum ledger mismatch for ${filename}.`);
  }
  return Object.fromEntries(entries);
}

export function validateAreaFeatureEvidence(manifest, bundles) {
  const idFields = {
    "county.geojson.gz": "GEOID",
    "csa-land.geojson.gz": "OBJECTID",
    "zcta.geojson.gz": "ZCTA5",
  };
  const featureMaps = new Map();
  const expectedFeatureCounts = {
    "county.geojson.gz": 1,
    "csa-land.geojson.gz": 355,
    "zcta.geojson.gz": 304,
  };
  if (bundles[displayBundleName]) {
    idFields[displayBundleName] = "OBJECTID";
    expectedFeatureCounts[displayBundleName] = 91;
  }
  for (const [filename, idField] of Object.entries(idFields)) {
    const features = new Map();
    for (const feature of bundles[filename].features) {
      const id = String(feature.properties?.[idField] ?? "");
      if (!id || features.has(id)) throw new Error(`${filename} contains a missing or duplicate ${idField}.`);
      if (!new Set(["Polygon", "MultiPolygon"]).has(feature.geometry?.type)) {
        throw new Error(`${filename} feature ${id} has unsupported geometry.`);
      }
      features.set(id, feature);
    }
    if (features.size !== expectedFeatureCounts[filename]) {
      throw new Error(`${filename} feature count does not match the reviewed dataset.`);
    }
    featureMaps.set(filename, features);
  }
  if (!featureMaps.get("county.geojson.gz")?.has("06037")) throw new Error("County bundle is missing GEOID 06037.");
  if (bundles[displayBundleName]) {
    const legalCityFeatures = bundles[displayBundleName].features;
    if (legalCityFeatures.some((feature) => !nonempty(feature.properties?.CITY_NAME))) {
      throw new Error("Legal-city bundle contains a blank CITY_NAME.");
    }
    if (legalCityFeatures.some((feature) => !Number.isFinite(Number(feature.properties?.last_edited_date)))) {
      throw new Error("Legal-city bundle contains a missing last_edited_date.");
    }
    const cityNames = new Set(legalCityFeatures.map((feature) => feature.properties.CITY_NAME.trim()));
    if (cityNames.size !== 88) throw new Error("Legal-city bundle must contain exactly 88 incorporated city names.");
    if (bundles[displayBundleName].features.some((feature) => (
      feature.properties?.CITY_TYPE !== "City" || feature.properties?.FEAT_TYPE !== "Land"
    ))) throw new Error("Legal-city bundle contains a non-city or non-land feature.");
  }
  for (const area of manifest.areas) {
    const features = featureMaps.get(area.geometry.bundle);
    const sourceGeometries = area.geometry.featureIds.map((featureId) => {
      const feature = features?.get(String(featureId));
      if (!feature) throw new Error(`Area ${area.slug} references missing feature ${featureId}.`);
      return feature.geometry;
    });
    const hashInput = area.type === "city" ? sourceGeometries : sourceGeometries[0];
    if (sha256(Buffer.from(JSON.stringify(hashInput))) !== area.geometry.sha256) {
      throw new Error(`Area ${area.slug} source geometry checksum does not match its bundle features.`);
    }
  }
}

export function assertLaReleaseWriteConfiguration({
  action,
  allowRollback,
  allowWrites,
  confirmation,
  databaseUrl,
  datasetVersion,
  expectedProjectRef,
  rollbackConfirmation,
}) {
  if (!new Set(["stage", "activate", "rollback"]).has(action)) throw new Error("Unsupported LA geography release action.");
  if (allowWrites !== "true" || confirmation !== datasetVersion) {
    throw new Error("LA geography writes require the exact dataset confirmation and write opt-in.");
  }
  if (!databaseUrl || !/^[a-z0-9]{20}$/.test(expectedProjectRef ?? "")) {
    throw new Error("LA geography writes require a database URL and exact Supabase project ref.");
  }
  const parsed = new URL(databaseUrl);
  const directMatch = parsed.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/);
  const poolerMatch = /(^|\.)pooler\.supabase\.com$/.test(parsed.hostname)
    ? decodeURIComponent(parsed.username).match(/^postgres\.([a-z0-9]{20})$/)
    : null;
  const actualProjectRef = directMatch?.[1] ?? poolerMatch?.[1];
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)
    || parsed.pathname !== "/postgres"
    || actualProjectRef !== expectedProjectRef) {
    throw new Error("LA geography release database does not match the confirmed Supabase project.");
  }
  if (action === "rollback"
    && (allowRollback !== "true" || rollbackConfirmation !== `${datasetVersion}:rollback`)) {
    throw new Error("LA geography rollback requires its separate destructive confirmation.");
  }
}

function validateDisplayBoundaryManifest(value) {
  const expected = {
    bundles: {
      county: "county.geojson.gz",
      legalCity: displayBundleName,
      zcta: "zcta.geojson.gz",
    },
    counts: { legalCityFeatures: 91, legalCities: 88, zctas: 304 },
    legalCityNameProperty: "CITY_NAME",
  };
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error("Display-boundary manifest does not match the reviewed LA County sources.");
  }
}

function assertHttpUrl(value, label) {
  try {
    const url = new URL(value);
    if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error();
  } catch {
    throw new Error(`Invalid ${label}.`);
  }
}

function assertSha256(value, label) {
  if (!/^[a-f0-9]{64}$/.test(value ?? "")) throw new Error(`Invalid SHA-256 for ${label}.`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validSlug(value) {
  return typeof value === "string" && /^[a-z0-9-]+$/.test(value) && value.length <= 120;
}

function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
