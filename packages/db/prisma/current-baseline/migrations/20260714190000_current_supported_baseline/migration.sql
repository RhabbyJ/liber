-- GENERATED FILE. Run `npm run db:baseline:generate`; do not edit directly.
-- Supported only for a brand-new Liber schema on a current Supabase project.
-- Existing databases must continue to use packages/db/prisma/migrations.
-- Locked source cutoff: 20260714150654_add_guided_messaging_v1. Later migrations remain separate forward files.
-- The source ledger and SHA-256 checksums follow.
-- 20260519000000_initial ae7ac77fa9096303a0d2e22e44d2f4b64f71680c4b553c2b872e868aa4ef2da4
-- 20260520000001_tighten_property_image_storage_policy d285c1cb2d47f7d9a677840bac6c70d68dd1bdea6df7665c4fd26ff7fa597f62
-- 20260520000002_add_missing_foreign_key_indexes 046cbcbc563e016e70121d2c249a6e7e04b7bd63e8dcb7d1be5460fbcf08ef00
-- 20260520000003_add_profile_photos_bucket 9d2f019c842f167e9c34d0cad2cd4d29859955d0d1340a2354b76326334d5055
-- 20260520000004_enforce_unique_buyer_badges 58afbc572b72dd29c3046901c6573a03b30f923c683656655bff053ecd69b324
-- 20260521000005_audit_hardening bc1a1d296c21788c9289b4afc7e8c9f5bef99e977bb3888ca64e2e0c9f5321d8
-- 20260526000006_sprint1_security_hardening 3399d114c02759abc55cac295c2989cff70381fb4d855c0fd5f27a036f5b41e4
-- 20260526000007_harden_auth_user_sync fc874e9de3353e3f1e79484566c69b2edbed8eb97e5e27da582e767f340a6b90
-- 20260611000008_trim_v1_unused_schema beb31f6e899f5d5cd78336beb9425cd38af6dfc36d8ca78a8a1068e9fa23f638
-- 20260707000009_add_avatar_variant 22d8892fa82867af14ee2d5896e03539bd20de088a146b75a23986e33dae9190
-- 20260707000010_update_auth_user_avatar_trigger 15e68a3518875e7522c0c3410ee42604b303ca68fd7a8a36b5db8e8c70de21b8
-- 20260708000011_add_service_areas ba2dd566d5eb480274fdefe4a524ca98a0295b04f9edead9cb26e73bada42f2b
-- 20260708000012_add_property_subtypes_and_ownership_evidence e7defa4850808bbc20f2a2c345f29941b75c39a6b10d6a562a8374c112016dff
-- 20260709000013_add_markets_and_buyer_service_area_slugs bf1620124939451637a1e5092b4da0884cb03c556925984d2d992d1c0ee9b296
-- 20260709000014_add_search_rollup_relation_type 77c7951dedf997456559a548e747c0af08ee141ca3eaeed49c67705d08151804
-- 20260709000015_canonical_service_area_cutover 066b524ee7a12be3ff040d4ac8b5b84d086caba9e07e53da136864cb31df099b
-- 20260709000016_harden_auth_identity_ownership 9e7f102bf79b97dd377f7ec4ee2844940525006ebbe18e781d0264c8e3a84288
-- 20260711071555_complete_architecture_boundaries 0db6957c554dbd80515534d6f1e86d53591a626e339abe1882f9618d76f11c2a
-- 20260711082500_close_property_identity_lifecycle 8dd15201d0dc428a8cdd18c09801998178f65969b0eac92ddc46cc0ef11fd622
-- 20260712090000_expand_la_county_geography deca5831a19a37330ffffc7c64975274d609907e3954f1a3793f00d6514a7e73
-- 20260712100500_cover_service_area_search_term_market_fk db7b511ce4328660e63105024752058fd4a6272d01522ae0251c1035b39fea21
-- 20260713051527_harden_la_geography_security de3470a9c07367a732f77584ee26ba5619e1b4896904708d712a54d51a31d0e3
-- 20260713054016_close_public_function_defaults 3c1dd261786331e15b68ae5f6e2f16cb997f3a9d239d13cbf89d536a825b8aa8
-- 20260713054720_consolidate_service_area_prefix_index f5848ea36f026e71ac3b33dfed53e847daffc7c561d05e5e467f2e91cdf182d4
-- 20260713230000_fix_rate_limit_timestamp_variable 189e687bb1c58a3231c9e05597c63c0c2d4d7841e777d486ff6fca92d0c03fc8
-- 20260714150654_add_guided_messaging_v1 ca36a735915e36b38d3259785139fa185ba74868eee75f831c38d46204e3ba9d

-- Fail closed if this fresh-only path is pointed at an existing Liber database.
DO $$
BEGIN
  IF to_regclass('public."User"') IS NOT NULL
    OR to_regclass('public."Invite"') IS NOT NULL
    OR to_regclass('public.markets') IS NOT NULL THEN
    RAISE EXCEPTION 'The current Liber baseline may run only on a brand-new application schema.';
  END IF;
END
$$;

-- BEGIN SOURCE 20260519000000_initial (ae7ac77fa9096303a0d2e22e44d2f4b64f71680c4b553c2b872e868aa4ef2da4)
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BUYER', 'SELLER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BuyerVisibilityStatus" AS ENUM ('DRAFT', 'ACTIVE', 'HIDDEN', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PropertyCategory" AS ENUM ('HOME', 'LAND', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "PropertySubtype" AS ENUM ('HOME', 'MULTIFAMILY', 'RETAIL', 'STNL', 'INDUSTRIAL', 'LAND', 'OFFICE', 'OTHER');

-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('PRE_APPROVED', 'EARNEST_MONEY_DEPOSITED', 'CASH_BUYER', 'NON_CONTINGENT', 'VERIFIED_IDENTITY', 'VERIFIED_FUNDS', 'COMPLETED_TRANSACTION');

-- CreateEnum
CREATE TYPE "BadgeStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PropertyVerificationStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('OWNERSHIP', 'PRE_APPROVAL', 'VERIFIED_FUNDS', 'IDENTITY', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'VISIBLE', 'HIDDEN');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "roles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[],
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerProfile" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "buyerType" TEXT,
    "bio" TEXT,
    "buyingPurpose" TEXT,
    "desiredLocationText" TEXT,
    "desiredCity" TEXT,
    "desiredState" TEXT,
    "desiredLat" DECIMAL(10,7),
    "desiredLng" DECIMAL(10,7),
    "budgetMin" DECIMAL(12,2),
    "budgetMax" DECIMAL(12,2),
    "downPaymentMin" DECIMAL(12,2),
    "downPaymentMax" DECIMAL(12,2),
    "visibilityStatus" "BuyerVisibilityStatus" NOT NULL DEFAULT 'DRAFT',
    "profileCompleteness" INTEGER NOT NULL DEFAULT 0,
    "ratingAverage" DECIMAL(3,2),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerCriteria" (
    "id" TEXT NOT NULL,
    "buyerProfileId" TEXT NOT NULL,
    "propertyCategory" "PropertyCategory" NOT NULL,
    "propertySubtype" "PropertySubtype" NOT NULL,
    "priceMin" DECIMAL(12,2),
    "priceMax" DECIMAL(12,2),
    "squareFeetMin" INTEGER,
    "squareFeetMax" INTEGER,
    "lotSizeMin" INTEGER,
    "lotSizeMax" INTEGER,
    "bedroomsMin" INTEGER,
    "bathroomsMin" INTEGER,
    "capRateMin" DECIMAL(5,2),
    "capRateMax" DECIMAL(5,2),
    "unitsMin" INTEGER,
    "unitsMax" INTEGER,
    "yearBuiltMin" INTEGER,
    "yearBuiltMax" INTEGER,
    "condition" TEXT,
    "zoning" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extraCriteria" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerBadge" (
    "id" TEXT NOT NULL,
    "buyerProfileId" TEXT NOT NULL,
    "badgeType" "BadgeType" NOT NULL,
    "status" "BadgeStatus" NOT NULL DEFAULT 'PENDING',
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "verifiedByUserId" UUID,
    "source" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerProperty" (
    "id" TEXT NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "propertyType" "PropertySubtype" NOT NULL,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "garageArea" INTEGER,
    "squareFeet" INTEGER,
    "lotSize" INTEGER,
    "condition" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "price" DECIMAL(12,2),
    "ownershipVerificationStatus" "PropertyVerificationStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "flaggedForReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyImage" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationDocument" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "buyerProfileId" TEXT,
    "propertyId" TEXT,
    "documentType" "DocumentType" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "sellerId" UUID NOT NULL,
    "buyerProfileId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "reviewerId" UUID NOT NULL,
    "revieweeId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerProfile_userId_key" ON "BuyerProfile"("userId");

-- CreateIndex
CREATE INDEX "BuyerProfile_visibilityStatus_idx" ON "BuyerProfile"("visibilityStatus");

-- CreateIndex
CREATE INDEX "BuyerProfile_desiredCity_desiredState_idx" ON "BuyerProfile"("desiredCity", "desiredState");

-- CreateIndex
CREATE INDEX "BuyerProfile_budgetMin_budgetMax_idx" ON "BuyerProfile"("budgetMin", "budgetMax");

-- CreateIndex
CREATE INDEX "BuyerCriteria_buyerProfileId_idx" ON "BuyerCriteria"("buyerProfileId");

-- CreateIndex
CREATE INDEX "BuyerCriteria_propertyCategory_propertySubtype_idx" ON "BuyerCriteria"("propertyCategory", "propertySubtype");

-- CreateIndex
CREATE INDEX "BuyerCriteria_priceMin_priceMax_idx" ON "BuyerCriteria"("priceMin", "priceMax");

-- CreateIndex
CREATE INDEX "BuyerBadge_buyerProfileId_idx" ON "BuyerBadge"("buyerProfileId");

-- CreateIndex
CREATE INDEX "BuyerBadge_badgeType_status_idx" ON "BuyerBadge"("badgeType", "status");

-- CreateIndex
CREATE INDEX "BuyerBadge_expiresAt_idx" ON "BuyerBadge"("expiresAt");

-- CreateIndex
CREATE INDEX "SellerProperty_ownerUserId_idx" ON "SellerProperty"("ownerUserId");

-- CreateIndex
CREATE INDEX "SellerProperty_city_state_idx" ON "SellerProperty"("city", "state");

-- CreateIndex
CREATE INDEX "SellerProperty_propertyType_idx" ON "SellerProperty"("propertyType");

-- CreateIndex
CREATE INDEX "PropertyImage_propertyId_idx" ON "PropertyImage"("propertyId");

-- CreateIndex
CREATE INDEX "VerificationDocument_userId_idx" ON "VerificationDocument"("userId");

-- CreateIndex
CREATE INDEX "VerificationDocument_buyerProfileId_idx" ON "VerificationDocument"("buyerProfileId");

-- CreateIndex
CREATE INDEX "VerificationDocument_propertyId_idx" ON "VerificationDocument"("propertyId");

-- CreateIndex
CREATE INDEX "VerificationDocument_status_idx" ON "VerificationDocument"("status");

-- CreateIndex
CREATE INDEX "Invite_sellerId_idx" ON "Invite"("sellerId");

-- CreateIndex
CREATE INDEX "Invite_buyerProfileId_idx" ON "Invite"("buyerProfileId");

-- CreateIndex
CREATE INDEX "Invite_propertyId_idx" ON "Invite"("propertyId");

-- CreateIndex
CREATE INDEX "Invite_status_idx" ON "Invite"("status");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Review_revieweeId_status_idx" ON "Review"("revieweeId", "status");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorUserId_idx" ON "AdminAuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "BuyerProfile" ADD CONSTRAINT "BuyerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerCriteria" ADD CONSTRAINT "BuyerCriteria_buyerProfileId_fkey" FOREIGN KEY ("buyerProfileId") REFERENCES "BuyerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerBadge" ADD CONSTRAINT "BuyerBadge_buyerProfileId_fkey" FOREIGN KEY ("buyerProfileId") REFERENCES "BuyerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerBadge" ADD CONSTRAINT "BuyerBadge_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerProperty" ADD CONSTRAINT "SellerProperty_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyImage" ADD CONSTRAINT "PropertyImage_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "SellerProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationDocument" ADD CONSTRAINT "VerificationDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationDocument" ADD CONSTRAINT "VerificationDocument_buyerProfileId_fkey" FOREIGN KEY ("buyerProfileId") REFERENCES "BuyerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationDocument" ADD CONSTRAINT "VerificationDocument_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "SellerProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationDocument" ADD CONSTRAINT "VerificationDocument_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_buyerProfileId_fkey" FOREIGN KEY ("buyerProfileId") REFERENCES "BuyerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "SellerProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BuyerProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BuyerCriteria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BuyerBadge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SellerProperty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PropertyImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VerificationDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Invite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AdminAuditLog" ENABLE ROW LEVEL SECURITY;

-- Spatial indexes
CREATE INDEX IF NOT EXISTS buyer_profile_spatial_idx
ON public."BuyerProfile"
USING gist (
  geography(
    ST_SetSRID(
    ST_MakePoint(
      CAST("desiredLng" AS double precision),
      CAST("desiredLat" AS double precision)
    ),
    4326
    )
  )
)
WHERE "desiredLng" IS NOT NULL AND "desiredLat" IS NOT NULL;

CREATE INDEX IF NOT EXISTS seller_property_spatial_idx
ON public."SellerProperty"
USING gist (
  geography(
    ST_SetSRID(
    ST_MakePoint(
      CAST("lng" AS double precision),
      CAST("lat" AS double precision)
    ),
    4326
    )
  )
)
WHERE "lng" IS NOT NULL AND "lat" IS NOT NULL;

-- Private application functions
CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."User" (
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
BEGIN
  UPDATE public."User" AS app_user
  SET
    email = NEW.email,
    name = COALESCE(NEW.raw_user_meta_data->>'name', app_user.name),
    "avatarUrl" = COALESCE(NEW.raw_user_meta_data->>'avatarUrl', app_user."avatarUrl"),
    "updatedAt" = NOW()
  WHERE app_user.id = NEW.id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_invite_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  seller_status public."UserStatus";
  property_verification public."PropertyVerificationStatus";
  property_flagged_at timestamp(3);
  buyer_visibility public."BuyerVisibilityStatus";
  sent_count integer;
  daily_limit integer;
BEGIN
  SELECT status
  INTO seller_status
  FROM public."User"
  WHERE id = NEW."sellerId";

  IF seller_status IS NULL THEN
    RAISE EXCEPTION 'Seller not found.';
  END IF;

  IF seller_status = 'SUSPENDED' THEN
    RAISE EXCEPTION 'Suspended sellers cannot send invites.';
  END IF;

  SELECT "ownershipVerificationStatus", "flaggedForReviewAt"
  INTO property_verification, property_flagged_at
  FROM public."SellerProperty"
  WHERE id = NEW."propertyId" AND "ownerUserId" = NEW."sellerId";

  IF property_verification IS NULL THEN
    RAISE EXCEPTION 'Seller must own property before sending invites.';
  END IF;

  IF property_flagged_at IS NOT NULL THEN
    RAISE EXCEPTION 'Property is under review and cannot send invites.';
  END IF;

  SELECT "visibilityStatus"
  INTO buyer_visibility
  FROM public."BuyerProfile"
  WHERE id = NEW."buyerProfileId";

  IF buyer_visibility IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'Buyer profile must be active before receiving invites.';
  END IF;

  daily_limit := CASE WHEN property_verification = 'APPROVED' THEN 25 ELSE 5 END;

  SELECT COUNT(*)
  INTO sent_count
  FROM public."Invite"
  WHERE "sellerId" = NEW."sellerId"
    AND "sentAt" >= NOW() - INTERVAL '24 hours';

  IF sent_count >= daily_limit THEN
    RAISE EXCEPTION 'Seller invite rate limit reached.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION app_private.handle_new_user();

CREATE OR REPLACE TRIGGER on_auth_user_updated
AFTER UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION app_private.handle_update_user();

CREATE OR REPLACE TRIGGER before_invite_insert_enforce_rules
BEFORE INSERT ON public."Invite"
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_invite_rules();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('property-images', 'property-images', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp']),
  ('verification-documents', 'verification-documents', false, 20971520, ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies
CREATE POLICY "Property images are publicly readable"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'property-images');

CREATE POLICY "Property owners can upload property images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'property-images'
  AND EXISTS (
    SELECT 1
    FROM public."SellerProperty" property
    WHERE property.id = (storage.foldername(name))[1]
      AND property."ownerUserId" = (SELECT auth.uid())
  )
);

CREATE POLICY "Property owners can update property images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'property-images'
  AND EXISTS (
    SELECT 1
    FROM public."SellerProperty" property
    WHERE property.id = (storage.foldername(name))[1]
      AND property."ownerUserId" = (SELECT auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'property-images'
  AND EXISTS (
    SELECT 1
    FROM public."SellerProperty" property
    WHERE property.id = (storage.foldername(name))[1]
      AND property."ownerUserId" = (SELECT auth.uid())
  )
);

CREATE POLICY "Property owners can delete property images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'property-images'
  AND EXISTS (
    SELECT 1
    FROM public."SellerProperty" property
    WHERE property.id = (storage.foldername(name))[1]
      AND property."ownerUserId" = (SELECT auth.uid())
  )
);

CREATE POLICY "Document owners can view own verification documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "Admins can view all verification documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND EXISTS (
    SELECT 1
    FROM public."User" app_user
    WHERE app_user.id = (SELECT auth.uid())
      AND 'ADMIN'::public."UserRole" = ANY(app_user.roles)
  )
);

CREATE POLICY "Document owners can upload verification documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'verification-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "Document owners can update verification documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
)
WITH CHECK (
  bucket_id = 'verification-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);
-- END SOURCE 20260519000000_initial

-- BEGIN SOURCE 20260520000001_tighten_property_image_storage_policy (d285c1cb2d47f7d9a677840bac6c70d68dd1bdea6df7665c4fd26ff7fa597f62)
-- Public buckets do not need a broad storage.objects SELECT policy for public
-- object URL access. Keeping the policy allows bucket listing through storage
-- APIs, so remove it and leave owner-scoped write policies in place.
DROP POLICY IF EXISTS "Property images are publicly readable" ON storage.objects;
-- END SOURCE 20260520000001_tighten_property_image_storage_policy

-- BEGIN SOURCE 20260520000002_add_missing_foreign_key_indexes (046cbcbc563e016e70121d2c249a6e7e04b7bd63e8dcb7d1be5460fbcf08ef00)
-- Cover nullable foreign keys Supabase advisor flagged for delete/update performance.
CREATE INDEX IF NOT EXISTS "BuyerBadge_verifiedByUserId_idx" ON public."BuyerBadge"("verifiedByUserId");
CREATE INDEX IF NOT EXISTS "Review_reviewerId_idx" ON public."Review"("reviewerId");
CREATE INDEX IF NOT EXISTS "VerificationDocument_reviewedByUserId_idx" ON public."VerificationDocument"("reviewedByUserId");
-- END SOURCE 20260520000002_add_missing_foreign_key_indexes

-- BEGIN SOURCE 20260520000003_add_profile_photos_bucket (9d2f019c842f167e9c34d0cad2cd4d29859955d0d1340a2354b76326334d5055)
-- Buyer profile photos are public display assets. Uploads are mediated by
-- server actions after auth and ownership checks, so this bucket does not add
-- broad storage.objects SELECT policies that would allow bucket listing.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
-- END SOURCE 20260520000003_add_profile_photos_bucket

-- BEGIN SOURCE 20260520000004_enforce_unique_buyer_badges (58afbc572b72dd29c3046901c6573a03b30f923c683656655bff053ecd69b324)
CREATE UNIQUE INDEX IF NOT EXISTS "BuyerBadge_buyerProfileId_badgeType_key"
ON public."BuyerBadge"("buyerProfileId", "badgeType");
-- END SOURCE 20260520000004_enforce_unique_buyer_badges

-- BEGIN SOURCE 20260521000005_audit_hardening (bc1a1d296c21788c9289b4afc7e8c9f5bef99e977bb3888ca64e2e0c9f5321d8)
-- Keep auth-sensitive app tables and extension metadata closed to browser roles.
ALTER TABLE IF EXISTS public._prisma_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._prisma_migrations FROM anon, authenticated;


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
-- END SOURCE 20260521000005_audit_hardening

-- BEGIN SOURCE 20260526000006_sprint1_security_hardening (3399d114c02759abc55cac295c2989cff70381fb4d855c0fd5f27a036f5b41e4)
-- Sprint 1 durable seller approval, immutable documents, badge evidence, and email outbox.
CREATE TYPE "SellerAccessStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

CREATE TABLE "SellerAccess" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "status" "SellerAccessStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT,
    "templateName" TEXT,
    "payload" JSONB NOT NULL,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VerificationDocument"
  ADD COLUMN "uploadedByUserId" UUID,
  ADD COLUMN "fileSha256" TEXT,
  ADD COLUMN "fileSizeBytes" INTEGER,
  ADD COLUMN "mimeType" TEXT,
  ADD COLUMN "storageBucket" TEXT NOT NULL DEFAULT 'verification-documents',
  ADD COLUMN "originalFilename" TEXT,
  ADD COLUMN "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "reviewStatus" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewNotes" TEXT;

UPDATE "VerificationDocument"
SET
  "uploadedByUserId" = "userId",
  "reviewStatus" = status,
  "storageBucket" = 'verification-documents'
WHERE "uploadedByUserId" IS NULL;

ALTER TABLE "BuyerBadge"
  ADD COLUMN "grantedByUserId" UUID,
  ADD COLUMN "grantedAt" TIMESTAMP(3),
  ADD COLUMN "evidenceDocumentId" TEXT;

UPDATE "BuyerBadge"
SET source = COALESCE(source, 'LEGACY_ADMIN')
WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX "SellerAccess_userId_key" ON "SellerAccess"("userId");
CREATE INDEX "SellerAccess_status_idx" ON "SellerAccess"("status");
CREATE INDEX "SellerAccess_reviewedByUserId_idx" ON "SellerAccess"("reviewedByUserId");

CREATE INDEX "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox"("status", "nextAttemptAt");
CREATE INDEX "EmailOutbox_createdAt_idx" ON "EmailOutbox"("createdAt");

CREATE INDEX "VerificationDocument_uploadedByUserId_idx" ON "VerificationDocument"("uploadedByUserId");
CREATE INDEX "VerificationDocument_reviewStatus_idx" ON "VerificationDocument"("reviewStatus");
CREATE UNIQUE INDEX "VerificationDocument_storageBucket_storagePath_key" ON "VerificationDocument"("storageBucket", "storagePath");

CREATE INDEX "BuyerBadge_grantedByUserId_idx" ON "BuyerBadge"("grantedByUserId");
CREATE INDEX "BuyerBadge_evidenceDocumentId_idx" ON "BuyerBadge"("evidenceDocumentId");

ALTER TABLE "SellerAccess"
  ADD CONSTRAINT "SellerAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SellerAccess"
  ADD CONSTRAINT "SellerAccess_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VerificationDocument"
  ADD CONSTRAINT "VerificationDocument_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BuyerBadge"
  ADD CONSTRAINT "BuyerBadge_grantedByUserId_fkey"
  FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BuyerBadge"
  ADD CONSTRAINT "BuyerBadge_evidenceDocumentId_fkey"
  FOREIGN KEY ("evidenceDocumentId") REFERENCES "VerificationDocument"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public."SellerAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."EmailOutbox" ENABLE ROW LEVEL SECURITY;

-- Harden property-image storage checks against SellerProperty RLS surprises.
CREATE OR REPLACE FUNCTION app_private.owns_property(property_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public."SellerProperty" property
    WHERE property.id = property_id
      AND property."ownerUserId" = (SELECT auth.uid())
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.owns_property(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.owns_property(text) TO authenticated;

DROP POLICY IF EXISTS "Property owners can upload property images" ON storage.objects;
CREATE POLICY "Property owners can upload property images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'property-images'
  AND app_private.owns_property((storage.foldername(name))[1])
);

DROP POLICY IF EXISTS "Property owners can update property images" ON storage.objects;
CREATE POLICY "Property owners can update property images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'property-images'
  AND app_private.owns_property((storage.foldername(name))[1])
)
WITH CHECK (
  bucket_id = 'property-images'
  AND app_private.owns_property((storage.foldername(name))[1])
);

DROP POLICY IF EXISTS "Property owners can delete property images" ON storage.objects;
CREATE POLICY "Property owners can delete property images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'property-images'
  AND app_private.owns_property((storage.foldername(name))[1])
);

-- Verification evidence is immutable after upload. Service-role/admin review goes through server code.
DROP POLICY IF EXISTS "Document owners can update verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Document owners can delete verification documents" ON storage.objects;

CREATE OR REPLACE FUNCTION app_private.enforce_invite_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  seller_status public."UserStatus";
  seller_can_invite boolean;
  property_verification public."PropertyVerificationStatus";
  property_flagged_at timestamp(3);
  buyer_visibility public."BuyerVisibilityStatus";
  sent_count integer;
  daily_limit integer;
BEGIN
  SELECT
    status,
    ('ADMIN'::public."UserRole" = ANY(roles)) OR EXISTS (
      SELECT 1
      FROM public."SellerAccess" access
      WHERE access."userId" = NEW."sellerId"
        AND access.status = 'APPROVED'
    )
  INTO seller_status, seller_can_invite
  FROM public."User"
  WHERE id = NEW."sellerId";

  IF seller_status IS NULL THEN
    RAISE EXCEPTION 'Seller not found.';
  END IF;

  IF seller_status = 'SUSPENDED' THEN
    RAISE EXCEPTION 'Suspended sellers cannot send invites.';
  END IF;

  IF seller_can_invite IS NOT TRUE THEN
    RAISE EXCEPTION 'Seller directory access must be approved before sending invites.';
  END IF;

  SELECT "ownershipVerificationStatus", "flaggedForReviewAt"
  INTO property_verification, property_flagged_at
  FROM public."SellerProperty"
  WHERE id = NEW."propertyId" AND "ownerUserId" = NEW."sellerId";

  IF property_verification IS NULL THEN
    RAISE EXCEPTION 'Seller must own property before sending invites.';
  END IF;

  IF property_flagged_at IS NOT NULL THEN
    RAISE EXCEPTION 'Property is under review and cannot send invites.';
  END IF;

  SELECT "visibilityStatus"
  INTO buyer_visibility
  FROM public."BuyerProfile"
  WHERE id = NEW."buyerProfileId";

  IF buyer_visibility IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'Buyer profile must be active before receiving invites.';
  END IF;

  daily_limit := CASE WHEN property_verification = 'APPROVED' THEN 25 ELSE 5 END;

  SELECT COUNT(*)
  INTO sent_count
  FROM public."Invite"
  WHERE "sellerId" = NEW."sellerId"
    AND "sentAt" >= NOW() - INTERVAL '24 hours';

  IF sent_count >= daily_limit THEN
    RAISE EXCEPTION 'Seller invite rate limit reached.';
  END IF;

  RETURN NEW;
END;
$$;
-- END SOURCE 20260526000006_sprint1_security_hardening

-- BEGIN SOURCE 20260526000007_harden_auth_user_sync (fc874e9de3353e3f1e79484566c69b2edbed8eb97e5e27da582e767f340a6b90)
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
-- END SOURCE 20260526000007_harden_auth_user_sync

-- BEGIN SOURCE 20260611000008_trim_v1_unused_schema (beb31f6e899f5d5cd78336beb9425cd38af6dfc36d8ca78a8a1068e9fa23f638)
-- Trim over-engineered schema to the v1 CEO flow (residential-only, no review system).
-- All dropped tables/columns are empty or never written by application code.

-- 1. Remove the unused review/rating system (no code path ever creates a review).
DROP TABLE IF EXISTS public."Review";
DROP TYPE IF EXISTS "ReviewStatus";

DROP INDEX IF EXISTS "BuyerProfile_active_ratingAverage_idx";
ALTER TABLE public."BuyerProfile"
  DROP COLUMN IF EXISTS "ratingAverage",
  DROP COLUMN IF EXISTS "reviewCount";

-- 2. Remove unused User contact field.
ALTER TABLE public."User" DROP COLUMN IF EXISTS "phone";

-- 3. Remove commercial-real-estate criteria fields (v1 is residential-only).
ALTER TABLE public."BuyerCriteria"
  DROP CONSTRAINT IF EXISTS "BuyerCriteria_cap_rate_range_check",
  DROP CONSTRAINT IF EXISTS "BuyerCriteria_units_range_check",
  DROP CONSTRAINT IF EXISTS "BuyerCriteria_year_built_range_check";

ALTER TABLE public."BuyerCriteria"
  DROP COLUMN IF EXISTS "capRateMin",
  DROP COLUMN IF EXISTS "capRateMax",
  DROP COLUMN IF EXISTS "unitsMin",
  DROP COLUMN IF EXISTS "unitsMax",
  DROP COLUMN IF EXISTS "yearBuiltMax",
  DROP COLUMN IF EXISTS "zoning",
  DROP COLUMN IF EXISTS "extraCriteria";

-- 4. BuyerBadge: grantedBy is the single source of truth for who granted a badge.
ALTER TABLE public."BuyerBadge" DROP CONSTRAINT IF EXISTS "BuyerBadge_verifiedByUserId_fkey";
DROP INDEX IF EXISTS "BuyerBadge_verifiedByUserId_idx";
ALTER TABLE public."BuyerBadge" DROP COLUMN IF EXISTS "verifiedByUserId";

-- 5. VerificationDocument: reviewStatus is the single source of truth for review state.
DROP INDEX IF EXISTS "VerificationDocument_status_idx";
ALTER TABLE public."VerificationDocument" DROP COLUMN IF EXISTS "status";

-- 6. Shrink property enums to residential-only v1 values.
--    Re-add values with ALTER TYPE ... ADD VALUE when commercial/land returns.
ALTER TYPE "PropertyCategory" RENAME TO "PropertyCategory_old";
CREATE TYPE "PropertyCategory" AS ENUM ('HOME');
ALTER TABLE public."BuyerCriteria"
  ALTER COLUMN "propertyCategory" TYPE "PropertyCategory"
  USING ("propertyCategory"::text::"PropertyCategory");
DROP TYPE "PropertyCategory_old";

ALTER TYPE "PropertySubtype" RENAME TO "PropertySubtype_old";
CREATE TYPE "PropertySubtype" AS ENUM ('HOME');
ALTER TABLE public."BuyerCriteria"
  ALTER COLUMN "propertySubtype" TYPE "PropertySubtype"
  USING ("propertySubtype"::text::"PropertySubtype");
ALTER TABLE public."SellerProperty"
  ALTER COLUMN "propertyType" TYPE "PropertySubtype"
  USING ("propertyType"::text::"PropertySubtype");
DROP TYPE "PropertySubtype_old";
-- END SOURCE 20260611000008_trim_v1_unused_schema

-- BEGIN SOURCE 20260707000009_add_avatar_variant (22d8892fa82867af14ee2d5896e03539bd20de088a146b75a23986e33dae9190)
-- Generated buyer avatars are represented by allowlisted local variants.
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

-- Supabase protects storage metadata tables from direct deletes. Storage bucket
-- cleanup must run through the Storage API during deploy.
-- END SOURCE 20260707000009_add_avatar_variant

-- BEGIN SOURCE 20260707000010_update_auth_user_avatar_trigger (15e68a3518875e7522c0c3410ee42604b303ca68fd7a8a36b5db8e8c70de21b8)
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
-- END SOURCE 20260707000010_update_auth_user_avatar_trigger

-- BEGIN SOURCE 20260708000011_add_service_areas (ba2dd566d5eb480274fdefe4a524ca98a0295b04f9edead9cb26e73bada42f2b)
ALTER TABLE public."BuyerProfile"
ADD COLUMN "desiredNeighborhood" TEXT,
ADD COLUMN "desiredPostalCode" TEXT;

CREATE INDEX "BuyerProfile_desiredPostalCode_idx"
ON public."BuyerProfile"("desiredPostalCode");

CREATE INDEX "BuyerProfile_desiredNeighborhood_idx"
ON public."BuyerProfile"("desiredNeighborhood");

CREATE INDEX "BuyerProfile_active_desiredPostalCode_idx"
ON public."BuyerProfile"("desiredPostalCode")
WHERE "visibilityStatus" = 'ACTIVE' AND "desiredPostalCode" IS NOT NULL;

CREATE INDEX "BuyerProfile_active_desiredNeighborhood_idx"
ON public."BuyerProfile"("desiredNeighborhood")
WHERE "visibilityStatus" = 'ACTIVE' AND "desiredNeighborhood" IS NOT NULL;

CREATE INDEX "BuyerProfile_active_desiredCityState_idx"
ON public."BuyerProfile"("desiredCity", "desiredState")
WHERE "visibilityStatus" = 'ACTIVE';

CREATE TABLE public.service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  type text NOT NULL CHECK (type IN ('zip', 'city', 'neighborhood', 'custom')),
  postal_code text,
  city text,
  county text,
  state text NOT NULL DEFAULT 'CA',
  center_lat double precision NOT NULL,
  center_lng double precision NOT NULL,
  bbox_west double precision NOT NULL,
  bbox_south double precision NOT NULL,
  bbox_east double precision NOT NULL,
  bbox_north double precision NOT NULL,
  geojson_path text NOT NULL,
  source text NOT NULL,
  source_version text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_pilot boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX service_areas_active_type_idx
ON public.service_areas(active, type);

CREATE INDEX service_areas_postal_code_idx
ON public.service_areas(postal_code);

ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.service_areas TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_areas TO service_role;

CREATE POLICY "Active service areas are public metadata"
ON public.service_areas
FOR SELECT
TO anon, authenticated
USING (active = true);

INSERT INTO public.service_areas (
  slug,
  label,
  type,
  postal_code,
  city,
  county,
  state,
  center_lat,
  center_lng,
  bbox_west,
  bbox_south,
  bbox_east,
  bbox_north,
  geojson_path,
  source,
  source_version,
  active,
  is_pilot
)
VALUES
  ('burbank', 'Burbank', 'city', NULL, 'Burbank', 'Los Angeles County', 'CA', 34.182145, -118.325147, -118.370313, 34.142636, -118.279981, 34.221654, '/geo/service-areas/city/burbank.geojson', 'city_boundary', '2025', true, true),
  ('glendale', 'Glendale', 'city', NULL, 'Glendale', 'Los Angeles County', 'CA', 34.192976, -118.244698, -118.307812, 34.118761, -118.181583, 34.267190, '/geo/service-areas/city/glendale.geojson', 'city_boundary', '2025', true, true),
  ('encino', 'Encino', 'neighborhood', NULL, 'Los Angeles', 'Los Angeles County', 'CA', 34.157161, -118.503514, -118.537387, 34.127695, -118.469641, 34.186627, '/geo/service-areas/neighborhood/encino.geojson', 'curated', 'manual_v1', true, true),
  ('northridge', 'Northridge', 'neighborhood', NULL, 'Los Angeles', 'Los Angeles County', 'CA', 34.233923, -118.536252, -118.571048, 34.208401, -118.501456, 34.259444, '/geo/service-areas/neighborhood/northridge.geojson', 'curated', 'manual_v1', true, true),
  ('tarzana', 'Tarzana', 'neighborhood', NULL, 'Los Angeles', 'Los Angeles County', 'CA', 34.155030, -118.548062, -118.568895, 34.125824, -118.527229, 34.184236, '/geo/service-areas/neighborhood/tarzana.geojson', 'curated', 'manual_v1', true, true),
  ('91316', '91316', 'zip', '91316', 'Encino', 'Los Angeles County', 'CA', 34.157311, -118.517578, -118.537387, 34.127995, -118.497769, 34.186627, '/geo/service-areas/zip/91316.geojson', 'census_zcta', '2020', true, true),
  ('91324', '91324', 'zip', '91324', 'Northridge', 'Los Angeles County', 'CA', 34.239278, -118.551692, -118.571048, 34.219552, -118.532336, 34.259003, '/geo/service-areas/zip/91324.geojson', 'census_zcta', '2020', true, true),
  ('91325', '91325', 'zip', '91325', 'Northridge', 'Los Angeles County', 'CA', 34.233923, -118.519279, -118.537102, 34.208401, -118.501456, 34.259444, '/geo/service-areas/zip/91325.geojson', 'census_zcta', '2020', true, true),
  ('91326', '91326', 'zip', '91326', 'Porter Ranch', 'Los Angeles County', 'CA', 34.280368, -118.556347, -118.591990, 34.257259, -118.520704, 34.303478, '/geo/service-areas/zip/91326.geojson', 'census_zcta', '2020', true, true),
  ('91356', '91356', 'zip', '91356', 'Tarzana', 'Los Angeles County', 'CA', 34.155030, -118.548062, -118.568895, 34.125824, -118.527229, 34.184236, '/geo/service-areas/zip/91356.geojson', 'census_zcta', '2020', true, true),
  ('91364', '91364', 'zip', '91364', 'Woodland Hills', 'Los Angeles County', 'CA', 34.151854, -118.599919, -118.638446, 34.130383, -118.561392, 34.173325, '/geo/service-areas/zip/91364.geojson', 'census_zcta', '2020', true, true),
  ('91367', '91367', 'zip', '91367', 'Woodland Hills', 'Los Angeles County', 'CA', 34.174856, -118.615182, -118.668163, 34.158817, -118.562201, 34.190895, '/geo/service-areas/zip/91367.geojson', 'census_zcta', '2020', true, true),
  ('91423', '91423', 'zip', '91423', 'Sherman Oaks', 'Los Angeles County', 'CA', 34.146700, -118.433314, -118.455860, 34.126725, -118.410769, 34.166675, '/geo/service-areas/zip/91423.geojson', 'census_zcta', '2020', true, true),
  ('91436', '91436', 'zip', '91436', 'Encino', 'Los Angeles County', 'CA', 34.153899, -118.491287, -118.512932, 34.127695, -118.469641, 34.180103, '/geo/service-areas/zip/91436.geojson', 'census_zcta', '2020', true, true),
  ('91604', '91604', 'zip', '91604', 'Studio City', 'Los Angeles County', 'CA', 34.139536, -118.391708, -118.422502, 34.122436, -118.360915, 34.156636, '/geo/service-areas/zip/91604.geojson', 'census_zcta', '2020', true, true)
ON CONFLICT (slug) DO UPDATE
SET
  label = EXCLUDED.label,
  type = EXCLUDED.type,
  postal_code = EXCLUDED.postal_code,
  city = EXCLUDED.city,
  county = EXCLUDED.county,
  state = EXCLUDED.state,
  center_lat = EXCLUDED.center_lat,
  center_lng = EXCLUDED.center_lng,
  bbox_west = EXCLUDED.bbox_west,
  bbox_south = EXCLUDED.bbox_south,
  bbox_east = EXCLUDED.bbox_east,
  bbox_north = EXCLUDED.bbox_north,
  geojson_path = EXCLUDED.geojson_path,
  source = EXCLUDED.source,
  source_version = EXCLUDED.source_version,
  active = EXCLUDED.active,
  is_pilot = EXCLUDED.is_pilot,
  updated_at = now();
-- END SOURCE 20260708000011_add_service_areas

-- BEGIN SOURCE 20260708000012_add_property_subtypes_and_ownership_evidence (e7defa4850808bbc20f2a2c345f29941b75c39a6b10d6a562a8374c112016dff)
-- Add CEO-requested v1 property subtype choices and typed seller ownership evidence.

ALTER TYPE "PropertySubtype" ADD VALUE IF NOT EXISTS 'CONDO';
ALTER TYPE "PropertySubtype" ADD VALUE IF NOT EXISTS 'TOWNHOUSE';
ALTER TYPE "PropertySubtype" ADD VALUE IF NOT EXISTS 'MANUFACTURED';
ALTER TYPE "PropertySubtype" ADD VALUE IF NOT EXISTS 'LAND';

DO $$
BEGIN
  CREATE TYPE "OwnershipEvidenceKind" AS ENUM ('GOVERNMENT_ID', 'PROPERTY_ADDRESS_PROOF');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public."VerificationDocument"
  ADD COLUMN IF NOT EXISTS "ownershipEvidenceKind" "OwnershipEvidenceKind";

CREATE INDEX IF NOT EXISTS "VerificationDocument_propertyId_ownershipEvidenceKind_idx"
  ON public."VerificationDocument"("propertyId", "ownershipEvidenceKind");
-- END SOURCE 20260708000012_add_property_subtypes_and_ownership_evidence

-- BEGIN SOURCE 20260709000013_add_markets_and_buyer_service_area_slugs (bf1620124939451637a1e5092b4da0884cb03c556925984d2d992d1c0ee9b296)
BEGIN;

CREATE TYPE "BuyerDesiredServiceAreaSource" AS ENUM ('SELECTED', 'DERIVED', 'MIGRATED');
CREATE TYPE "ServiceAreaRelationType" AS ENUM ('CONTAINS', 'OVERLAPS', 'DISPLAY_PARENT');

CREATE TABLE public.markets (
  slug text PRIMARY KEY,
  label text NOT NULL,
  state text NOT NULL,
  country text NOT NULL,
  center_lat double precision NOT NULL,
  center_lng double precision NOT NULL,
  bbox_west double precision NOT NULL,
  bbox_south double precision NOT NULL,
  bbox_east double precision NOT NULL,
  bbox_north double precision NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT markets_slug_check CHECK (slug ~ '^[a-z0-9-]{1,80}$'),
  CONSTRAINT markets_label_check CHECK (btrim(label) <> ''),
  CONSTRAINT markets_state_check CHECK (state ~ '^[A-Z]{2}$'),
  CONSTRAINT markets_country_check CHECK (country ~ '^[A-Z]{2}$'),
  CONSTRAINT markets_center_lat_check CHECK (center_lat BETWEEN -90 AND 90),
  CONSTRAINT markets_center_lng_check CHECK (center_lng BETWEEN -180 AND 180),
  CONSTRAINT markets_center_within_bbox_check CHECK (
    center_lng BETWEEN bbox_west AND bbox_east
    AND center_lat BETWEEN bbox_south AND bbox_north
  ),
  CONSTRAINT markets_bbox_lat_check CHECK (
    bbox_south BETWEEN -90 AND 90
    AND bbox_north BETWEEN -90 AND 90
    AND bbox_south < bbox_north
  ),
  CONSTRAINT markets_bbox_lng_check CHECK (
    bbox_west BETWEEN -180 AND 180
    AND bbox_east BETWEEN -180 AND 180
    AND bbox_west < bbox_east
  )
);

INSERT INTO public.markets (
  slug,
  label,
  state,
  country,
  center_lat,
  center_lng,
  bbox_west,
  bbox_south,
  bbox_east,
  bbox_north,
  active
)
VALUES (
  'los-angeles',
  'Los Angeles',
  'CA',
  'US',
  34.2111195,
  -118.424873,
  -118.668163,
  34.118761,
  -118.181583,
  34.303478,
  true
)
ON CONFLICT (slug) DO UPDATE
SET
  label = EXCLUDED.label,
  state = EXCLUDED.state,
  country = EXCLUDED.country,
  center_lat = EXCLUDED.center_lat,
  center_lng = EXCLUDED.center_lng,
  bbox_west = EXCLUDED.bbox_west,
  bbox_south = EXCLUDED.bbox_south,
  bbox_east = EXCLUDED.bbox_east,
  bbox_north = EXCLUDED.bbox_north,
  active = EXCLUDED.active,
  updated_at = now();

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.markets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.markets TO service_role;

CREATE POLICY "Active markets are public metadata"
ON public.markets
FOR SELECT
TO anon, authenticated
USING (active = true);

ALTER TABLE public.service_areas
ADD COLUMN market_slug text NOT NULL DEFAULT 'los-angeles',
ADD COLUMN search_terms text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.service_areas
ADD CONSTRAINT service_areas_market_slug_fkey
FOREIGN KEY (market_slug) REFERENCES public.markets(slug)
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX service_areas_market_active_type_idx
ON public.service_areas(market_slug, active, type);

CREATE INDEX service_areas_search_terms_gin_idx
ON public.service_areas USING GIN(search_terms);

UPDATE public.service_areas
SET search_terms = CASE slug
  WHEN 'burbank' THEN ARRAY['burbank', 'burbank ca']
  WHEN 'glendale' THEN ARRAY['glendale', 'glendale ca']
  WHEN 'encino' THEN ARRAY['encino', 'encino ca', 'encino 91316', 'encino 91436', '91316', '91436']
  WHEN 'northridge' THEN ARRAY['northridge', 'northridge ca', 'northridge 91324', 'northridge 91325', '91324', '91325']
  WHEN 'tarzana' THEN ARRAY['tarzana', 'tarzana ca', 'tarzana 91356', '91356']
  WHEN '91316' THEN ARRAY['91316', 'encino', 'encino ca', 'encino 91316']
  WHEN '91324' THEN ARRAY['91324', 'northridge', 'northridge ca', 'northridge 91324']
  WHEN '91325' THEN ARRAY['91325', 'northridge', 'northridge ca', 'northridge 91325']
  WHEN '91326' THEN ARRAY['91326', 'porter ranch', 'porter ranch ca', 'porter ranch 91326']
  WHEN '91356' THEN ARRAY['91356', 'tarzana', 'tarzana ca', 'tarzana 91356']
  WHEN '91364' THEN ARRAY['91364', 'woodland hills', 'woodland hills ca', 'woodland hills 91364']
  WHEN '91367' THEN ARRAY['91367', 'woodland hills', 'woodland hills ca', 'woodland hills 91367']
  WHEN '91423' THEN ARRAY['91423', 'sherman oaks', 'sherman oaks ca', 'sherman oaks 91423']
  WHEN '91436' THEN ARRAY['91436', 'encino', 'encino ca', 'encino 91436']
  WHEN '91604' THEN ARRAY['91604', 'studio city', 'studio city ca', 'studio city 91604']
  ELSE ARRAY[slug, label]
END;

ALTER TABLE public.service_areas
ALTER COLUMN market_slug DROP DEFAULT;

CREATE TABLE public.service_area_relationships (
  parent_service_area_slug text NOT NULL,
  child_service_area_slug text NOT NULL,
  relation_type "ServiceAreaRelationType" NOT NULL DEFAULT 'DISPLAY_PARENT',
  source text NOT NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_area_relationships_pkey
    PRIMARY KEY (parent_service_area_slug, child_service_area_slug, relation_type),
  CONSTRAINT service_area_relationships_parent_service_area_slug_fkey
    FOREIGN KEY (parent_service_area_slug)
    REFERENCES public.service_areas(slug)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT service_area_relationships_child_service_area_slug_fkey
    FOREIGN KEY (child_service_area_slug)
    REFERENCES public.service_areas(slug)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX service_area_relationships_child_service_area_slug_idx
ON public.service_area_relationships(child_service_area_slug);

CREATE INDEX service_area_relationships_parent_service_area_slug_idx
ON public.service_area_relationships(parent_service_area_slug);

ALTER TABLE public.service_area_relationships ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.service_area_relationships TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_area_relationships TO service_role;

CREATE POLICY "Service area relationships are public metadata"
ON public.service_area_relationships
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.service_areas parent
    WHERE parent.slug = parent_service_area_slug
      AND parent.active = true
  )
  AND EXISTS (
    SELECT 1
    FROM public.service_areas child
    WHERE child.slug = child_service_area_slug
      AND child.active = true
  )
);

