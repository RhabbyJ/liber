-- Cover nullable foreign keys Supabase advisor flagged for delete/update performance.
CREATE INDEX IF NOT EXISTS "BuyerBadge_verifiedByUserId_idx" ON public."BuyerBadge"("verifiedByUserId");
CREATE INDEX IF NOT EXISTS "Review_reviewerId_idx" ON public."Review"("reviewerId");
CREATE INDEX IF NOT EXISTS "VerificationDocument_reviewedByUserId_idx" ON public."VerificationDocument"("reviewedByUserId");
