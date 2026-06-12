-- Trim over-engineered schema to the v1 CEO flow (residential-only, no review system).
-- All dropped tables/columns are empty or never written by application code.

-- 1. Remove the unused review/rating system (no code path ever creates a review).
DROP TABLE IF EXISTS public."Review";
DROP TYPE IF EXISTS "ReviewStatus";

DROP INDEX IF EXISTS "BuyerProfile_active_ratingAverage_idx";
ALTER TABLE public."BuyerProfile"
  DROP COLUMN IF EXISTS "ratingAverage",
  DROP COLUMN IF EXISTS "reviewCount";

-- 2. Remove unused User contact field.
ALTER TABLE public."User" DROP COLUMN IF EXISTS "phone";

-- 3. Remove commercial-real-estate criteria fields (v1 is residential-only).
ALTER TABLE public."BuyerCriteria"
  DROP CONSTRAINT IF EXISTS "BuyerCriteria_cap_rate_range_check",
  DROP CONSTRAINT IF EXISTS "BuyerCriteria_units_range_check",
  DROP CONSTRAINT IF EXISTS "BuyerCriteria_year_built_range_check";

ALTER TABLE public."BuyerCriteria"
  DROP COLUMN IF EXISTS "capRateMin",
  DROP COLUMN IF EXISTS "capRateMax",
  DROP COLUMN IF EXISTS "unitsMin",
  DROP COLUMN IF EXISTS "unitsMax",
  DROP COLUMN IF EXISTS "yearBuiltMax",
  DROP COLUMN IF EXISTS "zoning",
  DROP COLUMN IF EXISTS "extraCriteria";

-- 4. BuyerBadge: grantedBy is the single source of truth for who granted a badge.
ALTER TABLE public."BuyerBadge" DROP CONSTRAINT IF EXISTS "BuyerBadge_verifiedByUserId_fkey";
DROP INDEX IF EXISTS "BuyerBadge_verifiedByUserId_idx";
ALTER TABLE public."BuyerBadge" DROP COLUMN IF EXISTS "verifiedByUserId";

-- 5. VerificationDocument: reviewStatus is the single source of truth for review state.
DROP INDEX IF EXISTS "VerificationDocument_status_idx";
ALTER TABLE public."VerificationDocument" DROP COLUMN IF EXISTS "status";

-- 6. Shrink property enums to residential-only v1 values.
--    Re-add values with ALTER TYPE ... ADD VALUE when commercial/land returns.
ALTER TYPE "PropertyCategory" RENAME TO "PropertyCategory_old";
CREATE TYPE "PropertyCategory" AS ENUM ('HOME');
ALTER TABLE public."BuyerCriteria"
  ALTER COLUMN "propertyCategory" TYPE "PropertyCategory"
  USING ("propertyCategory"::text::"PropertyCategory");
DROP TYPE "PropertyCategory_old";

ALTER TYPE "PropertySubtype" RENAME TO "PropertySubtype_old";
CREATE TYPE "PropertySubtype" AS ENUM ('HOME');
ALTER TABLE public."BuyerCriteria"
  ALTER COLUMN "propertySubtype" TYPE "PropertySubtype"
  USING ("propertySubtype"::text::"PropertySubtype");
ALTER TABLE public."SellerProperty"
  ALTER COLUMN "propertyType" TYPE "PropertySubtype"
  USING ("propertyType"::text::"PropertySubtype");
DROP TYPE "PropertySubtype_old";
