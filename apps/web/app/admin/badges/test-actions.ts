"use server";

import { revalidatePath } from "next/cache";
import type { TestPreapprovalResult } from "../../../lib/test-preapproval";
import { setSelfTestPreapproval } from "../../../server/test-preapproval";

export async function submitSelfTestPreapproval(_previous: TestPreapprovalResult, form: FormData): Promise<TestPreapprovalResult> {
  try {
    const result = await setSelfTestPreapproval(form);
    if (result.ok) {
      for (const path of ["/admin/badges", "/buyer/profile", "/buyer/badges", "/buyers", "/"]) revalidatePath(path, "layout");
    }
    return result;
  } catch (error) {
    console.error("[test-preapproval] save failed", error instanceof Error ? error.name : "Unknown error");
    return { ok: false, message: "The test badge could not be saved. Refresh the page and try again." };
  }
}
