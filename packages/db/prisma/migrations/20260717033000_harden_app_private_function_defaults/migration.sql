-- Prevent retained schema-specific defaults from reopening future private
-- policy helpers after the current function allowlist has been normalized.

BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  app_private_oid oid;
BEGIN
  SELECT namespace.oid
  INTO app_private_oid
  FROM pg_namespace namespace
  WHERE namespace.nspname = 'app_private'
    AND pg_get_userbyid(namespace.nspowner) = 'postgres';

  IF app_private_oid IS NULL THEN
    RAISE EXCEPTION 'app_private must exist and remain owned by postgres.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_default_acl default_acl
    CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) privilege
    WHERE default_acl.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = 'postgres')
      AND default_acl.defaclnamespace IN (0, app_private_oid)
      AND default_acl.defaclobjtype = 'f'
      AND privilege.grantee <> default_acl.defaclrole
  ) THEN
    RAISE EXCEPTION 'postgres function defaults can expose future app_private helpers.';
  END IF;
END;
$$;

COMMIT;
