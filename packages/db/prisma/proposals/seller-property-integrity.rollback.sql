-- Unnumbered rollback proposal. Use only before any post-cutover evidence/invite write.
-- Persisted EXPIRED invite transitions are intentionally not reversed.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

LOCK TABLE public."SellerProperty" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public."VerificationDocument" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public."Invite" IN SHARE ROW EXCLUSIVE MODE;

DROP INDEX IF EXISTS public."Invite_one_active_per_seller_buyer_property_key";
DROP INDEX IF EXISTS public."Invite_status_expiresAt_idx";
DROP INDEX IF EXISTS public."VerificationDocument_propertyId_propertyOwnershipVersion_ownershipEvidenceKind_reviewStatus_idx";
CREATE INDEX IF NOT EXISTS "VerificationDocument_propertyId_ownershipEvidenceKind_idx"
  ON public."VerificationDocument"("propertyId", "ownershipEvidenceKind");

DROP TRIGGER IF EXISTS enforce_property_ownership_state ON public."SellerProperty";
DROP TRIGGER IF EXISTS enforce_ownership_evidence_binding ON public."VerificationDocument";
DROP FUNCTION IF EXISTS app_private.enforce_property_ownership_state();
DROP FUNCTION IF EXISTS app_private.enforce_ownership_evidence_binding();

-- Restore pre-proposal decisions captured during the legacy re-review cutover.
UPDATE public."VerificationDocument" AS document
SET
  "reviewStatus" = (audit.metadata->>'previousReviewStatus')::public."DocumentStatus",
  "reviewedAt" = (audit.metadata->>'previousReviewedAt')::timestamp(3),
  "reviewedByUserId" = (audit.metadata->>'previousReviewedByUserId')::uuid,
  "reviewNotes" = audit.metadata->>'previousReviewNotes',
  "rejectionReason" = audit.metadata->>'previousRejectionReason',
  "updatedAt" = now()
FROM public."AdminAuditLog" AS audit
WHERE audit.action = 'legacy_ownership_evidence_quarantined'
  AND audit."targetType" = 'document'
  AND audit."targetId" = document.id;

UPDATE public."SellerProperty" AS property
SET
  "ownershipVerificationStatus" = (audit.metadata->>'previousStatus')::public."PropertyVerificationStatus",
  "updatedAt" = now()
FROM public."AdminAuditLog" AS audit
WHERE audit.action = 'legacy_property_ownership_reopened'
  AND audit."targetType" = 'seller_property'
  AND audit."targetId" = property.id;

ALTER TABLE public."Invite"
  DROP CONSTRAINT IF EXISTS "Invite_expiresAt_after_sentAt_check",
  ALTER COLUMN "expiresAt" DROP NOT NULL,
  ALTER COLUMN "expiresAt" DROP DEFAULT;

ALTER TABLE public."VerificationDocument"
  DROP CONSTRAINT IF EXISTS "VerificationDocument_propertyOwnershipVersion_check",
  DROP COLUMN IF EXISTS "propertyOwnershipVersion";

ALTER TABLE public."SellerProperty"
  DROP CONSTRAINT IF EXISTS "SellerProperty_ownershipVersion_check",
  DROP COLUMN IF EXISTS "ownershipVersion";

-- Restore the previous baseline trigger. This intentionally removes self-invite,
-- use-time expiry, serialization, and active-duplicate enforcement.
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
      SELECT 1 FROM public."SellerAccess" access
      WHERE access."userId" = NEW."sellerId" AND access.status = 'APPROVED'
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

  IF property_verification IS NULL THEN RAISE EXCEPTION 'Seller must own property before sending invites.'; END IF;
  IF property_flagged_at IS NOT NULL THEN RAISE EXCEPTION 'Property is under review and cannot send invites.'; END IF;

  SELECT "visibilityStatus" INTO buyer_visibility
  FROM public."BuyerProfile" WHERE id = NEW."buyerProfileId";
  IF buyer_visibility IS DISTINCT FROM 'ACTIVE' THEN
    RAISE EXCEPTION 'Buyer profile must be active before receiving invites.';
  END IF;

  daily_limit := CASE WHEN property_verification = 'APPROVED' THEN 25 ELSE 5 END;
  SELECT count(*) INTO sent_count FROM public."Invite"
  WHERE "sellerId" = NEW."sellerId" AND "sentAt" >= now() - interval '24 hours';
  IF sent_count >= daily_limit THEN RAISE EXCEPTION 'Seller invite rate limit reached.'; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_invite_rules() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON COLUMN public."SellerProperty"."ownerUserId" IS NULL;

COMMIT;
