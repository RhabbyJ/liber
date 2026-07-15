-- Guided Messaging V1 is invite-scoped. PostgreSQL remains authoritative;
-- Realtime emits identifier-only private delivery hints after message commits.

BEGIN;

UPDATE public."Invite"
SET "expiresAt" = "sentAt" + interval '30 days'
WHERE "expiresAt" IS NULL;

UPDATE public."Invite"
SET status = 'EXPIRED', "updatedAt" = now()
WHERE status IN ('SENT', 'VIEWED')
  AND "expiresAt" <= now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."Invite"
    WHERE regexp_replace(
      regexp_replace(
        replace(replace(message, E'\r\n', E'\n'), E'\r', E'\n'),
        '^[[:space:]]+', ''
      ),
      '[[:space:]]+$', ''
    ) = ''
      OR char_length(regexp_replace(
        regexp_replace(
          replace(replace(message, E'\r\n', E'\n'), E'\r', E'\n'),
          '^[[:space:]]+', ''
        ),
        '[[:space:]]+$', ''
      )) > 2000
  ) THEN
    RAISE EXCEPTION 'Guided messaging migration blocked: every legacy invite message must contain 1-2000 trimmed characters.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."Invite" invite
    JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
    WHERE invite."sellerId" = buyer."userId"
  ) THEN
    RAISE EXCEPTION 'Guided messaging migration blocked: a legacy self-invite cannot produce two distinct participants.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."Invite"
    WHERE status IN ('SENT', 'VIEWED', 'ACCEPTED')
    GROUP BY "sellerId", "buyerProfileId", "propertyId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Guided messaging migration blocked: duplicate active or accepted invites require explicit review.'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

UPDATE public."Invite"
SET message = regexp_replace(
  regexp_replace(
    replace(replace(message, E'\r\n', E'\n'), E'\r', E'\n'),
    '^[[:space:]]+', ''
  ),
  '[[:space:]]+$', ''
)
WHERE message IS DISTINCT FROM regexp_replace(
  regexp_replace(
    replace(replace(message, E'\r\n', E'\n'), E'\r', E'\n'),
    '^[[:space:]]+', ''
  ),
  '[[:space:]]+$', ''
);

ALTER TABLE public."Invite"
  ADD COLUMN "openingTemplateKey" text,
  ADD COLUMN "openingTemplateVersion" integer,
  ADD COLUMN "openingNote" text,
  ALTER COLUMN "expiresAt" SET NOT NULL,
  ADD CONSTRAINT "Invite_message_length_check" CHECK (
    char_length(message) BETWEEN 1 AND 2000
    AND position(E'\r' IN message) = 0
    AND message = regexp_replace(
      regexp_replace(message, '^[[:space:]]+', ''),
      '[[:space:]]+$', ''
    )
  ),
  ADD CONSTRAINT "Invite_opening_template_check" CHECK (
    (
      "openingTemplateKey" IS NULL
      AND "openingTemplateVersion" IS NULL
      AND "openingNote" IS NULL
    ) OR (
      "openingTemplateKey" IS NOT NULL
      AND "openingTemplateKey" IN (
        'SELLER_PRIVATE_VIEWING',
        'SELLER_MORE_DETAILS',
        'SELLER_TIMING_AND_PLANS',
        'SELLER_NEXT_STEPS'
      )
      AND "openingTemplateVersion" = 1
      AND (
        "openingNote" IS NULL
        OR (
          char_length("openingNote") BETWEEN 1 AND 500
          AND position(E'\r' IN "openingNote") = 0
          AND "openingNote" = regexp_replace(
            regexp_replace("openingNote", '^[[:space:]]+', ''),
            '[[:space:]]+$', ''
          )
        )
      )
    )
  );

DROP INDEX IF EXISTS public."Invite_active_seller_buyer_property_key";
CREATE UNIQUE INDEX "Invite_active_seller_buyer_property_key"
  ON public."Invite"("sellerId", "buyerProfileId", "propertyId")
  WHERE status IN ('SENT', 'VIEWED', 'ACCEPTED');

CREATE TYPE public."ConversationStatus" AS ENUM (
  'AWAITING_BUYER', 'ACTIVE', 'READ_ONLY', 'BLOCKED'
);

CREATE TYPE public."ConversationClosedReason" AS ENUM (
  'INVITE_DECLINED',
  'INVITE_EXPIRED',
  'INVITE_WITHDRAWN',
  'PROPERTY_IDENTITY_CHANGED',
  'PROPERTY_INELIGIBLE',
  'SELLER_INELIGIBLE',
  'BUYER_INELIGIBLE',
  'USER_SUSPENDED',
  'USER_BLOCKED'
);

CREATE TYPE public."ConversationParticipantRole" AS ENUM ('SELLER', 'BUYER');
CREATE TYPE public."MessageKind" AS ENUM ('INVITE', 'GUIDED', 'FREE_TEXT', 'SYSTEM');
CREATE TYPE public."MessageModerationStatus" AS ENUM ('ALLOWED', 'FLAGGED', 'REDACTED');
CREATE TYPE public."MessageReportCategory" AS ENUM (
  'HARASSMENT_OR_THREAT',
  'DISCRIMINATORY_CONTENT',
  'FRAUD_OR_SCAM',
  'SPAM',
  'SENSITIVE_INFORMATION_REQUEST',
  'OFF_PLATFORM_PAYMENT_REQUEST',
  'OTHER'
);
CREATE TYPE public."MessageReportStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'ACTIONED', 'DISMISSED');

CREATE TABLE public."Conversation" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "inviteId" text NOT NULL,
  status public."ConversationStatus" NOT NULL DEFAULT 'AWAITING_BUYER',
  "closedReason" public."ConversationClosedReason",
  "propertySnapshot" jsonb NOT NULL,
  "lastMessageAt" timestamp(3) NOT NULL,
  "moderationUpdatedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "Conversation_pkey" PRIMARY KEY (id),
  CONSTRAINT "Conversation_inviteId_fkey"
    FOREIGN KEY ("inviteId") REFERENCES public."Invite"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "Conversation_status_reason_check" CHECK (
    (status IN ('AWAITING_BUYER', 'ACTIVE') AND "closedReason" IS NULL)
    OR (
      status = 'READ_ONLY'
      AND "closedReason" IS NOT NULL
      AND "closedReason" <> 'USER_BLOCKED'
    )
    OR (status = 'BLOCKED' AND "closedReason" = 'USER_BLOCKED')
  )
);

CREATE UNIQUE INDEX "Conversation_inviteId_key" ON public."Conversation"("inviteId");
CREATE INDEX "Conversation_status_lastMessageAt_idx"
  ON public."Conversation"(status, "lastMessageAt");
CREATE INDEX "Conversation_lastMessageAt_id_idx"
  ON public."Conversation"("lastMessageAt", id);

