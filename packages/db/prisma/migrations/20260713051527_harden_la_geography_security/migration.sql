-- Close raw geography access, keep future public-schema access opt-in, and
-- make canonical service-area prefix lookup use its covering index.

BEGIN;

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_area_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_desired_service_areas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.markets,
  public.service_areas,
  public.service_area_relationships,
  public.buyer_desired_service_areas
FROM PUBLIC, anon, authenticated, service_role;

-- Server-side Supabase administration retains only its existing CRUD contract.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.markets,
  public.service_areas,
  public.service_area_relationships,
  public.buyer_desired_service_areas
TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

-- PostGIS owns these objects. Self-hosted/owner-capable targets can harden them
-- here; hosted Supabase targets require the supported platform remediation.
DO $$
DECLARE
  object_owner oid;
  owner_name name;
  owner_capable boolean;
  spatial_ref_sys regclass := to_regclass('public.spatial_ref_sys');
BEGIN
  IF spatial_ref_sys IS NULL THEN
    RETURN;
  END IF;

  SELECT relation.relowner, pg_get_userbyid(relation.relowner)
  INTO object_owner, owner_name
  FROM pg_class relation
  WHERE relation.oid = spatial_ref_sys;

  SELECT role.rolsuper
      OR object_owner = role.oid
  INTO owner_capable
  FROM pg_roles role
  WHERE role.rolname = current_user;

  IF owner_capable THEN
    ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.spatial_ref_sys FROM PUBLIC, anon, authenticated, service_role;
  ELSIF NOT (
    SELECT relation.relrowsecurity
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) privilege
        LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
        WHERE privilege.grantee = 0
           OR grantee.rolname IN ('anon', 'authenticated', 'service_role')
      )
    FROM pg_class relation
    WHERE relation.oid = spatial_ref_sys
  ) THEN
    RAISE WARNING 'POSTGIS_SUPPORTED_PLATFORM_GATE: public.spatial_ref_sys is owned by %, not migration role %; use Supabase-supported remediation to enable RLS and revoke browser access.', owner_name, current_user;
  END IF;
END;
$$;

DO $$
DECLARE
  function_name text;
  function_oid regprocedure;
  object_owner oid;
  owner_name name;
  owner_capable boolean;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'public.st_estimatedextent(text,text)',
    'public.st_estimatedextent(text,text,text)',
    'public.st_estimatedextent(text,text,text,boolean)'
  ]
  LOOP
    function_oid := to_regprocedure(function_name);
    IF function_oid IS NULL THEN
      CONTINUE;
    END IF;

    SELECT procedure.proowner, pg_get_userbyid(procedure.proowner)
    INTO object_owner, owner_name
    FROM pg_proc procedure
    WHERE procedure.oid = function_oid;

    SELECT role.rolsuper
        OR object_owner = role.oid
    INTO owner_capable
    FROM pg_roles role
    WHERE role.rolname = current_user;

    IF owner_capable THEN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
        function_oid
      );
    ELSIF has_function_privilege('anon', function_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', function_oid, 'EXECUTE')
       OR has_function_privilege('service_role', function_oid, 'EXECUTE') THEN
      RAISE WARNING 'POSTGIS_SUPPORTED_PLATFORM_GATE: % is owned by %, not migration role %; use Supabase-supported remediation to revoke EXECUTE.', function_oid, owner_name, current_user;
    END IF;
  END LOOP;
END;
$$;

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
     AND search_term.term_normalized >= input.term
     AND search_term.term_normalized < input.term || U&'\FFFF'
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

COMMIT;
