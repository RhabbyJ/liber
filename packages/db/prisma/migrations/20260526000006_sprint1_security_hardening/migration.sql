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
