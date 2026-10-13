"use client";

import { useState, type MouseEvent } from "react";
import type { LoiNegotiation } from "./loi-types";

export function LoiCompletedDownload({ negotiation, historical }: { negotiation: LoiNegotiation; historical: boolean }) {
  const [state, setState] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });
  if (historical || negotiation.status !== "TERMS_ALIGNED"
    || !negotiation.revisions.some((revision) => revision.sequence === negotiation.currentSequence)) return null;

  const href = `/api/loi/negotiations/${encodeURIComponent(negotiation.id)}/pdf`;
  // Fetch first so an expired session or rate limit shows a message instead of saving an error body as a file.
  async function download(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (state.busy) return;
    setState({ busy: true, error: "" });
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) {
        setState({ busy: false, error: response.status === 429 ? "Please wait a moment, then download again." : response.status === 401 ? "Sign in again to download this LOI." : "The PDF could not be prepared. Refresh and try again." });
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "Liber-LOI.pdf";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setState({ busy: false, error: "" });
    } catch {
      setState({ busy: false, error: "The PDF could not be downloaded. Check your connection and try again." });
    }
  }

  return (
    <section aria-label="Completed LOI download" className="card stack tight">
      <h2>Download your completed LOI</h2>
      <p>Save the final agreed terms and calculations as a PDF.</p>
      <a aria-disabled={state.busy || undefined} className="button primary" download href={href} onClick={(event) => void download(event)}>{state.busy ? "Preparing PDF…" : "Download PDF"}</a>
      {state.error ? <p className="field-hint invalid" role="alert">{state.error}</p> : null}
    </section>
  );
}
