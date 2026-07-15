export type AppRole = "BUYER" | "SELLER" | "ADMIN";

export type SessionUser = {
  avatarVariant?: string | null;
  email?: string;
  id: string;
  name?: string | null;
  roles: AppRole[];
};

export function hasRole(user: SessionUser, role: AppRole) {
  return user.roles.includes(role);
}
