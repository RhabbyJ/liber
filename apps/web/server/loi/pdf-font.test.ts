import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const publicDir = path.resolve("public");

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

describe("LOI PDF font", () => {
  it("ships with its license in a server-only directory", () => {
    expect(statSync(path.resolve("server/loi/fonts/DejaVuSans.ttf")).size).toBeGreaterThan(100_000);
    expect(existsSync(path.resolve("server/loi/fonts/DejaVuSans-LICENSE.txt"))).toBe(true);
  });

  it("is no longer served as a public static file", () => {
    expect(filesUnder(publicDir).filter((file) => /\.(ttf|otf)$/i.test(file))).toEqual([]);
  });

  it("is read from the server path the build traces", () => {
    const loader = readFileSync(path.resolve("server/loi/pdf.ts"), "utf8");
    expect(loader).toContain('path.join(process.cwd(), "server/loi/fonts/DejaVuSans.ttf")');
    expect(loader).not.toContain("public/fonts");
  });
});
