import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RETRIEVED_ON = "2026-07-09";
const COUNTY_GEOID = "06037";
const DATASET_VERSION = "la-county-06037-2026-07-09-v1";
const TIGER_ZCTA = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/2";
const TIGER_COUNTY = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1";
const ZCTA_COUNTY_RELATIONSHIP = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt";
const CSA_LAYER = "https://public.gis.lacounty.gov/public/rest/services/LACounty_Dynamic/Political_Boundaries/MapServer/23";
const CSA_ITEM = "https://www.arcgis.com/sharing/rest/content/items/7b8a64cab4a44c0f86f12c909c5d7f1a";
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(workspaceRoot, "data", "geography", "los-angeles-county", DATASET_VERSION);

const relationshipText = await fetchText(ZCTA_COUNTY_RELATIONSHIP);
const zctaIds = parseRelationshipZctas(relationshipText, COUNTY_GEOID);
if (zctaIds.length !== 304) throw new Error(`Expected 304 LA County ZCTAs, received ${zctaIds.length}.`);

const [countyRaw, zctaRaw, csaRaw, csaItem] = await Promise.all([
  queryGeoJson(TIGER_COUNTY, {
    outFields: "GEOID,NAME,CENTLAT,CENTLON",
    where: `GEOID='${COUNTY_GEOID}'`,
  }),
  queryGeoJson(TIGER_ZCTA, {
    outFields: "ZCTA5,GEOID,NAME,CENTLAT,CENTLON",
    where: `ZCTA5 IN (${zctaIds.map((id) => `'${id}'`).join(",")})`,
  }),
  queryGeoJson(CSA_LAYER, {
    outFields: "OBJECTID,CITY_TYPE,LCITY,COMMUNITY,LABEL,SOURCE,Feat_Type,CSA_ID,NOTES",
    resultRecordCount: "1000",
    where: "Feat_Type='Land'",
  }),
  fetchJson(`${CSA_ITEM}?f=json`),
]);

const county = canonicalFeatureCollection(countyRaw, "GEOID");
const zctas = canonicalFeatureCollection(zctaRaw, "ZCTA5");
const communities = canonicalFeatureCollection(csaRaw, "OBJECTID");
if (county.features.length !== 1 || county.features[0].properties.GEOID !== COUNTY_GEOID) {
  throw new Error("Census county response did not contain exactly Los Angeles County GEOID 06037.");
}
if (zctas.features.length !== 304) throw new Error(`Expected 304 ZCTA geometries, received ${zctas.features.length}.`);
if (communities.features.length !== 355) {
  throw new Error(`Expected 355 LA County CSA land geometries, received ${communities.features.length}.`);
}

const csaModifiedAt = new Date(csaItem.modified).toISOString();
const csaSourceVersion = `CSA 2026-06; ArcGIS item modified ${csaModifiedAt}`;
const sources = [
  {
    id: "census-county-2025",
    license: "U.S. Census Bureau data are public domain",
    licenseUrl: "https://www.census.gov/about/policies/open-gov/open-data.html",
    name: "U.S. Census Bureau TIGERweb Counties",
    retrievalUrl: `${TIGER_COUNTY}/query`,
    retrievalDate: RETRIEVED_ON,
    sourceUrl: TIGER_COUNTY,
    sourceVersion: "January 1, 2025 vintage",
  },
  {
    id: "census-zcta-2020",
    license: "U.S. Census Bureau data are public domain",
    licenseUrl: "https://www.census.gov/about/policies/open-gov/open-data.html",
    name: "U.S. Census Bureau 2020 Census ZCTAs",
    retrievalUrl: `${TIGER_ZCTA}/query`,
    retrievalDate: RETRIEVED_ON,
    sourceUrl: TIGER_ZCTA,
    sourceVersion: "2020 Census; January 1, 2020 vintage",
  },
  {
    id: "census-zcta-county-relationship-2020",
    license: "U.S. Census Bureau data are public domain",
    licenseUrl: "https://www.census.gov/about/policies/open-gov/open-data.html",
    name: "2020 ZCTA-to-County Relationship File",
    retrievalUrl: ZCTA_COUNTY_RELATIONSHIP,
    retrievalDate: RETRIEVED_ON,
    sourceUrl: ZCTA_COUNTY_RELATIONSHIP,
    sourceVersion: "2020 Census",
  },
  {
    id: "la-county-csa-2026-06",
    license: "County of Los Angeles eGIS Terms of Use",
    licenseUrl: "https://egis-lacounty.hub.arcgis.com/pages/terms-of-use",
    name: "County of Los Angeles Cities and Communities (Statistical Areas)",
    retrievalUrl: `${CSA_LAYER}/query`,
    retrievalDate: RETRIEVED_ON,
    sourceUrl: CSA_ITEM,
    sourceVersion: csaSourceVersion,
  },
];

