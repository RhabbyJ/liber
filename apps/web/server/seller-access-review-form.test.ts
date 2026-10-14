import { beforeEach, describe, expect, it, vi } from "vitest";

const reviewSellerAccess = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("./contracts", () => ({ reviewSellerAccess }));
vi.mock("./buyer/commands", () => ({ saveBuyerProfile: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { submitSellerAccessReview } from "./form-actions";

describe("seller access form feedback", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns expected review failures to the form instead of the error boundary", async () => {
    const result = { ok: false, message: "This seller account is no longer available. Refresh the users list." };
    reviewSellerAccess.mockResolvedValue(result);
    await expect(submitSellerAccessReview({ ok: false, message: "" }, new FormData())).resolves.toEqual(result);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([true, false])("refreshes the visible status after success (changed=%s)", async (changed) => {
    reviewSellerAccess.mockResolvedValue({ ok: true, changed, data: { status: "APPROVED" } });
    const result = await submitSellerAccessReview({ ok: false, message: "" }, new FormData());
    expect(result).toEqual({ ok: true, message: changed
      ? "Seller directory access approved."
      : "Seller directory access is already approved. No changes were needed." });
    expect(revalidatePath.mock.calls).toEqual([["/admin/users"], ["/"]]);
  });

  it("preserves authorization redirects and unexpected failures", async () => {
    const redirect = new Error("NEXT_REDIRECT");
    reviewSellerAccess.mockRejectedValue(redirect);
    await expect(submitSellerAccessReview({ ok: false, message: "" }, new FormData())).rejects.toBe(redirect);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
