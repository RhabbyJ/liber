import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";
import sitemap from "./sitemap";

afterEach(() => vi.unstubAllEnvs());

describe("robots.txt", () => {
  it("keeps private workspaces, Auth routes, and APIs out of crawlers", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "https://liber.example");

    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rules.userAgent).toBe("*");
    expect(rules.allow).toEqual(["/", "/login", "/signup"]);
    expect(rules.disallow).toEqual(expect.arrayContaining([
      "/admin",
      "/buyer",
      "/seller",
      "/buyers",
      "/messages",
      "/negotiations",
      "/profile",
      "/notifications",
      "/preview-tools",
      "/api",
      "/auth",
    ]));
    expect(result.sitemap).toBe("https://liber.example/sitemap.xml");
  });

  it("blocks every crawler while production testing mode grants every account ADMIN", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SITE_URL", "https://liber.example");
    vi.stubEnv("LIBER_CEO_PREVIEW_TARGET", "ceo-preview");
    vi.stubEnv("LIBER_PRODUCTION_TESTING_MODE", "enabled-until-launch");

    expect(robots()).toEqual({ rules: { disallow: "/", userAgent: "*" } });
  });

  it("omits the sitemap line when production has no canonical origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://public-fallback.example");

    expect(robots().sitemap).toBeUndefined();
  });
});

describe("sitemap.xml", () => {
  it("lists only the public pages on the configured origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "https://liber.example");

    expect(sitemap().map((entry) => entry.url)).toEqual([
      "https://liber.example/",
      "https://liber.example/login",
      "https://liber.example/signup",
    ]);
  });

  it("is empty rather than pointing at a guessed origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://public-fallback.example");

    expect(sitemap()).toEqual([]);
  });
});
