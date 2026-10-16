-- Read-only drift check for migration 20261016040000_codify_auth_user_sync_triggers.
-- Run this single SELECT against an existing target (for example production,
-- in the Supabase SQL editor as postgres) before deploying that migration.
--
-- Every row must report matches = true. On a false row, compare `actual` (and
-- `definition`, the live pg_get_functiondef output) with the migration before
-- deploying. The migration replaces both function bodies, attributes, and
-- grants and both auth.users trigger definitions with the reviewed ones; it
-- does not remove other triggers. Body hashes are md5 over the text between
-- the dollar quotes, ignoring CR bytes: production stores these bodies with
-- CRLF line endings because they were pasted from a CRLF checkout of
-- docs/engineering/AUTH_SECURITY_FOLLOWUP_FORWARD.sql, while the migration
-- files are LF. Deploying the migration rewrites them as LF; the hashes and
-- behavior are unchanged.
--
-- Known production-only objects, intentionally not checked or managed by any
-- migration: app_private.is_active_user() and app_private.owns_property(text),
-- unused leftovers of the same hand-applied proposal. Do not drop them as part
-- of this deployment.

WITH target_function(sort_key, label, signature, expected_body_md5) AS (
  VALUES
    (10, 'handle_new_user', 'app_private.handle_new_user()', '8962824e65968452e41e0b8b94bd91d7'),
    (20, 'handle_update_user', 'app_private.handle_update_user()', 'c7a09e370123badb63d84b7d1202a09d')
),
live_function AS (
  SELECT
    target.*,
    function_row.oid AS function_oid,
    function_row.prosrc,
    function_row.prosecdef,
    function_row.provolatile,
    function_row.proconfig,
    function_row.proowner,
    function_row.proacl,
    language_row.lanname
  FROM target_function AS target
  LEFT JOIN pg_proc AS function_row
    ON function_row.oid = to_regprocedure(target.signature)
  LEFT JOIN pg_language AS language_row
    ON language_row.oid = function_row.prolang
),
target_trigger(sort_key, trigger_name, expected_definition) AS (
  VALUES
    (
      31,
      'on_auth_user_created',
      'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW '
        || 'EXECUTE FUNCTION app_private.handle_new_user()'
    ),
    (
      33,
      'on_auth_user_updated',
      'CREATE TRIGGER on_auth_user_updated AFTER UPDATE OF email ON auth.users FOR EACH ROW '
        || 'WHEN (((old.email)::text IS DISTINCT FROM (new.email)::text)) '
        || 'EXECUTE FUNCTION app_private.handle_update_user()'
    )
),
live_trigger AS (
  SELECT
    target.*,
    trigger_row.oid AS trigger_oid,
    trigger_row.tgenabled
  FROM target_trigger AS target
  LEFT JOIN pg_trigger AS trigger_row
    ON trigger_row.tgrelid = to_regclass('auth.users')
    AND trigger_row.tgname = target.trigger_name
    AND NOT trigger_row.tgisinternal
),
checks(sort_key, check_name, expected, actual, definition) AS (
  SELECT sort_key + 1, label || ': signature', 'present',
    CASE WHEN function_oid IS NULL THEN 'missing' ELSE 'present' END, NULL::text
  FROM live_function
  UNION ALL
  SELECT sort_key + 2, label || ': result', 'trigger',
    pg_get_function_result(function_oid), NULL
  FROM live_function
  UNION ALL
  SELECT sort_key + 3, label || ': body md5', expected_body_md5,
    md5(replace(prosrc, E'\r', '')), pg_get_functiondef(function_oid)
  FROM live_function
  UNION ALL
  SELECT sort_key + 4, label || ': attributes',
    'plpgsql, security definer, volatile, search_path=""',
    CASE WHEN function_oid IS NOT NULL THEN format(
      '%s, %s, %s, %s',
      lanname,
      CASE WHEN prosecdef THEN 'security definer' ELSE 'security invoker' END,
      CASE provolatile WHEN 'v' THEN 'volatile' WHEN 's' THEN 'stable' ELSE 'immutable' END,
      coalesce(array_to_string(proconfig, ', '), 'no settings')
    ) END,
    NULL
  FROM live_function
  UNION ALL
  SELECT sort_key + 5, label || ': owner', 'postgres', pg_get_userbyid(proowner), NULL
  FROM live_function
  UNION ALL
  SELECT sort_key + 6, label || ': non-owner grants', 'none',
    CASE WHEN function_oid IS NOT NULL THEN (
      SELECT coalesce(string_agg(
        format(
          '%s %s',
          CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END,
          privilege.privilege_type
        ),
        ', ' ORDER BY privilege.grantee, privilege.privilege_type
      ), 'none')
      FROM aclexplode(coalesce(proacl, acldefault('f', proowner))) AS privilege
      WHERE privilege.grantee <> proowner
    ) END,
    NULL
  FROM live_function
  UNION ALL
  SELECT sort_key, trigger_name || ': definition', expected_definition,
    pg_get_triggerdef(trigger_oid), NULL
  FROM live_trigger
  UNION ALL
  SELECT sort_key + 1, trigger_name || ': enabled', 'enabled',
    CASE tgenabled
      WHEN 'O' THEN 'enabled'
      WHEN 'D' THEN 'disabled'
      WHEN 'R' THEN 'replica only'
      WHEN 'A' THEN 'always'
    END,
    NULL
  FROM live_trigger
  UNION ALL
  -- A stray trigger (for example an older name) could still run either
  -- function on every auth.users update.
  SELECT 35, 'auth.users: triggers calling app_private',
    'on_auth_user_created, on_auth_user_updated',
    (
      SELECT coalesce(string_agg(trigger_row.tgname, ', ' ORDER BY trigger_row.tgname), 'none')
      FROM pg_trigger AS trigger_row
      JOIN pg_proc AS function_row ON function_row.oid = trigger_row.tgfoid
      WHERE trigger_row.tgrelid = to_regclass('auth.users')
        AND NOT trigger_row.tgisinternal
        AND function_row.pronamespace = to_regnamespace('app_private')
    ),
    NULL
)
SELECT
  check_name,
  actual IS NOT DISTINCT FROM expected AS matches,
  expected,
  actual,
  definition
FROM checks
ORDER BY sort_key;
