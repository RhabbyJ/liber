-- Security-preserving rollback for the unnumbered Auth/security follow-up.
-- First deploy a compatibility runtime that no longer calls the suspension or
-- shared-limiter functions but retains the lease-aware outbox worker. If that is
-- impossible, disable the entire maintenance endpoint. Never deploy the legacy
-- reader-then-SENDING outbox worker against the retained lease constraints.
-- Do not restore broad Storage access, metadata-driven private names, or the
-- all-column Auth update trigger.

BEGIN;

DROP FUNCTION IF EXISTS app_private.suspend_identity(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS app_private.consume_rate_limit(text, text, integer, integer);
DROP FUNCTION IF EXISTS app_private.prune_rate_limit_buckets(timestamptz, integer);
DROP TABLE IF EXISTS app_private.rate_limit_buckets;

-- The claim function, EmailOutbox columns/indexes/constraints, active leases,
-- and cancelled legacy rows are intentionally retained as forward-only safety
-- boundaries. Expired leases remain recoverable by the compatible worker.

-- app_private.is_active_user(), the ACTIVE-aware Storage policies,
-- app_private.owns_property(text), and the email-only Auth update trigger are
-- intentionally retained as forward-only security boundaries.

COMMIT;
