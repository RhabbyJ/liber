import { describe, expect, it } from "vitest";
import { sendInviteSchema } from "@liber/validators";
import { normalizeInput } from "./normalize-input";

describe("form input normalization", () => {
  it("drops React's useActionState fields so strict schemas still accept the form", () => {
    const form = new FormData();
    form.set("$ACTION_REF_1", "");
    form.set("$ACTION_1:0", JSON.stringify({ id: "action-id", bound: "$@1" }));
    form.set("$ACTION_1:1", JSON.stringify([{ message: "" }]));
    form.set("$ACTION_KEY", "k-action-key");
    form.set("buyerProfileId", "cmv7nezqb00010ocrh3okz9t4");
    form.set("propertyId", "cmv7nsqfu000k0ocrcqy60xw5");
    form.set("templateKey", "SELLER_PRIVATE_VIEWING");
    form.set("templateVersion", "1");
    form.set("termsAccepted", "true");

    const normalized = normalizeInput(form) as Record<string, unknown>;
    expect(Object.keys(normalized).some((key) => key.startsWith("$ACTION"))).toBe(false);
    expect(sendInviteSchema.safeParse(normalized).success).toBe(true);
  });

  it("passes non-form input through unchanged", () => {
    const input = { $ACTION_KEY: "kept", value: 1 };
    expect(normalizeInput(input)).toBe(input);
  });
});
