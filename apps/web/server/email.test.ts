import { describe, expect, it } from "vitest";
import { sendInviteEmail } from "./email";

describe("invite email adapter", () => {
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
});