CREATE TABLE public."ConversationParticipant" (
  "conversationId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  role public."ConversationParticipantRole" NOT NULL,
  "lastReadMessageId" uuid,
  "lastReadAt" timestamp(3),
  "mutedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("conversationId", "userId"),
  CONSTRAINT "ConversationParticipant_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ConversationParticipant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ConversationParticipant_read_marker_pair_check" CHECK (
    ("lastReadMessageId" IS NULL AND "lastReadAt" IS NULL)
    OR ("lastReadMessageId" IS NOT NULL AND "lastReadAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "ConversationParticipant_conversationId_role_key"
  ON public."ConversationParticipant"("conversationId", role);
CREATE INDEX "ConversationParticipant_userId_conversationId_idx"
  ON public."ConversationParticipant"("userId", "conversationId");
CREATE INDEX "ConversationParticipant_conversationId_lastReadMessageId_idx"
  ON public."ConversationParticipant"("conversationId", "lastReadMessageId");

CREATE TABLE public."Message" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "conversationId" uuid NOT NULL,
  "senderUserId" uuid,
  kind public."MessageKind" NOT NULL,
  "templateKey" text,
  "templateVersion" integer,
  body text NOT NULL,
  "clientMessageId" uuid NOT NULL,
  "moderationStatus" public."MessageModerationStatus" NOT NULL DEFAULT 'ALLOWED',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "Message_pkey" PRIMARY KEY (id),
  CONSTRAINT "Message_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "Message_sender_participant_fkey"
    FOREIGN KEY ("conversationId", "senderUserId")
    REFERENCES public."ConversationParticipant"("conversationId", "userId")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "Message_body_length_check" CHECK (
    char_length(body) BETWEEN 1 AND 2000
    AND position(E'\r' IN body) = 0
    AND body = regexp_replace(
      regexp_replace(body, '^[[:space:]]+', ''),
      '[[:space:]]+$', ''
    )
  ),
  CONSTRAINT "Message_template_version_check" CHECK (
    "templateVersion" IS NULL OR "templateVersion" >= 1
  ),
  CONSTRAINT "Message_kind_shape_check" CHECK (
    (
      kind = 'SYSTEM'
      AND "senderUserId" IS NULL
      AND "templateKey" IS NULL
      AND "templateVersion" IS NULL
    ) OR (
      kind = 'GUIDED'
      AND "senderUserId" IS NOT NULL
      AND "templateKey" IS NOT NULL
      AND btrim("templateKey") <> ''
      AND "templateVersion" IS NOT NULL
    ) OR (
      kind = 'FREE_TEXT'
      AND "senderUserId" IS NOT NULL
      AND "templateKey" IS NULL
      AND "templateVersion" IS NULL
    ) OR (
      kind = 'INVITE'
      AND "senderUserId" IS NOT NULL
      AND (
        ("templateKey" IS NULL AND "templateVersion" IS NULL)
        OR (
          "templateKey" IN (
            'SELLER_PRIVATE_VIEWING',
            'SELLER_MORE_DETAILS',
            'SELLER_TIMING_AND_PLANS',
            'SELLER_NEXT_STEPS'
          )
          AND "templateVersion" = 1
        )
      )
    )
  )
);

CREATE UNIQUE INDEX "Message_conversationId_clientMessageId_key"
  ON public."Message"("conversationId", "clientMessageId");
CREATE UNIQUE INDEX "Message_conversationId_id_key"
  ON public."Message"("conversationId", id);
CREATE UNIQUE INDEX "Message_one_invite_per_conversation_key"
  ON public."Message"("conversationId")
  WHERE kind = 'INVITE';
CREATE INDEX "Message_conversationId_senderUserId_idx"
  ON public."Message"("conversationId", "senderUserId");
CREATE INDEX "Message_conversationId_createdAt_id_idx"
  ON public."Message"("conversationId", "createdAt" DESC, id DESC);
CREATE INDEX "Message_senderUserId_createdAt_idx"
  ON public."Message"("senderUserId", "createdAt");

ALTER TABLE public."ConversationParticipant"
  ADD CONSTRAINT "ConversationParticipant_lastReadMessage_fkey"
  FOREIGN KEY ("conversationId", "lastReadMessageId")
  REFERENCES public."Message"("conversationId", id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE public."UserBlock" (
  "blockerUserId" uuid NOT NULL,
  "blockedUserId" uuid NOT NULL,
  reason text,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerUserId", "blockedUserId"),
  CONSTRAINT "UserBlock_blockerUserId_fkey"
    FOREIGN KEY ("blockerUserId") REFERENCES public."User"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "UserBlock_blockedUserId_fkey"
    FOREIGN KEY ("blockedUserId") REFERENCES public."User"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "UserBlock_distinct_users_check" CHECK ("blockerUserId" <> "blockedUserId"),
  CONSTRAINT "UserBlock_reason_length_check" CHECK (
    reason IS NULL OR (
      char_length(reason) BETWEEN 1 AND 500
      AND position(E'\r' IN reason) = 0
      AND reason = regexp_replace(
        regexp_replace(reason, '^[[:space:]]+', ''),
        '[[:space:]]+$', ''
      )
    )
  )
);

CREATE INDEX "UserBlock_blockedUserId_blockerUserId_idx"
  ON public."UserBlock"("blockedUserId", "blockerUserId");

CREATE TABLE public."MessageReport" (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "reporterUserId" uuid NOT NULL,
  "reportedUserId" uuid NOT NULL,
  "conversationId" uuid NOT NULL,
  "messageId" uuid NOT NULL,
  category public."MessageReportCategory" NOT NULL,
  details text,
  "evidenceBodySnapshot" text NOT NULL,
  "evidenceContext" jsonb NOT NULL,
  status public."MessageReportStatus" NOT NULL DEFAULT 'OPEN',
  "reviewedByUserId" uuid,
  "reviewedAt" timestamp(3),
  resolution text,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "MessageReport_pkey" PRIMARY KEY (id),
  CONSTRAINT "MessageReport_reporterUserId_fkey"
    FOREIGN KEY ("reporterUserId") REFERENCES public."User"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "MessageReport_reportedUserId_fkey"
    FOREIGN KEY ("reportedUserId") REFERENCES public."User"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "MessageReport_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "MessageReport_message_fkey"
    FOREIGN KEY ("conversationId", "messageId")
    REFERENCES public."Message"("conversationId", id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "MessageReport_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES public."User"(id)
    ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "MessageReport_details_length_check" CHECK (
    details IS NULL OR (
      char_length(details) BETWEEN 1 AND 2000
      AND position(E'\r' IN details) = 0
      AND details = regexp_replace(
        regexp_replace(details, '^[[:space:]]+', ''),
        '[[:space:]]+$', ''
      )
    )
  ),
  CONSTRAINT "MessageReport_evidence_body_check" CHECK (
    char_length("evidenceBodySnapshot") BETWEEN 1 AND 2000
    AND position(E'\r' IN "evidenceBodySnapshot") = 0
    AND "evidenceBodySnapshot" = regexp_replace(
      regexp_replace("evidenceBodySnapshot", '^[[:space:]]+', ''),
      '[[:space:]]+$', ''
    )
  ),
  CONSTRAINT "MessageReport_resolution_length_check" CHECK (
    resolution IS NULL OR (
      char_length(resolution) BETWEEN 1 AND 2000
      AND position(E'\r' IN resolution) = 0
      AND resolution = regexp_replace(
        regexp_replace(resolution, '^[[:space:]]+', ''),
        '[[:space:]]+$', ''
      )
    )
  ),
  CONSTRAINT "MessageReport_distinct_users_check" CHECK (
    "reporterUserId" <> "reportedUserId"
  ),
  CONSTRAINT "MessageReport_evidence_context_check" CHECK (
    jsonb_typeof("evidenceContext") IN ('object', 'array')
  ),
  CONSTRAINT "MessageReport_review_shape_check" CHECK (
    (
      status = 'OPEN'
      AND "reviewedByUserId" IS NULL
      AND "reviewedAt" IS NULL
      AND resolution IS NULL
    ) OR (
      status = 'IN_REVIEW'
      AND "reviewedByUserId" IS NOT NULL
      AND "reviewedAt" IS NOT NULL
      AND resolution IS NULL
    ) OR (
      status IN ('ACTIONED', 'DISMISSED')
      AND "reviewedByUserId" IS NOT NULL
      AND "reviewedAt" IS NOT NULL
      AND resolution IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX "MessageReport_reporterUserId_messageId_key"
  ON public."MessageReport"("reporterUserId", "messageId");
CREATE INDEX "MessageReport_conversationId_messageId_idx"
  ON public."MessageReport"("conversationId", "messageId");
CREATE INDEX "MessageReport_conversationId_createdAt_idx"
  ON public."MessageReport"("conversationId", "createdAt");
CREATE INDEX "MessageReport_messageId_idx" ON public."MessageReport"("messageId");
CREATE INDEX "MessageReport_reportedUserId_createdAt_idx"
  ON public."MessageReport"("reportedUserId", "createdAt");
CREATE INDEX "MessageReport_reviewedByUserId_idx"
  ON public."MessageReport"("reviewedByUserId");
CREATE INDEX "MessageReport_status_createdAt_idx"
  ON public."MessageReport"(status, "createdAt");

ALTER TABLE public."EmailOutbox"
  ADD COLUMN "messageConversationId" uuid,
  ADD COLUMN "messageRecipientUserId" uuid,
  ADD CONSTRAINT "EmailOutbox_messageConversationId_fkey"
    FOREIGN KEY ("messageConversationId") REFERENCES public."Conversation"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "EmailOutbox_messageRecipientUserId_fkey"
    FOREIGN KEY ("messageRecipientUserId") REFERENCES public."User"(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "EmailOutbox_messageConversationId_idx"
  ON public."EmailOutbox"("messageConversationId");
CREATE INDEX "EmailOutbox_messageRecipientUserId_idx"
  ON public."EmailOutbox"("messageRecipientUserId");
CREATE INDEX "EmailOutbox_messageConversationId_messageRecipientUserId_status_nextAttemptAt_idx"
  ON public."EmailOutbox"(
    "messageConversationId", "messageRecipientUserId", status, "nextAttemptAt"
  );

INSERT INTO public."Conversation" (
  "inviteId", status, "closedReason", "propertySnapshot",
  "lastMessageAt", "createdAt", "updatedAt"
)
SELECT
  invite.id,
  CASE
    WHEN invite.status = 'ACCEPTED'
      AND seller.status = 'ACTIVE'
      AND buyer_user.status = 'ACTIVE'
      AND 'BUYER'::public."UserRole" = ANY(buyer_user.roles)
      AND buyer."visibilityStatus" = 'ACTIVE'
      AND (
        'ADMIN'::public."UserRole" = ANY(seller.roles)
        OR (
          'SELLER'::public."UserRole" = ANY(seller.roles)
          AND coalesce(seller_access.status = 'APPROVED', false)
        )
      )
      AND property."ownerUserId" = invite."sellerId"
      AND property.status = 'READY_FOR_INVITES'
      AND property."ownershipVerificationStatus" = 'APPROVED'
      AND property."flaggedForReviewAt" IS NULL
      AND property."authorityAttestedIdentityVersion" = property."identityVersion"
      AND invite."propertyIdentityVersion" = property."identityVersion"
      THEN 'ACTIVE'::public."ConversationStatus"
    WHEN invite.status IN ('SENT', 'VIEWED')
      AND seller.status = 'ACTIVE'
      AND buyer_user.status = 'ACTIVE'
      AND 'BUYER'::public."UserRole" = ANY(buyer_user.roles)
      AND buyer."visibilityStatus" = 'ACTIVE'
      AND (
        'ADMIN'::public."UserRole" = ANY(seller.roles)
        OR (
          'SELLER'::public."UserRole" = ANY(seller.roles)
          AND coalesce(seller_access.status = 'APPROVED', false)
        )
      )
      AND property."ownerUserId" = invite."sellerId"
      AND property.status = 'READY_FOR_INVITES'
      AND property."ownershipVerificationStatus" = 'APPROVED'
      AND property."flaggedForReviewAt" IS NULL
      AND property."authorityAttestedIdentityVersion" = property."identityVersion"
      AND invite."propertyIdentityVersion" = property."identityVersion"
      THEN 'AWAITING_BUYER'::public."ConversationStatus"
    ELSE 'READ_ONLY'::public."ConversationStatus"
  END,
  CASE
    WHEN invite.status = 'DECLINED' THEN 'INVITE_DECLINED'::public."ConversationClosedReason"
    WHEN invite.status = 'EXPIRED' THEN 'INVITE_EXPIRED'::public."ConversationClosedReason"
    WHEN invite."propertyIdentityVersion" <> property."identityVersion"
      THEN 'PROPERTY_IDENTITY_CHANGED'::public."ConversationClosedReason"
    WHEN invite.status = 'WITHDRAWN' THEN 'INVITE_WITHDRAWN'::public."ConversationClosedReason"
    WHEN seller.status <> 'ACTIVE' OR buyer_user.status <> 'ACTIVE'
      THEN 'USER_SUSPENDED'::public."ConversationClosedReason"
    WHEN NOT (
      'ADMIN'::public."UserRole" = ANY(seller.roles)
      OR (
        'SELLER'::public."UserRole" = ANY(seller.roles)
        AND coalesce(seller_access.status = 'APPROVED', false)
      )
    ) THEN 'SELLER_INELIGIBLE'::public."ConversationClosedReason"
    WHEN NOT ('BUYER'::public."UserRole" = ANY(buyer_user.roles))
      OR buyer."visibilityStatus" <> 'ACTIVE'
      THEN 'BUYER_INELIGIBLE'::public."ConversationClosedReason"
    WHEN property."ownerUserId" <> invite."sellerId"
      OR property.status <> 'READY_FOR_INVITES'
      OR property."ownershipVerificationStatus" <> 'APPROVED'
      OR property."flaggedForReviewAt" IS NOT NULL
      OR property."authorityAttestedIdentityVersion" IS DISTINCT FROM property."identityVersion"
      THEN 'PROPERTY_INELIGIBLE'::public."ConversationClosedReason"
    ELSE NULL
  END,
  CASE
    WHEN property."ownerUserId" = invite."sellerId"
      AND invite."propertyIdentityVersion" = property."identityVersion" THEN
      jsonb_strip_nulls(jsonb_build_object(
        'title', invite.title,
        'propertyIdentityVersion', invite."propertyIdentityVersion",
        'propertyType', property."propertyType",
        'addressLine1', property."addressLine1",
        'addressLine2', property."addressLine2",
        'city', property.city,
        'state', property.state,
        'zip', property.zip,
        'location', concat_ws(', ',
          nullif(btrim(concat_ws(' ', property."addressLine1", property."addressLine2")), ''),
          nullif(btrim(property.city), ''),
          nullif(btrim(property.state), ''),
          nullif(btrim(property.zip), '')
        ),
        'bedrooms', property.bedrooms,
        'bathrooms', property.bathrooms,
        'squareFeet', property."squareFeet",
        'condition', property.condition,
        'features', property.features,
        'price', property.price,
        'ownershipVerificationStatus', property."ownershipVerificationStatus",
        'propertyStatus', property.status
      ))
    ELSE jsonb_build_object(
      'propertyIdentityVersion', invite."propertyIdentityVersion",
      'contextUnavailable', true
    )
  END,
  invite."sentAt",
  invite."sentAt",
  invite."sentAt"
FROM public."Invite" invite
JOIN public."SellerProperty" property ON property.id = invite."propertyId"
JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
JOIN public."User" buyer_user ON buyer_user.id = buyer."userId"
JOIN public."User" seller ON seller.id = invite."sellerId"
LEFT JOIN public."SellerAccess" seller_access ON seller_access."userId" = invite."sellerId";

INSERT INTO public."ConversationParticipant" (
  "conversationId", "userId", role, "createdAt"
)
SELECT conversation.id, invite."sellerId",
  'SELLER'::public."ConversationParticipantRole", conversation."createdAt"
FROM public."Conversation" conversation
JOIN public."Invite" invite ON invite.id = conversation."inviteId"
UNION ALL
SELECT conversation.id, buyer."userId",
  'BUYER'::public."ConversationParticipantRole", conversation."createdAt"
FROM public."Conversation" conversation
JOIN public."Invite" invite ON invite.id = conversation."inviteId"
JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId";

INSERT INTO public."Message" (
  "conversationId", "senderUserId", kind, "templateKey", "templateVersion",
  body, "clientMessageId", "moderationStatus", "createdAt"
)
SELECT
  conversation.id,
  invite."sellerId",
  'INVITE',
  invite."openingTemplateKey",
  invite."openingTemplateVersion",
  btrim(invite.message),
  gen_random_uuid(),
  'ALLOWED',
  invite."sentAt"
FROM public."Conversation" conversation
JOIN public."Invite" invite ON invite.id = conversation."inviteId";

UPDATE public."EmailOutbox"
SET payload = '{}'::jsonb, "updatedAt" = now()
WHERE type IN ('INVITE', 'MESSAGE_UNREAD') AND payload <> '{}'::jsonb;

ALTER TABLE public."EmailOutbox"
  ADD CONSTRAINT "EmailOutbox_messaging_payload_content_free_check" CHECK (
    type NOT IN ('INVITE', 'MESSAGE_UNREAD') OR payload = '{}'::jsonb
  ),
  ADD CONSTRAINT "EmailOutbox_unread_message_references_check" CHECK (
    type <> 'MESSAGE_UNREAD'
    OR (
      "messageConversationId" IS NOT NULL
      AND "messageRecipientUserId" IS NOT NULL
    )
  );

UPDATE public."ConversationParticipant" participant
SET "lastReadMessageId" = message.id,
    "lastReadAt" = message."createdAt"
FROM public."Message" message
WHERE message."conversationId" = participant."conversationId"
  AND message.kind = 'INVITE'
  AND participant.role = 'SELLER';

UPDATE public."ConversationParticipant" participant
SET "lastReadMessageId" = message.id,
    "lastReadAt" = greatest(
      message."createdAt",
      coalesce(invite."respondedAt", invite."viewedAt", message."createdAt")
    )
FROM public."Message" message
JOIN public."Conversation" conversation ON conversation.id = message."conversationId"
JOIN public."Invite" invite ON invite.id = conversation."inviteId"
WHERE participant."conversationId" = conversation.id
  AND participant.role = 'BUYER'
  AND message.kind = 'INVITE'
  AND (invite."viewedAt" IS NOT NULL OR invite."respondedAt" IS NOT NULL);

CREATE TRIGGER conversation_updated_at
BEFORE UPDATE ON public."Conversation"
FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER message_report_updated_at
BEFORE UPDATE ON public."MessageReport"
FOR EACH ROW EXECUTE FUNCTION app_private.set_updated_at();

CREATE OR REPLACE FUNCTION app_private.assert_conversation_participants(
  p_conversation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  participant_count integer;
  seller_count integer;
  buyer_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."Conversation" WHERE id = p_conversation_id
  ) THEN
    RETURN;
  END IF;

  SELECT
    count(participant."userId"),
    count(*) FILTER (
      WHERE participant.role = 'SELLER'
        AND participant."userId" = invite."sellerId"
    ),
    count(*) FILTER (
      WHERE participant.role = 'BUYER'
        AND participant."userId" = buyer."userId"
    )
  INTO participant_count, seller_count, buyer_count
  FROM public."Conversation" conversation
  JOIN public."Invite" invite ON invite.id = conversation."inviteId"
  JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
  LEFT JOIN public."ConversationParticipant" participant
    ON participant."conversationId" = conversation.id
  WHERE conversation.id = p_conversation_id
  GROUP BY conversation.id;

  IF participant_count <> 2 OR seller_count <> 1 OR buyer_count <> 1 THEN
    RAISE EXCEPTION 'Conversation % must have exactly the invite seller and buyer owner as participants.', p_conversation_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app_private.assert_conversation_participants(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.enforce_conversation_participants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conversation_id uuid;
  affected record;
BEGIN
  IF TG_TABLE_NAME = 'Conversation' THEN
    conversation_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    PERFORM app_private.assert_conversation_participants(conversation_id);
  ELSIF TG_TABLE_NAME = 'ConversationParticipant' THEN
    conversation_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD."conversationId"
      ELSE NEW."conversationId"
    END;
    PERFORM app_private.assert_conversation_participants(conversation_id);
    IF TG_OP = 'UPDATE' AND OLD."conversationId" IS DISTINCT FROM NEW."conversationId" THEN
      PERFORM app_private.assert_conversation_participants(OLD."conversationId");
    END IF;
  ELSIF TG_TABLE_NAME = 'Invite' THEN
    FOR affected IN
      SELECT id FROM public."Conversation"
      WHERE "inviteId" = CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
    LOOP
      PERFORM app_private.assert_conversation_participants(affected.id);
    END LOOP;
  ELSIF TG_TABLE_NAME = 'BuyerProfile' THEN
    FOR affected IN
      SELECT conversation.id
      FROM public."Conversation" conversation
      JOIN public."Invite" invite ON invite.id = conversation."inviteId"
      WHERE invite."buyerProfileId" = CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
    LOOP
      PERFORM app_private.assert_conversation_participants(affected.id);
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_conversation_participants()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER conversation_participants_from_invite
AFTER INSERT OR UPDATE ON public."Conversation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_conversation_participants();

CREATE CONSTRAINT TRIGGER conversation_participant_cardinality
AFTER INSERT OR UPDATE OR DELETE ON public."ConversationParticipant"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_conversation_participants();

CREATE CONSTRAINT TRIGGER conversation_participants_follow_invite
AFTER UPDATE ON public."Invite"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_conversation_participants();

CREATE CONSTRAINT TRIGGER conversation_buyer_participant_follows_owner
AFTER UPDATE ON public."BuyerProfile"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_conversation_participants();

CREATE OR REPLACE FUNCTION app_private.validate_participant_read_marker()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."lastReadMessageId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public."Message" message
    WHERE message.id = NEW."lastReadMessageId"
      AND message."conversationId" = NEW."conversationId"
      AND message."createdAt" <= NEW."lastReadAt"
  ) THEN
    RAISE EXCEPTION 'Conversation read marker must reference a message in the same conversation at or before lastReadAt.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.validate_participant_read_marker()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER conversation_participant_read_marker
BEFORE INSERT OR UPDATE OF "lastReadMessageId", "lastReadAt"
ON public."ConversationParticipant"
FOR EACH ROW EXECUTE FUNCTION app_private.validate_participant_read_marker();

CREATE OR REPLACE FUNCTION app_private.enforce_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conversation_status public."ConversationStatus";
  participant_role public."ConversationParticipantRole";
  invite_id text;
  invite_status public."InviteStatus";
  invite_sent_at timestamp(3);
  invite_expires_at timestamp(3);
  seller_id uuid;
  buyer_user_id uuid;
  seller_status public."UserStatus";
  buyer_status public."UserStatus";
  buyer_has_role boolean;
  buyer_visibility public."BuyerVisibilityStatus";
  seller_approved boolean;
  property_valid boolean;
  recent_conversation_messages integer;
  recent_sender_messages integer;
BEGIN
  IF NEW.kind = 'SYSTEM' THEN
    RETURN NEW;
  END IF;

  IF NEW.kind = 'INVITE' THEN
    SELECT invite."sellerId"
    INTO seller_id
    FROM public."Conversation" conversation
    JOIN public."Invite" invite ON invite.id = conversation."inviteId"
    WHERE conversation.id = NEW."conversationId";

    IF NEW."senderUserId" IS DISTINCT FROM seller_id THEN
      RAISE EXCEPTION 'Invite message sender must be the invite seller.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."senderUserId" IS NULL THEN
    RAISE EXCEPTION 'Guided and free-text messages require a participant sender.'
      USING ERRCODE = '23514';
  END IF;

  SELECT invite.id, invite."sellerId", buyer."userId"
  INTO invite_id, seller_id, buyer_user_id
  FROM public."Conversation" conversation
  JOIN public."Invite" invite ON invite.id = conversation."inviteId"
  JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
  WHERE conversation.id = NEW."conversationId";

  IF seller_id IS NULL OR buyer_user_id IS NULL THEN
    RAISE EXCEPTION 'Conversation is unavailable.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'messaging-pair:'
      || least(seller_id, buyer_user_id)::text
      || ':'
      || greatest(seller_id, buyer_user_id)::text,
    0
  ));

  PERFORM invite.id
  FROM public."Invite" invite
  WHERE invite.id = invite_id
  FOR UPDATE;

  SELECT
    conversation.status,
    participant.role,
    invite.status,
    invite."sentAt",
    invite."expiresAt",
    invite."sellerId",
    buyer."userId",
    seller.status,
    buyer_user.status,
    'BUYER'::public."UserRole" = ANY(buyer_user.roles),
    buyer."visibilityStatus",
    (
      'ADMIN'::public."UserRole" = ANY(seller.roles)
      OR (
        'SELLER'::public."UserRole" = ANY(seller.roles)
        AND EXISTS (
          SELECT 1 FROM public."SellerAccess" access
          WHERE access."userId" = invite."sellerId"
            AND access.status = 'APPROVED'
        )
      )
    ),
    (
      property."ownerUserId" = invite."sellerId"
      AND property.status = 'READY_FOR_INVITES'
      AND property."ownershipVerificationStatus" = 'APPROVED'
      AND property."flaggedForReviewAt" IS NULL
      AND property."authorityAttestedIdentityVersion" = property."identityVersion"
      AND invite."propertyIdentityVersion" = property."identityVersion"
    )
  INTO
    conversation_status,
    participant_role,
    invite_status,
    invite_sent_at,
    invite_expires_at,
    seller_id,
    buyer_user_id,
    seller_status,
    buyer_status,
    buyer_has_role,
    buyer_visibility,
    seller_approved,
    property_valid
  FROM public."Conversation" conversation
  JOIN public."ConversationParticipant" participant
    ON participant."conversationId" = conversation.id
   AND participant."userId" = NEW."senderUserId"
  JOIN public."Invite" invite ON invite.id = conversation."inviteId"
  JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
  JOIN public."User" seller ON seller.id = invite."sellerId"
  JOIN public."User" buyer_user ON buyer_user.id = buyer."userId"
  JOIN public."SellerProperty" property ON property.id = invite."propertyId"
  WHERE conversation.id = NEW."conversationId"
  FOR UPDATE OF conversation;

  IF participant_role IS NULL THEN
    RAISE EXCEPTION 'Conversation is unavailable.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('messaging-sender:' || NEW."senderUserId"::text, 0)
  );

  IF NEW.kind = 'GUIDED' AND (
    NEW."templateVersion" <> 1
    OR (
      participant_role = 'SELLER'
      AND NEW."templateKey" NOT IN (
        'SELLER_PRIVATE_VIEWING',
        'SELLER_MORE_DETAILS',
        'SELLER_TIMING_AND_PLANS',
        'SELLER_NEXT_STEPS'
      )
    )
    OR (
      participant_role = 'BUYER'
      AND NEW."templateKey" NOT IN (
        'BUYER_SCHEDULE_VIEWING',
        'BUYER_MORE_DETAILS',
        'BUYER_PROPERTY_CONDITION',
        'BUYER_INTERESTED_QUESTIONS',
        'BUYER_NOT_A_FIT'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Guided message template is unavailable.' USING ERRCODE = '23514';
  END IF;

  IF conversation_status NOT IN ('AWAITING_BUYER', 'ACTIVE')
    OR seller_status IS DISTINCT FROM 'ACTIVE'
    OR buyer_status IS DISTINCT FROM 'ACTIVE'
    OR buyer_has_role IS NOT TRUE
    OR buyer_visibility IS DISTINCT FROM 'ACTIVE'
    OR seller_approved IS NOT TRUE
    OR property_valid IS NOT TRUE THEN
    RAISE EXCEPTION 'Conversation is unavailable.' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."UserBlock" block
    WHERE (
      block."blockerUserId" = seller_id
      AND block."blockedUserId" = buyer_user_id
    ) OR (
      block."blockerUserId" = buyer_user_id
      AND block."blockedUserId" = seller_id
    )
  ) THEN
    RAISE EXCEPTION 'Conversation is unavailable.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    invite_status = 'ACCEPTED'
    OR (
      invite_status IN ('SENT', 'VIEWED')
      AND invite_expires_at > clock_timestamp()
    )
  ) THEN
    RAISE EXCEPTION 'Conversation is unavailable.' USING ERRCODE = '42501';
  END IF;

  IF participant_role = 'SELLER' AND conversation_status = 'AWAITING_BUYER' THEN
    IF NEW.kind <> 'GUIDED'
      OR clock_timestamp() < invite_sent_at + interval '24 hours'
      OR EXISTS (
        SELECT 1 FROM public."Message" message
        WHERE message."conversationId" = NEW."conversationId"
          AND message."senderUserId" = NEW."senderUserId"
          AND message.kind IN ('GUIDED', 'FREE_TEXT')
      ) THEN
      RAISE EXCEPTION 'Seller follow-up is unavailable.' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT count(*) INTO recent_conversation_messages
  FROM public."Message"
  WHERE "conversationId" = NEW."conversationId"
    AND kind IN ('GUIDED', 'FREE_TEXT')
    AND "createdAt" >= clock_timestamp() - interval '1 hour';

  IF recent_conversation_messages >= 120 THEN
    RAISE EXCEPTION 'Conversation message limit reached.' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO recent_sender_messages
  FROM public."Message"
  WHERE "senderUserId" = NEW."senderUserId"
    AND kind IN ('GUIDED', 'FREE_TEXT')
    AND "createdAt" >= clock_timestamp() - interval '24 hours';

  IF recent_sender_messages >= 500 THEN
    RAISE EXCEPTION 'User message limit reached.' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_message_insert()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER message_insert_authorization
BEFORE INSERT ON public."Message"
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_message_insert();

CREATE OR REPLACE FUNCTION app_private.activate_conversation_from_buyer_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.kind NOT IN ('GUIDED', 'FREE_TEXT') OR NEW."senderUserId" IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public."Invite" invite
  SET status = 'ACCEPTED',
      "viewedAt" = coalesce(invite."viewedAt", now()),
      "respondedAt" = coalesce(invite."respondedAt", now()),
      "updatedAt" = now()
  FROM public."Conversation" conversation
  JOIN public."ConversationParticipant" participant
    ON participant."conversationId" = conversation.id
  WHERE conversation.id = NEW."conversationId"
    AND conversation.status = 'AWAITING_BUYER'
    AND participant."userId" = NEW."senderUserId"
    AND participant.role = 'BUYER'
    AND invite.id = conversation."inviteId"
    AND invite.status IN ('SENT', 'VIEWED');

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.activate_conversation_from_buyer_reply()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER message_buyer_reply_activation
AFTER INSERT ON public."Message"
FOR EACH ROW EXECUTE FUNCTION app_private.activate_conversation_from_buyer_reply();

CREATE OR REPLACE FUNCTION app_private.preserve_message_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Messages cannot be hard-deleted.' USING ERRCODE = '55000';
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD."conversationId" IS DISTINCT FROM NEW."conversationId"
    OR OLD."senderUserId" IS DISTINCT FROM NEW."senderUserId"
    OR OLD.kind IS DISTINCT FROM NEW.kind
    OR OLD."templateKey" IS DISTINCT FROM NEW."templateKey"
    OR OLD."templateVersion" IS DISTINCT FROM NEW."templateVersion"
    OR OLD.body IS DISTINCT FROM NEW.body
    OR OLD."clientMessageId" IS DISTINCT FROM NEW."clientMessageId"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Message evidence is immutable.' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.preserve_message_evidence()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER message_evidence_immutable
BEFORE UPDATE OR DELETE ON public."Message"
FOR EACH ROW EXECUTE FUNCTION app_private.preserve_message_evidence();

CREATE OR REPLACE FUNCTION app_private.capture_message_report_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  message_row public."Message"%ROWTYPE;
  surrounding_messages jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO message_row
    FROM public."Message"
    WHERE id = NEW."messageId"
      AND "conversationId" = NEW."conversationId";

    IF message_row.id IS NULL
      OR message_row."senderUserId" IS NULL
      OR message_row."senderUserId" = NEW."reporterUserId"
      OR NOT EXISTS (
        SELECT 1 FROM public."ConversationParticipant" participant
        JOIN public."User" reporter ON reporter.id = participant."userId"
        WHERE participant."conversationId" = NEW."conversationId"
          AND participant."userId" = NEW."reporterUserId"
          AND reporter.status = 'ACTIVE'
      ) THEN
      RAISE EXCEPTION 'Message report is unavailable.' USING ERRCODE = '42501';
    END IF;

    NEW."reportedUserId" := message_row."senderUserId";
    NEW."evidenceBodySnapshot" := message_row.body;

    SELECT coalesce(
      jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'messageId', candidate.id,
          'sender', CASE
            WHEN candidate."senderUserId" IS NULL THEN 'SYSTEM'
            WHEN candidate."senderUserId" = NEW."reporterUserId" THEN 'REPORTER'
            WHEN candidate."senderUserId" = message_row."senderUserId" THEN 'REPORTED_USER'
            ELSE 'PARTICIPANT'
          END,
          'kind', candidate.kind,
          'body', candidate.body,
          'createdAt', candidate."createdAt",
          'templateKey', candidate."templateKey",
          'templateVersion', candidate."templateVersion",
          'moderationStatus', candidate."moderationStatus"
        ))
        ORDER BY candidate."createdAt", candidate.id
      ),
      '[]'::jsonb
    )
    INTO surrounding_messages
    FROM (
      SELECT context_message.*
      FROM public."Message" context_message
      WHERE context_message."conversationId" = NEW."conversationId"
        AND context_message."createdAt" BETWEEN
          message_row."createdAt" - interval '15 minutes'
          AND message_row."createdAt" + interval '15 minutes'
      ORDER BY
        CASE WHEN context_message.id = message_row.id THEN 0 ELSE 1 END,
        abs(extract(epoch FROM (context_message."createdAt" - message_row."createdAt"))),
        context_message."createdAt",
        context_message.id
      LIMIT 7
    ) candidate;

    NEW."evidenceContext" := jsonb_strip_nulls(jsonb_build_object(
      'messageKind', message_row.kind,
      'messageCreatedAt', message_row."createdAt",
      'templateKey', message_row."templateKey",
      'templateVersion', message_row."templateVersion",
      'moderationStatus', message_row."moderationStatus",
      'surroundingMessages', surrounding_messages,
      'windowMinutes', 15
    ));
    NEW.status := 'OPEN';
    NEW."reviewedByUserId" := NULL;
    NEW."reviewedAt" := NULL;
    NEW.resolution := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Message reports cannot be hard-deleted.' USING ERRCODE = '55000';
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD."reporterUserId" IS DISTINCT FROM NEW."reporterUserId"
    OR OLD."reportedUserId" IS DISTINCT FROM NEW."reportedUserId"
    OR OLD."conversationId" IS DISTINCT FROM NEW."conversationId"
    OR OLD."messageId" IS DISTINCT FROM NEW."messageId"
    OR OLD.category IS DISTINCT FROM NEW.category
    OR OLD.details IS DISTINCT FROM NEW.details
    OR OLD."evidenceBodySnapshot" IS DISTINCT FROM NEW."evidenceBodySnapshot"
    OR OLD."evidenceContext" IS DISTINCT FROM NEW."evidenceContext"
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'Message report evidence is immutable.' USING ERRCODE = '55000';
  END IF;

  IF NEW.status <> 'OPEN' AND NOT EXISTS (
    SELECT 1 FROM public."User" reviewer
    WHERE reviewer.id = NEW."reviewedByUserId"
      AND reviewer.status = 'ACTIVE'
      AND 'ADMIN'::public."UserRole" = ANY(reviewer.roles)
  ) THEN
    RAISE EXCEPTION 'Only an active admin may review message reports.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.capture_message_report_evidence()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER message_report_evidence
BEFORE INSERT OR UPDATE OR DELETE ON public."MessageReport"
FOR EACH ROW EXECUTE FUNCTION app_private.capture_message_report_evidence();

CREATE OR REPLACE FUNCTION app_private.messaging_property_snapshot(
  p_invite_id text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN property."ownerUserId" = invite."sellerId"
      AND invite."propertyIdentityVersion" = property."identityVersion" THEN
      jsonb_strip_nulls(jsonb_build_object(
        'title', invite.title,
        'propertyIdentityVersion', invite."propertyIdentityVersion",
        'propertyType', property."propertyType",
        'addressLine1', property."addressLine1",
        'addressLine2', property."addressLine2",
        'city', property.city,
        'state', property.state,
        'zip', property.zip,
        'location', concat_ws(', ',
          nullif(btrim(concat_ws(' ', property."addressLine1", property."addressLine2")), ''),
          nullif(btrim(property.city), ''),
          nullif(btrim(property.state), ''),
          nullif(btrim(property.zip), '')
        ),
        'bedrooms', property.bedrooms,
        'bathrooms', property.bathrooms,
        'squareFeet', property."squareFeet",
        'condition', property.condition,
        'features', property.features,
        'price', property.price,
        'ownershipVerificationStatus', property."ownershipVerificationStatus",
        'propertyStatus', property.status
      ))
    ELSE jsonb_build_object(
      'propertyIdentityVersion', invite."propertyIdentityVersion",
      'contextUnavailable', true
    )
  END
  FROM public."Invite" invite
  JOIN public."SellerProperty" property ON property.id = invite."propertyId"
  WHERE invite.id = p_invite_id;
$$;

REVOKE ALL ON FUNCTION app_private.messaging_property_snapshot(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.broadcast_message_identifier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."moderationStatus" IS NOT DISTINCT FROM NEW."moderationStatus" THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    UPDATE public."Conversation"
    SET "lastMessageAt" = greatest("lastMessageAt", NEW."createdAt"),
        "updatedAt" = now()
    WHERE id = NEW."conversationId";
  ELSE
    UPDATE public."Conversation"
    SET "moderationUpdatedAt" = greatest(
          clock_timestamp()::timestamp(3),
          coalesce("moderationUpdatedAt" + interval '1 millisecond', '-infinity'::timestamp)
        ),
        "updatedAt" = now()
    WHERE id = NEW."conversationId";
  END IF;

  BEGIN
    PERFORM realtime.send(
      jsonb_build_object(
        'conversationId', NEW."conversationId",
        'messageId', NEW.id,
        'type', CASE WHEN TG_OP = 'INSERT' THEN 'message_created' ELSE 'message_moderated' END
      ),
      'message_changed',
      'conversation:' || NEW."conversationId"::text,
      true
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Realtime message hint failed (SQLSTATE %).', SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.broadcast_message_identifier()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER message_identifier_broadcast
AFTER INSERT ON public."Message"
FOR EACH ROW EXECUTE FUNCTION app_private.broadcast_message_identifier();

CREATE TRIGGER message_moderation_broadcast
AFTER UPDATE OF "moderationStatus" ON public."Message"
FOR EACH ROW EXECUTE FUNCTION app_private.broadcast_message_identifier();

CREATE OR REPLACE FUNCTION app_private.create_invite_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conversation_id uuid;
  message_id uuid;
  buyer_user_id uuid;
  conversation_status public."ConversationStatus";
  closed_reason public."ConversationClosedReason";
BEGIN
  SELECT "userId" INTO buyer_user_id
  FROM public."BuyerProfile"
  WHERE id = NEW."buyerProfileId";

  IF NEW.status = 'ACCEPTED' THEN
    conversation_status := 'ACTIVE';
    closed_reason := NULL;
  ELSIF NEW.status IN ('SENT', 'VIEWED') AND NEW."expiresAt" > clock_timestamp() THEN
    conversation_status := 'AWAITING_BUYER';
    closed_reason := NULL;
  ELSE
    conversation_status := 'READ_ONLY';
    closed_reason := CASE NEW.status
      WHEN 'DECLINED' THEN 'INVITE_DECLINED'::public."ConversationClosedReason"
      WHEN 'EXPIRED' THEN 'INVITE_EXPIRED'::public."ConversationClosedReason"
      WHEN 'WITHDRAWN' THEN 'INVITE_WITHDRAWN'::public."ConversationClosedReason"
      ELSE 'INVITE_EXPIRED'::public."ConversationClosedReason"
    END;
  END IF;

  INSERT INTO public."Conversation" (
    "inviteId", status, "closedReason", "propertySnapshot",
    "lastMessageAt", "createdAt", "updatedAt"
  ) VALUES (
    NEW.id,
    conversation_status,
    closed_reason,
    app_private.messaging_property_snapshot(NEW.id),
    NEW."sentAt",
    NEW."sentAt",
    NEW."sentAt"
  )
  RETURNING id INTO conversation_id;

  INSERT INTO public."ConversationParticipant" (
    "conversationId", "userId", role, "createdAt"
  ) VALUES
    (conversation_id, NEW."sellerId", 'SELLER', NEW."sentAt"),
    (conversation_id, buyer_user_id, 'BUYER', NEW."sentAt");

  INSERT INTO public."Message" (
    "conversationId", "senderUserId", kind, "templateKey", "templateVersion",
    body, "clientMessageId", "moderationStatus", "createdAt"
  ) VALUES (
    conversation_id,
    NEW."sellerId",
    'INVITE',
    NEW."openingTemplateKey",
    NEW."openingTemplateVersion",
    btrim(NEW.message),
    gen_random_uuid(),
    'ALLOWED',
    NEW."sentAt"
  )
  RETURNING id INTO message_id;

  UPDATE public."ConversationParticipant"
  SET "lastReadMessageId" = message_id, "lastReadAt" = NEW."sentAt"
  WHERE "conversationId" = conversation_id AND role = 'SELLER';

  IF NEW."viewedAt" IS NOT NULL OR NEW."respondedAt" IS NOT NULL THEN
    UPDATE public."ConversationParticipant"
    SET "lastReadMessageId" = message_id,
        "lastReadAt" = greatest(
          NEW."sentAt",
          coalesce(NEW."respondedAt", NEW."viewedAt", NEW."sentAt")
        )
    WHERE "conversationId" = conversation_id AND role = 'BUYER';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.create_invite_conversation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER invite_creates_conversation
AFTER INSERT ON public."Invite"
FOR EACH ROW EXECUTE FUNCTION app_private.create_invite_conversation();

CREATE OR REPLACE FUNCTION app_private.close_conversation(
  p_conversation_id uuid,
  p_reason public."ConversationClosedReason",
  p_notice text,
  p_event_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changed boolean;
BEGIN
  UPDATE public."Conversation"
  SET status = 'READ_ONLY', "closedReason" = p_reason, "updatedAt" = now()
  WHERE id = p_conversation_id
    AND status IN ('AWAITING_BUYER', 'ACTIVE')
  RETURNING true INTO changed;

  IF changed THEN
    INSERT INTO public."Message" (
      "conversationId", "senderUserId", kind, body,
      "clientMessageId", "moderationStatus", "createdAt"
    ) VALUES (
      p_conversation_id,
      NULL,
      'SYSTEM',
      p_notice,
      md5(p_event_key || ':' || p_conversation_id::text)::uuid,
      'ALLOWED',
      now()
    )
    ON CONFLICT ("conversationId", "clientMessageId") DO NOTHING;
  END IF;

  UPDATE public."EmailOutbox"
  SET status = 'CANCELLED',
      "lastError" = 'Conversation became unavailable before delivery.',
      "lockedAt" = NULL,
      "leaseUntil" = NULL,
      "workerId" = NULL,
      "nextAttemptAt" = NULL,
      "updatedAt" = now()
  WHERE type = 'MESSAGE_UNREAD'
    AND "messageConversationId" = p_conversation_id
    AND status IN ('PENDING', 'FAILED', 'SENDING');
END;
$$;

REVOKE ALL ON FUNCTION app_private.close_conversation(
  uuid, public."ConversationClosedReason", text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.sync_invite_conversation_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conversation_id uuid;
  existing_reason public."ConversationClosedReason";
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT id, "closedReason" INTO conversation_id, existing_reason
  FROM public."Conversation"
  WHERE "inviteId" = NEW.id
  FOR UPDATE;

  IF conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'ACCEPTED' THEN
    UPDATE public."Conversation"
    SET status = 'ACTIVE', "closedReason" = NULL, "updatedAt" = now()
    WHERE id = conversation_id AND status = 'AWAITING_BUYER';
  ELSIF NEW.status = 'DECLINED' THEN
    PERFORM app_private.close_conversation(
      conversation_id,
      'INVITE_DECLINED',
      'This conversation is read-only because the invite was declined.',
      'invite-declined'
    );
  ELSIF NEW.status = 'EXPIRED' THEN
    PERFORM app_private.close_conversation(
      conversation_id,
      'INVITE_EXPIRED',
      'This conversation is read-only because the invite expired.',
      'invite-expired'
    );
  ELSIF NEW.status = 'WITHDRAWN'
    AND existing_reason IS DISTINCT FROM 'PROPERTY_IDENTITY_CHANGED' THEN
    PERFORM app_private.close_conversation(
      conversation_id,
      'INVITE_WITHDRAWN',
      'This conversation is read-only because the invite was withdrawn.',
      'invite-withdrawn'
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.sync_invite_conversation_lifecycle()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER invite_conversation_lifecycle
AFTER UPDATE OF status ON public."Invite"
FOR EACH ROW EXECUTE FUNCTION app_private.sync_invite_conversation_lifecycle();

CREATE OR REPLACE FUNCTION app_private.invalidate_property_conversations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected record;
BEGIN
  IF OLD."addressLine1" IS DISTINCT FROM NEW."addressLine1"
    OR OLD."addressLine2" IS DISTINCT FROM NEW."addressLine2"
    OR OLD.city IS DISTINCT FROM NEW.city
    OR OLD.state IS DISTINCT FROM NEW.state
    OR OLD.zip IS DISTINCT FROM NEW.zip
    OR OLD.lat IS DISTINCT FROM NEW.lat
    OR OLD.lng IS DISTINCT FROM NEW.lng
    OR OLD."providerPropertyId" IS DISTINCT FROM NEW."providerPropertyId" THEN
    FOR affected IN
      SELECT conversation.id
      FROM public."Conversation" conversation
      JOIN public."Invite" invite ON invite.id = conversation."inviteId"
      WHERE invite."propertyId" = OLD.id
        AND conversation.status IN ('AWAITING_BUYER', 'ACTIVE')
      ORDER BY conversation.id
      FOR UPDATE OF conversation
    LOOP
      PERFORM app_private.close_conversation(
        affected.id,
        'PROPERTY_IDENTITY_CHANGED',
        'The property identity changed. This conversation is now read-only.',
        'property-identity-changed'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.invalidate_property_conversations()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER messaging_property_identity_invalidation
BEFORE UPDATE ON public."SellerProperty"
FOR EACH ROW EXECUTE FUNCTION app_private.invalidate_property_conversations();

CREATE OR REPLACE FUNCTION app_private.close_ineligible_property_conversations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected record;
BEGIN
  IF OLD."ownerUserId" IS DISTINCT FROM NEW."ownerUserId"
    OR NEW.status <> 'READY_FOR_INVITES'
    OR NEW."ownershipVerificationStatus" <> 'APPROVED'
    OR NEW."flaggedForReviewAt" IS NOT NULL
    OR NEW."authorityAttestedIdentityVersion" IS DISTINCT FROM NEW."identityVersion" THEN
    FOR affected IN
      SELECT conversation.id
      FROM public."Conversation" conversation
      JOIN public."Invite" invite ON invite.id = conversation."inviteId"
      WHERE invite."propertyId" = NEW.id
        AND conversation.status IN ('AWAITING_BUYER', 'ACTIVE')
      ORDER BY conversation.id
      FOR UPDATE OF conversation
    LOOP
      PERFORM app_private.close_conversation(
        affected.id,
        'PROPERTY_INELIGIBLE',
        'The property is no longer eligible for messaging. This conversation is read-only.',
        'property-ineligible'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.close_ineligible_property_conversations()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER messaging_property_eligibility
AFTER UPDATE OF "ownerUserId", status, "ownershipVerificationStatus", "flaggedForReviewAt",
  "authorityAttestedIdentityVersion", "identityVersion"
ON public."SellerProperty"
FOR EACH ROW EXECUTE FUNCTION app_private.close_ineligible_property_conversations();

CREATE OR REPLACE FUNCTION app_private.close_user_conversations_on_eligibility_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected record;
  buyer_role_lost boolean;
  seller_role_lost boolean;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'SUSPENDED' THEN
    FOR affected IN
      SELECT conversation.id
      FROM public."Conversation" conversation
      JOIN public."ConversationParticipant" participant
        ON participant."conversationId" = conversation.id
      WHERE participant."userId" = NEW.id
        AND conversation.status IN ('AWAITING_BUYER', 'ACTIVE')
      ORDER BY conversation.id
      FOR UPDATE OF conversation
    LOOP
      PERFORM app_private.close_conversation(
        affected.id,
        'USER_SUSPENDED',
        'A participant is no longer eligible. This conversation is read-only.',
        'user-suspended'
      );
    END LOOP;
    RETURN NEW;
  END IF;

  IF OLD.roles IS NOT DISTINCT FROM NEW.roles THEN
    RETURN NEW;
  END IF;

  buyer_role_lost := NOT ('BUYER'::public."UserRole" = ANY(NEW.roles));
  seller_role_lost := NOT ('ADMIN'::public."UserRole" = ANY(NEW.roles))
    AND (
      NOT ('SELLER'::public."UserRole" = ANY(NEW.roles))
      OR NOT EXISTS (
        SELECT 1
        FROM public."SellerAccess" access
        WHERE access."userId" = NEW.id
          AND access.status = 'APPROVED'
      )
    );

  IF NOT buyer_role_lost AND NOT seller_role_lost THEN
    RETURN NEW;
  END IF;

  FOR affected IN
    SELECT conversation.id, participant.role
    FROM public."Conversation" conversation
    JOIN public."ConversationParticipant" participant
      ON participant."conversationId" = conversation.id
    WHERE participant."userId" = NEW.id
      AND conversation.status IN ('AWAITING_BUYER', 'ACTIVE')
      AND (
        (participant.role = 'BUYER' AND buyer_role_lost)
        OR (participant.role = 'SELLER' AND seller_role_lost)
      )
    ORDER BY conversation.id
    FOR UPDATE OF conversation
  LOOP
    IF affected.role = 'BUYER' THEN
      PERFORM app_private.close_conversation(
        affected.id,
        'BUYER_INELIGIBLE',
        'The buyer is no longer eligible. This conversation is read-only.',
        'buyer-role-lost'
      );
    ELSE
      PERFORM app_private.close_conversation(
        affected.id,
        'SELLER_INELIGIBLE',
        'The seller is no longer eligible. This conversation is read-only.',
        'seller-role-lost'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.close_user_conversations_on_eligibility_loss()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER messaging_user_eligibility_loss
AFTER UPDATE OF status, roles ON public."User"
FOR EACH ROW EXECUTE FUNCTION app_private.close_user_conversations_on_eligibility_loss();

CREATE OR REPLACE FUNCTION app_private.close_seller_conversations_on_access_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected record;
  seller_user_id uuid;
BEGIN
  seller_user_id := CASE
    WHEN TG_OP = 'DELETE' OR OLD."userId" IS DISTINCT FROM NEW."userId" THEN OLD."userId"
    ELSE NEW."userId"
  END;

  IF (
    TG_OP = 'DELETE'
    OR OLD."userId" IS DISTINCT FROM NEW."userId"
    OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status <> 'APPROVED')
  ) AND NOT EXISTS (
    SELECT 1
    FROM public."User" app_user
    WHERE app_user.id = seller_user_id
      AND app_user.status = 'ACTIVE'
      AND 'ADMIN'::public."UserRole" = ANY(app_user.roles)
  ) THEN
    FOR affected IN
      SELECT conversation.id
      FROM public."Conversation" conversation
      JOIN public."Invite" invite ON invite.id = conversation."inviteId"
      WHERE invite."sellerId" = seller_user_id
        AND conversation.status IN ('AWAITING_BUYER', 'ACTIVE')
      ORDER BY conversation.id
      FOR UPDATE OF conversation
    LOOP
      PERFORM app_private.close_conversation(
        affected.id,
        'SELLER_INELIGIBLE',
        'The seller is no longer eligible. This conversation is read-only.',
        'seller-access-lost'
      );
    END LOOP;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.close_seller_conversations_on_access_loss()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER messaging_seller_access_loss
AFTER UPDATE OR DELETE ON public."SellerAccess"
FOR EACH ROW EXECUTE FUNCTION app_private.close_seller_conversations_on_access_loss();

CREATE OR REPLACE FUNCTION app_private.close_buyer_conversations_on_visibility_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected record;
BEGIN
  IF OLD."visibilityStatus" IS DISTINCT FROM NEW."visibilityStatus"
    AND NEW."visibilityStatus" <> 'ACTIVE' THEN
    FOR affected IN
      SELECT conversation.id
      FROM public."Conversation" conversation
      JOIN public."Invite" invite ON invite.id = conversation."inviteId"
      WHERE invite."buyerProfileId" = NEW.id
        AND conversation.status IN ('AWAITING_BUYER', 'ACTIVE')
      ORDER BY conversation.id
      FOR UPDATE OF conversation
    LOOP
      PERFORM app_private.close_conversation(
        affected.id,
        'BUYER_INELIGIBLE',
        'The buyer is no longer eligible. This conversation is read-only.',
        'buyer-ineligible'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.close_buyer_conversations_on_visibility_loss()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER messaging_buyer_visibility_loss
AFTER UPDATE OF "visibilityStatus" ON public."BuyerProfile"
FOR EACH ROW EXECUTE FUNCTION app_private.close_buyer_conversations_on_visibility_loss();

CREATE OR REPLACE FUNCTION app_private.apply_user_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'messaging-pair:'
      || least(NEW."blockerUserId", NEW."blockedUserId")::text
      || ':'
      || greatest(NEW."blockerUserId", NEW."blockedUserId")::text,
    0
  ));

  PERFORM invite.id
  FROM public."Invite" invite
  JOIN public."BuyerProfile" buyer ON buyer.id = invite."buyerProfileId"
  WHERE (
    invite."sellerId" = NEW."blockerUserId"
    AND buyer."userId" = NEW."blockedUserId"
  ) OR (
    invite."sellerId" = NEW."blockedUserId"
    AND buyer."userId" = NEW."blockerUserId"
  )
  ORDER BY invite.id
  FOR UPDATE OF invite;

  FOR affected IN
    SELECT conversation.id
    FROM public."Conversation" conversation
    WHERE EXISTS (
      SELECT 1 FROM public."ConversationParticipant" first_participant
      WHERE first_participant."conversationId" = conversation.id
        AND first_participant."userId" = NEW."blockerUserId"
    )
      AND EXISTS (
        SELECT 1 FROM public."ConversationParticipant" second_participant
        WHERE second_participant."conversationId" = conversation.id
          AND second_participant."userId" = NEW."blockedUserId"
      )
    ORDER BY conversation.id
    FOR UPDATE OF conversation
  LOOP
    UPDATE public."Conversation"
    SET status = 'BLOCKED', "closedReason" = 'USER_BLOCKED', "updatedAt" = now()
    WHERE id = affected.id AND status <> 'BLOCKED';

    INSERT INTO public."Message" (
      "conversationId", "senderUserId", kind, body,
      "clientMessageId", "moderationStatus", "createdAt"
    ) VALUES (
      affected.id,
      NULL,
      'SYSTEM',
      'This conversation is no longer available.',
      md5('user-blocked:' || affected.id::text)::uuid,
      'ALLOWED',
      now()
    )
    ON CONFLICT ("conversationId", "clientMessageId") DO NOTHING;
  END LOOP;

  UPDATE public."Invite" invite
  SET status = 'WITHDRAWN', "updatedAt" = now()
  FROM public."BuyerProfile" buyer
  WHERE buyer.id = invite."buyerProfileId"
    AND invite.status IN ('SENT', 'VIEWED', 'ACCEPTED')
    AND (
      (invite."sellerId" = NEW."blockerUserId" AND buyer."userId" = NEW."blockedUserId")
      OR (invite."sellerId" = NEW."blockedUserId" AND buyer."userId" = NEW."blockerUserId")
    );

  UPDATE public."EmailOutbox" outbox
  SET status = 'CANCELLED',
      "lastError" = 'Conversation became unavailable before delivery.',
      "lockedAt" = NULL,
      "leaseUntil" = NULL,
      "workerId" = NULL,
      "nextAttemptAt" = NULL,
      "updatedAt" = now()
  WHERE outbox.type = 'MESSAGE_UNREAD'
    AND outbox.status IN ('PENDING', 'FAILED', 'SENDING')
    AND outbox."messageConversationId" IN (
      SELECT conversation.id
      FROM public."Conversation" conversation
      WHERE EXISTS (
        SELECT 1
        FROM public."ConversationParticipant" participant
        WHERE participant."conversationId" = conversation.id
          AND participant."userId" = NEW."blockerUserId"
      )
        AND EXISTS (
          SELECT 1
          FROM public."ConversationParticipant" participant
          WHERE participant."conversationId" = conversation.id
            AND participant."userId" = NEW."blockedUserId"
        )
    );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.apply_user_block()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER user_block_closes_conversations
BEFORE INSERT ON public."UserBlock"
FOR EACH ROW EXECUTE FUNCTION app_private.apply_user_block();

CREATE OR REPLACE FUNCTION app_private.preserve_user_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'User blocks are permanent in Messaging V1.' USING ERRCODE = '55000';
  END IF;

  IF OLD."blockerUserId" IS DISTINCT FROM NEW."blockerUserId"
    OR OLD."blockedUserId" IS DISTINCT FROM NEW."blockedUserId"
    OR OLD.reason IS DISTINCT FROM NEW.reason
    OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
    RAISE EXCEPTION 'User blocks are immutable in Messaging V1.' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.preserve_user_block()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER user_block_immutable
BEFORE UPDATE OR DELETE ON public."UserBlock"
FOR EACH ROW EXECUTE FUNCTION app_private.preserve_user_block();

CREATE OR REPLACE FUNCTION app_private.enforce_invite_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  seller_status public."UserStatus";
  seller_access_status public."SellerAccessStatus";
  seller_is_admin boolean;
  seller_has_role boolean;
  seller_can_invite boolean;
  property_verification public."PropertyVerificationStatus";
  property_status public."PropertyStatus";
  property_flagged_at timestamp(3);
  property_identity_version integer;
  attested_identity_version integer;
  buyer_visibility public."BuyerVisibilityStatus";
  buyer_user_status public."UserStatus";
  buyer_has_role boolean;
  buyer_user_id uuid;
  locked_buyer_user_id uuid;
  sent_count integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'SENT'
    OR NEW."openingTemplateKey" IS NULL
    OR NEW."openingTemplateVersion" IS DISTINCT FROM 1
    OR NEW."expiresAt" <= NEW."sentAt" THEN
    RAISE EXCEPTION 'New invites must include current guided opening metadata and begin in SENT status.'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."sellerId"::text, 0));

  -- Derive the buyer, lock both users in UUID order, then revalidate the profile
  -- under lock. Access and property follow the same order as user suspension.
  SELECT buyer_profile."userId"
  INTO buyer_user_id
  FROM public."BuyerProfile" buyer_profile
  WHERE buyer_profile.id = NEW."buyerProfileId";

  IF buyer_user_id IS NULL THEN
    RAISE EXCEPTION 'Invite is unavailable.' USING ERRCODE = '42501';
  END IF;

  PERFORM app_user.id
  FROM public."User" app_user
  WHERE app_user.id IN (NEW."sellerId", buyer_user_id)
  ORDER BY app_user.id
  FOR SHARE;

  SELECT app_user.status,
    'ADMIN'::public."UserRole" = ANY(app_user.roles),
    'SELLER'::public."UserRole" = ANY(app_user.roles)
  INTO seller_status, seller_is_admin, seller_has_role
  FROM public."User" app_user
  WHERE app_user.id = NEW."sellerId";

  SELECT buyer_user.status, 'BUYER'::public."UserRole" = ANY(buyer_user.roles)
  INTO buyer_user_status, buyer_has_role
  FROM public."User" buyer_user
  WHERE buyer_user.id = buyer_user_id;

  SELECT buyer_profile."visibilityStatus", buyer_profile."userId"
  INTO buyer_visibility, locked_buyer_user_id
  FROM public."BuyerProfile" buyer_profile
  WHERE buyer_profile.id = NEW."buyerProfileId"
  FOR SHARE;

  IF locked_buyer_user_id IS DISTINCT FROM buyer_user_id THEN
    RAISE EXCEPTION 'Invite is unavailable.' USING ERRCODE = '42501';
  END IF;

  SELECT access.status
  INTO seller_access_status
  FROM public."SellerAccess" access
  WHERE access."userId" = NEW."sellerId"
  FOR SHARE;

  seller_can_invite := seller_is_admin
    OR (seller_has_role AND seller_access_status = 'APPROVED');

  IF seller_status IS DISTINCT FROM 'ACTIVE' OR seller_can_invite IS NOT TRUE THEN
    RAISE EXCEPTION 'Invite is unavailable.' USING ERRCODE = '42501';
  END IF;

  SELECT property."ownershipVerificationStatus", property.status,
    property."flaggedForReviewAt", property."identityVersion",
    property."authorityAttestedIdentityVersion"
  INTO property_verification, property_status, property_flagged_at,
    property_identity_version, attested_identity_version
  FROM public."SellerProperty" property
  WHERE property.id = NEW."propertyId" AND property."ownerUserId" = NEW."sellerId"
  FOR SHARE;

  IF property_identity_version IS NULL
    OR property_flagged_at IS NOT NULL
    OR property_verification <> 'APPROVED'
    OR property_status <> 'READY_FOR_INVITES'
    OR attested_identity_version IS DISTINCT FROM property_identity_version
    OR NEW."propertyIdentityVersion" IS DISTINCT FROM property_identity_version THEN
    RAISE EXCEPTION 'Invite is unavailable.' USING ERRCODE = '42501';
  END IF;

  IF buyer_visibility IS DISTINCT FROM 'ACTIVE'
    OR buyer_user_status IS DISTINCT FROM 'ACTIVE'
    OR buyer_has_role IS NOT TRUE
    OR buyer_user_id = NEW."sellerId" THEN
    RAISE EXCEPTION 'Invite is unavailable.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'messaging-pair:'
      || least(NEW."sellerId", buyer_user_id)::text
      || ':'
      || greatest(NEW."sellerId", buyer_user_id)::text,
    0
  ));

  IF EXISTS (
    SELECT 1 FROM public."UserBlock" block
    WHERE (
      block."blockerUserId" = NEW."sellerId"
      AND block."blockedUserId" = buyer_user_id
    ) OR (
      block."blockerUserId" = buyer_user_id
      AND block."blockedUserId" = NEW."sellerId"
    )
  ) THEN
    RAISE EXCEPTION 'Invite is unavailable.' USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION app_private.enforce_invite_rules()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.can_join_conversation_topic(
  p_topic text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  viewer_id uuid := auth.uid();
  conversation_id uuid;
BEGIN
  IF viewer_id IS NULL
    OR p_topic !~ '^conversation:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-5][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$' THEN
    RETURN false;
  END IF;

  conversation_id := split_part(p_topic, ':', 2)::uuid;

  RETURN EXISTS (
    SELECT 1
    FROM public."ConversationParticipant" participant
    JOIN public."User" app_user ON app_user.id = participant."userId"
    WHERE participant."conversationId" = conversation_id
      AND participant."userId" = viewer_id
      AND app_user.status = 'ACTIVE'
  );
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION app_private.can_join_conversation_topic(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_join_conversation_topic(text)
  TO authenticated;

ALTER TABLE public."Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ConversationParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MessageReport" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public."Conversation",
  public."ConversationParticipant",
  public."Message",
  public."UserBlock",
  public."MessageReport"
FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'realtime'
      AND policy.tablename = 'messages'
      AND policy.policyname <> 'Active participants can receive conversation broadcasts'
      AND policy.permissive = 'PERMISSIVE'
      AND policy.cmd IN ('SELECT', 'ALL')
      AND (
        'public'::name = ANY(policy.roles)
        OR 'anon'::name = ANY(policy.roles)
        OR 'authenticated'::name = ANY(policy.roles)
      )
  ) THEN
    RAISE EXCEPTION 'Guided messaging migration blocked: review existing permissive authenticated Realtime SELECT policies before enabling private conversation topics.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'realtime'
      AND policy.tablename = 'messages'
      AND policy.cmd IN ('INSERT', 'ALL')
      AND (
        'public'::name = ANY(policy.roles)
        OR 'anon'::name = ANY(policy.roles)
        OR 'authenticated'::name = ANY(policy.roles)
      )
  ) THEN
    RAISE EXCEPTION 'Guided messaging migration blocked: browser Realtime Broadcast INSERT policies must be removed before private conversation topics are enabled.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Active participants can receive conversation broadcasts"
  ON realtime.messages;
CREATE POLICY "Active participants can receive conversation broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND (
    SELECT app_private.can_join_conversation_topic(
      (SELECT realtime.topic())
    )
  )
);

COMMIT;
