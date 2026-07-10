-- UNNUMBERED CTO INTEGRATION PROPOSAL. Do not apply as migration history verbatim.
-- This proposal stages immutable LA County evidence only. It does not activate an
-- area, change the active market bounds/current boundary, replace live search
-- terms or relationships, or repoint an active area's current geometry.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  pgcrypto_schema text;
  postgis_schema text;
BEGIN
  SELECT namespace.nspname INTO postgis_schema
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'postgis';
  IF postgis_schema IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'Liber geography requires the existing PostGIS extension in public; found %.', postgis_schema;
  END IF;

  SELECT namespace.nspname INTO pgcrypto_schema
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pgcrypto';
  IF pgcrypto_schema IS DISTINCT FROM 'extensions' THEN
    RAISE EXCEPTION 'Liber geography requires pgcrypto in extensions; found %.', pgcrypto_schema;
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS geography_admin;
REVOKE ALL ON SCHEMA geography_admin FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS jurisdiction_type text,
  ADD COLUMN IF NOT EXISTS jurisdiction_geoid text,
  ADD COLUMN IF NOT EXISTS stable_external_id text,
  ADD COLUMN IF NOT EXISTS current_boundary_id uuid;

ALTER TABLE public.service_areas
  ADD COLUMN IF NOT EXISTS stable_external_id text,
  ADD COLUMN IF NOT EXISTS source_retrieved_at date,
  ADD COLUMN IF NOT EXISTS source_retrieval_url text,
  ADD COLUMN IF NOT EXISTS current_geometry_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS markets_country_jurisdiction_type_jurisdiction_geoid_key
ON public.markets(country, jurisdiction_type, jurisdiction_geoid);
CREATE UNIQUE INDEX IF NOT EXISTS markets_stable_external_id_key
ON public.markets(stable_external_id);
CREATE UNIQUE INDEX IF NOT EXISTS markets_current_boundary_id_key
ON public.markets(current_boundary_id);
CREATE UNIQUE INDEX IF NOT EXISTS service_areas_market_id_stable_external_id_key
ON public.service_areas(market_id, stable_external_id);
CREATE UNIQUE INDEX IF NOT EXISTS service_areas_current_geometry_id_key
ON public.service_areas(current_geometry_id);
CREATE UNIQUE INDEX IF NOT EXISTS service_areas_id_market_id_key
ON public.service_areas(id, market_id);

CREATE TABLE IF NOT EXISTS public.market_boundary_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  dataset_version text NOT NULL,
  geojson jsonb NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  source text NOT NULL,
  source_version text NOT NULL,
  source_license text NOT NULL,
  source_url text NOT NULL,
  source_retrieval_url text NOT NULL,
  source_retrieved_at date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, dataset_version)
);
CREATE INDEX IF NOT EXISTS market_boundary_versions_market_sha_idx
ON public.market_boundary_versions(market_id, sha256);

