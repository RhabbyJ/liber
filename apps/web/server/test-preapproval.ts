import { prisma, type Prisma } from "@liber/db";
import type { SelfTestPreapprovalState, TestPreapprovalResult } from "../lib/test-preapproval";
import { hasRole } from "./authz";
import { ceoPreviewToolsEnabled } from "./ceo-preview";
import { checkRateLimit } from "./rate-limit";
import { getSessionUser } from "./session";

export const TEST_PREAPPROVAL_GRANT = "buyer_test_preapproval_granted";
export const TEST_PREAPPROVAL_REVOKE = "buyer_test_preapproval_revoked";
const TEST_ACTIONS = [TEST_PREAPPROVAL_GRANT, TEST_PREAPPROVAL_REVOKE];
const TEST_DURATION_MS = 24 * 60 * 60_000;
type ReadClient = Pick<Prisma.TransactionClient, "adminAuditLog">;

export async function activeTestPreapprovalProfileIds(client: ReadClient, ids: string[], now = new Date()) {
  if (!ceoPreviewToolsEnabled() || !ids.length) return new Set<string>();
  const rows = await client.adminAuditLog.findMany({
    where: { targetType: "buyer_profile", targetId: { in: ids }, action: { in: TEST_ACTIONS } },
    distinct: ["targetId"],
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { action: true, targetId: true, metadata: true, createdAt: true },
  });
  const active = new Set<string>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.targetId)) continue;
    seen.add(row.targetId);
    const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : null;
    const expiresAt = metadata && typeof metadata.expiresAt === "string" ? Date.parse(metadata.expiresAt) : NaN;
    if (row.action === TEST_PREAPPROVAL_GRANT && metadata?.synthetic === true && metadata.evidenceVerified === false
      && row.createdAt.getTime() <= now.getTime() && expiresAt > now.getTime()
      && expiresAt > row.createdAt.getTime() && expiresAt <= row.createdAt.getTime() + TEST_DURATION_MS) active.add(row.targetId);
  }
  return active;
}

export async function getSelfTestPreapprovalState(): Promise<SelfTestPreapprovalState> {
  const user = await getSessionUser();
  const enabled = Boolean(user && hasRole(user, "ADMIN") && ceoPreviewToolsEnabled());
  const hasBuyerRole = Boolean(user && hasRole(user, "BUYER"));
  const profile = enabled && hasBuyerRole && user
    ? await prisma.buyerProfile.findUnique({ where: { userId: user.id }, select: { id: true } }) : null;
  const active = profile ? (await activeTestPreapprovalProfileIds(prisma, [profile.id])).has(profile.id) : false;
  return { enabled, hasBuyerRole, buyerProfileId: profile?.id ?? null, active };
}

export async function setSelfTestPreapproval(form: FormData): Promise<TestPreapprovalResult> {
  const actor = await getSessionUser();
  if (!actor || !hasRole(actor, "ADMIN")) return { ok: false, message: "Admin access is required." };
  if (!ceoPreviewToolsEnabled()) return { ok: false, message: "Test badges are available only in the enabled demo workspace." };
  const decision = form.get("decision");
  if (decision !== "GRANT" && decision !== "REVOKE") return { ok: false, message: "Choose add or remove test pre-approval." };
  if (decision === "GRANT" && form.get("confirmTest") !== "true") return { ok: false, message: "Confirm that this is a test badge and financing has not been verified." };
  const limit = await checkRateLimit(`admin-self-test-preapproval:${actor.id}`, 30, 60 * 60_000);
  if (!limit.allowed) return { ok: false, message: "The test badge limit has been reached. Try again later." };

  return prisma.$transaction(async (tx) => {
    const [owner] = await tx.$queryRaw<Array<{ roles: string[]; status: string }>>`
      SELECT roles::text[] AS roles, status::text AS status FROM public."User"
      WHERE id = ${actor.id}::uuid FOR UPDATE
    `;
    if (!owner || owner.status !== "ACTIVE" || !owner.roles.includes("ADMIN") || !owner.roles.includes("BUYER")) {
      return { ok: false, message: "An active admin account with a buyer profile is required." };
    }
    // The target is always the actor's existing profile, never a browser-supplied ID.
    const profile = await tx.buyerProfile.findUnique({ where: { userId: actor.id }, select: { id: true, visibilityStatus: true } });
    if (!profile || (decision === "GRANT" && (profile.visibilityStatus === "SUSPENDED" || profile.visibilityStatus === "HIDDEN"))) {
      return { ok: false, message: "Create an available buyer profile before adding a test badge." };
    }
    await tx.$queryRaw`SELECT id FROM public."BuyerProfile" WHERE id = ${profile.id} FOR UPDATE`;
    const now = new Date();
    const active = (await activeTestPreapprovalProfileIds(tx, [profile.id], now)).has(profile.id);
    if (active === (decision === "GRANT")) return { ok: true, message: active ? "Your test pre-approval badge is already active." : "Your test pre-approval badge is already removed." };
    await tx.adminAuditLog.create({ data: {
      action: decision === "GRANT" ? TEST_PREAPPROVAL_GRANT : TEST_PREAPPROVAL_REVOKE,
      actorUserId: actor.id,
      targetType: "buyer_profile",
      targetId: profile.id,
      metadata: { source: "admin-self-test", synthetic: true, evidenceVerified: false,
        ...(decision === "GRANT" ? { expiresAt: new Date(now.getTime() + TEST_DURATION_MS).toISOString() } : {}) },
      createdAt: now,
    } });
    return { ok: true, message: decision === "GRANT"
      ? "Your test pre-approval badge is active for 24 hours. Financing has not been verified."
      : "Your test pre-approval badge was removed." };
  });
}
