import { beforeEach, describe, expect, it, vi } from "vitest";
import { grantBadgeSchema } from "@liber/validators";

const mocks = vi.hoisted(() => ({ grantBadge: vi.fn(), revokeBadge: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("./contracts", () => ({ grantBadge: mocks.grantBadge, revokeBadge: mocks.revokeBadge }));
vi.mock("./buyer/commands", () => ({ saveBuyerProfile: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { submitBadgeGrant, submitBadgeRevoke } from "./form-actions";
import { initialBadgeReviewFormState } from "../lib/badge-review-form";

const staleBadge = Object.assign(new Error("No record found for update"), {
  name: "PrismaClientKnownRequestError",
  code: "P2025",
});

describe("badge review form feedback", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ["This badge requires approved document evidence.", "Approve a matching document"],
    ["Badge evidence must be an approved document for this buyer.", "belonging to this buyer"],
    ["Approved evidence is not compatible with this badge.", "matches the badge"],
    ["Buyer profile not found.", "no longer available"],
    ["Rate limit reached. Try again later.", "admin review limit"],
  ])("explains %s without losing the form", async (failure, feedback) => {
    mocks.grantBadge.mockRejectedValue(new Error(failure));
    await expect(submitBadgeGrant(initialBadgeReviewFormState, new FormData())).resolves.toMatchObject({
      ok: false, message: expect.stringContaining(feedback),
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns actionable validation feedback without echoing submitted values", async () => {
    const parsed = grantBadgeSchema.safeParse({});
    if (parsed.success) throw new Error("Expected invalid fixture.");
    mocks.grantBadge.mockRejectedValue(parsed.error);
    await expect(submitBadgeGrant(initialBadgeReviewFormState, new FormData())).resolves.toEqual({
      ok: false, message: "Choose a buyer, badge type, and approved document, then try again.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["grant", "revoke"] as const)("refreshes all affected views only after successful %s", async (operation) => {
    const action = operation === "grant" ? submitBadgeGrant : submitBadgeRevoke;
    const command = operation === "grant" ? mocks.grantBadge : mocks.revokeBadge;
    command.mockResolvedValue({ ok: true });
    const form = new FormData();
    const result = await action(initialBadgeReviewFormState, form);
    expect(result.ok).toBe(true);
    expect(command).toHaveBeenCalledWith(form);
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/admin/badges"], ["/buyer/badges"], ["/buyer/profile"], ["/buyer/notifications"], ["/seller/search"],
    ]);
  });

  it("returns refresh feedback for a badge removed before revocation", async () => {
    mocks.revokeBadge.mockRejectedValue(staleBadge);
    await expect(submitBadgeRevoke(initialBadgeReviewFormState, new FormData())).resolves.toEqual({
      ok: false, message: "This badge is no longer available. Refresh the badges page.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["grant", "revoke"] as const)("preserves authorization redirects and unexpected %s failures", async (operation) => {
    const action = operation === "grant" ? submitBadgeGrant : submitBadgeRevoke;
    const command = operation === "grant" ? mocks.grantBadge : mocks.revokeBadge;
    for (const error of [new Error("NEXT_REDIRECT"), new Error("Database unavailable")]) {
      command.mockRejectedValue(error);
      await expect(action(initialBadgeReviewFormState, new FormData())).rejects.toBe(error);
    }
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