CREATE TABLE IF NOT EXISTS public.service_area_geometry_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_area_id uuid NOT NULL REFERENCES public.service_areas(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  dataset_version text NOT NULL,
  geojson jsonb NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  source text NOT NULL,
  source_version text NOT NULL,
  source_license text NOT NULL,
  source_url text NOT NULL,
  source_retrieval_url text NOT NULL,
  source_retrieved_at date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_area_id, dataset_version)
);
CREATE INDEX IF NOT EXISTS service_area_geometry_versions_area_sha_idx
ON public.service_area_geometry_versions(service_area_id, sha256);
CREATE INDEX IF NOT EXISTS service_area_geometry_versions_area_created_idx
ON public.service_area_geometry_versions(service_area_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.service_area_search_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  service_area_id uuid NOT NULL,
  term_normalized text COLLATE "C" NOT NULL,
  term_kind text NOT NULL,
  source text NOT NULL,
  reviewed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (term_normalized <> '' AND term_normalized = btrim(term_normalized)),
  UNIQUE (market_id, term_normalized, service_area_id),
  CONSTRAINT service_area_search_terms_service_area_id_market_id_fkey
    FOREIGN KEY (service_area_id, market_id)
    REFERENCES public.service_areas(id, market_id)
    ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE INDEX IF NOT EXISTS service_area_search_terms_market_term_prefix_idx
ON public.service_area_search_terms(market_id, term_normalized text_pattern_ops)
INCLUDE (service_area_id, term_kind, reviewed_at);
CREATE INDEX IF NOT EXISTS service_area_search_terms_area_idx
ON public.service_area_search_terms(service_area_id);

CREATE TABLE IF NOT EXISTS public.geography_dataset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  market_boundary_version_id uuid NOT NULL REFERENCES public.market_boundary_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  relationships_sha256 text NOT NULL CHECK (relationships_sha256 ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL,
  relationships jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS geography_dataset_versions_market_staged_idx
ON public.geography_dataset_versions(market_id, staged_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'markets_current_boundary_id_fkey'
      AND conrelid = 'public.markets'::regclass
  ) THEN
    ALTER TABLE public.markets
      ADD CONSTRAINT markets_current_boundary_id_fkey
      FOREIGN KEY (current_boundary_id) REFERENCES public.market_boundary_versions(id)
      ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_areas_current_geometry_id_fkey'
      AND conrelid = 'public.service_areas'::regclass
  ) THEN
    ALTER TABLE public.service_areas
      ADD CONSTRAINT service_areas_current_geometry_id_fkey
      FOREIGN KEY (current_geometry_id) REFERENCES public.service_area_geometry_versions(id)
      ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
END;
$$;

ALTER TABLE public.market_boundary_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_area_geometry_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_area_search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geography_dataset_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_boundary_versions, public.service_area_geometry_versions,
  public.service_area_search_terms, public.geography_dataset_versions
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.reject_immutable_geography_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Canonical geography versions are immutable; insert a new version instead.'
    USING ERRCODE = '23514';
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.reject_immutable_geography_version()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS market_boundary_versions_immutable ON public.market_boundary_versions;
CREATE TRIGGER market_boundary_versions_immutable
BEFORE UPDATE OR DELETE ON public.market_boundary_versions
FOR EACH ROW EXECUTE FUNCTION geography_admin.reject_immutable_geography_version();
DROP TRIGGER IF EXISTS service_area_geometry_versions_immutable ON public.service_area_geometry_versions;
CREATE TRIGGER service_area_geometry_versions_immutable
BEFORE UPDATE OR DELETE ON public.service_area_geometry_versions
FOR EACH ROW EXECUTE FUNCTION geography_admin.reject_immutable_geography_version();
DROP TRIGGER IF EXISTS geography_dataset_versions_immutable ON public.geography_dataset_versions;
CREATE TRIGGER geography_dataset_versions_immutable
BEFORE UPDATE OR DELETE ON public.geography_dataset_versions
FOR EACH ROW EXECUTE FUNCTION geography_admin.reject_immutable_geography_version();

CREATE OR REPLACE FUNCTION geography_admin.enforce_current_geometry_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'markets' AND NEW.current_boundary_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.market_boundary_versions version
    WHERE version.id = NEW.current_boundary_id AND version.market_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Current market boundary must belong to the same market.' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'service_areas' AND NEW.current_geometry_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_area_geometry_versions version
    WHERE version.id = NEW.current_geometry_id AND version.service_area_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Current service-area geometry must belong to the same service area.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.enforce_current_geometry_ownership()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS markets_current_boundary_ownership ON public.markets;
CREATE CONSTRAINT TRIGGER markets_current_boundary_ownership
AFTER INSERT OR UPDATE OF current_boundary_id ON public.markets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_current_geometry_ownership();
DROP TRIGGER IF EXISTS service_areas_current_geometry_ownership ON public.service_areas;
CREATE CONSTRAINT TRIGGER service_areas_current_geometry_ownership
AFTER INSERT OR UPDATE OF current_geometry_id ON public.service_areas
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_current_geometry_ownership();

CREATE OR REPLACE FUNCTION geography_admin.enforce_active_area_market_bounds()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  market_row public.markets%ROWTYPE;
BEGIN
  IF NEW.active IS NOT TRUE THEN RETURN NEW; END IF;
  SELECT * INTO market_row FROM public.markets WHERE id = NEW.market_id FOR SHARE;
  IF NOT FOUND OR NEW.bbox_west < market_row.bbox_west OR NEW.bbox_south < market_row.bbox_south
    OR NEW.bbox_east > market_row.bbox_east OR NEW.bbox_north > market_row.bbox_north THEN
    RAISE EXCEPTION 'Active service area must remain inside its market bounds.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.enforce_active_area_market_bounds()
FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS service_areas_active_market_bounds ON public.service_areas;
CREATE TRIGGER service_areas_active_market_bounds
BEFORE INSERT OR UPDATE OF active, market_id, bbox_west, bbox_south, bbox_east, bbox_north
ON public.service_areas
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_active_area_market_bounds();

CREATE OR REPLACE FUNCTION geography_admin.enforce_market_contains_active_areas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.service_areas area
    WHERE area.market_id = NEW.id AND area.active = true
      AND (area.bbox_west < NEW.bbox_west OR area.bbox_south < NEW.bbox_south
        OR area.bbox_east > NEW.bbox_east OR area.bbox_north > NEW.bbox_north)
  ) THEN
    RAISE EXCEPTION 'Market bounds must contain every active service area.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.enforce_market_contains_active_areas()
FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS markets_contain_active_service_areas ON public.markets;
CREATE TRIGGER markets_contain_active_service_areas
BEFORE UPDATE OF bbox_west, bbox_south, bbox_east, bbox_north ON public.markets
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_market_contains_active_areas();

-- Bounded, deterministic lookup. It returns each area at most once and verifies
-- both sides of the search-term relation belong to the selected market.
CREATE OR REPLACE FUNCTION geography_admin.search_active_service_areas(
  requested_market_slug text,
  requested_term text,
  requested_limit integer DEFAULT 8
)
RETURNS TABLE(service_area_id uuid, exact_match boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH input AS (
    SELECT lower(btrim(regexp_replace(coalesce(requested_term, ''), '[^a-zA-Z0-9]+', ' ', 'g'))) COLLATE "C" AS term,
           least(greatest(coalesce(requested_limit, 8), 1), 8) AS row_limit
  ), selected_market AS (
    SELECT market.id
    FROM public.markets market
    WHERE market.slug = requested_market_slug AND market.active = true
  ), matches AS (
    SELECT search_term.service_area_id,
           bool_or(search_term.term_normalized = input.term) AS exact_match,
           min(search_term.term_normalized) AS matched_term
    FROM input
    JOIN selected_market ON true
    JOIN public.service_area_search_terms search_term
      ON search_term.market_id = selected_market.id
     AND search_term.term_normalized LIKE input.term || '%'
    JOIN public.service_areas area
      ON area.id = search_term.service_area_id
     AND area.market_id = selected_market.id
     AND area.active = true
    WHERE input.term <> ''
    GROUP BY search_term.service_area_id
  )
  SELECT matches.service_area_id, matches.exact_match
  FROM matches, input
  ORDER BY matches.exact_match DESC, matches.matched_term, matches.service_area_id
  LIMIT (SELECT row_limit FROM input);
$$;
REVOKE ALL ON FUNCTION geography_admin.search_active_service_areas(text, text, integer)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.stage_service_area_dataset(
  manifest jsonb,
  relationships jsonb,
  manifest_sha256 text,
  relationships_sha256 text,
  county_bundle jsonb,
  csa_bundle jsonb,
  zcta_bundle jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  area_record jsonb;
  area_geometry public.geometry(MultiPolygon, 4326);
  area_geojson jsonb;
  area_sha256 text;
  boundary_geojson jsonb;
  boundary_id uuid;
  boundary_sha256 text;
  center_point public.geometry(Point, 4326);
  county_geometry public.geometry(MultiPolygon, 4326);
  dataset_id uuid;
  dataset_version_value text := manifest->>'datasetVersion';
  existing_active_count integer := 0;
  market_id_value uuid;
  market_source jsonb;
  source_record jsonb;
  stable_match_id uuid;
  slug_match_id uuid;
  slug_match_stable_external_id text;
  target_area_active boolean;
  target_area_id uuid;
  version_id uuid;
  version_sha256 text;
  version_source_sha256 text;
BEGIN
  IF manifest_sha256 !~ '^[a-f0-9]{64}$' OR relationships_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Dataset ledger checksums are invalid.' USING ERRCODE = '23514';
  END IF;
  IF manifest#>>'{market,slug}' <> 'los-angeles'
    OR manifest#>>'{market,jurisdictionType}' <> 'county'
    OR manifest#>>'{market,jurisdictionGeoid}' <> '06037'
    OR manifest#>>'{market,stableExternalId}' <> 'urn:census:county:06037'
    OR manifest#>>'{market,state}' <> 'CA'
    OR manifest#>>'{market,country}' <> 'US'
    OR coalesce((manifest#>>'{activation,activateMarket}')::boolean, true)
    OR jsonb_array_length(coalesce(manifest#>'{activation,activateSlugs}', '[]'::jsonb)) <> 0 THEN
    RAISE EXCEPTION 'Only the inactive Los Angeles County GEOID 06037 dataset may be staged.' USING ERRCODE = '23514';
  END IF;
  IF relationships->>'datasetVersion' IS DISTINCT FROM dataset_version_value
    OR jsonb_array_length(coalesce(relationships->'relationships', '[]'::jsonb)) <> 298
    OR (
      SELECT count(*) FROM jsonb_array_elements(coalesce(relationships->'relationships', '[]'::jsonb)) relationship
      WHERE relationship->>'relationType' = 'DISPLAY_PARENT'
    ) <> 149
    OR (
      SELECT count(*) FROM jsonb_array_elements(coalesce(relationships->'relationships', '[]'::jsonb)) relationship
      WHERE relationship->>'relationType' = 'SEARCH_ROLLUP'
    ) <> 149
    OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(relationships->'relationships') relationship
    WHERE relationship->>'relationType' NOT IN ('DISPLAY_PARENT', 'SEARCH_ROLLUP')
      OR relationship->>'reviewedAt' IS NULL
      OR relationship->>'source' <> 'la-county-csa-lcity-review-v1'
  ) THEN
    RAISE EXCEPTION 'Only reviewed official CSA display-parent and search-rollup relationships may be staged.' USING ERRCODE = '23514';
  END IF;

  SELECT market.id INTO market_id_value
  FROM public.markets market
  WHERE market.slug = manifest#>>'{market,slug}'
    AND market.state = 'CA' AND market.country = 'US'
  FOR UPDATE;
  IF market_id_value IS NULL THEN
    RAISE EXCEPTION 'Canonical Los Angeles market must exist before staging.' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('service-area-import:' || market_id_value::text, 0));

  CREATE TEMP TABLE geo_source_features (
    bundle text NOT NULL,
    feature_id text NOT NULL,
    geom public.geometry(Geometry, 4326) NOT NULL,
    PRIMARY KEY (bundle, feature_id)
  ) ON COMMIT DROP;
  CREATE TEMP TABLE imported_area_ids (
    stable_external_id text PRIMARY KEY,
    service_area_id uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO geo_source_features(bundle, feature_id, geom)
  SELECT 'county.geojson.gz', feature->'properties'->>'GEOID',
         public.ST_SetSRID(public.ST_MakeValid(public.ST_GeomFromGeoJSON((feature->'geometry')::text)), 4326)
  FROM jsonb_array_elements(county_bundle->'features') feature;
  INSERT INTO geo_source_features(bundle, feature_id, geom)
  SELECT 'csa-land.geojson.gz', feature->'properties'->>'OBJECTID',
         public.ST_SetSRID(public.ST_MakeValid(public.ST_GeomFromGeoJSON((feature->'geometry')::text)), 4326)
  FROM jsonb_array_elements(csa_bundle->'features') feature;
  INSERT INTO geo_source_features(bundle, feature_id, geom)
  SELECT 'zcta.geojson.gz', feature->'properties'->>'ZCTA5',
         public.ST_SetSRID(public.ST_MakeValid(public.ST_GeomFromGeoJSON((feature->'geometry')::text)), 4326)
  FROM jsonb_array_elements(zcta_bundle->'features') feature;

  SELECT public.ST_Multi(public.ST_CollectionExtract(geom, 3)) INTO county_geometry
  FROM geo_source_features WHERE bundle = 'county.geojson.gz' AND feature_id = '06037';
  IF county_geometry IS NULL OR public.ST_IsEmpty(county_geometry) THEN
    RAISE EXCEPTION 'County boundary GEOID 06037 is missing or empty.' USING ERRCODE = '23514';
  END IF;
  boundary_geojson := public.ST_AsGeoJSON(county_geometry, 6, 0)::jsonb;
  boundary_sha256 := encode(extensions.digest(convert_to(boundary_geojson::text, 'utf8'), 'sha256'), 'hex');
  SELECT source INTO market_source
  FROM jsonb_array_elements(manifest->'sources') source
  WHERE source->>'id' = 'census-county-2025';
  IF market_source IS NULL THEN
    RAISE EXCEPTION 'County source provenance is missing.' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.market_boundary_versions (
    market_id, dataset_version, geojson, sha256, source, source_version,
    source_license, source_url, source_retrieval_url, source_retrieved_at
  ) VALUES (
    market_id_value, dataset_version_value, boundary_geojson, boundary_sha256, market_source->>'id',
    market_source->>'sourceVersion', market_source->>'license', market_source->>'sourceUrl',
    market_source->>'retrievalUrl', (market_source->>'retrievalDate')::date
  ) ON CONFLICT (market_id, dataset_version) DO NOTHING;
  SELECT version.id, version.sha256 INTO boundary_id, version_sha256
  FROM public.market_boundary_versions version
  WHERE version.market_id = market_id_value AND version.dataset_version = dataset_version_value;
  IF boundary_id IS NULL OR version_sha256 <> boundary_sha256 THEN
    RAISE EXCEPTION 'Dataset version conflicts with an existing market boundary version.' USING ERRCODE = '23514';
  END IF;

  FOR area_record IN SELECT value FROM jsonb_array_elements(manifest->'areas') LOOP
    IF coalesce((area_record->>'active')::boolean, true) THEN
      RAISE EXCEPTION 'Imported area % is not inactive.', area_record->>'slug' USING ERRCODE = '23514';
    END IF;
    SELECT public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(public.ST_Intersection(
      public.ST_UnaryUnion(public.ST_Collect(source.geom ORDER BY source.feature_id COLLATE "C")), county_geometry
    )), 3)) INTO area_geometry
    FROM geo_source_features source
    WHERE source.bundle = area_record#>>'{geometry,bundle}'
      AND source.feature_id IN (SELECT jsonb_array_elements_text(area_record#>'{geometry,featureIds}'));
    IF area_geometry IS NULL OR public.ST_IsEmpty(area_geometry) THEN
      RAISE EXCEPTION 'Imported area % has empty county-clipped geometry.', area_record->>'slug' USING ERRCODE = '23514';
    END IF;
    area_geojson := public.ST_AsGeoJSON(area_geometry, 6, 0)::jsonb;
    area_sha256 := encode(extensions.digest(convert_to(area_geojson::text, 'utf8'), 'sha256'), 'hex');
    center_point := public.ST_PointOnSurface(area_geometry);
    source_record := area_record->'source';

    stable_match_id := NULL;
    slug_match_id := NULL;
    slug_match_stable_external_id := NULL;
    SELECT area.id INTO stable_match_id
    FROM public.service_areas area
    WHERE area.market_id = market_id_value
      AND area.stable_external_id = area_record->>'stableExternalId'
    FOR UPDATE;
    SELECT area.id, area.stable_external_id INTO slug_match_id, slug_match_stable_external_id
    FROM public.service_areas area
    WHERE area.market_id = market_id_value AND area.slug = area_record->>'slug'
    FOR UPDATE;
    IF stable_match_id IS NOT NULL AND slug_match_id IS NOT NULL AND stable_match_id <> slug_match_id THEN
      RAISE EXCEPTION 'Stable ID and market slug resolve to different service areas for %.', area_record->>'slug' USING ERRCODE = '23514';
    END IF;
    IF slug_match_stable_external_id IS NOT NULL
      AND slug_match_stable_external_id <> area_record->>'stableExternalId' THEN
      RAISE EXCEPTION 'Market slug % already has a different stable geography ID.', area_record->>'slug' USING ERRCODE = '23514';
    END IF;
    target_area_id := coalesce(stable_match_id, slug_match_id);

    IF target_area_id IS NULL THEN
      INSERT INTO public.service_areas (
        market_id, slug, label, type, postal_code, city, county, state,
        center_lat, center_lng, bbox_west, bbox_south, bbox_east, bbox_north,
        geojson_path, geojson_sha256, source, source_version, source_license,
        source_url, source_retrieval_url, source_retrieved_at, stable_external_id,
        search_terms, active, is_pilot
      ) VALUES (
        market_id_value, area_record->>'slug', area_record->>'label', area_record->>'type',
        nullif(area_record->>'postalCode', ''), nullif(area_record->>'city', ''),
        'Los Angeles County', 'CA', public.ST_Y(center_point), public.ST_X(center_point),
        public.ST_XMin(public.Box3D(area_geometry)), public.ST_YMin(public.Box3D(area_geometry)),
        public.ST_XMax(public.Box3D(area_geometry)), public.ST_YMax(public.Box3D(area_geometry)),
        '/api/service-areas/' || area_record->>'slug' || '/geometry', area_sha256,
        source_record->>'id', source_record->>'sourceVersion', source_record->>'license',
        source_record->>'sourceUrl', source_record->>'retrievalUrl', (source_record->>'retrievalDate')::date,
        area_record->>'stableExternalId', ARRAY[]::text[], false, false
      ) RETURNING id INTO target_area_id;
    ELSE
      SELECT area.active INTO target_area_active FROM public.service_areas area WHERE area.id = target_area_id;
      IF target_area_active THEN
        existing_active_count := existing_active_count + 1;
      ELSE
        UPDATE public.service_areas SET
          label = area_record->>'label', type = area_record->>'type',
          postal_code = nullif(area_record->>'postalCode', ''), city = nullif(area_record->>'city', ''),
          county = 'Los Angeles County', state = 'CA', center_lat = public.ST_Y(center_point), center_lng = public.ST_X(center_point),
          bbox_west = public.ST_XMin(public.Box3D(area_geometry)), bbox_south = public.ST_YMin(public.Box3D(area_geometry)),
          bbox_east = public.ST_XMax(public.Box3D(area_geometry)), bbox_north = public.ST_YMax(public.Box3D(area_geometry)),
          geojson_path = '/api/service-areas/' || area_record->>'slug' || '/geometry', geojson_sha256 = area_sha256,
          source = source_record->>'id', source_version = source_record->>'sourceVersion',
          source_license = source_record->>'license', source_url = source_record->>'sourceUrl',
          source_retrieval_url = source_record->>'retrievalUrl', source_retrieved_at = (source_record->>'retrievalDate')::date,
          stable_external_id = area_record->>'stableExternalId', updated_at = now()
        WHERE id = target_area_id AND active = false;
      END IF;
    END IF;

    INSERT INTO public.service_area_geometry_versions (
      service_area_id, dataset_version, geojson, sha256, source_sha256,
      source, source_version, source_license, source_url, source_retrieval_url, source_retrieved_at
    ) VALUES (
      target_area_id, dataset_version_value, area_geojson, area_sha256, area_record#>>'{geometry,sha256}',
      source_record->>'id', source_record->>'sourceVersion', source_record->>'license',
      source_record->>'sourceUrl', source_record->>'retrievalUrl', (source_record->>'retrievalDate')::date
    ) ON CONFLICT (service_area_id, dataset_version) DO NOTHING;
    SELECT version.id, version.sha256, version.source_sha256
      INTO version_id, version_sha256, version_source_sha256
    FROM public.service_area_geometry_versions version
    WHERE version.service_area_id = target_area_id AND version.dataset_version = dataset_version_value;
    IF version_id IS NULL OR version_sha256 <> area_sha256 OR version_source_sha256 <> area_record#>>'{geometry,sha256}' THEN
      RAISE EXCEPTION 'Dataset version conflicts with existing geometry evidence for %.', area_record->>'slug' USING ERRCODE = '23514';
    END IF;
    INSERT INTO imported_area_ids VALUES (area_record->>'stableExternalId', target_area_id);
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(relationships->'relationships') relationship
    LEFT JOIN imported_area_ids parent ON parent.stable_external_id = relationship->>'parentStableExternalId'
    LEFT JOIN imported_area_ids child ON child.stable_external_id = relationship->>'childStableExternalId'
    WHERE parent.service_area_id IS NULL OR child.service_area_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Relationship evidence references an area outside the staged dataset.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.geography_dataset_versions (
    dataset_version, market_id, market_boundary_version_id, manifest_sha256,
    relationships_sha256, manifest, relationships
  ) VALUES (
    dataset_version_value, market_id_value, boundary_id, manifest_sha256,
    relationships_sha256, manifest, relationships
  ) ON CONFLICT (dataset_version) DO NOTHING;
  SELECT dataset.id INTO dataset_id
  FROM public.geography_dataset_versions dataset
  WHERE dataset.dataset_version = dataset_version_value
    AND dataset.market_id = market_id_value
    AND dataset.market_boundary_version_id = boundary_id
    AND dataset.manifest_sha256 = manifest_sha256
    AND dataset.relationships_sha256 = relationships_sha256;
  IF dataset_id IS NULL THEN
    RAISE EXCEPTION 'Dataset version conflicts with an existing immutable dataset ledger.' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'datasetVersion', dataset_version_value,
    'jurisdictionGeoid', '06037',
    'stagedAreas', (SELECT count(*) FROM imported_area_ids),
    'stagedGeometryVersions', (SELECT count(*) FROM public.service_area_geometry_versions WHERE dataset_version = dataset_version_value),
    'stagedOfficialDisplayParents', (
      SELECT count(*) FROM jsonb_array_elements(relationships->'relationships') relationship
      WHERE relationship->>'relationType' = 'DISPLAY_PARENT'
    ),
    'stagedOfficialRollups', (
      SELECT count(*) FROM jsonb_array_elements(relationships->'relationships') relationship
      WHERE relationship->>'relationType' = 'SEARCH_ROLLUP'
    ),
    'existingActiveAreasUntouched', existing_active_count,
    'activeAreasChanged', 0,
    'currentGeometryPointersChanged', 0,
    'marketBoundsChanged', 0,
    'liveRelationshipsChanged', 0
  );
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.stage_service_area_dataset(jsonb, jsonb, text, text, jsonb, jsonb, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

-- Existing reviewed terms are copied once during CTO integration. Dataset
-- staging never changes this live table; a later reviewed activation must
-- replace the activated dataset's terms and relationships atomically.
INSERT INTO public.service_area_search_terms (
  market_id, service_area_id, term_normalized, term_kind, source, reviewed_at
)
SELECT area.market_id, area.id,
       lower(btrim(regexp_replace(term, '[^a-zA-Z0-9]+', ' ', 'g'))) COLLATE "C",
       'CUTOVER_REVIEWED_ALIAS', 'canonical-cutover-backfill', now()
FROM public.service_areas area
CROSS JOIN LATERAL unnest(area.search_terms) term
WHERE btrim(term) <> ''
ON CONFLICT (market_id, term_normalized, service_area_id) DO NOTHING;

-- Acceptance queries: both must return zero rows before integration approval.
SELECT area.id, area.slug, market.slug AS market_slug
FROM public.service_areas area
JOIN public.markets market ON market.id = area.market_id
WHERE area.active = true
  AND (area.bbox_west < market.bbox_west OR area.bbox_south < market.bbox_south
    OR area.bbox_east > market.bbox_east OR area.bbox_north > market.bbox_north);

SELECT term.id
FROM public.service_area_search_terms term
JOIN public.service_areas area ON area.id = term.service_area_id
WHERE area.market_id <> term.market_id;
