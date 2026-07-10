BEGIN;

CREATE TYPE "BuyerDesiredServiceAreaSource" AS ENUM ('SELECTED', 'DERIVED', 'MIGRATED');
CREATE TYPE "ServiceAreaRelationType" AS ENUM ('CONTAINS', 'OVERLAPS', 'DISPLAY_PARENT');

CREATE TABLE public.markets (
  slug text PRIMARY KEY,
  label text NOT NULL,
  state text NOT NULL,
  country text NOT NULL,
  center_lat double precision NOT NULL,
  center_lng double precision NOT NULL,
  bbox_west double precision NOT NULL,
  bbox_south double precision NOT NULL,
  bbox_east double precision NOT NULL,
  bbox_north double precision NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT markets_slug_check CHECK (slug ~ '^[a-z0-9-]{1,80}$'),
  CONSTRAINT markets_label_check CHECK (btrim(label) <> ''),
  CONSTRAINT markets_state_check CHECK (state ~ '^[A-Z]{2}$'),
  CONSTRAINT markets_country_check CHECK (country ~ '^[A-Z]{2}$'),
  CONSTRAINT markets_center_lat_check CHECK (center_lat BETWEEN -90 AND 90),
  CONSTRAINT markets_center_lng_check CHECK (center_lng BETWEEN -180 AND 180),
  CONSTRAINT markets_center_within_bbox_check CHECK (
    center_lng BETWEEN bbox_west AND bbox_east
    AND center_lat BETWEEN bbox_south AND bbox_north
  ),
  CONSTRAINT markets_bbox_lat_check CHECK (
    bbox_south BETWEEN -90 AND 90
    AND bbox_north BETWEEN -90 AND 90
    AND bbox_south < bbox_north
  ),
  CONSTRAINT markets_bbox_lng_check CHECK (
    bbox_west BETWEEN -180 AND 180
    AND bbox_east BETWEEN -180 AND 180
    AND bbox_west < bbox_east
  )
);

INSERT INTO public.markets (
  slug,
  label,
  state,
  country,
  center_lat,
  center_lng,
  bbox_west,
  bbox_south,
  bbox_east,
  bbox_north,
  active
)
VALUES (
  'los-angeles',
  'Los Angeles',
  'CA',
  'US',
  34.2111195,
  -118.424873,
  -118.668163,
  34.118761,
  -118.181583,
  34.303478,
  true
)
ON CONFLICT (slug) DO UPDATE
SET
  label = EXCLUDED.label,
  state = EXCLUDED.state,
  country = EXCLUDED.country,
  center_lat = EXCLUDED.center_lat,
  center_lng = EXCLUDED.center_lng,
  bbox_west = EXCLUDED.bbox_west,
  bbox_south = EXCLUDED.bbox_south,
  bbox_east = EXCLUDED.bbox_east,
  bbox_north = EXCLUDED.bbox_north,
  active = EXCLUDED.active,
  updated_at = now();

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.markets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.markets TO service_role;

CREATE POLICY "Active markets are public metadata"
ON public.markets
FOR SELECT
TO anon, authenticated
USING (active = true);

ALTER TABLE public.service_areas
ADD COLUMN market_slug text NOT NULL DEFAULT 'los-angeles',
ADD COLUMN search_terms text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.service_areas
ADD CONSTRAINT service_areas_market_slug_fkey
FOREIGN KEY (market_slug) REFERENCES public.markets(slug)
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX service_areas_market_active_type_idx
ON public.service_areas(market_slug, active, type);

CREATE INDEX service_areas_search_terms_gin_idx
ON public.service_areas USING GIN(search_terms);

UPDATE public.service_areas
SET search_terms = CASE slug
  WHEN 'burbank' THEN ARRAY['burbank', 'burbank ca']
  WHEN 'glendale' THEN ARRAY['glendale', 'glendale ca']
  WHEN 'encino' THEN ARRAY['encino', 'encino ca', 'encino 91316', 'encino 91436', '91316', '91436']
  WHEN 'northridge' THEN ARRAY['northridge', 'northridge ca', 'northridge 91324', 'northridge 91325', '91324', '91325']
  WHEN 'tarzana' THEN ARRAY['tarzana', 'tarzana ca', 'tarzana 91356', '91356']
  WHEN '91316' THEN ARRAY['91316', 'encino', 'encino ca', 'encino 91316']
  WHEN '91324' THEN ARRAY['91324', 'northridge', 'northridge ca', 'northridge 91324']
  WHEN '91325' THEN ARRAY['91325', 'northridge', 'northridge ca', 'northridge 91325']
  WHEN '91326' THEN ARRAY['91326', 'porter ranch', 'porter ranch ca', 'porter ranch 91326']
  WHEN '91356' THEN ARRAY['91356', 'tarzana', 'tarzana ca', 'tarzana 91356']
  WHEN '91364' THEN ARRAY['91364', 'woodland hills', 'woodland hills ca', 'woodland hills 91364']
  WHEN '91367' THEN ARRAY['91367', 'woodland hills', 'woodland hills ca', 'woodland hills 91367']
  WHEN '91423' THEN ARRAY['91423', 'sherman oaks', 'sherman oaks ca', 'sherman oaks 91423']
  WHEN '91436' THEN ARRAY['91436', 'encino', 'encino ca', 'encino 91436']
  WHEN '91604' THEN ARRAY['91604', 'studio city', 'studio city ca', 'studio city 91604']
  ELSE ARRAY[slug, label]
