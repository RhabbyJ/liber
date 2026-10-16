import * as Sentry from "@sentry/nextjs";
import { afterAll, describe, expect, it } from "vitest";
import { sentryOptions } from "./error-reporting";

type Envelope = [unknown, Array<[{ type?: string }, unknown]>];

const sent: unknown[] = [];

describe("Sentry server SDK with Liber's options", () => {
  afterAll(async () => {
    await Sentry.close(1_000);
  });

  it("sends a request error without headers, cookies, query strings, or addresses", async () => {
    Sentry.init({
      ...sentryOptions("https://public@o0.ingest.sentry.io/1", "nodejs"),
      transport: () => ({
        flush: async () => true,
        send: async (envelope: unknown) => {
          for (const [header, payload] of (envelope as Envelope)[1]) {
            if (header.type === "event") sent.push(payload);
          }
          return {};
        },
      }),
    });

    Sentry.captureRequestError(
      new Error("Resend rejected buyer@example.test for https://api.resend.com/emails?key=secret-key"),
      {
        headers: {
          authorization: "Bearer secret-token",
          cookie: "sb-access-token=secret-cookie",
          "user-agent": "vitest",
          "x-forwarded-for": "203.0.113.9",
        },
        method: "POST",
        path: "/api/loi/negotiations/abc/submit?token=secret-query",
      },
      { routePath: "/api/loi/negotiations/[negotiationId]/submit", routeType: "route", routerKind: "App Router" },
    );
    await Sentry.flush(2_000);

    expect(sent).toHaveLength(1);
    const event = sent[0] as Sentry.ErrorEvent;
    const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? [];
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((frame) => frame.vars === undefined)).toBe(true);
    expect(event.request).toEqual({ method: "POST" });
    expect(event.contexts?.nextjs).toMatchObject({ request_path: "/api/loi/negotiations/abc/submit" });
    expect(event.transaction).toBe("POST /api/loi/negotiations/[negotiationId]/submit");
    expect(event.exception?.values?.[0]?.value).toBe("Resend rejected [email] for [url]");
    expect(event).not.toHaveProperty("user");
    expect(event).not.toHaveProperty("breadcrumbs");
    // Stack frames carry this test file's own source lines as context.
    const withoutFrames = { ...event, exception: undefined };
    expect(JSON.stringify(withoutFrames)).not.toMatch(/secret|example\.test|203\.0\.113\.9|user-agent|sb-access-token/);
  });
});
