"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page narrow">
      <section className="card stack">
        <p className="eyebrow">Something went wrong</p>
        <h1>We could not complete that request</h1>
        <p className="muted">Try again. If you were sending an invite, check Sent invites first to see whether it went through. If the problem repeats, send an admin this page and what you were trying to do.</p>
        {error.digest ? <p className="muted small">Support reference: {error.digest}</p> : null}
        <button className="button" onClick={reset} type="button">Try again</button>
      </section>
    </div>
  );
}
