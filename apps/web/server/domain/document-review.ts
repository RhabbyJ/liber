import "server-only";

import { prisma } from "@liber/db";
import { reviewDocumentSchema } from "@liber/validators";
import { normalizeInput } from "../normalize-input";
import { verificationDocumentTypeLabel } from "../ownership-evidence";
import { publicNameForDisplay } from "../public-identity";
import { assertRateLimit } from "../rate-limit";
import { requireSessionRole } from "../session";
import { confidentialDocumentAccessEnabled, requireConfidentialDocumentAccess } from "../verification/document-access";

export async function listPendingDocuments(cursor?: string) {
  await requireSessionRole("ADMIN");
  if (!confidentialDocumentAccessEnabled()) return { ok: true, available: false, data: [], nextCursor: null };
  if (cursor !== undefined && (typeof cursor !== "string" || cursor.length === 0 || cursor.length > 200)) {
    throw new Error("Invalid document page.");
  }
  const documents = await prisma.verificationDocument.findMany({
    where: { reviewStatus: "PENDING" },
    include: {
      buyerProfile: { select: { displayName: true, userId: true, user: { select: { name: true } } } },
      property: {
        select: {
          addressLine1: true,
          authorityAttestedByUserId: true,
          authorityAttestedIdentityVersion: true,
          city: true,
          identityVersion: true,
          ownerUserId: true,
          propertyType: true,
        },
      },
      user: { select: { email: true, name: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: 51,
  });
  const page = documents.slice(0, 50);
  const reviewableDocuments = page.filter((document) =>
    document.documentType !== "OWNERSHIP"
    || (
      document.property
      && document.propertyIdentityVersion === document.property.identityVersion
      && document.property.authorityAttestedIdentityVersion === document.property.identityVersion
      && document.property.authorityAttestedByUserId === document.property.ownerUserId
    ));
  return {
    ok: true,
    available: true,
    nextCursor: documents.length > 50 ? page[page.length - 1].id : null,
    data: reviewableDocuments.map((document) => ({
      id: document.id,
      owner: document.user.name || document.user.email,
      subject:
        document.property?.addressLine1 ||
        (document.buyerProfile
          ? publicNameForDisplay(document.buyerProfile.user?.name, document.buyerProfile.userId)
          : null) ||
        document.property?.city ||
        "Verification document",
      type: verificationDocumentTypeLabel(document.documentType, document.ownershipEvidenceKind),
      ownershipEvidenceKind: document.ownershipEvidenceKind,
      status: "Pending",
    })),
  };
}

export async function reviewDocument(input: unknown) {
  const admin = await requireSessionRole("ADMIN");
  requireConfidentialDocumentAccess();
  await assertRateLimit(`admin-review:${admin.id}`, 120, 60 * 60_000);
  const data = reviewDocumentSchema.parse(normalizeInput(input));
  const documentType = await prisma.$transaction(async (tx) => {
    const document = await tx.verificationDocument.findUnique({
      where: { id: data.documentId },
    });
    if (!document || document.reviewStatus !== "PENDING") {
      throw new Error("Document has already been reviewed.");
    }
    if (document.documentType === "OWNERSHIP" && document.propertyId) {
      await tx.$queryRaw`SELECT id FROM public."SellerProperty" WHERE id = ${document.propertyId} FOR UPDATE`;
      const property = await tx.sellerProperty.findUnique({
        where: { id: document.propertyId },
        select: {
          authorityAttestedByUserId: true,
          authorityAttestedIdentityVersion: true,
          identityVersion: true,
          ownerUserId: true,
        },
      });
      if (!property || document.propertyIdentityVersion !== property.identityVersion) {
        throw new Error("Property identity changed after this evidence was uploaded.");
      }
      if (
        property.authorityAttestedIdentityVersion !== property.identityVersion
        || property.authorityAttestedByUserId !== property.ownerUserId
      ) {
        throw new Error("The seller must attest to the current property identity before review.");
      }
    }

    const review = await tx.verificationDocument.updateMany({
      where: { id: data.documentId, reviewStatus: "PENDING" },
      data: {
        rejectionReason: data.decision === "REJECTED" ? data.rejectionReason : null,
        reviewedAt: new Date(),
        reviewedByUserId: admin.id,
        reviewNotes: data.rejectionReason,
        reviewChecklist: {
          identityMatchesOwner: data.identityMatchesOwner ?? false,
          authorityConfirmed: data.authorityConfirmed ?? false,
          addressMatchesProperty: data.addressMatchesProperty ?? false,
          ownerOrEntityMatches: data.ownerOrEntityMatches ?? false,
        },
        reviewStatus: data.decision,
      },
    });
    if (review.count !== 1) throw new Error("Document has already been reviewed.");
    const reviewedDocument = document;
    let propertyVerified = false;

    if (reviewedDocument.documentType === "OWNERSHIP" && reviewedDocument.propertyId) {
      if (data.decision === "APPROVED" && reviewedDocument.ownershipEvidenceKind === "GOVERNMENT_ID"
        && (!data.identityMatchesOwner || !data.authorityConfirmed)) {
        throw new Error("Confirm identity match and seller authority before approving government ID evidence.");
      }
      if (data.decision === "APPROVED" && reviewedDocument.ownershipEvidenceKind === "PROPERTY_ADDRESS_PROOF"
        && (!data.addressMatchesProperty || !data.ownerOrEntityMatches)) {
        throw new Error("Confirm address and owner/entity match before approving address evidence.");
      }
      const ownershipDocuments = await tx.verificationDocument.findMany({
        where: {
          documentType: "OWNERSHIP",
          propertyId: reviewedDocument.propertyId,
          propertyIdentityVersion: reviewedDocument.propertyIdentityVersion,
          reviewStatus: "APPROVED",
        },
        select: {
          id: true,
          ownershipEvidenceKind: true,
        },
      });
      const governmentId = ownershipDocuments.find((item) => item.ownershipEvidenceKind === "GOVERNMENT_ID");
      const addressEvidence = ownershipDocuments.find((item) => item.ownershipEvidenceKind === "PROPERTY_ADDRESS_PROOF");
      if (governmentId && addressEvidence && reviewedDocument.propertyIdentityVersion) {
        const checklist = {
          governmentIdApproved: true,
          addressEvidenceApproved: true,
          identityMatchesOwner: true,
          authorityConfirmed: true,
          addressMatchesProperty: true,
          ownerOrEntityMatches: true,
        };
        await tx.propertyVerificationDecision.upsert({
          where: {
            propertyId_propertyIdentityVersion: {
              propertyId: reviewedDocument.propertyId,
              propertyIdentityVersion: reviewedDocument.propertyIdentityVersion,
            },
          },
          update: {
            addressEvidenceDocumentId: addressEvidence.id,
            checklist,
            decision: "APPROVED",
            governmentIdDocumentId: governmentId.id,
            reviewerUserId: admin.id,
            reviewedAt: new Date(),
          },
          create: {
            addressEvidenceDocumentId: addressEvidence.id,
            checklist,
            decision: "APPROVED",
            governmentIdDocumentId: governmentId.id,
            id: `property_decision_${crypto.randomUUID()}`,
            propertyId: reviewedDocument.propertyId,
            propertyIdentityVersion: reviewedDocument.propertyIdentityVersion,
            reviewerUserId: admin.id,
          },
        });
        await tx.sellerProperty.update({
          where: { id: reviewedDocument.propertyId },
          data: { ownershipVerificationStatus: "APPROVED", status: "READY_FOR_INVITES" },
        });
        propertyVerified = true;
      } else {
        await tx.sellerProperty.update({
          where: { id: reviewedDocument.propertyId },
          data: {
            ownershipVerificationStatus: data.decision === "REJECTED" ? "REJECTED" : "PENDING",
            status: data.decision === "REJECTED" ? "DRAFT" : "READY_FOR_REVIEW",
          },
        });
      }
    }

    const copy = documentReviewCopy(reviewedDocument.documentType === "OWNERSHIP", data.decision, propertyVerified);
    await tx.notification.create({
      data: {
        body: copy.body,
        metadata: {
          decision: data.decision,
          documentId: reviewedDocument.id,
          documentType: reviewedDocument.documentType,
          ...(reviewedDocument.propertyId ? { propertyId: reviewedDocument.propertyId, propertyVerified } : {}),
        },
        title: copy.title,
        type: "document_reviewed",
        userId: reviewedDocument.userId,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        action: "review_document",
        actorUserId: admin.id,
        metadata: { decision: data.decision },
        targetId: data.documentId,
        targetType: "document",
      },
    });
    return reviewedDocument.documentType;
  });
  return { ok: true, data: { ...data, documentType } };
}

function documentReviewCopy(ownership: boolean, decision: "APPROVED" | "REJECTED", propertyVerified: boolean) {
  if (!ownership) {
    return decision === "APPROVED"
      ? { body: "An admin approved your verification document.", title: "Verification document approved" }
      : { body: "Liber couldn’t accept your verification document. Upload a new one to try again.", title: "Verification document not accepted" };
  }
  if (decision === "REJECTED") {
    return { body: "Liber couldn’t accept one of your ownership documents. Upload a new one from your property.", title: "Ownership document not accepted" };
  }
  return propertyVerified
    ? { body: "Your ownership documents are approved. You can now invite buyers to this property.", title: "Property verified" }
    : { body: "Liber approved one of your ownership documents. The property is verified once both are approved.", title: "Ownership document approved" };
}