const sourceBundles = {
  "county.geojson.gz": county,
  "csa-land.geojson.gz": communities,
  "zcta.geojson.gz": zctas,
};
const bundleChecksums = {};
await mkdir(outputRoot, { recursive: true });
for (const [filename, value] of Object.entries(sourceBundles)) {
  const payload = Buffer.from(stableJson(value));
  const compressed = gzipSync(payload, { level: 9, mtime: 0 });
  await writeFile(path.join(outputRoot, filename), compressed);
  bundleChecksums[filename] = {
    compressedSha256: sha256(compressed),
    compressedSize: compressed.length,
    contentSha256: sha256(payload),
    contentSize: payload.length,
  };
}

const areaRecords = buildAreaRecords(zctas.features, communities.features, sources);
const manifest = {
  schemaVersion: 1,
  datasetVersion: DATASET_VERSION,
  retrievalDate: RETRIEVED_ON,
  market: {
    country: "US",
    jurisdictionGeoid: COUNTY_GEOID,
    jurisdictionType: "county",
    label: "Los Angeles County",
    slug: "los-angeles",
    stableExternalId: `urn:census:county:${COUNTY_GEOID}`,
    state: "CA",
  },
  activation: {
    activateMarket: false,
    activateSlugs: [],
    preserveExistingActivation: true,
  },
  counts: {
    areas: areaRecords.length,
    cities: areaRecords.filter((area) => area.type === "city").length,
    communities: areaRecords.filter((area) => area.type === "neighborhood").length,
    zctas: areaRecords.filter((area) => area.type === "zip").length,
  },
  bundles: bundleChecksums,
  relationshipPolicy: {
    reviewedAt: `${RETRIEVED_ON}T00:00:00.000Z`,
    version: "la-county-csa-lcity-review-v1",
    rules: [
      "Only city-to-community DISPLAY_PARENT and SEARCH_ROLLUP relationships from official CSA LCITY membership are reviewed.",
      "No inferred ZCTA-to-city or ZCTA-to-community relationship is included.",
      "Future spatial relationship proposals remain outside the reviewed dataset until separately approved.",
    ],
  },
  sources: sources.map((source) => ({
    ...source,
    evidenceSha256: source.id === "census-zcta-county-relationship-2020"
      ? sha256(Buffer.from(relationshipText))
      : source.id === "la-county-csa-2026-06"
        ? sha256(Buffer.from(stableJson(csaItem)))
        : null,
  })),
  areas: areaRecords,
};
const relationships = buildOfficialRelationships(areaRecords);
const manifestPayload = `${JSON.stringify(manifest, null, 2)}\n`;
const relationshipPayload = `${JSON.stringify(relationships, null, 2)}\n`;
await writeFile(path.join(outputRoot, "manifest.json"), manifestPayload);
await writeFile(path.join(outputRoot, "relationships.json"), relationshipPayload);
await writeFile(
  path.join(outputRoot, "CHECKSUMS.sha256"),
  checksumFile(manifestPayload, relationshipPayload, bundleChecksums),
);

console.log(JSON.stringify({ outputRoot, ...manifest.counts, bundles: bundleChecksums }, null, 2));

