import { prisma } from "@liber/db";
import { createUploadSessionSchema, finalizeUploadSessionSchema } from "@liber/validators";
import { hasRole, type AppRole } from "../authz";
import { assertRateLimit } from "../rate-limit";
import { createSupabaseAdminClient } from "../supabase";

const SESSION_TTL_MS = 30 * 60_000;

export async function createUploadSession(input: unknown, user: { id: string; roles: AppRole[] }) {
  const data = createUploadSessionSchema.parse(input);
  await assertRateLimit(`upload-session:${user.id}`, 30, 60 * 60_000);

  const scope = await authorizeScope(user.id, user.roles, data);
  const sessionId = `upl_${crypto.randomUUID()}`;
  const bucket = data.purpose === "PROPERTY_IMAGE" ? "property-images" : "verification-documents";
  const storagePath = data.propertyId
    ? `${data.propertyId}/${sessionId}/${storageFileName(data.mimeType)}`
    : `${user.id}/${sessionId}/${storageFileName(data.mimeType)}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.uploadSession.create({
    data: {
      bucket,
      buyerProfileId: scope.buyerProfileId,
      documentType: data.documentType,
      expectedMimeType: data.mimeType,
      expectedSizeBytes: data.sizeBytes,
      expiresAt,
      id: sessionId,
      originalFilename: data.filename,
      ownerUserId: user.id,
      ownershipEvidenceKind: data.ownershipEvidenceKind,
      propertyId: data.propertyId,
      propertyIdentityVersion: scope.propertyIdentityVersion,
      purpose: data.purpose,
      status: "PENDING",
      storagePath,
    },
  });

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    await prisma.uploadSession.delete({ where: { id: sessionId } });
    throw new Error("Supabase Storage is not configured.");
  }
  const { data: signed, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (error || !signed) {
    await prisma.uploadSession.delete({ where: { id: sessionId } });
    throw new Error(error?.message ?? "Unable to create upload URL.");
  }

  return {
    sessionId,
    bucket,
    path: storagePath,
    token: signed.token,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function finalizeUploadSession(input: unknown, user: { id: string; roles: AppRole[] }) {
  const { sessionId } = finalizeUploadSessionSchema.parse(input);
  const session = await prisma.uploadSession.findFirst({
    where: { id: sessionId, ownerUserId: user.id },
  });
  if (!session) throw new Error("Upload session not found.");
  if (session.status === "FINALIZED") return finalizedResponse(session.purpose);
  if (session.status !== "PENDING") throw new Error("Upload session can no longer be finalized.");
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.uploadSession.update({ where: { id: session.id }, data: { status: "EXPIRED" } });
    throw new Error("Upload session expired.");
  }

  if (session.propertyId) {
    const property = await prisma.sellerProperty.findFirst({
      where: { id: session.propertyId, ownerUserId: user.id },
      select: { identityVersion: true },
    });
    if (!property) throw new Error("Property not found.");
    if (session.propertyIdentityVersion !== property.identityVersion) {
      await rejectSession(session.id, "Property identity changed before upload finalization.");
      throw new Error("Property identity changed. Start a new upload.");
    }
  }

  const object = await inspectStorageObject(session.bucket, session.storagePath);
  if (object.size !== session.expectedSizeBytes || object.mimeType !== session.expectedMimeType) {
    await rejectSession(session.id, "Uploaded object metadata did not match the authorized request.");
    throw new Error("Uploaded file does not match the authorized size and type.");
  }
  const detectedMime = await detectStoredMime(session.bucket, session.storagePath);
  if (detectedMime !== session.expectedMimeType) {
    await rejectSession(session.id, "Uploaded object signature did not match its MIME type.");
    throw new Error("Uploaded file signature does not match its declared type.");
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM public."UploadSession" WHERE id = ${session.id} FOR UPDATE`;
    const current = await tx.uploadSession.findUniqueOrThrow({ where: { id: session.id } });
    if (current.status === "FINALIZED") return finalizedResponse(current.purpose);
    if (current.status !== "PENDING" || current.expiresAt.getTime() <= Date.now()) {
      throw new Error("Upload session can no longer be finalized.");
    }
    if (current.propertyId) {
      await tx.$queryRaw`SELECT id FROM public."SellerProperty" WHERE id = ${current.propertyId} FOR UPDATE`;
      const property = await tx.sellerProperty.findFirst({
        where: { id: current.propertyId, ownerUserId: user.id, status: { not: "ARCHIVED" } },
        select: { identityVersion: true },
      });
      if (!property || current.propertyIdentityVersion !== property.identityVersion) {
        throw new Error("Property identity changed. Start a new upload.");
      }
    }
    await tx.uploadSession.update({
      where: { id: current.id },
      data: { status: "UPLOADED", uploadedAt: new Date() },
    });

    let response: { imageId?: string; documentId?: string; status: "FINALIZED" };
    if (current.purpose === "PROPERTY_IMAGE") {
      const image = await tx.propertyImage.create({
        data: {
          altText: current.originalFilename,
          propertyId: current.propertyId!,
          propertyIdentityVersion: current.propertyIdentityVersion!,
          storagePath: current.storagePath,
        },
        select: { id: true },
      });
      response = { imageId: image.id, status: "FINALIZED" };
    } else {
      const documentId = `doc_${crypto.randomUUID()}`;
      await tx.verificationDocument.create({
        data: {
          buyerProfileId: current.buyerProfileId,
          documentType: current.purpose === "PROPERTY_OWNERSHIP" ? "OWNERSHIP" : current.documentType!,
          fileSizeBytes: current.expectedSizeBytes,
          id: documentId,
          mimeType: current.expectedMimeType,
          originalFilename: current.originalFilename,
          ownershipEvidenceKind: current.ownershipEvidenceKind,
          propertyId: current.propertyId,
          propertyIdentityVersion: current.propertyIdentityVersion,
          reviewStatus: "PENDING",
          storageBucket: current.bucket,
          storagePath: current.storagePath,
          uploadedByUserId: user.id,
          userId: user.id,
        },
      });
      if (current.propertyId) {
        await tx.sellerProperty.update({
          where: { id: current.propertyId },
          data: { ownershipVerificationStatus: "PENDING", status: "READY_FOR_REVIEW" },
        });
      }
      response = { documentId, status: "FINALIZED" };
    }

    await tx.adminAuditLog.create({
      data: {
        action: "upload_finalized",
        actorUserId: user.id,
        metadata: { bucket: current.bucket, purpose: current.purpose },
        targetId: current.id,
        targetType: "upload_session",
      },
    });
    await tx.uploadSession.update({
      where: { id: current.id },
      data: { finalizedAt: new Date(), status: "FINALIZED" },
    });
    return response;
  });
  return result;
}

