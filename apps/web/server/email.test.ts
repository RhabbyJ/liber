import { afterEach, describe, expect, it, vi } from "vitest";
import { sendInviteEmail, sendUnreadMessageEmail } from "./email";

describe("invite email adapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses a non-sending mock result unless Resend is configured", async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    const previousFrom = process.env.RESEND_FROM_EMAIL;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;

    const result = await sendInviteEmail({
      to: "maple-haven@example.test",
    });

    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousApiKey;

    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = previousFrom;

    expect(result).toMatchObject({
      provider: "mock",
      queued: false,
    });
  });

  it("sends the outbox idempotency key to Resend", async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    const previousFrom = process.env.RESEND_FROM_EMAIL;
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "Liber <noreply@example.test>";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-id" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        sendInviteEmail(
          {
            to: "maple-haven@example.test",
          },
          { idempotencyKey: "invite/outbox-job" },
        ),
      ).resolves.toMatchObject({ id: "email-id", provider: "resend", queued: true });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.resend.com/emails",
        expect.objectContaining({
          headers: expect.objectContaining({ "Idempotency-Key": "invite/outbox-job" }),
        }),
      );
      const requestBody = String(fetchMock.mock.calls[0]?.[1]?.body ?? "");
      expect(requestBody).toContain("private property invitation");
      expect(requestBody).not.toContain("maple-haven@example.test</p>");
    } finally {
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
      if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
      else process.env.RESEND_FROM_EMAIL = previousFrom;
    }
  });

  it("sends unread-message email without message content", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "Liber <noreply@example.test>");
    vi.stubEnv("SITE_URL", "https://liber.example");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "unread-email-id" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendUnreadMessageEmail({
      conversationId: "019f62c5-1c07-4a62-9f9a-8302778aa011",
      to: "recipient@example.test",
    }, "message-unread/idempotency");

    const requestBody = String(fetchMock.mock.calls[0]?.[1]?.body ?? "");
    expect(requestBody).toContain("https://liber.example/messages/019f62c5-1c07-4a62-9f9a-8302778aa011");
    expect(requestBody).toContain("For your privacy");
    expect(requestBody).not.toContain("private message body");
  });

  it("fails closed instead of marking an unsent production job complete", async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    const previousFrom = process.env.RESEND_FROM_EMAIL;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "https://liber.example");

    try {
      await expect(
        sendInviteEmail({
          to: "maple-haven@example.test",
        }),
      ).rejects.toThrow("Invite email delivery is not configured");
    } finally {
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
      if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
      else process.env.RESEND_FROM_EMAIL = previousFrom;
    }
  });

  it("rejects cleartext production email links", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "Liber <noreply@example.test>");
    vi.stubEnv("SITE_URL", "http://liber.example");

    await expect(sendUnreadMessageEmail({
      conversationId: "019f62c5-1c07-4a62-9f9a-8302778aa011",
      to: "recipient@example.test",
    }, "message-unread/idempotency")).rejects.toThrow("Email links are not configured");
  });

  it("rejects credentialed or non-origin email link bases", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "Liber <noreply@example.test>");

    for (const siteUrl of ["https://user:password@liber.example", "https://liber.example/app"] as const) {
      vi.stubEnv("SITE_URL", siteUrl);
      await expect(sendUnreadMessageEmail({
        conversationId: "019f62c5-1c07-4a62-9f9a-8302778aa011",
        to: "recipient@example.test",
      }, "message-unread/idempotency")).rejects.toThrow("Email links are not configured");
    }
  });

  it("does not use the public site URL as a production email-link fallback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "Liber <noreply@example.test>");
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://liber.example");

    await expect(sendUnreadMessageEmail({
      conversationId: "019f62c5-1c07-4a62-9f9a-8302778aa011",
      to: "recipient@example.test",
    }, "message-unread/idempotency")).rejects.toThrow("Email links are not configured");
  });
});