INSERT INTO public.service_area_relationships (
  parent_service_area_slug,
  child_service_area_slug,
  relation_type,
  source,
  reviewed_at
)
VALUES
  ('encino', '91316', 'DISPLAY_PARENT', 'manual_v1', now()),
  ('encino', '91436', 'DISPLAY_PARENT', 'manual_v1', now()),
  ('northridge', '91324', 'DISPLAY_PARENT', 'manual_v1', now()),
  ('northridge', '91325', 'DISPLAY_PARENT', 'manual_v1', now()),
  ('tarzana', '91356', 'DISPLAY_PARENT', 'manual_v1', now())
ON CONFLICT (parent_service_area_slug, child_service_area_slug, relation_type) DO UPDATE
SET
  source = EXCLUDED.source,
  reviewed_at = EXCLUDED.reviewed_at,
  updated_at = now();

CREATE TABLE public.buyer_desired_service_areas (
  buyer_profile_id text NOT NULL,
  service_area_slug text NOT NULL,
  source "BuyerDesiredServiceAreaSource" NOT NULL DEFAULT 'SELECTED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buyer_desired_service_areas_pkey PRIMARY KEY (buyer_profile_id, service_area_slug),
  CONSTRAINT buyer_desired_service_areas_buyer_profile_id_fkey
    FOREIGN KEY (buyer_profile_id)
    REFERENCES public."BuyerProfile"(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT buyer_desired_service_areas_service_area_slug_fkey
    FOREIGN KEY (service_area_slug)
    REFERENCES public.service_areas(slug)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX buyer_desired_service_areas_service_area_slug_idx
ON public.buyer_desired_service_areas(service_area_slug);

CREATE INDEX buyer_desired_service_areas_buyer_profile_id_idx
ON public.buyer_desired_service_areas(buyer_profile_id);

ALTER TABLE public.buyer_desired_service_areas ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyer_desired_service_areas TO service_role;

-- Legacy buyer backfill is intentionally deferred to the corrective canonical
-- cutover migration, which applies ZIP -> neighborhood -> city precedence and
-- quarantines conflicting or unresolved profiles.

COMMIT;
-- END SOURCE 20260709000013_add_markets_and_buyer_service_area_slugs

-- BEGIN SOURCE 20260709000014_add_search_rollup_relation_type (77c7951dedf997456559a548e747c0af08ee141ca3eaeed49c67705d08151804)
ALTER TYPE "ServiceAreaRelationType" ADD VALUE IF NOT EXISTS 'SEARCH_ROLLUP';
-- END SOURCE 20260709000014_add_search_rollup_relation_type

-- BEGIN SOURCE 20260709000015_canonical_service_area_cutover (066b524ee7a12be3ff040d4ac8b5b84d086caba9e07e53da136864cb31df099b)
BEGIN;

-- Freeze the profile -> selection write order before taking legacy snapshots.
LOCK TABLE public."BuyerProfile" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.buyer_desired_service_areas IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.markets
ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.markets
ADD CONSTRAINT markets_slug_key UNIQUE (slug);

ALTER TABLE public.service_areas
DROP CONSTRAINT service_areas_market_slug_fkey;

ALTER TABLE public.markets DROP CONSTRAINT markets_pkey;
ALTER TABLE public.markets ADD CONSTRAINT markets_pkey PRIMARY KEY (id);

ALTER TABLE public.service_areas
ADD COLUMN market_id uuid,
ADD COLUMN source_license text,
ADD COLUMN source_url text,
ADD COLUMN geojson_sha256 text;

ALTER TABLE public.service_areas
ALTER COLUMN state DROP DEFAULT,
ALTER COLUMN active SET DEFAULT false,
ALTER COLUMN is_pilot SET DEFAULT false,
ADD CONSTRAINT service_areas_center_lat_check CHECK (center_lat BETWEEN -90 AND 90),
ADD CONSTRAINT service_areas_center_lng_check CHECK (center_lng BETWEEN -180 AND 180),
ADD CONSTRAINT service_areas_slug_check CHECK (slug ~ '^[a-z0-9-]{1,80}$'),
ADD CONSTRAINT service_areas_label_check CHECK (btrim(label) <> ''),
ADD CONSTRAINT service_areas_state_check CHECK (state ~ '^[A-Z]{2}$'),
ADD CONSTRAINT service_areas_source_check CHECK (btrim(source) <> ''),
ADD CONSTRAINT service_areas_source_version_check CHECK (btrim(source_version) <> ''),
ADD CONSTRAINT service_areas_geojson_path_check CHECK (btrim(geojson_path) <> ''),
ADD CONSTRAINT service_areas_zip_postal_code_check CHECK (
  type <> 'zip' OR (postal_code IS NOT NULL AND postal_code ~ '^[0-9]{5}$')
),
ADD CONSTRAINT service_areas_geojson_sha256_check CHECK (
  geojson_sha256 IS NULL OR geojson_sha256 ~ '^[a-f0-9]{64}$'
),
ADD CONSTRAINT service_areas_center_within_bbox_check CHECK (
  center_lng BETWEEN bbox_west AND bbox_east
  AND center_lat BETWEEN bbox_south AND bbox_north
),
ADD CONSTRAINT service_areas_bbox_lat_check CHECK (
  bbox_south BETWEEN -90 AND 90
  AND bbox_north BETWEEN -90 AND 90
  AND bbox_south < bbox_north
),
ADD CONSTRAINT service_areas_bbox_lng_check CHECK (
  bbox_west BETWEEN -180 AND 180
  AND bbox_east BETWEEN -180 AND 180
  AND bbox_west < bbox_east
);

UPDATE public.service_areas service_area
SET market_id = market.id
FROM public.markets market
WHERE market.slug = service_area.market_slug;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.service_areas service_area
    JOIN public.markets market ON market.id = service_area.market_id
    WHERE upper(trim(service_area.state)) <> upper(trim(market.state))
  ) THEN
    RAISE EXCEPTION 'Canonical service-area state must match its market state.';
  END IF;
END;
$$;

ALTER TABLE public.service_areas
ALTER COLUMN market_id SET NOT NULL,
ADD CONSTRAINT service_areas_market_id_fkey
  FOREIGN KEY (market_id) REFERENCES public.markets(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT service_areas_market_id_slug_key UNIQUE (market_id, slug),
ADD CONSTRAINT service_areas_market_id_postal_code_key UNIQUE (market_id, postal_code);

CREATE TABLE public.service_area_migration_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_profile_id text NOT NULL UNIQUE,
  reason text NOT NULL,
  candidate_service_area_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  legacy_location jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_area_migration_quarantine_reason_check CHECK (
    reason IN (
      'MULTIPLE_SELECTED_AREAS',
      'AMBIGUOUS_LEGACY_LOCATION',
      'MIGRATED_REVIEW_REQUIRED',
      'UNRESOLVED_LEGACY_LOCATION'
    )
  ),
  CONSTRAINT service_area_migration_quarantine_candidates_check CHECK (
    jsonb_typeof(candidate_service_area_ids) = 'array'
  ),
  CONSTRAINT service_area_migration_quarantine_legacy_location_check CHECK (
    jsonb_typeof(legacy_location) = 'object'
  ),
  CONSTRAINT service_area_migration_quarantine_resolution_check CHECK (
    (resolved_at IS NULL AND resolution IS NULL)
    OR (
      resolved_at IS NOT NULL
      AND resolution IS NOT NULL
      AND jsonb_typeof(resolution) = 'object'
      AND resolution ?& ARRAY['actorUserId', 'serviceAreaId', 'source']
      AND jsonb_typeof(resolution->'actorUserId') = 'string'
      AND jsonb_typeof(resolution->'serviceAreaId') = 'string'
      AND jsonb_typeof(resolution->'source') = 'string'
    )
  ),
  CONSTRAINT service_area_migration_quarantine_buyer_profile_id_fkey
    FOREIGN KEY (buyer_profile_id)
    REFERENCES public."BuyerProfile"(id)
    ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE INDEX service_area_migration_quarantine_reason_resolved_at_idx
ON public.service_area_migration_quarantine(reason, resolved_at);

ALTER TABLE public.service_area_migration_quarantine ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_area_migration_quarantine FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.service_area_migration_quarantine TO service_role;

ALTER TABLE public.buyer_desired_service_areas
ADD COLUMN service_area_id uuid,
ADD COLUMN is_primary boolean NOT NULL DEFAULT true;

UPDATE public.buyer_desired_service_areas buyer_area
SET service_area_id = service_area.id
FROM public.service_areas service_area
WHERE service_area.slug = buyer_area.service_area_slug;

CREATE TEMP TABLE legacy_buyer_location_snapshots ON COMMIT DROP AS
SELECT
  buyer_profile.id AS buyer_profile_id,
  jsonb_build_object(
    'desiredPostalCode', buyer_profile."desiredPostalCode",
    'desiredNeighborhood', buyer_profile."desiredNeighborhood",
    'desiredCity', buyer_profile."desiredCity",
    'desiredState', buyer_profile."desiredState",
    'desiredLat', buyer_profile."desiredLat",
    'desiredLng', buyer_profile."desiredLng",
    'desiredLocationText', buyer_profile."desiredLocationText",
    'legacyCountryContract', 'US_STATE_CODE'
  ) AS legacy_location
FROM public."BuyerProfile" buyer_profile;

CREATE UNIQUE INDEX legacy_buyer_location_snapshots_profile_idx
ON legacy_buyer_location_snapshots(buyer_profile_id);

INSERT INTO public.service_area_migration_quarantine (
  buyer_profile_id,
  reason,
  candidate_service_area_ids,
  legacy_location
)
SELECT
  buyer_area.buyer_profile_id,
  'MULTIPLE_SELECTED_AREAS',
  jsonb_agg(DISTINCT buyer_area.service_area_id ORDER BY buyer_area.service_area_id),
  snapshot.legacy_location
FROM public.buyer_desired_service_areas buyer_area
JOIN public."BuyerProfile" buyer_profile ON buyer_profile.id = buyer_area.buyer_profile_id
JOIN legacy_buyer_location_snapshots snapshot ON snapshot.buyer_profile_id = buyer_area.buyer_profile_id
WHERE buyer_area.source = 'SELECTED'
GROUP BY buyer_area.buyer_profile_id, buyer_profile.id, snapshot.legacy_location
HAVING count(*) > 1
ON CONFLICT (buyer_profile_id) DO UPDATE
SET
  reason = EXCLUDED.reason,
  candidate_service_area_ids = EXCLUDED.candidate_service_area_ids,
  legacy_location = EXCLUDED.legacy_location,
  resolved_at = NULL,
  updated_at = now();

DELETE FROM public.buyer_desired_service_areas buyer_area
USING public.service_area_migration_quarantine quarantine
WHERE quarantine.buyer_profile_id = buyer_area.buyer_profile_id;

DELETE FROM public.buyer_desired_service_areas
WHERE source IN ('DERIVED', 'MIGRATED');

CREATE TEMP TABLE canonical_service_area_candidates ON COMMIT DROP AS
SELECT
  buyer_profile.id AS buyer_profile_id,
  service_area.id AS service_area_id,
  1 AS priority,
  'ZIP'::text AS match_kind
FROM public."BuyerProfile" buyer_profile
JOIN public.service_areas service_area
  ON service_area.type = 'zip'
  AND buyer_profile."desiredPostalCode" IS NOT NULL
  AND buyer_profile."desiredPostalCode" = service_area.postal_code
  AND buyer_profile."desiredState" IS NOT NULL
  AND upper(trim(buyer_profile."desiredState")) = upper(trim(service_area.state))
JOIN public.markets market
  ON market.id = service_area.market_id
  AND market.country = 'US'
WHERE service_area.active = true AND market.active = true
UNION ALL
SELECT buyer_profile.id, service_area.id, 2, 'NEIGHBORHOOD'
FROM public."BuyerProfile" buyer_profile
JOIN public.service_areas service_area
  ON service_area.type = 'neighborhood'
  AND buyer_profile."desiredNeighborhood" IS NOT NULL
  AND lower(trim(buyer_profile."desiredNeighborhood")) = lower(trim(service_area.label))
  AND buyer_profile."desiredState" IS NOT NULL
  AND upper(trim(buyer_profile."desiredState")) = upper(trim(service_area.state))
JOIN public.markets market
  ON market.id = service_area.market_id
  AND market.country = 'US'
WHERE service_area.active = true AND market.active = true
UNION ALL
SELECT buyer_profile.id, service_area.id, 3, 'CITY'
FROM public."BuyerProfile" buyer_profile
JOIN public.service_areas service_area
  ON service_area.type = 'city'
  AND buyer_profile."desiredCity" IS NOT NULL
  AND lower(trim(buyer_profile."desiredCity")) = lower(trim(coalesce(service_area.city, service_area.label)))
  AND buyer_profile."desiredState" IS NOT NULL
  AND upper(trim(buyer_profile."desiredState")) = upper(trim(service_area.state))
JOIN public.markets market
  ON market.id = service_area.market_id
  AND market.country = 'US'
WHERE service_area.active = true AND market.active = true;

CREATE INDEX canonical_service_area_candidates_profile_priority_idx
ON canonical_service_area_candidates(buyer_profile_id, priority, service_area_id);

CREATE TEMP TABLE canonical_best_priorities ON COMMIT DROP AS
SELECT buyer_profile_id, min(priority) AS priority
FROM canonical_service_area_candidates
GROUP BY buyer_profile_id;

CREATE UNIQUE INDEX canonical_best_priorities_profile_idx
ON canonical_best_priorities(buyer_profile_id);

CREATE TEMP TABLE canonical_best_candidates ON COMMIT DROP AS
SELECT candidate.buyer_profile_id, candidate.service_area_id, candidate.priority, candidate.match_kind
FROM canonical_service_area_candidates candidate
JOIN canonical_best_priorities best
  ON best.buyer_profile_id = candidate.buyer_profile_id
  AND best.priority = candidate.priority;

CREATE INDEX canonical_best_candidates_profile_idx
ON canonical_best_candidates(buyer_profile_id, service_area_id);

INSERT INTO public.service_area_migration_quarantine (
  buyer_profile_id,
  reason,
  candidate_service_area_ids,
  legacy_location
)
SELECT
  candidate.buyer_profile_id,
  'AMBIGUOUS_LEGACY_LOCATION',
  jsonb_agg(DISTINCT candidate.service_area_id ORDER BY candidate.service_area_id),
  snapshot.legacy_location
FROM canonical_best_candidates candidate
JOIN legacy_buyer_location_snapshots snapshot ON snapshot.buyer_profile_id = candidate.buyer_profile_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.buyer_desired_service_areas selected
  WHERE selected.buyer_profile_id = candidate.buyer_profile_id
    AND selected.source = 'SELECTED'
)
  AND NOT EXISTS (
    SELECT 1
    FROM public.service_area_migration_quarantine quarantine
    WHERE quarantine.buyer_profile_id = candidate.buyer_profile_id
      AND quarantine.resolved_at IS NULL
  )
GROUP BY candidate.buyer_profile_id, snapshot.legacy_location
HAVING count(DISTINCT candidate.service_area_id) > 1
ON CONFLICT (buyer_profile_id) DO UPDATE
SET
  reason = EXCLUDED.reason,
  candidate_service_area_ids = EXCLUDED.candidate_service_area_ids,
  legacy_location = EXCLUDED.legacy_location,
  resolved_at = NULL,
  updated_at = now();

INSERT INTO public.service_area_migration_quarantine (
  buyer_profile_id,
  reason,
  candidate_service_area_ids,
  legacy_location
)
SELECT
  candidate.buyer_profile_id,
  'MIGRATED_REVIEW_REQUIRED',
  jsonb_agg(DISTINCT candidate.service_area_id ORDER BY candidate.service_area_id),
  snapshot.legacy_location
FROM canonical_best_candidates candidate
JOIN legacy_buyer_location_snapshots snapshot ON snapshot.buyer_profile_id = candidate.buyer_profile_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.buyer_desired_service_areas selected
  WHERE selected.buyer_profile_id = candidate.buyer_profile_id
    AND selected.source = 'SELECTED'
)
  AND NOT EXISTS (
    SELECT 1
    FROM public.service_area_migration_quarantine quarantine
    WHERE quarantine.buyer_profile_id = candidate.buyer_profile_id
      AND quarantine.resolved_at IS NULL
  )
GROUP BY candidate.buyer_profile_id, snapshot.legacy_location
HAVING count(DISTINCT candidate.service_area_id) = 1
ON CONFLICT (buyer_profile_id) DO UPDATE
SET
  reason = EXCLUDED.reason,
  candidate_service_area_ids = EXCLUDED.candidate_service_area_ids,
  legacy_location = EXCLUDED.legacy_location,
  resolved_at = NULL,
  updated_at = now();

INSERT INTO public.service_area_migration_quarantine (
  buyer_profile_id,
  reason,
  candidate_service_area_ids,
  legacy_location
)
SELECT
  buyer_profile.id,
  'UNRESOLVED_LEGACY_LOCATION',
  '[]'::jsonb,
  snapshot.legacy_location
FROM public."BuyerProfile" buyer_profile
JOIN legacy_buyer_location_snapshots snapshot ON snapshot.buyer_profile_id = buyer_profile.id
WHERE NOT EXISTS (
    SELECT 1
    FROM public.buyer_desired_service_areas selected
    WHERE selected.buyer_profile_id = buyer_profile.id
      AND selected.source = 'SELECTED'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM canonical_best_candidates candidate
    WHERE candidate.buyer_profile_id = buyer_profile.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.service_area_migration_quarantine quarantine
    WHERE quarantine.buyer_profile_id = buyer_profile.id
      AND quarantine.resolved_at IS NULL
  )
  AND (
    buyer_profile."visibilityStatus" = 'ACTIVE'
    OR buyer_profile."desiredPostalCode" IS NOT NULL
    OR buyer_profile."desiredNeighborhood" IS NOT NULL
    OR buyer_profile."desiredCity" IS NOT NULL
    OR buyer_profile."desiredState" IS NOT NULL
    OR buyer_profile."desiredLat" IS NOT NULL
    OR buyer_profile."desiredLng" IS NOT NULL
    OR buyer_profile."desiredLocationText" IS NOT NULL
  )
ON CONFLICT (buyer_profile_id) DO UPDATE
SET
  reason = EXCLUDED.reason,
  candidate_service_area_ids = EXCLUDED.candidate_service_area_ids,
  legacy_location = EXCLUDED.legacy_location,
  resolved_at = NULL,
  updated_at = now();

UPDATE public."BuyerProfile" buyer_profile
SET
  "desiredLocationText" = CASE
    WHEN service_area.type = 'zip' AND service_area.city IS NOT NULL
      THEN service_area.city || ', ' || service_area.state || ' ' || service_area.postal_code
    ELSE service_area.label || ', ' || service_area.state
  END,
  "desiredCity" = CASE
    WHEN service_area.type = 'neighborhood' THEN service_area.label
    ELSE coalesce(service_area.city, service_area.label)
  END,
  "desiredNeighborhood" = CASE WHEN service_area.type = 'neighborhood' THEN service_area.label ELSE NULL END,
  "desiredPostalCode" = service_area.postal_code,
  "desiredState" = service_area.state,
  "desiredLat" = service_area.center_lat,
  "desiredLng" = service_area.center_lng
FROM public.buyer_desired_service_areas buyer_area
JOIN public.service_areas service_area ON service_area.id = buyer_area.service_area_id
WHERE buyer_area.buyer_profile_id = buyer_profile.id
  AND buyer_area.is_primary = true;

UPDATE public."BuyerProfile" buyer_profile
SET "visibilityStatus" = 'DRAFT'
WHERE buyer_profile."visibilityStatus" = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM public.buyer_desired_service_areas buyer_area
    JOIN public.service_areas service_area ON service_area.id = buyer_area.service_area_id
    JOIN public.markets market ON market.id = service_area.market_id
    WHERE buyer_area.buyer_profile_id = buyer_profile.id
      AND buyer_area.source = 'SELECTED'
      AND buyer_area.is_primary = true
      AND service_area.active = true
      AND market.active = true
  );

DROP INDEX IF EXISTS public."BuyerProfile_desiredCity_desiredState_idx";
DROP INDEX IF EXISTS public."BuyerProfile_desiredPostalCode_idx";
DROP INDEX IF EXISTS public."BuyerProfile_desiredNeighborhood_idx";
DROP INDEX IF EXISTS public."BuyerProfile_active_desiredPostalCode_idx";
DROP INDEX IF EXISTS public."BuyerProfile_active_desiredNeighborhood_idx";
DROP INDEX IF EXISTS public."BuyerProfile_active_desiredCityState_idx";

DROP INDEX IF EXISTS public.buyer_desired_service_areas_service_area_slug_idx;
DROP INDEX IF EXISTS public.buyer_desired_service_areas_buyer_profile_id_idx;

ALTER TABLE public.buyer_desired_service_areas
ALTER COLUMN service_area_id SET NOT NULL,
DROP CONSTRAINT buyer_desired_service_areas_pkey,
DROP CONSTRAINT buyer_desired_service_areas_buyer_profile_id_fkey,
DROP CONSTRAINT buyer_desired_service_areas_service_area_slug_fkey,
DROP COLUMN service_area_slug,
ADD CONSTRAINT buyer_desired_service_areas_pkey PRIMARY KEY (buyer_profile_id, service_area_id),
ADD CONSTRAINT buyer_desired_service_areas_buyer_profile_id_key UNIQUE (buyer_profile_id),
ADD CONSTRAINT buyer_desired_service_areas_buyer_profile_id_fkey
  FOREIGN KEY (buyer_profile_id) REFERENCES public."BuyerProfile"(id)
  ON DELETE CASCADE ON UPDATE RESTRICT,
ADD CONSTRAINT buyer_desired_service_areas_service_area_id_fkey
  FOREIGN KEY (service_area_id) REFERENCES public.service_areas(id)
  ON DELETE CASCADE ON UPDATE RESTRICT,
ADD CONSTRAINT buyer_desired_service_areas_selected_source_check CHECK (source = 'SELECTED'),
ADD CONSTRAINT buyer_desired_service_areas_primary_check CHECK (is_primary = true);

CREATE INDEX buyer_desired_service_areas_service_area_id_buyer_profile_id_idx
ON public.buyer_desired_service_areas(service_area_id, buyer_profile_id);

DROP POLICY "Service area relationships are public metadata"
ON public.service_area_relationships;

INSERT INTO public.service_area_relationships (
  parent_service_area_slug,
  child_service_area_slug,
  relation_type,
  source,
  reviewed_at
)
SELECT
  parent_service_area_slug,
  child_service_area_slug,
  'SEARCH_ROLLUP'::"ServiceAreaRelationType",
  source,
  reviewed_at
FROM public.service_area_relationships
WHERE relation_type = 'DISPLAY_PARENT'
  AND reviewed_at IS NOT NULL
ON CONFLICT (parent_service_area_slug, child_service_area_slug, relation_type) DO NOTHING;

ALTER TABLE public.service_area_relationships
ADD COLUMN parent_service_area_id uuid,
ADD COLUMN child_service_area_id uuid;

UPDATE public.service_area_relationships relationship
SET
  parent_service_area_id = parent.id,
  child_service_area_id = child.id
FROM public.service_areas parent, public.service_areas child
WHERE parent.slug = relationship.parent_service_area_slug
  AND child.slug = relationship.child_service_area_slug;

DROP INDEX IF EXISTS public.service_area_relationships_child_service_area_slug_idx;
DROP INDEX IF EXISTS public.service_area_relationships_parent_service_area_slug_idx;

ALTER TABLE public.service_area_relationships
ALTER COLUMN parent_service_area_id SET NOT NULL,
ALTER COLUMN child_service_area_id SET NOT NULL,
DROP CONSTRAINT service_area_relationships_pkey,
DROP CONSTRAINT service_area_relationships_parent_service_area_slug_fkey,
DROP CONSTRAINT service_area_relationships_child_service_area_slug_fkey,
DROP COLUMN parent_service_area_slug,
DROP COLUMN child_service_area_slug,
ADD CONSTRAINT service_area_relationships_pkey
  PRIMARY KEY (parent_service_area_id, child_service_area_id, relation_type),
