-- Avoid PostgreSQL resolving a PL/pgSQL variable as a built-in temporal
-- expression inside SQL statements.
CREATE OR REPLACE FUNCTION app_private.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_ms integer
)
RETURNS TABLE(allowed boolean, limit_value integer, retry_after_seconds integer)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  bucket public."RateLimitBucket"%ROWTYPE;
  v_now timestamp(3) := clock_timestamp();
BEGIN
  IF p_limit < 1 OR p_window_ms < 1 THEN
    RAISE EXCEPTION 'Rate-limit configuration must be positive.';
  END IF;

  INSERT INTO public."RateLimitBucket" AS rate_bucket (
    key, count, "windowStart", "expiresAt", "updatedAt"
  ) VALUES (
    p_key, 1, v_now,
    v_now + (p_window_ms * interval '1 millisecond'),
    v_now
  )
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN rate_bucket."expiresAt" <= v_now THEN 1
      ELSE rate_bucket.count + 1
    END,
    "windowStart" = CASE
      WHEN rate_bucket."expiresAt" <= v_now THEN v_now
      ELSE rate_bucket."windowStart"
    END,
    "expiresAt" = CASE
      WHEN rate_bucket."expiresAt" <= v_now
        THEN v_now + (p_window_ms * interval '1 millisecond')
      ELSE rate_bucket."expiresAt"
    END,
    "updatedAt" = v_now
  RETURNING * INTO bucket;

  RETURN QUERY SELECT
    bucket.count <= p_limit,
    p_limit,
    CASE
      WHEN bucket.count <= p_limit THEN 0
      ELSE greatest(1, ceil(extract(epoch FROM (bucket."expiresAt" - v_now)))::integer)
    END;
END;
$$;

REVOKE ALL ON FUNCTION app_private.consume_rate_limit(text, integer, integer) FROM PUBLIC;
