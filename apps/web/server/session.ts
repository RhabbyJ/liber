import { prisma } from "@liber/db";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { hasRole, type AppRole, type SessionUser } from "./authz";
export { defaultPathForSessionUser, pathForSignedInAuthIntent } from "./auth-intent";
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
    select: { roles: true, status: true },
  });

  if (!dbUser || dbUser.status === "SUSPENDED") return null;
  return { id: userId, roles: dbUser.roles };
});

export async function requireSessionRole(role: AppRole, next = "") {
  const user = await getSessionUser();
  const nextParam = next ? `?next=${encodeURIComponent(next)}` : "";

  if (!user) redirect(`/login${nextParam}`);
  if (!hasRole(user, role)) redirect(`/onboarding/role${nextParam}`);
  return user;
}
