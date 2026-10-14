"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type DragEvent } from "react";
import { createUploadTask, submitUploadTask, type UploadTask } from "../lib/direct-upload";
import { Icon } from "./icon";
import "./direct-upload-field.css";

type Purpose = "BUYER_VERIFICATION" | "PROPERTY_IMAGE" | "PROPERTY_OWNERSHIP";
type SelectedFile = { name: string; size: number };

export function DirectUploadField({
  accept,
  disabledReason,
  documentTypes,
  dropzoneLabel,
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
  /** Presentational: the drop-zone headline (defaults to "Drag a file here or browse"). */
  dropzoneLabel?: string;
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
  const dragDepth = useRef(0);
  const tasks = useRef<UploadTask[]>([]);
  const [documentType, setDocumentType] = useState(documentTypes?.[0]?.value);
  const [message, setMessage] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [typeLocked, setTypeLocked] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const explicitSubmit = purpose === "BUYER_VERIFICATION";
  const selectedCount = selectedFiles.length;
  const blocked = uploading || Boolean(disabledReason);
  const headline = dropzoneLabel ?? (multiple ? "Drag files here or browse" : "Drag a file here or browse");
  const [dragText, browseText] = headline.endsWith(" browse") ? [headline.slice(0, -6), "browse"] : [headline, ""];

  function selectFiles(files: FileList | null) {
    if (busy.current || disabledReason) return;
    const chosen = Array.from(files ?? []);
    tasks.current = chosen.map((file) => createUploadTask(file, { documentType, ownershipEvidenceKind, propertyId, purpose }));
    setSelectedFiles(chosen.map((file) => ({ name: file.name, size: file.size })));
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
      tasks.current = []; setSelectedFiles([]); setTypeLocked(false);
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

  // Dropping a file is the same selection as browsing; a blocked zone swallows the drop so the browser does not open the file.
  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current += 1;
    if (!blocked) setDragOver(true);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = blocked ? "none" : "copy";
  }

  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    if (blocked || !event.dataTransfer.files.length) return;
    const files = event.dataTransfer.files;
    if (multiple || files.length === 1) {
      selectFiles(files);
      return;
    }
    const first = new DataTransfer();
    first.items.add(files[0]);
    selectFiles(first.files);
  }

  const zoneState = [
    "upload-dropzone",
    dragOver ? "is-dragover" : "",
    disabledReason ? "is-disabled" : "",
    uploading ? "is-busy" : "",
    selectedCount ? "has-files" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="field direct-upload">
      {documentTypes ? (
        <div className="direct-upload-type">
          <label htmlFor={`${id}-type`}>Document type</label>
          <select disabled={uploading || typeLocked || Boolean(disabledReason)} id={`${id}-type`} value={documentType} onChange={(event) => {
            const value = event.target.value as typeof documentType;
            setDocumentType(value);
            for (const task of tasks.current) task.scope.documentType = value;
          }}>
            {documentTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      ) : null}
      <label className="direct-upload-label" htmlFor={id}>{label}</label>
      <div
        className={zoneState}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <input
          accept={accept}
          aria-describedby={`${id}-hint`}
          className="upload-dropzone-input"
          disabled={uploading || Boolean(disabledReason)}
          id={id}
          multiple={multiple}
          onChange={(event) => selectFiles(event.currentTarget.files)}
          ref={inputRef}
          type="file"
        />
        <span aria-hidden="true" className="upload-dropzone-icon">
          <Icon name={disabledReason ? "lock" : "upload"} size={24} />
        </span>
        <span aria-hidden="true" className="upload-dropzone-title">
          {disabledReason ? "Uploads unavailable" : (
            <>
              <span className="upload-dropzone-pointer">{dragText}{browseText ? <span className="upload-dropzone-browse">{browseText}</span> : null}</span>
              <span className="upload-dropzone-touch">{multiple ? "Choose files" : "Choose a file"}</span>
            </>
          )}
        </span>
        <span className="upload-dropzone-hint" id={`${id}-hint`}>{disabledReason || hint}{explicitSubmit && !disabledReason ? " Choose a file, then submit it for review." : ""}</span>
      </div>
      {selectedCount ? (
        <ul aria-label="Selected files" className="direct-upload-files">
          {selectedFiles.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <Icon name="doc" size={18} />
              <span className="direct-upload-file-name">{file.name}</span>
              <span className="direct-upload-file-size">{formatFileSize(file.size)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {explicitSubmit || result === "error" ? <div className="direct-upload-actions">
        <button className="button primary" disabled={uploading || selectedCount === 0 || Boolean(disabledReason)} onClick={() => void upload()} type="button">
          {uploading ? "Submitting…" : result === "error" ? "Retry submission" : "Submit for review"}
        </button>
        {result === "error" ? <button className="button secondary" disabled={uploading || Boolean(disabledReason)} onClick={() => {
          tasks.current = []; setSelectedFiles([]); setTypeLocked(false); setResult("idle"); setMessage("");
          if (inputRef.current) { inputRef.current.value = ""; inputRef.current.click(); }
        }} type="button">Choose file again</button> : null}
      </div> : null}
      {message ? (
        <p className={`direct-upload-message ${result}`} role={result === "error" ? "alert" : "status"}>
          {result === "idle" ? null : <Icon name={result === "success" ? "check" : "info"} size={18} />}
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
