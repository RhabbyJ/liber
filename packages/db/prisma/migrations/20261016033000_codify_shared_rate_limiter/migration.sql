-- Codify the generic shared limiter the application calls for Auth, LOI, and
-- public-geography limits. Production received these objects by hand from
-- docs/engineering/AUTH_SECURITY_FOLLOWUP_FORWARD.sql, outside this ledger, so
-- a database rebuilt from migrations could not serve any shared limit.
--
-- Definitions are copied verbatim from that proposal. On a target that already
-- has them, the table is kept only after an exact-shape check (a drifted table
-- aborts the migration before anything changes), a missing expiry index is
-- added, and both functions are replaced with the identical reviewed
-- definitions. Run docs/engineering/SHARED_RATE_LIMITER_DRIFT_CHECK.sql against
-- an existing target first. The legacy three-argument overload and
-- public."RateLimitBucket" are unchanged.

BEGIN;

CREATE TABLE IF NOT EXISTS app_private.rate_limit_buckets (
  namespace text NOT NULL,
  key_hash text NOT NULL,
  hit_count integer NOT NULL,
  window_seconds integer NOT NULL,
  window_started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (namespace, key_hash),
  CONSTRAINT rate_limit_buckets_hit_count_check CHECK (hit_count > 0),
  CONSTRAINT rate_limit_buckets_window_seconds_check CHECK (window_seconds > 0)
);

-- Runs before the index is created so an older table reports its whole shape.
DO $$
DECLARE
  bucket_columns text;
  bucket_constraints text;
  bucket_indexes text;
BEGIN
  SELECT string_agg(
    format(
      '%s %s%s',
      attribute.attname,
      format_type(attribute.atttypid, attribute.atttypmod),
      CASE WHEN attribute.attnotnull THEN ' NOT NULL' ELSE '' END
    ),
    ', ' ORDER BY attribute.attname
  )
  INTO bucket_columns
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'app_private.rate_limit_buckets'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  -- PostgreSQL 18 also catalogs NOT NULL constraints; the column shape covers them.
  SELECT string_agg(
    format('%s %s', bucket_constraint.conname, pg_get_constraintdef(bucket_constraint.oid)),
    '; ' ORDER BY bucket_constraint.conname
  )
  INTO bucket_constraints
  FROM pg_constraint AS bucket_constraint
  WHERE bucket_constraint.conrelid = 'app_private.rate_limit_buckets'::regclass
    AND bucket_constraint.contype <> 'n';

  SELECT string_agg(
    pg_get_indexdef(bucket_index.indexrelid)
      || CASE WHEN bucket_index.indisvalid THEN '' ELSE ' INVALID' END,
    '; ' ORDER BY index_class.relname
  )
  INTO bucket_indexes
  FROM pg_index AS bucket_index
  JOIN pg_class AS index_class ON index_class.oid = bucket_index.indexrelid
  WHERE bucket_index.indrelid = 'app_private.rate_limit_buckets'::regclass;

  IF bucket_columns IS DISTINCT FROM
      'expires_at timestamp with time zone NOT NULL, '
      || 'hit_count integer NOT NULL, '
      || 'key_hash text NOT NULL, '
      || 'namespace text NOT NULL, '
      || 'updated_at timestamp with time zone NOT NULL, '
      || 'window_seconds integer NOT NULL, '
      || 'window_started_at timestamp with time zone NOT NULL'
    OR bucket_constraints IS DISTINCT FROM
      'rate_limit_buckets_hit_count_check CHECK ((hit_count > 0)); '
      || 'rate_limit_buckets_pkey PRIMARY KEY (namespace, key_hash); '
      || 'rate_limit_buckets_window_seconds_check CHECK ((window_seconds > 0))'
    OR coalesce(bucket_indexes, '') NOT IN (
      'CREATE UNIQUE INDEX rate_limit_buckets_pkey ON app_private.rate_limit_buckets USING btree (namespace, key_hash)',
      'CREATE INDEX rate_limit_buckets_expires_at_idx ON app_private.rate_limit_buckets USING btree (expires_at); '
        || 'CREATE UNIQUE INDEX rate_limit_buckets_pkey ON app_private.rate_limit_buckets USING btree (namespace, key_hash)'
    )
  THEN
    RAISE EXCEPTION 'app_private.rate_limit_buckets differs from the reviewed shared limiter table; reconcile it before applying this migration.'
      USING DETAIL = format(
        'columns: %s | constraints: %s | indexes: %s',
        bucket_columns,
        bucket_constraints,
        bucket_indexes
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS rate_limit_buckets_expires_at_idx
ON app_private.rate_limit_buckets (expires_at);

REVOKE ALL ON TABLE app_private.rate_limit_buckets
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.prune_rate_limit_buckets(
  p_before timestamptz,
  p_limit integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF p_before IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'LIBER_RATE_LIMIT_PRUNE_ARGUMENT_INVALID';
  END IF;

  WITH expired AS MATERIALIZED (
    SELECT bucket.ctid
    FROM app_private.rate_limit_buckets AS bucket
    WHERE bucket.expires_at <= p_before
    ORDER BY bucket.expires_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM app_private.rate_limit_buckets AS bucket
  USING expired
  WHERE bucket.ctid = expired.ctid;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prune_rate_limit_buckets(timestamptz, integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.consume_rate_limit(
  p_namespace text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE (
  allowed boolean,
  limit_value integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_count integer;
  current_expires_at timestamptz;
  request_time timestamptz := clock_timestamp();
BEGIN
  IF p_namespace IS NULL OR btrim(p_namespace) = '' OR length(p_namespace) > 128
    OR p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$'
    OR p_limit IS NULL OR p_limit < 1
    OR p_window_seconds IS NULL OR p_window_seconds < 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'LIBER_RATE_LIMIT_ARGUMENT_INVALID';
  END IF;

  INSERT INTO app_private.rate_limit_buckets AS limiter (
    namespace,
    key_hash,
    hit_count,
    window_seconds,
    window_started_at,
    expires_at,
    updated_at
  ) VALUES (
    p_namespace,
    p_key_hash,
    1,
    p_window_seconds,
    request_time,
    request_time + make_interval(secs => p_window_seconds),
    request_time
  )
  ON CONFLICT (namespace, key_hash) DO UPDATE
  SET
    hit_count = CASE
      WHEN limiter.window_seconds <> EXCLUDED.window_seconds
        OR limiter.expires_at <= request_time
      THEN 1
      ELSE limiter.hit_count + 1
    END,
    window_seconds = EXCLUDED.window_seconds,
    window_started_at = CASE
      WHEN limiter.window_seconds <> EXCLUDED.window_seconds
        OR limiter.expires_at <= request_time
      THEN request_time
      ELSE limiter.window_started_at
    END,
    expires_at = CASE
      WHEN limiter.window_seconds <> EXCLUDED.window_seconds
        OR limiter.expires_at <= request_time
      THEN EXCLUDED.expires_at
      ELSE limiter.expires_at
    END,
    updated_at = request_time
  RETURNING hit_count, expires_at
  INTO current_count, current_expires_at;

  -- A small opportunistic prune keeps retention bounded even without a scheduler.
  PERFORM app_private.prune_rate_limit_buckets(request_time, 100);

  RETURN QUERY SELECT
    current_count <= p_limit,
    p_limit,
    CASE
      WHEN current_count <= p_limit THEN 0
      ELSE greatest(
        1,
        ceil(extract(epoch FROM (
          current_expires_at - request_time
        )))::integer
      )
    END;
END;
$$;

REVOKE ALL ON FUNCTION app_private.consume_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
