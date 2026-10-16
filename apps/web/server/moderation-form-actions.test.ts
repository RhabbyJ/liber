import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hide: vi.fn(),
  unhide: vi.fn(),
  reinstate: vi.fn(),
  suspend: vi.fn(),
  sellerWithdraw: vi.fn(),
  adminWithdraw: vi.fn(),
  setVisibility: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("./contracts", () => ({
  hideBuyerProfile: mocks.hide,
  reinstateUser: mocks.reinstate,
  suspendUser: mocks.suspend,
  unhideBuyerProfile: mocks.unhide,
  withdrawInviteAsAdmin: mocks.adminWithdraw,
  withdrawSellerInvite: mocks.sellerWithdraw,
}));
vi.mock("./buyer/commands", () => ({
  BUYER_PROFILE_REQUIRED: "Save your buyer profile before changing its visibility.",
  saveBuyerProfile: vi.fn(),
  setBuyerProfileVisibility: mocks.setVisibility,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

import {
  submitAdminInviteWithdrawal,
  submitBuyerProfileVisibility,
  submitInviteWithdrawal,
  submitProfileHide,
  submitProfileUnhide,
  submitUserReinstatement,
  submitUserSuspension,
} from "./form-actions";

const idle = { ok: false, message: "" };

describe("moderation and visibility form actions", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ["seller withdrawal", submitInviteWithdrawal, mocks.sellerWithdraw, "/seller/invites"],
    ["admin withdrawal", submitAdminInviteWithdrawal, mocks.adminWithdraw, "/admin/invites"],
    ["suspension", submitUserSuspension, mocks.suspend, "/admin/users"],
    ["reinstatement", submitUserReinstatement, mocks.reinstate, "/admin/users"],
    ["profile hide", submitProfileHide, mocks.hide, "/admin/buyer-profiles"],
    ["profile unhide", submitProfileUnhide, mocks.unhide, "/buyer/profile"],
  ])("returns %s feedback inline and refreshes views only after success", async (_name, action, command, path) => {
    const form = new FormData();
    command.mockResolvedValue({ ok: false, message: "Moderation limit reached. Try again later." });
    await expect(action(idle, form)).resolves.toEqual({ ok: false, message: "Moderation limit reached. Try again later." });
    expect(command).toHaveBeenCalledWith(form);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    command.mockResolvedValue({ ok: true, message: "Done." });
    await expect(action(idle, form)).resolves.toEqual({ ok: true, message: "Done." });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
  });

  it("redirects to the paused or republished profile after a visibility change", async () => {
    mocks.setVisibility.mockResolvedValue({ buyerProfileId: "buyer-profile-1", changed: true, visibilityStatus: "DRAFT" });
    await expect(submitBuyerProfileVisibility(idle, new FormData())).rejects.toThrow("redirect:/buyer/profile?status=paused");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/buyers/buyer-profile-1");
    mocks.setVisibility.mockResolvedValue({ buyerProfileId: "buyer-profile-1", changed: true, visibilityStatus: "ACTIVE" });
    await expect(submitBuyerProfileVisibility(idle, new FormData())).rejects.toThrow("redirect:/buyer/profile?status=republished");
  });

  it.each([
    "Budget range is required before publishing.",
    "This profile is controlled by admin review and cannot be published.",
    "Save your buyer profile before changing its visibility.",
  ])("keeps the expected publication failure %j on the profile", async (message) => {
    mocks.setVisibility.mockRejectedValue(new Error(message));
    await expect(submitBuyerProfileVisibility(idle, new FormData())).resolves.toEqual({ ok: false, message });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("lets unexpected visibility failures reach the error boundary", async () => {
    const failure = new Error("Buyer account is no longer active or authorized.");
    mocks.setVisibility.mockRejectedValue(failure);
    await expect(submitBuyerProfileVisibility(idle, new FormData())).rejects.toBe(failure);
  });
});
