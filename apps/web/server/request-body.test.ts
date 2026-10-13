import { describe, expect, it, vi } from "vitest";
import { readBoundedFormData, readBoundedJson } from "./request-body";

function jsonRequest(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request("https://liber.test/api/test", {
    body, method: "POST", headers: { "content-type": "application/json", ...headers },
    duplex: "half",
  } as RequestInit);
}

describe("bounded request parsing", () => {
  it("allows JSON exactly at the byte limit", async () => {
    await expect(readBoundedJson(jsonRequest('{"x":1}'), 7)).resolves.toEqual({ x: 1 });
  });

  it.each<Record<string, string>>([{}, { "content-length": "1" }])("checks streamed bytes when Content-Length is absent or forged: %j", async (headers) => {
    const cancel = vi.fn();
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"x":"'));
        controller.enqueue(encoder.encode("x".repeat(100)));
      },
      cancel,
    });
    await expect(readBoundedJson(jsonRequest(body, headers), 16)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects a declared oversized body before consuming it", async () => {
    const request = jsonRequest("{}", { "content-length": "1000" });
    await expect(readBoundedJson(request, 16)).rejects.toMatchObject({ status: 413 });
    expect(request.bodyUsed).toBe(false);
  });

  it("counts UTF-8 bytes rather than characters", async () => {
    await expect(readBoundedJson(jsonRequest('"éé"'), 5)).rejects.toMatchObject({ status: 413 });
  });

  it("rejects malformed UTF-8 and malformed JSON with a safe error", async () => {
    await expect(readBoundedJson(jsonRequest(new Uint8Array([0xc3, 0x28])), 16)).rejects.toMatchObject({ status: 400 });
    await expect(readBoundedJson(jsonRequest("private malformed value"), 100)).rejects.toMatchObject({
      message: "Invalid request body.", status: 400,
    });
  });

  it.each(["text/plain", "text/example+json", ""]) ("rejects unsupported JSON media type %j", async (type) => {
    await expect(readBoundedJson(jsonRequest("{}", { "content-type": type }), 16)).rejects.toMatchObject({ status: 415 });
  });

  it("accepts a JSON application subtype", async () => {
    await expect(readBoundedJson(jsonRequest("{}", { "content-type": "application/problem+json; charset=utf-8" }), 16)).resolves.toEqual({});
  });

  it("parses bounded native HTML login forms", async () => {
    const request = new Request("https://liber.test/login", {
      body: new URLSearchParams({ email: "buyer@example.test", password: "private test password" }), method: "POST",
    });
    const form = await readBoundedFormData(request, 1024);
    expect(form.get("email")).toBe("buyer@example.test");
    expect(form.get("password")).toBe("private test password");
  });

  it("accepts multipart text fields but rejects uploaded login files", async () => {
    const form = new FormData();
    form.set("email", "buyer@example.test");
    const request = () => new Request("https://liber.test/login", { body: form, method: "POST" });
    expect((await readBoundedFormData(request(), 2048)).get("email")).toBe("buyer@example.test");
    form.set("password", new Blob(["private"]), "secret.txt");
    await expect(readBoundedFormData(request(), 2048)).rejects.toMatchObject({ status: 400 });
  });
});
