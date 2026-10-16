/** The only value that turns on production testing mode; anything else leaves it off. */
export const PRODUCTION_TESTING_MODE_VALUE = "enabled-until-launch";

/**
 * Product-owner decision 2026-10-16: while only the team is testing, the production
 * deployment may run with the demo capabilities (automatic ADMIN, seller self-approval,
 * open messaging/LOI cohorts, unscanned document review, test property approvals).
 * It requires this explicit switch plus the CEO preview target, and production
 * readiness fails while it is on.
 */
export function productionTestingModeEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return env.VERCEL_ENV === "production"
    && env.LIBER_PRODUCTION_TESTING_MODE === PRODUCTION_TESTING_MODE_VALUE
    && env.LIBER_CEO_PREVIEW_TARGET === "ceo-preview";
}

/** Demo-only capabilities stay off on production unless production testing mode is on. */
export function isControlledPreviewEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (env.VERCEL_ENV === "production") return productionTestingModeEnabled(env);
  return env.NODE_ENV === "development"
    || env.NODE_ENV === "test"
    || (env.VERCEL_ENV === "preview" && env.LIBER_CEO_PREVIEW_TARGET === "ceo-preview");
}
