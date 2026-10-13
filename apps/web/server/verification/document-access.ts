import { isControlledPreviewEnvironment } from "../preview-environment";
import { UploadError } from "../uploads/errors";

export function confidentialDocumentAccessEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return isControlledPreviewEnvironment(env)
    && (env.NODE_ENV === "development" || env.NODE_ENV === "test"
      || (env.LIBER_CEO_PREVIEW_TARGET === "ceo-preview"
        && env.LIBER_CEO_PREVIEW_SELLER_SELF_APPROVAL === "true"));
}

export function requireConfidentialDocumentAccess() {
  // Remove this launch gate only when exact-object private malware scanning exists.
  if (!confidentialDocumentAccessEnabled()) {
    throw new UploadError("Document verification is temporarily unavailable.", 503);
  }
}
