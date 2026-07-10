-- Unnumbered proposal reserved for 00018; reservation is not deployment authorization.
BEGIN;

LOCK TABLE public."BuyerProfile", public."BuyerCriteria" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."BuyerCriteria"
    GROUP BY "buyerProfileId"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Buyer criteria uniqueness preflight found duplicate buyer profiles.'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."BuyerProfile" buyer_profile
    WHERE buyer_profile."visibilityStatus" = 'ACTIVE'
      AND 1 <> (
        SELECT count(*)
        FROM public."BuyerCriteria" buyer_criteria
        WHERE buyer_criteria."buyerProfileId" = buyer_profile.id
      )
  ) THEN
    RAISE EXCEPTION 'Active buyer criteria preflight found a profile without exactly one criteria row.'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE public."BuyerCriteria"
  ADD CONSTRAINT "BuyerCriteria_buyerProfileId_key" UNIQUE ("buyerProfileId");

-- The unique constraint owns an equivalent btree index.
DROP INDEX IF EXISTS public."BuyerCriteria_buyerProfileId_idx";

CREATE OR REPLACE FUNCTION app_private.prevent_buyer_criteria_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."buyerProfileId" IS DISTINCT FROM OLD."buyerProfileId" THEN
    RAISE EXCEPTION 'Buyer criteria ownership is immutable.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.prevent_buyer_criteria_profile_update() FROM PUBLIC;

CREATE TRIGGER buyer_criteria_immutable_profile
BEFORE UPDATE OF "buyerProfileId"
ON public."BuyerCriteria"
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_buyer_criteria_profile_update();

CREATE OR REPLACE FUNCTION app_private.enforce_active_buyer_criteria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  profile_id text;
  profile_status public."BuyerVisibilityStatus";
  criteria_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'BuyerProfile' THEN
    profile_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    profile_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."buyerProfileId" ELSE NEW."buyerProfileId" END;
  END IF;

  SELECT buyer_profile."visibilityStatus"
  INTO profile_status
  FROM public."BuyerProfile" buyer_profile
  WHERE buyer_profile.id = profile_id;

  IF profile_status IS DISTINCT FROM 'ACTIVE'::public."BuyerVisibilityStatus" THEN
    RETURN NULL;
  END IF;

  SELECT count(*)
  INTO criteria_count
  FROM public."BuyerCriteria" buyer_criteria
  WHERE buyer_criteria."buyerProfileId" = profile_id;

  IF criteria_count <> 1 THEN
    RAISE EXCEPTION 'Active buyer profile % requires exactly one criteria row.', profile_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_active_buyer_criteria() FROM PUBLIC;

CREATE CONSTRAINT TRIGGER buyer_profile_active_criteria_check
AFTER INSERT OR UPDATE OF "visibilityStatus"
ON public."BuyerProfile"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_active_buyer_criteria();

CREATE CONSTRAINT TRIGGER buyer_criteria_active_profile_check
AFTER INSERT OR UPDATE OR DELETE
ON public."BuyerCriteria"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_active_buyer_criteria();

COMMIT;
