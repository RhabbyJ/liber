export type AppIdentityRecord = {
  email: string;
  id: string;
  roles: Array<"ADMIN" | "BUYER" | "SELLER">;
  status: "ACTIVE" | "SUSPENDED";
};

export type AuthIdentityResolution =
  | { kind: "linked"; user: AppIdentityRecord }
  | { kind: "collision" }
  | { kind: "missing" };

type SelfSelectableRole = "BUYER" | "SELLER";

export function normalizeIdentityEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function classifyAuthIdentity(
  authUser: { email?: string | null; id: string },
  appUserById: AppIdentityRecord | null,
  appUserByEmail: Pick<AppIdentityRecord, "id"> | null,
): AuthIdentityResolution {
  const authEmail = normalizeIdentityEmail(authUser.email);

  if (appUserById) {
    if (!authEmail || normalizeIdentityEmail(appUserById.email) !== authEmail) {
      return { kind: "collision" };
    }
    if (appUserByEmail && appUserByEmail.id !== authUser.id) {
      return { kind: "collision" };
    }
    return { kind: "linked", user: appUserById };
  }

  return appUserByEmail ? { kind: "collision" } : { kind: "missing" };
}

export function rolesAfterSelfSelection(
  currentRoles: AppIdentityRecord["roles"],
  requestedRoles: AppIdentityRecord["roles"],
  mode: "initialize" | "merge",
) {
  if (requestedRoles.some((role): role is "ADMIN" => role === "ADMIN")) {
    throw new Error("ADMIN cannot be assigned through customer role selection.");
  }

  const safeRequestedRoles = requestedRoles as SelfSelectableRole[];
  if (mode === "initialize" && currentRoles.length > 0) return currentRoles;
  return Array.from(new Set([...(mode === "merge" ? currentRoles : []), ...safeRequestedRoles]));
}
