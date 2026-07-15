import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const mutationRoutes = [
  "app/api/conversations/[conversationId]/messages/route.ts",
  "app/api/conversations/[conversationId]/read/route.ts",
  "app/api/conversations/[conversationId]/mute/route.ts",
  "app/api/conversations/[conversationId]/block/route.ts",
  "app/api/messages/[messageId]/report/route.ts",
];

describe("messaging API security contracts", () => {
  it.each(mutationRoutes)("guards %s with same-origin and private no-store responses", async (route) => {
    const source = await readFile(path.resolve(route), "utf8");
    expect(source).toContain("isRequestSameOrigin(request)");
    expect(source).toContain("privateMessagingJson");
    expect(source).not.toContain("console.log");
  });

  it("keeps the shared error mapper generic and private", async () => {
    const source = await readFile(path.resolve("server/messaging/http.ts"), "utf8");
    expect(source).toContain('"Cache-Control": "private, no-store"');
    expect(source).toContain('error: "Invalid messaging request."');
    expect(source).not.toContain("JSON.stringify(error)");
  });

  it("uses the current DB-backed session and rechecks participant eligibility", async () => {
    const [source, session] = await Promise.all([
      readFile(path.resolve("server/messaging/service.ts"), "utf8"),
      readFile(path.resolve("server/session.ts"), "utf8"),
    ]);
    const sessionGuard = between(source, "async function requireMessagingUser", "async function requireAdminUser");
    expect(sessionGuard).toContain("getSessionUser()");
    expect(sessionGuard).not.toContain("prisma.user.findUnique");
    expect(session).toContain('dbUser.status !== "ACTIVE"');
    expect(session).toContain("roles: dbUser.roles");
    expect(source).toContain('access.participant_role === "SELLER"');
    expect(source).toContain("if (!currentParticipantIsActive(access)) throw messagingNotFound()");
    expect(source).toContain("'BUYER'::public.\"UserRole\" = ANY(buyer_user.roles)");
    expect(source).toContain("'SELLER'::public.\"UserRole\" = ANY(seller.roles)");
  });

  it("revalidates buyer and seller roles before unread email delivery", async () => {
    const source = await readFile(path.resolve("server/email-outbox.ts"), "utf8");
    expect(source).toContain("'BUYER'::public.\"UserRole\" = ANY(buyer_user.roles)");
    expect(source).toContain("'SELLER'::public.\"UserRole\" = ANY(seller.roles)");
    expect(source).toContain("seller_access.status = 'APPROVED'");
  });

  it("does not serialize seller Auth UUIDs in marketplace DTOs", async () => {
    const [contracts, dto] = await Promise.all([
      readFile(path.resolve("server/contracts.ts"), "utf8"),
      readFile(path.resolve("lib/marketplace-dtos.ts"), "utf8"),
    ]);
    expect(contracts).not.toContain("sellerId: invite.sellerId");
    expect(dto).not.toMatch(/export type InviteDTO[\s\S]*?sellerId:/);
    expect(dto).not.toMatch(/export type SellerPropertyDTO[\s\S]*?ownerUserId:/);
    expect(between(contracts, "function propertyFromDb", "async function createVerificationSignedUrl"))
      .not.toContain("ownerUserId");
  });

  it("lets a new unread batch queue after a prior notification was cancelled", async () => {
    const source = await readFile(path.resolve("server/messaging/service.ts"), "utf8");
    expect(source).toContain("AND status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')");
  });

  it("does not cancel a newer unread batch when an older read marker arrives", async () => {
    const source = await readFile(path.resolve("server/messaging/service.ts"), "utf8");
    expect(source).toContain("hasUnreadNotifiableMessage");
    expect(source).toContain("if (!await hasUnreadNotifiableMessage");
    expect(source).toContain("return { data: { lastReadMessageId: effectiveReadMarker.id } }");
  });

  it("relies on the atomic invite trigger and fails closed on a non-canonical result", async () => {
    const [service, contracts] = await Promise.all([
      readFile(path.resolve("server/messaging/service.ts"), "utf8"),
      readFile(path.resolve("server/contracts.ts"), "utf8"),
    ]);
    expect(service).not.toContain("ensureConversationForInvite");
    expect(contracts).toContain("Invite conversation trigger did not create a conversation.");
    expect(contracts).toContain("SELECT count(*)");
    expect(contracts).toContain("participant.role = 'SELLER'");
    expect(contracts).toContain("participant.role = 'BUYER'");
    expect(contracts).toContain("message.kind = 'INVITE'");
  });

  it("uses the canonical pair, invite, conversation lock order", async () => {
    const [service, contracts] = await Promise.all([
      readFile(path.resolve("server/messaging/service.ts"), "utf8"),
      readFile(path.resolve("server/contracts.ts"), "utf8"),
    ]);
    const send = between(service, "export async function sendConversationMessage", "export async function markConversationRead");
    expect(send.indexOf("lockPair(")).toBeLessThan(send.indexOf("lockInvite("));
    expect(send.indexOf("lockInvite(")).toBeLessThan(send.indexOf("lockConversation("));

    const block = between(service, "export async function blockConversationUser", "export async function reportMessage");
    expect(block).toContain("lockPair(");
    expect(block).not.toContain("lockConversation(");

    const respond = between(contracts, "export async function respondToInvite", "export async function searchBuyers");
    expect(respond.indexOf("lockAndAssertInvitePairAvailable(")).toBeLessThan(respond.indexOf("FOR UPDATE"));
  });

  it("projects advisory-lock void results to a driver-supported scalar", async () => {
    const [service, contracts] = await Promise.all([
      readFile(path.resolve("server/messaging/service.ts"), "utf8"),
      readFile(path.resolve("server/contracts.ts"), "utf8"),
    ]);
    const inviteSend = between(contracts, "export async function sendInvite", "export async function listSellerInvites");
    const pairLock = between(service, "async function lockPair", "async function lockConversation");
    const senderLock = between(service, "async function lockMessageSender", "async function messageMarker");

    for (const lockQuery of [inviteSend, pairLock, senderLock]) {
      expect(lockQuery).toContain("pg_advisory_xact_lock");
      expect(lockQuery).toContain("IS NULL AS locked");
    }
  });

  it("checks the DB-backed session's active admin role before exposing report evidence", async () => {
    const [source, session] = await Promise.all([
      readFile(path.resolve("server/messaging/service.ts"), "utf8"),
      readFile(path.resolve("server/session.ts"), "utf8"),
    ]);
    expect(session).toContain("select: { avatarVariant: true, email: true, name: true, roles: true, status: true }");
    expect(session).toContain('dbUser.status !== "ACTIVE"');
    expect(source).toContain('if (!hasRole(currentUser, "ADMIN")) throw messagingNotFound()');
    expect(source).not.toContain("evidenceContext: row.evidence_context");
  });

  it("does not disclose a buyer's block through profile error shape", async () => {
    const contracts = await readFile(path.resolve("server/contracts.ts"), "utf8");
    const profileRead = between(
      contracts,
      "export async function getAuthorizedBuyerProfile",
      "async function isControlledDemoBuyerProfile",
    );
    expect(profileRead).toMatch(
      /if \(await usersHaveMessagingBlock[\s\S]*?error: "NOT_FOUND"[\s\S]*?if \(!\(await canViewBuyerProfile[\s\S]*?error: "UNAUTHORIZED"/,
    );
  });
});

function between(source: string, start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}
