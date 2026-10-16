import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoiError } from "./errors";
import { loiErrorResponse } from "./http";

const negotiationId = "019f62c5-1c07-4a62-9f9a-8302778aa011";

afterEach(() => vi.restoreAllMocks());

describe("LOI error logging", () => {
  it("logs the route template, error class, Prisma and PostgreSQL codes, and a redacted message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new PrismaClientKnownRequestError(
      'Raw query failed. Code: `23503`. Message: `insert or update on table "LoiRevision" violates foreign key constraint` for seller@example.test',
      { clientVersion: "7.8.0", code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "23503" } } } },
    );
    const request = new Request(`https://liber.example/api/loi/negotiations/${negotiationId}/submit?draft=1`, { method: "POST" });

    const response = loiErrorResponse(error, request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "LOI request failed." });
    expect(log).toHaveBeenCalledExactlyOnceWith("LOI request failed.", {
      code: "P2010",
      dbCode: "23503",
      errorClass: "PrismaClientKnownRequestError",
      message: expect.stringContaining('violates foreign key constraint'),
      route: "/api/loi/negotiations/:id/submit",
    });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("seller@example.test");
    expect(logged).not.toContain(negotiationId);
    expect(logged).not.toContain("draft=1");
  });

  it("names the route on rejected requests and accepts a route template", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    loiErrorResponse(new LoiError("CONFLICT", "Revision changed.", 409), "/api/loi/negotiations/[negotiationId]/agree");

    expect(warn).toHaveBeenCalledExactlyOnceWith("LOI request rejected.", {
      code: "CONFLICT",
      route: "/api/loi/negotiations/[negotiationId]/agree",
      status: 409,
    });
  });

  it("still logs a failure when no route is given", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    loiErrorResponse(new TypeError("Cannot read properties of undefined (reading 'id')"));

    expect(log).toHaveBeenCalledWith("LOI request failed.", expect.objectContaining({
      errorClass: "TypeError",
      route: "unspecified",
    }));
  });
});
