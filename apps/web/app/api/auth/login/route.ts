import { prisma } from "@liber/db";
import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "../../../../lib/redirect";
import { normalizeIdentityEmail } from "../../../../server/auth-identity";
import { pathForSignedInAuthIntent } from "../../../../server/auth-intent";
import { checkRateLimit, clientIpFromRequest } from "../../../../server/rate-limit";
import { isRequestSameOrigin, requestUrl } from "../../../../server/request-origin";
import { createSupabaseServerClient } from "../../../../server/supabase";

export async function POST(request: NextRequest) {
  if (!isRequestSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  const limit = checkRateLimit(`login:ip:${clientIpFromRequest(request)}`, 10, 60_000);
  if (!limit.allowed) {
    const response = redirectTo(request, "/login?status=rate-limited");
    response.headers.set("Retry-After", String(limit.retryAfterSeconds));
    return response;
  }

  const formData = await request.formData();
  const next = safeInternalPath(formData.get("next"));
  const email = textValue(formData, "email");
  const password = textValue(formData, "password");

  if (!email || !password) {
    return redirectTo(request, `/login?status=missing-credentials&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return redirectTo(request, `/login?status=auth-error&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return redirectTo(request, `/signup/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
    }

    return redirectTo(request, `/login?status=invalid-login&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  const { data: authData, error: userError } = await supabase.auth.getUser();
  if (userError || !authData.user) {
    return redirectTo(request, `/login?status=invalid-login&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  const appUser = await prisma.user.findUnique({
    where: { id: authData.user.id },
    select: { email: true, roles: true, status: true },
  });

  if (
    !appUser ||
    appUser.status !== "ACTIVE" ||
    normalizeIdentityEmail(appUser.email) !== normalizeIdentityEmail(authData.user.email)
  ) {
    await supabase.auth.signOut();
    return redirectTo(request, "/login?status=account-unavailable");
  }

  return redirectTo(request, pathForSignedInAuthIntent({ id: authData.user.id, roles: appUser.roles }, { next }));
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
