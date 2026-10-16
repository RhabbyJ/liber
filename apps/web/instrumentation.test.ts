import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureRequestError: vi.fn(), init: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

import { onRequestError, register } from "./instrumentation";

const request = { headers: { cookie: "sb-access-token=secret" }, method: "POST", path: "/api/loi/negotiations" };
const context = {
  revalidateReason: undefined,
  routePath: "/api/loi/negotiations",
  routeType: "route",
  routerKind: "App Router",
} as const;

describe("server error reporting instrumentation", () => {
  beforeEach(() => {
    sentry.init.mockReset();
    sentry.captureRequestError.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("does nothing without SENTRY_DSN", async () => {
    vi.stubEnv("SENTRY_DSN", "  ");

    await register();
    await onRequestError(new Error("boom"), request, context);

    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureRequestError).not.toHaveBeenCalled();
  });

  it("initializes the server SDK with the scrubbing options and reports request errors", async () => {
    vi.stubEnv("SENTRY_DSN", "https://public@o0.ingest.sentry.io/1");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const error = new Error("boom");

    await register();
    await onRequestError(error, request, context);

    expect(sentry.init).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      beforeSend: expect.any(Function),
      dsn: "https://public@o0.ingest.sentry.io/1",
      maxBreadcrumbs: 0,
      registerEsmLoaderHooks: false,
      sendDefaultPii: false,
    }));
    expect(sentry.init.mock.calls[0]?.[0]).not.toHaveProperty("tracesSampleRate");
    expect(sentry.captureRequestError).toHaveBeenCalledExactlyOnceWith(error, request, context);
  });
});
