CREATE OR REPLACE FUNCTION app_private.handle_update_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public."User" AS app_user
  SET
    email = NEW.email,
    name = COALESCE(NEW.raw_user_meta_data->>'name', app_user.name),
    "updatedAt" = NOW()
  WHERE app_user.id = NEW.id;

  RETURN NEW;
END;
$$;
