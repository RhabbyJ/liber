-- User ownership is bound to the immutable Supabase Auth UUID. Email is a
-- collision signal only; it must never move an application identity.

BEGIN;

-- Auth writes take this table first, then write public."User" through the
-- trigger. Matching that order drains in-flight uses of the old function and
-- avoids a lock-order inversion during the cutover.
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public."User" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    LEFT JOIN auth.users AS auth_user ON auth_user.id = app_user.id
    WHERE auth_user.id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'LIBER_AUTH_IDENTITY_ORPHAN',
      DETAIL = 'Every application User must match an auth.users primary key before identity hardening can continue.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."User" AS app_user
    JOIN auth.users AS auth_user ON auth_user.id = app_user.id
    WHERE lower(btrim(app_user.email)) IS DISTINCT FROM lower(btrim(auth_user.email))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LIBER_AUTH_IDENTITY_EMAIL_MISMATCH',
      DETAIL = 'Application and Auth email values must agree for the same UUID before identity hardening can continue.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."User"
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'LIBER_AUTH_IDENTITY_NORMALIZED_EMAIL_COLLISION',
      DETAIL = 'Case-insensitive application email collisions require explicit recovery before identity hardening can continue.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_normalized_key"
ON public."User" (lower(btrim(email)));

CREATE OR REPLACE FUNCTION app_private.prevent_user_id_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LIBER_USER_ID_IMMUTABLE',
      DETAIL = 'Application User.id is the permanent Supabase Auth UUID and cannot be changed.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_user_id_update ON public."User";
CREATE TRIGGER prevent_user_id_update
BEFORE UPDATE OF id ON public."User"
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_user_id_update();

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
      DETAIL = 'This email belongs to a different immutable Liber identity.',
      HINT = 'Recover or administratively purge the existing identity; never rebind its UUID.';
  END IF;

  INSERT INTO public."User" (
    id,
    email,
    name,
    roles,
    "createdAt",
    "updatedAt"
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    ARRAY[]::public."UserRole"[],
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.handle_update_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conflicting_user_id uuid;
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LIBER_AUTH_EMAIL_REQUIRED';
  END IF;

  SELECT app_user.id
  INTO conflicting_user_id
  FROM public."User" AS app_user
  WHERE lower(btrim(app_user.email)) = lower(btrim(NEW.email))
    AND app_user.id <> NEW.id
  LIMIT 1;

  IF conflicting_user_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'LIBER_IDENTITY_RECOVERY_REQUIRED',
      DETAIL = 'This email belongs to a different immutable Liber identity.',
      HINT = 'Resolve the identity collision explicitly; never rebind either UUID.';
  END IF;

  UPDATE public."User" AS app_user
  SET
    email = NEW.email,
    name = COALESCE(NEW.raw_user_meta_data->>'name', app_user.name),
    "updatedAt" = NOW()
  WHERE app_user.id = NEW.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'LIBER_AUTH_IDENTITY_MISSING',
      DETAIL = 'The Auth UUID has no matching application User.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_user_id_update() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.handle_update_user() FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public."User"
  DROP CONSTRAINT IF EXISTS "User_id_auth_users_fkey";
ALTER TABLE public."User"
  ADD CONSTRAINT "User_id_auth_users_fkey"
  FOREIGN KEY (id) REFERENCES auth.users(id)
  ON UPDATE RESTRICT ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE public."User"
  VALIDATE CONSTRAINT "User_id_auth_users_fkey";

ALTER TABLE public."BuyerProfile"
  DROP CONSTRAINT "BuyerProfile_userId_fkey",
  ADD CONSTRAINT "BuyerProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"(id)
    ON UPDATE RESTRICT ON DELETE CASCADE;

ALTER TABLE public."SellerProperty"
  DROP CONSTRAINT "SellerProperty_ownerUserId_fkey",
  ADD CONSTRAINT "SellerProperty_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES public."User"(id)
    ON UPDATE RESTRICT ON DELETE CASCADE;

ALTER TABLE public."VerificationDocument"
  DROP CONSTRAINT "VerificationDocument_userId_fkey",
  DROP CONSTRAINT "VerificationDocument_uploadedByUserId_fkey",
  DROP CONSTRAINT "VerificationDocument_reviewedByUserId_fkey",
  ADD CONSTRAINT "VerificationDocument_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  ADD CONSTRAINT "VerificationDocument_uploadedByUserId_fkey"
    FOREIGN KEY ("uploadedByUserId") REFERENCES public."User"(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  ADD CONSTRAINT "VerificationDocument_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES public."User"(id)
    ON UPDATE RESTRICT ON DELETE SET NULL;

ALTER TABLE public."Invite"
  DROP CONSTRAINT "Invite_sellerId_fkey",
  ADD CONSTRAINT "Invite_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES public."User"(id)
    ON UPDATE RESTRICT ON DELETE CASCADE;

ALTER TABLE public."Notification"
  DROP CONSTRAINT "Notification_userId_fkey",
  ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"(id)
    ON UPDATE RESTRICT ON DELETE CASCADE;

ALTER TABLE public."AdminAuditLog"
  DROP CONSTRAINT "AdminAuditLog_actorUserId_fkey",
  ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES public."User"(id)
    ON UPDATE RESTRICT ON DELETE SET NULL;

ALTER TABLE public."SellerAccess"
  DROP CONSTRAINT "SellerAccess_userId_fkey",
  DROP CONSTRAINT "SellerAccess_reviewedByUserId_fkey",
  ADD CONSTRAINT "SellerAccess_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  ADD CONSTRAINT "SellerAccess_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES public."User"(id)
    ON UPDATE RESTRICT ON DELETE SET NULL;

ALTER TABLE public."BuyerBadge"
  DROP CONSTRAINT "BuyerBadge_grantedByUserId_fkey",
  ADD CONSTRAINT "BuyerBadge_grantedByUserId_fkey"
    FOREIGN KEY ("grantedByUserId") REFERENCES public."User"(id)
    ON UPDATE RESTRICT ON DELETE SET NULL;

DROP INDEX IF EXISTS public."User_email_idx";

COMMENT ON CONSTRAINT "User_id_auth_users_fkey" ON public."User" IS
'Active Liber identities use the immutable auth.users primary key. Auth deletion is restricted until application retention and Storage cleanup are complete.';

COMMIT;
