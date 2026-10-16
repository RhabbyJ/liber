import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadErrorResponse } from "./http";

afterEach(() => vi.restoreAllMocks());

describe("private file error logging", () => {
  it("logs the route, class, codes, and a message without paths, tokens, or credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(
      new Error(
        "Storage request to https://project.supabase.co/storage/v1/object/sign/verification-documents/user/passport.pdf?token=signed-secret failed for private/identity.pdf",
      ),
      { code: "ECONNRESET", errno: -104, syscall: "read" },
    );
    const request = new Request(
      "https://liber.example/api/uploads/sessions/019f62c5-1c07-4a62-9f9a-8302778aa011/finalize",
      { method: "POST" },
    );

    const response = uploadErrorResponse(error, request);

    expect(response.status).toBe(503);
    expect(log).toHaveBeenCalledExactlyOnceWith("Private file request failed.", {
      code: "ECONNRESET",
      errorClass: "Error",
      message: "Storage request to [url] failed for [path]",
      route: "/api/uploads/sessions/:id/finalize",
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/signed-secret|passport|identity\.pdf|019f62c5/);
  });

  it("reports PostgreSQL codes from a failed database write", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(
      new Error('duplicate key value violates unique constraint "UploadSession_storagePath_key"'),
      { code: "23505", severity: "ERROR" },
    );

    uploadErrorResponse(error, "/api/property-images/[imageId]");

    expect(log).toHaveBeenCalledWith("Private file request failed.", {
      dbCode: "23505",
      errorClass: "Error",
      message: 'duplicate key value violates unique constraint "UploadSession_storagePath_key"',
      route: "/api/property-images/[imageId]",
    });
  });
});
