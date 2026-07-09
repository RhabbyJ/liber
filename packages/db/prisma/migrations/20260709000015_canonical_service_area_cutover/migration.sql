BEGIN;

-- Freeze the profile -> selection write order before taking legacy snapshots.
LOCK TABLE public."BuyerProfile" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.buyer_desired_service_areas IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.markets
ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.markets
ADD CONSTRAINT markets_slug_key UNIQUE (slug);

ALTER TABLE public.service_areas
DROP CONSTRAINT service_areas_market_slug_fkey;

ALTER TABLE public.markets DROP CONSTRAINT markets_pkey;
ALTER TABLE public.markets ADD CONSTRAINT markets_pkey PRIMARY KEY (id);

ALTER TABLE public.service_areas
ADD COLUMN market_id uuid,
ADD COLUMN source_license text,
ADD COLUMN source_url text,
ADD COLUMN geojson_sha256 text;

ALTER TABLE public.service_areas
ALTER COLUMN state DROP DEFAULT,
ALTER COLUMN active SET DEFAULT false,
ALTER COLUMN is_pilot SET DEFAULT false,
ADD CONSTRAINT service_areas_center_lat_check CHECK (center_lat BETWEEN -90 AND 90),
ADD CONSTRAINT service_areas_center_lng_check CHECK (center_lng BETWEEN -180 AND 180),
ADD CONSTRAINT service_areas_slug_check CHECK (slug ~ '^[a-z0-9-]{1,80}$'),
ADD CONSTRAINT service_areas_label_check CHECK (btrim(label) <> ''),
ADD CONSTRAINT service_areas_state_check CHECK (state ~ '^[A-Z]{2}$'),
ADD CONSTRAINT service_areas_source_check CHECK (btrim(source) <> ''),
ADD CONSTRAINT service_areas_source_version_check CHECK (btrim(source_version) <> ''),
ADD CONSTRAINT service_areas_geojson_path_check CHECK (btrim(geojson_path) <> ''),
ADD CONSTRAINT service_areas_zip_postal_code_check CHECK (
  type <> 'zip' OR (postal_code IS NOT NULL AND postal_code ~ '^[0-9]{5}$')
),
ADD CONSTRAINT service_areas_geojson_sha256_check CHECK (
  geojson_sha256 IS NULL OR geojson_sha256 ~ '^[a-f0-9]{64}$'
),
ADD CONSTRAINT service_areas_center_within_bbox_check CHECK (
  center_lng BETWEEN bbox_west AND bbox_east
  AND center_lat BETWEEN bbox_south AND bbox_north
),
ADD CONSTRAINT service_areas_bbox_lat_check CHECK (
  bbox_south BETWEEN -90 AND 90
  AND bbox_north BETWEEN -90 AND 90
  AND bbox_south < bbox_north
),
ADD CONSTRAINT service_areas_bbox_lng_check CHECK (
  bbox_west BETWEEN -180 AND 180
  AND bbox_east BETWEEN -180 AND 180
  AND bbox_west < bbox_east
);

UPDATE public.service_areas service_area
SET market_id = market.id
FROM public.markets market
WHERE market.slug = service_area.market_slug;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.service_areas service_area
    JOIN public.markets market ON market.id = service_area.market_id
    WHERE upper(trim(service_area.state)) <> upper(trim(market.state))
  ) THEN
    RAISE EXCEPTION 'Canonical service-area state must match its market state.';
  END IF;
END;
$$;

