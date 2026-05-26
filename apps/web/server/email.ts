"use server";

export type InviteEmailInput = {
  buyerName: string;
  message: string;
  propertyTitle: string;
  title: string;
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

export async function sendInviteEmail(input: InviteEmailInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from || !input.to) {
    return {
      provider: "mock",
      queued: false,
      reason: "Resend is not configured or buyer email is missing.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from,
      html: [
        `<p>${escapeHtml(input.buyerName)},</p>`,
        `<p>A seller invited you to review <strong>${escapeHtml(input.propertyTitle)}</strong>.</p>`,
        `<p>${escapeHtml(input.message)}</p>`,
        "<p>This is an invitation only. It is not an offer, escrow instruction, or funds custody workflow.</p>",
      ].join(""),
      subject: input.title,
      text: [
        `${input.buyerName},`,
        `A seller invited you to review ${input.propertyTitle}.`,
        input.message,
        "This is an invitation only. It is not an offer, escrow instruction, or funds custody workflow.",
      ].join("\n\n"),
      to: [input.to],
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };

  if (!response.ok) {
    throw new Error(payload.message || "Invite email failed to send.");
  }

  return {
    id: payload.id,
    provider: "resend",
    queued: true,
  };
}