END;

ALTER TABLE public.service_areas
ALTER COLUMN market_slug DROP DEFAULT;

CREATE TABLE public.service_area_relationships (
  parent_service_area_slug text NOT NULL,
  child_service_area_slug text NOT NULL,
  relation_type "ServiceAreaRelationType" NOT NULL DEFAULT 'DISPLAY_PARENT',
  source text NOT NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_area_relationships_pkey
    PRIMARY KEY (parent_service_area_slug, child_service_area_slug, relation_type),
  CONSTRAINT service_area_relationships_parent_service_area_slug_fkey
    FOREIGN KEY (parent_service_area_slug)
    REFERENCES public.service_areas(slug)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT service_area_relationships_child_service_area_slug_fkey
    FOREIGN KEY (child_service_area_slug)
    REFERENCES public.service_areas(slug)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX service_area_relationships_child_service_area_slug_idx
ON public.service_area_relationships(child_service_area_slug);

CREATE INDEX service_area_relationships_parent_service_area_slug_idx
ON public.service_area_relationships(parent_service_area_slug);

ALTER TABLE public.service_area_relationships ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.service_area_relationships TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_area_relationships TO service_role;

CREATE POLICY "Service area relationships are public metadata"
ON public.service_area_relationships
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.service_areas parent
    WHERE parent.slug = parent_service_area_slug
      AND parent.active = true
  )
  AND EXISTS (
    SELECT 1
    FROM public.service_areas child
    WHERE child.slug = child_service_area_slug
      AND child.active = true
  )
);

INSERT INTO public.service_area_relationships (
  parent_service_area_slug,
  child_service_area_slug,
  relation_type,
  source,
  reviewed_at
)
VALUES
  ('encino', '91316', 'DISPLAY_PARENT', 'manual_v1', now()),
  ('encino', '91436', 'DISPLAY_PARENT', 'manual_v1', now()),
  ('northridge', '91324', 'DISPLAY_PARENT', 'manual_v1', now()),
  ('northridge', '91325', 'DISPLAY_PARENT', 'manual_v1', now()),
  ('tarzana', '91356', 'DISPLAY_PARENT', 'manual_v1', now())
ON CONFLICT (parent_service_area_slug, child_service_area_slug, relation_type) DO UPDATE
SET
  source = EXCLUDED.source,
  reviewed_at = EXCLUDED.reviewed_at,
  updated_at = now();

CREATE TABLE public.buyer_desired_service_areas (
  buyer_profile_id text NOT NULL,
  service_area_slug text NOT NULL,
  source "BuyerDesiredServiceAreaSource" NOT NULL DEFAULT 'SELECTED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buyer_desired_service_areas_pkey PRIMARY KEY (buyer_profile_id, service_area_slug),
  CONSTRAINT buyer_desired_service_areas_buyer_profile_id_fkey
    FOREIGN KEY (buyer_profile_id)
    REFERENCES public."BuyerProfile"(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT buyer_desired_service_areas_service_area_slug_fkey
    FOREIGN KEY (service_area_slug)
    REFERENCES public.service_areas(slug)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX buyer_desired_service_areas_service_area_slug_idx
ON public.buyer_desired_service_areas(service_area_slug);

CREATE INDEX buyer_desired_service_areas_buyer_profile_id_idx
ON public.buyer_desired_service_areas(buyer_profile_id);

ALTER TABLE public.buyer_desired_service_areas ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyer_desired_service_areas TO service_role;

-- Legacy buyer backfill is intentionally deferred to the corrective canonical
-- cutover migration, which applies ZIP -> neighborhood -> city precedence and
-- quarantines conflicting or unresolved profiles.

COMMIT;
