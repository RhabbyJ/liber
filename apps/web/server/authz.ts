export type AppRole = "BUYER" | "SELLER" | "ADMIN";

export type SessionUser = {
  id: string;
  roles: AppRole[];
};

export function parseRoles(value?: string | null): AppRole[] {
  if (!value) return [];

  return value
    .split(",")
    .map((role) => role.trim().toUpperCase())
    .filter((role): role is AppRole => role === "BUYER" || role === "SELLER" || role === "ADMIN");
}

export function parseRoleList(value: unknown): AppRole[] {
  if (typeof value === "string") return parseRoles(value);
  if (!Array.isArray(value)) return [];

  return value
    .map((role) => (typeof role === "string" ? role.trim().toUpperCase() : ""))
    .filter((role): role is AppRole => role === "BUYER" || role === "SELLER" || role === "ADMIN");
}

export function hasRole(user: SessionUser, role: AppRole) {
  return user.roles.includes(role);
}

export function requireRole(user: SessionUser, role: AppRole) {
  if (!hasRole(user, role)) {
    throw new Error(`Missing required role: ${role}`);
  }
}

export function requireOwnedResource(ownerUserId: string, user: SessionUser) {
  if (ownerUserId !== user.id && !hasRole(user, "ADMIN")) {
    throw new Error("Resource is not owned by the current user.");
  }
}
