import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFile(path.resolve(`server/domain/${file}`), "utf8");

describe("invite-list moderation projection", () => {
  it("projects the canonical invite-message redaction into every invite list", async () => {
    const [projection, invites, moderation] = await Promise.all([
      read("invite-projection.ts"),
      read("invites.ts"),
      read("admin-moderation.ts"),
    ]);
    const mapper = between(projection, "export function inviteFromDb", "export async function labelSyntheticInvites");
    const selector = between(projection, "export const inviteModerationMessages", "\n};");
    const listQueries = [
      between(invites, "export async function listBuyerInvites", "export async function respondToInvite"),
      between(invites, "export async function listSellerInvites"),
      between(moderation, "export async function listAdminInvites"),
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
    expect(projection).toContain('import { visibleMessageBody } from "../messaging/content"');
  });

  it("keeps the newly sent invite response on the unredacted fallback", async () => {
    const sendInvite = between(await read("invite-send.ts"), "export async function sendInvite");

    expect(sendInvite).toContain(
      "inviteFromDb({ ...result.created, conversation: { id: result.conversationId } })",
    );
    expect(sendInvite).not.toContain("messages: inviteModerationMessages");
  });
});

/** The source from `start` up to `end`, or to the end of the module when `end` is omitted. */
function between(source: string, start: string, end?: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  if (end === undefined) return source.slice(startIndex);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}
