import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizePublicIdentityLabel, normalizeSignupName, publicIdentityInitials, publicNamePreview } from "./public-identity";

describe("limited name identity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it.each([ [" Julie  PrivateSurname ", "Julie P.", "JP"], ["José María García", "José G.", "JG"], ["李 明", "李 明.", "李明"], ["Anne-Marie O’Connor", "Anne-Marie O.", "AO"] ])("limits %s to first name and last initial", (name, label, initials) => {
    expect(publicNamePreview(name)).toBe(label);
    expect(publicIdentityInitials(`${label} #ABCDEF123456`)).toBe(initials);
  });
  it.each(["", "Julie", "Julie <script>", "Julie 123", "A".repeat(161) + " Smith"])("rejects invalid signup names %s", (name) => {
    expect(normalizeSignupName(name)).toBeNull();
  });

  it.each([
    ["Julie P", "Julie P."],
    ["Julie\t Smith", "Julie S."],
    ["John Smith Jr.", "John S."],
    ["Henry Ford III", "Henry F."],
    ["Mary Jr", "Mary J."],
    ["José Núñez", "José N."],
  ])("derives the surname initial for %j", (name, label) => {
    expect(publicNamePreview(name)).toBe(label);
    expect(normalizePublicIdentityLabel(`${label} #ABCDEF123456`)).toBe(`${label} #ABCDEF123456`);
  });

  it.each([
    ["leading combining mark", "́Julie Smith"],
    ["surname starting with a mark", "Julie ́Smith"],
    ["stacked marks", `Julie S${"̶".repeat(5)}mith`],
    ["invisible separator", "Julie​Smith Doe"],
    ["two-word name over the limit", `${"A".repeat(80)} ${"B".repeat(80)}`],
  ])("rejects %s at the name boundary", (_label, name) => {
    expect(normalizeSignupName(name)).toBeNull();
    expect(publicNamePreview(name)).toBeNull();
  });

  it("accepts the 160-character boundary", () => {
    expect(normalizeSignupName(`${"A".repeat(80)} ${"B".repeat(79)}`)).not.toBeNull();
  });

  it("uppercases initials without the viewer locale so hydration matches", () => {
    vi.spyOn(String.prototype, "toLocaleUpperCase").mockReturnValue("İ");
    expect(publicIdentityInitials("irem i. #ABCDEF123456")).toBe("II");
  });

  it("keeps previews working in supported browsers without Intl.Segmenter", async () => {
    vi.stubGlobal("Intl", Object.create(Intl, { Segmenter: { value: undefined } }));
    vi.resetModules();
    const fallback = await import("./public-identity");
    expect(fallback.publicNamePreview("Julie Smith")).toBe("Julie S.");
    expect(fallback.publicIdentityInitials("Julie S. #ABCDEF123456")).toBe("JS");
  });
});
