-- SellerProperty.identityVersion is the sole current property identity. A
-- retired unnumbered proposal introduced parallel ownership-version columns
-- and triggers on one existing target; remove those artifacts without changing
-- the supported identity-version evidence lifecycle.

LOCK TABLE public."SellerProperty" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public."VerificationDocument" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  mismatch_exists boolean;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'SellerProperty'
      AND column_name = 'ownershipVersion'
  ) THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM public."SellerProperty"
        WHERE "ownershipVersion" IS DISTINCT FROM "identityVersion"
      )
    $query$ INTO mismatch_exists;

    IF mismatch_exists THEN
      RAISE EXCEPTION 'Legacy ownership versions differ from current property identity versions.';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'VerificationDocument'
      AND column_name = 'propertyOwnershipVersion'
  ) THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM public."VerificationDocument"
        WHERE "propertyOwnershipVersion" IS NOT NULL
          AND "propertyIdentityVersion" IS NULL
      )
    $query$ INTO mismatch_exists;

    IF mismatch_exists THEN
      RAISE EXCEPTION 'Legacy ownership evidence lacks a current property identity version.';
    END IF;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS enforce_ownership_evidence_binding
  ON public."VerificationDocument";
DROP TRIGGER IF EXISTS enforce_property_ownership_state
  ON public."SellerProperty";

DROP FUNCTION IF EXISTS app_private.enforce_ownership_evidence_binding();
DROP FUNCTION IF EXISTS app_private.enforce_property_ownership_state();

DROP INDEX IF EXISTS public."VerificationDocument_propertyId_propertyOwnershipVersion_ownershipEvidenceKind_reviewStatus_idx";

ALTER TABLE public."VerificationDocument"
  DROP CONSTRAINT IF EXISTS "VerificationDocument_approved_ownership_version_check",
  DROP CONSTRAINT IF EXISTS "VerificationDocument_propertyOwnershipVersion_check",
  DROP COLUMN IF EXISTS "propertyOwnershipVersion";

ALTER TABLE public."SellerProperty"
  DROP CONSTRAINT IF EXISTS "SellerProperty_ownershipVersion_check",
  DROP COLUMN IF EXISTS "ownershipVersion";

CREATE INDEX IF NOT EXISTS "VerificationDocument_propertyId_ownershipEvidenceKind_idx"
  ON public."VerificationDocument"("propertyId", "ownershipEvidenceKind");
