import { redirect } from "next/navigation";
import { defaultPathForSessionUser } from "./auth-intent";
import { hasRole, type AppRole, type SessionUser } from "./authz";

/**
 * Test double for ./session driven by a mocked getSessionUser. Its
 * requireSessionRole keeps the real redirect contract (login without a session,
 * the role-aware workspace on a role mismatch), so guarded server code is
 * exercised end to end. Use it from a vi.mock factory:
 *
 *   vi.mock("./session", async () =>
 *     (await import("./session-mock.test-helper")).sessionModuleMock(mocks.session));
 */
export function sessionModuleMock(getSessionUser: () => Promise<SessionUser | null>) {
  return {
    getSessionUser,
    async requireSessionRole(role: AppRole, next = "") {
      const user = await getSessionUser();
      if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
      if (!hasRole(user, role)) redirect(defaultPathForSessionUser(user));
      return user;
    },
  };
}
