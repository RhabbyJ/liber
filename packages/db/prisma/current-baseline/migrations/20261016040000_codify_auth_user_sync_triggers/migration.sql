-- Codify the Auth-to-application user sync that production runs. Production
-- received these definitions by hand from
-- docs/engineering/AUTH_SECURITY_FOLLOWUP_FORWARD.sql, outside this ledger.
-- Every earlier migration left an on_auth_user_updated trigger that fired on
-- any auth.users update and copied raw_user_meta_data->>'name' into
-- public."User".name, so on a database rebuilt from migrations any signed-in
-- user could rewrite their account name through supabase.auth.updateUser().
--
-- Signup inserts an empty name; the application stores the reviewed name.
-- Later Auth updates sync only an email change, and only when the email
-- actually changes. Function bodies are copied verbatim from that proposal so
-- the md5 hashes in docs/engineering/AUTH_USER_SYNC_DRIFT_CHECK.sql match
-- production, which stores them with CRLF line endings (the check ignores CR).
-- On production this replaces both functions and both triggers with identical
-- definitions. CREATE OR REPLACE TRIGGER needs only the TRIGGER privilege on
-- auth.users, not table ownership. Run the drift check against an existing
-- target first.

BEGIN;

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

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION app_private.handle_new_user();

CREATE OR REPLACE TRIGGER on_auth_user_updated
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

COMMIT;
