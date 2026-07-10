-- CTO integration proposal only. This is intentionally not a numbered migration.
-- Confirm names and production plans before promoting these statements.

CREATE INDEX CONCURRENTLY IF NOT EXISTS buyer_profile_active_recency_cursor_idx
ON public."BuyerProfile" (
  (COALESCE("lastRefreshedAt", "updatedAt")) DESC,
  id ASC
)
WHERE "visibilityStatus" = 'ACTIVE';

CREATE INDEX CONCURRENTLY IF NOT EXISTS buyer_profile_active_budget_cursor_idx
ON public."BuyerProfile" (
  (COALESCE("budgetMax", 0)) DESC,
  id ASC
)
INCLUDE ("budgetMin")
WHERE "visibilityStatus" = 'ACTIVE';

CREATE INDEX CONCURRENTLY IF NOT EXISTS buyer_selected_area_search_idx
ON public.buyer_desired_service_areas (service_area_id, buyer_profile_id)
WHERE is_primary = true AND source = 'SELECTED';

CREATE INDEX CONCURRENTLY IF NOT EXISTS buyer_criteria_search_fit_idx
ON public."BuyerCriteria" (
  "buyerProfileId",
  "propertySubtype",
  "bedroomsMin",
  "bathroomsMin",
  "squareFeetMin",
  "squareFeetMax"
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS buyer_criteria_features_gin_idx
ON public."BuyerCriteria" USING GIN (features);

CREATE INDEX CONCURRENTLY IF NOT EXISTS buyer_badge_active_search_idx
ON public."BuyerBadge" ("buyerProfileId", "badgeType", "expiresAt")
WHERE status = 'ACTIVE';

-- Existing canonical-geography indexes already cover both recursive directions:
-- service_area_relationships(parent_service_area_id, relation_type, reviewed_at)
-- service_area_relationships(child_service_area_id, relation_type, reviewed_at)
-- Do not add duplicates unless production EXPLAIN evidence shows a different need.