ADD CONSTRAINT service_area_relationships_parent_service_area_id_fkey
  FOREIGN KEY (parent_service_area_id) REFERENCES public.service_areas(id)
  ON DELETE CASCADE ON UPDATE RESTRICT,
ADD CONSTRAINT service_area_relationships_child_service_area_id_fkey
  FOREIGN KEY (child_service_area_id) REFERENCES public.service_areas(id)
  ON DELETE CASCADE ON UPDATE RESTRICT,
ADD CONSTRAINT service_area_relationships_distinct_areas_check
  CHECK (parent_service_area_id <> child_service_area_id);

CREATE INDEX service_area_relationships_child_type_reviewed_idx
ON public.service_area_relationships(child_service_area_id, relation_type, reviewed_at);
CREATE INDEX service_area_relationships_parent_type_reviewed_idx
ON public.service_area_relationships(parent_service_area_id, relation_type, reviewed_at);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.service_area_relationships relationship
    JOIN public.service_areas parent ON parent.id = relationship.parent_service_area_id
    JOIN public.service_areas child ON child.id = relationship.child_service_area_id
    WHERE parent.market_id <> child.market_id
  ) THEN
    RAISE EXCEPTION 'Service-area relationships must stay within one market.';
  END IF;

  IF EXISTS (
    WITH RECURSIVE paths(origin_id, service_area_id) AS (
      SELECT relationship.parent_service_area_id, relationship.child_service_area_id
      FROM public.service_area_relationships relationship
      WHERE relationship.relation_type = 'SEARCH_ROLLUP'::public."ServiceAreaRelationType"
        AND relationship.reviewed_at IS NOT NULL
      UNION
      SELECT paths.origin_id, relationship.child_service_area_id
      FROM paths
      JOIN public.service_area_relationships relationship
        ON relationship.parent_service_area_id = paths.service_area_id
      WHERE relationship.relation_type = 'SEARCH_ROLLUP'::public."ServiceAreaRelationType"
        AND relationship.reviewed_at IS NOT NULL
    )
    SELECT 1
    FROM paths
    WHERE origin_id = service_area_id
  ) THEN
    RAISE EXCEPTION 'Reviewed SEARCH_ROLLUP relationships cannot contain cycles.';
  END IF;
END;
$$;

DROP POLICY "Active service areas are public metadata" ON public.service_areas;
CREATE POLICY "Active service areas in active markets are public metadata"
ON public.service_areas
FOR SELECT
TO anon, authenticated
USING (
  active = true
  AND EXISTS (
    SELECT 1
    FROM public.markets market
    WHERE market.id = market_id
      AND market.active = true
  )
);

CREATE POLICY "Reviewed relationships in active markets are public metadata"
ON public.service_area_relationships
FOR SELECT
TO anon, authenticated
USING (
  reviewed_at IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.service_areas parent
    JOIN public.markets market ON market.id = parent.market_id
    WHERE parent.id = parent_service_area_id
      AND parent.active = true
      AND market.active = true
  )
  AND EXISTS (
    SELECT 1
    FROM public.service_areas child
    WHERE child.id = child_service_area_id
      AND child.active = true
  )
);

DROP INDEX IF EXISTS public.service_areas_market_active_type_idx;

ALTER TABLE public.service_areas
DROP CONSTRAINT service_areas_slug_key,
DROP COLUMN market_slug;

CREATE INDEX service_areas_market_id_active_type_idx
ON public.service_areas(market_id, active, type);

CREATE OR REPLACE FUNCTION app_private.prevent_geography_id_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION '% primary keys are immutable.', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_geography_id_update() FROM PUBLIC;

CREATE TRIGGER markets_immutable_id
BEFORE UPDATE OF id ON public.markets
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_geography_id_update();

CREATE TRIGGER service_areas_immutable_id
BEFORE UPDATE OF id ON public.service_areas
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_geography_id_update();

CREATE OR REPLACE FUNCTION app_private.prevent_service_area_market_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.market_id IS DISTINCT FROM OLD.market_id THEN
    RAISE EXCEPTION 'Service-area market membership is immutable; create a new canonical area instead.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_service_area_market_update() FROM PUBLIC;

CREATE TRIGGER service_areas_immutable_market
BEFORE UPDATE OF market_id ON public.service_areas
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_service_area_market_update();

CREATE OR REPLACE FUNCTION app_private.prevent_market_jurisdiction_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state OR NEW.country IS DISTINCT FROM OLD.country THEN
    RAISE EXCEPTION 'Market jurisdiction is immutable; create a new market instead.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_market_jurisdiction_update() FROM PUBLIC;

CREATE TRIGGER markets_immutable_jurisdiction
BEFORE UPDATE OF state, country ON public.markets
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_market_jurisdiction_update();

CREATE OR REPLACE FUNCTION app_private.enforce_service_area_market_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  market_state text;
BEGIN
  SELECT market.state
  INTO market_state
  FROM public.markets market
  WHERE market.id = NEW.market_id;

  IF market_state IS NULL OR upper(trim(NEW.state)) <> upper(trim(market_state)) THEN
    RAISE EXCEPTION 'Canonical service-area state must match its market state.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_service_area_market_state() FROM PUBLIC;

CREATE TRIGGER service_areas_market_state_check
BEFORE INSERT OR UPDATE OF market_id, state
ON public.service_areas
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_service_area_market_state();

CREATE OR REPLACE FUNCTION app_private.prevent_buyer_service_area_identity_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.buyer_profile_id IS DISTINCT FROM OLD.buyer_profile_id
    OR NEW.service_area_id IS DISTINCT FROM OLD.service_area_id THEN
    RAISE EXCEPTION 'Buyer service-area identity is immutable; delete and recreate the selection.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_buyer_service_area_identity_update() FROM PUBLIC;

CREATE TRIGGER buyer_desired_service_area_immutable_identity
BEFORE UPDATE OF buyer_profile_id, service_area_id
ON public.buyer_desired_service_areas
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_buyer_service_area_identity_update();

CREATE OR REPLACE FUNCTION app_private.preserve_service_area_quarantine_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.buyer_profile_id IS DISTINCT FROM OLD.buyer_profile_id
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.candidate_service_area_ids IS DISTINCT FROM OLD.candidate_service_area_ids
    OR NEW.legacy_location IS DISTINCT FROM OLD.legacy_location
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Geography quarantine evidence is immutable.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.resolved_at IS NOT NULL
    AND (NEW.resolved_at IS DISTINCT FROM OLD.resolved_at OR NEW.resolution IS DISTINCT FROM OLD.resolution) THEN
    RAISE EXCEPTION 'A resolved geography quarantine audit cannot be changed.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.preserve_service_area_quarantine_audit() FROM PUBLIC;

CREATE TRIGGER service_area_quarantine_preserve_audit
BEFORE UPDATE ON public.service_area_migration_quarantine
FOR EACH ROW
EXECUTE FUNCTION app_private.preserve_service_area_quarantine_audit();

CREATE OR REPLACE FUNCTION app_private.enforce_service_area_relationship_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  parent_market_id uuid;
  child_market_id uuid;
BEGIN
  SELECT service_area.market_id INTO parent_market_id
  FROM public.service_areas service_area
  WHERE service_area.id = NEW.parent_service_area_id;

  SELECT service_area.market_id INTO child_market_id
  FROM public.service_areas service_area
  WHERE service_area.id = NEW.child_service_area_id;

  IF parent_market_id IS NULL OR child_market_id IS NULL OR parent_market_id <> child_market_id THEN
    RAISE EXCEPTION 'Service-area relationships must stay within one market.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.relation_type = 'SEARCH_ROLLUP'::public."ServiceAreaRelationType"
    AND NEW.reviewed_at IS NOT NULL THEN
    PERFORM 1
    FROM public.markets market
    WHERE market.id = parent_market_id
    FOR UPDATE;

    IF EXISTS (
      WITH RECURSIVE descendants(id) AS (
        SELECT relationship.child_service_area_id
        FROM public.service_area_relationships relationship
        WHERE relationship.parent_service_area_id = NEW.child_service_area_id
          AND relationship.relation_type = 'SEARCH_ROLLUP'::public."ServiceAreaRelationType"
          AND relationship.reviewed_at IS NOT NULL
        UNION
        SELECT relationship.child_service_area_id
        FROM public.service_area_relationships relationship
        JOIN descendants parent ON parent.id = relationship.parent_service_area_id
        WHERE relationship.relation_type = 'SEARCH_ROLLUP'::public."ServiceAreaRelationType"
          AND relationship.reviewed_at IS NOT NULL
      )
      SELECT 1 FROM descendants WHERE id = NEW.parent_service_area_id
    ) THEN
      RAISE EXCEPTION 'Reviewed SEARCH_ROLLUP relationships cannot contain cycles.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_service_area_relationship_integrity() FROM PUBLIC;

CREATE TRIGGER service_area_relationship_integrity
BEFORE INSERT OR UPDATE
ON public.service_area_relationships
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_service_area_relationship_integrity();

CREATE OR REPLACE FUNCTION app_private.prevent_service_area_relationship_identity_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.parent_service_area_id IS DISTINCT FROM OLD.parent_service_area_id
    OR NEW.child_service_area_id IS DISTINCT FROM OLD.child_service_area_id
    OR NEW.relation_type IS DISTINCT FROM OLD.relation_type THEN
    RAISE EXCEPTION 'Service-area relationship identity is immutable; delete and recreate the relationship.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_service_area_relationship_identity_update() FROM PUBLIC;

CREATE TRIGGER service_area_relationship_immutable_identity
BEFORE UPDATE OF parent_service_area_id, child_service_area_id, relation_type
ON public.service_area_relationships
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_service_area_relationship_identity_update();

CREATE OR REPLACE FUNCTION app_private.enforce_active_buyer_primary_service_area()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  profile_id text;
  profile_status public."BuyerVisibilityStatus";
  selected_service_area_id uuid;
  selected_market_id uuid;
  selected_service_area_active boolean;
  selected_market_active boolean;
BEGIN
  IF TG_TABLE_NAME = 'BuyerProfile' THEN
    profile_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    profile_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.buyer_profile_id ELSE NEW.buyer_profile_id END;
  END IF;

  SELECT buyer_profile."visibilityStatus"
  INTO profile_status
  FROM public."BuyerProfile" buyer_profile
  WHERE buyer_profile.id = profile_id;

  IF profile_status IS DISTINCT FROM 'ACTIVE'::public."BuyerVisibilityStatus" THEN
    RETURN NULL;
  END IF;

  SELECT buyer_area.service_area_id, service_area.market_id
  INTO selected_service_area_id, selected_market_id
  FROM public.buyer_desired_service_areas buyer_area
  JOIN public.service_areas service_area
    ON service_area.id = buyer_area.service_area_id
  WHERE buyer_area.buyer_profile_id = profile_id
    AND buyer_area.source = 'SELECTED'
    AND buyer_area.is_primary = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active buyer profile % requires exactly one active primary selected service area.', profile_id
      USING ERRCODE = '23514';
  END IF;

  -- The fixed lock order prevents activation from racing geography deactivation.
  SELECT market.active
  INTO selected_market_active
  FROM public.markets market
  WHERE market.id = selected_market_id
  FOR SHARE;

  SELECT service_area.active
  INTO selected_service_area_active
  FROM public.service_areas service_area
  WHERE service_area.id = selected_service_area_id
  FOR SHARE;

  IF selected_market_active IS DISTINCT FROM true
    OR selected_service_area_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Active buyer profile % requires exactly one active primary selected service area.', profile_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_active_buyer_primary_service_area() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER buyer_profile_active_service_area_check
AFTER INSERT OR UPDATE OF "visibilityStatus"
ON public."BuyerProfile"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_active_buyer_primary_service_area();

CREATE CONSTRAINT TRIGGER buyer_desired_service_area_active_profile_check
AFTER INSERT OR UPDATE OR DELETE
ON public.buyer_desired_service_areas
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_active_buyer_primary_service_area();

CREATE OR REPLACE FUNCTION app_private.draft_buyers_for_deactivated_geography()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.active = true AND NEW.active = false THEN
    IF TG_TABLE_NAME = 'markets' THEN
      PERFORM buyer_profile.id
      FROM public."BuyerProfile" buyer_profile
      WHERE buyer_profile."visibilityStatus" = 'ACTIVE'
        AND EXISTS (
          SELECT 1
          FROM public.buyer_desired_service_areas buyer_area
          JOIN public.service_areas service_area ON service_area.id = buyer_area.service_area_id
          WHERE buyer_area.buyer_profile_id = buyer_profile.id
            AND buyer_area.source = 'SELECTED'
            AND buyer_area.is_primary = true
            AND service_area.market_id = OLD.id
        )
      ORDER BY buyer_profile.id
      FOR UPDATE OF buyer_profile NOWAIT;

      UPDATE public."BuyerProfile" buyer_profile
      SET
        "visibilityStatus" = 'DRAFT',
        "updatedAt" = now()
      WHERE buyer_profile."visibilityStatus" = 'ACTIVE'
        AND EXISTS (
          SELECT 1
          FROM public.buyer_desired_service_areas buyer_area
          JOIN public.service_areas service_area ON service_area.id = buyer_area.service_area_id
          WHERE buyer_area.buyer_profile_id = buyer_profile.id
            AND buyer_area.source = 'SELECTED'
            AND buyer_area.is_primary = true
            AND service_area.market_id = OLD.id
        );
    ELSE
      PERFORM buyer_profile.id
      FROM public."BuyerProfile" buyer_profile
      WHERE buyer_profile."visibilityStatus" = 'ACTIVE'
        AND EXISTS (
          SELECT 1
          FROM public.buyer_desired_service_areas buyer_area
          WHERE buyer_area.buyer_profile_id = buyer_profile.id
            AND buyer_area.source = 'SELECTED'
            AND buyer_area.is_primary = true
            AND buyer_area.service_area_id = OLD.id
        )
      ORDER BY buyer_profile.id
      FOR UPDATE OF buyer_profile NOWAIT;

      UPDATE public."BuyerProfile" buyer_profile
      SET
        "visibilityStatus" = 'DRAFT',
        "updatedAt" = now()
      WHERE buyer_profile."visibilityStatus" = 'ACTIVE'
        AND EXISTS (
          SELECT 1
          FROM public.buyer_desired_service_areas buyer_area
          WHERE buyer_area.buyer_profile_id = buyer_profile.id
            AND buyer_area.source = 'SELECTED'
            AND buyer_area.is_primary = true
            AND buyer_area.service_area_id = OLD.id
        );
    END IF;
  END IF;

  RETURN NULL;

EXCEPTION
  WHEN lock_not_available THEN
    RAISE EXCEPTION 'Geography deactivation conflicts with an in-flight buyer update; retry the deactivation.'
      USING ERRCODE = '55P03';
END;
$$;

REVOKE ALL ON FUNCTION app_private.draft_buyers_for_deactivated_geography() FROM PUBLIC;

CREATE TRIGGER markets_draft_buyers_on_deactivation
AFTER UPDATE OF active ON public.markets
FOR EACH ROW
EXECUTE FUNCTION app_private.draft_buyers_for_deactivated_geography();

CREATE TRIGGER service_areas_draft_buyers_on_deactivation
AFTER UPDATE OF active ON public.service_areas
FOR EACH ROW
EXECUTE FUNCTION app_private.draft_buyers_for_deactivated_geography();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."BuyerProfile" buyer_profile
    WHERE buyer_profile."visibilityStatus" = 'ACTIVE'
      AND 1 <> (
        SELECT count(*)
        FROM public.buyer_desired_service_areas buyer_area
        JOIN public.service_areas service_area ON service_area.id = buyer_area.service_area_id
        JOIN public.markets market ON market.id = service_area.market_id
        WHERE buyer_area.buyer_profile_id = buyer_profile.id
          AND buyer_area.source = 'SELECTED'
          AND buyer_area.is_primary = true
          AND service_area.active = true
          AND market.active = true
      )
  ) THEN
    RAISE EXCEPTION 'Canonical geography cutover left an invalid ACTIVE buyer profile.';
  END IF;
END;
$$;

COMMIT;
-- END SOURCE 20260709000015_canonical_service_area_cutover

-- BEGIN SOURCE 20260709000016_harden_auth_identity_ownership (9e7f102bf79b97dd377f7ec4ee2844940525006ebbe18e781d0264c8e3a84288)
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
-- END SOURCE 20260709000016_harden_auth_identity_ownership

-- BEGIN SOURCE 20260711071555_complete_architecture_boundaries (0db6957c554dbd80515534d6f1e86d53591a626e339abe1882f9618d76f11c2a)
-- Complete the transaction, privacy, evidence, upload, suspension, invite,
-- outbox, and shared-rate-limit boundaries without rewriting deployed history.

DO $$ BEGIN
  CREATE TYPE "PropertyStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'READY_FOR_INVITES', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "UploadSessionStatus" AS ENUM ('PENDING', 'UPLOADED', 'FINALIZED', 'REJECTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "UploadPurpose" AS ENUM ('BUYER_VERIFICATION', 'PROPERTY_IMAGE', 'PROPERTY_OWNERSHIP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AuthOperationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- BuyerCriteria is a one-to-one v1 contract. Preserve the newest row and audit
-- every profile whose older duplicate rows are removed.
WITH ranked AS (
  SELECT
    criteria.id,
    criteria."buyerProfileId",
    row_number() OVER (
      PARTITION BY criteria."buyerProfileId"
      ORDER BY criteria."updatedAt" DESC, criteria.id DESC
    ) AS row_number
  FROM public."BuyerCriteria" criteria
), duplicate_groups AS (
  SELECT
    ranked."buyerProfileId",
    jsonb_agg(ranked.id ORDER BY ranked.id) AS removed_ids
  FROM ranked
  WHERE ranked.row_number > 1
  GROUP BY ranked."buyerProfileId"
)
INSERT INTO public."AdminAuditLog" (
  id, action, "targetType", "targetId", metadata, "createdAt"
)
SELECT
  'audit_' || md5(duplicate_groups."buyerProfileId" || clock_timestamp()::text),
  'deduplicate_buyer_criteria',
  'buyer_profile',
  duplicate_groups."buyerProfileId",
  jsonb_build_object('removedCriteriaIds', duplicate_groups.removed_ids),
  now()
FROM duplicate_groups;

WITH ranked AS (
  SELECT
    criteria.id,
    row_number() OVER (
      PARTITION BY criteria."buyerProfileId"
      ORDER BY criteria."updatedAt" DESC, criteria.id DESC
    ) AS row_number
  FROM public."BuyerCriteria" criteria
)
DELETE FROM public."BuyerCriteria" criteria
USING ranked
WHERE criteria.id = ranked.id
  AND ranked.row_number > 1;

DROP INDEX IF EXISTS public."BuyerCriteria_buyerProfileId_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "BuyerCriteria_buyerProfileId_key"
  ON public."BuyerCriteria"("buyerProfileId");

WITH invalid_active AS (
  SELECT profile.id
  FROM public."BuyerProfile" profile
  LEFT JOIN public."BuyerCriteria" criteria ON criteria."buyerProfileId" = profile.id
  WHERE profile."visibilityStatus" = 'ACTIVE'
  GROUP BY profile.id
  HAVING count(criteria.id) <> 1
)
INSERT INTO public."AdminAuditLog" (id, action, "targetType", "targetId", metadata, "createdAt")
SELECT
  'audit_' || md5(invalid_active.id || clock_timestamp()::text),
  'draft_buyer_missing_criteria',
  'buyer_profile',
  invalid_active.id,
  jsonb_build_object('reason', 'ACTIVE profile did not have exactly one criteria row'),
  now()
FROM invalid_active;

UPDATE public."BuyerProfile" profile
SET "visibilityStatus" = 'DRAFT', "updatedAt" = now()
WHERE profile."visibilityStatus" = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM public."BuyerCriteria" criteria WHERE criteria."buyerProfileId" = profile.id
  );

UPDATE public."BuyerBadge"
SET status = 'REVOKED', "updatedAt" = now(),
    notes = concat_ws(E'\n', notes, 'Unsupported v1 badge disabled by architecture boundary migration.')
WHERE "badgeType" IN ('EARNEST_MONEY_DEPOSITED', 'CASH_BUYER', 'NON_CONTINGENT', 'COMPLETED_TRANSACTION')
  AND status IN ('PENDING', 'ACTIVE');

ALTER TABLE public."SellerProperty"
  ADD COLUMN "status" "PropertyStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "identityVersion" integer NOT NULL DEFAULT 1,
  ADD COLUMN "addressFingerprint" text,
  ADD COLUMN "providerPropertyId" text,
  ADD COLUMN "authorityAttestedAt" timestamp(3),
  ADD COLUMN "authorityAttestedByUserId" uuid,
  ADD COLUMN "attestationVersion" text;

UPDATE public."SellerProperty"
SET
  "status" = CASE
    WHEN "ownershipVerificationStatus" = 'APPROVED' THEN 'READY_FOR_INVITES'::public."PropertyStatus"
    WHEN "ownershipVerificationStatus" = 'PENDING' THEN 'READY_FOR_REVIEW'::public."PropertyStatus"
    ELSE 'DRAFT'::public."PropertyStatus"
  END,
  "addressFingerprint" = md5(concat_ws('|',
    lower(btrim(coalesce("addressLine1", ''))),
    lower(btrim(coalesce("addressLine2", ''))),
    lower(btrim(coalesce(city, ''))),
    upper(btrim(coalesce(state, ''))),
    lower(btrim(coalesce(zip, ''))),
    coalesce("providerPropertyId", '')
  ));

WITH latest_attestation AS (
  SELECT DISTINCT ON (audit."targetId")
    audit."targetId" AS property_id,
    audit."actorUserId",
    audit."createdAt"
  FROM public."AdminAuditLog" audit
  WHERE audit.action = 'property_ownership_confirmed'
    AND audit."targetType" = 'seller_property'
  ORDER BY audit."targetId", audit."createdAt" DESC
)
UPDATE public."SellerProperty" property
SET
  "authorityAttestedAt" = latest_attestation."createdAt",
  "authorityAttestedByUserId" = latest_attestation."actorUserId",
  "attestationVersion" = 'v1-property-authority-2026-07'
FROM latest_attestation
WHERE latest_attestation.property_id = property.id
  AND latest_attestation."actorUserId" = property."ownerUserId";

ALTER TABLE public."SellerProperty"
  ADD CONSTRAINT "SellerProperty_identityVersion_check" CHECK ("identityVersion" >= 1),
  ADD CONSTRAINT "SellerProperty_authorityAttestedByUserId_fkey"
    FOREIGN KEY ("authorityAttestedByUserId") REFERENCES public."User"(id)
    ON DELETE SET NULL ON UPDATE RESTRICT;

CREATE INDEX "SellerProperty_status_idx" ON public."SellerProperty"("status");
CREATE INDEX "SellerProperty_authorityAttestedByUserId_idx"
  ON public."SellerProperty"("authorityAttestedByUserId");

ALTER TABLE public."PropertyImage"
  ADD CONSTRAINT "PropertyImage_storagePath_key" UNIQUE ("storagePath");

ALTER TABLE public."VerificationDocument"
  ADD COLUMN "propertyIdentityVersion" integer,
  ADD COLUMN "reviewChecklist" jsonb;

UPDATE public."VerificationDocument" document
SET "propertyIdentityVersion" = property."identityVersion"
FROM public."SellerProperty" property
WHERE document."propertyId" = property.id
  AND document."propertyIdentityVersion" IS NULL;

-- Prototype-era ownership approvals did not record the required structured
-- checklist. Preserve the evidence/reviewer audit fields but require explicit
-- current-version re-review before any property can send a new invite.
UPDATE public."VerificationDocument"
SET "reviewStatus" = 'PENDING',
    "reviewChecklist" = NULL,
    "reviewNotes" = concat_ws(E'\n', "reviewNotes", 'Structured ownership re-review required.')
WHERE "documentType" = 'OWNERSHIP' AND "reviewStatus" = 'APPROVED';

UPDATE public."SellerProperty"
SET "ownershipVerificationStatus" = 'PENDING',
    status = 'READY_FOR_REVIEW'
WHERE "ownershipVerificationStatus" = 'APPROVED';

CREATE INDEX "VerificationDocument_propertyId_propertyIdentityVersion_reviewStatus_idx"
  ON public."VerificationDocument"("propertyId", "propertyIdentityVersion", "reviewStatus");

