"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { createUploadTask, submitUploadTask, type UploadTask } from "../lib/direct-upload";

type Purpose = "BUYER_VERIFICATION" | "PROPERTY_IMAGE" | "PROPERTY_OWNERSHIP";

export function DirectUploadField({
  accept,
  disabledReason,
  documentTypes,
  hint,
  label,
  multiple = false,
  ownershipEvidenceKind,
  propertyId,
  purpose,
}: {
  accept: string;
  disabledReason?: string;
  documentTypes?: Array<{ label: string; value: "PRE_APPROVAL" | "VERIFIED_FUNDS" | "IDENTITY" }>;
  hint: string;
  label: string;
  multiple?: boolean;
  ownershipEvidenceKind?: "GOVERNMENT_ID" | "PROPERTY_ADDRESS_PROOF";
  propertyId?: string;
  purpose: Purpose;
}) {
  const id = useId();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const tasks = useRef<UploadTask[]>([]);
  const [documentType, setDocumentType] = useState(documentTypes?.[0]?.value);
  const [message, setMessage] = useState("");
  const [selectedCount, setSelectedCount] = useState(0);
  const [typeLocked, setTypeLocked] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");
  const [uploading, setUploading] = useState(false);
  const explicitSubmit = purpose === "BUYER_VERIFICATION";

  function selectFiles(files: FileList | null) {
    if (busy.current || disabledReason) return;
    tasks.current = Array.from(files ?? []).map((file) => createUploadTask(file, { documentType, ownershipEvidenceKind, propertyId, purpose }));
    setSelectedCount(tasks.current.length);
    setTypeLocked(false);
    setMessage(""); setResult("idle");
    if (!explicitSubmit) void upload();
  }

  async function upload() {
    if (!tasks.current.length || busy.current || disabledReason) return;
    busy.current = true;
    setUploading(true);
    setTypeLocked(true);
    setResult("idle");
    try {
      for (const task of tasks.current) await submitUploadTask(task, setMessage);
      setMessage(purpose === "PROPERTY_IMAGE" ? "Photos saved successfully." : "Submitted for review. Your document is awaiting an admin decision; there is nothing else to submit.");
      setResult("success");
      tasks.current = []; setSelectedCount(0); setTypeLocked(false);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (error) {
      setResult("error");
      setMessage(error instanceof Error ? error.message : "Upload failed.");
      // A prior file in a multi-file batch may already have completed.
      router.refresh();
    } finally {
      busy.current = false;
      setUploading(false);
    }
  }

  return (
    <div className="field">
      {documentTypes ? (
        <>
          <label htmlFor={`${id}-type`}>Type</label>
          <select disabled={uploading || typeLocked || Boolean(disabledReason)} id={`${id}-type`} value={documentType} onChange={(event) => {
            const value = event.target.value as typeof documentType;
            setDocumentType(value);
            for (const task of tasks.current) task.scope.documentType = value;
          }}>
            {documentTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </>
      ) : null}
      <label htmlFor={id}>{label}</label>
      <input
        accept={accept}
        aria-describedby={`${id}-hint`}
        disabled={uploading || Boolean(disabledReason)}
        id={id}
        multiple={multiple}
        onChange={(event) => selectFiles(event.currentTarget.files)}
        ref={inputRef}
        type="file"
      />
      <span className="field-hint" id={`${id}-hint`}>{disabledReason || hint}{explicitSubmit && !disabledReason ? " Choose a file, then submit it for review." : ""}</span>
      {explicitSubmit || result === "error" ? <div className="actions">
        <button className="button primary" disabled={uploading || selectedCount === 0 || Boolean(disabledReason)} onClick={() => void upload()} type="button">
          {uploading ? "Submitting…" : result === "error" ? "Retry submission" : "Submit for review"}
        </button>
        {result === "error" ? <button className="button secondary" disabled={uploading || Boolean(disabledReason)} onClick={() => {
          tasks.current = []; setSelectedCount(0); setTypeLocked(false); setResult("idle"); setMessage("");
          if (inputRef.current) { inputRef.current.value = ""; inputRef.current.click(); }
        }} type="button">Choose file again</button> : null}
      </div> : null}
      {message ? <p className={result === "idle" ? "field-hint" : `auth-alert ${result}`} role={result === "error" ? "alert" : "status"}>{message}</p> : null}
    </div>
  );
}
