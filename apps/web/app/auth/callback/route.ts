import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "../../../lib/redirect";
import { ensureSellerAccessRequested } from "../../../server/access";
import {
  AuthIdentityLinkError,
  establishVerifiedAuthSession,
} from "../../../server/auth-identity";
import { enforceSharedAuthRateLimit } from "../../../server/auth-rate-limit";
import { pathForSignedInAuthIntent } from "../../../server/auth-intent";
import { PASSWORD_RESET_PATH, passwordRecoveryCookie } from "../../../server/password-recovery";
import { clientIpFromRequest } from "../../../server/rate-limit";
import { createSupabaseServerClient } from "../../../server/supabase";

const EMAIL_OTP_TYPES: ReadonlySet<string> = new Set<EmailOtpType>([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = emailOtpType(url.searchParams.get("type"));
  const next = safeInternalPath(url.searchParams.get("next"), "");
  // Chooses only which page explains a failed link. Whether a session is a recovery
  // session comes from Supabase (the verified OTP type or the PKCE redirect type).
  const failurePath = type === "recovery" || next === PASSWORD_RESET_PATH
    ? "/forgot-password?status=link-expired"
    : "/login?status=auth-error";
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return authRedirect(request, "/login?status=auth-error");
  }

  let isRecovery = false;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return authRedirect(request, failurePath);
    isRecovery = pkceRedirectType(data) === "recovery";
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return authRedirect(request, failurePath);
    isRecovery = type === "recovery";
  } else {
    return authRedirect(request, failurePath);
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return authRedirect(request, failurePath);

  let user: Awaited<ReturnType<typeof establishVerifiedAuthSession>>;
  try {
    user = await establishVerifiedAuthSession(data.user);
  } catch (error) {
    if (!(error instanceof AuthIdentityLinkError)) throw error;
    await supabase.auth.signOut();
    if (error.code === "inactive") {
      return authRedirect(request, "/login?status=account-unavailable");
    }
    const limit = await enforceSharedAuthRateLimit({
      action: "recovery",
      email: data.user.email,
      ip: clientIpFromRequest(request),
    });
    return authRedirect(
      request,
      limit.allowed
        ? "/login?status=identity-recovery-required"
        : "/login?status=rate-limited",
    );
  }

  if (user?.roles.includes("SELLER")) {
    await ensureSellerAccessRequested(data.user.id);
  }

  if (isRecovery) {
    const response = authRedirect(request, PASSWORD_RESET_PATH);
    const marker = passwordRecoveryCookie(data.user.id);
    response.cookies.set(marker.name, marker.value, marker.options);
    return response;
  }

  return authRedirect(request, pathForSignedInAuthIntent({ id: data.user.id, roles: user.roles }, { next }));
}

function emailOtpType(value: string | null): EmailOtpType | null {
  return value && EMAIL_OTP_TYPES.has(value) ? value as EmailOtpType : null;
}

// supabase-js reports "recovery" when this browser's PKCE verifier came from
// resetPasswordForEmail; the public response type does not declare the field.
function pkceRedirectType(data: unknown) {
  if (!data || typeof data !== "object" || !("redirectType" in data)) return null;
  return typeof data.redirectType === "string" ? data.redirectType : null;
}

function authRedirect(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
