import { hasRole, type SessionUser } from "./authz";

export function defaultPathForSessionUser(user: SessionUser) {
  if (hasRole(user, "BUYER")) return "/buyer/profile";
  if (hasRole(user, "SELLER")) return "/seller/properties";
  if (hasRole(user, "ADMIN")) return "/admin";
  return "/onboarding/role";
}

export function pathForSignedInAuthIntent(
  user: SessionUser,
  {
    next = "",
    role = null,
  }: {
    next?: string;
    role?: "buyer" | "seller" | "both" | null;
  },
) {
  const intendedNext = next === "/" ? "" : next;
  const authFlowNext = intendedNext ? isAuthFlowPath(intendedNext) : false;

  if (intendedNext && !authFlowNext && user.roles.length > 0 && userCanContinueTo(user, intendedNext)) {
    return intendedNext;
  }

  if (role === "seller" || (role === "both" && !hasRole(user, "SELLER")) || isPathSegment(intendedNext, "/seller")) {
    return hasRole(user, "SELLER")
      ? intendedNext || "/seller/properties"
      : `/onboarding/role?next=${encodeURIComponent(intendedNext || "/seller/properties")}`;
  }

  if (role === "buyer" || isPathSegment(intendedNext, "/buyer")) {
    return hasRole(user, "BUYER")
      ? intendedNext || "/buyer/profile"
      : `/onboarding/role?next=${encodeURIComponent(intendedNext || "/buyer/profile")}`;
  }

  if (role === "both" && !hasRole(user, "BUYER")) {
    return `/onboarding/role?next=${encodeURIComponent(intendedNext || "/buyer/profile")}`;
  }

  if (intendedNext && !authFlowNext) return `/onboarding/role?next=${encodeURIComponent(intendedNext)}`;
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
