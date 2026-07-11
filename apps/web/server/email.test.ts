import { afterEach, describe, expect, it, vi } from "vitest";
import { sendInviteEmail } from "./email";

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
      buyerName: "Maple Haven",
      message: "This property matches your criteria.",
      propertyTitle: "Northridge garden home",
      title: "Property invite",
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
            buyerName: "Maple Haven",
            message: "This property matches your criteria.",
            propertyTitle: "Northridge garden home",
            title: "Property invite",
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
    } finally {
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
      if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
      else process.env.RESEND_FROM_EMAIL = previousFrom;
    }
  });

  it("fails closed instead of marking an unsent production job complete", async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    const previousFrom = process.env.RESEND_FROM_EMAIL;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    vi.stubEnv("NODE_ENV", "production");

    try {
      await expect(
        sendInviteEmail({
          buyerName: "Maple Haven",
          message: "This property matches your criteria.",
          propertyTitle: "Northridge garden home",
          title: "Property invite",
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
});
