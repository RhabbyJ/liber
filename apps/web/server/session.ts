import { prisma } from "@liber/db";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { hasRole, type AppRole, type SessionUser } from "./authz";
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

  if (intendedNext && userCanContinueTo(user, intendedNext)) return intendedNext;

  if (role === "seller" || (role === "both" && !hasRole(user, "SELLER")) || intendedNext.startsWith("/seller")) {
    return hasRole(user, "SELLER")
      ? intendedNext || "/seller/properties"
      : `/onboarding/role?next=${encodeURIComponent(intendedNext || "/seller/properties")}`;
  }

  if (role === "buyer" || intendedNext.startsWith("/buyer") || intendedNext.startsWith("/buyers")) {
    return hasRole(user, "BUYER")
      ? intendedNext || "/buyer/profile"
      : `/onboarding/role?next=${encodeURIComponent(intendedNext || "/buyer/profile")}`;
  }

  if (role === "both" && !hasRole(user, "BUYER")) {
    return `/onboarding/role?next=${encodeURIComponent(intendedNext || "/buyer/profile")}`;
  }

  if (intendedNext) return `/onboarding/role?next=${encodeURIComponent(intendedNext)}`;
  return defaultPathForSessionUser(user);
}

function userCanContinueTo(user: SessionUser, next: string) {
  if (next.startsWith("/buyer") || next.startsWith("/buyers")) return hasRole(user, "BUYER");
  if (next.startsWith("/seller")) return hasRole(user, "SELLER");
  if (next.startsWith("/admin")) return hasRole(user, "ADMIN");
  return true;
}
