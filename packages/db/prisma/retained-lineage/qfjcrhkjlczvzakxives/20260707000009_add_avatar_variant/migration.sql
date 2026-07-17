-- Buyer profiles now use generated local avatar variants instead of uploaded
-- profile photos or arbitrary avatar URLs.
ALTER TABLE public."User"
ADD COLUMN IF NOT EXISTS "avatarVariant" TEXT;

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
  )
  ON CONFLICT (email) DO UPDATE
  SET
    id = EXCLUDED.id,
    name = COALESCE(NULLIF(EXCLUDED.name, ''), app_user.name),
    "updatedAt" = NOW();

  RETURN NEW;
END;
$$;

ALTER TABLE public."User"
DROP COLUMN IF EXISTS "avatarUrl";

DROP POLICY IF EXISTS "Profile photo owners can upload profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Profile photo owners can update profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Profile photo owners can delete profile photos" ON storage.objects;

-- Supabase protects storage metadata tables from direct deletes. Remove the
-- now-unused empty profile-photos bucket with the Storage API during deploy.
