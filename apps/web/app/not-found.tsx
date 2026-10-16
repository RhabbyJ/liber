import type { Metadata } from "next";
import Link from "next/link";

// The root not-found shares the layout's segment, so the title is written out in full.
export const metadata: Metadata = {
  title: { absolute: "Page not available · Liber" },
};

export default function NotFoundPage() {
  return (
    <div className="page narrow status-page">
      <h1>This page isn’t available</h1>
      <p>It may be private, hidden, or no longer active.</p>
      <Link className="button primary" href="/">Go to the demand map</Link>
    </div>
  );
}
