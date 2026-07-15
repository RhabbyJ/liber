import { afterEach, describe, expect, it, vi } from "vitest";
import { MessagingError } from "./errors";
import { messagingErrorResponse } from "./http";

afterEach(() => vi.restoreAllMocks());

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

  it("logs unexpected failures by class name only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = messagingErrorResponse(new Error("Secret report details"));
    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledWith("Messaging request failed.", { name: "Error" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("Secret report details");
  });
});
