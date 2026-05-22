-- Keep auth-sensitive app tables and extension metadata closed to browser roles.
ALTER TABLE IF EXISTS public._prisma_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._prisma_migrations FROM anon, authenticated;

ALTER TABLE IF EXISTS public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon, authenticated;

DO $$
DECLARE
  estimated_extent regprocedure;
BEGIN
  FOR estimated_extent IN
    SELECT pg_proc.oid::regprocedure
    FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_proc.proname = 'st_estimatedextent'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', estimated_extent);
  END LOOP;
END $$;

-- Owner-scoped profile photo writes let the app use user-scoped Supabase clients.
DROP POLICY IF EXISTS "Profile photo owners can upload profile photos" ON storage.objects;
CREATE POLICY "Profile photo owners can upload profile photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "Profile photo owners can update profile photos" ON storage.objects;
CREATE POLICY "Profile photo owners can update profile photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
)
WITH CHECK (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "Profile photo owners can delete profile photos" ON storage.objects;
CREATE POLICY "Profile photo owners can delete profile photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "Document owners can delete verification documents" ON storage.objects;
CREATE POLICY "Document owners can delete verification documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

-- Preserve audit rows if an admin account is removed.
ALTER TABLE public."AdminAuditLog" DROP CONSTRAINT IF EXISTS "AdminAuditLog_actorUserId_fkey";
ALTER TABLE public."AdminAuditLog" ALTER COLUMN "actorUserId" DROP NOT NULL;
ALTER TABLE public."AdminAuditLog"
  ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES public."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Tighten integrity that was previously enforced only by application validators.
UPDATE public."User"
SET roles = ARRAY[]::public."UserRole"[]
WHERE roles IS NULL;
ALTER TABLE public."User" ALTER COLUMN roles SET NOT NULL;
DROP INDEX IF EXISTS public."User_email_idx";

ALTER TABLE public."BuyerProfile"
  ADD CONSTRAINT "BuyerProfile_budget_range_check"
  CHECK ("budgetMin" IS NULL OR "budgetMax" IS NULL OR "budgetMin" <= "budgetMax"),
  ADD CONSTRAINT "BuyerProfile_down_payment_range_check"
  CHECK ("downPaymentMin" IS NULL OR "downPaymentMax" IS NULL OR "downPaymentMin" <= "downPaymentMax"),
  ADD CONSTRAINT "BuyerProfile_lat_check"
  CHECK ("desiredLat" IS NULL OR ("desiredLat" >= -90 AND "desiredLat" <= 90)),
  ADD CONSTRAINT "BuyerProfile_lng_check"
  CHECK ("desiredLng" IS NULL OR ("desiredLng" >= -180 AND "desiredLng" <= 180));

ALTER TABLE public."BuyerCriteria"
  ADD CONSTRAINT "BuyerCriteria_price_range_check"
  CHECK ("priceMin" IS NULL OR "priceMax" IS NULL OR "priceMin" <= "priceMax"),
  ADD CONSTRAINT "BuyerCriteria_square_feet_range_check"
  CHECK ("squareFeetMin" IS NULL OR "squareFeetMax" IS NULL OR "squareFeetMin" <= "squareFeetMax"),
  ADD CONSTRAINT "BuyerCriteria_lot_size_range_check"
  CHECK ("lotSizeMin" IS NULL OR "lotSizeMax" IS NULL OR "lotSizeMin" <= "lotSizeMax"),
  ADD CONSTRAINT "BuyerCriteria_cap_rate_range_check"
  CHECK ("capRateMin" IS NULL OR "capRateMax" IS NULL OR "capRateMin" <= "capRateMax"),
  ADD CONSTRAINT "BuyerCriteria_units_range_check"
  CHECK ("unitsMin" IS NULL OR "unitsMax" IS NULL OR "unitsMin" <= "unitsMax"),
  ADD CONSTRAINT "BuyerCriteria_year_built_range_check"
  CHECK ("yearBuiltMin" IS NULL OR "yearBuiltMax" IS NULL OR "yearBuiltMin" <= "yearBuiltMax");

ALTER TABLE public."SellerProperty"
  ADD CONSTRAINT "SellerProperty_lat_check"
  CHECK (lat IS NULL OR (lat >= -90 AND lat <= 90)),
  ADD CONSTRAINT "SellerProperty_lng_check"
  CHECK (lng IS NULL OR (lng >= -180 AND lng <= 180));

ALTER TABLE public."VerificationDocument"
  ADD CONSTRAINT "VerificationDocument_one_subject_check"
  CHECK (((CASE WHEN "buyerProfileId" IS NULL THEN 0 ELSE 1 END) + (CASE WHEN "propertyId" IS NULL THEN 0 ELSE 1 END)) = 1);

ALTER TABLE public."Review"
  ADD CONSTRAINT "Review_rating_check"
  CHECK (rating >= 1 AND rating <= 5);

-- Query support for core v1 search, sorting, invite limits, and invite de-duplication.
CREATE INDEX IF NOT EXISTS "BuyerProfile_active_lastRefreshedAt_idx"
ON public."BuyerProfile"("lastRefreshedAt" DESC)
WHERE "visibilityStatus" = 'ACTIVE';

CREATE INDEX IF NOT EXISTS "BuyerProfile_active_ratingAverage_idx"
ON public."BuyerProfile"("ratingAverage" DESC)
WHERE "visibilityStatus" = 'ACTIVE';

CREATE INDEX IF NOT EXISTS "BuyerProfile_active_visibility_idx"
ON public."BuyerProfile"("id")
WHERE "visibilityStatus" = 'ACTIVE';

CREATE INDEX IF NOT EXISTS "Invite_sellerId_sentAt_idx"
ON public."Invite"("sellerId", "sentAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Invite_active_seller_buyer_property_key"
ON public."Invite"("sellerId", "buyerProfileId", "propertyId")
WHERE status IN ('SENT', 'VIEWED');
