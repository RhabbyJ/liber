-- Production LA County geography schema, immutable staging, and guarded activation.
-- Staging is inert. Activation is a separate owner-only function with an exact
-- dataset ledger, pre-change snapshot, aborting assertions, and rollback function.

BEGIN;

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
  ADD COLUMN IF NOT EXISTS current_boundary_id uuid,
  ADD COLUMN IF NOT EXISTS current_display_geometry_id uuid;

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
CREATE UNIQUE INDEX IF NOT EXISTS markets_current_display_geometry_id_key
ON public.markets(current_display_geometry_id);
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

CREATE TABLE IF NOT EXISTS public.market_display_geometry_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  dataset_version text NOT NULL,
  geojson jsonb NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  source_manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, dataset_version)
);
CREATE INDEX IF NOT EXISTS market_display_geometry_versions_market_sha_idx
ON public.market_display_geometry_versions(market_id, sha256);

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
-- Prisma cannot model INCLUDE columns, so this covering prefix index remains migration-owned.
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
  market_display_geometry_version_id uuid REFERENCES public.market_display_geometry_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  relationships_sha256 text NOT NULL CHECK (relationships_sha256 ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL,
  relationships jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS geography_dataset_versions_market_staged_idx
ON public.geography_dataset_versions(market_id, staged_at DESC);
CREATE INDEX IF NOT EXISTS geography_dataset_versions_boundary_idx
ON public.geography_dataset_versions(market_boundary_version_id);
CREATE INDEX IF NOT EXISTS geography_dataset_versions_display_geometry_idx
ON public.geography_dataset_versions(market_display_geometry_version_id);

CREATE TABLE IF NOT EXISTS public.geography_activation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  snapshot jsonb NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz,
  CHECK (rolled_back_at IS NULL OR rolled_back_at >= activated_at)
);
CREATE INDEX IF NOT EXISTS geography_activation_snapshots_market_activated_idx
ON public.geography_activation_snapshots(market_id, activated_at DESC);

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
    WHERE conname = 'markets_current_display_geometry_id_fkey'
      AND conrelid = 'public.markets'::regclass
  ) THEN
    ALTER TABLE public.markets
      ADD CONSTRAINT markets_current_display_geometry_id_fkey
      FOREIGN KEY (current_display_geometry_id) REFERENCES public.market_display_geometry_versions(id)
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
ALTER TABLE public.market_display_geometry_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_area_geometry_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_area_search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geography_dataset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geography_activation_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_boundary_versions, public.market_display_geometry_versions,
  public.service_area_geometry_versions, public.service_area_search_terms,
  public.geography_dataset_versions, public.geography_activation_snapshots
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
DROP TRIGGER IF EXISTS market_display_geometry_versions_immutable ON public.market_display_geometry_versions;
CREATE TRIGGER market_display_geometry_versions_immutable
BEFORE UPDATE OR DELETE ON public.market_display_geometry_versions
FOR EACH ROW EXECUTE FUNCTION geography_admin.reject_immutable_geography_version();
DROP TRIGGER IF EXISTS service_area_geometry_versions_immutable ON public.service_area_geometry_versions;
CREATE TRIGGER service_area_geometry_versions_immutable
BEFORE UPDATE OR DELETE ON public.service_area_geometry_versions
FOR EACH ROW EXECUTE FUNCTION geography_admin.reject_immutable_geography_version();
DROP TRIGGER IF EXISTS geography_dataset_versions_immutable ON public.geography_dataset_versions;
CREATE TRIGGER geography_dataset_versions_immutable
BEFORE UPDATE OR DELETE ON public.geography_dataset_versions
FOR EACH ROW EXECUTE FUNCTION geography_admin.reject_immutable_geography_version();

CREATE OR REPLACE FUNCTION geography_admin.enforce_activation_snapshot_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.dataset_version IS DISTINCT FROM OLD.dataset_version
    OR NEW.market_id IS DISTINCT FROM OLD.market_id
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
    OR OLD.rolled_back_at IS NOT NULL
    OR NEW.rolled_back_at IS NULL THEN
    RAISE EXCEPTION 'Geography activation snapshots are immutable except for one-way rollback completion.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.enforce_activation_snapshot_immutability()
FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS geography_activation_snapshots_immutable ON public.geography_activation_snapshots;
CREATE TRIGGER geography_activation_snapshots_immutable
BEFORE UPDATE OR DELETE ON public.geography_activation_snapshots
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_activation_snapshot_immutability();

CREATE OR REPLACE FUNCTION geography_admin.enforce_current_geometry_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  new_row jsonb := to_jsonb(NEW);
BEGIN
  IF TG_TABLE_NAME = 'markets' AND new_row->>'current_boundary_id' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.market_boundary_versions version
    WHERE version.id = (new_row->>'current_boundary_id')::uuid AND version.market_id = (new_row->>'id')::uuid
  ) THEN
    RAISE EXCEPTION 'Current market boundary must belong to the same market.' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'markets' AND new_row->>'current_display_geometry_id' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.market_display_geometry_versions version
    WHERE version.id = (new_row->>'current_display_geometry_id')::uuid AND version.market_id = (new_row->>'id')::uuid
  ) THEN
    RAISE EXCEPTION 'Current market display geometry must belong to the same market.' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'service_areas' AND new_row->>'current_geometry_id' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_area_geometry_versions version
    WHERE version.id = (new_row->>'current_geometry_id')::uuid AND version.service_area_id = (new_row->>'id')::uuid
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
AFTER INSERT OR UPDATE OF current_boundary_id, current_display_geometry_id ON public.markets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_current_geometry_ownership();
DROP TRIGGER IF EXISTS service_areas_current_geometry_ownership ON public.service_areas;
CREATE CONSTRAINT TRIGGER service_areas_current_geometry_ownership
AFTER INSERT OR UPDATE OF current_geometry_id ON public.service_areas
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_current_geometry_ownership();

CREATE OR REPLACE FUNCTION geography_admin.enforce_stable_geography_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'markets' THEN
    IF OLD.stable_external_id IS NOT NULL AND NEW.stable_external_id IS DISTINCT FROM OLD.stable_external_id
      OR OLD.jurisdiction_type IS NOT NULL AND NEW.jurisdiction_type IS DISTINCT FROM OLD.jurisdiction_type
      OR OLD.jurisdiction_geoid IS NOT NULL AND NEW.jurisdiction_geoid IS DISTINCT FROM OLD.jurisdiction_geoid THEN
      RAISE EXCEPTION 'Canonical market jurisdiction identity is immutable.' USING ERRCODE = '23514';
    END IF;
    IF num_nonnulls(NEW.stable_external_id, NEW.jurisdiction_type, NEW.jurisdiction_geoid) NOT IN (0, 3) THEN
      RAISE EXCEPTION 'Canonical market jurisdiction identity must be assigned together.' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.stable_external_id IS NOT NULL AND NEW.stable_external_id IS DISTINCT FROM OLD.stable_external_id THEN
    RAISE EXCEPTION 'Canonical service-area source identity is immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.enforce_stable_geography_identity()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS markets_stable_geography_identity ON public.markets;