ALTER TABLE public.service_areas
ALTER COLUMN market_id SET NOT NULL,
ADD CONSTRAINT service_areas_market_id_fkey
  FOREIGN KEY (market_id) REFERENCES public.markets(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT service_areas_market_id_slug_key UNIQUE (market_id, slug),
ADD CONSTRAINT service_areas_market_id_postal_code_key UNIQUE (market_id, postal_code);

CREATE TABLE public.service_area_migration_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_profile_id text NOT NULL UNIQUE,
  reason text NOT NULL,
  candidate_service_area_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  legacy_location jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_area_migration_quarantine_reason_check CHECK (
    reason IN (
      'MULTIPLE_SELECTED_AREAS',
      'AMBIGUOUS_LEGACY_LOCATION',
      'MIGRATED_REVIEW_REQUIRED',
      'UNRESOLVED_LEGACY_LOCATION'
    )
  ),
  CONSTRAINT service_area_migration_quarantine_candidates_check CHECK (
    jsonb_typeof(candidate_service_area_ids) = 'array'
  ),
  CONSTRAINT service_area_migration_quarantine_legacy_location_check CHECK (
    jsonb_typeof(legacy_location) = 'object'
  ),
  CONSTRAINT service_area_migration_quarantine_resolution_check CHECK (
    (resolved_at IS NULL AND resolution IS NULL)
    OR (
      resolved_at IS NOT NULL
      AND resolution IS NOT NULL
      AND jsonb_typeof(resolution) = 'object'
      AND resolution ?& ARRAY['actorUserId', 'serviceAreaId', 'source']
      AND jsonb_typeof(resolution->'actorUserId') = 'string'
      AND jsonb_typeof(resolution->'serviceAreaId') = 'string'
      AND jsonb_typeof(resolution->'source') = 'string'
    )
  ),
  CONSTRAINT service_area_migration_quarantine_buyer_profile_id_fkey
    FOREIGN KEY (buyer_profile_id)
    REFERENCES public."BuyerProfile"(id)
    ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE INDEX service_area_migration_quarantine_reason_resolved_at_idx
ON public.service_area_migration_quarantine(reason, resolved_at);

ALTER TABLE public.service_area_migration_quarantine ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_area_migration_quarantine FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.service_area_migration_quarantine TO service_role;

ALTER TABLE public.buyer_desired_service_areas
ADD COLUMN service_area_id uuid,
ADD COLUMN is_primary boolean NOT NULL DEFAULT true;

UPDATE public.buyer_desired_service_areas buyer_area
SET service_area_id = service_area.id
FROM public.service_areas service_area
WHERE service_area.slug = buyer_area.service_area_slug;

CREATE TEMP TABLE legacy_buyer_location_snapshots ON COMMIT DROP AS
SELECT
  buyer_profile.id AS buyer_profile_id,
  jsonb_build_object(
    'desiredPostalCode', buyer_profile."desiredPostalCode",
    'desiredNeighborhood', buyer_profile."desiredNeighborhood",
    'desiredCity', buyer_profile."desiredCity",
    'desiredState', buyer_profile."desiredState",
    'desiredLat', buyer_profile."desiredLat",
    'desiredLng', buyer_profile."desiredLng",
    'desiredLocationText', buyer_profile."desiredLocationText",
    'legacyCountryContract', 'US_STATE_CODE'
  ) AS legacy_location
FROM public."BuyerProfile" buyer_profile;

CREATE UNIQUE INDEX legacy_buyer_location_snapshots_profile_idx
ON legacy_buyer_location_snapshots(buyer_profile_id);

INSERT INTO public.service_area_migration_quarantine (
  buyer_profile_id,
  reason,
  candidate_service_area_ids,
  legacy_location
)
SELECT
  buyer_area.buyer_profile_id,
  'MULTIPLE_SELECTED_AREAS',
  jsonb_agg(DISTINCT buyer_area.service_area_id ORDER BY buyer_area.service_area_id),
  snapshot.legacy_location
FROM public.buyer_desired_service_areas buyer_area
JOIN public."BuyerProfile" buyer_profile ON buyer_profile.id = buyer_area.buyer_profile_id
JOIN legacy_buyer_location_snapshots snapshot ON snapshot.buyer_profile_id = buyer_area.buyer_profile_id
WHERE buyer_area.source = 'SELECTED'
GROUP BY buyer_area.buyer_profile_id, buyer_profile.id, snapshot.legacy_location
HAVING count(*) > 1
ON CONFLICT (buyer_profile_id) DO UPDATE
SET
  reason = EXCLUDED.reason,
  candidate_service_area_ids = EXCLUDED.candidate_service_area_ids,
  legacy_location = EXCLUDED.legacy_location,
  resolved_at = NULL,
  updated_at = now();

DELETE FROM public.buyer_desired_service_areas buyer_area
USING public.service_area_migration_quarantine quarantine
WHERE quarantine.buyer_profile_id = buyer_area.buyer_profile_id;

DELETE FROM public.buyer_desired_service_areas
WHERE source IN ('DERIVED', 'MIGRATED');

CREATE TEMP TABLE canonical_service_area_candidates ON COMMIT DROP AS
SELECT
  buyer_profile.id AS buyer_profile_id,
  service_area.id AS service_area_id,
  1 AS priority,
  'ZIP'::text AS match_kind
FROM public."BuyerProfile" buyer_profile
JOIN public.service_areas service_area
  ON service_area.type = 'zip'
  AND buyer_profile."desiredPostalCode" IS NOT NULL
  AND buyer_profile."desiredPostalCode" = service_area.postal_code
  AND buyer_profile."desiredState" IS NOT NULL
  AND upper(trim(buyer_profile."desiredState")) = upper(trim(service_area.state))
JOIN public.markets market
  ON market.id = service_area.market_id
  AND market.country = 'US'
WHERE service_area.active = true AND market.active = true
UNION ALL
SELECT buyer_profile.id, service_area.id, 2, 'NEIGHBORHOOD'
FROM public."BuyerProfile" buyer_profile
JOIN public.service_areas service_area
  ON service_area.type = 'neighborhood'
  AND buyer_profile."desiredNeighborhood" IS NOT NULL
  AND lower(trim(buyer_profile."desiredNeighborhood")) = lower(trim(service_area.label))
  AND buyer_profile."desiredState" IS NOT NULL
  AND upper(trim(buyer_profile."desiredState")) = upper(trim(service_area.state))
JOIN public.markets market
  ON market.id = service_area.market_id
  AND market.country = 'US'
WHERE service_area.active = true AND market.active = true
UNION ALL
SELECT buyer_profile.id, service_area.id, 3, 'CITY'
FROM public."BuyerProfile" buyer_profile
JOIN public.service_areas service_area
  ON service_area.type = 'city'
  AND buyer_profile."desiredCity" IS NOT NULL
  AND lower(trim(buyer_profile."desiredCity")) = lower(trim(coalesce(service_area.city, service_area.label)))
  AND buyer_profile."desiredState" IS NOT NULL
  AND upper(trim(buyer_profile."desiredState")) = upper(trim(service_area.state))
JOIN public.markets market
  ON market.id = service_area.market_id
  AND market.country = 'US'
WHERE service_area.active = true AND market.active = true;

CREATE INDEX canonical_service_area_candidates_profile_priority_idx
ON canonical_service_area_candidates(buyer_profile_id, priority, service_area_id);

CREATE TEMP TABLE canonical_best_priorities ON COMMIT DROP AS
SELECT buyer_profile_id, min(priority) AS priority
FROM canonical_service_area_candidates
GROUP BY buyer_profile_id;

CREATE UNIQUE INDEX canonical_best_priorities_profile_idx
ON canonical_best_priorities(buyer_profile_id);

CREATE TEMP TABLE canonical_best_candidates ON COMMIT DROP AS
SELECT candidate.buyer_profile_id, candidate.service_area_id, candidate.priority, candidate.match_kind
FROM canonical_service_area_candidates candidate
JOIN canonical_best_priorities best
  ON best.buyer_profile_id = candidate.buyer_profile_id
  AND best.priority = candidate.priority;

CREATE INDEX canonical_best_candidates_profile_idx
ON canonical_best_candidates(buyer_profile_id, service_area_id);

INSERT INTO public.service_area_migration_quarantine (
  buyer_profile_id,
  reason,
  candidate_service_area_ids,
  legacy_location
)
SELECT
  candidate.buyer_profile_id,
  'AMBIGUOUS_LEGACY_LOCATION',
  jsonb_agg(DISTINCT candidate.service_area_id ORDER BY candidate.service_area_id),
  snapshot.legacy_location
FROM canonical_best_candidates candidate
JOIN legacy_buyer_location_snapshots snapshot ON snapshot.buyer_profile_id = candidate.buyer_profile_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.buyer_desired_service_areas selected
  WHERE selected.buyer_profile_id = candidate.buyer_profile_id
    AND selected.source = 'SELECTED'
)
  AND NOT EXISTS (
    SELECT 1
    FROM public.service_area_migration_quarantine quarantine
    WHERE quarantine.buyer_profile_id = candidate.buyer_profile_id
      AND quarantine.resolved_at IS NULL
  )
