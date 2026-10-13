/** Demo-only capabilities must never be enabled on a production deployment. */
export function isControlledPreviewEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (env.VERCEL_ENV === "production") return false;
  return env.NODE_ENV === "development"
    || env.NODE_ENV === "test"
    || (env.VERCEL_ENV === "preview" && env.LIBER_CEO_PREVIEW_TARGET === "ceo-preview");
}
