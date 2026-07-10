-- Unnumbered proposal. Promote to a numbered migration only after review and disposable-branch proof.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

LOCK TABLE public."SellerProperty" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public."VerificationDocument" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public."Invite" IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public."SellerProperty"
  ADD COLUMN "ownershipVersion" integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT "SellerProperty_ownershipVersion_check" CHECK ("ownershipVersion" > 0);

ALTER TABLE public."VerificationDocument"
  ADD COLUMN "propertyOwnershipVersion" integer,
  ADD CONSTRAINT "VerificationDocument_propertyOwnershipVersion_check"
    CHECK ("propertyOwnershipVersion" IS NULL OR "propertyOwnershipVersion" > 0);

ALTER TABLE public."Invite"
  ALTER COLUMN "expiresAt" SET DEFAULT (now() + interval '30 days');

UPDATE public."Invite"
SET "expiresAt" = "sentAt" + interval '30 days'
WHERE "expiresAt" IS NULL;

UPDATE public."Invite"
SET status = 'EXPIRED'
WHERE status IN ('SENT', 'VIEWED')
  AND "expiresAt" <= now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."Invite" WHERE "expiresAt" <= "sentAt"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LIBER_INVALID_INVITE_EXPIRY_REQUIRES_REVIEW',
      DETAIL = 'Invite expiresAt must be later than sentAt before this proposal can be applied.';
  END IF;
END;
$$;

ALTER TABLE public."Invite"
  ALTER COLUMN "expiresAt" SET NOT NULL,
  ADD CONSTRAINT "Invite_expiresAt_after_sentAt_check" CHECK ("expiresAt" > "sentAt");

-- Historical property identity was not versioned, so no legacy ownership decision can
-- be proven to describe the current address/coordinates. Preserve every prior decision,
-- retain the immutable file row, and require a current-version re-review.
INSERT INTO public."AdminAuditLog" (
  id, action, "targetType", "targetId", metadata, "createdAt"
)
SELECT
  gen_random_uuid()::text,
  'legacy_ownership_evidence_quarantined',
  'document',
  document.id,
  jsonb_build_object(
    'previousReviewStatus', document."reviewStatus",
    'previousReviewedAt', document."reviewedAt",
    'previousReviewedByUserId', document."reviewedByUserId",
    'previousReviewNotes', document."reviewNotes",
    'previousRejectionReason', document."rejectionReason",
    'ownershipEvidenceKind', document."ownershipEvidenceKind",
    'propertyId', document."propertyId"
  ),
  now()
FROM public."VerificationDocument" AS document
WHERE document."documentType" = 'OWNERSHIP'
  AND document."propertyId" IS NOT NULL;

UPDATE public."VerificationDocument"
SET
  "reviewStatus" = 'PENDING',
  "reviewedAt" = NULL,
  "reviewedByUserId" = NULL,
  "reviewNotes" = NULL,
  "rejectionReason" = NULL,
  "propertyOwnershipVersion" = NULL,
  "updatedAt" = now()
WHERE "documentType" = 'OWNERSHIP'
  AND "propertyId" IS NOT NULL;

INSERT INTO public."AdminAuditLog" (
  id, action, "targetType", "targetId", metadata, "createdAt"
)
SELECT
  gen_random_uuid()::text,
  'legacy_property_ownership_reopened',
  'seller_property',
  property.id,
  jsonb_build_object(
    'previousStatus', property."ownershipVerificationStatus",
    'ownershipVersion', property."ownershipVersion"
  ),
  now()
FROM public."SellerProperty" AS property
WHERE property."ownershipVerificationStatus" <> 'NOT_SUBMITTED'
   OR EXISTS (
     SELECT 1
     FROM public."VerificationDocument" AS document
     WHERE document."propertyId" = property.id
       AND document."documentType" = 'OWNERSHIP'
   );

UPDATE public."SellerProperty" AS property
SET "ownershipVerificationStatus" = 'PENDING', "updatedAt" = now()
WHERE property."ownershipVerificationStatus" <> 'NOT_SUBMITTED'
   OR EXISTS (
     SELECT 1
     FROM public."VerificationDocument" AS document
     WHERE document."propertyId" = property.id
       AND document."documentType" = 'OWNERSHIP'
   );

