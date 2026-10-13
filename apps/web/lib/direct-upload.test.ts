import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ upload: vi.fn(), from: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ storage: { from: storage.from } }) }));
import { createUploadTask, submitUploadTask } from "./direct-upload";
const request = vi.fn();
const session = { bucket: "verification-documents", path: "private/upload/file.pdf", sessionId: "upl_test", token: "test-token" };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const task = () => createUploadTask(new File(["synthetic verification UI fixture"], "test.pdf", { type: "application/pdf" }), { purpose: "BUYER_VERIFICATION", documentType: "PRE_APPROVAL" });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", request);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  storage.from.mockReturnValue({ uploadToSignedUrl: storage.upload });
  storage.upload.mockResolvedValue({ error: null });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("direct upload submission", () => {
  it("selecting a file prepares a task without transmitting it", () => {
    expect(task()).toMatchObject({ stored: false, completed: false });
    expect(request).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("marks submitted only after authorized upload and successful finalization", async () => {
    request.mockResolvedValueOnce(response(session)).mockResolvedValueOnce(response({ status: "FINALIZED", documentId: "document" }));
    const pending = task();
    await submitUploadTask(pending, vi.fn());
    expect(pending.completed).toBe(true);
    expect(storage.upload).toHaveBeenCalledWith(session.path, session.token, pending.file, { contentType: "application/pdf" });
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ purpose: "BUYER_VERIFICATION", documentType: "PRE_APPROVAL", filename: "test.pdf" });
    expect(request.mock.calls[1][0]).toBe("/api/uploads/sessions/upl_test/finalize");
  });

  it("retries the same finalization after a lost response without uploading or creating duplicate evidence", async () => {
    request.mockResolvedValueOnce(response(session)).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const pending = task();
    await expect(submitUploadTask(pending, vi.fn())).rejects.toThrow("Failed to fetch");
    expect(pending).toMatchObject({ stored: true, completed: false });
    request.mockResolvedValueOnce(response({ status: "FINALIZED" }));
    await submitUploadTask(pending, vi.fn());
    await submitUploadTask(pending, vi.fn());
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[2][0]).toBe("/api/uploads/sessions/upl_test/finalize");
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it("keeps a rejected finalization unsubmitted and exposes the actionable server message", async () => {
    request.mockResolvedValueOnce(response(session)).mockResolvedValueOnce(response({ error: "Upload session expired. Choose the file again." }, 400));
    const pending = task();
    await expect(submitUploadTask(pending, vi.fn())).rejects.toThrow("Upload session expired");
    expect(pending.completed).toBe(false);
  });

  it("does not claim submission or finalize when Storage fails", async () => {
    request.mockResolvedValueOnce(response(session));
    storage.upload.mockResolvedValueOnce({ error: { message: "private provider diagnostic" } });
    const pending = task();
    await expect(submitUploadTask(pending, vi.fn())).rejects.toThrow("The file could not be uploaded");
    expect(pending.stored).toBe(false);
    expect(pending.completed).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not treat a malformed success response as a finalized submission", async () => {
    request.mockResolvedValueOnce(response(session)).mockResolvedValueOnce(response({}));
    const pending = task();
    await expect(submitUploadTask(pending, vi.fn())).rejects.toThrow("has not been submitted yet");
    expect(pending.completed).toBe(false);
  });
});
