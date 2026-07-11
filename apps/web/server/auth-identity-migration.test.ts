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
    expect(schema.match(/User\??\s+@relation\([^\n]+onUpdate: Restrict\)/g)).toHaveLength(15);
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
    expect(callback).toContain("identity-recovery-required");
    expect(actions).toContain("persistUserRolesForAuthIdentity");
    const identityService = readFileSync(
      path.join(repositoryRoot, "apps/web/server/auth-identity.ts"),
      "utf8",
    );
    expect(identityService).toContain("FOR UPDATE");
    expect(identityService).toContain("rolesAfterSelfSelection");
    expect(session).toContain("normalizeIdentityEmail(dbUser.email)");
    expect(session).toContain('dbUser.status !== "ACTIVE"');
  });
});
