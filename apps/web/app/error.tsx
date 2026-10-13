"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page narrow status-page">
      <h1>Something went wrong</h1>
      <p>We couldn’t complete that request. If you were sending an invite, check Sent invites before trying again. If it keeps happening, send an admin this page and what you were doing.</p>
      {error.digest ? <p className="small muted">Support reference: {error.digest}</p> : null}
      <button className="button primary" onClick={reset} type="button">Try again</button>
    </div>
  );
}
