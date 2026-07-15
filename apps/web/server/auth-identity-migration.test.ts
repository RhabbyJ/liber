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
    const userRelations = schema.match(/\bUser\??\s+@relation\([^\n]+\)/g) ?? [];
    expect(userRelations.length).toBeGreaterThanOrEqual(15);
    expect(userRelations.every((relation) => relation.includes("onUpdate: Restrict"))).toBe(true);
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
    expect(actions).not.toContain('mode: "merge"');
    expect(actions).toContain("persistUserRolesForAuthIdentity");
    expect(actions.indexOf("persistUserRolesForAuthIdentity")).toBeLessThan(
      actions.indexOf("/signup/verify"),
    );
    expect(callback).toContain("establishVerifiedAuthSession(data.user)");
    expect(callback).not.toContain("roles: []");
    expect(callback).not.toContain("rolesFromMetadata");
    expect(callback).not.toContain("user_metadata?.role");
    expect(callback).toContain("identity-recovery-required");
    const identityService = readFileSync(
      path.join(repositoryRoot, "apps/web/server/auth-identity.ts"),
      "utf8",
    );
    expect(identityService).toContain("FOR UPDATE");
    expect(identityService).toContain("roles::text[] AS roles");
    expect(identityService).toContain("rolesAfterSignupSelection");
    expect(identityService).toContain("signupStatusForAuthFailure");
    expect(identityService).toContain("lower(btrim(email))");
    expect(actions).not.toMatch(/error\.message.*identity|error\.message.*already/i);
    expect(session).toContain("normalizeIdentityEmail(dbUser.email)");
    expect(session).toContain('dbUser.status !== "ACTIVE"');
  });

  it("proves suspension against the current AuthOperation schema", () => {
    const repositoryRoot = path.resolve(process.cwd(), "../..");
    const stagingHarness = readFileSync(
      path.join(repositoryRoot, "scripts/test-auth-security-staging.mjs"),
      "utf8",
    );

    expect(stagingHarness).toContain('INSERT INTO public."AuthOperation"');
    expect(stagingHarness).toContain('status = \'SUSPENDED\'');
    expect(stagingHarness).not.toContain("app_private.suspend_identity");
    expect(stagingHarness).not.toContain('"recipientUserId"');
    expect(stagingHarness).not.toContain('"cancelledAt"');
  });

});
