import { afterEach, describe, expect, it, vi } from "vitest";
import { detectRemoteMime } from "./signature";

afterEach(() => vi.unstubAllGlobals());

describe("bounded private upload inspection", () => {
  it("reads a split signature and cancels a server that ignores Range", async () => {
    const cancelled = vi.fn();
    const read = vi.fn()
      .mockResolvedValueOnce({ value: new TextEncoder().encode("%PD"), done: false })
      .mockResolvedValueOnce({ value: new TextEncoder().encode("F-1.7\n" + "x".repeat(1000)), done: false });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read, cancel: cancelled.mockResolvedValue(undefined) }) },
      arrayBuffer: vi.fn(() => { throw new Error("Must never buffer the complete file"); }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(detectRemoteMime("https://storage.example.test/private-token")).resolves.toBe("application/pdf");
    expect(read).toHaveBeenCalledTimes(2);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      cache: "no-store", redirect: "error", headers: { Range: "bytes=0-15" },
    });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["partial PDF marker", new TextEncoder().encode("%PDF"), null],
    ["partial PNG marker", new Uint8Array([0x89, 0x50, 0x4e, 0x47]), null],
    ["PNG signature", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"],
    ["HTML body", new TextEncoder().encode("<html>unsafe</html>"), null],
  ])("recognizes %s without treating it as a malware scan", async (_name, bytes, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(bytes)));
    await expect(detectRemoteMime("https://storage.example.test/object")).resolves.toBe(expected);
  });

  it("cancels the stream when reading fails", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read: vi.fn().mockRejectedValue(new Error("timeout")), cancel }) },
    }));
    await expect(detectRemoteMime("https://storage.example.test/object")).rejects.toThrow("timeout");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
