import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loiErrorResponse } from "./http";

describe("LOI HTTP errors", () => {
  it("returns bounded term field errors without echoing submitted values", async () => {
    const secretValue = "private-buyer-input-must-not-echo";
    const schema = z.object({
      terms: z.object({
        parties: z.object({ buyerLegalName: z.string().max(3, "Buyer name is too long.") }),
      }),
    });
    const parsed = schema.safeParse({ terms: { parties: { buyerLegalName: secretValue } } });
    if (parsed.success) throw new Error("Expected invalid test input.");

    const response = loiErrorResponse(parsed.error);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body).toEqual({
      code: "INVALID_INPUT",
      error: "Review the highlighted LOI fields.",
      fieldErrors: { "parties.buyerLegalName": "Buyer name is too long." },
    });
    expect(JSON.stringify(body)).not.toContain(secretValue);
  });

  it("keeps non-term validation failures generic", async () => {
    const parsed = z.object({ negotiationId: z.string().uuid() }).safeParse({ negotiationId: "not-an-id" });
    if (parsed.success) throw new Error("Expected invalid test input.");
    const body = await loiErrorResponse(parsed.error).json();
    expect(body).toEqual({ code: "INVALID_INPUT", error: "Invalid LOI request." });
  });

  it("does not reflect attacker-controlled unknown key names", async () => {
    const attackerKey = "private-buyer-input-must-not-echo";
    const schema = z.object({
      terms: z.object({
        funding: z.object({ type: z.literal("CASH") }).strict(),
      }),
    });
    const parsed = schema.safeParse({ terms: { funding: { [attackerKey]: true, type: "CASH" } } });
    if (parsed.success) throw new Error("Expected invalid test input.");

    const body = await loiErrorResponse(parsed.error).json();
    expect(body).toEqual({
      code: "INVALID_INPUT",
      error: "Review the highlighted LOI fields.",
      fieldErrors: { funding: "Remove unsupported fields." },
    });
    expect(JSON.stringify(body)).not.toContain(attackerKey);
  });
});
