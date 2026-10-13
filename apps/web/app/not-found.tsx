import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="page narrow status-page">
      <h1>This page isn’t available</h1>
      <p>It may be private, hidden, or no longer active.</p>
      <Link className="button primary" href="/">Go to the demand map</Link>
    </div>
  );
}
