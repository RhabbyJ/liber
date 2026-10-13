-- Activate the reviewed LA County statistical-community layer from the staged
-- v2 release, add reviewed colloquial aliases, and widen service-area search
-- suggestions to word-prefix and typo-tolerant matches. Exact resolution keeps
-- its existing slug > ZIP > label > reviewed-term precedence.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $$
DECLARE
  trgm_schema text;
BEGIN
  SELECT extension.extnamespace::regnamespace::text INTO trgm_schema
  FROM pg_extension extension
  WHERE extension.extname = 'pg_trgm';
  IF trgm_schema IS DISTINCT FROM 'extensions' THEN
    RAISE EXCEPTION 'Liber service-area search requires pg_trgm in extensions; found %.', trgm_schema;
  END IF;
END;
$$;

-- Reviewed 2026-10-13: widely used colloquial names. A name another reviewed area
-- already owns stays subject to exact precedence or ambiguity, never silent reassignment.
CREATE OR REPLACE FUNCTION geography_admin.la_county_community_aliases()
RETURNS TABLE(stable_external_id text, term_normalized text)
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  VALUES
    ('urn:lacounty:csa:115', 'downtown la'),
    ('urn:lacounty:csa:115', 'dtla'),
    ('urn:lacounty:csa:144', 'k town'),
    ('urn:lacounty:csa:144', 'ktown'),
    ('urn:lacounty:csa:163', 'mount washington'),
    ('urn:lacounty:csa:165', 'noho'),
    ('urn:lacounty:csa:185', 'silver lake'),
    ('urn:lacounty:csa:206', 'venice beach'),
    ('urn:lacounty:csa:217', 'west la'),
    ('urn:lacounty:csa:255', 'east la'),
    ('urn:lacounty:csa:city:los-angeles', 'l a'),
    ('urn:lacounty:csa:city:los-angeles', 'la'),
    ('urn:lacounty:csa:city:west-hollywood', 'weho')
$$;
REVOKE ALL ON FUNCTION geography_admin.la_county_community_aliases()
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
  communities_live boolean;
  dataset_record public.geography_dataset_versions%ROWTYPE;
  layer_snapshot public.geography_activation_snapshots%ROWTYPE;
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
  SELECT snapshot.* INTO layer_snapshot
  FROM public.geography_activation_snapshots snapshot
  WHERE snapshot.dataset_version = 'la-county-06037-2026-10-13-communities-v1'
    AND snapshot.market_id = dataset_record.market_id;
  communities_live := layer_snapshot.id IS NOT NULL AND layer_snapshot.rolled_back_at IS NULL;
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

  IF EXISTS (
    SELECT 1
    FROM public.service_area_search_terms search_term
    WHERE search_term.source = 'la-county-06037-2026-10-13-communities-v1'
      AND (
        NOT communities_live
        OR NOT EXISTS (
          SELECT 1
          FROM geography_admin.la_county_community_aliases() alias
          JOIN public.service_areas area
            ON area.market_id = dataset_record.market_id
           AND area.stable_external_id = alias.stable_external_id
          WHERE search_term.market_id = dataset_record.market_id
            AND search_term.service_area_id = area.id
            AND search_term.term_normalized = alias.term_normalized COLLATE "C"
        )
      )
  ) THEN
    RAISE EXCEPTION 'Community-layer geography contains an unapproved live key.' USING ERRCODE = '23514';
  END IF;
  IF communities_live AND EXISTS (
    SELECT 1
    FROM geography_admin.la_county_community_aliases() alias
    LEFT JOIN public.service_areas area
      ON area.market_id = dataset_record.market_id
     AND area.stable_external_id = alias.stable_external_id
    WHERE area.id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.service_area_search_terms search_term
        WHERE search_term.market_id = dataset_record.market_id
          AND search_term.service_area_id = area.id
          AND search_term.term_normalized = alias.term_normalized COLLATE "C"
          AND (
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements(coalesce(
                layer_snapshot.snapshot->'preexisting_alias_terms', '[]'::jsonb
              )) previous(value)
              WHERE previous.value->>'id' = search_term.id::text
                AND search_term.term_kind IS NOT DISTINCT FROM previous.value->>'term_kind'
                AND search_term.source IS NOT DISTINCT FROM previous.value->>'source'
                AND search_term.reviewed_at IS NOT DISTINCT FROM (previous.value->>'reviewed_at')::timestamptz
                AND search_term.created_at IS NOT DISTINCT FROM (previous.value->>'created_at')::timestamptz
            )
            OR (
              NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(coalesce(
                  layer_snapshot.snapshot->'preexisting_alias_terms', '[]'::jsonb
                )) previous(value)
                WHERE previous.value->>'service_area_id' = area.id::text
                  AND previous.value->>'term_normalized' = alias.term_normalized
              )
              AND search_term.term_kind = 'COMMUNITY_REVIEWED_ALIAS'
              AND search_term.source = 'la-county-06037-2026-10-13-communities-v1'
              AND search_term.reviewed_at = '2026-10-13T00:00:00Z'::timestamptz
            )
          )
      )
  ) THEN
    RAISE EXCEPTION 'Community-layer search aliases differ from their approved activation.' USING ERRCODE = '23514';
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
          OR (communities_live AND manifest_area->>'type' = 'neighborhood')
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

