"use client";

export default function ErrorPage({
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
        <p className="muted">Review the form fields and try again. If the problem repeats, contact an admin.</p>
        <button className="button" onClick={reset} type="button">Try again</button>
      </section>
    </div>
  );
}
