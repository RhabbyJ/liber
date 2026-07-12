import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RETRIEVED_ON = "2026-07-12";
const COUNTY_GEOID = "06037";
const DATASET_VERSION = "la-county-06037-2026-07-12-v2";
const TIGER_ZCTA = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/2";
const TIGER_COUNTY = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1";
const ZCTA_COUNTY_RELATIONSHIP = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt";
const CSA_LAYER = "https://public.gis.lacounty.gov/public/rest/services/LACounty_Dynamic/Political_Boundaries/MapServer/23";
const CSA_ITEM = "https://www.arcgis.com/sharing/rest/content/items/7b8a64cab4a44c0f86f12c909c5d7f1a";
const LEGAL_CITY_LAYER = "https://public.gis.lacounty.gov/public/rest/services/LACounty_Dynamic/Political_Boundaries/MapServer/19";
const EXPECTED_BUNDLE_HASHES = {
  "county.geojson.gz": {
    compressed: "b0eae3a45fde00d8ebcdafa4af15e76b3c748b80ef3ad487939f5102ca5d2b3c",
    content: "8fefcb706ef82a1632ecd3ed41adb87460ea937958075d52d425df3fb4c9231c",
  },
  "csa-land.geojson.gz": {
    compressed: "be924fb99c115951c5c55e9649a7347c2d276d9fc1e93343387382c6492ed09c",
    content: "e9facb96930ad1794c0b18557bceefeb11d571a98edb00ada2b58e89a6b09263",
  },
  "legal-city.geojson.gz": {
    compressed: "602717ff8afa0b584f3b2a8f61e8abce80b58d2705b723096d1d18cbc739090f",
    content: "773eaabb22f834d9f00cb74847174630872a7c7b7e90ca3a9dc059332e1d81a9",
  },
  "zcta.geojson.gz": {
    compressed: "9568435e664107743b6bdba00c70b7ed9bcf9c668d38493dc26ecf128bd23fe5",
    content: "47693d0df8a7f9de44dadfd5cd22b8c84206a123e07a707e39df2831ca04e7de",
  },
};
const EXPECTED_MANIFEST_SHA256 = "2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47";
const EXPECTED_RELATIONSHIPS_SHA256 = "5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8";
const EXPECTED_RELATIONSHIP_EVIDENCE_SHA256 = "e3132ea72c952e2ad6eebbb54553da1b4e91306c980e2b1b8af37cda1a886105";
const EXPECTED_CSA_ITEM_IDENTITY_SHA256 = "7302e314c3cab0ddc467d1735884879c6208bfd1c8e469a6ec04587cde98d717";
const ARCHIVED_CSA_ITEM_EVIDENCE_SHA256 = "da8febfeb73276d6fbd08fe3891457ed709fb1fd1379b833c719d94efb8332ae";
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(workspaceRoot, "data", "geography", "los-angeles-county", DATASET_VERSION);

const relationshipText = await fetchText(ZCTA_COUNTY_RELATIONSHIP);
const zctaIds = parseRelationshipZctas(relationshipText, COUNTY_GEOID);
if (zctaIds.length !== 304) throw new Error(`Expected 304 LA County ZCTAs, received ${zctaIds.length}.`);

const [countyRaw, zctaRaw, csaRaw, csaItem, legalCityRaw] = await Promise.all([
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
  queryGeoJson(LEGAL_CITY_LAYER, {
    outFields: "OBJECTID,CITY_NAME,CITY_TYPE,FEAT_TYPE,last_edited_date",
    resultRecordCount: "1000",
    where: "CITY_TYPE='City' AND FEAT_TYPE='Land'",
  }),
]);

