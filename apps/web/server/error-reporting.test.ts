import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubSentryEvent, sentryOptions } from "./error-reporting";

const dsn = "https://public@o0.ingest.sentry.io/1";

describe("Sentry options", () => {
  it("reports errors only, without default PII, tracing, or breadcrumbs", () => {
    const options = sentryOptions(dsn, "nodejs");

    expect(options).toMatchObject({
      dataCollection: {
        cookies: false,
        databaseQueryData: false,
        httpBodies: [],
        httpHeaders: false,
        stackFrameVariables: false,
        urlQueryParams: false,
        userInfo: false,
      },
      dsn,
      maxBreadcrumbs: 0,
      registerEsmLoaderHooks: false,
      sendDefaultPii: false,
    });
    expect(options).not.toHaveProperty("tracesSampleRate");
    expect(options).not.toHaveProperty("tracesSampler");
    expect(options).not.toHaveProperty("replaysSessionSampleRate");
    expect(options.beforeSendTransaction?.({ type: "transaction" }, {})).toBeNull();
    expect(sentryOptions(dsn, "edge")).not.toHaveProperty("registerEsmLoaderHooks");
  });
});

describe("Sentry event scrubbing", () => {
  it("removes request data, user identity, breadcrumbs, and frame variables", () => {
    const event: ErrorEvent = {
      type: undefined,
      breadcrumbs: [{ message: "fetch https://api.resend.com/emails" }],
      contexts: { nextjs: { request_path: "/api/loi/negotiations/abc/submit?token=secret-token", route_type: "route" } },
      exception: {
        values: [{
          type: "Error",
          value: "Resend rejected buyer@example.test",
          stacktrace: { frames: [{ function: "send", vars: { to: "buyer@example.test" } }] },
        }],
      },
      extra: { body: "private message body" },
      message: "Failed for seller@example.test",
      request: {
        cookies: { "sb-access-token": "secret-cookie" },
        data: { terms: "private terms" },
        env: { REMOTE_ADDR: "203.0.113.9" },
        headers: { authorization: "Bearer secret-token", "x-forwarded-for": "203.0.113.9" },
        method: "POST",
        query_string: "token=secret-token",
        url: "https://liber.example/api/loi/negotiations/abc/submit?token=secret-token#draft",
      },
      transaction: "POST /api/loi/negotiations/[negotiationId]/submit",
      user: { email: "buyer@example.test", id: "user-id", ip_address: "203.0.113.9" },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request).toEqual({ method: "POST", url: "https://liber.example/api/loi/negotiations/abc/submit" });
    expect(scrubbed.contexts?.nextjs).toEqual({ request_path: "/api/loi/negotiations/abc/submit", route_type: "route" });
    expect(scrubbed.exception?.values?.[0]?.value).toBe("Resend rejected [email]");
    expect(scrubbed.message).toBe("Failed for [email]");
    expect(scrubbed.transaction).toBe("POST /api/loi/negotiations/[negotiationId]/submit");
    expect(scrubbed).not.toHaveProperty("user");
    expect(scrubbed).not.toHaveProperty("breadcrumbs");
    expect(scrubbed).not.toHaveProperty("extra");
    expect(JSON.stringify(scrubbed)).not.toMatch(/secret|example\.test|203\.0\.113\.9|private/);
  });
});
