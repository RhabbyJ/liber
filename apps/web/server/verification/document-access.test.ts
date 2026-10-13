import { afterEach, describe, expect, it, vi } from "vitest";
import { confidentialDocumentAccessEnabled, requireConfidentialDocumentAccess } from "./document-access";

afterEach(() => vi.unstubAllEnvs());

describe("unscanned confidential document launch gate", () => {
  it.each([{}, { NODE_ENV: "production" }, {
    NODE_ENV: "production", VERCEL_ENV: "production", LIBER_CEO_PREVIEW_TARGET: "ceo-preview", LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL: "true",
  }, {
    NODE_ENV: "test", VERCEL_ENV: "production", LIBER_CEO_PREVIEW_TARGET: "ceo-preview", LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL: "true",
  }, { NODE_ENV: "production", VERCEL_ENV: "preview" }])("denies unscanned documents on public/unknown targets: %j", (env) => {
    expect(confidentialDocumentAccessEnabled(env)).toBe(false);
  });

  it.each([{ NODE_ENV: "development" }, { NODE_ENV: "test" }, {
    NODE_ENV: "production", VERCEL_ENV: "preview", LIBER_CEO_PREVIEW_TARGET: "ceo-preview", LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL: "true",
  }])("permits synthetic review in explicit controlled environments: %j", (env) => {
    expect(confidentialDocumentAccessEnabled(env)).toBe(true);
  });

  it("returns a safe unavailable error for a runtime denied target", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => requireConfidentialDocumentAccess()).toThrow("temporarily unavailable");
  });
});
