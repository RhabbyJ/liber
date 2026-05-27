CREATE OR REPLACE FUNCTION app_private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."User" AS app_user (
    id,
    email,
    name,
    "avatarUrl",
    roles,
    "createdAt",
    "updatedAt"
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'avatarUrl',
    ARRAY[]::public."UserRole"[],
    NOW(),
    NOW()
  )
  ON CONFLICT (email) DO UPDATE
  SET
    id = EXCLUDED.id,
    name = COALESCE(NULLIF(EXCLUDED.name, ''), app_user.name),
    "avatarUrl" = COALESCE(EXCLUDED."avatarUrl", app_user."avatarUrl"),
    "updatedAt" = NOW();

  RETURN NEW;
END;
$$;
