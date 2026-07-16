BEGIN;

CREATE TYPE public."LoiNegotiationStatus" AS ENUM (
  'AWAITING_BUYER_SUBMISSION', 'AWAITING_SELLER_RESPONSE',
  'AWAITING_BUYER_RESPONSE', 'TERMS_ALIGNED', 'DECLINED', 'WITHDRAWN',
  'EXPIRED', 'READ_ONLY'
);
CREATE TYPE public."LoiClosedReason" AS ENUM (
  'TERMS_ALIGNED', 'DECLINED', 'WITHDRAWN', 'RESPONSE_EXPIRED',
  'PROPERTY_IDENTITY_CHANGED', 'PROPERTY_NO_LONGER_ELIGIBLE',
  'SELLER_ACCESS_LOST', 'PARTICIPANT_INACTIVE', 'PARTICIPANTS_BLOCKED',
  'INVITE_NO_LONGER_ELIGIBLE', 'ADMIN_RESTRICTED'
);
CREATE TYPE public."LoiParticipantRole" AS ENUM ('BUYER', 'SELLER');
CREATE TYPE public."LoiRevisionKind" AS ENUM ('INITIAL', 'COUNTER');
CREATE TYPE public."LoiEventType" AS ENUM (
  'NEGOTIATION_CREATED', 'INITIAL_SUBMITTED', 'COUNTER_SUBMITTED',
  'TERMS_ALIGNED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'FROZEN'
);

