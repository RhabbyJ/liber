import { prisma } from "@liber/db";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { normalizeIdentityEmail } from "./auth-identity";
import { defaultPathForSessionUser, pathForSignedInAuthIntent } from "./auth-intent";
import { hasRole, type AppRole, type SessionUser } from "./authz";
export { defaultPathForSessionUser, pathForSignedInAuthIntent };
import { createSupabaseServerClient } from "./supabase";

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  await connection();

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const userId = data.user.id;

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarVariant: true, email: true, name: true, roles: true, status: true },
  });

  if (
    !dbUser ||
    dbUser.status !== "ACTIVE" ||
    normalizeIdentityEmail(dbUser.email) !== normalizeIdentityEmail(data.user.email)
  ) {
    return null;
  }
  return {
    avatarVariant: dbUser.avatarVariant,
    email: dbUser.email,
    id: userId,
    name: dbUser.name,
    roles: dbUser.roles,
  };
});

export async function requireSessionRole(role: AppRole, next = "") {
  const user = await getSessionUser();
  const nextParam = next ? `?next=${encodeURIComponent(next)}` : "";

  if (!user) redirect(`/login${nextParam}`);
  if (!hasRole(user, role)) redirect(defaultPathForSessionUser(user));
  return user;
}