GROUP BY candidate.buyer_profile_id, snapshot.legacy_location
HAVING count(DISTINCT candidate.service_area_id) > 1
ON CONFLICT (buyer_profile_id) DO UPDATE
SET
  reason = EXCLUDED.reason,
  candidate_service_area_ids = EXCLUDED.candidate_service_area_ids,
  legacy_location = EXCLUDED.legacy_location,
  resolved_at = NULL,
  updated_at = now();

INSERT INTO public.service_area_migration_quarantine (
  buyer_profile_id,
  reason,
  candidate_service_area_ids,
  legacy_location
)
SELECT
  candidate.buyer_profile_id,
  'MIGRATED_REVIEW_REQUIRED',
  jsonb_agg(DISTINCT candidate.service_area_id ORDER BY candidate.service_area_id),
  snapshot.legacy_location
FROM canonical_best_candidates candidate
JOIN legacy_buyer_location_snapshots snapshot ON snapshot.buyer_profile_id = candidate.buyer_profile_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.buyer_desired_service_areas selected
  WHERE selected.buyer_profile_id = candidate.buyer_profile_id
    AND selected.source = 'SELECTED'
)
  AND NOT EXISTS (
    SELECT 1
    FROM public.service_area_migration_quarantine quarantine
    WHERE quarantine.buyer_profile_id = candidate.buyer_profile_id
      AND quarantine.resolved_at IS NULL
  )
GROUP BY candidate.buyer_profile_id, snapshot.legacy_location
HAVING count(DISTINCT candidate.service_area_id) = 1
ON CONFLICT (buyer_profile_id) DO UPDATE
SET
  reason = EXCLUDED.reason,
  candidate_service_area_ids = EXCLUDED.candidate_service_area_ids,
  legacy_location = EXCLUDED.legacy_location,
  resolved_at = NULL,
  updated_at = now();

