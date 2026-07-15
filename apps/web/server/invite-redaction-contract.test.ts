import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("invite-list moderation projection", () => {
  it("projects the canonical invite-message redaction into every invite list", async () => {
    const source = await readFile(path.resolve("server/contracts.ts"), "utf8");
    const mapper = between(source, "function inviteFromDb", "const buyerInclude");
    const selector = between(source, "const inviteModerationMessages", "async function requireCurrentUser");
    const listQueries = [
      between(source, "export async function listBuyerInvites", "export async function respondToInvite"),
      between(source, "export async function listSellerInvites", "export async function listUsers"),
      between(source, "export async function listAdminInvites", "export async function listPendingDocuments"),
    ];

    expect(selector).toContain('where: { kind: "INVITE" as const }');
    expect(selector).toContain("select: { moderationStatus: true }");
    for (const listQuery of listQueries) {
      expect(listQuery).toContain("messages: inviteModerationMessages");
      expect(listQuery).toContain("invites.map(inviteFromDb)");
    }

    expect(mapper).toContain('message.moderationStatus === "REDACTED"');
    expect(mapper).toContain("visibleMessageBody(");
    expect(mapper).toContain('"REDACTED"');
    expect(mapper).toContain("message: displayMessage");
    expect(source).toContain('import { normalizeMessageBody, visibleMessageBody }');
  });

  it("keeps the newly sent invite response on the unredacted fallback", async () => {
    const source = await readFile(path.resolve("server/contracts.ts"), "utf8");
    const sendInvite = between(source, "export async function sendInvite", "export async function listSellerInvites");

    expect(sendInvite).toContain(
      "inviteFromDb({ ...result.created, conversation: { id: result.conversationId } })",
    );
    expect(sendInvite).not.toContain("messages: inviteModerationMessages");
  });
});

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}