CREATE TABLE public."LoiNegotiation" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "inviteId" text NOT NULL,
  "conversationId" uuid NOT NULL,
  "buyerUserId" uuid NOT NULL,
  "sellerUserId" uuid NOT NULL,
  "propertyId" text NOT NULL,
  "propertyIdentityVersion" integer NOT NULL,
  status public."LoiNegotiationStatus" NOT NULL DEFAULT 'AWAITING_BUYER_SUBMISSION',
  "closedReason" public."LoiClosedReason",
  "currentRevisionId" uuid,
  "currentSequence" integer NOT NULL DEFAULT 0,
  "propertySnapshot" jsonb NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  "closedAt" timestamp(3),
  CONSTRAINT "LoiNegotiation_pkey" PRIMARY KEY (id),
  CONSTRAINT "LoiNegotiation_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES public."Invite"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "LoiNegotiation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "LoiNegotiation_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "LoiNegotiation_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "LoiNegotiation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."SellerProperty"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "LoiNegotiation_sequence_check" CHECK (
    ("currentSequence" = 0 AND "currentRevisionId" IS NULL AND status IN ('AWAITING_BUYER_SUBMISSION', 'WITHDRAWN', 'READ_ONLY'))
    OR ("currentSequence" > 0 AND "currentRevisionId" IS NOT NULL AND status <> 'AWAITING_BUYER_SUBMISSION')
  ),
  CONSTRAINT "LoiNegotiation_closed_check" CHECK (
    (status IN ('TERMS_ALIGNED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'READ_ONLY')) = ("closedAt" IS NOT NULL)
    AND ((status IN ('TERMS_ALIGNED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'READ_ONLY')) = ("closedReason" IS NOT NULL))
  ),
  CONSTRAINT "LoiNegotiation_participants_differ" CHECK ("buyerUserId" <> "sellerUserId"),
  CONSTRAINT "LoiNegotiation_identity_version_check" CHECK ("propertyIdentityVersion" > 0)
);
CREATE UNIQUE INDEX "LoiNegotiation_inviteId_key" ON public."LoiNegotiation"("inviteId");
CREATE UNIQUE INDEX "LoiNegotiation_conversationId_key" ON public."LoiNegotiation"("conversationId");
CREATE UNIQUE INDEX "LoiNegotiation_currentRevisionId_key" ON public."LoiNegotiation"("currentRevisionId");
CREATE INDEX "LoiNegotiation_buyerUserId_status_updatedAt_idx" ON public."LoiNegotiation"("buyerUserId", status, "updatedAt");
CREATE INDEX "LoiNegotiation_sellerUserId_status_updatedAt_idx" ON public."LoiNegotiation"("sellerUserId", status, "updatedAt");
CREATE INDEX "LoiNegotiation_propertyId_propertyIdentityVersion_idx" ON public."LoiNegotiation"("propertyId", "propertyIdentityVersion");

CREATE TABLE public."LoiRevision" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "negotiationId" uuid NOT NULL,
  sequence integer NOT NULL,
  "parentRevisionId" uuid,
  kind public."LoiRevisionKind" NOT NULL,
  "submittedByUserId" uuid NOT NULL,
  "submittedByRole" public."LoiParticipantRole" NOT NULL,
  "schemaVersion" integer NOT NULL,
  "calculationVersion" integer NOT NULL,
  terms jsonb NOT NULL,
  "computedSummary" jsonb NOT NULL,
  "responseDeadline" timestamp(3) NOT NULL,
  "submittedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoiRevision_pkey" PRIMARY KEY (id),
  CONSTRAINT "LoiRevision_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES public."LoiNegotiation"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "LoiRevision_parentRevisionId_fkey" FOREIGN KEY ("parentRevisionId") REFERENCES public."LoiRevision"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "LoiRevision_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "LoiRevision_sequence_kind_check" CHECK (
    (sequence = 1 AND kind = 'INITIAL' AND "parentRevisionId" IS NULL AND "submittedByRole" = 'BUYER')
    OR (sequence > 1 AND kind = 'COUNTER' AND "parentRevisionId" IS NOT NULL)
  ),
  CONSTRAINT "LoiRevision_versions_check" CHECK ("schemaVersion" > 0 AND "calculationVersion" > 0),
  CONSTRAINT "LoiRevision_deadline_check" CHECK ("responseDeadline" > "submittedAt"),
  CONSTRAINT "LoiRevision_terms_schema_check" CHECK (
    jsonb_typeof(terms) = 'object'
    AND terms ->> 'schemaVersion' = "schemaVersion"::text
    AND jsonb_typeof("computedSummary") = 'object'
    AND "computedSummary" ->> 'calculationVersion' = "calculationVersion"::text
  )
);
CREATE UNIQUE INDEX "LoiRevision_negotiationId_sequence_key" ON public."LoiRevision"("negotiationId", sequence);
CREATE INDEX "LoiRevision_parentRevisionId_idx" ON public."LoiRevision"("parentRevisionId");
CREATE INDEX "LoiRevision_negotiationId_submittedAt_idx" ON public."LoiRevision"("negotiationId", "submittedAt");
CREATE INDEX "LoiRevision_submittedByUserId_submittedAt_idx" ON public."LoiRevision"("submittedByUserId", "submittedAt");

ALTER TABLE public."LoiNegotiation"
  ADD CONSTRAINT "LoiNegotiation_currentRevisionId_fkey"
  FOREIGN KEY ("currentRevisionId") REFERENCES public."LoiRevision"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE public."LoiDraft" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "negotiationId" uuid NOT NULL,
  "ownerUserId" uuid NOT NULL,
  "ownerRole" public."LoiParticipantRole" NOT NULL,
  "basedOnRevisionId" uuid,
  "basedOnSequence" integer NOT NULL,
  "schemaVersion" integer NOT NULL,
  "calculationVersion" integer NOT NULL,
  terms jsonb NOT NULL,
  "draftVersion" integer NOT NULL DEFAULT 1,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT "LoiDraft_pkey" PRIMARY KEY (id),
  CONSTRAINT "LoiDraft_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES public."LoiNegotiation"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "LoiDraft_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "LoiDraft_basedOnRevisionId_fkey" FOREIGN KEY ("basedOnRevisionId") REFERENCES public."LoiRevision"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "LoiDraft_versions_check" CHECK (
    "basedOnSequence" >= 0 AND "schemaVersion" > 0 AND "calculationVersion" > 0 AND "draftVersion" > 0
  ),
  CONSTRAINT "LoiDraft_basis_check" CHECK (
    ("basedOnSequence" = 0 AND "basedOnRevisionId" IS NULL)
    OR ("basedOnSequence" > 0 AND "basedOnRevisionId" IS NOT NULL)
  ),
  CONSTRAINT "LoiDraft_terms_schema_check" CHECK (jsonb_typeof(terms) = 'object' AND terms ->> 'schemaVersion' = "schemaVersion"::text)
);
CREATE UNIQUE INDEX "LoiDraft_negotiationId_ownerUserId_key" ON public."LoiDraft"("negotiationId", "ownerUserId");
CREATE INDEX "LoiDraft_ownerUserId_updatedAt_idx" ON public."LoiDraft"("ownerUserId", "updatedAt");
CREATE INDEX "LoiDraft_basedOnRevisionId_idx" ON public."LoiDraft"("basedOnRevisionId");

CREATE TABLE public."LoiEvent" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "negotiationId" uuid NOT NULL,
  "revisionId" uuid,
  "actorUserId" uuid,
  "actorRole" public."LoiParticipantRole",
  type public."LoiEventType" NOT NULL,
  "clientActionId" uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoiEvent_pkey" PRIMARY KEY (id),
  CONSTRAINT "LoiEvent_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES public."LoiNegotiation"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "LoiEvent_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES public."LoiRevision"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "LoiEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "LoiEvent_actor_check" CHECK (("actorUserId" IS NULL) = ("actorRole" IS NULL))
);
CREATE UNIQUE INDEX "LoiEvent_negotiationId_clientActionId_key" ON public."LoiEvent"("negotiationId", "clientActionId");
CREATE INDEX "LoiEvent_revisionId_idx" ON public."LoiEvent"("revisionId");
CREATE INDEX "LoiEvent_negotiationId_createdAt_id_idx" ON public."LoiEvent"("negotiationId", "createdAt", id);
CREATE INDEX "LoiEvent_actorUserId_createdAt_idx" ON public."LoiEvent"("actorUserId", "createdAt");

ALTER TABLE public."EmailOutbox"
  ADD COLUMN "loiNegotiationId" uuid,
  ADD COLUMN "loiRevisionId" uuid,
  ADD COLUMN "loiRecipientUserId" uuid,
  ADD CONSTRAINT "EmailOutbox_loiNegotiationId_fkey" FOREIGN KEY ("loiNegotiationId") REFERENCES public."LoiNegotiation"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "EmailOutbox_loiRevisionId_fkey" FOREIGN KEY ("loiRevisionId") REFERENCES public."LoiRevision"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "EmailOutbox_loiRecipientUserId_fkey" FOREIGN KEY ("loiRecipientUserId") REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "EmailOutbox_loi_binding_check" CHECK (
    (type LIKE 'LOI_%') = ("loiNegotiationId" IS NOT NULL AND "loiRecipientUserId" IS NOT NULL)
    AND (type LIKE 'LOI_%' OR ("loiNegotiationId" IS NULL AND "loiRevisionId" IS NULL AND "loiRecipientUserId" IS NULL))
  );
ALTER TABLE public."EmailOutbox" DROP CONSTRAINT "EmailOutbox_delivery_reference_check";
ALTER TABLE public."EmailOutbox" ADD CONSTRAINT "EmailOutbox_delivery_reference_check" CHECK (
  status IN ('SENT'::public."EmailOutboxStatus", 'CANCELLED'::public."EmailOutboxStatus")
  OR (type = 'INVITE' AND "inviteId" IS NOT NULL)
  OR (type = 'MESSAGE_UNREAD' AND "messageConversationId" IS NOT NULL AND "messageRecipientUserId" IS NOT NULL)
  OR (type = 'LOI_UPDATE' AND "loiNegotiationId" IS NOT NULL AND "loiRevisionId" IS NOT NULL AND "loiRecipientUserId" IS NOT NULL)
) NOT VALID;
ALTER TABLE public."EmailOutbox" VALIDATE CONSTRAINT "EmailOutbox_delivery_reference_check";
CREATE INDEX "EmailOutbox_loi_delivery_idx" ON public."EmailOutbox"("loiNegotiationId", "loiRecipientUserId", status, "nextAttemptAt");
CREATE INDEX "EmailOutbox_loiRevisionId_idx" ON public."EmailOutbox"("loiRevisionId");
CREATE INDEX "EmailOutbox_loiRecipientUserId_idx" ON public."EmailOutbox"("loiRecipientUserId");

CREATE OR REPLACE FUNCTION app_private.preserve_loi_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Submitted LOI revisions are immutable.' USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION app_private.preserve_loi_revision() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER loi_revision_immutable BEFORE UPDATE OR DELETE ON public."LoiRevision"
FOR EACH ROW EXECUTE FUNCTION app_private.preserve_loi_revision();

CREATE OR REPLACE FUNCTION app_private.preserve_loi_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'LOI events are immutable.' USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION app_private.preserve_loi_event() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER loi_event_immutable BEFORE UPDATE OR DELETE ON public."LoiEvent"
FOR EACH ROW EXECUTE FUNCTION app_private.preserve_loi_event();

CREATE OR REPLACE FUNCTION app_private.validate_loi_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD."inviteId" IS DISTINCT FROM NEW."inviteId"
    OR OLD."conversationId" IS DISTINCT FROM NEW."conversationId"
    OR OLD."buyerUserId" IS DISTINCT FROM NEW."buyerUserId"
    OR OLD."sellerUserId" IS DISTINCT FROM NEW."sellerUserId"
    OR OLD."propertyId" IS DISTINCT FROM NEW."propertyId"
    OR OLD."propertyIdentityVersion" IS DISTINCT FROM NEW."propertyIdentityVersion"
    OR OLD."propertySnapshot" IS DISTINCT FROM NEW."propertySnapshot"
  ) THEN
    RAISE EXCEPTION 'LOI invite, participant, property, and snapshot bindings are immutable.' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1 FROM public."Invite" invite
    JOIN public."Conversation" conversation ON conversation."inviteId" = invite.id
    JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
    JOIN public."SellerProperty" property ON property.id = invite."propertyId"
    WHERE invite.id = NEW."inviteId"
      AND conversation.id = NEW."conversationId"
      AND buyer."userId" = NEW."buyerUserId"
      AND invite."sellerId" = NEW."sellerUserId"
      AND property.id = NEW."propertyId"
      AND invite."propertyIdentityVersion" = NEW."propertyIdentityVersion"
      AND property."identityVersion" = NEW."propertyIdentityVersion"
      AND invite.status = 'ACCEPTED'
      AND conversation.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'LOI negotiation binding is not an eligible accepted invite.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.validate_loi_binding() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER loi_binding_immutable BEFORE INSERT OR UPDATE ON public."LoiNegotiation"