INSERT INTO public.service_area_migration_quarantine (
  buyer_profile_id,
  reason,
  candidate_service_area_ids,
  legacy_location
)
SELECT
  buyer_profile.id,
  'UNRESOLVED_LEGACY_LOCATION',
  '[]'::jsonb,
  snapshot.legacy_location
FROM public."BuyerProfile" buyer_profile
JOIN legacy_buyer_location_snapshots snapshot ON snapshot.buyer_profile_id = buyer_profile.id
WHERE NOT EXISTS (
    SELECT 1
    FROM public.buyer_desired_service_areas selected
    WHERE selected.buyer_profile_id = buyer_profile.id
      AND selected.source = 'SELECTED'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM canonical_best_candidates candidate
    WHERE candidate.buyer_profile_id = buyer_profile.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.service_area_migration_quarantine quarantine
    WHERE quarantine.buyer_profile_id = buyer_profile.id
      AND quarantine.resolved_at IS NULL
  )
  AND (
    buyer_profile."visibilityStatus" = 'ACTIVE'
    OR buyer_profile."desiredPostalCode" IS NOT NULL
    OR buyer_profile."desiredNeighborhood" IS NOT NULL
    OR buyer_profile."desiredCity" IS NOT NULL
    OR buyer_profile."desiredState" IS NOT NULL
    OR buyer_profile."desiredLat" IS NOT NULL
    OR buyer_profile."desiredLng" IS NOT NULL
    OR buyer_profile."desiredLocationText" IS NOT NULL
  )
ON CONFLICT (buyer_profile_id) DO UPDATE
SET
  reason = EXCLUDED.reason,
  candidate_service_area_ids = EXCLUDED.candidate_service_area_ids,
  legacy_location = EXCLUDED.legacy_location,
  resolved_at = NULL,
  updated_at = now();

UPDATE public."BuyerProfile" buyer_profile
SET
  "desiredLocationText" = CASE
    WHEN service_area.type = 'zip' AND service_area.city IS NOT NULL
      THEN service_area.city || ', ' || service_area.state || ' ' || service_area.postal_code
    ELSE service_area.label || ', ' || service_area.state
  END,
  "desiredCity" = CASE
    WHEN service_area.type = 'neighborhood' THEN service_area.label
    ELSE coalesce(service_area.city, service_area.label)
  END,
  "desiredNeighborhood" = CASE WHEN service_area.type = 'neighborhood' THEN service_area.label ELSE NULL END,
  "desiredPostalCode" = service_area.postal_code,
  "desiredState" = service_area.state,
  "desiredLat" = service_area.center_lat,
  "desiredLng" = service_area.center_lng
FROM public.buyer_desired_service_areas buyer_area
JOIN public.service_areas service_area ON service_area.id = buyer_area.service_area_id
WHERE buyer_area.buyer_profile_id = buyer_profile.id
  AND buyer_area.is_primary = true;

UPDATE public."BuyerProfile" buyer_profile
SET "visibilityStatus" = 'DRAFT'
WHERE buyer_profile."visibilityStatus" = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM public.buyer_desired_service_areas buyer_area
    JOIN public.service_areas service_area ON service_area.id = buyer_area.service_area_id
    JOIN public.markets market ON market.id = service_area.market_id
    WHERE buyer_area.buyer_profile_id = buyer_profile.id
      AND buyer_area.source = 'SELECTED'
      AND buyer_area.is_primary = true
      AND service_area.active = true
      AND market.active = true
  );

DROP INDEX IF EXISTS public."BuyerProfile_desiredCity_desiredState_idx";
DROP INDEX IF EXISTS public."BuyerProfile_desiredPostalCode_idx";
DROP INDEX IF EXISTS public."BuyerProfile_desiredNeighborhood_idx";
DROP INDEX IF EXISTS public."BuyerProfile_active_desiredPostalCode_idx";
DROP INDEX IF EXISTS public."BuyerProfile_active_desiredNeighborhood_idx";
DROP INDEX IF EXISTS public."BuyerProfile_active_desiredCityState_idx";

DROP INDEX IF EXISTS public.buyer_desired_service_areas_service_area_slug_idx;
DROP INDEX IF EXISTS public.buyer_desired_service_areas_buyer_profile_id_idx;

ALTER TABLE public.buyer_desired_service_areas
ALTER COLUMN service_area_id SET NOT NULL,
DROP CONSTRAINT buyer_desired_service_areas_pkey,
DROP CONSTRAINT buyer_desired_service_areas_buyer_profile_id_fkey,
DROP CONSTRAINT buyer_desired_service_areas_service_area_slug_fkey,
DROP COLUMN service_area_slug,
ADD CONSTRAINT buyer_desired_service_areas_pkey PRIMARY KEY (buyer_profile_id, service_area_id),
ADD CONSTRAINT buyer_desired_service_areas_buyer_profile_id_key UNIQUE (buyer_profile_id),
ADD CONSTRAINT buyer_desired_service_areas_buyer_profile_id_fkey
  FOREIGN KEY (buyer_profile_id) REFERENCES public."BuyerProfile"(id)
  ON DELETE CASCADE ON UPDATE RESTRICT,
