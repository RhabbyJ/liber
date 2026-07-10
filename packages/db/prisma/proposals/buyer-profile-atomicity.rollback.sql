-- Rollback for the unnumbered buyer-profile atomicity proposal.
BEGIN;

LOCK TABLE public."BuyerProfile", public."BuyerCriteria" IN SHARE ROW EXCLUSIVE MODE;

DROP TRIGGER IF EXISTS buyer_criteria_active_profile_check ON public."BuyerCriteria";
DROP TRIGGER IF EXISTS buyer_profile_active_criteria_check ON public."BuyerProfile";
DROP TRIGGER IF EXISTS buyer_criteria_immutable_profile ON public."BuyerCriteria";

DROP FUNCTION IF EXISTS app_private.enforce_active_buyer_criteria();
DROP FUNCTION IF EXISTS app_private.prevent_buyer_criteria_profile_update();

ALTER TABLE public."BuyerCriteria"
  DROP CONSTRAINT IF EXISTS "BuyerCriteria_buyerProfileId_key";

CREATE INDEX IF NOT EXISTS "BuyerCriteria_buyerProfileId_idx"
  ON public."BuyerCriteria" ("buyerProfileId");

COMMIT;