function buildAreaRecords(zctaFeatures, csaFeatures, sourceDefinitions) {
  const sourceById = new Map(sourceDefinitions.map((source) => [source.id, source]));
  const records = [];
  for (const feature of zctaFeatures) {
    const zcta = feature.properties.ZCTA5;
    records.push(areaRecord({
      geometryFeatureIds: [zcta],
      geometrySha256: sha256(Buffer.from(stableJson(feature.geometry))),
      label: zcta,
      postalCode: zcta,
      searchTerms: [zcta],
      slug: zcta,
      source: sourceById.get("census-zcta-2020"),
      stableExternalId: `urn:census:2020:zcta5:${zcta}`,
      type: "zip",
    }));
  }

  const cityFeatures = new Map();
  for (const feature of csaFeatures) {
    const properties = feature.properties;
    const city = clean(properties.LCITY);
    if (properties.CITY_TYPE === "City" && city) {
      cityFeatures.set(city, [...(cityFeatures.get(city) ?? []), feature]);
    }
  }
  for (const [city, features] of [...cityFeatures].sort(([left], [right]) => left.localeCompare(right))) {
    const slug = slugify(city);
    const featureIds = features.map((feature) => String(feature.properties.OBJECTID)).sort(numericTextSort);
    records.push(areaRecord({
      geometryFeatureIds: featureIds,
      geometrySha256: sha256(Buffer.from(stableJson(features.map((feature) => feature.geometry)))),
      label: city,
      searchTerms: [city, `${city} ca`, `city of ${city}`],
      slug,
      source: sourceById.get("la-county-csa-2026-06"),
      stableExternalId: `urn:lacounty:csa:city:${slug}`,
      type: "city",
    }));
  }

  const communities = csaFeatures
    .filter((feature) => clean(feature.properties.COMMUNITY))
    .sort((left, right) => Number(left.properties.CSA_ID) - Number(right.properties.CSA_ID));
  const baseSlugCounts = new Map();
  for (const feature of communities) {
    const base = slugify(clean(feature.properties.COMMUNITY));
    baseSlugCounts.set(base, (baseSlugCounts.get(base) ?? 0) + 1);
  }
  const occupiedSlugs = new Set(records.map((area) => area.slug));
  for (const feature of communities) {
    const properties = feature.properties;
    const community = clean(properties.COMMUNITY);
    const city = clean(properties.LCITY);
    const baseSlug = slugify(community);
    let slug = baseSlug;
    if (occupiedSlugs.has(slug) || baseSlugCounts.get(baseSlug) > 1) {
      slug = `${baseSlug}-${slugify(city || "unincorporated")}`;
    }
    if (occupiedSlugs.has(slug)) slug = `${slug}-csa-${properties.CSA_ID}`;
    occupiedSlugs.add(slug);
    const terms = [community, properties.LABEL, city ? `${community} ${city}` : null, `${community} ca`].filter(Boolean);
    const incorporated = properties.CITY_TYPE === "City";
    records.push(areaRecord({
      city: properties.CITY_TYPE === "City" ? city : null,
      geometryFeatureIds: [String(properties.OBJECTID)],
      geometrySha256: sha256(Buffer.from(stableJson(feature.geometry))),
      label: incorporated ? community : `${community} (Unincorporated)`,
      parentStableExternalId: incorporated && city
        ? `urn:lacounty:csa:city:${slugify(city)}`
        : null,
      searchTerms: terms,
      slug,
      source: sourceById.get("la-county-csa-2026-06"),
      stableExternalId: `urn:lacounty:csa:${properties.CSA_ID}`,
      type: "neighborhood",
    }));
  }

  assertUnique(records, "slug");
  assertUnique(records, "stableExternalId");
  if (records.filter((area) => area.type === "city").length !== 88) throw new Error("Expected 88 incorporated cities.");
  if (records.filter((area) => area.type === "neighborhood").length !== 269) throw new Error("Expected 269 communities.");
  return records.sort((left, right) => left.type.localeCompare(right.type) || left.slug.localeCompare(right.slug));
}

function areaRecord({ city = null, geometryFeatureIds, geometrySha256, label, parentStableExternalId = null, postalCode = null, searchTerms, slug, source, stableExternalId, type }) {
  const normalizedTerms = [...new Set(searchTerms.map(normalizeSearchTerm).filter(Boolean))].sort();
  if (normalizedTerms.length === 0) throw new Error(`Area ${slug} has no reviewed search terms.`);
  return {
    active: false,
    city,
    county: "Los Angeles County",
    geometry: {
      bundle: type === "zip" ? "zcta.geojson.gz" : "csa-land.geojson.gz",
      featureIds: geometryFeatureIds,
      sha256: geometrySha256,
    },
    label,
    parentStableExternalId,
    postalCode,
    searchTerms: normalizedTerms,
    slug,
    source: {
      id: source.id,
      license: source.license,
      licenseUrl: source.licenseUrl,
      retrievalUrl: source.retrievalUrl,
      retrievalDate: source.retrievalDate,
      sourceUrl: source.sourceUrl,
      sourceVersion: source.sourceVersion,
    },
    stableExternalId,
    state: "CA",
    type,
  };
}

