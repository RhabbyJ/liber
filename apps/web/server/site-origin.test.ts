import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredSiteOrigin } from "./site-origin";

afterEach(() => vi.unstubAllEnvs());

describe("canonical site origin", () => {
  it("requires the server-only HTTPS origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://public-fallback.example");
    expect(configuredSiteOrigin()).toBeNull();

    vi.stubEnv("SITE_URL", "https://liber.example");
    expect(configuredSiteOrigin()).toBe("https://liber.example");
  });

  it.each([
    "http://liber.example",
    "https://user:password@liber.example",
    "https://liber.example/app",
    "https://liber.example?source=email",
  ])("rejects a non-canonical production value %s", (value) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", value);
    expect(configuredSiteOrigin()).toBeNull();
  });

  it("keeps the localhost fallback for development and tests", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(configuredSiteOrigin()).toBe("http://localhost:3000");
  });
});
