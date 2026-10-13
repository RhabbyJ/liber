import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { RequestBodyError } from "../request-body";
import { UploadError } from "./errors";
import { uploadErrorResponse } from "./http";

afterEach(() => vi.restoreAllMocks());

describe("private file response errors", () => {
  it("does not echo or log provider credentials, paths, or database parameters", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("postgres://user:secret@example.test/path?token=secret-token private/identity.pdf");
    const response = uploadErrorResponse(error);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toMatch(/secret|postgres|identity\.pdf/);
    expect(log.mock.calls.flat().join(" ")).not.toMatch(/secret|postgres|identity\.pdf/);
  });

  it("uses safe known errors and Retry-After", async () => {
    const response = uploadErrorResponse(new UploadError("Upload limit reached. Try again later.", 429, 32));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("32");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not echo user values in schema errors", async () => {
    const invalid = z.enum(["image/png"]).safeParse("secret document name");
    if (invalid.success) throw new Error("Expected invalid input");
    const response = uploadErrorResponse(invalid.error);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("secret document name");
  });

  it("preserves bounded request rejection status", () => {
    expect(uploadErrorResponse(new RequestBodyError("Request is too large.", 413)).status).toBe(413);
  });
});
