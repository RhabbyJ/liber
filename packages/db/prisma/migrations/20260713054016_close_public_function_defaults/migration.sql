-- Function EXECUTE defaults are global in PostgreSQL. A schema-scoped revoke
-- cannot override the built-in PUBLIC default for newly created functions.

BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
