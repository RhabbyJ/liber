import { prisma } from "@liber/db";
import { redirect } from "next/navigation";
import { z } from "zod";
import { defaultPathForSessionUser } from "../auth-intent";
import { hasRole } from "../authz";
import { respondToInvite } from "../contracts";
import { LoiError } from "../loi/errors";
import { loiV1EnabledForPair } from "../loi/feature";
import { createLoiNegotiation } from "../loi/service";
import { normalizeMessageBody } from "../messaging/content";
import { MessagingError } from "../messaging/errors";
import { messagingV1EnabledForPair } from "../messaging/feature";
import { blockConversationUser, sendConversationMessage } from "../messaging/service";
import { normalizeInput } from "../normalize-input";
import { getSessionUser } from "../session";

const responseSchema = z.object({
  inviteId: z.string().trim().min(1).max(200),
  intent: z.enum(["QUESTION", "TOUR", "LOI", "DECLINED", "BLOCK"]),
  clientActionId: z.uuid(),
  question: z.string().optional(),
});

type ResponseResult = { ok: true; next: string } | { ok: false; message: string };
const unavailable = "This invitation is unavailable. Refresh your invites to see its current status.";
const questionHint = "Enter a question of 1–500 characters. Do not include personal information.";

export async function respondToBuyerInviteCommand(input: unknown): Promise<ResponseResult> {
  const buyer = await getSessionUser();
  if (!buyer) redirect("/login?next=%2Fbuyer%2Finvites");
  if (!hasRole(buyer, "BUYER")) redirect(defaultPathForSessionUser(buyer));

  const parsed = responseSchema.safeParse(normalizeInput(input));
  if (!parsed.success) return { ok: false, message: "Choose an invite response and try again." };
  const data = parsed.data;
  let question: string | undefined;
  if (data.intent === "QUESTION") {
    try {
      question = normalizeMessageBody(data.question ?? "");
    } catch (error) {
      if (!(error instanceof MessagingError)) throw error;
      return { ok: false, message: questionHint };
    }
    if (Array.from(question).length > 500) return { ok: false, message: questionHint };
  }

  // Conversation routing is always derived from the buyer's owned invite.
  const invite = await prisma.invite.findFirst({
    where: { id: data.inviteId, buyerProfile: { userId: buyer.id } },
    select: { id: true, sellerId: true, conversation: { select: { id: true } } },
  });
  if (!invite) return { ok: false, message: unavailable };

  let acceptedForLoi = false;
  try {
    if (data.intent === "DECLINED") {
      await respondToInvite({ inviteId: invite.id, response: "DECLINED" });
      return { ok: true, next: "/buyer/invites?status=declined" };
    }

    const conversationId = invite.conversation?.id;
    if (!conversationId) {
      return { ok: false, message: "This invitation's conversation is unavailable. Your response was not sent. Please try again later." };
    }

    if (data.intent === "LOI") {
      if (!loiV1EnabledForPair(buyer.id, invite.sellerId)) {
        return { ok: false, message: "LOI preparation is unavailable for this invitation. Your invitation was not changed." };
      }
      await respondToInvite({ inviteId: invite.id, response: "ACCEPTED" });
      acceptedForLoi = true;
      const negotiation = await createLoiNegotiation({ inviteId: invite.id, clientActionId: data.clientActionId });
      return { ok: true, next: `/negotiations/${encodeURIComponent(negotiation.id)}` };
    }

    if (!messagingV1EnabledForPair(buyer.id, invite.sellerId)) {
      return { ok: false, message: "Messaging is unavailable for this invitation. Your response was not sent. Please try again later." };
    }
    if (data.intent === "BLOCK") {
      await blockConversationUser({ conversationId, reason: "Invite block" });
      return { ok: true, next: "/buyer/invites?status=blocked" };
    }

    await sendConversationMessage(data.intent === "QUESTION" ? {
      body: question!, clientMessageId: data.clientActionId, conversationId, kind: "FREE_TEXT",
    } : {
      clientMessageId: data.clientActionId, conversationId, kind: "GUIDED",
      templateKey: "BUYER_SCHEDULE_VIEWING", templateVersion: 1,
    });
    return { ok: true, next: `/messages/${encodeURIComponent(conversationId)}` };
  } catch (error) {
    if (error instanceof MessagingError || error instanceof LoiError) {
      if (error.code === "AUTHENTICATION_REQUIRED") redirect("/login?next=%2Fbuyer%2Finvites");
      if (error.code === "RATE_LIMITED") return { ok: false, message: acceptedForLoi
        ? "Your invitation is accepted, but the LOI request limit was reached. Wait before trying Start LOI again; you can continue in Open chat."
        : "Response limit reached. Please wait before trying again." };
      if (acceptedForLoi) {
        return { ok: false, message: "Your invitation was accepted, but the LOI could not be opened. Try Start LOI again; no LOI success has been confirmed." };
      }
      return { ok: false, message: unavailable };
    }
    if (error instanceof Error && error.message === "Invite cannot be changed after response, identity change, or expiration.") {
      return { ok: false, message: unavailable };
    }
    throw error;
  }
}
