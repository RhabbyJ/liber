"use server";

import { fetchWithRetry } from "./external-fetch";
import { configuredSiteOrigin } from "./site-origin";

export type InviteEmailInput = {
  to?: string | null;
};

export type UnreadMessageEmailInput = {
  conversationId: string;
  to?: string | null;
};

export type LoiUpdateEmailInput = {
  negotiationId: string;
  to?: string | null;
};

export type EmailResult = {
  id?: string;
  provider: "mock" | "outbox" | "resend";
  queued: boolean;
  reason?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendInviteEmail(
  input: InviteEmailInput,
  idempotency?: string | { idempotencyKey?: string },
): Promise<EmailResult> {
  return sendResendEmail({
    html: [
      "<p>You have a private property invitation on Liber.</p>",
      `<p><a href="${escapeHtml(authenticatedUrl("/buyer/invites"))}">Sign in to review the invitation</a>.</p>`,
      "<p>This is an invitation only. It is not an offer, escrow instruction, or funds custody workflow.</p>",
    ].join(""),
    missingConfigurationMessage: "Invite email delivery is not configured or buyer email is missing.",
    subject: "You have a Liber invitation",
    text: [
      "You have a private property invitation on Liber.",
      `Sign in to review the invitation: ${authenticatedUrl("/buyer/invites")}`,
      "This is an invitation only. It is not an offer, escrow instruction, or funds custody workflow.",
    ].join("\n\n"),
    to: input.to,
  }, idempotency);
}

export async function sendUnreadMessageEmail(
  input: UnreadMessageEmailInput,
  idempotency?: string | { idempotencyKey?: string },
): Promise<EmailResult> {
  const path = `/messages/${encodeURIComponent(input.conversationId)}`;
  return sendResendEmail({
    html: [
      "<p>You have an unread message on Liber.</p>",
      `<p><a href="${escapeHtml(authenticatedUrl(path))}">Sign in to view the conversation</a>.</p>`,
      "<p>For your privacy, message content is only available after you sign in.</p>",
    ].join(""),
    missingConfigurationMessage: "Unread message email delivery is not configured or recipient email is missing.",
    subject: "You have an unread Liber message",
    text: [
      "You have an unread message on Liber.",
      `Sign in to view the conversation: ${authenticatedUrl(path)}`,
      "For your privacy, message content is only available after you sign in.",
    ].join("\n\n"),
    to: input.to,
  }, idempotency);
}

export async function sendLoiUpdateEmail(
  input: LoiUpdateEmailInput,
  idempotency?: string | { idempotencyKey?: string },
): Promise<EmailResult> {
  const path = `/negotiations/${encodeURIComponent(input.negotiationId)}`;
  return sendResendEmail({
    html: [
      "<p>Your Liber LOI workspace has an update.</p>",
      `<p><a href="${escapeHtml(authenticatedUrl(path))}">Sign in to review the current revision</a>.</p>`,
      "<p>For your privacy, proposed terms are only available after you sign in. Liber is not recording a signature, opening escrow, or moving money.</p>",
    ].join(""),
    missingConfigurationMessage: "LOI update email delivery is not configured or recipient email is missing.",
    subject: "Your Liber LOI has an update",
    text: [
      "Your Liber LOI workspace has an update.",
      `Sign in to review the current revision: ${authenticatedUrl(path)}`,
      "For your privacy, proposed terms are only available after you sign in. Liber is not recording a signature, opening escrow, or moving money.",
    ].join("\n\n"),
    to: input.to,
  }, idempotency);
}

async function sendResendEmail(
  input: {
    html: string;
    missingConfigurationMessage: string;
    subject: string;
    text: string;
    to?: string | null;
  },
  idempotency?: string | { idempotencyKey?: string },
): Promise<EmailResult> {
  const idempotencyKey = typeof idempotency === "string" ? idempotency : idempotency?.idempotencyKey;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from || !input.to) {
    if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
      throw new Error(input.missingConfigurationMessage);
    }
    return {
      provider: "mock",
      queued: false,
      reason: input.missingConfigurationMessage,
    };
  }

  const response = await fetchWithRetry("https://api.resend.com/emails", {
    body: JSON.stringify({
      from,
      html: input.html,
      subject: input.subject,
      text: input.text,
      to: [input.to],
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    method: "POST",
  });

  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };

  if (!response.ok) {
    throw new Error(payload.message || "Email failed to send.");
  }

  return {
    id: payload.id,
    provider: "resend",
    queued: true,
  };
}

function authenticatedUrl(path: string) {
  const origin = configuredSiteOrigin();
  if (!origin) throw new Error("Email links are not configured.");
  return new URL(path, origin).toString();
}
