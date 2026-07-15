"use server";

import { revalidatePath } from "next/cache";
import { resolveMessageReport } from "../../../server/messaging/service";

export type AdminReportActionState = { message: string; ok: boolean };

const allowedStatuses = new Set(["ACTIONED", "DISMISSED", "IN_REVIEW"] as const);

export async function resolveAdminMessageReport(
  _state: AdminReportActionState,
  formData: FormData,
): Promise<AdminReportActionState> {
  const reportId = formData.get("reportId");
  const status = formData.get("status");
  const resolution = formData.get("resolution");
  if (
    typeof reportId !== "string"
    || typeof status !== "string"
    || !allowedStatuses.has(status as "ACTIONED" | "DISMISSED" | "IN_REVIEW")
    || typeof resolution !== "string"
    || (status !== "IN_REVIEW" && !resolution.trim())
  ) {
    return { message: "Choose a status and add an internal resolution note.", ok: false };
  }

  try {
    await resolveMessageReport({
      reportId,
      resolution: resolution.trim(),
      status: status as "ACTIONED" | "DISMISSED" | "IN_REVIEW",
      redactMessage: status === "ACTIONED" && formData.get("redactMessage") === "true",
    });
    revalidatePath("/admin/reports");
    revalidatePath(`/admin/reports/${reportId}`);
    return { message: "Report resolution saved.", ok: true };
  } catch {
    return { message: "The report resolution could not be saved.", ok: false };
  }
}
