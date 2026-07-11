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
import { clientIpFromRequest } from "../../../server/rate-limit";
import { createSupabaseServerClient } from "../../../server/supabase";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeInternalPath(url.searchParams.get("next"), "");
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return authRedirect(request, "/login?status=auth-error");
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return authErrorRedirect(request);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return authErrorRedirect(request);
  } else {
    return authErrorRedirect(request);
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return authErrorRedirect(request);

  let user: Awaited<ReturnType<typeof establishVerifiedAuthSession>>;
  try {
    user = await establishVerifiedAuthSession({ authUser: data.user, roles: [] });
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

  return authRedirect(request, pathForSignedInAuthIntent({ id: data.user.id, roles: user.roles }, { next }));
}

function authErrorRedirect(request: NextRequest) {
  return authRedirect(request, "/login?status=auth-error");
}

function authRedirect(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
