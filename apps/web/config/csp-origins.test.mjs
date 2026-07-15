import { describe, expect, it } from "vitest";
import { supabaseOrigins } from "./csp-origins.mjs";

describe("Supabase CSP origins", () => {
  it("derives exact HTTP and Realtime origins", () => {
    expect(supabaseOrigins("https://project-ref.supabase.co/path?ignored=true")).toEqual({
      supabaseHttpOrigin: "https://project-ref.supabase.co",
      supabaseRealtimeOrigin: "wss://project-ref.supabase.co",
    });
    expect(supabaseOrigins("http://127.0.0.1:54321")).toEqual({
      supabaseHttpOrigin: "http://127.0.0.1:54321",
      supabaseRealtimeOrigin: "ws://127.0.0.1:54321",
    });
  });

  it.each([
    undefined,
    "",
    "not a URL",
    "ftp://project-ref.supabase.co",
    "https://user@project-ref.supabase.co",
    "https://user:password@project-ref.supabase.co",
  ])("fails closed for an unsafe or absent URL", (value) => {
    expect(supabaseOrigins(value)).toEqual({
      supabaseHttpOrigin: "",
      supabaseRealtimeOrigin: "",
    });
  });

  it("never produces a wildcard source", () => {
    expect(Object.values(supabaseOrigins("https://project-ref.supabase.co")).join(" "))
      .not.toContain("*");
  });
});
