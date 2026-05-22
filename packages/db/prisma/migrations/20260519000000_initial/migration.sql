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