CREATE TRIGGER markets_stable_geography_identity
BEFORE UPDATE OF stable_external_id, jurisdiction_type, jurisdiction_geoid ON public.markets
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_stable_geography_identity();
DROP TRIGGER IF EXISTS service_areas_stable_geography_identity ON public.service_areas;
CREATE TRIGGER service_areas_stable_geography_identity
BEFORE UPDATE OF stable_external_id ON public.service_areas
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_stable_geography_identity();

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
           min(CASE
             WHEN replace(area.slug, '-', ' ') = input.term THEN 1
             WHEN area.postal_code = input.term THEN 2
             WHEN lower(btrim(regexp_replace(area.label, '[^a-zA-Z0-9]+', ' ', 'g'))) COLLATE "C" = input.term THEN 3
             WHEN search_term.term_normalized = input.term THEN 4
             ELSE 99
           END) AS exact_rank,
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
  ), ranked AS (
    SELECT matches.*,
           min(matches.exact_rank) FILTER (WHERE matches.exact_rank < 99) OVER () AS best_exact_rank
    FROM matches
  )
  SELECT ranked.service_area_id,
         ranked.exact_rank < 99 AND ranked.exact_rank = ranked.best_exact_rank AS exact_match
  FROM ranked, input
  ORDER BY exact_match DESC, ranked.exact_rank, ranked.matched_term, ranked.service_area_id
  LIMIT (SELECT row_limit FROM input);
