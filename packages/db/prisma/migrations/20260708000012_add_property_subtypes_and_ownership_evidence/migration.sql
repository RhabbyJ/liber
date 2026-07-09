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
