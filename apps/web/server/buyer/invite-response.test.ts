import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoiError } from "../loi/errors";
import { MessagingError } from "../messaging/errors";

const mocks = vi.hoisted(() => ({
  findInvite: vi.fn(), session: vi.fn(), respond: vi.fn(), send: vi.fn(), block: vi.fn(),
  createLoi: vi.fn(), loiEnabled: vi.fn(), messagingEnabled: vi.fn(), revalidate: vi.fn(),
  redirect: vi.fn((url: string): never => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock("@liber/db", () => ({ prisma: { invite: { findFirst: mocks.findInvite } } }));
vi.mock("../session", () => ({ getSessionUser: mocks.session }));
vi.mock("../contracts", () => ({ respondToInvite: mocks.respond }));
vi.mock("./commands", () => ({ saveBuyerProfile: vi.fn() }));
vi.mock("../loi/feature", () => ({ loiV1EnabledForPair: mocks.loiEnabled }));
vi.mock("../loi/service", () => ({ createLoiNegotiation: mocks.createLoi }));
vi.mock("../messaging/feature", () => ({ messagingV1EnabledForPair: mocks.messagingEnabled }));
vi.mock("../messaging/service", () => ({ blockConversationUser: mocks.block, sendConversationMessage: mocks.send }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { respondToBuyerInviteCommand } from "./invite-response";
import { respondToBuyerInvite } from "../form-actions";

const buyerId = "10000000-0000-4000-8000-000000000001";
const sellerId = "10000000-0000-4000-8000-000000000002";
const conversationId = "20000000-0000-4000-8000-000000000001";
const clientActionId = "30000000-0000-4000-8000-000000000001";
const input = (intent: string, extra = {}) => ({ inviteId: "owned-invite", intent, clientActionId, ...extra });

describe("buyer invitation responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ id: buyerId, roles: ["BUYER"], email: "buyer@example.test", name: "Buyer" });
    mocks.findInvite.mockResolvedValue({ id: "owned-invite", sellerId, conversation: { id: conversationId } });
    mocks.respond.mockResolvedValue({ ok: true });
    mocks.send.mockResolvedValue({ data: { id: "message" }, idempotent: false });
    mocks.block.mockResolvedValue({ ok: true });
    mocks.createLoi.mockResolvedValue({ id: "negotiation" });
    mocks.loiEnabled.mockReturnValue(true);
    mocks.messagingEnabled.mockReturnValue(true);
  });

  it("requires an authenticated buyer before looking up any invitation", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(respondToBuyerInviteCommand(input("TOUR"))).rejects.toThrow("REDIRECT:/login");
    expect(mocks.findInvite).not.toHaveBeenCalled();
  });

  it("rejects a signed-in non-buyer before reading the invitation", async () => {
    mocks.session.mockResolvedValue({ id: buyerId, roles: ["SELLER"] });
    await expect(respondToBuyerInviteCommand(input("TOUR"))).rejects.toThrow("REDIRECT:");
    expect(mocks.findInvite).not.toHaveBeenCalled();
  });

  it("scopes lookup to the current buyer and does not mutate an unowned invitation", async () => {
    mocks.findInvite.mockResolvedValue(null);
    expect(await respondToBuyerInviteCommand(input("TOUR"))).toMatchObject({ ok: false });
    expect(mocks.findInvite).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "owned-invite", buyerProfile: { userId: buyerId } } }));
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.respond).not.toHaveBeenCalled();
  });

  it("ignores a client conversation id and normalizes the question before canonical sending", async () => {
    const question = "  Is the cafe\u0301 nearby?  ";
    expect(await respondToBuyerInviteCommand(input("QUESTION", { question, conversationId: "someone-elses-chat" })))
      .toEqual({ ok: true, next: `/messages/${conversationId}` });
    expect(mocks.send).toHaveBeenCalledWith({ body: "Is the café nearby?", clientMessageId: clientActionId, conversationId, kind: "FREE_TEXT" });
    expect(mocks.respond).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "x".repeat(501)])("rejects an invalid question without changing the invitation", async (question) => {
    expect(await respondToBuyerInviteCommand(input("QUESTION", { question }))).toMatchObject({ ok: false });
    expect(mocks.findInvite).not.toHaveBeenCalled();
    expect(mocks.respond).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("allows exactly 500 characters", async () => {
    expect(await respondToBuyerInviteCommand(input("QUESTION", { question: "x".repeat(500) }))).toMatchObject({ ok: true });
    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it.each(["QUESTION", "TOUR", "LOI"])("does not accept %s when the canonical conversation is missing", async (intent) => {
    mocks.findInvite.mockResolvedValue({ id: "owned-invite", sellerId, conversation: null });
    expect(await respondToBuyerInviteCommand(input(intent, { question: "Can we visit?" }))).toMatchObject({ ok: false });
    expect(mocks.respond).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.createLoi).not.toHaveBeenCalled();
  });

  it.each(["QUESTION", "TOUR"])("leaves %s unsent when messaging is disabled", async (intent) => {
    mocks.messagingEnabled.mockReturnValue(false);
    expect(await respondToBuyerInviteCommand(input(intent, { question: "Can we visit?" }))).toMatchObject({ ok: false });
    expect(mocks.respond).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("declines even without a conversation and with both feature flags off", async () => {
    mocks.findInvite.mockResolvedValue({ id: "owned-invite", sellerId, conversation: null });
    mocks.messagingEnabled.mockReturnValue(false);
    mocks.loiEnabled.mockReturnValue(false);
    expect(await respondToBuyerInviteCommand(input("DECLINED"))).toEqual({ ok: true, next: "/buyer/invites?status=declined" });
    expect(mocks.respond).toHaveBeenCalledWith({ inviteId: "owned-invite", response: "DECLINED" });
  });

  it("sends a tour request through the canonical catalog and preserves the retry id", async () => {
    await respondToBuyerInviteCommand(input("TOUR"));
    await respondToBuyerInviteCommand(input("TOUR"));
    expect(mocks.send.mock.calls).toEqual(Array.from({ length: 2 }, () => [{
      clientMessageId: clientActionId, conversationId, kind: "GUIDED", templateKey: "BUYER_SCHEDULE_VIEWING", templateVersion: 1,
    }]));
    expect(mocks.respond).not.toHaveBeenCalled();
  });

  it("does not accept or report success when message insertion fails", async () => {
    mocks.send.mockRejectedValueOnce(new MessagingError("UNAVAILABLE", "Unavailable", 403));
    expect(await respondToBuyerInviteCommand(input("TOUR"))).toMatchObject({ ok: false });
    expect(mocks.respond).not.toHaveBeenCalled();
  });

  it("checks the LOI cohort before accepting the invitation", async () => {
    mocks.loiEnabled.mockReturnValue(false);
    expect(await respondToBuyerInviteCommand(input("LOI"))).toMatchObject({ ok: false });
    expect(mocks.loiEnabled).toHaveBeenCalledWith(buyerId, sellerId);
    expect(mocks.respond).not.toHaveBeenCalled();
    expect(mocks.createLoi).not.toHaveBeenCalled();
  });

  it("returns explicit partial failure and permits a retry of an accepted invitation", async () => {
    mocks.createLoi.mockRejectedValueOnce(new LoiError("UNAVAILABLE", "Unavailable", 403));
    const failure = await respondToBuyerInviteCommand(input("LOI"));
    expect(failure).toMatchObject({ ok: false, message: expect.stringContaining("invitation was accepted") });
    expect(await respondToBuyerInviteCommand(input("LOI"))).toEqual({ ok: true, next: "/negotiations/negotiation" });
    expect(mocks.createLoi.mock.calls).toEqual(Array.from({ length: 2 }, () => [{ inviteId: "owned-invite", clientActionId }]));
  });

  it("gives a wait instruction when LOI creation is rate limited after acceptance", async () => {
    mocks.createLoi.mockRejectedValueOnce(new LoiError("RATE_LIMITED", "LOI request limit reached.", 429));
    const result = await respondToBuyerInviteCommand(input("LOI"));
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("Wait before trying Start LOI again") });
    expect(result).not.toHaveProperty("next");
  });

  it("blocks the canonical participant rather than a client-supplied conversation", async () => {
    expect(await respondToBuyerInviteCommand(input("BLOCK", { conversationId: "wrong" })))
      .toEqual({ ok: true, next: "/buyer/invites?status=blocked" });
    expect(mocks.block).toHaveBeenCalledWith({ conversationId, reason: "Invite block" });
  });

  it("returns an inline result for a closed invitation", async () => {
    mocks.respond.mockRejectedValueOnce(new Error("Invite cannot be changed after response, identity change, or expiration."));
    expect(await respondToBuyerInviteCommand(input("DECLINED"))).toMatchObject({ ok: false });
  });

  it("preserves auth redirects and unexpected failures instead of claiming success", async () => {
    mocks.send.mockRejectedValueOnce(new MessagingError("AUTHENTICATION_REQUIRED", "Sign in", 401));
    await expect(respondToBuyerInviteCommand(input("TOUR"))).rejects.toThrow("REDIRECT:/login");
    const unexpected = new Error("Unexpected service failure");
    mocks.send.mockRejectedValueOnce(unexpected);
    await expect(respondToBuyerInviteCommand(input("TOUR"))).rejects.toBe(unexpected);
  });

  it("validates intent and action id before any mutation", async () => {
    expect(await respondToBuyerInviteCommand(input("ACCEPTED"))).toMatchObject({ ok: false });
    expect(await respondToBuyerInviteCommand(input("TOUR", { clientActionId: "bad" }))).toMatchObject({ ok: false });
    expect(mocks.findInvite).not.toHaveBeenCalled();
  });

  it("server action refreshes both inboxes and redirects only after successful work", async () => {
    const form = new FormData();
    Object.entries(input("TOUR")).forEach(([key, value]) => form.set(key, value));
    await expect(respondToBuyerInvite({ ok: false, message: "" }, form)).rejects.toThrow(`REDIRECT:/messages/${conversationId}`);
    expect(mocks.revalidate.mock.calls).toEqual([["/buyer/invites"], ["/buyer/profile"], ["/messages"], ["/seller/invites"]]);
    mocks.revalidate.mockClear();
    mocks.messagingEnabled.mockReturnValue(false);
    expect(await respondToBuyerInvite({ ok: false, message: "" }, form)).toMatchObject({ ok: false });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
