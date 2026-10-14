"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  approveCurrentSellerForCeoPreview,
  grantCurrentAdminForCeoPreview,
} from "../../server/ceo-preview";

export async function enablePreviewSellerAccess() {
  await approveCurrentSellerForCeoPreview();
  revalidatePath("/preview-tools");
  revalidatePath("/");
  redirect("/");
}

export async function enablePreviewAdminAccess() {
  await grantCurrentAdminForCeoPreview();
  revalidatePath("/preview-tools");
  revalidatePath("/admin");
  redirect("/admin?status=preview-admin-enabled");
}