CREATE TABLE public."PropertyVerificationDecision" (
  id text PRIMARY KEY,
  "propertyId" text NOT NULL,
  "propertyIdentityVersion" integer NOT NULL,
  "reviewerUserId" uuid NOT NULL,
  "governmentIdDocumentId" text NOT NULL,
  "addressEvidenceDocumentId" text NOT NULL,
  decision public."PropertyVerificationStatus" NOT NULL,
  checklist jsonb NOT NULL,
  notes text,
  "reviewedAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "PropertyVerificationDecision_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES public."SellerProperty"(id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "PropertyVerificationDecision_reviewerUserId_fkey"
    FOREIGN KEY ("reviewerUserId") REFERENCES public."User"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PropertyVerificationDecision_governmentIdDocumentId_fkey"
    FOREIGN KEY ("governmentIdDocumentId") REFERENCES public."VerificationDocument"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PropertyVerificationDecision_addressEvidenceDocumentId_fkey"
    FOREIGN KEY ("addressEvidenceDocumentId") REFERENCES public."VerificationDocument"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "PropertyVerificationDecision_propertyId_propertyIdentityVersion_key"
    UNIQUE ("propertyId", "propertyIdentityVersion")
);

CREATE INDEX "PropertyVerificationDecision_reviewerUserId_idx"
  ON public."PropertyVerificationDecision"("reviewerUserId");

CREATE TABLE public."UploadSession" (
  id text PRIMARY KEY,
  "ownerUserId" uuid NOT NULL,
  purpose public."UploadPurpose" NOT NULL,
  status public."UploadSessionStatus" NOT NULL DEFAULT 'PENDING',
  bucket text NOT NULL,
  "storagePath" text NOT NULL UNIQUE,
  "originalFilename" text NOT NULL,
  "expectedSizeBytes" integer NOT NULL,
  "expectedMimeType" text NOT NULL,
  "propertyId" text,
  "buyerProfileId" text,
  "documentType" public."DocumentType",
  "ownershipEvidenceKind" public."OwnershipEvidenceKind",
  "propertyIdentityVersion" integer,
  "uploadedAt" timestamp(3),
  "finalizedAt" timestamp(3),
  "expiresAt" timestamp(3) NOT NULL,
  "rejectionReason" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "UploadSession_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES public."User"(id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "UploadSession_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES public."SellerProperty"(id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "UploadSession_expectedSizeBytes_check" CHECK ("expectedSizeBytes" > 0),
  CONSTRAINT "UploadSession_scope_check" CHECK (
    (purpose = 'BUYER_VERIFICATION' AND "buyerProfileId" IS NOT NULL AND "propertyId" IS NULL)
    OR (purpose IN ('PROPERTY_IMAGE', 'PROPERTY_OWNERSHIP') AND "propertyId" IS NOT NULL)
  )
);

CREATE INDEX "UploadSession_ownerUserId_status_expiresAt_idx"
  ON public."UploadSession"("ownerUserId", status, "expiresAt");
CREATE INDEX "UploadSession_propertyId_idx" ON public."UploadSession"("propertyId");
CREATE INDEX "UploadSession_buyerProfileId_idx" ON public."UploadSession"("buyerProfileId");

ALTER TABLE public."EmailOutbox"
  ADD COLUMN "lockedAt" timestamp(3),
  ADD COLUMN "leaseUntil" timestamp(3),
  ADD COLUMN "workerId" text,
  ADD COLUMN "providerMessageId" text,
  ADD COLUMN "idempotencyKey" text;

UPDATE public."EmailOutbox"
SET "idempotencyKey" = 'email-outbox:' || id
WHERE "idempotencyKey" IS NULL;

ALTER TABLE public."EmailOutbox"
  ALTER COLUMN "idempotencyKey" SET NOT NULL,
  ADD CONSTRAINT "EmailOutbox_idempotencyKey_key" UNIQUE ("idempotencyKey");

CREATE INDEX "EmailOutbox_status_leaseUntil_idx"
  ON public."EmailOutbox"(status, "leaseUntil");

CREATE TABLE public."AuthOperation" (
  id text PRIMARY KEY,
  "userId" uuid NOT NULL,
  type text NOT NULL,
  status public."AuthOperationStatus" NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  "lastError" text,
  "nextAttemptAt" timestamp(3),
  "lockedAt" timestamp(3),
  "leaseUntil" timestamp(3),
  "workerId" text,
  "completedAt" timestamp(3),
  "idempotencyKey" text NOT NULL UNIQUE,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "AuthOperation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"(id)
    ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE INDEX "AuthOperation_status_nextAttemptAt_leaseUntil_idx"
  ON public."AuthOperation"(status, "nextAttemptAt", "leaseUntil");
CREATE INDEX "AuthOperation_userId_idx" ON public."AuthOperation"("userId");

CREATE TABLE public."RateLimitBucket" (
  key text PRIMARY KEY,
  count integer NOT NULL,
  "windowStart" timestamp(3) NOT NULL,
  "expiresAt" timestamp(3) NOT NULL,
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "RateLimitBucket_count_check" CHECK (count > 0)
);

CREATE INDEX "RateLimitBucket_expiresAt_idx" ON public."RateLimitBucket"("expiresAt");

CREATE TABLE public."WorkerHeartbeat" (
  worker text PRIMARY KEY,
  "lastRunAt" timestamp(3) NOT NULL,
  metadata jsonb,
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);

ALTER TABLE public."PropertyVerificationDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UploadSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuthOperation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RateLimitBucket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WorkerHeartbeat" ENABLE ROW LEVEL SECURITY;

REVOKE UPDATE, DELETE ON public."AdminAuditLog" FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.set_updated_at() FROM PUBLIC;

CREATE TRIGGER upload_session_updated_at
BEFORE UPDATE ON public."UploadSession"
FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER auth_operation_updated_at
BEFORE UPDATE ON public."AuthOperation"
FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER rate_limit_bucket_updated_at
BEFORE UPDATE ON public."RateLimitBucket"
FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER worker_heartbeat_updated_at
BEFORE UPDATE ON public."WorkerHeartbeat"
FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

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
  current_time timestamp(3) := clock_timestamp();
BEGIN
  IF p_limit < 1 OR p_window_ms < 1 THEN
    RAISE EXCEPTION 'Rate-limit configuration must be positive.';
  END IF;

  INSERT INTO public."RateLimitBucket" AS rate_bucket (
    key, count, "windowStart", "expiresAt", "updatedAt"
  ) VALUES (
    p_key, 1, current_time,
    current_time + (p_window_ms * interval '1 millisecond'),
    current_time
  )
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN rate_bucket."expiresAt" <= current_time THEN 1
      ELSE rate_bucket.count + 1
    END,
    "windowStart" = CASE
      WHEN rate_bucket."expiresAt" <= current_time THEN current_time
      ELSE rate_bucket."windowStart"
    END,
    "expiresAt" = CASE
      WHEN rate_bucket."expiresAt" <= current_time
        THEN current_time + (p_window_ms * interval '1 millisecond')
      ELSE rate_bucket."expiresAt"
    END,
    "updatedAt" = current_time
  RETURNING * INTO bucket;

  RETURN QUERY SELECT
    bucket.count <= p_limit,
    p_limit,
    CASE
      WHEN bucket.count <= p_limit THEN 0
      ELSE greatest(1, ceil(extract(epoch FROM (bucket."expiresAt" - current_time)))::integer)
    END;
END;
$$;

REVOKE ALL ON FUNCTION app_private.consume_rate_limit(text, integer, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.enforce_active_buyer_criteria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  profile_id text;
  profile_status public."BuyerVisibilityStatus";
  criteria_count integer;
BEGIN
  IF TG_TABLE_NAME = 'BuyerProfile' THEN
    profile_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    profile_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."buyerProfileId" ELSE NEW."buyerProfileId" END;
  END IF;

  SELECT "visibilityStatus" INTO profile_status
  FROM public."BuyerProfile" WHERE id = profile_id;

  IF profile_status IS DISTINCT FROM 'ACTIVE'::public."BuyerVisibilityStatus" THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO criteria_count
  FROM public."BuyerCriteria" WHERE "buyerProfileId" = profile_id;

  IF criteria_count <> 1 THEN
    RAISE EXCEPTION 'Active buyer profile % requires exactly one criteria row.', profile_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_active_buyer_criteria() FROM PUBLIC;

DROP TRIGGER IF EXISTS buyer_profile_active_criteria_check
  ON public."BuyerProfile";
CREATE CONSTRAINT TRIGGER buyer_profile_active_criteria_check
AFTER INSERT OR UPDATE OF "visibilityStatus" ON public."BuyerProfile"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_active_buyer_criteria();

DROP TRIGGER IF EXISTS buyer_criteria_active_profile_check
  ON public."BuyerCriteria";
CREATE CONSTRAINT TRIGGER buyer_criteria_active_profile_check
AFTER INSERT OR UPDATE OR DELETE ON public."BuyerCriteria"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_active_buyer_criteria();

CREATE OR REPLACE FUNCTION app_private.property_identity_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW."addressFingerprint" := md5(concat_ws('|',
    lower(btrim(coalesce(NEW."addressLine1", ''))),
    lower(btrim(coalesce(NEW."addressLine2", ''))),
    lower(btrim(coalesce(NEW.city, ''))),
    upper(btrim(coalesce(NEW.state, ''))),
    lower(btrim(coalesce(NEW.zip, ''))),
    coalesce(NEW."providerPropertyId", '')
  ));

  IF TG_OP = 'UPDATE' AND (
    OLD."addressLine1" IS DISTINCT FROM NEW."addressLine1"
    OR OLD."addressLine2" IS DISTINCT FROM NEW."addressLine2"
    OR OLD.city IS DISTINCT FROM NEW.city
    OR OLD.state IS DISTINCT FROM NEW.state
    OR OLD.zip IS DISTINCT FROM NEW.zip
    OR OLD.lat IS DISTINCT FROM NEW.lat
    OR OLD.lng IS DISTINCT FROM NEW.lng
    OR OLD."providerPropertyId" IS DISTINCT FROM NEW."providerPropertyId"
  ) THEN
    NEW."identityVersion" := OLD."identityVersion" + 1;
    NEW."ownershipVerificationStatus" := 'NOT_SUBMITTED';
    NEW.status := 'DRAFT';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.property_identity_lifecycle() FROM PUBLIC;

DROP TRIGGER IF EXISTS seller_property_identity_lifecycle
  ON public."SellerProperty";
CREATE TRIGGER seller_property_identity_lifecycle
BEFORE INSERT OR UPDATE
ON public."SellerProperty"
FOR EACH ROW EXECUTE FUNCTION app_private.property_identity_lifecycle();

-- Serialize rolling-24-hour quota validation per seller. The existing partial
-- unique index remains the final duplicate-active-invite invariant.
CREATE OR REPLACE FUNCTION app_private.enforce_invite_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  seller_status public."UserStatus";
  seller_can_invite boolean;
  property_verification public."PropertyVerificationStatus";
  property_status public."PropertyStatus";
  property_flagged_at timestamp(3);
  buyer_visibility public."BuyerVisibilityStatus";
  buyer_user_status public."UserStatus";
  sent_count integer;
  rolling_limit integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."sellerId"::text, 0));

  SELECT
    app_user.status,
    ('ADMIN'::public."UserRole" = ANY(app_user.roles)) OR EXISTS (
      SELECT 1 FROM public."SellerAccess" access
      WHERE access."userId" = NEW."sellerId" AND access.status = 'APPROVED'
    )
  INTO seller_status, seller_can_invite
  FROM public."User" app_user
  WHERE app_user.id = NEW."sellerId";

  IF seller_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'Only active sellers can send invites.';
  END IF;
  IF seller_can_invite IS NOT TRUE THEN
    RAISE EXCEPTION 'Seller directory access must be approved before sending invites.';
  END IF;

  SELECT property."ownershipVerificationStatus", property.status, property."flaggedForReviewAt"
  INTO property_verification, property_status, property_flagged_at
  FROM public."SellerProperty" property
  WHERE property.id = NEW."propertyId" AND property."ownerUserId" = NEW."sellerId";

  IF property_verification IS NULL THEN
    RAISE EXCEPTION 'Seller must own property before sending invites.';
  END IF;
  IF property_flagged_at IS NOT NULL
    OR property_verification <> 'APPROVED'
    OR property_status <> 'READY_FOR_INVITES' THEN
    RAISE EXCEPTION 'Property must have current ownership approval before sending invites.';
  END IF;

  SELECT buyer_profile."visibilityStatus", buyer_user.status
  INTO buyer_visibility, buyer_user_status
  FROM public."BuyerProfile" buyer_profile
  JOIN public."User" buyer_user ON buyer_user.id = buyer_profile."userId"
  WHERE buyer_profile.id = NEW."buyerProfileId";

  IF buyer_visibility IS DISTINCT FROM 'ACTIVE' OR buyer_user_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'Buyer profile must be active before receiving invites.';
  END IF;

  rolling_limit := 25;
  SELECT count(*) INTO sent_count
  FROM public."Invite"
  WHERE "sellerId" = NEW."sellerId"
    AND "sentAt" >= now() - interval '24 hours';

  IF sent_count >= rolling_limit THEN
    RAISE EXCEPTION 'Seller rolling 24-hour invite limit reached.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_invite_rules() FROM PUBLIC;

-- Current database status is checked for every direct sensitive Storage
-- operation, so a still-valid Auth JWT cannot bypass suspension.
CREATE OR REPLACE FUNCTION app_private.is_active_app_user(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."User" app_user
    WHERE app_user.id = user_id AND app_user.status = 'ACTIVE'
  );
$$;

REVOKE ALL ON FUNCTION app_private.is_active_app_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_active_app_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.can_read_property_image(object_name text, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.is_active_app_user(user_id) AND EXISTS (
    SELECT 1
    FROM public."PropertyImage" image
    JOIN public."SellerProperty" property ON property.id = image."propertyId"
    WHERE image."storagePath" = object_name
      AND (
        property."ownerUserId" = user_id
        OR EXISTS (
          SELECT 1 FROM public."User" app_user
          WHERE app_user.id = user_id
            AND 'ADMIN'::public."UserRole" = ANY(app_user.roles)
        )
        OR EXISTS (
          SELECT 1
          FROM public."Invite" invite
          JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
          WHERE invite."propertyId" = property.id
            AND buyer."userId" = user_id
            AND (
              invite.status = 'ACCEPTED'
              OR (invite.status IN ('SENT', 'VIEWED') AND invite."expiresAt" > now())
            )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION app_private.can_read_property_image(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_read_property_image(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.can_upload_session_object(
  object_bucket text,
  object_name text,
  user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.is_active_app_user(user_id) AND EXISTS (
    SELECT 1 FROM public."UploadSession" upload_session
    WHERE upload_session."ownerUserId" = user_id
      AND upload_session.bucket = object_bucket
      AND upload_session."storagePath" = object_name
      AND upload_session.status = 'PENDING'
      AND upload_session."expiresAt" > now()
  );
$$;

REVOKE ALL ON FUNCTION app_private.can_upload_session_object(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_upload_session_object(text, text, uuid) TO authenticated;

UPDATE storage.buckets
SET public = false
WHERE id = 'property-images';

DROP POLICY IF EXISTS "Property images are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Property owners can upload property images" ON storage.objects;
DROP POLICY IF EXISTS "Property owners can update property images" ON storage.objects;
DROP POLICY IF EXISTS "Property owners can delete property images" ON storage.objects;
DROP POLICY IF EXISTS "Document owners can view own verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Document owners can upload verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Document owners can update verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Document owners can delete verification documents" ON storage.objects;

CREATE POLICY "Authorized users can read private property images"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'property-images'
  AND app_private.can_read_property_image(name, (SELECT auth.uid()))
);

CREATE POLICY "Active users can upload authorized session objects"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('property-images', 'verification-documents')
  AND app_private.can_upload_session_object(bucket_id, name, (SELECT auth.uid()))
);

-- Remove stale process data without exposing a browser-callable cleanup API.
CREATE OR REPLACE FUNCTION app_private.expire_operational_rows()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public."UploadSession"
  SET status = 'EXPIRED', "updatedAt" = now()
  WHERE status IN ('PENDING', 'UPLOADED') AND "expiresAt" <= now();

  DELETE FROM public."RateLimitBucket" WHERE "expiresAt" < now() - interval '1 day';
END;
$$;

REVOKE ALL ON FUNCTION app_private.expire_operational_rows() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.revoke_badges_for_invalid_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD."reviewStatus" = 'APPROVED' AND NEW."reviewStatus" <> 'APPROVED' THEN
    UPDATE public."BuyerBadge"
    SET status = 'REVOKED', "updatedAt" = now(),
        notes = concat_ws(E'\n', notes, 'Evidence was invalidated.')
    WHERE "evidenceDocumentId" = NEW.id AND status = 'ACTIVE';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.revoke_badges_for_invalid_evidence() FROM PUBLIC;

DROP TRIGGER IF EXISTS verification_document_badge_revocation
  ON public."VerificationDocument";
CREATE TRIGGER verification_document_badge_revocation
AFTER UPDATE OF "reviewStatus" ON public."VerificationDocument"
FOR EACH ROW EXECUTE FUNCTION app_private.revoke_badges_for_invalid_evidence();
-- END SOURCE 20260711071555_complete_architecture_boundaries

-- BEGIN SOURCE 20260711082500_close_property_identity_lifecycle (8dd15201d0dc428a8cdd18c09801998178f65969b0eac92ddc46cc0ef11fd622)
-- Close the remaining property-identity, invite-delivery, and upload-cleanup
-- boundaries without changing the deferred malware-scanning decision.

ALTER TYPE public."EmailOutboxStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE public."UploadSessionStatus" ADD VALUE IF NOT EXISTS 'CLEANED';

ALTER TABLE public."SellerProperty"
  ADD COLUMN "authorityAttestedIdentityVersion" integer;

UPDATE public."SellerProperty"
SET "authorityAttestedIdentityVersion" = 1
WHERE "identityVersion" = 1
  AND "authorityAttestedAt" IS NOT NULL
  AND "authorityAttestedByUserId" = "ownerUserId"
  AND "attestationVersion" IS NOT NULL;

UPDATE public."SellerProperty"
SET "authorityAttestedAt" = NULL,
    "authorityAttestedByUserId" = NULL,
    "attestationVersion" = NULL,
    "authorityAttestedIdentityVersion" = NULL
WHERE "authorityAttestedIdentityVersion" IS NULL;

ALTER TABLE public."SellerProperty"
  ADD CONSTRAINT "SellerProperty_current_authority_attestation_check" CHECK (
    (
      "authorityAttestedAt" IS NULL
      AND "authorityAttestedByUserId" IS NULL
      AND "attestationVersion" IS NULL
      AND "authorityAttestedIdentityVersion" IS NULL
    ) OR (
      "authorityAttestedAt" IS NOT NULL
      AND "authorityAttestedByUserId" IS NOT NULL
      AND "authorityAttestedByUserId" = "ownerUserId"
      AND "attestationVersion" IS NOT NULL
      AND "authorityAttestedIdentityVersion" IS NOT NULL
      AND "authorityAttestedIdentityVersion" = "identityVersion"
    )
  );

ALTER TABLE public."PropertyImage"
  ADD COLUMN "propertyIdentityVersion" integer;

-- Images created before versioning can only be proven to belong to version 1.
UPDATE public."PropertyImage" SET "propertyIdentityVersion" = 1;

ALTER TABLE public."PropertyImage"
  ALTER COLUMN "propertyIdentityVersion" SET NOT NULL,
  ADD CONSTRAINT "PropertyImage_propertyIdentityVersion_check" CHECK ("propertyIdentityVersion" >= 1);

CREATE INDEX "PropertyImage_propertyId_propertyIdentityVersion_idx"
  ON public."PropertyImage"("propertyId", "propertyIdentityVersion");

ALTER TABLE public."Invite"
  ADD COLUMN "propertyIdentityVersion" integer;

-- Existing invites also predate identity binding. Bind only to the original
-- version and withdraw any row whose property has subsequently changed.
UPDATE public."Invite" SET "propertyIdentityVersion" = 1;

UPDATE public."Invite" invite
SET status = 'WITHDRAWN', "updatedAt" = now()
FROM public."SellerProperty" property
WHERE property.id = invite."propertyId"
  AND invite.status IN ('SENT', 'VIEWED', 'ACCEPTED')
  AND (
    invite."propertyIdentityVersion" <> property."identityVersion"
    OR property.status <> 'READY_FOR_INVITES'
    OR property."ownershipVerificationStatus" <> 'APPROVED'
    OR property."flaggedForReviewAt" IS NOT NULL
    OR property."authorityAttestedIdentityVersion" IS DISTINCT FROM property."identityVersion"
  );

ALTER TABLE public."Invite"
  ALTER COLUMN "propertyIdentityVersion" SET NOT NULL,
  ADD CONSTRAINT "Invite_propertyIdentityVersion_check" CHECK ("propertyIdentityVersion" >= 1);

CREATE INDEX "Invite_propertyId_propertyIdentityVersion_idx"
  ON public."Invite"("propertyId", "propertyIdentityVersion");

ALTER TABLE public."EmailOutbox"
  ADD COLUMN "inviteId" text;

UPDATE public."EmailOutbox" outbox
SET "inviteId" = invite.id
FROM public."Invite" invite
WHERE outbox."idempotencyKey" = 'invite-email:' || invite.id;

ALTER TABLE public."EmailOutbox"
  ADD CONSTRAINT "EmailOutbox_inviteId_fkey"
    FOREIGN KEY ("inviteId") REFERENCES public."Invite"(id)
    ON DELETE SET NULL ON UPDATE RESTRICT;

CREATE INDEX "EmailOutbox_inviteId_idx" ON public."EmailOutbox"("inviteId");

ALTER TABLE public."UploadSession"
  ADD CONSTRAINT "UploadSession_buyerProfileId_fkey"
    FOREIGN KEY ("buyerProfileId") REFERENCES public."BuyerProfile"(id)
    ON DELETE CASCADE ON UPDATE RESTRICT;

CREATE OR REPLACE FUNCTION app_private.property_identity_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW."addressFingerprint" := md5(concat_ws('|',
    lower(btrim(coalesce(NEW."addressLine1", ''))),
    lower(btrim(coalesce(NEW."addressLine2", ''))),
    lower(btrim(coalesce(NEW.city, ''))),
    upper(btrim(coalesce(NEW.state, ''))),
    lower(btrim(coalesce(NEW.zip, ''))),
    coalesce(NEW."providerPropertyId", '')
  ));

  IF TG_OP = 'UPDATE' AND (
    OLD."addressLine1" IS DISTINCT FROM NEW."addressLine1"
    OR OLD."addressLine2" IS DISTINCT FROM NEW."addressLine2"
    OR OLD.city IS DISTINCT FROM NEW.city
    OR OLD.state IS DISTINCT FROM NEW.state
    OR OLD.zip IS DISTINCT FROM NEW.zip
    OR OLD.lat IS DISTINCT FROM NEW.lat
    OR OLD.lng IS DISTINCT FROM NEW.lng
    OR OLD."providerPropertyId" IS DISTINCT FROM NEW."providerPropertyId"
  ) THEN
    NEW."identityVersion" := OLD."identityVersion" + 1;
    NEW."ownershipVerificationStatus" := 'NOT_SUBMITTED';
    NEW.status := 'DRAFT';
    NEW."authorityAttestedAt" := NULL;
    NEW."authorityAttestedByUserId" := NULL;
    NEW."attestationVersion" := NULL;
    NEW."authorityAttestedIdentityVersion" := NULL;

    UPDATE public."Invite"
    SET status = 'WITHDRAWN', "updatedAt" = now()
    WHERE "propertyId" = OLD.id
      AND status IN ('SENT', 'VIEWED', 'ACCEPTED');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.property_identity_lifecycle() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.enforce_invite_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  seller_status public."UserStatus";
  seller_can_invite boolean;
  property_verification public."PropertyVerificationStatus";
  property_status public."PropertyStatus";
  property_flagged_at timestamp(3);
  property_identity_version integer;
  attested_identity_version integer;
  buyer_visibility public."BuyerVisibilityStatus";
  buyer_user_status public."UserStatus";
  sent_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."sellerId"::text, 0));

  SELECT app_user.status,
    ('ADMIN'::public."UserRole" = ANY(app_user.roles)) OR EXISTS (
      SELECT 1 FROM public."SellerAccess" access
      WHERE access."userId" = NEW."sellerId" AND access.status = 'APPROVED'
    )
  INTO seller_status, seller_can_invite
  FROM public."User" app_user
  WHERE app_user.id = NEW."sellerId";

  IF seller_status IS DISTINCT FROM 'ACTIVE' OR seller_can_invite IS NOT TRUE THEN
    RAISE EXCEPTION 'Only active approved sellers can send invites.';
  END IF;

  SELECT property."ownershipVerificationStatus", property.status,
    property."flaggedForReviewAt", property."identityVersion",
    property."authorityAttestedIdentityVersion"
  INTO property_verification, property_status, property_flagged_at,
    property_identity_version, attested_identity_version
  FROM public."SellerProperty" property
  WHERE property.id = NEW."propertyId" AND property."ownerUserId" = NEW."sellerId";

  IF property_identity_version IS NULL
    OR property_flagged_at IS NOT NULL
    OR property_verification <> 'APPROVED'
    OR property_status <> 'READY_FOR_INVITES'
    OR attested_identity_version IS DISTINCT FROM property_identity_version
    OR NEW."propertyIdentityVersion" IS DISTINCT FROM property_identity_version THEN
    RAISE EXCEPTION 'Property must have current ownership approval and attestation before sending invites.';
  END IF;

  SELECT buyer_profile."visibilityStatus", buyer_user.status
  INTO buyer_visibility, buyer_user_status
  FROM public."BuyerProfile" buyer_profile
  JOIN public."User" buyer_user ON buyer_user.id = buyer_profile."userId"
  WHERE buyer_profile.id = NEW."buyerProfileId";

  IF buyer_visibility IS DISTINCT FROM 'ACTIVE' OR buyer_user_status IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'Buyer profile must be active before receiving invites.';
  END IF;

  SELECT count(*) INTO sent_count
  FROM public."Invite"
  WHERE "sellerId" = NEW."sellerId"
    AND "sentAt" >= now() - interval '24 hours';

  IF sent_count >= 25 THEN
    RAISE EXCEPTION 'Seller rolling 24-hour invite limit reached.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_invite_rules() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.is_invite_property_access_valid(
  invite_id text,
  user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.is_active_app_user(user_id) AND EXISTS (
    SELECT 1
    FROM public."Invite" invite
    JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
    JOIN public."User" buyer_user ON buyer_user.id = buyer."userId"
    JOIN public."SellerProperty" property ON property.id = invite."propertyId"
    JOIN public."User" seller_user ON seller_user.id = property."ownerUserId"
    WHERE invite.id = invite_id
      AND invite."sellerId" = property."ownerUserId"
      AND buyer."userId" = user_id
      AND buyer."visibilityStatus" = 'ACTIVE'
      AND buyer_user.status = 'ACTIVE'
      AND seller_user.status = 'ACTIVE'
      AND property.status = 'READY_FOR_INVITES'
      AND property."ownershipVerificationStatus" = 'APPROVED'
      AND property."flaggedForReviewAt" IS NULL
      AND property."authorityAttestedIdentityVersion" = property."identityVersion"
      AND invite."propertyIdentityVersion" = property."identityVersion"
      AND (
        invite.status = 'ACCEPTED'
        OR (invite.status IN ('SENT', 'VIEWED') AND invite."expiresAt" > now())
      )
  );
$$;

REVOKE ALL ON FUNCTION app_private.is_invite_property_access_valid(text, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.is_invite_deliverable(invite_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."Invite" invite
    JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
    JOIN public."User" buyer_user ON buyer_user.id = buyer."userId"
    JOIN public."SellerProperty" property ON property.id = invite."propertyId"
    JOIN public."User" seller_user ON seller_user.id = property."ownerUserId"
    WHERE invite.id = invite_id
      AND invite."sellerId" = property."ownerUserId"
      AND invite.status IN ('SENT', 'VIEWED')
      AND invite."expiresAt" > now()
      AND buyer."visibilityStatus" = 'ACTIVE'
      AND buyer_user.status = 'ACTIVE'
      AND seller_user.status = 'ACTIVE'
      AND property.status = 'READY_FOR_INVITES'
      AND property."ownershipVerificationStatus" = 'APPROVED'
      AND property."flaggedForReviewAt" IS NULL
      AND property."authorityAttestedIdentityVersion" = property."identityVersion"
      AND invite."propertyIdentityVersion" = property."identityVersion"
  );
$$;

REVOKE ALL ON FUNCTION app_private.is_invite_deliverable(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.can_read_property_image(object_name text, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.is_active_app_user(user_id) AND EXISTS (
    SELECT 1
    FROM public."PropertyImage" image
    JOIN public."SellerProperty" property ON property.id = image."propertyId"
    WHERE image."storagePath" = object_name
      AND (
        property."ownerUserId" = user_id
        OR EXISTS (
          SELECT 1 FROM public."User" app_user
          WHERE app_user.id = user_id
            AND 'ADMIN'::public."UserRole" = ANY(app_user.roles)
        )
        OR (
          image."propertyIdentityVersion" = property."identityVersion"
          AND EXISTS (
            SELECT 1 FROM public."Invite" invite
            WHERE invite."propertyId" = property.id
              AND app_private.is_invite_property_access_valid(invite.id, user_id)
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION app_private.can_read_property_image(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_read_property_image(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.cancel_terminal_invite_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN')
    AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public."EmailOutbox"
    SET status = 'CANCELLED',
        "lastError" = 'Invite became ineligible before delivery.',
        "lockedAt" = NULL,
        "leaseUntil" = NULL,
        "workerId" = NULL,
        "nextAttemptAt" = NULL,
        "updatedAt" = now()
    WHERE "inviteId" = NEW.id
      AND status IN ('PENDING', 'FAILED', 'SENDING');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.cancel_terminal_invite_email() FROM PUBLIC;

CREATE TRIGGER invite_terminal_email_cancellation
AFTER UPDATE OF status ON public."Invite"
FOR EACH ROW EXECUTE FUNCTION app_private.cancel_terminal_invite_email();
-- END SOURCE 20260711082500_close_property_identity_lifecycle

-- BEGIN SOURCE 20260712090000_expand_la_county_geography (deca5831a19a37330ffffc7c64975274d609907e3954f1a3793f00d6514a7e73)
-- Production LA County geography schema, immutable staging, and guarded activation.
-- Staging is inert. Activation is a separate owner-only function with an exact
-- dataset ledger, pre-change snapshot, aborting assertions, and rollback function.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  pgcrypto_schema text;
  postgis_schema text;
BEGIN
  SELECT namespace.nspname INTO postgis_schema
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'postgis';
  IF postgis_schema IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'Liber geography requires the existing PostGIS extension in public; found %.', postgis_schema;
  END IF;

  SELECT namespace.nspname INTO pgcrypto_schema
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pgcrypto';
  IF pgcrypto_schema IS DISTINCT FROM 'extensions' THEN
    RAISE EXCEPTION 'Liber geography requires pgcrypto in extensions; found %.', pgcrypto_schema;
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS geography_admin;
REVOKE ALL ON SCHEMA geography_admin FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS jurisdiction_type text,
  ADD COLUMN IF NOT EXISTS jurisdiction_geoid text,
  ADD COLUMN IF NOT EXISTS stable_external_id text,
  ADD COLUMN IF NOT EXISTS current_boundary_id uuid,
  ADD COLUMN IF NOT EXISTS current_display_geometry_id uuid;

ALTER TABLE public.service_areas
  ADD COLUMN IF NOT EXISTS stable_external_id text,
  ADD COLUMN IF NOT EXISTS source_retrieved_at date,
  ADD COLUMN IF NOT EXISTS source_retrieval_url text,
  ADD COLUMN IF NOT EXISTS current_geometry_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS markets_country_jurisdiction_type_jurisdiction_geoid_key
ON public.markets(country, jurisdiction_type, jurisdiction_geoid);
CREATE UNIQUE INDEX IF NOT EXISTS markets_stable_external_id_key
ON public.markets(stable_external_id);
CREATE UNIQUE INDEX IF NOT EXISTS markets_current_boundary_id_key
ON public.markets(current_boundary_id);
CREATE UNIQUE INDEX IF NOT EXISTS markets_current_display_geometry_id_key
ON public.markets(current_display_geometry_id);
CREATE UNIQUE INDEX IF NOT EXISTS service_areas_market_id_stable_external_id_key
ON public.service_areas(market_id, stable_external_id);
CREATE UNIQUE INDEX IF NOT EXISTS service_areas_current_geometry_id_key
ON public.service_areas(current_geometry_id);
CREATE UNIQUE INDEX IF NOT EXISTS service_areas_id_market_id_key
ON public.service_areas(id, market_id);

CREATE TABLE IF NOT EXISTS public.market_boundary_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  dataset_version text NOT NULL,
  geojson jsonb NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  source text NOT NULL,
  source_version text NOT NULL,
  source_license text NOT NULL,
  source_url text NOT NULL,
  source_retrieval_url text NOT NULL,
  source_retrieved_at date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, dataset_version)
);
CREATE INDEX IF NOT EXISTS market_boundary_versions_market_sha_idx
ON public.market_boundary_versions(market_id, sha256);

CREATE TABLE IF NOT EXISTS public.market_display_geometry_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  dataset_version text NOT NULL,
  geojson jsonb NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  source_manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, dataset_version)
);
CREATE INDEX IF NOT EXISTS market_display_geometry_versions_market_sha_idx
ON public.market_display_geometry_versions(market_id, sha256);

CREATE TABLE IF NOT EXISTS public.service_area_geometry_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_area_id uuid NOT NULL REFERENCES public.service_areas(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  dataset_version text NOT NULL,
  geojson jsonb NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  source text NOT NULL,
  source_version text NOT NULL,
  source_license text NOT NULL,
  source_url text NOT NULL,
  source_retrieval_url text NOT NULL,
  source_retrieved_at date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_area_id, dataset_version)
);
CREATE INDEX IF NOT EXISTS service_area_geometry_versions_area_sha_idx
ON public.service_area_geometry_versions(service_area_id, sha256);
CREATE INDEX IF NOT EXISTS service_area_geometry_versions_area_created_idx
ON public.service_area_geometry_versions(service_area_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.service_area_search_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  service_area_id uuid NOT NULL,
  term_normalized text COLLATE "C" NOT NULL,
  term_kind text NOT NULL,
  source text NOT NULL,
  reviewed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (term_normalized <> '' AND term_normalized = btrim(term_normalized)),
  UNIQUE (market_id, term_normalized, service_area_id),
  CONSTRAINT service_area_search_terms_service_area_id_market_id_fkey
    FOREIGN KEY (service_area_id, market_id)
    REFERENCES public.service_areas(id, market_id)
    ON DELETE CASCADE ON UPDATE RESTRICT
);
-- Prisma cannot model INCLUDE columns, so this covering prefix index remains migration-owned.
CREATE INDEX IF NOT EXISTS service_area_search_terms_market_term_prefix_idx
ON public.service_area_search_terms(market_id, term_normalized text_pattern_ops)
INCLUDE (service_area_id, term_kind, reviewed_at);
CREATE INDEX IF NOT EXISTS service_area_search_terms_area_idx
ON public.service_area_search_terms(service_area_id);

CREATE TABLE IF NOT EXISTS public.geography_dataset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  market_boundary_version_id uuid NOT NULL REFERENCES public.market_boundary_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  market_display_geometry_version_id uuid REFERENCES public.market_display_geometry_versions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  relationships_sha256 text NOT NULL CHECK (relationships_sha256 ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL,
  relationships jsonb NOT NULL,
  staged_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS geography_dataset_versions_market_staged_idx
ON public.geography_dataset_versions(market_id, staged_at DESC);
CREATE INDEX IF NOT EXISTS geography_dataset_versions_boundary_idx
ON public.geography_dataset_versions(market_boundary_version_id);
CREATE INDEX IF NOT EXISTS geography_dataset_versions_display_geometry_idx
ON public.geography_dataset_versions(market_display_geometry_version_id);

CREATE TABLE IF NOT EXISTS public.geography_activation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version text NOT NULL UNIQUE,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  snapshot jsonb NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz,
  CHECK (rolled_back_at IS NULL OR rolled_back_at >= activated_at)
);
CREATE INDEX IF NOT EXISTS geography_activation_snapshots_market_activated_idx
ON public.geography_activation_snapshots(market_id, activated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'markets_current_boundary_id_fkey'
      AND conrelid = 'public.markets'::regclass
  ) THEN
    ALTER TABLE public.markets
      ADD CONSTRAINT markets_current_boundary_id_fkey
      FOREIGN KEY (current_boundary_id) REFERENCES public.market_boundary_versions(id)
      ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'markets_current_display_geometry_id_fkey'
      AND conrelid = 'public.markets'::regclass
  ) THEN
    ALTER TABLE public.markets
      ADD CONSTRAINT markets_current_display_geometry_id_fkey
      FOREIGN KEY (current_display_geometry_id) REFERENCES public.market_display_geometry_versions(id)
      ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_areas_current_geometry_id_fkey'
      AND conrelid = 'public.service_areas'::regclass
  ) THEN
    ALTER TABLE public.service_areas
      ADD CONSTRAINT service_areas_current_geometry_id_fkey
      FOREIGN KEY (current_geometry_id) REFERENCES public.service_area_geometry_versions(id)
      ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
END;
$$;

ALTER TABLE public.market_boundary_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_display_geometry_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_area_geometry_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_area_search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geography_dataset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geography_activation_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_boundary_versions, public.market_display_geometry_versions,
  public.service_area_geometry_versions, public.service_area_search_terms,
  public.geography_dataset_versions, public.geography_activation_snapshots
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.reject_immutable_geography_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Canonical geography versions are immutable; insert a new version instead.'
    USING ERRCODE = '23514';
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.reject_immutable_geography_version()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS market_boundary_versions_immutable ON public.market_boundary_versions;
CREATE TRIGGER market_boundary_versions_immutable
BEFORE UPDATE OR DELETE ON public.market_boundary_versions
FOR EACH ROW EXECUTE FUNCTION geography_admin.reject_immutable_geography_version();
DROP TRIGGER IF EXISTS market_display_geometry_versions_immutable ON public.market_display_geometry_versions;
CREATE TRIGGER market_display_geometry_versions_immutable
BEFORE UPDATE OR DELETE ON public.market_display_geometry_versions
FOR EACH ROW EXECUTE FUNCTION geography_admin.reject_immutable_geography_version();
DROP TRIGGER IF EXISTS service_area_geometry_versions_immutable ON public.service_area_geometry_versions;
CREATE TRIGGER service_area_geometry_versions_immutable
BEFORE UPDATE OR DELETE ON public.service_area_geometry_versions
FOR EACH ROW EXECUTE FUNCTION geography_admin.reject_immutable_geography_version();
DROP TRIGGER IF EXISTS geography_dataset_versions_immutable ON public.geography_dataset_versions;
CREATE TRIGGER geography_dataset_versions_immutable
BEFORE UPDATE OR DELETE ON public.geography_dataset_versions
FOR EACH ROW EXECUTE FUNCTION geography_admin.reject_immutable_geography_version();

CREATE OR REPLACE FUNCTION geography_admin.enforce_activation_snapshot_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.dataset_version IS DISTINCT FROM OLD.dataset_version
    OR NEW.market_id IS DISTINCT FROM OLD.market_id
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
    OR OLD.rolled_back_at IS NOT NULL
    OR NEW.rolled_back_at IS NULL THEN
    RAISE EXCEPTION 'Geography activation snapshots are immutable except for one-way rollback completion.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.enforce_activation_snapshot_immutability()
FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS geography_activation_snapshots_immutable ON public.geography_activation_snapshots;
CREATE TRIGGER geography_activation_snapshots_immutable
BEFORE UPDATE OR DELETE ON public.geography_activation_snapshots
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_activation_snapshot_immutability();

CREATE OR REPLACE FUNCTION geography_admin.enforce_current_geometry_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  new_row jsonb := to_jsonb(NEW);
BEGIN
  IF TG_TABLE_NAME = 'markets' AND new_row->>'current_boundary_id' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.market_boundary_versions version
    WHERE version.id = (new_row->>'current_boundary_id')::uuid AND version.market_id = (new_row->>'id')::uuid
  ) THEN
    RAISE EXCEPTION 'Current market boundary must belong to the same market.' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'markets' AND new_row->>'current_display_geometry_id' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.market_display_geometry_versions version
    WHERE version.id = (new_row->>'current_display_geometry_id')::uuid AND version.market_id = (new_row->>'id')::uuid
  ) THEN
    RAISE EXCEPTION 'Current market display geometry must belong to the same market.' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'service_areas' AND new_row->>'current_geometry_id' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_area_geometry_versions version
    WHERE version.id = (new_row->>'current_geometry_id')::uuid AND version.service_area_id = (new_row->>'id')::uuid
  ) THEN
    RAISE EXCEPTION 'Current service-area geometry must belong to the same service area.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.enforce_current_geometry_ownership()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS markets_current_boundary_ownership ON public.markets;
CREATE CONSTRAINT TRIGGER markets_current_boundary_ownership
AFTER INSERT OR UPDATE OF current_boundary_id, current_display_geometry_id ON public.markets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_current_geometry_ownership();
DROP TRIGGER IF EXISTS service_areas_current_geometry_ownership ON public.service_areas;
CREATE CONSTRAINT TRIGGER service_areas_current_geometry_ownership
AFTER INSERT OR UPDATE OF current_geometry_id ON public.service_areas
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_current_geometry_ownership();

CREATE OR REPLACE FUNCTION geography_admin.enforce_stable_geography_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'markets' THEN
    IF OLD.stable_external_id IS NOT NULL AND NEW.stable_external_id IS DISTINCT FROM OLD.stable_external_id
      OR OLD.jurisdiction_type IS NOT NULL AND NEW.jurisdiction_type IS DISTINCT FROM OLD.jurisdiction_type
      OR OLD.jurisdiction_geoid IS NOT NULL AND NEW.jurisdiction_geoid IS DISTINCT FROM OLD.jurisdiction_geoid THEN
      RAISE EXCEPTION 'Canonical market jurisdiction identity is immutable.' USING ERRCODE = '23514';
    END IF;
    IF num_nonnulls(NEW.stable_external_id, NEW.jurisdiction_type, NEW.jurisdiction_geoid) NOT IN (0, 3) THEN
      RAISE EXCEPTION 'Canonical market jurisdiction identity must be assigned together.' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.stable_external_id IS NOT NULL AND NEW.stable_external_id IS DISTINCT FROM OLD.stable_external_id THEN
    RAISE EXCEPTION 'Canonical service-area source identity is immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.enforce_stable_geography_identity()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS markets_stable_geography_identity ON public.markets;
CREATE TRIGGER markets_stable_geography_identity
BEFORE UPDATE OF stable_external_id, jurisdiction_type, jurisdiction_geoid ON public.markets
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_stable_geography_identity();
DROP TRIGGER IF EXISTS service_areas_stable_geography_identity ON public.service_areas;
CREATE TRIGGER service_areas_stable_geography_identity
BEFORE UPDATE OF stable_external_id ON public.service_areas
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_stable_geography_identity();

CREATE OR REPLACE FUNCTION geography_admin.enforce_active_area_market_bounds()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  market_row public.markets%ROWTYPE;
BEGIN
  IF NEW.active IS NOT TRUE THEN RETURN NEW; END IF;
  SELECT * INTO market_row FROM public.markets WHERE id = NEW.market_id FOR SHARE;
  IF NOT FOUND OR NEW.bbox_west < market_row.bbox_west OR NEW.bbox_south < market_row.bbox_south
    OR NEW.bbox_east > market_row.bbox_east OR NEW.bbox_north > market_row.bbox_north THEN
    RAISE EXCEPTION 'Active service area must remain inside its market bounds.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.enforce_active_area_market_bounds()
FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS service_areas_active_market_bounds ON public.service_areas;
CREATE TRIGGER service_areas_active_market_bounds
BEFORE INSERT OR UPDATE OF active, market_id, bbox_west, bbox_south, bbox_east, bbox_north
ON public.service_areas
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_active_area_market_bounds();

CREATE OR REPLACE FUNCTION geography_admin.enforce_market_contains_active_areas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.service_areas area
    WHERE area.market_id = NEW.id AND area.active = true
      AND (area.bbox_west < NEW.bbox_west OR area.bbox_south < NEW.bbox_south
        OR area.bbox_east > NEW.bbox_east OR area.bbox_north > NEW.bbox_north)
  ) THEN
    RAISE EXCEPTION 'Market bounds must contain every active service area.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.enforce_market_contains_active_areas()
FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS markets_contain_active_service_areas ON public.markets;
CREATE TRIGGER markets_contain_active_service_areas
BEFORE UPDATE OF bbox_west, bbox_south, bbox_east, bbox_north ON public.markets
FOR EACH ROW EXECUTE FUNCTION geography_admin.enforce_market_contains_active_areas();

-- Bounded, deterministic lookup. It returns each area at most once and verifies
-- both sides of the search-term relation belong to the selected market.
CREATE OR REPLACE FUNCTION geography_admin.search_active_service_areas(
  requested_market_slug text,
  requested_term text,
  requested_limit integer DEFAULT 8
)
RETURNS TABLE(service_area_id uuid, exact_match boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH input AS (
    SELECT lower(btrim(regexp_replace(coalesce(requested_term, ''), '[^a-zA-Z0-9]+', ' ', 'g'))) COLLATE "C" AS term,
           least(greatest(coalesce(requested_limit, 8), 1), 8) AS row_limit
  ), selected_market AS (
    SELECT market.id
    FROM public.markets market
    WHERE market.slug = requested_market_slug AND market.active = true
  ), matches AS (
    SELECT search_term.service_area_id,
           min(CASE
             WHEN replace(area.slug, '-', ' ') = input.term THEN 1
             WHEN area.postal_code = input.term THEN 2
             WHEN lower(btrim(regexp_replace(area.label, '[^a-zA-Z0-9]+', ' ', 'g'))) COLLATE "C" = input.term THEN 3
             WHEN search_term.term_normalized = input.term THEN 4
             ELSE 99
           END) AS exact_rank,
           min(search_term.term_normalized) AS matched_term
    FROM input
    JOIN selected_market ON true
    JOIN public.service_area_search_terms search_term
      ON search_term.market_id = selected_market.id
     AND search_term.term_normalized LIKE input.term || '%'
    JOIN public.service_areas area
      ON area.id = search_term.service_area_id
     AND area.market_id = selected_market.id
     AND area.active = true
    WHERE input.term <> ''
    GROUP BY search_term.service_area_id
  ), ranked AS (
    SELECT matches.*,
           min(matches.exact_rank) FILTER (WHERE matches.exact_rank < 99) OVER () AS best_exact_rank
    FROM matches
  )
  SELECT ranked.service_area_id,
         ranked.exact_rank < 99 AND ranked.exact_rank = ranked.best_exact_rank AS exact_match
  FROM ranked, input
  ORDER BY exact_match DESC, ranked.exact_rank, ranked.matched_term, ranked.service_area_id
  LIMIT (SELECT row_limit FROM input);
$$;
REVOKE ALL ON FUNCTION geography_admin.search_active_service_areas(text, text, integer)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.stage_service_area_dataset(
  manifest jsonb,
  relationships jsonb,
  provided_manifest_sha256 text,
  provided_relationships_sha256 text,
  county_bundle jsonb,
  csa_bundle jsonb,
  zcta_bundle jsonb,
  legal_city_bundle jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  area_record jsonb;
  area_geometry public.geometry(MultiPolygon, 4326);
  area_geojson jsonb;
  area_sha256 text;
  boundary_geojson jsonb;
  boundary_id uuid;
  boundary_sha256 text;
  center_point public.geometry(Point, 4326);
  county_geometry public.geometry(MultiPolygon, 4326);
  dataset_id uuid;
  dataset_version_value text := manifest->>'datasetVersion';
  display_geojson jsonb;
  display_geometry_id uuid;
  display_sha256 text;
  existing_active_count integer := 0;
  market_id_value uuid;
  market_source jsonb;
  source_record jsonb;
  stable_match_id uuid;
  slug_match_id uuid;
  slug_match_stable_external_id text;
  target_area_active boolean;
  target_area_id uuid;
  version_id uuid;
  version_sha256 text;
  version_source_sha256 text;
BEGIN
  IF provided_manifest_sha256 IS DISTINCT FROM '2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47'
    OR provided_relationships_sha256 IS DISTINCT FROM '5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8' THEN
    RAISE EXCEPTION 'Dataset ledger checksums do not match the reviewed release.' USING ERRCODE = '23514';
  END IF;
  IF encode(extensions.digest(convert_to(manifest::text, 'utf8'), 'sha256'), 'hex')
      <> 'd0965b642e0b0073b39743a28f68d94293fad2b640d36371f00c22b5fcff9d54'
    OR encode(extensions.digest(convert_to(relationships::text, 'utf8'), 'sha256'), 'hex')
      <> '1e780b7f790c802f4b3f2c4b0660a5bb90683decfb5c508cbe21f68a011cf83e' THEN
    RAISE EXCEPTION 'Dataset JSON differs from the reviewed canonical release.' USING ERRCODE = '23514';
  END IF;
  IF encode(extensions.digest(convert_to(county_bundle::text, 'utf8'), 'sha256'), 'hex')
      IS DISTINCT FROM '5fd4460f31d6c942c3733d99f8d874ad6b88398c94b4d84e1dea97bb909f72b1'
    OR encode(extensions.digest(convert_to(csa_bundle::text, 'utf8'), 'sha256'), 'hex')
      IS DISTINCT FROM '346b290d5312d8dd253e9d5fabc158d8c12776e98cf684143b521d8575c0ec68'
    OR encode(extensions.digest(convert_to(zcta_bundle::text, 'utf8'), 'sha256'), 'hex')
      IS DISTINCT FROM '0362d1953502b989d59a43f792e405fcc36a27c0847e25d518ce36f1295fdaf5'
    OR encode(extensions.digest(convert_to(legal_city_bundle::text, 'utf8'), 'sha256'), 'hex')
      IS DISTINCT FROM 'c2bdcf416b62703755dcb36e0ef952b3abb698661bbcf2a5612e171e700afcd5' THEN
    RAISE EXCEPTION 'Source bundle JSON differs from the reviewed canonical release.' USING ERRCODE = '23514';
  END IF;
  IF (manifest->>'schemaVersion')::integer <> 2
    OR manifest->>'datasetVersion' <> 'la-county-06037-2026-07-12-v2'
    OR manifest#>>'{market,slug}' <> 'los-angeles'
    OR manifest#>>'{market,jurisdictionType}' <> 'county'
    OR manifest#>>'{market,jurisdictionGeoid}' <> '06037'
    OR manifest#>>'{market,stableExternalId}' <> 'urn:census:county:06037'
    OR manifest#>>'{market,state}' <> 'CA'
    OR manifest#>>'{market,country}' <> 'US'
    OR coalesce((manifest#>>'{activation,activateMarket}')::boolean, true)
    OR jsonb_array_length(coalesce(manifest#>'{activation,activateSlugs}', '[]'::jsonb)) <> 0 THEN
    RAISE EXCEPTION 'Only the inactive Los Angeles County GEOID 06037 dataset may be staged.' USING ERRCODE = '23514';
  END IF;
  IF (manifest#>>'{counts,areas}')::integer <> 661
    OR (manifest#>>'{counts,cities}')::integer <> 88
    OR (manifest#>>'{counts,communities}')::integer <> 269
    OR (manifest#>>'{counts,zctas}')::integer <> 304
    OR manifest#>>'{displayBoundaries,bundles,county}' <> 'county.geojson.gz'
    OR manifest#>>'{displayBoundaries,bundles,legalCity}' <> 'legal-city.geojson.gz'
    OR manifest#>>'{displayBoundaries,bundles,zcta}' <> 'zcta.geojson.gz'
    OR (manifest#>>'{displayBoundaries,counts,legalCityFeatures}')::integer <> 91
    OR (manifest#>>'{displayBoundaries,counts,legalCities}')::integer <> 88
    OR (manifest#>>'{displayBoundaries,counts,zctas}')::integer <> 304
    OR manifest#>>'{displayBoundaries,legalCityNameProperty}' <> 'CITY_NAME' THEN
    RAISE EXCEPTION 'LA County source and display-boundary counts do not match the reviewed release.' USING ERRCODE = '23514';
  END IF;
  IF relationships->>'datasetVersion' IS DISTINCT FROM dataset_version_value
    OR jsonb_array_length(coalesce(relationships->'relationships', '[]'::jsonb)) <> 298
    OR (
      SELECT count(*) FROM jsonb_array_elements(coalesce(relationships->'relationships', '[]'::jsonb)) relationship
      WHERE relationship->>'relationType' = 'DISPLAY_PARENT'
    ) <> 149
    OR (
      SELECT count(*) FROM jsonb_array_elements(coalesce(relationships->'relationships', '[]'::jsonb)) relationship
      WHERE relationship->>'relationType' = 'SEARCH_ROLLUP'
    ) <> 149
    OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(relationships->'relationships') relationship
    WHERE relationship->>'relationType' NOT IN ('DISPLAY_PARENT', 'SEARCH_ROLLUP')
      OR relationship->>'reviewedAt' IS NULL
      OR relationship->>'source' <> 'la-county-csa-lcity-review-v1'
  ) THEN
    RAISE EXCEPTION 'Only reviewed official CSA display-parent and search-rollup relationships may be staged.' USING ERRCODE = '23514';
  END IF;

  SELECT market.id INTO market_id_value
  FROM public.markets market
  WHERE market.slug = manifest#>>'{market,slug}'
    AND market.state = 'CA' AND market.country = 'US'
  FOR UPDATE;
  IF market_id_value IS NULL THEN
    RAISE EXCEPTION 'Canonical Los Angeles market must exist before staging.' USING ERRCODE = '23503';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('service-area-import:' || market_id_value::text, 0));

  SELECT dataset.id INTO dataset_id
  FROM public.geography_dataset_versions dataset
  WHERE dataset.dataset_version = dataset_version_value
    AND dataset.market_id = market_id_value
    AND dataset.manifest_sha256 = provided_manifest_sha256
    AND dataset.relationships_sha256 = provided_relationships_sha256
    AND dataset.market_display_geometry_version_id IS NOT NULL;
  IF dataset_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'datasetVersion', dataset_version_value,
      'jurisdictionGeoid', '06037',
      'stagedAreas', 661,
      'stagedGeometryVersions', 661,
      'stagedDisplayFeatures', 393,
      'existingActiveAreasUntouched', (
        SELECT count(*) FROM public.service_areas area
        WHERE area.market_id = market_id_value AND area.active = true
      ),
      'idempotent', true
    );
  ELSIF EXISTS (SELECT 1 FROM public.geography_dataset_versions dataset WHERE dataset.dataset_version = dataset_version_value) THEN
    RAISE EXCEPTION 'Dataset version conflicts with an existing immutable dataset ledger.' USING ERRCODE = '23514';
  END IF;

  CREATE TEMP TABLE geo_source_features (
    bundle text NOT NULL,
    feature_id text NOT NULL,
    feature_label text,
    geom public.geometry(Geometry, 4326) NOT NULL,
    PRIMARY KEY (bundle, feature_id)
  ) ON COMMIT DROP;
  CREATE TEMP TABLE imported_area_ids (
    stable_external_id text PRIMARY KEY,
    service_area_id uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO geo_source_features(bundle, feature_id, feature_label, geom)
  SELECT 'county.geojson.gz', feature->'properties'->>'GEOID', feature->'properties'->>'NAME',
         public.ST_SetSRID(public.ST_MakeValid(public.ST_GeomFromGeoJSON((feature->'geometry')::text)), 4326)
  FROM jsonb_array_elements(county_bundle->'features') feature;
  INSERT INTO geo_source_features(bundle, feature_id, feature_label, geom)
  SELECT 'csa-land.geojson.gz', feature->'properties'->>'OBJECTID', feature->'properties'->>'COMMUNITY',
         public.ST_SetSRID(public.ST_MakeValid(public.ST_GeomFromGeoJSON((feature->'geometry')::text)), 4326)
  FROM jsonb_array_elements(csa_bundle->'features') feature;
  INSERT INTO geo_source_features(bundle, feature_id, feature_label, geom)
  SELECT 'zcta.geojson.gz', feature->'properties'->>'ZCTA5', feature->'properties'->>'ZCTA5',
         public.ST_SetSRID(public.ST_MakeValid(public.ST_GeomFromGeoJSON((feature->'geometry')::text)), 4326)
  FROM jsonb_array_elements(zcta_bundle->'features') feature;
  INSERT INTO geo_source_features(bundle, feature_id, feature_label, geom)
  SELECT 'legal-city.geojson.gz', feature->'properties'->>'OBJECTID', feature->'properties'->>'CITY_NAME',
         public.ST_SetSRID(public.ST_MakeValid(public.ST_GeomFromGeoJSON((feature->'geometry')::text)), 4326)
  FROM jsonb_array_elements(legal_city_bundle->'features') feature
  WHERE feature->'properties'->>'CITY_TYPE' = 'City'
    AND feature->'properties'->>'FEAT_TYPE' = 'Land';

  IF (SELECT count(*) FROM geo_source_features WHERE bundle = 'county.geojson.gz') <> 1
    OR (SELECT count(*) FROM geo_source_features WHERE bundle = 'csa-land.geojson.gz') <> 355
    OR (SELECT count(*) FROM geo_source_features WHERE bundle = 'zcta.geojson.gz') <> 304
    OR (SELECT count(*) FROM geo_source_features WHERE bundle = 'legal-city.geojson.gz') <> 91
    OR (SELECT count(DISTINCT feature_label) FROM geo_source_features WHERE bundle = 'legal-city.geojson.gz') <> 88 THEN
    RAISE EXCEPTION 'Source bundle feature counts do not match the reviewed LA County release.' USING ERRCODE = '23514';
  END IF;

  SELECT public.ST_Multi(public.ST_CollectionExtract(geom, 3)) INTO county_geometry
  FROM geo_source_features WHERE bundle = 'county.geojson.gz' AND feature_id = '06037';
  IF county_geometry IS NULL OR public.ST_IsEmpty(county_geometry) THEN
    RAISE EXCEPTION 'County boundary GEOID 06037 is missing or empty.' USING ERRCODE = '23514';
  END IF;
  boundary_geojson := public.ST_AsGeoJSON(county_geometry, 6, 0)::jsonb;
  boundary_sha256 := encode(extensions.digest(convert_to(boundary_geojson::text, 'utf8'), 'sha256'), 'hex');
  SELECT source INTO market_source
  FROM jsonb_array_elements(manifest->'sources') source
  WHERE source->>'id' = 'census-county-2025';
  IF market_source IS NULL THEN
    RAISE EXCEPTION 'County source provenance is missing.' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.market_boundary_versions (
    market_id, dataset_version, geojson, sha256, source, source_version,
    source_license, source_url, source_retrieval_url, source_retrieved_at
  ) VALUES (
    market_id_value, dataset_version_value, boundary_geojson, boundary_sha256, market_source->>'id',
    market_source->>'sourceVersion', market_source->>'license', market_source->>'sourceUrl',
    market_source->>'retrievalUrl', (market_source->>'retrievalDate')::date
  ) ON CONFLICT (market_id, dataset_version) DO NOTHING;
  SELECT version.id, version.sha256 INTO boundary_id, version_sha256
  FROM public.market_boundary_versions version
  WHERE version.market_id = market_id_value AND version.dataset_version = dataset_version_value;
  IF boundary_id IS NULL OR version_sha256 <> boundary_sha256 THEN
    RAISE EXCEPTION 'Dataset version conflicts with an existing market boundary version.' USING ERRCODE = '23514';
  END IF;

  FOR area_record IN SELECT value FROM jsonb_array_elements(manifest->'areas') LOOP
    IF coalesce((area_record->>'active')::boolean, true) THEN
      RAISE EXCEPTION 'Imported area % is not inactive.', area_record->>'slug' USING ERRCODE = '23514';
    END IF;
    SELECT public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(public.ST_Intersection(
      public.ST_UnaryUnion(public.ST_Collect(source.geom ORDER BY source.feature_id COLLATE "C")), county_geometry
    )), 3)) INTO area_geometry
    FROM geo_source_features source
    WHERE source.bundle = area_record#>>'{geometry,bundle}'
      AND source.feature_id IN (SELECT jsonb_array_elements_text(area_record#>'{geometry,featureIds}'));
    IF area_geometry IS NULL OR public.ST_IsEmpty(area_geometry) THEN
      RAISE EXCEPTION 'Imported area % has empty county-clipped geometry.', area_record->>'slug' USING ERRCODE = '23514';
    END IF;
    area_geojson := jsonb_build_object(
      'type', 'Feature',
      'properties', jsonb_build_object(
        'kind', area_record->>'type',
        'slug', area_record->>'slug',
        'label', area_record->>'label'
      ),
      'geometry', public.ST_AsGeoJSON(area_geometry, 6, 0)::jsonb
    );
    area_sha256 := encode(extensions.digest(convert_to(area_geojson::text, 'utf8'), 'sha256'), 'hex');
    center_point := public.ST_PointOnSurface(area_geometry);
    source_record := area_record->'source';

    stable_match_id := NULL;
    slug_match_id := NULL;
    slug_match_stable_external_id := NULL;
    SELECT area.id INTO stable_match_id
    FROM public.service_areas area
    WHERE area.market_id = market_id_value
      AND area.stable_external_id = area_record->>'stableExternalId'
    FOR UPDATE;
    SELECT area.id, area.stable_external_id INTO slug_match_id, slug_match_stable_external_id
    FROM public.service_areas area
    WHERE area.market_id = market_id_value AND area.slug = area_record->>'slug'
    FOR UPDATE;
    IF stable_match_id IS NOT NULL AND slug_match_id IS NOT NULL AND stable_match_id <> slug_match_id THEN
      RAISE EXCEPTION 'Stable ID and market slug resolve to different service areas for %.', area_record->>'slug' USING ERRCODE = '23514';
    END IF;
    IF slug_match_stable_external_id IS NOT NULL
      AND slug_match_stable_external_id <> area_record->>'stableExternalId' THEN
      RAISE EXCEPTION 'Market slug % already has a different stable geography ID.', area_record->>'slug' USING ERRCODE = '23514';
    END IF;
    target_area_id := coalesce(stable_match_id, slug_match_id);

    IF target_area_id IS NULL THEN
      INSERT INTO public.service_areas (
        market_id, slug, label, type, postal_code, city, county, state,
        center_lat, center_lng, bbox_west, bbox_south, bbox_east, bbox_north,
        geojson_path, geojson_sha256, source, source_version, source_license,
        source_url, source_retrieval_url, source_retrieved_at, stable_external_id,
        search_terms, active, is_pilot
      ) VALUES (
        market_id_value, area_record->>'slug', area_record->>'label', area_record->>'type',
        nullif(area_record->>'postalCode', ''), nullif(area_record->>'city', ''),
        'Los Angeles County', 'CA', public.ST_Y(center_point), public.ST_X(center_point),
        public.ST_XMin(public.Box3D(area_geometry)), public.ST_YMin(public.Box3D(area_geometry)),
        public.ST_XMax(public.Box3D(area_geometry)), public.ST_YMax(public.Box3D(area_geometry)),
        '/api/service-areas/' || (area_record->>'slug') || '/geometry', area_sha256,
        source_record->>'id', source_record->>'sourceVersion', source_record->>'license',
        source_record->>'sourceUrl', source_record->>'retrievalUrl', (source_record->>'retrievalDate')::date,
        area_record->>'stableExternalId', ARRAY[]::text[], false, false
      ) RETURNING id INTO target_area_id;
    ELSE
      SELECT area.active INTO target_area_active FROM public.service_areas area WHERE area.id = target_area_id;
      IF target_area_active THEN
        existing_active_count := existing_active_count + 1;
      END IF;
    END IF;

    INSERT INTO public.service_area_geometry_versions (
      service_area_id, dataset_version, geojson, sha256, source_sha256,
      source, source_version, source_license, source_url, source_retrieval_url, source_retrieved_at
    ) VALUES (
      target_area_id, dataset_version_value, area_geojson, area_sha256, area_record#>>'{geometry,sha256}',
      source_record->>'id', source_record->>'sourceVersion', source_record->>'license',
      source_record->>'sourceUrl', source_record->>'retrievalUrl', (source_record->>'retrievalDate')::date
    ) ON CONFLICT (service_area_id, dataset_version) DO NOTHING;
    SELECT version.id, version.sha256, version.source_sha256
      INTO version_id, version_sha256, version_source_sha256
    FROM public.service_area_geometry_versions version
    WHERE version.service_area_id = target_area_id AND version.dataset_version = dataset_version_value;
    IF version_id IS NULL OR version_sha256 <> area_sha256 OR version_source_sha256 <> area_record#>>'{geometry,sha256}' THEN
      RAISE EXCEPTION 'Dataset version conflicts with existing geometry evidence for %.', area_record->>'slug' USING ERRCODE = '23514';
    END IF;
    INSERT INTO imported_area_ids VALUES (area_record->>'stableExternalId', target_area_id);
  END LOOP;

  IF (SELECT count(*) FROM imported_area_ids) <> 661
    OR (SELECT count(*) FROM public.service_area_geometry_versions WHERE dataset_version = dataset_version_value) <> 661
    OR (SELECT count(*) FROM jsonb_array_elements(manifest->'areas') area WHERE area->>'type' = 'city') <> 88
    OR (SELECT count(*) FROM jsonb_array_elements(manifest->'areas') area WHERE area->>'type' = 'neighborhood') <> 269
    OR (SELECT count(*) FROM jsonb_array_elements(manifest->'areas') area WHERE area->>'type' = 'zip') <> 304 THEN
    RAISE EXCEPTION 'Staged service-area or geometry counts do not match the reviewed release.' USING ERRCODE = '23514';
  END IF;

  CREATE TEMP TABLE market_display_features (
    kind text NOT NULL,
    slug text NOT NULL,
    label text NOT NULL,
    geom public.geometry(MultiPolygon, 4326) NOT NULL,
    PRIMARY KEY (kind, slug)
  ) ON COMMIT DROP;

  INSERT INTO market_display_features(kind, slug, label, geom)
  VALUES ('county', 'los-angeles-county', 'Los Angeles County', county_geometry);

  INSERT INTO market_display_features(kind, slug, label, geom)
  SELECT 'city',
         trim(both '-' FROM regexp_replace(lower(source.feature_label), '[^a-z0-9]+', '-', 'g')),
         source.feature_label,
         public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(public.ST_Intersection(
           public.ST_UnaryUnion(public.ST_Collect(source.geom ORDER BY source.feature_id COLLATE "C")),
           county_geometry
         )), 3))
  FROM geo_source_features source
  WHERE source.bundle = 'legal-city.geojson.gz'
  GROUP BY source.feature_label;

  INSERT INTO market_display_features(kind, slug, label, geom)
  SELECT 'zip', source.feature_id, source.feature_id,
         public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(
           public.ST_Intersection(source.geom, county_geometry)
         ), 3))
  FROM geo_source_features source
  WHERE source.bundle = 'zcta.geojson.gz';

  IF (SELECT count(*) FROM market_display_features WHERE kind = 'county') <> 1
    OR (SELECT count(*) FROM market_display_features WHERE kind = 'city') <> 88
    OR (SELECT count(*) FROM market_display_features WHERE kind = 'zip') <> 304
    OR EXISTS (SELECT 1 FROM market_display_features WHERE public.ST_IsEmpty(geom)) THEN
    RAISE EXCEPTION 'Display boundary generation did not produce 1 county, 88 cities, and 304 ZCTAs.' USING ERRCODE = '23514';
  END IF;

  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'properties', jsonb_build_object('kind', kind, 'slug', slug, 'label', label),
        'geometry', public.ST_AsGeoJSON(
          public.ST_SimplifyPreserveTopology(
            geom,
            CASE kind WHEN 'county' THEN 0.0003 WHEN 'city' THEN 0.0002 ELSE 0.00025 END
          ),
          5,
          0
        )::jsonb
      )
      ORDER BY CASE kind WHEN 'county' THEN 0 WHEN 'city' THEN 1 ELSE 2 END, slug COLLATE "C"
    )
  ) INTO display_geojson
  FROM market_display_features;
  display_sha256 := encode(extensions.digest(convert_to(display_geojson::text, 'utf8'), 'sha256'), 'hex');
  IF display_sha256 <> '55813f467a184a26398b7f52d9995dcdcf5678db98b4f5950b1740ee9fd92443' THEN
    RAISE EXCEPTION 'Generated display geometry differs from the reviewed production rehearsal.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.market_display_geometry_versions (
    market_id, dataset_version, geojson, sha256, source_manifest
  ) VALUES (
    market_id_value, dataset_version_value, display_geojson, display_sha256,
    jsonb_build_object('displayBoundaries', manifest->'displayBoundaries', 'sources', manifest->'sources')
  ) ON CONFLICT (market_id, dataset_version) DO NOTHING;
  SELECT version.id, version.sha256 INTO display_geometry_id, version_sha256
  FROM public.market_display_geometry_versions version
  WHERE version.market_id = market_id_value AND version.dataset_version = dataset_version_value;
  IF display_geometry_id IS NULL OR version_sha256 <> display_sha256 THEN
    RAISE EXCEPTION 'Dataset version conflicts with an existing market display geometry.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(relationships->'relationships') relationship
    LEFT JOIN imported_area_ids parent ON parent.stable_external_id = relationship->>'parentStableExternalId'
    LEFT JOIN imported_area_ids child ON child.stable_external_id = relationship->>'childStableExternalId'
    WHERE parent.service_area_id IS NULL OR child.service_area_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Relationship evidence references an area outside the staged dataset.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.geography_dataset_versions (
    dataset_version, market_id, market_boundary_version_id, market_display_geometry_version_id, manifest_sha256,
    relationships_sha256, manifest, relationships
  ) VALUES (
    dataset_version_value, market_id_value, boundary_id, display_geometry_id, provided_manifest_sha256,
    provided_relationships_sha256, manifest, relationships
  ) ON CONFLICT (dataset_version) DO NOTHING;
  SELECT dataset.id INTO dataset_id
  FROM public.geography_dataset_versions dataset
  WHERE dataset.dataset_version = dataset_version_value
    AND dataset.market_id = market_id_value
    AND dataset.market_boundary_version_id = boundary_id
    AND dataset.market_display_geometry_version_id = display_geometry_id
    AND dataset.manifest_sha256 = provided_manifest_sha256
    AND dataset.relationships_sha256 = provided_relationships_sha256;
  IF dataset_id IS NULL THEN
    RAISE EXCEPTION 'Dataset version conflicts with an existing immutable dataset ledger.' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'datasetVersion', dataset_version_value,
    'jurisdictionGeoid', '06037',
    'stagedAreas', (SELECT count(*) FROM imported_area_ids),
    'stagedGeometryVersions', (SELECT count(*) FROM public.service_area_geometry_versions WHERE dataset_version = dataset_version_value),
    'stagedDisplayFeatures', jsonb_array_length(display_geojson->'features'),
    'stagedOfficialDisplayParents', (
      SELECT count(*) FROM jsonb_array_elements(relationships->'relationships') relationship
      WHERE relationship->>'relationType' = 'DISPLAY_PARENT'
    ),
    'stagedOfficialRollups', (
      SELECT count(*) FROM jsonb_array_elements(relationships->'relationships') relationship
      WHERE relationship->>'relationType' = 'SEARCH_ROLLUP'
    ),
    'existingActiveAreasUntouched', existing_active_count,
    'activeAreasChanged', 0,
    'currentGeometryPointersChanged', 0,
    'marketBoundsChanged', 0,
    'liveRelationshipsChanged', 0
  );
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.stage_service_area_dataset(jsonb, jsonb, text, text, jsonb, jsonb, jsonb, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.assert_la_county_activation_current(requested_dataset_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  activation_snapshot public.geography_activation_snapshots%ROWTYPE;
  boundary_geometry public.geometry(MultiPolygon, 4326);
  center_point public.geometry(Point, 4326);
  dataset_record public.geography_dataset_versions%ROWTYPE;
BEGIN
  SELECT dataset.* INTO dataset_record
  FROM public.geography_dataset_versions dataset
  WHERE dataset.id = requested_dataset_id;
  IF dataset_record.id IS NULL THEN
    RAISE EXCEPTION 'Activated geography dataset is missing.' USING ERRCODE = '23514';
  END IF;
  SELECT snapshot.* INTO activation_snapshot
  FROM public.geography_activation_snapshots snapshot
  WHERE snapshot.dataset_version = dataset_record.dataset_version
    AND snapshot.market_id = dataset_record.market_id;
  IF activation_snapshot.id IS NULL OR activation_snapshot.rolled_back_at IS NOT NULL THEN
    RAISE EXCEPTION 'Active geography snapshot is missing.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.service_area_search_terms search_term
    WHERE search_term.source = dataset_record.dataset_version
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
        JOIN public.service_areas area
          ON area.market_id = dataset_record.market_id
         AND area.slug = manifest_area->>'slug'
        CROSS JOIN LATERAL jsonb_array_elements_text(manifest_area->'searchTerms') term(value)
        WHERE search_term.market_id = dataset_record.market_id
          AND search_term.service_area_id = area.id
          AND search_term.term_normalized = term.value COLLATE "C"
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.service_area_relationships stored
    WHERE stored.source = dataset_record.dataset_version
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(dataset_record.relationships->'relationships') relationship(value)
        JOIN public.service_areas parent
          ON parent.market_id = dataset_record.market_id
         AND parent.stable_external_id = relationship.value->>'parentStableExternalId'
        JOIN public.service_areas child
          ON child.market_id = dataset_record.market_id
         AND child.stable_external_id = relationship.value->>'childStableExternalId'
        WHERE stored.parent_service_area_id = parent.id
          AND stored.child_service_area_id = child.id
          AND stored.relation_type = (relationship.value->>'relationType')::public."ServiceAreaRelationType"
      )
  ) THEN
    RAISE EXCEPTION 'Release-owned geography contains an unapproved live key.' USING ERRCODE = '23514';
  END IF;

  SELECT public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(
    public.ST_GeomFromGeoJSON(boundary.geojson::text)
  ), 3)) INTO boundary_geometry
  FROM public.market_boundary_versions boundary
  WHERE boundary.id = dataset_record.market_boundary_version_id
    AND boundary.market_id = dataset_record.market_id;
  center_point := public.ST_PointOnSurface(boundary_geometry);

  IF boundary_geometry IS NULL OR public.ST_IsEmpty(boundary_geometry)
    OR NOT EXISTS (
      SELECT 1 FROM public.markets market
      WHERE market.id = dataset_record.market_id
        AND market.active = true
        AND market.label = 'Los Angeles County'
        AND market.jurisdiction_type = 'county'
        AND market.jurisdiction_geoid = '06037'
        AND market.stable_external_id = 'urn:census:county:06037'
        AND market.current_boundary_id = dataset_record.market_boundary_version_id
        AND market.current_display_geometry_id = dataset_record.market_display_geometry_version_id
        AND market.center_lat = public.ST_Y(center_point)
        AND market.center_lng = public.ST_X(center_point)
        AND market.bbox_west = public.ST_XMin(public.Box3D(boundary_geometry))
        AND market.bbox_south = public.ST_YMin(public.Box3D(boundary_geometry))
        AND market.bbox_east = public.ST_XMax(public.Box3D(boundary_geometry))
        AND market.bbox_north = public.ST_YMax(public.Box3D(boundary_geometry))
    )
    OR (SELECT display.sha256 FROM public.market_display_geometry_versions display
        WHERE display.id = dataset_record.market_display_geometry_version_id)
       IS DISTINCT FROM '55813f467a184a26398b7f52d9995dcdcf5678db98b4f5950b1740ee9fd92443'
    OR (SELECT count(*) FROM jsonb_array_elements(dataset_record.manifest->'areas')) <> 661
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
      LEFT JOIN public.service_areas area
        ON area.market_id = dataset_record.market_id
       AND area.slug = manifest_area->>'slug'
      LEFT JOIN public.service_area_geometry_versions geometry_version
        ON geometry_version.service_area_id = area.id
       AND geometry_version.dataset_version = dataset_record.dataset_version
      LEFT JOIN LATERAL (
        SELECT public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(
          public.ST_GeomFromGeoJSON((geometry_version.geojson->'geometry')::text)
        ), 3)) AS geom
      ) computed ON geometry_version.geojson->>'type' = 'Feature'
      WHERE area.id IS NULL OR geometry_version.id IS NULL OR computed.geom IS NULL
        OR area.stable_external_id IS DISTINCT FROM manifest_area->>'stableExternalId'
        OR area.current_geometry_id IS DISTINCT FROM geometry_version.id
        OR area.geojson_sha256 IS DISTINCT FROM geometry_version.sha256
        OR area.label IS DISTINCT FROM manifest_area->>'label'
        OR area.type IS DISTINCT FROM manifest_area->>'type'
        OR area.postal_code IS DISTINCT FROM nullif(manifest_area->>'postalCode', '')
        OR area.city IS DISTINCT FROM nullif(manifest_area->>'city', '')
        OR area.county IS DISTINCT FROM manifest_area->>'county'
        OR area.state IS DISTINCT FROM manifest_area->>'state'
        OR area.center_lat IS DISTINCT FROM public.ST_Y(public.ST_PointOnSurface(computed.geom))
        OR area.center_lng IS DISTINCT FROM public.ST_X(public.ST_PointOnSurface(computed.geom))
        OR area.bbox_west IS DISTINCT FROM public.ST_XMin(public.Box3D(computed.geom))
        OR area.bbox_south IS DISTINCT FROM public.ST_YMin(public.Box3D(computed.geom))
        OR area.bbox_east IS DISTINCT FROM public.ST_XMax(public.Box3D(computed.geom))
        OR area.bbox_north IS DISTINCT FROM public.ST_YMax(public.Box3D(computed.geom))
        OR area.geojson_path IS DISTINCT FROM '/api/service-areas/' || (manifest_area->>'slug') || '/geometry'
        OR area.source IS DISTINCT FROM manifest_area#>>'{source,id}'
        OR area.source_version IS DISTINCT FROM manifest_area#>>'{source,sourceVersion}'
        OR area.source_license IS DISTINCT FROM manifest_area#>>'{source,license}'
        OR area.source_url IS DISTINCT FROM manifest_area#>>'{source,sourceUrl}'
        OR area.source_retrieval_url IS DISTINCT FROM manifest_area#>>'{source,retrievalUrl}'
        OR area.source_retrieved_at IS DISTINCT FROM (manifest_area#>>'{source,retrievalDate}')::date
        OR area.search_terms IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(manifest_area->'searchTerms'))
        OR area.is_pilot IS DISTINCT FROM false
        OR area.active IS DISTINCT FROM (
          manifest_area->>'type' IN ('city', 'zip')
          OR manifest_area->>'slug' IN ('encino', 'northridge', 'tarzana')
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.service_areas area
      WHERE area.market_id = dataset_record.market_id AND area.active
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
          WHERE manifest_area->>'slug' = area.slug
        )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
      JOIN public.service_areas area
        ON area.market_id = dataset_record.market_id AND area.slug = manifest_area->>'slug'
      CROSS JOIN LATERAL jsonb_array_elements_text(manifest_area->'searchTerms') term(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.service_area_search_terms search_term
        WHERE search_term.market_id = dataset_record.market_id
          AND search_term.service_area_id = area.id
          AND search_term.term_normalized = term.value COLLATE "C"
          AND (
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements(coalesce(
                activation_snapshot.snapshot->'preexisting_search_terms', '[]'::jsonb
              )) previous(value)
              WHERE previous.value->>'id' = search_term.id::text
                AND previous.value->>'service_area_id' = area.id::text
                AND previous.value->>'term_normalized' = term.value
                AND search_term.term_kind IS NOT DISTINCT FROM previous.value->>'term_kind'
                AND search_term.source IS NOT DISTINCT FROM previous.value->>'source'
                AND search_term.reviewed_at IS NOT DISTINCT FROM (previous.value->>'reviewed_at')::timestamptz
                AND search_term.created_at IS NOT DISTINCT FROM (previous.value->>'created_at')::timestamptz
            )
            OR (
              NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(coalesce(
                  activation_snapshot.snapshot->'preexisting_search_terms', '[]'::jsonb
                )) previous(value)
                WHERE previous.value->>'service_area_id' = area.id::text
                  AND previous.value->>'term_normalized' = term.value
              )
              AND search_term.term_kind = 'DATASET_REVIEWED_ALIAS'
              AND search_term.source = dataset_record.dataset_version
              AND search_term.reviewed_at IS NOT DISTINCT FROM
                (dataset_record.manifest#>>'{relationshipPolicy,reviewedAt}')::timestamptz
            )
          )
      )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(dataset_record.relationships->'relationships') relationship(value)
      JOIN public.service_areas parent
        ON parent.market_id = dataset_record.market_id
       AND parent.stable_external_id = relationship.value->>'parentStableExternalId'
      JOIN public.service_areas child
        ON child.market_id = dataset_record.market_id
       AND child.stable_external_id = relationship.value->>'childStableExternalId'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.service_area_relationships stored
        WHERE stored.parent_service_area_id = parent.id
          AND stored.child_service_area_id = child.id
          AND stored.relation_type = (relationship.value->>'relationType')::public."ServiceAreaRelationType"
          AND (
            EXISTS (
              SELECT 1
              FROM jsonb_array_elements(coalesce(
                activation_snapshot.snapshot->'preexisting_relationships', '[]'::jsonb
              )) previous(value)
              WHERE previous.value->>'parent_service_area_id' = parent.id::text
                AND previous.value->>'child_service_area_id' = child.id::text
                AND previous.value->>'relation_type' = stored.relation_type::text
                AND stored.source IS NOT DISTINCT FROM previous.value->>'source'
                AND stored.reviewed_at IS NOT DISTINCT FROM (previous.value->>'reviewed_at')::timestamptz
                AND stored.created_at IS NOT DISTINCT FROM (previous.value->>'created_at')::timestamptz
                AND stored.updated_at IS NOT DISTINCT FROM (previous.value->>'updated_at')::timestamptz
            )
            OR (
              NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(coalesce(
                  activation_snapshot.snapshot->'preexisting_relationships', '[]'::jsonb
                )) previous(value)
                WHERE previous.value->>'parent_service_area_id' = parent.id::text
                  AND previous.value->>'child_service_area_id' = child.id::text
                  AND previous.value->>'relation_type' = stored.relation_type::text
              )
              AND stored.source = dataset_record.dataset_version
              AND stored.reviewed_at IS NOT DISTINCT FROM (relationship.value->>'reviewedAt')::timestamptz
            )
          )
      )
    )
    OR EXISTS (
      SELECT 1 FROM public."BuyerProfile" buyer
      WHERE buyer."visibilityStatus" = 'ACTIVE'
        AND 1 <> (
          SELECT count(*)
          FROM public.buyer_desired_service_areas desired
          JOIN public.service_areas area ON area.id = desired.service_area_id
          JOIN public.markets market ON market.id = area.market_id
          WHERE desired.buyer_profile_id = buyer.id
            AND desired.source = 'SELECTED'
            AND desired.is_primary = true
            AND area.active = true
            AND market.active = true
        )
    ) THEN
    RAISE EXCEPTION 'Live LA County geography differs from its approved activation.' USING ERRCODE = '23514';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.assert_la_county_activation_current(uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.activate_service_area_dataset(
  requested_dataset_version text,
  expected_manifest_sha256 text,
  expected_relationships_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  boundary_geometry public.geometry(MultiPolygon, 4326);
  center_point public.geometry(Point, 4326);
  dataset_record public.geography_dataset_versions%ROWTYPE;
  existing_snapshot public.geography_activation_snapshots%ROWTYPE;
  market_snapshot jsonb;
BEGIN
  IF requested_dataset_version <> 'la-county-06037-2026-07-12-v2'
    OR expected_manifest_sha256 <> '2e78ac34fa9f9f740d065ea2d578453bf1d9bf36fc578b90e6e976c67d27bb47'
    OR expected_relationships_sha256 <> '5136dfa84c1a23ae4772ae510cec8ef16c7e5a1a7cc566a604842edf56c156f8' THEN
    RAISE EXCEPTION 'Activation requires the exact reviewed LA County v2 checksum ledger.' USING ERRCODE = '23514';
  END IF;

  SELECT dataset.* INTO dataset_record
  FROM public.geography_dataset_versions dataset
  WHERE dataset.dataset_version = requested_dataset_version
    AND dataset.manifest_sha256 = expected_manifest_sha256
    AND dataset.relationships_sha256 = expected_relationships_sha256
    AND dataset.market_display_geometry_version_id IS NOT NULL;
  IF dataset_record.id IS NULL THEN
    RAISE EXCEPTION 'The exact reviewed LA County dataset is not staged.' USING ERRCODE = '23503';
  END IF;
  IF (SELECT display.sha256 FROM public.market_display_geometry_versions display
      WHERE display.id = dataset_record.market_display_geometry_version_id)
      IS DISTINCT FROM '55813f467a184a26398b7f52d9995dcdcf5678db98b4f5950b1740ee9fd92443' THEN
    RAISE EXCEPTION 'The staged display geometry does not match the reviewed release.' USING ERRCODE = '23514';
  END IF;

  PERFORM 1 FROM public.markets market WHERE market.id = dataset_record.market_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The staged market is missing.' USING ERRCODE = '23503'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('service-area-activation:' || dataset_record.market_id::text, 0));

  SELECT snapshot.* INTO existing_snapshot
  FROM public.geography_activation_snapshots snapshot
  WHERE snapshot.dataset_version = requested_dataset_version
  FOR UPDATE;
  IF existing_snapshot.id IS NOT NULL THEN
    IF existing_snapshot.rolled_back_at IS NOT NULL THEN
      RAISE EXCEPTION 'A rolled-back dataset cannot be reactivated; stage a new immutable release.' USING ERRCODE = '23514';
    END IF;
    PERFORM geography_admin.assert_la_county_activation_current(dataset_record.id);
    RETURN jsonb_build_object(
      'datasetVersion', requested_dataset_version,
      'activeCities', 88,
      'activeZctas', 304,
      'idempotent', true
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.service_area_search_terms
    WHERE source = requested_dataset_version
  ) OR EXISTS (
    SELECT 1 FROM public.service_area_relationships
    WHERE source = requested_dataset_version
  ) THEN
    RAISE EXCEPTION 'Release-owned live geography rows already exist before activation.' USING ERRCODE = '23514';
  END IF;

  CREATE TEMP TABLE activation_areas (
    service_area_id uuid PRIMARY KEY,
    stable_external_id text NOT NULL UNIQUE,
    geometry_version_id uuid NOT NULL UNIQUE,
    geometry_sha256 text NOT NULL,
    center_lat double precision NOT NULL,
    center_lng double precision NOT NULL,
    bbox_west double precision NOT NULL,
    bbox_south double precision NOT NULL,
    bbox_east double precision NOT NULL,
    bbox_north double precision NOT NULL,
    approved_active boolean NOT NULL,
    manifest_area jsonb NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO activation_areas(
    service_area_id, stable_external_id, geometry_version_id, geometry_sha256,
    center_lat, center_lng, bbox_west, bbox_south, bbox_east, bbox_north,
    approved_active, manifest_area
  )
  SELECT area.id,
         manifest_area->>'stableExternalId',
         geometry_version.id,
         geometry_version.sha256,
         public.ST_Y(public.ST_PointOnSurface(computed.geom)),
         public.ST_X(public.ST_PointOnSurface(computed.geom)),
         public.ST_XMin(public.Box3D(computed.geom)),
         public.ST_YMin(public.Box3D(computed.geom)),
         public.ST_XMax(public.Box3D(computed.geom)),
         public.ST_YMax(public.Box3D(computed.geom)),
         manifest_area->>'type' IN ('city', 'zip'),
         manifest_area
  FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
  JOIN public.service_areas area
    ON area.market_id = dataset_record.market_id
   AND area.slug = manifest_area->>'slug'
  JOIN public.service_area_geometry_versions geometry_version
    ON geometry_version.service_area_id = area.id
   AND geometry_version.dataset_version = requested_dataset_version
   AND geometry_version.geojson->>'type' = 'Feature'
  CROSS JOIN LATERAL (
    SELECT public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(
      public.ST_GeomFromGeoJSON((geometry_version.geojson->'geometry')::text)
    ), 3)) AS geom
  ) computed
  WHERE NOT public.ST_IsEmpty(computed.geom);

  IF (SELECT count(*) FROM activation_areas) <> 661
    OR (SELECT count(*) FROM activation_areas WHERE approved_active AND manifest_area->>'type' = 'city') <> 88
    OR (SELECT count(*) FROM activation_areas WHERE approved_active AND manifest_area->>'type' = 'zip') <> 304
    OR EXISTS (
      SELECT 1
      FROM activation_areas activation
      JOIN public.service_areas area ON area.id = activation.service_area_id
      WHERE area.stable_external_id IS NOT NULL
        AND area.stable_external_id <> activation.stable_external_id
    ) THEN
    RAISE EXCEPTION 'Activation allowlist or staged source identity is incomplete.' USING ERRCODE = '23514';
  END IF;

  SELECT jsonb_build_object(
    'label', market.label,
    'jurisdiction_type', market.jurisdiction_type,
    'jurisdiction_geoid', market.jurisdiction_geoid,
    'stable_external_id', market.stable_external_id,
    'current_boundary_id', market.current_boundary_id,
    'current_display_geometry_id', market.current_display_geometry_id,
    'center_lat', market.center_lat,
    'center_lng', market.center_lng,
    'bbox_west', market.bbox_west,
    'bbox_south', market.bbox_south,
    'bbox_east', market.bbox_east,
    'bbox_north', market.bbox_north
  ) INTO market_snapshot
  FROM public.markets market
  WHERE market.id = dataset_record.market_id;

  INSERT INTO public.geography_activation_snapshots(dataset_version, market_id, snapshot)
  SELECT requested_dataset_version, dataset_record.market_id, jsonb_build_object(
    'market', market_snapshot,
    'areas', jsonb_agg(jsonb_build_object(
      'id', area.id,
      'label', area.label,
      'type', area.type,
      'postal_code', area.postal_code,
      'city', area.city,
      'county', area.county,
      'state', area.state,
      'center_lat', area.center_lat,
      'center_lng', area.center_lng,
      'bbox_west', area.bbox_west,
      'bbox_south', area.bbox_south,
      'bbox_east', area.bbox_east,
      'bbox_north', area.bbox_north,
      'geojson_path', area.geojson_path,
      'geojson_sha256', area.geojson_sha256,
      'source', area.source,
      'source_version', area.source_version,
      'source_license', area.source_license,
      'source_url', area.source_url,
      'source_retrieval_url', area.source_retrieval_url,
      'source_retrieved_at', area.source_retrieved_at,
      'search_terms', area.search_terms,
      'active', area.active,
      'is_pilot', area.is_pilot,
      'current_geometry_id', area.current_geometry_id
    ) ORDER BY area.id),
    'preexisting_search_terms', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', stored.id,
        'service_area_id', stored.service_area_id,
        'term_normalized', stored.term_normalized,
        'term_kind', stored.term_kind,
        'source', stored.source,
        'reviewed_at', stored.reviewed_at,
        'created_at', stored.created_at
      ) ORDER BY stored.id), '[]'::jsonb)
      FROM activation_areas expected_area
      CROSS JOIN LATERAL jsonb_array_elements_text(expected_area.manifest_area->'searchTerms') term(value)
      JOIN public.service_area_search_terms stored
        ON stored.market_id = dataset_record.market_id
       AND stored.service_area_id = expected_area.service_area_id
       AND stored.term_normalized = term.value COLLATE "C"
    ),
    'preexisting_relationships', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'parent_service_area_id', stored.parent_service_area_id,
        'child_service_area_id', stored.child_service_area_id,
        'relation_type', stored.relation_type,
        'source', stored.source,
        'reviewed_at', stored.reviewed_at,
        'created_at', stored.created_at,
        'updated_at', stored.updated_at
      ) ORDER BY stored.parent_service_area_id, stored.child_service_area_id, stored.relation_type), '[]'::jsonb)
      FROM jsonb_array_elements(dataset_record.relationships->'relationships') relationship(value)
      JOIN activation_areas parent
        ON parent.stable_external_id = relationship.value->>'parentStableExternalId'
      JOIN activation_areas child
        ON child.stable_external_id = relationship.value->>'childStableExternalId'
      JOIN public.service_area_relationships stored
        ON stored.parent_service_area_id = parent.service_area_id
       AND stored.child_service_area_id = child.service_area_id
       AND stored.relation_type = (relationship.value->>'relationType')::public."ServiceAreaRelationType"
    )
  )
  FROM activation_areas activation
  JOIN public.service_areas area ON area.id = activation.service_area_id;

  SELECT public.ST_Multi(public.ST_CollectionExtract(public.ST_MakeValid(
    public.ST_GeomFromGeoJSON(boundary.geojson::text)
  ), 3)) INTO boundary_geometry
  FROM public.market_boundary_versions boundary
  WHERE boundary.id = dataset_record.market_boundary_version_id
    AND boundary.market_id = dataset_record.market_id;
  IF boundary_geometry IS NULL OR public.ST_IsEmpty(boundary_geometry) THEN
    RAISE EXCEPTION 'Approved County boundary is missing or empty.' USING ERRCODE = '23514';
  END IF;
  center_point := public.ST_PointOnSurface(boundary_geometry);

  UPDATE public.markets SET
    label = 'Los Angeles County',
    jurisdiction_type = 'county',
    jurisdiction_geoid = '06037',
    stable_external_id = 'urn:census:county:06037',
    current_boundary_id = dataset_record.market_boundary_version_id,
    current_display_geometry_id = dataset_record.market_display_geometry_version_id,
    center_lat = public.ST_Y(center_point),
    center_lng = public.ST_X(center_point),
    bbox_west = public.ST_XMin(public.Box3D(boundary_geometry)),
    bbox_south = public.ST_YMin(public.Box3D(boundary_geometry)),
    bbox_east = public.ST_XMax(public.Box3D(boundary_geometry)),
    bbox_north = public.ST_YMax(public.Box3D(boundary_geometry)),
    updated_at = now()
  WHERE id = dataset_record.market_id;

  UPDATE public.service_areas area SET
    label = activation.manifest_area->>'label',
    type = activation.manifest_area->>'type',
    postal_code = nullif(activation.manifest_area->>'postalCode', ''),
    city = nullif(activation.manifest_area->>'city', ''),
    county = activation.manifest_area->>'county',
    state = activation.manifest_area->>'state',
    center_lat = activation.center_lat,
    center_lng = activation.center_lng,
    bbox_west = activation.bbox_west,
    bbox_south = activation.bbox_south,
    bbox_east = activation.bbox_east,
    bbox_north = activation.bbox_north,
    geojson_path = '/api/service-areas/' || (activation.manifest_area->>'slug') || '/geometry',
    geojson_sha256 = activation.geometry_sha256,
    source = activation.manifest_area#>>'{source,id}',
    source_version = activation.manifest_area#>>'{source,sourceVersion}',
    source_license = activation.manifest_area#>>'{source,license}',
    source_url = activation.manifest_area#>>'{source,sourceUrl}',
    source_retrieval_url = activation.manifest_area#>>'{source,retrievalUrl}',
    source_retrieved_at = (activation.manifest_area#>>'{source,retrievalDate}')::date,
    search_terms = ARRAY(SELECT jsonb_array_elements_text(activation.manifest_area->'searchTerms')),
    stable_external_id = coalesce(area.stable_external_id, activation.stable_external_id),
    current_geometry_id = activation.geometry_version_id,
    active = area.active OR activation.approved_active,
    is_pilot = false,
    updated_at = now()
  FROM activation_areas activation
  WHERE area.id = activation.service_area_id;

  INSERT INTO public.service_area_search_terms(
    market_id, service_area_id, term_normalized, term_kind, source, reviewed_at
  )
  SELECT dataset_record.market_id,
         activation.service_area_id,
         term.value COLLATE "C",
         'DATASET_REVIEWED_ALIAS',
         requested_dataset_version,
         (dataset_record.manifest#>>'{relationshipPolicy,reviewedAt}')::timestamptz
  FROM activation_areas activation
  CROSS JOIN LATERAL jsonb_array_elements_text(activation.manifest_area->'searchTerms') term(value)
  ON CONFLICT (market_id, term_normalized, service_area_id) DO NOTHING;

  INSERT INTO public.service_area_relationships(
    parent_service_area_id, child_service_area_id, relation_type, source, reviewed_at
  )
  SELECT parent.service_area_id,
         child.service_area_id,
         (relationship.value->>'relationType')::public."ServiceAreaRelationType",
         requested_dataset_version,
         (relationship.value->>'reviewedAt')::timestamptz
  FROM jsonb_array_elements(dataset_record.relationships->'relationships') relationship(value)
  JOIN activation_areas parent ON parent.stable_external_id = relationship.value->>'parentStableExternalId'
  JOIN activation_areas child ON child.stable_external_id = relationship.value->>'childStableExternalId'
  ON CONFLICT (parent_service_area_id, child_service_area_id, relation_type) DO NOTHING;

  SET CONSTRAINTS ALL IMMEDIATE;

  IF (SELECT count(*) FROM public.service_areas WHERE market_id = dataset_record.market_id AND active AND type = 'city') <> 88
    OR (SELECT count(*) FROM public.service_areas WHERE market_id = dataset_record.market_id AND active AND type = 'zip') <> 304
    OR (SELECT count(*) FROM public.service_areas WHERE market_id = dataset_record.market_id AND active AND type = 'neighborhood') <> 3
    OR (SELECT count(*) FROM public.service_areas WHERE market_id = dataset_record.market_id AND current_geometry_id IS NOT NULL) <> 661
    OR EXISTS (
      SELECT 1 FROM public.service_areas area
      JOIN public.markets market ON market.id = area.market_id
      WHERE area.market_id = dataset_record.market_id AND area.active
        AND (area.bbox_west < market.bbox_west OR area.bbox_south < market.bbox_south
          OR area.bbox_east > market.bbox_east OR area.bbox_north > market.bbox_north)
    )
    OR EXISTS (
      SELECT 1
      FROM activation_areas activation
      CROSS JOIN LATERAL jsonb_array_elements_text(activation.manifest_area->'searchTerms') term(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.service_area_search_terms search_term
        WHERE search_term.market_id = dataset_record.market_id
          AND search_term.service_area_id = activation.service_area_id
          AND search_term.term_normalized = term.value COLLATE "C"
      )
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(dataset_record.relationships->'relationships') relationship(value)
      JOIN activation_areas parent ON parent.stable_external_id = relationship.value->>'parentStableExternalId'
      JOIN activation_areas child ON child.stable_external_id = relationship.value->>'childStableExternalId'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.service_area_relationships stored
        WHERE stored.parent_service_area_id = parent.service_area_id
          AND stored.child_service_area_id = child.service_area_id
          AND stored.relation_type = (relationship.value->>'relationType')::public."ServiceAreaRelationType"
          AND stored.reviewed_at IS NOT NULL
      )
    ) THEN
    RAISE EXCEPTION 'LA County activation postconditions failed.' USING ERRCODE = '23514';
  END IF;
  PERFORM geography_admin.assert_la_county_activation_current(dataset_record.id);

  RETURN jsonb_build_object(
    'datasetVersion', requested_dataset_version,
    'activeCities', 88,
    'activeZctas', 304,
    'preservedActiveNeighborhoods', 3,
    'currentGeometryPointers', 661,
    'marketBoundaryVersionId', dataset_record.market_boundary_version_id,
    'marketDisplayGeometryVersionId', dataset_record.market_display_geometry_version_id,
    'idempotent', false
  );
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.activate_service_area_dataset(text, text, text)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION geography_admin.rollback_service_area_dataset(requested_dataset_version text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  dataset_record public.geography_dataset_versions%ROWTYPE;
  market_state jsonb;
  snapshot_record public.geography_activation_snapshots%ROWTYPE;
BEGIN
  IF requested_dataset_version <> 'la-county-06037-2026-07-12-v2' THEN
    RAISE EXCEPTION 'Rollback requires the exact activated LA County v2 dataset.' USING ERRCODE = '23514';
  END IF;
  SELECT snapshot.* INTO snapshot_record
  FROM public.geography_activation_snapshots snapshot
  WHERE snapshot.dataset_version = requested_dataset_version
  FOR UPDATE;
  IF snapshot_record.id IS NULL OR snapshot_record.rolled_back_at IS NOT NULL THEN
    RAISE EXCEPTION 'An active rollback snapshot is not available.' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.markets WHERE id = snapshot_record.market_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('service-area-activation:' || snapshot_record.market_id::text, 0));
  SELECT dataset.* INTO dataset_record
  FROM public.geography_dataset_versions dataset
  WHERE dataset.dataset_version = requested_dataset_version
    AND dataset.market_id = snapshot_record.market_id;
  IF dataset_record.id IS NULL OR EXISTS (
    SELECT 1 FROM public.geography_activation_snapshots newer
    WHERE newer.market_id = snapshot_record.market_id
      AND newer.activated_at > snapshot_record.activated_at
      AND newer.rolled_back_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Rollback is blocked by missing or newer live geography state.' USING ERRCODE = '23514';
  END IF;
  PERFORM geography_admin.assert_la_county_activation_current(dataset_record.id);
  IF EXISTS (
    SELECT 1
    FROM public."BuyerProfile" buyer
    JOIN public.buyer_desired_service_areas desired
      ON desired.buyer_profile_id = buyer.id
     AND desired.source = 'SELECTED'
     AND desired.is_primary = true
    JOIN public.service_areas area ON area.id = desired.service_area_id
    JOIN jsonb_to_recordset(snapshot_record.snapshot->'areas') AS previous(id uuid, active boolean)
      ON previous.id = area.id
    WHERE buyer."visibilityStatus" = 'ACTIVE'
      AND area.active = true
      AND previous.active = false
  ) THEN
    RAISE EXCEPTION 'Rollback would deactivate an ACTIVE buyer primary service area.' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.service_area_relationships relationship
  USING public.service_areas parent, public.service_areas child
  WHERE parent.id = relationship.parent_service_area_id
    AND child.id = relationship.child_service_area_id
    AND parent.market_id = snapshot_record.market_id
    AND child.market_id = snapshot_record.market_id
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(dataset_record.relationships->'relationships') expected(value)
      WHERE expected.value->>'parentStableExternalId' = parent.stable_external_id
        AND expected.value->>'childStableExternalId' = child.stable_external_id
        AND (expected.value->>'relationType')::public."ServiceAreaRelationType" = relationship.relation_type
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(
        snapshot_record.snapshot->'preexisting_relationships', '[]'::jsonb
      )) previous(value)
      WHERE previous.value->>'parent_service_area_id' = parent.id::text
        AND previous.value->>'child_service_area_id' = child.id::text
        AND previous.value->>'relation_type' = relationship.relation_type::text
    );
  DELETE FROM public.service_area_search_terms search_term
  USING public.service_areas area
  WHERE area.id = search_term.service_area_id
    AND area.market_id = snapshot_record.market_id
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(dataset_record.manifest->'areas') manifest_area
      CROSS JOIN LATERAL jsonb_array_elements_text(manifest_area->'searchTerms') term(value)
      WHERE manifest_area->>'slug' = area.slug
        AND term.value = search_term.term_normalized
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(
        snapshot_record.snapshot->'preexisting_search_terms', '[]'::jsonb
      )) previous(value)
      WHERE previous.value->>'service_area_id' = area.id::text
        AND previous.value->>'term_normalized' = search_term.term_normalized
    );

  UPDATE public.service_areas area SET
    label = previous.label,
    type = previous.type,
    postal_code = previous.postal_code,
    city = previous.city,
    county = previous.county,
    state = previous.state,
    center_lat = previous.center_lat,
    center_lng = previous.center_lng,
    bbox_west = previous.bbox_west,
    bbox_south = previous.bbox_south,
    bbox_east = previous.bbox_east,
    bbox_north = previous.bbox_north,
    geojson_path = previous.geojson_path,
    geojson_sha256 = previous.geojson_sha256,
    source = previous.source,
    source_version = previous.source_version,
    source_license = previous.source_license,
    source_url = previous.source_url,
    source_retrieval_url = previous.source_retrieval_url,
    source_retrieved_at = previous.source_retrieved_at,
    search_terms = previous.search_terms,
    active = previous.active,
    is_pilot = previous.is_pilot,
    current_geometry_id = previous.current_geometry_id,
    updated_at = now()
  FROM jsonb_to_recordset(snapshot_record.snapshot->'areas') AS previous(
    id uuid,
    label text,
    type text,
    postal_code text,
    city text,
    county text,
    state text,
    center_lat double precision,
    center_lng double precision,
    bbox_west double precision,
    bbox_south double precision,
    bbox_east double precision,
    bbox_north double precision,
    geojson_path text,
    geojson_sha256 text,
    source text,
    source_version text,
    source_license text,
    source_url text,
    source_retrieval_url text,
    source_retrieved_at date,
    search_terms text[],
    active boolean,
    is_pilot boolean,
    current_geometry_id uuid
  )
  WHERE area.id = previous.id;

  market_state := snapshot_record.snapshot->'market';
  UPDATE public.markets SET
    label = market_state->>'label',
    current_boundary_id = nullif(market_state->>'current_boundary_id', '')::uuid,
    current_display_geometry_id = nullif(market_state->>'current_display_geometry_id', '')::uuid,
    center_lat = (market_state->>'center_lat')::double precision,
    center_lng = (market_state->>'center_lng')::double precision,
    bbox_west = (market_state->>'bbox_west')::double precision,
    bbox_south = (market_state->>'bbox_south')::double precision,
    bbox_east = (market_state->>'bbox_east')::double precision,
    bbox_north = (market_state->>'bbox_north')::double precision,
    updated_at = now()
  WHERE id = snapshot_record.market_id;

  SET CONSTRAINTS ALL IMMEDIATE;
  IF EXISTS (
    SELECT 1 FROM public."BuyerProfile" buyer
    WHERE buyer."visibilityStatus" = 'ACTIVE'
      AND 1 <> (
        SELECT count(*)
        FROM public.buyer_desired_service_areas desired
        JOIN public.service_areas area ON area.id = desired.service_area_id
        JOIN public.markets market ON market.id = area.market_id
        WHERE desired.buyer_profile_id = buyer.id
          AND desired.source = 'SELECTED'
          AND desired.is_primary = true
          AND area.active = true
          AND market.active = true
      )
  ) THEN
    RAISE EXCEPTION 'LA County rollback left an invalid ACTIVE buyer profile.' USING ERRCODE = '23514';
  END IF;
  UPDATE public.geography_activation_snapshots SET rolled_back_at = now()
  WHERE id = snapshot_record.id;

  IF (SELECT count(*) FROM public.service_areas area WHERE area.market_id = snapshot_record.market_id AND area.active)
      <> (SELECT count(*) FROM jsonb_to_recordset(snapshot_record.snapshot->'areas') AS previous(id uuid, active boolean) WHERE previous.active)
    OR (SELECT current_boundary_id FROM public.markets WHERE id = snapshot_record.market_id)
      IS DISTINCT FROM nullif(market_state->>'current_boundary_id', '')::uuid
    OR (SELECT current_display_geometry_id FROM public.markets WHERE id = snapshot_record.market_id)
      IS DISTINCT FROM nullif(market_state->>'current_display_geometry_id', '')::uuid
    OR EXISTS (
      SELECT 1 FROM public.service_area_search_terms
      WHERE source = requested_dataset_version
    )
    OR EXISTS (
      SELECT 1 FROM public.service_area_relationships
      WHERE source = requested_dataset_version
    ) THEN
    RAISE EXCEPTION 'LA County rollback postconditions failed.' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'datasetVersion', requested_dataset_version,
    'rolledBack', true,
    'stableSourceIdsRetained', true
  );
