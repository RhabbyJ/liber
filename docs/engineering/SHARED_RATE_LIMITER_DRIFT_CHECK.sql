-- Read-only drift check for migration 20261016033000_codify_shared_rate_limiter.
-- Run this single SELECT against an existing target (for example production,
-- in the Supabase SQL editor as postgres) before deploying that migration.
--
-- Every row must report matches = true. On a false row, compare `actual` (and
-- `definition`, the live pg_get_functiondef output) with the migration before
-- deploying. The migration overwrites differing function bodies, attributes,
-- and grants with the reviewed definitions; aborts without changes when table
-- columns, constraints, or indexes differ; fails when a different role owns
-- the objects; and leaves differing defaults, triggers, and row level security
-- in place. Body hashes are md5 over the text between the dollar quotes,
-- ignoring CR bytes.

WITH target_function(sort_key, label, signature, expected_result, expected_body_md5) AS (
  VALUES
    (
      10,
      'consume_rate_limit',
      'app_private.consume_rate_limit(text,text,integer,integer)',
      'TABLE(allowed boolean, limit_value integer, retry_after_seconds integer)',
      '4588d966ff6fd9c9804edd85c7b97a24'
    ),
    (
      20,
      'prune_rate_limit_buckets',
      'app_private.prune_rate_limit_buckets(timestamp with time zone,integer)',
      'integer',
      '30332c70f4078f05eebe8369556bbad3'
    )
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
live_table AS (
  SELECT to_regclass('app_private.rate_limit_buckets') AS table_oid
),
checks(sort_key, check_name, expected, actual, definition) AS (
  SELECT sort_key + 1, label || ': signature', 'present',
    CASE WHEN function_oid IS NULL THEN 'missing' ELSE 'present' END, NULL::text
  FROM live_function
  UNION ALL
  SELECT sort_key + 2, label || ': result', expected_result,
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
  SELECT 31, 'rate_limit_buckets: table', 'present',
    CASE WHEN table_oid IS NULL THEN 'missing' ELSE 'present' END, NULL
  FROM live_table
  UNION ALL
  SELECT 32, 'rate_limit_buckets: columns',
    'expires_at timestamp with time zone NOT NULL, '
      || 'hit_count integer NOT NULL, '
      || 'key_hash text NOT NULL, '
      || 'namespace text NOT NULL, '
      || 'updated_at timestamp with time zone NOT NULL, '
      || 'window_seconds integer NOT NULL, '
      || 'window_started_at timestamp with time zone NOT NULL',
    (
      SELECT string_agg(
        format(
          '%s %s%s',
          attribute.attname,
          format_type(attribute.atttypid, attribute.atttypmod),
          CASE WHEN attribute.attnotnull THEN ' NOT NULL' ELSE '' END
        ),
        ', ' ORDER BY attribute.attname
      )
      FROM pg_attribute AS attribute
      WHERE attribute.attrelid = table_oid
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ),
    NULL
  FROM live_table
  UNION ALL
  SELECT 33, 'rate_limit_buckets: column defaults', 'none',
    CASE WHEN table_oid IS NOT NULL THEN (
      SELECT coalesce(string_agg(
        format('%s DEFAULT %s', attribute.attname, pg_get_expr(column_default.adbin, column_default.adrelid)),
        ', ' ORDER BY attribute.attname
      ), 'none')
      FROM pg_attrdef AS column_default
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = column_default.adrelid
        AND attribute.attnum = column_default.adnum
      WHERE column_default.adrelid = table_oid
    ) END,
    NULL
  FROM live_table
  UNION ALL
  SELECT 34, 'rate_limit_buckets: constraints',
    'rate_limit_buckets_hit_count_check CHECK ((hit_count > 0)); '
      || 'rate_limit_buckets_pkey PRIMARY KEY (namespace, key_hash); '
      || 'rate_limit_buckets_window_seconds_check CHECK ((window_seconds > 0))',
    (
      SELECT string_agg(
        format('%s %s', bucket_constraint.conname, pg_get_constraintdef(bucket_constraint.oid)),
        '; ' ORDER BY bucket_constraint.conname
      )
      FROM pg_constraint AS bucket_constraint
      WHERE bucket_constraint.conrelid = table_oid
        AND bucket_constraint.contype <> 'n'
    ),
    NULL
  FROM live_table
  UNION ALL
  SELECT 35, 'rate_limit_buckets: indexes',
    'CREATE INDEX rate_limit_buckets_expires_at_idx ON app_private.rate_limit_buckets USING btree (expires_at); '
      || 'CREATE UNIQUE INDEX rate_limit_buckets_pkey ON app_private.rate_limit_buckets USING btree (namespace, key_hash)',
    (
      SELECT string_agg(
        pg_get_indexdef(bucket_index.indexrelid)
          || CASE WHEN bucket_index.indisvalid THEN '' ELSE ' INVALID' END,
        '; ' ORDER BY index_class.relname
      )
      FROM pg_index AS bucket_index
      JOIN pg_class AS index_class ON index_class.oid = bucket_index.indexrelid
      WHERE bucket_index.indrelid = table_oid
    ),
    NULL
  FROM live_table
  UNION ALL
  SELECT 36, 'rate_limit_buckets: triggers', 'none',
    CASE WHEN table_oid IS NOT NULL THEN (
      SELECT coalesce(string_agg(bucket_trigger.tgname, ', ' ORDER BY bucket_trigger.tgname), 'none')
      FROM pg_trigger AS bucket_trigger
      WHERE bucket_trigger.tgrelid = table_oid
        AND NOT bucket_trigger.tgisinternal
    ) END,
    NULL
  FROM live_table
  UNION ALL
  SELECT 37, 'rate_limit_buckets: row level security', 'disabled',
    (
      SELECT CASE WHEN table_row.relrowsecurity THEN 'enabled' ELSE 'disabled' END
        || CASE WHEN table_row.relforcerowsecurity THEN ', forced' ELSE '' END
      FROM pg_class AS table_row
      WHERE table_row.oid = table_oid
    ),
    NULL
  FROM live_table
  UNION ALL
  SELECT 38, 'rate_limit_buckets: owner', 'postgres',
    (SELECT pg_get_userbyid(table_row.relowner) FROM pg_class AS table_row WHERE table_row.oid = table_oid),
    NULL
  FROM live_table
  UNION ALL
  SELECT 39, 'rate_limit_buckets: non-owner grants', 'none',
    CASE WHEN table_oid IS NOT NULL THEN (
      SELECT coalesce(string_agg(
        format(
          '%s %s',
          CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END,
          privilege.privilege_type
        ),
        ', ' ORDER BY privilege.grantee, privilege.privilege_type
      ), 'none')
      FROM pg_class AS table_row
      CROSS JOIN LATERAL aclexplode(coalesce(table_row.relacl, acldefault('r', table_row.relowner))) AS privilege
      WHERE table_row.oid = table_oid
        AND privilege.grantee <> table_row.relowner
    ) END,
    NULL
  FROM live_table
)
SELECT
  check_name,
  actual IS NOT DISTINCT FROM expected AS matches,
  expected,
  actual,
  definition
FROM checks
ORDER BY sort_key;
