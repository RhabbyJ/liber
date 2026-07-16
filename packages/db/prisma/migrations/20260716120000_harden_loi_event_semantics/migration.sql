BEGIN;

ALTER TABLE public."LoiEvent"
  DROP CONSTRAINT "LoiEvent_actorUserId_fkey",
  ADD CONSTRAINT "LoiEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES public."User"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."LoiNegotiation"
  DROP CONSTRAINT "LoiNegotiation_closed_check",
  ADD CONSTRAINT "LoiNegotiation_closed_check" CHECK (
    (
      status IN (
        'AWAITING_BUYER_SUBMISSION',
        'AWAITING_SELLER_RESPONSE',
        'AWAITING_BUYER_RESPONSE'
      )
      AND "closedAt" IS NULL
      AND "closedReason" IS NULL
    )
    OR (status = 'TERMS_ALIGNED' AND "closedAt" IS NOT NULL AND "closedReason" = 'TERMS_ALIGNED')
    OR (status = 'DECLINED' AND "closedAt" IS NOT NULL AND "closedReason" = 'DECLINED')
    OR (status = 'WITHDRAWN' AND "closedAt" IS NOT NULL AND "closedReason" = 'WITHDRAWN')
    OR (status = 'EXPIRED' AND "closedAt" IS NOT NULL AND "closedReason" = 'RESPONSE_EXPIRED')
    OR (
      status = 'READ_ONLY'
      AND "closedAt" IS NOT NULL
      AND "closedReason" IN (
        'PROPERTY_IDENTITY_CHANGED',
        'PROPERTY_NO_LONGER_ELIGIBLE',
        'SELLER_ACCESS_LOST',
        'PARTICIPANT_INACTIVE',
        'PARTICIPANTS_BLOCKED',
        'INVITE_NO_LONGER_ELIGIBLE',
        'ADMIN_RESTRICTED'
      )
    )
  );

ALTER TABLE public."LoiEvent"
  ADD CONSTRAINT "LoiEvent_shape_check" CHECK (
    (
      type = 'NEGOTIATION_CREATED'
      AND "actorUserId" IS NOT NULL
      AND "actorRole" = 'BUYER'
      AND "revisionId" IS NULL
    )
    OR (
      type = 'INITIAL_SUBMITTED'
      AND "actorUserId" IS NOT NULL
      AND "actorRole" = 'BUYER'
      AND "revisionId" IS NOT NULL
    )
    OR (
      type IN ('COUNTER_SUBMITTED', 'TERMS_ALIGNED', 'DECLINED')
      AND "actorUserId" IS NOT NULL
      AND "actorRole" IS NOT NULL
      AND "revisionId" IS NOT NULL
    )
    OR (
      type = 'WITHDRAWN'
      AND "actorUserId" IS NOT NULL
      AND "actorRole" IS NOT NULL
    )
    OR (
      type = 'EXPIRED'
      AND "actorUserId" IS NULL
      AND "actorRole" IS NULL
      AND "revisionId" IS NOT NULL
    )
    OR (
      type = 'FROZEN'
      AND "actorUserId" IS NULL
      AND "actorRole" IS NULL
    )
  );

CREATE OR REPLACE FUNCTION app_private.validate_loi_event_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  negotiation_row public."LoiNegotiation"%ROWTYPE;
  revision_row public."LoiRevision"%ROWTYPE;
BEGIN
  SELECT * INTO negotiation_row
  FROM public."LoiNegotiation"
  WHERE id = NEW."negotiationId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOI event negotiation does not exist.' USING ERRCODE = '23503';
  END IF;

  IF NEW."actorUserId" IS NOT NULL AND NOT (
    (NEW."actorRole" = 'BUYER' AND NEW."actorUserId" = negotiation_row."buyerUserId")
    OR (NEW."actorRole" = 'SELLER' AND NEW."actorUserId" = negotiation_row."sellerUserId")
  ) THEN
    RAISE EXCEPTION 'LOI event actor must be an authoritative participant.' USING ERRCODE = '23514';
  END IF;

  IF NEW."revisionId" IS NOT NULL THEN
    SELECT * INTO revision_row
    FROM public."LoiRevision"
    WHERE id = NEW."revisionId";

    IF NOT FOUND OR revision_row."negotiationId" IS DISTINCT FROM NEW."negotiationId" THEN
      RAISE EXCEPTION 'LOI event revision must belong to its negotiation.' USING ERRCODE = '23514';
    END IF;
    IF negotiation_row."currentRevisionId" IS DISTINCT FROM NEW."revisionId" THEN
      RAISE EXCEPTION 'LOI event revision must be the current negotiation revision.' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.type = 'NEGOTIATION_CREATED' AND negotiation_row."currentSequence" <> 0 THEN
    RAISE EXCEPTION 'LOI creation event requires sequence zero.' USING ERRCODE = '23514';
  ELSIF NEW.type = 'INITIAL_SUBMITTED' AND (
    revision_row.sequence IS DISTINCT FROM 1
    OR revision_row.kind IS DISTINCT FROM 'INITIAL'
    OR revision_row."submittedByUserId" IS DISTINCT FROM NEW."actorUserId"
    OR revision_row."submittedByRole" IS DISTINCT FROM NEW."actorRole"
  ) THEN
    RAISE EXCEPTION 'Initial submission event must match revision one and its buyer author.' USING ERRCODE = '23514';
  ELSIF NEW.type = 'COUNTER_SUBMITTED' AND (
    revision_row.sequence IS NULL
    OR revision_row.sequence <= 1
    OR revision_row.kind IS DISTINCT FROM 'COUNTER'
    OR revision_row."submittedByUserId" IS DISTINCT FROM NEW."actorUserId"
    OR revision_row."submittedByRole" IS DISTINCT FROM NEW."actorRole"
  ) THEN
    RAISE EXCEPTION 'Counter submission event must match its counter revision and author.' USING ERRCODE = '23514';
  ELSIF NEW.type IN ('TERMS_ALIGNED', 'DECLINED') AND (
    revision_row."submittedByUserId" IS NULL
    OR revision_row."submittedByUserId" = NEW."actorUserId"
  ) THEN
    RAISE EXCEPTION 'LOI decision actor must be the current revision counterparty.' USING ERRCODE = '23514';
  ELSIF NEW.type = 'WITHDRAWN' AND NEW."revisionId" IS NULL AND negotiation_row."currentSequence" <> 0 THEN
    RAISE EXCEPTION 'Revisionless LOI withdrawal is valid only before initial submission.' USING ERRCODE = '23514';
  ELSIF NEW.type = 'WITHDRAWN' AND NEW."revisionId" IS NOT NULL AND (
    revision_row."submittedByUserId" IS DISTINCT FROM NEW."actorUserId"
    OR revision_row."submittedByRole" IS DISTINCT FROM NEW."actorRole"
  ) THEN
    RAISE EXCEPTION 'Post-submission LOI withdrawal must be performed by the current revision author.' USING ERRCODE = '23514';
  ELSIF NEW.type = 'FROZEN' AND (
    (negotiation_row."currentSequence" = 0 AND NEW."revisionId" IS NOT NULL)
    OR (negotiation_row."currentSequence" > 0 AND NEW."revisionId" IS NULL)
  ) THEN
    RAISE EXCEPTION 'Frozen LOI event revision must match the negotiation sequence.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.validate_loi_event_actor()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
