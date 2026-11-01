import type { Metadata } from "next";
import Link from "next/link";
import { WheelDots } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <section aria-labelledby="page-title" className="relative isolate flex min-h-[80svh] items-center overflow-hidden bg-ink text-white">
      <div className="bg-dots absolute inset-0 -z-10" aria-hidden="true" />
      <div className="container-site py-36 text-center">
        <WheelDots className="mx-auto h-5 w-auto text-teal" />
        <p className="mt-8 text-[0.8rem] font-bold uppercase tracking-[0.14em] text-teal">Error 404</p>
        <h1 id="page-title" className="text-h1 mt-4">
          This page took a gap year.
        </h1>
        <p className="text-lead mx-auto mt-6 max-w-md text-white/75">We couldn’t find the page you were looking for.</p>
        <Link href="/" className="btn btn-primary mt-10">
          Back to home
        </Link>
      </div>
    </section>
  );
}
