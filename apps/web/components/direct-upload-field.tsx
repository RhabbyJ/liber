"use client";

import { createClient } from "@supabase/supabase-js";
import { useId, useState } from "react";

type Purpose = "BUYER_VERIFICATION" | "PROPERTY_IMAGE" | "PROPERTY_OWNERSHIP";

export function DirectUploadField({
  accept,
  documentTypes,
  hint,
  label,
  multiple = false,
  ownershipEvidenceKind,
  propertyId,
  purpose,
}: {
  accept: string;
  documentTypes?: Array<{ label: string; value: "PRE_APPROVAL" | "VERIFIED_FUNDS" | "IDENTITY" }>;
  hint: string;
  label: string;
  multiple?: boolean;
  ownershipEvidenceKind?: "GOVERNMENT_ID" | "PROPERTY_ADDRESS_PROOF";
  propertyId?: string;
  purpose: Purpose;
}) {
  const id = useId();
  const [documentType, setDocumentType] = useState(documentTypes?.[0]?.value);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMessage("Preparing secure upload...");
    try {
      for (const file of Array.from(files)) {
        const sessionResponse = await fetch("/api/uploads/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentType,
            filename: file.name,
            mimeType: file.type,
            ownershipEvidenceKind,
            propertyId,
            purpose,
            sizeBytes: file.size,
          }),
        });
        const session = await sessionResponse.json() as {
          bucket?: string;
          error?: string;
          path?: string;
          sessionId?: string;
          token?: string;
        };
        if (!sessionResponse.ok || !session.bucket || !session.path || !session.sessionId || !session.token) {
          throw new Error(session.error || "Unable to create upload session.");
        }
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) throw new Error("Supabase Storage is not configured.");
        setMessage(`Uploading ${file.name} directly to private storage...`);
        const supabase = createClient(url, key, { auth: { persistSession: false } });
        const { error: uploadError } = await supabase.storage
          .from(session.bucket)
          .uploadToSignedUrl(session.path, session.token, file, { contentType: file.type });
        if (uploadError) throw new Error(uploadError.message);
        setMessage(`Finalizing ${file.name}...`);
        const finalizeResponse = await fetch(`/api/uploads/sessions/${encodeURIComponent(session.sessionId)}/finalize`, {
          method: "POST",
        });
        const finalized = await finalizeResponse.json() as { error?: string };
        if (!finalizeResponse.ok) throw new Error(finalized.error || "Unable to finalize upload.");
      }
      setMessage(files.length === 1 ? "Upload submitted successfully." : `${files.length} uploads submitted successfully.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="field">
      {documentTypes ? (
        <>
          <label htmlFor={`${id}-type`}>Type</label>
          <select id={`${id}-type`} value={documentType} onChange={(event) => setDocumentType(event.target.value as typeof documentType)}>
            {documentTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </>
      ) : null}
      <label htmlFor={id}>{label}</label>
      <input
        accept={accept}
        disabled={uploading}
        id={id}
        multiple={multiple}
        onChange={(event) => void upload(event.currentTarget.files)}
        type="file"
      />
      <span className="field-hint">{message || hint}</span>
    </div>
  );
}
