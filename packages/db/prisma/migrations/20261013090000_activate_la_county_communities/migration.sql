-- Activate every retained LA County statistical community from the approved
-- v2 dataset (for example Granada Hills, Sherman Oaks, Van Nuys, Altadena, and
-- East Los Angeles) plus a short reviewed nickname list. This migration changes
-- no live rows. Activation and rollback are owner-only functions run by the
-- guarded release command; both take the market lock, record or consume a
-- snapshot, and abort unless every invariant holds afterward.

BEGIN;

-- The v2 invariant now also accepts the community overlay while its activation
-- snapshot is live. Every other v2 check is unchanged.
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
BEGIN
  SELECT dataset.* INTO dataset_record
  FROM public.geography_dataset_versions dataset
  WHERE dataset.id = requested_dataset_id;
  IF dataset_record.id IS NULL THEN
    RAISE EXCEPTION 'Activated geography dataset is missing.' USING ERRCODE = '23514';
  END IF;
  communities_live := EXISTS (
    SELECT 1 FROM public.geography_activation_snapshots community_snapshot
    WHERE community_snapshot.dataset_version = 'la-county-06037-2026-07-12-v2-communities-2026-10-13'
      AND community_snapshot.market_id = dataset_record.market_id
      AND community_snapshot.rolled_back_at IS NULL
  );
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

-- Reviewed nickname terms keyed by immutable source identity. Only these exact
-- strings become new runtime terms. An unreferenced owner-only prototype of
-- this function was created in production outside migrations; replace it.
DROP FUNCTION IF EXISTS geography_admin.la_county_community_aliases();
CREATE FUNCTION geography_admin.la_county_community_aliases()
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
    ('urn:lacounty:csa:167', 'palisades'),
    ('urn:lacounty:csa:167', 'the palisades'),
    ('urn:lacounty:csa:185', 'silver lake'),
    ('urn:lacounty:csa:188', 'saint elmo village'),
    ('urn:lacounty:csa:206', 'venice beach'),
    ('urn:lacounty:csa:217', 'west la'),
    ('urn:lacounty:csa:234', 'westmont'),
    ('urn:lacounty:csa:255', 'east la'),
    ('urn:lacounty:csa:271', 'la crescenta'),
    ('urn:lacounty:csa:271', 'montrose'),
    ('urn:lacounty:csa:282', 'little rock'),
    ('urn:lacounty:csa:288', 'mdr'),
    ('urn:lacounty:csa:314', 'catalina'),
    ('urn:lacounty:csa:314', 'catalina island'),
    ('urn:lacounty:csa:331', 'view park'),
    ('urn:lacounty:csa:331', 'windsor hills'),
    ('urn:lacounty:csa:340', 'los nietos'),
    ('urn:lacounty:csa:351', 'dtlb'),
    ('urn:lacounty:csa:city:la-canada-flintridge', 'la canada'),
    ('urn:lacounty:csa:city:los-angeles', 'l a'),
    ('urn:lacounty:csa:city:los-angeles', 'la'),
    ('urn:lacounty:csa:city:palos-verdes-estates', 'pve'),
    ('urn:lacounty:csa:city:rancho-palos-verdes', 'rpv'),
    ('urn:lacounty:csa:city:west-hollywood', 'weho')