export async function cleanupAbandonedUploads(now = new Date()) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase Storage is not configured.");
  const sessions = await prisma.uploadSession.findMany({
    where: {
      expiresAt: { lte: now },
      status: { in: ["PENDING", "UPLOADED", "REJECTED", "EXPIRED"] },
    },
    select: { bucket: true, id: true, storagePath: true },
    take: 100,
  });
  let removed = 0;
  for (const session of sessions) {
    const { error } = await supabase.storage.from(session.bucket).remove([session.storagePath]);
    if (error) continue;
    const cleaned = await prisma.uploadSession.updateMany({
      where: { id: session.id, status: { in: ["PENDING", "UPLOADED", "REJECTED", "EXPIRED"] } },
      data: { status: "CLEANED" },
    });
    removed += cleaned.count;
  }
  return { inspected: sessions.length, removed };
}

async function authorizeScope(
  userId: string,
  roles: AppRole[],
  data: ReturnType<typeof createUploadSessionSchema.parse>,
) {
  if (data.purpose === "BUYER_VERIFICATION") {
    if (!hasRole({ id: userId, roles }, "BUYER")) throw new Error("Buyer role required.");
    const buyer = await prisma.buyerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!buyer) throw new Error("Buyer profile not found.");
    return { buyerProfileId: buyer.id, propertyIdentityVersion: null };
  }
  if (!hasRole({ id: userId, roles }, "SELLER")) throw new Error("Seller role required.");
  const property = await prisma.sellerProperty.findFirst({
    where: { id: data.propertyId, ownerUserId: userId, status: { not: "ARCHIVED" } },
    select: { identityVersion: true },
  });
  if (!property) throw new Error("Property not found.");
  return { buyerProfileId: null, propertyIdentityVersion: property.identityVersion };
}

async function inspectStorageObject(bucket: string, storagePath: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase Storage is not configured.");
  const slash = storagePath.lastIndexOf("/");
  const folder = storagePath.slice(0, slash);
  const filename = storagePath.slice(slash + 1);
  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    limit: 10,
    search: filename,
  });
  if (error) throw new Error(error.message);
  const object = data.find((item) => item.name === filename);
  if (!object) throw new Error("Uploaded object was not found.");
  const metadata = object.metadata as { mimetype?: string; size?: number } | null;
  return { mimeType: metadata?.mimetype ?? "", size: Number(metadata?.size ?? 0) };
}

async function detectStoredMime(bucket: string, storagePath: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase Storage is not configured.");
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60);
  if (error || !data) throw new Error(error?.message ?? "Unable to inspect upload.");
  const response = await fetch(data.signedUrl, { headers: { Range: "bytes=0-15" }, cache: "no-store" });
  if (!response.ok) throw new Error("Unable to inspect uploaded file signature.");
  return detectMime(new Uint8Array(await response.arrayBuffer()).slice(0, 16));
}

function detectMime(bytes: Uint8Array) {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}

function storageFileName(mimeType: string) {
  if (mimeType === "application/pdf") return "document.pdf";
  if (mimeType === "image/png") return "image.png";
  if (mimeType === "image/jpeg") return "image.jpg";
  return "image.webp";
}

async function rejectSession(id: string, reason: string) {
  await prisma.uploadSession.update({ where: { id }, data: { rejectionReason: reason, status: "REJECTED" } });
}

function finalizedResponse(purpose: string) {
  return { purpose, status: "FINALIZED" as const };
}
