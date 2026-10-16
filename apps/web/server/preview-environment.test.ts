import { describe, expect, it } from "vitest";
import { isControlledPreviewEnvironment, productionTestingModeEnabled } from "./preview-environment";

const production = { NODE_ENV: "production", VERCEL_ENV: "production" };
const testingMode = { ...production, LIBER_PRODUCTION_TESTING_MODE: "enabled-until-launch", LIBER_CEO_PREVIEW_TARGET: "ceo-preview" };

describe("preview environment gate", () => {
  it("keeps production closed, even with stale preview flags", () => {
    expect(isControlledPreviewEnvironment(production)).toBe(false);
    expect(isControlledPreviewEnvironment({ ...production, LIBER_CEO_PREVIEW_TARGET: "ceo-preview" })).toBe(false);
  });

  it("opens production only with the exact testing-mode value and the preview target", () => {
    expect(isControlledPreviewEnvironment(testingMode)).toBe(true);
    expect(productionTestingModeEnabled(testingMode)).toBe(true);
    for (const value of ["true", "enabled", "ENABLED-UNTIL-LAUNCH", " enabled-until-launch", ""]) {
      expect(isControlledPreviewEnvironment({ ...testingMode, LIBER_PRODUCTION_TESTING_MODE: value })).toBe(false);
    }
    expect(isControlledPreviewEnvironment({ ...testingMode, LIBER_CEO_PREVIEW_TARGET: "" })).toBe(false);
  });

  it("does not let the testing-mode switch open other deployments", () => {
    const flag = { LIBER_PRODUCTION_TESTING_MODE: "enabled-until-launch" };
    expect(productionTestingModeEnabled({ ...flag, NODE_ENV: "production", VERCEL_ENV: "preview", LIBER_CEO_PREVIEW_TARGET: "ceo-preview" })).toBe(false);
    expect(isControlledPreviewEnvironment({ ...flag, NODE_ENV: "production" })).toBe(false);
  });

  it("keeps the existing development and Vercel preview rules", () => {
    expect(isControlledPreviewEnvironment({ NODE_ENV: "development" })).toBe(true);
    expect(isControlledPreviewEnvironment({ NODE_ENV: "production", VERCEL_ENV: "preview", LIBER_CEO_PREVIEW_TARGET: "ceo-preview" })).toBe(true);
    expect(isControlledPreviewEnvironment({ NODE_ENV: "production", VERCEL_ENV: "preview" })).toBe(false);
  });
});
