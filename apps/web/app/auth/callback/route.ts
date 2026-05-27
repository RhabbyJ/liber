import { prisma } from "@liber/db";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "../../../lib/redirect";
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

  const user = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: { roles: true, status: true },
  });

  if (!user || user.status === "SUSPENDED") {
    return authRedirect(request, "/login?status=account-unavailable");
  }

  if (next) return authRedirect(request, next);
  if (user.roles.includes("BUYER")) return authRedirect(request, "/buyer/profile");
  if (user.roles.includes("SELLER")) return authRedirect(request, "/seller/properties");
  return authRedirect(request, "/onboarding/role");
}

function authErrorRedirect(request: NextRequest) {
  return authRedirect(request, "/login?status=auth-error");
}

function authRedirect(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
