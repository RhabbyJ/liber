-- Supabase performance-advisor follow-up: cover foreign keys that had no
-- leading index so parent deletes and joins do not scan the child tables.

BEGIN;

CREATE INDEX "TourSchedule_conversationId_proposedByUserId_idx"
ON public."TourSchedule"("conversationId", "proposedByUserId");
CREATE INDEX "TourSchedule_conversationId_lastActorUserId_idx"
ON public."TourSchedule"("conversationId", "lastActorUserId");
CREATE INDEX "PropertyVerificationDecision_governmentIdDocumentId_idx"
ON public."PropertyVerificationDecision"("governmentIdDocumentId");
CREATE INDEX "PropertyVerificationDecision_addressEvidenceDocumentId_idx"
ON public."PropertyVerificationDecision"("addressEvidenceDocumentId");

COMMIT;
