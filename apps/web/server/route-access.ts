import type { AppRole } from "./authz";

export function requiresAuthenticatedUser(pathname: string) {
  return isPathSegment(pathname, "/buyers") || requiredRoleForPath(pathname) !== null;
}

export function requiredRoleForPath(pathname: string): AppRole | null {
  if (isPathSegment(pathname, "/admin")) return "ADMIN";
  if (isPathSegment(pathname, "/buyer")) return "BUYER";
  if (isPathSegment(pathname, "/seller")) return "SELLER";
  return null;
}

function isPathSegment(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
