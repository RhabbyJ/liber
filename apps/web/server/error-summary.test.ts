import { PrismaClientKnownRequestError, PrismaClientValidationError } from "@prisma/client/runtime/client";
import { describe, expect, it } from "vitest";
import { redactErrorMessage, routeLabel, summarizeError } from "./error-summary";

describe("log-safe error summaries", () => {
  it("reports the Prisma code and the PostgreSQL SQLSTATE of a failed raw query", () => {
    const error = new PrismaClientKnownRequestError(
      'Raw query failed. Code: `22P02`. Message: `invalid input syntax for type uuid: "buyer@example.test"`',
      {
        clientVersion: "7.8.0",
        code: "P2010",
        meta: {
          driverAdapterError: {
            cause: {
              kind: "InvalidInputValue",
              originalCode: "22P02",
              originalMessage: 'invalid input syntax for type uuid: "buyer@example.test"',
            },
          },
        },
      },
    );

    expect(summarizeError(error)).toEqual({
      code: "P2010",
      dbCode: "22P02",
      errorClass: "PrismaClientKnownRequestError",
      message: 'Raw query failed. Code: `22P02`. Message: `invalid input syntax for type uuid: "[value]"`',
    });
  });

  it("reads the SQLSTATE of a node-postgres error and a raised PL/pgSQL exception", () => {
    const unique = Object.assign(new Error('duplicate key value violates unique constraint "User_email_normalized_key"'), {
      code: "23505",
      detail: "Key (lower(btrim(email)))=(buyer@example.test) already exists.",
      severity: "ERROR",
    });
    const raised = Object.assign(new Error("LIBER_IDENTITY_RECOVERY_REQUIRED"), { code: "P0001", severity: "ERROR" });

    expect(summarizeError(unique)).toEqual({
      dbCode: "23505",
      errorClass: "Error",
      message: 'duplicate key value violates unique constraint "User_email_normalized_key"',
    });
    expect(summarizeError(raised)).toMatchObject({ dbCode: "P0001" });
    expect(JSON.stringify(summarizeError(unique))).not.toContain("buyer@example.test");
  });

  it("never echoes validation arguments and keeps system codes separate from SQLSTATEs", () => {
    const validation = new PrismaClientValidationError(
      "Invalid `prisma.user.update()` invocation:\n\n{ where: { email: \"buyer@example.test\" }, data: { name: \"Private Name\" } }",
      { clientVersion: "7.8.0" },
    );
    const socket = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET", errno: -104, syscall: "read" });
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");

    expect(summarizeError(validation)).toEqual({
      errorClass: "PrismaClientValidationError",
      message: "Prisma rejected the query arguments.",
    });
    expect(summarizeError(socket)).toEqual({ code: "ECONNRESET", errorClass: "Error", message: "read ECONNRESET" });
    expect(summarizeError(timeout)).toMatchObject({ errorClass: "DOMException/TimeoutError" });
    expect(summarizeError("plain string")).toEqual({ errorClass: "string", message: "A non-Error value was thrown." });
  });

  it("redacts addresses, credentials, signed URLs, private paths, and long numbers", () => {
    const message = [
      "Resend rejected buyer.one+tag@example.co.uk;",
      "Authorization: Bearer re_live_secret_value",
      "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl",
      "key sb_secret_abcdefghijkl",
      "url https://project.supabase.co/storage/v1/object/sign/verification-documents/user/file.pdf?token=abc",
      "dsn postgres://user:secret@db.example.test:5432/postgres?sslmode=require",
      "signed upload token=opaque-upload-token&expires=60",
      "path verification-documents/019f62c5-1c07-4a62-9f9a-8302778aa011/evidence.pdf",
      "object private/identity.pdf named Passport Scan.jpeg",
      "phone 3105550123",
    ].join("\n");

    const redacted = redactErrorMessage(message);

    for (const secret of [
      "buyer.one", "example.co.uk", "re_live_secret_value", "eyJhbGci", "sb_secret_abcdefghijkl",
      "token=abc", "postgres", "user:secret", "opaque-upload-token", "verification-documents/",
      "evidence.pdf", "identity.pdf", "Scan.jpeg", "3105550123",
    ]) {
      expect(redacted).not.toContain(secret);
    }
    expect(redacted).not.toContain("\n");
    expect(redacted).toContain("[email]");
    expect(redacted).toContain("[url]");
    expect(redacted).toContain("Bearer [redacted]");
    expect(redactErrorMessage("Raw query failed. Code: `N/A`. Message: `and/or`"))
      .toBe("Raw query failed. Code: `N/A`. Message: `and/or`");
  });

  it("truncates long messages", () => {
    expect(redactErrorMessage("x ".repeat(400))).toHaveLength(300);
  });

  it("labels routes without identifiers or query strings", () => {
    expect(routeLabel({ url: "https://liber.example/api/property-images/cmfz1q2w30000abcd1234efgh?size=large" }))
      .toBe("/api/property-images/:id");
    expect(routeLabel({ url: "https://liber.example/api/loi/negotiations/019F62C5-1C07-4A62-9F9A-8302778AA011/pdf" }))
      .toBe("/api/loi/negotiations/:id/pdf");
    expect(routeLabel("/api/uploads/sessions")).toBe("/api/uploads/sessions");
    expect(routeLabel({ url: "not a url" })).toBe("unspecified");
    expect(routeLabel()).toBe("unspecified");
  });
});