FOR EACH ROW EXECUTE FUNCTION app_private.validate_loi_binding();

CREATE OR REPLACE FUNCTION app_private.validate_loi_draft_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."LoiNegotiation" negotiation
    WHERE negotiation.id = NEW."negotiationId"
      AND (
        (NEW."ownerRole" = 'BUYER' AND NEW."ownerUserId" = negotiation."buyerUserId")
        OR (NEW."ownerRole" = 'SELLER' AND NEW."ownerUserId" = negotiation."sellerUserId")
      )
  ) THEN
    RAISE EXCEPTION 'LOI draft owner must be an authoritative participant.' USING ERRCODE = '23514';
  END IF;
  IF NEW."basedOnRevisionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."LoiRevision" revision
    WHERE revision.id = NEW."basedOnRevisionId"
      AND revision."negotiationId" = NEW."negotiationId"
      AND revision.sequence = NEW."basedOnSequence"
  ) THEN
    RAISE EXCEPTION 'LOI draft basis must match its negotiation and sequence.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.validate_loi_draft_owner() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER loi_draft_owner_binding BEFORE INSERT OR UPDATE ON public."LoiDraft"
FOR EACH ROW EXECUTE FUNCTION app_private.validate_loi_draft_owner();

CREATE OR REPLACE FUNCTION app_private.validate_loi_state()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE current_row public."LoiRevision"%ROWTYPE;
BEGIN
  IF NEW."currentRevisionId" IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO current_row FROM public."LoiRevision" WHERE id = NEW."currentRevisionId";
  IF current_row."negotiationId" IS DISTINCT FROM NEW.id OR current_row.sequence IS DISTINCT FROM NEW."currentSequence" THEN
    RAISE EXCEPTION 'Current LOI revision must belong to the negotiation and match its sequence.' USING ERRCODE = '23514';
  END IF;
  IF (NEW.status = 'AWAITING_SELLER_RESPONSE' AND current_row."submittedByRole" <> 'BUYER')
    OR (NEW.status = 'AWAITING_BUYER_RESPONSE' AND current_row."submittedByRole" <> 'SELLER') THEN
    RAISE EXCEPTION 'LOI waiting state does not match current revision author.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.validate_loi_state() FROM PUBLIC, anon, authenticated, service_role;
