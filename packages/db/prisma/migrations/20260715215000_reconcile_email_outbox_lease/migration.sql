BEGIN;

-- A retired unnumbered Auth proposal was applied to one existing target after
-- the canonical outbox lease and invite-reference model had already landed.
-- Fail closed on in-flight work, then remove only those incompatible artifacts.
LOCK TABLE public."EmailOutbox" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  legacy_column_count integer;
  legacy_lease_active boolean := false;
BEGIN
  SELECT count(*)
  INTO legacy_column_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'EmailOutbox'
    AND column_name IN (
      'recipientUserId',
      'cancelledAt',
      'leaseToken',
      'leaseExpiresAt'
    );

  IF legacy_column_count NOT IN (0, 4) THEN
    RAISE EXCEPTION 'Legacy EmailOutbox lease artifacts are only partially installed.';
  END IF;

  IF legacy_column_count = 4 THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM public."EmailOutbox"
        WHERE status = 'SENDING'::public."EmailOutboxStatus"
          AND "sentAt" IS NULL
          AND "cancelledAt" IS NULL
          AND ("leaseToken" IS NOT NULL OR "leaseExpiresAt" IS NOT NULL)
      )
    $query$ INTO legacy_lease_active;
  END IF;

  IF legacy_lease_active THEN
    RAISE EXCEPTION 'An active legacy EmailOutbox lease requires provider reconciliation.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."EmailOutbox"
    WHERE (
      status = 'SENDING'::public."EmailOutboxStatus"
      AND (
        "sentAt" IS NOT NULL
        OR "lockedAt" IS NULL
        OR "leaseUntil" IS NULL
        OR "workerId" IS NULL
      )
    ) OR (
      status <> 'SENDING'::public."EmailOutboxStatus"
      AND ("lockedAt" IS NOT NULL OR "leaseUntil" IS NOT NULL OR "workerId" IS NOT NULL)
    )
  ) THEN
    RAISE EXCEPTION 'Current EmailOutbox lease state is inconsistent.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."EmailOutbox"
    WHERE status = 'SENDING'::public."EmailOutboxStatus"
      AND NOT (
        (type = 'INVITE' AND "inviteId" IS NOT NULL)
        OR (
          type = 'MESSAGE_UNREAD'
          AND "messageConversationId" IS NOT NULL
          AND "messageRecipientUserId" IS NOT NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'An active EmailOutbox lease is missing its canonical delivery reference.';
  END IF;
END;
$$;

-- The canonical runtime does not call either retired proposal function.
DROP FUNCTION IF EXISTS app_private.claim_email_outbox(integer, uuid, integer, integer);
DROP FUNCTION IF EXISTS app_private.suspend_identity(uuid, uuid, text, text);

DROP INDEX IF EXISTS public."EmailOutbox_expired_lease_idx";
DROP INDEX IF EXISTS public."EmailOutbox_ready_claim_idx";
DROP INDEX IF EXISTS public."EmailOutbox_recipientUserId_cancelledAt_idx";

ALTER TABLE public."EmailOutbox"
  DROP CONSTRAINT IF EXISTS "EmailOutbox_lease_state_check",
  DROP CONSTRAINT IF EXISTS "EmailOutbox_sendable_recipient_check";

ALTER TABLE public."EmailOutbox"
  DROP COLUMN IF EXISTS "recipientUserId",
  DROP COLUMN IF EXISTS "cancelledAt",
  DROP COLUMN IF EXISTS "leaseToken",
  DROP COLUMN IF EXISTS "leaseExpiresAt";

-- Jobs without a supported immutable reference were never deliverable by the
-- canonical worker. Preserve them for audit while making the terminal state
-- explicit before validating the replacement constraint.
UPDATE public."EmailOutbox"
SET status = 'CANCELLED'::public."EmailOutboxStatus",
    "lastError" = COALESCE(NULLIF("lastError", ''), 'Email delivery reference is unavailable.'),
    "nextAttemptAt" = NULL,
    "lockedAt" = NULL,
    "leaseUntil" = NULL,
    "workerId" = NULL,
    "updatedAt" = now()
WHERE status IN (
    'PENDING'::public."EmailOutboxStatus",
    'FAILED'::public."EmailOutboxStatus"
  )
  AND NOT (
    (type = 'INVITE' AND "inviteId" IS NOT NULL)
    OR (
      type = 'MESSAGE_UNREAD'
      AND "messageConversationId" IS NOT NULL
      AND "messageRecipientUserId" IS NOT NULL
    )
  );

ALTER TABLE public."EmailOutbox"
  ADD CONSTRAINT "EmailOutbox_lease_state_check" CHECK (
    (
      status = 'SENDING'::public."EmailOutboxStatus"
      AND "sentAt" IS NULL
      AND "lockedAt" IS NOT NULL
      AND "leaseUntil" IS NOT NULL
      AND "workerId" IS NOT NULL
    )
    OR (
      status <> 'SENDING'::public."EmailOutboxStatus"
      AND "lockedAt" IS NULL
      AND "leaseUntil" IS NULL
      AND "workerId" IS NULL
    )
  ) NOT VALID,
  ADD CONSTRAINT "EmailOutbox_delivery_reference_check" CHECK (
    status IN (
      'SENT'::public."EmailOutboxStatus",
      'CANCELLED'::public."EmailOutboxStatus"
    )
    OR (type = 'INVITE' AND "inviteId" IS NOT NULL)
    OR (
      type = 'MESSAGE_UNREAD'
      AND "messageConversationId" IS NOT NULL
      AND "messageRecipientUserId" IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE public."EmailOutbox"
  VALIDATE CONSTRAINT "EmailOutbox_lease_state_check";

ALTER TABLE public."EmailOutbox"
  VALIDATE CONSTRAINT "EmailOutbox_delivery_reference_check";

COMMIT;