END;
$$;
REVOKE ALL ON FUNCTION geography_admin.rollback_service_area_dataset(text)
FROM PUBLIC, anon, authenticated, service_role;

-- Existing reviewed terms are copied once during CTO integration. Dataset
-- staging never changes this live table; a later reviewed activation must
-- replace the activated dataset's terms and relationships atomically.
INSERT INTO public.service_area_search_terms (
  market_id, service_area_id, term_normalized, term_kind, source, reviewed_at
)
SELECT area.market_id, area.id,
       lower(btrim(regexp_replace(term, '[^a-zA-Z0-9]+', ' ', 'g'))) COLLATE "C",
       'CUTOVER_REVIEWED_ALIAS', 'canonical-cutover-backfill', now()
FROM public.service_areas area
CROSS JOIN LATERAL unnest(area.search_terms) term
WHERE btrim(term) <> ''
ON CONFLICT (market_id, term_normalized, service_area_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.service_areas area
    JOIN public.markets market ON market.id = area.market_id
    WHERE area.active = true
      AND (area.bbox_west < market.bbox_west OR area.bbox_south < market.bbox_south
        OR area.bbox_east > market.bbox_east OR area.bbox_north > market.bbox_north)
  ) THEN
    RAISE EXCEPTION 'An active service area is outside its market bounds.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.service_area_search_terms term
    JOIN public.service_areas area ON area.id = term.service_area_id
    WHERE area.market_id <> term.market_id
  ) THEN
    RAISE EXCEPTION 'A service-area search term crosses market ownership.' USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMIT;
