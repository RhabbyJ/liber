CREATE UNIQUE INDEX IF NOT EXISTS "BuyerBadge_buyerProfileId_badgeType_key"
ON public."BuyerBadge"("buyerProfileId", "badgeType");