DROP INDEX IF EXISTS public."VerificationDocument_propertyId_ownershipEvidenceKind_idx";
CREATE INDEX "VerificationDocument_propertyId_propertyOwnershipVersion_ownershipEvidenceKind_reviewStatus_idx"
  ON public."VerificationDocument"(
    "propertyId", "propertyOwnershipVersion", "ownershipEvidenceKind", "reviewStatus"
  );
CREATE INDEX "Invite_status_expiresAt_idx" ON public."Invite"(status, "expiresAt");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."Invite"
    WHERE status IN ('SENT', 'VIEWED')
    GROUP BY "sellerId", "buyerProfileId", "propertyId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'LIBER_DUPLICATE_ACTIVE_INVITES_REQUIRE_REVIEW',
      DETAIL = 'Resolve existing non-expired duplicate invite groups before applying the unique constraint.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX "Invite_one_active_per_seller_buyer_property_key"
  ON public."Invite"("sellerId", "buyerProfileId", "propertyId")
  WHERE status IN ('SENT', 'VIEWED');

CREATE OR REPLACE FUNCTION app_private.enforce_property_ownership_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LIBER_PROPERTY_OWNER_IMMUTABLE';
  END IF;

  IF ROW(
    NEW."addressLine1", NEW."addressLine2", NEW.city, NEW.state,
    NEW.zip, NEW.lat, NEW.lng
  ) IS DISTINCT FROM ROW(
    OLD."addressLine1", OLD."addressLine2", OLD.city, OLD.state,
    OLD.zip, OLD.lat, OLD.lng
  ) THEN
    NEW."ownershipVersion" := OLD."ownershipVersion" + 1;
    NEW."ownershipVerificationStatus" := 'PENDING';
  ELSIF NEW."ownershipVersion" IS DISTINCT FROM OLD."ownershipVersion" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LIBER_PROPERTY_OWNERSHIP_VERSION_MANAGED';
  END IF;

  IF NEW."ownershipVerificationStatus" = 'APPROVED' AND NOT (
    EXISTS (
      SELECT 1
      FROM public."VerificationDocument" AS document
      WHERE document."propertyId" = NEW.id
        AND document."userId" = NEW."ownerUserId"
        AND document."documentType" = 'OWNERSHIP'
        AND document."propertyOwnershipVersion" = NEW."ownershipVersion"
        AND document."ownershipEvidenceKind" = 'GOVERNMENT_ID'
        AND document."reviewStatus" = 'APPROVED'
    )
    AND EXISTS (
      SELECT 1
      FROM public."VerificationDocument" AS document
      WHERE document."propertyId" = NEW.id
        AND document."userId" = NEW."ownerUserId"
        AND document."documentType" = 'OWNERSHIP'
        AND document."propertyOwnershipVersion" = NEW."ownershipVersion"
        AND document."ownershipEvidenceKind" = 'PROPERTY_ADDRESS_PROOF'
        AND document."reviewStatus" = 'APPROVED'
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LIBER_PROPERTY_OWNERSHIP_EVIDENCE_INCOMPLETE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_ownership_evidence_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  property_owner uuid;
  property_version integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."propertyId" IS DISTINCT FROM OLD."propertyId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."documentType" IS DISTINCT FROM OLD."documentType"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LIBER_OWNERSHIP_EVIDENCE_SUBJECT_IMMUTABLE';
  END IF;

  IF NEW."documentType" <> 'OWNERSHIP' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW."ownershipEvidenceKind" IS NOT DISTINCT FROM OLD."ownershipEvidenceKind"
    AND NEW."propertyOwnershipVersion" IS NOT DISTINCT FROM OLD."propertyOwnershipVersion"
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    (OLD."ownershipEvidenceKind" IS NOT NULL AND NEW."ownershipEvidenceKind" IS DISTINCT FROM OLD."ownershipEvidenceKind")
    OR (OLD."propertyOwnershipVersion" IS NOT NULL AND NEW."propertyOwnershipVersion" IS DISTINCT FROM OLD."propertyOwnershipVersion")
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LIBER_OWNERSHIP_EVIDENCE_BINDING_IMMUTABLE';
  END IF;

  SELECT property."ownerUserId", property."ownershipVersion"
  INTO property_owner, property_version
  FROM public."SellerProperty" AS property
  WHERE property.id = NEW."propertyId"
  FOR KEY SHARE;

  IF property_owner IS NULL
    OR NEW."userId" IS DISTINCT FROM property_owner
    OR NEW."ownershipEvidenceKind" IS NULL
    OR NEW."propertyOwnershipVersion" IS DISTINCT FROM property_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'LIBER_OWNERSHIP_EVIDENCE_VERSION_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_property_ownership_state ON public."SellerProperty";
CREATE TRIGGER enforce_property_ownership_state
BEFORE UPDATE ON public."SellerProperty"
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_property_ownership_state();

DROP TRIGGER IF EXISTS enforce_ownership_evidence_binding ON public."VerificationDocument";
CREATE TRIGGER enforce_ownership_evidence_binding
BEFORE INSERT OR UPDATE ON public."VerificationDocument"
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_ownership_evidence_binding();

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
  buyer_user_id uuid;
  sent_count integer;
  daily_limit integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('liber-invite-seller:' || NEW."sellerId"::text, 0)
  );

  SELECT
    status,
    ('ADMIN'::public."UserRole" = ANY(roles)) OR EXISTS (
      SELECT 1
      FROM public."SellerAccess" AS access
      WHERE access."userId" = NEW."sellerId"
        AND access.status = 'APPROVED'
    )
  INTO seller_status, seller_can_invite
  FROM public."User"
  WHERE id = NEW."sellerId";

  IF seller_status IS NULL THEN RAISE EXCEPTION 'Seller not found.'; END IF;
  IF seller_status = 'SUSPENDED' THEN RAISE EXCEPTION 'Suspended sellers cannot send invites.'; END IF;
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

  SELECT "visibilityStatus", "userId"
  INTO buyer_visibility, buyer_user_id
  FROM public."BuyerProfile"
  WHERE id = NEW."buyerProfileId";

  IF buyer_visibility IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'Buyer profile must be active before receiving invites.';
  END IF;
  IF buyer_user_id = NEW."sellerId" THEN
    RAISE EXCEPTION 'Sellers cannot invite their own buyer profile.';
  END IF;

  NEW."expiresAt" := COALESCE(NEW."expiresAt", NEW."sentAt" + interval '30 days');
  IF NEW."expiresAt" <= now() THEN
    RAISE EXCEPTION 'Expired invites cannot be created or used.';
  END IF;

  UPDATE public."Invite"
  SET status = 'EXPIRED', "updatedAt" = now()
  WHERE "sellerId" = NEW."sellerId"
    AND "buyerProfileId" = NEW."buyerProfileId"
    AND "propertyId" = NEW."propertyId"
    AND status IN ('SENT', 'VIEWED')
    AND "expiresAt" <= now();

  daily_limit := CASE WHEN property_verification = 'APPROVED' THEN 25 ELSE 5 END;
  SELECT count(*) INTO sent_count
  FROM public."Invite"
  WHERE "sellerId" = NEW."sellerId"
    AND "sentAt" >= now() - interval '24 hours';

  IF sent_count >= daily_limit THEN RAISE EXCEPTION 'Seller invite rate limit reached.'; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_property_ownership_state() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.enforce_ownership_evidence_binding() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.enforce_invite_rules() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON COLUMN public."SellerProperty"."ownershipVersion" IS
'The ownership identity is (SellerProperty.id, ownershipVersion); address or coordinate changes increment it and invalidate approval.';
COMMENT ON COLUMN public."SellerProperty"."ownerUserId" IS
'Immutable in V1; property transfer requires a separately designed audited workflow.';
COMMENT ON COLUMN public."VerificationDocument"."propertyOwnershipVersion" IS
'The exact SellerProperty ownershipVersion reviewed by this evidence; prior versions are audit history only.';

COMMIT;