-- END SOURCE 20260712090000_expand_la_county_geography

-- BEGIN SOURCE 20260712100500_cover_service_area_search_term_market_fk (db7b511ce4328660e63105024752058fd4a6272d01522ae0251c1035b39fea21)
-- Cover the composite same-market foreign key reported by the production advisor.
DROP INDEX IF EXISTS public.service_area_search_terms_area_idx;
CREATE INDEX service_area_search_terms_area_idx
ON public.service_area_search_terms(service_area_id, market_id);
-- END SOURCE 20260712100500_cover_service_area_search_term_market_fk

-- BEGIN SOURCE 20260713051527_harden_la_geography_security (de3470a9c07367a732f77584ee26ba5619e1b4896904708d712a54d51a31d0e3)
-- Close raw geography access, keep future public-schema access opt-in, and
-- make canonical service-area prefix lookup use its covering index.

BEGIN;

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_area_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_desired_service_areas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.markets,
  public.service_areas,
  public.service_area_relationships,
  public.buyer_desired_service_areas
FROM PUBLIC, anon, authenticated, service_role;

-- Server-side Supabase administration retains only its existing CRUD contract.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.markets,
  public.service_areas,
  public.service_area_relationships,
  public.buyer_desired_service_areas
TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

-- PostGIS owns these objects. Self-hosted/owner-capable targets can harden them
-- here; hosted Supabase targets require the supported platform remediation.
DO $$
DECLARE
  object_owner oid;
  owner_name name;
  owner_capable boolean;
  spatial_ref_sys regclass := to_regclass('public.spatial_ref_sys');
BEGIN
  IF spatial_ref_sys IS NULL THEN
    RETURN;
  END IF;

  SELECT relation.relowner, pg_get_userbyid(relation.relowner)
  INTO object_owner, owner_name
  FROM pg_class relation
  WHERE relation.oid = spatial_ref_sys;

  SELECT role.rolsuper
      OR object_owner = role.oid
  INTO owner_capable
  FROM pg_roles role
  WHERE role.rolname = current_user;

  IF owner_capable THEN
    ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.spatial_ref_sys FROM PUBLIC, anon, authenticated, service_role;
  ELSIF NOT (
    SELECT relation.relrowsecurity
      AND NOT EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) privilege
        LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
        WHERE privilege.grantee = 0
           OR grantee.rolname IN ('anon', 'authenticated', 'service_role')
      )
    FROM pg_class relation
    WHERE relation.oid = spatial_ref_sys
  ) THEN
    RAISE WARNING 'POSTGIS_SUPPORTED_PLATFORM_GATE: public.spatial_ref_sys is owned by %, not migration role %; use Supabase-supported remediation to enable RLS and revoke browser access.', owner_name, current_user;
  END IF;
END;
$$;

DO $$
DECLARE
  function_name text;
  function_oid regprocedure;
  object_owner oid;
  owner_name name;
  owner_capable boolean;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'public.st_estimatedextent(text,text)',
    'public.st_estimatedextent(text,text,text)',
    'public.st_estimatedextent(text,text,text,boolean)'
  ]
  LOOP
    function_oid := to_regprocedure(function_name);
    IF function_oid IS NULL THEN
      CONTINUE;
    END IF;

    SELECT procedure.proowner, pg_get_userbyid(procedure.proowner)
    INTO object_owner, owner_name
    FROM pg_proc procedure
    WHERE procedure.oid = function_oid;

    SELECT role.rolsuper
        OR object_owner = role.oid
    INTO owner_capable
    FROM pg_roles role
    WHERE role.rolname = current_user;

    IF owner_capable THEN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
        function_oid
      );
    ELSIF has_function_privilege('anon', function_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', function_oid, 'EXECUTE')
       OR has_function_privilege('service_role', function_oid, 'EXECUTE') THEN
      RAISE WARNING 'POSTGIS_SUPPORTED_PLATFORM_GATE: % is owned by %, not migration role %; use Supabase-supported remediation to revoke EXECUTE.', function_oid, owner_name, current_user;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION geography_admin.search_active_service_areas(
  requested_market_slug text,
  requested_term text,
  requested_limit integer DEFAULT 8
)
RETURNS TABLE(service_area_id uuid, exact_match boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH input AS (
    SELECT lower(btrim(regexp_replace(coalesce(requested_term, ''), '[^a-zA-Z0-9]+', ' ', 'g'))) COLLATE "C" AS term,
           least(greatest(coalesce(requested_limit, 8), 1), 8) AS row_limit
  ), selected_market AS (
    SELECT market.id
    FROM public.markets market
    WHERE market.slug = requested_market_slug AND market.active = true
  ), matches AS (
    SELECT search_term.service_area_id,
           min(CASE
             WHEN replace(area.slug, '-', ' ') = input.term THEN 1
             WHEN area.postal_code = input.term THEN 2
             WHEN lower(btrim(regexp_replace(area.label, '[^a-zA-Z0-9]+', ' ', 'g'))) COLLATE "C" = input.term THEN 3
             WHEN search_term.term_normalized = input.term THEN 4
             ELSE 99
           END) AS exact_rank,
           min(search_term.term_normalized) AS matched_term
    FROM input
    JOIN selected_market ON true
    JOIN public.service_area_search_terms search_term
      ON search_term.market_id = selected_market.id
     AND search_term.term_normalized >= input.term
     AND search_term.term_normalized < input.term || U&'\FFFF'
     AND search_term.term_normalized LIKE input.term || '%'
    JOIN public.service_areas area
      ON area.id = search_term.service_area_id
     AND area.market_id = selected_market.id
     AND area.active = true
    WHERE input.term <> ''
    GROUP BY search_term.service_area_id
  ), ranked AS (
    SELECT matches.*,
           min(matches.exact_rank) FILTER (WHERE matches.exact_rank < 99) OVER () AS best_exact_rank
    FROM matches
  )
  SELECT ranked.service_area_id,
         ranked.exact_rank < 99 AND ranked.exact_rank = ranked.best_exact_rank AS exact_match
  FROM ranked, input
  ORDER BY exact_match DESC, ranked.exact_rank, ranked.matched_term, ranked.service_area_id
  LIMIT (SELECT row_limit FROM input);
$$;
REVOKE ALL ON FUNCTION geography_admin.search_active_service_areas(text, text, integer)
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
-- END SOURCE 20260713051527_harden_la_geography_security

-- BEGIN SOURCE 20260713054016_close_public_function_defaults (3c1dd261786331e15b68ae5f6e2f16cb997f3a9d239d13cbf89d536a825b8aa8)
-- Function EXECUTE defaults are global in PostgreSQL. A schema-scoped revoke
-- cannot override the built-in PUBLIC default for newly created functions.

BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
-- END SOURCE 20260713054016_close_public_function_defaults

-- BEGIN SOURCE 20260713054720_consolidate_service_area_prefix_index (f5848ea36f026e71ac3b33dfed53e847daffc7c561d05e5e467f2e91cdf182d4)
-- The unique search-term key already covers every column used by prefix lookup.
-- Keep one smaller index and give it the plan-regression contract name.

BEGIN;

DROP INDEX public.service_area_search_terms_market_term_prefix_idx;

ALTER TABLE public.service_area_search_terms
  RENAME CONSTRAINT service_area_search_terms_market_id_term_normalized_service_key
  TO service_area_search_terms_market_term_prefix_idx;

COMMIT;
-- END SOURCE 20260713054720_consolidate_service_area_prefix_index

-- BEGIN SOURCE 20260713230000_fix_rate_limit_timestamp_variable (189e687bb1c58a3231c9e05597c63c0c2d4d7841e777d486ff6fca92d0c03fc8)
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
-- END SOURCE 20260713230000_fix_rate_limit_timestamp_variable

-- BEGIN SOURCE 20260714150654_add_guided_messaging_v1 (ca36a735915e36b38d3259785139fa185ba74868eee75f831c38d46204e3ba9d)
-- Guided Messaging V1 is invite-scoped. PostgreSQL remains authoritative;
-- Realtime emits identifier-only private delivery hints after message commits.

BEGIN;

UPDATE public."Invite"
SET "expiresAt" = "sentAt" + interval '30 days'
WHERE "expiresAt" IS NULL;

UPDATE public."Invite"
SET status = 'EXPIRED', "updatedAt" = now()
WHERE status IN ('SENT', 'VIEWED')
  AND "expiresAt" <= now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."Invite"
    WHERE regexp_replace(
      regexp_replace(
        replace(replace(message, E'\r\n', E'\n'), E'\r', E'\n'),
        '^[[:space:]]+', ''
      ),
      '[[:space:]]+$', ''
    ) = ''
      OR char_length(regexp_replace(
        regexp_replace(
          replace(replace(message, E'\r\n', E'\n'), E'\r', E'\n'),
          '^[[:space:]]+', ''
        ),
        '[[:space:]]+$', ''
      )) > 2000
  ) THEN
    RAISE EXCEPTION 'Guided messaging migration blocked: every legacy invite message must contain 1-2000 trimmed characters.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."Invite" invite
    JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
    WHERE invite."sellerId" = buyer."userId"
  ) THEN
    RAISE EXCEPTION 'Guided messaging migration blocked: a legacy self-invite cannot produce two distinct participants.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."Invite"
    WHERE status IN ('SENT', 'VIEWED', 'ACCEPTED')
    GROUP BY "sellerId", "buyerProfileId", "propertyId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Guided messaging migration blocked: duplicate active or accepted invites require explicit review.'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