ADD CONSTRAINT buyer_desired_service_areas_service_area_id_fkey
  FOREIGN KEY (service_area_id) REFERENCES public.service_areas(id)
  ON DELETE CASCADE ON UPDATE RESTRICT,
ADD CONSTRAINT buyer_desired_service_areas_selected_source_check CHECK (source = 'SELECTED'),
ADD CONSTRAINT buyer_desired_service_areas_primary_check CHECK (is_primary = true);

CREATE INDEX buyer_desired_service_areas_service_area_id_buyer_profile_id_idx
ON public.buyer_desired_service_areas(service_area_id, buyer_profile_id);

DROP POLICY "Service area relationships are public metadata"
ON public.service_area_relationships;

INSERT INTO public.service_area_relationships (
  parent_service_area_slug,
  child_service_area_slug,
  relation_type,
  source,
  reviewed_at
)
SELECT
  parent_service_area_slug,
  child_service_area_slug,
  'SEARCH_ROLLUP'::"ServiceAreaRelationType",
  source,
  reviewed_at
FROM public.service_area_relationships
WHERE relation_type = 'DISPLAY_PARENT'
  AND reviewed_at IS NOT NULL
ON CONFLICT (parent_service_area_slug, child_service_area_slug, relation_type) DO NOTHING;

ALTER TABLE public.service_area_relationships
ADD COLUMN parent_service_area_id uuid,
ADD COLUMN child_service_area_id uuid;

UPDATE public.service_area_relationships relationship
SET
  parent_service_area_id = parent.id,
  child_service_area_id = child.id
FROM public.service_areas parent, public.service_areas child
WHERE parent.slug = relationship.parent_service_area_slug
  AND child.slug = relationship.child_service_area_slug;

DROP INDEX IF EXISTS public.service_area_relationships_child_service_area_slug_idx;
DROP INDEX IF EXISTS public.service_area_relationships_parent_service_area_slug_idx;

ALTER TABLE public.service_area_relationships
ALTER COLUMN parent_service_area_id SET NOT NULL,
ALTER COLUMN child_service_area_id SET NOT NULL,
DROP CONSTRAINT service_area_relationships_pkey,
DROP CONSTRAINT service_area_relationships_parent_service_area_slug_fkey,
DROP CONSTRAINT service_area_relationships_child_service_area_slug_fkey,
DROP COLUMN parent_service_area_slug,
DROP COLUMN child_service_area_slug,
ADD CONSTRAINT service_area_relationships_pkey
  PRIMARY KEY (parent_service_area_id, child_service_area_id, relation_type),
ADD CONSTRAINT service_area_relationships_parent_service_area_id_fkey
  FOREIGN KEY (parent_service_area_id) REFERENCES public.service_areas(id)
  ON DELETE CASCADE ON UPDATE RESTRICT,
ADD CONSTRAINT service_area_relationships_child_service_area_id_fkey
  FOREIGN KEY (child_service_area_id) REFERENCES public.service_areas(id)
  ON DELETE CASCADE ON UPDATE RESTRICT,
ADD CONSTRAINT service_area_relationships_distinct_areas_check
  CHECK (parent_service_area_id <> child_service_area_id);

CREATE INDEX service_area_relationships_child_type_reviewed_idx
ON public.service_area_relationships(child_service_area_id, relation_type, reviewed_at);
CREATE INDEX service_area_relationships_parent_type_reviewed_idx
ON public.service_area_relationships(parent_service_area_id, relation_type, reviewed_at);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.service_area_relationships relationship
    JOIN public.service_areas parent ON parent.id = relationship.parent_service_area_id
    JOIN public.service_areas child ON child.id = relationship.child_service_area_id
    WHERE parent.market_id <> child.market_id
  ) THEN
    RAISE EXCEPTION 'Service-area relationships must stay within one market.';
  END IF;

  IF EXISTS (
    WITH RECURSIVE paths(origin_id, service_area_id) AS (
      SELECT relationship.parent_service_area_id, relationship.child_service_area_id
      FROM public.service_area_relationships relationship
      WHERE relationship.relation_type = 'SEARCH_ROLLUP'::public."ServiceAreaRelationType"
        AND relationship.reviewed_at IS NOT NULL
      UNION
      SELECT paths.origin_id, relationship.child_service_area_id
      FROM paths
      JOIN public.service_area_relationships relationship
        ON relationship.parent_service_area_id = paths.service_area_id
      WHERE relationship.relation_type = 'SEARCH_ROLLUP'::public."ServiceAreaRelationType"
        AND relationship.reviewed_at IS NOT NULL
    )
    SELECT 1
    FROM paths
    WHERE origin_id = service_area_id
  ) THEN
    RAISE EXCEPTION 'Reviewed SEARCH_ROLLUP relationships cannot contain cycles.';
  END IF;
