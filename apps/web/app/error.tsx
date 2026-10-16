"use client";

/**
 * Route error boundary. `retry` (stable since Next 16.3) refetches the segment and re-renders
 * it; `reset` would only re-render the failed payload. A thrown value may not be an Error, so
 * the digest is read only after narrowing.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  return (
    <div className="page narrow status-page">
      <h1>Something went wrong</h1>
      <p>We couldn’t complete that request. If you were sending an invite, check Sent invites before trying again. If it keeps happening, send an admin this page and what you were doing.</p>
      {digest ? <p className="small muted">Support reference: {digest}</p> : null}
      <button className="button primary" onClick={() => retry()} type="button">Try again</button>
    </div>
  );
}