$$;
REVOKE ALL ON FUNCTION geography_admin.la_county_community_aliases()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.assert_la_county_communities_current(requested_release text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  dataset_record public.geography_dataset_versions%ROWTYPE;
  snapshot_record public.geography_activation_snapshots%ROWTYPE;
BEGIN
  IF requested_release <> 'la-county-06037-2026-07-12-v2-communities-2026-10-13' THEN
    RAISE EXCEPTION 'Unknown LA County community release.' USING ERRCODE = '23514';
  END IF;
  SELECT snapshot.* INTO snapshot_record
  FROM public.geography_activation_snapshots snapshot
  WHERE snapshot.dataset_version = requested_release;
  IF snapshot_record.id IS NULL OR snapshot_record.rolled_back_at IS NOT NULL THEN
    RAISE EXCEPTION 'The LA County community activation is not live.' USING ERRCODE = '23514';
  END IF;
  SELECT dataset.* INTO dataset_record
  FROM public.geography_dataset_versions dataset
  WHERE dataset.dataset_version = 'la-county-06037-2026-07-12-v2'
    AND dataset.market_id = snapshot_record.market_id;
  IF dataset_record.id IS NULL THEN
    RAISE EXCEPTION 'The approved LA County v2 dataset is missing.' USING ERRCODE = '23514';
  END IF;

  -- Full County invariant, which now requires all 269 communities to be active.
  PERFORM geography_admin.assert_la_county_activation_current(dataset_record.id);

  IF jsonb_array_length(coalesce(snapshot_record.snapshot->'activated_area_ids', '[]'::jsonb)) <> 266
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(snapshot_record.snapshot->'activated_area_ids') activated(id)
      LEFT JOIN public.service_areas area ON area.id = activated.id::uuid
      WHERE area.id IS NULL
        OR area.market_id <> snapshot_record.market_id
        OR area.type <> 'neighborhood'
        OR area.active IS DISTINCT FROM true
        OR area.current_geometry_id IS NULL
    )
    OR (
      SELECT count(*) FROM public.service_areas area
      WHERE area.market_id = snapshot_record.market_id AND area.active AND area.type = 'neighborhood'
    ) <> 269
    OR EXISTS (
      SELECT 1
      FROM geography_admin.la_county_community_aliases() alias
      LEFT JOIN public.service_areas area
        ON area.market_id = snapshot_record.market_id
       AND area.stable_external_id = alias.stable_external_id
       AND area.active
      WHERE area.id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.service_area_search_terms search_term
        WHERE search_term.market_id = snapshot_record.market_id
          AND search_term.service_area_id = area.id
          AND search_term.term_normalized = alias.term_normalized COLLATE "C"
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.service_area_search_terms search_term
      JOIN public.service_areas area ON area.id = search_term.service_area_id
      WHERE search_term.source = requested_release
        AND (
          search_term.term_kind <> 'LIBER_REVIEWED_ALIAS'
          OR search_term.reviewed_at <> '2026-10-13T00:00:00Z'::timestamptz
          OR NOT EXISTS (
            SELECT 1 FROM geography_admin.la_county_community_aliases() alias
            WHERE alias.stable_external_id = area.stable_external_id
              AND search_term.term_normalized = alias.term_normalized COLLATE "C"
          )
        )
    ) THEN
    RAISE EXCEPTION 'Live LA County communities differ from their approved activation.' USING ERRCODE = '23514';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.assert_la_county_communities_current(text)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.activate_la_county_communities(
  requested_release text,
  expected_manifest_sha256 text,
  expected_relationships_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  activated_ids jsonb;
  alias_count integer;
  dataset_record public.geography_dataset_versions%ROWTYPE;
  existing_snapshot public.geography_activation_snapshots%ROWTYPE;
BEGIN
  IF requested_release <> 'la-county-06037-2026-07-12-v2-communities-2026-10-13'
    OR expected_manifest_sha256 <> '2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47'
    OR expected_relationships_sha256 <> '5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8' THEN
    RAISE EXCEPTION 'Community activation requires the exact reviewed LA County v2 checksum ledger.' USING ERRCODE = '23514';
  END IF;

  SELECT dataset.* INTO dataset_record
  FROM public.geography_dataset_versions dataset
  WHERE dataset.dataset_version = 'la-county-06037-2026-07-12-v2'
    AND dataset.manifest_sha256 = expected_manifest_sha256
    AND dataset.relationships_sha256 = expected_relationships_sha256;
  IF dataset_record.id IS NULL THEN
    RAISE EXCEPTION 'The exact reviewed LA County v2 dataset is not staged.' USING ERRCODE = '23503';
  END IF;

  PERFORM 1 FROM public.markets market WHERE market.id = dataset_record.market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The staged market is missing.' USING ERRCODE = '23503'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('service-area-activation:' || dataset_record.market_id::text, 0));

  SELECT snapshot.* INTO existing_snapshot
  FROM public.geography_activation_snapshots snapshot
  WHERE snapshot.dataset_version = requested_release
  FOR UPDATE;
  IF existing_snapshot.id IS NOT NULL THEN
    IF existing_snapshot.rolled_back_at IS NOT NULL THEN
      RAISE EXCEPTION 'A rolled-back community release cannot be reactivated; approve a new release identifier.' USING ERRCODE = '23514';
    END IF;
    PERFORM geography_admin.assert_la_county_communities_current(requested_release);
    RETURN jsonb_build_object(
      'release', requested_release,
      'activeNeighborhoods', 269,
      'idempotent', true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.geography_activation_snapshots snapshot
    WHERE snapshot.dataset_version = dataset_record.dataset_version
      AND snapshot.market_id = dataset_record.market_id
      AND snapshot.rolled_back_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.service_area_search_terms WHERE source = requested_release
  ) THEN
    RAISE EXCEPTION 'Community activation requires the live v2 release and no prior community rows.' USING ERRCODE = '23514';
  END IF;

  -- Exact v2 state: 88 cities, 304 ZCTAs, and only the three pilot communities live.
  PERFORM geography_admin.assert_la_county_activation_current(dataset_record.id);

  SELECT jsonb_agg(area.id ORDER BY area.slug) INTO activated_ids
  FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
  JOIN public.service_areas area
    ON area.market_id = dataset_record.market_id
   AND area.slug = manifest_area->>'slug'
   AND area.stable_external_id = manifest_area->>'stableExternalId'
  WHERE manifest_area->>'type' = 'neighborhood'
    AND area.type = 'neighborhood'
    AND area.active = false
    AND area.current_geometry_id IS NOT NULL;

  IF jsonb_array_length(coalesce(activated_ids, '[]'::jsonb)) <> 266
    OR (SELECT count(*) FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
        WHERE manifest_area->>'type' = 'neighborhood') <> 269
    OR EXISTS (
      SELECT 1
      FROM geography_admin.la_county_community_aliases() alias
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
        WHERE manifest_area->>'stableExternalId' = alias.stable_external_id
      )
    ) THEN
    RAISE EXCEPTION 'Community allowlist or reviewed nickname targets are incomplete.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.geography_activation_snapshots(dataset_version, market_id, snapshot)
  VALUES (
    requested_release,
    dataset_record.market_id,
    jsonb_build_object(
      'base_dataset_version', dataset_record.dataset_version,
      'activated_area_ids', activated_ids
    )
  );

  UPDATE public.service_areas area
  SET active = true, updated_at = now()
  WHERE area.id IN (SELECT value::uuid FROM jsonb_array_elements_text(activated_ids));

  INSERT INTO public.service_area_search_terms (
    market_id, service_area_id, term_normalized, term_kind, source, reviewed_at
  )
  SELECT area.market_id, area.id, alias.term_normalized COLLATE "C",
         'LIBER_REVIEWED_ALIAS', requested_release, '2026-10-13T00:00:00Z'::timestamptz
  FROM geography_admin.la_county_community_aliases() alias
  JOIN public.service_areas area
    ON area.market_id = dataset_record.market_id AND area.stable_external_id = alias.stable_external_id
  ON CONFLICT (market_id, term_normalized, service_area_id) DO NOTHING;
  GET DIAGNOSTICS alias_count = ROW_COUNT;

  SET CONSTRAINTS ALL IMMEDIATE;
  PERFORM geography_admin.assert_la_county_communities_current(requested_release);

  RETURN jsonb_build_object(
    'release', requested_release,
    'activatedCommunities', 266,
    'activeNeighborhoods', 269,
    'newAliasTerms', alias_count,
    'idempotent', false
  );
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.activate_la_county_communities(text, text, text)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.rollback_la_county_communities(requested_release text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  dataset_id uuid;
  snapshot_record public.geography_activation_snapshots%ROWTYPE;
BEGIN
  IF requested_release <> 'la-county-06037-2026-07-12-v2-communities-2026-10-13' THEN
    RAISE EXCEPTION 'Rollback requires the exact LA County community release.' USING ERRCODE = '23514';
  END IF;
  SELECT snapshot.* INTO snapshot_record
  FROM public.geography_activation_snapshots snapshot
  WHERE snapshot.dataset_version = requested_release
  FOR UPDATE;
  IF snapshot_record.id IS NULL OR snapshot_record.rolled_back_at IS NOT NULL THEN
    RAISE EXCEPTION 'An active community rollback snapshot is not available.' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.markets WHERE id = snapshot_record.market_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('service-area-activation:' || snapshot_record.market_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.geography_activation_snapshots newer
    WHERE newer.market_id = snapshot_record.market_id
      AND newer.activated_at > snapshot_record.activated_at
      AND newer.rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Community rollback is blocked by newer live geography state.' USING ERRCODE = '23514';
  END IF;
  PERFORM geography_admin.assert_la_county_communities_current(requested_release);

  -- Never silently draft a published buyer; they must reselect an area first.
  IF EXISTS (
    SELECT 1
    FROM public."BuyerProfile" buyer
    JOIN public.buyer_desired_service_areas desired
      ON desired.buyer_profile_id = buyer.id
     AND desired.source = 'SELECTED'
     AND desired.is_primary = true
    WHERE buyer."visibilityStatus" = 'ACTIVE'
      AND desired.service_area_id IN (
        SELECT value::uuid FROM jsonb_array_elements_text(snapshot_record.snapshot->'activated_area_ids')
      )
  ) THEN
    RAISE EXCEPTION 'Rollback would deactivate an ACTIVE buyer primary service area.' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.service_area_search_terms
  WHERE source = requested_release AND market_id = snapshot_record.market_id;
  UPDATE public.service_areas area
  SET active = false, updated_at = now()
  WHERE area.id IN (SELECT value::uuid FROM jsonb_array_elements_text(snapshot_record.snapshot->'activated_area_ids'));
  UPDATE public.geography_activation_snapshots SET rolled_back_at = now()
  WHERE id = snapshot_record.id;

  SET CONSTRAINTS ALL IMMEDIATE;
  SELECT dataset.id INTO dataset_id
  FROM public.geography_dataset_versions dataset
  WHERE dataset.dataset_version = snapshot_record.snapshot->>'base_dataset_version'
    AND dataset.market_id = snapshot_record.market_id;
  -- Back to the exact v2 state with only the three pilot communities live.
  PERFORM geography_admin.assert_la_county_activation_current(dataset_id);
  IF EXISTS (SELECT 1 FROM public.service_area_search_terms WHERE source = requested_release) THEN
    RAISE EXCEPTION 'LA County community rollback postconditions failed.' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'release', requested_release,
    'rolledBack', true,
    'deactivatedCommunities', 266
  );
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.rollback_la_county_communities(text)
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