END;
$$;

DROP POLICY "Active service areas are public metadata" ON public.service_areas;
CREATE POLICY "Active service areas in active markets are public metadata"
ON public.service_areas
FOR SELECT
TO anon, authenticated
USING (
  active = true
  AND EXISTS (
    SELECT 1
    FROM public.markets market
    WHERE market.id = market_id
      AND market.active = true
  )
);

CREATE POLICY "Reviewed relationships in active markets are public metadata"
ON public.service_area_relationships
FOR SELECT
TO anon, authenticated
USING (
  reviewed_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.service_areas parent
    JOIN public.markets market ON market.id = parent.market_id
    WHERE parent.id = parent_service_area_id
      AND parent.active = true
      AND market.active = true
  )
  AND EXISTS (
    SELECT 1
    FROM public.service_areas child
    WHERE child.id = child_service_area_id
      AND child.active = true
  )
);

DROP INDEX IF EXISTS public.service_areas_market_active_type_idx;

ALTER TABLE public.service_areas
DROP CONSTRAINT service_areas_slug_key,
DROP COLUMN market_slug;

CREATE INDEX service_areas_market_id_active_type_idx
ON public.service_areas(market_id, active, type);

CREATE OR REPLACE FUNCTION app_private.prevent_geography_id_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION '% primary keys are immutable.', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_geography_id_update() FROM PUBLIC;

CREATE TRIGGER markets_immutable_id
BEFORE UPDATE OF id ON public.markets
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_geography_id_update();

CREATE TRIGGER service_areas_immutable_id
BEFORE UPDATE OF id ON public.service_areas
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_geography_id_update();

CREATE OR REPLACE FUNCTION app_private.prevent_service_area_market_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.market_id IS DISTINCT FROM OLD.market_id THEN
    RAISE EXCEPTION 'Service-area market membership is immutable; create a new canonical area instead.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_service_area_market_update() FROM PUBLIC;

CREATE TRIGGER service_areas_immutable_market
BEFORE UPDATE OF market_id ON public.service_areas
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_service_area_market_update();

CREATE OR REPLACE FUNCTION app_private.prevent_market_jurisdiction_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state OR NEW.country IS DISTINCT FROM OLD.country THEN
    RAISE EXCEPTION 'Market jurisdiction is immutable; create a new market instead.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_market_jurisdiction_update() FROM PUBLIC;

CREATE TRIGGER markets_immutable_jurisdiction
BEFORE UPDATE OF state, country ON public.markets
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_market_jurisdiction_update();

CREATE OR REPLACE FUNCTION app_private.enforce_service_area_market_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  market_state text;
BEGIN
  SELECT market.state
  INTO market_state
  FROM public.markets market
  WHERE market.id = NEW.market_id;

  IF market_state IS NULL OR upper(trim(NEW.state)) <> upper(trim(market_state)) THEN
    RAISE EXCEPTION 'Canonical service-area state must match its market state.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_service_area_market_state() FROM PUBLIC;

CREATE TRIGGER service_areas_market_state_check
BEFORE INSERT OR UPDATE OF market_id, state
ON public.service_areas
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_service_area_market_state();

CREATE OR REPLACE FUNCTION app_private.prevent_buyer_service_area_identity_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.buyer_profile_id IS DISTINCT FROM OLD.buyer_profile_id
    OR NEW.service_area_id IS DISTINCT FROM OLD.service_area_id THEN
    RAISE EXCEPTION 'Buyer service-area identity is immutable; delete and recreate the selection.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_buyer_service_area_identity_update() FROM PUBLIC;

CREATE TRIGGER buyer_desired_service_area_immutable_identity
BEFORE UPDATE OF buyer_profile_id, service_area_id
ON public.buyer_desired_service_areas
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_buyer_service_area_identity_update();

CREATE OR REPLACE FUNCTION app_private.preserve_service_area_quarantine_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.buyer_profile_id IS DISTINCT FROM OLD.buyer_profile_id
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.candidate_service_area_ids IS DISTINCT FROM OLD.candidate_service_area_ids
    OR NEW.legacy_location IS DISTINCT FROM OLD.legacy_location
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Geography quarantine evidence is immutable.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.resolved_at IS NOT NULL
    AND (NEW.resolved_at IS DISTINCT FROM OLD.resolved_at OR NEW.resolution IS DISTINCT FROM OLD.resolution) THEN
    RAISE EXCEPTION 'A resolved geography quarantine audit cannot be changed.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.preserve_service_area_quarantine_audit() FROM PUBLIC;