CREATE CONSTRAINT TRIGGER loi_state_consistent AFTER INSERT OR UPDATE ON public."LoiNegotiation"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.validate_loi_state();

CREATE OR REPLACE FUNCTION app_private.validate_loi_revision_chain()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  parent_row public."LoiRevision"%ROWTYPE;
  negotiation_row public."LoiNegotiation"%ROWTYPE;
BEGIN
  SELECT * INTO negotiation_row FROM public."LoiNegotiation" WHERE id = NEW."negotiationId";
  IF (NEW."submittedByRole" = 'BUYER' AND NEW."submittedByUserId" <> negotiation_row."buyerUserId")
    OR (NEW."submittedByRole" = 'SELLER' AND NEW."submittedByUserId" <> negotiation_row."sellerUserId") THEN
    RAISE EXCEPTION 'LOI revision author must be an authoritative participant.' USING ERRCODE = '23514';
  END IF;
  IF NEW.sequence = 1 THEN RETURN NEW; END IF;
  SELECT * INTO parent_row FROM public."LoiRevision" WHERE id = NEW."parentRevisionId";
  IF parent_row."negotiationId" IS DISTINCT FROM NEW."negotiationId"
    OR parent_row.sequence <> NEW.sequence - 1
    OR parent_row."submittedByRole" = NEW."submittedByRole" THEN
    RAISE EXCEPTION 'LOI counter must extend the immediately prior revision and alternate authors.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.validate_loi_revision_chain() FROM PUBLIC, anon, authenticated, service_role;
