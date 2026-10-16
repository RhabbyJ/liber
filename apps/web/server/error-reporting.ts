import type { Event, init } from "@sentry/nextjs";
import { redactErrorMessage } from "./error-summary";

// Server and Edge error reporting through Sentry: errors only, no tracing,
// session replay, breadcrumbs, or browser SDK. Runtime-neutral; only types are
// imported here so the SDK itself loads only when SENTRY_DSN is set.

type SentryOptions = NonNullable<Parameters<typeof init>[0]>;

export function sentryOptions(dsn: string, runtime = process.env.NEXT_RUNTIME): SentryOptions {
  return {
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    // No tracesSampleRate or tracesSampler: tracing stays disabled.
    maxBreadcrumbs: 0,
    sendDefaultPii: false,
    // In this SDK version dataCollection supersedes sendDefaultPii; turn every
    // category off so request data never leaves the server.
    dataCollection: {
      cookies: false,
      databaseQueryData: false,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
      httpBodies: [],
      httpHeaders: false,
      stackFrameVariables: false,
      urlQueryParams: false,
      userInfo: false,
    },
    beforeSend: (event) => scrubSentryEvent(event),
    beforeSendTransaction: () => null,
    // ESM import hooks only serve performance instrumentation.
    ...(runtime === "nodejs" ? { registerEsmLoaderHooks: false } : {}),
  };
}

/**
 * Removes request headers, cookies, query strings, and bodies, user identity
 * (email, IP address), breadcrumbs, and stack-frame variables from an event,
 * and redacts exception messages. Applied to every event before it is sent.
 */
export function scrubSentryEvent<T extends Event>(event: T): T {
  if (event.request) {
    const { method, url } = event.request;
    event.request = {
      ...(method ? { method } : {}),
      ...(url ? { url: withoutQuery(url) } : {}),
    };
  }
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  if (event.transaction) event.transaction = withoutQuery(event.transaction);
  if (event.message) event.message = redactErrorMessage(event.message);
  if (event.logentry) {
    event.logentry = event.logentry.message ? { message: redactErrorMessage(event.logentry.message) } : {};
  }
  const nextjs = event.contexts?.nextjs;
  if (nextjs && typeof nextjs.request_path === "string") nextjs.request_path = withoutQuery(nextjs.request_path);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactErrorMessage(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) delete frame.vars;
  }
  for (const thread of event.threads?.values ?? []) {
    for (const frame of thread.stacktrace?.frames ?? []) delete frame.vars;
  }
  return event;
}

function withoutQuery(value: string) {
  return value.split(/[?#]/, 1)[0] ?? "";
}