UPDATE public."Invite"
SET message = regexp_replace(
  regexp_replace(
    replace(replace(message, E'\r\n', E'\n'), E'\r', E'\n'),
    '^[[:space:]]+', ''
  ),
  '[[:space:]]+$', ''
)
WHERE message IS DISTINCT FROM regexp_replace(
  regexp_replace(
    replace(replace(message, E'\r\n', E'\n'), E'\r', E'\n'),
    '^[[:space:]]+', ''
  ),
  '[[:space:]]+$', ''
);

ALTER TABLE public."Invite"
  ADD COLUMN "openingTemplateKey" text,
  ADD COLUMN "openingTemplateVersion" integer,
  ADD COLUMN "openingNote" text,
  ALTER COLUMN "expiresAt" SET NOT NULL,
  ADD CONSTRAINT "Invite_message_length_check" CHECK (
    char_length(message) BETWEEN 1 AND 2000
    AND position(E'\r' IN message) = 0
    AND message = regexp_replace(
      regexp_replace(message, '^[[:space:]]+', ''),
      '[[:space:]]+$', ''
    )
  ),
  ADD CONSTRAINT "Invite_opening_template_check" CHECK (
    (
      "openingTemplateKey" IS NULL
      AND "openingTemplateVersion" IS NULL
      AND "openingNote" IS NULL
    ) OR (
      "openingTemplateKey" IS NOT NULL
      AND "openingTemplateKey" IN (
        'SELLER_PRIVATE_VIEWING',
        'SELLER_MORE_DETAILS',
        'SELLER_TIMING_AND_PLANS',
        'SELLER_NEXT_STEPS'
      )
      AND "openingTemplateVersion" = 1
      AND (
        "openingNote" IS NULL
        OR (
          char_length("openingNote") BETWEEN 1 AND 500
          AND position(E'\r' IN "openingNote") = 0
          AND "openingNote" = regexp_replace(
            regexp_replace("openingNote", '^[[:space:]]+', ''),
            '[[:space:]]+$', ''
          )
        )
      )
    )
  );

DROP INDEX IF EXISTS public."Invite_active_seller_buyer_property_key";
CREATE UNIQUE INDEX "Invite_active_seller_buyer_property_key"
  ON public."Invite"("sellerId", "buyerProfileId", "propertyId")
  WHERE status IN ('SENT', 'VIEWED', 'ACCEPTED');

CREATE TYPE public."ConversationStatus" AS ENUM (
  'AWAITING_BUYER', 'ACTIVE', 'READ_ONLY', 'BLOCKED'
);

CREATE TYPE public."ConversationClosedReason" AS ENUM (
  'INVITE_DECLINED',
  'INVITE_EXPIRED',
  'INVITE_WITHDRAWN',
  'PROPERTY_IDENTITY_CHANGED',
  'PROPERTY_INELIGIBLE',
  'SELLER_INELIGIBLE',
  'BUYER_INELIGIBLE',
  'USER_SUSPENDED',
  'USER_BLOCKED'
);

CREATE TYPE public."ConversationParticipantRole" AS ENUM ('SELLER', 'BUYER');
CREATE TYPE public."MessageKind" AS ENUM ('INVITE', 'GUIDED', 'FREE_TEXT', 'SYSTEM');
CREATE TYPE public."MessageModerationStatus" AS ENUM ('ALLOWED', 'FLAGGED', 'REDACTED');
CREATE TYPE public."MessageReportCategory" AS ENUM (
  'HARASSMENT_OR_THREAT',
  'DISCRIMINATORY_CONTENT',
  'FRAUD_OR_SCAM',
  'SPAM',
  'SENSITIVE_INFORMATION_REQUEST',
  'OFF_PLATFORM_PAYMENT_REQUEST',
  'OTHER'
);
CREATE TYPE public."MessageReportStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'ACTIONED', 'DISMISSED');

CREATE TABLE public."Conversation" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "inviteId" text NOT NULL,
  status public."ConversationStatus" NOT NULL DEFAULT 'AWAITING_BUYER',
  "closedReason" public."ConversationClosedReason",
  "propertySnapshot" jsonb NOT NULL,
  "lastMessageAt" timestamp(3) NOT NULL,
  "moderationUpdatedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "Conversation_pkey" PRIMARY KEY (id),
  CONSTRAINT "Conversation_inviteId_fkey"
    FOREIGN KEY ("inviteId") REFERENCES public."Invite"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "Conversation_status_reason_check" CHECK (
    (status IN ('AWAITING_BUYER', 'ACTIVE') AND "closedReason" IS NULL)
    OR (
      status = 'READ_ONLY'
      AND "closedReason" IS NOT NULL
      AND "closedReason" <> 'USER_BLOCKED'
    )
    OR (status = 'BLOCKED' AND "closedReason" = 'USER_BLOCKED')
  )
);

CREATE UNIQUE INDEX "Conversation_inviteId_key" ON public."Conversation"("inviteId");
CREATE INDEX "Conversation_status_lastMessageAt_idx"
  ON public."Conversation"(status, "lastMessageAt");
CREATE INDEX "Conversation_lastMessageAt_id_idx"
  ON public."Conversation"("lastMessageAt", id);

