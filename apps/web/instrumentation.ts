import type { Instrumentation } from "next";

// Server and Edge error reporting. Without SENTRY_DSN the SDK is never loaded
// and both hooks do nothing. Browser errors are not reported: there is no
// client SDK, so the Content-Security-Policy needs no Sentry origin.

function sentryDsn() {
  return process.env.SENTRY_DSN?.trim() || null;
}

export async function register() {
  const dsn = sentryDsn();
  if (!dsn) return;
  const [Sentry, { sentryOptions }] = await Promise.all([
    import("@sentry/nextjs"),
    import("./server/error-reporting"),
  ]);
  Sentry.init(sentryOptions(dsn));
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!sentryDsn()) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(error, request, context);
};
