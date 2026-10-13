BEGIN;

CREATE TABLE public."TourSchedule" (
  id uuid PRIMARY KEY,
  "conversationId" uuid NOT NULL,
  "proposedByUserId" uuid NOT NULL,
  "lastActorUserId" uuid NOT NULL,
  "lastActionId" uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  status text NOT NULL,
  "startsAt" timestamp(3) NOT NULL,
  "timeZone" text NOT NULL,
  "durationMinutes" integer NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  CONSTRAINT "TourSchedule_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "TourSchedule_proposer_fkey" FOREIGN KEY ("conversationId", "proposedByUserId") REFERENCES public."ConversationParticipant"("conversationId", "userId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "TourSchedule_actor_fkey" FOREIGN KEY ("conversationId", "lastActorUserId") REFERENCES public."ConversationParticipant"("conversationId", "userId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "TourSchedule_shape_check" CHECK (
    revision > 0 AND status IN ('PROPOSED', 'CONFIRMED', 'CANCELLED')
    AND "durationMinutes" IN (30, 60, 90, 120)
    AND length("timeZone") BETWEEN 1 AND 100
  )
);
CREATE UNIQUE INDEX "TourSchedule_conversationId_key" ON public."TourSchedule"("conversationId");
CREATE INDEX "TourSchedule_status_startsAt_idx" ON public."TourSchedule"(status, "startsAt");
ALTER TABLE public."TourSchedule" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."TourSchedule" FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public."EmailOutbox"
  ADD COLUMN "tourScheduleId" uuid,
  ADD COLUMN "tourRevision" integer,
  ADD COLUMN "tourRecipientUserId" uuid,
  ADD COLUMN "tourEvent" text,
  ADD CONSTRAINT "EmailOutbox_tourScheduleId_fkey" FOREIGN KEY ("tourScheduleId") REFERENCES public."TourSchedule"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "EmailOutbox_tourRecipientUserId_fkey" FOREIGN KEY ("tourRecipientUserId") REFERENCES public."User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "EmailOutbox_tour_binding_check" CHECK (
    (type = 'TOUR_UPDATE' AND "tourScheduleId" IS NOT NULL AND "tourRecipientUserId" IS NOT NULL
      AND "tourRevision" IS NOT NULL AND "tourRevision" > 0
      AND "tourEvent" IS NOT NULL AND "tourEvent" IN ('PROPOSED', 'CONFIRMED', 'CANCELLED', 'REMINDER', 'FOLLOW_UP')
      AND payload = '{}'::jsonb AND "inviteId" IS NULL
      AND "messageConversationId" IS NULL AND "messageRecipientUserId" IS NULL)
    OR (type <> 'TOUR_UPDATE' AND "tourScheduleId" IS NULL AND "tourRevision" IS NULL
      AND "tourRecipientUserId" IS NULL AND "tourEvent" IS NULL)
  );
ALTER TABLE public."EmailOutbox" DROP CONSTRAINT "EmailOutbox_delivery_reference_check";
ALTER TABLE public."EmailOutbox" ADD CONSTRAINT "EmailOutbox_delivery_reference_check" CHECK (
  status IN ('SENT'::public."EmailOutboxStatus", 'CANCELLED'::public."EmailOutboxStatus")
  OR (type = 'INVITE' AND "inviteId" IS NOT NULL)
  OR (type = 'MESSAGE_UNREAD' AND "messageConversationId" IS NOT NULL AND "messageRecipientUserId" IS NOT NULL)
  OR (type = 'LOI_UPDATE' AND "loiNegotiationId" IS NOT NULL AND "loiRevisionId" IS NOT NULL AND "loiRecipientUserId" IS NOT NULL)
  OR (type = 'TOUR_UPDATE' AND "tourScheduleId" IS NOT NULL AND "tourRecipientUserId" IS NOT NULL AND "tourRevision" IS NOT NULL AND "tourEvent" IS NOT NULL)
) NOT VALID;
ALTER TABLE public."EmailOutbox" VALIDATE CONSTRAINT "EmailOutbox_delivery_reference_check";
CREATE INDEX "EmailOutbox_tourScheduleId_tourRevision_status_idx" ON public."EmailOutbox"("tourScheduleId", "tourRevision", status);
CREATE INDEX "EmailOutbox_tourRecipientUserId_idx" ON public."EmailOutbox"("tourRecipientUserId");

COMMIT;
