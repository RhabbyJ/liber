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
