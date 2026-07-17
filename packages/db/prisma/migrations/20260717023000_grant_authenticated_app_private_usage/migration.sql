-- Browser policies need schema traversal before PostgreSQL can invoke their
-- individually allowlisted SECURITY DEFINER helpers.

BEGIN;

DO $$
DECLARE
  policy_dependencies text[];
BEGIN
  SELECT coalesce(
    array_agg(
      format(
        '%I.%I|%I|%s',
        policy_namespace.nspname,
        relation.relname,
        policy.polname,
        procedure.oid::regprocedure::text
      ) ORDER BY policy_namespace.nspname, relation.relname, policy.polname,
        procedure.oid::regprocedure::text
    ),
    ARRAY[]::text[]
  )
  INTO policy_dependencies
  FROM pg_policy policy
  JOIN pg_class relation ON relation.oid = policy.polrelid
  JOIN pg_namespace policy_namespace ON policy_namespace.oid = relation.relnamespace
  JOIN pg_depend dependency
    ON dependency.classid = 'pg_policy'::regclass
   AND dependency.objid = policy.oid
   AND dependency.refclassid = 'pg_proc'::regclass
  JOIN pg_proc procedure ON procedure.oid = dependency.refobjid
  JOIN pg_namespace function_namespace ON function_namespace.oid = procedure.pronamespace
  WHERE function_namespace.nspname = 'app_private';

  IF policy_dependencies <> ARRAY[
    'realtime.messages|"Active participants can receive conversation broadcasts"|app_private.can_join_conversation_topic(text)',
    'realtime.messages|"Active participants can receive conversation broadcasts"|app_private.can_join_loi_topic(text)',
    'storage.objects|"Active users can upload authorized session objects"|app_private.can_upload_session_object(text,text,uuid)',
    'storage.objects|"Authorized users can read private property images"|app_private.can_read_property_image(text,uuid)'
  ] THEN
    RAISE EXCEPTION 'app_private policy dependency contract changed: found %.', policy_dependencies;
  END IF;
END;
$$;

REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA app_private TO authenticated;

-- Rebuild the effective browser-facing function allowlist so upgraded and
-- fresh databases expose the same policy helpers.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  app_private.can_join_conversation_topic(text),
  app_private.can_join_loi_topic(text),
  app_private.can_read_property_image(text, uuid),
  app_private.can_upload_session_object(text, text, uuid)
TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  expected_authenticated_functions text[] := ARRAY[
    'app_private.can_join_conversation_topic(text)',
    'app_private.can_join_loi_topic(text)',
    'app_private.can_read_property_image(text,uuid)',
    'app_private.can_upload_session_object(text,text,uuid)'
  ];
  actual_authenticated_functions text[];
BEGIN
  IF NOT has_schema_privilege('authenticated', 'app_private', 'USAGE')
     OR has_schema_privilege('authenticated', 'app_private', 'CREATE')
     OR has_schema_privilege('anon', 'app_private', 'USAGE')
     OR has_schema_privilege('anon', 'app_private', 'CREATE')
     OR has_schema_privilege('service_role', 'app_private', 'USAGE')
     OR has_schema_privilege('service_role', 'app_private', 'CREATE')
     OR EXISTS (
       SELECT 1
       FROM pg_namespace namespace
       CROSS JOIN LATERAL aclexplode(
         coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
       ) privilege
       WHERE namespace.nspname = 'app_private'
         AND privilege.grantee = 0
         AND privilege.privilege_type IN ('USAGE', 'CREATE')
     ) THEN
    RAISE EXCEPTION 'app_private schema privileges are outside the authenticated-USAGE-only contract.';
  END IF;

  SELECT coalesce(
    array_agg(procedure.oid::regprocedure::text ORDER BY procedure.oid::regprocedure::text),
    ARRAY[]::text[]
  )
  INTO actual_authenticated_functions
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'app_private'
    AND has_function_privilege('authenticated', procedure.oid, 'EXECUTE');

  IF actual_authenticated_functions <> expected_authenticated_functions THEN
    RAISE EXCEPTION
      'app_private authenticated function allowlist mismatch: expected %, found %.',
      expected_authenticated_functions,
      actual_authenticated_functions;
  END IF;

  IF (
    SELECT count(*)
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'app_private'
      AND procedure.oid::regprocedure::text = ANY(expected_authenticated_functions)
      AND pg_get_userbyid(procedure.proowner) = 'postgres'
      AND procedure.prosecdef
      AND procedure.provolatile = 's'
      AND NOT procedure.proretset
      AND procedure.prorettype = 'boolean'::regtype
      AND NOT procedure.proleakproof
      AND procedure.proconfig = ARRAY['search_path=""']::text[]
  ) <> 4 THEN
    RAISE EXCEPTION 'app_private policy helpers are outside the reviewed definition contract.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'app_private'
      AND (
        has_function_privilege('anon', procedure.oid, 'EXECUTE')
        OR has_function_privilege('service_role', procedure.oid, 'EXECUTE')
        OR (
          has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
          AND NOT procedure.prosecdef
        )
      )
  ) THEN
    RAISE EXCEPTION 'app_private function privileges are outside the policy-helper contract.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_namespace namespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
    ) privilege
    WHERE namespace.nspname = 'app_private'
      AND privilege.grantee <> namespace.nspowner
      AND NOT (
        privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND privilege.privilege_type = 'USAGE'
        AND NOT privilege.is_grantable
      )
  ) THEN
    RAISE EXCEPTION 'app_private has an unexpected non-owner schema privilege.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(
        relation.relacl,
        acldefault(
          (CASE WHEN relation.relkind = 'S' THEN 'S' ELSE 'r' END)::"char",
          relation.relowner
        )
      )
    ) privilege
    WHERE namespace.nspname = 'app_private'
      AND relation.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
      AND privilege.grantee <> relation.relowner
  ) THEN
    RAISE EXCEPTION 'app_private relations expose a non-owner privilege.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    WHERE namespace.nspname = 'app_private'
      AND privilege.grantee <> procedure.proowner
      AND NOT (
        privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
        AND privilege.privilege_type = 'EXECUTE'
        AND NOT privilege.is_grantable
        AND procedure.oid::regprocedure::text = ANY(expected_authenticated_functions)
      )
  ) THEN
    RAISE EXCEPTION 'app_private has an unexpected non-owner function privilege.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_default_acl default_acl
    CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) privilege
    WHERE default_acl.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = 'postgres')
      AND default_acl.defaclnamespace = 0
      AND default_acl.defaclobjtype = 'f'
      AND privilege.grantee <> default_acl.defaclrole
  ) THEN
    RAISE EXCEPTION 'postgres default function privileges expose a non-owner grant.';
  END IF;
END;
$$;

COMMIT;