const county = canonicalFeatureCollection(countyRaw, "GEOID");
const zctas = canonicalFeatureCollection(zctaRaw, "ZCTA5");
const communities = canonicalFeatureCollection(csaRaw, "OBJECTID");
const legalCities = canonicalFeatureCollection(legalCityRaw, "OBJECTID");
const csaItemEvidence = {
  access: csaItem.access,
  id: csaItem.id,
  modified: csaItem.modified,
  title: csaItem.title,
  type: csaItem.type,
  url: csaItem.url,
};
if (sha256(Buffer.from(relationshipText)) !== EXPECTED_RELATIONSHIP_EVIDENCE_SHA256
  || sha256(Buffer.from(stableJson(csaItemEvidence))) !== EXPECTED_CSA_ITEM_IDENTITY_SHA256) {
  throw new Error(`Source metadata differs from the immutable ${DATASET_VERSION} evidence; create a new dataset version.`);
}
if (county.features.length !== 1 || county.features[0].properties.GEOID !== COUNTY_GEOID) {
  throw new Error("Census county response did not contain exactly Los Angeles County GEOID 06037.");
}
if (zctas.features.length !== 304) throw new Error(`Expected 304 ZCTA geometries, received ${zctas.features.length}.`);
if (communities.features.length !== 355) {
  throw new Error(`Expected 355 LA County CSA land geometries, received ${communities.features.length}.`);
}
if (legalCities.features.length !== 91) {
  throw new Error(`Expected 91 LA County legal-city land geometries, received ${legalCities.features.length}.`);
}
const legalCityNames = new Set(legalCities.features.map((feature) => clean(feature.properties.CITY_NAME)).filter(Boolean));
if (legalCityNames.size !== 88 || legalCities.features.some((feature) => !clean(feature.properties.CITY_NAME))) {
  throw new Error(`Expected 88 distinct nonempty legal-city names, received ${legalCityNames.size}.`);
}
if (legalCities.features.some((feature) => !Number.isFinite(Number(feature.properties.last_edited_date)))) {
  throw new Error("Every legal-city source feature requires a last_edited_date value.");
}

const csaModifiedAt = new Date(csaItem.modified).toISOString();
const csaSourceVersion = `CSA 2026-06; ArcGIS item modified ${csaModifiedAt}`;
const legalCityEditedAt = new Date(Math.max(...legalCities.features.map((feature) => Number(feature.properties.last_edited_date)))).toISOString();
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
  {
    id: "la-county-legal-city-2026-06",
    license: "County of Los Angeles eGIS Terms of Use",
    licenseUrl: "https://egis-lacounty.hub.arcgis.com/pages/terms-of-use",
    name: "County of Los Angeles City and Unincorporated Boundaries (Legal)",
    retrievalUrl: `${LEGAL_CITY_LAYER}/query`,
    retrievalDate: RETRIEVED_ON,
    sourceUrl: LEGAL_CITY_LAYER,
    sourceVersion: `Legal city land boundaries; latest source edit ${legalCityEditedAt}`,
  },
];

const sourceBundles = {
  "county.geojson.gz": county,
  "csa-land.geojson.gz": communities,
  "legal-city.geojson.gz": legalCities,
  "zcta.geojson.gz": zctas,
};
const bundleChecksums = {};
const preparedBundles = {};
for (const [filename, value] of Object.entries(sourceBundles)) {
  const payload = Buffer.from(stableJson(value));
  const compressed = gzipSync(payload, { level: 9, mtime: 0 });
  bundleChecksums[filename] = {
    compressedSha256: sha256(compressed),
    compressedSize: compressed.length,
    contentSha256: sha256(payload),
    contentSize: payload.length,
  };
  const expected = EXPECTED_BUNDLE_HASHES[filename];
  if (bundleChecksums[filename].compressedSha256 !== expected?.compressed
    || bundleChecksums[filename].contentSha256 !== expected?.content) {
    throw new Error(`${filename} differs from the immutable ${DATASET_VERSION} source evidence; create a new dataset version.`);
  }
  preparedBundles[filename] = compressed;
}
await mkdir(outputRoot, { recursive: true });
for (const [filename, compressed] of Object.entries(preparedBundles)) {
  await writeFile(path.join(outputRoot, filename), compressed);
}

const areaRecords = buildAreaRecords(zctas.features, communities.features, sources);
const manifest = {
  schemaVersion: 2,
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
  displayBoundaries: {
    bundles: {
      county: "county.geojson.gz",
      legalCity: "legal-city.geojson.gz",
      zcta: "zcta.geojson.gz",
    },
    counts: {
      legalCityFeatures: legalCities.features.length,
      legalCities: legalCityNames.size,
      zctas: zctas.features.length,
    },
    legalCityNameProperty: "CITY_NAME",
  },
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
        ? ARCHIVED_CSA_ITEM_EVIDENCE_SHA256
        : source.id === "la-county-legal-city-2026-06"
          ? bundleChecksums["legal-city.geojson.gz"].contentSha256
        : null,
  })),
  areas: areaRecords,
};
const relationships = buildOfficialRelationships(areaRecords);
const manifestPayload = `${JSON.stringify(manifest, null, 2)}\n`;
const relationshipPayload = `${JSON.stringify(relationships, null, 2)}\n`;
if (sha256(Buffer.from(manifestPayload)) !== EXPECTED_MANIFEST_SHA256
  || sha256(Buffer.from(relationshipPayload)) !== EXPECTED_RELATIONSHIPS_SHA256) {
  throw new Error(`Generated release ledger differs from immutable ${DATASET_VERSION}; create a new dataset version.`);
}
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
