"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page narrow status-page">
      <h1>Something went wrong</h1>
      <p>We couldn’t complete that request. Try again, and contact an admin if it keeps happening.</p>
      <button className="button primary" onClick={reset} type="button">Try again</button>
    </div>
  );
}
