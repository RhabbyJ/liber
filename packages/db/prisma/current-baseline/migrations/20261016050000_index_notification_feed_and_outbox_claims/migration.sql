-- Index two hot reads by their actual query shapes.
--
-- The notification feed, bell, and popup read one user's rows ordered by
-- ("createdAt" DESC, id DESC) with a small limit. The existing
-- ("userId", "readAt") index serves the unread count but leaves that order to
-- a sort over the user's whole notification history.
--
-- Every email worker claim orders claimable jobs by "createdAt". The plain
-- ("createdAt") index starts at the oldest rows, which are terminal, so each
-- claim walked past finished history. This partial index holds only claimable
-- rows. The claim repeats this status list so the planner can prove the
-- predicate, and its attempts bound mirrors MAX_ATTEMPTS (5) in
-- apps/web/server/email-outbox.ts; change them together. Expired final-attempt
-- SENDING rows are swept by the claim's separate (status, "leaseUntil") lookup.
--
-- Both tables are small; plain CREATE INDEX briefly blocks their writes.

BEGIN;

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_id_idx"
  ON public."Notification" ("userId", "createdAt" DESC, id DESC);

CREATE INDEX IF NOT EXISTS "EmailOutbox_claimable_createdAt_idx"
  ON public."EmailOutbox" ("createdAt")
  WHERE status IN ('PENDING', 'FAILED', 'SENDING') AND attempts < 5;

COMMIT;
