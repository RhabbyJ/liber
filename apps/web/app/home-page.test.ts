import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// app/page.tsx is a JSX-preserved server component, so these checks read its source.
const homepage = readFileSync(path.resolve("app/page.tsx"), "utf8");

describe("demand map results", () => {
  it("announces the result count after filtering through a status live region", () => {
    expect(homepage).toMatch(/<p role="status">\s+<strong>\{resultCount\}/);
  });

  it("keeps the filter toolbar mounted while filters change so keyboard focus is not dropped", () => {
    expect(homepage).toContain("key={`${market.slug}:${selectedServiceArea?.slug ?? \"\"}`}");
    expect(homepage).not.toContain('key={demandSearchHref({ ...params, market: market.slug }, ["cursor", "view"])}');
  });
});
