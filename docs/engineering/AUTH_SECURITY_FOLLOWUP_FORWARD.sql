-- Unnumbered migration proposal. The CTO must assign the final migration number.
-- Prerequisite: 20260709000016_harden_auth_identity_ownership is installed.

BEGIN;

LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public."User" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public."EmailOutbox" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  index_expression text;
  index_is_valid boolean;
  index_is_unique boolean;
  index_method text;
  index_predicate text;
BEGIN
  SELECT
    pg_get_expr(pg_index.indexprs, pg_index.indrelid),
    pg_index.indisvalid,
    pg_index.indisunique,
    pg_am.amname,
    pg_get_expr(pg_index.indpred, pg_index.indrelid)
  INTO
    index_expression,
    index_is_valid,
    index_is_unique,
    index_method,
    index_predicate
  FROM pg_index
  JOIN pg_class AS index_class ON index_class.oid = pg_index.indexrelid
  JOIN pg_class AS table_class ON table_class.oid = pg_index.indrelid
  JOIN pg_namespace ON pg_namespace.oid = table_class.relnamespace
  JOIN pg_am ON pg_am.oid = index_class.relam
  WHERE pg_namespace.nspname = 'public'
    AND table_class.relname = 'User'
    AND index_class.relname = 'User_email_normalized_key'
    AND pg_index.indnkeyatts = 1;

  IF index_expression IS DISTINCT FROM 'lower(btrim(email))'
    OR index_is_valid IS DISTINCT FROM true
    OR index_is_unique IS DISTINCT FROM true
    OR index_method IS DISTINCT FROM 'btree'
    OR index_predicate IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LIBER_NORMALIZED_EMAIL_INDEX_INVALID',
      DETAIL = format(
        'Expected a valid, unique, non-partial btree index on lower(btrim(email)); expression=%s unique=%s valid=%s method=%s predicate=%s',
        index_expression,
        index_is_unique,
        index_is_valid,
        index_method,
        index_predicate
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_user_id uuid;
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LIBER_AUTH_EMAIL_REQUIRED';
  END IF;

  SELECT app_user.id
  INTO existing_user_id
  FROM public."User" AS app_user
  WHERE lower(btrim(app_user.email)) = lower(btrim(NEW.email))
  LIMIT 1;

  IF existing_user_id IS NOT NULL AND existing_user_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'LIBER_IDENTITY_RECOVERY_REQUIRED',
      DETAIL = 'This email belongs to a different immutable Liber identity.';
  END IF;

  BEGIN
    INSERT INTO public."User" (
      id,
      email,
      name,
      roles,
      "createdAt",
      "updatedAt"
    ) VALUES (
      NEW.id,
      NEW.email,
      '',
      ARRAY[]::public."UserRole"[],
      now(),
      now()
    );
  EXCEPTION WHEN unique_violation THEN
    IF EXISTS (
      SELECT 1
      FROM public."User" AS app_user
      WHERE lower(btrim(app_user.email)) = lower(btrim(NEW.email))
        AND app_user.id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'LIBER_IDENTITY_RECOVERY_REQUIRED',
        DETAIL = 'Concurrent registration found another immutable Liber identity for this email.';
    END IF;
    RAISE;
  END;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.handle_update_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LIBER_AUTH_EMAIL_REQUIRED';
  END IF;

  BEGIN
    UPDATE public."User"
    SET
      email = NEW.email,
      "updatedAt" = now()
    WHERE id = NEW.id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'LIBER_IDENTITY_RECOVERY_REQUIRED',
      DETAIL = 'The new email belongs to a different immutable Liber identity.';
  END;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'LIBER_AUTH_IDENTITY_MISSING';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
WHEN (OLD.email IS DISTINCT FROM NEW.email)
EXECUTE FUNCTION app_private.handle_update_user();

REVOKE ALL ON FUNCTION app_private.handle_new_user()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.handle_update_user()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON COLUMN public."User".name IS
'Authoritative private account name. Initialized only after a verified Liber callback/session and never synchronized from later user-editable Auth metadata.';

ALTER TABLE public."EmailOutbox"
  ADD COLUMN "recipientUserId" uuid,
  ADD COLUMN "cancelledAt" timestamp(3),
  ADD COLUMN "leaseToken" uuid,
  ADD COLUMN "leaseExpiresAt" timestamp(3);

UPDATE public."EmailOutbox" AS outbox
SET "recipientUserId" = app_user.id
FROM public."User" AS app_user
WHERE outbox."recipientUserId" IS NULL
  AND outbox."sentAt" IS NULL
  AND lower(btrim(outbox."to")) = lower(btrim(app_user.email));

UPDATE public."EmailOutbox"
SET
  "cancelledAt" = now(),
  "lastError" = 'LEGACY_SENDING_REQUIRES_RECONCILIATION',
  "nextAttemptAt" = NULL,
  status = 'FAILED'::public."EmailOutboxStatus",
  "updatedAt" = now()
WHERE status = 'SENDING'::public."EmailOutboxStatus"
  AND "sentAt" IS NULL
  AND "cancelledAt" IS NULL;

UPDATE public."EmailOutbox"
SET
  "leaseToken" = NULL,
  "leaseExpiresAt" = NULL,
  status = 'SENT'::public."EmailOutboxStatus",
  "updatedAt" = now()
WHERE status = 'SENDING'::public."EmailOutboxStatus"
  AND "sentAt" IS NOT NULL;

-- Legacy jobs that cannot be tied to an immutable application identity are never
-- sendable. Preserve them for audit instead of guessing from an email address.
UPDATE public."EmailOutbox"
SET
  "cancelledAt" = now(),
  "lastError" = 'UNMATCHED_LEGACY_RECIPIENT',
  "nextAttemptAt" = NULL,
  "leaseToken" = NULL,
  "leaseExpiresAt" = NULL,
  status = 'FAILED'::public."EmailOutboxStatus",
  "updatedAt" = now()
WHERE "recipientUserId" IS NULL
  AND "sentAt" IS NULL
  AND "cancelledAt" IS NULL;

ALTER TABLE public."EmailOutbox"
  ADD CONSTRAINT "EmailOutbox_sendable_recipient_check"
  CHECK (
    "sentAt" IS NOT NULL
    OR "cancelledAt" IS NOT NULL
    OR "recipientUserId" IS NOT NULL
  ) NOT VALID;

ALTER TABLE public."EmailOutbox"
  VALIDATE CONSTRAINT "EmailOutbox_sendable_recipient_check";

ALTER TABLE public."EmailOutbox"
  ADD CONSTRAINT "EmailOutbox_lease_state_check"
  CHECK (
    (
      status = 'SENDING'::public."EmailOutboxStatus"
      AND "sentAt" IS NULL
      AND "cancelledAt" IS NULL
      AND "recipientUserId" IS NOT NULL
      AND "leaseToken" IS NOT NULL
      AND "leaseExpiresAt" IS NOT NULL
    )
    OR (
      status <> 'SENDING'::public."EmailOutboxStatus"
      AND "leaseToken" IS NULL
      AND "leaseExpiresAt" IS NULL
    )
  ) NOT VALID;

ALTER TABLE public."EmailOutbox"
  VALIDATE CONSTRAINT "EmailOutbox_lease_state_check";

CREATE INDEX "EmailOutbox_recipientUserId_cancelledAt_idx"
ON public."EmailOutbox" ("recipientUserId", "cancelledAt");

CREATE INDEX "EmailOutbox_ready_claim_idx"
ON public."EmailOutbox" ("nextAttemptAt", "createdAt", id)
WHERE "sentAt" IS NULL
  AND "cancelledAt" IS NULL
  AND "recipientUserId" IS NOT NULL
  AND status IN (
    'PENDING'::public."EmailOutboxStatus",
    'FAILED'::public."EmailOutboxStatus"
  );

CREATE INDEX "EmailOutbox_expired_lease_idx"
ON public."EmailOutbox" ("leaseExpiresAt", "createdAt", id)
WHERE "sentAt" IS NULL
  AND "cancelledAt" IS NULL
  AND "recipientUserId" IS NOT NULL
  AND status = 'SENDING'::public."EmailOutboxStatus";

CREATE OR REPLACE FUNCTION app_private.claim_email_outbox(
  p_limit integer,
  p_lease_token uuid,
  p_lease_seconds integer,
  p_max_attempts integer
)
RETURNS SETOF public."EmailOutbox"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  request_time timestamptz := clock_timestamp();
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100
    OR p_lease_token IS NULL
    OR p_lease_seconds IS NULL OR p_lease_seconds < 1 OR p_lease_seconds > 3600
    OR p_max_attempts IS NULL OR p_max_attempts < 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'LIBER_EMAIL_OUTBOX_CLAIM_ARGUMENT_INVALID';
  END IF;

  RETURN QUERY
  WITH expired_terminal AS (
    UPDATE public."EmailOutbox" AS terminal
    SET
      status = 'FAILED'::public."EmailOutboxStatus",
      "lastError" = 'LEASE_EXPIRED_MAX_ATTEMPTS',
      "nextAttemptAt" = NULL,
      "leaseToken" = NULL,
      "leaseExpiresAt" = NULL,
      "updatedAt" = request_time
    WHERE terminal."sentAt" IS NULL
      AND terminal."cancelledAt" IS NULL
      AND terminal."recipientUserId" IS NOT NULL
      AND terminal.status = 'SENDING'::public."EmailOutboxStatus"
      AND terminal."leaseExpiresAt" <= request_time
      AND terminal.attempts >= p_max_attempts
    RETURNING terminal.id
  ),
  candidates AS MATERIALIZED (
    SELECT outbox.id
    FROM public."EmailOutbox" AS outbox
    WHERE outbox."sentAt" IS NULL
      AND outbox."cancelledAt" IS NULL
      AND outbox."recipientUserId" IS NOT NULL
      AND outbox.attempts < p_max_attempts
      AND (
        (
          outbox.status IN (
            'PENDING'::public."EmailOutboxStatus",
            'FAILED'::public."EmailOutboxStatus"
          )
          AND (
            outbox."nextAttemptAt" IS NULL
            OR outbox."nextAttemptAt" <= request_time
          )
        )
        OR (
          outbox.status = 'SENDING'::public."EmailOutboxStatus"
          AND outbox."leaseExpiresAt" <= request_time
        )
      )
    ORDER BY outbox."createdAt", outbox.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public."EmailOutbox" AS outbox
  SET
    status = 'SENDING'::public."EmailOutboxStatus",
    attempts = outbox.attempts + 1,
    "lastError" = NULL,
    "nextAttemptAt" = NULL,
    "leaseToken" = p_lease_token,
    "leaseExpiresAt" = request_time + make_interval(secs => p_lease_seconds),
    "updatedAt" = request_time
  FROM candidates
  WHERE outbox.id = candidates.id
  RETURNING outbox.*;
END;
$$;

REVOKE ALL ON FUNCTION app_private.claim_email_outbox(integer, uuid, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE app_private.rate_limit_buckets (
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

CREATE INDEX rate_limit_buckets_expires_at_idx
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

CREATE OR REPLACE FUNCTION app_private.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."User"
    WHERE id = (SELECT auth.uid())
      AND status = 'ACTIVE'::public."UserStatus"
  );
$$;

REVOKE ALL ON FUNCTION app_private.is_active_user() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_active_user() TO authenticated;

DROP POLICY IF EXISTS "Profile photo owners can upload profile photos" ON storage.objects;
CREATE POLICY "Profile photo owners can upload profile photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos'
  AND (SELECT app_private.is_active_user())
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "Profile photo owners can update profile photos" ON storage.objects;
CREATE POLICY "Profile photo owners can update profile photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (SELECT app_private.is_active_user())
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
)
WITH CHECK (
  bucket_id = 'profile-photos'
  AND (SELECT app_private.is_active_user())
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "Profile photo owners can delete profile photos" ON storage.objects;
CREATE POLICY "Profile photo owners can delete profile photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (SELECT app_private.is_active_user())
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE OR REPLACE FUNCTION app_private.owns_property(property_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."SellerProperty" AS property
    JOIN public."User" AS app_user ON app_user.id = property."ownerUserId"
    WHERE property.id = property_id
      AND property."ownerUserId" = (SELECT auth.uid())
      AND app_user.status = 'ACTIVE'::public."UserStatus"
  );
$$;

REVOKE ALL ON FUNCTION app_private.owns_property(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION app_private.owns_property(text) TO authenticated;

DROP POLICY IF EXISTS "Property owners can upload property images" ON storage.objects;
CREATE POLICY "Property owners can upload property images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'property-images'
  AND (SELECT app_private.owns_property((storage.foldername(name))[1]))
);

DROP POLICY IF EXISTS "Property owners can update property images" ON storage.objects;
CREATE POLICY "Property owners can update property images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'property-images'
  AND (SELECT app_private.owns_property((storage.foldername(name))[1]))
)
WITH CHECK (
  bucket_id = 'property-images'
  AND (SELECT app_private.owns_property((storage.foldername(name))[1]))
);

DROP POLICY IF EXISTS "Property owners can delete property images" ON storage.objects;
CREATE POLICY "Property owners can delete property images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'property-images'
  AND (SELECT app_private.owns_property((storage.foldername(name))[1]))
);

DROP POLICY IF EXISTS "Document owners can view own verification documents" ON storage.objects;
CREATE POLICY "Document owners can view own verification documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND (SELECT app_private.is_active_user())
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "Admins can view all verification documents" ON storage.objects;
-- Admin review remains server-mediated through the existing authenticated admin
-- route and a short-lived signed URL. Direct browser reads are intentionally absent.

DROP POLICY IF EXISTS "Document owners can upload verification documents" ON storage.objects;
CREATE POLICY "Document owners can upload verification documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'verification-documents'
  AND (SELECT app_private.is_active_user())
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE OR REPLACE FUNCTION app_private.suspend_identity(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_reason text,
  p_audit_id text
)
RETURNS TABLE (
  buyer_profiles_suspended integer,
  outbox_jobs_cancelled integer,
  seller_access_suspended integer,
  sessions_revoked integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  buyer_count integer;
  outbox_count integer;
  seller_count integer;
  session_count integer;
BEGIN
  IF p_actor_user_id = p_target_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LIBER_ADMIN_SELF_SUSPENSION_FORBIDDEN';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' OR p_audit_id IS NULL OR btrim(p_audit_id) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LIBER_SUSPENSION_AUDIT_INPUT_REQUIRED';
  END IF;

  PERFORM 1
  FROM public."User"
  WHERE id IN (p_actor_user_id, p_target_user_id)
  ORDER BY id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1
    FROM public."User"
    WHERE id = p_actor_user_id
      AND status = 'ACTIVE'::public."UserStatus"
      AND 'ADMIN'::public."UserRole" = ANY(roles)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LIBER_ACTIVE_ADMIN_REQUIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."User" WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'LIBER_SUSPENSION_TARGET_NOT_FOUND';
  END IF;

  UPDATE public."User"
  SET status = 'SUSPENDED'::public."UserStatus", "suspendedAt" = now(), "updatedAt" = now()
  WHERE id = p_target_user_id;

  UPDATE public."SellerAccess"
  SET status = 'SUSPENDED'::public."SellerAccessStatus", "updatedAt" = now()
  WHERE "userId" = p_target_user_id
    AND status IS DISTINCT FROM 'SUSPENDED'::public."SellerAccessStatus";
  GET DIAGNOSTICS seller_count = ROW_COUNT;

  UPDATE public."BuyerProfile"
  SET "visibilityStatus" = 'SUSPENDED'::public."BuyerVisibilityStatus", "updatedAt" = now()
  WHERE "userId" = p_target_user_id
    AND "visibilityStatus" IS DISTINCT FROM 'SUSPENDED'::public."BuyerVisibilityStatus";
  GET DIAGNOSTICS buyer_count = ROW_COUNT;

  UPDATE public."EmailOutbox"
  SET
    "cancelledAt" = now(),
    "lastError" = 'ACCOUNT_SUSPENDED',
    "nextAttemptAt" = NULL,
    "leaseToken" = NULL,
    "leaseExpiresAt" = NULL,
    status = 'FAILED'::public."EmailOutboxStatus",
    "updatedAt" = now()
  WHERE "recipientUserId" = p_target_user_id
    AND "sentAt" IS NULL
    AND "cancelledAt" IS NULL
    AND status IN (
      'PENDING'::public."EmailOutboxStatus",
      'FAILED'::public."EmailOutboxStatus"
    );
  GET DIAGNOSTICS outbox_count = ROW_COUNT;

  DELETE FROM auth.sessions WHERE user_id = p_target_user_id;
  GET DIAGNOSTICS session_count = ROW_COUNT;

  INSERT INTO public."AdminAuditLog" (
    id,
    "actorUserId",
    action,
    "targetType",
    "targetId",
    metadata,
    "createdAt"
  ) VALUES (
    p_audit_id,
    p_actor_user_id,
    'suspend_user',
    'user',
    p_target_user_id::text,
    jsonb_build_object(
      'authBan', 'pending',
      'buyerProfilesSuspended', buyer_count,
      'outboxJobsCancelled', outbox_count,
      'reason', p_reason,
      'sellerAccessSuspended', seller_count,
      'sessionsRevoked', session_count
    ),
    now()
  );

  RETURN QUERY SELECT buyer_count, outbox_count, seller_count, session_count;
END;
$$;

REVOKE ALL ON FUNCTION app_private.suspend_identity(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