$$;
REVOKE ALL ON FUNCTION geography_admin.search_active_service_areas(text, text, integer)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.stage_service_area_dataset(
  manifest jsonb,
  relationships jsonb,
  provided_manifest_sha256 text,
  provided_relationships_sha256 text,
  county_bundle jsonb,
  csa_bundle jsonb,
  zcta_bundle jsonb,
  legal_city_bundle jsonb
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
  display_geojson jsonb;
  display_geometry_id uuid;
  display_sha256 text;
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
  IF provided_manifest_sha256 IS DISTINCT FROM '2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47'
    OR provided_relationships_sha256 IS DISTINCT FROM '5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8' THEN
    RAISE EXCEPTION 'Dataset ledger checksums do not match the reviewed release.' USING ERRCODE = '23514';
  END IF;
  IF encode(extensions.digest(convert_to(manifest::text, 'utf8'), 'sha256'), 'hex')
      <> 'd0965b642e0b0073b39743a28f68d94293fad2b640d36371f00c22b5fcff9d54'
    OR encode(extensions.digest(convert_to(relationships::text, 'utf8'), 'sha256'), 'hex')
      <> '1e780b7f790c802f4b3f2c4b0660a5bb90683decfb5c508cbe21f68a011cf83e' THEN
    RAISE EXCEPTION 'Dataset JSON differs from the reviewed canonical release.' USING ERRCODE = '23514';
  END IF;
  IF encode(extensions.digest(convert_to(county_bundle::text, 'utf8'), 'sha256'), 'hex')
      IS DISTINCT FROM '5fd4460f31d6c942c3733d99f8d874ad6b88398c94b4d84e1dea97bb909f72b1'
    OR encode(extensions.digest(convert_to(csa_bundle::text, 'utf8'), 'sha256'), 'hex')
      IS DISTINCT FROM '346b290d5312d8dd253e9d5fabc158d8c12776e98cf684143b521d8575c0ec68'
    OR encode(extensions.digest(convert_to(zcta_bundle::text, 'utf8'), 'sha256'), 'hex')
      IS DISTINCT FROM '0362d1953502b989d59a43f792e405fcc36a27c0847e25d518ce36f1295fdaf5'
    OR encode(extensions.digest(convert_to(legal_city_bundle::text, 'utf8'), 'sha256'), 'hex')
      IS DISTINCT FROM 'c2bdcf416b62703755dcb36e0ef952b3abb698661bbcf2a5612e171e700afcd5' THEN
    RAISE EXCEPTION 'Source bundle JSON differs from the reviewed canonical release.' USING ERRCODE = '23514';
  END IF;
  IF (manifest->>'schemaVersion')::integer <> 2
    OR manifest->>'datasetVersion' <> 'la-county-06037-2026-07-12-v2'
    OR manifest#>>'{market,slug}' <> 'los-angeles'
    OR manifest#>>'{market,jurisdictionType}' <> 'county'
    OR manifest#>>'{market,jurisdictionGeoid}' <> '06037'
    OR manifest#>>'{market,stableExternalId}' <> 'urn:census:county:06037'
    OR manifest#>>'{market,state}' <> 'CA'
    OR manifest#>>'{market,country}' <> 'US'
    OR coalesce((manifest#>>'{activation,activateMarket}')::boolean, true)
    OR jsonb_array_length(coalesce(manifest#>'{activation,activateSlugs}', '[]'::jsonb)) <> 0 THEN
    RAISE EXCEPTION 'Only the inactive Los Angeles County GEOID 06037 dataset may be staged.' USING ERRCODE = '23514';
  END IF;
  IF (manifest#>>'{counts,areas}')::integer <> 661
    OR (manifest#>>'{counts,cities}')::integer <> 88
    OR (manifest#>>'{counts,communities}')::integer <> 269
    OR (manifest#>>'{counts,zctas}')::integer <> 304
    OR manifest#>>'{displayBoundaries,bundles,county}' <> 'county.geojson.gz'
    OR manifest#>>'{displayBoundaries,bundles,legalCity}' <> 'legal-city.geojson.gz'
    OR manifest#>>'{displayBoundaries,bundles,zcta}' <> 'zcta.geojson.gz'
    OR (manifest#>>'{displayBoundaries,counts,legalCityFeatures}')::integer <> 91
    OR (manifest#>>'{displayBoundaries,counts,legalCities}')::integer <> 88
    OR (manifest#>>'{displayBoundaries,counts,zctas}')::integer <> 304
    OR manifest#>>'{displayBoundaries,legalCityNameProperty}' <> 'CITY_NAME' THEN
    RAISE EXCEPTION 'LA County source and display-boundary counts do not match the reviewed release.' USING ERRCODE = '23514';
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

  SELECT dataset.id INTO dataset_id
  FROM public.geography_dataset_versions dataset
  WHERE dataset.dataset_version = dataset_version_value
    AND dataset.market_id = market_id_value
    AND dataset.manifest_sha256 = provided_manifest_sha256
    AND dataset.relationships_sha256 = provided_relationships_sha256
    AND dataset.market_display_geometry_version_id IS NOT NULL;
  IF dataset_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'datasetVersion', dataset_version_value,
      'jurisdictionGeoid', '06037',
      'stagedAreas', 661,
      'stagedGeometryVersions', 661,
      'stagedDisplayFeatures', 393,
      'existingActiveAreasUntouched', (
        SELECT count(*) FROM public.service_areas area
        WHERE area.market_id = market_id_value AND area.active = true
      ),
      'idempotent', true
    );
  ELSIF EXISTS (SELECT 1 FROM public.geography_dataset_versions dataset WHERE dataset.dataset_version = dataset_version_value) THEN
    RAISE EXCEPTION 'Dataset version conflicts with an existing immutable dataset ledger.' USING ERRCODE = '23514';
  END IF;

  CREATE TEMP TABLE geo_source_features (
    bundle text NOT NULL,
    feature_id text NOT NULL,
    feature_label text,
    geom public.geometry(Geometry, 4326) NOT NULL,
    PRIMARY KEY (bundle, feature_id)
  ) ON COMMIT DROP;
  CREATE TEMP TABLE imported_area_ids (
    stable_external_id text PRIMARY KEY,
    service_area_id uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO geo_source_features(bundle, feature_id, feature_label, geom)
  SELECT 'county.geojson.gz', feature->'properties'->>'GEOID', feature->'properties'->>'NAME',
         public.ST_SetSRID(public.ST_MakeValid(public.ST_GeomFromGeoJSON((feature->'geometry')::text)), 4326)
  FROM jsonb_array_elements(county_bundle->'features') feature;
  INSERT INTO geo_source_features(bundle, feature_id, feature_label, geom)
  SELECT 'csa-land.geojson.gz', feature->'properties'->>'OBJECTID', feature->'properties'->>'COMMUNITY',
         public.ST_SetSRID(public.ST_MakeValid(public.ST_GeomFromGeoJSON((feature->'geometry')::text)), 4326)
  FROM jsonb_array_elements(csa_bundle->'features') feature;
  INSERT INTO geo_source_features(bundle, feature_id, feature_label, geom)
  SELECT 'zcta.geojson.gz', feature->'properties'->>'ZCTA5', feature->'properties'->>'ZCTA5',
         public.ST_SetSRID(public.ST_MakeValid(public.ST_GeomFromGeoJSON((feature->'geometry')::text)), 4326)
  FROM jsonb_array_elements(zcta_bundle->'features') feature;
  INSERT INTO geo_source_features(bundle, feature_id, feature_label, geom)
  SELECT 'legal-city.geojson.gz', feature->'properties'->>'OBJECTID', feature->'properties'->>'CITY_NAME',
         public.ST_SetSRID(public.ST_MakeValid(public.ST_GeomFromGeoJSON((feature->'geometry')::text)), 4326)
  FROM jsonb_array_elements(legal_city_bundle->'features') feature
  WHERE feature->'properties'->>'CITY_TYPE' = 'City'
    AND feature->'properties'->>'FEAT_TYPE' = 'Land';

  IF (SELECT count(*) FROM geo_source_features WHERE bundle = 'county.geojson.gz') <> 1
    OR (SELECT count(*) FROM geo_source_features WHERE bundle = 'csa-land.geojson.gz') <> 355
    OR (SELECT count(*) FROM geo_source_features WHERE bundle = 'zcta.geojson.gz') <> 304
    OR (SELECT count(*) FROM geo_source_features WHERE bundle = 'legal-city.geojson.gz') <> 91
    OR (SELECT count(DISTINCT feature_label) FROM geo_source_features WHERE bundle = 'legal-city.geojson.gz') <> 88 THEN
    RAISE EXCEPTION 'Source bundle feature counts do not match the reviewed LA County release.' USING ERRCODE = '23514';
  END IF;

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
    area_geojson := jsonb_build_object(
      'type', 'Feature',
      'properties', jsonb_build_object(
        'kind', area_record->>'type',
        'slug', area_record->>'slug',
        'label', area_record->>'label'
      ),
      'geometry', public.ST_AsGeoJSON(area_geometry, 6, 0)::jsonb
    );
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
        '/api/service-areas/' || (area_record->>'slug') || '/geometry', area_sha256,
        source_record->>'id', source_record->>'sourceVersion', source_record->>'license',
        source_record->>'sourceUrl', source_record->>'retrievalUrl', (source_record->>'retrievalDate')::date,
        area_record->>'stableExternalId', ARRAY[]::text[], false, false
      ) RETURNING id INTO target_area_id;
    ELSE
      SELECT area.active INTO target_area_active FROM public.service_areas area WHERE area.id = target_area_id;
      IF target_area_active THEN
        existing_active_count := existing_active_count + 1;
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

  IF (SELECT count(*) FROM imported_area_ids) <> 661
    OR (SELECT count(*) FROM public.service_area_geometry_versions WHERE dataset_version = dataset_version_value) <> 661
    OR (SELECT count(*) FROM jsonb_array_elements(manifest->'areas') area WHERE area->>'type' = 'city') <> 88
    OR (SELECT count(*) FROM jsonb_array_elements(manifest->'areas') area WHERE area->>'type' = 'neighborhood') <> 269
    OR (SELECT count(*) FROM jsonb_array_elements(manifest->'areas') area WHERE area->>'type' = 'zip') <> 304 THEN
    RAISE EXCEPTION 'Staged service-area or geometry counts do not match the reviewed release.' USING ERRCODE = '23514';
  END IF;

  CREATE TEMP TABLE market_display_features (
    kind text NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    geom public.geometry(MultiPolygon, 4326) NOT NULL,
    PRIMARY KEY (kind, slug)
  ) ON COMMIT DROP;

  INSERT INTO market_display_features(kind, slug, label, geom)
  VALUES ('county', 'los-angeles-county', 'Los Angeles County', county_geometry);

  INSERT INTO market_display_features(kind, slug, label, geom)
  SELECT 'city',
         trim(both '-' FROM regexp_replace(lower(source.feature_label), '[^a-z0-9]+', '-', 'g')),
         source.feature_label,
         public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(public.ST_Intersection(
           public.ST_UnaryUnion(public.ST_Collect(source.geom ORDER BY source.feature_id COLLATE "C")),
           county_geometry
         )), 3))
  FROM geo_source_features source
  WHERE source.bundle = 'legal-city.geojson.gz'
  GROUP BY source.feature_label;

  INSERT INTO market_display_features(kind, slug, label, geom)
  SELECT 'zip', source.feature_id, source.feature_id,
         public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(
           public.ST_Intersection(source.geom, county_geometry)
         ), 3))
  FROM geo_source_features source
  WHERE source.bundle = 'zcta.geojson.gz';

  IF (SELECT count(*) FROM market_display_features WHERE kind = 'county') <> 1
    OR (SELECT count(*) FROM market_display_features WHERE kind = 'city') <> 88
    OR (SELECT count(*) FROM market_display_features WHERE kind = 'zip') <> 304
    OR EXISTS (SELECT 1 FROM market_display_features WHERE public.ST_IsEmpty(geom)) THEN
    RAISE EXCEPTION 'Display boundary generation did not produce 1 county, 88 cities, and 304 ZCTAs.' USING ERRCODE = '23514';
  END IF;

  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'properties', jsonb_build_object('kind', kind, 'slug', slug, 'label', label),
        'geometry', public.ST_AsGeoJSON(
          public.ST_SimplifyPreserveTopology(
            geom,
            CASE kind WHEN 'county' THEN 0.0003 WHEN 'city' THEN 0.0002 ELSE 0.00025 END
          ),
          5,
          0
        )::jsonb
      )
      ORDER BY CASE kind WHEN 'county' THEN 0 WHEN 'city' THEN 1 ELSE 2 END, slug COLLATE "C"
    )
  ) INTO display_geojson
  FROM market_display_features;
  display_sha256 := encode(extensions.digest(convert_to(display_geojson::text, 'utf8'), 'sha256'), 'hex');
  IF display_sha256 <> '55813f467a184a26398b7f52d9995dcdcf5678db98b4f5950b1740ee9fd92443' THEN
    RAISE EXCEPTION 'Generated display geometry differs from the reviewed production rehearsal.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.market_display_geometry_versions (
    market_id, dataset_version, geojson, sha256, source_manifest
  ) VALUES (
    market_id_value, dataset_version_value, display_geojson, display_sha256,
    jsonb_build_object('displayBoundaries', manifest->'displayBoundaries', 'sources', manifest->'sources')
  ) ON CONFLICT (market_id, dataset_version) DO NOTHING;
  SELECT version.id, version.sha256 INTO display_geometry_id, version_sha256
  FROM public.market_display_geometry_versions version
  WHERE version.market_id = market_id_value AND version.dataset_version = dataset_version_value;
  IF display_geometry_id IS NULL OR version_sha256 <> display_sha256 THEN
    RAISE EXCEPTION 'Dataset version conflicts with an existing market display geometry.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(relationships->'relationships') relationship
    LEFT JOIN imported_area_ids parent ON parent.stable_external_id = relationship->>'parentStableExternalId'
    LEFT JOIN imported_area_ids child ON child.stable_external_id = relationship->>'childStableExternalId'
    WHERE parent.service_area_id IS NULL OR child.service_area_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Relationship evidence references an area outside the staged dataset.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.geography_dataset_versions (
    dataset_version, market_id, market_boundary_version_id, market_display_geometry_version_id, manifest_sha256,
    relationships_sha256, manifest, relationships
  ) VALUES (
    dataset_version_value, market_id_value, boundary_id, display_geometry_id, provided_manifest_sha256,
    provided_relationships_sha256, manifest, relationships
  ) ON CONFLICT (dataset_version) DO NOTHING;
  SELECT dataset.id INTO dataset_id
  FROM public.geography_dataset_versions dataset
  WHERE dataset.dataset_version = dataset_version_value
    AND dataset.market_id = market_id_value
    AND dataset.market_boundary_version_id = boundary_id
    AND dataset.market_display_geometry_version_id = display_geometry_id
    AND dataset.manifest_sha256 = provided_manifest_sha256
    AND dataset.relationships_sha256 = provided_relationships_sha256;
  IF dataset_id IS NULL THEN
    RAISE EXCEPTION 'Dataset version conflicts with an existing immutable dataset ledger.' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'datasetVersion', dataset_version_value,
    'jurisdictionGeoid', '06037',
    'stagedAreas', (SELECT count(*) FROM imported_area_ids),
    'stagedGeometryVersions', (SELECT count(*) FROM public.service_area_geometry_versions WHERE dataset_version = dataset_version_value),
    'stagedDisplayFeatures', jsonb_array_length(display_geojson->'features'),
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
REVOKE ALL ON FUNCTION geography_admin.stage_service_area_dataset(jsonb, jsonb, text, text, jsonb, jsonb, jsonb, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.assert_la_county_activation_current(requested_dataset_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  activation_snapshot public.geography_activation_snapshots%ROWTYPE;
  boundary_geometry public.geometry(MultiPolygon, 4326);
  center_point public.geometry(Point, 4326);
  dataset_record public.geography_dataset_versions%ROWTYPE;
BEGIN
  SELECT dataset.* INTO dataset_record
  FROM public.geography_dataset_versions dataset
  WHERE dataset.id = requested_dataset_id;
  IF dataset_record.id IS NULL THEN
    RAISE EXCEPTION 'Activated geography dataset is missing.' USING ERRCODE = '23514';
  END IF;
  SELECT snapshot.* INTO activation_snapshot
  FROM public.geography_activation_snapshots snapshot
  WHERE snapshot.dataset_version = dataset_record.dataset_version
    AND snapshot.market_id = dataset_record.market_id;
  IF activation_snapshot.id IS NULL OR activation_snapshot.rolled_back_at IS NOT NULL THEN
    RAISE EXCEPTION 'Active geography snapshot is missing.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.service_area_search_terms search_term
    WHERE search_term.source = dataset_record.dataset_version
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
        JOIN public.service_areas area
          ON area.market_id = dataset_record.market_id
         AND area.slug = manifest_area->>'slug'
        CROSS JOIN LATERAL jsonb_array_elements_text(manifest_area->'searchTerms') term(value)
        WHERE search_term.market_id = dataset_record.market_id
          AND search_term.service_area_id = area.id
          AND search_term.term_normalized = term.value COLLATE "C"
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.service_area_relationships stored
    WHERE stored.source = dataset_record.dataset_version
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(dataset_record.relationships->'relationships') relationship(value)
        JOIN public.service_areas parent
          ON parent.market_id = dataset_record.market_id
         AND parent.stable_external_id = relationship.value->>'parentStableExternalId'
        JOIN public.service_areas child
          ON child.market_id = dataset_record.market_id
         AND child.stable_external_id = relationship.value->>'childStableExternalId'
        WHERE stored.parent_service_area_id = parent.id
          AND stored.child_service_area_id = child.id
          AND stored.relation_type = (relationship.value->>'relationType')::public."ServiceAreaRelationType"
      )
  ) THEN
    RAISE EXCEPTION 'Release-owned geography contains an unapproved live key.' USING ERRCODE = '23514';
  END IF;

  SELECT public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(
    public.ST_GeomFromGeoJSON(boundary.geojson::text)
  ), 3)) INTO boundary_geometry
  FROM public.market_boundary_versions boundary
  WHERE boundary.id = dataset_record.market_boundary_version_id
    AND boundary.market_id = dataset_record.market_id;
  center_point := public.ST_PointOnSurface(boundary_geometry);

  IF boundary_geometry IS NULL OR public.ST_IsEmpty(boundary_geometry)
    OR NOT EXISTS (
      SELECT 1 FROM public.markets market
      WHERE market.id = dataset_record.market_id
        AND market.active = true
        AND market.label = 'Los Angeles County'
        AND market.jurisdiction_type = 'county'
        AND market.jurisdiction_geoid = '06037'
        AND market.stable_external_id = 'urn:census:county:06037'
        AND market.current_boundary_id = dataset_record.market_boundary_version_id
        AND market.current_display_geometry_id = dataset_record.market_display_geometry_version_id
        AND market.center_lat = public.ST_Y(center_point)
        AND market.center_lng = public.ST_X(center_point)
        AND market.bbox_west = public.ST_XMin(public.Box3D(boundary_geometry))
        AND market.bbox_south = public.ST_YMin(public.Box3D(boundary_geometry))
        AND market.bbox_east = public.ST_XMax(public.Box3D(boundary_geometry))
        AND market.bbox_north = public.ST_YMax(public.Box3D(boundary_geometry))
    )
    OR (SELECT display.sha256 FROM public.market_display_geometry_versions display
        WHERE display.id = dataset_record.market_display_geometry_version_id)
       IS DISTINCT FROM '55813f467a184a26398b7f52d9995dcdcf5678db98b4f5950b1740ee9fd92443'
    OR (SELECT count(*) FROM jsonb_array_elements(dataset_record.manifest->'areas')) <> 661
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
      LEFT JOIN public.service_areas area
        ON area.market_id = dataset_record.market_id
       AND area.slug = manifest_area->>'slug'
      LEFT JOIN public.service_area_geometry_versions geometry_version
        ON geometry_version.service_area_id = area.id
       AND geometry_version.dataset_version = dataset_record.dataset_version
      LEFT JOIN LATERAL (
        SELECT public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(
          public.ST_GeomFromGeoJSON((geometry_version.geojson->'geometry')::text)
        ), 3)) AS geom
      ) computed ON geometry_version.geojson->>'type' = 'Feature'
      WHERE area.id IS NULL OR geometry_version.id IS NULL OR computed.geom IS NULL
        OR area.stable_external_id IS DISTINCT FROM manifest_area->>'stableExternalId'
        OR area.current_geometry_id IS DISTINCT FROM geometry_version.id
        OR area.geojson_sha256 IS DISTINCT FROM geometry_version.sha256
        OR area.label IS DISTINCT FROM manifest_area->>'label'
        OR area.type IS DISTINCT FROM manifest_area->>'type'
        OR area.postal_code IS DISTINCT FROM nullif(manifest_area->>'postalCode', '')
        OR area.city IS DISTINCT FROM nullif(manifest_area->>'city', '')
        OR area.county IS DISTINCT FROM manifest_area->>'county'
        OR area.state IS DISTINCT FROM manifest_area->>'state'
        OR area.center_lat IS DISTINCT FROM public.ST_Y(public.ST_PointOnSurface(computed.geom))
        OR area.center_lng IS DISTINCT FROM public.ST_X(public.ST_PointOnSurface(computed.geom))
        OR area.bbox_west IS DISTINCT FROM public.ST_XMin(public.Box3D(computed.geom))
        OR area.bbox_south IS DISTINCT FROM public.ST_YMin(public.Box3D(computed.geom))
        OR area.bbox_east IS DISTINCT FROM public.ST_XMax(public.Box3D(computed.geom))
        OR area.bbox_north IS DISTINCT FROM public.ST_YMax(public.Box3D(computed.geom))
        OR area.geojson_path IS DISTINCT FROM '/api/service-areas/' || (manifest_area->>'slug') || '/geometry'
        OR area.source IS DISTINCT FROM manifest_area#>>'{source,id}'
        OR area.source_version IS DISTINCT FROM manifest_area#>>'{source,sourceVersion}'
        OR area.source_license IS DISTINCT FROM manifest_area#>>'{source,license}'
        OR area.source_url IS DISTINCT FROM manifest_area#>>'{source,sourceUrl}'
        OR area.source_retrieval_url IS DISTINCT FROM manifest_area#>>'{source,retrievalUrl}'
        OR area.source_retrieved_at IS DISTINCT FROM (manifest_area#>>'{source,retrievalDate}')::date
        OR area.search_terms IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(manifest_area->'searchTerms'))
        OR area.is_pilot IS DISTINCT FROM false
        OR area.active IS DISTINCT FROM (
          manifest_area->>'type' IN ('city', 'zip')
          OR manifest_area->>'slug' IN ('encino', 'northridge', 'tarzana')
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.service_areas area
      WHERE area.market_id = dataset_record.market_id AND area.active
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
          WHERE manifest_area->>'slug' = area.slug
        )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
      JOIN public.service_areas area
        ON area.market_id = dataset_record.market_id AND area.slug = manifest_area->>'slug'
      CROSS JOIN LATERAL jsonb_array_elements_text(manifest_area->'searchTerms') term(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.service_area_search_terms search_term
        WHERE search_term.market_id = dataset_record.market_id
          AND search_term.service_area_id = area.id
          AND search_term.term_normalized = term.value COLLATE "C"
          AND (
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements(coalesce(
                activation_snapshot.snapshot->'preexisting_search_terms', '[]'::jsonb
              )) previous(value)
              WHERE previous.value->>'id' = search_term.id::text
                AND previous.value->>'service_area_id' = area.id::text
                AND previous.value->>'term_normalized' = term.value
                AND search_term.term_kind IS NOT DISTINCT FROM previous.value->>'term_kind'
                AND search_term.source IS NOT DISTINCT FROM previous.value->>'source'
                AND search_term.reviewed_at IS NOT DISTINCT FROM (previous.value->>'reviewed_at')::timestamptz
                AND search_term.created_at IS NOT DISTINCT FROM (previous.value->>'created_at')::timestamptz
            )
            OR (
              NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(coalesce(
                  activation_snapshot.snapshot->'preexisting_search_terms', '[]'::jsonb
                )) previous(value)
                WHERE previous.value->>'service_area_id' = area.id::text
                  AND previous.value->>'term_normalized' = term.value
              )
              AND search_term.term_kind = 'DATASET_REVIEWED_ALIAS'
              AND search_term.source = dataset_record.dataset_version
              AND search_term.reviewed_at IS NOT DISTINCT FROM
                (dataset_record.manifest#>>'{relationshipPolicy,reviewedAt}')::timestamptz
            )
          )
      )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(dataset_record.relationships->'relationships') relationship(value)
      JOIN public.service_areas parent
        ON parent.market_id = dataset_record.market_id
       AND parent.stable_external_id = relationship.value->>'parentStableExternalId'
      JOIN public.service_areas child
        ON child.market_id = dataset_record.market_id
       AND child.stable_external_id = relationship.value->>'childStableExternalId'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.service_area_relationships stored
        WHERE stored.parent_service_area_id = parent.id
          AND stored.child_service_area_id = child.id
          AND stored.relation_type = (relationship.value->>'relationType')::public."ServiceAreaRelationType"
          AND (
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements(coalesce(
                activation_snapshot.snapshot->'preexisting_relationships', '[]'::jsonb
              )) previous(value)
              WHERE previous.value->>'parent_service_area_id' = parent.id::text
                AND previous.value->>'child_service_area_id' = child.id::text
                AND previous.value->>'relation_type' = stored.relation_type::text
                AND stored.source IS NOT DISTINCT FROM previous.value->>'source'
                AND stored.reviewed_at IS NOT DISTINCT FROM (previous.value->>'reviewed_at')::timestamptz
                AND stored.created_at IS NOT DISTINCT FROM (previous.value->>'created_at')::timestamptz
                AND stored.updated_at IS NOT DISTINCT FROM (previous.value->>'updated_at')::timestamptz
            )
            OR (
              NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(coalesce(
                  activation_snapshot.snapshot->'preexisting_relationships', '[]'::jsonb
                )) previous(value)
                WHERE previous.value->>'parent_service_area_id' = parent.id::text
                  AND previous.value->>'child_service_area_id' = child.id::text
                  AND previous.value->>'relation_type' = stored.relation_type::text
              )
              AND stored.source = dataset_record.dataset_version
              AND stored.reviewed_at IS NOT DISTINCT FROM (relationship.value->>'reviewedAt')::timestamptz
            )
          )
      )
    )
    OR EXISTS (
      SELECT 1 FROM public."BuyerProfile" buyer
      WHERE buyer."visibilityStatus" = 'ACTIVE'
        AND 1 <> (
          SELECT count(*)
          FROM public.buyer_desired_service_areas desired
          JOIN public.service_areas area ON area.id = desired.service_area_id
          JOIN public.markets market ON market.id = area.market_id
          WHERE desired.buyer_profile_id = buyer.id
            AND desired.source = 'SELECTED'
            AND desired.is_primary = true
            AND area.active = true
            AND market.active = true
        )
    ) THEN
    RAISE EXCEPTION 'Live LA County geography differs from its approved activation.' USING ERRCODE = '23514';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.assert_la_county_activation_current(uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.activate_service_area_dataset(
  requested_dataset_version text,
  expected_manifest_sha256 text,
  expected_relationships_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  boundary_geometry public.geometry(MultiPolygon, 4326);
  center_point public.geometry(Point, 4326);
  dataset_record public.geography_dataset_versions%ROWTYPE;
  existing_snapshot public.geography_activation_snapshots%ROWTYPE;
  market_snapshot jsonb;
BEGIN
  IF requested_dataset_version <> 'la-county-06037-2026-07-12-v2'
    OR expected_manifest_sha256 <> '2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47'
    OR expected_relationships_sha256 <> '5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8' THEN
    RAISE EXCEPTION 'Activation requires the exact reviewed LA County v2 checksum ledger.' USING ERRCODE = '23514';
  END IF;

  SELECT dataset.* INTO dataset_record
  FROM public.geography_dataset_versions dataset
  WHERE dataset.dataset_version = requested_dataset_version
    AND dataset.manifest_sha256 = expected_manifest_sha256
    AND dataset.relationships_sha256 = expected_relationships_sha256
    AND dataset.market_display_geometry_version_id IS NOT NULL;
  IF dataset_record.id IS NULL THEN
    RAISE EXCEPTION 'The exact reviewed LA County dataset is not staged.' USING ERRCODE = '23503';
  END IF;
  IF (SELECT display.sha256 FROM public.market_display_geometry_versions display
      WHERE display.id = dataset_record.market_display_geometry_version_id)
      IS DISTINCT FROM '55813f467a184a26398b7f52d9995dcdcf5678db98b4f5950b1740ee9fd92443' THEN
    RAISE EXCEPTION 'The staged display geometry does not match the reviewed release.' USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.markets market WHERE market.id = dataset_record.market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The staged market is missing.' USING ERRCODE = '23503'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('service-area-activation:' || dataset_record.market_id::text, 0));

  SELECT snapshot.* INTO existing_snapshot
  FROM public.geography_activation_snapshots snapshot
  WHERE snapshot.dataset_version = requested_dataset_version
  FOR UPDATE;
  IF existing_snapshot.id IS NOT NULL THEN
    IF existing_snapshot.rolled_back_at IS NOT NULL THEN
      RAISE EXCEPTION 'A rolled-back dataset cannot be reactivated; stage a new immutable release.' USING ERRCODE = '23514';
    END IF;
    PERFORM geography_admin.assert_la_county_activation_current(dataset_record.id);
    RETURN jsonb_build_object(
      'datasetVersion', requested_dataset_version,
      'activeCities', 88,
      'activeZctas', 304,
      'idempotent', true
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.service_area_search_terms
    WHERE source = requested_dataset_version
  ) OR EXISTS (
    SELECT 1 FROM public.service_area_relationships
    WHERE source = requested_dataset_version
  ) THEN
    RAISE EXCEPTION 'Release-owned live geography rows already exist before activation.' USING ERRCODE = '23514';
  END IF;

  CREATE TEMP TABLE activation_areas (
    service_area_id uuid PRIMARY KEY,
    stable_external_id text NOT NULL UNIQUE,
    geometry_version_id uuid NOT NULL UNIQUE,
    geometry_sha256 text NOT NULL,
    center_lat double precision NOT NULL,
    center_lng double precision NOT NULL,
    bbox_west double precision NOT NULL,
    bbox_south double precision NOT NULL,
    bbox_east double precision NOT NULL,
    bbox_north double precision NOT NULL,
    approved_active boolean NOT NULL,
    manifest_area jsonb NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO activation_areas(
    service_area_id, stable_external_id, geometry_version_id, geometry_sha256,
    center_lat, center_lng, bbox_west, bbox_south, bbox_east, bbox_north,
    approved_active, manifest_area
  )
  SELECT area.id,
         manifest_area->>'stableExternalId',
         geometry_version.id,
         geometry_version.sha256,
         public.ST_Y(public.ST_PointOnSurface(computed.geom)),
         public.ST_X(public.ST_PointOnSurface(computed.geom)),
         public.ST_XMin(public.Box3D(computed.geom)),
         public.ST_YMin(public.Box3D(computed.geom)),
         public.ST_XMax(public.Box3D(computed.geom)),
         public.ST_YMax(public.Box3D(computed.geom)),
         manifest_area->>'type' IN ('city', 'zip'),
         manifest_area
  FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
  JOIN public.service_areas area
    ON area.market_id = dataset_record.market_id
   AND area.slug = manifest_area->>'slug'
  JOIN public.service_area_geometry_versions geometry_version
    ON geometry_version.service_area_id = area.id
   AND geometry_version.dataset_version = requested_dataset_version
   AND geometry_version.geojson->>'type' = 'Feature'
  CROSS JOIN LATERAL (
    SELECT public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(
      public.ST_GeomFromGeoJSON((geometry_version.geojson->'geometry')::text)
    ), 3)) AS geom
  ) computed
  WHERE NOT public.ST_IsEmpty(computed.geom);

  IF (SELECT count(*) FROM activation_areas) <> 661
    OR (SELECT count(*) FROM activation_areas WHERE approved_active AND manifest_area->>'type' = 'city') <> 88
    OR (SELECT count(*) FROM activation_areas WHERE approved_active AND manifest_area->>'type' = 'zip') <> 304
    OR EXISTS (
      SELECT 1
      FROM activation_areas activation
      JOIN public.service_areas area ON area.id = activation.service_area_id
      WHERE area.stable_external_id IS NOT NULL
        AND area.stable_external_id <> activation.stable_external_id
    ) THEN
    RAISE EXCEPTION 'Activation allowlist or staged source identity is incomplete.' USING ERRCODE = '23514';
  END IF;

  SELECT jsonb_build_object(
    'label', market.label,
    'jurisdiction_type', market.jurisdiction_type,
    'jurisdiction_geoid', market.jurisdiction_geoid,
    'stable_external_id', market.stable_external_id,
    'current_boundary_id', market.current_boundary_id,
    'current_display_geometry_id', market.current_display_geometry_id,
    'center_lat', market.center_lat,
    'center_lng', market.center_lng,
    'bbox_west', market.bbox_west,
    'bbox_south', market.bbox_south,
    'bbox_east', market.bbox_east,
    'bbox_north', market.bbox_north
  ) INTO market_snapshot
  FROM public.markets market
  WHERE market.id = dataset_record.market_id;

  INSERT INTO public.geography_activation_snapshots(dataset_version, market_id, snapshot)
  SELECT requested_dataset_version, dataset_record.market_id, jsonb_build_object(
    'market', market_snapshot,
    'areas', jsonb_agg(jsonb_build_object(
      'id', area.id,
      'label', area.label,
      'type', area.type,
      'postal_code', area.postal_code,
      'city', area.city,
      'county', area.county,
      'state', area.state,
      'center_lat', area.center_lat,
      'center_lng', area.center_lng,
      'bbox_west', area.bbox_west,
      'bbox_south', area.bbox_south,
      'bbox_east', area.bbox_east,
      'bbox_north', area.bbox_north,
      'geojson_path', area.geojson_path,
      'geojson_sha256', area.geojson_sha256,
      'source', area.source,
      'source_version', area.source_version,
      'source_license', area.source_license,
      'source_url', area.source_url,
      'source_retrieval_url', area.source_retrieval_url,
      'source_retrieved_at', area.source_retrieved_at,
      'search_terms', area.search_terms,
      'active', area.active,
      'is_pilot', area.is_pilot,
      'current_geometry_id', area.current_geometry_id
    ) ORDER BY area.id),
    'preexisting_search_terms', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', stored.id,
        'service_area_id', stored.service_area_id,
        'term_normalized', stored.term_normalized,
        'term_kind', stored.term_kind,
        'source', stored.source,
        'reviewed_at', stored.reviewed_at,
        'created_at', stored.created_at
      ) ORDER BY stored.id), '[]'::jsonb)
      FROM activation_areas expected_area
      CROSS JOIN LATERAL jsonb_array_elements_text(expected_area.manifest_area->'searchTerms') term(value)
      JOIN public.service_area_search_terms stored
        ON stored.market_id = dataset_record.market_id
       AND stored.service_area_id = expected_area.service_area_id
       AND stored.term_normalized = term.value COLLATE "C"
    ),
    'preexisting_relationships', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'parent_service_area_id', stored.parent_service_area_id,
        'child_service_area_id', stored.child_service_area_id,
        'relation_type', stored.relation_type,
        'source', stored.source,
        'reviewed_at', stored.reviewed_at,
        'created_at', stored.created_at,
        'updated_at', stored.updated_at
      ) ORDER BY stored.parent_service_area_id, stored.child_service_area_id, stored.relation_type), '[]'::jsonb)
      FROM jsonb_array_elements(dataset_record.relationships->'relationships') relationship(value)
      JOIN activation_areas parent
        ON parent.stable_external_id = relationship.value->>'parentStableExternalId'
      JOIN activation_areas child
        ON child.stable_external_id = relationship.value->>'childStableExternalId'
      JOIN public.service_area_relationships stored
        ON stored.parent_service_area_id = parent.service_area_id
       AND stored.child_service_area_id = child.service_area_id
       AND stored.relation_type = (relationship.value->>'relationType')::public."ServiceAreaRelationType"
    )
  )
  FROM activation_areas activation
  JOIN public.service_areas area ON area.id = activation.service_area_id;

  SELECT public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(
    public.ST_GeomFromGeoJSON(boundary.geojson::text)
  ), 3)) INTO boundary_geometry
  FROM public.market_boundary_versions boundary
  WHERE boundary.id = dataset_record.market_boundary_version_id
    AND boundary.market_id = dataset_record.market_id;
  IF boundary_geometry IS NULL OR public.ST_IsEmpty(boundary_geometry) THEN
    RAISE EXCEPTION 'Approved County boundary is missing or empty.' USING ERRCODE = '23514';
  END IF;
  center_point := public.ST_PointOnSurface(boundary_geometry);

  UPDATE public.markets SET
    label = 'Los Angeles County',
    jurisdiction_type = 'county',
    jurisdiction_geoid = '06037',
    stable_external_id = 'urn:census:county:06037',
    current_boundary_id = dataset_record.market_boundary_version_id,
    current_display_geometry_id = dataset_record.market_display_geometry_version_id,
    center_lat = public.ST_Y(center_point),
    center_lng = public.ST_X(center_point),
    bbox_west = public.ST_XMin(public.Box3D(boundary_geometry)),
    bbox_south = public.ST_YMin(public.Box3D(boundary_geometry)),
    bbox_east = public.ST_XMax(public.Box3D(boundary_geometry)),
    bbox_north = public.ST_YMax(public.Box3D(boundary_geometry)),
    updated_at = now()
  WHERE id = dataset_record.market_id;

  UPDATE public.service_areas area SET
    label = activation.manifest_area->>'label',
    type = activation.manifest_area->>'type',
    postal_code = nullif(activation.manifest_area->>'postalCode', ''),
    city = nullif(activation.manifest_area->>'city', ''),
    county = activation.manifest_area->>'county',
    state = activation.manifest_area->>'state',
    center_lat = activation.center_lat,
    center_lng = activation.center_lng,
    bbox_west = activation.bbox_west,
    bbox_south = activation.bbox_south,
    bbox_east = activation.bbox_east,
    bbox_north = activation.bbox_north,
    geojson_path = '/api/service-areas/' || (activation.manifest_area->>'slug') || '/geometry',
    geojson_sha256 = activation.geometry_sha256,
    source = activation.manifest_area#>>'{source,id}',
    source_version = activation.manifest_area#>>'{source,sourceVersion}',
    source_license = activation.manifest_area#>>'{source,license}',
    source_url = activation.manifest_area#>>'{source,sourceUrl}',
    source_retrieval_url = activation.manifest_area#>>'{source,retrievalUrl}',
    source_retrieved_at = (activation.manifest_area#>>'{source,retrievalDate}')::date,
    search_terms = ARRAY(SELECT jsonb_array_elements_text(activation.manifest_area->'searchTerms')),
    stable_external_id = coalesce(area.stable_external_id, activation.stable_external_id),
    current_geometry_id = activation.geometry_version_id,
    active = area.active OR activation.approved_active,
    is_pilot = false,
    updated_at = now()
  FROM activation_areas activation
  WHERE area.id = activation.service_area_id;

  INSERT INTO public.service_area_search_terms(
    market_id, service_area_id, term_normalized, term_kind, source, reviewed_at
  )
  SELECT dataset_record.market_id,
         activation.service_area_id,
         term.value COLLATE "C",
         'DATASET_REVIEWED_ALIAS',
         requested_dataset_version,
         (dataset_record.manifest#>>'{relationshipPolicy,reviewedAt}')::timestamptz
  FROM activation_areas activation
  CROSS JOIN LATERAL jsonb_array_elements_text(activation.manifest_area->'searchTerms') term(value)
  ON CONFLICT (market_id, term_normalized, service_area_id) DO NOTHING;

  INSERT INTO public.service_area_relationships(
    parent_service_area_id, child_service_area_id, relation_type, source, reviewed_at
  )
  SELECT parent.service_area_id,
         child.service_area_id,
         (relationship.value->>'relationType')::public."ServiceAreaRelationType",
         requested_dataset_version,
         (relationship.value->>'reviewedAt')::timestamptz
  FROM jsonb_array_elements(dataset_record.relationships->'relationships') relationship(value)
  JOIN activation_areas parent ON parent.stable_external_id = relationship.value->>'parentStableExternalId'
  JOIN activation_areas child ON child.stable_external_id = relationship.value->>'childStableExternalId'
  ON CONFLICT (parent_service_area_id, child_service_area_id, relation_type) DO NOTHING;

  SET CONSTRAINTS ALL IMMEDIATE;

  IF (SELECT count(*) FROM public.service_areas WHERE market_id = dataset_record.market_id AND active AND type = 'city') <> 88
    OR (SELECT count(*) FROM public.service_areas WHERE market_id = dataset_record.market_id AND active AND type = 'zip') <> 304
    OR (SELECT count(*) FROM public.service_areas WHERE market_id = dataset_record.market_id AND active AND type = 'neighborhood') <> 3
    OR (SELECT count(*) FROM public.service_areas WHERE market_id = dataset_record.market_id AND current_geometry_id IS NOT NULL) <> 661
    OR EXISTS (
      SELECT 1 FROM public.service_areas area
      JOIN public.markets market ON market.id = area.market_id
      WHERE area.market_id = dataset_record.market_id AND area.active
        AND (area.bbox_west < market.bbox_west OR area.bbox_south < market.bbox_south
          OR area.bbox_east > market.bbox_east OR area.bbox_north > market.bbox_north)
    )
    OR EXISTS (
      SELECT 1
      FROM activation_areas activation
      CROSS JOIN LATERAL jsonb_array_elements_text(activation.manifest_area->'searchTerms') term(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.service_area_search_terms search_term
        WHERE search_term.market_id = dataset_record.market_id
          AND search_term.service_area_id = activation.service_area_id
          AND search_term.term_normalized = term.value COLLATE "C"
      )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(dataset_record.relationships->'relationships') relationship(value)
      JOIN activation_areas parent ON parent.stable_external_id = relationship.value->>'parentStableExternalId'
      JOIN activation_areas child ON child.stable_external_id = relationship.value->>'childStableExternalId'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.service_area_relationships stored
        WHERE stored.parent_service_area_id = parent.service_area_id
          AND stored.child_service_area_id = child.service_area_id
          AND stored.relation_type = (relationship.value->>'relationType')::public."ServiceAreaRelationType"
          AND stored.reviewed_at IS NOT NULL
      )
    ) THEN
    RAISE EXCEPTION 'LA County activation postconditions failed.' USING ERRCODE = '23514';
  END IF;
  PERFORM geography_admin.assert_la_county_activation_current(dataset_record.id);

  RETURN jsonb_build_object(
    'datasetVersion', requested_dataset_version,
    'activeCities', 88,
    'activeZctas', 304,
    'preservedActiveNeighborhoods', 3,
    'currentGeometryPointers', 661,
    'marketBoundaryVersionId', dataset_record.market_boundary_version_id,
    'marketDisplayGeometryVersionId', dataset_record.market_display_geometry_version_id,
    'idempotent', false
  );
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.activate_service_area_dataset(text, text, text)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.rollback_service_area_dataset(requested_dataset_version text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  dataset_record public.geography_dataset_versions%ROWTYPE;
  market_state jsonb;
  snapshot_record public.geography_activation_snapshots%ROWTYPE;
BEGIN
  IF requested_dataset_version <> 'la-county-06037-2026-07-12-v2' THEN
    RAISE EXCEPTION 'Rollback requires the exact activated LA County v2 dataset.' USING ERRCODE = '23514';
  END IF;
  SELECT snapshot.* INTO snapshot_record
  FROM public.geography_activation_snapshots snapshot
  WHERE snapshot.dataset_version = requested_dataset_version
  FOR UPDATE;
  IF snapshot_record.id IS NULL OR snapshot_record.rolled_back_at IS NOT NULL THEN
    RAISE EXCEPTION 'An active rollback snapshot is not available.' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.markets WHERE id = snapshot_record.market_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('service-area-activation:' || snapshot_record.market_id::text, 0));
  SELECT dataset.* INTO dataset_record
  FROM public.geography_dataset_versions dataset
  WHERE dataset.dataset_version = requested_dataset_version
    AND dataset.market_id = snapshot_record.market_id;
  IF dataset_record.id IS NULL OR EXISTS (
    SELECT 1 FROM public.geography_activation_snapshots newer
    WHERE newer.market_id = snapshot_record.market_id
      AND newer.activated_at > snapshot_record.activated_at
      AND newer.rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Rollback is blocked by missing or newer live geography state.' USING ERRCODE = '23514';
  END IF;
  PERFORM geography_admin.assert_la_county_activation_current(dataset_record.id);
  IF EXISTS (
    SELECT 1
    FROM public."BuyerProfile" buyer
    JOIN public.buyer_desired_service_areas desired
      ON desired.buyer_profile_id = buyer.id
     AND desired.source = 'SELECTED'
     AND desired.is_primary = true
    JOIN public.service_areas area ON area.id = desired.service_area_id
    JOIN jsonb_to_recordset(snapshot_record.snapshot->'areas') AS previous(id uuid, active boolean)
      ON previous.id = area.id
    WHERE buyer."visibilityStatus" = 'ACTIVE'
      AND area.active = true
      AND previous.active = false
  ) THEN
    RAISE EXCEPTION 'Rollback would deactivate an ACTIVE buyer primary service area.' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.service_area_relationships relationship
  USING public.service_areas parent, public.service_areas child
  WHERE parent.id = relationship.parent_service_area_id
    AND child.id = relationship.child_service_area_id
    AND parent.market_id = snapshot_record.market_id
    AND child.market_id = snapshot_record.market_id
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(dataset_record.relationships->'relationships') expected(value)
      WHERE expected.value->>'parentStableExternalId' = parent.stable_external_id
        AND expected.value->>'childStableExternalId' = child.stable_external_id
        AND (expected.value->>'relationType')::public."ServiceAreaRelationType" = relationship.relation_type
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(
        snapshot_record.snapshot->'preexisting_relationships', '[]'::jsonb
      )) previous(value)
      WHERE previous.value->>'parent_service_area_id' = parent.id::text
        AND previous.value->>'child_service_area_id' = child.id::text
        AND previous.value->>'relation_type' = relationship.relation_type::text
    );
  DELETE FROM public.service_area_search_terms search_term
  USING public.service_areas area
  WHERE area.id = search_term.service_area_id
    AND area.market_id = snapshot_record.market_id
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
      CROSS JOIN LATERAL jsonb_array_elements_text(manifest_area->'searchTerms') term(value)
      WHERE manifest_area->>'slug' = area.slug
        AND term.value = search_term.term_normalized
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(
        snapshot_record.snapshot->'preexisting_search_terms', '[]'::jsonb
      )) previous(value)
      WHERE previous.value->>'service_area_id' = area.id::text
        AND previous.value->>'term_normalized' = search_term.term_normalized
    );

  UPDATE public.service_areas area SET
    label = previous.label,
    type = previous.type,
    postal_code = previous.postal_code,
    city = previous.city,
    county = previous.county,
    state = previous.state,
    center_lat = previous.center_lat,
    center_lng = previous.center_lng,
    bbox_west = previous.bbox_west,
    bbox_south = previous.bbox_south,
    bbox_east = previous.bbox_east,
    bbox_north = previous.bbox_north,
    geojson_path = previous.geojson_path,
    geojson_sha256 = previous.geojson_sha256,
    source = previous.source,
    source_version = previous.source_version,
    source_license = previous.source_license,
    source_url = previous.source_url,
    source_retrieval_url = previous.source_retrieval_url,
    source_retrieved_at = previous.source_retrieved_at,
    search_terms = previous.search_terms,
    active = previous.active,
    is_pilot = previous.is_pilot,
    current_geometry_id = previous.current_geometry_id,
    updated_at = now()
  FROM jsonb_to_recordset(snapshot_record.snapshot->'areas') AS previous(
    id uuid,
    label text,
    type text,
    postal_code text,
    city text,
    county text,
    state text,
    center_lat double precision,
    center_lng double precision,
    bbox_west double precision,
    bbox_south double precision,
    bbox_east double precision,
    bbox_north double precision,
    geojson_path text,
    geojson_sha256 text,
    source text,
    source_version text,
    source_license text,
    source_url text,
    source_retrieval_url text,
    source_retrieved_at date,
    search_terms text[],
    active boolean,
    is_pilot boolean,
    current_geometry_id uuid
  )
  WHERE area.id = previous.id;

  market_state := snapshot_record.snapshot->'market';
  UPDATE public.markets SET
    label = market_state->>'label',
    current_boundary_id = nullif(market_state->>'current_boundary_id', '')::uuid,
    current_display_geometry_id = nullif(market_state->>'current_display_geometry_id', '')::uuid,
    center_lat = (market_state->>'center_lat')::double precision,
    center_lng = (market_state->>'center_lng')::double precision,
    bbox_west = (market_state->>'bbox_west')::double precision,
    bbox_south = (market_state->>'bbox_south')::double precision,
    bbox_east = (market_state->>'bbox_east')::double precision,
    bbox_north = (market_state->>'bbox_north')::double precision,
    updated_at = now()
  WHERE id = snapshot_record.market_id;

  SET CONSTRAINTS ALL IMMEDIATE;
  IF EXISTS (
    SELECT 1 FROM public."BuyerProfile" buyer
    WHERE buyer."visibilityStatus" = 'ACTIVE'
      AND 1 <> (
        SELECT count(*)
        FROM public.buyer_desired_service_areas desired
        JOIN public.service_areas area ON area.id = desired.service_area_id
        JOIN public.markets market ON market.id = area.market_id
        WHERE desired.buyer_profile_id = buyer.id
          AND desired.source = 'SELECTED'
          AND desired.is_primary = true
          AND area.active = true
          AND market.active = true
      )
  ) THEN
    RAISE EXCEPTION 'LA County rollback left an invalid ACTIVE buyer profile.' USING ERRCODE = '23514';
  END IF;
  UPDATE public.geography_activation_snapshots SET rolled_back_at = now()
  WHERE id = snapshot_record.id;

  IF (SELECT count(*) FROM public.service_areas area WHERE area.market_id = snapshot_record.market_id AND area.active)
      <> (SELECT count(*) FROM jsonb_to_recordset(snapshot_record.snapshot->'areas') AS previous(id uuid, active boolean) WHERE previous.active)
    OR (SELECT current_boundary_id FROM public.markets WHERE id = snapshot_record.market_id)
      IS DISTINCT FROM nullif(market_state->>'current_boundary_id', '')::uuid
    OR (SELECT current_display_geometry_id FROM public.markets WHERE id = snapshot_record.market_id)
      IS DISTINCT FROM nullif(market_state->>'current_display_geometry_id', '')::uuid
    OR EXISTS (
      SELECT 1 FROM public.service_area_search_terms
      WHERE source = requested_dataset_version
    )
    OR EXISTS (
      SELECT 1 FROM public.service_area_relationships
      WHERE source = requested_dataset_version
    ) THEN
    RAISE EXCEPTION 'LA County rollback postconditions failed.' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'datasetVersion', requested_dataset_version,
    'rolledBack', true,
    'stableSourceIdsRetained', true
  );
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.rollback_service_area_dataset(text)
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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.service_areas area
    JOIN public.markets market ON market.id = area.market_id
    WHERE area.active = true
      AND (area.bbox_west < market.bbox_west OR area.bbox_south < market.bbox_south
        OR area.bbox_east > market.bbox_east OR area.bbox_north > market.bbox_north)
  ) THEN
    RAISE EXCEPTION 'An active service area is outside its market bounds.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.service_area_search_terms term
    JOIN public.service_areas area ON area.id = term.service_area_id
    WHERE area.market_id <> term.market_id
  ) THEN
    RAISE EXCEPTION 'A service-area search term crosses market ownership.' USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMIT;
