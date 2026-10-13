import { createClient } from "@supabase/supabase-js";

export type UploadScope = {
  purpose: "BUYER_VERIFICATION" | "PROPERTY_IMAGE" | "PROPERTY_OWNERSHIP";
  documentType?: "PRE_APPROVAL" | "VERIFIED_FUNDS" | "IDENTITY";
  ownershipEvidenceKind?: "GOVERNMENT_ID" | "PROPERTY_ADDRESS_PROOF";
  propertyId?: string;
};
type UploadSession = { bucket: string; path: string; sessionId: string; token: string };
export type UploadTask = {
  file: File;
  scope: UploadScope;
  session?: UploadSession;
  stored: boolean;
  completed: boolean;
};

export function createUploadTask(file: File, scope: UploadScope): UploadTask {
  return { file, scope: { ...scope }, stored: false, completed: false };
}

// Keep the authorized session on a failed finalization so retry cannot create a
// second evidence record when the first response was lost after the commit.
export async function submitUploadTask(task: UploadTask, progress: (message: string) => void) {
  if (task.completed) return;
  const { file, scope } = task;
  if (!task.session) {
    progress("Preparing secure upload…");
    const response = await fetch("/api/uploads/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...scope, filename: file.name, mimeType: file.type, sizeBytes: file.size }),
    });
    const result = await response.json();
    if (!response.ok || !result.bucket || !result.path || !result.sessionId || !result.token) {
      throw new Error(result.error || "Unable to prepare the upload. Please try again.");
    }
    task.session = result as UploadSession;
  }
  if (!task.stored) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Secure uploads are temporarily unavailable.");
    progress(`Uploading ${file.name}…`);
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await supabase.storage.from(task.session.bucket)
      .uploadToSignedUrl(task.session.path, task.session.token, file, { contentType: file.type });
    if (error) throw new Error("The file could not be uploaded. Please try again or select it again.");
    task.stored = true;
  }
  progress(scope.purpose === "PROPERTY_IMAGE" ? "Saving photo…" : "Submitting for review…");
  const response = await fetch(`/api/uploads/sessions/${encodeURIComponent(task.session.sessionId)}/finalize`, { method: "POST" });
  const result = await response.json();
  if (!response.ok || result.status !== "FINALIZED") {
    throw new Error(result.error || "The upload has not been submitted yet. Please try again.");
  }
  task.completed = true;
}
