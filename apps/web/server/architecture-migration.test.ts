import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  "../../packages/db/prisma/migrations/20260711071555_complete_architecture_boundaries/migration.sql",
);
const closureMigrationPath = path.resolve(
  "../../packages/db/prisma/migrations/20260711082500_close_property_identity_lifecycle/migration.sql",
);
const rateLimitRepairMigrationPath = path.resolve(
  "../../packages/db/prisma/migrations/20260713230000_fix_rate_limit_timestamp_variable/migration.sql",
);
const emailOutboxReconciliationMigrationPath = path.resolve(
  "../../packages/db/prisma/migrations/20260715215000_reconcile_email_outbox_lease/migration.sql",
);

describe("architecture boundary migration", () => {
  it("contains the final database and Storage invariants", async () => {
    const sql = await readFile(migrationPath, "utf8");
    for (const required of [
      "BuyerCriteria_buyerProfileId_key",
      "property_identity_lifecycle",
      "buyer_profile_active_criteria_check",
      "pg_advisory_xact_lock",
      "consume_rate_limit",
      "can_read_property_image",
      "is_active_app_user",
      "Authorized users can read private property images",
      "EmailOutbox_idempotencyKey_key",
      "PropertyVerificationDecision",
      "UploadSession",
    ]) {
      expect(sql).toContain(required);
    }
    expect(sql).toContain("SET public = false");
    expect(sql).toContain("invite.status = 'ACCEPTED'");
    expect(sql).toContain("invite.status IN ('SENT', 'VIEWED') AND invite.\"expiresAt\" > now()");
    expect(sql).toContain("now() - interval '24 hours'");
  });

  it("binds property workflows to one current identity version", async () => {
    const sql = await readFile(closureMigrationPath, "utf8");
    for (const required of [
      "authorityAttestedIdentityVersion",
      "PropertyImage_propertyId_propertyIdentityVersion_idx",
      "Invite_propertyId_propertyIdentityVersion_idx",
      "is_invite_property_access_valid",
      "is_invite_deliverable",
      "invite_terminal_email_cancellation",
      "EmailOutbox_inviteId_fkey",
      "UploadSession_buyerProfileId_fkey",
      "CANCELLED",
      "CLEANED",
    ]) {
      expect(sql).toContain(required);
    }
    expect(sql).toContain("status IN ('SENT', 'VIEWED', 'ACCEPTED')");
    expect(sql).toContain('NEW."authorityAttestedIdentityVersion" := NULL');
  });

  it("claims outbox work with skip-locked leases", async () => {
    const source = await readFile(path.resolve("server/email-outbox.ts"), "utf8");
    expect(source).toContain("FOR UPDATE SKIP LOCKED");
    expect(source).toContain('status = \'SENDING\'');
    expect(source).toContain('"leaseUntil"');
    expect(source).toContain("idempotencyKey");
    expect(source).toContain("is_invite_deliverable");
    expect(source).toContain('status: "CANCELLED"');
  });

  it("retires the incompatible outbox proposal without weakening delivery references", async () => {
    const sql = await readFile(emailOutboxReconciliationMigrationPath, "utf8");
    for (const required of [
      "EmailOutbox_sendable_recipient_check",
      "EmailOutbox_delivery_reference_check",
      "EmailOutbox_lease_state_check",
      "app_private.claim_email_outbox(integer, uuid, integer, integer)",
      "app_private.suspend_identity(uuid, uuid, text, text)",
      'DROP COLUMN IF EXISTS "recipientUserId"',
      'DROP COLUMN IF EXISTS "cancelledAt"',
      'DROP COLUMN IF EXISTS "leaseToken"',
      'DROP COLUMN IF EXISTS "leaseExpiresAt"',
      'type = \'INVITE\' AND "inviteId" IS NOT NULL',
      'type = \'MESSAGE_UNREAD\'',
      '"messageRecipientUserId" IS NOT NULL',
      '"lockedAt" IS NOT NULL',
      '"leaseUntil" IS NOT NULL',
      '"workerId" IS NOT NULL',
    ]) {
      expect(sql).toContain(required);
    }
    expect(sql).toContain("An active legacy EmailOutbox lease requires provider reconciliation.");
  });

  it("uses an unambiguous timestamp variable in the legacy shared rate limiter", async () => {
    const sql = await readFile(rateLimitRepairMigrationPath, "utf8");
    expect(sql).toContain("v_now timestamp(3) := clock_timestamp()");
    expect(sql).not.toMatch(/\bcurrent_time\b/i);
    expect(sql).toContain('rate_bucket."expiresAt" <= v_now');
  });

  it("cleans upload sessions once and delegates image access to the database predicate", async () => {
    const uploadSource = await readFile(path.resolve("server/uploads/service.ts"), "utf8");
    const imageRoute = await readFile(path.resolve("app/api/property-images/[imageId]/route.ts"), "utf8");
    expect(uploadSource).toContain('status: "CLEANED"');
    expect(uploadSource).toContain("propertyIdentityVersion: current.propertyIdentityVersion!");
    expect(imageRoute).toContain("app_private.can_read_property_image");
  });
});