CREATE TABLE public."ConversationParticipant" (
  "conversationId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  role public."ConversationParticipantRole" NOT NULL,
  "lastReadMessageId" uuid,
  "lastReadAt" timestamp(3),
  "mutedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("conversationId", "userId"),
  CONSTRAINT "ConversationParticipant_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ConversationParticipant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ConversationParticipant_read_marker_pair_check" CHECK (
    ("lastReadMessageId" IS NULL AND "lastReadAt" IS NULL)
    OR ("lastReadMessageId" IS NOT NULL AND "lastReadAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "ConversationParticipant_conversationId_role_key"
  ON public."ConversationParticipant"("conversationId", role);
CREATE INDEX "ConversationParticipant_userId_conversationId_idx"
  ON public."ConversationParticipant"("userId", "conversationId");
CREATE INDEX "ConversationParticipant_conversationId_lastReadMessageId_idx"
  ON public."ConversationParticipant"("conversationId", "lastReadMessageId");

CREATE TABLE public."Message" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "conversationId" uuid NOT NULL,
  "senderUserId" uuid,
  kind public."MessageKind" NOT NULL,
  "templateKey" text,
  "templateVersion" integer,
  body text NOT NULL,
  "clientMessageId" uuid NOT NULL,
  "moderationStatus" public."MessageModerationStatus" NOT NULL DEFAULT 'ALLOWED',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "Message_pkey" PRIMARY KEY (id),
  CONSTRAINT "Message_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "Message_sender_participant_fkey"
    FOREIGN KEY ("conversationId", "senderUserId")
    REFERENCES public."ConversationParticipant"("conversationId", "userId")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "Message_body_length_check" CHECK (
    char_length(body) BETWEEN 1 AND 2000
    AND position(E'\r' IN body) = 0
    AND body = regexp_replace(
      regexp_replace(body, '^[[:space:]]+', ''),
      '[[:space:]]+$', ''
    )
  ),
  CONSTRAINT "Message_template_version_check" CHECK (
    "templateVersion" IS NULL OR "templateVersion" >= 1
  ),
  CONSTRAINT "Message_kind_shape_check" CHECK (
    (
      kind = 'SYSTEM'
      AND "senderUserId" IS NULL
      AND "templateKey" IS NULL
      AND "templateVersion" IS NULL
    ) OR (
      kind = 'GUIDED'
      AND "senderUserId" IS NOT NULL
      AND "templateKey" IS NOT NULL
      AND btrim("templateKey") <> ''
      AND "templateVersion" IS NOT NULL
    ) OR (
      kind = 'FREE_TEXT'
      AND "senderUserId" IS NOT NULL
      AND "templateKey" IS NULL
      AND "templateVersion" IS NULL
    ) OR (
      kind = 'INVITE'
      AND "senderUserId" IS NOT NULL
      AND (
        ("templateKey" IS NULL AND "templateVersion" IS NULL)
        OR (
          "templateKey" IN (
            'SELLER_PRIVATE_VIEWING',
            'SELLER_MORE_DETAILS',
            'SELLER_TIMING_AND_PLANS',
            'SELLER_NEXT_STEPS'
          )
          AND "templateVersion" = 1
        )
      )
    )
  )
);

CREATE UNIQUE INDEX "Message_conversationId_clientMessageId_key"
  ON public."Message"("conversationId", "clientMessageId");
CREATE UNIQUE INDEX "Message_conversationId_id_key"
  ON public."Message"("conversationId", id);
CREATE UNIQUE INDEX "Message_one_invite_per_conversation_key"
  ON public."Message"("conversationId")
  WHERE kind = 'INVITE';
CREATE INDEX "Message_conversationId_senderUserId_idx"
  ON public."Message"("conversationId", "senderUserId");
CREATE INDEX "Message_conversationId_createdAt_id_idx"
  ON public."Message"("conversationId", "createdAt" DESC, id DESC);
CREATE INDEX "Message_senderUserId_createdAt_idx"
  ON public."Message"("senderUserId", "createdAt");

ALTER TABLE public."ConversationParticipant"
  ADD CONSTRAINT "ConversationParticipant_lastReadMessage_fkey"
  FOREIGN KEY ("conversationId", "lastReadMessageId")
  REFERENCES public."Message"("conversationId", id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE public."UserBlock" (
  "blockerUserId" uuid NOT NULL,
  "blockedUserId" uuid NOT NULL,
  reason text,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerUserId", "blockedUserId"),
  CONSTRAINT "UserBlock_blockerUserId_fkey"
    FOREIGN KEY ("blockerUserId") REFERENCES public."User"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "UserBlock_blockedUserId_fkey"
    FOREIGN KEY ("blockedUserId") REFERENCES public."User"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "UserBlock_distinct_users_check" CHECK ("blockerUserId" <> "blockedUserId"),
  CONSTRAINT "UserBlock_reason_length_check" CHECK (
    reason IS NULL OR (
      char_length(reason) BETWEEN 1 AND 500
      AND position(E'\r' IN reason) = 0
      AND reason = regexp_replace(
        regexp_replace(reason, '^[[:space:]]+', ''),
        '[[:space:]]+$', ''
      )
    )
  )
);

CREATE INDEX "UserBlock_blockedUserId_blockerUserId_idx"
  ON public."UserBlock"("blockedUserId", "blockerUserId");

CREATE TABLE public."MessageReport" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "reporterUserId" uuid NOT NULL,
  "reportedUserId" uuid NOT NULL,
  "conversationId" uuid NOT NULL,
  "messageId" uuid NOT NULL,
  category public."MessageReportCategory" NOT NULL,
  details text,
  "evidenceBodySnapshot" text NOT NULL,
  "evidenceContext" jsonb NOT NULL,
  status public."MessageReportStatus" NOT NULL DEFAULT 'OPEN',
  "reviewedByUserId" uuid,
  "reviewedAt" timestamp(3),
  resolution text,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "MessageReport_pkey" PRIMARY KEY (id),
  CONSTRAINT "MessageReport_reporterUserId_fkey"
    FOREIGN KEY ("reporterUserId") REFERENCES public."User"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "MessageReport_reportedUserId_fkey"
    FOREIGN KEY ("reportedUserId") REFERENCES public."User"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "MessageReport_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "MessageReport_message_fkey"
    FOREIGN KEY ("conversationId", "messageId")
    REFERENCES public."Message"("conversationId", id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "MessageReport_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES public."User"(id)
    ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "MessageReport_details_length_check" CHECK (
    details IS NULL OR (
      char_length(details) BETWEEN 1 AND 2000
      AND position(E'\r' IN details) = 0
      AND details = regexp_replace(
        regexp_replace(details, '^[[:space:]]+', ''),
        '[[:space:]]+$', ''
      )
    )
  ),
  CONSTRAINT "MessageReport_evidence_body_check" CHECK (
    char_length("evidenceBodySnapshot") BETWEEN 1 AND 2000
    AND position(E'\r' IN "evidenceBodySnapshot") = 0
    AND "evidenceBodySnapshot" = regexp_replace(
      regexp_replace("evidenceBodySnapshot", '^[[:space:]]+', ''),
      '[[:space:]]+$', ''
    )
  ),
  CONSTRAINT "MessageReport_resolution_length_check" CHECK (
    resolution IS NULL OR (
      char_length(resolution) BETWEEN 1 AND 2000
      AND position(E'\r' IN resolution) = 0
      AND resolution = regexp_replace(
        regexp_replace(resolution, '^[[:space:]]+', ''),
        '[[:space:]]+$', ''
      )
    )
  ),
  CONSTRAINT "MessageReport_distinct_users_check" CHECK (
    "reporterUserId" <> "reportedUserId"
  ),
  CONSTRAINT "MessageReport_evidence_context_check" CHECK (
    jsonb_typeof("evidenceContext") IN ('object', 'array')
  ),
  CONSTRAINT "MessageReport_review_shape_check" CHECK (
    (
      status = 'OPEN'
      AND "reviewedByUserId" IS NULL
      AND "reviewedAt" IS NULL
      AND resolution IS NULL
    ) OR (
      status = 'IN_REVIEW'
      AND "reviewedByUserId" IS NOT NULL
      AND "reviewedAt" IS NOT NULL
      AND resolution IS NULL
    ) OR (
      status IN ('ACTIONED', 'DISMISSED')
      AND "reviewedByUserId" IS NOT NULL
      AND "reviewedAt" IS NOT NULL
      AND resolution IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX "MessageReport_reporterUserId_messageId_key"
  ON public."MessageReport"("reporterUserId", "messageId");
CREATE INDEX "MessageReport_conversationId_messageId_idx"
  ON public."MessageReport"("conversationId", "messageId");
CREATE INDEX "MessageReport_conversationId_createdAt_idx"
  ON public."MessageReport"("conversationId", "createdAt");
CREATE INDEX "MessageReport_messageId_idx" ON public."MessageReport"("messageId");
CREATE INDEX "MessageReport_reportedUserId_createdAt_idx"
  ON public."MessageReport"("reportedUserId", "createdAt");
CREATE INDEX "MessageReport_reviewedByUserId_idx"
  ON public."MessageReport"("reviewedByUserId");
CREATE INDEX "MessageReport_status_createdAt_idx"
  ON public."MessageReport"(status, "createdAt");

ALTER TABLE public."EmailOutbox"
  ADD COLUMN "messageConversationId" uuid,
  ADD COLUMN "messageRecipientUserId" uuid,
  ADD CONSTRAINT "EmailOutbox_messageConversationId_fkey"
    FOREIGN KEY ("messageConversationId") REFERENCES public."Conversation"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "EmailOutbox_messageRecipientUserId_fkey"
    FOREIGN KEY ("messageRecipientUserId") REFERENCES public."User"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "EmailOutbox_messageConversationId_idx"
  ON public."EmailOutbox"("messageConversationId");
CREATE INDEX "EmailOutbox_messageRecipientUserId_idx"
  ON public."EmailOutbox"("messageRecipientUserId");
CREATE INDEX "EmailOutbox_messageConversationId_messageRecipientUserId_status_nextAttemptAt_idx"
  ON public."EmailOutbox"(
    "messageConversationId", "messageRecipientUserId", status, "nextAttemptAt"
  );

INSERT INTO public."Conversation" (
  "inviteId", status, "closedReason", "propertySnapshot",
  "lastMessageAt", "createdAt", "updatedAt"
)
SELECT
  invite.id,
  CASE
    WHEN invite.status = 'ACCEPTED'
      AND seller.status = 'ACTIVE'
      AND buyer_user.status = 'ACTIVE'
      AND 'BUYER'::public."UserRole" = ANY(buyer_user.roles)
      AND buyer."visibilityStatus" = 'ACTIVE'
      AND (
        'ADMIN'::public."UserRole" = ANY(seller.roles)
        OR (
          'SELLER'::public."UserRole" = ANY(seller.roles)
          AND coalesce(seller_access.status = 'APPROVED', false)
        )
      )
      AND property."ownerUserId" = invite."sellerId"
      AND property.status = 'READY_FOR_INVITES'
      AND property."ownershipVerificationStatus" = 'APPROVED'
      AND property."flaggedForReviewAt" IS NULL
      AND property."authorityAttestedIdentityVersion" = property."identityVersion"
      AND invite."propertyIdentityVersion" = property."identityVersion"
      THEN 'ACTIVE'::public."ConversationStatus"
    WHEN invite.status IN ('SENT', 'VIEWED')
      AND seller.status = 'ACTIVE'
      AND buyer_user.status = 'ACTIVE'
      AND 'BUYER'::public."UserRole" = ANY(buyer_user.roles)
      AND buyer."visibilityStatus" = 'ACTIVE'
      AND (
        'ADMIN'::public."UserRole" = ANY(seller.roles)
        OR (
          'SELLER'::public."UserRole" = ANY(seller.roles)
          AND coalesce(seller_access.status = 'APPROVED', false)
        )
      )
      AND property."ownerUserId" = invite."sellerId"
      AND property.status = 'READY_FOR_INVITES'
      AND property."ownershipVerificationStatus" = 'APPROVED'
      AND property."flaggedForReviewAt" IS NULL
      AND property."authorityAttestedIdentityVersion" = property."identityVersion"
      AND invite."propertyIdentityVersion" = property."identityVersion"
      THEN 'AWAITING_BUYER'::public."ConversationStatus"
    ELSE 'READ_ONLY'::public."ConversationStatus"
  END,
  CASE
    WHEN invite.status = 'DECLINED' THEN 'INVITE_DECLINED'::public."ConversationClosedReason"
    WHEN invite.status = 'EXPIRED' THEN 'INVITE_EXPIRED'::public."ConversationClosedReason"
    WHEN invite."propertyIdentityVersion" <> property."identityVersion"
      THEN 'PROPERTY_IDENTITY_CHANGED'::public."ConversationClosedReason"
    WHEN invite.status = 'WITHDRAWN' THEN 'INVITE_WITHDRAWN'::public."ConversationClosedReason"
    WHEN seller.status <> 'ACTIVE' OR buyer_user.status <> 'ACTIVE'
      THEN 'USER_SUSPENDED'::public."ConversationClosedReason"
    WHEN NOT (
      'ADMIN'::public."UserRole" = ANY(seller.roles)
      OR (
        'SELLER'::public."UserRole" = ANY(seller.roles)
        AND coalesce(seller_access.status = 'APPROVED', false)
      )
    ) THEN 'SELLER_INELIGIBLE'::public."ConversationClosedReason"
    WHEN NOT ('BUYER'::public."UserRole" = ANY(buyer_user.roles))
      OR buyer."visibilityStatus" <> 'ACTIVE'
      THEN 'BUYER_INELIGIBLE'::public."ConversationClosedReason"
    WHEN property."ownerUserId" <> invite."sellerId"
      OR property.status <> 'READY_FOR_INVITES'
      OR property."ownershipVerificationStatus" <> 'APPROVED'
      OR property."flaggedForReviewAt" IS NOT NULL
      OR property."authorityAttestedIdentityVersion" IS DISTINCT FROM property."identityVersion"
      THEN 'PROPERTY_INELIGIBLE'::public."ConversationClosedReason"
    ELSE NULL
  END,
  CASE
    WHEN property."ownerUserId" = invite."sellerId"
      AND invite."propertyIdentityVersion" = property."identityVersion" THEN
      jsonb_strip_nulls(jsonb_build_object(
        'title', invite.title,
        'propertyIdentityVersion', invite."propertyIdentityVersion",
        'propertyType', property."propertyType",
        'addressLine1', property."addressLine1",
        'addressLine2', property."addressLine2",
        'city', property.city,
        'state', property.state,
        'zip', property.zip,
        'location', concat_ws(', ',
          nullif(btrim(concat_ws(' ', property."addressLine1", property."addressLine2")), ''),
          nullif(btrim(property.city), ''),
          nullif(btrim(property.state), ''),
          nullif(btrim(property.zip), '')
        ),
        'bedrooms', property.bedrooms,
        'bathrooms', property.bathrooms,
        'squareFeet', property."squareFeet",
        'condition', property.condition,
        'features', property.features,
        'price', property.price,
        'ownershipVerificationStatus', property."ownershipVerificationStatus",
        'propertyStatus', property.status
      ))
    ELSE jsonb_build_object(
      'propertyIdentityVersion', invite."propertyIdentityVersion",
      'contextUnavailable', true
    )
  END,
  invite."sentAt",
  invite."sentAt",
  invite."sentAt"
FROM public."Invite" invite
JOIN public."SellerProperty" property ON property.id = invite."propertyId"
JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
JOIN public."User" buyer_user ON buyer_user.id = buyer."userId"
JOIN public."User" seller ON seller.id = invite."sellerId"
LEFT JOIN public."SellerAccess" seller_access ON seller_access."userId" = invite."sellerId";

INSERT INTO public."ConversationParticipant" (
  "conversationId", "userId", role, "createdAt"
)
SELECT conversation.id, invite."sellerId",
  'SELLER'::public."ConversationParticipantRole", conversation."createdAt"
FROM public."Conversation" conversation
JOIN public."Invite" invite ON invite.id = conversation."inviteId"
UNION ALL
SELECT conversation.id, buyer."userId",
  'BUYER'::public."ConversationParticipantRole", conversation."createdAt"
FROM public."Conversation" conversation
JOIN public."Invite" invite ON invite.id = conversation."inviteId"
JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId";

INSERT INTO public."Message" (
  "conversationId", "senderUserId", kind, "templateKey", "templateVersion",
  body, "clientMessageId", "moderationStatus", "createdAt"
)
SELECT
  conversation.id,
  invite."sellerId",
  'INVITE',
  invite."openingTemplateKey",
  invite."openingTemplateVersion",
  btrim(invite.message),
  gen_random_uuid(),
  'ALLOWED',
  invite."sentAt"
FROM public."Conversation" conversation
JOIN public."Invite" invite ON invite.id = conversation."inviteId";

UPDATE public."EmailOutbox"
SET payload = '{}'::jsonb, "updatedAt" = now()
WHERE type IN ('INVITE', 'MESSAGE_UNREAD') AND payload <> '{}'::jsonb;

ALTER TABLE public."EmailOutbox"
  ADD CONSTRAINT "EmailOutbox_messaging_payload_content_free_check" CHECK (
    type NOT IN ('INVITE', 'MESSAGE_UNREAD') OR payload = '{}'::jsonb
  ),
  ADD CONSTRAINT "EmailOutbox_unread_message_references_check" CHECK (
    type <> 'MESSAGE_UNREAD'
    OR (
      "messageConversationId" IS NOT NULL
      AND "messageRecipientUserId" IS NOT NULL
    )
  );

UPDATE public."ConversationParticipant" participant
SET "lastReadMessageId" = message.id,
    "lastReadAt" = message."createdAt"
FROM public."Message" message
WHERE message."conversationId" = participant."conversationId"
  AND message.kind = 'INVITE'
  AND participant.role = 'SELLER';

UPDATE public."ConversationParticipant" participant
SET "lastReadMessageId" = message.id,
    "lastReadAt" = greatest(
      message."createdAt",
      coalesce(invite."respondedAt", invite."viewedAt", message."createdAt")
    )
FROM public."Message" message
JOIN public."Conversation" conversation ON conversation.id = message."conversationId"
JOIN public."Invite" invite ON invite.id = conversation."inviteId"
WHERE participant."conversationId" = conversation.id
  AND participant.role = 'BUYER'
  AND message.kind = 'INVITE'
  AND (invite."viewedAt" IS NOT NULL OR invite."respondedAt" IS NOT NULL);

CREATE TRIGGER conversation_updated_at
BEFORE UPDATE ON public."Conversation"
FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER message_report_updated_at
BEFORE UPDATE ON public."MessageReport"
FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE OR REPLACE FUNCTION app_private.assert_conversation_participants(
  p_conversation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  participant_count integer;
  seller_count integer;
  buyer_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."Conversation" WHERE id = p_conversation_id
  ) THEN
    RETURN;
  END IF;

  SELECT
    count(participant."userId"),
    count(*) FILTER (
      WHERE participant.role = 'SELLER'
        AND participant."userId" = invite."sellerId"
    ),
    count(*) FILTER (
      WHERE participant.role = 'BUYER'
        AND participant."userId" = buyer."userId"
    )
  INTO participant_count, seller_count, buyer_count
  FROM public."Conversation" conversation
  JOIN public."Invite" invite ON invite.id = conversation."inviteId"
  JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
  LEFT JOIN public."ConversationParticipant" participant
    ON participant."conversationId" = conversation.id
  WHERE conversation.id = p_conversation_id
  GROUP BY conversation.id;

  IF participant_count <> 2 OR seller_count <> 1 OR buyer_count <> 1 THEN
    RAISE EXCEPTION 'Conversation % must have exactly the invite seller and buyer owner as participants.', p_conversation_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app_private.assert_conversation_participants(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.enforce_conversation_participants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conversation_id uuid;
  affected record;
BEGIN
  IF TG_TABLE_NAME = 'Conversation' THEN
    conversation_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    PERFORM app_private.assert_conversation_participants(conversation_id);
  ELSIF TG_TABLE_NAME = 'ConversationParticipant' THEN
    conversation_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD."conversationId"
      ELSE NEW."conversationId"
    END;
    PERFORM app_private.assert_conversation_participants(conversation_id);
    IF TG_OP = 'UPDATE' AND OLD."conversationId" IS DISTINCT FROM NEW."conversationId" THEN
      PERFORM app_private.assert_conversation_participants(OLD."conversationId");
    END IF;
  ELSIF TG_TABLE_NAME = 'Invite' THEN
    FOR affected IN
      SELECT id FROM public."Conversation"
      WHERE "inviteId" = CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
    LOOP
      PERFORM app_private.assert_conversation_participants(affected.id);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'BuyerProfile' THEN
    FOR affected IN
      SELECT conversation.id
      FROM public."Conversation" conversation
      JOIN public."Invite" invite ON invite.id = conversation."inviteId"
      WHERE invite."buyerProfileId" = CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
    LOOP
      PERFORM app_private.assert_conversation_participants(affected.id);
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_conversation_participants()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER conversation_participants_from_invite
AFTER INSERT OR UPDATE ON public."Conversation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_conversation_participants();

CREATE CONSTRAINT TRIGGER conversation_participant_cardinality
AFTER INSERT OR UPDATE OR DELETE ON public."ConversationParticipant"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_conversation_participants();

CREATE CONSTRAINT TRIGGER conversation_participants_follow_invite
AFTER UPDATE ON public."Invite"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_conversation_participants();

CREATE CONSTRAINT TRIGGER conversation_buyer_participant_follows_owner
AFTER UPDATE ON public."BuyerProfile"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_conversation_participants();

CREATE OR REPLACE FUNCTION app_private.validate_participant_read_marker()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."lastReadMessageId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public."Message" message
    WHERE message.id = NEW."lastReadMessageId"
      AND message."conversationId" = NEW."conversationId"
      AND message."createdAt" <= NEW."lastReadAt"
  ) THEN
    RAISE EXCEPTION 'Conversation read marker must reference a message in the same conversation at or before lastReadAt.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.validate_participant_read_marker()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER conversation_participant_read_marker
BEFORE INSERT OR UPDATE OF "lastReadMessageId", "lastReadAt"
ON public."ConversationParticipant"
FOR EACH ROW EXECUTE FUNCTION app_private.validate_participant_read_marker();

CREATE OR REPLACE FUNCTION app_private.enforce_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conversation_status public."ConversationStatus";
  participant_role public."ConversationParticipantRole";
  invite_id text;
  invite_status public."InviteStatus";
  invite_sent_at timestamp(3);
  invite_expires_at timestamp(3);
  seller_id uuid;
  buyer_user_id uuid;
  seller_status public."UserStatus";
  buyer_status public."UserStatus";
  buyer_has_role boolean;
  buyer_visibility public."BuyerVisibilityStatus";
  seller_approved boolean;
  property_valid boolean;
  recent_conversation_messages integer;
  recent_sender_messages integer;
BEGIN
  IF NEW.kind = 'SYSTEM' THEN
    RETURN NEW;
  END IF;

  IF NEW.kind = 'INVITE' THEN
    SELECT invite."sellerId"
    INTO seller_id
    FROM public."Conversation" conversation
    JOIN public."Invite" invite ON invite.id = conversation."inviteId"
    WHERE conversation.id = NEW."conversationId";

    IF NEW."senderUserId" IS DISTINCT FROM seller_id THEN
      RAISE EXCEPTION 'Invite message sender must be the invite seller.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."senderUserId" IS NULL THEN
    RAISE EXCEPTION 'Guided and free-text messages require a participant sender.'
      USING ERRCODE = '23514';
  END IF;

  SELECT invite.id, invite."sellerId", buyer."userId"
  INTO invite_id, seller_id, buyer_user_id
  FROM public."Conversation" conversation
  JOIN public."Invite" invite ON invite.id = conversation."inviteId"
  JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
  WHERE conversation.id = NEW."conversationId";

  IF seller_id IS NULL OR buyer_user_id IS NULL THEN
    RAISE EXCEPTION 'Conversation is unavailable.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'messaging-pair:'
      || least(seller_id, buyer_user_id)::text
      || ':'
      || greatest(seller_id, buyer_user_id)::text,
    0
  ));

  PERFORM invite.id
  FROM public."Invite" invite
  WHERE invite.id = invite_id
  FOR UPDATE;

  SELECT
    conversation.status,
    participant.role,
    invite.status,
    invite."sentAt",
    invite."expiresAt",
    invite."sellerId",
    buyer."userId",
    seller.status,
    buyer_user.status,
    'BUYER'::public."UserRole" = ANY(buyer_user.roles),
    buyer."visibilityStatus",
    (
      'ADMIN'::public."UserRole" = ANY(seller.roles)
      OR (
        'SELLER'::public."UserRole" = ANY(seller.roles)
        AND EXISTS (
          SELECT 1 FROM public."SellerAccess" access
          WHERE access."userId" = invite."sellerId"
            AND access.status = 'APPROVED'
        )
      )
    ),
    (
      property."ownerUserId" = invite."sellerId"
      AND property.status = 'READY_FOR_INVITES'
      AND property."ownershipVerificationStatus" = 'APPROVED'
      AND property."flaggedForReviewAt" IS NULL
      AND property."authorityAttestedIdentityVersion" = property."identityVersion"
      AND invite."propertyIdentityVersion" = property."identityVersion"
    )
  INTO
    conversation_status,
    participant_role,
    invite_status,
    invite_sent_at,
    invite_expires_at,
    seller_id,
    buyer_user_id,
    seller_status,
    buyer_status,
    buyer_has_role,
    buyer_visibility,
    seller_approved,
    property_valid
  FROM public."Conversation" conversation
  JOIN public."ConversationParticipant" participant
    ON participant."conversationId" = conversation.id
   AND participant."userId" = NEW."senderUserId"
  JOIN public."Invite" invite ON invite.id = conversation."inviteId"
  JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
  JOIN public."User" seller ON seller.id = invite."sellerId"
  JOIN public."User" buyer_user ON buyer_user.id = buyer."userId"
  JOIN public."SellerProperty" property ON property.id = invite."propertyId"
  WHERE conversation.id = NEW."conversationId"
  FOR UPDATE OF conversation;

  IF participant_role IS NULL THEN
    RAISE EXCEPTION 'Conversation is unavailable.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('messaging-sender:' || NEW."senderUserId"::text, 0)
  );

  IF NEW.kind = 'GUIDED' AND (
    NEW."templateVersion" <> 1
    OR (
      participant_role = 'SELLER'
      AND NEW."templateKey" NOT IN (
        'SELLER_PRIVATE_VIEWING',
        'SELLER_MORE_DETAILS',
        'SELLER_TIMING_AND_PLANS',
        'SELLER_NEXT_STEPS'
      )
    )
    OR (
      participant_role = 'BUYER'
      AND NEW."templateKey" NOT IN (
        'BUYER_SCHEDULE_VIEWING',
        'BUYER_MORE_DETAILS',
        'BUYER_PROPERTY_CONDITION',
        'BUYER_INTERESTED_QUESTIONS',
        'BUYER_NOT_A_FIT'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Guided message template is unavailable.' USING ERRCODE = '23514';
  END IF;

  IF conversation_status NOT IN ('AWAITING_BUYER', 'ACTIVE')
    OR seller_status IS DISTINCT FROM 'ACTIVE'
    OR buyer_status IS DISTINCT FROM 'ACTIVE'
    OR buyer_has_role IS NOT TRUE
    OR buyer_visibility IS DISTINCT FROM 'ACTIVE'
    OR seller_approved IS NOT TRUE
    OR property_valid IS NOT TRUE THEN
    RAISE EXCEPTION 'Conversation is unavailable.' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."UserBlock" block
    WHERE (
      block."blockerUserId" = seller_id
      AND block."blockedUserId" = buyer_user_id
    ) OR (
      block."blockerUserId" = buyer_user_id
      AND block."blockedUserId" = seller_id
    )
  ) THEN
    RAISE EXCEPTION 'Conversation is unavailable.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    invite_status = 'ACCEPTED'
    OR (
      invite_status IN ('SENT', 'VIEWED')
      AND invite_expires_at > clock_timestamp()
    )
  ) THEN
    RAISE EXCEPTION 'Conversation is unavailable.' USING ERRCODE = '42501';
  END IF;

  IF participant_role = 'SELLER' AND conversation_status = 'AWAITING_BUYER' THEN
    IF NEW.kind <> 'GUIDED'
      OR clock_timestamp() < invite_sent_at + interval '24 hours'
      OR EXISTS (
        SELECT 1 FROM public."Message" message
        WHERE message."conversationId" = NEW."conversationId"
          AND message."senderUserId" = NEW."senderUserId"
          AND message.kind IN ('GUIDED', 'FREE_TEXT')
      ) THEN
      RAISE EXCEPTION 'Seller follow-up is unavailable.' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT count(*) INTO recent_conversation_messages
  FROM public."Message"
  WHERE "conversationId" = NEW."conversationId"
    AND kind IN ('GUIDED', 'FREE_TEXT')
    AND "createdAt" >= clock_timestamp() - interval '1 hour';

  IF recent_conversation_messages >= 120 THEN
    RAISE EXCEPTION 'Conversation message limit reached.' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO recent_sender_messages
  FROM public."Message"
  WHERE "senderUserId" = NEW."senderUserId"
    AND kind IN ('GUIDED', 'FREE_TEXT')
    AND "createdAt" >= clock_timestamp() - interval '24 hours';

  IF recent_sender_messages >= 500 THEN
    RAISE EXCEPTION 'User message limit reached.' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_message_insert()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER message_insert_authorization
BEFORE INSERT ON public."Message"
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_message_insert();

CREATE OR REPLACE FUNCTION app_private.activate_conversation_from_buyer_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.kind NOT IN ('GUIDED', 'FREE_TEXT') OR NEW."senderUserId" IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public."Invite" invite
  SET status = 'ACCEPTED',
      "viewedAt" = coalesce(invite."viewedAt", now()),
      "respondedAt" = coalesce(invite."respondedAt", now()),
      "updatedAt" = now()
  FROM public."Conversation" conversation
  JOIN public."ConversationParticipant" participant
    ON participant."conversationId" = conversation.id
  WHERE conversation.id = NEW."conversationId"
    AND conversation.status = 'AWAITING_BUYER'
    AND participant."userId" = NEW."senderUserId"
    AND participant.role = 'BUYER'
    AND invite.id = conversation."inviteId"
    AND invite.status IN ('SENT', 'VIEWED');

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.activate_conversation_from_buyer_reply()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER message_buyer_reply_activation
AFTER INSERT ON public."Message"
FOR EACH ROW EXECUTE FUNCTION app_private.activate_conversation_from_buyer_reply();

CREATE OR REPLACE FUNCTION app_private.preserve_message_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Messages cannot be hard-deleted.' USING ERRCODE = '55000';
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD."conversationId" IS DISTINCT FROM NEW."conversationId"
    OR OLD."senderUserId" IS DISTINCT FROM NEW."senderUserId"
    OR OLD.kind IS DISTINCT FROM NEW.kind
    OR OLD."templateKey" IS DISTINCT FROM NEW."templateKey"
    OR OLD."templateVersion" IS DISTINCT FROM NEW."templateVersion"
    OR OLD.body IS DISTINCT FROM NEW.body
    OR OLD."clientMessageId" IS DISTINCT FROM NEW."clientMessageId"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Message evidence is immutable.' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.preserve_message_evidence()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER message_evidence_immutable
BEFORE UPDATE OR DELETE ON public."Message"
FOR EACH ROW EXECUTE FUNCTION app_private.preserve_message_evidence();

CREATE OR REPLACE FUNCTION app_private.capture_message_report_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  message_row public."Message"%ROWTYPE;
  surrounding_messages jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO message_row
    FROM public."Message"
    WHERE id = NEW."messageId"
      AND "conversationId" = NEW."conversationId";

    IF message_row.id IS NULL
      OR message_row."senderUserId" IS NULL
      OR message_row."senderUserId" = NEW."reporterUserId"
      OR NOT EXISTS (
        SELECT 1 FROM public."ConversationParticipant" participant
        JOIN public."User" reporter ON reporter.id = participant."userId"
        WHERE participant."conversationId" = NEW."conversationId"
          AND participant."userId" = NEW."reporterUserId"
          AND reporter.status = 'ACTIVE'
      ) THEN
      RAISE EXCEPTION 'Message report is unavailable.' USING ERRCODE = '42501';
    END IF;

    NEW."reportedUserId" := message_row."senderUserId";
    NEW."evidenceBodySnapshot" := message_row.body;

    SELECT coalesce(
      jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'messageId', candidate.id,
          'sender', CASE
            WHEN candidate."senderUserId" IS NULL THEN 'SYSTEM'
            WHEN candidate."senderUserId" = NEW."reporterUserId" THEN 'REPORTER'
            WHEN candidate."senderUserId" = message_row."senderUserId" THEN 'REPORTED_USER'
            ELSE 'PARTICIPANT'
          END,
          'kind', candidate.kind,
          'body', candidate.body,
          'createdAt', candidate."createdAt",
          'templateKey', candidate."templateKey",
          'templateVersion', candidate."templateVersion",
          'moderationStatus', candidate."moderationStatus"
        ))
        ORDER BY candidate."createdAt", candidate.id
      ),
      '[]'::jsonb
    )
    INTO surrounding_messages
    FROM (
      SELECT context_message.*
      FROM public."Message" context_message
      WHERE context_message."conversationId" = NEW."conversationId"
        AND context_message."createdAt" BETWEEN
          message_row."createdAt" - interval '15 minutes'
          AND message_row."createdAt" + interval '15 minutes'
      ORDER BY
        CASE WHEN context_message.id = message_row.id THEN 0 ELSE 1 END,
        abs(extract(epoch FROM (context_message."createdAt" - message_row."createdAt"))),
        context_message."createdAt",
        context_message.id
      LIMIT 7
    ) candidate;

    NEW."evidenceContext" := jsonb_strip_nulls(jsonb_build_object(
      'messageKind', message_row.kind,
      'messageCreatedAt', message_row."createdAt",
      'templateKey', message_row."templateKey",
      'templateVersion', message_row."templateVersion",
      'moderationStatus', message_row."moderationStatus",
      'surroundingMessages', surrounding_messages,
      'windowMinutes', 15
    ));
    NEW.status := 'OPEN';
    NEW."reviewedByUserId" := NULL;
    NEW."reviewedAt" := NULL;
    NEW.resolution := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Message reports cannot be hard-deleted.' USING ERRCODE = '55000';
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD."reporterUserId" IS DISTINCT FROM NEW."reporterUserId"
    OR OLD."reportedUserId" IS DISTINCT FROM NEW."reportedUserId"
    OR OLD."conversationId" IS DISTINCT FROM NEW."conversationId"
    OR OLD."messageId" IS DISTINCT FROM NEW."messageId"
    OR OLD.category IS DISTINCT FROM NEW.category
    OR OLD.details IS DISTINCT FROM NEW.details
    OR OLD."evidenceBodySnapshot" IS DISTINCT FROM NEW."evidenceBodySnapshot"
    OR OLD."evidenceContext" IS DISTINCT FROM NEW."evidenceContext"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Message report evidence is immutable.' USING ERRCODE = '55000';
  END IF;

  IF NEW.status <> 'OPEN' AND NOT EXISTS (
    SELECT 1 FROM public."User" reviewer
    WHERE reviewer.id = NEW."reviewedByUserId"
      AND reviewer.status = 'ACTIVE'
      AND 'ADMIN'::public."UserRole" = ANY(reviewer.roles)
  ) THEN
    RAISE EXCEPTION 'Only an active admin may review message reports.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.capture_message_report_evidence()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER message_report_evidence
BEFORE INSERT OR UPDATE OR DELETE ON public."MessageReport"
FOR EACH ROW EXECUTE FUNCTION app_private.capture_message_report_evidence();

CREATE OR REPLACE FUNCTION app_private.messaging_property_snapshot(
  p_invite_id text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN property."ownerUserId" = invite."sellerId"
      AND invite."propertyIdentityVersion" = property."identityVersion" THEN
      jsonb_strip_nulls(jsonb_build_object(
        'title', invite.title,
        'propertyIdentityVersion', invite."propertyIdentityVersion",
        'propertyType', property."propertyType",
        'addressLine1', property."addressLine1",
        'addressLine2', property."addressLine2",
        'city', property.city,
        'state', property.state,
        'zip', property.zip,
        'location', concat_ws(', ',
          nullif(btrim(concat_ws(' ', property."addressLine1", property."addressLine2")), ''),
          nullif(btrim(property.city), ''),
          nullif(btrim(property.state), ''),
          nullif(btrim(property.zip), '')
        ),
        'bedrooms', property.bedrooms,
        'bathrooms', property.bathrooms,
        'squareFeet', property."squareFeet",
        'condition', property.condition,
        'features', property.features,
        'price', property.price,
        'ownershipVerificationStatus', property."ownershipVerificationStatus",
        'propertyStatus', property.status
      ))
    ELSE jsonb_build_object(
      'propertyIdentityVersion', invite."propertyIdentityVersion",
      'contextUnavailable', true
    )
  END
  FROM public."Invite" invite
  JOIN public."SellerProperty" property ON property.id = invite."propertyId"
  WHERE invite.id = p_invite_id;
$$;

REVOKE ALL ON FUNCTION app_private.messaging_property_snapshot(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.broadcast_message_identifier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."moderationStatus" IS NOT DISTINCT FROM NEW."moderationStatus" THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    UPDATE public."Conversation"
    SET "lastMessageAt" = greatest("lastMessageAt", NEW."createdAt"),
        "updatedAt" = now()
    WHERE id = NEW."conversationId";
  ELSE
    UPDATE public."Conversation"
    SET "moderationUpdatedAt" = greatest(
          clock_timestamp()::timestamp(3),
          coalesce("moderationUpdatedAt" + interval '1 millisecond', '-infinity'::timestamp)
        ),
        "updatedAt" = now()
    WHERE id = NEW."conversationId";
  END IF;

  BEGIN
    PERFORM realtime.send(
      jsonb_build_object(
        'conversationId', NEW."conversationId",
        'messageId', NEW.id,
        'type', CASE WHEN TG_OP = 'INSERT' THEN 'message_created' ELSE 'message_moderated' END
      ),
      'message_changed',
      'conversation:' || NEW."conversationId"::text,
      true
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Realtime message hint failed (SQLSTATE %).', SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.broadcast_message_identifier()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER message_identifier_broadcast
AFTER INSERT ON public."Message"
FOR EACH ROW EXECUTE FUNCTION app_private.broadcast_message_identifier();

CREATE TRIGGER message_moderation_broadcast
AFTER UPDATE OF "moderationStatus" ON public."Message"
FOR EACH ROW EXECUTE FUNCTION app_private.broadcast_message_identifier();

CREATE OR REPLACE FUNCTION app_private.create_invite_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conversation_id uuid;
  message_id uuid;
  buyer_user_id uuid;
  conversation_status public."ConversationStatus";
  closed_reason public."ConversationClosedReason";
BEGIN
  SELECT "userId" INTO buyer_user_id
  FROM public."BuyerProfile"
  WHERE id = NEW."buyerProfileId";

  IF NEW.status = 'ACCEPTED' THEN
    conversation_status := 'ACTIVE';
    closed_reason := NULL;
  ELSIF NEW.status IN ('SENT', 'VIEWED') AND NEW."expiresAt" > clock_timestamp() THEN
    conversation_status := 'AWAITING_BUYER';
    closed_reason := NULL;
  ELSE
    conversation_status := 'READ_ONLY';
    closed_reason := CASE NEW.status
      WHEN 'DECLINED' THEN 'INVITE_DECLINED'::public."ConversationClosedReason"
      WHEN 'EXPIRED' THEN 'INVITE_EXPIRED'::public."ConversationClosedReason"
      WHEN 'WITHDRAWN' THEN 'INVITE_WITHDRAWN'::public."ConversationClosedReason"
      ELSE 'INVITE_EXPIRED'::public."ConversationClosedReason"
    END;
  END IF;

  INSERT INTO public."Conversation" (
    "inviteId", status, "closedReason", "propertySnapshot",
    "lastMessageAt", "createdAt", "updatedAt"
  ) VALUES (
    NEW.id,
    conversation_status,
    closed_reason,
    app_private.messaging_property_snapshot(NEW.id),
    NEW."sentAt",
    NEW."sentAt",
    NEW."sentAt"
  )
  RETURNING id INTO conversation_id;

  INSERT INTO public."ConversationParticipant" (
    "conversationId", "userId", role, "createdAt"
  ) VALUES
    (conversation_id, NEW."sellerId", 'SELLER', NEW."sentAt"),
    (conversation_id, buyer_user_id, 'BUYER', NEW."sentAt");

  INSERT INTO public."Message" (
    "conversationId", "senderUserId", kind, "templateKey", "templateVersion",
    body, "clientMessageId", "moderationStatus", "createdAt"
  ) VALUES (
    conversation_id,
    NEW."sellerId",
    'INVITE',
    NEW."openingTemplateKey",
    NEW."openingTemplateVersion",
    btrim(NEW.message),
    gen_random_uuid(),
    'ALLOWED',
    NEW."sentAt"
  )
  RETURNING id INTO message_id;

  UPDATE public."ConversationParticipant"
  SET "lastReadMessageId" = message_id, "lastReadAt" = NEW."sentAt"
  WHERE "conversationId" = conversation_id AND role = 'SELLER';

  IF NEW."viewedAt" IS NOT NULL OR NEW."respondedAt" IS NOT NULL THEN
    UPDATE public."ConversationParticipant"
    SET "lastReadMessageId" = message_id,
        "lastReadAt" = greatest(
          NEW."sentAt",
          coalesce(NEW."respondedAt", NEW."viewedAt", NEW."sentAt")
        )
    WHERE "conversationId" = conversation_id AND role = 'BUYER';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.create_invite_conversation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER invite_creates_conversation
AFTER INSERT ON public."Invite"
FOR EACH ROW EXECUTE FUNCTION app_private.create_invite_conversation();

CREATE OR REPLACE FUNCTION app_private.close_conversation(
  p_conversation_id uuid,
  p_reason public."ConversationClosedReason",
  p_notice text,
  p_event_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changed boolean;
BEGIN
  UPDATE public."Conversation"
  SET status = 'READ_ONLY', "closedReason" = p_reason, "updatedAt" = now()
  WHERE id = p_conversation_id
    AND status IN ('AWAITING_BUYER', 'ACTIVE')
  RETURNING true INTO changed;

  IF changed THEN
    INSERT INTO public."Message" (
      "conversationId", "senderUserId", kind, body,
      "clientMessageId", "moderationStatus", "createdAt"
    ) VALUES (
      p_conversation_id,
      NULL,
      'SYSTEM',
      p_notice,
      md5(p_event_key || ':' || p_conversation_id::text)::uuid,
      'ALLOWED',
      now()
    )
    ON CONFLICT ("conversationId", "clientMessageId") DO NOTHING;
  END IF;

  UPDATE public."EmailOutbox"
  SET status = 'CANCELLED',
      "lastError" = 'Conversation became unavailable before delivery.',
      "lockedAt" = NULL,
      "leaseUntil" = NULL,
      "workerId" = NULL,
      "nextAttemptAt" = NULL,
      "updatedAt" = now()
  WHERE type = 'MESSAGE_UNREAD'
    AND "messageConversationId" = p_conversation_id
    AND status IN ('PENDING', 'FAILED', 'SENDING');
END;
$$;

REVOKE ALL ON FUNCTION app_private.close_conversation(
  uuid, public."ConversationClosedReason", text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.sync_invite_conversation_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conversation_id uuid;
  existing_reason public."ConversationClosedReason";
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT id, "closedReason" INTO conversation_id, existing_reason
  FROM public."Conversation"
  WHERE "inviteId" = NEW.id
  FOR UPDATE;

  IF conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'ACCEPTED' THEN
    UPDATE public."Conversation"
    SET status = 'ACTIVE', "closedReason" = NULL, "updatedAt" = now()
    WHERE id = conversation_id AND status = 'AWAITING_BUYER';
  ELSIF NEW.status = 'DECLINED' THEN
    PERFORM app_private.close_conversation(
      conversation_id,
      'INVITE_DECLINED',
      'This conversation is read-only because the invite was declined.',
      'invite-declined'
    );
  ELSIF NEW.status = 'EXPIRED' THEN
    PERFORM app_private.close_conversation(
      conversation_id,
      'INVITE_EXPIRED',
      'This conversation is read-only because the invite expired.',
      'invite-expired'
    );
  ELSIF NEW.status = 'WITHDRAWN'
    AND existing_reason IS DISTINCT FROM 'PROPERTY_IDENTITY_CHANGED' THEN
    PERFORM app_private.close_conversation(
      conversation_id,
      'INVITE_WITHDRAWN',
      'This conversation is read-only because the invite was withdrawn.',
      'invite-withdrawn'
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.sync_invite_conversation_lifecycle()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER invite_conversation_lifecycle
AFTER UPDATE OF status ON public."Invite"
FOR EACH ROW EXECUTE FUNCTION app_private.sync_invite_conversation_lifecycle();

CREATE OR REPLACE FUNCTION app_private.invalidate_property_conversations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected record;
BEGIN
  IF OLD."addressLine1" IS DISTINCT FROM NEW."addressLine1"
    OR OLD."addressLine2" IS DISTINCT FROM NEW."addressLine2"
    OR OLD.city IS DISTINCT FROM NEW.city
    OR OLD.state IS DISTINCT FROM NEW.state
    OR OLD.zip IS DISTINCT FROM NEW.zip
    OR OLD.lat IS DISTINCT FROM NEW.lat
    OR OLD.lng IS DISTINCT FROM NEW.lng
    OR OLD."providerPropertyId" IS DISTINCT FROM NEW."providerPropertyId" THEN
    FOR affected IN
      SELECT conversation.id
      FROM public."Conversation" conversation
      JOIN public."Invite" invite ON invite.id = conversation."inviteId"
      WHERE invite."propertyId" = OLD.id
        AND conversation.status IN ('AWAITING_BUYER', 'ACTIVE')
      ORDER BY conversation.id
      FOR UPDATE OF conversation
    LOOP
      PERFORM app_private.close_conversation(
        affected.id,
        'PROPERTY_IDENTITY_CHANGED',
        'The property identity changed. This conversation is now read-only.',
        'property-identity-changed'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.invalidate_property_conversations()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER messaging_property_identity_invalidation
BEFORE UPDATE ON public."SellerProperty"
FOR EACH ROW EXECUTE FUNCTION app_private.invalidate_property_conversations();

CREATE OR REPLACE FUNCTION app_private.close_ineligible_property_conversations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected record;
BEGIN
  IF OLD."ownerUserId" IS DISTINCT FROM NEW."ownerUserId"
    OR NEW.status <> 'READY_FOR_INVITES'
    OR NEW."ownershipVerificationStatus" <> 'APPROVED'
    OR NEW."flaggedForReviewAt" IS NOT NULL
    OR NEW."authorityAttestedIdentityVersion" IS DISTINCT FROM NEW."identityVersion" THEN
    FOR affected IN
      SELECT conversation.id
      FROM public."Conversation" conversation
      JOIN public."Invite" invite ON invite.id = conversation."inviteId"
      WHERE invite."propertyId" = NEW.id
        AND conversation.status IN ('AWAITING_BUYER', 'ACTIVE')
      ORDER BY conversation.id
      FOR UPDATE OF conversation
    LOOP
      PERFORM app_private.close_conversation(
        affected.id,
        'PROPERTY_INELIGIBLE',
        'The property is no longer eligible for messaging. This conversation is read-only.',
        'property-ineligible'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.close_ineligible_property_conversations()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER messaging_property_eligibility
AFTER UPDATE OF "ownerUserId", status, "ownershipVerificationStatus", "flaggedForReviewAt",
  "authorityAttestedIdentityVersion", "identityVersion"
ON public."SellerProperty"
FOR EACH ROW EXECUTE FUNCTION app_private.close_ineligible_property_conversations();

CREATE OR REPLACE FUNCTION app_private.close_user_conversations_on_eligibility_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected record;
  buyer_role_lost boolean;
  seller_role_lost boolean;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'SUSPENDED' THEN
    FOR affected IN
      SELECT conversation.id
      FROM public."Conversation" conversation
      JOIN public."ConversationParticipant" participant
        ON participant."conversationId" = conversation.id
      WHERE participant."userId" = NEW.id
        AND conversation.status IN ('AWAITING_BUYER', 'ACTIVE')
      ORDER BY conversation.id
      FOR UPDATE OF conversation
    LOOP
      PERFORM app_private.close_conversation(
        affected.id,
        'USER_SUSPENDED',
        'A participant is no longer eligible. This conversation is read-only.',
        'user-suspended'
      );
    END LOOP;
    RETURN NEW;
  END IF;

  IF OLD.roles IS NOT DISTINCT FROM NEW.roles THEN
    RETURN NEW;
  END IF;

  buyer_role_lost := NOT ('BUYER'::public."UserRole" = ANY(NEW.roles));
  seller_role_lost := NOT ('ADMIN'::public."UserRole" = ANY(NEW.roles))
    AND (
      NOT ('SELLER'::public."UserRole" = ANY(NEW.roles))
      OR NOT EXISTS (
        SELECT 1
        FROM public."SellerAccess" access
        WHERE access."userId" = NEW.id
          AND access.status = 'APPROVED'
      )
    );

  IF NOT buyer_role_lost AND NOT seller_role_lost THEN
    RETURN NEW;
  END IF;

  FOR affected IN
    SELECT conversation.id, participant.role
    FROM public."Conversation" conversation
    JOIN public."ConversationParticipant" participant
      ON participant."conversationId" = conversation.id
    WHERE participant."userId" = NEW.id
      AND conversation.status IN ('AWAITING_BUYER', 'ACTIVE')
      AND (
        (participant.role = 'BUYER' AND buyer_role_lost)
        OR (participant.role = 'SELLER' AND seller_role_lost)
      )
    ORDER BY conversation.id
    FOR UPDATE OF conversation
  LOOP
    IF affected.role = 'BUYER' THEN
      PERFORM app_private.close_conversation(
        affected.id,
        'BUYER_INELIGIBLE',
        'The buyer is no longer eligible. This conversation is read-only.',
        'buyer-role-lost'
      );
    ELSE
      PERFORM app_private.close_conversation(
        affected.id,
        'SELLER_INELIGIBLE',
        'The seller is no longer eligible. This conversation is read-only.',
        'seller-role-lost'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.close_user_conversations_on_eligibility_loss()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER messaging_user_eligibility_loss
AFTER UPDATE OF status, roles ON public."User"
FOR EACH ROW EXECUTE FUNCTION app_private.close_user_conversations_on_eligibility_loss();

CREATE OR REPLACE FUNCTION app_private.close_seller_conversations_on_access_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected record;
  seller_user_id uuid;
BEGIN
  seller_user_id := CASE
    WHEN TG_OP = 'DELETE' OR OLD."userId" IS DISTINCT FROM NEW."userId" THEN OLD."userId"
    ELSE NEW."userId"
  END;

  IF (
    TG_OP = 'DELETE'
    OR OLD."userId" IS DISTINCT FROM NEW."userId"
    OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status <> 'APPROVED')
  ) AND NOT EXISTS (
    SELECT 1
    FROM public."User" app_user
    WHERE app_user.id = seller_user_id
      AND app_user.status = 'ACTIVE'
      AND 'ADMIN'::public."UserRole" = ANY(app_user.roles)
  ) THEN
    FOR affected IN
      SELECT conversation.id
      FROM public."Conversation" conversation
      JOIN public."Invite" invite ON invite.id = conversation."inviteId"
      WHERE invite."sellerId" = seller_user_id
        AND conversation.status IN ('AWAITING_BUYER', 'ACTIVE')
      ORDER BY conversation.id
      FOR UPDATE OF conversation
    LOOP
      PERFORM app_private.close_conversation(
        affected.id,
        'SELLER_INELIGIBLE',
        'The seller is no longer eligible. This conversation is read-only.',
        'seller-access-lost'
      );
    END LOOP;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.close_seller_conversations_on_access_loss()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER messaging_seller_access_loss
AFTER UPDATE OR DELETE ON public."SellerAccess"
FOR EACH ROW EXECUTE FUNCTION app_private.close_seller_conversations_on_access_loss();

CREATE OR REPLACE FUNCTION app_private.close_buyer_conversations_on_visibility_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected record;
BEGIN
  IF OLD."visibilityStatus" IS DISTINCT FROM NEW."visibilityStatus"
    AND NEW."visibilityStatus" <> 'ACTIVE' THEN
    FOR affected IN
      SELECT conversation.id
      FROM public."Conversation" conversation
      JOIN public."Invite" invite ON invite.id = conversation."inviteId"
      WHERE invite."buyerProfileId" = NEW.id
        AND conversation.status IN ('AWAITING_BUYER', 'ACTIVE')
      ORDER BY conversation.id
      FOR UPDATE OF conversation
    LOOP
      PERFORM app_private.close_conversation(
        affected.id,
        'BUYER_INELIGIBLE',
        'The buyer is no longer eligible. This conversation is read-only.',
        'buyer-ineligible'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.close_buyer_conversations_on_visibility_loss()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER messaging_buyer_visibility_loss
AFTER UPDATE OF "visibilityStatus" ON public."BuyerProfile"
FOR EACH ROW EXECUTE FUNCTION app_private.close_buyer_conversations_on_visibility_loss();

CREATE OR REPLACE FUNCTION app_private.apply_user_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'messaging-pair:'
      || least(NEW."blockerUserId", NEW."blockedUserId")::text
      || ':'
      || greatest(NEW."blockerUserId", NEW."blockedUserId")::text,
    0
  ));

  PERFORM invite.id
  FROM public."Invite" invite
  JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
  WHERE (
    invite."sellerId" = NEW."blockerUserId"
    AND buyer."userId" = NEW."blockedUserId"
  ) OR (
    invite."sellerId" = NEW."blockedUserId"
    AND buyer."userId" = NEW."blockerUserId"
  )
  ORDER BY invite.id
  FOR UPDATE OF invite;

  FOR affected IN
    SELECT conversation.id
    FROM public."Conversation" conversation
    WHERE EXISTS (
      SELECT 1 FROM public."ConversationParticipant" first_participant
      WHERE first_participant."conversationId" = conversation.id
        AND first_participant."userId" = NEW."blockerUserId"
    )
      AND EXISTS (
        SELECT 1 FROM public."ConversationParticipant" second_participant
        WHERE second_participant."conversationId" = conversation.id
          AND second_participant."userId" = NEW."blockedUserId"
      )
    ORDER BY conversation.id
    FOR UPDATE OF conversation
  LOOP
    UPDATE public."Conversation"
    SET status = 'BLOCKED', "closedReason" = 'USER_BLOCKED', "updatedAt" = now()
    WHERE id = affected.id AND status <> 'BLOCKED';

    INSERT INTO public."Message" (
      "conversationId", "senderUserId", kind, body,
      "clientMessageId", "moderationStatus", "createdAt"
    ) VALUES (
      affected.id,
      NULL,
      'SYSTEM',
      'This conversation is no longer available.',
      md5('user-blocked:' || affected.id::text)::uuid,
      'ALLOWED',
      now()
    )
    ON CONFLICT ("conversationId", "clientMessageId") DO NOTHING;
  END LOOP;

  UPDATE public."Invite" invite
  SET status = 'WITHDRAWN', "updatedAt" = now()
  FROM public."BuyerProfile" buyer
  WHERE buyer.id = invite."buyerProfileId"
    AND invite.status IN ('SENT', 'VIEWED', 'ACCEPTED')
    AND (
      (invite."sellerId" = NEW."blockerUserId" AND buyer."userId" = NEW."blockedUserId")
      OR (invite."sellerId" = NEW."blockedUserId" AND buyer."userId" = NEW."blockerUserId")
    );

  UPDATE public."EmailOutbox" outbox
  SET status = 'CANCELLED',
      "lastError" = 'Conversation became unavailable before delivery.',
      "lockedAt" = NULL,
      "leaseUntil" = NULL,
      "workerId" = NULL,
      "nextAttemptAt" = NULL,
      "updatedAt" = now()
  WHERE outbox.type = 'MESSAGE_UNREAD'
    AND outbox.status IN ('PENDING', 'FAILED', 'SENDING')
    AND outbox."messageConversationId" IN (
      SELECT conversation.id
      FROM public."Conversation" conversation
      WHERE EXISTS (
        SELECT 1
        FROM public."ConversationParticipant" participant
        WHERE participant."conversationId" = conversation.id
          AND participant."userId" = NEW."blockerUserId"
      )
        AND EXISTS (
          SELECT 1
          FROM public."ConversationParticipant" participant
          WHERE participant."conversationId" = conversation.id
            AND participant."userId" = NEW."blockedUserId"
        )
    );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.apply_user_block()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER user_block_closes_conversations
BEFORE INSERT ON public."UserBlock"
FOR EACH ROW EXECUTE FUNCTION app_private.apply_user_block();

CREATE OR REPLACE FUNCTION app_private.preserve_user_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'User blocks are permanent in Messaging V1.' USING ERRCODE = '55000';
  END IF;

  IF OLD."blockerUserId" IS DISTINCT FROM NEW."blockerUserId"
    OR OLD."blockedUserId" IS DISTINCT FROM NEW."blockedUserId"
    OR OLD.reason IS DISTINCT FROM NEW.reason
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'User blocks are immutable in Messaging V1.' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.preserve_user_block()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER user_block_immutable
BEFORE UPDATE OR DELETE ON public."UserBlock"
FOR EACH ROW EXECUTE FUNCTION app_private.preserve_user_block();

CREATE OR REPLACE FUNCTION app_private.enforce_invite_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  seller_status public."UserStatus";
  seller_access_status public."SellerAccessStatus";
  seller_is_admin boolean;
  seller_has_role boolean;
  seller_can_invite boolean;
  property_verification public."PropertyVerificationStatus";
  property_status public."PropertyStatus";
  property_flagged_at timestamp(3);
  property_identity_version integer;
  attested_identity_version integer;
  buyer_visibility public."BuyerVisibilityStatus";
  buyer_user_status public."UserStatus";
  buyer_has_role boolean;
  buyer_user_id uuid;
  locked_buyer_user_id uuid;
  sent_count integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'SENT'
    OR NEW."openingTemplateKey" IS NULL
    OR NEW."openingTemplateVersion" IS DISTINCT FROM 1
    OR NEW."expiresAt" <= NEW."sentAt" THEN
    RAISE EXCEPTION 'New invites must include current guided opening metadata and begin in SENT status.'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."sellerId"::text, 0));

  -- Derive the buyer, lock both users in UUID order, then revalidate the profile
  -- under lock. Access and property follow the same order as user suspension.
  SELECT buyer_profile."userId"
  INTO buyer_user_id
  FROM public."BuyerProfile" buyer_profile
  WHERE buyer_profile.id = NEW."buyerProfileId";

  IF buyer_user_id IS NULL THEN
    RAISE EXCEPTION 'Invite is unavailable.' USING ERRCODE = '42501';
  END IF;

  PERFORM app_user.id
  FROM public."User" app_user
  WHERE app_user.id IN (NEW."sellerId", buyer_user_id)
  ORDER BY app_user.id
  FOR SHARE;

  SELECT app_user.status,
    'ADMIN'::public."UserRole" = ANY(app_user.roles),
    'SELLER'::public."UserRole" = ANY(app_user.roles)
  INTO seller_status, seller_is_admin, seller_has_role
  FROM public."User" app_user
  WHERE app_user.id = NEW."sellerId";

  SELECT buyer_user.status, 'BUYER'::public."UserRole" = ANY(buyer_user.roles)
  INTO buyer_user_status, buyer_has_role
  FROM public."User" buyer_user
  WHERE buyer_user.id = buyer_user_id;

  SELECT buyer_profile."visibilityStatus", buyer_profile."userId"
  INTO buyer_visibility, locked_buyer_user_id
  FROM public."BuyerProfile" buyer_profile
  WHERE buyer_profile.id = NEW."buyerProfileId"
  FOR SHARE;

  IF locked_buyer_user_id IS DISTINCT FROM buyer_user_id THEN
    RAISE EXCEPTION 'Invite is unavailable.' USING ERRCODE = '42501';
  END IF;

  SELECT access.status
  INTO seller_access_status
  FROM public."SellerAccess" access
  WHERE access."userId" = NEW."sellerId"
  FOR SHARE;

  seller_can_invite := seller_is_admin
    OR (seller_has_role AND seller_access_status = 'APPROVED');

  IF seller_status IS DISTINCT FROM 'ACTIVE' OR seller_can_invite IS NOT TRUE THEN
    RAISE EXCEPTION 'Invite is unavailable.' USING ERRCODE = '42501';
  END IF;

  SELECT property."ownershipVerificationStatus", property.status,
    property."flaggedForReviewAt", property."identityVersion",
    property."authorityAttestedIdentityVersion"
  INTO property_verification, property_status, property_flagged_at,
    property_identity_version, attested_identity_version
  FROM public."SellerProperty" property
  WHERE property.id = NEW."propertyId" AND property."ownerUserId" = NEW."sellerId"
  FOR SHARE;

  IF property_identity_version IS NULL
    OR property_flagged_at IS NOT NULL
    OR property_verification <> 'APPROVED'
    OR property_status <> 'READY_FOR_INVITES'
    OR attested_identity_version IS DISTINCT FROM property_identity_version
    OR NEW."propertyIdentityVersion" IS DISTINCT FROM property_identity_version THEN
    RAISE EXCEPTION 'Invite is unavailable.' USING ERRCODE = '42501';
  END IF;

  IF buyer_visibility IS DISTINCT FROM 'ACTIVE'
    OR buyer_user_status IS DISTINCT FROM 'ACTIVE'
    OR buyer_has_role IS NOT TRUE
    OR buyer_user_id = NEW."sellerId" THEN
    RAISE EXCEPTION 'Invite is unavailable.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'messaging-pair:'
      || least(NEW."sellerId", buyer_user_id)::text
      || ':'
      || greatest(NEW."sellerId", buyer_user_id)::text,
    0
  ));

  IF EXISTS (
    SELECT 1 FROM public."UserBlock" block
    WHERE (
      block."blockerUserId" = NEW."sellerId"
      AND block."blockedUserId" = buyer_user_id
    ) OR (
      block."blockerUserId" = buyer_user_id
      AND block."blockedUserId" = NEW."sellerId"
    )
  ) THEN
    RAISE EXCEPTION 'Invite is unavailable.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO sent_count
  FROM public."Invite"
  WHERE "sellerId" = NEW."sellerId"
    AND "sentAt" >= now() - interval '24 hours';

  IF sent_count >= 25 THEN
    RAISE EXCEPTION 'Seller rolling 24-hour invite limit reached.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_invite_rules()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.can_join_conversation_topic(
  p_topic text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  viewer_id uuid := auth.uid();
  conversation_id uuid;
BEGIN
  IF viewer_id IS NULL
    OR p_topic !~ '^conversation:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-5][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$' THEN
    RETURN false;
  END IF;

  conversation_id := split_part(p_topic, ':', 2)::uuid;

  RETURN EXISTS (
    SELECT 1
    FROM public."ConversationParticipant" participant
    JOIN public."User" app_user ON app_user.id = participant."userId"
    WHERE participant."conversationId" = conversation_id
      AND participant."userId" = viewer_id
      AND app_user.status = 'ACTIVE'
  );
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION app_private.can_join_conversation_topic(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_join_conversation_topic(text)
  TO authenticated;

ALTER TABLE public."Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ConversationParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MessageReport" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public."Conversation",
  public."ConversationParticipant",
  public."Message",
  public."UserBlock",
  public."MessageReport"
FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'realtime'
      AND policy.tablename = 'messages'
      AND policy.policyname <> 'Active participants can receive conversation broadcasts'
      AND policy.permissive = 'PERMISSIVE'
      AND policy.cmd IN ('SELECT', 'ALL')
      AND (
        'public'::name = ANY(policy.roles)
        OR 'anon'::name = ANY(policy.roles)
        OR 'authenticated'::name = ANY(policy.roles)
      )
  ) THEN
    RAISE EXCEPTION 'Guided messaging migration blocked: review existing permissive authenticated Realtime SELECT policies before enabling private conversation topics.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'realtime'
      AND policy.tablename = 'messages'
      AND policy.cmd IN ('INSERT', 'ALL')
      AND (
        'public'::name = ANY(policy.roles)
        OR 'anon'::name = ANY(policy.roles)
        OR 'authenticated'::name = ANY(policy.roles)
      )
  ) THEN
    RAISE EXCEPTION 'Guided messaging migration blocked: browser Realtime Broadcast INSERT policies must be removed before private conversation topics are enabled.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Active participants can receive conversation broadcasts"
  ON realtime.messages;
CREATE POLICY "Active participants can receive conversation broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND (
    SELECT app_private.can_join_conversation_topic(
      (SELECT realtime.topic())
    )
  )
);

COMMIT;
-- END SOURCE 20260714150654_add_guided_messaging_v1