CREATE OR REPLACE FUNCTION geography_admin.activate_la_county_communities(
  requested_layer_version text,
  expected_manifest_sha256 text,
  expected_relationships_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  county_snapshot public.geography_activation_snapshots%ROWTYPE;
  dataset_record public.geography_dataset_versions%ROWTYPE;
  layer_snapshot public.geography_activation_snapshots%ROWTYPE;
  newly_activated integer;
BEGIN
  IF requested_layer_version IS DISTINCT FROM 'la-county-06037-2026-10-13-communities-v1'
    OR expected_manifest_sha256 IS DISTINCT FROM '2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47'
    OR expected_relationships_sha256 IS DISTINCT FROM '5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8' THEN
    RAISE EXCEPTION 'Community activation requires the exact reviewed layer and LA County v2 checksum ledger.' USING ERRCODE = '23514';
  END IF;

  SELECT dataset.* INTO dataset_record
  FROM public.geography_dataset_versions dataset
  WHERE dataset.dataset_version = 'la-county-06037-2026-07-12-v2'
    AND dataset.manifest_sha256 = expected_manifest_sha256
    AND dataset.relationships_sha256 = expected_relationships_sha256;
  IF dataset_record.id IS NULL THEN
    RAISE EXCEPTION 'The exact reviewed LA County dataset is not staged.' USING ERRCODE = '23503';
  END IF;

  PERFORM 1 FROM public.markets market WHERE market.id = dataset_record.market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The staged market is missing.' USING ERRCODE = '23503'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('service-area-activation:' || dataset_record.market_id::text, 0));

  SELECT snapshot.* INTO county_snapshot
  FROM public.geography_activation_snapshots snapshot
  WHERE snapshot.dataset_version = dataset_record.dataset_version
    AND snapshot.market_id = dataset_record.market_id;
  IF county_snapshot.id IS NULL OR county_snapshot.rolled_back_at IS NOT NULL THEN
    RAISE EXCEPTION 'The reviewed LA County release must be active before its community layer.' USING ERRCODE = '23514';
  END IF;

  SELECT snapshot.* INTO layer_snapshot
  FROM public.geography_activation_snapshots snapshot
  WHERE snapshot.dataset_version = requested_layer_version
  FOR UPDATE;
  IF layer_snapshot.id IS NOT NULL THEN
    IF layer_snapshot.rolled_back_at IS NOT NULL THEN
      RAISE EXCEPTION 'A rolled-back community layer cannot be reactivated; review a new layer version.' USING ERRCODE = '23514';
    END IF;
    PERFORM geography_admin.assert_la_county_activation_current(dataset_record.id);
    RETURN jsonb_build_object(
      'layerVersion', requested_layer_version,
      'datasetVersion', dataset_record.dataset_version,
      'activeCities', 88,
      'activeZctas', 304,
      'activeCommunities', 269,
      'idempotent', true
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.service_area_search_terms
    WHERE source = requested_layer_version
  ) THEN
    RAISE EXCEPTION 'Layer-owned live geography rows already exist before activation.' USING ERRCODE = '23514';
  END IF;
  -- The County release must still match its approved state before this layer changes it.
  PERFORM geography_admin.assert_la_county_activation_current(dataset_record.id);
  IF (
    SELECT count(*)
    FROM geography_admin.la_county_community_aliases() alias
    JOIN jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
      ON manifest_area->>'stableExternalId' = alias.stable_external_id
     AND manifest_area->>'type' IN ('city', 'neighborhood')
    JOIN public.service_areas area
      ON area.market_id = dataset_record.market_id
     AND area.slug = manifest_area->>'slug'
     AND area.stable_external_id = alias.stable_external_id
  ) <> (SELECT count(*) FROM geography_admin.la_county_community_aliases()) THEN
    RAISE EXCEPTION 'A reviewed community alias does not name exactly one reviewed area.' USING ERRCODE = '23514';
  END IF;

  -- clock_timestamp() orders this layer after the County snapshot, which blocks County rollback.
  INSERT INTO public.geography_activation_snapshots(dataset_version, market_id, activated_at, snapshot)
  SELECT requested_layer_version, dataset_record.market_id, clock_timestamp(), jsonb_build_object(
    'baseDatasetVersion', dataset_record.dataset_version,
    'areas', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', area.id,
        'slug', area.slug,
        'active', area.active
      ) ORDER BY area.id)
      FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
      JOIN public.service_areas area
        ON area.market_id = dataset_record.market_id
       AND area.slug = manifest_area->>'slug'
      WHERE manifest_area->>'type' = 'neighborhood'
    ),
    'aliases', (
      SELECT jsonb_agg(jsonb_build_object(
        'service_area_id', area.id,
        'term_normalized', alias.term_normalized
      ) ORDER BY area.id, alias.term_normalized)
      FROM geography_admin.la_county_community_aliases() alias
      JOIN public.service_areas area
        ON area.market_id = dataset_record.market_id
       AND area.stable_external_id = alias.stable_external_id
    ),
    'preexisting_alias_terms', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', stored.id,
        'service_area_id', stored.service_area_id,
        'term_normalized', stored.term_normalized,
        'term_kind', stored.term_kind,
        'source', stored.source,
        'reviewed_at', stored.reviewed_at,
        'created_at', stored.created_at
      ) ORDER BY stored.id), '[]'::jsonb)
      FROM geography_admin.la_county_community_aliases() alias
      JOIN public.service_areas area
        ON area.market_id = dataset_record.market_id
       AND area.stable_external_id = alias.stable_external_id
      JOIN public.service_area_search_terms stored
        ON stored.market_id = dataset_record.market_id
       AND stored.service_area_id = area.id
       AND stored.term_normalized = alias.term_normalized COLLATE "C"
    )
  );

  UPDATE public.service_areas area SET
    active = true,
    updated_at = now()
  FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
  WHERE area.market_id = dataset_record.market_id
    AND area.slug = manifest_area->>'slug'
    AND manifest_area->>'type' = 'neighborhood'
    AND area.type = 'neighborhood'
    AND area.active = false;
  GET DIAGNOSTICS newly_activated = ROW_COUNT;

  INSERT INTO public.service_area_search_terms(
    market_id, service_area_id, term_normalized, term_kind, source, reviewed_at
  )
  SELECT dataset_record.market_id,
         area.id,
         alias.term_normalized COLLATE "C",
         'COMMUNITY_REVIEWED_ALIAS',
         requested_layer_version,
         '2026-10-13T00:00:00Z'::timestamptz
  FROM geography_admin.la_county_community_aliases() alias
  JOIN public.service_areas area
    ON area.market_id = dataset_record.market_id
   AND area.stable_external_id = alias.stable_external_id
  ON CONFLICT (market_id, term_normalized, service_area_id) DO NOTHING;

  SET CONSTRAINTS ALL IMMEDIATE;

  IF newly_activated <> 266
    OR (SELECT count(*) FROM public.service_areas WHERE market_id = dataset_record.market_id AND active AND type = 'city') <> 88
    OR (SELECT count(*) FROM public.service_areas WHERE market_id = dataset_record.market_id AND active AND type = 'zip') <> 304
    OR (SELECT count(*) FROM public.service_areas WHERE market_id = dataset_record.market_id AND active AND type = 'neighborhood') <> 269
    OR EXISTS (
      SELECT 1 FROM public.service_areas area
      JOIN public.markets market ON market.id = area.market_id
      WHERE area.market_id = dataset_record.market_id AND area.active
        AND (area.current_geometry_id IS NULL
          OR area.bbox_west < market.bbox_west OR area.bbox_south < market.bbox_south
          OR area.bbox_east > market.bbox_east OR area.bbox_north > market.bbox_north)
    ) THEN
    RAISE EXCEPTION 'LA County community activation postconditions failed.' USING ERRCODE = '23514';
  END IF;
  PERFORM geography_admin.assert_la_county_activation_current(dataset_record.id);

  RETURN jsonb_build_object(
    'layerVersion', requested_layer_version,
    'datasetVersion', dataset_record.dataset_version,
    'activeCities', 88,
    'activeZctas', 304,
    'activeCommunities', 269,
    'newlyActivatedCommunities', newly_activated,
    'reviewedAliases', (SELECT count(*) FROM geography_admin.la_county_community_aliases()),
    'idempotent', false
  );
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.activate_la_county_communities(text, text, text)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.rollback_la_county_communities(requested_layer_version text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  dataset_record public.geography_dataset_versions%ROWTYPE;
  layer_snapshot public.geography_activation_snapshots%ROWTYPE;
BEGIN
  IF requested_layer_version IS DISTINCT FROM 'la-county-06037-2026-10-13-communities-v1' THEN
    RAISE EXCEPTION 'Rollback requires the exact activated LA County community layer.' USING ERRCODE = '23514';
  END IF;
  SELECT snapshot.* INTO layer_snapshot
  FROM public.geography_activation_snapshots snapshot
  WHERE snapshot.dataset_version = requested_layer_version
  FOR UPDATE;
  IF layer_snapshot.id IS NULL OR layer_snapshot.rolled_back_at IS NOT NULL THEN
    RAISE EXCEPTION 'An active community-layer snapshot is not available.' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.markets WHERE id = layer_snapshot.market_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('service-area-activation:' || layer_snapshot.market_id::text, 0));
  SELECT dataset.* INTO dataset_record
  FROM public.geography_dataset_versions dataset
  WHERE dataset.dataset_version = layer_snapshot.snapshot->>'baseDatasetVersion'
    AND dataset.dataset_version = 'la-county-06037-2026-07-12-v2'
    AND dataset.market_id = layer_snapshot.market_id;
  IF dataset_record.id IS NULL OR EXISTS (
    SELECT 1 FROM public.geography_activation_snapshots newer
    WHERE newer.market_id = layer_snapshot.market_id
      AND newer.activated_at > layer_snapshot.activated_at
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
    JOIN jsonb_to_recordset(layer_snapshot.snapshot->'areas') AS previous(id uuid, active boolean)
      ON previous.id = area.id
    WHERE buyer."visibilityStatus" = 'ACTIVE'
      AND area.active = true
      AND previous.active = false
  ) THEN
    RAISE EXCEPTION 'Rollback would deactivate an ACTIVE buyer primary service area.' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.service_area_search_terms search_term
  USING jsonb_to_recordset(layer_snapshot.snapshot->'aliases') AS alias(service_area_id uuid, term_normalized text)
  WHERE search_term.market_id = layer_snapshot.market_id
    AND search_term.service_area_id = alias.service_area_id
    AND search_term.term_normalized = alias.term_normalized COLLATE "C"
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(
        layer_snapshot.snapshot->'preexisting_alias_terms', '[]'::jsonb
      )) previous(value)
      WHERE previous.value->>'service_area_id' = search_term.service_area_id::text
        AND previous.value->>'term_normalized' = search_term.term_normalized
    );

  UPDATE public.service_areas area SET
    active = previous.active,
    updated_at = now()
  FROM jsonb_to_recordset(layer_snapshot.snapshot->'areas') AS previous(id uuid, active boolean)
  WHERE area.id = previous.id
    AND area.market_id = layer_snapshot.market_id
    AND area.active IS DISTINCT FROM previous.active;

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
    RAISE EXCEPTION 'Community rollback left an invalid ACTIVE buyer profile.' USING ERRCODE = '23514';
  END IF;
  UPDATE public.geography_activation_snapshots SET rolled_back_at = clock_timestamp()
  WHERE id = layer_snapshot.id;

  IF (SELECT count(*) FROM public.service_areas area
      WHERE area.market_id = layer_snapshot.market_id AND area.active AND area.type = 'neighborhood')
      <> (SELECT count(*) FROM jsonb_to_recordset(layer_snapshot.snapshot->'areas') AS previous(id uuid, active boolean)
          WHERE previous.active)
    OR EXISTS (
      SELECT 1 FROM public.service_area_search_terms
      WHERE source = requested_layer_version
    ) THEN
    RAISE EXCEPTION 'LA County community rollback postconditions failed.' USING ERRCODE = '23514';
  END IF;
  PERFORM geography_admin.assert_la_county_activation_current(dataset_record.id);

  RETURN jsonb_build_object(
    'layerVersion', requested_layer_version,
    'datasetVersion', dataset_record.dataset_version,
    'rolledBack', true,
    'restoredActiveCommunities', (
      SELECT count(*) FROM jsonb_to_recordset(layer_snapshot.snapshot->'areas') AS previous(id uuid, active boolean)
      WHERE previous.active
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.rollback_la_county_communities(text)
FROM PUBLIC, anon, authenticated, service_role;

-- Suggestions: display-name prefixes, later-word prefixes, and reviewed-term prefixes
-- (indexed), then trigram typo matches only when nothing matched lexically. Areas
-- without a reviewed search term remain unsearchable. Exact matching is unchanged.
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
  ), term_matches AS (
    SELECT search_term.service_area_id,
           bool_or(search_term.term_normalized = input.term) AS term_exact
    FROM input
    JOIN selected_market ON true
    JOIN public.service_area_search_terms search_term
      ON search_term.market_id = selected_market.id
     AND search_term.term_normalized >= input.term
     AND search_term.term_normalized < input.term || U&'\FFFF'
     AND search_term.term_normalized LIKE input.term || '%'
    JOIN public.service_areas area
      ON area.id = search_term.service_area_id
     AND area.market_id = selected_market.id
     AND area.active = true
    WHERE input.term <> ''
    GROUP BY search_term.service_area_id
  ), named_areas AS (
    SELECT area.id,
           btrim(regexp_replace(
             lower(regexp_replace(area.label, '\(unincorporated\)', '', 'gi')),
             '[^a-z0-9]+', ' ', 'g'
           )) COLLATE "C" AS name
    FROM selected_market
    JOIN public.service_areas area
      ON area.market_id = selected_market.id
     AND area.active = true
    WHERE EXISTS (
      SELECT 1 FROM public.service_area_search_terms search_term
      WHERE search_term.market_id = selected_market.id
        AND search_term.service_area_id = area.id
    )
  ), lexical AS (
    SELECT term_matches.service_area_id, 2 AS match_rank, term_matches.term_exact
    FROM term_matches
    UNION ALL
    SELECT named.id,
           CASE WHEN named.name LIKE input.term || '%' THEN 0 ELSE 1 END,
           false
    FROM input
    JOIN named_areas named
      ON named.name LIKE input.term || '%'
      OR named.name LIKE '% ' || input.term || '%'
    WHERE input.term <> ''
  ), fuzzy_scores AS (
    SELECT names.id AS service_area_id,
           max(greatest(
             extensions.similarity(names.name, input.term),
             extensions.word_similarity(input.term, names.name)
           )) AS similarity
    FROM input
    CROSS JOIN (
      SELECT named.id, named.name FROM named_areas named
      UNION ALL
      SELECT alias.service_area_id, alias.term_normalized
      FROM selected_market
      JOIN public.service_area_search_terms alias
        ON alias.market_id = selected_market.id
       AND alias.term_kind = 'COMMUNITY_REVIEWED_ALIAS'
      JOIN named_areas named ON named.id = alias.service_area_id
    ) names
    WHERE length(input.term) >= 4
      AND input.term ~ '[a-z]'
      AND NOT EXISTS (SELECT 1 FROM lexical)
    GROUP BY names.id
  ), fuzzy AS (
    SELECT scored.service_area_id, scored.similarity
    FROM (
      SELECT fuzzy_scores.*, max(fuzzy_scores.similarity) OVER () AS best_similarity
      FROM fuzzy_scores
    ) scored
    WHERE scored.similarity >= greatest(0.45, scored.best_similarity - 0.15)
  ), candidates AS (
    SELECT lexical.service_area_id,
           min(lexical.match_rank) AS match_rank,
           0::real AS distance,
           bool_or(lexical.term_exact) AS term_exact
    FROM lexical
    GROUP BY lexical.service_area_id
    UNION ALL
    SELECT fuzzy.service_area_id, 3, 1 - fuzzy.similarity, false
    FROM fuzzy
  ), ranked AS (
    SELECT candidates.service_area_id,
           candidates.match_rank,
           candidates.distance,
           area.type,
           area.label,
           CASE
             WHEN replace(area.slug, '-', ' ') = input.term THEN 1
             WHEN area.postal_code = input.term THEN 2
             WHEN lower(btrim(regexp_replace(area.label, '[^a-zA-Z0-9]+', ' ', 'g'))) COLLATE "C" = input.term THEN 3
             WHEN candidates.term_exact THEN 4
             ELSE 99
           END AS exact_rank
    FROM candidates
    JOIN input ON true
    JOIN selected_market ON true
    JOIN public.service_areas area
      ON area.id = candidates.service_area_id
     AND area.market_id = selected_market.id
     AND area.active = true
  ), resolved AS (
    SELECT ranked.*,
           min(ranked.exact_rank) FILTER (WHERE ranked.exact_rank < 99) OVER () AS best_exact_rank
    FROM ranked
  )
  SELECT resolved.service_area_id,
         resolved.exact_rank < 99 AND resolved.exact_rank = resolved.best_exact_rank AS exact_match
  FROM resolved, input
  ORDER BY exact_match DESC,
           resolved.exact_rank,
           resolved.match_rank,
           resolved.distance,
           CASE
             WHEN resolved.type = 'zip' AND input.term ~ '^[0-9]' THEN 0
             WHEN resolved.type = 'city' THEN 1
             WHEN resolved.type = 'neighborhood' THEN 2
             WHEN resolved.type = 'zip' THEN 3
             ELSE 4
           END,
           lower(resolved.label),
           resolved.service_area_id
  LIMIT (SELECT row_limit FROM input);
$$;
REVOKE ALL ON FUNCTION geography_admin.search_active_service_areas(text, text, integer)
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