CREATE TRIGGER service_area_quarantine_preserve_audit
BEFORE UPDATE ON public.service_area_migration_quarantine
FOR EACH ROW
EXECUTE FUNCTION app_private.preserve_service_area_quarantine_audit();

CREATE OR REPLACE FUNCTION app_private.enforce_service_area_relationship_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  parent_market_id uuid;
  child_market_id uuid;
BEGIN
  SELECT service_area.market_id INTO parent_market_id
  FROM public.service_areas service_area
  WHERE service_area.id = NEW.parent_service_area_id;

  SELECT service_area.market_id INTO child_market_id
  FROM public.service_areas service_area
  WHERE service_area.id = NEW.child_service_area_id;

  IF parent_market_id IS NULL OR child_market_id IS NULL OR parent_market_id <> child_market_id THEN
    RAISE EXCEPTION 'Service-area relationships must stay within one market.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.relation_type = 'SEARCH_ROLLUP'::public."ServiceAreaRelationType"
    AND NEW.reviewed_at IS NOT NULL THEN
    PERFORM 1
    FROM public.markets market
    WHERE market.id = parent_market_id
    FOR UPDATE;

    IF EXISTS (
      WITH RECURSIVE descendants(id) AS (
        SELECT relationship.child_service_area_id
        FROM public.service_area_relationships relationship
        WHERE relationship.parent_service_area_id = NEW.child_service_area_id
          AND relationship.relation_type = 'SEARCH_ROLLUP'::public."ServiceAreaRelationType"
          AND relationship.reviewed_at IS NOT NULL
        UNION
        SELECT relationship.child_service_area_id
        FROM public.service_area_relationships relationship
        JOIN descendants parent ON parent.id = relationship.parent_service_area_id
        WHERE relationship.relation_type = 'SEARCH_ROLLUP'::public."ServiceAreaRelationType"
          AND relationship.reviewed_at IS NOT NULL
      )
      SELECT 1 FROM descendants WHERE id = NEW.parent_service_area_id
    ) THEN
      RAISE EXCEPTION 'Reviewed SEARCH_ROLLUP relationships cannot contain cycles.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_service_area_relationship_integrity() FROM PUBLIC;

CREATE TRIGGER service_area_relationship_integrity
BEFORE INSERT OR UPDATE
ON public.service_area_relationships
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_service_area_relationship_integrity();

CREATE OR REPLACE FUNCTION app_private.prevent_service_area_relationship_identity_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.parent_service_area_id IS DISTINCT FROM OLD.parent_service_area_id
    OR NEW.child_service_area_id IS DISTINCT FROM OLD.child_service_area_id
    OR NEW.relation_type IS DISTINCT FROM OLD.relation_type THEN
    RAISE EXCEPTION 'Service-area relationship identity is immutable; delete and recreate the relationship.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_service_area_relationship_identity_update() FROM PUBLIC;

CREATE TRIGGER service_area_relationship_immutable_identity
BEFORE UPDATE OF parent_service_area_id, child_service_area_id, relation_type
ON public.service_area_relationships
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_service_area_relationship_identity_update();

CREATE OR REPLACE FUNCTION app_private.enforce_active_buyer_primary_service_area()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  profile_id text;
  profile_status public."BuyerVisibilityStatus";
  selected_service_area_id uuid;
  selected_market_id uuid;
  selected_service_area_active boolean;
  selected_market_active boolean;
BEGIN
  IF TG_TABLE_NAME = 'BuyerProfile' THEN
    profile_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    profile_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.buyer_profile_id ELSE NEW.buyer_profile_id END;
  END IF;

  SELECT buyer_profile."visibilityStatus"
  INTO profile_status
  FROM public."BuyerProfile" buyer_profile
  WHERE buyer_profile.id = profile_id;

  IF profile_status IS DISTINCT FROM 'ACTIVE'::public."BuyerVisibilityStatus" THEN
    RETURN NULL;
  END IF;

  SELECT buyer_area.service_area_id, service_area.market_id
  INTO selected_service_area_id, selected_market_id
  FROM public.buyer_desired_service_areas buyer_area
  JOIN public.service_areas service_area
    ON service_area.id = buyer_area.service_area_id
  WHERE buyer_area.buyer_profile_id = profile_id
    AND buyer_area.source = 'SELECTED'
    AND buyer_area.is_primary = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active buyer profile % requires exactly one active primary selected service area.', profile_id
      USING ERRCODE = '23514';
  END IF;

  -- The fixed lock order prevents activation from racing geography deactivation.
  SELECT market.active
  INTO selected_market_active
  FROM public.markets market
  WHERE market.id = selected_market_id
  FOR SHARE;

  SELECT service_area.active
  INTO selected_service_area_active
  FROM public.service_areas service_area
  WHERE service_area.id = selected_service_area_id
  FOR SHARE;

  IF selected_market_active IS DISTINCT FROM true
    OR selected_service_area_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Active buyer profile % requires exactly one active primary selected service area.', profile_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_active_buyer_primary_service_area() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER buyer_profile_active_service_area_check
