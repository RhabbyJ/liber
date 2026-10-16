"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

// Replaces the root layout when it fails, so none of its styles, fonts, or
// navigation load: everything this page needs is inline. Server errors are
// reported by instrumentation.ts; there is deliberately no browser SDK here.

const ink = "#2a2a33";
const sage = "#5fbe43";

const styles = {
  body: {
    background: "#ffffff",
    color: ink,
    fontFamily: '"Open Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    margin: 0,
  },
  header: {
    alignItems: "center",
    borderBottom: "1px solid #d1d1d5",
    display: "flex",
    gap: 10,
    height: 64,
    padding: "0 24px",
  },
  mark: {
    alignItems: "center",
    background: sage,
    borderRadius: 8,
    display: "inline-flex",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  markCenter: { background: "#ffffff", borderRadius: 2, height: 11, transform: "rotate(45deg)", width: 11 },
  wordmark: { fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 },
  main: { display: "grid", gap: 16, margin: "0 auto", maxWidth: 640, padding: "64px 24px" },
  heading: { fontSize: 32, lineHeight: "40px", margin: 0 },
  copy: { color: "#54545a", fontSize: 16, lineHeight: "24px", margin: 0 },
  reference: { color: "#596b82", fontSize: 14, lineHeight: "20px", margin: 0 },
  actions: { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 },
  primary: {
    background: sage,
    border: `1px solid ${sage}`,
    borderRadius: 4,
    color: "#ffffff",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 700,
    minHeight: 44,
    padding: "9px 16px",
  },
  secondary: {
    alignItems: "center",
    background: "#ffffff",
    border: "1px solid #a7a6ab",
    borderRadius: 4,
    boxSizing: "border-box",
    color: ink,
    display: "inline-flex",
    fontWeight: 700,
    minHeight: 44,
    padding: "9px 16px",
    textDecoration: "none",
  },
} satisfies Record<string, CSSProperties>;

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
    ? error.digest
    : null;

  return (
    <html lang="en">
      <body style={styles.body}>
        <title>Something went wrong · Liber</title>
        <header style={styles.header}>
          <span aria-hidden="true" style={styles.mark}>
            <span style={styles.markCenter} />
          </span>
          <span style={styles.wordmark}>Liber</span>
        </header>
        <main style={styles.main}>
          <h1 style={styles.heading}>Something went wrong</h1>
          <p style={styles.copy}>
            Liber couldn’t load this page. Try again, or return to the home page. If it keeps
            happening, send an admin this page and what you were doing.
          </p>
          {digest ? <p style={styles.reference}>Support reference: {digest}</p> : null}
          <div style={styles.actions}>
            <button onClick={retry} style={styles.primary} type="button">Try again</button>
            <Link href="/" prefetch={false} style={styles.secondary}>Go to the home page</Link>
          </div>
        </main>
      </body>
    </html>
  );
}
