ALTER TABLE public."BuyerProfile"
ADD COLUMN "desiredNeighborhood" TEXT,
ADD COLUMN "desiredPostalCode" TEXT;

CREATE INDEX "BuyerProfile_desiredPostalCode_idx"
ON public."BuyerProfile"("desiredPostalCode");

CREATE INDEX "BuyerProfile_desiredNeighborhood_idx"
ON public."BuyerProfile"("desiredNeighborhood");

CREATE INDEX "BuyerProfile_active_desiredPostalCode_idx"
ON public."BuyerProfile"("desiredPostalCode")
WHERE "visibilityStatus" = 'ACTIVE' AND "desiredPostalCode" IS NOT NULL;

CREATE INDEX "BuyerProfile_active_desiredNeighborhood_idx"
ON public."BuyerProfile"("desiredNeighborhood")
WHERE "visibilityStatus" = 'ACTIVE' AND "desiredNeighborhood" IS NOT NULL;

CREATE INDEX "BuyerProfile_active_desiredCityState_idx"
ON public."BuyerProfile"("desiredCity", "desiredState")
WHERE "visibilityStatus" = 'ACTIVE';

CREATE TABLE public.service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  type text NOT NULL CHECK (type IN ('zip', 'city', 'neighborhood', 'custom')),
  postal_code text,
  city text,
  county text,
  state text NOT NULL DEFAULT 'CA',
  center_lat double precision NOT NULL,
  center_lng double precision NOT NULL,
  bbox_west double precision NOT NULL,
  bbox_south double precision NOT NULL,
  bbox_east double precision NOT NULL,
  bbox_north double precision NOT NULL,
  geojson_path text NOT NULL,
  source text NOT NULL,
  source_version text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_pilot boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX service_areas_active_type_idx
ON public.service_areas(active, type);

CREATE INDEX service_areas_postal_code_idx
ON public.service_areas(postal_code);

ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.service_areas TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_areas TO service_role;

CREATE POLICY "Active service areas are public metadata"
ON public.service_areas
FOR SELECT
TO anon, authenticated
USING (active = true);

INSERT INTO public.service_areas (
  slug,
  label,
  type,
  postal_code,
  city,
  county,
  state,
  center_lat,
  center_lng,
  bbox_west,
  bbox_south,
  bbox_east,
  bbox_north,
  geojson_path,
  source,
  source_version,
  active,
  is_pilot
)
VALUES
  ('burbank', 'Burbank', 'city', NULL, 'Burbank', 'Los Angeles County', 'CA', 34.182145, -118.325147, -118.370313, 34.142636, -118.279981, 34.221654, '/geo/service-areas/city/burbank.geojson', 'city_boundary', '2025', true, true),
  ('glendale', 'Glendale', 'city', NULL, 'Glendale', 'Los Angeles County', 'CA', 34.192976, -118.244698, -118.307812, 34.118761, -118.181583, 34.267190, '/geo/service-areas/city/glendale.geojson', 'city_boundary', '2025', true, true),
  ('encino', 'Encino', 'neighborhood', NULL, 'Los Angeles', 'Los Angeles County', 'CA', 34.157161, -118.503514, -118.537387, 34.127695, -118.469641, 34.186627, '/geo/service-areas/neighborhood/encino.geojson', 'curated', 'manual_v1', true, true),
  ('northridge', 'Northridge', 'neighborhood', NULL, 'Los Angeles', 'Los Angeles County', 'CA', 34.233923, -118.536252, -118.571048, 34.208401, -118.501456, 34.259444, '/geo/service-areas/neighborhood/northridge.geojson', 'curated', 'manual_v1', true, true),
  ('tarzana', 'Tarzana', 'neighborhood', NULL, 'Los Angeles', 'Los Angeles County', 'CA', 34.155030, -118.548062, -118.568895, 34.125824, -118.527229, 34.184236, '/geo/service-areas/neighborhood/tarzana.geojson', 'curated', 'manual_v1', true, true),
  ('91316', '91316', 'zip', '91316', 'Encino', 'Los Angeles County', 'CA', 34.157311, -118.517578, -118.537387, 34.127995, -118.497769, 34.186627, '/geo/service-areas/zip/91316.geojson', 'census_zcta', '2020', true, true),
  ('91324', '91324', 'zip', '91324', 'Northridge', 'Los Angeles County', 'CA', 34.239278, -118.551692, -118.571048, 34.219552, -118.532336, 34.259003, '/geo/service-areas/zip/91324.geojson', 'census_zcta', '2020', true, true),
  ('91325', '91325', 'zip', '91325', 'Northridge', 'Los Angeles County', 'CA', 34.233923, -118.519279, -118.537102, 34.208401, -118.501456, 34.259444, '/geo/service-areas/zip/91325.geojson', 'census_zcta', '2020', true, true),
  ('91326', '91326', 'zip', '91326', 'Porter Ranch', 'Los Angeles County', 'CA', 34.280368, -118.556347, -118.591990, 34.257259, -118.520704, 34.303478, '/geo/service-areas/zip/91326.geojson', 'census_zcta', '2020', true, true),
  ('91356', '91356', 'zip', '91356', 'Tarzana', 'Los Angeles County', 'CA', 34.155030, -118.548062, -118.568895, 34.125824, -118.527229, 34.184236, '/geo/service-areas/zip/91356.geojson', 'census_zcta', '2020', true, true),
  ('91364', '91364', 'zip', '91364', 'Woodland Hills', 'Los Angeles County', 'CA', 34.151854, -118.599919, -118.638446, 34.130383, -118.561392, 34.173325, '/geo/service-areas/zip/91364.geojson', 'census_zcta', '2020', true, true),
  ('91367', '91367', 'zip', '91367', 'Woodland Hills', 'Los Angeles County', 'CA', 34.174856, -118.615182, -118.668163, 34.158817, -118.562201, 34.190895, '/geo/service-areas/zip/91367.geojson', 'census_zcta', '2020', true, true),
  ('91423', '91423', 'zip', '91423', 'Sherman Oaks', 'Los Angeles County', 'CA', 34.146700, -118.433314, -118.455860, 34.126725, -118.410769, 34.166675, '/geo/service-areas/zip/91423.geojson', 'census_zcta', '2020', true, true),
  ('91436', '91436', 'zip', '91436', 'Encino', 'Los Angeles County', 'CA', 34.153899, -118.491287, -118.512932, 34.127695, -118.469641, 34.180103, '/geo/service-areas/zip/91436.geojson', 'census_zcta', '2020', true, true),
  ('91604', '91604', 'zip', '91604', 'Studio City', 'Los Angeles County', 'CA', 34.139536, -118.391708, -118.422502, 34.122436, -118.360915, 34.156636, '/geo/service-areas/zip/91604.geojson', 'census_zcta', '2020', true, true)
ON CONFLICT (slug) DO UPDATE
SET
  label = EXCLUDED.label,
  type = EXCLUDED.type,
  postal_code = EXCLUDED.postal_code,
  city = EXCLUDED.city,
  county = EXCLUDED.county,
  state = EXCLUDED.state,
  center_lat = EXCLUDED.center_lat,
  center_lng = EXCLUDED.center_lng,
  bbox_west = EXCLUDED.bbox_west,
  bbox_south = EXCLUDED.bbox_south,
  bbox_east = EXCLUDED.bbox_east,
  bbox_north = EXCLUDED.bbox_north,
  geojson_path = EXCLUDED.geojson_path,
  source = EXCLUDED.source,
  source_version = EXCLUDED.source_version,
  active = EXCLUDED.active,
  is_pilot = EXCLUDED.is_pilot,
  updated_at = now();
