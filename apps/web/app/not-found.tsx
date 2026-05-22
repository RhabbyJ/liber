import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="page narrow">
      <section className="card stack">
        <p className="eyebrow">Not found</p>
        <h1>This page is not available</h1>
        <p className="muted">The record may be private, hidden, or no longer active.</p>
        <Link className="button" href="/">Go home</Link>
      </section>
    </div>
  );
}
