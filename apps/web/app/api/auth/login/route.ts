import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "../../../../lib/redirect";
import { ensureSellerAccessRequested } from "../../../../server/access";
import { resolveAuthIdentity } from "../../../../server/auth-identity";
import { enforceSharedAuthRateLimit } from "../../../../server/auth-rate-limit";
import { pathForSignedInAuthIntent } from "../../../../server/auth-intent";
import { clientIpFromRequest } from "../../../../server/rate-limit";
import { isRequestSameOrigin, requestUrl } from "../../../../server/request-origin";
import { createSupabaseServerClient } from "../../../../server/supabase";

export async function POST(request: NextRequest) {
  if (!isRequestSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  const formData = await request.formData();
  const next = safeInternalPath(formData.get("next"));
  const email = textValue(formData, "email");
  const password = textValue(formData, "password");

  if (!email || !password) {
    return redirectTo(request, `/login?status=missing-credentials&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  const limit = await enforceSharedAuthRateLimit({
    action: "login",
    email,
    ip: clientIpFromRequest(request),
  });
  if (!limit.allowed) {
    const response = redirectTo(request, "/login?status=rate-limited");
    response.headers.set("Retry-After", String(limit.retryAfterSeconds));
    return response;
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return redirectTo(request, `/login?status=auth-error&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return redirectTo(request, `/signup/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
    }

    return redirectTo(request, `/login?status=invalid-login&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  const { data: authData, error: userError } = await supabase.auth.getUser();
  if (userError || !authData.user) {
    return redirectTo(request, `/login?status=invalid-login&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  const resolution = await resolveAuthIdentity(authData.user);
  if (resolution.kind !== "linked" || resolution.user.status !== "ACTIVE") {
    await supabase.auth.signOut();
    if (resolution.kind === "collision") {
      const recoveryLimit = await enforceSharedAuthRateLimit({
        action: "recovery",
        email: authData.user.email,
        ip: clientIpFromRequest(request),
      });
      return redirectTo(
        request,
        recoveryLimit.allowed
          ? "/login?status=identity-recovery-required"
          : "/login?status=rate-limited",
      );
    }
    return redirectTo(request, "/login?status=account-unavailable");
  }

  if (resolution.user.roles.includes("SELLER")) {
    await ensureSellerAccessRequested(authData.user.id);
  }

  return redirectTo(
    request,
    pathForSignedInAuthIntent({ id: authData.user.id, roles: resolution.user.roles }, { next }),
  );
}

function redirectTo(request: NextRequest, path: string) {
  const response = NextResponse.redirect(requestUrl(request, path), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
