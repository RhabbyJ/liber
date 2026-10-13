import { prisma } from "@liber/db";
import { redirect } from "next/navigation";
import { defaultPathForSessionUser } from "../auth-intent";
import { hasRole } from "../authz";
import { getSessionUser } from "../session";

export type BuyerVerificationDocument = {
  id: string;
  documentType: "PRE_APPROVAL" | "VERIFIED_FUNDS" | "IDENTITY";
  originalFilename: string | null;
  createdAt: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
};

export async function listCurrentBuyerVerificationDocuments(): Promise<BuyerVerificationDocument[]> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fbuyer%2Fbadges");
  if (!hasRole(user, "BUYER")) redirect(defaultPathForSessionUser(user));

  const documents = await prisma.verificationDocument.findMany({
    where: {
      userId: user.id,
      buyerProfile: { userId: user.id },
      propertyId: null,
      documentType: { in: ["PRE_APPROVAL", "VERIFIED_FUNDS", "IDENTITY"] },
    },
    select: {
      id: true,
      documentType: true,
      originalFilename: true,
      createdAt: true,
      reviewStatus: true,
      rejectionReason: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
  });

  return documents.flatMap((document) => {
    if (
      document.documentType !== "PRE_APPROVAL"
      && document.documentType !== "VERIFIED_FUNDS"
      && document.documentType !== "IDENTITY"
    ) return [];

    return [{
      id: document.id,
      documentType: document.documentType,
      originalFilename: document.originalFilename,
      createdAt: document.createdAt.toISOString(),
      reviewStatus: document.reviewStatus,
      rejectionReason: document.reviewStatus === "REJECTED" ? document.rejectionReason : null,
    }];
  });
}