function buildOfficialRelationships(areas) {
  const rows = areas
    .filter((area) => area.type === "neighborhood" && area.parentStableExternalId)
    .flatMap((area) => ["DISPLAY_PARENT", "SEARCH_ROLLUP"].map((relationType) => ({
        childStableExternalId: area.stableExternalId,
        parentStableExternalId: area.parentStableExternalId,
        relationType,
        reviewEvidence: { method: "Official CSA LCITY membership" },
        reviewedAt: `${RETRIEVED_ON}T00:00:00.000Z`,
        source: "la-county-csa-lcity-review-v1",
      })))
    .sort((left, right) => left.parentStableExternalId.localeCompare(right.parentStableExternalId)
      || left.childStableExternalId.localeCompare(right.childStableExternalId)
      || left.relationType.localeCompare(right.relationType));
  const displayParents = rows.filter((row) => row.relationType === "DISPLAY_PARENT").length;
  const searchRollups = rows.filter((row) => row.relationType === "SEARCH_ROLLUP").length;
  if (displayParents !== 149 || searchRollups !== 149) {
    throw new Error(`Expected 149 official display parents and rollups, received ${displayParents} and ${searchRollups}.`);
  }
  return {
    schemaVersion: 1,
    datasetVersion: DATASET_VERSION,
    reviewedAt: `${RETRIEVED_ON}T00:00:00.000Z`,
    reviewVersion: "la-county-csa-lcity-review-v1",
    reviewMethod: {
      cityCommunity: "Official CSA LCITY membership from the County source",
      zctaDisplayParent: "not included; spatial inference requires separate human review",
      zctaSearchRollup: "not included",
    },
    counts: {
      relationships: rows.length,
      displayParents,
      searchRollups,
      zctaAssignments: 0,
    },
    relationships: rows,
  };
}

async function queryGeoJson(layerUrl, parameters) {
  const body = new URLSearchParams({
    f: "geojson",
    outSR: "4326",
    returnGeometry: "true",
    ...parameters,
  });
  const response = await fetch(`${layerUrl}/query`, {
    body,
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    method: "POST",
  });
  if (!response.ok) throw new Error(`Source query failed (${response.status}): ${layerUrl}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`Source query failed: ${JSON.stringify(payload.error)}`);
  return payload;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Source metadata failed (${response.status}): ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Source download failed (${response.status}): ${url}`);
  return response.text();
}

function parseRelationshipZctas(value, countyGeoid) {
  const lines = value.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = lines.shift().split("|");
  const zctaIndex = headers.indexOf("GEOID_ZCTA5_20");
  const countyIndex = headers.indexOf("GEOID_COUNTY_20");
  const ids = lines
    .map((line) => line.split("|"))
    .filter((columns) => columns[countyIndex] === countyGeoid && /^\d{5}$/.test(columns[zctaIndex]))
    .map((columns) => columns[zctaIndex]);
  return [...new Set(ids)].sort();
}

function canonicalFeatureCollection(value, idProperty) {
  if (value?.type !== "FeatureCollection" || !Array.isArray(value.features)) throw new Error("Expected a GeoJSON FeatureCollection.");
  return {
    type: "FeatureCollection",
    features: value.features
      .map((feature) => ({
        type: "Feature",
        properties: Object.fromEntries(Object.entries(feature.properties ?? {}).sort(([left], [right]) => left.localeCompare(right))),
        geometry: normalizeGeometry(feature.geometry),
      }))
      .sort((left, right) => numericTextSort(String(left.properties[idProperty]), String(right.properties[idProperty]))),
  };
}

function normalizeGeometry(geometry) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) throw new Error(`Unsupported geometry type: ${geometry?.type}`);
  return { type: geometry.type, coordinates: normalizeCoordinates(geometry.coordinates) };
}

function normalizeCoordinates(value) {
  if (!Array.isArray(value)) throw new Error("Invalid GeoJSON coordinates.");
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    return [roundCoordinate(value[0]), roundCoordinate(value[1])];
  }
  return value.map(normalizeCoordinates);
}

function normalizeSearchTerm(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slugify(value) {
  const slug = normalizeSearchTerm(value).replaceAll(" ", "-");
  if (!slug) throw new Error(`Cannot create slug from ${value}.`);
  return slug;
}

function clean(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function assertUnique(records, field) {
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record[field])) throw new Error(`Duplicate ${field}: ${record[field]}`);
    seen.add(record[field]);
  }
}

function stableJson(value) {
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function checksumFile(manifestPayload, relationshipPayload, bundles) {
  const lines = Object.entries(bundles).map(([filename, evidence]) => `${evidence.compressedSha256}  ${filename}`);
  lines.push(`${sha256(Buffer.from(manifestPayload))}  manifest.json`);
  lines.push(`${sha256(Buffer.from(relationshipPayload))}  relationships.json`);
  return `${lines.join("\n")}\n`;
}

function roundCoordinate(value) {
  return Number(Number(value).toFixed(6));
}

function numericTextSort(left, right) {
  return Number(left) - Number(right) || left.localeCompare(right);
}
