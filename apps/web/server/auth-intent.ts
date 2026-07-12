import { hasRole, type SessionUser } from "./authz";

export function defaultPathForSessionUser(user: SessionUser) {
  if (hasRole(user, "BUYER")) return "/buyer/profile";
  if (hasRole(user, "SELLER")) return "/seller/properties";
  if (hasRole(user, "ADMIN")) return "/admin";
  return "/";
}

export function pathForSignedInAuthIntent(
  user: SessionUser,
  { next = "" }: { next?: string },
) {
  const intendedNext = next === "/" ? "" : next;
  const authFlowNext = intendedNext ? isAuthFlowPath(intendedNext) : false;

  if (intendedNext && !authFlowNext && userCanContinueTo(user, intendedNext)) {
    return intendedNext;
  }
  return defaultPathForSessionUser(user);
}

function userCanContinueTo(user: SessionUser, next: string) {
  if (isPathSegment(next, "/buyers")) return hasRole(user, "BUYER") || hasRole(user, "SELLER") || hasRole(user, "ADMIN");
  if (isPathSegment(next, "/buyer")) return hasRole(user, "BUYER");
  if (isPathSegment(next, "/seller")) return hasRole(user, "SELLER");
  if (isPathSegment(next, "/admin")) return hasRole(user, "ADMIN");
  return true;
}

function isPathSegment(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isAuthFlowPath(path: string) {
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  return pathname === "/login" || pathname === "/onboarding/role" || pathname === "/auth/callback" || pathname.startsWith("/signup");
}
