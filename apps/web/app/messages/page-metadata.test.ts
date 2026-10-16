import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Pages are TSX with `jsx: preserve`, so Vitest cannot import them; check the source.
const pageSource = (relativePath: string) => readFile(new URL(relativePath, import.meta.url), "utf8");

describe("messages page titles", () => {
  it("names the inbox page for the root layout's title template", async () => {
    const source = await pageSource("./page.tsx");
    expect(source).toContain('import type { Metadata } from "next";');
    expect(source).toContain('export const metadata: Metadata = { title: "Messages" };');
  });

  it("gives every thread the same title so private details stay out of tabs and history", async () => {
    const source = await pageSource("./[conversationId]/page.tsx");
    expect(source).toContain('export const metadata: Metadata = { title: "Conversation" };');
    expect(source).not.toContain("generateMetadata");
  });
});
