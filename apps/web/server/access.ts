import { prisma } from "@liber/db";
import { redirect } from "next/navigation";
import { hasRole, type SessionUser } from "./authz";
import { getSessionUser } from "./session";

export async function ensureSellerAccessRequested(userId: string) {
  await prisma.sellerAccess.upsert({
    where: { userId },
    create: {
      status: "PENDING",
      userId,
    },
    update: {},
    select: { id: true },
  });
}

export async function sellerAccessStatusForUser(userId: string) {
  const access = await prisma.sellerAccess.findUnique({
    where: { userId },
    select: { status: true },
  });

  return access?.status ?? null;
}

export async function canViewBuyerDirectory(user: SessionUser) {
  if (hasRole(user, "ADMIN")) return true;
  if (!hasRole(user, "SELLER")) return false;
  return (await sellerAccessStatusForUser(user.id)) === "APPROVED";
}

export async function requireApprovedSellerAccess(user?: SessionUser) {
  const currentUser = user ?? await getSessionUser();
  if (!currentUser) redirect("/login");
  if (!hasRole(currentUser, "SELLER") && !hasRole(currentUser, "ADMIN")) redirect("/onboarding/role");

  if (!(await canViewBuyerDirectory(currentUser))) {
    throw new Error("Seller directory access is pending admin approval.");
  }

  return currentUser;
}

export async function canViewBuyerProfile(user: SessionUser, buyerUserId: string) {
  return user.id === buyerUserId || hasRole(user, "ADMIN") || await canViewBuyerDirectory(user);
}
