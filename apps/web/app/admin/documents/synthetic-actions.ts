"use server";

import { revalidatePath } from "next/cache";
import { reviewSyntheticProperty, type SyntheticPropertyReviewResult } from "../../../server/synthetic-property-review";

export async function submitSyntheticPropertyReview(_previous: SyntheticPropertyReviewResult, form: FormData): Promise<SyntheticPropertyReviewResult> {
  try {
    const result = await reviewSyntheticProperty(form);
    if (result.ok) {
      for (const path of ["/admin/documents", "/seller/properties", "/seller/invites", "/buyer/invites", "/messages"]) revalidatePath(path);
    }
    return result;
  } catch (error) {
    console.error("[synthetic-property-review] review failed", error instanceof Error ? error.name : "Unknown error");
    return { ok: false, message: "The test approval could not be saved. Refresh the page and try again." };
  }
}