CREATE CONSTRAINT TRIGGER loi_revision_chain_consistent AFTER INSERT ON public."LoiRevision"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.validate_loi_revision_chain();

CREATE OR REPLACE FUNCTION app_private.validate_loi_event_actor()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW."actorUserId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."LoiNegotiation" negotiation
    WHERE negotiation.id = NEW."negotiationId"
      AND (
        (NEW."actorRole" = 'BUYER' AND NEW."actorUserId" = negotiation."buyerUserId")
        OR (NEW."actorRole" = 'SELLER' AND NEW."actorUserId" = negotiation."sellerUserId")
      )
  ) THEN
    RAISE EXCEPTION 'LOI event actor must be an authoritative participant.' USING ERRCODE = '23514';
  END IF;
  IF NEW."revisionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."LoiRevision" revision
    WHERE revision.id = NEW."revisionId" AND revision."negotiationId" = NEW."negotiationId"
  ) THEN
    RAISE EXCEPTION 'LOI event revision must belong to its negotiation.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.validate_loi_event_actor() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER loi_event_actor_binding BEFORE INSERT ON public."LoiEvent"
FOR EACH ROW EXECUTE FUNCTION app_private.validate_loi_event_actor();

CREATE OR REPLACE FUNCTION app_private.broadcast_loi_identifier()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.type <> 'NEGOTIATION_CREATED' THEN
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object(
          'negotiationId', NEW."negotiationId",
          'revisionId', NEW."revisionId",
          'eventId', NEW.id,
          'type', NEW.type::text
        ),
        'loi_changed',
        'loi:' || NEW."negotiationId"::text,
        true
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'LOI Realtime hint failed with SQLSTATE %', SQLSTATE;
    END;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.broadcast_loi_identifier() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER loi_event_broadcast AFTER INSERT ON public."LoiEvent"
FOR EACH ROW EXECUTE FUNCTION app_private.broadcast_loi_identifier();

CREATE OR REPLACE FUNCTION app_private.can_join_loi_topic(topic_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE negotiation_id uuid; caller_id uuid;
BEGIN
  IF topic_name !~ '^loi:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  negotiation_id := substring(topic_name FROM 5)::uuid;
  caller_id := auth.uid();
  IF caller_id IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public."LoiNegotiation" negotiation
    JOIN public."User" caller ON caller.id = caller_id AND caller.status = 'ACTIVE'
    WHERE negotiation.id = negotiation_id
      AND caller_id IN (negotiation."buyerUserId", negotiation."sellerUserId")
  );
END;
$$;
REVOKE ALL ON FUNCTION app_private.can_join_loi_topic(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_join_loi_topic(text) TO authenticated;

ALTER TABLE public."LoiNegotiation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LoiDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LoiRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LoiEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."LoiNegotiation", public."LoiDraft", public."LoiRevision", public."LoiEvent"
FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS "Active participants can receive conversation broadcasts" ON realtime.messages;
CREATE POLICY "Active participants can receive conversation broadcasts" ON realtime.messages
FOR SELECT TO authenticated USING (
  realtime.messages.extension = 'broadcast'
  AND (
    (SELECT app_private.can_join_conversation_topic((SELECT realtime.topic())))
    OR (SELECT app_private.can_join_loi_topic((SELECT realtime.topic())))
  )
);

COMMIT;
