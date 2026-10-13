import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendInviteSchema } from "@liber/validators";
import { InviteSendError, inviteSendFeedback } from "./invite-send-errors";
import { MessagingError } from "./messaging/errors";

const mocks = vi.hoisted(() => ({ sendInvite: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("./contracts", () => ({ sendInvite: mocks.sendInvite }));
vi.mock("./buyer/commands", () => ({ saveBuyerProfile: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import { submitInvite } from "./form-actions";

function form() {
  const data = new FormData();
  data.set("propertyId", "synthetic-property");
  data.set("termsAccepted", "true");
  return data;
}

describe("invite send form recovery", () => {
  beforeEach(() => vi.resetAllMocks());

  it("keeps a duplicate invite on the form with its existing conversation and no repeated write", async () => {
    mocks.sendInvite.mockRejectedValue(new InviteSendError("DUPLICATE", "An active invite already exists for this buyer and property.", { conversationId: "synthetic-conversation" }));
    const result = await submitInvite({ message: "" }, form());
    expect(result.message).toContain("already sent an invite");
    expect(result.action).toEqual({ href: "/messages/synthetic-conversation", label: "Open existing conversation" });
    expect(result.values).toEqual({ propertyId: "synthetic-property", termsAccepted: true });
    expect(mocks.sendInvite).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("falls back to sent invites when messaging is unavailable", () => {
    expect(inviteSendFeedback(new InviteSendError("DUPLICATE", "duplicate"))?.action?.href).toBe("/seller/invites");
  });

  it("links an ownership failure to the selected property's verification", () => {
    const result = inviteSendFeedback(new InviteSendError("OWNERSHIP_REQUIRED", "approval required", { propertyId: "synthetic-property" }));
    expect(result?.message).toContain("admin approval");
    expect(result?.action?.href).toBe("/seller/properties/synthetic-property/edit");
  });

  it.each(["ACCESS_REQUIRED", "PROPERTY_UNAVAILABLE", "SELF_INVITE", "DAILY_LIMIT"] as const)("provides a next step for %s", (code) => {
    const result = inviteSendFeedback(new InviteSendError(code, "internal description"));
    expect(result?.message).toBeTruthy();
    expect(result?.action).toBeDefined();
    expect(result?.message).not.toContain("internal description");
  });

  it("explains missing terms without exposing validator data", () => {
    const parsed = sendInviteSchema.safeParse({ buyerProfileId: "synthetic-buyer", propertyId: "synthetic-property", templateKey: "SELLER_PRIVATE_VIEWING", templateVersion: 1, termsAccepted: false });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(inviteSendFeedback(parsed.error)).toEqual({ message: "Confirm the manual-invite terms before sending your invite." });
  });

  it.each(["Invitation is unavailable.", "Conversation is unavailable."])("does not disclose a block or buyer state (%s)", (message) => {
    const result = inviteSendFeedback(new MessagingError("UNAVAILABLE", message, 409));
    expect(result?.message).toBe("This buyer is unavailable for invitations. Return to the directory and choose another buyer.");
    expect(result?.message).not.toMatch(/block|suspend|hidden/i);
  });

  it.each(["Rate limit reached. Try again later.", "Seller directory access is pending admin approval.", "Test-approved properties can only invite the designated demo buyer."])("handles the known external gate: %s", async (message) => {
    mocks.sendInvite.mockRejectedValue(new Error(message));
    expect((await submitInvite({ message: "" }, form())).action).toBeDefined();
  });

  it("does not attempt an invite without a selected property", async () => {
    expect(await submitInvite({ message: "" }, new FormData())).toEqual({ message: "Choose a property before sending your invite." });
    expect(mocks.sendInvite).not.toHaveBeenCalled();
  });

  it.each(["NEXT_REDIRECT", "Unexpected database failure with private details"])("preserves framework redirects and unexpected failures", async (message) => {
    const error = new Error(message);
    mocks.sendInvite.mockRejectedValue(error);
    await expect(submitInvite({ message: "" }, form())).rejects.toBe(error);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([true, false])("retains successful invite routing (messaging=%s)", async (available) => {
    mocks.sendInvite.mockResolvedValue({ data: { conversationAvailable: available, conversationId: "synthetic-conversation" } });
    await expect(submitInvite({ message: "" }, form())).rejects.toThrow(`redirect:${available ? "/messages/synthetic-conversation" : "/seller/invites"}`);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/seller/invites"], ["/seller/properties/synthetic-property/edit"], ["/buyer/notifications"]]);
  });
});
