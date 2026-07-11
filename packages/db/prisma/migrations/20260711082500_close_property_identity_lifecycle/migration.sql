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