AFTER INSERT OR UPDATE OF "visibilityStatus"
ON public."BuyerProfile"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_active_buyer_primary_service_area();

CREATE CONSTRAINT TRIGGER buyer_desired_service_area_active_profile_check
AFTER INSERT OR UPDATE OR DELETE
ON public.buyer_desired_service_areas
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_active_buyer_primary_service_area();

CREATE OR REPLACE FUNCTION app_private.draft_buyers_for_deactivated_geography()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.active = true AND NEW.active = false THEN
    IF TG_TABLE_NAME = 'markets' THEN
      PERFORM buyer_profile.id
      FROM public."BuyerProfile" buyer_profile
      WHERE buyer_profile."visibilityStatus" = 'ACTIVE'
        AND EXISTS (
          SELECT 1
          FROM public.buyer_desired_service_areas buyer_area
          JOIN public.service_areas service_area ON service_area.id = buyer_area.service_area_id
          WHERE buyer_area.buyer_profile_id = buyer_profile.id
            AND buyer_area.source = 'SELECTED'
            AND buyer_area.is_primary = true
            AND service_area.market_id = OLD.id
        )
      ORDER BY buyer_profile.id
      FOR UPDATE OF buyer_profile NOWAIT;

      UPDATE public."BuyerProfile" buyer_profile
      SET
        "visibilityStatus" = 'DRAFT',
        "updatedAt" = now()
      WHERE buyer_profile."visibilityStatus" = 'ACTIVE'
        AND EXISTS (
          SELECT 1
          FROM public.buyer_desired_service_areas buyer_area
          JOIN public.service_areas service_area ON service_area.id = buyer_area.service_area_id
          WHERE buyer_area.buyer_profile_id = buyer_profile.id
            AND buyer_area.source = 'SELECTED'
            AND buyer_area.is_primary = true
            AND service_area.market_id = OLD.id
        );
    ELSE
      PERFORM buyer_profile.id
      FROM public."BuyerProfile" buyer_profile
      WHERE buyer_profile."visibilityStatus" = 'ACTIVE'
        AND EXISTS (
          SELECT 1
          FROM public.buyer_desired_service_areas buyer_area
          WHERE buyer_area.buyer_profile_id = buyer_profile.id
            AND buyer_area.source = 'SELECTED'
            AND buyer_area.is_primary = true
            AND buyer_area.service_area_id = OLD.id
        )
      ORDER BY buyer_profile.id
      FOR UPDATE OF buyer_profile NOWAIT;

      UPDATE public."BuyerProfile" buyer_profile
      SET
        "visibilityStatus" = 'DRAFT',
        "updatedAt" = now()
      WHERE buyer_profile."visibilityStatus" = 'ACTIVE'
        AND EXISTS (
          SELECT 1
          FROM public.buyer_desired_service_areas buyer_area
          WHERE buyer_area.buyer_profile_id = buyer_profile.id
            AND buyer_area.source = 'SELECTED'
            AND buyer_area.is_primary = true
            AND buyer_area.service_area_id = OLD.id
        );
    END IF;
  END IF;

  RETURN NULL;

EXCEPTION
  WHEN lock_not_available THEN
    RAISE EXCEPTION 'Geography deactivation conflicts with an in-flight buyer update; retry the deactivation.'
      USING ERRCODE = '55P03';
END;
$$;

REVOKE ALL ON FUNCTION app_private.draft_buyers_for_deactivated_geography() FROM PUBLIC;

CREATE TRIGGER markets_draft_buyers_on_deactivation
AFTER UPDATE OF active ON public.markets
FOR EACH ROW
EXECUTE FUNCTION app_private.draft_buyers_for_deactivated_geography();

CREATE TRIGGER service_areas_draft_buyers_on_deactivation
AFTER UPDATE OF active ON public.service_areas
FOR EACH ROW
EXECUTE FUNCTION app_private.draft_buyers_for_deactivated_geography();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."BuyerProfile" buyer_profile
    WHERE buyer_profile."visibilityStatus" = 'ACTIVE'
      AND 1 <> (
        SELECT count(*)
        FROM public.buyer_desired_service_areas buyer_area
        JOIN public.service_areas service_area ON service_area.id = buyer_area.service_area_id
        JOIN public.markets market ON market.id = service_area.market_id
        WHERE buyer_area.buyer_profile_id = buyer_profile.id
          AND buyer_area.source = 'SELECTED'
          AND buyer_area.is_primary = true
          AND service_area.active = true
          AND market.active = true
      )
  ) THEN
    RAISE EXCEPTION 'Canonical geography cutover left an invalid ACTIVE buyer profile.';
  END IF;
END;
$$;

COMMIT;
