import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("auth identity ownership migration", () => {
  it("replaces email rebinding with immutable Auth UUID ownership", () => {
    const repositoryRoot = path.resolve(process.cwd(), "../..");
    const migration = readFileSync(
      path.join(
        repositoryRoot,
        "packages/db/prisma/migrations/20260709000016_harden_auth_identity_ownership/migration.sql",
      ),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const schema = readFileSync(path.join(repositoryRoot, "packages/db/prisma/schema.prisma"), "utf8");

    expect(migration.trimStart().startsWith("-- User ownership")).toBe(true);
    expect(migration).toMatch(/\nBEGIN;\n/);
    expect(migration.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(migration).not.toContain("id = EXCLUDED.id");
    expect(migration).not.toContain("ON CONFLICT (email) DO UPDATE");
    expect(migration).toContain("LIBER_USER_ID_IMMUTABLE");
    expect(migration).toContain("LIBER_IDENTITY_RECOVERY_REQUIRED");
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "User_email_normalized_key"');
    expect(migration.indexOf("LOCK TABLE auth.users")).toBeLessThan(
      migration.indexOf('LOCK TABLE public."User"'),
    );
    expect(migration).toContain(
      "FOREIGN KEY (id) REFERENCES auth.users(id)\n  ON UPDATE RESTRICT ON DELETE RESTRICT",
    );
    expect(migration.match(/REFERENCES public\."User"\(id\)\n    ON UPDATE RESTRICT/g)).toHaveLength(11);
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION app_private.handle_new_user() FROM PUBLIC, anon, authenticated, service_role",
    );
    expect(schema.match(/User\??\s+@relation\([^\n]+onUpdate: Restrict\)/g)).toHaveLength(11);
    expect(schema).not.toContain("@@index([email])");
  });

  it("keeps runtime account creation UUID-only and fails closed on drift", () => {
    const repositoryRoot = path.resolve(process.cwd(), "../..");
    const callback = readFileSync(
      path.join(repositoryRoot, "apps/web/app/auth/callback/route.ts"),
      "utf8",
    );
    const actions = readFileSync(
      path.join(repositoryRoot, "apps/web/server/auth-actions.ts"),
      "utf8",
    );
    const session = readFileSync(
      path.join(repositoryRoot, "apps/web/server/session.ts"),
      "utf8",
    );

    expect(callback).not.toContain("prisma.user.create");
    expect(actions).not.toContain("prisma.user.create");
    expect(actions).not.toContain('mode: "initialize"');
    expect(actions).toContain("establishVerifiedAuthSession");
    expect(callback).toContain("establishVerifiedAuthSession");
    expect(callback).toContain("roles: []");
    expect(callback).not.toContain("rolesFromMetadata");
    expect(callback).not.toContain("user_metadata?.role");
    expect(callback).toContain("identity-recovery-required");
    expect(actions).toContain("persistUserRolesForAuthIdentity");
    const identityService = readFileSync(
      path.join(repositoryRoot, "apps/web/server/auth-identity.ts"),
      "utf8",
    );
    expect(identityService).toContain("FOR UPDATE");
    expect(identityService).toContain("rolesAfterSelfSelection");
    expect(identityService).toContain("signupStatusForAuthFailure");
    expect(identityService).toContain("lower(btrim(email))");
    expect(actions).not.toMatch(/error\.message.*identity|error\.message.*already/i);
    expect(session).toContain("normalizeIdentityEmail(dbUser.email)");
    expect(session).toContain('dbUser.status !== "ACTIVE"');
  });

  it("proposes exact trigger, index, Storage, suspension, and limiter hardening", () => {
    const repositoryRoot = path.resolve(process.cwd(), "../..");
    const proposal = readFileSync(
      path.join(repositoryRoot, "docs/engineering/AUTH_SECURITY_FOLLOWUP_FORWARD.sql"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const login = readFileSync(
      path.join(repositoryRoot, "apps/web/app/api/auth/login/route.ts"),
      "utf8",
    );
    const stagingHarness = readFileSync(
      path.join(repositoryRoot, "scripts/test-auth-security-staging.mjs"),
      "utf8",
    );
    const rollback = readFileSync(
      path.join(repositoryRoot, "docs/engineering/AUTH_SECURITY_FOLLOWUP_ROLLBACK.sql"),
      "utf8",
    );

    expect(proposal).toContain("index_expression IS DISTINCT FROM 'lower(btrim(email))'");
    expect(proposal).toContain("index_is_unique IS DISTINCT FROM true");
    expect(proposal).toContain("AFTER UPDATE OF email ON auth.users");
    expect(proposal).not.toContain("AFTER UPDATE OF raw_user_meta_data");
    expect(proposal).toContain("Authoritative private account name");
    expect(proposal).toContain("app_private.is_active_user()");
    expect(proposal).toContain("DELETE FROM auth.sessions WHERE user_id = p_target_user_id");
    expect(proposal).toContain("app_private.consume_rate_limit");
    expect(proposal).toContain("app_private.prune_rate_limit_buckets");
    expect(proposal).toContain("rate_limit_buckets_expires_at_idx");
    expect(proposal).toContain("app_private.claim_email_outbox");
    expect(proposal).toContain("FOR UPDATE SKIP LOCKED");
    expect(proposal).toContain("UNMATCHED_LEGACY_RECIPIENT");
    expect(proposal).toContain("LEGACY_SENDING_REQUIRES_RECONCILIATION");
    expect(proposal).toContain("EmailOutbox_lease_state_check");
    expect(proposal).toContain('DROP POLICY IF EXISTS "Profile photo owners can upload profile photos"');
    expect(proposal).not.toContain('CREATE POLICY "Profile photo owners can upload profile photos"');
    expect(proposal).not.toContain('CREATE POLICY "Profile photo owners can update profile photos"');
    expect(proposal).not.toContain('CREATE POLICY "Profile photo owners can delete profile photos"');
    expect(proposal).not.toContain('CREATE POLICY "Admins can view all verification documents"');
    expect(login).toContain("resolveAuthIdentity(authData.user)");
    expect(login).toContain("identity-recovery-required");
    expect(login).toContain('error.code === "email_not_confirmed"');
    expect(login).not.toContain("error.message.toLowerCase()");
    expect(stagingHarness).toContain('bucket: "property-images"');
    expect(stagingHarness).toContain("assertSuspendedImageWritesDenied");
    expect(stagingHarness).toContain("property_image_writes_denied_after_suspension");
    expect(stagingHarness).not.toContain('bucket: "profile-photos"');
    expect(stagingHarness).toContain("auth_metadata_role_ignored");
    expect(stagingHarness).toContain("Authenticated admin bypassed the server-mediated document review path");
    expect(rollback).not.toContain("DROP FUNCTION IF EXISTS app_private.claim_email_outbox");
    expect(rollback).toContain("Never deploy the legacy");
  });
});
