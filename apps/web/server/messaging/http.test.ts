import { afterEach, describe, expect, it, vi } from "vitest";
import { MessagingError } from "./errors";
import { describeMessagingFailure, messagingErrorResponse, sanitizeErrorMessage } from "./http";

afterEach(() => vi.restoreAllMocks());

const route = "POST /api/conversations/[conversationId]/messages";

function prismaRawQueryError(originalMessage: string, extraLines = "") {
  return Object.assign(
    new Error(`Raw query failed. Code: \`22P02\`. Message: \`${originalMessage}\`${extraLines}`),
    {
      name: "PrismaClientKnownRequestError",
      code: "P2010",
      meta: {
        driverAdapterError: Object.assign(new Error(originalMessage), {
          name: "DriverAdapterError",
          cause: { kind: "postgres", originalCode: "22P02", originalMessage },
        }),
      },
    },
  );
}

describe("messaging HTTP observability", () => {
  it("logs metadata-only rejection fields and never echoes internal error text", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = messagingErrorResponse(new MessagingError(
      "UNAVAILABLE",
      "Private message body and recipient@example.test",
      409,
    ));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "UNAVAILABLE",
      error: "Conversation is unavailable.",
    });
    expect(warning).toHaveBeenCalledWith("Messaging request rejected.", {
      code: "UNAVAILABLE",
      status: 409,
    });
    expect(JSON.stringify(warning.mock.calls)).not.toContain("Private message body");
    expect(JSON.stringify(warning.mock.calls)).not.toContain("recipient@example.test");
  });

  it("adds the fixed route label to rejection logs", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    messagingErrorResponse(new MessagingError("RATE_LIMITED", "Too many", 429), { route });
    expect(warning).toHaveBeenCalledWith("Messaging request rejected.", { code: "RATE_LIMITED", route, status: 429 });
  });

  it("logs route, error class, Prisma and PostgreSQL codes with a sanitized message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = prismaRawQueryError(
      'invalid input syntax for type uuid: "buyer@example.test"',
      "\n  body: 'Private message body', clientMessageId: '019f62c5-1c07-4a62-9f9a-8302778aa014'",
    );

    const response = messagingErrorResponse(error, { route });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Messaging request failed." });
    expect(log).toHaveBeenCalledWith("Messaging request failed.", {
      errorClass: "PrismaClientKnownRequestError",
      message: 'Raw query failed. Code: `22P02`. Message: `invalid input syntax for type uuid: "[redacted]"`',
      prismaCode: "P2010",
      route,
      sqlState: "22P02",
    });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("Private message body");
    expect(logged).not.toContain("buyer@example.test");
    expect(logged).not.toContain("019f62c5-1c07-4a62-9f9a-8302778aa014");
  });

  it("keeps only the first line of a Prisma validation error, never its argument dump", () => {
    const error = Object.assign(new Error([
      "",
      "Invalid `tx.message.create()` invocation in",
      "/var/task/apps/web/.next/server/chunks/123.js:1:2",
      "",
      "  data: { body: \"Please call me at 555-0100 about the house\" }",
    ].join("\n")), { name: "PrismaClientValidationError" });

    expect(describeMessagingFailure(error)).toEqual({
      errorClass: "PrismaClientValidationError",
      message: "Invalid `tx.message.create()` invocation in",
    });
  });

  it("reports a node-postgres SQLSTATE and unknown thrown values without guessing", () => {
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint "Message_conversationId_clientMessageId_key"'), {
      name: "error",
      code: "23505",
    });
    expect(describeMessagingFailure(pgError)).toEqual({
      errorClass: "error",
      message: 'duplicate key value violates unique constraint "Message_conversationId_clientMessageId_key"',
      sqlState: "23505",
    });
    expect(describeMessagingFailure("Private message body")).toEqual({ errorClass: "UnknownError", message: "" });
    expect(describeMessagingFailure(Object.assign(new Error("boom"), { name: "Bad name with spaces" })))
      .toEqual({ errorClass: "Error", message: "boom" });
  });

  it("does not treat a Prisma error code as a SQLSTATE", () => {
    const error = Object.assign(new Error("Transaction already closed."), {
      name: "PrismaClientKnownRequestError",
      code: "P2028",
    });
    expect(describeMessagingFailure(error)).toEqual({
      errorClass: "PrismaClientKnownRequestError",
      message: "Transaction already closed.",
      prismaCode: "P2028",
    });
  });

  it("logs unexpected failures without a route as unknown", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = messagingErrorResponse(new Error("Message insert returned no row."));
    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledWith("Messaging request failed.", {
      errorClass: "Error",
      message: "Message insert returned no row.",
      route: "unknown",
    });
  });
});

describe("error message sanitizing", () => {
  it.each([
    ['invalid input value for enum "MessageKind": "LOVE_LETTER"', 'invalid input value for enum "MessageKind": "[redacted]"'],
    ['value "12345678901" is out of range for type integer', 'value "[redacted]" is out of range for type integer'],
    ['null value in column "body" of relation "Message" violates not-null constraint', 'null value in column "body" of relation "Message" violates not-null constraint'],
    ["Cannot read properties of undefined (reading 'sender_user_id')", "Cannot read properties of undefined (reading 'sender_user_id')"],
    ['syntax error at or near "hello there"', 'syntax error at or near "[redacted]"'],
    ["No row for jane.doe@example.com in 019f62c5-1c07-4a62-9f9a-8302778aa011", "No row for [email] in [uuid]"],
    ["Card 4111111111111111 rejected", "Card [number] rejected"],
  ])("sanitizes %s", (input, expected) => {
    expect(sanitizeErrorMessage(input)).toBe(expected);
  });

  it("bounds the logged message length", () => {
    const sanitized = sanitizeErrorMessage("x".repeat(500));
    expect(sanitized).toHaveLength(200);
    expect(sanitized.endsWith("…")).toBe(true);
  });
});
