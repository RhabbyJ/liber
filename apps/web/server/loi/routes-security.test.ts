import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const mutations = [
  "app/api/loi/negotiations/route.ts",
  "app/api/loi/negotiations/[negotiationId]/draft/route.ts",
  "app/api/loi/negotiations/[negotiationId]/submit/route.ts",
  "app/api/loi/negotiations/[negotiationId]/agree/route.ts",
  "app/api/loi/negotiations/[negotiationId]/decline/route.ts",
  "app/api/loi/negotiations/[negotiationId]/withdraw/route.ts",
];

describe("LOI route security", () => {
  it.each(mutations)("guards %s with origin validation and private responses", async (file) => {
    const source = await readFile(path.resolve(file), "utf8");
    expect(source).toContain("isRequestSameOrigin(request)");
    expect(source).toContain("privateLoiJson");
    expect(source).not.toContain("console.log");
  });

  it("bounds JSON, keeps errors generic, and never logs term payloads", async () => {
    const source = await readFile(path.resolve("server/loi/http.ts"), "utf8");
    expect(source).toContain('"Cache-Control": "private, no-store"');
    expect(source).toContain("48 * 1024");
    expect(source).not.toContain("JSON.stringify(error)");
    expect(source.slice(source.indexOf("export function loiErrorResponse"))).not.toContain("request.body");
  });

  it("uses canonical pair, invite, conversation, negotiation lock order", async () => {
    const source = await readFile(path.resolve("server/loi/service.ts"), "utf8");
    const start = source.indexOf("async function lockContext");
    const end = source.indexOf("async function accessByInvite", start);
    const lock = source.slice(start, end);
    const positions = ["messaging-pair:", 'public.\"Invite\"', 'public.\"Conversation\"', 'public.\"LoiNegotiation\"'].map((value) => lock.indexOf(value));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(lock).toContain("IS NULL AS locked");
  });

  it("returns only the viewer's private draft", async () => {
    const source = await readFile(path.resolve("server/loi/service.ts"), "utf8");
    expect(source).toContain("negotiationId_ownerUserId");
    expect(source).toContain("ownerUserId: user.id");
    expect(source).not.toContain("counterpartyDraft");
  });
});
